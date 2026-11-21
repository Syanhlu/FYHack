import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { buildApp } from '../apps/api/src/app';
import { SCHEMA_VERSION, type ImageRequest } from '../packages/contracts/src';

const headers = {
  authorization: 'Bearer test-image-token',
  origin: `chrome-extension://${'a'.repeat(32)}`,
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function fixture(
  options: {
    budget?: number;
    timeout?: number;
    generate?: (i: ImageRequest, s: AbortSignal) => Promise<unknown>;
  } = {},
) {
  const generate = vi.fn(
    options.generate ??
      (async (input: ImageRequest) => ({
        status: 'ready',
        reason: '',
        observations: input.images.map((i) => ({
          imageId: i.id,
          kind: 'scene',
          text: 'A bicycle is visible.',
          uncertainty: 'Ownership is unknown.',
        })),
      })),
  );
  const app = buildApp({
    provider: { generate: async () => null },
    token: 'test-image-token',
    allowedOrigin: headers.origin,
    timeoutMs: options.timeout ?? 25000,
    images: {
      provider: { generate },
      batchBudgetUsd: 0.05,
      runBudgetUsd: options.budget ?? 1,
      intervalMs: 0,
    },
  });
  apps.push(app);
  const snapshotId = crypto.randomUUID();
  const run = await app.inject({
    method: 'POST',
    url: '/v1/image-runs',
    headers,
    payload: { snapshotId },
  });
  const base = { schemaVersion: SCHEMA_VERSION, runId: run.json().runId, snapshotId };
  const batch = async (colors: number[]) => ({
    ...base,
    batchId: crypto.randomUUID(),
    images: await Promise.all(
      colors.map(async (color) => ({
        id: crypto.randomUUID(),
        dataUrl: `data:image/png;base64,${(
          await sharp({
            create: {
              width: 8,
              height: 8,
              channels: 3,
              background: { r: color * 4, g: 30, b: 90 },
            },
          })
            .png()
            .toBuffer()
        ).toString('base64')}`,
      })),
    ),
  });
  const send = (payload: unknown) =>
    app.inject({ method: 'POST', url: '/v1/analyse-images', headers, payload: payload as object });
  return { app, generate, batch, send };
}
describe('image API', () => {
  it('requires authentication and advertises optional capability', async () => {
    const { app, batch, generate } = await fixture();
    expect(
      (await app.inject({ method: 'POST', url: '/v1/analyse-images', payload: await batch([1]) }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/analyse-images',
          headers: { ...headers, origin: 'https://evil.example' },
          payload: await batch([1]),
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject({ url: '/v1/capabilities', headers })).json().images).toMatchObject({
      enabled: true,
      maxPhotos: 50,
    });
    expect(generate).not.toHaveBeenCalled();
  });
  it('decodes images, strips metadata, and returns validated references', async () => {
    const { batch, send, generate } = await fixture();
    const input = await batch([1, 2, 3]);
    const res = await send(input);
    expect(res.statusCode).toBe(200);
    expect(res.json().observations).toHaveLength(3);
    expect(res.json()).toMatchObject({ batchId: input.batchId, runId: input.runId });
    expect(generate.mock.calls[0][0].images[0].dataUrl).toMatch(/^data:image\/jpeg/);
  });
  it('rejects duplicate batches, IDs, and identical pixels before spending', async () => {
    const { batch, send, generate } = await fixture();
    const input = await batch([1]);
    expect((await send(input)).statusCode).toBe(200);
    expect((await send(input)).statusCode).toBe(409);
    expect((await send({ ...input, batchId: crypto.randomUUID() })).statusCode).toBe(409);
    expect((await send(await batch([1]))).statusCode).toBe(409);
    expect(generate).toHaveBeenCalledOnce();
  });
  it('allows exactly 50 photos in 17 batches and rejects the 51st', async () => {
    const { batch, send, generate } = await fixture();
    for (let i = 0; i < 50; i += 3) {
      expect(
        (await send(await batch(Array.from({ length: Math.min(3, 50 - i) }, (_, n) => i + n))))
          .statusCode,
      ).toBe(200);
    }
    expect((await send(await batch([51]))).statusCode).toBe(409);
    expect(generate).toHaveBeenCalledTimes(17);
    expect(generate.mock.calls[16][0].images).toHaveLength(2);
  });
  it('rejects oversized batches, unknown runs, and mismatched snapshots', async () => {
    const { batch, send, generate } = await fixture();
    expect((await send(await batch([1, 2, 3, 4]))).statusCode).toBe(400);
    expect((await send({ ...(await batch([1])), runId: crypto.randomUUID() })).statusCode).toBe(
      409,
    );
    expect(
      (await send({ ...(await batch([1])), snapshotId: crypto.randomUUID() })).statusCode,
    ).toBe(409);
    expect(generate).not.toHaveBeenCalled();
  });
  it.each(['bad-bytes', 'mime', 'large-dimensions', 'animation', 'url'])(
    'rejects %s before calling the provider',
    async (scenario) => {
      const { batch, send, generate } = await fixture();
      const input = await batch([1]);
      if (scenario === 'bad-bytes')
        input.images[0].dataUrl = 'data:image/png;base64,bm90YW5pbWFnZQ==';
      if (scenario === 'mime')
        input.images[0].dataUrl = input.images[0].dataUrl.replace('image/png', 'image/jpeg');
      if (scenario === 'url') input.images[0].dataUrl = 'http://127.0.0.1/private';
      if (scenario === 'large-dimensions')
        input.images[0].dataUrl = `data:image/png;base64,${(
          await sharp({ create: { width: 1025, height: 1, channels: 3, background: 'red' } })
            .png()
            .toBuffer()
        ).toString('base64')}`;
      if (scenario === 'animation')
        input.images[0].dataUrl = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
      expect((await send(input)).statusCode).toBe(400);
      expect(generate).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid provider references and redacts OCR', async () => {
    const invalid = await fixture({
      generate: async () => ({
        status: 'ready',
        reason: '',
        observations: [
          {
            imageId: crypto.randomUUID(),
            kind: 'scene',
            text: 'Unrelated image.',
            uncertainty: '',
          },
        ],
      }),
    });
    expect((await invalid.send(await invalid.batch([1]))).statusCode).toBe(502);
    const valid = await fixture({
      generate: async (input) => ({
        status: 'ready',
        reason: '',
        observations: [
          {
            imageId: input.images[0].id,
            kind: 'ocr',
            text: 'Contact hello@example.org for details.',
            uncertainty: '',
          },
        ],
      }),
    });
    expect((await valid.send(await valid.batch([1]))).json().observations[0].text).not.toContain(
      'hello@example.org',
    );
  });
  it('reserves failed attempts and stops at the configured cost budget', async () => {
    const { batch, send, generate } = await fixture({
      budget: 0.05,
      generate: async () => {
        throw new Error('fail');
      },
    });
    expect((await send(await batch([1]))).statusCode).toBe(503);
    expect((await send(await batch([2]))).json().error.code).toBe('COST_LIMIT');
    expect(generate).toHaveBeenCalledOnce();
  });
  it('enforces deadlines even if the provider ignores abort', async () => {
    const { batch, send } = await fixture({
      timeout: 10,
      generate: () => new Promise(() => undefined),
    });
    expect((await send(await batch([1]))).statusCode).toBe(504);
  });
  it('requires nonvisual text for generation', async () => {
    const { app } = await fixture();
    const { request } = await import('./helpers');
    const input = request();
    input.profile.evidence = [
      {
        id: 'v1',
        sourceKind: 'visual',
        attribution: 'visual_observation',
        sourceImageId: crypto.randomUUID(),
        observationKind: 'scene',
        sectionLabel: 'Photo',
        text: 'A bicycle is visible in the photo.',
      },
    ];
    const res = await app.inject({ method: 'POST', url: '/v1/analyse', headers, payload: input });
    expect(res.json().status).toBe('insufficient');
  });
});

describe('image run lifecycle', () => {
  it('expires server-created runs without reusing their allowance', async () => {
    const { batch, send, generate } = await fixture();
    const input = await batch([1]);
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 60 * 1000);
    try {
      expect((await send(input)).json().error.code).toBe('RUN_EXPIRED');
    } finally {
      clock.mockRestore();
    }
    expect(generate).not.toHaveBeenCalled();
  });
  it('serializes provider calls even for different batches', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const { batch, send, generate } = await fixture({
      generate: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    const first = await batch([1]);
    const pending = send(first);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    expect((await send(await batch([2]))).statusCode).toBe(429);
    resolve({ status: 'insufficient', reason: 'No supported details.', observations: [] });
    expect((await pending).statusCode).toBe(200);
  });
  it('keeps the image body limit bounded', async () => {
    const { send, generate } = await fixture();
    expect((await send({ data: 'a'.repeat(6 * 1024 * 1024) })).statusCode).toBe(413);
    expect(generate).not.toHaveBeenCalled();
  });
});
