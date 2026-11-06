#!/usr/bin/env node
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { compilePlan, hashPlan, verifyPlanEvidence, writeJsonOutput } from "../../laohu-asrcut/scripts/asrcut.mjs";

const require = createRequire(import.meta.url);
const MotionOps = require("./motion-ops.js");
const MotionCore = require("./motion-core.js");
const PRECISION_ORDER = new Map([["measured", 0], ["aligned", 1], ["utterance", 2], ["estimated", 3]]);
const HASH_RE = /^[a-f0-9]{64}$/i;

function fail(message) { throw new Error(message); }
function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function stableId(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(label + " must be a non-empty stable ID");
  return value;
}
function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(label + " must be a safe integer >= " + minimum);
  return value;
}
function positiveRevision(value, label) { return integer(value, label, 1); }
function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(label + " must be a finite number");
  return value;
}
function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (isObject(value)) return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function hashFile(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}
function secondsFromUnit(value, label, sampleRateHz, allowNegative = false) {
  if (!isObject(value)) fail(label + " must be an object with value and unit");
  const amount = finite(value.value, label + ".value");
  if (!allowNegative && amount < 0) fail(label + ".value must not be negative");
  if (value.unit === "samples") {
    if (!Number.isSafeInteger(amount)) fail(label + ".value must be an integer when unit is samples");
    return amount / sampleRateHz;
  }
  if (value.unit === "seconds") return amount;
  fail(label + ".unit must be samples or seconds; frames are not accepted without an explicit target frame clock");
}
function timeRange(range, clockRate, durationSamples, label) {
  if (!isObject(range)) fail(label + " must be an object");
  integer(range.sampleRateHz, label + ".sampleRateHz", 1);
  if (range.sampleRateHz !== clockRate) fail(label + ".sampleRateHz does not match timeline.clock.sampleRateHz");
  const startSample = integer(range.startSample, label + ".startSample");
  const endSample = integer(range.endSample, label + ".endSample", 1);
  if (endSample <= startSample) fail(label + " must be a non-empty half-open sample range");
  if (endSample > durationSamples) fail(label + " extends beyond timeline.durationSamples");
  return { startSample, endSample };
}
function validateTimeline(timeline) {
  if (!isObject(timeline) || !["laohu.asrcut.timeline/1", "laohu.asrcut.timeline/2"].includes(timeline.format)) fail("timeline.format must be laohu.asrcut.timeline/1 or /2");
  const hasPresentationUnits = timeline.format === "laohu.asrcut.timeline/2";
  if (!isObject(timeline.project)) fail("timeline.project is required");
  const projectId = stableId(timeline.project.id, "timeline.project.id");
  const revision = positiveRevision(timeline.project.revision, "timeline.project.revision");
  if (!isObject(timeline.clock) || timeline.clock.unit !== "sample") fail("timeline.clock must declare unit=sample");
  const sampleRateHz = integer(timeline.clock.sampleRateHz, "timeline.clock.sampleRateHz", 1);
  const durationSamples = integer(timeline.durationSamples, "timeline.durationSamples", 1);
  if (!["draft", "frozen"].includes(timeline.state)) fail("timeline.state must be draft or frozen");
  if (!isObject(timeline.review) || !["not_requested", "pending", "approved", "changes_requested"].includes(timeline.review.status)) fail("timeline.review.status is invalid");
  if (typeof timeline.planSha256 !== "string" || !HASH_RE.test(timeline.planSha256)) fail("timeline.planSha256 must be a 64-character SHA-256 hex digest");
  if (!Array.isArray(timeline.clips)) fail("timeline.clips must be an array");
  if (hasPresentationUnits && !Array.isArray(timeline.units)) fail("timeline/2 requires continuous timeline.units");

  const clips = new Map();
  for (const [clipIndex, clip] of timeline.clips.entries()) {
    const label = "timeline.clips[" + clipIndex + "]";
    if (!isObject(clip)) fail(label + " must be an object");
    const occurrenceId = stableId(clip.occurrenceId, label + ".occurrenceId");
    if (clips.has(occurrenceId)) fail("duplicate timeline clip occurrenceId: " + occurrenceId);
    const clipRange = timeRange(clip.targetRange, sampleRateHz, durationSamples, label + ".targetRange");
    if (!Array.isArray(clip.words)) fail(label + ".words must be an array");
    if (!Array.isArray(clip.transcriptSegments)) fail(label + ".transcriptSegments must be an array");
    const words = new Map();
    for (const [wordIndex, word] of clip.words.entries()) {
      const wordLabel = label + ".words[" + wordIndex + "]";
      if (!isObject(word)) fail(wordLabel + " must be an object");
      const tokenId = stableId(word.tokenId, wordLabel + ".tokenId");
      if (words.has(tokenId)) fail("duplicate tokenId within clip occurrence " + occurrenceId + ": " + tokenId);
      if (!PRECISION_ORDER.has(word.timingPrecision)) fail(wordLabel + ".timingPrecision is unsupported or missing");
      const range = timeRange(word.targetRange, sampleRateHz, durationSamples, wordLabel + ".targetRange");
      if (range.startSample < clipRange.startSample || range.endSample > clipRange.endSample) {
        fail(wordLabel + ".targetRange must remain inside its compiled clip targetRange");
      }
      words.set(tokenId, { ...word, tokenId, range });
    }
    const segments = new Map();
    for (const [segmentIndex, segment] of clip.transcriptSegments.entries()) {
      const segmentLabel = label + ".transcriptSegments[" + segmentIndex + "]";
      if (!isObject(segment)) fail(segmentLabel + " must be an object");
      const segmentId = stableId(segment.segmentId, segmentLabel + ".segmentId");
      if (segments.has(segmentId)) fail("duplicate segmentId within clip occurrence " + occurrenceId + ": " + segmentId);
      if (!PRECISION_ORDER.has(segment.timingPrecision)) fail(segmentLabel + ".timingPrecision is unsupported or missing");
      const range = timeRange(segment.targetRange, sampleRateHz, durationSamples, segmentLabel + ".targetRange");
      if (range.startSample < clipRange.startSample || range.endSample > clipRange.endSample) {
        fail(segmentLabel + ".targetRange must remain inside its compiled clip targetRange");
      }
      segments.set(segmentId, { ...segment, segmentId, range });
    }
    clips.set(occurrenceId, { ...clip, occurrenceId, range: clipRange, words, segments });
  }
  const presentations = new Map();
  if (hasPresentationUnits) {
    let cursor = 0;
    const matchedClips = new Set();
    for (const [unitIndex, unit] of timeline.units.entries()) {
      const label = "timeline.units[" + unitIndex + "]";
      if (!isObject(unit) || !["source", "presentation"].includes(unit.kind)) fail(label + ".kind must be source or presentation");
      const range = timeRange(unit.targetRange, sampleRateHz, durationSamples, label + ".targetRange");
      if (range.startSample !== cursor) fail(label + ".targetRange must start at the preceding unit's end; units are the continuous presentation clock");
      if (unit.kind === "source") {
        const occurrenceId = stableId(unit.occurrenceId, label + ".occurrenceId");
        const clip = clips.get(occurrenceId);
        if (!clip) fail(label + " has no source-only clips view for occurrence " + occurrenceId);
        if (matchedClips.has(occurrenceId)) fail("timeline/2 units duplicate source occurrence " + occurrenceId);
        const sourceView = { ...unit };
        delete sourceView.kind;
        if (canonical(sourceView) !== canonical(timeline.clips.find((item) => item.occurrenceId === occurrenceId))) fail(label + " differs from its derived source-only clips entry");
        matchedClips.add(occurrenceId);
      } else {
        const presentationId = stableId(unit.id, label + ".id");
        if (presentations.has(presentationId)) fail("duplicate presentation ID in timeline.units: " + presentationId);
        stableId(unit.decisionId, label + ".decisionId");
        stableId(unit.reason, label + ".reason");
        stableId(unit.sceneId, label + ".sceneId");
        const durationSamples = integer(unit.durationSamples, label + ".durationSamples", 1);
        if (range.endSample - range.startSample !== durationSamples) fail(label + ".durationSamples must exactly match its targetRange");
        if (!isObject(unit.visualHandoff) || !["focus", "entryState", "exitCondition"].every((key) => typeof unit.visualHandoff[key] === "string" && unit.visualHandoff[key].trim())) fail(label + ".visualHandoff must declare focus, entryState, and exitCondition");
        if (!isObject(unit.audioHandoff) || !["continue-bed", "bed-duck", "sound-effect", "quiet", "none"].includes(unit.audioHandoff.role) || typeof unit.audioHandoff.rationale !== "string" || !unit.audioHandoff.rationale.trim()) fail(label + ".audioHandoff must declare a supported role and rationale");
        for (const key of ["occurrenceId", "coverageId", "sourceId", "sourceRange", "words", "transcriptSegments", "tokenIds", "segmentId"]) if (Object.hasOwn(unit, key)) fail(label + " cannot contain source or ASR mapping fields");
        presentations.set(presentationId, { ...unit, range });
      }
      cursor = range.endSample;
    }
    if (cursor !== durationSamples) fail("timeline/2 units must cover the complete [0, durationSamples) presentation clock");
    if (matchedClips.size !== clips.size) fail("timeline/2 units must include every source-only clips entry exactly once");
  }
  return { format: timeline.format, projectId, revision, sampleRateHz, durationSamples, planSha256: timeline.planSha256.toLowerCase(), clips, presentations };
}

function prepareSceneForTimeline(sceneInput, timeline, options = {}) {
  if (!isObject(sceneInput)) fail("scene must be an object");
  const timelineIndex = validateTimeline(timeline);
  if (timeline.format !== "laohu.asrcut.timeline/2") fail("whole-frame scene preparation is available only for timeline/2");
  const fps = finite(sceneInput.fps, "scene.fps");
  if (fps <= 0) fail("scene.fps must be greater than zero");
  const authoredDurationSec = finite(sceneInput.duration, "scene.duration");
  if (authoredDurationSec <= 0) fail("scene.duration must be greater than zero");

  const exactTimelineFrames = timelineIndex.durationSamples * fps / timelineIndex.sampleRateHz;
  const requiredFrameCount = Math.ceil(exactTimelineFrames - 1e-9);
  const authoredSceneFrameCount = Math.ceil(authoredDurationSec * fps - 1e-9);
  if (!Number.isFinite(exactTimelineFrames) || !Number.isSafeInteger(requiredFrameCount) || !Number.isSafeInteger(authoredSceneFrameCount)) {
    fail("timeline and scene must resolve to safe finite Motion frame counts");
  }
  let frameCount = Math.max(requiredFrameCount, authoredSceneFrameCount);
  if (options.lockedFrameCount != null) {
    const lockedFrameCount = integer(options.lockedFrameCount, "lockedFrameCount", 1);
    if (lockedFrameCount < requiredFrameCount) {
      fail(`locked render frame count ${lockedFrameCount} is shorter than the ${requiredFrameCount} frames required by the exact ASR-cut timeline`);
    }
    if (lockedFrameCount < authoredSceneFrameCount) {
      fail(`locked render frame count ${lockedFrameCount} would truncate the authored ${authoredSceneFrameCount}-frame scene`);
    }
    frameCount = lockedFrameCount;
  }

  const scene = cloneJson(sceneInput);
  scene.duration = frameCount / fps;
  scene.motionTimelineCoverage = {
    format: "laohu.motion.timeline-frame-coverage/1",
    timeline: {
      projectId: timelineIndex.projectId,
      revision: timelineIndex.revision,
      planSha256: timelineIndex.planSha256,
      durationSamples: timelineIndex.durationSamples,
      sampleRateHz: timelineIndex.sampleRateHz,
    },
    frameClock: {
      fps,
      requiredFrameCount,
      exactTimelineFrames,
      frameCount,
      timelineCoverageOverhangFrames: requiredFrameCount - exactTimelineFrames,
      additionalSceneFrames: frameCount - requiredFrameCount,
    },
    authoredSceneDurationSec: authoredDurationSec,
    allocatedSceneDurationSec: scene.duration,
  };
  return { scene, frameCount, coverage: scene.motionTimelineCoverage };
}

function validateBindingsSpec(spec, timelineIndex) {
  if (!isObject(spec) || !["laohu.motion.speech-bindings/1", "laohu.motion.speech-bindings/2"].includes(spec.format)) fail("bindings.format must be laohu.motion.speech-bindings/1 or /2");
  if (!isObject(spec.project)) fail("bindings.project is required");
  const projectId = stableId(spec.project.id, "bindings.project.id");
  const revision = positiveRevision(spec.project.revision, "bindings.project.revision");
  const planSha256 = typeof spec.project.planSha256 === "string" ? spec.project.planSha256.toLowerCase() : "";
  if (!HASH_RE.test(planSha256)) fail("bindings.project.planSha256 must be a 64-character SHA-256 hex digest");
  if (projectId !== timelineIndex.projectId || revision !== timelineIndex.revision || planSha256 !== timelineIndex.planSha256) {
    fail("bindings project id/revision/planSha256 does not match the supplied compiled timeline");
  }
  if (!Array.isArray(spec.bindings) || spec.bindings.length === 0) fail("bindings.bindings must contain at least one semantic binding");
  if (spec.directFilmTimeEventReview != null && !Array.isArray(spec.directFilmTimeEventReview)) fail("bindings.directFilmTimeEventReview must be an array when present");
  const bindingIds = new Set();
  const phaseIds = new Set();
  const eventIds = new Set();
  for (const [bindingIndex, binding] of spec.bindings.entries()) {
    const label = "bindings.bindings[" + bindingIndex + "]";
    if (!isObject(binding)) fail(label + " must be an object");
    const bindingId = stableId(binding.id, label + ".id");
    if (bindingIds.has(bindingId)) fail("duplicate binding id: " + bindingId);
    bindingIds.add(bindingId);
    stableId(binding.objectId, label + ".objectId");
    if (binding.allowLowPrecision != null && typeof binding.allowLowPrecision !== "boolean") fail(label + ".allowLowPrecision must be boolean when present");
    if (!Array.isArray(binding.phases) || binding.phases.length === 0) fail(label + ".phases must contain at least one phase");
    for (const [phaseIndex, phase] of binding.phases.entries()) {
      const phaseLabel = label + ".phases[" + phaseIndex + "]";
      if (!isObject(phase)) fail(phaseLabel + " must be an object");
      const phaseId = stableId(phase.id, phaseLabel + ".id");
      if (phaseIds.has(phaseId)) fail("duplicate phase id in speech bindings: " + phaseId);
      phaseIds.add(phaseId);
      validateAnchorShape(phase.anchor, phaseLabel + ".anchor");
      if (phase.anchor.kind === "presentation" && spec.format !== "laohu.motion.speech-bindings/2") fail(phaseLabel + " presentation-boundary anchors require laohu.motion.speech-bindings/2");
      secondsFromUnit(phase.offset || { value: 0, unit: "samples" }, phaseLabel + ".offset", timelineIndex.sampleRateHz, true);
      const durationSec = secondsFromUnit(phase.duration, phaseLabel + ".duration", timelineIndex.sampleRateHz);
      if (durationSec <= 0) fail(phaseLabel + ".duration must be greater than zero");
      if (phase.curve != null && typeof phase.curve !== "string") fail(phaseLabel + ".curve must be a string");
      if (phase.channels != null) validateChannelShape(phase.channels, phaseLabel + ".channels");
    }
    if (binding.events != null && !Array.isArray(binding.events)) fail(label + ".events must be an array");
    for (const [eventIndex, event] of (binding.events || []).entries()) {
      const eventLabel = label + ".events[" + eventIndex + "]";
      if (!isObject(event)) fail(eventLabel + " must be an object");
      const eventId = stableId(event.id, eventLabel + ".id");
      if (eventIds.has(eventId)) fail("duplicate event id in speech bindings: " + eventId);
      eventIds.add(eventId);
      if (!phaseIds.has(event.phaseId)) fail(eventLabel + ".phaseId must reference a phase in this binding set");
      if (event.anchor != null) validateAnchorShape(event.anchor, eventLabel + ".anchor");
      if (event.anchor?.kind === "presentation" && spec.format !== "laohu.motion.speech-bindings/2") fail(eventLabel + " presentation-boundary anchors require laohu.motion.speech-bindings/2");
      secondsFromUnit(event.offset || { value: 0, unit: "samples" }, eventLabel + ".offset", timelineIndex.sampleRateHz, true);
    }
  }
  return { phaseIds, eventIds };
}
function directFilmTimeEvents(scene) {
  const rows = [];
  const collect = (events, owner) => {
    for (const event of events || []) {
      if (!isObject(event) || !Number.isFinite(event.filmTimeSec)) continue;
      rows.push({ id: stableId(event.id, owner + " direct filmTimeSec event id"), filmTimeSec: event.filmTimeSec, owner });
    }
  };
  collect(scene.audioEvents, "scene.audioEvents");
  for (const object of scene.objects || []) collect(object && object.data && object.data.audioEvents, "object " + (object && object.id || "(unknown)") + ".data.audioEvents");
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id)) fail("direct filmTimeSec event IDs must be unique across the scene: " + row.id);
    ids.add(row.id);
  }
  return rows;
}
function reviewDirectFilmTimeEvents(scene, timelineIndex, spec) {
  if (timelineIndex.format !== "laohu.asrcut.timeline/2") return null;
  const events = directFilmTimeEvents(scene);
  const previous = scene.motionSpeechBinding;
  const previousTimeline = isObject(previous) ? previous.timeline : null;
  const changed = !isObject(previousTimeline)
    || previousTimeline.planSha256 !== timelineIndex.planSha256
    || previousTimeline.revision !== timelineIndex.revision;
  if (!changed) return {status: events.length ? "unchanged-timeline" : "no-direct-film-time-events", reviewed: events.map((event) => event.id), removedSincePreviousBinding: []};
  const previousIds = new Set((previous?.directFilmTimeEvents || []).filter((row) => isObject(row) && typeof row.id === "string").map((row) => row.id));
  const currentIds = new Set(events.map((event) => event.id));
  const removedSincePreviousBinding = [...previousIds].filter((eventId) => !currentIds.has(eventId));
  if (events.length === 0) return {status: removedSincePreviousBinding.length ? "direct-events-removed-from-input-scene" : "no-direct-film-time-events", reviewed: [], removedSincePreviousBinding};
  const decisions = spec.directFilmTimeEventReview || [];
  const byId = new Map();
  for (const entry of decisions) {
    if (!isObject(entry)) fail("directFilmTimeEventReview entries must be objects with eventId, action, and reason");
    const eventId = stableId(entry.eventId, "directFilmTimeEventReview.eventId");
    if (byId.has(eventId)) fail("duplicate direct filmTimeSec event review: " + eventId);
    if (!["retain-absolute", "remapped"].includes(entry.action)) fail("directFilmTimeEventReview " + eventId + ".action must be retain-absolute or remapped");
    stableId(entry.reason, "directFilmTimeEventReview " + eventId + ".reason");
    byId.set(eventId, entry);
  }
  const missingReview = events.filter((event) => !byId.has(event.id)).map((event) => event.id);
  const extraReview = [...byId.keys()].filter((eventId) => !currentIds.has(eventId));
  if (missingReview.length || extraReview.length) fail("timeline/2 timing changed; review every current direct filmTimeSec event by ID and remove obsolete review entries (missing: " + missingReview.join(", ") + "; obsolete: " + extraReview.join(", ") + ")");
  const previousSnapshot = new Map((previous?.directFilmTimeEvents || []).filter((row) => isObject(row) && typeof row.id === "string").map((row) => [row.id, row.filmTimeSec]));
  for (const event of events) {
    const action = byId.get(event.id).action;
    if (action === "retain-absolute" && previousSnapshot.has(event.id) && previousSnapshot.get(event.id) !== event.filmTimeSec) {
      fail("direct filmTimeSec event " + event.id + " changed but was marked retain-absolute");
    }
    if (action === "remapped" && previousSnapshot.has(event.id) && previousSnapshot.get(event.id) === event.filmTimeSec) {
      fail("direct filmTimeSec event " + event.id + " was marked remapped but still has its previous absolute time; update the event in the input scene first");
    }
  }
  return {
    status: "explicitly-reviewed-after-timeline-change",
    reviewed: events.map((event) => ({id: event.id, action: byId.get(event.id).action, reason: byId.get(event.id).reason, filmTimeSec: event.filmTimeSec})),
    removedSincePreviousBinding,
    note: "Direct filmTimeSec values remain absolute and are never shifted by source-timeline recompilation.",
  };
}
function validateAnchorShape(anchor, label) {
  if (!isObject(anchor)) fail(label + " must be an object");
  if (anchor.kind === "presentation") {
    stableId(anchor.presentationId, label + ".presentationId");
    for (const key of ["clipOccurrenceId", "tokenId", "segmentId", "firstTokenId", "lastTokenId"]) {
      if (Object.hasOwn(anchor, key)) fail(label + " presentation anchors cannot claim source clip, token, or segment identifiers");
    }
    if (!["start", "end"].includes(anchor.edge)) fail(label + ".edge must be start or end");
    return;
  }
  stableId(anchor.clipOccurrenceId, label + ".clipOccurrenceId");
  if (anchor.kind === "point") {
    stableId(anchor.tokenId, label + ".tokenId");
  } else if (anchor.kind === "segment") {
    stableId(anchor.segmentId, label + ".segmentId");
  } else if (anchor.kind === "span") {
    stableId(anchor.firstTokenId, label + ".firstTokenId");
    stableId(anchor.lastTokenId, label + ".lastTokenId");
  } else fail(label + ".kind must be point or span");
  if (!["start", "end"].includes(anchor.edge)) fail(label + ".edge must be start or end");
}
function validateChannelShape(channels, label) {
  if (!isObject(channels)) fail(label + " must be an object keyed by channel name");
  const allowed = new Set(["from", "to", "curve", "offset", "duration", "anchor"]);
  for (const [name, channel] of Object.entries(channels)) {
    if (!name.trim() || !isObject(channel)) fail(label + "." + name + " must be an object");
    for (const key of Object.keys(channel)) if (!allowed.has(key)) fail(label + "." + name + " has unsupported key " + key);
    for (const key of ["from", "to"]) if (channel[key] != null) finite(channel[key], label + "." + name + "." + key);
    if (channel.curve != null && typeof channel.curve !== "string") fail(label + "." + name + ".curve must be a string");
    if (channel.offset != null) secondsFromUnit(channel.offset, label + "." + name + ".offset", 1, true);
    if (channel.duration != null) secondsFromUnit(channel.duration, label + "." + name + ".duration", 1);
    if (channel.duration != null && secondsFromUnit(channel.duration, label + "." + name + ".duration", 1) <= 0) fail(label + "." + name + ".duration must be greater than zero");
    if (channel.anchor != null && !(typeof channel.anchor === "string" || isObject(channel.anchor))) fail(label + "." + name + ".anchor must be a string or object");
  }
}
function resolveAnchor(anchor, timelineIndex) {
  if (anchor.kind === "presentation") {
    const presentation = timelineIndex.presentations.get(anchor.presentationId);
    if (!presentation) fail("anchor presentationId is missing from this compiled timeline: " + anchor.presentationId);
    const sample = anchor.edge === "start" ? presentation.range.startSample : presentation.range.endSample;
    return {
      presentationId: presentation.id,
      tokenIds: [],
      targetSample: sample,
      filmSec: sample / timelineIndex.sampleRateHz,
      timingPrecision: "project-sample-boundary",
      lowPrecision: false,
    };
  }
  const clip = timelineIndex.clips.get(anchor.clipOccurrenceId);
  if (!clip) fail("anchor clipOccurrenceId is missing, deleted, or ambiguous in this compiled timeline: " + anchor.clipOccurrenceId);
  let words;
  if (anchor.kind === "point") {
    const word = clip.words.get(anchor.tokenId);
    if (!word) fail("anchor tokenId is missing/deleted in clip occurrence " + anchor.clipOccurrenceId + ": " + anchor.tokenId);
    words = [word];
  } else if (anchor.kind === "segment") {
    const segment = clip.segments.get(anchor.segmentId);
    if (!segment) fail("anchor segmentId is missing/deleted in clip occurrence " + anchor.clipOccurrenceId + ": " + anchor.segmentId);
    const sample = anchor.edge === "start" ? segment.range.startSample : segment.range.endSample;
    const lowPrecision = PRECISION_ORDER.get(segment.timingPrecision) >= PRECISION_ORDER.get("utterance");
    return {
      clipOccurrenceId: clip.occurrenceId,
      tokenIds: [],
      segmentId: segment.segmentId,
      targetSample: sample,
      filmSec: sample / timelineIndex.sampleRateHz,
      timingPrecision: segment.timingPrecision,
      lowPrecision,
    };
  } else {
    const first = clip.words.get(anchor.firstTokenId);
    const last = clip.words.get(anchor.lastTokenId);
    if (!first || !last) fail("span anchor token is missing/deleted in clip occurrence " + anchor.clipOccurrenceId);
    const firstIndex = clip.words.has(first.tokenId) ? [...clip.words.keys()].indexOf(first.tokenId) : -1;
    const lastIndex = clip.words.has(last.tokenId) ? [...clip.words.keys()].indexOf(last.tokenId) : -1;
    if (firstIndex < 0 || lastIndex < firstIndex) fail("span anchor firstTokenId must precede lastTokenId in the same compiled clip");
    words = [...clip.words.values()].slice(firstIndex, lastIndex + 1);
    if (words.length !== lastIndex - firstIndex + 1) fail("span anchor is not a contiguous token sequence");
  }
  const precision = words.reduce((worst, word) => PRECISION_ORDER.get(word.timingPrecision) > PRECISION_ORDER.get(worst) ? word.timingPrecision : worst, "measured");
  const isLowPrecision = PRECISION_ORDER.get(precision) >= PRECISION_ORDER.get("utterance");
  const sample = anchor.kind === "point"
    ? (anchor.edge === "start" ? words[0].range.startSample : words[0].range.endSample)
    : (anchor.edge === "start" ? words[0].range.startSample : words[words.length - 1].range.endSample);
  return {
    clipOccurrenceId: clip.occurrenceId,
    tokenIds: words.map((word) => word.tokenId),
    targetSample: sample,
    filmSec: sample / timelineIndex.sampleRateHz,
    timingPrecision: precision,
    lowPrecision: isLowPrecision,
  };
}
function removePreviousGenerated(scene) {
  const previous = scene.motionSpeechBinding;
  if (!isObject(previous) || previous.format !== "laohu.motion.speech-binding-receipt/1") return scene;
  const phaseIds = new Set(Array.isArray(previous.generatedPhaseIds) ? previous.generatedPhaseIds : []);
  const eventIds = new Set(Array.isArray(previous.generatedEventIds) ? previous.generatedEventIds : []);
  if (Array.isArray(scene.phases)) scene.phases = scene.phases.filter((phase) => !phaseIds.has(phase && phase.id));
  if (Array.isArray(scene.audioEvents)) scene.audioEvents = scene.audioEvents.filter((event) => !eventIds.has(event && event.id));
  for (const object of scene.objects || []) {
    if (object && object.data && Array.isArray(object.data.phases)) object.data.phases = object.data.phases.filter((phase) => !phaseIds.has(phase && phase.id));
    if (object && object.data && Array.isArray(object.data.audioEvents)) object.data.audioEvents = object.data.audioEvents.filter((event) => !eventIds.has(event && event.id));
  }
  delete scene.motionSpeechBinding;
  return scene;
}
function allExistingIds(scene) {
  const phaseIds = new Set();
  const eventIds = new Set();
  for (const phase of scene.phases || []) if (phase && typeof phase.id === "string") phaseIds.add(phase.id);
  for (const event of scene.audioEvents || []) if (event && typeof event.id === "string") eventIds.add(event.id);
  for (const object of scene.objects || []) {
    for (const phase of (object && object.data && object.data.phases) || []) if (phase && typeof phase.id === "string") phaseIds.add(phase.id);
    for (const event of (object && object.data && object.data.audioEvents) || []) if (event && typeof event.id === "string") eventIds.add(event.id);
  }
  return { phaseIds, eventIds };
}
function phaseChannels(channels, sampleRateHz, label) {
  if (channels == null) return {};
  const result = {};
  for (const [name, spec] of Object.entries(channels)) {
    const channel = {};
    if (spec.from != null) channel.from = spec.from;
    if (spec.to != null) channel.to = spec.to;
    if (spec.curve != null) channel.curve = spec.curve;
    if (spec.offset != null) channel.offsetSec = secondsFromUnit(spec.offset, label + "." + name + ".offset", sampleRateHz, true);
    if (spec.duration != null) channel.durationSec = secondsFromUnit(spec.duration, label + "." + name + ".duration", sampleRateHz);
    if (spec.anchor != null) channel.anchor = cloneJson(spec.anchor);
    result[name] = channel;
  }
  return result;
}
async function verifyPlanAndTimeline(plan, timeline, planBaseDir = process.cwd()) {
  if (!isObject(plan) || !["laohu.asrcut.edit-plan/1", "laohu.asrcut.edit-plan/2"].includes(plan.format)) fail("plan must be the current laohu.asrcut.edit-plan/1 or /2 edit plan");
  const computedHash = hashPlan(plan);
  if (computedHash !== timeline.planSha256) fail("timeline.planSha256 does not match hashPlan(current edit plan)");
  const compiled = compilePlan(plan);
  if (canonical(compiled) !== canonical(timeline)) fail("timeline does not exactly match compilePlan(current edit plan); recompile and use the matching timeline");
  const sourceHashChecks = [];
  for (const source of plan.sources || []) {
    if (!source.sha256) {
      sourceHashChecks.push({ sourceId: source.id, status: "unavailable", expectedSha256: null });
      continue;
    }
    if (!source.mediaPath) {
      sourceHashChecks.push({ sourceId: source.id, status: "unavailable", expectedSha256: source.sha256 });
      continue;
    }
    const mediaPath = path.isAbsolute(source.mediaPath) ? source.mediaPath : path.resolve(planBaseDir, source.mediaPath);
    let actualHash;
    try {
      actualHash = await hashFile(mediaPath);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") fail("source media is unavailable for SHA-256 verification: " + source.id);
      throw error;
    }
    if (actualHash !== source.sha256.toLowerCase()) fail("source media SHA-256 changed since ASR import: " + source.id);
    sourceHashChecks.push({ sourceId: source.id, status: "verified", expectedSha256: source.sha256.toLowerCase(), actualSha256: actualHash });
  }
  const evidenceVerification = await verifyPlanEvidence(plan, { baseDir: planBaseDir });
  const transcriptEvidenceChecks = {
    verified: evidenceVerification.verified.map(({ sourceId, sha256: evidenceSha256 }) => ({ sourceId, status: "verified", sha256: evidenceSha256 })),
    unlocated: evidenceVerification.unlocated.map(({ sourceId, sha256: evidenceSha256, reason }) => ({ sourceId, status: "unlocated", sha256: evidenceSha256, reason })),
  };
  return { sourceHashChecks, transcriptEvidenceChecks };
}
async function bindSpeechTimeline(sceneInput, timeline, spec, options = {}) {
  if (!isObject(sceneInput)) fail("scene must be an object");
  const preview = options.preview === true;
  const timelineIndex = validateTimeline(timeline);
  const timelineDurationSec = timelineIndex.durationSamples / timelineIndex.sampleRateHz;
  if (timeline.state === "draft" && !preview) fail("draft timeline requires explicit preview=true; formal binding requires a frozen timeline");
  const specIds = validateBindingsSpec(spec, timelineIndex);
  const verification = await verifyPlanAndTimeline(options.plan, timeline, options.planBaseDir || process.cwd());
  const { sourceHashChecks, transcriptEvidenceChecks } = verification;
  let prepared;
  if (timeline.format === "laohu.asrcut.timeline/2") {
    prepared = prepareSceneForTimeline(sceneInput, timeline, { lockedFrameCount: options.lockedFrameCount });
  } else {
    if (options.lockedFrameCount != null) fail("lockedFrameCount applies only to timeline/2 frame preparation");
    MotionCore.assertValidScene(sceneInput);
    if (sceneInput.duration + 1e-9 < timelineDurationSec) fail("scene.duration is shorter than the compiled timeline; extend the scene using its native project workflow before binding");
    prepared = { scene: cloneJson(sceneInput), coverage: null };
  }
  const directTimeEventReview = reviewDirectFilmTimeEvents(sceneInput, timelineIndex, spec);
  const scene = removePreviousGenerated(prepared.scene);
  const existing = allExistingIds(scene);
  for (const phaseId of specIds.phaseIds) if (existing.phaseIds.has(phaseId)) fail("speech phase id collides with an existing scene phase: " + phaseId);
  for (const eventId of specIds.eventIds) if (existing.eventIds.has(eventId)) fail("speech event id collides with an existing scene event: " + eventId);

  const allGeneratedPhaseIds = [];
  const allGeneratedEventIds = [];
  const anchorMap = [];
  const localPhases = new Map();
  const pendingEvents = [];
  for (const binding of spec.bindings) {
    const matches = (scene.objects || []).filter((object) => object && object.id === binding.objectId);
    if (matches.length !== 1) fail("binding objectId must match exactly one scene object: " + binding.objectId);
    const object = matches[0];
    if (typeof object.type !== "string" || !object.type.startsWith("custom:")) fail("speech binding target must be an existing custom renderer object: " + binding.objectId);
    if (object.data == null) object.data = {};
    if (!isObject(object.data)) fail("speech binding target object.data must be an object: " + binding.objectId);
    if (object.data.phases == null) object.data.phases = [];
    if (!Array.isArray(object.data.phases)) fail("speech binding target object.data.phases must be an array: " + binding.objectId);

    const phaseAnchors = new Map();
    for (const phaseSpec of binding.phases) {
      const resolved = resolveAnchor(phaseSpec.anchor, timelineIndex);
      if (resolved.lowPrecision && !binding.allowLowPrecision) {
        fail("phase " + phaseSpec.id + " is anchored to " + resolved.timingPrecision + " timing; set allowLowPrecision=true only when an approximate cue is acceptable");
      }
      const offsetSec = secondsFromUnit(phaseSpec.offset || { value: 0, unit: "samples" }, "phase " + phaseSpec.id + ".offset", timelineIndex.sampleRateHz, true);
      const durationSec = secondsFromUnit(phaseSpec.duration, "phase " + phaseSpec.id + ".duration", timelineIndex.sampleRateHz);
      const startSec = resolved.filmSec + offsetSec;
      const endSec = startSec + durationSec;
      if (startSec < 0 || endSec > timelineDurationSec + 1e-9) fail("phase " + phaseSpec.id + " falls outside the compiled timeline");
      const speechAnchor = resolved.presentationId
        ? {
          kind: "presentation",
          edge: phaseSpec.anchor.edge,
          presentationId: resolved.presentationId,
          targetSample: resolved.targetSample,
          timingPrecision: resolved.timingPrecision,
        }
        : {
          kind: phaseSpec.anchor.kind,
          edge: phaseSpec.anchor.edge,
          clipOccurrenceId: resolved.clipOccurrenceId,
          tokenIds: resolved.tokenIds,
          ...(resolved.segmentId ? { segmentId: resolved.segmentId } : {}),
          targetSample: resolved.targetSample,
          timingPrecision: resolved.timingPrecision,
        };
      const phase = {
        id: phaseSpec.id,
        startSec,
        durationSec,
        timeBasis: "film-global",
        speechAnchor,
      };
      if (phaseSpec.curve != null) phase.curve = phaseSpec.curve;
      const channels = phaseChannels(phaseSpec.channels, timelineIndex.sampleRateHz, "phase " + phaseSpec.id + ".channels");
      if (Object.keys(channels).length) phase.channels = channels;
      // Exercise the same evaluator used by the custom renderer before writing.
      MotionOps.sampleChannels(startSec, phase);
      MotionOps.sampleChannels(endSec, phase);
      object.data.phases.push(phase);
      localPhases.set(phase.id, { phase, bindingId: binding.id, objectId: binding.objectId });
      phaseAnchors.set(phase.id, { resolved, startSec });
      allGeneratedPhaseIds.push(phase.id);
      anchorMap.push({
        bindingId: binding.id,
        phaseId: phase.id,
        objectId: binding.objectId,
        ...(resolved.presentationId ? { presentationId: resolved.presentationId } : { clipOccurrenceId: resolved.clipOccurrenceId, tokenIds: resolved.tokenIds }),
        ...(resolved.segmentId ? { segmentId: resolved.segmentId } : {}),
        anchorTargetSample: resolved.targetSample,
        anchorFilmSec: resolved.filmSec,
        phaseStartSec: startSec,
        phaseEndSec: endSec,
        timingPrecision: resolved.timingPrecision,
      });
    }
    for (const eventSpec of binding.events || []) {
      const phaseRecord = localPhases.get(eventSpec.phaseId);
      if (!phaseRecord || phaseRecord.bindingId !== binding.id) fail("event " + eventSpec.id + " phaseId must reference a phase in the same binding");
      const anchor = eventSpec.anchor || binding.phases.find((phase) => phase.id === eventSpec.phaseId).anchor;
      const resolved = resolveAnchor(anchor, timelineIndex);
      if (resolved.lowPrecision && !binding.allowLowPrecision) {
        fail("event " + eventSpec.id + " is anchored to " + resolved.timingPrecision + " timing; set allowLowPrecision=true only when an approximate cue is acceptable");
      }
      const offsetSec = secondsFromUnit(eventSpec.offset || { value: 0, unit: "samples" }, "event " + eventSpec.id + ".offset", timelineIndex.sampleRateHz, true);
      const eventFilmSec = resolved.filmSec + offsetSec;
      if (eventFilmSec < 0 || eventFilmSec > timelineDurationSec + 1e-9) fail("event " + eventSpec.id + " falls outside the compiled timeline");
      const phaseOffsetSec = eventFilmSec - phaseRecord.phase.startSec;
      pendingEvents.push({
        id: eventSpec.id,
        phaseId: eventSpec.phaseId,
        phaseOffsetSec,
        timeBasis: "film-global",
      });
      allGeneratedEventIds.push(eventSpec.id);
      anchorMap.push({
        bindingId: binding.id,
        eventId: eventSpec.id,
        phaseId: eventSpec.phaseId,
        ...(resolved.presentationId ? { presentationId: resolved.presentationId } : { clipOccurrenceId: resolved.clipOccurrenceId, tokenIds: resolved.tokenIds }),
        ...(resolved.segmentId ? { segmentId: resolved.segmentId } : {}),
        anchorTargetSample: resolved.targetSample,
        anchorFilmSec: resolved.filmSec,
        eventFilmSec,
        timingPrecision: resolved.timingPrecision,
      });
    }
  }
  if (scene.audioEvents == null) scene.audioEvents = [];
  if (!Array.isArray(scene.audioEvents)) fail("scene.audioEvents must be an array to accept semantic speech cues");
  scene.audioEvents.push(...pendingEvents);
  const audioIndex = MotionOps.findSceneAudioEvents(scene);
  for (const event of pendingEvents) if (!audioIndex.has(event.id)) fail("new speech event was not consumed by MotionOps: " + event.id);

  const receipt = {
    format: "laohu.motion.speech-binding-receipt/1",
    preview,
    timeline: {
      format: timeline.format,
      projectId: timelineIndex.projectId,
      revision: timelineIndex.revision,
      planSha256: timelineIndex.planSha256,
      state: timeline.state,
      reviewStatus: timeline.review.status,
      durationSamples: timelineIndex.durationSamples,
      sampleRateHz: timelineIndex.sampleRateHz,
    },
    ...(prepared.coverage ? { frameCoverage: prepared.coverage } : {}),
    sourceHashChecks,
    transcriptEvidenceChecks,
    bindingsSha256: sha256(canonical(spec)),
    generatedPhaseIds: allGeneratedPhaseIds,
    generatedEventIds: allGeneratedEventIds,
    anchorMap,
    evidenceBoundary: "Binding and consumer resolution are technical evidence only; they do not prove animation quality, sound suitability, audition, or approval.",
  };
  if (directTimeEventReview) {
    receipt.directFilmTimeEventReview = directTimeEventReview;
    receipt.directFilmTimeEvents = directFilmTimeEvents(scene).map(({id: eventId, filmTimeSec, owner}) => ({id: eventId, filmTimeSec, owner}));
  }
  scene.motionSpeechBinding = receipt;
  MotionCore.assertValidScene(scene);
  return { scene, receipt };
}

function parseArgs(argv) {
  const args = {};
  const values = new Set(["--scene", "--timeline", "--bindings", "--plan", "--out", "--locked-frame-count"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--overwrite") { args.overwrite = true; continue; }
    if (token === "--preview") { args.preview = true; continue; }
    if (!values.has(token)) fail("unknown option " + token);
    const value = argv[++index];
    if (!value || value.startsWith("--")) fail("missing value for " + token);
    const key = token.slice(2);
    if (Object.hasOwn(args, key) || (key === "locked-frame-count" && args.lockedFrameCount != null)) fail("duplicate option " + token);
    if (key === "locked-frame-count") {
      const frameCount = Number(value);
      if (!Number.isSafeInteger(frameCount) || frameCount < 1) fail("--locked-frame-count must be a positive integer");
      args.lockedFrameCount = frameCount;
    } else {
      args[key] = path.resolve(value);
    }
  }
  for (const key of ["scene", "timeline", "bindings", "plan", "out"]) if (!args[key]) fail("required option missing: --" + key);
  if ([args.scene, args.timeline, args.bindings, args.plan].includes(args.out)) fail("--out must not replace any input file");
  return args;
}
function transcriptEvidencePath(evidenceRef, planBaseDir) {
  if (typeof evidenceRef !== "string" || !evidenceRef.trim()) return null;
  const value = evidenceRef.trim();
  if (/^file:/i.test(value)) {
    try { return fileURLToPath(value); }
    catch { fail("transcript evidenceRef is a file URL but cannot be resolved safely"); }
  }
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return null;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(planBaseDir, value);
}
function collectProtectedInputPaths(args, plan, planBaseDir = path.dirname(args.plan)) {
  const paths = [args.scene, args.timeline, args.bindings, args.plan];
  for (const source of plan.sources || []) {
    if (source.mediaPath) paths.push(path.isAbsolute(source.mediaPath) ? source.mediaPath : path.resolve(planBaseDir, source.mediaPath));
    const evidencePath = transcriptEvidencePath(source.transcript && source.transcript.evidenceRef, planBaseDir);
    if (evidencePath) paths.push(evidencePath);
  }
  return [...new Set(paths.filter(Boolean).map((value) => path.resolve(value)))];
}
async function writeJsonAtomic(target, value, overwrite, inputPaths) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await writeJsonOutput(target, value, inputPaths, { replace: overwrite });
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [scene, timeline, spec, plan] = await Promise.all([
    fs.readFile(args.scene, "utf8").then(JSON.parse),
    fs.readFile(args.timeline, "utf8").then(JSON.parse),
    fs.readFile(args.bindings, "utf8").then(JSON.parse),
    fs.readFile(args.plan, "utf8").then(JSON.parse),
  ]);
  const result = await bindSpeechTimeline(scene, timeline, spec, { plan, planBaseDir: path.dirname(args.plan), preview: args.preview, lockedFrameCount: args.lockedFrameCount });
  const protectedInputs = collectProtectedInputPaths(args, plan, path.dirname(args.plan));
  await writeJsonAtomic(args.out, result.scene, args.overwrite, protectedInputs);
  process.stdout.write("SCENE " + args.out + "\nBINDINGS " + result.receipt.anchorMap.length + " anchors; " + result.receipt.generatedPhaseIds.length + " phases; " + result.receipt.generatedEventIds.length + " events\n");
}
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write((error.stack || error.message) + "\n");
    process.exitCode = 1;
  });
}

export { bindSpeechTimeline, collectProtectedInputPaths, parseArgs, prepareSceneForTimeline, resolveAnchor, transcriptEvidencePath, validateTimeline, verifyPlanAndTimeline };
