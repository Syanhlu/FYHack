import { afterEach, describe, expect, it, vi } from 'vitest';
import { capture } from '../apps/extension/src/services/browser';

afterEach(() => vi.unstubAllGlobals());

describe('capture errors', () => {
  function mockBrowser(executeScript: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn().mockResolvedValue([{ id: 1 }]) },
      scripting: { executeScript },
    });
  }
  it('preserves parsing errors returned by the injected reader', async () => {
    mockBrowser(
      vi
        .fn()
        .mockResolvedValue([
          { result: { extractionError: 'No main profile was found. Use Paste profile text.' } },
        ]),
    );
    await expect(capture()).rejects.toThrow('No main profile was found.');
  });
  it('gives access instructions when injection is rejected', async () => {
    mockBrowser(vi.fn().mockRejectedValue(new Error('Cannot access contents of url')));
    await expect(capture()).rejects.toThrow('Click the toolbar icon');
  });
  it('distinguishes missing script results from denied access', async () => {
    mockBrowser(vi.fn().mockResolvedValue([{ result: undefined }]));
    await expect(capture()).rejects.toThrow('page reader returned no profile');
  });
});
