// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractProfile } from '../apps/extension/src/extraction';

describe('profile extraction', () => {
  it('reads owner content and excludes hidden, editable, third-party and navigation text', async () => {
    document.body.innerHTML = `<main><h1>Alex Morgan</h1><section><h2>About</h2><p>I build accessible tools and mentor contributors.</p><p hidden>Hidden secret content must never leave.</p><p style="display:none">More hidden text to exclude.</p><div data-author="other"><p>A commenter loves skydiving.</p></div><aside><p>A recommended person loves sailing.</p></aside><nav><p>A navigation label is not a bio.</p></nav><div contenteditable="true"><p>A draft private message should be excluded.</p></div></section></main>`;
    const result = await extractProfile(document, 'https://example.com/alex?tracking=123');
    expect(result.profile.evidence).toHaveLength(1);
    expect(result.profile.evidence[0].text).toBe(
      'I build accessible tools and mentor contributors.',
    );
    expect(result.canonicalDisplayUrl).toBe('https://example.com/alex');
  });
  it('refuses ambiguous multiple-person pages', async () => {
    document.body.innerHTML =
      '<main><h1>Alex</h1><h1>Jamie</h1><p>Two different people share this page.</p></main>';
    await expect(extractProfile(document, 'https://example.com')).rejects.toThrow(/one profile/);
  });
  it('tracks query-based profile changes separately', async () => {
    document.body.innerHTML = '<main><h1>Alex</h1><p>I enjoy books, art and coffee.</p></main>';
    const a = await extractProfile(document, 'https://example.com/?person=a');
    const b = await extractProfile(document, 'https://example.com/?person=b');
    expect(a.routeFingerprint).not.toBe(b.routeFingerprint);
  });
});
