import {
  SCHEMA_VERSION,
  IMAGE_LIMIT,
  IMAGE_BATCH_SIZE,
  imageResponseSchema,
  type LocalSnapshot,
  type Evidence,
  type ImageObservation,
  type PhotoSubject,
} from '@profile-lens/contracts';
import type { PhotoCandidate, PhotoScan } from '../extraction/images';
import { isCurrent } from './browser';
import { keepPhotoPreview } from './photo-previews';
import { API_BASE, checkConnection } from './backend';

export type PhotoReview = {
  id: string;
  thumbnail: string;
  observations: ImageObservation[];
  subject?: PhotoSubject;
};
export type PhotoSkipReason = { reason: string; count: number };
const scaled = (source: HTMLCanvasElement, longest: number, quality: number) => {
  const ratio = Math.min(1, longest / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * ratio));
  canvas.height = Math.max(1, Math.round(source.height * ratio));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  canvas.width = canvas.height = 0;
  return dataUrl;
};
const BUSY_WAIT_LIMIT_MS = 120000;
class PhotoRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}
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
  if (!response.ok)
    throw new PhotoRequestError(
      data.error?.message ?? 'Photo analysis failed.',
      response.status,
      data.error?.code,
      typeof data.error?.retryAfterMs === 'number' &&
        Number.isFinite(data.error.retryAfterMs) &&
        data.error.retryAfterMs > 0
        ? data.error.retryAfterMs
        : undefined,
    );
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
  const thumbnail = scaled(canvas, 160, 0.65);
  const preview = scaled(canvas, 512, 0.8);
  canvas.width = canvas.height = 0;
  return { dataUrl, thumbnail, preview };
}
export async function analyseProfileImages(
  snapshot: LocalSnapshot,
  token: string,
  signal: AbortSignal,
  onBatch: (photos: PhotoReview[], count: number) => void,
  operations: {
    crop: (
      ...args: Parameters<typeof cropPhoto>
    ) => Promise<{ dataUrl: string; thumbnail: string; preview?: string }>;
    wait: typeof delay;
  } = { crop: cropPhoto, wait: delay },
  onProgress?: (message: string, skips: PhotoSkipReason[]) => void,
  maxPhotos: number = IMAGE_LIMIT,
  onPostText?: (evidence: Evidence[]) => void,
): Promise<string> {
  if (!Number.isInteger(maxPhotos) || maxPhotos < 1 || maxPhotos > IMAGE_LIMIT)
    throw new Error(`Choose a photo limit between 1 and ${IMAGE_LIMIT}.`);
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
  const capturedPosts = new Set<string>();
  let textCount = snapshot.profile.evidence.filter((e) => e.sourceKind !== 'visual').length;
  let textCharacters = snapshot.profile.evidence
    .filter((e) => e.sourceKind !== 'visual')
    .reduce((n, e) => n + e.text.length, 0);
  const capturePostText = (scan: PhotoScan) => {
    const post = scan.postText;
    if (!onPostText || !post?.text || capturedPosts.has(post.path)) return;
    capturedPosts.add(post.path);
    const evidence: Evidence[] = [];
    for (
      let offset = 0;
      offset < post.text.length && textCount < 120 && textCharacters < 60000;
      offset += 600
    ) {
      const text = post.text.slice(offset, offset + Math.min(600, 60000 - textCharacters));
      evidence.push({
        id: `p${crypto.randomUUID()}`,
        text,
        sourceKind: 'post',
        attribution: 'profile_owner',
        sectionLabel: 'Instagram post caption',
      });
      textCount++;
      textCharacters += text.length;
    }
    if (evidence.length) onPostText(evidence);
  };
  const captureAttempts = new Map<string, number>();
  const seen = new Set<string>(),
    sources = new Set<string>();
  let batch: { id: string; dataUrl: string; thumbnail: string; preview?: string }[] = [];
  let reason = 'Reached the discovery limit.';
  const skipReasons = new Map<string, number>();
  const skipSummary = () =>
    skipReasons.size
      ? ` Skip reasons: ${[...skipReasons].map(([reason, n]) => `${n} × ${reason}`).join(' ')}`
      : '';
  const progress = (phase: string) =>
    onProgress?.(
      `${count} / ${maxPhotos} photos analysed · ${captured} captured · ${skipped} skipped. ${phase}`,
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
    const batchId = crypto.randomUUID();
    // Keep only this batch in memory while busy; preserve IDs and pixels on retry.
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      runId: run.runId,
      batchId,
      snapshotId: snapshot.profile.snapshotId,
      images: batch.map(({ id, dataUrl }) => ({ id, dataUrl })),
    };
    let waitedMs = 0,
      retries = 0,
      busySince: number | undefined;
    const buffered = async () => {
      while (true) {
        await current();
        if ((await command('scan')).stopped)
          throw new Error('Photo capture stopped after page interaction.');
        progress(`Analysing ${batch.length} captured photo${batch.length === 1 ? '' : 's'}…`);
        lastBatch = Date.now();
        try {
          return imageResponseSchema.parse(
            await post(
              '/v1/analyse-images',
              payload,
              token,
              AbortSignal.any([signal, AbortSignal.timeout(65000)]),
            ),
          );
        } catch (error) {
          // Never retry a timeout, network failure or provider error: the batch may
          // already have been billed. Busy responses explicitly precede acceptance.
          if (
            !(error instanceof PhotoRequestError) ||
            error.status !== 429 ||
            error.code !== 'PHOTO_ANALYSIS_BUSY'
          )
            throw error;
          signal.throwIfAborted();
          busySince ??= Date.now();
          const remaining = BUSY_WAIT_LIMIT_MS - Math.max(waitedMs, Date.now() - busySince);
          if (remaining <= 0 || (error.retryAfterMs ?? 0) > remaining)
            throw new Error(
              'Photo analysis is still busy after waiting. Completed observations are available; try a fresh run later.',
              { cause: error },
            );
          const waitMs = Math.min(
            remaining,
            Math.max(error.retryAfterMs ?? 0, Math.min(5000 * 2 ** retries, 30000)),
          );
          const retryAt = Date.now() + waitMs;
          const waiting = () =>
            progress(
              `Photo analysis is busy. Keeping ${batch.length} captured photo${batch.length === 1 ? '' : 's'} and retrying in ${Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))}s… You can still Stop.`,
            );
          waiting();
          const countdown = setInterval(waiting, 1000);
          try {
            await operations.wait(waitMs, signal);
          } finally {
            clearInterval(countdown);
          }
          waitedMs += waitMs;
          retries++;
        }
      }
    };
    const response = await buffered();
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
    for (const photo of batch) keepPhotoPreview(photo.id, photo.preview ?? photo.thumbnail);
    onBatch(
      batch.map((p) => ({
        id: p.id,
        thumbnail: p.thumbnail,
        observations: response.observations.filter((o) => o.imageId === p.id),
        subject: response.subjects.find((s) => s.imageId === p.id)?.subject,
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
      count + batch.length < maxPhotos &&
      advances < 250 &&
      seen.size < 200 &&
      discoveryMs < 300000
    ) {
      let started = Date.now();
      await current();
      const scan = await command('scan');
      if (scan.stopped) throw new Error('Photo capture stopped after page interaction.');
      capturePostText(scan);
      if (!scan.candidates.length && !scan.end)
        skip(scan.skipReason ?? 'No capturable photo was found in this post.');
      for (const candidate of scan.candidates) {
        if (count + batch.length >= maxPhotos || seen.size >= 200) break;
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
      if (count + batch.length >= maxPhotos) {
        reason = `Reached the ${maxPhotos}-photo limit.`;
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
    message = `${count} / ${maxPhotos} photos analysed · ${captured} captured · ${skipped} skipped. ${reason}${skipSummary()}`;
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
