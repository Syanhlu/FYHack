import { profileSchema, type LocalSnapshot } from '@profile-lens/contracts';

/** As an in-page overlay the panel reads the tab it is embedded in. As a fallback popup
 * window it reads the active tab of the browser window the toolbar icon was last clicked in. */
async function targetTab(): Promise<chrome.tabs.Tab | undefined> {
  if (window.top !== window) return chrome.tabs.getCurrent();
  const { targetWindowId } = await chrome.storage.session.get('targetWindowId');
  if (typeof targetWindowId === 'number') {
    const tabs = await chrome.tabs
      .query({ active: true, windowId: targetWindowId })
      .catch(() => []);
    if (tabs[0]) return tabs[0];
  }
  return (await chrome.tabs.query({ active: true, windowType: 'normal' }))[0];
}
export async function capture(): Promise<LocalSnapshot> {
  const tab = await targetTab();
  if (!tab?.id) throw new Error('Open a profile page and click the extension toolbar icon.');
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['extract.js'],
    });
  } catch {
    throw new Error(
      'Could not read this page. Click the toolbar icon on the profile to grant access, or use Paste profile text.',
    );
  }
  const result = results[0]?.result as LocalSnapshot | { extractionError: string } | undefined;
  if (result && 'extractionError' in result) throw new Error(result.extractionError);
  if (!result?.profile)
    throw new Error(
      'The page reader returned no profile. Reload the extension and refresh this page, then try again.',
    );
  const parsed = profileSchema.safeParse(result.profile);
  if (!parsed.success)
    throw new Error('The page reader returned invalid profile details. Use Paste profile text.');
  return { ...result, profile: parsed.data, tabId: tab.id };
}
export async function isCurrent(snapshot: LocalSnapshot): Promise<boolean> {
  if (snapshot.tabId === null) return true;
  try {
    const tab = await targetTab();
    if (tab?.id !== snapshot.tabId) return false;
    const reply = await chrome.tabs.sendMessage(snapshot.tabId, {
      type: 'PROFILE_LENS_IDENTITY',
      snapshotId: snapshot.profile.snapshotId,
    });
    return reply?.current === true;
  } catch {
    return false;
  }
}
export function release(snapshot: LocalSnapshot | null) {
  if (snapshot?.tabId !== null && snapshot?.tabId !== undefined)
    void chrome.tabs
      .sendMessage(snapshot.tabId, {
        type: 'PROFILE_LENS_RELEASE',
        snapshotId: snapshot.profile.snapshotId,
      })
      .catch(() => undefined);
}
export async function readToken(): Promise<string> {
  const value = (await chrome.storage.session.get('backendToken')).backendToken;
  return typeof value === 'string' ? value : '';
}
export async function saveToken(value: string) {
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.session.set({ backendToken: value });
}
