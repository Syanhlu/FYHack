import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  // The action click grants activeTab for the clicked tab. Show the panel as a floating
  // overlay inside that page; where pages cannot be scripted (chrome://, the Web Store),
  // fall back to a separate popup window that reads the clicked browser window.
  chrome.action.onClicked.addListener((tab) => {
    void (async () => {
      if (tab.id !== undefined) {
        // Recorded first: the panel refuses to run in a frame on any tab not listed here.
        const { overlayTabs } = await chrome.storage.session.get('overlayTabs');
        const tabs = Array.isArray(overlayTabs) ? (overlayTabs as number[]) : [];
        await chrome.storage.session.set({
          overlayTabs: [...tabs.filter((id) => id !== tab.id), tab.id].slice(-50),
        });
        const injected = await chrome.scripting
          .executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] })
          .then(() => true)
          .catch(() => false);
        if (injected) return;
      }
      const { panelWindowId } = await chrome.storage.session.get('panelWindowId');
      await chrome.storage.session.set({ targetWindowId: tab.windowId });
      if (typeof panelWindowId === 'number') {
        const focused = await chrome.windows
          .update(panelWindowId, { focused: true })
          .catch(() => null);
        if (focused) {
          if (tab.id !== undefined) invalidate(tab.id);
          return;
        }
      }
      const created = await chrome.windows.create({
        url: chrome.runtime.getURL('/panel.html'),
        type: 'popup',
        width: 420,
        height: 720,
      });
      await chrome.storage.session.set({ panelWindowId: created?.id });
    })();
  });
  void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const invalidate = (tabId: number) => {
    void chrome.runtime
      .sendMessage({ type: 'PROFILE_LENS_TAB_CHANGED', tabId })
      .catch(() => undefined);
  };
  chrome.tabs.onActivated.addListener(({ tabId }) => invalidate(tabId));
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading' || change.url) invalidate(tabId);
  });
  chrome.tabs.onRemoved.addListener((tabId) => invalidate(tabId));
});
