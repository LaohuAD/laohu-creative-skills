import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const cli = fileURLToPath(new URL('../scripts/laohu-showreel.mjs', import.meta.url));
const installed = path.join(repo, '.cache/laohu-showreel');
const workbenchCache = path.join(installed, 'playwright-browsers');
const shellDirectory = (fs.readdirSync(workbenchCache, { throwIfNoEntry: false }) || [])
  .find(name => name.startsWith('chromium_headless_shell-'));
const shellParent = shellDirectory && path.join(workbenchCache, shellDirectory);
const shell = shellParent && fs.readdirSync(shellParent).map(name => path.join(shellParent, name, 'chrome-headless-shell'))
  .find(file => fs.existsSync(file));
const closure = (fs.readdirSync(path.join(installed, 'runtime'), { throwIfNoEntry: false }) || [])
  .map(name => path.join(installed, 'runtime', name, 'node_modules/playwright/index.mjs')).find(file => fs.existsSync(file));
const required = ['runtime', 'playwright-browsers', 'vendor'];
const ready = shell && closure && required.every(name => fs.existsSync(path.join(installed, name)));
const evidenceDir = process.env.MOTION_WEBGL_EVIDENCE;
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

function writeFixtureBrief(project) {
  const blocks = {
    role: '离线三维技术夹具',
    inputs: '合成几何体；没有外部媒体、音频或字幕。',
    confirmations: '本夹具测试本地工具和画面像素。',
    direction: 'direction-name: 离线三维\nresource-mode: original-only\noriginal-only-user-request: “技术夹具模拟要求用自制几何形体，不采用任何目录风格或对标。”\nstyleframe-source: code\nmotion-probe: required; reason: 验证旋转时相邻立体表面发生变化。\nexplore-moment: first@0 — 看到斜面和边缘\nexplore-moment: side@1 — 新面转到正面',
    structure: `一个三秒几何体旋转镜头。
<screen-text-registry>
</screen-text-registry>
<production-units>
| 稳定 ID | 段名 | 开始 | 结束 | 制作说明 | 对应片段 ID | 时间依据 | 讲述与字幕 | 关键设计帧 | 制作职责 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| probe | 几何体旋转 | 0 | 3 | 检查新表面旋转到正前方。 | | 计划 | 无口播 | side@1 | 动画 |
</production-units>

### [probe] 几何体旋转
同一背景和机位上，圆角立方体连续旋转。第一秒通过表面颜色和轮廓差异核对转动。`,
    build: '本地 WebGLRenderer 输出，12 fps，连贯长 3 秒。',
    gotchas: '保留 import map；所有模块经同源 HTTP 读取。',
    start: '先校验画面，再检查工作台的时间定位。',
  };
  fs.writeFileSync(path.join(project, 'brief.md'), Object.entries(blocks)
    .map(([name, value]) => `<${name}>\n${value}\n</${name}>`).join('\n\n') + '\n');
}

function writeFixtureScene(project) {
  const index = path.join(project, 'index.html');
  const html = fs.readFileSync(index, 'utf8');
  const importMap = html.match(/<script type="importmap">.*?<\/script>/u)?.[0];
  assert.ok(importMap, 'the real scaffold supplies the offline import map');
  fs.writeFileSync(index, `<!doctype html><meta charset="utf-8"><title>Offline Three.js fixture</title>
    <style>html,body{margin:0;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
    ${importMap}<canvas id="scene-canvas"></canvas><script type="module" src="./scene.mjs"></script>`);
  fs.writeFileSync(path.join(project, 'timeline.js'), `export const DUR = 3, FPS = 12;
export const SHOTS = [{id: 'probe', t0: 0, t1: 3}];\n`);
  fs.writeFileSync(path.join(project, 'scene.mjs'), `import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DUR } from './timeline.js';

const query = new URLSearchParams(location.search);
const width = Number(query.get('w')) || 320;
const height = Number(query.get('h')) || 180;
const canvas = document.getElementById('scene-canvas');
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
renderer.setSize(width, height, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1525);
const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 20);
camera.position.z = 4;
const shape = new THREE.Mesh(new RoundedBoxGeometry(1.4, 1.4, 1.4, 3, 0.16), new THREE.MeshNormalMaterial());
scene.add(shape);
window.DUR = DUR;
window.render = time => {
  shape.rotation.set(0.28 + time * 0.65, 0.25 + time * 1.15, 0.2);
  renderer.render(scene, camera);
};
window.probePixels = () => {
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const pixels = new Uint8Array(4);
  const get = (x, y) => {
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return Array.from(pixels);
  };
  return { center: get(width / 2, height / 2), corner: get(0, 0), renderer: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) };
};
window.render(0);
window.READY = true;\n`);
}

function inspectRenderedPng(file) {
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-frames:v', '1', 'pipe:1']);
  assert.equal(decoded.status, 0, String(decoded.stderr));
  const bytes = decoded.stdout;
  assert.equal(bytes.length, 320 * 180 * 4);
  const corner = [...bytes.subarray(0, 4)];
  assert.deepEqual(corner, [11, 21, 37, 255]);
  let geometryPixels = 0;
  for (let index = 0; index < bytes.length; index += 4) {
    if (bytes[index] + bytes[index + 1] + bytes[index + 2] > 150) geometryPixels++;
  }
  assert.ok(geometryPixels > 2000 && geometryPixels < 20_000, `geometry coverage ${geometryPixels}`);
  return { corner, geometryPixels };
}

test('automatic software fallback, offline Three.js scaffold, production renderer and workbench', {
  timeout: 180_000, skip: !ready || !evidenceDir ? 'pass MOTION_WEBGL_EVIDENCE after Showreel setup on this work volume' : false,
}, async t => {
  const evidence = fs.realpathSync(evidenceDir);
  assert.equal(fs.statSync(evidence).dev, fs.statSync(repo).dev);
  const cwd = fs.mkdtempSync(path.join(evidence, 'offline-'));
  const cache = path.join(cwd, '.cache/laohu-showreel');
  fs.mkdirSync(cache, { recursive: true });
  for (const name of required) fs.symlinkSync(path.join(installed, name), path.join(cache, name), 'dir');
  const tmp = path.join(cwd, 'tmp');
  fs.mkdirSync(tmp);
  const browserShim = path.join(cwd, 'offline-chromium');
  fs.writeFileSync(browserShim, `#!/bin/sh
mode=default
for argument do
  case "$argument" in
    --use-angle=*) mode="\${argument#--use-angle=}" ;;
  esac
done
printf '%s\\n' "$mode" >> ${quote(path.join(cwd, 'browser-angles.log'))}
case "$mode" in
  metal) set -- "$@" --disable-webgl ;;
  default) set -- "$@" --use-angle=swiftshader ;;
esac
exec ${quote(shell)} "$@" --disable-background-networking --disable-component-update \\
  --proxy-server=http://127.0.0.1:9 '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'
`, { mode: 0o700 });
  const env = { ...process.env, CHROME_PATH: browserShim, npm_config_offline: 'true',
    HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9', NO_PROXY: '127.0.0.1,localhost' };
  delete env.SHOWREEL_ANGLE;
  const invoke = (name, args, expected = 0, environment = env) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, env: environment, encoding: 'utf8', timeout: 90_000 });
    const report = result.stdout + result.stderr;
    fs.writeFileSync(path.join(cwd, `${name}.log`), report);
    assert.equal(result.status, expected, `${name}: ${result.error?.message ?? ''}\n${report.slice(-6000)}`);
    return report;
  };

  const blockedAngle = { ...env, SHOWREEL_ANGLE: 'metal' };
  const blocked = invoke('explicit-metal-unavailable', ['doctor', '--webgl-smoke'], 1, blockedAngle);
  assert.match(blocked, /ANGLE metal \(explicit\)/u);
  assert.match(blocked, /\[unavailable\] WebGL2/u);
  assert.doesNotMatch(blocked, /ANGLE default/u);
  invoke('2d-environment', ['doctor'], 0, blockedAngle);
  const doctor = invoke('automatic-doctor', ['doctor', '--webgl-smoke']);
  if (process.platform === 'darwin') assert.match(doctor, /ANGLE metal · WebGL2 context unavailable/u);
  assert.match(doctor, /WebGL2: SwiftShader \(software fallback\) · shader 16×16 center 191,64,128,255/u);
  assert.match(doctor, /\[ok\] Three\.js WebGL2 pixels .*0 blocked external requests/u);
  const launches = () => fs.readFileSync(path.join(cwd, 'browser-angles.log'), 'utf8').trim().split('\n');
  const afterDoctor = launches().length;

  invoke('input-map', ['input-map', 'scene', '--spec', '320x180', '--fps', '12', '--spec-source', 'explicit-user',
    '--spec-evidence-text', '技术夹具记录测试输出为 320x180 且每秒 12 帧。']);
  const project = path.join(cwd, 'scene');
  writeFixtureBrief(project);
  invoke('offline-scaffold', ['scaffold', 'scene', '--audio', 'none', '--with-three']);
  assert.equal(launches().length, afterDoctor, 'catalog and scaffold do not start a browser');
  assert.equal(fs.lstatSync(path.join(project, 'vendor/three')).isDirectory(), true);
  assert.match(fs.readFileSync(path.join(project, 'vendor/three/LICENSE'), 'utf8'), /MIT License/u);
  writeFixtureScene(project);

  const stillBefore = launches().length;
  invoke('offline-render', ['render', 'scene', '--text-direction', '离线三维', '--still', '1.0', '--out', 'qa/explorations/three']);
  assert.deepEqual(launches().slice(stillBefore), ['default', 'default'], 'real text precheck and renderer reuse the cached ANGLE selection');
  const png = path.join(project, 'qa/explorations/three/t_001.00.png');
  const exportPixels = inspectRenderedPng(png);

  const server = spawn(process.execPath, [cli, 'editor', 'scene', '--size', '320x180', '--fps', '12'], {
    cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = fs.createWriteStream(path.join(cwd, 'editor.log'));
  server.stdout.pipe(logs, { end: false });
  server.stderr.pipe(logs, { end: false });
  const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} };
  t.after(stop);
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('editor did not become ready')), 20_000);
    let output = '';
    server.once('exit', code => { clearTimeout(timer); logs.end(); reject(new Error(`editor exited with ${code}`)); });
    server.stdout.on('data', chunk => {
      output += chunk;
      const local = output.match(/http:\/\/127\.0\.0\.1:\d+\/progress/u)?.[0];
      if (local) { clearTimeout(timer); resolve(local); }
    });
  });
  assert.equal(launches().length, stillBefore + 2, 'normal editor startup does not run a headless probe');
  const { chromium } = await import(pathToFileURL(closure).href);
  const browser = await chromium.launch({ executablePath: browserShim, args: ['--enable-unsafe-swiftshader'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const origin = new URL(url).origin;
  const outside = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    outside.push(route.request().url());
    return route.abort();
  });
  const workbenchModules = [];
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/__scene/vendor/three/')) workbenchModules.push([path, response.status(), response.headers()['content-type']]);
  });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#scene')?.contentWindow?.READY === true, null, { timeout: 15_000 });
  const scene = page.frame({ url: `${origin}/__scene/index.html` });
  assert.ok(scene);
  const browserPixels = await scene.evaluate(() => {
    window.render(0);
    const first = window.probePixels();
    window.render(1);
    return { first, second: window.probePixels(), duration: window.DUR };
  });
  assert.equal(browserPixels.duration, 3);
  assert.match(browserPixels.second.renderer, /SwiftShader/u);
  assert.deepEqual(browserPixels.second.corner, exportPixels.corner);
  assert.notDeepEqual(browserPixels.first.center, browserPixels.second.center);
  assert.notDeepEqual(browserPixels.second.center, browserPixels.second.corner);
  assert.deepEqual(outside, []);
  assert.ok(workbenchModules.length >= 3 && workbenchModules.every(([, status, type]) => status === 200 && /javascript/u.test(type)),
    JSON.stringify(workbenchModules));
  const privateVendor = await page.request.get(`${origin}/__scene/vendor/three/package.json`);
  assert.equal(privateVendor.status(), 404);
  await scene.locator('canvas').screenshot({ path: path.join(cwd, 'workbench.png') });
  await browser.close();
  stop();
  await once(server, 'exit');
  fs.writeFileSync(path.join(cwd, 'pixel-evidence.json'), JSON.stringify({ exportPixels, browserPixels, workbenchModules, outside }, null, 2) + '\n');
  t.diagnostic(cwd);
});
