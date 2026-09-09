import { Tabs, TabList, TabTrigger } from 'expo-router/ui';

import { AnimatedTabSlot } from '@/components/navigation/animated-tab-slot';
import { FloatingTabBar } from '@/components/navigation/floating-tab-bar';

export default function TabsLayout() {
  return (
    <Tabs style={{ flex: 1 }}>
      <AnimatedTabSlot />
      <FloatingTabBar />
      {/* Config-only — the visible bar above reads focus state off these triggers. */}
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="home" href="/" />
        <TabTrigger name="generate" href="/generate" />
        <TabTrigger name="gallery" href="/gallery" />
        <TabTrigger name="profile" href="/profile" />
      </TabList>
    </Tabs>
  );
}
