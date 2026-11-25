import { addDays } from './dates';
import { loadTeacherClasses, type TeacherClass } from './register';
import { supabase } from './supabase';

export type ClassToday = TeacherClass & {
  learnerCount: number;
  registersTaken: number; // registers saved today (any period)
  absentToday: number;
};

export type AttendanceConcern = {
  learnerId: string;
  name: string;
  className: string;
  missed: number;
  topics: string[]; // topics taught while they were away
};

export type RecentTask = {
  id: string;
  title: string;
  className: string;
  type: string;
  date: string;
  status: 'draft' | 'open' | 'captured' | 'analysed';
};

export type HomeData = {
  teacherName: string;
  classes: ClassToday[];
  totalLearners: number;
  absentToday: number;
  concerns: AttendanceConcern[];
  tasks: RecentTask[];
  tasksNeedingMarks: number;
  focusLearners: number; // learners with a topic gap (from the topic map)
};

/** How far back to look for repeated absences, and how many count as a concern. */
const ABSENCE_WINDOW_DAYS = 14;
const ABSENCE_THRESHOLD = 2;

export async function loadHomeData(today: string): Promise<HomeData> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error('You are not logged in.');

  const since = addDays(today, -ABSENCE_WINDOW_DAYS);

  const [profileRes, classes, enrolRes, todayRes, absenceRes, tasksRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    loadTeacherClasses(today),
    supabase.from('class_enrolments').select('class_id').is('left_on', null),
    supabase
      .from('register_sessions')
      .select('id, class_id, attendance_records(learner_id, status)')
      .eq('session_date', today),
    supabase
      .from('register_sessions')
      .select(
        'session_date, class_id, topics(name), attendance_records!inner(learner_id, status, learners(first_name, last_name, preferred_name))'
      )
      .gte('session_date', since)
      .lte('session_date', today)
      .eq('attendance_records.status', 'absent'),
    supabase
      .from('tasks')
      .select('id, title, type, task_date, status, class_id')
      .order('task_date', { ascending: false })
      .limit(5),
  ]);

  for (const res of [enrolRes, todayRes, absenceRes, tasksRes]) {
    if (res.error) throw res.error;
  }

  const classNames = new Map(classes.map((c) => [c.id, c.name]));

  // Learners per class
  const learnerCounts = new Map<string, number>();
  for (const row of enrolRes.data ?? []) {
    learnerCounts.set(row.class_id, (learnerCounts.get(row.class_id) ?? 0) + 1);
  }

  // Today's registers
  const registersTaken = new Map<string, number>();
  const absentByClass = new Map<string, Set<string>>();
  const absentAll = new Set<string>();
  for (const session of (todayRes.data ?? []) as any[]) {
    registersTaken.set(session.class_id, (registersTaken.get(session.class_id) ?? 0) + 1);
    for (const r of session.attendance_records ?? []) {
      if (r.status !== 'absent') continue;
      if (!absentByClass.has(session.class_id)) absentByClass.set(session.class_id, new Set());
      absentByClass.get(session.class_id)!.add(r.learner_id);
      absentAll.add(r.learner_id);
    }
  }

  const classesToday: ClassToday[] = classes.map((c) => ({
    ...c,
    learnerCount: learnerCounts.get(c.id) ?? 0,
    registersTaken: registersTaken.get(c.id) ?? 0,
    absentToday: absentByClass.get(c.id)?.size ?? 0,
  }));

  // Repeated absences in the last two weeks, with the topics missed
  const byLearner = new Map<string, AttendanceConcern>();
  for (const session of (absenceRes.data ?? []) as any[]) {
    for (const r of session.attendance_records ?? []) {
      const l = r.learners;
      const key = `${session.class_id}:${r.learner_id}`;
      if (!byLearner.has(key)) {
        byLearner.set(key, {
          learnerId: r.learner_id,
          name: l ? `${l.preferred_name ?? l.first_name} ${l.last_name}` : 'Learner',
          className: classNames.get(session.class_id) ?? '',
          missed: 0,
          topics: [],
        });
      }
      const concern = byLearner.get(key)!;
      concern.missed += 1;
      const topic = session.topics?.name;
      if (topic && !concern.topics.includes(topic)) concern.topics.push(topic);
    }
  }
  const concerns = [...byLearner.values()]
    .filter((c) => c.missed >= ABSENCE_THRESHOLD)
    .sort((a, b) => b.missed - a.missed);

  // Tasks
  const tasks: RecentTask[] = ((tasksRes.data ?? []) as any[]).map((t) => ({
    id: t.id,
    title: t.title,
    className: classNames.get(t.class_id) ?? '',
    type: t.type,
    date: t.task_date,
    status: t.status,
  }));
  const tasksNeedingMarks = tasks.filter((t) => t.status === 'draft' || t.status === 'open').length;

  // Learners with a topic gap. The topic map fills up once marks are captured,
  // so an error or empty result here should never break the home screen.
  let focusLearners = 0;
  const focusRes = await supabase.from('topic_map').select('learner_id').not('gap', 'is', null);
  if (!focusRes.error) focusLearners = new Set((focusRes.data ?? []).map((r: any) => r.learner_id)).size;

  return {
    teacherName: profileRes.data?.full_name ?? user.user_metadata?.full_name ?? '',
    classes: classesToday,
    totalLearners: [...learnerCounts.values()].reduce((a, b) => a + b, 0),
    absentToday: absentAll.size,
    concerns,
    tasks,
    tasksNeedingMarks,
    focusLearners,
  };
}
