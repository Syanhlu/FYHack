import {
  SCHEMA_VERSION,
  IMAGE_LIMIT,
  IMAGE_BATCH_SIZE,
  imageResponseSchema,
  type LocalSnapshot,
  type ImageObservation,
} from '@profile-lens/contracts';
import type { PhotoCandidate, PhotoScan } from '../extraction/images';
import { isCurrent } from './browser';
import { API_BASE, checkConnection } from './backend';

export type PhotoReview = {
  id: string;
  thumbnail: string;
  observations: ImageObservation[];
};
export type PhotoSkipReason = { reason: string; count: number };
export function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const stop = () => {
      clearTimeout(timer);
      reject(new DOMException('Stopped', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop);
      resolve();
    }, ms);
    signal.addEventListener('abort', stop, { once: true });
  });
}
async function post(path: string, body: unknown, token: string, signal: AbortSignal) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    credentials: 'omit',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'Photo analysis failed.');
  return data;
}
export function sameCapture(a: PhotoScan, b: PhotoScan, photo: PhotoCandidate) {
  const found = b.candidates.find((p) => p.key === photo.key);
  return (
    !b.stopped &&
    a.width === b.width &&
    a.height === b.height &&
    a.scale === b.scale &&
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY &&
    !!found &&
    found.source === photo.source &&
    (['x', 'y', 'width', 'height'] as const).every((key) => Math.abs(found[key] - photo[key]) <= 2)
  );
}
export function intersectCaptures(
  photo: PhotoCandidate,
  before: PhotoScan,
  after: PhotoScan,
): PhotoCandidate {
  const samples = [
    photo,
    before.candidates.find((p) => p.key === photo.key)!,
    after.candidates.find((p) => p.key === photo.key)!,
  ];
  const x = Math.max(...samples.map((p) => p.x));
  const y = Math.max(...samples.map((p) => p.y));
  return {
    ...photo,
    x,
    y,
    width: Math.min(...samples.map((p) => p.x + p.width)) - x,
    height: Math.min(...samples.map((p) => p.y + p.height)) - y,
  };
}
export async function cropPhoto(screenshot: string, scan: PhotoScan, photo: PhotoCandidate) {
  // Read PNG dimensions before decoding the transient viewport bitmap.
  const head = atob(screenshot.split(',')[1]!.slice(0, 48));
  const view = new DataView(Uint8Array.from(head, (c) => c.charCodeAt(0)).buffer);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (!width || !height || width * height > 20000000)
    throw new Error('This viewport is too large to capture safely.');
  const image = new Image();
  image.src = screenshot;
  await image.decode();
  const sx = image.naturalWidth / scan.width,
    sy = image.naturalHeight / scan.height;
  if (Math.abs(sx - sy) > 0.05) throw new Error('Viewport scaling changed during capture.');
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 1024 / Math.max(photo.width * sx, photo.height * sy));
  canvas.width = Math.max(1, Math.floor(photo.width * sx * ratio));
  canvas.height = Math.max(1, Math.floor(photo.height * sy * ratio));
  const context = canvas.getContext('2d')!;
  context.drawImage(
    image,
    photo.x * sx,
    photo.y * sy,
    photo.width * sx,
    photo.height * sy,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  image.src = '';
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  if (dataUrl.length > 1398127) throw new Error('This photo crop exceeds the size limit.');
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(
    1,
    Math.round(canvas.width * Math.min(1, 160 / Math.max(canvas.width, canvas.height))),
  );
  thumb.height = Math.max(
    1,
    Math.round(canvas.height * Math.min(1, 160 / Math.max(canvas.width, canvas.height))),
  );
  thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumb.width, thumb.height);
  const thumbnail = thumb.toDataURL('image/jpeg', 0.65);
  canvas.width = canvas.height = thumb.width = thumb.height = 0;
  return { dataUrl, thumbnail };
}
export async function analyseProfileImages(
  snapshot: LocalSnapshot,
  token: string,
  signal: AbortSignal,
  onBatch: (photos: PhotoReview[], count: number) => void,
  operations = { crop: cropPhoto, wait: delay },
  onProgress?: (message: string, skips: PhotoSkipReason[]) => void,
): Promise<string> {
  if (snapshot.tabId === null || snapshot.adapterId !== 'instagram-best-effort')
    throw new Error('Read an Instagram profile first.');
  const caps = await checkConnection(token);
  signal.throwIfAborted();
  if (caps.schemaVersion !== SCHEMA_VERSION || !caps.images?.enabled)
    throw new Error('Enable image analysis on a matching backend first.');
  const current = async () => {
    signal.throwIfAborted();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (
      !tab ||
      tab.id !== snapshot.tabId ||
      !(await chrome.windows.get(tab.windowId)).focused ||
      !(await isCurrent(snapshot))
    )
      throw new Error('Photo capture stopped because the active profile or window changed.');
    signal.throwIfAborted();
    return tab;
  };
  let captureId = '';
  const command = async (action: string): Promise<PhotoScan> => {
    const result = await chrome.tabs.sendMessage(snapshot.tabId!, {
      type: 'PROFILE_LENS_PHOTOS',
      snapshotId: snapshot.profile.snapshotId,
      action,
      captureId,
    });
    if (!result || result.error) throw new Error(result?.error ?? 'Photo capture is unavailable.');
    return result;
  };
  await current();
  const run = (await post(
    '/v1/image-runs',
    { snapshotId: snapshot.profile.snapshotId },
    token,
    signal,
  )) as { runId: string; batchIntervalMs: number };
  captureId = run.runId;
  let count = 0,
    captured = 0,
    skipped = 0,
    advances = 0,
    discoveryMs = 0,
    lastCapture = 0,
    lastBatch = 0;
  const captureAttempts = new Map<string, number>();
  const seen = new Set<string>(),
    sources = new Set<string>();
  let batch: { id: string; dataUrl: string; thumbnail: string }[] = [];
  let reason = 'Reached the discovery limit.';
  const skipReasons = new Map<string, number>();
  const skipSummary = () =>
    skipReasons.size
      ? ` Skip reasons: ${[...skipReasons].map(([reason, n]) => `${n} × ${reason}`).join(' ')}`
      : '';
  const progress = (phase: string) =>
    onProgress?.(
      `${count} / 50 photos analysed · ${captured} captured · ${skipped} skipped. ${phase}`,
      [...skipReasons].map(([reason, count]) => ({ reason, count })),
    );
  const skip = (reason: string) => {
    skipped++;
    skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
    progress('Looking for the next photo…');
  };
  const submit = async () => {
    if (!batch.length) return;
    await operations.wait(Math.max(0, run.batchIntervalMs - (Date.now() - lastBatch)), signal);
    await current();
    if ((await command('scan')).stopped)
      throw new Error('Photo capture stopped after page interaction.');
    progress(`Analysing ${batch.length} captured photo${batch.length === 1 ? '' : 's'}…`);
    const batchId = crypto.randomUUID();
    lastBatch = Date.now();
    const response = imageResponseSchema.parse(
      await post(
        '/v1/analyse-images',
        {
          schemaVersion: SCHEMA_VERSION,
          runId: run.runId,
          batchId,
          snapshotId: snapshot.profile.snapshotId,
          images: batch.map(({ id, dataUrl }) => ({ id, dataUrl })),
        },
        token,
        AbortSignal.any([signal, AbortSignal.timeout(65000)]),
      ),
    );
    await current();
    if ((await command('scan')).stopped)
      throw new Error('Photo capture stopped after page interaction.');
    if (
      response.runId !== run.runId ||
      response.batchId !== batchId ||
      response.snapshotId !== snapshot.profile.snapshotId ||
      response.observations.some((o) => !batch.some((p) => p.id === o.imageId))
    )
      throw new Error('Photo response did not match this batch.');
    if (response.status === 'blocked') throw new Error(response.reason);
    count += batch.length;
    onBatch(
      batch.map((p) => ({
        id: p.id,
        thumbnail: p.thumbnail,
        observations: response.observations.filter((o) => o.imageId === p.id),
      })),
      count,
    );
    batch = [];
    progress('Analysis returned. Looking for more photos…');
  };
  let captureFailure: unknown;
  let message = '';
  try {
    progress('Opening the first post…');
    await command('begin');
    while (
      count + batch.length < IMAGE_LIMIT &&
      advances < 250 &&
      seen.size < 200 &&
      discoveryMs < 300000
    ) {
      let started = Date.now();
      await current();
      const scan = await command('scan');
      if (scan.stopped) throw new Error('Photo capture stopped after page interaction.');
      if (!scan.candidates.length && !scan.end)
        skip(scan.skipReason ?? 'No capturable photo was found in this post.');
      for (const candidate of scan.candidates) {
        if (count + batch.length >= IMAGE_LIMIT || seen.size >= 200) break;
        if (seen.has(candidate.key)) continue;
        const attempt = (captureAttempts.get(candidate.key) ?? 0) + 1;
        captureAttempts.set(candidate.key, attempt);
        if (attempt >= 3) seen.add(candidate.key);
        if (sources.has(candidate.source)) {
          seen.add(candidate.key);
          skip('Duplicate photo.');
          continue;
        }
        await operations.wait(Math.max(0, 600 - (Date.now() - lastCapture)), signal);
        const tab = await current();
        const before = await command('scan');
        if (!sameCapture(scan, before, candidate)) {
          if (attempt >= 3)
            skip(before.skipReason ?? 'The photo kept moving or changing before capture.');
          else {
            progress('Waiting for the photo to stop moving…');
            await operations.wait(250, signal);
          }
          continue;
        }
        lastCapture = Date.now();
        let screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        await current();
        const after = await command('scan');
        if (!sameCapture(before, after, candidate)) {
          screenshot = '';
          if (attempt >= 3)
            skip(after.skipReason ?? 'The photo kept moving or changing during capture.');
          else {
            progress('Waiting for the photo to stop moving…');
            await operations.wait(250, signal);
          }
          continue;
        }
        const crop = await operations.crop(
          screenshot,
          before,
          intersectCaptures(candidate, before, after),
        );
        screenshot = '';
        batch.push({ id: crypto.randomUUID(), ...crop });
        sources.add(candidate.source);
        seen.add(candidate.key);
        captured++;
        progress('Photo captured. Preparing the next batch…');
        if (batch.length === IMAGE_BATCH_SIZE) {
          discoveryMs += Date.now() - started;
          await submit();
          started = Date.now();
          // Start a fresh scan after analysis; do not use old viewport geometry.
          break;
        }
      }
      discoveryMs += Date.now() - started;
      if (count + batch.length >= IMAGE_LIMIT) {
        reason = 'Reached the 50-photo limit.';
        break;
      }
      // Re-scan the same viewport if a batch was submitted before all candidates were visited.
      if (scan.candidates.some((p) => !seen.has(p.key))) continue;
      if (scan.end) {
        reason = 'Reached the end of the available profile posts.';
        break;
      }
      const navigationStarted = Date.now();
      progress('Opening the next photo…');
      await command('advance');
      advances++;
      discoveryMs += Date.now() - navigationStarted;
    }
    await submit();
    message = `${count} / 50 photos analysed · ${captured} captured · ${skipped} skipped. ${reason}${skipSummary()}`;
  } catch (error) {
    captureFailure = error;
  } finally {
    batch = [];
    try {
      await command('end');
    } catch (cleanupError) {
      captureFailure =
        captureFailure instanceof Error
          ? new Error(
              `${captureFailure.message} Returning to the profile also failed: ${cleanupError instanceof Error ? cleanupError.message : 'Close the post manually.'}`,
              { cause: cleanupError },
            )
          : cleanupError;
    }
  }
  if (captureFailure) {
    if (skipReasons.size && captureFailure instanceof Error)
      throw new Error(`${captureFailure.message}${skipSummary()}`, { cause: captureFailure });
    throw captureFailure;
  }
  return message;
}
