// tsc only compiles .ts -> .js; it silently drops non-source files like the
// .jpg template photos under src/data/templateImages/, so without this
// step `node dist/index.js` (production/Docker — see ../Dockerfile) would
// boot fine but every templateImageFor() lookup would throw ENOENT the
// first time a real generation ran. Run as part of `npm run build`, after
// `tsc`, so dist/ ends up with the same layout src/ has.
import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src', 'data', 'templateImages');
const dest = path.join(root, 'dist', 'data', 'templateImages');

if (existsSync(src)) {
  cpSync(src, dest, { recursive: true });
  console.log(`Copied template images: ${src} -> ${dest}`);
} else {
  console.warn(`No template images found at ${src} — skipping copy.`);
}
