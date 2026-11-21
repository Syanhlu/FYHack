import {
  cleanText,
  redactText,
  detectEligibility,
  type Evidence,
  type LocalSnapshot,
} from '@profile-lens/contracts';

const excluded =
  'nav,aside,footer,[hidden],[aria-hidden="true"],script,style,noscript,form,input,textarea,[contenteditable="true"],[data-author="other"],[data-recommendations],.comments-comments-list,.comments-comment-item,.artdeco-card[aria-label="People you may know"],.pv-browsemap-section';
export function isVisible(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.matches(excluded)) return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0')
      return false;
  }
  return true;
}
export function visibleText(element: Element): string {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  const parts: string[] = [];
  let count = 0;
  while (walker.nextNode() && count++ < 3000) {
    if (walker.currentNode.parentElement && isVisible(walker.currentNode.parentElement))
      parts.push(walker.currentNode.textContent ?? '');
  }
  return cleanText(parts.join(' '));
}
export function profileRoot(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('main') ?? doc.querySelector<HTMLElement>('article');
}
export async function fingerprint(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function identityText(doc: Document, href: string) {
  const root = profileRoot(doc);
  return `${href}|${root?.querySelector('h1')?.textContent?.trim() ?? ''}`;
}

export async function extractProfile(doc: Document, href: string): Promise<LocalSnapshot> {
  const url = new URL(href);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    /\/(?:feed|messaging|inbox|search|company|companies)(?:\/|$)/i.test(url.pathname)
  )
    throw new Error('Open an individual profile, or paste their profile text instead.');
  const root = profileRoot(doc);
  if (!root) throw new Error('No main profile was found. Use Paste profile text.');
  const names = [...root.querySelectorAll('h1')].filter(isVisible);
  const name = names[0];
  if (names.length !== 1 || !name || !visibleText(name))
    throw new Error('This page does not identify one profile owner. Use Paste profile text.');
  const displayName = visibleText(name).slice(0, 120);
  const linkedin = url.hostname.endsWith('linkedin.com') && url.pathname.startsWith('/in/');
  const selector = linkedin ? 'p,li,.text-body-medium,.inline-show-more-text' : 'p,li';
  const nodes = [...root.querySelectorAll(selector)].filter(isVisible);
  const evidence: Evidence[] = [];
  const seen = new Set<string>();
  const safetyParts: string[] = [];
  let total = 0;
  let truncated = false;
  for (const node of nodes.slice(0, 250)) {
    if (node.querySelector(selector)) continue;
    const raw = visibleText(node);
    if (!raw || raw === displayName || raw.length < 12 || seen.has(raw)) continue;
    seen.add(raw);
    safetyParts.push(raw);
    const clean = redactText(raw);
    const sectionLabel = cleanText(
      node.closest('section')?.querySelector('h2,h3')?.textContent ?? 'Profile',
    ).slice(0, 80);
    const sourceKind = /project/i.test(sectionLabel)
      ? 'project'
      : /experience|work/i.test(sectionLabel)
        ? 'experience'
        : 'bio';
    for (let offset = 0; offset < clean.length; offset += 600) {
      if (evidence.length >= 30 || total >= 12000) {
        truncated = true;
        break;
      }
      const text = clean.slice(offset, offset + Math.min(600, 12000 - total));
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
  };
}
