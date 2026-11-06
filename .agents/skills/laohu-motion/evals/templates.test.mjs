import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const evalDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(evalDir, "..");
const repoRoot = path.resolve(skillDir, "../../..");
const cli = path.join(skillDir, "scripts", "templates.mjs");
const catalogPath = path.join(skillDir, "templates", "catalog.json");
const nodeRequire = createRequire(import.meta.url);
const MotionOps = nodeRequire(path.join(skillDir, "scripts", "motion-ops.js"));
const HuashuLocalEffects = nodeRequire(path.join(skillDir, "templates", "adapters", "huashu-effects.js"));

function invoke(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.timeout || 120_000,
    env: { ...process.env, ...(options.env || {}) },
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, payload])));
  return Buffer.concat([length, name, payload, checksum]);
}

function tinyPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.from([
    0, 220, 90, 70, 255, 220, 90, 70, 255,
    0, 220, 90, 70, 255, 220, 90, 70, 255,
  ]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function browserExecutable() {
  const configured = process.env.MOTION_TEMPLATE_TEST_BROWSER || process.env.MOTION_BROWSER || process.env.CHROME_PATH;
  if (configured) return configured;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { /* candidate is not installed */ }
  }
  for (const command of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
    const result = spawnSync("which", [command], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  return null;
}

function assertCliOk(result, label) {
  assert.equal(result.error, undefined, `${label}: ${result.error?.message || "process spawn failed"}`);
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

test("catalog routes only callable native clip entries and guards source requirements", async (t) => {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const list = invoke(["list", "--json"]);
  assertCliOk(list, "default list");
  const entries = JSON.parse(list.stdout);
  assert.equal(entries.length, 30, "the callable inventory includes existing native entries, pinned Shotcraft candidates, the local ListStackPress adaptation, and the local Motion operation");
  assert.equal(entries.filter((entry) => entry.itemType === "effect").length, 6);
  assert.ok(entries.filter((entry) => entry.itemType === "template").every((entry) => ["native-clip", "native-html-canvas-template", "native-om-template-source", "video-shotcraft-remotion"].includes(entry.renderer)));
  assert.ok(entries.filter((entry) => entry.itemType === "effect").every((entry) => ["custom:huashu-local-effects", "custom:huashu-local-target", "custom:laohu-motion-operation"].includes(entry.renderer)));
  assert.equal(entries.find((entry) => entry.id === "laohu-motion-follow-box")?.operationId, "laohu.motion-follow-box/1");
  const focusQuery = invoke(["list", "--type", "effect", "--intent", "focus", "--json"]);
  assertCliOk(focusQuery, "stable intent-tag query");
  assert.deepEqual(JSON.parse(focusQuery.stdout).map((entry) => entry.id).sort(), ["huashu-dg-circumscribe", "huashu-dg-indicate-frame-pulse"]);
  assert.equal(entries.find((entry) => entry.id === "huashu-y2-vox")?.availability, "available");
  for (const id of ["motion-code-video-showcase-big-card", "motion-code-video-showcase-segment"]) {
    const entry = entries.find((item) => item.id === id);
    assert.equal(entry?.sourceId, "motion-code-video-showcase");
    assert.equal(entry?.availability, "available");
    assert.equal(entry?.renderer, "native-html-canvas-template");
  }
  for (const id of ["huashu-motion-finance-chart", "huashu-motion-kinetic-type"]) {
    const entry = entries.find((item) => item.id === id);
    assert.equal(entry?.sourceId, "huashu-motion");
    assert.equal(entry?.availability, "conditional");
    assert.equal(entry?.renderer, "native-om-template-source");
    assert.equal(entry?.runtimeVerification, "native-om-cli-chrome-preview-render-ffprobe-verified");
    assert.ok(entry?.nativeInterface?.runtimeSource.includes("cli/om.js"));
  }

  const parameterAudit = new Map(catalog.templates.filter((entry) => entry.grammar).map((entry) => [entry.id, entry]));
  for (const id of ["huashu-t1-3b1b", "huashu-t3-finance-chart", "huashu-y3-whiteboard", "huashu-y4-storytime", "huashu-y5-kinetic-type"]) {
    const entry = parameterAudit.get(id);
    assert.ok(entry.sourceSchema.specData.includes("camera"), `${id} keeps the original schema declaration`);
    assert.ok(!entry.parameters.specData.includes("camera"), `${id} does not present camera as a consumed parameter`);
    assert.ok(!entry.trueParameterization.specData.includes("camera"), `${id} actual parameter view excludes camera`);
    assert.equal(entry.parameters.declaredOnlyIgnoredSpecData[0]?.path, "data.camera");
  }
  for (const id of ["huashu-t2-keynote-ui", "huashu-y1-kurzgesagt", "huashu-y2-vox"]) {
    assert.ok(parameterAudit.get(id).parameters.specData.includes("camera"), `${id} source actually consumes camera`);
  }
  for (const entry of parameterAudit.values()) {
    assert.match(entry.parameters.cueCommonScope, /shared runtime transport envelope/i);
    assert.match(entry.trueParameterization.cueFieldsScope, /not every field is an active visual control/i);
  }

  const sourceOnly = catalog.templates.find((entry) => entry.availability === "source-only");
  assert.ok(sourceOnly, "catalog must retain source-only rows");
  const blocked = invoke(["prepare", sourceOnly.id, "--input", "missing.json", "--output", "out.json"]);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /source-only|only supports catalog entries/i);

  const t3 = catalog.templates.find((entry) => entry.id === "huashu-t3-finance-chart");
  assert.ok(t3?.sourceSchema?.specNeeds?.includes("data.series"));
  assert.ok(t3.parameters.specData.includes("xAxis"), "t3 exposes its source-consumed xAxis field");
  assert.ok(t3.trueParameterization.specData.includes("xAxis"), "t3 actual parameter view exposes xAxis");
  for (const [id, expected] of [
    ["motiongit-385712-unit-a", "sc/wall2 frames"],
    ["motiongit-385712-unit-f", "preconfigured d* sequences"],
    ["motiongit-385712-unit-s11", "d596 preview frames"],
  ]) {
    assert.ok(catalog.templates.find((entry) => entry.id === id)?.assetNotes?.includes(expected), `${id} retains its source-specific media boundary`);
  }
  const cacheRoot = path.join(repoRoot, ".cache", "tmp");
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "laohu-motion-template-invalid-t3-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const t3Input = path.join(runRoot, "missing-series.json");
  await fs.writeFile(t3Input, `${JSON.stringify({ grammar: "t3_finance_chart", duration: 2, cues: [] })}\n`);
  const t3Result = invoke(["prepare", t3.id, "--input", t3Input, "--output", `${t3Input}.prepared.json`]);
  assert.notEqual(t3Result.status, 0);
  assert.match(t3Result.stderr, /non-empty data\.series/);

  const fractionalInput = path.join(runRoot, "fractional-frame-duration.json");
  await fs.writeFile(fractionalInput, `${JSON.stringify({ grammar: "t1_3b1b", duration: 2.01, fps: 30, cues: [] })}\n`);
  const fractionalResult = invoke(["prepare", "huashu-t1-3b1b", "--input", fractionalInput, "--output", `${fractionalInput}.prepared.json`]);
  assert.notEqual(fractionalResult.status, 0);
  assert.match(fractionalResult.stderr, /not a whole number.*frame-aligned duration/s);

  const alignedInput = path.join(runRoot, "aligned-frame-duration.json");
  await fs.writeFile(alignedInput, `${JSON.stringify({ grammar: "t1_3b1b", duration: 2, fps: 30, cues: [] })}\n`);
  const alignedResult = invoke(["prepare", "huashu-t1-3b1b", "--input", alignedInput, "--output", `${alignedInput}.prepared.json`]);
  assertCliOk(alignedResult, "frame-aligned duration prepare");
});

test("local-effect catalog, validator, and adapter expose one consumed parameter contract", async () => {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  assert.equal(catalog.schemaVersion, 2);
  const huashuEffects = catalog.effects.filter((effect) => !effect.operationId);
  assert.equal(huashuEffects.length, 5);
  assert.deepEqual(Object.keys(HuashuLocalEffects.DEFINITION).sort(), huashuEffects.map((effect) => effect.id).sort());
  for (const effect of huashuEffects) {
    assert.ok(effect.intents.length > 0 && effect.intents.every((tag) => /^[a-z0-9][a-z0-9-]*$/.test(tag)), `${effect.id} exposes stable exact-query intent tags`);
    const contract = MotionOps.localEffectContracts[effect.id];
    assert.ok(contract, `${effect.id} has a MotionOps contract`);
    const consumedParameters = effect.parameters.filter((parameter) => parameter.name.startsWith("parameters."))
      .map((parameter) => parameter.name.slice("parameters.".length)).sort();
    assert.deepEqual(consumedParameters, [...contract.parameters].sort(), `${effect.id} catalog fields match validator fields exactly`);
    const geometryNames = effect.parameters.filter((parameter) => parameter.name.startsWith("geometry.")).map((parameter) => parameter.name);
    const expectedGeometry = contract.geometry === "brace" ? ["geometry.x", "geometry.y0/y1"] : [`geometry.${contract.geometry}`];
    assert.deepEqual(geometryNames.sort(), expectedGeometry.sort(), `${effect.id} catalog geometry matches the validator`);
    assert.ok(effect.sourceFunctions.includes(HuashuLocalEffects.DEFINITION[effect.id].sourceFunction), `${effect.id} names the adapter's original source function`);
  }
  const pulse = catalog.effects.find((effect) => effect.id === "huashu-dg-indicate-frame-pulse");
  assert.ok(pulse.parameters.some((parameter) => parameter.name === "parameters.scale"));
  assert.ok(!catalog.effects.find((effect) => effect.id === "huashu-dg-circumscribe").parameters.some((parameter) => parameter.name === "parameters.scale"));

  const followBox = catalog.effects.find((effect) => effect.id === "laohu-motion-follow-box");
  assert.equal(followBox.operationId, "laohu.motion-follow-box/1");
  assert.equal(followBox.renderer, MotionOps.MOTION_OPERATION_RENDERER);
  assert.ok(followBox.parameters.some((parameter) => parameter.name === "nativeParameters.fromLineWidthPx"));
  assert.ok(followBox.parameters.some((parameter) => parameter.name === "nativeParameters.toLineWidthPx"));
  assert.ok(MotionOps.validateMotionOperations, "the operation is registered by the local Motion consumer");

  const sharedPhase = { id: "emphasis-window", startSec: 0.2, durationSec: 0.6, timeBasis: "scene-local", curve: "linear" };
  const validInstance = {
    id: "outline-instance",
    effectId: "huashu-dg-circumscribe",
    targetId: "named-target",
    phaseId: sharedPhase.id,
    geometry: { rect: { x: 20, y: 25, width: 40, height: 30 } },
    parameters: { color: "#ff0000", lineWidth: 3, timeWidth: 0.3 },
  };
  const scene = {
    duration: 1,
    objects: [
      { id: "named-target", type: "rect", space: "screen", x: 20, y: 25, width: 40, height: 30, fill: "#222222" },
      { id: "local-effects", type: "custom:huashu-local-effects", space: "screen", data: {
        phases: [sharedPhase],
        audioEvents: [{ id: "outline-sound", phaseId: sharedPhase.id, phaseOffsetSec: 0.1 }],
        motionEffects: [validInstance],
      } },
    ],
  };
  const [validated] = MotionOps.validateLocalEffects(scene);
  assert.equal(validated.phase, sharedPhase, "the visual effect consumes the shared phase record by identity");
  const audioEvent = MotionOps.findSceneAudioEvents(scene).get("outline-sound");
  assert.equal(audioEvent.phaseId, validated.phaseId);
  assert.ok(Math.abs(audioEvent.timeSec - 0.3) < 1e-12);
  assert.equal(audioEvent.timeBasis, "scene-local");

  const invalidScale = structuredClone(scene);
  invalidScale.objects[1].data.motionEffects[0].parameters.scale = 1.2;
  assert.throws(() => MotionOps.validateLocalEffects(invalidScale), /parameters\.scale is not consumed by huashu-dg-circumscribe/);
  const unboundTarget = structuredClone(scene);
  unboundTarget.objects[1].data.motionEffects[0].targetId = "missing-target";
  assert.throws(() => MotionOps.validateLocalEffects(unboundTarget), /does not identify a scene object/);

  const directTargetPhase = { id: "target-reveal", startSec: 0.2, endSec: 1, timeBasis: "scene-local" };
  const directTargetScene = {
    duration: 1,
    objects: [
      { id: "direct-target", type: "custom:huashu-local-target", space: "screen", data: {
        primitive: "rect", geometry: { x: 8, y: 12, width: 20, height: 16 }, fill: "#ff0000",
      } },
      { id: "local-effects", type: "custom:huashu-local-effects", space: "screen", data: {
        phases: [directTargetPhase],
        motionEffects: [{
          id: "direct-reveal", effectId: "huashu-mo-staggered-target-reveal", targetId: "direct-target", phaseId: directTargetPhase.id,
          geometry: { rect: { x: 8, y: 12, width: 20, height: 16 } }, parameters: {},
          stagger: { groupId: "one-target", index: 0, count: 1, ratio: 0.2 },
        }],
      } },
    ],
  };
  assert.equal(MotionOps.validateLocalEffects(directTargetScene)[0].effectId, "huashu-mo-staggered-target-reveal");
  const missingStagger = structuredClone(directTargetScene);
  delete missingStagger.objects[1].data.motionEffects[0].stagger;
  assert.throws(() => MotionOps.validateLocalEffects(missingStagger), /stagger is required/);
});

test("native y2 accepts authored text cues without image assets", async (t) => {
  const cacheRoot = path.join(repoRoot, ".cache", "tmp");
  await fs.mkdir(cacheRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(cacheRoot, "laohu-motion-template-text-only-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, "text", "scene.json");
  const prepared = path.join(root, "prepared-text", "scene.json");
  const spec = {
    grammar: "y2_vox",
    duration: 4,
    fps: 24,
    width: 640,
    height: 360,
    cues: [
      { at: 0.2, kind: "title", text: "知识讲解" },
      { at: 1.4, kind: "point", text: "判断与答案的差距会触发参数调整" },
    ],
  };
  await fs.mkdir(path.dirname(input), { recursive: true });
  // This test deliberately avoids an image requirement; all files stay in project cache.
  await fs.writeFile(input, `${JSON.stringify(spec, null, 2)}\n`);
  const result = invoke(["prepare", "huashu-y2-vox", "--input", input, "--output", prepared]);
  assertCliOk(result, "text-only y2 prepare");
});

test("explicit local Chrome uses stable software capture and preserves cross-directory image inputs", async (t) => {
  const browser = await browserExecutable();
  let playwrightAvailable = false;
  try { nodeRequire.resolve("playwright"); playwrightAvailable = true; } catch { /* live render needs local Playwright */ }
  if (!browser || !playwrightAvailable) {
    t.skip("requires a local Chrome/Chromium executable and an already-installed Playwright; no dependency is installed by this test");
    return;
  }

  const cacheRoot = path.join(repoRoot, ".cache", "tmp");
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "laohu-motion-template-live-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const sourceRoot = path.join(runRoot, "source");
  const assetsRoot = path.join(runRoot, "local-assets");
  const preparedRoot = path.join(runRoot, "prepared-elsewhere");
  const outputRoot = path.join(runRoot, "outputs");
  await Promise.all([sourceRoot, assetsRoot, preparedRoot, outputRoot].map((directory) => fs.mkdir(directory, { recursive: true })));

  const sourcePath = path.join(sourceRoot, "scene.json");
  const preparedPath = path.join(preparedRoot, "scene.json");
  const outputPath = path.join(outputRoot, "y2.png");
  const manifestPath = path.join(outputRoot, "y2.manifest.json");
  const browserCache = path.join(runRoot, "y2-browser-cache");
  await fs.writeFile(path.join(assetsRoot, "fixture.png"), tinyPng());
  const spec = {
    grammar: "y2_vox",
    duration: 4,
    fps: 24,
    width: 640,
    height: 360,
    cues: [
      { at: 0.2, kind: "title", text: "图像样本进入训练" },
      { at: 0.8, kind: "image", text: "本地样本", image: "fixture.png" },
      { at: 2.0, kind: "point", text: "模型给出判断" },
    ],
  };
  await fs.writeFile(sourcePath, `${JSON.stringify(spec, null, 2)}\n`);

  const prepared = invoke(["prepare", "huashu-y2-vox", "--input", sourcePath, "--output", preparedPath, "--assets-root", assetsRoot]);
  assertCliOk(prepared, "cross-directory image prepare");
  const receipt = JSON.parse(await fs.readFile(`${preparedPath}.assets.json`, "utf8"));
  assert.equal(receipt.assetsRoot, assetsRoot);
  assert.equal(receipt.assets[0].path, "fixture.png");

  const relativeTmp = ".cache/tmp/motion-template-relative-native-clip";
  const preview = invoke(["preview", "huashu-y2-vox", "--spec", preparedPath, "--output", outputPath, "--samples", "1.2,0.4,1.2", "--browser", browser, "--cache-dir", browserCache, "--manifest", manifestPath], {
    env: { TMPDIR: relativeTmp, TMP: relativeTmp, TEMP: relativeTmp },
  });
  assertCliOk(preview, "explicit-browser y2 preview");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.sourceRuntime.readiness.ready, true);
  assert.equal(manifest.sourceRuntime.browserExecutable, browser);
  assert.ok(path.isAbsolute(manifest.sourceRuntime.browserTempRoot));
  assert.ok(manifest.sourceRuntime.browserTempRoot.startsWith(`${browserCache}${path.sep}`), "native clip Playwright temp files must use the absolute selected project cache even when inherited TMPDIR is relative");
  assert.equal(manifest.sourceRuntime.capture.mode, "software-swiftshader");
  assert.equal(manifest.sourceRuntime.capture.frequentReadback, true);
  assert.ok(manifest.sourceRuntime.runtimePathsRequested.some((resource) => resource.startsWith("/input/fixture.png")));
  assert.deepEqual(manifest.sourceRuntime.missingRuntimeRequests, []);
  assert.deepEqual(manifest.console.errors, []);
  assert.deepEqual(manifest.network.blockedRequests, []);
  assert.equal(manifest.renderedFrames[0].pixelHash, manifest.renderedFrames[2].pixelHash);
  assert.deepEqual(manifest.renderedFrames[2].repeatComparison, {
    samePixelBytes: true,
    differentPixels: 0,
    differingChannels: 0,
    maxChannelDelta: 0,
  });

  const textOnlySpecs = [
    { grammar: "y2_vox", duration: 4, fps: 24, width: 640, height: 360, cues: [{ at: 0.2, kind: "title", text: "知识讲解" }, { at: 1.5, kind: "point", text: "对象状态变化" }] },
    { grammar: "y2_vox", duration: 4, fps: 24, width: 640, height: 360, cues: [{ at: 0.2, kind: "title", text: "机器怎样学习" }, { at: 1.5, kind: "point", text: "对象状态变化" }] },
  ];
  const textHashes = [];
  for (let index = 0; index < textOnlySpecs.length; index += 1) {
    const textInput = path.join(sourceRoot, `text-only-${index}.json`);
    const textPrepared = path.join(preparedRoot, `text-only-${index}.json`);
    const textOutput = path.join(outputRoot, `text-only-${index}.png`);
    const textManifest = path.join(outputRoot, `text-only-${index}.manifest.json`);
    await fs.writeFile(textInput, `${JSON.stringify(textOnlySpecs[index], null, 2)}\n`);
    const textPrepare = invoke(["prepare", "huashu-y2-vox", "--input", textInput, "--output", textPrepared]);
    assertCliOk(textPrepare, `text-only variant ${index} prepare`);
    const textPreview = invoke(["preview", "huashu-y2-vox", "--spec", textPrepared, "--output", textOutput, "--time", "1.2", "--browser", browser, "--manifest", textManifest]);
    assertCliOk(textPreview, `text-only variant ${index} preview`);
    const textEvidence = JSON.parse(await fs.readFile(textManifest, "utf8"));
    assert.deepEqual(textEvidence.console.errors, []);
    textHashes.push(textEvidence.renderedFrames[0].pixelHash);
  }
  assert.notEqual(textHashes[0], textHashes[1], "a source-consumed title change must alter the rendered pixels");
});

test("Moessif original HTML templates load local fonts, preserve source bytes, and consume their real controls", async (t) => {
  const browser = await browserExecutable();
  let playwrightAvailable = false;
  try { nodeRequire.resolve("playwright"); playwrightAvailable = true; } catch { /* live render needs local Playwright */ }
  if (!browser || !playwrightAvailable) {
    t.skip("requires a local Chrome/Chromium executable and an already-installed Playwright; no dependency is installed by this test");
    return;
  }
  const cacheRoot = path.join(repoRoot, ".cache", "tmp");
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "laohu-motion-showcase-live-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const inputRoot = path.join(runRoot, "input");
  const preparedRoot = path.join(runRoot, "prepared");
  const outputRoot = path.join(runRoot, "output");
  await Promise.all([inputRoot, preparedRoot, outputRoot].map((directory) => fs.mkdir(directory, { recursive: true })));
  const cases = [
    {
      id: "motion-code-video-showcase-big-card",
      spec: { templateId: "motion-code-video-showcase-big-card", duration: 1, fps: 30, width: 1920, height: 1080, parameters: { layout: 2, index: 2, total: 11, color: "#ffc857", first: "想做", keyword: "科普视频？", brand: "老胡造梦" } },
      changed: (parameters) => { parameters.keyword = "模型怎样学习？"; },
    },
    {
      id: "motion-code-video-showcase-segment",
      spec: { templateId: "motion-code-video-showcase-segment", duration: 1, fps: 30, width: 1920, height: 1080, parameters: { title: "一句话，讲清楚", subtitle: "先说重点，再给证据", brand: "老胡造梦", capsuleName: "示例风格", capsuleCategory: "分类", t0: 0.25, speed: 1.2, theme: "coral-noir" } },
      changed: (parameters) => { parameters.title = "</script><script>window.__injected=1</script>"; parameters.capsuleName = "学习路径"; parameters.capsuleCategory = "因果"; },
    },
  ];
  for (const item of cases) {
    const rows = [];
    for (const variant of ["base", "changed"]) {
      const spec = structuredClone(item.spec);
      if (variant === "changed") item.changed(spec.parameters);
      const input = path.join(inputRoot, `${item.id}-${variant}.json`);
      const prepared = path.join(preparedRoot, `${item.id}-${variant}.json`);
      const output = path.join(outputRoot, `${item.id}-${variant}.png`);
      const manifestPath = path.join(outputRoot, `${item.id}-${variant}.manifest.json`);
      const browserCache = path.join(runRoot, `${item.id}-${variant}-browser-cache`);
      await fs.writeFile(input, `${JSON.stringify(spec, null, 2)}\n`);
      const prepare = invoke(["prepare", item.id, "--input", input, "--output", prepared]);
      assertCliOk(prepare, `${item.id} ${variant} prepare`);
      const relativeTmp = `.cache/tmp/motion-template-relative-${item.id}-${variant}`;
      const preview = invoke(["preview", item.id, "--spec", prepared, "--output", output, "--samples", "0.5,0.7,0.5", "--browser", browser, "--cache-dir", browserCache, "--manifest", manifestPath], {
        env: { TMPDIR: relativeTmp, TMP: relativeTmp, TEMP: relativeTmp },
      });
      assertCliOk(preview, `${item.id} ${variant} preview`);
      const evidence = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      assert.equal(evidence.sourceRuntime.boot.initial.ready, true);
      assert.equal(evidence.sourceRuntime.capture.mode, "software-swiftshader");
      assert.equal(evidence.sourceRuntime.capture.frequentReadback, true);
      assert.deepEqual(evidence.sourceRuntime.missingRuntimeRequests, []);
      assert.deepEqual(evidence.sourceRuntime.servedPinMismatches, []);
      assert.deepEqual(evidence.console.errors, []);
      assert.deepEqual(evidence.network.blockedRequests, []);
      assert.ok(path.isAbsolute(evidence.sourceRuntime.browserTempRoot));
      assert.ok(evidence.sourceRuntime.browserTempRoot.startsWith(`${browserCache}${path.sep}`), "Playwright temp profile must use the absolute external project cache even when inherited TMPDIR is relative");
      assert.ok(evidence.sourceRuntime.boot.initial.expectedFontAssets.every((font) => font.loaded), "every family awaited by original loadFonts must be loaded from a pinned local source");
      assert.equal(evidence.renderedFrames[0].pixelSha256, evidence.renderedFrames[2].pixelSha256, "fresh page realms must replay the same source frame pixel-for-pixel");
      if (item.id.endsWith("segment")) {
        assert.notEqual(evidence.source.originalHtmlSha256, evidence.source.servedHtmlSha256, "declared content literals and scoped callsite patches produce derived HTML bytes");
        assert.equal(evidence.source.htmlAdapter.replacements.length, 5);
        assert.ok(evidence.source.htmlAdapter.replacements.every((replacement) => replacement.encoding.includes("JSON string literal")));
        assert.equal(evidence.source.htmlAdapter.sourcePatches.length, 2);
        assert.ok(evidence.source.htmlAdapter.sourcePatches.every((patch) => patch.alignment === "left" && patch.state.includes("ctx.save()/ctx.restore()") && !patch.originalDrawingFunctionModified));
        const expectedName = variant === "base" ? "示例风格" : "学习路径";
        const expectedCategory = variant === "base" ? "分类" : "因果";
        assert.ok(evidence.renderedFrames[0].capsuleCallEvidence.length >= 1, "original capsule call evidence is captured during boot and requested rendering");
        assert.ok(evidence.renderedFrames[0].capsuleCallEvidence.every((call) => call.branch === "themed" && call.textAlign === "left" && call.name === expectedName && call.category === expectedCategory), "rendered source calls receive declared content with scoped left alignment");
      } else {
        assert.equal(evidence.source.originalHtmlSha256, evidence.source.servedHtmlSha256, "big-card runs directly from the original HTML bytes");
      }
      rows.push(evidence.renderedFrames[1].pixelSha256);
    }
    assert.notEqual(rows[0], rows[1], `${item.id} source-consumed content changes must alter rendered pixels`);
  }

  const defaultCapsuleSpec = structuredClone(cases[1].spec);
  delete defaultCapsuleSpec.parameters.capsuleName;
  delete defaultCapsuleSpec.parameters.capsuleCategory;
  const defaultCapsuleInput = path.join(inputRoot, "segment-default-capsule.json");
  const defaultCapsulePrepared = path.join(preparedRoot, "segment-default-capsule.json");
  await fs.writeFile(defaultCapsuleInput, `${JSON.stringify(defaultCapsuleSpec, null, 2)}\n`);
  const defaultCapsulePrepare = invoke(["prepare", cases[1].id, "--input", defaultCapsuleInput, "--output", defaultCapsulePrepared]);
  assertCliOk(defaultCapsulePrepare, "segment default capsule prepare");
  const preparedCapsule = JSON.parse(await fs.readFile(defaultCapsulePrepared, "utf8"));
  assert.equal(preparedCapsule.parameters.capsuleName, "章节");
  assert.equal(preparedCapsule.parameters.capsuleCategory, "");

  const invalidGlass = path.join(inputRoot, "segment-glass-subtitle.json");
  await fs.writeFile(invalidGlass, `${JSON.stringify({ ...cases[1].spec, parameters: { ...cases[1].spec.parameters, theme: "aqua-morandi" } }, null, 2)}\n`);
  const blocked = invoke(["prepare", cases[1].id, "--input", invalidGlass, "--output", path.join(preparedRoot, "segment-glass-subtitle.json")]);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /does not consume PLACEHOLDER_SUB/);
});

test("DG preload initializes the original camera library to the requested non-1920 stage", async (t) => {
  const browser = await browserExecutable();
  const configuredFfmpeg = process.env.MOTION_FFMPEG || process.env.MOTION_TEMPLATE_TEST_FFMPEG;
  const ffmpeg = configuredFfmpeg || (() => {
    const result = spawnSync("which", ["ffmpeg"], { encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : null;
  })();
  let playwrightAvailable = false;
  try { nodeRequire.resolve("playwright"); playwrightAvailable = true; } catch { /* live render needs local Playwright */ }
  if (!browser || !ffmpeg || !playwrightAvailable) {
    t.skip("requires an installed browser, FFmpeg, and Playwright; no dependency is installed by this test");
    return;
  }

  const cacheRoot = path.join(repoRoot, ".cache", "tmp");
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "laohu-motion-dg-stage-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const scenePath = path.join(runRoot, "scene.json");
  const drawPath = path.join(runRoot, "stage-probe.js");
  const outputPath = path.join(runRoot, "scene.mp4");
  const cachePath = path.join(runRoot, "cache");
  const scene = { version: 1, width: 640, height: 360, fps: 1, duration: 1, background: "#101820", layers: [], objects: [], events: [], bindings: [], variables: {} };
  await fs.writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
  await fs.writeFile(drawPath, `
const center = window.CAM.toScreen({ x: 0, y: 0, z: 1 }, 0, 0);
if (center[0] !== 320 || center[1] !== 180) throw new Error("CAM.toScreen did not receive the requested 640x360 stage: " + JSON.stringify(center));
window.MOTION_RENDERERS = {};
window.MOTION_EVIDENCE = { cameraStageProbe: { worldOrigin: [0, 0], screen: center } };
`);
  const result = spawnSync(process.execPath, [
    path.join(skillDir, "scripts", "render.mjs"),
    "--scene", scenePath,
    "--output", outputPath,
    "--cache-dir", cachePath,
    "--browser", browser,
    "--ffmpeg", ffmpeg,
    "--draw-module", drawPath,
    "--template-effects", "huashu-art-motion-dg",
    "--overwrite",
  ], { cwd: repoRoot, encoding: "utf8", timeout: 180_000, env: process.env });
  assertCliOk(result, "non-1920 DG camera stage render");
  const manifestPath = result.stdout.split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice("MANIFEST ".length);
  assert.ok(manifestPath, `render did not report its manifest: ${result.stdout}`);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest.templateEffectStage, { requested: { width: 640, height: 360 }, actual: { width: 640, height: 360 } });
  assert.deepEqual(manifest.consumerEvidence.cameraStageProbe, { worldOrigin: [0, 0], screen: [320, 180] });
});
