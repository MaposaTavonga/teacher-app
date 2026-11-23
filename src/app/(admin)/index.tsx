import { Button, Muted, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function AdminHome() {
  const { approvedRoles, setActiveRole, signOut } = useAuth();

  return (
    <Screen>
      <Title>School admin</Title>
      <Muted>Approve teachers, class lists and the ATP: coming later. For now, approve teachers in the Supabase dashboard.</Muted>
      {approvedRoles.includes('teacher') && (
        <Button title="Switch to teacher" variant="secondary" onPress={() => setActiveRole('teacher')} />
      )}
      <Button title="Log out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
