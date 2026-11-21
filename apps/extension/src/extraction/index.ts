import {
  cleanText,
  redactText,
  detectEligibility,
  type Evidence,
  type LocalSnapshot,
} from '@profile-lens/contracts';

import { isVisible, visibleText } from './dom';
import { linkedInSections, linkedInText, linkedInHeader, type ProfileBlock } from './linkedin';
export { isVisible, visibleText } from './dom';

export function isLinkedInProfile(href: string): boolean {
  const url = new URL(href);
  return (
    (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) &&
    /^\/in\/[^/]+\/?$/.test(url.pathname)
  );
}
function isInstagram(url: URL): boolean {
  return url.hostname === 'instagram.com' || url.hostname === 'www.instagram.com';
}
function instagramHandle(href: string): string | null {
  const url = new URL(href);
  if (!isInstagram(url)) return null;
  const handle = url.pathname.match(/^\/([a-z0-9._]{1,30})\/?$/i)?.[1];
  if (
    !handle ||
    /^(accounts|about|api|challenge|developer|developers|direct|directory|emails|explore|legal|oauth|p|privacy|push|reel|reels|stories|terms|tv|web)$/i.test(
      handle,
    )
  )
    return null;
  return handle;
}
function instagramOwner(root: HTMLElement, href: string): string {
  const handle = instagramHandle(href);
  const headings = [...root.querySelectorAll('h1,h2,[role="heading"]')].filter(isVisible);
  return handle &&
    headings.some(
      (node) => visibleText(node).replace(/^@/, '').toLowerCase() === handle.toLowerCase(),
    )
    ? `@${handle}`
    : '';
}
/** The display name Instagram puts beside the handle. The page title states it as
 * "Name (@handle)"; that alone is not trusted, so the same text must also be visible in the
 * profile header. Bio lines such as a school never appear in the title, so cannot match. */
function instagramName(doc: Document, root: HTMLElement, href: string): string | null {
  const handle = instagramHandle(href)?.toLowerCase();
  const titles = [
    doc.title,
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '',
  ];
  for (const title of titles) {
    const match = title.match(/^(?:\(\d+\)\s*)?(.+?)\s*\(@([a-z0-9._]+)\)/i);
    const name = cleanText(match?.[1] ?? '');
    if (
      name &&
      match![2]!.toLowerCase() === handle &&
      [...root.querySelectorAll('[dir="auto"],span,h1')].some(
        (node) => isVisible(node) && visibleText(node) === name,
      )
    )
      return name.slice(0, 120);
  }
  // Signed-in pages often have a bare title, and after in-app navigation the metadata can
  // describe the previous profile. Then use the page structure: Instagram renders the name
  // as the first plain text element of the header, before the counts and the bio (which
  // sits inside its own expander control). Anything long or link-like is not a name.
  const first = [...root.querySelectorAll('[dir="auto"]')].find(
    (node) =>
      isVisible(node) &&
      !node.querySelector('[dir="auto"]') &&
      !node.closest('a,button,[role="button"],h2,ul,ol,[role="dialog"],[role="menu"]') &&
      visibleText(node),
  );
  const text = first ? visibleText(first) : '';
  return text.length <= 40 &&
    text.split(/\s+/).length <= 5 &&
    !/[@/\d]|\.[a-z]{2,}\b|\b(?:posts?|followers?|following)$/i.test(text)
    ? text || null
    : null;
}
function instagramBioNodes(root: HTMLElement): Element[] {
  const selector = 'p,[dir="auto"]';
  const nodes = [...root.querySelectorAll(selector)].filter((node) => {
    if (
      !isVisible(node) ||
      node.closest('a,button,h1,h2,[role="heading"],ul,ol,[role="dialog"],[role="menu"]') ||
      node.querySelector('button,[role="button"],h1,h2,[role="heading"],ul,ol,[role="dialog"]')
    )
      return false;
    // Instagram wraps the bio text in a "more" expander: a role=button inside the bio's own
    // text span. Controls such as Follow are role=buttons with no text span around them.
    const control = node.closest('[role="button"]');
    return !control || Boolean(control.parentElement?.closest(selector));
  });
  // Keep a bio sentence together when Instagram splits it into nested spans.
  // Broad header wrappers containing controls/statistics are excluded above.
  return nodes.filter(
    (node) =>
      !nodes.some((parent) => parent !== node && parent.contains(node)) &&
      !/^[\d.,]+\s*[KMB]?\s+(?:posts?|followers?|following)$/i.test(visibleText(node)),
  );
}
/** The owner's website links: anchors leaving Instagram, or the "site.com and 2 more" button.
 * Follower counts, mutual-follower lines and other in-app links are not profile details. */
function instagramLinkNodes(root: HTMLElement, href: string): Element[] {
  return [...root.querySelectorAll('a[href],button')].flatMap((control) => {
    if (!isVisible(control) || control.closest('ul,ol,[role="dialog"],[role="menu"],h1,h2'))
      return [];
    // Read the label element, not the control: icons carry their own hidden titles.
    const label = control.querySelector('[dir="auto"]') ?? control;
    if (control.matches('button'))
      return /^(?:https?:\/\/|www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+/i.test(visibleText(label))
        ? [label]
        : [];
    try {
      const host = new URL(control.getAttribute('href')!, href).hostname;
      // Instagram routes external links through l.instagram.com. Its own Threads badge
      // is an app shortcut, not a detail the owner wrote.
      return host === 'l.instagram.com' ||
        !/(^|\.)(?:instagram\.com|threads\.(?:net|com))$/.test(host)
        ? [label]
        : [];
    } catch {
      return [];
    }
  });
}
export function profileRoot(doc: Document, href = doc.location.href): HTMLElement | null {
  // Read only a profile header whose visible username matches the current route.
  // Never fall back to the feed, grid, post dialogs, or document metadata.
  if (isInstagram(new URL(href))) {
    const headers = [
      ...doc.querySelectorAll<HTMLElement>('main header,[role="main"] header'),
    ].filter((node) => isVisible(node) && instagramOwner(node, href));
    return headers.length === 1 ? headers[0]! : null;
  }
  // LinkedIn's newer layout uses a labelled container instead of a main element.
  if (isLinkedInProfile(href)) {
    const primary = doc.querySelector<HTMLElement>('[aria-label="Primary content"]');
    if (primary && isVisible(primary)) return primary;
  }
  return (
    doc.querySelector<HTMLElement>('main,[role="main"]') ??
    doc.querySelector<HTMLElement>('article')
  );
}
function ownerName(doc: Document, root: HTMLElement, href: string): string {
  if (isInstagram(new URL(href))) return instagramOwner(root, href);
  const names = [...root.querySelectorAll('h1')].filter(
    (node) => isVisible(node) && !node.closest('[role="dialog"]'),
  );

  if (names.length === 1 && names[0]) return visibleText(names[0]);
  if (names.length > 1 || !isLinkedInProfile(href)) return '';
  // A title alone is not evidence: require the same name in visible profile content.
  const match = doc.title.match(/^(?:\(\d+\)\s*)?(.+?)\s*\|\s*LinkedIn$/);
  const name = cleanText(match?.[1] ?? '');
  if (!name) return '';
  return [...root.querySelectorAll('a,span,p,h2')].some(
    (node) => isVisible(node) && visibleText(node) === name,
  )
    ? name
    : '';
}
export async function fingerprint(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function identityText(doc: Document, href: string) {
  const root = profileRoot(doc, href);
  return `${href}|${root ? ownerName(doc, root, href) : ''}`;
}

export async function extractProfile(
  doc: Document,
  href: string,
  captured?: { blocks: ProfileBlock[]; warnings: string[] },
): Promise<LocalSnapshot> {
  const url = new URL(href);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (isInstagram(url) && !instagramHandle(href)) ||
    /\/(?:feed|messaging|inbox|search|company|companies)(?:\/|$)/i.test(url.pathname)
  )
    throw new Error('Open an individual profile, or paste their profile text instead.');
  const root = profileRoot(doc, href);
  if (!root) throw new Error('No main profile was found. Use Paste profile text.');
  const name = ownerName(doc, root, href);
  if (!name)
    throw new Error('This page does not identify one profile owner. Use Paste profile text.');
  const displayName = name.slice(0, 120);
  const givenName = isInstagram(url) ? instagramName(doc, root, href) : displayName;
  const linkedin = isLinkedInProfile(href);
  const instagram = isInstagram(url);
  const selector = 'p,li';
  const sections = linkedin ? [...linkedInHeader(root), ...linkedInSections(root)] : [];
  const nodes = instagram
    ? [...instagramBioNodes(root), ...instagramLinkNodes(root, href)]
    : linkedin
      ? sections.map(({ node }) => node)
      : [...root.querySelectorAll(selector)].filter(isVisible);
  const evidence: Evidence[] = [];
  const seen = new Set<string>();
  const safetyParts: string[] = [];
  let total = 0;
  let truncated = false;
  const blocks: (ProfileBlock & { minLength?: number })[] =
    captured?.blocks ??
    nodes.slice(0, 250).flatMap((node) => {
      if (!linkedin && !instagram && node.querySelector(selector)) return [];
      if (instagram) {
        const link = Boolean(node.closest('a,button'));
        return [
          {
            text: visibleText(node),
            label: link ? 'Instagram link' : 'Instagram bio',
            // Text inside the bio expander or a website link is certainly the owner's, so
            // short bios count. Loose short text may be the display name; keep the 12 minimum.
            minLength: link || node.closest('[role="button"]') ? 2 : 12,
          },
        ];
      }
      return [
        {
          text: linkedin ? linkedInText(node) : visibleText(node),
          label: cleanText(
            sections.find((section) => section.node === node)?.label ??
              node.closest('section')?.querySelector('h2,h3')?.textContent ??
              'Profile',
          ).slice(0, 80),
        },
      ];
    });
  const maxSnippets = linkedin ? 120 : 30;
  const maxCharacters = linkedin ? 60000 : 12000;
  for (const block of blocks) {
    const raw = block.text;
    // Short bios can still contain an age or contact boundary, even when they
    // are too short to retain as useful conversation evidence.
    if (instagram && raw) safetyParts.push(raw);
    if (
      !raw ||
      raw === displayName ||
      raw === givenName ||
      raw.length < (block.minLength ?? 12) ||
      seen.has(raw)
    )
      continue;
    seen.add(raw);
    if (!instagram) safetyParts.push(raw);
    const clean = redactText(raw);
    const sectionLabel = block.label;
    const sourceKind =
      sectionLabel === 'Headline'
        ? 'headline'
        : /project/i.test(sectionLabel)
          ? 'project'
          : /experience|work/i.test(sectionLabel)
            ? 'experience'
            : 'bio';
    for (let offset = 0; offset < clean.length; offset += 600) {
      if (evidence.length >= maxSnippets || total >= maxCharacters) {
        truncated = true;
        break;
      }
      const text = clean.slice(offset, offset + Math.min(600, maxCharacters - total));
      evidence.push({
        id: `e${evidence.length + 1}`,
        text,
        sectionLabel,
        sourceKind,
        attribution: 'profile_owner',
      });
      total += text.length;
    }
  }
  if (nodes.length > 250) truncated = true;
  if (evidence.length === 0 && !instagram)
    throw new Error(
      'The profile opened, but no readable profile details were found. Let the About or Experience sections load, then try again, or paste profile text.',
    );
  const warnings = [...(captured?.warnings ?? [])];
  if (instagram && !evidence.length)
    warnings.push(
      'No readable bio text was captured. You can still analyse profile images. If the bio is still loading, read the profile again.',
    );
  return {
    profile: {
      snapshotId: crypto.randomUUID(),
      displayName,
      ownerName: givenName,
      evidence,
      truncated,
      eligibilitySignals: detectEligibility(safetyParts.join('\n')),
    },
    tabId: null,
    routeFingerprint: await fingerprint(identityText(doc, href)),
    canonicalDisplayUrl: `${url.origin}${url.pathname}`,
    adapterId: instagram ? 'instagram-best-effort' : linkedin ? 'linkedin-best-effort' : 'generic',
    capturedAt: new Date().toISOString(),
    inputRevision: 0,
    captureWarnings: warnings.length ? warnings : undefined,
  };
}
