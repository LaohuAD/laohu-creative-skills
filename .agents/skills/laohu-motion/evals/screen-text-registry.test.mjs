import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {createBriefTextRuntime, validateCaptionTextAgainstBrief} from '../scripts/screen-text-contract.mjs';
import {compileBriefTextMap, parseBriefTextRegistry, scanProjectTextBindings} from '../scripts/screen-text-registry.mjs';
import {prepareBriefTypefaces} from '../scripts/brief-typefaces.mjs';
import {NATIVE_CAPTION_PROFILE_IDS, SRT_CAPTION_MANIFEST_FORMAT, resolveNativeCaptionProfile, verifyCaptionBinding} from '../templates/runtime/native-presentation/captions.mjs';

const brief = `<role>
motion design
</role>
<inputs>
synthetic test input
</inputs>
<confirmations>
none
</confirmations>
<direction>
主方向为A，另有B方案。
</direction>
<structure>
<screen-text-registry>
| ID | 精确原文 | 材料 / cue | 方向 · 画面 · 出现起止 · 完整可读起止 | 对象 · 作用 · 空间 / 动态关系 | 必显 |
| --- | --- | --- | --- | --- | --- |
| T01 | 数学五层蛋糕 | 研究材料｜核对事实｜主标题资料卡 | A · 开场 · 出现 0–32 秒 · 完整可读 0.85–32 秒 | 标题牌｜命名模型｜与模型并列，随卡片入场后固定 | 必显 |
| T02 | 后段解释 | 研究材料｜说明机制｜右侧注释 | A · 开场 · 出现 5.8–7 秒 · 完整可读 6.1–6.8 秒 | 右侧注释｜解释层次｜跟随第二层，保持在标题牌下方 | 必显 |
| T03 | 之后出现 | 研究材料｜总结｜结尾图卡 | A · 结尾 · 出现 8–10 秒 · 完整可读 8.2–9.8 秒 | 结尾卡｜收束｜在画面中央出现并与图标并列 | 必显 |
| T04 | A类标签 | 研究材料｜标记｜五层列表 | A · 开场 · 出现 0–2 秒 · 完整可读 0–2 秒 | 列表标签｜标层｜贴随第一层左缘且不继承主标题运动 | 必显 |
| B01 | B方向标题 | 研究材料｜对照｜方案B | B · 开场 · 出现 0–6 秒 · 完整可读 0–6 秒 | 方案标题｜命名方向｜位于模型上方并与模型整体淡入 | 必显 |
| MAIN01 | 只有一个方向 | 研究材料｜命名｜单方向主标题 | main · 独立画面 · 出现 0–1 秒 · 完整可读 0–1 秒 | 独立标题｜命名画面｜居中呈现，不继承其它镜头运动 | 必显 |
| T05 | 第一行\\n第二行 | 研究材料｜两行文字｜字幕卡 | A · 开场 · 出现 0–1 秒 · 完整可读 0–1 秒 | 两行文字｜呈现两行｜按登记换行，作为单一对象居中 | 可选 |
| I01 | 样例图字 | 外部图片字｜assets/sign.png｜外部标牌待人工核读 | A · 开场 · 出现 0–6 秒 · 完整可读 0–6 秒 | 图片字｜标识场景｜附着于右后方标牌，随标牌整体移动 | 必显 |
| cue:cue-1:zh-Hans | 不是 3.14 米，而是 NVIDIA CUDA 12.4。 | 字幕 cue-1 / zh-Hans / ASR原句 | A · 开场 · 出现 0.1–0.9 秒 · 完整可读 0.1–0.9 秒 | 双语字幕中文行｜保留原句｜固定下方字幕区，与画面物件无运动继承 | 必显 |
| cue:cue-1:en | It is not 3.14 m; it is NVIDIA CUDA 12.4. | 字幕 cue-1 / en / 人工审校译文 | A · 开场 · 出现 0.1–0.9 秒 · 完整可读 0.1–0.9 秒 | 双语字幕英文行｜解释同一原句｜固定在中文字幕正下方，与画面物件无运动继承 | 必显 |
</screen-text-registry>
</structure>
<build>
no build
</build>
<gotchas>
none
</gotchas>
<start>
none
</start>`;

const map = compileBriefTextMap(brief);
assert.equal(map.entries.length, 10);
assert.equal('typefaces' in map, false, 'existing Brief files do not acquire a generated typeface or change their default drawing');
const typefaceBrief = brief.replace('</direction>', 'typeface: primary | font:test-sans | 600\ntypeface: detail | font:test-serif | 400\n</direction>')
  .replace('</structure>', 'typeface-use: role=命名模型 | primary\ntypeface-use: role=标层 | primary\ntypeface-use: id=T01 | detail\n</structure>');
const selectedTypefaces = compileBriefTextMap(typefaceBrief);
assert.equal(selectedTypefaces.entries.find(entry => entry.id === 'T01').typeface, 'detail', 'exact ID overrides a general role');
assert.equal(selectedTypefaces.entries.find(entry => entry.id === 'T04').typeface, 'primary');
assert.equal(selectedTypefaces.entries.find(entry => entry.id === 'cue:cue-1:zh-Hans').typeface, undefined);
assert.throws(() => compileBriefTextMap(typefaceBrief.replace('role=标层', 'id=cue:cue-1:zh-Hans')), {code: 'brief-typeface-target-invalid'});
assert.throws(() => compileBriefTextMap(typefaceBrief.replace('role=标层', 'id=I01')), {code: 'brief-typeface-target-invalid'});
assert.throws(() => compileBriefTextMap(typefaceBrief.replace('role=标层', 'role=命名模型')), {code: 'brief-typeface-binding-duplicate'});
assert.throws(() => compileBriefTextMap(brief.replace('</build>', 'typeface: primary | font:test-sans | 600\n</build>')), {code: 'brief-typeface-block-invalid'});
assert.throws(() => createBriefTextRuntime(selectedTypefaces, {host: null}), {code: 'brief-typeface-map-invalid'},
  'declared role mapping alone must not act as a loaded render map');
assert.throws(() => prepareBriefTypefaces(selectedTypefaces, {
  readFont(id) { return {id, availability: 'local-font', coverage: {supported: false, missing: [{character: '数', codePoint: 'U+6570'}]}}; },
}), error => error.code === 'brief-typeface-coverage' && /数.*U\+6570.*T01/u.test(error.message));
const selector = '\u{E0101}';
const variationMap = compileBriefTextMap(typefaceBrief.replace('font:test-serif', 'font:test-sans')
  .replace('数学五层蛋糕', `粤葛粤${selector}`).replace('A类标签', `葛${selector}`));
assert.throws(() => prepareBriefTypefaces(variationMap, {
  readFont(id, sample) {
    assert.equal(sample, `粤葛粤${selector}\n葛${selector}`, 'font preflight keeps all preceding characters and distinct entry boundaries');
    return {id, availability: 'local-font', coverage: {supported: false, missing: [
      {character: selector, precedingCharacter: '粤', codePoint: 'U+E0101'},
    ]}};
  },
}), error => error.code === 'brief-typeface-coverage' && error.message.includes('U+E0101 (T01)') && !error.message.includes('T04'));
assert.equal(map.entries.find(row => row.id === 'T05').exact, '第一行\n第二行');
assert.equal(map.entries.find(row => row.id === 'MAIN01').direction, 'main');
const noTextMap = compileBriefTextMap(brief.replace(/<screen-text-registry>[\s\S]*?<\/screen-text-registry>/u, '<screen-text-registry>\n</screen-text-registry>'));
assert.equal(noTextMap.entries.length, 0, 'projects with no screen-visible text do not need a fabricated registry row');
assert.throws(() => parseBriefTextRegistry(brief.replace('| T01 |', '| T01 |').replace('| T01 |', '| T01 |', 1).replace('| T04 |', '| T01 |')), {code: 'brief-text-id-duplicate'});
assert.throws(() => parseBriefTextRegistry(brief.replace('A · 开场 · 出现 0–32 秒 · 完整可读 0.85–32 秒', 'A · 开场 · 出现 0–32 秒 · 完整可读 0.85–33 秒')), {code: 'brief-text-scope-invalid'});

const host = {};
const text = createBriefTextRuntime(map, {host, allowCaptionCalibration: true});
assert.equal(host.__laohuBriefText, text, 'the page contract is installed on its actual host');
assert.equal(text.briefSha256, map.briefSha256);
assert.equal(text.assertBriefSha256(map.briefSha256), map.briefSha256);
const staleRuntime = createBriefTextRuntime({...map, briefSha256: '0'.repeat(64)}, {host: null});
assert.throws(() => staleRuntime.assertBriefSha256(map.briefSha256), {code: 'stale-brief-text-map'}, 'a runtime created from an older Brief map is rejected');
const replacementHost = {};
createBriefTextRuntime(map, {host: replacementHost});
replacementHost.__laohuBriefText = staleRuntime;
assert.throws(() => replacementHost.__laohuBriefText.assertBriefSha256(map.briefSha256), {code: 'stale-brief-text-map'}, 'replacing the injected runtime with a stale map remains detectable');
assert.throws(() => text.exact({time: 1, direction: 'A', scene: '开场', object: '标题牌'}, 'NOPE'), {code: 'unknown-brief-text-id'});
assert.throws(() => text.canvas({time: 1, direction: 'B', scene: '开场', object: '标题牌'}, 'T01', {fillText() {}}, 0, 0), {code: 'brief-text-direction-mismatch'});
assert.throws(() => text.canvas({time: 1, direction: 'A', scene: '开场', object: '错对象'}, 'T01', {fillText() {}}, 0, 0), {code: 'brief-text-object-mismatch'});
assert.throws(() => text.canvas({time: 33, direction: 'A', scene: '开场', object: '标题牌'}, 'T01', {fillText() {}}, 0, 0), {code: 'brief-text-time-out-of-scope'});
assert.throws(() => text.assertExact('T01', '改过的文字', {time: 1, direction: 'A', scene: '开场', object: '标题牌'}), {code: 'brief-text-content-mismatch'});

const drawCalls = [];
const canvas = {fillText(value, x, y) { drawCalls.push({value, x, y}); }};
const captionDraws = [];
const testCaptionProfile = await resolveNativeCaptionProfile(NATIVE_CAPTION_PROFILE_IDS[0], {width: 1920, height: 1080,
  displayLanguages: ['zh-Hans', 'en'], calibrationMode: true});
text.recordCaptionProfile(testCaptionProfile);
assert.throws(() => createBriefTextRuntime(map, {host: null}).recordCaptionProfile(testCaptionProfile), {code: 'caption-profile-not-locked'},
  'calibration candidates are blocked outside an explicitly scoped probe runtime');
const calibrationRuntime = createBriefTextRuntime(map, {host: null, allowCaptionCalibration: true});
assert.equal(calibrationRuntime.recordCaptionProfile(testCaptionProfile).mode, 'calibration-candidate');
const frameText = {textContent: ''};
const sampleTimes = Array.from({length: 180}, (_, index) => index / 30);
for (const time of sampleTimes) {
  if (time >= 0.85 && time < 6) text.canvas({time, direction: 'A', scene: '开场', object: '标题牌'}, 'T01', canvas, 12, 24);
  if (time < 2) text.dom({time, direction: 'A', scene: '开场', object: '列表标签'}, 'T04', frameText);
  if (time >= 0.1 && time < 0.9) {
    text.caption({time, direction: 'A', scene: '开场', object: '双语字幕中文行'}, 'cue:cue-1:zh-Hans', exact => captionDraws.push(exact));
    text.caption({time, direction: 'A', scene: '开场', object: '双语字幕英文行'}, 'cue:cue-1:en', exact => captionDraws.push(exact));
  }
}
assert.equal(drawCalls[0].value, '数学五层蛋糕');
assert.equal(frameText.textContent, 'A类标签');
assert.equal(captionDraws[0], '不是 3.14 米，而是 NVIDIA CUDA 12.4。');
assert.equal(text.report().captionProfile.id, NATIVE_CAPTION_PROFILE_IDS[0]);
assert.equal(text.report().captionProfile.mode, 'calibration-candidate');
assert.equal(text.report().captionProfile.values.outlineAt1080, 2.5);
const coverage = text.coverage({start: 0, end: 6, direction: 'A', fps: 30, strict: true, allowNotCovered: true});
assert.equal(coverage.evidence, 'controlled-render-call-trace-only');
assert.equal(coverage.statuses.find(row => row.id === 'T01').status, 'PASS_RENDER_TRACE');
assert.equal(coverage.statuses.find(row => row.id === 'T02').status, 'NOT_COVERED_ENTRY');
assert.equal(coverage.statuses.find(row => row.id === 'T03'), undefined, 'entries wholly after the sample are out of scope');
assert.equal(coverage.statuses.find(row => row.id === 'B01'), undefined, 'another direction is out of scope');
assert.equal(coverage.statuses.find(row => row.id === 'I01').status, 'OBSERVE_IMAGE_TEXT_REQUIRES_VISUAL_REVIEW');

const betweenFramesMap = {...map, entries: map.entries.filter(row => row.id === 'T01').map(row => ({...row, readableStart: 0.85, readableEnd: 1.05}))};
const betweenFrames = createBriefTextRuntime(betweenFramesMap, {host: null});
for (let frame = 0; frame <= 33; frame++) {
  const time = frame / 30;
  if (time >= 0.85 && time < 1.05) betweenFrames.canvas({time, direction: 'A', scene: '开场', object: '标题牌'}, 'T01', canvas, 0, 0);
}
const betweenCoverage = betweenFrames.coverage({start: 0, end: 1.1, direction: 'A', fps: 30, strict: true});
assert.equal(betweenCoverage.statuses[0].status, 'PASS_RENDER_TRACE', 'readableStart=0.85 is checked on real 30fps sample times 0.8667–1.0333');

const shiftedStart = 10.02, shiftedEnd = 10.22;
const shiftedMap = {...map, entries: map.entries.filter(row => row.id === 'T01').map(row => ({...row, visibleStart: 10, visibleEnd: 11, readableStart: 10.06, readableEnd: 10.19}))};
const shifted = createBriefTextRuntime(shiftedMap, {host: null});
for (let frame = 0; shiftedStart + frame / 30 < shiftedEnd; frame++) {
  const time = shiftedStart + frame / 30;
  if (time >= 10.06 && time < 10.19) shifted.canvas({time, direction: 'A', scene: '开场', object: '标题牌'}, 'T01', canvas, 0, 0);
}
assert.equal(shifted.coverage({start: shiftedStart, end: shiftedEnd, direction: 'A', fps: 30}).statuses[0].status, 'PASS_RENDER_TRACE', 'nonzero probe start anchors the frame grid at start+n/fps');
const omitted = createBriefTextRuntime(betweenFramesMap, {host: null});
assert.throws(() => omitted.coverage({start: 0, end: 1.1, direction: 'A', fps: 30}), {code: 'brief-required-text-not-covered'});
assert.throws(() => omitted.coverage({start: 0, end: 1.1, direction: 'A', fps: 30, allowNotCovered: true}), {code: 'brief-required-text-not-covered'}, 'an active readable required item cannot be hidden by the draft-only partial-coverage exception');

const manifest = {
  sourceClock: {sampleRateHz: 1000}, sourceLanguage: 'zh-Hans', displayLanguages: ['zh-Hans', 'en'],
  cues: [{id: 'cue-1', lines: ['不是 3.14 米，而是 NVIDIA CUDA 12.4。'], displayWindow: {startSample: 100, endSample: 900}, translations: [
    {language: 'en', lines: ['It is not 3.14 m; it is NVIDIA CUDA 12.4.']},
  ]}],
};
assert.equal(validateCaptionTextAgainstBrief(manifest, map).status, 'PASS');
const changedCaption = structuredClone(manifest);
changedCaption.cues[0].translations[0].lines[0] = 'It is CUDA.';
assert.throws(() => validateCaptionTextAgainstBrief(changedCaption, map), {code: 'caption-brief-binding-mismatch'});
const changedCueId = structuredClone(manifest);
changedCueId.cues[0].id = 'different-cue';
assert.throws(() => validateCaptionTextAgainstBrief(changedCueId, map), {code: 'caption-brief-binding-mismatch'});
const changedWindow = structuredClone(manifest);
changedWindow.cues[0].displayWindow.endSample = 800;
assert.throws(() => validateCaptionTextAgainstBrief(changedWindow, map), {code: 'caption-brief-binding-mismatch'});

const staticResult = scanProjectTextBindings([
  {path: 'index.html#inline-script-1', rendererEntrypoint: true, content: 'ctx.fillText("未登记字", 1, 2);'},
  {path: 'draw-label.mjs', rendererEntrypoint: false, content: 'export function drawLabel(ctx, text, x, y) { ctx.fillText(text, x, y); }'},
  {path: 'scene.mjs', rendererEntrypoint: true, content: 'screenText.canvas(ctx, ids.title, target, x, y);'},
], map, {direction: 'A', start: 0, end: 6});
assert.equal(staticResult.status, 'FAIL', 'an obvious literal in the renderer entry is rejected');
assert.equal(staticResult.problems.length, 1, 'generic text helper and dynamic registry-map ID do not false-fail statically');
const unknownLiteralId = scanProjectTextBindings([{path: 'scene.js', rendererEntrypoint: true, content: 'screenText.canvas(ctx, "UNKNOWN", target, 0, 0);'}], map, {direction: 'A'});
assert.equal(unknownLiteralId.status, 'FAIL', 'a literal unknown registry ID is rejected at the renderer entry');
const mainStatic = scanProjectTextBindings([], map, {direction: 'main', start: 0, end: 1});
assert.deepEqual(mainStatic.runtimeRequired, ['MAIN01'], 'single named direction works without A/B assumptions');
assert.equal(scanProjectTextBindings([], map, {direction: 'unregistered'}).status, 'FAIL', 'the selected direction must match a registered project direction');

const serialized = `(${createBriefTextRuntime.toString()})(map, {host: globalThis})`;
const browserHost = vm.runInNewContext(serialized, {map, globalThis: {} });
assert.equal(browserHost.format, 'laohu.motion.screen-text-map/1', 'serialized page hook runs without module-scope imports');

const sampleMap = {...map, entries: [
  {...map.entries[0], id: 'one-frame', visibleStart: 6.04, visibleEnd: 6.08, readableStart: 6.04, readableEnd: 6.08},
  {...map.entries[0], id: 'late', visibleStart: 497.77, visibleEnd: 499.7, readableStart: 498.02, readableEnd: 499.7},
]};
const sample = createBriefTextRuntime(sampleMap, {host: null});
const spec = {start: 0, end: 499.7, direction: 'A', fps: 30};
const plan = sample.planFrames({...spec, shots: [{t0: 4, t1: 5.5}, {t0: 253, t1: 271}]});
assert.equal(plan.gridFrames, 14991);
assert.ok(plan.frames.includes(182) && plan.frames.includes(181) && plan.frames.includes(183), 'one readable frame and both appearance boundaries are sampled');
assert.ok(plan.frames.includes(164) && plan.frames.includes(7590) && plan.frames.includes(8129), 'actual shots sample first and last frames');
assert.ok(plan.frames.includes(13500) && plan.frames.includes(14990), 'patrol includes 450 seconds and the actual final frame');
for (const frame of plan.frames) {
  const time = frame / 30;
  const entry = sampleMap.entries[0];
  if (time >= entry.visibleStart && time < entry.visibleEnd) sample.canvas({time, direction: 'A', scene: entry.scene, object: entry.object}, entry.id, canvas, 0, 0);
}
const sampledCoverage = sample.coverage({...spec, samplePlan: plan, fullDuration: true, strict: false});
assert.equal(sampledCoverage.statuses[0].status, 'PASS_SAMPLED_RENDER_TRACE');
assert.equal(sampledCoverage.statuses[0].checkedFrames, 1);
assert.equal(sampledCoverage.statuses[1].status, 'FAIL', 'missing required text in the last seconds still fails');
assert.equal(sample.planFrames({...spec, exhaustiveFrames: true}).frames.length, 14991);

const narrowMap = {...sampleMap, entries: [{...sampleMap.entries[0], visibleStart: 6.041, visibleEnd: 6.042, readableStart: 6.041, readableEnd: 6.042}]};
const narrow = createBriefTextRuntime(narrowMap, {host: null});
const narrowPlan = narrow.planFrames(spec);
assert.throws(() => narrow.coverage({...spec, samplePlan: narrowPlan, fullDuration: true}), /contains no frame/u);
const pointSpec = {...spec, points: [6.041]};
const pointPlan = narrow.planFrames(pointSpec);
const context = {direction: 'A', scene: narrowMap.entries[0].scene, object: narrowMap.entries[0].object};
narrow.canvas({...context, time: 6.041}, 'one-frame', canvas, 0, 0);
assert.equal(narrow.coverage({...pointSpec, samplePlan: pointPlan}).statuses[0].status, 'PASS_STILL_RENDER_TRACE');
assert.throws(() => narrow.canvas({...context, time: 6.042}, 'one-frame', canvas, 0, 0), {code: 'brief-text-time-out-of-scope'});
assert.throws(() => sample.coverage({...spec, end: 200, fullDuration: true}), /outside the full renderer duration/u);

const captionTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'showreel-caption-source-'));
try {
  const srt = '9\r\n00:00:00,100 --> 00:00:00,200\r\nExact 3.14 m\r\n准确 3.14 米\r\n\r\n12\r\n00:00:00,200 --> 00:00:00,500\r\nEnd\r\n结束\r\n';
  const file = path.join(captionTemp, '字幕.srt');
  fs.writeFileSync(file, srt);
  const digest = createHash('sha256').update(srt).digest('hex');
  const declaration = `caption-source: srt | 字幕.srt | sha256=${digest} | source=zh-Hans | display=en,zh-Hans`;
  const withSource = brief.replace('synthetic test input', declaration);
  assert.throws(() => compileBriefTextMap(withSource, {projectRoot: captionTemp}), {code: 'brief-caption-source-conflict'});
  const externalBrief = withSource.replace(/^\| cue:.*\n/gmu, '');
  const external = compileBriefTextMap(externalBrief, {projectRoot: captionTemp});
  assert.equal(external.entries.length, 12);
  assert.equal(external.entries.find(row => row.id === 'cue:9:en').exact, 'Exact 3.14 m');
  assert.equal(external.entries.find(row => row.id === 'cue:12:zh-Hans').visibleStart, 0.2);
  const browser = {document: {baseURI: 'http://localhost/index.html'}};
  const runtime = createBriefTextRuntime(external, {host: browser});
  const track = runtime.captionInput('A');
  assert.equal(track.profileId, 'native-16x9-standard');
  assert.equal(track.manifest.format, SRT_CAPTION_MANIFEST_FORMAT);
  assert.equal(track.manifest.editPlan, undefined, 'SRT display evidence carries no inferred ASR edit plan or anchors');
  assert.equal(track.manifest.cues[0].anchors, undefined);
  assert.equal((await verifyCaptionBinding(track.manifest, track.expectedBinding)).sourceSha256, digest);
  assert.equal(runtime.validateCaptionManifest(track.manifest).status, 'PASS');
  const staleBinding = {...track.expectedBinding, sourceSha256: '0'.repeat(64)};
  await assert.rejects(() => verifyCaptionBinding(track.manifest, staleBinding), {code: 'stale-caption-binding'});
  fs.appendFileSync(file, 'changed');
  assert.throws(() => compileBriefTextMap(externalBrief, {projectRoot: captionTemp}), {code: 'stale-brief-caption-source'});
} finally { fs.rmSync(captionTemp, {recursive: true}); }

console.log('screen-text registry checks passed: eight-block table, exact text, current Brief hash, live consumer binding, locked/probe caption profile, scope, interval and frame-grid coverage, captions, and bounded static scan');
