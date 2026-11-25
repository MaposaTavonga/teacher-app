-- =====================================================================
-- 004: sample class for testing the register (FAKE data only)
-- Run AFTER 003_dev_setup.sql and after you've approved yourself.
--
-- Adds:
--   * Grade 9 Mathematics Term 4 topics and a sample Term 4 ATP
--   * 10 fake learners enrolled in "Grade 9 Mathematics"
--   * links every approved teacher at the test school to that class
-- Replace with your mom's real subject, grade and ATP later.
-- =====================================================================

-- Topics (sample Grade 9 Mathematics, Term 4)
insert into topics (subject_id, grade, name)
select s.id, 9, t.name
from subjects s,
     (values ('Transformation geometry'),
             ('Geometry of 3D objects'),
             ('Collect, organise and summarise data'),
             ('Represent data'),
             ('Interpret, analyse and report on data'),
             ('Probability'),
             ('Revision and examinations')) as t(name)
where s.name = 'Mathematics'
on conflict (subject_id, grade, name) do nothing;

-- Sample Term 4 ATP for the test school. Week 1 starts Monday 12 October 2026.
insert into atp_plans (id, school_id, subject_id, grade, year, term, term_start)
select '44444444-4444-4444-4444-444444444444',
       '11111111-1111-1111-1111-111111111111',
       s.id, 9, 2026, 4, date '2026-10-12'
from subjects s where s.name = 'Mathematics'
on conflict (id) do nothing;

insert into atp_weeks (plan_id, week_number, topic_id)
select '44444444-4444-4444-4444-444444444444', w.week, t.id
from (values (1, 'Transformation geometry'),
             (2, 'Transformation geometry'),
             (3, 'Geometry of 3D objects'),
             (4, 'Geometry of 3D objects'),
             (5, 'Collect, organise and summarise data'),
             (6, 'Represent data'),
             (7, 'Interpret, analyse and report on data'),
             (8, 'Probability'),
             (9, 'Revision and examinations'),
             (10, 'Revision and examinations')) as w(week, name)
join topics t on t.name = w.name and t.grade = 9
join subjects s on s.id = t.subject_id and s.name = 'Mathematics'
on conflict do nothing;

update classes
set atp_plan_id = '44444444-4444-4444-4444-444444444444'
where id = '33333333-3333-3333-3333-333333333333';

-- 10 fake learners
insert into learners (id, school_id, learner_number, first_name, last_name)
values
  ('55555555-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '9-001', 'Ayanda',   'Dlamini'),
  ('55555555-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '9-002', 'Bongani',  'Nkosi'),
  ('55555555-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '9-003', 'Chantel',  'van Wyk'),
  ('55555555-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '9-004', 'Dineo',    'Mokoena'),
  ('55555555-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '9-005', 'Ethan',    'Naidoo'),
  ('55555555-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '9-006', 'Farai',    'Moyo'),
  ('55555555-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', '9-007', 'Gugu',     'Mahlangu'),
  ('55555555-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '9-008', 'Karabo',   'Molefe'),
  ('55555555-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', '9-009', 'Lerato',   'Khumalo'),
  ('55555555-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', '9-010', 'Thabo',    'Sithole')
on conflict (id) do nothing;

insert into class_enrolments (class_id, learner_id)
select '33333333-3333-3333-3333-333333333333', id
from learners
where school_id = '11111111-1111-1111-1111-111111111111'
on conflict do nothing;

-- Make sure every approved teacher at the test school can see this class.
insert into class_teachers (class_id, teacher_id)
select '33333333-3333-3333-3333-333333333333', user_id
from school_members
where school_id = '11111111-1111-1111-1111-111111111111'
  and role = 'teacher' and status = 'approved'
on conflict do nothing;
