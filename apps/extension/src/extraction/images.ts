import { redactText } from '@profile-lens/contracts';
import { isVisible, visibleText } from './dom';

export type PhotoCandidate = {
  key: string;
  source: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type PhotoScan = {
  candidates: PhotoCandidate[];
  width: number;
  height: number;
  scale: number;
  scrollX: number;
  scrollY: number;
  end: boolean;
  stopped: boolean;
  skipReason?: string;
  postText?: { path: string; text: string };
};
function label(node: Element) {
  return (
    node.getAttribute('aria-label') ||
    node.querySelector('[aria-label]')?.getAttribute('aria-label') ||
    node.textContent ||
    ''
  ).trim();
}
function control(root: Element, pattern: RegExp): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('button,[role="button"]')].find(
    (node) =>
      isVisible(node) &&
      !node.matches(':disabled,[aria-disabled="true"]') &&
      pattern.test(label(node)),
  );
}
const nextSlide = /^(Next|Next slide|Go to next slide)$/i;
// Instagram can link to /p/code or /username/p/code. Canonicalise by post code,
// but accept a username prefix only for the profile we actually captured.
export function instagramPostPath(href: string, profileHref: string): string | null {
  try {
    const profile = new URL(profileHref);
    const url = new URL(href, profileHref);
    const owner = profile.pathname.match(/^\/([a-z0-9._]+)\/?$/i)?.[1];
    const match = url.pathname.match(/^\/(?:([a-z0-9._]+)\/)?p\/([a-z0-9_-]+)\/?$/i);
    if (
      url.origin !== profile.origin ||
      !match ||
      (match[1] && match[1].toLowerCase() !== owner?.toLowerCase())
    )
      return null;
    return `/p/${match[2]}`;
  } catch {
    return null;
  }
}
export function visiblePostLink(node: HTMLAnchorElement, profileHref: string): boolean {
  if (
    !instagramPostPath(node.href, profileHref) ||
    !isVisible(node) ||
    node.closest('header,aside,nav,[data-recommendations],[data-author="other"]')
  )
    return false;
  // display:contents anchors have no box; their thumbnail is the visible click target.
  const thumbnail = node.querySelector('img,[role="img"],[style*="background-image"]');
  if (!thumbnail || !isVisible(thumbnail)) return false;
  const win = node.ownerDocument.defaultView!;
  return [node, thumbnail].some((element) => {
    const r = element.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.top < win.innerHeight &&
      r.bottom > 0 &&
      r.left < win.innerWidth &&
      r.right > 0
    );
  });
}
function modal(doc: Document): HTMLElement | undefined {
  return [...doc.querySelectorAll<HTMLElement>('[role="dialog"],[aria-modal="true"]')].find(
    isVisible,
  );
}
// Some Instagram layouts render post content with divs rather than an article.
// The owned dialog remains the boundary; never fall back to the profile/page body.
function postContent(doc: Document): HTMLElement | undefined {
  const dialog = modal(doc);
  if (!dialog) return;
  return [...dialog.querySelectorAll<HTMLElement>('article')].find(isVisible) ?? dialog;
}
// Read only the caption heading paired with the captured owner's author link.
// Comment bodies, recommendations and unlabelled dialog text are not captions.
export function instagramPostCaption(doc: Document, profileHref: string): string {
  const content = postContent(doc);
  if (!content) return '';
  const profile = new URL(profileHref);
  const ownerPath = profile.pathname.replace(/\/$/, '').toLowerCase();
  for (const caption of content.querySelectorAll('h1,h2')) {
    if (
      !isVisible(caption) ||
      caption.closest('header,aside,[data-author="other"],[data-recommendations]')
    )
      continue;
    const row = caption.closest('li') ?? caption.parentElement;
    if (!row || row === content) continue;
    const author = row.querySelector<HTMLAnchorElement>('a[href]');
    if (!author || !isVisible(author)) continue;
    const url = new URL(author.getAttribute('href')!, profileHref);
    if (
      url.origin !== profile.origin ||
      url.pathname.replace(/\/$/, '').toLowerCase() !== ownerPath
    )
      continue;
    const text = redactText(visibleText(caption));
    if (text && text.replace(/^@/, '').toLowerCase() !== ownerPath.slice(1)) return text;
  }
  return '';
}
type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};
function visibleMediaRect(img: HTMLImageElement | HTMLVideoElement): CropRect | null {
  const win = img.ownerDocument.defaultView!;
  const rect = img.getBoundingClientRect();
  let left = Math.max(0, rect.left),
    top = Math.max(0, rect.top);
  let right = Math.min(win.innerWidth, rect.right),
    bottom = Math.min(win.innerHeight, rect.bottom);
  // Carousel tracks retain off-screen images and clip them with overflow containers.
  for (let parent = img.parentElement; parent; parent = parent.parentElement) {
    const style = win.getComputedStyle(parent),
      bounds = parent.getBoundingClientRect();
    if (/^(hidden|clip|auto|scroll)$/.test(style.overflowX)) {
      left = Math.max(left, bounds.left);
      right = Math.min(right, bounds.right);
    }
    if (/^(hidden|clip|auto|scroll)$/.test(style.overflowY)) {
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
  }
  const width = right - left,
    height = bottom - top;
  // Cropping a visible portion is safe; never extend the screenshot crop beyond the image.
  return width >= 96 && height >= 96 && width * height >= rect.width * rect.height * 0.25
    ? { x: left, y: top, right, bottom, width, height }
    : null;
}
function media(doc: Document): HTMLImageElement | HTMLVideoElement | undefined {
  const content = postContent(doc);
  if (!content) return;
  return [...content.querySelectorAll<HTMLImageElement | HTMLVideoElement>('video,img')]
    .filter(
      (img) =>
        isVisible(img) &&
        (img.tagName === 'VIDEO' ||
          ((img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth)) &&
        !img.closest('header,aside,a,[data-author="other"],[data-recommendations]') &&
        visibleMediaRect(img),
    )
    .sort((a, b) => {
      const first = visibleMediaRect(a)!,
        second = visibleMediaRect(b)!;
      return (
        second.width * second.height - first.width * first.height ||
        Number(b.tagName === 'VIDEO') - Number(a.tagName === 'VIDEO')
      );
    })[0];
}
function carouselButton(doc: Document): HTMLElement | undefined {
  const image = media(doc);
  const article = postContent(doc);
  if (!image || !article) return;
  const rect = image.getBoundingClientRect();
  return [...article.querySelectorAll<HTMLElement>('button,[role="button"]')].find((node) => {
    if (
      !isVisible(node) ||
      node.matches(':disabled,[aria-disabled="true"]') ||
      !nextSlide.test(label(node))
    )
      return false;
    const r = node.getBoundingClientRect();
    // The carousel arrow is over the media; the next-post arrow is outside it.
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.x >= rect.x &&
      r.y >= rect.y &&
      r.right <= rect.right &&
      r.bottom <= rect.bottom
    );
  });
}
export function photoSelection(
  doc: Document,
  path = '',
): { candidates: PhotoCandidate[]; skipReason?: string } {
  const img = media(doc);
  if (!img || !path)
    return { candidates: [], skipReason: 'No loaded main photo with enough visible area.' };
  if (img.tagName === 'VIDEO') return { candidates: [], skipReason: 'Video slide skipped.' };
  // Capture the loaded image's visible bounds as rendered. Overlay styles and
  // hit-test targets do not determine whether a carousel slide can be analysed.
  const rect = visibleMediaRect(img)!;
  const source = img.currentSrc || img.src;
  if (!source) return { candidates: [], skipReason: 'The photo source is not ready.' };
  return {
    candidates: [
      {
        key: `${path}:${source}`,
        source,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    ],
  };
}
export function visiblePhotos(doc: Document, path = ''): PhotoCandidate[] {
  return photoSelection(doc, path).candidates;
}

// Navigation is limited to post links discovered in the captured profile's grid.
export function photoController(
  doc: Document,
  profileCurrent: () => boolean,
  ownerRetained = profileCurrent,
) {
  const win = doc.defaultView!;
  const profileHref = win.location.href;
  let active = false,
    stopped = false,
    ended = false;
  let captureId = '',
    expectedPost = '';
  let openedDialog: HTMLElement | undefined;
  let transitionUntil = 0,
    slides = 0,
    scrolls = 0,
    empty = 0;
  let start = { x: 0, y: 0 },
    expected = { x: 0, y: 0 };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const visited = new Set<string>();
  const stop = () => {
    stopped = true;
  };
  const onExpectedPost = () => {
    const expectedRoute = instagramPostPath(win.location.href, profileHref) === expectedPost;
    const originalRoute = win.location.href === profileHref;
    const dialog = modal(doc);
    // Some modal layouts keep the profile URL. Bind the newly opened dialog to
    // this specific click, rather than accepting any dialog on the profile.
    if (
      !openedDialog &&
      !stopped &&
      expectedPost &&
      Date.now() < transitionUntil &&
      dialog &&
      (expectedRoute || originalRoute)
    )
      openedDialog = dialog;
    return expectedRoute || (originalRoute && !!openedDialog && openedDialog === dialog);
  };
  const current = () =>
    profileCurrent() ||
    (active &&
      !!expectedPost &&
      ownerRetained() &&
      onExpectedPost() &&
      (!!modal(doc) || Date.now() < transitionUntil));
  const scroll = () => {
    if (
      !expectedPost &&
      (Math.abs(win.scrollX - expected.x) > 2 || Math.abs(win.scrollY - expected.y) > 2)
    )
      stop();
  };
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
  const waitFor = async (
    test: () => boolean,
    message: string,
    timeoutMs = 10000,
    allowStopped = false,
  ) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!active || (!allowStopped && stopped)) throw new Error('Photo browsing stopped.');
      if (test()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(message);
  };
  const waitForSettledMedia = async (
    message: string,
    previous?: { element: HTMLImageElement | HTMLVideoElement; source: string },
  ) => {
    let stableElement: HTMLImageElement | HTMLVideoElement | undefined;
    let stableSource = '',
      stableBounds: number[] = [],
      stableSince = 0;
    await waitFor(
      () => {
        if (!current()) throw new Error('The profile changed.');
        const image = media(doc);
        const source = image?.currentSrc || image?.getAttribute('src') || '';
        if (
          !image ||
          (!source && image.tagName !== 'VIDEO') ||
          (image === previous?.element && source === previous.source)
        ) {
          stableElement = undefined;
          stableSource = '';
          stableBounds = [];
          stableSince = 0;
          return false;
        }
        const rect = image.getBoundingClientRect();
        // A new source can be visible long before the carousel stops translating.
        // Watch both the whole image and its clipped crop through consecutive polls.
        const crop = visibleMediaRect(image)!;
        const next = [
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
        ];
        if (
          image !== stableElement ||
          source !== stableSource ||
          next.some((value, i) => Math.abs(value - stableBounds[i]!) > 2)
        ) {
          stableElement = image;
          stableSource = source;
          stableBounds = next;
          stableSince = Date.now();
          return false;
        }
        return Date.now() - stableSince >= 500;
      },
      message,
      15000,
    );
  };
  const click = (node: HTMLElement) => {
    // Let Instagram's SPA handler run, but never follow an unhandled full-page link.
    const preventNavigation = (event: Event) => event.preventDefault();
    win.addEventListener('click', preventNavigation, { once: true });
    try {
      node.click();
    } finally {
      win.removeEventListener('click', preventNavigation);
    }
  };
  const closePost = async () => {
    if (!expectedPost) return;
    // Never close an unrelated modal or navigate back after the user left the owned post.
    if (!onExpectedPost() || !ownerRetained()) return;
    const dialog = modal(doc);
    if (!dialog) throw new Error('The opened post is no longer available.');
    const close =
      control(dialog, /^(Close|Close post)$/i) ?? control(doc.body, /^(Close|Close post)$/i);
    if (!close) throw new Error('Close the Instagram post to return to the profile.');
    transitionUntil = Date.now() + 12000;
    click(close);
    await waitFor(
      () => profileCurrent() && !modal(doc),
      'The post closed slowly or the original profile was not restored. Return to the profile and read it again.',
      10000,
      true,
    );
    expectedPost = '';
    openedDialog = undefined;
    expected = { x: win.scrollX, y: win.scrollY };
  };
  const dispose = async () => {
    const interrupted = stopped;
    stopped = true;
    clearTimeout(timer);
    events.forEach((event) => doc.removeEventListener(event, stop, true));
    win.removeEventListener('scroll', scroll);
    doc.removeEventListener('visibilitychange', stop);
    try {
      if (active) await closePost();
      if (active && !interrupted && profileCurrent())
        win.scrollTo({ left: start.x, top: start.y, behavior: 'instant' });
    } finally {
      active = false;
    }
  };
  const openNext = async () => {
    await closePost();
    if (!active || stopped || !profileCurrent())
      throw new Error('The profile changed or browsing stopped.');
    while (scrolls <= 60 && visited.size < 200) {
      const links = [
        ...doc.querySelectorAll<HTMLAnchorElement>('main a[href],[role="main"] a[href]'),
      ];
      const link = links.find((node) => {
        const path = instagramPostPath(node.href, profileHref);
        return path && !visited.has(path) && visiblePostLink(node, profileHref);
      });
      if (link) {
        expectedPost = instagramPostPath(link.href, profileHref)!;
        visited.add(expectedPost);
        slides = 0;
        empty = 0;
        transitionUntil = Date.now() + 12000;
        click(link);
        await waitFor(
          () => onExpectedPost() && !!modal(doc),
          'Instagram did not open the selected post in a readable dialog.',
        );
        await waitFor(
          () => !!media(doc),
          'The post opened, but its main photo did not load or could not be identified. This Instagram layout may be unsupported.',
          15000,
        );
        await waitForSettledMedia('The opened slide did not finish moving or loading.');
        if (!active || stopped || !current()) throw new Error('Photo browsing stopped.');
        return;
      }
      if (
        ++empty >= 3 ||
        scrolls >= 60 ||
        win.scrollY + win.innerHeight >= doc.documentElement.scrollHeight - 2
      ) {
        if (visited.size === 0)
          throw new Error(
            'No visible Instagram photo-post links were found in this layout. Open the profile Posts grid, then read the profile again.',
          );
        ended = true;
        return;
      }
      expected = {
        x: win.scrollX,
        y: Math.min(
          doc.documentElement.scrollHeight - win.innerHeight,
          win.scrollY + win.innerHeight * 0.65,
        ),
      };
      win.scrollTo({ left: expected.x, top: expected.y, behavior: 'instant' });
      expected = { x: win.scrollX, y: win.scrollY };
      scrolls++;
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (!active || stopped || !profileCurrent())
        throw new Error('The profile changed or browsing stopped.');
    }
    ended = true;
  };
  return {
    dispose,
    isCurrent: current,
    async command(action: string, id: string): Promise<PhotoScan | { ok: boolean }> {
      if (action !== 'begin' && id !== captureId) throw new Error('This photo run was replaced.');
      if (action === 'end') {
        await dispose();
        return { ok: true };
      }
      if (!current()) {
        stop();
        throw new Error('The profile changed.');
      }
      if (action === 'begin') {
        await dispose();
        if (modal(doc)) throw new Error('Close the current dialog before analysing profile posts.');
        captureId = id;
        active = true;
        stopped = false;
        ended = false;
        expectedPost = '';
        openedDialog = undefined;
        visited.clear();
        slides = scrolls = empty = 0;
        start = expected = { x: win.scrollX, y: win.scrollY };
        events.forEach((event) => doc.addEventListener(event, stop, true));
        win.addEventListener('scroll', scroll);
        doc.addEventListener('visibilitychange', stop);
        timer = setTimeout(
          () => {
            void dispose().catch(() => undefined);
          },
          30 * 60 * 1000,
        );
        await openNext();
      }
      if (!active) throw new Error('Photo capture is not active.');
      if (action === 'advance' && !stopped && !ended) {
        const next = carouselButton(doc);
        if (next && slides < 19) {
          const previousMedia = media(doc)!;
          const previous = {
            element: previousMedia,
            source: previousMedia.currentSrc || previousMedia.getAttribute('src') || '',
          };
          click(next);
          slides++;
          await waitForSettledMedia(
            'The next carousel slide did not finish loading or moving. Completed observations are still available.',
            previous,
          );
          if (!active || stopped || !current()) throw new Error('Photo browsing stopped.');
        } else await openNext();
      }
      return {
        ...(stopped || ended ? { candidates: [] } : photoSelection(doc, expectedPost)),
        postText:
          !stopped && !ended && expectedPost
            ? { path: expectedPost, text: instagramPostCaption(doc, profileHref) }
            : undefined,
        width: win.innerWidth,
        height: win.innerHeight,
        scale: win.devicePixelRatio,
        scrollX: win.scrollX,
        scrollY: win.scrollY,
        end: ended,
        stopped,
      };
    },
  };
}
