import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  // Let Chrome dispatch an action click so activeTab is granted before opening
  // the panel. Automatic panel toggling can open it without granting page access.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  chrome.action.onClicked.addListener((tab) => {
    void chrome.sidePanel.open({ windowId: tab.windowId });
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
