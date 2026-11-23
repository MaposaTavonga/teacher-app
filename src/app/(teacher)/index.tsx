import { Button, Muted, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function TeacherHome() {
  const { session, approvedRoles, setActiveRole, signOut } = useAuth();
  const name = session?.user.user_metadata?.full_name ?? 'teacher';

  return (
    <Screen>
      <Title>Good day, {name}</Title>
      <Muted>Home dashboard: coming next.</Muted>
      {approvedRoles.includes('admin') && (
        <Button title="Switch to school admin" variant="secondary" onPress={() => setActiveRole('admin')} />
      )}
      <Button title="Log out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
