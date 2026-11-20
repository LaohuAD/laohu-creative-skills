import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(skillDir, "../../..");
const renderCli = path.join(skillDir, "scripts", "render.mjs");
const templatesCli = path.join(skillDir, "scripts", "templates.mjs");
const catalogPath = path.join(skillDir, "templates", "catalog.json");
const sourceLedgerPath = path.join(skillDir, "templates", "maintenance", "source-ledger.json");
const adapterPath = path.join(skillDir, "templates", "adapters", "laohu-network-pass.js");
const ffmpeg = process.env.MOTION_FFMPEG || "/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg";
const ffprobe = process.env.MOTION_FFPROBE || path.join(path.dirname(ffmpeg), "ffprobe");
const browserPath = process.env.MOTION_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const validationRoot = path.join(repoRoot, ".cache", "validation", "motion-composition-integration", "network-disclosure");
const tempRoot = path.join(repoRoot, ".cache", "tmp", "film-render", "motion-source-integration", "network-disclosure");
const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const sourceLedger = JSON.parse(await fs.readFile(sourceLedgerPath, "utf8"));
const sourceRoot = process.env.MOTION_SOURCE_ROOT ? path.resolve(process.env.MOTION_SOURCE_ROOT) : null;
const toolkit = catalog.effectLibraries.find((item) => item.id === "laohu-motion-toolkit");
const networkEffect = catalog.effects.find((item) => item.id === "laohu-motion-network-pass");
const sourceRecord = sourceLedger.sources.find((row) => row.id === "huashu-art-motion");
const SOURCE_COMMIT = "8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c";
const SOURCE_HASHES = {
  "scripts/engine/demos/t1_3b1b/eras.js": "448e7293cf5a0e724b2cfa4cab1bc7148f8027ecc0ddfc6a04ade2817acb2216",
  "scripts/engine/demos/t1_3b1b/t1_s1.js": "10f1e0b82dae1c55f53f59ae6fbae8d976773d822c749171f924121214d47b3a",
  "scripts/engine/demos/t1_3b1b/t1_s2.js": "686b2c620be37ede852c92c3952f624dfbaf5724927328e9ab45d8bc7569922f",
};
const sourceFiles = [...new Set([
  ...(toolkit?.loadOrder || []),
  ...(networkEffect?.fontDependencies || []).map((row) => row.path),
  "scripts/engine/demos/t1_3b1b/eras.js",
  "scripts/engine/demos/t1_3b1b/t1_s1.js",
  "scripts/engine/demos/t1_3b1b/t1_s2.js",
])];
const sourceHashMap = Object.fromEntries(sourceFiles.map((relativePath) => [relativePath,
  sourceRecord?.files?.find((row) => row.path === relativePath)?.sha256 || SOURCE_HASHES[relativePath],
]));

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function sourceSkipReason() {
  if (!sourceRoot) return "MOTION_SOURCE_ROOT is unset; source-pixel comparison skipped";
  const unpinned = sourceFiles.find((relativePath) => !/^[a-f0-9]{64}$/.test(sourceHashMap[relativePath] || ""));
  if (unpinned) return `source comparison has no maintenance-ledger or preserved fixture SHA for huashu-art-motion/${unpinned}; source-pixel comparison skipped`;
  const missing = sourceFiles.find((relativePath) => !fsSync.existsSync(path.join(sourceRoot, "huashu-art-motion", relativePath)));
  return missing ? `MOTION_SOURCE_ROOT is missing huashu-art-motion/${missing}; source-pixel comparison skipped` : false;
}
function readPinnedSource(relativePath) {
  const expectedSha = sourceHashMap[relativePath];
  assert.match(expectedSha || "", /^[a-f0-9]{64}$/, `source identity must pin huashu-art-motion/${relativePath}`);
  assert.equal(sourceRecord?.commit, SOURCE_COMMIT, "maintenance source ledger and preserved source-comparison fixture must identify the same huashu-art-motion commit");
  const bytes = fsSync.readFileSync(path.join(sourceRoot, "huashu-art-motion", relativePath));
  const provenance = sourceRecord?.files?.some((row) => row.path === relativePath) ? "maintenance source-ledger" : "preserved direct-comparison fixture";
  assert.equal(sha(bytes), expectedSha, `huashu-art-motion/${relativePath} matches ${provenance} SHA-256`);
  return bytes;
}
function run(executable, args, label, env = {}, timeout = 900_000) {
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  assert.equal(result.error, undefined, `${label}: ${result.error?.message || "process spawn failed"}`);
  assert.equal(result.status, 0, `${label} failed (status=${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result.stdout;
}
async function writeJson(file, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n");
  await fs.writeFile(file, bytes);
  return sha(bytes);
}
function baseEnv() {
  return {
    MOTION_FFMPEG: ffmpeg,
    MOTION_FFPROBE: ffprobe,
    MOTION_BROWSER: browserPath,
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    OM_SAMPLES: "off",
  };
}
function disclosureObject(text) {
  return {
    id: "network-pass-disclosure",
    type: "text",
    space: "screen",
    x: 960,
    y: 1018,
    text,
    fontFamily: "NotoSerifSC",
    fontWeight: "700",
    fontSize: 38,
    maxWidth: 1680,
    align: "center",
    baseline: "alphabetic",
    fill: "#FFFF00",
  };
}
function sourceClockScene(nativeParameters = null, disclosureText = null) {
  const objects = [{
    id: "network-pass-group",
    type: "custom:laohu-network-pass",
    space: "screen",
    data: nativeParameters == null ? {} : { nativeParameters },
  }];
  if (disclosureText != null) objects.push(disclosureObject(disclosureText));
  return {
    version: 1,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 5.4,
    timeBasis: "scene-local",
    background: "#000000",
    objects,
    events: [],
    bindings: [],
  };
}
function parseManifestPath(stdout) {
  const match = stdout.match(/^MANIFEST\s+(.+)$/m);
  assert.ok(match, "render.mjs emits the actual render receipt path");
  return path.resolve(match[1].trim());
}
function parseFilmProbe(stdout) {
  const parsed = JSON.parse(stdout);
  const [video] = parsed.streams.filter((row) => row.codec_type === "video");
  assert.ok(video, "playable output has one video stream");
  return { video, durationSec: Number(parsed.format.duration) };
}

test("pinned t1_s1+s2 group keeps exact source pixels, validates same-frame Core disclosure and renders through Motion and Film/1", { timeout: 900_000, skip: sourceSkipReason() }, async () => {
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
  for (const file of [ffmpeg, ffprobe, browserPath]) await fs.access(file);
  const runRoot = path.join(validationRoot, `e2e-${process.pid}-${Date.now()}`);
  const workRoot = path.join(tempRoot, path.basename(runRoot));
  await fs.mkdir(runRoot, { recursive: true });
  await fs.mkdir(workRoot, { recursive: true });
  assert.ok(toolkit, "the source rendering closure is selected from the catalog");
  assert.ok(networkEffect?.fontDependencies?.length, "the network group declares its consumed source fonts");
  assert.ok(sourceRecord, "maintenance source ledger pins the original art-motion source");
  const fontAssets = [];
  for (const dependency of networkEffect.fontDependencies) {
    const bytes = readPinnedSource(dependency.path);
    fontAssets.push({ ...dependency, base64: bytes.toString("base64") });
  }
  for (const relativePath of sourceFiles) readPinnedSource(relativePath);
  const env = baseEnv();
  const context = await chromium.launch({ executablePath: browserPath, headless: true, args: ["--disable-dev-shm-usage"] });
  let parity;
  try {
    const page = await context.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent('<canvas id="direct" width="1920" height="1080"></canvas><canvas id="motion" width="1920" height="1080"></canvas><canvas id="variant" width="1920" height="1080"></canvas><canvas id="disclosure" width="1920" height="1080"></canvas>');
    for (const file of toolkit.loadOrder) await page.addScriptTag({ path: path.join(sourceRoot, "huashu-art-motion", file) });
    const registeredFonts = await page.evaluate(async (assets) => {
      const faces = [];
      for (const asset of assets) {
        const url = `data:font/woff;base64,${asset.base64}`;
        const face = new FontFace(asset.family, `url(${url})`, { weight: asset.weight, style: asset.style });
        await face.load();
        document.fonts.add(face);
        faces.push({ family: asset.family, url, desc: { weight: asset.weight, style: asset.style }, status: face.status });
      }
      window.MOTION_SOURCE_FONT_FACES = faces;
      await document.fonts.ready;
      await U.loadCmaps(faces);
      return faces.map(({ family, status }) => ({ family, status, check: document.fonts.check(`16px "${family}"`) }));
    }, fontAssets);
    assert.ok(registeredFonts.every((font) => font.status === "loaded" && font.check), "direct source parity uses the pinned original font files");
    await page.evaluate(() => U.setStage(1920, 1080));
    await page.evaluate(() => { window.SCENES = {}; });
    const sourceDemo = path.join(sourceRoot, "huashu-art-motion", "scripts", "engine", "demos", "t1_3b1b");
    for (const file of ["eras.js", "t1_s1.js", "t1_s2.js"]) await page.addScriptTag({ path: path.join(sourceDemo, file) });
    await page.addScriptTag({ path: path.join(skillDir, "scripts", "motion-core.js") });
    await page.addScriptTag({ path: path.join(skillDir, "templates", "adapters", "laohu-network-pass.js") });
    await page.evaluate(async () => { if (typeof window.MOTION_READY === "function") await window.MOTION_READY(); });
    const missingSourceFontError = await page.evaluate(async () => {
      const sourceFaces = window.MOTION_SOURCE_FONT_FACES;
      window.MOTION_SOURCE_FONT_FACES = sourceFaces.filter((face) => face.family !== "NotoSerifSC");
      try { await window.MOTION_READY(); return null; }
      catch (error) { return String(error.message || error); }
      finally { window.MOTION_SOURCE_FONT_FACES = sourceFaces; }
    });
    assert.match(missingSourceFontError || "", /must include the original DG\.FONT\.rm and DG\.FONT\.zh families/);
    parity = await page.evaluate(async ({ disclosureTemplate }) => {
      await document.fonts.ready;
      const times = [0, 0.8, 1.3, 2.55, 2.6, 2.6001, 3.6, 5.3666666667];
      const scene = {
        version: 1, width: 1920, height: 1080, fps: 30, duration: 5.4, timeBasis: "scene-local", background: "#000000",
        objects: [{ id: "network-pass-group", type: "custom:laohu-network-pass", space: "screen", data: {} }],
        events: [], bindings: [],
      };
      const hash = (data) => { let value = 2166136261; for (const byte of data) value = Math.imul(value ^ byte, 16777619); return (value >>> 0).toString(16).padStart(8, "0"); };
      const direct = document.getElementById("direct"), motion = document.getElementById("motion"), variant = document.getElementById("variant"), disclosureCanvas = document.getElementById("disclosure");
      const directCtx = direct.getContext("2d", { willReadFrequently: true }), motionCtx = motion.getContext("2d", { willReadFrequently: true });
      const rows = [];
      const captures = {};
      for (const timeSec of times) {
        directCtx.clearRect(0, 0, 1920, 1080);
        if (timeSec < 2.6) window.SCENES.t1_s1.draw(directCtx, timeSec);
        else window.SCENES.t1_s2.draw(directCtx, timeSec - 2.6);
        window.MotionCore.drawFrame(motion, scene, timeSec, window.MOTION_RENDERERS, true);
        const directPixels = directCtx.getImageData(0, 0, 1920, 1080).data;
        const motionPixels = motionCtx.getImageData(0, 0, 1920, 1080).data;
        let differentChannels = 0, maxChannelDelta = 0;
        for (let index = 0; index < directPixels.length; index += 1) {
          const delta = Math.abs(directPixels[index] - motionPixels[index]);
          if (delta) { differentChannels += 1; maxChannelDelta = Math.max(maxChannelDelta, delta); }
        }
        rows.push({ timeSec, sourceSceneId: timeSec < 2.6 ? "t1_s1" : "t1_s2", directSha256Like: hash(directPixels), adapterSha256Like: hash(motionPixels), differentChannels, maxChannelDelta });
        if ([2.55, 2.6, 3.6].includes(timeSec)) captures[String(timeSec)] = { directPng: direct.toDataURL("image/png"), adapterPng: motion.toDataURL("image/png") };
      }

      const numericScene = structuredClone(scene);
      numericScene.objects[0].data.nativeParameters = {
        outputs: [{ name: "猫", activation: 0.84 }, { name: "狗", activation: 0.11 }, { name: "鸟", activation: 0.05 }],
      };
      const disclosureCases = [];
      let disclosureCapturePng = null;
      for (const item of [
        { text: "数值为示意，不是实测", timeSec: 4.2 },
        { text: "示意值，未实测", timeSec: 3.6 },
      ]) {
        const baseCase = structuredClone(numericScene);
        window.MotionCore.drawFrame(disclosureCanvas, baseCase, item.timeSec, window.MOTION_RENDERERS, true);
        const basePixels = disclosureCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 1920, 1080).data;
        const disclosedCase = structuredClone(numericScene);
        disclosedCase.objects.push({ ...disclosureTemplate, text: item.text });
        window.MotionCore.assertValidScene(disclosedCase);
        window.MotionCore.drawFrame(disclosureCanvas, disclosedCase, item.timeSec, window.MOTION_RENDERERS, true);
        const disclosedPixels = disclosureCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 1920, 1080).data;
        let changedPixels = 0, changedPixelsInSafeRegion = 0, yellowInkPixels = 0, outsideSafeRegion = 0, minX = 1920, minY = 1080, maxX = -1, maxY = -1;
        for (let index = 0; index < basePixels.length; index += 4) {
          const pixel = index / 4, x = pixel % 1920, y = Math.floor(pixel / 1920);
          const inSafeRegion = x >= 120 && x < 1800 && y >= 965 && y < 1060;
          if (inSafeRegion && disclosedPixels[index] > 180 && disclosedPixels[index + 1] > 180 && disclosedPixels[index + 2] < 100 && disclosedPixels[index + 3] > 200) yellowInkPixels += 1;
          const changed = basePixels[index] !== disclosedPixels[index] || basePixels[index + 1] !== disclosedPixels[index + 1] || basePixels[index + 2] !== disclosedPixels[index + 2] || basePixels[index + 3] !== disclosedPixels[index + 3];
          if (!changed) continue;
          changedPixels += 1;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          if (inSafeRegion) changedPixelsInSafeRegion += 1;
          else outsideSafeRegion += 1;
        }
        const receiptRow = window.MOTION_EVIDENCE?.nativeNetworkPass?.objects?.["network-pass-group"];
        disclosureCases.push({
          text: item.text,
          timeSec: item.timeSec,
          changedPixels,
          changedPixelsInSafeRegion,
          yellowInkPixels,
          changedBounds: { minX, minY, maxX, maxY },
          outsideSafeRegion,
          measurement: receiptRow?.sameFrameDisclosure || null,
        });
        if (item.text === "数值为示意，不是实测") disclosureCapturePng = disclosureCanvas.toDataURL("image/png");
      }

      const rejectDisclosure = (mutate, label) => {
        const invalid = structuredClone(scene);
        invalid.objects.push({ ...disclosureTemplate, text: "数值为示意，不是实测" });
        mutate(invalid);
        try { window.MotionCore.drawFrame(variant, invalid, 4.2, window.MOTION_RENDERERS, true); return { label, error: null }; }
        catch (error) { return { label, error: String(error.message || error) }; }
      };
      const rejectedDisclosure = [
        rejectDisclosure((value) => { value.objects[1].id = "arbitrary-caption"; }, "id"),
        rejectDisclosure((value) => { value.objects[1].text = ""; }, "empty"),
        rejectDisclosure((value) => { value.objects[1].text = "两行\n披露"; }, "newline"),
        rejectDisclosure((value) => { value.objects[1].fontSize = 12; }, "font-size"),
        rejectDisclosure((value) => { value.objects[1].text = "教学示意，非实测"; }, "missing-glyph"),
        rejectDisclosure((value) => { value.objects[1].text = "未实测".repeat(100); }, "too-wide"),
        rejectDisclosure((value) => { value.objects[1].stroke = "#fff"; }, "extra-style"),
        rejectDisclosure((value) => { value.objects.push({ id: "extra", type: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#fff" }); }, "third-object"),
        rejectDisclosure((value) => { value.objects.reverse(); }, "wrong-order"),
        rejectDisclosure((value) => { value.variables = { probe: 0 }; value.events.push({ target: { kind: "variable", id: "probe" }, property: "value", from: 0, to: 1, start: 0, duration: 1 }); }, "events"),
      ];

      const s1Handoff = document.createElement("canvas"); s1Handoff.width = 1920; s1Handoff.height = 1080;
      const s2Handoff = document.createElement("canvas"); s2Handoff.width = 1920; s2Handoff.height = 1080;
      const s1Context = s1Handoff.getContext("2d", { willReadFrequently: true }), s2Context = s2Handoff.getContext("2d", { willReadFrequently: true });
      window.SCENES.t1_s1.draw(s1Context, 2.6); window.SCENES.t1_s2.draw(s2Context, 0);
      const endPixels = s1Context.getImageData(0, 0, 1920, 1080).data, startPixels = s2Context.getImageData(0, 0, 1920, 1080).data;
      let handoffDifferentChannels = 0;
      for (let index = 0; index < endPixels.length; index += 1) if (endPixels[index] !== startPixels[index]) handoffDifferentChannels += 1;

      const explicitPixels = Array(100).fill(0);
      const variantScene = structuredClone(scene);
      variantScene.objects[0].id = "network-pass-input-variant";
      variantScene.objects[0].data.nativeParameters = { inputPixels: explicitPixels };
      window.MotionCore.drawFrame(variant, variantScene, 0.8, window.MOTION_RENDERERS, true);
      const baseScene = scene;
      window.MotionCore.drawFrame(motion, baseScene, 0.8, window.MOTION_RENDERERS, true);
      const baseVariantPixels = motionCtx.getImageData(0, 0, 1920, 1080).data;
      const changedVariantPixels = variant.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 1920, 1080).data;
      let variantDifferentChannels = 0;
      for (let index = 0; index < baseVariantPixels.length; index += 1) if (baseVariantPixels[index] !== changedVariantPixels[index]) variantDifferentChannels += 1;

      const stateScene = structuredClone(scene);
      stateScene.objects[0].id = "network-pass-state-variant";
      stateScene.objects[0].data.nativeParameters = {
        outputs: [{ name: "狗", activation: 0.12 }, { name: "鸟", activation: 0.81 }, { name: "猫", activation: 0.07 }],
        hiddenActivations: [0.05, 0.12, 0.15, 0.3, 0.64, 0.06, 0.71, 0.22, 0.88, 0.41],
        inputToHiddenWeights: Array.from({ length: 16 }, (_, row) => Array.from({ length: 10 }, (_, col) => ((row + col) % 2 ? -0.8 : 0.8))),
        hiddenToOutputWeights: Array.from({ length: 10 }, (_, row) => Array.from({ length: 3 }, (_, col) => (row + col) % 2 ? -0.7 : 0.7)),
      };
      window.MotionCore.drawFrame(motion, scene, 4.2, window.MOTION_RENDERERS, true);
      const defaultStatePixels = motionCtx.getImageData(0, 0, 1920, 1080).data;
      window.MotionCore.drawFrame(variant, stateScene, 4.2, window.MOTION_RENDERERS, true);
      const changedStatePixels = variant.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 1920, 1080).data;
      const stateVariantSha = hash(changedStatePixels);
      let stateVariantDifferentChannels = 0;
      for (let index = 0; index < defaultStatePixels.length; index += 1) if (defaultStatePixels[index] !== changedStatePixels[index]) stateVariantDifferentChannels += 1;

      const invalidScene = structuredClone(scene);
      invalidScene.objects[0].data.nativeParameters = { guessedOutput: 0.99 };
      let invalidFieldError = null;
      try { window.MotionCore.drawFrame(variant, invalidScene, 1, window.MOTION_RENDERERS, true); }
      catch (error) { invalidFieldError = String(error.message || error); }
      const invalidMatrixScene = structuredClone(scene);
      invalidMatrixScene.objects[0].data.nativeParameters = { inputToHiddenWeights: [[0.2]] };
      let invalidMatrixError = null;
      try { window.MotionCore.drawFrame(variant, invalidMatrixScene, 1, window.MOTION_RENDERERS, true); }
      catch (error) { invalidMatrixError = String(error.message || error); }
      const missingGlyphScene = structuredClone(scene);
      missingGlyphScene.objects[0].data.nativeParameters = {
        outputs: [{ name: "龘", activation: 0.2 }, { name: "狗", activation: 0.4 }, { name: "鸟", activation: 0.6 }],
      };
      let missingGlyphError = null;
      try { window.MotionCore.drawFrame(variant, missingGlyphScene, 4.2, window.MOTION_RENDERERS, true); }
      catch (error) { missingGlyphError = String(error.message || error); }
      return {
        rows, captures,
        disclosure: { cases: disclosureCases, rejected: rejectedDisclosure, capturePng: disclosureCapturePng },
        sourceHandoff: { sourceT1S1EndTimeSec: 2.6, sourceT1S2StartTimeSec: 0, differentChannels: handoffDifferentChannels },
        explicitInputVariant: { sourceField: "inputPixels", values: "100 explicit zeros", timeSec: 0.8, differentChannels: variantDifferentChannels },
        explicitStateVariant: { sourceFields: ["outputs", "hiddenActivations", "inputToHiddenWeights", "hiddenToOutputWeights"], timeSec: 4.2, hash: stateVariantSha, differentChannels: stateVariantDifferentChannels },
        rejected: { invalidFieldError, invalidMatrixError, missingGlyphError },
        pinnedFonts: window.MOTION_SOURCE_FONT_FACES.map(({ family, status }) => ({ family, status, check: document.fonts.check(`16px "${family}"`) })),
        adapterEvidence: window.MOTION_EVIDENCE?.nativeNetworkPass,
      };
    }, { disclosureTemplate: disclosureObject("数值为示意，不是实测") });
    parity.rejected.missingSourceFontError = missingSourceFontError;

    for (const row of parity.rows) {
      assert.equal(row.differentChannels, 0, `direct source pixels equal adapter pixels at ${row.timeSec}s`);
      assert.equal(row.maxChannelDelta, 0);
      assert.equal(row.directSha256Like, row.adapterSha256Like);
    }
    assert.equal(parity.sourceHandoff.differentChannels, 0, "source s1 last state and s2 first state are pixel-identical");
    assert.ok(parity.explicitInputVariant.differentChannels > 0, "the source-consumed inputPixels variant changes the visible source frame");
    assert.ok(parity.explicitStateVariant.differentChannels > 0, "explicit output labels/activations and the source-consumed activation/weight arrays change the visible network state");
    assert.deepEqual(parity.adapterEvidence.objects["network-pass-input-variant"].parameterFields, ["inputPixels"]);
    assert.deepEqual(parity.adapterEvidence.objects["network-pass-state-variant"].parameterFields, ["outputs", "hiddenActivations", "inputToHiddenWeights", "hiddenToOutputWeights"]);
    assert.match(parity.rejected.invalidFieldError || "", /unsupported field guessedOutput/);
    assert.match(parity.rejected.invalidMatrixError || "", /must have 16 rows/);
    assert.match(parity.rejected.missingGlyphError || "", /absent from the pinned NotoSerifSC subset/);
    assert.equal(parity.disclosure.cases.length, 2, "the Core disclosure accepts both the sample wording and a different author-written explanation");
    for (const row of parity.disclosure.cases) {
      assert.ok(row.changedPixelsInSafeRegion > 0, `same-frame Core text changes pixels in the fixed bottom safe area at ${row.timeSec}s`);
      assert.ok(row.yellowInkPixels > 0, `Core consumer paints high-contrast disclosure pixels in the fixed safe area at ${row.timeSec}s`);
      assert.equal(row.measurement?.sameFrame, true, "the adapter validated a same-frame Core text object");
      assert.ok(row.measurement.measuredWidthPx > 0 && row.measurement.measuredWidthPx <= 1680, "actual MotionCore.layoutText width fits without shrinking or wrapping");
    }
    const rejectedBy = Object.fromEntries(parity.disclosure.rejected.map(({ label, error }) => [label, error]));
    assert.match(rejectedBy.id || "", /must use id network-pass-disclosure/);
    assert.match(rejectedBy.empty || "", /non-empty single-line text/);
    assert.match(rejectedBy.newline || "", /non-empty single-line text/);
    assert.match(rejectedBy["font-size"] || "", /unsupported fontSize/);
    assert.match(rejectedBy["missing-glyph"] || "", /glyphs absent from the pinned NotoSerifSC subset/);
    assert.match(rejectedBy["too-wide"] || "", /fit as one line in the fixed safe region/);
    assert.match(rejectedBy["extra-style"] || "", /unsupported field stroke/);
    assert.match(rejectedBy["third-object"] || "", /optionally followed by one fixed disclosure text object/);
    assert.match(rejectedBy["wrong-order"] || "", /optionally followed by one fixed disclosure text object/);
    assert.match(rejectedBy.events || "", /does not accept extra layers, events, or bindings/);
    assert.ok(parity.pinnedFonts.every((font) => font.status === "loaded" && font.check));
    assert.ok(parity.adapterEvidence.objects["network-pass-group"].drawCalls.t1_s1 > 0);
    assert.ok(parity.adapterEvidence.objects["network-pass-group"].drawCalls.t1_s2 > 0);
    for (const [time, pair] of Object.entries(parity.captures)) {
      const stem = time.replaceAll(".", "p");
      await fs.writeFile(path.join(runRoot, `source-${stem}.png`), Buffer.from(pair.directPng.split(",")[1], "base64"));
      await fs.writeFile(path.join(runRoot, `adapter-${stem}.png`), Buffer.from(pair.adapterPng.split(",")[1], "base64"));
    }
    assert.ok(parity.disclosure.capturePng, "the canonical same-frame disclosure has a rendered PNG capture");
    await fs.writeFile(path.join(runRoot, "disclosure-4p2.png"), Buffer.from(parity.disclosure.capturePng.split(",")[1], "base64"));
    delete parity.disclosure.capturePng;
  } finally {
    await context.close();
  }

  const scenePath = path.join(runRoot, "network-pass-scene.json");
  const renderOutput = path.join(runRoot, "render-mjs.mp4");
  const sceneHash = await writeJson(scenePath, sourceClockScene(null, "数值为示意，不是实测"));
  const renderStdout = run(process.execPath, [
    renderCli, "--scene", scenePath, "--output", renderOutput,
    "--cache-dir", path.join(workRoot, "render-cache"),
    "--browser", browserPath, "--ffmpeg", ffmpeg,
    "--template-effects", "laohu-motion-toolkit", "--draw-module", adapterPath,
    "--samples", "0,2.55,2.6,3.6,5.3",
  ], "laohu-motion-network-pass render", env, 600_000);
  const renderManifestPath = parseManifestPath(renderStdout);
  const renderManifest = JSON.parse(await fs.readFile(renderManifestPath, "utf8"));
  assert.equal(renderManifest.frameCount, 162);
  assert.equal(renderManifest.templateEffects.id, "laohu-motion-toolkit");
  assert.equal(renderManifest.templateEffects.sourceId, "huashu-art-motion");
  assert.equal(renderManifest.templateEffects.sourceCommit, SOURCE_COMMIT);
  assert.deepEqual(renderManifest.templateEffects.fontAssets.map(({ family, status }) => [family, status]), [["CMU-rm", "loaded"], ["NotoSerifSC", "loaded"]]);
  const renderGroupEvidence = renderManifest.consumerEvidence?.nativeNetworkPass;
  assert.ok(renderGroupEvidence?.objects?.["network-pass-group"], "render receipt records real source-scene invocation and source order");
  assert.equal(renderGroupEvidence.objects["network-pass-group"].sameFrameDisclosure?.sameFrame, true, "actual render CLI validates the same-frame disclosure layer");
  assert.deepEqual(renderGroupEvidence.sourceOrder.map((row) => [row.id, row.durationSec]), [["t1_s1", 2.6], ["t1_s2", 2.8]]);
  for (const method of ["DG.neuron", "DG.edge", "DG.flash", "DG.morph", "DG.brace", "DG.write", "CAM.with", "CAM.apply", "MO.lagged", "TY.fmt"]) {
    assert.ok(renderManifest.templateEffects.calls[method] > 0, `manifest records real direct source calls for ${method}`);
  }
  const renderProbe = parseFilmProbe(run(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", renderOutput], "render-mjs ffprobe", env));
  assert.equal(Number(renderProbe.video.width), 1920);
  assert.equal(Number(renderProbe.video.height), 1080);
  assert.equal(Number(renderProbe.video.nb_read_frames), 162);
  assert.equal(renderProbe.durationSec, 5.4);

  const filmBlueprintPath = path.join(runRoot, "film-blueprint.json");
  const filmOutput = path.join(runRoot, "film-picture-only.mp4");
  const filmManifestPath = path.join(runRoot, "film-manifest.json");
  const drawModuleBytes = await fs.readFile(adapterPath);
  const filmBlueprint = {
    format: "laohu.huashu-film-blueprint/1",
    width: 1920, height: 1080, fps: 30,
    clock: { kind: "film-global", durationSec: 5.4 },
    segments: [{
      id: "network-pass-source-group",
      renderer: "motion-scene",
      scenePath: path.basename(scenePath),
      sceneSha256: sceneHash,
      drawModulePath: path.relative(runRoot, adapterPath),
      drawModuleSha256: sha(drawModuleBytes),
      templateEffects: "laohu-motion-toolkit",
      startSec: 0, endSec: 5.4,
    }],
  };
  await writeJson(filmBlueprintPath, filmBlueprint);
  run(process.execPath, [
    templatesCli, "render", "--film-blueprint", filmBlueprintPath, "--output", filmOutput,
    "--work-root", path.join(workRoot, "film-work"), "--manifest", filmManifestPath,
    "--browser", browserPath, "--ffmpeg", ffmpeg,
  ], "Film/1 network pass render", env, 600_000);
  const filmManifest = JSON.parse(await fs.readFile(filmManifestPath, "utf8"));
  assert.equal(filmManifest.render.frameCount, 162);
  assert.equal(filmManifest.assembly.audioStream, "absent");
  const filmSegment = filmManifest.segments.find((row) => row.id === "network-pass-source-group");
  assert.equal(filmSegment.renderer, "motion-scene");
  const filmReceiptPath = path.resolve(path.dirname(filmManifestPath), filmSegment.receiptPath);
  const filmReceipt = JSON.parse(await fs.readFile(filmReceiptPath, "utf8"));
  assert.equal(filmReceipt.templateEffects.sourceCommit, SOURCE_COMMIT);
  assert.deepEqual(filmReceipt.templateEffects.fontAssets.map(({ family, status }) => [family, status]), [["CMU-rm", "loaded"], ["NotoSerifSC", "loaded"]]);
  assert.ok(filmReceipt.consumerEvidence?.nativeNetworkPass?.objects?.["network-pass-group"]);
  assert.equal(filmReceipt.consumerEvidence.nativeNetworkPass.objects["network-pass-group"].sameFrameDisclosure?.sameFrame, true, "Film/1 consumes and records the same-frame disclosure layer");
  assert.ok(filmReceipt.templateEffects.calls["DG.edge"] > 0);
  assert.ok(filmReceipt.templateEffects.calls["CAM.apply"] > 0);
  const filmProbe = parseFilmProbe(run(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", filmOutput], "Film/1 ffprobe", env));
  assert.equal(Number(filmProbe.video.nb_read_frames), 162);
  assert.equal(filmProbe.durationSec, 5.4);

  const evidence = {
    format: "laohu.motion.network-pass-source-reuse-e2e/1",
    assessment: "source parity and runtime consumer technical evidence only; no aesthetic or human review",
    source: { sourceId: "huashu-art-motion", commit: SOURCE_COMMIT, license: "MIT", hashes: SOURCE_HASHES, scenes: ["t1_s1", "t1_s2"], sourceOrder: [{ id: "t1_s1", durationSec: 2.6 }, { id: "t1_s2", durationSec: 2.8 }] },
    adapter: { id: "laohu-motion-network-pass", renderer: "custom:laohu-network-pass", path: path.relative(repoRoot, adapterPath), sha256: sha(drawModuleBytes) },
    scene: { path: path.relative(repoRoot, scenePath), sha256: sceneHash },
    sourceParity: parity.rows,
    sourceHandoff: parity.sourceHandoff,
    pinnedFonts: parity.pinnedFonts,
    sameFrameDisclosure: parity.disclosure,
    explicitInputVariant: parity.explicitInputVariant,
    explicitStateVariant: parity.explicitStateVariant,
    parameterVariantEvidence: {
      input: parity.adapterEvidence.objects["network-pass-input-variant"],
      state: parity.adapterEvidence.objects["network-pass-state-variant"],
    },
    rejected: parity.rejected,
    renderMjs: { output: path.relative(repoRoot, renderOutput), manifest: path.relative(repoRoot, renderManifestPath), frameCount: renderManifest.frameCount, durationSec: renderProbe.durationSec, consumerEvidence: renderGroupEvidence, templateCalls: renderManifest.templateEffects.calls },
    film: { output: path.relative(repoRoot, filmOutput), manifest: path.relative(repoRoot, filmManifestPath), receipt: path.relative(repoRoot, filmReceiptPath), frameCount: filmManifest.render.frameCount, durationSec: filmProbe.durationSec, consumerEvidence: filmReceipt.consumerEvidence.nativeNetworkPass, templateCalls: filmReceipt.templateEffects.calls },
  };
  const evidencePath = path.join(runRoot, "evidence.json");
  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  process.stdout.write(`NETWORK_PASS_EVIDENCE ${evidencePath}\n`);
});
