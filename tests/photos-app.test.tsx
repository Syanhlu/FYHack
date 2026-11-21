// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../apps/extension/entrypoints/panel/App';
import { capture } from '../apps/extension/src/services/browser';
import { analyse } from '../apps/extension/src/services/backend';
import { analyseProfileImages, type PhotoReview } from '../apps/extension/src/services/images';
import { manualProfile, type LocalSnapshot } from '../packages/contracts/src';
import { output } from './helpers';

vi.mock('../apps/extension/src/services/browser', () => ({
  capture: vi.fn(),
  isCurrent: vi.fn(async () => true),
  readToken: vi.fn(async () => 'test-token'),
  release: vi.fn(),
  saveToken: vi.fn(),
}));
vi.mock('../apps/extension/src/services/backend', () => ({
  analyse: vi.fn(),
  checkConnection: vi.fn(async () => ({ schemaVersion: '2', images: { enabled: true } })),
}));
vi.mock('../apps/extension/src/services/images', () => ({ analyseProfileImages: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('automatically retains every batch without self-cancelling, and keeps editable photo evidence separate from your background', async () => {
  vi.stubGlobal('chrome', {
    runtime: { id: 'test-extension', onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() } },
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const snapshot: LocalSnapshot = {
    profile: manualProfile('I am 29 and I enjoy pottery and cycling.', 'Alex'),
    tabId: 1,
    adapterId: 'instagram-best-effort',
    routeFingerprint: 'alex',
    canonicalDisplayUrl: 'https://www.instagram.com/alex/',
    capturedAt: new Date().toISOString(),
    inputRevision: 0,
  };
  vi.mocked(capture).mockResolvedValue(snapshot);
  let receive!: Parameters<typeof analyseProfileImages>[3];
  let finish!: (message: string) => void;
  let signal!: AbortSignal;
  vi.mocked(analyseProfileImages).mockImplementation(
    async (_snapshot, _token, runSignal, batch) => {
      signal = runSignal;
      receive = batch;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    },
  );
  vi.mocked(analyse).mockImplementation(async (input) => ({
    ...output('outreach'),
    schemaVersion: '2',
    catalogueVersion: '1',
    mode: input.mode,
    modeVersion: input.modeVersion,
    requestId: input.requestId,
    snapshotId: input.profile.snapshotId,
    provider: 'live',
    generatedAt: new Date().toISOString(),
  }));
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Read this profile' }));
  await screen.findByRole('heading', { name: 'About you' });
  fireEvent.change(screen.getByLabelText(/Your interests and background/), {
    target: { value: 'I build community gardens.' },
  });
  await waitFor(() =>
    expect((screen.getByText('Analyse profile images') as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByText('Analyse profile images'));
  const photos: PhotoReview[] = Array.from({ length: 50 }, (_, i) => {
    const id = crypto.randomUUID();
    return {
      id,
      thumbnail: 'data:image/jpeg;base64,AA==',
      observations: Array.from({ length: 3 }, (_, j) => ({
        imageId: id,
        kind: 'scene' as const,
        text: `Visible pottery detail ${i}-${j}.`,
        uncertainty: 'Maker unknown.',
      })),
    };
  });
  for (let i = 0; i < photos.length; i += 3) {
    await act(async () => receive(photos.slice(i, i + 3), Math.min(i + 3, 50)));
    expect(signal.aborted).toBe(false);
  }
  const group = screen
    .getByText(/Their photo evidence/, { selector: 'summary' })
    .closest('details')!;
  expect(group.open).toBe(false);
  expect(group.querySelectorAll('textarea')).toHaveLength(150);
  const ids = Array.from(group.querySelectorAll('textarea')).map((node) =>
    node.getAttribute('aria-label')!.replace('Evidence ', ''),
  );
  expect(new Set(ids).size).toBe(150);
  await act(async () => finish('50 / 50 photos analysed.'));
  expect(signal.aborted).toBe(false);
  fireEvent.click(group.querySelector('summary')!);
  expect(group.open).toBe(true);
  fireEvent.click(screen.getByLabelText(`Remove ${ids[0]}`));
  fireEvent.change(screen.getByLabelText(`Evidence ${ids[1]}`), {
    target: { value: 'A blue ceramic bowl is visible.' },
  });
  fireEvent.click(screen.getByText('Generate ideas'));
  await waitFor(() => expect(analyse).toHaveBeenCalledOnce());
  const input = vi.mocked(analyse).mock.calls[0][0];
  expect(input.profile.evidence.filter((e) => e.sourceKind === 'visual')).toHaveLength(149);
  expect(input.profile.evidence.find((e) => e.id === ids[0])).toBeUndefined();
  expect(input.profile.evidence.find((e) => e.id === ids[1])).toMatchObject({
    text: 'A blue ceramic bowl is visible.',
    sourceKind: 'visual',
    attribution: 'visual_observation',
    sourceImageId: photos[0].id,
  });
  expect(input.userContext[0].text).toBe('I build community gardens.');
  expect(input.profile.evidence.some((e) => e.text.includes('community gardens'))).toBe(false);
});
