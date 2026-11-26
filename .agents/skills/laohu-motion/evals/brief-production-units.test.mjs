import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { emptyProductionTable, readBriefProductionUnits } from '../scripts/brief-production-units.mjs';
import { startOpenMotion } from '../templates/runtime/openmotion-studio/server.mjs';
import { needsBriefTextInputs, readSetup, snapshot, workbenchModel } from '../templates/runtime/production-workbench/model.mjs';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const wrapper = fileURLToPath(new URL('../scripts/laohu-showreel.mjs', import.meta.url));
const testRoot = path.join(repo, '.cache', 'validation', 'editorial-delivery-20261119', 'contract');
fs.mkdirSync(testRoot, { recursive: true });

function workspace(label, t) {
  const project = fs.mkdtempSync(path.join(testRoot, `${label}-`));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  return project;
}

function put(root, relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
}

function twoUnits({ bound = false, addFrame = false, title = '松开夹具' } = {}) {
  const a = bound ? '成片@timeline.js#clamp' : '计划';
  const b = bound ? '成片@timeline.js#release' : '待对齐';
  const speechA = bound ? 'speech.srt#1' : '口播待对齐';
  const frames = addFrame ? 'contact@0.60,aligned@0.80' : 'contact@0.60';
  return `<structure>\n${emptyProductionTable.replace('</production-units>', [
    `| clamp | 夹具归位 | 0 | 1 | 移动上夹片直到边缘与下夹片对齐。 | clamp-pass,audio-carry | ${a} | ${speechA} | ${frames} | 混合 |`,
    `| release | ${title} | 1 | 2 | 接上对齐状态，保持视线在轴心，向上松开。 | audio-carry | ${b} | ${speechA} | 沿用@contact | 动画 |`,
    '| tail | 尾声 | 2 | 3 | 保持上一画面直到尾声落下。 | | ' + (bound ? '成片@timeline.js#tail' : '计划') + ' | 无口播 | 无 | 声音 |',
    '</production-units>',
  ].join('\n'))}\n\n### [clamp] 夹具归位\n固定斜侧俯视，右下方的槽轴是唯一注意目标。两块夹片保持相同的槽口大小。上夹片从右向左移，接触边缘后按真实丝扣转动停住。contact 选择刚接触而还可辨别两条边缘的一帧。${addFrame ? 'aligned 检查完全对齐的第二帧。' : ''}声音从接触前开始，尾音进入下一镜。\n\n### [release] ${title}\n继承轴心、接触位置和底层露出的短边。先停留，让观众看清轴心未偏移，然后夹片垂直上移，底片不动。沿用 contact 帧校对对齐关系，连续回看通过 1 秒的实际交接。\n\n### [tail] 尾声\n画面延续上一帧的底片位置，等已进入的声音停止再黑场。\n</structure>`;
}

const clock = `export const DUR = 3; export const FPS = 30;
export const SHOTS = [{id:'clamp',t0:0,t1:1},{id:'release',t0:1,t1:2},{id:'tail',t0:2,t1:3}];`;
const crossingCue = '1\n00:00:00,760 --> 00:00:01,240\n现在松开\n';

function withTextRegistry(structure, {face = 'font:noto-sans-sc-variable', weight = 500, exact = '对齐', end = '1', bind = true} = {}) {
  const block = (name, value) => `<${name}>\n${value}\n</${name}>`;
  const registry = `<screen-text-registry>
| ID | 精确原文 | 材料 / cue | 方向 · 画面 · 出现起止 · 完整可读起止 | 对象 · 作用 · 空间 / 动态关系 | 必显 |
| --- | --- | --- | --- | --- | --- |
| contact-label | ${exact} | 夹具标记 | A · 归位 · 出现 0.1–${end} 秒 · 完整可读 0.2–0.8 秒 | 夹片｜标记｜靠近接触位置 | 必显 |
| release-label | 松开 | 夹具标记 | A · 松开 · 出现 1–2 秒 · 完整可读 1.2–1.8 秒 | 夹片｜标记｜跟随上夹片 | 必显 |
| tail-label | 收束 | 尾声画面 | A · 尾声 · 出现 2–3 秒 · 完整可读 2.2–2.8 秒 | 底片｜收束｜留在画面原位 | 可选 |
</screen-text-registry>`;
  const typefaces = bind ? `\ntypeface: marks | ${face} | ${weight}\ntypeface: steady | font:noto-serif-sc-variable | 400` : '';
  const bindings = bind ? 'typeface-use: role=标记 | marks\ntypeface-use: id=release-label | steady\ntypeface-use: id=tail-label | steady\n' : '';
  return [block('role', '动画设计'), block('inputs', '片段测试材料'), block('confirmations', '本地测试'), block('direction', `方向 A${typefaces}`),
    structure.replace('</structure>', `${bindings}${registry}\n</structure>`), block('build', '渲染动画'), block('gotchas', '检验各段衔接'), block('start', '夹片归位')].join('\n');
}

test('production unit identity follows effective font and screen text only where visible', () => {
  const structure = twoUnits();
  const [initial, next, tail] = readBriefProductionUnits(withTextRegistry(structure)).units;
  assert.deepEqual(initial.screenText.map(entry => [entry.id, entry.typeface]), [['contact-label', { id: 'font:noto-sans-sc-variable', weight: 500 }]]);
  assert.deepEqual(next.screenText.map(entry => [entry.id, entry.typeface]), [['release-label', { id: 'font:noto-serif-sc-variable', weight: 400 }]]);
  assert.doesNotMatch(tail.directorText, /typeface-use:/u, 'font binding lines interleaved with directors are not their prose');
  for (const change of [{weight: 700}, {face: 'font:lxgw-wenkai'}, {exact: '靠拢'}]) {
    const [first, reuse, unaffected] = readBriefProductionUnits(withTextRegistry(structure, change)).units;
    assert.notEqual(first.designRevision, initial.designRevision);
    assert.notEqual(reuse.designRevision, next.designRevision, 'reuse carries the preceding frame version');
    assert.equal(unaffected.designRevision, tail.designRevision);
    assert.equal(first.directorText, initial.directorText);
  }
  const crossing = readBriefProductionUnits(withTextRegistry(structure, {end: '1.2'})).units[1];
  assert.deepEqual(crossing.screenText.map(entry => entry.id), ['contact-label', 'release-label']);
  const unbound = readBriefProductionUnits(withTextRegistry(structure, {bind: false})).units[0];
  assert.equal(unbound.screenText[0].typeface, undefined);
  assert.throws(() => readBriefProductionUnits(withTextRegistry(structure).replace('id=release-label', 'id=unknown-label')),
    {code: 'brief-typeface-target-invalid'});
});

test('font-only edits send already published evidence to history before compiling new fonts', async t => {
  const project = workspace('font-evidence', t);
  const structure = twoUnits({bound: true}).replace('| 无口播 | 无 | 声音 |', '| 无口播 | linger@2.4 | 声音 |');
  const original = withTextRegistry(structure);
  put(project, 'brief.md', original);
  put(project, 'timeline.js', clock);
  put(project, 'speech.srt', crossingCue);
  put(project, 'index.html', '<canvas></canvas>');
  const textInputs = () => spawnSync(process.execPath, [wrapper, 'text-inputs', project], {cwd: repo, encoding: 'utf8'});
  assert.equal(typeof needsBriefTextInputs(project), 'string');
  const compiled = textInputs();
  assert.equal(compiled.status, 0, compiled.stderr);
  assert.equal(needsBriefTextInputs(project), null);
  const model = () => {
    const setup = readSetup(project);
    return workbenchModel(project, setup, snapshot(project, setup), {});
  };
  const initial = await model();
  const [unit, , closing] = initial.designPlan.units;
  const records = [[unit, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2yQAAAAASUVORK5CYII='],
    [closing, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=']].map(([designUnit, png]) => {
    const image = Buffer.from(png, 'base64');
    const sha256 = createHash('sha256').update(image).digest('hex');
    const imageFile = `.showreel-progress/artifacts/${sha256}.png`;
    put(project, imageFile, image);
    const [planned] = designUnit.frames;
    return {id: planned.id, path: imageFile, sha256, width: 1, height: 1,
      frame: {event: planned.id, role: 'design', source: 'code', sourcePath: imageFile, sourceSha256: sha256,
        timeSeconds: planned.time, unitDesignRevision: designUnit.sourceDesignRevision}};
  });
  const [contactFrame, independentFrame] = records;
  put(project, 'qa/probe.mp4', 'probe fixture');
  put(project, '.showreel-input-delivery.json', {format: 'laohu.motion.input-delivery/2', productionUnitsRequired: true,
    keyframeSet: {revision: 'fixture', artifacts: records},
  explorations: [{kind: 'bounded-dynamic-probe', start: 0.5, duration: 0.4, purpose: '接触后看清标记', renderRevision: initial.renderRevision,
    unitDesignRevisions: {clamp: unit.designRevision}, mp4: {path: 'qa/probe.mp4'}}]});
  function preview(id, publishedAt) {
    const directory = `.showreel-progress/revisions/${id}/project`;
    fs.mkdirSync(path.join(project, directory), {recursive: true});
    for (const file of ['index.html', 'brief.md', '.cache', 'fonts']) fs.cpSync(path.join(project, file), path.join(project, directory, file),
      {recursive: true, mode: fs.constants.COPYFILE_FICLONE});
    put(project, '.showreel-progress/status.json', {preview: {final: true, directory, publishedAt}, stages: [{id: 'style', status: 'waiting'}],
      artifacts: records.map(row => ({id: row.id, stage: 'style', type: 'image', url: '/artifact/' + path.basename(row.path), frame: row.frame}))});
  }
  preview('fixture', new Date(Date.now() - 1000).toISOString());
  put(project, 'out/final.mp4', 'old export fixture');
  const current = await model();
  assert.equal(current.framePlan[0].state, 'published');
  assert.equal(current.materials.designFrames.length, 2);
  assert.equal(current.segments[0].state, 'sample');
  assert.equal(current.exported, '/project/out/final.mp4');

  put(project, 'brief.md', original.replace('本地测试', '阶段确认说明变化，画面内容相同'));
  const refreshed = textInputs();
  assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.equal(needsBriefTextInputs(project), null);
  const annotated = await model();
  assert.equal(annotated.renderRevision, current.renderRevision);
  assert.equal(annotated.segments[0].state, 'sample');
  assert.equal(annotated.exported, '/project/out/final.mp4');

  put(project, 'brief.md', withTextRegistry(structure, {weight: 700}));
  const next = await model();
  assert.equal(next.designPlan.units[0].directorText, unit.directorText);
  assert.notEqual(next.renderRevision, current.renderRevision);
  assert.equal(next.framePlan[0].state, 'planned');
  assert.deepEqual(next.frames.map(row => row.id), ['linger']);
  assert.deepEqual(next.materials.designFrames.map(row => row.file), [`/project/${independentFrame.path}`]);
  assert.equal(next.segments[0].state, 'waiting');
  assert.equal(next.exported, null);
  assert.ok(next.materials.history.some(row => row.href === `/project/${contactFrame.path}`));
  assert.ok(next.materials.history.some(row => row.href === '/project/out/final.mp4'));
  const confirmOld = spawnSync(process.execPath, [wrapper, 'progress', project, '--stage', 'style', '--confirm', '--size', '320x180',
    '--evidence-text', '测试确认所选的旧夹具状态', '--scope', '这轮夹具模型方向及接触关键帧'], {cwd: repo, encoding: 'utf8'});
  assert.match(confirmOld.stderr, /关键帧 contact 对应的 Brief 字项、导演内容或时点已变化/u);
  const rebuilt = textInputs();
  assert.equal(rebuilt.status, 0, rebuilt.stderr);
  const mapPath = path.join(project, '.cache/brief-text-map.json');
  const ready = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  assert.equal(ready.typefaces.find(face => face.name === 'marks').weight, 700);
  assert.equal(needsBriefTextInputs(project), null);
  preview('new-final', new Date(Date.now() + 1000).toISOString());
  const newPreview = await model();
  assert.equal(newPreview.framePlan[0].state, 'planned');
  assert.equal(newPreview.stages.find(row => row.id === 'export').state, 'review');
  assert.equal(newPreview.exported, null, 'a newer final preview cannot make an older export current again');
  put(project, 'brief.md', withTextRegistry(structure, {weight: 999}));
  assert.match(textInputs().stderr, /requests weight 999/u);
  assert.equal(JSON.parse(fs.readFileSync(mapPath, 'utf8')).briefSha256, ready.briefSha256, 'failed publication preserves the prior cache bytes');
  assert.equal(typeof needsBriefTextInputs(project), 'string', 'the cache cannot represent this invalid Brief');
  put(project, 'brief.md', withTextRegistry(structure, {bind: false}));
  assert.equal(textInputs().status, 0);
  assert.equal(JSON.parse(fs.readFileSync(mapPath, 'utf8')).typefaces, undefined, 'removing the declarations clears the prior selected fonts');
  assert.equal(needsBriefTextInputs(project), null);
});

test('workbench subtitle navigation follows the Brief SRT and reports ambiguity', async t => {
  const project = workspace('subtitle-source', t);
  const brief = twoUnits({bound: true}).replaceAll('speech.srt#1', 'voice/cut.srt#1');
  put(project, 'timeline.js', clock);
  put(project, 'brief.md', brief);
  put(project, 'voice/cut.srt', crossingCue);
  put(project, 'captions.srt', crossingCue.replace('现在松开', '历史字幕'));
  fs.utimesSync(path.join(project, 'captions.srt'), 2_000_000_000, 2_000_000_000);
  const model = () => {
    const setup = readSetup(project);
    return workbenchModel(project, setup, snapshot(project, setup), {});
  };
  assert.equal((await model()).captions[0].text, '现在松开');
  assert.equal((await model()).subtitles, '/project/voice/cut.srt');
  fs.renameSync(path.join(project, 'voice/cut.srt'), path.join(project, 'voice/previous.srt'));
  assert.equal((await model()).subtitles, null, 'a missing source must not fall back to another version');
  fs.renameSync(path.join(project, 'voice/previous.srt'), path.join(project, 'voice/cut.srt'));
  put(project, 'brief.md', brief.replace('voice/cut.srt#1', 'voice/cut.srt#1；captions.srt#1'));
  assert.equal((await model()).subtitles, null);
  assert.match((await model()).stages.find(stage => stage.id === 'srt').note, /多个 SRT/u);
  put(project, '.showreel-progress/workbench.json', {subtitleCandidates: ['voice/cut.srt']});
  assert.equal((await model()).subtitles, '/project/voice/cut.srt');
  put(project, 'brief.md', '<structure>历史散文 Brief。</structure>');
  assert.equal((await model()).subtitles, '/project/voice/cut.srt', 'legacy explicit candidates remain usable');
});

test('authoring structure keeps a shared previous frame and requires precise paragraph identity', () => {
  const plan = readBriefProductionUnits(twoUnits(), { required: true });
  assert.equal(plan.units[1].reuseFrameId, 'contact');
  assert.equal(plan.units[1].reusedFrameDesignRevision, plan.units[0].designRevision);
  assert.equal(plan.units[1].frames.length, 0);
  assert.throws(() => readBriefProductionUnits(twoUnits().replace('沿用@contact', '沿用@unknown'), { required: true }), /沿用前段/);
  assert.throws(() => readBriefProductionUnits(twoUnits().replace('### [release] 松开夹具', '### [release] 不同标题'), { required: true }), /标题一致/);
  assert.throws(() => readBriefProductionUnits(twoUnits().replace('contact@0.60', 'contact@1'), { required: true }), /片内时点/);
  assert.throws(() => readBriefProductionUnits(twoUnits().replace('| 1 | 2 |', '| 1.1 | 2 |'), { required: true }), /区间顺序/);
  assert.equal(readBriefProductionUnits('<structure>历史散文 Brief。</structure>'), null);
  assert.throws(() => readBriefProductionUnits('<structure>历史散文 Brief。</structure>', { required: true }), /十列/);
});

test('production workbench reads current Brief before rendered assets and after cut registration', async t => {
  const project = workspace('workbench', t);
  put(project, 'brief.md', twoUnits());
  const app = await startOpenMotion(project);
  try {
    const base = new URL(app.url);
    const request = async endpoint => {
      const response = await fetch(new URL(endpoint, base));
      const json = await response.json();
      assert.equal(response.status, 200, JSON.stringify(json));
      return json;
    };
    const cut = () => request('/__workbench/cut');
    const model = () => request('/__workbench/model');
    const initial = await cut();
    const first = await model();
    assert.deepEqual(initial.units.map(unit => unit.id), ['clamp', 'release']);
    assert.deepEqual(first.designPlan.units.map(unit => unit.id), ['clamp', 'release', 'tail']);
    assert.deepEqual(initial.clips, []);
    assert.equal(first.duration, 3);
    assert.equal(first.framePlan.length, 1);
    assert.equal(first.framePlan[0].state, 'planned');
    assert.match(initial.units[0].directorText, /固定斜侧俯视/);
    assert.equal(initial.units[1].timeState, 'waiting');

    put(project, 'brief.md', twoUnits({ bound: true, addFrame: true, title: '确认后松开夹具' }));
    put(project, 'timeline.js', clock);
    put(project, 'speech.srt', crossingCue);
    put(project, 'assets/clip-state.json', { version: 1, edits: {}, history: [] });
    put(project, 'assets/workbench/clips.json', { version: 1, duration: 3,
      units: [{ id: 'stale-catalog', title: '遗留快照', t0: 0, t1: 3 }],
      clips: [{ id: 'audio-carry', title: '穿过段界的口播', kind: 'voice', number: 1, t0: 0.7, t1: 1.3 }] });
    const remapped = await cut(), full = await model();
    assert.deepEqual(remapped.units.map(unit => unit.id), initial.units.map(unit => unit.id));
    assert.equal(remapped.units[1].title, '确认后松开夹具');
    assert.equal(remapped.clips.length, 1, '段间共享同一音频使用，不复制回放记录');
    assert.deepEqual(remapped.units.map(unit => unit.bindings[0].intersection), [{ t0: 0.76, t1: 1 }, { t0: 1, t1: 1.24 }]);
    assert.deepEqual(full.framePlan.map(frame => frame.id), ['contact', 'aligned']);
    assert.equal(full.seams[0].time, 1);

    const frame = readBriefProductionUnits(fs.readFileSync(path.join(project, 'brief.md'), 'utf8')).units[0];
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2yQAAAAASUVORK5CYII=', 'base64');
    const imageHash = createHash('sha256').update(image).digest('hex');
    const imagePath = `.showreel-progress/artifacts/${imageHash}.png`;
    put(project, imagePath, image);
    put(project, '.showreel-input-delivery.json', { keyframeSet: { artifacts: [{ path: imagePath, sha256: imageHash,
      frame: { event: 'contact', role: 'design', source: 'cover', timeSeconds: 0.6, unitDesignRevision: frame.designRevision } }] },
      explorations: [{ kind: 'bounded-dynamic-probe', start: 0.65, duration: 0.1, purpose: '只检查接触时的停顿',
        renderRevision: full.renderRevision, unitDesignRevisions: { clamp: full.designPlan.units[0].designRevision }, mp4: { path: 'qa/probe.mp4' } }] });
    put(project, 'qa/probe.mp4', 'test evidence fixture');
    const published = await model();
    assert.equal(published.framePlan[0].state, 'published');
    assert.equal(published.framePlan[0].artifacts[0].role, 'design');
    assert.equal(published.segments[0].state, 'sample');
    const [a, b] = published.designPlan.units;
    put(project, 'qa/review.md', '# technical test proof');
    put(project, '.showreel-progress/workbench-checks.json', { segments: [{ unitId: a.id, t0: a.t0, t1: a.t1,
      unitDesignRevision: a.designRevision, renderRevision: published.renderRevision, file: 'qa/review.md', state: 'checked' }],
      seams: [{ fromUnitId: a.id, toUnitId: b.id, fromDesignRevision: a.designRevision, toDesignRevision: b.designRevision,
        time: 1, renderRevision: published.renderRevision, file: 'qa/review.md', state: 'checked' }] });
    const checked = await model();
    assert.equal(checked.segments[0].state, 'checked');
    assert.equal(checked.seams[0].state, 'checked');
    // Editing an ASR/SRT input that is referenced by the Brief must cause the current
    // projection to rebind, even though generic workbench settings have no subtitle path.
    put(project, 'speech.srt', crossingCue.replace('现在松开', '等一下再松开'));
    const updated = await model();
    assert.notEqual(updated.revision, checked.revision);
    assert.equal(updated.designPlan.units[0].bindings[0].text, '等一下再松开');
    assert.equal(updated.segments[0].state, 'waiting');
    assert.equal(updated.seams[0].state, 'waiting');
    put(project, 'speech.srt', crossingCue);
    put(project, 'brief.md', twoUnits({ bound: true, addFrame: true, title: '确认后松开夹具' }).replace('固定斜侧俯视', '固定正面平视'));
    const changedDesign = await model();
    assert.notEqual(changedDesign.designPlan.units[0].designRevision, a.designRevision);
    assert.notEqual(changedDesign.designPlan.units[1].designRevision, b.designRevision, '后段沿用旧帧，随前段设计过期');
    assert.equal(changedDesign.framePlan[0].state, 'planned');
    assert.equal(changedDesign.segments[0].state, 'waiting');
    assert.equal(changedDesign.seams[0].state, 'waiting');
    put(project, 'brief.md', '<structure>历史散文 Brief。</structure>');
    assert.equal((await cut()).units[0].id, 'stale-catalog');
    assert.equal((await model()).designPlan, null);
    assert.equal((await model()).shots[0].id, 'clamp');
  } finally { await app.close(); }
});

test('brief-units CLI reports real final anchors and refuses pending or stale timing', t => {
  const project = workspace('brief-units', t);
  const cli = (...args) => spawnSync(process.execPath, [wrapper, 'brief-units', project, ...args], { cwd: repo, encoding: 'utf8' });
  put(project, 'brief.md', twoUnits());
  const draft = cli();
  assert.equal(draft.status, 0, draft.stderr);
  assert.equal(JSON.parse(draft.stdout).units[0].timeState, 'planned');
  assert.match(cli('--final').stderr, /工程成片时间线/);
  put(project, 'timeline.js', clock);
  put(project, 'brief.md', twoUnits({ bound: true }));
  put(project, 'speech.srt', crossingCue);
  const resolved = cli('--final');
  assert.equal(resolved.status, 0, resolved.stderr);
  assert.deepEqual(JSON.parse(resolved.stdout).units.map(row => row.timeState), ['bound', 'bound', 'bound']);
  put(project, 'speech.srt', crossingCue.replace('01,240', '00,900'));
  assert.match(cli('--final').stderr, /release.*speech\.srt#1.*未在本片段出现/su);
  put(project, 'speech.srt', crossingCue);
  put(project, 'timeline.js', clock.replace('t1:1}', 't1:0.9}'));
  assert.match(cli('--final').stderr, /clamp.*0–0\.9/su);
});

test('resolved speech and source-free presentation retain separate ASRcut target intervals', t => {
  const project = workspace('canonical-clock', t);
  const targetRange = (startSample, endSample) => ({ startSample, endSample, sampleRateHz: 48000 });
  const speech = { kind: 'source', occurrenceId: 'occurrence-a', targetRange: targetRange(0, 48000),
    timingPrecision: 'utterance', transcriptSegments: [{ text: '保留这段。' }] };
  const presentation = { kind: 'presentation', id: 'hold-a', targetRange: targetRange(48000, 96000) };
  const content = twoUnits({ bound: true })
    .replace('成片@timeline.js#clamp', '成片@voice/timeline.json#occurrence-a')
    .replace('成片@timeline.js#release', '成片@voice/timeline.json#hold-a')
    .replace('speech.srt#1', 'voice/timeline.json#occurrence-a')
    .replace('speech.srt#1', '无口播');
  put(project, 'voice/timeline.json', { format: 'laohu.asrcut.timeline/2', state: 'frozen', clips: [speech], units: [speech, presentation] });
  put(project, 'timeline.js', clock);
  put(project, 'brief.md', content);
  const output = spawnSync(process.execPath, [wrapper, 'brief-units', project, '--final'], { cwd: repo, encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr);
  const [source, held] = JSON.parse(output.stdout).units;
  assert.equal(source.bindings[0].precision, 'utterance');
  assert.equal(source.bindings[0].text, '保留这段。');
  assert.deepEqual(held.timeSource.ids, ['hold-a']);
  assert.deepEqual(held.bindings, []);
});
