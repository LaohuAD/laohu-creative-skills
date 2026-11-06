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
  return timeline.units.filter((unit) => unit.kind === "source").map((unit) => ({
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

function receiptUnitRows(timeline) {
  return timeline.units.map((unit) => unit.kind === "presentation"
    ? { kind: "presentation", id: unit.id, decisionId: unit.decisionId, reason: unit.reason, sceneId: unit.sceneId, durationSamples: unit.durationSamples, targetRange: unit.targetRange, visualHandoff: unit.visualHandoff, audioHandoff: unit.audioHandoff }
    : { kind: "source", occurrenceId: unit.occurrenceId, sourceId: unit.sourceId, coverageId: unit.coverageId, sourceRange: unit.sourceRange, targetRange: unit.targetRange, timingPrecision: unit.timingPrecision });
}

function assertAsrcutBundle({ editPlan, timeline, receipt, voiceWavMetadata }) {
  const errors = validateAsrcutPlan(editPlan).errors;
  if (errors.length) fail("ASR-cut edit plan is invalid: " + errors.join("; "));
  if (editPlan.format !== "laohu.asrcut.edit-plan/2" || editPlan.state !== "frozen") fail("ASR-cut audio binding requires a frozen edit-plan/2");
  if (editPlan.authorization?.mediaExport !== true) fail("ASR-cut audio binding requires explicit mediaExport authorization");
  const compiled = compileAsrcutPlan(editPlan);
  if (compiled.format !== "laohu.asrcut.timeline/2" || compiled.state !== "frozen") fail("ASR-cut compiler did not produce a frozen timeline/2");
  if (canonical(timeline) !== canonical(compiled)) fail("ASR-cut timeline is stale or not the canonical compiler output");
  const planSha256 = hashAsrcutPlan(editPlan);
  if (timeline.planSha256 !== planSha256 || editPlan.integrity?.planSha256 !== planSha256) fail("ASR-cut plan hash is stale");
  if (compiled.clock.sampleRateHz !== 48000) fail("Motion audio requires ASR-cut project clock at 48000 Hz");
  const expectedWav = voiceWavMetadata;
  if (!expectedWav || !/^[a-f0-9]{64}$/i.test(expectedWav.sha256 || "")) fail("ASR-cut WAV metadata or file hash is missing");
  if (expectedWav.sampleRate !== compiled.clock.sampleRateHz || expectedWav.sampleCount !== compiled.durationSamples) {
    fail("ASR-cut WAV sample clock does not match the final timeline");
  }
  if (receipt.format !== "laohu.asrcut.audio-artifact/2" || receipt.timelineFormat !== compiled.format
      || receipt.planSha256 !== planSha256 || receipt.project?.id !== editPlan.project.id
      || receipt.project?.revision !== editPlan.project.revision || receipt.sampleRateHz !== compiled.clock.sampleRateHz
      || receipt.sampleCount !== compiled.durationSamples || receipt.channels !== expectedWav.channels
      || receipt.outputSha256 !== expectedWav.sha256) {
    fail("ASR-cut audio receipt does not identify this frozen plan, timeline, and WAV");
  }
  if (canonical(receipt.units) !== canonical(receiptUnitRows(compiled))) fail("ASR-cut audio receipt unit map differs from the final timeline");
  if (canonical(receipt.clips) !== canonical(compiled.clips.map((clip) => ({ occurrenceId: clip.occurrenceId, sourceId: clip.sourceId, coverageId: clip.coverageId, sourceRange: clip.sourceRange, targetRange: clip.targetRange })))) {
    fail("ASR-cut audio receipt source clips differ from the final timeline");
  }
  const expectedVoiceWindows = compiled.units.filter((unit) => unit.kind === "source").map((unit) => ({
    startSample: unit.targetRange.startSample,
    endSample: unit.targetRange.endSample,
    sampleRateHz: compiled.clock.sampleRateHz,
    basis: "conservative-retained-source-range",
    timingPrecision: unit.timingPrecision,
  }));
  if (canonical(receipt.voiceWindows) !== canonical(expectedVoiceWindows)) fail("ASR-cut receipt voice windows must be the conservative source-unit ranges");
  if (receipt.voiceTrackPlayback !== "Play this single exported WAV once from project sample 0. Voice windows are conservative source-unit bounds, may include original source pauses, and must not be used to replay individual clips or infer mic-zero as final-mix silence.") {
    fail("ASR-cut receipt does not carry the single-track playback and silence-provenance warning");
  }
  return { compiled, expectedWav, planSha256, voiceWindows: sourceWindowRows(compiled) };
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
  plan.asrcutBinding = {
    format: "laohu.motion.asrcut-audio-binding/1",
    project: { id: bundle.compiled.project.id, revision: bundle.compiled.project.revision, planSha256: bundle.planSha256 },
    timeline: { format: bundle.compiled.format, durationSamples: bundle.compiled.durationSamples, sampleRateHz: bundle.compiled.clock.sampleRateHz, canonicalSha256: sha256(Buffer.from(canonical(bundle.compiled))) },
    evidence: { editPlan: reference(editPlanPath), timeline: reference(timelinePath), receipt: reference(receiptPath) },
    voice: { assetId: voiceAssetId, trackId: voiceTrackId, fileSha256: voiceWavMetadata.sha256, playback: "single-full-file-track-at-film-sample-zero" },
    sourceEvidence,
    voiceWindows: voiceWindows.map((window) => ({ id: window.id, startSample: bundle.compiled.units.find((unit) => unit.kind === "source" && unit.occurrenceId === window.sourceOccurrenceId).targetRange.startSample, endSample: bundle.compiled.units.find((unit) => unit.kind === "source" && unit.occurrenceId === window.sourceOccurrenceId).targetRange.endSample, timingPrecision: window.timingPrecision })),
    presentationWindows: bundle.compiled.units.filter((unit) => unit.kind === "presentation").map((unit) => ({ id: unit.id, startSample: unit.targetRange.startSample, endSample: unit.targetRange.endSample, sceneId: unit.sceneId, audioHandoff: unit.audioHandoff })),
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
  const expectedBindingWindows = bundle.compiled.units.filter((unit) => unit.kind === "source").map((unit) => ({ id: "asrcut-window-" + unit.occurrenceId, startSample: unit.targetRange.startSample, endSample: unit.targetRange.endSample, timingPrecision: unit.timingPrecision }));
  if (canonical(binding.voiceWindows) !== canonical(expectedBindingWindows)) fail("ASR-cut source window map is stale");
  const expectedPresentations = bundle.compiled.units.filter((unit) => unit.kind === "presentation").map((unit) => ({ id: unit.id, startSample: unit.targetRange.startSample, endSample: unit.targetRange.endSample, sceneId: unit.sceneId, audioHandoff: unit.audioHandoff }));
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
function mediaStreamDuration(stream) {
  const direct = Number(stream.duration);
  if (Number.isFinite(direct) && direct >= 0) return direct;
  const ticks = Number(stream.duration_ts);
  const timeBase = typeof stream.time_base === "string" ? stream.time_base.match(/^(\d+)\/(\d+)$/) : null;
  if (Number.isFinite(ticks) && timeBase && Number(timeBase[2]) !== 0) return ticks * Number(timeBase[1]) / Number(timeBase[2]);
  const frameCount = Number(stream.nb_frames);
  const rate = String(stream.avg_frame_rate || stream.r_frame_rate || "").match(/^(\d+)\/(\d+)$/);
  if (Number.isFinite(frameCount) && rate && Number(rate[2]) !== 0) return frameCount * Number(rate[2]) / Number(rate[1]);
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
  const flags = new Set(["--allow-candidate", "--allow-generated-preview", "--overwrite"]);
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
  if (typeof envelope !== "object") fail(label + " must be an object");
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
function validatePlan(plan) {
  for (const key of ["controlSource", "processing", "rooms"]) {
    if (Object.prototype.hasOwnProperty.call(plan, key)) {
      fail(`plan.${key} is not supported by audio-plan/1; continuous audio controls and room processing are unavailable`);
    }
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
    id(track.assetId, "track " + track.id + ".assetId");
    if (!["music", "voice"].includes(track.bus)) fail("track " + track.id + ".bus must be music or voice");
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
  for (const item of plan.automation || []) {
    if (item.bus !== "music") fail("automation " + (item.id || "?") + ".bus must be music");
    number(item.startSec, "automation " + (item.id || "?") + ".startSec", { min: 0 });
    number(item.endSec, "automation " + (item.id || "?") + ".endSec", { min: 0.000001 });
    number(item.gainDb, "automation " + (item.id || "?") + ".gainDb", { min: -120, max: 24 });
    if (item.endSec <= item.startSec || item.endSec > durationSec + 1e-8) fail("automation " + (item.id || "?") + " is outside film duration");
    number(item.fadeInSec == null ? 0 : item.fadeInSec, "automation " + item.id + ".fadeInSec", { min: 0 });
    number(item.fadeOutSec == null ? 0 : item.fadeOutSec, "automation " + item.id + ".fadeOutSec", { min: 0 });
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
  return { durationSec, maps };
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
function automationExpression(items) {
  if (!items || items.length === 0) return "0";
  return items.map((item) => {
    const rise = item.fadeInSec > 0 ? "min(1,max(0,(t-" + item.startSec + ")/" + item.fadeInSec + "))" : "1";
    const fall = item.fadeOutSec > 0 ? "min(1,max(0,(" + item.endSec + "-t)/" + item.fadeOutSec + "))" : "1";
    return "if(between(t," + item.startSec + "," + item.endSec + ")," + item.gainDb + "*min(" + rise + "," + fall + "),0)";
  }).join("+");
}
function volumeFilter(item, plan) {
  const baseDb = item.gainDb == null ? 0 : item.gainDb;
  const expressions = [String(baseDb)];
  if (item.bus === "music" && !item.locked) {
    const automation = automationExpression((plan.automation || []).filter((entry) => entry.bus === "music"));
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

function inspectGeneratedWave(buffer, expectedDurationSec) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    fail("Generated recipe cache is not a RIFF/WAVE file");
  }
  let offset = 12;
  let format = null;
  let channels = null;
  let sampleRate = null;
  let bitsPerSample = null;
  let dataLength = null;
  while (offset + 8 <= buffer.length) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length) fail("Generated recipe cache has a truncated WAV chunk");
    if (name === "fmt ") {
      format = buffer.readUInt16LE(offset + 8);
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (name === "data") {
      dataLength = size;
      break;
    }
    offset += 8 + size + (size & 1);
  }
  if (format !== 3 || channels !== 2 || sampleRate !== 48000 || bitsPerSample !== 32 || dataLength == null || dataLength % 8 !== 0) {
    fail("Generated recipe cache must be 48 kHz stereo float PCM");
  }
  const frames = dataLength / 8;
  const expectedFrames = secondsToSamples(expectedDurationSec, sampleRate);
  if (Math.abs(frames - expectedFrames) > 1) fail("Generated recipe cache duration does not match its recipe");
  return { frames, sampleRate, channels };
}

export async function renderAudioPlan(args) {
  const planText = await fs.readFile(args.plan, "utf8");
  const indexText = await fs.readFile(args.assetIndex, "utf8");
  const plan = JSON.parse(planText);
  const index = JSON.parse(indexText);
  const validated = validatePlan(plan);
  const asrcutInfo = await verifyAsrcutBinding(plan, args.plan);
  if ((plan.events || []).length && !args.scene) fail("--scene is required so cues resolve against their shared event source");
  const scene = args.scene ? JSON.parse(await fs.readFile(args.scene, "utf8")) : null;
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

  const inputPaths = [args.plan, args.assetIndex, args.scene, args.video, ...(asrcutInfo?.evidencePaths || []), ...[...resolved.values()].filter((asset) => asset.absoluteFile).map((asset) => asset.absoluteFile)].filter(Boolean);
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
    const videoDurationSec = mediaStreamDuration(videoStream);
    if (videoDurationSec == null) fail("FFprobe could not establish the input video stream duration");
    if (videoDurationSec + 1e-8 < plan.durationSec) fail("input video stream is shorter than plan.durationSec; refusing an audio/video duration mismatch");
    videoProbe = { videoDurationSec, codec: videoStream.codec_name || null };
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
  for (const track of plan.tracks || []) {
    const asset = resolved.get(track.assetId);
    const clip = clipForTrack(track, asset, validated.maps);
    const sourceIn = clip.sourceIn;
    const sourceOut = clip.sourceOut;
    const filmEnd = clip.startFilmSec + (sourceOut - sourceIn) / clip.speed;
    const effectiveSourceIn = clip.startFilmSec < 0 ? Math.min(sourceOut, sourceIn + (-clip.startFilmSec) * clip.speed) : sourceIn;
    const effectiveSourceOut = filmEnd > plan.durationSec ? Math.max(effectiveSourceIn, sourceOut - (filmEnd - plan.durationSec) * clip.speed) : sourceOut;
    const audible = effectiveSourceOut > effectiveSourceIn + 1e-8 && filmEnd > 0 && clip.startFilmSec < plan.durationSec;
    const automationSuppressed = Boolean(track.locked && track.bus === "music" && (
      (plan.automation || []).length || (plan.ducking && (plan.voiceWindows || []).length)
    ));
    const entry = {
      id: track.id,
      assetId: track.assetId,
      bus: track.bus,
      locked: Boolean(track.locked),
      startFilmSec: clip.startFilmSec,
      effectiveStartFilmSec: Math.max(0, clip.startFilmSec),
      sourceInSec: effectiveSourceIn,
      sourceOutSec: effectiveSourceOut,
      speed: clip.speed,
      gainDb: track.gainDb == null ? 0 : track.gainDb,
      headTrimmed: effectiveSourceIn > sourceIn,
      tailTrimmed: effectiveSourceOut < sourceOut,
      duckingOrAutomationSuppressed: automationSuppressed,
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
  await fs.copyFile(mixTemp, outputTemp);
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
    const finalVideoDurationSec = finalVideo && mediaStreamDuration(finalVideo);
    const finalAudioDurationSec = finalAudio && mediaStreamDuration(finalAudio);
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
      audioStreamDurationSec: finalAudioDurationSec || null,
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
    technicalPreview: usedAssets.some((asset) => asset.reviewStatus !== "ready"),
    ffmpeg: { executable: ffmpegPath, version: ffmpegVersion },
    events: eventResults,
    tracks: trackResults,
    voiceWindows: plan.voiceWindows || [],
    asrcutBinding: asrcutInfo?.binding || null,
    automation: plan.automation || [],
    ducking: plan.ducking || null,
    usedAssets,
    mix: { buses: graph.busLabels, inputCount: rows.length, filterGraph: graph.filter, encoding: "pcm_f32le 48000 Hz stereo", noAudio: !hasAudio },
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
    "       [--scene /absolute/shared-scene.json] [--asset-index /absolute/index.json] [--ffmpeg /absolute/ffmpeg] [--allow-candidate] [--allow-generated-preview]",
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

export { buildAudioGraph, clipForEvent, findSceneAudioEvents, mapLocalTimeToFilm, mapSceneEvents, parseArgs, secondsToSamples, validateAssetUse, validatePlan };

