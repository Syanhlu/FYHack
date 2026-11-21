import { test as base, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { buildApp } from '../../apps/api/src/app';
import { type AnalysisRequest } from '../../packages/contracts/src';
import { output, sampleText } from '../helpers';

const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  panel: Page;
  calls: AnalysisRequest[];
}>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture dependency parameter.
  context: async ({}, use) => {
    const extension = resolve('apps/extension/.output/chrome-mv3');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: { width: 400, height: 850 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(worker.url()).host);
  },
  calls: async ({ extensionId, context }, use) => {
    const calls: AnalysisRequest[] = [];
    const app = buildApp({
      token: 'integration-test-token-only',
      allowedOrigin: `chrome-extension://${extensionId}`,
      provider: {
        generate: async (mode, input) => {
          calls.push(input);
          return output(mode.id);
        },
      },
    });
    // Route to the isolated API without binding the user's development port.
    await context.route('http://127.0.0.1:8787/**', async (route) => {
      const req = route.request();
      const response = await app.inject({
        method: req.method() as 'GET' | 'POST' | 'OPTIONS',
        url: new URL(req.url()).pathname,
        headers: await req.allHeaders(),
        payload: req.postData() ?? undefined,
      });
      await route.fulfill({
        status: response.statusCode,
        headers: Object.fromEntries(
          Object.entries(response.headers).map(([k, v]) => [k, String(v)]),
        ),
        body: response.body,
      });
    });
    await use(calls);
    await app.close();
  },
  panel: async ({ context, extensionId, calls }, use) => {
    void calls;
    const worker = context.serviceWorkers()[0]!;
    await worker.evaluate(() =>
      chrome.storage.session.set({ backendToken: 'integration-test-token-only' }),
    );
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/panel.html`);
    await use(page);
  },
});

async function paste(panel: Page) {
  await panel.getByRole('button', { name: 'Or paste profile text' }).click();
  await panel.getByLabel('Name (optional)').fill('Alex Morgan');
  await panel.getByLabel('Profile text', { exact: true }).fill(sampleText);
  await panel.getByRole('button', { name: 'Review this text' }).click();
}
test('in-page overlay reads its containing profile tab', async ({
  context,
  extensionId,
  calls,
}) => {
  void calls;
  const profile = await context.newPage();
  await profile.setViewportSize({ width: 1280, height: 900 });
  await profile.goto('http://localhost:4173');
  await profile.bringToFront();
  const worker = context.serviceWorkers()[0]!;
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://localhost:4173/*' });
    if (!tab?.id) throw new Error('Profile fixture tab is missing');
    await chrome.storage.session.set({
      backendToken: 'integration-test-token-only',
      overlayTabs: [tab.id],
    });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
  });
  const frameUrl = `chrome-extension://${extensionId}/panel.html`;
  await expect.poll(() => profile.frames().some((frame) => frame.url() === frameUrl)).toBe(true);
  const panel = profile.frames().find((frame) => frame.url() === frameUrl)!;
  await panel.getByRole('button', { name: 'Read this profile', exact: true }).click();
  await expect(panel.getByText('Alex Morgan', { exact: true })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Review the details.' })).toBeVisible();
});
test('both modes use the backend with current input and render boards, sources and drafts', async ({
  panel,
  calls,
}, info) => {
  await panel.screenshot({ path: info.outputPath('welcome.png'), fullPage: true });
  await paste(panel);
  await panel.getByRole('button', { name: 'Generate ideas' }).click();
  await expect(
    panel.getByRole('heading', { name: 'Good work, good conversations.' }),
  ).toBeVisible();
  await expect(panel.locator('.mood-tile')).toHaveCount(6);
  await expect(panel.getByLabel('A first hello')).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0].profile.evidence[0].text).toContain('accessible developer tools');
  await panel.screenshot({ path: info.outputPath('outreach.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Romantic Pursue', exact: true }).click();
  await panel.getByLabel('I confirm that we are both adults (18+).').check();
  await panel.getByRole('button', { name: 'Generate ideas' }).click();
  await expect(panel.getByRole('heading', { name: 'Small pleasures, shared.' })).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'Search for Coffee by Sylvan Esso' }),
  ).toHaveAttribute('href', /bandcamp.com\/search/);
  expect(calls).toHaveLength(2);
  expect(calls[1].mode).toBe('romantic');
  await panel.screenshot({ path: info.outputPath('romantic.png'), fullPage: true });
  for (const width of [320, 400, 600]) {
    await panel.setViewportSize({ width, height: 850 });
    expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await panel.getByRole('button', { name: 'Clear session' }).click();
  await expect(
    panel.getByRole('heading', { name: 'Start with a little curiosity.' }),
  ).toBeVisible();
});

test('built extractor reads a real DOM and invalidates on same-URL profile replacement', async ({
  context,
  panel,
}) => {
  const profile = await context.newPage();
  await profile.goto('http://localhost:4173');
  await profile.bringToFront();
  await panel.getByRole('button', { name: 'Read this profile' }).click();
  await expect(panel.getByText('Alex Morgan', { exact: true })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Review the details.' })).toBeVisible();
  await panel.locator('.evidence-review>summary').click();
  await expect(panel.getByRole('textbox', { name: 'Evidence e1', exact: true })).toBeVisible();
  expect(await panel.locator('.evidence-review').textContent()).not.toContain('Private hidden');
  await profile.getByRole('button', { name: 'Sparse profile' }).click();
  await expect(
    panel.getByText('The active profile changed. Read it again to continue.'),
  ).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Find your common ground.' })).toBeVisible();
});

test('input edits invalidate results and errors retain reviewed input', async ({
  panel,
  calls,
}) => {
  await paste(panel);
  await panel.getByRole('button', { name: 'Generate ideas' }).click();
  await expect(
    panel.getByRole('heading', { name: 'Good work, good conversations.' }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Edit input' }).click();
  await panel
    .getByRole('textbox', { name: 'Evidence e1', exact: true })
    .fill('I am 31. I build accessible software and mentor contributors.');
  await panel.getByRole('button', { name: 'Generate ideas' }).click();
  await expect(
    panel.getByRole('heading', { name: 'Good work, good conversations.' }),
  ).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[1].profile.evidence[0].attribution).toBe('user_supplied');
  await panel.getByRole('button', { name: 'Edit input' }).click();
  await panel.route('http://127.0.0.1:8787/v1/analyse', (route) => route.abort());
  await panel
    .getByRole('textbox', { name: 'Evidence e1', exact: true })
    .fill('I am 32. I build accessible developer tools and enjoy mentoring.');
  await panel.getByRole('button', { name: 'Generate ideas' }).click();
  await expect(panel.getByRole('alert')).toContainText('Cannot reach the local backend');
  await expect(panel.getByRole('heading', { name: 'Review the details.' })).toBeVisible();
});
