// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cvContext, readCv } from '../apps/extension/src/services/cv';
import { readable } from '../apps/extension/src/components/Results';
import { moodFor } from '../apps/extension/src/services/music';
import { requestSchema } from '../packages/contracts/src';
import { request } from './helpers';

const cv = Array.from(
  { length: 120 },
  (_, i) => `Role${i} built accessible developer tooling for teams.`,
).join(' ');

describe('CV context', () => {
  it('splits a CV into cited chunks at word boundaries within request limits', () => {
    const items = cvContext(cv);
    expect(items.length).toBe(10);
    expect(items.every((u) => u.kind === 'cv' && u.text.length <= 600)).toBe(true);
    expect(items.map((u) => u.id)).toEqual(items.map((_, i) => `c${i + 1}`));
    expect(cv.startsWith(items.map((u) => u.text).join(' '))).toBe(true);
    const manual = Array.from({ length: 5 }, (_, i) => ({
      id: `u${i + 1}`,
      kind: 'interest' as const,
      text: 'x'.repeat(600),
    }));
    expect(() =>
      requestSchema.parse({ ...request(), userContext: [...manual, ...items] }),
    ).not.toThrow();
  });
  it('reads a text CV, removes contact details, and rejects empty files', async () => {
    const file = new File([`Jane Doe jane@example.com +44 7700 900123\n${cv}`], 'cv.txt', {
      type: 'text/plain',
    });
    const saved = await readCv(file);
    expect(saved.name).toBe('cv.txt');
    expect(saved.text).toContain('[email removed]');
    expect(saved.text).not.toContain('jane@example.com');
    await expect(readCv(new File(['  '], 'empty.txt'))).rejects.toThrow(/No readable text/);
  });
});
describe('ambient music mood', () => {
  it('takes its character from the tone and nudges tempo by the soundtrack tags', () => {
    const tones = ['warm', 'playful', 'heartfelt', 'confident', 'relaxed'];
    expect(new Set(tones.map((tone) => JSON.stringify(moodFor(tone, [])))).size).toBe(5);
    expect(moodFor('playful', []).bpm).toBeGreaterThan(moodFor('heartfelt', []).bpm);
    expect(moodFor('warm', ['energetic']).bpm).toBeGreaterThan(moodFor('warm', []).bpm);
    expect(moodFor('warm', ['quiet']).bpm).toBeLessThan(moodFor('warm', []).bpm);
    expect(moodFor('unknown', [])).toEqual(moodFor('warm', []));
    expect(tones.filter((tone) => moodFor(tone, []).pulse)).toEqual(['confident']);
  });
});
describe('readable labels', () => {
  it('turns identifiers into words and leaves prose alone', () => {
    expect(readable('coffee_chat_invitation')).toBe('Coffee chat invitation');
    expect(readable('connection-note')).toBe('Connection note');
    expect(readable('Connection note')).toBe('Connection note');
  });
});
