import { useState } from 'react';
import { View } from 'react-native';

import { Button, ErrorText, Field, Muted, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Shown to signed-in users who don't have an approved school role yet. */
export default function Pending() {
  const { memberships, refreshMemberships, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const waiting = memberships.some((m) => m.status === 'pending');
  const suspended = memberships.length > 0 && memberships.every((m) => m.status === 'suspended');

  async function joinSchool() {
    if (!code.trim()) {
      setError('Enter the invite code from your school.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('join_school_with_code', { p_code: code.trim() });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    await refreshMemberships();
  }

  if (suspended) {
    return (
      <Screen>
        <Title>Access paused</Title>
        <Muted>Your school has paused your access. Please speak to your school administrator.</Muted>
        <Button title="Log out" variant="secondary" onPress={signOut} />
      </Screen>
    );
  }

  if (waiting) {
    return (
      <Screen>
        <Title>Your school is checking your account</Title>
        <Muted>
          Learner marks are confidential, so a school administrator confirms you before real learner data appears.
        </Muted>
        <View style={{ gap: 12, marginTop: 'auto' }}>
          <Button title="Check again" onPress={refreshMemberships} />
          <Button title="Log out" variant="secondary" onPress={signOut} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Join your school</Title>
      <Muted>Enter the invite code your school administrator gave you.</Muted>
      <Field label="School invite code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="e.g. 7KX-29Q" />
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Join school" onPress={joinSchool} loading={busy} />
      <Button title="Log out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
