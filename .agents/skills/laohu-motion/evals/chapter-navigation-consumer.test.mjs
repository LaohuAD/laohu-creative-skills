import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const motionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(motionRoot, '../../..');
const wrapper = path.join(motionRoot, 'scripts/laohu-showreel.mjs');

test('chapter index compiles current timeline events and the generated player seeks on click', async (t) => {
  const project = path.join(repoRoot, '.cache/tmp', `chapter-consumer-${process.pid}`);
  fs.mkdirSync(path.join(project, 'out'), { recursive: true });
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(project, 'brief.md'), '<role>test</role>\n');
  fs.writeFileSync(path.join(project, 'index.html'), '<!doctype html><html><body><canvas></canvas></body></html>\n');
  fs.writeFileSync(path.join(project, 'timeline.js'), `export const DUR = 10;\nexport const SHOTS = [{id:'intro',t0:0,t1:4},{id:'result',t0:4,t1:10}];\n`);
  fs.writeFileSync(path.join(project, 'out/final.mp4'), 'test-media-placeholder');
  const run = (args) => spawnSync(process.execPath, [wrapper, ...args], { cwd: repoRoot, encoding: 'utf8' });
  const bindingResult = run(['chapter-binding', project]);
  assert.equal(bindingResult.status, 0, bindingResult.stderr || bindingResult.stdout);
  const binding = JSON.parse(bindingResult.stdout);
  const metadata = {
    binding,
    chapters: [
      { id: 'setup', title: '问题从哪里来', startEventId: 'intro', endEventId: 'intro' },
      { id: 'result', title: '为什么要异地备份', startEventId: 'result', endEventId: 'result' },
    ],
  };
  fs.writeFileSync(path.join(project, 'chapters.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  const result = run(['chapter-index', project]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /交互播放器/);
  const index = JSON.parse(fs.readFileSync(path.join(project, 'chapter-index.json'), 'utf8'));
  assert.deepEqual(index.chapters.map((row) => row.startSec), [0, 4]);
  assert.equal(index.interactivePlayer.path, 'chapter-index.html', 'the workbench-visible index must expose the separately openable player path');
  assert.equal(index.interactivePlayer.mode, 'video');
  const link = JSON.parse(fs.readFileSync(path.join(project, 'chapter-navigation.json'), 'utf8'));
  assert.equal(link.playerPath, 'chapter-index.html');
  const sceneHtml = fs.readFileSync(path.join(project, 'index.html'), 'utf8');
  assert.match(sceneHtml, /laohu:chapter-workbench-link/);
  assert.match(sceneHtml, /window\.parent\.location\.pathname!=='\/editor'/);
  const html = fs.readFileSync(path.join(project, 'chapter-index.html'), 'utf8');
  assert.match(html, /\.player\[hidden\]\{display:none\}/, 'the inactive video or scene surface must not override the hidden state');
  assert.match(html, /seek\(chapter\.startSec\)/);
  assert.match(html, /window\.render=seek/);
  const playerScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(playerScript, 'player must include an executable chapter consumer');

  const clickHandlers = [];
  const videoListeners = {};
  const frameListeners = {};
  const video = {
    currentTime: 0, duration: 10, readyState: 1, focused: false, muted: false,
    focus() { this.focused = true; },
    addEventListener(name, callback) { (videoListeners[name] ||= []).push(callback); },
    removeEventListener(name, callback) { videoListeners[name] = (videoListeners[name] || []).filter(item => item !== callback); },
  };
  const sceneFrame = {
    hidden: true, focused: false, contentWindow: { READY: true, render() {} },
    addEventListener(name, callback) { (frameListeners[name] ||= []).push(callback); },
    focus() { this.focused = true; },
  };
  const nav = { append() {} };
  const makeButton = () => {
    const handlers = {};
    const elements = { span: { textContent: '' }, small: { textContent: '' } };
    return {
      handlers,
      set className(value) { this._className = value; },
      set type(value) { this._type = value; },
      set innerHTML(value) { this._innerHTML = value; },
      addEventListener(name, callback) { handlers[name] = callback; if (name === 'click') clickHandlers.push(callback); },
      setAttribute() {},
      querySelector(selector) { return elements[selector]; },
    };
  };
  const note = { textContent: '' };
  const document = { querySelector(selector) { return selector === '#chapter-video' ? video : selector === '#chapter-scene' ? sceneFrame : selector === '.chapters' ? nav : note; }, createElement(name) { assert.equal(name, 'button'); return makeButton(); } };
  const window = { parent: { location: { pathname: '/editor' } } };
  vm.runInNewContext(playerScript, { document, window, Promise, Number, Math });
  assert.equal(clickHandlers.length, 2);
  clickHandlers[1]();
  assert.equal(video.currentTime, 4, 'clicking chapter navigation must actually seek the media element');
  assert.equal(video.muted, true, 'player video should not double the workbench audio mix when embedded');
  for (const callback of videoListeners.seeked || []) callback();
  await Promise.resolve();
  assert.equal(video.focused, true);
  const renderResult = window.render(5);
  assert.equal(video.currentTime, 5, 'the ordinary workbench render(t) consumer can seek the chapter player video');
  for (const callback of videoListeners.seeked || []) callback();
  await renderResult;
  video.currentTime = 5;
  for (const callback of videoListeners.timeupdate || []) callback();

  fs.writeFileSync(path.join(project, 'timeline.js'), `export const DUR = 10;\nexport const SHOTS = [{id:'intro',t0:0,t1:3},{id:'result',t0:3,t1:10}];\n`);
  const stale = run(['chapter-index', project]);
  assert.notEqual(stale.status, 0, 'stale timeline binding must block the old index');
  assert.match(`${stale.stderr}\n${stale.stdout}`, /stale-chapter-binding/);
});

test('chapters seek a real scene render(t) when the ordinary progress preview has no MP4 yet', async (t) => {
  const project = path.join(repoRoot, '.cache/tmp', `chapter-scene-consumer-${process.pid}`);
  fs.mkdirSync(project, { recursive: true });
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(project, 'brief.md'), '<role>test</role>\n');
  fs.writeFileSync(path.join(project, 'index.html'), '<!doctype html><html><body><canvas></canvas><script>window.DUR=10;window.READY=true;window.render=t=>{window.renderedAt=t}</script></body></html>\n');
  fs.writeFileSync(path.join(project, 'timeline.js'), `export const DUR = 10;\nexport const SHOTS = [{id:'intro',t0:0,t1:4},{id:'result',t0:4,t1:10}];\n`);
  const run = (args) => spawnSync(process.execPath, [wrapper, ...args], { cwd: repoRoot, encoding: 'utf8' });
  const bindingResult = run(['chapter-binding', project]);
  assert.equal(bindingResult.status, 0, bindingResult.stderr || bindingResult.stdout);
  const binding = JSON.parse(bindingResult.stdout);
  fs.writeFileSync(path.join(project, 'chapters.json'), JSON.stringify({ binding, chapters: [
    { id: 'setup', title: '问题从哪里来', startEventId: 'intro', endEventId: 'intro' },
    { id: 'result', title: '为什么要异地备份', startEventId: 'result', endEventId: 'result' },
  ] }, null, 2));
  const result = run(['chapter-index', project]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /真实场景 render\(t\)/);
  const index = JSON.parse(fs.readFileSync(path.join(project, 'chapter-index.json'), 'utf8'));
  assert.deepEqual(index.chapters.map((row) => row.startSec), [0, 4]);
  assert.equal(index.interactivePlayer.mode, 'scene-render');
  const link = JSON.parse(fs.readFileSync(path.join(project, 'chapter-navigation.json'), 'utf8'));
  assert.equal(link.playerPath, 'chapter-index.html');
  const html = fs.readFileSync(path.join(project, 'chapter-index.html'), 'utf8');
  assert.match(html, /src="index\.html\?render=1&amp;chapter-preview=1"/);
  assert.match(html, /正式 MP4 尚未就绪/);
  assert.match(html, /\.player\[hidden\]\{display:none\}/);
  const playerScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(playerScript, 'scene player must contain a real render(t) consumer');

  const clickHandlers = [];
  const video = { hidden: true, readyState: 0, currentTime: 0, addEventListener() {}, removeEventListener() {}, focus() {} };
  const frameListeners = {};
  let renderedAt = null;
  const sceneFrame = {
    hidden: false, focused: false,
    contentWindow: { READY: true, render(time) { renderedAt = time; } },
    addEventListener(name, callback) { (frameListeners[name] ||= []).push(callback); },
    focus() { this.focused = true; },
  };
  const nav = { append() {} };
  const makeButton = () => {
    const handlers = {};
    const elements = { span: { textContent: '' }, small: { textContent: '' } };
    return {
      handlers,
      set className(value) { this._className = value; },
      set type(value) { this._type = value; },
      set innerHTML(value) { this._innerHTML = value; },
      addEventListener(name, callback) { handlers[name] = callback; if (name === 'click') clickHandlers.push(callback); },
      setAttribute() {},
      querySelector(selector) { return elements[selector]; },
    };
  };
  const note = { textContent: '' };
  const document = { querySelector(selector) { return selector === '#chapter-video' ? video : selector === '#chapter-scene' ? sceneFrame : selector === '.chapters' ? nav : note; }, createElement(name) { assert.equal(name, 'button'); return makeButton(); } };
  const window = { parent: { location: { pathname: '/editor' } } };
  vm.runInNewContext(playerScript, { document, window, Promise, Number, Math });
  assert.equal(window.READY, true, 'the scene player should be ready when the current page exposes render(t)');
  assert.equal(clickHandlers.length, 2);
  clickHandlers[1]();
  assert.equal(renderedAt, 4, 'clicking a chapter must call the scene consumer with the bound start time');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(sceneFrame.focused, true);
  const renderResult = window.render(5);
  assert.equal(renderedAt, 5, 'the ordinary workbench render(t) path must reach the current scene');
  await renderResult;
  assert.equal(video.hidden, true);
  assert.equal(sceneFrame.hidden, false);
});
