import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
import sharp from 'sharp';
import { buildApp } from '../../apps/api/src/app';
import type { LocalSnapshot } from '../../packages/contracts/src';

for (const variant of [
  'article',
  'div-busy',
  'div',
  'div-no-bio',
  'div-stable-url',
  'div-slow-image',
  'div-pointer-events',
  'div-transparent-overlay',
  'div-preloaded',
  'div-clipped',
  'div-obscured',
  'div-animated-carousel',
  'div-carousel-controls-overlay',
  'div-offset-overlay',
  'div-partial-overlay',
  'div-overlay-offcrop-text',
  'div-overlay-text',
  'div-edge-overlay',
  'div-edge-overlay-passive',
  'div-side-overlay',
  'div-inset-shadow',
  'div-center-overlay',
  'div-translucent-overlay',
  'div-mostly-clipped',
  'div-small-icon',
]) {
  const postTag = variant === 'article' ? 'article' : 'div';
  test(`automatic photo run handles ${variant} post content, carousels and restoration`, async ({
    page,
  }) => {
    const captured: Buffer[] = [];
    const submissions: string[] = [];
    const capturesDuringAnimation: boolean[] = [];
    const app = buildApp({
      token: 'browser-photo-token',
      allowedOrigin: 'https://www.instagram.com',
      provider: { generate: async () => null },
      images: {
        batchBudgetUsd: 0.05,
        runBudgetUsd: 1,
        intervalMs: 0,
        provider: {
          generate: async (input) => {
            captured.push(
              ...input.images.map((i) => Buffer.from(i.dataUrl.split(',')[1], 'base64')),
            );
            return {
              status: 'ready',
              reason: '',
              observations: input.images.map((i) => ({
                imageId: i.id,
                kind: 'scene',
                text: 'A red square is visible.',
                uncertainty: '',
              })),
            };
          },
        },
      },
    });
    try {
      const image = (
        await sharp({ create: { width: 160, height: 160, channels: 3, background: '#ed1010' } })
          .png()
          .toBuffer()
      ).toString('base64');
      const secondImage = (
        await sharp({ create: { width: 160, height: 160, channels: 3, background: '#10ed10' } })
          .png()
          .toBuffer()
      ).toString('base64');
      const thirdImage = (
        await sharp({ create: { width: 160, height: 160, channels: 3, background: '#eded10' } })
          .png()
          .toBuffer()
      ).toString('base64');
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') {
          const req = route.request();
          if (url.pathname === '/v1/analyse-images' && req.method() === 'POST') {
            submissions.push(req.postData()!);
            if (variant === 'div-busy' && submissions.length === 1)
              return route.fulfill({
                status: 429,
                contentType: 'application/json',
                headers: { 'access-control-allow-origin': 'https://www.instagram.com' },
                body: JSON.stringify({
                  error: { code: 'PHOTO_ANALYSIS_BUSY', message: 'Busy', retryAfterMs: 1000 },
                }),
              });
          }
          const response = await app.inject({
            method: req.method() as 'GET' | 'POST' | 'OPTIONS',
            url: url.pathname,
            headers: await req.allHeaders(),
            payload: req.postData() ?? undefined,
          });
          return route.fulfill({
            status: response.statusCode,
            headers: Object.fromEntries(
              Object.entries(response.headers).map(([k, v]) => [k, String(v)]),
            ),
            body: response.body,
          });
        }
        if (url.hostname !== 'www.instagram.com') return route.abort();
        return route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><style>body{margin:0;background:#0022ff}img{display:block}header{height:200px}main>a{display:contents}main>a>img{width:160px;height:160px;margin:30px}</style>
        <main><header><h2>alex</h2><span dir="auto">${variant === 'div-no-bio' ? '' : 'I enjoy art and the outdoors.'}</span><a href="/p/avatar/"><img src="data:image/png;base64,${image}" /></a></header>
        <a href="/alex/p/photo1/"><img src="data:image/png;base64,${image}" /></a>
        <a href="/reel/skip/"><img src="data:image/png;base64,${image}" /></a>
        <aside><a href="/p/recommendation/"><img src="data:image/png;base64,${image}" /></a></aside><div style="height:1000px"></div><a href="/alex/p/photo2/"><img src="data:image/png;base64,${secondImage}" /></a></main>
        <script>
        window.openedPosts=[];
        document.addEventListener('click',event=>{
          const link=event.target.closest('main > a[href*="/p/"]');
          if(!link)return;
          event.preventDefault();
          window.openedPosts.push(link.pathname);
          if('${variant}'!=='div-stable-url')history.pushState({},'',link.pathname);
          document.querySelector('main').setAttribute('aria-hidden','true');
          const dialog=document.createElement('div');dialog.setAttribute('role','dialog');
          dialog.style='position:fixed;inset:0;background:#222;z-index:10';
          const first=link.pathname.includes('photo1');
          dialog.innerHTML='<button aria-label="Close" style="position:absolute;right:20px;top:20px">Close</button><${postTag} data-post-content style="position:absolute;left:100px;top:100px;width:650px;height:500px"><img id="post-media" style="width:400px;height:400px" src="data:image/png;base64,'+(first?'${image}':'${thirdImage}')+'" /><div style="position:absolute;left:430px;top:20px">PRIVATE COMMENT MUST NOT BE CAPTURED</div>'+(first?'<button aria-label="Next" style="position:absolute;left:350px;top:180px;width:40px;height:40px">Next</button>':'')+'</${postTag}>';
          dialog.querySelector('[aria-label="Close"]').onclick=()=>{dialog.remove();document.querySelector('main').removeAttribute('aria-hidden');history.pushState({},'', '/alex/');};
          const next=dialog.querySelector('[aria-label="Next"]');
          if(next)next.onclick=()=>{dialog.querySelector('#post-media').src='data:image/png;base64,${secondImage}';const overlay=dialog.querySelector('[data-painted-overlay]');if(overlay)overlay.style.background='#aa00aa';next.remove();};
          document.body.append(dialog);
          const content=dialog.querySelector('[data-post-content]');
          if('${variant}'==='div-translucent-overlay'||'${variant}'==='div-small-icon'){
            const overlay=document.createElement('div');
            overlay.style='position:absolute;left:0;top:0;width:400px;height:400px';
            if('${variant}'==='div-translucent-overlay')overlay.style.background='rgba(0,0,0,0.2)';
            else overlay.innerHTML='<svg style="position:absolute;left:180px;top:180px;width:32px;height:32px" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="black" /></svg>';
            content.insertBefore(overlay,content.children[1]);
          }
          if('${variant}'==='div-mostly-clipped')content.style.left='-250px';
          if(['div-edge-overlay','div-edge-overlay-passive','div-side-overlay','div-inset-shadow','div-center-overlay'].includes('${variant}')){
            const overlay=document.createElement('div');
            overlay.style='position:absolute;left:0;top:0;width:400px;height:400px';
            if('${variant}'==='div-edge-overlay-passive')overlay.style.pointerEvents='none';
            if('${variant}'==='div-inset-shadow')overlay.style.boxShadow='inset 0 0 1px 0 rgba(0,0,0,0.5)';
            else {
              const panel=document.createElement('div');panel.style='position:absolute;background:#ff00ff;left:0;top:0;width:400px;height:40px';
              if('${variant}'==='div-side-overlay')panel.style='position:absolute;background:#ff00ff;left:340px;top:0;width:60px;height:400px';
              if('${variant}'==='div-center-overlay')panel.style='position:absolute;background:#ff00ff;left:160px;top:160px;width:80px;height:80px';
              overlay.append(panel);
            }
            content.insertBefore(overlay,content.children[1]);
          }
          if(['div-offset-overlay','div-partial-overlay','div-overlay-offcrop-text','div-overlay-text'].includes('${variant}')){
            const overlay=document.createElement('div');
            overlay.style='position:absolute;left:0;top:0;width:400px;height:400px';
            if('${variant}'==='div-offset-overlay'){overlay.style.left='-10px';overlay.style.width='420px';}
            if('${variant}'==='div-partial-overlay')overlay.style.width='200px';
            if('${variant}'==='div-overlay-offcrop-text'){
              overlay.style.width='650px';
              overlay.innerHTML='<span style="position:absolute;left:430px;top:20px">COMMENT OUTSIDE PHOTO</span>';
            }
            if('${variant}'==='div-overlay-text')overlay.innerHTML='<span style="position:absolute;left:30px;top:30px;color:#ff00ff">COMMENT COVERING PHOTO</span>';
            content.insertBefore(overlay,content.children[1]);
          }
          if('${variant}'==='div-carousel-controls-overlay'&&first){
            next.onclick=()=>{
              dialog.querySelector('#post-media').src='data:image/png;base64,${secondImage}';next.remove();
              const overlay=document.createElement('div');
              overlay.style='position:absolute;left:0;top:0;width:400px;height:400px';
              overlay.innerHTML='<div style="position:absolute;left:10px;top:180px"><button aria-label="Previous" style="width:40px;height:40px">Previous</button></div>';
              content.append(overlay);
            };
          }
          if('${variant}'==='div-animated-carousel'&&first){
            const viewport=document.createElement('div');viewport.style='width:400px;height:400px;overflow:hidden';
            const track=document.createElement('div');track.style='display:flex;width:800px';
            const current=dialog.querySelector('#post-media');
            current.style.flexShrink='0';
            const incoming=current.cloneNode();incoming.removeAttribute('id');incoming.src='data:image/png;base64,${secondImage}';
            current.before(viewport);viewport.append(track);track.append(current,incoming);
            next.onclick=()=>{
              track.animate([{transform:'translateX(0)'},{transform:'translateX(-400px)'}],{duration:1600,fill:'forwards'});
              next.remove();
            };
          }
          if('${variant}'==='div-pointer-events')dialog.querySelector('#post-media').style.pointerEvents='none';
          if('${variant}'==='div-transparent-overlay'||'${variant}'==='div-obscured'){
            const overlay=document.createElement('div');
            overlay.style='position:absolute;left:0;top:0;width:400px;height:400px;'+('${variant}'==='div-obscured'?'background:#ff00ff':'background:transparent');
            if('${variant}'==='div-obscured'){overlay.dataset.paintedOverlay='true';overlay.style.background=first?'#ff00ff':'#dd00dd';}
            content.insertBefore(overlay,content.children[1]);
          }
          if('${variant}'==='div-preloaded'){
            const previous=document.createElement('img');previous.src='data:image/png;base64,${thirdImage}';
            previous.style='position:absolute;left:-1000px;top:0;width:800px;height:800px';content.prepend(previous);
          }
          if('${variant}'==='div-clipped')content.style.left='-20px';
          if('${variant}'==='div-slow-image'&&window.openedPosts.length===1){
            const img=dialog.querySelector('#post-media'),src=img.src;
            img.removeAttribute('src');setTimeout(()=>{img.src=src;},3500);
          }
        });
        </script>`,
        });
      });
      await page.setViewportSize({ width: 1000, height: 900 });
      await page.goto('https://www.instagram.com/alex/');
      await page.exposeFunction('capturePhotoViewport', async () => {
        capturesDuringAnimation.push(
          await page.evaluate(() =>
            document.getAnimations().some((animation) => animation.playState === 'running'),
          ),
        );
        return `data:image/png;base64,${(await page.screenshot()).toString('base64')}`;
      });
      await page.evaluate(() => {
        const listeners = new Set<
          (message: unknown, sender: unknown, send: (reply: unknown) => void) => void
        >();
        Object.defineProperty(window, 'chrome', {
          configurable: true,
          value: {
            storage: { session: { get: async () => ({}) } },
            runtime: {
              id: 'fixture',
              onMessage: {
                addListener: (fn: typeof listeners extends Set<infer T> ? T : never) =>
                  listeners.add(fn),
                removeListener: (fn: typeof listeners extends Set<infer T> ? T : never) =>
                  listeners.delete(fn),
              },
            },
            tabs: {
              query: async () => [{ id: 1, windowId: 1 }],
              sendMessage: (_id: number, message: unknown) =>
                new Promise((resolve) => {
                  for (const listener of listeners) listener(message, { id: 'fixture' }, resolve);
                }),
              captureVisibleTab: () =>
                (
                  window as unknown as { capturePhotoViewport: () => Promise<string> }
                ).capturePhotoViewport(),
            },
            windows: { get: async () => ({ focused: true }) },
          },
        });
      });
      const source = await readFile('apps/extension/.output/chrome-mv3/extract.js', 'utf8');
      const snapshot = (await page.evaluate(
        (source) => window.eval(source),
        source,
      )) as LocalSnapshot;
      expect(snapshot.adapterId).toBe('instagram-best-effort');
      if (variant === 'div-no-bio') {
        expect(snapshot.profile.evidence).toEqual([]);
        expect(snapshot.captureWarnings?.[0]).toContain('You can still analyse profile images');
      }
      snapshot.tabId = 1;
      const bundle = await build({
        configFile: false,
        logLevel: 'silent',
        build: {
          write: false,
          minify: false,
          lib: {
            entry: resolve('apps/extension/src/services/images.ts'),
            name: 'PhotoTest',
            formats: ['iife'],
          },
        },
      });
      const built = Array.isArray(bundle) ? bundle[0] : bundle;
      if (!('output' in built)) throw new Error('Expected a browser bundle');
      const code = built.output.find((item) => item.type === 'chunk');
      if (!code || code.type !== 'chunk') throw new Error('Expected browser code');
      await page.addScriptTag({ content: code.code });
      const outcome = await page.evaluate(async (snapshot) => {
        const service = (
          window as unknown as {
            PhotoTest: typeof import('../../apps/extension/src/services/images');
          }
        ).PhotoTest;
        let count = 0;
        const progress: string[] = [];
        const message = await service.analyseProfileImages(
          snapshot,
          'browser-photo-token',
          new AbortController().signal,
          (_batch, n) => {
            count = n;
          },
          undefined,
          (message) => progress.push(message),
        );
        return { count, message, scroll: scrollY, progress };
      }, snapshot);
      expect(outcome.count).toBe(3);
      expect(outcome.message).toContain('0 skipped');
      expect(outcome.scroll).toBe(0);
      expect(new URL(page.url()).pathname).toBe('/alex/');
      expect(await page.locator('[role="dialog"]').count()).toBe(0);
      expect(
        await page.evaluate(() => (window as unknown as { openedPosts: string[] }).openedPosts),
      ).toEqual(['/alex/p/photo1/', '/alex/p/photo2/']);
      expect(captured).toHaveLength(3);
      if (variant === 'div-busy') {
        expect(submissions).toHaveLength(2);
        expect(submissions[0]).toBe(submissions[1]);
        expect(outcome.progress.some((text) => text.includes('Keeping 3 captured photos'))).toBe(
          true,
        );
        expect(outcome.progress.some((text) => /retrying in [1-4]s/.test(text))).toBe(true);
        expect(capturesDuringAnimation).toHaveLength(3);
      }
      if (
        [
          'div-obscured',
          'div-overlay-text',
          'div-edge-overlay',
          'div-edge-overlay-passive',
          'div-side-overlay',
          'div-center-overlay',
        ].includes(variant)
      ) {
        for (const photo of captured) {
          const { data, info } = await sharp(photo).raw().toBuffer({ resolveWithObject: true });
          expect(info.width).toBe(400);
          expect(info.height).toBe(400);
          let overlayPixels = 0;
          for (let i = 0; i < data.length; i += info.channels) {
            if (data[i] > 150 && data[i + 1] < 100 && data[i + 2] > 150) overlayPixels++;
          }
          // Analyse the on-screen pixels, including overlays, without rejecting or trimming them.
          expect(overlayPixels).toBeGreaterThan(0);
        }
      }
      if (variant === 'div-animated-carousel') {
        expect(capturesDuringAnimation).not.toContain(true);
        expect(outcome.message).toContain('0 skipped');
        const pixels = await sharp(captured[1]).raw().toBuffer();
        expect(pixels[0]).toBeLessThan(40);
        expect(pixels[1]).toBeGreaterThan(200);
        expect(pixels[2]).toBeLessThan(40);
      }
      const meta = await sharp(captured[0]).metadata();
      expect(meta.width).toBe(
        variant === 'div-clipped' ? 380 : variant === 'div-mostly-clipped' ? 150 : 400,
      );
      expect(meta.height).toBe(400);
      const { data, info } = await sharp(captured[0]).raw().toBuffer({ resolveWithObject: true });
      let pagePixels = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        if (data[i] < 80 && data[i + 1] < 80 && data[i + 2] > 150) pagePixels++;
      }
      expect(pagePixels).toBe(0); // The blue page outside the image bounds is never sent.
      const interrupted = await page.evaluate(async (snapshot) => {
        const command = (action: string, captureId = 'interrupt-test') =>
          chrome.tabs.sendMessage(1, {
            type: 'PROFILE_LENS_PHOTOS',
            snapshotId: snapshot.profile.snapshotId,
            action,
            captureId,
          });
        await command('begin');
        const oldEnd = await command('end', 'stale-run');
        const before = await command('scan');
        document.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
        const after = await command('scan');
        await command('end');
        return { staleRejected: !!oldEnd.error, before: before.stopped, after: after.stopped };
      }, snapshot);
      expect(interrupted).toEqual({ staleRejected: true, before: false, after: true });
      const unrelated = await page.evaluate(async (snapshot) => {
        const command = (action: string) =>
          chrome.tabs.sendMessage(1, {
            type: 'PROFILE_LENS_PHOTOS',
            snapshotId: snapshot.profile.snapshotId,
            action,
            captureId: 'unrelated-test',
          });
        await command('begin');
        history.pushState({}, '', '/p/unrelated/');
        const identity = await chrome.tabs.sendMessage(1, {
          type: 'PROFILE_LENS_IDENTITY',
          snapshotId: snapshot.profile.snapshotId,
        });
        await command('end');
        return {
          current: identity.current,
          route: location.pathname,
          dialogs: document.querySelectorAll('[role="dialog"]').length,
        };
      }, snapshot);
      expect(unrelated).toEqual({ current: false, route: '/p/unrelated/', dialogs: 1 });
    } finally {
      await app.close();
    }
  });
}
