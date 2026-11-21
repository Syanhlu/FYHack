import { identityText, isLinkedInProfile, profileRoot } from './index';
import { isVisible, visibleText } from './dom';
import {
  detailLink,
  linkedInHeader,
  linkedInSections,
  linkedInText,
  sectionLabel,
  type ProfileBlock,
} from './linkedin';

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type CaptureOptions = {
  wait?: (ms: number) => Promise<void>;
  loadDetail?: (url: string, consume: (doc: Document) => Promise<void>) => Promise<void>;
  maxSteps?: number;
  timeoutMs?: number;
};

/** Render same-origin detail routes without navigating the user's profile tab.
 * Frame/CSP/login failures become explicit partial-capture warnings. */
async function loadDetail(doc: Document, url: string, consume: (doc: Document) => Promise<void>) {
  const frame = doc.createElement('iframe');
  frame.title = 'Profile Lens section reader';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1280px;height:900px;pointer-events:none;';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Section loading timed out.')), 6000);
      frame.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      frame.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Section could not load.'));
      };
      frame.src = url;
      doc.body.append(frame);
    });
    const detail = frame.contentDocument;
    if (!detail || new URL(detail.location.href).pathname !== new URL(url).pathname)
      throw new Error('Section is unavailable.');
    await consume(detail);
    if (detail.location.href !== url) throw new Error('Section changed while reading.');
  } finally {
    frame.remove();
  }
}

export async function captureLinkedIn(doc: Document, href: string, options: CaptureOptions = {}) {
  if (!isLinkedInProfile(href)) return undefined;
  const wait = options.wait ?? pause;
  const deadline = Date.now() + (options.timeoutMs ?? 60000);
  const maxSteps = options.maxSteps ?? 35;
  const warnings = new Set<string>();
  const blocks = new Map<string, string[]>();
  const links = new Map<string, string>();
  const clicked = new WeakMap<Element, string>();
  const view = doc.defaultView!;
  const position = { x: view.scrollX, y: view.scrollY };
  const initialUrl = doc.location.href;
  let identity = '';
  function guard() {
    if (doc.location.href !== initialUrl || (identity && identityText(doc, href) !== identity))
      throw new Error('The profile changed while reading. Read the current profile again.');
  }
  function remember(label: string, text: string) {
    if (!text) return;
    const previous = blocks.get(label) ?? [];
    if (previous.some((value) => value.includes(text))) return;
    blocks.set(label, [...previous.filter((value) => !text.includes(value)), text]);
  }
  function collect(root: HTMLElement, label?: string) {
    if (label) remember(label, linkedInText(root));
    else
      for (const section of [...linkedInHeader(root), ...linkedInSections(root)]) {
        remember(section.label, linkedInText(section.node));
        for (const anchor of section.node.querySelectorAll<HTMLAnchorElement>('a[href]')) {
          const url = detailLink(anchor, href);
          if (url && isVisible(anchor)) links.set(url, section.label);
        }
      }
  }
  async function expand(root: HTMLElement, label?: string) {
    for (let pass = 0; pass < 12 && Date.now() < deadline; pass++) {
      guard();
      const scopes = label
        ? [{ node: root, label }]
        : [...linkedInHeader(root), ...linkedInSections(root)];
      let changed = false;
      for (const section of scopes) {
        for (const control of section.node.querySelectorAll<HTMLElement>(
          'button,[role="button"],a',
        )) {
          const text = (control.getAttribute('aria-label') || visibleText(control)).trim();
          if (
            !isVisible(control) ||
            (clicked.has(control) &&
              (!/^show more\b/i.test(text) ||
                clicked.get(control) === linkedInText(section.node))) ||
            control.matches(':disabled,[aria-disabled="true"]')
          )
            continue;
          if (
            !/^(?:(?:…|\.{3})\s*)?(?:see more|show more|show all|see all)(?:\b|$)/i.test(text) &&
            !control.matches('.inline-show-more-text__button')
          )
            continue;
          // Links to detail routes are read separately; never follow company or other profiles.
          if (control.hasAttribute('href') && !/^#?$/.test(control.getAttribute('href')!)) continue;
          clicked.set(control, linkedInText(section.node));
          const dialogsBefore = new Set(
            [...root.ownerDocument.querySelectorAll('[role="dialog"]')].filter(isVisible),
          );
          control.click();
          changed = true;
          await wait(350);
          guard();
          for (const dialog of root.ownerDocument.querySelectorAll<HTMLElement>(
            '[role="dialog"]',
          )) {
            if (dialogsBefore.has(dialog) || !isVisible(dialog)) continue;
            // Only harvest a newly opened dialog tied to this recognised section.
            await scan(root.ownerDocument, section.label, dialog);
            collect(dialog, section.label);
            const close = [...dialog.querySelectorAll<HTMLElement>('button,[role="button"]')].find(
              (button) =>
                /^(dismiss|close)(?:\b|$)/i.test(
                  button.getAttribute('aria-label') || visibleText(button),
                ),
            );
            if (!close)
              throw new Error('Close the opened profile section, then read the profile again.');
            close.click();
            await wait(150);
          }
        }
      }
      collect(root, label);
      if (!changed) return;
    }
    warnings.add('Some expandable profile content reached the loading limit.');
  }
  async function scan(target: Document, label?: string, dialog?: HTMLElement) {
    let stable = 0;
    let last = '';
    for (let step = 0; step < maxSteps && Date.now() < deadline; step++) {
      guard();
      let root = dialog ?? profileRoot(target, href);
      if (root && label && !dialog) {
        const section = linkedInSections(root).find((item) => item.label === label);
        const heading = [...root.querySelectorAll('h1,h2,[role="heading"]')].find(
          (node) => isVisible(node) && sectionLabel(visibleText(node)) === label,
        );
        // A detail route holds only this section, and LinkedIn titles it with a plain <p>.
        root = (section?.node as HTMLElement) ?? (heading || target !== doc ? root : null);
      }
      if (!root) {
        await wait(300);
        continue;
      }
      await expand(root, label);
      collect(root, label);
      const win = target.defaultView!;
      const panel =
        dialog &&
        [dialog, ...dialog.querySelectorAll<HTMLElement>('*')]
          .filter(
            (node) =>
              /auto|scroll/.test(win.getComputedStyle(node).overflowY) &&
              node.scrollHeight > node.clientHeight,
          )
          .sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight))[0];
      const height =
        panel?.scrollHeight ??
        (dialog
          ? dialog.scrollHeight
          : (target.scrollingElement?.scrollHeight ?? target.documentElement.scrollHeight));
      const top = panel?.scrollTop ?? (dialog ? dialog.scrollTop : win.scrollY);
      const viewport = panel?.clientHeight ?? (dialog ? dialog.clientHeight : win.innerHeight);
      const signature = `${height}|${linkedInText(root)}`;
      const atBottom = top + viewport >= height - 5;
      stable = atBottom && signature === last ? stable + 1 : 0;
      if (stable >= 3) return;
      last = signature;
      const nextTop = Math.min(top + Math.max(600, viewport * 0.8), height);
      if (dialog) (panel ?? dialog).scrollTop = nextTop;
      else win.scrollTo({ top: nextTop, behavior: 'instant' });
      await wait(400);
    }
    warnings.add(`Some ${label ?? 'profile'} content may not have finished loading.`);
  }
  try {
    // Give SPA profile identity and sections a chance to mount before capture.
    for (let i = 0; i < 15; i++) {
      guard();
      const root = profileRoot(doc, href);
      if (root && identityText(doc, href) !== `${href}|` && linkedInSections(root).length) break;
      await wait(300);
    }
    identity = identityText(doc, href);
    view.scrollTo({ top: 0, behavior: 'instant' });
    await scan(doc);
    const details = [...links];
    for (const [url, label] of details.slice(0, 15)) {
      guard();
      if (Date.now() >= deadline) {
        warnings.add('Some Show all sections could not be read before the time limit.');
        break;
      }
      const preview = blocks.get(label);
      try {
        await (options.loadDetail ?? ((url, consume) => loadDetail(doc, url, consume)))(
          url,
          async (detail) => {
            const previous = blocks.get(label);
            blocks.delete(label);
            try {
              await scan(detail, label);
              if (!blocks.get(label)?.length) throw new Error('Empty section.');
            } catch (error) {
              if (previous) blocks.set(label, previous);
              throw error;
            }
          },
        );
      } catch {
        if (preview) blocks.set(label, preview);
        guard();
        warnings.add(
          `${label}: Show all could not be fully read. Expand it manually or paste the missing text.`,
        );
      }
    }
    if (details.length > 15)
      warnings.add('Additional Show all sections exceeded the capture limit.');
    guard();
    return {
      blocks: [...blocks].flatMap(([label, texts]) =>
        texts.map((text): ProfileBlock => ({ label, text })),
      ),
      warnings: [...warnings],
    };
  } finally {
    if (doc.location.href === initialUrl)
      view.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
  }
}
