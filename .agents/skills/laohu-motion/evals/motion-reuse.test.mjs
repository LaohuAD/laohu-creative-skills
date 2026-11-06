import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  buildAudioGraph,
  clipForEvent,
  findSceneAudioEvents,
  mapLocalTimeToFilm,
  mapSceneEvents,
  renderAudioPlan,
  secondsToSamples,
  validateAssetUse,
  validatePlan,
} from "../scripts/audio.mjs";

const require = createRequire(import.meta.url);
const core = require("../scripts/motion-core.js");
const ops = require("../scripts/motion-ops.js");
const testDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(testDir, "..");
const repositoryDir = path.resolve(skillDir, "../../..");
const integrationFfmpeg = process.env.MOTION_TEST_FFMPEG;
const integrationBrowser = process.env.MOTION_TEST_BROWSER || process.env.MOTION_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let integrationBrowserAvailable = false;
try { require("node:fs").accessSync(integrationBrowser, require("node:fs").constants.X_OK); integrationBrowserAvailable = true; } catch {}
let integrationPlaywrightAvailable = false;
try { require.resolve("playwright"); integrationPlaywrightAvailable = true; } catch {}

function motionFollowBoxScene(overrides = {}) {
  const phase = { id: "follow-phase", startSec: 0.1, durationSec: 1.0, curve: "ease-in-out-cubic" };
  const expected = {
    entityId: "diagram-node", instanceId: "follow-op", operationId: "laohu.motion-follow-box/1",
    targetId: "target-rect", phaseId: "follow-phase",
  };
  return {
    version: 1, width: 200, height: 120, fps: 10, duration: 1.2, background: "#101820",
    camera: { x: 84, y: 77, zoom: 1.2, rotation: 7 },
    layers: [
      { id: "world-parent", space: "world", transform: { x: 0, y: -5, rotation: 15, scale: 1.1 } },
      { id: "world-children", parent: "world-parent", transform: { x: -4, y: 7, scaleX: 1.05 } },
      { id: "motion-overlay", space: "screen" },
    ],
    objects: [
      { id: "target-rect", type: "rect", layer: "world-children", x: 70, y: 50, width: 50, height: 24, anchorX: 87, anchorY: 58, rotation: 9, scale: 1.02, fill: "#246b6b", stroke: "#d5fff4", lineWidth: 2 },
      { id: "target-label", type: "text", layer: "world-children", x: 75, y: 46, text: "目标文字", fontFamily: "sans-serif", fontSize: 10, fill: "#ffffff", textAlign: "left" },
      {
        id: "follow-op", type: "custom:laohu-motion-operation", layer: "motion-overlay", space: "screen", stroke: "#ffd166", lineWidth: 2,
        data: {
          motionOperations: [{
            ...expected,
            nativeParameters: { fromLineWidthPx: 2, toLineWidthPx: 4 },
            controlledAttributes: ["projected-target-frame", "screen-space-line-width"],
          }],
          motionEvidence: { motionRequirements: [{ id: "follow-window", scope: "target-follow", startSec: 0.2, endSec: 0.8, expected: [expected] }] },
        },
      },
    ],
    events: [
      { id: "parent-motion", target: { kind: "layer", id: "world-parent" }, property: "transform.x", start: 0, duration: 1.2, from: 0, to: 18 },
      { id: "camera-pan", target: { kind: "camera", id: "camera" }, property: "x", start: 0, duration: 1.2, from: 84, to: 74 },
    ],
    bindings: [], variables: {}, phases: [phase],
    ...overrides,
  };
}

test("motion operations reuse MotionCore and map film-local time deterministically", () => {
  assert.equal(ops.core, core);
  assert.equal(ops.core.cameraForAnchor, core.cameraForAnchor);
  assert.equal(ops.core.pointAt, core.pointAt);
  assert.equal(ops.filmToLocalTime(5, { filmStartSec: 4, filmEndSec: 8, localStartSec: 10, localEndSec: 18 }), 12);
  assert.equal(ops.filmToLocalTime(0, { filmStartSec: 4, filmEndSec: 8, localStartSec: 10, localEndSec: 18 }), 10);
  assert.equal(ops.filmToLocalTime(0, { filmStartSec: 4, filmEndSec: 8, localStartSec: 10, localEndSec: 18, clamp: false }), 2);
});

test("dynamic follow-box consumes the exact evaluated target, parent layers and scene camera", () => {
  const scene = motionFollowBoxScene();
  core.assertValidScene(scene);
  const [record] = ops.validateMotionOperations(scene);
  assert.equal(record.operationId, "laohu.motion-follow-box/1");
  const timeSec = 0.4;
  const state = core.evaluateScene(scene, timeSec, true);
  const projection = core.projectRectObject(scene, state, "target-rect");
  const sampled = ops.sampleMotionFollowBox(scene, timeSec, record, state);
  assert.equal(sampled.status, "drawn");
  assert.deepEqual(sampled.screenCorners, projection.screenCorners, "the follow frame uses Core's exact final target/layer/camera projection");
  assert.ok(sampled.screenCorners.some((point) => point.x !== scene.objects[0].x || point.y !== scene.objects[0].y), "non-origin object anchor and transformed parents affect the projection");
  assert.ok(Math.abs(sampled.lineWidthPx - (2 + 2 * ops.samplePhase(timeSec, record.phase).curvedProgress)) < 1e-12, "phase progress feeds the real screen-space stroke width");
  assert.equal(ops.sampleMotionFollowBox(scene, record.endSec, record, core.evaluateScene(scene, record.endSec, true)).status, "not-drawn", "the operation phase is half-open");
  assert.throws(() => ops.validateMotionOperations({ ...scene, objects: scene.objects.map((object) => object.id === "follow-op" ? {
    ...object, data: { ...object.data, motionOperations: [{ ...object.data.motionOperations[0], operationId: "onetake.zoomThrough/1" }] },
  } : object) }), /unsupported or source-only/);
  assert.throws(() => ops.validateMotionOperations({ ...scene, objects: scene.objects.map((object) => object.id === "follow-op" ? {
    ...object, data: { ...object.data, motionOperations: [{ ...object.data.motionOperations[0], nativeParameters: { ...object.data.motionOperations[0].nativeParameters, zoom: 2 } }] },
  } : object) }), /must contain exactly fromLineWidthPx and toLineWidthPx/);
});

test("follow-box requires visible stroke geometry, includes line width, and keeps partial crops", () => {
  const partialScene = motionFollowBoxScene();
  partialScene.objects.find((object) => object.id === "target-rect").x += 50;
  const partialState = core.evaluateScene(partialScene, 0.4, true);
  const [partialRecord] = ops.validateMotionOperations(partialScene);
  const partial = ops.sampleMotionFollowBox(partialScene, 0.4, partialRecord, partialState);
  assert.equal(partial.status, "drawn", "a clipped target with an edge inside the viewport still draws its outline");
  assert.equal(partial.clippedToViewport, true);
  assert.ok(partial.visibleBounds.width > 0 && partial.visibleBounds.width < partial.screenBounds.width);

  const enclosingScene = motionFollowBoxScene({
    width: 320, height: 180, fps: 12, duration: 1.5,
    camera: { x: 160, y: 90, zoom: 1, rotation: 0 },
    layers: [
      { id: "world-parent", space: "world" },
      { id: "world-children", parent: "world-parent" },
      { id: "motion-overlay", space: "screen" },
    ],
    events: [{ id: "camera-pan", target: { kind: "camera", id: "camera" }, property: "x", start: 0, duration: 1.5, from: 160, to: 179 }],
  });
  Object.assign(enclosingScene.objects.find((object) => object.id === "target-rect"), {
    x: -4000, y: -4000, width: 8000, height: 8000, anchorX: 0, anchorY: 0,
    rotation: 0, scale: 1,
  });
  const enclosingState = core.evaluateScene(enclosingScene, 0.75, true);
  const enclosingProjection = core.projectRectObject(enclosingScene, enclosingState, "target-rect");
  assert.ok(enclosingProjection.screenCorners.every((point) => point.x < 0 || point.x > enclosingScene.width || point.y < 0 || point.y > enclosingScene.height),
    "all four target corners are outside even though its filled polygon contains the viewport");
  const [enclosingRecord] = ops.validateMotionOperations(enclosingScene);
  const enclosing = ops.sampleMotionFollowBox(enclosingScene, 0.75, enclosingRecord, enclosingState);
  assert.equal(enclosing.status, "not-drawn", "an enclosing viewport with all outline edges far outside is not visible evidence");
  assert.equal(enclosing.reason, "target-outline-outside-viewport");

  const strokeReachScene = motionFollowBoxScene({
    camera: { x: 100, y: 60, zoom: 1, rotation: 0 },
    layers: [
      { id: "world-parent", space: "world" },
      { id: "world-children", parent: "world-parent" },
      { id: "motion-overlay", space: "screen" },
    ],
    events: [],
  });
  Object.assign(strokeReachScene.objects.find((object) => object.id === "target-rect"), {
    x: -28, y: 45, width: 20, height: 20, anchorX: 0, anchorY: 0, rotation: 0, scale: 1,
  });
  const strokeOwner = strokeReachScene.objects.find((object) => object.id === "follow-op");
  strokeOwner.data.motionOperations[0].nativeParameters = { fromLineWidthPx: 18, toLineWidthPx: 18 };
  const strokeReachState = core.evaluateScene(strokeReachScene, 0.5, true);
  const [wideRecord] = ops.validateMotionOperations(strokeReachScene);
  const wideStroke = ops.sampleMotionFollowBox(strokeReachScene, 0.5, wideRecord, strokeReachState);
  assert.equal(wideStroke.status, "drawn", "the 18 px outline band reaches the viewport although the target rect is fully outside");
  strokeOwner.data.motionOperations[0].nativeParameters = { fromLineWidthPx: 14, toLineWidthPx: 14 };
  const [narrowRecord] = ops.validateMotionOperations(strokeReachScene);
  const narrowStroke = ops.sampleMotionFollowBox(strokeReachScene, 0.5, narrowRecord, strokeReachState);
  assert.equal(narrowStroke.status, "not-drawn", "a narrower 14 px outline no longer reaches the viewport");
});

test("real browser follow-box pixels, strict frame receipt, hashes and probe failures", { skip: !integrationFfmpeg || !integrationBrowserAvailable || !integrationPlaywrightAvailable }, async () => {
  const runId = `${process.pid}-${Date.now()}`;
  const validationRoot = path.join(repositoryDir, ".cache", "validation", "onetake", "implementation", "motion-follow-box", runId);
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "onetake", "motion-follow-box", runId);
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.mkdir(cacheRoot, { recursive: true });
  const scene = motionFollowBoxScene();
  const scenePath = path.join(validationRoot, "follow-box.scene.json");
  const outputPath = path.join(validationRoot, "follow-box.mp4");
  await fs.writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
  const renderArgs = (name, sourcePath = scenePath) => [
    path.join(skillDir, "scripts", "render.mjs"), "--scene", sourcePath,
    "--output", path.join(validationRoot, `${name}.mp4`),
    "--cache-dir", path.join(cacheRoot, `${name}-render`),
    "--browser", integrationBrowser, "--ffmpeg", integrationFfmpeg,
    "--require-motion-evidence", "--samples", "0.2,0.7", "--overwrite",
  ];
  const env = {
    ...process.env,
    NODE_PATH: process.env.NODE_PATH || path.join(repositoryDir, ".cache", "tmp", "video-shotcraft", "motion-renderer-runtime", "node_modules"),
    TMPDIR: cacheRoot, TMP: cacheRoot, TEMP: cacheRoot,
  };
  const rendered = spawnSync(process.execPath, renderArgs("follow-box"), { encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024, env });
  assert.equal(rendered.status, 0, `strict browser render failed\n${rendered.stdout}\n${rendered.stderr}`);
  const manifestPath = rendered.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
  assert.ok(manifestPath, `render.mjs did not report a manifest: ${rendered.stdout}`);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.inputFingerprints.scene.sha256.length, 64);
  assert.equal(manifest.inputFingerprints.drawModule.status, "not-provided");
  assert.equal(manifest.inputFingerprints.motionCore.sha256.length, 64);
  assert.equal(manifest.inputFingerprints.motionOps.sha256.length, 64);
  assert.equal(manifest.inputFingerprints.providerCatalog.sha256.length, 64);
  assert.match(manifest.resourceEvidence.limits, /system font resolution/i);
  const traces = manifest.motionEvidence.frames;
  assert.deepEqual(traces.map((frame) => frame.frameIndex), [2, 3, 4, 5, 6, 7], "the [0.2,0.8) window samples each encoded timestamp inside the half-open interval");
  assert.ok(traces.every((frame) => frame.viewport.width === 200 && frame.viewport.height === 120 && frame.clock.timeBasis === "scene-local"));
  assert.ok(traces.every((frame) => new Set(frame.observed.map((row) => row.instanceId)).size === 1));
  assert.ok(traces.every((frame) => frame.observed[0].status === "drawn" && frame.observed[0].screenCorners.length === 4 && frame.observed[0].lineWidthPx > 0));

  const probePath = path.join(skillDir, "scripts", "motion-probe.mjs");
  const runProbe = (manifestInput = manifestPath, probeScene = scenePath) => spawnSync(process.execPath, [probePath, "--scene", probeScene, "--manifest", manifestInput], {
    encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024, env,
  });
  const positiveProbe = runProbe();
  assert.equal(positiveProbe.status, 0, `motion-probe failed\n${positiveProbe.stdout}\n${positiveProbe.stderr}`);
  const probeReport = JSON.parse(positiveProbe.stdout);
  assert.equal(probeReport.status, "pass");
  assert.equal(probeReport.outputSha256, manifest.outputSha256);
  assert.equal(probeReport.checkedFrames, 6);
  assert.equal(probeReport.duplicateFrames, 0);
  assert.equal(probeReport.missingFrames, 0);
  assert.equal(probeReport.unsupportedFrames, 0);

  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: integrationBrowser, headless: true, args: ["--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setContent("<canvas id='contact'></canvas>");
    const inspectFrame = async (frameIndex) => {
      const row = traces.find((item) => item.frameIndex === frameIndex);
      const state = core.evaluateScene(scene, frameIndex / scene.fps, true);
      const projected = core.projectRectObject(scene, state, "target-rect");
      const imageData = (await fs.readFile(row.frameFile)).toString("base64");
      const expectedBounds = {
        x: Math.min(...projected.screenCorners.map((point) => point.x)),
        y: Math.min(...projected.screenCorners.map((point) => point.y)),
        width: Math.max(...projected.screenCorners.map((point) => point.x)) - Math.min(...projected.screenCorners.map((point) => point.x)),
        height: Math.max(...projected.screenCorners.map((point) => point.y)) - Math.min(...projected.screenCorners.map((point) => point.y)),
      };
      const pixels = await page.evaluate(async ({ imageData, expectedCorners, expectedBounds }) => {
        const image = new Image(); image.src = `data:image/png;base64,${imageData}`; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const yellow = [], white = [];
        for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const r = data[offset], g = data[offset + 1], b = data[offset + 2], a = data[offset + 3];
          if (a > 0 && r > 235 && g > 155 && g < 235 && b < 145) yellow.push({ x, y });
          if (a > 0 && r > 245 && g > 245 && b > 245) white.push({ x, y });
        }
        const center = (items) => ({ x: items.reduce((sum, item) => sum + item.x, 0) / items.length, y: items.reduce((sum, item) => sum + item.y, 0) / items.length });
        const edgeHits = expectedCorners.map((start, index) => {
          const end = expectedCorners[(index + 1) % expectedCorners.length];
          const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
          return yellow.some((point) => Math.abs(point.x - midpoint.x) <= 3 && Math.abs(point.y - midpoint.y) <= 3);
        });
        return {
          yellowCount: yellow.length, whiteCount: white.length, edgeHits,
          yellowCenter: center(yellow), whiteCenter: center(white),
          expectedCenter: { x: expectedBounds.x + expectedBounds.width / 2, y: expectedBounds.y + expectedBounds.height / 2 },
          imageSize: { width: canvas.width, height: canvas.height },
        };
      }, { imageData, expectedCorners: projected.screenCorners, expectedBounds });
      assert.ok(pixels.yellowCount > 20 && pixels.edgeHits.every(Boolean), `real PNG pixels do not follow Core-projected corners at frame ${frameIndex}: ${JSON.stringify(pixels)}`);
      assert.ok(pixels.whiteCount > 5, `the scene's sibling text was not rendered at frame ${frameIndex}`);
      assert.ok(Math.abs(pixels.yellowCenter.x - pixels.expectedCenter.x) < 2 && Math.abs(pixels.yellowCenter.y - pixels.expectedCenter.y) < 2,
        `yellow outline center is detached from the target projection at frame ${frameIndex}: ${JSON.stringify(pixels)}`);
      return pixels;
    };
    const atStart = await inspectFrame(2);
    const atMid = await inspectFrame(4);
    const atEnd = await inspectFrame(7);
    const screenCenter = (timeSec) => {
      const corners = core.projectRectObject(scene, core.evaluateScene(scene, timeSec, true), "target-rect").screenCorners;
      return { x: corners.reduce((sum, point) => sum + point.x, 0) / 4, y: corners.reduce((sum, point) => sum + point.y, 0) / 4 };
    };
    const firstCenter = screenCenter(0.2), finalCenter = screenCenter(0.7);
    const expectedDelta = { x: finalCenter.x - firstCenter.x, y: finalCenter.y - firstCenter.y };
    assert.ok(Math.hypot(expectedDelta.x, expectedDelta.y) > 5, "the parent/camera fixture must visibly move between checked frames");
    assert.ok(Math.abs((atEnd.whiteCenter.x - atStart.whiteCenter.x) - expectedDelta.x) < 2
      && Math.abs((atEnd.whiteCenter.y - atStart.whiteCenter.y) - expectedDelta.y) < 2,
    "real sibling text and target use the same parent/camera frame state");

    const partialScene = structuredClone(scene);
    partialScene.objects.find((object) => object.id === "target-rect").x += 50;
    const partialScenePath = path.join(validationRoot, "partial-crop.scene.json");
    await fs.writeFile(partialScenePath, `${JSON.stringify(partialScene, null, 2)}\n`);
    const partialRender = spawnSync(process.execPath, renderArgs("partial-crop", partialScenePath), {
      encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024, env,
    });
    assert.equal(partialRender.status, 0, `a partially cropped target should remain renderable\n${partialRender.stdout}\n${partialRender.stderr}`);
    const partialManifestPath = partialRender.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
    assert.ok(partialManifestPath, `partial-crop render did not report a manifest: ${partialRender.stdout}`);
    const partialManifest = JSON.parse(await fs.readFile(partialManifestPath, "utf8"));
    const partialFrame = partialManifest.motionEvidence.frames.find((frame) => frame.frameIndex === 4);
    assert.equal(partialFrame.observed[0].status, "drawn");
    assert.equal(partialFrame.observed[0].clippedToViewport, true);
    assert.ok(partialFrame.observed[0].visibleBounds.width > 0);
    const partialProbeResult = runProbe(partialManifestPath, partialScenePath);
    assert.equal(partialProbeResult.status, 0, `partially cropped target probe failed\n${partialProbeResult.stdout}\n${partialProbeResult.stderr}`);
    const partialPng = (await fs.readFile(partialFrame.frameFile)).toString("base64");
    const partialYellowPixels = await page.evaluate(async (data) => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] > 0 && pixels[offset] > 235 && pixels[offset + 1] > 155 && pixels[offset + 1] < 235 && pixels[offset + 2] < 145) count += 1;
      }
      return count;
    }, partialPng);
    assert.ok(partialYellowPixels > 0, "the clipped operation's real browser frame contains visible outline pixels");

    const framePaths = [0, 2, 4, 7].map((frameIndex) => ({
      frameIndex,
      path: frameIndex === 0 ? path.join(manifest.frameDirectory, "00000000.png") : traces.find((item) => item.frameIndex === frameIndex).frameFile,
    }));
    const contactDataUrl = await page.evaluate(async (frames) => {
      const canvas = document.getElementById("contact"); canvas.width = 800; canvas.height = 180;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#080b10"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e5e7eb"; ctx.font = "12px sans-serif";
      ctx.fillText("Motion follow-box — frames 0, 2, 4, 7; viewport 200×120", 8, 15);
      for (let index = 0; index < frames.length; index += 1) {
        const image = new Image(); image.src = `data:image/png;base64,${frames[index].base64}`; await image.decode();
        ctx.drawImage(image, index * 200, 20, 200, 120);
      }
      ctx.fillStyle = "#cbd5e1"; ctx.font = "11px sans-serif";
      ctx.fillText("Camera: center (84,77), zoom 1.2, rotation 7°; animated pan x 84→74", 8, 154);
      ctx.fillText("Parent: rotation 15°, scale 1.1; child: x−4/y+7, scaleX 1.05; target anchor (87,58)", 8, 171);
      return canvas.toDataURL("image/png");
    }, await Promise.all(framePaths.map(async (frame) => ({ ...frame, base64: (await fs.readFile(frame.path)).toString("base64") }))));
    const contactBytes = Buffer.from(contactDataUrl.slice(contactDataUrl.indexOf(",") + 1), "base64");
    const contactSheetPath = path.join(validationRoot, "follow-box-contact-sheet.png");
    await fs.writeFile(contactSheetPath, contactBytes);
    await fs.writeFile(path.join(validationRoot, "follow-box-test-evidence.json"), `${JSON.stringify({
      positiveProbe: probeReport, pixelChecks: { frame2: atStart, frame4: atMid, frame7: atEnd, expectedDelta },
      partialCrop: {
        scene: partialScenePath,
        probe: JSON.parse(partialProbeResult.stdout),
        frameIndex: partialFrame.frameIndex,
        status: partialFrame.observed[0].status,
        clippedToViewport: partialFrame.observed[0].clippedToViewport,
        visibleBounds: partialFrame.observed[0].visibleBounds,
        yellowPixels: partialYellowPixels,
      },
      contactSheet: { path: contactSheetPath, frameIndices: [0, 2, 4, 7], pixelVerificationFrames: [2, 4, 7] },
    }, null, 2)}\n`);
  } finally {
    await browser.close();
  }

  const changedViewport = structuredClone(manifest);
  changedViewport.motionEvidence.frames[0].viewport.width += 1;
  const viewportManifest = path.join(cacheRoot, "mutated-viewport.manifest.json");
  await fs.writeFile(viewportManifest, `${JSON.stringify(changedViewport, null, 2)}\n`);
  const badViewport = runProbe(viewportManifest);
  assert.notEqual(badViewport.status, 0);
  assert.match(badViewport.stderr, /stale viewport, clock, frame index or expected sample list/);

  const duplicateFrame = structuredClone(manifest);
  duplicateFrame.motionEvidence.frames.push(structuredClone(duplicateFrame.motionEvidence.frames[0]));
  const duplicateManifest = path.join(cacheRoot, "mutated-duplicate.manifest.json");
  await fs.writeFile(duplicateManifest, `${JSON.stringify(duplicateFrame, null, 2)}\n`);
  const badDuplicate = runProbe(duplicateManifest);
  assert.notEqual(badDuplicate.status, 0);
  assert.match(badDuplicate.stderr, /duplicate encoded-frame sample/);

  const missingSample = structuredClone(manifest);
  missingSample.motionEvidence.frames[0].observed[0].status = "unsupported";
  missingSample.motionEvidence.frames[0].unsupportedIds = ["follow-op"];
  const missingManifest = path.join(cacheRoot, "mutated-missing.manifest.json");
  await fs.writeFile(missingManifest, `${JSON.stringify(missingSample, null, 2)}\n`);
  const badMissing = runProbe(missingManifest);
  assert.notEqual(badMissing.status, 0);
  assert.match(badMissing.stderr, /missing\/unsupported samples/);

  const originalSceneBytes = await fs.readFile(scenePath);
  const changedScene = structuredClone(scene);
  changedScene.objects.find((object) => object.id === "target-rect").x += 1;
  await fs.writeFile(scenePath, `${JSON.stringify(changedScene, null, 2)}\n`);
  const staleSceneProbe = runProbe();
  await fs.writeFile(scenePath, originalSceneBytes);
  assert.notEqual(staleSceneProbe.status, 0);
  assert.match(staleSceneProbe.stderr, /scene-json input changed since render/);

  const noExpected = structuredClone(scene);
  noExpected.objects.find((object) => object.id === "follow-op").data.motionEvidence.motionRequirements[0].expected = [];
  const noExpectedPath = path.join(validationRoot, "zero-coverage.scene.json");
  await fs.writeFile(noExpectedPath, `${JSON.stringify(noExpected, null, 2)}\n`);
  const zeroCoverage = spawnSync(process.execPath, renderArgs("zero-coverage", noExpectedPath), { encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024, env });
  assert.notEqual(zeroCoverage.status, 0);
  assert.match(zeroCoverage.stderr, /zero coverage cannot pass/);

  const unsupportedRequirement = structuredClone(scene);
  unsupportedRequirement.objects.find((object) => object.id === "follow-op").data.motionEvidence.motionRequirements[0].requireWholeVisibility = true;
  const unsupportedPath = path.join(validationRoot, "unsupported-requirement.scene.json");
  await fs.writeFile(unsupportedPath, `${JSON.stringify(unsupportedRequirement, null, 2)}\n`);
  const rejectedUnsupported = spawnSync(process.execPath, renderArgs("unsupported-requirement", unsupportedPath), { encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024, env });
  assert.notEqual(rejectedUnsupported.status, 0);
  assert.match(rejectedUnsupported.stderr, /unsupported motion-evidence fields/);

  const offscreenScene = structuredClone(scene);
  offscreenScene.objects.find((object) => object.id === "target-rect").x = 2000;
  const offscreenPath = path.join(validationRoot, "offscreen-target.scene.json");
  await fs.writeFile(offscreenPath, `${JSON.stringify(offscreenScene, null, 2)}\n`);
  const offscreen = spawnSync(process.execPath, renderArgs("offscreen-target", offscreenPath), { encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024, env });
  assert.notEqual(offscreen.status, 0, "a fully offscreen target cannot satisfy a visible follow-box requirement");
  assert.match(offscreen.stderr, /Required motion evidence is incomplete/);
  assert.equal(await fs.access(path.join(validationRoot, "offscreen-target.mp4")).then(() => true, () => false), false, "incomplete coverage does not commit an MP4");

  const enclosingScene = motionFollowBoxScene({
    width: 320, height: 180, fps: 12, duration: 1.5,
    camera: { x: 160, y: 90, zoom: 1, rotation: 0 },
    layers: [
      { id: "world-parent", space: "world" },
      { id: "world-children", parent: "world-parent" },
      { id: "motion-overlay", space: "screen" },
    ],
    events: [{ id: "camera-pan", target: { kind: "camera", id: "camera" }, property: "x", start: 0, duration: 1.5, from: 160, to: 179 }],
  });
  Object.assign(enclosingScene.objects.find((object) => object.id === "target-rect"), {
    x: -4000, y: -4000, width: 8000, height: 8000, anchorX: 0, anchorY: 0,
    rotation: 0, scale: 1,
  });
  const enclosingOperation = enclosingScene.objects.find((object) => object.id === "follow-op");
  enclosingOperation.data.motionEvidence.motionRequirements[0].startSec = 0.5;
  enclosingOperation.data.motionEvidence.motionRequirements[0].endSec = 1.0;
  const enclosingPath = path.join(validationRoot, "enclosing-target.scene.json");
  await fs.writeFile(enclosingPath, `${JSON.stringify(enclosingScene, null, 2)}\n`);
  const enclosingRender = spawnSync(process.execPath, renderArgs("enclosing-target", enclosingPath), {
    encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024, env,
  });
  assert.notEqual(enclosingRender.status, 0, "an enclosing target with all outline edges outside the viewport cannot satisfy required evidence");
  assert.match(enclosingRender.stderr, /Required motion evidence is incomplete/);
  assert.equal(await fs.access(path.join(validationRoot, "enclosing-target.mp4")).then(() => true, () => false), false,
    "an outline with zero viewport intersection does not commit an MP4");
  const diagnosticsPath = enclosingRender.stderr.match(/Diagnostics: ([^\r\n]+)/)?.[1];
  assert.ok(diagnosticsPath, `enclosing-target render did not report its evidence diagnostics: ${enclosingRender.stderr}`);
  const diagnostics = JSON.parse(await fs.readFile(diagnosticsPath, "utf8"));
  const frameNine = diagnostics.motionEvidence.frames.find((frame) => frame.frameIndex === 9);
  assert.ok(frameNine, "the audited 0.75 second frame is present in the real render evidence");
  assert.equal(frameNine.observed[0].status, "not-drawn");
  assert.equal(frameNine.observed[0].reason, "target-outline-outside-viewport");
  assert.equal(diagnostics.motionEvidence.validFrames, 0);
  assert.equal(diagnostics.motionEvidence.requirements[0].missingFrames, 6);
  assert.equal(diagnostics.outputCommit, "blocked");
  const decodedFrame = spawnSync(integrationFfmpeg, [
    "-v", "error", "-i", frameNine.frameFile, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1",
  ], { encoding: null, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(decodedFrame.status, 0, `could not inspect real enclosing-target browser pixels: ${decodedFrame.stderr?.toString("utf8")}`);
  let enclosingYellowPixels = 0;
  for (let offset = 0; offset < decodedFrame.stdout.length; offset += 4) {
    const r = decodedFrame.stdout[offset], g = decodedFrame.stdout[offset + 1], b = decodedFrame.stdout[offset + 2], a = decodedFrame.stdout[offset + 3];
    if (a > 0 && r > 235 && g > 155 && g < 235 && b < 145) enclosingYellowPixels += 1;
  }
  assert.equal(enclosingYellowPixels, 0, "the real browser-rendered frame contains no follow-box pixels for an enclosing outline");
  const testEvidencePath = path.join(validationRoot, "follow-box-test-evidence.json");
  const testEvidence = JSON.parse(await fs.readFile(testEvidencePath, "utf8"));
  testEvidence.enclosingViewport = {
    scene: enclosingPath,
    diagnostics: diagnosticsPath,
    frameIndex: frameNine.frameIndex,
    status: frameNine.observed[0].status,
    reason: frameNine.observed[0].reason,
    validFrames: diagnostics.motionEvidence.validFrames,
    missingFrames: diagnostics.motionEvidence.requirements[0].missingFrames,
    outputCommit: diagnostics.outputCommit,
    yellowPixelsInRealBrowserPng: enclosingYellowPixels,
  };
  await fs.writeFile(testEvidencePath, `${JSON.stringify(testEvidence, null, 2)}\n`);
  assert.ok(await fs.access(outputPath).then(() => true, () => false), "positive control MP4 is present");
});

test("named absolute phases sample independent anchored channels and drive shared audio events", () => {
  const phase = {
    id: "recognition",
    startSec: 1,
    durationSec: 0.4,
    timeBasis: "film-global",
    channels: {
      scale: { from: 1.2, to: 1, curve: "ease-out-cubic", anchor: { x: 48, y: 32 } },
      alpha: { from: 0, to: 1, durationSec: 0.12, curve: "linear" },
      blur: { from: 8, to: 0, offsetSec: 0.08, durationSec: 0.2, curve: "ease-out-cubic" },
    },
  };
  const atStart = ops.sampleChannels(1, phase);
  const mid = ops.sampleChannels(1.2, phase);
  const end = ops.sampleChannels(1.4, phase);
  assert.equal(atStart.phase.id, "recognition");
  assert.equal(atStart.channels.alpha.value, 0);
  assert.equal(atStart.channels.blur.value, 8);
  assert.ok(mid.channels.scale.value < 1.2 && mid.channels.scale.value > 1);
  assert.equal(mid.channels.alpha.value, 1, "alpha can finish on its own shorter phase");
  assert.deepEqual(mid.channels.scale.anchor, { x: 48, y: 32 });
  assert.equal(end.channels.scale.value, 1, "the named phase lands on its endpoint");
  assert.ok(Math.abs(ops.samplePhase(1.2, phase).value - 0.5) < 1e-12);

  const scene = {
    duration: 3,
    fps: 30,
    objects: [{ id: "subject", data: { timeBasis: "film-global", phases: [phase], audioEvents: [{ id: "recognition-hit", phaseId: "recognition", phaseOffsetSec: 0.06 }] } }],
  };
  const plan = { durationSec: 3, events: [{ id: "hit", eventId: "recognition-hit", assetId: "tone", bus: "sfx" }] };
  assert.equal(mapSceneEvents(plan, scene, new Map())[0].filmTimeSec, 1.06);
  const moved = structuredClone(scene);
  moved.objects[0].data.phases[0].startSec = 1.6;
  assert.ok(Math.abs(ops.sampleChannels(1.8, moved.objects[0].data.phases[0]).phase.progress - 0.5) < 1e-12);
  assert.ok(Math.abs(mapSceneEvents(plan, moved, new Map())[0].filmTimeSec - 1.66) < 1e-12);
  assert.throws(() => mapSceneEvents(plan, { ...scene, objects: [{ id: "subject", data: { timeBasis: "scene-local", phases: [{ ...phase, timeBasis: undefined }], audioEvents: scene.objects[0].data.audioEvents } }] }, new Map()), /requires timeMapId/);
  assert.throws(() => mapSceneEvents(plan, { ...scene, objects: [{ id: "subject", data: { phases: [phase], audioEvents: [{ id: "recognition-hit", phaseId: "recognition", time: 1 }] } }] }, new Map()), /must not duplicate its phaseId/);
});

test("seeded particles stay stable across shuffled seeks and emphasis has a real local overshoot", () => {
  const first = ops.stableParticles("film-3", 12, { x: 4, y: 8, width: 20, height: 30, minRadius: 1, maxRadius: 4 });
  const second = ops.stableParticles("film-3", 12, { x: 4, y: 8, width: 20, height: 30, minRadius: 1, maxRadius: 4 });
  assert.deepEqual(second, first);
  const queriedOutOfOrder = [11, 1, 8].map((index) => ops.stableParticles("film-3", 12, { x: 4, y: 8, width: 20, height: 30, minRadius: 1, maxRadius: 4 })[index]);
  assert.deepEqual(queriedOutOfOrder, [first[11], first[1], first[8]]);
  const config = { startSec: 1, attackSec: 1, holdSec: 0.4, decaySec: 0.5, baseline: 0, peak: 1, overshoot: 0.25 };
  assert.equal(ops.emphasisEnvelope(0.5, config), 0);
  assert.ok(ops.emphasisEnvelope(1.875, config) > 1);
  assert.equal(ops.emphasisEnvelope(2.2, config), 1);
  assert.equal(ops.emphasisEnvelope(2.9, config), 0);
});

test("local mask restores canvas state even when a renderer throws", () => {
  const calls = [];
  const ctx = {
    save() { calls.push("save"); },
    restore() { calls.push("restore"); },
    beginPath() { calls.push("begin"); },
    clip() { calls.push("clip"); },
  };
  assert.throws(() => ops.withLocalMask(ctx, () => calls.push("path"), () => { throw new Error("draw failed"); }), /draw failed/);
  assert.deepEqual(calls, ["save", "begin", "path", "clip", "restore"]);
});

test("font-ready text cache respects alignment bounds, rejects load failure, and invalidates", async () => {
  let canvasCount = 0;
  const fontListeners = new Map();
  const fontSet = {
    ready: Promise.resolve(),
    async load(font) { return font.includes("Missing") ? [] : [{}]; },
    check() { return true; },
    addEventListener(name, callback) { fontListeners.set(name, callback); },
    removeEventListener(name) { fontListeners.delete(name); },
  };
  function createCanvas() {
    canvasCount += 1;
    const calls = [];
    const context = {
      calls,
      measureText() { return { width: 10, actualBoundingBoxLeft: 2, actualBoundingBoxRight: 14, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 4 }; },
      fillText(text, x, y) { calls.push({ type: "fill", text, x, y, align: this.textAlign, baseline: this.textBaseline }); },
      strokeText(text, x, y) { calls.push({ type: "stroke", text, x, y, align: this.textAlign, baseline: this.textBaseline }); },
      setTransform() {},
      filter: "none",
    };
    return { width: 0, height: 0, getContext() { return context; } };
  }
  const cache = ops.createTextBitmapCache({ fontSet, createCanvas, maxEntries: 2 });
  const style = { font: '700 24px "Test Face"', align: "right", requireFont: true, strokeStyle: "#000", lineWidth: 1 };
  const bitmap = await cache.get("猫", style);
  assert.equal(await cache.get("猫", style), bitmap);
  assert.equal(canvasCount, 1);
  assert.equal(bitmap.canvas.getContext("2d").calls[0].align, "right");
  assert.equal(bitmap.canvas.getContext("2d").calls[0].baseline, "alphabetic");
  const rightCall = bitmap.canvas.getContext("2d").calls[0];
  assert.ok(rightCall.x > 2, "right-aligned text has room for its measured glyph bounds");
  assert.ok(rightCall.x + 14 + 0.5 <= bitmap.canvas.width - 2, "right-aligned stroke remains inside the cached bitmap");
  const placements = [];
  bitmap.draw({ drawImage(...args) { placements.push(args); } }, 100, 30);
  assert.equal(placements[0][1] + bitmap.anchorX, 100, "draw positions the cached glyph by its right text anchor");
  const centered = await cache.get("猫", { ...style, align: "center" });
  const centerCall = centered.canvas.getContext("2d").calls[0];
  assert.equal(centerCall.x, centered.canvas.width / 2, "center alignment uses the bitmap's actual center anchor");
  assert.ok(centerCall.x - 2 >= 2.5 && centerCall.x + 14 + 0.5 <= centered.canvas.width - 2, "centered ink and stroke fit with padding on both sides");
  centered.draw({ drawImage(...args) { placements.push(args); } }, 100, 30);
  assert.equal(placements[1][1] + centered.canvas.width / 2, 100, "draw positions the centered bitmap by its center anchor");
  fontListeners.get("loadingdone")();
  assert.notEqual(await cache.get("猫", style), bitmap);
  assert.equal(canvasCount, 3, "font lifecycle changes invalidate both alignment variants");
  const variants = await cache.getVariants("猫", style, 3);
  assert.equal(variants.clear.variant, "clear");
  assert.equal(variants.soft.variant, "soft");
  assert.equal(variants.soft.blurPx, 3);
  assert.ok(variants.soft.canvas.width > variants.clear.canvas.width, "the soft cache reserves room for the actual blur instead of clipping it");
  assert.equal(canvasCount, 4, "the clear bitmap reuses its style entry while the soft variant gets a separate cached canvas");
  await assert.rejects(cache.get("字", { ...style, font: '700 24px "Missing Face"' }), /did not load/);
  await assert.rejects(cache.get("text", { font: "16px sans-serif", baseline: "top" }), /alphabetic baseline/);
  cache.dispose();
});

test("text cache preserves zero ascent and signed negative-bearing glyph bounds", async () => {
  const fontSet = { ready: Promise.resolve(), async load() { return [{}]; }, check() { return true; } };
  const context = {
    font: "16px Test", textAlign: "left", textBaseline: "alphabetic", filter: "none",
    measureText() { return { width: 10, actualBoundingBoxLeft: -2, actualBoundingBoxRight: 12, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 4 }; },
    fillText(_text, x, y) { this.drawAnchor = { x, y }; },
    strokeText(_text, x, y) { this.drawAnchor = { x, y }; },
  };
  const canvas = { width: 0, height: 0, getContext() { return context; } };
  const cache = ops.createTextBitmapCache({ fontSet, createCanvas: () => canvas });
  const bitmap = await cache.get("x", { font: "16px Test", padding: 2, requireFont: true });
  assert.equal(bitmap.ascent, 0, "zero ascent is a valid Canvas measurement");
  assert.equal(bitmap.descent, 4);
  assert.equal(context.drawAnchor.x, 0, "signed left bearing determines the text anchor without clamping");
  assert.equal(context.drawAnchor.y, 2, "zero ascent is not replaced by a guessed font ascent");
  assert.equal(canvas.width, 14, "negative left bearing is included in the actual ink span");
  assert.equal(canvas.height, 8);
  cache.dispose();
});

test("text occupancy preserves zero metrics and negative bearings while marking absent glyph metrics as estimates", () => {
  const context = {
    font: "12px Old Face", textAlign: "left", textBaseline: "alphabetic", direction: "ltr", letterSpacing: "0px",
    measureText(text) {
      if (text === "A") return { width: 0, actualBoundingBoxLeft: -2, actualBoundingBoxRight: 3, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 4 };
      return { width: 15, actualBoundingBoxLeft: 3, actualBoundingBoxRight: 14, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 };
    },
  };
  const measured = ops.measureTextOccupancy(context, "A\nBC", {
    font: "700 20px Test", align: "right", direction: "ltr", baseline: "alphabetic", letterSpacing: 1.5,
    lineHeight: 30, lineWidth: 2, padding: 2,
  });
  assert.equal(measured.measurement.lines[0].actual.left, -2, "negative left bearing remains the actual Canvas value");
  assert.equal(measured.measurement.lines[0].actual.ascent, 0, "zero ascent is a valid metric, not a fallback trigger");
  assert.equal(measured.measurement.lines[0].advanceWidth, 0);
  assert.equal(measured.perLine[0].inkBounds.x, 2);
  assert.equal(measured.perLine[0].inkBounds.y, 0);
  assert.equal(measured.lineCount, 2);
  assert.equal(measured.perLine[1].inkBounds.y, 20);
  assert.equal(context.font, "12px Old Face", "temporary measurement style is restored");
  assert.equal(context.textAlign, "left");
  assert.equal(context.letterSpacing, "0px");

  const inheritedContext = {
    font: "12px Old Face", textAlign: "left", textBaseline: "alphabetic", direction: "inherit", letterSpacing: "0px",
    canvas: { ownerDocument: { defaultView: { getComputedStyle: () => ({ direction: "rtl" }) } } },
    measureText(text) {
      this.measuredStyles = { font: this.font, align: this.textAlign, baseline: this.textBaseline, direction: this.direction, letterSpacing: this.letterSpacing };
      return { width: [...text].length * 10, actualBoundingBoxLeft: -2, actualBoundingBoxRight: 12, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 4 };
    },
  };
  const wrapped = ops.measureTextOccupancy(inheritedContext, "a b", {
    font: "700 20px Test", align: "start", baseline: "middle", letterSpacing: 2, maxWidth: 20,
  });
  assert.equal(wrapped.direction, "rtl", "inherit resolves from the actual canvas element direction");
  assert.deepEqual(wrapped.perLine.map((line) => line.text), ["a ", "b"], "occupancy uses MotionCore's real soft-wrap result");
  assert.equal(wrapped.perLine[0].advanceBounds.x, -22, "start alignment follows the resolved RTL direction");
  assert.deepEqual(inheritedContext.measuredStyles, {
    font: "700 20px Test", align: "start", baseline: "middle", direction: "rtl", letterSpacing: "2px",
  }, "glyph metrics are measured under the exact styles returned for the paired draw call");
  assert.equal(inheritedContext.direction, "inherit", "temporary inherited-direction resolution is restored");

  const fallbackContext = { font: "18px Fallback", textAlign: "left", textBaseline: "alphabetic", measureText: () => ({ width: 20 }) };
  const fallback = ops.measureTextOccupancy(fallbackContext, "字", {});
  assert.equal(fallback.measurement.kind, "mixed-or-fallback");
  assert.deepEqual(fallback.measurement.missingActualMetrics, ["left", "right", "ascent", "descent"]);
  assert.throws(() => ops.measureTextOccupancy(fallbackContext, "字", { letterSpacing: 2 }), /letterSpacing is unavailable/);
});

test("composed label geometry carries text, a numbered plate, and clearance exactly once", () => {
  const measuredText = {
    schema: "motion-text-occupancy/v1",
    measurement: { kind: "canvas-actual-bounds" },
    paintBounds: { x: 10, y: -12, width: 60, height: 20 },
    occupiedBounds: { x: 8, y: -14, width: 64, height: 24 },
  };
  const geometry = ops.composeLabelGeometry({
    measuredText,
    parts: [{ id: "number", drawBounds: { x: -19, y: -15, width: 14, height: 14 }, paintBounds: { x: -20, y: -16, width: 16, height: 16 } }],
    background: { id: "plate", innerPadding: { top: 4, right: 7, bottom: 5, left: 6 }, contentPartIds: ["number"] },
    clearance: { x: 3, y: 3 },
  });
  assert.equal(geometry.schema, "motion-label-geometry/v1");
  assert.equal(geometry.measurementKind, "canvas-actual-bounds");
  assert.deepEqual(geometry.background.drawBounds, { x: 3, y: 3, width: 103, height: 33 }, "plate uses text plus selected component paint bounds and applies its insets once");
  assert.deepEqual(geometry.parts[0], {
    id: "number", drawBounds: { x: 10, y: 8, width: 14, height: 14 }, paintBounds: { x: 9, y: 7, width: 16, height: 16 },
  }, "drawing uses the shape geometry while collision coverage includes the larger real paint extent");
  assert.deepEqual(geometry.textPaintBounds, { x: 39, y: 11, width: 60, height: 20 });
  assert.deepEqual(geometry.textAnchorOffset, { x: 29, y: 23 });
  assert.deepEqual(geometry.visualBounds, { x: 3, y: 3, width: 103, height: 33 });
  assert.deepEqual(geometry.occupiedBounds, { x: 0, y: 0, width: 109, height: 39 }, "measured text padding is retained and group clearance expands only the outer occupied rectangle");

  const plain = ops.composeLabelGeometry({
    measuredText: { paintBounds: { x: -1, y: -10, width: 30, height: 12 }, occupiedBounds: { x: -3, y: -12, width: 34, height: 16 }, measurement: { kind: "mixed-or-fallback" } },
  });
  assert.equal(plain.background, null);
  assert.deepEqual(plain.parts, []);
  assert.deepEqual(plain.textAnchorOffset, { x: 3, y: 12 });
  assert.deepEqual(plain.occupiedBounds, { x: 0, y: 0, width: 34, height: 16 }, "plain text remains a valid no-plate/no-parts branch");

  assert.throws(() => ops.composeLabelGeometry({ measuredText, parts: [{ id: "negative", drawBounds: { x: 0, y: 0, width: -1, height: 1 } }] }), /must not be negative/);
  assert.throws(() => ops.composeLabelGeometry({ measuredText, background: { id: "bad", innerPadding: { top: -1, right: 0, bottom: 0, left: 0 } } }), /inner padding must not be negative/);
  assert.throws(() => ops.composeLabelGeometry({ measuredText, background: { id: "missing-inset", innerPadding: { top: null, right: 0, bottom: 0, left: 0 } } }), /must be a finite number/);
  assert.throws(() => ops.composeLabelGeometry({ measuredText, clearance: { x: 0, y: Infinity } }), /clearance.y must be finite/);
  assert.throws(() => ops.composeLabelGeometry({ measuredText, clearance: { x: null, y: 0 } }), /clearance.x must be a finite number/);
});

test("the documented group bridge uses placed geometry for drawing and refuses missing targets or unresolved positions", async () => {
  const toolchain = await fs.readFile(path.join(skillDir, "references", "toolchain-render-and-check.md"), "utf8");
  const section = toolchain.slice(toolchain.indexOf("#### 完整标注组的布局结果进入绘制"));
  const example = section.match(/```js\n([\s\S]*?)\n```/);
  assert.ok(example, "the executable call bridge remains present in the toolchain reference");
  const context = { MotionOps: ops };
  vm.runInNewContext(`${example[1]}\nglobalThis.drawBlueprintLabel = drawBlueprintLabel;`, context);

  const calls = [];
  const canvasStateStack = [];
  const canvasContext = {
    font: "12px sans-serif", textAlign: "left", textBaseline: "alphabetic", direction: "ltr", letterSpacing: "0px", globalAlpha: 0.8, fillStyle: "#000000",
    save() {
      canvasStateStack.push({ font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, direction: this.direction, letterSpacing: this.letterSpacing, globalAlpha: this.globalAlpha, fillStyle: this.fillStyle });
      calls.push("save");
    },
    restore() { Object.assign(this, canvasStateStack.pop()); calls.push("restore"); },
    setTransform() { calls.push("screen-space"); },
    measureText(text) { return { width: text.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: text.length * 10, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 2 }; },
    fillRect(x, y, width, height) { calls.push({ type: "plate", x, y, width, height }); },
    fillText(text, x, y) { calls.push({ type: "text", text, x, y }); },
  };
  const label = { id: "caption", text: "结果", relation: "labels the observed result", attachmentTargetId: "result-object", style: { font: "16px sans-serif", align: "left", baseline: "alphabetic", fillStyle: "#17202a" } };
  const planFor = (textAnchor) => ({
    coordinateSpace: "screen", readingInterval: [1, 2], viewport: { x: 0, y: 0, width: 180, height: 90 },
    candidates: [{ id: "authored", textAnchor }],
    protectedAreas: [{ id: "other-object", box: { x: 140, y: 0, width: 30, height: 30 }, visibleInterval: [1, 2] }],
    parts: [{ id: "marker", drawBounds: { x: -19, y: -15, width: 12, height: 12 } }],
    background: { id: "plate", innerPadding: { top: 3, right: 4, bottom: 3, left: 4 }, contentPartIds: ["marker"], fillStyle: "#f4f0e7" },
    clearance: 2,
    drawPart: { marker(ctx, bounds) { calls.push({ type: "marker", bounds }); ctx.globalAlpha = 0.1; ctx.fillStyle = "#de0000"; } },
  });

  const missing = context.drawBlueprintLabel(canvasContext, label, planFor({ x: 40, y: 40 }), { visibleTargets: [] }, [], 1.4);
  assert.equal(missing.status, "missing-target");
  assert.equal(calls.some((call) => call && typeof call === "object"), false, "a missing attached target is rejected before any drawing");

  const unresolved = context.drawBlueprintLabel(canvasContext, label, planFor({ x: 175, y: 85 }), { visibleTargets: [{ id: "result-object" }] }, [], 1.4);
  assert.equal(unresolved.status, "reflow-required");
  assert.equal(calls.some((call) => call && typeof call === "object"), false, "an off-canvas candidate is rejected before any drawing");

  const frameItems = [];
  const placed = context.drawBlueprintLabel(canvasContext, label, planFor({ x: 42, y: 44 }), { visibleTargets: [{ id: "result-object" }] }, frameItems, 1.4);
  assert.equal(placed.status, "placed");
  assert.ok(calls.some((call) => call && call.type === "plate"));
  assert.ok(calls.some((call) => call && call.type === "marker"));
  assert.deepEqual(calls.find((call) => call && call.type === "text"), { type: "text", text: "结果", x: 42, y: 44 }, "placed geometry is inverted back to the exact text anchor passed to fillText");
  assert.equal(canvasContext.globalAlpha, 0.8, "a component drawer's alpha change is isolated from text and frame registration");
  assert.equal(frameItems.length, 1);
  assert.equal(frameItems[0].id, "caption");
  assert.deepEqual(JSON.parse(JSON.stringify(frameItems[0].box)), JSON.parse(JSON.stringify(placed.placement.box)), "the same complete occupied group is registered after drawing");
  assert.equal(frameItems[0].opacity, 0.8);
});

test("real Canvas text and font changes alter the composed group that is drawn and registered", { skip: !integrationFfmpeg || !integrationBrowserAvailable || !integrationPlaywrightAvailable }, async () => {
  const runId = String(process.pid);
  const validationRoot = process.env.MOTION_LAYOUT_TEST_VALIDATION_DIR
    ? path.join(path.resolve(process.env.MOTION_LAYOUT_TEST_VALIDATION_DIR), "real-canvas-group", runId)
    : path.join(repositoryDir, ".cache", "validation", "motion-visibility-sound", "2026-10-30", "real-canvas-group", runId);
  const tempRoot = process.env.MOTION_LAYOUT_TEST_TMP_DIR
    ? path.join(path.resolve(process.env.MOTION_LAYOUT_TEST_TMP_DIR), "real-canvas-group", runId)
    : path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "real-canvas-group", runId);
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
  const toolchain = await fs.readFile(path.join(skillDir, "references", "toolchain-render-and-check.md"), "utf8");
  const section = toolchain.slice(toolchain.indexOf("#### 完整标注组的布局结果进入绘制"));
  const example = section.match(/```js\n([\s\S]*?)\n```/);
  assert.ok(example, "the actual Canvas renderer test consumes the documented bridge source");

  const drawModule = path.join(validationRoot, "real-canvas-group.draw.js");
  await fs.writeFile(drawModule, `${example[1]}
const badgeDrawer = (ctx, box) => {
  ctx.fillStyle = "#d86637";
  ctx.beginPath();
  ctx.ellipse(box.x + box.width / 2, box.y + box.height / 2, box.width / 2, box.height / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.1;
};
window.MOTION_RENDERERS = { "custom:group-probe": (ctx, object, time) => {
  const targets = object.data.targets;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const target of targets) { ctx.fillStyle = "#395879"; ctx.fillRect(target.box.x, target.box.y, target.box.width, target.box.height); }
  ctx.restore();
  const frameItems = [];
  const rows = object.data.labels.map(({ label, plan }) => {
    const result = drawBlueprintLabel(ctx, label, { ...plan, drawPart: { badge: badgeDrawer } }, { visibleTargets: targets }, frameItems, time);
    if (result.status !== "placed") throw new Error("group probe stopped: " + result.status);
    return { id: label.id, font: result.measured.font, measurementKind: result.measured.measurement.kind,
      text: label.text, textAnchor: result.anchor, geometry: result.geometry, placedBox: result.placement.box,
      registeredOpacity: frameItems.find((item) => item.id === label.id).opacity };
  });
  window.__groupProbe = { rows, frameItems, targets };
  window.MOTION_EVIDENCE.groupGeometry = rows;
} };
window.MOTION_EVIDENCE = {
  layoutFrame(time, scene, canvas, MotionOps) {
    const state = window.__groupProbe;
    const items = [
      ...state.frameItems,
      ...state.targets.map((target) => ({ id: target.id, role: "photo", box: target.box })),
    ];
    return MotionOps.diagnoseLayout({ timeSec: time, scope: "full-label-groups-and-targets", viewport: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      expectedIds: items.map((item) => item.id), items });
  },
};
`);

  const scenePath = path.join(validationRoot, "real-canvas-group.scene.json");
  const outputPath = path.join(validationRoot, "real-canvas-group.mp4");
  const targets = [
    { id: "photo-a", visible: true, box: { x: 650, y: 12, width: 64, height: 60 } },
    { id: "photo-b", visible: true, box: { x: 650, y: 94, width: 64, height: 68 } },
  ];
  const plan = (textAnchor, protectedAreas) => ({
    coordinateSpace: "screen", explanationUnitId: "unit:captions", readingInterval: [0, 1],
    viewport: { x: 0, y: 0, width: 800, height: 320 },
    candidates: [{ id: "authored-location", textAnchor }],
    protectedAreas,
    parts: [{ id: "badge", drawBounds: { x: -24, y: -17, width: 13, height: 13 } }],
    background: { id: "plate", innerPadding: { top: 5, right: 7, bottom: 5, left: 7 }, contentPartIds: ["badge"], fillStyle: "#f0ece2" },
    clearance: 3,
  });
  const scene = {
    version: 1, width: 800, height: 320, fps: 5, duration: 1, background: "#101820",
    layers: [], variables: {}, events: [], bindings: [],
    objects: [{ id: "probe", type: "custom:group-probe", space: "screen", data: {
      targets,
      labels: [
        { label: { id: "short-label", text: "猫", relation: "names the visible subject", attachmentTargetId: "photo-a", style: { font: "14px sans-serif", fillStyle: "#17202a", align: "left", baseline: "alphabetic" } }, plan: plan({ x: 66, y: 54 }, targets.map((target) => ({ id: target.id, role: "photo", box: target.box, visibleInterval: [0, 1] }))) },
        { label: { id: "long-label", text: "不同字号与更长文字会改变标注组", relation: "explains the visible comparison", attachmentTargetId: "photo-b", style: { font: "22px serif", fillStyle: "#17202a", align: "left", baseline: "alphabetic" } }, plan: plan({ x: 66, y: 143 }, targets.map((target) => ({ id: target.id, role: "photo", box: target.box, visibleInterval: [0, 1] }))) },
      ],
    } }],
  };
  await fs.writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
  const result = spawnSync(process.execPath, [
    path.join(skillDir, "scripts", "render.mjs"), "--scene", scenePath, "--output", outputPath,
    "--cache-dir", path.join(tempRoot, "browser-cache"), "--browser", integrationBrowser,
    "--ffmpeg", integrationFfmpeg, "--draw-module", drawModule, "--overwrite",
  ], {
    encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot },
  });
  await fs.writeFile(path.join(validationRoot, "render-result.json"), JSON.stringify({ status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr }, null, 2));
  assert.equal(result.status, 0, `real Canvas renderer failed\n${result.stdout}\n${result.stderr}`);
  const manifestPath = result.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
  assert.ok(manifestPath, `render did not report manifest: ${result.stdout}`);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  await fs.copyFile(manifestPath, path.join(validationRoot, "render-manifest.json"));
  const groups = manifest.consumerEvidence.groupGeometry;
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => group.measurementKind === "canvas-actual-bounds"), "browser Canvas supplied actual TextMetrics for both groups");
  assert.ok(groups[1].geometry.occupiedBounds.width > groups[0].geometry.occupiedBounds.width, "longer copy plus larger font changes the full composed group width");
  assert.ok(groups[1].geometry.occupiedBounds.height > groups[0].geometry.occupiedBounds.height, "larger type changes the full composed group height");
  assert.equal(groups[1].textAnchor.x, 66, "the anchor used by fillText remains the authored location after geometry is inverted");
  assert.equal(groups[0].geometry.parts[0].drawBounds.width, 13);
  assert.deepEqual(groups[0].geometry.parts[0].drawBounds, groups[0].geometry.parts[0].paintBounds, "the example's unfiltered badge uses equal draw and paint bounds");
  assert.ok(groups.every((group) => group.registeredOpacity === 1), "part drawer Canvas state is restored before text and frame registration");
  assert.equal(manifest.layoutDiagnostics.conflictPairCount, 0, "the encoded group and protected-target frames have no unallowed AABB conflicts");
  assert.equal(manifest.layoutDiagnostics.coverage.completeForDeclaredScopes, true, "only the explicitly registered groups and target rectangles are covered");
});

test("label candidates use measured occupancy, semantic targets, reading windows, and explicit protected-area overlaps", () => {
  const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
  const cases = [
    {
      id: "prepare", targetId: "training-photo", relation: "labels the marked training samples",
      candidates: [{ id: "under-rail", box: { x: 180, y: 295, width: 260, height: 90 } }, { id: "clear-space", box: { x: 80, y: 180, width: 260, height: 90 }, priority: 1 }],
      protectedAreas: [{ id: "rail", role: "graphic", box: { x: 300, y: 300, width: 1400, height: 6 } }, { id: "photo", role: "image", box: { x: 295, y: 318, width: 110, height: 160 } }],
      rejected: "under-rail",
    },
    {
      id: "model", targetId: "model", relation: "identifies the designed model",
      candidates: [{ id: "on-category-tag", box: { x: 560, y: 450, width: 250, height: 72 } }, { id: "clear-space", box: { x: 480, y: 560, width: 250, height: 72 }, priority: 1 }],
      protectedAreas: [{ id: "category-tag", role: "text", box: { x: 600, y: 456, width: 72, height: 36 } }],
      rejected: "on-category-tag",
    },
    {
      id: "goal", targetId: "training-criterion", relation: "states the criterion used to train the model",
      candidates: [{ id: "over-bin-stack", box: { x: 1100, y: 925, width: 350, height: 90 } }, { id: "clear-space", box: { x: 80, y: 560, width: 350, height: 90 }, priority: 1 }],
      protectedAreas: [{ id: "bin-photo-stack", role: "image", box: { x: 1220, y: 900, width: 270, height: 160 } }],
      rejected: "over-bin-stack",
    },
  ];
  for (const item of cases) {
    const input = { ...item, viewport, readingInterval: [8, 9] };
    const selected = ops.chooseLabelPlacement(input);
    assert.equal(selected.status, "placed");
    assert.equal(selected.targetId, item.targetId);
    assert.equal(selected.candidateId, "clear-space");
    assert.equal(selected.rejected[0].candidateId, item.rejected);
    assert.deepEqual(ops.chooseLabelPlacement(input), selected, "the same reading interval produces stable placement after a shuffled seek");
  }

  const occupied = (text) => ops.measureTextOccupancy({
    font: "20px Test", textAlign: "left", textBaseline: "alphabetic",
    measureText(value) { const width = [...value].length * 20; return { width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width, actualBoundingBoxAscent: 16, actualBoundingBoxDescent: 4 }; },
  }, text, {}).occupiedBounds;
  const protectedAreas = [{ id: "photo", role: "image", box: { x: 45, y: -25, width: 60, height: 50 } }];
  const makeInput = (text) => {
    const size = occupied(text);
    return {
      id: "copy", targetId: "photo", relation: "caption for the photo", viewport: { x: 0, y: -30, width: 300, height: 60 }, readingInterval: [0, 2], protectedAreas,
      candidates: [
        { id: "nearby", box: { x: 0, y: -10, width: size.width, height: size.height } },
        { id: "farther", box: { x: 120, y: -10, width: size.width, height: size.height }, priority: 1 },
      ],
    };
  };
  assert.equal(ops.chooseLabelPlacement(makeInput("AI")).candidateId, "nearby");
  assert.equal(ops.chooseLabelPlacement(makeInput("目标解释文字")).candidateId, "farther", "longer measured copy moves to another candidate instead of colliding");
});

test("layout diagnostics use conservative screen bounds, disclose omissions, and permit only named overlap pairs", () => {
  const rotated = ops.transformBounds({ x: 10, y: 20, width: 30, height: 10 }, [0, 1, -1, 0, 100, 0]);
  assert.deepEqual(rotated, { x: 70, y: 10, width: 10, height: 30, coordinateSpace: "screen", boundsKind: "conservative-aabb" });
  const snapshot = ops.diagnoseLayout({
    timeSec: 1, scope: "annotation-group", viewport: { x: 0, y: 0, width: 100, height: 80 },
    expectedIds: ["label", "photo", "shadow", "missing"],
    items: [
      { id: "label", role: "text", box: { x: 10, y: 10, width: 30, height: 12 } },
      { id: "photo", role: "image", box: { x: 25, y: 12, width: 30, height: 20 } },
      { id: "shadow", role: "decoration", box: { x: 12, y: 12, width: 26, height: 10 } },
      { id: "offscreen", role: "text", box: { x: 98, y: 72, width: 9, height: 9 } },
    ],
    allowOverlaps: [["label", "shadow"]],
  });
  assert.equal(snapshot.status, "partial");
  assert.deepEqual(snapshot.coverage.missingIds, ["missing"]);
  assert.ok(snapshot.conflicts.some((entry) => entry.ids.includes("photo") && entry.ids.includes("label")));
  assert.ok(snapshot.intersections.some((entry) => entry.allowed && entry.ids.includes("shadow")));
  assert.deepEqual(snapshot.outOfFrame, ["offscreen"]);
  const empty = ops.diagnoseLayout({ timeSec: 1, scope: "empty", viewport: { x: 0, y: 0, width: 100, height: 80 }, expectedIds: [], items: [] });
  assert.equal(empty.status, "not-checked", "an empty frame cannot become a clean pass");
});

test("renderer preserves allowed-overlap evidence and reports early, empty, missing, partial, stale, malformed, and browser-default text states", { skip: !integrationFfmpeg || !integrationBrowserAvailable || !integrationPlaywrightAvailable }, async () => {
  const runId = String(process.pid);
  const validationRoot = process.env.MOTION_LAYOUT_TEST_VALIDATION_DIR
    ? path.resolve(process.env.MOTION_LAYOUT_TEST_VALIDATION_DIR)
    : path.join(repositoryDir, ".cache", "validation", "motion-visibility-sound", "2026-10-30", "renderer-layout", runId);
  const tempRoot = process.env.MOTION_LAYOUT_TEST_TMP_DIR
    ? path.resolve(process.env.MOTION_LAYOUT_TEST_TMP_DIR)
    : path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "renderer-layout", runId);
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
  const drawModule = path.join(validationRoot, "layout-probe.draw.js");
  await fs.writeFile(drawModule, `
window.MOTION_RENDERERS = { "custom:layout-probe": (ctx, object, time, scene) => {
  const mode = object.data.mode;
  const frame = Math.round(time * scene.fps);
  ctx.save();
  if (mode !== "empty" && !(mode === "mixed" && frame === 2)) {
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f5f2e9";
    ctx.fillRect(10, 10, 30, 15);
    ctx.fillStyle = "#18202a";
    ctx.fillText("Label", 12, 20);
    if (!(mode === "mixed" && frame === 3)) {
      const photoX = mode === "mixed" && frame === 7 ? 60 : 20;
      ctx.fillStyle = "#e07835";
      ctx.fillRect(photoX, 10, 20, 15);
    }
    if (mode === "allowed" || (mode === "mixed" && frame !== 2 && frame !== 3 && frame !== 4 && frame !== 5 && frame !== 6 && frame !== 7)) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(10, 22, 10, 6);
    }
  }
  ctx.restore();
} };
window.MOTION_EVIDENCE = {
  layoutFrame(time, scene, canvas, MotionOps) {
    if (!this.defaultTextMeasurement) {
      const result = MotionOps.measureTextOccupancy(canvas.getContext("2d"), "普通文字", { font: "16px sans-serif" });
      this.defaultTextMeasurement = { direction: result.direction, kind: result.measurement.kind };
    }
    const mode = scene.objects[0].data.mode;
    const viewport = { x: 0, y: 0, width: canvas.width, height: canvas.height };
    if (mode === "missing") return null;
    const allowed = [["label", "shadow"]];
    const boxes = [
      { id: "label", role: "text", box: { x: 10, y: 10, width: 30, height: 15 } },
      { id: "photo", role: "image", box: { x: 20, y: 10, width: 20, height: 15 } },
      { id: "shadow", role: "decoration", box: { x: 10, y: 22, width: 10, height: 6 } },
    ];
    if (mode === "allowed") return MotionOps.diagnoseLayout({ timeSec: time, scope: "allowed-pair", viewport, expectedIds: ["label", "shadow"], items: [boxes[0], boxes[2]], allowOverlaps: allowed });
    if (mode === "invalid") return MotionOps.diagnoseLayout({ timeSec: time + 1, scope: "invalid", viewport, expectedIds: ["label"], items: [boxes[0]] });
    if (mode === "empty") return MotionOps.diagnoseLayout({ timeSec: time, scope: "empty", viewport, expectedIds: [], items: [] });
    const frame = Math.round(time * scene.fps);
    if (frame === 2) return MotionOps.diagnoseLayout({ timeSec: time, scope: "mixed", viewport, expectedIds: [], items: [] });
    if (frame === 3) return MotionOps.diagnoseLayout({ timeSec: time, scope: "mixed", viewport, expectedIds: ["label", "photo"], items: [boxes[0]] });
    if (frame === 4) return null;
    if (frame === 5) return MotionOps.diagnoseLayout({ timeSec: time + 0.1, scope: "mixed", viewport, expectedIds: ["label"], items: [boxes[0]] });
    if (frame === 6) return { schema: "motion-layout-snapshot/v1", timeSec: time, scope: "mixed", viewport, items: "malformed" };
    const finalFrame = frame === 7;
    return MotionOps.diagnoseLayout({
      timeSec: time, scope: "mixed", viewport,
      expectedIds: finalFrame ? ["label", "photo"] : ["label", "photo", "shadow"],
      items: finalFrame ? [boxes[0], { ...boxes[1], box: { x: 60, y: 10, width: 20, height: 15 } }] : boxes,
      allowOverlaps: allowed,
    });
  },
};
`);

  const render = async (name, mode, durationSec) => {
    const scenePath = path.join(validationRoot, `${name}.scene.json`);
    const outputPath = path.join(validationRoot, `${name}.mp4`);
    const scene = {
      version: 1, width: 96, height: 64, fps: 5, duration: durationSec, background: "#101820",
      layers: [], variables: {}, events: [], bindings: [],
      objects: [{ id: "layout-probe", type: "custom:layout-probe", data: { mode } }],
    };
    await fs.writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
    const result = spawnSync(process.execPath, [
      path.join(skillDir, "scripts", "render.mjs"), "--scene", scenePath, "--output", outputPath,
      "--cache-dir", path.join(tempRoot, `${name}-cache`), "--browser", integrationBrowser,
      "--ffmpeg", integrationFfmpeg, "--draw-module", drawModule, "--overwrite",
    ], {
      encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_PATH: process.env.NODE_PATH || "",
        TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot,
      },
    });
    assert.equal(result.status, 0, `render.mjs failed for ${name}\n${result.stdout}\n${result.stderr}`);
    const manifestPath = result.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
    assert.ok(manifestPath, `render.mjs did not report a manifest for ${name}: ${result.stdout}`);
    await fs.copyFile(manifestPath, path.join(validationRoot, `${name}.manifest.json`));
    return JSON.parse(await fs.readFile(manifestPath, "utf8"));
  };

  const allowed = await render("allowed-overlap", "allowed", 0.4);
  assert.equal(allowed.layoutDiagnostics.status, "scoped");
  assert.equal(allowed.layoutDiagnostics.conflictPairCount, 0, "the explicit decorative overlap survives snapshot serialization and renderer re-diagnosis");
  assert.equal(allowed.layoutDiagnostics.coverage.encodedFrames.validFrames, 2);
  assert.ok(allowed.consumerEvidence.defaultTextMeasurement.direction === "ltr" || allowed.consumerEvidence.defaultTextMeasurement.direction === "rtl");
  assert.equal(allowed.consumerEvidence.defaultTextMeasurement.kind, "canvas-actual-bounds");

  const mixed = await render("mixed-evidence", "mixed", 1.6);
  const layout = mixed.layoutDiagnostics;
  assert.equal(layout.status, "partial", "a clean last frame cannot conceal earlier collision or incomplete evidence");
  assert.equal(layout.coverage.completeForDeclaredScopes, false);
  assert.deepEqual(layout.coverage.encodedFrames, {
    expectedFrames: 8, validFrames: 4, notCheckedFrames: 1, missingFrames: 1,
    staleFrames: 1, malformedFrames: 1, partialProducerFrames: 1, framesWithoutExpectedIds: 0,
  });
  const collision = layout.conflicts.find((entry) => entry.ids.join("/") === "label/photo");
  assert.ok(collision, "the actual text/photo collision remains a conflict");
  assert.equal(collision.occurrences, 2);
  assert.equal(collision.first.frameIndex, 0);
  assert.equal(collision.last.frameIndex, 1);
  assert.equal(collision.first.kind, "encoded-frame");
  assert.equal(collision.last.kind, "encoded-frame", "the preview at t=0 cannot overwrite the last encoded-frame record");
  assert.equal(layout.conflictOccurrences, 2, "a preview at a frame time cannot double-count encoded collisions");
  assert.equal(layout.previewConflictOccurrences, 1, "the preview collision is retained separately from its frame-zero encoded duplicate");
  assert.equal(layout.conflictPairCount, 1, "the declared text/shadow decoration overlap is excluded from conflicts");
  assert.equal(mixed.consumerEvidence.defaultTextMeasurement.kind, "canvas-actual-bounds");

  const invalid = await render("all-invalid", "invalid", 0.4);
  assert.equal(invalid.layoutDiagnostics.status, "invalid-evidence", "all-stale snapshots are distinguished from no producer snapshots");
  assert.equal(invalid.layoutDiagnostics.coverage.encodedFrames.staleFrames, 2);
  assert.equal(invalid.layoutDiagnostics.coverage.encodedFrames.validFrames, 0);

  const empty = await render("all-empty", "empty", 0.4);
  assert.equal(empty.layoutDiagnostics.status, "not-checked", "all-empty encoded snapshots keep not-checked semantics");
  assert.equal(empty.layoutDiagnostics.coverage.encodedFrames.validFrames, 0);
  assert.equal(empty.layoutDiagnostics.coverage.encodedFrames.notCheckedFrames, 2);
  assert.equal(empty.layoutDiagnostics.coverage.completeForDeclaredScopes, false);

  const missing = await render("all-missing", "missing", 0.4);
  assert.equal(missing.layoutDiagnostics.status, "not-checked", "all-missing snapshots are not treated as malformed evidence");
  assert.equal(missing.layoutDiagnostics.coverage.encodedFrames.missingFrames, 2);
  assert.equal(missing.layoutDiagnostics.coverage.encodedFrames.notCheckedFrames, 0);
});

test("shared scene event IDs resolve exact seconds, local speed maps to film, and hit sample starts early", () => {
  const scene = { fps: 30, timeBasis: "film-global", objects: [{ id: "film", data: { audioEvents: [{ id: "impact-a", time: 2.2 }] } }] };
  const events = findSceneAudioEvents(scene);
  assert.equal(events.get("impact-a").timeSec, 2.2);
  assert.equal(events.get("impact-a").timeBasis, "film-global");
  assert.equal(mapLocalTimeToFilm(2.2, { localStartSec: 1, localEndSec: 3, filmStartSec: 10, speed: 2 }), 10.6);
  assert.equal(secondsToSamples(1), 48000);
  const clip = clipForEvent({ cue: { id: "cue", sourceInSec: 0.05, hitTimeSec: 0.2, speed: 1.5 }, filmTimeSec: 5 }, { durationSec: 1 });
  assert.equal(clip.startFilmSec, 4.9);
});

test("shared event clocks reject unknown basis and require a map for scene-local events", () => {
  const plan = {
    durationSec: 8,
    events: [{ id: "cue", eventId: "event", assetId: "sound", bus: "sfx" }],
  };
  const localEvent = { id: "event", time: 1 };
  assert.throws(() => mapSceneEvents(plan, { audioEvents: [localEvent] }, new Map()), /unknown time basis/);
  assert.throws(() => mapSceneEvents(plan, { timeBasis: "scene-local", audioEvents: [localEvent] }, new Map()), /requires timeMapId/);
  const withMap = mapSceneEvents({
    ...plan,
    events: [{ ...plan.events[0], timeMapId: "local-to-film" }],
  }, { duration: 2, timeBasis: "scene-local", audioEvents: [localEvent] }, new Map([
    ["local-to-film", { id: "local-to-film", localStartSec: 0, localEndSec: 2, filmStartSec: 3, speed: 2 }],
  ]));
  assert.equal(withMap[0].filmTimeSec, 3.5);
  const explicitGlobal = mapSceneEvents(plan, { audioEvents: [{ id: "event", filmTimeSec: 2 }] }, new Map());
  assert.equal(explicitGlobal[0].filmTimeSec, 2, "filmTimeSec declares its own film-global clock");
  const globalOverridesSceneDefault = mapSceneEvents(plan, {
    timeBasis: "scene-local",
    audioEvents: [{ id: "event", filmTimeSec: 2 }],
  }, new Map());
  assert.equal(globalOverridesSceneDefault[0].filmTimeSec, 2, "an explicit filmTimeSec is global even inside a scene-local owner");
  assert.throws(() => findSceneAudioEvents({
    timeBasis: "film-global",
    audioEvents: [{ id: "event", filmTimeSec: 2, timeBasis: "scene-local" }],
  }), /conflicting filmTimeSec and timeBasis/);
  assert.throws(() => mapSceneEvents({ ...plan, events: [{ ...plan.events[0], timeMapId: "local-to-film" }] }, {
    timeBasis: "film-global", audioEvents: [localEvent],
  }, new Map([["local-to-film", { localStartSec: 0, filmStartSec: 0, speed: 1 }]])), /cannot apply a local timeMapId/);
});

test("asset review and sync rights are an allowlist; candidate preview cannot bypass rejected or unknown states", () => {
  const asset = (reviewStatus, redistribution = { status: "redistributable", basis: "reviewed license record" }, kind = "indexed") => ({
    id: "asset",
    kind,
    license: "CC0-1.0",
    redistribution,
    reviewStatus,
  });
  assert.throws(() => validateAssetUse(asset("candidate-unreviewed"), false), /--allow-candidate/);
  assert.doesNotThrow(() => validateAssetUse(asset("candidate-unreviewed"), true));
  assert.throws(() => validateAssetUse(asset("blocked"), true), /not allowed/);
  assert.throws(() => validateAssetUse(asset("unknown"), true), /not allowed/);
  assert.throws(() => validateAssetUse(asset("rejected"), true), /not allowed/);
  assert.throws(() => validateAssetUse(asset("generated-unreviewed"), false), /not allowed/);
  assert.doesNotThrow(() => validateAssetUse(asset("ready"), false));
  assert.throws(() => validateAssetUse(asset("generated-unreviewed", { status: "project-generated", basis: "local recipe" }, "generated"), false), /--allow-generated-preview/);
  assert.doesNotThrow(() => validateAssetUse(asset("generated-unreviewed", { status: "project-generated", basis: "local recipe" }, "generated"), false, true));
  assert.throws(() => validateAssetUse(asset("generated-unreviewed", { status: "project-generated", basis: "project-owned generated WAV" }, "project"), false), /--allow-generated-preview/);
  assert.doesNotThrow(() => validateAssetUse(asset("generated-unreviewed", { status: "project-generated", basis: "project-owned generated WAV" }, "project"), false, true));
  assert.throws(() => validateAssetUse(asset("generated-unreviewed", { status: "project-generated", basis: "unverified indexed source" }, "indexed"), false), /not allowed/);
  assert.doesNotThrow(() => validateAssetUse(asset("candidate-unreviewed", { status: "sync-only", basis: "license permits synchronization only" }), true));
  assert.doesNotThrow(() => validateAssetUse(asset("ready", {
    status: "not-authorized-for-redistribution",
    syncUse: "allowed",
    basis: "license permits embedding in a finished film, but forbids source redistribution",
  }), false));
  assert.throws(() => validateAssetUse(asset("ready", {
    status: "not-authorized-for-redistribution",
    basis: "source distribution is not permitted; sync permission not assessed",
  }), false), /explicit redistribution.syncUse=allowed/);
  assert.throws(() => validateAssetUse(asset("ready", {
    status: "redistributable",
    syncUse: "prohibited",
    basis: "conflicting license notes",
  }), false), /conflicting/);
  const generatedPlan = (reviewStatus) => ({
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 0.25,
    sampleRate: 48000, channels: 2, events: [], tracks: [],
    generatedAssets: [{
      id: "generated", generator: "ffmpeg-lavfi",
      ...(reviewStatus === undefined ? {} : { reviewStatus }),
      recipe: { kind: "tone", durationSec: 0.25, frequencyHz: 440 },
    }],
  });
  assert.doesNotThrow(() => validatePlan(generatedPlan(undefined)));
  assert.doesNotThrow(() => validatePlan(generatedPlan("generated-unreviewed")));
  for (const reviewStatus of ["ready", "candidate-unreviewed", "blocked", "unknown", ""]) {
    assert.throws(
      () => validatePlan(generatedPlan(reviewStatus)),
      /reviewStatus must be generated-unreviewed/,
      `recipe-generated audio cannot claim reviewStatus=${JSON.stringify(reviewStatus)}`,
    );
  }
});

test("audio plan rejects unit mistakes, duplicate cues, and locked-track transformations", () => {
  const base = { schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 4, sampleRate: 48000, channels: 2 };
  for (const key of ["controlSource", "processing", "rooms"]) {
    assert.throws(() => validatePlan({ ...base, [key]: [] }), new RegExp(`plan\\.${key} is not supported by audio-plan/1`));
  }
  assert.doesNotThrow(() => validatePlan({ ...base, legacyExtension: { retained: true } }), "unrelated legacy root extensions stay compatible");
  assert.equal(validatePlan({ ...base, events: [], tracks: [] }).durationSec, 4);
  assert.throws(() => validatePlan({ ...base, timeUnit: "milliseconds" }), /timeUnit/);
  assert.throws(() => validatePlan({ ...base, events: [{ id: "x" }, { id: "x" }] }), /Duplicate cue event/);
  assert.throws(() => validatePlan({ ...base, tracks: [{ id: "voice", assetId: "v", bus: "voice", startSec: 0, locked: true, gainDb: -3 }] }), /locked track/);
  assert.throws(() => validatePlan({ ...base, tracks: [{ id: "music", assetId: "m", bus: "music", startSec: 0, loop: true }] }), /\.loop is not supported/);
  assert.doesNotThrow(() => validatePlan({ ...base, tracks: [{ id: "music", assetId: "m", bus: "music", startSec: 0, loop: false }] }));
  assert.throws(() => validatePlan({ ...base, tracks: [{ id: "music", assetId: "m", bus: "music", startSec: 0, playbackRate: 1.1 }] }), /playbackRate is not supported/);
  assert.throws(() => validatePlan({ ...base, ducking: { targetGainDb: -12, attackSec: 0.1, releaseSec: 0.2, curve: "ease" } }), /ducking\.curve is not implemented/);
  assert.doesNotThrow(() => validatePlan({
    ...base,
    ducking: { targetGainDb: -12, attackSec: 0.1, releaseSec: 0.2, preRollSec: 0.15, holdSec: 0.25 },
    voiceWindows: [{ id: "window", startSec: 1, endSec: 2 }],
  }));
});

test("mix graph keeps the film sample domain and applies voice-window ducking only to music", () => {
  const plan = {
    durationSec: 2,
    automation: [],
    ducking: { targetGainDb: -9, attackSec: 0.05, releaseSec: 0.2 },
    voiceWindows: [{ id: "vo-1", startSec: 0.5, endSec: 1 }],
  };
  const rows = [
    { item: { id: "music", bus: "music", gainDb: 0 }, clip: { sourceIn: 0, sourceOut: 2, speed: 1, startFilmSec: 0 }, bus: "music" },
    { item: { id: "voice", bus: "voice", gainDb: 0 }, clip: { sourceIn: 0, sourceOut: 2, speed: 1, startFilmSec: 0 }, bus: "voice" },
  ];
  const graph = buildAudioGraph(plan, rows);
  assert.ok(graph.filter.includes("adelay=delays=0S|0S"));
  assert.ok(graph.filter.includes("-9*if(lt(t,0.5)"));
  assert.match(graph.filter, /apad=whole_dur=2/);
  assert.doesNotMatch(graph.filter, /atrim=duration=/, "per-track trim must not use timestamps shifted by atempo/adelay");
  assert.equal(graph.busLabels.length, 2);
  const lockedGraph = buildAudioGraph(plan, [
    { item: { id: "locked-music", bus: "music", locked: true }, clip: { sourceIn: 0, sourceOut: 2, speed: 1, startFilmSec: 0.5 }, bus: "music" },
  ]);
  assert.ok(lockedGraph.filter.includes("adelay=delays=24000S|24000S"));
  assert.ok(!lockedGraph.filter.includes("volume="), "locked music keeps its scheduled waveform without ducking or automation");
  const protectedGraph = buildAudioGraph({
    ...plan,
    ducking: { targetGainDb: -9, attackSec: 0.05, releaseSec: 0.2, preRollSec: 0.2, holdSec: 0.3 },
  }, rows);
  assert.ok(protectedGraph.filter.includes("-9*if(lt(t,0.3),0"), "preRoll moves the duck attack ahead of the first word");
  assert.ok(protectedGraph.filter.includes("gt(t,1.3)"), "hold extends ducking through the short pause before release");
});

function readFloatWav(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let format = 0;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (name === "fmt ") {
      format = buffer.readUInt16LE(offset + 8);
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
    } else if (name === "data") {
      dataOffset = offset + 8;
      dataLength = size;
      break;
    }
    offset += 8 + size + (size & 1);
  }
  assert.equal(format, 3, "output is IEEE float PCM");
  assert.equal(sampleRate, 48000);
  assert.equal(channels, 2);
  function rms(startSec, endSec) {
    const first = Math.floor(startSec * sampleRate) * channels;
    const last = Math.floor(endSec * sampleRate) * channels;
    let sum = 0;
    let count = 0;
    for (let frame = first; frame < last && frame * 4 + 4 <= dataLength; frame += channels) {
      const sample = buffer.readFloatLE(dataOffset + frame * 4);
      sum += sample * sample;
      count += 1;
    }
    return Math.sqrt(sum / Math.max(1, count));
  }
  return { sampleRate, channels, durationSec: dataLength / (sampleRate * channels * 4), rms };
}

test("FFmpeg mix aligns ducking to film time after a nonzero track start", { skip: !integrationFfmpeg }, async () => {
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "ducking-"));
  try {
    const planFile = path.join(directory, "audio-plan.json");
    const output = path.join(directory, "mix.wav");
    const manifestFile = path.join(directory, "manifest.json");
    const plan = {
      schemaVersion: 1,
      timeUnit: "seconds",
      timeBasis: "film-global",
      durationSec: 3,
      sampleRate: 48000,
      channels: 2,
      events: [],
      tracks: [
        { id: "music-bed", assetId: "generated-music", bus: "music", startSec: 0.5 },
        { id: "voice-guide", assetId: "generated-voice", bus: "voice", startSec: 1, gainDb: 0 },
      ],
      voiceWindows: [{ id: "spoken-line", startSec: 1, endSec: 1.4 }],
      ducking: { targetGainDb: -18, attackSec: 0.05, releaseSec: 0.15 },
      generatedAssets: [
        { id: "generated-music", generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 3, frequencyHz: 220, gainDb: -12 } },
        { id: "generated-voice", generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 0.5, frequencyHz: 1300, gainDb: -36 } },
      ],
    };
    await fs.writeFile(planFile, JSON.stringify(plan));
    const manifest = await renderAudioPlan({
      plan: planFile,
      assetIndex: path.join(skillDir, "assets", "audio", "index.json"),
      output,
      manifest: manifestFile,
      cacheDir: path.join(directory, "cache"),
      ffmpeg: integrationFfmpeg,
      allowGeneratedPreview: true,
    });
    const wav = readFloatWav(await fs.readFile(output));
    assert.ok(Math.abs(wav.durationSec - 3) < 1 / 48000, "audio ends at the declared film duration");
    const before = wav.rms(0.65, 0.9);
    const during = wav.rms(1.12, 1.3);
    const after = wav.rms(1.9, 2.1);
    assert.ok(before > 0.05, "a nonzero-start music track is present before speech");
    assert.ok(during < before * 0.3, "music yields during the mapped voice window");
    assert.ok(after > during * 3, "music restores after the voice window release");
    assert.equal(manifest.audioStream, true);
    assert.equal(manifest.technicalPreview, true);
    assert.ok(manifest.reviewBoundary.includes("Technical preview only"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("FFmpeg duck pre-roll protects the first word and hold keeps a short speech gap ducked", { skip: !integrationFfmpeg }, async () => {
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "arrangement-sound", "audio-plan-tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "duck-preroll-hold-"));
  try {
    const planFile = path.join(directory, "audio-plan.json");
    const output = path.join(directory, "mix.wav");
    const plan = {
      schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 2.5,
      sampleRate: 48000, channels: 2, events: [],
      tracks: [
        { id: "music-bed", assetId: "music", bus: "music", startSec: 0 },
        { id: "voice-guide", assetId: "voice", bus: "voice", startSec: 1, gainDb: -72 },
      ],
      voiceWindows: [
        { id: "line-a", startSec: 1, endSec: 1.2 },
        { id: "line-b", startSec: 1.35, endSec: 1.6 },
      ],
      ducking: { targetGainDb: -18, attackSec: 0.05, releaseSec: 0.2, preRollSec: 0.15, holdSec: 0.2 },
      generatedAssets: [
        { id: "music", generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 2.5, frequencyHz: 220, gainDb: -12 } },
        { id: "voice", generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 1, frequencyHz: 1300, gainDb: -12 } },
      ],
    };
    await fs.writeFile(planFile, JSON.stringify(plan));
    await renderAudioPlan({
      plan: planFile,
      assetIndex: path.join(skillDir, "assets", "audio", "index.json"),
      output,
      manifest: path.join(directory, "manifest.json"),
      cacheDir: path.join(directory, "cache"),
      ffmpeg: integrationFfmpeg,
      allowGeneratedPreview: true,
    });
    const wav = readFloatWav(await fs.readFile(output));
    const before = wav.rms(0.6, 0.7);
    const protectedFirstWord = wav.rms(0.99, 1.05);
    const heldGap = wav.rms(1.25, 1.3);
    const afterRelease = wav.rms(2.1, 2.2);
    assert.ok(before > 0.05, "music is audible before pre-roll");
    assert.ok(protectedFirstWord < before * 0.2, "pre-roll reaches useful attenuation before the first word");
    assert.ok(heldGap < before * 0.2, "hold prevents a brief voice-window gap from lifting the music");
    assert.ok(afterRelease > before * 0.8, "music returns smoothly after hold and release");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("locked music keeps its sampled level through duck windows and automation", { skip: !integrationFfmpeg }, async () => {
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "locked-track-"));
  try {
    const planFile = path.join(directory, "audio-plan.json");
    const output = path.join(directory, "mix.wav");
    const plan = {
      schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3,
      sampleRate: 48000, channels: 2, events: [],
      tracks: [{ id: "locked-music", assetId: "locked-source", bus: "music", startSec: 0.5, locked: true }],
      voiceWindows: [{ id: "voice-window", startSec: 1, endSec: 1.5 }],
      ducking: { targetGainDb: -24, attackSec: 0, releaseSec: 0 },
      automation: [{ bus: "music", startSec: 0.8, endSec: 1.8, gainDb: -24 }],
      generatedAssets: [{ id: "locked-source", generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 3, frequencyHz: 330, gainDb: -18 } }],
    };
    await fs.writeFile(planFile, JSON.stringify(plan));
    const manifest = await renderAudioPlan({
      plan: planFile,
      assetIndex: path.join(skillDir, "assets", "audio", "index.json"),
      output,
      manifest: path.join(directory, "manifest.json"),
      cacheDir: path.join(directory, "cache"),
      ffmpeg: integrationFfmpeg,
      allowGeneratedPreview: true,
    });
    const wav = readFloatWav(await fs.readFile(output));
    const before = wav.rms(0.65, 0.8);
    const during = wav.rms(1.1, 1.3);
    const after = wav.rms(2, 2.2);
    assert.ok(before > 0.05, "locked track starts at the declared film time");
    assert.ok(Math.abs(during - before) < before * 0.03, "voice-window ducking and music automation do not alter locked audio");
    assert.ok(Math.abs(after - before) < before * 0.03, "locked audio remains at its sampled level after automation windows");
    assert.equal(manifest.tracks[0].locked, true);
    assert.equal(manifest.tracks[0].duckingOrAutomationSuppressed, true);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("renderer gates blueprint-required layout evidence and compares declared critical text pixels", { skip: !integrationFfmpeg || !integrationBrowserAvailable || !integrationPlaywrightAvailable }, async () => {
  const runId = String(process.pid);
  const validationRoot = path.join(repositoryDir, ".cache", "validation", "motion-visibility-sound", "2026-10-30", "strict-and-pixels", runId);
  const tempRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "strict-and-pixels", runId);
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
  const drawModule = path.join(validationRoot, "visibility-and-layout-probe.draw.js");
  await fs.writeFile(drawModule, `
const FONT = "bold 32px sans-serif";
function textPose(time) { return time < 0.15 ? { x: 20, y: 12 } : time < 0.35 ? { x: 20, y: 62 } : { x: 20, y: 76 }; }
function paintTarget(ctx, time, masked) {
  const pose = textPose(time);
  ctx.save();
  if (masked && time >= 0.35) { ctx.beginPath(); ctx.rect(pose.x, pose.y - 36, 20, 44); ctx.clip(); }
  ctx.font = FONT; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.fillStyle = "#ffffff";
  ctx.fillText("目标", pose.x, pose.y); ctx.restore(); return pose;
}
window.MOTION_RENDERERS = {
  "custom:caption": (ctx, object, time) => paintTarget(ctx, time, true),
  "custom:panel": (ctx, object, time) => { if (time >= 0.15 && time < 0.35) { ctx.fillStyle = "#ee6b32"; ctx.fillRect(38, 38, 52, 42); } },
  "custom:blank": () => {},
};
window.MOTION_EVIDENCE = {
  layoutFrame(time, scene, canvas, MotionOps) {
    const viewport = { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const mode = scene.objects[0].data.mode;
    if (mode === "mixed" && time < 0.1) return null;
    if (mode === "mixed" && time < 0.3) return MotionOps.diagnoseLayout({ timeSec: time - 1, scope: "caption-scope", viewport, expectedIds: ["caption"], items: [{ id: "caption", role: "text", box: { x: 20, y: 0, width: 64, height: 40 } }] });
    if (mode === "mixed" && time < 0.5) return { schema: "motion-layout-snapshot/v1", timeSec: time, scope: "caption-scope", viewport, items: {} };
    if (mode === "mixed" && time < 0.7) return MotionOps.diagnoseLayout({ timeSec: time, scope: "caption-scope", viewport, expectedIds: ["caption"], items: [] });
    if (mode === "mixed") return MotionOps.diagnoseLayout({ timeSec: time, scope: "caption-scope", viewport, expectedIds: ["producer-registered-wrong-id"], items: [{ id: "caption", role: "text", box: { x: 20, y: 0, width: 64, height: 40 } }] });
    if (mode === "empty") return MotionOps.diagnoseLayout({ timeSec: time, scope: "intentional-blank", viewport, expectedIds: [], items: [] });
    return MotionOps.diagnoseLayout({ timeSec: time, scope: "caption-scope", viewport, expectedIds: ["caption"], items: [{ id: "caption", role: "text", box: { x: 20, y: 0, width: 64, height: 40 } }] });
  },
  drawTextVisibilityVariant({ probe, variant, timeSec, scene, canvas, context, MotionCore, renderers }) {
    if (variant === "scene-without-target") {
      MotionCore.drawFrame(canvas, { ...scene, objects: scene.objects.filter((object) => object.id !== probe.targetId) }, timeSec, renderers, true);
    } else paintTarget(context, timeSec, false);
    const pose = textPose(timeSec);
    const sourceGlyphStatus = probe.id === "missing-source-glyph" ? "absent"
      : probe.id === "fallback-source-glyph" ? "font-fallback"
        : probe.id === "unsupported-source-glyph" ? "unsupported" : "present";
    return { status: "rendered", targetId: probe.targetId, text: probe.text, font: FONT,
      styleSignature: "fill=#ffffff;align=left;baseline=alphabetic",
      transformSignature: "translate=" + pose.x + "," + pose.y, blendMode: "source-over", sourceGlyphStatus };
  },
};
`);
  const baseScene = (mode, duration = 0.6) => ({
    version: 1, width: 128, height: 96, fps: 5, duration, background: "#101820", layers: [], variables: {}, events: [], bindings: [],
    objects: mode === "empty" ? [{ id: "blank", type: "custom:blank", data: { mode } }]
      : [{ id: "caption", type: "custom:caption", data: { mode } }, { id: "panel", type: "custom:panel", data: { mode } }],
  });
  const setMotionEvidence = (scene, value) => { scene.objects[0].data.motionEvidence = value; return scene; };
  const invoke = async (name, scene, options = [], modulePath = drawModule) => {
    const scenePath = path.join(validationRoot, `${name}.scene.json`), outputPath = path.join(validationRoot, `${name}.mp4`);
    await fs.writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
    const result = spawnSync(process.execPath, [path.join(skillDir, "scripts", "render.mjs"), "--scene", scenePath, "--output", outputPath,
      "--cache-dir", path.join(tempRoot, `${name}-cache`), "--browser", integrationBrowser, "--ffmpeg", integrationFfmpeg,
      "--draw-module", modulePath, "--overwrite", ...options], {
      encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, NODE_PATH: process.env.NODE_PATH || "", TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot },
    });
    return { result, outputPath };
  };

  const visibilityScene = baseScene("pixels");
  setMotionEvidence(visibilityScene, { textVisibilityProbes: [
    { id: "clipped-chinese", targetId: "caption", text: "目标", timeSec: 0, expected: "complete" },
    { id: "later-panel", targetId: "caption", text: "目标", timeSec: 0.2, expected: "complete" },
    { id: "masked-reveal", targetId: "caption", text: "目标", timeSec: 0.4, expected: "partial" },
    { id: "unsupported-blend", targetId: "caption", text: "目标", timeSec: 0.4, expected: "partial", blendMode: "multiply" },
    { id: "missing-source-glyph", targetId: "caption", text: "目标", timeSec: 0.4, expected: "complete" },
    { id: "fallback-source-glyph", targetId: "caption", text: "目标", timeSec: 0.4, expected: "complete" },
    { id: "unsupported-source-glyph", targetId: "caption", text: "目标", timeSec: 0.4, expected: "complete" },
  ] });
  const pixelRun = await invoke("pixel-visibility", visibilityScene, ["--check-text-visibility"]);
  assert.equal(pixelRun.result.status, 0, `pixel render failed\n${pixelRun.result.stderr}`);
  const pixelManifestPath = pixelRun.result.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
  const pixels = JSON.parse(await fs.readFile(pixelManifestPath, "utf8")).textVisibility;
  const byProbe = Object.fromEntries(pixels.probes.map((probe) => [probe.id, probe]));
  assert.equal(byProbe["clipped-chinese"].observed, "partial");
  assert.equal(byProbe["clipped-chinese"].matchesExpected, false);
  assert.ok(byProbe["clipped-chinese"].pixels.clippedPixels > 0);
  assert.equal(byProbe["later-panel"].observed, "partial");
  assert.ok(byProbe["later-panel"].pixels.missingPixels > 0);
  assert.equal(byProbe["masked-reveal"].observed, "partial");
  assert.equal(byProbe["masked-reveal"].matchesExpected, true);
  assert.equal(byProbe["masked-reveal"].deterministicRepeat, true);
  assert.equal(byProbe["unsupported-blend"].status, "not-checked");
  assert.equal(byProbe["missing-source-glyph"].status, "not-checked");
  assert.equal(byProbe["missing-source-glyph"].sourceGlyphStatus, "absent");
  assert.match(byProbe["missing-source-glyph"].reason, /reports no glyph/);
  assert.equal(byProbe["fallback-source-glyph"].status, "not-checked");
  assert.equal(byProbe["fallback-source-glyph"].sourceGlyphStatus, "font-fallback");
  assert.match(byProbe["fallback-source-glyph"].reason, /fallback font/);
  assert.equal(byProbe["unsupported-source-glyph"].status, "not-checked");
  assert.equal(byProbe["unsupported-source-glyph"].sourceGlyphStatus, "unsupported");
  assert.match(byProbe["unsupported-source-glyph"].reason, /cannot verify/);

  const sceneBlendScene = baseScene("pixels", 0.2);
  sceneBlendScene.layers = [{ id: "multiply-text", blendMode: "multiply" }];
  sceneBlendScene.objects[0].layer = "multiply-text";
  setMotionEvidence(sceneBlendScene, { textVisibilityProbes: [{ id: "layer-blend", targetId: "caption", text: "目标", timeSec: 0 }] });
  const sceneBlendRun = await invoke("unsupported-scene-blend", sceneBlendScene, ["--check-text-visibility"]);
  assert.equal(sceneBlendRun.result.status, 0, `unsupported scene blend remains a reportable not-checked probe\n${sceneBlendRun.result.stderr}`);
  const sceneBlendManifestPath = sceneBlendRun.result.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
  const sceneBlendProbe = JSON.parse(await fs.readFile(sceneBlendManifestPath, "utf8")).textVisibility.probes[0];
  assert.equal(sceneBlendProbe.status, "not-checked");
  assert.match(sceneBlendProbe.reason, /unsupported scene\/layer blend mode: multiply/);

  const undeclaredScene = baseScene("empty", 0.4);
  const undeclaredRun = await invoke("strict-without-blueprint-requirements", undeclaredScene, ["--require-layout-evidence"]);
  assert.notEqual(undeclaredRun.result.status, 0);
  assert.match(undeclaredRun.result.stderr, /requires non-empty/);
  await assert.rejects(fs.access(undeclaredRun.outputPath), /ENOENT/);

  const emptyScene = baseScene("empty", 0.4);
  setMotionEvidence(emptyScene, { layoutEvidenceRequirements: [{ id: "blank-window", scope: "intentional-blank", startSec: 0.11, endSec: 0.29,
    expectedIds: [], intentionallyEmpty: true, reason: "No labelled geometry is scheduled in this transition." }] });
  const emptyRun = await invoke("strict-empty", emptyScene, ["--require-layout-evidence"]);
  assert.equal(emptyRun.result.status, 0, `valid blank interval rejected\n${emptyRun.result.stderr}`);
  const emptyManifestPath = emptyRun.result.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
  const emptyManifest = JSON.parse(await fs.readFile(emptyManifestPath, "utf8"));
  assert.equal(emptyManifest.requiredLayoutEvidence.status, "complete");
  assert.equal(emptyManifest.layoutDiagnostics.status, "not-checked");
  assert.equal(emptyManifest.requiredLayoutEvidence.expectedFrames, 1, "half-open boundaries select the encoded timestamps inside the interval");
  assert.equal(emptyManifest.requiredLayoutEvidence.requirements[0].validFrames, 1);

  const mixedScene = baseScene("mixed", 1);
  setMotionEvidence(mixedScene, { layoutEvidenceRequirements: [{ id: "caption-read-window", scope: "caption-scope", startSec: 0, endSec: 1, expectedIds: ["caption"] }] });
  const mixedRun = await invoke("strict-mixed", mixedScene, ["--require-layout-evidence"]);
  assert.notEqual(mixedRun.result.status, 0);
  assert.match(mixedRun.result.stderr, /output was not committed/i);
  await assert.rejects(fs.access(mixedRun.outputPath), /ENOENT/);
  const reportPath = mixedRun.result.stderr.match(/Diagnostics: ([^\n]+)/)?.[1];
  assert.ok(reportPath, mixedRun.result.stderr);
  const strictReport = JSON.parse(await fs.readFile(reportPath, "utf8")).requiredLayoutEvidence;
  assert.equal(strictReport.status, "incomplete");
  assert.deepEqual({ ...strictReport.requirements[0], complete: undefined }, {
    id: "caption-read-window", scope: "caption-scope", expectedIds: ["caption"], intentionallyEmpty: false, reason: null,
    expectedFrames: 5, validFrames: 1, missingFrames: 1, staleFrames: 1, malformedFrames: 1, partialFrames: 1, complete: undefined,
  });

  const missingHookScene = baseScene("pixels", 0.2);
  missingHookScene.objects = [{ id: "caption", type: "custom:caption", data: { mode: "pixels" } }];
  setMotionEvidence(missingHookScene, { textVisibilityProbes: [{ id: "without-hook", targetId: "caption", text: "目标", timeSec: 0, expected: "complete" }] });
  const missingHookModule = path.join(validationRoot, "no-visibility-hook.draw.js");
  await fs.writeFile(missingHookModule, `window.MOTION_RENDERERS = { "custom:caption": (ctx) => { ctx.font = "bold 32px sans-serif"; ctx.fillStyle = "white"; ctx.fillText("目标", 20, 62); } }; window.MOTION_EVIDENCE = {};`);
  const missingHookRun = await invoke("without-hook", missingHookScene, ["--check-text-visibility"], missingHookModule);
  assert.equal(missingHookRun.result.status, 0, `missing hook should not block the legacy render\n${missingHookRun.result.stderr}`);
  const missingHookManifest = missingHookRun.result.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
  const missingHook = JSON.parse(await fs.readFile(missingHookManifest, "utf8")).textVisibility.probes[0];
  assert.equal(missingHook.status, "not-checked");
  assert.match(missingHook.reason, /unavailable/);

  const unstableScene = baseScene("unstable", 0.2);
  setMotionEvidence(unstableScene, { textVisibilityProbes: [{ id: "unstable-redraw", targetId: "caption", text: "目标", timeSec: 0, expected: "complete" }] });
  const unstableModule = path.join(validationRoot, "unstable-redraw.draw.js");
  await fs.writeFile(unstableModule, `
let targetDrawCount = 0;
window.MOTION_RENDERERS = {
  "custom:caption": (ctx) => {
    targetDrawCount += 1;
    ctx.font = "bold 32px sans-serif"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = targetDrawCount === 1 ? "#ff0000" : "#00ff00";
    ctx.fillText("目标", 20, 62);
  },
  "custom:panel": () => {},
};
window.MOTION_EVIDENCE = {
  drawTextVisibilityVariant({ probe, variant, timeSec, scene, canvas, context, MotionCore, renderers }) {
    if (variant === "scene-without-target") MotionCore.drawFrame(canvas, { ...scene, objects: scene.objects.filter((object) => object.id !== probe.targetId) }, timeSec, renderers, true);
    else { context.font = "bold 32px sans-serif"; context.textBaseline = "alphabetic"; context.fillStyle = "#ff0000"; context.fillText(probe.text, 20, 62); }
    return { status: "rendered", targetId: probe.targetId, text: probe.text, font: "bold 32px sans-serif",
      styleSignature: "fill=#ff0000 at original A; renderer is intentionally unstable", transformSignature: "translate=20,62", blendMode: "source-over", sourceGlyphStatus: "present" };
  },
};
`);
  const unstableRun = await invoke("unstable-redraw", unstableScene, ["--check-text-visibility"], unstableModule);
  assert.equal(unstableRun.result.status, 0, `unstable probe must remain a nonblocking diagnostic\n${unstableRun.result.stderr}`);
  const unstableManifestPath = unstableRun.result.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
  const unstableManifest = JSON.parse(await fs.readFile(unstableManifestPath, "utf8"));
  const unstableProbe = unstableManifest.textVisibility.probes[0];
  assert.equal(unstableProbe.status, "not-checked");
  assert.equal(unstableProbe.deterministicRepeat, false);
  const decodedFirstFrame = spawnSync(integrationFfmpeg, [
    "-hide_banner", "-loglevel", "error", "-i", unstableRun.outputPath, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
  ], { encoding: null, maxBuffer: 1024 * 1024 });
  assert.equal(decodedFirstFrame.status, 0, decodedFirstFrame.stderr && decodedFirstFrame.stderr.toString());
  assert.equal(decodedFirstFrame.stdout.length, 128 * 96 * 3);
  let originalRedPixels = 0, laterGreenPixels = 0;
  for (let index = 0; index < decodedFirstFrame.stdout.length; index += 3) {
    const red = decodedFirstFrame.stdout[index], green = decodedFirstFrame.stdout[index + 1], blue = decodedFirstFrame.stdout[index + 2];
    if (red > 100 && red > green * 1.5 && red > blue * 1.5) originalRedPixels += 1;
    if (green > 100 && green > red * 1.5 && green > blue * 1.5) laterGreenPixels += 1;
  }
  assert.ok(originalRedPixels > 80, `output retains its initially rendered A frame, got ${originalRedPixels} red pixels`);
  assert.ok(laterGreenPixels < 20, `a repeat redraw did not replace the saved A frame, got ${laterGreenPixels} green pixels`);
});

test("speed-2 music with a later voice bus preserves film start, duck window, and the full 8-second duration", { skip: !integrationFfmpeg }, async () => {
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "tempo-multibus-"));
  try {
    const planFile = path.join(directory, "audio-plan.json");
    const output = path.join(directory, "mix.wav");
    const manifestFile = path.join(directory, "manifest.json");
    const plan = {
      schemaVersion: 1,
      timeUnit: "seconds",
      timeBasis: "film-global",
      durationSec: 8,
      sampleRate: 48000,
      channels: 2,
      events: [],
      tracks: [
        { id: "music", assetId: "music", bus: "music", startSec: 2.5, speed: 2 },
        { id: "voice", assetId: "voice", bus: "voice", startSec: 3.5 },
      ],
      voiceWindows: [{ id: "spoken-line", startSec: 3.5, endSec: 4.3 }],
      ducking: { targetGainDb: -18, attackSec: 0.05, releaseSec: 0.15 },
      generatedAssets: [
        { id: "music", generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 8, frequencyHz: 220, gainDb: -18 } },
        { id: "voice", generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 1, frequencyHz: 1200, gainDb: -36 } },
      ],
    };
    await fs.writeFile(planFile, JSON.stringify(plan));
    const manifest = await renderAudioPlan({
      plan: planFile,
      assetIndex: path.join(skillDir, "assets", "audio", "index.json"),
      output,
      manifest: manifestFile,
      cacheDir: path.join(directory, "cache"),
      ffmpeg: integrationFfmpeg,
      allowGeneratedPreview: true,
    });
    const wav = readFloatWav(await fs.readFile(output));
    assert.ok(Math.abs(wav.durationSec - 8) < 1 / 48000, "tempo processing retains the declared film duration");
    assert.ok(wav.rms(1, 1.3) < 0.0001, "the nonzero-start track does not begin at film time zero");
    const beforeVoice = wav.rms(2.7, 3.1);
    const duringVoice = wav.rms(3.65, 3.9);
    const afterVoice = wav.rms(4.6, 4.9);
    assert.ok(beforeVoice > 0.05, "speed-2 music begins at its scheduled film time");
    assert.ok(duringVoice > 0.005 && duringVoice < beforeVoice * 0.5, "the later voice bus joins while music yields");
    assert.ok(afterVoice > beforeVoice * 0.75, "music restores after the mapped voice window");
    assert.ok(wav.rms(7, 7.4) < 0.0001, "the sped-up source ends at its actual mapped film time");
    assert.equal(manifest.durationSec, 8);
    assert.equal(manifest.tracks[0].startFilmSec, 2.5);
    assert.equal(manifest.tracks[0].speed, 2);
    assert.match(manifest.mix.filterGraph, /apad=whole_dur=8/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("moving one named phase moves rendered geometry and its generated cue together; font variants render and invalidate", { skip: !integrationFfmpeg || !integrationBrowserAvailable }, async () => {
  const runId = String(process.pid);
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "shared-phase", runId);
  const validationRoot = path.join(repositoryDir, ".cache", "validation", "motion-visibility-sound", "2026-10-30", "shared-phase", runId);
  await fs.mkdir(cacheRoot, { recursive: true });
  await fs.mkdir(validationRoot, { recursive: true });
  const drawModule = path.join(validationRoot, "phase-probe.draw.js");
  await fs.writeFile(drawModule, `
window.MOTION_RENDERERS = {};
let textBitmaps = null;
window.MOTION_READY = (async () => {
  const cache = window.MotionOps.createTextBitmapCache({ maxEntries: 8 });
  const style = { font: "700 18px sans-serif", fillStyle: "#ffffff", align: "center", padding: 2 };
  const initial = await cache.getVariants("Phase", style, 2);
  const alphaStats = (bitmap) => {
    const ctx = bitmap.canvas.getContext("2d");
    const rgba = ctx.getImageData(0, 0, bitmap.canvas.width, bitmap.canvas.height).data;
    let covered = 0;
    let partial = 0;
    for (let index = 3; index < rgba.length; index += 4) {
      if (rgba[index] > 0) covered += 1;
      if (rgba[index] > 0 && rgba[index] < 250) partial += 1;
    }
    return { covered, partial };
  };
  const clearStats = alphaStats(initial.clear);
  const softStats = alphaStats(initial.soft);
  cache.invalidate();
  textBitmaps = await cache.getVariants("Phase", style, 2);
  window.MOTION_EVIDENCE = {
    phaseConsumer: "MotionOps.sampleChannels receives the renderer's absolute film seconds",
    clearVariant: initial.clear.variant,
    softVariant: initial.soft.variant,
    softBlurPx: initial.soft.blurPx,
    clearCoveredPixels: clearStats.covered,
    softCoveredPixels: softStats.covered,
    clearPartialAlphaPixels: clearStats.partial,
    softPartialAlphaPixels: softStats.partial,
    fontCacheInvalidated: textBitmaps.clear !== initial.clear && textBitmaps.soft !== initial.soft,
    cacheEntriesAfterRebuild: cache.size,
  };
})();
window.MOTION_RENDERERS["custom:phase-probe"] = (ctx, object, filmTimeSec) => {
  const phase = object.data.phases.find((item) => item.id === "reveal");
  const { channels } = window.MotionOps.sampleChannels(filmTimeSec, phase);
  ctx.save();
  ctx.globalAlpha = channels.alpha.value;
  ctx.translate(channels.x.value, 32);
  ctx.scale(channels.scale.value, channels.scale.value);
  ctx.fillStyle = "#ff3b30";
  ctx.fillRect(-9, -9, 18, 18);
  if (textBitmaps) {
    const softMix = Math.max(0, Math.min(1, channels.blur.value / 6));
    ctx.globalAlpha = 0.9 * softMix;
    textBitmaps.soft.draw(ctx, 46, 57);
    ctx.globalAlpha = 0.9 * (1 - softMix);
    textBitmaps.clear.draw(ctx, 46, 57);
  }
  ctx.restore();
};
`);
  const basePhase = {
    id: "reveal",
    startSec: 0.2,
    durationSec: 0.2,
    timeBasis: "film-global",
    channels: {
      alpha: { from: 0, to: 1, durationSec: 0.12, curve: "linear" },
      x: { from: 14, to: 48, curve: "ease-in-out-cubic", anchor: { x: 46, y: 32 } },
      scale: { from: 0.72, to: 1, curve: "ease-out-cubic", anchor: { x: 46, y: 32 } },
      blur: { from: 6, to: 0, durationSec: 0.2, curve: "ease-out-cubic" },
    },
  };
  const sceneFor = (startSec) => ({
    version: 1, width: 96, height: 64, fps: 30, duration: 1.5, background: "#101820",
    layers: [], variables: {}, events: [], bindings: [],
    objects: [{
      id: "phase-probe", type: "custom:phase-probe", data: {
        timeBasis: "film-global",
        phases: [{ ...basePhase, startSec }],
        audioEvents: [{ id: "phase-hit", phaseId: "reveal", phaseOffsetSec: 0.04 }],
      },
    }],
  });
  const planFor = (name) => ({
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 1.5,
    sampleRate: 48000, channels: 2,
    events: [{ id: `${name}-cue`, eventId: "phase-hit", assetId: `${name}-tone`, bus: "sfx", gainDb: -6 }],
    tracks: [],
    generatedAssets: [{ id: `${name}-tone`, generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 0.18, frequencyHz: 880, gainDb: -12 } }],
  });
  const runRender = async (name, startSec) => {
    const scenePath = path.join(validationRoot, `${name}.scene.json`);
    const outputPath = path.join(validationRoot, `${name}.mp4`);
    const cachePath = path.join(cacheRoot, `${name}-render`);
    const scene = sceneFor(startSec);
    await fs.writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
    const result = spawnSync(process.execPath, [
      path.join(skillDir, "scripts", "render.mjs"), "--scene", scenePath, "--output", outputPath,
      "--cache-dir", cachePath, "--browser", integrationBrowser, "--ffmpeg", integrationFfmpeg,
      "--draw-module", drawModule, "--samples", "0.3,1.0", "--overwrite",
    ], {
      encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_PATH: process.env.NODE_PATH || path.resolve(path.dirname(process.execPath), "..", "node_modules"),
        TMPDIR: cacheRoot, TMP: cacheRoot, TEMP: cacheRoot,
      },
    });
    assert.equal(result.status, 0, `render.mjs failed for ${name}\n${result.stdout}\n${result.stderr}`);
    const manifestPath = result.stdout.trim().split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice(9);
    assert.ok(manifestPath, `render.mjs did not report a manifest for ${name}: ${result.stdout}`);
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    return { scene, scenePath, outputPath, manifest };
  };
  const runAudio = async (name, scene, plan) => {
    const scenePath = path.join(validationRoot, `${name}.audio.scene.json`);
    const planPath = path.join(validationRoot, `${name}.audio-plan.json`);
    const output = path.join(validationRoot, `${name}.wav`);
    const manifest = path.join(validationRoot, `${name}.audio-manifest.json`);
    const cacheDir = path.join(cacheRoot, `${name}-audio`);
    await fs.writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
    await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
    const result = await renderAudioPlan({
      plan: planPath, scene: scenePath, assetIndex: path.join(skillDir, "assets", "audio", "index.json"),
      output, manifest, cacheDir, ffmpeg: integrationFfmpeg, allowGeneratedPreview: true,
    });
    return { result, wav: readFloatWav(await fs.readFile(output)) };
  };
  const originalScene = sceneFor(0.2);
  const movedScene = sceneFor(0.9);
  const originalRender = await runRender("phase-original", 0.2);
  const movedRender = await runRender("phase-moved", 0.9);
  const originalAudio = await runAudio("phase-original", originalScene, planFor("phase-original"));
  const movedAudio = await runAudio("phase-moved", movedScene, planFor("phase-moved"));
  assert.equal(originalRender.manifest.readiness.motion, "resolved");
  assert.equal(originalRender.manifest.consumerEvidence.clearVariant, "clear");
  assert.equal(originalRender.manifest.consumerEvidence.softVariant, "soft");
  assert.ok(originalRender.manifest.consumerEvidence.softCoveredPixels > originalRender.manifest.consumerEvidence.clearCoveredPixels, "real Canvas2D blur spreads the soft cache beyond the clear glyph bounds");
  assert.ok(originalRender.manifest.consumerEvidence.softPartialAlphaPixels > originalRender.manifest.consumerEvidence.clearPartialAlphaPixels, "the soft version contains additional partial-alpha edge pixels");
  assert.equal(originalRender.manifest.consumerEvidence.fontCacheInvalidated, true);
  assert.ok(originalRender.manifest.consumerEvidence.cacheEntriesAfterRebuild <= 8);
  assert.ok(Math.abs(originalAudio.result.events[0].filmTimeSec - 0.24) < 1e-12);
  assert.ok(Math.abs(movedAudio.result.events[0].filmTimeSec - 0.94) < 1e-12);
  assert.equal(originalAudio.result.events[0].sharedPhaseId, "reveal");
  assert.ok(originalAudio.wav.rms(0.26, 0.34) > 0.05, "the original generated cue is audible at the phase-linked film time");
  assert.ok(originalAudio.wav.rms(0.96, 1.04) < 0.0001, "moving the phase removes the cue from its previous interval");
  assert.ok(movedAudio.wav.rms(0.26, 0.34) < 0.0001, "the moved phase no longer cues audio at the old time");
  assert.ok(movedAudio.wav.rms(0.96, 1.04) > 0.05, "the generated cue follows the moved phase in the WAV samples");

  const extractFrame = (videoPath, timeSec) => {
    const decoded = spawnSync(integrationFfmpeg, [
      "-hide_banner", "-loglevel", "error", "-ss", String(timeSec), "-i", videoPath,
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ], { encoding: null, maxBuffer: 1024 * 1024 });
    assert.equal(decoded.status, 0, decoded.stderr && decoded.stderr.toString());
    assert.equal(decoded.stdout.length, 96 * 64 * 3);
    return decoded.stdout;
  };
  const redPixels = (frame) => {
    let count = 0;
    for (let index = 0; index < frame.length; index += 3) {
      if (frame[index] > 120 && frame[index] > frame[index + 1] * 1.6 && frame[index] > frame[index + 2] * 1.4) count += 1;
    }
    return count;
  };
  const originalAtOldTime = redPixels(extractFrame(originalRender.outputPath, 0.3));
  const movedAtOldTime = redPixels(extractFrame(movedRender.outputPath, 0.3));
  const movedAtNewTime = redPixels(extractFrame(movedRender.outputPath, 1.0));
  assert.ok(originalAtOldTime > 100, `original phase must be visibly drawn at 0.3s, got ${originalAtOldTime} red pixels`);
  assert.ok(movedAtOldTime < 4, `moved phase must be absent at 0.3s, got ${movedAtOldTime} red pixels`);
  assert.ok(movedAtNewTime > 100, `moved phase must be visibly drawn at 1.0s, got ${movedAtNewTime} red pixels`);
});

test("generated recipe cache verifies its sidecar hash before reuse", { skip: !integrationFfmpeg }, async () => {
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "recipe-cache-integrity-"));
  try {
    const planFile = path.join(directory, "audio-plan.json");
    const plan = {
      schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 2,
      sampleRate: 48000, channels: 2, events: [],
      tracks: [{ id: "generated", assetId: "generated", bus: "music", startSec: 0 }],
      generatedAssets: [{ id: "generated", generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 2, frequencyHz: 220, gainDb: -12 } }],
    };
    await fs.writeFile(planFile, JSON.stringify(plan));
    const cacheDir = path.join(directory, "cache");
    const first = await renderAudioPlan({
      plan: planFile, assetIndex: path.join(skillDir, "assets", "audio", "index.json"),
      output: path.join(directory, "first.wav"), manifest: path.join(directory, "first.json"),
      cacheDir, ffmpeg: integrationFfmpeg,
      allowGeneratedPreview: true,
    });
    const used = first.usedAssets[0];
    const cacheFile = path.resolve(skillDir, used.file);
    const expectedHash = used.sha256;
    const tampered = path.join(directory, "tampered-880hz.wav");
    const generated = spawnSync(integrationFfmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=2:sample_rate=48000",
      "-ac", "2", "-c:a", "pcm_f32le", tampered,
    ], { encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);
    const tamperedBytes = await fs.readFile(tampered);
    assert.notEqual(require("node:crypto").createHash("sha256").update(tamperedBytes).digest("hex"), expectedHash);
    await fs.writeFile(cacheFile, tamperedBytes);
    const second = await renderAudioPlan({
      plan: planFile, assetIndex: path.join(skillDir, "assets", "audio", "index.json"),
      output: path.join(directory, "second.wav"), manifest: path.join(directory, "second.json"),
      cacheDir, ffmpeg: integrationFfmpeg,
      allowGeneratedPreview: true,
    });
    assert.equal(second.usedAssets[0].sha256, expectedHash, "a changed cache is regenerated from the hashed recipe");
    assert.equal(require("node:crypto").createHash("sha256").update(await fs.readFile(cacheFile)).digest("hex"), expectedHash);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("recipe review claims fail before writes while a registered reviewed project WAV stays usable", { skip: !integrationFfmpeg }, async () => {
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "generated-review-boundary-"));
  try {
    const assetIndex = path.join(skillDir, "assets", "audio", "index.json");
    const invalidPlanPath = path.join(directory, "ready-recipe-plan.json");
    const invalidPlan = {
      schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 0.25,
      sampleRate: 48000, channels: 2, events: [],
      tracks: [{ id: "generated-track", assetId: "generated-tone", bus: "music", startSec: 0 }],
      generatedAssets: [{
        id: "generated-tone", generator: "ffmpeg-lavfi", reviewStatus: "ready",
        recipe: { kind: "tone", durationSec: 0.25, frequencyHz: 440, gainDb: -24 },
      }],
    };
    await fs.writeFile(invalidPlanPath, JSON.stringify(invalidPlan));
    const invalidOutput = path.join(directory, "bypassed.wav");
    const invalidManifest = path.join(directory, "bypassed.json");
    const invalidCache = path.join(directory, "bypass-cache");
    await assert.rejects(renderAudioPlan({
      plan: invalidPlanPath, assetIndex, output: invalidOutput, manifest: invalidManifest,
      cacheDir: invalidCache, ffmpeg: integrationFfmpeg,
    }), /reviewStatus must be generated-unreviewed/);
    await assert.rejects(fs.access(invalidOutput));
    await assert.rejects(fs.access(invalidManifest));
    await assert.rejects(fs.access(invalidCache));

    // This fixture exercises the registered-file review route; its `ready`
    // record is test metadata and makes no claim that this test auditioned it.
    const reviewedWav = path.join(directory, "reviewed-tone.wav");
    const generated = spawnSync(integrationFfmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.25:sample_rate=48000",
      "-ac", "2", "-c:a", "pcm_f32le", reviewedWav,
    ], { encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);
    const reviewedBytes = await fs.readFile(reviewedWav);
    const reviewedHash = require("node:crypto").createHash("sha256").update(reviewedBytes).digest("hex");
    const reviewedPlan = {
      schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 0.25,
      sampleRate: 48000, channels: 2, events: [],
      tracks: [{ id: "reviewed-track", assetId: "reviewed-tone", bus: "music", startSec: 0 }],
      assets: [{
        id: "reviewed-tone", file: "reviewed-tone.wav", durationSec: 0.25, sha256: reviewedHash,
        license: "project-generated",
        redistribution: { status: "project-generated", basis: "registered project WAV; pre-reviewed record supplied by caller" },
        reviewStatus: "ready",
      }],
    };
    const reviewedPlanPath = path.join(directory, "reviewed-project-plan.json");
    const reviewedOutput = path.join(directory, "reviewed-mix.wav");
    const reviewedManifestPath = path.join(directory, "reviewed-manifest.json");
    await fs.writeFile(reviewedPlanPath, JSON.stringify(reviewedPlan));
    const manifest = await renderAudioPlan({
      plan: reviewedPlanPath, assetIndex, output: reviewedOutput, manifest: reviewedManifestPath,
      cacheDir: path.join(directory, "reviewed-cache"), ffmpeg: integrationFfmpeg,
    });
    assert.equal(manifest.technicalPreview, false, "only the registered review record makes this route ready");
    assert.equal(manifest.usedAssets[0].kind, "project");
    assert.equal(manifest.usedAssets[0].reviewStatus, "ready");
    assert.equal(manifest.usedAssets[0].sha256, reviewedHash);
    assert.equal(readFloatWav(await fs.readFile(reviewedOutput)).durationSec, 0.25);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("audio path preflight rejects aliases, input collisions, and caches covering inputs before writing", async () => {
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "audio-path-preflight-"));
  try {
    const planFile = path.join(directory, "plan.json");
    const originalPlan = Buffer.from(JSON.stringify({
      schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 1,
      sampleRate: 48000, channels: 2, events: [], tracks: [],
    }));
    await fs.writeFile(planFile, originalPlan);
    const alias = path.join(directory, "plan-alias.wav");
    await fs.symlink(planFile, alias);
    const assetIndex = path.join(skillDir, "assets", "audio", "index.json");
    const base = {
      plan: planFile,
      assetIndex,
      manifest: path.join(directory, "manifest.json"),
      cacheDir: path.join(directory, "cache"),
      ffmpeg: integrationFfmpeg || "ffmpeg",
      overwrite: true,
    };
    await assert.rejects(renderAudioPlan({ ...base, output: alias }), /collides with an input/);
    const collisionOutput = path.join(directory, "same.wav");
    await assert.rejects(renderAudioPlan({ ...base, output: collisionOutput, manifest: collisionOutput }), /Output paths collide/);
    await assert.rejects(renderAudioPlan({
      ...base, output: path.join(directory, "separate.wav"), video: planFile, finalOutput: planFile,
    }), /collides with an input/);
    await assert.rejects(renderAudioPlan({
      ...base, output: path.join(directory, "cache-covered.wav"), cacheDir: directory,
    }), /Cache directory would contain or replace an input\/output path/);
    assert.deepEqual(await fs.readFile(planFile), originalPlan, "all colliding input contents remain byte-for-byte intact");
    assert.equal(await fs.stat(collisionOutput).then(() => true, () => false), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("renderer refuses scene or custom draw-module aliases before loading a browser", async () => {
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "render-path-preflight-"));
  try {
    const scenePath = path.join(directory, "scene.mp4");
    const sceneBytes = Buffer.from(JSON.stringify({ version: 1, width: 1, height: 1, fps: 1, duration: 1, background: "transparent", layers: [], objects: [], events: [], bindings: [], variables: {} }));
    await fs.writeFile(scenePath, sceneBytes);
    const sceneCollision = spawnSync(process.execPath, [
      path.join(skillDir, "scripts", "render.mjs"), "--scene", scenePath, "--output", scenePath,
      "--cache-dir", path.join(directory, "cache"), "--overwrite",
    ], { encoding: "utf8" });
    assert.notEqual(sceneCollision.status, 0);
    assert.match(sceneCollision.stderr, /Output path collides with an input/);
    assert.deepEqual(await fs.readFile(scenePath), sceneBytes);

    const drawModule = path.join(directory, "draw.js");
    const drawBytes = Buffer.from("window.MOTION_RENDERERS = {};\n");
    await fs.writeFile(drawModule, drawBytes);
    const drawAlias = path.join(directory, "draw-output.mp4");
    await fs.symlink(drawModule, drawAlias);
    const drawCollision = spawnSync(process.execPath, [
      path.join(skillDir, "scripts", "render.mjs"), "--scene", scenePath, "--draw-module", drawModule,
      "--output", drawAlias, "--cache-dir", path.join(directory, "cache"), "--overwrite",
    ], { encoding: "utf8" });
    assert.notEqual(drawCollision.status, 0);
    assert.match(drawCollision.stderr, /Output path collides with an input/);
    assert.deepEqual(await fs.readFile(drawModule), drawBytes);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("audio mux refuses audio-bearing or short pictures and a shorter film-global scene before creating outputs", { skip: !integrationFfmpeg }, async () => {
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "duration-preflight-"));
  try {
    const ffprobe = path.join(path.dirname(integrationFfmpeg), "ffprobe");
    const video = path.join(directory, "picture-2s.mp4");
    const made = spawnSync(integrationFfmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=2",
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", video,
    ], { encoding: "utf8" });
    assert.equal(made.status, 0, made.stderr || made.stdout);
    const videoHash = require("node:crypto").createHash("sha256").update(await fs.readFile(video)).digest("hex");
    const planFile = path.join(directory, "plan-3s.json");
    const plan = {
      schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3,
      sampleRate: 48000, channels: 2, events: [], tracks: [],
    };
    await fs.writeFile(planFile, JSON.stringify(plan));
    await assert.rejects(renderAudioPlan({
      plan: planFile, assetIndex: path.join(skillDir, "assets", "audio", "index.json"),
      output: path.join(directory, "mix.wav"), manifest: path.join(directory, "mix.json"),
      cacheDir: path.join(directory, "cache"), video, finalOutput: path.join(directory, "final.mp4"), ffmpeg: integrationFfmpeg,
    }), /input video stream is shorter than plan.durationSec/);
    assert.equal(await fs.stat(path.join(directory, "mix.wav")).then(() => true, () => false), false);
    assert.equal(require("node:crypto").createHash("sha256").update(await fs.readFile(video)).digest("hex"), videoHash);

    const pictureWithAudio = path.join(directory, "picture-with-audio.mp4");
    const audioVideoMade = spawnSync(integrationFfmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2:sample_rate=48000",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", pictureWithAudio,
    ], { encoding: "utf8" });
    assert.equal(audioVideoMade.status, 0, audioVideoMade.stderr || audioVideoMade.stdout);
    const audioVideoHash = require("node:crypto").createHash("sha256").update(await fs.readFile(pictureWithAudio)).digest("hex");
    const twoSecondPlan = { ...plan, durationSec: 2 };
    const twoSecondPlanFile = path.join(directory, "plan-2s.json");
    await fs.writeFile(twoSecondPlanFile, JSON.stringify(twoSecondPlan));
    const refusedOutput = path.join(directory, "should-not-exist.wav");
    await assert.rejects(renderAudioPlan({
      plan: twoSecondPlanFile,
      assetIndex: path.join(skillDir, "assets", "audio", "index.json"),
      output: refusedOutput,
      manifest: path.join(directory, "should-not-exist.json"),
      cacheDir: path.join(directory, "audio-input-cache"),
      video: pictureWithAudio,
      finalOutput: path.join(directory, "should-not-exist.mp4"),
      ffmpeg: integrationFfmpeg,
    }), /must be picture-only/);
    assert.equal(await fs.stat(refusedOutput).then(() => true, () => false), false);
    assert.equal(require("node:crypto").createHash("sha256").update(await fs.readFile(pictureWithAudio)).digest("hex"), audioVideoHash);

    const sceneFile = path.join(directory, "scene-2s.json");
    await fs.writeFile(sceneFile, JSON.stringify({
      duration: 2, fps: 30, timeBasis: "film-global", audioEvents: [{ id: "event", time: 1 }],
    }));
    const eventPlanFile = path.join(directory, "event-plan.json");
    await fs.writeFile(eventPlanFile, JSON.stringify({
      ...plan,
      events: [{ id: "cue", eventId: "event", assetId: "missing-but-not-reached", bus: "sfx" }],
    }));
    await assert.rejects(renderAudioPlan({
      plan: eventPlanFile,
      assetIndex: path.join(skillDir, "assets", "audio", "index.json"),
      output: path.join(directory, "scene-mix.wav"), manifest: path.join(directory, "scene-mix.json"),
      cacheDir: path.join(directory, "scene-cache"), scene: sceneFile, ffmpeg: integrationFfmpeg,
    }), /film-global scene duration is shorter than the audio plan/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("real shared events reuse a candidate asset, trim both film boundaries, and mux silence without an audio stream", { skip: !integrationFfmpeg }, async () => {
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "tests");
  const validationRoot = path.join(repositoryDir, ".cache", "validation", "motion-visibility-sound", "2026-10-30", "engine-regression", String(process.pid));
  await fs.mkdir(cacheRoot, { recursive: true });
  await fs.mkdir(validationRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "asset-mux-"));
  try {
    const ffprobe = path.join(path.dirname(integrationFfmpeg), "ffprobe");
    const run = (command, args) => {
      const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    const workScenePath = path.join(repositoryDir, "works", "video", "AI发展史", "猫的学习", "cat-learning.scene.json");
    const scene = JSON.parse(await fs.readFile(workScenePath, "utf8"));
    const owner = scene.objects.find((object) => Array.isArray(object.data && object.data.audioEvents));
    assert.ok(owner, "the read-only sample work provides a real shared audio event source");
    owner.data.timeBasis = "film-global";
    owner.data.audioEvents.push({ id: "tail-boundary-test", time: 31.9, phase: "technical-boundary", stage: "settle", role: "engineering fixture only" });
    const sceneFile = path.join(directory, "scene-with-boundary-fixture.json");
    await fs.writeFile(sceneFile, JSON.stringify(scene));

    const indexFile = path.join(skillDir, "assets", "audio", "index.json");
    const index = JSON.parse(await fs.readFile(indexFile, "utf8"));
    const candidate = index.assets.find((asset) => asset.id === "kenney.rpg-book-flip-1");
    assert.ok(candidate && candidate.reviewStatus === "candidate-unreviewed");
    const plan = {
      schemaVersion: 1,
      timeUnit: "seconds",
      timeBasis: "film-global",
      durationSec: 32,
      sampleRate: 48000,
      channels: 2,
      events: [
        { id: "opening-cue", eventId: "title-impact", assetId: candidate.id, bus: "sfx", gainDb: -30 },
        { id: "tail-cue", eventId: "tail-boundary-test", assetId: candidate.id, bus: "sfx", gainDb: -30 },
      ],
      tracks: [
        { id: "music-bed", assetId: "generated-music", bus: "music", startSec: 0.5, gainDb: -18 },
        { id: "voice-guide", assetId: "generated-voice", bus: "voice", startSec: 1, gainDb: -36 },
      ],
      voiceWindows: [{ id: "voice-window", startSec: 1, endSec: 1.4 }],
      ducking: { targetGainDb: -18, attackSec: 0.05, releaseSec: 0.15 },
      generatedAssets: [
        { id: "generated-music", generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 32, frequencyHz: 220, gainDb: -18 } },
        { id: "generated-voice", generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 2, frequencyHz: 900, gainDb: -36 } },
      ],
    };
    const planFile = path.join(directory, "audio-plan.json");
    await fs.writeFile(planFile, JSON.stringify(plan));
    const candidateOutput = path.join(validationRoot, "candidate-preview.wav");
    const candidateManifestPath = path.join(validationRoot, "candidate-preview.manifest.json");
    await assert.rejects(renderAudioPlan({
      plan: planFile, scene: sceneFile, assetIndex: indexFile,
      output: path.join(directory, "formal.wav"), manifest: path.join(directory, "formal.json"),
      cacheDir: path.join(directory, "formal-cache"), ffmpeg: integrationFfmpeg,
    }), /candidate-unreviewed/);
    const candidateManifest = await renderAudioPlan({
      plan: planFile,
      scene: sceneFile,
      assetIndex: indexFile,
      output: candidateOutput,
      manifest: candidateManifestPath,
      cacheDir: path.join(directory, "cache"),
      ffmpeg: integrationFfmpeg,
      allowCandidate: true,
      allowGeneratedPreview: true,
    });
    const early = candidateManifest.events.find((event) => event.id === "opening-cue");
    const tail = candidateManifest.events.find((event) => event.id === "tail-cue");
    assert.equal(early.filmTimeSec, 0.18, "the cue follows the existing artwork's shared event time");
    assert.ok(early.startFilmSec < 0 && early.headTrimmed, "a hit point before the event is trimmed across the film head");
    assert.equal(tail.filmTimeSec, 31.9, "the boundary fixture still maps through a shared event ID");
    assert.ok(tail.tailTrimmed && tail.sourceOutSec < candidate.durationSec, "audio beyond the declared film end is trimmed");
    assert.equal(candidateManifest.usedAssets.find((asset) => asset.id === candidate.id).sha256, candidate.sha256);
    assert.equal(candidateManifest.usedAssets.find((asset) => asset.id === candidate.id).reviewStatus, "candidate-unreviewed");
    assert.ok(candidateManifest.reviewBoundary.includes("do not claim that anyone listened"));

    const videoFixture = path.join(directory, "picture-only.mp4");
    run(integrationFfmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=32", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoFixture]);
    const candidateFinal = path.join(validationRoot, "candidate-preview.mp4");
    const finalManifest = await renderAudioPlan({
      plan: planFile,
      scene: sceneFile,
      assetIndex: indexFile,
      output: candidateOutput,
      manifest: candidateManifestPath,
      cacheDir: path.join(directory, "cache"),
      ffmpeg: integrationFfmpeg,
      allowCandidate: true,
      allowGeneratedPreview: true,
      video: videoFixture,
      finalOutput: candidateFinal,
      overwrite: true,
    });
    assert.equal(finalManifest.mux.audioStream, true);
    assert.equal(finalManifest.mux.shortestUsed, false);
    const candidateProbe = JSON.parse(run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-show_entries", "stream=codec_type,duration", "-of", "json", candidateFinal]));
    assert.ok(candidateProbe.streams.some((stream) => stream.codec_type === "audio"), "the sound mix is present in the final container");
    assert.ok(Math.abs(Number(candidateProbe.format.duration) - 32) < 0.05, "the final container keeps the declared film length");

    const silentPlanFile = path.join(directory, "silent-plan.json");
    await fs.writeFile(silentPlanFile, JSON.stringify({
      schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 32,
      sampleRate: 48000, channels: 2, events: [], tracks: [],
    }));
    const silentWav = path.join(validationRoot, "silent-intermediate.wav");
    const silentManifest = await renderAudioPlan({
      plan: silentPlanFile,
      assetIndex: indexFile,
      output: silentWav,
      manifest: path.join(validationRoot, "silent.manifest.json"),
      cacheDir: path.join(directory, "silent-cache"),
      ffmpeg: integrationFfmpeg,
      video: videoFixture,
      finalOutput: path.join(validationRoot, "silent-no-audio.mp4"),
    });
    assert.equal(silentManifest.audioStream, false);
    assert.equal(silentManifest.mux.audioStream, false);
    const silentProbe = JSON.parse(run(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "json", silentManifest.mux.output]));
    assert.deepEqual(silentProbe.streams.map((stream) => stream.codec_type), ["video"], "explicit silence mux has no synthetic audio stream");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a plan hit-time override records its own method and does not inherit asset confidence", { skip: !integrationFfmpeg }, async () => {
  const cacheRoot = path.join(repositoryDir, ".cache", "tmp", "motion-visibility-sound", "2026-10-30", "tests");
  const validationRoot = path.join(repositoryDir, ".cache", "validation", "motion-visibility-sound", "2026-10-30", "hit-override-fix", String(process.pid));
  await fs.mkdir(cacheRoot, { recursive: true });
  await fs.mkdir(validationRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "hit-override-"));
  try {
    const indexFile = path.join(skillDir, "assets", "audio", "index.json");
    const index = JSON.parse(await fs.readFile(indexFile, "utf8"));
    const candidate = index.assets.find((asset) => asset.id === "kenney.interface-click-001");
    assert.ok(candidate && candidate.reviewStatus === "candidate-unreviewed");
    assert.ok(candidate.hitTimeMethod && candidate.hitTimeConfidence);

    const sceneFile = path.join(validationRoot, "scene.json");
    const planFile = path.join(validationRoot, "plan.json");
    const output = path.join(validationRoot, "mix.wav");
    const manifestFile = path.join(validationRoot, "manifest.json");
    await fs.writeFile(sceneFile, JSON.stringify({
      duration: 1,
      fps: 30,
      timeBasis: "film-global",
      audioEvents: [
        { id: "override-event", filmTimeSec: 0.25 },
        { id: "indexed-event", filmTimeSec: 0.65 },
      ],
    }));
    await fs.writeFile(planFile, JSON.stringify({
      schemaVersion: 1,
      timeUnit: "seconds",
      timeBasis: "film-global",
      durationSec: 1,
      sampleRate: 48000,
      channels: 2,
      events: [
        { id: "override-cue", eventId: "override-event", assetId: candidate.id, bus: "sfx", hitTimeSec: 0.01 },
        { id: "indexed-cue", eventId: "indexed-event", assetId: candidate.id, bus: "sfx" },
      ],
      tracks: [],
    }));
    const manifest = await renderAudioPlan({
      plan: planFile,
      scene: sceneFile,
      assetIndex: indexFile,
      output,
      manifest: manifestFile,
      cacheDir: path.join(directory, "cache"),
      ffmpeg: integrationFfmpeg,
      allowCandidate: true,
    });
    const overridden = manifest.events.find((event) => event.id === "override-cue");
    const indexed = manifest.events.find((event) => event.id === "indexed-cue");
    assert.equal(overridden.hitTimeSec, 0.01);
    assert.equal(overridden.hitTimeMethod, "plan-override");
    assert.equal(overridden.hitTimeConfidence, null, "a plan override does not inherit index confidence");
    assert.ok(Math.abs(overridden.startFilmSec - 0.24) < 1e-9, "the selected hit point still determines the rendered cue start");
    assert.equal(indexed.hitTimeSec, candidate.hitTimeSec);
    assert.equal(indexed.hitTimeMethod, candidate.hitTimeMethod, "without an override the index method is retained");
    assert.equal(indexed.hitTimeConfidence, candidate.hitTimeConfidence, "without an override the index confidence is retained");

    const wav = readFloatWav(await fs.readFile(output));
    assert.ok(Math.abs(wav.durationSec - 1) < 1 / 48000);
    assert.equal(wav.rms(0.2, 0.239), 0, "no event audio appears before the overridden film start");
    assert.ok(wav.rms(0.241, 0.249) > 1e-5, "the real candidate asset is audible at the overridden start, not only present in the file");
    assert.ok(wav.rms(0.648, 0.658) > 1e-5, "the unoverridden candidate cue still uses its indexed hit point");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

