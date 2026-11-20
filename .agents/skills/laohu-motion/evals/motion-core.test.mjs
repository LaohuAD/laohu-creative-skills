import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { spawnSync } from "node:child_process";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corePath = path.join(skillDir, "scripts", "motion-core.js");
const localEffectLib = path.join(skillDir, "templates", "runtime", "laohu-native-clips", "lib");
const localModuleBySourceName = Object.fromEntries(["util.js", "paint.js", "kit.js", "motion.js", "camera.js", "diagram.js"].map((name) => [name, name]));
const opsPath = path.join(skillDir, "scripts", "motion-ops.js");
const effectsAdapterPath = path.join(skillDir, "templates", "adapters", "laohu-effects.js");
const legacyEffectsAdapterPath = path.join(skillDir, "templates", "adapters", "huashu-effects.js");
const require = createRequire(import.meta.url);
const MotionCore = require(corePath);
const MotionOps = require(opsPath);
const { chromium } = require("playwright");
const browserPath = process.env.MOTION_BROWSER;
const tempRoot = process.env.MOTION_TEST_TMP;
const validationRoot = process.env.MOTION_VALIDATION_DIR;

assert.ok(browserPath && path.isAbsolute(browserPath), "MOTION_BROWSER must be an absolute path to an installed browser");
assert.ok(tempRoot && path.isAbsolute(tempRoot), "MOTION_TEST_TMP must be an explicit absolute path on the project work disk");
assert.ok(validationRoot && path.isAbsolute(validationRoot), "MOTION_VALIDATION_DIR must be an explicit absolute evidence path");

const basicScene = (overrides = {}) => ({
  version: 1,
  width: 100,
  height: 100,
  fps: 10,
  duration: 2,
  background: "transparent",
  layers: [],
  objects: [],
  events: [],
  bindings: [],
  variables: {},
  ...overrides,
});

let context;
let page;

before(async () => {
  await fs.mkdir(tempRoot, { recursive: true });
  context = await chromium.launchPersistentContext(path.join(tempRoot, "browser-profile"), {
    executablePath: browserPath,
    headless: true,
    viewport: { width: 120, height: 120 },
  });
  page = await context.newPage();
  await page.setContent('<canvas id="stage" width="100" height="100"></canvas>');
  await page.addScriptTag({ path: corePath });
});

after(async () => {
  if (context) await context.close();
});

test("open an installed browser and load the real Canvas2D core", async () => {
  assert.equal(await page.evaluate(() => typeof window.MotionCore.drawFrame), "function");
});

test("the Laohu effects adapter is the single browser implementation", async () => {
  await fs.access(effectsAdapterPath);
  await assert.rejects(fs.access(legacyEffectsAdapterPath), { code: "ENOENT" });
});

test("shared effect modules resolve from the local runtime closure and retain pinned bytes", async () => {
  const closure = JSON.parse(await fs.readFile(path.join(skillDir, "templates", "runtime", "laohu-effects", "closure.json"), "utf8"));
  const manifest = new Map(closure.modules.map((row) => [row.sourcePath, row]));
  for (const sourceName of Object.keys(localModuleBySourceName)) {
    const sourcePath = `scripts/engine/lib/${sourceName}`;
    const row = manifest.get(sourcePath);
    assert.ok(row, `${sourcePath} is mapped by the local effect closure`);
    assert.equal(row.sharedWith, "laohu-native-clips", `${sourcePath} is a shared single local module`);
    const bytes = await fs.readFile(path.join(skillDir, "templates", "runtime", row.localPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256, `${sourcePath} retains the pinned implementation bytes`);
  }
});

test("canonical effects runtime keeps old Huashu browser globals and IDs on the same implementation", async () => {
  for (const library of ["util.js", "paint.js", "kit.js", "motion.js", "camera.js", "diagram.js"]) await page.addScriptTag({ path: path.join(localEffectLib, localModuleBySourceName[library]) });
  await page.addScriptTag({ path: opsPath });
  await page.addScriptTag({ path: effectsAdapterPath });
  const result = await page.evaluate(() => ({
    sameProvider: window.HuashuLocalEffects === window.LaohuMotionEffects,
    canonicalEffect: window.HuashuLocalEffects.DEFINITION["laohu-motion-dg-draw-partial"]?.sourceFunction,
    oldTargetTypeAccepted: window.HuashuLocalEffects.TARGET_TYPE === "custom:laohu-motion-target",
  }));
  assert.deepEqual(result, { sameProvider: true, canonicalEffect: "DG.drawPartial", oldTargetTypeAccepted: true });
});

test("legacy Huashu IDs execute through the canonical browser implementation", async () => {
  const legacyPage = await context.newPage();
  try {
    await legacyPage.setContent('<canvas id="legacy-stage" width="100" height="100"></canvas>');
    await legacyPage.addScriptTag({ path: corePath });
    for (const library of ["util.js", "paint.js", "kit.js", "motion.js", "camera.js", "diagram.js"]) {
      await legacyPage.addScriptTag({ path: path.join(localEffectLib, localModuleBySourceName[library]) });
    }
    await legacyPage.addScriptTag({ path: opsPath });
    await legacyPage.addScriptTag({ path: effectsAdapterPath });

    const result = await legacyPage.evaluate(() => {
      const scene = {
        version: 1,
        width: 100,
        height: 100,
        fps: 10,
        duration: 1,
        background: "transparent",
        phases: [{ id: "phase", startSec: 0, durationSec: 1, timeBasis: "scene-local" }],
        objects: [
          { id: "target", type: "rect", space: "screen", x: 40, y: 30, width: 24, height: 24, fill: "#222222" },
          {
            id: "legacy-effect",
            type: "custom:huashu-local-effects",
            space: "screen",
            data: { motionEffects: [{
              id: "legacy-brace",
              effectId: "huashu-dg-brace",
              targetId: "target",
              phaseId: "phase",
              geometry: { x: 40, y0: 30, y1: 54 },
              parameters: { color: "#ff3344", lineWidth: 3, depth: 12 },
            }] },
          },
        ],
        events: [],
        bindings: [],
        variables: {},
      };
      const registry = window.HuashuLocalEffects.register({});
      window.MotionCore.drawFrame(document.getElementById("legacy-stage"), scene, 0.6, registry);
      const pixels = document.getElementById("legacy-stage").getContext("2d").getImageData(0, 0, 100, 100).data;
      let paintedPixels = 0;
      for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset] !== 0) paintedPixels += 1;
      const validated = window.MotionOps.validateLocalEffects(scene);
      return {
        legacyGlobalIsCanonical: window.HuashuLocalEffects === window.LaohuMotionEffects,
        oldEffectTypeRegistered: typeof registry["custom:huashu-local-effects"] === "function",
        canonicalEffectTypeRegistered: typeof registry["custom:laohu-motion-effects"] === "function",
        effectIdResolved: validated[0]?.effectId,
        renderedPixels: paintedPixels,
      };
    });
    assert.equal(result.legacyGlobalIsCanonical, true);
    assert.equal(result.oldEffectTypeRegistered, true);
    assert.equal(result.canonicalEffectTypeRegistered, true);
    assert.equal(result.effectIdResolved, "laohu-motion-dg-brace");
    assert.ok(result.renderedPixels > 0, "the old raw browser path executes the source-backed renderer");
  } finally {
    await legacyPage.close();
  }
});

test("the canonical raw browser adapter independently cold-loads canonical Laohu IDs", async () => {
  const canonicalPage = await context.newPage();
  try {
    await canonicalPage.setContent('<canvas id="canonical-stage" width="100" height="100"></canvas>');
    await canonicalPage.addScriptTag({ path: corePath });
    for (const library of ["util.js", "paint.js", "kit.js", "motion.js", "camera.js", "diagram.js"]) {
      await canonicalPage.addScriptTag({ path: path.join(localEffectLib, localModuleBySourceName[library]) });
    }
    await canonicalPage.addScriptTag({ path: opsPath });
    await canonicalPage.addScriptTag({ path: effectsAdapterPath });
    const result = await canonicalPage.evaluate(() => {
      const phase = { id: "canonical-phase", startSec: 0, durationSec: 1, timeBasis: "scene-local" };
      const scene = {
        version: 1, width: 100, height: 100, fps: 10, duration: 1, background: "transparent",
        phases: [phase],
        objects: [
          { id: "target", type: "rect", space: "screen", x: 40, y: 30, width: 24, height: 24, fill: "#222222" },
          { id: "effects", type: "custom:laohu-motion-effects", space: "screen", data: { motionEffects: [{
            id: "canonical-brace", effectId: "laohu-motion-dg-brace", targetId: "target", phaseId: phase.id,
            geometry: { x: 40, y0: 30, y1: 54 }, parameters: { color: "#33aaee", lineWidth: 3, depth: 12 },
          }] } },
        ],
        events: [], bindings: [], variables: {},
      };
      const registry = window.LaohuMotionEffects.register({});
      window.MotionCore.drawFrame(document.getElementById("canonical-stage"), scene, 0.6, registry);
      const pixels = document.getElementById("canonical-stage").getContext("2d").getImageData(0, 0, 100, 100).data;
      let paintedPixels = 0;
      for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset] !== 0) paintedPixels += 1;
      const validated = window.MotionOps.validateLocalEffects(scene);
      return {
        canonicalGlobalAvailable: window.LaohuMotionEffects === window.HuashuLocalEffects,
        canonicalRendererRegistered: typeof registry["custom:laohu-motion-effects"] === "function",
        canonicalIdResolved: validated[0]?.effectId,
        renderedPixels: paintedPixels,
      };
    });
    assert.equal(result.canonicalGlobalAvailable, true);
    assert.equal(result.canonicalRendererRegistered, true);
    assert.equal(result.canonicalIdResolved, "laohu-motion-dg-brace");
    assert.ok(result.renderedPixels > 0, "the canonical raw browser path executes the original source-backed renderer");
  } finally {
    await canonicalPage.close();
  }
});

test("legacy four-argument custom renderers retain their original scene and pixel behavior", async () => {
  const scene = basicScene({
    objects: [{ id: "legacy-callback", type: "custom:legacy-four-argument", space: "screen", x: 20, y: 24 }],
  });
  const result = await page.evaluate((scene) => {
    const canvas = document.getElementById("stage");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let callbackInputs;
    const renderers = {
      "custom:legacy-four-argument": function legacyRenderer(context, object, timeSec, receivedScene) {
        callbackInputs = { id: object.id, timeSec, sceneIsSame: receivedScene === scene };
        context.fillStyle = "#00ff00";
        context.fillRect(object.x, object.y, 8, 8);
      },
    };
    window.MotionCore.drawFrame(canvas, scene, 0.5, renderers);
    const pixels = ctx.getImageData(0, 0, 100, 100).data;
    const offset = (28 * 100 + 24) * 4;
    return { callbackInputs, pixel: Array.from(pixels.slice(offset, offset + 4)) };
  }, scene);
  assert.deepEqual(result.callbackInputs, { id: "legacy-callback", timeSec: 0.5, sceneIsSame: true });
  assert.deepEqual(result.pixel, [0, 255, 0, 255], "the legacy callback paints the same authored pixel region");
});

test("time seeking is deterministic and nested event state never mutates the source scene", () => {
  const scene = basicScene({
    layers: [{ id: "board", transform: { x: 2, scale: 1 } }],
    events: [{ id: "move-board", target: { kind: "layer", id: "board" }, property: "transform.x", start: 0, duration: 2, from: 2, to: 22 }],
  });
  const source = JSON.stringify(scene);
  const lateA = MotionCore.evaluateScene(scene, 1.5);
  MotionCore.evaluateScene(scene, 0.25);
  const lateB = MotionCore.evaluateScene(scene, 1.5);
  assert.equal(lateA.layers.board.transform.x, 17);
  assert.deepEqual(lateB.layers.board.transform, lateA.layers.board.transform);
  assert.equal(JSON.stringify(scene), source);
});

test("events hold their terminal value, bindings map variables, and property collisions are rejected", () => {
  const scene = basicScene({
    variables: { amount: 0 },
    objects: [{ id: "bar", type: "rect", x: 0, y: 0, width: 10, height: 10 }],
    events: [{ id: "amount-up", target: { kind: "variable", id: "amount" }, start: 0, duration: 1, from: 0, to: 1 }],
    bindings: [{ source: "amount", target: { kind: "object", id: "bar", property: "width" }, input: [0, 1], output: [10, 30] }],
  });
  assert.equal(MotionCore.evaluateScene(scene, 1.5).objects.bar.width, 30);
  const conflict = basicScene({
    objects: [{ id: "bar", type: "rect" }],
    events: [
      { id: "a", target: { kind: "object", id: "bar" }, property: "x", start: 0, duration: 2, from: 0, to: 10 },
      { id: "b", target: { kind: "object", id: "bar" }, property: "x", start: 1, duration: 1, from: 10, to: 20 },
    ],
  });
  assert.match(MotionCore.validateScene(conflict).map((item) => item.message).join(" "), /overlaps event/);
});

test("invalid types and morph correspondences fail as located validation errors", () => {
  const badType = basicScene({ objects: [{ id: "missing-type" }] });
  assert.ok(MotionCore.validateScene(badType).some((item) => item.path === "objects[0].type"));
  const badMorph = basicScene({ objects: [{
    id: "shape", type: "path", morph: {
      from: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      to: [{ x: 0, y: 0 }, { x: 2, y: 2 }],
      anchors: [{ from: 0, to: 0 }, { from: 0.8, to: 0.8 }, { from: 0.7, to: 0.9 }, { from: 1, to: 1 }],
    },
  }] });
  assert.ok(MotionCore.validateScene(badMorph).some((item) => item.path === "objects[0].morph"));
});

test("optional camera defaults to a centered, reversible transform", () => {
  const camera = {};
  const point = { x: 17, y: 72 };
  const mapped = MotionCore.worldToScreen(point, camera, 100, 100);
  assert.deepEqual(mapped, point);
  const roundTrip = MotionCore.screenToWorld(mapped, camera, 100, 100);
  assert.ok(Math.abs(roundTrip.x - point.x) < 1e-9 && Math.abs(roundTrip.y - point.y) < 1e-9);
  const anchored = MotionCore.cameraForAnchor({ x: 40, y: 50 }, { x: 70, y: 45 }, 2, 100, 100, 0);
  assert.deepEqual(MotionCore.worldToScreen({ x: 40, y: 50 }, anchored, 100, 100), { x: 70, y: 45 });
});

test("real pixels preserve clips, group opacity, path progress, mixed-scale alignment, and panned world layers", async () => {
  async function pixels(scene, time = 0) {
    return page.evaluate(({ scene, time }) => {
      const canvas = document.getElementById("stage");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      window.MotionCore.drawFrame(canvas, scene, time);
      return Array.from(ctx.getImageData(0, 0, 100, 100).data);
    }, { scene, time });
  }
  function rgba(data, x, y) {
    const offset = (y * 100 + x) * 4;
    return data.slice(offset, offset + 4);
  }

  const defaultView = basicScene({
    objects: [{ id: "unconfigured-view", type: "rect", x: 10, y: 10, width: 8, height: 8, fill: "#ffffff" }],
  });
  const defaultViewPixels = await pixels(defaultView);
  assert.deepEqual(rgba(defaultViewPixels, 14, 14), [255, 255, 255, 255], "an omitted camera preserves authored stage coordinates");

  const mixedSpaces = basicScene({
    camera: { x: 50, y: 50, zoom: 1 },
    objects: [
      { id: "world-item", type: "rect", x: 50, y: 50, width: 8, height: 8, fill: "#ff0000" },
      { id: "screen-item", type: "rect", space: "screen", x: 4, y: 4, width: 8, height: 8, fill: "#00ffff" },
    ],
  });
  const spacePixels = await pixels(mixedSpaces);
  assert.deepEqual(rgba(spacePixels, 52, 52), [255, 0, 0, 255], "world objects receive the camera transform");
  assert.deepEqual(rgba(spacePixels, 8, 8), [0, 255, 255, 255], "screen objects retain fixed overlay coordinates");

  const clipped = basicScene({
    layers: [{ id: "window", space: "screen", clip: { type: "rect", x: 10, y: 10, width: 20, height: 20 } }],
    objects: [{ id: "wash", type: "rect", layer: "window", x: 0, y: 0, width: 50, height: 50, fill: "#ff0000" }],
  });
  const clipPixels = await pixels(clipped);
  assert.deepEqual(rgba(clipPixels, 15, 15), [255, 0, 0, 255]);
  assert.deepEqual(rgba(clipPixels, 5, 15), [0, 0, 0, 0]);
  assert.deepEqual(rgba(clipPixels, 35, 15), [0, 0, 0, 0]);

  const grouped = basicScene({
    layers: [{ id: "ghost", space: "screen", opacity: 0.5 }],
    objects: [
      { id: "left", type: "rect", layer: "ghost", x: 20, y: 20, width: 30, height: 30, fill: "#ff0000" },
      { id: "right", type: "rect", layer: "ghost", x: 35, y: 20, width: 30, height: 30, fill: "#ff0000" },
    ],
  });
  const groupPixels = await pixels(grouped);
  assert.equal(rgba(groupPixels, 40, 30)[3], 128, "overlapping children receive group alpha once");

  const pathScene = basicScene({
    objects: [{ id: "stroke", type: "path", points: [{ x: 10, y: 50 }, { x: 90, y: 50 }], stroke: "#00ff00", lineWidth: 8, progress: 0 }],
    events: [{ id: "trace", target: { kind: "object", id: "stroke" }, property: "progress", start: 0, duration: 1, from: 0, to: 1 }],
  });
  const halfPath = await pixels(pathScene, 0.5);
  assert.ok(rgba(halfPath, 45, 50)[1] > 200, "the visible stroke reaches its time-derived midpoint");
  assert.equal(rgba(halfPath, 70, 50)[3], 0, "the unreached endpoint stays transparent");

  const morphScene = basicScene({
    objects: [{
      id: "moving-line",
      type: "path",
      stroke: "#ffffff",
      lineWidth: 6,
      morph: {
        from: [{ x: 20, y: 20 }, { x: 20, y: 80 }],
        to: [{ x: 80, y: 20 }, { x: 80, y: 80 }],
        anchors: [{ from: 0, to: 0 }, { from: 1, to: 1 }],
      },
      morphProgress: 0,
    }],
    events: [{ id: "morph", target: { kind: "object", id: "moving-line" }, property: "morphProgress", start: 0, duration: 2, from: 0, to: 1 }],
  });
  const morphPixels = await pixels(morphScene, 1);
  assert.ok(rgba(morphPixels, 50, 50)[3] > 200, "the paired path correspondence is rendered at its interpolated position");
  assert.equal(rgba(morphPixels, 20, 50)[3], 0, "the old path is no longer visible at the midpoint");

  const mixed = basicScene({
    camera: { x: 50, y: 50, zoom: 2 },
    objects: [
      { id: "pixel-plane", type: "pixels", x: 50, y: 50, pixelSize: 10, cells: [{ x: 0, y: 0, color: "#00ff00" }] },
      { id: "vector-inset", type: "rect", x: 52, y: 52, width: 6, height: 6, fill: "#0000ff" },
    ],
  });
  const mixedPixels = await pixels(mixed);
  assert.deepEqual(rgba(mixedPixels, 51, 51), [0, 255, 0, 255], "camera maps the pixel cell's outer area");
  assert.deepEqual(rgba(mixedPixels, 55, 55), [0, 0, 255, 255], "vector inset remains aligned inside the transformed pixel cell");

  const pannedBoard = basicScene({
    camera: { x: 355, y: 50, zoom: 1 },
    layers: [{ id: "long-board", space: "world" }],
    objects: [{ id: "offscreen-anchor", type: "rect", layer: "long-board", x: 350, y: 45, width: 10, height: 10, fill: "#ff00ff" }],
  });
  const pannedPixels = await pixels(pannedBoard);
  assert.deepEqual(rgba(pannedPixels, 50, 50), [255, 0, 255, 255], "world content outside the original viewport is visible after camera pan");

  const seekScene = basicScene({
    objects: [{ id: "dot", type: "circle", cx: 20, cy: 50, r: 5, fill: "#ffffff" }],
    events: [{ id: "travel", target: { kind: "object", id: "dot" }, property: "cx", start: 0, duration: 2, from: 20, to: 80 }],
  });
  const seekA = await pixels(seekScene, 1.35);
  await pixels(seekScene, 0.1);
  const seekB = await pixels(seekScene, 1.35);
  assert.deepEqual(seekB, seekA, "rendering frames out of order gives identical pixels");
});

test("measured text layout preserves content and keeps punctuation, Latin words, and number units together", async () => {
  const text = "注意力，Transformer 2.0亿个参数一起工作。";
  const scene = basicScene({
    width: 240,
    height: 150,
    objects: [{
      id: "explanation",
      type: "text",
      text,
      x: 8,
      y: 28,
      font: "18px Arial, sans-serif",
      fill: "#ffffff",
      maxWidth: 132,
      lineHeight: 24,
    }],
  });
  const rendered = await page.evaluate((scene) => {
    const canvas = document.createElement("canvas");
    canvas.width = scene.width;
    canvas.height = scene.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const measured = window.MotionCore.layoutText(ctx, scene.objects[0].text, {
      maxWidth: scene.objects[0].maxWidth,
      lineHeight: scene.objects[0].lineHeight,
    });
    window.MotionCore.drawFrame(canvas, scene, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const rows = [];
    for (let y = 0; y < canvas.height; y += 1) {
      let count = 0;
      for (let x = 0; x < canvas.width; x += 1) if (pixels[(y * canvas.width + x) * 4 + 3] > 0) count += 1;
      if (count) rows.push(y);
    }
    const bands = [];
    for (const y of rows) {
      const last = bands.at(-1);
      if (last && y <= last.end + 1) last.end = y;
      else bands.push({ start: y, end: y });
    }
    return { measured, bands };
  }, scene);

  const { lines, widths, lineHeight, height } = rendered.measured;
  assert.ok(lines.length >= 2 && lines.length < 4, `expected real measured wrapping without character-by-character fragmentation, got ${JSON.stringify(lines)}`);
  assert.equal(lines.join(""), text, "line breaks preserve every source character, including spaces and punctuation");
  assert.equal(widths.length, lines.length);
  assert.ok(widths.every((width) => width <= scene.objects[0].maxWidth), `wrapped lines should fit the requested width: ${widths}`);
  assert.equal(lineHeight, 24);
  assert.equal(height, lines.length * 24);
  assert.ok(lines.some((line) => line.includes("Transformer")), "an English word is not split across lines");
  assert.equal(lines.filter((line) => line.includes("Transformer")).length, 1);
  assert.ok(lines.some((line) => line.includes("2.0亿个")), "a number and attached Chinese unit remain together");
  const englishSentence = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = "16px Arial, sans-serif";
    return window.MotionCore.layoutText(ctx, "Readable English. Next sentence.", { maxWidth: 130 }).lines;
  });
  assert.ok(englishSentence.every((line) => !".,!?;:)".includes(Array.from(line)[0])), `English closing punctuation must stay with the preceding word: ${JSON.stringify(englishSentence)}`);
  const closingMarks = "，。！？；：、）》】〕〉》」』”’％‰℃,!?;:)]}";
  const openingMarks = "（【〔〈《「『“‘([{";
  assert.ok(lines.every((line) => !closingMarks.includes(Array.from(line)[0])), "a closing mark must not begin a wrapped line");
  assert.ok(lines.every((line) => !openingMarks.includes(Array.from(line).at(-1))), "an opening mark must not end a wrapped line");
  assert.ok(rendered.bands.length >= lines.length, "the text renderer visibly paints every measured line");
  assert.ok(rendered.bands.at(-1).start - rendered.bands[0].start >= lineHeight - 3, "separate measured lines appear at their configured vertical interval");
  const bracketSequence = "甲（），乙";
  const bracketLayout = await page.evaluate((value) => {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = "16px sans-serif";
    return window.MotionCore.layoutText(ctx, value, { maxWidth: 20 }).lines.join("");
  }, bracketSequence);
  assert.equal(bracketLayout, bracketSequence, "an empty bracket pair followed by a closing comma must retain every character");
});

test("letter-spacing fallback honors center/right anchors using real Canvas measurement", async () => {
  const result = await page.evaluate(() => {
    const supportsNative = "letterSpacing" in document.createElement("canvas").getContext("2d");
    const render = (align, hideNativeSpacing) => {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 80;
      const raw = canvas.getContext("2d", { willReadFrequently: true });
      const proxy = hideNativeSpacing ? new Proxy(raw, {
        has(target, key) {
          return key === "letterSpacing" ? false : Reflect.has(target, key);
        },
        get(target, key) {
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, key, value) {
          return Reflect.set(target, key, value, target);
        },
      }) : raw;
      const scene = {
        version: 1, width: canvas.width, height: canvas.height, fps: 10, duration: 1,
        background: "transparent", layers: [], events: [], bindings: [], variables: {},
        objects: [{ id: "tracked", type: "text", text: "AI 2026", x: 120, y: 45, align, font: "700 24px Arial, sans-serif", letterSpacing: 2, fill: "#fff" }],
      };
      const drawingCanvas = hideNativeSpacing ? { width: canvas.width, height: canvas.height, getContext: () => proxy } : canvas;
      window.MotionCore.drawFrame(drawingCanvas, scene, 0);
      const pixels = raw.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width, maxX = -1;
      for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
      return { minX, maxX };
    };
    const pairs = ["center", "right"].map((align) => ({
      align,
      native: render(align, false),
      fallback: render(align, true),
    }));
    return { supportsNative, pairs };
  });
  assert.equal(result.supportsNative, true, "the installed Chrome Canvas supports a native reference path");
  for (const { align, native, fallback } of result.pairs) {
    assert.ok(Math.abs(native.minX - fallback.minX) <= 2, `${align} fallback start drifted: ${JSON.stringify({ native, fallback })}`);
    assert.ok(Math.abs(native.maxX - fallback.maxX) <= 2, `${align} fallback end drifted: ${JSON.stringify({ native, fallback })}`);
  }
});

test("font shorthand descriptors survive a real animated fontSize override", async () => {
  const makeTextScene = (font, fontSize, events = []) => basicScene({
    width: 200,
    height: 100,
    objects: [{ id: "title", type: "text", text: "AI注意力", x: 10, y: 62, font, fontSize, fill: "#ffffff" }],
    events,
  });
  const reference = makeTextScene("700 14px Arial", undefined);
  const overridden = makeTextScene("700 12px Arial", 14);
  const animated = makeTextScene("700 12px Arial", 14, [
    { id: "grow", target: { kind: "object", id: "title" }, property: "fontSize", start: 0, duration: 1, from: 14, to: 38 },
  ]);
  const bounds = await page.evaluate(({ reference, overridden, animated }) => {
    function visibleBounds(scene, time) {
      const canvas = document.createElement("canvas");
      canvas.width = scene.width;
      canvas.height = scene.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      window.MotionCore.drawFrame(canvas, scene, time);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] === 0) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      return { width: maxX - minX + 1, height: maxY - minY + 1 };
    }
    return {
      reference: visibleBounds(reference, 0),
      overridden: visibleBounds(overridden, 0),
      start: visibleBounds(animated, 0),
      middle: visibleBounds(animated, 0.5),
      end: visibleBounds(animated, 1),
    };
  }, { reference, overridden, animated });

  assert.deepEqual(bounds.overridden, bounds.reference, "fontSize overrides only the shorthand's size while retaining its weight and family");
  assert.deepEqual(bounds.start, bounds.overridden, "the event's initial fontSize is used even when font is present");
  assert.ok(bounds.middle.height > bounds.start.height, "the midpoint fontSize changes the encoded glyph dimensions");
  assert.ok(bounds.end.height > bounds.middle.height, "the terminal fontSize changes the encoded glyph dimensions");
  assert.ok(bounds.end.height > bounds.start.height * 2, `expected a visible size change, got ${JSON.stringify(bounds)}`);
});

test("ease names are explicit, omitted easing remains linear, and normalized events stay bounded", () => {
  const makeScene = (easeName) => basicScene({
    objects: [{ id: "dot", type: "circle", cx: 0, cy: 50, r: 4, fill: "#fff" }],
    events: [{ id: "move", target: { kind: "object", id: "dot" }, property: "cx", start: 0, duration: 1, from: 0, to: 10, ...(easeName === undefined ? {} : { ease: easeName }) }],
  });
  const linear = makeScene(undefined);
  assert.equal(MotionCore.evaluateScene(linear, 0.25).objects.dot.cx, 2.5, "omitting ease retains linear interpolation");
  assert.equal(MotionCore.evaluateScene(makeScene(null), 0.25).objects.dot.cx, 2.5, "a null ease is treated as omitted, consistent with validation");
  assert.equal(MotionCore.evaluateScene(makeScene("ease-in-cubic"), 0.5).objects.dot.cx, 1.25);
  assert.equal(MotionCore.evaluateScene(makeScene("ease-out-cubic"), 0.5).objects.dot.cx, 8.75);
  const unknown = makeScene("ease-bounce-custom");
  assert.ok(MotionCore.validateScene(unknown).some((error) => error.path === "events[0].ease"));
  assert.throws(() => MotionCore.evaluateScene(unknown, 0.5), /unsupported ease ease-bounce-custom/);
  assert.throws(() => MotionCore.evaluateScene(unknown, 0.5, true), /unsupported ease ease-bounce-custom/, "the direct evaluator also rejects invalid names if validation was intentionally skipped");
  assert.ok(MotionCore.evaluateScene(makeScene("ease-out-cubic"), 0.5).objects.dot.cx <= 10, "normalized interpolation does not overshoot its endpoint");
});

test("runner renders a short synthetic technical fixture to MP4 and records event samples", async () => {
  await fs.mkdir(validationRoot, { recursive: true });
  const scenePath = path.join(validationRoot, "technical-fixture.json");
  const drawModulePath = path.join(validationRoot, "technical-readiness-hook.js");
  const outputPath = path.join(validationRoot, "technical-fixture.mp4");
  const cachePath = path.join(tempRoot, "runner-cache");
  const ffmpegPath = process.env.MOTION_FFMPEG;
  assert.ok(ffmpegPath && path.isAbsolute(ffmpegPath), "MOTION_FFMPEG must be an explicit absolute path to an existing executable");
  const fixture = basicScene({
    width: 160,
    height: 90,
    fps: 12,
    duration: 2,
    background: "#101820",
    variables: { progress: 0 },
    objects: [
      { id: "track", type: "rect", x: 20, y: 38, width: 120, height: 14, fill: "#243b53", opacity: 1 },
      { id: "marker", type: "circle", cx: 20, cy: 45, r: 9, fill: "#f0b429" },
    ],
    events: [{ id: "progress", target: { kind: "variable", id: "progress" }, start: 0, duration: 1.5, from: 0, to: 1 }],
    bindings: [{ source: "progress", target: { kind: "object", id: "marker", property: "cx" }, input: [0, 1], output: [20, 140] }],
  });
  fixture.events.push({ id: "late-track-fade", target: { kind: "object", id: "track" }, property: "opacity", start: 1, duration: 1, from: 1, to: 0.2 });
  await fs.writeFile(drawModulePath, 'window.MOTION_READY = new Promise((resolve) => setTimeout(() => resolve(true), 25));\nwindow.MOTION_RENDERERS = {};\n');
  await fs.writeFile(scenePath, `${JSON.stringify(fixture, null, 2)}\n`);
  const runner = path.join(skillDir, "scripts", "render.mjs");
  const result = spawnSync(process.execPath, [runner, "--scene", scenePath, "--output", outputPath, "--cache-dir", cachePath, "--browser", browserPath, "--ffmpeg", ffmpegPath, "--draw-module", drawModulePath, "--samples", "0,0.75,1.5,1.916667", "--overwrite"], {
    encoding: "utf8",
    env: { ...process.env, TMPDIR: tempRoot },
    timeout: 180_000,
  });
  assert.equal(result.status, 0, `runner failed\n${result.stdout}\n${result.stderr}`);
  const manifestPath = result.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
  assert.ok(manifestPath && path.isAbsolute(manifestPath), `runner did not report an absolute manifest path: ${result.stdout}`);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.frameCount, 24);
  assert.deepEqual(manifest.samples.map((sample) => sample.time), [0, 0.75, 1.5, 1.916667]);
  const progressEvent = manifest.eventStates.find((event) => event.id === "progress");
  assert.equal(progressEvent.idealTerminal.value, 1);
  assert.equal(progressEvent.settledInEncodedMedia, true);
  const lateEvent = manifest.eventStates.find((event) => event.id === "late-track-fade");
  assert.ok(Math.abs(lateEvent.idealTerminal.value - 0.2) < 1e-9);
  assert.equal(lateEvent.settledInEncodedMedia, false, "an event ending at scene duration is not called complete without a terminal encoded frame");
  assert.ok(lateEvent.lastEncodedFrame.value > lateEvent.idealTerminal.value, "the last encoded frame preserves its actual pre-terminal property value");
  assert.equal(manifest.readiness.motion, "resolved");
  assert.equal(manifest.samples.at(-1).kind, "separate-preview", "a non-frame-aligned sample is not labeled as an encoded frame");
  assert.ok(manifest.samples.at(-1).encodedFrameIndex === null);
  assert.ok(manifest.frameDirectory.startsWith(`${cachePath}${path.sep}`), `runner frame cache must stay under the requested cache directory: ${manifest.frameDirectory}`);
  assert.equal((await fs.stat(outputPath)).size > 1000, true);
  const outputFrames = await fs.readdir(manifest.frameDirectory);
  assert.equal(outputFrames.filter((file) => file.endsWith(".png")).length, 24);
  const decoded = spawnSync(ffmpegPath, ["-v", "error", "-i", outputPath, "-f", "null", "-"], { encoding: "utf8", timeout: 60_000 });
  assert.equal(decoded.status, 0, `FFmpeg could not decode the generated MP4: ${decoded.stderr}`);
  assert.ok(manifest.render.width === 160 && manifest.render.height === 90 && manifest.render.fps === 12);

  const handoffScenePath = path.join(validationRoot, "non-frame-aligned-handoff.json");
  const handoffOutputPath = path.join(validationRoot, "non-frame-aligned-handoff.mp4");
  const handoffFixture = basicScene({
    fps: 10,
    duration: 1.5,
    objects: [{ id: "handoff-marker", type: "circle", cx: 0, cy: 50, r: 5, fill: "#ffffff" }],
    events: [
      { id: "handoff-a", target: { kind: "object", id: "handoff-marker" }, property: "cx", start: 0, duration: 0.51, from: 0, to: 10 },
      { id: "handoff-b", target: { kind: "object", id: "handoff-marker" }, property: "cx", start: 0.51, duration: 0.49, from: 10, to: 20 },
    ],
  });
  await fs.writeFile(handoffScenePath, `${JSON.stringify(handoffFixture, null, 2)}\n`);
  const handoffResult = spawnSync(process.execPath, [runner, "--scene", handoffScenePath, "--output", handoffOutputPath, "--cache-dir", cachePath, "--browser", browserPath, "--ffmpeg", ffmpegPath, "--samples", "0,0.6", "--overwrite"], {
    encoding: "utf8",
    env: { ...process.env, TMPDIR: tempRoot },
    timeout: 180_000,
  });
  assert.equal(handoffResult.status, 0, `non-frame-aligned handoff render failed\n${handoffResult.stdout}\n${handoffResult.stderr}`);
  const handoffManifestPath = handoffResult.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
  assert.ok(handoffManifestPath && path.isAbsolute(handoffManifestPath), `handoff runner did not report an absolute manifest path: ${handoffResult.stdout}`);
  const handoffManifest = JSON.parse(await fs.readFile(handoffManifestPath, "utf8"));
  assert.equal(handoffManifest.frameCount, 15);
  const handoffEvent = handoffManifest.eventStates.find((event) => event.id === "handoff-a");
  assert.equal(handoffEvent.idealTerminal.value, 10, "the ideal terminal is this event's declared `to`, not later evaluated state");
  assert.equal(handoffEvent.firstCompleteEncodedFrame.time, 0.6, "the first encoded sample after 0.51s at 10fps is 0.6s");
  assert.ok(handoffEvent.firstCompleteEncodedFrame.actualTargetValue > 10, "the next event has moved the property by the first eligible encoded frame");
  assert.equal(handoffEvent.firstCompleteEncodedFrame.matchesEventTerminalValue, false);
  assert.equal(handoffEvent.endpointPresentInEncodedMedia, false);
  assert.equal(handoffEvent.settledInEncodedMedia, false, "a later controller taking over before the next encoded frame does not prove the earlier endpoint was encoded");
  assert.deepEqual(handoffEvent.subsequentControllersByFirstCompleteFrame, [{
    id: "handoff-b",
    start: 0.51,
    end: 1,
    hasTakenOverByFirstCompleteFrame: true,
    stillAnimatingAtFirstCompleteFrame: true,
  }]);
  const handoffDecoded = spawnSync(ffmpegPath, ["-v", "error", "-i", handoffOutputPath, "-f", "null", "-"], { encoding: "utf8", timeout: 60_000 });
  assert.equal(handoffDecoded.status, 0, `FFmpeg could not decode the handoff MP4: ${handoffDecoded.stderr}`);
});

test("four local effects call the original DG/MO functions, bind shared phases, isolate state, and seek deterministically", async () => {
  for (const library of ["util.js", "paint.js", "kit.js", "motion.js", "camera.js", "diagram.js"]) {
    await page.addScriptTag({ path: path.join(localEffectLib, localModuleBySourceName[library]) });
  }
  await page.addScriptTag({ path: opsPath });
  await page.addScriptTag({ path: effectsAdapterPath });

  const cases = [
    {
      effectId: "huashu-dg-draw-partial",
      target: { id: "target", type: "line", space: "screen", x1: 12, y1: 76, x2: 86, y2: 24, stroke: "none", lineWidth: 2 },
      geometry: { points: [[12, 76], [86, 24]] },
      parameters: { color: "#ff3344", lineWidth: 4 },
      persistsAfterEnd: true,
    },
    {
      effectId: "huashu-dg-circumscribe",
      target: { id: "target", type: "rect", space: "screen", x: 24, y: 28, width: 42, height: 32, fill: "#242424" },
      geometry: { rect: { x: 24, y: 28, width: 42, height: 32 } },
      parameters: { color: "#ff3344", lineWidth: 4, timeWidth: 0.35 },
      persistsAfterEnd: false,
    },
    {
      effectId: "huashu-dg-brace",
      target: { id: "target", type: "rect", space: "screen", x: 24, y: 18, width: 42, height: 64, fill: "#242424" },
      geometry: { x: 24, y0: 18, y1: 82 },
      parameters: { color: "#ff3344", lineWidth: 4, depth: 18 },
      persistsAfterEnd: true,
    },
    {
      effectId: "huashu-dg-indicate-frame-pulse",
      target: { id: "target", type: "rect", space: "screen", x: 24, y: 28, width: 42, height: 32, fill: "#242424" },
      geometry: { rect: { x: 24, y: 28, width: 42, height: 32 } },
      parameters: { color: "#ff3344", lineWidth: 4, timeWidth: 0.35, scale: 1 },
      persistsAfterEnd: false,
    },
  ];
  const scenes = cases.map((item) => ({
    effectId: item.effectId,
    persistsAfterEnd: item.persistsAfterEnd,
    scene: basicScene({
      duration: 1,
      objects: [item.target, {
        id: "local-effects",
        type: "custom:huashu-local-effects",
        space: "screen",
        data: {
          phases: [{ id: "shared-emphasis", startSec: 0.1, durationSec: 0.6, timeBasis: "scene-local", curve: "linear" }],
          audioEvents: [{ id: "emphasis-sound", phaseId: "shared-emphasis", phaseOffsetSec: 0.05 }],
          motionEffects: [{
            id: `${item.effectId}-instance`,
            effectId: item.effectId,
            targetId: "target",
            phaseId: "shared-emphasis",
            geometry: item.geometry,
            parameters: item.parameters,
            stagger: { groupId: `one-${item.effectId}`, index: 0, count: 1, ratio: 0.1 },
          }],
        },
      }],
    }),
  }));

  const evidence = await page.evaluate(async (cases) => {
    window.U.setStage(100, 100);
    window.MOTION_RENDERERS = {};
    window.HuashuLocalEffects.register(window.MOTION_RENDERERS);
    window.MOTION_LOCAL_EFFECT_EVIDENCE = { renderer: "custom:huashu-local-effects", instances: {} };
    window.__localEffectSourceCalls = {};
    for (const [namespace, name] of [["DG", "cum"], ["DG", "drawPartial"], ["DG", "circumscribe"], ["DG", "brace"], ["DG", "indicate"], ["MO", "lagged"], ["MO", "thereAndBack"]]) {
      const source = window[namespace][name];
      window[namespace][name] = function (...args) {
        const key = `${namespace}.${name}`;
        window.__localEffectSourceCalls[key] = (window.__localEffectSourceCalls[key] || 0) + 1;
        return source.apply(this, args);
      };
    }
    const pixelArray = (scene, time) => {
      const canvas = document.createElement("canvas");
      canvas.width = scene.width;
      canvas.height = scene.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.strokeStyle = "#123456";
      ctx.lineWidth = 7;
      ctx.globalAlpha = 0.31;
      ctx.textAlign = "right";
      const initial = { strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth, globalAlpha: ctx.globalAlpha, textAlign: ctx.textAlign };
      window.MotionCore.drawFrame(canvas, scene, time, window.MOTION_RENDERERS);
      const restored = { strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth, globalAlpha: ctx.globalAlpha, textAlign: ctx.textAlign };
      return { pixels: Array.from(ctx.getImageData(0, 0, 100, 100).data), initial, restored };
    };
    const differs = (left, right) => left.some((value, index) => value !== right[index]);
    const results = [];
    for (const row of cases) {
      const baseline = { ...row.scene, objects: row.scene.objects.filter((object) => object.id !== "local-effects") };
      const instanceId = `${row.effectId}-instance`;
      const baselinePixels = pixelArray(baseline, 0.4).pixels;
      const midA = pixelArray(row.scene, 0.4);
      const end = pixelArray(row.scene, 0.8);
      const afterEnd = pixelArray(row.scene, 0.9);
      const callsAtEnd = structuredClone(window.MOTION_LOCAL_EFFECT_EVIDENCE.instances[instanceId].lastCall);
      const midB = pixelArray(row.scene, 0.4);
      const changed = structuredClone(row.scene);
      changed.objects[1].data.motionEffects[0].parameters.color = "#0088ff";
      const changedColorPixels = pixelArray(changed, 0.4).pixels;
      let scalePixels = null;
      if (row.effectId === "huashu-dg-indicate-frame-pulse") {
        const changedScale = structuredClone(row.scene);
        changedScale.objects[1].data.motionEffects[0].parameters.scale = 2;
        scalePixels = pixelArray(changedScale, 0.4).pixels;
      }
      results.push({
        effectId: row.effectId,
        activePixelsDiffer: differs(midA.pixels, baselinePixels),
        colorParameterChangesPixels: differs(midA.pixels, changedColorPixels),
        shuffledSameTimePixelsEqual: midA.pixels.every((value, index) => value === midB.pixels[index]),
        endMatchesPersistenceContract: row.persistsAfterEnd ? differs(end.pixels, baselinePixels) && differs(afterEnd.pixels, baselinePixels) : !differs(end.pixels, baselinePixels) && !differs(afterEnd.pixels, baselinePixels),
        stateRestored: JSON.stringify(midA.initial) === JSON.stringify(midA.restored),
        callsAtEnd,
        scaleParameterChangesPixels: scalePixels ? differs(midA.pixels, scalePixels) : null,
        sourceCalls: { ...window.__localEffectSourceCalls },
      });
      window.__localEffectSourceCalls = {};
      window.MOTION_LOCAL_EFFECT_EVIDENCE.instances = {};
    }
    return results;
  }, scenes);

  const requiredSourceFunctions = {
    "huashu-dg-draw-partial": ["DG.cum", "DG.drawPartial", "MO.lagged"],
    "huashu-dg-circumscribe": ["DG.circumscribe", "MO.lagged"],
    "huashu-dg-brace": ["DG.brace", "MO.lagged"],
    "huashu-dg-indicate-frame-pulse": ["DG.indicate", "DG.circumscribe", "MO.thereAndBack", "MO.lagged"],
  };
  for (const row of evidence) {
    assert.ok(row.activePixelsDiffer, `${row.effectId} adds visible pixels to its target`);
    assert.ok(row.colorParameterChangesPixels, `${row.effectId} consumes its registered color parameter`);
    assert.ok(row.shuffledSameTimePixelsEqual, `${row.effectId} can be revisited at the same absolute time after a later phase`);
    assert.ok(row.endMatchesPersistenceContract, `${row.effectId} has the registered after-phase behavior`);
    assert.ok(row.stateRestored, `${row.effectId} restores the caller Canvas state`);
    for (const name of requiredSourceFunctions[row.effectId]) assert.ok(row.sourceCalls[name] > 0, `${row.effectId} calls original ${name}`);
    if (row.effectId === "huashu-dg-indicate-frame-pulse") {
      assert.equal(row.callsAtEnd.arguments.outlineDrawn, false, "the original indicator outline has an explicit no-draw phase-end branch");
      assert.ok(row.scaleParameterChangesPixels, "the local outline scale parameter changes its actual pixels");
    }
  }
});

test("local effects compose inherited and owner opacity once, including DG.brace source alpha", async () => {
  for (const library of ["util.js", "paint.js", "kit.js", "motion.js", "camera.js", "diagram.js"]) {
    await page.addScriptTag({ path: path.join(localEffectLib, localModuleBySourceName[library]) });
  }
  await page.addScriptTag({ path: opsPath });
  await page.addScriptTag({ path: effectsAdapterPath });

  const phase = { id: "opacity-phase", startSec: 0, durationSec: 1, timeBasis: "scene-local", curve: "linear" };
  const cases = [
    {
      effectId: "huashu-dg-draw-partial",
      target: { id: "target", type: "line", space: "screen", x1: 10, y1: 50, x2: 90, y2: 50, stroke: "none" },
      geometry: { points: [[10, 50], [90, 50]] },
      parameters: { color: "#ff3344", lineWidth: 6 },
      expectedSourceMultiplier: 1,
    },
    {
      effectId: "huashu-dg-circumscribe",
      target: { id: "target", type: "rect", space: "screen", x: 20, y: 25, width: 60, height: 50, fill: "none" },
      geometry: { rect: { x: 20, y: 25, width: 60, height: 50 } },
      parameters: { color: "#ff3344", lineWidth: 6, timeWidth: 0.3 },
      expectedSourceMultiplier: 1,
    },
    {
      effectId: "huashu-dg-brace",
      target: { id: "target", type: "rect", space: "screen", x: 20, y: 20, width: 60, height: 60, fill: "none" },
      geometry: { x: 20, y0: 20, y1: 80 },
      parameters: { color: "#ff3344", lineWidth: 6, depth: 20 },
      expectedSourceMultiplier: 0.75,
    },
  ];
  const inheritedPairs = [
    [{ canvasAlpha: 0.4, ownerOpacity: 0.5 }, { canvasAlpha: 0.2, ownerOpacity: 1 }],
    [{ canvasAlpha: 0.8, ownerOpacity: 0.5 }, { canvasAlpha: 0.4, ownerOpacity: 1 }],
  ];
  const evidence = await page.evaluate(({ cases, phase, inheritedPairs }) => {
    window.U.setStage(100, 100);
    window.MOTION_RENDERERS = {};
    window.HuashuLocalEffects.register(window.MOTION_RENDERERS);
    const render = (effect, canvasAlpha, ownerOpacity) => {
      const scene = {
        version: 1, width: 100, height: 100, fps: 10, duration: 1, background: "transparent",
        layers: [], events: [], bindings: [], variables: {},
        objects: [effect.target, {
          id: "local-effects", type: "custom:huashu-local-effects", space: "screen", opacity: ownerOpacity,
          data: { phases: [phase], motionEffects: [{
            id: "opacity-instance", effectId: effect.effectId, targetId: "target", phaseId: phase.id,
            geometry: effect.geometry, parameters: effect.parameters,
            stagger: { groupId: "opacity-test", index: 0, count: 1, ratio: 0.08 },
          }] },
        }],
      };
      const canvas = document.createElement("canvas");
      canvas.width = scene.width; canvas.height = scene.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.globalAlpha = canvasAlpha;
      const strokeAlphas = [];
      const stroke = ctx.stroke.bind(ctx);
      ctx.stroke = (...args) => { strokeAlphas.push(ctx.globalAlpha); return stroke(...args); };
      window.MOTION_LOCAL_EFFECT_EVIDENCE = { renderer: "custom:huashu-local-effects", instances: {} };
      window.MotionCore.drawFrame(canvas, scene, 0.5, window.MOTION_RENDERERS);
      return {
        pixels: Array.from(ctx.getImageData(0, 0, 100, 100).data),
        strokeAlphas,
        restoredAlpha: ctx.globalAlpha,
        sourceEvidence: window.MOTION_LOCAL_EFFECT_EVIDENCE.instances["opacity-instance"].lastCall.alphaComposition,
      };
    };
    return cases.map((effect) => ({ effectId: effect.effectId, expectedSourceMultiplier: effect.expectedSourceMultiplier,
      pairs: inheritedPairs.map((pair) => pair.map((input) => ({ input, ...render(effect, input.canvasAlpha, input.ownerOpacity) }))) }));
  }, { cases, phase, inheritedPairs });

  for (const effect of evidence) {
    for (const [left, right] of effect.pairs) {
      const combinedAlpha = left.input.canvasAlpha * left.input.ownerOpacity;
      assert.deepEqual(left.pixels, right.pixels, `${effect.effectId} pixels depend on the inherited × core owner alpha product only`);
      assert.equal(left.strokeAlphas.length, 1, `${effect.effectId} makes one source stroke in the neutral fixture`);
      assert.ok(Math.abs(left.strokeAlphas[0] - combinedAlpha * effect.expectedSourceMultiplier) < 1e-12,
        `${effect.effectId} uses inherited alpha once and preserves its source alpha multiplier: ${JSON.stringify(left.strokeAlphas)}`);
      assert.ok(Math.abs(right.strokeAlphas[0] - combinedAlpha * effect.expectedSourceMultiplier) < 1e-12);
      assert.equal(left.restoredAlpha, left.input.canvasAlpha, "the core restores caller alpha after drawing the effect object");
      assert.ok(Math.abs(left.sourceEvidence.incomingCanvasAlpha - combinedAlpha) < 1e-12);
      assert.equal(left.sourceEvidence.ownerOpacityAppliedByMotionCore, true);
      assert.equal(left.sourceEvidence.sourceAlphaMultiplier, effect.expectedSourceMultiplier);
      assert.ok(Math.abs(left.sourceEvidence.effectiveSourceAlpha - combinedAlpha * effect.expectedSourceMultiplier) < 1e-12);
    }
  }
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.writeFile(path.join(validationRoot, "local-effects-alpha-evidence.json"), `${JSON.stringify({
    browserPath,
    capture: "software Chrome Canvas2D; per-effect source stroke alpha and RGBA-byte hash",
    contract: "MotionCore pre-applies owner.opacity; adapter preserves inherited canvas alpha once; DG.brace source multiplier remains clamp(progress * 1.5)",
    results: evidence.map((effect) => ({
      effectId: effect.effectId,
      expectedSourceMultiplier: effect.expectedSourceMultiplier,
      pairs: effect.pairs.map((pair) => pair.map((row) => ({
        input: row.input,
        strokeAlphas: row.strokeAlphas,
        restoredAlpha: row.restoredAlpha,
        sourceEvidence: row.sourceEvidence,
        rgbaSha256: createHash("sha256").update(Buffer.from(row.pixels)).digest("hex"),
      }))),
    })),
  }, null, 2)}\n`);
});

test("local overlays follow Core-evaluated target visibility and opacity across shuffled seeks", async () => {
  const sourceReady = await page.evaluate(() => Boolean(window.U && window.DG && window.MO && window.MotionOps && window.HuashuLocalEffects));
  if (!sourceReady) {
    for (const library of ["util.js", "paint.js", "kit.js", "motion.js", "camera.js", "diagram.js"]) await page.addScriptTag({ path: path.join(localEffectLib, localModuleBySourceName[library]) });
    await page.addScriptTag({ path: opsPath });
    await page.addScriptTag({ path: effectsAdapterPath });
  }

  const phase = { id: "target-visibility-phase", startSec: 0, durationSec: 1, timeBasis: "scene-local", curve: "linear" };
  const line = { id: "fade-line", type: "line", space: "screen", x1: 10, y1: 20, x2: 34, y2: 20, stroke: "none" };
  const fadeRect = { id: "fade-rect", type: "rect", space: "screen", x: 40, y: 10, width: 22, height: 30, fill: "none", stroke: "none" };
  const hiddenRect = { id: "hidden-rect", type: "rect", space: "screen", x: 72, y: 10, width: 18, height: 30, fill: "none", stroke: "none", style: "visible-target" };
  const boundRect = { id: "bound-rect", type: "rect", space: "screen", x: 10, y: 60, width: 24, height: 20, fill: "none", stroke: "none", style: "alpha-target", styleOverrides: { opacity: 0.8 } };
  const moRect = { id: "mo-rect", type: "custom:huashu-local-target", space: "screen", data: { primitive: "rect", geometry: { x: 46, y: 58, width: 20, height: 20 }, fill: "#33cc88" } };
  const instances = [
    { id: "draw-fade-line", effectId: "huashu-dg-draw-partial", targetId: line.id, phaseId: phase.id, geometry: { points: [[10, 20], [34, 20]] }, parameters: { color: "#ff3344", lineWidth: 4 } },
    { id: "circle-fade-rect", effectId: "huashu-dg-circumscribe", targetId: fadeRect.id, phaseId: phase.id, geometry: { rect: { x: 40, y: 10, width: 22, height: 30 } }, parameters: { color: "#ff3344", lineWidth: 4 } },
    { id: "brace-visible-rect", effectId: "huashu-dg-brace", targetId: hiddenRect.id, phaseId: phase.id, geometry: { x: 72, y0: 10, y1: 40 }, parameters: { color: "#ff3344", lineWidth: 4 } },
    { id: "indicate-bound-rect", effectId: "huashu-dg-indicate-frame-pulse", targetId: boundRect.id, phaseId: phase.id, geometry: { rect: { x: 10, y: 60, width: 24, height: 20 } }, parameters: { color: "#ff3344", lineWidth: 4 } },
    { id: "reveal-mo-rect", effectId: "huashu-mo-staggered-target-reveal", targetId: moRect.id, phaseId: phase.id, geometry: { rect: { x: 46, y: 58, width: 20, height: 20 } }, parameters: {}, stagger: { groupId: "visibility-reveal", index: 0, count: 1, ratio: 0.08 } },
  ];
  const scene = basicScene({
    duration: 1,
    styles: { "visible-target": { visible: true }, "alpha-target": { opacity: 0.9 } },
    variables: { fade: 1, show: true },
    events: [
      { id: "fade", target: { kind: "variable", id: "fade" }, start: 0, duration: 0.5, from: 1, to: 0 },
      { id: "hide", target: { kind: "variable", id: "show" }, start: 0.4, duration: 0, from: true, to: false },
      { id: "restore", target: { kind: "variable", id: "show" }, start: 0.6, duration: 0, from: false, to: true },
      { id: "line-fade", target: { kind: "object", id: line.id }, property: "opacity", start: 0, duration: 0.5, from: 1, to: 0 },
      { id: "rect-fade", target: { kind: "object", id: fadeRect.id }, property: "opacity", start: 0, duration: 0.5, from: 1, to: 0 },
      { id: "mo-fade", target: { kind: "object", id: moRect.id }, property: "opacity", start: 0, duration: 0.5, from: 1, to: 0 },
    ],
    bindings: [
      { source: "fade", target: { kind: "object", id: boundRect.id, property: "styleOverrides.opacity" } },
      { source: "show", target: { kind: "object", id: hiddenRect.id, property: "styleOverrides.visible" } },
    ],
    objects: [line, fadeRect, hiddenRect, boundRect, moRect, {
      id: "local-effects", type: "custom:huashu-local-effects", space: "screen", opacity: 0.5,
      data: { phases: [phase], motionEffects: instances },
    }],
  });
  assert.equal(MotionOps.localEffectTargetState(scene, line.id, 0.25).targetOpacity, 0.5);
  assert.equal(MotionOps.localEffectTargetState(scene, boundRect.id, 0.25).targetOpacity, 0.5,
    "resolved target alpha follows the Core binding after style and styleOverrides merge");
  assert.equal(MotionOps.localEffectTargetState(scene, hiddenRect.id, 0.5).visible, false,
    "a visible binding can hide a target while the local phase remains active");
  assert.equal(MotionOps.localEffectTargetState(scene, hiddenRect.id, 0.7).visible, true,
    "the target becomes visible again when its boolean binding changes");
  assert.equal(MotionOps.validateLocalEffects(scene).length, instances.length);

  const geometryBinding = structuredClone(scene);
  geometryBinding.bindings.push({ source: "fade", target: { kind: "object", id: line.id, property: "x1" } });
  assert.throws(() => MotionOps.validateLocalEffects(geometryBinding), /binding-controlled geometry/);
  const styleGeometryChange = structuredClone(scene);
  styleGeometryChange.styles["line-base"] = { x1: 10, y1: 20, x2: 34, y2: 20 };
  styleGeometryChange.styles.moved = { x1: 12, y1: 20, x2: 34, y2: 20 };
  const movingLine = styleGeometryChange.objects.find((item) => item.id === line.id);
  for (const key of ["x1", "y1", "x2", "y2"]) delete movingLine[key];
  movingLine.style = "line-base";
  styleGeometryChange.events.push({ id: "change-target-style", target: { kind: "object", id: line.id }, property: "style", start: 0.25, duration: 0.25, from: "line-base", to: "moved" });
  assert.throws(() => MotionOps.validateLocalEffects(styleGeometryChange), /changes its resolved geometry through style selection/);

  const browserEvidence = await page.evaluate((scene) => {
    window.U.setStage(scene.width, scene.height);
    window.MOTION_RENDERERS = {};
    window.HuashuLocalEffects.register(window.MOTION_RENDERERS);
    window.MOTION_LOCAL_EFFECT_EVIDENCE = { renderer: "custom:huashu-local-effects", instances: {}, targetObjects: {} };
    const frames = {};
    for (const timeSec of [0.25, 0.5, 0.7, 0.25]) {
      const canvas = document.createElement("canvas");
      canvas.width = scene.width; canvas.height = scene.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.globalAlpha = 0.8;
      const strokeAlpha = [];
      const fillAlpha = [];
      const stroke = ctx.stroke.bind(ctx), fillRect = ctx.fillRect.bind(ctx);
      ctx.stroke = (...args) => { strokeAlpha.push(ctx.globalAlpha); return stroke(...args); };
      ctx.fillRect = (...args) => { fillAlpha.push(ctx.globalAlpha); return fillRect(...args); };
      window.MotionCore.drawFrame(canvas, scene, timeSec, window.MOTION_RENDERERS);
      const pixels = Array.from(ctx.getImageData(0, 0, scene.width, scene.height).data);
      frames[timeSec === 0.25 ? (frames.first25 ? "repeat25" : "first25") : String(timeSec)] = {
        pixels,
        strokeAlpha,
        fillAlpha,
        instances: structuredClone(window.MOTION_LOCAL_EFFECT_EVIDENCE.instances),
      };
    }
    return frames;
  }, scene);

  const first = browserEvidence.first25;
  const hidden = browserEvidence["0.5"];
  const restored = browserEvidence["0.7"];
  const repeat = browserEvidence.repeat25;
  assert.ok(first.instances["draw-fade-line"].lastCall.drawn);
  assert.ok(first.instances["circle-fade-rect"].lastCall.drawn);
  assert.ok(first.instances["brace-visible-rect"].lastCall.drawn);
  assert.ok(first.instances["indicate-bound-rect"].lastCall.drawn);
  assert.equal(first.instances["circle-fade-rect"].lastCall.targetOpacity, 0.5);
  assert.equal(hidden.instances["circle-fade-rect"].lastCall.skipReason, "target-opacity-zero", "object opacity zero is distinct from object visibility");
  assert.equal(hidden.instances["brace-visible-rect"].lastCall.skipReason, "target-visible-false", "resolved target.visible false is reported as visibility");
  assert.ok(first.strokeAlpha.some((alpha) => Math.abs(alpha - 0.2) < 1e-12), "owner 0.5 × caller alpha 0.8 × target opacity 0.5 is applied exactly once");
  assert.ok(first.strokeAlpha.some((alpha) => Math.abs(alpha - 0.15) < 1e-12), "DG.brace keeps its original p×1.5 source factor after target alpha");
  assert.ok(Math.abs(first.fillAlpha[0] - 0.1) < 1e-12, "MO target reveal applies target opacity in Core, then its own progress once");
  for (const id of ["draw-fade-line", "circle-fade-rect", "brace-visible-rect", "indicate-bound-rect"]) {
    assert.equal(hidden.instances[id].lastCall.drawn, false, `${id} skips its invisible or zero-alpha target at the active phase midpoint`);
    assert.ok(hidden.instances[id].lastCall.skipReason);
  }
  assert.equal(hidden.strokeAlpha.length, 0, "no DG source stroke survives when every target is hidden or transparent");
  assert.equal(hidden.fillAlpha.length, 0, "MotionCore skips the zero-alpha MO target before invoking its renderer");
  assert.ok(restored.instances["brace-visible-rect"].lastCall.drawn, "visible binding restoration redraws the brace at the sampled absolute time");
  assert.deepEqual(first.pixels, repeat.pixels, "out-of-order seek to .25 recreates the exact prior pixels");
  assert.deepEqual(first.strokeAlpha, repeat.strokeAlpha);

  await fs.mkdir(validationRoot, { recursive: true });
  const evidencePath = path.join(validationRoot, "p2-target-visibility-evidence.json");
  const evidence = {
    capture: "real MotionCore.drawFrame + HuashuLocalEffects adapter in software Chrome Canvas2D",
    sceneInput: "target-fades-under-marker.scene.json plus local-effects fixture for visible binding restoration and MO reveal alpha",
    semantics: "DG overlays sample MotionCore.evaluateScene and styles -> styleOverrides -> evaluated object each active frame; hidden/zero-opacity targets skip; fractional target opacity multiplies the Core-inherited alpha once; MO reveal retains Core target alpha × original progress only",
    sampleTimesSec: [0.25, 0.5, 0.7, 0.25],
    results: Object.fromEntries(Object.entries(browserEvidence).map(([time, row]) => [time, {
      strokeAlpha: row.strokeAlpha,
      fillAlpha: row.fillAlpha,
      instances: Object.fromEntries(Object.entries(row.instances).map(([id, instance]) => [id, { calls: instance.calls, evaluations: instance.evaluations, targetInvisibleSkips: instance.targetInvisibleSkips, lastCall: instance.lastCall }])),
      rgbaSha256: createHash("sha256").update(Buffer.from(row.pixels)).digest("hex"),
    }])),
    assertions: { targetFadeSkip: hidden.strokeAlpha.length === 0, visibleBindingRestore: restored.instances["brace-visible-rect"].lastCall.drawn, repeatSeekByteIdentical: first.pixels.every((value, index) => value === repeat.pixels[index]) },
  };
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
});

test("local-effect owners reject resolved transform changes while allowing presentation-only style changes", () => {
  const phase = { id: "owner-static-phase", startSec: 0, durationSec: 1, timeBasis: "scene-local", curve: "linear" };
  const baseScene = () => basicScene({
    duration: 1,
    variables: { ownerOpacity: 0.65, ownerVisible: true, ownerShift: 20 },
    objects: [
      { id: "target", type: "rect", space: "screen", x: 24, y: 28, width: 42, height: 32, fill: "#242424" },
      { id: "local-effects", type: "custom:huashu-local-effects", space: "screen", data: {
        phases: [phase],
        motionEffects: [{ id: "mark-target", effectId: "huashu-dg-circumscribe", targetId: "target", phaseId: phase.id,
          geometry: { rect: { x: 24, y: 28, width: 42, height: 32 } }, parameters: { color: "#ff3344", lineWidth: 4 } }],
      } },
    ],
  });
  const validate = (scene) => {
    MotionCore.assertValidScene(scene);
    return MotionOps.validateLocalEffects(scene);
  };

  const translatedStyle = baseScene();
  translatedStyle.styles = { shifted: { translateX: 20 } };
  translatedStyle.objects[1].style = "shifted";
  assert.throws(() => validate(translatedStyle), /owner resolved at .* translateX must be neutral/);

  const translatedDirectly = baseScene();
  translatedDirectly.objects[1].translateX = 20;
  assert.throws(() => validate(translatedDirectly), /owner resolved at .* translateX must be neutral/);

  const transformedOverride = baseScene();
  transformedOverride.objects[1].styleOverrides = { rotation: 15 };
  assert.throws(() => validate(transformedOverride), /owner resolved at .* rotation must be neutral/);

  const ownerTransformFields = [
    ["translateX", 0, 20], ["translateY", 0, 20], ["rotation", 0, 20],
    ["scale", 1, 1.5], ["scaleX", 1, 1.5], ["scaleY", 1, 1.5],
  ];
  for (const [property, neutral, changed] of ownerTransformFields) {
    const transformEvent = baseScene();
    transformEvent.events.push({ id: `owner-${property}`, target: { kind: "object", id: "local-effects" }, property, start: 0, duration: 0.5, from: neutral, to: changed });
    assert.throws(() => validate(transformEvent), new RegExp(`owner resolved at .* ${property} must be neutral`));

    const transformBinding = baseScene();
    transformBinding.bindings.push({ source: "ownerShift", target: { kind: "object", id: "local-effects", property }, input: [0, 20], output: [neutral, changed] });
    assert.throws(() => validate(transformBinding), new RegExp(`binding-controlled owner transform \\(${property}\\)`));
  }

  const overrideBinding = baseScene();
  overrideBinding.bindings.push({ source: "ownerShift", target: { kind: "object", id: "local-effects", property: "styleOverrides.translateY" }, input: [0, 20], output: [0, 20] });
  assert.throws(() => validate(overrideBinding), /binding-controlled owner transform \(styleOverrides\.translateY\)/);

  const styleBinding = baseScene();
  styleBinding.bindings.push({ source: "ownerShift", target: { kind: "object", id: "local-effects", property: "style" } });
  assert.throws(() => validate(styleBinding), /binding-controlled owner transform \(style\)/);

  const styleSwitch = baseScene();
  styleSwitch.styles = { still: { opacity: 0.8, visible: true, color: "#ff3344" }, shifted: { opacity: 0.8, translateY: 12, color: "#0088ff" } };
  styleSwitch.objects[1].style = "still";
  styleSwitch.events.push({ id: "switch-owner-style", target: { kind: "object", id: "local-effects" }, property: "style", start: 0.25, duration: 0.25, from: "still", to: "shifted" });
  assert.throws(() => validate(styleSwitch), /owner resolved at .* translateY must be neutral/);

  const presentationOnly = baseScene();
  presentationOnly.styles = { still: { opacity: 0.8, visible: true, color: "#ff3344" }, alternate: { opacity: 0.4, visible: false, color: "#0088ff" } };
  presentationOnly.objects[1].style = "still";
  presentationOnly.events.push(
    { id: "switch-owner-presentation", target: { kind: "object", id: "local-effects" }, property: "style", start: 0.25, duration: 0.25, from: "still", to: "alternate" },
    { id: "owner-opacity", target: { kind: "object", id: "local-effects" }, property: "opacity", start: 0, duration: 0.5, from: 0.8, to: 0.5 },
  );
  presentationOnly.bindings.push(
    { source: "ownerOpacity", target: { kind: "object", id: "local-effects", property: "styleOverrides.opacity" } },
    { source: "ownerVisible", target: { kind: "object", id: "local-effects", property: "styleOverrides.visible" } },
  );
  assert.equal(validate(presentationOnly).length, 1, "opacity, visibility and color presentation state do not move the owner transform");
});

test("followTarget validates the supported rectangle boundary and keeps static paths intact", async () => {
  const sourceReady = await page.evaluate(() => Boolean(window.U && window.DG && window.MO && window.MotionOps && window.LaohuMotionEffects));
  if (!sourceReady) {
    for (const library of ["util.js", "paint.js", "kit.js", "motion.js", "camera.js", "diagram.js"]) await page.addScriptTag({ path: path.join(localEffectLib, localModuleBySourceName[library]) });
    await page.addScriptTag({ path: opsPath });
    await page.addScriptTag({ path: effectsAdapterPath });
  }
  const phase = { id: "follow-phase", startSec: 0.1, durationSec: 0.9, timeBasis: "scene-local" };
  const target = { id: "world-target", type: "rect", layer: "world", x: 10, y: 20, width: 24, height: 18, fill: "#334455" };
  const makeFollowScene = (targetOverride = {}, instanceOverride = {}) => basicScene({
    duration: 1,
    layers: [
      { id: "world", space: "world" },
      { id: "overlay", space: "screen", opacity: 1 },
    ],
    objects: [
      { ...target, ...targetOverride },
      {
        id: "effects", type: "custom:laohu-motion-effects", layer: "overlay", space: "screen",
        data: { phases: [phase], motionEffects: [{
          id: "follow-circle", effectId: "laohu-motion-dg-circumscribe", targetId: target.id,
          geometryMode: "followTarget", phaseId: phase.id,
          geometry: { rect: { x: 10, y: 20, width: 24, height: 18 } }, parameters: {},
          ...instanceOverride,
        }] },
      },
    ],
  });

  const dynamic = makeFollowScene();
  const records = MotionOps.validateLocalEffects(dynamic);
  assert.equal(records[0].geometryMode, "followTarget");
  assert.equal(records[0].targetId, "world-target");

  const staticScene = basicScene({
    duration: 1,
    objects: [
      { id: "screen-target", type: "rect", space: "screen", x: 10, y: 20, width: 24, height: 18, fill: "none", stroke: "none" },
      { id: "static-effects", type: "custom:laohu-motion-effects", space: "screen", data: { phases: [phase], motionEffects: [{
        id: "static-circle", effectId: "laohu-motion-dg-circumscribe", targetId: "screen-target", phaseId: phase.id,
        geometry: { rect: { x: 10, y: 20, width: 24, height: 18 } }, parameters: {},
      }] } },
    ],
  });
  assert.equal(MotionOps.validateLocalEffects(staticScene)[0].geometryMode, "static", "omitting geometryMode keeps the original static contract");

  assert.throws(() => MotionOps.validateLocalEffects(makeFollowScene({}, {
    effectId: "laohu-motion-dg-draw-partial", geometry: { points: [[10, 20], [34, 38]] },
  })), /not supported by laohu-motion-dg-draw-partial/);
  assert.throws(() => MotionOps.validateLocalEffects(makeFollowScene({ morph: {} })), /cannot follow a morphing target/);
  assert.throws(() => MotionOps.validateLocalEffects(makeFollowScene({}, { targetId: "missing" })), /does not identify a scene object/);
  for (const type of ["text", "image", "path"]) {
    assert.throws(() => MotionOps.validateLocalEffects(makeFollowScene({ type })), /requires an axis-aligned rectangle target/,
      `${type} target bounds are not inferred for followTarget`);
  }
  const clipped = makeFollowScene();
  clipped.layers[0].clip = { type: "rect", x: 0, y: 0, width: 80, height: 80 };
  assert.throws(() => MotionOps.validateLocalEffects(clipped), /cannot follow a target in clipped ancestor layer world/);

  const targetLayerVisibleField = makeFollowScene();
  targetLayerVisibleField.layers[0].visible = false;
  assert.deepEqual(MotionCore.validateScene(targetLayerVisibleField), [], "reproduction: Core scene validation accepts a direct unsupported layer.visible field");
  assert.throws(() => MotionOps.validateLocalEffects(targetLayerVisibleField), /MotionCore does not consume it/,
    "unsupported target ancestor layer.visible is rejected instead of overriding Core output");
  const visibleMismatch = await page.evaluate((scene) => {
    window.U.setStage(scene.width, scene.height);
    const registry = {};
    let preflightError = null;
    let sourceCalls = 0;
    const originalCircumscribe = window.DG.circumscribe;
    window.DG.circumscribe = function (...args) { sourceCalls += 1; return originalCircumscribe.apply(this, args); };
    const preflightCanvas = document.createElement("canvas"); preflightCanvas.width = scene.width; preflightCanvas.height = scene.height;
    const preflightContext = preflightCanvas.getContext("2d", { willReadFrequently: true });
    try {
      const records = window.MotionOps.validateLocalEffects(scene);
      window.LaohuMotionEffects.register(registry, scene, records);
      window.MotionCore.drawFrame(preflightCanvas, scene, 0.5, registry);
    } catch (error) { preflightError = error.message; }
    const targetOnly = { ...scene, objects: [scene.objects.find((object) => object.id === "world-target")] };
    const targetCanvas = document.createElement("canvas"); targetCanvas.width = scene.width; targetCanvas.height = scene.height;
    const targetContext = targetCanvas.getContext("2d", { willReadFrequently: true });
    window.MotionCore.drawFrame(targetCanvas, targetOnly, 0.5, {});
    const pixelAlpha = (ctx, x, y) => ctx.getImageData(x, y, 1, 1).data[3];
    window.DG.circumscribe = originalCircumscribe;
    return {
      coreAcceptsScene: window.MotionCore.validateScene(scene).length === 0,
      preflightError,
      sourceCalls,
      preflightPixelAlpha: pixelAlpha(preflightContext, 22, 29),
      coreTargetPixelAlpha: pixelAlpha(targetContext, 22, 29),
    };
  }, targetLayerVisibleField);
  assert.equal(visibleMismatch.coreAcceptsScene, true);
  assert.match(visibleMismatch.preflightError, /MotionCore does not consume it/);
  assert.equal(visibleMismatch.sourceCalls, 0, "followTarget preflight rejects before any source effect call");
  assert.equal(visibleMismatch.preflightPixelAlpha, 0, "rejected scene never reaches the effect frame draw");
  assert.ok(visibleMismatch.coreTargetPixelAlpha > 0, "the same direct Core scene visibly draws the target, proving the old layer.visible skip was false");
  const ownerLayerVisibleField = makeFollowScene();
  ownerLayerVisibleField.layers[1].visible = false;
  assert.throws(() => MotionOps.validateLocalEffects(ownerLayerVisibleField), /MotionCore does not consume it/,
    "unsupported owner ancestor layer.visible is rejected too");
  const targetLayerVisibleEvent = makeFollowScene();
  targetLayerVisibleEvent.events.push({ id: "target-layer-visible", target: { kind: "layer", id: "world" }, property: "visible", start: 0.25, duration: 0, from: true, to: false });
  assert.ok(MotionCore.validateScene(targetLayerVisibleEvent).some((error) => /unsupported animated property layer\.visible/.test(error.message)),
    "MotionCore's event schema also rejects layer.visible control");
  assert.throws(() => MotionOps.validateLocalEffects(targetLayerVisibleEvent), /layer.visible events/);
  const ownerLayerVisibleBinding = makeFollowScene();
  ownerLayerVisibleBinding.variables.ownerVisible = false;
  ownerLayerVisibleBinding.bindings.push({ source: "ownerVisible", target: { kind: "layer", id: "overlay", property: "visible" } });
  assert.deepEqual(MotionCore.validateScene(ownerLayerVisibleBinding), [], "Core accepts the binding shape even though renderLayerGroup ignores layer.visible");
  assert.throws(() => MotionOps.validateLocalEffects(ownerLayerVisibleBinding), /layer.visible bindings/);

  const layerOpacity = makeFollowScene();
  layerOpacity.layers[0].opacity = 1;
  layerOpacity.events.push({ id: "fade-world-layer", target: { kind: "layer", id: "world" }, property: "opacity", start: 0.25, duration: 0.25, from: 1, to: 0 });
  MotionCore.assertValidScene(layerOpacity);
  assert.equal(MotionOps.validateLocalEffects(layerOpacity).length, 1, "Core-supported layer.opacity remains available for followTarget");
  const opacityState = MotionCore.evaluateScene(layerOpacity, 0.5, true);
  const targetStateAtZeroLayerOpacity = MotionOps.localEffectTargetState(layerOpacity, target.id, 0.5, opacityState, "followTarget");
  assert.equal(targetStateAtZeroLayerOpacity.visible, false);
  assert.equal(targetStateAtZeroLayerOpacity.targetLayerOpacity, 0);

  await fs.mkdir(validationRoot, { recursive: true });
  await fs.writeFile(path.join(validationRoot, "ancestor-layer-visible-rejection.json"), `${JSON.stringify({
    capture: "Chrome Canvas2D + MotionCore.validateScene + local-effect preflight",
    reproduction: "Core accepts a target ancestor layer.visible=false field but ignores it during rendering; followTarget preflight now rejects it before draw",
    result: visibleMismatch,
  }, null, 2)}\n`);

  const rotated = makeFollowScene();
  rotated.events.push({ id: "rotate-world-target", target: { kind: "object", id: target.id }, property: "rotation", start: 0.1, duration: 0.8, from: 0, to: 30 });
  const state = MotionCore.evaluateScene(rotated, 0.5, true);
  assert.throws(() => MotionOps.localEffectTargetState(rotated, target.id, 0.5, state, "followTarget"), /remain axis-aligned after Core projection/,
    "a target that becomes non-axis-aligned is rejected at the actual sampled time");
  const wrongTimeState = MotionCore.evaluateScene(dynamic, 0.4, true);
  assert.throws(() => MotionOps.localEffectTargetState(dynamic, target.id, 0.5, wrongTimeState, "followTarget"), /matching evaluatedState time/);
});

test("DG followTarget effects use the same projected frame, absolute phase and real pixels", async () => {
  const sourceReady = await page.evaluate(() => Boolean(window.U && window.DG && window.MO && window.MotionOps && window.LaohuMotionEffects));
  if (!sourceReady) {
    for (const library of ["util.js", "paint.js", "kit.js", "motion.js", "camera.js", "diagram.js"]) await page.addScriptTag({ path: path.join(localEffectLib, localModuleBySourceName[library]) });
    await page.addScriptTag({ path: opsPath });
    await page.addScriptTag({ path: effectsAdapterPath });
  }
  const phase = { id: "follow-dg-phase", startSec: 0.1, durationSec: 0.9, timeBasis: "scene-local", curve: "linear" };
  const scene = basicScene({
    duration: 1,
    layers: [
      { id: "world", space: "world", opacity: 0.5, transform: { x: 2 } },
      { id: "overlay", space: "screen" },
    ],
    objects: [
      { id: "world-target", type: "rect", layer: "world", x: 10, y: 26, width: 30, height: 24, fill: "#334455", opacity: 0.5 },
      {
        id: "effects", type: "custom:laohu-motion-effects", layer: "overlay", space: "screen", opacity: 0.5,
        data: { phases: [phase], motionEffects: [
          { id: "follow-circle", effectId: "laohu-motion-dg-circumscribe", targetId: "world-target", geometryMode: "followTarget", phaseId: phase.id,
            geometry: { rect: { x: 10, y: 26, width: 30, height: 24 } }, parameters: { color: "#ff3344", lineWidth: 3 } },
          { id: "follow-brace", effectId: "laohu-motion-dg-brace", targetId: "world-target", geometryMode: "followTarget", phaseId: phase.id,
            geometry: { x: 10, y0: 26, y1: 50 }, parameters: { color: "#ff3344", lineWidth: 3, depth: 12 } },
          { id: "follow-indicate", effectId: "laohu-motion-dg-indicate-frame-pulse", targetId: "world-target", geometryMode: "followTarget", phaseId: phase.id,
            geometry: { rect: { x: 10, y: 26, width: 30, height: 24 } }, parameters: { color: "#ff3344", lineWidth: 3, scale: 1 } },
        ] },
      },
    ],
    camera: { x: 60, y: 50, zoom: 1 },
    events: [
      { id: "move-target", target: { kind: "object", id: "world-target" }, property: "x", start: 0.1, duration: 0.8, from: 10, to: 50 },
      { id: "move-world-layer", target: { kind: "layer", id: "world" }, property: "transform.x", start: 0.1, duration: 0.8, from: 2, to: 8 },
      { id: "pan-camera", target: { kind: "camera", id: "camera" }, property: "x", start: 0.1, duration: 0.8, from: 60, to: 50 },
      { id: "mute-owner-layer", target: { kind: "layer", id: "overlay" }, property: "opacity", start: 0.4, duration: 0, from: 1, to: 0 },
      { id: "restore-owner-layer", target: { kind: "layer", id: "overlay" }, property: "opacity", start: 0.5, duration: 0, from: 0, to: 1 },
      { id: "hide-target", target: { kind: "object", id: "world-target" }, property: "visible", start: 0.7, duration: 0, from: true, to: false },
      { id: "restore-target", target: { kind: "object", id: "world-target" }, property: "visible", start: 0.8, duration: 0, from: false, to: true },
      { id: "mute-target-layer", target: { kind: "layer", id: "world" }, property: "opacity", start: 0.82, duration: 0, from: 0.5, to: 0 },
      { id: "restore-target-layer", target: { kind: "layer", id: "world" }, property: "opacity", start: 0.9, duration: 0, from: 0, to: 0.5 },
    ],
  });
  MotionCore.assertValidScene(scene);
  const records = MotionOps.validateLocalEffects(scene);
  assert.equal(records.length, 3);

  const result = await page.evaluate(({ scene, records }) => {
    window.U.setStage(scene.width, scene.height);
    const registry = {};
    window.LaohuMotionEffects.register(registry, scene, records);
    const rendererKey = "custom:laohu-motion-effects";
    const sourceRenderer = registry[rendererKey];
    const dispatchedStates = [];
    registry[rendererKey] = (...args) => { dispatchedStates.push(args[4]); return sourceRenderer(...args); };
    const originals = { circumscribe: window.DG.circumscribe, brace: window.DG.brace, indicate: window.DG.indicate, evaluateScene: window.MotionCore.evaluateScene };
    const logs = [];
    let evaluateCalls = 0;
    window.DG.circumscribe = function (ctx, x, y, width, height, progress, options) {
      logs.push({ source: "DG.circumscribe", x, y, width, height, progress, alpha: ctx.globalAlpha });
      return originals.circumscribe.apply(this, arguments);
    };
    window.DG.brace = function (ctx, x, y0, y1, options) {
      logs.push({ source: "DG.brace", x, y0, y1, progress: options.p, alpha: ctx.globalAlpha });
      return originals.brace.apply(this, arguments);
    };
    window.DG.indicate = function (progress) {
      logs.push({ source: "DG.indicate", progress });
      return originals.indicate.apply(this, arguments);
    };
    window.MotionCore.evaluateScene = function (...args) { evaluateCalls += 1; return originals.evaluateScene.apply(this, args); };
    function redBounds(pixels) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let y = 0; y < scene.height; y += 1) for (let x = 0; x < scene.width; x += 1) {
        const offset = (y * scene.width + x) * 4;
        if (pixels[offset] > 180 && pixels[offset + 1] < 100 && pixels[offset + 2] < 120 && pixels[offset + 3] > 0) {
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
      return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
    }
    const frames = {};
    try {
      for (const timeSec of [0.25, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]) {
        logs.length = 0;
        dispatchedStates.length = 0;
        const canvas = document.createElement("canvas"); canvas.width = scene.width; canvas.height = scene.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const returnedState = window.MotionCore.drawFrame(canvas, scene, timeSec, registry);
        const pixels = Array.from(ctx.getImageData(0, 0, scene.width, scene.height).data);
        const projectedTarget = window.MotionOps.localEffectTargetState(scene, "world-target", timeSec, dispatchedStates[0], "followTarget").projected.screenRect;
        const targetPixelIndex = (Math.floor(projectedTarget.y + projectedTarget.height / 2) * scene.width
          + Math.floor(projectedTarget.x + projectedTarget.width / 2)) * 4;
        let ownerOpacityMatchesTargetOnly = null;
        if (timeSec === 0.45) {
          const targetOnly = { ...scene, objects: [scene.objects.find((item) => item.id === "world-target")] };
          const targetOnlyCanvas = document.createElement("canvas"); targetOnlyCanvas.width = scene.width; targetOnlyCanvas.height = scene.height;
          const targetOnlyCtx = targetOnlyCanvas.getContext("2d", { willReadFrequently: true });
          window.MotionCore.drawFrame(targetOnlyCanvas, targetOnly, timeSec, {});
          const targetOnlyPixels = targetOnlyCtx.getImageData(0, 0, scene.width, scene.height).data;
          ownerOpacityMatchesTargetOnly = pixels.every((value, index) => value === targetOnlyPixels[index]);
        }
        frames[timeSec] = {
          logs: structuredClone(logs),
          pixels,
          redBounds: redBounds(pixels),
          targetPixelAlpha: pixels[targetPixelIndex + 3],
          ownerOpacityMatchesTargetOnly,
          sameEvaluatedState: dispatchedStates.length === 1 && dispatchedStates[0] === returnedState,
          evidence: structuredClone(window.MOTION_LOCAL_EFFECT_EVIDENCE.instances || {}),
        };
      }
      return { frames, evaluateCalls };
    } finally {
      window.DG.circumscribe = originals.circumscribe;
      window.DG.brace = originals.brace;
      window.DG.indicate = originals.indicate;
      window.MotionCore.evaluateScene = originals.evaluateScene;
    }
  }, { scene, records });

  const early = result.frames[0.25];
  const ownerOpacityZero = result.frames[0.45];
  const ownerOpacityRestored = result.frames[0.55];
  const middle = result.frames[0.65];
  const targetVisibleFalse = result.frames[0.75];
  const targetLayerOpacityZero = result.frames[0.85];
  const restored = result.frames[0.95];
  for (const frame of [early, ownerOpacityZero, ownerOpacityRestored, middle, targetVisibleFalse, targetLayerOpacityZero, restored]) {
    assert.equal(frame.sameEvaluatedState, true, "the adapter receives the exact state returned by that drawFrame");
  }
  assert.equal(result.evaluateCalls, 0, "prevalidated draw callbacks consume Core's fifth state without a second evaluateScene call");
  for (const effectId of ["follow-circle", "follow-brace", "follow-indicate"]) {
    assert.equal(early.evidence[effectId].lastCall.drawn, true);
    assert.equal(middle.evidence[effectId].lastCall.drawn, true);
    assert.equal(targetVisibleFalse.evidence[effectId].lastCall.drawn, false, `${effectId} skips a target with Core-resolved visible=false`);
    assert.equal(targetLayerOpacityZero.evidence[effectId].lastCall.drawn, false, `${effectId} skips a target with zero Core ancestor opacity`);
    assert.equal(restored.evidence[effectId].lastCall.drawn, true);
  }
  const earlyCircle = early.logs.find((item) => item.source === "DG.circumscribe");
  const middleCircle = middle.logs.find((item) => item.source === "DG.circumscribe");
  const earlyBrace = early.logs.find((item) => item.source === "DG.brace");
  const middleBrace = middle.logs.find((item) => item.source === "DG.brace");
  const earlyIndicate = early.logs.find((item) => item.source === "DG.indicate");
  const middleIndicate = middle.logs.find((item) => item.source === "DG.indicate");
  assert.ok(middleCircle.x > earlyCircle.x + 10 && middleCircle.width === earlyCircle.width, "DG.circumscribe receives the projected moving rectangle at each sample");
  assert.ok(middleBrace.x > earlyBrace.x + 10 && middleBrace.y0 === earlyBrace.y0 && middleBrace.y1 === earlyBrace.y1, "DG.brace follows the selected vertical edge at each sample");
  assert.ok(middleIndicate.progress > earlyIndicate.progress, "DG.indicate retains the original absolute-time phase progress");
  assert.ok(Math.abs(earlyCircle.progress - (0.25 - phase.startSec) / phase.durationSec) < 1e-12, "the source curve begins at the shared phase start, without restarting at target motion");
  assert.ok(Math.abs(earlyCircle.alpha - 0.125) < 1e-12, "overlay owner opacity × world layer opacity × target opacity are each applied once");
  assert.ok(early.redBounds && middle.redBounds && middle.redBounds.minX > early.redBounds.minX + 10, "captured red marker pixels move with the target in real Canvas2D output");
  assert.equal(ownerOpacityZero.evidence["follow-circle"].lastCall.drawn, true, "Core still invokes the source in an opacity-zero owner layer's offscreen group");
  assert.equal(ownerOpacityZero.logs.length > 0, true);
  assert.equal(ownerOpacityZero.redBounds, null, "Core applies owner ancestor layer.opacity when compositing the final overlay pixels");
  assert.equal(ownerOpacityZero.targetPixelAlpha > 0, true, "the target remains visible while only the owner overlay layer is transparent");
  assert.equal(ownerOpacityZero.ownerOpacityMatchesTargetOnly, true, "zero owner layer opacity yields exactly the target-only Core frame");
  assert.ok(ownerOpacityRestored.redBounds, "restoring owner layer.opacity restores the screen overlay");
  assert.equal(targetVisibleFalse.logs.length, 0, "target.visible=false suppresses source DG calls");
  assert.equal(targetVisibleFalse.evidence["follow-circle"].lastCall.skipReason, "target-visible-false");
  assert.equal(targetLayerOpacityZero.logs.length, 0, "zero target ancestor layer opacity suppresses source DG calls");
  assert.equal(targetLayerOpacityZero.evidence["follow-circle"].lastCall.skipReason, "target-layer-opacity-zero");
  assert.equal(targetLayerOpacityZero.targetPixelAlpha, 0, "Core also composites the target away at layer.opacity=0");
  assert.equal(targetLayerOpacityZero.redBounds, null);
  assert.equal(restored.evidence["follow-circle"].lastCall.drawn, true, "restoring target layer.opacity brings the target-bound source effect back");

  await fs.mkdir(validationRoot, { recursive: true });
  await fs.writeFile(path.join(validationRoot, "follow-target-dg-evidence.json"), `${JSON.stringify({
    capture: "MotionCore.drawFrame + prevalidated LaohuMotionEffects in software Chrome Canvas2D",
    scope: "three source DG consumers on one moving world rect; same Core state/camera; object visibility and target/owner ancestor opacity are checked using Core semantics",
    sampleTimesSec: [0.25, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95],
    secondEvaluateSceneCalls: result.evaluateCalls,
    results: Object.fromEntries(Object.entries(result.frames).map(([timeSec, frame]) => [timeSec, {
      sourceCalls: frame.logs,
      redPixelBounds: frame.redBounds,
      targetPixelAlpha: frame.targetPixelAlpha,
      ownerOpacityMatchesTargetOnly: frame.ownerOpacityMatchesTargetOnly,
      sameEvaluatedState: frame.sameEvaluatedState,
      effects: Object.fromEntries(["follow-circle", "follow-brace", "follow-indicate"].map((id) => [id, frame.evidence[id]?.lastCall || null])),
      rgbaSha256: createHash("sha256").update(Buffer.from(frame.pixels)).digest("hex"),
    }])),
    assertions: {
      movingRectParameters: middleCircle.x > earlyCircle.x,
      objectVisibleFalseSkips: targetVisibleFalse.logs.length === 0,
      targetLayerOpacityZeroSkips: targetLayerOpacityZero.logs.length === 0 && targetLayerOpacityZero.targetPixelAlpha === 0,
      ownerLayerOpacityUsesCoreComposite: ownerOpacityZero.ownerOpacityMatchesTargetOnly,
      exactCoreStateForwarded: early.sameEvaluatedState && middle.sameEvaluatedState && restored.sameEvaluatedState,
    },
  }, null, 2)}\n`);
});

test("MO.lagged follows a moving local rectangle once while Core owns target opacity", async () => {
  const sourceReady = await page.evaluate(() => Boolean(window.U && window.DG && window.MO && window.MotionOps && window.LaohuMotionEffects));
  if (!sourceReady) {
    for (const library of ["util.js", "paint.js", "kit.js", "motion.js", "camera.js", "diagram.js"]) await page.addScriptTag({ path: path.join(localEffectLib, localModuleBySourceName[library]) });
    await page.addScriptTag({ path: opsPath });
    await page.addScriptTag({ path: effectsAdapterPath });
  }
  const phase = { id: "follow-mo-phase", startSec: 0.1, durationSec: 0.9, timeBasis: "scene-local", curve: "linear" };
  const scene = basicScene({
    duration: 1,
    layers: [
      { id: "world", space: "world", opacity: 0.5, transform: { x: 2 } },
      { id: "overlay", space: "screen" },
    ],
    objects: [
      { id: "follow-target", type: "custom:laohu-motion-target", layer: "world", space: "world", opacity: 0.5,
        data: { primitive: "rect", geometry: { x: 10, y: 20, width: 20, height: 20 }, fill: "#ff3344" } },
      { id: "effects", type: "custom:laohu-motion-effects", layer: "overlay", space: "screen", data: { phases: [phase], motionEffects: [{
        id: "reveal-follow-target", effectId: "laohu-motion-mo-staggered-target-reveal", targetId: "follow-target", geometryMode: "followTarget", phaseId: phase.id,
        geometry: { rect: { x: 10, y: 20, width: 20, height: 20 } }, parameters: {},
        stagger: { groupId: "follow-target-group", index: 0, count: 1, ratio: 0.08 },
      }] } },
    ],
    camera: { x: 60, y: 50, zoom: 1 },
    events: [
      { id: "move-target", target: { kind: "object", id: "follow-target" }, property: "translateX", start: 0.1, duration: 0.8, from: 0, to: 40 },
      { id: "move-world-layer", target: { kind: "layer", id: "world" }, property: "transform.x", start: 0.1, duration: 0.8, from: 2, to: 8 },
      { id: "pan-camera", target: { kind: "camera", id: "camera" }, property: "x", start: 0.1, duration: 0.8, from: 60, to: 50 },
      { id: "hide-target", target: { kind: "object", id: "follow-target" }, property: "visible", start: 0.7, duration: 0, from: true, to: false },
      { id: "restore-target", target: { kind: "object", id: "follow-target" }, property: "visible", start: 0.9, duration: 0, from: false, to: true },
    ],
  });
  MotionCore.assertValidScene(scene);
  const records = MotionOps.validateLocalEffects(scene);
  assert.equal(records[0].geometryMode, "followTarget");

  const result = await page.evaluate(({ scene, records }) => {
    window.U.setStage(scene.width, scene.height);
    const registry = {};
    window.LaohuMotionEffects.register(registry, scene, records);
    const dispatchStates = [];
    for (const type of ["custom:laohu-motion-effects", "custom:laohu-motion-target"]) {
      const source = registry[type];
      registry[type] = (...args) => {
        dispatchStates.push(args[4]);
        if (args[1]?.id !== "follow-target") return source(...args);
        const context = args[0];
        const originalFillRect = context.fillRect;
        context.fillRect = function (x, y, width, height) {
          if (x === 10 && y === 20 && width === 20 && height === 20) targetFills.push({ x, y, width, height, alpha: context.globalAlpha });
          return originalFillRect.call(context, x, y, width, height);
        };
        try { return source(...args); } finally { context.fillRect = originalFillRect; }
      };
    }
    const originals = { lagged: window.MO.lagged, evaluateScene: window.MotionCore.evaluateScene };
    let evaluateCalls = 0;
    const sourceProgress = [];
    const targetFills = [];
    window.MO.lagged = function (...args) {
      const progress = originals.lagged.apply(this, args);
      sourceProgress.push({ index: args[0], count: args[1], phaseProgress: args[2], ratio: args[3], progress });
      return progress;
    };
    window.MotionCore.evaluateScene = function (...args) { evaluateCalls += 1; return originals.evaluateScene.apply(this, args); };
    const frames = {};
    try {
      for (const timeSec of [0.25, 0.65, 0.85, 0.95]) {
        dispatchStates.length = 0;
        sourceProgress.length = 0;
        targetFills.length = 0;
        const canvas = document.createElement("canvas"); canvas.width = scene.width; canvas.height = scene.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const state = window.MotionCore.drawFrame(canvas, scene, timeSec, registry);
        const pixels = Array.from(ctx.getImageData(0, 0, scene.width, scene.height).data);
        const alphaAt = (x, y) => pixels[(y * scene.width + x) * 4 + 3];
        const latestEvidence = window.MOTION_LOCAL_EFFECT_EVIDENCE.targetObjects["follow-target"] || null;
        const targetEvidence = latestEvidence?.lastCall?.timeSec === timeSec ? latestEvidence : null;
        frames[timeSec] = {
          progressCalls: structuredClone(sourceProgress),
          targetFills: structuredClone(targetFills),
          targetEvidence: structuredClone(targetEvidence),
          outputAlpha: timeSec === 0.25 || timeSec === 0.65
            ? alphaAt(Math.floor(targetEvidence.lastCall.projectedRect.x + 5), 25)
            : null,
          exactStateForwarded: dispatchStates.length > 0 && dispatchStates.every((candidate) => candidate === state),
          pixels,
        };
      }
      return { frames, evaluateCalls };
    } finally {
      window.MO.lagged = originals.lagged;
      window.MotionCore.evaluateScene = originals.evaluateScene;
    }
  }, { scene, records });

  const early = result.frames[0.25];
  const middle = result.frames[0.65];
  const hidden = result.frames[0.85];
  const restored = result.frames[0.95];
  assert.equal(result.evaluateCalls, 0, "the custom target and effect consume the drawFrame state without re-evaluating");
  for (const frame of [early, middle, restored]) assert.equal(frame.exactStateForwarded, true);
  assert.equal(early.targetFills.length, 1, "MO target is drawn once at the early sample");
  assert.equal(middle.targetFills.length, 1, "MO target is drawn once at the middle sample");
  assert.equal(hidden.targetFills.length, 0, "a hidden Core target is not copied or drawn by the effect adapter");
  assert.equal(restored.targetFills.length, 1, "the ordinary target renderer draws the restored target once");
  assert.ok(middle.targetEvidence.lastCall.projectedRect.x > early.targetEvidence.lastCall.projectedRect.x + 10, "the target's projected rectangle follows its Core transform");
  assert.ok(middle.targetEvidence.lastCall.phaseProgress > early.targetEvidence.lastCall.phaseProgress, "the shared absolute-time phase continues while the target moves");
  assert.ok(Math.abs(early.targetFills[0].alpha - 0.5 * early.targetEvidence.lastCall.targetOpacity) < 1e-12,
    "Core target opacity × original MO.lagged progress are applied once in the target renderer");
  assert.equal(early.targetEvidence.lastCall.drawn, true);
  assert.equal(hidden.progressCalls.length, 0, "Core skips the hidden local-target before invoking MO.lagged");
  assert.equal(hidden.targetEvidence, null, "a hidden custom target has no current draw receipt because Core correctly skips its draw callback");
  assert.ok(early.outputAlpha > 0 && early.outputAlpha < middle.outputAlpha, "final pixels retain the world-layer opacity and the single target reveal factor");

  await fs.mkdir(validationRoot, { recursive: true });
  await fs.writeFile(path.join(validationRoot, "follow-target-mo-evidence.json"), `${JSON.stringify({
    capture: "MotionCore.drawFrame + prevalidated LaohuMotionEffects local-target renderer in software Chrome Canvas2D",
    scope: "one moving world-space local-target rectangle; source MO.lagged phase, Core target opacity and world-layer opacity stay distinct",
    sampleTimesSec: [0.25, 0.65, 0.85, 0.95],
    secondEvaluateSceneCalls: result.evaluateCalls,
    results: Object.fromEntries(Object.entries(result.frames).map(([timeSec, frame]) => [timeSec, {
      MOprogress: frame.progressCalls,
      targetFillCalls: frame.targetFills,
      targetEvidence: frame.targetEvidence?.lastCall || null,
      sampledOutputAlpha: frame.outputAlpha,
      exactStateForwarded: frame.exactStateForwarded,
      rgbaSha256: createHash("sha256").update(Buffer.from(frame.pixels)).digest("hex"),
    }])),
    assertions: { oneTargetDrawPerVisibleFrame: early.targetFills.length === 1 && middle.targetFills.length === 1 && restored.targetFills.length === 1, hiddenTargetNotDrawn: hidden.targetFills.length === 0, movingProjection: middle.targetEvidence.lastCall.projectedRect.x > early.targetEvidence.lastCall.projectedRect.x },
  }, null, 2)}\n`);
});

test("MO.lagged changes only named target rectangles and follows a shared visual/audio phase", async () => {
  const sourceReady = await page.evaluate(() => Boolean(window.U && window.DG && window.MO && window.MotionOps && window.HuashuLocalEffects));
  if (!sourceReady) {
    for (const library of ["util.js", "paint.js", "kit.js", "motion.js", "camera.js", "diagram.js"]) {
      await page.addScriptTag({ path: path.join(localEffectLib, localModuleBySourceName[library]) });
    }
    await page.addScriptTag({ path: opsPath });
    await page.addScriptTag({ path: effectsAdapterPath });
  }
  const targetData = (x) => ({ primitive: "rect", geometry: { x, y: 24, width: 20, height: 20 }, fill: "#ff3344" });
  const phase = { id: "shared-stagger-window", startSec: 0.25, durationSec: 1.25, timeBasis: "scene-local", curve: "linear" };
  const scene = basicScene({
    duration: 2,
    objects: [
      { id: "first-target", type: "custom:huashu-local-target", space: "screen", data: targetData(12) },
      { id: "second-target", type: "custom:huashu-local-target", space: "screen", data: targetData(40) },
      { id: "unrelated-object", type: "rect", space: "screen", x: 78, y: 24, width: 14, height: 20, fill: "#24aa66" },
      {
        id: "local-effects", type: "custom:huashu-local-effects", space: "screen", data: {
          phases: [phase],
          audioEvents: [{ id: "same-stagger-hit", phaseId: phase.id, phaseOffsetSec: 0.1 }],
          motionEffects: [
            { id: "reveal-first", effectId: "huashu-mo-staggered-target-reveal", targetId: "first-target", phaseId: phase.id, geometry: { rect: targetData(12).geometry }, parameters: {}, stagger: { groupId: "named-pair", index: 0, count: 2, ratio: 0.4 } },
            { id: "reveal-second", effectId: "huashu-mo-staggered-target-reveal", targetId: "second-target", phaseId: phase.id, geometry: { rect: targetData(40).geometry }, parameters: {}, stagger: { groupId: "named-pair", index: 1, count: 2, ratio: 0.4 } },
          ],
        },
      },
    ],
  });
  const phaseRecord = MotionOps.validateLocalEffects(scene)[0].phase;
  const audioEvent = MotionOps.findSceneAudioEvents(scene).get("same-stagger-hit");
  assert.equal(audioEvent.phaseId, phase.id);
  assert.equal(phaseRecord, phase, "the visual targets and audio event refer to the same phase record");

  const evidence = await page.evaluate((scene) => {
    window.U.setStage(100, 100);
    window.MOTION_RENDERERS = {};
    window.HuashuLocalEffects.register(window.MOTION_RENDERERS);
    window.MOTION_LOCAL_EFFECT_EVIDENCE = { renderer: "custom:huashu-local-effects", instances: {}, targetObjects: {} };
    const sourceLagged = window.MO.lagged;
    window.__targetRevealSourceCalls = 0;
    window.MO.lagged = function (...args) {
      window.__targetRevealSourceCalls += 1;
      return sourceLagged.apply(this, args);
    };
    function renderFrame(input, timeSec) {
      const canvas = document.createElement("canvas");
      canvas.width = input.width;
      canvas.height = input.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      window.MotionCore.drawFrame(canvas, input, timeSec, window.MOTION_RENDERERS);
      return { pixels: Array.from(ctx.getImageData(0, 0, 100, 100).data), png: canvas.toDataURL("image/png").split(",")[1] };
    }
    const render = (input, timeSec) => renderFrame(input, timeSec).pixels;
    function alphaAt(pixels, x, y) { return pixels[(y * 100 + x) * 4 + 3]; }
    function roi(pixels, x0, y0, width, height) {
      const out = [];
      for (let y = y0; y < y0 + height; y += 1) {
        for (let x = x0; x < x0 + width; x += 1) {
          const i = (y * 100 + x) * 4;
          out.push(...pixels.slice(i, i + 4));
        }
      }
      return out;
    }
    const atEarly = render(scene, 0.5); // local phase progress .2
    const middleFrame = renderFrame(scene, 0.75); // local phase progress .4
    const atMiddle = middleFrame.pixels;
    const firstMiddleEvidence = structuredClone(window.MOTION_LOCAL_EFFECT_EVIDENCE.targetObjects["first-target"]);
    const secondMiddleEvidence = structuredClone(window.MOTION_LOCAL_EFFECT_EVIDENCE.targetObjects["second-target"]);
    const atEnd = render(scene, 1.5);
    const afterEnd = render(scene, 1.8);
    const revisitEarly = render(scene, 0.5);
    // Keep the unrelated object as the only visible object in the comparison scene.
    const control = { ...scene, objects: [scene.objects.find((item) => item.id === "unrelated-object")] };
    const controlPixels = render(control, 0.75);
    return {
      earlyAlpha: [alphaAt(atEarly, 16, 28), alphaAt(atEarly, 44, 28)],
      middleAlpha: [alphaAt(atMiddle, 16, 28), alphaAt(atMiddle, 44, 28)],
      endAlpha: [alphaAt(atEnd, 16, 28), alphaAt(atEnd, 44, 28)],
      afterEndAlpha: [alphaAt(afterEnd, 16, 28), alphaAt(afterEnd, 44, 28)],
      seekRepeatEqual: atEarly.every((value, index) => value === revisitEarly[index]),
      unrelatedRegionUnchanged: roi(atMiddle, 78, 24, 14, 20).every((value, index) => value === roi(controlPixels, 78, 24, 14, 20)[index]),
      firstMiddleEvidence,
      secondMiddleEvidence,
      middlePngBase64: middleFrame.png,
      sourceCalls: window.__targetRevealSourceCalls,
      controlHasNoTargetPixels: alphaAt(controlPixels, 16, 28) === 0 && alphaAt(controlPixels, 44, 28) === 0,
    };
  }, scene);
  assert.ok(evidence.earlyAlpha[0] > 0, "the first named target begins revealing from the shared phase");
  assert.equal(evidence.earlyAlpha[1], 0, "the next named target remains hidden until its source stagger window");
  assert.ok(evidence.middleAlpha[0] > evidence.middleAlpha[1] && evidence.middleAlpha[1] > 0, "original MO.lagged gives later peers a distinct local progress");
  assert.deepEqual(evidence.endAlpha, [255, 255], "both target rectangles reach full opacity at phase completion");
  assert.deepEqual(evidence.afterEndAlpha, [255, 255], "the completed targets persist after the phase");
  assert.ok(evidence.seekRepeatEqual, "out-of-order seek returns byte-identical target pixels");
  assert.ok(evidence.unrelatedRegionUnchanged, "the unrelated object pixels are unchanged by the target reveal");
  assert.ok(evidence.controlHasNoTargetPixels, "the comparison scene excludes both effect targets");
  assert.ok(evidence.sourceCalls >= 8, "the renderer actually calls the pinned MO.lagged for both target instances");
  assert.equal(evidence.firstMiddleEvidence.sourceFunction, "MO.lagged");
  assert.equal(evidence.secondMiddleEvidence.sourceFunction, "MO.lagged");
  assert.equal(evidence.firstMiddleEvidence.phaseId, "shared-stagger-window");
  assert.equal(evidence.secondMiddleEvidence.phaseId, "shared-stagger-window");
  assert.ok(evidence.firstMiddleEvidence.lastCall.targetOpacity > evidence.secondMiddleEvidence.lastCall.targetOpacity,
    JSON.stringify({ first: evidence.firstMiddleEvidence, second: evidence.secondMiddleEvidence }));
  const middlePng = Buffer.from(evidence.middlePngBase64, "base64");
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.writeFile(path.join(validationRoot, "local-effects-target-reveal-middle.png"), middlePng);
  await fs.writeFile(path.join(validationRoot, "local-effects-target-reveal-evidence.json"), `${JSON.stringify({
    browserPath,
    sourceFunctions: { "MO.lagged": evidence.sourceCalls },
    sharedPhaseId: phase.id,
    earlyAlpha: evidence.earlyAlpha,
    middleAlpha: evidence.middleAlpha,
    endAlpha: evidence.endAlpha,
    afterEndAlpha: evidence.afterEndAlpha,
    seekRepeatEqual: evidence.seekRepeatEqual,
    unrelatedRegionUnchanged: evidence.unrelatedRegionUnchanged,
    targetCalls: [evidence.firstMiddleEvidence, evidence.secondMiddleEvidence],
    middlePngSha256: createHash("sha256").update(middlePng).digest("hex"),
  }, null, 2)}\n`);
});

test("render.mjs auto-loads the pinned local-effect adapter and encodes its target-level result", async (t) => {
  const ffmpegPath = process.env.MOTION_FFMPEG;
  assert.ok(ffmpegPath && path.isAbsolute(ffmpegPath), "MOTION_FFMPEG must be an explicit absolute path for the CLI render integration test");
  const runner = path.join(skillDir, "scripts", "render.mjs");
  const scenePath = path.join(validationRoot, "local-effects-cli-scene.json");
  const outputPath = path.join(validationRoot, "local-effects-cli.mp4");
  const cachePath = path.join(tempRoot, "render-cli");
  const phase = { id: "shared-stagger-window", startSec: 0.25, durationSec: 1.25, timeBasis: "scene-local", curve: "linear" };
  const target = (id, x) => ({ id, type: "custom:huashu-local-target", space: "screen", data: { primitive: "rect", geometry: { x, y: 24, width: 20, height: 20 }, fill: "#ff3344" } });
  const scene = basicScene({
    duration: 2,
    background: "#000000",
    objects: [
      target("first-target", 12),
      target("second-target", 40),
      { id: "unrelated-object", type: "rect", space: "screen", x: 78, y: 24, width: 14, height: 20, fill: "#24aa66" },
      { id: "local-effects", type: "custom:huashu-local-effects", space: "screen", data: {
        phases: [phase],
        audioEvents: [{ id: "same-stagger-hit", phaseId: phase.id, phaseOffsetSec: 0.1 }],
        motionEffects: [
          { id: "reveal-first", effectId: "huashu-mo-staggered-target-reveal", targetId: "first-target", phaseId: phase.id, geometry: { rect: { x: 12, y: 24, width: 20, height: 20 } }, parameters: {}, stagger: { groupId: "named-pair", index: 0, count: 2, ratio: 0.4 } },
          { id: "reveal-second", effectId: "huashu-mo-staggered-target-reveal", targetId: "second-target", phaseId: phase.id, geometry: { rect: { x: 40, y: 24, width: 20, height: 20 } }, parameters: {}, stagger: { groupId: "named-pair", index: 1, count: 2, ratio: 0.4 } },
        ],
      } },
    ],
  });
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
  const result = spawnSync(process.execPath, [runner, "--scene", scenePath, "--output", outputPath, "--cache-dir", cachePath,
    "--browser", browserPath, "--ffmpeg", ffmpegPath, "--samples", "0.5,0.75,1.5", "--overwrite"], {
    cwd: path.resolve(skillDir, "../../.."),
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot },
  });
  assert.equal(result.error, undefined, `render.mjs process could not start: ${result.error?.message}`);
  assert.equal(result.status, 0, `render.mjs local-effect CLI integration failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const manifestPath = result.stdout.match(/^MANIFEST (.+)$/m)?.[1];
  assert.ok(manifestPath, `render.mjs did not report its manifest path: ${result.stdout}`);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.localEffects.validatedInstances.length, 2);
  assert.ok(manifest.templateEffects.calls["MO.lagged"] > 0, "the CLI calls the pinned original MO.lagged wrapper");
  assert.equal(manifest.templateEffectStage.actual.width, scene.width);
  assert.equal(manifest.templateEffectStage.actual.height, scene.height);
  assert.ok(manifest.localEffects.adapter.sha256, "manifest pins the actual local adapter loaded by render.mjs");
  for (const targetId of ["first-target", "second-target"]) {
    const evidence = manifest.localEffects.runtimeEvidence.targetObjects[targetId];
    assert.ok(evidence.calls > 0, `${targetId} was actually drawn by the registered target renderer`);
    assert.equal(evidence.sourceFunction, "MO.lagged");
    assert.equal(evidence.phaseId, phase.id);
    assert.ok(evidence.lastCall.targetOpacity >= 0.999999, `${targetId} reaches full opacity on the final encoded frame`);
  }
  assert.equal(manifest.samples.length, 3);
  for (const sample of manifest.samples) await fs.access(sample.file);
  const decoded = spawnSync(ffmpegPath, ["-v", "error", "-sseof", "-0.1", "-i", outputPath, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], {
    encoding: null, timeout: 60_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(decoded.status, 0, `FFmpeg could not decode the final CLI frame: ${decoded.stderr?.toString() || ""}`);
  const pixel = (x, y) => [...decoded.stdout.subarray((y * scene.width + x) * 4, (y * scene.width + x) * 4 + 4)];
  const first = pixel(16, 28), second = pixel(44, 28), unrelated = pixel(84, 28);
  assert.ok(first[0] > first[1] * 2 && second[0] > second[1] * 2, "both named targets are visible in the final MP4 frame");
  assert.ok(unrelated[1] > unrelated[0] * 1.5, "the unrelated object remains visible in its original region");

  const projectRoot = path.resolve(skillDir, "../../..");
  const ownerP2Scene = path.join(validationRoot, "owner-style-translated.scene.json");
  const ownerRejectedOutput = path.join(validationRoot, "owner-style-translated-rejected.mp4");
  const ownerP2 = structuredClone(scene);
  ownerP2.styles = { "shifted-owner": { translateX: 20 } };
  ownerP2.objects.find((object) => object.id === "local-effects").style = "shifted-owner";
  await fs.writeFile(ownerP2Scene, `${JSON.stringify(ownerP2, null, 2)}\n`);
  await fs.rm(ownerRejectedOutput, { force: true });
  const rejected = spawnSync(process.execPath, [runner, "--scene", ownerP2Scene, "--output", ownerRejectedOutput, "--cache-dir", path.join(tempRoot, "owner-transform-rejected"),
    "--browser", browserPath, "--ffmpeg", ffmpegPath, "--overwrite"], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot },
  });
  assert.equal(rejected.error, undefined, `render.mjs owner-transform guard process could not start: ${rejected.error?.message}`);
  assert.notEqual(rejected.status, 0, "the translated owner scene must fail before producing an MP4");
  assert.match(rejected.stderr, /owner resolved at .* translateX must be neutral/);
  await assert.rejects(fs.access(ownerRejectedOutput), "invalid owner transform leaves no successful MP4");
  await fs.writeFile(path.join(validationRoot, "local-effects-cli-render-evidence.json"), `${JSON.stringify({
    command: result.stdout.trim().split("\n")[0], manifestPath, outputPath, render: manifest.render,
    runtimeCalls: manifest.templateEffects.calls,
    targetObjects: manifest.localEffects.runtimeEvidence.targetObjects,
    adapter: manifest.localEffects.adapter,
    finalFrameSamples: { first, second, unrelated },
    ownerTransformRejection: { scenePath: ownerP2Scene, status: rejected.status, stderr: rejected.stderr.trim(), noOutputMp4: true },
  }, null, 2)}\n`);
  t.diagnostic(`render.mjs manifest: ${manifestPath}`);
});
