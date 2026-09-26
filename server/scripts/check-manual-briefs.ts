/**
 * Fails (exit 1) if any hand-written scene brief mentions a person's physical features. Run from server/:
 *   node node_modules/tsx/dist/cli.mjs scripts/check-manual-briefs.ts
 * Same word list as scripts/generate-scene-briefs.ts and lib/promptEnhancer.ts (lib/identityWords.ts), so a hand-written
 * brief is held to exactly the rule the generated ones are. No API calls.
 */
import { MANUAL_SCENE_BRIEFS } from '../src/data/sceneBriefsManual.js';
import { findIdentityWords } from '../src/lib/identityWords.js';

let bad = 0;
for (const [id, brief] of Object.entries(MANUAL_SCENE_BRIEFS)) {
  const leaks = findIdentityWords(brief);
  const words = brief.split(/\s+/).length;
  console.log(`${leaks.length ? 'FAIL' : 'ok  '} ${id}: ${words} words${leaks.length ? `, identity words: ${leaks.join(', ')}` : ''}`);
  if (leaks.length) bad++;
}
process.exit(bad ? 1 : 0);
