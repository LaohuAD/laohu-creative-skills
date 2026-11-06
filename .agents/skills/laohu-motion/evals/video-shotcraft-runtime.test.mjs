import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {__test as Shotcraft} from '../templates/adapters/video-shotcraft-remotion.mjs';
import {compilePlan, freezePlan, hashPlan, importAsrJson} from '../../laohu-asrcut/scripts/asrcut.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, '.agents/skills/laohu-motion/templates/catalog.json'), 'utf8'));
const blueprintPath = path.join(repoRoot, '.cache/validation/video-shotcraft/2026-11-02/runtime/compile-fixture.json');
const entry = (id) => catalog.templates.find((row) => row.id === id);
const grain = entry('video-shotcraft-grain-dissolve');

function grainSegment(id, startSec, endSec, extra = {}) {
  return {
    id, renderer: 'video-shotcraft-remotion', sourceCatalogId: grain.id,
    componentPath: grain.component.path, componentSha256: grain.component.sha256,
    exportName: grain.component.exportName, sourceCommit: '1266a3ec4831289c4d893d42dd5102723658039a',
    sourceDurationFrames: 60, fidelityMode: 'exact-baseline', props: {},
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
  assert.deepEqual(schedule.rows[0].layers[0].props, {});
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
  await assert.rejects(compile(grainFilm({segments: [{...base[0], endSec: 1.9}, base[1]]})), /complete source duration/);
  await assert.rejects(compile(grainFilm({segments: [{...base[0], fidelityMode: 'derived-patch'}, base[1]]})), /does not support fidelityMode/);
  await assert.rejects(compile(grainFilm({segments: [{...base[0], sourceDurationFrames: 59}, base[1]]})), /cataloged native baseline duration/);
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
      : {};
    const seconds = duration / 30;
    const sourceSegment = {
      id, renderer: 'video-shotcraft-remotion', sourceCatalogId: id,
      componentPath: source.component.path, componentSha256: source.component.sha256,
      exportName: source.component.exportName, sourceCommit: '1266a3ec4831289c4d893d42dd5102723658039a',
      sourceDurationFrames: duration, fidelityMode: 'exact-baseline', compositionGroupId: 'source',
      startSec: 0, endSec: seconds, layers: [{catalogId: id, props, placement: rect}],
    };
    await assert.rejects(compile(grainFilm({
      segments: [sourceSegment], compositionGroups: [{id: 'source', segmentIds: [id]}], durationSec: seconds,
    })), /does not support local placement/);
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

test('gallery PaperTitleCard derived-copy patch is pinned, narrowly consumed, time-safe, and available in single and film routes', async () => {
  const gallery = entry('video-shotcraft-paper-title-card-gallery');
  const patch = {id: 'paper-title-card-copy', words: [{text: 'Learn'}, {text: 'clearly', accent: true}], sub: 'A model learns from examples', subDigits: '12'};
  const provider = await Shotcraft.verifyDerivedPatchProvider(gallery);
  const source = fs.readFileSync(path.join(repoRoot, '.agents/skills/laohu-motion/templates/upstream/video-shotcraft', gallery.component.path), 'utf8');
  const derived = fs.readFileSync(path.join(repoRoot, '.agents/skills/laohu-motion', gallery.derivedProvider.entrypoint), 'utf8');
  assert.equal(derived, Shotcraft.transformGalleryCopySource(source));
  assert.equal(provider.sourceSha256, gallery.component.sha256);
  assert.equal(provider.sha256, gallery.derivedProvider.sha256);

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
  await assert.rejects(Shotcraft.verifyDerivedPatchProvider(wrongParent), /parent lock differs/);

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

