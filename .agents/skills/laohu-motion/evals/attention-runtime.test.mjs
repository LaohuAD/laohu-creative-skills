import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {managedMotionBrowserExecutableCandidates, resolveMotionRuntime} from '../scripts/laohu-motion-runtime.mjs';
import {projectShotWebpackAliases} from '../templates/adapters/laohu-project-shot.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tmpRoot = path.join(repoRoot, '.cache/tmp/motion-attention-handoff/runtime');
const evidenceRoot = path.join(repoRoot, '.cache/validation/motion-attention-handoff/runtime');
const width = 320;
const height = 180;
const fps = 10;

function existingExecutable(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      if (fs.statSync(candidate).isFile() && (fs.statSync(candidate).mode & 0o111)) return path.resolve(candidate);
    } catch { /* try the next already-installed executable */ }
  }
  return null;
}

function workingExecutable(candidates, args) {
  for (const candidate of candidates.filter(Boolean)) {
    const executable = existingExecutable([candidate]);
    if (!executable) continue;
    const result = spawnSync(executable, args, {encoding: 'utf8', stdio: 'ignore'});
    if (result.status === 0) return executable;
  }
  return null;
}

function rgbaFrame(file, ffmpeg) {
  const result = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], {
    encoding: null,
    maxBuffer: width * height * 4 + 1024,
  });
  assert.equal(result.status, 0, `FFmpeg could not decode ${path.basename(file)}: ${result.stderr?.toString('utf8')}`);
  assert.equal(result.stdout.length, width * height * 4, `${path.basename(file)} must decode to one ${width}×${height} RGBA frame`);
  return result.stdout;
}

function pixel(frame, x, y) {
  const offset = (y * width + x) * 4;
  return [...frame.subarray(offset, offset + 4)];
}

function changedPixelCount(left, right) {
  assert.equal(left.length, right.length);
  let changed = 0;
  for (let offset = 0; offset < left.length; offset += 4) {
    if (left[offset] !== right[offset] || left[offset + 1] !== right[offset + 1]
      || left[offset + 2] !== right[offset + 2] || left[offset + 3] !== right[offset + 3]) changed += 1;
  }
  return changed;
}

function countPixels(frame, x1, y1, x2, y2, predicate) {
  let count = 0;
  for (let y = y1; y < y2; y += 1) for (let x = x1; x < x2; x += 1) {
    if (predicate(pixel(frame, x, y))) count += 1;
  }
  return count;
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

test('AttentionBridge and Captions render compiler-shaped unit schedules in the actual Remotion browser', {timeout: 180_000}, async () => {
  await fs.promises.mkdir(tmpRoot, {recursive: true});
  await fs.promises.mkdir(evidenceRoot, {recursive: true});
  const runtime = resolveMotionRuntime({
    packages: ['@remotion/bundler', '@remotion/renderer'],
    expectedVersions: {'@remotion/bundler': '4.0.537', '@remotion/renderer': '4.0.537'},
    projectRoot: repoRoot,
    skillRoot: path.join(repoRoot, '.agents/skills/laohu-motion'),
    workRoot: repoRoot,
  });
  const browser = existingExecutable([
    process.env.MOTION_BROWSER,
    process.env.MOTION_CHROME,
    process.env.CHROME_PATH,
    ...managedMotionBrowserExecutableCandidates({workRoot: repoRoot, runtimeRoot: runtime.runtimeRoot}),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]);
  const ffmpeg = workingExecutable([process.env.MOTION_FFMPEG, '/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg'], ['-version']);
  assert.ok(browser, 'an already-installed Remotion/Chrome browser is required; this test never installs or downloads one');
  assert.ok(ffmpeg, 'an already-installed FFmpeg is required to inspect rendered pixels; this test never installs one');

  const runId = `${Date.now()}-${process.pid}-${randomBytes(3).toString('hex')}`;
  const runRoot = await fs.promises.mkdtemp(path.join(tmpRoot, `attention-${runId}-`));
  const publicDir = path.join(runRoot, 'public');
  await fs.promises.mkdir(publicDir, {recursive: true});
  const entryPath = path.join(runRoot, 'attention-runtime-entry.tsx');
  const source = `import React from 'react';
import {AbsoluteFill, Composition, registerRoot} from 'remotion';
import {Core} from '@laohu/motion';

const rate = 10;
const captionStyle = {
  textStyleId: 'runtime-test-style', function: 'subtitle', spatialRelation: 'screen-overlay',
  temporalBehavior: 'caption-manifest-display-window', coordinateSpace: 'output-pixels',
  x: 12, y: 12, width: 136, height: 52, zIndex: 20, alignment: 'left',
  background: 'rgba(0,0,0,0.85)', paddingPx: 4, maxLines: 2,
  fontFamily: 'Arial', fontWeight: 700, sizePx: 18, color: '#ffffff', lineHeight: 1.2, letterSpacing: 0,
};
const manifest = {
  format: 'laohu.asrcut.caption-manifest/1',
  sourceClock: {sampleRateHz: rate},
  cues: [
    {id: 'caption-a', lines: ['ALPHA'], displayWindow: {startSample: 10, endSample: 20, sampleRateHz: rate}},
    {id: 'caption-b', lines: ['RETAIN', 'REFERENCE'], displayWindow: {startSample: 25, endSample: 35, sampleRateHz: rate}},
  ],
};
const cameraA = [
  {at: 0, center: [0, 0], zoom: 1, rotation: 0, stop: true},
  {at: 1, center: [40, 0], zoom: 1, rotation: 0, stop: true},
  {at: 2.5, center: [40, 0], zoom: 1, rotation: 0, stop: true},
];
const cameraB = [
  {at: 2.5, center: [40, 0], zoom: 1, rotation: 0, stop: true},
  {at: 4, center: [80, 0], zoom: 1, rotation: 0, stop: true},
];
const actor = (color) => <div style={{width: '100%', height: '100%', background: color}} />;
const unitA = [
  {
    id: 'unit-a-phase', start: 0, end: 2.5,
    mainTask: {id: 'compare-pair', description: 'Read the red object with its blue screen reference', actorIds: ['world-red', 'screen-blue']},
    cameraKeys: cameraA,
    readingZones: [{id: 'caption-a-zone', windowId: 'caption-a', textCueIds: ['caption-a'], x: 245, y: 85, width: 10, height: 10, padding: 0, feather: 1, floor: 0.1}],
    readWindows: [{id: 'caption-a', taskId: 'compare-pair', groupId: 'caption-a-group', captionCueIds: ['caption-a'], screenTextIds: [], start: 1, end: 2, basis: 'canonical-display-window', reason: 'Read the caption while retaining the comparison context.'}],
    // The speech anchor ends at t=2.0; this compiler-shaped runtime row retains the completed picture to the next phase at t=2.5.
    actorBindings: [
      {actorId: 'world-red', role: 'target', owner: 'unit-a-phase', consumer: 'laohu-motion.attention-actor-style/1', props: {
        x: -50, y: 0, width: 32, height: 24, scale: 1, rotation: 0, opacity: 0.45, visible: true, coordinateSpace: 'world', depth: 2, focusDepth: 2,
      }},
      {actorId: 'screen-blue', role: 'target', owner: 'unit-a-phase', consumer: 'laohu-motion.attention-actor-style/1', props: {
        x: 48, y: 90, width: 24, height: 18, scale: 1, rotation: 0, opacity: 1, visible: true, coordinateSpace: 'screen',
      }},
      {actorId: 'old-yellow', role: 'retire', owner: 'unit-a-phase', consumer: 'laohu-motion.attention-actor-style/1', props: {
        x: 270, y: 140, width: 20, height: 16, scale: 1, rotation: 0, opacity: 0, visible: false, coordinateSpace: 'screen',
      }},
      {actorId: 'context-red', role: 'context', owner: 'unit-a-phase', consumer: 'laohu-motion.attention-actor-style/1', props: {
        x: 250, y: 90, width: 24, height: 18, scale: 1, rotation: 0, opacity: 0.45, visible: true, coordinateSpace: 'screen', readingPoint: [250, 90], readingPointSpace: 'screen',
      }},
    ],
  },
];
const unitB = (focusDepth) => [
  {
    id: 'unit-b-phase', start: 2.5, end: 4,
    mainTask: {id: 'read-conclusion', description: 'Read the conclusion while the prior relation remains visible', actorIds: ['screen-green']},
    cameraKeys: cameraB, readingZones: [], readWindows: [],
    actorBindings: [
      {actorId: 'world-red', role: 'context', owner: 'unit-b-phase', consumer: 'laohu-motion.attention-actor-style/1', props: {
        x: -50, y: 0, width: 32, height: 24, scale: 1, rotation: 0, opacity: 0.16, visible: true, coordinateSpace: 'world', depth: 2, focusDepth,
      }},
      {actorId: 'screen-blue', role: 'retire', owner: 'unit-b-phase', consumer: 'laohu-motion.attention-actor-style/1', props: {
        x: 48, y: 90, width: 24, height: 18, scale: 1, rotation: 0, opacity: 0, visible: false, coordinateSpace: 'screen',
      }},
      {actorId: 'screen-green', role: 'target', owner: 'unit-b-phase', consumer: 'laohu-motion.attention-actor-style/1', props: {
        x: 210, y: 90, width: 30, height: 22, scale: 1, rotation: 0, opacity: 1, visible: true, coordinateSpace: 'screen', depth: 1, focusDepth: 1,
      }},
    ],
  },
];
const ScreenCaptions = ({offset}) => <Core.Captions manifest={manifest} style={captionStyle} globalFromSeconds={offset} />;
const UnitA = ({focusDepth = 2}) => <AbsoluteFill style={{background: '#080808'}}>
  <Core.AttentionBridge phases={unitA} globalFromSeconds={0} width={320} height={180}
    actors={[{id: 'world-red', node: actor('#ff2020')}, {id: 'screen-blue', node: actor('#2060ff')}, {id: 'old-yellow', node: actor('#ffff20')}, {id: 'context-red', node: actor('#ff2020')}]} screen={<ScreenCaptions offset={0} />} />
</AbsoluteFill>;
const UnitB = ({focusDepth = 0}) => <AbsoluteFill style={{background: '#080808'}}>
  <Core.AttentionBridge phases={unitB(focusDepth)} globalFromSeconds={2.5} width={320} height={180}
    actors={[{id: 'world-red', node: actor('#ff2020')}, {id: 'screen-blue', node: actor('#2060ff')}, {id: 'screen-green', node: actor('#20ff40')}]} screen={<ScreenCaptions offset={2.5} />} />
</AbsoluteFill>;
const Root = () => <>
  <Composition id="AttentionUnitA" component={UnitA} width={320} height={180} fps={10} durationInFrames={30} defaultProps={{focusDepth: 2}} />
  <Composition id="AttentionUnitB" component={UnitB} width={320} height={180} fps={10} durationInFrames={30} defaultProps={{focusDepth: 0}} />
</>;
registerRoot(Root);
`;
  await fs.promises.writeFile(entryPath, source, {flag: 'wx'});
  const runtimeRequire = runtime.require;
  const {bundle} = runtimeRequire('@remotion/bundler');
  const {renderStill, selectComposition} = runtimeRequire('@remotion/renderer');
  const aliases = projectShotWebpackAliases({module: {absolutePath: entryPath}, runtimePackages: []}, {
    runtimeRoot: runtime.runtimeRoot,
    nodeModules: runtime.nodeModules,
  });
  let serveUrl;
  const evidence = {
    format: 'laohu.motion.attention-runtime-render-evidence/1',
    testFile: '.agents/skills/laohu-motion/evals/attention-runtime.test.mjs',
    browser: path.relative(repoRoot, browser).split(path.sep).join('/'),
    ffmpeg: path.relative(repoRoot, ffmpeg).split(path.sep).join('/') || ffmpeg,
    runtime: runtime.packages,
    input: {
      publicImport: '@laohu/motion -> Core.AttentionBridge + Core.Captions',
      output: {width, height, fps},
      unitA: {phase: 'unit-a-phase', sourceSpeechEndSeconds: 2, runtimeEndSeconds: 2.5, visualHold: 'retain-until-next-phase', globalFromSeconds: 0},
      unitB: {phase: 'unit-b-phase', startSeconds: 2.5, globalFromSeconds: 2.5},
      captions: manifestCueSummary(),
    },
    observations: {},
    frames: {},
  };

  async function capture(id, frameNumber, props, name) {
    const composition = await selectComposition({serveUrl, id, inputProps: props, browserExecutable: browser, logLevel: 'error'});
    const output = path.join(evidenceRoot, `attention-runtime-${runId}-${name}.png`);
    await renderStill({serveUrl, composition, inputProps: props, frame: frameNumber, output, imageFormat: 'png', browserExecutable: browser, logLevel: 'error', overwrite: false});
    const bytes = await fs.promises.readFile(output);
    evidence.frames[name] = {path: path.relative(repoRoot, output).split(path.sep).join('/'), sha256: sha256(bytes), frame: frameNumber, globalSeconds: frameNumber / fps + (id === 'AttentionUnitB' ? 2.5 : 0)};
    return {output, bytes, rgba: rgbaFrame(output, ffmpeg)};
  }

  try {
    serveUrl = await bundle({
      entryPoint: entryPath,
      outDir: path.join(runRoot, 'bundle'),
      publicDir,
      rootDir: repoRoot,
      enableCaching: false,
      webpackOverride: (config) => {
        config.resolve ||= {};
        config.resolve.modules = [...(config.resolve.modules || []), runtime.nodeModules];
        config.resolve.alias = {...(config.resolve.alias || {}), ...aliases};
        return config;
      },
    });
    const initial = await capture('AttentionUnitA', 0, {focusDepth: 2}, 'unit-a-start');
    const captionA = await capture('AttentionUnitA', 10, {focusDepth: 2}, 'unit-a-caption');
    const readingWindowActive = await capture('AttentionUnitA', 15, {focusDepth: 2}, 'unit-a-reading-window-active');
    const visualHold = await capture('AttentionUnitA', 20, {focusDepth: 2}, 'unit-a-natural-gap');
    const nextUnit = await capture('AttentionUnitB', 0, {focusDepth: 0}, 'unit-b-global-offset');
    const focusControl = await capture('AttentionUnitB', 0, {focusDepth: 2}, 'unit-b-rack-focus-control');

    const red = (rgba) => rgba[0] > 25 && rgba[0] > rgba[1] * 1.7 && rgba[0] > rgba[2] * 1.7;
    const blue = (rgba) => rgba[2] > 120 && rgba[2] > rgba[0] * 1.7;
    const green = (rgba) => rgba[1] > 120 && rgba[1] > rgba[0] * 1.7;
    assert.ok(red(pixel(initial.rgba, 110, 90)), 'world-space actor must be visibly rendered at the initial camera pose');
    assert.ok(blue(pixel(initial.rgba, 48, 90)), 'screen-space actor must be visible at its output-pixel position');
    assert.ok(red(pixel(visualHold.rgba, 70, 90)), 'the runtime schedule must retain the completed phase picture across the canonical gap');
    assert.ok(blue(pixel(visualHold.rgba, 48, 90)), 'the screen-space actor must stay at the same output position while the camera moves');
    assert.deepEqual(pixel(initial.rgba, 110, 90), pixel(visualHold.rgba, 70, 90), 'the actor must retain the same rendered opacity and geometry through the canonical gap');
    assert.ok(pixel(visualHold.rgba, 70, 90)[0] > pixel(nextUnit.rgba, 70, 90)[0], 'the next unit must consume its changed context opacity instead of replaying the prior phase binding');
    assert.ok(pixel(initial.rgba, 270, 140)[0] < 30, 'the retired actor must not draw pixels at its declared output position');
    assert.ok(countPixels(captionA.rgba, 12, 12, 148, 64, ([r, g, b]) => r > 210 && g > 210 && b > 210) > 12,
      'Captions must draw the manifest line inside the resolved D3 output-pixel style region');
    assert.equal(countPixels(visualHold.rgba, 12, 12, 148, 64, ([r, g, b]) => r > 210 && g > 210 && b > 210), 0,
      'the caption must be absent after its manifest display window even while the prior picture is held');
    assert.ok(green(pixel(nextUnit.rgba, 210, 90)), 'the second viewing-unit phase must become active at its compiler-supplied global offset');
    assert.ok(!blue(pixel(nextUnit.rgba, 48, 90)), 'the prior unit screen actor must retire when the next unit mapping is active');
    const cueBFirstLinePixels = countPixels(nextUnit.rgba, 12, 12, 148, 38, ([r, g, b]) => r > 210 && g > 210 && b > 210);
    const cueBSecondLinePixels = countPixels(nextUnit.rgba, 12, 38, 148, 64, ([r, g, b]) => r > 210 && g > 210 && b > 210);
    assert.ok(cueBFirstLinePixels > 5 && cueBSecondLinePixels > 5,
      'both explicit manifest lines must be visible inside the measured D3 caption region at the global offset');
    const rackFocusDifference = changedPixelCount(nextUnit.rgba, focusControl.rgba);
    assert.ok(rackFocusDifference > 10, `nonzero actor dimensions with depth/focusDepth must reach RackFocus and alter rendered pixels (observed ${rackFocusDifference})`);
    const readingZoneBefore = pixel(initial.rgba, 250, 90);
    const readingZoneDuring = pixel(readingWindowActive.rgba, 250, 90);
    const readingZoneAfter = pixel(visualHold.rgba, 250, 90);
    assert.ok(readingZoneDuring[0] < readingZoneBefore[0] * 0.5,
      `the context actor inside an active reading window must be attenuated (before=${readingZoneBefore[0]}, during=${readingZoneDuring[0]})`);
    assert.deepEqual(readingZoneAfter, readingZoneBefore, 'reading-zone attenuation must be removed at the half-open read-window end');

    evidence.observations = {
      worldActorInitial: {sample: [110, 90], rgba: pixel(initial.rgba, 110, 90)},
      worldActorAfterCameraPanAndGapHold: {sample: [70, 90], rgba: pixel(visualHold.rgba, 70, 90)},
      screenActorBeforeAndAfterCameraPan: {sample: [48, 90], before: pixel(initial.rgba, 48, 90), after: pixel(visualHold.rgba, 48, 90)},
      retiredActorSample: {sample: [270, 140], rgba: pixel(initial.rgba, 270, 140)},
      captionWhitePixelCount: {
        cueA: countPixels(captionA.rgba, 12, 12, 148, 64, ([r, g, b]) => r > 210 && g > 210 && b > 210),
        gapAfterCueA: countPixels(visualHold.rgba, 12, 12, 148, 64, ([r, g, b]) => r > 210 && g > 210 && b > 210),
        cueB: {
          firstLine: cueBFirstLinePixels,
          secondLine: cueBSecondLinePixels,
        },
      },
      rackFocusChangedPixels: rackFocusDifference,
      readingWindowOpacity: {
        window: {id: 'caption-a', start: 1, end: 2, basis: 'canonical-display-window'},
        sample: [250, 90],
        before: readingZoneBefore,
        during: readingZoneDuring,
        after: readingZoneAfter,
      },
      scope: 'Actual Remotion Chromium renderStill frames and decoded RGBA pixels; this is technical consumer evidence, not aesthetic or audience-quality evidence.',
    };
    const evidencePath = path.join(evidenceRoot, `attention-runtime-evidence-${runId}.json`);
    await fs.promises.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {flag: 'wx'});
    assert.ok(fs.existsSync(evidencePath));
  } finally {
    await fs.promises.rm(runRoot, {recursive: true, force: true});
  }
});

function manifestCueSummary() {
  return [
    {id: 'caption-a', displayWindow: [1, 2], lines: ['ALPHA']},
    {id: 'caption-b', displayWindow: [2.5, 3.5], lines: ['RETAIN', 'REFERENCE']},
  ];
}
