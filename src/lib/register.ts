import { atpWeekFor } from './dates';
import { supabase } from './supabase';

export type AttendanceStatus = 'present' | 'absent' | 'late';

export type TeacherClass = {
  id: string;
  name: string;
  weekNumber: number | null;
  topics: { id: string; name: string }[]; // this week's ATP topic(s)
};

export type ClassLearner = {
  id: string;
  name: string;
  learnerNumber: string | null;
};

/** Classes the logged-in teacher teaches, with the ATP topic for `date`. */
export async function loadTeacherClasses(date: string): Promise<TeacherClass[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, atp_week_offset, atp_plans(term_start, atp_weeks(week_number, topics(id, name)))')
    .order('name');
  if (error) throw error;

  return (data ?? []).map((c: any) => {
    const plan = c.atp_plans;
    if (!plan) return { id: c.id, name: c.name, weekNumber: null, topics: [] };
    const week = atpWeekFor(plan.term_start, date, c.atp_week_offset ?? 0);
    const topics = (plan.atp_weeks ?? [])
      .filter((w: any) => w.week_number === week && w.topics)
      .map((w: any) => ({ id: w.topics.id, name: w.topics.name }));
    return { id: c.id, name: c.name, weekNumber: week, topics };
  });
}

/** Learners currently enrolled in a class, sorted by surname. */
export async function loadClassLearners(classId: string): Promise<ClassLearner[]> {
  const { data, error } = await supabase
    .from('class_enrolments')
    .select('learners(id, first_name, last_name, preferred_name, learner_number, active)')
    .eq('class_id', classId)
    .is('left_on', null);
  if (error) throw error;

  return (data ?? [])
    .map((row: any) => row.learners)
    .filter((l: any) => l && l.active)
    .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))
    .map((l: any) => ({
      id: l.id,
      name: `${l.preferred_name ?? l.first_name} ${l.last_name}`,
      learnerNumber: l.learner_number,
    }));
}

/** A register already taken for this class, date and period (to edit it). */
export async function loadExistingRegister(
  classId: string,
  date: string,
  period: number
): Promise<Record<string, AttendanceStatus> | null> {
  const { data, error } = await supabase
    .from('register_sessions')
    .select('id, attendance_records(learner_id, status)')
    .eq('class_id', classId)
    .eq('session_date', date)
    .eq('period', period)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const statuses: Record<string, AttendanceStatus> = {};
  for (const r of (data as any).attendance_records ?? []) statuses[r.learner_id] = r.status;
  return statuses;
}

/** Save (or update) a register. Every learner gets a row; unmarked = present. */
export async function saveRegister(params: {
  classId: string;
  date: string;
  period: number;
  topicId: string | null;
  learnerIds: string[];
  statuses: Record<string, AttendanceStatus>;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('You are not logged in.');

  const { data: session, error: sessionError } = await supabase
    .from('register_sessions')
    .upsert(
      {
        class_id: params.classId,
        session_date: params.date,
        period: params.period,
        topic_id: params.topicId,
        taken_by: userId,
        saved_at: new Date().toISOString(),
      },
      { onConflict: 'class_id,session_date,period' }
    )
    .select('id')
    .single();
  if (sessionError) throw sessionError;

  const rows = params.learnerIds.map((learnerId) => ({
    session_id: session.id,
    learner_id: learnerId,
    status: params.statuses[learnerId] ?? 'present',
  }));
  const { error: recordsError } = await supabase
    .from('attendance_records')
    .upsert(rows, { onConflict: 'session_id,learner_id' });
  if (recordsError) throw recordsError;
}
