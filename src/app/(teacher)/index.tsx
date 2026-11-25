import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText } from '@/components/ui';
import { colors } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { greeting, prettyDate, todayLocal } from '@/lib/dates';
import { loadHomeData, type HomeData } from '@/lib/home';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function TeacherHome() {
  const { approvedRoles, setActiveRole, signOut } = useAuth();
  const today = todayLocal();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await loadHomeData(today));
    } catch (e: any) {
      setError(e.message ?? 'Could not load your dashboard.');
    }
  }, [today]);

  // Reload whenever Home comes back into view (e.g. after saving a register).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const firstName = data?.teacherName.split(' ')[0] ?? '';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.muted}>{prettyDate(today)}</Text>
            <Text style={styles.title}>
              {greeting()}
              {firstName ? `, ${firstName}` : ''}
            </Text>
          </View>
        </View>

        {error && <ErrorText>{error}</ErrorText>}
        {!data && !error && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}

        {data && (
          <>
            {/* This week's ATP topic per class */}
            {data.classes.map((c) => (
              <Pressable key={c.id} accessibilityRole="button" onPress={() => go('/register')} style={styles.weekCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.weekLabel}>
                    {c.name}
                    {c.weekNumber ? ` · Week ${c.weekNumber}` : ''}
                  </Text>
                  <Text style={styles.weekTopic}>{c.topics[0]?.name ?? 'No ATP topic set'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}

            {/* Today: what needs doing */}
            <View style={styles.todayCard}>
              <Text style={styles.todayLabel}>TODAY</Text>
              {data.classes.map((c) =>
                c.registersTaken === 0 ? (
                  <TodayRow
                    key={c.id}
                    title="Take the register"
                    subtitle={c.name}
                    onPress={() => go('/register')}
                  />
                ) : (
                  <TodayRow
                    key={c.id}
                    title={`✓ Register taken · ${c.name}`}
                    subtitle={c.absentToday === 0 ? 'Everyone present' : `${c.absentToday} absent today`}
                    onPress={() => go('/register')}
                    done
                  />
                )
              )}
              {data.tasksNeedingMarks > 0 && (
                <TodayRow
                  title="Capture marks"
                  subtitle={`${data.tasksNeedingMarks} task${data.tasksNeedingMarks > 1 ? 's' : ''} without marks`}
                  onPress={() => go('/tasks')}
                />
              )}
              {data.focusLearners > 0 && (
                <TodayRow
                  title={`${data.focusLearners} learners need focus`}
                  subtitle="See which topics and why"
                  onPress={() => go('/insights')}
                />
              )}
            </View>

            {/* Numbers at a glance */}
            <View style={styles.stats}>
              <Stat value={data.classes.length} label="Classes" onPress={() => go('/classes')} />
              <Stat value={data.totalLearners} label="Learners" onPress={() => go('/classes')} />
              <Stat value={data.absentToday} label="Absent today" onPress={() => go('/register')} warn={data.absentToday > 0} />
            </View>

            {/* Quick actions */}
            <Text style={styles.sectionTitle}>Quick actions</Text>
            <View style={styles.actions}>
              <Action icon="checkbox-outline" label="Register" onPress={() => go('/register')} />
              <Action icon="add" label="New task" onPress={() => go('/tasks')} />
              <Action icon="grid-outline" label="Topic map" onPress={() => go('/insights')} />
            </View>

            {/* Learners missing lessons */}
            <Text style={styles.sectionTitle}>Missing lessons</Text>
            {data.concerns.length === 0 ? (
              <Text style={styles.emptyText}>No learner has missed 2 or more lessons in the last 2 weeks.</Text>
            ) : (
              <View style={styles.listCard}>
                {data.concerns.slice(0, 5).map((c, i) => (
                  <View key={`${c.learnerId}-${c.className}`} style={[styles.listRow, i > 0 && styles.listDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{c.name}</Text>
                      <Text style={styles.rowSub}>
                        {c.className}
                        {c.topics.length > 0 ? ` · missed ${c.topics.join(', ')}` : ''}
                      </Text>
                    </View>
                    <View style={styles.badgeWarn}>
                      <Text style={styles.badgeWarnText}>{c.missed} missed</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Recent tasks */}
            <Text style={styles.sectionTitle}>Recent tasks</Text>
            {data.tasks.length === 0 ? (
              <Text style={styles.emptyText}>No tasks yet. Create a classwork task or test to start seeing topic insights.</Text>
            ) : (
              <View style={styles.listCard}>
                {data.tasks.slice(0, 3).map((t, i) => (
                  <Pressable key={t.id} onPress={() => go('/tasks')} style={[styles.listRow, i > 0 && styles.listDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{t.title}</Text>
                      <Text style={styles.rowSub}>
                        {t.className} · {t.type === 'informal' ? 'informal' : 'formal'} · {t.date}
                      </Text>
                    </View>
                    <TaskBadge status={t.status} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Account */}
            <View style={styles.account}>
              {approvedRoles.includes('admin') && (
                <Button title="Switch to school admin" variant="secondary" onPress={() => setActiveRole('admin')} />
              )}
              <Button title="Log out" variant="secondary" onPress={signOut} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function go(href: Href) {
  router.navigate(href);
}

function TodayRow({ title, subtitle, onPress, done }: { title: string; subtitle: string; onPress: () => void; done?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.todayRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.todayTitle, done && { opacity: 0.85 }]}>{title}</Text>
        <Text style={styles.todaySub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
    </Pressable>
  );
}

function Stat({ value, label, onPress, warn }: { value: number; label: string; onPress: () => void; warn?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.stat, warn && { backgroundColor: colors.warningTint, borderColor: colors.warningTint }]}>
      <Text style={[styles.statValue, warn && { color: colors.warning }]}>{value}</Text>
      <Text style={[styles.statLabel, warn && { color: colors.warning }]}>{label}</Text>
    </Pressable>
  );
}

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <Ionicons name={icon} size={24} color={colors.primary} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function TaskBadge({ status }: { status: string }) {
  const needsMarks = status === 'draft' || status === 'open';
  return (
    <View style={needsMarks ? styles.badgeWarn : styles.badgeOk}>
      <Text style={needsMarks ? styles.badgeWarnText : styles.badgeOkText}>
        {needsMarks ? 'No marks yet' : status === 'analysed' ? 'Analysed' : 'Captured'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  weekCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 },
  weekLabel: { fontSize: 12, color: colors.textMuted },
  weekTopic: { fontSize: 15, fontWeight: '700', color: colors.text },
  todayCard: { backgroundColor: colors.primary, borderRadius: 20, padding: 18, gap: 4 },
  todayLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.8, color: '#CDE9E1', marginBottom: 4 },
  todayRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 6 },
  todayTitle: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  todaySub: { fontSize: 13, color: '#CDE9E1' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 2 },
  statValue: { fontSize: 26, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 13, color: colors.textMuted },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 14 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  emptyText: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  listCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
  listDivider: { borderTopWidth: 1, borderTopColor: '#EEF0EC' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowSub: { fontSize: 13, color: colors.textMuted },
  badgeWarn: { backgroundColor: colors.warningTint, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  badgeWarnText: { fontSize: 12, fontWeight: '700', color: colors.warning },
  badgeOk: { backgroundColor: colors.primaryTint, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  badgeOkText: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  account: { gap: 10, marginTop: 16 },
});
