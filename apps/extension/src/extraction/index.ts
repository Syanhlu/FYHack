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
export function profileRoot(doc: Document, href = doc.location.href): HTMLElement | null {
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
    /\/(?:feed|messaging|inbox|search|company|companies)(?:\/|$)/i.test(url.pathname)
  )
    throw new Error('Open an individual profile, or paste their profile text instead.');
  const root = profileRoot(doc, href);
  if (!root) throw new Error('No main profile was found. Use Paste profile text.');
  const name = ownerName(doc, root, href);
  if (!name)
    throw new Error('This page does not identify one profile owner. Use Paste profile text.');
  const displayName = name.slice(0, 120);
  const linkedin = isLinkedInProfile(href);
  const selector = 'p,li';
  const sections = linkedin ? [...linkedInHeader(root), ...linkedInSections(root)] : [];
  const nodes = linkedin
    ? sections.map(({ node }) => node)
    : [...root.querySelectorAll(selector)].filter(isVisible);
  const evidence: Evidence[] = [];
  const seen = new Set<string>();
  const safetyParts: string[] = [];
  let total = 0;
  let truncated = false;
  const blocks =
    captured?.blocks ??
    nodes.slice(0, 250).flatMap((node) => {
      if (!linkedin && node.querySelector(selector)) return [];
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
    if (!raw || raw === displayName || raw.length < 12 || seen.has(raw)) continue;
    seen.add(raw);
    safetyParts.push(raw);
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
  if (evidence.length === 0)
    throw new Error(
      'The profile opened, but no readable profile details were found. Let the About or Experience sections load, then try again, or paste profile text.',
    );
  return {
    profile: {
      snapshotId: crypto.randomUUID(),
      displayName,
      evidence,
      truncated,
      eligibilitySignals: detectEligibility(safetyParts.join('\n')),
    },
    tabId: null,
    routeFingerprint: await fingerprint(identityText(doc, href)),
    canonicalDisplayUrl: `${url.origin}${url.pathname}`,
    adapterId: linkedin ? 'linkedin-best-effort' : 'generic',
    capturedAt: new Date().toISOString(),
    inputRevision: 0,
    captureWarnings: captured?.warnings,
  };
}
