-- =====================================================================
-- Teacher App: database schema (teacher side, v1)
-- Target: Supabase (PostgreSQL 15+). Run in the Supabase SQL editor.
--
-- ACTORS
--   Teacher         logs in; takes registers, creates tasks, captures marks,
--                   views insights, runs remedies. Main user of v1.
--   School admin    logs in; approves teachers, manages class lists and the ATP.
--                   (Principal, deputy or admin clerk.)
--   HOD             logs in; read-only view of classes in their subject (later).
--   Learner         data subject only in v1 (no login yet).
--   Parent/guardian data subject only in v1; receives catch-up messages.
--   System          automations: notification outbox, topic scores, alerts.
--
-- PRIVACY (POPIA)
--   * Store the minimum: no ID numbers, race, home address or health data.
--   * Row-level security on every table: a teacher sees only learners in
--     classes they teach; admins see only their own school.
--   * Guardian consent is recorded before any message is sent.
--   * Sensitive actions are written to audit_log.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------------------------------------------------
create type member_role       as enum ('teacher', 'hod', 'admin');
create type member_status     as enum ('pending', 'approved', 'suspended');
create type attendance_status as enum ('present', 'absent', 'late');
create type task_type         as enum ('informal', 'test', 'assignment', 'exam', 'investigation', 'project');
create type task_status       as enum ('draft', 'open', 'captured', 'analysed');
create type gap_reason        as enum ('missed_lessons', 'struggled', 'both');
create type remedy_kind       as enum ('catch_up_pack', 'informal_task', 'study_partners', 're_teach', 'materials', 'individual_support');
create type remedy_status     as enum ('planned', 'running', 'completed', 'cancelled');
create type outcome_kind      as enum ('pending', 'improved', 'no_change', 'declined');
create type channel_kind      as enum ('whatsapp', 'sms', 'email', 'in_app');
create type outbox_status     as enum ('queued', 'sent', 'failed', 'cancelled');

-- ---------- Schools and people who log in ----------------------------
create table schools (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  emis_number   text unique,                       -- DBE school number, optional
  province      text,
  default_pass_percent numeric(5,2) not null default 50,
  created_at    timestamptz not null default now()
);

-- One row per logged-in user (teacher, HOD, admin). Linked to Supabase auth.
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  phone         text,
  created_at    timestamptz not null default now()
);

-- A user's role at a school. Teachers start as 'pending' until an admin approves.
create table school_members (
  school_id     uuid not null references schools(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  role          member_role not null default 'teacher',
  status        member_status not null default 'pending',
  approved_by   uuid references profiles(id),
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  primary key (school_id, user_id, role)
);

-- Invite codes let teachers join a school that already uses the app.
create table school_invites (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  code          text not null unique,
  role          member_role not null default 'teacher',
  expires_at    timestamptz,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

-- ---------- Curriculum: subjects, topics, ATP --------------------------
create table subjects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique                -- e.g. 'Mathematics'
);

-- CAPS topics per subject and grade. Shared across schools.
create table topics (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references subjects(id),
  grade         smallint not null check (grade between 0 and 12),  -- 0 = Grade R
  name          text not null,                      -- e.g. 'Theorem of Pythagoras'
  unique (subject_id, grade, name)
);

-- An Annual Teaching Plan for one subject, grade, year and term.
-- school_id null = shared template; set = a school's own edited copy.
create table atp_plans (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid references schools(id) on delete cascade,
  subject_id    uuid not null references subjects(id),
  grade         smallint not null check (grade between 0 and 12),
  year          smallint not null,
  term          smallint not null check (term between 1 and 4),
  term_start    date not null,                      -- Monday of week 1
  created_at    timestamptz not null default now()
);

create table atp_weeks (
  plan_id       uuid not null references atp_plans(id) on delete cascade,
  week_number   smallint not null check (week_number between 1 and 15),
  topic_id      uuid not null references topics(id),
  primary key (plan_id, week_number, topic_id)      -- a week can cover 2 topics
);

-- ---------- Classes and learners --------------------------------------
create table classes (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  subject_id    uuid not null references subjects(id),
  grade         smallint not null check (grade between 0 and 12),
  name          text not null,                      -- e.g. 'Grade 9B Mathematics'
  year          smallint not null,
  atp_plan_id   uuid references atp_plans(id),      -- current term's plan
  atp_week_offset smallint not null default 0,      -- -1 behind, +1 ahead
  pass_percent  numeric(5,2),                       -- null = school default
  created_at    timestamptz not null default now()
);

-- Who teaches which class (a class can have more than one teacher).
create table class_teachers (
  class_id      uuid not null references classes(id) on delete cascade,
  teacher_id    uuid not null references profiles(id) on delete cascade,
  primary key (class_id, teacher_id)
);

create table learners (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  learner_number text,                              -- school / SA-SAMS learner number
  first_name    text not null,
  last_name     text not null,
  preferred_name text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (school_id, learner_number)
);

create table class_enrolments (
  class_id      uuid not null references classes(id) on delete cascade,
  learner_id    uuid not null references learners(id) on delete cascade,
  joined_on     date not null default current_date,
  left_on       date,
  primary key (class_id, learner_id)
);

create table guardians (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  full_name     text not null,
  phone         text,
  email         text,
  preferred_language text default 'en',             -- e.g. 'en', 'zu', 'st', 'af'
  preferred_channel  channel_kind not null default 'whatsapp',
  created_at    timestamptz not null default now()
);

create table learner_guardians (
  learner_id    uuid not null references learners(id) on delete cascade,
  guardian_id   uuid not null references guardians(id) on delete cascade,
  relationship  text,                               -- 'mother', 'grandmother', ...
  consent_at    timestamptz,                        -- null = no messages may be sent
  primary key (learner_id, guardian_id)
);

-- ---------- Daily register --------------------------------------------
create table register_sessions (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references classes(id) on delete cascade,
  session_date  date not null,
  period        smallint,
  topic_id      uuid references topics(id),         -- filled from the ATP week (+ offset)
  taken_by      uuid not null references profiles(id),
  saved_at      timestamptz not null default now(),
  unique (class_id, session_date, period)
);

create table attendance_records (
  session_id    uuid not null references register_sessions(id) on delete cascade,
  learner_id    uuid not null references learners(id) on delete cascade,
  status        attendance_status not null default 'present',
  note          text,
  primary key (session_id, learner_id)
);

-- ---------- Tasks and marks -------------------------------------------
create table tasks (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references classes(id) on delete cascade,
  title         text not null,
  type          task_type not null default 'informal',
  is_formal     boolean generated always as (type <> 'informal') stored,
  task_date     date not null,
  total_marks   numeric(6,2) not null check (total_marks > 0),
  pass_percent  numeric(5,2),                       -- null = class/school default
  status        task_status not null default 'draft',
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now()
);

-- Questions are optional; when present they link marks to topics.
create table task_questions (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references tasks(id) on delete cascade,
  label         text not null,                      -- 'Q1', '2.3'
  position      smallint not null,
  max_marks     numeric(6,2) not null check (max_marks > 0),
  topic_id      uuid references topics(id),
  unique (task_id, label)
);

-- One row per learner per task: the final mark, or absent.
create table task_results (
  task_id       uuid not null references tasks(id) on delete cascade,
  learner_id    uuid not null references learners(id) on delete cascade,
  total_mark    numeric(6,2),                       -- null while not captured
  is_absent     boolean not null default false,     -- absent is never counted as 0
  captured_by   uuid references profiles(id),
  captured_at   timestamptz default now(),
  primary key (task_id, learner_id),
  check (not (is_absent and total_mark is not null))
);

create table question_marks (
  question_id   uuid not null references task_questions(id) on delete cascade,
  learner_id    uuid not null references learners(id) on delete cascade,
  mark          numeric(6,2) not null check (mark >= 0),
  primary key (question_id, learner_id)
);

-- Spreadsheet uploads, kept so a teacher can review and undo.
create table mark_imports (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references tasks(id) on delete cascade,
  file_name     text not null,
  storage_path  text,                               -- Supabase Storage path
  row_count     integer,
  issues        jsonb not null default '[]',        -- unmatched names, missing marks
  status        text not null default 'review',     -- review | applied | discarded
  uploaded_by   uuid not null references profiles(id),
  created_at    timestamptz not null default now()
);

-- ---------- Remedies ---------------------------------------------------
create table resources (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid references schools(id) on delete cascade,  -- null = shared library
  topic_id      uuid not null references topics(id),
  title         text not null,
  kind          text not null,                      -- notes | video | worksheet | link
  url           text,
  storage_path  text,
  added_by      uuid references profiles(id),
  created_at    timestamptz not null default now()
);

create table remedy_plans (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references classes(id) on delete cascade,
  topic_id      uuid not null references topics(id),
  status        remedy_status not null default 'planned',
  follow_up_task_id uuid references tasks(id),      -- the task that checks if it worked
  follow_up_date date,
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now()
);

create table remedy_actions (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references remedy_plans(id) on delete cascade,
  kind          remedy_kind not null,
  resource_id   uuid references resources(id),
  details       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- Which learners are in the plan, why, and whether it worked.
create table remedy_learners (
  plan_id       uuid not null references remedy_plans(id) on delete cascade,
  learner_id    uuid not null references learners(id) on delete cascade,
  reason        gap_reason not null,
  baseline_percent numeric(5,2),
  outcome_percent  numeric(5,2),
  outcome       outcome_kind not null default 'pending',
  primary key (plan_id, learner_id)
);

-- Mutual study partners: each helps the other with a different topic.
create table study_pairs (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references remedy_plans(id) on delete cascade,
  learner_a     uuid not null references learners(id) on delete cascade,
  learner_b     uuid not null references learners(id) on delete cascade,
  a_helps_with  uuid references topics(id),
  b_helps_with  uuid references topics(id),
  approved      boolean not null default false,
  check (learner_a <> learner_b)
);

-- ---------- Messages to parents (queued; sent by a server function) ---
create table notification_outbox (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  guardian_id   uuid not null references guardians(id) on delete cascade,
  learner_id    uuid references learners(id) on delete cascade,
  channel       channel_kind not null,
  template      text not null,                      -- 'absence_catch_up', 'progress_good_news'
  payload       jsonb not null default '{}',
  status        outbox_status not null default 'queued',
  error         text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

-- ---------- Audit trail (POPIA) ---------------------------------------
create table audit_log (
  id            bigint generated always as identity primary key,
  school_id     uuid references schools(id),
  user_id       uuid references profiles(id),
  action        text not null,                      -- 'marks.capture', 'report.share', ...
  table_name    text,
  record_id     text,
  at            timestamptz not null default now()
);

-- ---------- Indexes for the common screens ----------------------------
create index on class_enrolments (learner_id);
create index on class_teachers (teacher_id);
create index on register_sessions (class_id, session_date);
create index on attendance_records (learner_id) where status <> 'present';
create index on tasks (class_id, task_date);
create index on task_questions (topic_id);
create index on question_marks (learner_id);
create index on remedy_learners (learner_id);
create index on notification_outbox (status) where status = 'queued';

-- =====================================================================
-- VIEWS: what the Insights screens read
-- =====================================================================

-- Each learner's percentage per topic, from per-question marks.
create view learner_topic_scores with (security_invoker = true) as
select t.class_id,
       qm.learner_id,
       q.topic_id,
       round(100 * sum(qm.mark) / nullif(sum(q.max_marks), 0), 1) as percent,
       count(distinct t.id) as tasks_counted
from question_marks qm
join task_questions q on q.id = qm.question_id
join tasks t          on t.id = q.task_id
where q.topic_id is not null
group by t.class_id, qm.learner_id, q.topic_id;

-- Lessons on each topic a learner missed (absent from register sessions).
create view learner_topic_absences with (security_invoker = true) as
select rs.class_id,
       ar.learner_id,
       rs.topic_id,
       count(*) filter (where ar.status = 'absent')  as lessons_missed,
       count(*)                                      as lessons_held
from attendance_records ar
join register_sessions rs on rs.id = ar.session_id
where rs.topic_id is not null
group by rs.class_id, ar.learner_id, rs.topic_id;

-- The topic map: score + absences + the reason for a gap.
create view topic_map with (security_invoker = true) as
select s.class_id, s.learner_id, s.topic_id, s.percent,
       coalesce(a.lessons_missed, 0) as lessons_missed,
       coalesce(a.lessons_held, 0)   as lessons_held,
       case
         when s.percent >= coalesce(c.pass_percent, sc.default_pass_percent) then null
         when coalesce(a.lessons_missed, 0) >= 2 then 'missed_lessons'::gap_reason
         else 'struggled'::gap_reason
       end as gap
from learner_topic_scores s
join classes c  on c.id = s.class_id
join schools sc on sc.id = c.school_id
left join learner_topic_absences a
       on a.class_id = s.class_id and a.learner_id = s.learner_id and a.topic_id = s.topic_id;

-- =====================================================================
-- ROW-LEVEL SECURITY: who may see what
-- =====================================================================

create or replace function is_school_admin(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from school_members
                 where school_id = p_school and user_id = auth.uid()
                   and role = 'admin' and status = 'approved');
$$;

create or replace function is_school_member(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from school_members
                 where school_id = p_school and user_id = auth.uid()
                   and status = 'approved');
$$;

-- Approved teacher of this class (pending teachers see no learner data).
create or replace function teaches_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_teachers ct
                 join classes c on c.id = ct.class_id
                 join school_members m on m.school_id = c.school_id and m.user_id = ct.teacher_id
                 where ct.class_id = p_class and ct.teacher_id = auth.uid()
                   and m.status = 'approved');
$$;

create or replace function can_see_learner(p_learner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_enrolments e
                 where e.learner_id = p_learner and teaches_class(e.class_id))
      or exists (select 1 from learners l
                 where l.id = p_learner and is_school_admin(l.school_id));
$$;

alter table schools             enable row level security;
alter table profiles            enable row level security;
alter table school_members      enable row level security;
alter table school_invites      enable row level security;
alter table subjects            enable row level security;
alter table topics              enable row level security;
alter table atp_plans           enable row level security;
alter table atp_weeks           enable row level security;
alter table classes             enable row level security;
alter table class_teachers      enable row level security;
alter table learners            enable row level security;
alter table class_enrolments    enable row level security;
alter table guardians           enable row level security;
alter table learner_guardians   enable row level security;
alter table register_sessions   enable row level security;
alter table attendance_records  enable row level security;
alter table tasks               enable row level security;
alter table task_questions      enable row level security;
alter table task_results        enable row level security;
alter table question_marks      enable row level security;
alter table mark_imports        enable row level security;
alter table resources           enable row level security;
alter table remedy_plans        enable row level security;
alter table remedy_actions      enable row level security;
alter table remedy_learners     enable row level security;
alter table study_pairs         enable row level security;
alter table notification_outbox enable row level security;
alter table audit_log           enable row level security;

-- Reference data: any logged-in user may read.
create policy read_subjects on subjects for select to authenticated using (true);
create policy read_topics   on topics   for select to authenticated using (true);
create policy read_atp      on atp_plans for select to authenticated
  using (school_id is null or is_school_member(school_id));
create policy read_atp_weeks on atp_weeks for select to authenticated
  using (exists (select 1 from atp_plans p where p.id = plan_id
                 and (p.school_id is null or is_school_member(p.school_id))));
create policy admin_atp on atp_plans for all to authenticated
  using (is_school_admin(school_id)) with check (is_school_admin(school_id));

-- Profiles and membership.
create policy own_profile on profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy see_school on schools for select to authenticated
  using (is_school_member(id));
create policy see_own_membership on school_members for select to authenticated
  using (user_id = auth.uid() or is_school_admin(school_id));
create policy request_membership on school_members for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy admin_manages_members on school_members for update to authenticated
  using (is_school_admin(school_id)) with check (is_school_admin(school_id));
create policy admin_invites on school_invites for all to authenticated
  using (is_school_admin(school_id)) with check (is_school_admin(school_id));

-- Classes.
create policy see_classes on classes for select to authenticated
  using (teaches_class(id) or is_school_admin(school_id));
create policy admin_classes on classes for all to authenticated
  using (is_school_admin(school_id)) with check (is_school_admin(school_id));
create policy teacher_updates_class_pace on classes for update to authenticated
  using (teaches_class(id)) with check (teaches_class(id));
create policy see_class_teachers on class_teachers for select to authenticated
  using (teacher_id = auth.uid() or exists (select 1 from classes c where c.id = class_id and is_school_admin(c.school_id)));

-- Learners and guardians: only teachers of their classes, or school admins.
create policy see_learners on learners for select to authenticated
  using (can_see_learner(id));
create policy admin_learners on learners for all to authenticated
  using (is_school_admin(school_id)) with check (is_school_admin(school_id));
create policy see_enrolments on class_enrolments for select to authenticated
  using (teaches_class(class_id) or exists (select 1 from classes c where c.id = class_id and is_school_admin(c.school_id)));
create policy see_guardians on guardians for select to authenticated
  using (exists (select 1 from learner_guardians lg where lg.guardian_id = id and can_see_learner(lg.learner_id)));
create policy see_learner_guardians on learner_guardians for select to authenticated
  using (can_see_learner(learner_id));

-- Register, tasks, marks, remedies: the class's teachers have full access.
create policy teacher_registers on register_sessions for all to authenticated
  using (teaches_class(class_id)) with check (teaches_class(class_id));
create policy teacher_attendance on attendance_records for all to authenticated
  using (exists (select 1 from register_sessions s where s.id = session_id and teaches_class(s.class_id)))
  with check (exists (select 1 from register_sessions s where s.id = session_id and teaches_class(s.class_id)));
create policy teacher_tasks on tasks for all to authenticated
  using (teaches_class(class_id)) with check (teaches_class(class_id));
create policy teacher_questions on task_questions for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_id and teaches_class(t.class_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and teaches_class(t.class_id)));
create policy teacher_results on task_results for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_id and teaches_class(t.class_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and teaches_class(t.class_id)));
create policy teacher_question_marks on question_marks for all to authenticated
  using (exists (select 1 from task_questions q join tasks t on t.id = q.task_id
                 where q.id = question_id and teaches_class(t.class_id)))
  with check (exists (select 1 from task_questions q join tasks t on t.id = q.task_id
                 where q.id = question_id and teaches_class(t.class_id)));
create policy teacher_imports on mark_imports for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_id and teaches_class(t.class_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and teaches_class(t.class_id)));
create policy read_resources on resources for select to authenticated
  using (school_id is null or is_school_member(school_id));
create policy add_resources on resources for insert to authenticated
  with check (school_id is not null and is_school_member(school_id) and added_by = auth.uid());
create policy teacher_remedies on remedy_plans for all to authenticated
  using (teaches_class(class_id)) with check (teaches_class(class_id));
create policy teacher_remedy_actions on remedy_actions for all to authenticated
  using (exists (select 1 from remedy_plans p where p.id = plan_id and teaches_class(p.class_id)))
  with check (exists (select 1 from remedy_plans p where p.id = plan_id and teaches_class(p.class_id)));
create policy teacher_remedy_learners on remedy_learners for all to authenticated
  using (exists (select 1 from remedy_plans p where p.id = plan_id and teaches_class(p.class_id)))
  with check (exists (select 1 from remedy_plans p where p.id = plan_id and teaches_class(p.class_id)));
create policy teacher_study_pairs on study_pairs for all to authenticated
  using (exists (select 1 from remedy_plans p where p.id = plan_id and teaches_class(p.class_id)))
  with check (exists (select 1 from remedy_plans p where p.id = plan_id and teaches_class(p.class_id)));

-- Outbox: teachers may queue messages for their learners' consenting guardians;
-- only the server (service role) sends them and updates status.
create policy queue_messages on notification_outbox for insert to authenticated
  with check (learner_id is not null and can_see_learner(learner_id)
              and exists (select 1 from learner_guardians lg
                          where lg.learner_id = notification_outbox.learner_id
                            and lg.guardian_id = notification_outbox.guardian_id
                            and lg.consent_at is not null));
create policy see_queued_messages on notification_outbox for select to authenticated
  using (learner_id is not null and can_see_learner(learner_id));

-- Audit log: anyone may write their own entries; only admins read.
create policy write_audit on audit_log for insert to authenticated
  with check (user_id = auth.uid());
create policy admin_reads_audit on audit_log for select to authenticated
  using (is_school_admin(school_id));
