-- =====================================================================
-- 002: sign-up and joining a school
-- Run in the Supabase SQL editor AFTER schema.sql.
-- =====================================================================

-- 1. Create a profile automatically when someone signs up.
--    The app sends full_name and phone as sign-up metadata.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'New user'),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 2. Join a school with an invite code. The membership starts as 'pending'
--    until a school admin approves it.
create or replace function join_school_with_code(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invite school_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You need to be logged in.';
  end if;

  select * into v_invite
  from school_invites
  where upper(code) = upper(trim(p_code))
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    raise exception 'That invite code is not valid or has expired.';
  end if;

  insert into school_members (school_id, user_id, role, status)
  values (v_invite.school_id, auth.uid(), v_invite.role, 'pending')
  on conflict (school_id, user_id, role) do nothing;

  return v_invite.school_id;
end;
$$;

revoke all on function join_school_with_code(text) from public;
grant execute on function join_school_with_code(text) to authenticated;

-- 3. School admins can see the names of people who belong to (or asked to
--    join) their school, so they know who they are approving.
create policy admin_sees_member_profiles on profiles for select to authenticated
  using (exists (select 1 from school_members m
                 where m.user_id = profiles.id and is_school_admin(m.school_id)));
