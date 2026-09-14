import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';
import { existsSync } from 'node:fs';

/**
 * Deterministic color/scale correction for the COUPLE+template "together"
 * shot — added 2026-09-12 as the legally-clean alternative to the face-swap
 * model stack (inswapper/InstantID/PuLID) a "senior developer" report
 * proposed. Real license research (this session) ruled every one of those
 * out: they all depend on InsightFace's ArcFace weights, licensed
 * non-commercial-research-only, which a paid app like Amora cannot use.
 * MediaPipe Face Landmarker and OpenCV's seamlessClone are both genuinely
 * verified clean (read the actual license/model-card text directly, not
 * assumed) — see scripts/face_correct.py's own doc comment for the full
 * reasoning and exactly what each correction does.
 *
 * Extended the same day to also do hair-color matching against the user's
 * own reference photos, directly per a real request after their own
 * on-device test ("why not we make [hair] as same as in the reference
 * image") — and to actually CORRECT (not just log) a scale mismatch, after
 * the same test confirmed a real, if mild, head-to-body fit issue.
 *
 * Runs as a Python subprocess rather than a persistent service — this repo
 * has no other long-running Python process to justify one, and a
 * spawn-per-generation is simple, fails open cleanly, and costs nothing
 * when idle. Revisit if generation volume ever makes process-spawn
 * overhead (a few hundred ms of Python startup) actually matter.
 */
export type FaceCorrectionReport = {
  facesDetected: number;
  colorCorrected: number;
  hairCorrected: number;
  scaleCorrected: { faceIndex: number; ratioBefore: number }[];
  scaleWarnings: { faceIndex: number; ratio: number }[];
  error?: string;
};

const EMPTY_REPORT: FaceCorrectionReport = { facesDetected: 0, colorCorrected: 0, hairCorrected: 0, scaleCorrected: [], scaleWarnings: [] };

const PYTHON_PATH = env.FACE_CORRECT_PYTHON;

const candidatePaths = [
  path.join(process.cwd(), 'scripts', 'face_correct.py'),
  path.join(process.cwd(), 'server', 'scripts', 'face_correct.py'),
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'face_correct.py'),
];
const SCRIPT_PATH = candidatePaths.find((p) => existsSync(p)) ?? candidatePaths[0];

/**
 * Corrects face-to-body skin tone, hair color (against `referencePhotos`),
 * and head-to-body scale (against `templateImageBytes`, the ground-truth
 * composition for COUPLE+template mode) in `generatedImageBytes`. Fails
 * open: any subprocess failure, missing Python/model file, or unexpected
 * output returns the ORIGINAL bytes untouched and a report noting the
 * error — a cosmetic correction failing must never turn a real, paid
 * generation into a failed one, same philosophy as every other quality
 * pass in this pipeline (reduceEditSeam, assessGenerationOutput).
 *
 * `referencePhotos` should be one representative photo per person (their
 * FIRST reference angle is enough — this only needs one clear look at
 * their hair, not the full multi-angle identity-lock set every other part
 * of this pipeline uses) — face_correct.py matches each detected face in
 * the output to whichever reference photo's skin tone is closest, since no
 * licensed identity-embedding model is available to match by identity
 * directly (see that script's own doc comment).
 */
export async function correctFaceToneAndScale(params: {
  templateImageBytes: Buffer;
  generatedImageBytes: Buffer;
  referencePhotos?: Buffer[];
}): Promise<{ imageBytes: Buffer; report: FaceCorrectionReport }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'amora-face-correct-'));
  const templatePath = path.join(dir, 'template.jpg');
  const generatedPath = path.join(dir, 'generated.jpg');
  const outputPath = path.join(dir, 'output.jpg');
  const refPaths = (params.referencePhotos ?? []).map((_, i) => path.join(dir, `ref${i}.jpg`));

  try {
    await Promise.all([
      writeFile(templatePath, params.templateImageBytes ?? Buffer.from('-')),
      writeFile(generatedPath, params.generatedImageBytes),
      ...(params.referencePhotos ?? []).map((bytes, i) => writeFile(refPaths[i], bytes)),
    ]);

    const report = await runPythonScript(templatePath, generatedPath, outputPath, refPaths);
    const correctedBytes = await readFile(outputPath).catch(() => null);

    if (!correctedBytes || report.error) {
      return { imageBytes: params.generatedImageBytes, report: report.error ? report : { ...report, error: 'no output produced' } };
    }
    return { imageBytes: correctedBytes, report };
  } catch (err) {
    console.warn('correctFaceToneAndScale failed, using original bytes', err);
    return { imageBytes: params.generatedImageBytes, report: { ...EMPTY_REPORT, error: err instanceof Error ? err.message : String(err) } };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runPythonScript(templatePath: string, generatedPath: string, outputPath: string, refPaths: string[]): Promise<FaceCorrectionReport> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_PATH, [SCRIPT_PATH, templatePath, generatedPath, outputPath, ...refPaths]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    // 30s cap — this is a local CPU subprocess doing face detection on a
    // couple of images, not a network call; if it hangs, something is
    // genuinely wrong and the caller's fail-open path (original bytes) is
    // the right answer, not an indefinitely stuck generation request.
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ ...EMPTY_REPORT, error: 'timed out' });
    }, 30_000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.warn(`face_correct.py exited ${code}: ${stderr.slice(-500)}`);
      }
      // The script prints exactly one JSON line on its last stdout line,
      // even on its own internal failure (its fail-open path still emits a
      // report) — stderr carries mediapipe's own log noise (TFLite/XNNPACK
      // init messages), which is why this parses stdout, not stderr.
      const lastLine = stdout.trim().split('\n').pop() ?? '';
      try {
        resolve(JSON.parse(lastLine) as FaceCorrectionReport);
      } catch {
        resolve({ ...EMPTY_REPORT, error: `unparseable output: ${lastLine.slice(0, 200)}` });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ ...EMPTY_REPORT, error: err.message });
    });
  });
}
