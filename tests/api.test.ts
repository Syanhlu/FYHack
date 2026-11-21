import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../apps/api/src/app';
import { serverModes } from '../apps/api/src/modes';
import { request, output } from './helpers';

const token = 'test-only-local-token-not-a-real-credential';
const origin = `chrome-extension://${'a'.repeat(32)}`;
const headers = { authorization: `Bearer ${token}`, origin };
const apps: ReturnType<typeof buildApp>[] = [];
function make(options: Partial<Parameters<typeof buildApp>[0]> = {}) {
  const generate = vi.fn(async (mode: { id: string }) => output(mode.id));
  const app = buildApp({ token, allowedOrigin: origin, provider: { generate }, ...options });
  apps.push(app);
  return { app, generate };
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe('local API', () => {
  it('requires a token and rejects unexpected origins', async () => {
    const { app, generate } = make();
    expect(
      (await app.inject({ method: 'POST', url: '/v1/analyse', payload: request() })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/analyse',
          headers: { ...headers, origin: 'https://example.com' },
          payload: request(),
        })
      ).statusCode,
    ).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });
  it('serves a matching live envelope through the provider interface', async () => {
    const { app, generate } = make();
    const input = request();
    const res = await app.inject({ method: 'POST', url: '/v1/analyse', headers, payload: input });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      requestId: input.requestId,
      snapshotId: input.profile.snapshotId,
      mode: 'outreach',
      provider: 'live',
      status: 'ready',
    });
    expect(generate).toHaveBeenCalledOnce();
  });
  it('registers another mode without changing endpoint orchestration', async () => {
    const mentorship = { ...serverModes.outreach, id: 'mentorship' };
    const { app } = make({ modes: { ...serverModes, mentorship } });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/analyse',
      headers,
      payload: request('mentorship'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().mode).toBe('mentorship');
  });
  it.each(['missing-declaration', 'minor', 'boundary'])(
    'blocks %s before calling the provider',
    async (scenario) => {
      const { app, generate } = make();
      const input = request('romantic');
      if (scenario === 'missing-declaration') input.modeConfig.adultConfirmedBoth = false;
      if (scenario === 'minor') input.profile.evidence[0].text = 'I am 16 and love pottery.';
      if (scenario === 'boundary') input.profile.evidence[0].text = 'I am not looking to date.';
      const res = await app.inject({ method: 'POST', url: '/v1/analyse', headers, payload: input });
      expect(res.json().status).toBe('blocked');
      expect(generate).not.toHaveBeenCalled();
    },
  );
  it('preserves an underage signal even when the associated snippet was removed', async () => {
    const { app, generate } = make();
    const input = request('romantic');
    input.profile.eligibilitySignals.minorMentioned = true;
    const res = await app.inject({ method: 'POST', url: '/v1/analyse', headers, payload: input });
    expect(res.json().status).toBe('blocked');
    expect(generate).not.toHaveBeenCalled();
  });
  it('returns insufficient for sparse evidence', async () => {
    const { app, generate } = make();
    const input = request();
    input.profile.evidence = [];
    const res = await app.inject({ method: 'POST', url: '/v1/analyse', headers, payload: input });
    expect(res.json().status).toBe('insufficient');
    expect(generate).not.toHaveBeenCalled();
  });
  it('rejects invalid model citations without returning the raw output', async () => {
    const { app } = make({
      provider: {
        generate: async () => ({ ...output('outreach'), result: 'secret-provider-output' }),
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/analyse',
      headers,
      payload: request(),
    });
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain('secret-provider-output');
  });
  it('enforces a real deadline even if the provider ignores its abort signal', async () => {
    const { app } = make({
      timeoutMs: 10,
      provider: { generate: () => new Promise(() => undefined) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/analyse',
      headers,
      payload: request(),
    });
    expect(res.statusCode).toBe(504);
  });
  it('rate limits analyses without sending extra paid requests', async () => {
    const { app, generate } = make({ rateLimit: 1 });
    await app.inject({ method: 'POST', url: '/v1/analyse', headers, payload: request() });
    expect(
      (await app.inject({ method: 'POST', url: '/v1/analyse', headers, payload: request() }))
        .statusCode,
    ).toBe(429);
    expect(generate).toHaveBeenCalledOnce();
  });
  it('rejects version mismatches and oversized bodies', async () => {
    const { app } = make();
    const input = request();
    input.schemaVersion = '2';
    expect(
      (await app.inject({ method: 'POST', url: '/v1/analyse', headers, payload: input }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/analyse',
          headers: { ...headers, 'content-type': 'application/json' },
          payload: JSON.stringify({ huge: 'x'.repeat(600000) }),
        })
      ).statusCode,
    ).toBe(413);
  });
  it('accepts expanded LinkedIn evidence including multibyte text', async () => {
    const { app, generate } = make();
    const input = request();
    for (let index = 0; index < 99; index++) {
      input.profile.evidence.push({
        ...input.profile.evidence[0],
        id: `extra${index}`,
        text: '研究'.repeat(250),
      });
    }
    const result = await app.inject({
      method: 'POST',
      url: '/v1/analyse',
      headers,
      payload: input,
    });
    expect(result.statusCode).toBe(200);
    expect(generate).toHaveBeenCalledOnce();
  });
});
