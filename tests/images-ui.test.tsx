// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageReview } from '../apps/extension/src/components/ImageReview';
import { manualProfile, SCHEMA_VERSION, type LocalSnapshot } from '../packages/contracts/src';
import { checkConnection } from '../apps/extension/src/services/backend';
import { analyseProfileImages } from '../apps/extension/src/services/images';
vi.mock('../apps/extension/src/services/backend', () => ({
  checkConnection: vi.fn(async () => ({ schemaVersion: '2', images: { enabled: true } })),
}));
vi.mock('../apps/extension/src/services/images', () => ({ analyseProfileImages: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const snapshot: LocalSnapshot = {
  profile: manualProfile('I enjoy making art and exploring outdoors.'),
  tabId: 1,
  adapterId: 'instagram-best-effort',
  routeFingerprint: 'x',
  canonicalDisplayUrl: 'https://instagram.com/alex/',
  capturedAt: new Date().toISOString(),
  inputRevision: 0,
};
describe('image review', () => {
  it.each(['stop', 'error', 'complete'])('keeps skip reasons visible after %s', async (outcome) => {
    vi.mocked(analyseProfileImages).mockImplementation(
      async (_s, _t, _signal, _batch, _ops, progress) => {
        const skips = [{ reason: 'Duplicate photo.', count: 2 }];
        progress?.('2 photos skipped.', skips);
        progress?.('Opening the next photo…', skips);
        if (outcome === 'error') throw new Error('Post navigation failed.');
        if (outcome === 'complete') return 'Run finished.';
        return new Promise(() => undefined);
      },
    );
    render(
      <ImageReview
        snapshot={snapshot}
        token="token"
        disabled={false}
        onBusy={() => undefined}
        onAccept={() => undefined}
        onRemove={() => undefined}
      />,
    );
    await waitFor(() =>
      expect((screen.getByText('Analyse profile images') as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByText('Analyse profile images'));
    await screen.findByText('Why photos were skipped');
    if (outcome === 'stop') fireEvent.click(screen.getByText('Stop photo analysis'));
    if (outcome === 'error') await screen.findByText(/Partial result: Post navigation failed/);
    if (outcome === 'complete') await screen.findByText('Run finished.');
    expect(screen.getByLabelText('Skipped photo reasons').textContent).toContain(
      '2 × Duplicate photo.',
    );
  });
  it('only analyses on click and requires explicit observation acceptance with provenance', async () => {
    const id = crypto.randomUUID();
    vi.mocked(analyseProfileImages).mockImplementation(async (_s, _t, _signal, batch) => {
      batch(
        [
          {
            id,
            thumbnail: 'data:image/jpeg;base64,AA==',
            observations: [
              {
                imageId: id,
                kind: 'scene',
                text: 'A bicycle is visible.',
                uncertainty: 'Ownership is unknown.',
              },
            ],
          },
        ],
        1,
      );
      return '1 / 50 photos analysed.';
    });
    const accept = vi.fn();
    render(
      <ImageReview
        snapshot={snapshot}
        token="token"
        disabled={false}
        onBusy={() => undefined}
        onAccept={accept}
        onRemove={() => undefined}
      />,
    );
    await waitFor(() =>
      expect((screen.getByText('Analyse profile images') as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(analyseProfileImages).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Analyse profile images'));
    await screen.findByText('Accept observation');
    expect(accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Accept observation'));
    expect(accept).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceImageId: id,
        attribution: 'visual_observation',
        sourceKind: 'visual',
        observationKind: 'scene',
      }),
    );
    expect(SCHEMA_VERSION).toBe('2');
  });
  it('aborts on unmount and ignores late batches', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(analyseProfileImages).mockImplementation(async (_s, _t, inputSignal) => {
      signal = inputSignal;
      return new Promise(() => undefined);
    });
    const { unmount } = render(
      <ImageReview
        snapshot={snapshot}
        token="token"
        disabled={false}
        onBusy={() => undefined}
        onAccept={() => undefined}
        onRemove={() => undefined}
      />,
    );
    await waitFor(() =>
      expect((screen.getByText('Analyse profile images') as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByText('Analyse profile images'));
    await screen.findByText('Stop photo analysis');
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});

it('explains a disabled backend and recovers after a restart without changing the token', async () => {
  vi.mocked(checkConnection).mockResolvedValueOnce({
    provider: 'live',
    schemaVersion: SCHEMA_VERSION,
    catalogueVersion: '1',
    modes: [],
    images: { enabled: false, maxPhotos: 50, batchSize: 3 },
  });
  render(
    <ImageReview
      snapshot={snapshot}
      token="token"
      disabled={false}
      onBusy={() => undefined}
      onAccept={() => undefined}
      onRemove={() => undefined}
    />,
  );
  await screen.findByText(/running API has image analysis disabled/);
  expect((screen.getByText('Analyse profile images') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Recheck image connection'));
  await waitFor(() =>
    expect((screen.getByText('Analyse profile images') as HTMLButtonElement).disabled).toBe(false),
  );
  expect(analyseProfileImages).not.toHaveBeenCalled();
});

it('shows connection errors instead of incorrectly claiming images are disabled', async () => {
  vi.mocked(checkConnection).mockRejectedValueOnce(new Error('The local token was not accepted.'));
  render(
    <ImageReview
      snapshot={snapshot}
      token="token"
      disabled={false}
      onBusy={() => undefined}
      onAccept={() => undefined}
      onRemove={() => undefined}
    />,
  );
  await screen.findByText('The local token was not accepted.');
  expect(screen.queryByText(/running API has image analysis disabled/)).toBeNull();
});
