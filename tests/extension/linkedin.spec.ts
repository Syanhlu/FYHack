import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { LocalSnapshot } from '../../packages/contracts/src';

test('bundled LinkedIn capture scrolls, expands, reads detail frames and restores position', async ({
  page,
}) => {
  const detailRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'www.linkedin.com') return route.abort();
    if (url.pathname.endsWith('/details/skills/')) {
      detailRequests.push(url.pathname);
      return route.fulfill({
        contentType: 'text/html',
        body: '<main><h1>Skills</h1><p>Complete skills: accessible design, research and mentoring.</p></main>',
      });
    }
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Alex Morgan | LinkedIn</title>
      <main><h1>Alex Morgan</h1><div class="text-body-medium">Software engineer in London</div>
      <section><h2>About</h2><p id="bio">Short biography.</p><button onclick="document.getElementById('bio').textContent='Expanded biography about inclusive software and mentoring.';this.remove()">See more</button></section>
      <div style="height:1800px"></div><section><h2>Skills</h2><p>Preview skills</p><a href="/in/alex/details/skills/">Show all skills</a></section>
      <section><h2>Activity</h2><p class="text-body-medium">UNRELATED_REPOST</p></section></main>
      <script>let added=false;addEventListener('scroll',()=>{if(scrollY>700&&!added){added=true;document.querySelector('main').insertAdjacentHTML('beforeend','<section><h2>Projects</h2><h3>Reading app</h3><p>LAZY_PROJECT: built an accessible reading application.</p></section>')}})</script>`,
    });
  });
  await page.goto('https://www.linkedin.com/in/alex/');
  // Only the final identity listener needs an extension runtime in this browser fixture.
  await page.evaluate(() => {
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: { runtime: { onMessage: { addListener() {}, removeListener() {} } } },
    });
    window.scrollTo(0, 120);
  });
  const source = await readFile('apps/extension/.output/chrome-mv3/extract.js', 'utf8');
  const result = (await page.evaluate((source) => window.eval(source), source)) as LocalSnapshot;
  expect(result.profile?.displayName).toBe('Alex Morgan');
  const text = result.profile.evidence.map((e) => e.text).join('\n');
  expect(text).toContain('Expanded biography');
  expect(text).toContain('LAZY_PROJECT');
  expect(text).toContain('Complete skills');
  expect(text).not.toContain('Preview skills');
  expect(text).not.toContain('UNRELATED_REPOST');
  expect(result.captureWarnings).toEqual([]);
  expect(detailRequests).toEqual(['/in/alex/details/skills/']);
  expect(await page.evaluate(() => scrollY)).toBe(120);
  expect(await page.locator('iframe').count()).toBe(0);
});
