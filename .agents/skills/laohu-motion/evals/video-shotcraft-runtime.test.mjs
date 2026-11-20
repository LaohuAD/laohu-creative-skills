import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {__test as Shotcraft, prepareShotcraftInput, renderFilm, renderShotcraftTemplate} from '../templates/adapters/video-shotcraft-remotion.mjs';
import {createProjectShotEntrypoint, prepareProjectShotDescriptor, projectShotWebpackAliases} from '../templates/adapters/laohu-project-shot.mjs';
import {resolveMotionRuntime, managedMotionRuntimeRoot} from '../scripts/laohu-motion-runtime.mjs';
import {inspectFilmReceipt, validatePlanFile} from '../scripts/production-plan.mjs';
import {compilePlan, freezePlan, hashPlan, importAsrJson} from '../../laohu-asrcut/scripts/asrcut.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const skillDir = path.join(repoRoot, '.agents/skills/laohu-motion');
const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, '.agents/skills/laohu-motion/templates/catalog.json'), 'utf8'));
const sourceLedger = JSON.parse(fs.readFileSync(path.join(skillDir, 'templates/maintenance/source-ledger.json'), 'utf8'));
const sourceRoot = process.env.MOTION_SOURCE_ROOT ? path.resolve(process.env.MOTION_SOURCE_ROOT) : null;
const templatesCli = path.join(repoRoot, '.agents/skills/laohu-motion/scripts/templates.mjs');
const shotcraftAdapterPath = path.join(repoRoot, '.agents/skills/laohu-motion/templates/adapters/video-shotcraft-remotion.mjs');
const validationRoot = path.join(repoRoot, '.cache/validation/motion-local-integration/final-fixes/shotcraft');
const templateRenderRoot = path.join(repoRoot, '.cache/tmp/template-render/motion-source-integration/runtime');
const blueprintPath = path.join(validationRoot, 'compile-fixture.json');
fs.mkdirSync(path.dirname(blueprintPath), {recursive: true});
const entry = (id) => catalog.templates.find((row) => row.id === id);
const shownEntries = new Map();
function showEntry(id) {
  if (shownEntries.has(id)) return shownEntries.get(id);
  const result = spawnSync(process.execPath, [templatesCli, 'show', id, '--json'], {cwd:repoRoot, encoding:'utf8'});
  assert.equal(result.status, 0, `templates show ${id} failed: ${result.stderr}`);
  const shown = JSON.parse(result.stdout);
  const indexed = catalog.templates.find((row) => row.id === id || row.productionId === id)
    || sourceLedger.sourceOnlyTemplates.find((row) => row.id === id || row.productionId === id)
    || sourceLedger.referenceCatalog.entries.find((row) => row.id === id || row.productionId === id);
  assert.equal(shown.id, indexed?.productionId || indexed?.id || id, 'ordinary show returns the canonical local production ID, including when addressed by a legacy catalog ID');
  shownEntries.set(id, shown);
  return shown;
}
test('legacy Show alias and local production ID resolve the same callable contract', () => {
  const legacy = showEntry('video-shotcraft-paper-title-card');
  const productionId = legacy.productionId || legacy.id;
  const canonical = showEntry(productionId);
  assert.equal(legacy.id, 'paper-title-card-template');
  assert.equal(canonical.id, legacy.id);
  for (const field of ['parameters', 'trueParameterization', 'component', 'fidelityModes', 'durationContract']) {
    assert.deepEqual(canonical[field], legacy[field], `show by legacy ID and production ID must expose the same ${field}`);
  }
});
function exportedFieldsFor(id) {
  const source = fs.readFileSync(shotcraftAdapterPath, 'utf8');
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`["']${escaped}["']\\s*:\\s*new Set\\((?:\\[([^\\]]*)\\])?\\)`));
  assert.ok(match, `EXPORTED_FIELDS has no explicit row for ${id}`);
  return new Set([...(match[1] || '').matchAll(/["']([^"']+)["']/g)].map((row) => row[1]));
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {cwd:repoRoot, encoding:'utf8', maxBuffer:32 * 1024 * 1024, ...options});
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout;
}
function sourcePin(sourceId, relativePath) {
  const source = sourceLedger.sources.find((row) => row.id === sourceId);
  const pin = source?.files?.find((row) => row.path === relativePath);
  assert.ok(source && pin, `maintenance source ledger must pin ${sourceId}/${relativePath}`);
  return {source, pin};
}
function sourceSkipReason(sourceId, relativePaths) {
  if (!sourceRoot) return 'MOTION_SOURCE_ROOT is unset; source comparison skipped';
  const missing = relativePaths.find((relativePath) => !fs.existsSync(path.join(sourceRoot, sourceId, relativePath)));
  return missing ? `MOTION_SOURCE_ROOT is missing ${sourceId}/${missing}; source comparison skipped` : false;
}
function readPinnedSource(sourceId, relativePath) {
  const {pin} = sourcePin(sourceId, relativePath);
  const bytes = fs.readFileSync(path.join(sourceRoot, sourceId, relativePath));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256, `${sourceId}/${relativePath} must match maintenance source-ledger SHA-256`);
  return bytes;
}
function requireShotcraftBrowser() {
  const candidates = [process.env.MOTION_BROWSER, process.env.MOTION_CHROME, process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean);
  const browser = candidates.find((file) => fs.existsSync(file));
  assert.ok(browser, 'Chrome/Chromium is required for the source-vs-adapter SpeedBlur comparison');
  return browser;
}
function requireShotcraftFfmpeg() {
  const candidates = [process.env.MOTION_FFMPEG, '/opt/homebrew/Cellar/ffmpeg@7/7.1.5_3/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', 'ffmpeg'].filter(Boolean);
  const ffmpeg = candidates.find((file) => file === 'ffmpeg'
    ? spawnSync(file, ['-version'], {encoding:'utf8', stdio:'ignore'}).status === 0
    : fs.existsSync(file) && spawnSync(file, ['-version'], {encoding:'utf8', stdio:'ignore'}).status === 0);
  assert.ok(ffmpeg, 'a working FFmpeg/ffprobe pair is required for the source-vs-adapter SpeedBlur comparison');
  return ffmpeg;
}
function rgbaFrame(file, ffmpeg) {
  const result = spawnSync(ffmpeg, ['-v','error','-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'], {encoding:null, maxBuffer:32 * 1024 * 1024});
  assert.equal(result.status, 0, `FFmpeg could not decode ${file}: ${result.stderr?.toString('utf8')}`);
  assert.equal(result.stdout.length, 1920 * 1080 * 4, `${file} must decode to one 1920×1080 RGBA frame`);
  return result.stdout;
}
function rgbaVideoFrame(file, frame, ffmpeg) {
  const result = spawnSync(ffmpeg, ['-v','error','-i',file,'-vf',`select=eq(n\\,${frame})`,'-fps_mode','passthrough','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'], {encoding:null, maxBuffer:32 * 1024 * 1024});
  assert.equal(result.status, 0, `FFmpeg could not decode frame ${frame} from ${file}: ${result.stderr?.toString('utf8')}`);
  assert.equal(result.stdout.length, 1920 * 1080 * 4, `${file} frame ${frame} must decode to one 1920×1080 RGBA frame`);
  return result.stdout;
}
function changedPixelCount(left, right) {
  assert.equal(left.length, right.length);
  let changed = 0;
  for (let at = 0; at < left.length; at += 4) {
    if (left[at] !== right[at] || left[at + 1] !== right[at + 1] || left[at + 2] !== right[at + 2] || left[at + 3] !== right[at + 3]) changed++;
  }
  return changed;
}
function warmMediaPixelCount(rgba, {x, y, width, height}) {
  let count = 0;
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
    const at = (py * 1920 + px) * 4;
    if (rgba[at] > 180 && rgba[at + 1] > 120 && rgba[at + 2] < 100) count++;
  }
  return count;
}
function brightPixelCount(rgba, {x, y, width, height}) {
  let count = 0;
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
    const at = (py * 1920 + px) * 4;
    if (rgba[at] > 210 && rgba[at + 1] > 210 && rgba[at + 2] > 210 && rgba[at + 3] > 200) count++;
  }
  return count;
}
const grain = entry('video-shotcraft-grain-dissolve');

function grainSegment(id, startSec, endSec, extra = {}) {
  return {
    id, renderer: 'video-shotcraft-remotion', sourceCatalogId: grain.id,
    componentPath: grain.component.path, componentSha256: grain.component.sha256,
    exportName: grain.component.exportName, sourceCommit: '1266a3ec4831289c4d893d42dd5102723658039a',
    sourceDurationFrames: 60, fidelityMode: 'source-adapted-local', props: {brandName: 'Luna'},
    compositionGroupId: 'grain-pair', startSec, endSec, ...extra,
  };
}

function grainFilm({segments, transitionEdges = [], compositionGroups = [{id: 'grain-pair', segmentIds: segments.map((row) => row.id)}], durationSec = segments.at(-1).endSec, ...extra}) {
  return {
    format: 'laohu.huashu-film-blueprint/2', width: 1920, height: 1080, fps: 30,
    clock: {kind: 'film-global', durationSec}, segments, compositionGroups, transitionEdges, ...extra,
  };
}

const compile = (blueprint) => Shotcraft.compileFilmV2(blueprint, blueprintPath, catalog);

test('film /2 compiles continuous exact-source segments into one declared composition group', async () => {
  const schedule = await compile(grainFilm({segments: [grainSegment('grain-a', 0, 2), grainSegment('grain-b', 2, 4)]}));
  assert.equal(schedule.totalFrameCount, 120);
  assert.deepEqual(schedule.rows.map((row) => row.frameRange), [
    {startFrame: 0, endFrame: 60}, {startFrame: 60, endFrame: 120},
  ]);
  assert.deepEqual(schedule.groups, [{id: 'grain-pair', segmentIds: ['grain-a', 'grain-b'], frameRange: {startFrame: 0, endFrame: 120}}]);
  assert.equal(schedule.rows[0].layers[0].catalogId, grain.id);
  assert.deepEqual(schedule.rows[0].layers[0].props, {brandName: 'Luna'});
});

test('film /2 full OM uses the canonical renderer and preserves caller controls without a duration injection', async () => {
  const template = entry('laohu-motion-whiteboard');
  const fields = {
    title: 'runtime contract probe',
    omCues: {words: [{word: '海量', start: 0.25, end: 0.42}]},
    omScore: 'X:1\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\nV:lead inst=piano\nC D E F |',
    omMusic: {off: true},
    sourceCueBindings: [{cueIndex: 1, kind: 'point', sourceWord: '海量', word: '上下文', sfx: false}],
  };
  const segment = {
    id: 'native-om', renderer: 'laohu-native-om-template', templateId: template.id,
    variables: {title: fields.title}, compositionGroupId: 'om-only', startSec: 0, endSec: 2,
    omCues: fields.omCues, omScore: fields.omScore, omMusic: fields.omMusic, sourceCueBindings: fields.sourceCueBindings,
  };
  const schedule = await compile(grainFilm({
    segments: [segment], compositionGroups: [{id: 'om-only', segmentIds: ['native-om']}], durationSec: 2,
  }));
  const source = schedule.rows[0].baseSource;
  assert.equal(source.renderer, 'laohu-native-om-template');
  assert.deepEqual(source.variables, {title: fields.title});
  assert.deepEqual(source.omCues, fields.omCues);
  assert.equal(source.omScore, fields.omScore);
  assert.deepEqual(source.omMusic, fields.omMusic);
  assert.deepEqual(source.sourceCueBindings, fields.sourceCueBindings);
  assert.equal(Object.hasOwn(source.variables, 'duration'), false, 'the Film adapter must not inject a duration into source controls');
  const legacy = await compile(grainFilm({
    segments: [{...segment, renderer: 'huashu-motion-template'}],
    compositionGroups: [{id: 'om-only', segmentIds: ['native-om']}], durationSec: 2,
  }));
  assert.equal(legacy.rows[0].baseSource.renderer, 'laohu-native-om-template');
  assert.equal(legacy.rows[0].baseSource.normalizedFromRenderer, 'huashu-motion-template');
  await assert.rejects(compile(grainFilm({
    segments: [{...segment, renderer: 'huashu-motion-template', templateId: 'huashu-y3-whiteboard'}],
    compositionGroups: [{id: 'om-only', segmentIds: ['native-om']}], durationSec: 2,
  })), /Film \/2 base composition/);
});

test('film /2 reuses the pinned source transition sequence only for explicit native boundary-frame cuts', async () => {
  const html = entry('motion-code-video-showcase-big-card');
  const transition = {id: 'laohu-motion-fade', method: 'crossfade', windowFrames: 10, parameters: {}, mode: 'boundary-frame', boundaryReason: '完整白板切换到 HTML 原生卡，按边界帧短交接。'};
  const segments = [
    {id: 'native-om', renderer: 'laohu-native-om-template', templateId: 'laohu-motion-whiteboard', variables: {},
      compositionGroupId: 'native-pair', startSec: 0, endSec: 1},
    {id: 'native-html', renderer: 'native-html-canvas-template', templateId: html.id,
      parameters: {layout: 1, index: 1, total: 2, color: '#ffcf5c', first: '本地', keyword: '切换', brand: '老胡'},
      compositionGroupId: 'native-pair', startSec: 1, endSec: 2, incomingTransition: transition},
  ];
  const film = grainFilm({segments, compositionGroups: [{id: 'native-pair', segmentIds: ['native-om', 'native-html']}], durationSec: 2});
  const schedule = await compile(film);
  assert.deepEqual(schedule.transitionPlan.map((row) => ({id: row.id, method: row.method, mode: row.mode, windowFrameRange: row.windowFrameRange})), [
    {id: 'laohu-motion-fade', method: 'crossfade', mode: 'boundary-frame', windowFrameRange: {startFrame: 25, endFrame: 35}},
  ]);
  assert.equal(schedule.rows[1].incomingHalfWindowFrames, 5);
  assert.equal(schedule.rows[0].outgoingHalfWindowFrames, 5);

  const handleTransition = {...transition, mode: 'handles'};
  delete handleTransition.boundaryReason;
  await assert.rejects(compile(grainFilm({
    segments: [segments[0], {...segments[1], incomingTransition: handleTransition}],
    compositionGroups: [{id: 'native-pair', segmentIds: ['native-om', 'native-html']}], durationSec: 2,
  })), /requires mode boundary-frame/);
  await assert.rejects(compile(grainFilm({
    segments,
    compositionGroups: [{id: 'native-pair', segmentIds: ['native-om', 'native-html']}], durationSec: 2,
    transitionEdges: [{id: 'flash', fromSegmentId: 'native-om', toSegmentId: 'native-html', sourceCatalogId: 'video-shotcraft-flash-cut', styleKey: 'flash-cut', phaseId: 'flash-phase'}],
  })), /cannot both own the same cut/);
  const localOnly = [grainSegment('grain-a', 0, 2), {...grainSegment('grain-b', 2, 4), incomingTransition: transition}];
  await assert.rejects(compile(grainFilm({segments: localOnly, durationSec: 4})), /requires at least one complete native OM or full-frame HTML source segment/);
});

test('Film /2 accepts only catalogued full-frame Moessif templates and keeps source clock controls', async () => {
  const card = entry('motion-code-video-showcase-big-card');
  const bigCardSegment = {
    id: 'full-frame-card', renderer: 'native-html-canvas-template', templateId: card.id,
    parameters: {brand: 'local probe', first: '输入', keyword: '结构'},
    compositionGroupId: 'showcase', startSec: 0, endSec: 1,
  };
  const bigCard = await compile(grainFilm({
    segments: [bigCardSegment], compositionGroups: [{id: 'showcase', segmentIds: ['full-frame-card']}], durationSec: 1,
  }));
  assert.equal(bigCard.rows[0].baseSource.renderer, 'native-html-canvas-template');
  assert.equal(bigCard.rows[0].localDurationSec, 1, 'the original big-card one-second clock is preserved');
  assert.deepEqual(bigCard.rows[0].baseSource.parameters, bigCardSegment.parameters);

  const segmentTemplate = entry('motion-code-video-showcase-segment');
  const segmentParameters = {title: 'source clock probe', brand: 'local', t0: 2.5, speed: 1.5, capsuleName: '分段'};
  const segment = await compile(grainFilm({
    segments: [{...bigCardSegment, id: 'showcase-segment', templateId: segmentTemplate.id, parameters: segmentParameters, endSec: 2}],
    compositionGroups: [{id: 'showcase', segmentIds: ['showcase-segment']}], durationSec: 2,
  }));
  assert.deepEqual(segment.rows[0].baseSource.parameters, segmentParameters);
  assert.equal(segment.rows[0].frameCount, 60);
  assert.equal(segment.rows[0].baseSource.templateSourcePath, segmentTemplate.sourcePath);
});

test('local Shotcraft show contracts match exported fields and validated consumer boundaries', async () => {
  const root = path.dirname(blueprintPath);
  const assetDir = fs.mkdtempSync(path.join(root, 'parameter-contract-'));
  fs.writeFileSync(path.join(assetDir, 'probe.mp4'), Buffer.from('technical asset placeholder'));
  const outsideAssetDir = fs.mkdtempSync(path.join(root, 'clipcard-outside-assets-'));
  fs.writeFileSync(path.join(outsideAssetDir, 'external.mp4'), Buffer.from('outside assets root'));
  fs.symlinkSync(path.join(outsideAssetDir, 'external.mp4'), path.join(assetDir, 'linked-outside.mp4'));
  const localEntries = catalog.templates.filter((row) => row.sourceId === 'video-shotcraft'
    && row.renderer === 'video-shotcraft-remotion' && ['available', 'conditional'].includes(row.availability));
  assert.equal(localEntries.length, 12, 'the current open local inventory is checked without adding source-only gallery entries');
  for (const row of localEntries) {
    const shown = showEntry(row.id);
    assert.deepEqual(shown.parameters, row.parameters, `${row.id} show output must expose the callable parameter contract`);
    const exported = exportedFieldsFor(row.id);
    const names = (shown.parameters?.supported || []).map((parameter) => parameter.name);
    assert.equal(new Set(names).size, names.length, `${row.id} must not duplicate supported field names`);
    for (const name of names) assert.ok(exported.has(name), `${row.id}.${name} is advertised but absent from EXPORTED_FIELDS`);
  }

  const paper = showEntry('video-shotcraft-paper-title-card');
  assert.ok(paper.parameters.supported.some((row) => row.name === 'theme'));
  assert.ok(paper.parameters.supported.some((row) => row.name === 'colors'));
  const paperResult = await Shotcraft.validateNode(paper, {theme:'modern-light', colors:{page:'#f7f4ed', accent:'#ffcc55'}}, {durationFrames:30, catalog, fidelityMode:'native-props'});
  assert.equal(paperResult.props.theme, 'modern-light');
  assert.deepEqual(paperResult.props.colors, {page:'#f7f4ed', accent:'#ffcc55'});

  const text = showEntry('video-shotcraft-text-reveal');
  assert.equal(text.parameters.supported.find((row) => row.name === 'text').maxLength, 300);
  assert.equal(text.parameters.supported.find((row) => row.name === 'each').max, 180);
  assert.equal(text.parameters.supported.find((row) => row.name === 'gap').max, 60);
  const longestText = await Shotcraft.validateNode(text, {text:'x'.repeat(300), each:1, gap:0}, {durationFrames:600, catalog});
  assert.equal(longestText.props.text.length, 300);
  await assert.rejects(Shotcraft.validateNode(text, {text:'x'.repeat(301), each:1, gap:0}, {durationFrames:600, catalog}), /text must be 1–300/);
  await Shotcraft.validateNode(text, {text:'x', each:180}, {durationFrames:600, catalog});
  await assert.rejects(Shotcraft.validateNode(text, {text:'x', each:181}, {durationFrames:600, catalog}), /each.*\[1, 180\]/);
  await Shotcraft.validateNode(text, {text:'xx', each:1, gap:60}, {durationFrames:600, catalog});
  await assert.rejects(Shotcraft.validateNode(text, {text:'xx', each:1, gap:60.1}, {durationFrames:600, catalog}), /gap.*\[0, 60\]/);

  const sheen = showEntry('video-shotcraft-sheen');
  const sheenParameters = new Map(sheen.parameters.supported.map((row) => [row.name, row]));
  assert.equal(sheenParameters.get('progress').type, 'number');
  assert.deepEqual(sheenParameters.get('progressTrack').keys, ['from', 'to', 'startFrame', 'endFrame', 'ease']);
  assert.equal(sheenParameters.get('color').type, 'hex-color');
  assert.equal(sheenParameters.get('angle').min, -90);
  assert.equal(sheenParameters.get('angle').max, 90);
  assert.equal(sheenParameters.get('width').min, 0.02);
  assert.equal(sheen.trueParameterization.supported.find((row) => row.name === 'angle').max, 180, 'source capability remains recorded separately');
  const localTrack = {from:0, to:1, startFrame:0, endFrame:30, ease:'linear'};
  const trackedSheen = await Shotcraft.validateNode(sheen, {progressTrack:localTrack, color:'#123456', angle:90, width:1}, {durationFrames:30, catalog});
  assert.deepEqual(trackedSheen.props.progressTrack, localTrack);
  await Shotcraft.validateNode(sheen, {progress:0, angle:-90, width:0.02}, {durationFrames:30, catalog});
  await assert.rejects(Shotcraft.validateNode(sheen, {progress:0.5, progressTrack:localTrack}, {durationFrames:30, catalog}), /exactly one/);
  await assert.rejects(Shotcraft.validateNode(sheen, {progressTrack:{...localTrack, startFrame:-1}}, {durationFrames:30, catalog}), /startFrame.*\[0, 29\]/);
  await assert.rejects(Shotcraft.validateNode(sheen, {progressTrack:{...localTrack, endFrame:31}}, {durationFrames:30, catalog}), /endFrame.*\[1, 30\]/);
  await assert.rejects(Shotcraft.validateNode(sheen, {progress:0.5, angle:90.1}, {durationFrames:30, catalog}), /angle.*\[-90, 90\]/);
  await assert.rejects(Shotcraft.validateNode(sheen, {progress:0.5, width:0.019}, {durationFrames:30, catalog}), /width.*\[0.02, 1\]/);
  await assert.rejects(Shotcraft.validateNode(sheen, {progress:0.5, color:'red'}, {durationFrames:30, catalog}), /color must be #RRGGBB/);

  const stage = showEntry('video-shotcraft-stage');
  assert.ok(stage.parameters.supported.some((row) => row.name === 'backgroundDecor'));
  assert.equal(stage.trueParameterization.supported.find((row) => row.name === 'childLayers').name, 'childLayers');
  const stageResult = await Shotcraft.validateNode(stage, {look:'paper', backgroundDecor:[{catalogId:'video-shotcraft-dust', props:{count:100, drift:10, opacity:1}}]}, {durationFrames:30, catalog});
  assert.equal(stageResult.props.backgroundDecor[0].catalogId, 'video-shotcraft-dust');
  await assert.rejects(Shotcraft.validateNode(stage, {look:'paper', childLayers:[]}, {durationFrames:30, catalog}), /childLayers is not consumed/);

  const speed = showEntry('video-shotcraft-speed-blur');
  const clip = showEntry('video-shotcraft-clip-card');
  const speedEntry = speed.parameters.supported.find((row) => row.name === 'content');
  assert.deepEqual(speedEntry.keys, ['catalogId', 'props']);
  assert.deepEqual(speedEntry.catalogIds, ['video-shotcraft-text-reveal', 'video-shotcraft-clip-card']);
  for (const name of ['vx','vy']) {
    assert.equal(speed.parameters.supported.find((row) => row.name === name).unit, 'px/frame');
    assert.equal(speed.trueParameterization.supported.find((row) => row.name === name).unit, 'px/frame');
  }
  assert.equal(speed.parameters.supported.find((row) => row.name === 'amount').max, 4);
  assert.equal(speed.parameters.supported.find((row) => row.name === 'max').max, 120);
  const textChild = {catalogId:text.id, props:{text:'x', each:1}};
  const speedResult = await Shotcraft.validateNode(speed, {vx:300, vy:-300, amount:4, max:120, content:textChild}, {durationFrames:30, catalog});
  assert.equal(speedResult.props.content.catalogId, entry('video-shotcraft-text-reveal').id, 'public production IDs resolve recursively to the canonical catalog identity in the consumer spec');
  const nestedAssets = [];
  const clipChild = {catalogId:clip.id, props:{src:'probe.mp4', assetLicense:'authorized', size:240, muted:true}};
  const nestedSpeedResult = await Shotcraft.validateNode(speed, {vx:24, vy:0, amount:0.45, max:36, content:clipChild}, {durationFrames:30, assetsRoot:assetDir, assetRecords:nestedAssets, catalog});
  assert.equal(nestedSpeedResult.props.content.catalogId, entry('video-shotcraft-clip-card').id, 'nested public IDs are normalized to their canonical catalog identity');
  assert.equal(nestedSpeedResult.props.content.props.durationInFrames, 30, 'the nested source ClipCard receives its enclosing render duration');
  assert.equal(nestedAssets.length, 1, 'nested ClipCard assets stay in the parent asset receipt');
  assert.equal(nestedAssets[0].role, 'clip-card-video');
  assert.equal(nestedAssets[0].path, 'probe.mp4');
  assert.equal(nestedAssets[0].license, 'authorized');
  await assert.rejects(Shotcraft.validateNode(speed, {vx:0, content:{catalogId:'video-shotcraft-stage', props:{look:'paper'}}}, {durationFrames:30, catalog}), /TextReveal or ClipCard child/);
  await assert.rejects(Shotcraft.validateNode(speed, {vx:0, content:{...clipChild, props:{...clipChild.props, src:'../probe.mp4'}}}, {durationFrames:30, assetsRoot:assetDir, catalog}), /relative asset path under --assets-root/);
  await assert.rejects(Shotcraft.validateNode(speed, {vx:0, content:{...clipChild, props:{...clipChild.props, assetLicense:'unverified'}}}, {durationFrames:30, assetsRoot:assetDir, catalog}), /assetLicense must be one of/);
  await assert.rejects(Shotcraft.validateNode(speed, {vx:0, amount:4.01, max:120, content:textChild}, {durationFrames:30, catalog}), /amount.*\[0, 4\]/);
  await assert.rejects(Shotcraft.validateNode(speed, {vx:0, amount:4, max:120.1, content:textChild}, {durationFrames:30, catalog}), /max.*\[0, 120\]/);
  await assert.rejects(Shotcraft.validateNode(speed, {vx:0, child:textChild}, {durationFrames:30, catalog}), /child is not consumed/);

  const grainEntry = showEntry('video-shotcraft-grain');
  assert.equal(grainEntry.parameters.supported.find((row) => row.name === 'opacity').max, 0.3);
  assert.equal(grainEntry.parameters.supported.find((row) => row.name === 'step').max, 30);
  assert.equal(grainEntry.parameters.supported.find((row) => row.name === 'freq').max, 2);
  await Shotcraft.validateNode(grainEntry, {opacity:0.3, step:30, freq:2, blend:'hard-light'}, {durationFrames:30, catalog});
  await assert.rejects(Shotcraft.validateNode(grainEntry, {opacity:0.301}, {durationFrames:30, catalog}), /opacity.*\[0, 0.3\]/);
  await assert.rejects(Shotcraft.validateNode(grainEntry, {step:31}, {durationFrames:30, catalog}), /step.*\[1, 30\]/);
  await assert.rejects(Shotcraft.validateNode(grainEntry, {freq:2.01}, {durationFrames:30, catalog}), /freq.*\[0.1, 2\]/);

  const backdrop = showEntry('video-shotcraft-backdrop');
  assert.equal(backdrop.parameters.supported.find((row) => row.name === 'accent').type, 'hex-color');
  await Shotcraft.validateNode(backdrop, {grain:0.3, drift:120}, {durationFrames:30, catalog});
  await assert.rejects(Shotcraft.validateNode(backdrop, {grain:0.301}, {durationFrames:30, catalog}), /grain.*\[0, 0.3\]/);
  await assert.rejects(Shotcraft.validateNode(backdrop, {drift:120.1}, {durationFrames:30, catalog}), /drift.*\[0, 120\]/);
  await assert.rejects(Shotcraft.validateNode(backdrop, {accent:'red'}, {durationFrames:30, catalog}), /accent must be #RRGGBB/);

  for (const [id, props] of [
    ['video-shotcraft-stage', {look: 'paper', style: {color: 'red'}}],
    ['video-shotcraft-speed-blur', {vx: 4, vy: 3, amount: 2, max: 40, style: {color: 'red'}, content: {catalogId: 'video-shotcraft-text-reveal', props: {text: 'probe'}}}],
    ['video-shotcraft-grain', {style: {opacity: 0.2}}],
    ['video-shotcraft-backdrop', {style: {background: 'red'}}],
    ['video-shotcraft-clip-card', {src: 'probe.mp4', assetLicense: 'authorized', muted: true, style: {borderRadius: 1}}],
  ]) {
    await assert.rejects(Shotcraft.validateNode(showEntry(id), props, {durationFrames: 30, assetsRoot: assetDir, catalog}), /style|not consumed/);
    assert.equal(showEntry(id).parameters.supported.some((row) => row.name === 'style'), false, `${id} local contract must not advertise style`);
  }
  assert.equal(clip.parameters.supported.find((row) => row.name === 'size').min, 96);
  assert.equal(clip.parameters.supported.find((row) => row.name === 'size').max, 1200);
  assert.equal(clip.parameters.supported.find((row) => row.name === 'radius').max, 80);
  assert.equal(clip.parameters.supported.find((row) => row.name === 'captionSize').min, 17);
  assert.equal(clip.parameters.supported.find((row) => row.name === 'captionSize').max, 64);
  assert.equal(clip.parameters.supported.find((row) => row.name === 'muted').fixedValue, true);
  assert.deepEqual(clip.parameters.supported.find((row) => row.name === 'assetLicense').values, ['user-owned', 'licensed', 'public-domain', 'authorized']);
  assert.equal(clip.parameters.supported.find((row) => row.name === 'loopCrossfadeInFrames').min, 1);
  assert.equal(clip.trueParameterization.supported.find((row) => row.name === 'size').max, 1800, 'original pinned source capability remains intact');
  assert.equal(clip.trueParameterization.supported.find((row) => row.name === 'style').type, 'safe-css-object');
  await assert.rejects(Shotcraft.validateNode(clip, {src: 'probe.mp4', assetLicense: 'authorized', size: 95}, {durationFrames: 30, assetsRoot: assetDir, catalog}), /size.*\[96, 1200\]/);
  await assert.rejects(Shotcraft.validateNode(speed, {vx:24, content:{catalogId:clip.id, props:{src:'linked-outside.mp4', assetLicense:'authorized'}}}, {durationFrames:30, assetsRoot:assetDir, catalog}), /symlink escapes --assets-root/);
  await assert.rejects(Shotcraft.validateNode(clip, {src: 'probe.mp4', assetLicense: 'authorized', size: 1201}, {durationFrames: 30, assetsRoot: assetDir, catalog}), /size.*\[96, 1200\]/);
  await assert.rejects(Shotcraft.validateNode(clip, {src: 'probe.mp4', assetLicense: 'authorized', muted: false}, {durationFrames: 30, assetsRoot: assetDir, catalog}), /fixed to true/);
  await assert.rejects(Shotcraft.validateNode(clip, {src: 'probe.mp4', assetLicense: 'authorized', loopCrossfadeInFrames:0}, {durationFrames: 30, assetsRoot: assetDir, catalog}), /loopCrossfadeInFrames.*\[1, Infinity\]/);
  await assert.rejects(Shotcraft.validateNode(clip, {src: 'probe.mp4', assetLicense: 'authorized', loopDurationInFrames:20, loopCrossfadeInFrames:11}, {durationFrames: 30, assetsRoot: assetDir, catalog}), /more than two overlapping layers/);
  await assert.rejects(Shotcraft.validateNode(clip, {src: 'probe.mp4', assetLicense: 'authorized', loopCrossfadeInFrames:1}, {durationFrames: 30, assetsRoot: assetDir, catalog}), /requires explicit loopDurationInFrames/);
  const accepted = await Shotcraft.validateNode(clip, {src: 'probe.mp4', assetLicense: 'authorized', muted: true, size: 1200, radius: 80, captionSize: 64, loopDurationInFrames:20, loopCrossfadeInFrames:10}, {durationFrames:30, assetsRoot:assetDir, catalog});
  assert.equal(accepted.props.size, 1200);
  assert.equal(accepted.props.radius, 80);
  assert.equal(accepted.props.captionSize, 64);
  assert.equal(accepted.props.loopCrossfadeInFrames, 10);

  const page = showEntry('video-shotcraft-list-stack-five');
  assert.deepEqual(page.parameters.supported.find((row) => row.name === 'pageImageLicense').values, ['user-owned', 'licensed', 'public-domain', 'authorized']);
  await assert.rejects(Shotcraft.validateNode(page, {pageImage:'page.png', pageImageLicense:'other'}, {durationFrames:88, catalog, fidelityMode:'source-adapted-local'}), /pageImageLicense must be/);
  await assert.rejects(Shotcraft.validateNode(page, {pageImage:'page.png', pageImageLicense:'authorized', pageHeight:1080, contentUse:'already-introduced-materials'}, {durationFrames:88, catalog, fidelityMode:'source-adapted-local'}), /requires --assets-root/);

  const flashCut = showEntry('video-shotcraft-flash-cut');
  assert.equal(flashCut.parameters.supported.find((row) => row.name === 'duration').min, 10);
  assert.equal(flashCut.parameters.supported.find((row) => row.name === 'duration').max, 10);
  assert.equal(flashCut.trueParameterization.supported.find((row) => row.name === 'duration').max, 60, 'the original source prop range remains separate');
  await Shotcraft.validateNode(flashCut, {duration:10}, {durationFrames:30, catalog});
  await assert.rejects(Shotcraft.validateNode(flashCut, {duration:9}, {durationFrames:30, catalog}), /duration.*\[10, 10\]/);
  await assert.rejects(Shotcraft.validateNode(flashCut, {duration:11}, {durationFrames:30, catalog}), /duration.*\[10, 10\]/);
});

test('SpeedBlur renders its verified ClipCard child through the local adapter, with optional pinned-source pixel parity', async (t) => {
  const browser = requireShotcraftBrowser();
  const ffmpeg = requireShotcraftFfmpeg();
  const ffprobe = path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), 'ffprobe') : 'ffprobe';
  const runRoot = path.join(templateRenderRoot, `speedblur-clip-card-${process.pid}-${Date.now()}`);
  const outputRoot = path.join(runRoot, 'outputs');
  const assetsRoot = path.join(runRoot, 'assets');
  const cacheRoot = path.join(runRoot, 'render-cache');
  const sourceVideo = path.join(assetsRoot, 'clip-fixture.mp4');
  await fs.promises.mkdir(outputRoot, {recursive:true});
  await fs.promises.mkdir(assetsRoot, {recursive:true});
  await fs.promises.mkdir(path.join(runRoot, 'tmp'), {recursive:true});
  await fs.promises.mkdir(cacheRoot, {recursive:true});
  const envKeys = ['TMPDIR','TMP','TEMP','XDG_CACHE_HOME','npm_config_cache','REMOTION_CACHE_DIR'];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const envValues = [path.join(runRoot,'tmp'),path.join(runRoot,'tmp'),path.join(runRoot,'tmp'),cacheRoot,path.join(cacheRoot,'npm'),path.join(cacheRoot,'remotion')];
  envKeys.forEach((key,index) => process.env[key] = envValues[index]);

  try {
  run(ffmpeg, [
    '-nostdin','-v','error','-f','lavfi','-i','color=c=0x162236:size=420x420:rate=30:duration=2',
    '-vf',"drawbox=x='mod(t*120,300)':y=120:w=80:h=160:color=0xffc400:t=fill",
    '-an','-c:v','libx264','-preset','ultrafast','-crf','16','-pix_fmt','yuv420p','-r','30','-movflags','+faststart','-y',sourceVideo,
  ], {timeout:120_000});
  const probe = JSON.parse(run(ffprobe, ['-v','error','-count_frames','-show_streams','-show_format','-of','json',sourceVideo]));
  const videoStream = probe.streams.find((row) => row.codec_type === 'video');
  assert.equal(videoStream.avg_frame_rate, '30/1');
  assert.equal(Number(videoStream.nb_read_frames ?? videoStream.nb_frames), 60);

  const placement = {x:320, y:200, width:560, height:520, clip:true, alignX:'left', alignY:'top'};
    const speed = entry('video-shotcraft-speed-blur');
    const clip = entry('video-shotcraft-clip-card');
    const results = [];
    const rendered = {};
    for (const vx of [0, 24]) {
      const adaptedPath = path.join(outputRoot, `adapter-vx-${vx}.png`);
      const inputPath = path.join(runRoot, `adapter-vx-${vx}.json`);
      const preparedPath = path.join(runRoot, `prepared-vx-${vx}.json`);
      const manifestPath = path.join(outputRoot, `adapter-vx-${vx}.manifest.json`);
      const spec = {
        templateId:speed.id, width:1920, height:1080, fps:30, durationInFrames:60, fidelityMode:'native-props',
        layers:[{catalogId:speed.id, props:{vx,vy:0,amount:0.45,max:36,content:{catalogId:clip.id,props:{src:'clip-fixture.mp4',assetLicense:'authorized',caption:'source media',size:420,radius:12,muted:true,captionSize:20,startFrom:0}}}, placement}],
      };
      await fs.promises.writeFile(inputPath, JSON.stringify(spec, null, 2) + '\n', {flag:'wx'});
      await prepareShotcraftInput({catalog,entry:speed,inputPath,outputPath:preparedPath,assetsRoot});
      const preparedSpec = JSON.parse(await fs.promises.readFile(preparedPath,'utf8'));
      assert.deepEqual(Object.keys(preparedSpec.layers[0]).sort(), ['catalogId','placement','props'], 'prepare writes only the user layer schema and does not inject internal fidelityMode');
      assert.equal(preparedSpec.fidelityMode, 'native-props');
      await renderShotcraftTemplate({catalog,entry:speed,specPath:preparedPath,outputPath:adaptedPath,outputKind:'still',timeSec:0.5,assetsRoot,cacheDir:path.join(runRoot,`adapter-cache-vx-${vx}`),manifestPath,browser,ffmpeg});
      const manifest = JSON.parse(await fs.promises.readFile(manifestPath,'utf8'));
      assert.equal(manifest.propsConsumed[0].catalogId, speed.id);
      assert.equal(manifest.propsConsumed[0].props.content.catalogId, clip.id);
      assert.equal(manifest.assets.length, 1);
      assert.equal(manifest.assets[0].assetLicense, 'authorized');
      assert.equal(manifest.assets[0].sourceFrameCount, 60);
      assert.equal(manifest.assets[0].declaredFps, 30);
      assert.equal(manifest.assets[0].audioStreamIgnored, true);

      const adaptedPixels = rgbaFrame(adaptedPath, ffmpeg);
      const crop = {x:placement.x, y:placement.y, width:420, height:472};
      const adaptedWarmPixels = warmMediaPixelCount(adaptedPixels, crop);
      assert.ok(adaptedWarmPixels > 1000, `adapter ClipCard media is visible at vx=${vx}; observed ${adaptedWarmPixels} warm pixels`);
      rendered[vx] = {adaptedPath, adaptedPixels, adaptedWarmPixels};
    }
    const adapterVxDifference = changedPixelCount(rendered[0].adaptedPixels, rendered[24].adaptedPixels);
    assert.ok(adapterVxDifference > 1000, `the adapter SpeedBlur vx changes rendered pixels; observed ${adapterVxDifference}`);

    const sourcePaths = [...new Set([...(speed.closure || []), ...(clip.closure || [])])];
    await t.test('pinned source pixels match the local adapter under identical inputs', {skip:sourceSkipReason('video-shotcraft', sourcePaths)}, async () => {
      for (const relativePath of sourcePaths) readPinnedSource('video-shotcraft', relativePath);
      const sourcePublic = path.join(runRoot, 'source-public');
      await fs.promises.mkdir(sourcePublic, {recursive:true});
      await fs.promises.copyFile(sourceVideo, path.join(sourcePublic, 'clip-fixture.mp4'));
      const sourceModule = (relative) => {
        const result = path.relative(runRoot, path.join(sourceRoot, 'video-shotcraft', relative)).split(path.sep).join('/');
        return result.startsWith('.') ? result : `./${result}`;
      };
      const polishModule = sourceModule('demos/_fixtures/Polish.tsx');
      const clipModule = sourceModule('assets/lib/ClipCard.tsx');
      const sourceEntry = path.join(runRoot, 'source-baseline.entry.tsx');
      const sourceEntryText = `import React from 'react';
import {AbsoluteFill, Composition, registerRoot} from 'remotion';
import {SpeedBlur} from ${JSON.stringify(polishModule)};
import {ClipCard} from ${JSON.stringify(clipModule)};

const SourceBaseline: React.FC<{vx: number}> = ({vx}) => <AbsoluteFill style={{overflow:'hidden'}}>
  <div style={{position:'absolute',left:${placement.x},top:${placement.y},width:${placement.width},height:${placement.height},boxSizing:'border-box',overflow:'hidden',display:'flex',justifyContent:'flex-start',alignItems:'flex-start'}}>
    <AbsoluteFill>
      <SpeedBlur vx={vx} vy={0} amount={0.45} max={36}>
        <ClipCard src="clip-fixture.mp4" caption="source media" size={420} radius={12} muted startFrom={0} durationInFrames={60} captionSize={20}/>
      </SpeedBlur>
    </AbsoluteFill>
  </div>
</AbsoluteFill>;

const Root: React.FC = () => <Composition id="SourceSpeedBlurClipCard" component={SourceBaseline} width={1920} height={1080} fps={30} durationInFrames={60} defaultProps={{vx:0}}/>;
registerRoot(Root);
`;
      await fs.promises.writeFile(sourceEntry, sourceEntryText, {flag:'wx'});
      const runtime = resolveMotionRuntime({packages:['@remotion/bundler','@remotion/renderer'], expectedVersions:{'@remotion/bundler':'4.0.537','@remotion/renderer':'4.0.537'}});
      const {bundle} = runtime.require('@remotion/bundler');
      const {renderStill, selectComposition} = runtime.require('@remotion/renderer');
      const serveUrl = await bundle({
        entryPoint:sourceEntry, outDir:path.join(runRoot,'source-bundle'), publicDir:sourcePublic,
        rootDir:repoRoot, enableCaching:false,
        webpackOverride:(config) => {
          config.resolve ||= {};
          config.resolve.modules = [...(config.resolve.modules || []), runtime.nodeModules];
          config.resolve.alias = {...(config.resolve.alias || {}), react:runtime.require.resolve('react'), 'react-dom':runtime.require.resolve('react-dom')};
          return config;
        },
      });
      for (const vx of [0, 24]) {
        const sourcePath = path.join(outputRoot, `source-vx-${vx}.png`);
        const sourceComposition = await selectComposition({serveUrl, id:'SourceSpeedBlurClipCard', inputProps:{vx}, browserExecutable:browser, logLevel:'error'});
        await renderStill({serveUrl, composition:sourceComposition, inputProps:{vx}, frame:15, output:sourcePath, imageFormat:'png', browserExecutable:browser, logLevel:'error', overwrite:false});
        const sourcePixels = rgbaFrame(sourcePath, ffmpeg);
        const sourceWarmPixels = warmMediaPixelCount(sourcePixels, {x:placement.x, y:placement.y, width:420, height:472});
        assert.ok(sourceWarmPixels > 1000, `source ClipCard media is visible at vx=${vx}; observed ${sourceWarmPixels} warm pixels`);
        const sourceAdapterDifference = changedPixelCount(sourcePixels, rendered[vx].adaptedPixels);
        assert.equal(sourceAdapterDifference, 0, `same-condition source and adapter frame must match pixel-for-pixel at vx=${vx}`);
        results.push({vx, frame:15, sourcePngSha256:createHash('sha256').update(await fs.promises.readFile(sourcePath)).digest('hex'), adaptedPngSha256:createHash('sha256').update(await fs.promises.readFile(rendered[vx].adaptedPath)).digest('hex'), sourceAdapterChangedPixels:sourceAdapterDifference, visibleWarmPixels:{source:sourceWarmPixels,adapter:rendered[vx].adaptedWarmPixels}});
        rendered[vx].sourcePixels = sourcePixels;
      }
      const sourceVxDifference = changedPixelCount(rendered[0].sourcePixels, rendered[24].sourcePixels);
      assert.ok(sourceVxDifference > 1000, `the actual source SpeedBlur vx changes rendered pixels; observed ${sourceVxDifference}`);
    });

    const text = entry('video-shotcraft-text-reveal');
    const textInputPath = path.join(runRoot,'text-reveal-input.json');
    const textPreparedPath = path.join(runRoot,'text-reveal-prepared.json');
    const textOutputPath = path.join(outputRoot,'text-reveal-regression.png');
    const textManifestPath = path.join(outputRoot,'text-reveal-regression.manifest.json');
    const textSpec = {
      templateId:text.id,width:1920,height:1080,fps:30,durationInFrames:60,fidelityMode:'native-props',
      layers:[{catalogId:text.id,props:{text:'Source renderer',by:'word',start:0,each:12,gap:4,variant:'rise',ease:'snappy',style:{fontFamily:'sans',fontSize:84,fontWeight:700,color:'#ffffff',lineHeight:1,maxWidth:560}},placement:{x:320,y:200,width:560,height:180,clip:true,alignX:'left',alignY:'center'}}],
    };
    await fs.promises.writeFile(textInputPath,JSON.stringify(textSpec,null,2)+'\n',{flag:'wx'});
    await prepareShotcraftInput({catalog,entry:text,inputPath:textInputPath,outputPath:textPreparedPath,assetsRoot});
    const preparedText = JSON.parse(await fs.promises.readFile(textPreparedPath,'utf8'));
    assert.deepEqual(Object.keys(preparedText.layers[0]).sort(), ['catalogId','placement','props']);
    const textResult = await renderShotcraftTemplate({catalog,entry:text,specPath:textPreparedPath,outputPath:textOutputPath,outputKind:'still',timeSec:0.9,assetsRoot,cacheDir:path.join(runRoot,'text-reveal-cache'),manifestPath:textManifestPath,browser,ffmpeg});
    assert.equal(textResult.frameCount,60);
    const textManifest = JSON.parse(await fs.promises.readFile(textManifestPath,'utf8'));
    assert.equal(textManifest.propsConsumed[0].catalogId,text.id);
    const textPixels = rgbaFrame(textOutputPath,ffmpeg);
    const visibleTextPixels = brightPixelCount(textPixels,{x:320,y:200,width:560,height:180});
    assert.ok(visibleTextPixels > 500, `the existing TextReveal still draws readable glyph pixels after prepare→preview; observed ${visibleTextPixels}`);

    const evidence = {
      kind:'local-adapter-speedblur-clipcard-render-with-optional-source-comparison',
      source:{rootEnv:'MOTION_SOURCE_ROOT', speedBlur:'video-shotcraft/demos/_fixtures/Polish.tsx',clipCard:'video-shotcraft/assets/lib/ClipCard.tsx',runtime:'Remotion 4.0.537',comparisonStatus:sourceSkipReason('video-shotcraft', [...(entry('video-shotcraft-speed-blur').closure || []), ...(entry('video-shotcraft-clip-card').closure || [])]) ? 'skipped-no-source-root' : 'compared'},
      condition:{width:1920,height:1080,fps:30,durationInFrames:60,renderedFrame:15,placement,clip:{size:420,radius:12,caption:'source media',captionSize:20,startFrom:0,assetLicense:'authorized'},speedBlur:{vy:0,amount:0.45,max:36,vxValues:[0,24],units:'px/frame'}},
      inputVideo:{path:'assets/clip-fixture.mp4',sha256:createHash('sha256').update(await fs.promises.readFile(sourceVideo)).digest('hex'),fps:30,frameCount:60,generator:'FFmpeg lavfi dark slate with moving amber source-media bar'},
      comparisons:results,
      vxInfluence:{adapterChangedPixels:adapterVxDifference},
      regressions:{textReveal:{output:textOutputPath,manifest:textManifestPath,visibleBrightGlyphPixels:visibleTextPixels,prepareThenPreview:true}},
      note:'Synthetic technical fixture verifies source child rendering, local asset consumption, and source SpeedBlur vx effect; it is not an authored video sample or audience-quality evidence.',
    };
    const evidencePath = path.join(outputRoot,'comparison.json');
    await fs.promises.writeFile(evidencePath, JSON.stringify(evidence,null,2)+'\n', {flag:'wx'});
    assert.ok(evidencePath.startsWith(templateRenderRoot + path.sep));
  } finally {
    for (const key of envKeys) previous[key] == null ? delete process.env[key] : process.env[key] = previous[key];
  }
});

test('shared runtime resolver respects explicit modules, project dependencies, project cache, and exact package identity/version', () => {
  const root = fs.mkdtempSync(path.join(path.dirname(blueprintPath), 'runtime-resolution-'));
  const writePackage = (nodeModules, packageName, actualName = packageName, version = '1.55.0') => {
    const packageRoot = path.join(nodeModules, ...packageName.split('/'));
    fs.mkdirSync(packageRoot, {recursive: true});
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({name: actualName, version}));
  };
  try {
    const project = path.join(root, 'project');
    const explicit = path.join(root, 'explicit-deps');
    fs.mkdirSync(project, {recursive: true});
    writePackage(path.join(explicit, 'node_modules'), 'playwright');
    writePackage(path.join(project, 'node_modules'), 'playwright', 'playwright', '1.54.0');
    const explicitlyConfigured = resolveMotionRuntime({
      packages: ['playwright'], expectedVersions: {playwright: '1.55.0'}, projectRoot: project,
      env: {MOTION_RUNTIME_NODE_MODULES: path.join(explicit, 'node_modules'), NODE_PATH: ''},
    });
    assert.equal(explicitlyConfigured.resolutionSource, 'MOTION_RUNTIME_NODE_MODULES');
    assert.equal(explicitlyConfigured.nodeModulesPath, 'explicit-node-module-path');
    assert.equal(explicitlyConfigured.packages[0].version, '1.55.0');

    const projectRuntime = resolveMotionRuntime({
      packages: ['playwright'], expectedVersions: {playwright: '1.54.0'}, projectRoot: project, env: {},
    });
    assert.equal(projectRuntime.resolutionSource, 'work-project-node_modules');
    assert.equal(projectRuntime.nodeModulesPath, 'node_modules');

    const cachedProject = path.join(root, 'cache-project');
    const cachedNodeModules = path.join(managedMotionRuntimeRoot({workRoot:cachedProject}), 'node_modules');
    writePackage(cachedNodeModules, 'playwright', 'playwright', '1.55.0');
    const cachedRuntime = resolveMotionRuntime({
      packages: ['playwright'], expectedVersions: {playwright: '1.55.0'}, projectRoot: cachedProject, env: {},
    });
    assert.equal(cachedRuntime.resolutionSource, 'project-runtime-cache');
    assert.equal(cachedRuntime.nodeModulesPath, path.relative(cachedProject, cachedNodeModules));

    const impostor = path.join(root, 'impostor-deps', 'node_modules');
    writePackage(impostor, 'playwright', 'not-playwright', '1.55.0');
    assert.throws(() => resolveMotionRuntime({
      packages: ['playwright'], expectedVersions: {playwright: '1.55.0'}, projectRoot: path.join(root, 'empty'),
      env: {MOTION_RUNTIME_NODE_MODULES: impostor, NODE_PATH: ''},
    }), /package identity mismatch/);
    assert.throws(() => resolveMotionRuntime({
      packages: ['playwright'], expectedVersions: {playwright: '1.55.0'}, projectRoot: project,
      env: {NODE_PATH: ''},
    }), /version mismatch/);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('film /2 can preserve a local Motion scene as the base and overlay a specifically placed Shotcraft component on the same frames', async () => {
  const dir = fs.mkdtempSync(path.join(path.dirname(blueprintPath), 'mixed-film-'));
  const scene = {format: 'motion-scene-v1', version: 1, width: 1920, height: 1080, fps: 30, duration: 2, timeBasis: 'scene-local', background: '#101820', phases: [], objects: []};
  const sceneBytes = Buffer.from(JSON.stringify(scene));
  fs.writeFileSync(path.join(dir, 'scene.json'), sceneBytes);
  const textEntry = entry('video-shotcraft-text-reveal');
  const segment = {
    id: 'local-scene', renderer: 'motion-scene', compositionGroupId: 'mixed-group',
    scenePath: 'scene.json', sceneSha256: createHash('sha256').update(sceneBytes).digest('hex'),
    startSec: 0, endSec: 2,
    layers: [
      {id: 'lead', catalogId: textEntry.id, props: {text: '解释信息', by: 'char', start: 8}, placement: {x: 120, y: 180, width: 640, height: 180, clip: true, alignX: 'left', alignY: 'center'}},
      {id: 'detail', catalogId: textEntry.id, props: {text: '预测 差距 误差', by: 'word', start: 20, gap: 4}, placement: {x: 900, y: 520, width: 700, height: 140, clip: true, alignX: 'left', alignY: 'center'}},
    ],
    actionBindings: [{id: 'label-action', landmarkId: 'unit-reveal', componentCatalogId: textEntry.id, componentInstanceId: 'detail', index: 1, unitText: '差距', semanticCueId: 'label-meaning'}],
  };
  const blueprint = {
    format: 'laohu.huashu-film-blueprint/2', width: 1920, height: 1080, fps: 30,
    clock: {kind: 'film-global', durationSec: 2}, segments: [segment],
    compositionGroups: [{id: 'mixed-group', segmentIds: ['local-scene']}], transitionEdges: [],
  };
  const schedule = await Shotcraft.compileFilmV2(blueprint, path.join(dir, 'blueprint.json'), catalog);
  assert.equal(schedule.rows[0].segment.renderer, 'motion-scene');
  assert.equal(schedule.rows[0].baseSource.sceneSha256, segment.sceneSha256);
  assert.equal(schedule.rows[0].layers[0].catalogId, textEntry.id);
  assert.equal(schedule.rows[0].layers[0].id, 'lead');
  assert.equal(schedule.rows[0].layers[1].id, 'detail');
  assert.deepEqual(schedule.rows[0].layers.map((row) => row.placement.x), [120, 900]);
  assert.equal(schedule.rows[0].actionBindings[0].componentCatalogId, textEntry.id);
  assert.equal(schedule.rows[0].actionBindings[0].componentInstanceId, 'detail');
  assert.equal(schedule.rows[0].actionBindings[0].sourceActionFrame, 24);
  assert.equal(schedule.rows[0].actionBindings[0].actionText, '差距');
});

test('film /2 rejects FlashCut as an ordinary local overlay layer', async () => {
  const dir = fs.mkdtempSync(path.join(path.dirname(blueprintPath), 'transition-layer-'));
  const scene = {format: 'motion-scene-v1', version: 1, width: 1920, height: 1080, fps: 30, duration: 2, timeBasis: 'scene-local', background: '#101820', phases: [], objects: []};
  const bytes = Buffer.from(JSON.stringify(scene));
  fs.writeFileSync(path.join(dir, 'scene.json'), bytes);
  const blueprint = {
    format: 'laohu.huashu-film-blueprint/2', width: 1920, height: 1080, fps: 30,
    clock: {kind: 'film-global', durationSec: 2},
    segments: [{id: 'local-scene', renderer: 'motion-scene', compositionGroupId: 'mixed-group', scenePath: 'scene.json', sceneSha256: createHash('sha256').update(bytes).digest('hex'), startSec: 0, endSec: 2,
      layers: [{catalogId: 'video-shotcraft-flash-cut', props: {duration: 10}}]}],
    compositionGroups: [{id: 'mixed-group', segmentIds: ['local-scene']}], transitionEdges: [],
  };
  await assert.rejects(Shotcraft.compileFilmV2(blueprint, path.join(dir, 'blueprint.json'), catalog), /can only overlay validated local-effect.*transitions must use transitionEdges/);
});

test('film /2 rejects silent source trims, duration changes, derived patches and composition decomposition', async () => {
  const base = [grainSegment('grain-a', 0, 2), grainSegment('grain-b', 2, 4)];
  await assert.rejects(compile(grainFilm({segments: [{...base[0], sourceFrameAtSegmentStart: 1}, base[1]]})), /currently supports only 0/);
  await assert.rejects(compile(grainFilm({segments: [{...base[0], endSec: 1.9}, base[1]]})), /source adaptation must retain its fixed 60-frame/);
  await assert.rejects(compile(grainFilm({segments: [{...base[0], fidelityMode: 'derived-patch'}, base[1]]})), /does not support fidelityMode/);
  await assert.rejects(compile(grainFilm({segments: [{...base[0], sourceDurationFrames: 59}, base[1]]})), /fixed 60-frame source and segment duration/);
  await assert.rejects(compile(grainFilm({
    segments: [
      {...base[0], layers: [{catalogId: grain.id, props: {}}, {catalogId: 'video-shotcraft-backdrop', props: {}}]},
      base[1],
    ],
  })), /cannot be decomposed or overlaid/);
});

test('film /2 rejects gaps and a compositionGroup that does not match the segment partition', async () => {
  const segments = [grainSegment('grain-a', 0, 2), grainSegment('grain-b', 2, 4)];
  await assert.rejects(compile(grainFilm({segments: [{...segments[0], startSec: 0.01}, segments[1]]})), /previous absolute-ceil frame boundary/);
  await assert.rejects(compile(grainFilm({segments, compositionGroups: [{id: 'other', segmentIds: ['grain-a', 'grain-b']}]})), /must match its one containing compositionGroup/);
});

test('FlashCut keeps the source 10-frame cover-cut timing at cut−5 with peak at cut−1', async () => {
  const segments = [grainSegment('grain-a', 0, 2), grainSegment('grain-b', 2, 4)];
  const schedule = await compile(grainFilm({
    segments,
    transitionEdges: [{id: 'cut', fromSegmentId: 'grain-a', toSegmentId: 'grain-b', sourceCatalogId: 'video-shotcraft-flash-cut', styleKey: 'flash-cut', phaseId: 'flash-phase'}],
  }));
  assert.deepEqual(schedule.transitionEdges[0], {
    id: 'cut', fromSegmentId: 'grain-a', toSegmentId: 'grain-b', fromFrame: 60, toFrame: 60,
    sourceCatalogId: 'video-shotcraft-flash-cut', styleKey: 'flash-cut', phaseId: 'flash-phase',
    eventId: null, eventScenePath: null, eventSceneSha256: null,
    startFrame: 55, durationInFrames: 10, peakFrame: 59, transitionMechanism: 'cover-cut-overlay',
  });
});

test('source action bindings use actual validated text and reject changed or out-of-range landmarks', async () => {
  const paper = entry('video-shotcraft-paper-title-card');
  const words = paper.baselineProps.componentProps.words;
  const segment = {
    id: 'paper', renderer: 'video-shotcraft-remotion', sourceCatalogId: paper.id,
    componentPath: paper.component.path, componentSha256: paper.component.sha256,
    exportName: paper.component.exportName, sourceCommit: '1266a3ec4831289c4d893d42dd5102723658039a',
    sourceDurationFrames: 55, fidelityMode: 'exact-baseline',
    props: {duration: 55, theme: 'ink-press', ...paper.baselineProps.componentProps},
    compositionGroupId: 'paper', startSec: 0, endSec: 55 / 30,
    actionBindings: [{id: 'word-one', landmarkId: 'word-reveal', index: 4, wordText: 'one', semanticCueId: 'one-cue'}],
  };
  const blueprint = {
    format: 'laohu.huashu-film-blueprint/2', width: 1920, height: 1080, fps: 30,
    clock: {kind: 'film-global', durationSec: 55 / 30}, segments: [segment],
    compositionGroups: [{id: 'paper', segmentIds: ['paper']}], transitionEdges: [],
  };
  assert.equal(words[4].text, 'one');
  const schedule = await compile(blueprint);
  assert.equal(schedule.rows[0].actionBindings[0].sourceActionFrame, 20);
  assert.equal(schedule.rows[0].actionBindings[0].actionText, 'one');
  await assert.rejects(compile({...blueprint, segments: [{...segment, actionBindings: [{...segment.actionBindings[0], wordText: 'two'}]}]}), /must exactly match the pinned\/rendered PaperTitleCard word/);
  await assert.rejects(compile({...blueprint, segments: [{...segment, actionBindings: [{...segment.actionBindings[0], index: 8, wordText: 'not-present'}]}]}), /index must resolve to the actual validated source word list/);
});

test('semantic ASR binding may name a different screen explanation; literal binding still requires the same word and exact occurrence timing', async () => {
  const dir = fs.mkdtempSync(path.join(path.dirname(blueprintPath), 'semantic-binding-'));
  const asrPlan = importAsrJson({segments: [{
    start: 0, end: 2, text: '差距', words: [{text: '差距', start: 0.4, end: 0.6}],
  }]}, {
    projectId: 'semantic-binding', sourceId: 'source-a', sampleRateHz: 48000,
    sourceSampleRateHz: 48000, sourceDurationSamples: 96000, timeUnit: 'seconds',
  });
  asrPlan.format = 'laohu.asrcut.edit-plan/2';
  asrPlan.authorization.presentationTiming = true;
  asrPlan.sequence = asrPlan.sequence.map((row) => ({kind: 'source', ...row}));
  asrPlan.integrity.planSha256 = hashPlan(asrPlan);
  const frozenPlan = freezePlan(asrPlan);
  const timeline = compilePlan(frozenPlan);
  const timelineBytes = Buffer.from(JSON.stringify(timeline));
  const planBytes = Buffer.from(JSON.stringify(frozenPlan));
  fs.writeFileSync(path.join(dir, 'timeline.json'), timelineBytes);
  fs.writeFileSync(path.join(dir, 'plan.json'), planBytes);
  const sourceUnit = timeline.units.find((row) => row.kind === 'source');
  const token = sourceUnit.words.find((row) => row.text === '差距');
  assert.ok(sourceUnit?.occurrenceId && token?.tokenId);

  const textEntry = entry('video-shotcraft-text-reveal');
  const segment = {
    id: 'explainer', renderer: 'video-shotcraft-remotion', sourceCatalogId: textEntry.id,
    componentPath: textEntry.component.path, componentSha256: textEntry.component.sha256,
    exportName: textEntry.component.exportName, sourceCommit: '1266a3ec4831289c4d893d42dd5102723658039a',
    sourceDurationFrames: 60, fidelityMode: 'native-props', compositionGroupId: 'explainer',
    unitIds: timeline.units.map((row) => row.occurrenceId || row.id),
    layers: [{catalogId: textEntry.id, props: {text: '预测误差 原因', by: 'word', start: 8, gap: 4}, placement: {x: 120, y: 180, width: 640, height: 200, clip: true, alignX: 'left', alignY: 'center'}}],
    actionBindings: [{
      id: 'semantic-action', landmarkId: 'unit-reveal', index: 1, unitText: '原因',
      semanticCueId: 'prediction-error', timelineAnchor: {kind: 'point', clipOccurrenceId: sourceUnit.occurrenceId, tokenId: token.tokenId, edge: 'start'},
    }],
  };
  const blueprint = {
    format: 'laohu.huashu-film-blueprint/2', width: 1920, height: 1080, fps: 30,
    clock: {
      kind: 'asrcut-v2', timelinePath: 'timeline.json',
      timelineSha256: createHash('sha256').update(timelineBytes).digest('hex'),
      editPlanPath: 'plan.json', editPlanSha256: createHash('sha256').update(planBytes).digest('hex'),
    },
    segments: [segment], compositionGroups: [{id: 'explainer', segmentIds: ['explainer']}], transitionEdges: [],
  };
  const file = path.join(dir, 'blueprint.json');
  const compileLocal = (value) => Shotcraft.compileFilmV2(value, file, catalog);
  const semantic = await compileLocal(blueprint);
  assert.equal(semantic.rows[0].actionBindings[0].actionText, '原因');
  assert.equal(semantic.rows[0].actionBindings[0].timelineAnchor.tokenId, token.tokenId);
  assert.equal(semantic.rows[0].actionBindings[0].timelineAnchor.targetSample, token.targetRange.startSample);
  assert.equal(semantic.rows[0].actionBindings[0].sourceActionFrame, 12);
  assert.equal(semantic.rows[0].actionBindings[0].textRelation, 'semantic');

  const authoredEntry = entry('laohu-authored-shot');
  const authoredSegment = {
    ...segment,
    id: 'caption-shot',
    compositionGroupId: 'caption-shot',
    sourceCatalogId: authoredEntry.id,
    componentPath: authoredEntry.component.path,
    componentSha256: authoredEntry.component.sha256,
    exportName: authoredEntry.component.exportName,
    sourceCommit: catalog.sources.find((source) => source.id === authoredEntry.sourceId).commit,
    sourceDurationFrames: undefined,
    layers: [{catalogId: authoredEntry.id, id: 'caption-title', props: {shotId: 'caption-type', parameters: {title: '差距', caption: '合成技术验证，不代表用户原音'}}}],
    actionBindings: [{
      id: 'caption-title-anchor', landmarkId: 'caption-title-reveal', componentCatalogId: authoredEntry.id,
      componentInstanceId: 'caption-title', semanticCueId: 'retained-term', textRelation: 'literal',
      timelineAnchor: {kind: 'point', clipOccurrenceId: sourceUnit.occurrenceId, tokenId: token.tokenId, edge: 'start'},
    }],
  };
  delete authoredSegment.sourceDurationFrames;
  const authoredBlueprint = {...blueprint, segments: [authoredSegment], compositionGroups: [{id: 'caption-shot', segmentIds: ['caption-shot']} ]};
  const authored = await compileLocal(authoredBlueprint);
  assert.equal(authored.rows[0].actionBindings[0].sourceActionFrame, 12);
  assert.equal(authored.rows[0].actionBindings[0].sourceFrameWithinComponent, 12);
  assert.equal(authored.rows[0].actionBindings[0].timelineAnchor.deltaFrames, 0);
  assert.equal(authored.rows[0].layers[0].props.parameters.titleAtFrame, 12,
    'frozen ASR point is written into the actual component prop consumed by CaptionTypeShot TrackIn');

  const authoredMismatch = structuredClone(authoredBlueprint);
  authoredMismatch.segments[0].layers[0].props.parameters.title = '其他词';
  await assert.rejects(compileLocal(authoredMismatch), /literal text relation requires the retained ASR token to match/);
  const authoredConflict = structuredClone(authoredBlueprint);
  authoredConflict.segments[0].layers[0].props.parameters.titleAtFrame = 18;
  await assert.rejects(compileLocal(authoredConflict), /ASR-derived titleAtFrame conflicts/);
  const literal = structuredClone(blueprint);
  literal.segments[0].actionBindings[0].textRelation = 'literal';
  await assert.rejects(compileLocal(literal), /literal text relation requires the retained ASR token to match/);
  const wrongOccurrence = structuredClone(blueprint);
  wrongOccurrence.segments[0].actionBindings[0].timelineAnchor.tokenId = 'missing-token';
  await assert.rejects(compileLocal(wrongOccurrence), /does not resolve to one retained token/);
  const wrongTime = structuredClone(blueprint);
  wrongTime.segments[0].actionBindings[0].timelineAnchor.edge = 'end';
  await assert.rejects(compileLocal(wrongTime), /outside tolerance/);
});

test('native component validators pass consumed styles, enforce placement, and reject unknown nested code-like fields', async () => {
  const textEntry = entry('video-shotcraft-text-reveal');
  const textProps = {text: 'Hello world', by: 'word', start: 2, each: 12, gap: 4, style: {fontFamily: 'serif', fontSize: 84, color: '#ffffff', maxWidth: 500}};
  const validatedText = await Shotcraft.validateNode(textEntry, textProps, {durationFrames: 60, catalog, fidelityMode: 'native-props'});
  assert.equal(validatedText.props.style.fontSize, 84);
  assert.equal(validatedText.props.style.color, '#ffffff');
  const localSpec = await Shotcraft.validateShotcraftSpec(catalog, textEntry, {
    templateId: textEntry.id, width: 1920, height: 1080, fps: 30, durationInFrames: 60, fidelityMode: 'native-props',
    layers: [{catalogId: textEntry.id, props: textProps, placement: {x: 120, y: 180, width: 640, height: 200, clip: true, alignX: 'left', alignY: 'center'}}],
  });
  assert.deepEqual(localSpec.layers[0].placement, {x: 120, y: 180, width: 640, height: 200, clip: true, alignX: 'left', alignY: 'center'});
  assert.throws(() => Shotcraft.validatePlacement({x: 10, y: 10, width: 0, height: 100}, 'placement', {required: true}), /width must be/);
  await assert.rejects(Shotcraft.validateNode(textEntry, {...textProps, arbitraryHtml: '<script>'}, {durationFrames: 60, catalog}), /not consumed/);

  const speedEntry = entry('video-shotcraft-speed-blur');
  await assert.rejects(Shotcraft.validateNode(speedEntry, {
    vx: 20, content: {catalogId: textEntry.id, props: {text: 'motion'}, arbitraryComponent: true},
  }, {durationFrames: 60, catalog}), /content\.arbitraryComponent is not consumed/);
});

test('Shotcraft spec rejects root controls outside PaperTitleCard and preserves its two exclusive input paths', async () => {
  const textEntry = entry('video-shotcraft-text-reveal');
  const base = {
    templateId: textEntry.id, width: 1920, height: 1080, fps: 30, durationInFrames: 60,
    fidelityMode: 'native-props',
    layers: [{catalogId: textEntry.id, props: {text: 'visible layer', by: 'word', start: 2}, placement: {x: 20, y: 20, width: 600, height: 120}}],
  };
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, textEntry, {
    ...base, componentProps: {text: 'THIS IS IGNORED'}, theme: 'rose-noir', colors: {text: '#ff0000'},
  }), /does not consume root-level componentProps, theme, colors/);
  for (const field of ['componentProps', 'theme', 'colors']) {
    await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, textEntry, {
      ...base,
      [field]: field === 'componentProps' ? {text: 'THIS IS IGNORED'} : field === 'theme' ? 'rose-noir' : {text: '#ff0000'},
    }), new RegExp(`does not consume root-level ${field}`));
  }

  const paper = entry('video-shotcraft-paper-title-card');
  const paperProps = {duration: 55, words: [{text: 'Useful'}, {text: 'research'}]};
  const colors = {text: '#222222', accent: '#ff3300'};
  const direct = await Shotcraft.validateShotcraftSpec(catalog, paper, {
    templateId: paper.id, width: 1920, height: 1080, fps: 30, durationInFrames: 55,
    fidelityMode: 'native-props', componentProps: paperProps, theme: 'rose-noir', colors,
  });
  assert.deepEqual(direct.layers[0].props.componentProps, paperProps);
  assert.deepEqual(direct.layers[0].props.colors, colors);

  const layered = await Shotcraft.validateShotcraftSpec(catalog, paper, {
    templateId: paper.id, width: 1920, height: 1080, fps: 30, durationInFrames: 55,
    fidelityMode: 'native-props',
    layers: [{catalogId: paper.id, props: {componentProps: paperProps, theme: 'rose-noir', colors}}],
  });
  assert.deepEqual(layered.layers[0].props.componentProps, paperProps);
  assert.deepEqual(layered.layers[0].props.colors, colors);
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, paper, {
    templateId: paper.id, width: 1920, height: 1080, fps: 30, durationInFrames: 55,
    fidelityMode: 'native-props', componentProps: paperProps,
    layers: [{catalogId: paper.id, props: {componentProps: paperProps}}],
  }), /either root-level componentProps\/theme\/colors or one source layer with nested props, not both/);
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, paper, {
    templateId: paper.id, width: 1920, height: 1080, fps: 30, durationInFrames: 55,
    fidelityMode: 'native-props', layers: [{catalogId: paper.id, props: {componentProps: paperProps, ignored: true}}],
  }), /ignored is not consumed/);
});

test('placement is consumed only by supported local components and full-scene bounds stay native', async () => {
  const rect = {x: 200, y: 150, width: 600, height: 300};
  for (const id of ['video-shotcraft-grain', 'video-shotcraft-backdrop']) {
    const component = entry(id);
    const props = id === 'video-shotcraft-grain'
      ? {opacity: 0.1, blend: 'normal'}
      : {tone: 'light', grain: 0, vignette: 0};
    const prepared = await Shotcraft.validateShotcraftSpec(catalog, component, {
      templateId: id, width: 1920, height: 1080, fps: 30, durationInFrames: 60, fidelityMode: 'native-props',
      layers: [{catalogId: id, props, placement: rect}],
    });
    assert.deepEqual(prepared.layers[0].placement, rect, `${id} preserves the material bounds it will draw into`);
    await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, component, {
      templateId: id, width: 1920, height: 1080, fps: 30, durationInFrames: 60, fidelityMode: 'native-props',
      layers: [{catalogId: id, props, placement: {...rect, alignX: 'center'}}],
    }), /alignX is not consumed/);
  }

  const stage = entry('video-shotcraft-stage');
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, stage, {
    templateId: stage.id, width: 1920, height: 1080, fps: 30, durationInFrames: 60, fidelityMode: 'native-props',
    layers: [{catalogId: stage.id, props: {look: 'midnight'}, placement: rect}],
  }), /does not support local placement/);

  const dir = fs.mkdtempSync(path.join(path.dirname(blueprintPath), 'native-placement-'));
  const scene = {format: 'motion-scene-v1', version: 1, width: 1920, height: 1080, fps: 30, duration: 2, timeBasis: 'scene-local', background: '#101820', phases: [], objects: []};
  const sceneBytes = Buffer.from(JSON.stringify(scene));
  fs.writeFileSync(path.join(dir, 'scene.json'), sceneBytes);
  const stageBlueprint = {
    format: 'laohu.huashu-film-blueprint/2', width: 1920, height: 1080, fps: 30,
    clock: {kind: 'film-global', durationSec: 2},
    segments: [{id: 'base', renderer: 'motion-scene', compositionGroupId: 'native', scenePath: 'scene.json', sceneSha256: createHash('sha256').update(sceneBytes).digest('hex'), startSec: 0, endSec: 2,
      layers: [{catalogId: stage.id, props: {look: 'midnight'}, placement: rect}]}],
    compositionGroups: [{id: 'native', segmentIds: ['base']}], transitionEdges: [],
  };
  await assert.rejects(Shotcraft.compileFilmV2(stageBlueprint, path.join(dir, 'blueprint.json'), catalog), /does not support local placement/);

  for (const id of ['video-shotcraft-paper-title-card', 'video-shotcraft-paper-title-card-gallery', 'video-shotcraft-grain-dissolve']) {
    const source = entry(id);
    const duration = source.sourceDurationFrames ?? source.baselineProps?.duration ?? source.baselineProps?.durationInFrames;
    const props = id === 'video-shotcraft-paper-title-card'
      ? {duration, theme: source.baselineProps.theme, ...source.baselineProps.componentProps}
      : id === 'video-shotcraft-grain-dissolve' ? {brandName: 'Luna'} : {};
    const seconds = duration / 30;
    const sourceSegment = {
      id, renderer: 'video-shotcraft-remotion', sourceCatalogId: id,
      componentPath: source.component.path, componentSha256: source.component.sha256,
      exportName: source.component.exportName, sourceCommit: '1266a3ec4831289c4d893d42dd5102723658039a',
      sourceDurationFrames: duration, fidelityMode: source.component.kind === 'source-adapted-full-scene' ? 'source-adapted-local' : 'exact-baseline', compositionGroupId: 'source',
      startSec: 0, endSec: seconds, layers: [{catalogId: id, props, placement: rect}],
    };
    await assert.rejects(compile(grainFilm({
      segments: [sourceSegment], compositionGroups: [{id: 'source', segmentIds: [id]}], durationSec: seconds,
    })), /does not support local placement/);
  }
});

test('GrainDissolve requires caller brandName and rejects missing or overlong contract values', async () => {
  const dissolve = showEntry('video-shotcraft-grain-dissolve');
  const brand = dissolve.parameters.supported.find((row) => row.name === 'brandName');
  assert.equal(brand?.required, true);
  assert.equal(brand?.type, 'single-line string');
  assert.equal(dissolve.component.kind, 'source-adapted-full-scene');
  assert.deepEqual(dissolve.fidelityModes, ['source-adapted-local']);
  const valid = await Shotcraft.validateNode(dissolve, {brandName: 'Luna'}, {durationFrames: 60, catalog, fidelityMode: 'source-adapted-local'});
  assert.deepEqual(valid.props, {brandName: 'Luna'});
  await assert.rejects(Shotcraft.validateNode(dissolve, {}, {durationFrames: 60, catalog, fidelityMode: 'source-adapted-local'}), /requires brandName/);
  await assert.rejects(Shotcraft.validateNode(dissolve, {brandName: 'x'.repeat(81)}, {durationFrames: 60, catalog, fidelityMode: 'source-adapted-local'}), /at most 80 characters/);
});

test('GrainDissolve renders caller text and rejects actual text overflow in the browser', async (t) => {
  const browser = [process.env.MOTION_BROWSER, process.env.MOTION_CHROME, process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    .filter(Boolean).find((candidate) => fs.existsSync(candidate));
  if (!browser) { t.skip('requires the caller’s existing Chrome/Chromium; this test does not install a browser'); return; }
  const dissolve = entry('video-shotcraft-grain-dissolve');
  const runRoot = path.join(templateRenderRoot, `grain-dissolve-content-${process.pid}-${Date.now()}`);
  const tmpRoot = path.join(runRoot, 'tmp');
  await fs.promises.mkdir(tmpRoot, {recursive:true});
  t.after(() => fs.promises.rm(runRoot, {recursive:true, force:true}));
  const envKeys = ['TMPDIR','TMP','TEMP','XDG_CACHE_HOME','npm_config_cache','REMOTION_CACHE_DIR'];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries({TMPDIR:tmpRoot,TMP:tmpRoot,TEMP:tmpRoot,XDG_CACHE_HOME:path.join(runRoot,'cache'),npm_config_cache:path.join(runRoot,'cache','npm'),REMOTION_CACHE_DIR:path.join(runRoot,'cache','remotion')})) process.env[key] = value;
  const renderOne = async (brandName, label) => {
    const inputPath = path.join(runRoot, `${label}.json`);
    const specPath = path.join(runRoot, `${label}.prepared.json`);
    const outputPath = path.join(runRoot, `${label}.png`);
    const manifestPath = path.join(runRoot, `${label}.manifest.json`);
    await fs.promises.writeFile(inputPath, JSON.stringify({templateId:dissolve.id,width:1920,height:1080,fps:30,durationInFrames:60,fidelityMode:'source-adapted-local',layers:[{catalogId:dissolve.id,props:{brandName}}]}, null, 2) + '\n');
    await prepareShotcraftInput({catalog,entry:dissolve,inputPath,outputPath:specPath,assetsRoot:runRoot});
    const result = await renderShotcraftTemplate({catalog,entry:dissolve,specPath,outputPath,outputKind:'still',timeSec:1.5,assetsRoot:runRoot,cacheDir:path.join(runRoot,`${label}-render-cache`),manifestPath,browser});
    assert.equal(result.frameCount, 60);
    return {outputPath, manifestPath};
  };
  try {
    const normal = await renderOne('Luna', 'normal-name');
    const normalBytes = await fs.promises.readFile(normal.outputPath);
    assert.equal(normalBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const normalManifest = JSON.parse(await fs.promises.readFile(normal.manifestPath, 'utf8'));
    assert.equal(normalManifest.fidelityMode, 'source-adapted-local');
    assert.deepEqual(normalManifest.propsConsumed[0].props, {brandName:'Luna'});
    await assert.rejects(renderOne('W'.repeat(40), 'too-wide-name'), /brandName is too wide for the original GrainDissolve text frame/);
  } finally {
    for (const key of envKeys) {
      if (previous[key] == null) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});

test('PaperTitleCard honors source per-word accents and exact-baseline rejects any changed content', async () => {
  const paper = entry('video-shotcraft-paper-title-card');
  const native = await Shotcraft.validateNode(paper, {
    duration: 55,
    words: [{text: 'Learn', accent: true}, {text: 'deeply', accent: true}],
  }, {durationFrames: 55, catalog, fidelityMode: 'native-props'});
  assert.equal(native.props.componentProps.words.filter((word) => word.accent).length, 2);
  await assert.rejects(Shotcraft.validateNode(paper, {
    duration: 55, words: [{text: 'Learn'}, {text: 'deeply'}],
  }, {durationFrames: 55, catalog, fidelityMode: 'exact-baseline'}), /byte-for-byte/);
  await assert.rejects(Shotcraft.validateNode(paper, {
    duration: 55, ...paper.baselineProps.componentProps, colors: {accent: '#ff00ff'},
  }, {durationFrames: 55, catalog, fidelityMode: 'exact-baseline'}), /does not accept a colors override/);
});

test('gallery PaperTitleCard derived-copy patch is locally pinned, narrowly consumed, time-safe, and optionally source-compared', async (t) => {
  const gallery = entry('video-shotcraft-paper-title-card-gallery');
  const patch = {id: 'paper-title-card-copy', words: [{text: 'Learn'}, {text: 'clearly', accent: true}], sub: 'A model learns from examples', subDigits: '12'};
  const provider = await Shotcraft.verifyDerivedPatchProvider(catalog, gallery);
  const derived = fs.readFileSync(path.join(repoRoot, '.agents/skills/laohu-motion', gallery.derivedProvider.entrypoint), 'utf8');
  assert.equal(provider.sourceSha256, gallery.component.sha256);
  assert.equal(provider.sha256, gallery.derivedProvider.sha256);
  await t.test('pinned source bytes reproduce the exact text-only derived transformation', {skip:sourceSkipReason('video-shotcraft', gallery.closure || [gallery.component.path])}, async () => {
    for (const relativePath of gallery.closure || [gallery.component.path]) readPinnedSource('video-shotcraft', relativePath);
    const source = readPinnedSource('video-shotcraft', gallery.component.path).toString('utf8');
    assert.equal(createHash('sha256').update(source).digest('hex'), gallery.component.sha256);
    assert.equal(derived, Shotcraft.transformGalleryCopySource(source));
  });

  const single = await Shotcraft.validateShotcraftSpec(catalog, gallery, {
    templateId: gallery.id, width: 1920, height: 1080, fps: 30, durationInFrames: 55, fidelityMode: 'derived-patch',
    layers: [{catalogId: gallery.id, props: {}, derivedPatch: patch}],
  });
  assert.equal(single.layers[0].props.derivedPatch.words[1].text, 'clearly');
  assert.equal(single.layers[0].props.derivedPatch.parentComponentSha256, gallery.component.sha256);
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, gallery, {
    templateId: gallery.id, durationInFrames: 55, fidelityMode: 'derived-patch',
    layers: [{catalogId: gallery.id, props: {}, derivedPatch: {...patch, extraCode: 'return null'}}],
  }), /extraCode is not consumed/);
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, gallery, {
    templateId: gallery.id, durationInFrames: 55, fidelityMode: 'derived-patch',
    layers: [{catalogId: gallery.id, props: {}, derivedPatch: {...patch, words: Array.from({length: 10}, (_, i) => ({text: `W${i}`}))}}],
  }), /contain 1–9 words/);
  const wrongParent = structuredClone(gallery);
  wrongParent.derivedProvider.parentComponentSha256 = '0'.repeat(64);
  await assert.rejects(Shotcraft.verifyDerivedPatchProvider(catalog, wrongParent), /parent lock differs/);

  const segment = {
    id: 'gallery-derived', renderer: 'video-shotcraft-remotion', sourceCatalogId: gallery.id,
    componentPath: gallery.component.path, componentSha256: gallery.component.sha256, exportName: gallery.component.exportName,
    sourceCommit: '1266a3ec4831289c4d893d42dd5102723658039a', sourceDurationFrames: 55, fidelityMode: 'derived-patch',
    compositionGroupId: 'gallery', startSec: 0, endSec: 55 / 30,
    layers: [{catalogId: gallery.id, props: {}, derivedPatch: patch}],
    actionBindings: [{id: 'derived-word', landmarkId: 'word-reveal', index: 1, wordText: 'clearly', semanticCueId: 'learn-clearly'}],
  };
  const blueprint = {
    format: 'laohu.huashu-film-blueprint/2', width: 1920, height: 1080, fps: 30,
    clock: {kind: 'film-global', durationSec: 55 / 30}, segments: [segment],
    compositionGroups: [{id: 'gallery', segmentIds: ['gallery-derived']}], transitionEdges: [],
  };
  const schedule = await Shotcraft.compileFilmV2(blueprint, path.join(path.dirname(blueprintPath), 'gallery-derived-blueprint.json'), catalog);
  assert.equal(schedule.rows[0].layers[0].props.derivedPatch.words[1].text, 'clearly');
  assert.equal(schedule.rows[0].actionBindings[0].sourceActionFrame, 8);
  assert.equal(schedule.rows[0].actionBindings[0].actionText, 'clearly');
  await assert.rejects(Shotcraft.compileFilmV2({...blueprint, segments: [{...segment, actionBindings: [{...segment.actionBindings[0], wordText: 'Learn'}]}]}, path.join(path.dirname(blueprintPath), 'gallery-derived-blueprint.json'), catalog), /must exactly match the pinned\/rendered PaperTitleCard word/);
  await assert.rejects(Shotcraft.compileFilmV2({...blueprint, segments: [{...segment, endSec: 54 / 30}]}, path.join(path.dirname(blueprintPath), 'gallery-derived-blueprint.json'), catalog), /complete 55-frame source duration/);
});

test('Stage preserves its under-vignette child slot and rejects foreground/arbitrary children', async () => {
  const stage = entry('video-shotcraft-stage');
  const accepted = await Shotcraft.validateNode(stage, {
    look: 'midnight', backgroundDecor: [{catalogId: 'video-shotcraft-dust', props: {count: 8, seed: 2}}],
  }, {durationFrames: 60, catalog});
  assert.equal(accepted.props.backgroundDecor[0].catalogId, 'video-shotcraft-dust');
  await assert.rejects(Shotcraft.validateNode(stage, {
    look: 'midnight', backgroundDecor: [{catalogId: 'video-shotcraft-text-reveal', props: {text: 'foreground'}}],
  }, {durationFrames: 60, catalog}), /stay under its vignette\/grain/);
  await assert.rejects(Shotcraft.validateNode(stage, {
    look: 'midnight', backgroundDecor: [{catalogId: 'video-shotcraft-dust', props: {}, rawReact: 'code'}],
  }, {durationFrames: 60, catalog}), /not consumed/);
});

test('canonical film event projection reuses one source scene, keeps global events unremapped, and maps local events once', async () => {
  const segments = [grainSegment('grain-a', 0, 2), grainSegment('grain-b', 2, 4)];
  const schedule = await compile(grainFilm({segments, transitionEdges: [{id: 'cut', fromSegmentId: 'grain-a', toSegmentId: 'grain-b', sourceCatalogId: 'video-shotcraft-flash-cut', styleKey: 'flash-cut', phaseId: 'flash-phase', eventId: 'flash-event'}]}));
  const value = {
    format: 'motion-scene-v1', version: 1, width: 1920, height: 1080, fps: 30, duration: 4, timeBasis: 'film-global',
    phases: [
      {id: 'flash-phase', startSec: 55 / 30, durationSec: 10 / 30, timeBasis: 'film-global'},
      {id: 'local-phase', startSec: 0.5, durationSec: 0.5, timeBasis: 'scene-local', segmentId: 'grain-a'},
    ],
    audioEvents: [
      {id: 'flash-event', phaseId: 'flash-phase', phaseOffsetSec: 0.03, timeBasis: 'film-global', source: {segmentId: 'grain-a'}},
      {id: 'local-event', phaseId: 'local-phase', phaseOffsetSec: 0.1, timeBasis: 'scene-local', source: {segmentId: 'grain-a'}},
    ],
  };
  const projection = Shotcraft.validateCompositionScene({path: 'canonical.scene.json', sha256: 'a'.repeat(64), value}, schedule);
  assert.equal(projection.bindings.length, 2);
  assert.equal(new Set(projection.bindings.map((row) => row.eventId)).size, 2);
  assert.equal(projection.sourceScenes.length, 1);
  assert.equal(projection.bindings.find((row) => row.eventId === 'flash-event').timeMapId, null);
  assert.equal(projection.bindings.find((row) => row.eventId === 'local-event').timeMapId, 'time:grain-a');
  assert.throws(() => Shotcraft.validateCompositionScene({path: 'dup.scene.json', sha256: 'b'.repeat(64), value: {
    ...value, audioEvents: [...value.audioEvents, {...value.audioEvents[0]}],
  }}, schedule), /Duplicate shared audio event ID/);
});

test('Film /2 renders work-local Remotion shots with exact module/dependency/asset proof and frame clocks', async () => {
  const validationRoot = path.join(repoRoot, '.cache/validation/motion-workflow-upgrade');
  fs.mkdirSync(validationRoot, {recursive:true});
  const fixtureRoot = fs.mkdtempSync(path.join(validationRoot, 'project-shot-e2e-'));
  const modulePath = path.join(fixtureRoot, 'shots', 'project-shots.tsx');
  const palettePath = path.join(fixtureRoot, 'shared', 'palette.ts');
  const markerPath = path.join(fixtureRoot, 'assets', 'marker.svg');
  fs.mkdirSync(path.dirname(modulePath), {recursive:true});
  fs.mkdirSync(path.dirname(palettePath), {recursive:true});
  fs.mkdirSync(path.dirname(markerPath), {recursive:true});
  const moduleSource = `import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import * as MotionModules from '@laohu/motion';
import {pickAccent} from '../shared/palette';

type CardProps = {title:string; fontFamily:string; background:string; accent:string};
type MapNode = {id:string; label:string; x:number; y:number};
type MapProps = {heading:string; background:string; accent:string; nodes:MapNode[]; assetPath:string};

export const CenteredCard: React.FC<CardProps> = ({title,fontFamily,background,accent}) => {
  const frame=useCurrentFrame();
  const color=pickAccent(accent);
  return <AbsoluteFill style={{backgroundColor:background,overflow:'hidden'}}>
    <div style={{position:'absolute',left:250,top:220,width:1420,height:620,borderRadius:28,background:'#f7f4ec',boxShadow:'0 24px 70px #0007'}} />
    <div style={{position:'absolute',left:250,top:220,width:20,height:620,background:color}} />
    <div style={{position:'absolute',left:360,top:330,fontFamily,fontSize:82,fontWeight:700}}>
      <MotionModules.Typography.TrackIn text={title} family={fontFamily} size={82} weight={700} at={0} dur={20} from={0.2} to={0} color="#17232c" />
    </div>
    <div style={{position:'absolute',right:290,bottom:270,fontFamily:'Arial, sans-serif',fontSize:22,color:'#58636a'}}>FRAME {frame}</div>
  </AbsoluteFill>;
};

export const RelationshipMap: React.FC<MapProps> = ({heading,background,accent,nodes,assetPath}) => {
  const frame=useCurrentFrame();
  const color=pickAccent(accent);
  return <AbsoluteFill style={{backgroundColor:background,overflow:'hidden'}}>
    <div style={{position:'absolute',left:140,top:100,fontFamily:'Arial, sans-serif',fontSize:52,fontWeight:700,color:'#17232c'}}>{heading}</div>
    <Img src={staticFile(assetPath)} style={{position:'absolute',left:150,top:400,width:180,height:180}} />
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{position:'absolute',inset:0}}>
      <path d={nodes.slice(1).map((node,index)=>\`M \${nodes[index].x} \${nodes[index].y} L \${node.x} \${node.y}\`).join(' ')} fill="none" stroke={color} strokeWidth="8" opacity={Math.min(1,frame/12)} />
      {nodes.map((node,index)=><g key={node.id}>
        <circle cx={node.x} cy={node.y} r={42} fill={index===1?'#d8e6e2':'#fff'} stroke={color} strokeWidth={5} />
        <text x={node.x} y={node.y+84} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="34" fill="#17232c">{node.label}</text>
      </g>)}
    </svg>
  </AbsoluteFill>;
};
`;
  const paletteSource = `export const pickAccent=(value?:string)=>value || '#d68a24';\n`;
  const markerSource = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><path d="M90 8 110 62 168 66 123 103 137 161 90 130 43 161 57 103 12 66 70 62Z" fill="#f2b544"/><circle cx="90" cy="90" r="24" fill="#17232c"/></svg>\n`;
  fs.writeFileSync(modulePath, moduleSource);
  fs.writeFileSync(palettePath, paletteSource);
  fs.writeFileSync(markerPath, markerSource);
  const sha256 = (value) => createHash('sha256').update(value).digest('hex');
  const moduleSha256 = sha256(moduleSource);
  const dependency = {path:'shared/palette.ts',sha256:sha256(paletteSource)};
  const marker = {path:'assets/marker.svg',sha256:sha256(markerSource)};
  const projectSegment = (id,startSec,endSec,exportName,props,assets=[],layers=[]) => ({
    id,renderer:'laohu-project-shot',compositionGroupId:'authored-project-shots',startSec,endSec,
    modulePath:'shots/project-shots.tsx',moduleSha256,exportName,props,dependencies:[dependency],assets,
    ...(layers.length?{layers}:{}),
  });
  const coveringOverlay = {
    id:'covering-backdrop',catalogId:'video-shotcraft-backdrop',
    props:{tone:'dark',grain:0,vignette:0},placement:{x:500,y:200,width:920,height:700},
  };
  const segments = [
    projectSegment('centered-arial',0,1,'CenteredCard',{title:'One connected idea',fontFamily:'Arial, sans-serif',background:'#17232c',accent:'#d68a24'}),
    projectSegment('centered-georgia',1,2,'CenteredCard',{title:'One connected idea',fontFamily:'Georgia, serif',background:'#17232c',accent:'#d68a24'}),
    projectSegment('relationship-map',2,3,'RelationshipMap',{heading:'A different content structure',background:'#f3efe5',accent:'#2d7472',assetPath:'assets/marker.svg',nodes:[{id:'source',label:'Source',x:520,y:570},{id:'change',label:'Change',x:960,y:390},{id:'result',label:'Result',x:1390,y:570}]},[marker],[coveringOverlay]),
  ];
  const blueprint = {
    format:'laohu.huashu-film-blueprint/2',width:1920,height:1080,fps:30,
    clock:{kind:'film-global',durationSec:3},segments,
    compositionGroups:[{id:'authored-project-shots',segmentIds:segments.map((row)=>row.id)}],transitionEdges:[],
  };
  const blueprintPath = path.join(fixtureRoot, 'film-blueprint.json');
  const blueprintBytes = Buffer.from(JSON.stringify(blueprint,null,2)+'\n');
  fs.writeFileSync(blueprintPath,blueprintBytes);
  const runtime = resolveMotionRuntime({packages:['@babel/parser'],projectRoot:repoRoot,skillRoot:skillDir,workRoot:repoRoot});
  const runtimeContext = {runtimeRoot:runtime.runtimeRoot,nodeModules:runtime.nodeModules,workRoot:repoRoot};
  const preparedDescriptor = await prepareProjectShotDescriptor({
    modulePath:'shots/project-shots.tsx',exportName:'RelationshipMap',props:segments[2].props,assets:['assets/marker.svg'],blueprintPath,runtimeNodeModules:runtime.nodeModules,skillRoot:skillDir,
  });
  assert.equal(preparedDescriptor.moduleSha256,moduleSha256);
  assert.deepEqual(preparedDescriptor.dependencies,[dependency]);
  assert.deepEqual(preparedDescriptor.assets,[marker]);

  const compiled = await Shotcraft.compileFilmV2(blueprint,blueprintPath,catalog,runtimeContext);
  assert.deepEqual(compiled.rows.map((row)=>row.frameCount),[30,30,30]);
  assert.deepEqual(compiled.rows.map((row)=>[row.frameRange.startFrame,row.frameRange.endFrame]),[[0,30],[30,60],[60,90]]);
  assert.deepEqual(compiled.rows.map((row)=>row.baseSource.projectShot.module.exportName),['CenteredCard','CenteredCard','RelationshipMap']);
  assert.deepEqual(compiled.rows[0].baseSource.projectShot.dependencies.map((row)=>row.path),['shared/palette.ts']);

  const originalModule = fs.readFileSync(modulePath);
  const originalPalette = fs.readFileSync(palettePath);
  try {
    fs.writeFileSync(modulePath, Buffer.concat([originalModule,Buffer.from('\n// changed after the source lock\n')]));
    await assert.rejects(Shotcraft.compileFilmV2(blueprint,blueprintPath,catalog,runtimeContext),/moduleSha256 is stale/);
    fs.writeFileSync(modulePath,originalModule);
    fs.writeFileSync(palettePath,Buffer.concat([originalPalette,Buffer.from("export const localRevision='changed';\n")]));
    await assert.rejects(Shotcraft.compileFilmV2(blueprint,blueprintPath,catalog,runtimeContext),/dependencies\.shared\/palette\.ts SHA-256 is stale/);
  } finally {
    fs.writeFileSync(modulePath,originalModule);
    fs.writeFileSync(palettePath,originalPalette);
  }

  const browser = requireShotcraftBrowser();
  const ffmpeg = requireShotcraftFfmpeg();
  const outputPath = path.join(fixtureRoot,'film.mp4');
  const manifestPath = path.join(fixtureRoot,'film.manifest.json');
  const rendered = await renderFilm({blueprintPath,outputPath,workRoot:repoRoot,manifestPath,browser,ffmpeg});
  assert.equal(rendered.frameCount,90);
  assert.equal(rendered.segments,3);
  const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert.equal(manifest.frameClock.kind,'film-global');
  assert.equal(manifest.frameClock.totalFrameCount,90);
  assert.equal(manifest.render.frameCount,90);
  assert.equal(manifest.render.probe.audioStreams,0);
  assert.equal(manifest.runtime.workRoot.includes(repoRoot),false,'Film receipt keeps cache locations relative instead of embedding a user-specific path');
  for (const [index,segment] of manifest.segments.entries()) {
    assert.equal(segment.renderer,'laohu-project-shot');
    assert.deepEqual([segment.frameRange.startFrame,segment.frameRange.endFrame],[[0,30],[30,60],[60,90]][index]);
    assert.equal(segment.expectedFrameCount,30);
    assert.equal(segment.baseSource.projectShot.module.path,'shots/project-shots.tsx');
    assert.equal(segment.baseSource.projectShot.module.sha256,moduleSha256);
    assert.equal(segment.baseSource.projectShot.module.exportName,segments[index].exportName);
    assert.deepEqual(segment.baseSource.projectShot.props,segments[index].props);
    assert.equal(segment.baseSource.projectShot.propsSha256.length,64);
    assert.equal(segment.baseSource.rendererReceiptSha256.length,64);
    assert.equal(segment.baseSource.projectShot.dependencies[0].sha256,dependency.sha256);
  }
  const relationship = manifest.segments[2];
  const childReceiptPath = path.resolve(path.dirname(manifestPath),relationship.baseSource.rendererReceiptPath);
  const childReceiptBytes = fs.readFileSync(childReceiptPath);
  assert.equal(sha256(childReceiptBytes),relationship.baseSource.rendererReceiptSha256);
  const childReceipt = JSON.parse(childReceiptBytes.toString('utf8'));
  assert.equal(childReceipt.format,'laohu.motion-project-shot-render-receipt/1');
  assert.deepEqual(childReceipt.source.module,{path:'shots/project-shots.tsx',sha256:moduleSha256,exportName:'RelationshipMap'});
  assert.deepEqual(childReceipt.source.props,segments[2].props);
  assert.deepEqual(childReceipt.source.dependencies,[{path:'shared/palette.ts',sha256:dependency.sha256,bytes:Buffer.byteLength(paletteSource)}]);
  assert.equal(childReceipt.source.stableModules.find((row)=>row.path==='components/shots/index.ts').sha256,
    sha256(fs.readFileSync(path.join(skillDir,'templates/runtime/laohu-remotion/components/shots/index.ts'))));
  assert.deepEqual(childReceipt.source.assets,[{path:'assets/marker.svg',stagedPath:'assets/marker.svg',sha256:marker.sha256,bytes:Buffer.byteLength(markerSource)}]);
  assert.equal(childReceipt.render.width,1920);
  assert.equal(childReceipt.render.height,1080);
  assert.equal(childReceipt.render.fps,30);
  assert.equal(childReceipt.render.durationInFrames,30);
  assert.equal(childReceipt.render.audioStream,'absent');
  assert.equal(childReceipt.output.sha256,relationship.baseSource.renderedOutputSha256);
  assert.equal(JSON.stringify(childReceipt).includes(fixtureRoot),false,'project-shot render receipt contains no user-specific source path');

  const planPath = path.join(fixtureRoot, 'production-plan.json');
  const decisionRecordPath = path.join(fixtureRoot, 'user-direction.md');
  const decisionText = '本轮用户要求保留关系变化焦点，按实际材料组织镜头。';
  fs.writeFileSync(decisionRecordPath, '# 本轮方向\n\n' + decisionText + '\n');
  const audioPlanPath = path.join(fixtureRoot, 'audio-plan.json');
  const audioPlan = {
    schemaVersion:1,timeUnit:'seconds',timeBasis:'film-global',durationSec:3,sampleRate:48000,channels:2,
    events:[],tracks:[],voiceWindows:[],automation:[],timeMaps:[],assets:[],generatedAssets:[],
  };
  fs.writeFileSync(audioPlanPath, JSON.stringify(audioPlan,null,2)+'\n');
  const mappingFields = ['modulePath','moduleSha256','exportName','props','dependencies','assets'];
  const units = segments.map((segment) => ({
    id:'unit-'+segment.id,
    sourceRefs:[{materialId:'direction-lock',locator:'line 3',kind:'user direction'}],
    task:segment.id === 'relationship-map' ? 'Show the named relation sequence.' : 'Show the information card in the selected composition.',
    completionSignal:'The intended relationship, content and reading order are visible in the actual frame.',
  }));
  const overlayFields = ['layers.0.catalogId','layers.0.props.tone','layers.0.props.grain','layers.0.props.vignette',
    'layers.0.placement.x','layers.0.placement.y','layers.0.placement.width','layers.0.placement.height'];
  const overlayMapping = {
    id:'overlay-relationship-map',role:'layer',segmentId:'relationship-map',renderer:'laohu-project-shot',
    resourceType:'component',resourceId:'video-shotcraft-backdrop',layerIndex:0,consumerFields:overlayFields,
  };
  const shots = segments.map((segment) => ({
    id:'shot-'+segment.id,viewingUnitIds:['unit-'+segment.id],decisionId:'project-shot-choice',filmSegmentId:segment.id,
    visualIntent:'Use the per-work composition and exact segment content while preserving the single Film clock.',
    subjects:[],screenText:[],phases:{},audioIntent:{choice:'none',reason:'This technical fixture validates picture provenance only.',eventIds:[]},
    sourceMappings:[{
      id:'base-'+segment.id,role:'base',segmentId:segment.id,renderer:'laohu-project-shot',resourceType:'project-shot',
      resourceId:segment.modulePath,consumerFields:mappingFields,
    },...(segment.id==='relationship-map'?[overlayMapping]:[])],
  }));
  const implementationPlan = segments.map((segment) => ({
    id:'shot-'+segment.id,decisionId:'project-shot-choice',viewingUnitIds:['unit-'+segment.id],filmSegmentId:segment.id,
    renderer:'laohu-project-shot',resourceType:'renderer-route',resourceId:'laohu-project-shot',
    mappingId:'base-'+segment.id,consumerFields:mappingFields,
  }));
  const keyFramePath = path.join(fixtureRoot,'relationship-frame-15.png');
  const baseFramePath = path.join(fixtureRoot,'relationship-base-frame-15.png');
  const relationshipVideoPath = path.resolve(path.dirname(manifestPath),relationship.baseSource.renderedOutputPath);
  const relationshipGlobalFrame = relationship.frameRange.startFrame + 15;
  const extractPngFrame = (inputPath, frameIndex, destination) => {
    const result = spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-i',inputPath,
      '-vf',`select=eq(n\\,${frameIndex})`,'-fps_mode','vfr','-frames:v','1',destination],{encoding:'utf8',timeout:120_000});
    assert.equal(result.status,0,`FFmpeg failed to extract frame ${frameIndex} from ${inputPath}: ${result.stderr}`);
  };
  extractPngFrame(outputPath,relationshipGlobalFrame,keyFramePath);
  extractPngFrame(relationshipVideoPath,15,baseFramePath);
  assert.ok(changedPixelCount(rgbaVideoFrame(relationshipVideoPath,15,ffmpeg),rgbaVideoFrame(outputPath,relationshipGlobalFrame,ffmpeg))>500_000,
    'the positioned Backdrop layer visibly changes the final Film frame relative to its project-shot base clip while leaving an outside sample area exposed');
  const manifestRelative = path.relative(fixtureRoot,manifestPath);
  const proof = {
    phase:'relationship-map held state',path:path.relative(fixtureRoot,keyFramePath),sha256:sha256(fs.readFileSync(keyFramePath)),
    observation:'This PNG is decoded from the final Film-global frame corresponding to local frame 15 of the RelationshipMap segment.',
    rendererReceipt:{path:manifestRelative,sha256:sha256(fs.readFileSync(manifestPath))},
    filmSegmentId:'relationship-map',mappingId:'base-relationship-map',frameIndex:15,
    globalFrameIndex:relationshipGlobalFrame,filmPictureSha256:sha256(fs.readFileSync(outputPath)),
  };
  const directionLockBytes = fs.readFileSync(decisionRecordPath);
  const plan = {
    format:'laohu.motion.production-plan/2',
    work:{id:'project-shot-render-fixture',title:'Project shot manifest and key-state verification',directionMode:'locked-local'},
    inputs:{
      sourceMaterials:[{id:'direction-lock',kind:'user-direction',role:'source-located direction lock',
        path:path.relative(fixtureRoot,decisionRecordPath),sha256:sha256(directionLockBytes)}],
      filmBlueprint:{path:path.basename(blueprintPath),sha256:sha256(blueprintBytes)},
      audioPlan:{path:path.basename(audioPlanPath),sha256:sha256(fs.readFileSync(audioPlanPath))},
    },
    directionDecisions:[{
      id:'project-shot-choice',mode:'locked-local',rationale:'A work-specific shot layout will express the relation using the verified local project-shot host.',
      userLockRef:{sourceMaterialId:'direction-lock',locator:{lineStart:3,lineEnd:3},userDecision:decisionText,
        scope:'Keep the relationship-change focus and allow the work to use its own composition.'},
      candidates:[{id:'project-shot-route',resourceType:'renderer-route',resourceId:'laohu-project-shot',
        fitReason:'The verified Remotion host can render this work-owned module with the actual Film frame contract.',
        keyStateEvidence:[proof]}],selectedCandidateId:'project-shot-route',
    }],
    implementationPlan,viewingUnits:units,shots,
    verification:{gates:[{
      id:'quality-review',inspect:'Inspect hierarchy, relation order, typography and motion in the actual Film.',
      evidence:'Human review is not present in this technical fixture.',redoReason:'Revise the composition and capture a new actual Film frame.',
      scope:'relationship-map',criterionRef:'criterion:visual-understanding',observations:'No aesthetic conclusion has been recorded.',
      status:'UNKNOWN',redoLocation:'production-plan.json#verification.gates.quality-review',
    }]},
    outputs:{
      picture:path.basename(outputPath),filmManifest:path.basename(manifestPath),audioWav:'audio.wav',
      audioManifest:'audio.manifest.json',finalVideo:'final.mp4',
    },
  };
  fs.writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n');
  const validatedPlan = await validatePlanFile(planPath,{ffmpeg});
  assert.equal(validatedPlan.plan.format,'laohu.motion.production-plan/2');
  assert.equal(validatedPlan.keyStateProofs[0].renderer,'laohu-project-shot');
  assert.equal(validatedPlan.keyStateProofs[0].frameIndex,15);
  assert.equal(validatedPlan.keyStateProofs[0].globalFrameIndex,relationshipGlobalFrame);
  assert.equal(validatedPlan.keyStateProofs[0].filmPictureSha256,sha256(fs.readFileSync(outputPath)));
  assert.equal(validatedPlan.keyStateProofs[0].modulePath,'shots/project-shots.tsx');
  assert.equal(validatedPlan.keyStateProofs[0].sourceGraphSha256.length,64);
  const inspectedFilm = await inspectFilmReceipt(validatedPlan,{
    picture:path.resolve(fixtureRoot,plan.outputs.picture),
    filmManifest:path.resolve(fixtureRoot,plan.outputs.filmManifest),
  });
  assert.deepEqual(inspectedFilm.consumerMappingsVerified,shots.flatMap((shot)=>shot.sourceMappings.map((mapping)=>mapping.id)),
    'the Film receipt proves every project-shot source and overlaid component mapping was actually consumed');

  const wrongFramePath = path.join(fixtureRoot,'relationship-frame-14.png');
  const wrongGlobalFrame = manifest.segments[0].frameRange.startFrame + 15;
  extractPngFrame(outputPath,wrongGlobalFrame,wrongFramePath);
  const wrongFramePlan = structuredClone(plan);
  wrongFramePlan.directionDecisions[0].candidates[0].keyStateEvidence[0].path = path.basename(wrongFramePath);
  wrongFramePlan.directionDecisions[0].candidates[0].keyStateEvidence[0].sha256 = sha256(fs.readFileSync(wrongFramePath));
  const wrongFramePlanPath = path.join(fixtureRoot,'wrong-frame-plan.json');
  fs.writeFileSync(wrongFramePlanPath,JSON.stringify(wrongFramePlan,null,2)+'\n');
  await assert.rejects(validatePlanFile(wrongFramePlanPath,{ffmpeg}),/pixels do not match the identified frame in the final rendered Film picture/,
    'reviewer prose and a valid PNG hash cannot substitute a different final Film frame');

  const baseFramePlan = structuredClone(plan);
  baseFramePlan.directionDecisions[0].candidates[0].keyStateEvidence[0].path = path.basename(baseFramePath);
  baseFramePlan.directionDecisions[0].candidates[0].keyStateEvidence[0].sha256 = sha256(fs.readFileSync(baseFramePath));
  const baseFramePlanPath = path.join(fixtureRoot,'base-frame-plan.json');
  fs.writeFileSync(baseFramePlanPath,JSON.stringify(baseFramePlan,null,2)+'\n');
  await assert.rejects(validatePlanFile(baseFramePlanPath,{ffmpeg}),/pixels do not match the identified frame in the final rendered Film picture/,
    'the uncomposited project-shot base PNG cannot stand in for the final Film frame when an overlay is visible');

  const misplacedRangePlan = structuredClone(plan);
  misplacedRangePlan.verification.gates[0] = {
    ...misplacedRangePlan.verification.gates[0],status:'OBSERVE',reviewer:{identity:'reviewer-42',kind:'independent-human'},
    artifact:{path:path.basename(outputPath),sha256:sha256(fs.readFileSync(outputPath)),mediaType:'video/mp4',
      frameRange:{coordinateSystem:'film-global',filmSegmentId:'centered-arial',startFrame:60,endFrame:60}},
  };
  const misplacedRangePath = path.join(fixtureRoot,'misplaced-range-plan.json');
  fs.writeFileSync(misplacedRangePath,JSON.stringify(misplacedRangePlan,null,2)+'\n');
  await assert.rejects(validatePlanFile(misplacedRangePath,{ffmpeg}),/must stay inside the actual rendered frameRange/,
    'Film-global range evidence cannot be attributed to a different segment');

  const creatorPassPlan = structuredClone(plan);
  creatorPassPlan.verification.gates[0] = {
    ...creatorPassPlan.verification.gates[0],status:'PASS',reviewer:{identity:'creator-1',kind:'creator'},
    artifact:{path:path.basename(outputPath),sha256:sha256(fs.readFileSync(outputPath)),mediaType:'video/mp4',
      frameRange:{coordinateSystem:'film-global',filmSegmentId:'centered-arial',startFrame:0,endFrame:2}},
  };
  const creatorPassPath = path.join(fixtureRoot,'creator-pass-plan.json');
  fs.writeFileSync(creatorPassPath,JSON.stringify(creatorPassPlan,null,2)+'\n');
  await assert.rejects(validatePlanFile(creatorPassPath,{ffmpeg}),/creator self-review and automated checks can only record OBSERVE/,
    'creator self-review is not an acceptance PASS');

  const changedPropsBlueprint = structuredClone(blueprint);
  changedPropsBlueprint.segments[2].props.heading = 'Changed after the Film was rendered';
  const changedPropsBytes = Buffer.from(JSON.stringify(changedPropsBlueprint,null,2)+'\n');
  const changedPropsPath = path.join(fixtureRoot,'film-blueprint-changed-props.json');
  fs.writeFileSync(changedPropsPath,changedPropsBytes);
  const changedPropsPlan = structuredClone(plan);
  changedPropsPlan.inputs.filmBlueprint = {path:path.basename(changedPropsPath),sha256:sha256(changedPropsBytes)};
  const changedPropsPlanPath = path.join(fixtureRoot,'changed-props-plan.json');
  fs.writeFileSync(changedPropsPlanPath,JSON.stringify(changedPropsPlan,null,2)+'\n');
  await assert.rejects(validatePlanFile(changedPropsPlanPath,{ffmpeg}),/manifest for the submitted blueprint hash/,
    'a frame from a previous composition cannot validate changed consumed props');

  const originalDependency = fs.readFileSync(palettePath);
  try {
    fs.writeFileSync(palettePath,Buffer.concat([originalDependency,Buffer.from('\n// stale proof\n')]));
    await assert.rejects(validatePlanFile(planPath,{ffmpeg}),/dependencies.*SHA-256 is stale/,
      'changing an imported dependency invalidates the prior render proof');
  } finally {
    fs.writeFileSync(palettePath,originalDependency);
  }
  const originalMarker = fs.readFileSync(markerPath);
  try {
    fs.writeFileSync(markerPath,Buffer.concat([originalMarker,Buffer.from('\n<!-- stale proof -->\n')]));
    await assert.rejects(validatePlanFile(planPath,{ffmpeg}),/asset.*SHA-256 is stale/,
      'changing a consumed asset invalidates the prior render proof');
  } finally {
    fs.writeFileSync(markerPath,originalMarker);
  }

  const productionPlanCli = path.join(skillDir,'scripts','production-plan.mjs');
  const freshProductionPlan = structuredClone(plan);
  freshProductionPlan.outputs.picture = 'production-plan-film.mp4';
  freshProductionPlan.outputs.filmManifest = 'production-plan-film.manifest.json';
  freshProductionPlan.directionDecisions[0].candidates[0].keyStateEvidence = [{
    phase:'selected local frame for post-render inspection',filmSegmentId:'relationship-map',mappingId:'base-relationship-map',frameIndex:15,
  }];
  const freshProductionPlanPath = path.join(fixtureRoot,'production-plan-fresh.json');
  const freshRunReceiptPath = path.join(fixtureRoot,'production-plan-fresh-run.receipt.json');
  fs.writeFileSync(freshProductionPlanPath,JSON.stringify(freshProductionPlan,null,2)+'\n');
  const ffmpegPath = path.isAbsolute(ffmpeg) ? ffmpeg : spawnSync('which',['ffmpeg'],{encoding:'utf8'}).stdout.trim();
  const productionArgs = [productionPlanCli,'render-film','--plan',freshProductionPlanPath,'--work-root',repoRoot,
    '--ffmpeg',ffmpegPath,'--browser',browser,'--receipt',freshRunReceiptPath];
  const productionRender = spawnSync(process.execPath,productionArgs,{cwd:repoRoot,encoding:'utf8',maxBuffer:32*1024*1024,timeout:1_200_000});
  assert.equal(productionRender.status,0,`production-plan render-film must render to fresh outputs before validating final receipts: ${productionRender.stderr || productionRender.stdout}`);
  const productionRunReceipt = JSON.parse(fs.readFileSync(freshRunReceiptPath,'utf8'));
  assert.equal(productionRunReceipt.completed,true);
  assert.equal(productionRunReceipt.artifacts.projectShotKeyStates.length,1,'the runner captures the selected frame only after Film exists');
  const capturedKeyState = productionRunReceipt.artifacts.projectShotKeyStates[0];
  const capturedKeyStatePath = path.resolve(repoRoot,capturedKeyState.imagePath);
  assert.equal(capturedKeyState.quality,'not-rated-by-machine','technical frame capture is not aesthetic review');
  assert.equal(capturedKeyState.frameIndex,15,'receipt retains the selected local segment frame');
  assert.equal(capturedKeyState.globalFrameIndex,75,'receipt records its exact corresponding Film-global frame');
  assert.equal(createHash('sha256').update(fs.readFileSync(capturedKeyStatePath)).digest('hex'),capturedKeyState.imageSha256);
  assert.equal(capturedKeyState.planProof.sha256,capturedKeyState.imageSha256,'the receipt exposes the exact machine-verifiable key-state reference without modifying the source plan');
  assert.equal(capturedKeyState.planProof.rendererReceipt.sha256,capturedKeyState.rendererReceiptSha256);
  assert.equal(capturedKeyState.planProof.globalFrameIndex,75);
  assert.equal(capturedKeyState.planProof.filmPictureSha256,productionRunReceipt.artifacts.film.picture.sha256);
  assert.equal(capturedKeyState.planProof.observation.includes('no aesthetic rating'),true);
  const executedPlan = JSON.parse(fs.readFileSync(freshProductionPlanPath,'utf8'));
  assert.equal(executedPlan.directionDecisions[0].candidates[0].keyStateEvidence[0].path,undefined,"execution does not write generated hashes back into the user's plan");
  assert.equal(executedPlan.verification.gates[0].status,'UNKNOWN','technical capture does not change the review status');

  const existingOutputReceipt = path.join(fixtureRoot,'production-plan-existing-output.receipt.json');
  const existingOutputResult = spawnSync(process.execPath,[productionPlanCli,'render-film','--plan',freshProductionPlanPath,'--work-root',repoRoot,
    '--ffmpeg',ffmpegPath,'--browser',browser,'--receipt',existingOutputReceipt],{cwd:repoRoot,encoding:'utf8',maxBuffer:8*1024*1024,timeout:1_200_000});
  assert.notEqual(existingOutputResult.status,0,'the plan runner refuses to replace an already-rendered Film output');
  assert.match(existingOutputResult.stderr,/Film output picture already exists/);

  const staleDependencyPlan = structuredClone(freshProductionPlan);
  staleDependencyPlan.outputs.picture = 'stale-dependency-film.mp4';
  staleDependencyPlan.outputs.filmManifest = 'stale-dependency-film.manifest.json';
  const staleDependencyPlanPath = path.join(fixtureRoot,'production-plan-stale-dependency.json');
  fs.writeFileSync(staleDependencyPlanPath,JSON.stringify(staleDependencyPlan,null,2)+'\n');
  const paletteBeforeStaleRender = fs.readFileSync(palettePath);
  try {
    fs.writeFileSync(palettePath,Buffer.concat([paletteBeforeStaleRender,Buffer.from('\n// invalidate production-plan preflight\n')]));
    const staleDependencyResult = spawnSync(process.execPath,[productionPlanCli,'render-film','--plan',staleDependencyPlanPath,'--work-root',repoRoot,
      '--ffmpeg',ffmpegPath,'--browser',browser,'--receipt',path.join(fixtureRoot,'production-plan-stale-dependency.receipt.json')],
    {cwd:repoRoot,encoding:'utf8',maxBuffer:8*1024*1024,timeout:1_200_000});
    assert.notEqual(staleDependencyResult.status,0,'preflight rejects a changed work-module dependency before creating another Film');
    assert.match(staleDependencyResult.stderr,/dependencies\.shared\/palette\.ts SHA-256 is stale/);
    assert.equal(fs.existsSync(path.join(fixtureRoot,'stale-dependency-film.mp4')),false);
  } finally {
    fs.writeFileSync(palettePath,paletteBeforeStaleRender);
  }

  const arialFrame = rgbaVideoFrame(outputPath,15,ffmpeg);
  const georgiaFrame = rgbaVideoFrame(outputPath,45,ffmpeg);
  const mapFrame = rgbaVideoFrame(outputPath,75,ffmpeg);
  const framePixel = (rgba,x,y) => [...rgba.slice((y*1920+x)*4,(y*1920+x)*4+3)];
  const darkBackground = framePixel(arialFrame,100,100);
  const paperBackground = framePixel(mapFrame,100,100);
  assert.ok(darkBackground[0]<55 && darkBackground[1]<65 && darkBackground[2]<80,`background prop is visible: ${darkBackground}`);
  assert.ok(paperBackground[0]>210 && paperBackground[1]>200 && paperBackground[2]>180,`alternate background prop is visible: ${paperBackground}`);
  assert.ok(changedPixelCount(arialFrame,georgiaFrame)>300, 'fontFamily changes the actual rendered type pixels while other card props stay fixed');
  assert.ok(warmMediaPixelCount(mapFrame,{x:150,y:400,width:180,height:180})>1000,'the declared local SVG content asset is staged and rendered by staticFile');

  const cardShot = compiled.rows[0].baseSource.projectShot;
  const entryPath = path.join(rendered.workRoot,'local-base','centered-arial','generated-entry.tsx');
  const entry = await createProjectShotEntrypoint({projectShot:cardShot,outputPath:path.join(fixtureRoot,'seek-entry.tsx')});
  const aliases = projectShotWebpackAliases(cardShot,{runtimeRoot:runtime.runtimeRoot,nodeModules:runtime.nodeModules});
  const seekRuntime = {runtimeRoot:runtime.runtimeRoot,nodeModules:runtime.nodeModules,lockHash:sha256(fs.readFileSync(path.join(runtime.runtimeRoot,'package-lock.json'))),resolutionSource:runtime.resolutionSource,packages:runtime.packages};
  const seekOne = await Shotcraft.renderRemotion({runtime:seekRuntime,spec:{width:1920,height:1080,fps:30,durationInFrames:30,props:cardShot.props},frame:15,outputPath:path.join(fixtureRoot,'seek-frame-a.png'),browser,workRoot:path.join(fixtureRoot,'seek-work-a'),browserCacheRoot:repoRoot,compositionId:'LaohuProjectShot',entryPoint:entry.path,moduleAliases:aliases});
  const seekTwo = await Shotcraft.renderRemotion({runtime:seekRuntime,spec:{width:1920,height:1080,fps:30,durationInFrames:30,props:cardShot.props},frame:15,outputPath:path.join(fixtureRoot,'seek-frame-b.png'),browser,workRoot:path.join(fixtureRoot,'seek-work-b'),browserCacheRoot:repoRoot,compositionId:'LaohuProjectShot',entryPoint:entry.path,moduleAliases:aliases});
  assert.equal(seekOne.composition.durationInFrames,30);
  assert.equal(seekTwo.composition.durationInFrames,30);
  assert.equal(changedPixelCount(rgbaFrame(path.join(fixtureRoot,'seek-frame-a.png'),ffmpeg),rgbaFrame(path.join(fixtureRoot,'seek-frame-b.png'),ffmpeg)),0,'re-seeking the same local frame twice produces identical pixels');
  assert.equal(fs.existsSync(entryPath),true,'Film job cache contains the generated import entry for the verified work export');
});

