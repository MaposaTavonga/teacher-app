-- =====================================================================
-- 003: development setup (FAKE data only, for testing)
--
-- Step A: run this whole file once. It creates a test school, Grade 9
--         Mathematics, and an invite code: TEST-2026.
-- Step B: in the app, create your account and join with code TEST-2026.
-- Step C: run the "approve me" block at the bottom with your email filled in.
-- =====================================================================

insert into schools (id, name, province)
values ('11111111-1111-1111-1111-111111111111', 'Test Secondary School', 'Gauteng')
on conflict (id) do nothing;

insert into school_invites (school_id, code, role)
values ('11111111-1111-1111-1111-111111111111', 'TEST-2026', 'teacher')
on conflict (code) do nothing;

insert into subjects (id, name)
values ('22222222-2222-2222-2222-222222222222', 'Mathematics')
on conflict (name) do nothing;

insert into classes (id, school_id, subject_id, grade, name, year)
values ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        (select id from subjects where name = 'Mathematics'),
        9, 'Grade 9 Mathematics', 2026)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Step C: "approve me". Replace the email, then run only this block.
-- It approves you as a teacher, makes you a school admin too, and
-- assigns you to the Grade 9 Mathematics class.
-- ---------------------------------------------------------------------
-- do $$
-- declare v_user uuid := (select id from auth.users where email = 'YOUR-EMAIL@example.com');
-- begin
--   if v_user is null then raise exception 'No user with that email. Sign up in the app first.'; end if;
--   update school_members set status = 'approved', approved_at = now()
--     where user_id = v_user and school_id = '11111111-1111-1111-1111-111111111111';
--   insert into school_members (school_id, user_id, role, status, approved_at)
--     values ('11111111-1111-1111-1111-111111111111', v_user, 'admin', 'approved', now())
--     on conflict (school_id, user_id, role) do nothing;
--   insert into class_teachers (class_id, teacher_id)
--     values ('33333333-3333-3333-3333-333333333333', v_user)
--     on conflict do nothing;
-- end $$;
