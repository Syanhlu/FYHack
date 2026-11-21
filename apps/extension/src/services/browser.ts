import { profileSchema, type LocalSnapshot } from '@profile-lens/contracts';

export async function capture(): Promise<LocalSnapshot> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Open a profile page and click the extension toolbar icon.');
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['extract.js'],
    });
    const snapshot = results[0]?.result as LocalSnapshot | undefined;
    if (!snapshot?.profile) throw new Error('No individual profile was found.');
    profileSchema.parse(snapshot.profile);
    return { ...snapshot, tabId: tab.id };
  } catch {
    throw new Error(
      'Could not read this page. Click the toolbar icon on the profile to grant access, or use Paste profile text.',
    );
  }
}
export async function isCurrent(snapshot: LocalSnapshot): Promise<boolean> {
  if (snapshot.tabId === null) return true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
