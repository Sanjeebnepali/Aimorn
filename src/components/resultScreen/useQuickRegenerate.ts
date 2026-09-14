import { showAlert } from '@/alerts/store';
import type { UserCreationItem } from '@/data/gallery-store';
import { useApi } from '@/utils/api';

type ActivePane = 'together' | 'a' | 'b';
type ImageField = 'togetherImage' | 'roleAImage' | 'roleBImage';

/**
 * Split out of result/[id].tsx 2026-09-14 alongside the regenerate progress
 * overlay (ProgressOverlay.tsx, regenerate/[id].tsx's own copy of this same
 * fix) — that file was already at the workspace's 350-line cap, and adding
 * the overlay/back-guard needed for this same "Quick Redo" shortcut would
 * have pushed it well over. `handleRegenerate` was the one handler among
 * result/[id].tsx's several (download/share/set-wallpaper/delete/regenerate)
 * self-contained enough to carve out cleanly — the others share more of
 * that screen's own local state (ViewShot ref, couple-pack flow) than this
 * one does.
 *
 * Returns the same `handleRegenerate` closure the inline version was —
 * callers pass in the pieces of result/[id].tsx's own state this needs
 * rather than this hook owning any of its own, so behavior (confirm dialog,
 * 1-credit "Quick Redo" of just the active pane, `busyAction` gating) is
 * unchanged from before the split.
 */
export function useQuickRegenerate(params: {
  item: UserCreationItem | undefined;
  activePane: ActivePane;
  busyAction: string | null;
  setBusyAction: (value: 'regenerate' | null) => void;
  updateCreationImage: (id: string, field: ImageField, url: string) => void;
}) {
  const { item, activePane, busyAction, setBusyAction, updateCreationImage } = params;
  const api = useApi();

  // Redoes ONLY the currently-viewed pane (Together/You/Partner) — the
  // user's own real ask: not liking one of a couple session's 3 images
  // shouldn't mean regenerating (and paying for) all 3 again. `activePane`
  // ('together'|'a'|'b') IS the API's `part` param already, no mapping
  // needed. Confirms first since it costs a real credit and overwrites the
  // current image at the same URL (no undo) — same confirm-before-commit
  // pattern as handleDelete's own dialog, for the same reason.
  return function handleRegenerate() {
    if (busyAction || !item) return;
    const partLabel = activePane === 'together' ? 'Together' : activePane === 'a' ? 'You' : 'Partner';
    showAlert(`Regenerate "${partLabel}"?`, 'This uses 1 credit and replaces just this image — the others stay exactly as they are.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate',
        onPress: async () => {
          setBusyAction('regenerate');
          try {
            const updated = await api.regenerateGenerationPart(item.id, activePane);
            const field = activePane === 'together' ? 'togetherImage' : activePane === 'a' ? 'roleAImage' : 'roleBImage';
            const url = activePane === 'together' ? updated.outputUrl : activePane === 'a' ? updated.outputUrlA : updated.outputUrlB;
            if (url) updateCreationImage(item.id, field, url);
            showAlert('Regenerated ✨', 'This image has been redone.');
          } catch (err) {
            showAlert('Couldn’t Regenerate', err instanceof Error ? err.message : 'Something went wrong.');
          } finally {
            setBusyAction(null);
          }
        },
      },
    ]);
  };
}
