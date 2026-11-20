#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadMotionPackage } from "./laohu-motion-runtime.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corePath = path.join(skillDir, "scripts", "motion-core.js");
const opsPath = path.join(skillDir, "scripts", "motion-ops.js");
const templateCatalogPath = path.join(skillDir, "templates", "catalog.json");
const localEffectsAdapterPath = path.join(skillDir, "templates", "adapters", "laohu-effects.js");
const transitionsAdapterPath = path.join(skillDir, "templates", "adapters", "laohu-transitions.js");
const motionRecipesAdapterPath = path.join(skillDir, "templates", "adapters", "laohu-motion-recipes.js");
const MAX_MOTION_RECIPE_FRAME_BYTES = 128 * 1024 * 1024;
const MAX_MOTION_RECIPE_SEQUENCE_ENCODED_BYTES = 64 * 1024 * 1024;
const MAX_MOTION_RECIPE_SEQUENCE_TOTAL_ENCODED_BYTES = 128 * 1024 * 1024;
const MAX_MOTION_RECIPE_SEQUENCE_FRAME_RGBA_BYTES = 64 * 1024 * 1024;
const MAX_MOTION_RECIPE_SEQUENCE_FRAMES = 900;
const PLAYWRIGHT_VERSION = "1.55.0";
const localDgEffectSourceFunctions = ["DG.drawPartial", "DG.circumscribe", "DG.brace", "DG.indicate", "DG.cum", "MO.lagged", "MO.thereAndBack"];
const require = createRequire(import.meta.url);

function usage() {
  return [
    "Usage: node scripts/render.mjs --scene /absolute/scene.json --output /absolute/output.mp4 --cache-dir /absolute/project/.cache/tmp/motion-run",
    "       [--browser /absolute/browser] [--ffmpeg /absolute/ffmpeg] [--draw-module /absolute/draw.js] [--template-effects laohu-motion-dg] [--samples 0,1.5] [--overwrite]",
    "       [--require-layout-evidence] [--require-motion-evidence] [--check-text-visibility]",
  ].join("\n");
}

function parseArgs(argv) {
  const flags = new Set(["--overwrite", "--require-layout-evidence", "--require-motion-evidence", "--check-text-visibility"]);
  const values = new Set(["--scene", "--output", "--cache-dir", "--browser", "--ffmpeg", "--draw-module", "--template-effects", "--samples"]);
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (flags.has(key)) args[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true;
    else if (values.has(key)) {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw new Error(`Missing value for ${key}`);
      const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      args[name] = argv[++index];
    } else throw new Error(`Unknown argument ${key}`);
  }
  for (const key of ["scene", "output", "cacheDir"]) if (!args[key]) throw new Error(`Required argument --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  for (const key of ["scene", "output", "cacheDir", "browser", "ffmpeg", "drawModule"]) {
    if (args[key] && !path.isAbsolute(args[key])) throw new Error(`--${key} must be an absolute path`);
  }
  args.scene = path.resolve(args.scene);
  args.output = path.resolve(args.output);
  args.cacheDir = path.resolve(args.cacheDir);
  args.browser = args.browser || process.env.MOTION_BROWSER;
  args.ffmpeg = args.ffmpeg || process.env.MOTION_FFMPEG || "ffmpeg";
  return args;
}

function motionEvidenceRows(scene, field) {
  const rows = [];
  for (const object of scene.objects || []) {
    const evidence = object && object.data && object.data.motionEvidence;
    if (evidence == null) continue;
    if (typeof evidence !== "object" || Array.isArray(evidence)) throw new Error(`objects[].data.motionEvidence must be an object`);
    const value = evidence[field];
    if (value == null) continue;
    if (!Array.isArray(value)) throw new Error(`objects[].data.motionEvidence.${field} must be an array`);
    rows.push(...value);
  }
  return rows;
}

function validateLayoutRequirements(scene, frameCount) {
  const requirements = motionEvidenceRows(scene, "layoutEvidenceRequirements");
  if (!Array.isArray(requirements) || requirements.length === 0) {
    throw new Error("--require-layout-evidence requires non-empty objects[].data.motionEvidence.layoutEvidenceRequirements");
  }
  const ids = new Set();
  const normalized = requirements.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`layoutEvidenceRequirements[${index}] must be an object`);
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const scope = typeof entry.scope === "string" ? entry.scope.trim() : "";
    if (!id || ids.has(id)) throw new Error(`layoutEvidenceRequirements[${index}].id must be non-empty and unique`);
    if (!scope) throw new Error(`layoutEvidenceRequirements[${index}].scope must be a non-empty string`);
    ids.add(id);
    const startSec = entry.startSec, endSec = entry.endSec;
    const timeEpsilon = 1e-8, frameEpsilon = 1e-9;
    // A required interval is half-open in film time. Include encoded frames
    // whose presentation timestamp falls inside [startSec, endSec), even when
    // either boundary lands between frame timestamps.
    const startFrame = Math.ceil(startSec * scene.fps - frameEpsilon);
    const endFrame = Math.ceil(endSec * scene.fps - frameEpsilon);
    if (typeof startSec !== "number" || typeof endSec !== "number"
      || !Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec
      || endSec > scene.duration + timeEpsilon || startFrame < 0 || endFrame > frameCount || endFrame <= startFrame) {
      throw new Error(`layoutEvidenceRequirements[${index}] must cover at least one encoded frame in a half-open interval inside the scene`);
    }
    if (!Array.isArray(entry.expectedIds)) throw new Error(`layoutEvidenceRequirements[${index}].expectedIds must be an array`);
    const expectedIds = entry.expectedIds.map((value, idIndex) => {
      if (typeof value !== "string" || !value.trim()) throw new Error(`layoutEvidenceRequirements[${index}].expectedIds[${idIndex}] must be a non-empty string`);
      return value.trim();
    });
    if (new Set(expectedIds).size !== expectedIds.length) throw new Error(`layoutEvidenceRequirements[${index}].expectedIds must not contain duplicates`);
    if (expectedIds.length === 0) {
      if (entry.intentionallyEmpty !== true || typeof entry.reason !== "string" || !entry.reason.trim()) {
        throw new Error(`empty layout requirement ${id} must set intentionallyEmpty:true and provide a reason`);
      }
    } else if (entry.intentionallyEmpty === true) {
      throw new Error(`non-empty layout requirement ${id} cannot set intentionallyEmpty:true`);
    }
    return { id, scope, startSec, endSec, startFrame, endFrame, expectedIds, intentionallyEmpty: expectedIds.length === 0, reason: entry.reason || null };
  });
  for (let left = 0; left < normalized.length; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      const a = normalized[left], b = normalized[right];
      if (a.startFrame < b.endFrame && b.startFrame < a.endFrame) {
        throw new Error(`layout requirements ${a.id} and ${b.id} overlap; combine their IDs into one scope per frame`);
      }
    }
  }
  return normalized;
}

function validateMotionRequirements(scene, frameCount, operationRecords) {
  const rows = motionEvidenceRows(scene, "motionRequirements");
  if (!rows.length) throw new Error("--require-motion-evidence requires non-empty objects[].data.motionEvidence.motionRequirements");
  const byInstance = new Map(operationRecords.map((record) => [record.instanceId, record]));
  const ids = new Set();
  const normalized = rows.map((row, index) => {
    const label = `motionRequirements[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${label} must be an object`);
    const allowedFields = new Set(["id", "scope", "startSec", "endSec", "expected"]);
    if (Object.keys(row).some((key) => !allowedFields.has(key))) throw new Error(`${label} contains unsupported motion-evidence fields; only id, scope, startSec, endSec and expected are implemented`);
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const scope = typeof row.scope === "string" ? row.scope.trim() : "";
    if (!id || ids.has(id)) throw new Error(`${label}.id must be non-empty and unique`);
    if (!scope) throw new Error(`${label}.scope must be a non-empty description`);
    ids.add(id);
    const { startSec, endSec } = row;
    const startFrame = Math.ceil(startSec * scene.fps - 1e-9);
    const endFrame = Math.ceil(endSec * scene.fps - 1e-9);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec
      || endSec > scene.duration + 1e-8 || startFrame < 0 || endFrame > frameCount || endFrame <= startFrame) {
      throw new Error(`${label} must cover at least one encoded frame in a half-open [startSec,endSec) window inside the scene`);
    }
    if (!Array.isArray(row.expected) || row.expected.length === 0) throw new Error(`${label}.expected must contain at least one planned entity/instance; zero coverage cannot pass`);
    const expectedInstances = new Set();
    const expected = row.expected.map((item, expectedIndex) => {
      const itemLabel = `${label}.expected[${expectedIndex}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${itemLabel} must be an object`);
      const fields = ["entityId", "instanceId", "operationId", "targetId", "phaseId"];
      for (const field of fields) if (typeof item[field] !== "string" || !item[field].trim()) throw new Error(`${itemLabel}.${field} must be a non-empty string`);
      if (Object.keys(item).some((key) => !fields.includes(key))) throw new Error(`${itemLabel} contains an unsupported expected field`);
      if (expectedInstances.has(item.instanceId)) throw new Error(`${label}.expected contains duplicate instanceId ${item.instanceId}`);
      expectedInstances.add(item.instanceId);
      const operation = byInstance.get(item.instanceId);
      if (!operation || fields.some((field) => operation[field] !== item[field])) throw new Error(`${itemLabel} must exactly match a validated local operation instance`);
      if (startSec < operation.startSec - 1e-8 || endSec > operation.endSec + 1e-8) throw new Error(`${itemLabel} phase does not cover the full half-open evidence window`);
      return Object.fromEntries(fields.map((field) => [field, item[field]]));
    });
    return { id, scope, startSec, endSec, startFrame, endFrame, expected };
  });
  for (let left = 0; left < normalized.length; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      const a = normalized[left], b = normalized[right];
      if (a.startFrame >= b.endFrame || b.startFrame >= a.endFrame) continue;
      const common = new Set(a.expected.map((item) => item.instanceId));
      const duplicate = b.expected.find((item) => common.has(item.instanceId));
      if (duplicate) throw new Error(`motion requirements ${a.id} and ${b.id} both own ${duplicate.instanceId} during overlapping encoded frames`);
    }
  }
  return normalized;
}

function createRequiredMotionTracker(requirements, operationRecords, scene, frameCount) {
  const byFrame = new Map();
  for (const requirement of requirements) {
    for (let frameIndex = requirement.startFrame; frameIndex < requirement.endFrame; frameIndex += 1) {
      const active = byFrame.get(frameIndex) || [];
      active.push(requirement);
      byFrame.set(frameIndex, active);
    }
  }
  const seenFrames = new Set();
  const traces = [];
  const rows = new Map(requirements.map((row) => [row.id, {
    id: row.id, scope: row.scope, expected: row.expected,
    expectedFrames: row.endFrame - row.startFrame, validFrames: 0,
    missingFrames: 0, unsupportedFrames: 0, staleFrames: 0, malformedFrames: 0,
  }]));
  function add(trace, frameIndex, frameSha256, frameFile) {
    if (seenFrames.has(frameIndex)) throw new Error(`Duplicate motion-frame sample for encoded frame ${frameIndex}`);
    seenFrames.add(frameIndex);
    const active = byFrame.get(frameIndex) || [];
    if (!active.length) return;
    const expected = active.flatMap((row) => row.expected).sort((a, b) => a.instanceId.localeCompare(b.instanceId));
    const rowIds = active.map((row) => row.id).sort();
    const failRows = (field) => { for (const requirement of active) rows.get(requirement.id)[field] += 1; };
    if (!trace || typeof trace !== "object" || Array.isArray(trace) || trace.schema !== "motion-frame-trace/1" || !Array.isArray(trace.observed)) {
      failRows("missingFrames");
      traces.push({ frameIndex, status: "missing", requirementIds: rowIds, frameSha256, frameFile });
      return;
    }
    const expectedTime = frameIndex / scene.fps;
    if (trace.frameIndex !== frameIndex || !Number.isFinite(trace.timeSec) || Math.abs(trace.timeSec - expectedTime) > 1e-9
      || !Number.isFinite(trace.expectedFrameTime) || Math.abs(trace.expectedFrameTime - expectedTime) > 1e-9
      || trace.fps !== scene.fps || trace.viewport?.x !== 0 || trace.viewport?.y !== 0
      || trace.viewport?.width !== scene.width || trace.viewport?.height !== scene.height
      || trace.clock?.timeBasis !== "scene-local" || trace.clock?.durationSec !== scene.duration
      || trace.clock?.frameCount !== frameCount || trace.status !== "observed") {
      failRows("staleFrames");
      traces.push({ ...trace, frameSha256, frameFile, status: "stale", requirementIds: rowIds });
      return;
    }
    const actualExpected = [...(trace.expected || [])].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
    if (JSON.stringify(actualExpected) !== JSON.stringify(expected)) {
      failRows("malformedFrames");
      traces.push({ ...trace, frameSha256, frameFile, status: "malformed", requirementIds: rowIds });
      return;
    }
    const observedIds = trace.observed.map((item) => item && item.instanceId);
    if (observedIds.some((value) => typeof value !== "string") || new Set(observedIds).size !== observedIds.length) {
      failRows("malformedFrames");
      traces.push({ ...trace, frameSha256, frameFile, status: "malformed", requirementIds: rowIds });
      return;
    }
    const observedByInstance = new Map(trace.observed.map((item) => [item.instanceId, item]));
    const missingIds = expected.filter((item) => {
      const observation = observedByInstance.get(item.instanceId);
      return !observation || observation.status !== "drawn" || observation.entityId !== item.entityId
        || observation.operationId !== item.operationId || observation.targetId !== item.targetId || observation.phaseId !== item.phaseId;
    }).map((item) => item.instanceId);
    const unsupportedIds = trace.observed.filter((item) => item.status === "unsupported").map((item) => item.instanceId);
    const declaredMissing = [...(trace.missingIds || [])].sort();
    const declaredUnsupported = [...(trace.unsupportedIds || [])].sort();
    if (JSON.stringify(declaredMissing) !== JSON.stringify(missingIds.sort())
      || JSON.stringify(declaredUnsupported) !== JSON.stringify(unsupportedIds.sort())) {
      failRows("malformedFrames");
      traces.push({ ...trace, frameSha256, frameFile, status: "malformed", requirementIds: rowIds, checkedMissingIds: missingIds, checkedUnsupportedIds: unsupportedIds });
      return;
    }
    if (unsupportedIds.length) failRows("unsupportedFrames");
    else if (missingIds.length) failRows("missingFrames");
    else for (const requirement of active) rows.get(requirement.id).validFrames += 1;
    traces.push({ ...trace, frameSha256, frameFile, requirementIds: rowIds });
  }
  function report() {
    const requirementsReport = [...rows.values()].map((row) => ({
      ...row,
      complete: row.expectedFrames > 0 && row.validFrames === row.expectedFrames
        && row.missingFrames === 0 && row.unsupportedFrames === 0 && row.staleFrames === 0 && row.malformedFrames === 0,
    }));
    const expectedFrames = requirementsReport.reduce((sum, row) => sum + row.expectedFrames, 0);
    const validFrames = requirementsReport.reduce((sum, row) => sum + row.validFrames, 0);
    return {
      schema: "motion-evidence-report/1",
      status: expectedFrames > 0 && validFrames === expectedFrames && requirementsReport.every((row) => row.complete) ? "complete" : "incomplete",
      expectedFrames, validFrames, complete: expectedFrames > 0 && validFrames === expectedFrames && requirementsReport.every((row) => row.complete),
      renderedFrameCount: seenFrames.size, expectedFrameCount: frameCount,
      operationProviders: operationRecords.map(({ instanceId, entityId, operationId, targetId, phaseId }) => ({ instanceId, entityId, operationId, targetId, phaseId })),
      requirements: requirementsReport,
      frames: traces,
      supports: ["declared local operation instances", "scene-local encoded frame windows", "same-draw projected rectangle geometry", "viewport, frame clock and output hashes"],
      doesNotSupport: ["whole-scene entity visibility", "cross-renderer handoff", "full-visibility guarantees", "film-global clock mapping", "subframe samples", "audio controls"],
      limits: "This verifies only the declared local operation instances and their projected rect geometry. It does not prove semantic identity, cross-renderer handoff, full scene motion coverage, readability, audience understanding or aesthetic success.",
    };
  }
  return { add, report };
}

function validateTextVisibilityProbes(scene, frameCount) {
  const probes = motionEvidenceRows(scene, "textVisibilityProbes");
  const ids = new Set();
  const objectsById = new Map((scene.objects || []).filter((object) => object && typeof object.id === "string").map((object) => [object.id, object]));
  const layersById = new Map((scene.layers || []).filter((layer) => layer && typeof layer.id === "string").map((layer) => [layer.id, layer]));
  return probes.map((probe, index) => {
    if (!probe || typeof probe !== "object" || Array.isArray(probe)) throw new Error(`textVisibilityProbes[${index}] must be an object`);
    const id = typeof probe.id === "string" ? probe.id.trim() : "";
    const targetId = typeof probe.targetId === "string" ? probe.targetId.trim() : "";
    const text = typeof probe.text === "string" ? probe.text : "";
    if (!id || ids.has(id)) throw new Error(`textVisibilityProbes[${index}].id must be non-empty and unique`);
    if (!targetId || !text) throw new Error(`textVisibilityProbes[${index}] must name targetId and non-empty text`);
    const target = objectsById.get(targetId);
    if (!target) throw new Error(`textVisibilityProbes[${index}].targetId must identify an object in scene.objects`);
    if (probe.blendMode != null && (typeof probe.blendMode !== "string" || !probe.blendMode.trim())) {
      throw new Error(`textVisibilityProbes[${index}].blendMode must be a non-empty string when provided`);
    }
    ids.add(id);
    const timeSec = probe.timeSec, frameIndex = Math.round(timeSec * scene.fps);
    if (typeof timeSec !== "number" || !Number.isFinite(timeSec) || timeSec < 0 || timeSec >= scene.duration || frameIndex < 0 || frameIndex >= frameCount
      || Math.abs(frameIndex / scene.fps - timeSec) > 1e-8) {
      throw new Error(`textVisibilityProbes[${index}].timeSec must select an encoded frame inside the scene`);
    }
    const expected = probe.expected || "complete";
    if (!["complete", "partial", "hidden"].includes(expected)) throw new Error(`textVisibilityProbes[${index}].expected must be complete, partial, or hidden`);
    const referencePaddingPx = probe.referencePaddingPx == null ? 64 : probe.referencePaddingPx;
    if (typeof referencePaddingPx !== "number" || !Number.isInteger(referencePaddingPx) || referencePaddingPx < 1 || referencePaddingPx > 512) {
      throw new Error(`textVisibilityProbes[${index}].referencePaddingPx must be an integer from 1 to 512`);
    }
    let layerId = target.layer == null ? null : target.layer;
    let sceneBlendMode = probe.blendMode || "source-over";
    const visitedLayers = new Set();
    while (layerId != null) {
      if (visitedLayers.has(layerId)) throw new Error(`textVisibilityProbes[${index}] target layer ancestry contains a cycle`);
      visitedLayers.add(layerId);
      const layer = layersById.get(layerId);
      if (!layer) break;
      if (layer.blendMode && layer.blendMode !== "source-over") sceneBlendMode = layer.blendMode;
      layerId = layer.parent == null ? null : layer.parent;
    }
    return { ...probe, id, targetId, text, timeSec, frameIndex, expected, referencePaddingPx, sceneBlendMode };
  });
}

function requireExecutable(filePath, label) {
  if (path.isAbsolute(filePath)) {
    return fs.access(filePath, 1).then(() => filePath).catch(() => { throw new Error(`${label} is not executable: ${filePath}`); });
  }
  const pathEntries = (process.env.PATH || "").split(path.delimiter);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, filePath);
    try {
      const stat = require("node:fs").statSync(candidate);
      if (stat.isFile()) return Promise.resolve(candidate);
    } catch {}
  }
  return Promise.reject(new Error(`${label} was not found on PATH; pass an explicit installed executable`));
}

function stateAt(scene, core, time) {
  const state = core.evaluateScene(scene, time, true);
  function read(target, property) {
    if (target.kind === "variable") return state.variables[target.id];
    const root = target.kind === "object" ? state.objects[target.id]
      : target.kind === "layer" ? state.layers[target.id]
        : target.kind === "camera" ? state.camera : state.variables;
    return String(property || "value").split(".").reduce((value, key) => value == null ? undefined : value[key], root);
  }
  return { time, variables: state.variables, camera: state.camera, targetValues: state.objects && Object.fromEntries(Object.keys(state.objects).map((id) => [id, { x: state.objects[id].x, y: state.objects[id].y, cx: state.objects[id].cx, cy: state.objects[id].cy, progress: state.objects[id].progress, morphProgress: state.objects[id].morphProgress, opacity: state.objects[id].opacity }])), read };
}

function valuesMatch(actual, expected) {
  if (typeof actual === "number" && typeof expected === "number") {
    return Math.abs(actual - expected) <= 1e-7 * Math.max(1, Math.abs(actual), Math.abs(expected));
  }
  if (Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length) {
    return actual.every((value, index) => valuesMatch(value, expected[index]));
  }
  return Object.is(actual, expected);
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

async function preflightOutput(args) {
  const inputs = [args.scene, args.drawModule, corePath, opsPath, motionRecipesAdapterPath, transitionsAdapterPath].filter(Boolean);
  const output = await realPathForComparison(args.output);
  const realInputs = [];
  for (const input of inputs) {
    const realInput = await realPathForComparison(input);
    realInputs.push(realInput);
    if (output === realInput || await sameExistingFile(args.output, input)) {
      throw new Error(`Output path collides with an input; no files were written: ${args.output} ↔ ${input}`);
    }
  }
  const cache = await realPathForComparison(args.cacheDir);
  if (containsPath(cache, output) || realInputs.some((input) => containsPath(cache, input))) {
    throw new Error(`Cache directory would contain or replace an input/output path: ${args.cacheDir}`);
  }
  let stat;
  try { stat = await fs.lstat(args.output); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (stat) {
    if (stat.isSymbolicLink()) throw new Error(`Output path is a symlink; choose its resolved destination explicitly: ${args.output}`);
    if (!stat.isFile()) throw new Error(`Output path is not a regular file: ${args.output}`);
    if (!args.overwrite) throw new Error(`Output already exists; choose a new path or pass --overwrite: ${args.output}`);
  }
}

function siblingTempPath(targetPath) {
  const extension = path.extname(targetPath);
  const stem = path.basename(targetPath, extension);
  return path.join(path.dirname(targetPath), `.${stem}.${process.pid}.${Date.now()}.part${extension}`);
}

async function commitOutput(tempPath, targetPath, overwrite) {
  if (overwrite) {
    await fs.rename(tempPath, targetPath);
    return;
  }
  await fs.link(tempPath, targetPath);
  await fs.rm(tempPath, { force: true });
}

function run(command, args, label, env) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status})\n${result.stdout}\n${result.stderr}`);
  return result;
}

function asDataBuffer(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Canvas did not return a PNG data URL");
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
}

async function sha256File(filename) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

async function fingerprintFile(role, filename) {
  const bytes = await fs.readFile(filename);
  return { role, status: "present", path: path.resolve(filename), sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

async function resolveMotionRecipeFrameAssets(records, scene, scenePath) {
  const sceneDirectory = await fs.realpath(path.dirname(scenePath));
  const browserAssets = {};
  const evidence = [];
  let allSequenceEncodedBytes = 0;
  const resolveSceneAsset = async (relativePath, label) => {
    if (path.isAbsolute(relativePath) || relativePath.includes("\\")
        || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error(`${label} must be a project-local relative path with no dot, parent, or backslash components`);
    }
    const requested = path.resolve(sceneDirectory, relativePath);
    const actual = await fs.realpath(requested);
    const relative = path.relative(sceneDirectory, actual);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`${label} resolves outside the scene directory`);
    }
    return {actual, relative: relative.split(path.sep).join("/")};
  };
  const readPngAsset = async (relativePath, label) => {
    if (!/\.png$/i.test(relativePath)) throw new Error(`${label} must be a PNG frame`);
    const {actual, relative} = await resolveSceneAsset(relativePath, label);
    const bytes = await fs.readFile(actual);
    if (bytes.length < 24 || bytes.length > MAX_MOTION_RECIPE_FRAME_BYTES) throw new Error(`${label} PNG must be 24 bytes–128 MiB`);
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString("ascii", 12, 16) !== "IHDR") {
      throw new Error(`${label} must point to a PNG frame asset`);
    }
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width !== scene.width || height !== scene.height) throw new Error(`${label} PNG is ${width}x${height}; the Motion stage is ${scene.width}x${scene.height}`);
    return {path: relative, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, width, height,
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`};
  };
  for (const record of records) {
    for (const side of ["from", "to"]) {
      const panel = record.parameters?.[side];
      if (panel?.type === "source-frame-sequence") {
        const {actual: manifestFile, relative: manifestPath} = await resolveSceneAsset(panel.path, `${record.id}.${side}.path`);
        const manifestBytes = await fs.readFile(manifestFile);
        if (manifestBytes.length > 256 * 1024) throw new Error(`${record.id}.${side} source-frame sequence manifest must not exceed 256 KiB`);
        let manifest;
        try { manifest = JSON.parse(manifestBytes.toString("utf8")); }
        catch (error) { throw new Error(`${record.id}.${side} source-frame sequence manifest is not valid JSON: ${error.message}`); }
        if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
            || manifest.format !== "laohu.motion.source-frame-sequence/1") {
          throw new Error(`${record.id}.${side} sequence manifest must use laohu.motion.source-frame-sequence/1`);
        }
        const keys = Object.keys(manifest).sort();
        if (JSON.stringify(keys) !== JSON.stringify(["format", "fps", "frames", "height", "width"])) throw new Error(`${record.id}.${side} sequence manifest has unsupported or missing fields`);
        if (manifest.width !== scene.width || manifest.height !== scene.height) throw new Error(`${record.id}.${side} sequence dimensions must match the Motion stage ${scene.width}x${scene.height}`);
        if (typeof manifest.fps !== "number" || !Number.isFinite(manifest.fps) || manifest.fps <= 0 || manifest.fps > 120) throw new Error(`${record.id}.${side} sequence fps must be in (0, 120]`);
        if (!Array.isArray(manifest.frames) || manifest.frames.length < 2 || manifest.frames.length > MAX_MOTION_RECIPE_SEQUENCE_FRAMES) {
          throw new Error(`${record.id}.${side} sequence must contain 2–${MAX_MOTION_RECIPE_SEQUENCE_FRAMES} ordered PNG frames`);
        }
        const frames = [];
        let totalEncodedBytes = 0;
        const decodedFrameBytes = scene.width * scene.height * 4;
        if (!Number.isSafeInteger(decodedFrameBytes) || decodedFrameBytes > MAX_MOTION_RECIPE_SEQUENCE_FRAME_RGBA_BYTES) {
          throw new Error(`${record.id}.${side} one decoded source frame would use ${decodedFrameBytes} RGBA bytes; the per-frame LRU cache budget is 64 MiB`);
        }
        for (const [index, framePath] of manifest.frames.entries()) {
          if (typeof framePath !== "string" || framePath.startsWith("/") || framePath.includes("\\")
              || framePath.split("/").some((part) => !part || part === "." || part === "..")) {
            throw new Error(`${record.id}.${side}.frames[${index}] must be a relative PNG path with no dot, parent, or backslash components`);
          }
          const frame = await readPngAsset(path.posix.join(path.posix.dirname(manifestPath), framePath), `${record.id}.${side}.frames[${index}]`);
          totalEncodedBytes += frame.bytes;
          if (totalEncodedBytes > MAX_MOTION_RECIPE_SEQUENCE_ENCODED_BYTES) throw new Error(`${record.id}.${side} encoded PNG sequence exceeds the 64 MiB input-file budget`);
          allSequenceEncodedBytes += frame.bytes;
          if (allSequenceEncodedBytes > MAX_MOTION_RECIPE_SEQUENCE_TOTAL_ENCODED_BYTES) throw new Error(`Garden source-frame PNG inputs exceed the 128 MiB scene-wide encoded-file budget`);
          frames.push(frame);
        }
        const manifestSha256 = crypto.createHash("sha256").update(manifestBytes).digest("hex");
        browserAssets[record.id] ||= {};
        browserAssets[record.id][side] = {type: "source-frame-sequence", path: panel.path, manifestSha256,
          fps: manifest.fps, frameCount: frames.length, width: scene.width, height: scene.height,
          decodedFrameBytes, decodedCacheBudgetBytes: MAX_MOTION_RECIPE_SEQUENCE_FRAME_RGBA_BYTES, totalEncodedBytes, frames};
        evidence.push({type: "source-frame-sequence", recipeId: record.recipeId, instanceId: record.id, side, path: manifestPath,
          manifestSha256, fps: manifest.fps, frameCount: frames.length, totalEncodedBytes,
          decodedFrameBytes, decodedCacheBudgetBytes: MAX_MOTION_RECIPE_SEQUENCE_FRAME_RGBA_BYTES,
          frames: frames.map(({path, sha256, bytes}) => ({path, sha256, bytes})), width: scene.width, height: scene.height});
        continue;
      }
      if (panel?.type !== "source-frame") continue;
      if (path.isAbsolute(panel.path) || panel.path.includes("\\")) throw new Error(`${record.id}.${side}.path must be project-local and relative to the scene JSON`);
      const requested = path.resolve(sceneDirectory, panel.path);
      const actual = await fs.realpath(requested);
      const relative = path.relative(sceneDirectory, actual);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`${record.id}.${side}.path resolves outside the scene directory`);
      }
      const bytes = await fs.readFile(actual);
      if (bytes.length < 24 || bytes.length > MAX_MOTION_RECIPE_FRAME_BYTES) throw new Error(`${record.id}.${side} PNG must be 24 bytes–128 MiB`);
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString("ascii", 12, 16) !== "IHDR") {
        throw new Error(`${record.id}.${side}.path must point to a PNG frame asset`);
      }
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      if (width !== scene.width || height !== scene.height) throw new Error(`${record.id}.${side} PNG is ${width}x${height}; the Motion stage is ${scene.width}x${scene.height}`);
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      const relativePath = relative.split(path.sep).join("/");
      browserAssets[record.id] ||= {};
      browserAssets[record.id][side] = {
        path: panel.path,
        resolvedRelativePath: relativePath,
        sha256,
        bytes: bytes.length,
        width,
        height,
        dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      };
      evidence.push({ recipeId: record.recipeId, instanceId: record.id, side, path: relativePath, sha256, bytes: bytes.length, width, height });
    }
  }
  return { browserAssets, evidence };
}

function absentInputFingerprint(role) {
  return {
    role, status: "not-provided", path: null, bytes: 0,
    sha256: crypto.createHash("sha256").update(`motion-render-absent-input/1:${role}`).digest("hex"),
  };
}

async function captureBrowserResource(request) {
  const base = { url: request.url(), resourceType: request.resourceType() };
  try {
    const response = await request.response();
    if (!response) return { ...base, status: "response-unavailable", sha256: null };
    const headers = response.headers();
    const rawLength = Number(headers["content-length"]);
    const contentLength = Number.isFinite(rawLength) && rawLength >= 0 ? rawLength : null;
    const row = { ...base, status: response.status(), contentType: headers["content-type"] || null, contentLength, sha256: null };
    if (contentLength == null) return { ...row, hashStatus: "unhashed-content-length-unavailable" };
    if (contentLength > 8 * 1024 * 1024) return { ...row, hashStatus: "unhashed-over-8-mib" };
    const body = await response.body();
    return { ...row, bytes: body.length, sha256: crypto.createHash("sha256").update(body).digest("hex"), hashStatus: "hashed" };
  } catch (error) {
    return { ...base, status: "capture-failed", sha256: null, error: String(error && error.message || error) };
  }
}

function createLayoutTracker(frameCount) {
  const encoded = { expectedFrames: frameCount, validFrames: 0, notCheckedFrames: 0, missingFrames: 0, staleFrames: 0, malformedFrames: 0, partialProducerFrames: 0, framesWithoutExpectedIds: 0 };
  const previews = { expectedSamples: 0, validSamples: 0, notCheckedSamples: 0, missingSamples: 0, staleSamples: 0, malformedSamples: 0 };
  const scopes = new Map();
  const previewScopes = new Map();
  const conflicts = new Map();
  const outOfFrame = new Map();
  const previewConflicts = new Map();
  const previewOutOfFrame = new Map();

  function add(snapshot, timeSec, frameIndex, kind, ops, width, height) {
    const counts = kind === "encoded-frame" ? encoded : previews;
    if (snapshot == null) {
      if (kind === "encoded-frame") counts.missingFrames += 1;
      else counts.missingSamples += 1;
      return;
    }
    if (!snapshot || typeof snapshot !== "object" || snapshot.schema !== "motion-layout-snapshot/v1"
      || !Number.isFinite(snapshot.timeSec) || !Array.isArray(snapshot.items) || !snapshot.viewport) {
      if (kind === "encoded-frame") counts.malformedFrames += 1;
      else counts.malformedSamples += 1;
      return;
    }
    if (Math.abs(snapshot.timeSec - timeSec) > 1e-8) {
      if (kind === "encoded-frame") counts.staleFrames += 1;
      else counts.staleSamples += 1;
      return;
    }
    let measured;
    try {
      const viewport = snapshot.viewport;
      if (![viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite)
        || Math.abs(viewport.x) > 1e-8 || Math.abs(viewport.y) > 1e-8
        || Math.abs(viewport.width - width) > 1e-8 || Math.abs(viewport.height - height) > 1e-8) {
        throw new Error("snapshot viewport does not match rendered screen coordinates");
      }
      measured = ops.diagnoseLayout({
        timeSec, scope: snapshot.scope, viewport,
        items: snapshot.items,
        expectedIds: snapshot.coverage && snapshot.coverage.expectedIds,
        allowOverlaps: snapshot.allowOverlaps || [],
      });
    } catch {
      if (kind === "encoded-frame") counts.malformedFrames += 1;
      else counts.malformedSamples += 1;
      return;
    }
    if (measured.status === "not-checked") {
      if (kind === "encoded-frame") counts.notCheckedFrames += 1;
      else counts.notCheckedSamples += 1;
      return;
    }
    if (kind === "encoded-frame") counts.validFrames += 1;
    else counts.validSamples += 1;
    if (measured.status === "partial" && kind === "encoded-frame") counts.partialProducerFrames += 1;
    if (kind === "encoded-frame" && !Array.isArray(measured.coverage.expectedIds)) counts.framesWithoutExpectedIds += 1;
    const scope = measured.scope;
    const scopeCounts = kind === "encoded-frame" ? scopes : previewScopes;
    scopeCounts.set(scope, (scopeCounts.get(scope) || 0) + 1);
    const conflictRecords = kind === "encoded-frame" ? conflicts : previewConflicts;
    const outOfFrameRecords = kind === "encoded-frame" ? outOfFrame : previewOutOfFrame;
    for (const conflict of measured.conflicts) {
      const ids = [...conflict.ids].sort();
      const key = `${scope}\u0000${ids[0]}\u0000${ids[1]}`;
      const previous = conflictRecords.get(key);
      if (previous) {
        previous.occurrences += 1;
        const position = { kind, frameIndex, timeSec, intersection: conflict.intersection };
        const before = kind === "encoded-frame" ? frameIndex < previous.first.frameIndex : timeSec < previous.first.timeSec;
        const after = kind === "encoded-frame" ? frameIndex > previous.last.frameIndex : timeSec > previous.last.timeSec;
        if (before) previous.first = position;
        if (after) previous.last = position;
      } else {
        conflictRecords.set(key, {
          scope, ids, roles: conflict.roles, occurrences: 1,
          first: { kind, frameIndex, timeSec, intersection: conflict.intersection },
          last: { kind, frameIndex, timeSec, intersection: conflict.intersection },
        });
      }
    }
    for (const id of measured.outOfFrame) {
      const key = `${scope}\u0000${id}`;
      const prior = outOfFrameRecords.get(key);
      if (prior) {
        prior.occurrences += 1;
        const position = { kind, frameIndex, timeSec };
        const before = kind === "encoded-frame" ? frameIndex < prior.first.frameIndex : timeSec < prior.first.timeSec;
        const after = kind === "encoded-frame" ? frameIndex > prior.last.frameIndex : timeSec > prior.last.timeSec;
        if (before) prior.first = position;
        if (after) prior.last = position;
      } else outOfFrameRecords.set(key, { scope, id, occurrences: 1, first: { kind, frameIndex, timeSec }, last: { kind, frameIndex, timeSec } });
    }
  }

  function report() {
    const complete = encoded.validFrames === encoded.expectedFrames && encoded.notCheckedFrames === 0
      && encoded.partialProducerFrames === 0 && encoded.framesWithoutExpectedIds === 0;
    const hasInvalidEvidence = encoded.staleFrames > 0 || encoded.malformedFrames > 0;
    const status = encoded.validFrames === 0
      ? hasInvalidEvidence ? "invalid-evidence" : "not-checked"
      : complete ? "scoped" : "partial";
    return {
      status,
      scope: "Only producer-registered screen-space items; scoped evidence is never a whole-scene PASS.",
      coverage: {
        encodedFrames: { ...encoded },
        previews: { ...previews },
        completeForDeclaredScopes: complete,
        producerScopes: Object.fromEntries([...scopes.entries()].sort(([left], [right]) => left.localeCompare(right))),
        previewProducerScopes: Object.fromEntries([...previewScopes.entries()].sort(([left], [right]) => left.localeCompare(right))),
      },
      conflictPairCount: conflicts.size,
      conflictOccurrences: [...conflicts.values()].reduce((sum, item) => sum + item.occurrences, 0),
      conflicts: [...conflicts.values()].sort((left, right) => left.first.frameIndex - right.first.frameIndex || left.ids.join("/").localeCompare(right.ids.join("/"))),
      outOfFrame: [...outOfFrame.values()].sort((left, right) => left.first.frameIndex - right.first.frameIndex || left.id.localeCompare(right.id)),
      previewConflictPairCount: previewConflicts.size,
      previewConflictOccurrences: [...previewConflicts.values()].reduce((sum, item) => sum + item.occurrences, 0),
      previewConflicts: [...previewConflicts.values()].sort((left, right) => left.first.timeSec - right.first.timeSec || left.ids.join("/").localeCompare(right.ids.join("/"))),
      previewOutOfFrame: [...previewOutOfFrame.values()].sort((left, right) => left.first.timeSec - right.first.timeSec || left.id.localeCompare(right.id)),
      limits: "Conservative screen-space AABB checks over producer-registered rectangles only. They do not establish pixel occlusion, semantic linkage, unregistered scene coverage, contrast, reading comfort, or aesthetics.",
    };
  }
  return { add, report, previews };
}

function createRequiredLayoutTracker(requirements, frameCount, width, height, ops) {
  const byFrame = new Map();
  for (const requirement of requirements) {
    for (let frameIndex = requirement.startFrame; frameIndex < requirement.endFrame; frameIndex += 1) {
      byFrame.set(frameIndex, requirement);
    }
  }
  const rows = new Map(requirements.map((requirement) => [requirement.id, {
    id: requirement.id, scope: requirement.scope, expectedIds: requirement.expectedIds,
    intentionallyEmpty: requirement.intentionallyEmpty, reason: requirement.reason,
    expectedFrames: requirement.endFrame - requirement.startFrame,
    validFrames: 0, missingFrames: 0, staleFrames: 0, malformedFrames: 0, partialFrames: 0,
  }]));
  function add(snapshot, timeSec, frameIndex) {
    const requirement = byFrame.get(frameIndex);
    if (!requirement) return;
    const row = rows.get(requirement.id);
    if (snapshot == null) { row.missingFrames += 1; return; }
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
      || snapshot.schema !== "motion-layout-snapshot/v1" || !Number.isFinite(snapshot.timeSec)
      || !Array.isArray(snapshot.items) || !snapshot.viewport || snapshot.scope !== requirement.scope) {
      row.malformedFrames += 1;
      return;
    }
    if (Math.abs(snapshot.timeSec - timeSec) > 1e-8) { row.staleFrames += 1; return; }
    try {
      const viewport = snapshot.viewport;
      if (Math.abs(viewport.x) > 1e-8 || Math.abs(viewport.y) > 1e-8
        || Math.abs(viewport.width - width) > 1e-8 || Math.abs(viewport.height - height) > 1e-8) {
        throw new Error("snapshot viewport does not match the rendered screen");
      }
      const measured = ops.diagnoseLayout({
        timeSec, scope: requirement.scope, viewport, items: snapshot.items,
        expectedIds: requirement.expectedIds, allowOverlaps: snapshot.allowOverlaps || [],
      });
      if (requirement.intentionallyEmpty) {
        if (snapshot.items.length !== 0 || measured.coverage.missingIds.length !== 0) { row.partialFrames += 1; return; }
      } else if (measured.coverage.missingIds.length !== 0) {
        row.partialFrames += 1;
        return;
      }
      row.validFrames += 1;
    } catch {
      row.malformedFrames += 1;
    }
  }
  function report() {
    const entries = [...rows.values()].map((row) => ({
      ...row,
      complete: row.validFrames === row.expectedFrames && row.missingFrames === 0 && row.staleFrames === 0
        && row.malformedFrames === 0 && row.partialFrames === 0,
    }));
    const expectedFrames = entries.reduce((sum, row) => sum + row.expectedFrames, 0);
    const validFrames = entries.reduce((sum, row) => sum + row.validFrames, 0);
    const complete = validFrames === expectedFrames && entries.every((row) => row.complete);
    return {
      status: complete ? "complete" : "incomplete",
      gate: "Blueprint-declared layout evidence completeness only; this is not a collision-free, visibility, aesthetic, or whole-scene PASS.",
      expectedFrames, validFrames, complete,
      requirements: entries,
      limits: "One non-overlapping declared scope per encoded frame. Empty intervals count only when explicitly declared intentionallyEmpty with a reason and the producer returns a matching zero-item snapshot.",
    };
  }
  return { add, report };
}

async function captureTextVisibilityProbe(page, probe, scene) {
  return page.evaluate(async ({ probe, scene }) => {
    const evidence = window.MOTION_EVIDENCE;
    const hook = evidence && evidence.drawTextVisibilityVariant;
    const result = {
      id: probe.id, targetId: probe.targetId, text: probe.text, timeSec: probe.timeSec,
      expected: probe.expected, status: "not-checked", sourceGlyphStatus: "unknown", reason: null,
      method: "paired-final-frame vs target-omitted scene plus independently drawn unmasked glyph reference",
      limits: "Only the declared target at this frame is checked. The hook must reproduce scene geometry, font, transform and style; this does not prove general readability, semantics or aesthetics.",
    };
    if (probe.sceneBlendMode !== "source-over") {
      result.reason = `unsupported scene/layer blend mode: ${probe.sceneBlendMode}`;
      return result;
    }
    if (probe.blendMode && probe.blendMode !== "source-over") {
      result.reason = `unsupported blend mode: ${probe.blendMode}`;
      return result;
    }
    if (typeof hook !== "function") {
      result.reason = "MOTION_EVIDENCE.drawTextVisibilityVariant is unavailable";
      return result;
    }
    const stage = document.getElementById("stage");
    const frameCtx = stage.getContext("2d", { willReadFrequently: true });
    const originalFrames = window.__MOTION_TEXT_PROBE_FRAME_DATA;
    const finalImage = originalFrames && originalFrames.get(probe.frameIndex);
    if (!finalImage) {
      result.reason = "the actual encoded-frame pixel snapshot is unavailable";
      return result;
    }
    frameCtx.putImageData(finalImage, 0, 0);
    const drawVariant = async (variant, padding) => {
      const canvas = document.createElement("canvas");
      canvas.width = stage.width + padding * 2;
      canvas.height = stage.height + padding * 2;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (padding) context.translate(padding, padding);
      let response;
      try {
        response = await hook({
          probe, variant, timeSec: probe.timeSec, scene, canvas, context,
          MotionCore: window.MotionCore, MotionOps: window.MotionOps,
          renderers: window.MOTION_RENDERERS || {},
        });
      } catch (error) {
        return { error: String(error && error.message || error) };
      }
      return { response, image: context.getImageData(0, 0, canvas.width, canvas.height), width: canvas.width, height: canvas.height };
    };
    const background = await drawVariant("scene-without-target", 0);
    const reference = await drawVariant("unmasked-target", probe.referencePaddingPx);
    if (background.error || reference.error) {
      result.reason = background.error || reference.error;
      return result;
    }
    const metadata = [background.response, reference.response];
    if (metadata.some((item) => !item || item.status !== "rendered" || item.targetId !== probe.targetId
      || item.text !== probe.text || item.blendMode !== "source-over"
      || !["present", "absent", "font-fallback", "unsupported"].includes(item.sourceGlyphStatus)
      || typeof item.font !== "string" || !item.font.trim()
      || typeof item.styleSignature !== "string" || !item.styleSignature.trim()
      || typeof item.transformSignature !== "string" || !item.transformSignature.trim())
      || metadata[0].font !== metadata[1].font || metadata[0].styleSignature !== metadata[1].styleSignature
      || metadata[0].transformSignature !== metadata[1].transformSignature
      || metadata[0].sourceGlyphStatus !== metadata[1].sourceGlyphStatus) {
      result.reason = "paired hook metadata is missing or does not match across variants";
      return result;
    }
    result.sourceGlyphStatus = metadata[0].sourceGlyphStatus;
    if (result.sourceGlyphStatus !== "present") {
      result.reason = result.sourceGlyphStatus === "absent"
        ? "the declared source reports no glyph for the requested text"
        : result.sourceGlyphStatus === "font-fallback"
          ? "the requested glyph is drawn with a fallback font; the declared source font cannot be compared"
          : "the declared text renderer cannot verify the requested source glyph";
      return result;
    }
    const base = background.image.data;
    const referencePixels = reference.image.data;
    const padding = probe.referencePaddingPx;
    let referenceInkPixels = 0, referencePixelsInsideViewport = 0, contributedPixels = 0, missingPixels = 0, clippedPixels = 0;
    for (let y = 0; y < reference.height; y += 1) {
      for (let x = 0; x < reference.width; x += 1) {
        const refOffset = (y * reference.width + x) * 4;
        if (referencePixels[refOffset + 3] === 0) continue;
        referenceInkPixels += 1;
        const screenX = x - padding, screenY = y - padding;
        if (screenX < 0 || screenY < 0 || screenX >= stage.width || screenY >= stage.height) {
          clippedPixels += 1;
          continue;
        }
        referencePixelsInsideViewport += 1;
        const finalOffset = (screenY * stage.width + screenX) * 4;
        let contributed = false;
        for (let channel = 0; channel < 4; channel += 1) {
          if (finalImage.data[finalOffset + channel] !== base[finalOffset + channel]) { contributed = true; break; }
        }
        if (contributed) contributedPixels += 1;
        else missingPixels += 1;
      }
    }
    if (referenceInkPixels === 0) {
      result.sourceGlyphStatus = "unsupported";
      result.reason = "the independent unmasked reference produced no ink pixels for the declared source glyph";
      return result;
    }
    if (window.LAOHU_MOTION_PREPARE_FRAME) await window.LAOHU_MOTION_PREPARE_FRAME(scene, probe.timeSec);
    window.MotionCore.drawFrame(stage, scene, probe.timeSec, window.MOTION_RENDERERS || {}, true);
    if (window.LAOHU_MOTION_POSTPROCESS && scene.motionPostProcessing?.length) {
      window.LAOHU_MOTION_POSTPROCESS(stage, scene, probe.timeSec);
    }
    const repeated = frameCtx.getImageData(0, 0, stage.width, stage.height).data;
    let deterministic = true;
    for (let index = 0; index < repeated.length; index += 1) {
      if (repeated[index] !== finalImage.data[index]) { deterministic = false; break; }
    }
    frameCtx.putImageData(finalImage, 0, 0);
    const visible = contributedPixels > 0;
    const complete = visible && missingPixels === 0 && clippedPixels === 0;
    const observed = complete ? "complete" : visible ? "partial" : "hidden";
    result.status = deterministic ? "checked" : "not-checked";
    result.observed = observed;
    result.matchesExpected = deterministic && observed === probe.expected;
    result.deterministicRepeat = deterministic;
    result.pixels = { referenceInkPixels, referencePixelsInsideViewport, contributedPixels, missingPixels, clippedPixels };
    result.metadata = { font: metadata[0].font, styleSignature: metadata[0].styleSignature, transformSignature: metadata[0].transformSignature, blendMode: "source-over" };
    if (!deterministic) result.reason = "normal frame changed across paired redraw; deterministic comparison is not stable";
    return result;
  }, { probe, scene });
}

async function prepareTemplateEffects(effectId, scene) {
  const catalog = JSON.parse(await fs.readFile(templateCatalogPath, "utf8"));
  if (!Array.isArray(catalog.sources)) throw new Error("Motion production catalog has no minimal source pins for local effect verification");
  if (![1, 2].includes(catalog.schemaVersion)) throw new Error(`Unsupported template catalog schema ${catalog.schemaVersion}; render.mjs supports schema versions 1 and 2`);
  if (catalog.schemaVersion === 2 && !Array.isArray(catalog.effects)) throw new Error("Template catalog schema 2 requires an effects array");
  const effect = catalog.effectLibraries?.find((item) => item.id === effectId || (item.aliases || []).includes(effectId));
  if (!effect) throw new Error(`Unknown or unsupported --template-effects ${effectId}; available: ${(catalog.effectLibraries || []).map((item) => item.id).join(", ") || "none"}`);
  if (effect.renderer !== "classic-global-library" || !Array.isArray(effect.loadOrder) || !Array.isArray(effect.functions)) {
    throw new Error(`Effect library ${effectId} has no supported classic-global preload contract`);
  }
  const source = catalog.sources.find((item) => item.id === effect.sourceId);
  if (!source || !Array.isArray(source.files) || !effect.localRuntime) throw new Error(`Effect library ${effectId} has no local runtime closure or source ledger`);
  const runtimePath = path.resolve(skillDir, effect.localRuntime);
  const runtimeRoot = path.resolve(skillDir, "templates", "runtime");
  const runtimeRelative = path.relative(runtimeRoot, runtimePath);
  if (!runtimeRelative || runtimeRelative === ".." || runtimeRelative.startsWith(`..${path.sep}`) || path.isAbsolute(runtimeRelative)) {
    throw new Error(`Effect localRuntime must stay below templates/runtime: ${effect.localRuntime}`);
  }
  const manifestBytes = await fs.readFile(runtimePath);
  const manifestSha256 = crypto.createHash("sha256").update(manifestBytes).digest("hex");
  if (effect.localRuntimeManifestSha256 && manifestSha256 !== effect.localRuntimeManifestSha256) {
    throw new Error(`Effect local runtime manifest SHA-256 differs from catalog for ${effectId}`);
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.schemaVersion !== 1 || manifest.source?.id !== source.id || manifest.source?.commit !== source.commit) {
    throw new Error(`Effect local runtime closure identity mismatch for ${effectId}`);
  }
  const libraryClosure = manifest.libraries?.[effect.id];
  if (!Array.isArray(libraryClosure?.loadOrder)
      || JSON.stringify(libraryClosure.loadOrder.map((row) => row.sourcePath)) !== JSON.stringify(effect.loadOrder)) {
    throw new Error(`Effect local runtime load order does not match the catalogued source order for ${effectId}`);
  }
  const sourceFiles = new Map(source.files.map((file) => [file.path, file]));
  const localModules = new Map((manifest.modules || []).map((file) => [file.sourcePath, file]));
  const localFonts = new Map((manifest.fontAssets || []).map((file) => [file.sourcePath, file]));
  const verifyLocalAsset = async (row, pinned, label) => {
    if (!row?.localPath || row.sha256 !== pinned?.sha256 || (pinned?.gitBlob && row.gitBlob !== pinned.gitBlob)) {
      throw new Error(`${label} source identity is absent from the pinned source ledger`);
    }
    const absolutePath = path.resolve(runtimeRoot, row.localPath);
    const relative = path.relative(runtimeRoot, absolutePath);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`${label} local path escapes templates/runtime: ${row.localPath}`);
    }
    const bytes = await fs.readFile(absolutePath);
    const actualSha = crypto.createHash("sha256").update(bytes).digest("hex");
    const actualBlob = crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (actualSha !== row.localSha256 || actualSha !== row.sha256 || (row.bytes !== bytes.length)
        || (row.gitBlob && actualBlob !== row.gitBlob)) {
      throw new Error(`${label} local copy does not match the pinned source bytes`);
    }
    return { absolutePath, bytes, sha256: actualSha, gitBlob: actualBlob };
  };
  const files = [];
  for (const { sourcePath: filePath } of libraryClosure.loadOrder) {
    const pinned = sourceFiles.get(filePath);
    if (!pinned) throw new Error(`Effect closure file ${filePath} is absent from source ledger ${source.id}`);
    const local = localModules.get(filePath);
    if (!local || local.localPath !== libraryClosure.loadOrder.find((item) => item.sourcePath === filePath)?.localPath) {
      throw new Error(`Effect closure file ${filePath} has no matching local module mapping`);
    }
    const verified = await verifyLocalAsset(local, pinned, `Effect closure ${source.id}/${filePath}`);
    files.push({ path: filePath, localPath: local.localPath, absolutePath: verified.absolutePath, sha256: verified.sha256, gitBlob: verified.gitBlob, bytes: verified.bytes.length });
  }
  const requestedFonts = new Map();
  const addFontDependency = async (font, allowedPaths, label) => {
    if (requestedFonts.has(font.family)) throw new Error(`Multiple local effect entries declare font family ${font.family}; use one pinned source asset per family`);
    const pinned = sourceFiles.get(font.path);
    if (!pinned || !allowedPaths.includes(font.path)) throw new Error(`Font dependency ${font.family} at ${font.path} is absent from its pinned source ledger entry`);
    const localFont = localFonts.get(font.path);
    if (!localFont || !(localFont.families || []).includes(font.family)) throw new Error(`Font dependency ${font.family} has no exact local asset mapping`);
    const verified = await verifyLocalAsset(localFont, pinned, label);
    requestedFonts.set(font.family, {
      family: font.family,
      path: font.path,
      localPath: localFont.localPath,
      sha256: verified.sha256,
      gitBlob: verified.gitBlob,
      bytes: verified.bytes.length,
      weight: font.weight,
      style: font.style,
      base64: verified.bytes.toString("base64"),
    });
  };
  for (const font of effect.fontDependencies || []) {
    await addFontDependency(font, effect.sourceRef?.files || [], `Font dependency ${source.id}/${font.path}`);
  }
  const usedRendererTypes = new Set((scene?.objects || []).map((object) => object?.type).filter((type) => typeof type === "string"));
  for (const localEffect of catalog.effects || []) {
    if (!usedRendererTypes.has(localEffect.renderer) || !Array.isArray(localEffect.fontDependencies)) continue;
    if (localEffect.sourceRef?.sourceId !== source.id) throw new Error(`Font dependency source ${localEffect.sourceRef?.sourceId} does not match selected effect library source ${source.id}`);
    for (const font of localEffect.fontDependencies) {
      await addFontDependency(font, localEffect.sourceRef.files || [], `Font dependency ${source.id}/${font.path}`);
    }
  }
  return { effect, source, localRuntime: path.relative(skillDir, runtimePath).split(path.sep).join("/"), files, fontAssets: [...requestedFonts.values()] };
}

function supportsLocalDgEffects(effect) {
  if (effect?.id === "laohu-motion-dg") return true;
  if (effect?.id !== "laohu-motion-toolkit" || effect.sourceId !== "huashu-art-motion") return false;
  const loadOrder = new Set(effect.loadOrder || []);
  const functions = new Set((effect.functions || []).map((row) => row.id));
  return loadOrder.has("scripts/engine/lib/diagram.js")
    && loadOrder.has("scripts/engine/lib/motion.js")
    && localDgEffectSourceFunctions.every((id) => functions.has(id));
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && ["--help", "-h", "help"].includes(argv[0])) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const args = parseArgs(argv);
  const playwrightRuntime = loadMotionPackage("playwright", { expectedVersions: { playwright: PLAYWRIGHT_VERSION } });
  const { chromium } = playwrightRuntime.value;
  if (!args.output.toLowerCase().endsWith(".mp4")) throw new Error("--output must end in .mp4");
  await preflightOutput(args);
  if (!args.browser) {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome",
    ];
    args.browser = candidates.find((candidate) => {
      try { require("node:fs").accessSync(candidate, require("node:fs").constants.X_OK); return true; } catch { return false; }
    });
  }
  if (!args.browser || !path.isAbsolute(args.browser)) throw new Error("Set --browser or MOTION_BROWSER to an installed browser executable; downloads are not attempted");
  await requireExecutable(args.browser, "Browser");
  args.ffmpeg = await requireExecutable(args.ffmpeg, "FFmpeg");
  const core = require(corePath);
  const ops = require(opsPath);
  const motionRecipes = require(motionRecipesAdapterPath);
  const sceneBytes = await fs.readFile(args.scene);
  const scene = JSON.parse(sceneBytes.toString("utf8"));
  core.assertValidScene(scene);
  const motionOperationRecords = ops.validateMotionOperations(scene);
  const motionRecipeRecords = motionRecipes.validateScene(scene);
  const motionRecipeNeedsSourceIris = motionRecipeRecords.some((record) => record.recipeId === "canonical-beat-reveal");
  const motionRecipeFrameAssetBundle = await resolveMotionRecipeFrameAssets(motionRecipeRecords, scene, args.scene);
  const catalogBytes = await fs.readFile(templateCatalogPath);
  const providerCatalog = JSON.parse(catalogBytes.toString("utf8"));
  const providerCatalogEntries = [...new Set(motionOperationRecords.map((record) => record.operationId))].map((operationId) => {
    const entry = (providerCatalog.effects || []).find((item) => item.operationId === operationId);
    if (!entry || entry.availability !== "available" || entry.renderer !== "custom:laohu-motion-operation"
      || entry.adapter?.path !== "scripts/motion-ops.js" || !entry.contract) {
      throw new Error(`motion operation ${operationId} has no available, consumer-linked catalog provider`);
    }
    return { catalogId: entry.id, operationId, sha256: crypto.createHash("sha256").update(JSON.stringify(entry)).digest("hex") };
  });
  const motionProviderRecords = motionRecipeRecords.map((record) => {
    const expectedId = `laohu-motion-recipe-${record.recipeId}`;
    const entry = (providerCatalog.effects || []).find((item) => item.id === expectedId);
    if (!entry || !["available", "conditional"].includes(entry.availability)
      || entry.renderer !== record.renderer || entry.adapter?.path !== "templates/adapters/laohu-motion-recipes.js"
      || entry.sourceRef?.sourceId !== motionRecipes.SOURCE_ID || entry.sourceRef?.commit !== motionRecipes.SOURCE_COMMIT) {
      throw new Error(`Garden recipe ${record.recipeId} has no consumer-linked pinned catalog row ${expectedId}`);
    }
    if (entry.availability === "conditional" && !(entry.conditions || []).length) throw new Error(`Garden recipe ${record.recipeId} is conditional without a declared input condition`);
    return { catalogId: entry.id, recipeId: record.recipeId, instanceId: record.id, ownerId: record.ownerId, renderer: record.renderer,
      sha256: crypto.createHash("sha256").update(JSON.stringify(entry)).digest("hex") };
  });
  const inputFingerprints = {
    scene: { role: "scene-json", status: "present", path: args.scene, sha256: crypto.createHash("sha256").update(sceneBytes).digest("hex"), bytes: sceneBytes.length },
    drawModule: args.drawModule ? await fingerprintFile("draw-module", args.drawModule) : absentInputFingerprint("draw-module"),
    motionCore: await fingerprintFile("motion-core", corePath),
    motionOps: await fingerprintFile("motion-ops-provider", opsPath),
    motionRecipeAdapter: motionRecipeRecords.length ? await fingerprintFile("laohu-motion-recipes-adapter", motionRecipesAdapterPath) : absentInputFingerprint("laohu-motion-recipes-adapter"),
    sourceTransitionAdapter: motionRecipeNeedsSourceIris ? await fingerprintFile("laohu-motion-transitions-adapter", transitionsAdapterPath) : absentInputFingerprint("laohu-motion-transitions-adapter"),
    motionRecipeFrameAssets: {
      role: "explicit-motion-recipe-source-frame-inputs",
      status: motionRecipeFrameAssetBundle.evidence.length ? "present" : "not-provided",
      assets: motionRecipeFrameAssetBundle.evidence,
      sha256: crypto.createHash("sha256").update(JSON.stringify(motionRecipeFrameAssetBundle.evidence)).digest("hex"),
    },
    providerCatalog: {
      role: "motion-operation-catalog", status: "present", path: templateCatalogPath,
      sha256: crypto.createHash("sha256").update(catalogBytes).digest("hex"), bytes: catalogBytes.length,
      entries: [...providerCatalogEntries, ...motionProviderRecords],
    },
  };
  const localEffectRecords = ops.validateLocalEffects(scene);
  const transitionObjects = (scene.objects || []).filter((object) => object?.type === "custom:laohu-motion-transition");
  const sourceTransitionsRequired = transitionObjects.length > 0 || motionRecipeNeedsSourceIris;
  if (sourceTransitionsRequired) {
    if (localEffectRecords.length) throw new Error("A single Motion scene cannot preload both local DG effects and source transitions; place the source iris reveal in a separate transition scene");
  }
  if (transitionObjects.length) {
    for (const object of transitionObjects) {
      const data = object.data || {};
      const entry = (providerCatalog.effects || []).find((row) => row.id === data.groupId);
      if (!entry || entry.renderer !== "custom:laohu-motion-transition" || !entry.sourceFunctions?.includes(`TRANSITIONS.${data.method}`)) {
        throw new Error(`transition ${String(data.instanceId || object.id)} must resolve a canonical available catalog group and source method`);
      }
    }
    if (args.drawModule && path.resolve(args.drawModule) !== path.resolve(transitionsAdapterPath)) {
      throw new Error("custom:laohu-motion-transition is bound to templates/adapters/laohu-transitions.js; do not replace its source-function adapter");
    }
    args.drawModule = transitionsAdapterPath;
    inputFingerprints.drawModule = await fingerprintFile("draw-module", args.drawModule);
  }
  const requestedEffectLibrary = args.templateEffects || (localEffectRecords.length ? "laohu-motion-dg" : sourceTransitionsRequired ? "laohu-motion-transitions" : null);
  const localEffectLibrary = requestedEffectLibrary ? await prepareTemplateEffects(requestedEffectLibrary, scene) : null;
  if (localEffectRecords.length && !supportsLocalDgEffects(localEffectLibrary?.effect)) {
    throw new Error("custom:laohu-motion-effects requires the pinned laohu-motion-dg closure or laohu-motion-toolkit with its original DG/MO source functions");
  }
  if (sourceTransitionsRequired && localEffectLibrary?.effect.id !== "laohu-motion-transitions") {
    throw new Error("canonical beat reveal and custom:laohu-motion-transition require the pinned laohu-motion-transitions source closure");
  }
  const templateEffects = localEffectLibrary;
  const frameCount = Math.round(scene.duration * scene.fps);
  const requiredLayout = args.requireLayoutEvidence ? validateLayoutRequirements(scene, frameCount) : null;
  const requiredMotion = args.requireMotionEvidence
    ? validateMotionRequirements(scene, frameCount, motionOperationRecords) : null;
  if (args.requireMotionEvidence && motionOperationRecords.length === 0) {
    throw new Error("--require-motion-evidence needs at least one validated, locally callable motion operation consumed by an encoded-frame draw");
  }
  const textVisibilityProbes = args.checkTextVisibility ? validateTextVisibilityProbes(scene, frameCount) : [];
  if (args.checkTextVisibility && textVisibilityProbes.some((probe) => probe.blendMode && probe.blendMode !== "source-over")) {
    // Unsupported blends remain reportable not-checked probes rather than being
    // approximated as source-over comparisons.
  }
  if (args.drawModule) await fs.access(args.drawModule);
  const parsedSamples = args.samples == null ? [0, scene.duration / 2, Math.max(0, scene.duration - 1 / scene.fps)]
    : args.samples.split(",").map((value) => Number(value));
  if (parsedSamples.some((value) => !Number.isFinite(value) || value < 0 || value >= scene.duration)) throw new Error("--samples must be comma-separated seconds in [0, duration)");
  const sampleTimes = [...new Set(parsedSamples)].sort((a, b) => a - b);
  const layoutTracker = createLayoutTracker(frameCount);
  const requiredLayoutTracker = requiredLayout ? createRequiredLayoutTracker(requiredLayout, frameCount, scene.width, scene.height, ops) : null;
  const requiredMotionTracker = requiredMotion ? createRequiredMotionTracker(requiredMotion, motionOperationRecords, scene, frameCount) : null;
  layoutTracker.previews.expectedSamples = sampleTimes.length;
  await fs.mkdir(args.cacheDir, { recursive: true });
  await fs.mkdir(path.dirname(args.output), { recursive: true });
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
  const runDir = path.join(args.cacheDir, `motion-${runId}`);
  const frameDirectory = path.join(runDir, "frames");
  const sampleDirectory = path.join(runDir, "samples");
  const profileDirectory = path.join(runDir, "browser-profile");
  const runEnv = { ...process.env, TMPDIR: runDir, TMP: runDir, TEMP: runDir };
  await Promise.all([fs.mkdir(frameDirectory, { recursive: true }), fs.mkdir(sampleDirectory, { recursive: true }), fs.mkdir(profileDirectory, { recursive: true })]);

  let context;
  let readiness;
  let consumerEvidence = null;
  let sourceInvocationEvidence = null;
  let speechBindingConsumption = null;
  let speechConsumerTrace = null;
  let templateEffectEvidence = null;
  let templateEffectStage = null;
  let localEffectEvidence = null;
  let transitionEvidence = null;
  let motionRecipeEvidence = null;
  let textVisibilityEvidence = [];
  let resourceEvidence = null;
  const browserResourceCapturePromises = [];
  const samples = [];
  try {
    context = await chromium.launchPersistentContext(profileDirectory, {
      executablePath: args.browser,
      headless: true,
      viewport: { width: scene.width, height: scene.height },
      args: ["--disable-dev-shm-usage"],
      env: runEnv,
    });
    const page = await context.newPage();
    page.on("requestfinished", (request) => browserResourceCapturePromises.push(captureBrowserResource(request)));
    page.on("requestfailed", (request) => browserResourceCapturePromises.push(Promise.resolve({
      url: request.url(), resourceType: request.resourceType(), status: "request-failed", sha256: null,
      error: request.failure()?.errorText || "browser request failed",
    })));
    await page.setContent(`<canvas id="stage" width="${scene.width}" height="${scene.height}"></canvas>`);
    await page.addScriptTag({ path: corePath });
    await page.addScriptTag({ path: opsPath });
    if (motionRecipeRecords.length) await page.addScriptTag({ path: motionRecipesAdapterPath });
    if (templateEffects) {
      if ((templateEffects.effect.initializeGlobals || []).length) {
        await page.evaluate((globals) => {
          for (const name of globals) {
            if (name !== "SCENES") throw new Error(`Unsupported source global initializer ${String(name)}`);
            window.SCENES ||= {};
          }
          return globals;
        }, templateEffects.effect.initializeGlobals);
      }
      for (const file of templateEffects.files) await page.addScriptTag({ path: file.absolutePath });
      templateEffectStage = await page.evaluate(({ width, height }) => {
        if (!window.U || typeof window.U.setStage !== "function") throw new Error("Pinned template effect closure did not expose U.setStage");
        window.U.setStage(width, height);
        return { requested: { width, height }, actual: { width: window.STAGE.W, height: window.STAGE.H } };
      }, { width: scene.width, height: scene.height });
      if (templateEffects.fontAssets?.length) {
        const loadedFonts = await page.evaluate(async (assets) => {
          const loaded = [];
          for (const asset of assets) {
            const fontFace = new FontFace(asset.family, `url(data:font/woff;base64,${asset.base64})`, { weight: asset.weight, style: asset.style });
            await fontFace.load();
            document.fonts.add(fontFace);
            loaded.push({ family: asset.family, status: fontFace.status, check: document.fonts.check(`16px "${asset.family}"`) });
          }
          await document.fonts.ready;
          window.MOTION_SOURCE_FONT_FACES = assets.map((asset) => ({
            family: asset.family,
            url: `data:font/woff;base64,${asset.base64}`,
            desc: { weight: asset.weight, style: asset.style },
          }));
          return loaded;
        }, templateEffects.fontAssets);
        if (loadedFonts.some((font) => font.status !== "loaded" || !font.check)) throw new Error(`Pinned source font did not register: ${JSON.stringify(loadedFonts)}`);
        templateEffectStage.fontAssets = templateEffects.fontAssets.map(({ family, path: fontPath, localPath, sha256, gitBlob, bytes, weight, style }) => ({ family, path: fontPath, localPath, sha256, gitBlob, bytes, weight, style, status: "loaded" }));
      } else {
        templateEffectStage.fontAssets = [];
      }
      await page.evaluate((payload) => {
        const calls = Object.fromEntries(payload.effect.functions.map((item) => [item.id, 0]));
        window.MOTION_TEMPLATE_EFFECTS = {
          id: payload.effect.id,
          sourceId: payload.source.id,
          sourceCommit: payload.source.commit,
          localRuntime: payload.localRuntime,
          sourceFiles: payload.files.map(({ path, localPath, sha256, gitBlob, bytes }) => ({ path, localPath, sha256, gitBlob, bytes })),
          fontAssets: payload.fontAssets.map(({ family, path, localPath, sha256, gitBlob, bytes, weight, style }) => ({ family, path, localPath, sha256, gitBlob, bytes, weight, style, status: "loaded" })),
          calls,
          invocationInstrumentation: "Each original global function is wrapped with a pass-through counter; its body, receiver, arguments, and return value are unchanged.",
        };
        for (const item of payload.effect.functions) {
          const parts = item.id.split(".");
          const methodName = parts.pop();
          let namespace = window;
          for (const part of parts) namespace = namespace && namespace[part];
          if (!namespace || typeof namespace[methodName] !== "function") throw new Error(`Original source function ${item.id} was not loaded`);
          const original = namespace[methodName];
          namespace[methodName] = function(...args) {
            window.MOTION_TEMPLATE_EFFECTS.calls[item.id] += 1;
            return Reflect.apply(original, this, args);
          };
        }
      }, { effect: templateEffects.effect, source: templateEffects.source, localRuntime: templateEffects.localRuntime, files: templateEffects.files, fontAssets: templateEffects.fontAssets });
    }
    await page.evaluate(() => {
      const namespaceNames = ["U", "MO", "CAM", "TY", "CH", "MD", "UI", "CL", "DG", "TRANSITIONS"];
      const tracker = {
        schema: "motion-source-invocation-tracking/1",
        scope: "Own callable methods on the listed loaded source namespaces are pass-through wrapped after source closure setup and before the draw module; calls are counted by render phase. This does not inspect lexical/local functions, inherited methods, direct canvas operations, or source syntax outside those namespaces. A not-loaded or untracked method is not reported as never called.",
        namespaces: {},
        methods: {},
      };
      for (const namespaceName of namespaceNames) {
        const namespace = window[namespaceName];
        if (!namespace || (typeof namespace !== "object" && typeof namespace !== "function")) {
          tracker.namespaces[namespaceName] = { status: "not-loaded", methodCount: 0, trackedMethodCount: 0, untrackedMethods: [] };
          continue;
        }
        const descriptors = Object.getOwnPropertyDescriptors(namespace);
        const callableNames = Object.keys(descriptors).filter((name) => typeof descriptors[name]?.value === "function");
        const untrackedMethods = [];
        let trackedMethodCount = 0;
        for (const methodName of callableNames) {
          const id = `${namespaceName}.${methodName}`;
          const descriptor = descriptors[methodName];
          const row = tracker.methods[id] = { id, loaded: true, tracked: false, status: "loaded-untracked", calls: {} };
          const original = descriptor.value;
          const wrapped = function(...args) {
            const phase = window.MOTION_SOURCE_CALL_PHASE || "setup";
            row.calls[phase] = (row.calls[phase] || 0) + 1;
            return Reflect.apply(original, this, args);
          };
          try {
            Object.defineProperty(namespace, methodName, { ...descriptor, value: wrapped });
            row.tracked = namespace[methodName] === wrapped;
          } catch {}
          if (!row.tracked) {
            try { namespace[methodName] = wrapped; row.tracked = namespace[methodName] === wrapped; } catch {}
          }
          if (row.tracked) row.status = "tracked-not-invoked-within-run";
          if (row.tracked) trackedMethodCount += 1;
          else untrackedMethods.push(id);
        }
        tracker.namespaces[namespaceName] = {
          status: "loaded",
          methodCount: callableNames.length,
          trackedMethodCount,
          untrackedMethods,
        };
      }
      window.MOTION_SOURCE_INVOCATION_TRACKING = tracker;
      window.MOTION_SOURCE_CALL_PHASE = "setup";

      const ops = window.MotionOps;
      if (!ops || typeof ops.samplePhase !== "function" || typeof ops.sampleChannels !== "function") {
        throw new Error("MotionOps phase consumers cannot be instrumented for speech binding evidence");
      }
      const consumerTrace = { schema: "motion-speech-consumer-trace/1", calls: {} };
      const recordPhaseUse = (method, timeSec, phase, result, context) => {
        if (!context || !phase || !phase.speechAnchor || typeof phase.id !== "string") return;
        const key = `${phase.id}\u0000${context.objectId}\u0000${method}`;
        const row = consumerTrace.calls[key] ||= {
          phaseId: phase.id,
          objectId: context.objectId,
          rendererType: context.rendererType,
          method,
          calls: 0,
          firstComponentLocalSec: timeSec,
          lastComponentLocalSec: timeSec,
          firstFilmGlobalSec: context.timeSec,
          lastFilmGlobalSec: context.timeSec,
          phaseProgress: [],
          channelValues: [],
        };
        row.calls += 1;
        row.lastComponentLocalSec = timeSec;
        row.lastFilmGlobalSec = context.timeSec;
        const sampledPhase = result?.phase || result;
        if (Number.isFinite(sampledPhase?.progress)) {
          if (row.phaseProgress.length < 2) row.phaseProgress.push(sampledPhase.progress);
          else row.phaseProgress[1] = sampledPhase.progress;
        }
        if (result?.channels && row.channelValues.length < 1) {
          row.channelValues.push(Object.fromEntries(Object.entries(result.channels).map(([name, channel]) => [name, channel?.value])));
        } else if (result?.channels && row.channelValues.length === 1) {
          row.channelValues.push(Object.fromEntries(Object.entries(result.channels).map(([name, channel]) => [name, channel?.value])));
        } else if (result?.channels && row.channelValues.length > 1) {
          row.channelValues[1] = Object.fromEntries(Object.entries(result.channels).map(([name, channel]) => [name, channel?.value]));
        }
      };
      const originalSamplePhase = ops.samplePhase;
      const tracedSamplePhase = function(timeSec, phase) {
        const result = Reflect.apply(originalSamplePhase, ops, arguments);
        recordPhaseUse("MotionOps.samplePhase", timeSec, phase, result, window.MOTION_CURRENT_CUSTOM_DRAW);
        return result;
      };
      const originalSampleChannels = ops.sampleChannels;
      const tracedSampleChannels = function(timeSec, phase) {
        const result = Reflect.apply(originalSampleChannels, ops, arguments);
        recordPhaseUse("MotionOps.sampleChannels", timeSec, phase, result, window.MOTION_CURRENT_CUSTOM_DRAW);
        return result;
      };
      // MotionOps is intentionally frozen. Copy its public shape onto a frozen
      // facade and shadow only the two phase-sampling methods for this render.
      const tracedDescriptors = Object.getOwnPropertyDescriptors(ops);
      tracedDescriptors.samplePhase.value = tracedSamplePhase;
      tracedDescriptors.sampleChannels.value = tracedSampleChannels;
      const tracedOps = Object.create(Object.getPrototypeOf(ops));
      Object.defineProperties(tracedOps, tracedDescriptors);
      Object.freeze(tracedOps);
      window.MotionOps = tracedOps;
      window.MOTION_SPEECH_CONSUMER_TRACE = consumerTrace;
    });
    if (args.drawModule) await page.addScriptTag({ path: args.drawModule });
    if (motionRecipeRecords.length) {
      await page.evaluate(({ records, sourceFrames }) => {
        const registry = window.MOTION_RENDERERS || {};
        window.LaohuMotionRecipes.register(registry);
        window.MOTION_RENDERERS = registry;
        window.MOTION_RECIPE_RECORDS = records;
        window.MOTION_RECIPE_SOURCE_FRAMES = sourceFrames.browserAssets;
        window.MOTION_RECIPE_EVIDENCE = {
          sourceId: "garden-motion-showreel",
          sourceCommit: "2b9a89340b70f632d31c0f1c69fce94a7912423e",
          validatedInstances: records.map(({ ownerId, id, recipeId, renderer }) => ({ ownerId, id, recipeId, renderer })),
          sourceFrameAssets: sourceFrames.evidence,
          calls: {},
        };
      }, { records: motionRecipeRecords, sourceFrames: motionRecipeFrameAssetBundle });
    }
    if (motionOperationRecords.length) {
      await page.evaluate((records) => {
        const renderers = window.MOTION_RENDERERS || {};
        window.MotionOps.registerMotionOperations(renderers, records);
        window.MOTION_RENDERERS = renderers;
        window.MOTION_EVIDENCE ||= {};
        if (typeof window.MOTION_EVIDENCE.motionFrame === "function") {
          throw new Error("MOTION_EVIDENCE.motionFrame is reserved for the validated same-draw Motion operation receipt");
        }
        window.MOTION_EVIDENCE.motionFrame = (frameIndex, timeSec, scene, canvas, MotionOps) =>
          MotionOps.captureMotionFrame(frameIndex, timeSec, scene, canvas);
      }, motionOperationRecords);
    }
    if (localEffectRecords.length) {
      const adapterBytes = await fs.readFile(localEffectsAdapterPath);
      await page.addScriptTag({ path: localEffectsAdapterPath });
      await page.evaluate((scene) => { window.MOTION_SCENE = scene; }, scene);
      await page.evaluate((records) => {
        window.MOTION_RENDERERS ||= {};
        window.LaohuMotionEffects.register(window.MOTION_RENDERERS, window.MOTION_SCENE, records);
      }, localEffectRecords);
      templateEffectStage.adapter = {
        path: path.relative(skillDir, localEffectsAdapterPath).split(path.sep).join("/"),
        sha256: crypto.createHash("sha256").update(adapterBytes).digest("hex"),
        bytes: adapterBytes.length,
      };
    }
    if (sourceTransitionsRequired) {
      if (!args.drawModule || path.resolve(args.drawModule) !== path.resolve(transitionsAdapterPath)) {
        await page.addScriptTag({ path: transitionsAdapterPath });
      }
      await page.evaluate(() => {
        if (!window.LaohuMotionTransitions || typeof window.LaohuMotionTransitions.register !== "function") {
          throw new Error("Laohu transition adapter did not register its original source methods");
        }
        window.LaohuMotionTransitions.register(window.MOTION_RENDERERS || {});
      });
    }
    if (!localEffectRecords.length) await page.evaluate((value) => { window.MOTION_SCENE = value; }, scene);
    await page.evaluate(() => {
      const registry = window.MOTION_RENDERERS || {};
      for (const [rendererType, renderer] of Object.entries(registry)) {
        if (typeof renderer !== "function" || !rendererType.startsWith("custom:")) continue;
        registry[rendererType] = function(ctx, object, timeSec, scene, evaluatedState) {
          const previous = window.MOTION_CURRENT_CUSTOM_DRAW;
          window.MOTION_CURRENT_CUSTOM_DRAW = {
            objectId: object && object.id || "(unknown)",
            rendererType: object && object.type || rendererType,
            timeSec,
          };
          try { return Reflect.apply(renderer, this, arguments); }
          finally { window.MOTION_CURRENT_CUSTOM_DRAW = previous; }
        };
      }
      window.MOTION_SOURCE_CALL_PHASE = "readiness";
    });
    readiness = await page.evaluate(async () => {
      await document.fonts.ready;
      if (window.MOTION_READY != null) {
        const ready = typeof window.MOTION_READY === "function" ? window.MOTION_READY() : window.MOTION_READY;
        const value = await ready;
        if (value === false) throw new Error("MOTION_READY resolved false");
      }
      if (!window.MotionOps || window.MotionOps.core !== window.MotionCore) {
        throw new Error("MotionOps failed to load against the active MotionCore");
      }
      return { fonts: document.fonts.status, motion: window.MOTION_READY == null ? "not-declared" : "resolved", motionOps: "available" };
    });
    const errors = await page.evaluate(() => window.MotionCore.validateScene(window.MOTION_SCENE));
    if (errors.length) throw new Error(`Browser validation disagrees with Node validation: ${JSON.stringify(errors)}`);

    const batchSize = 8;
    for (let first = 0; first < frameCount; first += batchSize) {
      const times = Array.from({ length: Math.min(batchSize, frameCount - first) }, (_, offset) => (first + offset) / scene.fps);
      const renderedFrames = await page.evaluate(async ({ times, first, probeFrameIndices, motionEnabled }) => {
        const canvas = document.getElementById("stage");
        const probeFrames = new Set(probeFrameIndices);
        const frames = [];
        for (let offset = 0; offset < times.length; offset += 1) {
          const time = times[offset];
          const frameIndex = first + offset;
          if (window.LAOHU_MOTION_PREPARE_FRAME) await window.LAOHU_MOTION_PREPARE_FRAME(window.MOTION_SCENE, time);
          window.MOTION_SOURCE_CALL_PHASE = "encoded-frame";
          if (motionEnabled) window.MotionOps.beginMotionFrame(frameIndex, time, window.MOTION_SCENE, canvas);
          window.MotionCore.drawFrame(canvas, window.MOTION_SCENE, time, window.MOTION_RENDERERS || {}, true);
          if (window.LAOHU_MOTION_POSTPROCESS && window.MOTION_SCENE.motionPostProcessing?.length) {
            window.LAOHU_MOTION_POSTPROCESS(canvas, window.MOTION_SCENE, time);
          }
          const evidence = window.MOTION_EVIDENCE;
          let layoutSnapshot = null;
          if (evidence && typeof evidence.layoutFrame === "function") {
            try { layoutSnapshot = evidence.layoutFrame(time, window.MOTION_SCENE, canvas, window.MotionOps); }
            catch (error) { layoutSnapshot = { captureError: String(error && error.message || error) }; }
          } else if (evidence && evidence.layoutSnapshot != null) {
            layoutSnapshot = evidence.layoutSnapshot;
          }
          try { if (layoutSnapshot != null) layoutSnapshot = JSON.parse(JSON.stringify(layoutSnapshot)); }
          catch (error) { layoutSnapshot = { captureError: String(error && error.message || error) }; }
          let motionFrame = null;
          if (motionEnabled) {
            const hook = window.MOTION_EVIDENCE && window.MOTION_EVIDENCE.motionFrame;
            if (typeof hook === "function") motionFrame = hook(frameIndex, time, window.MOTION_SCENE, canvas, window.MotionOps);
            if (motionFrame != null) motionFrame = JSON.parse(JSON.stringify(motionFrame));
          }
          if (probeFrames.has(frameIndex)) {
            window.__MOTION_TEXT_PROBE_FRAME_DATA ||= new Map();
            window.__MOTION_TEXT_PROBE_FRAME_DATA.set(frameIndex, canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height));
          }
          frames.push({ image: canvas.toDataURL("image/png"), layoutSnapshot, motionFrame });
        }
        return frames;
      }, { times, first, probeFrameIndices: args.checkTextVisibility ? textVisibilityProbes.map((probe) => probe.frameIndex) : [], motionEnabled: motionOperationRecords.length > 0 });
      for (let offset = 0; offset < renderedFrames.length; offset += 1) {
        const index = first + offset;
        const filename = path.join(frameDirectory, `${String(index).padStart(8, "0")}.png`);
        const timeSec = index / scene.fps;
        layoutTracker.add(renderedFrames[offset].layoutSnapshot, timeSec, index, "encoded-frame", ops, scene.width, scene.height);
        if (requiredLayoutTracker) requiredLayoutTracker.add(renderedFrames[offset].layoutSnapshot, timeSec, index);
        const frameBytes = asDataBuffer(renderedFrames[offset].image);
        await fs.writeFile(filename, frameBytes);
        if (requiredMotionTracker) {
          const frameSha256 = crypto.createHash("sha256").update(frameBytes).digest("hex");
          requiredMotionTracker.add(renderedFrames[offset].motionFrame, index, frameSha256, filename);
        }
      }
    }

    for (let index = 0; index < sampleTimes.length; index += 1) {
      const time = sampleTimes[index];
      const preview = await page.evaluate(async ({ time }) => {
        const canvas = document.getElementById("stage");
        window.MOTION_SOURCE_CALL_PHASE = "preview-frame";
        if (window.LAOHU_MOTION_PREPARE_FRAME) await window.LAOHU_MOTION_PREPARE_FRAME(window.MOTION_SCENE, time);
        window.MotionCore.drawFrame(canvas, window.MOTION_SCENE, time, window.MOTION_RENDERERS || {}, true);
        if (window.LAOHU_MOTION_POSTPROCESS && window.MOTION_SCENE.motionPostProcessing?.length) {
          window.LAOHU_MOTION_POSTPROCESS(canvas, window.MOTION_SCENE, time);
        }
        const evidence = window.MOTION_EVIDENCE;
        let layoutSnapshot = null;
        if (evidence && typeof evidence.layoutFrame === "function") {
          try { layoutSnapshot = evidence.layoutFrame(time, window.MOTION_SCENE, canvas, window.MotionOps); }
          catch (error) { layoutSnapshot = { captureError: String(error && error.message || error) }; }
        } else if (evidence && evidence.layoutSnapshot != null) {
          layoutSnapshot = evidence.layoutSnapshot;
        }
        try { if (layoutSnapshot != null) layoutSnapshot = JSON.parse(JSON.stringify(layoutSnapshot)); }
        catch (error) { layoutSnapshot = { captureError: String(error && error.message || error) }; }
        return { image: canvas.toDataURL("image/png"), layoutSnapshot };
      }, { time });
      const filename = path.join(sampleDirectory, `sample-${String(index).padStart(3, "0")}.png`);
      layoutTracker.add(preview.layoutSnapshot, time, null, "preview", ops, scene.width, scene.height);
      await fs.writeFile(filename, asDataBuffer(preview.image));
      const frameIndex = Math.min(frameCount - 1, Math.round(time * scene.fps));
      const nearestFrameTime = frameIndex / scene.fps;
      samples.push({
        time,
        requestedTime: time,
        renderedTime: time,
        frameIndex,
        encodedFrameIndex: Math.abs(nearestFrameTime - time) < 1e-8 ? frameIndex : null,
        kind: Math.abs(nearestFrameTime - time) < 1e-8 ? "encoded-frame" : "separate-preview",
        file: filename,
        state: stateAt(scene, core, time),
      });
      delete samples[samples.length - 1].state.read;
    }
    if (args.checkTextVisibility) {
      textVisibilityEvidence = [];
      for (const probe of textVisibilityProbes) {
        textVisibilityEvidence.push(await captureTextVisibilityProbe(page, probe, scene));
      }
    }
    consumerEvidence = await page.evaluate(() => window.MOTION_EVIDENCE == null
      ? null
      : JSON.parse(JSON.stringify(window.MOTION_EVIDENCE)));
    sourceInvocationEvidence = await page.evaluate(() => JSON.parse(JSON.stringify(window.MOTION_SOURCE_INVOCATION_TRACKING || null)));
    speechConsumerTrace = await page.evaluate(() => JSON.parse(JSON.stringify(window.MOTION_SPEECH_CONSUMER_TRACE || null)));
    if (motionRecipeRecords.length) {
      motionRecipeEvidence = await page.evaluate(() => JSON.parse(JSON.stringify(window.MOTION_RECIPE_EVIDENCE || null)));
      const missing = motionRecipeRecords.filter((record) => !(motionRecipeEvidence?.calls?.[record.id] > 0));
      if (missing.length) throw new Error(`Validated Garden recipe instances had no actual encoded/preview draw calls: ${missing.map((row) => row.id).join(", ")}`);
      motionRecipeEvidence.catalogProviders = motionProviderRecords;
      motionRecipeEvidence.adapter = inputFingerprints.motionRecipeAdapter;
      motionRecipeEvidence.sourceFrameAssetFingerprint = inputFingerprints.motionRecipeFrameAssets;
      const hasSourceFrames = motionRecipeFrameAssetBundle.evidence.length > 0;
      const hasSvgStroke = motionRecipeRecords.some((record) => record.recipeId === "svg-stroke");
      const hasPostProcessing = (scene.motionPostProcessing || []).length > 0;
      motionRecipeEvidence.captureBoundary = [
        ...(hasSourceFrames ? ["explicit scene-relative PNG frame preparation"] : []),
        ...(hasSvgStroke ? ["async source-SVG preparation"] : []),
        "MotionCore.drawFrame",
        ...(hasPostProcessing ? ["selected WebGL2 pass on separate output canvas", "copy back to stage"] : ["2D stage capture"]),
        "dataURL capture",
      ].join(" → ");
      motionRecipeEvidence.clock = "scene-local seconds supplied by render.mjs; no recipe-local schedule or second timeline";
    }
    if (templateEffects) templateEffectEvidence = await page.evaluate(() => JSON.parse(JSON.stringify(window.MOTION_TEMPLATE_EFFECTS)));
    if (localEffectRecords.length) localEffectEvidence = await page.evaluate(() => JSON.parse(JSON.stringify(window.MOTION_LOCAL_EFFECT_EVIDENCE)));
    if (sourceTransitionsRequired) transitionEvidence = await page.evaluate(() => JSON.parse(JSON.stringify(window.MOTION_TRANSITION_EVIDENCE)));
    const observedResources = await Promise.all(browserResourceCapturePromises);
    resourceEvidence = {
      status: "partial-browser-request-observation",
      sha256: crypto.createHash("sha256").update(JSON.stringify(observedResources)).digest("hex"),
      resources: observedResources,
      limits: "Hashes cover browser request/response bodies only when Content-Length is reported and at most 8 MiB. System font resolution, inline/data/blob resources and resources not exposed as browser requests are outside this list; the scene and draw-module byte hashes are recorded separately.",
    };
  } finally {
    if (context) await context.close();
  }

  if (sourceInvocationEvidence) {
    const methodRows = Object.values(sourceInvocationEvidence.methods || {});
    for (const method of methodRows) {
      const calls = Object.values(method.calls || {}).reduce((sum, count) => sum + count, 0);
      method.invocationCount = calls;
      if (!method.tracked) method.status = "loaded-untracked";
      else if (calls > 0) method.status = "tracked-invoked";
      else method.status = "tracked-not-invoked-within-run";
    }
    sourceInvocationEvidence.summary = {
      loadedNamespaces: Object.values(sourceInvocationEvidence.namespaces || {}).filter((row) => row.status === "loaded").length,
      notLoadedNamespaces: Object.entries(sourceInvocationEvidence.namespaces || {}).filter(([, row]) => row.status === "not-loaded").map(([id]) => id),
      loadedMethods: methodRows.length,
      trackedMethods: methodRows.filter((row) => row.tracked).length,
      invokedMethods: methodRows.filter((row) => row.status === "tracked-invoked").length,
      loadedUntrackedMethods: methodRows.filter((row) => row.status === "loaded-untracked").map((row) => row.id),
      claimBoundary: "Observed calls only prove that an instrumented source API method was invoked in this run. They do not prove wholesale reuse of a mature source grammar, uninstrumented local-function use, canvas output quality, or that loaded/hash-matched code was consumed.",
    };
  }
  const bindingReceipt = scene.motionSpeechBinding && typeof scene.motionSpeechBinding === "object" ? scene.motionSpeechBinding : null;
  if (!bindingReceipt) {
    const hasCustomRenderer = (scene.objects || []).some((object) => typeof object?.type === "string" && object.type.startsWith("custom:"));
    speechBindingConsumption = {
      status: hasCustomRenderer ? "custom-renderers-unbound-to-speech-receipt" : "no-speech-binding-receipt",
      expectedPhases: [],
      observedConsumers: Object.values(speechConsumerTrace?.calls || {}),
      sharedAudioEvents: [],
      warnings: hasCustomRenderer
        ? ["Custom renderer objects have no speech-binding receipt. ASR timing, canvas actions, and audioEvents are not demonstrated as sharing one clock; event names or hard-coded seconds do not establish synchronization."]
        : [],
      evidenceBoundary: "Global source API invocation counts and direct time constants do not establish speech-phase consumption by a custom renderer.",
    };
  } else {
    const expectedPhases = (bindingReceipt.anchorMap || []).filter((entry) => entry && entry.phaseId && entry.objectId && !entry.eventId);
    const tracedCalls = Object.values(speechConsumerTrace?.calls || {});
    const phaseConsumers = expectedPhases.map((expected) => {
      const calls = tracedCalls.filter((call) => call.phaseId === expected.phaseId && call.objectId === expected.objectId);
      return {
        phaseId: expected.phaseId,
        objectId: expected.objectId,
        status: calls.length ? "tracked-motionops-phase-use-observed" : "no-tracked-motionops-phase-use-observed",
        calls,
      };
    });
    let sharedEvents = new Map();
    let sharedEventResolutionError = null;
    try { sharedEvents = ops.findSceneAudioEvents(scene); }
    catch (error) { sharedEventResolutionError = error.message; }
    const audioEvents = (bindingReceipt.anchorMap || []).filter((entry) => entry && entry.eventId).map((expected) => {
      const resolved = sharedEvents.get(expected.eventId);
      return {
        eventId: expected.eventId,
        expectedPhaseId: expected.phaseId,
        status: resolved ? (resolved.phaseId === expected.phaseId ? "resolved-through-shared-phase" : "resolved-but-phase-mismatch") : "not-resolved-by-MotionOps",
        ...(resolved ? { timeSec: resolved.timeSec, timeBasis: resolved.timeBasis, owner: resolved.owner, resolvedPhaseId: resolved.phaseId } : {}),
        ...(sharedEventResolutionError ? { resolutionError: sharedEventResolutionError } : {}),
        audioPlanOrPcmConsumption: "not-observed-by-render.mjs; use scripts/audio.mjs with an audio plan referring to this shared event ID to prove rendered sound timing",
      };
    });
    const missingPhaseConsumers = phaseConsumers.filter((row) => row.status !== "tracked-motionops-phase-use-observed");
    const unresolvedAudio = audioEvents.filter((row) => row.status !== "resolved-through-shared-phase");
    speechBindingConsumption = {
      status: expectedPhases.length && missingPhaseConsumers.length === 0 && audioEvents.length && unresolvedAudio.length === 0
        ? "tracked-phase-consumers-and-shared-events-observed"
        : expectedPhases.length && missingPhaseConsumers.length === 0 && audioEvents.length === 0
          ? "tracked-phase-consumers-observed-no-bound-audio-events"
          : "binding-metadata-only-or-partially-consumed",
      bindingSource: bindingReceipt.bindingSource || null,
      timeline: bindingReceipt.timeline || null,
      expectedPhases: phaseConsumers,
      observedConsumers: tracedCalls,
      sharedAudioEvents: audioEvents,
      warnings: [
        ...(missingPhaseConsumers.length ? ["Bound phase metadata exists, but no tracked MotionOps.samplePhase/sampleChannels read was observed for: " + missingPhaseConsumers.map((row) => row.phaseId + " on " + row.objectId).join(", ") + ". Direct seconds, TY.charsIn calls, or event names do not establish visual phase consumption."] : []),
        ...(unresolvedAudio.length ? ["Some bound event IDs did not resolve through MotionOps.findSceneAudioEvents; see sharedAudioEvents."] : []),
        ...(audioEvents.length ? ["This render receipt resolves shared event timing only; it does not prove an audio plan rendered that event or establish audible quality."] : []),
      ],
      evidenceBoundary: "Tracked MotionOps calls show a custom renderer sampled a bound phase at recorded scene/component times. They do not independently prove sampled values changed pixels. Shared event resolution does not prove audio plan/PCM consumption.",
    };
  }

  const requiredLayoutEvidence = requiredLayoutTracker ? requiredLayoutTracker.report() : null;
  if (requiredLayoutEvidence && !requiredLayoutEvidence.complete) {
    const gateReportPath = path.join(runDir, "required-layout-evidence.json");
    await fs.writeFile(gateReportPath, `${JSON.stringify({ requiredLayoutEvidence, textVisibilityEvidence, outputCommit: "blocked" }, null, 2)}\n`);
    throw new Error(`Required layout evidence is incomplete; output was not committed. Diagnostics: ${gateReportPath}`);
  }
  const motionEvidenceBeforeEncode = requiredMotionTracker ? requiredMotionTracker.report() : null;
  if (motionEvidenceBeforeEncode && !motionEvidenceBeforeEncode.complete) {
    const gateReportPath = path.join(runDir, "required-motion-evidence.json");
    await fs.writeFile(gateReportPath, `${JSON.stringify({ motionEvidence: motionEvidenceBeforeEncode, outputCommit: "blocked" }, null, 2)}\n`);
    throw new Error(`Required motion evidence is incomplete; output was not committed. Diagnostics: ${gateReportPath}`);
  }

  const recheckFingerprint = async (fingerprint) => {
    if (fingerprint.status === "not-provided") return;
    const current = await sha256File(fingerprint.path);
    if (current !== fingerprint.sha256) throw new Error(`Render input ${fingerprint.role} changed during the run; output was not committed`);
  };
  for (const fingerprint of [inputFingerprints.drawModule, inputFingerprints.motionCore, inputFingerprints.motionOps, inputFingerprints.motionRecipeAdapter, inputFingerprints.providerCatalog]) {
    await recheckFingerprint(fingerprint);
  }
  if (motionRecipeFrameAssetBundle.evidence.length) {
    const currentFrames = await resolveMotionRecipeFrameAssets(motionRecipeRecords, scene, args.scene);
    if (currentFrames.evidence.length !== motionRecipeFrameAssetBundle.evidence.length
        || crypto.createHash("sha256").update(JSON.stringify(currentFrames.evidence)).digest("hex") !== inputFingerprints.motionRecipeFrameAssets.sha256) {
      throw new Error("Motion recipe source-frame PNG changed during the run; output was not committed");
    }
  }
  if (await sha256File(args.scene) !== inputFingerprints.scene.sha256) throw new Error("Scene JSON changed during the run; output was not committed");

  const outputTemp = siblingTempPath(args.output);
  run(args.ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-framerate", String(scene.fps),
    "-start_number", "0", "-i", path.join(frameDirectory, "%08d.png"), "-frames:v", String(frameCount),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputTemp,
  ], "FFmpeg encode", runEnv);
  const outputSha256 = await sha256File(outputTemp);
  const motionEvidence = motionEvidenceBeforeEncode ? {
    ...motionEvidenceBeforeEncode,
    outputSha256,
    output: args.output,
    frames: motionEvidenceBeforeEncode.frames.map((frame) => ({ ...frame, outputSha256 })),
  } : motionOperationRecords.length ? {
    schema: "motion-evidence-report/1", status: "not-required", complete: false,
    reason: "Motion operation evidence was not required for this render; no plan-declared coverage claim is made.",
    operationProviders: motionOperationRecords.map(({ instanceId, entityId, operationId, targetId, phaseId }) => ({ instanceId, entityId, operationId, targetId, phaseId })),
  } : null;
  await commitOutput(outputTemp, args.output, args.overwrite);
  const committedOutputSha256 = await sha256File(args.output);
  if (committedOutputSha256 !== outputSha256) throw new Error("Committed MP4 hash differs from the encoded artifact hash");
  const eventStates = (scene.events || []).map((event) => {
    const end = event.start + event.duration;
    const middle = event.duration === 0 ? event.start : event.start + event.duration / 2;
    const firstCompleteIndex = Math.ceil(end * scene.fps - 1e-9);
    const lastFrameIndex = frameCount - 1;
    const lastEncodedTime = lastFrameIndex / scene.fps;
    const property = event.property || "value";
    const valueAt = (time) => stateAt(scene, core, time).read(event.target, property);
    const eventTerminalValue = event.to;
    const firstCompleteTime = firstCompleteIndex / scene.fps;
    const firstCompleteActualValue = firstCompleteIndex < frameCount ? valueAt(firstCompleteTime) : undefined;
    const matchesEventTerminal = firstCompleteIndex < frameCount && valuesMatch(firstCompleteActualValue, eventTerminalValue);
    const targetKey = `${event.target.kind}:${event.target.id}:${property}`;
    const laterControllers = (scene.events || []).flatMap((candidate, index) => {
      if (candidate === event || !candidate.target) return [];
      const candidateProperty = candidate.property || (candidate.target.kind === "variable" ? "value" : null);
      const candidateKey = `${candidate.target.kind}:${candidate.target.id}:${candidateProperty}`;
      const candidateStart = candidate.start;
      const candidateEnd = candidateStart + candidate.duration;
      if (candidateKey !== targetKey || candidateStart < end - 1e-9 || firstCompleteIndex >= frameCount || candidateStart > firstCompleteTime + 1e-9) return [];
      return [{
        id: candidate.id || `events[${index}]`,
        start: candidateStart,
        end: candidateEnd,
        hasTakenOverByFirstCompleteFrame: true,
        stillAnimatingAtFirstCompleteFrame: firstCompleteTime < candidateEnd - 1e-9,
      }];
    });
    const firstCompleteFrame = firstCompleteIndex < frameCount ? {
      index: firstCompleteIndex,
      time: firstCompleteTime,
      actualTargetValue: firstCompleteActualValue,
      eventTerminalValue,
      matchesEventTerminalValue: matchesEventTerminal,
    } : null;
    return {
      id: event.id,
      target: event.target,
      property,
      start: event.start,
      end,
      idealStart: { time: event.start, value: valueAt(event.start) },
      idealMiddle: { time: middle, value: valueAt(middle) },
      idealTerminal: { time: end, value: eventTerminalValue },
      firstCompleteEncodedFrame: firstCompleteFrame,
      subsequentControllersByFirstCompleteFrame: laterControllers,
      endpointPresentInEncodedMedia: matchesEventTerminal,
      lastMotionFrame: event.duration === 0 ? null : (() => {
        const index = Math.min(lastFrameIndex, Math.ceil(end * scene.fps - 1e-9) - 1);
        return index >= 0 && index / scene.fps >= event.start ? { index, time: index / scene.fps } : null;
      })(),
      lastEncodedFrame: { index: lastFrameIndex, time: lastEncodedTime, value: valueAt(lastEncodedTime) },
      settledInEncodedMedia: matchesEventTerminal,
    };
  });
  const manifest = {
    kind: "technical-render-evidence",
    note: "Machine output confirms frame generation and recorded property states only; it does not certify explanation completeness, taste, pacing quality, or audience response.",
    scene: args.scene,
    output: args.output,
    runtime: {
      playwright: {
        packages: playwrightRuntime.packages,
        expectedVersion: PLAYWRIGHT_VERSION,
        resolutionSource: playwrightRuntime.resolutionSource,
        nodeModulesPath: playwrightRuntime.nodeModulesPath,
      },
    },
    outputSha256,
    frameDirectory,
    frameCount,
    inputFingerprints,
    resourceEvidence,
    render: { width: scene.width, height: scene.height, fps: scene.fps, duration: scene.duration },
    readiness,
    consumerEvidence,
    sourceInvocationEvidence,
    speechBindingConsumption,
    motionEvidence,
    motionRecipes: motionRecipeEvidence,
    motionOperations: motionOperationRecords.map(({ ownerId, instanceId, entityId, operationId, targetId, phaseId, startSec, endSec, fromLineWidthPx, toLineWidthPx }) => ({
      ownerId, instanceId, entityId, operationId, targetId, phaseId, startSec, endSec, fromLineWidthPx, toLineWidthPx,
    })),
    templateEffects: templateEffectEvidence,
    transitions: transitionEvidence,
    localEffects: localEffectRecords.length ? { validatedInstances: localEffectRecords, runtimeEvidence: localEffectEvidence, adapter: templateEffectStage?.adapter || null } : null,
    templateEffectStage,
    layoutDiagnostics: layoutTracker.report(),
    requiredLayoutEvidence,
    textVisibility: args.checkTextVisibility
      ? { status: textVisibilityEvidence.every((probe) => probe.status === "checked") && textVisibilityEvidence.length
        ? "scoped" : textVisibilityEvidence.some((probe) => probe.status === "checked") ? "partial" : "not-checked",
      probes: textVisibilityEvidence, limits: "Only declared critical text probes are compared. Checked pixels do not certify general readability, language comprehension, contrast suitability, aesthetic quality, or all scene layers." }
      : { status: "not-checked", reason: "--check-text-visibility was not requested", probes: [] },
    samples,
    eventStates,
  };
  const manifestPath = path.join(runDir, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`OUTPUT ${args.output}\nMANIFEST ${manifestPath}\nFRAME_DIRECTORY ${frameDirectory}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n${usage()}\n`);
  process.exitCode = 1;
});
