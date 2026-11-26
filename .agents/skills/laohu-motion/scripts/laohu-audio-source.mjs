#!/usr/bin/env node
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findSceneAudioEvents, generatedAudioAssetScopes, mapLocalTimeToFilm, mapSceneEvents, validatePlan } from "./audio.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinnedSourceRoot = process.env.MOTION_SOURCE_ROOT
  ? path.join(path.resolve(process.env.MOTION_SOURCE_ROOT), "huashu-motion")
  : null;
const catalogPath = path.join(skillDir, "templates", "catalog.json");
const EXPECTED_SOURCE = Object.freeze({
  id: "huashu-motion",
  repository: "https://github.com/alchaincyf/huashu-motion",
  commit: "52467f99c602b76ba86d511d37acdfe93fa1e16e",
});
const RATE = 48000;
const GENERATED_LICENSE = "Locally generated from MIT-licensed Huashu Motion source; no upstream sample pack or third-party recording was used.";

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
function finite(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(label + " must be a finite number in [" + min + ", " + max + "]");
  return value;
}
function stableId(value, label) {
  if (typeof value !== "string" || !value.trim() || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) fail(label + " must be a non-empty stable ID using letters, numbers, dot, underscore, colon, or hyphen");
  return value;
}
function asArray(value, label) {
  if (!Array.isArray(value)) fail(label + " must be an array");
  return value;
}
function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object");
  return value;
}
function clampGain(value, label) { return finite(value == null ? 1 : value, label, { min: 0, max: 4 }); }
function safeStem(value) { return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "event"; }

async function readJson(file, label) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { fail(label + " could not be read as JSON: " + file + " (" + error.message + ")"); }
}
async function realPath(value) {
  let cursor = path.resolve(value), suffix = [];
  while (true) {
    try { return path.join(await fs.realpath(cursor), ...suffix); }
    catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) return path.resolve(value);
      suffix.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}
function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}
async function assertOutputPath(file, projectRoot, label) {
  const resolved = path.resolve(file);
  const parent = path.dirname(resolved);
  const parentReal = await fs.realpath(parent).catch((error) => fail(label + " parent directory must exist: " + parent + " (" + error.message + ")"));
  const target = path.join(parentReal, path.basename(resolved));
  if (!contains(projectRoot, target)) fail(label + " must stay inside --project-root: " + file);
  const stat = await fs.lstat(resolved).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (stat?.isSymbolicLink()) fail(label + " must not be a symlink: " + file);
  if (stat && !stat.isFile()) fail(label + " must be a regular file: " + file);
  if (stat) fail(label + " already exists; choose a new output path: " + file);
  return resolved;
}
async function assertSameVolume(paths) {
  const rows = await Promise.all(paths.map(async (file) => ({ file, dev: (await fs.stat(file)).dev })));
  const first = rows[0]?.dev;
  for (const row of rows) if (row.dev !== first) fail("All inputs, local runtime files, project assets, and outputs must remain on one filesystem; mismatch at " + row.file);
}
async function writeNewAtomic(file, data) {
  const temp = path.join(path.dirname(file), "." + path.basename(file) + "." + process.pid + "." + Date.now() + ".part");
  try {
    await fs.writeFile(temp, data, { flag: "wx" });
    await fs.link(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

async function loadLocalAudioRuntime() {
  const catalog = await readJson(catalogPath, "template catalog");
  const source = (catalog.sources || []).find((item) => item.id === EXPECTED_SOURCE.id);
  if (!source || source.repository !== EXPECTED_SOURCE.repository || source.commit !== EXPECTED_SOURCE.commit) fail("Huashu Motion source identity in templates/catalog.json does not match the approved commit");
  if (!String(source.license || "").includes("MIT") || !(source.licenseFiles || []).includes("LICENSE")) fail("The local audio runtime must retain its upstream MIT license evidence");
  const local = source.localRuntime;
  if (!local || local.entry !== "templates/runtime/laohu-audio-mix.mjs" || !Array.isArray(local.files) || !Array.isArray(local.sourceClosurePaths)) {
    fail("The catalog must pin a complete local Huashu audio runtime closure");
  }
  const ledger = new Map((source.files || []).map((item) => [item.path, item]));
  const closure = local.sourceClosurePaths.slice().sort().map((relative) => {
    const row = ledger.get(relative);
    if (!row) fail("The catalog source ledger is missing migrated audio closure member " + relative);
    return { path: relative, sha256: row.sha256, gitBlob: row.gitBlob || null };
  });
  const sourceClosureSha256 = sha256(Buffer.from(canonical(closure)));
  if (sourceClosureSha256 !== local.sourceClosureSha256 || sourceClosureSha256 !== "5a26d346ea81fade680d35c12db137730e05e1568954035b1dc0e3847dd5deba") {
    fail("The static Huashu source closure identity changed; run the source parity/update workflow before using the local runtime");
  }
  const rootReal = await fs.realpath(path.join(skillDir, "templates", "runtime"));
  for (const row of local.files) {
    if (!row || typeof row.path !== "string" || !row.path.startsWith("templates/runtime/")
        || path.posix.isAbsolute(row.path) || row.path.split("/").includes("..")) fail("Local audio closure path escaped templates/runtime");
    const full = path.resolve(skillDir, row.path);
    const real = await fs.realpath(full).catch((error) => fail("Local audio runtime file is missing: " + row.path + " (" + error.message + ")"));
    if (!contains(rootReal, real)) fail("Local audio runtime symlink escaped templates/runtime: " + row.path);
    const bytes = await fs.readFile(real);
    if (sha256(bytes) !== shaField(row.sha256, "local audio runtime " + row.path + ".sha256")) fail("Local audio runtime hash is stale: " + row.path);
  }
  const localRuntimeClosureSha256 = sha256(Buffer.from(canonical(local.files)));
  if (localRuntimeClosureSha256 !== local.closureSha256) fail("Local audio runtime closure catalog hash is stale");
  const localRoot = path.join(skillDir, "templates", "runtime");
  const localMixPath = path.join(localRoot, "laohu-audio-mix.mjs");
  const localComposedPath = path.join(localRoot, "laohu-audio-composed.mjs");
  const localScorePath = path.join(localRoot, "laohu-audio-score.mjs");
  const localDspPath = path.join(localRoot, "laohu-audio-dsp.mjs");
  const samplePath = path.join(localRoot, "laohu-audio-samples.mjs");
  const envNames = ["OM_SAMPLES", "LAOHU_REQUIRE_RECORDED", "LAOHU_FFMPEG"];
  const previousEnv = new Map(envNames.map((name) => [name, process.env[name]]));
  let sound, composed, score, dsp, samples;
  let importPolicy;
  try {
    process.env.OM_SAMPLES = "off";
    delete process.env.LAOHU_REQUIRE_RECORDED;
    [sound, composed, score, dsp, samples] = await Promise.all([
      import(pathToFileURL(localMixPath).href),
      import(pathToFileURL(localComposedPath).href),
      import(pathToFileURL(localScorePath).href),
      import(pathToFileURL(localDspPath).href),
      import(pathToFileURL(samplePath).href),
    ]);
    samples.resetPack?.();
    score.resetVoices?.();
    const beforeRestore = { OM_SAMPLES: process.env.OM_SAMPLES, LAOHU_REQUIRE_RECORDED: process.env.LAOHU_REQUIRE_RECORDED ?? null, packDirectory: samples.packDir?.() ?? null };
    if (beforeRestore.OM_SAMPLES !== "off" || beforeRestore.LAOHU_REQUIRE_RECORDED !== null || beforeRestore.packDirectory !== "off" || samples.loadPack?.() !== null) {
      fail("Local Huashu audio runtime did not initialize with OM_SAMPLES=off and a null sample-pack cache");
    }
    for (const [name, value] of [["SFX", sound.SFX], ["KITS", sound.KITS], ["Track", sound.Track], ["mixdown", sound.mixdown],
      ["loudness", sound.loudness], ["toWav", sound.toWav], ["readWav", sound.readWav], ["renderComposed", composed.renderComposed],
      ["plan", score.plan], ["deg", score.deg], ["mtof", dsp.mtof], ["rng", dsp.rng]]) {
      if (!value) fail("Local Huashu audio runtime is missing API " + name);
    }
    if (sound.RATE !== RATE || dsp.RATE !== RATE) fail("Local Huashu audio runtime sample rate differs from the audio-plan 48 kHz contract");
    importPolicy = {
      environmentBeforeFirstImport: beforeRestore,
      packCacheInitializedNullBeforeEnvironmentRestore: true,
      visiblePackAtFirstImport: false,
    };
  } finally {
    for (const name of envNames) {
      const value = previousEnv.get(name);
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
  importPolicy.environmentRestoredAfterImport = envNames.every((name) => process.env[name] === previousEnv.get(name));
  const pin = {
    source: { id: source.id, repository: source.repository, commit: source.commit },
    closure,
    licenseFiles: ["LICENSE", "THIRD_PARTY.md"],
    license: source.license,
  };
  return {
    sound, composed, score, dsp, samples, pin,
    runtime: {
      entry: local.entry, closureSha256: localRuntimeClosureSha256,
      files: local.files, sourceClosureSha256, importPolicy,
    },
  };
}

function manifestPath(baseDir, value, label) {
  if (typeof value !== "string" || !value.trim()) fail(label + " must be a non-empty path");
  return path.resolve(baseDir, value);
}

function shaField(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) fail(label + " must be a 64-character SHA-256 hex digest");
  return value.toLowerCase();
}

async function verifyFileHash(file, expected, label) {
  const bytes = await fs.readFile(file).catch((error) => fail(label + " is missing or unreadable: " + file + " (" + error.message + ")"));
  const actual = sha256(bytes);
  if (actual !== shaField(expected, label + ".sha256")) fail(label + " SHA-256 is stale: " + file);
  return { path: file, sha256: actual, bytes };
}

async function verifyLargeFileHash(file, expected, label) {
  const digest = createHash("sha256");
  try {
    for await (const chunk of createReadStream(file)) digest.update(chunk);
  } catch (error) {
    fail(label + " is missing or unreadable: " + file + " (" + error.message + ")");
  }
  const actual = digest.digest("hex");
  if (actual !== shaField(expected, label + ".sha256")) fail(label + " SHA-256 is stale: " + file);
  return { path: file, sha256: actual };
}

async function verifyMotionFilmPicture(manifest, baseDir, expectedClockKind) {
  const outputKind = manifest.output?.kind;
  const hasSourceTransitionPostprocess = outputKind === "picture-only-remotion-v2-with-source-transition-postprocess";
  if (outputKind !== "picture-only-remotion-v2" && !hasSourceTransitionPostprocess) fail("Shotcraft film manifest.output.kind must identify a supported picture-only Remotion /2 output");
  const render = plainObject(manifest.render, "Shotcraft film manifest.render");
  const frameClock = plainObject(manifest.frameClock, "Shotcraft film manifest.frameClock");
  if (frameClock.kind !== expectedClockKind || frameClock.method !== "absolute-ceil-boundaries" || frameClock.fps !== 30) fail("Shotcraft film frameClock must preserve its declared absolute-ceil 30 fps clock");
  const frameCount = finite(render.frameCount, "Shotcraft film render.frameCount", { min: 1 });
  if (!Number.isSafeInteger(frameCount) || frameClock.totalFrameCount !== frameCount || render.width !== 1920 || render.height !== 1080 || render.fps !== 30) fail("Shotcraft film render metadata must be 1920×1080@30 with the frameClock total");
  const durationSec = finite(render.durationSec, "Shotcraft film render.durationSec", { min: 1 / 30 });
  if (Math.abs(durationSec - frameCount / 30) > 1e-8) fail("Shotcraft film render duration does not equal its complete frame count");
  const probe = plainObject(render.probe, "Shotcraft film render.probe");
  if (probe.codec !== "h264" || probe.width !== 1920 || probe.height !== 1080 || probe.fps !== 30 || probe.frameCount !== frameCount || probe.audioStreams !== 0) fail("Shotcraft film probe must prove one picture-only H.264 1920×1080@30 stream with no audio");
  const transitionRows = asArray(manifest.transitions || [], "Shotcraft film manifest.transitions");
  if (hasSourceTransitionPostprocess) {
    const assembly = plainObject(manifest.assembly, "Shotcraft postprocessed Film assembly");
    const assemblyTransitions = asArray(assembly.transitions, "Shotcraft Film assembly.transitions");
    if (assembly.method !== "remotion-composition-with-picture-only-local-base-segments-then-source-transition-postprocess"
      || assembly.audioStream !== "absent" || transitionRows.length === 0 || assemblyTransitions.length !== transitionRows.length) {
      fail("Shotcraft source-transition output kind requires its picture-only postprocess assembly receipt");
    }
    let previousEndFrame = -1;
    for (const [index, raw] of transitionRows.entries()) {
      const transition = plainObject(raw, `Shotcraft film manifest.transitions[${index}]`);
      const range = plainObject(transition.windowFrameRange, `transitions[${index}].windowFrameRange`);
      const startFrame = finite(range.startFrame, `transitions[${index}].windowFrameRange.startFrame`, { min: 0 });
      const endFrame = finite(range.endFrame, `transitions[${index}].windowFrameRange.endFrame`, { min: startFrame + 1 });
      const frameRows = asArray(transition.frames, `transitions[${index}].frames`);
      const assembled = plainObject(assemblyTransitions[index], `assembly.transitions[${index}]`);
      if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrame) || endFrame > frameCount || startFrame < previousEndFrame
        || transition.mode !== "boundary-frame" || transition.method !== "crossfade" || transition.sourceFunction !== "TRANSITIONS.crossfade"
        || transition.windowFrames !== endFrame - startFrame || frameRows.length !== endFrame - startFrame
        || assembled.id !== transition.id || assembled.method !== transition.method || assembled.mode !== transition.mode
        || assembled.sourceFunction !== transition.sourceFunction || canonical(assembled.windowFrameRange) !== canonical(range)) {
        fail("Shotcraft source-transition receipt must describe a non-overlapping, frame-complete pinned boundary crossfade");
      }
      previousEndFrame = endFrame;
    }
  } else if (transitionRows.length) {
    fail("Shotcraft Film manifest with source transitions must declare the postprocess output kind");
  }
  const segments = asArray(manifest.segments, "Shotcraft film manifest.segments");
  if (!segments.length) fail("Shotcraft film manifest.segments must be non-empty");
  const ids = new Set();
  let cursor = 0;
  for (const [index, raw] of segments.entries()) {
    const row = plainObject(raw, `Shotcraft film manifest.segments[${index}]`);
    const id = stableId(row.id, `Shotcraft film manifest.segments[${index}].id`);
    if (ids.has(id)) fail("Shotcraft film manifest has duplicate segment id " + id);
    ids.add(id);
    const range = plainObject(row.frameRange, `Shotcraft film manifest.segments[${index}].frameRange`);
    const start = finite(range.startFrame, `${id}.frameRange.startFrame`, { min: 0 });
    const end = finite(range.endFrame, `${id}.frameRange.endFrame`, { min: start + 1 });
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start !== cursor) fail("Shotcraft film manifest segments must partition adjacent output frames from zero");
    if (row.expectedFrameCount !== end - start || row.observedFrameCount !== end - start) fail("Shotcraft segment frame counts must match the rendered frameRange for " + id);
    cursor = end;
    if (row.baseSource != null) {
      const baseProbe = plainObject(row.baseSource.probe, `${id}.baseSource.probe`);
      if (baseProbe.codec !== "h264" || baseProbe.width !== 1920 || baseProbe.height !== 1080 || baseProbe.fps !== 30 || baseProbe.frameCount !== end - start || baseProbe.audioStreams !== 0) fail("Shotcraft pre-rendered base segment must be picture-only and frame-exact: " + id);
      const outputSha = shaField(row.baseSource.renderedOutputSha256, `${id}.baseSource.renderedOutputSha256`);
      if (outputSha !== shaField(row.baseSource.stagedSha256, `${id}.baseSource.stagedSha256`)) fail("Shotcraft pre-rendered base segment hash changed during staging: " + id);
    }
  }
  if (cursor !== frameCount) fail("Shotcraft manifest segments do not cover the rendered output frame clock");
  const outputPath = manifestPath(baseDir, manifest.output.path, "Shotcraft film manifest.output.path");
  const expectedOutputHash = shaField(manifest.output.sha256, "Shotcraft film manifest.output.sha256");
  const outputFile = await verifyLargeFileHash(outputPath, expectedOutputHash, "Shotcraft picture-only film output");
  const configuredFfmpeg = process.env.MOTION_FFMPEG || "ffmpeg";
  const ffprobe = process.env.MOTION_FFPROBE || (path.isAbsolute(configuredFfmpeg)
    ? path.join(path.dirname(configuredFfmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
    : "ffprobe");
  const probeResult = spawnSync(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", outputPath], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (probeResult.error || probeResult.status !== 0) fail("Shotcraft picture-only output could not be probed: " + (probeResult.error?.message || probeResult.stderr || probeResult.status));
  const actual = JSON.parse(probeResult.stdout);
  const videos = actual.streams.filter((stream) => stream.codec_type === "video");
  const audios = actual.streams.filter((stream) => stream.codec_type === "audio");
  const rate = String(videos[0]?.avg_frame_rate || "").split("/").map(Number);
  const actualFps = rate[1] ? rate[0] / rate[1] : NaN;
  const actualFrames = Number(videos[0]?.nb_read_frames ?? videos[0]?.nb_frames);
  if (videos.length !== 1 || audios.length !== 0 || videos[0]?.codec_name !== "h264" || videos[0]?.width !== 1920 || videos[0]?.height !== 1080 || actualFps !== 30 || actualFrames !== frameCount || Math.abs(Number(actual.format.duration) - durationSec) > 1e-6) fail("Shotcraft picture-only output stream does not match its verified manifest probe/frame clock");
  return { outputPath, expectedOutputHash, frameCount, segments, segmentIds: ids, verifiedFiles:[outputFile] };
}

function validateFilmMaps(rows, scene) {
  asArray(rows, "film manifest audioTimeMaps");
  const fps = finite(scene.fps, "compiled audio-event scene fps", { min: 0.001 });
  const maps = new Map();
  const segments = new Set();
  for (const [index, raw] of rows.entries()) {
    const row = plainObject(raw, `film manifest audioTimeMaps[${index}]`);
    const id = stableId(row.id, `audioTimeMaps[${index}].id`);
    const segmentId = stableId(row.segmentId, `audioTimeMaps[${index}].segmentId`);
    if (maps.has(id)) fail("Film manifest has duplicate audio timeMap id: " + id);
    if (segments.has(segmentId)) fail("Film manifest assigns more than one audio timeMap to segment " + segmentId);
    segments.add(segmentId);
    const localStartSec = finite(row.localStartSec, `${id}.localStartSec`, { min: 0 });
    const localEndSec = finite(row.localEndSec, `${id}.localEndSec`, { min: localStartSec });
    const filmStartSec = finite(row.filmStartSec, `${id}.filmStartSec`, { min: 0 });
    const speed = finite(row.speed, `${id}.speed`, { min: 0.0625, max: 16 });
    const frameRange = plainObject(row.frameRange, `${id}.frameRange`);
    const startFrame = finite(frameRange.startFrame, `${id}.frameRange.startFrame`, { min: 0 });
    const endFrame = finite(frameRange.endFrame, `${id}.frameRange.endFrame`, { min: startFrame + 1 });
    if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame)) fail(`${id}.frameRange must use integer frame boundaries`);
    const filmDurationSec = (endFrame - startFrame) / fps;
    const localDurationSec = localEndSec - localStartSec;
    let exactGlobalDurationSec;
    let exactGlobalStartSec;
    if (row.sourceRange != null) {
      const range = plainObject(row.sourceRange, `${id}.sourceRange`);
      if (range.startSample != null || range.endSample != null || range.sampleRateHz != null) {
        const rate = finite(range.sampleRateHz, `${id}.sourceRange.sampleRateHz`, { min: 1 });
        const start = finite(range.startSample, `${id}.sourceRange.startSample`, { min: 0 });
        const end = finite(range.endSample, `${id}.sourceRange.endSample`, { min: start + 1 });
        if (!Number.isInteger(start) || !Number.isInteger(end) || row.sourceRange.startSec != null || row.sourceRange.endSec != null) fail(`${id}.sourceRange must use exactly one complete sample or second range`);
        exactGlobalStartSec = start / rate;
        exactGlobalDurationSec = (end - start) / rate;
      } else {
        const start = finite(range.startSec, `${id}.sourceRange.startSec`, { min: 0 });
        const end = finite(range.endSec, `${id}.sourceRange.endSec`, { min: start + 1e-9 });
        exactGlobalStartSec = start;
        exactGlobalDurationSec = end - start;
      }
    } else fail(`${id}.sourceRange is required to verify the compiled segment clock`);
    if (Math.abs(filmStartSec - exactGlobalStartSec) > 1e-8) fail(`${id}.filmStartSec must preserve the exact source-range start, independently of output-frame quantization`);
    const exactGlobalEndSec = exactGlobalStartSec + exactGlobalDurationSec;
    const expectedStartFrame = Math.ceil(exactGlobalStartSec * fps - 1e-9);
    const expectedEndFrame = Math.ceil(exactGlobalEndSec * fps - 1e-9);
    if (startFrame !== expectedStartFrame || endFrame !== expectedEndFrame) fail(`${id}.frameRange must independently ceil-quantize the exact sourceRange boundaries at the compiled scene fps`);
    const frameStartResidualSec = startFrame / fps - exactGlobalStartSec;
    const frameEndResidualSec = endFrame / fps - exactGlobalEndSec;
    if (frameStartResidualSec < -1e-9 || frameStartResidualSec >= 1 / fps + 1e-9 || frameEndResidualSec < -1e-9 || frameEndResidualSec >= 1 / fps + 1e-9) fail(`${id}.frameRange boundary residuals must be non-negative and less than one frame`);
    finite(row.roundingResidualSamples, `${id}.roundingResidualSamples`);
    if (row.frameStartResidualSec != null && Math.abs(finite(row.frameStartResidualSec, `${id}.frameStartResidualSec`) - frameStartResidualSec) > 1e-8) fail(`${id}.frameStartResidualSec disagrees with the exact source anchor and ceil-quantized frame boundary`);
    if (row.frameEndResidualSec != null && Math.abs(finite(row.frameEndResidualSec, `${id}.frameEndResidualSec`) - frameEndResidualSec) > 1e-8) fail(`${id}.frameEndResidualSec disagrees with the exact source end and ceil-quantized frame boundary`);
    if (Math.abs(exactGlobalDurationSec - filmDurationSec) > 1 / fps + 1e-8) fail(`${id}.sourceRange and frameRange differ by more than one frame of recorded ceil quantization`);
    if (Math.abs(speed - localDurationSec / exactGlobalDurationSec) > 1e-8) fail(`${id}.speed does not equal renderedLocalDurationSec / exactGlobalDurationSec`);
    // Film's canonical map carries optional frame residual fields as source
    // evidence. Preserve their exact presence and values (including zero) so
    // the generated audio plan and receipt can be checked byte-for-structure
    // against the manifest by the final mixer.
    maps.set(id, {
      ...row,
      id, segmentId, localStartSec, localEndSec, filmStartSec, speed,
      sourceRange: { ...row.sourceRange },
      frameRange: { ...frameRange, startFrame, endFrame },
    });
  }
  return maps;
}

async function verifyFilmManifest(file) {
  const manifestFile = path.resolve(file);
  const manifest = await readJson(manifestFile, "film manifest");
  plainObject(manifest, "film manifest");
  const isShotcraftV2 = ["laohu.motion-film-manifest/1", "laohu.motion-film-manifest/2"].includes(manifest.format);
  const hasNativeBaseContractV2 = manifest.format === "laohu.motion-film-manifest/2";
  if (!["laohu.huashu-om-film-manifest/1", "laohu.motion-film-manifest/1", "laohu.motion-film-manifest/2"].includes(manifest.format)) fail("Unsupported film manifest format");
  const source = plainObject(manifest.source, "film manifest.source");
  if (!["film-global", "asrcut-v2"].includes(source.clockKind)) fail("film manifest.source.clockKind must be film-global or asrcut-v2");
  const baseDir = path.dirname(manifestFile);
  const blueprintPath = manifestPath(baseDir, source.blueprintPath, "film manifest.source.blueprintPath");
  const blueprint = await verifyFileHash(blueprintPath, source.blueprintSha256, "film blueprint");
  const picture = isShotcraftV2 ? await verifyMotionFilmPicture(manifest, baseDir, source.clockKind) : null;
  const sceneRecord = plainObject(manifest.audioEventScene, "film manifest.audioEventScene");
  if (sceneRecord.format !== "motion-scene-v1") fail("film manifest.audioEventScene.format must be motion-scene-v1");
  const scenePath = manifestPath(baseDir, sceneRecord.path, "film manifest.audioEventScene.path");
  const sceneFile = await verifyFileHash(scenePath, sceneRecord.sha256, "compiled audio-event scene");
  const scene = JSON.parse(sceneFile.bytes.toString("utf8"));
  plainObject(scene, "compiled audio-event scene");
  if (scene.version !== 1 || scene.timeBasis !== "film-global") fail("compiled audio-event scene must use version 1 and declare timeBasis film-global");
  finite(scene.duration, "compiled audio-event scene.duration", { min: 0.001 });
  const sceneEvents = findSceneAudioEvents(scene);
  const maps = validateFilmMaps(manifest.audioTimeMaps, scene);
  if (isShotcraftV2) {
    const mapBySegment = new Map([...maps.values()].map((row) => [row.segmentId, row]));
    if (mapBySegment.size !== picture.segmentIds.size) fail("Shotcraft audioTimeMaps must cover every rendered segment exactly once");
    for (const segment of picture.segments) {
      const map = mapBySegment.get(segment.id);
      if (!map) fail("Shotcraft audioTimeMaps is missing segment " + segment.id);
      if (map.id !== `time:${segment.id}` || canonical(map.frameRange) !== canonical(segment.frameRange)
        || canonical(map.sourceRange) !== canonical(segment.sourceRange)) fail("Shotcraft audioTimeMap does not match its exact segment frame/source ranges: " + segment.id);
    }
  }
  const sourceRows = asArray(manifest.sourceScenes, "film manifest.sourceScenes");
  const sourceScenes = new Map();
  const verifiedFiles = [{ path: manifestFile }, blueprint, sceneFile, ...(picture?.verifiedFiles || [])];
  for (const [index, raw] of sourceRows.entries()) {
    const row = plainObject(raw, `film manifest.sourceScenes[${index}]`);
    const segmentId = stableId(row.segmentId, `sourceScenes[${index}].segmentId`);
    if (sourceScenes.has(segmentId)) fail("Film manifest has duplicate sourceScenes segmentId " + segmentId);
    const sourcePath = manifestPath(baseDir, row.path, `sourceScenes[${index}].path`);
    const verified = await verifyFileHash(sourcePath, row.sha256, "source scene " + segmentId);
    let sourceSceneValue;
    try { sourceSceneValue = JSON.parse(verified.bytes.toString("utf8")); }
    catch (error) { fail("Verified source scene is not JSON for " + segmentId + ": " + error.message); }
    plainObject(sourceSceneValue, "source scene " + segmentId);
    sourceScenes.set(segmentId, { ...row, path: sourcePath, sha256: verified.sha256, scene: sourceSceneValue });
    verifiedFiles.push(verified);
    if (isShotcraftV2 && (!picture.segmentIds.has(segmentId) || sourcePath !== scenePath || verified.sha256 !== sceneFile.sha256)) fail("Shotcraft sourceScenes must point to the pinned canonical event scene and a rendered segment: " + segmentId);
  }
  const nativeBaseSources = new Map();
  if (hasNativeBaseContractV2) {
    const nativeRows = asArray(manifest.nativeBaseSources, "Film /2 manifest.nativeBaseSources");
    const filmSegments = asArray(manifest.segments, "Film /2 manifest.segments");
    const expectedSegments = new Map(filmSegments.filter((row) => row.renderer === "laohu-native-om-template").map((row) => [row.id, row]));
    if (nativeRows.length !== expectedSegments.size) fail("Film /2 nativeBaseSources must cover each full OM base segment exactly once");
    for (const [index, raw] of nativeRows.entries()) {
      const row = plainObject(raw, `nativeBaseSources[${index}]`);
      const segmentId = stableId(row.segmentId, `nativeBaseSources[${index}].segmentId`);
      const filmSegment = expectedSegments.get(segmentId);
      if (!filmSegment || nativeBaseSources.has(segmentId)) fail("Film /2 nativeBaseSources has a duplicate or non-OM segment " + segmentId);
      if (row.renderer !== "laohu-native-om-template" || row.childSegmentId !== segmentId) fail("Film /2 nativeBaseSources must bind the canonical full OM renderer and matching child segment " + segmentId);
      const templateId = stableId(row.templateId, `nativeBaseSources[${index}].templateId`);
      if (filmSegment.baseSource?.renderer !== row.renderer || filmSegment.baseSource?.templateId !== templateId) fail("Film /2 nativeBaseSources template identity differs from the rendered base segment " + segmentId);
      const childManifestPath = manifestPath(baseDir, row.childFilmManifestPath, `nativeBaseSources[${index}].childFilmManifestPath`);
      const childManifestFile = await verifyFileHash(childManifestPath, row.childFilmManifestSha256, "native OM child Film manifest " + segmentId);
      const childManifest = JSON.parse(childManifestFile.bytes.toString("utf8"));
      if (childManifest.format !== "laohu.huashu-om-film-manifest/1") fail("Film /2 native base must retain the verified complete OM `/1` child Film receipt: " + segmentId);
      const childSegment = (childManifest.segments || []).find((item) => item.id === row.childSegmentId);
      if (!childSegment || childSegment.renderer !== "laohu-native-om-template" || childSegment.template?.id !== templateId) fail("Film /2 native base child receipt does not match the selected complete OM source template: " + segmentId);
      const childSourceScenePath = manifestPath(baseDir, row.sourceScenePath, `nativeBaseSources[${index}].sourceScenePath`);
      const childSegmentScenePath = manifestPath(path.dirname(childManifestPath), childSegment.sourceScenePath, "native OM child segment sourceScenePath");
      const sourceSceneFile = await verifyFileHash(childSourceScenePath, row.sourceSceneSha256, "native OM child source scene " + segmentId);
      if (childSegmentScenePath !== childSourceScenePath || childSegment.sourceSceneSha256 !== sourceSceneFile.sha256) fail("Film /2 native base source scene differs from the child segment receipt: " + segmentId);
      const childSourceSceneRow = (childManifest.sourceScenes || []).find((item) => item.segmentId === segmentId);
      if (!childSourceSceneRow || manifestPath(path.dirname(childManifestPath), childSourceSceneRow.path, "native OM child sourceScenes.path") !== childSourceScenePath || childSourceSceneRow.sha256 !== sourceSceneFile.sha256) fail("Film /2 native base source scene is not present in the child's sourceScenes ledger: " + segmentId);
      const sourceScene = JSON.parse(sourceSceneFile.bytes.toString("utf8"));
      const runtime = plainObject(sourceScene.huashuMotionRuntime, "Film /2 native OM source runtime " + segmentId);
      if (runtime.format !== "laohu.huashu-native-om-runtime-probe/1"
          || sha256(Buffer.from(canonical(runtime), "utf8")) !== shaField(row.sourceRuntimeProbeSha256, `nativeBaseSources[${index}].sourceRuntimeProbeSha256`)) fail("Film /2 native base original OM runtime probe hash is missing or stale: " + segmentId);
      if (canonical(row.sourceCueBindings || null) !== canonical(childSegment.sourceCueBindings || null)
          || canonical(row.sourceCueBindings || null) !== canonical(runtime.sourceCueBindings || null)) fail("Film /2 native base sourceCueBindings differ across the source scene and child receipt: " + segmentId);
      const childOutputPath = manifestPath(path.dirname(childManifestPath), childManifest.output?.path, "native OM child output.path");
      const childOutputSha256 = shaField(childManifest.output?.sha256, "native OM child output.sha256");
      if (childOutputSha256 !== shaField(row.childOutputSha256, `nativeBaseSources[${index}].childOutputSha256`)
          || childOutputSha256 !== shaField(filmSegment.baseSource?.renderedOutputSha256, `Film segment ${segmentId}.baseSource.renderedOutputSha256`)) fail("Film /2 native base child picture hash differs from its rendered segment receipt: " + segmentId);
      const childOutputFile = await verifyLargeFileHash(childOutputPath, childOutputSha256, "native OM child picture " + segmentId);
      verifiedFiles.push(childManifestFile, sourceSceneFile, childOutputFile);
      nativeBaseSources.set(segmentId, {
        ...row,
        childFilmManifestPath: childManifestPath,
        childManifest,
        path:childSourceScenePath,
        sha256:sourceSceneFile.sha256,
        scene:sourceScene,
        runtime,
      });
    }
    for (const segmentId of expectedSegments.keys()) if (!nativeBaseSources.has(segmentId)) fail("Film /2 is missing nativeBaseSources for its full OM segment " + segmentId);
  } else if (Object.hasOwn(manifest, "nativeBaseSources")) {
    fail("nativeBaseSources requires the Film manifest/2 audio ownership contract; legacy manifest consumers must not ignore it");
  }
  const nativeSourceCompositions = asArray(scene.nativeSourceCompositions || [], "compiled audio-event scene.nativeSourceCompositions");
  const sourceCompositionSegments = new Set();
  for (const [index, raw] of nativeSourceCompositions.entries()) {
    const row = plainObject(raw, `compiled audio-event scene.nativeSourceCompositions[${index}]`);
    const segmentId = stableId(row.segmentId, `nativeSourceCompositions[${index}].segmentId`);
    if (sourceCompositionSegments.has(segmentId)) fail("compiled native OM score music contains more than one source composition for segment " + segmentId);
    sourceCompositionSegments.add(segmentId);
    const sourceScene = (hasNativeBaseContractV2 ? nativeBaseSources : sourceScenes).get(segmentId);
    const timeMapId = stableId(row.timeMapId, `nativeSourceCompositions[${index}].timeMapId`);
    const mapping = maps.get(timeMapId);
    if (!sourceScene || sourceScene.path !== manifestPath(baseDir, row.sourceScenePath, `nativeSourceCompositions[${index}].sourceScenePath`)
      || sourceScene.sha256 !== shaField(row.sourceSceneSha256, `nativeSourceCompositions[${index}].sourceSceneSha256`)) fail("native OM source composition does not match its verified source scene: " + segmentId);
    if (!mapping || mapping.segmentId !== segmentId || timeMapId !== `time:${segmentId}`) fail("native OM source composition must use its exact canonical segment timeMap: " + segmentId);
    finite(row.durationSec, `nativeSourceCompositions[${index}].durationSec`, { min: 0.001 });
    if (typeof row.scoreText !== "string" || !row.scoreText.trim() || sha256(Buffer.from(row.scoreText, "utf8")) !== shaField(row.scoreSha256, `nativeSourceCompositions[${index}].scoreSha256`)) fail("native OM source score bytes/hash do not match for segment " + segmentId);
    plainObject(row.labels, `nativeSourceCompositions[${index}].labels`);
    plainObject(row.marks, `nativeSourceCompositions[${index}].marks`);
    if (row.seed == null || !(typeof row.seed === "string" || typeof row.seed === "number" && Number.isFinite(row.seed))) fail("native OM source composition seed is missing or invalid for segment " + segmentId);
    plainObject(row.keyContext, `nativeSourceCompositions[${index}].keyContext`);
    asArray(row.expectedCues, `nativeSourceCompositions[${index}].expectedCues`);
  }
  const nativeSourcePresetPlans = asArray(scene.nativeSourcePresetPlans || [], "compiled audio-event scene.nativeSourcePresetPlans");
  const manifestNativeSourcePresetPlans = asArray(manifest.nativeSourcePresetPlans || [], "film manifest.nativeSourcePresetPlans");
  if (canonical(manifestNativeSourcePresetPlans) !== canonical(nativeSourcePresetPlans)) fail("film manifest.nativeSourcePresetPlans must match the pinned compiled audio-event scene");
  const sourcePresetSegments = new Set();
  for (const [index, raw] of nativeSourcePresetPlans.entries()) {
    const row = plainObject(raw, `nativeSourcePresetPlans[${index}]`);
    const segmentId = stableId(row.segmentId, `nativeSourcePresetPlans[${index}].segmentId`);
    if (sourcePresetSegments.has(segmentId)) fail("compiled native OM default music contains more than one preset plan for segment " + segmentId);
    if (sourceCompositionSegments.has(segmentId)) fail("a native OM segment cannot register both ABC composition and default preset music: " + segmentId);
    sourcePresetSegments.add(segmentId);
    const sourceScene = (hasNativeBaseContractV2 ? nativeBaseSources : sourceScenes).get(segmentId);
    const timeMapId = stableId(row.timeMapId, `nativeSourcePresetPlans[${index}].timeMapId`);
    const mapping = maps.get(timeMapId);
    if (!sourceScene || sourceScene.path !== manifestPath(baseDir, row.sourceScenePath, `nativeSourcePresetPlans[${index}].sourceScenePath`)
      || sourceScene.sha256 !== shaField(row.sourceSceneSha256, `nativeSourcePresetPlans[${index}].sourceSceneSha256`)) fail("native OM default music plan does not match its verified source scene: " + segmentId);
    if (!mapping || mapping.segmentId !== segmentId || timeMapId !== `time:${segmentId}`) fail("native OM default music plan must use its exact canonical segment timeMap: " + segmentId);
    const runtime = plainObject(sourceScene.scene.huashuMotionRuntime, "native OM source runtime " + segmentId);
    if (runtime.format !== "laohu.huashu-native-om-runtime-probe/1" || runtime.sourceScore?.scoreText || runtime.sound?.music?.off) fail("native OM default music plan requires a no-ABC, music-on original source scene: " + segmentId);
    const sourceDeclaration = plainObject(row.sourceDeclaration, `nativeSourcePresetPlans[${index}].sourceDeclaration`);
    const runtimeDeclaration = plainObject(runtime.sourceDeclaration, `source scene ${segmentId}.huashuMotionRuntime.sourceDeclaration`);
    finite(sourceDeclaration.duration, `nativeSourcePresetPlans[${index}].sourceDeclaration.duration`, { min: 0.001 });
    stableId(sourceDeclaration.id, `nativeSourcePresetPlans[${index}].sourceDeclaration.id`);
    plainObject(sourceDeclaration.labels, `nativeSourcePresetPlans[${index}].sourceDeclaration.labels`);
    asArray(sourceDeclaration.hits, `nativeSourcePresetPlans[${index}].sourceDeclaration.hits`);
    plainObject(sourceDeclaration.music, `nativeSourcePresetPlans[${index}].sourceDeclaration.music`);
    if (sourceDeclaration.music.off) fail("native OM default music plan cannot claim source music.off=true: " + segmentId);
    if (canonical(sourceDeclaration) !== canonical(runtimeDeclaration)) fail("native OM source p0 declaration differs from the verified source runtime for segment " + segmentId);
    if (canonical(sourceDeclaration.labels) !== canonical(runtime.labels) || canonical(sourceDeclaration.music) !== canonical(runtime.sound?.music || {})) fail("native OM source p0 labels/music differ from the initialized original runtime for segment " + segmentId);
    if (sha256(Buffer.from(canonical(sourceDeclaration), "utf8")) !== shaField(row.sourceDeclarationSha256, `nativeSourcePresetPlans[${index}].sourceDeclarationSha256`)
      || runtime.sourceDeclarationSha256 !== row.sourceDeclarationSha256) fail("native OM source p0 declaration hash does not match for segment " + segmentId);
    const sourcePlan = plainObject(row.sourcePlan, `nativeSourcePresetPlans[${index}].sourcePlan`);
    const runtimePlan = plainObject(runtime.sourcePlan, `source scene ${segmentId}.huashuMotionRuntime.sourcePlan`);
    if (canonical(sourcePlan) !== canonical(runtimePlan)) fail("native OM source score.plan snapshot differs from the verified runtime for segment " + segmentId);
    if (sha256(Buffer.from(canonical(sourcePlan), "utf8")) !== shaField(row.sourcePlanSha256, `nativeSourcePresetPlans[${index}].sourcePlanSha256`)
      || runtime.sourcePlanSha256 !== row.sourcePlanSha256) fail("native OM source score.plan hash does not match for segment " + segmentId);
    const durationSec = finite(row.durationSec, `nativeSourcePresetPlans[${index}].durationSec`, { min: 0.001 });
    if (Math.abs(durationSec - sourceDeclaration.duration) > 1 / manifest.render.fps + 1e-8 || Math.abs(durationSec - finite(sourcePlan.duration, `nativeSourcePresetPlans[${index}].sourcePlan.duration`, { min: 0.001 })) > 1e-8) fail("native OM source score.plan duration differs from its original p0 declaration for segment " + segmentId);
    const sourceHitRows = asArray(sourceScene.scene.audioEvents, `source scene ${segmentId}.audioEvents`).filter((event) => event?.sourceAudio?.kind === "declared-sfx");
    if (sourceHitRows.length !== sourceDeclaration.hits.length) fail("native OM default music source hit list differs from the original canonical SFX event count for segment " + segmentId);
    for (const [hitIndex, hitValue] of sourceDeclaration.hits.entries()) {
      const hit = plainObject(hitValue, `nativeSourcePresetPlans[${index}].sourceDeclaration.hits[${hitIndex}]`);
      const eventId = `om.${safeStem(segmentId)}.declared-sfx.${hitIndex}`;
      const sourceEvent = sourceHitRows.find((event) => event.id === eventId);
      if (!sourceEvent || sourceEvent.sourceAudio.sourceHitOrder !== hitIndex || sourceEvent.sourceAudio.name !== hit.name
        || Math.abs(finite(sourceEvent.timeSec, `source scene event ${eventId}.timeSec`) - finite(hit.at, `source hit ${eventId}.at`)) > 1 / RATE) {
        fail("native OM default music source hit timeline differs from the canonical original SFX events for segment " + segmentId);
      }
    }
  }
  const bindings = new Map();
  for (const [index, raw] of asArray(manifest.audioEventBindings, "film manifest.audioEventBindings").entries()) {
    const row = plainObject(raw, `film manifest.audioEventBindings[${index}]`);
    const eventId = stableId(row.eventId, `audioEventBindings[${index}].eventId`);
    const sourceEventId = stableId(row.sourceEventId, `audioEventBindings[${index}].sourceEventId`);
    const segmentId = stableId(row.segmentId, `audioEventBindings[${index}].segmentId`);
    if (bindings.has(eventId)) fail("Film manifest has ambiguous event-to-clock binding for " + eventId);
    if (eventId !== sourceEventId) fail("Compiled audio event ID must preserve its source stable ID; refusing an unsynchronized ID rewrite for " + eventId);
    // Event bindings describe the one compiled, canonical Film event scene.
    // Native source context remains separately addressable through
    // nativeBaseSources for original p0/score/SFX and sound.mixdown ownership.
    const sourceScene = sourceScenes.get(segmentId);
    if (!sourceScene || sourceScene.path !== manifestPath(baseDir, row.sourceScenePath, `audioEventBindings[${index}].sourceScenePath`)
      || sourceScene.sha256 !== shaField(row.sourceSceneSha256, `audioEventBindings[${index}].sourceSceneSha256`)) {
      fail("audioEventBindings entry does not match its verified sourceScenes record: " + eventId);
    }
    const timeBasis = row.sourceTimeBasis;
    if (!["film-global", "scene-local"].includes(timeBasis)) fail("audioEventBindings[" + index + "].sourceTimeBasis is unknown");
    const timeMapId = row.timeMapId == null ? null : stableId(row.timeMapId, `audioEventBindings[${index}].timeMapId`);
    if (timeBasis === "scene-local" && (!timeMapId || !maps.has(timeMapId) || maps.get(timeMapId).segmentId !== segmentId)) fail("Scene-local event " + eventId + " must resolve to exactly one segment timeMap");
    if (timeBasis === "film-global" && timeMapId) fail("Film-global event " + eventId + " must not carry a local timeMapId");
    const phaseId = row.compiledPhaseId == null ? null : stableId(row.compiledPhaseId, `audioEventBindings[${index}].compiledPhaseId`);
    const sourcePhaseId = row.sourcePhaseId == null ? null : stableId(row.sourcePhaseId, `audioEventBindings[${index}].sourcePhaseId`);
    if (phaseId !== sourcePhaseId) fail("Compiled phase ID must preserve its source stable ID for event " + eventId);
    const actual = sceneEvents.get(eventId);
    if (!actual) fail("Compiled event scene is missing manifest-bound event " + eventId);
    if (actual.timeBasis !== timeBasis || actual.phaseId !== phaseId) fail("Compiled event time basis/phase disagrees with its film manifest binding: " + eventId);
    bindings.set(eventId, { ...row, eventId, segmentId, timeBasis, timeMapId, phaseId, sourceEvent: actual });
  }
  for (const [eventId, actual] of sceneEvents) {
    if (!bindings.has(eventId)) fail("Compiled audio-event scene contains an event with no unique film-manifest binding: " + eventId);
    if (actual.timeBasis === "scene-local" && !bindings.get(eventId).timeMapId) fail("Compiled scene-local event has no unique timeMapId: " + eventId);
  }
  const nativeSourceSfxOnlyPlans = [];
  for (const [index, raw] of asArray(manifest.segments || [], "film manifest.segments").entries()) {
    const segment = plainObject(raw, `film manifest.segments[${index}]`);
    if (segment.renderer !== "laohu-native-om-template") continue;
    const segmentId = stableId(segment.id, `film manifest.segments[${index}].id`);
    const sourceScene = (hasNativeBaseContractV2 ? nativeBaseSources : sourceScenes).get(segmentId);
    if (!sourceScene) continue;
    const runtime = sourceScene.scene.huashuMotionRuntime;
    if (runtime?.format !== "laohu.huashu-native-om-runtime-probe/1"
        || runtime.sourceDeclaration?.music?.off !== true
        || runtime.sourceScore?.scoreText || runtime.composer?.scoreText) continue;
    const sourceHitRows = asArray(sourceScene.scene.audioEvents || [], `source scene ${segmentId}.audioEvents`)
      .filter((event) => event?.sourceAudio?.kind === "declared-sfx");
    if (!sourceHitRows.length) continue;
    if (hasNativeBaseContractV2) {
      if (sourceScene.path !== manifestPath(baseDir, sourceScene.sourceScenePath, `nativeBaseSources[${segmentId}].sourceScenePath`)) fail("Native OM music-off SFX source does not match its verified nativeBaseSources row: " + segmentId);
    } else {
      if (typeof segment.sourceScenePath !== "string" || !segment.sourceScenePath || path.isAbsolute(segment.sourceScenePath)) {
        fail("Native OM music-off SFX source must retain its relative Film-manifest sourceScenePath: " + segmentId);
      }
      if (sourceScene.path !== manifestPath(baseDir, segment.sourceScenePath, `film manifest.segments[${index}].sourceScenePath`)) {
        fail("Native OM music-off SFX source does not match its rendered segment source scene: " + segmentId);
      }
    }
    const timeMapId = `time:${segmentId}`;
    const mapping = maps.get(timeMapId);
    if (!mapping || mapping.segmentId !== segmentId || mapping.localStartSec !== 0) {
      fail("Native OM music-off SFX source must have its exact source-zero Film timeMap: " + segmentId);
    }
    if (!hasNativeBaseContractV2 && segment.sourceSceneSha256 != null && sourceScene.sha256 !== shaField(segment.sourceSceneSha256, `film manifest.segments[${index}].sourceSceneSha256`)) {
      fail("Native OM music-off SFX source scene hash differs from its rendered segment: " + segmentId);
    }
    nativeSourceSfxOnlyPlans.push({
      segmentId, sourceScenePath: hasNativeBaseContractV2 ? sourceScene.sourceScenePath : segment.sourceScenePath, sourceSceneSha256: sourceScene.sha256,
      sourceDeclarationSha256: runtime.sourceDeclarationSha256,
      sourcePlanSha256: runtime.sourcePlanSha256,
      durationSec: runtime.sourceDeclaration.duration,
      timeMapId,
    });
  }
  const optionalHashFiles = [];
  for (const [pathKey, hashKey, label] of [["timelinePath", "timelineSha256", "ASR canonical timeline"], ["editPlanPath", "editPlanSha256", "ASR edit plan"]]) {
    const pathValue = source[pathKey], hashValue = source[hashKey];
    if ((pathValue == null) !== (hashValue == null)) fail(`film manifest.source.${pathKey}/${hashKey} must be supplied together`);
    if (pathValue != null) optionalHashFiles.push(await verifyFileHash(manifestPath(baseDir, pathValue, `film manifest.source.${pathKey}`), hashValue, label));
  }
  if (source.clockKind === "asrcut-v2" && (!source.timelinePath || !source.editPlanPath)) fail("asrcut-v2 film manifests must pin both canonical timeline and edit plan");
  verifiedFiles.push(...optionalHashFiles);
  return { manifest, manifestPath: manifestFile, source, blueprintPath, blueprintSha256: blueprint.sha256, scene, scenePath, sceneSha256: sceneFile.sha256, maps, bindings, sourceScenes, nativeBaseSources, nativeSourceCompositions, nativeSourcePresetPlans, nativeSourceSfxOnlyPlans, verifiedFiles };
}

// Maintenance-only comparator for parity/native-source evals. Production paths use
// loadLocalAudioRuntime() and never call this pinned source loader.
async function loadUpstream() {
  if (!pinnedSourceRoot) fail("MOTION_SOURCE_ROOT is unset; pinned-source comparison is unavailable");
  // samples.js falls back to a home-directory pack unless this is set before its first import.
  process.env.OM_SAMPLES = "off";
  delete process.env.LAOHU_REQUIRE_RECORDED;
  const libDir = path.join(pinnedSourceRoot, "cli/lib");
  const [sound, composed, score, dsp] = await Promise.all([
    import(pathToFileURL(path.join(libDir, "sound.js")).href),
    import(pathToFileURL(path.join(libDir, "composed.js")).href),
    import(pathToFileURL(path.join(libDir, "score.js")).href),
    import(pathToFileURL(path.join(libDir, "dsp.js")).href),
  ]);
  for (const [name, value] of [["SFX", sound.SFX], ["KITS", sound.KITS], ["Track", sound.Track], ["toWav", sound.toWav], ["mixdown", sound.mixdown], ["renderComposed", composed.renderComposed], ["deg", score.deg], ["mtof", dsp.mtof], ["rng", dsp.rng]]) {
    if (!value) fail("Pinned Huashu Motion public audio API is missing export " + name);
  }
  if (sound.RATE !== RATE || dsp.RATE !== RATE) fail("Huashu Motion audio sample rate differs from the audio-plan 48 kHz contract");
  return { sound, composed, score, dsp, samples: null };
}

function nativeSourceMixdownEligibility(request, validatedRequest, basePlan, baseMusicTracks) {
  const reasons = [];
  if (validatedRequest.composition || validatedRequest.musicPreset) reasons.push("explicit-music-request");
  if (validatedRequest.manualRows.length) reasons.push("explicit-sfx-events");
  if (validatedRequest.musicMixGainDb !== 0) reasons.push("separate-music-mix-gain");
  if (baseMusicTracks.length) reasons.push("existing-music-track-preserved");
  const tracks = basePlan.tracks || [];
  const voiceTracks = tracks.filter((track) => track.bus === "voice");
  const otherTracks = tracks.filter((track) => track.bus !== "voice");
  if (otherTracks.length) reasons.push("existing-nonvoice-audio-track");
  if (voiceTracks.length > 1) reasons.push("multiple-voice-tracks");
  if (voiceTracks.length === 1 && !voiceTracks[0].locked) reasons.push("voice-track-not-locked");
  if (voiceTracks.length === 1 && voiceTracks[0].locked && voiceTracks[0].startSec !== 0) reasons.push("voice-track-not-film-origin");
  if (voiceTracks.length === 1) {
    const voiceAsset = (basePlan.assets || []).find((asset) => asset.id === voiceTracks[0].assetId);
    if (!voiceTrackUsesUntrimmedOneXSource(voiceTracks[0], voiceAsset)) reasons.push("voice-track-transform-not-covered-by-source-loudness-measurement");
  }
  if (voiceTracks.length === 1 && !(basePlan.voiceWindows || []).length) reasons.push("voice-track-without-voice-windows");
  if (!voiceTracks.length && (basePlan.voiceWindows || []).length) reasons.push("voice-windows-without-locked-voice-track");
  if ((basePlan.events || []).length) reasons.push("existing-sfx-events");
  if ((basePlan.automation || []).length) reasons.push("music-automation");
  if (basePlan.ducking != null) reasons.push("voice-ducking");
  return {
    eligible: reasons.length === 0,
    reasons,
    requestFormat: request.format,
    voiceTrackId: voiceTracks.length === 1 ? voiceTracks[0].id : null,
    sourceMixdownSupportsVoiceWindows: voiceTracks.length === 1 && (basePlan.voiceWindows || []).length > 0,
  };
}

function requestGeneratedSourceGroupEligibility({ validatedRequest, basePlan, baseMusicTracks, nativeSourceEvents }) {
  const reasons = [];
  if (validatedRequest.apiVersion !== 2) reasons.push("requires-audio-request-v2");
  if (!validatedRequest.musicPreset) reasons.push("requires-one-generated-music-preset");
  if (validatedRequest.composition) reasons.push("arbitrary-composition-not-supported-in-request-generated-group");
  if (validatedRequest.musicPreset?.selectedMusicTrackId) reasons.push("selected-existing-music-track");
  if (validatedRequest.musicPreset?.samples) reasons.push("recorded-sample-packs-not-supported-in-request-generated-group");
  if (baseMusicTracks.length) reasons.push("existing-music-track");
  const voiceTracks = (basePlan.tracks || []).filter((track) => track.bus === "voice");
  if ((basePlan.tracks || []).some((track) => track.bus !== "voice")) reasons.push("existing-nonvoice-track");
  if (voiceTracks.length > 1) reasons.push("multiple-voice-tracks");
  if (voiceTracks.length === 1 && !voiceTracks[0].locked) reasons.push("voice-track-not-locked");
  if (voiceTracks.length === 1 && voiceTracks[0].startSec !== 0) reasons.push("voice-track-not-at-film-origin");
  if (voiceTracks.length === 1) {
    const voiceAsset = (basePlan.assets || []).find((asset) => asset.id === voiceTracks[0].assetId);
    if (!voiceTrackUsesUntrimmedOneXSource(voiceTracks[0], voiceAsset)) reasons.push("voice-track-transform-not-covered-by-source-loudness-measurement");
  }
  if (voiceTracks.length === 1 && !(basePlan.voiceWindows || []).length) reasons.push("voice-track-without-voice-windows");
  if (!voiceTracks.length && (basePlan.voiceWindows || []).length) reasons.push("voice-windows-without-locked-voice-track");
  if ((basePlan.events || []).length) reasons.push("existing-audio-plan-events");
  if ((basePlan.automation || []).length) reasons.push("audio-plan-automation");
  if (basePlan.ducking != null) reasons.push("audio-plan-ducking");
  if (nativeSourceEvents.length) reasons.push("native-source-sfx-present");
  if (validatedRequest.manualRows.some((row) => row.seed != null)) reasons.push("custom-sfx-seed-not-source-equivalent");
  if (validatedRequest.manualRows.some((row) => Number(row.mixGainDb || 0) !== 0)) reasons.push("post-mix-sfx-gain-not-source-equivalent");
  return { eligible: reasons.length === 0, selected: false, reasons, format: "laohu.motion.request-generated-source-group/1" };
}

function finalizeRequestGeneratedSourceGroupEligibility(selection, { validatedRequest, presetPlan, manualRows, durationSec }) {
  const reasons = [...selection.reasons];
  if (!presetPlan || Math.abs(presetPlan.duration - durationSec) > 1e-8) reasons.push("preset-duration-does-not-cover-full-film");
  if (presetPlan && manualRows.some((row) => row.kit !== presetPlan.kit)) reasons.push("sfx-kit-differs-from-source-preset-kit");
  if (presetPlan && validatedRequest.keyContextProvided
      && (validatedRequest.keyContext.rootMidi !== presetPlan.root || validatedRequest.keyContext.scale !== presetPlan.scale)) {
    reasons.push("explicit-key-context-differs-from-source-preset-key");
  }
  return { ...selection, eligible: reasons.length === 0, selected: reasons.length === 0, reasons };
}

function buildRequestGeneratedCanonicalBindings({ validatedRequest, presetPlan, manualRows, resolvedEvents }) {
  const byEvent = new Map();
  const add = (eventId, role) => {
    const event = resolvedEvents.get(eventId);
    if (!event) fail("No canonical event resolved for request-generated source group binding " + eventId);
    let row = byEvent.get(eventId);
    if (!row) {
      row = {
        eventId, owner: event.owner, phaseId: event.phaseId,
        sourceTimeSec: event.sourceTimeSec, sourceTimeBasis: event.sourceTimeBasis,
        filmTimeSec: event.filmTimeSec, timeMapId: event.timeMapId,
        segmentId: event.segmentId, sourceSceneSha256: event.sourceSceneSha256, roles: [],
      };
      byEvent.set(eventId, row);
    }
    row.roles.push(role);
  };
  for (const section of validatedRequest.musicPreset?.sections || []) {
    const resolved = resolvedEvents.get(section.eventId);
    add(section.eventId, { kind: "music-section", energy: section.energy ?? null, sourceMusicSec: resolved?.filmTimeSec ?? null });
  }
  if (validatedRequest.musicPreset?.dropEventId) add(validatedRequest.musicPreset.dropEventId, { kind: "music-drop", sourceMusicSec: presetPlan.drop });
  if (validatedRequest.musicPreset?.endEventId) add(validatedRequest.musicPreset.endEventId, { kind: "music-end", sourceMusicSec: presetPlan.end });
  for (const [sourceHitOrder, row] of manualRows.entries()) {
    add(row.eventId, {
      kind: "manual-sfx", requestId: row.id, sourceHitOrder, name: row.name,
      sourceGain: row.sourceGain, sourcePan: row.sourcePan, options: row.options,
      kit: row.kit, seedBasis: "pinned-source-renderSfx-name-index-at", mixGainDb: row.mixGainDb,
    });
  }
  return [...byEvent.values()];
}

function mapVoiceWindowsToNativeSegment(voiceWindows, timeMap, durationSec) {
  if (Math.abs(finite(timeMap.localStartSec, "native source timeMap.localStartSec")) > 1e-8) {
    fail("Original source mixdown segment must begin at source-local zero to bind voice windows safely");
  }
  const speed = finite(timeMap.speed, "native source timeMap.speed", { min: 0.000001 });
  const filmStartSec = finite(timeMap.filmStartSec, "native source timeMap.filmStartSec");
  const filmEndSec = filmStartSec + durationSec / speed;
  return voiceWindows.flatMap((window) => {
    const startFilmSec = Math.max(filmStartSec, finite(window.startSec, "voiceWindow.startSec"));
    const endFilmSec = Math.min(filmEndSec, finite(window.endSec, "voiceWindow.endSec"));
    if (endFilmSec <= startFilmSec + 1e-8) return [];
    const start = Math.max(0, Math.min(durationSec, (startFilmSec - filmStartSec) * speed));
    const end = Math.max(0, Math.min(durationSec, (endFilmSec - filmStartSec) * speed));
    return end > start + 1e-8 ? [{ start, end }] : [];
  });
}

function resolveNativePresetVoicePolicy({ basePlan, timeMap, durationSec, voiceLufs }) {
  const canonicalVoiceWindows = basePlan.voiceWindows || [];
  const mappedVoiceWindows = canonicalVoiceWindows.length
    ? mapVoiceWindowsToNativeSegment(canonicalVoiceWindows, timeMap, durationSec)
    : [];
  const sourceVoiced = mappedVoiceWindows.length > 0;
  const bakeSourceVoiceDuck = sourceVoiced && basePlan.ducking == null;
  const voiceWindowsSha256 = canonicalVoiceWindows.length
    ? sha256(Buffer.from(canonical(canonicalVoiceWindows), "utf8"))
    : null;
  const voiceDuckProcessing = sourceVoiced && !bakeSourceVoiceDuck ? {
    applied: false,
    processor: "audio-plan final mixer",
    wordWindows: [],
    requestedWordWindows: mappedVoiceWindows,
    voiceWindowsSha256,
    reason: "explicit audio-plan ducking remains the sole duck owner",
  } : null;
  return {
    mappedVoiceWindows,
    sourceVoiced,
    bakeSourceVoiceDuck,
    voiceWindowsToBake: bakeSourceVoiceDuck ? mappedVoiceWindows : [],
    voiceWindowsSha256,
    voiceDuckProcessing,
    targetLufs: sourceVoiced ? (voiceLufs != null ? voiceLufs - 12 : -28) : -18,
  };
}

function resolveSourceFxLevelGainDb({ voiced, musicTargetLufs }) {
  if (voiced) return musicTargetLufs + 18 + 4;
  return -2;
}

function voiceTrackUsesUntrimmedOneXSource(track, asset) {
  if (!track || !asset) return false;
  const sourceInSec = track.sourceInSec == null ? 0 : track.sourceInSec;
  const sourceOutSec = track.sourceOutSec == null ? asset.durationSec : track.sourceOutSec;
  return (track.speed == null || Math.abs(track.speed - 1) <= 1e-8)
    && Math.abs(sourceInSec) <= 1e-8
    && Math.abs(sourceOutSec - asset.durationSec) <= 1e-8
    && track.timeMapId == null
    && track.envelope == null
    && !track.loop;
}

async function measureLockedVoiceLufs({ basePlan, basePlanDirectory, upstream, ffmpeg }) {
  const track = (basePlan.tracks || []).find((row) => row.bus === "voice");
  if (!track) return null;
  const asset = (basePlan.assets || []).find((row) => row.id === track.assetId);
  if (!asset) fail("Locked voice track references a missing project asset: " + track.assetId);
  if (!voiceTrackUsesUntrimmedOneXSource(track, asset)) fail("The original source mixdown LUFS measurement requires an untrimmed 1x locked voice source without a timeMap, envelope, or loop; use the supported separate audio-plan path for transformed voice playback");
  const verified = await verifyFileHash(path.resolve(basePlanDirectory, asset.file), asset.sha256, "locked voice source asset " + asset.id);
  if (!contains(basePlanDirectory, verified.path)) fail("Locked voice source asset must stay inside the audio-plan project directory");
  const decoded = spawnSync(ffmpeg, ["-nostdin", "-v", "error", "-i", verified.path, "-map", "0:a:0", "-vn", "-af", "aformat=sample_fmts=fltp:channel_layouts=stereo", "-ac", "2", "-ar", String(RATE), "-f", "f32le", "pipe:1"], {
    encoding: null, maxBuffer: 256 << 20,
  });
  if (decoded.error || decoded.status !== 0) fail("Could not decode the locked voice asset through the final mixer stereo channel layout for the original source mixdown LUFS target: " + (decoded.error?.message || decoded.stderr?.toString("utf8") || decoded.status));
  if (!decoded.stdout?.length || decoded.stdout.length % 8 !== 0) fail("Locked voice source decoded to empty or malformed 48 kHz stereo float PCM");
  const frames = decoded.stdout.length / 8;
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    left[index] = decoded.stdout.readFloatLE(index * 8);
    right[index] = decoded.stdout.readFloatLE(index * 8 + 4);
  }
  if (left.some((sample) => !Number.isFinite(sample)) || right.some((sample) => !Number.isFinite(sample))) fail("Locked voice source contains a non-finite decoded sample");
  const channelLufs = upstream.sound.loudness(left, right);
  if (!Number.isFinite(channelLufs)) fail("Pinned original sound.loudness could not measure the locked voice source");
  const trackGainDb = finite(track.gainDb == null ? 0 : track.gainDb, "locked voice track.gainDb");
  return {
    track, asset, file: verified.path, fileSha256: verified.sha256,
    voiceLufs: channelLufs + trackGainDb,
    measurement: "pinned sound.loudness(FFmpeg 48 kHz stereo aformat decode, L/R) + audio-plan voice track gainDb; file range is untrimmed at 1x without envelope/timeMap/loop",
    decodedChannels: 2,
    trackGainDb,
    voiceWindows: basePlan.voiceWindows || [],
    voiceWindowsSha256: sha256(Buffer.from(canonical(basePlan.voiceWindows || []), "utf8")),
  };
}

function nativeSourceMixdownInput({ source, sourceKind, film, upstream }) {
  const sceneMap = film.manifest.format === "laohu.motion-film-manifest/2" ? film.nativeBaseSources : film.sourceScenes;
  const sourceScene = sceneMap.get(source.segmentId);
  const sourceScenePath = manifestPath(path.dirname(film.manifestPath), source.sourceScenePath, "native OM source mixdown.sourceScenePath");
  if (!sourceScene || sourceScene.path !== sourceScenePath
      || sourceScene.sha256 !== shaField(source.sourceSceneSha256, "native OM source mixdown.sourceSceneSha256")) {
    fail("Native OM source mixdown does not match its verified source scene: " + source.segmentId);
  }
  const runtime = plainObject(sourceScene.scene.huashuMotionRuntime, "native OM source mixdown runtime " + source.segmentId);
  if (runtime.format !== "laohu.huashu-native-om-runtime-probe/1") fail("Native OM source mixdown requires the initialized original runtime probe: " + source.segmentId);
  const sourceDeclaration = plainObject(runtime.sourceDeclaration, "native OM source mixdown p0 " + source.segmentId);
  if (!Array.isArray(sourceDeclaration.hits) || !sourceDeclaration.labels || !sourceDeclaration.music
      || sha256(Buffer.from(canonical(sourceDeclaration), "utf8")) !== shaField(runtime.sourceDeclarationSha256, "native OM source p0 SHA-256")) {
    fail("Native OM source mixdown p0 declaration is incomplete or stale: " + source.segmentId);
  }
  if (source.sourceDeclarationSha256 != null && source.sourceDeclarationSha256 !== runtime.sourceDeclarationSha256) fail("Native OM source mixdown p0 hash differs from its Film music-source record: " + source.segmentId);
  if (canonical(runtime.sound?.hits || []) !== canonical(sourceDeclaration.hits)
      || canonical(runtime.sound?.music || {}) !== canonical(sourceDeclaration.music)
      || canonical(runtime.labels || {}) !== canonical(sourceDeclaration.labels)) {
    fail("Native OM source mixdown p0 differs from the original initialized sound declaration: " + source.segmentId);
  }
  const sourcePlan = plainObject(runtime.sourcePlan, "native OM source mixdown score.plan " + source.segmentId);
  if (sha256(Buffer.from(canonical(sourcePlan), "utf8")) !== shaField(runtime.sourcePlanSha256, "native OM source plan SHA-256")) {
    fail("Native OM source mixdown score.plan snapshot is stale: " + source.segmentId);
  }
  if (source.sourcePlanSha256 != null && source.sourcePlanSha256 !== runtime.sourcePlanSha256) fail("Native OM source mixdown score.plan hash differs from its Film music-source record: " + source.segmentId);
  const reproducedPlan = upstream.sound.plan({ ...sourceDeclaration, voice: false });
  if (canonical(JSON.parse(JSON.stringify(reproducedPlan))) !== canonical(sourcePlan)) fail("Native OM source mixdown no longer reproduces the pinned original score.plan: " + source.segmentId);
  const durationSec = finite(sourceDeclaration.duration, "native OM source mixdown p0.duration", { min: 0.001 });
  if (Math.abs(durationSec - finite(sourcePlan.duration, "native OM source mixdown plan.duration", { min: 0.001 })) > 1e-8) fail("Native OM source mixdown p0 and source plan durations differ: " + source.segmentId);

  let scoreText = null;
  let scoreSha256 = null;
  if (sourceKind === "abc-score") {
    const originalScore = plainObject(runtime.sourceScore, "native OM original score " + source.segmentId);
    scoreText = originalScore.scoreText;
    scoreSha256 = shaField(originalScore.scoreSha256, "native OM source score SHA-256");
    if (typeof scoreText !== "string" || !scoreText.trim() || sha256(Buffer.from(scoreText, "utf8")) !== scoreSha256
        || scoreText !== source.scoreText || scoreSha256 !== source.scoreSha256
        || runtime.composer?.scoreText !== scoreText || runtime.composer?.scoreSha256 !== scoreSha256
        || originalScore.musicOff || sourceDeclaration.music?.off) {
      fail("Native OM source ABC score differs from its initialized, music-on composer/runtime: " + source.segmentId);
    }
  } else if (sourceKind === "default-score-preset") {
    if (runtime.sourceScore?.scoreText || sourceDeclaration.music?.off) fail("Native OM default preset mixdown requires the original no-ABC, music-on runtime: " + source.segmentId);
  } else if (sourceKind === "sfx-only") {
    if (runtime.sourceScore?.scoreText || runtime.composer?.scoreText || sourceDeclaration.music?.off !== true) {
      fail("Native OM SFX-only mixdown requires the original no-ABC, music-off runtime: " + source.segmentId);
    }
  } else {
    fail("Native OM source mixdown kind is unsupported: " + sourceKind);
  }

  const timeMap = film.maps.get(source.timeMapId);
  if (!timeMap || timeMap.segmentId !== source.segmentId) fail("Native OM source mixdown has no exact segment timeMap: " + source.segmentId);
  if (Math.abs(durationSec - source.durationSec) > 1 / (film.manifest.render?.fps || 30) + 1e-8) fail("Native OM source mixdown duration differs from its original source plan: " + source.segmentId);
  return { source, sourceScene, runtime, sourceDeclaration, sourcePlan, sourceKind, scoreText, scoreSha256, durationSec };
}

function verifyNativeMixdownHitRows({ mixdown, source, sourceScene }) {
  const rows = asArray(sourceScene.scene.audioEvents || [], "native OM source mixdown canonical audioEvents")
    .filter((event) => ["declared-sfx", "score-sfx"].includes(event?.sourceAudio?.kind))
    .sort((left, right) => left.sourceAudio.sourceHitOrder - right.sourceAudio.sourceHitOrder);
  const hits = asArray(mixdown.hits || [], "original sound.mixdown hits");
  if (hits.length !== rows.length) fail("Original sound.mixdown hit count differs from canonical source events for segment " + source.segmentId);
  for (const [index, hitValue] of hits.entries()) {
    const hit = plainObject(hitValue, `sound.mixdown hits[${index}]`);
    const row = rows[index];
    const audio = plainObject(row.sourceAudio, `canonical native source event ${row.id}.sourceAudio`);
    const hitOptions = Object.fromEntries(Object.entries(hit).filter(([key]) => !["name", "at", "gain", "pan"].includes(key)));
    if (audio.sourceHitOrder !== index || audio.name !== hit.name
        || Math.abs(finite(row.timeSec, `canonical source event ${row.id}.timeSec`) - finite(hit.at, `sound.mixdown hit ${index}.at`)) > 1 / RATE
        || Math.abs(finite(audio.sourceGain, `canonical source event ${row.id}.sourceGain`) - (hit.gain == null ? 1 : finite(hit.gain, `sound.mixdown hit ${index}.gain`))) > 1e-8
        || Math.abs(finite(audio.sourcePan, `canonical source event ${row.id}.sourcePan`) - (hit.pan == null ? 0 : finite(hit.pan, `sound.mixdown hit ${index}.pan`))) > 1e-8
        || canonical(audio.options) !== canonical(hitOptions)) {
      fail("Original sound.mixdown hit no longer matches canonical native source event " + row.id + "; refusing duplicate or shifted SFX");
    }
  }
  return rows;
}

function validateRequest(request, durationSec, nativeSourceEvents = [], nativeSourceCompositions = [], nativeSourcePresetPlans = []) {
  plainObject(request, "request");
  if (Object.prototype.hasOwnProperty.call(request, "hitFilmSec")) fail("request must not supply hitFilmSec; canonical film time is derived only from the shared event scene and its manifest timeMap");
  const isV1 = request.format === "laohu.motion.huashu-audio-request/1";
  const isV2 = request.format === "laohu.motion.huashu-audio-request/2";
  if (!isV1 && !isV2) fail("request.format must be laohu.motion.huashu-audio-request/1 or /2");
  let generationAuthorization = null;
  if (request.generationAuthorization != null) {
    generationAuthorization = plainObject(request.generationAuthorization, "request.generationAuthorization");
    const allowedAuthorizationKeys = new Set(["granted", "scopes", "source", "instructionExcerpt"]);
    for (const key of Object.keys(generationAuthorization)) if (!allowedAuthorizationKeys.has(key)) fail("Unsupported generationAuthorization field " + key);
    const scopes = asArray(generationAuthorization.scopes, "request.generationAuthorization.scopes");
    if (generationAuthorization.granted !== true
        || generationAuthorization.source !== "explicit-user-request"
        || !scopes.length || new Set(scopes).size !== scopes.length
        || scopes.some((scope) => !["music", "sfx"].includes(scope))
        || typeof generationAuthorization.instructionExcerpt !== "string"
        || !generationAuthorization.instructionExcerpt.trim()) {
      fail("generationAuthorization must record the user's explicit music/sfx generation scope, source, and a non-empty instructionExcerpt");
    }
  }
  const hasComposition = request.composition != null;
  const hasPreset = request.musicPreset != null;
  if (isV1 && hasPreset) fail("musicPreset requires request.format laohu.motion.huashu-audio-request/2");
  if (isV2 && hasComposition && hasPreset) fail("request /2 must choose ABC composition or musicPreset for one music source");
  let musicPreset = null;
  if (hasPreset) {
    musicPreset = plainObject(request.musicPreset, "request.musicPreset");
    const allowedPresetKeys = new Set(["product", "style", "variant", "seed", "bpm", "keyMidi", "scale", "loop", "motif", "rhythm", "sections", "dropEventId", "endEventId", "ending", "suck", "floor", "selectedMusicTrackId", "samples"]);
    for (const key of Object.keys(musicPreset)) if (!allowedPresetKeys.has(key)) fail("Unsupported musicPreset field " + key);
    const hasProduct = typeof musicPreset.product === "string" && musicPreset.product.trim();
    const hasStyle = typeof musicPreset.style === "string" && musicPreset.style.trim();
    if (Boolean(hasProduct) === Boolean(hasStyle)) fail("musicPreset must choose exactly one product or style");
    if (musicPreset.variant != null) {
      const variant = finite(musicPreset.variant, "musicPreset.variant", { min: 0, max: 2 });
      if (!Number.isInteger(variant)) fail("musicPreset.variant must be an integer");
      if (!hasProduct) fail("musicPreset.variant only applies to a product route; encode a style variant in style (for example pulse:dark)");
    }
    if (musicPreset.seed != null && !(typeof musicPreset.seed === "number" && Number.isFinite(musicPreset.seed)) && typeof musicPreset.seed !== "string") fail("musicPreset.seed must be a finite number or string");
    if (musicPreset.bpm != null) finite(musicPreset.bpm, "musicPreset.bpm", { min: 1, max: 300 });
    if (musicPreset.keyMidi != null) {
      const keyMidi = finite(musicPreset.keyMidi, "musicPreset.keyMidi", { min: 0, max: 127 });
      if (!Number.isInteger(keyMidi)) fail("musicPreset.keyMidi must be an integer");
    }
    if (musicPreset.scale != null && !["major", "minor", "dorian"].includes(musicPreset.scale)) fail("musicPreset.scale must be major, minor, or dorian");
    if (musicPreset.ending != null && !["ring", "button", "stop"].includes(musicPreset.ending)) fail("musicPreset.ending must be ring, button, or stop");
    if (musicPreset.suck != null) finite(musicPreset.suck, "musicPreset.suck", { min: 0, max: 8 });
    if (musicPreset.floor != null) finite(musicPreset.floor, "musicPreset.floor", { min: 0, max: 1 });
    if (musicPreset.loop != null && (!Array.isArray(musicPreset.loop) || !musicPreset.loop.length || musicPreset.loop.some((degree) => !Number.isInteger(degree)))) fail("musicPreset.loop must be a non-empty array of integer scale degrees");
    if (musicPreset.motif != null && (!Array.isArray(musicPreset.motif) || musicPreset.motif.length < 2 || musicPreset.motif.some((degree) => !Number.isFinite(degree)))) fail("musicPreset.motif must be an array of finite scale degrees");
    if (musicPreset.rhythm != null && (!Array.isArray(musicPreset.rhythm) || musicPreset.rhythm.length !== musicPreset.motif?.length || musicPreset.rhythm.some((step) => !Number.isFinite(step) || step <= 0))) fail("musicPreset.rhythm must contain positive durations matching musicPreset.motif");
    const sections = asArray(musicPreset.sections || [], "musicPreset.sections");
    const sectionIds = new Set();
    for (const [index, row] of sections.entries()) {
      plainObject(row, `musicPreset.sections[${index}]`);
      const eventId = stableId(row.eventId, `musicPreset.sections[${index}].eventId`);
      if (sectionIds.has(eventId)) fail("musicPreset.sections contains duplicate eventId " + eventId);
      sectionIds.add(eventId);
      if (row.energy != null) finite(row.energy, `musicPreset.sections[${index}].energy`, { min: 0, max: 1 });
    }
    for (const key of ["dropEventId", "endEventId"]) if (musicPreset[key] != null) stableId(musicPreset[key], `musicPreset.${key}`);
    if (musicPreset.dropEventId != null && !sectionIds.has(musicPreset.dropEventId)) fail("musicPreset.dropEventId must identify a declared canonical section eventId");
    if (musicPreset.endEventId != null && !["button", "stop"].includes(musicPreset.ending)) fail("musicPreset.endEventId requires an explicit ending button or stop; ring leaves the source score's end unset");
    if (musicPreset.selectedMusicTrackId != null) stableId(musicPreset.selectedMusicTrackId, "musicPreset.selectedMusicTrackId");
    if (musicPreset.samples != null) {
      const samples = plainObject(musicPreset.samples, "musicPreset.samples");
      if (samples.mode !== "recorded-required") fail("musicPreset.samples.mode may only be recorded-required; omit samples to keep OM_SAMPLES=off");
      if (typeof samples.packDir !== "string" || !path.isAbsolute(samples.packDir)) fail("musicPreset.samples.packDir must be an absolute project-controlled path");
    }
  }
  let composition = null, scoreSha256 = null;
  if (hasComposition) {
    composition = plainObject(request.composition, "request.composition");
    if (typeof composition.scoreText !== "string" || !composition.scoreText.trim()) fail("request.composition.scoreText must contain the original ABC score text");
    scoreSha256 = sha256(Buffer.from(composition.scoreText, "utf8"));
    if (request.scoreSha256 !== scoreSha256) fail("request.scoreSha256 is stale; score cue ordinals must be rebound after any score edit");
    if (composition.seed == null || !(typeof composition.seed === "number" && Number.isFinite(composition.seed)) && typeof composition.seed !== "string") fail("request.composition.seed must be a finite number or string");
    if (composition.durationSec != null && Math.abs(finite(composition.durationSec, "composition.durationSec", { min: 0.001 }) - durationSec) > 1e-9) fail("composition.durationSec must match the canonical audio-plan duration");
  } else if (request.scoreSha256 != null || request.bindings != null) {
    fail("scoreSha256/bindings require request.composition; SFX-only requests bind through sfxEvents[].eventId");
  }
  const keyContextProvided = request.keyContext != null;
  const keyContext = keyContextProvided ? plainObject(request.keyContext, "request.keyContext") : { rootMidi: 60, scale: "major" };
  finite(keyContext.rootMidi, "keyContext.rootMidi", { min: 0, max: 127 });
  if (!Number.isInteger(keyContext.rootMidi)) fail("keyContext.rootMidi must be an integer MIDI note");
  if (!["major", "minor", "dorian"].includes(keyContext.scale)) fail("keyContext.scale must be major, minor, or dorian");
  if (request.samples != null) fail("Huashu sample-pack use is not enabled by this adapter; OM_SAMPLES is forced off unless a separately authorized fresh-process route is implemented");
  const bindings = request.bindings == null ? {} : plainObject(request.bindings, "request.bindings");
  if (hasComposition && bindings.scoreSha256 !== scoreSha256) fail("request.bindings.scoreSha256 is stale; regenerate mark/cue bindings from the current score bytes");
  const markRows = asArray(bindings.marks || [], "request.bindings.marks");
  const cueRows = asArray(bindings.hitRiseCues || [], "request.bindings.hitRiseCues");
  if (!hasComposition && (markRows.length || cueRows.length)) fail("request.bindings mark/cue rows require request.composition; SFX-only events bind through sfxEvents[].eventId");
  const marks = new Map();
  for (const [index, item] of markRows.entries()) {
    plainObject(item, `bindings.marks[${index}]`);
    const name = stableId(item.name, `bindings.marks[${index}].name`);
    const eventId = stableId(item.eventId, `bindings.marks[${index}].eventId`);
    if (marks.has(name)) {
      if (marks.get(name) !== eventId) fail("Score mark " + name + " has conflicting eventId bindings");
      continue;
    }
    marks.set(name, eventId);
  }
  const cueBindings = new Map();
  for (const [index, item] of cueRows.entries()) {
    plainObject(item, `bindings.hitRiseCues[${index}]`);
    const ordinal = finite(item.cueOrdinal, `bindings.hitRiseCues[${index}].cueOrdinal`, { min: 0 });
    if (!Number.isInteger(ordinal)) fail(`bindings.hitRiseCues[${index}].cueOrdinal must be an integer`);
    const eventId = stableId(item.eventId, `bindings.hitRiseCues[${index}].eventId`);
    if (cueBindings.has(ordinal) && cueBindings.get(ordinal) !== eventId) fail("Composer hit/rise cue ordinal " + ordinal + " has conflicting event bindings");
    cueBindings.set(ordinal, eventId);
  }
  const manualRows = asArray(request.sfxEvents || [], "request.sfxEvents");
  const seenManualIds = new Map();
  for (const [index, item] of manualRows.entries()) {
    plainObject(item, `request.sfxEvents[${index}]`);
    if (Object.prototype.hasOwnProperty.call(item, "hitFilmSec") || Object.prototype.hasOwnProperty.call(item, "filmTimeSec") || Object.prototype.hasOwnProperty.call(item, "timeSec")) fail(`request.sfxEvents[${index}] must bind a canonical eventId, not supply a second time authority`);
    const itemId = stableId(item.id, `request.sfxEvents[${index}].id`);
    const eventId = stableId(item.eventId, `request.sfxEvents[${index}].eventId`);
    if (typeof item.name !== "string" || !item.name.trim()) fail(`request.sfxEvents[${index}].name must be a string`);
    if (item.seed != null && !(typeof item.seed === "number" && Number.isFinite(item.seed)) && typeof item.seed !== "string") fail(`request.sfxEvents[${index}].seed must be a finite number or string`);
    const prior = seenManualIds.get(itemId);
    const fingerprint = canonical(item);
    if (prior && prior !== fingerprint) fail("Manual SFX instance ID " + itemId + " has conflicting definitions");
    seenManualIds.set(itemId, fingerprint);
  }
  const nativeRows = asArray(nativeSourceEvents, "film native OM source events").map((raw, index) => {
    const event = plainObject(raw, `film native OM source events[${index}]`);
    const id = stableId(event.id, `film native OM source events[${index}].id`);
    const source = plainObject(event.sourceAudio, `film native OM source event ${id}.sourceAudio`);
    if (!["declared-sfx", "score-sfx"].includes(source.kind)) fail(`film native OM source event ${id} has unsupported sourceAudio.kind`);
    if (typeof source.name !== "string" || !source.name.trim()) fail(`film native OM source event ${id}.sourceAudio.name must be non-empty`);
    const options = plainObject(source.options, `film native OM source event ${id}.sourceAudio.options`);
    if (Object.keys(options).some((key) => ["at", "gain", "pan"].includes(key))) fail(`film native OM source event ${id} duplicates source placement/gain fields inside options`);
    finite(source.sourceGain, `film native OM source event ${id}.sourceAudio.sourceGain`, { min: 0, max: 4 });
    finite(source.sourcePan, `film native OM source event ${id}.sourceAudio.sourcePan`, { min: -1, max: 1 });
    stableId(source.kit, `film native OM source event ${id}.sourceAudio.kit`);
    if (!Number.isSafeInteger(source.sourceHitOrder) || source.sourceHitOrder < 0) fail(`film native OM source event ${id}.sourceAudio.sourceHitOrder must be a non-negative safe integer`);
    if (typeof source.sourceSeed !== "string" || !source.sourceSeed) fail(`film native OM source event ${id}.sourceAudio.sourceSeed must be a non-empty deterministic source seed`);
    const keyContext = plainObject(source.keyContext, `film native OM source event ${id}.sourceAudio.keyContext`);
    finite(keyContext.rootMidi, `film native OM source event ${id}.sourceAudio.keyContext.rootMidi`, { min: 0, max: 127 });
    if (!Number.isInteger(keyContext.rootMidi) || !["major", "minor", "dorian"].includes(keyContext.scale)) fail(`film native OM source event ${id}.sourceAudio.keyContext is invalid`);
    return { event, source: { ...source, options, keyContext } };
  });
  const nativeScores = asArray(nativeSourceCompositions, "film native OM source compositions");
  const nativePresets = asArray(nativeSourcePresetPlans, "film native OM source preset plans");
  if (!hasComposition && !hasPreset && manualRows.length === 0 && nativeRows.length === 0 && nativeScores.length === 0 && nativePresets.length === 0) fail("request must contain request.composition or musicPreset, explicit sfxEvents, or source-declared native OM audio");
  finite(request.musicMixGainDb == null ? 0 : request.musicMixGainDb, "request.musicMixGainDb", { min: -120, max: 24 });
  const musicMixGainDb = request.musicMixGainDb == null ? 0 : request.musicMixGainDb;
  if (!hasComposition && !hasPreset && nativeScores.length === 0 && nativePresets.length === 0 && musicMixGainDb !== 0) fail("request.musicMixGainDb requires a music source; SFX-only level belongs to each sfxEvents[].mixGainDb");
  return { apiVersion: isV1 ? 1 : 2, composition, musicPreset, scoreSha256, keyContext, keyContextProvided, marks, cueBindings, manualRows: [...new Map(manualRows.map((item) => [item.id, item])).values()], nativeSourceEvents: nativeRows, nativeSourceCompositions: nativeScores, nativeSourcePresetPlans: nativePresets, musicMixGainDb, generationAuthorization };
}

function normalizeBindings(bindings) {
  const ids = [...new Set([
    ...bindings.marks.values(),
    ...bindings.cueBindings.values(),
    ...bindings.manualRows.map((item) => item.eventId),
    ...(bindings.musicPreset?.sections || []).map((item) => item.eventId),
    ...(bindings.musicPreset?.dropEventId ? [bindings.musicPreset.dropEventId] : []),
    ...(bindings.musicPreset?.endEventId ? [bindings.musicPreset.endEventId] : []),
  ])].sort();
  return ids;
}

function resolveSourceEvents(ids, durationSec, film) {
  if (!film || !film.scene || !(film.bindings instanceof Map) || !(film.maps instanceof Map)) fail("--film-manifest must resolve a verified compiled event scene and unique clock bindings");
  const rows = ids.map((eventId) => {
    const binding = film.bindings.get(eventId);
    if (!binding) fail("Event is not bound by the current film manifest: " + eventId);
    return { id: "huashu-source-" + sha256(Buffer.from(eventId)).slice(0, 16), eventId, ...(binding.timeMapId ? { timeMapId: binding.timeMapId } : {}) };
  });
  const mapped = mapSceneEvents({ durationSec, events: rows }, film.scene, film.maps);
  const out = new Map();
  for (const item of mapped) {
    const binding = film.bindings.get(item.eventId);
    if (item.sourceEvent.timeBasis !== binding.timeBasis || item.sourceEvent.phaseId !== binding.phaseId) fail("Resolved shared event disagrees with the verified film-manifest binding: " + item.eventId);
    out.set(item.eventId, {
      eventId: item.eventId, phaseId: item.sourceEvent.phaseId, timeMapId: binding.timeMapId,
      filmTimeSec: item.filmTimeSec, owner: item.sourceEvent.owner,
      sourceTimeSec: item.sourceEvent.timeSec, sourceTimeBasis: item.sourceEvent.timeBasis,
      segmentId: binding.segmentId, sourceSceneSha256: binding.sourceSceneSha256,
    });
  }
  return out;
}

function toleranceForScene(scene) {
  return scene.fps == null ? 0.0005 : 0.5 / finite(scene.fps, "scene.fps", { min: 0.001 });
}
function keyFunction(keyContext, upstream) {
  const p = { root: keyContext.rootMidi, scale: keyContext.scale };
  return (degree, octave) => upstream.dsp.mtof(upstream.score.deg(p, Math.round(degree) - 1, octave - 4));
}
function normalizeSignal(output, label) {
  let normalized = output;
  if (normalized instanceof Float32Array) normalized = { sig: normalized, lead: 0 };
  plainObject(normalized, label + " return value");
  const sig = normalized.sig;
  const stereo = Array.isArray(sig);
  if (stereo) {
    if (sig.length !== 2 || !(sig[0] instanceof Float32Array) || !(sig[1] instanceof Float32Array) || sig[0].length < 1 || sig[1].length < 1) fail(label + " must return two non-empty Float32Array channels");
  } else if (!(sig instanceof Float32Array) || sig.length < 1) fail(label + " must return a non-empty Float32Array or [left,right] Float32Array pair");
  const channels = stereo ? sig : [sig];
  for (const channel of channels) for (let index = 0; index < channel.length; index += 1) if (!Number.isFinite(channel[index])) fail(label + " returned a non-finite sample");
  const lead = finite(normalized.lead == null ? 0 : normalized.lead, label + ".lead", { min: 0 });
  const durationSec = Math.max(...channels.map((channel) => channel.length)) / RATE;
  if (lead > durationSec + 1 / RATE) fail(label + ".lead exceeds its generated signal duration");
  return { sig: stereo ? sig : sig, lead, stereo, durationSec };
}

function floatWav(track) {
  if (!track || !Number.isInteger(track.n) || track.n < 1 || !(track.L instanceof Float32Array) || !(track.R instanceof Float32Array)
      || track.L.length !== track.n || track.R.length !== track.n) fail("Huashu Track must contain paired Float32Array channels");
  const frames = track.n, dataBytes = frames * 8, buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + dataBytes, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(3, 20); buffer.writeUInt16LE(2, 22); buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 8, 28); buffer.writeUInt16LE(8, 32); buffer.writeUInt16LE(32, 34); buffer.write("data", 36); buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < frames; index += 1) {
    const left = track.L[index], right = track.R[index];
    if (!Number.isFinite(left) || !Number.isFinite(right)) fail("Huashu audio Track contains a non-finite PCM sample");
    buffer.writeFloatLE(left, 44 + index * 8); buffer.writeFloatLE(right, 48 + index * 8);
  }
  return buffer;
}

function wavFacts(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") fail("Generated audio asset is not a RIFF/WAVE file");
  let format, channels, sampleRate, bitsPerSample, dataLength, dataOffset;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const tag = buffer.toString("ascii", offset, offset + 4), size = buffer.readUInt32LE(offset + 4), body = offset + 8;
    if (body + size > buffer.length) fail("Generated WAV contains a truncated chunk");
    if (tag === "fmt ") {
      format = buffer.readUInt16LE(body); channels = buffer.readUInt16LE(body + 2); sampleRate = buffer.readUInt32LE(body + 4); bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (tag === "data") { dataLength = size; dataOffset = body; break; }
    offset = body + size + (size & 1);
  }
  if (format !== 3 || channels !== 2 || sampleRate !== RATE || bitsPerSample !== 32 || !Number.isSafeInteger(dataLength) || dataLength % 8 !== 0) fail("Generated WAV must be 48 kHz stereo IEEE-float PCM");
  let peakAbs = 0, overRangeSampleCount = 0;
  for (let offset = dataOffset; offset < dataOffset + dataLength; offset += 4) {
    const sample = buffer.readFloatLE(offset);
    if (!Number.isFinite(sample)) fail("Generated float WAV contains a non-finite sample");
    peakAbs = Math.max(peakAbs, Math.abs(sample));
    if (Math.abs(sample) > 1) overRangeSampleCount += 1;
  }
  return { sampleRate, channels, bitsPerSample, encoding: "pcm_f32le", frames: dataLength / 8, durationSec: dataLength / 8 / sampleRate, peakAbs, overRangeSampleCount, peakAboveFullScalePreserved: peakAbs > 1 };
}

function inheritedGenerationAuthorizations(source, rows = [], depth = 0) {
  if (!source || typeof source !== "object" || depth > 8) return rows;
  if (typeof source.generationAuthorizationRequestSha256 === "string" && /^[a-f0-9]{64}$/i.test(source.generationAuthorizationRequestSha256)) {
    rows.push(source.generationAuthorizationRequestSha256.toLowerCase());
  }
  const parents = source.parents ?? (source.parent == null ? [] : [source.parent]);
  if (Array.isArray(parents)) for (const parent of parents) inheritedGenerationAuthorizations(parent, rows, depth + 1);
  return rows;
}

function sourceAsset({ id, file, durationSec, sha, hitTimeSec, sourceKind, closure, sampleProvenance = null, sampleUse = null, voiceDuckProcessing = null, generationAuthorizationSha256 = null, generationScopes = ["music"], parentAsset = null }) {
  const sourceEdit = sourceKind === "derived-selected-music-track";
  const parentSource = parentAsset?.source && typeof parentAsset.source === "object" ? parentAsset.source : null;
  const parentRedistributionStatus = parentAsset?.redistribution?.status || "unknown";
  const inheritedGenerationScopes = sourceEdit && parentRedistributionStatus === "project-generated"
    ? (Array.isArray(parentSource?.generationScopes) && parentSource.generationScopes.length ? parentSource.generationScopes : ["music"])
    : sourceEdit ? [] : generationScopes;
  const inheritedAuthorizationHashes = sourceEdit ? [...new Set(inheritedGenerationAuthorizations(parentSource))] : [];
  if (inheritedAuthorizationHashes.length > 1) fail("Selected BGM source has multiple original generation request hashes; refusing to collapse distinct authorization lineage into one audio-policy binding");
  const parentGenerationAuthorizationSha256 = inheritedAuthorizationHashes[0] || null;
  const sourceLineage = sourceEdit && parentAsset ? {
    assetId: parentAsset.id,
    sha256: parentAsset.sha256,
    license: parentAsset.license || null,
    redistributionStatus: parentRedistributionStatus,
    ...(parentSource?.generationMode ? { generationMode: parentSource.generationMode } : {}),
    ...(parentSource?.generationAuthorizationRequestSha256 ? { generationAuthorizationRequestSha256: parentSource.generationAuthorizationRequestSha256 } : {}),
    ...(parentSource?.generationScopes ? { generationScopes: parentSource.generationScopes } : {}),
    ...(parentSource?.parent ? { parent: parentSource.parent } : {}),
    ...(parentSource?.parents ? { parents: parentSource.parents } : {}),
  } : null;
  const inheritedSourceLicense = sourceEdit && parentAsset ? parentAsset.license : null;
  const inheritedRedistribution = sourceEdit && parentAsset ? structuredClone(parentAsset.redistribution) : null;
  const inheritedAuthorization = sourceEdit && parentAsset
    ? (parentGenerationAuthorizationSha256 || parentAsset.source?.parent?.generationAuthorizationRequestSha256 || null)
    : null;
  return {
    id, file, durationSec, sha256: sha,
    license: sourceEdit && inheritedSourceLicense ? inheritedSourceLicense : sampleProvenance ? sampleProvenance.licenses.join("; ") : GENERATED_LICENSE,
    redistribution: sourceEdit && inheritedRedistribution ? inheritedRedistribution : { status: "project-generated", basis: sampleProvenance
      ? "Generated locally with the pinned MIT Huashu Motion score source and the validated recorded sample files/credits listed in its source receipt; this asset is the mixed music stem, not a sample-pack redistribution."
      : "Synthesized locally with the pinned MIT Huashu Motion source; OM_SAMPLES=off and no upstream sample/recording assets were read." },
    reviewStatus: sourceEdit ? "candidate-unreviewed" : "generated-unreviewed",
    ...(hitTimeSec == null ? {} : { hitTimeSec, hitTimeMethod: "upstream-returned-lead-seconds", hitTimeConfidence: "source-function-return-value" }),
    source: { kind: "laohu-audio-source", repository: EXPECTED_SOURCE.repository, commit: EXPECTED_SOURCE.commit, outputKind: sourceKind, sourceClosureSha256: closure.sha256,
      generationMode: sourceEdit ? "source-edit" : "original-synthesis",
      ...(!sourceEdit && generationScopes?.length ? { generationScopes: [...new Set(generationScopes)].sort() } : {}),
      ...(sourceEdit && inheritedGenerationScopes?.length ? { generationScopes: [...new Set(inheritedGenerationScopes)].sort() } : {}),
      ...(sourceEdit && sourceLineage ? { parent: sourceLineage } : {}),
      ...(generationAuthorizationSha256 && !sourceEdit ? { generationAuthorizationRequestSha256: generationAuthorizationSha256 } : {}),
      ...(inheritedAuthorization ? { generationAuthorizationRequestSha256: inheritedAuthorization } : {}),
      ...(sampleProvenance ? { recordedSampleCredits: sampleProvenance.credits, samplePackManifestSha256: sampleProvenance.manifest.sha256 } : {}),
      ...(voiceDuckProcessing ? { voiceDuckProcessing } : {}),
      ...(sampleUse ? { sampleUse } : {}) },
  };
}

function sourceClosureHash(pin) { return sha256(Buffer.from(canonical(pin.closure))); }
function makeTrackFromStereo(upstream, stereo, durationSec) {
  const track = new upstream.sound.Track(durationSec);
  if (stereo.L.length !== track.n || stereo.R.length !== track.n) fail("renderComposed music buffer sample count does not match the plan duration");
  track.L.set(stereo.L); track.R.set(stereo.R);
  return track;
}

function patchStrictSamplesSource(source) {
  const traceAnchor = "const pcm = new Map();";
  if (!source.includes(traceAnchor)) fail("Local laohu-audio-samples.mjs strict-runtime insertion point changed");
  source = source.replace(traceAnchor, "export const __laohuSampleTrace = { decodedFiles: [], instrumentUses: [] };\n" + traceAnchor);
  const ffmpegAnchor = "spawnSync('ffmpeg', ['-v', 'error', '-i', join(pack.dir, file), '-f', 'f32le', '-ac', String(c), '-ar', String(RATE), '-'], { maxBuffer: 256 << 20 })";
  if (!source.includes(ffmpegAnchor)) fail("Local laohu-audio-samples.mjs decoder command changed; refusing an unpinned executable path");
  source = source.replace(ffmpegAnchor, "spawnSync(process.env.LAOHU_FFMPEG || 'ffmpeg', ['-v', 'error', '-i', join(pack.dir, file), '-f', 'f32le', '-ac', String(c), '-ar', String(RATE), '-'], { maxBuffer: 256 << 20 })");
  const rawAnchor = "  const raw = r.status === 0 ? new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + (r.stdout.length & ~3))) : new Float32Array(c);";
  const rawReplacement = [
    "  if (r.error || r.status !== 0) throw new Error(`recorded sample decode failed for ${file}: ${r.error?.message || r.stderr?.toString().trim() || r.status}`);",
    "  const byteLength = r.stdout.length & ~3;",
    "  if (byteLength < c * 4) throw new Error(`recorded sample decoder returned empty PCM for ${file}`);",
    "  const raw = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + byteLength));",
    "  if (raw.length % c !== 0) throw new Error(`recorded sample decoder returned malformed channel PCM for ${file}`);",
    "  for (const sample of raw) if (!Number.isFinite(sample)) throw new Error(`recorded sample decoder returned non-finite PCM for ${file}`);",
    "  __laohuSampleTrace.decodedFiles.push({ file, channels: c, frames: raw.length / c });",
  ].join("\n");
  if (!source.includes(rawAnchor)) fail("Local laohu-audio-samples.mjs decoder fallback changed; refusing a non-strict sample overlay");
  source = source.replace(rawAnchor, rawReplacement);
  const pitchedAnchor = "    const x = side(decode(s.file, s.ch));";
  if (!source.includes(pitchedAnchor)) fail("Local laohu-audio-samples.mjs pitched-sample insertion point changed");
  source = source.replace(pitchedAnchor, "    __laohuSampleTrace.instrumentUses.push({ instrumentId: id, kind: 'pitched', requestedMidi: midi, root: s.root, file: s.file });\n" + pitchedAnchor);
  const hitAnchor = "    const d = decode(s.file, s.ch), scale = (x) => { const o = new Float32Array(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i] * gain; return o; };";
  if (!source.includes(hitAnchor)) fail("Local laohu-audio-samples.mjs unpitched-sample insertion point changed");
  source = source.replace(hitAnchor, "    __laohuSampleTrace.instrumentUses.push({ instrumentId: id, kind: 'unpitched', file: s.file });\n" + hitAnchor);
  const releaseAnchor = "      const rs = nearest(pool.length ? pool : rels, midi, r), rx = side(decode(rs.file, rs.ch));";
  if (!source.includes(releaseAnchor)) fail("Local laohu-audio-samples.mjs release-sample insertion point changed");
  source = source.replace(releaseAnchor, "      const rs = nearest(pool.length ? pool : rels, midi, r);\n      __laohuSampleTrace.instrumentUses.push({ instrumentId: id, kind: 'release', requestedMidi: midi, root: rs.root, file: rs.file });\n      const rx = side(decode(rs.file, rs.ch));");
  return source;
}

export function buildRuntimeSampleUseReceipt(trace, preflightFiles) {
  if (!trace || !Array.isArray(trace.decodedFiles) || !trace.decodedFiles.length || !Array.isArray(trace.instrumentUses) || !trace.instrumentUses.length) {
    fail("recorded-required rendering produced no actual decoded sample receipt; synthesis fallback is refused");
  }
  const preflightByFile = new Map(preflightFiles.map((row) => [row.file, row]));
  const decodeByFile = new Map();
  for (const row of trace.decodedFiles) {
    if (typeof row.file !== "string" || !preflightByFile.has(row.file)) fail("Runtime decoded a sample file absent from validated pack identity: " + row.file);
    if (!Number.isInteger(row.channels) || ![1, 2].includes(row.channels) || !Number.isInteger(row.frames) || row.frames <= 0) fail("Runtime sample decode receipt has invalid channel/frame coverage: " + row.file);
    const prior = decodeByFile.get(row.file) || { calls: 0, channels: row.channels, frames: row.frames };
    if (prior.channels !== row.channels || prior.frames !== row.frames) fail("Repeated runtime sample decode returned inconsistent PCM dimensions: " + row.file);
    prior.calls += 1;
    decodeByFile.set(row.file, prior);
  }
  const selectionByFile = new Map();
  for (const row of trace.instrumentUses) {
    if (typeof row.file !== "string" || !preflightByFile.has(row.file)) fail("Runtime selected a sample file absent from validated pack identity: " + row.file);
    const prior = selectionByFile.get(row.file) || { count: 0, kinds: new Set(), instrumentIds: new Set() };
    prior.count += 1;
    prior.kinds.add(row.kind);
    prior.instrumentIds.add(row.instrumentId);
    selectionByFile.set(row.file, prior);
  }
  for (const file of selectionByFile.keys()) if (!decodeByFile.has(file)) fail("Runtime selected a sample that was not decoded into PCM: " + file);
  const runtimeFiles = [...decodeByFile.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, decoded]) => {
    const selected = selectionByFile.get(file);
    return {
      ...preflightByFile.get(file),
      runtime: {
        decoded: true,
        decodeCalls: decoded.calls,
        decodedChannels: decoded.channels,
        decodedFrames: decoded.frames,
        selectedForNoteOrRelease: Boolean(selected),
        selectionCount: selected?.count || 0,
        selectionKinds: selected ? [...selected.kinds].sort() : [],
        selectedInstrumentIds: selected ? [...selected.instrumentIds].sort() : [],
      },
    };
  });
  const selectedFiles = runtimeFiles.filter((row) => row.runtime.selectedForNoteOrRelease);
  const actualNoteCoverage = trace.instrumentUses.filter((row) => row.kind === "pitched").reduce((out, row) => {
    const current = out[row.instrumentId] || (out[row.instrumentId] = { requestedMidiMin: row.requestedMidi, requestedMidiMax: row.requestedMidi, sampleRootMidiMin: row.root, sampleRootMidiMax: row.root, noteUses: 0 });
    current.requestedMidiMin = Math.min(current.requestedMidiMin, row.requestedMidi);
    current.requestedMidiMax = Math.max(current.requestedMidiMax, row.requestedMidi);
    current.sampleRootMidiMin = Math.min(current.sampleRootMidiMin, row.root);
    current.sampleRootMidiMax = Math.max(current.sampleRootMidiMax, row.root);
    current.noteUses += 1;
    return out;
  }, {});
  return {
    usedInstrumentIds: [...new Set(trace.instrumentUses.map((row) => row.instrumentId))].sort(),
    // `usedFiles` is the runtime-decoded identity set; it includes a release layer even if note-use hooks differ.
    usedFiles: runtimeFiles,
    decodedFiles: runtimeFiles,
    selectedFiles,
    decodeTrace: trace.decodedFiles,
    instrumentUseSummary: selectedFiles.map((row) => ({ file: row.file, kinds: row.runtime.selectionKinds, instrumentIds: row.runtime.selectedInstrumentIds, count: row.runtime.selectionCount })),
    actualNoteCoverage,
  };
}

function patchStrictScoreSource(source) {
  const importAnchor = "import { hit, sampler } from './laohu-audio-samples.mjs';";
  if (!source.includes(importAnchor)) fail("Local laohu-audio-score.mjs sample import changed; refusing a required-recording overlay");
  source = source.replace(importAnchor, "import { hasSample, hit, sampler } from './laohu-audio-samples.mjs';");
  const voiceAnchor = "export function voice(name) {\n  if (!voices.has(name)) voices.set(name, (SECTIONS[name] && sectioned(SECTIONS[name], SAMPLED[name]?.[1])) || (SAMPLED[name] && sampler(...SAMPLED[name])) || INSTRUMENTS[name] || (FALLBACK[name] && voice(FALLBACK[name])) || INSTRUMENTS.epiano);\n  return voices.get(name);\n}";
  const voiceReplacement = [
    "export function voice(name) {",
    "  if (process.env.LAOHU_REQUIRE_RECORDED === '1' && SAMPLED[name]) {",
    "    const parts = SECTIONS[name]?.map(([id]) => SAMPLED[id]?.[0]).filter(Boolean) || [];",
    "    const covered = parts.length && parts.every(hasSample) ? parts : [SAMPLED[name][0]];",
    "    if (covered.some((id) => !hasSample(id))) throw new Error(`required recorded voice ${name} has no complete sample coverage`);",
    "  }",
    "  if (!voices.has(name)) voices.set(name, (SECTIONS[name] && sectioned(SECTIONS[name], SAMPLED[name]?.[1])) || (SAMPLED[name] && sampler(...SAMPLED[name])) || INSTRUMENTS[name] || (FALLBACK[name] && voice(FALLBACK[name])) || INSTRUMENTS.epiano);",
    "  return voices.get(name);",
    "}",
  ].join("\n");
  if (!source.includes(voiceAnchor)) fail("Local laohu-audio-score.mjs voice fallback changed; refusing a required-recording overlay");
  source = source.replace(voiceAnchor, voiceReplacement);
  const drumAnchor = "export function drum(name, acoustic = false) {\n  const k = `${name}:${acoustic}`;\n  if (!drums.has(k)) { const id = (acoustic && ACOUSTIC[name]) || ALWAYS[name]; const h = id && hit(id); drums.set(k, h || ((r) => DRUMS[name](r))); }\n  return drums.get(k);\n}";
  const drumReplacement = [
    "export function drum(name, acoustic = false) {",
    "  const k = `${name}:${acoustic}`;",
    "  const id = (acoustic && ACOUSTIC[name]) || ALWAYS[name];",
    "  if (process.env.LAOHU_REQUIRE_RECORDED === '1' && id && !hasSample(id)) throw new Error(`required recorded drum ${name} has no sample coverage for ${id}`);",
    "  if (!drums.has(k)) { const h = id && hit(id); drums.set(k, h || ((r) => DRUMS[name](r))); }",
    "  return drums.get(k);",
    "}",
  ].join("\n");
  if (!source.includes(drumAnchor)) fail("Local laohu-audio-score.mjs drum fallback changed; refusing a required-recording overlay");
  source = source.replace(drumAnchor, drumReplacement);
  const inventoryAnchor = "export const resetVoices = () => { voices.clear(); drums.clear(); };";
  const inventory = [
    "export function __laohuRequiredSampleIds(p) {",
    "  const names = new Set();",
    "  for (const section of p.sections || []) if (section.voice) names.add(section.voice);",
    "  if (p.S.pad) names.add(p.S.pad[0]);",
    "  for (const row of [...(p.S.comp || []), ...(p.S.bass || [])]) names.add(row[0]);",
    "  for (const [name] of p.S.arp || []) for (const section of p.sections || []) names.add(name === 'lead' ? section.voice : name);",
    "  for (const [name] of p.S.drums || []) names.add(name);",
    "  for (const name of Object.keys(p.S.fill || {})) names.add(name);",
    "  const ids = new Set();",
    "  const addVoice = (name) => {",
    "    if (SAMPLED[name]) {",
    "      const parts = SECTIONS[name]?.map(([id]) => SAMPLED[id]?.[0]).filter(Boolean) || [];",
    "      const allPartsAvailable = parts.length && parts.every(hasSample);",
    "      if (allPartsAvailable) for (const id of parts) ids.add(id);",
    "      else if (hasSample(SAMPLED[name][0])) ids.add(SAMPLED[name][0]);",
    "      else if (parts.length) for (const id of parts) ids.add(id);",
    "      else ids.add(SAMPLED[name][0]);",
    "    } else if (FALLBACK[name]) addVoice(FALLBACK[name]);",
    "  };",
    "  for (const name of names) addVoice(name);",
    "  for (const name of [...(p.S.drums || []).map(([id]) => id), ...Object.keys(p.S.fill || {})]) {",
    "    const id = (p.S.drumkit === 'acoustic' && ACOUSTIC[name]) || ALWAYS[name];",
    "    if (id) ids.add(id);",
    "  }",
    "  return [...ids].sort();",
    "}",
  ].join("\n");
  if (!source.includes(inventoryAnchor)) fail("Local laohu-audio-score.mjs sample role inventory insertion point changed");
  return source.replace(inventoryAnchor, inventoryAnchor + "\n" + inventory);
}

async function createLocalRecordedRuntimeOverlay({ localRuntimeFiles, projectRoot }) {
  const tempRoot = path.join(projectRoot, ".cache", "tmp", "motion-local-integration", "audio");
  await fs.mkdir(tempRoot, { recursive: true });
  const runtimeRoot = await fs.mkdtemp(path.join(tempRoot, "recorded-runtime-"));
  const expectedModules = new Set([
    "laohu-audio-composed.mjs", "laohu-audio-composer.mjs", "laohu-audio-dsp.mjs", "laohu-audio-fx.mjs",
    "laohu-audio-mix.mjs", "laohu-audio-samples.mjs", "laohu-audio-score.mjs",
  ]);
  const modules = localRuntimeFiles.filter((row) => expectedModules.has(path.posix.basename(row.path)));
  if (modules.length !== expectedModules.size || new Set(modules.map((row) => path.posix.basename(row.path))).size !== expectedModules.size) {
    fail("The catalog-pinned local audio runtime is missing a unique module required for recorded-sample rendering");
  }
  const transformed = [];
  for (const row of modules.sort((a, b) => a.path.localeCompare(b.path))) {
    const sourcePath = path.resolve(skillDir, row.path);
    const sourceBytes = await fs.readFile(sourcePath);
    if (sha256(sourceBytes) !== shaField(row.sha256, "local audio runtime " + row.path + ".sha256")) fail("Local audio runtime changed while preparing the recorded-sample overlay: " + row.path);
    let body = sourceBytes.toString("utf8");
    const basename = path.posix.basename(row.path);
    if (basename === "laohu-audio-samples.mjs") body = patchStrictSamplesSource(body);
    if (basename === "laohu-audio-score.mjs") body = patchStrictScoreSource(body);
    const targetPath = path.join(runtimeRoot, basename);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, body);
    transformed.push({ path: row.path, sourceSha256: row.sha256, runtimeSha256: sha256(Buffer.from(body)) });
  }
  const closureSha256 = sha256(Buffer.from(canonical(transformed)));
  return { root: runtimeRoot, transformed, closureSha256 };
}

async function loadRecordedLocalAudioRuntime({ overlay, samplePackDir, projectRoot }) {
  const packRoot = await fs.realpath(samplePackDir).catch((error) => fail("Recorded sample pack directory is unavailable: " + error.message));
  const projectRootReal = await fs.realpath(projectRoot);
  if (!contains(projectRootReal, packRoot)) fail("Recorded sample pack must stay inside --project-root; home/cache fallback is prohibited");
  process.env.OM_SAMPLES = packRoot;
  process.env.LAOHU_REQUIRE_RECORDED = "1";
  process.env.LAOHU_FFMPEG = process.env.MOTION_FFMPEG || process.env.LAOHU_FFMPEG || "ffmpeg";
  const modulePath = (name) => pathToFileURL(path.join(overlay.root, name)).href;
  const [sound, composed, score, dsp, samples] = await Promise.all([
    import(modulePath("laohu-audio-mix.mjs")),
    import(modulePath("laohu-audio-composed.mjs")),
    import(modulePath("laohu-audio-score.mjs")),
    import(modulePath("laohu-audio-dsp.mjs")),
    import(modulePath("laohu-audio-samples.mjs")),
  ]);
  samples.resetPack?.();
  score.resetVoices?.();
  const selectedPack = samples.loadPack?.();
  if (!selectedPack || path.resolve(selectedPack.dir) !== packRoot) fail("Recorded local audio runtime did not cache the exact project-local sample pack before rendering");
  for (const [name, value] of [["SFX", sound.SFX], ["KITS", sound.KITS], ["Track", sound.Track], ["mixdown", sound.mixdown],
    ["loudness", sound.loudness], ["toWav", sound.toWav], ["readWav", sound.readWav], ["renderComposed", composed.renderComposed],
    ["plan", score.plan], ["deg", score.deg], ["mtof", dsp.mtof], ["rng", dsp.rng], ["sample trace", samples.__laohuSampleTrace],
    ["required sample inventory", score.__laohuRequiredSampleIds]]) {
    if (!value) fail("Recorded local Huashu audio runtime is missing API " + name);
  }
  if (sound.RATE !== RATE || dsp.RATE !== RATE) fail("Recorded local Huashu audio runtime sample rate differs from the audio-plan 48 kHz contract");
  const importPolicy = {
    environmentBeforeFirstImport: { OM_SAMPLES: packRoot, LAOHU_REQUIRE_RECORDED: "1", LAOHU_FFMPEG: process.env.LAOHU_FFMPEG },
    visiblePackAtFirstImport: true,
    packCacheInitializedForSelectedDirectoryBeforeRendering: true,
    environmentRestoredAfterImport: false,
  };
  return { sound, composed, score, dsp, samples, runtime: { overlayClosureSha256: overlay.closureSha256, overlayFiles: overlay.transformed, importPolicy } };
}

async function hashFile(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}

async function inspectRecordedPack({ packDir, projectRoot, requiredInstrumentIds, ffmpeg = process.env.MOTION_FFMPEG || "ffmpeg", ffprobe = process.env.MOTION_FFPROBE || (path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe") : "ffprobe") }) {
  const requested = path.resolve(packDir);
  const packRoot = await fs.realpath(requested).catch((error) => fail("Recorded sample pack directory is unavailable: " + error.message));
  if (!contains(projectRoot, packRoot)) fail("Recorded sample pack must stay inside --project-root; home/cache fallback is prohibited");
  const manifestFile = path.join(packRoot, "manifest.json"), noticeFile = path.join(packRoot, "NOTICE.txt");
  const manifestBytes = await fs.readFile(manifestFile).catch((error) => fail("Recorded sample pack manifest is missing: " + error.message));
  const noticeBytes = await fs.readFile(noticeFile).catch((error) => fail("Recorded sample pack NOTICE.txt is missing: " + error.message));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.version !== 2 || !manifest.instruments || typeof manifest.instruments !== "object" || Array.isArray(manifest.instruments)) fail("Recorded sample pack manifest must use upstream version 2 instrument shape");
  const required = [...new Set(requiredInstrumentIds)].sort();
  if (!required.length) fail("recorded-required was requested but this selected source preset uses no recorded instrument roles");
  const files = new Map(), credits = new Set(), licenses = new Set(), coverage = {};
  for (const id of required) {
    const instrument = manifest.instruments[id];
    if (!instrument || !Array.isArray(instrument.samples) || !instrument.samples.length) fail("Recorded sample pack lacks required instrument ID " + id);
    if (typeof instrument.license !== "string" || !instrument.license.trim() || !Array.isArray(instrument.credit) || !instrument.credit.length) fail("Recorded instrument " + id + " is missing license or credit evidence");
    licenses.add(instrument.license);
    for (const credit of instrument.credit) {
      if (typeof credit !== "string" || !credit.trim() || !noticeBytes.toString("utf8").includes(credit)) fail("NOTICE.txt does not include the manifest credit for recorded instrument " + id);
      credits.add(credit);
    }
    const rows = [...instrument.samples, ...(instrument.releases || [])];
    const roots = [];
    for (const [index, row] of rows.entries()) {
      plainObject(row, `recorded sample ${id}[${index}]`);
      if (typeof row.file !== "string" || !row.file || path.isAbsolute(row.file) || row.file.split(/[\\/]/).includes("..")) fail("Recorded sample path must be relative and stay inside the pack: " + id);
      const file = path.resolve(packRoot, row.file);
      const fileReal = await fs.realpath(file).catch((error) => fail("Recorded sample file is missing: " + id + "/" + row.file + " (" + error.message + ")"));
      if (!contains(packRoot, fileReal)) fail("Recorded sample file escapes the pack root: " + row.file);
      const stat = await fs.stat(fileReal);
      if (!stat.isFile() || stat.size < 16) fail("Recorded sample is not a usable regular file: " + row.file);
      if (![1, 2].includes(row.ch)) fail("Recorded sample channel metadata must be 1 or 2: " + row.file);
      if (!instrument.drum && !Number.isFinite(row.root)) fail("Pitched recorded sample has no finite root: " + row.file);
      if (Number.isFinite(row.root)) roots.push(row.root);
      const probe = spawnSync(ffprobe, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels,sample_rate,duration", "-of", "json", fileReal], { encoding: "utf8", maxBuffer: 1024 * 1024 });
      if (probe.error || probe.status !== 0) fail("Recorded sample cannot be probed: " + fileReal + " (" + (probe.error?.message || probe.stderr || probe.status) + ")");
      const stream = JSON.parse(probe.stdout).streams?.[0];
      if (!stream || Number(stream.channels) !== row.ch || !(Number(stream.sample_rate) > 0) || !(Number(stream.duration) > 0.005)) fail("Recorded sample metadata does not provide usable channel/duration coverage: " + fileReal);
      const decode = spawnSync(ffmpeg, ["-v", "error", "-i", fileReal, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
      if (decode.error || decode.status !== 0) fail("Recorded sample cannot be fully decoded: " + fileReal + " (" + (decode.error?.message || decode.stderr || decode.status) + ")");
      const digest = await hashFile(fileReal);
      files.set(row.file, { file: row.file, sha256: digest, bytes: stat.size, channels: Number(stream.channels), durationSec: Number(stream.duration), rootMidi: Number.isFinite(row.root) ? row.root : null, layer: row.layer ?? null, roundRobin: row.rr ?? null });
    }
    if (!instrument.drum && !roots.length) fail("Required pitched sample ID has no root-pitch coverage: " + id);
    coverage[id] = { sampleCount: instrument.samples.length, releaseCount: instrument.releases?.length || 0, rootMidiRange: roots.length ? [Math.min(...roots), Math.max(...roots)] : null, license: instrument.license, credit: instrument.credit };
  }
  return {
    packDir: packRoot,
    manifest: { sha256: sha256(manifestBytes), bytes: manifestBytes.length, version: manifest.version },
    notice: { sha256: sha256(noticeBytes), bytes: noticeBytes.length },
    requiredInstrumentIds: required,
    coverage,
    files: [...files.values()].sort((a, b) => a.file.localeCompare(b.file)),
    credits: [...credits].sort(), licenses: [...licenses].sort(),
  };
}

function requiredPresetSampleIds(score, presetPlan) {
  if (typeof score.__laohuRequiredSampleIds !== "function") fail("Strict runtime overlay is missing its source-derived sample-role inventory");
  return score.__laohuRequiredSampleIds(presetPlan);
}

function buildSourcePresetPlan({ preset, durationSec, resolvedEvents, id, keyContext, voice = false }) {
  const music = {
    ...(preset.product ? { product: preset.product } : { style: preset.style }),
    ...(preset.variant == null ? {} : { variant: preset.variant }),
    ...(preset.seed == null ? { seed: id } : { seed: preset.seed }),
    ...(preset.bpm == null ? {} : { bpm: preset.bpm }),
    ...(preset.keyMidi == null && !keyContext?.provided ? {} : { key: preset.keyMidi == null ? keyContext.rootMidi : preset.keyMidi }),
    ...(preset.scale == null && !keyContext?.provided ? {} : { scale: preset.scale || keyContext.scale }),
    ...(preset.loop == null ? {} : { loop: preset.loop }),
    ...(preset.motif == null ? {} : { motif: preset.motif }),
    ...(preset.rhythm == null ? {} : { rhythm: preset.rhythm }),
    ...(preset.ending == null ? {} : { ending: preset.ending }),
    ...(preset.suck == null ? {} : { suck: preset.suck }),
    ...(preset.floor == null ? {} : { floor: preset.floor }),
  };
  const labels = {};
  const energy = {};
  const ordered = (preset.sections || []).map((row) => {
    const event = resolvedEvents.get(row.eventId);
    if (!event) fail("No canonical shared event resolved for musicPreset section " + row.eventId);
    return { eventId: row.eventId, filmTimeSec: event.filmTimeSec, energy: row.energy };
  }).sort((a, b) => a.filmTimeSec - b.filmTimeSec || a.eventId.localeCompare(b.eventId));
  for (const row of ordered) {
    labels["scene:" + row.eventId] = row.filmTimeSec;
    if (row.energy != null) energy[row.eventId] = row.energy;
  }
  if (Object.keys(energy).length) music.energy = energy;
  let dropEvent = null, endEvent = null;
  if (preset.dropEventId != null) {
    dropEvent = resolvedEvents.get(preset.dropEventId);
    if (!dropEvent) fail("musicPreset.dropEventId is not a resolved canonical event");
    music.drop = preset.dropEventId;
  }
  if (preset.endEventId != null) {
    endEvent = resolvedEvents.get(preset.endEventId);
    if (!endEvent) fail("musicPreset.endEventId is not a resolved canonical event");
    music.end = endEvent.filmTimeSec;
  }
  const plan = { id, duration: durationSec, labels, music, voice };
  return { plan, requestedSections: ordered, dropEvent, endEvent };
}

function buildSweep(track, from, to, dsp) {
  if (!(to > from) || from < 0) return;
  const n = track.n, fc = (u) => { const tt = u * n / RATE; if (tt < from || tt > to + 0.05) return 20000; const x = Math.min(1, (tt - from) / (to - from)); return 700 * Math.pow(20000 / 700, x * x); };
  track.L.set(dsp.biquad(track.L, "lp", fc, 0.9)); track.R.set(dsp.biquad(track.R, "lp", fc, 0.9));
}

function rideEnergy(track, sections, durationSec, dsp) {
  const target = new Float32Array(track.n).fill(1);
  sections.forEach((section, index) => {
    const gain = dsp.undb(-12 * (1 - Math.min(1, section.energy)));
    for (let frame = dsp.N(section.t); frame < Math.min(track.n, dsp.N(sections[index + 1]?.t ?? durationSec + 1)); frame += 1) target[frame] = gain;
  });
  const coefficient = Math.exp(-1 / (0.05 * RATE));
  let gain = target[0];
  for (let frame = 0; frame < track.n; frame += 1) {
    gain = target[frame] + (gain - target[frame]) * coefficient;
    track.L[frame] *= gain; track.R[frame] *= gain;
  }
}

const AUTOMATION_DUCK_DEPTH_DB = Object.freeze({ impact: 6, stamp: 4, thud: 3, shutter: 2, hit: 2, subdrop: 3 });

function automateMusic(presetPlan, hits, dsp) {
  const n = dsp.N(presetPlan.duration), gain = new Float32Array(n).fill(1);
  const ramp = (at, length, from, to) => {
    const start = dsp.N(at), frames = dsp.N(length);
    for (let index = 0; index < frames && start + index < n; index += 1) if (start + index >= 0) gain[start + index] = Math.min(gain[start + index], from + (to - from) * (index / frames));
  };
  const hold = (at, until, value) => { for (let index = Math.max(0, dsp.N(at)); index < Math.min(n, dsp.N(until)); index += 1) gain[index] = Math.min(gain[index], value); };
  if (presetPlan.drop != null) { ramp(presetPlan.drop - presetPlan.suck, 0.03, 1, 0.03); hold(presetPlan.drop - presetPlan.suck + 0.03, presetPlan.drop - 0.003, 0.03); }
  if (presetPlan.end != null) { const length = presetPlan.ending === "stop" ? 0.02 : 0.012; ramp(presetPlan.end, length, 1, 0); hold(presetPlan.end + length, presetPlan.duration + 1, 0); }
  for (const hit of hits) {
    const depth = AUTOMATION_DUCK_DEPTH_DB[hit.name];
    if (!depth) continue;
    const low = dsp.undb(-depth * Math.min(1.5, hit.gain ?? 1));
    ramp(hit.at - 0.01, 0.01, 1, low); hold(hit.at, hit.at + 0.08, low); ramp(hit.at + 0.08, 0.3, low, 1);
  }
  return gain;
}

function resolveDerivedDuckHits({ hits, manualAutomation = [], effectiveSpeed = 1 }) {
  const speed = finite(effectiveSpeed, "derived hit-automation effectiveSpeed", { min: 0.000001, max: 256 });
  const musicAutomation = manualAutomation.filter((row) => row.bus === "music");
  const applied = [];
  const suppressed = [];
  for (const hit of hits) {
    if (!AUTOMATION_DUCK_DEPTH_DB[hit.name]) continue;
    const filmTimeSec = finite(hit.filmTimeSec == null ? hit.at : hit.filmTimeSec, "derived hit-automation filmTimeSec");
    const filmStartSec = filmTimeSec - 0.01 / speed;
    const filmEndSec = filmTimeSec + 0.38 / speed;
    const conflicts = musicAutomation.filter((row) => {
      const exactEvent = typeof row.eventId === "string" && row.eventId === hit.eventId;
      const overlaps = row.startSec < filmEndSec && row.endSec > filmStartSec;
      return exactEvent || overlaps;
    });
    if (!conflicts.length) {
      applied.push(hit);
      continue;
    }
    suppressed.push({
      eventId: hit.eventId,
      hitName: hit.name,
      derivedDuckFilmRangeSec: [filmStartSec, filmEndSec],
      manualAutomation: conflicts.map((row) => ({ id: row.id || null, eventId: typeof row.eventId === "string" ? row.eventId : null, startSec: row.startSec, endSec: row.endSec })),
      reason: conflicts.some((row) => row.eventId === hit.eventId) ? "same-canonical-event-manual-automation-wins" : "overlapping-film-range-manual-automation-wins",
    });
  }
  return { applied, suppressed };
}

function applyGain(track, values) { for (let index = 0; index < track.n; index += 1) { track.L[index] *= values[index]; track.R[index] *= values[index]; } }

function balanceLows(track, dsp) {
  const mono = new Float32Array(track.n);
  for (let index = 0; index < track.n; index += 1) mono[index] = (track.L[index] + track.R[index]) / 2;
  const rms = (samples) => { let total = 0; for (const sample of samples) total += sample * sample; return Math.sqrt(total / samples.length); };
  const excess = dsp.db(rms(dsp.biquad(mono, "lp", 120))) - dsp.db(rms(dsp.biquad(dsp.biquad(mono, "hp", 400), "lp", 2000)));
  if (!(excess > 0)) return 0;
  const amount = 1 - dsp.undb(-Math.min(8, excess));
  for (const channel of [track.L, track.R]) { const low = dsp.biquad(channel, "lp", 160); for (let index = 0; index < track.n; index += 1) channel[index] -= low[index] * amount; }
  return Math.min(8, excess);
}

function renderPresetStem({ upstream, presetPlan, hits, voiceWindows = [] }) {
  const { sound, score, dsp } = upstream;
  const seed = `music:${presetPlan.style}:${presetPlan.seed}:${presetPlan.bpm}`;
  const rng = dsp.rng(seed);
  const music = new sound.Track(presetPlan.duration), fx = new sound.Track(presetPlan.duration);
  const buses = Object.fromEntries(["pad", "bass", "drums", "keys", "arp", "lead"].map((name) => [name, new sound.Track(presetPlan.duration)]));
  const { kicks } = score.renderScore(presetPlan, { music, ...buses, fx }, rng);
  score.pump(buses.pad, kicks, presetPlan.S.pump || 0, presetPlan.B);
  score.pump(buses.bass, kicks, 0.5, presetPlan.B, 0.35);
  for (const track of [...Object.values(buses), fx]) for (let index = 0; index < music.n; index += 1) { music.L[index] += track.L[index]; music.R[index] += track.R[index]; }
  const [wet, size] = presetPlan.S.reverb || [0.12, 1];
  dsp.reverb(music.L, music.R, wet, size);
  if (presetPlan.drop != null) buildSweep(music, presetPlan.drop - 2 * 4 * presetPlan.B, presetPlan.drop - presetPlan.suck, dsp);
  rideEnergy(music, presetPlan.sections, presetPlan.duration, dsp);
  applyGain(music, automateMusic(presetPlan, hits, dsp));
  const fade = presetPlan.end != null ? 0 : Math.min(1.2, presetPlan.duration * 0.1);
  for (let index = 0; index < music.n; index += 1) {
    const time = index / RATE, gain = Math.min(1, time / 0.03, fade ? (presetPlan.duration - time) / fade : 1);
    music.L[index] *= gain; music.R[index] *= gain;
  }
  score.master(presetPlan, music.L, music.R, rng);
  balanceLows(music, dsp);
  if (voiceWindows.length) {
    if (typeof sound.duck !== "function") fail("Pinned local audio runtime does not expose the original duck function for a generated music stem");
    sound.duck(music, voiceWindows);
  }
  return {
    track: music, kicks, rngSeed: seed,
    voiceDuckProcessing: voiceWindows.length ? {
      applied: true, processor: "original sound.duck source fragment",
      wordWindows: voiceWindows, coordinateBasis: "music-stem source-local seconds",
    } : null,
  };
}

function mapEventsToSelectedSource({ eventIds, resolvedEvents, track, asset, planMaps }) {
  const mapping = track.timeMapId ? planMaps.get(track.timeMapId) : null;
  if (track.timeMapId && !mapping) fail("Selected music track references a missing audio-plan timeMapId " + track.timeMapId);
  const trackSpeed = track.speed == null ? 1 : finite(track.speed, "selected music track.speed", { min: 0.000001, max: 16 });
  const combinedSpeed = trackSpeed * (mapping?.speed || 1);
  const trackStartSec = finite(track.startSec, "selected music track.startSec");
  const filmStartSec = mapping ? mapLocalTimeToFilm(trackStartSec, mapping) : trackStartSec;
  const sourceInSec = track.sourceInSec == null ? 0 : track.sourceInSec;
  const sourceOutSec = track.sourceOutSec == null ? asset.durationSec : track.sourceOutSec;
  if (!(sourceOutSec > sourceInSec) || sourceOutSec > asset.durationSec + 1e-8) fail("Selected music track source range is invalid for asset " + asset.id);
  const durationSec = sourceOutSec - sourceInSec;
  const out = new Map();
  for (const eventId of eventIds) {
    const event = resolvedEvents.get(eventId);
    if (!event) fail("Selected music track eventId is not resolved: " + eventId);
    const sourceAbsoluteSec = sourceInSec + (event.filmTimeSec - filmStartSec) * combinedSpeed;
    const localSec = sourceAbsoluteSec - sourceInSec;
    if (sourceAbsoluteSec < sourceInSec - 1e-8 || sourceAbsoluteSec > sourceOutSec + 1e-8) continue;
    out.set(eventId, { ...event, filmTimeSec: localSec, sourceAbsoluteSec, localSec, filmGlobalSec: event.filmTimeSec });
  }
  return { events: out, mapping, trackSpeed, combinedSpeed, filmStartSec, sourceInSec, sourceOutSec, durationSec };
}

async function decodeMusicAssetRange({ file, sourceInSec, sourceOutSec, expectedFrames, ffmpeg = process.env.MOTION_FFMPEG || "ffmpeg" }) {
  const result = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-af", `atrim=start=${sourceInSec}:end=${sourceOutSec},asetpts=PTS-STARTPTS`, "-ac", "2", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 256 << 20 });
  if (result.error || result.status !== 0) fail("Selected source music could not be decoded: " + (result.error?.message || result.stderr || result.status));
  const byteLength = result.stdout.length & ~3;
  if (byteLength < 8) fail("Selected source music decoder returned empty PCM");
  const samples = new Float32Array(result.stdout.buffer.slice(result.stdout.byteOffset, result.stdout.byteOffset + byteLength));
  if (samples.length % 2 !== 0 || [...samples].some((sample) => !Number.isFinite(sample))) fail("Selected source music decoder returned malformed stereo float PCM");
  const frames = samples.length / 2;
  if (Math.abs(frames - expectedFrames) > 2) fail(`Selected source music decoded ${frames} frames; expected ${expectedFrames} for its declared source range`);
  const track = { n: expectedFrames, L: new Float32Array(expectedFrames), R: new Float32Array(expectedFrames), decodedFrameCount: frames, frameAdjustment: expectedFrames - frames };
  for (let index = 0; index < Math.min(frames, expectedFrames); index += 1) { track.L[index] = samples[index * 2]; track.R[index] = samples[index * 2 + 1]; }
  return track;
}

function supportedSfxOptionKeys(fn) {
  const source = Function.prototype.toString.call(fn);
  const parameterMatch = /^[^(]*\(\s*([A-Za-z_$][\w$]*)/.exec(source)
    || /^\s*(?:async\s*)?([A-Za-z_$][\w$]*)\s*=>/.exec(source);
  if (!parameterMatch) return new Set();
  const parameter = parameterMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const property = new RegExp(`\\b${parameter}\\s*(?:\\?\\.)?\\.\\s*([A-Za-z_$][\\w$]*)`, "g");
  const keys = new Set();
  for (const match of source.matchAll(property)) keys.add(match[1]);
  return keys;
}

function renderOneSfx({ upstream, name, kitName, options, sourceGain, sourcePan, seed, key }) {
  const kit = upstream.sound.KITS[kitName];
  if (!kit) fail("Unknown Huashu Motion SFX kit: " + kitName);
  const source = upstream.sound.SFX[name];
  if (!source) fail("Unknown Huashu Motion SFX name: " + name);
  const fn = typeof kit[name] === "function" ? kit[name] : source.fn;
  if (typeof fn !== "function") fail("Huashu Motion has no callable SFX function for " + kitName + "/" + name);
  const hitOptions = { ...options, gain: sourceGain, pan: sourcePan };
  if (Object.prototype.hasOwnProperty.call(options, "at") || Object.prototype.hasOwnProperty.call(options, "gain") || Object.prototype.hasOwnProperty.call(options, "pan")) fail("SFX options may not override upstream event placement fields at/gain/pan; use eventId, sourceGain, sourcePan, and mixGainDb");
  const supportedOptions = supportedSfxOptionKeys(fn);
  for (const optionName of Object.keys(options)) {
    if (!supportedOptions.has(optionName)) fail(`SFX option ${optionName} is not read by the selected ${kitName}/${name} producer; remove it or choose a producer that supports it`);
  }
  let signal = normalizeSignal(fn(hitOptions, upstream.dsp.rng(seed), key), "Huashu SFX " + name);
  if (typeof kit.post === "function") {
    const post = (channel) => {
      const result = kit.post(channel);
      if (!(result instanceof Float32Array) || result.length !== channel.length) fail("Huashu kit post processor changed signal shape for " + kitName + "/" + name);
      return result;
    };
    signal = { ...signal, sig: signal.stereo ? signal.sig.map(post) : post(signal.sig) };
  }
  const track = new upstream.sound.Track(signal.durationSec);
  if (signal.stereo) {
    // This is the source renderSfx() stereo convention: hard-pan the original pair; event pan is used only for mono.
    track.add(signal.sig[0], 0, sourceGain, -1);
    track.add(signal.sig[1], 0, sourceGain, 1);
  } else track.add(signal.sig, 0, sourceGain, sourcePan);
  return { wav: floatWav(track), lead: signal.lead, durationSec: track.n / RATE, stereoSource: signal.stereo, sourceGain, sourcePan: signal.stereo ? null : sourcePan, sourcePanApplied: signal.stereo ? "upstream-stereo-hard-pan; event pan ignored by upstream renderSfx" : "baked-into-generated-WAV", options: hitOptions };
}

function buildComposerHitRows(rendered, bindings, resolvedEvents, kitName, requestSeed, key, upstream, scene) {
  const cueRows = rendered.perf.cues.filter((cue) => cue.type === "hit" || cue.type === "rise");
  const hits = asArray(rendered.hits, "renderComposed.hits");
  const expected = cueRows.reduce((count, cue) => count + (cue.type === "hit" ? 2 : 1), 0);
  if (hits.length !== expected) fail("renderComposed hit list no longer matches its pinned hit/rise cue contract; refusing to drop or invent effects");
  if (bindings.cueBindings.size !== cueRows.length) fail("Every renderComposed hit/rise cue must have exactly one score-hash-pinned canonical event binding");
  for (const ordinal of bindings.cueBindings.keys()) if (ordinal >= cueRows.length) fail("Score cue binding points beyond the current hit/rise cue list: " + ordinal);
  const tolerance = toleranceForScene(scene);
  const rows = [];
  let hitIndex = 0;
  cueRows.forEach((cue, cueOrdinal) => {
    const eventId = bindings.cueBindings.get(cueOrdinal);
    if (!eventId) fail("renderComposed hit/rise cue ordinal " + cueOrdinal + " has no canonical event binding");
    const event = resolvedEvents.get(eventId);
    if (!event) fail("No canonical global event was resolved for composer hit/rise binding " + eventId);
    if (Math.abs(cue.at - event.filmTimeSec) > tolerance) fail("Composer cue ordinal " + cueOrdinal + " time " + cue.at + " does not match canonical event " + eventId + " at " + event.filmTimeSec + "; rebuild the visual/audio binding rather than snapping it");
    const count = cue.type === "hit" ? 2 : 1;
    for (let effectIndex = 0; effectIndex < count; effectIndex += 1) {
      const hit = hits[hitIndex++];
      if (Math.abs(finite(hit.at, "renderComposed hit.at") - cue.at) > 1 / RATE) fail("renderComposed hit timing no longer corresponds to its bound score cue");
      rows.push({
        id: `${eventId}--score-cue-${cueOrdinal}--${hit.name}`,
        eventId, phaseId: event.phaseId, timeMapId: event.timeMapId, filmTimeSec: event.filmTimeSec,
        name: hit.name, options: { dur: hit.dur }, kit: kitName,
        sourceGain: clampGain(hit.gain, "renderComposed hit gain"), sourcePan: finite(hit.pan == null ? 0 : hit.pan, "renderComposed hit pan", { min: -1, max: 1 }),
        seed: `${hit.name}:${hitIndex - 1}:${hit.at}`, seedBasis: "upstream renderSfx seed name:index:at",
        mixGainDb: 0, sourceCue: { cueOrdinal, cueType: cue.type, cueAtSec: cue.at, effectIndex },
      });
    }
  });
  if (rendered.report?.unmatched?.length) fail("Composer score has unmatched marks; alignment is refused: " + rendered.report.unmatched.join(", "));
  return rows;
}

async function generatePlan({ request, basePlan, basePlanPath, film, inputFiles = [], requestFilePath = null, requestFileSha256 = null, assetsDir, projectRoot, outputPlan, manifestPath }) {
  if (typeof basePlanPath !== "string" || !basePlanPath) fail("basePlanPath is required to preserve relative project assets and ASR evidence references");
  const basePlanDirectory = await fs.realpath(path.dirname(path.resolve(basePlanPath))).catch((error) => fail("Base audio-plan directory is unavailable: " + error.message));
  const outputPlanDirectory = await fs.realpath(path.dirname(path.resolve(outputPlan))).catch((error) => fail("Output audio-plan directory must exist: " + error.message));
  if (basePlanDirectory !== outputPlanDirectory) fail("Base and generated audio plans must stay in the same directory so relative asset files and ASR evidence references retain their consumer paths");
  validatePlan(basePlan);
  const filmManifestSha256 = sha256(await fs.readFile(film.manifestPath));
  const durationSec = finite(basePlan.durationSec, "audio plan durationSec", { min: 0.001, max: 600 });
  if (basePlan.sampleRate !== RATE || basePlan.channels !== 2) fail("Base audio plan must use the existing 48 kHz stereo contract");
  const nativeSourceEvents = asArray(film.scene?.audioEvents || [], "compiled film audioEvents").filter((event) => event?.sourceAudio);
  const nativeSourceCompositions = film.nativeSourceCompositions || [];
  const nativeSourcePresetPlans = film.nativeSourcePresetPlans || [];
  const nativeSourceSfxOnlyPlans = film.nativeSourceSfxOnlyPlans || [];
  const validatedRequest = validateRequest(request, durationSec, nativeSourceEvents, nativeSourceCompositions, nativeSourcePresetPlans);
  const baseMusicTracks = (basePlan.tracks || []).filter((track) => track.bus === "music");
  const explicitMusic = validatedRequest.composition != null || validatedRequest.musicPreset != null;
  const autoNativeCompositions = !explicitMusic && baseMusicTracks.length === 0 ? nativeSourceCompositions : [];
  const autoNativePresetPlans = !explicitMusic && baseMusicTracks.length === 0 ? nativeSourcePresetPlans : [];
  const autoNativeSfxOnlyPlans = !explicitMusic && baseMusicTracks.length === 0 ? nativeSourceSfxOnlyPlans : [];
  const nativeSourceMixdownSources = [
    ...autoNativeCompositions.map((source) => ({ source, sourceKind: "abc-score" })),
    ...autoNativePresetPlans.map((source) => ({ source, sourceKind: "default-score-preset" })),
    ...autoNativeSfxOnlyPlans.map((source) => ({ source, sourceKind: "sfx-only" })),
  ];
  const nativeSourceMixdownSelection = nativeSourceMixdownEligibility(request, validatedRequest, basePlan, baseMusicTracks);
  if (!nativeSourceMixdownSources.length) nativeSourceMixdownSelection.reasons.push("no-automatic-native-source-soundtrack-or-music-off-SFX-group");
  nativeSourceMixdownSelection.eligible = nativeSourceMixdownSelection.eligible && nativeSourceMixdownSources.length > 0;
  const useNativeSourceMixdown = nativeSourceMixdownSelection.eligible;
  const hasSelectedExistingMusic = Boolean(validatedRequest.musicPreset?.selectedMusicTrackId);
  const requiredGenerationScopes = new Set();
  if (validatedRequest.composition) {
    requiredGenerationScopes.add("music");
    if (validatedRequest.cueBindings.size) requiredGenerationScopes.add("sfx");
  }
  if (validatedRequest.musicPreset && !hasSelectedExistingMusic) requiredGenerationScopes.add("music");
  if (validatedRequest.manualRows.length || validatedRequest.nativeSourceEvents.length) requiredGenerationScopes.add("sfx");
  const nativeSceneHasSfx = (source) => {
    const sourceScenes = film.nativeBaseSources?.size ? film.nativeBaseSources : film.sourceScenes;
    const sourceScene = sourceScenes?.get(source.segmentId)?.scene;
    return Boolean((sourceScene?.audioEvents || []).some((event) => ["declared-sfx", "score-sfx"].includes(event?.sourceAudio?.kind))
      || (source.expectedCues || []).some((cue) => cue?.type === "hit" || cue?.type === "rise")
      || (source.sourceDeclaration?.hits || []).length);
  };
  for (const source of autoNativeCompositions) {
    requiredGenerationScopes.add("music");
    if (nativeSceneHasSfx(source)) requiredGenerationScopes.add("sfx");
  }
  for (const source of autoNativePresetPlans) {
    requiredGenerationScopes.add("music");
    if (nativeSceneHasSfx(source)) requiredGenerationScopes.add("sfx");
  }
  if (autoNativeSfxOnlyPlans.length) requiredGenerationScopes.add("sfx");
  if (useNativeSourceMixdown) {
    for (const { source, sourceKind } of nativeSourceMixdownSources) {
      if (sourceKind === "sfx-only") requiredGenerationScopes.add("sfx");
      else {
        requiredGenerationScopes.add("music");
        if (nativeSceneHasSfx(source)) requiredGenerationScopes.add("sfx");
      }
    }
  }
  const requiredGenerationScopeList = [...requiredGenerationScopes].sort();
  const requiresOriginalAudioGeneration = requiredGenerationScopeList.length > 0;
  if (requiresOriginalAudioGeneration && !validatedRequest.generationAuthorization) {
    fail(`This request would synthesize ${requiredGenerationScopeList.join(" and ")} audio. Ordinary animation production uses reviewed finished audio assets first; this specialist source-generation route requires an explicit user request granting exactly the required music/sfx scope. Do not infer authorization from a missing asset or a musicPreset/SFX cue.`);
  }
  if (requiresOriginalAudioGeneration) {
    const granted = new Set(validatedRequest.generationAuthorization.scopes);
    const missing = requiredGenerationScopeList.filter((scope) => !granted.has(scope));
    if (missing.length) fail(`generationAuthorization does not grant required ${missing.join(" and ")} generation scope(s); no audio was synthesized. Expand the user's explicit authorization or use reviewed finished assets.`);
    if (!requestFilePath || !/^[a-f0-9]{64}$/i.test(requestFileSha256 || "")) fail("Original audio generation requires the exact request file and SHA-256 before synthesis starts");
  }
  let requestGeneratedSourceGroupSelection = requestGeneratedSourceGroupEligibility({
    validatedRequest, basePlan, baseMusicTracks, nativeSourceEvents: validatedRequest.nativeSourceEvents,
  });
  if (!requestFilePath || !/^[a-f0-9]{64}$/i.test(requestFileSha256 || "")) {
    requestGeneratedSourceGroupSelection.reasons.push("original-request-file-provenance-unavailable");
    requestGeneratedSourceGroupSelection.eligible = false;
  }
  const nativeMusicSourcesCount = nativeSourceCompositions.length + nativeSourcePresetPlans.length;
  const autoNativeMusicSourcesCount = autoNativeCompositions.length + autoNativePresetPlans.length;
  const nativeCompositionSuppression = nativeMusicSourcesCount && autoNativeMusicSourcesCount === 0
    ? { count: nativeMusicSourcesCount, scoreCount: nativeSourceCompositions.length, presetCount: nativeSourcePresetPlans.length, reason: explicitMusic ? "explicit-audio-request-selected-the-film-music-source" : "existing-audio-plan-music-track-preserved" }
    : null;
  const hasMusic = explicitMusic || autoNativeMusicSourcesCount > 0;
  const selectedMusicTrackId = validatedRequest.musicPreset?.selectedMusicTrackId || null;
  if (selectedMusicTrackId && validatedRequest.musicPreset.samples) fail("recorded-required samples apply only to newly generated preset stems, not a selected existing BGM track");
  let selectedMusicTrack = null;
  if (hasMusic && selectedMusicTrackId) {
    const matches = baseMusicTracks.filter((track) => track.id === selectedMusicTrackId);
    if (matches.length !== 1) fail("musicPreset.selectedMusicTrackId must match exactly one existing base music track");
    selectedMusicTrack = matches[0];
    if (selectedMusicTrack.locked) fail("A locked music track cannot be transformed; choose an unlocked source track");
  } else if (hasMusic && baseMusicTracks.length) {
    fail("Base audio plan already has a music track; select one unlocked track explicitly for derivation or resolve the existing soundtrack before generating another");
  }
  const idList = [...new Set([...normalizeBindings(validatedRequest), ...nativeSourceEvents.map((event) => event.id)])].sort();
  const resolvedEvents = resolveSourceEvents(idList, durationSec, film);
  const kitName = request.sfxKit == null ? "clean" : request.sfxKit;
  const manualRows = validatedRequest.manualRows.map((item) => {
    const event = resolvedEvents.get(item.eventId);
    if (!event) fail("No canonical global event was resolved for manual SFX " + item.id);
    const options = plainObject(item.options == null ? {} : item.options, "SFX " + item.id + ".options");
    if (Object.keys(options).some((key) => ["at", "gain", "pan"].includes(key))) fail("SFX options may not override upstream event placement fields at/gain/pan; use eventId, sourceGain, sourcePan, and mixGainDb");
    return {
      id: item.id, eventId: item.eventId, phaseId: event.phaseId, timeMapId: event.timeMapId, filmTimeSec: event.filmTimeSec,
      name: item.name, options,
      kit: item.kit == null ? kitName : item.kit,
      sourceGain: clampGain(item.sourceGain, "SFX " + item.id + ".sourceGain"),
      sourcePan: finite(item.sourcePan == null ? 0 : item.sourcePan, "SFX " + item.id + ".sourcePan", { min: -1, max: 1 }),
      seed: item.seed == null ? `${item.name}:${item.id}:${event.filmTimeSec}` : item.seed,
      seedBasis: item.seed == null ? "stable request default name:id:canonical-film-time" : "explicit request seed",
      mixGainDb: finite(item.mixGainDb == null ? 0 : item.mixGainDb, "SFX " + item.id + ".mixGainDb", { min: -120, max: 24 }),
      sourceCue: { kind: "explicit-sfx-event", requestId: item.id },
    };
  });
  const scene = film.scene;
  if (finite(scene.duration, "compiled audio-event scene.duration", { min: 0.001 }) + 1e-8 < durationSec) fail("Compiled audio-event scene is shorter than the audio-plan duration");
  const samplePackDir = validatedRequest.musicPreset?.samples?.packDir || null;
  if (samplePackDir && !contains(projectRoot, path.resolve(samplePackDir))) fail("musicPreset.samples.packDir must stay inside --project-root");
  const localAudio = await loadLocalAudioRuntime();
  const pin = localAudio.pin;
  const sampleRuntime = samplePackDir ? await createLocalRecordedRuntimeOverlay({ localRuntimeFiles: localAudio.runtime.files, projectRoot }) : null;
  const upstream = sampleRuntime
    ? await loadRecordedLocalAudioRuntime({ overlay: sampleRuntime, samplePackDir, projectRoot })
    : localAudio;
  const voiceTrackCount = (basePlan.tracks || []).filter((track) => track.bus === "voice").length;
  const requestVoiceTrack = (basePlan.tracks || []).find((track) => track.bus === "voice");
  const requestVoiceAsset = requestVoiceTrack && (basePlan.assets || []).find((asset) => asset.id === requestVoiceTrack.assetId);
  const splitMusicNeedsVoiceLevel = Boolean((validatedRequest.musicPreset || autoNativePresetPlans.length) && voiceTrackCount === 1
    && requestVoiceTrack.locked && voiceTrackUsesUntrimmedOneXSource(requestVoiceTrack, requestVoiceAsset)
    && (basePlan.voiceWindows || []).length);
  const voiceInput = (useNativeSourceMixdown && nativeSourceMixdownSelection.voiceTrackId) || splitMusicNeedsVoiceLevel
    ? await measureLockedVoiceLufs({ basePlan, basePlanDirectory, upstream, ffmpeg: process.env.MOTION_FFMPEG || "ffmpeg" })
    : null;
  const nativeSourceMixdownResults = useNativeSourceMixdown ? nativeSourceMixdownSources.map(({ source, sourceKind }) => {
    const verified = nativeSourceMixdownInput({ source, sourceKind, film, upstream });
    const sourceMixBusMode = sourceKind === "abc-score"
      ? "not-applicable-abc-score"
      : sourceKind === "sfx-only" ? "not-applicable-music-off"
        : process.env.OM_MIX === "chains" ? "chains" : "default-sum";
    const timeMap = film.maps.get(source.timeMapId);
    const mappedWords = voiceInput
      ? mapVoiceWindowsToNativeSegment(voiceInput.voiceWindows, timeMap, verified.durationSec)
      : [];
    const voiced = mappedWords.length > 0;
    const mixed = upstream.sound.mixdown(verified.sourceDeclaration, {
      voiced, words: mappedWords,
      voiceLufs: voiceInput?.voiceLufs ?? null,
      score: verified.scoreText,
    });
    if (!mixed?.out2 || !(mixed.out2.L instanceof Float32Array) || !(mixed.out2.R instanceof Float32Array)) fail("Original sound.mixdown did not return stereo float PCM for segment " + source.segmentId);
    if (mixed.p.duration !== verified.durationSec || mixed.out2.n !== Math.round(verified.durationSec * RATE)) fail("Original sound.mixdown frame count differs from the pinned native OM source duration for segment " + source.segmentId);
    const sourceEvents = verifyNativeMixdownHitRows({ mixdown: mixed, source, sourceScene: verified.sourceScene });
    return { ...verified, mixed, sourceEvents, sourceMixBusMode, mappedWords, voiced, voiceInput, timeMap };
  }) : [];
  const nativeSourceMixdownEventIds = new Set(nativeSourceMixdownResults.flatMap((row) => row.sourceEvents.map((event) => event.id)));
  const nativeComposerResults = useNativeSourceMixdown ? [] : autoNativeCompositions.map((source) => {
    if (sha256(Buffer.from(source.scoreText, "utf8")) !== source.scoreSha256) fail("Native OM source score changed after Film manifest verification: " + source.segmentId);
    const rendered = upstream.composed.renderComposed(source.scoreText, {
      labels: source.labels,
      marks: source.marks,
      duration: source.durationSec,
      seed: source.seed,
    });
    const actualCues = (rendered.perf?.cues || []).filter((cue) => ["hit", "rise"].includes(cue.type));
    if (canonical(actualCues) !== canonical(source.expectedCues)) fail("Native OM source score cue timeline no longer matches the initialized source runtime: " + source.segmentId);
    if (rendered.report?.unmatched?.length) fail("Native OM source score has unmatched labels: " + rendered.report.unmatched.join(", "));
    if (!(rendered.music?.L instanceof Float32Array) || !(rendered.music?.R instanceof Float32Array)) fail("Native OM source score did not produce stereo PCM: " + source.segmentId);
    return { source, rendered };
  });
  const nativePresetResults = useNativeSourceMixdown ? [] : autoNativePresetPlans.map((source) => {
    if (sha256(Buffer.from(canonical(source.sourceDeclaration), "utf8")) !== source.sourceDeclarationSha256) fail("Native OM source p0 declaration changed after Film manifest verification: " + source.segmentId);
    if (sha256(Buffer.from(canonical(source.sourcePlan), "utf8")) !== source.sourcePlanSha256) fail("Native OM source score.plan snapshot changed after Film manifest verification: " + source.segmentId);
    if (source.sourceDeclaration.music?.off) fail("Native OM default preset plan was registered with music.off=true: " + source.segmentId);
    const recalculatedPlan = upstream.sound.plan({ ...source.sourceDeclaration, voice: false });
    const recalculatedPlanData = JSON.parse(JSON.stringify(recalculatedPlan));
    if (canonical(recalculatedPlanData) !== canonical(source.sourcePlan)) fail("Pinned original score.plan no longer reproduces the native OM default preset snapshot: " + source.segmentId);
    const voicePolicy = resolveNativePresetVoicePolicy({
      basePlan, timeMap: film.maps.get(source.timeMapId), durationSec: recalculatedPlan.duration,
      voiceLufs: voiceInput?.voiceLufs ?? null,
    });
    const rendered = renderPresetStem({ upstream, presetPlan: recalculatedPlan, hits: source.sourceDeclaration.hits, voiceWindows: voicePolicy.voiceWindowsToBake });
    if (voicePolicy.voiceDuckProcessing) rendered.voiceDuckProcessing = voicePolicy.voiceDuckProcessing;
    const { sourceVoiced, targetLufs } = voicePolicy;
    const measuredLufs = upstream.sound.loudness(rendered.track.L, rendered.track.R);
    if (Number.isFinite(measuredLufs)) {
      const gain = upstream.dsp.undb(targetLufs - measuredLufs);
      for (let index = 0; index < rendered.track.n; index += 1) {
        rendered.track.L[index] *= gain;
        rendered.track.R[index] *= gain;
      }
    }
    rendered.sourceMusicLevel = {
      targetLufs, preTargetLufs: Number.isFinite(measuredLufs) ? measuredLufs : null,
      targetBasis: sourceVoiced ? (voiceInput ? "locked voice stereo LUFS - 12" : "source fallback -28 LUFS") : "source unvoiced -18 LUFS",
      normalizationApplied: Number.isFinite(measuredLufs),
    };
    if (rendered.voiceDuckProcessing) rendered.voiceDuckProcessing.voiceWindowsSha256 = (basePlan.voiceWindows || []).length
      ? sha256(Buffer.from(canonical(basePlan.voiceWindows), "utf8"))
      : null;
    return { source, plan: recalculatedPlan, rendered, targetLufs, measuredLufs };
  });
  let sfxKeyContext = { ...validatedRequest.keyContext, basis: validatedRequest.keyContextProvided ? "explicit-request-keyContext" : "default-request-keyContext" };
  let key = keyFunction(sfxKeyContext, upstream);
  let composerResult = null;
  let presetResult = null;
  let presetRendered = null;
  let requestGeneratedSourceGroupResult = null;
  let presetSamplePack = null;
  let selectedSource = null;
  if (validatedRequest.composition) {
    composerResult = upstream.composed.renderComposed(validatedRequest.composition.scoreText, {
      marks: Object.fromEntries([...validatedRequest.marks].map(([name, eventId]) => [name, resolvedEvents.get(eventId).filmTimeSec])),
      duration: durationSec,
      seed: validatedRequest.composition.seed,
    });
    if (!composerResult || !composerResult.music || !(composerResult.music.L instanceof Float32Array) || !(composerResult.music.R instanceof Float32Array)) fail("renderComposed did not return stereo Float32Array music PCM");
    if (composerResult.report?.unmatched?.length) fail("Composer score has unmatched marks; generated music is not aligned: " + composerResult.report.unmatched.join(", "));
    const scoreMarkCues = composerResult.perf.cues.filter((cue) => cue.type === "mark");
    const seenMarkNames = new Set();
    for (const cue of scoreMarkCues) {
      if (seenMarkNames.has(cue.name)) fail("Composer score repeats mark name " + cue.name + "; its event binding would be ambiguous");
      seenMarkNames.add(cue.name);
      const eventId = validatedRequest.marks.get(cue.name);
      if (!eventId) fail("Composer mark " + cue.name + " has no score-hash-pinned canonical event binding");
      const event = resolvedEvents.get(eventId);
      if (!event || Math.abs(cue.at - event.filmTimeSec) > toleranceForScene(scene)) fail("Composer mark " + cue.name + " did not land on its canonical shared event " + eventId);
    }
    for (const name of validatedRequest.marks.keys()) if (!seenMarkNames.has(name)) fail("Mark binding refers to a name that is absent from the current score: " + name);
  } else if (validatedRequest.musicPreset) {
    if (selectedMusicTrack) {
      const asset = (basePlan.assets || []).find((row) => row.id === selectedMusicTrack.assetId);
      if (!asset) fail("Selected music track references a missing project asset: " + selectedMusicTrack.assetId);
      const assetPath = path.resolve(basePlanDirectory, asset.file);
      const verifiedAsset = await verifyFileHash(assetPath, asset.sha256, "selected source music asset " + asset.id);
      if (!contains(projectRoot, verifiedAsset.path)) fail("Selected source music asset must stay inside --project-root");
      const eventIds = [...new Set([
        ...(validatedRequest.musicPreset.sections || []).map((row) => row.eventId),
        ...(validatedRequest.musicPreset.dropEventId ? [validatedRequest.musicPreset.dropEventId] : []),
        ...(validatedRequest.musicPreset.endEventId ? [validatedRequest.musicPreset.endEventId] : []),
        ...validatedRequest.manualRows.map((row) => row.eventId),
      ])];
      const clock = mapEventsToSelectedSource({ eventIds, resolvedEvents, track: selectedMusicTrack, asset, planMaps: new Map((basePlan.timeMaps || []).map((row) => [row.id, row])) });
      const pcm = await decodeMusicAssetRange({ file: assetPath, sourceInSec: clock.sourceInSec, sourceOutSec: clock.sourceOutSec, expectedFrames: Math.round(clock.durationSec * RATE) });
      selectedSource = { track: selectedMusicTrack, asset, assetPath, assetSha256: verifiedAsset.sha256, clock, decodedFrames: pcm.decodedFrameCount, frameAdjustment: pcm.frameAdjustment, trackPcm: pcm };
      const selectedClockEvents = clock.events;
      presetResult = buildSourcePresetPlan({
        preset: validatedRequest.musicPreset, durationSec: clock.durationSec,
        resolvedEvents: selectedClockEvents, id: asset.id,
        keyContext: { provided: validatedRequest.keyContextProvided, ...validatedRequest.keyContext },
        voice: (basePlan.tracks || []).some((track) => track.bus === "voice") || (basePlan.voiceWindows || []).length > 0,
      });
    } else {
      presetResult = buildSourcePresetPlan({
        preset: validatedRequest.musicPreset, durationSec,
        resolvedEvents, id: path.basename(path.resolve(basePlanPath)),
        keyContext: { provided: validatedRequest.keyContextProvided, ...validatedRequest.keyContext },
        voice: (basePlan.tracks || []).some((track) => track.bus === "voice") || (basePlan.voiceWindows || []).length > 0,
      });
    }
    const presetPlan = upstream.sound.plan(presetResult.plan);
    const sourceSectionIds = new Set(presetPlan.sections.map((section) => section.id));
    if (validatedRequest.musicPreset.dropEventId && !sourceSectionIds.has(validatedRequest.musicPreset.dropEventId)) fail("musicPreset.dropEventId was filtered by the pinned source section merge; bind it to a surviving section event");
    if (presetResult.endEvent && Math.abs(presetPlan.end - presetResult.endEvent.filmTimeSec) > 1 / RATE) fail("musicPreset.endEventId did not resolve to the pinned source ending time");
    requestGeneratedSourceGroupSelection = finalizeRequestGeneratedSourceGroupEligibility(requestGeneratedSourceGroupSelection, {
      validatedRequest, presetPlan, manualRows, durationSec,
    });
    const automationEvents = selectedSource ? selectedSource.clock.events : resolvedEvents;
    const candidateAutomationHits = validatedRequest.manualRows.flatMap((row) => {
      const event = automationEvents.get(row.eventId);
      return event ? [{ name: row.name, at: event.filmTimeSec, filmTimeSec: event.filmGlobalSec ?? event.filmTimeSec, gain: clampGain(row.sourceGain, "SFX " + row.id + ".sourceGain"), eventId: row.eventId }] : [];
    });
    const duckResolution = resolveDerivedDuckHits({
      hits: candidateAutomationHits,
      manualAutomation: basePlan.automation || [],
      effectiveSpeed: selectedSource?.clock.combinedSpeed || 1,
    });
    const automationHits = duckResolution.applied;
    if (sampleRuntime) {
      const requiredIds = requiredPresetSampleIds(upstream.score, presetPlan);
      presetSamplePack = await inspectRecordedPack({ packDir: samplePackDir, projectRoot, requiredInstrumentIds: requiredIds });
    }
    if (requestGeneratedSourceGroupSelection.selected) {
      if (!requestFilePath || !requestFileSha256 || !/^[a-f0-9]{64}$/i.test(requestFileSha256)) {
        fail("request-generated source group requires the original request file path and SHA-256 for its receipt");
      }
      if (!contains(projectRoot, path.resolve(requestFilePath))) fail("request-generated source group request file must stay inside --project-root");
      const sourceP0 = JSON.parse(JSON.stringify(presetResult.plan));
      sourceP0.hits = manualRows.map((row) => ({
        ...row.options, name: row.name, at: row.filmTimeSec, gain: row.sourceGain, pan: row.sourcePan,
      }));
      const generatedGroupVoiceInput = voiceInput || ((basePlan.tracks || []).some((track) => track.bus === "voice")
        ? await measureLockedVoiceLufs({ basePlan, basePlanDirectory, upstream, ffmpeg: process.env.MOTION_FFMPEG || "ffmpeg" })
        : null);
      const voiced = Boolean(generatedGroupVoiceInput);
      const generatedGroupVoiceWindows = generatedGroupVoiceInput
        ? mapVoiceWindowsToNativeSegment(generatedGroupVoiceInput.voiceWindows, { localStartSec: 0, filmStartSec: 0, speed: 1 }, durationSec)
        : [];
      const mixed = upstream.sound.mixdown(sourceP0, {
        voiced,
        words: generatedGroupVoiceWindows,
        voiceLufs: generatedGroupVoiceInput?.voiceLufs ?? null,
        musicGainDb: validatedRequest.musicMixGainDb,
        mixBusMode: "default-sum",
      });
      if (!mixed?.out2 || !(mixed.out2.L instanceof Float32Array) || !(mixed.out2.R instanceof Float32Array)) fail("Local sound.mixdown did not return stereo float PCM for the request-generated source group");
      if (mixed.p.duration !== durationSec || mixed.out2.n !== Math.round(durationSec * RATE)) fail("Request-generated source group duration differs from the full audio-plan duration");
      if (mixed.hits.length !== manualRows.length) fail("Request-generated source group did not consume every compatible manual SFX hit exactly once");
      const canonicalEventBindings = buildRequestGeneratedCanonicalBindings({ validatedRequest, presetPlan, manualRows, resolvedEvents });
      const bakedCanonicalEvents = manualRows.map((row, sourceHitOrder) => ({
        requestId: row.id, eventId: row.eventId, sourceHitOrder, sourceTimeSec: row.filmTimeSec, filmTimeSec: row.filmTimeSec,
        timeMapId: row.timeMapId, name: row.name, sourceGain: row.sourceGain, sourcePan: row.sourcePan,
        options: row.options, kit: row.kit, sourceSeed: `${row.name}:${sourceHitOrder}:${row.filmTimeSec}`,
        seedBasis: "pinned-source-renderSfx-name-index-at", mixGainDb: 0,
      }));
      requestGeneratedSourceGroupResult = {
        selection: requestGeneratedSourceGroupSelection,
        sourceP0,
        p0Sha256: sha256(Buffer.from(canonical(sourceP0), "utf8")),
        sourceKit: presetPlan.kit,
        requestSha256: requestFileSha256,
        requestCanonicalSha256: sha256(Buffer.from(canonical(request), "utf8")),
        requestPath: path.relative(path.dirname(outputPlan), path.resolve(requestFilePath)).split(path.sep).join("/"),
        localRuntimeClosureSha256: localAudio.runtime.closureSha256,
        sourceClosureSha256: localAudio.runtime.sourceClosureSha256,
        sourceCommit: EXPECTED_SOURCE.commit,
        mixed, voiced, voiceInput: generatedGroupVoiceInput,
        musicGainDb: validatedRequest.musicMixGainDb,
        canonicalEventBindings, bakedCanonicalEvents,
        sourceMixdown: {
          function: "sound.mixdown", owner: "laohu-motion.request-generated-source-group/1", voiced,
          voiceLufs: voiced ? generatedGroupVoiceInput.voiceLufs : null,
          voiceWindowsSha256: voiced ? generatedGroupVoiceInput.voiceWindowsSha256 : null,
          voiceDuckProcessing: {
            applied: Boolean(mixed.musicOn && generatedGroupVoiceWindows.length),
            processor: "sound.mixdown -> original duck",
            wordWindows: generatedGroupVoiceWindows,
            voiceWindowsSha256: generatedGroupVoiceInput?.voiceWindowsSha256 || null,
            coordinateBasis: "full-film identity map to source-local seconds",
          },
          sourceHitCount: mixed.hits.length, musicOn: mixed.musicOn, musicTargetLufs: mixed.musicTarget,
          finalLufs: mixed.finalLufs, peakDbfs: mixed.peak, musicGainDb: validatedRequest.musicMixGainDb,
          musicGainApplication: "after-source-music-target-normalization-before-fx-combine-and-shared-bus",
          mixBusMode: mixed.mixBusMode,
        },
      };
      presetRendered = null;
    } else {
      const voiceMap = selectedSource
        ? { localStartSec: 0, filmStartSec: selectedSource.clock.filmStartSec, speed: selectedSource.clock.combinedSpeed }
        : { localStartSec: 0, filmStartSec: 0, speed: 1 };
      const requestedVoiceWindows = (basePlan.voiceWindows || []).length
        ? mapVoiceWindowsToNativeSegment(basePlan.voiceWindows, voiceMap, presetPlan.duration)
        : [];
      const bakeSourceVoiceDuck = requestedVoiceWindows.length > 0 && basePlan.ducking == null;
      const render = selectedSource
        ? (() => {
          const track = selectedSource.trackPcm;
          const rngSeed = `music:${presetPlan.style}:${presetPlan.seed}:${presetPlan.bpm}`;
          rideEnergy(track, presetPlan.sections, presetPlan.duration, upstream.dsp);
          applyGain(track, automateMusic(presetPlan, automationHits, upstream.dsp));
          if (bakeSourceVoiceDuck) upstream.sound.duck(track, requestedVoiceWindows);
          return {
            track, kicks: [], rngSeed, sourceTrackId: selectedMusicTrack.id,
            voiceDuckProcessing: bakeSourceVoiceDuck ? {
              applied: true, processor: "original sound.duck source fragment",
              wordWindows: requestedVoiceWindows, coordinateBasis: "selected music source-local seconds",
              voiceWindowsSha256: sha256(Buffer.from(canonical(basePlan.voiceWindows || []), "utf8")),
            } : null,
          };
        })()
        : renderPresetStem({ upstream, presetPlan, hits: automationHits, voiceWindows: bakeSourceVoiceDuck ? requestedVoiceWindows : [] });
      if (requestedVoiceWindows.length && !bakeSourceVoiceDuck) {
        render.voiceDuckProcessing = {
          applied: false, processor: "audio-plan final mixer",
          wordWindows: [], requestedWordWindows: requestedVoiceWindows,
          voiceWindowsSha256: sha256(Buffer.from(canonical(basePlan.voiceWindows || []), "utf8")),
          coordinateBasis: selectedSource ? "selected music source-local seconds" : "full-film source-local seconds",
          reason: "explicit audio-plan ducking remains the sole duck owner",
        };
      } else if ((basePlan.voiceWindows || []).length && !requestedVoiceWindows.length) {
        render.voiceDuckProcessing = {
          applied: false, processor: basePlan.ducking ? "audio-plan final mixer" : "none",
          wordWindows: [],
          voiceWindowsSha256: sha256(Buffer.from(canonical(basePlan.voiceWindows || []), "utf8")),
          reason: basePlan.ducking
            ? "explicit audio-plan ducking remains the sole duck owner"
            : "canonical voiceWindows do not overlap the selected music source range",
        };
      }
      if (render.voiceDuckProcessing && render.voiceDuckProcessing.voiceWindowsSha256 == null) {
        render.voiceDuckProcessing.voiceWindowsSha256 = sha256(Buffer.from(canonical(basePlan.voiceWindows || []), "utf8"));
      }
      if (!selectedSource) {
        const targetLufs = presetPlan.voiced ? (voiceInput ? voiceInput.voiceLufs - 12 : -28) : -18;
        const preTargetLufs = upstream.sound.loudness(render.track.L, render.track.R);
        if (Number.isFinite(preTargetLufs)) {
          const targetGain = upstream.dsp.undb(targetLufs - preTargetLufs);
          for (let index = 0; index < render.track.n; index += 1) {
            render.track.L[index] *= targetGain;
            render.track.R[index] *= targetGain;
          }
        }
        render.sourceMusicLevel = {
          targetLufs, preTargetLufs: Number.isFinite(preTargetLufs) ? preTargetLufs : null,
          targetBasis: presetPlan.voiced ? (voiceInput ? "locked voice stereo LUFS - 12" : "source fallback -28 LUFS") : "source unvoiced -18 LUFS",
          normalizationApplied: Number.isFinite(preTargetLufs),
        };
      }
      presetRendered = render;
      presetResult.voiceDuckProcessing = render.voiceDuckProcessing;
      presetResult.sourceMusicLevel = render.sourceMusicLevel || null;
    }
    const presetKeyExplicit = validatedRequest.musicPreset.keyMidi != null || validatedRequest.musicPreset.scale != null || validatedRequest.keyContextProvided;
    sfxKeyContext = selectedSource && !presetKeyExplicit
      ? { ...validatedRequest.keyContext, basis: "default-request-keyContext; selected source BGM tonal center unmeasured" }
      : { rootMidi: presetPlan.root, scale: presetPlan.scale, basis: "pinned-source-music-preset-plan" };
    key = keyFunction(sfxKeyContext, upstream);
    presetResult = { ...presetResult, plan: presetPlan, requestedSections: presetResult.requestedSections, outputSections: presetPlan.sections.map((section) => ({ eventId: section.id === "(start)" ? null : section.id, sourceSec: section.t, energy: section.energy, drop: !!section.drop, outro: !!section.outro })), automationEventIds: automationHits.map((hit) => hit.eventId), selectedSourceTrackId: selectedSource?.track.id || null };
    presetResult.automationResolution = {
      policy: "manual-music-automation-wins; overlapping derived event duck is omitted in full",
      manualAutomationReferences: (basePlan.automation || []).filter((row) => row.bus === "music" && row.eventId != null).map((row) => ({ id: row.id || null, eventId: row.eventId, startSec: row.startSec, endSec: row.endSec })),
      appliedDerivedDuckEventIds: automationHits.map((hit) => hit.eventId),
      suppressedDerivedDucks: duckResolution.suppressed,
    };
    if (sampleRuntime) {
      const trace = upstream.samples?.__laohuSampleTrace;
      const runtimeUse = buildRuntimeSampleUseReceipt(trace, presetSamplePack.files);
      presetSamplePack = { ...presetSamplePack, ...runtimeUse };
      if (!presetSamplePack.usedInstrumentIds.length) fail("recorded-required rendering did not use any recorded instrument IDs");
    }
  }
  let sfxUpstream = upstream;
  let sfxRuntime = null;
  if (composerResult || (validatedRequest.manualRows.length && !requestGeneratedSourceGroupResult) || validatedRequest.nativeSourceEvents.length) {
    const isolated = await loadLocalAudioRuntime();
    sfxUpstream = isolated;
    sfxRuntime = isolated.runtime;
    key = keyFunction(sfxKeyContext, sfxUpstream);
  }
  const composerHits = composerResult
    ? buildComposerHitRows(composerResult, validatedRequest, resolvedEvents, kitName, validatedRequest.composition.seed, key, sfxUpstream, scene)
    : [];
  const manualStemRows = requestGeneratedSourceGroupResult ? [] : manualRows;
  const manuallyOverriddenSourceEvents = new Set(validatedRequest.manualRows.map((row) => row.eventId));
  const nativeRows = validatedRequest.nativeSourceEvents.flatMap(({ event: sourceEvent, source }) => {
    if (nativeSourceMixdownEventIds.has(sourceEvent.id)) return [];
    if (manuallyOverriddenSourceEvents.has(sourceEvent.id)) return [];
    if (source.kind === "score-sfx" && validatedRequest.scoreSha256 && source.composerScoreSha256 === validatedRequest.scoreSha256) return [];
    const event = resolvedEvents.get(sourceEvent.id);
    if (!event) fail("Native OM source SFX is not bound by the current Film manifest: " + sourceEvent.id);
    return [{
      id: "native-om-" + safeStem(sourceEvent.id), eventId: sourceEvent.id,
      phaseId: event.phaseId, timeMapId: event.timeMapId, filmTimeSec: event.filmTimeSec,
      name: source.name, options: source.options, kit: source.kit,
      sourceGain: source.sourceGain, sourcePan: source.sourcePan,
      seed: source.sourceSeed, seedBasis: "pinned original sound.js renderSfx name:index:at",
      keyContext: source.keyContext, mixGainDb: 0,
      sourceCue: { kind: "native-om-source-event", sourceKind: source.kind, sourceHitOrder: source.sourceHitOrder, composerCue: source.composerCue || null },
    }];
  });
  const sfxRows = [...composerHits, ...manualStemRows, ...nativeRows];
  const planDir = path.dirname(outputPlan);
  const plan = JSON.parse(JSON.stringify(basePlan));
  plan.assets ||= []; plan.tracks ||= []; plan.events ||= []; plan.timeMaps ||= [];
  const existingMaps = new Map(plan.timeMaps.map((mapping) => [mapping.id, mapping]));
  for (const [id, mapping] of film.maps) {
    const prior = existingMaps.get(id);
    if (prior && canonical(prior) !== canonical(mapping)) fail("Base audio plan has a conflicting timeMap with film-manifest ID " + id);
    if (!prior) { plan.timeMaps.push(mapping); existingMaps.set(id, mapping); }
  }
  const existingAssetIds = new Set(plan.assets.map((asset) => asset.id));
  const existingTrackIds = new Set(plan.tracks.map((track) => track.id));
  const existingEventIds = new Set(plan.events.map((event) => event.id));
  const closure = { ...pin, sha256: sourceClosureHash(pin) };
  const runtimeSource = localAudio ? "hash-verified local Huashu MIT algorithm closure" : "pinned upstream Huashu MIT sample overlay";
  const wavRows = [];
  const assetByHash = new Map();
  const soundtrackAssetByHash = new Map();
  const nativeSourceSoundtrackRows = [];
  const requestGeneratedSourceGroupRows = [];
  for (const sourceResult of nativeSourceMixdownResults) {
    const { source, sourceScene, runtime, sourceDeclaration, sourcePlan, sourceKind, scoreSha256, durationSec, mixed, sourceEvents, sourceMixBusMode, mappedWords, voiced, voiceInput } = sourceResult;
    const soundtrackWav = floatWav(mixed.out2);
    const soundtrackFacts = wavFacts(soundtrackWav);
    if (Math.abs(soundtrackFacts.durationSec - durationSec) > 1 / RATE) fail("Original OM soundtrack asset duration differs from source p0 for segment " + source.segmentId);
    const soundtrackSha = sha256(soundtrackWav);
    let soundtrackId = soundtrackAssetByHash.get(soundtrackSha);
    if (!soundtrackId) {
      soundtrackId = "native-om-soundtrack-" + soundtrackSha.slice(0, 16);
      const soundtrackFile = path.join(assetsDir, soundtrackId + ".wav");
      const soundtrackRelative = path.relative(planDir, soundtrackFile).split(path.sep).join("/");
      if (existingAssetIds.has(soundtrackId) || existingTrackIds.has(soundtrackId)) fail("Generated native OM soundtrack asset/track ID already exists in base audio plan: " + soundtrackId);
      wavRows.push({ file: soundtrackFile, wav: soundtrackWav, sha256: soundtrackSha });
      plan.assets.push(sourceAsset({
        id: soundtrackId, file: soundtrackRelative, durationSec: soundtrackFacts.durationSec,
        sha: soundtrackSha, sourceKind: "native-om-original-sound-mixdown-stereo-soundtrack", closure,
        generationAuthorizationSha256: requestFileSha256,
        generationScopes: sourceKind === "sfx-only" ? ["sfx"] : (sourceEvents.length ? ["music", "sfx"] : ["music"]),
      }));
      existingAssetIds.add(soundtrackId);
      soundtrackAssetByHash.set(soundtrackSha, soundtrackId);
    }
    const soundtrackTrackId = "native-om-soundtrack-track-" + safeStem(source.segmentId);
    if (existingTrackIds.has(soundtrackTrackId)) fail("Generated native OM soundtrack track ID already exists in base audio plan: " + soundtrackTrackId);
    plan.tracks.push({
      id: soundtrackTrackId, assetId: soundtrackId, bus: "music", startSec: 0,
      sourceInSec: 0, sourceOutSec: soundtrackFacts.durationSec, gainDb: 0,
      timeMapId: source.timeMapId,
    });
    existingTrackIds.add(soundtrackTrackId);
    const bakedCanonicalEvents = sourceEvents.map((event) => {
      const mapped = resolvedEvents.get(event.id);
      if (!mapped || mapped.timeMapId !== source.timeMapId) fail("Baked native OM source event has no matching canonical segment clock: " + event.id);
      return {
        eventId: event.id, sourceKind: event.sourceAudio.kind,
        sourceHitOrder: event.sourceAudio.sourceHitOrder,
        sourceTimeSec: event.timeSec, filmTimeSec: mapped.filmTimeSec,
        timeMapId: mapped.timeMapId,
        name: event.sourceAudio.name,
        sourceGain: event.sourceAudio.sourceGain,
        sourcePan: event.sourceAudio.sourcePan,
        options: event.sourceAudio.options || {},
      };
    });
    const voiceBinding = voiceInput ? {
      trackId: voiceInput.track.id,
      assetId: voiceInput.asset.id,
      fileSha256: voiceInput.fileSha256,
      voiceLufs: voiceInput.voiceLufs,
      voiceLufsMeasurement: voiceInput.measurement,
      voiceWindowsSha256: voiceInput.voiceWindowsSha256,
      mappedWords,
      mappedWordsSha256: sha256(Buffer.from(canonical(mappedWords), "utf8")),
      timeMapId: source.timeMapId,
    } : null;
    nativeSourceSoundtrackRows.push({
      segmentId: source.segmentId, kind: sourceKind,
      assetId: soundtrackId, trackId: soundtrackTrackId,
      sourceDurationSec: durationSec, timeMapId: source.timeMapId,
      sourceScenePath: source.sourceScenePath, sourceSceneSha256: source.sourceSceneSha256,
      sourceDeclarationSha256: runtime.sourceDeclarationSha256,
      sourcePlanSha256: runtime.sourcePlanSha256,
      sourceScoreSha256: scoreSha256,
      sourceMusicOff: Boolean(sourceDeclaration.music?.off),
      sourceMixdown: {
        function: "sound.mixdown", voiced,
        voiceLufs: voiced ? voiceInput?.voiceLufs ?? null : null,
        wordWindows: mappedWords,
        voiceDuckProcessing: {
          applied: Boolean(mixed.musicOn && mappedWords.length),
          processor: "sound.mixdown -> original duck",
          wordWindows: mappedWords,
          voiceWindowsSha256: voiceInput?.voiceWindowsSha256 || null,
          coordinateBasis: "segment-mapped voiceWindows in source-local seconds",
        },
        scoreSha256,
        musicOn: mixed.musicOn, musicTargetLufs: mixed.musicTarget,
        finalLufs: mixed.finalLufs, peakDbfs: mixed.peak,
        sourceHitCount: mixed.hits.length,
        mixBusMode: sourceMixBusMode,
      },
      voiceBinding,
      bakedCanonicalEvents,
      outputWav: {
        sha256: soundtrackSha, frames: soundtrackFacts.frames,
        durationSec: soundtrackFacts.durationSec, peakAbs: soundtrackFacts.peakAbs,
        overRangeSampleCount: soundtrackFacts.overRangeSampleCount,
      },
      sourcePlanSummary: { style: sourcePlan.style, product: sourcePlan.product ?? null, choice: sourcePlan.choice ?? null, bpm: sourcePlan.bpm, root: sourcePlan.root, scale: sourcePlan.scale },
      sourceDeclarationLabels: sourceDeclaration.labels,
    });
  }
  if (composerResult) {
    const musicTrack = makeTrackFromStereo(upstream, composerResult.music, durationSec);
    const musicWav = floatWav(musicTrack);
    const musicFacts = wavFacts(musicWav);
    const musicSha = sha256(musicWav);
    const musicId = "huashu-music-" + musicSha.slice(0, 16);
    const musicFile = path.join(assetsDir, musicId + ".wav");
    const musicRelative = path.relative(planDir, musicFile).split(path.sep).join("/");
    if (existingAssetIds.has(musicId) || existingTrackIds.has(musicId)) fail("Generated music asset/track ID already exists in base audio plan: " + musicId);
    const musicTrackId = musicId + "-track";
    if (existingTrackIds.has(musicTrackId)) fail("Generated music track ID already exists in base audio plan: " + musicTrackId);
    wavRows.push({ file: musicFile, wav: musicWav, sha256: musicSha });
    plan.assets.push(sourceAsset({ id: musicId, file: musicRelative, durationSec: musicFacts.durationSec, sha: musicSha, sourceKind: "renderComposed-stereo-music", closure, generationAuthorizationSha256: requestFileSha256, generationScopes: ["music"] }));
    plan.tracks.push({ id: musicTrackId, assetId: musicId, bus: "music", startSec: 0, gainDb: validatedRequest.musicMixGainDb });
    existingTrackIds.add(musicTrackId);
    assetByHash.set(musicSha, musicId);
  } else if (requestGeneratedSourceGroupResult) {
    const group = requestGeneratedSourceGroupResult;
    const groupWav = floatWav(group.mixed.out2);
    const groupFacts = wavFacts(groupWav);
    if (Math.abs(groupFacts.durationSec - durationSec) > 1 / RATE) fail("Request-generated source group asset duration differs from the full film duration");
    const groupSha = sha256(groupWav);
    const groupId = "request-generated-source-group-" + group.p0Sha256.slice(0, 16);
    const groupTrackId = groupId + "-track";
    const groupFile = path.join(assetsDir, groupId + ".wav");
    const groupRelative = path.relative(planDir, groupFile).split(path.sep).join("/");
    if (existingAssetIds.has(groupId) || existingTrackIds.has(groupTrackId)) fail("Request-generated source group asset/track ID already exists in base audio plan: " + groupId);
    wavRows.push({ file: groupFile, wav: groupWav, sha256: groupSha });
    plan.assets.push(sourceAsset({
      id: groupId, file: groupRelative, durationSec: groupFacts.durationSec, sha: groupSha,
      sourceKind: "request-generated-source-group-stereo-soundtrack", closure,
      voiceDuckProcessing: group.sourceMixdown.voiceDuckProcessing,
      generationAuthorizationSha256: requestFileSha256,
      generationScopes: manualRows.length || validatedRequest.nativeSourceEvents.length ? ["music", "sfx"] : ["music"],
    }));
    plan.tracks.push({
      id: groupTrackId, assetId: groupId, bus: "music", startSec: 0,
      sourceInSec: 0, sourceOutSec: groupFacts.durationSec, gainDb: 0,
    });
    existingAssetIds.add(groupId);
    existingTrackIds.add(groupTrackId);
    presetResult.outputWav = { sha256: groupSha, frames: groupFacts.frames, durationSec: groupFacts.durationSec, assetId: groupId };
    const voiceBinding = group.voiceInput ? {
      trackId: group.voiceInput.track.id, assetId: group.voiceInput.asset.id,
      fileSha256: group.voiceInput.fileSha256, voiceLufs: group.voiceInput.voiceLufs,
      voiceLufsMeasurement: group.voiceInput.measurement,
      voiceWindowsSha256: group.voiceInput.voiceWindowsSha256,
      voiceWindows: group.voiceInput.voiceWindows,
      narrationIncludedInBakedAsset: false,
    } : null;
    requestGeneratedSourceGroupRows.push({
      format: group.selection.format, groupId, trackId: groupTrackId, assetId: groupId,
      sourceDurationSec: durationSec,
      requestPath: group.requestPath, requestSha256: group.requestSha256,
      requestCanonicalSha256: group.requestCanonicalSha256, request,
      localRuntimeClosureSha256: group.localRuntimeClosureSha256,
      sourceClosureSha256: group.sourceClosureSha256, sourceCommit: group.sourceCommit,
      sourceP0: group.sourceP0, p0Sha256: group.p0Sha256,
      sourceKit: group.sourceKit,
      musicGainDb: group.musicGainDb,
      canonicalEventBindings: group.canonicalEventBindings,
      bakedCanonicalEvents: group.bakedCanonicalEvents,
      sourceMixdown: group.sourceMixdown, voiceBinding,
      outputWav: {
        sha256: groupSha, frames: groupFacts.frames, durationSec: groupFacts.durationSec,
        peakAbs: groupFacts.peakAbs, overRangeSampleCount: groupFacts.overRangeSampleCount,
      },
      sourcePlanSummary: {
        style: presetResult.plan.style, product: presetResult.plan.product ?? null,
        choice: presetResult.plan.choice ?? null, bpm: presetResult.plan.bpm,
        root: presetResult.plan.root, scale: presetResult.plan.scale,
        kit: presetResult.plan.kit,
      },
    });
  } else if (presetRendered) {
    const musicWav = floatWav(presetRendered.track);
    const musicFacts = wavFacts(musicWav);
    const musicSha = sha256(musicWav);
    const musicId = "laohu-music-" + musicSha.slice(0, 16);
    const musicFile = path.join(assetsDir, musicId + ".wav");
    const musicRelative = path.relative(planDir, musicFile).split(path.sep).join("/");
    if (existingAssetIds.has(musicId) || (!selectedMusicTrack && existingTrackIds.has(musicId))) fail("Generated preset music asset/track ID already exists in base audio plan: " + musicId);
    wavRows.push({ file: musicFile, wav: musicWav, sha256: musicSha });
    presetResult.outputWav = { sha256: musicSha, frames: musicFacts.frames, durationSec: musicFacts.durationSec, assetId: musicId };
    plan.assets.push(sourceAsset({
      id: musicId, file: musicRelative, durationSec: musicFacts.durationSec, sha: musicSha,
      sourceKind: selectedMusicTrack ? "derived-selected-music-track" : "source-score-preset-stereo-music",
      closure, sampleProvenance: presetSamplePack,
      voiceDuckProcessing: presetRendered.voiceDuckProcessing || null,
      generationAuthorizationSha256: requestFileSha256,
      generationScopes: ["music"],
      parentAsset: selectedMusicTrack ? selectedSource?.asset : null,
    }));
    if (selectedMusicTrack) {
      const target = plan.tracks.find((track) => track.id === selectedMusicTrack.id);
      if (!target || target.locked) fail("Selected music track disappeared or became locked before replacement");
      target.assetId = musicId;
      target.sourceInSec = 0;
      target.sourceOutSec = musicFacts.durationSec;
      target.gainDb = finite(target.gainDb == null ? 0 : target.gainDb, "selected music track.gainDb") + validatedRequest.musicMixGainDb;
    } else {
      const musicTrackId = musicId + "-track";
      if (existingTrackIds.has(musicTrackId)) fail("Generated preset music track ID already exists in base audio plan: " + musicTrackId);
      plan.tracks.push({ id: musicTrackId, assetId: musicId, bus: "music", startSec: 0, gainDb: validatedRequest.musicMixGainDb });
      existingTrackIds.add(musicTrackId);
    }
    existingAssetIds.add(musicId);
    assetByHash.set(musicSha, musicId);
  }
  const nativeSourceMusicRows = [];
  const addNativeSourceMusicStem = (source, musicTrack, sourceKind, sourceDetails = {}) => {
    const musicWav = floatWav(musicTrack);
    const musicFacts = wavFacts(musicWav);
    const musicSha = sha256(musicWav);
    let musicId = assetByHash.get(musicSha);
    if (!musicId) {
      musicId = "native-om-music-" + musicSha.slice(0, 16);
      const musicFile = path.join(assetsDir, musicId + ".wav");
      const musicRelative = path.relative(planDir, musicFile).split(path.sep).join("/");
      if (existingAssetIds.has(musicId) || existingTrackIds.has(musicId)) fail("Generated native OM music asset/track ID already exists in base audio plan: " + musicId);
      wavRows.push({ file: musicFile, wav: musicWav, sha256: musicSha });
      plan.assets.push(sourceAsset({
        id: musicId, file: musicRelative, durationSec: musicFacts.durationSec, sha: musicSha,
        sourceKind, closure, voiceDuckProcessing: sourceDetails.voiceDuckProcessing || null,
        generationAuthorizationSha256: requestFileSha256,
        generationScopes: ["music"],
      }));
      existingAssetIds.add(musicId);
      assetByHash.set(musicSha, musicId);
    }
    const musicTrackId = "native-om-music-track-" + safeStem(source.segmentId);
    if (existingTrackIds.has(musicTrackId)) fail("Generated native OM music track ID already exists in base audio plan: " + musicTrackId);
    plan.tracks.push({
      id: musicTrackId, assetId: musicId, bus: "music", startSec: 0,
      sourceInSec: 0, sourceOutSec: musicFacts.durationSec, gainDb: validatedRequest.musicMixGainDb,
      timeMapId: source.timeMapId,
    });
    existingTrackIds.add(musicTrackId);
    nativeSourceMusicRows.push({
      segmentId: source.segmentId, ...sourceDetails,
      assetId: musicId, trackId: musicTrackId, sourceDurationSec: musicFacts.durationSec,
      timeMapId: source.timeMapId, sourceScenePath: source.sourceScenePath,
      sourceSceneSha256: source.sourceSceneSha256,
    });
  };
  for (const { source, rendered } of nativeComposerResults) {
    addNativeSourceMusicStem(
      source,
      makeTrackFromStereo(upstream, rendered.music, source.durationSec),
      "native-om-original-renderComposed-stereo-music",
      { kind: "abc-score", scoreSha256: source.scoreSha256 },
    );
  }
  for (const { source, plan: sourcePlan, rendered, targetLufs, measuredLufs } of nativePresetResults) {
    addNativeSourceMusicStem(source, rendered.track, "native-om-original-renderScore-preset-stereo-music", {
      kind: "default-score-preset", sourceDeclarationSha256: source.sourceDeclarationSha256,
      sourcePlanSha256: source.sourcePlanSha256, sourcePlan: { style: sourcePlan.style, product: sourcePlan.product, choice: sourcePlan.choice, bpm: sourcePlan.bpm, root: sourcePlan.root, scale: sourcePlan.scale, labels: sourcePlan.sections.map((section) => ({ id: section.id, atSec: section.t, energy: section.energy })) },
      sourceMusicTargetLufs: targetLufs, preTargetMeasuredLufs: Number.isFinite(measuredLufs) ? measuredLufs : null,
      voiceDuckProcessing: rendered.voiceDuckProcessing || null,
      sourceMusicLevel: rendered.sourceMusicLevel || null,
    });
  }
  const generatedEvents = [];
  for (const row of sfxRows) {
    const rowKey = row.keyContext ? keyFunction(row.keyContext, sfxUpstream) : key;
    const rendered = renderOneSfx({ upstream: sfxUpstream, name: row.name, kitName: row.kit, options: row.options || {}, sourceGain: row.sourceGain, sourcePan: row.sourcePan, seed: row.seed, key: rowKey });
    const sourceFxLevelEligible = validatedRequest.apiVersion === 2
      && validatedRequest.musicPreset != null
      && selectedSource == null
      && requestGeneratedSourceGroupResult == null
      && presetResult?.plan?.voiced === true
      && Number.isFinite(presetResult.sourceMusicLevel?.targetLufs)
      && row.sourceCue.kind === "explicit-sfx-event";
    const sourceLevelGainDb = sourceFxLevelEligible
      ? resolveSourceFxLevelGainDb({ voiced: true, musicTargetLufs: presetResult.sourceMusicLevel.targetLufs })
      : 0;
    const userPostMixGainDb = row.mixGainDb;
    const eventGainDb = sourceLevelGainDb + userPostMixGainDb;
    const wavFactsValue = wavFacts(rendered.wav);
    const hash = sha256(rendered.wav);
    let assetId = assetByHash.get(hash);
    if (!assetId) {
      assetId = "laohu-sfx-" + hash.slice(0, 16);
      assetByHash.set(hash, assetId);
      const filename = assetId + ".wav";
      const target = path.join(assetsDir, filename);
      const file = path.relative(planDir, target).split(path.sep).join("/");
      if (existingAssetIds.has(assetId) || existingTrackIds.has(assetId)) fail("Generated SFX asset ID already exists in base audio plan: " + assetId);
      plan.assets.push(sourceAsset({
        id: assetId, file, durationSec: wavFactsValue.durationSec, sha: hash, hitTimeSec: rendered.lead,
        sourceKind: "Huashu SFX function" + (row.kit === "clean" ? "" : " / " + row.kit + " kit"), closure,
        generationAuthorizationSha256: requestFileSha256,
        generationScopes: ["sfx"],
        sampleUse: {
          mode: "synth-off",
          recordedSamplePackVisible: false,
          sourceRuntime: sfxRuntime?.entry || "local templates/runtime closure with OM_SAMPLES=off",
          ...(sfxRuntime ? { localRuntimeClosureSha256: sfxRuntime.closureSha256, sourceClosureSha256: sfxRuntime.sourceClosureSha256 } : {}),
          packCacheInitializedNullBeforeEnvironmentRestore: sfxRuntime?.importPolicy.packCacheInitializedNullBeforeEnvironmentRestore ?? true,
        },
      }));
      wavRows.push({ file: target, wav: rendered.wav, sha256: hash });
    }
    const cueId = "laohu-sfx-event-" + safeStem(row.id);
    if (existingEventIds.has(cueId) || generatedEvents.some((event) => event.id === cueId)) fail("Generated SFX cue ID collision: " + cueId);
    generatedEvents.push({ id: cueId, eventId: row.eventId, assetId, bus: "sfx", gainDb: eventGainDb, ...(row.timeMapId ? { timeMapId: row.timeMapId } : {}) });
    row.assetId = assetId;
    row.cueId = cueId;
    row.sourceLeadSec = rendered.lead;
    row.sourceGainBaked = rendered.sourceGain;
    row.sourcePanBaked = rendered.sourcePan;
    row.sourcePanApplied = rendered.sourcePanApplied;
    row.sourceStereo = rendered.stereoSource;
    row.sourceLevelGainDb = sourceLevelGainDb;
    row.sourceLevelGainBasis = sourceFxLevelEligible
      ? "pinned sound.mixdown fxGain = undb(voiced ? musicTarget + 18 + 4 : -2), applied once as separate SFX event gain after sourceGain-baked PCM"
      : null;
    row.userPostMixGainDb = userPostMixGainDb;
    row.eventGainDb = eventGainDb;
  }
  plan.events.push(...generatedEvents);

  const outputTargets = [outputPlan, manifestPath, ...wavRows.map((row) => row.file)];
  const targetSet = new Set(outputTargets.map((file) => path.resolve(file)));
  if (targetSet.size !== outputTargets.length) fail("Output paths collide; no files were written");
  for (const file of [outputPlan, manifestPath]) {
    const existing = await fs.lstat(file).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (existing?.isSymbolicLink()) fail("Output path is a symlink: " + file);
    if (existing) fail("Output already exists: " + file);
  }
  const existingWavs = new Map();
  for (const row of wavRows) {
    const existing = await fs.lstat(row.file).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (existing?.isSymbolicLink()) fail("Output WAV path is a symlink: " + row.file);
    if (existing && !existing.isFile()) fail("Output WAV path is not a regular file: " + row.file);
    if (existing && sha256(await fs.readFile(row.file)) !== row.sha256) fail("Existing hash-addressed WAV differs from generated bytes: " + row.file);
    existingWavs.set(path.resolve(row.file), Boolean(existing));
  }
  await assertSameVolume([
    projectRoot, assetsDir, path.dirname(outputPlan), path.dirname(manifestPath),
    ...localAudio.runtime.files.filter((row) => row.path.endsWith(".mjs")).map((row) => path.resolve(skillDir, row.path)),
    ...(selectedSource ? [selectedSource.assetPath] : []),
    ...(presetSamplePack ? [presetSamplePack.packDir] : []),
    ...(sampleRuntime ? [sampleRuntime.root] : []),
    ...inputFiles, ...film.verifiedFiles.map((item) => item.path),
  ]);
  const bindingsReport = [];
  for (const [name, eventId] of validatedRequest.marks) {
    const event = resolvedEvents.get(eventId);
    bindingsReport.push({ kind: "score-mark", name, eventId, phaseId: event.phaseId, canonicalFilmTimeSec: event.filmTimeSec });
  }
  if (presetResult) {
    for (const section of presetResult.requestedSections) {
      const event = (selectedSource?.clock.events || resolvedEvents).get(section.eventId);
      bindingsReport.push({
        kind: "source-preset-section", eventId: section.eventId,
        canonicalFilmTimeSec: event?.filmGlobalSec ?? event?.filmTimeSec,
        sourceMusicSec: event?.localSec ?? event?.filmTimeSec,
        energyRequested: section.energy ?? null,
        sourceSectionSurvivedMerge: presetResult.plan.sections.some((item) => item.id === section.eventId),
      });
    }
    if (validatedRequest.musicPreset.dropEventId) {
      const event = (selectedSource?.clock.events || resolvedEvents).get(validatedRequest.musicPreset.dropEventId);
      bindingsReport.push({ kind: "source-preset-drop", eventId: validatedRequest.musicPreset.dropEventId, canonicalFilmTimeSec: event?.filmGlobalSec ?? event?.filmTimeSec, sourceMusicSec: presetResult.plan.drop });
    }
    if (validatedRequest.musicPreset.endEventId) {
      const event = (selectedSource?.clock.events || resolvedEvents).get(validatedRequest.musicPreset.endEventId);
      bindingsReport.push({ kind: "source-preset-end", eventId: validatedRequest.musicPreset.endEventId, canonicalFilmTimeSec: event?.filmGlobalSec ?? event?.filmTimeSec, sourceMusicSec: presetResult.plan.end });
    }
  }
  for (const row of sfxRows) {
    const event = resolvedEvents.get(row.eventId);
    bindingsReport.push({
      kind: row.sourceCue.kind === "explicit-sfx-event" ? "explicit-sfx" : row.sourceCue.kind === "native-om-source-event" ? "native-om-source-sfx" : "score-hit-rise",
      requestId: row.id, cueId: row.cueId, assetId: row.assetId, eventId: row.eventId, phaseId: event.phaseId,
      canonicalFilmTimeSec: event.filmTimeSec, composerCue: row.sourceCue,
      source: { function: row.name, kit: row.kit, seed: row.seed, seedBasis: row.seedBasis, options: row.options, leadSec: row.sourceLeadSec, gainBaked: row.sourceGainBaked, panBaked: row.sourcePanBaked, panApplication: row.sourcePanApplied, stereo: row.sourceStereo },
      sourceLevelGainDb: row.sourceLevelGainDb,
      sourceLevelGainBasis: row.sourceLevelGainBasis,
      userPostMixGainDb: row.userPostMixGainDb,
      eventGainDb: row.eventGainDb,
      postMixGainDb: row.userPostMixGainDb,
    });
  }
  for (const source of nativeSourceSoundtrackRows) {
    for (const event of source.bakedCanonicalEvents) bindingsReport.push({
      kind: "native-om-source-sfx-baked-into-source-mixdown",
      eventId: event.eventId, segmentId: source.segmentId,
      sourceKind: event.sourceKind, sourceHitOrder: event.sourceHitOrder,
      sourceTimeSec: event.sourceTimeSec, canonicalFilmTimeSec: event.filmTimeSec,
      timeMapId: event.timeMapId, soundtrackAssetId: source.assetId,
      soundtrackTrackId: source.trackId,
    });
  }
  for (const source of requestGeneratedSourceGroupRows) {
    for (const event of source.bakedCanonicalEvents) bindingsReport.push({
      kind: "request-generated-source-sfx-baked",
      eventId: event.eventId, groupId: source.groupId,
      sourceHitOrder: event.sourceHitOrder, sourceTimeSec: event.sourceTimeSec,
      canonicalFilmTimeSec: event.filmTimeSec, timeMapId: event.timeMapId,
      soundtrackAssetId: source.assetId, soundtrackTrackId: source.trackId,
    });
  }
  const generatedScopesByAsset = generatedAudioAssetScopes(plan);
  const generatedAssetIds = [...generatedScopesByAsset.keys()].sort();
  if (generatedAssetIds.length) {
    const priorPolicy = basePlan.audioPolicy && typeof basePlan.audioPolicy === "object" ? basePlan.audioPolicy : {};
    const authorizations = [...(Array.isArray(priorPolicy.authorizations) ? priorPolicy.authorizations : [])];
    if (priorPolicy.authorization?.source === "explicit-user-request" && Array.isArray(priorPolicy.authorization.scopes)) {
      authorizations.push(priorPolicy.authorization);
    }
    const currentRequestPath = requiresOriginalAudioGeneration
      ? path.relative(path.dirname(outputPlan), path.resolve(requestFilePath)).split(path.sep).join("/")
      : null;
    const currentAuthorization = requiresOriginalAudioGeneration ? {
      ...validatedRequest.generationAuthorization,
      requestPath: currentRequestPath,
      requestSha256: requestFileSha256,
    } : null;
    if (currentAuthorization && !authorizations.some((row) => row.requestSha256?.toLowerCase() === requestFileSha256.toLowerCase())) {
      authorizations.push(currentAuthorization);
    }
    const authorizationsByHash = new Map(authorizations.map((row) => [String(row.requestSha256 || "").toLowerCase(), row]));
    const priorAssetBindings = new Map((priorPolicy.generatedScopesByAsset || []).map((row) => [row.assetId, row]));
    const assetRows = new Map((plan.assets || []).map((asset) => [asset.id, asset]));
    const generatedScopesRows = generatedAssetIds.map((assetId) => {
      const asset = assetRows.get(assetId);
      const source = asset?.source || {};
      const prior = priorAssetBindings.get(assetId);
      const authorizationRequestSha256 = String(source.generationAuthorizationRequestSha256
        || source.parent?.generationAuthorizationRequestSha256
        || prior?.authorizationRequestSha256
        || (currentAuthorization ? requestFileSha256 : "")).toLowerCase();
      const authorization = authorizationsByHash.get(authorizationRequestSha256);
      if (!authorization) fail(`Generated asset ${assetId} has no preserved or current hash-bound authorization record`);
      const scopes = generatedScopesByAsset.get(assetId);
      const missing = scopes.filter((scope) => !authorization.scopes.includes(scope));
      if (missing.length) fail(`Authorization for generated asset ${assetId} does not grant ${missing.join(" and ")}`);
      return { assetId, scopes, authorizationRequestSha256 };
    });
    plan.audioPolicy = {
      format: "laohu.motion.audio-policy/1",
      mode: "explicit-user-authorized-generation",
      authorizations,
      generatedScopesByAsset: generatedScopesRows,
      generatedAssetIds,
    };
  } else if (plan.audioPolicy == null) {
    delete plan.audioPolicy;
  }
  const manifest = {
    format: "laohu.motion.huashu-audio-receipt/1",
    status: "generated-unreviewed",
    audioGenerationAuthorization: plan.audioPolicy || { status: "not-required" },
    alignment: {
      status: "matched-to-compiled-film-events-and-verified-timeMaps",
      filmManifest: film.manifestPath,
      filmManifestFormat: film.manifest.format,
      blueprint: { path: film.blueprintPath, sha256: film.blueprintSha256 },
      canonicalEventScene: { path: film.scenePath, sha256: film.sceneSha256 },
      sourceSceneHashes: [...film.sourceScenes.values()].map((item) => ({ segmentId: item.segmentId, path: item.path, sha256: item.sha256 })),
      timeMaps: [...film.maps.values()],
      canonicalEventSceneSha256: film.sceneSha256,
      markAndHitBindings: bindingsReport, unmatchedComposerMarks: [],
      nativeSourceMusic: nativeSourceMusicRows,
      nativeSourceSoundtracks: nativeSourceSoundtrackRows,
      requestGeneratedSourceGroups: requestGeneratedSourceGroupRows,
      requestGeneratedSourceGroupSelection: {
        ...requestGeneratedSourceGroupSelection,
        selectedGroupIds: requestGeneratedSourceGroupRows.map((row) => row.groupId),
        preconditions: [
          "request format /2 with one generated musicPreset; no arbitrary composition or selected BGM",
          "base audio plan has no existing music/nonvoice tracks, SFX events, automation, or ducking",
          "optional narration is exactly one locked voice track at film origin with canonical voiceWindows",
          "manual SFX use one kit matching source plan kit, source renderSfx seed order, and zero post-mix per-hit gain",
          "explicit keyContext matches source plan key; no recorded sample pack or native source SFX is present",
        ],
        fallback: requestGeneratedSourceGroupRows.length
          ? null
          : "ineligible requests retain existing separate-stem/native-source routes; no incompatible control is dropped",
      },
      nativeSourceSoundtrackSelection: {
        ...nativeSourceMixdownSelection,
        selectedSegmentIds: nativeSourceSoundtrackRows.map((row) => row.segmentId),
        selectedKinds: [...new Set(nativeSourceSoundtrackRows.map((row) => row.kind))],
        sourceMixdownPreconditions: [
          "automatic native ABC/default-preset soundtrack or verified music-off SFX group is selected",
          "no explicit composition/musicPreset or request.sfxEvents rows",
          "musicMixGainDb is 0 dB",
          "base audio plan has no music tracks, SFX events, plan automation, or separate ducking",
          "optional narration is exactly one locked voice track at film origin with canonical voiceWindows",
        ],
        excludedNativeSound: "music-off SFX groups use original sound.mixdown only when no independent audio control is requested; otherwise canonical source SFX remain separate stems. Incompatible narration/other tracks use the existing stems route.",
      },
      nativeSourceMusicSuppression: nativeCompositionSuppression,
    },
    source: { ...pin.source, closureSha256: closure.sha256, closure: pin.closure, licenseFiles: pin.licenseFiles },
    runtime: {
      api: requestGeneratedSourceGroupRows.length ? `${runtimeSource} request-generated source group: one /2 musicPreset and compatible manual SFX go through local sound.mixdown once with default-sum shared bus; source musicGainDb hook runs after source target normalization and before FX/shared bus; canonical Film events, request bytes, p0, local closure and baked WAV are receipt-bound; locked voice remains a separate audio-plan track once`
        : nativeSourceSoundtrackRows.length ? `${runtimeSource} original sound.mixdown(p0, { voiced, words: segment-mapped voiceWindows, voiceLufs, score: original OM ABC or null }) + one source soundtrack asset per eligible native Film segment + verified source-premix ownership receipt + canonical timeMap + locked voice track once + audio-plan final assembly`
      : composerResult ? `${runtimeSource} composed.renderComposed + Track + floatWav serialization`
      : nativePresetResults.length ? `${runtimeSource} original OM p0 declaration + score.plan/renderScore/pump/master + sound.js reverb/sweep/energy/automation/fade/low-balance + mapped original sound.duck when canonical voiceWindows overlap and audio-plan has no explicit duck owner + source voice-relative LUFS target or -28 fallback + canonical Film segment timeMap + audio-plan music track`
      : nativeComposerResults.length ? `${runtimeSource} original OM ABC score via composed.renderComposed + canonical Film segment timeMap + audio-plan music track`
      : presetResult ? selectedSource ? `${runtimeSource} score.plan for section dynamics; selected unlocked BGM decoded and replaced in place; sound.js rideEnergy/automateMusic source fragments with local DSP/import bindings; floatWav serialization`
        : `${runtimeSource} score.plan/renderScore/pump/master; sound.js buildSweep/rideEnergy/automateMusic/balanceLows and, when mapped canonical voiceWindows overlap the music stem and audio-plan ducking is absent, original sound.duck with local DSP/import bindings; voice-relative source target normalization; floatWav serialization`
          : `${runtimeSource} SFX/KITS/Track + floatWav serialization`,
      privateRenderSfxUsed: false, sourceMixdownUsed: nativeSourceSoundtrackRows.length > 0 || requestGeneratedSourceGroupRows.length > 0,
      sourceVoiceDuckUsed: nativeSourceSoundtrackRows.some((row) => row.sourceMixdown.voiceDuckProcessing?.applied === true)
        || requestGeneratedSourceGroupRows.some((row) => row.sourceMixdown.voiceDuckProcessing?.applied === true)
        || nativePresetResults.some((row) => row.rendered.voiceDuckProcessing?.applied === true)
        || presetRendered?.voiceDuckProcessing?.applied === true,
      finalMixer: "scripts/audio.mjs remains the sole final audio-plan mixer",
      sourceMixBusesEnabled: nativeSourceSoundtrackRows.some((row) => row.sourceMixdown.mixBusMode === "chains"),
      sourceMixBusesMeaning: "True only when at least one default-preset segment used the original OM_MIX=chains optional mixBuses insert chain; this experimental branch remains disabled when OM_MIX is unset. This flag does not say whether original shared FX room, HP, compression, loudness normalization, or limiter processing ran. The complete source sound.mixdown retains its original shared-bus processing only under its narrow eligibility; independently rendered stems are not claimed to sum to the same nonlinear shared-bus result. SFX-only and ABC mixdowns do not use the optional preset chain.",
      sampleRateHz: RATE, channels: 2, encoding: "pcm_f32le",
      serializationReason: "The original source toWav() quantizes and clamps to signed 16-bit; this consumer writes finite Track samples as IEEE-float and does not normalize or clip.",
      samples: presetSamplePack ? "musicPreset only: project-local recorded-required pack preflighted and traced by a strict overlay of the catalog-pinned local audio runtime; generated SFX use a separate synth-off local runtime"
        : "Local Huashu runtime sets OM_SAMPLES=off before first import; no home-directory fallback",
      ...(localAudio || sfxRuntime ? { localRuntime: {
        entry: (sfxRuntime || localAudio.runtime).entry,
        closureSha256: (sfxRuntime || localAudio.runtime).closureSha256,
        sourceClosureSha256: (sfxRuntime || localAudio.runtime).sourceClosureSha256,
        files: (sfxRuntime || localAudio.runtime).files,
        importPolicy: (sfxRuntime || localAudio.runtime).importPolicy,
      } } : {}),
      sampleScopes: {
        musicPreset: presetSamplePack
          ? { mode: "recorded-required", packDir: presetSamplePack.packDir, manifestSha256: presetSamplePack.manifest.sha256, actualUseReceipt: "musicPreset.samplePack" }
          : { mode: "synth-off", recordedSamplePackVisible: false, actualUseReceipt: "no recorded files used for music" },
        sfx: sfxRuntime
          ? { mode: "synth-off", recordedSamplePackVisible: false, runtimeEntry: sfxRuntime.entry, localRuntimeClosureSha256: sfxRuntime.closureSha256, sourceClosureSha256: sfxRuntime.sourceClosureSha256, files: sfxRuntime.files, importPolicy: sfxRuntime.importPolicy, sfxAssetMetadata: "assets[].source.sampleUse" }
          : { mode: "not-rendered", recordedSamplePackVisible: false, reason: "no SFX rows" },
      },
      ...(sampleRuntime ? { runtimeOverlay: {
        kind: "recorded-required-local-runtime-overlay",
        root: sampleRuntime.root,
        closureSha256: sampleRuntime.closureSha256,
        localRuntimeClosureSha256: localAudio.runtime.closureSha256,
        sourceClosureSha256: localAudio.runtime.sourceClosureSha256,
        transformedSourceFiles: sampleRuntime.transformed,
      } } : {}),
    },
    composition: nativeSourceSoundtrackRows.length ? {
      status: "original OM source sound.mixdown",
      sourceSoundtracks: nativeSourceSoundtrackRows.map((row) => ({ segmentId: row.segmentId, kind: row.kind, sourceScoreSha256: row.sourceScoreSha256, timeMapId: row.timeMapId, assetId: row.assetId, trackId: row.trackId, bakedSfxEventIds: row.bakedCanonicalEvents.map((event) => event.eventId), sourceMixdown: row.sourceMixdown })),
    }
      : composerResult ? { scoreSha256: validatedRequest.scoreSha256, seed: validatedRequest.composition.seed, report: composerResult.report, noteCount: composerResult.perf.notes.length, cueCount: composerResult.perf.cues.length }
      : presetResult ? {
        status: "pinned product/style score preset", style: presetResult.plan.style, product: presetResult.plan.product,
        choice: presetResult.plan.choice, seed: presetResult.plan.seed, bpm: presetResult.plan.bpm,
        keyMidi: presetResult.plan.root, scale: presetResult.plan.scale,
        voiceDuckProcessing: presetResult.voiceDuckProcessing || null,
        sourceMusicLevel: presetResult.sourceMusicLevel || null,
      }
        : nativeComposerResults.length || nativePresetResults.length ? {
          status: "original OM source music",
          sourceScoreSegments: nativeComposerResults.map(({ source }) => ({ segmentId: source.segmentId, scoreSha256: source.scoreSha256, timeMapId: source.timeMapId })),
          defaultPresetSegments: nativePresetResults.map(({ source, plan: sourcePlan, rendered }) => ({ segmentId: source.segmentId, sourcePlanSha256: source.sourcePlanSha256, style: sourcePlan.style, product: sourcePlan.product, choice: sourcePlan.choice, seed: sourcePlan.seed, bpm: sourcePlan.bpm, keyMidi: sourcePlan.root, scale: sourcePlan.scale, timeMapId: source.timeMapId, voiceDuckProcessing: rendered.voiceDuckProcessing || null, sourceMusicLevel: rendered.sourceMusicLevel || null })),
        }
          : baseMusicTracks.length ? { status: "existing audio-plan music track preserved", trackIds: baseMusicTracks.map((track) => track.id) }
            : { status: "omitted; SFX-only request" },
    musicPreset: presetResult ? {
      request: { product: validatedRequest.musicPreset.product || null, style: validatedRequest.musicPreset.style || null, variant: validatedRequest.musicPreset.variant ?? null, sections: presetResult.requestedSections, dropEventId: validatedRequest.musicPreset.dropEventId || null, endEventId: validatedRequest.musicPreset.endEventId || null, ending: presetResult.plan.ending },
      sourcePlan: { style: presetResult.plan.style, product: presetResult.plan.product, choice: presetResult.plan.choice, bpm: presetResult.plan.bpm, rootMidi: presetResult.plan.root, scale: presetResult.plan.scale, voiced: presetResult.plan.voiced, sections: presetResult.outputSections, dropSec: presetResult.plan.drop, endSec: presetResult.plan.end, filteredSectionEventIds: presetResult.requestedSections.map((row) => row.eventId).filter((id) => !presetResult.plan.sections.some((section) => section.id === id)) },
      sourceFunctions: selectedSource
        ? { plan: "score.js:plan for section energy only", sectionEnergy: "sound.js:rideEnergy source fragment migrated with local DSP binding; numerical operation order retained", hitAutomation: "sound.js:automate and DUCK_HITS source fragments migrated with local DSP binding after manual automation conflict suppression; numerical operation order retained", styleReverb: "omitted for existing BGM", dropSweep: "omitted for existing BGM", styleMaster: "omitted for existing BGM", lowBalance: "omitted for existing BGM", fade: "omitted for existing BGM; canonical end automation remains event-bound", sourceVoiceDuck: presetResult.voiceDuckProcessing?.applied === true
          ? `${presetResult.voiceDuckProcessing.processor} is baked into this replacement music WAV; final audio.mjs does not apply another voice duck to the same windows`
          : presetResult.voiceDuckProcessing?.processor
            ? `not baked by this source render; ${presetResult.voiceDuckProcessing.processor} owns voice-window attenuation${presetResult.voiceDuckProcessing.reason ? ` (${presetResult.voiceDuckProcessing.reason})` : ""}`
            : "not applied by this source render; no mapped canonical voiceWindows overlap required source ducking", fullMixdown: "omitted" }
        : { plan: "score.js:plan", renderScore: "score.js:renderScore", pump: "score.js:pump (pad and bass buses only)", styleReverb: "dsp.js:reverb using p.S.reverb", dropSweep: "sound.js:buildSweep source fragment migrated with local DSP binding; numerical operation order retained", sectionEnergy: "sound.js:rideEnergy source fragment migrated with local DSP binding; numerical operation order retained", hitAutomation: "sound.js:automate and DUCK_HITS source fragments migrated with local DSP binding after manual automation conflict suppression; numerical operation order retained", styleMaster: "score.js:master", lowBalance: "sound.js:balanceLows source fragment migrated with local DSP binding; numerical operation order retained", fade: "sound.js:music branch 30 ms head fade / source outro fade migrated in source order", sourceVoiceDuck: "original sound.duck source fragment is baked into a generated music stem when mapped voiceWindows overlap and no explicit audio-plan duck exists; explicit plan duck stays with the final audio.mjs mixer", fullMixdown: "omitted" },
      automationEventIds: presetResult.automationEventIds,
      automationResolution: presetResult.automationResolution,
      outputWav: presetResult.outputWav,
      ...(selectedSource ? { selectedSource: { trackId: selectedSource.track.id, assetId: selectedSource.asset.id, assetSha256: selectedSource.assetSha256, sourceInSec: selectedSource.clock.sourceInSec, sourceOutSec: selectedSource.clock.sourceOutSec, outputSourceInSec: 0, outputSourceOutSec: presetResult.outputWav.durationSec, trackStartSec: selectedSource.track.startSec, trackSpeed: selectedSource.track.speed ?? 1, timeMapId: selectedSource.track.timeMapId || null, timeMap: selectedSource.clock.mapping, effectiveSpeed: selectedSource.clock.combinedSpeed, filmStartSec: selectedSource.clock.filmStartSec, selectedTrackReplacedInPlace: true, decodedFrames: selectedSource.decodedFrames, frameAdjustment: selectedSource.frameAdjustment } } : { generatedNewTrack: true }),
      ...(presetSamplePack ? { samplePack: presetSamplePack } : {}),
    } : null,
    keyContext: validatedRequest.keyContext,
    sfxKeyContext,
    sourceAndPostGain: {
      music: hasMusic ? (requestGeneratedSourceGroupRows.length
        ? { sourceProcessingBaked: true, requestGeneratedSourceGroup: true, preBusGainDb: validatedRequest.musicMixGainDb, postMixGainDb: 0, gainApplication: "after-source-music-target-normalization-before-fx-combine-and-shared-bus" }
        : { sourceProcessingBaked: true, postMixGainDb: validatedRequest.musicMixGainDb, existingTrackGainDbPreserved: selectedSource ? selectedSource.track.gainDb ?? 0 : null }) : null,
      nativeSourceSoundtrack: nativeSourceSoundtrackRows.length ? "Original source sound.mixdown output contains the source music, source SFX, FX room, levels and limiter once; with one eligible locked voice track it receives measured voiceLufs and segment-local windows, while the voice file is added exactly once by audio.mjs. The source-premix track remains unlocked at 0 dB and is accepted only with a hash-bound source receipt, voice binding, and canonical timeMap; post-mix automation/ducking and duplicate baked SFX are rejected." : null,
      sfx: "Upstream Track sourceGain and mono sourcePan are baked once. For new /2 musicPreset plus voiced generated-stem requests, the pinned source sound.mixdown FX level is carried once as sourceLevelGainDb on the audio-plan event, then the caller's mixGainDb remains a separate userPostMixGainDb; other SFX routes retain their existing explicit event gain. Canonical source SFX baked into nativeSourceSoundtracks or request-generated source groups are not generated or leveled a second time.",
    },
    outputs: { audioPlan: outputPlan, assets: wavRows.map((row) => ({ file: row.file, sha256: row.sha256, wav: wavFacts(row.wav) })) },
    preservedBasePlan: { lockedTracks: (basePlan.tracks || []).filter((track) => track.locked).map((track) => track.id), voiceWindows: basePlan.voiceWindows || [], ducking: basePlan.ducking || null },
    qualityBoundary: "Technical PCM generation, source-pinned closure, and event mapping only. No generated audio has been auditioned or approved; every new asset remains generated-unreviewed and final audio.mjs preview still requires --allow-generated-preview.",
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  const receiptSha256 = sha256(manifestBytes);
  const receiptRelativePath = path.relative(path.dirname(outputPlan), manifestPath).split(path.sep).join("/");
  const filmManifestRelativePath = path.relative(path.dirname(outputPlan), film.manifestPath).split(path.sep).join("/");
  for (const sourceRow of nativeSourceSoundtrackRows) {
    const track = plan.tracks.find((row) => row.id === sourceRow.trackId);
    if (!track) fail("Native source soundtrack track disappeared before its ownership binding was written: " + sourceRow.trackId);
    track.sourceProcessing = {
      format: film.manifest.format === "laohu.motion-film-manifest/2"
        ? "laohu.motion.source-premix-processing/2"
        : "laohu.motion.source-premix-processing/1",
      ...(film.manifest.format === "laohu.motion-film-manifest/2" ? { nativeBaseSourceContract: "nativeBaseSources/1" } : {}),
      owner: "huashu-motion.sound.mixdown",
      receiptPath: receiptRelativePath,
      receiptSha256,
      filmManifestPath: filmManifestRelativePath,
      filmManifestSha256,
      canonicalEventSceneSha256: film.sceneSha256,
      segmentId: sourceRow.segmentId,
      sourceKind: sourceRow.kind,
      sourceScenePath: sourceRow.sourceScenePath,
      sourceSceneSha256: sourceRow.sourceSceneSha256,
      sourceDeclarationSha256: sourceRow.sourceDeclarationSha256,
      sourcePlanSha256: sourceRow.sourcePlanSha256,
      sourceScoreSha256: sourceRow.sourceScoreSha256,
      timeMapId: sourceRow.timeMapId,
      sourceDurationSec: sourceRow.sourceDurationSec,
      assetSha256: sourceRow.outputWav.sha256,
      sourceMixdown: sourceRow.sourceMixdown,
      voiceBinding: sourceRow.voiceBinding,
      bakedCanonicalEvents: sourceRow.bakedCanonicalEvents,
    };
  }
  for (const sourceRow of requestGeneratedSourceGroupRows) {
    const track = plan.tracks.find((row) => row.id === sourceRow.trackId);
    if (!track) fail("Request-generated source-group track disappeared before its ownership binding was written: " + sourceRow.trackId);
    track.sourceGeneratedGroup = {
      format: sourceRow.format,
      owner: "laohu-motion.request-generated-source-group",
      receiptPath: receiptRelativePath,
      receiptSha256,
      filmManifestPath: filmManifestRelativePath,
      filmManifestSha256,
      canonicalEventSceneSha256: film.sceneSha256,
      requestPath: sourceRow.requestPath,
      requestSha256: sourceRow.requestSha256,
      requestCanonicalSha256: sourceRow.requestCanonicalSha256,
      sourceCommit: sourceRow.sourceCommit,
      localRuntimeClosureSha256: sourceRow.localRuntimeClosureSha256,
      sourceClosureSha256: sourceRow.sourceClosureSha256,
      p0Sha256: sourceRow.p0Sha256,
      sourceKit: sourceRow.sourceKit,
      assetSha256: sourceRow.outputWav.sha256,
      groupId: sourceRow.groupId,
      trackId: sourceRow.trackId,
      assetId: sourceRow.assetId,
      sourceDurationSec: sourceRow.sourceDurationSec,
      musicGainDb: sourceRow.musicGainDb,
      sourceMixdown: sourceRow.sourceMixdown,
      voiceBinding: sourceRow.voiceBinding,
      canonicalEventBindings: sourceRow.canonicalEventBindings,
      bakedCanonicalEvents: sourceRow.bakedCanonicalEvents,
    };
  }
  validatePlan(plan);
  for (const row of wavRows) if (!existingWavs.get(path.resolve(row.file))) await writeNewAtomic(row.file, row.wav);
  await writeNewAtomic(manifestPath, manifestBytes);
  await writeNewAtomic(outputPlan, Buffer.from(JSON.stringify(plan, null, 2) + "\n"));
  return { plan, manifest };
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) return { help: true };
  if (argv[0] !== "render") fail("First argument must be render");
  const values = new Set(["--request", "--plan", "--film-manifest", "--assets-dir", "--project-root", "--output-plan", "--manifest"]);
  const args = {};
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (!values.has(key)) fail("Unknown argument " + key);
    if (!argv[index + 1] || argv[index + 1].startsWith("--")) fail("Missing value for " + key);
    const name = key.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    args[name] = argv[++index];
  }
  for (const key of ["request", "plan", "filmManifest", "assetsDir", "outputPlan", "manifest"]) if (!args[key]) fail("Missing --" + key.replace(/[A-Z]/g, (char) => "-" + char.toLowerCase()));
  for (const [key, value] of Object.entries(args)) if (key !== "help" && !path.isAbsolute(value)) fail("--" + key.replace(/[A-Z]/g, (char) => "-" + char.toLowerCase()) + " must be an absolute path");
  args.projectRoot = path.resolve(args.projectRoot || path.dirname(args.plan));
  for (const key of ["request", "plan", "filmManifest", "assetsDir", "outputPlan", "manifest"]) args[key] = path.resolve(args[key]);
  return args;
}
function usage() {
  return "Usage: node scripts/laohu-audio-source.mjs render --request /absolute/request.json --plan /absolute/base-audio-plan.json --film-manifest /absolute/film-manifest.json --assets-dir /absolute/project/audio/generated --output-plan /absolute/project/audio-plan.generated.json --manifest /absolute/project/audio-plan.generated.receipt.json [--project-root /absolute/project]\n"
    + "       node scripts/laohu-audio-source.mjs samples build --out /absolute/project/sample-pack [--only piano,strings]\n"
    + "Request /1 retains ABC/SFX behavior. Request /2 may select a source product/style preset, a generated score or one unlocked music track to derive. samples build requires an explicit project path; the sample route validates the pack before rendering.";
}

function sampleBuilderInstrumentIds(source) {
  const match = /const SPECS = \[([\s\S]*?)^\];/m.exec(source);
  if (!match) fail("Local samples builder no longer exposes the expected static SPECS block; refusing to guess supported --only IDs");
  const ids = [...match[1].matchAll(/^\s*\{\s*id:\s*'([^']+)'/gm)].map((row) => row[1]);
  if (!ids.length) fail("Local samples builder has no readable instrument IDs in SPECS");
  return new Set(ids);
}

async function runSampleBuild(argv) {
  if (argv.length > 1 && ["--help", "-h"].includes(argv.at(-1))) { process.stdout.write("Usage: node scripts/laohu-audio-source.mjs samples build --out /absolute/project/sample-pack [--only id,id]\n"); return; }
  if (argv[0] !== "build") fail("samples subcommand must be build");
  const values = new Set(["--out", "--only"]), args = {};
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (!values.has(key)) fail("Unknown samples build argument " + key);
    if (!argv[index + 1] || argv[index + 1].startsWith("--")) fail("Missing value for " + key);
    args[key.slice(2)] = argv[++index];
  }
  if (!args.out || !path.isAbsolute(args.out)) fail("samples build requires an absolute --out inside the project");
  const projectRoot = await fs.realpath(process.cwd());
  const output = path.resolve(args.out);
  const localAudio = await loadLocalAudioRuntime();
  const builderRecord = localAudio.runtime.files.find((row) => row.path === "templates/runtime/laohu-audio-samples-build.mjs" && row.sourcePath === "cli/lib/samples-build.js");
  if (!builderRecord) fail("The catalog-pinned local audio closure is missing the samples-build.js to laohu-audio-samples-build.mjs mapping");
  const builderPath = path.resolve(skillDir, builderRecord.path);
  const buildSource = await fs.readFile(builderPath, "utf8");
  const supportedIds = sampleBuilderInstrumentIds(buildSource);
  const only = args.only == null ? null : [...new Set(args.only.split(",").map((value) => value.trim()).filter(Boolean))];
  if (only && !only.length) fail("--only must contain at least one sample instrument ID");
  for (const id of only || []) if (!supportedIds.has(id)) fail("--only requested unsupported sample instrument ID: " + id);

  // Resolve the requested future path through its nearest existing ancestor before mkdir can create anything.
  const outputCandidate = await realPath(output);
  const parentCandidate = await realPath(path.dirname(output));
  if (!contains(projectRoot, outputCandidate) || !contains(projectRoot, parentCandidate) || outputCandidate === projectRoot) {
    fail("samples build --out must stay inside the current project root; home/cache fallback is prohibited");
  }
  const existingOutput = await fs.lstat(output).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (existingOutput?.isSymbolicLink()) fail("samples build --out must not be a symlink");
  if (existingOutput && !existingOutput.isDirectory()) fail("samples build --out must be a project-local directory");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const parentReal = await fs.realpath(path.dirname(output));
  if (!contains(projectRoot, parentReal)) fail("samples build --out parent escaped the project root during directory preparation");
  await fs.mkdir(output, { recursive: true });
  const outputReal = await fs.realpath(output);
  if (!contains(projectRoot, outputReal) || outputReal !== outputCandidate) fail("samples build --out changed identity during directory preparation; refusing to write outside the project root");
  process.env.OM_SAMPLES = outputReal;
  const ffmpeg = process.env.MOTION_FFMPEG || "ffmpeg";
  const priorPath = process.env.PATH || "";
  const priorStrictFfmpeg = process.env.LAOHU_FFMPEG;
  if (path.isAbsolute(ffmpeg)) process.env.PATH = [path.dirname(ffmpeg), priorPath].filter(Boolean).join(path.delimiter);
  process.env.LAOHU_FFMPEG = ffmpeg;
  let result, log;
  try {
    const builder = await import(pathToFileURL(builderPath).href);
    if (typeof builder.buildSamples !== "function") fail("The local samples builder is missing buildSamples({out, only, log})");
    log = [];
    result = await builder.buildSamples({ out: outputReal, only, log: (line) => log.push(line) });
  } finally {
    process.env.PATH = priorPath;
    if (priorStrictFfmpeg == null) delete process.env.LAOHU_FFMPEG;
    else process.env.LAOHU_FFMPEG = priorStrictFfmpeg;
  }
  for (const line of log) process.stdout.write(line + "\n");
  process.stdout.write(result + "\nSOURCE_COMMIT " + localAudio.pin.source.commit + "\nSAMPLE_BUILDER_LOCAL true\n");
  const manifestPath = path.join(outputReal, "manifest.json");
  const manifest = await readJson(manifestPath, "built sample manifest");
  const idsToValidate = only || Object.keys(manifest.instruments || {});
  if (!idsToValidate.length) fail("Local sample build produced no instrument IDs; no sample pack was validated");
  const ffprobe = process.env.MOTION_FFPROBE || (path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe") : "ffprobe");
  const verified = await inspectRecordedPack({ packDir: outputReal, projectRoot, requiredInstrumentIds: idsToValidate, ffmpeg, ffprobe });
  const failures = /\b(\d+) failed\b/i.exec(result);
  if (failures && Number(failures[1]) > 0) {
    const affected = idsToValidate.join(", ");
    fail(`Local sample build reported ${failures[1]} failure(s) while processing requested instrument ID(s): ${affected}. Existing files were validated, but this invocation is incomplete and must not be treated as a successful fresh build.`);
  }
  process.stdout.write(`VALIDATED_INSTRUMENT_IDS ${verified.requiredInstrumentIds.join(",")}\n`);
  process.stdout.write(`VALIDATED_SAMPLE_FILES ${verified.files.length}\n`);
}

async function runCli(argv = process.argv.slice(2)) {
  if (argv[0] === "samples") return runSampleBuild(argv.slice(1));
  const args = parseArgs(argv);
  if (args.help) { process.stdout.write(usage() + "\n"); return; }
  await fs.access(args.projectRoot);
  const projectRoot = await fs.realpath(args.projectRoot);
  const assetsDir = await fs.realpath(args.assetsDir).catch((error) => fail("--assets-dir must already exist: " + error.message));
  if (!contains(projectRoot, assetsDir)) fail("--assets-dir must be inside --project-root");
  const requestPath = args.request, planPath = args.plan, filmManifestPath = args.filmManifest;
  const outputPlan = path.resolve(args.outputPlan), manifestPath = path.resolve(args.manifest);
  const [requestBytes, basePlan, film, requestReal, planReal, filmManifestReal] = await Promise.all([
    fs.readFile(requestPath), readJson(planPath, "base audio plan"), verifyFilmManifest(filmManifestPath),
    fs.realpath(requestPath), fs.realpath(planPath), fs.realpath(filmManifestPath),
  ]);
  let request;
  try { request = JSON.parse(requestBytes.toString("utf8")); }
  catch (error) { fail("request could not be read as JSON: " + requestPath + " (" + error.message + ")"); }
  await assertOutputPath(outputPlan, projectRoot, "--output-plan");
  await assertOutputPath(manifestPath, projectRoot, "--manifest");
  for (const input of [requestReal, planReal, filmManifestReal, ...film.verifiedFiles.map((item) => item.path)]) if (path.resolve(input) === outputPlan || path.resolve(input) === manifestPath) fail("Output path collides with an input file");
  const result = await generatePlan({ request, basePlan, basePlanPath: planPath, film, inputFiles: [requestReal, planReal, filmManifestReal], requestFilePath: requestReal, requestFileSha256: sha256(requestBytes), assetsDir, projectRoot, outputPlan, manifestPath });
  process.stdout.write("AUDIO_PLAN " + outputPlan + "\nMANIFEST " + manifestPath + "\nGENERATED_ASSETS " + result.manifest.outputs.assets.length + "\nSTATUS generated-unreviewed\n");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => { process.stderr.write((error.stack || error.message) + "\n" + usage() + "\n"); process.exitCode = 1; });
}

export { buildComposerHitRows, buildSourcePresetPlan, floatWav, generatePlan, loadUpstream, mapEventsToSelectedSource, renderOneSfx, renderPresetStem, resolveDerivedDuckHits, resolveNativePresetVoicePolicy, resolveSourceEvents, resolveSourceFxLevelGainDb, runCli, validateFilmMaps, verifyFilmManifest, wavFacts };
