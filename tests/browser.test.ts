import { afterEach, describe, expect, it, vi } from 'vitest';
import { capture } from '../apps/extension/src/services/browser';

afterEach(() => vi.unstubAllGlobals());

describe('capture errors', () => {
  function mockBrowser(executeScript: ReturnType<typeof vi.fn>) {
    const panel = {};
    vi.stubGlobal('window', Object.assign(panel, { top: panel }));
    vi.stubGlobal('chrome', {
      storage: { session: { get: vi.fn().mockResolvedValue({}) } },
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
  it('reads the containing tab when the panel is embedded in a page', async () => {
    const executeScript = vi.fn().mockResolvedValue([{ result: undefined }]);
    mockBrowser(executeScript);
    vi.stubGlobal('window', { top: {} });
    chrome.tabs.getCurrent = vi.fn().mockResolvedValue({ id: 42 });
    await expect(capture()).rejects.toThrow('page reader returned no profile');
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 42 }, files: ['extract.js'] });
    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });
});
