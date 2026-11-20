import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { compilePlan, hashPlan, verifyPlanEvidence } from "../../../laohu-asrcut/scripts/asrcut.mjs";
import { preflightFfmpeg } from "../../scripts/laohu-ffmpeg-preflight.mjs";

const adapterDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(adapterDir, "../..");
const templateCli = path.join(skillDir, "scripts", "templates.mjs");
const motionCli = path.join(skillDir, "scripts", "render.mjs");
const catalogPath = path.join(skillDir, "templates", "catalog.json");
const nativeRuntimeRoot = path.join(skillDir, "templates", "runtime", "laohu-film-native");
const require = createRequire(import.meta.url);
const MotionOps = require("../../scripts/motion-ops.js");
const MotionRecipes = require("../../templates/adapters/laohu-motion-recipes.js");
const FRAME_EPSILON = 1e-9;
const TIME_EPSILON = 1e-8;
const RATE = 48000;
const FILM_FORMAT = "laohu.huashu-film-blueprint/1";
const MANIFEST_FORMAT = "laohu.huashu-om-film-manifest/1";
const ALLOWED_TEMPLATE_EFFECTS = new Set(["laohu-motion-dg", "huashu-art-motion-dg", "laohu-motion-toolkit"]);

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
 * Film blueprints keep their small legacy `templateId` + `variables` input,
 * but the native clip runtime consumes the source clip grammar directly.
 * Resolve the catalog entry here and flatten the user supplied source fields
 * into the original clip spec; do not invent a wrapper format the renderer
 * does not read.
 */
export function buildNativeClipFilmSpec(segment, durationSec, catalog, { headHandleFrames = 0, tailHandleFrames = 0, bodyDurationSec = durationSec } = {}) {
  object(segment, "native clip film segment");
  stableId(segment.templateId, "native clip film segment.templateId");
  object(segment.variables, "native clip film segment.variables");
  finite(durationSec, "native clip film duration", Number.EPSILON);
  const entry = catalog?.templates?.find((row) => row.id === segment.templateId || (row.aliases || []).includes(segment.templateId));
  if (!entry || entry.renderer !== "native-clip" || !entry.grammar) {
    fail("film segment templateId must resolve to a catalogued native-clip grammar: " + segment.templateId);
  }
  if (entry.availability !== "available") {
    fail("film segment templateId " + segment.templateId + " is " + entry.availability + " and cannot render without its declared conditional inputs");
  }
  if (!Number.isSafeInteger(headHandleFrames) || headHandleFrames < 0) fail("native clip headHandleFrames must be a safe non-negative integer");
  if (!Number.isSafeInteger(tailHandleFrames) || tailHandleFrames < 0) fail("native clip tailHandleFrames must be a safe non-negative integer");
  finite(bodyDurationSec, "native clip bodyDurationSec", Number.EPSILON);
  if (headHandleFrames > 0 || tailHandleFrames > 0 || Math.abs(durationSec - bodyDurationSec) > TIME_EPSILON) {
    fail("native-clip source timing is preserved verbatim; native clips cannot be extended with transition handles");
  }
  if (Object.hasOwn(segment.variables, "duration")
      && Math.abs(finite(segment.variables.duration, "native template variables.duration", 0) - bodyDurationSec) > TIME_EPSILON) {
    fail("native template variables.duration must match the compiled body duration for segment " + segment.id);
  }
  for (const key of ["format", "templateId", "grammar"]) {
    if (Object.hasOwn(segment.variables, key) && key !== "grammar") {
      fail("native template variables." + key + " belongs to the film wrapper, not the source clip spec");
    }
    if (key === "grammar" && Object.hasOwn(segment.variables, key) && segment.variables.grammar !== entry.grammar) {
      fail("native template variables.grammar must match the pinned source grammar " + entry.grammar);
    }
  }
  const variables = structuredClone(segment.variables);
  if (variables.cues != null) {
    if (!Array.isArray(variables.cues)) fail("native template variables.cues must be an array when supplied");
    variables.cues = variables.cues.map((cue, index) => {
      object(cue, "native template variables.cues[" + index + "]");
      const at = cue.at == null ? 0 : finite(cue.at, "native template variables.cues[" + index + "].at", 0);
      if (at >= bodyDurationSec - TIME_EPSILON) fail("native clip cue " + index + " starts at or after the half-open body end and is not visible in an encoded body frame");
      return { ...cue, at };
    });
  }
  return {
    ...variables,
    grammar: entry.grammar,
    duration: durationSec,
    fps: 30,
    width: 1920,
    height: 1080,
  };
}

export function buildNativeOmFilmSpec(segment, durationSec, fps, catalog, { headHandleFrames = 0, tailHandleFrames = 0 } = {}) {
  object(segment, "native OM film segment");
  stableId(segment.templateId, "native OM film segment.templateId");
  object(segment.variables, "native OM film segment.variables");
  finite(durationSec, "native OM film duration", Number.EPSILON);
  if (!Number.isInteger(fps) || ![24, 25, 30, 50, 60].includes(fps)) fail("native OM Film fps must use an original OM host rate: 24, 25, 30, 50, or 60");
  if (headHandleFrames > 0 || tailHandleFrames > 0) fail("complete native OM segments preserve the original source duration and cannot declare transition handles; use the existing hard-cut/audio-bridge route");
  const entry = catalog?.templates?.find((row) => row.id === segment.templateId || (row.aliases || []).includes(segment.templateId));
  if (!entry || entry.renderer !== "native-om-template-source" || entry.sourceId !== "huashu-motion" || !/^templates\/[a-z0-9][a-z0-9-]*\/index\.html$/.test(entry.sourcePath || "")) {
    fail("Film segment templateId must resolve to a catalogued original Huashu Motion OM template: " + segment.templateId);
  }
  if (entry.availability === "source-only") fail("native OM template " + segment.templateId + " is source-only and cannot render until its original browser output is verified");
  if (Object.hasOwn(segment.variables, "duration")) finite(segment.variables.duration, "native OM variables.duration", Number.EPSILON);
  for (const key of ["format", "templateId", "sourceId", "sourcePath"]) if (Object.hasOwn(segment.variables, key)) {
    fail("native OM variables." + key + " belongs to the Film wrapper, not the original template controls");
  }
  if (segment.omMusic != null && (!segment.omMusic || typeof segment.omMusic !== "object" || Array.isArray(segment.omMusic) || canonical(segment.omMusic) !== canonical({ off: true }))) fail("native OM film segment.omMusic currently supports only { off: true } through the original OM.music API");
  const sourceCueBindings = validateSourceCueBindings(segment.sourceCueBindings, "native OM film segment.sourceCueBindings");
  return {
    format: "laohu.huashu-native-template-spec/1",
    templateId: entry.id,
    fps,
    width: 1920,
    height: 1080,
    // Keep the source duration and pace controls untouched. The rendered
    // native OM runtime probe is the authority for actual source duration;
    // Film clock boundaries are checked against that probe after rendering.
    variables: structuredClone(segment.variables),
    ...(segment.omCues == null ? {} : { omCues: structuredClone(segment.omCues) }),
    ...(segment.omScore == null ? {} : { omScore: segment.omScore }),
    ...(segment.omMusic == null ? {} : { omMusic: structuredClone(segment.omMusic) }),
    ...(sourceCueBindings == null ? {} : { sourceCueBindings }),
  };
}

function validateSourceCueBindings(value, label = "sourceCueBindings") {
  if (value == null) return null;
  if (!Array.isArray(value)) fail(label + " must be an array of source cue bindings");
  const seen = new Set();
  return value.map((row, index) => {
    const name = label + "[" + index + "]";
    object(row, name);
    onlyKeys(row, new Set(["cueIndex", "kind", "sourceWord", "word", "nth", "edge", "offset", "sfx"]), name);
    if (!Number.isSafeInteger(row.cueIndex) || row.cueIndex < 0) fail(name + ".cueIndex must be a safe non-negative original clip-spec cue index");
    if (typeof row.kind !== "string" || !row.kind.trim()) fail(name + ".kind must identify the original clip-spec cue kind");
    if (row.sourceWord != null && (typeof row.sourceWord !== "string" || !row.sourceWord.trim())) fail(name + ".sourceWord must identify the original cue word when supplied");
    if (Object.hasOwn(row, "word") && row.word !== null && (typeof row.word !== "string" || !row.word.trim())) fail(name + ".word must be a non-empty manuscript word anchor or null to clear the source anchor");
    if (row.nth != null && (!Number.isSafeInteger(row.nth) || row.nth < 1)) fail(name + ".nth must be a positive original ClipCues occurrence index");
    if (row.edge != null && !["start", "end"].includes(row.edge)) fail(name + ".edge must be start or end, as in the original ClipCues contract");
    if (row.offset != null) finite(row.offset, name + ".offset");
    if (!Object.hasOwn(row, "word") && row.nth == null && row.edge == null && row.offset == null && !Object.hasOwn(row, "sfx")) {
      fail(name + " must change a manuscript word anchor or an original cue.sfx value");
    }
    if (Object.hasOwn(row, "sfx") && row.sfx !== false && !(typeof row.sfx === "string" && row.sfx.trim()) && !Array.isArray(row.sfx)) {
      fail(name + ".sfx must be false, a non-empty original SFX name, or an original [name, leadSeconds, options] value");
    }
    if (Array.isArray(row.sfx)) {
      if (row.sfx.length < 1 || row.sfx.length > 3 || typeof row.sfx[0] !== "string" || !row.sfx[0].trim()) fail(name + ".sfx array must use the original [name, leadSeconds, options] shape");
      if (row.sfx[1] != null) finite(row.sfx[1], name + ".sfx[1]");
      if (row.sfx[2] != null) object(row.sfx[2], name + ".sfx[2]");
    }
    const key = String(row.cueIndex);
    if (seen.has(key)) fail(label + " contains duplicate cueIndex " + key);
    seen.add(key);
    return structuredClone(row);
  });
}

/** Bind original CLIP cues to manuscript words or cue.sfx values without adding a time schedule. */
export function applyNativeOmSourceCueBindings(html, value, templateId = "native OM template") {
  const overrides = validateSourceCueBindings(value, "sourceCueBindings");
  if (!overrides?.length) return { html, applied: overrides || [] };
  if (typeof html !== "string") fail(templateId + " source HTML must be a string");
  const tag = /<script\b(?=[^>]*\bid\s*=\s*["']clip-spec["'])[^>]*>([\s\S]*?)<\/script>/i;
  const match = tag.exec(html);
  if (!match) fail(templateId + " has no original script#clip-spec; sourceCueBindings requires an original CLIP.mount cue list");
  let spec;
  try { spec = JSON.parse(match[1]); }
  catch (error) { fail(templateId + " original script#clip-spec is not valid JSON: " + error.message); }
  object(spec, templateId + " original clip-spec");
  if (!Array.isArray(spec.cues)) fail(templateId + " original clip-spec has no cues array; sourceCueBindings cannot be applied");
  const cues = structuredClone(spec.cues);
  for (const row of overrides) {
    if (row.cueIndex >= cues.length) fail(templateId + " sourceCueBindings cueIndex " + row.cueIndex + " is outside its " + cues.length + " original clip-spec cues");
    const cue = cues[row.cueIndex];
    if (!cue || cue.kind !== row.kind) fail(templateId + " sourceCueBindings cueIndex " + row.cueIndex + " no longer identifies kind " + row.kind);
    if (cue.word != null && row.sourceWord !== cue.word) fail(templateId + " sourceCueBindings cueIndex " + row.cueIndex + " needs matching sourceWord " + cue.word);
    if (cue.word == null && row.sourceWord != null) fail(templateId + " sourceCueBindings cueIndex " + row.cueIndex + " does not have sourceWord " + row.sourceWord);
    if (Object.hasOwn(row, "word")) cue.word = row.word;
    if (row.nth != null) cue.nth = row.nth;
    if (row.edge != null) cue.edge = row.edge;
    if (row.offset != null) cue.offset = row.offset;
    if (Object.hasOwn(row, "sfx")) cue.sfx = structuredClone(row.sfx);
  }
  spec.cues = cues;
  const serialized = JSON.stringify(spec).replace(/<\/script/gi, "<\\/script");
  const bodyStart = match.index + match[0].indexOf(match[1]);
  const bodyEnd = bodyStart + match[1].length;
  return { html: html.slice(0, bodyStart) + serialized + html.slice(bodyEnd), applied: overrides };
}

function nativeOmEventScene(probe, item, sourceCueBindings = []) {
  object(probe, "native OM runtime probe");
  if (probe.format !== "laohu.huashu-native-om-runtime-probe/1") fail("native OM render receipt is missing the source runtime probe");
  const duration = finite(probe.durationSec, "native OM runtime duration", Number.EPSILON);
  if (Math.abs(duration - item.sourceDurationSec) > Math.max(1 / item.fps, TIME_EPSILON)) fail("native OM source timeline duration differs from the Film segment source duration");
  const baseHits = Array.isArray(probe.sound?.hits) ? probe.sound.hits : [];
  const composer = probe.composer;
  const sourceHitRows = [];
  const optionsFromHit = (hit) => Object.fromEntries(Object.entries(hit).filter(([key]) => !["name", "at", "gain", "pan"].includes(key)));
  const addHit = (hit, sourceKind, sourceOrder, cue = null) => {
    object(hit, "native OM source hit");
    if (typeof hit.name !== "string" || !hit.name.trim()) fail("native OM source hit must keep its original effect name");
    const at = finite(hit.at, "native OM source hit.at", 0);
    if (at >= duration - TIME_EPSILON) fail("native OM source hit lies at/after the half-open rendered timeline end");
    const sourceId = "om." + safeName(item.id) + "." + sourceKind + "." + sourceOrder;
    sourceHitRows.push({
      id: sourceId,
      timeSec: at,
      timeBasis: "scene-local",
      sourceAudio: {
        kind: sourceKind,
        name: hit.name,
        options: optionsFromHit(hit),
        sourceGain: hit.gain == null ? 1 : hit.gain,
        sourcePan: hit.pan == null ? 0 : hit.pan,
        kit: probe.soundPlan?.kit || "clean",
        keyContext: { rootMidi: probe.soundPlan?.root ?? 60, scale: probe.soundPlan?.scale || "major" },
        sourceHitOrder: sourceOrder,
        sourceSeed: `${hit.name}:${sourceOrder}:${hit.at}`,
        ...(sourceKind === "score-sfx" && composer?.scoreSha256 ? { composerScoreSha256: composer.scoreSha256 } : {}),
        ...(cue ? { composerCue: cue } : {}),
      },
    });
  };
  baseHits.forEach((hit, index) => addHit(hit, "declared-sfx", index));
  if (composer) {
    const cues = Array.isArray(composer.cues) ? composer.cues : [];
    const hits = Array.isArray(composer.hits) ? composer.hits : [];
    const expected = cues.reduce((count, cue) => count + (cue.type === "hit" ? 2 : cue.type === "rise" ? 1 : 0), 0);
    if (hits.length !== expected) fail("original renderComposed hit/rise output no longer matches its source cue contract");
    let hitIndex = 0;
    cues.forEach((cue, cueOrdinal) => {
      if (!["hit", "rise"].includes(cue.type)) fail("source composer cue type is outside the original hit/rise event contract");
      const count = cue.type === "hit" ? 2 : 1;
      for (let effectIndex = 0; effectIndex < count; effectIndex += 1) {
        const hit = hits[hitIndex];
        if (Math.abs(finite(hit.at, "native OM composer hit.at") - finite(cue.at, "native OM composer cue.at")) > 1 / RATE) fail("original composer effect is not at its source cue time");
        addHit(hit, "score-sfx", baseHits.length + hitIndex, { cueOrdinal, cueType: cue.type, cueAtSec: cue.at, effectIndex });
        hitIndex += 1;
      }
    });
    if (composer.report?.unmatched?.length) fail("original score contains unmatched source labels: " + composer.report.unmatched.join(", "));
  }
  return {
    version: 1, width: item.width, height: item.height, fps: item.fps, duration,
    timeBasis: "scene-local",
    audioEvents: sourceHitRows,
    huashuMotionRuntime: {
      format: probe.format,
      segmentId: item.id,
      timelineId: probe.timelineId,
      labels: structuredClone(probe.labels || {}),
      sound: structuredClone(probe.sound || {}),
      sourceDeclaration: structuredClone(probe.sourceDeclaration || {}),
      sourceDeclarationSha256: probe.sourceDeclarationSha256,
      sourcePlan: structuredClone(probe.sourcePlan || {}),
      sourcePlanSha256: probe.sourcePlanSha256,
      soundPlan: structuredClone(probe.soundPlan || {}),
      cueEvidence: structuredClone(probe.cueEvidence || {}),
      sourceCueBindings: structuredClone(sourceCueBindings),
      sourceScore: probe.sourceScore ? structuredClone(probe.sourceScore) : null,
      composer: composer ? { scoreSha256: composer.scoreSha256, scoreText: composer.scoreText, cues: structuredClone(composer.cues), report: structuredClone(composer.report || {}) } : null,
    },
  };
}

function parseHandleFrames(value, label) {
  if (value == null) return 0;
  if (!Number.isSafeInteger(value) || value < 0) fail(label + " must be a safe non-negative integer frame count");
  return value;
}

export function parseIncomingTransition(value, label) {
  if (value == null) return null;
  object(value, label);
  onlyKeys(value, new Set(["id", "method", "windowFrames", "parameters", "mode", "boundaryReason"]), label);
  stableId(value.id, label + ".id");
  stableId(value.method, label + ".method");
  if (!Number.isSafeInteger(value.windowFrames) || value.windowFrames < 2 || value.windowFrames % 2 !== 0) {
    fail(label + ".windowFrames must be an even integer of at least 2 output frames");
  }
  const mode = value.mode == null ? "handles" : value.mode;
  if (!["handles", "boundary-frame"].includes(mode)) fail(label + ".mode must be handles or boundary-frame");
  let boundaryReason = null;
  if (mode === "boundary-frame") {
    if (typeof value.boundaryReason !== "string" || value.boundaryReason.trim().length < 12 || value.boundaryReason.trim().length > 500) {
      fail(label + ".boundaryReason must briefly explain the semantic handoff at this cut (12–500 characters)");
    }
    boundaryReason = value.boundaryReason.trim();
    if (value.method !== "crossfade") fail(label + " boundary-frame mode currently supports only the verified TRANSITIONS.crossfade bitmap branch");
    if (Object.keys(value.parameters || {}).length) fail(label + " boundary-frame crossfade does not accept source parameters");
  } else if (value.boundaryReason != null) {
    fail(label + ".boundaryReason is only valid with mode boundary-frame");
  }
  const parameters = value.parameters == null ? {} : object(value.parameters, label + ".parameters");
  return { id: value.id, method: value.method, windowFrames: value.windowFrames, mode, boundaryReason, parameters: structuredClone(parameters) };
}

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
      headHandleFrames: parseHandleFrames(segment.headHandleFrames, "segments[" + index + "].headHandleFrames"),
      tailHandleFrames: parseHandleFrames(segment.tailHandleFrames, "segments[" + index + "].tailHandleFrames"),
      incomingTransition: parseIncomingTransition(segment.incomingTransition, "segments[" + index + "].incomingTransition"),
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
  for (let index = 0; index < segments.length; index += 1) {
    const item = segments[index];
    if (["huashu-motion-template", "laohu-native-om-template"].includes(item.segment.renderer) && (item.headHandleFrames > 0 || item.tailHandleFrames > 0)) {
      if (item.segment.renderer === "huashu-motion-template") fail("native-clip segment " + item.id + " preserves its source duration and cannot declare transition handles; use its native hard-cut path");
      fail("complete native OM segment " + item.id + " preserves its source duration and cannot declare transition handles; use its native hard-cut path");
    }
    if (index === 0 && item.incomingTransition) fail("segments[0].incomingTransition has no preceding source shot");
    if (item.incomingTransition) {
      const half = item.incomingTransition.windowFrames / 2;
      const previous = segments[index - 1];
      if (item.incomingTransition.mode === "boundary-frame") {
        const nativeRenderers = new Set(["huashu-motion-template", "laohu-native-om-template"]);
        const previousNative = nativeRenderers.has(previous.segment.renderer);
        const currentNative = nativeRenderers.has(item.segment.renderer);
        if (!previousNative && !currentNative) fail("boundary-frame mode requires at least one native OM/native-clip segment; motion-scene to motion-scene cuts use source handles");
        if (item.headHandleFrames !== 0 || previous.tailHandleFrames !== 0) fail("boundary-frame mode consumes rendered body boundary frames and must not declare head/tail handles at this cut");
      } else {
        if (item.headHandleFrames < half) fail("segment " + item.id + " needs at least " + half + " headHandleFrames for its incoming transition");
        if (previous.tailHandleFrames < half) fail("preceding segment " + previous.id + " needs at least " + half + " tailHandleFrames for the incoming transition");
      }
      if (item.frameCount < half) fail("segment " + item.id + " body is shorter than the incoming transition's half-window");
      if (previous.frameCount < half) fail("preceding segment " + previous.id + " body is shorter than the outgoing transition's half-window");
      item.transitionWindowFrameRange = { startFrame: item.frameRange.startFrame - half, endFrame: item.frameRange.startFrame + half };
    } else if (item.headHandleFrames > 0) {
      fail("segment " + item.id + " has head handles that are not consumed by incomingTransition");
    }
    const next = segments[index + 1];
    if (!next?.incomingTransition && item.tailHandleFrames > 0) fail("segment " + item.id + " has tail handles that are not consumed by the following incomingTransition");
    const incomingHalf = item.incomingTransition ? item.incomingTransition.windowFrames / 2 : 0;
    const outgoingHalf = next?.incomingTransition ? next.incomingTransition.windowFrames / 2 : 0;
    if (incomingHalf + outgoingHalf > item.frameCount) fail("segment " + item.id + " body is too short for its incoming and outgoing transition windows");
    item.incomingHalfWindowFrames = incomingHalf;
    item.outgoingHalfWindowFrames = outgoingHalf;
    item.sourceFrameCount = item.headHandleFrames + item.frameCount + item.tailHandleFrames;
    item.sourceDurationSec = item.sourceFrameCount / fps;
    item.sourceLocalBodyRange = { startFrame: item.headHandleFrames, endFrame: item.headHandleFrames + item.frameCount };
    item.localBodyStartSec = item.headHandleFrames / fps;
    item.localBodyEndSec = (item.headHandleFrames + item.frameCount) / fps;
  }
  if (Math.abs(previousExactEnd - durationSec) > TIME_EPSILON) fail("film segments must cover the entire declared global clock duration");
  if (previousFrameEnd !== totalFrameCount) fail("film segment frame ranges do not exactly cover the compiled film frame clock");
  const idsSeen = new Set();
  for (const segment of segments) {
    if (idsSeen.has(segment.id)) fail("duplicate film segment ID: " + segment.id);
    idsSeen.add(segment.id);
  }
  return { clockKind: clock.kind, durationSec, fps, width: blueprint.width, height: blueprint.height, totalFrameCount, segments, asrcut };
}

export function resolveFilmTransitions(schedule, catalog) {
  const library = catalog.effectLibraries?.find((row) => row.id === "laohu-motion-transitions");
  if (!library) fail("catalog must contain the pinned laohu-motion-transitions source library");
  const transitions = [];
  for (let index = 1; index < schedule.segments.length; index += 1) {
    const item = schedule.segments[index];
    const input = item.incomingTransition;
    if (!input) continue;
    const group = catalog.effects?.find((row) => row.id === input.id || (row.aliases || []).includes(input.id));
    if (!group || group.renderer !== "custom:laohu-motion-transition" || !group.sourceFunctions?.includes("TRANSITIONS." + input.method)) {
      fail("segment " + item.id + " incomingTransition " + input.id + "/" + input.method + " must resolve to one catalogued Laohu source transition");
    }
    if (group.availability === "source-only") fail("transition " + group.id + " remains source-only and cannot render");
    const sourceMethod = library.functions?.find((row) => row.id === "TRANSITIONS." + input.method);
    if (!sourceMethod || sourceMethod.groupId !== group.id) fail("transition " + group.id + "/" + input.method + " is not in the pinned source function inventory");
    if (sourceMethod.availability === "source-only") {
      fail("transition TRANSITIONS." + input.method + " remains source-only: " + (sourceMethod.reason || "required source dependency is unavailable in the pinned runtime closure"));
    }
    if (input.mode === "boundary-frame" && sourceMethod.availability !== "available") {
      fail("boundary-frame mode requires an available source method; conditional continuity/geometry branches cannot be inferred from held boundary frames");
    }
    transitions.push({
      segmentId: item.id,
      previousSegmentId: schedule.segments[index - 1].id,
      id: group.id,
      method: input.method,
      mode: input.mode,
      boundaryReason: input.boundaryReason,
      availability: sourceMethod.availability,
      windowFrames: input.windowFrames,
      windowFrameRange: item.transitionWindowFrameRange,
      leftFrames: input.windowFrames / 2,
      rightFrames: input.windowFrames / 2,
      parameters: structuredClone(input.parameters),
      sourceFunction: sourceMethod.id,
      sourceFile: "scripts/engine/transitions.js",
      sourceCommit: catalog.sources.find((row) => row.id === group.sourceRef.sourceId)?.commit || null,
    });
  }
  return transitions;
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
    onlyKeys(segment, new Set(["id", "renderer", "templateId", "variables", "eventScenePath", "eventSceneSha256", "headHandleFrames", "tailHandleFrames", "incomingTransition", "startSec", "endSec", "unitIds"]), label);
    stableId(segment.templateId, label + ".templateId");
    object(segment.variables, label + ".variables");
    if (segment.eventScenePath != null && (typeof segment.eventScenePath !== "string" || !segment.eventScenePath.trim())) fail(label + ".eventScenePath must be a non-empty path");
    if (segment.eventSceneSha256 != null) hashField(segment.eventSceneSha256, label + ".eventSceneSha256");
    if ((segment.eventScenePath == null) !== (segment.eventSceneSha256 == null)) fail(label + ".eventScenePath and eventSceneSha256 must be supplied together");
  } else if (segment.renderer === "laohu-native-om-template") {
    onlyKeys(segment, new Set(["id", "renderer", "templateId", "variables", "omCues", "omScore", "omMusic", "sourceCueBindings", "headHandleFrames", "tailHandleFrames", "incomingTransition", "startSec", "endSec", "unitIds"]), label);
    stableId(segment.templateId, label + ".templateId");
    object(segment.variables, label + ".variables");
    if (segment.omCues != null) {
      object(segment.omCues, label + ".omCues");
      if (!Array.isArray(segment.omCues.words)) fail(label + ".omCues.words must be an array using the original OM cue format");
    }
    if (segment.omScore != null && (typeof segment.omScore !== "string" || !segment.omScore.trim())) fail(label + ".omScore must be a non-empty original ABC score string when supplied");
    if (segment.omMusic != null && (!segment.omMusic || typeof segment.omMusic !== "object" || Array.isArray(segment.omMusic) || canonical(segment.omMusic) !== canonical({ off: true }))) fail(label + ".omMusic currently supports only { off: true } through the original OM.music API");
    if (segment.sourceCueBindings != null) validateSourceCueBindings(segment.sourceCueBindings, label + ".sourceCueBindings");
  } else if (segment.renderer === "motion-scene") {
    onlyKeys(segment, new Set(["id", "renderer", "scenePath", "sceneSha256", "drawModulePath", "drawModuleSha256", "templateEffects", "headHandleFrames", "tailHandleFrames", "incomingTransition", "startSec", "endSec", "unitIds"]), label);
    if (typeof segment.scenePath !== "string" || !segment.scenePath.trim()) fail(label + ".scenePath is required for motion-scene");
    hashField(segment.sceneSha256, label + ".sceneSha256");
    if ((segment.drawModulePath == null) !== (segment.drawModuleSha256 == null)) fail(label + ".drawModulePath and drawModuleSha256 must be supplied together for a custom draw module");
    if (segment.drawModulePath != null && (typeof segment.drawModulePath !== "string" || !segment.drawModulePath.trim())) fail(label + " custom draw module requires drawModulePath and drawModuleSha256");
    if (segment.drawModuleSha256 != null) hashField(segment.drawModuleSha256, label + ".drawModuleSha256");
    if (segment.templateEffects != null && !ALLOWED_TEMPLATE_EFFECTS.has(segment.templateEffects)) fail(label + ".templateEffects is not in the assembler allowlist");
  } else fail(label + ".renderer must be huashu-motion-template, laohu-native-om-template, or motion-scene");
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

function preserveNativeEventScene(sourceScene, item, label) {
  const sourceDuration = sceneDuration(sourceScene, label);
  if (sourceDuration > item.localDurationSec + TIME_EPSILON) {
    fail(label + ".duration must not exceed the compiled film body");
  }
  if (item.headHandleFrames > 0 || item.tailHandleFrames > 0) fail(label + " cannot be assigned transition handles because its original timing is preserved");
  return structuredClone(sourceScene);
}

/** Keep existing Motion timing intact; only accept scenes that already render the compiled frame count. */
export function validateMotionSceneForSegment(scene, item, label = "Motion scene") {
  const duration = sceneDuration(scene, label);
  if (scene.width !== item.width || scene.height !== item.height || scene.fps !== item.fps) {
    fail(label + " must match the film's dimensions and frame rate");
  }
  const frameAlignedDuration = item.sourceDurationSec;
  const durationDelta = Math.abs(duration - frameAlignedDuration);
  if (durationDelta > 1 / item.fps + TIME_EPSILON || Math.round(duration * item.fps) !== item.sourceFrameCount) {
    fail(label + ".duration must already compile to the segment's " + item.sourceFrameCount + " output frames, including the declared head/tail handles");
  }

  const phases = collectPhases(scene);
  const localWindowEnd = Math.min(duration, frameAlignedDuration);
  const events = MotionOps.findSceneAudioEvents(scene);
  MotionRecipes.validateScene(scene);
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
  const nativeSourceCompositions = [];
  const nativeSourcePresetPlans = [];
  const audioTimeMaps = [];
  const excludedAudioEvents = [];
  const seenEventIds = new Set();
  for (const item of schedule.segments) {
    const sourceScene = sourceBySegment.get(item.id);
    const mapId = "time:" + item.id;
    const mapRow = {
      id: mapId,
      segmentId: item.id,
      localStartSec: item.localBodyStartSec,
      localEndSec: item.localBodyEndSec,
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
    const sourceLocalDurationSec = sourceScene.localDurationSec ?? sceneDuration(sourceScene.scene, "event scene " + item.id);
    const nativeRuntime = sourceScene.scene.huashuMotionRuntime;
    if (nativeRuntime?.format === "laohu.huashu-native-om-runtime-probe/1"
        && nativeRuntime.composer?.scoreText && !nativeRuntime.sound?.music?.off) {
      nativeSourceCompositions.push({
        segmentId: item.id,
        sourceScenePath: relativeSourcePath,
        sourceSceneSha256: sourceScene.sha256,
        timeMapId: mapId,
        durationSec: finite(nativeRuntime.soundPlan?.durationSec, "native OM source score duration", Number.EPSILON),
        scoreText: nativeRuntime.composer.scoreText,
        scoreSha256: nativeRuntime.composer.scoreSha256,
        labels: structuredClone(nativeRuntime.labels || {}),
        marks: structuredClone(nativeRuntime.sound?.music?.marks || {}),
        seed: nativeRuntime.soundPlan?.seed,
        keyContext: { rootMidi: nativeRuntime.soundPlan?.root ?? 60, scale: nativeRuntime.soundPlan?.scale || "major" },
        expectedCues: structuredClone(nativeRuntime.composer.cues || []),
      });
    }
    if (nativeRuntime?.format === "laohu.huashu-native-om-runtime-probe/1"
        && !nativeRuntime.sourceScore?.scoreText && !nativeRuntime.sound?.music?.off) {
      nativeSourcePresetPlans.push({
        segmentId: item.id,
        sourceScenePath: relativeSourcePath,
        sourceSceneSha256: sourceScene.sha256,
        timeMapId: mapId,
        durationSec: finite(nativeRuntime.soundPlan?.durationSec, "native OM source preset duration", Number.EPSILON),
        sourceDeclaration: structuredClone(nativeRuntime.sourceDeclaration),
        sourceDeclarationSha256: nativeRuntime.sourceDeclarationSha256,
        sourcePlan: structuredClone(nativeRuntime.sourcePlan),
        sourcePlanSha256: nativeRuntime.sourcePlanSha256,
      });
    }
    const eventWindowStartSec = mapRow.localStartSec;
    const eventWindowEndSec = Math.min(sourceLocalDurationSec, mapRow.localEndSec);
    const found = MotionOps.findSceneAudioEvents(sourceScene.scene);
    const sourcePhaseRows = collectPhases(sourceScene.scene);
    for (const [eventId, row] of found) {
      if (seenEventIds.has(eventId)) fail("shared audio event IDs must be unique across the whole film: " + eventId);
      seenEventIds.add(eventId);
      if (!new Set(["film-global", "scene-local"]).has(row.timeBasis)) fail("shared audio event " + eventId + " has unknown timeBasis; declare film-global or scene-local");
      if (row.timeBasis === "scene-local" && row.timeSec > sourceLocalDurationSec + TIME_EPSILON) {
        fail("scene-local event " + eventId + " falls outside the rendered local duration of segment " + item.id);
      }
      if (row.timeBasis === "scene-local" && row.timeSec < eventWindowStartSec - TIME_EPSILON) {
        if (item.headHandleFrames === 0) fail("scene-local event " + eventId + " falls outside the rendered local duration of segment " + item.id);
        excludedAudioEvents.push({ eventId, segmentId: item.id, sourceScenePath: relativeSourcePath, sourceSceneSha256: sourceScene.sha256, sourceTimeBasis: row.timeBasis, sourceTimeSec: row.timeSec, reason: "source-head-handle-outside-film-body" });
        continue;
      }
      if (row.timeBasis === "scene-local" && row.timeSec >= eventWindowEndSec - TIME_EPSILON) {
        if (item.tailHandleFrames === 0) fail("scene-local event " + eventId + " falls outside the rendered local duration of segment " + item.id);
        excludedAudioEvents.push({ eventId, segmentId: item.id, sourceScenePath: relativeSourcePath, sourceSceneSha256: sourceScene.sha256, sourceTimeBasis: row.timeBasis, sourceTimeSec: row.timeSec, reason: "source-tail-handle-outside-film-body" });
        continue;
      }
      if (row.timeBasis === "film-global" && (row.timeSec < item.exactStartSec - TIME_EPSILON || row.timeSec >= item.exactEndSec - TIME_EPSILON)) {
        excludedAudioEvents.push({ eventId, segmentId: item.id, sourceScenePath: relativeSourcePath, sourceSceneSha256: sourceScene.sha256, sourceTimeBasis: row.timeBasis, sourceTimeSec: row.timeSec, reason: "source-event-outside-film-body" });
        continue;
      }
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
          if (endSec <= startSec || startSec < eventWindowStartSec - TIME_EPSILON || endSec > eventWindowEndSec + TIME_EPSILON) {
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
    nativeSourceCompositions,
    nativeSourcePresetPlans,
  };
  return { compiledScene, audioTimeMaps, audioEventBindings: bindings, sourceScenes, excludedAudioEvents, nativeSourceCompositions, nativeSourcePresetPlans };
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
    excludedAudioEvents: projection.excludedAudioEvents,
    nativeSourceCompositions: projection.nativeSourceCompositions,
    nativeSourcePresetPlans: projection.nativeSourcePresetPlans,
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
  const sourceDurationSec = item.sourceDurationSec;
  const env = childEnv(path.join(jobRoot, "tmp"));
  await fs.mkdir(env.TMPDIR, { recursive: true });
  let result;
  let sourceScenePath = null;
  let sourceScene = null;
  let sourceSceneSha256 = null;
  let derivedScenePath = null;
  let derivedSceneSha256 = null;
  let nativeTemplate = null;
  let sourceRuntimeProbeMeta = null;
  let sourceCueBindingsMeta = null;
  let motionSceneEvidence = null;
  let nativeCueBindings = null;
  let derivedEventScenePath = null;
  let derivedEventSceneSha256 = null;
  if (segment.renderer === "huashu-motion-template") {
    nativeTemplate = options.catalog.templates.find((row) => row.id === segment.templateId || (row.aliases || []).includes(segment.templateId));
    const spec = buildNativeClipFilmSpec(segment, sourceDurationSec, options.catalog, { headHandleFrames: item.headHandleFrames, tailHandleFrames: item.tailHandleFrames, bodyDurationSec: localDurationSec });
    nativeCueBindings = (segment.variables.cues || []).map((cue, index) => ({
      index,
      sourceAtSec: cue.at == null ? 0 : cue.at,
      renderAtSec: spec.cues[index].at,
      sourceDataPreserved: canonical(cue.data ?? null) === canonical(spec.cues[index].data ?? null),
    }));
    const specPath = path.join(jobRoot, "specs", safeName(item.id) + ".json");
    await fs.mkdir(path.dirname(specPath), { recursive: true });
    await writeNew(specPath, JSON.stringify(spec, null, 2) + "\n");
    const args = [templateCli, "render", nativeTemplate.id, "--spec", specPath, "--output", output, "--work-root", cacheDir, "--manifest", receiptPath];
    if (options.browser) args.push("--browser", options.browser);
    if (options.ffmpeg) args.push("--ffmpeg", options.ffmpeg);
    result = await run(process.execPath, args, { cwd: skillDir, env, label: "Huashu native template render " + item.id });
    if (segment.eventScenePath) {
      const source = await hashCheckedInput(blueprintDir, segment.eventScenePath, segment.eventSceneSha256, "native template event scene " + item.id);
      sourceScenePath = source.file; sourceSceneSha256 = source.sha256;
      sourceScene = preserveNativeEventScene(JSON.parse(source.bytes.toString("utf8")), item, "native template event scene " + item.id);
      const adjustedPath = path.join(jobRoot, "scenes", safeName(item.id) + ".audio-events.json");
      await fs.mkdir(path.dirname(adjustedPath), { recursive: true });
      const adjustedBytes = Buffer.from(JSON.stringify(sourceScene, null, 2) + "\n");
      await writeNew(adjustedPath, adjustedBytes);
      derivedEventScenePath = adjustedPath;
      derivedEventSceneSha256 = sha256(adjustedBytes);
    }
  } else if (segment.renderer === "laohu-native-om-template") {
    nativeTemplate = options.catalog.templates.find((row) => row.id === segment.templateId || (row.aliases || []).includes(segment.templateId));
    const spec = buildNativeOmFilmSpec(segment, sourceDurationSec, item.fps, options.catalog, { headHandleFrames: item.headHandleFrames, tailHandleFrames: item.tailHandleFrames });
    const specPath = path.join(jobRoot, "specs", safeName(item.id) + ".native-om.json");
    await fs.mkdir(path.dirname(specPath), { recursive: true });
    await writeNew(specPath, JSON.stringify(spec, null, 2) + "\n");
    const args = [templateCli, "render", nativeTemplate.id, "--spec", specPath, "--output", output, "--work-root", cacheDir, "--manifest", receiptPath];
    if (options.browser) args.push("--browser", options.browser);
    if (options.ffmpeg) args.push("--ffmpeg", options.ffmpeg);
    result = await run(process.execPath, args, { cwd: skillDir, env, label: "Laohu native OM template render " + item.id });
    const renderReceipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    const runtimeProbe = renderReceipt.sourceRuntimeProbe;
    sourceScene = nativeOmEventScene(runtimeProbe, item, renderReceipt.sourceCueBindings || []);
    const eventPath = path.join(jobRoot, "scenes", safeName(item.id) + ".native-om-events.json");
    await fs.mkdir(path.dirname(eventPath), { recursive: true });
    const eventBytes = Buffer.from(JSON.stringify(sourceScene, null, 2) + "\n");
    await writeNew(eventPath, eventBytes);
    sourceScenePath = eventPath;
    sourceSceneSha256 = sha256(eventBytes);
    derivedEventScenePath = eventPath;
    derivedEventSceneSha256 = sourceSceneSha256;
    sourceRuntimeProbeMeta = renderReceipt.media?.sourceRuntimeProbe
      ? {
        ...renderReceipt.media.sourceRuntimeProbe,
        sourceDurationControlSec: renderReceipt.sourceDurationControlSec ?? null,
        runtimeDurationSec: renderReceipt.runtimeDurationSec ?? renderReceipt.media.sourceRuntimeProbe.durationSec,
        durationAuthority: renderReceipt.durationAuthority || "original-om-browser-runtime-probe",
        sourceCueBindings: renderReceipt.sourceCueBindings || null,
      }
      : null;
    sourceCueBindingsMeta = renderReceipt.sourceCueBindings || null;
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
    if (!actualReceiptPath) fail("Motion scene render did not return its technical receipt path");
    const motionReceipt = await readJson(actualReceiptPath, "Motion scene render receipt " + item.id);
    motionSceneEvidence = motionReceipt.motionRecipes || null;
  }
  const outputHash = await fileSha256(output, "rendered segment " + item.id);
  const eventSource = sourceScene ? { file: derivedEventScenePath || sourceScenePath, sha256: derivedEventSceneSha256 || sourceSceneSha256, scene: sourceScene, localDurationSec: sceneDuration(sourceScene, "event scene " + item.id) } : null;
  return {
    output,
    outputSha256: outputHash.sha256,
    expectedFrameCount: item.sourceFrameCount,
    receiptPath: actualReceiptPath,
    motionSceneEvidence,
    childStdout: result.stdout,
    eventSource,
    sourceScenePath,
    sourceSceneSha256,
    derivedScenePath,
    derivedSceneSha256,
    derivedEventScenePath,
    derivedEventSceneSha256,
    nativeCueBindings,
    sourceRuntimeProbeMeta,
    sourceCueBindings: sourceCueBindingsMeta,
    nativeTemplate: nativeTemplate ? { id: nativeTemplate.id, sourceTemplateId: nativeTemplate.sourceTemplateId || nativeTemplate.grammar || nativeTemplate.sourcePath?.split("/")[1], grammar: nativeTemplate.grammar || null, sourceId: nativeTemplate.sourceId, sourcePath: nativeTemplate.sourcePath } : null,
    render: { segmentId: item.id, renderer: segment.renderer, templateId: nativeTemplate?.id || segment.templateId || null, sourceTemplateId: nativeTemplate?.sourceTemplateId || null, bodyFrameRange: item.frameRange, sourceFrameCount: item.sourceFrameCount, headHandleFrames: item.headHandleFrames, tailHandleFrames: item.tailHandleFrames, outputPath: output },
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
function assertCompatibleStreams(rows, schedule, { streamCopy = true } = {}) {
  const first = rows[0];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index], expected = schedule.segments[index];
    if (row.width !== schedule.width || row.height !== schedule.height || Math.abs(row.fps - schedule.fps) > 1e-6) fail("segment " + expected.id + " output does not match the common 1920×1080, 30 fps film format");
    if (row.frameCount !== expected.sourceFrameCount) fail("segment " + expected.id + " encoded " + row.frameCount + " source frames; expected body plus declared handles of " + expected.sourceFrameCount);
    if (streamCopy) for (const key of ["codecName", "profile", "width", "height", "pixFmt", "rFrameRate", "avgFrameRate", "timeBase"]) {
      if (row[key] !== first[key]) fail("segment " + expected.id + " has incompatible " + key + " for hard-cut stream-copy concatenation");
    }
  }
}

async function extractFrameWindow(ffmpeg, input, firstFrame, frameCount, outputDir, label, fps) {
  if (!Number.isSafeInteger(firstFrame) || firstFrame < 0 || !Number.isSafeInteger(frameCount) || frameCount < 1) fail(label + " frame range is invalid");
  await fs.mkdir(outputDir, { recursive: true });
  const pattern = path.join(outputDir, "frame-%04d.png");
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-i", input,
    "-vf", `select='between(n,${firstFrame},${firstFrame + frameCount - 1})',setpts=N/(${fps}*TB)`,
    "-fps_mode", "vfr", "-frames:v", String(frameCount), pattern,
  ], { cwd: outputDir, env: childEnv(outputDir), label: label + " frame extraction" });
  const files = (await fs.readdir(outputDir)).filter((name) => /^frame-\d{4}\.png$/.test(name)).sort();
  if (files.length !== frameCount) fail(label + " extracted " + files.length + " frames; expected " + frameCount);
  const rows = [];
  for (const name of files) {
    const file = path.join(outputDir, name);
    const bytes = await fs.readFile(file);
    rows.push({ file, bytes, sha256: sha256(bytes) });
  }
  return rows;
}

export async function renderTransitionWindow(plan, schedule, rendered, jobRoot, options) {
  const currentIndex = schedule.segments.findIndex((item) => item.id === plan.segmentId);
  if (currentIndex < 1) fail("transition " + plan.id + " is missing its preceding segment");
  const previous = schedule.segments[currentIndex - 1];
  const current = schedule.segments[currentIndex];
  const half = plan.windowFrames / 2;
  const aStart = (rendered[currentIndex - 1].sourceFrameOffset || 0) + previous.headHandleFrames + previous.frameCount - half;
  const bStart = (rendered[currentIndex].sourceFrameOffset || 0) + (plan.mode === "boundary-frame" ? current.headHandleFrames : current.headHandleFrames - half);
  const transitionRoot = path.join(jobRoot, "transitions", safeName(plan.segmentId));
  let aFrames, bFrames, boundaryFrameMap = null;
  if (plan.mode === "boundary-frame") {
    const [aMotion, aHold, bHold, bMotion] = await Promise.all([
      extractFrameWindow(options.ffmpeg, rendered[currentIndex - 1].output, aStart, half, path.join(transitionRoot, "A-motion"), "transition " + plan.segmentId + " A motion", schedule.fps),
      extractFrameWindow(options.ffmpeg, rendered[currentIndex - 1].output, aStart + half - 1, 1, path.join(transitionRoot, "A-hold"), "transition " + plan.segmentId + " A hold", schedule.fps),
      extractFrameWindow(options.ffmpeg, rendered[currentIndex].output, bStart, 1, path.join(transitionRoot, "B-hold"), "transition " + plan.segmentId + " B hold", schedule.fps),
      extractFrameWindow(options.ffmpeg, rendered[currentIndex].output, bStart, half, path.join(transitionRoot, "B-motion"), "transition " + plan.segmentId + " B motion", schedule.fps),
    ]);
    aFrames = [...aMotion, ...Array.from({ length: half }, () => aHold[0])];
    bFrames = [...Array.from({ length: half }, () => bHold[0]), ...bMotion];
    boundaryFrameMap = {
      mode: "boundary-frame",
      preceding: { movingFrames: { startFrame: aStart, endFrame: aStart + half }, heldFrame: { sourceFrameIndex: aStart + half - 1, sha256: aHold[0].sha256 }, heldOutputRange: { startFrame: half, endFrame: plan.windowFrames } },
      incoming: { heldFrame: { sourceFrameIndex: bStart, sha256: bHold[0].sha256 }, heldOutputRange: { startFrame: 0, endFrame: half }, movingFrames: { startFrame: bStart, endFrame: bStart + half } },
    };
  } else {
    [aFrames, bFrames] = await Promise.all([
      extractFrameWindow(options.ffmpeg, rendered[currentIndex - 1].output, aStart, plan.windowFrames, path.join(transitionRoot, "A"), "transition " + plan.segmentId + " A", schedule.fps),
      extractFrameWindow(options.ffmpeg, rendered[currentIndex].output, bStart, plan.windowFrames, path.join(transitionRoot, "B"), "transition " + plan.segmentId + " B", schedule.fps),
    ]);
  }
  const sourceFrames = Array.from({ length: plan.windowFrames }, (_, index) => ({
    A: "data:image/png;base64," + aFrames[index].bytes.toString("base64"),
    B: "data:image/png;base64," + bFrames[index].bytes.toString("base64"),
    a: { sourceFrameIndex: plan.mode === "boundary-frame" && index >= half ? aStart + half - 1 : aStart + index, sha256: aFrames[index].sha256, held: plan.mode === "boundary-frame" && index >= half },
    b: { sourceFrameIndex: plan.mode === "boundary-frame" && index < half ? bStart : bStart + index - half, sha256: bFrames[index].sha256, held: plan.mode === "boundary-frame" && index < half },
  }));
  const renderRoot = path.join(transitionRoot, "renders");
  await fs.mkdir(renderRoot, { recursive: true });
  const duration = plan.windowFrames / schedule.fps;
  const scene = {
    version: 1,
    width: schedule.width,
    height: schedule.height,
    fps: schedule.fps,
    duration,
    timeBasis: "scene-local",
    objects: sourceFrames.map((pair, index) => ({
      id: "incoming-transition-" + index,
      type: "custom:laohu-motion-transition",
      data: {
        instanceId: safeName(plan.segmentId) + "-" + index,
        outputFrameIndex: index,
        progress: index / (plan.windowFrames - 1),
        transitionDurationSec: duration,
        groupId: plan.id,
        method: plan.method,
        parameters: plan.parameters,
        sourceFrames: { A: pair.A, B: pair.B },
      },
    })),
  };
  const scenePath = path.join(transitionRoot, "scene.json");
  const output = path.join(transitionRoot, "transition.mp4");
  const cacheDir = path.join(transitionRoot, "cache");
  const bytes = Buffer.from(JSON.stringify(scene) + "\n");
  await writeNew(scenePath, bytes);
  const args = [motionCli, "--scene", scenePath, "--output", output, "--cache-dir", cacheDir, "--template-effects", "laohu-motion-transitions", "--ffmpeg", options.ffmpeg];
  if (options.browser) args.push("--browser", options.browser);
  const renderEnv = await childEnv(path.join(jobRoot, "tmp"));
  if (options.nodeModulesPath) renderEnv.NODE_PATH = options.nodeModulesPath;
  const result = await run(process.execPath, args, { cwd: skillDir, env: renderEnv, label: "source transition render " + plan.id });
  const manifestLine = result.stdout.match(/^MANIFEST\s+(.+)$/m);
  if (!manifestLine) fail("transition renderer did not return its evidence manifest for " + plan.segmentId);
  const receiptPath = path.resolve(manifestLine[1].trim());
  const receipt = await readJson(receiptPath, "transition render receipt " + plan.segmentId);
  const callCount = receipt.transitions?.calls?.[plan.method] || 0;
  const sourceCallCount = receipt.templateEffects?.calls?.["TRANSITIONS." + plan.method] || 0;
  if (callCount < plan.windowFrames || sourceCallCount < plan.windowFrames) fail("source transition TRANSITIONS." + plan.method + " was not observed on every output frame");
  const callsByInstance = receipt.transitions?.callsByInstance || {};
  const frameCalls = Array.from({ length: plan.windowFrames }, (_, index) => {
    const instanceId = safeName(plan.segmentId) + "-" + index;
    const row = callsByInstance[instanceId];
    const outputFrameTime = index / schedule.fps;
    if (!row || row.method !== plan.method || !row.timeSec.some((time) => Math.abs(time - outputFrameTime) <= 1e-8)) {
      fail("source transition TRANSITIONS." + plan.method + " has no same-clock call for output frame " + index);
    }
    return { instanceId, calls: row.calls, timeSec: row.timeSec, outputFrameTime };
  });
  const probe = await probeVideo(ffprobePath(options.ffmpeg), output, "transition clip " + plan.segmentId);
  if (probe.frameCount !== plan.windowFrames || probe.width !== schedule.width || probe.height !== schedule.height || Math.abs(probe.fps - schedule.fps) > 1e-6) {
    fail("transition renderer must output " + plan.windowFrames + " frames at the film dimensions and frame rate");
  }
  const frameDir = path.join(transitionRoot, "rendered-frames");
  const encodedFrames = await extractFrameWindow(options.ffmpeg, output, 0, plan.windowFrames, frameDir, "transition output " + plan.segmentId, schedule.fps);
  const outputs = encodedFrames.map((row, index) => ({
    sourceFramePair: { A: sourceFrames[index].a, B: sourceFrames[index].b },
    outputFrameSha256: row.sha256,
  }));
  const manifest = {
    segmentId: plan.segmentId,
    previousSegmentId: plan.previousSegmentId,
    id: plan.id,
    method: plan.method,
    windowFrames: plan.windowFrames,
    mode: plan.mode,
    boundaryReason: plan.boundaryReason,
    windowFrameRange: plan.windowFrameRange,
    handleMap: plan.mode === "handles" ? {
      preceding: { sourceRange: { startFrame: aStart, endFrame: aStart + plan.windowFrames }, bodyFrameRange: previous.frameRange, tailHandleFrames: previous.tailHandleFrames },
      incoming: { sourceRange: { startFrame: bStart, endFrame: bStart + plan.windowFrames }, bodyFrameRange: current.frameRange, headHandleFrames: current.headHandleFrames },
      outputFrameRangeReplaced: plan.windowFrameRange,
      totalFrameCountDelta: 0,
    } : null,
    ...(boundaryFrameMap ? { boundaryFrameMap, sourceFrames: { preceding: "rendered body tail, then held last body frame", incoming: "held first body frame, then rendered body head" } } : {}),
    sourceFunction: plan.sourceFunction,
    sourceCommit: plan.sourceCommit,
    parameters: plan.parameters,
    frames: outputs.map((row, index) => ({
      frameIndex: index,
      A: row.sourceFramePair.A,
      B: row.sourceFramePair.B,
      outputFrameSha256: row.outputFrameSha256,
      instanceId: frameCalls[index].instanceId,
      sourceFunctionCallCompleted: true,
      adapterCallsForInstance: frameCalls[index].calls,
      adapterCallTimesSec: frameCalls[index].timeSec,
      outputFrameTimeSec: frameCalls[index].outputFrameTime,
    })),
    renderedOutput: { path: output, sha256: await fileSha256(output, "rendered transition clip"), frameCount: probe.frameCount },
    renderReceipt: { path: receiptPath, sha256: await fileSha256(receiptPath, "transition render receipt"), sourceFunctionCalls: receipt.templateEffects.calls, adapterCalls: receipt.transitions.calls, callsByInstance },
  };
  const receiptFile = path.join(transitionRoot, "transition-receipt.json");
  const receiptBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  await writeNew(receiptFile, receiptBytes);
  return { ...manifest, outputPaths: [output], receiptPath: receiptFile, receiptSha256: sha256(receiptBytes) };
}

export async function assembleTransitionFilm(ffmpeg, output, jobRoot, rendered, schedule, transitionRows) {
  const transitionBySegment = new Map(transitionRows.map((row) => [row.segmentId, row]));
  const inputs = rendered.map((row) => row.output);
  for (const row of transitionRows) inputs.push(row.renderedOutput.path);
  const inputArgs = inputs.flatMap((file) => ["-i", file]);
  const filters = [];
  const parts = [];
  let filterIndex = 0;
  const transitionInputStart = rendered.length;
  const transitionInputBySegment = new Map();
  let nextTransitionInput = transitionInputStart;
  for (const row of transitionRows) {
    transitionInputBySegment.set(row.segmentId, nextTransitionInput);
    nextTransitionInput += 1;
  }
  for (let index = 0; index < schedule.segments.length; index += 1) {
    const item = schedule.segments[index];
    const sourceFrameOffset = rendered[index].sourceFrameOffset || 0;
    const bodyStart = sourceFrameOffset + item.headHandleFrames + item.incomingHalfWindowFrames;
    const bodyEnd = sourceFrameOffset + item.headHandleFrames + item.frameCount - item.outgoingHalfWindowFrames;
    if (bodyEnd > bodyStart) {
      const label = "part" + filterIndex++;
      filters.push(`[${index}:v:0]trim=start_frame=${bodyStart}:end_frame=${bodyEnd},setpts=PTS-STARTPTS,fps=${schedule.fps},setsar=1,format=yuv420p[${label}]`);
      parts.push("[" + label + "]");
    }
    const incoming = transitionBySegment.get(schedule.segments[index + 1]?.id);
    if (incoming) {
      const sourceIndex = transitionInputBySegment.get(incoming.segmentId);
      const label = "part" + filterIndex++;
      filters.push(`[${sourceIndex}:v:0]trim=start_frame=0:end_frame=${incoming.windowFrames},setpts=PTS-STARTPTS,fps=${schedule.fps},setsar=1,format=yuv420p[${label}]`);
      parts.push("[" + label + "]");
    }
  }
  if (!parts.length) fail("transition assembly has no body or transition frames");
  filters.push(parts.join("") + `concat=n=${parts.length}:v=1:a=0[outv]`);
  const filterFile = path.join(jobRoot, "concat", "fixed-clock-transition.ffgraph");
  await fs.mkdir(path.dirname(filterFile), { recursive: true });
  await writeNew(filterFile, filters.join(";\n") + "\n");
  const tempOutput = path.join(jobRoot, "picture-only.mp4");
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", ...inputArgs, "-filter_complex_script", filterFile, "-map", "[outv]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(schedule.fps), "-fps_mode", "cfr", "-movflags", "+faststart", tempOutput], {
    cwd: jobRoot, env: childEnv(path.join(jobRoot, "tmp")), label: "fixed-clock A/B transition film assembly",
  });
  return tempOutput;
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
  const nativeCatalog = await readJson(catalogPath, "Motion template catalog");
  if (!Array.isArray(nativeCatalog.sources)) fail("Motion production catalog has no minimal source pins");
  object(blueprint, "film blueprint");
  if (blueprint.format !== FILM_FORMAT) fail("film blueprint.format must be " + FILM_FORMAT);
  onlyKeys(blueprint, new Set(["format", "width", "height", "fps", "clock", "segments"]), "film blueprint");
  const clock = object(blueprint.clock, "film blueprint.clock");
  const asrcut = clock.kind === "asrcut-v2" ? await verifyAsrcutClock(clock, path.dirname(blueprintPath)) : null;
  const schedule = compileFilmSchedule(blueprint, asrcut?.timeline || null);
  const transitionPlan = resolveFilmTransitions(schedule, nativeCatalog);
  for (const [index, segment] of blueprint.segments.entries()) validateSegmentRow(segment, index, schedule.clockKind);
  const inputPaths = [blueprintPath, templateCli, motionCli, catalogPath, nativeRuntimeRoot, path.join(skillDir, "templates", "adapters", "laohu-motion-recipes.js")];
  if (transitionPlan.length) inputPaths.push(path.join(skillDir, "templates", "adapters", "laohu-transitions.js"));
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
  const sourceFfmpegExe = ffmpeg || "ffmpeg";
  const sourceFfmpegEnv = { ...process.env };
  if (ffmpeg) sourceFfmpegEnv.PATH = path.dirname(ffmpeg) + path.delimiter + (sourceFfmpegEnv.PATH || "");
  preflightFfmpeg(sourceFfmpegExe, { env: sourceFfmpegEnv });
  if (ffmpegExe !== sourceFfmpegExe) preflightFfmpeg(ffmpegExe, { env: process.env });

  const jobRoot = path.join(workRoot, ".cache", "tmp", "laohu-motion", "film-render",
    "native-scene-" + blueprintInput.sha256.slice(0, 12) + "-" + process.pid + "-" + Date.now());
  await fs.mkdir(path.dirname(jobRoot), { recursive: true });
  await fs.mkdir(jobRoot, { recursive: false });
  await fs.mkdir(path.join(jobRoot, "tmp"), { recursive: true });
  await fs.mkdir(path.join(jobRoot, "concat"), { recursive: true });

  const rendered = [];
  const sourceBySegment = new Map();
  for (const item of schedule.segments) {
    const row = await renderOne(item, path.dirname(blueprintPath), jobRoot, { browser, ffmpeg: ffmpeg || null, catalog: nativeCatalog });
    rendered.push(row);
    if (row.eventSource) sourceBySegment.set(item.id, row.eventSource);
  }
  const ffprobe = ffprobePath(ffmpegExe);
  const streamRows = [];
  for (let index = 0; index < rendered.length; index += 1) {
    const probe = await probeVideo(ffprobe, rendered[index].output, "rendered segment " + schedule.segments[index].id);
    if (probe.frameCount !== rendered[index].expectedFrameCount) fail("segment " + schedule.segments[index].id + " output frame count differs from body plus declared source handles");
    streamRows.push(probe);
  }
  assertCompatibleStreams(streamRows, schedule, { streamCopy: transitionPlan.length === 0 });

  let transitionReceipts = [];
  let tempOutput;
  if (transitionPlan.length) {
    transitionReceipts = [];
    for (const plan of transitionPlan) transitionReceipts.push(await renderTransitionWindow(plan, schedule, rendered, jobRoot, { browser: browser || null, ffmpeg: ffmpegExe }));
    tempOutput = await assembleTransitionFilm(ffmpegExe, outputPath, jobRoot, rendered, schedule, transitionReceipts);
  } else {
    const concatFile = path.join(jobRoot, "concat", "segments.ffconcat");
    await writeNew(concatFile, rendered.map((row) => concatEscape(row.output)).join(""));
    tempOutput = path.join(jobRoot, "picture-only.mp4");
    await run(ffmpegExe, ["-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concatFile, "-map", "0:v:0", "-an", "-c:v", "copy", "-movflags", "+faststart", tempOutput], { cwd: jobRoot, env: childEnv(path.join(jobRoot, "tmp")), label: "hard-cut picture-only concat" });
  }
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
    output: { path: relativeToManifest(manifestPath, outputPath), sha256: outputHash, kind: transitionPlan.length ? "picture-only-fixed-clock-transition" : "picture-only-hard-cut" },
    render: { width: schedule.width, height: schedule.height, fps: schedule.fps, frameCount: schedule.totalFrameCount, durationSec: schedule.totalFrameCount / schedule.fps },
    frameClock: { kind: schedule.clockKind, method: "absolute-ceil-boundaries", fps: schedule.fps, totalFrameCount: schedule.totalFrameCount },
    segments: schedule.segments.map((item, index) => ({
      id: item.id,
      renderer: item.renderer,
      template: rendered[index].nativeTemplate,
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
      expectedFrameCount: item.sourceFrameCount,
      observedFrameCount: streamRows[index].frameCount,
      receiptPath: relativeToManifest(manifestPath, rendered[index].receiptPath),
      motionRecipes: rendered[index].motionSceneEvidence,
      sourceRuntimeProbe: rendered[index].sourceRuntimeProbeMeta,
      sourceCueBindings: rendered[index].sourceCueBindings,
      sourceFrameCount: item.sourceFrameCount,
      bodyFrameRange: item.frameRange,
      sourceLocalBodyRange: item.sourceLocalBodyRange,
      headHandleFrames: item.headHandleFrames,
      tailHandleFrames: item.tailHandleFrames,
      nativeCueBindings: rendered[index].nativeCueBindings,
      adjustedEventScenePath: rendered[index].derivedEventScenePath ? relativeToManifest(manifestPath, rendered[index].derivedEventScenePath) : null,
      adjustedEventSceneSha256: rendered[index].derivedEventSceneSha256,
    })),
    ...eventProjection,
    transitions: transitionReceipts.map((row) => ({
      segmentId: row.segmentId,
      previousSegmentId: row.previousSegmentId,
      id: row.id,
      method: row.method,
      mode: row.mode,
      boundaryReason: row.boundaryReason,
      windowFrames: row.windowFrames,
      windowFrameRange: row.windowFrameRange,
      handleMap: row.handleMap,
      boundaryFrameMap: row.boundaryFrameMap || null,
      sourceFrames: row.sourceFrames || null,
      sourceFunction: row.sourceFunction,
      sourceCommit: row.sourceCommit,
      parameters: row.parameters,
      frames: row.frames,
      receiptPath: relativeToManifest(manifestPath, row.receiptPath),
      renderedOutput: { path: relativeToManifest(manifestPath, row.renderedOutput.path), sha256: row.renderedOutput.sha256, frameCount: row.renderedOutput.frameCount },
      renderReceipt: { path: relativeToManifest(manifestPath, row.renderReceipt.path), sha256: row.renderReceipt.sha256, sourceFunctionCalls: row.renderReceipt.sourceFunctionCalls, adapterCalls: row.renderReceipt.adapterCalls },
    })),
    assembly: { method: transitionPlan.length ? "ffmpeg-fixed-clock-filter-concat" : "ffmpeg-concat-demuxer-stream-copy", transition: transitionPlan.length ? "pinned-source-rendered-centered-A/B-windows" : "hard-cut", audioStream: "absent", ffprobe: finalProbe, workRoot: relativeToManifest(manifestPath, jobRoot) },
  };
  await fs.link(tempOutput, outputPath).catch((error) => fail("cannot commit film output without replacing an existing file: " + error.message));
  await fs.unlink(tempOutput);
  manifest.output.sha256 = await fileSha256(outputPath, "committed picture-only film");
  const receiptSha256 = await writeManifest(manifestPath, manifest);
  return { outputPath, manifestPath, manifestSha256: receiptSha256, frameCount: schedule.totalFrameCount, durationSec: schedule.totalFrameCount / schedule.fps, segments: rendered.length, workRoot: jobRoot };
}
