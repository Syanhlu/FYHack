// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { promptFor, serverModes, validateOutcome } from '../apps/api/src/modes';
import { Scrapbook } from '../apps/extension/src/components/moodboard/Scrapbook';
import { layout, stickerSpots } from '../apps/extension/src/components/moodboard/layout';
import {
  forgetPhotoPreviews,
  keepPhotoPreview,
} from '../apps/extension/src/services/photo-previews';
import { boardThemeIds, scrapbookPaletteIds, scrapbookPalettes } from '../packages/catalogues/src';
import { modeSchemas, type RomanticResult } from '../packages/contracts/src';
import { photoIds, scrapbookCase } from './helpers';

const mode = serverModes.romantic!;
type Board = NonNullable<RomanticResult['scrapbook']>;
const check = (edit: (board: Board) => void) => {
  const { input, raw, board } = scrapbookCase();
  edit(board);
  return () => validateOutcome(mode, raw, input);
};
afterEach(() => {
  cleanup();
  forgetPhotoPreviews();
});

describe('scrapbook validation', () => {
  it('accepts a board built only from analysed photos and cited evidence', () => {
    const { input, raw } = scrapbookCase();
    const result = validateOutcome(mode, raw, input).result as RomanticResult;
    expect(result.scrapbook?.portraits).toHaveLength(2);
    expect(result.scrapbook?.quote?.quoteText).toBe('I enjoy pottery');
  });
  it('sends the model the photo list and the scrapbook catalogue', () => {
    const { input } = scrapbookCase();
    const data = JSON.parse(promptFor(mode, input)[1]!.content);
    expect(data.photos).toHaveLength(4);
    expect(data.photos[3]).toEqual({ imageId: photoIds[3], evidenceIds: ['v4', 'v5'] });
    expect(data.scrapbookCatalogue.themes.map((t: { id: string }) => t.id)).toEqual(boardThemeIds);
  });
  it.each([
    ['an unknown theme', (b) => ((b as { boardTheme: string }).boardTheme = 'vaporwave')],
    ['an unknown palette', (b) => ((b as { paletteId: string }).paletteId = '#ff00ff')],
    ['an unknown sticker', (b) => ((b.stickerIds as string[])[0] = 'skull')],
    ['too few stickers', (b) => (b.stickerIds.length = 3)],
    ['a name that is too long', (b) => (b.name = 'x'.repeat(25))],
    ['markup in text', (b) => (b.summary.text = '<b>hi</b>')],
    ['evidence that does not exist', (b) => (b.summary.evidenceIds = ['e99'])],
  ] as [string, (b: Board) => void][])('rejects %s', (_name, edit) =>
    expect(check(edit)).toThrow(),
  );
  const board = (edit: (b: Board) => void) => (check(edit)().result as RomanticResult).scrapbook;
  it('leaves out a photo the profile does not have, or one used twice', () => {
    for (const imageId of [crypto.randomUUID(), photoIds[0]!]) {
      expect(board((b) => (b.travel[0]!.imageId = imageId))?.travel).toEqual([]);
      // Without its only hobby photo, or a second portrait, there is no board to show.
      expect(board((b) => (b.hobbies[0]!.imageId = imageId))).toBeNull();
    }
    expect(board((b) => (b.portraits[1]!.imageId = photoIds[0]!))).toBeNull();
  });
  it('leaves out a place its evidence does not name', () => {
    expect(board((b) => (b.travel[0]!.place = 'Paris, France'))?.travel).toEqual([]);
    expect(board((b) => (b.travel[0]!.evidenceIds = ['v4']))?.travel).toEqual([]);
    expect(board(() => undefined)?.travel[0]?.place).toBe('Lisbon, Portugal');
  });
  it('ties every photo to its own evidence and never repeats a sticker', () => {
    expect(board((b) => (b.portraits[0]!.evidenceIds = ['e1']))?.portraits[0]!.evidenceIds).toEqual(
      ['v1', 'e1'],
    );
    const stickers = board((b) => (b.stickerIds[1] = b.stickerIds[0]!))!.stickerIds;
    expect(new Set(stickers).size).toBe(stickers.length);
    expect(stickers.length).toBeGreaterThanOrEqual(6);
  });
  it('leaves out a date over the budget and keeps the rest', () => {
    const { input, raw } = scrapbookCase();
    const result = raw.result as RomanticResult;
    result.dateIdeas.push({ ...result.dateIdeas[0]!, id: 'pricey', costBand: 'moderate' });
    const checked = validateOutcome(mode, raw, input).result as RomanticResult;
    expect(checked.dateIdeas.map((d) => d.id)).toEqual(['coffee']);
  });
  it('drops a quote that is not their exact words, and never quotes a photo', () => {
    for (const edit of [
      (b: Board) => (b.quote!.quoteText = 'I adore pottery'),
      (b: Board) =>
        (b.quote = { quoteText: 'Lisbon tram 28', caption: 'On a sign', evidenceIds: ['v5'] }),
    ]) {
      const result = check(edit)().result as RomanticResult;
      expect(result.scrapbook?.quote?.quoteText).toBeNull();
    }
  });
  it('replaces a name the profile does not contain', () => {
    const result = check((b) => (b.name = 'Jessica'))().result as RomanticResult;
    expect(result.scrapbook?.name).toBe('Alex');
  });
  it('returns no board, not a broken one, when there is not enough photo material', () => {
    const { input, raw } = scrapbookCase();
    input.profile.evidence = input.profile.evidence.filter(
      (e) => !['v3', 'v4', 'v5'].includes(e.id),
    );
    const result = validateOutcome(mode, raw, input).result as RomanticResult;
    expect(result.scrapbook).toBeNull();
    // The model may also decide the photos are not usable.
    const usable = scrapbookCase();
    (usable.raw.result as RomanticResult).scrapbook = null;
    expect(validateOutcome(mode, usable.raw, usable.input).status).toBe('ready');
  });
  it('treats a board in the old tile format as stale', () => {
    const { raw } = scrapbookCase();
    const old = { ...(raw.result as object), scrapbook: undefined, moodboard: { tiles: [] } };
    expect(modeSchemas.romantic.result.safeParse(old).success).toBe(false);
    expect(modeSchemas.romantic.version).not.toBe('1');
  });
});

describe('scrapbook rendering', () => {
  it('draws the same layout every time and keeps every piece on the board', () => {
    const { board } = scrapbookCase();
    expect(layout(board)).toEqual(layout(board));
    expect(stickerSpots(8, 'seed')).toEqual(stickerSpots(8, 'seed'));
    for (const hobbies of [1, 2])
      for (const travel of [0, 1, 2]) {
        const extra = (n: number) => `00000000-0000-4000-8000-0000000000${10 + n}`;
        const slots = layout({
          ...board,
          hobbies: Array.from({ length: hobbies }, (_, i) => ({
            imageId: extra(i),
            label: 'x',
            evidenceIds: ['v3'],
          })),
          travel: Array.from({ length: travel }, (_, i) => ({
            imageId: extra(i + 5),
            place: 'Lisbon, Portugal',
            evidenceIds: ['v5'],
          })),
        });
        expect(slots.small).toHaveLength(hobbies + travel);
        for (const slot of [...slots.portraits, slots.summary, slots.quote, ...slots.small]) {
          expect(slot.left).toBeGreaterThanOrEqual(0);
          expect(slot.left + slot.width).toBeLessThanOrEqual(100);
          expect(Math.abs(slot.rotate)).toBeLessThanOrEqual(6);
        }
      }
  });
  it('renders every theme with every palette from local photo data only', () => {
    const { board, input } = scrapbookCase();
    photoIds.forEach((id) => keepPhotoPreview(id, `data:image/jpeg;base64,${id}`));
    for (const boardTheme of boardThemeIds)
      for (const paletteId of scrapbookPaletteIds) {
        const view = render(
          <Scrapbook
            board={{ ...board, boardTheme, paletteId }}
            evidence={input.profile.evidence}
          />,
        );
        const images = [...view.container.querySelectorAll('img')];
        expect(images).toHaveLength(4);
        expect(images.every((image) => image.src.startsWith('data:image/'))).toBe(true);
        expect(images[0]!.alt).toContain('One person is the clear subject');
        expect(screen.getByRole('heading', { name: 'Alex' })).toBeTruthy();
        expect(screen.getByText('📍 Lisbon, Portugal')).toBeTruthy();
        view.unmount();
      }
  });
  it('asks for a regenerate when the photos are no longer held', () => {
    const { board, input } = scrapbookCase();
    render(<Scrapbook board={board} evidence={input.profile.evidence} />);
    expect(screen.getByText(/no longer held in this session/)).toBeTruthy();
  });
  it('keeps text readable in every palette', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (a: string, b: string) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (light! + 0.05) / (dark! + 0.05);
    };
    for (const id of scrapbookPaletteIds) {
      const [paper, accent, , ink] = scrapbookPalettes[id].colours;
      expect(contrast(ink, '#fffdf8'), `${id}: note text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#ffffff', ink), `${id}: ink label`).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#ffffff', accent), `${id}: accent label`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent, paper), `${id}: name`).toBeGreaterThanOrEqual(3);
    }
  });
});
