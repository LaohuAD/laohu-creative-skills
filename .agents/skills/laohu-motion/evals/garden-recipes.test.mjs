import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileFilmSchedule, validateMotionSceneForSegment } from "../templates/adapters/laohu-film.mjs";
import { compilePlan, freezePlan, hashPlan, importAsrJson } from "../../laohu-asrcut/scripts/asrcut.mjs";

const require = createRequire(import.meta.url);
const adapter = require("../templates/adapters/laohu-motion-recipes.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const skillDir = path.join(root, ".agents", "skills", "laohu-motion");
const evidenceDir = process.env.MOTION_VALIDATION_DIR ? path.resolve(process.env.MOTION_VALIDATION_DIR) : path.join(root, ".cache", "validation", "motion-showreel-integration");
const motionRuntimeModules = path.join(root, ".cache", "tmp", "video-shotcraft", "motion-renderer-runtime", "node_modules");
const nodePath = path.join(skillDir, "scripts", "render.mjs");
const sourceRoot = process.env.MOTION_SOURCE_ROOT ? path.resolve(process.env.MOTION_SOURCE_ROOT) : null;
const sourceHelperPath = sourceRoot ? path.join(sourceRoot, "garden-motion-showreel", "skills", "motion-showreel", "assets", "starter", "motion.js") : null;
const discoveredFfmpeg = spawnSync("which", ["ffmpeg"], { encoding: "utf8" }).stdout?.trim();
const ffmpeg = process.env.MOTION_FFMPEG || discoveredFfmpeg || "ffmpeg";
const browserCandidates = process.env.MOTION_BROWSER ? [process.env.MOTION_BROWSER] : [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
];
const browser = browserCandidates.find((candidate) => executable(candidate, ["--version"]));

function panel(color, text) {
  return { color, text, textColor: "#ffffff", font: "bold 32px sans-serif", fontSize: 32 };
}
const sourceFrame = (name) => ({ type: "source-frame", path: name });

function fixtureScene() {
  const recipes = [
    { id: "cake-mask", recipeId: "masked-text-replacement", parameters: { items: [
      { text: "电池", x: 35, baseY: 65, size: 34, font: "bold 34px sans-serif", color: "#111111", startSec: 0, exitSec: 0.3, gap: 0.06 },
      { text: "电站", x: 35, baseY: 65, size: 34, font: "bold 34px sans-serif", color: "#222222", startSec: 0.75, gap: 0.06 },
    ] } },
    { id: "cake-stretch", recipeId: "leading-trailing-stretch", parameters: { moves: [[0, 30], [1, 400]], y: 110, width: 100, height: 10, color: "#e04b3f" } },
    { id: "cake-state", recipeId: "shape-state-chain", parameters: { states: [[100, 150, 60, 50, 8], [130, 150, 90, 50, 18]], times: [0, 1.5], colors: ["#e04b3f", "#2473aa"], labels: ["输入", "输出"], labelColor: "#ffffff", labelFont: "bold 14px sans-serif", labelSize: 14 } },
    { id: "cake-cursor", recipeId: "cursor-driven", parameters: { points: [[0, [30, 170]], [2.5, [600, 170], "inOutCubic"]], pressIntervals: [[0.8, 1.1]], track: { x: 40, y: 245, width: 300, height: 10 }, snapSec: 0.8, color: "#111111", outline: "#ffffff", trackColor: "#c8c8c8" } },
    { id: "cake-zoom", recipeId: "zoom-through", parameters: { startSec: 0.1, durationSec: 1.2, targetX: 320, targetY: 180, zoom: 1.8, from: sourceFrame("frame-before.png"), to: sourceFrame("frame-after.png") } },
    { id: "cake-wipe", recipeId: "wipe-reveal", parameters: { startSec: 0.1, durationSec: 1.2, slant: 48, from: sourceFrame("frame-before.png"), to: sourceFrame("frame-after.png") } },
    { id: "cake-particle-text", recipeId: "particle-text", parameters: { text: "电力", font: "bold 40px sans-serif", width: 280, height: 120, step: 16, formSec: 0.7, burstSec: 2.5, color: "#ffffff", particleSize: 4 } },
    { id: "cake-emitter", recipeId: "stateless-emitter", parameters: { origin: [320, 320], rate: 15, life: 1.2, speed: 60, gravity: 80, seed: 3, startSec: 0, endSec: 3, color: "#ffcf5c", size: 4 } },
    { id: "cake-counter", recipeId: "counter-impact", parameters: { startSec: 0, durationSec: 1.4, from: 0, to: 5, x: 500, y: 100, font: "bold 38px sans-serif", fontSize: 38, color: "#ffffff", impactDecaySec: 0.15 } },
    { id: "cake-svg", recipeId: "svg-stroke", parameters: { pathData: "M 20 300 L 620 300", startSec: 0, durationSec: 2, x: 0, y: 0, lineWidth: 4, color: "#ffffff", lineCap: "round" } },
    { id: "cake-loop", recipeId: "seamless-loop", parameters: { durationSec: 2, count: 5, radius: 32, size: 7, harmonic: 1, centerX: 320, centerY: 280, color: "#ffffff", ellipseY: 0.7 } },
    { id: "cake-ghost", recipeId: "temporal-ghosts", parameters: { mover: { type: "rect", width: 12, height: 12, color: "#ffcf5c", keyframes: [[0, [20, 200]], [2, [600, 200]]] }, samples: 4, stepSec: 0.012, opacity: 0.18 } },
    { id: "cake-beat-reveal", recipeId: "canonical-beat-reveal", parameters: { eventIds: ["cake-beat-a", "cake-beat-b"], revealOnEventId: "cake-beat-b", transitionDurationSec: 0.6, revealProgress: 0.4, from: sourceFrame("frame-before.png"), to: sourceFrame("frame-after.png"), centerX: 320, centerY: 180, punchScale: 0.03, punchDecaySec: 0.2 } },
    { id: "cake-boxes", recipeId: "canvas-perspective-boxes", parameters: { camera: { pitch: 0.7, yaw: 0.4, dist: 1400, focal: 1400, target: [0, 0, 0], cx: 320, cy: 180 }, boxes: [{ x: 0, z: 0, w: 80, d: 80, h: 90, y: 0, color: { top: "#f8f7f3", px: "#8e8b85", nx: "#d2cfc8", pz: "#111111", nz: "#3a3936" } }] } },
  ];
  return {
    version: 1, width: 640, height: 360, fps: 24, duration: 3, timeBasis: "scene-local", background: "#17272f",
    audioEvents: [
      { id: "cake-beat-a", timeSec: 1, timeBasis: "scene-local" },
      { id: "cake-beat-b", timeSec: 2, timeBasis: "scene-local" },
    ],
    objects: [{ id: "cake-technical-fixture", type: adapter.OBJECT_TYPE, space: "screen", data: { motionRecipes: recipes } }],
    motionPostProcessing: [{ id: "cake-post", recipeId: "webgl-crt-post", parameters: { hitEventIds: ["cake-beat-a"], hitDecaySec: 0.14 } }],
  };
}

function hash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function rgbaAt(file, x, y, width = 640, height = 360) {
  const decoded = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], {
    encoding: null, timeout: 10000, maxBuffer: width * height * 4 + 1024,
  });
  assert.equal(decoded.status, 0, decoded.stderr?.toString() || decoded.error?.message);
  const offset = (y * width + x) * 4;
  assert.ok(decoded.stdout.length >= offset + 4, `decoded RGBA frame is too small for pixel ${x},${y}`);
  return [...decoded.stdout.subarray(offset, offset + 4)];
}

function executable(file, args) {
  const result = spawnSync(file, args, { encoding: "utf8", timeout: 10000 });
  return result.status === 0;
}

test("adapted time curves match the Garden helper module when a maintenance source root is supplied", { skip: sourceHelperPath ? false : "MOTION_SOURCE_ROOT is unset; original-source comparison was not performed" }, async () => {
  const source = await import(pathToFileURL(sourceHelperPath).href);
  for (const time of [-0.1, 0, 0.12, 0.5, 1, 1.5, 2.25]) {
    assert.equal(adapter.spring(time), source.spring(time));
    assert.equal(adapter.helpers.snap(time), source.snap(time));
    assert.equal(adapter.pulse(time, [0, 1], 0.14), source.pulse(time, [0, 1], 0.14));
    assert.equal(adapter.helpers.seg(time, 0.1, 1.3), source.seg(time, 0.1, 1.3));
  }
  assert.equal(adapter.springTo(0, [[0, 100], [1, 200]]), source.springTo(0, [[0, 100], [1, 200]]));
  assert.equal(adapter.springTo(1.5, [[0, 100], [1, 200]]), source.springTo(1.5, [[0, 100], [1, 200]]));
  assert.deepEqual(adapter.springTo(1.5, [[0, [0, 4]], [1, [10, -6]]]), source.springTo(1.5, [[0, [0, 4]], [1, [10, -6]]]));
  for (const progress of [0, 0.01, 0.2, 0.5, 0.81, 0.99, 1]) assert.equal(adapter.helpers.snap(progress), source.snap(progress));
  for (const curve of ["inCubic", "outCubic", "inOutCubic", "inExpo", "outExpo", "inOutExpo"]) {
    for (const progress of [0, 0.1, 0.35, 0.5, 0.8, 1]) assert.equal(adapter.helpers.ease[curve](progress), source.ease[curve](progress));
  }
  for (const index of [0, 1, 7, 37, 101]) {
    assert.equal(adapter.helpers.hash(index, 3), source.hash(index, 3));
    assert.equal(adapter.helpers.noise1(index * 0.17, 9), source.noise1(index * 0.17, 9));
  }
  const localRng = adapter.helpers.rng(19), sourceRng = source.rng(19);
  for (let index = 0; index < 8; index += 1) assert.equal(localRng(), sourceRng());
  const localCamera = adapter.helpers.camera3d({ width: 640, height: 360, yaw: 0.4 });
  const sourceCamera = source.camera3d({ W: 640, H: 360, yaw: 0.4 });
  assert.deepEqual(localCamera.project([25, 70, -10]), sourceCamera.project([25, 70, -10]));
});

test("Garden schemas reject dead fields, overlapping CJK replacement, local beat schedules, and misplaced WebGL passes", () => {
  const scene = fixtureScene();
  assert.equal(adapter.validateScene(scene).length, 15);
  const extra = structuredClone(scene);
  extra.objects[0].data.motionRecipes.find((row) => row.recipeId === "particle-text").parameters.seed = 7;
  assert.throws(() => adapter.validateScene(extra), /seed is not consumed/);
  const staleIrisRadius = structuredClone(scene);
  staleIrisRadius.objects[0].data.motionRecipes.find((row) => row.recipeId === "canonical-beat-reveal").parameters.maxRadius = 600;
  assert.throws(() => adapter.validateScene(staleIrisRadius), /maxRadius is not consumed/);
  const overlap = structuredClone(scene);
  overlap.objects[0].data.motionRecipes.find((row) => row.recipeId === "masked-text-replacement").parameters.items[1].startSec = 0.4;
  assert.throws(() => adapter.validateScene(overlap), /old text exit must finish before new text enters/);
  const missingCanonical = structuredClone(scene);
  missingCanonical.audioEvents = [];
  assert.throws(() => adapter.validateScene(missingCanonical), /references missing canonical audio event/);
  const filmGlobal = structuredClone(scene);
  filmGlobal.audioEvents[0].timeBasis = "film-global";
  assert.throws(() => adapter.validateScene(filmGlobal), /only consume scene-local canonical events/);
  const misplacedPost = structuredClone(scene);
  misplacedPost.objects[0].data.motionRecipes.push({ id: "wrong-post-owner", recipeId: "webgl-crt-post", parameters: {} });
  assert.throws(() => adapter.validateScene(misplacedPost), /must declare scene.motionPostProcessing/);
});

test("retired Garden style aliases resolve to protected original references while recipes remain catalogued", () => {
  const listStyles = spawnSync(process.execPath, [path.join(skillDir, "scripts", "templates.mjs"), "list", "--type", "method", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(listStyles.status, 0, listStyles.stderr);
  const styles = JSON.parse(listStyles.stdout);
  assert.deepEqual(styles, []);
  const showStyle = spawnSync(process.execPath, [path.join(skillDir, "scripts", "templates.mjs"), "show", "style-blueprint", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(showStyle.status, 0, showStyle.stderr);
  const style = JSON.parse(showStyle.stdout);
  assert.equal(style.id, "original:blueprint");
  assert.equal(style.kind, "style-reference");
  assert.equal(style.route.kind, "reference-style");
  assert.equal(style.contentCapability.renderer, null);
  assert.match(style.originalText, /工程蓝图/);
  const listRecipes = spawnSync(process.execPath, [path.join(skillDir, "scripts", "templates.mjs"), "list", "--type", "effect", "--source", adapter.SOURCE_ID, "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(listRecipes.status, 0, listRecipes.stderr);
  const recipes = JSON.parse(listRecipes.stdout);
  assert.equal(recipes.length, 15);
  assert.ok(recipes.every((row) => row.itemType === "effect"
    && row.renderer === (row.id === "laohu-motion-recipe-webgl-crt-post" ? adapter.POST_RENDERER : adapter.OBJECT_TYPE)));
  const beatReveal = JSON.parse(spawnSync(process.execPath, [path.join(skillDir, "scripts", "templates.mjs"), "show", "laohu-motion-recipe-canonical-beat-reveal", "--json"], { cwd: root, encoding: "utf8" }).stdout);
  assert.equal(beatReveal.availability, "conditional");
  assert.equal(beatReveal.supportingSourceRef.sourceId, "huashu-art-motion");
  assert.equal(beatReveal.supportingSourceRef.function, "TRANSITIONS.iris");
  assert.ok(!beatReveal.parameters.some((row) => row.name.endsWith(".maxRadius")), "catalog cannot advertise the retired local iris radius field");
});

const EXPECTED_PARAMETER_KEYS = {
  "masked-text-replacement": ["items"],
  "leading-trailing-stretch": ["moves", "y", "width", "height", "color"],
  "shape-state-chain": ["states", "times", "colors", "labels", "labelColor", "labelFont", "labelSize"],
  "cursor-driven": ["points", "pressIntervals", "track", "snapSec", "color", "outline", "trackColor"],
  "zoom-through": ["startSec", "durationSec", "targetX", "targetY", "zoom", "from", "to"],
  "wipe-reveal": ["startSec", "durationSec", "slant", "from", "to"],
  "particle-text": ["text", "font", "width", "height", "step", "formSec", "burstSec", "color", "particleSize"],
  "stateless-emitter": ["origin", "rate", "life", "speed", "gravity", "seed", "startSec", "endSec", "color", "size"],
  "counter-impact": ["startSec", "durationSec", "from", "to", "x", "y", "font", "fontSize", "color", "impactDecaySec"],
  "svg-stroke": ["pathData", "startSec", "durationSec", "x", "y", "lineWidth", "color", "lineCap"],
  "seamless-loop": ["durationSec", "count", "radius", "size", "harmonic", "centerX", "centerY", "color", "ellipseY"],
  "webgl-crt-post": ["hitEventIds", "hitDecaySec"],
  "temporal-ghosts": ["mover", "samples", "stepSec", "opacity"],
  "canonical-beat-reveal": ["eventIds", "revealOnEventId", "transitionDurationSec", "revealProgress", "from", "to", "centerX", "centerY", "punchScale", "punchDecaySec"],
  "canvas-perspective-boxes": ["boxes", "camera"],
};

function makeSceneFromCatalogExample(entry) {
  const example = structuredClone(entry.runtimeExample?.instance);
  assert.ok(example, `${entry.id} must expose its input example through ordinary show output`);
  const scene = {
    format: "motion-scene-v1", version: 1, width: 1920, height: 1080, fps: 30, duration: 3,
    timeBasis: "scene-local", background: "#17272f",
    audioEvents: [{ id: "catalog-example-hit", timeSec: 1.5, timeBasis: "scene-local" }],
    objects: [], motionPostProcessing: [],
  };
  if (entry.runtimeExample.consumer === "scene.motionPostProcessing[]") scene.motionPostProcessing.push(example);
  else scene.objects.push({ id: "catalog-example-owner", type: adapter.OBJECT_TYPE, space: "screen", data: { motionRecipes: [example] } });
  return scene;
}

function removeCatalogField(parameters, suffix) {
  const parts = suffix.split(".");
  function removeAt(current, index) {
    const token = parts[index];
    const isArray = token.endsWith("[]");
    const key = isArray ? token.slice(0, -2) : token;
    if (index === parts.length - 1) {
      delete current[key];
      return;
    }
    const next = current[key];
    if (isArray) {
      for (const row of next || []) if (row && typeof row === "object") removeAt(row, index + 1);
    } else if (next && typeof next === "object") removeAt(next, index + 1);
  }
  removeAt(parameters, 0);
}

function contractApplies(parameter, parameters) {
  if (!parameter.appliesWhen) return true;
  if (parameter.appliesWhen === 'parameters.mover.type === "rect"') return parameters.mover?.type === "rect";
  if (parameter.appliesWhen === 'parameters.mover.type === "circle"') return parameters.mover?.type === "circle";
  throw new Error(`Unknown catalog appliesWhen expression: ${parameter.appliesWhen}`);
}

test("ordinary catalog show output describes and supplies the exact validator contract for all 15 recipes", () => {
  const list = spawnSync(process.execPath, [path.join(skillDir, "scripts", "templates.mjs"), "list", "--type", "effect", "--source", adapter.SOURCE_ID, "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(list.status, 0, list.stderr);
  const listed = JSON.parse(list.stdout);
  assert.equal(listed.length, 15);

  for (const summary of listed) {
    const shown = spawnSync(process.execPath, [path.join(skillDir, "scripts", "templates.mjs"), "show", summary.id, "--json"], { cwd: root, encoding: "utf8" });
    assert.equal(shown.status, 0, `${summary.id}: ${shown.stderr}`);
    const entry = JSON.parse(shown.stdout);
    const recipeId = entry.id.replace("laohu-motion-recipe-", "");
    const suffix = entry.runtimeExample.consumer === "scene.motionPostProcessing[]" ? "scene.motionPostProcessing[].parameters." : "objects[].data.motionRecipes[].parameters.";
    const rows = entry.parameters;
    assert.ok(rows.length > 0, `${entry.id} must list its full parameter contract`);
    for (const row of rows) {
      assert.ok(row.name.startsWith(suffix), `${entry.id} has a wrongly placed path ${row.name}`);
      assert.ok(typeof row.required === "boolean", `${row.name} must state whether the consumer requires it`);
      assert.ok(typeof row.valueType === "string" && row.valueType, `${row.name} must declare its value type`);
      assert.ok(typeof row.unit === "string" && row.unit, `${row.name} must declare its unit`);
      assert.ok(typeof row.consumer === "string" && row.consumer, `${row.name} must name its actual consumer`);
      if (!row.required) assert.ok(Object.hasOwn(row, "default"), `${row.name} must declare its omission default`);
    }
    const exposedKeys = [...new Set(rows.map((row) => row.name.slice(suffix.length).split(/[.[]/, 1)[0]))].sort();
    assert.deepEqual(exposedKeys, [...EXPECTED_PARAMETER_KEYS[recipeId]].sort(), `${entry.id} catalog fields must cover the adapter allowlist exactly`);
    const scene = makeSceneFromCatalogExample(entry);
    assert.equal(adapter.validateScene(scene).length, 1, `${entry.id} catalog example must validate through the actual adapter`);

    const parameters = entry.runtimeExample.instance.parameters;
    for (const row of rows) {
      if (!row.required || !contractApplies(row, parameters)) continue;
      const missing = structuredClone(scene);
      const target = entry.runtimeExample.consumer === "scene.motionPostProcessing[]"
        ? missing.motionPostProcessing[0].parameters
        : missing.objects[0].data.motionRecipes[0].parameters;
      removeCatalogField(target, row.name.slice(suffix.length));
      assert.throws(() => adapter.validateScene(missing), undefined, `${row.name} is documented as required but removing it must fail validation`);
    }
    for (const row of rows) {
      if (row.required || !contractApplies(row, parameters)) continue;
      const omitted = structuredClone(scene);
      const target = entry.runtimeExample.consumer === "scene.motionPostProcessing[]"
        ? omitted.motionPostProcessing[0].parameters
        : omitted.objects[0].data.motionRecipes[0].parameters;
      removeCatalogField(target, row.name.slice(suffix.length));
      assert.doesNotThrow(() => adapter.validateScene(omitted), `${row.name} is documented optional and its omission must validate`);
    }
  }
});

const browserAvailable = Boolean(browser);
const ffmpegAvailable = executable(ffmpeg, ["-version"]);
let playwrightAvailable = false;
try { require.resolve("playwright", { paths: [motionRuntimeModules, ...(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)] }); playwrightAvailable = true; } catch {}

test("ASR-cut /2 schedule accepts the same scene-local Garden adapter and canonical event clock", () => {
  const scene = { ...fixtureScene(), width: 1920, height: 1080, fps: 30 };
  const timeline = {
    format: "laohu.asrcut.timeline/2", state: "frozen", durationSamples: 144000,
    clock: { unit: "sample", sampleRateHz: 48000 },
    units: [{ kind: "source", occurrenceId: "fixture-occurrence", targetRange: { startSample: 0, endSample: 144000, sampleRateHz: 48000 } }],
  };
  const blueprint = {
    format: "laohu.huashu-film-blueprint/1", width: scene.width, height: scene.height, fps: scene.fps,
    clock: { kind: "asrcut-v2" },
    segments: [{ id: "fixture-segment", renderer: "motion-scene", scenePath: "fixture-scene.json", sceneSha256: "d".repeat(64), unitIds: ["fixture-occurrence"] }],
  };
  const [item] = compileFilmSchedule(blueprint, timeline).segments;
  assert.equal(item.sourceFrameCount, 90);
  assert.equal(validateMotionSceneForSegment(scene, item), scene.duration);
  const records = adapter.validateScene(scene);
  assert.ok(records.slice(0, -1).every((row) => row.renderer === adapter.OBJECT_TYPE));
  assert.equal(records.at(-1).renderer, adapter.POST_RENDERER);
  const wrongClock = structuredClone(scene);
  wrongClock.audioEvents[0].timeBasis = "film-global";
  assert.throws(() => validateMotionSceneForSegment(wrongClock, item), /only consume scene-local canonical events/);
});

test("ASR-cut /2 Film render assembles a real 90-frame MP4 and retains the child Garden recipe receipt", { skip: !(browserAvailable && ffmpegAvailable && playwrightAvailable) }, async () => {
  const runRoot = path.join(evidenceDir, `film-v2-recipe-e2e-${process.pid}`);
  const workRoot = process.env.MOTION_WORK_ROOT ? path.resolve(process.env.MOTION_WORK_ROOT) : path.join(root, ".cache", "tmp", "video-shotcraft");
  await fs.mkdir(runRoot, { recursive: true });

  const plan = importAsrJson({ segments: [{ start: 0, end: 3, text: "动效夹具", words: [{ text: "动效夹具", start: 0.2, end: 2.8 }] }] }, {
    projectId: "garden-motion-film-v2-technical-fixture", sourceId: "fixture-source", sampleRateHz: 48000,
    sourceSampleRateHz: 48000, sourceDurationSamples: 144000, timeUnit: "seconds",
  });
  plan.format = "laohu.asrcut.edit-plan/2";
  plan.authorization.presentationTiming = true;
  plan.sequence = plan.sequence.map((row) => ({ kind: "source", ...row }));
  plan.integrity.planSha256 = hashPlan(plan);
  const frozenPlan = freezePlan(plan);
  const timeline = compilePlan(frozenPlan);
  assert.equal(timeline.format, "laohu.asrcut.timeline/2");
  assert.equal(timeline.durationSamples, 144000);
  assert.equal(timeline.units.length, 1);
  const planBytes = Buffer.from(`${JSON.stringify(frozenPlan, null, 2)}\n`);
  const timelineBytes = Buffer.from(`${JSON.stringify(timeline, null, 2)}\n`);
  const planPath = path.join(runRoot, "edit-plan.json");
  const timelinePath = path.join(runRoot, "timeline.json");
  await fs.writeFile(planPath, planBytes, { flag: "wx" });
  await fs.writeFile(timelinePath, timelineBytes, { flag: "wx" });

  const shown = spawnSync(process.execPath, [path.join(skillDir, "scripts", "templates.mjs"), "show", "laohu-motion-recipe-temporal-ghosts", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(shown.status, 0, shown.stderr);
  const ghostEntry = JSON.parse(shown.stdout);
  const recipe = structuredClone(ghostEntry.runtimeExample.instance);
  recipe.id = "film-v2-temporal-ghosts";
  const scene = {
    format: "motion-scene-v1", version: 1, width: 1920, height: 1080, fps: 30, duration: 3,
    timeBasis: "scene-local", background: "#17272f", audioEvents: [],
    objects: [{ id: "film-v2-recipe-owner", type: adapter.OBJECT_TYPE, space: "screen", data: { motionRecipes: [recipe] } }],
  };
  assert.equal(adapter.validateScene(scene).length, 1);
  const sceneBytes = Buffer.from(`${JSON.stringify(scene, null, 2)}\n`);
  const scenePath = path.join(runRoot, "motion-scene.json");
  await fs.writeFile(scenePath, sceneBytes, { flag: "wx" });

  const blueprint = {
    format: "laohu.huashu-film-blueprint/2", width: 1920, height: 1080, fps: 30,
    clock: {
      kind: "asrcut-v2", timelinePath: "timeline.json", timelineSha256: hash(timelineBytes),
      editPlanPath: "edit-plan.json", editPlanSha256: hash(planBytes),
    },
    segments: [{
      id: "garden-recipe-body", renderer: "motion-scene", compositionGroupId: "garden-recipe-body",
      scenePath: "motion-scene.json", sceneSha256: hash(sceneBytes), unitIds: [timeline.units[0].occurrenceId],
      layers: [], actionBindings: [],
    }],
    compositionGroups: [{ id: "garden-recipe-body", segmentIds: ["garden-recipe-body"] }], transitionEdges: [],
  };
  const blueprintPath = path.join(runRoot, "film-blueprint.json");
  await fs.writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`, { flag: "wx" });
  const outputPath = path.join(runRoot, "garden-recipe-asrcut-v2.mp4");
  const manifestPath = path.join(runRoot, "film-manifest.json");
  const command = [path.join(skillDir, "scripts", "templates.mjs"), "render", "--film-blueprint", blueprintPath,
    "--output", outputPath, "--work-root", workRoot, "--manifest", manifestPath, "--ffmpeg", ffmpeg];
  if (browser) command.push("--browser", browser);
  const result = spawnSync(process.execPath, command, {
    cwd: root, encoding: "utf8", timeout: 600000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, TMPDIR: process.env.TMPDIR || path.join(root, ".cache", "tmp"), NODE_PATH: process.env.NODE_PATH || motionRuntimeModules },
  });
  assert.equal(result.status, 0, `templates.mjs Film /2 render failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const film = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(film.format, "laohu.motion-film-manifest/2", "the no-OM /2 route emits the current Film manifest format");
  assert.deepEqual(film.nativeBaseSources, [], "a no-OM Garden Film keeps nativeBaseSources empty while retaining the /2 manifest contract");
  assert.deepEqual(film.nativeSourceCompositions, []);
  assert.equal(film.source.clockKind, "asrcut-v2");
  assert.equal(film.render.width, 1920);
  assert.equal(film.render.height, 1080);
  assert.equal(film.render.fps, 30);
  assert.equal(film.render.frameCount, 90);
  assert.equal(film.segments.length, 1);
  const segment = film.segments[0];
  assert.equal(segment.renderer, "motion-scene");
  assert.equal(segment.baseSource.probe.width, 1920);
  assert.equal(segment.baseSource.probe.height, 1080);
  assert.equal(segment.baseSource.probe.frameCount, 90);

  const childReceiptPath = path.resolve(path.dirname(manifestPath), segment.baseSource.rendererReceiptPath);
  const childReceiptBytes = await fs.readFile(childReceiptPath);
  assert.equal(hash(childReceiptBytes), segment.baseSource.rendererReceiptSha256);
  const childReceipt = JSON.parse(childReceiptBytes.toString("utf8"));
  assert.equal(childReceipt.render.frameCount, 90);
  const motionSegment = childReceipt.segments.find((row) => row.id === "garden-recipe-body");
  assert.ok(motionSegment?.motionRecipes, "the existing /1 child Film receipt must retain its Motion recipe evidence");
  assert.equal(motionSegment.motionRecipes.sourceId, adapter.SOURCE_ID);
  assert.equal(motionSegment.motionRecipes.sourceCommit, adapter.SOURCE_COMMIT);
  assert.ok(motionSegment.motionRecipes.validatedInstances.some((row) => row.id === recipe.id && row.recipeId === recipe.recipeId));
  assert.ok(motionSegment.motionRecipes.calls[recipe.id] > 0, "the child renderer must actually draw the selected temporal-ghost recipe");
  const motionReceiptPath = path.resolve(path.dirname(childReceiptPath), motionSegment.receiptPath);
  const motionReceiptBytes = await fs.readFile(motionReceiptPath);
  const motionReceipt = JSON.parse(motionReceiptBytes.toString("utf8"));
  assert.equal(motionReceipt.frameCount, 90);
  assert.deepEqual(motionReceipt.motionRecipes, motionSegment.motionRecipes, "the /1 Film receipt must carry through the actual render.mjs recipe receipt");

  const ffprobe = path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), "ffprobe") : "ffprobe";
  const probeResult = spawnSync(ffprobe, ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,avg_frame_rate,nb_read_frames", "-of", "json", outputPath], { encoding: "utf8", timeout: 30000 });
  assert.equal(probeResult.status, 0, probeResult.stderr);
  const encoded = JSON.parse(probeResult.stdout).streams[0];
  assert.equal(encoded.width, 1920);
  assert.equal(encoded.height, 1080);
  assert.equal(encoded.avg_frame_rate, "30/1");
  assert.equal(Number(encoded.nb_read_frames), 90);

  const finalFrame = spawnSync(ffmpeg, ["-v", "error", "-i", outputPath, "-vf", "select=eq(n\\,89)", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { encoding: null, timeout: 30000, maxBuffer: 12 * 1024 * 1024 });
  assert.equal(finalFrame.status, 0, finalFrame.stderr?.toString() || finalFrame.error?.message);
  assert.equal(finalFrame.stdout.length, 1920 * 1080 * 4, "the final encoded frame must decode at the actual stage dimensions");
  const evidence = {
    status: "asrcut-v2-film-recipe-render-verified",
    clock: { kind: film.source.clockKind, timelineFormat: timeline.format, durationSamples: timeline.durationSamples },
    scene: { width: scene.width, height: scene.height, fps: scene.fps, durationSec: scene.duration },
    recipe: { recipeId: recipe.recipeId, instanceId: recipe.id, childCallCount: motionSegment.motionRecipes.calls[recipe.id] },
    childReceipt: { path: path.relative(root, childReceiptPath), sha256: hash(childReceiptBytes), frameCount: childReceipt.render.frameCount },
    motionRendererReceipt: { path: path.relative(root, motionReceiptPath), sha256: hash(motionReceiptBytes), frameCount: motionReceipt.frameCount },
    finalOutput: { path: path.relative(root, outputPath), sha256: film.output.sha256, frameCount: Number(encoded.nb_read_frames), width: encoded.width, height: encoded.height, fps: encoded.avg_frame_rate, decodedFinalFrameSha256: hash(finalFrame.stdout) },
    assembler: "templates.mjs render --film-blueprint -> existing video-shotcraft-remotion /2 assembler -> existing asrcut edit-plan/timeline compiler -> native /1 child motion-scene render",
  };
  await fs.writeFile(path.join(runRoot, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
});

test("render.mjs exercises all 15 Garden recipes, captures a separate WebGL2 pass, and repeats sample pixels", { skip: !(browserAvailable && ffmpegAvailable && playwrightAvailable) }, async () => {
  await fs.mkdir(evidenceDir, { recursive: true });
  const playwright = createRequire(path.join(motionRuntimeModules, "motion-recipe-fixture.cjs"))("playwright");
  const fixtureBrowser = await playwright.chromium.launch({ executablePath: browser, headless: true, args: ["--disable-dev-shm-usage"] });
  try {
    const fixturePage = await fixtureBrowser.newPage({ viewport: { width: 640, height: 360 } });
    for (const [filename, color, title] of [["frame-before.png", "#17354a", "电池输入"], ["frame-after.png", "#315d38", "电站输出"], ["frame-alternate.png", "#963d2d", "替代状态"]]) {
      const dataUrl = await fixturePage.evaluate(({ color, title }) => {
        const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = color; ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = "#f5c04a"; ctx.fillRect(72, 104, 132, 152);
        ctx.fillStyle = "#f3f0df"; ctx.beginPath(); ctx.arc(410, 178, 74, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 34px sans-serif"; ctx.fillText(title, 235, 315);
        return canvas.toDataURL("image/png");
      }, { color, title });
      await fs.writeFile(path.join(evidenceDir, filename), Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
    }
  } finally { await fixtureBrowser.close(); }
  const scene = fixtureScene();
  const render = async (name, runScene = scene, sampleTimes = "0.25,1") => {
    const scenePath = path.join(evidenceDir, `${name}.scene.json`);
    await fs.writeFile(scenePath, `${JSON.stringify(runScene, null, 2)}\n`);
    const runRoot = path.join(evidenceDir, name);
    const cacheDir = path.join(root, ".cache", "tmp", "motion-showreel-integration", name);
    await fs.mkdir(runRoot, { recursive: true });
    await fs.mkdir(path.dirname(cacheDir), { recursive: true });
    const output = path.join(runRoot, "motion-recipe-technical-fixture.mp4");
    const result = spawnSync(process.execPath, [nodePath, "--scene", scenePath, "--output", output, "--cache-dir", cacheDir, "--browser", browser, "--ffmpeg", ffmpeg, "--samples", sampleTimes, "--overwrite"], {
      cwd: root,
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, NODE_PATH: process.env.NODE_PATH || motionRuntimeModules },
    });
    assert.equal(result.status, 0, `render.mjs failed for ${name}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    const manifestPath = /^MANIFEST\s+(.+)$/m.exec(result.stdout)?.[1]?.trim();
    assert.ok(manifestPath, result.stdout);
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    assert.equal(manifest.frameCount, Math.round(runScene.duration * runScene.fps));
    assert.equal(manifest.motionRecipes.sourceId, adapter.SOURCE_ID);
    assert.equal(manifest.motionRecipes.sourceCommit, adapter.SOURCE_COMMIT);
    const selectedRecipes = (runScene.objects || []).flatMap((object) => object.data?.motionRecipes || []);
    const selectedPosts = runScene.motionPostProcessing || [];
    for (const id of [...selectedRecipes.map((row) => row.id), ...selectedPosts.map((row) => row.id)]) {
      assert.ok(manifest.motionRecipes.calls[id] > 0, `recipe ${id} was not called`);
    }
    if (selectedPosts.length) {
      assert.ok(manifest.motionRecipes.webgl?.independentOutputCanvas && manifest.motionRecipes.webgl?.copiedBackBeforeCapture, "the WebGL post pass must capture through a separate output canvas");
    }
    if (selectedRecipes.some((row) => row.recipeId === "svg-stroke")) assert.match(manifest.motionRecipes.captureBoundary, /async source-SVG preparation/);
    if (selectedRecipes.some((row) => row.recipeId === "svg-stroke")) {
      assert.match(manifest.motionRecipes.svgBridge.mechanism, /pathLength=1.*stroke-dasharray=1.*CSS stroke-dashoffset/);
      assert.equal(manifest.motionRecipes.svgBridge.lastConsumed.instanceId, selectedRecipes.find((row) => row.recipeId === "svg-stroke").id);
      assert.ok(manifest.motionRecipes.svgBridge.preparedCount >= manifest.frameCount);
    }
    if (selectedPosts.length) assert.match(manifest.motionRecipes.captureBoundary, /separate output canvas.*copy back.*dataURL capture/);
    else assert.match(manifest.motionRecipes.captureBoundary, /2D stage capture.*dataURL capture/);
    const sourceFrameRecipes = selectedRecipes.filter((row) => ["zoom-through", "wipe-reveal", "canonical-beat-reveal"].includes(row.recipeId)
      && [row.parameters.from, row.parameters.to].some((panel) => panel?.type === "source-frame"));
    for (const row of sourceFrameRecipes) for (const side of ["from", "to"]) {
      if (row.parameters[side]?.type === "source-frame") assert.ok(manifest.motionRecipes.sourceFrames.consumed[`${row.id}.${side}`]?.count > 0, `${row.id}.${side} frozen source frame was not drawn`);
    }
    assert.equal(manifest.motionRecipes.clock, "scene-local seconds supplied by render.mjs; no recipe-local schedule or second timeline");
    const sample = manifest.samples.find((row) => row.requestedTime === 1);
    assert.ok(sample, "the requested scene-local sample must be captured");
    const frameIndex = Math.round(0.25 * runScene.fps);
    const framePath = path.join(manifest.frameDirectory, `${String(frameIndex).padStart(8, "0")}.png`);
    const sampleAt = manifest.samples.find((row) => row.requestedTime === 0.25);
    assert.ok(sampleAt, "the requested response sample must be captured");
    return {
      manifestPath,
      outputSha256: manifest.outputSha256,
      sampleSha256: hash(await fs.readFile(sample.file)),
      frameResponseSha256: hash(await fs.readFile(sampleAt.file)),
      encodedHitFrameSha256: hash(await fs.readFile(framePath)),
      recipeCallCounts: manifest.motionRecipes.calls,
      webgl: manifest.motionRecipes.webgl,
      transitions: manifest.transitions,
      beatBindings: manifest.motionRecipes.beatBindings || {},
      frameCount: manifest.frameCount,
      sampleHashes: Object.fromEntries(await Promise.all(manifest.samples.map(async (row) => [String(row.requestedTime), hash(await fs.readFile(row.file))]))),
      sampleFiles: Object.fromEntries(manifest.samples.map((row) => [String(row.requestedTime), row.file])),
    };
  };
  const first = await render("runtime-e2e-a");
  const second = await render("runtime-e2e-b");
  assert.equal(first.sampleSha256, second.sampleSha256, "repeated scene-local sample capture must have identical pixels");
  assert.equal(first.encodedHitFrameSha256, second.encodedHitFrameSha256, "repeated encoded frame capture must have identical pixels");
  const changedSourceFrameScene = structuredClone(scene);
  changedSourceFrameScene.objects[0].data.motionRecipes.find((row) => row.id === "cake-beat-reveal").parameters.from = sourceFrame("frame-alternate.png");
  const changedFrame = await render("runtime-e2e-source-frame-change", changedSourceFrameScene);
  assert.notEqual(first.frameResponseSha256, changedFrame.frameResponseSha256, "changing the source frame consumed by canonical reveal must change captured pixels");
  const isolatedResponses = [];
  for (const recipe of scene.objects[0].data.motionRecipes) {
    const isolated = structuredClone(scene); isolated.fps = 4;
    isolated.objects[0].data.motionRecipes = [structuredClone(recipe)];
    isolated.motionPostProcessing = [];
    const response = await render(`isolated-${recipe.recipeId}`, isolated, "0,0.25,1,1.5,2.9");
    const temporalSamples = ["0", "1", "2.9"].map((time) => response.sampleHashes[time]);
    if (recipe.recipeId === "canvas-perspective-boxes") {
      isolatedResponses.push({ recipeId: recipe.recipeId, instanceId: recipe.id, temporalSampleHashes: temporalSamples, timeInvariant: true });
      continue;
    }
    assert.ok(new Set(temporalSamples).size > 1, `${recipe.recipeId} isolated pixels must respond across before/middle/after scene-local samples`);
    isolatedResponses.push({ recipeId: recipe.recipeId, instanceId: recipe.id, temporalSampleHashes: temporalSamples });
  }
  const beatOnlyScene = structuredClone(scene);
  beatOnlyScene.objects[0].data.motionRecipes = [structuredClone(scene.objects[0].data.motionRecipes.find((row) => row.recipeId === "canonical-beat-reveal"))];
  beatOnlyScene.motionPostProcessing = [];
  const hitBeforeSec = 47 / 24, hitSec = 2, hitAfterSec = 49 / 24;
  const beatBoundary = await render("isolated-beat-reveal-boundary", beatOnlyScene, [0, 0.25, 1, hitBeforeSec, hitSec, hitAfterSec, 2.9].join(","));
  assert.ok(beatBoundary.transitions?.calls?.iris > 0, "beat reveal must call the pinned TRANSITIONS.iris method through its existing adapter");
  assert.ok(beatBoundary.transitions?.callsByInstance?.["cake-beat-reveal"]?.calls > 0);
  assert.equal(beatBoundary.beatBindings?.["cake-beat-b"]?.sourceTransition?.sourceId, "huashu-art-motion");
  const expectedB = rgbaAt(path.join(evidenceDir, "frame-after.png"), 320, 180);
  const boundaryPixels = {
    before: rgbaAt(beatBoundary.sampleFiles[String(hitBeforeSec)], 320, 180),
    hit: rgbaAt(beatBoundary.sampleFiles[String(hitSec)], 320, 180),
    after: rgbaAt(beatBoundary.sampleFiles[String(hitAfterSec)], 320, 180),
    expectedB,
  };
  assert.notDeepEqual(boundaryPixels.before, expectedB, "the incoming B frame must remain absent at the encoded frame before the hit");
  assert.deepEqual(boundaryPixels.hit, expectedB, "the incoming B pixel must first be visible in the encoded canonical hit frame");
  assert.deepEqual(boundaryPixels.after, expectedB, "the incoming B pixel must remain visible in the encoded frame after the hit");
  const beatBoundaryEvidence = {
    eventId: "cake-beat-b", frameRate: beatOnlyScene.fps, frameIndices: [47, 48, 49], requestedTimes: [hitBeforeSec, hitSec, hitAfterSec],
    centerPixelRGBA: boundaryPixels, incomingFramePixelFirstVisibleAtCanonicalHit: true,
    scope: "technical pixel-boundary verification for this frozen-frame fixture only; the 2px mapping, fixture colors, and center-pixel sample are not perceptual or aesthetic thresholds; normal-speed timing and punch fit remain unreviewed",
    transitionCall: beatBoundary.transitions.callsByInstance["cake-beat-reveal"],
    sourceMapping: beatBoundary.beatBindings["cake-beat-b"].sourceTransition,
  };
  const isolatedPost = structuredClone(scene); isolatedPost.fps = 4;
  isolatedPost.objects = [
    { id: "post-input-panel", type: "rect", space: "screen", x: 72, y: 58, width: 496, height: 244, fill: "#e04b3f", stroke: "#f8f7f3", lineWidth: 6 },
    { id: "post-input-label", type: "text", space: "screen", x: 120, y: 205, text: "源画面", font: "bold 48px sans-serif", fontSize: 48, fill: "#ffffff" },
  ];
  const postResponse = await render("isolated-webgl-crt-post", isolatedPost, "0,0.25,1,1.5,2.9");
  assert.ok(new Set(["0", "1", "2.9"].map((time) => postResponse.sampleHashes[time])).size > 1, "post recipe must respond to its canonical hit while isolated");
  const boxesBase = structuredClone(scene); boxesBase.fps = 4;
  boxesBase.objects[0].data.motionRecipes = [structuredClone(scene.objects[0].data.motionRecipes.find((row) => row.recipeId === "canvas-perspective-boxes"))];
  boxesBase.motionPostProcessing = [];
  const changedBoxes = structuredClone(boxesBase);
  changedBoxes.objects[0].data.motionRecipes[0].parameters.camera.yaw += 0.8;
  const boxesA = await render("isolated-boxes-a", boxesBase, "0,0.25,1,1.5,2.9");
  const boxesB = await render("isolated-boxes-b", changedBoxes, "0,0.25,1,1.5,2.9");
  assert.notEqual(boxesA.sampleHashes["1.5"], boxesB.sampleHashes["1.5"], "camera yaw parameter must alter isolated perspective-box pixels");
  isolatedResponses.push({ recipeId: "canvas-perspective-boxes", parameter: "camera.yaw", before: boxesA.sampleHashes["1"], after: boxesB.sampleHashes["1"] });
  await fs.writeFile(path.join(evidenceDir, "runtime-e2e-evidence.json"), `${JSON.stringify({ status: "technical-render-verified", first, second, changedFrame, isolatedResponses, beatBoundaryEvidence, postResponse: postResponse.sampleHashes, outputVideoHashEquality: first.outputSha256 === second.outputSha256, sourceFrameParameterChangesPixels: first.frameResponseSha256 !== changedFrame.frameResponseSha256 }, null, 2)}\n`);
});
