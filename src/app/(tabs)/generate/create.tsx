import { Redirect, useLocalSearchParams } from 'expo-router';

import { CreateForm } from '@/components/create/create-form';

/**
 * Couple/Single land here from the Generate landing screen's cards
 * (src/app/(tabs)/generate/index.tsx) with their subject already picked —
 * this screen's only job is reading which one was tapped back out of the
 * URL param and handing it to CreateForm as its initial toggle state. An
 * unrecognized/missing subject (a stale deep link, say) falls back to the
 * landing screen rather than rendering CreateForm with a silently wrong
 * default.
 */
export default function GenerateCreateScreen() {
  const { subject } = useLocalSearchParams<{ subject?: string }>();
  if (subject !== 'couple' && subject !== 'solo') return <Redirect href="/generate" />;

  return <CreateForm initialSubject={subject} />;
}
