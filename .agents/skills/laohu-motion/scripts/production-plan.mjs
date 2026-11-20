#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveProjectShotModule, verifyProjectShotReceipt } from "../templates/adapters/laohu-project-shot.mjs";
import { resolveMotionRuntime } from "./laohu-motion-runtime.mjs";
import {compilePlan as compileAsrcutPlan, hashPlan as hashAsrcutPlan, verifyAnimationHandoff, verifyCaptionManifest, verifyPlanEvidence} from "../../laohu-asrcut/scripts/asrcut.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(skillDir, "../../..");
const templatesCli = path.join(skillDir, "scripts", "templates.mjs");
const audioCli = path.join(skillDir, "scripts", "audio.mjs");
const catalogPath = path.join(skillDir, "templates", "catalog.json");
const sourceLedgerPath = path.join(skillDir, "templates", "maintenance", "source-ledger.json");
const PLAN_FORMAT_V1 = "laohu.motion.production-plan/1";
const PLAN_FORMAT_V2 = "laohu.motion.production-plan/2";
const PLAN_FORMAT_V3 = "laohu.motion.production-plan/3";
const PLAN_FORMAT_V4 = "laohu.motion.production-plan/4";
const PLAN_FORMAT_V5 = "laohu.motion.production-plan/5";
const PLAN_FORMATS = new Set([PLAN_FORMAT_V1, PLAN_FORMAT_V2, PLAN_FORMAT_V3, PLAN_FORMAT_V4, PLAN_FORMAT_V5]);
const PLAN_FORMAT = PLAN_FORMAT_V4;
const PROJECT_SHOT_ROUTE_ID = "laohu-project-shot";
const PROJECT_SHOT_CONSUMER_FIELDS = ["modulePath", "moduleSha256", "exportName", "props", "dependencies", "assets"];
const isFormalV4OrV5 = (plan) => plan?.format === PLAN_FORMAT_V4 || plan?.format === PLAN_FORMAT_V5;
const isDesignPlanV3Plus = (plan) => plan?.format === PLAN_FORMAT_V3 || isFormalV4OrV5(plan);
function requiredProjectShotFields(plan) {
  const required = [...PROJECT_SHOT_CONSUMER_FIELDS];
  if (isFormalV4OrV5(plan)) {
    required.push("props.attentionPhases", "props.attentionGlobalFromSeconds");
    if (plan.directorDesign?.narration?.mode === "timeline") required.push("props.captionManifest", "props.captionStyle");
  }
  return required;
}
function validateProjectShotFieldList(fields, plan, label) {
  const required = requiredProjectShotFields(plan);
  const allowed = new Set([...required]);
  if (isFormalV4OrV5(plan)) {
    for (const style of plan.directorDesign?.globalSettings?.textStyles || []) for (const consumer of style.consumerMappings || []) {
      for (const field of [consumer.fontFamilyField, consumer.fontWeightField, consumer.sizePxField, consumer.colorField,
        consumer.lineHeightField, consumer.letterSpacingField, consumer.fontFileField].filter(Boolean)) allowed.add(field);
    }
  }
  if (required.some((field) => !fields.includes(field)) || fields.some((field) => !allowed.has(field))
      || new Set(fields).size !== fields.length) {
    fail(label + " must list the registered project-shot contract fields and only its declared caption/attention/style props");
  }
}
const FILM_FORMATS = new Set(["laohu.huashu-film-blueprint/1", "laohu.huashu-film-blueprint/2"]);
const FILM_MANIFEST_FORMATS = new Map([
  ["laohu.huashu-film-blueprint/1", "laohu.huashu-om-film-manifest/1"],
  ["laohu.huashu-film-blueprint/2", "laohu.motion-film-manifest/2"],
]);
const SUPPORTED_AUDIO_SCHEMA = 1;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const evidenceValidationStack = [];

function fail(message) { throw new Error(message); }
function failWithCode(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object");
  return value;
}
function array(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) fail(label + (allowEmpty ? " must be an array" : " must be a non-empty array"));
  return value;
}
function text(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(label + " must be a non-empty string");
  return value;
}
function onlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(label + " contains unsupported field " + key);
}
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
const PNG_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = PNG_CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function validatePngBytes(bytes, label) {
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) fail(label + " must point to an actual PNG key-state image");
  let offset = PNG_SIGNATURE.length;
  let header = null;
  let sawIdat = false;
  let sawEnd = false;
  const imageData = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) fail(label + " is a truncated PNG chunk stream");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const chunkData = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== expectedCrc) fail(label + " has an invalid PNG " + type + " chunk checksum");
    if (!header && type !== "IHDR") fail(label + " PNG must begin with IHDR");
    if (type === "IHDR") {
      if (header || length !== 13) fail(label + " PNG must contain one 13-byte IHDR chunk");
      const width = chunkData.readUInt32BE(0);
      const height = chunkData.readUInt32BE(4);
      const bitDepth = chunkData[8];
      const colorType = chunkData[9];
      const interlace = chunkData[12];
      const channelCounts = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);
      const validDepths = new Map([[0, new Set([1, 2, 4, 8, 16])], [2, new Set([8, 16])], [3, new Set([1, 2, 4, 8])], [4, new Set([8, 16])], [6, new Set([8, 16])]]);
      if (!width || !height || width > 16384 || height > 16384 || width * height > 100_000_000) fail(label + " PNG dimensions are invalid or too large");
      if (!channelCounts.has(colorType) || !validDepths.get(colorType).has(bitDepth) || ![0, 1].includes(interlace) || chunkData[10] !== 0 || chunkData[11] !== 0) fail(label + " PNG color, compression, filter, or interlace metadata is invalid");
      header = { width, height, bitDepth, colorType, channels: channelCounts.get(colorType), interlace };
    } else if (type === "IDAT") {
      if (!header || sawEnd) fail(label + " PNG IDAT chunk is out of order");
      sawIdat = true;
      imageData.push(chunkData);
    } else if (type === "IEND") {
      if (!header || !sawIdat || length !== 0) fail(label + " PNG IEND is missing image data or is malformed");
      sawEnd = true;
      offset = end;
      break;
    }
    offset = end;
  }
  if (!header || !sawIdat || !sawEnd || offset !== bytes.length) fail(label + " is not a complete PNG image");
  let decoded;
  try { decoded = zlib.inflateSync(Buffer.concat(imageData), { maxOutputLength: 512 * 1024 * 1024 }); }
  catch (error) { fail(label + " PNG image data cannot be decoded: " + error.message); }
  if (!decoded.length) fail(label + " PNG has no decoded pixel data");
  if (header.interlace === 0) {
    const rowBytes = Math.ceil(header.width * header.channels * header.bitDepth / 8);
    if (decoded.length !== header.height * (rowBytes + 1)) fail(label + " PNG decoded pixel rows do not match its declared dimensions");
    for (let row = 0; row < header.height; row += 1) if (decoded[row * (rowBytes + 1)] > 4) fail(label + " PNG contains an invalid row filter");
  }
}
async function hashFile(file) {
  const hash = crypto.createHash("sha256");
  const stream = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await stream.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally { await stream.close(); }
  return hash.digest("hex");
}
function resolveFrom(baseDir, value, label) {
  text(value, label);
  if (/^(?:https?:|file:)/i.test(value)) fail(label + " must be a local file path, not a URL");
  return path.resolve(baseDir, value);
}
function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}
async function readJson(file, label) {
  let bytes;
  try { bytes = await fs.readFile(file); } catch (error) { fail(label + " cannot be read at " + file + ": " + error.message); }
  try { return { value: JSON.parse(bytes.toString("utf8")), bytes }; }
  catch (error) { fail(label + " is not valid JSON at " + file + ": " + error.message); }
}
async function verifyFileReference(baseDir, reference, label, { png = false } = {}) {
  object(reference, label);
  onlyKeys(reference, new Set(["path", "sha256"]), label);
  const file = resolveFrom(baseDir, reference.path, label + ".path");
  const expected = text(reference.sha256, label + ".sha256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) fail(label + ".sha256 must be a 64-character hexadecimal SHA-256");
  const actual = await hashFile(file).catch((error) => fail(label + " file is unavailable: " + error.message));
  if (actual !== expected) fail(label + " SHA-256 changed: expected " + expected + ", observed " + actual);
  if (png) {
    validatePngBytes(await fs.readFile(file), label);
  }
  return { file, sha256: actual };
}
async function verifyAsrcutHandoff(plan, planDir, { formalV4 = false } = {}) {
  const ref = plan.inputs.asrcut;
  if (ref == null) {
    if (formalV4) return null;
    return null;
  }
  object(ref, "plan.inputs.asrcut");
  onlyKeys(ref, formalV4 ? new Set(["timeline", "editPlan", "captionManifest", "animationHandoff", "silenceMap"]) : new Set(["timeline", "editPlan"]), "plan.inputs.asrcut");
  const timelineInput = await verifyFileReference(planDir, ref.timeline, "ASRcut timeline");
  const editPlanInput = await verifyFileReference(planDir, ref.editPlan, "ASRcut edit plan");
  if (!formalV4) return null;
  const {value: editPlan} = await readJson(editPlanInput.file, "ASRcut edit plan");
  await verifyPlanEvidence(editPlan, {baseDir: path.dirname(editPlanInput.file)});
  const planSha256 = hashAsrcutPlan(editPlan);
  let canonicalTimeline;
  try { canonicalTimeline = compileAsrcutPlan(editPlan); }
  catch (error) { fail("ASRcut edit plan cannot be recompiled from its verified source evidence: " + error.message); }
  const {value: suppliedTimeline, bytes: timelineBytes} = await readJson(timelineInput.file, "ASRcut timeline");
  if (canonicalJson(suppliedTimeline) !== canonicalJson(canonicalTimeline)) {
    fail("ASRcut timeline is stale or contains forged target ranges; recompile it from the exact supplied edit plan");
  }
  if (canonicalTimeline.planSha256 !== planSha256) fail("ASRcut canonical timeline plan hash differs from the verified edit plan");
  let captionManifest = null;
  let captionManifestInput = null;
  if (ref.captionManifest != null) {
    captionManifestInput = await verifyFileReference(planDir, ref.captionManifest, "ASRcut caption manifest");
    const loaded = await readJson(captionManifestInput.file, "ASRcut caption manifest");
    captionManifest = loaded.value;
    try {
      verifyCaptionManifest(captionManifest, {
        plan: editPlan,
        timeline: canonicalTimeline,
        planSha256,
        timelineSha256: sha256(timelineBytes),
      });
    } catch (error) { fail("ASRcut caption manifest does not bind the exact verified edit plan/timeline: " + error.message); }
  }
  if (formalV4 && !captionManifest && ref.captionManifest != null) fail("production-plan/4 or /5 caption manifest reference did not produce a valid compiled manifest");
  if (!ref.animationHandoff && ref.silenceMap) fail("ASRcut silence-map reference requires its optional animation handoff");
  let animationHandoff = null;
  if (ref.animationHandoff) {
    const handoffFile = await verifyFileReference(planDir, ref.animationHandoff, "ASRcut animation handoff");
    const loaded = await readJson(handoffFile.file, "ASRcut animation handoff");
    if (sha256(loaded.bytes) !== handoffFile.sha256) fail("ASRcut animation handoff changed while reading");
    let silenceMap = null;
    if (ref.silenceMap) {
      const silenceFile = await verifyFileReference(planDir, ref.silenceMap, "ASRcut silence map");
      const readMap = await readJson(silenceFile.file, "ASRcut silence map");
      if (sha256(readMap.bytes) !== silenceFile.sha256) fail("ASRcut silence map changed while reading");
      silenceMap = readMap.value;
    }
    try {
      animationHandoff = await verifyAnimationHandoff(loaded.value, {plan: editPlan, timelineBytes, silenceMap, baseDir: path.dirname(editPlanInput.file)});
    } catch (error) { fail("ASRcut animation handoff does not match the exact compiled plan/timeline and source probe: " + error.message); }
  }
  return {timeline: canonicalTimeline, editPlan, planSha256, timelineSha256: sha256(timelineBytes), captionManifest, captionManifestInput, timelineInput, editPlanInput,
    ...(animationHandoff ? {animationHandoff} : {})};
}

async function validateCreativeDesign(plan, units, materialById, asrcutHandoff) {
  const design = object(plan.creativeDesign, "plan.creativeDesign");
  onlyKeys(design, new Set(["format", "id", "narrationMode", "globalDirection", "cueDesigns", "resourceFit"]), "plan.creativeDesign");
  if (design.format !== "laohu.motion.creative-design/1") fail("production-plan/5 requires creativeDesign/1");
  const designId = text(design.id, "creativeDesign.id");
  const narrationMode = text(design.narrationMode, "creativeDesign.narrationMode");
  if (!new Set(["timeline", "script-only", "none"]).has(narrationMode)) fail("creativeDesign.narrationMode must be timeline, script-only, or none");
  const global = object(design.globalDirection, "creativeDesign.globalDirection");
  onlyKeys(global, new Set(["audience", "centralIdea", "experience", "emotionalArc", "visualLanguage", "soundLanguage", "continuity", "avoid"]), "creativeDesign.globalDirection");
  for (const field of ["audience", "centralIdea", "experience", "emotionalArc", "visualLanguage", "soundLanguage", "continuity"]) {
    text(global[field], "creativeDesign.globalDirection." + field);
  }
  if (typeof global.avoid === "string") text(global.avoid, "creativeDesign.globalDirection.avoid");
  else array(global.avoid, "creativeDesign.globalDirection.avoid").forEach((item) => text(item, "creativeDesign.globalDirection.avoid item"));

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const cueDesigns = array(design.cueDesigns, "creativeDesign.cueDesigns");
  unique(cueDesigns, (cue) => cue.id, "creative cue design");
  const perUnit = new Map(units.map((unit) => [unit.id, 0]));
  const captionIds = new Set();
  for (const cue of cueDesigns) {
    object(cue, "creative cue design");
    onlyKeys(cue, new Set(["id", "viewingUnitId", "captionCueId", "sourceRef", "picturePrompt", "actors", "foregroundText", "before", "process", "after", "focus", "emotion", "sound"]), "creative cue design");
    text(cue.id, "creative cue design.id");
    const viewingUnitId = text(cue.viewingUnitId, "creative cue design.viewingUnitId");
    const unit = unitById.get(viewingUnitId);
    if (!unit) fail("creative cue design " + cue.id + " references unknown viewingUnitId " + viewingUnitId);
    perUnit.set(viewingUnitId, perUnit.get(viewingUnitId) + 1);
    const isCaption = cue.captionCueId != null;
    const hasSourceRef = cue.sourceRef != null;
    if (isCaption === hasSourceRef) fail("creative cue design " + cue.id + " must use exactly one captionCueId or sourceRef; do not copy timing or transcript text into a second clock");
    if (narrationMode === "timeline") {
      if (!isCaption || !asrcutHandoff?.captionManifest) fail("timeline creativeDesign requires exact captionCueId references from the verified ASRcut caption manifest");
      const captionCueId = text(cue.captionCueId, "creative cue design.captionCueId");
      if (captionIds.has(captionCueId)) fail("creativeDesign repeats captionCueId " + captionCueId);
      captionIds.add(captionCueId);
      if (!asrcutHandoff.captionManifest.cues.some((row) => row.id === captionCueId)) fail("creativeDesign.captionCueId is absent from the verified caption manifest: " + captionCueId);
    } else {
      if (isCaption || asrcutHandoff?.captionManifest) fail("script-only and no-narration creativeDesign must not create ASR caption IDs or claim caption precision");
      const sourceRef = object(cue.sourceRef, "creative cue design.sourceRef");
      onlyKeys(sourceRef, new Set(["materialId", "locator"]), "creative cue design.sourceRef");
      const materialId = text(sourceRef.materialId, "creative cue design.sourceRef.materialId");
      const locator = text(sourceRef.locator, "creative cue design.sourceRef.locator");
      if (!materialById.has(materialId)) fail("creative cue design.sourceRef references unknown source material " + materialId);
      if (!(unit.sourceRefs || []).some((ref) => ref.materialId === materialId && ref.locator === locator)) {
        fail("creative cue design.sourceRef must reuse an exact source reference already assigned to its viewingUnit");
      }
    }
    text(cue.picturePrompt, "creative cue design.picturePrompt");
    text(cue.before, "creative cue design.before");
    text(cue.process, "creative cue design.process");
    text(cue.after, "creative cue design.after");
    const actors = array(cue.actors, "creative cue design.actors");
    const actorIds = unique(actors, (row) => row.id, "creative actor in " + cue.id);
    for (const actor of actors) {
      object(actor, "creative actor");
      onlyKeys(actor, new Set(["id", "role", "meaning", "appearance", "placement"]), "creative actor");
      text(actor.id, "creative actor.id"); text(actor.role, "creative actor.role"); text(actor.meaning, "creative actor.meaning");
      text(actor.appearance, "creative actor.appearance"); text(actor.placement, "creative actor.placement");
    }
    const foregroundText = array(cue.foregroundText, "creative cue design.foregroundText", {allowEmpty: true});
    unique(foregroundText, (row) => row.id, "foreground text in " + cue.id);
    for (const row of foregroundText) {
      object(row, "creative foreground text");
      onlyKeys(row, new Set(["id", "text", "role", "relationship", "appearance", "placement"]), "creative foreground text");
      text(row.id, "creative foreground text.id"); text(row.text, "creative foreground text.text");
      text(row.role, "creative foreground text.role"); text(row.relationship, "creative foreground text.relationship");
      text(row.appearance, "creative foreground text.appearance"); text(row.placement, "creative foreground text.placement");
    }
    const focus = object(cue.focus, "creative cue design.focus");
    onlyKeys(focus, new Set(["primaryActorId", "supportingActorIds", "handoff"]), "creative cue design.focus");
    if (!actorIds.has(text(focus.primaryActorId, "creative cue design.focus.primaryActorId"))) fail("creative focus primaryActorId must name a declared actor");
    const supportingActorIds = focus.supportingActorIds == null ? [] : array(focus.supportingActorIds, "creative cue design.focus.supportingActorIds", {allowEmpty: true});
    unique(supportingActorIds.map((id) => ({id})), (row) => row.id, "creative supporting actor in " + cue.id);
    for (const id of supportingActorIds) if (!actorIds.has(text(id, "creative cue design.focus.supportingActorIds item"))) fail("creative supporting actor must name a declared actor");
    text(focus.handoff, "creative cue design.focus.handoff");
    const emotion = object(cue.emotion, "creative cue design.emotion");
    onlyKeys(emotion, new Set(["from", "to", "mechanism"]), "creative cue design.emotion");
    for (const field of ["from", "to", "mechanism"]) text(emotion[field], "creative cue design.emotion." + field);
    const sound = object(cue.sound, "creative cue design.sound");
    onlyKeys(sound, new Set(["voice", "music", "sfx", "fallback"]), "creative cue design.sound");
    for (const field of ["voice", "music", "sfx", "fallback"]) text(sound[field], "creative cue design.sound." + field);
  }
  if ([...perUnit].some(([, count]) => count === 0)) fail("creativeDesign must provide at least one actual cue design for every viewingUnit");
  if (narrationMode === "timeline") {
    const expected = (asrcutHandoff.captionManifest.cues || []).map((cue) => cue.id);
    const actual = cueDesigns.map((cue) => cue.captionCueId);
    if (canonicalJson(actual) !== canonicalJson(expected)) fail("timeline creativeDesign must cover every retained caption-manifest cue exactly once and in canonical order");
  }
  const resourceFit = design.resourceFit == null ? [] : array(design.resourceFit, "creativeDesign.resourceFit", {allowEmpty: true});
  unique(resourceFit, (row) => row.resourceTaskId, "creative resource-fit task");
  for (const row of resourceFit) {
    object(row, "creative resource-fit row");
    onlyKeys(row, new Set(["resourceTaskId", "soundRole", "context", "requirements", "outcome", "evidence", "acquisition"]), "creative resource-fit row");
    const resourceTaskId = text(row.resourceTaskId, "creative resource-fit resourceTaskId");
    if (row.soundRole != null) text(row.soundRole, "creative resource-fit soundRole");
    text(row.context, "creative resource-fit context");
    array(row.requirements, "creative resource-fit requirements").forEach((item) => text(item, "creative resource-fit requirement"));
    const outcome = text(row.outcome, "creative resource-fit outcome");
    if (!new Set(["pending", "fit", "adapted-fit", "not-fit"]).has(outcome)) fail("creative resource-fit outcome must be pending, fit, adapted-fit, or not-fit");
    let acquisition = null;
    if (row.acquisition != null) {
      acquisition = object(row.acquisition, "creative resource-fit acquisition");
      onlyKeys(acquisition, new Set(["status", "method", "recordMaterialId", "recordLocator", "summary", "nextAction", "candidate", "generationAuthorization"]), "creative resource-fit acquisition");
      const status = text(acquisition.status, "creative resource-fit acquisition.status");
      const method = text(acquisition.method, "creative resource-fit acquisition.method");
      const acquisitionMethods = new Set(["local-inspection", "source-search", "source-get", "source-edit", "authorized-generation"]);
      const boundaryMethods = new Set(["authorization-boundary", "tool-boundary", "cost-boundary"]);
      if (!new Set(["acquired", "attempted-unresolved", "blocked"]).has(status)) {
        fail("creative resource-fit acquisition.status must be acquired, attempted-unresolved, or blocked");
      }
      let generationAuthorization = null;
      if (acquisition.generationAuthorization != null) {
        generationAuthorization = object(acquisition.generationAuthorization, "creative resource-fit generationAuthorization");
        onlyKeys(generationAuthorization, new Set(["resourceTaskId", "soundRole", "sourceMaterialId", "locator", "userDecision", "scope"]), "creative resource-fit generationAuthorization");
        if (text(generationAuthorization.resourceTaskId, "generationAuthorization.resourceTaskId") !== resourceTaskId) {
          fail("generationAuthorization.resourceTaskId must match the exact current resourceFit resourceTaskId");
        }
        const authorizationSoundRole = generationAuthorization.soundRole == null ? null : text(generationAuthorization.soundRole, "generationAuthorization.soundRole");
        if (row.soundRole != null && authorizationSoundRole !== row.soundRole) {
          fail("generationAuthorization.soundRole must match the exact current resourceFit soundRole");
        }
        if (authorizationSoundRole != null && row.soundRole !== authorizationSoundRole) {
          fail("generationAuthorization cannot authorize a different or undeclared sound role");
        }
        const sourceMaterialId = text(generationAuthorization.sourceMaterialId, "generationAuthorization.sourceMaterialId");
        const authorizationMaterial = materialById.get(sourceMaterialId);
        if (!authorizationMaterial?.file || !authorizationMaterial.sha256) {
          fail("generationAuthorization.sourceMaterialId must resolve to a hash-verified source material");
        }
        const locator = object(generationAuthorization.locator, "generationAuthorization.locator");
        onlyKeys(locator, new Set(["lineStart", "lineEnd"]), "generationAuthorization.locator");
        const {lineStart, lineEnd} = locator;
        if (!Number.isSafeInteger(lineStart) || !Number.isSafeInteger(lineEnd) || lineStart < 1 || lineEnd < lineStart) {
          fail("generationAuthorization.locator must identify an exact positive source-line range");
        }
        const userDecision = text(generationAuthorization.userDecision, "generationAuthorization.userDecision");
        const scope = text(generationAuthorization.scope, "generationAuthorization.scope");
        if (!scope.includes(resourceTaskId) || (authorizationSoundRole != null && !scope.includes(authorizationSoundRole))) {
          fail("generationAuthorization.scope must explicitly bind the current resource task and declared sound role");
        }
        const authorizationBytes = await fs.readFile(authorizationMaterial.file);
        if (sha256(authorizationBytes) !== authorizationMaterial.sha256) fail("generationAuthorization source changed after its declared hash was checked");
        const authorizationLines = authorizationBytes.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
        if (lineEnd > authorizationLines.length) fail("generationAuthorization.locator ends after the referenced source material");
        const excerpt = authorizationLines.slice(lineStart - 1, lineEnd).join("\n");
        if (!excerpt.includes(userDecision)) fail("generationAuthorization.userDecision must quote an exact instruction present inside its source-line locator");
      }
      if (method === "authorized-generation" && !generationAuthorization) {
        fail("authorized-generation requires a source-located, task- and role-specific generationAuthorization; the method label is not permission");
      }
      const recordMaterialId = text(acquisition.recordMaterialId, "creative resource-fit acquisition.recordMaterialId");
      const recordMaterial = materialById.get(recordMaterialId);
      if (!recordMaterial?.file || !recordMaterial.sha256) fail("creative resource-fit acquisition must link a hash-verified source record in plan.inputs.sourceMaterials");
      text(acquisition.recordLocator, "creative resource-fit acquisition.recordLocator");
      text(acquisition.summary, "creative resource-fit acquisition.summary");
      text(acquisition.nextAction, "creative resource-fit acquisition.nextAction");
      if (status === "acquired") {
        if (!acquisitionMethods.has(method)) fail("acquired creative resource-fit candidate requires an actual local inspection, source search/get/edit, or explicitly authorized generation method");
        const candidate = object(acquisition.candidate, "creative resource-fit acquisition.candidate");
        onlyKeys(candidate, new Set(["materialId", "sha256"]), "creative resource-fit acquisition.candidate");
        const candidateMaterialId = text(candidate.materialId, "creative resource-fit acquisition.candidate.materialId");
        const candidateMaterial = materialById.get(candidateMaterialId);
        if (!candidateMaterial?.file || !candidateMaterial.sha256) fail("acquired creative resource-fit candidate must resolve to a hash-verified source material file");
        if (candidateMaterialId === recordMaterialId || candidateMaterial.file === recordMaterial.file) {
          fail("acquisition record and acquired candidate must be separate source materials; a search note cannot stand in for the actual candidate file");
        }
        const candidateSha256 = text(candidate.sha256, "creative resource-fit acquisition.candidate.sha256").toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(candidateSha256) || candidateSha256 !== candidateMaterial.sha256.toLowerCase()) {
          fail("creative resource-fit candidate SHA-256 must match its exact hash-verified source material bytes");
        }
      } else {
        if (acquisition.candidate != null) fail("unresolved or blocked creative resource acquisition cannot claim an acquired candidate; add one only after its bytes are hash-verified");
        if (status === "attempted-unresolved" && !acquisitionMethods.has(method)) {
          fail("attempted-unresolved creative resource fit must record an actual local inspection, source search/get/edit, or authorized generation attempt");
        }
        if (status === "blocked" && !boundaryMethods.has(method)) {
          fail("blocked creative resource acquisition requires a source-located authorization, tool/credential, or cost boundary; unavailable audition alone does not block searching/getting");
        }
        if (status === "blocked" && method === "authorization-boundary") {
          const lineMatch = /^lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?$/i.exec(acquisition.recordLocator.trim());
          if (!lineMatch) fail("authorization-boundary recordLocator must identify exact source lines as 'line N' or 'lines N-M'; plan-only is not a no-acquire instruction");
          const lineStart = Number(lineMatch[1]);
          const lineEnd = Number(lineMatch[2] || lineMatch[1]);
          const boundaryBytes = await fs.readFile(recordMaterial.file);
          if (sha256(boundaryBytes) !== recordMaterial.sha256) fail("authorization-boundary source changed after its declared hash was checked");
          const boundaryLines = boundaryBytes.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
          if (lineStart < 1 || lineEnd < lineStart || lineEnd > boundaryLines.length) fail("authorization-boundary recordLocator must identify an exact positive range within its hash-verified source material");
          const boundaryExcerpt = boundaryLines.slice(lineStart - 1, lineEnd).join("\n").trim();
          const explicitNoAcquire = /(?:不(?:得|要|可|准|允许|授权)?\s*(?:搜索|检索|获取|下载|采集|准备素材|取得候选)|禁止.{0,16}(?:搜索|检索|获取|下载|采集|准备素材|取得候选)|仅.{0,12}(?:规划|设计|分析).{0,12}(?:不|无需|禁止).{0,12}(?:搜索|检索|获取|下载|采集)|no[- ]?(?:acquire|download|search)|do not (?:acquire|download|search)|permission denied|unauthorized|not authorized|无权限|未授权|权限不足|缺少.{0,8}凭证)/i.test(boundaryExcerpt);
          if (!explicitNoAcquire) fail("authorization-boundary must quote an explicit no-acquire/no-download instruction or a genuine permission/credential boundary; plan-only does not qualify");
          if (!acquisition.summary.includes(boundaryExcerpt)) fail("authorization-boundary summary must quote the exact bounded instruction or permission evidence from its source locator");
          if (!/(用户.{0,12}(?:授权|允许|确认|更改|更新)|(?:取得|获得|恢复|补齐|开通).{0,12}(?:授权|权限|许可|凭证|登录)|(?:登录|补齐|开通).{0,12}(?:后|后再))/i.test(acquisition.nextAction)) {
            fail("authorization-boundary nextAction must state the actual user authorization or access condition that resumes resource acquisition");
          }
        }
        if (status === "blocked" && method === "tool-boundary"
            && !/(search|get|source|检索|搜索|下载|获取|查找|来源)/i.test(acquisition.nextAction)) {
          fail("a retrieval-tool boundary must name the source search/get action to resume; missing listening capability alone is not a reason to block acquisition");
        }
      }
      if (["fit", "adapted-fit"].includes(outcome) && status !== "acquired") {
        fail("fit/adapted-fit creative resource rows cannot claim unresolved or blocked acquisition");
      }
    }
    if (["pending", "not-fit"].includes(outcome) && !acquisition) {
      fail(outcome + " creative resource fit requires a hash-linked acquisition attempt, acquired candidate, or genuine authorization/tool/cost boundary before the direction handoff can be complete");
    }
    if (row.outcome === "pending") {
      if (row.evidence != null) fail("pending creative resource fit cannot claim completed suitability evidence");
    } else if (row.evidence != null) {
      const evidence = object(row.evidence, "creative resource-fit evidence");
      onlyKeys(evidence, new Set(["kind", "assetId", "sha256", "method", "observer", "recordMaterialId", "recordLocator", "contextStartSec", "contextEndSec", "observation"]), "creative resource-fit evidence");
      text(evidence.kind, "creative resource-fit evidence.kind");
      text(evidence.assetId, "creative resource-fit evidence.assetId");
      const digest = text(evidence.sha256, "creative resource-fit evidence.sha256").toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(digest)) fail("creative resource-fit evidence.sha256 must be a SHA-256 digest");
      const method = text(evidence.method, "creative resource-fit evidence.method");
      if (!new Set(["context-audition", "visual-inspection", "source-screening", "technical-preview"]).has(method)) {
        fail("creative resource-fit method must distinguish an actual context audition/visual inspection from source screening or technical preview");
      }
      text(evidence.observer, "creative resource-fit evidence.observer");
      const recordMaterialId = text(evidence.recordMaterialId, "creative resource-fit evidence.recordMaterialId");
      if (!materialById.has(recordMaterialId)) fail("creative resource-fit evidence must link a hash-verified review record in plan.inputs.sourceMaterials");
      text(evidence.recordLocator, "creative resource-fit evidence.recordLocator");
      if (typeof evidence.contextStartSec !== "number" || !Number.isFinite(evidence.contextStartSec) || evidence.contextStartSec < 0
          || typeof evidence.contextEndSec !== "number" || !Number.isFinite(evidence.contextEndSec) || evidence.contextEndSec <= evidence.contextStartSec) {
        fail("creative resource-fit evidence must identify the exact reviewed source/context range in seconds");
      }
      text(evidence.observation, "creative resource-fit evidence.observation");
    }
    if (["fit", "adapted-fit"].includes(row.outcome) && !row.evidence) fail("creative resource-fit fit/adapted-fit requires a linked context-specific audition/review record; a selection or checkbox alone is not suitability evidence");
    if (["fit", "adapted-fit"].includes(row.outcome) && !["context-audition", "visual-inspection"].includes(row.evidence.method)) {
      fail("source-screening and technical-preview are not suitability proof; keep the resource fit pending until an actual observer reviews the selected resource in context");
    }
  }
  return {creativeDesignIdentitySha256: sha256(Buffer.from(canonicalJson(design), "utf8")), creativeDesignId: designId};
}

function validateCreativeResourceFitBinding(plan, materialById, audioPreview) {
  if (plan.format !== PLAN_FORMAT_V5) return;
  const creativeRows = plan.creativeDesign.resourceFit || [];
  const tasks = plan.directorDesign.resourceTasks || [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const fitByTask = new Map(creativeRows.map((row) => [row.resourceTaskId, row]));
  for (const row of creativeRows) {
    const task = taskById.get(row.resourceTaskId);
    if (!task) fail("creative resource-fit row must resolve to the exact Motion resourceTask: " + row.resourceTaskId);
    if (task.status !== "satisfied") {
      if (row.outcome !== "pending") fail("resource-fit cannot claim a selected resource is suitable before its linked Motion resourceTask is acquired and verified: " + row.resourceTaskId);
      continue;
    }
    if (!["fit", "adapted-fit"].includes(row.outcome)) {
      fail("a still-required Motion resourceTask cannot be declared production-ready while creative resource fit is pending/not-fit; resume acquisition or choose a fitting alternative: " + row.resourceTaskId);
    }
    const selection = task.selection;
    const evidence = row.evidence;
    const record = materialById.get(evidence.recordMaterialId);
    if (!record || !record.file || !record.sha256) fail("creative resource-fit review record must resolve to a hash-verified source material: " + row.resourceTaskId);
    if (selection.kind === "material") {
      const material = materialById.get(selection.materialId);
      if (evidence.kind !== "material" || evidence.assetId !== selection.materialId || !material
          || evidence.sha256.toLowerCase() !== material.sha256.toLowerCase()) {
        fail("creative resource-fit evidence must bind the exact acquired material ID and bytes consumed by its Motion resourceTask: " + row.resourceTaskId);
      }
      if (evidence.method !== "visual-inspection") fail("material resource fit requires a visual inspection, not an audio audition or source scan: " + row.resourceTaskId);
    } else if (selection.kind === "audio") {
      const resolved = audioPreview.usedAssetsById.get(selection.assetId);
      if (evidence.kind !== "audio" || evidence.assetId !== selection.assetId || !resolved
          || evidence.sha256.toLowerCase() !== resolved.sha256.toLowerCase()) {
        fail("creative resource-fit evidence must bind the exact acquired audio asset ID and bytes consumed by its Motion resourceTask: " + row.resourceTaskId);
      }
      if (evidence.method !== "context-audition") fail("audio resource fit requires an audition of the exact selected asset in context: " + row.resourceTaskId);
    } else {
      fail("creative resource-fit can bind only an actually acquired material or audio selection: " + row.resourceTaskId);
    }
  }
  for (const task of tasks) {
    if (task.status === "satisfied" && !fitByTask.has(task.id)) {
      fail("production cannot treat acquisition as proof of creative suitability; add an explicit context-specific creative resourceFit outcome for " + task.id);
    }
  }
}
function unique(items, getId, label) {
  const seen = new Set();
  for (const item of items) {
    const id = text(getId(item), label + " id");
    if (seen.has(id)) fail("duplicate " + label + " id " + id);
    seen.add(id);
  }
  return seen;
}
function getPath(root, dotted) {
  return dotted.split(".").reduce((current, key) => current == null ? undefined : current[key], root);
}
function jsonPathExists(root, dotted) {
  const value = getPath(root, dotted);
  return value !== undefined && value !== null;
}
function run(command, args, label, env, timeout = 1_200_000) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout, env });
  if (result.error) fail(label + " could not start: " + result.error.message);
  if (result.status !== 0) fail(label + " failed (exit " + result.status + ")\n" + (result.stdout || "") + "\n" + (result.stderr || ""));
  return result.stdout;
}
function cliArgs(argv) {
  const [command, ...rest] = argv;
  const values = new Set(["--plan", "--work-root", "--receipt", "--browser", "--ffmpeg", "--stage", "--output", "--view"]);
  const flags = new Set(["--allow-unreviewed-preview"]);
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (flags.has(key)) { args.allowUnreviewedPreview = true; continue; }
    if (!values.has(key)) fail("unknown argument " + key);
    if (!rest[index + 1] || rest[index + 1].startsWith("--")) fail("missing value for " + key);
    args[key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = rest[++index];
  }
  if (!["validate", "render-film", "render-audio", "run", "export-design", "verify-delivery"].includes(command)) fail("expected validate, render-film, render-audio, run, export-design, or verify-delivery");
  if (!args.plan) fail(command + " requires --plan /absolute/path/to/production-plan.json");
  args.plan = path.resolve(args.plan);
  if (args.stage && !new Set(["inputs", "direction", "production"]).has(args.stage)) fail("--stage must be inputs, direction, or production");
  if (args.stage && !["validate", "export-design"].includes(command)) fail("--stage is supported only with validate or export-design");
  if (command === "export-design" && args.stage === "inputs") fail("export-design supports --stage direction or production");
  if (command === "export-design" && !args.output) fail("export-design requires --output /path/inside/plan-directory/director-design.md");
  if (args.view && command !== "export-design") fail("--view is supported only with export-design");
  if (args.view && !new Set(["creative", "technical"]).has(args.view)) fail("--view must be creative or technical");
  if (command === "export-design") args.view ||= "creative";
  if (command !== "export-design" && args.output) fail("--output is supported only with export-design");
  if (args.allowUnreviewedPreview && !["run", "render-audio"].includes(command)) {
    fail("--allow-unreviewed-preview is available only to run or render-audio because only those commands consume an audio plan");
  }
  if (["render-film", "render-audio", "run"].includes(command)) {
    if (!args.workRoot || !path.isAbsolute(args.workRoot)) fail(command + " requires an absolute --work-root on the project work disk");
    args.workRoot = path.resolve(args.workRoot);
  }
  for (const key of ["receipt", "browser", "ffmpeg"]) if (args[key] && !path.isAbsolute(args[key])) fail("--" + key + " must be an absolute path");
  return args;
}

async function loadResources() {
  const [{ value: catalog }, { value: ledger }] = await Promise.all([
    readJson(catalogPath, "Motion catalog"), readJson(sourceLedgerPath, "Motion source ledger"),
  ]);
  if (!Array.isArray(catalog.templates) || !Array.isArray(catalog.effects) || !Array.isArray(catalog.methods)) fail("Motion production catalog is incomplete");
  if (!Array.isArray(ledger.sourceOnlyTemplates) || !Array.isArray(ledger.referenceCatalog?.entries)) fail("Motion source ledger is incomplete");
  const styleIndexPath = resolveFrom(skillDir, catalog.styleLibrary?.indexPath, "catalog.styleLibrary.indexPath");
  const { value: styleIndex } = await readJson(styleIndexPath, "Motion style library index");
  const compatibilityIndexPath = resolveFrom(skillDir, catalog.styleLibrary?.compatibilityIndexPath, "catalog.styleLibrary.compatibilityIndexPath");
  const { value: compatibilityStyleIndex } = await readJson(compatibilityIndexPath, "Motion compatibility style index");
  return { catalog, ledger, styleIndex, compatibilityStyleIndex };
}

function resourceRow(resources, type, resourceId) {
  const localTemplates = resources.catalog.templates || [];
  const sourceTemplates = resources.ledger.sourceOnlyTemplates || [];
  const references = resources.ledger.referenceCatalog.entries || [];
  const rows = type === "template" || type === "component" ? [...localTemplates, ...sourceTemplates]
    : type === "effect" ? resources.catalog.effects || []
      : type === "effect-library" ? resources.catalog.effectLibraries || []
        : type === "method" ? resources.catalog.methods || []
          : type === "style" ? [...(resources.styleIndex.entries || []), ...(resources.compatibilityStyleIndex.entries || [])]
            : type === "reference-index" ? references.filter((row) => row.kind !== "style-profile")
              : type === "style-profile" ? references.filter((row) => row.kind === "style-profile")
                : type === "source-index" ? [...(resources.ledger.sources || []), ...(resources.ledger.sourceTreeIndex || [])]
                  : [];
  const row = rows.find((entry) => entry.id === resourceId || entry.productionId === resourceId || entry.name === resourceId
    || (Array.isArray(entry.aliases) && entry.aliases.includes(resourceId)));
  if (!row) fail("selected " + type + " resource " + resourceId + " is not present in the current local catalog/index");
  return row;
}

async function projectShotRouteEvidence({ workRoot = repoRoot } = {}) {
  const adapterPath = path.join(skillDir, "templates", "adapters", "laohu-project-shot.mjs");
  const hostPath = path.join(skillDir, "templates", "adapters", "laohu-project-shot-entry.tsx");
  const renderDriverPath = path.join(skillDir, "templates", "adapters", "video-shotcraft-remotion.mjs");
  const matureModulePath = path.join(skillDir, "templates", "runtime", "laohu-remotion", "components", "shots", "index.ts");
  const [adapterBytes, hostBytes, renderDriverBytes, matureModuleBytes] = await Promise.all([
    fs.readFile(adapterPath).catch((error) => fail("project-shot route adapter is unavailable: " + error.message)),
    fs.readFile(hostPath).catch((error) => fail("project-shot route host is unavailable: " + error.message)),
    fs.readFile(renderDriverPath).catch((error) => fail("project-shot Film render driver is unavailable: " + error.message)),
    fs.readFile(matureModulePath).catch((error) => fail("project-shot mature module export surface is unavailable: " + error.message)),
  ]);
  const runtime = resolveMotionRuntime({
    packages: ["@babel/parser", "react", "react-dom", "remotion"],
    expectedVersions: { react: "19.2.7", "react-dom": "19.2.7", remotion: "4.0.537" },
    projectRoot: repoRoot, skillRoot: skillDir, workRoot,
  });
  const runtimeLockPath = path.join(runtime.runtimeRoot, "package-lock.json");
  const runtimeLockBytes = await fs.readFile(runtimeLockPath).catch((error) => fail("canonical project-shot runtime lock is unavailable: " + error.message));
  return {
    id: PROJECT_SHOT_ROUTE_ID,
    kind: "renderer-route",
    renderer: "laohu-project-shot",
    adapter: { path: path.relative(skillDir, adapterPath).split(path.sep).join("/"), sha256: sha256(adapterBytes) },
    host: { path: path.relative(skillDir, hostPath).split(path.sep).join("/"), sha256: sha256(hostBytes) },
    renderDriver: { path: path.relative(skillDir, renderDriverPath).split(path.sep).join("/"), sha256: sha256(renderDriverBytes) },
    matureModuleSurface: { path: path.relative(skillDir, matureModulePath).split(path.sep).join("/"), sha256: sha256(matureModuleBytes) },
    runtime: {
      lockSha256: sha256(runtimeLockBytes),
      packages: runtime.packages.map(({ name, version }) => ({ name, version })),
    },
  };
}

function requireProductionUse(row, type, id, label) {
  const use = row?.motionUse;
  if (!use || use.intendedUse !== "production-implementation" || use.ordinaryProductionCandidate !== true) {
    fail(label + " " + id + " is a reference or unclassified resource, not an ordinary production candidate");
  }
}

function routeCandidateMatchesMapping(candidate, mapping, segment) {
  return candidate?.resourceType === "renderer-route"
    && candidate.resourceId === PROJECT_SHOT_ROUTE_ID
    && mapping?.resourceType === "project-shot"
    && mapping.role === "base"
    && segment?.renderer === "laohu-project-shot"
    && mapping.resourceId === segment.modulePath;
}

function candidateMatchesMapping(candidate, mapping, segment, resources) {
  if (routeCandidateMatchesMapping(candidate, mapping, segment)) return true;
  if (candidate?.resourceType === "component" && mapping?.resourceType === "style") {
    try {
      const consumer = resourceRow(resources, "component", candidate.resourceId);
      const style = resourceRow(resources, "style", mapping.resourceId);
      if (Array.isArray(consumer.styleIds) && consumer.styleIds.includes(style.id)
          && consumer.renderer === segment?.renderer) return true;
    } catch {
      return false;
    }
  }
  if (candidate?.resourceType !== mapping?.resourceType) return false;
  if (["material", "motion-scene"].includes(candidate.resourceType)) return candidate.resourceId === mapping.resourceId;
  try {
    return resourceRow(resources, mapping.resourceType, mapping.resourceId).id
      === resourceRow(resources, candidate.resourceType, candidate.resourceId).id;
  } catch {
    return false;
  }
}

async function validateV2DirectionPlan(partial) {
  const { plan, planDir, planPath, materialById } = partial;
  const resources = await loadResources();
  const units = array(plan.viewingUnits, "plan.viewingUnits");
  const unitIds = unique(units, (row) => row.id, "viewing unit");
  for (const unit of units) {
    object(unit, "viewing unit");
    onlyKeys(unit, new Set(["id", "sourceRefs", "task", "completionSignal", "nextUnitId"]), "viewing unit");
    text(unit.id, "viewing unit.id"); text(unit.task, "viewing unit.task"); text(unit.completionSignal, "viewing unit.completionSignal");
    if (unit.nextUnitId != null) text(unit.nextUnitId, "viewing unit.nextUnitId");
    for (const ref of array(unit.sourceRefs, "viewing unit.sourceRefs")) {
      object(ref, "viewing unit source reference");
      onlyKeys(ref, new Set(["materialId", "locator", "kind"]), "viewing unit source reference");
      if (!materialById.has(text(ref.materialId, "source reference.materialId"))) fail("viewing unit " + unit.id + " references unknown source material " + ref.materialId);
      text(ref.locator, "source reference.locator");
      if (ref.kind != null) text(ref.kind, "source reference.kind");
    }
  }

  let styleLibraryReview = null;
  if (plan.work.directionMode === "new-direction") {
    if (plan.styleLibraryReview == null) fail("new-direction /2 plans require a complete styles fulltext --library receipt before direction validation");
    styleLibraryReview = verifyStyleLibraryReview(plan.styleLibraryReview);
  } else if (plan.styleLibraryReview != null) {
    styleLibraryReview = verifyStyleLibraryReview(plan.styleLibraryReview);
  }

  const decisions = array(plan.directionDecisions, "plan.directionDecisions");
  const decisionIds = unique(decisions, (row) => row.id, "resource decision");
  const selectedByDecision = new Map();
  const decisionInputRows = new Map();
  let projectRoute = null;
  for (const decision of decisions) {
    object(decision, "resource decision");
    onlyKeys(decision, new Set(["id", "mode", "rationale", "candidates", "selectedCandidateId", "decisionInputs", "userLockRef", "evidenceRef"]), "resource decision");
    text(decision.id, "resource decision.id"); text(decision.rationale, "resource decision.rationale");
    if (decision.mode !== plan.work.directionMode) fail("resource decision " + decision.id + " mode differs from plan.work.directionMode");
    const candidates = array(decision.candidates, "resource decision " + decision.id + ".candidates");
    const candidateIds = unique(candidates, (row) => row.id, "candidate in decision " + decision.id);
    const selectedId = text(decision.selectedCandidateId, "resource decision.selectedCandidateId");
    if (!candidateIds.has(selectedId)) fail("resource decision " + decision.id + " selectedCandidateId does not match a listed candidate");
    for (const candidate of candidates) {
      object(candidate, "resource decision candidate");
      onlyKeys(candidate, new Set(["id", "resourceType", "resourceId", "fitReason", "limitations", "keyStateEvidence"]), "resource decision candidate");
      text(candidate.id, "candidate.id"); text(candidate.fitReason, "candidate.fitReason");
      if (candidate.limitations != null) text(candidate.limitations, "candidate.limitations");
      const type = text(candidate.resourceType, "candidate.resourceType");
      const id = text(candidate.resourceId, "candidate.resourceId");
      if (type === "material") {
        if (!materialById.has(id)) fail("candidate material " + id + " is not in plan.inputs.sourceMaterials");
      } else if (type === "renderer-route") {
        if (id !== PROJECT_SHOT_ROUTE_ID) fail("/2 renderer-route candidates must identify an actual registered local route");
        projectRoute ||= await projectShotRouteEvidence();
      } else if (type === "motion-scene") {
        fail("/2 direction must name a registered local implementation route; an unverified scene path is not a feasible consumer plan");
      } else {
        if (!["template", "component", "effect", "style"].includes(type)) fail("candidate.resourceType must identify a local template, component, effect, style, material, or renderer-route");
        const row = resourceRow(resources, type, id);
        if (type === "style") {
          if (row.selectionEligible !== true || row.route?.callable !== true) fail("style candidate " + id + " is research-only or has no registered callable consumer");
        } else {
          requireProductionUse(row, type, id, "candidate");
          if (!["available", "conditional"].includes(row.availability)) fail("candidate " + id + " is not available through its registered production consumer");
        }
      }
      const selected = candidate.id === selectedId;
      if (selected && candidate.keyStateEvidence?.length) {
        fail("/2 direction does not require or accept production key-state evidence before the Film or work composition exists");
      }
      if (candidate.keyStateEvidence != null && !Array.isArray(candidate.keyStateEvidence)) fail("candidate.keyStateEvidence must be an array when supplied");
    }
    const selected = candidates.find((candidate) => candidate.id === selectedId);
    selectedByDecision.set(decision.id, selected);
    if (decision.mode === "locked-local") {
      await verifyUserLockRef(decision.userLockRef, materialById);
      if (decision.evidenceRef != null) fail("locked-local decision uses userLockRef; use evidence-local only when reusing an earlier direction");
    } else if (decision.userLockRef != null) fail(decision.mode + " decision cannot carry userLockRef");
    if (decision.mode === "evidence-local") {
      if (decision.evidenceRef == null) fail("evidence-local decision requires an earlier validated direction plan");
      await verifyEvidenceLocalRef(planDir, planPath, decision.evidenceRef, decision, selected, resources);
    } else if (decision.evidenceRef != null) fail("evidenceRef is supported only for evidence-local decisions");

    const refs = decision.decisionInputs == null ? [] : array(decision.decisionInputs, "resource decision " + decision.id + ".decisionInputs", { allowEmpty: true });
    decisionInputRows.set(decision.id, refs);
    if (decision.mode === "new-direction" && refs.length === 0) fail("new-direction decision " + decision.id + " needs full-library and source-located style inputs");
    let reviewCount = 0;
    let styleSourceCount = 0;
    for (const ref of refs) {
      object(ref, "decision input");
      onlyKeys(ref, new Set(["resourceType", "resourceId", "whyRelevant", "sourceLocation", "applicability", "preservedMechanism", "consumerMappings"]), "decision input");
      const refType = text(ref.resourceType, "decision input.resourceType");
      const refId = text(ref.resourceId, "decision input.resourceId");
      text(ref.whyRelevant, "decision input.whyRelevant");
      if (refType === "style-library") {
        if (decision.mode !== "new-direction" || refId !== "all" || !styleLibraryReview) fail("style-library decision input must cite resourceId 'all' and the complete original-text review");
        reviewCount += 1;
      } else if (refType === "material") {
        if (!materialById.has(refId)) fail("decision input material " + refId + " is not among declared source materials");
      } else {
        const row = resourceRow(resources, refType, refId);
        if (["reference-index", "style-profile"].includes(refType) && row.availability !== "source-only") fail("reference index and style profile decision inputs must remain source-only");
        if (refType === "style" && decision.mode === "new-direction") {
          styleSourceCount += 1;
          object(ref.sourceLocation, "style decision input " + refId + ".sourceLocation");
          onlyKeys(ref.sourceLocation, new Set(["path", "lineStart", "lineEnd"]), "style sourceLocation");
          if (ref.sourceLocation.path !== row.contentPath) fail("style decision input " + refId + " must point to its exact original source path");
          const { lineStart, lineEnd } = ref.sourceLocation;
          if (!Number.isSafeInteger(lineStart) || !Number.isSafeInteger(lineEnd) || lineStart < 1 || lineEnd < lineStart || lineEnd > row.lines) fail("style decision input " + refId + " source line range is invalid");
          const styleRoot = path.dirname(path.resolve(skillDir, resources.catalog.styleLibrary.indexPath));
          const sourcePath = path.resolve(styleRoot, row.contentPath);
          if (!isWithin(styleRoot, sourcePath)) fail("style decision input " + refId + " escapes the pinned local style library");
          const sourceBytes = await fs.readFile(sourcePath);
          if (sha256(sourceBytes) !== row.localSha256) fail("style decision input " + refId + " source changed from its pinned local hash");
          const sourceLines = sourceBytes.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
          if (!sourceLines.slice(lineStart - 1, lineEnd).join("\n").trim()) fail("style decision input " + refId + " source range is empty");
          text(ref.applicability, "style decision input " + refId + ".applicability");
          text(ref.preservedMechanism, "style decision input " + refId + ".preservedMechanism");
          const consumers = array(ref.consumerMappings, "style decision input " + refId + ".consumerMappings");
          unique(consumers, (item) => item.shotId + "::" + item.mappingId, "style consumer mapping");
          for (const item of consumers) {
            object(item, "style consumer mapping");
            onlyKeys(item, new Set(["shotId", "mappingId", "howUsed"]), "style consumer mapping");
            text(item.shotId, "style consumer mapping.shotId"); text(item.mappingId, "style consumer mapping.mappingId"); text(item.howUsed, "style consumer mapping.howUsed");
          }
        }
      }
    }
    if (decision.mode === "new-direction" && reviewCount !== 1) fail("new-direction decision " + decision.id + " requires exactly one full-library review input");
    if (decision.mode === "new-direction" && styleSourceCount === 0) fail("new-direction decision " + decision.id + " must cite at least one original style passage");
  }

  const implementationPlan = array(plan.implementationPlan, "plan.implementationPlan");
  const implementationIds = unique(implementationPlan, (row) => row.id, "implementation plan row");
  const mappingIds = new Set();
  const implementedUnits = new Set();
  for (const row of implementationPlan) {
    object(row, "implementation plan row");
    onlyKeys(row, new Set(["id", "decisionId", "viewingUnitIds", "filmSegmentId", "renderer", "resourceType", "resourceId", "mappingId", "consumerFields"]), "implementation plan row");
    text(row.id, "implementation plan row.id");
    const decisionId = text(row.decisionId, "implementation plan row.decisionId");
    if (!decisionIds.has(decisionId)) fail("implementation plan row " + row.id + " references unknown decision " + decisionId);
    const selected = selectedByDecision.get(decisionId);
    if (row.resourceType !== selected.resourceType || row.resourceId !== selected.resourceId) fail("implementation plan row " + row.id + " must name the selected feasible implementation route/resource");
    const renderer = text(row.renderer, "implementation plan row.renderer");
    const resourceType = text(row.resourceType, "implementation plan row.resourceType");
    const resourceId = text(row.resourceId, "implementation plan row.resourceId");
    text(row.filmSegmentId, "implementation plan row.filmSegmentId");
    const mappingId = text(row.mappingId, "implementation plan row.mappingId");
    if (mappingIds.has(mappingId)) fail("implementation plan mappingId must be unique: " + mappingId);
    mappingIds.add(mappingId);
    const fields = array(row.consumerFields, "implementation plan row.consumerFields");
    fields.forEach((field) => text(field, "implementation plan consumer field"));
    if (resourceType === "renderer-route") {
      if (resourceId !== PROJECT_SHOT_ROUTE_ID || renderer !== "laohu-project-shot") fail("implementation plan renderer-route must point to the real laohu-project-shot consumer");
      validateProjectShotFieldList(fields, plan, "laohu-project-shot consumer plan");
      projectRoute ||= await projectShotRouteEvidence();
    } else {
      const resource = resourceType === "material" ? materialById.get(resourceId) : resourceRow(resources, resourceType, resourceId);
      if (!resource) fail("implementation plan row " + row.id + " does not resolve to an actual local resource");
      if (resourceType !== "material") requireProductionUse(resource, resourceType, resourceId, "implementation plan");
      if (resource.renderer !== renderer) fail("implementation plan renderer differs from the selected local resource renderer");
    }
    const rowUnitIds = array(row.viewingUnitIds, "implementation plan row.viewingUnitIds");
    for (const id of rowUnitIds) {
      const unitId = text(id, "implementation plan viewingUnitId");
      if (!unitIds.has(unitId)) fail("implementation plan row " + row.id + " references unknown viewing unit " + unitId);
      implementedUnits.add(unitId);
    }
  }
  if (implementedUnits.size !== unitIds.size) fail("direction plan must assign every viewing unit to a feasible consumer route before Film production");

  for (const [decisionId, refs] of decisionInputRows) {
    for (const ref of refs) {
      if (ref.resourceType !== "style" || plan.work.directionMode !== "new-direction") continue;
      for (const consumer of ref.consumerMappings || []) {
        const implementation = implementationPlan.find((row) => row.id === consumer.shotId && row.mappingId === consumer.mappingId);
        if (!implementation || implementation.decisionId !== decisionId) fail("style source mapping " + consumer.mappingId + " must point to an implementation row owned by decision " + decisionId);
        const selected = selectedByDecision.get(decisionId);
        if (implementation.resourceType !== selected.resourceType || implementation.resourceId !== selected.resourceId) fail("style source mapping must point to the selected implementation route, not a different consumer");
      }
    }
  }
  const designIdentities = isDesignPlanV3Plus(plan)
    ? validateDirectorDesignShape({ plan, planDir, materialById, units, unitIds, implementationPlan, asrcutHandoff: partial.asrcutHandoff })
    : { directorDesignIdentitySha256: null, filmDesignIdentitySha256: null };
  return {
    ...partial,
    resources,
    units,
    unitIds,
    decisions,
    decisionIds,
    selectedByDecision,
    implementationPlan,
    ...designIdentities,
    projectRoute,
    styleLibraryReview,
    outputs: null,
    keyStateProofs: [],
    nextStage: plan.work.directionMode === "technical-probe" ? "technical-probe-only" : "production-plan",
  };
}

function stableDirectorDesignProjection(design) {
  const stable = structuredClone(design);
  for (const task of stable.resourceTasks || []) {
    delete task.status;
    // Selection is fixed at design time. Acquisition is only a later fact
    // (actual bytes/hash and bound rights-review receipt), so completing a task
    // must not mutate the Analysis design identity.
    delete task.acquisition;
  }
  return stable;
}

function directorDesignIdentity(design) {
  return sha256(Buffer.from(canonicalJson(stableDirectorDesignProjection(design)), "utf8"));
}

function filmDesignIdentity(design) {
  const visual = stableDirectorDesignProjection(design);
  // This one brief field is reserved for sound/mix prose. Keep it in the full
  // directorDesign identity, but a text-only mix change must not invalidate the
  // rendered Film. Action-bound sound remains represented by unit.sound.syncCues.
  if (visual.brief) delete visual.brief.soundAndMix;
  for (const unit of visual.units || []) {
    const sound = unit.sound || {};
    unit.sound = { syncCues: sound.syncCues || [] };
  }
  visual.resourceTasks = (visual.resourceTasks || []).filter((task) =>
    !["sfx", "music"].includes(task.soundRole) && task.selection?.kind !== "audio");
  return sha256(Buffer.from(canonicalJson(visual), "utf8"));
}

function validateDirectorDesignV1Shape({ plan, units, unitIds, implementationPlan }) {
  const design = object(plan.directorDesign, "plan.directorDesign");
  onlyKeys(design, new Set(["format", "id", "units", "resourceTasks"]), "plan.directorDesign");
  if (design.format !== "laohu.motion.director-design/1") fail("plan.directorDesign.format must be laohu.motion.director-design/1");
  text(design.id, "plan.directorDesign.id");
  const designUnits = array(design.units, "plan.directorDesign.units");
  const designUnitIds = unique(designUnits, (row) => row.viewingUnitId, "director design viewingUnit");
  if (designUnitIds.size !== unitIds.size || [...unitIds].some((id) => !designUnitIds.has(id))) {
    fail("directorDesign.units must cover every existing viewingUnit exactly once; it is not a second scene list");
  }
  const sourceUnitById = new Map(units.map((unit) => [unit.id, unit]));
  const implementationById = new Map(implementationPlan.map((row) => [row.id, row]));
  const actionById = new Map();
  const designUnitById = new Map();
  const supportedSoundStates = new Set(["none", "designed"]);
  const supportedActionPhases = new Set(["enter", "change", "hold", "read", "exit", "transition"]);

  for (const unit of designUnits) {
    object(unit, "director design unit");
    onlyKeys(unit, new Set(["viewingUnitId", "sourceAnchors", "purpose", "visualGain", "representation", "composition", "focalOrder", "look", "objects", "screenTextIds", "implementationPlanIds", "actions", "transition", "sound"]), "director design unit");
    const viewingUnitId = text(unit.viewingUnitId, "director design viewingUnitId");
    designUnitById.set(viewingUnitId, unit);
    const sourceUnit = sourceUnitById.get(viewingUnitId);
    const anchors = array(unit.sourceAnchors, "director design sourceAnchors");
    for (const anchor of anchors) {
      object(anchor, "director design source anchor");
      onlyKeys(anchor, new Set(["materialId", "locator", "kind"]), "director design source anchor");
      if (!plan.inputs.sourceMaterials.some((material) => material.id === text(anchor.materialId, "director design source anchor.materialId"))) {
        fail("director design source anchor references an unknown ASR/source material " + anchor.materialId);
      }
      text(anchor.locator, "director design source anchor.locator");
      if (anchor.kind != null) text(anchor.kind, "director design source anchor.kind");
    }
    const expectedAnchors = (sourceUnit.sourceRefs || []).map(({ materialId, locator, kind = null }) => ({ materialId, locator, kind }));
    const actualAnchors = anchors.map(({ materialId, locator, kind = null }) => ({ materialId, locator, kind }));
    if (canonicalJson(actualAnchors) !== canonicalJson(expectedAnchors)) {
      fail("director design sourceAnchors must reference this viewingUnit's existing ASR/source locators without copying text or inventing timestamps: " + viewingUnitId);
    }
    for (const field of ["purpose", "visualGain", "representation", "composition", "focalOrder"]) text(unit[field], "director design unit." + field);
    object(unit.look, "director design unit.look");
    onlyKeys(unit.look, new Set(["palette", "surface", "lighting", "typography"]), "director design unit.look");
    for (const field of ["palette", "surface", "lighting", "typography"]) text(unit.look[field], "director design unit.look." + field);
    const objects = array(unit.objects, "director design unit.objects");
    const objectIds = unique(objects, (row) => row.id, "director design object");
    for (const item of objects) {
      object(item, "director design object");
      onlyKeys(item, new Set(["id", "role", "meaning", "initialState", "resultState"]), "director design object");
      for (const field of ["id", "role", "meaning", "initialState", "resultState"]) text(item[field], "director design object." + field);
    }
    const textIds = array(unit.screenTextIds, "director design unit.screenTextIds", { allowEmpty: true });
    unique(textIds.map((id) => ({ id })), (row) => row.id, "director design screen-text reference");
    textIds.forEach((id) => text(id, "director design screenTextId"));
    const rowIds = array(unit.implementationPlanIds, "director design unit.implementationPlanIds");
    const expectedRows = implementationPlan.filter((row) => row.viewingUnitIds.includes(viewingUnitId)).map((row) => row.id).sort();
    const actualRows = rowIds.map((id) => text(id, "director design implementationPlanId")).sort();
    unique(actualRows.map((id) => ({ id })), (row) => row.id, "director design implementation plan reference");
    if (canonicalJson(actualRows) !== canonicalJson(expectedRows)) fail("director design implementationPlanIds must name every actual planned Film consumer for viewingUnit " + viewingUnitId);
    const actions = array(unit.actions, "director design unit.actions");
    unique(actions, (row) => row.id, "director design action");
    for (const action of actions) {
      object(action, "director design action");
      onlyKeys(action, new Set(["id", "phase", "triggerAnchors", "keyStates", "pathOrMorph", "motionPurpose", "handoff", "implementationPlanIds"]), "director design action");
      const actionId = text(action.id, "director design action.id");
      if (actionById.has(actionId)) fail("director design action ids must be unique across all viewing units: " + actionId);
      if (!supportedActionPhases.has(text(action.phase, "director design action.phase"))) fail("director design action.phase is unsupported: " + action.phase);
      const triggerAnchors = array(action.triggerAnchors, "director design action.triggerAnchors");
      for (const anchor of triggerAnchors) {
        object(anchor, "director design action trigger anchor");
        onlyKeys(anchor, new Set(["materialId", "locator", "kind"]), "director design action trigger anchor");
        if (!anchors.some((candidate) => candidate.materialId === anchor.materialId && candidate.locator === anchor.locator && (candidate.kind || null) === (anchor.kind || null))) {
          fail("director design action " + actionId + " trigger must cite an exact source anchor in its viewing unit");
        }
      }
      const keyStates = array(action.keyStates, "director design action.keyStates");
      const keyStateObjectIds = unique(keyStates, (row) => row.objectId, "director design action key-state object");
      for (const state of keyStates) {
        object(state, "director design action key state");
        onlyKeys(state, new Set(["objectId", "from", "to"]), "director design action key state");
        const objectId = text(state.objectId, "director design action key state.objectId");
        if (!objectIds.has(objectId)) fail("director design action " + actionId + " references an unknown visual object " + objectId);
        text(state.from, "director design action key state.from");
        text(state.to, "director design action key state.to");
      }
      text(action.pathOrMorph, "director design action.pathOrMorph");
      text(action.motionPurpose, "director design action.motionPurpose");
      text(action.handoff, "director design action.handoff");
      const actionRows = array(action.implementationPlanIds, "director design action.implementationPlanIds");
      unique(actionRows.map((id) => ({ id })), (row) => row.id, "director design action consumer reference");
      for (const id of actionRows) {
        const row = implementationById.get(text(id, "director design action implementationPlanId"));
        if (!row || !row.viewingUnitIds.includes(viewingUnitId)) fail("director design action " + actionId + " must bind a real implementationPlan consumer for its viewing unit");
      }
      actionById.set(actionId, { ...action, viewingUnitId, keyStateObjectIds });
    }
    const transition = object(unit.transition, "director design unit.transition");
    onlyKeys(transition, new Set(["targetViewingUnitId", "handoff", "continuity"]), "director design unit.transition");
    const target = transition.targetViewingUnitId;
    if (target != null) {
      if (!unitIds.has(text(target, "director design transition.targetViewingUnitId"))) fail("director design transition references an unknown next viewingUnit " + target);
      if (sourceUnit.nextUnitId !== target) fail("director design transition target must follow the existing viewingUnit sequence; do not add a parallel sequence");
    } else if (sourceUnit.nextUnitId != null) {
      fail("director design transition must preserve viewingUnit.nextUnitId " + sourceUnit.nextUnitId);
    }
    text(transition.handoff, "director design transition.handoff");
    text(transition.continuity, "director design transition.continuity");
    const sound = object(unit.sound, "director design unit.sound");
    onlyKeys(sound, new Set(["intent", "reason", "eventIds", "trackIds", "syncCues"]), "director design unit.sound");
    const soundIntent = object(sound.intent, "director design unit.sound.intent");
    onlyKeys(soundIntent, new Set(["sfx", "music"]), "director design unit.sound.intent");
    for (const category of ["sfx", "music"]) {
      if (!supportedSoundStates.has(text(soundIntent[category], "director design sound intent." + category))) {
        fail("director design sound intent." + category + " must be none or designed");
      }
    }
    text(sound.reason, "director design unit.sound.reason");
    const eventIds = array(sound.eventIds, "director design unit.sound.eventIds", { allowEmpty: true });
    const trackIds = array(sound.trackIds, "director design unit.sound.trackIds", { allowEmpty: true });
    unique(eventIds.map((id) => ({ id })), (row) => row.id, "director design sound event reference");
    unique(trackIds.map((id) => ({ id })), (row) => row.id, "director design sound track reference");
    eventIds.forEach((id) => text(id, "director design sound eventId"));
    trackIds.forEach((id) => text(id, "director design sound trackId"));
    if ((soundIntent.sfx === "designed") !== (eventIds.length > 0)) {
      fail("director design sound intent.sfx=designed must cite its planned eventIds; none cannot claim an event");
    }
    if ((soundIntent.music === "designed") !== (trackIds.length > 0)) {
      fail("director design sound intent.music=designed must cite its planned trackIds; none cannot claim a track");
    }
    const syncCues = sound.syncCues == null ? [] : array(sound.syncCues, "director design unit.sound.syncCues", { allowEmpty: true });
    unique(syncCues, (cue) => cue.kind + "::" + cue.id, "director design synchronized sound cue");
    for (const cue of syncCues) {
      object(cue, "director design synchronized sound cue");
      onlyKeys(cue, new Set(["kind", "id", "actionId", "phase", "relationship"]), "director design synchronized sound cue");
      const kind = text(cue.kind, "director design synchronized sound cue.kind");
      const id = text(cue.id, "director design synchronized sound cue.id");
      if (kind === "audio-event" && !eventIds.includes(id)) fail("synchronized audio-event must already be named in sound.eventIds");
      if (kind === "audio-track" && !trackIds.includes(id)) fail("synchronized audio-track must already be named in sound.trackIds");
      if (!new Set(["audio-event", "audio-track"]).has(kind)) fail("synchronized sound cue kind must be audio-event or audio-track");
      const actionId = text(cue.actionId, "director design synchronized sound cue.actionId");
      const action = actions.find((row) => row.id === actionId);
      if (!action) fail("synchronized sound cue must point to an action in this viewing unit");
      const phase = text(cue.phase, "director design synchronized sound cue.phase");
      if (!supportedActionPhases.has(phase) || phase !== action.phase) fail("synchronized sound cue phase must match its referenced action phase; it is not a second free-form time");
      text(cue.relationship, "director design synchronized sound cue.relationship");
    }
  }

  const resourceTasks = design.resourceTasks == null ? [] : array(design.resourceTasks, "directorDesign.resourceTasks", { allowEmpty: true });
  unique(resourceTasks, (row) => row.id, "director design resource task");
  for (const task of resourceTasks) {
    object(task, "director design resource task");
    onlyKeys(task, new Set(["id", "role", "requirement", "viewingUnitIds", "actionIds", "sourceQueries", "selectionCriteria", "acquisitionPlan", "consumerTargets", "selection", "soundRole", "status", "acquisition"]), "director design resource task");
    const taskId = text(task.id, "director design resource task.id");
    text(task.role, "director design resource task.role");
    text(task.requirement, "director design resource task.requirement");
    const taskUnits = array(task.viewingUnitIds, "director design resource task.viewingUnitIds");
    unique(taskUnits.map((id) => ({ id })), (row) => row.id, "resource task viewingUnit reference");
    for (const id of taskUnits) if (!unitIds.has(text(id, "resource task viewingUnitId"))) fail("resource task " + taskId + " references an unknown viewingUnit " + id);
    const taskActions = task.actionIds == null ? [] : array(task.actionIds, "director design resource task.actionIds", { allowEmpty: true });
    unique(taskActions.map((id) => ({ id })), (row) => row.id, "resource task action reference");
    for (const id of taskActions) if (!actionById.has(text(id, "resource task actionId"))) fail("resource task " + taskId + " references an unknown design action " + id);
    const queries = array(task.sourceQueries, "director design resource task.sourceQueries");
    for (const query of queries) {
      object(query, "resource acquisition query");
      onlyKeys(query, new Set(["source", "query"]), "resource acquisition query");
      text(query.source, "resource acquisition query.source");
      text(query.query, "resource acquisition query.query");
    }
    array(task.selectionCriteria, "director design resource task.selectionCriteria").forEach((criterion) => text(criterion, "resource task selection criterion"));
    const acquisitionPlan = object(task.acquisitionPlan, "director design resource task.acquisitionPlan");
    onlyKeys(acquisitionPlan, new Set(["owner", "method", "retrievalSteps", "processingSteps", "rightsChecks", "acceptanceChecks", "failureAction"]), "resource task acquisitionPlan");
    text(acquisitionPlan.owner, "resource acquisition owner");
    text(acquisitionPlan.method, "resource acquisition method");
    for (const key of ["retrievalSteps", "processingSteps", "rightsChecks", "acceptanceChecks"]) {
      array(acquisitionPlan[key], "resource acquisitionPlan." + key).forEach((step) => text(step, "resource acquisitionPlan." + key + " step"));
    }
    text(acquisitionPlan.failureAction, "resource acquisitionPlan.failureAction");
    const selection = task.selection == null ? null : object(task.selection, "director design resource task.selection");
    const selectionKind = selection ? text(selection.kind, "resource task selection.kind") : null;
    if (selectionKind === "material") {
      onlyKeys(selection, new Set(["kind", "materialId", "sourceUrl", "sourceLocator", "license"]), "resource task material selection");
      text(selection.materialId, "resource task selection.materialId");
      validateSelectedSourceLocator(selection, "resource task selection");
      text(selection.license, "resource task selection.license");
      if (task.soundRole != null) fail("material resource task cannot claim a soundRole");
    } else if (selectionKind === "audio") {
      onlyKeys(selection, new Set(["kind", "assetId", "sourceUrl", "sourceLocator", "license"]), "resource task audio selection");
      text(selection.assetId, "resource task selection.assetId");
      validateSelectedSourceLocator(selection, "resource task selection");
      text(selection.license, "resource task selection.license");
      if (!new Set(["sfx", "music"]).has(text(task.soundRole, "resource task soundRole"))) {
        fail("audio resource task must declare soundRole sfx or music so pending sound is not mistaken for silence");
      }
    } else if (selectionKind != null) fail("resource task selection.kind must be material or audio");
    if (!selection && task.status !== "pending") fail("an unselected resource task must remain pending until a real candidate is chosen");
    if (task.soundRole != null && !new Set(["sfx", "music"]).has(text(task.soundRole, "resource task soundRole"))) {
      fail("resource task soundRole must be sfx or music");
    }
    const targets = array(task.consumerTargets, "director design resource task.consumerTargets");
    unique(targets, (target) => {
      object(target, "resource acquisition consumer target");
      return target.kind + "::" + (target.implementationPlanId || target.id);
    }, "resource acquisition consumer target");
    for (const target of targets) {
      object(target, "resource acquisition consumer target");
      const kind = text(target.kind, "resource acquisition consumer target.kind");
      if (kind === "film-mapping") {
        onlyKeys(target, new Set(["kind", "implementationPlanId"]), "resource acquisition consumer target");
        if (!implementationById.has(text(target.implementationPlanId, "resource target implementationPlanId"))) fail("resource task " + taskId + " references an unknown planned Film consumer");
      } else if (kind === "audio-event" || kind === "audio-track") {
        onlyKeys(target, new Set(["kind", "id"]), "resource acquisition consumer target");
        text(target.id, "resource acquisition audio consumer id");
      } else fail("resource acquisition consumer target kind must be film-mapping, audio-event, or audio-track");
    }
    const filmTargets = targets.filter((target) => target.kind === "film-mapping");
    const filmTargetRows = filmTargets.map((target) => implementationById.get(target.implementationPlanId));
    for (const actionId of taskActions) {
      const action = actionById.get(actionId);
      if (!taskUnits.includes(action.viewingUnitId)) {
        fail("resource task " + taskId + " actionId " + actionId + " belongs to viewingUnit " + action.viewingUnitId + " outside its declared viewingUnitIds");
      }
    }
    if (filmTargets.length) {
      for (let index = 0; index < filmTargets.length; index += 1) {
        const target = filmTargets[index];
        const row = filmTargetRows[index];
        const hasUnitUse = taskUnits.some((id) => row.viewingUnitIds.includes(id));
        const hasActionUse = taskActions.some((id) => actionById.get(id).implementationPlanIds.includes(row.id));
        if (!hasUnitUse && !hasActionUse) {
          fail("resource task " + taskId + " Film consumer " + target.implementationPlanId + " is not used by any declared viewingUnitId or actionId");
        }
      }
      for (const viewingUnitId of taskUnits) {
        if (!filmTargetRows.some((row) => row.viewingUnitIds.includes(viewingUnitId))) {
          fail("resource task " + taskId + " viewingUnitId " + viewingUnitId + " has no matching Film consumer target");
        }
      }
      for (const actionId of taskActions) {
        const action = actionById.get(actionId);
        if (!filmTargetRows.some((row) => action.implementationPlanIds.includes(row.id))) {
          fail("resource task " + taskId + " actionId " + actionId + " has no matching Film consumer target in its actual action implementationPlanIds");
        }
      }
    } else if (!task.soundRole) {
      fail("resource task " + taskId + " must identify a Film consumer target or declare its audio soundRole and audio consumer target");
    }
    if (task.soundRole && taskActions.length) {
      const targetKind = task.soundRole === "sfx" ? "audio-event" : "audio-track";
      const audioTargets = targets.filter((target) => target.kind === targetKind);
      for (const actionId of taskActions) {
        const action = actionById.get(actionId);
        const sound = designUnitById.get(action.viewingUnitId)?.sound;
        const bound = audioTargets.some((target) => sound?.syncCues?.some((cue) =>
          cue.kind === targetKind && cue.id === target.id && cue.actionId === actionId && cue.phase === action.phase));
        if (!bound) {
          fail("resource task " + taskId + " audio actionId " + actionId + " must be bound to an actual sound.syncCues entry for its exact audio consumer and action phase");
        }
      }
    }
    if (!["pending", "satisfied"].includes(text(task.status, "resource task status"))) fail("resource task status must be pending or satisfied");
    if (task.status === "pending" && task.acquisition != null) fail("pending resource task cannot claim an acquired asset");
    if (task.status === "satisfied") {
      if (!selection) fail("a resource task cannot be satisfied before Analysis has selected a real source/material");
      const acquisition = object(task.acquisition, "resource task acquisition");
      onlyKeys(acquisition, new Set(["actualSha256", "rightsReview"]), "resource task acquisition receipt");
      const expectedHash = text(acquisition.actualSha256, "resource task acquisition.actualSha256").toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(expectedHash)) fail("resource task acquisition.actualSha256 must be a SHA-256 digest");
      const rightsReview = object(acquisition.rightsReview, "resource task acquisition.rightsReview");
      onlyKeys(rightsReview, new Set(["kind", "selectedId", "sourceUrl", "sourceLocator", "license", "evidenceMaterialId", "reviewedBy", "basis", "sourceDistribution", "finishedWorkSync"]), "resource task rights review");
      if (rightsReview.kind !== selectionKind) fail("resource task rights review.kind must match the fixed selection");
      const selectedId = selectionKind === "material" ? selection.materialId : selection.assetId;
      if (text(rightsReview.selectedId, "resource task rights review.selectedId") !== selectedId) fail("resource task rights review.selectedId must match the fixed selection");
      if ((rightsReview.sourceUrl || null) !== (selection.sourceUrl || null)) fail("resource task rights review.sourceUrl must match the fixed selection");
      if ((rightsReview.sourceLocator || null) !== (selection.sourceLocator || null)) fail("resource task rights review.sourceLocator must match the fixed selection");
      if (text(rightsReview.license, "resource task rights review.license") !== selection.license) fail("resource task rights review.license must match the fixed selection");
      text(rightsReview.evidenceMaterialId, "resource task rights review.evidenceMaterialId");
      text(rightsReview.reviewedBy, "resource task rights review.reviewedBy");
      text(rightsReview.basis, "resource task rights review.basis");
      if (!new Set(["allowed", "restricted", "unknown", "not-applicable"]).has(text(rightsReview.sourceDistribution, "resource task rights review.sourceDistribution"))) {
        fail("resource task rights review.sourceDistribution must record whether the source file itself may be redistributed");
      }
      if (!new Set(["allowed", "prohibited", "unknown"]).has(text(rightsReview.finishedWorkSync, "resource task rights review.finishedWorkSync"))) {
        fail("resource task rights review.finishedWorkSync must separately record permission to synchronize the selected source into the finished work");
      }
    } else if (task.acquisition != null) fail("resource task acquisition is only allowed when status is satisfied");
  }
  for (const unit of designUnits) {
    for (const task of resourceTasks.filter((row) => ["sfx", "music"].includes(row.soundRole) && row.viewingUnitIds.includes(unit.viewingUnitId))) {
      const targetKind = task.soundRole === "sfx" ? "audio-event" : "audio-track";
      const targetIds = task.consumerTargets.filter((target) => target.kind === targetKind).map((target) => target.id);
      const soundIds = task.soundRole === "sfx" ? unit.sound.eventIds : unit.sound.trackIds;
      if (unit.sound.intent[task.soundRole] !== "designed" || targetIds.length === 0 || targetIds.some((id) => !soundIds.includes(id))) {
        fail("director design audio acquisition for " + task.soundRole + " must be linked to the unit's designed sound intent and planned consumer IDs; pending means not yet acquired, not silence or a ready asset");
      }
      if (task.selection && task.selection.kind !== "audio") fail("a task with soundRole must select audio once a concrete candidate is chosen");
    }
  }
  return {
    directorDesignIdentitySha256: directorDesignIdentity(design),
    filmDesignIdentitySha256: filmDesignIdentity(design),
  };
}

const DIRECTOR_BRIEF_SECTIONS = [
  "sourceClockAndCoverage",
  "contentLogic",
  "globalVisualWorld",
  "objectsMaterialsAndText",
  "compositionAndState",
  "cueByCuePicture",
  "actionsAndContinuity",
  "soundAndMix",
  "resourcesAndConsumers",
  "reverseReview",
];

function validRange(range, sampleRateHz) {
  return range && Number.isSafeInteger(range.startSample) && Number.isSafeInteger(range.endSample)
    && Number.isSafeInteger(range.sampleRateHz) && range.sampleRateHz === sampleRateHz
    && range.startSample >= 0 && range.endSample > range.startSample;
}

function readCanonicalSpeechRows(timeline) {
  object(timeline, "ASRcut canonical timeline");
  if (!["laohu.asrcut.timeline/1", "laohu.asrcut.timeline/2"].includes(timeline.format)) {
    fail("directorDesign/2 narration requires the existing ASRcut timeline/1 or /2 contract");
  }
  if (timeline.state !== "frozen" || timeline.coverageComplete !== true) {
    fail("directorDesign/2 narration requires a frozen canonical timeline with coverageComplete:true");
  }
  object(timeline.clock, "ASRcut canonical timeline.clock");
  const sampleRateHz = timeline.clock.sampleRateHz;
  if (!Number.isSafeInteger(sampleRateHz) || sampleRateHz < 1 || timeline.clock.unit !== "sample") {
    fail("ASRcut canonical timeline must identify its integer project-sample clock");
  }
  const durationSamples = timeline.durationSamples;
  if (!Number.isSafeInteger(durationSamples) || durationSamples < 1) fail("ASRcut canonical timeline must identify its integer durationSamples on the same clock");
  const clips = array(timeline.clips, "ASRcut canonical timeline.clips", { allowEmpty: true });
  const occurrenceIds = unique(clips, (clip) => clip.occurrenceId, "canonical timeline occurrence");
  const rows = [];
  const rowsByOccurrenceKind = new Map();
  const transcriptSegmentsByOccurrence = new Map();
  const presentationUnitsById = new Map();
  for (const unit of timeline.units || []) {
    if (unit?.kind !== "presentation") continue;
    const id = text(unit.id, "canonical timeline presentation.id");
    if (!validRange(unit.targetRange, sampleRateHz) || unit.targetRange.endSample > durationSamples) fail("canonical timeline presentation " + id + " has an invalid targetRange");
    if (presentationUnitsById.has(id)) fail("canonical timeline has duplicate presentation id " + id);
    presentationUnitsById.set(id, {id, targetRange: unit.targetRange, sceneId: unit.sceneId, visualHandoff: unit.visualHandoff});
  }
  for (const clip of clips) {
    object(clip, "ASRcut canonical timeline clip");
    const occurrenceId = text(clip.occurrenceId, "canonical timeline clip.occurrenceId");
    if (!validRange(clip.targetRange, sampleRateHz)) fail("canonical timeline clip " + occurrenceId + " has an invalid targetRange");
    if (clip.targetRange.endSample > durationSamples) fail("canonical timeline clip " + occurrenceId + " extends past timeline.durationSamples");
    const words = Array.isArray(clip.words) ? clip.words : [];
    const speechWords = words.filter((word) => word && typeof word.text === "string" && word.text.trim());
    const usableWords = speechWords.filter((word) => typeof word.tokenId === "string" && word.tokenId.trim()
      && validRange(word.targetRange, sampleRateHz));
    const measuredWords = speechWords.length > 0 && usableWords.length === speechWords.length
      && usableWords.every((word) => ["measured", "aligned"].includes(word.timingPrecision));
    const segmentRows = Array.isArray(clip.transcriptSegments) ? clip.transcriptSegments.filter((segment) => segment
      && typeof segment.segmentId === "string" && segment.segmentId.trim()
      && typeof segment.text === "string" && segment.text.trim() && validRange(segment.targetRange, sampleRateHz)) : [];
    transcriptSegmentsByOccurrence.set(occurrenceId, segmentRows.map((segment) => ({
      segmentId: segment.segmentId,
      text: segment.text,
      targetRange: segment.targetRange,
      sampleRateHz,
    })));
    const kind = measuredWords ? "token-range" : segmentRows.length ? "segment-range" : null;
    if (!kind) {
      if (speechWords.length) fail("canonical timeline occurrence " + occurrenceId + " has speech text but neither complete measured/aligned token ranges nor a usable transcript segment range");
      continue;
    }
    const sourceRows = kind === "token-range" ? usableWords : segmentRows;
    const sourceIds = sourceRows.map((row) => kind === "token-range" ? row.tokenId : row.segmentId);
    unique(sourceIds.map((id) => ({ id })), (row) => row.id, "canonical " + kind + " in " + occurrenceId);
    const keyed = sourceRows.map((row) => ({
      kind,
      occurrenceId,
      id: kind === "token-range" ? row.tokenId : row.segmentId,
      text: row.text,
      targetRange: row.targetRange,
      sampleRateHz,
    }));
    for (const row of keyed) if (row.targetRange.endSample > durationSamples) fail("canonical source row " + row.id + " extends past timeline.durationSamples");
    rows.push(...keyed);
    rowsByOccurrenceKind.set(kind + "::" + occurrenceId, keyed);
  }
  const clipByOccurrenceId = new Map(clips.map((clip) => [clip.occurrenceId, clip]));
  return { sampleRateHz, durationSamples, rows, rowsByOccurrenceKind, transcriptSegmentsByOccurrence,
    clipByOccurrenceId, presentationUnitsById, hasSpeech: rows.length > 0, occurrenceIds };
}

/** Resolve non-speech canonical camera anchors against the exact anchors and time ranges in timeline/2. */
export function resolveCanonicalAttentionCameraRange(anchor, phaseRows, canonical) {
  object(anchor, "attention camera anchor");
  onlyKeys(anchor, new Set(["presentationId", "occurrenceId", "edge", "offsetSamples"]), "non-speech attention camera anchor");
  const edge = text(anchor.edge, "attention camera anchor.edge");
  if (!new Set(["start", "end"]).has(edge)) fail("attention camera edge must be start or end");
  const offset = anchor.offsetSamples ?? 0;
  if (!Number.isSafeInteger(offset)) fail("attention camera offsetSamples must be an integer on the canonical sample clock");
  if ((anchor.presentationId != null) === (anchor.occurrenceId != null)) fail("camera anchor must use exactly one canonical presentation or source-clip reference");
  if (anchor.presentationId != null) {
    const presentationId = text(anchor.presentationId, "attention camera presentationId");
    if (!phaseRows.some((row) => row.kind === "presentation" && row.presentationId === presentationId)) {
      fail("camera presentation keyframe must cite a presentation anchor included in its exact phase");
    }
    const presentation = canonical.presentationUnitsById.get(presentationId);
    if (!presentation) fail("camera presentation keyframe is absent from the actual canonical timeline/2 sequence");
    return presentation.targetRange;
  }
  const occurrenceId = text(anchor.occurrenceId, "attention camera source-clip occurrenceId");
  if (!phaseRows.some((row) => row.kind === "source-clip" && row.occurrenceId === occurrenceId && row.edge === edge)) {
    fail("camera source-clip keyframe must cite the exact occurrence boundary anchor included in its phase");
  }
  const clip = canonical.clipByOccurrenceId.get(occurrenceId);
  if (!clip) fail("camera source-clip keyframe is absent from the actual retained timeline");
  return clip.targetRange;
}

function expandTimelineCue(source, canonical, label) {
  object(source, label + ".source");
  const kind = text(source.kind, label + ".source.kind");
  if (!["token-range", "segment-range"].includes(kind)) fail(label + ".source.kind must preserve measured word or utterance/segment precision");
  const allowed = kind === "token-range"
    ? new Set(["kind", "occurrenceId", "startTokenId", "endTokenId", "exactText"])
    : new Set(["kind", "occurrenceId", "startSegmentId", "endSegmentId", "exactText"]);
  onlyKeys(source, allowed, label + ".source");
  const occurrenceId = text(source.occurrenceId, label + ".source.occurrenceId");
  const rows = canonical.rowsByOccurrenceKind.get(kind + "::" + occurrenceId);
  if (!rows) fail(label + " references an occurrence or source precision not present in the canonical timeline: " + occurrenceId);
  const startId = text(source[kind === "token-range" ? "startTokenId" : "startSegmentId"], label + ".source start");
  const endId = text(source[kind === "token-range" ? "endTokenId" : "endSegmentId"], label + ".source end");
  const start = rows.findIndex((row) => row.id === startId);
  const end = rows.findIndex((row) => row.id === endId);
  if (start < 0 || end < start) fail(label + " source range does not identify an ordered occurrence-local range in the canonical timeline");
  const expanded = rows.slice(start, end + 1);
  const exactText = text(source.exactText, label + ".source.exactText");
  const actualText = expanded.map((row) => row.text).join("");
  if (exactText !== actualText) fail(label + " exactText differs from its exact canonical occurrence/token range");
  return expanded;
}

function expandScriptLineCue(source, materialById, label) {
  object(source, label + ".source");
  onlyKeys(source, new Set(["kind", "materialId", "lineStart", "lineEnd", "exactText"]), label + ".source");
  if (source.kind !== "script-line-range") fail(label + ".source.kind must be script-line-range when no recording/timeline exists");
  const materialId = text(source.materialId, label + ".source.materialId");
  const material = materialById.get(materialId);
  if (!material) fail(label + " references unknown script source material " + materialId);
  const lineStart = source.lineStart;
  const lineEnd = source.lineEnd;
  if (!Number.isSafeInteger(lineStart) || !Number.isSafeInteger(lineEnd) || lineStart < 1 || lineEnd < lineStart) {
    fail(label + ".source line range must use positive inclusive source lines");
  }
  const bytes = fsSync.readFileSync(material.file);
  if (bytes.includes(0)) fail(label + " source material is not a UTF-8 text script");
  const lines = bytes.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lineEnd > lines.length) fail(label + " source line range exceeds its hash-verified script material");
  const selectedLines = lines.slice(lineStart - 1, lineEnd);
  const exactText = text(source.exactText, label + ".source.exactText");
  if (exactText !== selectedLines.join("\n")) fail(label + " exactText differs from the hash-verified source script lines");
  return selectedLines.map((line, index) => ({
    kind: "script-line",
    occurrenceId: null,
    id: materialId + ":line:" + (lineStart + index),
    text: line,
    materialId,
    line: lineStart + index,
  })).filter((row) => row.text.trim());
}

function expandPresentationCue(source, label) {
  object(source, label + ".source");
  onlyKeys(source, new Set(["kind", "reason"]), label + ".source");
  if (source.kind !== "presentation-only") fail(label + ".source.kind must be presentation-only when the checked production has no spoken source");
  text(source.reason, label + ".source.reason");
  return [];
}

function validateCueAnchoredTimelineSpan(startCueId, endCueId, startOffsetSamples, endOffsetSamples, cueById, durationSamples, label) {
  const startCue = cueById.get(startCueId);
  const endCue = cueById.get(endCueId);
  if (!startCue?.expanded?.length || !endCue?.expanded?.length) fail(label + " must reference cues with real canonical sample ranges");
  if (startCue.ordinal > endCue.ordinal) fail(label + " endCueId must follow startCueId in the actual designed cue order");
  if (!Number.isSafeInteger(startOffsetSamples) || !Number.isSafeInteger(endOffsetSamples)) {
    fail(label + " offsets must be integer deltas from canonical cue anchors, not invented absolute word times");
  }
  const start = startCue.expanded[0].targetRange.startSample + startOffsetSamples;
  const end = endCue.expanded.at(-1).targetRange.endSample + endOffsetSamples;
  if (start < 0 || end <= start || end > durationSamples) {
    fail(label + " resolved span must stay ordered and inside the existing canonical project-sample duration");
  }
}

function validateTimingReference(timing, mode, cueIds, label, { allowEmpty = false, cueById = null, durationSamples = null } = {}) {
  object(timing, label);
  onlyKeys(timing, new Set(["basis", "startCueId", "endCueId", "startOffsetSamples", "endOffsetSamples", "relationship"]), label);
  const expectedBasis = mode === "timeline" ? "canonical-target-samples" : "semantic-budget";
  if (timing.basis !== expectedBasis) fail(label + ".basis must use the existing canonical clock or a non-synchronized semantic budget");
  const startCueId = timing.startCueId;
  const endCueId = timing.endCueId;
  if (mode === "none" && allowEmpty && startCueId == null && endCueId == null) {
    if (timing.startOffsetSamples != null || timing.endOffsetSamples != null) fail(label + " cannot invent samples for an unanchored visual-only unit");
    text(timing.relationship, label + ".relationship");
    return;
  }
  if (!cueIds.has(text(startCueId, label + ".startCueId")) || !cueIds.has(text(endCueId, label + ".endCueId"))) {
    fail(label + " must reference real script cues in the same design");
  }
  text(timing.relationship, label + ".relationship");
  if (mode === "timeline") {
    validateCueAnchoredTimelineSpan(text(startCueId, label + ".startCueId"), text(endCueId, label + ".endCueId"),
      timing.startOffsetSamples, timing.endOffsetSamples, cueById, durationSamples, label);
  } else if (timing.startOffsetSamples != null || timing.endOffsetSamples != null) {
    fail(label + " script-only or presentation semantic budgets cannot claim sample-accurate speech timing");
  }
}

function declaredVoicePlanEvidence(plan, planDir) {
  const audioRef = plan.inputs?.audioPlan;
  if (audioRef == null) return null;
  object(audioRef, "plan.inputs.audioPlan");
  onlyKeys(audioRef, new Set(["path", "sha256"]), "plan.inputs.audioPlan");
  const file = resolveFrom(planDir, audioRef.path, "plan.inputs.audioPlan.path");
  const bytes = fsSync.readFileSync(file);
  if (sha256(bytes) !== text(audioRef.sha256, "plan.inputs.audioPlan.sha256").toLowerCase()) fail("declared audio-plan changed from its hash; refresh direction inputs before deciding narration mode");
  let audioPlan;
  try { audioPlan = JSON.parse(bytes.toString("utf8")); } catch (error) { fail("declared audio-plan is not valid JSON: " + error.message); }
  const voiceTrackIds = (Array.isArray(audioPlan.tracks) ? audioPlan.tracks : []).filter((row) => row?.bus === "voice").map((row) => row.id).filter((id) => typeof id === "string" && id.trim());
  return { voiceTrackIds, voiceWindowCount: Array.isArray(audioPlan.voiceWindows) ? audioPlan.voiceWindows.length : 0 };
}

function validateCreativeDesignRealizationCoverage({plan, globalCueById, designUnits, captionManifest}) {
  if (plan.format !== PLAN_FORMAT_V5) return;
  const creative = plan.creativeDesign;
  const d3Rows = [...globalCueById.values()];
  const d3ByUnit = new Map(designUnits.map((unit) => [unit.viewingUnitId, unit.scriptCues || []]));
  if (creative.narrationMode === "timeline") {
    const manifestById = new Map((captionManifest?.cues || []).map((cue) => [cue.id, cue]));
    const d3TimelineRows = d3Rows.filter((row) => row.expanded?.length);
    if (d3TimelineRows.length !== creative.cueDesigns.length) {
      fail("production-plan/5 requires one Motion D3 script cue for every Analysis creative cue/caption; keep the two authored layers at the same cue granularity");
    }
    const keys = (rows) => rows.map((row) => (row.kind === "token-range" ? "token" : "segment") + "::" + row.occurrenceId + "::" + row.id);
    const consumedD3CueIds = new Set();
    for (const creativeCue of creative.cueDesigns) {
      const manifestCue = manifestById.get(creativeCue.captionCueId);
      if (!manifestCue) fail("creative cue has no exact retained caption manifest row: " + creativeCue.captionCueId);
      const captionKeys = manifestCue.anchors.flatMap((anchor) => (anchor.tokenIds || [anchor.segmentId])
        .map((id) => (anchor.tokenIds ? "token" : "segment") + "::" + anchor.occurrenceId + "::" + id));
      const matches = d3TimelineRows.filter((row) => canonicalJson(keys(row.expanded)) === canonicalJson(captionKeys));
      if (matches.length !== 1) fail("each creative caption cue must map to exactly one D3 script cue with identical canonical speech anchors: " + creativeCue.captionCueId);
      const match = matches[0];
      if (match.viewingUnitId !== creativeCue.viewingUnitId) fail("creative caption cue and D3 realization must belong to the same viewingUnit: " + creativeCue.captionCueId);
      if (consumedD3CueIds.has(match.id)) fail("two creative cues cannot reuse one D3 script cue: " + match.id);
      consumedD3CueIds.add(match.id);
    }
    if (consumedD3CueIds.size !== d3TimelineRows.length) fail("D3 contains narration cues without an Analysis creative-design cue; re-align the design instead of silently adding or merging cues");
  } else if (creative.narrationMode === "script-only") {
    const parseLineLocator = (value, label) => {
      const match = /^lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?$/i.exec(value.trim());
      if (!match) fail(label + " must identify exact source lines as 'line N' or 'lines N-M'; do not invent timecodes for an unrecorded script");
      return {lineStart: Number(match[1]), lineEnd: Number(match[2] || match[1])};
    };
    for (const cue of creative.cueDesigns) {
      const source = cue.sourceRef;
      const range = parseLineLocator(source.locator, "creative cue " + cue.id + ".sourceRef.locator");
      const matches = (d3ByUnit.get(cue.viewingUnitId) || []).filter((row) => row.source?.kind === "script-line-range"
        && row.source.materialId === source.materialId && row.source.lineStart === range.lineStart && row.source.lineEnd === range.lineEnd);
      if (matches.length !== 1) fail("each script-only creative cue must map to exactly one D3 script cue with the same source material and inclusive line range: " + cue.id);
    }
    if (d3Rows.filter((row) => row.expanded?.length).length !== creative.cueDesigns.length) fail("script-only D3 cues must have one matching Analysis creative-design cue each");
  } else {
    const creativeCountByUnit = new Map();
    for (const cue of creative.cueDesigns) creativeCountByUnit.set(cue.viewingUnitId, (creativeCountByUnit.get(cue.viewingUnitId) || 0) + 1);
    for (const unit of designUnits) {
      const technicalCueCount = (unit.scriptCues || []).length;
      if (!creativeCountByUnit.has(unit.viewingUnitId) || creativeCountByUnit.get(unit.viewingUnitId) !== technicalCueCount) {
        fail("no-narration Analysis cues and D3 presentation cues must cover the same viewingUnit counts; no speech timing or second script may be invented");
      }
    }
    if (d3Rows.some((row) => row.expanded?.length)) fail("no-narration D3 realization cannot contain spoken source cues");
  }
}

function validateDirectorDesignV2Shape({ plan, planDir, materialById, units, unitIds, implementationPlan, asrcutHandoff = null, creativeDesignIdentitySha256 = null }) {
  const design = object(plan.directorDesign, "plan.directorDesign");
  const directorV3 = design.format === "laohu.motion.director-design/3";
  const designKeys = new Set(["format", "id", "brief", "globalSettings", "narration", "units", "resourceTasks"]);
  if (directorV3) designKeys.add("attentionPhases");
  if (plan.format === PLAN_FORMAT_V5) designKeys.add("creativeDesignRef");
  onlyKeys(design, designKeys, "plan.directorDesign");
  if ((!directorV3 && design.format !== "laohu.motion.director-design/2")
      || (directorV3 && !isFormalV4OrV5(plan))
      || (!directorV3 && isFormalV4OrV5(plan))) {
    fail("production-plan/4 and /5 require directorDesign/3; production-plan/3 requires directorDesign/2");
  }
  if (plan.format === PLAN_FORMAT_V5) {
    if (!directorV3) fail("production-plan/5 production requires directorDesign/3 as Motion's technical realization");
    const link = object(design.creativeDesignRef, "directorDesign.creativeDesignRef");
    onlyKeys(link, new Set(["id", "sha256"]), "directorDesign.creativeDesignRef");
    if (text(link.id, "directorDesign.creativeDesignRef.id") !== plan.creativeDesign.id
        || text(link.sha256, "directorDesign.creativeDesignRef.sha256").toLowerCase() !== creativeDesignIdentitySha256) {
      fail("directorDesign/3 creativeDesignRef must bind the exact current creativeDesign/1 identity and SHA-256; refresh the realization after a design change");
    }
  }
  text(design.id, "plan.directorDesign.id");

  const brief = object(design.brief, "directorDesign.brief");
  onlyKeys(brief, new Set(DIRECTOR_BRIEF_SECTIONS), "directorDesign.brief");
  for (const field of DIRECTOR_BRIEF_SECTIONS) text(brief[field], "directorDesign.brief." + field);

  const global = object(design.globalSettings, "directorDesign.globalSettings");
  const globalKeys = new Set(["frame", "look", "colorRoles", "textStyles"]);
  if (directorV3) globalKeys.add("captionStyle");
  onlyKeys(global, globalKeys, "directorDesign.globalSettings");
  const frame = object(global.frame, "directorDesign.globalSettings.frame");
  onlyKeys(frame, new Set(["width", "height", "fps"]), "directorDesign.globalSettings.frame");
  for (const field of ["width", "height", "fps"]) {
    if (!Number.isSafeInteger(frame[field]) || frame[field] < 1) fail("directorDesign.globalSettings.frame." + field + " must be a positive integer");
  }
  const look = object(global.look, "directorDesign.globalSettings.look");
  onlyKeys(look, new Set(["palette", "surface", "lighting", "spatialSystem", "typography", "hierarchy"]), "directorDesign.globalSettings.look");
  for (const field of ["palette", "surface", "lighting", "spatialSystem", "typography", "hierarchy"]) text(look[field], "directorDesign.globalSettings.look." + field);
  const colorRoles = array(global.colorRoles, "directorDesign.globalSettings.colorRoles");
  const colorRoleIds = unique(colorRoles, (row) => row.id, "director design color role");
  for (const role of colorRoles) {
    object(role, "director design color role");
    onlyKeys(role, new Set(["id", "value", "meaning"]), "director design color role");
    text(role.id, "director design color role.id");
    text(role.value, "director design color role.value");
    text(role.meaning, "director design color role.meaning");
  }
  const textStyles = global.textStyles == null ? [] : array(global.textStyles, "directorDesign.globalSettings.textStyles", { allowEmpty: true });
  const textStyleIds = unique(textStyles, (row) => row.id, "director design text style");
  const implementationById = new Map(implementationPlan.map((row) => [row.id, row]));
  const usedTextStyleIds = new Set();
  const usedTextStyleConsumers = new Set();
  let captionStyleRuntime = null;
  for (const style of textStyles) {
    object(style, "director design text style");
    onlyKeys(style, new Set(["id", "fontFamily", "fontWeight", "sizePx", "colorRoleId", "lineHeight", "letterSpacing", "role", "fontMaterialId", "consumerMappings"]), "director design text style");
    for (const field of ["id", "fontFamily", "fontWeight", "colorRoleId", "role"]) text(style[field], "director design text style." + field);
    if (!colorRoleIds.has(style.colorRoleId)) fail("director design text style " + style.id + " must resolve to a real global colorRoleId");
    for (const field of ["sizePx", "lineHeight"]) if (typeof style[field] !== "number" || !Number.isFinite(style[field]) || style[field] <= 0) {
      fail("director design text style " + style.id + "." + field + " must be a positive numeric renderer value");
    }
    if (typeof style.letterSpacing !== "number" || !Number.isFinite(style.letterSpacing)) fail("director design text style " + style.id + ".letterSpacing must be a numeric renderer value");
    if (style.fontMaterialId != null) {
      const fontMaterialId = text(style.fontMaterialId, "director design text style.fontMaterialId");
      const fontMaterial = materialById.get(fontMaterialId);
      if (!fontMaterial) fail("director design text style " + style.id + ".fontMaterialId must resolve to a hash-verified plan input material");
      if (!/\.(?:woff2?|ttf|otf)$/i.test(fontMaterial.file)) fail("director design text style fontMaterialId must reference a WOFF/TTF/OTF font file");
    }
    const consumers = array(style.consumerMappings, "director design text style.consumerMappings");
    unique(consumers, (consumer) => consumer.implementationPlanId + "::" + consumer.mappingId, "text style consumer mapping");
    for (const consumer of consumers) {
      object(consumer, "director design text style consumer mapping");
      onlyKeys(consumer, new Set(["implementationPlanId", "mappingId", "fontFamilyField", "fontWeightField", "sizePxField", "colorField", "lineHeightField", "letterSpacingField", "fontFileField"]), "director design text style consumer mapping");
      const implementationId = text(consumer.implementationPlanId, "text style consumer implementationPlanId");
      const implementation = implementationById.get(implementationId);
      if (!implementation || text(consumer.mappingId, "text style consumer mappingId") !== implementation.mappingId) fail("text style consumerMappings must point to an exact actual implementationPlan/mappingId pair");
      for (const field of ["fontFamilyField", "fontWeightField", "sizePxField", "colorField", "lineHeightField", "letterSpacingField"]) text(consumer[field], "text style consumer mapping." + field);
      if (consumer.fontFileField != null) text(consumer.fontFileField, "text style consumer mapping.fontFileField");
      if (style.fontMaterialId != null && !consumer.fontFileField) fail("font-file-backed text style consumerMappings must identify the real renderer fontFileField");
      if (style.fontMaterialId == null && consumer.fontFileField != null) fail("system-font style cannot declare an unbound fontFileField; use fontMaterialId for a checked local font asset");
    }
  }
  if (directorV3 && global.captionStyle != null) {
    const captionStyle = object(global.captionStyle, "directorDesign.globalSettings.captionStyle");
    onlyKeys(captionStyle, new Set(["textStyleId", "function", "spatialRelation", "temporalBehavior", "coordinateSpace", "x", "y", "width", "height", "zIndex", "alignment", "background", "paddingPx", "maxLines", "fontFile", "consumerMappings"]), "directorDesign.globalSettings.captionStyle");
    const textStyleId = text(captionStyle.textStyleId, "captionStyle.textStyleId");
    const textStyle = textStyles.find((row) => row.id === textStyleId);
    if (!textStyle) fail("directorDesign/3 captionStyle.textStyleId must resolve to a measured global textStyles entry");
    if (textStyle.fontMaterialId) {
      const filmBlueprintRef = object(plan.inputs.filmBlueprint, "plan.inputs.filmBlueprint");
      const filmBlueprintPath = text(filmBlueprintRef.path, "plan.inputs.filmBlueprint.path");
      const expectedFontPath = path.relative(path.dirname(path.resolve(planDir, filmBlueprintPath)), materialById.get(textStyle.fontMaterialId).file)
        .split(path.sep).join("/");
      if (typeof captionStyle.fontFile !== "string" || captionStyle.fontFile !== expectedFontPath) {
        fail("directorDesign/3 captionStyle.fontFile must identify the exact hash-verified textStyle fontMaterialId relative to the Film Blueprint; renderer font loading stays bound to the selected source bytes");
      }
    } else if (captionStyle.fontFile != null) {
      fail("directorDesign/3 captionStyle.fontFile requires its measured textStyle fontMaterialId; do not bind an untracked renderer font");
    }
    if (captionStyle.function !== "subtitle" || captionStyle.spatialRelation !== "screen-overlay"
        || captionStyle.temporalBehavior !== "caption-manifest-display-window" || captionStyle.coordinateSpace !== "output-pixels") {
      fail("directorDesign/3 captionStyle must declare subtitle function, screen-overlay relation, manifest display-window timing, and output-pixel coordinates");
    }
    for (const field of ["x", "y", "width", "height", "paddingPx"]) {
      if (typeof captionStyle[field] !== "number" || !Number.isFinite(captionStyle[field])) fail("captionStyle." + field + " must be a finite output-pixel value");
    }
    if (captionStyle.x < 0 || captionStyle.y < 0 || captionStyle.width <= 0 || captionStyle.height <= 0
        || captionStyle.x + captionStyle.width > frame.width || captionStyle.y + captionStyle.height > frame.height
        || captionStyle.paddingPx < 0) fail("captionStyle geometry/padding must fit inside the declared full picture frame");
    if (!Number.isSafeInteger(captionStyle.zIndex) || !new Set(["left", "center", "right"]).has(captionStyle.alignment)
        || typeof captionStyle.background !== "string" || !captionStyle.background.trim()
        || !Number.isSafeInteger(captionStyle.maxLines) || captionStyle.maxLines < 1 || captionStyle.maxLines > 2) {
      fail("captionStyle must give concrete layer, alignment, background, and one/two-line layout values");
    }
    const captionConsumers = array(captionStyle.consumerMappings, "captionStyle.consumerMappings");
    unique(captionConsumers, (row) => row.implementationPlanId + "::" + row.mappingId, "caption style consumer mapping");
    usedTextStyleIds.add(textStyleId);
    for (const consumer of captionConsumers) {
      object(consumer, "captionStyle consumer mapping");
      onlyKeys(consumer, new Set(["implementationPlanId", "mappingId"]), "captionStyle consumer mapping");
      const implementationId = text(consumer.implementationPlanId, "captionStyle.consumerMappings.implementationPlanId");
      const implementation = implementationById.get(implementationId);
      const mappingId = text(consumer.mappingId, "captionStyle.consumerMappings.mappingId");
      if (!implementation || implementation.mappingId !== mappingId || implementation.resourceType !== "renderer-route"
          || implementation.resourceId !== PROJECT_SHOT_ROUTE_ID || implementation.renderer !== "laohu-project-shot"
          || !implementation.consumerFields.includes("props.captionStyle")) {
        fail("captionStyle consumerMappings must point to the registered project-shot props.captionStyle route");
      }
      const measuredStyleConsumer = textStyle.consumerMappings.find((row) => row.implementationPlanId === implementationId && row.mappingId === mappingId);
      if (!measuredStyleConsumer || measuredStyleConsumer.fontFamilyField !== "props.captionStyle.fontFamily"
          || measuredStyleConsumer.fontWeightField !== "props.captionStyle.fontWeight"
          || measuredStyleConsumer.sizePxField !== "props.captionStyle.sizePx"
          || measuredStyleConsumer.colorField !== "props.captionStyle.color"
          || measuredStyleConsumer.lineHeightField !== "props.captionStyle.lineHeight"
          || measuredStyleConsumer.letterSpacingField !== "props.captionStyle.letterSpacing"
          || (textStyle.fontMaterialId && measuredStyleConsumer.fontFileField !== "props.captionStyle.fontFile")) {
        fail("captionStyle textStyle consumer must map every exact typography field to its actual captionStyle props");
      }
      usedTextStyleConsumers.add(textStyleId + "::" + implementationId + "::" + mappingId);
    }
    captionStyleRuntime = {
      ...structuredClone(captionStyle),
      fontFamily: textStyle.fontFamily,
      fontWeight: textStyle.fontWeight,
      sizePx: textStyle.sizePx,
      color: colorRoles.find((row) => row.id === textStyle.colorRoleId).value,
      lineHeight: textStyle.lineHeight,
      letterSpacing: textStyle.letterSpacing,
      ...(textStyle.fontMaterialId ? {fontFileMaterialId: textStyle.fontMaterialId} : {}),
    };
  }

  const narration = object(design.narration, "directorDesign.narration");
  onlyKeys(narration, new Set(["mode", "reason", "scriptSelections"]), "directorDesign.narration");
  const narrationMode = text(narration.mode, "directorDesign.narration.mode");
  if (!["timeline", "script-only", "none"].includes(narrationMode)) fail("directorDesign.narration.mode must be timeline, script-only, or none");
  if (plan.format === PLAN_FORMAT_V5 && narrationMode !== plan.creativeDesign.narrationMode) fail("directorDesign/3 narration mode must match the Analysis-authored creativeDesign/1");
  text(narration.reason, "directorDesign.narration.reason");
  if (directorV3 && narrationMode === "timeline" && !captionStyleRuntime) fail("directorDesign/3 timeline narration requires a measured, renderer-bound global captionStyle");
  if (directorV3 && narrationMode !== "timeline" && global.captionStyle != null) fail("script-only/no-narration D3 branches cannot manufacture an ASR subtitle style");
  const timelinePath = plan.inputs.asrcut?.timeline?.path;
  let canonical = null;
  let canonicalTimeline = asrcutHandoff?.timeline ?? null;
  if (timelinePath) {
    if (!canonicalTimeline) {
      const resolvedTimeline = resolveFrom(planDir, timelinePath, "plan.inputs.asrcut.timeline.path");
      canonicalTimeline = JSON.parse(fsSync.readFileSync(resolvedTimeline, "utf8"));
    }
    canonical = readCanonicalSpeechRows(canonicalTimeline);
  }
  if (narrationMode === "timeline" && !canonical) fail("directorDesign.narration.mode=timeline requires the actual plan.inputs.asrcut.timeline reference");
  if (directorV3 && narrationMode === "timeline" && !asrcutHandoff?.captionManifest) fail("directorDesign/3 timeline narration requires a hash-verified caption-manifest/1 that recompiles from the exact ASRcut edit plan and timeline");
  if (directorV3 && narrationMode !== "timeline" && asrcutHandoff?.captionManifest) fail("script-only and no-narration directorDesign/3 branches cannot manufacture ASR caption cues or precision");
  if (narrationMode !== "timeline" && canonical?.hasSpeech) {
    fail("the canonical selected timeline contains spoken words; scriptCues must cover those exact occurrence/token or occurrence/segment ranges");
  }
  const explicitNarrationKinds = new Set(["voice", "voice-audio", "voice-recording", "narration", "narration-audio", "speech-audio", "transcript", "asr-transcript", "spoken-script", "narration-script"]);
  const explicitNarrationRoles = new Set(["voice", "voice track", "voice recording", "narration", "narration audio", "narration transcript", "spoken transcript", "spoken script"]);
  const declaredNarrationMaterials = plan.inputs.sourceMaterials.filter((material) => explicitNarrationKinds.has(material.kind.trim().toLowerCase())
    || explicitNarrationRoles.has(material.role.trim().toLowerCase()));
  if (narrationMode === "none" && declaredNarrationMaterials.length) {
    fail("narration.mode=none conflicts with explicitly typed narration source material " + declaredNarrationMaterials.map((row) => row.id).join(", ") + "; bind its canonical timeline or use the unrecorded script-only branch");
  }
  const declaredVoiceEvidence = declaredVoicePlanEvidence(plan, planDir);
  if (["none", "script-only"].includes(narrationMode) && declaredVoiceEvidence
      && (declaredVoiceEvidence.voiceTrackIds.length > 0 || declaredVoiceEvidence.voiceWindowCount > 0)) {
    fail("narration.mode=" + narrationMode + " conflicts with actual audio-plan voice bus tracks/windows; recorded speech must use the canonical timeline branch");
  }
  if (narrationMode === "timeline" && declaredVoiceEvidence && declaredVoiceEvidence.voiceTrackIds.length === 0) {
    fail("timeline narration has no voice-bus track in the declared audio-plan; required spoken audio cannot be omitted");
  }

  const designUnits = array(design.units, "plan.directorDesign.units");
  const designUnitIds = unique(designUnits, (row) => row.viewingUnitId, "director design viewingUnit");
  if (designUnitIds.size !== unitIds.size || [...unitIds].some((id) => !designUnitIds.has(id))) {
    fail("directorDesign.units must cover every existing viewingUnit exactly once; it is not a second scene list");
  }
  const sourceUnitById = new Map(units.map((unit) => [unit.id, unit]));
  const designUnitById = new Map(designUnits.map((unit) => [unit.viewingUnitId, unit]));
  const globalCueById = new Map();
  const designTextById = new Map();
  const actionById = new Map();
  const supportedSoundStates = new Set(["none", "designed"]);
  const supportedVoiceStates = new Set(["none", "planned", "locked"]);
  const supportedActionPhases = new Set(["enter", "change", "hold", "read", "exit", "transition"]);

  for (const unit of designUnits) {
    const cueRows = unit.scriptCues == null ? [] : array(unit.scriptCues, "director design unit.scriptCues", { allowEmpty: true });
    unique(cueRows, (cue) => cue.id, "script cue in " + unit.viewingUnitId);
    for (const cue of cueRows) {
      const cueId = text(cue.id, "director script cue.id");
      if (globalCueById.has(cueId)) fail("director script cue IDs must be unique across all viewing units: " + cueId);
      globalCueById.set(cueId, { viewingUnitId: unit.viewingUnitId, expanded: null, ordinal: null });
    }
  }
  let globalCueOrdinal = 0;
  for (const viewingUnit of units) {
    const designUnit = designUnitById.get(viewingUnit.id);
    for (const cue of designUnit.scriptCues || []) globalCueById.get(cue.id).ordinal = globalCueOrdinal++;
  }
  const displaySpanChecks = [];

  for (const unit of designUnits) {
    object(unit, "director design unit");
    const directorUnitKeys = new Set(["viewingUnitId", "sourceAnchors", "designNarrative", "purpose", "visualGain", "representation", "composition", "focalOrder", "look", "objects", "scriptCues", "implementationPlanIds", "actions", "transition", "sound"]);
    if (directorV3) directorUnitKeys.add("attentionPhaseIds");
    onlyKeys(unit, directorUnitKeys, "director design unit");
    const viewingUnitId = text(unit.viewingUnitId, "director design viewingUnitId");
    const sourceUnit = sourceUnitById.get(viewingUnitId);
    text(unit.designNarrative, "director design unit.designNarrative");
    const anchors = array(unit.sourceAnchors, "director design sourceAnchors", { allowEmpty: true });
    for (const anchor of anchors) {
      object(anchor, "director design source anchor");
      onlyKeys(anchor, new Set(["materialId", "locator", "kind"]), "director design source anchor");
      if (!plan.inputs.sourceMaterials.some((material) => material.id === text(anchor.materialId, "director design source anchor.materialId"))) fail("director design source anchor references an unknown source material " + anchor.materialId);
      text(anchor.locator, "director design source anchor.locator");
      if (anchor.kind != null) text(anchor.kind, "director design source anchor.kind");
    }
    const expectedAnchors = (sourceUnit.sourceRefs || []).map(({ materialId, locator, kind = null }) => ({ materialId, locator, kind }));
    const actualAnchors = anchors.map(({ materialId, locator, kind = null }) => ({ materialId, locator, kind }));
    if (canonicalJson(actualAnchors) !== canonicalJson(expectedAnchors)) fail("director design sourceAnchors must resolve exactly to this viewingUnit's declared sourceRefs: " + viewingUnitId);
    for (const field of ["purpose", "visualGain", "representation", "composition", "focalOrder"]) text(unit[field], "director design unit." + field);
    const unitLook = object(unit.look, "director design unit.look");
    onlyKeys(unitLook, new Set(["palette", "surface", "lighting", "typography"]), "director design unit.look");
    for (const field of ["palette", "surface", "lighting", "typography"]) text(unitLook[field], "director design unit.look." + field);

    const rowIds = array(unit.implementationPlanIds, "director design unit.implementationPlanIds");
    const expectedRows = implementationPlan.filter((row) => row.viewingUnitIds.includes(viewingUnitId)).map((row) => row.id).sort();
    const actualRows = rowIds.map((id) => text(id, "director design implementationPlanId")).sort();
    unique(actualRows.map((id) => ({ id })), (row) => row.id, "director design implementation plan reference");
    if (canonicalJson(actualRows) !== canonicalJson(expectedRows)) fail("director design implementationPlanIds must name every actual planned Film consumer for viewingUnit " + viewingUnitId);

    const objects = array(unit.objects, "director design unit.objects");
    const objectIds = unique(objects, (row) => row.id, "director design object");
    for (const item of objects) {
      object(item, "director design object");
      onlyKeys(item, new Set(["id", "role", "meaning", "appearance", "movableParts", "initialState", "processState", "resultState", "consumerRefs"]), "director design object");
      for (const field of ["id", "role", "meaning", "appearance", "initialState", "processState", "resultState"]) text(item[field], "director design object." + field);
      const refs = array(item.consumerRefs, "director design object.consumerRefs");
      unique(refs, (ref) => ref.implementationPlanId, "director object consumer reference");
      for (const ref of refs) {
        object(ref, "director object consumer reference");
        onlyKeys(ref, new Set(["implementationPlanId", "responsibility"]), "director object consumer reference");
        const implementationId = text(ref.implementationPlanId, "director object consumer implementationPlanId");
        const implementation = implementationById.get(implementationId);
        if (!implementation || !implementation.viewingUnitIds.includes(unit.viewingUnitId)) fail("director object references an unknown actual Film consumer for its viewing unit");
        text(ref.responsibility, "director object consumer responsibility");
      }
      const parts = item.movableParts == null ? [] : array(item.movableParts, "director design object.movableParts", { allowEmpty: true });
      unique(parts, (part) => part.id, "director movable part in " + item.id);
      for (const part of parts) {
        object(part, "director movable part");
        onlyKeys(part, new Set(["id", "role", "appearance", "initialState", "processState", "resultState", "consumerRefs"]), "director movable part");
        for (const field of ["id", "role", "appearance", "initialState", "processState", "resultState"]) text(part[field], "director movable part." + field);
        const partRefs = array(part.consumerRefs, "director movable part.consumerRefs");
        for (const ref of partRefs) {
          object(ref, "director movable part consumer reference");
          const implementationId = text(ref.implementationPlanId, "movable part consumer implementationPlanId");
          const implementation = implementationById.get(implementationId);
          if (!implementation || !implementation.viewingUnitIds.includes(unit.viewingUnitId)) fail("director movable part references an unknown actual Film consumer for its viewing unit");
          text(ref.responsibility, "movable part consumer responsibility");
        }
      }
    }

    const scriptCues = unit.scriptCues == null ? [] : array(unit.scriptCues, "director design unit.scriptCues", { allowEmpty: true });
    unique(scriptCues, (cue) => cue.id, "script cue in " + viewingUnitId);
    for (const cue of scriptCues) {
      object(cue, "director script cue");
      onlyKeys(cue, new Set(["id", "source", "continuityIn", "continuityOut", "visualNarration", "screenText", "actionIds"]), "director script cue");
      const cueId = text(cue.id, "director script cue.id");
      if (!globalCueById.has(cueId) || globalCueById.get(cueId).viewingUnitId !== viewingUnitId) fail("director script cue does not belong to its predeclared viewing unit: " + cueId);
      text(cue.continuityIn, "director script cue.continuityIn");
      text(cue.continuityOut, "director script cue.continuityOut");
      text(cue.visualNarration, "director script cue.visualNarration");
      const sourceKind = cue.source?.kind;
      let expanded;
      if (narrationMode === "timeline") {
        if (sourceKind === "script-line-range") fail("a timeline-backed cue must use the actual occurrence/token or occurrence/segment reference");
        expanded = expandTimelineCue(cue.source, canonical, "director script cue " + cueId);
      } else if (narrationMode === "script-only") {
        expanded = expandScriptLineCue(cue.source, materialById, "director script cue " + cueId);
      } else {
        expanded = expandPresentationCue(cue.source, "director presentation cue " + cueId);
      }
      const screenText = object(cue.screenText, "director script cue.screenText");
      if (screenText.mode === "none") {
        onlyKeys(screenText, new Set(["mode", "reason"]), "director script cue.screenText");
        text(screenText.reason, "director script cue.screenText.reason");
      } else if (screenText.mode === "planned") {
        onlyKeys(screenText, new Set(["mode", "items"]), "director script cue.screenText");
        const items = array(screenText.items, "director script cue.screenText.items");
        unique(items, (item) => item.id, "screen text in cue " + cueId);
        for (const item of items) {
          object(item, "director planned screen text");
          onlyKeys(item, new Set(["id", "text", "role", "styleId", "layout", "visibility", "readingWindow", "requiresReading", "consumerRefs"]), "director planned screen text");
          const itemId = text(item.id, "director screen text.id");
          text(item.text, "director screen text.text");
          text(item.role, "director screen text.role");
          const styleId = text(item.styleId, "director screen text.styleId");
          if (!textStyleIds.has(styleId)) fail("director screen text " + itemId + " styleId must resolve to an actual named global font/style, not an empty or unresolved style");
          usedTextStyleIds.add(styleId);
          if (typeof item.requiresReading !== "boolean") fail("director screen text " + itemId + ".requiresReading must be boolean");
          const layout = object(item.layout, "director screen text.layout");
          onlyKeys(layout, new Set(["position", "region", "alignment", "maxLines", "background", "layerOrder"]), "director screen text.layout");
          for (const field of ["position", "region", "alignment", "background", "layerOrder"]) text(layout[field], "director screen text.layout." + field);
          if (!Number.isSafeInteger(layout.maxLines) || layout.maxLines < 1) fail("director screen text.layout.maxLines must be a positive integer");
          const visibility = object(item.visibility, "director screen text.visibility");
          onlyKeys(visibility, new Set(["basis", "startCueId", "endCueId", "startOffsetSamples", "endOffsetSamples", "retention", "reason"]), "director screen text.visibility");
          if (visibility.basis !== (narrationMode === "timeline" ? "canonical-target-samples" : "semantic-budget")) fail("director screen text visibility must cite the source clock or a non-synchronized semantic budget");
          const visibilityStartCueId = text(visibility.startCueId, "director screen text visibility.startCueId");
          const visibilityEndCueId = text(visibility.endCueId, "director screen text visibility.endCueId");
          const visibilityStartCue = globalCueById.get(visibilityStartCueId);
          const visibilityEndCue = globalCueById.get(visibilityEndCueId);
          if (!visibilityStartCue || !visibilityEndCue) fail("director screen text visibility must reference real script/presentation cues");
          if (visibilityStartCue.viewingUnitId !== viewingUnitId || visibilityEndCue.viewingUnitId !== viewingUnitId) fail("director screen text visibility must stay within its real viewing unit");
          if (narrationMode === "timeline") {
            displaySpanChecks.push({ startCueId: visibilityStartCueId, endCueId: visibilityEndCueId,
              startOffsetSamples: visibility.startOffsetSamples, endOffsetSamples: visibility.endOffsetSamples,
              label: "director screen text " + itemId + ".visibility" });
          } else if (visibility.startOffsetSamples != null || visibility.endOffsetSamples != null) fail("script-only or presentation screen text cannot claim sample-accurate display timing");
          text(visibility.retention, "director screen text.visibility.retention");
          text(visibility.reason, "director screen text.visibility.reason");
          const readingWindow = object(item.readingWindow, "director screen text.readingWindow");
          onlyKeys(readingWindow, new Set(["startCueId", "endCueId", "holdAcrossCues", "reason"]), "director screen text.readingWindow");
          for (const field of ["startCueId", "endCueId"]) {
            const refId = text(readingWindow[field], "director screen text.readingWindow." + field);
            if (refId !== cueId && !globalCueById.has(refId)) fail("director screen text readingWindow must reference real script cues");
          }
          if (typeof readingWindow.holdAcrossCues !== "boolean") fail("director screen text.readingWindow.holdAcrossCues must be boolean");
          text(readingWindow.reason, "director screen text.readingWindow.reason");
          if (item.requiresReading && !readingWindow.reason.trim()) fail("required reading window must state its actual reading responsibility");
          const readStart = globalCueById.get(readingWindow.startCueId);
          const readEnd = globalCueById.get(readingWindow.endCueId);
          if (!readStart || !readEnd || readStart.viewingUnitId !== viewingUnitId || readEnd.viewingUnitId !== viewingUnitId) fail("director screen text readingWindow must stay within its real viewing unit");
          if (readStart.ordinal > readEnd.ordinal) fail("director screen text readingWindow endCueId must follow startCueId");
          if (readingWindow.startCueId !== visibilityStartCueId || readingWindow.endCueId !== visibilityEndCueId) fail("screen text readingWindow must use the same real cue anchors as its display visibility");
          if (item.requiresReading && readStart.ordinal < readEnd.ordinal && !readingWindow.holdAcrossCues) fail("screen text that must be read across cue boundaries must explicitly hold across those cues");
          const consumerRefs = array(item.consumerRefs, "director screen text.consumerRefs");
          unique(consumerRefs, (ref) => ref.implementationPlanId, "screen text consumer reference");
          for (const ref of consumerRefs) {
            object(ref, "director screen text consumer reference");
            onlyKeys(ref, new Set(["implementationPlanId", "mappingId"]), "director screen text consumer reference");
            const implementation = implementationById.get(text(ref.implementationPlanId, "screen text consumer implementationPlanId"));
            if (!implementation || !implementation.viewingUnitIds.includes(viewingUnitId) || !rowIds.includes(implementation.id)) fail("director screen text must point to an actual Film consumer for its own viewing unit");
            if (text(ref.mappingId, "screen text consumer mappingId") !== implementation.mappingId) fail("director screen text consumer mappingId must equal the actual implementationPlan mappingId");
            const style = textStyles.find((row) => row.id === styleId);
            if (!style.consumerMappings.some((consumer) => consumer.implementationPlanId === ref.implementationPlanId && consumer.mappingId === ref.mappingId)) {
              fail("screenText.consumerRefs must resolve to an explicit font/style consumerMappings entry for style " + styleId);
            }
            usedTextStyleConsumers.add(styleId + "::" + ref.implementationPlanId + "::" + ref.mappingId);
          }
          designTextById.set(itemId, { ...item, viewingUnitId, consumerRefs });
        }
      } else fail("director script cue screenText.mode must be none or planned");
      globalCueById.set(cueId, { ...cue, viewingUnitId, expanded, ordinal: globalCueById.get(cueId).ordinal });
    }

    const actions = array(unit.actions, "director design unit.actions");
    unique(actions, (row) => row.id, "director design action");
    for (const action of actions) {
      object(action, "director design action");
      onlyKeys(action, new Set(["id", "phase", "triggerCueIds", "targetObjectIds", "keyStates", "timing", "pathOrMorph", "motionPurpose", "handoff", "implementationPlanIds"]), "director design action");
      const actionId = text(action.id, "director design action.id");
      if (actionById.has(actionId)) fail("director design action IDs must be unique across all viewing units: " + actionId);
      if (!supportedActionPhases.has(text(action.phase, "director design action.phase"))) fail("director design action.phase is unsupported: " + action.phase);
      const cueRefs = array(action.triggerCueIds, "director design action.triggerCueIds", { allowEmpty: narrationMode === "none" });
      unique(cueRefs.map((id) => ({ id })), (row) => row.id, "action cue reference");
      for (const id of cueRefs) if (!scriptCues.some((cue) => cue.id === text(id, "director action triggerCueId"))) fail("director action " + actionId + " triggerCueIds must identify cues in its own viewing unit");
      const targets = array(action.targetObjectIds, "director design action.targetObjectIds");
      for (const id of targets) if (!objectIds.has(text(id, "director action targetObjectId"))) fail("director action " + actionId + " references an unknown target object " + id);
      unique(targets.map((id) => ({ id })), (row) => row.id, "director action target object");
      const keyStates = array(action.keyStates, "director design action.keyStates");
      unique(keyStates, (row) => row.objectId, "director design action key-state object");
      for (const state of keyStates) {
        object(state, "director design action key state");
        onlyKeys(state, new Set(["objectId", "from", "through", "to"]), "director design action key state");
        if (!objectIds.has(text(state.objectId, "director design action key-state objectId"))) fail("director action " + actionId + " references an unknown visual object " + state.objectId);
        for (const field of ["from", "through", "to"]) text(state[field], "director design action key-state." + field);
      }
      validateTimingReference(action.timing, narrationMode, new Set(scriptCues.map((cue) => cue.id)), "director design action " + actionId + ".timing", {
        allowEmpty: narrationMode === "none", cueById: globalCueById, durationSamples: canonical?.durationSamples,
      });
      text(action.pathOrMorph, "director design action.pathOrMorph");
      text(action.motionPurpose, "director design action.motionPurpose");
      text(action.handoff, "director design action.handoff");
      const actionRows = array(action.implementationPlanIds, "director design action.implementationPlanIds");
      for (const id of actionRows) {
        const row = implementationById.get(text(id, "director design action implementationPlanId"));
        if (!row || !row.viewingUnitIds.includes(viewingUnitId) || !rowIds.includes(row.id)) fail("director action " + actionId + " must bind an actual implementationPlan consumer for its viewing unit");
      }
      actionById.set(actionId, { ...action, viewingUnitId });
    }
    for (const cue of scriptCues) {
      const actionIds = cue.actionIds == null ? [] : array(cue.actionIds, "director script cue.actionIds", { allowEmpty: true });
      unique(actionIds.map((id) => ({ id })), (row) => row.id, "script cue action reference");
      for (const actionId of actionIds) if (!actions.some((action) => action.id === text(actionId, "script cue actionId"))) fail("script cue " + cue.id + " references an unknown action " + actionId);
    }
    const transition = object(unit.transition, "director design unit.transition");
    onlyKeys(transition, new Set(["targetViewingUnitId", "handoff", "continuity"]), "director design unit.transition");
    const target = transition.targetViewingUnitId;
    if (target != null) {
      if (!unitIds.has(text(target, "director design transition.targetViewingUnitId"))) fail("director design transition references an unknown next viewingUnit " + target);
      if (sourceUnit.nextUnitId !== target) fail("director design transition target must follow the existing viewingUnit sequence");
    } else if (sourceUnit.nextUnitId != null) fail("director design transition must preserve viewingUnit.nextUnitId " + sourceUnit.nextUnitId);
    text(transition.handoff, "director design transition.handoff");
    text(transition.continuity, "director design transition.continuity");

    const sound = object(unit.sound, "director design unit.sound");
    onlyKeys(sound, new Set(["intent", "reason", "voiceTrackIds", "eventIds", "trackIds", "syncCues"]), "director design unit.sound");
    const soundIntent = object(sound.intent, "director design unit.sound.intent");
    onlyKeys(soundIntent, new Set(["voice", "sfx", "music"]), "director design unit.sound.intent");
    if (!supportedVoiceStates.has(text(soundIntent.voice, "director design sound intent.voice"))) fail("director design sound intent.voice must be none, planned, or locked");
    for (const category of ["sfx", "music"]) if (!supportedSoundStates.has(text(soundIntent[category], "director design sound intent." + category))) fail("director design sound intent." + category + " must be none or designed");
    text(sound.reason, "director design unit.sound.reason");
    const voiceTrackIds = array(sound.voiceTrackIds, "director design unit.sound.voiceTrackIds", { allowEmpty: true });
    const eventIds = array(sound.eventIds, "director design unit.sound.eventIds", { allowEmpty: true });
    const trackIds = array(sound.trackIds, "director design unit.sound.trackIds", { allowEmpty: true });
    for (const [label, values] of [["voice track", voiceTrackIds], ["event", eventIds], ["track", trackIds]]) {
      unique(values.map((id) => ({ id })), (row) => row.id, "director design sound " + label + " reference");
      values.forEach((id) => text(id, "director design sound " + label + " ID"));
    }
    if ((soundIntent.voice === "none") !== (voiceTrackIds.length === 0)) fail("sound.intent.voice must be none only when no voice track consumer is planned");
    if (soundIntent.voice !== "none" && voiceTrackIds.length === 0) fail("planned/locked narration must identify its real audio-plan track consumer");
    if ((soundIntent.sfx === "designed") !== (eventIds.length > 0)) fail("sound.intent.sfx=designed must cite planned eventIds; none cannot hide a required event");
    if ((soundIntent.music === "designed") !== (trackIds.length > 0)) fail("sound.intent.music=designed must cite planned trackIds; none cannot hide a required track");
    const syncCues = sound.syncCues == null ? [] : array(sound.syncCues, "director design unit.sound.syncCues", { allowEmpty: true });
    unique(syncCues, (cue) => cue.kind + "::" + cue.id, "director design synchronized sound cue");
    for (const cue of syncCues) {
      object(cue, "director design synchronized sound cue");
      onlyKeys(cue, new Set(["kind", "id", "actionId", "phase", "relationship"]), "director design synchronized sound cue");
      const kind = text(cue.kind, "director design synchronized sound cue.kind");
      const id = text(cue.id, "director design synchronized sound cue.id");
      if (kind === "audio-event" && !eventIds.includes(id)) fail("synchronized audio-event must already be named in sound.eventIds");
      if (kind === "audio-track" && !trackIds.includes(id)) fail("synchronized audio-track must already be named in sound.trackIds");
      if (!new Set(["audio-event", "audio-track"]).has(kind)) fail("synchronized sound cue kind must be audio-event or audio-track");
      const action = actions.find((row) => row.id === text(cue.actionId, "director design synchronized sound cue.actionId"));
      if (!action) fail("synchronized sound cue must point to an action in this viewing unit");
      if (text(cue.phase, "director design synchronized sound cue.phase") !== action.phase) fail("synchronized sound cue phase must match its referenced action phase");
      text(cue.relationship, "director design synchronized sound cue.relationship");
    }
  }

  for (const check of displaySpanChecks) {
    validateCueAnchoredTimelineSpan(check.startCueId, check.endCueId, check.startOffsetSamples, check.endOffsetSamples,
      globalCueById, canonical.durationSamples, check.label);
  }

  for (const style of textStyles) {
    if (!usedTextStyleIds.has(style.id)) fail("global text style " + style.id + " is unused; do not add an unbound style to the design");
    for (const consumer of style.consumerMappings) {
      if (!usedTextStyleConsumers.has(style.id + "::" + consumer.implementationPlanId + "::" + consumer.mappingId)) {
        fail("text style consumerMappings entry is not used by a planned screenText item: " + style.id + "/" + consumer.mappingId);
      }
    }
  }

  if (narrationMode === "timeline") {
    const cueRows = [];
    for (const viewingUnit of units) {
      const unit = designUnitById.get(viewingUnit.id);
      for (const cue of unit.scriptCues || []) cueRows.push(...globalCueById.get(cue.id).expanded);
    }
    const expectedKeys = canonical.rows.map((row) => row.kind + "::" + row.occurrenceId + "::" + row.id);
    const actualKeys = cueRows.map((row) => row.kind + "::" + row.occurrenceId + "::" + row.id);
    if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
      fail("scriptCues must cover every valid word/utterance in the frozen canonical timeline exactly once, in order, without gaps or duplicate occurrences");
    }
  } else if (narrationMode === "script-only") {
    const selections = array(narration.scriptSelections, "directorDesign.narration.scriptSelections");
    const expected = [];
    for (const selection of selections) {
      object(selection, "script-only selected source range");
      onlyKeys(selection, new Set(["materialId", "lineStart", "lineEnd"]), "script-only selected source range");
      const source = plan.inputs.sourceMaterials.find((material) => material.id === text(selection.materialId, "script selection.materialId"));
      if (!source) fail("script-only selected range references an unknown source material");
      const materialPath = materialById.get(source.id)?.file;
      if (!materialPath) fail("script-only selected source material is not a verified source input");
      const data = fsSync.readFileSync(materialPath);
      if (data.includes(0)) fail("script-only selected material must be readable UTF-8 text");
      const lines = data.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
      if (!Number.isSafeInteger(selection.lineStart) || !Number.isSafeInteger(selection.lineEnd) || selection.lineStart < 1 || selection.lineEnd < selection.lineStart || selection.lineEnd > lines.length) fail("script-only selected range has invalid source line bounds");
      for (let line = selection.lineStart; line <= selection.lineEnd; line += 1) if (lines[line - 1].trim()) expected.push(source.id + "::line::" + line);
    }
    const actual = [];
    for (const viewingUnit of units) {
      const unit = designUnitById.get(viewingUnit.id);
      for (const cue of unit.scriptCues || []) actual.push(...globalCueById.get(cue.id).expanded.map((row) => row.materialId + "::line::" + row.line));
    }
    if (canonicalJson(actual) !== canonicalJson(expected)) fail("script-only scriptCues must cover every non-empty line in the explicitly selected hash-verified source ranges exactly once and in order");
  } else if ([...designUnits].some((unit) => (unit.scriptCues || []).some((cue) => cue.source?.kind !== "presentation-only"))) {
    fail("narration.mode=none can contain only explicit presentation-only cues; it cannot hide spoken source coverage");
  }

  validateCreativeDesignRealizationCoverage({plan, globalCueById, designUnits, captionManifest: asrcutHandoff?.captionManifest ?? null});

  const resourceTasks = design.resourceTasks == null ? [] : array(design.resourceTasks, "directorDesign.resourceTasks", { allowEmpty: true });
  const legacyUnits = designUnits.map((unit) => ({
    viewingUnitId: unit.viewingUnitId,
    sourceAnchors: unit.sourceAnchors,
    purpose: unit.purpose,
    visualGain: unit.visualGain,
    representation: unit.representation,
    composition: unit.composition,
    focalOrder: unit.focalOrder,
    look: unit.look,
    objects: unit.objects.map((item) => ({ id: item.id, role: item.role, meaning: item.meaning, initialState: item.initialState, resultState: item.resultState })),
    screenTextIds: (unit.scriptCues || []).flatMap((cue) => cue.screenText.mode === "planned" ? cue.screenText.items.map((item) => item.id) : []),
    implementationPlanIds: unit.implementationPlanIds,
    actions: unit.actions.map((action) => ({
      id: action.id, phase: action.phase,
      triggerAnchors: unit.sourceAnchors,
      keyStates: action.keyStates.map((state) => ({ objectId: state.objectId, from: state.from, to: state.to })),
      pathOrMorph: action.pathOrMorph, motionPurpose: action.motionPurpose, handoff: action.handoff,
      implementationPlanIds: action.implementationPlanIds,
    })),
    transition: unit.transition,
    sound: {
      intent: { sfx: unit.sound.intent.sfx, music: unit.sound.intent.music },
      reason: unit.sound.reason,
      eventIds: unit.sound.eventIds,
      trackIds: unit.sound.trackIds,
      syncCues: unit.sound.syncCues,
    },
  }));
  const legacyDesign = { format: "laohu.motion.director-design/1", id: design.id, units: legacyUnits, resourceTasks };
  validateDirectorDesignV1Shape({ plan: { ...plan, directorDesign: legacyDesign }, units, unitIds, implementationPlan });
  const attentionRuntimePhases = directorV3 ? validateDirectorAttentionPhasesV3({
    plan, design, narrationMode, units, unitIds, designUnits, implementationPlan, canonicalTimeline, canonical,
    captionManifest: asrcutHandoff?.captionManifest ?? null, globalCueById, designTextById, actionById,
  }) : null;
  return {
    directorDesignIdentitySha256: directorDesignIdentity(design),
    filmDesignIdentitySha256: filmDesignIdentity(design),
    ...(directorV3 ? {attentionRuntimePhases, captionStyleRuntime} : {}),
  };
}

function validateAttentionConsumerRefs(refs, implementationById, viewingUnitId, label) {
  array(refs, label + ".consumerRefs");
  unique(refs, (row) => row.implementationPlanId + "::" + row.mappingId, label + " consumer reference");
  for (const ref of refs) {
    object(ref, label + " consumer reference");
    onlyKeys(ref, new Set(["implementationPlanId", "mappingId", "fieldPath"]), label + " consumer reference");
    const implementation = implementationById.get(text(ref.implementationPlanId, label + ".consumerRefs.implementationPlanId"));
    if (!implementation || !implementation.viewingUnitIds.includes(viewingUnitId)) fail(label + " consumer reference must name an actual implementation for its viewing unit");
    if (text(ref.mappingId, label + ".consumerRefs.mappingId") !== implementation.mappingId) fail(label + " consumer mappingId must match the exact implementationPlan mapping");
    if (implementation.resourceType !== "renderer-route" || implementation.resourceId !== PROJECT_SHOT_ROUTE_ID
        || implementation.renderer !== "laohu-project-shot" || !implementation.consumerFields.includes("props") || !implementation.consumerFields.includes("props.attentionPhases")
        || !implementation.consumerFields.includes(text(ref.fieldPath, label + ".consumerRefs.fieldPath"))
        || text(ref.fieldPath, label + ".consumerRefs.fieldPath") !== "props.attentionPhases") {
      fail(label + " must bind through the registered laohu-project-shot props.attentionPhases consumer");
    }
  }
}

function validateDirectorAttentionPhasesV3({
  plan, design, narrationMode, units, unitIds, designUnits, implementationPlan, canonicalTimeline, canonical, captionManifest,
  globalCueById, designTextById, actionById,
}) {
  const phases = array(design.attentionPhases, "directorDesign.attentionPhases");
  const phaseIds = unique(phases, (row) => row.id, "attention phase");
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const designUnitById = new Map(designUnits.map((unit) => [unit.viewingUnitId, unit]));
  const implementationById = new Map(implementationPlan.map((row) => [row.id, row]));
  const runtimeRows = [];
  const anchorCoverage = new Map();
  const presentationCoverage = new Map();
  const sourceBoundaryCoverage = new Set();
  const phaseActions = new Map();
  const declaredActorIdsByUnit = new Map(designUnits.map((unit) => {
    const objectIds = (unit.objects || []).map((item) => item.id);
    const textIds = (unit.scriptCues || []).flatMap((cue) => cue.screenText?.mode === "planned" ? cue.screenText.items.map((item) => item.id) : []);
    const ids = [...objectIds, ...textIds];
    if (new Set(ids).size !== ids.length) fail("directorDesign/3 visual object and screenText actor IDs must be unique within viewingUnit " + unit.viewingUnitId);
    return [unit.viewingUnitId, new Set(ids)];
  }));
  const captionCueById = new Map((captionManifest?.cues || []).map((cue) => [cue.id, cue]));
  const tokenRows = new Map();
  const segmentRows = new Map();
  for (const clip of canonicalTimeline?.clips || []) {
    for (const word of clip.words || []) tokenRows.set(clip.occurrenceId + "\0" + word.tokenId, {clip, row: word, order: clip.words.indexOf(word)});
    for (const segment of clip.transcriptSegments || []) segmentRows.set(clip.occurrenceId + "\0" + segment.segmentId, {clip, row: segment});
  }
  const sortedPhaseTimes = [];
  const actualReadWindows = [];
  const captionReadIds = new Set();
  const screenTextReadIds = new Set();
  for (const phase of phases) {
    object(phase, "attention phase");
    onlyKeys(phase, new Set(["id", "viewingUnitId", "anchors", "mainTask", "actorBindings", "camera", "readingZones", "readWindows", "actionIds", "sound", "completion", "handoff"]), "attention phase");
    const phaseId = text(phase.id, "attention phase.id");
    const viewingUnitId = text(phase.viewingUnitId, "attention phase.viewingUnitId");
    if (!unitIds.has(viewingUnitId)) fail("attention phase " + phaseId + " references an unknown viewing unit");
    const designUnit = designUnitById.get(viewingUnitId);
    const declaredActorIds = declaredActorIdsByUnit.get(viewingUnitId) || new Set();
    if (!declaredActorIds.size) fail("attention phase " + phaseId + " must bind at least one object or planned screenText actor from its own viewing unit");
    const anchors = object(phase.anchors, "attention phase.anchors");
    let startSample = null, endSample = null, startSeconds, endSeconds;
    let phaseCueIds = [];
    if (narrationMode === "timeline") {
      onlyKeys(anchors, new Set(["basis", "rows"]), "attention phase.anchors");
      if (anchors.basis !== "canonical-units") fail("timeline attention phase anchors must cite canonical caption, source-clip, or presentation units");
      if (!captionManifest || !canonicalTimeline) fail("timeline attention phase has no verified caption/timeline handoff");
      const rows = array(anchors.rows, "attention phase.anchors.rows");
      for (const row of rows) {
        object(row, "attention phase anchor");
        const kind = text(row.kind, "attention phase anchor.kind");
        if (kind === "caption") {
          onlyKeys(row, new Set(["kind", "captionCueId", "tokenIds", "segmentId"]), "attention caption anchor");
          const cueId = text(row.captionCueId, "attention phase anchor.captionCueId");
          const cue = captionCueById.get(cueId);
          if (!cue) fail("attention phase " + phaseId + " references unknown caption manifest cue " + cueId);
          phaseCueIds.push(cueId);
          const occurrenceId = cue.anchors[0]?.occurrenceId;
          if (Array.isArray(row.tokenIds) && row.tokenIds.length) {
            if (row.segmentId != null || !cue.anchors[0]?.tokenIds) fail("attention phase " + phaseId + " must use the same token/segment precision as its caption cue");
            const cueTokens = cue.anchors[0].tokenIds;
            const indices = row.tokenIds.map((tokenId) => cueTokens.indexOf(text(tokenId, "attention phase anchor.tokenId")));
            if (indices.some((index) => index < 0)) fail("attention phase " + phaseId + " token refs must be included in the linked caption cue");
            for (let i = 1; i < indices.length; i += 1) if (indices[i] !== indices[i - 1] + 1) fail("attention phase " + phaseId + " token refs must remain contiguous and in source order");
            for (const tokenId of row.tokenIds) {
              const key = "token\0" + cueId + "\0" + tokenId;
              if (anchorCoverage.has(key)) fail("caption token is assigned to more than one attention phase: " + tokenId);
              anchorCoverage.set(key, phaseId);
              const found = tokenRows.get(occurrenceId + "\0" + tokenId);
              if (!found) fail("attention phase " + phaseId + " references a token absent from the canonical retained timeline");
              startSample = startSample == null ? found.row.targetRange.startSample : Math.min(startSample, found.row.targetRange.startSample);
              endSample = endSample == null ? found.row.targetRange.endSample : Math.max(endSample, found.row.targetRange.endSample);
            }
          } else if (row.segmentId != null) {
            if (row.tokenIds != null || cue.anchors[0]?.segmentId !== row.segmentId) fail("attention phase " + phaseId + " must preserve the caption cue's segment-level anchor");
            const key = "segment\0" + cueId + "\0" + row.segmentId;
            if (anchorCoverage.has(key)) fail("caption segment is assigned to more than one attention phase: " + row.segmentId);
            anchorCoverage.set(key, phaseId);
            const found = segmentRows.get(occurrenceId + "\0" + row.segmentId);
            if (!found) fail("attention phase " + phaseId + " references a segment absent from the canonical retained timeline");
            startSample = startSample == null ? found.row.targetRange.startSample : Math.min(startSample, found.row.targetRange.startSample);
            endSample = endSample == null ? found.row.targetRange.endSample : Math.max(endSample, found.row.targetRange.endSample);
          } else fail("caption attention phase anchor needs tokenIds or segmentId");
        } else if (kind === "presentation") {
          onlyKeys(row, new Set(["kind", "presentationId"]), "attention presentation anchor");
          const presentationId = text(row.presentationId, "attention phase anchor.presentationId");
          const presentation = canonical.presentationUnitsById.get(presentationId);
          if (!presentation) fail("attention phase " + phaseId + " references a presentation absent from the verified timeline/2 sequence: " + presentationId);
          if (presentationCoverage.has(presentationId)) fail("source-free presentation is assigned to more than one attention phase: " + presentationId);
          presentationCoverage.set(presentationId, phaseId);
          startSample = startSample == null ? presentation.targetRange.startSample : Math.min(startSample, presentation.targetRange.startSample);
          endSample = endSample == null ? presentation.targetRange.endSample : Math.max(endSample, presentation.targetRange.endSample);
        } else if (kind === "source-clip") {
          onlyKeys(row, new Set(["kind", "occurrenceId", "edge"]), "attention source-clip boundary anchor");
          const occurrenceId = text(row.occurrenceId, "attention source-clip boundary occurrenceId");
          const edge = text(row.edge, "attention source-clip boundary edge");
          const clip = canonical.clipByOccurrenceId.get(occurrenceId);
          if (!clip || !new Set(["start", "end"]).has(edge)) fail("attention source-clip boundary must name a retained occurrence and its actual start/end edge");
          sourceBoundaryCoverage.add(occurrenceId + "::" + edge);
          const sample = edge === "start" ? clip.targetRange.startSample : clip.targetRange.endSample;
          startSample = startSample == null ? sample : Math.min(startSample, sample);
          endSample = endSample == null ? sample : Math.max(endSample, sample);
        } else fail("timeline attention anchor kind must be caption, presentation, or source-clip");
      }
      if (new Set(phaseCueIds).size !== phaseCueIds.length) fail("attention phase " + phaseId + " repeats a caption cue anchor");
      if (startSample == null || endSample == null || endSample <= startSample) fail("attention phase " + phaseId + " has no positive canonical source/presentation span");
      startSeconds = startSample / canonicalTimeline.clock.sampleRateHz;
      endSeconds = endSample / canonicalTimeline.clock.sampleRateHz;
    } else {
      onlyKeys(anchors, new Set(["basis", "cueIds", "startFrame", "endFrame", "fps"]), "attention phase.anchors");
      if (anchors.basis !== "semantic-budget") fail("script-only/no-narration attention phases must use a non-ASR semantic-budget anchor");
      phaseCueIds = array(anchors.cueIds, "attention phase.anchors.cueIds", {allowEmpty: true});
      for (const cueId of phaseCueIds) {
        const cue = globalCueById.get(text(cueId, "attention phase semantic cueId"));
        if (!cue || cue.viewingUnitId !== viewingUnitId) fail("attention phase semantic anchor must name a real cue in its viewing unit");
      }
      if (!Number.isSafeInteger(anchors.startFrame) || !Number.isSafeInteger(anchors.endFrame) || anchors.startFrame < 0 || anchors.endFrame <= anchors.startFrame
          || anchors.fps !== design.globalSettings.frame.fps) fail("semantic-budget attention phase needs ordered frames on the declared production fps");
      startSeconds = anchors.startFrame / anchors.fps;
      endSeconds = anchors.endFrame / anchors.fps;
    }
    sortedPhaseTimes.push({id: phaseId, start: startSeconds, end: endSeconds, startSample, endSample});

    const mainTask = object(phase.mainTask, "attention phase.mainTask");
    onlyKeys(mainTask, new Set(["id", "kind", "description", "actorIds"]), "attention phase.mainTask");
    text(mainTask.id, "attention phase.mainTask.id");
    const taskKind = text(mainTask.kind, "attention phase.mainTask.kind");
    if (!new Set(["object", "relation", "group", "path", "process", "comparison", "atmosphere", "text", "data", "formula", "step", "chapter", "quote", "emotion"]).has(taskKind)) fail("attention phase mainTask.kind must describe one viewing task, including relation, group, path, process, comparison, text, data, or atmosphere");
    text(mainTask.description, "attention phase.mainTask.description");
    const targetActorIds = array(mainTask.actorIds, "attention phase.mainTask.actorIds");
    unique(targetActorIds.map((id) => ({id})), (row) => row.id, "attention main task actor");
    targetActorIds.forEach((id) => {
      text(id, "attention phase mainTask.actorId");
      if (!declaredActorIds.has(id)) fail("attention phase primary actor must be an actual object or planned screenText in its own viewing unit: " + id);
    });

    const actorBindings = array(phase.actorBindings, "attention phase.actorBindings");
    unique(actorBindings, (row) => row.actorId, "attention phase actor binding");
    if (actorBindings.some((row) => !declaredActorIds.has(row.actorId))) fail("attention phase actors must resolve to declared objects or planned screenText in their own viewing unit");
    const actorIdsThisPhase = new Set();
    for (const binding of actorBindings) {
      object(binding, "attention actor binding");
      onlyKeys(binding, new Set(["actorId", "role", "owner", "consumer", "props", "consumerRefs"]), "attention actor binding");
      const actorId = text(binding.actorId, "attention actorBinding.actorId");
      const role = text(binding.role, "attention actorBinding.role");
      if (!new Set(["target", "support", "context", "wait", "retire"]).has(role)) fail("attention actor role must be target, support, context, wait, or retire");
      if (binding.owner !== phaseId || binding.consumer !== "laohu-motion.attention-actor-style/1") fail("attention actor must declare this phase as property owner and the real attention-actor-style consumer");
      const props = object(binding.props, "attention actor props");
      onlyKeys(props, new Set(["x", "y", "width", "height", "scale", "rotation", "opacity", "visible", "coordinateSpace", "zIndex", "readingPoint", "readingPointSpace", "depth", "focusDepth"]), "attention actor props");
      for (const field of ["x", "y", "width", "height", "scale", "rotation", "opacity"]) if (typeof props[field] !== "number" || !Number.isFinite(props[field])) fail("attention actor geometry/opacity values must be finite numbers");
      if (props.width <= 0 || props.height <= 0 || props.scale <= 0 || props.opacity < 0 || props.opacity > 1 || typeof props.visible !== "boolean") fail("attention actor needs positive geometry/scale and explicit visible/opacity values");
      if (!new Set(["world", "screen"]).has(props.coordinateSpace)) fail("attention actor must state world or screen coordinateSpace");
      if (props.zIndex != null && !Number.isSafeInteger(props.zIndex)) fail("attention actor zIndex must be an integer");
      if (props.readingPoint != null && (!Array.isArray(props.readingPoint) || props.readingPoint.length !== 2 || !props.readingPoint.every((value) => typeof value === "number" && Number.isFinite(value)) || !new Set(["world", "screen"]).has(props.readingPointSpace))) fail("attention actor readingPoint must be finite and state its world or screen coordinate space");
      if (props.depth != null && (typeof props.depth !== "number" || props.depth < 0) || props.focusDepth != null && (typeof props.focusDepth !== "number" || props.focusDepth < 0)) fail("attention actor depth/focusDepth must be non-negative");
      if (role === "retire" && props.visible && props.opacity > 0) fail("retired attention actor remains visible");
      if (role === "target" && (!props.visible || props.opacity === 0)) fail("main task target is hidden in the renderer-bound actor props");
      if (targetActorIds.includes(actorId) !== (role === "target")) fail("mainTask.actorIds and target actorBindings must identify the same primary task actors");
      validateAttentionConsumerRefs(binding.consumerRefs, implementationById, viewingUnitId, "attention actor " + actorId);
      actorIdsThisPhase.add(actorId);
    }
    const camera = object(phase.camera, "attention phase.camera");
    onlyKeys(camera, new Set(["owner", "consumer", "keyframes", "consumerRefs"]), "attention phase.camera");
    if (camera.owner !== phaseId || camera.consumer !== "laohu.motion.camera-rig/1") fail("attention camera properties need the phase owner and a CameraRig consumer");
    validateAttentionConsumerRefs(camera.consumerRefs, implementationById, viewingUnitId, "attention phase camera");
    const cameraConsumerIds = new Set(camera.consumerRefs.map((ref) => ref.implementationPlanId));
    const keyframes = array(camera.keyframes, "attention phase.camera.keyframes");
    const runtimeCameraKeys = [];
    for (const keyframe of keyframes) {
      object(keyframe, "attention camera keyframe");
      onlyKeys(keyframe, new Set(["anchor", "center", "zoom", "rotation", "tiltX", "tiltY", "stop"]), "attention camera keyframe");
      const anchor = object(keyframe.anchor, "attention camera keyframe.anchor");
      let at;
      if (narrationMode === "timeline") {
        onlyKeys(anchor, new Set(["captionCueId", "tokenId", "segmentId", "presentationId", "occurrenceId", "edge", "offsetSamples"]), "attention camera anchor");
        const edge = text(anchor.edge, "attention camera anchor.edge");
        if (!new Set(["start", "end"]).has(edge)) fail("attention camera edge must be start or end");
        const offset = anchor.offsetSamples ?? 0;
        if (!Number.isSafeInteger(offset)) fail("attention camera offsetSamples must be an integer on the canonical sample clock");
        let range;
        if (anchor.captionCueId != null) {
          if (anchor.presentationId != null || anchor.occurrenceId != null) fail("camera anchor must use exactly one canonical caption, presentation, or source-clip reference");
          const cueId = text(anchor.captionCueId, "attention camera captionCueId");
          const cue = captionCueById.get(cueId);
          if (!cue || !phaseCueIds.includes(cueId)) fail("camera keyframe must cite a caption anchor included in its attention phase");
          const occurrenceId = cue.anchors[0].occurrenceId;
          const isToken = anchor.tokenId != null;
          if (isToken === (anchor.segmentId != null)) fail("camera keyframe must choose either one tokenId or one segmentId");
          const id = text(isToken ? anchor.tokenId : anchor.segmentId, "attention camera token/segment anchor");
          if (isToken && !cue.anchors[0].tokenIds?.includes(id) || !isToken && cue.anchors[0].segmentId !== id) fail("attention camera keyframe must point to an exact token/segment in its linked caption cue");
          const anchorKey = (isToken ? "token\0" : "segment\0") + cueId + "\0" + id;
          if (anchorCoverage.get(anchorKey) !== phaseId) fail("attention camera keyframe must cite a token/segment already assigned to this exact phase");
          const found = isToken ? tokenRows.get(occurrenceId + "\0" + id) : segmentRows.get(occurrenceId + "\0" + id);
          if (!found) fail("attention camera anchor is absent from the actual retained timeline");
          range = found.row.targetRange;
        } else if (anchor.presentationId != null) {
          if (anchor.tokenId != null || anchor.segmentId != null || anchor.occurrenceId != null) fail("camera anchor must use exactly one canonical caption, presentation, or source-clip reference");
          range = resolveCanonicalAttentionCameraRange(anchor, anchors.rows, canonical);
        } else if (anchor.occurrenceId != null) {
          if (anchor.tokenId != null || anchor.segmentId != null) fail("camera anchor must use exactly one canonical caption, presentation, or source-clip reference");
          range = resolveCanonicalAttentionCameraRange(anchor, anchors.rows, canonical);
        } else fail("timeline camera keyframe needs an exact caption token/segment, presentation, or source-clip boundary anchor");
        if (anchor.captionCueId == null && (anchor.tokenId != null || anchor.segmentId != null)) fail("tokenId/segmentId camera anchors require their exact captionCueId");
        const sample = (edge === "start" ? range.startSample : range.endSample) + offset;
        if (sample < startSample || sample > endSample) fail("attention camera keyframe lies outside this phase's canonical speech span");
        at = sample / canonicalTimeline.clock.sampleRateHz;
      } else {
        onlyKeys(anchor, new Set(["frame"]), "semantic attention camera anchor");
        if (!Number.isSafeInteger(anchor.frame) || anchor.frame < phase.anchors.startFrame || anchor.frame > phase.anchors.endFrame) fail("semantic camera keyframe must stay within the declared semantic phase frames");
        at = anchor.frame / phase.anchors.fps;
      }
      if (!Array.isArray(keyframe.center) || keyframe.center.length !== 2 || !keyframe.center.every((value) => typeof value === "number" && Number.isFinite(value))
          || typeof keyframe.zoom !== "number" || !Number.isFinite(keyframe.zoom) || keyframe.zoom <= 0
          || typeof keyframe.rotation !== "number" || !Number.isFinite(keyframe.rotation)) fail("attention camera keyframe must provide real center/zoom/rotation values");
      runtimeCameraKeys.push({at, center: [...keyframe.center], zoom: keyframe.zoom, rotation: keyframe.rotation,
        ...(keyframe.tiltX == null ? {} : {tiltX: keyframe.tiltX}), ...(keyframe.tiltY == null ? {} : {tiltY: keyframe.tiltY}), ...(keyframe.stop ? {stop: true} : {})});
    }
    runtimeCameraKeys.sort((a, b) => a.at - b.at);
    if (!runtimeCameraKeys.length) fail("attention phase camera needs at least one canonical camera key");
    const actorConsumerIds = new Set(actorBindings.flatMap((binding) => binding.consumerRefs.map((ref) => ref.implementationPlanId)));
    if (!actorConsumerIds.size || canonicalJson([...cameraConsumerIds].sort()) !== canonicalJson([...actorConsumerIds].sort())) fail("attention actor and camera consumers must name the same exact project-shot mappings for each phase");
    for (const implementationId of actorConsumerIds) {
      if (!actorBindings.some((binding) => binding.role === "target" && binding.consumerRefs.some((ref) => ref.implementationPlanId === implementationId))) {
        fail("each phase consumer mapping must receive at least one real primary actor for its main viewing task");
      }
    }

    const readingZones = array(phase.readingZones, "attention phase.readingZones", {allowEmpty: true});
    const zoneIds = unique(readingZones, (row) => row.id, "attention reading zone");
    const runtimeZones = [];
    for (const zone of readingZones) {
      object(zone, "attention reading zone");
      onlyKeys(zone, new Set(["id", "windowId", "x", "y", "width", "height", "padding", "feather", "floor", "owner", "consumer", "textCueIds"]), "attention reading zone");
      const id = text(zone.id, "reading zone.id");
      if (zone.owner !== phaseId || zone.consumer !== "laohu.motion.reading-zone-mask/1") fail("reading-zone geometry needs a real owner and ReadingZoneMask consumer");
      if (![zone.x, zone.y, zone.width, zone.height].every((value) => typeof value === "number" && Number.isFinite(value)) || zone.width <= 0 || zone.height <= 0) fail("reading-zone geometry needs concrete positive output-pixel bounds");
      if (zone.padding != null && (!Number.isFinite(zone.padding) || zone.padding < 0) || zone.feather != null && (!Number.isFinite(zone.feather) || zone.feather < 1) || zone.floor != null && (zone.floor < 0 || zone.floor > 1)) fail("reading-zone padding/feather/floor values are outside the actual mask consumer range");
      const textCueIds = array(zone.textCueIds, "reading zone.textCueIds");
      for (const textId of textCueIds) if (!designTextById.has(textId) && !captionCueById.has(textId)) fail("reading zone textCueIds must resolve to actual planned screen text or compiled caption cues");
      runtimeZones.push({id, windowId: zone.windowId, textCueIds: [...textCueIds], x: zone.x, y: zone.y, width: zone.width, height: zone.height,
        ...(zone.padding == null ? {} : {padding: zone.padding}), ...(zone.feather == null ? {} : {feather: zone.feather}), ...(zone.floor == null ? {} : {floor: zone.floor})});
    }

    const readWindows = array(phase.readWindows, "attention phase.readWindows", {allowEmpty: true});
    const readWindowIds = unique(readWindows, (row) => row.id, "attention read window");
    const windowRows = [];
    for (const window of readWindows) {
      object(window, "attention read window");
      onlyKeys(window, new Set(["id", "taskId", "groupId", "captionCueIds", "captionRange", "screenTextIds", "screenTextRange", "reason"]), "attention read window");
      const readId = text(window.id, "attention readWindow.id");
      const taskId = text(window.taskId, "attention readWindow.taskId");
      const groupId = text(window.groupId, "attention readWindow.groupId");
      text(window.reason, "attention readWindow.reason");
      const captionIds = array(window.captionCueIds, "attention readWindow.captionCueIds", {allowEmpty: true});
      const textIds = array(window.screenTextIds, "attention readWindow.screenTextIds", {allowEmpty: true});
      if (!captionIds.length && !textIds.length) fail("attention read window must identify the text that serves its shared reading task");
      if (taskId !== mainTask.id) fail("attention read window taskId must name this phase's one main viewing task");
      for (const cueId of captionIds) {
        if (!captionCueById.has(cueId) || !phaseCueIds.includes(cueId)) fail("attention read window references a caption outside its phase");
        captionReadIds.add(cueId);
      }
      for (const textId of textIds) {
        const item = designTextById.get(textId);
        if (!item || item.viewingUnitId !== viewingUnitId) fail("attention read window references screen text outside its viewing unit");
        screenTextReadIds.add(textId);
      }
      const numericRanges = [];
      let captionRange = null;
      if (captionIds.length) {
        const bounds = object(window.captionRange, "attention readWindow.captionRange");
        onlyKeys(bounds, new Set(["startCueId", "endCueId"]), "attention readWindow.captionRange");
        const startCueId = text(bounds.startCueId, "attention readWindow.captionRange.startCueId");
        const endCueId = text(bounds.endCueId, "attention readWindow.captionRange.endCueId");
        const orderedCaptionIds = [...captionIds].sort((a, b) => captionCueById.get(a).displayWindow.startSample - captionCueById.get(b).displayWindow.startSample);
        if (startCueId !== orderedCaptionIds[0] || endCueId !== orderedCaptionIds.at(-1)) fail("captionRange must match the actual first/last compiled caption cue in this task window");
        const start = captionCueById.get(startCueId).displayWindow.startSample;
        const end = captionCueById.get(endCueId).displayWindow.endSample;
        if (end <= start) fail("attention caption read window ends before it begins");
        captionRange = {startCueId, endCueId};
        numericRanges.push({start, end});
      } else if (window.captionRange != null) fail("captionRange is valid only when captionCueIds are present");

      let screenTextRange = null;
      if (textIds.length) {
        const bounds = object(window.screenTextRange, "attention readWindow.screenTextRange");
        onlyKeys(bounds, new Set(["startCueId", "endCueId"]), "attention readWindow.screenTextRange");
        const startCueId = text(bounds.startCueId, "attention readWindow.screenTextRange.startCueId");
        const endCueId = text(bounds.endCueId, "attention readWindow.screenTextRange.endCueId");
        const a = globalCueById.get(startCueId), b = globalCueById.get(endCueId);
        if (!a || !b || a.viewingUnitId !== viewingUnitId || b.viewingUnitId !== viewingUnitId || a.ordinal > b.ordinal) fail("screenTextRange must name ordered actual script/presentation cues in its viewing unit");
        for (const textId of textIds) {
          const item = designTextById.get(textId);
          if (item.readingWindow.startCueId !== startCueId || item.readingWindow.endCueId !== endCueId) fail("screenTextRange must match each included screenText item's actual read-window anchors");
        }
        screenTextRange = {startCueId, endCueId};
        if (narrationMode === "timeline") {
          const startRows = a.expanded || [], endRows = b.expanded || [];
          if (!startRows.length || !endRows.length) fail("timeline screenTextRange cues need actual retained word/segment ranges");
          const starts = textIds.map((textId) => {
            const item = designTextById.get(textId);
            const first = (globalCueById.get(item.visibility.startCueId)?.expanded || [])[0];
            if (!first || !Number.isSafeInteger(item.visibility.startOffsetSamples)) fail("timeline screenTextRange needs the exact integer display offset from each text item's canonical cue anchor");
            return first.targetRange.startSample + item.visibility.startOffsetSamples;
          });
          const ends = textIds.map((textId) => {
            const item = designTextById.get(textId);
            const last = (globalCueById.get(item.visibility.endCueId)?.expanded || []).at(-1);
            if (!last || !Number.isSafeInteger(item.visibility.endOffsetSamples)) fail("timeline screenTextRange needs the exact integer display offset from each text item's canonical cue anchor");
            return last.targetRange.endSample + item.visibility.endOffsetSamples;
          });
          const start = Math.min(...starts);
          const end = Math.max(...ends);
          if (end <= start) fail("timeline screenTextRange resolves to a non-positive visibility window");
          numericRanges.push({start, end});
        } else numericRanges.push({start: a.ordinal, end: b.ordinal, semantic: true});
      } else if (window.screenTextRange != null) fail("screenTextRange is valid only when screenTextIds are present");
      const isSemantic = numericRanges.some((range) => range.semantic);
      const start = Math.min(...numericRanges.map((range) => range.start));
      const end = Math.max(...numericRanges.map((range) => range.end));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) fail("attention read window must resolve to a positive real reading interval");
      const runtimeWindow = {id: readId, taskId, groupId, captionCueIds: [...captionIds], screenTextIds: [...textIds], reason: window.reason,
        ...(captionRange ? {captionRange} : {}), ...(screenTextRange ? {screenTextRange} : {})};
      if (narrationMode === "timeline") {
        const sampleRate = canonicalTimeline.clock.sampleRateHz;
        runtimeWindow.basis = "canonical-display-window";
        runtimeWindow.start = start / sampleRate;
        runtimeWindow.end = end / sampleRate;
        windowRows.push({phaseId, id: readId, taskId, groupId, start, end, basis: "samples", runtime: runtimeWindow});
      } else {
        runtimeWindow.basis = "phase-frame-budget";
        runtimeWindow.start = startSeconds;
        runtimeWindow.end = endSeconds;
        windowRows.push({phaseId, id: readId, taskId, groupId, start, end, basis: "semantic", runtime: {...runtimeWindow, semanticRange: {startCueId: screenTextRange?.startCueId ?? null, endCueId: screenTextRange?.endCueId ?? null}}});
      }
      windowRows.at(-1).window = window;
    }
    actualReadWindows.push(...windowRows);
    for (const zone of readingZones) if (!readWindowIds.has(zone.windowId)) fail("reading zone must reference its actual attention readWindow id");
    for (const zone of readingZones) {
      const window = readWindows.find((row) => row.id === zone.windowId);
      for (const textId of zone.textCueIds) if (!(window.captionCueIds || []).includes(textId) && !(window.screenTextIds || []).includes(textId)) fail("reading zone textCueIds must be content in the exact readWindow it owns");
    }
    const actionIds = array(phase.actionIds, "attention phase.actionIds", {allowEmpty: true});
    unique(actionIds.map((id) => ({id})), (row) => row.id, "attention phase action reference");
    for (const actionId of actionIds) {
      const action = actionById.get(text(actionId, "attention phase actionId"));
      if (!action || action.viewingUnitId !== viewingUnitId) fail("attention phase actionIds must resolve to actual actions in the same viewing unit");
      const uses = phaseActions.get(actionId) || [];
      uses.push(phaseId);
      phaseActions.set(actionId, uses);
      for (const targetId of action.targetObjectIds || []) if (!actorIdsThisPhase.has(targetId)) fail("phase " + phaseId + " reuses action " + actionId + " without binding its actual target actor " + targetId);
    }
    const sound = object(phase.sound, "attention phase.sound");
    onlyKeys(sound, new Set(["eventIds", "actionIds", "visualPhaseId", "reason"]), "attention phase.sound");
    const eventIds = array(sound.eventIds, "attention phase.sound.eventIds", {allowEmpty: true});
    const soundActionIds = array(sound.actionIds, "attention phase.sound.actionIds", {allowEmpty: true});
    text(sound.reason, "attention phase.sound.reason");
    const designUnitSound = designUnitById.get(viewingUnitId).sound;
    for (const eventId of eventIds) {
      if (!designUnitSound.eventIds.includes(eventId)) fail("attention phase sound event must resolve to an actual audio event declared by its viewing unit: " + eventId);
      const linked = (designUnitSound.syncCues || []).some((row) => row.kind === "audio-event" && row.id === eventId
        && soundActionIds.includes(row.actionId) && actionIds.includes(row.actionId)
        && actionById.get(row.actionId)?.phase === row.phase);
      if (!linked) fail("attention phase sound event must share its actual semantic action and visual phase through the viewing unit's syncCues: " + eventId);
    }
    if (eventIds.length && (sound.visualPhaseId !== phaseId || !soundActionIds.length)) fail("each sound event must bind both its semantic action and this exact visual attention phase");
    if (!eventIds.length && sound.visualPhaseId != null && sound.visualPhaseId !== phaseId) fail("sound.visualPhaseId cannot point to another phase");
    for (const actionId of soundActionIds) if (!actionIds.includes(actionId)) fail("attention phase sound action must be one of its own real visual actions");

    const completion = object(phase.completion, "attention phase.completion");
    onlyKeys(completion, new Set(["condition", "exitState"]), "attention phase.completion");
    text(completion.condition, "attention phase.completion.condition");
    text(completion.exitState, "attention phase.completion.exitState");
    const handoff = object(phase.handoff, "attention phase.handoff");
    onlyKeys(handoff, new Set(["targetPhaseId", "condition", "entryState", "visualHold"]), "attention phase.handoff");
    text(handoff.condition, "attention phase.handoff.condition");
    text(handoff.entryState, "attention phase.handoff.entryState");
    const visualHold = text(handoff.visualHold, "attention phase.handoff.visualHold");
    if (!new Set(["retain-until-next-phase", "retain-to-canonical-end", "retain-to-frame-budget-end"]).has(visualHold)) fail("attention phase handoff.visualHold must explicitly retain the completed picture through the next phase or the actual timeline/frame end");
    if (handoff.targetPhaseId != null && !phaseIds.has(text(handoff.targetPhaseId, "attention phase.handoff.targetPhaseId"))) fail("attention phase handoff points to an unknown phase");
    if (handoff.targetPhaseId === phaseId) fail("attention phase cannot hand off to itself");

    runtimeRows.push({id: phaseId, viewingUnitId, start: startSeconds, end: endSeconds, mainTask: structuredClone(mainTask),
      cameraKeys: runtimeCameraKeys, readingZones: runtimeZones, readWindows: [], actorBindings: actorBindings.map((binding) => structuredClone(binding)),
      consumerImplementationIds: [...actorConsumerIds], handoff: structuredClone(handoff)});
    runtimeRows.at(-1).readWindows = windowRows.map((row) => structuredClone(row.runtime));
  }
  if (narrationMode === "timeline") {
    for (const cue of captionManifest.cues) {
      const required = cue.anchors[0].tokenIds?.map((id) => "token\0" + cue.id + "\0" + id) ?? ["segment\0" + cue.id + "\0" + cue.anchors[0].segmentId];
      for (const key of required) if (!anchorCoverage.has(key)) fail("caption cue " + cue.id + " has an orphan token/segment not assigned to an attention phase");
    }
    for (const cueId of captionCueById.keys()) if (!captionReadIds.has(cueId)) fail("caption cue " + cueId + " has no explicit task-linked reading window");
    for (const presentationId of canonical.presentationUnitsById.keys()) if (!presentationCoverage.has(presentationId)) fail("source-free canonical presentation " + presentationId + " has no anchored visual attention phase");
    const firstClip = [...canonical.clipByOccurrenceId.values()].sort((a, b) => a.targetRange.startSample - b.targetRange.startSample)[0];
    const firstSpeech = Math.min(...canonical.rows.map((row) => row.targetRange.startSample));
    const firstPresentation = Math.min(...[...canonical.presentationUnitsById.values()].map((row) => row.targetRange.startSample), Infinity);
    const firstVisualStart = Math.min(firstSpeech, firstPresentation);
    if (firstClip && firstClip.targetRange.startSample < firstVisualStart && !sourceBoundaryCoverage.has(firstClip.occurrenceId + "::start")) {
      fail("leading retained source time before the first spoken/presentation anchor needs an explicit source-clip start phase; do not create a black or invented-time intro");
    }
  } else {
    const requiredCueIds = [...globalCueById.keys()];
    const semanticCueCoverage = phases.flatMap((phase) => phase.anchors.cueIds || []);
    if (new Set(semanticCueCoverage).size !== semanticCueCoverage.length || requiredCueIds.some((id) => !semanticCueCoverage.includes(id))) fail("script-only/no-narration attention anchors must cover every real cue exactly once without claiming ASR timing");
  }
  for (const item of designTextById.values()) if (item.requiresReading && !screenTextReadIds.has(item.id)) fail("required-reading screen text " + item.id + " has no task-linked attention readWindow");
  for (let i = 0; i < phases.length; i += 1) {
    const unit = designUnitById.get(phases[i].viewingUnitId);
    const actualIds = array(unit.attentionPhaseIds, "director design unit.attentionPhaseIds").map((id) => text(id, "attentionPhaseId"));
    const expectedIds = phases.filter((phase) => phase.viewingUnitId === unit.viewingUnitId).map((phase) => phase.id);
    if (canonicalJson([...actualIds].sort()) !== canonicalJson([...expectedIds].sort())) fail("directorDesign unit.attentionPhaseIds must enumerate its exact temporal phase rows");
  }
  for (const actionId of actionById.keys()) if (!phaseActions.has(actionId)) fail("director action " + actionId + " is orphaned from all temporal attention phases");
  const sortedReads = [...actualReadWindows].sort((a, b) => a.basis.localeCompare(b.basis) || a.start - b.start || a.end - b.end);
  for (let i = 0; i < sortedReads.length; i += 1) for (let j = i + 1; j < sortedReads.length; j += 1) {
    const a = sortedReads[i], b = sortedReads[j];
    if (a.basis !== b.basis || b.start >= a.end) continue;
    const sameTaskGroup = a.taskId === b.taskId && a.groupId === b.groupId;
    if (!sameTaskGroup) fail("overlapping reading windows create independent concurrent demands; shared captions/labels must declare the same taskId and groupId");
  }
  sortedPhaseTimes.sort((a, b) => a.start - b.start);
  for (let i = 1; i < sortedPhaseTimes.length; i += 1) if (sortedPhaseTimes[i].start < sortedPhaseTimes[i - 1].end) fail("temporal attention phases overlap and claim competing main viewing tasks");
  sortedPhaseTimes.forEach((row, index) => {
    const next = sortedPhaseTimes[index + 1];
    const phase = phaseById.get(row.id);
    if (next) {
      if (phase.handoff.targetPhaseId !== next.id || phase.handoff.visualHold !== "retain-until-next-phase") fail("each non-terminal phase must hand off to the next time-ordered phase while retaining its completed picture through any canonical gap");
      const runtime = runtimeRows.find((item) => item.id === row.id);
      runtime.end = next.start;
    } else {
      if (phase.handoff.targetPhaseId != null) fail("terminal attention phase cannot point to an orphan handoff target");
      if (narrationMode === "timeline") {
        if (phase.handoff.visualHold !== "retain-to-canonical-end") fail("terminal timeline phase must retain the designed picture through canonical timeline.durationSamples");
        runtimeRows.find((item) => item.id === row.id).end = canonicalTimeline.durationSamples / canonicalTimeline.clock.sampleRateHz;
      } else if (phase.handoff.visualHold !== "retain-to-frame-budget-end") fail("terminal semantic phase must retain its designed picture to the declared frame-budget end");
    }
  });
  runtimeRows.sort((a, b) => a.start - b.start);
  return runtimeRows;
}

function validateDirectorDesignShape(args) {
  const { plan } = args;
  if (plan.work.directionMode === "technical-probe" && !isFormalV4OrV5(plan) && plan.directorDesign == null) {
    return { directorDesignIdentitySha256: null, filmDesignIdentitySha256: null };
  }
  const format = plan.directorDesign?.format;
  if (format === "laohu.motion.director-design/1" && !isFormalV4OrV5(plan)) return validateDirectorDesignV1Shape(args);
  if (format === "laohu.motion.director-design/2" && plan.format === PLAN_FORMAT_V3) return validateDirectorDesignV2Shape(args);
  if (format === "laohu.motion.director-design/3" && isFormalV4OrV5(plan)) return validateDirectorDesignV2Shape(args);
  fail("production-plan/4 and /5 require directorDesign/3; /5 additionally requires a matching creativeDesignRef; production-plan/3 preserves directorDesign/2 and /1..2 retain their legacy readers");
}

function verifyStyleLibraryReview(review, label = "production plan.styleLibraryReview") {
  object(review, label);
  onlyKeys(review, new Set(["format", "scope", "libraryFingerprint", "pageCharacters", "pageCount", "pageSequenceSha256", "missingIds", "complete"]), label);
  if (review.format !== "laohu.motion.style-library-fulltext-review/1" || review.scope !== "full-library") {
    fail(label + " must be a completed full-library original-text review receipt from styles fulltext pagination");
  }
  if (!Number.isSafeInteger(review.pageCharacters) || review.pageCharacters < 1 || review.pageCharacters > 24000) {
    fail(label + ".pageCharacters must be an integer from 1 to 24000");
  }
  const catalog = JSON.parse(fsSync.readFileSync(catalogPath, "utf8"));
  const indexPath = path.resolve(skillDir, catalog.styleLibrary.indexPath);
  const cliPath = path.resolve(skillDir, catalog.styleLibrary.cli);
  const python = [
    "import importlib.util,json,sys",
    "sys.dont_write_bytecode=True",
    "from pathlib import Path",
    "module_path,index_path,page_characters=sys.argv[1],Path(sys.argv[2]),int(sys.argv[3])",
    "spec=importlib.util.spec_from_file_location('laohu_styles',module_path)",
    "module=importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "index=module.load_index(index_path)",
    "print(json.dumps(module.full_library_review_receipt(index,index_path,page_characters),ensure_ascii=False))",
  ].join("\n");
  const stdout = run("python3", ["-c", python, cliPath, indexPath, String(review.pageCharacters)],
    "internal fulltext coverage validation", process.env);
  let current;
  try { current = JSON.parse(stdout); } catch (error) { fail(label + " coverage validator returned invalid JSON: " + error.message); }
  if (!current || current.complete !== true || (current.missingIds || []).length) {
    fail("the current full style library has missing or hash-changed source entries: " + (current?.missingIds || []).join(", "));
  }
  if (canonicalJson(review) !== canonicalJson(current)) {
    fail(label + " does not match a complete paginated read of the current style-library fingerprint/IDs/ranges; restart the fulltext review and update this plan");
  }
  return current;
}

async function verifyEvidenceLocalRef(planDir, currentPlanPath, evidenceRef, decision, selected, resources) {
  const label = "resource decision " + decision.id + ".evidenceRef";
  object(evidenceRef, label);
  onlyKeys(evidenceRef, new Set(["path", "sha256", "decisionId", "changedScope"]), label);
  const evidence = await verifyFileReference(planDir, { path: evidenceRef.path, sha256: evidenceRef.sha256 }, label);
  if (evidence.file === path.resolve(currentPlanPath)) fail(label + " must point to an earlier direction plan, not this plan");
  text(evidenceRef.decisionId, label + ".decisionId");
  text(evidenceRef.changedScope, label + ".changedScope");
  const { value: priorDraft } = await readJson(evidence.file, "prior direction plan");
  if (!PLAN_FORMATS.has(priorDraft.format) || !priorDraft.work || !new Set(["new-direction", "locked-local"]).has(priorDraft.work.directionMode)) {
    fail(label + " must reference a prior new-direction plan with a completed review or a user-locked local direction");
  }
  if (evidenceValidationStack.includes(evidence.file)) fail(label + " creates a cycle in the prior direction evidence chain");
  if (evidenceValidationStack.length >= 8) fail(label + " exceeds the maximum eight-plan evidence chain; start a new full direction review");
  evidenceValidationStack.push(evidence.file);
  let prior;
  try {
    prior = (await validatePlanFile(evidence.file, { stage: "direction" })).plan;
  } finally {
    evidenceValidationStack.pop();
  }
  const priorDecision = Array.isArray(prior.directionDecisions)
    ? prior.directionDecisions.find((item) => item.id === evidenceRef.decisionId)
    : null;
  if (!priorDecision || !new Set(["new-direction", "locked-local"]).has(priorDecision.mode)) {
    fail(label + " does not identify a prior selected direction decision");
  }
  if (priorDecision.selectedCandidateId !== decision.selectedCandidateId) {
    fail(label + " selected candidate differs from the prior direction; select new-direction when the aesthetic direction changes");
  }
  const priorCandidate = priorDecision.candidates?.find((candidate) => candidate.id === priorDecision.selectedCandidateId);
  if (!priorCandidate) fail(label + " prior plan has no selected candidate record");
  const currentCandidate = selected;
  const priorRow = ["material", "motion-scene"].includes(priorCandidate.resourceType)
    ? priorCandidate.resourceId : resourceRow(resources, priorCandidate.resourceType, priorCandidate.resourceId).id;
  const currentRow = ["material", "motion-scene"].includes(currentCandidate.resourceType)
    ? currentCandidate.resourceId : resourceRow(resources, currentCandidate.resourceType, currentCandidate.resourceId).id;
  if (priorCandidate.resourceType !== currentCandidate.resourceType || priorRow !== currentRow) {
    fail(label + " selected production resource differs from the prior evidence; use new-direction if the choice changed");
  }
  return evidence;
}

async function verifyUserLockRef(userLockRef, materialById, label = "locked-local resource decision.userLockRef") {
  if (typeof userLockRef === "string") {
    fail(label + " no longer accepts a free-form string; migrate it to a declared source material, exact locator, user-decision excerpt, and locked scope");
  }
  object(userLockRef, label);
  onlyKeys(userLockRef, new Set(["sourceMaterialId", "locator", "userDecision", "scope"]), label);
  const materialId = text(userLockRef.sourceMaterialId, label + ".sourceMaterialId");
  const material = materialById.get(materialId);
  if (!material) fail(label + ".sourceMaterialId must identify a source material declared in plan.inputs.sourceMaterials");
  object(userLockRef.locator, label + ".locator");
  onlyKeys(userLockRef.locator, new Set(["lineStart", "lineEnd"]), label + ".locator");
  const { lineStart, lineEnd } = userLockRef.locator;
  if (!Number.isSafeInteger(lineStart) || !Number.isSafeInteger(lineEnd) || lineStart < 1 || lineEnd < lineStart) {
    fail(label + ".locator must identify a valid source-material line range");
  }
  const userDecision = text(userLockRef.userDecision, label + ".userDecision");
  text(userLockRef.scope, label + ".scope");
  const sourceBytes = await fs.readFile(material.file);
  if (sha256(sourceBytes) !== material.sha256) fail(label + " source material changed after its declared hash was checked");
  const lines = sourceBytes.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lineEnd > lines.length) fail(label + ".locator ends after the referenced source material");
  const excerpt = lines.slice(lineStart - 1, lineEnd).join("\n");
  if (!excerpt.includes(userDecision)) fail(label + ".userDecision must quote text present inside its exact source-material locator");
  return { sourceMaterialId: materialId, locator: { lineStart, lineEnd }, scope: userLockRef.scope };
}

function assertPhase(phase, label, { optional = false } = {}) {
  if (optional && phase == null) return;
  object(phase, label);
  const allowed = new Set(["intent", "before", "after", "result", "textIds", "handoff", "reason", "toShotId"]);
  onlyKeys(phase, allowed, label);
  text(phase.intent, label + ".intent");
  for (const key of ["before", "after", "result", "handoff", "reason", "toShotId"]) if (phase[key] != null) text(phase[key], label + "." + key);
  if (phase.textIds != null) array(phase.textIds, label + ".textIds", { allowEmpty: true }).forEach((id) => text(id, label + ".textIds item"));
}

async function validatePlanFile(planPath, { stage = "production", ffmpeg = null, executionPhase = null, planOverride = null, sourcePlanBytes = null } = {}) {
  if (!new Set(["inputs", "direction", "production"]).has(stage)) fail("validation stage must be inputs, direction, or production");
  if (executionPhase != null && !new Set(["pre-render"]).has(executionPhase)) fail("executionPhase must be pre-render when supplied");
  const loadedPlan = planOverride == null
    ? await readJson(planPath, "production plan")
    : { value: planOverride, bytes: sourcePlanBytes || Buffer.from(canonicalJson(planOverride)) };
  const { value: plan, bytes: planBytes } = loadedPlan;
  const planDir = path.dirname(planPath);
  object(plan, "production plan");
  const isV5 = plan.format === PLAN_FORMAT_V5;
  const isV4 = isFormalV4OrV5(plan);
  const isV3 = plan.format === PLAN_FORMAT_V3 || isV4;
  const isV2 = plan.format === PLAN_FORMAT_V2 || isV3;
  const preRender = isV2 && executionPhase === "pre-render";
  const allowedPlanKeys = new Set(["format", "work", "inputs", "styleLibraryReview", "directionDecisions", "viewingUnits", "shots", "verification", "outputs", "audioPreview"]);
  if (isV2) allowedPlanKeys.add("implementationPlan");
  if (isV3) allowedPlanKeys.add("directorDesign");
  if (isV5) allowedPlanKeys.add("creativeDesign");
  onlyKeys(plan, allowedPlanKeys, "production plan");
  if (!PLAN_FORMATS.has(plan.format)) fail("production plan.format must be " + [...PLAN_FORMATS].join(" or "));
  object(plan.work, "plan.work");
  onlyKeys(plan.work, new Set(["id", "title", "directionMode"]), "plan.work");
  text(plan.work.id, "plan.work.id");
  text(plan.work.title, "plan.work.title");
  const directionModes = new Set(["new-direction", "locked-local", "evidence-local", "technical-probe"]);
  if (!directionModes.has(plan.work.directionMode)) fail("plan.work.directionMode must be new-direction, locked-local, evidence-local, or technical-probe");
  if (stage === "production" && plan.work.directionMode === "technical-probe") {
    failWithCode("TECHNICAL_PROBE_PRODUCTION_BOUNDARY",
      "technical-probe is intentionally limited to inputs/direction validation. For an isolated technical check, use the appropriate low-level renderer/component preview and label its artifact as technical evidence. For ordinary production, choose a mode supported by the actual evidence: new-direction with full style-library review and decision-to-consumer mapping, locked-local with a source-located real user decision, or evidence-local with an earlier validated direction. Do not relabel directionMode just to pass this gate.");
  }

  const inputs = object(plan.inputs, "plan.inputs");
  onlyKeys(inputs, new Set(["sourceMaterials", "asrcut", "filmBlueprint", "audioPlan", "audioScene", "assetIndex"]), "plan.inputs");
  const materialRows = array(inputs.sourceMaterials, "plan.inputs.sourceMaterials");
  unique(materialRows, (row) => row.id, "source material");
  const materialById = new Map();
  for (const row of materialRows) {
    object(row, "source material");
    onlyKeys(row, new Set(["id", "kind", "role", "path", "sha256"]), "source material");
    text(row.id, "source material.id"); text(row.kind, "source material.kind"); text(row.role, "source material.role");
    const verified = await verifyFileReference(planDir, { path: row.path, sha256: row.sha256 }, "source material " + row.id);
    materialById.set(row.id, { ...row, ...verified });
  }

  const asrcutHandoff = await verifyAsrcutHandoff(plan, planDir, {formalV4: isV4});
  let partial = {
    plan, planPath, planDir, planSha256: sha256(planBytes), executionPlanSha256: executionPlanSha256(plan), stage, materialById,
    inputsAudioScene: null, inputsAssetIndex: null, asrcutHandoff,
  };
  if (stage === "inputs") {
    if (isV2 && plan.directionDecisions != null) {
      for (const decision of array(plan.directionDecisions, "plan.directionDecisions", { allowEmpty: true })) {
        object(decision, "resource decision");
        if (decision.mode === "locked-local") await verifyUserLockRef(decision.userLockRef, materialById);
        else if (decision.userLockRef != null) fail("userLockRef is valid only for a locked-local direction decision");
      }
    }
    return partial;
  }
  if (isV2 && stage === "direction" && !isV4) return await validateV2DirectionPlan(partial);

  const units = array(plan.viewingUnits, "plan.viewingUnits");
  const unitIds = unique(units, (row) => row.id, "viewing unit");
  for (const unit of units) {
    object(unit, "viewing unit");
    onlyKeys(unit, new Set(["id", "sourceRefs", "task", "completionSignal", "nextUnitId"]), "viewing unit");
    text(unit.id, "viewing unit.id"); text(unit.task, "viewing unit.task"); text(unit.completionSignal, "viewing unit.completionSignal");
    if (unit.nextUnitId != null) text(unit.nextUnitId, "viewing unit.nextUnitId");
    const refs = array(unit.sourceRefs, "viewing unit.sourceRefs");
    for (const ref of refs) {
      object(ref, "viewing unit source reference");
      onlyKeys(ref, new Set(["materialId", "locator", "kind"]), "viewing unit source reference");
      if (!materialById.has(text(ref.materialId, "source reference.materialId"))) fail("viewing unit " + unit.id + " references unknown source material " + ref.materialId);
      text(ref.locator, "source reference.locator");
      if (ref.kind != null) text(ref.kind, "source reference.kind");
    }
  }

  if (isV5) partial = {...partial, ...await validateCreativeDesign(plan, units, materialById, asrcutHandoff)};

  const resources = await loadResources();
  const decisions = array(plan.directionDecisions, "plan.directionDecisions");
  const decisionIds = unique(decisions, (row) => row.id, "resource decision");
  const selectedByDecision = new Map();
  let styleLibraryReview = null;
  if (plan.work.directionMode === "new-direction") {
    if (plan.styleLibraryReview == null) {
      fail("new-direction plans require a complete styles fulltext --library review receipt before direction/production; existing plans without it need explicit migration");
    }
    styleLibraryReview = verifyStyleLibraryReview(plan.styleLibraryReview);
  } else if (plan.styleLibraryReview != null) {
    styleLibraryReview = verifyStyleLibraryReview(plan.styleLibraryReview);
  }
  const decisionInputRows = new Map();
  const projectShotFrameRequests = [];
  for (const decision of decisions) {
    object(decision, "resource decision");
    onlyKeys(decision, new Set(["id", "mode", "rationale", "candidates", "selectedCandidateId", "decisionInputs", "userLockRef", "evidenceRef"]), "resource decision");
    text(decision.id, "resource decision.id"); text(decision.rationale, "resource decision.rationale");
    if (!directionModes.has(decision.mode)) fail("resource decision.mode must be new-direction, locked-local, evidence-local, or technical-probe");
    if (decision.mode !== plan.work.directionMode) fail("resource decision " + decision.id + " mode differs from plan.work.directionMode");
    const candidates = array(decision.candidates, "resource decision " + decision.id + ".candidates");
    const candidateIds = unique(candidates, (row) => row.id, "candidate in decision " + decision.id);
    if (!candidateIds.has(text(decision.selectedCandidateId, "resource decision.selectedCandidateId"))) fail("resource decision " + decision.id + " selectedCandidateId does not match a listed candidate");
    for (const candidate of candidates) {
      object(candidate, "resource decision candidate");
      onlyKeys(candidate, new Set(["id", "resourceType", "resourceId", "fitReason", "limitations", "keyStateEvidence"]), "resource decision candidate");
      text(candidate.id, "candidate.id"); text(candidate.fitReason, "candidate.fitReason");
      if (candidate.limitations != null) text(candidate.limitations, "candidate.limitations");
      const type = text(candidate.resourceType, "candidate.resourceType");
      const id = text(candidate.resourceId, "candidate.resourceId");
      if (type === "material") {
        if (!materialById.has(id)) fail("candidate material " + id + " is not in plan.inputs.sourceMaterials");
      } else if (type === "renderer-route") {
        if (!isV2 || id !== PROJECT_SHOT_ROUTE_ID) fail("renderer-route candidates are available only in /2 and must name an actual registered local route");
        await projectShotRouteEvidence();
      } else if (type === "motion-scene") {
        if (isV2) fail("/2 directions must select a registered local implementation route, not an unbound Motion scene ID");
      } else {
        if (!["template", "component", "effect", "style"].includes(type)) fail("candidate resourceType must be template, component, effect, style, material, motion-scene, or renderer-route");
        const row = resourceRow(resources, type, id);
        if (type === "style") {
          if (row.selectionEligible !== true || row.route?.callable !== true) fail("style candidate " + id + " is research-only or has no registered callable consumer; keep it as a decision input, not a production selection");
        } else {
          if (isV2 && candidate.id === decision.selectedCandidateId) requireProductionUse(row, type, id, "selected candidate");
          if (!new Set(["available", "conditional"]).has(row.availability)) {
            fail("candidate " + id + " is " + (row.availability || "unclassified") + " and cannot be selected as a production renderer; retain it only as a decision input");
          }
        }
      }
      const proofRows = candidate.keyStateEvidence == null ? [] : array(candidate.keyStateEvidence, "candidate " + candidate.id + ".keyStateEvidence", { allowEmpty: true });
      const selected = candidate.id === decision.selectedCandidateId;
      const requireV2Proof = isV2 && stage === "production" && selected && decision.mode !== "technical-probe";
      if (stage === "production" && selected && (requireV2Proof || decision.mode === "new-direction") && proofRows.length === 0) {
        fail("selected load-bearing candidate " + candidate.id + " needs a selected key-state frame for production; project-shot frames may be captured from the actual Film during execution");
      }
      for (const proof of proofRows) {
        object(proof, "candidate key-state evidence");
        onlyKeys(proof, new Set(["phase", "path", "sha256", "observation", "rendererReceipt", "contentMaterialId", "filmSegmentId", "mappingId", "frameIndex", "globalFrameIndex", "filmPictureSha256"]), "candidate key-state evidence");
        text(proof.phase, "key-state phase");
        if (proof.observation != null) text(proof.observation, "key-state observation");
        const isProjectShot = type === "renderer-route" && id === PROJECT_SHOT_ROUTE_ID;
        if (preRender && selected && isProjectShot) {
          const filmSegmentId = text(proof.filmSegmentId, "key-state filmSegmentId");
          const mappingId = text(proof.mappingId, "key-state mappingId");
          const frameIndex = proof.frameIndex;
          if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) fail("project-shot selected key-state frameIndex must be a nonnegative local segment frame");
          continue;
        }
        await verifyFileReference(planDir, { path: proof.path, sha256: proof.sha256 }, "candidate " + candidate.id + " key-state", { png: true });
        if (stage === "production" && selected) {
          object(proof.rendererReceipt, "candidate " + candidate.id + " key-state rendererReceipt");
          onlyKeys(proof.rendererReceipt, new Set(["path", "sha256"]), "key-state rendererReceipt");
          text(proof.filmSegmentId, "key-state filmSegmentId");
          text(proof.mappingId, "key-state mappingId");
          if (type === "style") text(proof.contentMaterialId, "style key-state contentMaterialId");
        }
      }
    }
    const selected = candidates.find((candidate) => candidate.id === decision.selectedCandidateId);
    selectedByDecision.set(decision.id, selected);
    if (decision.mode === "locked-local") {
      await verifyUserLockRef(decision.userLockRef, materialById);
      if (decision.evidenceRef != null) fail("locked-local decision uses userLockRef; use evidence-local only when reusing a prior evidenced direction");
    } else if (decision.userLockRef != null) {
      fail(decision.mode + " decision cannot carry userLockRef; only an explicitly user-locked local direction uses this field");
    }
    if (decision.mode === "evidence-local") {
      if (decision.evidenceRef == null) fail("evidence-local decision requires an earlier hashed plan/decision reference; a model first guess is not a locked direction");
      await verifyEvidenceLocalRef(planDir, planPath, decision.evidenceRef, decision, selected, resources);
    } else if (decision.evidenceRef != null) {
      fail("evidenceRef is supported only for evidence-local decisions");
    }
    if (decision.decisionInputs != null) {
      const refs = array(decision.decisionInputs, "resource decision " + decision.id + ".decisionInputs", { allowEmpty: true });
      decisionInputRows.set(decision.id, refs);
      if (decision.mode === "new-direction" && refs.length === 0) {
        fail("new-direction decision " + decision.id + " must identify its full-library review and any selected original style fragments; decisionInputs:[] is not direction evidence");
      }
      let reviewInputCount = 0;
      let styleSourceInputCount = 0;
      for (const ref of refs) {
        object(ref, "decision input");
        onlyKeys(ref, new Set(["resourceType", "resourceId", "whyRelevant", "sourceLocation", "applicability", "preservedMechanism", "consumerMappings"]), "decision input");
        const type = text(ref.resourceType, "decision input.resourceType");
        const id = text(ref.resourceId, "decision input.resourceId");
        if (type === "style-library") {
          if (decision.mode !== "new-direction" || id !== "all" || !styleLibraryReview) {
            fail("style-library decision input must reference resourceId 'all' in a new-direction plan with its complete styleLibraryReview");
          }
          reviewInputCount += 1;
        } else if (type === "material") {
          if (!materialById.has(id)) fail("decision input material " + id + " is not among plan.inputs.sourceMaterials");
        } else {
          const row = resourceRow(resources, type, id);
          if (["reference-index", "style-profile"].includes(type) && row.availability !== "source-only") fail("reference-index and style-profile entries must retain source-only status");
          if (type === "style" && decision.mode === "new-direction") {
            styleSourceInputCount += 1;
            object(ref.sourceLocation, "style decision input " + id + ".sourceLocation");
            onlyKeys(ref.sourceLocation, new Set(["path", "lineStart", "lineEnd"]), "style sourceLocation");
            if (ref.sourceLocation.path !== row.contentPath) fail("style decision input " + id + " must point to its exact original entry path");
            const lineStart = ref.sourceLocation.lineStart;
            const lineEnd = ref.sourceLocation.lineEnd;
            if (!Number.isSafeInteger(lineStart) || !Number.isSafeInteger(lineEnd) || lineStart < 1 || lineEnd < lineStart || lineEnd > row.lines) {
              fail("style decision input " + id + " sourceLocation must use valid original Markdown line numbers");
            }
            const styleRoot = path.dirname(path.resolve(skillDir, resources.catalog.styleLibrary.indexPath));
            const sourcePath = path.resolve(styleRoot, row.contentPath);
            if (!isWithin(styleRoot, sourcePath)) fail("style decision input " + id + " sourceLocation escapes the pinned local style library");
            const sourceBytes = await fs.readFile(sourcePath);
            if (sha256(sourceBytes) !== row.localSha256) fail("style decision input " + id + " source changed from its pinned localSha256");
            const originalLines = sourceBytes.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
            if (!originalLines.slice(lineStart - 1, lineEnd).join("\n").trim()) {
              fail("style decision input " + id + " sourceLocation must include original source text, not an empty line");
            }
            text(ref.applicability, "style decision input " + id + ".applicability");
            text(ref.preservedMechanism, "style decision input " + id + ".preservedMechanism");
          const consumers = array(ref.consumerMappings, "style decision input " + id + ".consumerMappings", {
            allowEmpty: isV5 && stage === "direction",
          });
            unique(consumers, (item) => item.shotId + "::" + item.mappingId, "style consumer mapping");
            for (const item of consumers) {
              object(item, "style consumer mapping");
              onlyKeys(item, new Set(["shotId", "mappingId", "howUsed"]), "style consumer mapping");
              text(item.shotId, "style consumer mapping.shotId");
              text(item.mappingId, "style consumer mapping.mappingId");
              text(item.howUsed, "style consumer mapping.howUsed");
            }
          }
        }
        text(ref.whyRelevant, "decision input.whyRelevant");
      }
      if (decision.mode === "new-direction" && reviewInputCount !== 1) {
        fail("new-direction decision " + decision.id + " requires exactly one style-library/all decision input tied to its fulltext review");
      }
      if (decision.mode === "new-direction" && styleSourceInputCount === 0) {
        fail("new-direction decision " + decision.id + " must select at least one original style passage and map its mechanism to the chosen production consumer");
      }
    } else if (decision.mode === "new-direction") {
      fail("new-direction decision " + decision.id + " is missing decisionInputs; add the style-library review and selected evidence before choosing a direction");
    }
  }
  if (isV5 && stage === "direction" && plan.directorDesign == null) {
    return {
      ...partial,
      resources,
      units,
      unitIds,
      decisions,
      decisionIds,
      selectedByDecision,
      styleLibraryReview,
      implementationPlan: null,
      directorDesignIdentitySha256: null,
      filmDesignIdentitySha256: null,
      outputs: null,
      designStage: "creative-direction-only",
      nextStage: plan.work.directionMode === "technical-probe" ? "technical-probe-only" : "production-realization",
    };
  }
  let implementationPlan = null;
  if (isV2) {
    implementationPlan = array(plan.implementationPlan, "plan.implementationPlan");
    unique(implementationPlan, (row) => row.id, "implementation plan row");
    const mappingIds = new Set();
    for (const row of implementationPlan) {
      object(row, "implementation plan row");
      onlyKeys(row, new Set(["id", "decisionId", "viewingUnitIds", "filmSegmentId", "renderer", "resourceType", "resourceId", "mappingId", "consumerFields"]), "implementation plan row");
      text(row.id, "implementation plan row.id");
      const decisionId = text(row.decisionId, "implementation plan row.decisionId");
      if (!decisionIds.has(decisionId)) fail("implementation plan row " + row.id + " references unknown decision " + decisionId);
      const selected = selectedByDecision.get(decisionId);
      if (row.resourceType !== selected.resourceType || row.resourceId !== selected.resourceId) fail("implementation plan row " + row.id + " must preserve its selected direction route/resource");
      const renderer = text(row.renderer, "implementation plan row.renderer");
      const resourceType = text(row.resourceType, "implementation plan row.resourceType");
      const resourceId = text(row.resourceId, "implementation plan row.resourceId");
      text(row.filmSegmentId, "implementation plan row.filmSegmentId");
      const mappingId = text(row.mappingId, "implementation plan row.mappingId");
      if (mappingIds.has(mappingId)) fail("implementation plan mappingId must be unique: " + mappingId);
      mappingIds.add(mappingId);
      const fields = array(row.consumerFields, "implementation plan row.consumerFields").map((field) => text(field, "implementation plan consumer field"));
      if (resourceType === "renderer-route") {
        if (resourceId !== PROJECT_SHOT_ROUTE_ID || renderer !== "laohu-project-shot") fail("/2 production plan references an unknown renderer route");
        validateProjectShotFieldList(fields, plan, "project-shot implementation plan");
        await projectShotRouteEvidence();
      } else {
        const resource = resourceType === "material" ? materialById.get(resourceId) : resourceRow(resources, resourceType, resourceId);
        if (!resource || (resourceType !== "material" && resource.renderer !== renderer)) fail("implementation plan row " + row.id + " does not resolve to the actual selected consumer");
        if (resourceType !== "material") requireProductionUse(resource, resourceType, resourceId, "implementation plan");
      }
      const rowUnitIds = array(row.viewingUnitIds, "implementation plan row.viewingUnitIds");
      for (const unitId of rowUnitIds) if (!unitIds.has(text(unitId, "implementation plan viewingUnitId"))) fail("implementation plan row " + row.id + " references an unknown viewing unit");
    }
    for (const decision of decisions) {
      if (!implementationPlan.some((row) => row.decisionId === decision.id)) fail("/2 direction has no feasible implementation/consumer plan for decision " + decision.id);
    }
  }
  const directorDesignIdentities = isV3
    ? validateDirectorDesignShape({ plan, planDir, materialById, units, unitIds, implementationPlan, asrcutHandoff: partial.asrcutHandoff,
      creativeDesignIdentitySha256: partial.creativeDesignIdentitySha256 ?? null })
    : { directorDesignIdentitySha256: null, filmDesignIdentitySha256: null };
  partial = { ...partial, resources, units, unitIds, decisions, decisionIds, selectedByDecision, implementationPlan, ...directorDesignIdentities };

  const filmRef = object(inputs.filmBlueprint, "plan.inputs.filmBlueprint");
  onlyKeys(filmRef, new Set(["path", "sha256"]), "plan.inputs.filmBlueprint");
  const filmInput = await verifyFileReference(planDir, filmRef, "Film blueprint");
  const { value: blueprint } = await readJson(filmInput.file, "Film blueprint");
  if (!FILM_FORMATS.has(blueprint.format)) fail("production-plan accepts the existing Film Blueprint /1 and /2 consumer contracts");
  const filmVersion = blueprint.format.endsWith("/2") ? 2 : 1;
  array(blueprint.segments, "Film blueprint.segments");
  const segmentIds = unique(blueprint.segments, (row) => row.id, "Film segment");

  const asrcut = inputs.asrcut;
  if (blueprint.clock?.kind === "asrcut-v2") {
    if (!asrcut) fail("Film uses the frozen ASRcut clock but plan.inputs.asrcut is missing; reference the same timeline and edit plan, do not copy their timing");
    const timeline = await verifyFileReference(planDir, asrcut.timeline, "ASRcut timeline");
    const editPlan = await verifyFileReference(planDir, asrcut.editPlan, "ASRcut edit plan");
    const clock = blueprint.clock;
    const clockTimeline = resolveFrom(path.dirname(filmInput.file), clock.timelinePath, "Film clock.timelinePath");
    const clockEditPlan = resolveFrom(path.dirname(filmInput.file), clock.editPlanPath, "Film clock.editPlanPath");
    if (timeline.file !== clockTimeline || timeline.sha256 !== String(clock.timelineSha256).toLowerCase()) fail("plan ASRcut timeline reference differs from Film's frozen timeline path/hash");
    if (editPlan.file !== clockEditPlan || editPlan.sha256 !== String(clock.editPlanSha256).toLowerCase()) fail("plan ASRcut edit-plan reference differs from Film's frozen plan path/hash");
  }

  const audioRef = object(inputs.audioPlan, "plan.inputs.audioPlan");
  onlyKeys(audioRef, new Set(["path", "sha256"]), "plan.inputs.audioPlan");
  const audioInput = await verifyFileReference(planDir, audioRef, "audio-plan");
  const { value: audioPlan } = await readJson(audioInput.file, "audio-plan");
  if (audioPlan.schemaVersion !== SUPPORTED_AUDIO_SCHEMA || audioPlan.timeUnit !== "seconds" || audioPlan.timeBasis !== "film-global") {
    fail("production-plan runner supports the existing audio-plan/1 film-global seconds contract only");
  }
  if (inputs.audioScene != null) await verifyFileReference(planDir, inputs.audioScene, "canonical audio event scene");
  const audioIndexInput = inputs.assetIndex != null
    ? await verifyFileReference(planDir, inputs.assetIndex, "audio asset index")
    : { file: path.join(skillDir, "assets", "audio", "index.json"), sha256: await hashFile(path.join(skillDir, "assets", "audio", "index.json")) };
  const audioPreview = await validateAudioPreviewSelection(plan, audioPlan, audioIndexInput.file, audioInput.file);
  if (isV5 && stage === "production") validateCreativeResourceFitBinding(plan, materialById, audioPreview);
  if ((audioPlan.events || []).length && !inputs.audioScene) fail("audio-plan has events but plan.inputs.audioScene is missing; events must resolve through the shared scene consumer");
  if (filmVersion === 2 && blueprint.audioEventScenePath) {
    if (!inputs.audioScene) fail("Film /2 declares a canonical audioEventScene; plan.inputs.audioScene must reference that same shared scene");
    const scene = await verifyFileReference(planDir, inputs.audioScene, "canonical audio event scene");
    const declaredPath = resolveFrom(path.dirname(filmInput.file), blueprint.audioEventScenePath, "Film audioEventScenePath");
    if (scene.file !== declaredPath || scene.sha256 !== String(blueprint.audioEventSceneSha256).toLowerCase()) fail("plan audioScene reference differs from Film /2's canonical event scene path/hash");
  }

  const shotRows = array(plan.shots, "plan.shots");
  const shotIds = unique(shotRows, (row) => row.id, "shot");
  const mappedSegments = new Set();
  for (const shot of shotRows) {
    object(shot, "shot");
    onlyKeys(shot, new Set(["id", "viewingUnitIds", "decisionId", "filmSegmentId", "visualIntent", "subjects", "screenText", "phases", "audioIntent", "sourceMappings"]), "shot");
    text(shot.id, "shot.id");
    const shotUnits = array(shot.viewingUnitIds, "shot.viewingUnitIds");
    for (const id of shotUnits) if (!unitIds.has(text(id, "shot viewingUnitId"))) fail("shot " + shot.id + " references unknown viewing unit " + id);
    if (!decisionIds.has(text(shot.decisionId, "shot.decisionId"))) fail("shot " + shot.id + " references unknown resource decision " + shot.decisionId);
    const selected = selectedByDecision.get(shot.decisionId);
    const segmentId = text(shot.filmSegmentId, "shot.filmSegmentId");
    if (!segmentIds.has(segmentId)) fail("shot " + shot.id + " references unknown Film segment " + segmentId);
    if (mappedSegments.has(segmentId)) fail("Film segment " + segmentId + " is mapped to more than one shot");
    mappedSegments.add(segmentId);
    text(shot.visualIntent, "shot.visualIntent");
    const subjects = shot.subjects == null ? [] : array(shot.subjects, "shot.subjects", { allowEmpty: true });
    let materialChange = false;
    for (const subject of subjects) {
      object(subject, "shot subject");
      onlyKeys(subject, new Set(["id", "role", "enterState", "resultState"]), "shot subject");
      for (const key of ["id", "role", "enterState", "resultState"]) text(subject[key], "shot subject." + key);
      if (subject.enterState !== subject.resultState) materialChange = true;
    }
    const screenText = shot.screenText == null ? [] : array(shot.screenText, "shot.screenText", { allowEmpty: true });
    const screenTextIds = unique(screenText, (row) => row.id, "screen text in " + shot.id);
    const requiredReadIds = new Set();
    for (const item of screenText) {
      object(item, "screen text");
      onlyKeys(item, new Set(["id", "text", "role", "locked", "requiresReading", "materialId"]), "screen text");
      text(item.id, "screen text.id"); text(item.text, "screen text.text"); text(item.role, "screen text.role");
      if (item.locked != null && typeof item.locked !== "boolean") fail("screen text.locked must be boolean when supplied");
      if (item.requiresReading != null && typeof item.requiresReading !== "boolean") fail("screen text.requiresReading must be boolean when supplied");
      if (item.requiresReading === true) requiredReadIds.add(item.id);
      if (item.materialId != null && !materialById.has(text(item.materialId, "screen text.materialId"))) fail("screen text references an unknown source material");
    }
    const phases = shot.phases == null ? {} : object(shot.phases, "shot.phases");
    onlyKeys(phases, new Set(["enter", "change", "hold", "read", "exit", "transition"]), "shot.phases");
    for (const key of ["enter", "change", "hold", "read", "exit"]) assertPhase(phases[key], "shot.phases." + key, { optional: true });
    assertPhase(phases.transition, "shot.phases.transition", { optional: true });
    if (materialChange && !phases.change) fail("shot " + shot.id + " has different subject enter/result states, so phases.change must describe that real change");
    if (phases.change && (!phases.change.before || !phases.change.after)) fail("shot " + shot.id + " phases.change must name its actual before and after states");
    if (requiredReadIds.size && !phases.read) fail("shot " + shot.id + " has screen text marked requiresReading; add phases.read for that actual reading responsibility");
    if (phases.read) {
      const readIds = new Set(phases.read.textIds || []);
      for (const id of readIds) if (!screenTextIds.has(id)) fail("shot read phase references unknown screen text " + id);
      for (const id of requiredReadIds) if (!readIds.has(id)) fail("shot read phase must include required screen text " + id);
    }
    if (phases.transition?.toShotId != null && !shotIds.has(phases.transition.toShotId)) fail("shot transition references unknown next shot " + phases.transition.toShotId);
    const audioIntent = object(shot.audioIntent, "shot.audioIntent");
    onlyKeys(audioIntent, new Set(["choice", "reason", "eventIds"]), "shot.audioIntent");
    if (!new Set(["none", "locked", "voice", "music", "sfx", "ambience", "bridge", "composite"]).has(text(audioIntent.choice, "shot.audioIntent.choice"))) fail("shot.audioIntent.choice is not a supported role");
    text(audioIntent.reason, "shot.audioIntent.reason");
    if (audioIntent.eventIds != null) array(audioIntent.eventIds, "shot.audioIntent.eventIds", { allowEmpty: true }).forEach((id) => text(id, "shot audio event id"));

    const segment = blueprint.segments.find((row) => row.id === segmentId);
    const mappings = array(shot.sourceMappings, "shot.sourceMappings");
    unique(mappings, (row) => row.id, "source mapping in " + shot.id);
    let baseMappings = 0;
    let selectedMapped = false;
    let sceneValue = null;
    for (const mapping of mappings) {
      object(mapping, "source component mapping");
      onlyKeys(mapping, new Set(["id", "role", "segmentId", "renderer", "resourceType", "resourceId", "layerIndex", "consumerFields"]), "source component mapping");
      text(mapping.id, "source mapping.id");
      const role = text(mapping.role, "source mapping.role");
      if (!new Set(["base", "layer", "scene-input"]).has(role)) fail("source mapping.role must be base, layer, or scene-input");
      if (mapping.segmentId !== segment.id || mapping.renderer !== segment.renderer) fail("shot " + shot.id + " mapping does not identify the exact Film segment and renderer");
      const resourceType = text(mapping.resourceType, "source mapping.resourceType");
      const resourceId = text(mapping.resourceId, "source mapping.resourceId");
      let canonicalIds = new Set([resourceId]);
      if (resourceType === "material") {
        const material = materialById.get(resourceId);
        if (!material) fail("source mapping material " + resourceId + " is not among plan.inputs.sourceMaterials");
        canonicalIds.add(material.path);
        canonicalIds.add(path.relative(path.dirname(filmInput.file), material.file));
        canonicalIds.add(material.sha256);
      } else if (resourceType === "project-shot") {
        if (!isV2) fail("project-shot source mappings are available only in production-plan/2 or /3");
        canonicalIds.add(segment.modulePath);
        canonicalIds.add(segment.moduleSha256);
      } else if (resourceType === "renderer-route") {
        fail("production source mappings must name the actual per-work project-shot module; renderer-route is direction-stage provenance only");
      } else if (resourceType !== "motion-scene") {
        const row = resourceRow(resources, resourceType, resourceId);
        canonicalIds.add(row.id);
        if (row.productionId) canonicalIds.add(row.productionId);
      }
      const fields = array(mapping.consumerFields, "source mapping.consumerFields");
      let fieldValues = [];
      if (role === "base") {
        baseMappings += 1;
        if (mapping.layerIndex != null) fail("base source mapping cannot declare layerIndex");
        for (const field of fields) {
          const fieldPath = text(field, "source mapping consumer field");
          if (!jsonPathExists(segment, fieldPath)) fail("source mapping field " + fieldPath + " is absent from Film segment " + segment.id);
          fieldValues.push(getPath(segment, fieldPath));
        }
        if (resourceType === "template" || resourceType === "component") {
          const allowed = filmVersion === 1 ? ["templateId"] : ["templateId", "sourceCatalogId"];
          if (!allowed.some((field) => fields.includes(field))) fail("base component mapping must point to the Film renderer's actual templateId/sourceCatalogId field");
          const expectedRenderers = filmVersion === 1 ? new Set(["huashu-motion-template", "laohu-native-om-template"])
            : new Set(["video-shotcraft-remotion", "native-html-canvas-template", "laohu-native-om-template", "huashu-motion-template"]);
          if (!expectedRenderers.has(segment.renderer)) fail("component mapping renderer differs from a registered Film base consumer");
        } else if (resourceType === "project-shot") {
          if (filmVersion !== 2 || segment.renderer !== "laohu-project-shot" || mapping.resourceId !== segment.modulePath) {
            fail("project-shot base mapping must name the exact per-work module used by a Film /2 laohu-project-shot segment");
          }
          if (requiredProjectShotFields(plan).some((field) => !fields.includes(field))) {
            fail("project-shot base mapping must identify its real module path/hash/export, props, dependencies and assets");
          }
        } else if (resourceType === "motion-scene") {
          if (segment.renderer !== "motion-scene" || !fields.includes("scenePath") || !fields.includes("sceneSha256")) fail("Motion scene mapping must identify the Film segment scenePath and sceneSha256");
          const sceneRef = await verifyFileReference(path.dirname(filmInput.file), { path: segment.scenePath, sha256: segment.sceneSha256 }, "Motion scene " + segment.id);
          const loaded = await readJson(sceneRef.file, "Motion scene " + segment.id);
          sceneValue = loaded.value;
        } else {
          fail("base source mapping resourceType must be template, component, project-shot, or motion-scene");
        }
      } else if (role === "layer") {
        if (filmVersion !== 2) fail("Film Blueprint /1 has no independently consumable layers; additional components require its scene-input path");
        if (!Number.isSafeInteger(mapping.layerIndex) || mapping.layerIndex < 0) fail("Film /2 layer mapping requires its exact zero-based layerIndex");
        const layer = Array.isArray(segment.layers) ? segment.layers[mapping.layerIndex] : mapping.layerIndex === 0 && segment.sourceCatalogId ? { catalogId: segment.sourceCatalogId, props: segment.props || {} } : null;
        if (!layer) fail("source mapping layerIndex " + mapping.layerIndex + " is not an actual Film /2 layer on segment " + segment.id);
        if (!new Set(["component", "template", "effect", "style", "material"]).has(resourceType)) fail("Film /2 layer resourceType must identify a component, style, or material actually consumed by the layer");
        for (const field of fields) {
          const fieldPath = text(field, "source mapping consumer field");
          const value = getFilmLayerField(segment, mapping.layerIndex, fieldPath);
          if (value === undefined || value === null) fail("source mapping field " + fieldPath + " is absent from Film /2 layer " + mapping.layerIndex);
          fieldValues.push(value);
        }
        const layerCatalogId = layer.catalogId || (mapping.layerIndex === 0 ? segment.sourceCatalogId : null);
        if (["template", "component", "effect"].includes(resourceType) && !fields.some((field) => field.endsWith("catalogId") || field === "sourceCatalogId")) fail("component/effect layer mapping must identify the exact consumed catalogId");
        if (resourceType === "style" && !fields.some((field) => field.endsWith("styleId"))) fail("style mapping must identify the actual consumed styleId prop");
        if (resourceType === "material" && !fields.some((field) => /(?:src|assetRefId|image|video|font|path|url)$/i.test(field))) fail("material mapping must identify an actual media/font/path prop consumed by the Film layer");
        if (["template", "component", "effect"].includes(resourceType) && !canonicalIds.has(layerCatalogId)) fail("Film /2 layer catalogId differs from source mapping " + mapping.id);
      } else {
        if (segment.renderer !== "motion-scene") fail("scene-input mappings require a Film segment whose existing consumer is motion-scene");
        if (!sceneValue) {
          const sceneRef = await verifyFileReference(path.dirname(filmInput.file), { path: segment.scenePath, sha256: segment.sceneSha256 }, "Motion scene " + segment.id);
          sceneValue = (await readJson(sceneRef.file, "Motion scene " + segment.id)).value;
        }
        for (const field of fields) {
          const fieldPath = text(field, "source mapping consumer field");
          const value = getPath(sceneValue, fieldPath);
          if (value === undefined || value === null) fail("source mapping scene field " + fieldPath + " is not consumed from the referenced Motion scene");
          fieldValues.push(value);
        }
      }
      let matched = false;
      for (const value of fieldValues) {
        if (canonicalIds.has(value)) { matched = true; break; }
        if (resourceType === "material" && typeof value === "string") {
          const material = materialById.get(resourceId);
          if (path.resolve(path.dirname(filmInput.file), value) === material.file) { matched = true; break; }
        }
        if (resourceType === "material" && value && typeof value === "object") {
          const material = materialById.get(resourceId);
          if (material.file.toLowerCase().endsWith(".json")) {
            const { value: sourceValue } = await readJson(material.file, "source material " + material.id);
            if (canonicalJson(sourceValue) === canonicalJson(value)) { matched = true; break; }
          }
        }
        if (resourceType === "motion-scene" && typeof value === "string"
            && path.resolve(path.dirname(filmInput.file), value) === path.resolve(path.dirname(filmInput.file), segment.scenePath)) { matched = true; break; }
      }
      if (!matched) fail("source mapping " + mapping.id + " is not tied to its exact consumer field value; an ID appearing elsewhere in JSON is not consumption proof");
      selectedMapped ||= candidateMatchesMapping(selected, mapping, segment, resources);
      if (isV2) {
        const planned = implementationPlan.find((row) => row.id === shot.id && row.mappingId === mapping.id);
        if (planned) {
          if (planned.filmSegmentId !== segment.id || planned.renderer !== segment.renderer) fail("/2 implementation plan consumer differs from its exact Film segment/renderer");
          if (planned.resourceType === "renderer-route") {
            if (!routeCandidateMatchesMapping(planned, mapping, segment)
                || planned.consumerFields.some((field) => !mapping.consumerFields.includes(field))) {
              fail("/2 project-shot consumer no longer matches the selected renderer route's actual module/dependency/asset fields; additional mapping fields must also exist on this exact consumer");
            }
          } else if (planned.resourceType !== mapping.resourceType || planned.resourceId !== mapping.resourceId
              || canonicalJson(planned.consumerFields) !== canonicalJson(mapping.consumerFields)) {
            fail("/2 implementation plan mapping differs from the actual Film consumer fields");
          }
        }
      }
    }
    if (baseMappings !== 1) fail("shot " + shot.id + " must identify the one Film base renderer and may add any number of real component/style/material layer mappings");
    if (!selectedMapped) fail("shot " + shot.id + " must map its selected decision candidate to a real Film consumer field");
  }
  if (mappedSegments.size !== segmentIds.size) {
    const missing = [...segmentIds].filter((id) => !mappedSegments.has(id));
    fail("production plan must map every Film segment to its viewing unit and real consumer; unmapped segments: " + missing.join(", "));
  }

  if (isV2) {
    for (const planned of implementationPlan) {
      const shot = shotRows.find((row) => row.id === planned.id);
      const mapping = shot?.sourceMappings.find((row) => row.id === planned.mappingId);
      if (!shot || !mapping || shot.filmSegmentId !== planned.filmSegmentId) fail("/2 implementation plan row " + planned.id + " has no exact Film shot/mapping consumer");
    }
  }

  for (const decision of decisions) {
    const selected = selectedByDecision.get(decision.id);
    for (const ref of decisionInputRows.get(decision.id) || []) {
      if (ref.resourceType !== "style" || decision.mode !== "new-direction") continue;
      for (const consumer of ref.consumerMappings || []) {
        const shot = shotRows.find((item) => item.id === consumer.shotId);
        if (!shot || shot.decisionId !== decision.id) {
          fail("style decision input " + ref.resourceId + " consumer mapping " + consumer.mappingId + " must point to a shot owned by decision " + decision.id);
        }
        const mapping = shot.sourceMappings.find((item) => item.id === consumer.mappingId);
        if (!mapping) fail("style decision input " + ref.resourceId + " consumer mapping " + consumer.mappingId + " is absent from shot " + shot.id);
        const segment = blueprint.segments.find((row) => row.id === shot.filmSegmentId);
        const sameResource = candidateMatchesMapping(selected, mapping, segment, resources);
        if (!sameResource) fail("style decision input " + ref.resourceId + " consumer mapping must point to the selected production candidate consumed by Film");
      }
    }
  }

  let asrcutTimeline = null;
  if (inputs.asrcut?.timeline) {
    const timelinePath = resolveFrom(planDir, inputs.asrcut.timeline.path, "plan.inputs.asrcut.timeline.path");
    asrcutTimeline = (await readJson(timelinePath, "ASRcut canonical timeline")).value;
  }
  const attentionConsumerBinding = isFormalV4OrV5(plan) ? await validateAttentionFilmConsumerBinding({
    plan, planDir, implementationPlan, shots: shotRows, blueprint, filmInput,
    asrcutTimeline,
    attentionRuntimePhases: partial.attentionRuntimePhases ?? null,
    captionManifest: partial.asrcutHandoff?.captionManifest ?? null,
    captionStyleRuntime: partial.captionStyleRuntime ?? null,
  }) : null;
  partial = {...partial, attentionConsumerBinding};
  const directorDesignProduction = stage === "production"
    ? await validateDirectorDesignProductionBinding({
      plan, planDir, units, implementationPlan, shots: shotRows, materialById, audioPlan, audioPreview,
      audioInput, blueprint, filmInput, asrcutTimeline, executionPhase,
      attentionRuntimePhases: partial.attentionRuntimePhases ?? null,
      captionManifest: partial.asrcutHandoff?.captionManifest ?? null,
      captionStyleRuntime: partial.captionStyleRuntime ?? null,
      attentionConsumerBinding,
    })
    : { boundDirectorDesignIdentitySha256: null, boundFilmDesignIdentitySha256: null, timingIdentitySha256: null, fontEvidence: [] };

  if (stage === "direction") {
    return {
      ...partial, blueprint, filmVersion, segmentIds, filmInput, audioPlan, audioInput,
      ...directorDesignProduction,
      outputs: null, keyStateProofs: [], audioIndexInput, audioPreview,
      inputsAudioScene: inputs.audioScene ? resolveFrom(planDir, inputs.audioScene.path, "plan.inputs.audioScene.path") : null,
      inputsAssetIndex: inputs.assetIndex ? resolveFrom(planDir, inputs.assetIndex.path, "plan.inputs.assetIndex.path") : null,
    };
  }

  const keyStateProofs = [];
  for (const decision of decisions) {
    const selected = selectedByDecision.get(decision.id);
    for (const proof of selected.keyStateEvidence || []) {
      const shot = shotRows.find((item) => item.decisionId === decision.id && item.filmSegmentId === proof.filmSegmentId);
      if (!shot) fail("selected candidate key-state proof must point to a Film segment used by its decision: " + proof.filmSegmentId);
      const mapping = shot.sourceMappings.find((item) => item.id === proof.mappingId);
      if (!mapping) fail("selected candidate key-state proof mappingId does not exist on the referenced shot: " + proof.mappingId);
      const segment = blueprint.segments.find((row) => row.id === shot.filmSegmentId);
      const sameResource = candidateMatchesMapping(selected, mapping, segment, resources);
      if (!sameResource) fail("selected candidate key-state receipt mapping does not target the selected decision candidate");
      if (preRender && selected.resourceType === "renderer-route" && selected.resourceId === PROJECT_SHOT_ROUTE_ID) {
        if (proof.filmSegmentId !== shot.filmSegmentId || !routeCandidateMatchesMapping(selected, mapping, segment)) {
          fail("project-shot selected key-state frame must point to the exact selected route's Film /2 base mapping");
        }
        const frameStart = Math.ceil(segment.startSec * blueprint.fps - 1e-9);
        const frameEnd = Math.ceil(segment.endSec * blueprint.fps - 1e-9);
        if (proof.frameIndex >= frameEnd - frameStart) fail("project-shot selected key-state frameIndex falls outside the planned Film segment " + segment.id);
        projectShotFrameRequests.push({
          candidateId: selected.id, resourceId: selected.resourceId, phase: proof.phase,
          filmSegmentId: proof.filmSegmentId, mappingId: proof.mappingId, frameIndex: proof.frameIndex,
        });
        keyStateProofs.push({
          candidateId: selected.id, resourceId: selected.resourceId,
          filmSegmentId: proof.filmSegmentId, mappingId: proof.mappingId, frameIndex: proof.frameIndex,
          pendingCapture: true, quality: "not-rated-by-machine",
        });
        continue;
      }
      keyStateProofs.push(await verifyCandidateKeyState({
        plan, planDir, proof, candidate: selected, mapping,
        segment: blueprint.segments.find((segment) => segment.id === proof.filmSegmentId),
        filmInput, materialById, resources, ffmpeg,
      }));
    }
  }

  const outputs = object(plan.outputs, "plan.outputs");
  onlyKeys(outputs, new Set(["picture", "filmManifest", "audioWav", "audioManifest", "finalVideo"]), "plan.outputs");
  const outputPaths = new Map();
  for (const key of ["picture", "filmManifest", "audioWav", "audioManifest", "finalVideo"]) {
    const file = resolveFrom(planDir, outputs[key], "plan.outputs." + key);
    if (outputPaths.has(file)) fail("plan.outputs." + key + " duplicates " + outputPaths.get(file));
    outputPaths.set(file, key);
  }
  if (!outputs.picture.toLowerCase().endsWith(".mp4") || !outputs.finalVideo.toLowerCase().endsWith(".mp4")) fail("picture and finalVideo outputs must be .mp4");
  if (!outputs.filmManifest.toLowerCase().endsWith(".json") || !outputs.audioManifest.toLowerCase().endsWith(".json")) fail("filmManifest and audioManifest outputs must be .json");
  if (!outputs.audioWav.toLowerCase().endsWith(".wav")) fail("audioWav output must be .wav");

  const verification = object(plan.verification, "plan.verification");
  if (isV2) {
    await validateV2VerificationGates({ planDir, verification, outputs, keyStateProofs, blueprint, filmInput, filmVersion, plan, resources, preRender });
  } else {
    onlyKeys(verification, new Set(["gates"]), "plan.verification");
    const gates = array(verification.gates, "plan.verification.gates");
    unique(gates, (row) => row.id, "verification gate");
    for (const gate of gates) {
      object(gate, "verification gate");
      onlyKeys(gate, new Set(["id", "inspect", "evidence", "redoReason"]), "verification gate");
      for (const key of ["id", "inspect", "evidence", "redoReason"]) text(gate[key], "verification gate." + key);
    }
  }
  return {
    ...partial, blueprint, filmVersion, segmentIds, filmInput, audioPlan, audioInput, outputs, keyStateProofs, projectShotFrameRequests, planBytes,
    ...directorDesignProduction,
    inputsAudioScene: inputs.audioScene ? resolveFrom(planDir, inputs.audioScene.path, "plan.inputs.audioScene.path") : null,
    inputsAssetIndex: inputs.assetIndex ? resolveFrom(planDir, inputs.assetIndex.path, "plan.inputs.assetIndex.path") : null,
    audioIndexInput,
    audioPreview,
  };
}

async function validateAudioPreviewSelection(plan, audioPlan, indexPath, audioPlanPath) {
  const hasSelection = plan.audioPreview != null;
  if (hasSelection) {
    object(plan.audioPreview, "plan.audioPreview");
    onlyKeys(plan.audioPreview, new Set(["candidateAssetIds"]), "plan.audioPreview");
  }
  const selectedRows = hasSelection ? array(plan.audioPreview.candidateAssetIds, "plan.audioPreview.candidateAssetIds") : [];
  const selectedIds = new Set(selectedRows.map((id) => text(id, "plan.audioPreview.candidateAssetIds item")));
  if (selectedIds.size !== selectedRows.length) fail("plan.audioPreview.candidateAssetIds must not contain duplicates");

  const { value: index } = await readJson(indexPath, "audio asset index");
  if (index.schemaVersion !== 1 || !Array.isArray(index.assets)) fail("audio asset index must use schemaVersion 1 with an assets array");
  const indexed = new Map();
  for (const asset of index.assets) {
    const id = text(asset.id, "audio asset index.id");
    if (indexed.has(id)) fail("audio asset index has duplicate id " + id);
    indexed.set(id, asset);
  }
  const usedIds = [...new Set([
    ...(audioPlan.events || []).map((row) => text(row.assetId, "audio cue assetId")),
    ...(audioPlan.tracks || []).map((row) => text(row.assetId, "audio track assetId")),
  ])];
  const planAssets = new Map((audioPlan.assets || []).map((asset) => [asset.id, asset]));
  const generatedAssets = new Map((audioPlan.generatedAssets || []).map((asset) => [asset.id, asset]));
  const referencedCandidates = [];
  const referencedGenerated = [];
  const usedAssetsById = new Map();
  for (const id of usedIds) {
    const planAsset = planAssets.get(id);
    const generatedAsset = generatedAssets.get(id);
    const indexAsset = indexed.get(id);
    const matches = [planAsset, generatedAsset, indexAsset].filter(Boolean);
    if (matches.length > 1) fail("audio asset " + id + " is ambiguous across the plan and index");
    const asset = matches[0];
    if (!asset) fail("audio plan references missing asset " + id);
    if (generatedAsset) {
      referencedGenerated.push(id);
      continue;
    }
    const indexedAsset = Boolean(indexAsset);
    const assetRoot = indexedAsset ? path.dirname(indexPath) : path.dirname(audioPlanPath);
    const assetFile = resolveFrom(assetRoot, asset.file, "audio asset " + id + ".file");
    if (indexedAsset && !isWithin(assetRoot, assetFile)) fail("indexed audio asset " + id + " escapes the declared audio-index directory");
    const actualSha256 = await hashFile(assetFile).catch((error) => fail("audio asset " + id + " is unavailable: " + error.message));
    const expectedSha256 = text(asset.sha256, "audio asset " + id + ".sha256").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedSha256) || actualSha256 !== expectedSha256) {
      fail("audio asset " + id + " actual file SHA-256 does not match the asset record");
    }
    usedAssetsById.set(id, { id, asset, file: assetFile, sha256: actualSha256, indexed: indexedAsset });
    if (asset.reviewStatus === "candidate-unreviewed") referencedCandidates.push(id);
  }
  if (referencedGenerated.length) {
    fail("production-plan does not grant generated-audio preview; use the existing authorized generation route and its separate --allow-generated-preview boundary");
  }
  if (!hasSelection && referencedCandidates.length) {
    return {
      candidateAssetIds: [],
      usedCandidateAssetIds: referencedCandidates,
      generatedAssetIds: referencedGenerated,
      usedAssetsById,
      assetIndexPath: indexPath,
      assetIndexSha256: await hashFile(indexPath),
      audioPlanPath,
    };
  }
  const extra = [...selectedIds].filter((id) => !referencedCandidates.includes(id));
  const missing = referencedCandidates.filter((id) => !selectedIds.has(id));
  if (extra.length || missing.length) {
    fail("plan.audioPreview.candidateAssetIds must exactly match candidate-unreviewed assets actually consumed by this audio plan; unconsumed/ready IDs: "
      + extra.join(", ") + "; undeclared candidates: " + missing.join(", "));
  }
  return {
    candidateAssetIds: [...selectedIds],
    usedCandidateAssetIds: referencedCandidates,
    generatedAssetIds: referencedGenerated,
    usedAssetsById,
    assetIndexPath: indexPath,
    assetIndexSha256: await hashFile(indexPath),
    audioPlanPath,
  };
}

function requireHttpSourceUrl(value, label) {
  const sourceUrl = text(value, label);
  let parsed;
  try { parsed = new URL(sourceUrl); } catch { fail(label + " must be a source-page URL"); }
  if (!new Set(["http:", "https:"]).has(parsed.protocol) || !parsed.hostname) fail(label + " must use http or https and identify a source page");
  return sourceUrl;
}

function validateSelectedSourceLocator(selection, label) {
  const sourceUrl = selection.sourceUrl == null ? null : requireHttpSourceUrl(selection.sourceUrl, label + ".sourceUrl");
  const sourceLocator = selection.sourceLocator == null ? null : text(selection.sourceLocator, label + ".sourceLocator");
  if (!sourceUrl && !sourceLocator) fail(label + " must identify the selected source by an HTTP(S) sourceUrl or an exact sourceLocator/provider reference");
  return { sourceUrl, sourceLocator };
}

function normalizedFontFamily(value) {
  return String(value).split(",").map((family) => family.trim().replace(/^['"]|['"]$/g, "").toLowerCase()).join(",");
}
function cssFontWeightNumber(value) {
  const token = String(value).trim().toLowerCase();
  if (token === "normal") return 400;
  if (token === "bold") return 700;
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) return null;
  const numeric = Number(token);
  return numeric >= 1 && numeric <= 1000 ? numeric : null;
}
function fontWeightDescriptorRange(value) {
  const parts = String(value).trim().split(/\s+/);
  if (parts.length < 1 || parts.length > 2) return null;
  const min = cssFontWeightNumber(parts[0]);
  const max = parts.length === 2 ? cssFontWeightNumber(parts[1]) : min;
  return min != null && max != null && min <= max ? { min, max } : null;
}
function fontWeightDescriptorSupports(actualWeight, descriptor) {
  const actual = cssFontWeightNumber(actualWeight);
  const range = fontWeightDescriptorRange(descriptor);
  return actual != null && range != null && actual >= range.min && actual <= range.max;
}
function fontWeightCheckSupports(checks, actualWeight) {
  const actual = cssFontWeightNumber(actualWeight);
  if (actual == null || !Array.isArray(checks) || checks.length === 0) return false;
  return checks.some((check) => check?.readyCheck === true && cssFontWeightNumber(check.weight) === actual);
}
function rendererNumber(value, label) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/i.test(value.trim())) return Number.parseFloat(value);
  fail(label + " is not a parsed numeric renderer value");
}
function collectLoadedFontRecords(value, result = [], segmentId = null) {
  if (Array.isArray(value)) {
    for (const row of value) collectLoadedFontRecords(row, result, segmentId);
  } else if (value && typeof value === "object") {
    const childSegmentId = typeof value.id === "string" && value.baseSource ? value.id : segmentId;
    if (typeof value.family === "string" && value.status === "loaded" && typeof value.sha256 === "string") {
      result.push({ ...value, ...(childSegmentId ? { segmentId: childSegmentId } : {}) });
    }
    for (const child of Object.values(value)) collectLoadedFontRecords(child, result, childSegmentId);
  }
  return result;
}

async function validateDirectorTextStyleProductionBinding({ design, plan, planDir, implementationPlan, shots, blueprint, filmInput, materialById, executionPhase }) {
  const styles = design.globalSettings.textStyles || [];
  if (!styles.length) return [];
  const implementationById = new Map(implementationPlan.map((row) => [row.id, row]));
  const shotById = new Map(shots.map((row) => [row.id, row]));
  const styleMaterialById = new Map(materialById);
  const colorById = new Map(design.globalSettings.colorRoles.map((row) => [row.id, row.value]));
  const manifestPath = plan.outputs?.filmManifest ? resolveFrom(planDir, plan.outputs.filmManifest, "plan.outputs.filmManifest") : null;
  let loadedFontRecords = [];
  if (manifestPath && executionPhase !== "pre-render") {
    try {
      const { value: manifest } = await readJson(manifestPath, "Film manifest for actual font/style evidence");
      loadedFontRecords = collectLoadedFontRecords(manifest);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const evidence = [];
  for (const style of styles) {
    const fontMaterial = style.fontMaterialId ? styleMaterialById.get(style.fontMaterialId) : null;
    const checks = [];
    for (const consumer of style.consumerMappings) {
      const implementation = implementationById.get(consumer.implementationPlanId);
      const shot = implementation ? shotById.get(implementation.id) : null;
      const mapping = shot?.sourceMappings.find((row) => row.id === consumer.mappingId);
      const segment = implementation ? blueprint.segments.find((row) => row.id === implementation.filmSegmentId) : null;
      if (!implementation || !shot || !mapping || !segment || shot.filmSegmentId !== implementation.filmSegmentId) {
        fail("font/style consumer " + style.id + "/" + consumer.mappingId + " does not resolve to the actual Film shot, mapping and segment");
      }
      const fieldMap = [
        ["fontFamilyField", style.fontFamily], ["fontWeightField", style.fontWeight],
        ["sizePxField", style.sizePx], ["colorField", colorById.get(style.colorRoleId)],
        ["lineHeightField", style.lineHeight], ["letterSpacingField", style.letterSpacing],
      ];
      const layerIndex = mapping.role === "layer" ? mapping.layerIndex : 0;
      for (const [fieldName, expected] of fieldMap) {
        const fieldPath = consumer[fieldName];
        if (!mapping.consumerFields.includes(fieldPath)) fail("font/style consumer " + style.id + " mapping " + mapping.id + " does not declare actual renderer field " + fieldPath);
        const actual = getFilmLayerField(segment, layerIndex, fieldPath);
        if (actual == null) fail("font/style consumer " + style.id + " actual renderer field " + fieldPath + " is absent from the Film segment");
        if (fieldName === "fontFamilyField") {
          if (normalizedFontFamily(actual) !== normalizedFontFamily(expected)) fail("font/style consumer " + style.id + " actual font family differs from the declared style");
        } else if (fieldName === "fontWeightField") {
          if (cssFontWeightNumber(actual) == null || cssFontWeightNumber(actual) !== cssFontWeightNumber(expected)) fail("font/style consumer " + style.id + " actual font weight differs from the declared style");
        } else if (fieldName === "colorField") {
          if (String(actual).trim().toLowerCase() !== String(expected).trim().toLowerCase()) fail("font/style consumer " + style.id + " actual color differs from its declared color role value");
        } else if (Math.abs(rendererNumber(actual, "font/style consumer " + fieldPath) - expected) > 1e-6) {
          fail("font/style consumer " + style.id + " actual renderer value for " + fieldPath + " differs from the declared numeric style");
        }
      }
      if (fontMaterial) {
        const fieldPath = consumer.fontFileField;
        if (!fieldPath || !mapping.consumerFields.includes(fieldPath)) fail("font/style consumer " + style.id + " must map its hash-verified font material through an actual Film consumer field");
        const actualFontPath = getFilmLayerField(segment, layerIndex, fieldPath);
        if (typeof actualFontPath !== "string") fail("font/style consumer " + style.id + " fontFileField must resolve to an actual file path");
        const resolvedFontPath = path.resolve(path.dirname(filmInput.file), actualFontPath);
        if (resolvedFontPath !== fontMaterial.file) fail("font/style consumer " + style.id + " renderer font file path differs from fontMaterialId bytes");
        checks.push({ implementationPlanId: implementation.id, mappingId: mapping.id, segmentId: segment.id, rendererFontFile: actualFontPath });
      }
      checks.push({ implementationPlanId: implementation.id, mappingId: mapping.id, consumerFields: fieldMap.map(([fieldName]) => consumer[fieldName]).concat(consumer.fontFileField ? [consumer.fontFileField] : []) });
    }
    const expectedLoads = fontMaterial ? checks.filter((row) => row.rendererFontFile).map((consumer) => ({
      ...consumer,
      record: loadedFontRecords.find((row) => row.segmentId === consumer.segmentId
        && normalizedFontFamily(row.family) === normalizedFontFamily(style.fontFamily)
        && row.file === consumer.rendererFontFile
        && fontWeightDescriptorSupports(style.fontWeight, row.weight)
        && fontWeightCheckSupports(row.weightChecks, style.fontWeight)
        && row.sha256.toLowerCase() === fontMaterial.sha256.toLowerCase()
        && row.producer === "@laohu/motion/core/fonts.useFonts" && row.readyCheck === true),
    })) : [];
    const loadRecords = expectedLoads.map((row) => row.record).filter(Boolean);
    const allConsumersLoaded = Boolean(fontMaterial) && expectedLoads.length > 0 && loadRecords.length === expectedLoads.length;
    evidence.push({
      styleId: style.id,
      fontMaterialId: style.fontMaterialId || null,
      consumerFieldValues: "PASS",
      rendererFontLoad: allConsumersLoaded ? "PASS" : "not-checked",
      loadReceipt: allConsumersLoaded ? loadRecords.map((row) => ({ segmentId: row.segmentId, family: row.family, file: row.file, weight: row.weight, weightChecks: row.weightChecks, sha256: row.sha256, status: row.status })) : null,
      consumers: checks,
    });
  }
  return evidence;
}

function validateAttentionModuleSource(source, {timeline, label, expectedActorIds}) {
  const runtime = resolveMotionRuntime({
    packages: ["@babel/parser"], projectRoot: repoRoot, skillRoot: skillDir, workRoot: repoRoot,
  });
  const parser = runtime.require("@babel/parser");
  let ast;
  try { ast = parser.parse(source, {sourceType: "unambiguous", plugins: ["typescript", "jsx"]}); }
  catch (error) { fail(label + " cannot be parsed to verify real attention consumer binding: " + error.message); }
  const imports = new Map();
  const jsx = [];
  const variableInitializers = new Map();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const child of node) visit(child); return; }
    if (node.type === "ImportDeclaration" && node.source?.value === "@laohu/motion") {
      for (const item of node.specifiers || []) {
        if (item.type === "ImportSpecifier") imports.set(item.local.name, item.imported?.name || item.imported?.value);
        else if (item.type === "ImportNamespaceSpecifier") imports.set(item.local.name, "*");
      }
    }
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier" && node.init) {
      variableInitializers.set(node.id.name, node.init);
    }
    if (node.type === "JSXOpeningElement") jsx.push(node);
    for (const [key, child] of Object.entries(node)) if (!new Set(["loc", "start", "end", "extra", "comments", "tokens"]).has(key)) visit(child);
  };
  visit(ast.program);
  const jsxName = (node) => node?.type === "JSXIdentifier" ? node.name
    : node?.type === "JSXMemberExpression" ? jsxName(node.object) + "." + jsxName(node.property) : "";
  const directPropsField = (node, property) => node?.type === "MemberExpression" && !node.computed
    && node.object?.type === "Identifier" && node.object.name === "props"
    && node.property?.type === "Identifier" && node.property.name === property;
  const unwrapExpression = (node) => node?.type === "JSXExpressionContainer" ? node.expression
    : node?.type === "TSAsExpression" || node?.type === "TSTypeAssertion" || node?.type === "ParenthesizedExpression" ? unwrapExpression(node.expression)
      : node;
  const staticString = (node, seen = new Set()) => {
    node = unwrapExpression(node);
    if (node?.type === "StringLiteral") return node.value;
    if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value?.cooked ?? node.quasis[0]?.value?.raw;
    if (node?.type === "Identifier" && !seen.has(node.name) && variableInitializers.has(node.name)) {
      const next = new Set(seen); next.add(node.name);
      return staticString(variableInitializers.get(node.name), next);
    }
    return null;
  };
  const staticRenderableNode = (node, seen = new Set()) => {
    node = unwrapExpression(node);
    if (node?.type === "JSXElement" || node?.type === "JSXFragment") return true;
    if (node?.type === "Identifier" && !seen.has(node.name) && variableInitializers.has(node.name)) {
      const next = new Set(seen); next.add(node.name);
      return staticRenderableNode(variableInitializers.get(node.name), next);
    }
    return false;
  };
  const propertyName = (node) => node?.type === "Identifier" ? node.name
    : node?.type === "StringLiteral" ? node.value : null;
  const actorIdsFromExpression = (node, seen = new Set()) => {
    node = unwrapExpression(node);
    if (node?.type === "Identifier" && !seen.has(node.name) && variableInitializers.has(node.name)) {
      const next = new Set(seen); next.add(node.name);
      return actorIdsFromExpression(variableInitializers.get(node.name), next);
    }
    if (node?.type !== "ArrayExpression") return null;
    const ids = [];
    for (const entry of node.elements) {
      if (entry?.type === "SpreadElement") {
        const spreadIds = actorIdsFromExpression(entry.argument, seen);
        if (!spreadIds) return null;
        ids.push(...spreadIds);
        continue;
      }
      if (entry?.type !== "ObjectExpression") return null;
      let idValue = null;
      let hasNode = false;
      for (const property of entry.properties) {
        if (property.type !== "ObjectProperty" || property.computed) continue;
        const key = propertyName(property.key);
        if (key === "id") idValue = staticString(property.value, seen);
        if (key === "node" && staticRenderableNode(property.value, seen)) hasNode = true;
      }
      if (!idValue || !hasNode) return null;
      ids.push(idValue);
    }
    return ids;
  };
  const attrs = (node) => new Map((node.attributes || []).filter((row) => row.type === "JSXAttribute").map((row) => [row.name.name, row.value?.expression ?? row.value]));
  const bridge = jsx.find((node) => ["Core.AttentionBridge", "AttentionBridge"].includes(jsxName(node.name)));
  if (!imports.has("Core") || !bridge || ![...imports.values()].includes("*") && imports.get("Core") !== "Core") {
    fail(label + " must import and invoke the registered @laohu/motion Core.AttentionBridge runtime consumer");
  }
  const bridgeAttrs = attrs(bridge);
  if (!bridgeAttrs.has("actors") || !directPropsField(bridgeAttrs.get("phases"), "attentionPhases")
      || !directPropsField(bridgeAttrs.get("globalFromSeconds"), "attentionGlobalFromSeconds")) {
    fail(label + " must pass the exact props.attentionPhases and props.attentionGlobalFromSeconds fields to AttentionBridge");
  }
  const moduleActorIds = actorIdsFromExpression(bridgeAttrs.get("actors"));
  const compiledActorIds = [...new Set(expectedActorIds || [])].sort();
  if (!moduleActorIds || new Set(moduleActorIds).size !== moduleActorIds.length
      || canonicalJson([...moduleActorIds].sort()) !== canonicalJson(compiledActorIds)) {
    fail(label + " actors must be a statically verifiable list of actual work-local actor ids and nodes, exactly matching the compiled attention schedule");
  }
  if (timeline) {
    const captions = jsx.find((node) => ["Core.Captions", "Captions"].includes(jsxName(node.name)));
    if (!captions || ![...imports.values()].some((name) => name === "*" || name === "Captions" || name === "Core")) {
      fail(label + " must use the registered Captions consumer for its verified timeline manifest");
    }
    const captionAttrs = attrs(captions);
    if (!directPropsField(captionAttrs.get("manifest"), "captionManifest")
        || !directPropsField(captionAttrs.get("style"), "captionStyle")
        || !directPropsField(captionAttrs.get("globalFromSeconds"), "attentionGlobalFromSeconds")) {
      fail(label + " must pass the exact captionManifest, measured captionStyle, and matching global-time offset to Captions");
    }
  }
  return {sourceSha256: sha256(Buffer.from(source, "utf8")), attentionBridge: true, captions: timeline};
}

async function validateAttentionFilmConsumerBinding({plan, planDir, implementationPlan, shots, blueprint, filmInput, asrcutTimeline,
  attentionRuntimePhases, captionManifest, captionStyleRuntime}) {
  if (!isFormalV4OrV5(plan) || plan.directorDesign?.format !== "laohu.motion.director-design/3") return null;
  const timeline = plan.directorDesign.narration.mode === "timeline";
  if (!Array.isArray(attentionRuntimePhases) || !attentionRuntimePhases.length) fail("production-plan/4 or /5 has no compiled attention phase schedule to bind");
  if (timeline && (!captionManifest || !captionStyleRuntime)) fail("timeline production-plan/4 or /5 has no verified caption manifest and measured caption style to bind");
  const implementationById = new Map(implementationPlan.map((row) => [row.id, row]));
  const shotById = new Map(shots.map((row) => [row.id, row]));
  const rows = [];
  const runtime = resolveMotionRuntime({
    packages: ["@babel/parser", "react", "react-dom", "remotion"],
    expectedVersions: {react: "19.2.7", "react-dom": "19.2.7", remotion: "4.0.537"},
    projectRoot: repoRoot, skillRoot: skillDir, workRoot: repoRoot,
  });
  const segmentTiming = (segment) => {
    if (blueprint.clock?.kind !== "asrcut-v2") {
      if (typeof segment.startSec !== "number" || !Number.isFinite(segment.startSec) || segment.startSec < 0
          || typeof segment.endSec !== "number" || !Number.isFinite(segment.endSec) || segment.endSec <= segment.startSec) {
        fail("project-shot segment needs a valid Film-global startSec/endSec range");
      }
      return {startSec: segment.startSec, endSec: segment.endSec};
    }
    if (!asrcutTimeline || asrcutTimeline.format !== "laohu.asrcut.timeline/2" || asrcutTimeline.state !== "frozen") {
      fail("asrcut-v2 attention binding requires its exact frozen timeline/2");
    }
    const unitIds = array(segment.unitIds, "asrcut-v2 project-shot segment.unitIds");
    const units = unitIds.map((id) => {
      const unit = asrcutTimeline.units.find((row) => row.occurrenceId === id || row.id === id);
      if (!unit) fail("asrcut-v2 project-shot segment references a missing canonical timeline unit " + id);
      return unit;
    });
    const first = units[0]?.targetRange;
    const last = units.at(-1)?.targetRange;
    if (!first || !last || !Number.isSafeInteger(first.startSample) || !Number.isSafeInteger(last.endSample)
        || !Number.isSafeInteger(first.sampleRateHz) || first.sampleRateHz <= 0) {
      fail("asrcut-v2 project-shot segment needs canonical sample ranges from its timeline units");
    }
    for (let index = 0; index < units.length; index += 1) {
      const range = units[index].targetRange;
      if (!range || range.sampleRateHz !== first.sampleRateHz || !Number.isSafeInteger(range.startSample) || !Number.isSafeInteger(range.endSample)
          || range.endSample <= range.startSample || (index > 0 && units[index - 1].targetRange.endSample !== range.startSample)) {
        fail("asrcut-v2 project-shot segment units must be valid, contiguous ranges on one canonical sample clock");
      }
    }
    return {startSec: first.startSample / first.sampleRateHz, endSec: last.endSample / first.sampleRateHz};
  };
  for (const implementation of implementationPlan) {
    if (implementation.resourceType !== "renderer-route" || implementation.resourceId !== PROJECT_SHOT_ROUTE_ID || implementation.renderer !== "laohu-project-shot") {
      fail("production-plan/4 or /5 attention consumer must use the registered laohu-project-shot route for every formal implementation");
    }
    const shot = shotById.get(implementation.id);
    const segment = blueprint.segments.find((row) => row.id === implementation.filmSegmentId);
    const mapping = shot?.sourceMappings.find((row) => row.id === implementation.mappingId);
    if (!shot || !segment || !mapping || mapping.role !== "base" || mapping.resourceType !== "project-shot" || mapping.resourceId !== segment.modulePath
        || segment.renderer !== "laohu-project-shot" || shot.filmSegmentId !== segment.id) {
      fail("production-plan/4 or /5 attention implementation must map to its exact Film /2 project-shot module segment");
    }
    const timing = segmentTiming(segment);
    const requiredFields = ["props.attentionPhases", "props.attentionGlobalFromSeconds", ...(timeline ? ["props.captionManifest", "props.captionStyle"] : [])];
    for (const field of requiredFields) if (!implementation.consumerFields.includes(field) || !mapping.consumerFields.includes(field)) {
      fail("actual Film sourceMapping and implementationPlan must both declare " + field + " for the registered project-shot consumer");
    }
    const perSegmentPhases = [];
    for (const phase of attentionRuntimePhases) {
      if (!implementation.viewingUnitIds.includes(phase.viewingUnitId) || !phase.consumerImplementationIds.includes(implementation.id)) continue;
      const actorBindings = phase.actorBindings.filter((binding) => binding.consumerRefs.some((ref) => ref.implementationPlanId === implementation.id));
      const targetIds = actorBindings.filter((binding) => binding.role === "target").map((binding) => binding.actorId);
      if (!targetIds.length) continue;
      if (phase.end <= timing.startSec || phase.start >= timing.endSec) fail("attention phase consumer mapping targets a Film segment outside the phase's canonical time window");
      perSegmentPhases.push({
        id: phase.id, viewingUnitId: phase.viewingUnitId, start: phase.start, end: phase.end,
        mainTask: {...structuredClone(phase.mainTask), actorIds: phase.mainTask.actorIds.filter((id) => targetIds.includes(id))},
        cameraKeys: structuredClone(phase.cameraKeys), readingZones: structuredClone(phase.readingZones), readWindows: structuredClone(phase.readWindows),
        actorBindings: actorBindings.map(({consumerRefs, ...binding}) => structuredClone(binding)),
      });
    }
    if (!perSegmentPhases.length) fail("each production-plan/4 or /5 Film segment must consume its own actual main-task attention phase rows");
    const props = segment.props || {};
    if (canonicalJson(props.attentionPhases) !== canonicalJson(perSegmentPhases)) fail("Film props.attentionPhases must equal the compiled attention schedule filtered to this exact segment and mapping");
    if (props.attentionGlobalFromSeconds !== timing.startSec) fail("Film props.attentionGlobalFromSeconds must equal the actual canonical Film segment start time to resolve local playback time");
    if (timeline && (canonicalJson(props.captionManifest) !== canonicalJson(captionManifest) || canonicalJson(props.captionStyle) !== canonicalJson(captionStyleRuntime))) {
      fail("Film props.captionManifest/captionStyle must equal the exact verified manifest and resolved D3 caption style");
    }
    const inspected = await resolveProjectShotModule({segment, blueprintPath: filmInput.file, runtimeNodeModules: runtime.nodeModules, skillRoot: skillDir});
    const moduleBytes = await fs.readFile(inspected.module.absolutePath);
    const expectedActorIds = [...new Set(perSegmentPhases.flatMap((phase) => phase.actorBindings.map((binding) => binding.actorId)))];
    const moduleUsage = validateAttentionModuleSource(moduleBytes.toString("utf8"), {timeline, label: "project-shot module " + segment.id, expectedActorIds});
    rows.push({implementationPlanId: implementation.id, mappingId: mapping.id, segmentId: segment.id,
      attentionPhaseIds: perSegmentPhases.map((phase) => phase.id), globalFromSeconds: segment.startSec,
      captionManifestSha256: timeline ? sha256(Buffer.from(canonicalJson(captionManifest), "utf8")) : null,
      captionStyleSha256: timeline ? sha256(Buffer.from(canonicalJson(captionStyleRuntime), "utf8")) : null,
      moduleSha256: inspected.module.sha256, moduleUsage});
  }
  rows.sort((a, b) => a.segmentId.localeCompare(b.segmentId) || a.mappingId.localeCompare(b.mappingId));
  return {format: "laohu.motion.attention-film-binding/1", rows,
    identitySha256: sha256(Buffer.from(canonicalJson(rows), "utf8"))};
}

async function validateDirectorDesignProductionBinding({
  plan, planDir, units, implementationPlan, shots, materialById, audioPlan, audioPreview,
  audioInput, blueprint, filmInput, asrcutTimeline, executionPhase, attentionRuntimePhases, captionManifest, captionStyleRuntime, attentionConsumerBinding,
}) {
  if (plan.format !== PLAN_FORMAT_V3 && !isFormalV4OrV5(plan)) return {
    boundDirectorDesignIdentitySha256: null,
    boundFilmDesignIdentitySha256: null,
    timingIdentitySha256: null,
    selectedAudioUses: [],
    synchronizedAudioUses: [],
    fontEvidence: [],
  };
  const design = plan.directorDesign;
  const designUnits = new Map(design.units.map((unit) => [unit.viewingUnitId, unit]));
  const implementations = new Map(implementationPlan.map((row) => [row.id, row]));
  const shotById = new Map(shots.map((shot) => [shot.id, shot]));
  const eventById = new Map((audioPlan.events || []).map((event) => [event.id, event]));
  const trackById = new Map((audioPlan.tracks || []).map((track) => [track.id, track]));
  const directorV2 = new Set(["laohu.motion.director-design/2", "laohu.motion.director-design/3"]).has(design.format);
  const designedVoiceTrackIds = new Set();
  const designedEventIds = new Set();
  const designedTrackIds = new Set();
  const fontEvidence = directorV2
    ? await validateDirectorTextStyleProductionBinding({ design, plan, planDir, implementationPlan, shots, blueprint, filmInput, materialById, executionPhase })
    : [];

  for (const unit of units) {
    const designUnit = designUnits.get(unit.id);
    const associatedShots = shots.filter((shot) => shot.viewingUnitIds.includes(unit.id));
    if (directorV2) {
      const actualTextById = new Map();
      for (const item of associatedShots.flatMap((shot) => shot.screenText || [])) {
        const prior = actualTextById.get(item.id);
        if (prior && (prior.text !== item.text || prior.role !== item.role)) fail("actual Film screen text ID " + item.id + " changes value/role across shots in viewingUnit " + unit.id);
        actualTextById.set(item.id, { text: item.text, role: item.role });
      }
      const plannedTextById = new Map();
      for (const cue of designUnit.scriptCues || []) {
        for (const item of cue.screenText.mode === "planned" ? cue.screenText.items : []) {
          const prior = plannedTextById.get(item.id);
          if (prior && (prior.text !== item.text || prior.role !== item.role || prior.styleId !== item.styleId)) {
            fail("director screen text ID " + item.id + " changes its displayed value, role, or style within viewingUnit " + unit.id);
          }
          plannedTextById.set(item.id, item);
        }
      }
      if (actualTextById.size !== plannedTextById.size || [...actualTextById].some(([id, item]) => {
        const planned = plannedTextById.get(id);
        return !planned || planned.text !== item.text || planned.role !== item.role;
      })) fail("director scriptCues screenText items must match exact text, role, and IDs consumed by Film for viewingUnit " + unit.id);
    } else {
      const actualTextIds = new Set(associatedShots.flatMap((shot) => (shot.screenText || []).map((row) => row.id)));
      const plannedTextIds = new Set(designUnit.screenTextIds);
      if (actualTextIds.size !== plannedTextIds.size || [...actualTextIds].some((id) => !plannedTextIds.has(id))) {
        fail("director design screenTextIds must match the actual screen text consumers for viewingUnit " + unit.id);
      }
    }
    for (const action of designUnit.actions) {
      for (const implementationId of action.implementationPlanIds) {
        const row = implementations.get(implementationId);
        const shot = row ? shotById.get(row.id) : null;
        if (!row || !shot || !shot.viewingUnitIds.includes(unit.id)) {
          fail("director action " + action.id + " is not linked to a production shot in its real Film segment/mapping");
        }
        if (!shot.sourceMappings.some((mapping) => mapping.id === row.mappingId && mapping.segmentId === row.filmSegmentId)) {
          fail("director action " + action.id + " points to an implementationPlan row that has no matching actual Film source mapping");
        }
      }
    }
    const sound = designUnit.sound;
    if (directorV2) {
      for (const id of sound.voiceTrackIds) {
        const track = trackById.get(id);
        if (!track || track.bus !== "voice") fail("director voiceTrackIds must resolve to actual audio-plan voice-bus tracks: " + id);
        designedVoiceTrackIds.add(id);
      }
      for (const id of sound.trackIds) {
        const track = trackById.get(id);
        if (!track || track.bus !== "music") fail("director trackIds must resolve to actual audio-plan music-bus tracks: " + id);
        designedTrackIds.add(id);
      }
      for (const id of sound.eventIds) {
        if (!eventById.has(id)) fail("director sound design references audio event not consumed by audio-plan: " + id);
        designedEventIds.add(id);
      }
    }
    for (const id of sound.eventIds) if (!eventById.has(id)) fail("director sound design references audio event not consumed by audio-plan: " + id);
    for (const id of sound.trackIds) if (!trackById.has(id)) fail("director sound design references audio track not consumed by audio-plan: " + id);
  }

  if (directorV2) {
    const narrationMode = design.narration.mode;
    const actualVoiceTrackIds = new Set((audioPlan.tracks || []).filter((track) => track.bus === "voice").map((track) => track.id));
    const actualTrackIds = new Set((audioPlan.tracks || []).filter((track) => track.bus === "music").map((track) => track.id));
    const actualEventIds = new Set((audioPlan.events || []).map((event) => event.id));
    const sameSet = (left, right) => left.size === right.size && [...left].every((id) => right.has(id));
    if (!sameSet(designedVoiceTrackIds, actualVoiceTrackIds)) fail("director design voiceTrackIds must exactly cover the actual audio-plan voice tracks; update the design when the selected voice consumer changes");
    if (!sameSet(designedTrackIds, actualTrackIds)) fail("director design trackIds must exactly cover the actual audio-plan music tracks; a selected track missing from design is not a completed sound plan");
    if (!sameSet(designedEventIds, actualEventIds)) fail("director design eventIds must exactly cover the actual audio-plan events; a selected event missing from design is not a completed sound plan");
    if (narrationMode === "timeline" && actualVoiceTrackIds.size === 0) fail("timeline narration coverage has no actual audio-plan voice track; formal production cannot drop its spoken source");
    if (narrationMode !== "timeline" && (actualVoiceTrackIds.size || (audioPlan.voiceWindows || []).length)) {
      fail("script-only/none narration conflicts with an actual voice track or voice window; bind the recorded source through the canonical timeline");
    }
  }

  for (const task of design.resourceTasks || []) {
    if (task.status === "pending") fail("production cannot claim a ready work while director-design acquisition task is pending: " + task.id);
    const acquisition = task.acquisition;
    const rightsReview = acquisition.rightsReview;
    const rightsEvidenceMaterial = materialById.get(rightsReview.evidenceMaterialId);
    if (!rightsEvidenceMaterial) fail("resource task " + task.id + " rights review must point to a real, hash-verified source-evidence material");
    if (rightsReview.finishedWorkSync !== "allowed") {
      fail("resource task " + task.id + " has not established permission to synchronize this selected source into the finished work; source-file redistribution is a separate record");
    }
    if (task.selection.kind === "material") {
      const material = materialById.get(task.selection.materialId);
      if (!material || material.sha256 !== acquisition.actualSha256.toLowerCase()) {
        fail("resource task " + task.id + " acquired material ID/hash does not match the exact plan input bytes");
      }
      validateSelectedSourceLocator(task.selection, "resource task " + task.id + " selection");
      if (rightsReview.sourceDistribution === "unknown") {
        fail("resource task " + task.id + " must distinguish known source-file redistribution status from the finished-work synchronization permission");
      }
      for (const target of task.consumerTargets) {
        if (target.kind !== "film-mapping") fail("material acquisition task " + task.id + " must target actual Film mappings");
        const row = implementations.get(target.implementationPlanId);
        const shot = row ? shotById.get(row.id) : null;
        const mapping = shot?.sourceMappings.find((item) => item.id === row.mappingId);
        if (!row || !mapping || mapping.resourceType !== "material" || mapping.resourceId !== task.selection.materialId) {
          fail("resource task " + task.id + " acquired material is not the exact material consumed by its Film mapping");
        }
      }
    } else if (task.selection.kind === "audio") {
      validateSelectedSourceLocator(task.selection, "resource task " + task.id + " selection");
      const resolved = audioPreview.usedAssetsById.get(task.selection.assetId);
      if (!resolved || resolved.sha256 !== acquisition.actualSha256.toLowerCase()) {
        fail("resource task " + task.id + " acquired audio asset/hash is not the exact actual audio-plan file consumed by the renderer");
      }
      const source = resolved.asset.source || {};
      const actualSourceUrl = source.page || source.url || source.sourceUrl;
      const sourceMatches = task.selection.sourceUrl
        ? actualSourceUrl === task.selection.sourceUrl
        : task.selection.sourceLocator === "audio-index:" + task.selection.assetId;
      if (!sourceMatches || resolved.asset.license !== task.selection.license) {
        fail("resource task " + task.id + " selected source URL/license differs from the real audio-plan/index asset record");
      }
      const redistribution = resolved.asset.redistribution || {};
      const expectedSourceDistribution = redistribution.status === "redistributable" ? "allowed"
        : redistribution.status === "project-generated" ? "not-applicable"
          : new Set(["sync-only", "not-authorized-for-redistribution"]).has(redistribution.status) ? "restricted" : "unknown";
      const syncAllowed = redistribution.status === "redistributable" || redistribution.status === "sync-only"
        || (redistribution.status === "not-authorized-for-redistribution" && redistribution.syncUse === "allowed")
        || redistribution.status === "project-generated";
      if (rightsReview.sourceDistribution !== expectedSourceDistribution || !syncAllowed || rightsReview.finishedWorkSync !== "allowed") {
        fail("resource task " + task.id + " rights review differs from the audio asset's registered redistribution and finished-work synchronization boundaries");
      }
      const registeredEvidencePath = source.licenseEvidenceFile
        ? path.resolve(repoRoot, source.licenseEvidenceFile)
        : redistribution.licenseTextFile && resolved.indexed
          ? path.resolve(path.dirname(audioPreview.assetIndexPath), redistribution.licenseTextFile)
          : null;
      if (registeredEvidencePath) {
        if (!isWithin(repoRoot, registeredEvidencePath)) fail("resource task " + task.id + " registered license evidence escapes the project");
        const evidenceHash = await hashFile(registeredEvidencePath).catch((error) => fail("resource task " + task.id + " registered license evidence cannot be read: " + error.message));
        const expectedEvidenceHash = source.licenseEvidenceSha256 || null;
        if (expectedEvidenceHash && evidenceHash !== expectedEvidenceHash.toLowerCase()) {
          fail("resource task " + task.id + " registered source license-evidence hash differs from the asset-index record");
        }
        if (rightsEvidenceMaterial.file !== registeredEvidencePath || rightsEvidenceMaterial.sha256 !== evidenceHash) {
          fail("resource task " + task.id + " rights evidence material must be the exact registered license/source-evidence file consumed by the asset record");
        }
      } else if (typeof redistribution.basis !== "string" || !redistribution.basis.trim()) {
        fail("resource task " + task.id + " audio index has no source basis for its rights boundary");
      }
      for (const target of task.consumerTargets) {
        let consumer;
        if (target.kind === "audio-event") consumer = eventById.get(target.id);
        else if (target.kind === "audio-track") consumer = trackById.get(target.id);
        else fail("audio acquisition task " + task.id + " must target actual audio events or tracks");
        if (!consumer || consumer.assetId !== task.selection.assetId) fail("resource task " + task.id + " acquired asset is not the assetId used by its exact audio event/track");
      }
    }
  }

  const selectedAudioUses = [];
  const selectedEventIds = new Set(design.units.flatMap((unit) => unit.sound.eventIds));
  const selectedTrackIds = new Set(design.units.flatMap((unit) => unit.sound.trackIds));
  for (const id of selectedEventIds) {
    const event = eventById.get(id);
    selectedAudioUses.push({ kind: "event", id, assetId: event.assetId, bus: event.bus,
      offsetSec: event.offsetSec ?? null, filmTimeSec: event.filmTimeSec ?? null, timeMapId: event.timeMapId ?? null,
      speed: event.speed ?? null, sourceInSec: event.sourceInSec ?? null, sourceOutSec: event.sourceOutSec ?? null });
  }
  for (const id of selectedTrackIds) {
    const track = trackById.get(id);
    selectedAudioUses.push({ kind: "track", id, assetId: track.assetId, bus: track.bus,
      startSec: track.startSec, timeMapId: track.timeMapId ?? null, speed: track.speed ?? null,
      sourceInSec: track.sourceInSec ?? null, sourceOutSec: track.sourceOutSec ?? null, loop: track.loop ?? false });
  }
  const synchronizedAudioUses = [];
  for (const designUnit of design.units) {
    for (const cue of designUnit.sound.syncCues || []) {
      const consumer = cue.kind === "audio-event" ? eventById.get(cue.id) : trackById.get(cue.id);
      if (!consumer) fail("director synchronized sound cue does not resolve to the exact actual audio-plan consumer " + cue.kind + ":" + cue.id);
      const action = designUnit.actions.find((row) => row.id === cue.actionId);
      if (!action || action.phase !== cue.phase) fail("director synchronized sound cue must remain bound to its real action phase " + cue.actionId);
      const timeMap = consumer.timeMapId
        ? (audioPlan.timeMaps || []).find((row) => row.id === consumer.timeMapId)
        : null;
      if (consumer.timeMapId && !timeMap) fail("synchronized audio cue references a missing audio-plan time map " + consumer.timeMapId);
      synchronizedAudioUses.push({
        viewingUnitId: designUnit.viewingUnitId,
        kind: cue.kind,
        id: cue.id,
        actionId: cue.actionId,
        phase: cue.phase,
        relationship: cue.relationship,
        assetId: consumer.assetId,
        bus: consumer.bus,
        startSec: cue.kind === "audio-event" ? (consumer.filmTimeSec ?? consumer.offsetSec ?? null) : consumer.startSec,
        timeMapId: consumer.timeMapId ?? null,
        timeMap: timeMap ? {
          id: timeMap.id,
          localStartSec: timeMap.localStartSec ?? null,
          localEndSec: timeMap.localEndSec ?? null,
          filmStartSec: timeMap.filmStartSec ?? null,
          speed: timeMap.speed ?? null,
        } : null,
        speed: consumer.speed ?? null,
        sourceInSec: consumer.sourceInSec ?? null,
        sourceOutSec: consumer.sourceOutSec ?? null,
        loop: cue.kind === "audio-track" ? (consumer.loop ?? false) : null,
      });
    }
  }
  synchronizedAudioUses.sort((a, b) => a.viewingUnitId.localeCompare(b.viewingUnitId)
    || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const filmCoupledAudioUses = synchronizedAudioUses.map(({ viewingUnitId, kind, id, actionId, phase, relationship,
    assetId, startSec, timeMapId, timeMap, speed, sourceInSec, sourceOutSec, loop }) => ({
    viewingUnitId, kind, id, actionId, phase, relationship, assetId, startSec,
    timeMapId, timeMap, speed, sourceInSec, sourceOutSec, loop,
  }));
  const boundDirectorDesignIdentitySha256 = sha256(Buffer.from(canonicalJson({
    designIdentity: directorDesignIdentity(design),
    selectedAudioUses: selectedAudioUses.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
    attentionConsumerBindingIdentitySha256: attentionConsumerBinding?.identitySha256 ?? null,
  }), "utf8"));
  const boundFilmDesignIdentitySha256 = sha256(Buffer.from(canonicalJson({
    filmDesignIdentity: filmDesignIdentity(design),
    synchronizedAudioUses: filmCoupledAudioUses,
  }), "utf8"));
  const timingIdentitySha256 = sha256(Buffer.from(canonicalJson({
    asrcut: asrcutTimeline ? asrcutTimingProjection(asrcutTimeline) : null,
    film: { fps: blueprint.fps, durationSec: blueprint.clock?.durationSec ?? blueprint.durationSec ?? null,
      segments: blueprint.segments.map(({ id, startSec, endSec }) => ({ id, startSec, endSec })) },
    synchronizedAudio: synchronizedAudioUses.map(({ viewingUnitId, kind, id, actionId, phase, startSec, timeMapId, timeMap, speed, sourceInSec, sourceOutSec, loop }) => ({
      viewingUnitId, kind, id, actionId, phase, startSec, timeMapId, timeMap, speed, sourceInSec, sourceOutSec, loop,
    })),
    attentionConsumerBindingIdentitySha256: attentionConsumerBinding?.identitySha256 ?? null,
  }), "utf8"));
  return { boundDirectorDesignIdentitySha256, boundFilmDesignIdentitySha256, timingIdentitySha256, selectedAudioUses, synchronizedAudioUses, fontEvidence,
    boundAttentionConsumerIdentitySha256: attentionConsumerBinding?.identitySha256 ?? null };
}

function asrcutTimingProjection(timeline) {
  const range = (value) => value == null ? null : {
    startSample: value.startSample, endSample: value.endSample, sampleRateHz: value.sampleRateHz,
  };
  return {
    format: timeline.format,
    clock: { sampleRateHz: timeline.clock?.sampleRateHz ?? null, unit: timeline.clock?.unit ?? null },
    durationSamples: timeline.durationSamples ?? null,
    clips: (timeline.clips || []).map((clip) => ({
      occurrenceId: clip.occurrenceId, sourceId: clip.sourceId, coverageId: clip.coverageId,
      sourceRange: range(clip.sourceRange), targetRange: range(clip.targetRange), timingPrecision: clip.timingPrecision,
      words: (clip.words || []).map((word) => ({ id: word.id, sourceRange: range(word.sourceRange), targetRange: range(word.targetRange) })),
      transcriptSegments: (clip.transcriptSegments || []).map((segment) => ({
        segmentId: segment.segmentId, sourceRange: range(segment.sourceRange), targetRange: range(segment.targetRange), timingPrecision: segment.timingPrecision,
      })),
    })),
  };
}

function getFilmLayerField(segment, layerIndex, fieldPath) {
  const parts = fieldPath.split(".");
  if (parts[0] === "layers") {
    if (Number(parts[1]) !== layerIndex) return undefined;
    if (Array.isArray(segment.layers)) return getPath(segment, fieldPath);
    if (layerIndex !== 0 || !segment.sourceCatalogId) return undefined;
    const rest = parts.slice(2);
    if (rest[0] === "catalogId") return segment.sourceCatalogId;
    if (rest[0] === "props") return getPath({ props: segment.props || {} }, rest.join("."));
    return undefined;
  }
  if (layerIndex !== 0) return undefined;
  return getPath(segment, fieldPath);
}

async function assertFresh(file, label) {
  try { await fs.access(file); fail(label + " already exists; choose a new output path so this run cannot replace a prior artifact: " + file); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
async function ensureOutputParents(outputs) {
  for (const file of Object.values(outputs)) await fs.mkdir(path.dirname(file), { recursive: true });
}
function relativeOutputPaths(validated) {
  return Object.fromEntries(Object.entries(validated.outputs).map(([key, value]) => [key, resolveFrom(validated.planDir, value, "plan.outputs." + key)]));
}
function safeName(value) { return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "work"; }
function makeRunId() { return new Date().toISOString().replace(/[:.]/g, "-") + "-" + process.pid; }
async function findDevice(file) {
  let current = file;
  while (true) {
    try { return (await fs.stat(current)).dev; }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}
async function createRunContext(args, validated) {
  const workRoot = args.workRoot;
  const workStat = await fs.stat(workRoot).catch((error) => fail("--work-root is unavailable: " + error.message));
  if (!workStat.isDirectory()) fail("--work-root must be an existing project directory");
  const cacheRoot = path.join(workRoot, ".cache");
  const tempRoot = path.join(cacheRoot, "tmp", "laohu-motion", "production-plan", safeName(validated.plan.work.id));
  const validationRoot = path.join(cacheRoot, "validation", "laohu-motion", "production-plan", safeName(validated.plan.work.id));
  for (const target of [tempRoot, validationRoot]) {
    const device = await findDevice(target);
    if (device !== workStat.dev) fail("production-plan temporary and validation data must stay on the same volume under the selected project's .cache");
    if (target.startsWith("/tmp/") || target.startsWith("/private/tmp/")) fail("production-plan may not use system temporary storage");
  }
  await fs.mkdir(tempRoot, { recursive: true });
  await fs.mkdir(validationRoot, { recursive: true });
  const outputs = relativeOutputPaths(validated);
  for (const [key, file] of Object.entries(outputs)) {
    if (await findDevice(file) !== workStat.dev) fail("output " + key + " is not on the selected project's work volume: " + file);
  }
  const defaultReceipt = path.join(validationRoot, "run-" + makeRunId() + ".json");
  const receiptPath = args.receipt || defaultReceipt;
  if (await findDevice(receiptPath) !== workStat.dev) fail("run receipt must be on the selected project's work volume");
  await fs.mkdir(path.dirname(receiptPath), { recursive: true });
  await assertFresh(receiptPath, "production-plan run receipt");
  const env = {
    ...process.env,
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    MOTION_TEMPLATE_CACHE_DIR: path.join(tempRoot, "template-cache"),
  };
  if (args.ffmpeg) env.MOTION_FFMPEG = args.ffmpeg;
  if (args.browser) env.MOTION_BROWSER = args.browser;
  return { workRoot, cacheRoot, tempRoot, validationRoot, receiptPath, outputs, env };
}

function redoReason(stage, error) {
  if (stage === "technical-probe-boundary") {
    return "这是有意设置的流程边界。不要重复无改运行，也不要伪改 directionMode。单独检查组件/renderer 时，直接调用对应底层 preview/render 入口，并将媒体和收据保留为技术证据；要继续普通制作时，先按真实依据完成 new-direction 的全库阅读与 consumer 映射、locked-local 的可定位用户决定，或 evidence-local 的既有验证方向引用，再从 direction 校验进入 production。";
  }
  if (stage === "plan-preflight") return "先修复 production-plan 的具体结构、引用/hash 或 consumer 映射错误；重新运行 validate，再继续生产。";
  if (stage === "film-render") return "按 Film/renderer 报错修复本段源组件、输入或运行依赖；保留已生成文件，确认输出路径空闲后重跑 render-film。不要自动改选 source-only 或重画源实现。";
  if (stage === "film-receipt") return "补齐 Film manifest、底片哈希或原生 consumer 回执；根据实际映射检查缺失的源字段/段落，再决定是否重渲。";
  if (stage === "audio-render") return "按 audio.mjs 返回原因修复音轨素材、时间映射、共享事件或计划；Film 已完成则保留它，复验后单独重跑 render-audio。不要改写 ASR/Film 时间或覆盖锁定音轨。";
  if (stage === "audio-receipt") return "复验 audio.mjs manifest、WAV 与最终 mux 的实际哈希/时长；仅重做未通过的声音阶段。";
  return "定位失败阶段的实际输入或 receipt，再用 render-film / render-audio 的既有入口重做该阶段。";
}

function registeredTemplateSource(resources, templateId, label) {
  const entry = resourceRow(resources, "template", templateId);
  const source = (resources.ledger.sources || []).find((item) => item.id === entry.sourceId);
  const sourceFile = source?.files?.find((item) => item.path === entry.sourcePath);
  if (!source || !sourceFile) fail(label + " is missing its exact catalog-pinned source file");
  return { entry, source, sourceFile };
}

async function readFilmV1ChildReceipt({ validated, manifestPath, row, segment, segmentOutputPath, segmentOutputSha256 }) {
  const childReceiptPath = resolveFrom(path.dirname(manifestPath), row.receiptPath, "Film /1 segment " + segment.id + " child receipt path");
  const { value: receipt, bytes: receiptBytes } = await readJson(childReceiptPath, "Film /1 segment " + segment.id + " renderer receipt");
  let outputPathValue;
  let outputSha256;
  let inputEvidence;
  let sourceEvidence;
  let consumedInputs;

  if (segment.renderer === "huashu-motion-template") {
    if (receipt.kind !== "native-template-render-evidence") fail("Film /1 native clip segment " + segment.id + " child receipt must use native-template-render-evidence");
    const { entry, source, sourceFile } = registeredTemplateSource(validated.resources, segment.templateId, "Film /1 native clip segment " + segment.id);
    const sourceVerification = receipt.sourceRuntime?.sourceVerification;
    if (receipt.templateId !== entry.id || receipt.grammar !== entry.grammar
        || receipt.source?.id !== source.id || receipt.source?.commit !== source.commit || receipt.source?.sourcePath !== entry.sourcePath
        || sourceVerification?.ok !== true || sourceVerification.sourceId !== source.id || sourceVerification.sourceCommit !== source.commit
        || (receipt.sourceRuntime?.servedPinMismatches || []).length !== 0) {
      fail("Film /1 native clip child receipt source identity/verification differs from the registered source for " + segment.id);
    }
    const checkedSource = (sourceVerification.files || []).find((item) => item.sourcePath === entry.sourcePath);
    if (!checkedSource || checkedSource.sourceSha256 !== sourceFile.sha256 || checkedSource.sha256 !== sourceFile.sha256) {
      fail("Film /1 native clip child receipt does not prove the exact registered source file hash for " + segment.id);
    }
    const specPath = resolveFrom(path.dirname(childReceiptPath), receipt.spec?.path, "Film /1 native clip segment " + segment.id + " consumed spec path");
    const specHash = await hashFile(specPath);
    if (specHash !== receipt.spec?.sha256) fail("Film /1 native clip child receipt spec hash differs from its actual input file: " + segment.id);
    const { value: actualSpec } = await readJson(specPath, "Film /1 native clip segment " + segment.id + " consumed spec");
    const adapter = await import(pathToFileURL(path.join(skillDir, "templates", "adapters", "laohu-film.mjs")).href);
    const durationSec = Number(row.sourceRange?.endSec) - Number(row.sourceRange?.startSec);
    const expectedSpec = adapter.buildNativeClipFilmSpec(segment, durationSec, validated.resources.catalog, {
      headHandleFrames: row.headHandleFrames || 0,
      tailHandleFrames: row.tailHandleFrames || 0,
      bodyDurationSec: durationSec,
    });
    if (canonicalJson(actualSpec) !== canonicalJson(expectedSpec)) {
      fail("Film /1 native clip child receipt spec does not match the exact source inputs compiled from its Film segment: " + segment.id);
    }
    if (receipt.sourceRuntime?.readiness?.ready !== true || (receipt.console?.errors || []).length) {
      fail("Film /1 native clip child receipt did not record a ready source runtime without console errors: " + segment.id);
    }
    outputPathValue = receipt.output?.path;
    outputSha256 = receipt.output?.sha256;
    inputEvidence = { path: specPath, sha256: specHash };
    sourceEvidence = { sourceId: source.id, sourceCommit: source.commit, sourcePath: entry.sourcePath, sourceSha256: sourceFile.sha256 };
    consumedInputs = {
      templateId: entry.id,
      variables: Object.fromEntries(Object.keys(segment.variables || {}).map((key) => [key, actualSpec[key]])),
    };
  } else if (segment.renderer === "laohu-native-om-template") {
    if (receipt.format !== "laohu.huashu-native-template-render/1") fail("Film /1 native OM segment " + segment.id + " child receipt has an unsupported format");
    const { entry, source, sourceFile } = registeredTemplateSource(validated.resources, segment.templateId, "Film /1 native OM segment " + segment.id);
    if (receipt.templateId !== entry.id || receipt.sourceId !== source.id || receipt.sourceCommit !== source.commit
        || receipt.sourceVerification?.ok !== true || receipt.sourceTemplate?.path !== entry.sourcePath
        || receipt.sourceTemplate?.sha256 !== sourceFile.sha256) {
      fail("Film /1 native OM child receipt source identity/verification differs from the registered source for " + segment.id);
    }
    const projectPath = path.resolve(text(receipt.projectPath, "native OM child receipt projectPath"));
    const specPath = resolveFrom(path.dirname(childReceiptPath), receipt.preparedSpecPath, "Film /1 native OM segment " + segment.id + " prepared spec path");
    if (!isWithin(projectPath, specPath) || path.basename(specPath) !== "laohu-native-template.json") {
      fail("Film /1 native OM child receipt prepared spec is outside its source project: " + segment.id);
    }
    const specHash = await hashFile(specPath);
    if (specHash !== receipt.preparedSpecSha256) fail("Film /1 native OM child receipt prepared spec hash differs from its actual input file: " + segment.id);
    const { value: spec } = await readJson(specPath, "Film /1 native OM segment " + segment.id + " prepared spec");
    if (spec.templateId !== entry.id || spec.sourceId !== source.id || spec.sourceTemplateSha256 !== sourceFile.sha256
        || spec.projectPath !== projectPath || spec.projectIndexSha256 !== receipt.projectIndexSha256) {
      fail("Film /1 native OM child prepared spec does not match its registered source/project receipt: " + segment.id);
    }
    const adapter = await import(pathToFileURL(path.join(skillDir, "templates", "adapters", "laohu-film.mjs")).href);
    const durationSec = Number(row.sourceRange?.endSec) - Number(row.sourceRange?.startSec);
    const expectedSpec = adapter.buildNativeOmFilmSpec(segment, durationSec, validated.blueprint.fps, validated.resources.catalog, {
      headHandleFrames: row.headHandleFrames || 0,
      tailHandleFrames: row.tailHandleFrames || 0,
    });
    for (const [key, expected] of Object.entries(expectedSpec)) {
      if (canonicalJson(spec[key]) !== canonicalJson(expected)) fail("Film /1 native OM prepared spec does not consume its Film input field " + key + ": " + segment.id);
    }
    if (canonicalJson(receipt.variables) !== canonicalJson(segment.variables)) {
      for (const [key, value] of Object.entries(segment.variables || {})) {
        if (canonicalJson(receipt.variables?.[key]) !== canonicalJson(value)) {
          fail("Film /1 native OM child receipt does not consume the exact Film variables." + key + " value: " + segment.id);
        }
      }
    }
    const projectIndexPath = resolveFrom(path.dirname(specPath), spec.projectIndexPath, "Film /1 native OM prepared project index path");
    if (!isWithin(projectPath, projectIndexPath) || await hashFile(projectIndexPath) !== receipt.projectIndexSha256) {
      fail("Film /1 native OM child project index path/hash differs from its prepared source receipt: " + segment.id);
    }
    const indexedFile = (receipt.projectFileHashes || []).find((item) => item.path === path.relative(projectPath, projectIndexPath));
    if (!indexedFile || indexedFile.sha256 !== receipt.projectIndexSha256) fail("Film /1 native OM child project-file inventory does not bind its exact index.html: " + segment.id);
    const projectApiPath = path.resolve(skillDir, entry.localRuntime?.directory || "", "cli", "lib", "project.js");
    if (!isWithin(skillDir, projectApiPath)) fail("Film /1 native OM source-variable reader escaped the registered local runtime");
    const projectApi = await import(pathToFileURL(projectApiPath).href);
    const projectHtml = await fs.readFile(projectIndexPath, "utf8");
    const observedVariables = Object.fromEntries(projectApi.readVariables(projectHtml).map((declaration) => [declaration.id, declaration.default]));
    if (canonicalJson(observedVariables) !== canonicalJson(receipt.variables)) {
      fail("Film /1 native OM child variables differ from the exact hash-bound project controls: " + segment.id);
    }
    for (const [key, value] of Object.entries(segment.variables || {})) {
      if (canonicalJson(receipt.variables?.[key]) !== canonicalJson(value)) {
        fail("Film /1 native OM child receipt does not consume the exact Film variables." + key + " value: " + segment.id);
      }
    }
    outputPathValue = receipt.media?.path;
    outputSha256 = receipt.media?.outputSha256 || receipt.media?.sha256;
    inputEvidence = { path: specPath, sha256: specHash };
    sourceEvidence = { sourceId: source.id, sourceCommit: source.commit, sourcePath: entry.sourcePath, sourceSha256: sourceFile.sha256 };
    consumedInputs = {
      templateId: entry.id,
      variables: Object.fromEntries(Object.keys(segment.variables || {}).map((key) => [key, receipt.variables?.[key]])),
    };
  } else if (segment.renderer === "motion-scene") {
    if (receipt.kind !== "technical-render-evidence") fail("Film /1 Motion scene segment " + segment.id + " child receipt has an unsupported renderer evidence kind");
    const expectedSourcePath = resolveFrom(path.dirname(validated.filmInput.file), segment.scenePath, "Film /1 Motion scene source path");
    const originalSourcePath = resolveFrom(path.dirname(manifestPath), row.sourceScenePath, "Film /1 Motion scene manifest source path");
    if (originalSourcePath !== expectedSourcePath || row.sourceSceneSha256 !== segment.sceneSha256
        || await hashFile(originalSourcePath) !== segment.sceneSha256) {
      fail("Film /1 Motion scene source path/hash differs from its exact Film blueprint input: " + segment.id);
    }
    const expectedDerivedPath = resolveFrom(path.dirname(manifestPath), row.derivedScenePath, "Film /1 Motion scene derived input path");
    const consumedScenePath = resolveFrom(path.dirname(childReceiptPath), receipt.inputFingerprints?.scene?.path, "Film /1 Motion scene child consumed scene path");
    const derivedHash = await hashFile(expectedDerivedPath);
    if (consumedScenePath !== expectedDerivedPath || derivedHash !== row.derivedSceneSha256
        || receipt.inputFingerprints?.scene?.sha256 !== derivedHash) {
      fail("Film /1 Motion scene child receipt does not bind the exact derived scene input path/hash: " + segment.id);
    }
    outputPathValue = receipt.output;
    outputSha256 = receipt.outputSha256;
    inputEvidence = { path: consumedScenePath, sha256: derivedHash, sourcePath: originalSourcePath, sourceSha256: segment.sceneSha256 };
    sourceEvidence = { sourcePath: originalSourcePath, sourceSha256: segment.sceneSha256 };
    consumedInputs = { scenePath: originalSourcePath, sceneSha256: segment.sceneSha256 };
  } else {
    fail("Film /1 renderer " + segment.renderer + " has no verified child-receipt adapter; refusing to infer output hashes from the outer manifest");
  }

  const childOutputPath = resolveFrom(path.dirname(childReceiptPath), outputPathValue, "Film /1 segment " + segment.id + " child output path");
  if (childOutputPath !== segmentOutputPath) fail("Film /1 child renderer receipt output path differs from the exact segment MP4: " + segment.id);
  if (!/^[a-f0-9]{64}$/i.test(String(outputSha256 || "")) || outputSha256 !== segmentOutputSha256) {
    fail("Film /1 child renderer receipt output SHA-256 differs from the actual segment MP4: " + segment.id);
  }
  if (row.renderedOutputSha256 != null && row.renderedOutputSha256 !== segmentOutputSha256) {
    fail("Film /1 outer segment output SHA-256 differs from its actual MP4: " + segment.id);
  }
  return {
    segmentId: segment.id,
    path: childReceiptPath,
    sha256: sha256(receiptBytes),
    kind: receipt.kind || receipt.format,
    source: sourceEvidence,
    input: inputEvidence,
    consumedInputs,
    output: { path: childOutputPath, sha256: segmentOutputSha256 },
  };
}

async function inspectFilmReceipt(validated, outputs) {
  const { value: manifest } = await readJson(outputs.filmManifest, "Film render receipt");
  const expectedManifest = FILM_MANIFEST_FORMATS.get(validated.blueprint.format);
  if (manifest.format !== expectedManifest) fail("Film receipt format differs from its declared Film Blueprint /" + validated.filmVersion + " consumer contract");
  if (manifest.source?.blueprintSha256 !== validated.filmInput.sha256) fail("Film receipt does not bind the production plan's exact Film blueprint hash");
  const outputFile = resolveFrom(path.dirname(outputs.filmManifest), manifest.output?.path, "Film receipt.output.path");
  if (outputFile !== outputs.picture) fail("Film receipt output path differs from plan.outputs.picture");
  const pictureSha = await hashFile(outputs.picture);
  if (manifest.output?.sha256 !== pictureSha) fail("Film output bytes differ from its receipt SHA-256");
  const rows = array(manifest.segments, "Film receipt.segments", { allowEmpty: true });
  const sourceRows = new Map(rows.map((row) => [row.id, row]));
  const childSegmentReceipts = [];
  const childReceiptBySegmentId = new Map();
  const projectShotReceipts = [];
  let motionRuntime = null;
  if (validated.filmVersion === 2 && validated.blueprint.segments.some((segment) => segment.renderer === "laohu-project-shot")) {
    motionRuntime = resolveMotionRuntime({ packages: ["@babel/parser"], projectRoot: repoRoot, skillRoot: skillDir, workRoot: repoRoot });
  }
  for (const segment of validated.blueprint.segments) {
    const row = sourceRows.get(segment.id);
    const normalizedRenderer = row?.normalizedFromRenderer === segment.renderer;
    if (!row || (row.renderer !== segment.renderer && !normalizedRenderer)) fail("Film receipt is missing the exact rendered source segment " + segment.id);
    if (validated.filmVersion === 1) {
      const segmentOutput = resolveFrom(path.dirname(outputs.filmManifest), row.renderedOutputPath, "Film receipt segment output");
      const segmentHash = await hashFile(segmentOutput);
      const childReceiptEvidence = await readFilmV1ChildReceipt({
        validated,
        manifestPath: outputs.filmManifest,
        row,
        segment,
        segmentOutputPath: segmentOutput,
        segmentOutputSha256: segmentHash,
      });
      childSegmentReceipts.push(childReceiptEvidence);
      childReceiptBySegmentId.set(segment.id, childReceiptEvidence);
      if (["huashu-motion-template", "laohu-native-om-template"].includes(segment.renderer)
          && row.template?.id !== segment.templateId) fail("native renderer receipt did not consume selected template " + segment.templateId);
    } else {
      if (row.observedFrameCount !== row.expectedFrameCount) fail("Film /2 segment receipt frame count differs from its compiled frame count: " + segment.id);
      if (row.baseSource?.renderedOutputPath) {
        const segmentOutput = resolveFrom(path.dirname(outputs.filmManifest), row.baseSource.renderedOutputPath, "Film /2 base source render output");
        if (await hashFile(segmentOutput) !== row.baseSource.renderedOutputSha256) fail("Film /2 base source bytes differ from their renderer receipt: " + segment.id);
      }
      if (segment.renderer === "laohu-project-shot") {
        projectShotReceipts.push(await verifyFilmProjectShotReceipt({
          validated, manifestPath: outputs.filmManifest, row, segment, motionRuntime,
        }));
      }
    }
    const shot = validated.plan.shots.find((item) => item.filmSegmentId === segment.id);
    if (!shot) fail("production plan lost its shot mapping for Film segment " + segment.id);
    for (const mapping of shot.sourceMappings) {
      const consumerEvidence = verifyMappingReceipt(validated, outputs, segment, row, mapping, childReceiptBySegmentId.get(segment.id) || null);
      if (!consumerEvidence.ok) fail("Film receipt does not prove source mapping " + mapping.id + " was consumed: " + consumerEvidence.reason);
    }
  }
  return {
    file: outputs.filmManifest,
    sha256: await hashFile(outputs.filmManifest),
    picture: { file: outputs.picture, sha256: pictureSha },
    durationSec: manifest.render?.durationSec,
    frameCount: manifest.render?.frameCount,
    segmentCount: rows.length,
    segmentReceiptPaths: rows.map((row) => row.receiptPath).filter(Boolean),
    segmentReceipts: childSegmentReceipts,
    projectShotReceipts,
    consumerMappingsVerified: validated.plan.shots.flatMap((shot) => shot.sourceMappings.map((mapping) => mapping.id)),
  };
}

async function verifyFilmProjectShotReceipt({ validated, manifestPath, row, segment, motionRuntime }) {
  const base = object(row.baseSource, "Film /2 project-shot base source " + segment.id);
  if (base.renderer !== "laohu-project-shot" || row.renderer !== "laohu-project-shot"
      || row.observedFrameCount !== row.expectedFrameCount || !Number.isSafeInteger(row.expectedFrameCount)
      || base.probe?.width !== 1920 || base.probe?.height !== 1080 || base.probe?.fps !== 30
      || base.probe?.frameCount !== row.expectedFrameCount || base.probe?.audioStreams !== 0) {
    fail("Film /2 project-shot manifest does not preserve the actual picture-only frame contract: " + segment.id);
  }
  const childReceiptPath = resolveFrom(path.dirname(manifestPath), base.rendererReceiptPath, "Film /2 project-shot child receipt path");
  const childReceiptSha256 = await hashFile(childReceiptPath);
  if (base.rendererReceiptSha256 !== childReceiptSha256) fail("Film /2 project-shot child receipt hash differs from its segment record: " + segment.id);
  const { value: childReceipt } = await readJson(childReceiptPath, "Film /2 project-shot child receipt " + segment.id);
  const segmentOutputPath = resolveFrom(path.dirname(manifestPath), base.renderedOutputPath, "Film /2 project-shot segment output path");
  const childOutputPath = resolveFrom(path.dirname(childReceiptPath), childReceipt.output?.path, "project-shot child receipt output path");
  if (childOutputPath !== segmentOutputPath) fail("project-shot child receipt output path differs from its exact Film /2 segment MP4: " + segment.id);
  const segmentOutputSha256 = await hashFile(segmentOutputPath);
  const segmentOutputBytes = (await fs.stat(segmentOutputPath)).size;
  if (base.renderedOutputSha256 !== segmentOutputSha256 || base.stagedSha256 !== segmentOutputSha256
      || childReceipt.output?.sha256 !== segmentOutputSha256 || childReceipt.output?.bytes !== segmentOutputBytes) {
    fail("project-shot child receipt output bytes differ from the actual Film /2 segment MP4: " + segment.id);
  }
  const entryPathValue = text(childReceipt.generatedEntry?.path, "project-shot child generated entry path");
  if (path.basename(entryPathValue) !== entryPathValue) fail("project-shot generated entry path must remain inside its child receipt directory: " + segment.id);
  const entryPath = resolveFrom(path.dirname(childReceiptPath), entryPathValue, "project-shot generated entry path");
  const entryBytes = await fs.readFile(entryPath);
  const entry = { sha256: sha256(entryBytes), bytes: entryBytes.length };
  if (base.generatedEntrySha256 !== entry.sha256 || childReceipt.generatedEntry?.sha256 !== entry.sha256
      || childReceipt.generatedEntry?.bytes !== entry.bytes) {
    fail("project-shot generated entry bytes differ from its Film /2 segment receipt: " + segment.id);
  }
  const currentProjectShot = await resolveProjectShotModule({
    segment,
    blueprintPath: validated.filmInput.file,
    runtimeNodeModules: motionRuntime.nodeModules,
    skillRoot: skillDir,
  });
  const expectedBinding = {
    module: { path: currentProjectShot.module.path, sha256: currentProjectShot.module.sha256, exportName: currentProjectShot.module.exportName },
    props: currentProjectShot.props,
    propsSha256: currentProjectShot.propsSha256,
    dependencies: currentProjectShot.dependencies,
    sourceFiles: currentProjectShot.sourceFiles,
    sourceGraphSha256: currentProjectShot.sourceGraphSha256,
    stableModules: currentProjectShot.stableModules.map(({ path: filePath, sha256: digest, bytes }) => ({ path: filePath, sha256: digest, bytes })),
    stableModuleGraphSha256: currentProjectShot.stableModuleGraphSha256,
    runtimePackages: currentProjectShot.runtimePackages,
    runtimeLockSha256: currentProjectShot.runtimeLockSha256,
    assets: currentProjectShot.assets.map(({ path: assetPath, sha256: digest, bytes }) => ({ path: assetPath, sha256: digest, bytes })),
    adapter: currentProjectShot.adapter,
  };
  if (canonicalJson(base.projectShot) !== canonicalJson(expectedBinding)
      || base.sourcePath !== segment.modulePath || base.sourceSha256 !== segment.moduleSha256) {
    fail("Film /2 project-shot manifest source/dependency/props/assets do not match the current consumed segment: " + segment.id);
  }
  const rendered = {
    composition: {
      width: validated.blueprint.width,
      height: validated.blueprint.height,
      fps: validated.blueprint.fps,
      durationInFrames: row.expectedFrameCount,
    },
  };
  verifyProjectShotReceipt(childReceipt, {
    projectShot: currentProjectShot,
    entry,
    render: rendered,
    outputHash: { sha256: segmentOutputSha256, bytes: segmentOutputBytes },
    segmentId: segment.id,
    expectedFrameCount: row.expectedFrameCount,
  });
  return {
    segmentId: segment.id,
    path: base.rendererReceiptPath,
    sha256: childReceiptSha256,
    kind: childReceipt.format,
    source: {
      modulePath: currentProjectShot.module.path,
      moduleSha256: currentProjectShot.module.sha256,
      exportName: currentProjectShot.module.exportName,
      sourceGraphSha256: currentProjectShot.sourceGraphSha256,
      propsSha256: currentProjectShot.propsSha256,
      stableModuleGraphSha256: currentProjectShot.stableModuleGraphSha256,
      runtimeLockSha256: currentProjectShot.runtimeLockSha256,
      dependencies: currentProjectShot.dependencies,
      assets: currentProjectShot.assets.map(({ path: assetPath, sha256: digest, bytes }) => ({ path: assetPath, sha256: digest, bytes })),
      adapter: currentProjectShot.adapter,
    },
    output: { path: base.renderedOutputPath, sha256: segmentOutputSha256 },
  };
}

function verifyMappingReceipt(validated, outputs, segment, row, mapping, childSegmentReceipt = null) {
  if (mapping.role === "scene-input") {
    const expectedPath = resolveFrom(path.dirname(validated.filmInput.file), segment.scenePath, "Film scene path");
    const manifestScene = row.sourceScenePath || row.baseSource?.sourcePath;
    const manifestHash = row.sourceSceneSha256 || row.baseSource?.sourceSha256;
    if (!manifestScene || !manifestHash) return { ok: false, reason: "the Film manifest has no consumed Motion scene source/hash" };
    const observedPath = resolveFrom(path.dirname(outputs.filmManifest), manifestScene, "Film receipt scene path");
    if (observedPath !== expectedPath || manifestHash !== segment.sceneSha256) return { ok: false, reason: "the receipt scene path/hash differs from the mapped Film input" };
    return { ok: true };
  }

  for (const field of mapping.consumerFields) {
    const expected = mapping.role === "layer"
      ? getFilmLayerField(segment, mapping.layerIndex, field)
      : getPath(segment, field);
    let observed;
    if (validated.filmVersion === 1) {
      if (field === "templateId") observed = row.template?.id;
      else if (field === "scenePath") observed = row.sourceScenePath;
      else if (field === "sceneSha256") observed = row.sourceSceneSha256;
      else if (field === "variables") observed = childSegmentReceipt?.consumedInputs?.variables;
      else if (field.startsWith("variables.")) observed = getPath(childSegmentReceipt?.consumedInputs?.variables || {}, field.slice("variables.".length));
      else observed = undefined;
    } else if (mapping.role === "base") {
      if (mapping.resourceType === "project-shot") {
        const projectShot = row.baseSource?.projectShot;
        if (field === "modulePath") observed = projectShot?.module?.path;
        else if (field === "moduleSha256") observed = projectShot?.module?.sha256;
        else if (field === "exportName") observed = projectShot?.module?.exportName;
        else if (field === "props") observed = projectShot?.props;
        else if (field.startsWith("props.")) observed = getPath(projectShot?.props || {}, field.slice("props.".length));
        else if (field === "dependencies") {
          const actual = projectShot?.dependencies;
          if (!Array.isArray(actual) || actual.some((item) => !Number.isSafeInteger(item.bytes) || item.bytes < 0)) {
            return { ok: false, reason: "project-shot Film receipt dependency evidence is missing its exact byte inventory" };
          }
          observed = actual.map(({ path: dependencyPath, sha256 }) => ({ path: dependencyPath, sha256 }));
        } else if (field === "assets") {
          const actual = projectShot?.assets;
          if (!Array.isArray(actual) || actual.some((item) => !Number.isSafeInteger(item.bytes) || item.bytes < 0)) {
            return { ok: false, reason: "project-shot Film receipt asset evidence is missing its exact byte inventory" };
          }
          observed = actual.map(({ path: assetPath, sha256 }) => ({ path: assetPath, sha256 }));
        } else observed = undefined;
      } else if (field === "sourceCatalogId") observed = row.sourceCatalogId;
      else if (field === "templateId") observed = row.baseSource?.templateId || row.template?.id;
      else if (field === "scenePath") observed = row.baseSource?.sourcePath || row.sourceScenePath;
      else if (field === "sceneSha256") observed = row.baseSource?.sourceSha256 || row.sourceSceneSha256;
      else if (field.startsWith("props.")) observed = getPath(row.layers?.[0]?.props || {}, field.slice("props.".length));
      else observed = undefined;
    } else {
      let normalized = field;
      if (field.startsWith("layers.")) normalized = field.split(".").slice(2).join(".");
      if (normalized === "catalogId") observed = row.layers?.[mapping.layerIndex]?.catalogId;
      else if (normalized.startsWith("props.")) observed = getPath(row.layers?.[mapping.layerIndex]?.props || {}, normalized.slice("props.".length));
      else if (normalized.startsWith("placement.")) observed = getPath(row.layers?.[mapping.layerIndex]?.placement || {}, normalized.slice("placement.".length));
      else observed = undefined;
    }
    let same = field === "scenePath" && typeof observed === "string" && typeof expected === "string"
      ? resolveFrom(path.dirname(outputs.filmManifest), observed, "Film receipt scene path")
          === resolveFrom(path.dirname(validated.filmInput.file), expected, "Film blueprint scene path")
      : canonicalJson(observed) === canonicalJson(expected);
    if (!same && ["component", "template", "effect"].includes(mapping.resourceType)
        && typeof observed === "string" && typeof expected === "string") {
      same = resourceRow(validated.resources, mapping.resourceType, observed).id
        === resourceRow(validated.resources, mapping.resourceType, expected).id;
    }
    if (!same) return { ok: false, reason: `consumer field ${field} differs between the submitted Film blueprint and rendered manifest` };
  }
  if (["component", "template", "effect"].includes(mapping.resourceType)) {
    if (mapping.role === "layer" && resourceRow(validated.resources, mapping.resourceType, row.layers?.[mapping.layerIndex]?.catalogId).id
        !== resourceRow(validated.resources, mapping.resourceType, mapping.resourceId).id) {
      return { ok: false, reason: "render receipt layer catalogId does not equal the mapped component" };
    }
    if (mapping.role === "base") {
      const actualId = row.sourceCatalogId || row.template?.id || row.baseSource?.templateId;
      if (!actualId || resourceRow(validated.resources, mapping.resourceType, actualId).id
          !== resourceRow(validated.resources, mapping.resourceType, mapping.resourceId).id) {
        return { ok: false, reason: "render receipt base source identity does not equal the mapped component" };
      }
    }
    const catalog = validated.resources.catalog.templates || [];
    const component = catalog.find((item) => item.id === mapping.resourceId || (item.aliases || []).includes(mapping.resourceId));
    if (component?.component?.sha256 && row.componentSha256 && component.component.sha256 !== row.componentSha256) {
      return { ok: false, reason: "render receipt component source hash differs from the current registered component" };
    }
  }
  if (mapping.resourceType === "style") {
    if (mapping.role !== "layer" || validated.filmVersion !== 2) {
      return { ok: false, reason: "the current callable style consumer is a Film /2 layer; Film /1 has no equivalent structured style layer" };
    }
    const styleId = mapping.resourceId.toUpperCase();
    if (!["F1", "F2"].includes(styleId)) {
      return { ok: false, reason: "structured Film style receipt verification is currently implemented for F1/F2" };
    }
    const layer = row.layers?.[mapping.layerIndex];
    const binding = layer?.contentBinding;
    const styleCode = layer?.styleCode;
    const expectedContent = getFilmLayerField(segment, mapping.layerIndex, "layers." + mapping.layerIndex + ".props.content");
    const expectedSource = getFilmLayerField(segment, mapping.layerIndex, "layers." + mapping.layerIndex + ".props.contentSource");
    const style = resourceRow(validated.resources, "style", styleId);
    const expectedContentHash = sha256(Buffer.from(canonicalJson(expectedContent)));
    if (layer?.props?.styleId !== styleId || layer?.props?.content == null) {
      return { ok: false, reason: "Film receipt layer does not preserve the mapped structured styleId/content props" };
    }
    if (binding?.status !== "structured-content-bound" || binding.demoMode !== false) {
      return { ok: false, reason: "Film receipt says the style still uses demo content or did not bind structured content" };
    }
    if (binding.contentSha256 !== expectedContentHash) {
      return { ok: false, reason: "Film receipt content hash differs from the mapped structured style content" };
    }
    if (!expectedSource || binding.contentSource?.sha256 !== expectedSource.sha256) {
      return { ok: false, reason: "Film receipt content-source hash differs from the mapped source material" };
    }
    if (styleCode?.style?.id !== styleId || styleCode.style.sourceSha256 !== style.sourceSha256) {
      return { ok: false, reason: "Film receipt style identity/source hash differs from the registered F1/F2 source" };
    }
    if (styleCode.sourceCode?.sourceCodeHash !== style.route?.sourceFunctionSha256
        || !/^[a-f0-9]{64}$/.test(styleCode.sourceCode?.executedCodeHash || "")) {
      return { ok: false, reason: "Film receipt does not bind the registered style function and its actual derived code hash" };
    }
  }
  return { ok: true };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

function executionPlanSha256(plan) {
  const executable = structuredClone(plan);
  delete executable.verification;
  return sha256(Buffer.from(canonicalJson(executable), "utf8"));
}

async function verifyCandidateKeyState({ plan, planDir, proof, candidate, mapping, segment, filmInput, materialById, resources, ffmpeg }) {
  const image = await verifyFileReference(planDir, { path: proof.path, sha256: proof.sha256 }, "selected candidate key-state", { png: true });
  const receiptRef = await verifyFileReference(planDir, proof.rendererReceipt, "selected candidate renderer receipt");
  const { value: receipt } = await readJson(receiptRef.file, "selected candidate renderer receipt");
  if (candidate.resourceType === "renderer-route" && candidate.resourceId === PROJECT_SHOT_ROUTE_ID) {
    return await verifyProjectShotKeyState({ plan, planDir, image, receiptRef, receipt, candidate, proof, mapping, segment, filmInput, ffmpeg });
  }
  const styleId = mapping.resourceType === "style" ? String(mapping.resourceId).toUpperCase()
    : candidate.resourceType === "style" ? String(candidate.resourceId).toUpperCase() : null;
  const candidateConsumesStyle = candidate.resourceType === "style"
    ? String(candidate.resourceId).toUpperCase() === styleId
    : candidate.resourceType === "component" && (() => {
      try {
        return resourceRow(resources, "component", candidate.resourceId).styleIds?.includes(styleId) === true;
      } catch {
        return false;
      }
    })();
  if (candidateConsumesStyle && ["F1", "F2"].includes(styleId)
      && receipt.kind === "341-style-canvas-render-evidence") {
    return await verifyStructuredStyleKeyState({ planDir, image, receiptRef, receipt, candidate, proof, mapping, segment, filmInput, materialById, resources, styleId });
  }
  if (receipt.kind === "technical-render-evidence") {
    return await verifyMotionSceneKeyState({ image, receiptRef, receipt, candidate, mapping, segment, filmInput, resources });
  }
  if (receipt.format === "laohu.video-shotcraft-render-manifest/1") {
    return await verifyShotcraftKeyState({ image, receiptRef, receipt, candidate, proof, mapping, segment, filmInput, materialById, resources });
  }
  if (receipt.kind === "native-template-render-evidence") {
    return await verifyNativeTemplateKeyState({ image, receiptRef, receipt, candidate, mapping, segment, filmInput, resources });
  }
  if (receipt.format === "laohu.huashu-native-template-render/1") {
    return await verifyNativeOmKeyState({ image, receiptRef, receipt, candidate, mapping, segment, filmInput, resources });
  }
  if (receipt.kind === "native-style-scene-render-evidence") {
    return await verifyNativeStyleSceneKeyState({ image, receiptRef, receipt, candidate, mapping, segment, resources });
  }
  fail("selected key-state renderer receipt kind " + (receipt.kind || receipt.format || "(missing)")
    + " has no source-bound adapter in this plan version; capture it through its existing consumer and map its real inputs before production");
}

async function verifyProjectShotKeyState({ plan, planDir, image, receiptRef, receipt, candidate, proof, mapping, segment, filmInput, ffmpeg }) {
  if (candidate.resourceType !== "renderer-route" || candidate.resourceId !== PROJECT_SHOT_ROUTE_ID
      || mapping.resourceType !== "project-shot" || mapping.role !== "base" || segment.renderer !== "laohu-project-shot") {
    fail("project-shot key-state requires the selected real renderer route and its exact Film /2 project-shot base mapping");
  }
  if (!Number.isSafeInteger(proof.frameIndex) || proof.frameIndex < 0) fail("project-shot key-state must identify a local segment frameIndex");
  if (receipt.format !== "laohu.motion-film-manifest/2" || receipt.source?.blueprintSha256 !== filmInput.sha256) {
    fail("project-shot key-state must reference the actual Film /2 manifest for the submitted blueprint hash");
  }
  const planOutputs = object(plan.outputs, "plan.outputs");
  const declaredManifestPath = resolveFrom(planDir, planOutputs.filmManifest, "plan.outputs.filmManifest");
  if (receiptRef.file !== declaredManifestPath) fail("project-shot key-state rendererReceipt must be the exact declared Film /2 manifest");
  const declaredPicturePath = resolveFrom(planDir, planOutputs.picture, "plan.outputs.picture");
  const manifestPicturePath = resolveFrom(path.dirname(receiptRef.file), receipt.output?.path, "Film /2 manifest output.path");
  if (manifestPicturePath !== declaredPicturePath || receipt.output?.sha256 !== await hashFile(declaredPicturePath)) {
    fail("project-shot key-state Film /2 manifest does not bind the exact declared picture output bytes");
  }
  const row = array(receipt.segments, "Film /2 project-shot segments", { allowEmpty: true }).find((item) => item.id === segment.id);
  if (!row || row.renderer !== "laohu-project-shot" || row.observedFrameCount !== row.expectedFrameCount
      || !Number.isSafeInteger(row.expectedFrameCount) || proof.frameIndex >= row.expectedFrameCount) {
    fail("project-shot key-state frame must fall inside the actual rendered Film /2 segment");
  }
  const frameRange = object(row.frameRange, "Film /2 project-shot frameRange");
  if (!Number.isSafeInteger(frameRange.startFrame) || !Number.isSafeInteger(frameRange.endFrame)
      || frameRange.startFrame < 0 || frameRange.endFrame - frameRange.startFrame !== row.expectedFrameCount) {
    fail("project-shot key-state requires the exact rendered segment frameRange");
  }
  const expectedGlobalFrameIndex = frameRange.startFrame + proof.frameIndex;
  if (!Number.isSafeInteger(proof.globalFrameIndex) || proof.globalFrameIndex !== expectedGlobalFrameIndex
      || expectedGlobalFrameIndex >= receipt.render?.frameCount || proof.filmPictureSha256 !== receipt.output?.sha256) {
    fail("project-shot key-state must bind its local segment frame to the corresponding global frame in the exact final Film picture");
  }
  const base = object(row.baseSource, "Film /2 project-shot baseSource");
  if (base.probe?.width !== 1920 || base.probe?.height !== 1080 || base.probe?.fps !== 30
      || base.probe?.frameCount !== row.expectedFrameCount || base.probe?.audioStreams !== 0) {
    fail("project-shot segment probe must match the Film /2 1920x1080@30 picture-only contract");
  }
  const recorded = object(base.projectShot, "Film /2 baseSource.projectShot");
  if (base.renderer !== "laohu-project-shot" || base.sourcePath !== segment.modulePath || base.sourceSha256 !== segment.moduleSha256
      || recorded.module?.path !== segment.modulePath || recorded.module?.sha256 !== segment.moduleSha256
      || recorded.module?.exportName !== segment.exportName || canonicalJson(recorded.props) !== canonicalJson(segment.props || {})) {
    fail("Film /2 manifest project-shot identity or props differ from the exact submitted segment module/export/props");
  }
  const runtime = resolveMotionRuntime({
    packages: ["@babel/parser"],
    projectRoot: repoRoot,
    skillRoot: skillDir,
    workRoot: repoRoot,
  });
  const currentProjectShot = await resolveProjectShotModule({
    segment,
    blueprintPath: filmInput.file,
    runtimeNodeModules: runtime.nodeModules,
    skillRoot: skillDir,
  });
  const expectedBinding = {
    module: { path: currentProjectShot.module.path, sha256: currentProjectShot.module.sha256, exportName: currentProjectShot.module.exportName },
    props: currentProjectShot.props,
    propsSha256: currentProjectShot.propsSha256,
    dependencies: currentProjectShot.dependencies,
    sourceFiles: currentProjectShot.sourceFiles,
    sourceGraphSha256: currentProjectShot.sourceGraphSha256,
    stableModules: currentProjectShot.stableModules.map(({ path: filePath, sha256: digest, bytes }) => ({ path: filePath, sha256: digest, bytes })),
    stableModuleGraphSha256: currentProjectShot.stableModuleGraphSha256,
    runtimePackages: currentProjectShot.runtimePackages,
    runtimeLockSha256: currentProjectShot.runtimeLockSha256,
    assets: currentProjectShot.assets.map(({ path: assetPath, sha256: digest, bytes }) => ({ path: assetPath, sha256: digest, bytes })),
    adapter: currentProjectShot.adapter,
  };
  if (canonicalJson(recorded) !== canonicalJson(expectedBinding)) {
    fail("Film /2 project-shot receipt is stale: the current module, imported dependency, asset, helper, render driver, mature module surface, or runtime lock differs");
  }
  const childReceiptPath = resolveFrom(path.dirname(receiptRef.file), base.rendererReceiptPath, "project-shot child receipt path");
  const childReceiptSha256 = await hashFile(childReceiptPath);
  if (base.rendererReceiptSha256 !== childReceiptSha256) fail("Film /2 project-shot child receipt hash differs from its segment record");
  const { value: childReceipt } = await readJson(childReceiptPath, "project-shot child receipt");
  const segmentOutputPath = resolveFrom(path.dirname(receiptRef.file), base.renderedOutputPath, "project-shot rendered segment output path");
  if (resolveFrom(path.dirname(childReceiptPath), childReceipt.output?.path, "project-shot child output path") !== segmentOutputPath) {
    fail("project-shot child receipt output path differs from the exact Film /2 segment MP4");
  }
  const segmentOutputSha256 = await hashFile(segmentOutputPath);
  if (base.renderedOutputSha256 !== segmentOutputSha256 || base.stagedSha256 !== segmentOutputSha256) fail("project-shot rendered segment bytes differ from the actual Film /2 segment receipt");
  const entry = { sha256: base.generatedEntrySha256, bytes: childReceipt.generatedEntry?.bytes };
  const render = { composition: { width: 1920, height: 1080, fps: 30, durationInFrames: row.expectedFrameCount } };
  verifyProjectShotReceipt(childReceipt, {
    projectShot: currentProjectShot,
    entry,
    render,
    outputHash: { sha256: segmentOutputSha256, bytes: childReceipt.output?.bytes },
    segmentId: segment.id,
    expectedFrameCount: row.expectedFrameCount,
  });
  const pngBytes = await fs.readFile(image.file);
  const width = pngBytes.readUInt32BE(16);
  const height = pngBytes.readUInt32BE(20);
  if (width !== 1920 || height !== 1080) fail("project-shot key-state must be the actual 1920x1080 Film frame");
  const decoder = ffmpeg || process.env.MOTION_FFMPEG || "ffmpeg";
  const frameFilter = `select=eq(n\\,${proof.globalFrameIndex})`;
  const decode = (inputPath, frame) => {
    const args = ["-hide_banner", "-loglevel", "error", "-i", inputPath];
    if (frame != null) args.push("-vf", frameFilter, "-fps_mode", "vfr");
    args.push("-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1");
    const result = spawnSync(decoder, args, { encoding: null, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
    if (result.error) fail("project-shot key-state pixel verification could not start ffmpeg: " + result.error.message);
    if (result.status !== 0) fail("project-shot key-state pixel verification failed: " + (result.stderr?.toString("utf8") || "ffmpeg returned a non-zero status"));
    return result.stdout;
  };
  const renderedPixels = decode(declaredPicturePath, proof.globalFrameIndex);
  const keyStatePixels = decode(image.file, null);
  const expectedPixelBytes = 1920 * 1080 * 3;
  if (renderedPixels.length !== expectedPixelBytes || keyStatePixels.length !== expectedPixelBytes || !renderedPixels.equals(keyStatePixels)) {
    fail("project-shot key-state PNG pixels do not match the identified frame in the final rendered Film picture");
  }
  return keyStateSummary(candidate, mapping, segment, image, receiptRef, {
    renderer: "laohu-project-shot",
    frameIndex: proof.frameIndex,
    globalFrameIndex: proof.globalFrameIndex,
    filmPictureSha256: proof.filmPictureSha256,
    modulePath: recorded.module.path,
    moduleSha256: recorded.module.sha256,
    exportName: recorded.module.exportName,
    propsSha256: recorded.propsSha256,
    sourceGraphSha256: recorded.sourceGraphSha256,
    stableModuleGraphSha256: recorded.stableModuleGraphSha256,
    runtimeLockSha256: recorded.runtimeLockSha256,
  });
}

async function verifyStructuredStyleKeyState({ planDir, image, receiptRef, receipt, candidate, proof, mapping, segment, filmInput, materialById, resources, styleId }) {
  const style = resourceRow(resources, "style", styleId);
  if (receipt.status !== "rendered" || receipt.style?.id !== styleId || receipt.style.sourceSha256 !== style.sourceSha256
      || receipt.sourceCode?.drawFunction !== "S." + styleId
      || receipt.sourceCode?.sourceCodeHash !== style.route?.sourceFunctionSha256) {
    fail("selected style key-state receipt does not bind the registered source function/source hash for " + styleId);
  }
  const binding = receipt.contentBinding;
  if (binding?.status !== "structured-content-bound" || binding.demoMode !== false) {
    fail("selected style key-state receipt still uses demo or parent-only content; a source-bound structured-content render is required");
  }
  const outputPath = resolveFrom(path.dirname(receiptRef.file), receipt.output?.path, "style key-state receipt.output.path");
  if (outputPath !== image.file || receipt.output?.sha256 !== image.sha256 || receipt.output?.mediaType !== ".png") {
    fail("selected style key-state PNG path/hash is not the exact output bound by its renderer receipt");
  }
  const material = materialById.get(proof.contentMaterialId);
  if (!material || !material.file.toLowerCase().endsWith(".json")) fail("F1/F2 key-state contentMaterialId must reference a JSON source material");
  const { value: materialContent } = await readJson(material.file, "selected style content material " + material.id);
  const rawMaterialHash = await hashFile(material.file);
  if (rawMaterialHash !== material.sha256) fail("selected style content material hash changed during key-state verification");
  if (canonicalJson(receipt.input?.content) !== canonicalJson(materialContent)) fail("style renderer receipt content differs from the exact selected content material JSON");
  if (binding.contentSource?.sha256 !== material.sha256 || receipt.input?.contentSource?.sha256 !== material.sha256
      || resolveFrom(path.dirname(receiptRef.file), receipt.input.contentSource.path, "style key-state contentSource.path") !== material.file) {
    fail("style renderer receipt does not bind the exact source material path and raw JSON hash");
  }
  const contentHash = sha256(Buffer.from(canonicalJson(materialContent)));
  if (binding.contentSha256 !== contentHash || receipt.input?.contentSha256 !== contentHash) {
    fail("style renderer receipt structured-content hash differs from the exact selected source material");
  }
  if (mapping.resourceType !== "style" || String(mapping.resourceId).toUpperCase() !== styleId || mapping.role !== "layer") {
    fail("selected F1/F2 key-state proof must refer to the Film style layer mapping for the same style");
  }
  const filmStyleId = getFilmLayerField(segment, mapping.layerIndex, "layers." + mapping.layerIndex + ".props.styleId");
  const filmContent = getFilmLayerField(segment, mapping.layerIndex, "layers." + mapping.layerIndex + ".props.content");
  const filmContentSource = getFilmLayerField(segment, mapping.layerIndex, "layers." + mapping.layerIndex + ".props.contentSource");
  if (filmStyleId !== styleId || canonicalJson(filmContent) !== canonicalJson(materialContent)) {
    fail("selected style key-state receipt content differs from the exact mapped Film layer styleId/content props");
  }
  if (!filmContentSource || filmContentSource.sha256 !== material.sha256) {
    fail("selected style Film layer contentSource must carry the exact selected source material raw hash");
  }
  const filmSourcePath = resolveFrom(path.dirname(filmInput.file), filmContentSource.path, "Film layer contentSource.path");
  if (filmSourcePath !== material.file) fail("selected style Film layer contentSource path differs from the mapped source material");
  return keyStateSummary(candidate, mapping, segment, image, receiptRef, {
    contentMaterialId: material.id,
    contentMaterialSha256: material.sha256,
    contentSha256: contentHash,
    sourceFunctionSha256: style.route.sourceFunctionSha256,
  });
}

async function verifyMotionSceneKeyState({ image, receiptRef, receipt, candidate, mapping, segment, filmInput }) {
  if (candidate.resourceType !== "motion-scene" || mapping.resourceType !== "motion-scene" || mapping.role !== "base"
      || segment.renderer !== "motion-scene" || !mapping.consumerFields.includes("scenePath") || !mapping.consumerFields.includes("sceneSha256")) {
    fail("technical-render-evidence can certify only the exact Film Motion scene source as the selected key-state candidate");
  }
  const scenePath = resolveFrom(path.dirname(filmInput.file), segment.scenePath, "Film Motion scene path");
  const receiptScenePath = resolveFrom(path.dirname(receiptRef.file), receipt.inputFingerprints?.scene?.path, "render key-state input scene path");
  const outputSample = (receipt.samples || []).find((sample) => {
    try { return resolveFrom(path.dirname(receiptRef.file), sample.file, "render sample path") === image.file; } catch { return false; }
  });
  if (receiptScenePath !== scenePath || receipt.inputFingerprints?.scene?.sha256 !== segment.sceneSha256) {
    fail("technical render receipt does not bind the exact Film Motion scene path/hash");
  }
  if (!outputSample) fail("selected PNG is not one of the source renderer's recorded key-state samples");
  return keyStateSummary(candidate, mapping, segment, image, receiptRef, { sceneSha256: segment.sceneSha256, renderSampleTime: outputSample.time });
}

async function verifyShotcraftKeyState({ image, receiptRef, receipt, candidate, proof, mapping, segment, filmInput, materialById, resources }) {
  if (!receipt.output || resolveFrom(path.dirname(receiptRef.file), receipt.output.path, "Shotcraft key-state output path") !== image.file
      || receipt.output.sha256 !== image.sha256 || receipt.output.mediaType !== ".png") {
    fail("selected Shotcraft key-state PNG path/hash differs from its renderer receipt");
  }
  const consumedRows = array(receipt.propsConsumed, "Shotcraft receipt.propsConsumed", { allowEmpty: true });
  let consumed;
  if (mapping.role === "layer") consumed = consumedRows[mapping.layerIndex];
  else if (mapping.role === "base") consumed = consumedRows[0];
  else fail("Shotcraft key-state does not support scene-input mappings");
  if (!consumed) fail("Shotcraft renderer receipt omitted the mapped consumed layer");
  for (const field of mapping.consumerFields) {
    const expected = mapping.role === "layer"
      ? getFilmLayerField(segment, mapping.layerIndex, field)
      : getPath(segment, field);
    let observed;
    if (mapping.role === "layer") {
      const parts = field.split(".");
      if (parts[2] === "catalogId") observed = consumed.catalogId;
      else if (parts[2] === "props") observed = getPath(consumed, parts.slice(2).join("."));
      else if (parts[2] === "placement") observed = getPath(consumed, parts.slice(2).join("."));
    } else {
      if (field === "templateId" || field === "sourceCatalogId") observed = receipt.templateId;
      else if (field.startsWith("props.")) observed = getPath(consumed, field);
      else observed = getPath(receipt, field);
    }
    if (canonicalJson(expected) !== canonicalJson(observed)) fail("Shotcraft preview did not consume the exact Film mapping field " + field);
  }
  if (mapping.resourceType === "style") {
    const styleId = String(mapping.resourceId).toUpperCase();
    const style = resourceRow(resources, "style", styleId);
    if (consumed.props?.styleId !== styleId || consumed.contentBinding?.status !== "structured-content-bound"
        || consumed.contentBinding.demoMode !== false || consumed.styleCode?.style?.sourceSha256 !== style.sourceSha256
        || consumed.styleCode?.sourceCode?.sourceCodeHash !== style.route?.sourceFunctionSha256) {
      fail("Shotcraft style preview does not prove the registered structured style function consumed real content");
    }
    if (proof.contentMaterialId) {
      const material = materialById.get(proof.contentMaterialId);
      if (!material) fail("Shotcraft style key-state contentMaterialId is not a known source material");
      const { value: content } = await readJson(material.file, "Shotcraft style key-state content");
      const contentHash = sha256(Buffer.from(canonicalJson(content)));
      if (canonicalJson(consumed.props?.content) !== canonicalJson(content)
          || consumed.contentBinding.contentSha256 !== contentHash
          || consumed.contentBinding.contentSource?.sha256 !== material.sha256) {
        fail("Shotcraft style receipt content differs from the exact selected JSON source material");
      }
    }
  } else {
    const actualId = mapping.role === "layer" ? consumed.catalogId : receipt.templateId;
    const registered = resourceRow(resources, mapping.resourceType, mapping.resourceId);
    const actual = resourceRow(resources, mapping.resourceType, actualId);
    if (actual.id !== registered.id) fail("Shotcraft preview component identity differs from the selected catalog row");
    const componentSource = (receipt.componentSources || []).find((item) => item.catalogId === actual.id);
    if (!componentSource || (registered.component?.sha256 && componentSource.componentSha256 !== registered.component.sha256)) {
      fail("Shotcraft preview source hash differs from the current registered component");
    }
  }
  return keyStateSummary(candidate, mapping, segment, image, receiptRef, {
    renderer: "video-shotcraft-remotion",
    consumerTemplateId: receipt.templateId,
    consumedLayerId: consumed.id || null,
  });
}

async function verifyNativeTemplateKeyState({ image, receiptRef, receipt, candidate, mapping, segment, filmInput, resources }) {
  if (!["template", "component"].includes(candidate.resourceType) || mapping.role !== "base") {
    fail("native-template key-state receipt supports its registered Film base-template mapping only");
  }
  const registered = resourceRow(resources, candidate.resourceType, candidate.resourceId);
  const actual = resourceRow(resources, candidate.resourceType, receipt.templateId);
  if (actual.id !== registered.id) fail("native template preview receipt belongs to a different catalog template");
  if (receipt.output?.mediaType !== ".png" || receipt.output?.sha256 !== image.sha256
      || resolveFrom(path.dirname(receiptRef.file), receipt.output.path, "native template preview output") !== image.file) {
    fail("native template key-state PNG path/hash differs from its renderer receipt");
  }
  const specPath = resolveFrom(path.dirname(receiptRef.file), receipt.spec?.path, "native template preview spec path");
  if (await hashFile(specPath) !== receipt.spec?.sha256) fail("native template preview spec file hash differs from its receipt");
  const { value: spec } = await readJson(specPath, "native template preview spec");
  const sourceId = registered.sourceId;
  if (sourceId && receipt.source?.id !== sourceId) fail("native template preview source identity differs from the registered catalog row");
  if (receipt.sourceRuntime?.readiness?.ready !== true) fail("native template preview was not source-runtime ready");
  for (const field of mapping.consumerFields) {
    const expected = getPath(segment, field);
    if (field === "templateId") {
      if (canonicalJson(expected) !== canonicalJson(receipt.templateId)) fail("native template preview identity differs from the exact Film base field templateId");
    } else if (field === "variables" && expected && typeof expected === "object" && !Array.isArray(expected)) {
      for (const [key, value] of Object.entries(expected)) {
        const observed = getPath(spec, key) ?? getPath(spec, "data." + key) ?? getPath(spec, "variables." + key);
        if (canonicalJson(value) !== canonicalJson(observed)) fail("native template preview does not consume the exact Film variables." + key + " value");
      }
    } else {
      const observed = getPath(spec, field);
      if (canonicalJson(expected) !== canonicalJson(observed)) fail("native template preview does not consume the exact Film base field " + field);
    }
  }
  return keyStateSummary(candidate, mapping, segment, image, receiptRef, {
    renderer: "native-template",
    specPath,
    specSha256: receipt.spec.sha256,
  });
}

async function verifyNativeOmKeyState({ image, receiptRef, receipt, candidate, mapping, segment, resources }) {
  if (candidate.resourceType !== "template" || mapping.role !== "base" || segment.renderer !== "laohu-native-om-template") {
    fail("native OM key-state receipt supports only its exact registered Film /1 native OM base segment");
  }
  const registered = resourceRow(resources, "template", candidate.resourceId);
  const actual = resourceRow(resources, "template", receipt.templateId);
  const source = resources.ledger.sources.find((row) => row.id === registered.sourceId);
  const sourcePin = source?.files?.find((row) => row.path === registered.sourcePath);
  if (registered.id !== actual.id || receipt.sourceId !== registered.sourceId || receipt.sourceVerification?.ok !== true
      || !source || receipt.sourceCommit !== source.commit || !sourcePin || receipt.sourceTemplate?.path !== registered.sourcePath
      || receipt.sourceTemplate?.sha256 !== sourcePin.sha256) {
    fail("native OM preview receipt source/template identity is not verified for the selected catalog source");
  }
  const projectPath = resolveFrom(path.dirname(receiptRef.file), receipt.projectPath, "native OM key-state project path");
  const specPath = resolveFrom(path.dirname(receiptRef.file), receipt.preparedSpecPath, "native OM key-state prepared spec path");
  if (!isWithin(projectPath, specPath) || path.basename(specPath) !== "laohu-native-template.json") {
    fail("native OM preview prepared spec must be inside its receipt-bound project");
  }
  const specHash = await hashFile(specPath);
  if (specHash !== receipt.preparedSpecSha256) fail("native OM preview prepared-spec hash differs from its receipt");
  const { value: spec } = await readJson(specPath, "native OM preview prepared spec");
  if (spec.templateId !== registered.id || spec.sourceId !== registered.sourceId || spec.sourceVerification?.ok !== true
      || spec.projectPath !== projectPath || spec.sourceTemplateSha256 !== receipt.sourceTemplate.sha256
      || spec.projectIndexSha256 !== receipt.projectIndexSha256) {
    fail("native OM preview prepared spec does not match the verified source/template/project receipt");
  }
  const projectIndexPath = resolveFrom(path.dirname(specPath), spec.projectIndexPath, "native OM prepared project index");
  if (!isWithin(projectPath, projectIndexPath) || await hashFile(projectIndexPath) !== receipt.projectIndexSha256) {
    fail("native OM preview project index differs from the exact prepared receipt hash");
  }
  const indexedProjectFile = array(receipt.projectFileHashes, "native OM receipt projectFileHashes").find((row) => row.path === path.relative(projectPath, projectIndexPath));
  if (!indexedProjectFile || indexedProjectFile.sha256 !== receipt.projectIndexSha256) {
    fail("native OM preview project-file inventory does not bind the exact consumed index.html bytes");
  }
  const projectApiPath = path.resolve(skillDir, registered.localRuntime?.directory || "", "cli", "lib", "project.js");
  if (!isWithin(skillDir, projectApiPath)) fail("native OM source variable reader escaped the registered local runtime");
  const projectApi = await import(pathToFileURL(projectApiPath).href);
  const html = await fs.readFile(projectIndexPath, "utf8");
  const observedVariables = Object.fromEntries(projectApi.readVariables(html).map((declaration) => [declaration.id, declaration.default]));
  if (canonicalJson(observedVariables) !== canonicalJson(receipt.variables)) {
    fail("native OM preview receipt variables differ from the exact hash-bound source project controls");
  }
  const outputPath = resolveFrom(path.dirname(receiptRef.file), receipt.output, "native OM preview output path");
  const outputHash = receipt.media?.sha256 || receipt.media?.outputSha256;
  if (receipt.media?.format !== "png" || outputPath !== image.file || receipt.media?.path !== image.file || outputHash !== image.sha256) {
    fail("native OM key-state PNG path/hash differs from its renderer receipt");
  }
  for (const field of mapping.consumerFields) {
    const expected = getPath(segment, field);
    if (field === "variables" && expected && typeof expected === "object" && !Array.isArray(expected)) {
      for (const [key, value] of Object.entries(expected)) {
        if (canonicalJson(value) !== canonicalJson(receipt.variables?.[key])) {
          fail("native OM preview does not consume the exact Film variables." + key + " value");
        }
      }
      continue;
    }
    const observed = field === "templateId" ? receipt.templateId
      : field === "variables" ? receipt.variables
        : field.startsWith("variables.") ? getPath(receipt.variables, field.slice("variables.".length))
          : getPath(receipt, field);
    if (canonicalJson(expected) !== canonicalJson(observed)) fail("native OM preview does not consume the exact Film base field " + field);
  }
  return keyStateSummary(candidate, mapping, segment, image, receiptRef, {
    renderer: "laohu-native-om-template",
    sourceTemplateSha256: receipt.sourceTemplate?.sha256 || null,
  });
}

async function verifyNativeStyleSceneKeyState({ image, receiptRef, receipt, candidate, mapping, segment, resources }) {
  if (!["template", "component"].includes(candidate.resourceType) || !["base", "layer"].includes(mapping.role)) {
    fail("native-style-scene key-state must refer to a registered scene component in the Film consumer");
  }
  const registered = resourceRow(resources, candidate.resourceType, candidate.resourceId);
  const actual = resourceRow(resources, candidate.resourceType, receipt.templateId);
  const entry = resources.catalog.templates.find((item) => item.id === actual.id);
  if (registered.id !== actual.id || !entry || receipt.source?.id !== entry.sourceId
      || receipt.sourceFunction?.calls < 1 || receipt.sourceVerification?.ok !== true) {
    fail("native-style-scene preview did not execute the selected registered source function");
  }
  if (receipt.media?.format !== "png" || receipt.media?.sha256 !== image.sha256
      || resolveFrom(path.dirname(receiptRef.file), receipt.media.path, "native style scene preview path") !== image.file) {
    fail("native-style-scene key-state PNG path/hash differs from its renderer receipt");
  }
  const expectedSourceHash = entry.sourceEvidence?.sha256;
  if (expectedSourceHash && receipt.source?.sha256 !== expectedSourceHash) fail("native-style-scene preview source hash differs from the registered source");
  if (mapping.role === "base" && mapping.consumerFields.some((field) => ["templateId", "sourceCatalogId"].includes(field))
      && !mapping.consumerFields.some((field) => getPath(segment, field) === actual.id)) {
    fail("native-style-scene preview identity differs from the exact Film base consumer field");
  }
  return keyStateSummary(candidate, mapping, segment, image, receiptRef, {
    renderer: "native-style-scene",
    sourceFunction: receipt.sourceFunction.id,
    sourceSha256: receipt.source.sha256,
  });
}

function keyStateSummary(candidate, mapping, segment, image, receiptRef, extra = {}) {
  return {
    candidateId: candidate.id,
    resourceId: candidate.resourceId,
    filmSegmentId: segment.id,
    mappingId: mapping.id,
    imagePath: image.file,
    imageSha256: image.sha256,
    rendererReceiptPath: receiptRef.file,
    rendererReceiptSha256: receiptRef.sha256,
    ...extra,
    quality: "not-rated-by-machine",
  };
}

async function validateV2VerificationGates({ planDir, verification, outputs, keyStateProofs, blueprint, filmInput, filmVersion, plan, resources, preRender = false }) {
  object(verification, "plan.verification");
  onlyKeys(verification, new Set(["gates"]), "plan.verification");
  const gates = array(verification.gates, "plan.verification.gates");
  unique(gates, (row) => row.id, "verification gate");
  const picturePath = resolveFrom(planDir, outputs.picture, "plan.outputs.picture");
  const filmManifestPath = resolveFrom(planDir, outputs.filmManifest, "plan.outputs.filmManifest");
  let filmReceiptVerified = false;
  for (const gate of gates) {
    object(gate, "verification gate");
    onlyKeys(gate, new Set(["id", "inspect", "evidence", "redoReason", "scope", "criterionRef", "artifact", "observations", "reviewer", "status", "redoLocation"]), "verification gate");
    for (const key of ["id", "inspect", "evidence", "redoReason", "scope", "criterionRef", "observations", "status", "redoLocation"]) text(gate[key], "verification gate." + key);
    if (!new Set(["UNKNOWN", "OBSERVE", "PASS", "FAIL"]).has(gate.status)) fail("verification gate.status must be UNKNOWN, OBSERVE, PASS, or FAIL");
    if (gate.status === "UNKNOWN") {
      if (gate.artifact != null || gate.reviewer != null) fail("UNKNOWN verification gates must not claim a reviewed artifact or reviewer result");
      continue;
    }
    object(gate.reviewer, "verification gate.reviewer");
    onlyKeys(gate.reviewer, new Set(["identity", "kind"]), "verification gate.reviewer");
    text(gate.reviewer.identity, "verification gate.reviewer.identity");
    const reviewerKind = text(gate.reviewer.kind, "verification gate.reviewer.kind");
    if (!new Set(["creator", "independent-human", "recipient", "automated"]).has(reviewerKind)) fail("verification gate.reviewer.kind must be creator, independent-human, recipient, or automated");
    if (gate.status === "PASS" && ["creator", "automated"].includes(reviewerKind)) {
      fail("creator self-review and automated checks can only record OBSERVE; a human acceptance PASS needs an explicitly declared independent-human reviewer or recipient");
    }
    if (preRender) continue;
    object(gate.artifact, "verification gate.artifact");
    onlyKeys(gate.artifact, new Set(["path", "sha256", "frame", "frameRange", "mediaType"]), "verification gate.artifact");
    if (Boolean(gate.artifact.frame) === Boolean(gate.artifact.frameRange)) fail("verification gate.artifact must identify either one frame or a frame range");
    const artifactRef = await verifyFileReference(planDir, { path: gate.artifact.path, sha256: gate.artifact.sha256 }, "verification gate artifact");
    if (!isWithin(planDir, artifactRef.file)) fail("verification gate artifact must stay within the production-plan work folder");
    if (gate.artifact.mediaType != null) text(gate.artifact.mediaType, "verification gate.artifact.mediaType");
    if (gate.artifact.frame != null) {
      object(gate.artifact.frame, "verification gate.artifact.frame");
      onlyKeys(gate.artifact.frame, new Set(["filmSegmentId", "localFrame"]), "verification gate.artifact.frame");
      const filmSegmentId = text(gate.artifact.frame.filmSegmentId, "verification gate.artifact.frame.filmSegmentId");
      const localFrame = gate.artifact.frame.localFrame;
      if (!Number.isSafeInteger(localFrame) || localFrame < 0) fail("verification gate.artifact.frame.localFrame must be a nonnegative integer");
      const match = keyStateProofs.find((proof) => proof.imagePath === artifactRef.file && proof.imageSha256 === artifactRef.sha256
        && proof.filmSegmentId === filmSegmentId && proof.frameIndex === localFrame);
      if (!match) fail("verification gate frame artifact must be the exact pixel-verified selected key-state frame and hash; reviewer text alone is not media evidence");
    } else {
      object(gate.artifact.frameRange, "verification gate.artifact.frameRange");
      onlyKeys(gate.artifact.frameRange, new Set(["coordinateSystem", "filmSegmentId", "startFrame", "endFrame"]), "verification gate.artifact.frameRange");
      if (text(gate.artifact.frameRange.coordinateSystem, "verification gate.artifact.frameRange.coordinateSystem") !== "film-global") {
        fail("verification gate frameRange coordinates must be explicit Film-global frames");
      }
      const filmSegmentId = text(gate.artifact.frameRange.filmSegmentId, "verification gate.artifact.frameRange.filmSegmentId");
      const startFrame = gate.artifact.frameRange.startFrame;
      const endFrame = gate.artifact.frameRange.endFrame;
      if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrame) || startFrame < 0 || endFrame < startFrame) fail("verification gate frameRange must contain a valid inclusive range");
      if (artifactRef.file !== picturePath) fail("verification gate frameRange must reference the declared rendered Film picture output");
      const { value: manifest } = await readJson(filmManifestPath, "verification gate Film /2 artifact receipt");
      if (manifest.format !== "laohu.motion-film-manifest/2" || manifest.output?.sha256 !== artifactRef.sha256
          || manifest.source?.blueprintSha256 !== filmInput.sha256
          || resolveFrom(path.dirname(filmManifestPath), manifest.output?.path, "verification gate Film output") !== picturePath) {
        fail("verification gate frameRange does not bind the actual declared Film /2 picture artifact");
      }
      if (!filmReceiptVerified) {
        await inspectFilmReceipt({ plan, blueprint, filmVersion, filmInput, resources }, { picture: picturePath, filmManifest: filmManifestPath });
        filmReceiptVerified = true;
      }
      const segment = blueprint.segments.find((row) => row.id === filmSegmentId);
      const renderedSegment = manifest.segments?.find((row) => row.id === filmSegmentId);
      const frameRange = renderedSegment?.frameRange;
      const expectedStartFrame = segment ? Math.ceil(segment.startSec * blueprint.fps - 1e-9) : null;
      const expectedEndFrame = segment ? Math.ceil(segment.endSec * blueprint.fps - 1e-9) : null;
      if (!segment || !renderedSegment || !frameRange
          || !Number.isSafeInteger(frameRange.startFrame) || !Number.isSafeInteger(frameRange.endFrame)
          || frameRange.startFrame !== expectedStartFrame || frameRange.endFrame !== expectedEndFrame
          || startFrame < frameRange.startFrame || endFrame >= frameRange.endFrame || endFrame >= manifest.render?.frameCount) {
        fail("verification gate Film-global frameRange must stay inside the actual rendered frameRange of its named Film segment");
      }
    }
  }
  return gates;
}

async function verifyPriorFilm(validated, outputs) {
  const receipt = await inspectFilmReceipt(validated, outputs);
  if (typeof receipt.durationSec !== "number" || receipt.durationSec !== validated.audioPlan.durationSec) {
    fail("audio-plan duration " + validated.audioPlan.durationSec + " does not equal the rendered Film receipt duration " + receipt.durationSec + "; preserve both contracts and revise the corresponding plan inputs before mixing");
  }
  return receipt;
}

async function verifyPriorDirectorDesignReceipt(validated, ctx, filmEvidence) {
  if (validated.plan.format !== PLAN_FORMAT_V3 && !isFormalV4OrV5(validated.plan)) return null;
  const entries = await fs.readdir(ctx.validationRoot).catch((error) => fail("could not inspect this work's run receipts before reusing Film: " + error.message));
  const matchingArtifacts = [];
  for (const name of entries.filter((item) => item.endsWith(".json") && item !== path.basename(ctx.receiptPath))) {
    const file = path.join(ctx.validationRoot, name);
    let prior;
    try { prior = JSON.parse(await fs.readFile(file, "utf8")); } catch { continue; }
    const priorFilm = prior.artifacts?.film;
    if (prior.format !== "laohu.motion.production-plan-run-receipt/1" || !priorFilm) continue;
    if (path.resolve(priorFilm.file || "") !== path.resolve(filmEvidence.file)
        || priorFilm.sha256 !== filmEvidence.sha256
        || priorFilm.picture?.sha256 !== filmEvidence.picture?.sha256) continue;
    matchingArtifacts.push({ file, prior });
  }
  if (!matchingArtifacts.length) {
    fail("cannot reuse a V3 Film for audio-only rendering without a prior production-plan run receipt binding this exact Film manifest/picture to the current director design and audio timing identity; run the full production chain once");
  }
  const expected = {
    creativeDesignIdentitySha256: validated.creativeDesignIdentitySha256 ?? null,
    creativeDesignId: validated.creativeDesignId ?? null,
    directorDesignIdentitySha256: validated.directorDesignIdentitySha256,
    filmDesignIdentitySha256: validated.filmDesignIdentitySha256,
    boundDirectorDesignIdentitySha256: validated.boundDirectorDesignIdentitySha256,
    boundFilmDesignIdentitySha256: validated.boundFilmDesignIdentitySha256,
    timingIdentitySha256: validated.timingIdentitySha256,
    filmBlueprintSha256: validated.filmInput.sha256,
  };
  const matched = matchingArtifacts.find(({ prior }) => {
    const binding = prior.designBinding || {};
    return prior.inputHashes?.filmBlueprint === expected.filmBlueprintSha256
      && (expected.creativeDesignIdentitySha256 == null || binding.creativeDesignIdentitySha256 === expected.creativeDesignIdentitySha256)
      && (expected.creativeDesignIdentitySha256 == null || prior.inputHashes?.creativeDesignIdentity === expected.creativeDesignIdentitySha256)
      && binding.filmDesignIdentitySha256 === expected.filmDesignIdentitySha256
      && binding.boundFilmDesignIdentitySha256 === expected.boundFilmDesignIdentitySha256
      && binding.timingIdentitySha256 === expected.timingIdentitySha256;
  });
  if (!matched) {
    fail("reused Film bytes are real, but no prior run receipt proves they were rendered against this V3 visual/action design, synchronized audio cues, and canonical timing; rerun Film after changing those dependencies");
  }
  return { receiptPath: matched.file, designBinding: expected };
}

async function captureProjectShotKeyStates(validated, ctx, ffmpeg) {
  const requests = validated.projectShotFrameRequests || [];
  if (!requests.length) return [];
  if (validated.filmVersion !== 2) fail("project-shot key-state capture requires Film Blueprint /2");
  const manifestPath = ctx.outputs.filmManifest;
  const { value: manifest } = await readJson(manifestPath, "rendered Film /2 manifest for key-state capture");
  if (manifest.format !== "laohu.motion-film-manifest/2" || manifest.source?.blueprintSha256 !== validated.filmInput.sha256) {
    fail("post-render key-state capture requires the actual Film /2 manifest bound to the submitted blueprint");
  }
  const picturePath = resolveFrom(path.dirname(manifestPath), manifest.output?.path, "rendered Film /2 picture output path");
  if (picturePath !== ctx.outputs.picture) fail("post-render key-state capture must use the exact declared final Film picture output");
  const pictureSha256 = await hashFile(picturePath);
  if (manifest.output?.sha256 !== pictureSha256) fail("post-render key-state capture requires the hash-verified final Film picture");
  const captureName = safeName(path.basename(ctx.receiptPath, path.extname(ctx.receiptPath)) + "-" + makeRunId());
  const captureRoot = path.join(ctx.tempRoot, "key-states", captureName);
  if (await findDevice(captureRoot) !== (await fs.stat(ctx.workRoot)).dev) fail("project-shot key-state captures must stay on the selected project's work volume");
  await fs.mkdir(captureRoot, { recursive: true });
  const decoder = ffmpeg || process.env.MOTION_FFMPEG || "ffmpeg";
  const manifestSha256 = await hashFile(manifestPath);
  const captures = [];
  for (const [index, request] of requests.entries()) {
    const row = array(manifest.segments, "rendered Film /2 segments", { allowEmpty: true }).find((item) => item.id === request.filmSegmentId);
    if (!row || row.renderer !== "laohu-project-shot" || !Number.isSafeInteger(row.expectedFrameCount)
        || request.frameIndex >= row.expectedFrameCount || row.observedFrameCount !== row.expectedFrameCount) {
      fail("selected project-shot key-state frame is not inside its actual rendered Film segment " + request.filmSegmentId);
    }
    const frameRange = object(row.frameRange, "rendered project-shot frameRange " + request.filmSegmentId);
    if (!Number.isSafeInteger(frameRange.startFrame) || !Number.isSafeInteger(frameRange.endFrame)
        || frameRange.startFrame < 0 || frameRange.endFrame - frameRange.startFrame !== row.expectedFrameCount) {
      fail("selected project-shot key-state frame requires the exact rendered segment frameRange " + request.filmSegmentId);
    }
    const globalFrameIndex = frameRange.startFrame + request.frameIndex;
    if (!Number.isSafeInteger(globalFrameIndex) || globalFrameIndex >= manifest.render?.frameCount) {
      fail("selected project-shot global frame falls outside the final Film picture " + request.filmSegmentId);
    }
    const base = object(row.baseSource, "rendered project-shot baseSource");
    const imageName = [request.candidateId, request.filmSegmentId, "frame-" + request.frameIndex, String(index)].map(safeName).join("-") + ".png";
    const imagePath = path.join(captureRoot, imageName);
    await assertFresh(imagePath, "project-shot selected key-state PNG");
    const result = spawnSync(decoder, ["-hide_banner", "-loglevel", "error", "-i", picturePath,
      "-vf", `select=eq(n\\,${globalFrameIndex})`, "-fps_mode", "vfr", "-frames:v", "1", imagePath],
    { encoding: "utf8", timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
    if (result.error) fail("could not capture selected project-shot frame with FFmpeg: " + result.error.message);
    if (result.status !== 0) fail("FFmpeg failed to capture selected project-shot frame: " + (result.stderr || "unknown FFmpeg error"));
    const imageSha256 = await hashFile(imagePath).catch((error) => fail("selected project-shot frame PNG was not created: " + error.message));
    validatePngBytes(await fs.readFile(imagePath), "generated project-shot key-state PNG");
    const proof = {
      phase: request.phase,
      path: path.relative(validated.planDir, imagePath).split(path.sep).join("/"),
      sha256: imageSha256,
      observation: "Runner-generated technical extraction of final Film-global frame " + globalFrameIndex
        + " corresponding to local segment frame " + request.frameIndex + " in " + request.filmSegmentId + "; no aesthetic rating is implied.",
      rendererReceipt: {
        path: path.relative(validated.planDir, manifestPath).split(path.sep).join("/"),
        sha256: manifestSha256,
      },
      filmSegmentId: request.filmSegmentId,
      mappingId: request.mappingId,
      frameIndex: request.frameIndex,
      globalFrameIndex,
      filmPictureSha256: pictureSha256,
    };
    captures.push({
      candidateId: request.candidateId,
      resourceId: request.resourceId,
      filmSegmentId: request.filmSegmentId,
      mappingId: request.mappingId,
      frameIndex: request.frameIndex,
      globalFrameIndex,
      imagePath,
      imageSha256,
      rendererReceiptPath: manifestPath,
      rendererReceiptSha256: manifestSha256,
      quality: "not-rated-by-machine",
      proof,
    });
  }
  return captures;
}

function planWithCapturedProjectShotProofs(validated, captures) {
  const plan = structuredClone(validated.plan);
  const byCandidate = new Map();
  for (const capture of captures) {
    if (!byCandidate.has(capture.candidateId)) byCandidate.set(capture.candidateId, []);
    byCandidate.get(capture.candidateId).push(capture);
  }
  for (const decision of plan.directionDecisions || []) {
    const candidate = decision.candidates?.find((row) => row.id === decision.selectedCandidateId);
    const evidence = byCandidate.get(candidate?.id);
    if (!candidate || !evidence) continue;
    const planned = candidate.keyStateEvidence || [];
    const consumed = new Set();
    candidate.keyStateEvidence = planned.map((row) => {
      const matchIndex = evidence.findIndex((item, index) => !consumed.has(index)
        && item.filmSegmentId === row.filmSegmentId && item.mappingId === row.mappingId && item.frameIndex === row.frameIndex);
      if (matchIndex < 0) return row;
      consumed.add(matchIndex);
      return evidence[matchIndex].proof;
    });
    if (consumed.size !== evidence.length) fail("post-render key-state captures do not match the exact selected project-shot frame requests");
  }
  return plan;
}

async function validateRenderedProductionPlan(validated, ctx, ffmpeg) {
  const captures = await captureProjectShotKeyStates(validated, ctx, ffmpeg);
  const verified = await validatePlanFile(validated.planPath, {
    ffmpeg,
    planOverride: planWithCapturedProjectShotProofs(validated, captures),
    sourcePlanBytes: validated.planBytes,
  });
  return { verified, captures };
}

async function execute(args) {
  const stage = args.command === "run" ? "all" : args.command === "render-film" ? "film" : "audio";
  let validationStage = "plan-preflight";
  let validated = null;
  let ctx = null;
  const receipt = {
    format: "laohu.motion.production-plan-run-receipt/1",
    planPath: args.plan,
    planFormat: null,
    supportedRoute: { renderer: "scripts/templates.mjs render --film-blueprint", finalAudioConsumer: "scripts/audio.mjs" },
    inputHashes: {},
    artifacts: {},
    stages: [],
    failure: null,
  };
  try {
    validated = await validatePlanFile(args.plan, { ffmpeg: args.ffmpeg, executionPhase: "pre-render" });
    receipt.planFormat = validated.plan.format;
    receipt.designBinding = validated.plan.format === PLAN_FORMAT_V3 || isFormalV4OrV5(validated.plan) ? {
      creativeDesignId: validated.creativeDesignId ?? null,
      creativeDesignIdentitySha256: validated.creativeDesignIdentitySha256 ?? null,
      directorDesignIdentitySha256: validated.directorDesignIdentitySha256,
      filmDesignIdentitySha256: validated.filmDesignIdentitySha256,
      boundDirectorDesignIdentitySha256: validated.boundDirectorDesignIdentitySha256,
      boundFilmDesignIdentitySha256: validated.boundFilmDesignIdentitySha256,
      timingIdentitySha256: validated.timingIdentitySha256,
      synchronizedAudioUses: validated.synchronizedAudioUses,
    } : null;
    receipt.inputHashes.filmBlueprint = validated.filmInput.sha256;
    receipt.inputHashes.audioPlan = validated.audioInput.sha256;
    receipt.inputHashes.directorDesignIdentity = validated.directorDesignIdentitySha256;
    receipt.inputHashes.timingIdentity = validated.timingIdentitySha256;
    if (stage === "all" || stage === "audio") {
      const selectedCandidateIds = validated.audioPreview.candidateAssetIds;
      const usedCandidateIds = validated.audioPreview.usedCandidateAssetIds;
      if (args.allowUnreviewedPreview && selectedCandidateIds.length === 0) {
        fail("--allow-unreviewed-preview needs plan.audioPreview.candidateAssetIds to explicitly select candidate-unreviewed assets used by this audio plan");
      }
      if (!args.allowUnreviewedPreview && usedCandidateIds.length) {
        fail("audio plan uses candidate-unreviewed assets " + usedCandidateIds.join(", ")
          + "; declare those exact used IDs in plan.audioPreview.candidateAssetIds and pass --allow-unreviewed-preview for technical inspection");
      }
      if (selectedCandidateIds.length && !args.allowUnreviewedPreview) {
        fail("plan.audioPreview selects unreviewed candidates; pass --allow-unreviewed-preview to authorize only this technical audio render");
      }
    }
    receipt.supportedRoute.filmBlueprint = validated.filmVersion === 1 ? "/1" : "/2";
    receipt.supportedRoute.audioPlan = "/1";
    receipt.audioPreview = {
      requested: Boolean(args.allowUnreviewedPreview),
      selectedCandidateAssetIds: validated.audioPreview.candidateAssetIds,
      generatedPreviewAllowed: false,
      boundary: "This flag maps only to audio.mjs --allow-candidate for explicitly selected candidate-unreviewed assets; it never grants generated audio.",
    };
    receipt.inputHashes = {
      productionPlan: validated.plan.format === PLAN_FORMAT_V1 ? validated.planSha256 : validated.executionPlanSha256,
      productionPlanDocument: validated.planSha256,
      filmBlueprint: validated.filmInput.sha256,
      audioPlan: validated.audioInput.sha256,
      creativeDesignIdentity: validated.creativeDesignIdentitySha256 ?? null,
      directorDesignIdentity: validated.directorDesignIdentitySha256,
      filmDesignIdentity: validated.filmDesignIdentitySha256,
      boundFilmDesignIdentity: validated.boundFilmDesignIdentitySha256,
      timingIdentity: validated.timingIdentitySha256,
    };
    ctx = await createRunContext(args, validated);
    receipt.workRoot = ctx.workRoot;
    receipt.cachePath = path.relative(ctx.workRoot, ctx.tempRoot);
    receipt.receiptPath = ctx.receiptPath;
    await ensureOutputParents(ctx.outputs);

    if (stage === "all" || stage === "film") {
      validationStage = "film-render";
      for (const key of ["picture", "filmManifest"]) await assertFresh(ctx.outputs[key], "Film output " + key);
      const commandArgs = [templatesCli, "render", "--film-blueprint", validated.filmInput.file,
        "--output", ctx.outputs.picture, "--manifest", ctx.outputs.filmManifest, "--work-root", ctx.workRoot];
      if (args.ffmpeg) commandArgs.push("--ffmpeg", args.ffmpeg);
      if (args.browser) commandArgs.push("--browser", args.browser);
      const stdout = run(process.execPath, commandArgs, "existing templates.mjs Film renderer", ctx.env);
      validationStage = "film-receipt";
      const filmEvidence = await inspectFilmReceipt(validated, ctx.outputs);
      receipt.artifacts.film = filmEvidence;
      receipt.stages.push({ id: "film", consumer: "scripts/templates.mjs render --film-blueprint", commandOutput: stdout.trim(), receipt: filmEvidence });
      if (validated.plan.format !== PLAN_FORMAT_V1) {
        validationStage = "post-render-production-proof";
        const { verified, captures } = await validateRenderedProductionPlan(validated, ctx, args.ffmpeg);
        validated = verified;
        receipt.artifacts.projectShotKeyStates = captures.map(({ proof, ...capture }) => ({
          ...capture,
          imagePath: path.relative(ctx.workRoot, capture.imagePath).split(path.sep).join("/"),
          rendererReceiptPath: path.relative(ctx.workRoot, capture.rendererReceiptPath).split(path.sep).join("/"),
          planProof: proof,
        }));
        receipt.stages.push({
          id: "post-render-production-proof",
          consumer: "production-plan actual Film /2, child receipt, source mapping and selected-frame verification",
          keyStateCount: captures.length,
          keyStates: receipt.artifacts.projectShotKeyStates,
          quality: "not-rated-by-machine",
        });
      }
    }

    if (stage === "all" || stage === "audio") {
      if (!receipt.artifacts.film) {
        validationStage = "film-receipt";
        receipt.artifacts.film = await verifyPriorFilm(validated, ctx.outputs);
        if (validated.plan.format === PLAN_FORMAT_V3 || isFormalV4OrV5(validated.plan)) {
          receipt.artifacts.reusedDesignBinding = await verifyPriorDirectorDesignReceipt(validated, ctx, receipt.artifacts.film);
        }
        receipt.stages.push({ id: "film-input", consumer: "existing Film receipt and rendered media", receipt: receipt.artifacts.film });
        if (validated.plan.format !== PLAN_FORMAT_V1) {
          validationStage = "post-render-production-proof";
          const { verified, captures } = await validateRenderedProductionPlan(validated, ctx, args.ffmpeg);
          validated = verified;
          receipt.artifacts.projectShotKeyStates = captures.map(({ proof, ...capture }) => ({
            ...capture,
            imagePath: path.relative(ctx.workRoot, capture.imagePath).split(path.sep).join("/"),
            rendererReceiptPath: path.relative(ctx.workRoot, capture.rendererReceiptPath).split(path.sep).join("/"),
            planProof: proof,
          }));
          receipt.stages.push({
            id: "post-render-production-proof",
            consumer: "production-plan existing Film /2, child receipt, source mapping and selected-frame verification",
            keyStateCount: captures.length,
            keyStates: receipt.artifacts.projectShotKeyStates,
            quality: "not-rated-by-machine",
          });
        }
      }
      if (receipt.artifacts.film.durationSec !== validated.audioPlan.durationSec) {
        fail("audio-plan duration " + validated.audioPlan.durationSec + " does not equal the existing Film receipt duration " + receipt.artifacts.film.durationSec + "; preserve both clocks and revise the correct upstream input");
      }
      validationStage = "audio-render";
      for (const key of ["audioWav", "audioManifest", "finalVideo"]) await assertFresh(ctx.outputs[key], "audio output " + key);
      const assetIndex = inputsAssetIndex(validated, ctx.outputs);
      const audioCache = path.join(ctx.tempRoot, "audio");
      await fs.mkdir(audioCache, { recursive: true });
      const commandArgs = [audioCli, "--plan", validated.audioInput.file, "--asset-index", assetIndex,
        "--output", ctx.outputs.audioWav, "--manifest", ctx.outputs.audioManifest, "--cache-dir", audioCache,
        "--video", ctx.outputs.picture, "--final-output", ctx.outputs.finalVideo];
      if (args.allowUnreviewedPreview) commandArgs.push("--allow-candidate");
      if (validated.inputsAudioScene) commandArgs.push("--scene", validated.inputsAudioScene);
      if (args.ffmpeg) commandArgs.push("--ffmpeg", args.ffmpeg);
      const stdout = run(process.execPath, commandArgs, "existing audio.mjs final mixer", ctx.env);
      validationStage = "audio-receipt";
      const { value: audioReceipt } = await readJson(ctx.outputs.audioManifest, "audio.mjs receipt");
      if (audioReceipt.kind !== "audio-usage-manifest" || audioReceipt.schemaVersion !== 1) fail("audio.mjs did not return its audio-plan/1 usage receipt");
      if (audioReceipt.planSha256 !== validated.audioInput.sha256) fail("audio.mjs receipt does not bind the exact audio-plan input hash");
      if (audioReceipt.videoProbe == null) fail("audio.mjs receipt omitted the rendered Film video probe");
      if (audioReceipt.mux?.output !== ctx.outputs.finalVideo) fail("audio.mjs receipt did not bind the declared finalVideo output");
      const usedAudioAssets = array(audioReceipt.usedAssets || [], "audio.mjs receipt.usedAssets", { allowEmpty: true });
      const candidateAudioAssetIds = usedAudioAssets.filter((asset) => asset.reviewStatus === "candidate-unreviewed").map((asset) => asset.id).sort();
      const declaredCandidateAudioAssetIds = [...validated.audioPreview.candidateAssetIds].sort();
      if (audioReceipt.generatedPreviewAllowed === true) fail("audio.mjs receipt unexpectedly enabled generated-audio preview");
      if (candidateAudioAssetIds.length && !args.allowUnreviewedPreview) fail("audio.mjs used candidate-unreviewed assets without production-plan preview authorization");
      if (args.allowUnreviewedPreview && audioReceipt.candidatePreviewAllowed !== true) fail("audio.mjs receipt does not preserve --allow-candidate authorization");
      if (canonicalJson(candidateAudioAssetIds) !== canonicalJson(declaredCandidateAudioAssetIds)) {
        fail("audio.mjs receipt candidate asset statuses differ from the exact production-plan audioPreview selection");
      }
      if (candidateAudioAssetIds.length && audioReceipt.technicalPreview !== true) fail("audio.mjs did not mark the candidate-unreviewed mix as a technical preview");
      const finalHash = await hashFile(ctx.outputs.finalVideo);
      const wavHash = await hashFile(ctx.outputs.audioWav);
      if (audioReceipt.outputWavSha256 !== wavHash) fail("audio WAV bytes differ from the actual audio.mjs receipt hash");
      receipt.artifacts.audio = {
        consumer: "scripts/audio.mjs",
        manifestPath: ctx.outputs.audioManifest,
        manifestSha256: await hashFile(ctx.outputs.audioManifest),
        wavPath: ctx.outputs.audioWav,
        wavSha256: wavHash,
        audioStream: audioReceipt.audioStream,
        technicalPreview: audioReceipt.technicalPreview === true,
        candidatePreviewAllowed: audioReceipt.candidatePreviewAllowed === true,
        generatedPreviewAllowed: audioReceipt.generatedPreviewAllowed === true,
        sourceStatuses: usedAudioAssets.map((asset) => ({
          assetId: asset.id,
          reviewStatus: asset.reviewStatus || null,
          sha256: asset.actualSha256 || asset.sha256 || null,
          sourcePage: asset.source?.page || asset.sourcePage || null,
        })),
        finalVideoPath: ctx.outputs.finalVideo,
        finalVideoSha256: finalHash,
        mux: audioReceipt.mux,
      };
      receipt.stages.push({ id: "audio", consumer: "scripts/audio.mjs --plan", commandOutput: stdout.trim(), receipt: receipt.artifacts.audio });
    }
    receipt.completed = true;
    receipt.completedAt = new Date().toISOString();
    await fs.writeFile(ctx.receiptPath, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    process.stdout.write("PRODUCTION_PLAN_RECEIPT " + ctx.receiptPath + "\n" + JSON.stringify(receipt, null, 2) + "\n");
    return;
  } catch (error) {
    if (error.code === "TECHNICAL_PROBE_PRODUCTION_BOUNDARY") validationStage = "technical-probe-boundary";
    receipt.completed = false;
    receipt.completedAt = new Date().toISOString();
    receipt.failure = { stage: validationStage, reason: error.message, redoReason: redoReason(validationStage, error) };
    if (ctx?.receiptPath) {
      await fs.writeFile(ctx.receiptPath, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" }).catch(() => {});
      process.stderr.write("PRODUCTION_PLAN_RECEIPT " + ctx.receiptPath + "\n");
    } else {
      process.stderr.write("STAGE_FAIL " + validationStage + "\nREDO_REASON " + redoReason(validationStage, error) + "\n");
    }
    throw error;
  }
}

function inputsAssetIndex(validated) {
  return validated.inputsAssetIndex || path.join(skillDir, "assets", "audio", "index.json");
}

export function directorDesignMarkdown(design, canonicalTimeline = null, productionConsumers = null, hasAudioPlan = false, captionManifest = null) {
  const sectionLabels = {
    sourceClockAndCoverage: "输入、时钟与覆盖",
    contentLogic: "内容关系",
    globalVisualWorld: "全局视听世界",
    objectsMaterialsAndText: "对象、材质与文字",
    compositionAndState: "镜头空间与状态",
    cueByCuePicture: "逐句／逐 cue 画面",
    actionsAndContinuity: "动作、转场与连续性",
    soundAndMix: "音轨与混音",
    resourcesAndConsumers: "资源与真实消费者",
    reverseReview: "反向检查",
  };
  const lines = [
    "<!-- laohu-motion-export-design/1 -->",
    "<!-- design-id: " + design.id + " -->",
    "<!-- director-design-identity-sha256: " + directorDesignIdentity(design) + " -->",
    "# 动画导演设计",
    "",
    `> 本文由 ${design.format === "laohu.motion.director-design/3" ? "production-plan/4 的 directorDesign/3" : "production-plan/3 的 directorDesign/2"} 单一 JSON 真源导出。修改设计请改 JSON 后重新运行 export-design；不要手动维护第二份设计稿。`,
    "",
  ];
  const global = design.globalSettings;
  const plan = productionConsumers?.plan || null;
  const productionVerified = productionConsumers?.verified === true;
  const filmMappingIds = productionConsumers?.filmMappingIds || new Set();
  const audioTracks = productionConsumers?.audioTracks || new Map();
  const audioEvents = productionConsumers?.audioEvents || new Map();
  const planRows = plan?.implementationPlan || [];
  const filmConsumer = (implementationPlanId, mappingId = null) => {
    const implementation = planRows.find((row) => row.id === implementationPlanId);
    const actualMappingId = mappingId || implementation?.mappingId || null;
    const label = productionVerified && actualMappingId && filmMappingIds.has(actualMappingId)
      ? "已核验生产消费" : "计划消费者（待绑定生产收据）";
    return `${label} ${implementationPlanId}${actualMappingId ? "/" + actualMappingId : ""}`;
  };
  const cueOrder = design.units.flatMap((unit, unitIndex) => (unit.scriptCues || []).map((cue, cueIndex) => ({ unit, unitIndex, cue, cueIndex })));
  const cuePositionById = new Map(cueOrder.map((row, index) => [row.cue.id, index]));
  const nextCueById = new Map(cueOrder.map((row, index) => [row.cue.id, cueOrder[index + 1] || null]));
  const cueById = new Map(cueOrder.map((row) => [row.cue.id, row]));
  const cuesByUnitId = new Map(design.units.map((unit) => [unit.viewingUnitId, unit.scriptCues || []]));
  const audioUse = (kind, ids, records) => {
    if (!ids.length) return `无${kind}计划`;
    if (!productionVerified) {
      return `计划${kind} ${ids.join("、")}（${hasAudioPlan ? "待绑定生产收据" : "AudioPlan 未提供，待绑定；不得视为实际消费"}）`;
    }
    return ids.map((id) => {
      const row = records.get(id);
      const state = row?.audible === true || row?.rendered === true ? "已核验生产消费" : "已核验生产收据（无可听事件标记）";
      return `${state} ${id}`;
    }).join("；");
  };
  const formatTime = canonicalTimeline ? (sample) => {
    const totalMilliseconds = Math.round(sample * 1000 / canonicalTimeline.sampleRateHz);
    const minutes = Math.floor(totalMilliseconds / 60000);
    const wholeSeconds = Math.floor(totalMilliseconds / 1000) % 60;
    const milliseconds = totalMilliseconds % 1000;
    return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  } : null;
  const cueRowsFor = (cue) => {
    if (!canonicalTimeline || !["token-range", "segment-range"].includes(cue.source.kind)) return [];
    const kind = cue.source.kind;
    return canonicalTimeline.rowsByOccurrenceKind.get(kind + "::" + cue.source.occurrenceId) || [];
  };
  const cueSampleRange = (cue) => {
    if (!canonicalTimeline || !["token-range", "segment-range"].includes(cue.source.kind)) return null;
    const rows = cueRowsFor(cue);
    if (!rows.length) return null;
    const kind = cue.source.kind;
    const startId = cue.source[kind === "token-range" ? "startTokenId" : "startSegmentId"];
    const endId = cue.source[kind === "token-range" ? "endTokenId" : "endSegmentId"];
    const startIndex = rows.findIndex((row) => row.id === startId);
    const endIndex = rows.findIndex((row) => row.id === endId);
    if (startIndex < 0 || endIndex < startIndex) return null;
    return { startSample: rows[startIndex].targetRange.startSample, endSample: rows[endIndex].targetRange.endSample };
  };
  const cueTime = (cue) => {
    const range = cueSampleRange(cue);
    if (!range) return "无可信采样时码；采用未同步语义预算";
    return `${formatTime(range.startSample)}–${formatTime(range.endSample)}（项目采样时钟）`;
  };
  const actionCueIds = (action) => [...new Set([
    ...(action.triggerCueIds || []), action.timing?.startCueId, action.timing?.endCueId,
  ].filter(Boolean))];
  const actionSourceRange = (action) => actionCueIds(action).map((id) => {
    const row = cueById.get(id);
    return row ? `${id}：${cueSourceText(row.cue)}` : id;
  }).join("；") || "无源 presentation";
  const actionTime = (action) => {
    const timing = action.timing || {};
    if (timing.basis !== "canonical-target-samples") return "语义预算（未同步；没有可信秒数）";
    const startCue = cueById.get(timing.startCueId)?.cue;
    const endCue = cueById.get(timing.endCueId)?.cue;
    const startRange = startCue && cueSampleRange(startCue);
    const endRange = endCue && cueSampleRange(endCue);
    if (!canonicalTimeline || !startRange || !endRange
        || !Number.isSafeInteger(timing.startOffsetSamples) || !Number.isSafeInteger(timing.endOffsetSamples)) {
      return "未同步（缺少可核实的 canonical 采样范围；不编造秒数）";
    }
    const startSample = startRange.startSample + timing.startOffsetSamples;
    const endSample = endRange.endSample + timing.endOffsetSamples;
    if (startSample < 0 || endSample <= startSample || endSample > canonicalTimeline.durationSamples) {
      return "未同步（canonical 采样范围不合法；不编造秒数）";
    }
    return `${formatTime(startSample)}–${formatTime(endSample)} 秒（项目采样时钟；${timing.startCueId} ${timing.startOffsetSamples >= 0 ? "+" : ""}${timing.startOffsetSamples} samples → ${timing.endCueId} ${timing.endOffsetSamples >= 0 ? "+" : ""}${timing.endOffsetSamples} samples）`;
  };
  const actionPrecisionBoundary = "这是该短语的起末边界；不声称短语内部有未测得的字级触发点。";
  const actionRelationshipText = (action) => action.timing.relationship.trim().endsWith(actionPrecisionBoundary)
    ? action.timing.relationship.trim().slice(0, -actionPrecisionBoundary.length).replace(/[；;，,。\s]+$/u, "").trim()
    : action.timing.relationship;
  const hasActionPrecisionBoundary = design.units.some((unit) => unit.actions.some((action) =>
    action.timing.relationship.trim().endsWith(actionPrecisionBoundary)));
  const cueSourceText = (cue) => {
    const source = cue.source;
    if (source.kind === "token-range") {
      const exactText = source.exactText;
      const words = cueRowsFor(cue);
      const startIndex = words.findIndex((row) => row.id === source.startTokenId);
      const endIndex = words.findIndex((row) => row.id === source.endTokenId);
      const selectedWords = startIndex >= 0 && endIndex >= startIndex ? words.slice(startIndex, endIndex + 1) : [];
      const selectedStart = selectedWords[0]?.targetRange.startSample;
      const selectedEnd = selectedWords.at(-1)?.targetRange.endSample;
      const normalizeWithoutPunctuation = (value) => String(value).normalize("NFC").replace(/[\p{P}\p{Z}\s]/gu, "");
      const matchingSegment = (canonicalTimeline?.transcriptSegmentsByOccurrence?.get(source.occurrenceId) || []).find((segment) =>
        selectedStart != null && segment.targetRange.startSample === selectedStart && segment.targetRange.endSample === selectedEnd
        && normalizeWithoutPunctuation(segment.text) === normalizeWithoutPunctuation(exactText));
      return matchingSegment
        ? `occurrence ${source.occurrenceId} / token ${source.startTokenId}–${source.endTokenId}：${exactText}；完整句读取自同 occurrence 的 transcriptSegment“${matchingSegment.text}”`
        : `occurrence ${source.occurrenceId} / token ${source.startTokenId}–${source.endTokenId}：${exactText}`;
    }
    if (source.kind === "segment-range") {
      return `occurrence ${source.occurrenceId} / segment ${source.startSegmentId}–${source.endSegmentId}：${source.exactText}（canonical transcriptSegment 原句）`;
    }
    if (source.kind === "script-line-range") return `稿件 ${source.materialId} 第 ${source.lineStart}–${source.lineEnd} 行：${source.exactText}`;
    return `无源 presentation：${source.reason}`;
  };
  const tableText = (value) => String(value).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
  const styleById = new Map(global.textStyles.map((style) => [style.id, style]));
  const frame = global.frame;

  lines.push("## " + sectionLabels.sourceClockAndCoverage, "", design.brief.sourceClockAndCoverage, "",
    "## " + sectionLabels.contentLogic, "", design.brief.contentLogic, "",
    "## " + sectionLabels.globalVisualWorld, "", design.brief.globalVisualWorld, "",
    "### 全局画面与样式", "",
    `- 画幅与帧率：${frame.width} × ${frame.height}，${frame.fps} fps`,
    `- 色彩关系：${global.look.palette}`,
    `- 表面材质：${global.look.surface}`,
    `- 光影：${global.look.lighting}`,
    `- 空间系统：${global.look.spatialSystem}`,
    `- 字体系统：${global.look.typography}`,
    `- 视觉层级：${global.look.hierarchy}`, "", "### 色彩角色", "");
  for (const role of global.colorRoles) lines.push(`- **${role.id}**（${role.value}）：${role.meaning}`);
  lines.push("", "### 文字样式", "");
  if (global.textStyles.length) {
    for (const style of global.textStyles) {
      lines.push(`- **${style.id}**（${style.role}）：${style.fontFamily} ${style.fontWeight}，${style.sizePx}px，行高 ${style.lineHeight}，字距 ${style.letterSpacing}，颜色角色 ${style.colorRoleId}；字体资源 ${style.fontMaterialId || "系统字体（生产时需真实加载／测量证据）"}；消费者 ${style.consumerMappings.map((consumer) => `${filmConsumer(consumer.implementationPlanId, consumer.mappingId)}〔family ${consumer.fontFamilyField}, weight ${consumer.fontWeightField}, size ${consumer.sizePxField}, color ${consumer.colorField}, lineHeight ${consumer.lineHeightField}, letterSpacing ${consumer.letterSpacingField}${consumer.fontFileField ? ", file " + consumer.fontFileField : ""}〕`).join("；")}`);
    }
  } else lines.push("本设计没有屏显文字样式。", "");

  lines.push("## " + sectionLabels.objectsMaterialsAndText, "", design.brief.objectsMaterialsAndText, "");
  for (const unit of design.units) {
    lines.push(`### ${unit.viewingUnitId}`, "", "#### 对象与可动部件", "");
    for (const item of unit.objects) {
      lines.push(`##### ${item.id}：${item.role}`, "", `- 表意：${item.meaning}`, `- 外观：${item.appearance}`,
        `- 前态：${item.initialState}`, `- 过程态：${item.processState}`, `- 后态：${item.resultState}`,
        "- Film 消费者：" + item.consumerRefs.map((ref) => `${filmConsumer(ref.implementationPlanId)}（${ref.responsibility}）`).join("；"), "");
      for (const part of item.movableParts || []) {
        lines.push(`- **可动部件 ${part.id}（${part.role}）**：${part.appearance}；前态 ${part.initialState}；过程态 ${part.processState}；后态 ${part.resultState}。消费者：${part.consumerRefs.map((ref) => `${filmConsumer(ref.implementationPlanId)}（${ref.responsibility}）`).join("；")}`);
      }
      lines.push("");
    }
  }

  lines.push("## " + sectionLabels.compositionAndState, "", design.brief.compositionAndState, "");
  for (const unit of design.units) {
    lines.push(`### ${unit.viewingUnitId}`, "", unit.designNarrative, "",
      `- 目的：${unit.purpose}`,
      `- 视觉增益：${unit.visualGain}`,
      `- 表现方式：${unit.representation}`,
      `- 构图：${unit.composition}`,
      `- 焦点顺序：${unit.focalOrder}`,
      `- 单元视觉继承：色彩 ${unit.look.palette}；材质 ${unit.look.surface}；光影 ${unit.look.lighting}；字体 ${unit.look.typography}`, "");
  }

  if (design.format === "laohu.motion.director-design/3") {
    const unitById = new Map(design.units.map((unit) => [unit.viewingUnitId, unit]));
    const phasesByCue = new Map();
    for (const phase of design.attentionPhases || []) for (const row of phase.anchors?.rows || []) {
      if (row.kind !== "caption") continue;
      const rows = phasesByCue.get(row.captionCueId) || [];
      rows.push(phase);
      phasesByCue.set(row.captionCueId, rows);
    }
    const plannedScreenTextRows = design.units.flatMap((unit) => (unit.scriptCues || []).flatMap((cue) =>
      cue.screenText?.mode === "planned" ? cue.screenText.items.map((item) => ({unit, cue, item})) : []));
    const plannedTextById = new Map(plannedScreenTextRows.map((row) => [row.item.id, row]));
    const phasesByScreenText = new Map();
    for (const phase of design.attentionPhases || []) for (const window of phase.readWindows || []) for (const id of window.screenTextIds || []) {
      const rows = phasesByScreenText.get(id) || [];
      rows.push(phase);
      phasesByScreenText.set(id, rows);
    }
    const captionStyle = global.captionStyle;
    const captionTextStyle = styleById.get(captionStyle?.textStyleId);
    const globalLookText = `${global.frame.width}×${global.frame.height} ${global.frame.fps}fps；色彩 ${global.look.palette}；材质 ${global.look.surface}；光影 ${global.look.lighting}；空间 ${global.look.spatialSystem}；视觉层级 ${global.look.hierarchy}`;
    const captionTime = (cue) => canonicalTimeline && formatTime
      ? `${formatTime(cue.displayWindow.startSample)}–${formatTime(cue.displayWindow.endSample)}（显示窗；${cue.speechSpan.timingPrecision}）`
      : `显示样本 ${cue.displayWindow.startSample}–${cue.displayWindow.endSample}（${cue.speechSpan.timingPrecision}）`;
    const screenTextTime = ({cue, item}) => {
      const visibility = item.visibility;
      if (canonicalTimeline && formatTime && visibility.basis === "canonical-target-samples") {
        const startCue = cueById.get(visibility.startCueId)?.cue;
        const endCue = cueById.get(visibility.endCueId)?.cue;
        const startRange = startCue && cueSampleRange(startCue);
        const endRange = endCue && cueSampleRange(endCue);
        if (startRange && endRange && Number.isSafeInteger(visibility.startOffsetSamples) && Number.isSafeInteger(visibility.endOffsetSamples)) {
          const start = startRange.startSample + visibility.startOffsetSamples;
          const end = endRange.endSample + visibility.endOffsetSamples;
          return `${formatTime(start)}–${formatTime(end)}（cue 锚定屏显窗；${visibility.startCueId} → ${visibility.endCueId}）`;
        }
      }
      return `语义预算 ${visibility.startCueId} → ${visibility.endCueId}（${visibility.retention}；不声称同步秒数）`;
    };
    const screenTextStyle = ({item}) => {
      const style = styleById.get(item.styleId);
      const color = global.colorRoles.find((role) => role.id === style?.colorRoleId)?.value || style?.colorRoleId || "未解析颜色角色";
      const consumers = (item.consumerRefs || []).map((ref) => filmConsumer(ref.implementationPlanId, ref.mappingId)).join("、") || "无已列 Film 消费映射";
      return `${item.id} ${item.role}：精确文字“${item.text}”；${item.styleId} ${style?.fontFamily || "未知字体"} ${style?.fontWeight || "未知字重"} ${style?.sizePx ?? "未知字号"}px、行高 ${style?.lineHeight ?? "未列"}、字距 ${style?.letterSpacing ?? "未列"}、颜色 ${color}；${item.layout.position}／${item.layout.region}／${item.layout.alignment}，最多 ${item.layout.maxLines} 行，背景 ${item.layout.background}，层级 ${item.layout.layerOrder}；显示 ${screenTextTime({cue: plannedScreenTextRows.find((row) => row.item.id === item.id)?.cue, item})}；阅读 ${item.readingWindow.startCueId} → ${item.readingWindow.endCueId}（跨 cue 保持 ${item.readingWindow.holdAcrossCues ? "是" : "否"}；${item.readingWindow.reason}）；消费者 ${consumers}`;
    };
    const captionScriptCues = (caption, phases) => cueOrder.filter(({unit, cue}) => {
      const sameUnitPhase = phases.filter((phase) => phase.viewingUnitId === unit.viewingUnitId);
      if (!sameUnitPhase.length) return false;
      const sourceOccurrenceId = cue.source?.occurrenceId;
      const captionOccurrenceId = caption.anchors?.[0]?.occurrenceId;
      const sourceRange = cueSampleRange(cue);
      const sourceOverlap = sourceOccurrenceId && sourceOccurrenceId === captionOccurrenceId && sourceRange
        && sourceRange.startSample < caption.speechSpan.endSample && caption.speechSpan.startSample < sourceRange.endSample;
      const actionLink = sameUnitPhase.some((phase) => (cue.actionIds || []).some((id) => phase.actionIds.includes(id)));
      const sharedReadTask = sameUnitPhase.some((phase) => phase.readWindows.some((window) =>
        window.captionCueIds.includes(caption.id) && window.screenTextIds.some((id) => plannedTextById.get(id)?.cue.id === cue.id)));
      return sourceOverlap || actionLink || sharedReadTask;
    });
    const phasesForScreenText = ({unit, cue, item}) => {
      const linked = phasesByScreenText.get(item.id) || [];
      if (linked.length) return linked;
      const range = cueSampleRange(cue);
      if (range) return (design.attentionPhases || []).filter((phase) => phase.viewingUnitId === unit.viewingUnitId
        && phase.anchors?.rows?.some((anchor) => anchor.kind === "caption" && captionManifest?.cues?.some((caption) =>
          caption.id === anchor.captionCueId && caption.anchors?.[0]?.occurrenceId === cue.source?.occurrenceId
          && range.startSample < caption.speechSpan.endSample && caption.speechSpan.startSample < range.endSample)));
      return (design.attentionPhases || []).filter((phase) => phase.viewingUnitId === unit.viewingUnitId
        && phase.anchors?.basis === "semantic-budget" && phase.anchors.cueIds.includes(cue.id));
    };
    const cameraAnchorText = (anchor) => anchor.captionCueId
      ? `字幕 ${anchor.captionCueId}/${anchor.tokenId || anchor.segmentId || "cue"} ${anchor.edge || ""}`.trim()
      : anchor.presentationId ? `presentation ${anchor.presentationId}`
        : anchor.occurrenceId ? `source clip ${anchor.occurrenceId} ${anchor.edge || ""}`.trim()
          : Number.isSafeInteger(anchor.frame) ? `semantic frame ${anchor.frame}` : canonicalJson(anchor);
    const phaseRowText = (phase) => {
      const unit = unitById.get(phase.viewingUnitId);
      const actions = phase.actionIds.map((id) => unit?.actions.find((row) => row.id === id)).filter(Boolean)
        .map((action) => `${action.id}：${actionTime(action)}；触发 ${actionCueIds(action).map((id) => `${id}（${actionSourceRange(action)}）`).join("、") || "无源 presentation／语义预算"}；${actionRelationshipText(action)}；${action.keyStates.map((state) => `${state.objectId} ${state.from}→${state.through}→${state.to}`).join("；")}；${action.pathOrMorph}`).join("；");
      const actors = phase.actorBindings.map((binding) => {
        const object = unit?.objects.find((row) => row.id === binding.actorId);
        const stateRows = phase.actionIds.map((id) => unit?.actions.find((row) => row.id === id)).filter(Boolean)
          .flatMap((action) => action.keyStates.filter((state) => state.objectId === binding.actorId));
        return `${binding.actorId}/${binding.role} ${object ? `外观 ${object.appearance}；` : ""}${binding.props.coordinateSpace}(${binding.props.x},${binding.props.y},${binding.props.width}×${binding.props.height},scale ${binding.props.scale},opacity ${binding.props.opacity},z ${binding.props.zIndex ?? 1}); 状态 ${stateRows.map((state) => `${state.from}→${state.through}→${state.to}`).join("；") || "按本阶段绑定保持"}; owner ${binding.owner} → ${binding.consumer}`;
      }).join("；");
      const camera = phase.camera.keyframes.map((key) => `${cameraAnchorText(key.anchor)} center ${key.center.join(",")} zoom ${key.zoom} rotation ${key.rotation}`).join("；");
      const windows = phase.readWindows.map((window) => `${window.id}/${window.taskId}/${window.groupId}：字幕 ${window.captionCueIds.join("、") || "无"}，计划文字 ${window.screenTextIds.join("、") || "无"}，范围 ${window.captionRange ? `${window.captionRange.startCueId}→${window.captionRange.endCueId}` : window.screenTextRange ? `${window.screenTextRange.startCueId}→${window.screenTextRange.endCueId}` : "无独立阅读范围"}；${window.reason}`).join("；");
      return `${phase.id}：${actions || "无新增动作；连续保持既有状态"}；${actors}；CameraRig ${camera}；阅读窗 ${windows || "本阶段无独立文字阅读窗"}；交接 ${phase.handoff.condition} / ${phase.handoff.entryState} / ${phase.handoff.visualHold}；完成 ${phase.completion.condition} → ${phase.completion.exitState}`;
    };
    lines.push("## 最终字幕与逐条视线设计", "",
      captionManifest?.cues?.length
        ? "以下逐条联结已核验 caption manifest、匹配的 D3 scriptCue/attention phase 与 Film 消费映射；字幕显示编辑独立于 edit-plan 和音频身份。"
        : plannedScreenTextRows.length
          ? "以下逐条联结 D3 planned screenText、语义或 canonical 显示窗、attention phase 与 Film 消费映射；没有字幕或 ASR 词时码的行明确保留语义预算。"
          : "本设计没有最终字幕或 planned screenText cue；不制造逐条阅读行。", "");
    const hasCueRows = Boolean(captionManifest?.cues?.length);
    const representedScreenTextIds = new Set();
    if (hasCueRows || plannedScreenTextRows.length) {
      lines.push("| 时间／字幕 | 主要观看任务／目标 | 具体画面与构图 | 动作、其他元素与交接 | 精确文字／样式／布局 | 声音／完成 |",
        "| --- | --- | --- | --- | --- | --- |");
    }
    for (const cue of captionManifest?.cues || []) {
      const phases = phasesByCue.get(cue.id) || [];
      const units = [...new Set(phases.map((phase) => phase.viewingUnitId))].map((id) => unitById.get(id)).filter(Boolean);
      const relatedScriptCues = captionScriptCues(cue, phases);
      const associatedText = plannedScreenTextRows.filter((row) =>
        relatedScriptCues.some((scriptRow) => scriptRow.cue.id === row.cue.id)
        || phases.some((phase) => phase.viewingUnitId === row.unit.viewingUnitId
          && phase.readWindows.some((window) => window.captionCueIds.includes(cue.id) && window.screenTextIds.includes(row.item.id))));
      associatedText.forEach((row) => representedScreenTextIds.add(row.item.id));
      const task = phases.map((phase) => `${phase.mainTask.description}；目标 ${phase.mainTask.actorIds.join("、")}`).join("；") || "缺少关联 attention phase";
      const cuePicture = relatedScriptCues.map(({unit, cue: scriptCue}) => `${scriptCue.id}：${scriptCue.visualNarration}；连续性 ${scriptCue.continuityIn} → ${scriptCue.continuityOut}；来源 ${cueSourceText(scriptCue)}；${unit.objects.map((object) => `${object.id} 外观 ${object.appearance}（${object.initialState} → ${object.processState} → ${object.resultState}）`).join("；")}`).join("；");
      const phaseActors = phases.map((phase) => phaseRowText(phase)).join("；");
      const picture = units.map((unit) => `${unit.designNarrative}；构图：${unit.composition}；局部 scriptCue：${cuePicture || "无直接来源 cue"}；${phaseActors}；全局值：${globalLookText}`).join("；") || `缺少完整画面叙述；${cuePicture}；${phaseActors}；全局值：${globalLookText}`;
      const phaseText = phases.map(phaseRowText).join("；");
      const styleText = captionStyle && captionTextStyle
        ? `${cue.lines.join(" / ")}；profile ${cue.profile}，${captionTextStyle.fontFamily} ${captionTextStyle.fontWeight} ${captionTextStyle.sizePx}px、行高 ${captionTextStyle.lineHeight}、字距 ${captionTextStyle.letterSpacing}、颜色 ${global.colorRoles.find((row) => row.id === captionTextStyle.colorRoleId)?.value}；${captionStyle.coordinateSpace} x${captionStyle.x} y${captionStyle.y} ${captionStyle.width}×${captionStyle.height} z${captionStyle.zIndex} ${captionStyle.alignment} max ${captionStyle.maxLines} 行 背景 ${captionStyle.background} padding ${captionStyle.paddingPx}px；Core.Captions 消费 props.captionManifest/props.captionStyle`
        : cue.lines.join(" / ");
      const plannedStyleText = associatedText.map(screenTextStyle).join("；");
      const sound = phases.map((phase) => `${phase.sound.eventIds.join("、") || "无独立音效"}；${phase.sound.reason}；${phase.completion.condition} → ${phase.completion.exitState}`).join("；");
      const captionTextTruth = `口播词 ${cue.lexicalText}；显示文案 ${cue.displayText}；分行 ${cue.lines.join(" / ")}`;
      lines.push(`| ${tableText(captionTime(cue) + " / " + cue.id)}：${tableText(captionTextTruth)} | ${tableText(task)} | ${tableText(picture)} | ${tableText(phaseText || "未绑定 attention phase")} | ${tableText([styleText, plannedStyleText].filter(Boolean).join("；"))} | ${tableText(sound || "无额外声音事件；完成状态见 attention phase")} |`);
    }
    for (const row of plannedScreenTextRows) {
      if (representedScreenTextIds.has(row.item.id)) continue;
      const phases = phasesForScreenText(row);
      const task = phases.map((phase) => `${phase.mainTask.description}；目标 ${phase.mainTask.actorIds.join("、")}`).join("；") || "无独立 phase；见本 cue 主画面设计";
      const objectText = row.unit.objects.map((object) => `${object.id} 外观 ${object.appearance}（${object.initialState} → ${object.processState} → ${object.resultState}）`).join("；");
      const localText = `${row.cue.id}：${row.cue.visualNarration}；连续性 ${row.cue.continuityIn} → ${row.cue.continuityOut}；来源 ${cueSourceText(row.cue)}`;
      const picture = `${row.unit.designNarrative}；构图 ${row.unit.composition}；局部 cue ${localText}；${phaseRowText ? phases.map(phaseRowText).join("；") : ""}；对象 ${objectText}；全局值 ${globalLookText}`;
      const sound = phases.map((phase) => `${phase.sound.eventIds.join("、") || "无独立音效"}；${phase.sound.reason}；${phase.completion.condition} → ${phase.completion.exitState}`).join("；")
        || `${row.unit.sound.reason}；完成与交接 ${row.cue.continuityOut}`;
      lines.push(`| ${tableText(screenTextTime(row) + " / " + row.item.id)}：${tableText(row.item.text)} | ${tableText(task)} | ${tableText(picture)} | ${tableText(phases.map(phaseRowText).join("；") || "动作与交接见本 cue 连续性和动作表") } | ${tableText(screenTextStyle(row))} | ${tableText(sound)} |`);
    }
    lines.push("");
    const complexPhases = (design.attentionPhases || []).filter((phase) => phase.actionIds.length > 1 || phase.actorBindings.length > 2 || phase.sound.eventIds.length > 0);
    if (complexPhases.length) {
      lines.push("### 复杂阶段动作拆解", "", "| 阶段 | 动作与状态 | 目标／支持绑定 | 声音 | 完成与交接 |", "| --- | --- | --- | --- | --- |");
      for (const phase of complexPhases) {
        const unit = unitById.get(phase.viewingUnitId);
        const actions = phase.actionIds.map((id) => unit?.actions.find((row) => row.id === id)).filter(Boolean)
          .map((action) => `${action.id}/${action.phase}；时间 ${actionTime(action)}；触发 ${actionCueIds(action).map((cueId) => `${cueId}（${actionSourceRange(action)}）`).join("、") || "无源 presentation／语义预算"}；${action.keyStates.map((state) => `${state.objectId} ${state.from}→${state.through}→${state.to}`).join("；")}；${action.pathOrMorph}`).join("；");
        const bindings = phase.actorBindings.map((binding) => `${binding.actorId}/${binding.role} ${binding.props.coordinateSpace} @ ${binding.props.x},${binding.props.y} ${binding.props.width}×${binding.props.height}; ${binding.owner} → ${binding.consumer}`).join("；");
        lines.push(`| ${phase.id} | ${tableText(actions || "沿用连续动作")} | ${tableText(bindings)} | ${tableText(phase.sound.eventIds.join("、") || phase.sound.reason)} | ${tableText(`${phase.completion.condition}；${phase.completion.exitState}；${phase.handoff.visualHold}；${phase.handoff.condition}`)} |`);
      }
      lines.push("");
    }
  }

  lines.push("## " + sectionLabels.cueByCuePicture, "", design.brief.cueByCuePicture, "",
    "### 逐 cue 索引", "", "| cue | 项目时钟／语义预算 | 原句或源段 |", "| --- | --- | --- |");
  for (const { cue } of cueOrder) lines.push(`| ${tableText(cue.id)} | ${tableText(cueTime(cue))} | ${tableText(cueSourceText(cue))} |`);
  lines.push("");
  for (const unit of design.units) {
    lines.push(`### ${unit.viewingUnitId}`, "", unit.designNarrative, "", "#### 逐 cue 画面、讲述与屏显", "");
    if (!(unit.scriptCues || []).length) lines.push("本单元没有独立讲述或 presentation cue；动作按下方语义预算执行。", "");
    for (const cue of unit.scriptCues || []) {
      const actionRows = unit.actions.filter((action) => action.triggerCueIds.includes(cue.id) || cue.actionIds?.includes(action.id));
      const actionById = new Map(unit.actions.map((action) => [action.id, action]));
      const cueSoundBindings = (unit.sound.syncCues || []).filter((binding) =>
        (cue.actionIds || []).includes(binding.actionId)
        && actionById.get(binding.actionId)?.phase === binding.phase);
      const cueSfxBindings = cueSoundBindings.filter((binding) => binding.kind === "audio-event");
      const cueMusicBindings = cueSoundBindings.filter((binding) => binding.kind === "audio-track");
      const cueSfxText = cueSfxBindings.length
        ? cueSfxBindings.map((binding) => {
          const action = actionById.get(binding.actionId);
          return `${audioUse("音效事件", [binding.id], audioEvents)} 关联动作 ${binding.actionId}/${binding.phase}（动作区间 ${actionTime(action)}）；${binding.relationship}`;
        }).join("；")
        : cueSoundBindings.length
          ? "本 cue 没有独立音效事件；已匹配的同步音轨列于音乐栏"
          : `单元声音尚未分配到本 cue（未找到同时匹配 cue.actionIds 与 actionId/phase 的 syncCues；本单元音效意图 ${unit.sound.intent.sfx}，详情见第 8 节）`;
      const cueMusicText = cueMusicBindings.length
        ? `本单元音乐按全局层继承；${cueMusicBindings.map((binding) => {
          const action = actionById.get(binding.actionId);
          return `${audioUse("同步音轨", [binding.id], audioTracks)} 关联动作 ${binding.actionId}/${binding.phase}（动作区间 ${actionTime(action)}）；${binding.relationship}`;
        }).join("；")}`
        : `本单元音乐按全局层继承（意图 ${unit.sound.intent.music}；轨道详情见第 8 节）`;
      const cueVoiceText = unit.sound.intent.voice === "none"
        ? "本 cue 无口播"
        : `本 cue 讲述源时钟 ${cueTime(cue)}；旁白轨绑定见第 8 节`;
      lines.push(`##### ${cue.id}`, "",
        `- 【编号·时间·原句】${cue.id}；${cueTime(cue)}；${cueSourceText(cue)}`,
        `- 【接住什么】${cue.continuityIn}`,
        `- 【完整画面】${cue.visualNarration}`,
        "- 【变化过程】");
      if (actionRows.length) {
        for (const action of actionRows) {
          lines.push(
            `  - **${action.id}**（${action.phase}；时段 ${actionTime(action)}）`,
            `    - 源 cue：${action.triggerCueIds.length ? action.triggerCueIds.join("、") : "无源 presentation／语义预算"}；目标对象：${action.targetObjectIds.join("、")}`,
            `    - 触发关系：${actionRelationshipText(action)}`,
            `    - 前／中／后关键态：${action.keyStates.map((state) => `${state.objectId} ${state.from} → ${state.through} → ${state.to}`).join("；")}`,
            `    - 路径／形变：${action.pathOrMorph}`,
          );
        }
      } else {
        lines.push("  - 沿用本单元对象状态，不新增动作相位。");
      }
      if (cue.screenText.mode === "none") {
        lines.push(`- 【文字呈现】无屏显文字；${cue.screenText.reason}`);
      } else {
        for (const item of cue.screenText.items) {
          const style = styleById.get(item.styleId);
          lines.push(`- 【文字呈现】${item.role} 原文“${item.text}”；${item.styleId}：${style.fontFamily} ${style.fontWeight} ${style.sizePx}px，行高 ${style.lineHeight}，字距 ${style.letterSpacing}，颜色角色 ${style.colorRoleId}，字体资源 ${style.fontMaterialId || "系统字体（生产时需真实加载／测量证据）"}；位置 ${item.layout.position}（${item.layout.region}），${item.layout.alignment}，最多 ${item.layout.maxLines} 行，背景 ${item.layout.background}，层级 ${item.layout.layerOrder}；显示 ${item.visibility.startCueId}→${item.visibility.endCueId}，${item.visibility.basis}，偏移 ${item.visibility.startOffsetSamples ?? "语义预算"}/${item.visibility.endOffsetSamples ?? "语义预算"}；阅读 ${item.readingWindow.startCueId}→${item.readingWindow.endCueId}，跨 cue 保持 ${item.readingWindow.holdAcrossCues ? "是" : "否"}。${item.visibility.reason} ${item.readingWindow.reason}`);
          lines.push(`  - Film 文字消费者：${item.consumerRefs.map((ref) => filmConsumer(ref.implementationPlanId, ref.mappingId)).join("；")}`);
        }
      }
      lines.push(`- 【声音】${cueVoiceText}；音效 ${cueSfxText}；音乐 ${cueMusicText}`);
      const nextCue = nextCueById.get(cue.id);
      const position = cuePositionById.get(cue.id);
      const nextCueText = nextCue
        ? `${nextCue.cue.id}${nextCue.unitIndex === cueOrder[position].unitIndex ? "" : "（观看单元 " + nextCue.unit.viewingUnitId + "）"}`
        : "无（片尾）";
      lines.push(`- 【结束与下一句】本 cue 落态与交接：${cue.continuityOut}；下一 cue：${nextCueText}`);
      const unitCues = cuesByUnitId.get(unit.viewingUnitId) || [];
      if (unitCues.at(-1)?.id === cue.id) {
        lines.push(`  - 单元转场：目标 ${unit.transition.targetViewingUnitId ?? "无下一观看单元"}；${unit.transition.handoff} ${unit.transition.continuity}`);
      }
      const consumers = new Set(unit.implementationPlanIds);
      for (const action of actionRows) for (const id of action.implementationPlanIds) consumers.add(id);
      const tasks = (design.resourceTasks || []).filter((task) => task.viewingUnitIds.includes(unit.viewingUnitId));
      lines.push(`- 【实现与检查】${[...consumers].map((id) => filmConsumer(id)).join("；") || "无计划 Film consumer"}；${actionRows.map((action) => `动作 ${action.id} 由 ${action.implementationPlanIds.map((id) => filmConsumer(id)).join("、")}`).join("；") || "无 cue 专属动作"}${tasks.length ? "；资源任务：" + tasks.map((task) => `${task.id}（${task.status}）`).join("、") : ""}`, "");
    }
  }

  lines.push("## " + sectionLabels.actionsAndContinuity, "", design.brief.actionsAndContinuity, "");
  if (hasActionPrecisionBoundary) {
    lines.push(`- 触发精度边界：${actionPrecisionBoundary}`, "");
  }
  for (const unit of design.units) {
    lines.push(`### ${unit.viewingUnitId}`, "", "#### 动作相位与交接", "");
    for (const action of unit.actions) {
      lines.push(`##### ${action.id}（${action.phase}）`, "",
        `- 触发 cue：${action.triggerCueIds.length ? action.triggerCueIds.join("、") : "无源 presentation／语义预算"}`,
        `- 对应来源范围：${actionSourceRange(action)}`,
        `- 目标对象：${action.targetObjectIds.join("、")}`,
        `- 时间：${actionTime(action)}；${action.timing.startCueId ?? "无 cue"} → ${action.timing.endCueId ?? "无 cue"}；起止偏移 ${action.timing.startOffsetSamples ?? "未声明"}/${action.timing.endOffsetSamples ?? "未声明"} samples；${actionRelationshipText(action)}`,
        `- 前／中／后关键态：${action.keyStates.map((state) => `${state.objectId}：${state.from} → ${state.through} → ${state.to}`).join("；")}`,
        `- 路径或形变：${action.pathOrMorph}`,
        `- 动作意图：${action.motionPurpose}`,
        `- 交接：${action.handoff}`,
        `- Film 消费者：${action.implementationPlanIds.map((id) => filmConsumer(id)).join("；")}`, "");
    }
    lines.push("#### 单元转场", "",
      `- 下一观看单元：${unit.transition.targetViewingUnitId ?? "无"}`,
      `- 交接：${unit.transition.handoff}`,
      `- 连续性：${unit.transition.continuity}`, "");
  }

  lines.push("## " + sectionLabels.soundAndMix, "", design.brief.soundAndMix, "");
  for (const unit of design.units) {
    const voiceUse = audioUse("旁白轨", unit.sound.voiceTrackIds, audioTracks);
    const eventUse = audioUse("音效事件", unit.sound.eventIds, audioEvents);
    const trackUse = audioUse("音乐轨", unit.sound.trackIds, audioTracks);
    lines.push(`### ${unit.viewingUnitId}`, "",
      `- 旁白：${unit.sound.intent.voice}；${voiceUse}`,
      `- 音效：${unit.sound.intent.sfx}；${eventUse}`,
      `- 音乐：${unit.sound.intent.music}；${trackUse}`,
      `- 意图：${unit.sound.reason}`);
    for (const cue of unit.sound.syncCues || []) lines.push(`- 声画关系：${cue.kind} ${cue.id} 对应动作 ${cue.actionId}/${cue.phase}；${cue.relationship}`);
    lines.push("");
  }

  lines.push("## " + sectionLabels.resourcesAndConsumers, "", design.brief.resourcesAndConsumers, "",
    productionVerified ? "### 已核验生产消费者映射" : "### 计划消费者映射（待绑定生产收据）", "");
  for (const row of design.units.flatMap((unit) => unit.implementationPlanIds.map((id) => ({ unitId: unit.viewingUnitId, row: id })))) {
    lines.push(`- ${row.unitId} → ${filmConsumer(row.row)}`);
  }
  if ((design.resourceTasks || []).length) {
    lines.push("", "### 资源与制作绑定任务", "");
    for (const task of design.resourceTasks || []) {
      lines.push(`#### ${task.id}（${task.status}）`, "", `- 角色：${task.role}`, `- 要求：${task.requirement}`,
        `- 观看单元：${task.viewingUnitIds.join("、")}`, `- 查询：${task.sourceQueries.map((row) => `${row.source}：${row.query}`).join("；")}`,
        `- 选择标准：${task.selectionCriteria.join("；")}`,
        `- 消费目标：${task.consumerTargets.map((target) => target.kind === "audio-track" || target.kind === "audio-event" ? `${target.kind}:${target.id}` : `${target.kind}:${target.implementationPlanId}`).join("、")}`,
        `- 失败处理：${task.acquisitionPlan.failureAction}`, "");
    }
  }

  lines.push("## " + sectionLabels.reverseReview, "", design.brief.reverseReview, "",
    "### 本次检查范围", "",
    productionVerified
      ? "production 校验重新核对了当前计划、Film 与 audio.mjs 回执、素材绑定及正式输出；这是技术消费者核验，不替代人工审美、可读性、试听或观众理解检查。"
    : design.format === "laohu.motion.director-design/3"
      ? "本次方向导出基于 directorDesign/3 的逐条字幕、attention 与实际 Film props 消费绑定；计划映射尚未构成已执行的生产收据。正式消费须另跑 export-design --stage production 或 verify-delivery。"
      : "本次方向导出基于 directorDesign/2 的结构与引用校验；计划 ID 仍是待绑定消费者，不代表已执行。正式生产消费须另跑 export-design --stage production 或 verify-delivery。",
    "");
  if (productionVerified) {
    lines.push("### 已核验输出", "");
    for (const artifact of productionConsumers.artifacts || []) lines.push(`- ${artifact.kind}：${artifact.path}（SHA-256 ${artifact.sha256}）`);
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}
async function verifyProductionConsumerReceipts(validated) {
  if (!((validated.plan.format === PLAN_FORMAT_V3 && validated.plan.directorDesign?.format === "laohu.motion.director-design/2")
    || (isFormalV4OrV5(validated.plan) && validated.plan.directorDesign?.format === "laohu.motion.director-design/3"))) {
    fail("production consumer receipts require production-plan/3 + directorDesign/2 legacy or production-plan/4 or /5 + directorDesign/3 formal design");
  }
  if (validated.plan.format === PLAN_FORMAT_V5
      && (!validated.creativeDesignIdentitySha256
        || validated.plan.directorDesign?.creativeDesignRef?.id !== validated.creativeDesignId
        || validated.plan.directorDesign?.creativeDesignRef?.sha256 !== validated.creativeDesignIdentitySha256)) {
    fail("production consumer receipts require the exact current creativeDesign/1 identity to remain bound through the submitted directorDesign/3");
  }
  const outputs = relativeOutputPaths(validated);
  const filmReceipt = await inspectFilmReceipt(validated, outputs);
  const { value: audioReceipt } = await readJson(outputs.audioManifest, "audio.mjs production consumer receipt");
  const audioPlan = validated.audioPlan;
  const audioPlanPath = path.resolve(validated.audioInput.file);
  if (audioReceipt.kind !== "audio-usage-manifest" || audioReceipt.schemaVersion !== 1) fail("production consumer receipt is not audio-usage-manifest/1");
  if (audioReceipt.planSha256 !== validated.audioInput.sha256 || path.resolve(audioReceipt.plan || "") !== audioPlanPath) {
    fail("audio manifest is stale or does not bind the current exact audio-plan file/hash");
  }
  if (path.resolve(audioReceipt.outputWav || "") !== outputs.audioWav || audioReceipt.outputWavSha256 !== await hashFile(outputs.audioWav)) {
    fail("audio manifest does not bind the actual declared output WAV path and bytes");
  }
  if (!audioReceipt.videoProbe || !Number.isFinite(audioReceipt.videoProbe.videoDurationSec)
      || audioReceipt.videoProbe.videoDurationSec + 1e-8 < audioPlan.durationSec
      || audioReceipt.durationSec !== audioPlan.durationSec || audioReceipt.mux?.durationLimitSec !== audioPlan.durationSec) {
    fail("audio manifest does not bind the actual Film duration to the selected audio-plan clock");
  }
  if (filmReceipt.durationSec !== audioPlan.durationSec) fail("Film receipt duration differs from the exact audio-plan clock");
  if (path.resolve(audioReceipt.mux?.video || "") !== outputs.picture || path.resolve(audioReceipt.mux?.output || "") !== outputs.finalVideo
      || audioReceipt.mux.audioStream !== audioReceipt.audioStream
      || !Number.isFinite(audioReceipt.mux.videoStreamDurationSec)
      || audioReceipt.mux.videoStreamDurationSec + 1e-8 < audioPlan.durationSec
      || typeof audioReceipt.audioStream !== "boolean") {
    fail("audio manifest mux input/output or audio-stream state differs from declared production outputs");
  }
  if (audioReceipt.mix?.noAudio !== !audioReceipt.audioStream
      || (audioReceipt.audioStream && (!Number.isFinite(audioReceipt.mux.audioStreamDurationSec)
        || audioReceipt.mux.audioStreamDurationSec + 0.05 < audioPlan.durationSec))
      || (!audioReceipt.audioStream && audioReceipt.mux.audioStreamDurationSec != null)) {
    fail("audio manifest WAV/mux audioStream and final audio duration fields disagree");
  }
  const receiptTracks = array(audioReceipt.tracks, "audio manifest.tracks", { allowEmpty: true });
  const receiptEvents = array(audioReceipt.events, "audio manifest.events", { allowEmpty: true });
  const trackById = new Map(receiptTracks.map((row) => [text(row.id, "audio manifest track.id"), row]));
  const eventById = new Map(receiptEvents.map((row) => [text(row.id, "audio manifest event.id"), row]));
  if (trackById.size !== receiptTracks.length || eventById.size !== receiptEvents.length) fail("audio manifest contains duplicate track or event consumer IDs");
  for (const row of [...receiptTracks, ...receiptEvents]) if (typeof row.audible !== "boolean") fail("audio manifest track/event receipt must state whether its exact row was audible: " + row.id);
  const plannedTracks = new Map((audioPlan.tracks || []).map((row) => [row.id, row]));
  const plannedEvents = new Map((audioPlan.events || []).map((row) => [row.id, row]));
  const sameIds = (left, right) => left.size === right.size && [...left.keys()].every((id) => right.has(id));
  if (!sameIds(trackById, plannedTracks) || [...plannedTracks].some(([id, row]) => {
    const used = trackById.get(id);
    return used.bus !== row.bus || used.assetId !== row.assetId;
  })) fail("audio manifest track IDs/buses/assets differ from the exact selected audio-plan consumers");
  if (!sameIds(eventById, plannedEvents) || [...plannedEvents].some(([id, row]) => {
    const used = eventById.get(id);
    return used.assetId !== row.assetId || used.bus !== "sfx";
  })) fail("audio manifest event IDs/assets differ from the exact selected audio-plan consumers");
  if (canonicalJson(audioReceipt.voiceWindows || []) !== canonicalJson(audioPlan.voiceWindows || [])) {
    fail("audio manifest voice windows differ from the exact selected audio-plan voice schedule");
  }
  const usedAssets = array(audioReceipt.usedAssets || [], "audio manifest.usedAssets", { allowEmpty: true });
  const usedAssetById = new Map(usedAssets.map((asset) => [text(asset.id, "audio manifest used asset.id"), asset]));
  if (usedAssetById.size !== usedAssets.length) fail("audio manifest contains duplicate used asset IDs");
  const audibleAssetIds = new Set([...receiptTracks, ...receiptEvents].filter((row) => row.audible === true).map((row) => row.assetId));
  if (!sameIds(usedAssetById, new Map([...audibleAssetIds].map((id) => [id, true])))) fail("audio manifest used assets do not exactly match the WAV inputs recorded as audible tracks/events");
  for (const asset of usedAssets) {
    const planned = validated.audioPreview.usedAssetsById.get(asset.id);
    if (!planned || planned.sha256 !== asset.sha256 || planned.asset.reviewStatus !== asset.reviewStatus) {
      fail("audio manifest used asset is stale or differs from hash-verified audio-plan/index inputs: " + asset.id);
    }
  }
  if (audioReceipt.audioStream !== (audibleAssetIds.size > 0)) fail("audio manifest audioStream state differs from its actual audible track/event rows");
  const requiredTracks = new Set(validated.plan.directorDesign.units.flatMap((unit) => [
    ...unit.sound.voiceTrackIds,
    ...(unit.sound.intent.music === "designed" ? unit.sound.trackIds : []),
  ]));
  const requiredEvents = new Set(validated.plan.directorDesign.units.flatMap((unit) => unit.sound.intent.sfx === "designed" ? unit.sound.eventIds : []));
  for (const id of requiredTracks) {
    if (trackById.get(id)?.audible !== true) fail("required designed audio-plan track has no audible production output: " + id);
  }
  for (const id of requiredEvents) {
    if (eventById.get(id)?.audible !== true) fail("required designed audio-plan event has no audible production output: " + id);
  }
  if (audioReceipt.generatedPreviewAllowed === true || audioReceipt.technicalPreview === true
      || (validated.audioPreview.usedCandidateAssetIds || []).length) {
    fail("formal production receipts cannot mark candidate/generated/technical-preview audio as verified production consumption");
  }
  const artifactRows = [];
  for (const [kind, file] of Object.entries(outputs)) artifactRows.push({ kind, path: path.relative(validated.planDir, file).split(path.sep).join("/"), sha256: await hashFile(file) });
  return {
    verified: true,
    plan: validated.plan,
    filmMappingIds: new Set(filmReceipt.consumerMappingsVerified),
    audioTracks: trackById,
    audioEvents: eventById,
    filmReceipt,
    audioReceipt,
    artifacts: artifactRows,
  };
}

const mdCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

function sampleTime(sample, canonicalTimeline) {
  if (!canonicalTimeline || !Number.isSafeInteger(sample) || sample < 0) return null;
  const totalMilliseconds = Math.round(sample * 1000 / canonicalTimeline.sampleRateHz);
  const minutes = Math.floor(totalMilliseconds / 60000);
  const wholeSeconds = Math.floor(totalMilliseconds / 1000) % 60;
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function readableCueRange(cue, canonicalTimeline) {
  if (!canonicalTimeline || !["token-range", "segment-range"].includes(cue.source?.kind)) return null;
  const kind = cue.source.kind;
  const rows = canonicalTimeline.rowsByOccurrenceKind.get(kind + "::" + cue.source.occurrenceId) || [];
  const startId = cue.source[kind === "token-range" ? "startTokenId" : "startSegmentId"];
  const endId = cue.source[kind === "token-range" ? "endTokenId" : "endSegmentId"];
  const startIndex = rows.findIndex((row) => row.id === startId);
  const endIndex = rows.findIndex((row) => row.id === endId);
  if (startIndex < 0 || endIndex < startIndex) return null;
  return {startSample: rows[startIndex].targetRange.startSample, endSample: rows[endIndex].targetRange.endSample};
}

function readableCueSource(cue, canonicalTimeline) {
  const source = cue.source || {};
  if (source.kind === "token-range" || source.kind === "segment-range") {
    const unit = source.kind === "token-range" ? "词段" : "语句段";
    let sentence = "";
    if (source.kind === "token-range" && canonicalTimeline) {
      const rows = canonicalTimeline.rowsByOccurrenceKind.get("token-range::" + source.occurrenceId) || [];
      const start = rows.findIndex((row) => row.id === source.startTokenId);
      const end = rows.findIndex((row) => row.id === source.endTokenId);
      const span = start >= 0 && end >= start ? rows.slice(start, end + 1) : [];
      const startSample = span[0]?.targetRange.startSample;
      const endSample = span.at(-1)?.targetRange.endSample;
      const normalized = (value) => String(value).normalize("NFC").replace(/[\p{P}\p{Z}\s]/gu, "");
      const matched = (canonicalTimeline.transcriptSegmentsByOccurrence?.get(source.occurrenceId) || []).find((row) =>
        startSample != null && row.targetRange.startSample === startSample && row.targetRange.endSample === endSample
        && normalized(row.text) === normalized(source.exactText));
      if (matched) sentence = `；同 occurrence 的完整 transcriptSegment 原句：“${matched.text}”`;
    }
    return `${source.exactText}（原始 occurrence ${source.occurrenceId} 的${unit}锚点${sentence}）`;
  }
  if (source.kind === "script-line-range") return `稿件 ${source.materialId} 第 ${source.lineStart}–${source.lineEnd} 行：${source.exactText}`;
  return `无源 presentation：${source.reason || "设计内的无口播画面"}`;
}

function legacyCreativeDesignMarkdown(design, canonicalTimeline, productionConsumers = null, captionManifest = null) {
  const lines = [
    "<!-- laohu-motion-export-design/1 -->",
    "<!-- design-id: " + design.id + " -->",
    "# 动画创意设计",
    "",
    "> 本文是可读的创意设计稿。它保留当前画面、声音、字幕、动作、构图与转场意图；渲染器属性、消费映射和哈希等技术细节请用 `--view technical` 查看。修改源 JSON 后重新导出，不要维护第二份设计稿。",
    "",
  ];
  const global = design.globalSettings;
  const units = design.units;
  const cueRows = units.flatMap((unit) => (unit.scriptCues || []).map((cue) => ({unit, cue})));
  const styleById = new Map((global.textStyles || []).map((style) => [style.id, style]));
  const colorMeaning = new Map((global.colorRoles || []).map((role) => [role.id, role.meaning]));
  const phasesByCaption = new Map();
  for (const phase of design.attentionPhases || []) for (const anchor of phase.anchors?.rows || []) {
    if (anchor.kind !== "caption") continue;
    const rows = phasesByCaption.get(anchor.captionCueId) || [];
    rows.push(phase);
    phasesByCaption.set(anchor.captionCueId, rows);
  }
  const captionRows = captionManifest?.cues || [];
  const cueCaptions = (cue) => {
    const range = readableCueRange(cue, canonicalTimeline);
    if (!range) return [];
    return captionRows.filter((caption) => {
      const occurrenceId = caption.anchors?.[0]?.occurrenceId;
      return occurrenceId === cue.source?.occurrenceId
        && range.startSample < caption.speechSpan.endSample
        && caption.speechSpan.startSample < range.endSample;
    });
  };
  const captionTime = (caption) => canonicalTimeline
    ? `${sampleTime(caption.displayWindow.startSample, canonicalTimeline)}–${sampleTime(caption.displayWindow.endSample, canonicalTimeline)}（字幕显示窗；口播精度 ${caption.speechSpan.timingPrecision}）`
    : `显示样本 ${caption.displayWindow.startSample}–${caption.displayWindow.endSample}（口播精度 ${caption.speechSpan.timingPrecision}）`;
  const sourceTime = (cue) => {
    const range = readableCueRange(cue, canonicalTimeline);
    return range ? `${sampleTime(range.startSample, canonicalTimeline)}–${sampleTime(range.endSample, canonicalTimeline)}（项目采样时钟）` : "没有可信的绝对秒数；按稿件／语义预算衔接";
  };
  const textStyle = (item) => {
    const style = styleById.get(item.styleId);
    const color = colorMeaning.get(style?.colorRoleId) || "颜色关系未写明";
    return `${style?.fontFamily || "字体未指定"} ${style?.fontWeight || "字重未指定"}；${style?.sizePx == null ? "字号未指定" : `${style.sizePx}px（当前设计字号）`}；${style?.role || "文字层级见角色"}；颜色关系：${color}`;
  };
  const actionRange = (action) => {
    if (action.timing?.basis !== "canonical-target-samples") return "语义预算（没有绝对时码）";
    const startCue = cueRows.find(({cue}) => cue.id === action.timing.startCueId)?.cue;
    const endCue = cueRows.find(({cue}) => cue.id === action.timing.endCueId)?.cue;
    const start = startCue && readableCueRange(startCue, canonicalTimeline);
    const end = endCue && readableCueRange(endCue, canonicalTimeline);
    if (!start || !end) return "无可信同步时间；不编造时码";
    const startSample = start.startSample + action.timing.startOffsetSamples;
    const endSample = end.endSample + action.timing.endOffsetSamples;
    return `${sampleTime(startSample, canonicalTimeline)}–${sampleTime(endSample, canonicalTimeline)}（项目采样时钟）`;
  };
  const phaseForCue = (cue) => {
    const captions = cueCaptions(cue);
    return captions.flatMap((caption) => phasesByCaption.get(caption.id) || []);
  };
  const phaseLine = (phase) => {
    const unit = units.find((row) => row.viewingUnitId === phase.viewingUnitId);
    const objectName = (id) => unit?.objects.find((row) => row.id === id)?.role || "画面主体";
    const actions = (phase.actionIds || []).map((id) => unit?.actions.find((row) => row.id === id)).filter(Boolean)
      .map((action) => `${action.phase}：${action.motionPurpose}；${action.pathOrMorph}；${action.keyStates.map((state) => `${objectName(state.objectId)} ${state.from} → ${state.through} → ${state.to}`).join("；")}`).join("；");
    const camera = (phase.camera?.keyframes || []).length ? "镜头运动参与本阶段构图与视线交接" : "镜头不新增关键运动";
    return `主任务：${phase.mainTask.description}；${actions || "沿用已建立的画面状态"}；${camera}；读字窗口：${phase.readWindows.map((row) => row.reason).join("；") || "无额外读字窗口"}；交接：${phase.handoff.condition}；完成状态：${phase.completion.condition} → ${phase.completion.exitState}`;
  };
  const humanCueSource = (cue) => {
    const source = cue.source || {};
    if (["token-range", "segment-range"].includes(source.kind)) {
      const sourceText = source.exactText || "没有独立口播原句";
      const fullSentence = readableCueSource(cue, canonicalTimeline).match(/；同 occurrence.*?原句：“([^”]+)”/u)?.[1];
      return fullSentence ? `${sourceText}；原始完整句：“${fullSentence}”` : sourceText;
    }
    if (source.kind === "script-line-range") return `稿件第 ${source.lineStart}–${source.lineEnd} 行：${source.exactText}`;
    return source.reason ? `视觉呈现：${source.reason}` : "没有独立口播原句";
  };
  const humanCueName = (cueId) => {
    const cue = cueRows.find(({cue: row}) => row.id === cueId)?.cue;
    return cue ? humanCueSource(cue) : "本单元内容";
  };

  lines.push("## 输入、时钟与覆盖", "", design.brief.sourceClockAndCoverage, "",
    `- 旁白模式：${design.narration.mode}；${design.narration.reason}`,
    captionRows.length ? "- 字幕与口播时码来自已验证的 ASRcut caption manifest；本稿引用其显示窗，不另建时间轴。" : "- 本稿没有可验证的逐条字幕 manifest；任何语义预算都不伪装成 ASR 秒数。",
    `- 画面观看单元：${units.length} 个，按下方顺序呈现。`, "",
    "## 内容关系", "", design.brief.contentLogic, "",
    "## 全局视听世界", "", design.brief.globalVisualWorld, "",
    `- 画幅：${global.frame.width}:${global.frame.height} 的横／竖画幅比例；动作采样 ${global.frame.fps} fps。`,
    `- 色彩关系：${global.look.palette}`,
    `- 表面与光影：${global.look.surface}；${global.look.lighting}`,
    `- 空间与视觉层级：${global.look.spatialSystem}；${global.look.hierarchy}`,
    `- 字体方向：${global.look.typography}`,
    ...(global.textStyles || []).map((style) => `- ${style.role}：${style.fontFamily} ${style.fontWeight}，当前设计字号 ${style.sizePx}px；颜色关系是 ${colorMeaning.get(style.colorRoleId) || "未写明"}。`), "",
    "## 对象、材质与文字", "", design.brief.objectsMaterialsAndText, "");
  for (const [unitIndex, unit] of units.entries()) {
    lines.push(`### 观看单元 ${String(unitIndex + 1).padStart(2, "0")}`, "");
    for (const item of unit.objects) {
      lines.push(`#### ${item.role}`, "", `- 表意：${item.meaning}`, `- 外观：${item.appearance}`,
        `- 进入本单元时：${item.initialState}`, `- 变化中：${item.processState}`, `- 落定后：${item.resultState}`);
      for (const part of item.movableParts || []) lines.push(`- 可动部件（${part.role}）：${part.appearance}；${part.initialState} → ${part.processState} → ${part.resultState}`);
      lines.push("");
    }
  }
  lines.push("## 镜头空间与状态", "", design.brief.compositionAndState, "");
  for (const [unitIndex, unit] of units.entries()) {
    lines.push(`### 观看单元 ${String(unitIndex + 1).padStart(2, "0")}`, "", unit.designNarrative, "",
      `- 本单元目的：${unit.purpose}`,
      `- 观众获得的视觉信息：${unit.visualGain}`,
      `- 呈现方式：${unit.representation}`,
      `- 构图：${unit.composition}`,
      `- 视线先后：${unit.focalOrder}`,
      `- 本单元如何沿用全片视觉语言：${unit.look.palette}；${unit.look.surface}；${unit.look.lighting}；${unit.look.typography}`, "");
  }

  lines.push("## 逐句／逐 cue 画面", "", design.brief.cueByCuePicture, "");
  lines.push("### 逐 cue 索引", "", "| 项目时钟／语义预算 | 原句或源段 |", "| --- | --- |");
  for (const {cue} of cueRows) {
    const range = readableCueRange(cue, canonicalTimeline);
    const time = range ? `${sampleTime(range.startSample, canonicalTimeline)}–${sampleTime(range.endSample, canonicalTimeline)}` : "语义预算／无可信时码";
    lines.push(`| ${mdCell(time)} | ${mdCell(humanCueSource(cue))} |`);
  }
  lines.push("");
  if (captionRows.length) {
    lines.push("### 屏幕字幕与口播索引", "", "| 字幕显示时间 | 原口播词／显示字幕 |", "| --- | --- |");
    for (const caption of captionRows) lines.push(`| ${mdCell(captionTime(caption))} | 口播：${mdCell(caption.lexicalText)}；显示：${mdCell(caption.displayText)} |`);
    lines.push("");
  }
  for (const [unitIndex, unit] of units.entries()) {
    lines.push(`### 观看单元 ${String(unitIndex + 1).padStart(2, "0")}`, "");
    for (const cue of unit.scriptCues || []) {
      const captions = cueCaptions(cue);
      const actions = unit.actions.filter((action) => action.triggerCueIds.includes(cue.id) || cue.actionIds?.includes(action.id));
      const phases = phaseForCue(cue);
      lines.push(`#### ${humanCueSource(cue)}｜${sourceTime(cue)}`, "",
        `- 原句／来源：${humanCueSource(cue)}`,
        `- 屏幕字幕：${captions.length ? captions.map((row) => `“${row.displayText}” (${captionTime(row)})`).join("；") : "没有和本 cue 重叠的字幕 manifest 行"}`,
        `- 从哪里接入：${cue.continuityIn}`,
        `- 画面如何呈现：${cue.visualNarration}`,
        `- 画面如何结束并交给下一 cue：${cue.continuityOut}`,
        "- 可见文字：");
      if (cue.screenText.mode === "none") lines.push(`  - 无额外屏显文字；${cue.screenText.reason}`);
      else for (const item of cue.screenText.items) {
        lines.push(`  - ${item.role}“${item.text}”：${textStyle(item)}；位置在${item.layout.position}的${item.layout.region}，${item.layout.alignment}；至多 ${item.layout.maxLines} 行；背景处理为${item.layout.background}，与画面层级关系为${item.layout.layerOrder}。`,
          `    - 显示区间：从“${humanCueName(item.visibility.startCueId)}”到“${humanCueName(item.visibility.endCueId)}”；${item.visibility.retention}。${item.visibility.reason}`,
          `    - 阅读安排：从“${humanCueName(item.readingWindow.startCueId)}”到“${humanCueName(item.readingWindow.endCueId)}”；跨 cue 保持 ${item.readingWindow.holdAcrossCues ? "是" : "否"}。${item.readingWindow.reason}`);
      }
      lines.push("- 动作变化：");
      if (!actions.length) lines.push("  - 沿用已建立的对象状态，不新增动作相位。");
      for (const action of actions) lines.push(`  - ${action.phase}（${actionRange(action)}）：触发关系 ${action.timing.relationship}；对象状态 ${action.keyStates.map((state) => `${unit.objects.find((item) => item.id === state.objectId)?.role || "画面主体"} ${state.from} → ${state.through} → ${state.to}`).join("；")}；运动／形变 ${action.pathOrMorph}；为什么这样动 ${action.motionPurpose}；动作后交接 ${action.handoff}`);
      if (phases.length) {
        lines.push("- 注意力与镜头交接（设计意图）：");
        for (const phase of phases) lines.push(`  - ${phaseLine(phase)}`);
      }
      lines.push("");
    }
    if (!(unit.scriptCues || []).length) lines.push("本单元没有独立口播 cue；动作按本单元的语义设计继续。", "");
  }

  lines.push("## 动作、转场与连续性", "", design.brief.actionsAndContinuity, "");
  for (const [unitIndex, unit] of units.entries()) {
    lines.push(`### 观看单元 ${String(unitIndex + 1).padStart(2, "0")}`, "");
    for (const action of unit.actions) lines.push(`#### ${action.phase} 动作`, "",
      `- 触发内容：${action.triggerCueIds.map((id) => humanCueSource(unit.scriptCues.find((cue) => cue.id === id) || {})).join("、") || "无独立口播 cue"}`,
      `- 目标对象：${action.targetObjectIds.map((id) => unit.objects.find((item) => item.id === id)?.role || "画面主体").join("、")}`,
      `- 时间：${actionRange(action)}；${action.timing.relationship}`,
      `- 前、中、后状态：${action.keyStates.map((state) => `${unit.objects.find((item) => item.id === state.objectId)?.role || "画面主体"}：${state.from} → ${state.through} → ${state.to}`).join("；")}`,
      `- 路径或形变：${action.pathOrMorph}`,
      `- 动作意图：${action.motionPurpose}`,
      `- 交接：${action.handoff}`, "");
    lines.push(`- 单元转场：${unit.transition.handoff}；${unit.transition.continuity}`, "");
  }
  lines.push("## 音轨与混音", "", design.brief.soundAndMix, "");
  for (const [unitIndex, unit] of units.entries()) {
    lines.push(`### 观看单元 ${String(unitIndex + 1).padStart(2, "0")}`, "", `- 口播：${unit.sound.intent.voice}；${unit.sound.voiceTrackIds.length ? "沿用已设计的人声轨" : "没有指定口播轨"}`,
      `- 音效：${unit.sound.intent.sfx}；${unit.sound.eventIds.length ? `已为 ${unit.sound.eventIds.length} 个画面事件设计声音` : "没有独立音效事件"}`,
      `- 音乐：${unit.sound.intent.music}；${unit.sound.trackIds.length ? `使用 ${unit.sound.trackIds.length} 段音乐` : "没有独立音乐段"}`,
      `- 声音方向：${unit.sound.reason}`);
    for (const cue of unit.sound.syncCues || []) lines.push(`- 声画关系：对应 ${cue.phase} 动作；${cue.relationship}`);
    lines.push("");
  }
  lines.push("## 素材需求与适用场景", "", design.brief.resourcesAndConsumers, "",
    "本视图说明素材与画面设计意图，不罗列 renderer props、消费者字段或哈希。正式生产仍由实际 Film/audio 收据验证。", "");
  for (const [taskIndex, task] of (design.resourceTasks || []).entries()) lines.push(`### 素材需求 ${String(taskIndex + 1).padStart(2, "0")}（${task.status}）`, "",
    `- 需要的素材：${task.requirement}`,
    `- 适用观看单元：${task.viewingUnitIds.map((id) => `第 ${units.findIndex((unit) => unit.viewingUnitId === id) + 1} 个观看单元`).join("、")}`,
    `- 检索方向：${task.sourceQueries.map((row) => `${row.source}：${row.query}`).join("；")}`,
    `- 适配标准：${task.selectionCriteria.join("；")}`,
    `- 未找到合适素材时：${task.acquisitionPlan.failureAction}`, "");
  if (!productionConsumers?.verified) lines.push("- 当前为方向设计；实际 Film/audio 消费尚未通过正式生产收据核验。", "");
  else {
    lines.push("- 当前 Film/audio 技术消费收据已核验：", "");
    for (const artifact of productionConsumers.artifacts || []) lines.push(`  - ${artifact.kind}：${artifact.path}`);
    lines.push("- 收据只证明技术消费者与输出绑定，不替代审美、可读性、试听或观众理解检查。", "");
  }
  lines.push("## 反向检查", "", design.brief.reverseReview, "",
    "### 检查边界", "",
    productionConsumers?.verified
      ? "本次生产导出已重新核对计划与实际 Film/audio 收据；技术绑定不等于画面或声音的审美验收。"
      : "本次方向导出只证明输入引用与设计结构通过校验；没有生成或核验成片，也不代表审美验收通过。", "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

export function creativeDesignMarkdown(validated, productionConsumers = null) {
  const plan = validated.plan;
  const design = plan.creativeDesign;
  const manifest = validated.asrcutHandoff?.captionManifest || null;
  const units = validated.units || plan.viewingUnits;
  const canonicalTimeline = validated.asrcutHandoff?.timeline
    ? readCanonicalSpeechRows(validated.asrcutHandoff.timeline) : null;
  const lines = [
    "<!-- laohu-motion-export-design/1 -->",
    "<!-- design-id: " + design.id + " -->",
    "<!-- creative-design-identity-sha256: " + validated.creativeDesignIdentitySha256 + " -->",
    "# 动画创意设计提示词",
    "",
    "> 这是 Analysis 编写的创意设计真源，描述观众实际应看到和听到什么；不是 renderer 命令。Motion 的技术实现须由独立 directorDesign/3 绑定此设计后完成。此导出不会用技术属性替代视觉设计，也不会把审美通过写成结构校验结果。",
    "",
    "## 输入与锁定条件",
    "",
    `- 作品：${plan.work.title}`,
    `- 旁白方式：${design.narrationMode}`,
    `- 观看单元：${units.map((unit, index) => `第 ${index + 1} 段（${unit.task}）`).join("；")}`,
  ];
  for (const material of plan.inputs.sourceMaterials) lines.push(`- 已核验输入：${material.role}（${material.kind}）`);
  if (design.narrationMode === "timeline") lines.push("- 口播与字幕时间：引用已核验 ASRcut caption manifest 的原始 speech span 与 display window；时间只从当前 ASRcut 真源读取，不另建时钟。", "- 字幕文本：保留 manifest 中的口播原词与屏幕显示文案；不能用合并的长稿替代逐条显示 cue。");
  else lines.push("- 本设计没有逐字 ASR 时间戳；引用现有材料定位或语义预算，不得虚构字幕时间。" );
  for (const decision of validated.decisions || []) {
    const selected = decision.candidates.find((candidate) => candidate.id === decision.selectedCandidateId);
    lines.push(`- 方向取舍：${decision.rationale}${selected ? `；当前选择的呈现路线：${selected.fitReason}` : ""}`);
    for (const ref of decision.decisionInputs || []) if (ref.resourceType === "style" && ref.preservedMechanism) {
      lines.push(`  - 采用的设计机制：${ref.preservedMechanism}；适用原因：${ref.applicability}`);
    }
  }
  lines.push("", "## 开场视觉与声音基线", "",
    `- 面向观众：${design.globalDirection.audience}`,
    `- 全片中心表达：${design.globalDirection.centralIdea}`,
    `- 观看感受：${design.globalDirection.experience}`,
    `- 情绪推进：${design.globalDirection.emotionalArc}`,
    `- 全片视觉语言：${design.globalDirection.visualLanguage}`,
    `- 全片声音语言：${design.globalDirection.soundLanguage}`,
    `- 画面连续性：${design.globalDirection.continuity}`,
    `- 避免：${Array.isArray(design.globalDirection.avoid) ? design.globalDirection.avoid.join("；") : design.globalDirection.avoid}`, "",
    "## 逐时画面索引", "");
  if (design.narrationMode === "timeline") {
    lines.push("| 字幕显示窗 | 口播原词 → 屏显文案 | 当前视觉焦点 | 情绪变化 |", "| --- | --- | --- | --- |");
    for (const cue of design.cueDesigns) {
      const caption = manifest?.cues?.find((row) => row.id === cue.captionCueId);
      if (!caption) continue;
      const start = sampleTime(caption.displayWindow.startSample, canonicalTimeline);
      const end = sampleTime(caption.displayWindow.endSample, canonicalTimeline);
      const primary = cue.actors.find((actor) => actor.id === cue.focus.primaryActorId);
      lines.push(`| ${mdCell(start && end ? `${start}–${end}` : `${caption.displayWindow.startSample}–${caption.displayWindow.endSample} 样本`)} | ${mdCell(caption.lexicalText)} → ${mdCell(caption.displayText)} | ${mdCell(primary ? `${primary.role}：${primary.meaning}` : "当前主画面对象")} | ${mdCell(`${cue.emotion.from} → ${cue.emotion.to}`)} |`);
    }
  } else {
    lines.push("本片段无逐条 ASR 字幕索引；下方按来源定位／观看单元列出画面设计。", "");
  }
  lines.push("");
  let cueNumber = 0;
  for (const [unitIndex, unit] of units.entries()) {
    const unitCues = design.cueDesigns.filter((cue) => cue.viewingUnitId === unit.id);
    lines.push(`## 观看单元 ${String(unitIndex + 1).padStart(2, "0")}`, "", `- 观看任务：${unit.task}`, `- 完成信号：${unit.completionSignal}`, "");
    for (const cue of unitCues) {
      cueNumber += 1;
      const caption = cue.captionCueId ? manifest?.cues?.find((row) => row.id === cue.captionCueId) : null;
      const source = caption
        ? `口播原词“${caption.lexicalText}”；屏幕显示“${caption.displayText}”`
        : `来源 ${(plan.inputs.sourceMaterials || []).find((row) => row.id === cue.sourceRef.materialId)?.role || "已核验材料"}；定位 ${cue.sourceRef.locator}`;
      const time = caption && canonicalTimeline
        ? `${sampleTime(caption.speechSpan.startSample, canonicalTimeline)}–${sampleTime(caption.speechSpan.endSample, canonicalTimeline)} 口播；${sampleTime(caption.displayWindow.startSample, canonicalTimeline)}–${sampleTime(caption.displayWindow.endSample, canonicalTimeline)} 字幕显示`
        : "沿用稿件定位／语义预算，无伪造秒数";
      lines.push(`### 分镜 ${String(cueNumber).padStart(2, "0")}｜${time}`, "", `- 对应原稿：${source}`, "",
        "#### 画面生成提示词", "", cue.picturePrompt, "",
        "#### 观众实际看到的主体与构成元素", "");
      for (const actor of cue.actors) lines.push(`- ${actor.role}：${actor.meaning}。外观：${actor.appearance}。位置、比例、方向与前后层关系：${actor.placement}`);
      if (!cue.foregroundText.length) lines.push("- 本 cue 不增加独立屏显文字；字幕按 ASRcut manifest 显示。 ");
      for (const row of cue.foregroundText) lines.push(`- 屏显文字“${row.text}”（${row.role}，与主体关系：${row.relationship}）：${row.appearance}；位置与叠压／并列关系：${row.placement}`);
      lines.push("", "#### 画面状态的前、中、后变化", "",
        `- 前态：${cue.before}`,
        `- 过程：${cue.process}`,
        `- 后态：${cue.after}`, "",
        "#### 镜头意图（提供给设计审阅，不替代画面提示词）", "");
      const primary = cue.actors.find((actor) => actor.id === cue.focus.primaryActorId);
      lines.push(`- 主焦点：${primary ? `${primary.role}：${primary.meaning}` : "当前主画面对象"}`,
        `- 支持焦点：${cue.focus.supportingActorIds.map((id) => cue.actors.find((actor) => actor.id === id)?.meaning || "辅助主体").join("；") || "无"}`,
        `- 焦点交接：${cue.focus.handoff}`,
        `- 情绪变化：${cue.emotion.from} → ${cue.emotion.to}；通过 ${cue.emotion.mechanism} 实现。`, "",
        "#### 声音设计", "",
        `- 口播：${cue.sound.voice}`,
        `- 音乐：${cue.sound.music}`,
        `- 音效：${cue.sound.sfx}`,
        `- 缺少合适现成素材时：${cue.sound.fallback}`, "");
    }
  }
  if ((design.resourceFit || []).length) {
    lines.push("## 资源适配审查", "");
    for (const [fitIndex, row] of design.resourceFit.entries()) {
      lines.push(`### 资源适配 ${String(fitIndex + 1).padStart(2, "0")}｜${row.outcome}`, "", `- 使用情境：${row.context}`,
        `- 必须满足：${row.requirements.join("；")}`);
      if (row.soundRole) lines.push(`- 音频角色：${row.soundRole}`);
      if (row.acquisition) {
        const acquisition = row.acquisition;
        const statusLabel = {acquired: "候选素材已获取并校验", "attempted-unresolved": "已实际检索／检查但尚未获得候选", blocked: "存在已记录的授权／工具／成本边界"}[acquisition.status];
        const record = validated.materialById?.get(acquisition.recordMaterialId);
        lines.push(`- 获取进度：${statusLabel}；方式 ${acquisition.method}；${acquisition.summary}`,
          `- 过程记录：${record ? `${record.role}（${record.kind}）` : acquisition.recordMaterialId}，定位 ${acquisition.recordLocator}`);
        if (acquisition.candidate) {
          const candidate = validated.materialById?.get(acquisition.candidate.materialId);
          lines.push(`- 已获得候选：${candidate ? `${candidate.role}（${candidate.kind}）` : acquisition.candidate.materialId}；文件身份已按 SHA-256 核验。${row.outcome === "pending" ? "情境试听／观看仍未完成，不能宣称适配。" : ""}`);
        }
        lines.push(`- 下一步：${acquisition.nextAction}`);
        if (acquisition.generationAuthorization) {
          const authorization = acquisition.generationAuthorization;
          const authorizationSource = validated.materialById?.get(authorization.sourceMaterialId);
          lines.push(`- 后备生成授权（不代表已生成或适配）：资源任务 ${authorization.resourceTaskId}${authorization.soundRole ? `；音频角色 ${authorization.soundRole}` : ""}；范围：${authorization.scope}`,
            `- 授权原文：${authorization.userDecision}；来源 ${authorizationSource ? authorizationSource.role : authorization.sourceMaterialId}，定位 ${authorization.locator.lineStart}–${authorization.locator.lineEnd} 行。`);
        }
      }
      if (row.evidence) lines.push(`- 设计稿登记的适配依据：${row.evidence.method === "context-audition" ? "情境试听" : row.evidence.method === "visual-inspection" ? "画面检查" : "来源／技术筛查"}；观察范围 ${row.evidence.contextStartSec}–${row.evidence.contextEndSec} 秒；观察结果：${row.evidence.observation}`);
      else lines.push("- 适配状态：待实际情境试听／观看；来源筛查或技术预览不能单独证明适配。 ");
      lines.push("");
    }
  }
  if (productionConsumers?.verified) {
    lines.push("## 技术收据状态", "", "Film/audio 消费与成片输出已按生产收据核验。该结果只证明技术绑定，不证明审美、声音舒适度、可读性或观众理解已经通过。", "");
  } else {
    lines.push("## 交付边界", "", "这是完整的创意设计方向稿；还需由 Motion 生成 directorDesign/3 技术实现，并让其 creativeDesignRef 精确绑定本设计身份。方向稿校验不等于成片或审美验收。", "");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

function renderAnimationHandoffNotes(handoff) {
  if (!handoff) return "";
  const timelineSpan = ({startSample, endSample, sampleRateHz}) => `${(startSample / sampleRateHz).toFixed(3)}–${(endSample / sampleRateHz).toFixed(3)} 秒`;
  const rows = ["", "## ASRcut 剪后时间依据", ""];
  for (const beat of handoff.narrativeBeats.filter((entry) => entry.roleEvidence === "author-source-segments")) {
    rows.push(`- 讲述段 ${timelineSpan(beat.targetRange)}，${mdCell(beat.role)}，来源片段 ${mdCell(beat.occurrenceId)}。`);
  }
  for (const pause of handoff.availablePauseWindows) {
    rows.push(`- 自然停顿 ${timelineSpan(pause.targetRange)}，${mdCell(pause.reason)}。`);
  }
  for (const cue of handoff.visualCueCandidates) {
    rows.push(`- 画面伴随词「${mdCell(cue.text)}」· ${timelineSpan(cue.targetRange)} · ${mdCell(cue.occurrenceId)} / ${mdCell(cue.tokenId)}。`);
  }
  for (const seam of handoff.visualSeamRisks) {
    rows.push(`- 接缝 ${seam.targetSec.toFixed(3)} 秒，${mdCell(seam.risk)}。${mdCell(seam.visualMaskHint)}`);
  }
  return rows.length > 3 ? rows.join("\n") + "\n" : "";
}

async function exportDirectorDesign(validated, outputArg, productionConsumers = null, view = "creative") {
  const plan = validated.plan;
  const isV5 = plan.format === PLAN_FORMAT_V5;
  const hasLegacyDirectorDesign = (plan.format === PLAN_FORMAT_V3 && plan.directorDesign?.format === "laohu.motion.director-design/2")
    || (isFormalV4OrV5(plan) && plan.directorDesign?.format === "laohu.motion.director-design/3");
  if (isV5 && view === "technical" && !hasLegacyDirectorDesign) {
    fail("export-design --view technical requires a validated directorDesign/3 Motion realization; the Analysis creative direction can be exported with the default --view creative");
  }
  if (isV5 && view === "technical"
      && (plan.directorDesign?.creativeDesignRef?.id !== validated.creativeDesignId
        || plan.directorDesign?.creativeDesignRef?.sha256 !== validated.creativeDesignIdentitySha256)) {
    fail("export-design --view technical requires Motion's directorDesign/3 to bind the exact current creativeDesign/1 id and SHA-256; refresh the technical realization after a creative-design change");
  }
  if (!isV5 && !hasLegacyDirectorDesign) {
    fail("export-design requires production-plan/3 + directorDesign/2 or production-plan/4 + directorDesign/3; legacy summary designs remain readable but are not exported as complete plans");
  }
  const outputPath = resolveFrom(validated.planDir, outputArg, "--output");
  if (!isWithin(validated.planDir, outputPath) || !outputPath.toLowerCase().endsWith(".md")) {
    fail("export-design --output must be a Markdown file inside the production-plan directory tree");
  }
  let canonicalTimeline = null;
  const timelineRef = plan.inputs.asrcut?.timeline;
  if (timelineRef) {
    const timelinePath = resolveFrom(validated.planDir, timelineRef.path, "plan.inputs.asrcut.timeline.path");
    canonicalTimeline = readCanonicalSpeechRows(JSON.parse(await fs.readFile(timelinePath, "utf8")));
  } else if (validated.asrcutHandoff?.timeline) {
    canonicalTimeline = readCanonicalSpeechRows(validated.asrcutHandoff.timeline);
  }
  const designMarkdown = isV5 && view === "creative"
    ? creativeDesignMarkdown(validated, productionConsumers)
    : view === "creative"
      ? legacyCreativeDesignMarkdown(plan.directorDesign, canonicalTimeline, productionConsumers, validated.asrcutHandoff?.captionManifest ?? null)
      : directorDesignMarkdown(plan.directorDesign, canonicalTimeline, productionConsumers, Boolean(validated.audioPlan),
        validated.asrcutHandoff?.captionManifest ?? null);
  const markdown = designMarkdown + (view === "creative" ? renderAnimationHandoffNotes(validated.asrcutHandoff?.animationHandoff) : "");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    const current = await fs.readFile(outputPath, "utf8");
    if (!current.startsWith("<!-- laohu-motion-export-design/1 -->")) {
      fail("export-design refuses to overwrite a hand-maintained Markdown file; choose another output path");
    }
    const tempPath = outputPath + ".tmp-" + process.pid + "-" + crypto.randomBytes(4).toString("hex");
    await fs.writeFile(tempPath, markdown, { flag: "wx" });
    await fs.rename(tempPath, outputPath);
  } catch (error) {
    if (error.code === "ENOENT") await fs.writeFile(outputPath, markdown, { flag: "wx" });
    else throw error;
  }
  return { outputPath, sha256: await hashFile(outputPath), view,
    designId: isV5 && view === "creative" ? plan.creativeDesign.id : plan.directorDesign.id,
    creativeDesignId: validated.creativeDesignId || null,
    creativeDesignIdentitySha256: validated.creativeDesignIdentitySha256 || null,
    directorDesignIdentitySha256: view === "technical" ? validated.directorDesignIdentitySha256 : null };
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || ["--help", "-h", "help"].includes(argv[0])) {
    process.stdout.write([
      "Usage:",
      "  node scripts/production-plan.mjs validate --plan /absolute/work/production-plan.json [--stage inputs|direction|production]",
      "  node scripts/production-plan.mjs render-film --plan /absolute/work/production-plan.json --work-root /absolute/project",
      "  node scripts/production-plan.mjs render-audio --plan /absolute/work/production-plan.json --work-root /absolute/project [--allow-unreviewed-preview]",
      "  node scripts/production-plan.mjs run --plan /absolute/work/production-plan.json --work-root /absolute/project [--allow-unreviewed-preview]",
      "  node scripts/production-plan.mjs export-design --plan /absolute/work/production-plan.json --output production/design/director-design.md [--stage direction|production] [--view creative|technical] [--ffmpeg /absolute/ffmpeg]",
      "  node scripts/production-plan.mjs verify-delivery --plan /absolute/work/production-plan.json [--ffmpeg /absolute/ffmpeg]",
      "",
      "This bounded runner passes Film Blueprint /1 or /2 to templates.mjs and audio-plan/1 to audio.mjs.",
      "The plan stores semantic viewing/action intent and references the existing ASR, Film, and audio contracts; it does not store a second timeline.",
      "Validation can stop at inputs, direction, or production. production validation checks completed artifacts and source-bound evidence. For a fresh /2 project-shot render, declare the selected segment/local frame in keyStateEvidence; render-film/run captures and verifies the actual PNG after Film rendering.",
      "Execution preflight validates actual source/module/dependency/asset inputs and the route before creating outputs. render-film/run reject existing declared Film outputs. The generated technical key-state path and reusable planProof are written in the production-plan run receipt; they do not change review-gate status.",
      "For a new aesthetic direction, page through `node scripts/templates.mjs styles fulltext --library --page-characters 12000 --json`, continue with each `nextCursor`, place the final `reviewReceipt` in `styleLibraryReview`, then validate --stage direction. The receipt checks source coverage/version; the chosen original mechanism must still map to a real selected Film consumer.",
      "Use locked-local/evidence-local only for an actual user-locked or earlier validated direction. technical-probe stops after inputs/direction validation; production validation, run, render-film, and render-audio reject it before renderer/mixer/mux. Direct low-level renderer calls remain available for isolated technical evidence, not formal delivery. verify-delivery accepts the existing production-plan/3 + directorDesign/2 route or the formal production-plan/4 or /5 + directorDesign/3 attention/caption route bound to actual Film/audio outputs; /5 additionally binds its Analysis-authored creativeDesign/1 into the Motion realization and receipts. It reports technical contract status, not aesthetic or audience acceptance.",
      "export-design defaults to direction stage. /5 defaults to the Analysis-authored natural-language creativeDesign; --view technical exports the derived directorDesign implementation. Legacy /3 and /4 default to a human-readable intent view; --view technical preserves the detailed directorDesign export. --stage production requires complete production receipts and labels only receipt-matched consumers as verified. verify-delivery rechecks the same Film/audio/creative-design bindings and rejects actual candidate/generated/technical-preview consumption.",
      "locked-local userLockRef must locate an exact user-decision excerpt and scope in a declared source material; free-form strings fail with migration guidance.",
      "Source-only/reference-index/style-profile rows can be decision inputs; they cannot be production renderer candidates.",
      "Failures stop at the failed stage, preserve completed artifacts, and write a receipt with a stage-specific redo reason.",
      "--allow-unreviewed-preview maps only to audio.mjs --allow-candidate for the exact candidateAssetIds declared under plan.audioPreview; it does not allow generated audio.",
    ].join("\n") + "\n");
    return;
  }
  const args = cliArgs(argv);
  if (args.command === "validate") {
    const stage = args.stage || "production";
    const validated = await validatePlanFile(args.plan, { stage });
    process.stdout.write(JSON.stringify({
      format: "laohu.motion.production-plan-validation/1",
      resultClass: validated.plan.work.directionMode === "technical-probe" ? "technical-probe-validation" : "production-plan-validation",
      planPath: args.plan,
      planFormat: validated.plan.format,
      planSha256: validated.planSha256,
      stage,
      directionMode: validated.plan.work.directionMode,
      probeOnly: validated.plan.work.directionMode === "technical-probe",
      deliveryStatus: validated.plan.work.directionMode === "technical-probe" ? "technical-probe-only" : "validation-only",
      formalDelivery: false,
      completeThroughStage: stage,
      nextStage: validated.plan.work.directionMode === "technical-probe" && stage === "direction" ? "technical-probe-only"
        : stage === "inputs" ? "direction" : stage === "direction" ? "production" : null,
      route: validated.plan.work.directionMode === "technical-probe" && stage !== "inputs"
        ? "technical-probe-only; production-plan has no render, mix, mux, or formal-delivery route for this mode"
        : validated.blueprint ? `Film Blueprint /${validated.filmVersion} -> templates.mjs; audio-plan/1 -> audio.mjs` : null,
      segments: validated.blueprint?.segments.length ?? null,
      viewingUnits: validated.units?.length ?? null,
      shots: validated.plan.shots?.length ?? null,
      directionDecisions: validated.decisions?.length ?? null,
      directorDesignIdentitySha256: validated.directorDesignIdentitySha256 || null,
      creativeDesignId: validated.creativeDesignId || null,
      creativeDesignIdentitySha256: validated.creativeDesignIdentitySha256 || null,
      filmDesignIdentitySha256: validated.filmDesignIdentitySha256 || null,
      boundDirectorDesignIdentitySha256: validated.boundDirectorDesignIdentitySha256 || null,
      boundFilmDesignIdentitySha256: validated.boundFilmDesignIdentitySha256 || null,
      timingIdentitySha256: validated.timingIdentitySha256 || null,
      synchronizedAudioUses: validated.synchronizedAudioUses || [],
      fontEvidence: validated.fontEvidence || [],
      ...(validated.asrcutHandoff?.animationHandoff ? {animationHandoff: validated.asrcutHandoff.animationHandoff} : {}),
      outputs: validated.plan.work.directionMode === "technical-probe" ? null : validated.plan.outputs || null,
      receiptPolicy: validated.plan.work.directionMode === "technical-probe"
        ? "probe validation only; no production-plan render/mix/mux receipt or formal output is issued. Lower-level renderer evidence is technical and does not satisfy production acceptance."
        : stage === "production"
          ? "production validation checks declared references, completed renderer receipts and selected key-state evidence; it does not certify visual/audio quality"
          : "validation checks declared references and consumer mapping only; render receipts come from actual consumers and do not certify visual/audio quality",
    }, null, 2) + "\n");
    return;
  }
  if (args.command === "export-design") {
    const stage = args.stage || "direction";
    const view = args.view || "creative";
    if (!new Set(["creative", "technical"]).has(view)) fail("export-design --view must be creative or technical");
    const validated = await validatePlanFile(args.plan, { stage, ffmpeg: args.ffmpeg });
    if (validated.plan.work.directionMode === "technical-probe" && stage === "production") fail("technical-probe cannot export a formal production design or claim completed consumers");
    const productionConsumers = stage === "production" ? await verifyProductionConsumerReceipts(validated) : null;
    const exported = await exportDirectorDesign(validated, args.output, productionConsumers, view);
    process.stdout.write(JSON.stringify({
      format: "laohu.motion.director-design-export-receipt/1",
      stage,
      view,
      sourcePlan: path.relative(validated.planDir, validated.planPath).split(path.sep).join("/"),
      creativeDesignId: exported.creativeDesignId || null,
      creativeDesignIdentitySha256: exported.creativeDesignIdentitySha256 || null,
      directorDesignIdentitySha256: exported.directorDesignIdentitySha256,
      output: path.relative(validated.planDir, exported.outputPath).split(path.sep).join("/"),
      outputSha256: exported.sha256,
      generatedFromSingleSource: true,
    }, null, 2) + "\n");
    return;
  }
  if (args.command === "verify-delivery") {
    const { value: submittedPlan } = await readJson(args.plan, "production plan");
    if (!((submittedPlan.format === PLAN_FORMAT_V3 && submittedPlan.directorDesign?.format === "laohu.motion.director-design/2")
      || (isFormalV4OrV5(submittedPlan) && submittedPlan.directorDesign?.format === "laohu.motion.director-design/3"))) {
      fail("verify-delivery accepts production-plan/3 + directorDesign/2 for an existing legacy delivery or production-plan/4 or /5 + directorDesign/3 for the formal attention/caption handoff; summary/legacy plans cannot qualify");
    }
    const validated = await validatePlanFile(args.plan, { stage: "production", ffmpeg: args.ffmpeg });
    if (validated.plan.work.directionMode === "technical-probe") fail("technical-probe is technical evidence and cannot pass verify-delivery");
    const uncheckedFonts = (validated.fontEvidence || []).filter((row) => row.rendererFontLoad !== "PASS");
    if (uncheckedFonts.length) fail("verify-delivery cannot certify renderer font loading without a real Film receipt record; font evidence is not-checked for styles: " + uncheckedFonts.map((row) => row.styleId).join(", "));
    const productionConsumers = await verifyProductionConsumerReceipts(validated);
    const artifactRows = productionConsumers.artifacts;
    process.stdout.write(JSON.stringify({
      format: "laohu.motion.formal-delivery-verification/1",
      result: "PASS",
      planFormat: validated.plan.format,
      creativeDesignId: validated.creativeDesignId || null,
      creativeDesignIdentitySha256: validated.creativeDesignIdentitySha256 || null,
      directorDesignFormat: validated.plan.directorDesign.format,
      directorDesignIdentitySha256: validated.directorDesignIdentitySha256,
      boundDirectorDesignIdentitySha256: validated.boundDirectorDesignIdentitySha256,
      boundFilmDesignIdentitySha256: validated.boundFilmDesignIdentitySha256,
      timingIdentitySha256: validated.timingIdentitySha256,
      selectedAudioUses: validated.selectedAudioUses,
      synchronizedAudioUses: validated.synchronizedAudioUses,
      fontEvidence: validated.fontEvidence || [],
      artifacts: artifactRows,
      creativeQuality: "UNKNOWN",
      boundary: "PASS means the complete design, exact production bindings, acquired/consumed selected assets, completed renderer/audio receipts, and declared outputs satisfy this technical handoff contract. It does not certify aesthetic quality, listener experience, or audience acceptance.",
    }, null, 2) + "\n");
    return;
  }
  await execute(args);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write((error.stack || error.message) + "\n");
    process.exitCode = 1;
  });
}

export { PLAN_FORMAT, inspectFilmReceipt, validatePlanFile };
