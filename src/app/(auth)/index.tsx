import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Muted, Screen, Title } from '@/components/ui';

export default function Welcome() {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <Title>[App name]</Title>
        <Muted>Your personal assistant for managing classes and understanding how your learners are doing.</Muted>
      </View>
      <View style={{ gap: 12 }}>
        <Button title="Create account" onPress={() => router.push('/sign-up')} />
        <Button title="Log in" variant="secondary" onPress={() => router.push('/sign-in')} />
      </View>
    </Screen>
  );
}
