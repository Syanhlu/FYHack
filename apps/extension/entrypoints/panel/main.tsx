import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../../src/styles.css';

// panel.html is web-accessible so the overlay can embed it. Only run inside a frame on a
// tab where the user opened it from the toolbar, so other sites cannot embed the panel.
async function allowed() {
  if (window.top === window) return true;
  const [tab, { overlayTabs }] = await Promise.all([
    chrome.tabs.getCurrent(),
    chrome.storage.session.get('overlayTabs'),
  ]);
  return Array.isArray(overlayTabs) && tab?.id !== undefined && overlayTabs.includes(tab.id);
}
void allowed().then((ok) => {
  if (ok)
    createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
});
