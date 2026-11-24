import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';

// Injected on toolbar click: a draggable, resizable floating panel inside the page, so it
// stays on top of the site even when Chrome is fullscreen. Clicking the icon again closes it.
export default defineUnlistedScript(() => {
  const ID = 'profile-lens-overlay';
  const existing = document.getElementById(ID);
  if (existing) {
    existing.remove();
    return;
  }
  const host = document.createElement('div');
  host.id = ID;
  host.style.cssText = 'all:initial;position:fixed;top:16px;right:16px;z-index:2147483647;';
  // Closed shadow root: the site's styles and scripts cannot restyle or reach into the panel.
  const root = host.attachShadow({ mode: 'closed' });

  const box = document.createElement('div');
  box.style.cssText =
    'display:flex;flex-direction:column;box-sizing:border-box;width:400px;height:min(720px,calc(100vh - 32px));' +
    'min-width:320px;min-height:260px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);' +
    'resize:both;overflow:hidden;padding-bottom:10px;background:#f5f7fc;border:1px solid #dce2ef;' +
    'border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.28);';

  const bar = document.createElement('div');
  bar.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;flex:none;height:34px;padding:0 6px 0 12px;' +
    'cursor:move;user-select:none;touch-action:none;background:#182747;color:#f5f7fc;' +
    'font:600 12px system-ui,sans-serif;';
  bar.textContent = 'WingMan';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Close WingMan');
  close.style.cssText =
    'all:unset;cursor:pointer;width:26px;height:26px;text-align:center;border-radius:6px;font:14px system-ui,sans-serif;color:#f5f7fc;';
  close.addEventListener('click', () => host.remove());
  bar.append(close);

  const frame = document.createElement('iframe');
  frame.title = 'WingMan';
  frame.allow = 'autoplay'; // romantic results play generated ambient music
  frame.src = chrome.runtime.getURL('/panel.html');
  frame.style.cssText = 'flex:1;width:100%;min-height:0;border:0;background:#f5f7fc;';

  // Pointer capture keeps the drag alive when the cursor crosses the iframe.
  let grab: { x: number; y: number } | null = null;
  bar.addEventListener('pointerdown', (event) => {
    if (event.target === close || event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    grab = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    bar.setPointerCapture(event.pointerId);
  });
  bar.addEventListener('pointermove', (event) => {
    if (!grab) return;
    const rect = host.getBoundingClientRect();
    const left = Math.min(Math.max(event.clientX - grab.x, 0), innerWidth - rect.width);
    // Keep the title bar reachable so the panel can always be dragged back.
    const top = Math.min(Math.max(event.clientY - grab.y, 0), innerHeight - 34);
    host.style.left = `${Math.max(left, 0)}px`;
    host.style.top = `${top}px`;
    host.style.right = 'auto';
  });
  const drop = () => (grab = null);
  bar.addEventListener('pointerup', drop);
  bar.addEventListener('pointercancel', drop);

  // Fade only after the user clicks out onto the page, so the page behind is readable;
  // clicking back into the panel makes it solid again.
  box.style.transition = 'opacity .2s';
  const setFaded = (faded: boolean) => (box.style.opacity = faded ? '0.35' : '1');
  document.addEventListener(
    'pointerdown',
    (event) => host.isConnected && setFaded(event.target !== host),
    true,
  );
  // Clicks inside the iframe never reach this document; focus moving into it blurs the
  // page window instead (the host is then the page's activeElement).
  window.addEventListener('blur', () =>
    setTimeout(() => document.activeElement === host && setFaded(false)),
  );

  box.append(bar, frame);
  root.append(box);
  document.documentElement.append(host);
});
