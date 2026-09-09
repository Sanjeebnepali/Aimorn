import { Redirect, useLocalSearchParams } from 'expo-router';

import { CreateForm } from '@/components/create/create-form';
import { getTemplate } from '@/data/templates';

export default function GenerateFromTemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const template = getTemplate(id);

  // Unknown/stale template id (e.g. a deep link to a since-removed template) —
  // fall back to the blank flow rather than rendering an empty banner.
  if (!template) return <Redirect href="/generate" />;

  return <CreateForm template={template} />;
}
