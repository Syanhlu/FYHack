import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  IMAGE_LIMIT,
  IMAGE_BATCH_INTERVAL_MS,
  SESSION_TTL,
  imageRequestSchema,
  imageOutcomeSchema,
  redactText,
  type ImageRequest,
} from '@profile-lens/contracts';
import { ProviderFailure } from './providers/live';

export interface ImageProvider {
  generate(input: ImageRequest, signal: AbortSignal): Promise<unknown>;
}
export interface ImageOptions {
  provider: ImageProvider;
  // Deployment-configured conservative reservation, not a provider billing guarantee.
  batchBudgetUsd: number;
  runBudgetUsd: number;
  intervalMs?: number;
}
export async function validateImage(dataUrl: string) {
  const [prefix, base64] = dataUrl.split(',');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 1024 * 1024 || bytes.toString('base64') !== base64)
    throw new Error('Invalid image bytes.');
  const image = sharp(bytes, { limitInputPixels: 1024 * 1024, failOn: 'warning' });
  const meta = await image.metadata();
  if (
    !['png', 'jpeg', 'webp'].includes(meta.format ?? '') ||
    prefix !== `data:image/${meta.format};base64` ||
    !meta.width ||
    !meta.height ||
    meta.width > 1024 ||
    meta.height > 1024 ||
    (meta.pages ?? 1) !== 1
  )
    throw new Error('Unsupported image format or dimensions.');
  // Decode fully; metadata alone does not establish valid pixel data. Strip metadata again.
  const normalized = await image.jpeg({ quality: 80 }).toBuffer();
  return {
    dataUrl: `data:image/jpeg;base64,${normalized.toString('base64')}`,
    hash: createHash('sha256').update(normalized).digest('hex'),
  };
}
export function registerImageRoutes(
  app: FastifyInstance,
  options?: ImageOptions,
  timeoutMs = 25000,
) {
  if (
    options &&
    ![options.batchBudgetUsd, options.runBudgetUsd].every((n) => Number.isFinite(n) && n > 0)
  )
    throw new Error('Image budgets must be positive finite dollar amounts.');
  type Run = {
    snapshotId: string;
    expires: number;
    ids: Set<string>;
    hashes: Set<string>;
    batches: Set<string>;
    reserved: number;
  };
  const runs = new Map<string, Run>();
  let inFlight = false;
  let lastCall = -Infinity;
  const starts: number[] = [];
  const error = (code: string, message: string) => ({ error: { code, message } });
  const prune = () => {
    for (const [id, run] of runs) if (run.expires <= Date.now()) runs.delete(id);
  };
  app.post('/v1/image-runs', async (request, reply) => {
    if (!options)
      return reply
        .code(503)
        .send(error('IMAGES_DISABLED', 'Image analysis is not enabled on this backend.'));
    const input = z.object({ snapshotId: z.string().uuid() }).strict().safeParse(request.body);
    if (!input.success)
      return reply.code(400).send(error('INVALID_INPUT', 'A current profile is required.'));
    prune();
    while (starts.length && starts[0] <= Date.now() - 60000) starts.shift();
    if (runs.size >= 20 || starts.length >= 5)
      return reply.code(429).send(error('RATE_LIMITED', 'Wait before starting another photo run.'));
    starts.push(Date.now());
    const runId = randomUUID();
    runs.set(runId, {
      snapshotId: input.data.snapshotId,
      expires: Date.now() + SESSION_TTL,
      ids: new Set(),
      hashes: new Set(),
      batches: new Set(),
      reserved: 0,
    });
    return {
      runId,
      batchIntervalMs: Math.max(
        IMAGE_BATCH_INTERVAL_MS,
        options.intervalMs ?? IMAGE_BATCH_INTERVAL_MS,
      ),
    };
  });
  app.post('/v1/analyse-images', { bodyLimit: 5 * 1024 * 1024 }, async (request, reply) => {
    if (!options)
      return reply
        .code(503)
        .send(error('IMAGES_DISABLED', 'Image analysis is not enabled on this backend.'));
    const parsed = imageRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send(error('INVALID_INPUT', 'Send one to three valid image crops.'));
    const input = parsed.data;
    prune();
    const run = runs.get(input.runId);
    if (!run || run.snapshotId !== input.snapshotId)
      return reply
        .code(409)
        .send(error('RUN_EXPIRED', 'This photo run expired or belongs to another profile.'));
    if (run.batches.has(input.batchId) || input.images.some((i) => run.ids.has(i.id)))
      return reply
        .code(409)
        .send(error('DUPLICATE_BATCH', 'These images or this batch were already submitted.'));
    if (run.ids.size + input.images.length > IMAGE_LIMIT || run.batches.size >= 17)
      return reply.code(409).send(error('RUN_LIMIT', 'The 50-photo run limit has been reached.'));
    if (run.reserved + options.batchBudgetUsd > options.runBudgetUsd + 1e-9)
      return reply
        .code(409)
        .send(error('COST_LIMIT', 'The configured photo-run budget has been reached.'));
    const cooldownMs = (options.intervalMs ?? IMAGE_BATCH_INTERVAL_MS) - (Date.now() - lastCall);
    if (inFlight || cooldownMs > 0) {
      const retryAfterMs = Math.ceil(Math.max(inFlight ? 5000 : 1000, cooldownMs));
      return reply
        .code(429)
        .header('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
        .send({
          error: {
            // No provider call or reservation has happened for this batch. Only this
            // distinct response is safe for the extension to retry automatically.
            code: 'PHOTO_ANALYSIS_BUSY',
            message: 'Photo analysis is busy. This batch can be retried shortly.',
            retryAfterMs,
          },
        });
    }
    inFlight = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const disconnect = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.on('close', disconnect);
    try {
      const hashes = new Set<string>();
      try {
        for (const image of input.images) {
          const checked = await validateImage(image.dataUrl);
          if (hashes.has(checked.hash) || run.hashes.has(checked.hash))
            return reply.code(409).send(error('DUPLICATE_IMAGE', 'A photo was already submitted.'));
          hashes.add(checked.hash);
          image.dataUrl = checked.dataUrl;
        }
      } catch {
        return reply
          .code(400)
          .send(
            error(
              'INVALID_IMAGE',
              'Image crops must be valid, single-frame JPEG, PNG or WebP, at most 1024 pixels and 1 MiB.',
            ),
          );
      }
      if (controller.signal.aborted) throw new Error('Disconnected');
      // Reserve attempts and estimated spend before calling the provider, including failures.
      run.batches.add(input.batchId);
      input.images.forEach((i) => run.ids.add(i.id));
      hashes.forEach((hash) => run.hashes.add(hash));
      run.reserved += options.batchBudgetUsd;
      lastCall = Date.now();
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new ProviderFailure(
              'ANALYSIS_TIMEOUT',
              504,
              'Photo analysis timed out. Completed observations are still available.',
            ),
          );
        }, timeoutMs);
      });
      const raw = await Promise.race([
        options.provider.generate(input, controller.signal),
        deadline,
      ]);
      const result = imageOutcomeSchema.safeParse(raw);
      if (
        !result.success ||
        result.data.observations.some((o) => !input.images.some((i) => i.id === o.imageId)) ||
        (result.data.status !== 'ready' &&
          (result.data.observations.length || !result.data.reason.trim()))
      )
        throw new ProviderFailure(
          'MODEL_OUTPUT_INVALID',
          502,
          'Image observations could not be verified.',
        );
      return {
        ...result.data,
        observations: result.data.observations.map((o) => ({
          ...o,
          text: redactText(o.text),
          uncertainty: redactText(o.uncertainty),
        })),
        runId: input.runId,
        batchId: input.batchId,
        snapshotId: input.snapshotId,
      };
    } catch (e) {
      const failure =
        e instanceof ProviderFailure
          ? e
          : new ProviderFailure(
              'PROVIDER_UNAVAILABLE',
              503,
              'Photo analysis is unavailable. Check the configured image model.',
            );
      return reply.code(failure.status).send(error(failure.code, failure.message));
    } finally {
      clearTimeout(timer);
      reply.raw.off('close', disconnect);
      inFlight = false;
    }
  });
  app.addHook('onClose', async () => {
    runs.clear();
    starts.length = 0;
  });
}
