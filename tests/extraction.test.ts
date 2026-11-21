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

describe('Instagram profile extraction', () => {
  const href = 'https://www.instagram.com/alex.morgan/?utm_source=test';
  function profile(bio = 'I enjoy pottery, hiking and building accessible tools.') {
    document.body.innerHTML = `<main><header>
      <section><h2>alex.morgan</h2><button><span dir="auto">Follow this account</span></button></section>
      <ul><li><span dir="auto">12345 followers</span></li></ul>
      <section><span dir="auto">Alex Morgan</span><div><span dir="auto">${bio}</span></div>
      <a href="/explore/people/"><span dir="auto">Discover more people</span></a>
      <span dir="auto" hidden>Hidden profile details</span>
      <aside><span dir="auto">Suggested account biography</span></aside></section>
      </header><article><p>A third-party post caption about skiing.</p><img alt="A person playing tennis" /></article>
      <div role="dialog"><p>A private message or post comment.</p></div></main>`;
  }
  it('reads only visible header biography, with handle identity and existing redaction', async () => {
    profile('I enjoy pottery and hiking. Contact alex@example.com.');
    const result = await extractProfile(document, href);
    expect(result.adapterId).toBe('instagram-best-effort');
    expect(result.profile.displayName).toBe('@alex.morgan');
    expect(result.canonicalDisplayUrl).toBe('https://www.instagram.com/alex.morgan/');
    expect(result.profile.evidence).toEqual([
      expect.objectContaining({
        text: 'I enjoy pottery and hiking. Contact [email removed].',
        sourceKind: 'bio',
        sectionLabel: 'Instagram bio',
        attribution: 'profile_owner',
      }),
    ]);
  });
  it.each([
    '/',
    '/explore/',
    '/direct/inbox/',
    '/p/abc/',
    '/reel/abc/',
    '/stories/alex/1/',
    '/accounts/login/',
    '/alex.morgan/tagged/',
  ])('rejects non-profile route %s', async (path) => {
    profile();
    await expect(extractProfile(document, `https://www.instagram.com${path}`)).rejects.toThrow(
      /individual profile/,
    );
  });
  it('supports the bare domain and case-insensitive username headings', async () => {
    profile();
    document.querySelector('h2')!.textContent = '@Alex.Morgan';
    expect((await extractProfile(document, 'https://instagram.com/alex.morgan')).adapterId).toBe(
      'instagram-best-effort',
    );
  });
  it('rejects stale or missing owner headings, even with matching metadata', async () => {
    profile();
    document.title = 'Alex Morgan (@alex.morgan) • Instagram photos and videos';
    const before = identityText(document, href);
    document.querySelector('h2')!.textContent = 'jamie.lee';
    expect(identityText(document, href)).not.toBe(before);
    await expect(extractProfile(document, href)).rejects.toThrow(/No main profile/);
    document.querySelector('h2')!.remove();
    await expect(extractProfile(document, href)).rejects.toThrow(/No main profile/);
  });
  it('rejects ambiguous duplicate headers and hidden owners', async () => {
    profile();
    document.querySelector('main')!.append(document.querySelector('header')!.cloneNode(true));
    await expect(extractProfile(document, href)).rejects.toThrow(/No main profile/);
    profile();
    document.querySelector('h2')!.hidden = true;
    await expect(extractProfile(document, href)).rejects.toThrow(/No main profile/);
  });
  it('reads a bio wrapped in the expander control, but not other buttons', async () => {
    document.body.innerHTML = `<main><header><section><h2 dir="auto">alex.morgan</h2>
      <span dir="auto"><div role="button"><span dir="auto">Making pots and climbing hills, mostly.</span></div></span>
      <div role="button"><span dir="auto">Message this account</span></div>
      <div role="menu"><div role="button"><span dir="auto">Highlight reel title</span></div></div>
      </section></header></main>`;
    const result = await extractProfile(document, href);
    expect(result.profile.evidence.map((e) => e.text)).toEqual([
      'Making pots and climbing hills, mostly.',
    ]);
  });
  it('keeps short bios and website links, but not counts or in-app links', async () => {
    document.body.innerHTML = `<main><header><section><h2 dir="auto">alex.morgan</h2>
      <span dir="auto">Alex</span><div><span dir="auto">5,018 posts</span></div>
      <a href="/alex.morgan/followers/"><span dir="auto">104M followers</span></a>
      <span dir="auto"><div role="button"><span dir="auto">Potter</span></div></span>
      <a href="https://l.instagram.com/?u=x"><span dir="auto">alexmakespots.example</span></a>
      <button><svg><title>Link icon</title></svg><div dir="auto">shop.example and 2 more</div></button>
      <a href="https://www.threads.com/@alex.morgan"><span dir="auto">alex.morgan</span></a>
      <button><div dir="auto">Follow</div></button>
      <a href="/jamie/"><span dir="auto">Followed by jamie.lee + 3 more</span></a>
      </section></header></main>`;
    const result = await extractProfile(document, href);
    expect(result.profile.evidence.map((e) => [e.sectionLabel, e.text])).toEqual([
      ['Instagram bio', 'Potter'],
      ['Instagram link', 'alexmakespots.example'],
      ['Instagram link', 'shop.example and 2 more'],
    ]);
  });
  it('reads the name from the name element, never from a bio line such as a school', async () => {
    const page = (title: string) => {
      document.title = title;
      document.body.innerHTML = `<main><header><section><h2 dir="auto">alex.morgan</h2>
        <span dir="auto">Alex Morgan</span>
        <span dir="auto"><div role="button"><span dir="auto">King's College London 🎓 Economics</span></div></span>
        </section></header></main>`;
    };
    page('(3) Alex Morgan (@alex.morgan) • Instagram photos and videos');
    const result = await extractProfile(document, href);
    expect(result.profile.displayName).toBe('@alex.morgan');
    expect(result.profile.ownerName).toBe('Alex Morgan');
    // The name is not repeated as a bio detail; the school stays a detail.
    expect(result.profile.evidence.map((e) => e.text)).toEqual([
      "King's College London 🎓 Economics",
    ]);
    // A title for another account, or a name that is not on the page, is not trusted.
    page('Jamie Lee (@jamie.lee) • Instagram photos and videos');
    expect((await extractProfile(document, href)).profile.ownerName).toBe('Alex Morgan');
    // A title naming something that is not shown as the name falls back to the page structure.
    page("King's College London (@alex.morgan) • Instagram");
    expect((await extractProfile(document, href)).profile.ownerName).toBe('Alex Morgan');
    // With a bare title, the first plain text element of the header is the name.
    page('(2) Instagram');
    expect((await extractProfile(document, href)).profile.ownerName).toBe('Alex Morgan');
    // No name element: the first plain text is the counts or a bio line, never used as a name.
    document.querySelector('span[dir]')!.textContent = '5,018 posts';
    expect((await extractProfile(document, href)).profile.ownerName).toBeNull();
    document.querySelector('span[dir]')!.textContent =
      'Economics student at a university in London who loves long walks';
    expect((await extractProfile(document, href)).profile.ownerName).toBeNull();
    document.title = '';
  });
  it('ignores icon labels such as the Verified badge', async () => {
    document.title = 'Alex Morgan (@alex.morgan) • Instagram photos and videos';
    document.body.innerHTML = `<main><header><section>
      <h2 dir="auto">alex.morgan<svg aria-label="Verified"><title>Verified</title></svg></h2>
      <span dir="auto">Alex Morgan<svg aria-label="Verified"><title>Verified</title></svg></span>
      <span dir="auto"><div role="button"><span dir="auto">Potter and weekend hiker<svg><title>Verified</title></svg></span></div></span>
      </section></header></main>`;
    const result = await extractProfile(document, href);
    expect(result.profile.displayName).toBe('@alex.morgan');
    expect(result.profile.ownerName).toBe('Alex Morgan');
    expect(result.profile.evidence.map((e) => e.text)).toEqual(['Potter and weekend hiker']);
    expect(JSON.stringify(result.profile)).not.toContain('Verified');
    document.title = '';
  });
  it('does not read images or grid text when the bio is empty', async () => {
    profile('');
    const result = await extractProfile(document, href);
    expect(result.adapterId).toBe('instagram-best-effort');
    expect(result.profile.displayName).toBe('@alex.morgan');
    expect(result.profile.evidence).toEqual([]);
    expect(result.captureWarnings?.[0]).toContain('You can still analyse profile images');
  });
  it('keeps nested bio fragments together without including header controls', async () => {
    profile(
      '<span dir="auto">I make </span><span dir="auto">pottery </span><span dir="auto">and hike.</span>',
    );
    const result = await extractProfile(document, href);
    expect(result.profile.evidence.map((e) => e.text)).toEqual(['I make pottery and hike.']);
  });
  it('retains eligibility signals from a short bio even without text evidence', async () => {
    profile('I am 17');
    const result = await extractProfile(document, href);
    expect(result.profile.evidence).toEqual([]);
    expect(result.profile.eligibilitySignals.minorMentioned).toBe(true);
  });
  it('preserves eligibility checks and evidence limits', async () => {
    profile(`I am 17. Please don't message me. ${'I enjoy pottery. '.repeat(1000)}`);
    const result = await extractProfile(document, href);
    expect(result.profile.eligibilitySignals).toEqual({
      minorMentioned: true,
      noRomanticContact: true,
    });
    expect(result.profile.truncated).toBe(true);
    expect(result.profile.evidence.reduce((n, e) => n + e.text.length, 0)).toBeLessThanOrEqual(
      12000,
    );
    expect(result.profile.evidence.every((e) => e.text.length <= 600)).toBe(true);
  });
  it('does not apply the Instagram adapter to lookalike domains', async () => {
    profile();
    await expect(
      extractProfile(document, 'https://instagram.com.example.org/alex.morgan/'),
    ).rejects.toThrow(/one profile/);
  });
});
