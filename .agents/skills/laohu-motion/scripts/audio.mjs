#!/usr/bin/env node
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import MotionOps from "./motion-ops.js";
import { compilePlan as compileAsrcutPlan, hashPlan as hashAsrcutPlan, validatePlan as validateAsrcutPlan, verifyPlanEvidence } from "../../laohu-asrcut/scripts/asrcut.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultIndex = path.join(skillDir, "assets", "audio", "index.json");
const { findSceneAudioEvents, mapLocalTimeToFilm, mapSceneEvents } = MotionOps;
const SOURCE_PREMIX_FORMATS = new Set(["laohu.motion.source-premix-processing/1", "laohu.motion.source-premix-processing/2"]);
const REQUEST_GENERATED_SOURCE_GROUP_FORMAT = "laohu.motion.request-generated-source-group/1";
const MUSIC_USE_CASES = new Set([
  "narration-bed-light-advance",
  "lively-explanation",
  "rhythm-demonstration-collage",
  "tense-reveal",
  "no-voice-chapter-showcase",
  "closing-resolution",
]);

function fail(message) { throw new Error(message); }
function number(value, label, limits) {
  const options = limits || {};
  if (options.optional && value == null) return undefined;
  const min = options.min == null ? -Infinity : options.min;
  const max = options.max == null ? Infinity : options.max;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(label + " must be a finite number in [" + min + ", " + max + "]");
  }
  return value;
}
function id(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(label + " must be a non-empty stable ID");
  return value;
}
function sha256Field(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) fail(label + " must be a 64-character SHA-256 hex digest");
  return value.toLowerCase();
}
function secondsToSamples(seconds, sampleRate) {
  return Math.round(number(seconds, "seconds") * (sampleRate || 48000));
}
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
async function hashFileStreaming(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
async function realPathForComparison(value) {
  let cursor = path.resolve(value);
  const suffix = [];
  while (true) {
    try {
      const resolved = await fs.realpath(cursor);
      return path.join(resolved, ...suffix);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) return path.resolve(value);
      suffix.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}
function containsPath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}
async function sameExistingFile(left, right) {
  try {
    const [leftStat, rightStat] = await Promise.all([fs.stat(left), fs.stat(right)]);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}
async function preflightPaths({ inputs, outputs, cacheDir, overwrite }) {
  const canonicalInputs = await Promise.all(inputs.map(async (file) => ({ original: file, real: await realPathForComparison(file) })));
  const canonicalOutputs = await Promise.all(outputs.map(async (file) => ({ original: file, real: await realPathForComparison(file) })));
  for (let index = 0; index < canonicalOutputs.length; index += 1) {
    const output = canonicalOutputs[index];
    for (const input of canonicalInputs) {
      if (output.real === input.real || await sameExistingFile(output.original, input.original)) {
        fail("Output path collides with an input; no files were written: " + output.original + " ↔ " + input.original);
      }
    }
    for (let otherIndex = 0; otherIndex < index; otherIndex += 1) {
      const other = canonicalOutputs[otherIndex];
      if (output.real === other.real || await sameExistingFile(output.original, other.original)) {
        fail("Output paths collide; no files were written: " + output.original + " ↔ " + other.original);
      }
    }
    let stat;
    try { stat = await fs.lstat(output.original); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (stat) {
      if (stat.isSymbolicLink()) fail("Output path is a symlink; choose its resolved destination explicitly: " + output.original);
      if (!stat.isFile()) fail("Output path is not a regular file: " + output.original);
      if (!overwrite) fail("Output exists; choose a new path or pass --overwrite: " + output.original);
    }
  }
  const canonicalCache = await realPathForComparison(cacheDir);
  for (const item of [...canonicalInputs, ...canonicalOutputs]) {
    if (containsPath(canonicalCache, item.real)) {
      fail("Cache directory would contain or replace an input/output path: " + cacheDir + " ↔ " + item.original);
    }
  }
}
async function commitFile(tempPath, targetPath, overwrite) {
  if (overwrite) {
    await fs.rename(tempPath, targetPath);
    return;
  }
  await fs.link(tempPath, targetPath);
  await fs.rm(tempPath, { force: true });
}
async function writeJsonAtomically(targetPath, value, overwrite) {
  const tempPath = path.join(path.dirname(targetPath), "." + path.basename(targetPath) + "." + process.pid + "." + Date.now() + ".part");
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  try {
    await commitFile(tempPath, targetPath, overwrite);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

function wavClock(buffer, totalBytes = buffer.length) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    fail("ASR-cut audio must be a RIFF/WAVE file");
  }
  let format = null;
  let channels = null;
  let sampleRate = null;
  let blockAlign = null;
  let bitsPerSample = null;
  let dataLength = null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const tag = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (tag === "fmt ") {
      if (size < 16 || start + size > buffer.length) fail("ASR-cut WAV fmt chunk is truncated or exceeds the inspected header");
      format = buffer.readUInt16LE(start);
      channels = buffer.readUInt16LE(start + 2);
      sampleRate = buffer.readUInt32LE(start + 4);
      blockAlign = buffer.readUInt16LE(start + 12);
      bitsPerSample = buffer.readUInt16LE(start + 14);
      if (format === 0xfffe && size >= 40) format = buffer.readUInt16LE(start + 24);
    } else if (tag === "data") {
      if (start + size > totalBytes) fail("ASR-cut WAV data chunk exceeds the file length");
      dataLength = size;
      break;
    } else if (start + size > buffer.length) {
      fail("ASR-cut WAV has an unsupported large chunk before its data header");
    }
    offset = start + size + (size & 1);
  }
  if (![1, 3].includes(format) || !Number.isInteger(channels) || channels < 1 || !Number.isInteger(sampleRate) || sampleRate < 1
      || !Number.isInteger(blockAlign) || !Number.isInteger(bitsPerSample) || bitsPerSample < 8 || blockAlign !== channels * Math.ceil(bitsPerSample / 8)
      || !Number.isSafeInteger(dataLength) || dataLength % blockAlign !== 0) {
    fail("ASR-cut WAV must use integer or float PCM with a complete sample-frame data chunk");
  }
  return { format, channels, sampleRate, sampleCount: dataLength / blockAlign };
}

async function inspectWavArtifact(file) {
  const handle = await fs.open(file, "r");
  let header;
  let totalBytes;
  try {
    const stat = await handle.stat();
    totalBytes = stat.size;
    header = Buffer.alloc(Math.min(totalBytes, 4 * 1024 * 1024));
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  return { ...wavClock(header, totalBytes), sha256: await hashFileStreaming(file) };
}

async function verifyAsrcutSourceEvidence(editPlan, editPlanPath) {
  const baseDir = path.dirname(editPlanPath);
  const sourceChecks = [];
  for (const source of editPlan.sources) {
    if (!source.mediaPath || !source.sha256) fail("ASR-cut export source lacks a media path or SHA-256: " + source.id);
    const mediaPath = path.isAbsolute(source.mediaPath) ? source.mediaPath : path.resolve(baseDir, source.mediaPath);
    const actualMediaHash = await hashFileStreaming(mediaPath);
    if (actualMediaHash !== String(source.sha256).toLowerCase()) fail("ASR-cut source media changed after import: " + source.id);
    sourceChecks.push({ sourceId: source.id, mediaSha256: actualMediaHash });
  }
  const transcriptEvidence = await verifyPlanEvidence(editPlan, { baseDir });
  const verifiedBySource = new Map(transcriptEvidence.verified.map((item) => [item.sourceId, item.sha256]));
  const unlocatedBySource = new Map(transcriptEvidence.unlocated.map((item) => [item.sourceId, { sha256: item.sha256, reason: item.reason }]));
  return sourceChecks.map((item) => ({
    ...item,
    transcript: verifiedBySource.has(item.sourceId)
      ? { status: "verified", sha256: verifiedBySource.get(item.sourceId) }
      : { status: "unlocated", ...unlocatedBySource.get(item.sourceId) },
  }));
}

function sourceWindowRows(timeline) {
  const rate = timeline.clock.sampleRateHz;
  return sourceTimelineUnits(timeline).map((unit) => ({
    id: "asrcut-window-" + unit.occurrenceId,
    startSec: unit.targetRange.startSample / rate,
    endSec: unit.targetRange.endSample / rate,
    startSample: unit.targetRange.startSample,
    endSample: unit.targetRange.endSample,
    sampleRateHz: rate,
    basis: "conservative-retained-source-unit",
    timingPrecision: unit.timingPrecision,
    occurrenceId: unit.occurrenceId,
    sourceId: unit.sourceId,
    sourceRange: unit.sourceRange,
  }));
}

function sourceTimelineUnits(timeline) {
  if (timeline?.format === "laohu.asrcut.timeline/1") return (timeline.clips || []).map((clip) => ({ kind: "source", ...clip }));
  if (timeline?.format === "laohu.asrcut.timeline/2") return (timeline.units || []).filter((unit) => unit.kind === "source");
  return [];
}

function presentationTimelineUnits(timeline) {
  return timeline?.format === "laohu.asrcut.timeline/2"
    ? (timeline.units || []).filter((unit) => unit.kind === "presentation")
    : [];
}

function receiptUnitRows(timeline) {
  return timeline.units.map((unit) => unit.kind === "presentation"
    ? { kind: "presentation", id: unit.id, decisionId: unit.decisionId, reason: unit.reason, sceneId: unit.sceneId, durationSamples: unit.durationSamples, targetRange: unit.targetRange, visualHandoff: unit.visualHandoff, audioHandoff: unit.audioHandoff }
    : { kind: "source", occurrenceId: unit.occurrenceId, sourceId: unit.sourceId, coverageId: unit.coverageId, sourceRange: unit.sourceRange, targetRange: unit.targetRange, timingPrecision: unit.timingPrecision });
}

function assertAsrcutBundle({ editPlan, timeline, receipt, voiceWavMetadata }) {
  const errors = validateAsrcutPlan(editPlan).errors;
  if (errors.length) fail("ASR-cut edit plan is invalid: " + errors.join("; "));
  const version = editPlan.format === "laohu.asrcut.edit-plan/1" ? 1
    : editPlan.format === "laohu.asrcut.edit-plan/2" ? 2 : null;
  if (!version || editPlan.state !== "frozen") fail("ASR-cut audio binding requires a frozen edit-plan/1 or edit-plan/2");
  if (editPlan.authorization?.mediaExport !== true) fail("ASR-cut audio binding requires explicit mediaExport authorization");
  const compiled = compileAsrcutPlan(editPlan);
  const expectedTimelineFormat = version === 1 ? "laohu.asrcut.timeline/1" : "laohu.asrcut.timeline/2";
  const expectedReceiptFormat = version === 1 ? "laohu.asrcut.audio-artifact/1" : "laohu.asrcut.audio-artifact/2";
  if (compiled.format !== expectedTimelineFormat || compiled.state !== "frozen") fail("ASR-cut compiler output does not match the frozen edit-plan version");
  if (timeline.format !== expectedTimelineFormat || timeline.state !== "frozen") fail("ASR-cut plan and timeline versions must match; version 1 stays source-only and version 2 retains its presentation contract");
  if (canonical(timeline) !== canonical(compiled)) fail("ASR-cut timeline is stale or not the canonical compiler output");
  const planSha256 = hashAsrcutPlan(editPlan);
  if (timeline.planSha256 !== planSha256 || editPlan.integrity?.planSha256 !== planSha256) fail("ASR-cut plan hash is stale");
  if (compiled.clock.sampleRateHz !== 48000) fail("Motion audio requires ASR-cut project clock at 48000 Hz");
  const expectedWav = voiceWavMetadata;
  if (!expectedWav || !/^[a-f0-9]{64}$/i.test(expectedWav.sha256 || "")) fail("ASR-cut WAV metadata or file hash is missing");
  if (expectedWav.sampleRate !== compiled.clock.sampleRateHz || expectedWav.sampleCount !== compiled.durationSamples) {
    fail("ASR-cut WAV sample clock does not match the final timeline");
  }
  if (receipt.format !== expectedReceiptFormat || receipt.timelineFormat !== compiled.format
      || receipt.planSha256 !== planSha256 || receipt.project?.id !== editPlan.project.id
      || receipt.project?.revision !== editPlan.project.revision || receipt.sampleRateHz !== compiled.clock.sampleRateHz
      || receipt.sampleCount !== compiled.durationSamples || receipt.channels !== expectedWav.channels
      || receipt.outputSha256 !== expectedWav.sha256) {
    fail("ASR-cut audio receipt does not identify this frozen plan, timeline, and WAV");
  }
  if (canonical(receipt.clips) !== canonical(compiled.clips.map((clip) => ({ occurrenceId: clip.occurrenceId, sourceId: clip.sourceId, coverageId: clip.coverageId, sourceRange: clip.sourceRange, targetRange: clip.targetRange })))) {
    fail("ASR-cut audio receipt source clips differ from the final timeline");
  }
  if (version === 2) {
    if (canonical(receipt.units) !== canonical(receiptUnitRows(compiled))) fail("ASR-cut audio receipt unit map differs from the final timeline");
  } else if (timeline.units != null || receipt.units != null || receipt.voiceWindows != null || receipt.voiceTrackPlayback != null) {
    fail("ASR-cut edit-plan/1 and artifact/1 must remain source-only and cannot claim presentation-unit receipt fields");
  }
  const expectedVoiceWindows = sourceTimelineUnits(compiled).map((unit) => ({
    startSample: unit.targetRange.startSample,
    endSample: unit.targetRange.endSample,
    sampleRateHz: compiled.clock.sampleRateHz,
    basis: "conservative-retained-source-range",
    timingPrecision: unit.timingPrecision,
  }));
  if (version === 2) {
    if (canonical(receipt.voiceWindows) !== canonical(expectedVoiceWindows)) fail("ASR-cut receipt voice windows must be the conservative source-unit ranges");
    if (receipt.voiceTrackPlayback !== "Play this single exported WAV once from project sample 0. Voice windows are conservative source-unit bounds, may include original source pauses, and must not be used to replay individual clips or infer mic-zero as final-mix silence.") {
      fail("ASR-cut receipt does not carry the single-track playback and silence-provenance warning");
    }
  }
  return { compiled, expectedWav, planSha256, version, voiceWindows: sourceWindowRows(compiled) };
}

function newAudioPlanForAsrcut(basePlan, durationSec) {
  const plan = basePlan ? structuredClone(basePlan) : {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec,
    sampleRate: 48000, channels: 2, events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [],
  };
  if (plan.durationSec !== durationSec) fail("Base audio-plan duration is locked and must exactly match the ASR-cut timeline; no duration was changed");
  if (plan.sampleRate !== 48000 || plan.channels !== 2) fail("Base audio plan must use the existing 48000 Hz stereo output contract");
  if (plan.asrcutBinding) fail("Base audio plan already has an ASR-cut binding; prepare from its source plan instead of stacking bindings");
  if ((plan.tracks || []).some((track) => track.bus === "voice") || (plan.voiceWindows || []).length) {
    fail("Base audio plan already contains voice playback or voice windows; refusing duplicate or stale ASR-cut audio");
  }
  validatePlan(plan);
  for (const key of ["events", "tracks", "voiceWindows", "automation", "timeMaps", "assets", "generatedAssets"]) plan[key] ||= [];
  return plan;
}

export async function buildAsrcutVoicePlan({ basePlan = null, editPlan, timeline, receipt, voiceFile, outputPlanPath, editPlanPath, timelinePath, receiptPath, voiceAssetId, voiceTrackId }) {
  for (const [value, label] of [[voiceFile, "voiceFile"], [outputPlanPath, "outputPlanPath"], [editPlanPath, "editPlanPath"], [timelinePath, "timelinePath"], [receiptPath, "receiptPath"]]) {
    if (typeof value !== "string" || !path.isAbsolute(value)) fail(label + " must be an absolute path");
  }
  id(voiceAssetId, "voiceAssetId");
  id(voiceTrackId, "voiceTrackId");
  const voiceWavMetadata = await inspectWavArtifact(path.resolve(voiceFile));
  const sourceEvidence = await verifyAsrcutSourceEvidence(editPlan, editPlanPath);
  const bundle = assertAsrcutBundle({ editPlan, timeline, receipt, voiceWavMetadata });
  const durationSec = bundle.compiled.durationSamples / bundle.compiled.clock.sampleRateHz;
  const plan = newAudioPlanForAsrcut(basePlan, durationSec);
  if ((plan.assets || []).some((asset) => asset.id === voiceAssetId) || (plan.tracks || []).some((track) => track.id === voiceTrackId)) fail("ASR-cut asset or track ID already exists in the base audio plan");
  const planDir = path.dirname(outputPlanPath);
  const voiceAssetFile = path.relative(planDir, path.resolve(voiceFile)) || path.basename(voiceFile);
  const reference = (file) => path.relative(planDir, path.resolve(file)) || path.basename(file);
  if (receipt.output !== path.basename(voiceFile)) fail("ASR-cut receipt output filename does not match the supplied voice WAV");
  const voiceWindows = bundle.voiceWindows.map((window) => ({
    id: window.id, startSec: window.startSec, endSec: window.endSec,
    basis: window.basis, timingPrecision: window.timingPrecision,
    sourceOccurrenceId: window.occurrenceId, sourceId: window.sourceId,
    sourceRange: window.sourceRange,
  }));
  plan.assets.push({
    id: voiceAssetId,
    file: voiceAssetFile,
    durationSec,
    sha256: voiceWavMetadata.sha256,
    license: "User-provided source recording; synchronized output derived by the authorized ASR-cut workflow",
    redistribution: {
      status: "not-authorized-for-redistribution",
      syncUse: "allowed",
      basis: "This recording was provided for the requested edit and may be synchronized within that work; do not redistribute the source or derived voice WAV as a standalone asset.",
    },
    reviewStatus: "candidate-unreviewed",
    source: { kind: "laohu-asrcut-export", projectId: bundle.compiled.project.id, revision: bundle.compiled.project.revision, planSha256: bundle.planSha256, receipt: reference(receiptPath) },
  });
  plan.tracks.push({ id: voiceTrackId, assetId: voiceAssetId, bus: "voice", startSec: 0, locked: true });
  plan.voiceWindows = voiceWindows;
  const sourceUnitsByOccurrence = new Map(sourceTimelineUnits(bundle.compiled).map((unit) => [unit.occurrenceId, unit]));
  plan.asrcutBinding = {
    format: "laohu.motion.asrcut-audio-binding/1",
    project: { id: bundle.compiled.project.id, revision: bundle.compiled.project.revision, planSha256: bundle.planSha256 },
    timeline: { format: bundle.compiled.format, durationSamples: bundle.compiled.durationSamples, sampleRateHz: bundle.compiled.clock.sampleRateHz, canonicalSha256: sha256(Buffer.from(canonical(bundle.compiled))) },
    evidence: { editPlan: reference(editPlanPath), timeline: reference(timelinePath), receipt: reference(receiptPath) },
    voice: { assetId: voiceAssetId, trackId: voiceTrackId, fileSha256: voiceWavMetadata.sha256, playback: "single-full-file-track-at-film-sample-zero" },
    sourceEvidence,
    voiceWindows: voiceWindows.map((window) => {
      const unit = sourceUnitsByOccurrence.get(window.sourceOccurrenceId);
      if (!unit) fail("ASR-cut voice window has no exact source timeline unit: " + window.sourceOccurrenceId);
      return { id: window.id, startSample: unit.targetRange.startSample, endSample: unit.targetRange.endSample, timingPrecision: unit.timingPrecision };
    }),
    presentationWindows: presentationTimelineUnits(bundle.compiled).map((unit) => ({ id: unit.id, startSample: unit.targetRange.startSample, endSample: unit.targetRange.endSample, sceneId: unit.sceneId, audioHandoff: unit.audioHandoff })),
    policy: "One exported WAV is played once from sample zero. Source-unit windows are conservative and may include source pauses; presentation windows are handoff instructions, not microphone-silence measurements. No clip is replayed and no final-mix silence is inferred.",
  };
  validatePlan(plan);
  return plan;
}

async function verifyAsrcutBinding(plan, audioPlanPath) {
  const binding = plan.asrcutBinding;
  if (!binding) return null;
  if (binding.format !== "laohu.motion.asrcut-audio-binding/1") fail("audio plan has an unsupported ASR-cut binding format");
  const voiceTracks = (plan.tracks || []).filter((track) => track.bus === "voice");
  if (voiceTracks.length !== 1 || voiceTracks[0].id !== binding.voice?.trackId || voiceTracks[0].assetId !== binding.voice?.assetId
      || !voiceTracks[0].locked || voiceTracks[0].startSec !== 0 || voiceTracks[0].speed != null && voiceTracks[0].speed !== 1
      || voiceTracks[0].sourceInSec != null || voiceTracks[0].sourceOutSec != null || voiceTracks[0].gainDb != null && voiceTracks[0].gainDb !== 0) {
    fail("ASR-cut binding requires exactly one locked, untrimmed, unity-gain voice track at film sample zero");
  }
  const resolveEvidence = (file) => {
    if (typeof file !== "string" || !file || path.isAbsolute(file)) fail("ASR-cut evidence references must be relative to the audio plan");
    return path.resolve(path.dirname(audioPlanPath), file);
  };
  const editPlanPath = resolveEvidence(binding.evidence?.editPlan);
  const timelinePath = resolveEvidence(binding.evidence?.timeline);
  const receiptPath = resolveEvidence(binding.evidence?.receipt);
  const asset = (plan.assets || []).find((item) => item.id === binding.voice.assetId);
  if (!asset || typeof asset.file !== "string" || !asset.file) fail("ASR-cut voice asset record is missing");
  const voiceFile = path.resolve(path.dirname(audioPlanPath), asset.file);
  const [editPlan, timeline, receipt, voiceWavMetadata] = await Promise.all([
    fs.readFile(editPlanPath, "utf8").then(JSON.parse), fs.readFile(timelinePath, "utf8").then(JSON.parse),
    fs.readFile(receiptPath, "utf8").then(JSON.parse), inspectWavArtifact(voiceFile),
  ]);
  const sourceEvidence = await verifyAsrcutSourceEvidence(editPlan, editPlanPath);
  const bundle = assertAsrcutBundle({ editPlan, timeline, receipt, voiceWavMetadata });
  if (binding.project?.id !== bundle.compiled.project.id || binding.project?.revision !== bundle.compiled.project.revision
      || binding.project?.planSha256 !== bundle.planSha256 || binding.timeline?.format !== bundle.compiled.format
      || binding.timeline?.durationSamples !== bundle.compiled.durationSamples || binding.timeline?.sampleRateHz !== bundle.compiled.clock.sampleRateHz
      || binding.timeline?.canonicalSha256 !== sha256(Buffer.from(canonical(bundle.compiled)))
      || binding.voice?.fileSha256 !== voiceWavMetadata.sha256) fail("ASR-cut audio binding is stale; regenerate it from the current frozen timeline and receipt");
  if (plan.durationSec !== bundle.compiled.durationSamples / bundle.compiled.clock.sampleRateHz) fail("Audio-plan duration no longer matches its frozen ASR-cut total duration");
  const expectedWindows = bundle.voiceWindows.map((window) => ({
    id: window.id, startSec: window.startSec, endSec: window.endSec, basis: window.basis,
    timingPrecision: window.timingPrecision, sourceOccurrenceId: window.occurrenceId, sourceId: window.sourceId, sourceRange: window.sourceRange,
  }));
  if (canonical(plan.voiceWindows || []) !== canonical(expectedWindows)) fail("ASR-cut voice windows were edited or are stale; regenerate the audio plan from the final timeline");
  const expectedBindingWindows = sourceTimelineUnits(bundle.compiled).map((unit) => ({ id: "asrcut-window-" + unit.occurrenceId, startSample: unit.targetRange.startSample, endSample: unit.targetRange.endSample, timingPrecision: unit.timingPrecision }));
  if (canonical(binding.voiceWindows) !== canonical(expectedBindingWindows)) fail("ASR-cut source window map is stale");
  const expectedPresentations = presentationTimelineUnits(bundle.compiled).map((unit) => ({ id: unit.id, startSample: unit.targetRange.startSample, endSample: unit.targetRange.endSample, sceneId: unit.sceneId, audioHandoff: unit.audioHandoff }));
  if (canonical(binding.presentationWindows) !== canonical(expectedPresentations)) fail("ASR-cut presentation handoffs were edited or are stale");
  if (canonical(binding.sourceEvidence) !== canonical(sourceEvidence)) fail("ASR-cut source media or transcript evidence changed; regenerate the audio plan from verified inputs");
  return { binding, evidencePaths: [editPlanPath, timelinePath, receiptPath] };
}

async function preflightJsonPlanOutput(targetPath, inputs, overwrite) {
  const [targetReal, ...inputRows] = await Promise.all([
    realPathForComparison(targetPath),
    ...inputs.map(async (file) => ({ file, real: await realPathForComparison(file) })),
  ]);
  for (const input of inputRows) {
    if (targetReal === input.real || await sameExistingFile(targetPath, input.file)) fail("Audio-plan output collides with an input; no files were written: " + targetPath + " ↔ " + input.file);
  }
  const parent = await fs.stat(path.dirname(targetPath)).catch(() => null);
  if (!parent?.isDirectory()) fail("Audio-plan output directory must already exist: " + path.dirname(targetPath));
  const existing = await fs.lstat(targetPath).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
  if (existing?.isSymbolicLink()) fail("Audio-plan output is a symlink; choose its resolved destination explicitly: " + targetPath);
  if (existing && !existing.isFile()) fail("Audio-plan output is not a regular file: " + targetPath);
  if (existing && !overwrite) fail("Audio-plan output exists; pass --overwrite to replace it: " + targetPath);
}

export async function prepareAsrcutVoicePlan(args) {
  const required = ["editPlan", "timeline", "receipt", "voiceWav", "output", "voiceAssetId", "voiceTrackId"];
  for (const key of required) if (!args[key]) fail("prepare-asrcut-plan requires " + key);
  for (const key of ["editPlan", "timeline", "receipt", "voiceWav", "output", "basePlan"]) {
    if (args[key] && !path.isAbsolute(args[key])) fail("--" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()) + " must be an absolute path");
  }
  const editPlanPath = path.resolve(args.editPlan);
  const timelinePath = path.resolve(args.timeline);
  const receiptPath = path.resolve(args.receipt);
  const voiceFile = path.resolve(args.voiceWav);
  const outputPath = path.resolve(args.output);
  const [editPlan, timeline, receipt, basePlan, outputParent] = await Promise.all([
    fs.readFile(editPlanPath, "utf8").then(JSON.parse), fs.readFile(timelinePath, "utf8").then(JSON.parse),
    fs.readFile(receiptPath, "utf8").then(JSON.parse),
    args.basePlan ? fs.readFile(path.resolve(args.basePlan), "utf8").then(JSON.parse) : Promise.resolve(null),
    fs.stat(path.dirname(outputPath)),
  ]);
  if (!outputParent.isDirectory()) fail("Audio-plan output directory must already exist");
  const plan = await buildAsrcutVoicePlan({
    basePlan, editPlan, timeline, receipt, voiceFile, outputPlanPath: outputPath,
    editPlanPath, timelinePath, receiptPath, voiceAssetId: args.voiceAssetId, voiceTrackId: args.voiceTrackId,
  });
  await preflightJsonPlanOutput(outputPath, [editPlanPath, timelinePath, receiptPath, voiceFile, ...(args.basePlan ? [path.resolve(args.basePlan)] : [])], args.overwrite);
  await writeJsonAtomically(outputPath, plan, Boolean(args.overwrite));
  return { output: outputPath, plan };
}
function rationalStreamDuration(stream) {
  const ticks = typeof stream.duration_ts === "string" || typeof stream.duration_ts === "number"
    ? String(stream.duration_ts).match(/^(-?\d+)$/) : null;
  const timeBase = typeof stream.time_base === "string" ? stream.time_base.match(/^(\d+)\/(\d+)$/) : null;
  if (ticks && timeBase) {
    const tickCount = BigInt(ticks[1]);
    const numerator = BigInt(timeBase[1]);
    const denominator = BigInt(timeBase[2]);
    if (tickCount >= 0n && numerator > 0n && denominator > 0n) {
      const durationSec = Number(tickCount * numerator) / Number(denominator);
      if (Number.isFinite(durationSec)) return { durationSec, basis: "stream.duration_ts × stream.time_base", durationTs: ticks[1], timeBase: timeBase[1] + "/" + timeBase[2] };
    }
  }
  return null;
}
function mediaStreamDurationEvidence(stream) {
  const rational = rationalStreamDuration(stream);
  if (rational) return rational;
  const direct = Number(stream.duration);
  if (Number.isFinite(direct) && direct >= 0) return { durationSec: direct, basis: "stream.duration", durationTs: null, timeBase: stream.time_base || null };
  const frameCount = Number(stream.nb_frames);
  const rate = String(stream.avg_frame_rate || stream.r_frame_rate || "").match(/^(\d+)\/(\d+)$/);
  if (Number.isFinite(frameCount) && frameCount >= 0 && rate && Number(rate[1]) > 0 && Number(rate[2]) > 0) {
    return { durationSec: frameCount * Number(rate[2]) / Number(rate[1]), basis: "compatibility fallback: nb_frames ÷ avg_frame_rate", durationTs: null, timeBase: stream.time_base || null };
  }
  return null;
}
function probeMedia(file, ffprobe, env, label) {
  const result = run(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,duration,duration_ts,time_base,nb_frames,avg_frame_rate,r_frame_rate:format=duration", "-of", "json", file], label, env);
  let data;
  try { data = JSON.parse(result.stdout); } catch { fail(label + " returned invalid JSON"); }
  return { ...data, streams: Array.isArray(data.streams) ? data.streams : [] };
}
function getFfprobePath(ffmpeg) {
  if (!path.isAbsolute(ffmpeg)) return "ffprobe";
  return path.join(path.dirname(ffmpeg), "ffprobe");
}
function siblingTempPath(targetPath) {
  const extension = path.extname(targetPath);
  const stem = path.basename(targetPath, extension);
  return path.join(path.dirname(targetPath), "." + stem + "." + process.pid + "." + Date.now() + ".part" + extension);
}
function parseArgs(argv) {
  const values = new Set(["--plan", "--scene", "--asset-index", "--output", "--manifest", "--cache-dir", "--ffmpeg", "--video", "--final-output"]);
  const flags = new Set(["--allow-candidate", "--allow-generated-preview", "--legacy-replay", "--overwrite"]);
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (flags.has(key)) args[key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
    else if (values.has(key)) {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) fail("Missing value for " + key);
      args[key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++index];
    } else fail("Unknown argument " + key);
  }
  for (const key of ["plan", "output", "manifest", "cacheDir"]) {
    if (!args[key]) fail("Required argument --" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()));
  }
  if (Boolean(args.video) !== Boolean(args.finalOutput)) fail("--video and --final-output must be supplied together");
  for (const key of ["plan", "scene", "assetIndex", "output", "manifest", "cacheDir", "video", "finalOutput"]) {
    if (args[key] && !path.isAbsolute(args[key])) fail("--" + key + " must be an absolute path");
  }
  args.plan = path.resolve(args.plan);
  args.scene = args.scene && path.resolve(args.scene);
  args.assetIndex = path.resolve(args.assetIndex || defaultIndex);
  args.output = path.resolve(args.output);
  args.manifest = path.resolve(args.manifest);
  args.cacheDir = path.resolve(args.cacheDir);
  args.video = args.video && path.resolve(args.video);
  args.finalOutput = args.finalOutput && path.resolve(args.finalOutput);
  args.ffmpeg = args.ffmpeg || process.env.MOTION_FFMPEG || "ffmpeg";
  return args;
}

function run(command, argv, label, env) {
  const result = spawnSync(command, argv, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: env || process.env });
  if (result.error) fail(label + " could not start: " + result.error.message);
  if (result.status !== 0) fail(label + " failed (exit " + result.status + ")\n" + (result.stdout || "") + "\n" + (result.stderr || ""));
  return result;
}

function indexAssets(index) {
  if (index.schemaVersion !== 1 || !Array.isArray(index.assets)) fail("Audio index must use schemaVersion 1 with an assets array");
  const result = new Map();
  for (const asset of index.assets) {
    const assetId = id(asset.id, "asset index id");
    if (result.has(assetId)) fail("Duplicate asset ID in audio index: " + assetId);
    result.set(assetId, asset);
  }
  return result;
}

function uniqueIds(items, label) {
  const found = new Set();
  for (const item of items || []) {
    const value = id(item.id, label + " id");
    if (found.has(value)) fail("Duplicate " + label + " ID: " + value);
    found.add(value);
  }
}
function validateEnvelope(envelope, label) {
  if (envelope == null) return;
  if (typeof envelope !== "object" || Array.isArray(envelope)) fail(label + " must be an object");
  const supported = new Set(["attackSec", "releaseSec"]);
  for (const key of Object.keys(envelope)) {
    if (!supported.has(key)) fail(label + "." + key + " is not implemented by audio-plan/1; fadeInSec/fadeOutSec belong to music automation entries");
  }
  number(envelope.attackSec == null ? 0 : envelope.attackSec, label + ".attackSec", { min: 0 });
  number(envelope.releaseSec == null ? 0 : envelope.releaseSec, label + ".releaseSec", { min: 0 });
}
function validateRights(asset, label) {
  if (typeof asset.license !== "string" || !asset.license.trim() || /^(unknown|none|tbd)$/i.test(asset.license)) fail(label + " has no usable license/authorization record");
  const rights = asset.redistribution;
  if (!rights || typeof rights.status !== "string" || !rights.status.trim()) fail(label + " has no redistribution/sync-use boundary recorded");
  const status = rights.status.toLowerCase();
  if (!["redistributable", "sync-only", "not-authorized-for-redistribution", "project-generated"].includes(status)) fail(label + " has an unsupported or unclear redistribution status: " + rights.status);
  if (typeof (rights.basis || rights.notes) !== "string" || !(rights.basis || rights.notes).trim()) fail(label + " must record the basis for its redistribution/sync-use boundary");
  const syncUse = rights.syncUse == null ? null : String(rights.syncUse).toLowerCase();
  if (syncUse != null && !["allowed", "prohibited", "unknown"].includes(syncUse)) fail(label + " redistribution.syncUse must be allowed, prohibited, or unknown");
  if (status === "sync-only" && syncUse === "prohibited") fail(label + " has conflicting sync-only and prohibited sync-use rights");
  if (status === "not-authorized-for-redistribution" && syncUse !== "allowed") fail(label + " may not redistribute the source; explicit redistribution.syncUse=allowed is required to embed it in a finished work");
  if (status === "redistributable" && syncUse === "prohibited") fail(label + " has conflicting redistributable and prohibited sync-use rights");
  if (syncUse === "prohibited" || syncUse === "unknown") fail(label + " does not have confirmed permission to synchronize this asset into the finished work");
  if (typeof asset.reviewStatus !== "string" || !asset.reviewStatus.trim()) fail(label + " has no reviewStatus");
}
function validateGeneratedAsset(asset) {
  id(asset.id, "generated asset id");
  if (asset.generator !== "ffmpeg-lavfi") fail("generated asset " + asset.id + " generator must be ffmpeg-lavfi");
  if (Object.prototype.hasOwnProperty.call(asset, "reviewStatus") && asset.reviewStatus !== "generated-unreviewed") {
    fail("generated asset " + asset.id + ".reviewStatus must be generated-unreviewed; register an actually reviewed WAV under plan.assets with its file, SHA-256, and review status");
  }
  const recipe = asset.recipe;
  if (!recipe || !["tone", "noise"].includes(recipe.kind)) fail("generated asset " + asset.id + " recipe kind must be tone or noise");
  number(recipe.durationSec, "generated asset " + asset.id + ".recipe.durationSec", { min: 0.005, max: 1800 });
  if (recipe.kind === "tone") {
    number(recipe.frequencyHz, "generated asset " + asset.id + ".recipe.frequencyHz", { min: 20, max: 20000 });
    if (recipe.endFrequencyHz != null) number(recipe.endFrequencyHz, "generated asset " + asset.id + ".recipe.endFrequencyHz", { min: 20, max: 20000 });
  } else if (!["white", "pink", "brown", "blue", "violet"].includes(recipe.color || "white")) {
    fail("generated asset " + asset.id + " noise color is unsupported");
  }
  if (recipe.gainDb != null) number(recipe.gainDb, "generated asset " + asset.id + ".recipe.gainDb", { min: -120, max: 12 });
  validateEnvelope(recipe.envelope, "generated asset " + asset.id + ".recipe.envelope");
}

function validateSourcePremixPlan(plan, maps) {
  const tracks = plan.tracks || [];
  const premixTracks = tracks.filter((track) => track.sourceProcessing != null);
  if (!premixTracks.length) return;
  if ((plan.automation || []).length || plan.ducking != null) {
    fail("audio-plan controls cannot be applied after original sound.mixdown; regenerate this native source with the source-mixdown route or use stems");
  }
  const voiceTracks = tracks.filter((track) => track.bus === "voice");
  if (voiceTracks.length > 1) fail("source-premix ownership supports at most one independently mixed locked voice track");
  const trackIds = new Set(premixTracks.map((track) => track.id));
  const voiceTrack = voiceTracks[0] || null;
  if (tracks.some((track) => !trackIds.has(track.id) && track !== voiceTrack)) {
    fail("source-premix ownership cannot be combined with another post-mix audio track");
  }
  const voiceWindowsSha256 = sha256(Buffer.from(canonical(plan.voiceWindows || []), "utf8"));
  const bakedIds = new Set();
  for (const track of premixTracks) {
    const marker = track.sourceProcessing;
    if (!marker || typeof marker !== "object" || Array.isArray(marker)) fail("track " + track.id + ".sourceProcessing must be an object");
    if (!SOURCE_PREMIX_FORMATS.has(marker.format) || marker.owner !== "huashu-motion.sound.mixdown") fail("track " + track.id + ".sourceProcessing uses an unknown owner/format");
    if (marker.format === "laohu.motion.source-premix-processing/2" && marker.nativeBaseSourceContract !== "nativeBaseSources/1") fail("track " + track.id + ".sourceProcessing/2 must require the nativeBaseSources/1 Film contract");
    if (marker.format === "laohu.motion.source-premix-processing/1" && marker.nativeBaseSourceContract != null) fail("track " + track.id + " cannot attach nativeBaseSources to the legacy source-premix/1 contract");
    if (track.bus !== "music" || track.locked === true) fail("original sound.mixdown soundtrack must remain an unlocked music track; locked-track bypass is not supported");
    if (track.startSec !== 0 || (track.speed != null && track.speed !== 1)
        || (track.sourceInSec != null && track.sourceInSec !== 0)
        || track.envelope != null || (track.loop != null && track.loop !== false)) {
      fail("original source mixdown track must retain its full segment asset at source origin and unity speed");
    }
    if (track.gainDb !== 0 || !track.timeMapId || track.timeMapId !== marker.timeMapId) fail("original source mixdown track must stay at 0 dB and use its receipt-bound canonical timeMap");
    for (const [key, label] of [
      ["receiptSha256", "receipt"], ["filmManifestSha256", "Film manifest"], ["canonicalEventSceneSha256", "canonical event scene"],
      ["sourceSceneSha256", "source scene"], ["sourceDeclarationSha256", "source declaration"], ["sourcePlanSha256", "source plan"], ["assetSha256", "source mixdown asset"],
    ]) {
      if (marker[key] != null && (typeof marker[key] !== "string" || !/^[a-f0-9]{64}$/i.test(marker[key]))) fail("track " + track.id + ".sourceProcessing." + key + " must be a SHA-256");
      if (["receiptSha256", "filmManifestSha256", "canonicalEventSceneSha256", "sourceSceneSha256", "sourceDeclarationSha256", "assetSha256"].includes(key) && marker[key] == null) fail("track " + track.id + ".sourceProcessing." + key + " is required");
      void label;
    }
    for (const [key, label] of [["receiptPath", "receipt"], ["filmManifestPath", "Film manifest"], ["sourceScenePath", "source scene"]]) {
      if (typeof marker[key] !== "string" || !marker[key] || path.isAbsolute(marker[key])) fail("track " + track.id + ".sourceProcessing." + key + " must be a relative " + label + " path");
    }
    id(marker.segmentId, "track " + track.id + ".sourceProcessing.segmentId");
    id(marker.timeMapId, "track " + track.id + ".sourceProcessing.timeMapId");
    const mapping = maps.get(marker.timeMapId);
    if (!mapping || mapping.localStartSec !== 0) fail("source-premix timeMap must begin at source-local zero");
    const sourceDurationSec = number(marker.sourceDurationSec, "track " + track.id + ".sourceProcessing.sourceDurationSec", { min: 0.000001 });
    if (mapping.localEndSec == null || Math.abs(mapping.localEndSec - sourceDurationSec) > 1e-6) fail("source-premix timeMap range differs from its pinned source duration");
    const asset = (plan.assets || []).find((row) => row.id === track.assetId);
    if (!asset || asset.durationSec + 1e-6 < sourceDurationSec || Math.abs((track.sourceOutSec ?? asset.durationSec) - sourceDurationSec) > 1e-6) fail("source-premix asset range differs from its pinned source duration");
    if (asset.sha256 !== marker.assetSha256 || asset.source?.outputKind !== "native-om-original-sound-mixdown-stereo-soundtrack") fail("source-premix asset hash or source kind differs from its bound receipt");
    const mixdown = marker.sourceMixdown;
    if (!mixdown || typeof mixdown !== "object" || Array.isArray(mixdown) || mixdown.function !== "sound.mixdown" || typeof mixdown.voiced !== "boolean") fail("track " + track.id + ".sourceProcessing.sourceMixdown is incomplete");
    if (marker.sourceKind != null && !["abc-score", "default-score-preset", "sfx-only"].includes(marker.sourceKind)) fail("track " + track.id + ".sourceProcessing.sourceKind is unsupported");
    if (!Number.isInteger(mixdown.sourceHitCount) || mixdown.sourceHitCount < 0) fail("source-premix sourceHitCount must be a non-negative integer");
    const binding = marker.voiceBinding;
    if (binding == null) {
      if (voiceTrack || (plan.voiceWindows || []).length || mixdown.voiced) fail("source-premix without a voice binding cannot be paired with narration or voice windows");
      if (mixdown.voiceLufs != null) fail("source-premix without narration must not claim a voiceLufs target");
    } else {
      if (!voiceTrack || !voiceTrack.locked || voiceTrack.id !== binding.trackId || voiceTrack.assetId !== binding.assetId) fail("source-premix voice binding must identify the one existing locked voice track");
      if (!(plan.voiceWindows || []).length || binding.voiceWindowsSha256 !== voiceWindowsSha256) fail("source-premix voiceWindows changed after original sound.mixdown");
      if (typeof binding.fileSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(binding.fileSha256)) fail("source-premix voice binding must pin the voice asset hash");
      number(binding.voiceLufs, "source-premix voiceBinding.voiceLufs");
      if (binding.timeMapId !== marker.timeMapId) fail("source-premix voice binding timeMap differs from its source segment");
      if (!Array.isArray(binding.mappedWords) || sha256(Buffer.from(canonical(binding.mappedWords), "utf8")) !== binding.mappedWordsSha256) fail("source-premix mapped voice windows have an invalid hash");
      for (const [index, window] of binding.mappedWords.entries()) {
        number(window.start, `source-premix mappedWords[${index}].start`, { min: 0 });
        number(window.end, `source-premix mappedWords[${index}].end`, { min: 0.000001 });
        if (window.end <= window.start || window.end > sourceDurationSec + 1e-8) fail("source-premix mapped voice window is outside the source segment");
      }
      if (mixdown.voiced !== (binding.mappedWords.length > 0)) fail("source-premix voiced flag differs from its mapped voice windows");
      if (mixdown.voiced && mixdown.voiceLufs !== binding.voiceLufs) fail("source-premix voice LUFS target differs from its locked voice binding");
      if (!mixdown.voiced && mixdown.voiceLufs != null) fail("source-premix without local narration must not claim a voice LUFS target");
    }
    if (!Array.isArray(marker.bakedCanonicalEvents) || marker.bakedCanonicalEvents.length !== mixdown.sourceHitCount) fail("source-premix baked event list must match the source mixdown hit count");
    for (const event of marker.bakedCanonicalEvents) {
      id(event.eventId, "source-premix baked eventId");
      if (bakedIds.has(event.eventId)) fail("source-premix baked event ID is duplicated across source segments: " + event.eventId);
      bakedIds.add(event.eventId);
      if (event.timeMapId !== marker.timeMapId) fail("source-premix baked event uses a different timeMap: " + event.eventId);
      number(event.sourceHitOrder, "source-premix sourceHitOrder", { min: 0 });
      number(event.sourceTimeSec, "source-premix sourceTimeSec", { min: 0 });
      number(event.filmTimeSec, "source-premix filmTimeSec", { min: 0 });
      id(event.name, "source-premix baked event name");
      if (!Number.isFinite(event.sourceGain) || !Number.isFinite(event.sourcePan) || !event.options || typeof event.options !== "object" || Array.isArray(event.options)) {
        fail("source-premix baked event must record the source gain, pan, and options: " + event.eventId);
      }
    }
  }
  const duplicated = (plan.events || []).find((event) => bakedIds.has(event.eventId || event.id));
  if (duplicated) fail("source-premix SFX must not also appear as an audio-plan event: " + (duplicated.eventId || duplicated.id));
}

function validateRequestGeneratedSourceGroupPlan(plan, maps) {
  const tracks = plan.tracks || [];
  const groupTracks = tracks.filter((track) => track.sourceGeneratedGroup != null);
  if (!groupTracks.length) return [];
  if (groupTracks.length !== 1) fail("audio-plan/1 supports exactly one request-generated source group");
  if (tracks.some((track) => track.sourceProcessing != null)) fail("request-generated source groups cannot be combined with original source-premix tracks");
  if ((plan.events || []).length || (plan.automation || []).length || plan.ducking != null) {
    fail("request-generated source groups cannot be combined with separate SFX events, automation, or ducking");
  }
  const [track] = groupTracks;
  const marker = track.sourceGeneratedGroup;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)
      || marker.format !== REQUEST_GENERATED_SOURCE_GROUP_FORMAT
      || marker.owner !== "laohu-motion.request-generated-source-group") {
    fail("track " + track.id + ".sourceGeneratedGroup has an unknown owner/format");
  }
  if (marker.trackId !== track.id || marker.assetId !== track.assetId) fail("request-generated source-group marker must identify its exact plan track and asset");
  if (track.bus !== "music" || track.locked === true || track.startSec !== 0
      || (track.speed != null && track.speed !== 1) || (track.sourceInSec != null && track.sourceInSec !== 0)
      || track.envelope != null || (track.loop != null && track.loop !== false) || track.timeMapId != null
      || track.gainDb !== 0) {
    fail("request-generated source group must remain one unlocked full-film music asset at origin and 0 dB");
  }
  const otherTracks = tracks.filter((row) => row.id !== track.id);
  if (otherTracks.some((row) => row.bus !== "voice") || otherTracks.length > 1) {
    fail("request-generated source group permits at most one separate locked voice track");
  }
  const voiceTrack = otherTracks[0] || null;
  if (voiceTrack && (!voiceTrack.locked || voiceTrack.startSec !== 0 || (voiceTrack.speed != null && voiceTrack.speed !== 1)
      || (voiceTrack.gainDb != null && voiceTrack.gainDb !== 0) || (voiceTrack.sourceInSec != null && voiceTrack.sourceInSec !== 0)
      || voiceTrack.sourceOutSec != null || voiceTrack.timeMapId != null || voiceTrack.envelope || voiceTrack.loop)) {
    fail("request-generated source-group narration must be one locked voice track at film origin");
  }
  const asset = (plan.assets || []).find((row) => row.id === track.assetId);
  if (!asset || asset.source?.outputKind !== "request-generated-source-group-stereo-soundtrack"
      || asset.sha256 !== marker.assetSha256 || asset.durationSec + 1e-8 < plan.durationSec
      || Math.abs((track.sourceOutSec ?? asset.durationSec) - plan.durationSec) > 1e-6) {
    fail("request-generated source-group track must point to its full-duration hash-pinned baked WAV");
  }
  for (const [key, label] of [
    ["receiptSha256", "receipt"], ["filmManifestSha256", "Film manifest"], ["canonicalEventSceneSha256", "canonical event scene"],
    ["requestSha256", "request file"], ["requestCanonicalSha256", "canonical request"], ["localRuntimeClosureSha256", "local runtime closure"],
    ["sourceClosureSha256", "source closure"], ["p0Sha256", "source p0"], ["assetSha256", "baked asset"],
  ]) sha256Field(marker[key], "track " + track.id + ".sourceGeneratedGroup." + label);
  for (const [key, label] of [["receiptPath", "receipt"], ["filmManifestPath", "Film manifest"], ["requestPath", "request"]]) {
    if (typeof marker[key] !== "string" || !marker[key] || path.isAbsolute(marker[key])) fail("track " + track.id + ".sourceGeneratedGroup." + key + " must be a relative " + label + " path");
  }
  if (typeof marker.sourceCommit !== "string" || !marker.sourceCommit) fail("request-generated source-group sourceCommit is required");
  id(marker.groupId, "request-generated source-group groupId");
  id(marker.sourceKit, "request-generated source-group sourceKit");
  const sourceDurationSec = number(marker.sourceDurationSec, "request-generated source-group sourceDurationSec", { min: 0.000001 });
  if (Math.abs(sourceDurationSec - plan.durationSec) > 1e-6) fail("request-generated source-group must cover the complete film duration");
  const musicGainDb = number(marker.musicGainDb, "request-generated source-group musicGainDb", { min: -120, max: 24 });
  const mixdown = marker.sourceMixdown;
  if (!mixdown || typeof mixdown !== "object" || Array.isArray(mixdown)
      || mixdown.function !== "sound.mixdown" || mixdown.owner !== "laohu-motion.request-generated-source-group/1"
      || mixdown.mixBusMode !== "default-sum" || mixdown.musicGainDb !== musicGainDb
      || mixdown.musicGainApplication !== "after-source-music-target-normalization-before-fx-combine-and-shared-bus"
      || typeof mixdown.voiced !== "boolean") {
    fail("request-generated source-group mixdown must identify the local source algorithm and bounded pre-bus gain hook; received " + JSON.stringify(mixdown));
  }
  if (!Number.isSafeInteger(mixdown.sourceHitCount) || mixdown.sourceHitCount < 0) fail("request-generated source-group sourceHitCount must be a non-negative integer");
  const baked = marker.bakedCanonicalEvents;
  if (!Array.isArray(baked) || baked.length !== mixdown.sourceHitCount) fail("request-generated source-group baked event list must match the source mixdown hit count");
  const orderSet = new Set();
  for (const [index, event] of baked.entries()) {
    id(event.requestId, `request-generated source-group bakedEvents[${index}].requestId`);
    id(event.eventId, `request-generated source-group bakedEvents[${index}].eventId`);
    const order = number(event.sourceHitOrder, `request-generated source-group bakedEvents[${index}].sourceHitOrder`, { min: 0 });
    if (!Number.isSafeInteger(order) || order !== index || orderSet.has(order)) fail("request-generated source-group hit orders must be unique and contiguous from zero");
    orderSet.add(order);
    number(event.sourceTimeSec, `request-generated source-group bakedEvents[${index}].sourceTimeSec`, { min: 0 });
    number(event.filmTimeSec, `request-generated source-group bakedEvents[${index}].filmTimeSec`, { min: 0 });
    number(event.sourceGain, `request-generated source-group bakedEvents[${index}].sourceGain`, { min: 0, max: 4 });
    number(event.sourcePan, `request-generated source-group bakedEvents[${index}].sourcePan`, { min: -1, max: 1 });
    if (event.mixGainDb !== 0 || event.seedBasis !== "pinned-source-renderSfx-name-index-at"
        || event.sourceSeed !== `${event.name}:${order}:${event.filmTimeSec}` || event.kit !== marker.sourceKit
        || typeof event.name !== "string" || !event.name.trim() || !event.kit
        || !event.options || typeof event.options !== "object" || Array.isArray(event.options)) {
      fail("request-generated source-group hit must preserve source kit/seed order and contain no per-hit post-mix gain");
    }
  }
  if (!Array.isArray(marker.canonicalEventBindings)) fail("request-generated source-group canonicalEventBindings must be an array");
  const bindingIds = new Set();
  for (const [index, binding] of marker.canonicalEventBindings.entries()) {
    id(binding.eventId, `request-generated source-group canonicalEventBindings[${index}].eventId`);
    if (bindingIds.has(binding.eventId)) fail("request-generated source-group canonical event mapping contains a duplicate eventId");
    bindingIds.add(binding.eventId);
    if (!Array.isArray(binding.roles) || !binding.roles.length) fail("request-generated source-group event binding must have at least one consumer role");
    number(binding.sourceTimeSec, `request-generated source-group canonicalEventBindings[${index}].sourceTimeSec`, { min: 0 });
    number(binding.filmTimeSec, `request-generated source-group canonicalEventBindings[${index}].filmTimeSec`, { min: 0 });
    if (!binding.sourceTimeBasis || !binding.owner || !Array.isArray(binding.roles)) fail("request-generated source-group canonical event mapping is incomplete");
    if (binding.timeMapId != null && !maps.has(binding.timeMapId)) fail("request-generated source-group event refers to missing timeMapId " + binding.timeMapId);
  }
  const bakedEventIds = new Set(baked.map((event) => event.eventId));
  const voiceBinding = marker.voiceBinding;
  const voiceWindowsSha = sha256(Buffer.from(canonical(plan.voiceWindows || []), "utf8"));
  if (voiceBinding == null) {
    if (voiceTrack || (plan.voiceWindows || []).length || mixdown.voiced) fail("request-generated source group without a voice binding cannot be paired with voice tracks/windows");
  } else {
    if (!voiceTrack || voiceBinding.trackId !== voiceTrack.id || voiceBinding.assetId !== voiceTrack.assetId
        || voiceBinding.narrationIncludedInBakedAsset !== false || voiceBinding.voiceWindowsSha256 !== voiceWindowsSha
        || !(plan.voiceWindows || []).length) fail("request-generated source-group voice binding must match one locked voice asset and real canonical voiceWindows");
    sha256Field(voiceBinding.fileSha256, "request-generated source-group voice asset SHA-256");
    number(voiceBinding.voiceLufs, "request-generated source-group voice LUFS");
    if (voiceBinding.voiceWindows == null || canonical(voiceBinding.voiceWindows) !== canonical(plan.voiceWindows)) fail("request-generated source-group voice windows changed after source mixdown");
    const voiceAsset = (plan.assets || []).find((row) => row.id === voiceTrack.assetId);
    if (!voiceAsset || voiceAsset.sha256 !== voiceBinding.fileSha256) fail("request-generated source-group voice binding does not pin the locked voice asset");
  }
  if (mixdown.voiced !== Boolean(voiceBinding)) fail("request-generated source-group source voice flag differs from the separate locked voice track");
  if (mixdown.voiceWindowsSha256 !== (voiceBinding?.voiceWindowsSha256 || null)) fail("request-generated source-group mixdown voice-window hash differs from its voice binding");
  if (mixdown.voiceDuckProcessing != null) {
    const processing = mixdown.voiceDuckProcessing;
    const expectedWords = voiceBinding
      ? mappedVoiceWindowsForSource(plan.voiceWindows || [], { filmStartSec: 0, speed: 1 }, plan.durationSec)
      : [];
    if (typeof processing.applied !== "boolean" || !Array.isArray(processing.wordWindows)
        || processing.applied !== Boolean(mixdown.musicOn && expectedWords.length)
        || processing.voiceWindowsSha256 !== (voiceBinding?.voiceWindowsSha256 || null)
        || canonical(processing.wordWindows) !== canonical(expectedWords)) {
      fail("request-generated source-group voiceDuckProcessing must preserve the actual music-on result and identity-mapped word windows");
    }
  }
  if (!bakedEventIds.size && baked.length) fail("request-generated source-group baked event identity is malformed");
  return groupTracks;
}

function assetHasGeneratedAudioLineage(asset, seen = new Set()) {
  if (!asset || typeof asset !== "object" || !asset.id) return false;
  if (seen.has(asset.id)) return true;
  const ancestry = new Set(seen);
  ancestry.add(asset.id);
  const source = asset.source && typeof asset.source === "object" ? asset.source : null;
  const mode = source?.generationMode;
  if (mode === "original-synthesis") return true;
  if (mode === "source-edit" || mode === "transcode" || mode === "audio-edit") {
    const parents = source.parents ?? (source.parent == null ? [] : [source.parent]);
    if (!Array.isArray(parents) || parents.length === 0) return true;
    return parents.some((parent) => {
      if (!parent || typeof parent !== "object" || !parent.assetId || !/^[a-f0-9]{64}$/i.test(parent.sha256 || "")) return true;
      if (parent.generationMode === "original-synthesis" || parent.redistributionStatus === "project-generated") return true;
      if (["source-edit", "transcode", "audio-edit"].includes(parent.generationMode)) {
        const ancestors = parent.parents ?? (parent.parent == null ? [] : [parent.parent]);
        if (!Array.isArray(ancestors) || ancestors.length === 0) return true;
        return assetHasGeneratedAudioLineage({
          id: parent.assetId,
          source: { generationMode: parent.generationMode, parent: parent.parent, parents: parent.parents },
          redistribution: { status: parent.redistributionStatus },
        }, new Set(ancestry));
      }
      return false;
    });
  }
  return asset.redistribution?.status === "project-generated";
}

function generatedAudioAssetScopes(plan) {
  const roles = new Map();
  for (const event of plan.events || []) {
    if (!roles.has(event.assetId)) roles.set(event.assetId, new Set());
    roles.get(event.assetId).add("sfx");
  }
  for (const track of plan.tracks || []) {
    if (!roles.has(track.assetId)) roles.set(track.assetId, new Set());
    roles.get(track.assetId).add(track.bus);
  }
  const assetById = new Map((plan.assets || []).map((asset) => [asset.id, asset]));
  const generatedRecipes = new Set((plan.generatedAssets || []).map((asset) => asset.id));
  const result = new Map();
  for (const [assetId, referencedRoles] of roles) {
    const asset = assetById.get(assetId);
    const lockedVoiceOnly = referencedRoles.size === 1 && referencedRoles.has("voice")
      && (plan.tracks || []).some((track) => track.assetId === assetId && track.bus === "voice" && track.locked === true);
    if (lockedVoiceOnly && !generatedRecipes.has(assetId) && asset?.source?.generationMode !== "original-synthesis") continue;
    if (!asset && !generatedRecipes.has(assetId)) continue;
    if (!generatedRecipes.has(assetId) && !assetHasGeneratedAudioLineage(asset)) continue;
    const sourceScopes = asset?.source?.generationScopes;
    if (Array.isArray(sourceScopes) && sourceScopes.some((scope) => !["music", "sfx"].includes(scope))) {
      fail("generated audio asset " + assetId + ".source.generationScopes may contain only music and sfx");
    }
    const scopes = new Set(Array.isArray(sourceScopes) && sourceScopes.length
      ? sourceScopes
      : [...referencedRoles].filter((role) => role === "music" || role === "sfx"));
    if (!scopes.size && referencedRoles.has("music")) scopes.add("music");
    if (!scopes.size && referencedRoles.has("sfx")) scopes.add("sfx");
    if (scopes.size) result.set(assetId, [...scopes].sort());
  }
  return result;
}

function generatedAudioAssetIds(plan) {
  return [...generatedAudioAssetScopes(plan).keys()].sort();
}

function validateAudioPolicy(plan, { allowLegacyReplay = false } = {}) {
  const generatedScopesByAsset = generatedAudioAssetScopes(plan);
  const generatedAssetIds = [...generatedScopesByAsset.keys()].sort();
  const policy = plan.audioPolicy;
  if (!generatedAssetIds.length) {
    if (policy != null && (typeof policy !== "object" || Array.isArray(policy)
        || policy.format !== "laohu.motion.audio-policy/1")) fail("plan.audioPolicy must use laohu.motion.audio-policy/1");
    return { status: policy ? "declared-no-unreviewed-generation" : "not-required", generatedAssetIds };
  }
  if (policy == null) {
    if (allowLegacyReplay) return { status: "legacy-replay", generatedAssetIds };
    fail("Program-generated audio requires an explicit, role-scoped user authorization in the source request and a hash-bound audioPolicy; reviewStatus and preview flags do not grant generation authorization. Use --legacy-replay only for an existing project replay.");
  }
  if (typeof policy !== "object" || Array.isArray(policy) || policy.format !== "laohu.motion.audio-policy/1"
      || policy.mode !== "explicit-user-authorized-generation") fail("plan.audioPolicy must use laohu.motion.audio-policy/1 with mode explicit-user-authorized-generation");
  const auth = policy.authorization;
  const validScopes = new Set(["music", "sfx"]);
  const legacyBroadAuthorization = auth?.scope === "original-audio";
  if (legacyBroadAuthorization && allowLegacyReplay) return { status: "legacy-replay", generatedAssetIds, generatedScopesByAsset: Object.fromEntries(generatedScopesByAsset) };
  const authorizations = Array.isArray(policy.authorizations) ? [...policy.authorizations] : [];
  if (policy.authorization?.source === "explicit-user-request" && Array.isArray(policy.authorization.scopes)) {
    authorizations.push(policy.authorization);
  }
  const authorizationByHash = new Map();
  for (const [index, authRow] of authorizations.entries()) {
    const authorization = authRow && typeof authRow === "object" && !Array.isArray(authRow) ? authRow : null;
    const authorizationScopes = Array.isArray(authorization?.scopes) ? authorization.scopes : [];
    const uniqueScopes = new Set(authorizationScopes);
    if (!authorization || authorization.source !== "explicit-user-request" || authorization.granted !== true
        || !authorizationScopes.length || uniqueScopes.size !== authorizationScopes.length
        || authorizationScopes.some((scope) => !validScopes.has(scope))
        || typeof authorization.instructionExcerpt !== "string" || !authorization.instructionExcerpt.trim()
        || typeof authorization.requestPath !== "string" || !authorization.requestPath || path.isAbsolute(authorization.requestPath)
        || typeof authorization.requestSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(authorization.requestSha256)) {
      fail(`plan.audioPolicy.authorizations[${index}] must bind explicit-user-request music/sfx scopes, a non-empty instruction excerpt, relative request path, and request SHA-256`);
    }
    const hash = authorization.requestSha256.toLowerCase();
    if (authorizationByHash.has(hash)) fail("plan.audioPolicy.authorizations contains duplicate requestSha256 " + hash);
    authorizationByHash.set(hash, authorization);
  }
  const policyScopesByAsset = policy.generatedScopesByAsset;
  const expectedScopesByAsset = [...generatedScopesByAsset].map(([assetId, scopes]) => {
    const row = policyScopesByAsset?.find?.((entry) => entry?.assetId === assetId);
    const requestSha256 = row?.authorizationRequestSha256;
    const authorization = authorizationByHash.get(String(requestSha256 || "").toLowerCase());
    if (!authorization) fail(`audioPolicy has no exact source-request authorization for generated asset ${assetId}`);
    for (const scope of scopes) if (!authorization.scopes.includes(scope)) fail(`audioPolicy authorization does not grant ${scope} generation required by generated asset ${assetId}`);
    return { assetId, scopes, authorizationRequestSha256: requestSha256.toLowerCase() };
  }).sort((a, b) => a.assetId.localeCompare(b.assetId));
  if (!Array.isArray(policyScopesByAsset) || canonical([...policyScopesByAsset].sort((a, b) => a.assetId.localeCompare(b.assetId))) !== canonical(expectedScopesByAsset)) {
    fail("plan.audioPolicy.generatedScopesByAsset must exactly bind each generated asset to its music/sfx role and authorization request");
  }
  if (!Array.isArray(policy.generatedAssetIds) || canonical([...policy.generatedAssetIds].sort()) !== canonical(generatedAssetIds)) {
    fail("plan.audioPolicy.generatedAssetIds must exactly cover referenced program-generated audio assets regardless of reviewStatus");
  }
  return { status: "explicit-user-authorized-generation", generatedAssetIds, generatedScopesByAsset: Object.fromEntries(generatedScopesByAsset), authorizations };
}

function knownFields(object, keys, label) {
  if (!object || typeof object !== "object" || Array.isArray(object)) fail(label + " must be an object");
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) fail(label + "." + key + " is not implemented by audio-plan/1");
  }
}

function validateTrackFilters(item) {
  for (const key of ["highpassHz", "vocalPocket", "pan"]) {
    if (!(key in item)) continue;
    if (item.locked) fail("locked track " + item.id + " cannot apply " + key);
    if (item.sourceProcessing || item.sourceGeneratedGroup) fail("source-owned mix " + item.id + " cannot apply " + key + "; use separate stems");
    if (item.bus !== "music" && !(item.bus === "sfx" && key === "pan")) fail(key + " is unsupported on " + item.bus);
    if (key === "pan") number(item.pan, "pan", {min: -1, max: 1});
    if (key === "highpassHz") number(item.highpassHz, "highpassHz", {min: 1, max: 23999});
    if (key === "vocalPocket") {
      const eq = item.vocalPocket;
      knownFields(eq, ["freqHz", "widthQ", "gainDb"], "vocalPocket");
      number(eq.freqHz, "vocalPocket.freqHz", {min: 1, max: 23999});
      number(eq.widthQ, "vocalPocket.widthQ", {min: 0.01, max: 100});
      number(eq.gainDb, "vocalPocket.gainDb", {min: -24, max: 0});
    }
  }
}

function validatePlan(plan, options = {}) {
  for (const key of ["controlSource", "processing", "rooms"]) {
    if (Object.prototype.hasOwnProperty.call(plan, key)) {
      fail(`plan.${key} is not supported by audio-plan/1; continuous audio controls and room processing are unavailable`);
    }
  }
  knownFields(plan, ["schemaVersion", "timeUnit", "timeBasis", "durationSec", "sampleRate", "channels", "asrcutBinding",
    "events", "tracks", "voiceWindows", "automation", "timeMaps", "assets", "generatedAssets", "audioPolicy", "ducking", "note", "masterLoudnorm"], "plan");
  if ("masterLoudnorm" in plan) {
    const master = plan.masterLoudnorm;
    if (Array.isArray(plan.tracks) && plan.tracks.some(track => track.sourceProcessing || track.sourceGeneratedGroup)) {
      fail("source-owned mix already has a master; use separate stems for masterLoudnorm");
    }
    knownFields(master, ["targetLufs", "truePeakDbtp", "lra"], "masterLoudnorm");
    number(master.targetLufs, "masterLoudnorm.targetLufs", {min: -70, max: -5});
    number(master.truePeakDbtp, "masterLoudnorm.truePeakDbtp", {min: -9, max: 0});
    number(master.lra, "masterLoudnorm.lra", {min: 1, max: 50});
  }
  if (plan.schemaVersion !== 1) fail("audio plan schemaVersion must be 1");
  if (plan.timeUnit !== "seconds") fail("audio plan timeUnit must be seconds; frame/sample/millisecond values are not accepted here");
  if (plan.timeBasis !== "film-global") fail("audio plan timeBasis must be film-global");
  const durationSec = number(plan.durationSec, "plan.durationSec", { min: 0.001 });
  if (plan.sampleRate !== 48000 || plan.channels !== 2) fail("audio plan output contract is fixed at 48000 Hz stereo");
  if (plan.asrcutBinding != null && (typeof plan.asrcutBinding !== "object" || Array.isArray(plan.asrcutBinding)
      || plan.asrcutBinding.format !== "laohu.motion.asrcut-audio-binding/1")) {
    fail("plan.asrcutBinding must use laohu.motion.asrcut-audio-binding/1");
  }
  for (const key of ["events", "tracks", "voiceWindows", "automation", "timeMaps", "assets", "generatedAssets"]) {
    if (plan[key] != null && !Array.isArray(plan[key])) fail("plan." + key + " must be an array");
  }
  uniqueIds(plan.events || [], "cue event");
  uniqueIds(plan.tracks || [], "track");
  uniqueIds(plan.assets || [], "project asset");
  uniqueIds(plan.generatedAssets || [], "generated asset");
  uniqueIds(plan.timeMaps || [], "time map");
  const maps = new Map();
  for (const mapping of plan.timeMaps || []) {
    number(mapping.localStartSec, "timeMap " + mapping.id + ".localStartSec");
    number(mapping.filmStartSec, "timeMap " + mapping.id + ".filmStartSec");
    number(mapping.speed, "timeMap " + mapping.id + ".speed", { min: 0.0625, max: 16 });
    if (mapping.localEndSec != null) number(mapping.localEndSec, "timeMap " + mapping.id + ".localEndSec", { min: mapping.localStartSec });
    maps.set(mapping.id, mapping);
  }
  for (const event of plan.events || []) {
    knownFields(event, ["id","assetId","bus","eventId","offsetSec","filmTimeSec","timeMapId","speed","playbackRate","sourceInSec","sourceOutSec","gainDb","envelope","hitTimeSec","pan","note"], "cue " + event.id);
    validateTrackFilters(event);
    id(event.assetId, "cue " + event.id + ".assetId");
    id(event.eventId || event.id, "cue " + event.id + ".eventId");
    if (event.bus !== "sfx") fail("cue " + event.id + ".bus must be sfx");
    if (event.offsetSec != null) number(event.offsetSec, "cue " + event.id + ".offsetSec");
    if (event.filmTimeSec != null) number(event.filmTimeSec, "cue " + event.id + ".filmTimeSec", { min: 0 });
    if (event.timeMapId != null && !maps.has(event.timeMapId)) fail("cue " + event.id + " references missing timeMapId " + event.timeMapId);
    if (event.speed != null) number(event.speed, "cue " + event.id + ".speed", { min: 0.000001, max: 16 });
    if (event.playbackRate != null) fail("cue " + event.id + ".playbackRate is not supported by audio-plan/1; speed uses pitch-preserving atempo, edit source pitch with audio-edit.mjs");
    if (event.sourceInSec != null) number(event.sourceInSec, "cue " + event.id + ".sourceInSec", { min: 0 });
    if (event.sourceOutSec != null) number(event.sourceOutSec, "cue " + event.id + ".sourceOutSec", { min: 0 });
    if (event.gainDb != null) number(event.gainDb, "cue " + event.id + ".gainDb", { min: -120, max: 24 });
    validateEnvelope(event.envelope, "cue " + event.id + ".envelope");
  }
  for (const track of plan.tracks || []) {
    knownFields(track, ["id","assetId","bus","useCase","startSec","timeMapId","speed","playbackRate","loop","sourceInSec","sourceOutSec","gainDb","envelope","locked","sourceProcessing","sourceGeneratedGroup","highpassHz","vocalPocket","pan","note"], "track " + track.id);
    validateTrackFilters(track);
    id(track.assetId, "track " + track.id + ".assetId");
    if (!["music", "voice"].includes(track.bus)) fail("track " + track.id + ".bus must be music or voice");
    if (track.useCase != null) {
      if (track.bus !== "music" || !MUSIC_USE_CASES.has(track.useCase)) {
        fail("track " + track.id + ".useCase must be one of the canonical music use cases on a music track");
      }
    }
    number(track.startSec, "track " + track.id + ".startSec");
    if (track.timeMapId != null && !maps.has(track.timeMapId)) fail("track " + track.id + " references missing timeMapId " + track.timeMapId);
    if (track.speed != null) number(track.speed, "track " + track.id + ".speed", { min: 0.000001, max: 16 });
    if (track.playbackRate != null) fail("track " + track.id + ".playbackRate is not supported by audio-plan/1; speed uses pitch-preserving atempo, edit source pitch with audio-edit.mjs");
    if (track.loop != null && track.loop !== false) fail("track " + track.id + ".loop is not supported by audio-plan/1; prepare a musically valid repeated source with audio-edit.mjs");
    if (track.sourceInSec != null) number(track.sourceInSec, "track " + track.id + ".sourceInSec", { min: 0 });
    if (track.sourceOutSec != null) number(track.sourceOutSec, "track " + track.id + ".sourceOutSec", { min: 0 });
    if (track.gainDb != null) number(track.gainDb, "track " + track.id + ".gainDb", { min: -120, max: 24 });
    validateEnvelope(track.envelope, "track " + track.id + ".envelope");
    if (track.locked) {
      const speed = track.speed == null ? 1 : track.speed;
      const gain = track.gainDb == null ? 0 : track.gainDb;
      if (track.startSec < 0 || speed !== 1 || gain !== 0 || (track.sourceInSec != null && track.sourceInSec !== 0) || track.sourceOutSec != null || track.envelope || track.loop || track.timeMapId) {
        fail("locked track " + track.id + " cannot be cropped, speed-changed, gained, looped, or enveloped");
      }
    }
  }
  for (const window of plan.voiceWindows || []) {
    number(window.startSec, "voiceWindow " + (window.id || "?") + ".startSec", { min: 0 });
    number(window.endSec, "voiceWindow " + (window.id || "?") + ".endSec", { min: 0.000001 });
    if (window.endSec <= window.startSec || window.endSec > durationSec + 1e-8) fail("voiceWindow " + (window.id || "?") + " is outside film duration");
  }
  uniqueIds(plan.voiceWindows || [], "voice window");
  const musicTracksById = new Map((plan.tracks || []).filter((track) => track.bus === "music").map((track) => [track.id, track]));
  const validatedAutomation = [];
  for (const item of plan.automation || []) {
    const label = "automation " + (item.id || "?");
    if (item.bus !== "music") fail(label + ".bus must be music");
    const gainFields = ["gainDb", "deltaGainDb", "targetGainDb"].filter((key) => Object.prototype.hasOwnProperty.call(item, key));
    if (gainFields.length !== 1) fail(label + " must set exactly one of legacy gainDb, deltaGainDb, or targetGainDb");
    const gainField = gainFields[0];
    const supportedKeys = new Set(["id", "eventId", "bus", "startSec", "endSec", "gainDb", "deltaGainDb", "targetGainDb", "trackId", "fadeInSec", "fadeOutSec"]);
    for (const key of Object.keys(item)) if (!supportedKeys.has(key)) fail(label + "." + key + " is not implemented by audio-plan/1");
    if (item.eventId != null) id(item.eventId, label + ".eventId");
    number(item.startSec, label + ".startSec", { min: 0 });
    number(item.endSec, label + ".endSec", { min: 0.000001 });
    number(item[gainField], label + "." + gainField, { min: -120, max: 24 });
    if (item.endSec <= item.startSec || item.endSec > durationSec + 1e-8) fail(label + " is outside film duration");
    if (gainField === "gainDb" && item.trackId != null) fail(label + ".trackId is only supported with deltaGainDb or targetGainDb; legacy gainDb remains bus-wide");
    if (gainField === "targetGainDb" && item.trackId == null) fail(label + ".targetGainDb requires a music trackId");
    if (item.trackId != null) {
      const track = musicTracksById.get(item.trackId);
      if (!track) fail(label + ".trackId must reference an existing music track");
      if (track.locked) fail(label + " cannot target locked music track " + item.trackId);
    }
    number(item.fadeInSec == null ? 0 : item.fadeInSec, "automation " + item.id + ".fadeInSec", { min: 0 });
    number(item.fadeOutSec == null ? 0 : item.fadeOutSec, "automation " + item.id + ".fadeOutSec", { min: 0 });
    validatedAutomation.push({ item, gainField });
  }
  for (let leftIndex = 0; leftIndex < validatedAutomation.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < validatedAutomation.length; rightIndex += 1) {
      const left = validatedAutomation[leftIndex];
      const right = validatedAutomation[rightIndex];
      const target = left.gainField === "targetGainDb" ? left : right.gainField === "targetGainDb" ? right : null;
      if (!target) continue;
      const other = target === left ? right : left;
      const overlaps = target.item.startSec < other.item.endSec && other.item.startSec < target.item.endSec;
      const otherAppliesToTarget = other.item.trackId == null || other.item.trackId === target.item.trackId;
      if (overlaps && otherAppliesToTarget) {
        fail("targetGainDb automation " + target.item.id + " overlaps another music automation on track " + target.item.trackId);
      }
    }
  }
  if (plan.ducking != null) {
    if (typeof plan.ducking !== "object" || Array.isArray(plan.ducking)) fail("ducking must be an object");
    const supportedDuckingKeys = new Set(["targetGainDb", "attackSec", "releaseSec", "preRollSec", "holdSec"]);
    for (const key of Object.keys(plan.ducking)) {
      if (!supportedDuckingKeys.has(key)) fail("ducking." + key + " is not implemented by audio-plan/1");
    }
    number(plan.ducking.targetGainDb, "ducking.targetGainDb", { min: -120, max: 0 });
    number(plan.ducking.attackSec, "ducking.attackSec", { min: 0 });
    number(plan.ducking.releaseSec, "ducking.releaseSec", { min: 0 });
    number(plan.ducking.preRollSec == null ? 0 : plan.ducking.preRollSec, "ducking.preRollSec", { min: 0 });
    number(plan.ducking.holdSec == null ? 0 : plan.ducking.holdSec, "ducking.holdSec", { min: 0 });
  }
  for (const asset of plan.assets || []) {
    id(asset.id, "project asset id");
    if (typeof asset.file !== "string" || !asset.file) fail("project asset " + asset.id + ".file is required");
    number(asset.durationSec, "project asset " + asset.id + ".durationSec", { min: 0.000001 });
    if (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(asset.sha256)) fail("project asset " + asset.id + ".sha256 must be a SHA-256");
    validateRights(asset, "project asset " + asset.id);
  }
  for (const asset of plan.generatedAssets || []) validateGeneratedAsset(asset);
  validateSourcePremixPlan(plan, maps);
  validateRequestGeneratedSourceGroupPlan(plan, maps);
  const audioPolicy = validateAudioPolicy(plan, options);
  return { durationSec, maps, audioPolicy };
}

async function verifyAudioPolicyRequest(plan, planPath, policyInfo) {
  if (policyInfo.status === "not-required" || policyInfo.status === "declared-no-unreviewed-generation") return policyInfo;
  if (policyInfo.status === "legacy-replay") return policyInfo;
  const verifiedRequests = [];
  for (const auth of policyInfo.authorizations || []) {
    const requestPath = path.resolve(path.dirname(planPath), auth.requestPath);
    const bytes = await fs.readFile(requestPath).catch((error) => fail("Hash-bound original-audio authorization request cannot be read: " + error.message));
    const actualHash = sha256(bytes);
    if (actualHash.toLowerCase() !== auth.requestSha256.toLowerCase()) fail("Hash-bound original-audio authorization request SHA-256 changed");
    let request;
    try { request = JSON.parse(bytes.toString("utf8")); } catch (error) { fail("Hash-bound original-audio authorization request is invalid JSON: " + error.message); }
    const requestAuth = request.generationAuthorization;
    if (!requestAuth || requestAuth.granted !== true || canonical(requestAuth.scopes) !== canonical(auth.scopes)
        || requestAuth.source !== auth.source || requestAuth.instructionExcerpt !== auth.instructionExcerpt) {
      fail("Hash-bound audioPolicy does not match the original request's explicit generationAuthorization record");
    }
    verifiedRequests.push({ requestPath: auth.requestPath, requestSha256: actualHash, requestRecordVerified: true });
  }
  return { ...policyInfo, requestPaths: verifiedRequests.map((row) => row.requestPath), verifiedRequests,
    requestPath: verifiedRequests.length === 1 ? verifiedRequests[0].requestPath : null,
    requestSha256: verifiedRequests.length === 1 ? verifiedRequests[0].requestSha256 : null,
    requestRecordVerified: verifiedRequests.length > 0,
    verificationBoundary: "Request records and bytes are verified; software cannot independently prove the instruction excerpt's human origin." };
}

function resolveBoundRelativeFile(baseDirectory, value, label) {
  if (typeof value !== "string" || !value || path.isAbsolute(value)) fail(label + " must be a relative path");
  return path.resolve(baseDirectory, value);
}

async function readBoundJson(file, expectedSha256, label) {
  const bytes = await fs.readFile(file).catch((error) => fail(label + " cannot be read: " + error.message));
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== expectedSha256) fail(label + " hash differs from the source-premix binding");
  try { return { value: JSON.parse(bytes.toString("utf8")), sha256: actualSha256 }; }
  catch (error) { fail(label + " is not valid JSON: " + error.message); }
}

function mappedVoiceWindowsForSource(voiceWindows, mapping, durationSec) {
  const speed = number(mapping.speed, "source-premix timeMap.speed", { min: 0.000001 });
  const filmStartSec = number(mapping.filmStartSec, "source-premix timeMap.filmStartSec");
  const filmEndSec = filmStartSec + durationSec / speed;
  return voiceWindows.flatMap((window) => {
    const startFilmSec = Math.max(filmStartSec, window.startSec);
    const endFilmSec = Math.min(filmEndSec, window.endSec);
    if (endFilmSec <= startFilmSec + 1e-8) return [];
    const start = Math.max(0, Math.min(durationSec, (startFilmSec - filmStartSec) * speed));
    const end = Math.max(0, Math.min(durationSec, (endFilmSec - filmStartSec) * speed));
    return end > start + 1e-8 ? [{ start, end }] : [];
  });
}

function mappedVoiceWindowsForTrack(voiceWindows, clip) {
  const sourceDurationSec = clip.sourceOut - clip.sourceIn;
  return mappedVoiceWindowsForSource(voiceWindows, {
    filmStartSec: clip.startFilmSec,
    speed: clip.speed,
  }, sourceDurationSec).map((window) => ({
    start: window.start + clip.sourceIn,
    end: window.end + clip.sourceIn,
  }));
}

function validateAssetVoiceDuckProcessing({ plan, track, asset, clip }) {
  const processing = asset.source?.voiceDuckProcessing;
  if (processing == null) return null;
  if (!processing || typeof processing !== "object" || Array.isArray(processing)
      || typeof processing.applied !== "boolean" || !Array.isArray(processing.wordWindows)) {
    fail("Asset " + asset.id + ".source.voiceDuckProcessing is incomplete");
  }
  const expectedHash = (plan.voiceWindows || []).length
    ? sha256(Buffer.from(canonical(plan.voiceWindows), "utf8"))
    : null;
  if (processing.voiceWindowsSha256 !== expectedHash) fail("Asset " + asset.id + " voice-duck receipt is bound to different canonical voiceWindows");
  const expectedWords = mappedVoiceWindowsForTrack(plan.voiceWindows || [], clip);
  if (processing.applied) {
    if (track.bus !== "music" || track.locked || plan.ducking != null
        || canonical(processing.wordWindows) !== canonical(expectedWords) || !expectedWords.length) {
      fail("Asset " + asset.id + " baked voice duck does not match this unlocked music track's mapped voiceWindows or would be applied twice");
    }
  } else if (processing.processor === "audio-plan final mixer") {
    if (track.bus !== "music" || track.locked || plan.ducking == null || !(plan.voiceWindows || []).length
        || canonical(processing.requestedWordWindows || []) !== canonical(expectedWords)) {
      fail("Asset " + asset.id + " delegates voice ducking to audio-plan, but this track has no matching active final-mixer duck");
    }
  } else if (processing.wordWindows.length) {
    fail("Asset " + asset.id + " reports unapplied voice ducking with nonempty baked wordWindows");
  }
  return {
    ...processing,
    verified: true,
    trackId: track.id,
    assetId: asset.id,
    expectedWordWindows: expectedWords,
    finalMixerDuckRequested: Boolean(!processing.applied && processing.processor === "audio-plan final mixer"),
  };
}

async function verifyNativeSourcePremixBindings({ plan, planPath, resolved, scene, scenePath, maps }) {
  const tracks = (plan.tracks || []).filter((track) => track.sourceProcessing != null);
  if (!tracks.length) return [];
  if (!scene || !scenePath) fail("--scene is required to verify the source-premix canonical SFX and segment timeMap");
  const sceneEvents = findSceneAudioEvents(scene);
  const planDirectory = path.dirname(planPath);
  const actualSceneBytes = await fs.readFile(scenePath).catch((error) => fail("Canonical audio-event scene cannot be read: " + error.message));
  const actualSceneSha256 = sha256(actualSceneBytes);
  const verified = [];
  for (const track of tracks) {
    const marker = track.sourceProcessing;
    const receiptPath = resolveBoundRelativeFile(planDirectory, marker.receiptPath, "source-premix receipt path");
    const filmManifestPath = resolveBoundRelativeFile(planDirectory, marker.filmManifestPath, "source-premix Film manifest path");
    const [receiptFile, filmFile] = await Promise.all([
      readBoundJson(receiptPath, marker.receiptSha256, "source-premix receipt"),
      readBoundJson(filmManifestPath, marker.filmManifestSha256, "source-premix Film manifest"),
    ]);
    const receipt = receiptFile.value;
    const filmManifest = filmFile.value;
    const isNativeBaseContractV2 = filmManifest.format === "laohu.motion-film-manifest/2";
    const expectedPremixFormat = isNativeBaseContractV2 ? "laohu.motion.source-premix-processing/2" : "laohu.motion.source-premix-processing/1";
    if (marker.format !== expectedPremixFormat) fail("source-premix marker version must match the bound Film audio contract; refusing a consumer that could ignore native source context");
    if (isNativeBaseContractV2 && marker.nativeBaseSourceContract !== "nativeBaseSources/1") fail("source-premix/2 is missing the required nativeBaseSources/1 binding");
    if (receipt.format !== "laohu.motion.huashu-audio-receipt/1") fail("source-premix receipt format is not the pinned Huashu audio receipt");
    if (path.resolve(receipt.alignment?.filmManifest || "") !== filmManifestPath) fail("source-premix receipt points to a different Film manifest");
    if (receipt.alignment?.canonicalEventScene?.sha256 !== actualSceneSha256
        || marker.canonicalEventSceneSha256 !== actualSceneSha256) fail("canonical event scene hash differs from the source-premix receipt");
    const sceneRef = filmManifest.audioEventScene;
    if (!sceneRef || sceneRef.sha256 !== actualSceneSha256
        || path.resolve(path.dirname(filmManifestPath), sceneRef.path) !== path.resolve(scenePath)) {
      fail("canonical event scene is not the exact Film manifest event scene pinned by this source-premix track");
    }
    const filmTimeMap = (receipt.alignment?.timeMaps || []).find((row) => row.id === marker.timeMapId);
    const planTimeMap = maps.get(marker.timeMapId);
    if (!filmTimeMap || !planTimeMap || canonical(filmTimeMap) !== canonical(planTimeMap)) fail("source-premix timeMap changed since the source receipt was generated");
    const filmSegment = (filmManifest.segments || []).find((row) => row.id === marker.segmentId);
    if (!filmSegment) fail("source-premix Film segment is absent from its bound manifest");
    let sourceScenePath;
    if (isNativeBaseContractV2) {
      const nativeBaseRows = filmManifest.nativeBaseSources;
      if (!Array.isArray(nativeBaseRows)) fail("Film manifest/2 is missing nativeBaseSources; old consumers must reject rather than silently omit original OM context");
      const expectedNativeBaseIds = (filmManifest.segments || []).filter((row) => row.renderer === "laohu-native-om-template").map((row) => row.id);
      if (nativeBaseRows.length !== expectedNativeBaseIds.length
          || new Set(nativeBaseRows.map((row) => row?.segmentId)).size !== nativeBaseRows.length
          || expectedNativeBaseIds.some((segmentId) => !nativeBaseRows.some((row) => row?.segmentId === segmentId))) {
        fail("Film manifest/2 nativeBaseSources must cover every complete native OM base segment exactly once");
      }
      const nativeBase = nativeBaseRows.find((row) => row.segmentId === marker.segmentId);
      if (!nativeBase || nativeBase.renderer !== "laohu-native-om-template"
          || nativeBase.sourceScenePath !== marker.sourceScenePath
          || nativeBase.sourceSceneSha256 !== marker.sourceSceneSha256) fail("source-premix source scene differs from the verified nativeBaseSources binding");
      if (filmSegment.renderer !== "laohu-native-om-template" || filmSegment.baseSource?.renderer !== nativeBase.renderer
          || filmSegment.baseSource?.templateId !== nativeBase.templateId) fail("source-premix Film segment no longer identifies the complete native OM base source");
      const childManifestPath = resolveBoundRelativeFile(path.dirname(filmManifestPath), nativeBase.childFilmManifestPath, "nativeBaseSources child Film manifest path");
      const childManifest = (await readBoundJson(childManifestPath, nativeBase.childFilmManifestSha256, "native OM child Film manifest")).value;
      if (childManifest.format !== "laohu.huashu-om-film-manifest/1") fail("nativeBaseSources child receipt is not a complete OM Film /1 manifest");
      const childSegment = (childManifest.segments || []).find((row) => row.id === nativeBase.childSegmentId);
      if (!childSegment || childSegment.renderer !== nativeBase.renderer || childSegment.template?.id !== nativeBase.templateId
          || childSegment.sourceSceneSha256 !== nativeBase.sourceSceneSha256
          || childManifest.output?.sha256 !== nativeBase.childOutputSha256) fail("nativeBaseSources child receipt no longer matches the rendered original OM segment");
      const childSourceSceneRow = (childManifest.sourceScenes || []).find((row) => row.segmentId === nativeBase.childSegmentId);
      if (!childSourceSceneRow || childSourceSceneRow.sha256 !== nativeBase.sourceSceneSha256
          || path.resolve(path.dirname(childManifestPath), childSourceSceneRow.path) !== path.resolve(path.dirname(childManifestPath), childSegment.sourceScenePath)
          || canonical(nativeBase.sourceCueBindings || null) !== canonical(childSegment.sourceCueBindings || null)) {
        fail("nativeBaseSources child receipt does not preserve the source scene and cue-binding identity");
      }
      sourceScenePath = resolveBoundRelativeFile(path.dirname(filmManifestPath), nativeBase.sourceScenePath, "nativeBaseSources source scene path");
      if (path.resolve(path.dirname(childManifestPath), childSegment.sourceScenePath) !== sourceScenePath) fail("nativeBaseSources source scene path differs from the child OM receipt");
      const childOutputPath = resolveBoundRelativeFile(path.dirname(childManifestPath), childManifest.output?.path, "nativeBaseSources child output path");
      if (await hashFileStreaming(childOutputPath) !== nativeBase.childOutputSha256) fail("nativeBaseSources child picture hash differs from its rendered OM receipt");
    } else {
      if (filmSegment.sourceScenePath !== marker.sourceScenePath || filmSegment.sourceSceneSha256 !== marker.sourceSceneSha256) fail("source-premix Film segment source scene differs from its receipt binding");
      sourceScenePath = path.resolve(path.dirname(filmManifestPath), filmSegment.sourceScenePath);
    }
    const sourceSceneBytes = await fs.readFile(sourceScenePath).catch((error) => fail("source-premix original source scene cannot be read: " + error.message));
    if (sha256(sourceSceneBytes) !== marker.sourceSceneSha256) fail("source-premix original source scene hash changed");
    let sourceScene;
    try { sourceScene = JSON.parse(sourceSceneBytes.toString("utf8")); }
    catch (error) { fail("source-premix original source scene is not valid JSON: " + error.message); }
    const runtime = sourceScene.huashuMotionRuntime;
    if (runtime?.format !== "laohu.huashu-native-om-runtime-probe/1"
        || sha256(Buffer.from(canonical(runtime.sourceDeclaration), "utf8")) !== marker.sourceDeclarationSha256
        || runtime.sourceDeclarationSha256 !== marker.sourceDeclarationSha256) fail("source-premix p0 declaration is not the original runtime-probed declaration pinned by the source scene");
    if (isNativeBaseContractV2) {
      const nativeBase = filmManifest.nativeBaseSources.find((row) => row.segmentId === marker.segmentId);
      if (sha256(Buffer.from(canonical(runtime), "utf8")) !== nativeBase.sourceRuntimeProbeSha256
          || canonical(runtime.sourceCueBindings || null) !== canonical(nativeBase.sourceCueBindings || null)) {
        fail("source-premix original OM runtime probe or sourceCueBindings differ from the nativeBaseSources receipt");
      }
    }
    if (marker.sourcePlanSha256 != null
        && (sha256(Buffer.from(canonical(runtime.sourcePlan), "utf8")) !== marker.sourcePlanSha256
          || runtime.sourcePlanSha256 !== marker.sourcePlanSha256)) fail("source-premix score plan differs from its original source scene");
    const runtimeScoreSha256 = runtime.sourceScore?.scoreSha256 || runtime.composer?.scoreSha256 || null;
    if ((runtimeScoreSha256 || null) !== (marker.sourceScoreSha256 || null)) fail("source-premix original ABC score differs from its source scene");
    const receiptRows = (receipt.alignment?.nativeSourceSoundtracks || []).filter((row) => row.segmentId === marker.segmentId);
    if (receiptRows.length !== 1) fail("source-premix receipt must contain exactly one soundtrack row for its segment");
    const sourceRow = receiptRows[0];
    if (sourceRow.trackId !== track.id || sourceRow.assetId !== track.assetId
        || sourceRow.timeMapId !== marker.timeMapId || sourceRow.sourceSceneSha256 !== marker.sourceSceneSha256
        || sourceRow.sourceDeclarationSha256 !== marker.sourceDeclarationSha256
        || sourceRow.sourcePlanSha256 !== marker.sourcePlanSha256
        || (sourceRow.sourceScoreSha256 || null) !== (marker.sourceScoreSha256 || null)
        || sourceRow.outputWav?.sha256 !== marker.assetSha256
        || sourceRow.sourceMixdown?.function !== "sound.mixdown") fail("source-premix plan track differs from the matching source receipt row");
    if (marker.sourceKind != null && sourceRow.kind !== marker.sourceKind) fail("source-premix kind differs from the original soundtrack receipt row");
    if (sourceRow.sourceMusicOff !== Boolean(runtime.sourceDeclaration?.music?.off)) fail("source-premix music-off status differs from the original p0 declaration");
    if (marker.sourceKind === "sfx-only"
        && (runtime.sourceDeclaration?.music?.off !== true || runtime.sourceScore?.scoreText || runtime.composer?.scoreText
          || sourceRow.sourceMusicOff !== true || sourceRow.sourceMixdown?.musicOn !== false
          || sourceRow.sourceMixdown?.scoreSha256 != null || marker.sourceScoreSha256 != null)) {
      fail("SFX-only source-premix must be the original music-off, no-score sound.mixdown branch");
    }
    if (canonical(sourceRow.sourceMixdown) !== canonical(marker.sourceMixdown)
        || canonical(sourceRow.voiceBinding || null) !== canonical(marker.voiceBinding || null)
        || canonical(sourceRow.bakedCanonicalEvents || []) !== canonical(marker.bakedCanonicalEvents || [])) {
      fail("source-premix processing marker differs from its actual original mixdown receipt data");
    }
    const sourceHits = (sourceScene.audioEvents || []).filter((event) => ["declared-sfx", "score-sfx"].includes(event?.sourceAudio?.kind))
      .sort((left, right) => left.sourceAudio.sourceHitOrder - right.sourceAudio.sourceHitOrder);
    const declaredHits = runtime.sourceDeclaration?.hits || [];
    const declaredSourceHits = sourceHits.filter((event) => event.sourceAudio.kind === "declared-sfx");
    const scoreSourceHits = sourceHits.filter((event) => event.sourceAudio.kind === "score-sfx");
    if (declaredSourceHits.length !== declaredHits.length || sourceHits.length !== sourceRow.sourceMixdown.sourceHitCount) fail("source-premix hit count differs from the original p0 declaration or actual mixdown receipt");
    for (const [index, hit] of declaredHits.entries()) {
      const sourceEvent = declaredSourceHits[index];
      const audio = sourceEvent?.sourceAudio;
      const hitOptions = Object.fromEntries(Object.entries(hit).filter(([key]) => !["name", "at", "gain", "pan"].includes(key)));
      if (!audio || audio.sourceHitOrder !== index || audio.name !== hit.name
          || Math.abs(sourceEvent.timeSec - hit.at) > 1 / 48000
          || Math.abs((audio.sourceGain ?? 1) - (hit.gain ?? 1)) > 1e-8
          || Math.abs((audio.sourcePan ?? 0) - (hit.pan ?? 0)) > 1e-8
          || canonical(audio.options || {}) !== canonical(hitOptions)) fail("source-premix canonical hit no longer matches its original p0 SFX declaration at order " + index);
    }
    const composerCues = runtime.composer?.cues || [];
    const expectedComposerHitCount = composerCues.reduce((count, cue) => count + (cue.type === "hit" ? 2 : 1), 0);
    if (scoreSourceHits.length !== expectedComposerHitCount) fail("source-premix score-hit count differs from the original OM composer cue evidence");
    let composerHitIndex = 0;
    composerCues.forEach((cue, cueOrdinal) => {
      const effectCount = cue.type === "hit" ? 2 : 1;
      for (let effectIndex = 0; effectIndex < effectCount; effectIndex += 1) {
        const sourceEvent = scoreSourceHits[composerHitIndex++];
        const audio = sourceEvent?.sourceAudio;
        if (!audio || audio.composerScoreSha256 !== runtime.composer.scoreSha256
            || audio.composerCue?.cueOrdinal !== cueOrdinal || audio.composerCue?.cueType !== cue.type
            || audio.composerCue?.effectIndex !== effectIndex || Math.abs(sourceEvent.timeSec - cue.at) > 1 / 48000) {
          fail("source-premix score hit no longer matches the original OM composer cue evidence");
        }
      }
    });
    const mappedBaked = [];
    for (const sourceEvent of sourceHits) {
      const eventId = sourceEvent.id;
      const bound = (marker.bakedCanonicalEvents || []).find((row) => row.eventId === eventId);
      const canonicalEvent = sceneEvents.get(eventId)?.source;
      if (!bound || !canonicalEvent || canonical(canonicalEvent) !== canonical(sourceEvent)) fail("source-premix hit is missing from the unchanged canonical event scene: " + eventId);
      const filmTimeSec = mapLocalTimeToFilm(sourceEvent.timeSec, planTimeMap);
      if (bound.timeMapId !== marker.timeMapId || Math.abs(bound.sourceTimeSec - sourceEvent.timeSec) > 1e-8
          || Math.abs(bound.filmTimeSec - filmTimeSec) > 1e-8 || bound.name !== sourceEvent.sourceAudio.name
          || bound.sourceHitOrder !== sourceEvent.sourceAudio.sourceHitOrder
          || bound.sourceGain !== sourceEvent.sourceAudio.sourceGain || bound.sourcePan !== sourceEvent.sourceAudio.sourcePan
          || canonical(bound.options) !== canonical(sourceEvent.sourceAudio.options || {})) fail("source-premix canonical event time or source hit metadata differs from the verified source hit: " + eventId);
      mappedBaked.push(bound);
    }
    if (mappedBaked.length !== marker.bakedCanonicalEvents.length) fail("source-premix receipt contains events absent from the original source hit list");
    const bakedReceiptRows = (receipt.alignment?.markAndHitBindings || []).filter((row) => row.kind === "native-om-source-sfx-baked-into-source-mixdown" && row.segmentId === marker.segmentId);
    if (bakedReceiptRows.length !== mappedBaked.length
        || mappedBaked.some((event) => !bakedReceiptRows.some((row) => row.eventId === event.eventId && row.timeMapId === event.timeMapId && row.canonicalFilmTimeSec === event.filmTimeSec))) {
      fail("source-premix baked event receipt does not preserve each canonical event binding");
    }
    if ((plan.events || []).some((event) => mappedBaked.some((row) => row.eventId === (event.eventId || event.id)))) fail("source-premix canonical SFX would be played a second time by audio-plan events");
    const asset = resolved.get(track.assetId);
    if (!asset || asset.actualSha256 !== marker.assetSha256 || asset.actualSha256 !== sourceRow.outputWav.sha256) fail("source-premix soundtrack asset bytes differ from the original mixdown receipt");
    const binding = marker.voiceBinding;
    if (binding) {
      const voiceTrack = (plan.tracks || []).find((row) => row.id === binding.trackId);
      const voiceAsset = voiceTrack && resolved.get(voiceTrack.assetId);
      if (!voiceTrack || voiceTrack.bus !== "voice" || !voiceTrack.locked || voiceTrack.assetId !== binding.assetId
          || !voiceAsset || voiceAsset.actualSha256 !== binding.fileSha256) fail("source-premix locked voice asset differs from the voice file used for source mixdown");
      const windowsSha256 = sha256(Buffer.from(canonical(plan.voiceWindows || []), "utf8"));
      const expectedWords = mappedVoiceWindowsForSource(plan.voiceWindows || [], planTimeMap, marker.sourceDurationSec);
      if (binding.voiceWindowsSha256 !== windowsSha256
          || canonical(binding.mappedWords) !== canonical(expectedWords)
          || canonical(sourceRow.voiceBinding) !== canonical(binding)) fail("source-premix voice file, voiceWindows, or segment-local voice mapping changed since source mixdown");
    } else if ((plan.tracks || []).some((row) => row.bus === "voice") || (plan.voiceWindows || []).length) {
      fail("source-premix was rendered without narration but the current plan contains a voice track or voiceWindows");
    }
    const sourceDuck = marker.sourceMixdown.voiceDuckProcessing || null;
    if (sourceDuck) {
      const expectedDuckWords = binding?.mappedWords || [];
      const expectedVoiceHash = binding?.voiceWindowsSha256 || null;
      if (sourceDuck.applied !== Boolean(marker.sourceMixdown.musicOn && expectedDuckWords.length)
          || sourceDuck.voiceWindowsSha256 !== expectedVoiceHash
          || canonical(sourceDuck.wordWindows || []) !== canonical(expectedDuckWords)) {
        fail("source-premix voice-duck receipt differs from the actual music-on state and segment-local word windows");
      }
    }
    verified.push({
      trackId: track.id, segmentId: marker.segmentId, receiptSha256: marker.receiptSha256,
      assetSha256: marker.assetSha256, voiceTrackId: marker.voiceBinding?.trackId || null,
      sourceVoiceDuckApplied: sourceDuck?.applied ?? null,
      voiceDuckProcessing: sourceDuck ? { ...sourceDuck, verified: true } : null,
      bakedCanonicalEventIds: mappedBaked.map((row) => row.eventId),
    });
  }
  return verified;
}

async function verifyPinnedLocalAudioRuntime(expectedClosureSha256, expectedSourceClosureSha256, expectedCommit) {
  const catalogPath = path.join(skillDir, "templates", "catalog.json");
  const catalogBytes = await fs.readFile(catalogPath).catch((error) => fail("Local template catalog cannot be read for request-generated source-group verification: " + error.message));
  let catalog;
  try { catalog = JSON.parse(catalogBytes.toString("utf8")); }
  catch (error) { fail("Local template catalog is invalid JSON: " + error.message); }
  const source = (catalog.sources || []).find((row) => row.id === "huashu-motion");
  const local = source?.localRuntime;
  if (!source || !local || !Array.isArray(local.files) || !Array.isArray(local.sourceClosurePaths)) {
    fail("Catalog does not pin the local Huashu audio runtime required by request-generated source-group verification");
  }
  if (source.commit !== expectedCommit || local.closureSha256 !== expectedClosureSha256
      || local.sourceClosureSha256 !== expectedSourceClosureSha256) {
    fail("Request-generated source-group source commit/runtime closure differs from the current catalog pin");
  }
  const localClosureSha256 = sha256(Buffer.from(canonical(local.files), "utf8"));
  if (localClosureSha256 !== local.closureSha256) fail("Local audio runtime closure metadata hash is stale");
  const ledger = new Map((source.files || []).map((row) => [row.path, row]));
  const sourceClosure = local.sourceClosurePaths.slice().sort().map((relative) => {
    const row = ledger.get(relative);
    if (!row) fail("Catalog source ledger is missing local audio runtime source member " + relative);
    return { path: relative, sha256: row.sha256, gitBlob: row.gitBlob || null };
  });
  if (sha256(Buffer.from(canonical(sourceClosure), "utf8")) !== local.sourceClosureSha256) {
    fail("Local audio runtime source closure no longer matches its pinned source identity");
  }
  const runtimeRoot = path.join(skillDir, "templates", "runtime");
  const runtimeRootReal = await fs.realpath(runtimeRoot).catch((error) => fail("Local audio runtime directory is unavailable: " + error.message));
  const runtimePaths = [catalogPath];
  for (const row of local.files) {
    if (!row || typeof row.path !== "string" || !row.path.startsWith("templates/runtime/")
        || path.posix.isAbsolute(row.path) || row.path.split("/").includes("..")) fail("Pinned local audio runtime path escaped templates/runtime");
    const full = path.resolve(skillDir, row.path);
    const real = await fs.realpath(full).catch((error) => fail("Pinned local audio runtime file is unavailable: " + row.path + " (" + error.message + ")"));
    if (!containsPath(runtimeRootReal, real)) fail("Pinned local audio runtime file escapes templates/runtime: " + row.path);
    if (await hashFileStreaming(real) !== sha256Field(row.sha256, "local audio runtime " + row.path + ".sha256")) {
      fail("Pinned local audio runtime file hash is stale: " + row.path);
    }
    runtimePaths.push(real);
  }
  return { closureSha256: localClosureSha256, sourceClosureSha256: local.sourceClosureSha256, sourceCommit: source.commit, catalogPath, runtimePaths };
}

function verifyGeneratedGroupEventBindings({ group, receipt, filmManifest, scene, scenePath, filmManifestPath, maps, plan }) {
  const sceneEvents = findSceneAudioEvents(scene);
  const filmBindings = new Map((filmManifest.audioEventBindings || []).map((row) => [row.eventId, row]));
  const sourceScenes = new Map((filmManifest.sourceScenes || []).map((row) => [row.segmentId, row]));
  const filmMaps = new Map((filmManifest.audioTimeMaps || []).map((row) => [row.id, row]));
  const receiptMaps = new Map((receipt.alignment?.timeMaps || []).map((row) => [row.id, row]));
  for (const [idValue, filmMap] of filmMaps) {
    const planMap = maps.get(idValue);
    const receiptMap = receiptMaps.get(idValue);
    if (!planMap || !receiptMap || canonical(planMap) !== canonical(filmMap) || canonical(receiptMap) !== canonical(filmMap)) {
      fail("Request-generated source-group Film timeMap changed in the audio plan or receipt: " + idValue);
    }
  }
  const normalizedBindings = new Map();
  for (const [index, binding] of group.canonicalEventBindings.entries()) {
    if (normalizedBindings.has(binding.eventId)) fail("Request-generated source-group event binding is duplicated: " + binding.eventId);
    const actual = sceneEvents.get(binding.eventId);
    const filmBinding = filmBindings.get(binding.eventId);
    if (!actual || !filmBinding) fail("Request-generated source-group event is absent from the current canonical Film scene/binding: " + binding.eventId);
    const sourceTimeSec = actual.timeSec;
    const timeBasis = actual.timeBasis;
    const timeMapId = filmBinding.timeMapId == null ? null : filmBinding.timeMapId;
    if (actual.owner !== binding.owner || actual.phaseId !== binding.phaseId
        || timeBasis !== binding.sourceTimeBasis || timeBasis !== filmBinding.sourceTimeBasis
        || filmBinding.compiledPhaseId !== binding.phaseId || timeMapId !== (binding.timeMapId ?? null)
        || filmBinding.segmentId !== binding.segmentId || filmBinding.sourceSceneSha256 !== binding.sourceSceneSha256
        || Math.abs(sourceTimeSec - binding.sourceTimeSec) > 1e-8) {
      fail("Request-generated source-group event metadata changed after its source receipt: " + binding.eventId);
    }
    const sourceScene = sourceScenes.get(filmBinding.segmentId);
    if (!sourceScene || sourceScene.sha256 !== filmBinding.sourceSceneSha256) fail("Request-generated source-group event is not tied to its Film sourceScenes entry: " + binding.eventId);
    let filmTimeSec;
    if (timeBasis === "film-global") {
      if (timeMapId) fail("Film-global request-generated source-group event unexpectedly uses a local timeMap: " + binding.eventId);
      filmTimeSec = sourceTimeSec;
    } else if (timeBasis === "scene-local") {
      if (!timeMapId) fail("Scene-local request-generated source-group event has no Film timeMap: " + binding.eventId);
      filmTimeSec = mapLocalTimeToFilm(sourceTimeSec, maps.get(timeMapId));
    } else fail("Request-generated source-group event has an unsupported time basis: " + binding.eventId);
    const tolerance = scene.fps == null ? 1e-8 : 0.5 / number(scene.fps, "scene.fps", { min: 0.001 });
    if (Math.abs(filmTimeSec - binding.filmTimeSec) > tolerance) fail("Request-generated source-group event moved from its canonical Film time: " + binding.eventId);
    normalizedBindings.set(binding.eventId, { ...binding, filmTimeSec, sourceTimeSec, timeBasis, timeMapId });
  }
  const baked = group.bakedCanonicalEvents || [];
  if (baked.length !== group.sourceMixdown?.sourceHitCount) fail("Request-generated source-group hit rows differ from the source mixdown hit count");
  const bindingRows = receipt.alignment?.markAndHitBindings || [];
  for (const event of baked) {
    const binding = normalizedBindings.get(event.eventId);
    if (!binding || event.timeMapId !== (binding.timeMapId ?? null)
        || Math.abs(event.filmTimeSec - binding.filmTimeSec) > 1e-8
        || Math.abs(event.sourceTimeSec - binding.filmTimeSec) > 1e-8) {
      fail("Request-generated baked SFX event differs from its canonical Film event: " + event.eventId);
    }
    const receiptBinding = bindingRows.find((row) => row.kind === "request-generated-source-sfx-baked"
      && row.groupId === group.groupId && row.eventId === event.eventId && row.sourceHitOrder === event.sourceHitOrder);
    if (!receiptBinding || receiptBinding.canonicalFilmTimeSec !== event.filmTimeSec
        || receiptBinding.timeMapId !== event.timeMapId || receiptBinding.soundtrackTrackId !== group.trackId
        || receiptBinding.soundtrackAssetId !== group.assetId) {
      fail("Request-generated source-group baked event receipt omitted or shifted a canonical SFX hit: " + event.eventId + "; receipt=" + JSON.stringify(receiptBinding) + "; baked=" + JSON.stringify(event));
    }
  }
  const bakedReceiptRows = bindingRows.filter((row) => row.kind === "request-generated-source-sfx-baked" && row.groupId === group.groupId);
  if (bakedReceiptRows.length !== baked.length) fail("Request-generated source-group receipt has extra or missing baked SFX event rows");
  void scenePath;
  void filmManifestPath;
  return normalizedBindings;
}

async function verifyRequestGeneratedSourceGroupBindings({ plan, planPath, resolved, scene, scenePath, maps }) {
  const tracks = (plan.tracks || []).filter((track) => track.sourceGeneratedGroup != null);
  if (!tracks.length) return [];
  if (!scene || !scenePath) fail("--scene is required to verify request-generated source-group canonical events");
  const planDirectory = path.dirname(planPath);
  const verified = [];
  for (const track of tracks) {
    const marker = track.sourceGeneratedGroup;
    const receiptPath = resolveBoundRelativeFile(planDirectory, marker.receiptPath, "request-generated source-group receipt path");
    const filmManifestPath = resolveBoundRelativeFile(planDirectory, marker.filmManifestPath, "request-generated source-group Film manifest path");
    const requestPath = resolveBoundRelativeFile(planDirectory, marker.requestPath, "request-generated source-group request path");
    const [receiptFile, filmFile, requestBytes] = await Promise.all([
      readBoundJson(receiptPath, marker.receiptSha256, "request-generated source-group receipt"),
      readBoundJson(filmManifestPath, marker.filmManifestSha256, "request-generated source-group Film manifest"),
      fs.readFile(requestPath).catch((error) => fail("Request-generated source-group request cannot be read: " + error.message)),
    ]);
    if (sha256(requestBytes) !== marker.requestSha256) fail("Request-generated source-group request bytes differ from the producer receipt");
    let request;
    try { request = JSON.parse(requestBytes.toString("utf8")); }
    catch (error) { fail("Request-generated source-group request is invalid JSON: " + error.message); }
    if (sha256(Buffer.from(canonical(request), "utf8")) !== marker.requestCanonicalSha256) fail("Request-generated source-group canonical request hash is stale");
    const receipt = receiptFile.value;
    const filmManifest = filmFile.value;
    if (receipt.format !== "laohu.motion.huashu-audio-receipt/1") fail("Request-generated source-group receipt format is unsupported");
    if (path.resolve(receipt.alignment?.filmManifest || "") !== filmManifestPath) fail("Request-generated source-group receipt points to a different Film manifest");
    const sceneRecord = filmManifest.audioEventScene;
    if (!sceneRecord || sceneRecord.format !== "motion-scene-v1"
        || sceneRecord.sha256 !== marker.canonicalEventSceneSha256
        || path.resolve(path.dirname(filmManifestPath), sceneRecord.path) !== path.resolve(scenePath)) {
      fail("Request-generated source-group canonical event scene is not the exact Film-manifest event scene");
    }
    const actualSceneBytes = await fs.readFile(scenePath).catch((error) => fail("Request-generated source-group canonical event scene cannot be read: " + error.message));
    const actualSceneSha256 = sha256(actualSceneBytes);
    if (actualSceneSha256 !== marker.canonicalEventSceneSha256
        || receipt.alignment?.canonicalEventSceneSha256 !== actualSceneSha256
        || receipt.alignment?.canonicalEventScene?.sha256 !== actualSceneSha256) {
      fail("Request-generated source-group canonical event scene hash differs from the source receipt");
    }
    if (request?.format !== "laohu.motion.huashu-audio-request/2" || !request.musicPreset || request.composition != null
        || request.musicPreset.selectedMusicTrackId != null || request.musicPreset.samples != null
        || (request.musicMixGainDb ?? 0) !== marker.musicGainDb || (request.automation || []).length || request.ducking != null) {
      fail("Request-generated source-group request no longer satisfies the bounded /2 preset route");
    }
    const selectedGroups = receipt.alignment?.requestGeneratedSourceGroups;
    if (!Array.isArray(selectedGroups) || selectedGroups.length !== 1) fail("Request-generated source-group receipt must contain exactly one selected group");
    const group = selectedGroups.find((row) => row.groupId === marker.groupId);
    if (!group || group.format !== REQUEST_GENERATED_SOURCE_GROUP_FORMAT
        || receipt.alignment?.requestGeneratedSourceGroupSelection?.selected !== true
        || !receipt.alignment.requestGeneratedSourceGroupSelection.selectedGroupIds?.includes(marker.groupId)) {
      fail("Request-generated source-group receipt does not confirm this selected group");
    }
    const expectedBindingIds = new Set([
      ...(request.musicPreset.sections || []).map((row) => row.eventId),
      ...(request.musicPreset.dropEventId ? [request.musicPreset.dropEventId] : []),
      ...(request.musicPreset.endEventId ? [request.musicPreset.endEventId] : []),
      ...(request.sfxEvents || []).map((row) => row.eventId),
    ]);
    const actualBindingIds = new Set((group.canonicalEventBindings || []).map((row) => row.eventId));
    if (actualBindingIds.size !== expectedBindingIds.size
        || [...expectedBindingIds].some((eventId) => !actualBindingIds.has(eventId))) {
      fail("Request-generated source-group canonical event bindings do not exactly cover the preset and manual SFX request IDs");
    }
    for (const item of request.sfxEvents || []) {
      const binding = (group.canonicalEventBindings || []).find((row) => row.eventId === item.eventId);
      const manualRoles = (binding?.roles || []).filter((role) => role.kind === "manual-sfx");
      if (!manualRoles.some((role) => role.requestId === item.id && role.name === item.name
          && canonical(role.options || {}) === canonical(item.options || {})
          && role.kit === (item.kit || request.sfxKit || marker.sourceKit)
          && role.seedBasis === "pinned-source-renderSfx-name-index-at")) {
        fail("Request-generated source-group canonical event binding lost a manual SFX request row: " + item.id);
      }
    }
    for (const key of ["groupId", "trackId", "assetId", "requestPath", "requestSha256", "requestCanonicalSha256", "sourceCommit", "localRuntimeClosureSha256", "sourceClosureSha256", "p0Sha256", "sourceKit", "sourceDurationSec", "musicGainDb"]) {
      if (group[key] !== marker[key]) fail("Request-generated source-group marker differs from its receipt field " + key);
    }
    if (canonical(group.request) !== canonical(request)) fail("Request-generated source-group receipt does not retain the exact source request");
    if (canonical(group.sourceMixdown) !== canonical(marker.sourceMixdown)
        || canonical(group.voiceBinding || null) !== canonical(marker.voiceBinding || null)
        || canonical(group.canonicalEventBindings || []) !== canonical(marker.canonicalEventBindings || [])
        || canonical(group.bakedCanonicalEvents || []) !== canonical(marker.bakedCanonicalEvents || [])) {
      fail("Request-generated source-group marker differs from its mixdown, voice, or canonical event receipt data");
    }
    if (sha256(Buffer.from(canonical(group.sourceP0), "utf8")) !== marker.p0Sha256) fail("Request-generated source-group source p0 hash is stale");
    const p0 = group.sourceP0;
    if (!p0 || p0.duration !== plan.durationSec || p0.voice !== Boolean(marker.voiceBinding)
        || !p0.music || p0.music.product !== (request.musicPreset.product || undefined)
        || p0.music.style !== (request.musicPreset.style || undefined)) fail("Request-generated source-group p0 no longer matches the requested preset/duration/voice mode");
    const sourcePlanSummary = group.sourcePlanSummary || {};
    if (sourcePlanSummary.kit !== marker.sourceKit) fail("Request-generated source-group source kit differs between plan, receipt, and actual source score.plan");
    if (request.keyContext != null && (sourcePlanSummary.root !== request.keyContext.rootMidi || sourcePlanSummary.scale !== request.keyContext.scale)) {
      fail("Request-generated source-group source key differs from the explicit request keyContext");
    }
    if (request.musicPreset.keyMidi != null && sourcePlanSummary.root !== request.musicPreset.keyMidi) fail("Request-generated source-group source root differs from musicPreset.keyMidi");
    if (request.musicPreset.scale != null && sourcePlanSummary.scale !== request.musicPreset.scale) fail("Request-generated source-group source scale differs from musicPreset.scale");
    const runtimePin = await verifyPinnedLocalAudioRuntime(marker.localRuntimeClosureSha256, marker.sourceClosureSha256, marker.sourceCommit);
    const groupAsset = resolved.get(track.assetId);
    if (!groupAsset || groupAsset.actualSha256 !== marker.assetSha256 || groupAsset.actualSha256 !== group.outputWav?.sha256
        || groupAsset.source?.outputKind !== "request-generated-source-group-stereo-soundtrack") {
      fail("Request-generated source-group WAV bytes or output kind differ from its producer receipt");
    }
    if (group.outputWav.frames !== Math.round(plan.durationSec * 48000)
        || Math.abs(group.outputWav.durationSec - plan.durationSec) > 1 / 48000) fail("Request-generated source-group WAV does not cover the full film clock");
    const expectedHitRows = [];
    const requestHits = new Map();
    for (const [index, item] of (request.sfxEvents || []).entries()) {
      if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.id !== "string" || typeof item.eventId !== "string") {
        fail("Request-generated source-group request.sfxEvents[" + index + "] is invalid");
      }
      if (item.seed != null || Number(item.mixGainDb || 0) !== 0) fail("Request-generated source-group cannot bake custom per-hit seeds or post-mix SFX gain");
      const prior = requestHits.get(item.id);
      if (prior && canonical(prior) !== canonical(item)) fail("Request-generated source-group request repeats an SFX ID with conflicting controls");
      requestHits.set(item.id, item);
    }
    const baked = group.bakedCanonicalEvents || [];
    if (requestHits.size !== baked.length) fail("Request-generated source-group request SFX count differs from the baked hit count");
    for (const [index, event] of baked.entries()) {
      const item = requestHits.get(event.requestId);
      if (!item || item.eventId !== event.eventId || item.name !== event.name
          || canonical(item.options || {}) !== canonical(event.options)
          || (item.sourceGain == null ? 1 : item.sourceGain) !== event.sourceGain
          || (item.sourcePan == null ? 0 : item.sourcePan) !== event.sourcePan
          || (item.kit != null && item.kit !== event.kit)
          || event.kit !== marker.sourceKit || event.sourceHitOrder !== index) {
        fail("Request-generated source-group baked hit no longer matches its declared request row/order: " + event.requestId);
      }
      expectedHitRows.push({ ...(item.options || {}), name: item.name, at: event.filmTimeSec, gain: item.sourceGain == null ? 1 : item.sourceGain, pan: item.sourcePan == null ? 0 : item.sourcePan });
    }
    if (canonical(p0.hits || []) !== canonical(expectedHitRows)) fail("Request-generated source-group p0 hits differ from the canonical request event mapping");
    const preset = request.musicPreset;
    const mappedById = new Map((group.canonicalEventBindings || []).map((binding) => [binding.eventId, binding]));
    const labels = {}, energy = {};
    for (const section of preset.sections || []) {
      const binding = mappedById.get(section.eventId);
      if (!binding) fail("Request-generated source-group preset section lacks a canonical Film event mapping: " + section.eventId);
      labels["scene:" + section.eventId] = binding.filmTimeSec;
      if (section.energy != null) energy[section.eventId] = section.energy;
    }
    const expectedMusic = {
      ...(preset.product ? { product: preset.product } : { style: preset.style }),
      ...(preset.variant == null ? {} : { variant: preset.variant }),
      seed: preset.seed == null ? p0.id : preset.seed,
      ...(preset.bpm == null ? {} : { bpm: preset.bpm }),
      ...(preset.keyMidi == null && request.keyContext == null ? {} : { key: preset.keyMidi == null ? request.keyContext.rootMidi : preset.keyMidi }),
      ...(preset.scale == null && request.keyContext == null ? {} : { scale: preset.scale || request.keyContext.scale }),
      ...(preset.loop == null ? {} : { loop: preset.loop }),
      ...(preset.motif == null ? {} : { motif: preset.motif }),
      ...(preset.rhythm == null ? {} : { rhythm: preset.rhythm }),
      ...(preset.ending == null ? {} : { ending: preset.ending }),
      ...(preset.suck == null ? {} : { suck: preset.suck }),
      ...(preset.floor == null ? {} : { floor: preset.floor }),
      ...(Object.keys(energy).length ? { energy } : {}),
      ...(preset.dropEventId == null ? {} : { drop: preset.dropEventId }),
      ...(preset.endEventId == null ? {} : { end: mappedById.get(preset.endEventId)?.filmTimeSec }),
    };
    const expectedP0 = { id: p0.id, duration: plan.durationSec, labels, music: expectedMusic, voice: Boolean(marker.voiceBinding), hits: expectedHitRows };
    if (canonical(p0) !== canonical(expectedP0)) fail("Request-generated source-group p0 differs from the bounded request plus canonical Film event mapping");
    const voiceBinding = marker.voiceBinding;
    if (voiceBinding) {
      const voiceTrack = (plan.tracks || []).find((row) => row.id === voiceBinding.trackId);
      const voiceAsset = voiceTrack && resolved.get(voiceTrack.assetId);
      if (!voiceTrack || voiceTrack.bus !== "voice" || !voiceTrack.locked || !voiceAsset
          || voiceAsset.actualSha256 !== voiceBinding.fileSha256 || voiceTrack.assetId !== voiceBinding.assetId
          || canonical(voiceBinding.voiceWindows) !== canonical(plan.voiceWindows || [])) {
        fail("Request-generated source-group narration asset or voiceWindows differ from the separate locked voice input");
      }
    }
    const groupMixdown = marker.sourceMixdown;
    const expectedDuckWords = voiceBinding
      ? mappedVoiceWindowsForSource(plan.voiceWindows || [], { filmStartSec: 0, speed: 1 }, plan.durationSec)
      : [];
    const sourceDuck = groupMixdown.voiceDuckProcessing || null;
    if (sourceDuck && (typeof sourceDuck.applied !== "boolean" || !Array.isArray(sourceDuck.wordWindows)
        || sourceDuck.applied !== Boolean(groupMixdown.musicOn && expectedDuckWords.length)
        || sourceDuck.voiceWindowsSha256 !== (voiceBinding?.voiceWindowsSha256 || null)
        || canonical(sourceDuck.wordWindows) !== canonical(expectedDuckWords))) {
      fail("Request-generated source-group voice-duck receipt differs from its music-on state or canonical full-film voiceWindows");
    }
    verifyGeneratedGroupEventBindings({ group, receipt, filmManifest, scene, scenePath, filmManifestPath, maps, plan });
    verified.push({
      groupId: marker.groupId, trackId: track.id, assetId: track.assetId,
      receiptPath, receiptSha256: marker.receiptSha256, requestPath, requestSha256: marker.requestSha256,
      sourceP0Sha256: marker.p0Sha256, sourceCommit: runtimePin.sourceCommit,
      localRuntimeClosureSha256: runtimePin.closureSha256, sourceClosureSha256: runtimePin.sourceClosureSha256,
      runtimePaths: runtimePin.runtimePaths,
      sourceHitCount: baked.length, canonicalEventIds: [...new Set(baked.map((event) => event.eventId))],
      voiceTrackId: voiceBinding?.trackId || null, narrationIncludedInBakedAsset: false,
      voiceWindowsSha256: voiceBinding?.voiceWindowsSha256 || null,
      sourceVoiceDuckApplied: sourceDuck?.applied ?? null,
      voiceDuckProcessing: sourceDuck ? { ...sourceDuck, verified: true } : null,
    });
  }
  return verified;
}

function tempoChain(speed) {
  let remaining = speed;
  const chain = [];
  while (remaining > 2) { chain.push("atempo=2"); remaining /= 2; }
  while (remaining < 0.5) { chain.push("atempo=0.5"); remaining /= 0.5; }
  if (Math.abs(remaining - 1) > 1e-8) chain.push("atempo=" + remaining);
  return chain;
}
function envelopeExpression(window) {
  const t = "t";
  const start = window.startSec;
  const end = window.endSec;
  const attack = Math.max(0, window.attackSec || 0);
  const release = Math.max(0, window.releaseSec || 0);
  const preRoll = Math.max(0, window.preRollSec || 0);
  const hold = Math.max(0, window.holdSec || 0);
  const attackStart = start - preRoll;
  const releaseStart = end + hold;
  const attackExpr = attack > 0
    ? "if(lt(" + t + "," + (attackStart + attack) + "),max(0,(" + t + "-" + attackStart + ")/" + attack + "),1)"
    : "1";
  const releaseExpr = release > 0
    ? "if(gt(" + t + "," + releaseStart + "),max(0,1-(" + t + "-" + releaseStart + ")/" + release + "),1)"
    : "if(gt(" + t + "," + releaseStart + "),0,1)";
  return "if(lt(" + t + "," + attackStart + "),0,min(" + attackExpr + "," + releaseExpr + "))";
}
function automationDeltaDb(item, track) {
  if (Object.prototype.hasOwnProperty.call(item, "gainDb")) return item.gainDb;
  if (Object.prototype.hasOwnProperty.call(item, "deltaGainDb")) return item.deltaGainDb;
  return item.targetGainDb - (track.gainDb == null ? 0 : track.gainDb);
}
function automationAppliesToTrack(item, track) {
  if (item.trackId != null) return item.trackId === track.id;
  return Object.prototype.hasOwnProperty.call(item, "gainDb") || Object.prototype.hasOwnProperty.call(item, "deltaGainDb");
}
function automationManifestRows(plan, track) {
  const baseGainDb = track.gainDb == null ? 0 : track.gainDb;
  return (plan.automation || []).filter((item) => item.bus === "music" && automationAppliesToTrack(item, track)).map((item) => {
    const field = Object.prototype.hasOwnProperty.call(item, "gainDb") ? "gainDb"
      : Object.prototype.hasOwnProperty.call(item, "deltaGainDb") ? "deltaGainDb" : "targetGainDb";
    const applied = !track.locked;
    const appliedDeltaDb = applied ? automationDeltaDb(item, track) : null;
    return {
      id: item.id || null,
      eventId: item.eventId || null,
      field,
      requestedValueDb: item[field],
      baseGainDb,
      appliedDeltaDb,
      sourceGainWithThisEntryOnlyDb: applied ? baseGainDb + appliedDeltaDb : null,
      sourceGainScope: applied
        ? "this-entry-only-at-full-automation-envelope; excludes-other-automation-ducking-track-fades-and-other-tracks"
        : "not-applied-locked-track",
      startSec: item.startSec,
      endSec: item.endSec,
      fadeInSec: item.fadeInSec || 0,
      fadeOutSec: item.fadeOutSec || 0,
      applied,
      interpretation: field === "gainDb" ? "legacy-additive-delta" : field === "deltaGainDb" ? "explicit-additive-delta" : "target-applied-source-track-gain",
    };
  });
}
function automationExpression(items, track) {
  if (!items || items.length === 0) return "0";
  return items.map((item) => {
    const rise = item.fadeInSec > 0 ? "min(1,max(0,(t-" + item.startSec + ")/" + item.fadeInSec + "))" : "1";
    const fall = item.fadeOutSec > 0 ? "min(1,max(0,(" + item.endSec + "-t)/" + item.fadeOutSec + "))" : "1";
    return "if(between(t," + item.startSec + "," + item.endSec + ")," + automationDeltaDb(item, track) + "*min(" + rise + "," + fall + "),0)";
  }).join("+");
}
function volumeFilter(item, plan) {
  const baseDb = item.gainDb == null ? 0 : item.gainDb;
  const expressions = [String(baseDb)];
  if (item.bus === "music" && !item.locked) {
    const automation = automationExpression((plan.automation || []).filter((entry) => entry.bus === "music" && automationAppliesToTrack(entry, item)), item);
    if (automation !== "0") expressions.push("(" + automation + ")");
    if (plan.ducking && (plan.voiceWindows || []).length) {
      const windows = plan.voiceWindows.map((window) => envelopeExpression({
        ...window,
        attackSec: plan.ducking.attackSec,
        releaseSec: plan.ducking.releaseSec,
        preRollSec: plan.ducking.preRollSec,
        holdSec: plan.ducking.holdSec,
      }));
      const duck = windows.reduce((result, expression) => result ? "max(" + result + "," + expression + ")" : expression, "");
      expressions.push("(" + plan.ducking.targetGainDb + "*" + duck + ")");
    }
  }
  if (expressions.length === 1 && baseDb === 0) return null;
  return "volume='pow(10,(" + expressions.join("+") + ")/20)':eval=frame";
}

function resolveAsset(assetId, plan, indexed, indexDir, planDir) {
  const project = (plan.assets || []).find((asset) => asset.id === assetId);
  const generated = (plan.generatedAssets || []).find((asset) => asset.id === assetId);
  const indexedAsset = indexed.get(assetId);
  const matches = [project, generated, indexedAsset].filter(Boolean);
  if (matches.length === 0) fail("Missing audio asset ID: " + assetId);
  if (matches.length > 1) fail("Audio asset ID " + assetId + " is ambiguous across index/plan sources");
  if (generated) {
    return {
      ...generated,
      kind: "generated",
      durationSec: generated.recipe.durationSec,
      // Recipe output has not been auditioned. Review claims on generatedAssets
      // are rejected during validation; a reviewed WAV must use plan.assets.
      reviewStatus: "generated-unreviewed",
      license: generated.license || "generated-by-project",
      redistribution: generated.redistribution || {
        status: "project-generated",
        basis: "Generated locally from the declared FFmpeg lavfi recipe; no source audio file is bundled.",
      },
    };
  }
  const asset = project || indexedAsset;
  const root = project ? planDir : indexDir;
  const file = path.resolve(root, asset.file);
  if (!project && !file.startsWith(path.resolve(indexDir) + path.sep)) fail("Indexed asset " + assetId + " escapes the index directory");
  number(asset.durationSec, "asset " + assetId + ".durationSec", { min: 0.000001 });
  validateRights(asset, "asset " + assetId);
  return { ...asset, kind: project ? "project" : "indexed", absoluteFile: file };
}
function validateAssetUse(asset, allowCandidate, allowGeneratedPreview) {
  validateRights(asset, "asset " + asset.id);
  if (asset.reviewStatus === "ready") return;
  const generatedRoute = asset.kind === "generated"
    || (asset.kind === "project" && asset.redistribution.status === "project-generated");
  if (asset.reviewStatus === "generated-unreviewed" && generatedRoute && allowGeneratedPreview) return;
  if (asset.reviewStatus === "generated-unreviewed" && generatedRoute) fail("Asset " + asset.id + " is generated-unreviewed; --allow-generated-preview is required for a technical preview");
  if (asset.reviewStatus === "candidate-unreviewed" && allowCandidate) return;
  if (asset.reviewStatus === "candidate-unreviewed") fail("Asset " + asset.id + " is candidate-unreviewed; --allow-candidate is required for a technical preview");
  fail("Asset " + asset.id + " has a reviewStatus that is not allowed for this route: " + asset.reviewStatus);
}
function validateAssetApplicability(asset, usage, indexedAssets) {
  const actualSha = asset.actualSha256;
  const sourceIn = usage.sourceInSec == null ? 0 : number(usage.sourceInSec, "source range start", { min: 0 });
  const sourceOut = usage.sourceOutSec == null
    ? number(asset.durationSec, "asset " + asset.id + ".durationSec", { min: 0.000001 })
    : number(usage.sourceOutSec, "source range end", { min: 0.000001 });
  if (sourceOut <= sourceIn) fail("Asset " + asset.id + " has a non-positive selected source range");
  const records = [];
  const sources = [asset, ...indexedAssets.values()];
  const seen = new Set();
  for (const source of sources) {
    const exclusions = source.applicabilityExclusions;
    if (exclusions == null) continue;
    if (!Array.isArray(exclusions)) {
      if (source.id === asset.id) fail("Asset " + asset.id + " has invalid applicabilityExclusions; refusing use");
      continue;
    }
    for (const record of exclusions) {
      const sameOwner = source.id === asset.id;
      const hash = typeof record?.fileSha256 === "string" ? record.fileSha256.toLowerCase() : null;
      if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
        if (sameOwner) fail("Asset " + asset.id + " has a malformed negative applicability record; refusing use");
        continue;
      }
      if (hash !== actualSha.toLowerCase()) continue;
      const key = canonical(record);
      if (!seen.has(key)) { records.push(record); seen.add(key); }
    }
  }
  for (const record of records) {
    if (record.reviewerType !== "human") continue;
    const range = record.sourceRange;
    if (!range || typeof range !== "object" || Array.isArray(range)) fail("Asset " + asset.id + " has a malformed negative applicability source range; refusing use");
    const rejectedIn = number(range.inSec, "applicabilityExclusion.sourceRange.inSec", { min: 0 });
    const rejectedOut = number(range.outSec, "applicabilityExclusion.sourceRange.outSec", { min: 0.000001 });
    if (rejectedOut <= rejectedIn) fail("Asset " + asset.id + " has an invalid negative applicability source range; refusing use");
    if (!(sourceIn < rejectedOut && rejectedIn < sourceOut)) continue;
    const useCase = record.useCase;
    if (useCase === "all") {
      fail("Asset " + asset.id + " is rejected for all uses over source range [" + rejectedIn + ", " + rejectedOut + "]: " + (record.reason || "human applicability feedback"));
    }
    if (!MUSIC_USE_CASES.has(useCase)) fail("Asset " + asset.id + " has an unsupported negative applicability useCase; refusing use");
    if (!usage.useCase) {
      fail("Asset " + asset.id + " overlaps a human rejection for useCase " + useCase + "; add a canonical track.useCase to prove this use is outside the rejection");
    }
    if (!MUSIC_USE_CASES.has(usage.useCase)) fail("track " + usage.id + ".useCase must be one of the canonical music use cases");
    if (usage.useCase === useCase) {
      fail("Asset " + asset.id + " is rejected for useCase " + useCase + " over source range [" + rejectedIn + ", " + rejectedOut + "]: " + (record.reason || "human applicability feedback"));
    }
  }
}
function formatNumber(value) { return Number(value.toFixed(9)).toString(); }
function clipForEvent(item, asset) {
  const cue = item.cue;
  const sourceIn = cue.sourceInSec == null ? 0 : cue.sourceInSec;
  const sourceOut = cue.sourceOutSec == null ? asset.durationSec : cue.sourceOutSec;
  if (sourceOut <= sourceIn || sourceOut > asset.durationSec + 1e-8) fail("cue " + cue.id + " source range is invalid for " + asset.id);
  const hit = cue.hitTimeSec == null ? (asset.hitTimeSec == null ? 0 : asset.hitTimeSec) : number(cue.hitTimeSec, "cue " + cue.id + ".hitTimeSec", { min: 0 });
  if (hit < sourceIn - 1e-8 || hit > sourceOut + 1e-8) fail("cue " + cue.id + " hitTimeSec is outside its selected source range");
  const speed = cue.speed == null ? 1 : cue.speed;
  return { sourceIn, sourceOut, hitTimeSec: hit, speed, startFilmSec: item.filmTimeSec - (hit - sourceIn) / speed };
}
function clipForTrack(track, asset, maps) {
  let startSec = track.startSec;
  let speed = track.speed == null ? 1 : track.speed;
  if (track.timeMapId) {
    const mapping = maps.get(track.timeMapId);
    startSec = mapLocalTimeToFilm(startSec, mapping);
    speed *= mapping.speed;
  }
  const sourceIn = track.sourceInSec == null ? 0 : track.sourceInSec;
  const sourceOut = track.sourceOutSec == null ? asset.durationSec : track.sourceOutSec;
  if (sourceOut <= sourceIn || sourceOut > asset.durationSec + 1e-8) fail("track " + track.id + " source range is invalid for " + asset.id);
  return { sourceIn, sourceOut, speed, startFilmSec: startSec };
}

function buildAudioGraph(plan, rows) {
  const durationSec = plan.durationSec;
  const chains = [];
  const byBus = { sfx: [], music: [], voice: [] };
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const clip = row.clip;
    const filters = ["atrim=start=" + formatNumber(clip.sourceIn) + ":end=" + formatNumber(clip.sourceOut), "asetpts=PTS-STARTPTS"]
      .concat(tempoChain(clip.speed), ["aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo"]);
    const {highpassHz, vocalPocket, pan} = row.item;
    if (highpassHz !== undefined) filters.push("highpass=f=" + highpassHz);
    if (vocalPocket) filters.push(`equalizer=f=${vocalPocket.freqHz}:t=q:w=${vocalPocket.widthQ}:g=${vocalPocket.gainDb}`);
    if (pan !== undefined && pan !== 0) {
      filters.push(`pan=stereo|c0=${Math.min(1, 1-pan)}*c0|c1=${Math.min(1, 1+pan)}*c1`);
    }
    const outputDuration = (clip.sourceOut - clip.sourceIn) / clip.speed;
    const envelope = row.item.envelope || {};
    const attack = Math.min(envelope.attackSec || 0, outputDuration);
    const release = Math.min(envelope.releaseSec || 0, outputDuration);
    if (attack > 0) filters.push("afade=t=in:st=0:d=" + formatNumber(attack));
    if (release > 0) filters.push("afade=t=out:st=" + formatNumber(Math.max(0, outputDuration - release)) + ":d=" + formatNumber(release));
    const delaySamples = Math.max(0, secondsToSamples(clip.startFilmSec));
    filters.push("adelay=delays=" + delaySamples + "S|" + delaySamples + "S");
    const volume = volumeFilter(row.item, plan);
    if (volume) filters.push(volume);
    filters.push("apad=whole_dur=" + formatNumber(durationSec));
    const label = "src" + index;
    chains.push("[" + index + ":a:0]" + filters.join(",") + "[" + label + "]");
    byBus[row.bus].push(label);
  }
  const busLabels = [];
  for (const bus of ["sfx", "music", "voice"]) {
    const sources = byBus[bus];
    if (!sources.length) continue;
    const label = "bus_" + bus;
    if (sources.length === 1) chains.push("[" + sources[0] + "]anull[" + label + "]");
    else chains.push(sources.map((source) => "[" + source + "]").join("") + "amix=inputs=" + sources.length + ":duration=longest:normalize=0[" + label + "]");
    busLabels.push(label);
  }
  if (!busLabels.length) return { filter: null, output: null, busLabels: [] };
  if (busLabels.length === 1) chains.push("[" + busLabels[0] + "]anull[mix]");
  else chains.push(busLabels.map((label) => "[" + label + "]").join("") + "amix=inputs=" + busLabels.length + ":duration=longest:normalize=0[mix]");
  return { filter: chains.join(";"), output: "mix", busLabels };
}
async function ensureGeneratedAsset(asset, cacheDir, ffmpeg, env) {
  const recipeHash = sha256(Buffer.from(canonical(asset.recipe)));
  const target = path.join(cacheDir, "generated-" + recipeHash + ".wav");
  const metadataPath = target + ".json";
  try {
    const [cached, metadataText] = await Promise.all([fs.readFile(target), fs.readFile(metadataPath, "utf8")]);
    const metadata = JSON.parse(metadataText);
    const wave = inspectGeneratedWave(cached, asset.recipe.durationSec);
    if (metadata.schemaVersion === 1 && metadata.recipeSha256 === recipeHash && metadata.fileSha256 === sha256(cached)
      && metadata.sampleRate === 48000 && metadata.channels === 2 && metadata.frames === wave.frames) return target;
  } catch {}
  const temp = target + "." + process.pid + "." + Date.now() + ".part.wav";
  const recipe = asset.recipe;
  const duration = recipe.durationSec;
  const gain = 10 ** ((recipe.gainDb || 0) / 20);
  let input;
  if (recipe.kind === "tone") {
    const start = recipe.frequencyHz;
    const end = recipe.endFrequencyHz == null ? start : recipe.endFrequencyHz;
    const phase = end === start ? String(start) + "*t" : String(start) + "*t+(" + (end - start) + ")*t*t/(2*" + duration + ")";
    input = "aevalsrc=" + gain + "*sin(2*PI*(" + phase + ")):s=48000:d=" + duration;
  } else {
    const seed = recipe.seed == null ? parseInt(recipeHash.slice(0, 8), 16) : recipe.seed;
    input = "anoisesrc=color=" + (recipe.color || "white") + ":amplitude=" + gain + ":duration=" + duration + ":sample_rate=48000:seed=" + seed;
  }
  const filters = ["aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"];
  const envelope = recipe.envelope || {};
  const attack = Math.min(envelope.attackSec || 0, duration);
  const release = Math.min(envelope.releaseSec || 0, duration);
  if (attack > 0) filters.push("afade=t=in:st=0:d=" + attack);
  if (release > 0) filters.push("afade=t=out:st=" + Math.max(0, duration - release) + ":d=" + release);
  run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", input, "-t", String(duration), "-af", filters.join(","), "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", temp], "FFmpeg recipe generation", env);
  const generated = await fs.readFile(temp);
  const wave = inspectGeneratedWave(generated, duration);
  const fileSha = sha256(generated);
  await fs.rename(temp, target);
  await writeJsonAtomically(metadataPath, {
    schemaVersion: 1,
    recipeSha256: recipeHash,
    fileSha256: fileSha,
    sampleRate: 48000,
    channels: 2,
    frames: wave.frames,
  }, true);
  return target;
}

export function inspectGeneratedWave(buffer, expectedDurationSec) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    fail("Generated recipe cache is not a RIFF/WAVE file");
  }
  let offset = 12;
  let format = null;
  let ieeeFloat = false;
  let channels = null;
  let sampleRate = null;
  let byteRate = null;
  let blockAlign = null;
  let bitsPerSample = null;
  let dataLength = null;
  while (offset + 8 <= buffer.length) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length) fail("Generated recipe cache has a truncated WAV chunk");
    if (name === "fmt ") {
      if (size < 16) {
        ieeeFloat = false;
      } else {
        format = buffer.readUInt16LE(offset + 8);
        channels = buffer.readUInt16LE(offset + 10);
        sampleRate = buffer.readUInt32LE(offset + 12);
        byteRate = buffer.readUInt32LE(offset + 16);
        blockAlign = buffer.readUInt16LE(offset + 20);
        bitsPerSample = buffer.readUInt16LE(offset + 22);
        ieeeFloat = format === 3;
        if (format === 0xfffe && size >= 40) {
          const extensionSize = buffer.readUInt16LE(offset + 24);
          const validBitsPerSample = buffer.readUInt16LE(offset + 26);
          const ieeeFloatSubformat = Buffer.from("0300000000001000800000aa00389b71", "hex");
          ieeeFloat = extensionSize >= 22 && 18 + extensionSize <= size && validBitsPerSample === 32
            && buffer.subarray(offset + 32, offset + 48).equals(ieeeFloatSubformat);
        }
      }
    } else if (name === "data") {
      dataLength = size;
      break;
    }
    offset += 8 + size + (size & 1);
  }
  if (!ieeeFloat || channels !== 2 || sampleRate !== 48000 || byteRate !== 384000 || blockAlign !== 8
      || bitsPerSample !== 32 || dataLength == null || dataLength % 8 !== 0) {
    fail("Generated recipe cache must be 48 kHz stereo float PCM");
  }
  const frames = dataLength / 8;
  const expectedFrames = secondsToSamples(expectedDurationSec, sampleRate);
  if (Math.abs(frames - expectedFrames) > 1) fail("Generated recipe cache duration does not match its recipe");
  return { frames, sampleRate, channels };
}

// Both passes read the same unmastered float mix. Re-meter the resampled deliverable.
function masterMix(ffmpeg, input, output, target, env) {
  const base = `loudnorm=I=${target.targetLufs}:TP=${target.truePeakDbtp}:LRA=${target.lra}`;
  function pass(file, filter, destination) {
    const args = ["-nostdin", "-hide_banner", "-nostats", "-y", "-i", file, "-af", filter + ":print_format=json"];
    if (destination) args.push("-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", destination);
    else args.push("-f", "null", "-");
    const log = run(ffmpeg, args, "FFmpeg loudnorm", env).stderr;
    const json = log.match(/\{\s*"input_i"[^{}]*\}/);
    if (!json) fail("FFmpeg loudnorm did not return measurements");
    return JSON.parse(json[0]);
  }
  const measured = pass(input, base);
  if (!["input_i","input_tp","input_lra","input_thresh","target_offset"].every(key => Number.isFinite(Number(measured[key])))) {
    fail("masterLoudnorm cannot measure this silent, short or below-gate mix; keep its original level or revise the programme");
  }
  const filter = base + `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  const rendered = pass(input, filter, output);
  const actual = pass(output, base);
  const integratedLufs = Number(actual.input_i), truePeakDbtp = Number(actual.input_tp);
  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbtp) || Math.abs(integratedLufs-target.targetLufs)>1 || truePeakDbtp>target.truePeakDbtp) {
    fail(`masterLoudnorm output out of specification: ${integratedLufs} LUFS-I, ${truePeakDbtp} dBTP; revise the mix or target`);
  }
  return {target, measured, filter, mode: rendered.normalization_type, output: {integratedLufs, truePeakDbtp}};
}

export async function renderAudioPlan(args) {
  const planText = await fs.readFile(args.plan, "utf8");
  const indexText = await fs.readFile(args.assetIndex, "utf8");
  const plan = JSON.parse(planText);
  const index = JSON.parse(indexText);
  const validated = validatePlan(plan, { allowLegacyReplay: Boolean(args.legacyReplay) });
  const audioPolicy = await verifyAudioPolicyRequest(plan, args.plan, validated.audioPolicy);
  const asrcutInfo = await verifyAsrcutBinding(plan, args.plan);
  if ((plan.events || []).length && !args.scene) fail("--scene is required so cues resolve against their shared event source");
  const scene = args.scene ? JSON.parse(await fs.readFile(args.scene, "utf8")) : null;
  const eventBoundAutomation = (plan.automation || []).filter((item) => item.eventId != null);
  if (eventBoundAutomation.length && !scene) fail("--scene is required to resolve event-bound music automation");
  if (eventBoundAutomation.length) {
    const sceneEvents = findSceneAudioEvents(scene);
    for (const item of eventBoundAutomation) {
      if (!sceneEvents.has(item.eventId)) fail("automation " + (item.id || "?") + ".eventId references missing shared audio event " + item.eventId);
    }
  }
  const eventRows = scene ? mapSceneEvents(plan, scene, validated.maps) : [];
  if (scene && eventRows.some((item) => item.sourceEvent.timeBasis === "scene-local")) {
    number(scene.duration, "scene.duration", { min: 0.001 });
    for (const item of eventRows) {
      if (item.sourceEvent.timeBasis === "scene-local" && item.sourceEvent.timeSec > scene.duration + 1e-8) {
        fail("scene-local event " + item.eventId + " falls beyond scene.duration");
      }
    }
  }
  if (scene && eventRows.some((item) => item.sourceEvent.timeBasis === "film-global")) {
    const sceneDuration = number(scene.duration, "scene.duration", { min: 0.001 });
    if (sceneDuration + 1e-8 < plan.durationSec) fail("film-global scene duration is shorter than the audio plan duration");
  }
  const indexed = indexAssets(index);
  const indexDir = path.dirname(args.assetIndex);
  const planDir = path.dirname(args.plan);
  const resolved = new Map();
  const assetIds = [...(plan.events || []).map((entry) => entry.assetId), ...(plan.tracks || []).map((entry) => entry.assetId)];
  for (const assetId of assetIds) if (!resolved.has(assetId)) resolved.set(assetId, resolveAsset(assetId, plan, indexed, indexDir, planDir));
  for (const asset of resolved.values()) {
    validateAssetUse(asset, args.allowCandidate, args.allowGeneratedPreview);
    if (asset.kind !== "generated") {
      const buffer = await fs.readFile(asset.absoluteFile);
      asset.actualSha256 = sha256(buffer);
      if (!asset.sha256 || asset.actualSha256.toLowerCase() !== asset.sha256.toLowerCase()) {
        fail("SHA-256 mismatch for " + asset.id + ": expected " + (asset.sha256 || "missing") + ", got " + asset.actualSha256);
      }
    }
  }
  const assetUses = [
    ...(plan.events || []).map((event) => ({ ...event, useType: "cue", usageLabel: "cue " + event.id })),
    ...(plan.tracks || []).map((track) => ({ ...track, useType: "track", usageLabel: "track " + track.id })),
  ];
  for (const usage of assetUses) {
    const asset = resolved.get(usage.assetId);
    if (asset?.kind !== "generated") validateAssetApplicability(asset, usage, indexed);
  }
  const sourcePremixBindings = await verifyNativeSourcePremixBindings({
    plan, planPath: args.plan, resolved, scene, scenePath: args.scene, maps: validated.maps,
  });
  const requestGeneratedSourceGroupBindings = await verifyRequestGeneratedSourceGroupBindings({
    plan, planPath: args.plan, resolved, scene, scenePath: args.scene, maps: validated.maps,
  });

  const inputPaths = [args.plan, args.assetIndex, args.scene, args.video,
    ...((audioPolicy.requestPaths || (audioPolicy.requestPath ? [audioPolicy.requestPath] : [])).map((requestPath) => path.resolve(path.dirname(args.plan), requestPath))),
    ...(asrcutInfo?.evidencePaths || []),
    ...requestGeneratedSourceGroupBindings.flatMap((row) => [row.receiptPath, row.requestPath, ...row.runtimePaths]),
    ...[...resolved.values()].filter((asset) => asset.absoluteFile).map((asset) => asset.absoluteFile)].filter(Boolean);
  const outputPaths = [args.output, args.manifest, args.finalOutput].filter(Boolean);
  await preflightPaths({ inputs: inputPaths, outputs: outputPaths, cacheDir: args.cacheDir, overwrite: args.overwrite });

  const ffmpegPath = args.ffmpeg || process.env.MOTION_FFMPEG || "ffmpeg";
  if (path.isAbsolute(ffmpegPath)) await fs.access(ffmpegPath);
  const ffmpegVersion = run(ffmpegPath, ["-version"], "FFmpeg version check").stdout.split("\n")[0];
  const ffprobePath = getFfprobePath(ffmpegPath);
  let videoProbe = null;
  if (args.video) {
    const probe = probeMedia(args.video, ffprobePath, process.env, "FFprobe input video check");
    const videoStream = probe.streams.find((stream) => stream.codec_type === "video");
    if (!videoStream) fail("--video has no video stream");
    if (probe.streams.some((stream) => stream.codec_type === "audio")) {
      fail("--video must be picture-only; add an existing locked soundtrack as an explicit plan track so it is retained and protected");
    }
    const videoDurationEvidence = mediaStreamDurationEvidence(videoStream);
    const videoDurationSec = videoDurationEvidence?.durationSec;
    if (videoDurationSec == null) fail("FFprobe could not establish the input video stream duration");
    if (videoDurationSec + 1e-8 < plan.durationSec) fail("input video stream is shorter than plan.durationSec; refusing an audio/video duration mismatch");
    videoProbe = {
      videoDurationSec,
      videoDurationClock: videoDurationEvidence,
      frameCount: Number.isFinite(Number(videoStream.nb_frames)) ? Number(videoStream.nb_frames) : null,
      codec: videoStream.codec_name || null,
    };
  }

  await fs.mkdir(args.cacheDir, { recursive: true });
  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.mkdir(path.dirname(args.manifest), { recursive: true });
  if (args.finalOutput) await fs.mkdir(path.dirname(args.finalOutput), { recursive: true });
  const runDir = path.join(args.cacheDir, "audio-" + Date.now() + "-" + process.pid);
  const runEnv = { ...process.env, TMPDIR: runDir, TMP: runDir, TEMP: runDir };
  await fs.mkdir(runDir, { recursive: true });

  const rows = [];
  const eventResults = [];
  for (const item of eventRows) {
    const asset = resolved.get(item.cue.assetId);
    const clip = clipForEvent(item, asset);
    const sourceIn = clip.sourceIn;
    const sourceOut = clip.sourceOut;
    const filmEnd = clip.startFilmSec + (sourceOut - sourceIn) / clip.speed;
    const effectiveSourceIn = clip.startFilmSec < 0 ? Math.min(sourceOut, sourceIn + (-clip.startFilmSec) * clip.speed) : sourceIn;
    const effectiveSourceOut = filmEnd > plan.durationSec ? Math.max(effectiveSourceIn, sourceOut - (filmEnd - plan.durationSec) * clip.speed) : sourceOut;
    const audible = effectiveSourceOut > effectiveSourceIn + 1e-8 && filmEnd > 0 && clip.startFilmSec < plan.durationSec;
    const entry = {
      id: item.cue.id,
      sharedEventId: item.eventId,
      sharedEventSource: item.sourceEvent.owner,
      sharedPhaseId: item.sourceEvent.phaseId,
      assetId: item.cue.assetId,
      bus: "sfx",
      sourceEventTimeSec: item.sourceEvent.timeSec,
      sourceEventTimeBasis: item.sourceEvent.timeBasis,
      timeMapId: item.cue.timeMapId || null,
      timeMapSpeed: item.cue.timeMapId ? validated.maps.get(item.cue.timeMapId).speed : 1,
      offsetSec: item.cue.offsetSec || 0,
      filmTimeSec: item.filmTimeSec,
      hitTimeSec: clip.hitTimeSec,
      hitTimeMethod: item.cue.hitTimeSec == null ? (asset.hitTimeMethod || "asset-index") : "plan-override",
      hitTimeConfidence: item.cue.hitTimeSec == null ? (asset.hitTimeConfidence || null) : null,
      startFilmSec: clip.startFilmSec,
      effectiveStartFilmSec: Math.max(0, clip.startFilmSec),
      sourceInSec: effectiveSourceIn,
      sourceOutSec: effectiveSourceOut,
      speed: clip.speed,
      headTrimmed: effectiveSourceIn > sourceIn,
      tailTrimmed: effectiveSourceOut < sourceOut,
      audible,
    };
    eventResults.push(entry);
    if (audible) rows.push({ item: item.cue, asset, clip: { ...clip, sourceIn: effectiveSourceIn, sourceOut: effectiveSourceOut, startFilmSec: Math.max(0, clip.startFilmSec) }, bus: "sfx" });
  }

  const trackResults = [];
  const publicGeneratedGroupBindings = requestGeneratedSourceGroupBindings.map(({ runtimePaths, ...row }) => row);
  const generatedGroupByTrack = new Map(publicGeneratedGroupBindings.map((row) => [row.trackId, row]));
  const sourcePremixByTrack = new Map(sourcePremixBindings.map((row) => [row.trackId, row]));
  for (const track of plan.tracks || []) {
    const asset = resolved.get(track.assetId);
    const clip = clipForTrack(track, asset, validated.maps);
    const assetVoiceDuckProcessing = validateAssetVoiceDuckProcessing({ plan, track, asset, clip });
    const sourceIn = clip.sourceIn;
    const sourceOut = clip.sourceOut;
    const filmEnd = clip.startFilmSec + (sourceOut - sourceIn) / clip.speed;
    const effectiveSourceIn = clip.startFilmSec < 0 ? Math.min(sourceOut, sourceIn + (-clip.startFilmSec) * clip.speed) : sourceIn;
    const effectiveSourceOut = filmEnd > plan.durationSec ? Math.max(effectiveSourceIn, sourceOut - (filmEnd - plan.durationSec) * clip.speed) : sourceOut;
    const audible = effectiveSourceOut > effectiveSourceIn + 1e-8 && filmEnd > 0 && clip.startFilmSec < plan.durationSec;
    const automationSuppressed = Boolean(track.locked && track.bus === "music" && (
      (plan.automation || []).length || (plan.ducking && (plan.voiceWindows || []).length)
    ));
    const sourceProcessing = track.sourceProcessing || null;
    const sourcePremixVerification = sourcePremixByTrack.get(track.id) || null;
    const entry = {
      id: track.id,
      assetId: track.assetId,
      bus: track.bus,
      useCase: track.useCase || null,
      locked: Boolean(track.locked),
      startFilmSec: clip.startFilmSec,
      effectiveStartFilmSec: Math.max(0, clip.startFilmSec),
      sourceInSec: effectiveSourceIn,
      sourceOutSec: effectiveSourceOut,
      speed: clip.speed,
      gainDb: track.gainDb == null ? 0 : track.gainDb,
      baseGainDb: track.gainDb == null ? 0 : track.gainDb,
      automation: automationManifestRows(plan, track),
      headTrimmed: effectiveSourceIn > sourceIn,
      tailTrimmed: effectiveSourceOut < sourceOut,
      duckingOrAutomationSuppressed: automationSuppressed,
      sourcePremix: sourceProcessing ? {
        owner: sourceProcessing.owner,
        receiptSha256: sourceProcessing.receiptSha256,
        assetSha256: sourceProcessing.assetSha256,
        sourceVoiceDuckApplied: sourcePremixVerification?.sourceVoiceDuckApplied ?? null,
        voiceDuckProcessing: sourcePremixVerification?.voiceDuckProcessing || null,
        narrationIncludedInPremix: false,
        voiceTrackId: sourceProcessing.voiceBinding?.trackId || null,
        bakedCanonicalEventIds: sourceProcessing.bakedCanonicalEvents.map((event) => event.eventId),
      } : null,
      sourceGeneratedGroup: generatedGroupByTrack.get(track.id) || null,
      voiceDuckProcessing: assetVoiceDuckProcessing,
      audible,
    };
    trackResults.push(entry);
    if (audible) rows.push({ item: track, asset, clip: { ...clip, sourceIn: effectiveSourceIn, sourceOut: effectiveSourceOut, startFilmSec: Math.max(0, clip.startFilmSec) }, bus: track.bus });
  }

  for (const row of rows) {
    if (row.asset.kind === "generated") row.asset.absoluteFile = await ensureGeneratedAsset(row.asset, args.cacheDir, ffmpegPath, runEnv);
  }
  const hasAudio = rows.length > 0;
  const graph = buildAudioGraph(plan, rows);
  const mixTemp = path.join(runDir, "mix.wav");
  const outputTemp = siblingTempPath(args.output);
  if (hasAudio) {
    const argv = ["-hide_banner", "-loglevel", "error", "-y"];
    for (const row of rows) argv.push("-i", row.asset.absoluteFile);
    argv.push("-filter_complex", graph.filter, "-map", "[" + graph.output + "]", "-t", String(plan.durationSec), "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", mixTemp);
    run(ffmpegPath, argv, "FFmpeg mix", runEnv);
  } else {
    run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", String(plan.durationSec), "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", mixTemp], "FFmpeg silent WAV", runEnv);
  }
  let master = null;
  let delivery = mixTemp;
  if (plan.masterLoudnorm && hasAudio) {
    delivery = path.join(runDir, "master.wav");
    master = masterMix(ffmpegPath, mixTemp, delivery, plan.masterLoudnorm, runEnv);
  } else if (plan.masterLoudnorm) {
    master = {target: plan.masterLoudnorm, status: "silent-no-stream"};
  }
  await fs.copyFile(delivery, outputTemp);
  await commitFile(outputTemp, args.output, args.overwrite);
  const mixHash = sha256(await fs.readFile(args.output));

  let mux = null;
  if (args.video && args.finalOutput) {
    const finalTemp = siblingTempPath(args.finalOutput);
    const argv = ["-hide_banner", "-loglevel", "error", "-y", "-i", args.video];
    if (hasAudio) argv.push("-i", args.output);
    argv.push("-map", "0:v:0");
    if (hasAudio) argv.push("-map", "1:a:0", "-c:a", "aac");
    else argv.push("-an");
    argv.push("-c:v", "copy", "-t", String(plan.durationSec), "-movflags", "+faststart", finalTemp);
    run(ffmpegPath, argv, "FFmpeg final mux", runEnv);
    const finalProbe = probeMedia(finalTemp, ffprobePath, runEnv, "FFprobe final mux check");
    const finalVideo = finalProbe.streams.find((stream) => stream.codec_type === "video");
    const finalAudio = finalProbe.streams.find((stream) => stream.codec_type === "audio");
    const finalVideoDurationEvidence = finalVideo && mediaStreamDurationEvidence(finalVideo);
    const finalAudioDurationEvidence = finalAudio && mediaStreamDurationEvidence(finalAudio);
    const finalVideoDurationSec = finalVideoDurationEvidence?.durationSec ?? null;
    const finalAudioDurationSec = finalAudioDurationEvidence?.durationSec ?? null;
    if (!finalVideo || finalVideoDurationSec == null || finalVideoDurationSec + 1e-8 < plan.durationSec) {
      fail("final mux video stream is shorter than plan.durationSec; refusing a mismatched output");
    }
    if (hasAudio && (!finalAudio || finalAudioDurationSec == null || finalAudioDurationSec + 0.05 < plan.durationSec)) {
      fail("final mux audio stream is shorter than plan.durationSec; refusing a mismatched output");
    }
    await commitFile(finalTemp, args.finalOutput, args.overwrite);
    mux = {
      video: args.video,
      output: args.finalOutput,
      audioStream: hasAudio,
      durationLimitSec: plan.durationSec,
      videoStreamDurationSec: finalVideoDurationSec,
      videoStreamDurationClock: finalVideoDurationEvidence,
      audioStreamDurationSec: finalAudioDurationSec || null,
      audioStreamDurationClock: finalAudioDurationEvidence,
      outputDurationSec: Number(finalProbe.format && finalProbe.format.duration) || null,
      shortestUsed: false,
    };
  }

  const usedAssets = [];
  const uniqueUsed = new Map(rows.map((row) => [row.asset.id, row.asset]));
  for (const asset of uniqueUsed.values()) {
    const hash = asset.actualSha256 || sha256(await fs.readFile(asset.absoluteFile));
    usedAssets.push({
      id: asset.id,
      kind: asset.kind,
      file: asset.file || path.relative(skillDir, asset.absoluteFile),
      sha256: hash,
      license: asset.license,
      redistribution: asset.redistribution,
      sourceRedistributionAllowed: asset.redistribution.status === "redistributable",
      syncUseAllowed: asset.redistribution.status === "redistributable" || asset.redistribution.status === "sync-only"
        || (asset.redistribution.status === "not-authorized-for-redistribution" && asset.redistribution.syncUse === "allowed")
        || asset.redistribution.status === "project-generated",
      reviewStatus: asset.reviewStatus,
      source: asset.source || null,
      hitTimeSec: asset.hitTimeSec ?? null,
      hitTimeMethod: asset.hitTimeMethod || null,
      hitTimeConfidence: asset.hitTimeConfidence || null,
      recipe: asset.recipe || null,
    });
  }
  const manifest = {
    kind: "audio-usage-manifest",
    schemaVersion: 1,
    plan: args.plan,
    planSha256: sha256(Buffer.from(planText)),
    scene: args.scene || null,
    sceneDurationSec: scene ? scene.duration : null,
    assetIndex: args.assetIndex,
    durationSec: plan.durationSec,
    sampleRate: 48000,
    channels: 2,
    timeUnit: "seconds",
    timeBasis: "film-global",
    audioStream: hasAudio,
    outputWav: args.output,
    outputWavSha256: mixHash,
    candidatePreviewAllowed: Boolean(args.allowCandidate),
    generatedPreviewAllowed: Boolean(args.allowGeneratedPreview),
    productionRoute: audioPolicy.status === "legacy-replay" ? "legacy-project-replay" : "current-project-render",
    audioGenerationPolicy: audioPolicy,
    technicalPreview: audioPolicy.status === "legacy-replay" || usedAssets.some((asset) => asset.reviewStatus !== "ready"),
    ffmpeg: { executable: ffmpegPath, version: ffmpegVersion },
    videoProbe,
    events: eventResults,
    tracks: trackResults,
    voiceWindows: plan.voiceWindows || [],
    sourcePremixProcessing: sourcePremixBindings,
    sourceGeneratedSourceGroups: publicGeneratedGroupBindings,
    voiceDuckProcessing: {
      voiceWindowsSha256: sha256(Buffer.from(canonical(plan.voiceWindows || []), "utf8")),
      requestedWindows: plan.voiceWindows || [],
      sourceProcessedTrackIds: trackResults.filter((row) => row.voiceDuckProcessing?.applied === true || row.sourcePremix?.sourceVoiceDuckApplied === true || row.sourceGeneratedGroup?.sourceVoiceDuckApplied === true).map((row) => row.id),
      finalMixerTrackIds: trackResults.filter((row) => row.bus === "music" && !row.locked && plan.ducking != null && (plan.voiceWindows || []).length > 0).map((row) => row.id),
      lockedMusicProtectedTrackIds: trackResults.filter((row) => row.bus === "music" && row.locked).map((row) => row.id),
      finalMixerParameters: plan.ducking || null,
      interpretation: "Processing ownership only; this records which path applied or retained voice ducking and does not certify audibility or listening quality.",
    },
    asrcutBinding: asrcutInfo?.binding || null,
    automation: plan.automation || [],
    automationSemantics: "Legacy automation.gainDb remains an additive dB delta over each unlocked music track's base tracks[].gainDb. deltaGainDb is an explicit additive delta. targetGainDb is the desired automation-applied source-track gain and is converted to target minus base gain. These values are automation gains, not dBFS/LUFS measurements; locked tracks remain unchanged. Each track automation receipt's sourceGainWithThisEntryOnlyDb is the track base plus that single entry at its full envelope only; it is not the simultaneous track or bus gain. For an unlocked music track at film time t, the volume-filter level is track.gainDb + the sum of each applicable automation entry's delta multiplied by its own time envelope + ducking.targetGainDb multiplied by the maximum active voice-window duck envelope. The per-entry time envelope is zero outside its start/end and otherwise the lesser of its linear fade-in and fade-out ramps. The track's sample attack/release fade multiplies samples separately, and music tracks are then linearly summed; this manifest does not collapse those time-varying controls or multiple tracks into one resulting gain number.",
    ducking: plan.ducking || null,
    usedAssets,
    mix: { ...(master ? {masterLoudnorm: master} : {}), buses: graph.busLabels, inputCount: rows.length, filterGraph: graph.filter, encoding: "pcm_f32le 48000 Hz stereo", noAudio: !hasAudio },
    mux,
    reviewBoundary: usedAssets.some((asset) => asset.reviewStatus !== "ready")
      ? "Technical preview only: at least one explicitly admitted asset is unreviewed. Preview flags permit technical inspection only; they do not claim that anyone listened to or approved the sound."
      : "All used assets carry reviewStatus=ready. This technical manifest records use; it does not certify that the mix suits the film or audience.",
  };
    await writeJsonAtomically(args.manifest, manifest, args.overwrite);
  return manifest;
}

function usage() {
  return [
    "Usage: node scripts/audio.mjs --plan /absolute/audio-plan.json --output /absolute/mix.wav --manifest /absolute/audio-manifest.json --cache-dir /absolute/project/.cache/tmp/audio-run",
    "       node scripts/audio.mjs prepare-asrcut-plan --edit-plan /absolute/frozen-plan.json --timeline /absolute/timeline.json --receipt /absolute/voice.wav.artifact.json --voice-wav /absolute/voice.wav --voice-asset-id <id> --voice-track-id <id> --output /absolute/audio-plan.json [--base-plan /absolute/base-plan.json] [--overwrite]",
    "       [--scene /absolute/shared-scene.json] [--asset-index /absolute/index.json] [--ffmpeg /absolute/ffmpeg] [--allow-candidate] [--allow-generated-preview] [--legacy-replay]",
    "       [--video /absolute/picture.mp4 --final-output /absolute/final.mp4] [--overwrite]",
  ].join("\n");
}
async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "prepare-asrcut-plan") {
    if (argv.length === 2 && ["--help", "-h"].includes(argv[1])) {
      process.stdout.write(usage() + "\n");
      return;
    }
    const values = new Set(["--edit-plan", "--timeline", "--receipt", "--voice-wav", "--voice-asset-id", "--voice-track-id", "--output", "--base-plan"]);
    const options = {};
    for (let index = 1; index < argv.length; index += 1) {
      const key = argv[index];
      if (key === "--overwrite") { options.overwrite = true; continue; }
      if (!values.has(key)) fail("Unknown prepare-asrcut-plan argument " + key);
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) fail("Missing value for " + key);
      options[key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++index];
    }
    const result = await prepareAsrcutVoicePlan(options);
    process.stdout.write("AUDIO_PLAN " + result.output + "\nVOICE_TRACK " + options.voiceTrackId + "\nASRCUT_REVISION " + result.plan.asrcutBinding.project.revision + "\n");
    return;
  }
  const args = parseArgs(argv);
  const manifest = await renderAudioPlan(args);
  process.stdout.write("WAV " + args.output + "\nMANIFEST " + args.manifest + "\nAUDIO_STREAM " + manifest.audioStream + "\n");
  if (manifest.mux) process.stdout.write("FINAL " + manifest.mux.output + "\n");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write((error.stack || error.message) + "\n" + usage() + "\n");
    process.exitCode = 1;
  });
}

export { buildAudioGraph, clipForEvent, findSceneAudioEvents, generatedAudioAssetScopes, generatedAudioAssetIds, mapLocalTimeToFilm, mappedVoiceWindowsForTrack, mapSceneEvents, parseArgs, secondsToSamples, validateAssetUse, validateAssetVoiceDuckProcessing, validateAudioPolicy, validatePlan, verifyAudioPolicyRequest };

