import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { compilePlan, hashPlan, verifyPlanEvidence } from "../../../laohu-asrcut/scripts/asrcut.mjs";

const adapterDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(adapterDir, "../..");
const templateCli = path.join(skillDir, "scripts", "templates.mjs");
const motionCli = path.join(skillDir, "scripts", "render.mjs");
const catalogPath = path.join(skillDir, "templates", "catalog.json");
const vendorRoot = path.join(skillDir, "templates", "upstream", "huashu-motion");
const require = createRequire(import.meta.url);
const MotionOps = require("../../scripts/motion-ops.js");
const FRAME_EPSILON = 1e-9;
const TIME_EPSILON = 1e-8;
const RATE = 48000;
const FILM_FORMAT = "laohu.huashu-film-blueprint/1";
const MANIFEST_FORMAT = "laohu.huashu-om-film-manifest/1";
const NATIVE_SPEC_FORMAT = "laohu.huashu-native-template-spec/1";
const ALLOWED_TEMPLATE_EFFECTS = new Set(["huashu-art-motion-dg"]);

function fail(message) { throw new Error(message); }
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object");
  return value;
}
function finite(value, label, minimum = -Infinity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) fail(label + " must be a finite number >= " + minimum);
  return value;
}
function stableId(value, label) {
  if (typeof value !== "string" || !value.trim() || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    fail(label + " must be a non-empty stable ID using letters, numbers, dot, underscore, colon, or hyphen");
  }
  return value;
}
function onlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(label + " contains an unsupported field that could create a second time or renderer authority: " + key);
}
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function hashField(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) fail(label + " must be a 64-character SHA-256 hex digest");
  return value.toLowerCase();
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
function frameBoundary(timeSec, fps, label) {
  const value = Math.ceil(timeSec * fps - FRAME_EPSILON);
  if (!Number.isSafeInteger(value) || value < 0) fail(label + " does not resolve to a safe non-negative frame boundary");
  return Math.max(0, value);
}
function frameResidual(frame, timeSec, fps) {
  const residual = frame / fps - timeSec;
  if (residual < -TIME_EPSILON || residual >= 1 / fps + TIME_EPSILON) fail("Frame boundary residual is outside the one-frame ceil interval");
  return Math.max(0, residual);
}
function safeName(value) { return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "segment"; }

/**
 * Compile the blueprint's one clock into absolute output-frame ranges.
 * The input rows remain the sole timing authority; frame ranges are derived.
 */
export function compileFilmSchedule(blueprint, timeline = null) {
  object(blueprint, "film blueprint");
  onlyKeys(blueprint, new Set(["format", "width", "height", "fps", "clock", "segments"]), "film blueprint");
  if (blueprint.format !== FILM_FORMAT) fail("film blueprint.format must be " + FILM_FORMAT);
  const fps = finite(blueprint.fps, "film blueprint.fps", 1);
  if (!Number.isInteger(fps) || fps !== 30) fail("the first Huashu Motion film assembler supports 30 fps only");
  if (blueprint.width !== 1920 || blueprint.height !== 1080) fail("the first Huashu Motion film assembler supports 1920×1080 only");
  if (!Array.isArray(blueprint.segments) || blueprint.segments.length === 0) fail("film blueprint.segments must contain at least one ordered segment");
  const clock = object(blueprint.clock, "film blueprint.clock");
  if (!new Set(["film-global", "asrcut-v2"]).has(clock.kind)) fail("film blueprint.clock.kind must be film-global or asrcut-v2");

  let durationSec;
  let exactBoundaries;
  let asrcut = null;
  if (clock.kind === "film-global") {
    onlyKeys(clock, new Set(["kind", "durationSec"]), "film blueprint.clock");
    durationSec = finite(clock.durationSec, "film blueprint.clock.durationSec", Number.EPSILON);
    exactBoundaries = blueprint.segments.map((segment, index) => {
      object(segment, "film blueprint.segments[" + index + "]");
      if (Object.hasOwn(segment, "unitIds")) fail("film-global segments use startSec/endSec and must not supply unitIds");
      const startSec = finite(segment.startSec, "segments[" + index + "].startSec", 0);
      const endSec = finite(segment.endSec, "segments[" + index + "].endSec", 0);
      if (endSec <= startSec) fail("segments[" + index + "] must have endSec > startSec");
      return { startSec, endSec, sourceRange: { startSec, endSec } };
    });
  } else {
    onlyKeys(clock, new Set(["kind", "timelinePath", "timelineSha256", "editPlanPath", "editPlanSha256"]), "film blueprint.clock");
    if (!timeline || timeline.format !== "laohu.asrcut.timeline/2" || timeline.state !== "frozen") fail("asrcut-v2 requires the hash-verified frozen laohu.asrcut.timeline/2");
    if (!Array.isArray(timeline.units) || timeline.units.length === 0) fail("frozen asrcut timeline/2 must contain ordered units");
    const rate = finite(timeline.clock?.sampleRateHz, "timeline.clock.sampleRateHz", 1);
    if (!Number.isInteger(rate)) fail("timeline.clock.sampleRateHz must be an integer");
    const unitEntries = timeline.units.map((unit, index) => {
      object(unit, "timeline.units[" + index + "]");
      let id;
      if (unit.kind === "source") id = stableId(unit.occurrenceId, "timeline.units[" + index + "].occurrenceId");
      else if (unit.kind === "presentation") id = stableId(unit.id, "timeline.units[" + index + "].id");
      else fail("timeline.units[" + index + "].kind must be source or presentation");
      const range = object(unit.targetRange, "timeline.units[" + index + "].targetRange");
      if (range.sampleRateHz !== rate || !Number.isSafeInteger(range.startSample) || !Number.isSafeInteger(range.endSample)
        || range.startSample < 0 || range.endSample <= range.startSample) fail("timeline.units[" + index + "].targetRange must be a non-empty half-open sample range on the timeline clock");
      return { id, kind: unit.kind, occurrenceId: unit.kind === "source" ? id : null, unit, startSample: range.startSample, endSample: range.endSample };
    });
    const ids = new Map();
    for (const item of unitEntries) {
      if (ids.has(item.id)) fail("timeline/2 unit IDs are ambiguous across source occurrences and presentation IDs: " + item.id);
      ids.set(item.id, item);
    }
    durationSec = timeline.durationSamples / rate;
    if (!Number.isSafeInteger(timeline.durationSamples) || timeline.durationSamples < 1) fail("timeline.durationSamples must be a positive safe integer");
    asrcut = { rate, unitEntries, ids };
    let cursor = 0;
    exactBoundaries = blueprint.segments.map((segment, segmentIndex) => {
      object(segment, "film blueprint.segments[" + segmentIndex + "]");
      if (Object.hasOwn(segment, "startSec") || Object.hasOwn(segment, "endSec")) fail("asrcut-v2 segments use unitIds only and must not supply startSec/endSec");
      if (!Array.isArray(segment.unitIds) || segment.unitIds.length === 0) fail("asrcut-v2 segments[" + segmentIndex + "].unitIds must be a non-empty ordered list");
      const selected = segment.unitIds.map((id, unitIndex) => {
        stableId(id, "segments[" + segmentIndex + "].unitIds[" + unitIndex + "]");
        const found = ids.get(id);
        if (!found) fail("asrcut-v2 unitId is missing from the frozen timeline: " + id);
        return found;
      });
      for (let localIndex = 0; localIndex < selected.length; localIndex += 1) {
        const expected = unitEntries[cursor + localIndex];
        if (selected[localIndex] !== expected) fail("asrcut-v2 segments must consume consecutive timeline.units in frozen order; first mismatch at segment " + segment.id);
      }
      const first = selected[0], last = selected.at(-1);
      if (first.startSample !== (cursor === 0 ? 0 : unitEntries[cursor - 1].endSample)) fail("asrcut-v2 selected units do not start at the preceding frozen unit boundary");
      cursor += selected.length;
      const startSample = first.startSample, endSample = last.endSample;
      if (selected.some((item, index) => index > 0 && selected[index - 1].endSample !== item.startSample)) fail("asrcut-v2 segment unitIds contain a gap or overlap");
      return {
        startSec: startSample / rate,
        endSec: endSample / rate,
        sourceRange: { startSample, endSample, sampleRateHz: rate },
        unitIds: segment.unitIds.slice(),
      };
    });
    if (cursor !== unitEntries.length) fail("asrcut-v2 segments must cover each frozen timeline unit exactly once");
    if (unitEntries[0].startSample !== 0 || unitEntries.at(-1).endSample !== timeline.durationSamples) fail("asrcut-v2 units must cover the complete frozen timeline duration");
  }

  const totalFrameCount = frameBoundary(durationSec, fps, "film duration");
  let previousExactEnd = 0;
  let previousFrameEnd = 0;
  const segments = blueprint.segments.map((segment, index) => {
    const boundary = exactBoundaries[index];
    if (Math.abs(boundary.startSec - previousExactEnd) > TIME_EPSILON) {
      fail(boundary.startSec < previousExactEnd ? "film segments overlap or are out of order" : "film segments leave an uncovered gap in the global clock");
    }
    const startFrame = frameBoundary(boundary.startSec, fps, "segments[" + index + "] start");
    const endFrame = frameBoundary(boundary.endSec, fps, "segments[" + index + "] end");
    if (startFrame !== previousFrameEnd) fail("segments[" + index + "] does not meet the preceding absolute frame boundary");
    if (endFrame <= startFrame) fail("segments[" + index + "] collapses to zero frames at " + fps + " fps");
    const frameStartResidualSec = frameResidual(startFrame, boundary.startSec, fps);
    const frameEndResidualSec = frameResidual(endFrame, boundary.endSec, fps);
    const roundingResidualSamples = (frameStartResidualSec + frameEndResidualSec) * RATE;
    previousExactEnd = boundary.endSec;
    previousFrameEnd = endFrame;
    return {
      id: stableId(segment.id, "segments[" + index + "].id"),
      renderer: segment.renderer,
      segment,
      exactStartSec: boundary.startSec,
      exactEndSec: boundary.endSec,
      exactDurationSec: boundary.endSec - boundary.startSec,
      sourceRange: boundary.sourceRange,
      unitIds: boundary.unitIds || null,
      frameRange: { startFrame, endFrame },
      frameCount: endFrame - startFrame,
      frameStartResidualSec,
      frameEndResidualSec,
      roundingResidualSamples,
      localDurationSec: (endFrame - startFrame) / fps,
      speed: ((endFrame - startFrame) / fps) / (boundary.endSec - boundary.startSec),
      fps,
      width: blueprint.width,
      height: blueprint.height,
    };
  });
  if (Math.abs(previousExactEnd - durationSec) > TIME_EPSILON) fail("film segments must cover the entire declared global clock duration");
  if (previousFrameEnd !== totalFrameCount) fail("film segment frame ranges do not exactly cover the compiled film frame clock");
  const idsSeen = new Set();
  for (const segment of segments) {
    if (idsSeen.has(segment.id)) fail("duplicate film segment ID: " + segment.id);
    idsSeen.add(segment.id);
  }
  return { clockKind: clock.kind, durationSec, fps, width: blueprint.width, height: blueprint.height, totalFrameCount, segments, asrcut };
}

async function readJson(file, label) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { fail(label + " could not be read as JSON: " + file + " (" + error.message + ")"); }
}
async function fileHash(file, label, expected = null) {
  const bytes = await fs.readFile(file).catch((error) => fail(label + " is missing or unreadable: " + file + " (" + error.message + ")"));
  const actual = sha256(bytes);
  if (expected && actual !== expected.toLowerCase()) fail(label + " SHA-256 is stale: " + file);
  return { bytes, sha256: actual };
}
async function fileSha256(file, label) {
  const hash = crypto.createHash("sha256");
  try {
    for await (const chunk of createReadStream(file)) hash.update(chunk);
  } catch (error) {
    fail(label + " is missing or unreadable: " + file + " (" + error.message + ")");
  }
  return hash.digest("hex");
}
function resolveInput(baseDir, value, label) {
  if (typeof value !== "string" || !value.trim()) fail(label + " must be a non-empty path");
  return path.resolve(baseDir, value);
}
function relativeToManifest(manifestPath, targetPath) {
  if (!targetPath) return null;
  return path.relative(path.dirname(manifestPath), targetPath) || path.basename(targetPath);
}
async function assertFreshPath(file, label) {
  const current = await fs.lstat(file).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (current?.isSymbolicLink()) fail(label + " must not be a symbolic link: " + file);
  if (current) fail(label + " already exists; choose a new path: " + file);
}
async function assertSameVolume(paths) {
  const rows = await Promise.all(paths.map(async (file) => ({ file, dev: (await fs.stat(file)).dev })));
  const device = rows[0]?.dev;
  for (const row of rows) if (row.dev !== device) fail("Blueprint, templates, inputs, work-root, and outputs must stay on one filesystem; mismatch at " + row.file);
}
async function writeNew(file, bytes) {
  await fs.writeFile(file, bytes, { flag: "wx" });
}
async function hashCheckedInput(baseDir, pathname, expectedHash, label) {
  const file = resolveInput(baseDir, pathname, label + " path");
  const hash = await fileHash(file, label, expectedHash);
  return { file, ...hash };
}

async function verifyAsrcutClock(clock, blueprintDir) {
  const timelineInput = await hashCheckedInput(blueprintDir, clock.timelinePath, hashField(clock.timelineSha256, "clock.timelineSha256"), "ASR canonical timeline");
  const planInput = await hashCheckedInput(blueprintDir, clock.editPlanPath, hashField(clock.editPlanSha256, "clock.editPlanSha256"), "ASR edit plan");
  const timeline = JSON.parse(timelineInput.bytes.toString("utf8"));
  const plan = JSON.parse(planInput.bytes.toString("utf8"));
  if (timeline.format !== "laohu.asrcut.timeline/2" || timeline.state !== "frozen") fail("asrcut-v2 requires a frozen laohu.asrcut.timeline/2");
  if (plan.format !== "laohu.asrcut.edit-plan/2" || plan.state !== "frozen") fail("asrcut-v2 requires a frozen laohu.asrcut.edit-plan/2");
  if (hashPlan(plan) !== timeline.planSha256) fail("timeline.planSha256 does not match hashPlan(current frozen edit plan)");
  if (canonical(compilePlan(plan)) !== canonical(timeline)) fail("timeline does not exactly match compilePlan(current frozen edit plan); recompile and use its matching timeline");
  for (const source of plan.sources || []) {
    if (!source.sha256 || !source.mediaPath) continue;
    const media = resolveInput(path.dirname(planInput.file), source.mediaPath, "ASR source media");
    const actual = await fileSha256(media, "ASR source media");
    if (actual !== source.sha256.toLowerCase()) fail("ASR source media SHA-256 changed since import: " + source.id);
  }
  const evidence = await verifyPlanEvidence(plan, { baseDir: path.dirname(planInput.file) });
  return {
    timeline,
    timelinePath: timelineInput.file,
    timelineSha256: timelineInput.sha256,
    editPlan: plan,
    editPlanPath: planInput.file,
    editPlanSha256: planInput.sha256,
    evidence: { verified: evidence.verified.map((row) => row.sourceId), unlocated: evidence.unlocated.map((row) => ({ sourceId: row.sourceId, reason: row.reason })) },
  };
}

function validateSegmentRow(segment, index, clockKind) {
  const label = "segments[" + index + "]";
  object(segment, label);
  stableId(segment.id, label + ".id");
  if (segment.renderer === "huashu-motion-template") {
    onlyKeys(segment, new Set(["id", "renderer", "templateId", "variables", "eventScenePath", "eventSceneSha256", "startSec", "endSec", "unitIds"]), label);
    stableId(segment.templateId, label + ".templateId");
    object(segment.variables, label + ".variables");
    if (segment.eventScenePath != null && (typeof segment.eventScenePath !== "string" || !segment.eventScenePath.trim())) fail(label + ".eventScenePath must be a non-empty path");
    if (segment.eventSceneSha256 != null) hashField(segment.eventSceneSha256, label + ".eventSceneSha256");
    if ((segment.eventScenePath == null) !== (segment.eventSceneSha256 == null)) fail(label + ".eventScenePath and eventSceneSha256 must be supplied together");
  } else if (segment.renderer === "motion-scene") {
    onlyKeys(segment, new Set(["id", "renderer", "scenePath", "sceneSha256", "drawModulePath", "drawModuleSha256", "templateEffects", "startSec", "endSec", "unitIds"]), label);
    if (typeof segment.scenePath !== "string" || !segment.scenePath.trim()) fail(label + ".scenePath is required for motion-scene");
    hashField(segment.sceneSha256, label + ".sceneSha256");
    if ((segment.drawModulePath == null) !== (segment.drawModuleSha256 == null)) fail(label + ".drawModulePath and drawModuleSha256 must be supplied together for a custom draw module");
    if (segment.drawModulePath != null && (typeof segment.drawModulePath !== "string" || !segment.drawModulePath.trim())) fail(label + " custom draw module requires drawModulePath and drawModuleSha256");
    if (segment.drawModuleSha256 != null) hashField(segment.drawModuleSha256, label + ".drawModuleSha256");
    if (segment.templateEffects != null && !ALLOWED_TEMPLATE_EFFECTS.has(segment.templateEffects)) fail(label + ".templateEffects is not in the assembler allowlist");
  } else fail(label + ".renderer must be huashu-motion-template or motion-scene");
  if (clockKind === "film-global") {
    finite(segment.startSec, label + ".startSec", 0);
    finite(segment.endSec, label + ".endSec", 0);
    if (Object.hasOwn(segment, "unitIds")) fail(label + " must not contain unitIds under film-global clock");
  } else {
    if (!Array.isArray(segment.unitIds) || segment.unitIds.length === 0) fail(label + ".unitIds must be a non-empty list under asrcut-v2 clock");
    if (Object.hasOwn(segment, "startSec") || Object.hasOwn(segment, "endSec")) fail(label + " must not contain hand-written startSec/endSec under asrcut-v2 clock");
  }
}

function sceneDuration(scene, label) {
  object(scene, label);
  finite(scene.width, label + ".width", 1);
  finite(scene.height, label + ".height", 1);
  finite(scene.fps, label + ".fps", 1);
  finite(scene.duration, label + ".duration", Number.EPSILON);
  return scene.duration;
}
function collectPhases(scene) {
  const rows = [];
  if (Array.isArray(scene.phases)) rows.push(...scene.phases.map((phase) => ({ phase, owner: "scene.phases" })));
  for (const objectRow of scene.objects || []) {
    const data = objectRow?.data;
    if (Array.isArray(data?.phases)) rows.push(...data.phases.map((phase) => ({ phase, owner: "objects." + (objectRow.id || "?") + ".data.phases" })));
  }
  return rows;
}

/** Keep existing Motion timing intact; only accept scenes that already render the compiled frame count. */
export function validateMotionSceneForSegment(scene, item, label = "Motion scene") {
  const duration = sceneDuration(scene, label);
  if (scene.width !== item.width || scene.height !== item.height || scene.fps !== item.fps) {
    fail(label + " must match the film's dimensions and frame rate");
  }
  const frameAlignedDuration = item.localDurationSec;
  const durationDelta = Math.abs(duration - frameAlignedDuration);
  if (durationDelta > 1 / item.fps + TIME_EPSILON || Math.round(duration * item.fps) !== item.frameCount) {
    fail(label + ".duration must already compile to the segment's " + item.frameCount + " output frames; recompile the segment scene instead of changing its duration");
  }

  const phases = collectPhases(scene);
  const localWindowEnd = Math.min(duration, frameAlignedDuration);
  const events = MotionOps.findSceneAudioEvents(scene);
  const requiredPhaseBasis = new Map();
  for (const [eventId, event] of events) {
    if (event.timeBasis === "scene-local" && event.timeSec > localWindowEnd + TIME_EPSILON) {
      fail("scene-local event " + eventId + " falls outside the rendered local duration of segment " + item.id);
    }
    if (event.phaseId) requiredPhaseBasis.set(event.phaseId, event.timeBasis);
  }
  for (const objectRow of scene.objects || []) {
    const effects = objectRow?.data?.motionEffects;
    if (!Array.isArray(effects)) continue;
    for (const effect of effects) {
      if (effect?.phaseId && !requiredPhaseBasis.has(effect.phaseId)) requiredPhaseBasis.set(effect.phaseId, scene.timeBasis);
    }
  }
  for (const [phaseId, referencedBasis] of requiredPhaseBasis) {
    const matches = phases.filter((row) => row.phase?.id === phaseId);
    if (matches.length !== 1) fail("source phase reference must resolve to exactly one phase: " + phaseId);
    const phase = matches[0].phase;
    const phaseBasis = phase.timeBasis || referencedBasis || scene.timeBasis;
    if (phaseBasis !== "scene-local") continue;
    const startSec = finite(phase.startSec, "phase " + phaseId + ".startSec", 0);
    const endSec = phase.endSec != null
      ? finite(phase.endSec, "phase " + phaseId + ".endSec", 0)
      : startSec + finite(phase.durationSec, "phase " + phaseId + ".durationSec", Number.EPSILON);
    if (endSec <= startSec || endSec > localWindowEnd + TIME_EPSILON) {
      fail("scene-local phase " + phaseId + " falls outside the rendered local duration of segment " + item.id);
    }
  }
  return duration;
}

export function projectFilmEvents(schedule, sourceBySegment, outputManifestPath) {
  const phases = new Map();
  const phaseRows = [];
  const events = [];
  const bindings = [];
  const sourceScenes = [];
  const audioTimeMaps = [];
  const seenEventIds = new Set();
  for (const item of schedule.segments) {
    const sourceScene = sourceBySegment.get(item.id);
    const mapId = "time:" + item.id;
    const mapRow = {
      id: mapId,
      segmentId: item.id,
      localStartSec: 0,
      localEndSec: item.localDurationSec,
      filmStartSec: item.exactStartSec,
      speed: item.localDurationSec / item.exactDurationSec,
      sourceRange: item.sourceRange,
      frameRange: item.frameRange,
      frameStartResidualSec: item.frameStartResidualSec,
      frameEndResidualSec: item.frameEndResidualSec,
      roundingResidualSamples: item.roundingResidualSamples,
    };
    if (!Number.isFinite(mapRow.speed) || mapRow.speed < 0.0625 || mapRow.speed > 16) fail("segment " + item.id + " local/global speed is outside the shared audio timeMap range");
    audioTimeMaps.push(mapRow);
    if (!sourceScene) continue;
    const relativeSourcePath = relativeToManifest(outputManifestPath, sourceScene.file);
    sourceScenes.push({ segmentId: item.id, path: relativeSourcePath, sha256: sourceScene.sha256 });
    const eventWindowEndSec = Math.min(sourceScene.localDurationSec ?? sceneDuration(sourceScene.scene, "event scene " + item.id), mapRow.localEndSec);
    const found = MotionOps.findSceneAudioEvents(sourceScene.scene);
    const sourcePhaseRows = collectPhases(sourceScene.scene);
    for (const [eventId, row] of found) {
      if (seenEventIds.has(eventId)) fail("shared audio event IDs must be unique across the whole film: " + eventId);
      seenEventIds.add(eventId);
      if (!new Set(["film-global", "scene-local"]).has(row.timeBasis)) fail("shared audio event " + eventId + " has unknown timeBasis; declare film-global or scene-local");
      if (row.timeBasis === "scene-local" && row.timeSec > eventWindowEndSec + TIME_EPSILON) {
        fail("scene-local event " + eventId + " falls outside the rendered local duration of segment " + item.id);
      }
      if (row.phaseId) {
        const matches = sourcePhaseRows.filter((item) => item.phase?.id === row.phaseId);
        if (matches.length !== 1) fail("source event " + eventId + " phaseId must resolve to exactly one source phase: " + row.phaseId);
        const phase = matches[0].phase;
        if (row.timeBasis === "scene-local" && (phase.timeBasis || row.timeBasis || sourceScene.scene.timeBasis) === "scene-local") {
          const startSec = finite(phase.startSec, "phase " + row.phaseId + ".startSec", 0);
          const endSec = phase.endSec != null
            ? finite(phase.endSec, "phase " + row.phaseId + ".endSec", 0)
            : startSec + finite(phase.durationSec, "phase " + row.phaseId + ".durationSec", Number.EPSILON);
          if (endSec <= startSec || endSec > eventWindowEndSec + TIME_EPSILON) {
            fail("scene-local phase " + row.phaseId + " falls outside the rendered local duration of segment " + item.id);
          }
        }
        const copiedPhase = structuredClone(matches[0].phase);
        const prior = phases.get(row.phaseId);
        if (prior && canonical(prior) !== canonical(copiedPhase)) fail("phase IDs must be unique across film source scenes: " + row.phaseId);
        if (!prior) {
          phases.set(row.phaseId, copiedPhase);
          phaseRows.push(copiedPhase);
        }
      }
      const copiedEvent = structuredClone(row.source);
      copiedEvent.timeBasis = row.timeBasis;
      if (row.phaseId) copiedEvent.phaseId = row.phaseId;
      events.push(copiedEvent);
      bindings.push({
        eventId,
        sourceEventId: eventId,
        segmentId: item.id,
        sourceScenePath: relativeSourcePath,
        sourceSceneSha256: sourceScene.sha256,
        sourceOwner: row.owner,
        sourceTimeBasis: row.timeBasis,
        sourcePhaseId: row.phaseId,
        compiledPhaseId: row.phaseId,
        timeMapId: row.timeBasis === "scene-local" ? mapId : null,
      });
    }
  }
  const compiledScene = {
    version: 1,
    width: schedule.width,
    height: schedule.height,
    fps: schedule.fps,
    duration: schedule.totalFrameCount / schedule.fps,
    timeBasis: "film-global",
    phases: phaseRows,
    audioEvents: events,
  };
  return { compiledScene, audioTimeMaps, audioEventBindings: bindings, sourceScenes };
}

async function prepareEventProjection(schedule, outputManifestPath, workRoot, sourceBySegment) {
  const projection = projectFilmEvents(schedule, sourceBySegment, outputManifestPath);
  const scenePath = path.join(workRoot, "compiled-audio-event-scene.json");
  const compiledScene = projection.compiledScene;
  const bytes = Buffer.from(JSON.stringify(compiledScene, null, 2) + "\n");
  await writeNew(scenePath, bytes);
  return {
    audioEventScene: { path: relativeToManifest(outputManifestPath, scenePath), sha256: sha256(bytes), format: "motion-scene-v1" },
    audioTimeMaps: projection.audioTimeMaps,
    audioEventBindings: projection.audioEventBindings,
    sourceScenes: projection.sourceScenes,
  };
}

function childEnv(workRoot) {
  return { ...process.env, OM_SAMPLES: "off", TMPDIR: workRoot, TMP: workRoot, TEMP: workRoot };
}
function run(executable, args, { cwd, env, label }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [], stderr = [];
    let stdoutBytes = 0, stderrBytes = 0;
    const limit = 8 * 1024 * 1024;
    child.stdout.on("data", (chunk) => { stdoutBytes += chunk.length; if (stdoutBytes <= limit) stdout.push(chunk); });
    child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; if (stderrBytes <= limit) stderr.push(chunk); });
    child.on("error", (error) => reject(new Error(label + " could not start: " + error.message)));
    child.on("close", (code, signal) => {
      const out = Buffer.concat(stdout).toString("utf8"), err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(label + " failed (exit=" + code + (signal ? ", signal=" + signal : "") + "): " + (err || out).trim()));
      else if (stdoutBytes > limit || stderrBytes > limit) reject(new Error(label + " exceeded the 8 MiB diagnostic limit"));
      else resolve({ stdout: out, stderr: err });
    });
  });
}
async function renderOne(item, blueprintDir, jobRoot, options) {
  const segment = item.segment;
  const output = path.join(jobRoot, "segments", String(item.frameRange.startFrame).padStart(8, "0") + "-" + safeName(item.id) + ".mp4");
  const cacheDir = path.join(jobRoot, "render-cache", safeName(item.id));
  const receiptPath = path.join(jobRoot, "receipts", String(item.frameRange.startFrame).padStart(8, "0") + "-" + safeName(item.id) + ".json");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.mkdir(path.dirname(receiptPath), { recursive: true });
  const localDurationSec = item.localDurationSec;
  const env = childEnv(path.join(jobRoot, "tmp"));
  await fs.mkdir(env.TMPDIR, { recursive: true });
  let result;
  let sourceScenePath = null;
  let sourceScene = null;
  let sourceSceneSha256 = null;
  let derivedScenePath = null;
  let derivedSceneSha256 = null;
  if (segment.renderer === "huashu-motion-template") {
    if (Object.hasOwn(segment.variables, "duration") && Math.abs(finite(segment.variables.duration, "segments." + item.id + ".variables.duration", 0) - localDurationSec) > TIME_EPSILON) {
      fail("native template variables.duration must match the compiled output-frame duration for segment " + item.id);
    }
    const variables = { ...segment.variables, duration: localDurationSec };
    const spec = { format: NATIVE_SPEC_FORMAT, templateId: segment.templateId, fps: item.fps, width: item.width, height: item.height, variables };
    const specPath = path.join(jobRoot, "specs", safeName(item.id) + ".json");
    await fs.mkdir(path.dirname(specPath), { recursive: true });
    await writeNew(specPath, JSON.stringify(spec, null, 2) + "\n");
    const args = [templateCli, "render", segment.templateId, "--spec", specPath, "--output", output, "--work-root", cacheDir, "--manifest", receiptPath];
    if (options.browser) args.push("--browser", options.browser);
    if (options.ffmpeg) args.push("--ffmpeg", options.ffmpeg);
    result = await run(process.execPath, args, { cwd: skillDir, env, label: "Huashu native template render " + item.id });
    if (segment.eventScenePath) {
      const source = await hashCheckedInput(blueprintDir, segment.eventScenePath, segment.eventSceneSha256, "native template event scene " + item.id);
      sourceScenePath = source.file; sourceSceneSha256 = source.sha256; sourceScene = JSON.parse(source.bytes.toString("utf8"));
    }
  } else {
    const sceneInput = await hashCheckedInput(blueprintDir, segment.scenePath, segment.sceneSha256, "Motion scene " + item.id);
    sourceScenePath = sceneInput.file; sourceSceneSha256 = sceneInput.sha256; sourceScene = JSON.parse(sceneInput.bytes.toString("utf8"));
    validateMotionSceneForSegment(sourceScene, item, "Motion scene " + item.id);
    const scenePath = path.join(jobRoot, "scenes", safeName(item.id) + ".json");
    await fs.mkdir(path.dirname(scenePath), { recursive: true });
    await writeNew(scenePath, sceneInput.bytes);
    derivedScenePath = scenePath;
    derivedSceneSha256 = sha256(sceneInput.bytes);
    const args = [motionCli, "--scene", scenePath, "--output", output, "--cache-dir", cacheDir];
    if (options.browser) args.push("--browser", options.browser);
    if (options.ffmpeg) args.push("--ffmpeg", options.ffmpeg);
    if (segment.drawModulePath) {
      const drawModule = await hashCheckedInput(blueprintDir, segment.drawModulePath, segment.drawModuleSha256, "custom draw module " + item.id);
      args.push("--draw-module", drawModule.file);
    }
    if (segment.templateEffects) args.push("--template-effects", segment.templateEffects);
    result = await run(process.execPath, args, { cwd: skillDir, env, label: "Motion scene render " + item.id });
  }
  let actualReceiptPath = receiptPath;
  if (segment.renderer === "motion-scene") {
    const match = result.stdout.match(/^MANIFEST\s+(.+)$/m);
    actualReceiptPath = match ? path.resolve(match[1].trim()) : null;
  }
  const outputHash = await fileSha256(output, "rendered segment " + item.id);
  const eventSource = sourceScene ? { file: sourceScenePath, sha256: sourceSceneSha256, scene: sourceScene, localDurationSec: sceneDuration(sourceScene, "event scene " + item.id) } : null;
  return {
    output,
    outputSha256: outputHash.sha256,
    expectedFrameCount: item.frameCount,
    receiptPath: actualReceiptPath,
    childStdout: result.stdout,
    eventSource,
    sourceScenePath,
    sourceSceneSha256,
    derivedScenePath,
    derivedSceneSha256,
    render: { segmentId: item.id, renderer: segment.renderer, templateId: segment.templateId || null, frameRange: item.frameRange, outputPath: output },
  };
}

function concatEscape(file) { return "file '" + file.replace(/'/g, "'\\''") + "'\n"; }
function ffprobePath(ffmpeg) {
  if (path.isAbsolute(ffmpeg)) return path.join(path.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  return "ffprobe";
}
async function probeVideo(ffprobe, file, label) {
  const result = await run(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file], { cwd: path.dirname(file), env: childEnv(path.dirname(file)), label: label + " ffprobe" });
  const data = JSON.parse(result.stdout);
  const videos = (data.streams || []).filter((row) => row.codec_type === "video");
  const audios = (data.streams || []).filter((row) => row.codec_type === "audio");
  if (videos.length !== 1 || audios.length !== 0) fail(label + " must contain exactly one video stream and no audio stream");
  const video = videos[0];
  const rate = String(video.avg_frame_rate || video.r_frame_rate || "").split("/").map(Number);
  const fps = rate.length === 2 && rate[1] ? rate[0] / rate[1] : NaN;
  const count = Number(video.nb_read_frames ?? video.nb_frames);
  if (!Number.isSafeInteger(count) || count < 1) fail(label + " ffprobe did not report a safe encoded frame count");
  return {
    codecName: video.codec_name,
    profile: video.profile || null,
    width: video.width,
    height: video.height,
    pixFmt: video.pix_fmt,
    fps,
    rFrameRate: video.r_frame_rate,
    avgFrameRate: video.avg_frame_rate,
    timeBase: video.time_base,
    frameCount: count,
    durationSec: Number(data.format?.duration),
  };
}
function assertCompatibleStreams(rows, schedule) {
  const first = rows[0];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index], expected = schedule.segments[index];
    if (row.width !== schedule.width || row.height !== schedule.height || Math.abs(row.fps - schedule.fps) > 1e-6) fail("segment " + expected.id + " output does not match the common 1920×1080, 30 fps film format");
    if (row.frameCount !== expected.frameCount) fail("segment " + expected.id + " encoded " + row.frameCount + " frames; expected absolute range of " + expected.frameCount);
    for (const key of ["codecName", "profile", "width", "height", "pixFmt", "rFrameRate", "avgFrameRate", "timeBase"]) {
      if (row[key] !== first[key]) fail("segment " + expected.id + " has incompatible " + key + " for hard-cut stream-copy concatenation");
    }
  }
}

async function writeManifest(file, manifest) {
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  await writeNew(file, bytes);
  return sha256(bytes);
}

/**
 * Render a film from a single authoritative blueprint and assemble its
 * picture-only, hard-cut output. This is dynamically imported by templates.mjs.
 */
export async function renderFilm({ blueprintPath, outputPath, workRoot, manifestPath, browser, ffmpeg } = {}) {
  if (!blueprintPath || !path.isAbsolute(blueprintPath)) fail("renderFilm requires an absolute blueprintPath");
  if (!outputPath || !path.isAbsolute(outputPath)) fail("renderFilm requires an absolute outputPath");
  if (!workRoot || !path.isAbsolute(workRoot)) fail("renderFilm requires an absolute same-volume workRoot");
  if (!manifestPath || !path.isAbsolute(manifestPath)) fail("renderFilm requires an absolute manifestPath");
  if (path.resolve(outputPath) === path.resolve(manifestPath)) fail("film output and manifest paths must be different");
  if (!outputPath.toLowerCase().endsWith(".mp4")) fail("picture-only film output must end in .mp4");
  if (!manifestPath.toLowerCase().endsWith(".json")) fail("film manifest output must end in .json");

  await fs.mkdir(workRoot, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await assertFreshPath(outputPath, "film output");
  await assertFreshPath(manifestPath, "film manifest");
  const blueprintInput = await fileHash(blueprintPath, "film blueprint");
  const blueprint = JSON.parse(blueprintInput.bytes.toString("utf8"));
  object(blueprint, "film blueprint");
  if (blueprint.format !== FILM_FORMAT) fail("film blueprint.format must be " + FILM_FORMAT);
  onlyKeys(blueprint, new Set(["format", "width", "height", "fps", "clock", "segments"]), "film blueprint");
  const clock = object(blueprint.clock, "film blueprint.clock");
  const asrcut = clock.kind === "asrcut-v2" ? await verifyAsrcutClock(clock, path.dirname(blueprintPath)) : null;
  const schedule = compileFilmSchedule(blueprint, asrcut?.timeline || null);
  for (const [index, segment] of blueprint.segments.entries()) validateSegmentRow(segment, index, schedule.clockKind);
  const jobRoot = path.join(workRoot, "huashu-om-" + blueprintInput.sha256.slice(0, 12) + "-" + process.pid + "-" + Date.now());
  await fs.mkdir(jobRoot, { recursive: false });
  await fs.mkdir(path.join(jobRoot, "tmp"), { recursive: true });
  await fs.mkdir(path.join(jobRoot, "concat"), { recursive: true });

  const inputPaths = [blueprintPath, templateCli, motionCli, catalogPath, vendorRoot];
  if (asrcut) inputPaths.push(asrcut.timelinePath, asrcut.editPlanPath);
  for (const segment of blueprint.segments) {
    if (segment.renderer === "motion-scene") {
      inputPaths.push(resolveInput(path.dirname(blueprintPath), segment.scenePath, "Motion scene"));
      if (segment.drawModulePath) inputPaths.push(resolveInput(path.dirname(blueprintPath), segment.drawModulePath, "custom draw module"));
    }
    if (segment.renderer === "huashu-motion-template" && segment.eventScenePath) inputPaths.push(resolveInput(path.dirname(blueprintPath), segment.eventScenePath, "native event scene"));
  }
  await assertSameVolume([...inputPaths, workRoot, path.dirname(outputPath), path.dirname(manifestPath)]);
  if (ffmpeg != null && (typeof ffmpeg !== "string" || !ffmpeg.trim() || !path.isAbsolute(ffmpeg))) fail("ffmpeg must be an absolute executable path when supplied");
  if (browser != null && (typeof browser !== "string" || !browser.trim() || !path.isAbsolute(browser))) fail("browser must be an absolute executable path when supplied");
  const ffmpegExe = ffmpeg || process.env.MOTION_FFMPEG || "ffmpeg";

  const rendered = [];
  const sourceBySegment = new Map();
  for (const item of schedule.segments) {
    const row = await renderOne(item, path.dirname(blueprintPath), jobRoot, { browser, ffmpeg: ffmpeg || null });
    rendered.push(row);
    if (row.eventSource) sourceBySegment.set(item.id, row.eventSource);
  }
  const ffprobe = ffprobePath(ffmpegExe);
  const streamRows = [];
  for (let index = 0; index < rendered.length; index += 1) {
    const probe = await probeVideo(ffprobe, rendered[index].output, "rendered segment " + schedule.segments[index].id);
    if (probe.frameCount !== rendered[index].expectedFrameCount) fail("segment " + schedule.segments[index].id + " output frame count differs from the compiled absolute range");
    streamRows.push(probe);
  }
  assertCompatibleStreams(streamRows, schedule);

  const concatFile = path.join(jobRoot, "concat", "segments.ffconcat");
  await writeNew(concatFile, rendered.map((row) => concatEscape(row.output)).join(""));
  const tempOutput = path.join(jobRoot, "picture-only.mp4");
  await run(ffmpegExe, ["-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concatFile, "-map", "0:v:0", "-an", "-c:v", "copy", "-movflags", "+faststart", tempOutput], { cwd: jobRoot, env: childEnv(path.join(jobRoot, "tmp")), label: "hard-cut picture-only concat" });
  const finalProbe = await probeVideo(ffprobe, tempOutput, "assembled film");
  if (finalProbe.frameCount !== schedule.totalFrameCount) fail("assembled film encoded " + finalProbe.frameCount + " frames; expected " + schedule.totalFrameCount);
  if (finalProbe.width !== schedule.width || finalProbe.height !== schedule.height || Math.abs(finalProbe.fps - schedule.fps) > 1e-6) fail("assembled film does not match the common film dimensions and frame rate");

  const eventProjection = await prepareEventProjection(schedule, manifestPath, jobRoot, sourceBySegment);
  const source = {
    blueprintPath: relativeToManifest(manifestPath, blueprintPath),
    blueprintSha256: blueprintInput.sha256,
    clockKind: schedule.clockKind,
  };
  if (asrcut) {
    source.timelinePath = relativeToManifest(manifestPath, asrcut.timelinePath);
    source.timelineSha256 = asrcut.timelineSha256;
    source.editPlanPath = relativeToManifest(manifestPath, asrcut.editPlanPath);
    source.editPlanSha256 = asrcut.editPlanSha256;
  }
  const outputHash = await fileSha256(tempOutput, "assembled picture-only film");
  const manifest = {
    format: MANIFEST_FORMAT,
    source,
    output: { path: relativeToManifest(manifestPath, outputPath), sha256: outputHash, kind: "picture-only-hard-cut" },
    render: { width: schedule.width, height: schedule.height, fps: schedule.fps, frameCount: schedule.totalFrameCount, durationSec: schedule.totalFrameCount / schedule.fps },
    frameClock: { kind: schedule.clockKind, method: "absolute-ceil-boundaries", fps: schedule.fps, totalFrameCount: schedule.totalFrameCount },
    segments: schedule.segments.map((item, index) => ({
      id: item.id,
      renderer: item.renderer,
      frameRange: item.frameRange,
      sourceRange: item.sourceRange,
      exactStartSec: item.exactStartSec,
      exactEndSec: item.exactEndSec,
      frameStartResidualSec: item.frameStartResidualSec,
      frameEndResidualSec: item.frameEndResidualSec,
      roundingResidualSamples: item.roundingResidualSamples,
      speed: item.speed,
      renderedOutputPath: relativeToManifest(manifestPath, rendered[index].output),
      renderedOutputSha256: rendered[index].outputSha256,
      sourceScenePath: rendered[index].sourceScenePath ? relativeToManifest(manifestPath, rendered[index].sourceScenePath) : null,
      sourceSceneSha256: rendered[index].sourceSceneSha256,
      derivedScenePath: rendered[index].derivedScenePath ? relativeToManifest(manifestPath, rendered[index].derivedScenePath) : null,
      derivedSceneSha256: rendered[index].derivedSceneSha256,
      expectedFrameCount: item.frameCount,
      observedFrameCount: streamRows[index].frameCount,
      receiptPath: relativeToManifest(manifestPath, rendered[index].receiptPath),
    })),
    ...eventProjection,
    assembly: { method: "ffmpeg-concat-demuxer-stream-copy", transition: "hard-cut", audioStream: "absent", ffprobe: finalProbe, workRoot: relativeToManifest(manifestPath, jobRoot) },
  };
  await fs.link(tempOutput, outputPath).catch((error) => fail("cannot commit film output without replacing an existing file: " + error.message));
  await fs.unlink(tempOutput);
  manifest.output.sha256 = await fileSha256(outputPath, "committed picture-only film");
  const receiptSha256 = await writeManifest(manifestPath, manifest);
  return { outputPath, manifestPath, manifestSha256: receiptSha256, frameCount: schedule.totalFrameCount, durationSec: schedule.totalFrameCount / schedule.fps, segments: rendered.length, workRoot: jobRoot };
}
