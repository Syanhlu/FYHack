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
  return { snapshot, screenshot, batches, operations, sendMessage };
}
describe('automatic photo runs', () => {
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
