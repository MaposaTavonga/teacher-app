import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colors } from '@/constants/colors';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color as string} size={size} />
  );
}

// The five tabs from the prototype.
export default function TeacherLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="register" options={{ title: 'Register', tabBarIcon: tabIcon('checkbox-outline') }} />
      <Tabs.Screen name="classes" options={{ title: 'Classes', tabBarIcon: tabIcon('people-outline') }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: tabIcon('clipboard-outline') }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: tabIcon('grid-outline') }} />
    </Tabs>
  );
}
