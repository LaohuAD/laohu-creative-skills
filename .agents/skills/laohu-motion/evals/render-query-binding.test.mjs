import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {after, test} from 'node:test';
import {fileURLToPath} from 'node:url';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(skillDir, '../../..');
const wrapper = path.join(skillDir, 'scripts/laohu-showreel.mjs');
const repositoryCache = path.join(root, '.cache');
const configuredTemp = process.env.TMPDIR && path.resolve(process.env.TMPDIR);
const tempRoot = configuredTemp?.startsWith(repositoryCache + path.sep) ? configuredTemp : path.join(repositoryCache, 'tmp');
fs.mkdirSync(tempRoot, {recursive: true});
const fixture = fs.mkdtempSync(path.join(tempRoot, 'render-query-binding-'));

const brief = `<role>
motion design
</role>
<inputs>
query binding integration fixture
</inputs>
<confirmations>
single-frame route only
</confirmations>
<direction>
A使用toy业务参数，B使用paper业务参数。
</direction>
<structure>
<screen-text-registry>
| ID | 精确原文 | 材料 / cue | 方向 · 画面 · 出现起止 · 完整可读起止 | 对象 · 作用 · 空间 / 动态关系 | 必显 |
| --- | --- | --- | --- | --- | --- |
| A01 | A方向测试标签 | 测试登记｜核对渲染query｜方向A标签 | A · 开场 · 出现 0–1 秒 · 完整可读 0–1 秒 | 测试标签｜核对方向｜画面左侧，固定显示 | 必显 |
| B01 | B方向测试标签 | 测试登记｜核对渲染query｜方向B标签 | B · 开场 · 出现 0–1 秒 · 完整可读 0–1 秒 | 测试标签｜核对方向｜画面左侧，固定显示 | 必显 |
| cue:query-test:zh-Hans | 底部字幕测试 | 字幕 query-test / zh-Hans / 测试原句 | B · 开场 · 出现 0–1 秒 · 完整可读 0–1 秒 | 测试字幕｜核对正式字幕 profile｜固定在底部字幕槽位 | 必显 |
</screen-text-registry>
</structure>
<build>
single frame
</build>
<gotchas>
none
</gotchas>
<start>
none
</start>`;

const html = `<!doctype html><meta charset="utf-8"><canvas id="screen" width="320" height="180"></canvas><script type="module" src="renderer.mjs"></script>`;
const renderer = `import {createBriefTextRuntime} from './.cache/brief-text-contract.mjs';
import {resolveNativeCaptionProfile} from './.cache/native-caption-runtime.mjs';
const wrapperPreflight = Boolean(window.__laohuBriefText);
const map = await fetch('./.cache/brief-text-map.json').then(response => response.json());
const initialParams = new URLSearchParams(location.search);
const screenText = createBriefTextRuntime(map, {host: window, allowCaptionCalibration: initialParams.get('laohuCaptionCalibration') === '1'});
const canvas = document.querySelector('#screen');
const ctx = canvas.getContext('2d');
const profileId = initialParams.get('laohuCaptionProfile');
if (!wrapperPreflight && !profileId) throw new Error('actual render must receive the preflight-verified locked profile');
const calibrationMode = initialParams.get('laohuCaptionCalibration') === '1';
const profile = await resolveNativeCaptionProfile(profileId || 'native-16x9-standard', {width: 320, height: 180, displayLanguages: ['zh-Hans'], calibrationMode});
screenText.recordCaptionProfile(profile);
window.DUR = 6;
window.READY = true;
window.render = time => {
  const params = new URLSearchParams(location.search);
  const direction = params.get('laohuTextDirection');
  const expectedBusinessValue = direction === 'B' ? 'paper' : 'toy';
  if (!calibrationMode && params.get('dir') !== expectedBusinessValue) throw new Error('business query mismatch: expected ' + expectedBusinessValue);
  if (time >= 1) return;
  ctx.fillStyle = '#17202a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  const id = direction === 'B' ? 'B01' : 'A01';
  screenText.canvas({time, direction, scene: '开场', object: '测试标签'}, id, ctx, 18, 48);
  if (direction === 'B') screenText.caption({time, direction, scene: '开场', object: '测试字幕'}, 'cue:query-test:zh-Hans', exact => ctx.fillText(exact, 18, 150));
};`;
fs.writeFileSync(path.join(fixture, 'brief.md'), brief);
fs.writeFileSync(path.join(fixture, 'index.html'), html);
fs.writeFileSync(path.join(fixture, 'renderer.mjs'), renderer);

after(() => fs.rmSync(fixture, {recursive: true, force: true}));

function runWrapper(args) {
  const result = spawnSync(process.execPath, [wrapper, ...args], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024,
  });
  return {status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error};
}

function renderArgs(...queryArgs) {
  return ['render', fixture, '--text-direction', 'B', '--size', '320x180', ...queryArgs];
}

function pngFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? pngFiles(candidate) : entry.isFile() && entry.name.toLowerCase().endsWith('.png') ? [candidate] : [];
  });
}

test('formal render rejects reserved control keys in both --q spellings', () => {
  const separated = runWrapper(renderArgs('--q', 'laohuCaptionProfile=native-16x9-outline-2_5&laohuCaptionCalibration=1'));
  assert.notEqual(separated.status, 0);
  assert.match(separated.stderr + separated.stdout, /保留的 laohu\* 控制参数/u);

  const equals = runWrapper(renderArgs('--q=laohuTextDirection=A'));
  assert.notEqual(equals.status, 0);
  assert.match(equals.stderr + equals.stdout, /保留的 laohu\* 控制参数/u);
});

test('formal render rejects repeated --q whether values are separated or inline', () => {
  const separatedThenInline = runWrapper(renderArgs('--q', 'dir=toy', '--q=dir=paper'));
  assert.notEqual(separatedThenInline.status, 0);
  assert.match(separatedThenInline.stderr + separatedThenInline.stdout, /只接受一个 --q/u);

  const inlineThenSeparated = runWrapper(renderArgs('--q=dir=toy', '--q', 'dir=paper'));
  assert.notEqual(inlineThenSeparated.status, 0);
  assert.match(inlineThenSeparated.stderr + inlineThenSeparated.stdout, /只接受一个 --q/u);
});

test('same business query reaches preflight and actual B still render', () => {
  const purpose = '验证方向B的业务query在预检和实际单帧渲染中一致';
  const output = path.join(fixture, 'qa/explorations/business-query');
  const result = runWrapper(['render', fixture, '--text-direction', 'B', '--q=dir=paper', '--size', '320x180',
    '--still', '0', '--out', output, '--purpose', purpose]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const stills = pngFiles(output);
  assert.equal(stills.length, 1, 'the low-level renderer wrote exactly one actual still');
  assert.ok(fs.statSync(stills[0]).size > 0, 'the actual still contains PNG data');

  const mismatched = runWrapper(['render', fixture, '--text-direction', 'A', '--q', 'dir=paper', '--size', '320x180',
    '--still', '0', '--out', path.join(fixture, 'qa/explorations/mismatched-query'), '--purpose', purpose]);
  assert.notEqual(mismatched.status, 0, 'the business query must participate in preflight direction checks');
  assert.match(mismatched.stderr + mismatched.stdout, /business query mismatch/u);
});

test('explicit probe retains its scoped calibration candidate route', () => {
  const result = runWrapper(['probe', fixture, '--start', '0', '--duration', '1', '--selection', '0–1秒字幕校准',
    '--purpose', '验证受控技术探针的候选字幕profile路径', '--text-direction', 'B', '--caption-profile', 'native-16x9-outline-2_5',
    '--size', '320x180', '--fps', '30']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const probeFiles = pngFiles(path.join(fixture, 'qa/probes'));
  assert.ok(probeFiles.some(file => file.endsWith('.webp')) || fs.readdirSync(path.join(fixture, 'qa/probes')).some(name => name.endsWith('.mp4')),
    'the explicitly scoped probe produced a media artifact');
});

test('external captions invalidate explicit chapter inputs and unchanged reruns reuse the cache', () => {
  const project = path.join(fixture, 'caption-chapter');
  fs.mkdirSync(project);
  const manifest = JSON.stringify({version: 1, duration: 2, size: '320x180', fps: 4,
    chapters: [{id: 'part', project: '.', duration: 2, inputs: ['index.html', 'renderer.mjs']}], render: {workers: 1}});
  const manifestPath = path.join(project, 'film.json');
  fs.writeFileSync(manifestPath, manifest);
  fs.writeFileSync(path.join(project, 'index.html'), `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#142336}#overlay{position:relative;width:320px;height:180px}</style><div id="overlay"></div><script type="module" src="renderer.mjs"></script>`);
  fs.writeFileSync(path.join(project, 'renderer.mjs'), `import {createBriefTextRuntime} from './.cache/brief-text-contract.mjs';
import {createNativeCaptionTrack} from './.cache/native-caption-runtime.mjs';
const map = await fetch('./.cache/brief-text-map.json').then(response => response.json());
const text = window.__laohuBriefText ?? createBriefTextRuntime(map);
const track = await createNativeCaptionTrack({element: document.querySelector('#overlay'), width: 320, height: 180, ...text.captionInput('测试方向')});
window.DUR = 2;
window.render = time => track.render(time);
window.READY = true;`);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  function updateCaption(line) {
    const srt = `1\n00:00:00,000 --> 00:00:02,000\n${line}\n`;
    fs.writeFileSync(path.join(project, 'captions.srt'), srt);
    const input = `caption-source: srt | captions.srt | sha256=${digest(srt)} | source=zh-Hans | display=zh-Hans`;
    fs.writeFileSync(path.join(project, 'brief.md'), brief.replace('query binding integration fixture', input)
      .replace(/<screen-text-registry>[\s\S]*?<\/screen-text-registry>/u, '<screen-text-registry>\n</screen-text-registry>'));
  }
  function buildChapter() {
    const result = runWrapper(['build-long', manifestPath, '--text-direction', '测试方向', '--exhaustive-frames']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /exhaustive-frames · 8 \/ 8 帧/u);
    assert.match(result.stdout, /technical acceptance passed/u);
    return {video: digest(fs.readFileSync(path.join(project, 'out/final.mp4'))),
      cache: JSON.parse(fs.readFileSync(path.join(project, '.showreel-cache/last-build.json'), 'utf8'))};
  }
  updateCaption('字幕内容甲');
  const first = buildChapter();
  updateCaption('字幕内容乙');
  const changed = buildChapter();
  const repeated = buildChapter();
  assert.deepEqual(first.cache.rendered, ['part']);
  assert.deepEqual(changed.cache.rendered, ['part']);
  assert.notEqual(first.video, changed.video);
  assert.deepEqual(repeated.cache.reused, ['part']);
  assert.equal(repeated.video, changed.video);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifest);
  assert.ok(fs.statSync(path.join(project, 'qa/final-sheet.png')).size > 0);
});

console.log('formal render query-binding checks cover reserved-key rejection, duplicate parsing, preflight consistency and an actual B still');
