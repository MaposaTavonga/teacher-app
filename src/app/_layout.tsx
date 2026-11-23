import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { loading, session, activeRole } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null; // splash screen stays up

  const signedIn = !!session;

  // The app only decides which screens to SHOW.
  // The database's row-level security decides what data anyone can GET.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && activeRole === null}>
        <Stack.Screen name="pending" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && activeRole === 'teacher'}>
        <Stack.Screen name="(teacher)" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && (activeRole === 'admin' || activeRole === 'hod')}>
        <Stack.Screen name="(admin)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
