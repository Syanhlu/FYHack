import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { captureLinkedIn } from '../src/extraction/capture-linkedin';
import { extractProfile, identityText, profileRoot } from '../src/extraction';

export default defineUnlistedScript({
  globalName: true,
  async main() {
    let snapshot;
    try {
      const href = location.href;
      const captured = await captureLinkedIn(document, href);
      snapshot = await extractProfile(document, href, captured);
    } catch (error) {
      return {
        extractionError:
          error instanceof Error
            ? error.message
            : 'Could not parse this profile. Use Paste profile text.',
      };
    }
    const originalRoot = profileRoot(document);
    const originalIdentity = identityText(document, location.href);
    const host = globalThis as typeof globalThis & { __profileLensDispose?: () => void };
    host.__profileLensDispose?.();
    const listener = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      send: (value: unknown) => void,
    ) => {
      if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return;
      const m = message as { type?: string; snapshotId?: string };
      if (m.snapshotId !== snapshot.profile.snapshotId) return;
      if (m.type === 'PROFILE_LENS_IDENTITY')
        send({
          current:
            originalRoot === profileRoot(document) &&
            originalIdentity === identityText(document, location.href),
        });
      if (m.type === 'PROFILE_LENS_RELEASE') {
        dispose();
        send({ released: true });
      }
    };
    const timer = setTimeout(() => dispose(), 30 * 60 * 1000);
    const dispose = () => {
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(listener);
      delete host.__profileLensDispose;
    };
    host.__profileLensDispose = dispose;
    chrome.runtime.onMessage.addListener(listener);
    return snapshot;
  },
});
