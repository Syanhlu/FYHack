import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyseProfileImages,
  sameCapture,
  intersectCaptures,
} from '../apps/extension/src/services/images';
import { SCHEMA_VERSION, manualProfile, type LocalSnapshot } from '../packages/contracts/src';
import type { PhotoScan } from '../apps/extension/src/extraction/images';

afterEach(() => vi.unstubAllGlobals());
function setup(total: number) {
  const panel = {};
  vi.stubGlobal('window', Object.assign(panel, { top: panel }));
  const snapshot: LocalSnapshot = {
    profile: manualProfile('I enjoy art and outdoor activities.'),
    tabId: 1,
    adapterId: 'instagram-best-effort',
    routeFingerprint: 'x',
    canonicalDisplayUrl: 'https://www.instagram.com/alex/',
    capturedAt: new Date().toISOString(),
    inputRevision: 0,
  };
  let page = 0;
  const scan = (): PhotoScan => ({
    width: 1000,
    height: 800,
    scale: 1,
    scrollX: 0,
    scrollY: page * 500,
    stopped: false,
    end: (page + 1) * 3 >= total,
    candidates: Array.from({ length: Math.min(3, Math.max(0, total - page * 3)) }, (_, n) => ({
      key: `/p/${page * 3 + n}`,
      source: `image-${page * 3 + n}`,
      x: n * 100,
      y: 20,
      width: 100,
      height: 100,
    })),
  });
  const screenshot = vi.fn(async () => 'screenshot-local-only');
  const sendMessage = vi.fn(async (_: number, message: { type: string; action: string }) => {
    if (message.type === 'PROFILE_LENS_IDENTITY') return { current: true };
    if (message.action === 'advance') page++;
    return scan();
  });
  vi.stubGlobal('chrome', {
    storage: { session: { get: vi.fn(async () => ({})) } },
    tabs: {
      query: vi.fn(async () => [{ id: 1, windowId: 1 }]),
      sendMessage,
      captureVisibleTab: screenshot,
    },
    windows: { get: vi.fn(async () => ({ focused: true })) },
  });
  const batches: { images: { id: string; dataUrl: string }[] }[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const input = JSON.parse(String(init?.body ?? '{}'));
    if (url.endsWith('/capabilities'))
      return Response.json({ schemaVersion: SCHEMA_VERSION, images: { enabled: true } });
    if (url.endsWith('/image-runs'))
      return Response.json({ runId: crypto.randomUUID(), batchIntervalMs: 7000 });
    batches.push(input);
    return Response.json({
      runId: input.runId,
      batchId: input.batchId,
      snapshotId: input.snapshotId,
      status: 'ready',
      reason: '',
      observations: input.images.map((i: { id: string }) => ({
        imageId: i.id,
        kind: 'scene',
        text: 'A bicycle is visible.',
        uncertainty: '',
      })),
    });
  });
  vi.stubGlobal('fetch', fetch);
  const operations = {
    wait: vi.fn(async (_ms: number, signal: AbortSignal) => signal.throwIfAborted()),
    crop: vi.fn(async () => ({ dataUrl: 'cropped-image-only', thumbnail: 'small-thumbnail' })),
  };
  return { snapshot, screenshot, batches, operations, sendMessage, fetch };
}
describe('automatic photo runs', () => {
  it('buffers the same batch through busy responses, then continues without recapturing photos', async () => {
    const { snapshot, screenshot, batches, operations, fetch } = setup(4);
    const original = fetch.getMockImplementation()!;
    const attempts: string[] = [];
    fetch.mockImplementation(async (url, init) => {
      if (url.endsWith('/analyse-images')) {
        attempts.push(String(init?.body));
        if (attempts.length <= 2)
          return Response.json(
            {
              error: {
                code: 'PHOTO_ANALYSIS_BUSY',
                message: 'Busy',
                retryAfterMs: attempts.length === 1 ? 12000 : 2000,
              },
            },
            { status: 429 },
          );
      }
      return original(url, init);
    });
    const receive = vi.fn();
    const progress = vi.fn();
    const message = await analyseProfileImages(
      snapshot,
      'token',
      new AbortController().signal,
      receive,
      operations,
      progress,
    );
    expect(attempts[0]).toBe(attempts[1]);
    expect(attempts[1]).toBe(attempts[2]);
    expect(attempts).toHaveLength(4);
    expect(operations.wait.mock.calls.some(([ms]) => ms === 12000)).toBe(true);
    expect(operations.wait.mock.calls.some(([ms]) => ms === 10000)).toBe(true);
    expect(screenshot).toHaveBeenCalledTimes(4);
    expect(batches.flatMap((batch) => batch.images)).toHaveLength(4);
    expect(receive.mock.calls.map(([, count]) => count)).toEqual([3, 4]);
    expect(
      progress.mock.calls.some(([text]) =>
        text.includes('Keeping 3 captured photos and retrying in 12s'),
      ),
    ).toBe(true);
    expect(message).toContain('4 / 50 photos analysed');
  });
  it.each(['stop', 'profile change'])(
    'does not resubmit a buffered batch after %s and keeps earlier results',
    async (interruption) => {
      const { snapshot, screenshot, fetch, operations, sendMessage } = setup(6);
      const original = fetch.getMockImplementation()!;
      let attempts = 0;
      fetch.mockImplementation(async (url, init) => {
        if (url.endsWith('/analyse-images') && ++attempts > 1)
          return Response.json(
            { error: { code: 'PHOTO_ANALYSIS_BUSY', message: 'Busy', retryAfterMs: 5000 } },
            { status: 429 },
          );
        return original(url, init);
      });
      const controller = new AbortController();
      const receive = vi.fn();
      await expect(
        analyseProfileImages(
          snapshot,
          'token',
          controller.signal,
          receive,
          operations,
          (message) => {
            if (message.includes('retrying in')) {
              if (interruption === 'stop') controller.abort();
              else
                Object.assign(chrome.tabs, { query: vi.fn(async () => [{ id: 2, windowId: 1 }]) });
            }
          },
        ),
      ).rejects.toThrow();
      expect(attempts).toBe(2);
      expect(screenshot).toHaveBeenCalledTimes(6);
      expect(receive).toHaveBeenCalledOnce();
      expect(receive.mock.calls[0][1]).toBe(3);
      expect(sendMessage.mock.calls.at(-1)?.[1].action).toBe('end');
    },
  );
  it('bounds the wait when the backend stays busy', async () => {
    const { snapshot, fetch, operations, screenshot } = setup(3);
    const original = fetch.getMockImplementation()!;
    let attempts = 0;
    fetch.mockImplementation(async (url, init) => {
      if (url.endsWith('/analyse-images')) {
        attempts++;
        return Response.json(
          { error: { code: 'PHOTO_ANALYSIS_BUSY', message: 'Busy', retryAfterMs: 1000 } },
          { status: 429 },
        );
      }
      return original(url, init);
    });
    await expect(
      analyseProfileImages(
        snapshot,
        'token',
        new AbortController().signal,
        () => undefined,
        operations,
      ),
    ).rejects.toThrow('still busy after waiting');
    expect(attempts).toBeLessThanOrEqual(8);
    expect(screenshot).toHaveBeenCalledTimes(3);
    expect(
      operations.wait.mock.calls.filter(([ms]) => ms >= 5000).reduce((sum, [ms]) => sum + ms, 0),
    ).toBe(120000);
  });
  it.each([
    [429, 'RATE_LIMITED'],
    [504, 'ANALYSIS_TIMEOUT'],
    [503, 'PROVIDER_UNAVAILABLE'],
    [409, 'DUPLICATE_BATCH'],
  ])('does not retry an ambiguous or already-accepted failure (%s %s)', async (status, code) => {
    const { snapshot, fetch, operations } = setup(3);
    const original = fetch.getMockImplementation()!;
    let attempts = 0;
    fetch.mockImplementation(async (url, init) => {
      if (url.endsWith('/analyse-images')) {
        attempts++;
        return Response.json({ error: { code, message: 'Failure' } }, { status: Number(status) });
      }
      return original(url, init);
    });
    await expect(
      analyseProfileImages(
        snapshot,
        'token',
        new AbortController().signal,
        () => undefined,
        operations,
      ),
    ).rejects.toThrow('Failure');
    expect(attempts).toBe(1);
  });
  it.each([1, 2, 4, 7, 50])(
    'stops capture and submission at the selected %s-photo limit',
    async (limit) => {
      const { snapshot, screenshot, batches, operations } = setup(65);
      const progress = vi.fn();
      const message = await analyseProfileImages(
        snapshot,
        'token',
        new AbortController().signal,
        () => undefined,
        operations,
        progress,
        limit,
      );
      expect(screenshot).toHaveBeenCalledTimes(limit);
      expect(batches.flatMap((batch) => batch.images)).toHaveLength(limit);
      expect(batches.at(-1)?.images).toHaveLength(limit % 3 || 3);
      expect(message).toContain(`${limit} / ${limit} photos analysed`);
      expect(message).toContain(`Reached the ${limit}-photo limit.`);
      expect(
        progress.mock.calls.every(([message]) => message.includes(`/ ${limit} photos analysed`)),
      ).toBe(true);
    },
  );
  it.each([0, 51, 1.5, NaN])(
    'rejects invalid limit %s before capturing or sending data',
    async (limit) => {
      const { snapshot, screenshot, operations } = setup(65);
      await expect(
        analyseProfileImages(
          snapshot,
          'token',
          new AbortController().signal,
          () => undefined,
          operations,
          undefined,
          limit,
        ),
      ).rejects.toThrow('Choose a photo limit');
      expect(screenshot).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1, 49, 50, 65])(
    'processes %s available photos within the 50-photo cap',
    async (total) => {
      const { snapshot, screenshot, batches, operations } = setup(total);
      const receive = vi.fn();
      const message = await analyseProfileImages(
        snapshot,
        'token',
        new AbortController().signal,
        receive,
        operations,
      );
      const expected = Math.min(total, 50);
      expect(screenshot).toHaveBeenCalledTimes(expected);
      expect(batches.flatMap((b) => b.images)).toHaveLength(expected);
      expect(
        batches.every(
          (b) => b.images.length <= 3 && b.images.every((i) => i.dataUrl === 'cropped-image-only'),
        ),
      ).toBe(true);
      expect(message).toContain(`${expected} / 50`);
      if (expected === 50) expect(batches.at(-1)?.images).toHaveLength(2);
    },
  );
  it('reports captured photos separately from pending provider analysis', async () => {
    const { snapshot, operations } = setup(3);
    const progress = vi.fn();
    const message = await analyseProfileImages(
      snapshot,
      'token',
      new AbortController().signal,
      () => undefined,
      operations,
      progress,
    );
    expect(
      progress.mock.calls.some(([text]) => text.includes('0 / 50 photos analysed · 3 captured')),
    ).toBe(true);
    expect(progress.mock.calls.some(([text]) => text.includes('Analysing 3 captured photos'))).toBe(
      true,
    );
    expect(message).toContain('3 / 50 photos analysed · 3 captured');
  });
  it('cancels between batches without another capture or request', async () => {
    const { snapshot, batches, operations, screenshot, sendMessage } = setup(50);
    const controller = new AbortController();
    await expect(
      analyseProfileImages(
        snapshot,
        'token',
        controller.signal,
        () => controller.abort(),
        operations,
      ),
    ).rejects.toThrow();
    expect(batches).toHaveLength(1);
    expect(screenshot).toHaveBeenCalledTimes(3);
    expect(sendMessage.mock.calls.at(-1)?.[1].action).toBe('end');
  });
  it.each([false, true])(
    'retries moving photos with a bounded limit (persistent: %s)',
    async (persistent) => {
      const { snapshot, operations, sendMessage, screenshot, batches } = setup(1);
      const original = sendMessage.getMockImplementation()!;
      let scans = 0;
      sendMessage.mockImplementation(async (id, message) => {
        const result = await original(id, message);
        if (message.action === 'scan' && 'candidates' in result) {
          scans++;
          if (scans === 2 || (persistent && scans % 2 === 0))
            return { ...result, scrollY: result.scrollY + 1 };
        }
        return result;
      });
      const message = await analyseProfileImages(
        snapshot,
        'token',
        new AbortController().signal,
        () => undefined,
        operations,
      );
      expect(screenshot).toHaveBeenCalledTimes(persistent ? 0 : 1);
      expect(batches).toHaveLength(persistent ? 0 : 1);
      expect(operations.wait.mock.calls.filter(([ms]) => ms === 250)).toHaveLength(
        persistent ? 2 : 1,
      );
      expect(message).toContain(persistent ? '0 / 50 photos analysed' : '1 / 50 photos analysed');
      if (persistent) {
        expect(scans).toBe(6);
        expect(message).toContain('1 skipped');
        expect(message).toContain('1 × The photo kept moving or changing before capture.');
      }
    },
  );
  it('preserves the failed step when returning to the profile also fails', async () => {
    const { snapshot, operations, sendMessage } = setup(1);
    const original = sendMessage.getMockImplementation()!;
    sendMessage.mockImplementation(async (id, message) => {
      if (message.action === 'begin')
        throw new Error('The post opened, but its main photo did not load.');
      if (message.action === 'end') throw new Error('Close the post manually.');
      return original(id, message);
    });
    await expect(
      analyseProfileImages(
        snapshot,
        'token',
        new AbortController().signal,
        () => undefined,
        operations,
      ),
    ).rejects.toThrow(
      'The post opened, but its main photo did not load. Returning to the profile also failed: Close the post manually.',
    );
  });
  it('does not accept geometry changes or a stopped capture', () => {
    const scan: PhotoScan = {
      candidates: [{ key: 'a', source: 'b', x: 1, y: 2, width: 100, height: 100 }],
      width: 1000,
      height: 800,
      scale: 1,
      scrollX: 0,
      scrollY: 0,
      end: false,
      stopped: false,
    };
    expect(sameCapture(scan, scan, scan.candidates[0])).toBe(true);
    expect(sameCapture(scan, { ...scan, scrollY: 10 }, scan.candidates[0])).toBe(false);
    expect(sameCapture(scan, { ...scan, stopped: true }, scan.candidates[0])).toBe(false);
    const shifted = { ...scan, candidates: [{ ...scan.candidates[0], x: 3, y: 3 }] };
    expect(sameCapture(scan, shifted, scan.candidates[0])).toBe(true);
    expect(intersectCaptures(scan.candidates[0], scan, shifted)).toMatchObject({
      x: 3,
      y: 3,
      width: 98,
      height: 99,
    });
    expect(
      sameCapture(
        scan,
        { ...scan, candidates: [{ ...scan.candidates[0], x: 4 }] },
        scan.candidates[0],
      ),
    ).toBe(false);
    expect(
      sameCapture(
        scan,
        { ...scan, candidates: [{ ...scan.candidates[0], source: 'different' }] },
        scan.candidates[0],
      ),
    ).toBe(false);
  });
});
