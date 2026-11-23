import { Link } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorText, Field, Muted, Screen, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message);
    // On success the root layout switches screens automatically.
  }

  return (
    <Screen>
      <Title>Welcome back</Title>
      <Muted>Log in to see your classes.</Muted>
      <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@school.co.za" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="Your password" />
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Log in" onPress={signIn} loading={busy} />
      <Muted>
        New here? <Link href="/sign-up">Create an account</Link>
      </Muted>
    </Screen>
  );
}
