import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startOpenMotion } from '../templates/runtime/openmotion-studio/server.mjs';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const cache = path.join(repo, '.cache', 'laohu-showreel');
const lock = readFileSync(new URL('../templates/runtime/laohu-showreel/scripts/package-lock.json', import.meta.url));
const revision = createHash('sha256').update(lock).digest('hex').slice(0, 16);
const playwright = path.join(cache, 'runtime', revision, 'node_modules', 'playwright');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browserPath = process.env.MOTION_BROWSER || (existsSync(chrome) ? chrome : undefined);
const font = new URL('../assets/typography/vendor/ark-pixel/ark-pixel-12px-monospaced-zh_hans.ttf.woff2', import.meta.url);

test('the workbench canvas and segment replay wait for a real scene font before drawing', {
  skip: !existsSync(playwright) && 'Run the local Showreel setup to install Playwright.',
  timeout: 30_000,
}, async t => {
  const temp = path.join(repo, '.cache', 'tmp');
  mkdirSync(temp, { recursive: true });
  const project = mkdtempSync(path.join(temp, 'workbench-scene-'));
  let studio, browser;
  t.after(async () => {
    await browser?.close();
    await studio?.close();
    rmSync(project, { recursive: true, force: true });
  });
  mkdirSync(path.join(project, 'fonts'));
  copyFileSync(font, path.join(project, 'fonts', '片段标题.woff2'));
  writeFileSync(path.join(project, 'package.json'), '{"type":"module"}');
  writeFileSync(path.join(project, 'index.html'), '<!DOCTYPE html><h1 id="title"></h1><script type="module" src="./scene.mjs"></script>');
  writeFileSync(path.join(project, 'timeline.js'), 'export const DUR=2,FPS=30,SHOTS=[{id:"one",t0:0,t1:2}];');
  writeFileSync(path.join(project, 'scene.mjs'), `
    const selected = new FontFace('SelectedSceneFont', 'url("./fonts/片段标题.woff2")');
    await selected.load();
    document.fonts.add(selected);
    const title = document.querySelector('#title');
    title.style.fontFamily = 'SelectedSceneFont';
    window.RENDER_CONTEXT = true;
    window.render = (time, frame) => {
      if (frame.frameTime !== time || frame.fps !== 30) throw Error('Expected the output frame context');
      title.textContent = '片段标题';
      window.drawnAt = time;
    };
    window.READY = true;
  `);
  studio = await startOpenMotion(project);
  const { chromium } = createRequire(import.meta.url)(playwright);
  const profile = path.join(project, 'browser-profile');
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(cache, 'playwright-browsers');
  browser = await chromium.launchPersistentContext(profile, { executablePath: browserPath });
  const page = browser.pages()[0];
  let fontRequested, releaseFont;
  const requested = new Promise(resolve => { fontRequested = resolve; });
  const permitFont = new Promise(resolve => { releaseFont = resolve; });
  await page.route('**/fonts/*.woff2', async route => {
    fontRequested();
    await permitFont;
    await route.continue();
  });
  const fontResponse = page.waitForResponse(response => response.url().includes('/fonts/'));
  try {
    await page.goto(studio.url, { waitUntil: 'domcontentloaded' });
    await requested;
    assert.equal(await page.locator('#play').isDisabled(), true);
  } finally {
    releaseFont();
  }
  const response = await fontResponse;
  assert.equal(response.status(), 200);
  assert.equal(response.headers()['content-type'], 'font/woff2');
  await page.locator('#play:enabled').waitFor();
  const main = page.frameLocator('#scene').locator('#title');
  assert.equal(await main.textContent(), '片段标题');
  assert.equal(await main.evaluate(node => {
    const { fonts } = node.ownerDocument;
    return [...fonts].some(face => face.family === 'SelectedSceneFont' && face.status === 'loaded')
      && getComputedStyle(node).fontFamily === 'SelectedSceneFont';
  }), true);

  const tracks = await page.locator('#dock').boundingBox();
  await page.getByRole('tab', {name:'制作进度'}).click();
  assert.deepEqual(await page.locator('#dock').boundingBox(), tracks);
  const stages = page.locator('.review-menus .review-directory').first();
  await stages.getByRole('searchbox').fill('分段动画');
  assert.equal(await stages.locator('button:visible').count(), 1);
  await page.locator('[data-stage="motion"]').click();
  const entries = page.locator('.review-menus .review-directory').nth(1);
  assert.equal(await stages.isVisible(),true);
  assert.ok((await entries.boundingBox()).x >= (await stages.boundingBox()).x + (await stages.boundingBox()).width - 1);
  await entries.getByRole('searchbox').fill('no-match');
  assert.equal(await entries.getByText('没有匹配项').isVisible(), true);
  await entries.getByRole('searchbox').fill('one');
  await entries.locator('[data-item="one"]').click();
  assert.equal(await entries.isVisible(),true);
  assert.equal(await entries.getByRole('searchbox').inputValue(), 'one');
  assert.ok((await page.locator('.review-item-detail').boundingBox()).y > (await entries.boundingBox()).y);
  await page.getByRole('tab', {name:'素材库'}).click();
  assert.equal(await page.locator('#library').isVisible(), true);
  await page.getByRole('tab', {name:'制作进度'}).click();
  const play = page.locator('.segment-surface:enabled');
  await play.click();
  await page.waitForFunction(() => document.querySelector('.review-monitor iframe')?.contentWindow.drawnAt > 0.1);
  const segment = page.frameLocator('.review-monitor iframe').locator('#title');
  assert.equal(await segment.textContent(), '片段标题');
  assert.equal(await segment.evaluate(node => getComputedStyle(node).fontFamily), 'SelectedSceneFont');
  assert.equal(await main.evaluate(node => node.ownerDocument.defaultView.drawnAt), 0);
});
