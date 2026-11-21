// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractProfile, identityText } from '../apps/extension/src/extraction';

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
  it('reads labelled LinkedIn sections without an h1, excluding activity and recommendations', async () => {
    document.title = '(13) Alex Morgan | LinkedIn';
    document.body.innerHTML = `<div aria-label="Primary content">
      <div><a><span>Alex Morgan</span><span>View Alex’s verifications</span></a></div>
      <div><div><h2>Experience</h2></div><div><a>Engineer at Example Labs</a><p>I build accessible developer tools.</p></div></div>
      <div><h2>Activity</h2><p>A repost written by somebody else.</p></div>
      </div><div aria-label="Aside"><h2>People you may know</h2><p>Jamie builds boats.</p></div>`;
    const href = 'https://www.linkedin.com/in/alex-morgan/';
    const result = await extractProfile(document, href);
    expect(result.profile.displayName).toBe('Alex Morgan');
    expect(result.profile.evidence).toHaveLength(1);
    expect(result.profile.evidence[0].text).toContain('Engineer at Example Labs');
    expect(result.profile.evidence[0].sourceKind).toBe('experience');
    expect(result.profile.evidence[0].text).not.toMatch(/repost|boats/);
    const before = identityText(document, href);
    document.querySelector('a span')!.textContent = 'Jamie Lee';
    expect(identityText(document, href)).not.toBe(before);
  });
  it('does not trust a stale title or a lookalike LinkedIn domain', async () => {
    document.title = 'Alex Morgan | LinkedIn';
    document.body.innerHTML =
      '<main><a><span>Jamie Lee</span></a><p>I build accessible developer tools.</p></main>';
    await expect(extractProfile(document, 'https://www.linkedin.com/in/alex/')).rejects.toThrow(
      /one profile/,
    );
    document.querySelector('span')!.textContent = 'Alex Morgan';
    await expect(extractProfile(document, 'https://notlinkedin.com/in/alex/')).rejects.toThrow(
      /one profile/,
    );
  });
  it('reports empty extraction rather than presenting an empty review', async () => {
    document.body.innerHTML = '<main><h1>Alex Morgan</h1></main>';
    await expect(extractProfile(document, 'https://example.com/alex')).rejects.toThrow(
      /no readable profile details/,
    );
  });
});
