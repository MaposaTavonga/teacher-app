import { Link } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorText, Field, Muted, Screen, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function SignUp() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signUp() {
    if (!fullName.trim() || !email.trim()) {
      setError('Enter your full name and email.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    // full_name and phone are saved to your profile by a database trigger.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), phone: phone.trim() || null } },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data.session) {
      setNotice('Check your email to confirm your account, then log in.');
    }
    // With a session, the root layout moves to the school-code screen.
  }

  return (
    <Screen>
      <Title>Create your account</Title>
      <Muted>Next you'll join your school with its invite code.</Muted>
      <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" placeholder="e.g. Nomsa Khumalo" />
      <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@school.co.za" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="At least 8 characters" />
      <Field label="Phone number (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="e.g. 082 000 0000" />
      {error && <ErrorText>{error}</ErrorText>}
      {notice && <Muted>{notice}</Muted>}
      <Button title="Create account" onPress={signUp} loading={busy} />
      <Muted>
        Already registered? <Link href="/sign-in">Log in</Link>
      </Muted>
    </Screen>
  );
}
