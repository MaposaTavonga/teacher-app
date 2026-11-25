import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Muted } from '@/components/ui';
import { colors } from '@/constants/colors';
import { prettyDate, todayLocal } from '@/lib/dates';
import {
  loadClassLearners,
  loadExistingRegister,
  loadTeacherClasses,
  saveRegister,
  type AttendanceStatus,
  type ClassLearner,
  type TeacherClass,
} from '@/lib/register';

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

const STATUS_BUTTONS: { status: AttendanceStatus; label: string; color: string; a11y: string }[] = [
  { status: 'present', label: 'P', color: colors.primary, a11y: 'Present' },
  { status: 'absent', label: 'A', color: colors.warning, a11y: 'Absent' },
  { status: 'late', label: 'L', color: colors.info, a11y: 'Late' },
];

export default function RegisterScreen() {
  const date = todayLocal();
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [classId, setClassId] = useState<string | null>(null);
  const [period, setPeriod] = useState(1);
  const [learners, setLearners] = useState<ClassLearner[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isEdit, setIsEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Load the teacher's classes once.
  useEffect(() => {
    loadTeacherClasses(date)
      .then((list) => {
        setClasses(list);
        setClassId(list[0]?.id ?? null);
        if (list.length === 0) setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [date]);

  // 2. Load learners and any register already taken for this class + period.
  const loadRegister = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    setSavedMessage(null);
    try {
      const [list, existing] = await Promise.all([
        loadClassLearners(classId),
        loadExistingRegister(classId, date, period),
      ]);
      setLearners(list);
      setStatuses(existing ?? {});
      setIsEdit(existing !== null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [classId, date, period]);

  useEffect(() => {
    loadRegister();
  }, [loadRegister]);

  const currentClass = classes.find((c) => c.id === classId) ?? null;
  const topic = currentClass?.topics[0] ?? null;

  const counts = useMemo(() => {
    let absent = 0;
    let late = 0;
    for (const l of learners) {
      const s = statuses[l.id] ?? 'present';
      if (s === 'absent') absent++;
      if (s === 'late') late++;
    }
    return { present: learners.length - absent - late, absent, late, total: learners.length };
  }, [learners, statuses]);

  function setStatus(learnerId: string, status: AttendanceStatus) {
    setSavedMessage(null);
    setStatuses((prev) => ({ ...prev, [learnerId]: status }));
  }

  async function onSave() {
    if (!classId) return;
    setSaving(true);
    setError(null);
    try {
      await saveRegister({
        classId,
        date,
        period,
        topicId: topic?.id ?? null,
        learnerIds: learners.map((l) => l.id),
        statuses,
      });
      setIsEdit(true);
      setSavedMessage(
        `${counts.present} present + ${counts.absent} absent + ${counts.late} late = ${counts.total}` +
          (counts.absent > 0 && topic ? `. Absent learners missed: ${topic.name}.` : '.')
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!loading && classes.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.empty}>
          <Text style={styles.title}>Register</Text>
          <Muted>You're not linked to any class yet. Ask your school admin to add you to a class.</Muted>
          {error && <ErrorText>{error}</ErrorText>}
        </View>
      </SafeAreaView>
    );
  }

  const header = (
    <View style={styles.header}>
      <Text style={styles.muted}>{prettyDate(date)}</Text>
      <Text style={styles.title}>Register</Text>

      {classes.length > 1 && (
        <View style={styles.chipRow}>
          {classes.map((c) => (
            <Chip key={c.id} label={c.name} selected={c.id === classId} onPress={() => setClassId(c.id)} />
          ))}
        </View>
      )}
      {classes.length === 1 && <Text style={styles.className}>{currentClass?.name}</Text>}

      <View style={styles.topicCard}>
        <Text style={styles.topicLabel}>
          {currentClass?.weekNumber ? `WEEK ${currentClass.weekNumber} TOPIC (FROM YOUR ATP)` : 'THIS WEEK’S TOPIC'}
        </Text>
        <Text style={styles.topicName}>{topic?.name ?? 'No ATP topic set for this week'}</Text>
      </View>

      <Text style={styles.sectionLabel}>Period</Text>
      <View style={styles.chipRow}>
        {PERIODS.map((p) => (
          <Chip key={p} label={String(p)} selected={p === period} onPress={() => setPeriod(p)} small />
        ))}
      </View>

      <View style={styles.counts}>
        <Count label="Present" value={counts.present} bg={colors.card} fg={colors.text} />
        <Count label="Absent" value={counts.absent} bg={colors.warningTint} fg={colors.warning} />
        <Count label="Late" value={counts.late} bg={colors.infoTint} fg={colors.info} />
        <Count label={`of ${counts.total} ✓`} value={counts.present + counts.absent + counts.late} bg={colors.primaryTint} fg={colors.primaryDark} />
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.muted}>{isEdit ? 'Editing today’s saved register' : 'Everyone starts as present'}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSavedMessage(null);
            setStatuses({});
          }}
          style={styles.smallButton}>
          <Text style={styles.smallButtonText}>All present</Text>
        </Pressable>
      </View>
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      {error && <ErrorText>{error}</ErrorText>}
      {savedMessage && (
        <View style={styles.savedBox}>
          <Text style={styles.savedTitle}>{'✓'} Register saved</Text>
          <Text style={styles.savedText}>{savedMessage}</Text>
        </View>
      )}
      <Button title={isEdit ? 'Update register' : 'Save register'} onPress={onSave} loading={saving} disabled={learners.length === 0} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {loading ? (
        <View style={styles.empty}>
          {header}
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={learners}
          keyExtractor={(l) => l.id}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={<Muted>No learners in this class yet.</Muted>}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const current = statuses[item.id] ?? 'present';
            return (
              <View style={styles.learnerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.learnerName}>{item.name}</Text>
                  {item.learnerNumber && <Text style={styles.learnerId}>{item.learnerNumber}</Text>}
                </View>
                {STATUS_BUTTONS.map((b) => {
                  const on = current === b.status;
                  return (
                    <Pressable
                      key={b.status}
                      accessibilityRole="button"
                      accessibilityLabel={`${b.a11y}: ${item.name}`}
                      accessibilityState={{ selected: on }}
                      onPress={() => setStatus(item.id, b.status)}
                      style={[styles.statusButton, on && { backgroundColor: b.color, borderColor: b.color }]}>
                      <Text style={[styles.statusText, on && { color: '#FFFFFF' }]}>{b.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Chip({ label, selected, onPress, small }: { label: string; selected: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, small && styles.chipSmall, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && { color: '#FFFFFF' }]}>{label}</Text>
    </Pressable>
  );
}

function Count({ label, value, bg, fg }: { label: string; value: number; bg: string; fg: string }) {
  return (
    <View style={[styles.count, { backgroundColor: bg }]}>
      <Text style={[styles.countValue, { color: fg }]}>{value}</Text>
      <Text style={[styles.countLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  empty: { padding: 20, gap: 16 },
  list: { padding: 20, gap: 8 },
  header: { gap: 12, marginBottom: 8 },
  footer: { gap: 12, marginTop: 12, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  className: { fontSize: 17, fontWeight: '600', color: colors.text },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  topicCard: { backgroundColor: colors.primaryTint, borderRadius: 14, padding: 14, gap: 4 },
  topicLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colors.primaryDark },
  topicName: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.inputBorder, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  chipSmall: { minWidth: 44, paddingHorizontal: 0 },
  chipSelected: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  counts: { flexDirection: 'row', gap: 8 },
  count: { flex: 1, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
  countValue: { fontSize: 20, fontWeight: '700' },
  countLabel: { fontSize: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  smallButton: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: colors.inputBorder, backgroundColor: colors.card, justifyContent: 'center' },
  smallButtonText: { fontSize: 13, fontWeight: '600', color: colors.text },
  learnerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingLeft: 14, paddingRight: 8 },
  learnerName: { fontSize: 15, fontWeight: '600', color: colors.text },
  learnerId: { fontSize: 12, color: colors.textMuted },
  statusButton: { width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: colors.inputBorder, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontSize: 15, fontWeight: '700', color: colors.text },
  savedBox: { backgroundColor: colors.primaryTint, borderRadius: 14, padding: 14, gap: 4 },
  savedTitle: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  savedText: { fontSize: 14, color: colors.primaryDark },
});
