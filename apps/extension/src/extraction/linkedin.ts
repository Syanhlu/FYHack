import { cleanText } from '@profile-lens/contracts';
import { isVisible, visibleText } from './dom';

export type ProfileBlock = { label: string; text: string };
const labels: Record<string, string> = {
  about: 'About',
  summary: 'About',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Licenses & certifications',
  licenses_and_certifications: 'Licenses & certifications',
  volunteering: 'Volunteering',
  volunteer_experience: 'Volunteering',
  volunteering_experiences: 'Volunteering',
  honors: 'Honors & awards',
  honors_and_awards: 'Honors & awards',
  publications: 'Publications',
  languages: 'Languages',
  courses: 'Courses',
  organizations: 'Organizations',
  patents: 'Patents',
  test_scores: 'Test scores',
};
function normalize(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s*[([]?\d+[)\]]?\s*$/, '')
    .trim()
    .replace(/[\s-]+/g, '_');
}
export function sectionLabel(value: string): string | undefined {
  const key = normalize(value);
  return labels[key];
}
const headings = 'h2,h3,[role="heading"]';
const blocked =
  /^(activity|recommendations|interests|people_also_viewed|people_you_may_know|featured|services)$/;
function marker(node: Element) {
  return sectionLabel(node.id) ?? sectionLabel(visibleText(node));
}
function boundary(node: Element) {
  return marker(node) || blocked.test(normalize(visibleText(node)));
}

/** Structural anchors work independently of the interface language. Job headings are
 * not section boundaries; only recognised profile headings separate sections. */
export function linkedInSections(root: HTMLElement): { node: Element; label: string }[] {
  const seeds = [...root.querySelectorAll(`${headings},[id]`)].filter(
    (node) =>
      isVisible(node) && (sectionLabel(node.id) || (node.matches(headings) && marker(node))),
  );
  const result: { node: Element; label: string }[] = [];
  for (const seed of seeds) {
    const label = marker(seed)!;
    let candidate: Element = seed;
    for (let node = seed.parentElement; node && node !== root; node = node.parentElement) {
      const otherSection =
        [...node.querySelectorAll(headings)].some(
          (heading) => isVisible(heading) && boundary(heading) && marker(heading) !== label,
        ) ||
        [...node.querySelectorAll('[id]')].some(
          (anchor) => sectionLabel(anchor.id) && sectionLabel(anchor.id) !== label,
        );
      if (otherSection || node.querySelector('h1')) break;
      candidate = node;
      if (node.matches('section,.artdeco-card')) break;
    }
    if (!result.some((section) => section.node === candidate))
      result.push({ node: candidate, label });
  }
  return result.filter(
    (section) =>
      !result.some(
        (other) =>
          other !== section && other.label === section.label && other.node.contains(section.node),
      ),
  );
}

export function linkedInHeader(root: HTMLElement): { node: Element; label: string }[] {
  // Only fields before the first content section belong to the top card.
  const sections = linkedInSections(root);
  const firstBoundary = [...root.querySelectorAll(`${headings},[id]`)].find(
    (node) =>
      isVisible(node) && (sectionLabel(node.id) || (node.matches(headings) && boundary(node))),
  );
  return [
    ...root.querySelectorAll(
      '.text-body-medium,.text-body-small.inline,.pv-text-details__left-panel',
    ),
  ]
    .filter(
      (node) =>
        isVisible(node) &&
        !sections.some((section) => section.node.contains(node)) &&
        (!firstBoundary || Boolean(node.compareDocumentPosition(firstBoundary) & 4)) &&
        !node.closest('aside,nav,[role="dialog"]') &&
        !node.querySelector('h2,h3'),
    )
    .filter((node, _index, nodes) => !nodes.some((other) => other !== node && other.contains(node)))
    .map((node) => ({ node, label: 'Headline' }));
}

export function linkedInText(element: Element): string {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  const parts: string[] = [];
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement;
    if (!parent || !isVisible(parent) || parent.closest('button,[role="button"]')) continue;
    const anchor = parent.closest('a');
    if (anchor && /^(?:show all|see all|see more|show more)\b/i.test(visibleText(anchor))) continue;
    parts.push(walker.currentNode.textContent ?? '');
  }
  return cleanText(parts.join(' '));
}

export function detailLink(anchor: HTMLAnchorElement, profileUrl: string): string | null {
  const profile = new URL(profileUrl);
  let url: URL;
  try {
    url = new URL(anchor.getAttribute('href') ?? '', profile);
  } catch {
    return null;
  }
  const prefix = `${profile.pathname.replace(/\/$/, '')}/details/`;
  if (url.origin !== profile.origin || !url.pathname.startsWith(prefix)) return null;
  const kind = url.pathname.slice(prefix.length).replace(/\/$/, '');
  return sectionLabel(kind) ? url.href : null;
}
