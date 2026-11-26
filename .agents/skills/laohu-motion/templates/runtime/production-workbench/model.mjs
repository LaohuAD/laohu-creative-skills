import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { localFile } from '../laohu-showreel/scripts/lib/editor-model.mjs';
import { briefProductionInputs, parseSrt, readBriefProductionUnits, resolveBriefProductionUnits } from '../../../scripts/brief-production-units.mjs';
import { captionSourceDeclaration, hasBriefTypefaces, hasControlledBriefText } from '../../../scripts/brief-typefaces.mjs';
import { SCREEN_TEXT_MAP_FORMAT } from '../../../scripts/screen-text-contract.mjs';
import { captionSourceCues, compileBriefTextMap, readBriefCaptionSource } from '../../../scripts/screen-text-registry.mjs';
import { captionManifestToSrt } from '../../../../laohu-asrcut/scripts/caption-manifest.mjs';

import { materialViews, inputFiles, inputFolder, mediaTypes } from './materials.mjs';

export { parseSrt };

const execute = promisify(execFile);
export const configPath = '.showreel-progress/workbench.json';
const progressPath = '.showreel-progress/status.json';
const inputPath = '.showreel-input-delivery.json';
const trackReceipt = 'voice/caption-manifest.json';
export const textMap = '.cache/brief-text-map.json';
const textRuntime = '.cache/brief-text-contract.mjs';
const captionRuntime = '.cache/native-caption-runtime.mjs';
const textCoverage = '.cache/brief-text-coverage.json';
const clipEvidence = '.showreel-progress/workbench-checks.json';
const isRealTime = value => typeof value === 'number' && Number.isFinite(value);
export const projectUrl = file => '/project/' + file.split('/').map(encodeURIComponent).join('/');
const sha = value => createHash('sha256').update(value).digest('hex');

function finalReviewAudioPath(preview) {
  const audio = preview?.reviewedAudio?.path;
  if (preview?.final !== true || preview.stage !== 'review' || !/^[\d]+-[a-f0-9]{8}$/u.test(preview.id)
    || preview.directory !== `.showreel-progress/revisions/${preview.id}/project` || !audio) return null;
  return `${preview.directory}/${audio}`;
}

function optionalFile(root, relative) {
  if (!relative) return null;
  try { return localFile(root, relative); } catch { return null; }
}

function read(root, relative, fallback = null) {
  const file = optionalFile(root, relative);
  if (!file) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function firstPresent(root, options) {
  return options.find(file => optionalFile(root, file)) || null;
}

function latestPresent(root, options) {
  return options.filter(file => optionalFile(root, file)).sort((a, b) =>
    fs.statSync(optionalFile(root, b)).mtimeMs - fs.statSync(optionalFile(root, a)).mtimeMs
  )[0] || null;
}

function subtitleSelection(root, candidates, designPlan, designError) {
  const subtitleSources = designPlan ? briefProductionInputs(designPlan).filter(file => /\.srt$/iu.test(file)) : [];
  if (designError) return { subtitles: null, subtitleSources, subtitleIssue: '先修正 Brief 的讲述与字幕登记' };
  const configured = Array.isArray(candidates) ? [...new Set(candidates)] : null;
  if (!subtitleSources.length) {
    return { subtitles: latestPresent(root, configured || ['双语字幕.srt', 'voice/双语字幕.srt', 'captions.srt']), subtitleSources };
  }
  const designated = configured?.filter(file => subtitleSources.includes(file)) ?? [];
  const selected = subtitleSources.length === 1 ? subtitleSources[0] : designated.length === 1 ? designated[0] : null;
  if (!selected) return { subtitles: null, subtitleSources, subtitleIssue: 'Brief 绑定了多个 SRT。请在工作台配置中选定其中一份供字幕导航。' };
  if (!optionalFile(root, selected)) return { subtitles: null, subtitleSources, subtitleIssue: `Brief 绑定的字幕文件尚不可读：${selected}` };
  return { subtitles: selected, subtitleSources };
}

export function readSetup(root, options = {}) {
  const setup = read(root, configPath, {});
  const voicePath = firstPresent(root, [setup.voice, 'voice/旁白.wav', 'audio/narration.wav', read(root, 'audio/narration.json')?.file]);
  const briefFile = optionalFile(root, 'brief.md');
  const brief = briefFile ? fs.readFileSync(briefFile, 'utf8') : '';
  let designPlan = null, designError = null;
  try { designPlan = readBriefProductionUnits(brief, { required: read(root, inputPath, {})?.productionUnitsRequired === true, projectRoot: root }); }
  catch (error) { designError = error.message; }
  let subtitles, explicitCaptions = null;
  if (captionSourceDeclaration.test(brief)) {
    try {
      const source = readBriefCaptionSource(brief, root);
      explicitCaptions = {path: source.path, kind: source.kind, sha256: source.sha256, cues: captionSourceCues(source)};
      subtitles = {subtitles: source.path, subtitleSources: [source.path]};
    } catch (error) { subtitles = {subtitles: null, subtitleSources: [], subtitleIssue: error.message}; }
  } else subtitles = subtitleSelection(root, setup.subtitleCandidates, designPlan, designError);
  const extraSceneInputs = Array.isArray(setup.extraSceneInputs) ? setup.extraSceneInputs : [];
  const captionManifests = [...new Set(extraSceneInputs.filter(file => /(?:^|\/)caption-manifest\.json$/iu.test(file)))];
  const captionManifest = captionManifests.length === 1 ? captionManifests[0] : null;
  const page = firstPresent(root, [setup.page, 'index.html']);
  return {
    chapterAxis: setup.chapterAxis, chapterPlan: setup.chapterPlan || [], userInputs: setup.userInputs || [],
    title: setup.title || path.basename(root), labels: setup.labels || {}, framePlan: setup.framePlan || [], page, ...subtitles, voicePath,
    designPlan, designError, captionManifest, explicitCaptions,
    voiceReceipt: setup.voiceReceipt || (voicePath && voicePath + '.artifact.json'),
    mix: firstPresent(root, [options.audio, setup.mix, 'audio/final.wav']),
    mixReceipt: setup.mixReceipt || 'audio/mix.json',
    covers: (setup.covers || []).filter(row => optionalFile(root, row.file)),
    extraSceneInputs,
  };
}

function controlledTextState(root) {
  const briefFile = optionalFile(root, 'brief.md');
  const brief = briefFile ? fs.readFileSync(briefFile, 'utf8') : '';
  let map;
  try { map = read(root, textMap); } catch { /* The compiler reports a stale or conflicting map. */ }
  if (!hasControlledBriefText(brief, map)) return null;
  const briefSha256 = sha(brief);
  const faces = Array.isArray(map?.typefaces) ? map.typefaces : [];
  const fonts = faces.map(face => face?.assetPath).filter(file => /^fonts\/brief\/[a-f0-9]{64}\.(?:ttf|otf|woff2?)$/u.test(file ?? ''));
  let sourceCurrent = !captionSourceDeclaration.test(brief) && !map?.captionSource;
  if (map?.captionSource) {
    const file = optionalFile(root, map.captionSource.path);
    sourceCurrent = captionSourceDeclaration.test(brief) && Boolean(file && sha(fs.readFileSync(file)) === map.captionSource.sha256
      && optionalFile(root, 'fonts/captions/SourceHanSansCN-700.ttf'));
  }
  const current = map?.format === SCREEN_TEXT_MAP_FORMAT && map.generated === true && map.sourceFile === 'brief.md'
    && map.briefSha256 === briefSha256 && Array.isArray(map.entries) && optionalFile(root, textRuntime)
    && (!map.entries.some(entry => entry?.caption) || optionalFile(root, captionRuntime))
    && (!hasBriefTypefaces(brief) || faces.length > 0)
    && sourceCurrent && fonts.length === faces.length && fonts.every(file => optionalFile(root, file));
  if (map?.captionSource) fonts.push('fonts/captions/SourceHanSansCN-700.ttf');
  return { brief, briefSha256, current: Boolean(current), fonts, map };
}

function rendererTextFingerprint(root, text) {
  try {
    const source = text.current ? text.map : compileBriefTextMap(text.brief, {projectRoot: root});
    const typefaces = source.typefaces?.map(({name, id, weight}) => ({name, id, weight}));
    return sha(JSON.stringify([source.entries, typefaces ?? []]));
  } catch {
    return text.briefSha256;
  }
}

export function needsBriefTextInputs(root) {
  const text = controlledTextState(root);
  return text && !text.current ? text.briefSha256 : null;
}

function statKey(root, files) {
  return files.filter(Boolean).sort().map(file => {
    const real = optionalFile(root, file);
    if (!real) return [file, null];
    const stat = fs.statSync(real, { bigint: true });
    return [file, String(stat.mtimeNs), String(stat.size)];
  });
}

export function snapshot(root, setup) {
  const rootFiles = fs.readdirSync(root, { withFileTypes: true })
    .filter(row => row.isFile() && /\.(html|[cm]?js|css)$/i.test(row.name)).map(row => row.name);
  const catalog = read(root,'assets/workbench/clips.json',{});
  const text = controlledTextState(root);
  const sceneTextRevision = text ? rendererTextFingerprint(root, text) : null;
  const files = new Set([setup.page, trackReceipt, captionRuntime, textRuntime, ...(text?.fonts ?? []),
    'assets/clip-state.json', 'assets/workbench/clips.json',
    setup.subtitles, setup.voicePath, setup.mix, setup.mixReceipt, ...rootFiles, ...setup.extraSceneInputs]);
  if (!text) files.add(textMap);
  const renderFiles = statKey(root, [...files]);
  if (sceneTextRevision) renderFiles.push(['brief.md#screen-text-registry', sceneTextRevision]);
  const renderRevision = sha(JSON.stringify(renderFiles)).slice(0, 16);
  const designInputs = setup.designPlan ? briefProductionInputs(setup.designPlan) : [];
  const stateFiles = [configPath, progressPath, inputPath, textMap, textCoverage, clipEvidence, 'brief.md',
    setup.subtitles, setup.voicePath, setup.voiceReceipt, setup.mix, setup.mixReceipt,
    ...setup.covers.map(row => row.file), ...designInputs, 'out/final.mp4', 'qa/final/qa.json', 'qa/final.json'];
  stateFiles.push(...(catalog.clips||[]).map(c=>c.file), ...(catalog.history||[]).map(c=>c.file), ...(read(root,inputPath,{})?.keyframeSet?.artifacts||[]).map(a=>a.path), 'chapter-index.json','chapter-navigation.json','chapter-metadata.json', ...inputFiles(root).map(a=>a.file), ...(setup.userInputs || []).map(a=>a.file));
  const revision = sha(JSON.stringify([renderRevision, ...statKey(root, stateFiles)])).slice(0, 20);
  return { revision, renderRevision, sceneTextRevision };
}

export async function readClock(root) {
  const file = optionalFile(root, 'timeline.js');
  if (!file) return { duration: 0, fps: 30, draft: true, shots: [], events: [], chapters: [] };
  const isStarter = fs.readFileSync(file).equals(fs.readFileSync(new URL('../laohu-showreel/assets/starter/timeline.js', import.meta.url)));
  // A fresh ESM process also reloads transitive clock-data imports.
  const script = `const x = await import(process.argv[1]);
    console.log(JSON.stringify({ duration: x.DUR, fps: x.FPS, draft: x.DRAFT,
      shots: x.SHOTS, events: [x.CUES, x.ALL_EVENTS, x.EVENTS].filter(Array.isArray).flat(), chapters: x.CHAPTER_EVENTS }));`;
  const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', script, pathToFileURL(file).href],
    { cwd: root, timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
  const result = JSON.parse(stdout.trim().split('\n').at(-1));
  const duration = Number(result.duration) || 0;
  const inClock = t => isRealTime(t) && t >= 0 && t <= duration + 1e-6;
  const intervals = list => (Array.isArray(list) ? list : []).filter(row =>
    typeof row?.id === 'string' && inClock(row.t0) && inClock(row.t1) && row.t1 > row.t0
  ).sort((a, b) => a.t0 - b.t0);
  return { duration, fps: Number(result.fps) || 30, draft: isStarter || result.draft === true,
    shots: intervals(result.shots), events: intervals(result.events), chapters: intervals(result.chapters) };
}

function makeKeyframes(root, setup, clock, source, progress) {
  const duration = clock.duration;
  const labeled = new Map((progress.artifacts || []).map(artifact => [artifact.id, artifact]));
  const selected = source.keyframeSet;
  const approved = source.confirmations?.style;
  const currentConfirmation = Boolean(selected?.revision && approved?.status === 'confirmed' &&
    approved?.previewArtifactSet?.revision === selected.revision);
  const frames = new Map();
  const item = row => ({ id: row.frame.event, time: row.frame.timeSeconds,
    title: setup.labels[row.frame.event] || labeled.get(row.id)?.name || row.frame.event,
    file: row.path && optionalFile(root, row.path) ? projectUrl(row.path) : null,
    state: currentConfirmation ? 'confirmed' : 'published',
    role: row.frame.role === 'implementation' ? '工程实渲' : '代码设计帧' });
  const current = selected?.artifacts || [];
  const supplemental = (progress.artifacts || []).filter(artifact => artifact.frame?.role === 'implementation')
    .map(artifact => ({ id: artifact.id, frame: artifact.frame, path: '.showreel-progress/artifacts/' + path.basename(artifact.url || '') }));
  for (const row of [...current, ...supplemental]) {
    if (row.frame?.source === 'code' && isRealTime(row.frame.timeSeconds) && row.frame.timeSeconds >= 0 && row.frame.timeSeconds < duration) {
      frames.set(row.frame.timeSeconds, item(row));
    }
  }
  const published = [...frames.values()].sort((a,b) => a.time-b.time);
  const coverFrames = current.filter(row => row.frame?.source === 'cover' && optionalFile(root, row.path))
    .map(row => ({ file: row.path, name: setup.labels[row.frame.event] || row.frame.event, time: row.frame.timeSeconds }));
  const labeledShots = clock.shots.map(shot => ({ ...shot, title: setup.labels[shot.id] || shot.id }));
  return { published, coverFrames, currentConfirmation, labeledShots };
}

function makeSegments(root, duration, published, source, verification, revision) {
  if (!duration) return [];
  const cuts = [{ time: 0, title: '片头边界', state: 'boundary' },
    ...published.filter(row => row.time > 0),
    { time: duration, title: '片尾边界', state: 'boundary' }];
  const draftProbes = (source.explorations || []).filter(row =>
    row.kind === 'bounded-dynamic-probe' && row.renderRevision === revision && isRealTime(row.start) && row.duration > 0 && optionalFile(root, row.mp4?.path));
  // Current approved intervals require a recorded current render revision and evidence.
  return cuts.slice(1).map((right, index) => {
    const left = cuts[index], id = `motion-${index+1}`, t0 = left.time, t1 = right.time;
    const proof = (verification.segments || []).find(row => row.renderRevision === revision &&
      row.t0 === t0 && row.t1 === t1 && ['checked','rework'].includes(row.state) && optionalFile(root, row.file));
    const probes = draftProbes.filter(row => row.start < t1 && row.start+row.duration > t0)
      .map(row => ({ t0: row.start, t1: row.start + row.duration, href: projectUrl(row.mp4.path), title: row.purpose }));
    const state = proof?.state || (probes.length ? 'sample' :
      left.state === 'confirmed' && right.state === 'confirmed' ? 'waiting' : 'unconfirmed');
    return { id, t0, t1, left: left.title, right: right.title, state, probes,
      ...(proof ? { proof: projectUrl(proof.file), note: proof.note } : {}) };
  });
}

function productionProgress(root, design, input, progress, verification, revision) {
  const ready = unit => !design.issues.length && unit.timeState === 'bound' && !unit.issues.length;
  const recorded = [...(input.keyframeSet?.artifacts ?? []), ...(progress.artifacts ?? []).flatMap(row =>
    row.frame?.role === 'implementation' ? [{ ...row, path: '.showreel-progress/artifacts/' + path.basename(row.url || '') }] : [])];
  const framePlan = design.units.flatMap(unit => unit.frames.map(frame => {
    const matching = recorded.filter(row => {
      if (row.frame?.event !== frame.id || row.frame.unitDesignRevision !== unit.sourceDesignRevision || !isRealTime(row.frame.timeSeconds) ||
          Math.abs(row.frame.timeSeconds - frame.time) > 1e-6) return false;
      const file = optionalFile(root, row.path);
      const digest = row.sha256 || path.basename(row.path ?? '', '.png');
      return file && /^[a-f0-9]{64}$/u.test(digest) && sha(fs.readFileSync(file)) === digest;
    });
    const artifacts = matching.map(row => ({ file: projectUrl(row.path), role: row.frame.role, source: row.frame.source }));
    const target = artifacts.find(row => row.role === 'design') ?? artifacts[0];
    return { ...frame, title: frame.id, state: target ? 'published' : 'planned', file: target?.file, artifacts };
  }));
  const probes = (input.explorations ?? []).filter(row => row.kind === 'bounded-dynamic-probe' && row.renderRevision === revision &&
    Number.isFinite(row.start) && row.duration > 0 && optionalFile(root, row.mp4?.path));
  const segments = design.units.filter(unit => ['动画', '混合'].includes(unit.role)).map(unit => {
    const proof = ready(unit) && (verification.segments ?? []).find(row => row.unitId === unit.id && row.unitDesignRevision === unit.designRevision &&
      row.renderRevision === revision && row.t0 === unit.t0 && row.t1 === unit.t1 && ['checked', 'rework'].includes(row.state) && optionalFile(root, row.file));
    const samples = probes.filter(row => row.unitDesignRevisions?.[unit.id] === unit.designRevision && row.start < unit.t1 && row.start + row.duration > unit.t0)
      .map(row => ({ t0: row.start, t1: row.start + row.duration, href: projectUrl(row.mp4.path), title: row.purpose }));
    return { id: unit.id, t0: unit.t0, t1: unit.t1, title: unit.title, state: proof?.state ?? (samples.length ? 'sample' : 'waiting'), probes: samples,
      ...(proof ? { proof: projectUrl(proof.file), note: proof.note } : {}) };
  });
  const seams = design.units.slice(1).map((unit, index) => {
    const previous = design.units[index];
    const proof = ready(unit) && ready(previous) && (verification.seams ?? []).find(row =>
      row.fromUnitId === previous.id && row.toUnitId === unit.id && row.fromDesignRevision === previous.designRevision && row.toDesignRevision === unit.designRevision &&
      row.renderRevision === revision && row.time === unit.t0 && ['checked', 'rework'].includes(row.state) && optionalFile(root, row.file));
    return { id: unit.id, time: unit.t0, title: `${previous.title} → ${unit.title}`, state: proof?.state ?? 'waiting',
      ...(proof ? { proof: projectUrl(proof.file), note: proof.note } : {}) };
  });
  return { framePlan, segments, seams };
}

function stageRow(id, name, state, note, file) {
  return { id, name, state, note, ...(file ? { href: projectUrl(file) } : {}) };
}

export async function workbenchModel(root, setup, versions, options) {
  const clock = await readClock(root);
  if (!clock.duration && options.duration) clock.duration = options.duration;
  let designPlan = null, designError = setup.designError;
  try {
    const design = setup.designPlan;
    if (design) {
      designPlan = resolveBriefProductionUnits(root, design, clock);
      if (!clock.duration || clock.draft) clock.duration = design.units.at(-1).t1;
    }
  } catch (error) { designError = error.message; }
  const input = read(root, inputPath, {});
  const progress = read(root, progressPath, {});
  const projectPhase = input.projectPhase ?? null;
  const styleArt = new Set((progress.artifacts ?? []).filter(row => row.stage === 'style' && row.type === 'image').map(row => row.url));
  const directionSamples = projectPhase === 'explore' ? (input.explorations ?? []).filter(row =>
    row.kind === 'bounded-dynamic-probe' && row.draft === true && row.renderRevision === versions.renderRevision
    && optionalFile(root, row.mp4?.path) && styleArt.has(`/artifact/${row.previewWebpSha256}.webp`))
    .map(row => ({ t0: row.start, t1: row.start + row.duration, title: row.purpose, href: projectUrl(row.mp4.path) })) : [];
  const verification = read(root, clipEvidence, {});
  const voiceMeta = read(root, setup.voiceReceipt, {});
  const audioMix = read(root, setup.mixReceipt, {});
  const srtCues = setup.explicitCaptions?.cues ?? (setup.subtitles ? parseSrt(fs.readFileSync(localFile(root, setup.subtitles), 'utf8')) : []);
  let subtitleIssue = setup.subtitleIssue, nativeSubtitlesMatch = false;
  if (!setup.explicitCaptions && setup.subtitleSources.length && setup.subtitles && setup.captionManifest) {
    try {
      const captMeta = read(root, setup.captionManifest);
      nativeSubtitlesMatch = JSON.stringify(srtCues) === JSON.stringify(parseSrt(captionManifestToSrt(captMeta)));
      if (!nativeSubtitlesMatch) subtitleIssue = 'Brief 绑定的 SRT 与工程登记的字幕清单台词或时码不一致';
    } catch { subtitleIssue = `工程登记的字幕清单无法读取或未通过完整性校验：${setup.captionManifest}`; }
  }
  const captions = subtitleIssue ? [] : srtCues.filter(cue => !clock.duration || cue.t0 < clock.duration);
  const frameSet = makeKeyframes(root, setup, clock, input, progress);
  // Publication is evidence only for the planned event at the same frame.
  const fps = options.fps || input.currentSpec?.fps || clock.fps;
  const plan = new Map(frameSet.published.map(frame => [frame.id, { ...frame, state: frame.file ? frame.state : 'planned' }]));
  for (const row of Array.isArray(setup.framePlan) ? setup.framePlan : []) {
    if (!row?.id || !isRealTime(row.time) || row.time < 0 || (clock.duration && row.time >= clock.duration)) continue;
    const actual = plan.get(row.id);
    if (actual && Math.round(actual.time * fps) === Math.round(row.time * fps) && actual.file) continue;
    if (actual?.file) plan.set(row.id + '@' + actual.time, actual);
    plan.set(row.id, { id: row.id, time: row.time, title: row.title || setup.labels[row.id] || row.id,
      state: ['running','rework'].includes(row.state) ? row.state : 'planned' });
  }
  const currentDesign = designPlan && productionProgress(root, designPlan, input, progress, verification, versions.renderRevision);
  const framePlan = (currentDesign?.framePlan ?? (designError ? [] : [...plan.values()])).sort((a,b) => a.time-b.time);
  const frames = designError ? [] : currentDesign ? framePlan.flatMap(frame => {
    const code = frame.artifacts.filter(row => row.source === 'code').at(-1);
    if (!code) return [];
    return [{ ...frame, file: code.file, title: setup.labels[frame.id] || frame.title,
      role: code.role === 'implementation' ? '工程实渲' : '代码设计帧' }];
  }) : frameSet.published;
  const segments = currentDesign?.segments ?? (designError ? [] : makeSegments(root, clock.duration, frames, input, verification, versions.renderRevision));
  const sampleRate = voiceMeta.sampleRateHz || 0;
  const voiceDuration = sampleRate ? voiceMeta.sampleCount / sampleRate : null;
  const clips = sampleRate ? (voiceMeta.clips || []).filter(row => Number.isInteger(row.targetRange?.startSample) && Number.isInteger(row.targetRange?.endSample))
    .map(row => ({ id: row.sourceId, t0: row.targetRange.startSample/sampleRate, t1: row.targetRange.endSample/sampleRate })) : [];
  const segmentCount = new Set(clips.map(row => row.id)).size;
  const review = (progress.stages || []).find(row => row.id === 'review');
  const exportFile = firstPresent(root, ['out/final.mp4']);
  // Older projects have no versioned export receipt. A known newer render input disqualifies that file.
  const exportTime = exportFile && fs.statSync(localFile(root,exportFile)).mtimeMs;
  const text = controlledTextState(root);
  const preview = progress.preview;
  const reviewAudioPath = finalReviewAudioPath(preview);
  const snapshotBrief = text && preview?.directory && optionalFile(root, `${preview.directory}/brief.md`);
  const previewText = snapshotBrief ? controlledTextState(path.dirname(snapshotBrief)) : null;
  const samePreviewText = previewText?.current && rendererTextFingerprint(root, text) === rendererTextFingerprint(path.dirname(snapshotBrief), previewText);
  const exportInputs = [setup.page, setup.mix, setup.subtitles, 'assets/clip-state.json','timeline.js', ...setup.extraSceneInputs,
    ...fs.readdirSync(root).filter(name=>/\.(m?js|css)$/.test(name))];
  if (text) {
    exportInputs.push(captionRuntime, textRuntime, ...text.fonts);
    // A newer preview may reflect the current text while the older MP4 still has the previous text.
    const previewPredatesExport = preview?.final && Date.parse(preview.publishedAt) <= exportTime;
    if (!samePreviewText || !previewPredatesExport) exportInputs.push('brief.md', textMap);
  }
  const exportCurrent = exportFile && !designError && !subtitleIssue && (!text || text.current)
    && exportInputs.every(file => !optionalFile(root, file) || fs.statSync(localFile(root, file)).mtimeMs <= exportTime);
  const exported = exportCurrent ? exportFile : null;
  const qa = firstPresent(root, ['qa/final/qa.json', 'qa/final.json']);
  const qaCurrent = exported && qa && fs.statSync(localFile(root, qa)).mtimeMs >= exportTime;
  const previewCurrent = preview?.final && (!text || text.current && samePreviewText);
  const checkedSegments = segments.filter(row => row.state === 'checked').length;
  const seams = currentDesign?.seams ?? (designError ? [] : frameSet.labeledShots.slice(1).map(shot => {
    const result = (verification.seams || []).find(row => row.renderRevision === versions.renderRevision &&
      row.time === shot.t0 && ['checked','rework'].includes(row.state) && optionalFile(root, row.file));
    return { id: shot.id, time: shot.t0, title: shot.title, state: result?.state || 'waiting',
      ...(result ? { proof: projectUrl(result.file), note: result.note } : {}) };
  }));
  const catalog = read(root,'assets/workbench/clips.json',{}), edits = read(root,'assets/clip-state.json',{}).edits || {};
  const visualUses = (catalog.clips || []).filter(c=>['video','animation'].includes(c.kind));
  function frameUses(event,time) {
    const unit = designPlan?.units.find(u=>u.frames.some(f=>f.id===event));
    return visualUses.filter(c=>c.t0<=time && time<c.t1 && (!unit?.clipIds?.length || unit.clipIds.includes(c.id)));
  }
  const materials = materialViews({ root, setup, input, progress, catalog, edits,
    applies: (id,time) => { const uses = frameUses(id,time); return !uses.length || uses.some(c=>!edits[c.id]?.deleted && !edits[c.id]?.hidden); },
    activePlan: designError ? [] : currentDesign?.framePlan ?? (setup.framePlan.length ? setup.framePlan : null),
    validTime: t => Number.isFinite(t) && t>=0 && t<clock.duration, url:projectUrl, exists:file=>optionalFile(root,file) });
  const covers = materials.designFrames.map(f=>({name:f.title,href:f.file,time:f.time}));
  if (exportFile && !exported) materials.history.unshift({name:'前次导出的成片',kind:'历史导出',href:projectUrl(exportFile)});
  const implementationFrames = materials.designFrames.filter(f=>{
    if (!setup.page || clock.draft || designError) return false;
    const unit = designPlan?.units.find(u=>u.id===f.unitId);
    if (unit && (unit.timeState!=='bound' || unit.issues.length)) return false;
    if (visualUses.length) return frameUses(f.id,f.time).some(c=>!edits[c.id]?.deleted && !edits[c.id]?.hidden);
    return clock.shots.some(c=>c.t0<=f.time && f.time<c.t1);
  });
  const chapterLink = read(root,'chapter-navigation.json',{}).playerPath;
  const axisRequested = setup.chapterAxis ?? Boolean(setup.chapterPlan.length || chapterLink || optionalFile(root,'chapter-metadata.json'));
  const chapterIndex = read(root, 'chapter-metadata.json', null) || read(root,'chapter-index.json',{});
  const chapterAxis = axisRequested ? (chapterIndex.chapters || (setup.chapterPlan.length ? setup.chapterPlan : clock.chapters)).flatMap(row=>{
    const first=clock.chapters.find(c=>c.id===(row.startEventId||row.id));
    const last=clock.chapters.find(c=>c.id===(row.endEventId||row.id));
    const title=row.title||setup.labels[row.id]||row.id;
    if(first && last && last.t1>first.t0) return [{id:row.id,title,t0:first.t0,t1:last.t1,bound:true}];
    const a=captions.find(c=>c.id===String(row.firstCue)), b=captions.find(c=>c.id===String(row.lastCue));
    return a && b && b.t1>a.t0 ? [{id:row.id,title,t0:a.t0,t1:b.t1,bound:false}] : [];
  }) : [];
  const brief = optionalFile(root, 'brief.md') ? 'brief.md' : null;
  const registeredVoice = catalog.clips?.some(c=>c.kind==='voice');
  const voiceInfo = registeredVoice ? materials.sound.voice.length+' 段本版配音' : [segmentCount ? segmentCount + ' 段新配音' : '', voiceDuration ? voiceDuration.toFixed(3) + ' 秒' : ''].filter(Boolean).join(' · ');
  const unbound = designPlan?.units.filter(unit => unit.timeState !== 'bound' || unit.issues.length).length ?? 0;
  const stages = [
    stageRow('input', '采用的输入素材', materials.inputs.some(a=>a.uses.length) ? 'ready' : 'waiting',
      materials.inputs.some(a=>a.uses.length) ? '本版片段正在调用的用户素材' : '暂无已关联到本版片段的用户输入'),
    stageRow('voice', '配音', (registeredVoice ? materials.sound.voice.length : setup.voicePath) ? 'ready' : 'waiting', voiceInfo || '等候完整旁白', registeredVoice ? null : setup.voicePath),
    stageRow('srt', '字幕', subtitleIssue ? 'rework' : captions.length ? 'ready' : 'waiting',
      subtitleIssue || (captions.length ? `${captions.length} 条 ${setup.explicitCaptions?.kind ?? 'SRT'}${setup.explicitCaptions ? ' · Brief 登记的字幕源已校验' : nativeSubtitlesMatch ? ' · 与工程登记的字幕清单逐条一致' : setup.subtitleSources.length ? ' · 未登记用于对照的原生字幕清单' : ''}` : '等候字幕'), setup.subtitles),
    stageRow('brief', 'Brief', designError || designPlan?.issues.length ? 'rework' : unbound ? 'checking' : brief ? 'ready' : 'waiting',
      designError || designPlan?.issues.join('、') || (projectPhase === 'explore' ? '方向探索 Brief · 全片设计待补齐' : designPlan ? `${designPlan.units.length} 个登记片段${unbound ? ` · ${unbound} 段成片时码待对齐` : ''}` : brief ? '工程说明与文字登记已落盘' : '等候工程说明'), brief),
    ...(axisRequested ? [stageRow('chapters','章节轴',chapterAxis.length?'ready':'waiting',chapterAxis.length ? chapterAxis.length+' 个章节' : '等候章节时点')] : []),
    stageRow('cover', '关键帧', !covers.length ? 'waiting' : implementationFrames.length ? 'review' : 'running',
      covers.length ? covers.length+' 张设计帧 · '+implementationFrames.length+' 张可对照的实现帧' : '等候本版设计帧'),
    stageRow('motion', '分段动画制作', segments.some(row => row.state === 'rework') ? 'rework' : checkedSegments ? 'checking' : 'review',
      '按 Brief 片段回放当前工程'),
    ...[['music','音乐'],['sfx','音效']].map(([id,name])=>stageRow(id,name,materials.sound[id].length?'ready':'waiting',
      materials.sound[id].length ? materials.sound[id].length+' 段已用于本版混音' : '暂无本版采用片段')),
    stageRow('mix', '混音', setup.mix ? 'ready' : 'waiting',
      setup.mix ? audioMix.master ? `${audioMix.master.integratedLUFS} LUFS · ${audioMix.master.truePeakDbTP} dBTP` : '工程音轨可播放' : '等候完整混音', setup.mix),
    stageRow('export', '成片评审 / 导出', qaCurrent ? 'checking' : exported || previewCurrent ? 'review' : review?.status === 'running' ? 'checking' : 'waiting',
      exported ? '成片文件已落盘，可打开评审' : review?.message || '等候本版审片和导出', exported),
  ];
  return {
    executionStages: Object.fromEntries((progress.stages || []).map(row => [
      ({style:'cover',scenes:'motion',narration:'voice',audio:'mix',review:'export'})[row.id] || row.id, row.status])),
    publishedShots: (progress.shots || []).filter(s=>s.preview?.directory && optionalFile(root,s.preview.directory+'/index.html')).map(s=>s.id),
    ...versions, title: setup.title, page: setup.page && projectUrl(setup.page), duration: clock.duration, projectPhase, directionSamples,
    directionConfirmationRecorded: frameSet.currentConfirmation,
    finalReviewAudio: previewCurrent && reviewAudioPath && optionalFile(root, reviewAudioPath) ? projectUrl(reviewAudioPath) : null,
    fps: options.fps || input.currentSpec?.fps || clock.fps, size: options.size || input.currentSpec?.size || '1920x1080', draft: clock.draft,
    activeStage: ['style','cover','code'].includes(progress.current) ? 'cover' : stages.find(row => row.state === 'rework')?.id || progress.current,
    subtitles: !subtitleIssue && setup.subtitles ? projectUrl(setup.subtitles) : null,
    subtitleSources: setup.subtitleSources.map(projectUrl), captions, frames, framePlan, shots: frameSet.labeledShots, segments, seams,
    designPlan, designError,
    voice: setup.voicePath && { url: projectUrl(setup.voicePath), version: statKey(root, [setup.voicePath])[0]?.[1],
      duration: voiceDuration, clips },
    mix: setup.mix && { url: projectUrl(setup.mix), version: statKey(root, [setup.mix])[0]?.[1] },
    covers, materials, implementationFrames, chapterAxis, stages, legacy: '/legacy-progress', brief: brief && projectUrl(brief),
    chapters: firstPresent(root, ['chapter-index.html']) && projectUrl('chapter-index.html'),
    exported: exported && projectUrl(exported),
  };
}

export function visibleProjectFile(root, setup, relative) {
  const names = relative.split('/');
  const metadata = [textMap, textCoverage, captionRuntime, textRuntime, inputPath];
  const canonical = [setup.subtitles, ...setup.subtitleSources, setup.voicePath, setup.mix, setup.voiceReceipt, setup.mixReceipt, trackReceipt,
    ...setup.covers.map(row => row.file), ...setup.extraSceneInputs];
  const uploaded = relative.startsWith(inputFolder+'/') && names.length===3 && /^[a-f0-9]{64}-/.test(names[2]) && Boolean(mediaTypes[path.extname(relative).toLowerCase()]);
  const mutableArtifact = /^\.showreel-progress\/artifacts\/[a-f\d]+\.(png|webp|jpg|jpeg|wav|mp3|mp4)$/i.test(relative);
  const publicRoot = new Set(['assets', 'visual', 'fonts', 'media', 'images', 'shots', 'qa', 'out']);
  if (names.some(name => name === '..' || /^\.env(\.|$)/i.test(name)) || /\.(key|pem|p12)$/i.test(relative)) return null;
  const threeModule = /^vendor\/three\/(?:build|examples\/jsm)\/.+\.(?:js|wasm)$/u.test(relative)
    && names.every(name => name && !name.startsWith('.'));
  const finalAudio = names[0] === '.showreel-progress' && names[1] === 'revisions'
    && finalReviewAudioPath(read(root, progressPath, {})?.preview) === relative;
  const allowed = names.length === 1 && !relative.startsWith('.') || metadata.includes(relative) || canonical.includes(relative) || finalAudio ||
    uploaded || setup.userInputs?.some(a=>a.file===relative && mediaTypes[path.extname(relative).toLowerCase()]) || mutableArtifact || threeModule || publicRoot.has(names[0]) && names.every(name => !name.startsWith('.'));
  return allowed ? optionalFile(root, relative) : null;
}
