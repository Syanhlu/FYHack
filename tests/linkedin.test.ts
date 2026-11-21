// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureLinkedIn } from '../apps/extension/src/extraction/capture-linkedin';
import { extractProfile } from '../apps/extension/src/extraction';
import { detailLink, linkedInSections } from '../apps/extension/src/extraction/linkedin';
import { profileSchema } from '../packages/contracts/src';

const href = 'https://www.linkedin.com/in/alex/';
const wait = async () => {};
function page(body: string) {
  document.title = 'Alex Morgan | LinkedIn';
  document.body.innerHTML = `<main><h1>Alex Morgan</h1>${body}</main>`;
}
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

describe('LinkedIn section detection', () => {
  it('keeps nested jobs and separates adjacent sections in legacy and modern layouts', async () => {
    page(`<div><h2>Experience (2)</h2><div><h3>Engineer</h3><p>Build accessible tools.</p></div><div><h3>Lead engineer</h3><p>Mentor the engineering team.</p></div></div>
      <section><h2>Education</h2><h3>Example University</h3><p>Computer science graduate.</p></section>
      <section><h2>Activity</h2><p>Somebody else's repost.</p></section>`);
    for (const modern of [false, true]) {
      if (modern) document.querySelector('main')!.setAttribute('aria-label', 'Primary content');
      const result = await extractProfile(document, href);
      expect(result.profile.evidence.map((e) => e.sectionLabel)).toEqual([
        'Experience',
        'Education',
      ]);
      expect(result.profile.evidence[0].text).toContain('Lead engineer');
      expect(JSON.stringify(result)).not.toContain('repost');
    }
  });
  it('uses stable anchors with translated headings and retains headline and location', async () => {
    page(`<div class="pv-text-details__left-panel"><div class="text-body-medium">Engineer building accessible tools</div><span class="text-body-small inline">London, England</span></div>
      <section><div id="experience"></div><h2>Expérience</h2><h3>Ingénieur</h3><p>Création de logiciels accessibles.</p></section>
      <section><h2>Licenses and certifications</h2><p>Certified accessibility professional.</p></section>`);
    const result = await extractProfile(document, href);
    expect(result.profile.evidence.map((e) => e.sectionLabel)).toEqual([
      'Headline',
      'Experience',
      'Licenses & certifications',
    ]);
    expect(result.profile.evidence[0].sourceKind).toBe('headline');
    expect(result.profile.evidence[0].text).toContain('London');
  });
  it('deduplicates nested section anchors and ignores action text', async () => {
    page(
      '<section><div id="skills"></div><h2>Skills</h2><p>Accessible software design</p><button>Endorse</button><a href="/in/alex/details/skills/">Show all 40 skills</a></section>',
    );
    expect(linkedInSections(document.querySelector('main')!)).toHaveLength(1);
    const result = await extractProfile(document, href);
    expect(result.profile.evidence[0].text).toBe('Skills Accessible software design');
  });
  it('captures beyond the old limit and reports the new bound truthfully', async () => {
    page(`<section><h2>About</h2><p>${'Accessible software. '.repeat(900)}</p></section>`);
    const result = await extractProfile(document, href);
    expect(result.profile.evidence.length).toBeGreaterThan(30);
    expect(result.profile.truncated).toBe(false);
    expect(profileSchema.safeParse(result.profile).success).toBe(true);
    document.querySelector('p')!.textContent = 'Accessible software. '.repeat(4000);
    const large = await extractProfile(document, href);
    expect(large.profile.truncated).toBe(true);
    expect(large.profile.evidence.reduce((sum, e) => sum + e.text.length, 0)).toBe(60000);
    expect(profileSchema.safeParse(large.profile).success).toBe(true);
  });
});

describe('LinkedIn loading and expansion', () => {
  it('scrolls to load sections, expands text and restores the scroll position', async () => {
    page('<section><h2>About</h2><p>Short biography.</p><button>…see more</button></section>');
    document.querySelector('button')!.onclick = () => {
      document.querySelector('p')!.textContent =
        'Full biography including volunteering and mentoring.';
      document.querySelector('button')!.remove();
    };
    let loaded = false;
    const result = await captureLinkedIn(document, href, {
      wait: async () => {
        if (!loaded) {
          loaded = true;
          document
            .querySelector('main')!
            .insertAdjacentHTML(
              'beforeend',
              '<section><h2>Projects</h2><p>Built an accessible reading application.</p></section>',
            );
        }
      },
    });
    expect(result!.blocks.map((b) => b.label)).toEqual(['About', 'Projects']);
    expect(JSON.stringify(result)).toContain('Full biography');
    expect(JSON.stringify(result)).not.toContain('Short biography');
    expect(result!.warnings).toEqual([]);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0, behavior: 'instant' });
  });
  it('reads inline Show all dialogs once, closes them, and avoids unrelated buttons', async () => {
    page(
      '<section><h2>Skills</h2><p>Accessible design</p><button>Show all 20 skills</button><button>Connect</button></section><section><h2>Activity</h2><button>See more</button></section>',
    );
    const buttons = document.querySelectorAll('button');
    const connect = vi.fn();
    const activity = vi.fn();
    buttons[1].onclick = connect;
    buttons[2].onclick = activity;
    const show = vi.fn(() => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.innerHTML =
        '<h2>Skills</h2><p>Accessible design and inclusive research</p><button aria-label="Dismiss">X</button>';
      dialog.querySelector('button')!.onclick = () => dialog.remove();
      document.body.append(dialog);
    });
    buttons[0].onclick = show;
    const result = await captureLinkedIn(document, href, { wait });
    expect(JSON.stringify(result)).toContain('inclusive research');
    expect(show).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
    expect(activity).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('repeats Show more while a section is gaining entries', async () => {
    page(
      '<section><h2>Experience</h2><p>First engineering role.</p><button>Show more</button></section>',
    );
    let clicks = 0;
    document.querySelector('button')!.onclick = () => {
      clicks++;
      document.querySelector('p')!.append(` Additional engineering role ${clicks}.`);
      if (clicks === 3) document.querySelector('button')!.remove();
    };
    const result = await captureLinkedIn(document, href, { wait });
    expect(clicks).toBe(3);
    expect(JSON.stringify(result!.blocks)).toContain('Additional engineering role 3');
    expect(result!.warnings).toEqual([]);
  });
  it('reads same-profile detail routes and replaces shorter previews', async () => {
    page(
      '<section><h2>Skills</h2><p>Preview skill</p><a href="/in/alex/details/skills/">Show all skills</a><a href="/in/other/details/skills/">Show all other skills</a></section>',
    );
    const loadDetail = vi.fn(async (_url: string, consume: (doc: Document) => Promise<void>) => {
      const frame = document.createElement('iframe');
      document.body.append(frame);
      const detail = frame.contentDocument!;
      detail.body.innerHTML =
        '<main><h1>Skills</h1><p>Complete skill list with research and design</p></main>';
      vi.spyOn(frame.contentWindow!, 'scrollTo').mockImplementation(() => {});
      try {
        await consume(detail);
      } finally {
        frame.remove();
      }
    });
    const result = await captureLinkedIn(document, href, { wait, loadDetail });
    expect(loadDetail).toHaveBeenCalledTimes(1);
    expect(loadDetail.mock.calls[0][0]).toBe(`${href}details/skills/`);
    expect(JSON.stringify(result)).toContain('Complete skill list');
    expect(JSON.stringify(result)).not.toContain('Preview skill');
    expect(result!.warnings).toEqual([]);
  });
  it('keeps the preview and reports unavailable detail views', async () => {
    page(
      '<section><h2>Skills</h2><p>Preview skill</p><a href="/in/alex/details/skills/">Show all skills</a></section>',
    );
    const result = await captureLinkedIn(document, href, {
      wait,
      loadDetail: async () => {
        throw new Error('blocked');
      },
    });
    expect(JSON.stringify(result!.blocks)).toContain('Preview skill');
    expect(result!.warnings[0]).toMatch(/Skills: Show all/);
  });
  it('rejects identity changes instead of merging two profiles', async () => {
    page('<section><h2>About</h2><p>Accessible software development.</p></section>');
    await expect(
      captureLinkedIn(document, href, {
        wait: async () => {
          document.querySelector('h1')!.textContent = 'Different Person';
        },
      }),
    ).rejects.toThrow(/profile changed/);
  });
  it('bounds continuously growing pages and flags partial capture', async () => {
    page('<section><h2>About</h2><p>Accessible software development.</p></section>');
    const result = await captureLinkedIn(document, href, { maxSteps: 2, wait });
    expect(result!.warnings).toContain('Some profile content may not have finished loading.');
  });
  it('rejects cross-profile, cross-origin and unrelated detail links', () => {
    const anchor = document.createElement('a');
    for (const url of [
      'https://evil.example/in/alex/details/skills/',
      '/in/other/details/skills/',
      '/in/alex/details/recommendations/',
      '/in/alex/details/skills/extra',
    ]) {
      anchor.setAttribute('href', url);
      expect(detailLink(anchor, href)).toBeNull();
    }
  });
  it('leaves non-LinkedIn pages untouched', async () => {
    expect(await captureLinkedIn(document, 'https://example.com/alex')).toBeUndefined();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
