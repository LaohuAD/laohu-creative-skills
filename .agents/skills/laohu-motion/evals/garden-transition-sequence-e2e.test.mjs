import assert from "node:assert/strict";
import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {loadMotionPackage} from "../scripts/laohu-motion-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const skillDir = path.join(root, ".agents", "skills", "laohu-motion");
const renderCli = path.join(skillDir, "scripts", "render.mjs");
const require = createRequire(import.meta.url);
const recipeAdapter = require("../templates/adapters/laohu-motion-recipes.js");
const ffmpeg = process.env.MOTION_FFMPEG || "/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg";
const ffprobe = process.env.MOTION_FFPROBE || path.join(path.dirname(ffmpeg), "ffprobe");
const browser = process.env.MOTION_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const validationRoot = process.env.MOTION_VALIDATION_DIR
  ? path.resolve(process.env.MOTION_VALIDATION_DIR)
  : path.join(root, ".cache", "validation", "motion-production-integration", "runtime");
const tmpRoot = process.env.TMPDIR
  ? path.resolve(process.env.TMPDIR)
  : path.join(root, ".cache", "tmp", "motion-production-integration", "runtime");

function run(command, args, label, {env = {}, timeout = 120_000} = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024,
    env: {...process.env, ...env},
  });
  assert.equal(result.error, undefined, `${label}: ${result.error?.message || "process could not start"}`);
  assert.equal(result.status, 0, `${label} failed (status=${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result.stdout;
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, {flag: "wx"});
  return file;
}

async function renderScene({scene, scenePath, outputPath, cacheDir, name}) {
  await writeJson(scenePath, scene);
  await fs.mkdir(cacheDir, {recursive: true});
  const stdout = run(process.execPath, [
    renderCli, "--scene", scenePath, "--output", outputPath, "--cache-dir", cacheDir,
    "--browser", browser, "--ffmpeg", ffmpeg,
  ], `${name} render`, {timeout: 180_000});
  const manifestPath = /^MANIFEST\s+(.+)$/m.exec(stdout)?.[1]?.trim();
  assert.ok(manifestPath, `${name} render did not report its manifest\n${stdout}`);
  return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

async function browserAssetForSequence(sequence) {
  const manifestBytes = await fs.readFile(sequence.manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const frames = [];
  let totalEncodedBytes = 0;
  for (const framePath of manifest.frames) {
    const file = path.resolve(path.dirname(sequence.manifestPath), framePath);
    const bytes = await fs.readFile(file);
    totalEncodedBytes += bytes.length;
    frames.push({path: framePath, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length,
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`});
  }
  return {type: "source-frame-sequence", path: sequence.path,
    manifestSha256: crypto.createHash("sha256").update(manifestBytes).digest("hex"),
    fps: manifest.fps, frameCount: frames.length, width: manifest.width, height: manifest.height,
    totalEncodedBytes, decodedFrameBytes: manifest.width * manifest.height * 4,
    decodedCacheBudgetBytes: 64 * 1024 * 1024, frames};
}

async function randomSeekCanvasSamples({scene, recipe, sequences}) {
  const runtime = loadMotionPackage("playwright", {expectedVersions: {playwright: "1.55.0"}, projectRoot: root});
  const {chromium} = runtime.value;
  const context = await chromium.launch({executablePath: browser, headless: true, args: ["--disable-dev-shm-usage"]});
  try {
    const page = await context.newPage({viewport: {width: scene.width, height: scene.height}, deviceScaleFactor: 1});
    await page.setContent(`<canvas id="stage" width="${scene.width}" height="${scene.height}"></canvas>`);
    await page.addScriptTag({path: path.join(skillDir, "scripts", "motion-core.js")});
    await page.addScriptTag({path: path.join(skillDir, "scripts", "motion-ops.js")});
    await page.addScriptTag({path: path.join(skillDir, "templates", "adapters", "laohu-motion-recipes.js")});
    const records = recipeAdapter.validateScene(scene);
    const sourceFrames = {[recipe.id]: {from: await browserAssetForSequence(sequences.from), to: await browserAssetForSequence(sequences.to)}};
    await page.evaluate(({sceneValue, recipeRecords, assets}) => {
      window.MOTION_SCENE = sceneValue;
      window.MOTION_RECIPE_RECORDS = recipeRecords;
      window.MOTION_RECIPE_SOURCE_FRAMES = assets;
      window.MOTION_RENDERERS = {};
      window.LaohuMotionRecipes.register(window.MOTION_RENDERERS);
    }, {sceneValue: scene, recipeRecords: records, assets: sourceFrames});
    return await page.evaluate(async () => {
      const times = [0.7, 0.3, 0.7];
      const canvas = document.getElementById("stage");
      const pngs = [];
      for (const time of times) {
        await window.LAOHU_MOTION_PREPARE_FRAME(window.MOTION_SCENE, time);
        window.MotionCore.drawFrame(canvas, window.MOTION_SCENE, time, window.MOTION_RENDERERS, true);
        pngs.push(canvas.toDataURL("image/png"));
      }
      return {times, pngs, evidence: window.MOTION_RECIPE_EVIDENCE};
    });
  } finally {
    await context.close();
  }
}

function decodeRgbFrame(file, frameIndex = 0) {
  const args = ["-hide_banner", "-loglevel", "error", "-i", file];
  if (path.extname(file).toLowerCase() !== ".png") args.push("-vf", `select=eq(n\\,${frameIndex}),scale=64:36`);
  else args.push("-vf", "scale=64:36");
  args.push("-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1");
  const result = spawnSync(ffmpeg, args, {encoding: null, timeout: 30_000, maxBuffer: 64 * 36 * 3 + 1024});
  assert.equal(result.error, undefined, `decode ${file} frame ${frameIndex}: ${result.error?.message || "spawn failed"}`);
  assert.equal(result.status, 0, `decode ${file} frame ${frameIndex}: ${result.stderr?.toString("utf8")}`);
  assert.equal(result.stdout.length, 64 * 36 * 3, `decoded ${file} frame ${frameIndex} has wrong dimensions`);
  return result.stdout;
}

function meanAbsoluteDifference(left, right) {
  assert.equal(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index] - right[index]);
  return sum / left.length;
}

const sequencePanel = (file) => ({
  type: "source-frame-sequence", path: file,
  clock: {kind: "scene-local", sourceStartSec: 0, playbackRate: 1, endBehavior: "clamp"},
});

function fileExists(file) {
  try { fsSync.accessSync(file); return true; } catch { return false; }
}

test("Garden zoom-through and wipe preserve moving A/B source sequences through the browser renderer and encoded MP4", {
  skip: ![ffmpeg, ffprobe, browser].every(fileExists),
  timeout: 900_000,
}, async () => {
  await fs.mkdir(validationRoot, {recursive: true});
  await fs.mkdir(tmpRoot, {recursive: true});
  const suffix = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  const runRoot = path.join(tmpRoot, `garden-transition-sequence-${suffix}`);
  const sceneRoot = path.join(runRoot, "scenes");
  const outputsRoot = path.join(validationRoot, `garden-transition-sequence-${suffix}`);
  await fs.mkdir(sceneRoot, {recursive: true});
  await fs.mkdir(outputsRoot, {recursive: true});
  const env = {TMPDIR: tmpRoot, TMP: tmpRoot, TEMP: tmpRoot, MOTION_FFMPEG: ffmpeg, MOTION_FFPROBE: ffprobe, MOTION_BROWSER: browser};

  const sourceScene = (id, color, fromX, toX) => ({
    version: 1, width: 1920, height: 1080, fps: 30, duration: 1, timeBasis: "scene-local", background: color,
    objects: [{id: `${id}-moving-block`, type: "rect", space: "screen", x: fromX, y: 390, width: 240, height: 240, fill: "#f7f2e8"}],
    events: [{id: `${id}-travel`, target: {kind: "object", id: `${id}-moving-block`}, property: "x", start: 0, duration: 1, from: fromX, to: toX}],
  });
  const sourceResults = {};
  for (const source of [
    {id: "source-a", color: "#be263e", fromX: 180, toX: 1500},
    {id: "source-b", color: "#2458c6", fromX: 1500, toX: 180},
  ]) {
    const scenePath = path.join(sceneRoot, `${source.id}.scene.json`);
    const outputPath = path.join(outputsRoot, `${source.id}.mp4`);
    const cacheDir = path.join(sceneRoot, `cache-${source.id}`);
    const manifest = await renderScene({scene: sourceScene(source.id, source.color, source.fromX, source.toX), scenePath, outputPath, cacheDir, name: source.id});
    assert.equal(manifest.render.width, 1920);
    assert.equal(manifest.render.height, 1080);
    assert.equal(manifest.render.fps, 30);
    assert.equal(manifest.frameCount, 30);
    sourceResults[source.id] = {scenePath, outputPath, frameDirectory: manifest.frameDirectory};
  }

  const sequencePathFor = async (id) => {
    const source = sourceResults[id];
    const frames = Array.from({length: 30}, (_, index) => {
      const file = path.join(source.frameDirectory, `${String(index).padStart(8, "0")}.png`);
      return path.relative(sceneRoot, file).split(path.sep).join("/");
    });
    const manifestPath = path.join(sceneRoot, `${id}.sequence.json`);
    await writeJson(manifestPath, {format: "laohu.motion.source-frame-sequence/1", width: 1920, height: 1080, fps: 30, frames});
    return {path: path.basename(manifestPath), manifestPath};
  };
  const sequencePaths = {from: await sequencePathFor("source-a"), to: await sequencePathFor("source-b")};
  const recipes = [
    {
      id: "e2e-zoom-through", recipeId: "zoom-through",
      parameters: {startSec: 0.3, durationSec: 0.6, targetX: 960, targetY: 540, zoom: 2.2,
        from: sequencePanel(sequencePaths.from.path), to: sequencePanel(sequencePaths.to.path)},
    },
    {
      id: "e2e-wipe-reveal", recipeId: "wipe-reveal",
      parameters: {startSec: 0.3, durationSec: 0.6, slant: 42,
        from: sequencePanel(sequencePaths.from.path), to: sequencePanel(sequencePaths.to.path)},
    },
  ];
  const results = {};
  for (const recipe of recipes) {
    const scene = {
      version: 1, width: 1920, height: 1080, fps: 30, duration: 1, timeBasis: "scene-local", background: "#101014",
      objects: [{id: "transition-owner", type: "custom:laohu-motion-recipes", space: "screen", data: {motionRecipes: [recipe]}}],
    };
    const scenePath = path.join(sceneRoot, `${recipe.id}.scene.json`);
    const outputPath = path.join(outputsRoot, `${recipe.id}.mp4`);
    const cacheDir = path.join(runRoot, `cache-${recipe.id}`);
    const manifest = await renderScene({scene, scenePath, outputPath, cacheDir, name: recipe.id});
    assert.equal(manifest.frameCount, 30);
    assert.ok(manifest.motionRecipes.calls[recipe.id] >= 30, `${recipe.id} custom renderer did not consume encoded output frames`);
    const playback = manifest.motionRecipes.sourceSequences?.consumed;
    assert.ok(playback, `${recipe.id} has no source-sequence consumption receipt`);
    for (const side of ["from", "to"]) {
      const row = playback[`${recipe.id}.${side}`];
      const loaded = manifest.motionRecipes.sourceSequences.loaded[`${recipe.id}.${side}`];
      assert.equal(loaded.decodedFrameBytes, 1920 * 1080 * 4, `${recipe.id}.${side} cache estimate must describe one decoded RGBA frame`);
      assert.equal(loaded.decodedCacheBudgetBytes, 64 * 1024 * 1024, `${recipe.id}.${side} must use the fixed decoded-frame LRU cache budget`);
      assert.ok(loaded.totalEncodedBytes <= 64 * 1024 * 1024, `${recipe.id}.${side} encoded PNG budget is separately bounded`);
      assert.ok(row?.count > 0, `${recipe.id}.${side} sequence input was never consumed`);
      assert.ok(row.maxFrameIndex > row.minFrameIndex, `${recipe.id}.${side} source time did not advance through distinct sequence frames`);
      for (const [frameIndex, sample] of Object.entries(row.frameUseSamples)) {
        const expected = Math.floor(sample.firstSceneTimeSec * 30 + 1e-9);
        assert.equal(Number(frameIndex), expected, `${recipe.id}.${side} consumed frame must follow the declared scene-local clock`);
      }
      if (side === "from") {
        assert.equal(row.frameUseSamples["9"]?.lastSceneTimeSec, 0.3, `${recipe.id}.from must consume source frame 9 at nonzero scene-local transition start`);
      }
    }
    assert.equal(manifest.output, outputPath);
    assert.equal(manifest.outputSha256, await fs.readFile(outputPath).then((bytes) => crypto.createHash("sha256").update(bytes).digest("hex")));
    results[recipe.recipeId] = {outputPath, manifest};

    const encodedFirst = decodeRgbFrame(outputPath, 0);
    const sourceFirst = decodeRgbFrame(path.join(sourceResults["source-a"].frameDirectory, "00000000.png"));
    const encodedStart = decodeRgbFrame(outputPath, 9);
    const sourceAtStart = decodeRgbFrame(path.join(sourceResults["source-a"].frameDirectory, "00000009.png"));
    const encodedLast = decodeRgbFrame(outputPath, 29);
    const sourceLast = decodeRgbFrame(path.join(sourceResults["source-b"].frameDirectory, "00000029.png"));
    if (recipe.recipeId === "zoom-through") {
      assert.ok(meanAbsoluteDifference(encodedFirst, sourceFirst) < 12, "zoom-through before transition must preserve A's full-stage geometry at unit zoom");
    }
    assert.ok(meanAbsoluteDifference(encodedStart, sourceAtStart) < 12,
      `${recipe.recipeId} transition p=0 at scene time .3s must preserve A's matching clocked source frame geometry`);
    assert.ok(meanAbsoluteDifference(encodedLast, sourceLast) < 12, `${recipe.recipeId} after transition must resolve to B at unit scale/full-stage geometry`);
    const seek = await randomSeekCanvasSamples({scene, recipe, sequences: sequencePaths});
    assert.deepEqual(seek.times, [0.7, 0.3, 0.7]);
    assert.equal(seek.pngs[0], seek.pngs[2], `${recipe.recipeId} browser drawFrame seek .7,.3,.7 must reproduce the repeated .7 canvas PNG`);
    assert.ok(seek.evidence.sourceSequences.cache.hits >= 1, `${recipe.recipeId} repeated seek must reuse an LRU-decoded source bitmap`);
    assert.ok(seek.evidence.sourceSequences.cache.peakResidentDecodedRgbaBytes <= seek.evidence.sourceSequences.cache.budgetBytes,
      `${recipe.recipeId} random-seek decoded cache must stay within its byte budget`);
    const seekEvidence = seek.evidence.sourceSequences.consumed;
    assert.equal(seekEvidence[`${recipe.id}.to`].frameUseSamples["21"].count, 2);
    if (recipe.recipeId === "zoom-through") {
      assert.equal(seekEvidence[`${recipe.id}.from`].frameUseSamples["9"].count, 1);
    } else {
      assert.equal(seekEvidence[`${recipe.id}.from`].frameUseSamples["21"].count, 2);
      assert.equal(seekEvidence[`${recipe.id}.from`].frameUseSamples["9"].count, 1);
      assert.equal(seekEvidence[`${recipe.id}.to`].frameUseSamples["9"].count, 1);
    }
    const outputMotionA = meanAbsoluteDifference(decodeRgbFrame(outputPath, 10), decodeRgbFrame(outputPath, 17));
    const outputMotionB = meanAbsoluteDifference(decodeRgbFrame(outputPath, 20), decodeRgbFrame(outputPath, 27));
    assert.ok(outputMotionA > 1, `${recipe.recipeId} encoded frames must visibly change while A is being consumed; observed ${outputMotionA}`);
    assert.ok(outputMotionB > 1, `${recipe.recipeId} encoded frames must visibly change while B is being consumed; observed ${outputMotionB}`);
    const sourceMotionA = meanAbsoluteDifference(
      decodeRgbFrame(path.join(sourceResults["source-a"].frameDirectory, "00000009.png")),
      decodeRgbFrame(path.join(sourceResults["source-a"].frameDirectory, "00000015.png")),
    );
    const sourceMotionB = meanAbsoluteDifference(
      decodeRgbFrame(path.join(sourceResults["source-b"].frameDirectory, "00000021.png")),
      decodeRgbFrame(path.join(sourceResults["source-b"].frameDirectory, "00000027.png")),
    );
    assert.ok(sourceMotionA > 2, `source A fixture must actually move; observed ${sourceMotionA}`);
    assert.ok(sourceMotionB > 2, `source B fixture must actually move; observed ${sourceMotionB}`);
    const cache = manifest.motionRecipes.sourceSequences.cache;
    assert.ok(cache.peakResidentDecodedRgbaBytes <= cache.budgetBytes, `${recipe.recipeId} encoded render must stay within the decoded LRU cache budget`);
    assert.ok(cache.evictions > 0, `${recipe.recipeId} 30-frame 1080p sequence must evict old bitmaps instead of retaining the full sequence`);
  }

  const evidence = {
    format: "laohu.motion.garden-transition-sequence-e2e/1",
    source: {renderer: "render.mjs + MotionCore browser Canvas frames", fps: 30, frameCount: 30, stage: "1920x1080", transitionDurationSec: 0.6, clocks: "frameIndex=floor(sceneLocalSec*sequenceFps), sourceStartSec=0s, playbackRate=1, endBehavior=clamp", decodedCache: "64 MiB RGBA ImageBitmap LRU, current draw frames pinned through MotionCore.drawFrame"},
    transitions: Object.fromEntries(Object.entries(results).map(([id, result]) => [id, {
      output: path.relative(root, result.outputPath).split(path.sep).join("/"),
      outputSha256: result.manifest.outputSha256,
      decodedCache: result.manifest.motionRecipes.sourceSequences.cache,
      sequenceClockEvidence: result.manifest.motionRecipes.sourceSequences.consumed,
      sourceFrameAssets: result.manifest.motionRecipes.sourceSequences.loaded,
      sourceGeometry: "encoded endpoint pixel MAE < 12/255 against corresponding original full-stage source frame",
      encodedMotion: "first-half and second-half decoded MP4 frames differ; both source inputs advance across distinct source frame indexes",
      randomSeek: {times: [0.7, 0.3, 0.7], duplicateCanvasPngIdentical: true},
    }]))
  };
  await fs.writeFile(path.join(outputsRoot, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, {flag: "wx"});
});

test("Garden frame-sequence loader keeps the original ordered-file count budget", {skip: ![ffmpeg, browser].every(fileExists), timeout: 60_000}, async () => {
  await fs.mkdir(tmpRoot, {recursive: true});
  const suffix = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  const fixtureRoot = path.join(tmpRoot, `garden-sequence-budget-${suffix}`);
  const outputRoot = path.join(validationRoot, `garden-sequence-budget-${suffix}`);
  await fs.mkdir(fixtureRoot, {recursive: true});
  await fs.mkdir(outputRoot, {recursive: true});
  const sequencePath = path.join(fixtureRoot, "too-many-input-frames.sequence.json");
  await writeJson(sequencePath, {
    format: "laohu.motion.source-frame-sequence/1", width: 1920, height: 1080, fps: 30,
    frames: Array.from({length: 901}, (_, index) => `unused/frame-${String(index).padStart(4, "0")}.png`),
  });
  const scene = {
    version: 1, width: 1920, height: 1080, fps: 30, duration: 1, timeBasis: "scene-local", background: "#101014",
    objects: [{id: "budget-owner", type: "custom:laohu-motion-recipes", space: "screen", data: {motionRecipes: [{
      id: "budget-overflow", recipeId: "zoom-through",
      parameters: {startSec: 0, durationSec: 1, targetX: 960, targetY: 540, zoom: 2,
        from: sequencePanel(path.basename(sequencePath)), to: {color: "#223344"}},
    }]}}],
  };
  const scenePath = path.join(fixtureRoot, "frame-count-overflow.scene.json");
  await writeJson(scenePath, scene);
  const result = spawnSync(process.execPath, [renderCli, "--scene", scenePath,
    "--output", path.join(outputRoot, "must-not-render.mp4"), "--cache-dir", path.join(fixtureRoot, "cache"),
    "--browser", browser, "--ffmpeg", ffmpeg], {
    cwd: root, encoding: "utf8", timeout: 45_000, maxBuffer: 4 * 1024 * 1024,
    env: {...process.env, TMPDIR: tmpRoot, TMP: tmpRoot, TEMP: tmpRoot, MOTION_FFMPEG: ffmpeg, MOTION_BROWSER: browser},
  });
  assert.equal(result.error, undefined, `budget guard process could not start: ${result.error?.message || "unknown"}`);
  assert.notEqual(result.status, 0, `expected the original 900-frame input-file budget to reject 901 source PNG entries`);
  const combined = `${result.stdout}\n${result.stderr}`;
  assert.match(combined, /must contain 2–900 ordered PNG frames/);
});
