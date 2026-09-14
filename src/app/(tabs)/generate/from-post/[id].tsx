import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { CreateForm } from '@/components/create/create-form';
import { useApi, type PostResponse } from '@/utils/api';

/**
 * "Recreate" entry point for a real community post (src/app/post/[id].tsx),
 * parallel to from-template/[id].tsx (which recreates one of the 12 bundled
 * starter themes instead). Kept as a separate route rather than overloading
 * from-template's — a post id is a real Post.id (cuid), not a
 * Template.id from templates.ts, and recreating one needs to thread
 * `sourcePostId` through to POST /generations so the original poster's
 * regenerationCount/points actually move (see generations.ts's
 * awardPointsForRegeneration) — something recreating a bundled template
 * never does, since a template has no owner to credit.
 */
export default function GenerateFromPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const [post, setPost] = useState<PostResponse | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getPost(id)
      .then(setPost)
      .catch(() => setNotFound(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Unknown/deleted post (e.g. a stale deep link, or the owner deleted it
  // between viewing and tapping Recreate) — fall back to the blank flow
  // rather than an empty/frozen screen.
  if (notFound) return <Redirect href="/generate" />;
  if (!post) return null;

  // GROUP posts (2026-09-12, real request: "three faces in one photo") have
  // no "Recreate" support here on purpose — CreateForm's Couple/Solo toggle
  // physically cannot represent 2-4 people, and silently mapping a group
  // post into it would misrepresent whoever isn't "You"/"Partner" rather
  // than fail loudly. Falls back to the mode chooser instead of a broken
  // recreate — same "don't guess, land somewhere correct" reasoning as the
  // notFound case above.
  if (post.subjectMode === 'GROUP') return <Redirect href="/generate" />;

  return <CreateForm sourcePost={post} />;
}
