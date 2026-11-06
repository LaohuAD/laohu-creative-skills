#!/usr/bin/env node
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findSceneAudioEvents, mapLocalTimeToFilm, mapSceneEvents, validatePlan } from "./audio.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = path.join(skillDir, "templates", "upstream", "huashu-motion");
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
  for (const row of rows) if (row.dev !== first) fail("All inputs, vendor files, project assets, and outputs must remain on one filesystem; mismatch at " + row.file);
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

function staticModuleSpecifiers(source) {
  const out = [];
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    const match = trimmed.match(/^(?:import\s+(?:[^'";]*?\s+from\s+)?|export\s+[^'";]*?\s+from\s+)['"]([^'"]+)['"]/);
    if (match) out.push(match[1]);
    const dynamic = [...trimmed.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)];
    for (const item of dynamic) out.push(item[1]);
  }
  return out;
}

async function pinnedAudioClosure({ additionalEntries = [] } = {}) {
  const catalog = await readJson(catalogPath, "template catalog");
  const source = (catalog.sources || []).find((item) => item.id === EXPECTED_SOURCE.id);
  if (!source || source.repository !== EXPECTED_SOURCE.repository || source.commit !== EXPECTED_SOURCE.commit) fail("Huashu Motion source pin in templates/catalog.json does not match the approved commit");
  if (!String(source.license || "").includes("MIT") || !(source.licenseFiles || []).includes("LICENSE")) fail("The pinned source record must retain its MIT license evidence");
  const ledger = new Map((source.files || []).map((item) => [item.path, item]));
  const rootReal = await fs.realpath(vendorRoot);
  const pending = ["cli/lib/sound.js", "cli/lib/composed.js", "cli/lib/score.js", ...additionalEntries];
  const visited = new Set();
  while (pending.length) {
    const relative = pending.pop();
    if (visited.has(relative)) continue;
    if (!relative.startsWith("cli/lib/") || path.posix.isAbsolute(relative) || relative.split("/").includes("..")) fail("Upstream audio import escaped its approved cli/lib closure: " + relative);
    const full = path.join(vendorRoot, ...relative.split("/"));
    const [real, stat] = await Promise.all([fs.realpath(full), fs.stat(full)]);
    if (!contains(rootReal, real) || !stat.isFile()) fail("Vendored upstream import is missing or escapes its source root: " + relative);
    const bytes = await fs.readFile(real);
    const hash = sha256(bytes);
    const pin = ledger.get(relative);
    if (!pin || pin.sha256 !== hash) fail("Vendored upstream audio file is not covered by its current catalog SHA-256 pin: " + relative);
    visited.add(relative);
    for (const specifier of staticModuleSpecifiers(bytes.toString("utf8"))) {
      if (specifier.startsWith("node:")) continue;
      if (!specifier.startsWith(".")) fail("Unpinned external package import in Huashu audio runtime: " + specifier);
      let resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      if (!path.posix.extname(resolved)) resolved += ".js";
      pending.push(resolved);
    }
  }
  for (const licensePath of ["LICENSE", "THIRD_PARTY.md", "package.json"]) {
    const full = path.join(vendorRoot, licensePath);
    const body = await fs.readFile(full);
    const pin = ledger.get(licensePath);
    if (!pin || pin.sha256 !== sha256(body)) fail("Required source license/package file is absent from the current pin ledger: " + licensePath);
    if (licensePath === "package.json" && JSON.parse(body).type !== "module") fail("Vendored Huashu Motion package must retain its upstream ESM package boundary");
  }
  return {
    source: { id: source.id, repository: source.repository, commit: source.commit },
    closure: [...visited].sort().map((file) => ({ path: file, sha256: ledger.get(file).sha256, gitBlob: ledger.get(file).gitBlob || null })),
    licenseFiles: ["LICENSE", "THIRD_PARTY.md"],
    license: source.license,
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
  if (manifest.output?.kind !== "picture-only-remotion-v2") fail("Shotcraft film manifest.output.kind must identify a picture-only Remotion /2 output");
  const render = plainObject(manifest.render, "Shotcraft film manifest.render");
  const frameClock = plainObject(manifest.frameClock, "Shotcraft film manifest.frameClock");
  if (frameClock.kind !== expectedClockKind || frameClock.method !== "absolute-ceil-boundaries" || frameClock.fps !== 30) fail("Shotcraft film frameClock must preserve its declared absolute-ceil 30 fps clock");
  const frameCount = finite(render.frameCount, "Shotcraft film render.frameCount", { min: 1 });
  if (!Number.isSafeInteger(frameCount) || frameClock.totalFrameCount !== frameCount || render.width !== 1920 || render.height !== 1080 || render.fps !== 30) fail("Shotcraft film render metadata must be 1920×1080@30 with the frameClock total");
  const durationSec = finite(render.durationSec, "Shotcraft film render.durationSec", { min: 1 / 30 });
  if (Math.abs(durationSec - frameCount / 30) > 1e-8) fail("Shotcraft film render duration does not equal its complete frame count");
  const probe = plainObject(render.probe, "Shotcraft film render.probe");
  if (probe.codec !== "h264" || probe.width !== 1920 || probe.height !== 1080 || probe.fps !== 30 || probe.frameCount !== frameCount || probe.audioStreams !== 0) fail("Shotcraft film probe must prove one picture-only H.264 1920×1080@30 stream with no audio");
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
    maps.set(id, { id, segmentId, localStartSec, localEndSec, filmStartSec, speed, sourceRange:row.sourceRange, frameRange:{startFrame,endFrame} });
  }
  return maps;
}

async function verifyFilmManifest(file) {
  const manifestFile = path.resolve(file);
  const manifest = await readJson(manifestFile, "film manifest");
  plainObject(manifest, "film manifest");
  const isShotcraftV2 = manifest.format === "laohu.motion-film-manifest/1";
  if (!["laohu.huashu-om-film-manifest/1", "laohu.motion-film-manifest/1"].includes(manifest.format)) fail("Unsupported film manifest format");
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
    sourceScenes.set(segmentId, { ...row, path: sourcePath, sha256: verified.sha256 });
    verifiedFiles.push(verified);
    if (isShotcraftV2 && (!picture.segmentIds.has(segmentId) || sourcePath !== scenePath || verified.sha256 !== sceneFile.sha256)) fail("Shotcraft sourceScenes must point to the pinned canonical event scene and a rendered segment: " + segmentId);
  }
  const bindings = new Map();
  for (const [index, raw] of asArray(manifest.audioEventBindings, "film manifest.audioEventBindings").entries()) {
    const row = plainObject(raw, `film manifest.audioEventBindings[${index}]`);
    const eventId = stableId(row.eventId, `audioEventBindings[${index}].eventId`);
    const sourceEventId = stableId(row.sourceEventId, `audioEventBindings[${index}].sourceEventId`);
    const segmentId = stableId(row.segmentId, `audioEventBindings[${index}].segmentId`);
    if (bindings.has(eventId)) fail("Film manifest has ambiguous event-to-clock binding for " + eventId);
    if (eventId !== sourceEventId) fail("Compiled audio event ID must preserve its source stable ID; refusing an unsynchronized ID rewrite for " + eventId);
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
  const optionalHashFiles = [];
  for (const [pathKey, hashKey, label] of [["timelinePath", "timelineSha256", "ASR canonical timeline"], ["editPlanPath", "editPlanSha256", "ASR edit plan"]]) {
    const pathValue = source[pathKey], hashValue = source[hashKey];
    if ((pathValue == null) !== (hashValue == null)) fail(`film manifest.source.${pathKey}/${hashKey} must be supplied together`);
    if (pathValue != null) optionalHashFiles.push(await verifyFileHash(manifestPath(baseDir, pathValue, `film manifest.source.${pathKey}`), hashValue, label));
  }
  if (source.clockKind === "asrcut-v2" && (!source.timelinePath || !source.editPlanPath)) fail("asrcut-v2 film manifests must pin both canonical timeline and edit plan");
  verifiedFiles.push(...optionalHashFiles);
  return { manifest, manifestPath: manifestFile, source, blueprintPath, blueprintSha256: blueprint.sha256, scene, scenePath, sceneSha256: sceneFile.sha256, maps, bindings, sourceScenes, verifiedFiles };
}

async function loadUpstream({ runtimeLibDir = null, samplePackDir = null } = {}) {
  // samples.js falls back to a home-directory pack unless this is set before its first import.
  process.env.OM_SAMPLES = samplePackDir || "off";
  if (samplePackDir) {
    process.env.LAOHU_REQUIRE_RECORDED = "1";
    process.env.LAOHU_FFMPEG = process.env.MOTION_FFMPEG || process.env.LAOHU_FFMPEG || "ffmpeg";
  }
  else delete process.env.LAOHU_REQUIRE_RECORDED;
  const libDir = runtimeLibDir || path.join(vendorRoot, "cli/lib");
  const [sound, composed, score, dsp] = await Promise.all([
    import(pathToFileURL(path.join(libDir, "sound.js")).href),
    import(pathToFileURL(path.join(libDir, "composed.js")).href),
    import(pathToFileURL(path.join(libDir, "score.js")).href),
    import(pathToFileURL(path.join(libDir, "dsp.js")).href),
  ]);
  for (const [name, value] of [["SFX", sound.SFX], ["KITS", sound.KITS], ["Track", sound.Track], ["toWav", sound.toWav], ["renderComposed", composed.renderComposed], ["deg", score.deg], ["mtof", dsp.mtof], ["rng", dsp.rng]]) {
    if (!value) fail("Pinned Huashu Motion public audio API is missing export " + name);
  }
  if (sound.RATE !== RATE || dsp.RATE !== RATE) fail("Huashu Motion audio sample rate differs from the audio-plan 48 kHz contract");
  const samples = runtimeLibDir ? await import(pathToFileURL(path.join(libDir, "samples.js")).href) : null;
  return { sound, composed, score, dsp, samples };
}

function validateRequest(request, durationSec) {
  plainObject(request, "request");
  if (Object.prototype.hasOwnProperty.call(request, "hitFilmSec")) fail("request must not supply hitFilmSec; canonical film time is derived only from the shared event scene and its manifest timeMap");
  const isV1 = request.format === "laohu.motion.huashu-audio-request/1";
  const isV2 = request.format === "laohu.motion.huashu-audio-request/2";
  if (!isV1 && !isV2) fail("request.format must be laohu.motion.huashu-audio-request/1 or /2");
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
  if (!hasComposition && !hasPreset && manualRows.length === 0) fail("request must contain request.composition or musicPreset for music, sfxEvents for SFX, or both");
  finite(request.musicMixGainDb == null ? 0 : request.musicMixGainDb, "request.musicMixGainDb", { min: -120, max: 24 });
  const musicMixGainDb = request.musicMixGainDb == null ? 0 : request.musicMixGainDb;
  if (!hasComposition && !hasPreset && musicMixGainDb !== 0) fail("request.musicMixGainDb requires a music source; SFX-only level belongs to each sfxEvents[].mixGainDb");
  return { apiVersion: isV1 ? 1 : 2, composition, musicPreset, scoreSha256, keyContext, keyContextProvided, marks, cueBindings, manualRows: [...new Map(manualRows.map((item) => [item.id, item])).values()], musicMixGainDb };
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
  let format, channels, sampleRate, bitsPerSample, dataLength;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const tag = buffer.toString("ascii", offset, offset + 4), size = buffer.readUInt32LE(offset + 4), body = offset + 8;
    if (body + size > buffer.length) fail("Generated WAV contains a truncated chunk");
    if (tag === "fmt ") {
      format = buffer.readUInt16LE(body); channels = buffer.readUInt16LE(body + 2); sampleRate = buffer.readUInt32LE(body + 4); bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (tag === "data") { dataLength = size; break; }
    offset = body + size + (size & 1);
  }
  if (format !== 3 || channels !== 2 || sampleRate !== RATE || bitsPerSample !== 32 || !Number.isSafeInteger(dataLength) || dataLength % 8 !== 0) fail("Generated WAV must be 48 kHz stereo IEEE-float PCM");
  let peakAbs = 0, overRangeSampleCount = 0;
  for (let offset = 44; offset < 44 + dataLength; offset += 4) {
    const sample = buffer.readFloatLE(offset);
    if (!Number.isFinite(sample)) fail("Generated float WAV contains a non-finite sample");
    peakAbs = Math.max(peakAbs, Math.abs(sample));
    if (Math.abs(sample) > 1) overRangeSampleCount += 1;
  }
  return { sampleRate, channels, bitsPerSample, encoding: "pcm_f32le", frames: dataLength / 8, durationSec: dataLength / 8 / sampleRate, peakAbs, overRangeSampleCount, peakAboveFullScalePreserved: peakAbs > 1 };
}

function sourceAsset({ id, file, durationSec, sha, hitTimeSec, sourceKind, closure, sampleProvenance = null, sampleUse = null }) {
  return {
    id, file, durationSec, sha256: sha,
    license: sampleProvenance ? sampleProvenance.licenses.join("; ") : GENERATED_LICENSE,
    redistribution: { status: "project-generated", basis: sampleProvenance
      ? "Generated locally with the pinned MIT Huashu Motion score source and the validated recorded sample files/credits listed in its source receipt; this asset is the mixed music stem, not a sample-pack redistribution."
      : "Synthesized locally with the pinned MIT Huashu Motion source; OM_SAMPLES=off and no upstream sample/recording assets were read." },
    reviewStatus: "generated-unreviewed",
    ...(hitTimeSec == null ? {} : { hitTimeSec, hitTimeMethod: "upstream-returned-lead-seconds", hitTimeConfidence: "source-function-return-value" }),
    source: { kind: "laohu-audio-source", repository: EXPECTED_SOURCE.repository, commit: EXPECTED_SOURCE.commit, outputKind: sourceKind, sourceClosureSha256: closure.sha256,
      ...(sampleProvenance ? { recordedSampleCredits: sampleProvenance.credits, samplePackManifestSha256: sampleProvenance.manifest.sha256 } : {}),
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
  if (!source.includes(traceAnchor)) fail("Pinned samples.js strict-runtime insertion point changed");
  source = source.replace(traceAnchor, "export const __laohuSampleTrace = { decodedFiles: [], instrumentUses: [] };\n" + traceAnchor);
  const ffmpegAnchor = "spawnSync('ffmpeg', ['-v', 'error', '-i', join(pack.dir, file), '-f', 'f32le', '-ac', String(c), '-ar', String(RATE), '-'], { maxBuffer: 256 << 20 })";
  if (!source.includes(ffmpegAnchor)) fail("Pinned samples.js decoder command changed; refusing an unpinned executable path");
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
  if (!source.includes(rawAnchor)) fail("Pinned samples.js decoder fallback changed; refusing a non-strict sample overlay");
  source = source.replace(rawAnchor, rawReplacement);
  const pitchedAnchor = "    const x = side(decode(s.file, s.ch));";
  if (!source.includes(pitchedAnchor)) fail("Pinned samples.js pitched-sample insertion point changed");
  source = source.replace(pitchedAnchor, "    __laohuSampleTrace.instrumentUses.push({ instrumentId: id, kind: 'pitched', requestedMidi: midi, root: s.root, file: s.file });\n" + pitchedAnchor);
  const hitAnchor = "    const d = decode(s.file, s.ch), scale = (x) => { const o = new Float32Array(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i] * gain; return o; };";
  if (!source.includes(hitAnchor)) fail("Pinned samples.js unpitched-sample insertion point changed");
  source = source.replace(hitAnchor, "    __laohuSampleTrace.instrumentUses.push({ instrumentId: id, kind: 'unpitched', file: s.file });\n" + hitAnchor);
  const releaseAnchor = "      const rs = nearest(pool.length ? pool : rels, midi, r), rx = side(decode(rs.file, rs.ch));";
  if (!source.includes(releaseAnchor)) fail("Pinned samples.js release-sample insertion point changed");
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
  const importAnchor = "import { hit, sampler } from './samples.js';";
  if (!source.includes(importAnchor)) fail("Pinned score.js sample import changed; refusing a required-recording overlay");
  source = source.replace(importAnchor, "import { hasSample, hit, sampler } from './samples.js';");
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
  if (!source.includes(voiceAnchor)) fail("Pinned score.js voice fallback changed; refusing a required-recording overlay");
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
  if (!source.includes(drumAnchor)) fail("Pinned score.js drum fallback changed; refusing a required-recording overlay");
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
  if (!source.includes(inventoryAnchor)) fail("Pinned score.js sample role inventory insertion point changed");
  return source.replace(inventoryAnchor, inventoryAnchor + "\n" + inventory);
}

async function createSampleRuntimeOverlay({ pin, projectRoot }) {
  const tempRoot = path.join(projectRoot, ".cache", "tmp", "motion-source-integration", "audio-runtime");
  await fs.mkdir(tempRoot, { recursive: true });
  const runtimeRoot = await fs.mkdtemp(path.join(tempRoot, "source-"));
  const transformed = [];
  for (const row of pin.closure) {
    const sourcePath = path.join(vendorRoot, ...row.path.split("/"));
    let body = await fs.readFile(sourcePath, "utf8");
    if (row.path === "cli/lib/samples.js") body = patchStrictSamplesSource(body);
    if (row.path === "cli/lib/score.js") body = patchStrictScoreSource(body);
    const targetPath = path.join(runtimeRoot, ...row.path.split("/"));
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, body);
    transformed.push({ path: row.path, upstreamSha256: row.sha256, runtimeSha256: sha256(Buffer.from(body)) });
  }
  const packageBytes = await fs.readFile(path.join(vendorRoot, "package.json"));
  await fs.writeFile(path.join(runtimeRoot, "package.json"), packageBytes);
  return { root: runtimeRoot, libDir: path.join(runtimeRoot, "cli/lib"), transformed };
}

async function createSynthOffRuntimeOverlay({ pin, projectRoot }) {
  const tempRoot = path.join(projectRoot, ".cache", "tmp", "motion-source-integration", "audio-runtime");
  await fs.mkdir(tempRoot, { recursive: true });
  const runtimeRoot = await fs.mkdtemp(path.join(tempRoot, "sfx-synth-off-"));
  const sourceFiles = [];
  for (const row of pin.closure) {
    const sourcePath = path.join(vendorRoot, ...row.path.split("/"));
    const bytes = await fs.readFile(sourcePath);
    if (sha256(bytes) !== row.sha256) fail("Pinned Huashu source changed while preparing isolated SFX runtime: " + row.path);
    const targetPath = path.join(runtimeRoot, ...row.path.split("/"));
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, bytes);
    sourceFiles.push({ path: row.path, sha256: row.sha256 });
  }
  await fs.copyFile(path.join(vendorRoot, "package.json"), path.join(runtimeRoot, "package.json"));
  return { root: runtimeRoot, libDir: path.join(runtimeRoot, "cli/lib"), sourceFiles };
}

async function loadSynthOffUpstream({ pin, projectRoot }) {
  const runtime = await createSynthOffRuntimeOverlay({ pin, projectRoot });
  const names = ["OM_SAMPLES", "LAOHU_REQUIRE_RECORDED", "LAOHU_FFMPEG"];
  const priorEnv = new Map(names.map((name) => [name, process.env[name]]));
  let upstream;
  try {
    process.env.OM_SAMPLES = "off";
    delete process.env.LAOHU_REQUIRE_RECORDED;
    const beforeImport = {
      OM_SAMPLES: process.env.OM_SAMPLES,
      LAOHU_REQUIRE_RECORDED: process.env.LAOHU_REQUIRE_RECORDED ?? null,
      packDirectory: null,
    };
    upstream = await loadUpstream({ runtimeLibDir: runtime.libDir, samplePackDir: null });
    beforeImport.packDirectory = upstream.samples?.packDir?.() ?? null;
    if (beforeImport.OM_SAMPLES !== "off" || beforeImport.LAOHU_REQUIRE_RECORDED !== null || beforeImport.packDirectory !== "off") {
      fail("Isolated SFX runtime did not import with OM_SAMPLES=off and recorded-required disabled");
    }
    const cachedPack = upstream.samples?.loadPack?.();
    if (cachedPack !== null) fail("Isolated SFX runtime exposed a recorded sample pack during its first cache initialization");
    runtime.importPolicy = {
      sourceClosureSha256: sha256(Buffer.from(canonical(runtime.sourceFiles))),
      environmentBeforeFirstImport: beforeImport,
      packCacheInitializedNullBeforeEnvironmentRestore: true,
      visiblePackAtFirstImport: false,
    };
  } finally {
    for (const name of names) {
      const value = priorEnv.get(name);
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
  runtime.importPolicy.environmentRestoredAfterImport = names.every((name) => process.env[name] === priorEnv.get(name));
  if (!runtime.importPolicy.environmentRestoredAfterImport) fail("SFX runtime failed to restore the caller's process environment after import");
  return { upstream, runtime };
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

function renderPresetStem({ upstream, presetPlan, hits }) {
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
  return { track: music, kicks, rngSeed: seed };
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

function renderOneSfx({ upstream, name, kitName, options, sourceGain, sourcePan, seed, key }) {
  const kit = upstream.sound.KITS[kitName];
  if (!kit) fail("Unknown Huashu Motion SFX kit: " + kitName);
  const source = upstream.sound.SFX[name];
  if (!source) fail("Unknown Huashu Motion SFX name: " + name);
  const fn = typeof kit[name] === "function" ? kit[name] : source.fn;
  if (typeof fn !== "function") fail("Huashu Motion has no callable SFX function for " + kitName + "/" + name);
  const hitOptions = { ...options, gain: sourceGain, pan: sourcePan };
  if (Object.prototype.hasOwnProperty.call(options, "at") || Object.prototype.hasOwnProperty.call(options, "gain") || Object.prototype.hasOwnProperty.call(options, "pan")) fail("SFX options may not override upstream event placement fields at/gain/pan; use eventId, sourceGain, sourcePan, and mixGainDb");
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

async function generatePlan({ request, basePlan, basePlanPath, film, inputFiles = [], assetsDir, projectRoot, outputPlan, manifestPath }) {
  if (typeof basePlanPath !== "string" || !basePlanPath) fail("basePlanPath is required to preserve relative project assets and ASR evidence references");
  const basePlanDirectory = await fs.realpath(path.dirname(path.resolve(basePlanPath))).catch((error) => fail("Base audio-plan directory is unavailable: " + error.message));
  const outputPlanDirectory = await fs.realpath(path.dirname(path.resolve(outputPlan))).catch((error) => fail("Output audio-plan directory must exist: " + error.message));
  if (basePlanDirectory !== outputPlanDirectory) fail("Base and generated audio plans must stay in the same directory so relative asset files and ASR evidence references retain their consumer paths");
  validatePlan(basePlan);
  const durationSec = finite(basePlan.durationSec, "audio plan durationSec", { min: 0.001, max: 600 });
  if (basePlan.sampleRate !== RATE || basePlan.channels !== 2) fail("Base audio plan must use the existing 48 kHz stereo contract");
  const validatedRequest = validateRequest(request, durationSec);
  const hasMusic = validatedRequest.composition != null || validatedRequest.musicPreset != null;
  const baseMusicTracks = (basePlan.tracks || []).filter((track) => track.bus === "music");
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
  const idList = normalizeBindings(validatedRequest);
  const resolvedEvents = resolveSourceEvents(idList, durationSec, film);
  const scene = film.scene;
  if (finite(scene.duration, "compiled audio-event scene.duration", { min: 0.001 }) + 1e-8 < durationSec) fail("Compiled audio-event scene is shorter than the audio-plan duration");
  const pin = await pinnedAudioClosure();
  const samplePackDir = validatedRequest.musicPreset?.samples?.packDir || null;
  if (samplePackDir && !contains(projectRoot, path.resolve(samplePackDir))) fail("musicPreset.samples.packDir must stay inside --project-root");
  const sampleRuntime = samplePackDir ? await createSampleRuntimeOverlay({ pin, projectRoot }) : null;
  const upstream = await loadUpstream({ runtimeLibDir: sampleRuntime?.libDir || null, samplePackDir });
  let sfxKeyContext = { ...validatedRequest.keyContext, basis: validatedRequest.keyContextProvided ? "explicit-request-keyContext" : "default-request-keyContext" };
  let key = keyFunction(sfxKeyContext, upstream);
  let composerResult = null;
  let presetResult = null;
  let presetRendered = null;
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
    const render = selectedSource
      ? (() => {
        const track = selectedSource.trackPcm;
        const rngSeed = `music:${presetPlan.style}:${presetPlan.seed}:${presetPlan.bpm}`;
        rideEnergy(track, presetPlan.sections, presetPlan.duration, upstream.dsp);
        applyGain(track, automateMusic(presetPlan, automationHits, upstream.dsp));
        return { track, kicks: [], rngSeed, sourceTrackId: selectedMusicTrack.id };
      })()
      : renderPresetStem({ upstream, presetPlan, hits: automationHits });
    presetRendered = render;
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
  const kitName = request.sfxKit == null ? "clean" : request.sfxKit;
  let sfxUpstream = upstream;
  let sfxRuntime = null;
  if (composerResult || validatedRequest.manualRows.length) {
    const isolated = await loadSynthOffUpstream({ pin, projectRoot });
    sfxUpstream = isolated.upstream;
    sfxRuntime = isolated.runtime;
    key = keyFunction(sfxKeyContext, sfxUpstream);
  }
  const composerHits = composerResult
    ? buildComposerHitRows(composerResult, validatedRequest, resolvedEvents, kitName, validatedRequest.composition.seed, key, sfxUpstream, scene)
    : [];
  const manualRows = validatedRequest.manualRows.map((item) => {
    const event = resolvedEvents.get(item.eventId);
    if (!event) fail("No canonical global event was resolved for manual SFX " + item.id);
    const options = plainObject(item.options == null ? {} : item.options, "SFX " + item.id + ".options");
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
  const sfxRows = [...composerHits, ...manualRows];
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
  const wavRows = [];
  const assetByHash = new Map();
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
    plan.assets.push(sourceAsset({ id: musicId, file: musicRelative, durationSec: musicFacts.durationSec, sha: musicSha, sourceKind: "renderComposed-stereo-music", closure }));
    plan.tracks.push({ id: musicTrackId, assetId: musicId, bus: "music", startSec: 0, gainDb: validatedRequest.musicMixGainDb });
    existingTrackIds.add(musicTrackId);
    assetByHash.set(musicSha, musicId);
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
  const generatedEvents = [];
  for (const row of sfxRows) {
    const rendered = renderOneSfx({ upstream: sfxUpstream, name: row.name, kitName: row.kit, options: row.options || {}, sourceGain: row.sourceGain, sourcePan: row.sourcePan, seed: row.seed, key });
    const wavFactsValue = wavFacts(rendered.wav);
    const hash = sha256(rendered.wav);
    let assetId = assetByHash.get(hash);
    if (!assetId) {
      assetId = "huashu-sfx-" + hash.slice(0, 16);
      assetByHash.set(hash, assetId);
      const filename = assetId + ".wav";
      const target = path.join(assetsDir, filename);
      const file = path.relative(planDir, target).split(path.sep).join("/");
      if (existingAssetIds.has(assetId) || existingTrackIds.has(assetId)) fail("Generated SFX asset ID already exists in base audio plan: " + assetId);
      plan.assets.push(sourceAsset({
        id: assetId, file, durationSec: wavFactsValue.durationSec, sha: hash, hitTimeSec: rendered.lead,
        sourceKind: "Huashu SFX function" + (row.kit === "clean" ? "" : " / " + row.kit + " kit"), closure,
        sampleUse: {
          mode: "synth-off",
          recordedSamplePackVisible: false,
          sourceRuntime: sfxRuntime?.root || "pinned source modules with OM_SAMPLES=off",
          packCacheInitializedNullBeforeEnvironmentRestore: sfxRuntime?.importPolicy.packCacheInitializedNullBeforeEnvironmentRestore ?? true,
        },
      }));
      wavRows.push({ file: target, wav: rendered.wav, sha256: hash });
    }
    const cueId = "huashu-sfx-event-" + safeStem(row.id);
    if (existingEventIds.has(cueId) || generatedEvents.some((event) => event.id === cueId)) fail("Generated SFX cue ID collision: " + cueId);
    generatedEvents.push({ id: cueId, eventId: row.eventId, assetId, bus: "sfx", gainDb: row.mixGainDb, ...(row.timeMapId ? { timeMapId: row.timeMapId } : {}) });
    row.assetId = assetId;
    row.cueId = cueId;
    row.sourceLeadSec = rendered.lead;
    row.sourceGainBaked = rendered.sourceGain;
    row.sourcePanBaked = rendered.sourcePan;
    row.sourcePanApplied = rendered.sourcePanApplied;
    row.sourceStereo = rendered.stereoSource;
    row.mixGainDb = row.mixGainDb;
  }
  plan.events.push(...generatedEvents);
  validatePlan(plan);

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
    projectRoot, assetsDir, path.dirname(outputPlan), path.dirname(manifestPath), vendorRoot,
    ...(selectedSource ? [selectedSource.assetPath] : []),
    ...(presetSamplePack ? [presetSamplePack.packDir] : []),
    ...(sampleRuntime ? [sampleRuntime.root] : []),
    ...inputFiles, ...film.verifiedFiles.map((item) => item.path),
  ]);
  for (const row of wavRows) if (!existingWavs.get(path.resolve(row.file))) await writeNewAtomic(row.file, row.wav);
  await writeNewAtomic(outputPlan, Buffer.from(JSON.stringify(plan, null, 2) + "\n"));
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
      kind: row.sourceCue.kind === "explicit-sfx-event" ? "explicit-sfx" : "score-hit-rise",
      requestId: row.id, cueId: row.cueId, assetId: row.assetId, eventId: row.eventId, phaseId: event.phaseId,
      canonicalFilmTimeSec: event.filmTimeSec, composerCue: row.sourceCue,
      source: { function: row.name, kit: row.kit, seed: row.seed, seedBasis: row.seedBasis, options: row.options, leadSec: row.sourceLeadSec, gainBaked: row.sourceGainBaked, panBaked: row.sourcePanBaked, panApplication: row.sourcePanApplied, stereo: row.sourceStereo },
      postMixGainDb: row.mixGainDb,
    });
  }
  const manifest = {
    format: "laohu.motion.huashu-audio-receipt/1",
    status: "generated-unreviewed",
    alignment: {
      status: "matched-to-compiled-film-events-and-verified-timeMaps",
      filmManifest: film.manifestPath,
      filmManifestFormat: film.manifest.format,
      blueprint: { path: film.blueprintPath, sha256: film.blueprintSha256 },
      canonicalEventScene: { path: film.scenePath, sha256: film.sceneSha256 },
      sourceSceneHashes: [...film.sourceScenes.values()].map((item) => ({ segmentId: item.segmentId, path: item.path, sha256: item.sha256 })),
      timeMaps: [...film.maps.values()],
      markAndHitBindings: bindingsReport, unmatchedComposerMarks: [],
    },
    source: { ...pin.source, closureSha256: closure.sha256, closure: pin.closure, licenseFiles: pin.licenseFiles },
    runtime: {
      api: composerResult ? "pinned public composed.renderComposed + Track + floatWav serialization"
      : presetResult ? selectedSource ? "pinned public score.plan for section dynamics; selected unlocked BGM decoded and replaced in place; migrated pinned private rideEnergy/automateMusic source fragments with local DSP/import bindings; floatWav serialization"
        : "pinned public score.plan/renderScore/pump/master; migrated pinned private buildSweep/rideEnergy/automateMusic/balanceLows source fragments with local DSP/import bindings; floatWav serialization"
          : "pinned public SFX/KITS/Track + floatWav serialization",
      privateRenderSfxUsed: false, sourceMixdownUsed: false, sourceVoiceDuckUsed: false, finalMixer: "scripts/audio.mjs remains the sole final audio-plan mixer",
      sourceMixBusesEnabled: false, sampleRateHz: RATE, channels: 2, encoding: "pcm_f32le",
      serializationReason: "The upstream toWav() quantizes and clamps to signed 16-bit; this adapter writes finite Track samples as IEEE-float and does not normalize or clip.",
      samples: presetSamplePack ? "musicPreset only: recorded-required pack preflighted and traced; generated SFX use a separate pinned synth-off runtime"
        : "musicPreset/SFX: OM_SAMPLES=off; no home-directory fallback",
      sampleScopes: {
        musicPreset: presetSamplePack
          ? { mode: "recorded-required", packDir: presetSamplePack.packDir, manifestSha256: presetSamplePack.manifest.sha256, actualUseReceipt: "musicPreset.samplePack" }
          : { mode: "synth-off", recordedSamplePackVisible: false, actualUseReceipt: "no recorded files used for music" },
        sfx: sfxRuntime
          ? { mode: "synth-off", recordedSamplePackVisible: false, runtimeRoot: sfxRuntime.root, sourceFiles: sfxRuntime.sourceFiles, importPolicy: sfxRuntime.importPolicy, sfxAssetMetadata: "assets[].source.sampleUse" }
          : { mode: "not-rendered", recordedSamplePackVisible: false, reason: "no SFX rows" },
      },
      ...(sampleRuntime ? { runtimeOverlay: { root: sampleRuntime.root, transformedSourceFiles: sampleRuntime.transformed } } : {}),
    },
    composition: composerResult ? { scoreSha256: validatedRequest.scoreSha256, seed: validatedRequest.composition.seed, report: composerResult.report, noteCount: composerResult.perf.notes.length, cueCount: composerResult.perf.cues.length }
      : presetResult ? { status: "pinned product/style score preset", style: presetResult.plan.style, product: presetResult.plan.product, choice: presetResult.plan.choice, seed: presetResult.plan.seed, bpm: presetResult.plan.bpm, keyMidi: presetResult.plan.root, scale: presetResult.plan.scale }
        : { status: "omitted; SFX-only request" },
    musicPreset: presetResult ? {
      request: { product: validatedRequest.musicPreset.product || null, style: validatedRequest.musicPreset.style || null, variant: validatedRequest.musicPreset.variant ?? null, sections: presetResult.requestedSections, dropEventId: validatedRequest.musicPreset.dropEventId || null, endEventId: validatedRequest.musicPreset.endEventId || null, ending: presetResult.plan.ending },
      sourcePlan: { style: presetResult.plan.style, product: presetResult.plan.product, choice: presetResult.plan.choice, bpm: presetResult.plan.bpm, rootMidi: presetResult.plan.root, scale: presetResult.plan.scale, voiced: presetResult.plan.voiced, sections: presetResult.outputSections, dropSec: presetResult.plan.drop, endSec: presetResult.plan.end, filteredSectionEventIds: presetResult.requestedSections.map((row) => row.eventId).filter((id) => !presetResult.plan.sections.some((section) => section.id === id)) },
      sourceFunctions: selectedSource
        ? { plan: "score.js:plan for section energy only", sectionEnergy: "sound.js:rideEnergy source fragment migrated with local DSP binding; numerical operation order retained", hitAutomation: "sound.js:automate and DUCK_HITS source fragments migrated with local DSP binding after manual automation conflict suppression; numerical operation order retained", styleReverb: "omitted for existing BGM", dropSweep: "omitted for existing BGM", styleMaster: "omitted for existing BGM", lowBalance: "omitted for existing BGM", fade: "omitted for existing BGM; canonical end automation remains event-bound", sourceVoiceDuck: "omitted; audio.mjs voiceWindows is the sole voice duck", fullMixdown: "omitted" }
        : { plan: "score.js:plan", renderScore: "score.js:renderScore", pump: "score.js:pump (pad and bass buses only)", styleReverb: "dsp.js:reverb using p.S.reverb", dropSweep: "sound.js:buildSweep source fragment migrated with local DSP binding; numerical operation order retained", sectionEnergy: "sound.js:rideEnergy source fragment migrated with local DSP binding; numerical operation order retained", hitAutomation: "sound.js:automate and DUCK_HITS source fragments migrated with local DSP binding after manual automation conflict suppression; numerical operation order retained", styleMaster: "score.js:master", lowBalance: "sound.js:balanceLows source fragment migrated with local DSP binding; numerical operation order retained", fade: "sound.js:music branch 30 ms head fade / source outro fade migrated in source order", sourceVoiceDuck: "omitted; audio.mjs voiceWindows is the sole voice duck", fullMixdown: "omitted" },
      automationEventIds: presetResult.automationEventIds,
      automationResolution: presetResult.automationResolution,
      outputWav: presetResult.outputWav,
      ...(selectedSource ? { selectedSource: { trackId: selectedSource.track.id, assetId: selectedSource.asset.id, assetSha256: selectedSource.assetSha256, sourceInSec: selectedSource.clock.sourceInSec, sourceOutSec: selectedSource.clock.sourceOutSec, outputSourceInSec: 0, outputSourceOutSec: presetResult.outputWav.durationSec, trackStartSec: selectedSource.track.startSec, trackSpeed: selectedSource.track.speed ?? 1, timeMapId: selectedSource.track.timeMapId || null, timeMap: selectedSource.clock.mapping, effectiveSpeed: selectedSource.clock.combinedSpeed, filmStartSec: selectedSource.clock.filmStartSec, selectedTrackReplacedInPlace: true, decodedFrames: selectedSource.decodedFrames, frameAdjustment: selectedSource.frameAdjustment } } : { generatedNewTrack: true }),
      ...(presetSamplePack ? { samplePack: presetSamplePack } : {}),
    } : null,
    keyContext: validatedRequest.keyContext,
    sfxKeyContext,
    sourceAndPostGain: { music: hasMusic ? { sourceProcessingBaked: true, postMixGainDb: validatedRequest.musicMixGainDb, existingTrackGainDbPreserved: selectedSource ? selectedSource.track.gainDb ?? 0 : null } : null, sfx: "Upstream Track sourceGain and mono sourcePan are baked once; generated audio-plan event gainDb is only the explicit post-mix value and defaults to 0 dB." },
    outputs: { audioPlan: outputPlan, assets: wavRows.map((row) => ({ file: row.file, sha256: row.sha256, wav: wavFacts(row.wav) })) },
    preservedBasePlan: { lockedTracks: (basePlan.tracks || []).filter((track) => track.locked).map((track) => track.id), voiceWindows: basePlan.voiceWindows || [], ducking: basePlan.ducking || null },
    qualityBoundary: "Technical PCM generation, source-pinned closure, and event mapping only. No generated audio has been auditioned or approved; every new asset remains generated-unreviewed and final audio.mjs preview still requires --allow-generated-preview.",
  };
  await writeNewAtomic(manifestPath, Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
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
  if (!match) fail("Pinned samples-build.js no longer exposes the expected static SPECS block; refusing to guess supported --only IDs");
  const ids = [...match[1].matchAll(/^\s*\{\s*id:\s*'([^']+)'/gm)].map((row) => row[1]);
  if (!ids.length) fail("Pinned samples-build.js has no readable instrument IDs in SPECS");
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
  const pin = await pinnedAudioClosure({ additionalEntries: ["cli/lib/samples-build.js"] });
  const buildSource = await fs.readFile(path.join(vendorRoot, "cli/lib/samples-build.js"), "utf8");
  const supportedIds = sampleBuilderInstrumentIds(buildSource);
  const only = args.only == null ? null : [...new Set(args.only.split(",").map((value) => value.trim()).filter(Boolean))];
  if (only && !only.length) fail("--only must contain at least one source instrument ID");
  for (const id of only || []) if (!supportedIds.has(id)) fail("--only requested unsupported upstream instrument ID: " + id);

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
    const builder = await import(pathToFileURL(path.join(vendorRoot, "cli/lib/samples-build.js")).href);
    if (typeof builder.buildSamples !== "function") fail("Pinned samples-build.js is missing buildSamples({out, only, log})");
    log = [];
    result = await builder.buildSamples({ out: outputReal, only, log: (line) => log.push(line) });
  } finally {
    process.env.PATH = priorPath;
    if (priorStrictFfmpeg == null) delete process.env.LAOHU_FFMPEG;
    else process.env.LAOHU_FFMPEG = priorStrictFfmpeg;
  }
  for (const line of log) process.stdout.write(line + "\n");
  process.stdout.write(result + "\nSOURCE_COMMIT " + pin.source.commit + "\nSAMPLE_BUILDER_PINNED true\n");
  const manifestPath = path.join(outputReal, "manifest.json");
  const manifest = await readJson(manifestPath, "built sample manifest");
  const idsToValidate = only || Object.keys(manifest.instruments || {});
  if (!idsToValidate.length) fail("Upstream sample build produced no instrument IDs; no sample pack was validated");
  const ffprobe = process.env.MOTION_FFPROBE || (path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe") : "ffprobe");
  const verified = await inspectRecordedPack({ packDir: outputReal, projectRoot, requiredInstrumentIds: idsToValidate, ffmpeg, ffprobe });
  const failures = /\b(\d+) failed\b/i.exec(result);
  if (failures && Number(failures[1]) > 0) {
    const affected = idsToValidate.join(", ");
    fail(`Upstream sample build reported ${failures[1]} failure(s) while processing requested instrument ID(s): ${affected}. Existing files were validated, but this invocation is incomplete and must not be treated as a successful fresh build.`);
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
  const [request, basePlan, film, requestReal, planReal, filmManifestReal] = await Promise.all([
    readJson(requestPath, "request"), readJson(planPath, "base audio plan"), verifyFilmManifest(filmManifestPath),
    fs.realpath(requestPath), fs.realpath(planPath), fs.realpath(filmManifestPath),
  ]);
  await assertOutputPath(outputPlan, projectRoot, "--output-plan");
  await assertOutputPath(manifestPath, projectRoot, "--manifest");
  for (const input of [requestReal, planReal, filmManifestReal, ...film.verifiedFiles.map((item) => item.path)]) if (path.resolve(input) === outputPlan || path.resolve(input) === manifestPath) fail("Output path collides with an input file");
  const result = await generatePlan({ request, basePlan, basePlanPath: planPath, film, inputFiles: [requestReal, planReal, filmManifestReal], assetsDir, projectRoot, outputPlan, manifestPath });
  process.stdout.write("AUDIO_PLAN " + outputPlan + "\nMANIFEST " + manifestPath + "\nGENERATED_ASSETS " + result.manifest.outputs.assets.length + "\nSTATUS generated-unreviewed\n");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => { process.stderr.write((error.stack || error.message) + "\n" + usage() + "\n"); process.exitCode = 1; });
}

export { buildComposerHitRows, buildSourcePresetPlan, floatWav, generatePlan, mapEventsToSelectedSource, renderOneSfx, renderPresetStem, resolveDerivedDuckHits, resolveSourceEvents, runCli, validateFilmMaps, verifyFilmManifest, wavFacts };
