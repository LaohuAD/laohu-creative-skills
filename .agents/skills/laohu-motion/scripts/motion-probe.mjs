#!/usr/bin/env node
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const MotionCore = require("./motion-core.js");
const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const values = new Set(["--scene", "--manifest", "--output"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!values.has(key)) throw new Error(`Unknown argument ${key}`);
    if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw new Error(`Missing value for ${key}`);
    const field = key.slice(2);
    result[field] = argv[++index];
    if (!path.isAbsolute(result[field])) throw new Error(`${key} must be an absolute path`);
  }
  for (const field of ["scene", "manifest"]) if (!result[field]) throw new Error(`Required argument --${field}`);
  return result;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function near(left, right, epsilon = 1e-9) {
  return Number.isFinite(left) && Math.abs(left - right) <= epsilon;
}

function stableId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function requiredFrames(scene) {
  const rows = [];
  for (const object of scene.objects || []) {
    const evidence = object?.data?.motionEvidence;
    if (evidence == null) continue;
    if (typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("objects[].data.motionEvidence must be an object");
    if (evidence.motionRequirements == null) continue;
    if (!Array.isArray(evidence.motionRequirements)) throw new Error("motionRequirements must be an array");
    rows.push(...evidence.motionRequirements);
  }
  if (!rows.length) throw new Error("motion-probe requires non-empty motionRequirements; zero coverage cannot pass");
  const ids = new Set();
  const byFrame = new Map();
  const requirements = rows.map((row, index) => {
    const label = `motionRequirements[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${label} must be an object`);
    const allowedFields = new Set(["id", "scope", "startSec", "endSec", "expected"]);
    if (Object.keys(row).some((key) => !allowedFields.has(key))) throw new Error(`${label} contains unsupported motion-evidence fields`);
    if (!stableId(row.id) || ids.has(row.id)) throw new Error(`${label}.id must be non-empty and unique`);
    ids.add(row.id);
    if (!stableId(row.scope)) throw new Error(`${label}.scope must be non-empty`);
    const { startSec, endSec } = row;
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec || endSec > scene.duration + 1e-8) {
      throw new Error(`${label} must use a half-open [startSec,endSec) interval inside the scene`);
    }
    if (!Array.isArray(row.expected) || row.expected.length === 0) throw new Error(`${label}.expected must be non-empty; zero coverage cannot pass`);
    const startFrame = Math.ceil(startSec * scene.fps - 1e-9);
    const endFrame = Math.ceil(endSec * scene.fps - 1e-9);
    const frameCount = Math.round(scene.duration * scene.fps);
    if (startFrame < 0 || endFrame > frameCount || endFrame <= startFrame) throw new Error(`${label} must cover at least one encoded frame in its half-open window`);
    const instances = new Set();
    const expected = row.expected.map((entry, expectedIndex) => {
      const expectedLabel = `${label}.expected[${expectedIndex}]`;
      const fields = ["entityId", "instanceId", "operationId", "targetId", "phaseId"];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)
        || fields.some((field) => !stableId(entry[field]))
        || Object.keys(entry).some((key) => !fields.includes(key))) throw new Error(`${expectedLabel} must contain exactly entityId, instanceId, operationId, targetId and phaseId`);
      if (instances.has(entry.instanceId)) throw new Error(`${label}.expected contains duplicate instanceId ${entry.instanceId}`);
      instances.add(entry.instanceId);
      return Object.fromEntries(fields.map((field) => [field, entry[field]]));
    }).sort((a, b) => a.instanceId.localeCompare(b.instanceId));
    const normalized = { id: row.id, scope: row.scope, startSec, endSec, startFrame, endFrame, expected };
    for (let frameIndex = startFrame; frameIndex < endFrame; frameIndex += 1) {
      const active = byFrame.get(frameIndex) || [];
      active.push(normalized);
      byFrame.set(frameIndex, active);
    }
    return normalized;
  });
  for (const [frameIndex, active] of byFrame) {
    const owners = new Set();
    for (const row of active) for (const item of row.expected) {
      if (owners.has(item.instanceId)) throw new Error(`requirements overlap on ${item.instanceId} at encoded frame ${frameIndex}`);
      owners.add(item.instanceId);
    }
  }
  return { requirements, byFrame };
}

async function probe(args) {
  const scenePath = path.resolve(args.scene);
  const manifestPath = path.resolve(args.manifest);
  const sceneBytes = await fs.readFile(scenePath);
  const scene = JSON.parse(sceneBytes.toString("utf8"));
  MotionCore.assertValidScene(scene);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (manifest.kind !== "technical-render-evidence") throw new Error("manifest.kind must be technical-render-evidence");
  if (manifest.scene && path.resolve(manifest.scene) !== scenePath) throw new Error("manifest scene path does not match --scene");
  const evidence = manifest.motionEvidence;
  if (!evidence || evidence.schema !== "motion-evidence-report/1" || evidence.complete !== true || evidence.status !== "complete") {
    throw new Error("manifest must contain complete required motion evidence; render with --require-motion-evidence");
  }
  const { requirements, byFrame } = requiredFrames(scene);
  const fingerprints = manifest.inputFingerprints;
  if (!fingerprints || typeof fingerprints !== "object") throw new Error("manifest is missing required inputFingerprints");
  const verifyFingerprint = async (entry, role, canonicalPath = null) => {
    if (!entry || entry.role !== role || !/^[a-f0-9]{64}$/.test(entry.sha256 || "")) throw new Error(`manifest is missing a valid ${role} input fingerprint`);
    if (entry.status === "not-provided") {
      const sentinel = sha256(Buffer.from(`motion-render-absent-input/1:${role}`));
      if (entry.path != null || entry.sha256 !== sentinel) throw new Error(`${role} absence fingerprint is invalid`);
      return { role, status: "not-provided", sha256: entry.sha256 };
    }
    if (entry.status !== "present" || typeof entry.path !== "string" || !path.isAbsolute(entry.path)) throw new Error(`${role} fingerprint path/status is invalid`);
    if (canonicalPath && path.resolve(entry.path) !== path.resolve(canonicalPath)) throw new Error(`${role} fingerprint points outside the expected local consumer`);
    const bytes = await fs.readFile(entry.path);
    const actual = sha256(bytes);
    if (actual !== entry.sha256 || bytes.length !== entry.bytes) throw new Error(`${role} input changed since render; stale evidence rejected`);
    return { role, status: "present", sha256: actual };
  };
  const sceneFingerprint = await verifyFingerprint(fingerprints.scene, "scene-json", scenePath);
  if (sceneFingerprint.sha256 !== sha256(sceneBytes)) throw new Error("scene input bytes do not match the rendered fingerprint");
  await verifyFingerprint(fingerprints.drawModule, "draw-module");
  await verifyFingerprint(fingerprints.motionCore, "motion-core", path.join(skillDir, "scripts", "motion-core.js"));
  await verifyFingerprint(fingerprints.motionOps, "motion-ops-provider", path.join(skillDir, "scripts", "motion-ops.js"));
  const catalogPath = path.join(skillDir, "templates", "catalog.json");
  const catalogFingerprint = await verifyFingerprint(fingerprints.providerCatalog, "motion-operation-catalog", catalogPath);
  const catalogBytes = await fs.readFile(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  const operationIds = [...new Set((manifest.motionOperations || []).map((row) => row.operationId))].sort();
  const entryRows = operationIds.map((operationId) => {
    const entry = (catalog.effects || []).find((row) => row.operationId === operationId);
    if (!entry || entry.availability !== "available" || entry.renderer !== "custom:laohu-motion-operation") throw new Error(`catalog provider ${operationId} is unavailable or stale`);
    return { catalogId: entry.id, operationId, sha256: sha256(Buffer.from(JSON.stringify(entry))) };
  });
  if (JSON.stringify(fingerprints.providerCatalog.entries || []) !== JSON.stringify(entryRows)) throw new Error("catalog provider entry hashes do not match the actual operation providers");
  const providerIds = [...new Set((evidence.operationProviders || []).map((row) => row.operationId))].sort();
  if (JSON.stringify(providerIds) !== JSON.stringify(operationIds)) throw new Error("motion receipt provider IDs do not match catalog-backed render operations");
  if (catalogFingerprint.sha256 !== sha256(catalogBytes)) throw new Error("provider catalog bytes changed during probe");

  const resources = manifest.resourceEvidence;
  if (!resources || resources.status !== "partial-browser-request-observation" || !Array.isArray(resources.resources)
    || resources.sha256 !== sha256(Buffer.from(JSON.stringify(resources.resources)))) throw new Error("manifest browser resource observation is missing or stale");
  for (const resource of resources.resources) {
    if (resource.hashStatus === "hashed") {
      if (!/^[a-f0-9]{64}$/.test(resource.sha256 || "") || resource.bytes !== resource.contentLength) throw new Error("observed browser asset/font body hash is malformed");
      if (typeof resource.url === "string" && resource.url.startsWith("file://")) {
        const localPath = fileURLToPath(resource.url);
        if (sha256(await fs.readFile(localPath)) !== resource.sha256) throw new Error(`local browser resource changed since render: ${resource.url}`);
      }
    } else if (resource.sha256 != null) throw new Error("unhashed browser resource must not claim a SHA-256");
  }
  const frameCount = Math.round(scene.duration * scene.fps);
  if (evidence.expectedFrameCount !== frameCount || evidence.renderedFrameCount !== frameCount) throw new Error("motion evidence frame counts do not match the encoded scene clock");
  if (!Array.isArray(evidence.operationProviders) || !evidence.operationProviders.length) throw new Error("motion evidence has zero operation providers");
  const providers = new Map(evidence.operationProviders.map((row) => [row.instanceId, row]));
  if (providers.size !== evidence.operationProviders.length) throw new Error("motion evidence contains duplicate provider instance samples");
  for (const requirement of requirements) for (const expected of requirement.expected) {
    const provider = providers.get(expected.instanceId);
    if (!provider || ["entityId", "instanceId", "operationId", "targetId", "phaseId"].some((field) => provider[field] !== expected[field])) {
      throw new Error(`required instance ${expected.instanceId} is not backed by the declared provider`);
    }
    const operation = (manifest.motionOperations || []).find((row) => row.instanceId === expected.instanceId);
    if (!operation || operation.startSec > requirement.startSec + 1e-8 || operation.endSec < requirement.endSec - 1e-8) {
      throw new Error(`required instance ${expected.instanceId} phase does not cover the full half-open window`);
    }
  }
  if (!Array.isArray(evidence.requirements) || evidence.requirements.length !== requirements.length) throw new Error("manifest requirement rows do not match scene motionRequirements");
  for (const requirement of requirements) {
    const result = evidence.requirements.find((row) => row.id === requirement.id);
    const expectedFrames = requirement.endFrame - requirement.startFrame;
    if (!result || result.scope !== requirement.scope || result.expectedFrames !== expectedFrames || result.validFrames !== expectedFrames
      || result.complete !== true || result.missingFrames !== 0 || result.unsupportedFrames !== 0 || result.staleFrames !== 0 || result.malformedFrames !== 0) {
      throw new Error(`requirement ${requirement.id} is incomplete, stale, missing, unsupported or malformed`);
    }
  }
  if (!Array.isArray(evidence.frames)) throw new Error("motion evidence frames must be an array");
  const expectedFrameIndices = [...byFrame.keys()].sort((a, b) => a - b);
  const frameMap = new Map();
  for (const frame of evidence.frames) {
    if (!frame || !Number.isInteger(frame.frameIndex)) throw new Error("motion evidence contains an invalid frameIndex");
    if (frameMap.has(frame.frameIndex)) throw new Error(`duplicate encoded-frame sample ${frame.frameIndex}`);
    frameMap.set(frame.frameIndex, frame);
  }
  if (expectedFrameIndices.length === 0 || frameMap.size !== expectedFrameIndices.length
    || expectedFrameIndices.some((frameIndex) => !frameMap.has(frameIndex))) throw new Error("motion evidence has zero, missing or extra required frame samples");

  let checkedSamples = 0;
  for (const frameIndex of expectedFrameIndices) {
    const trace = frameMap.get(frameIndex);
    const active = byFrame.get(frameIndex) || [];
    const expected = active.flatMap((row) => row.expected).sort((a, b) => a.instanceId.localeCompare(b.instanceId));
    const requirementIds = active.map((row) => row.id).sort();
    const timeSec = frameIndex / scene.fps;
    if (timeSec < Math.max(...active.map((row) => row.startSec)) || timeSec >= Math.min(...active.map((row) => row.endSec))) {
      throw new Error(`frame ${frameIndex} is outside its half-open requirement window`);
    }
    if (trace.status !== "observed" || trace.schema !== "motion-frame-trace/1"
      || !near(trace.timeSec, timeSec) || !near(trace.expectedFrameTime, timeSec) || trace.fps !== scene.fps
      || trace.viewport?.x !== 0 || trace.viewport?.y !== 0 || trace.viewport?.width !== scene.width || trace.viewport?.height !== scene.height
      || trace.clock?.timeBasis !== "scene-local" || trace.clock?.durationSec !== scene.duration || trace.clock?.frameCount !== frameCount
      || !Array.isArray(trace.requirementIds) || JSON.stringify([...trace.requirementIds].sort()) !== JSON.stringify(requirementIds)
      || !Array.isArray(trace.expected) || JSON.stringify([...trace.expected].sort((a, b) => a.instanceId.localeCompare(b.instanceId))) !== JSON.stringify(expected)) {
      throw new Error(`frame ${frameIndex} has a stale viewport, clock, frame index or expected sample list`);
    }
    if (!Array.isArray(trace.observed) || trace.observed.length === 0) throw new Error(`frame ${frameIndex} has no observed operation samples`);
    const observedIds = trace.observed.map((row) => row?.instanceId);
    if (observedIds.some((id) => !stableId(id)) || new Set(observedIds).size !== observedIds.length) throw new Error(`frame ${frameIndex} contains duplicate or invalid operation samples`);
    const observed = new Map(trace.observed.map((row) => [row.instanceId, row]));
    for (const row of trace.observed) {
      if (row.status === "drawn" && (!Array.isArray(row.screenCorners) || row.screenCorners.length !== 4
        || row.screenCorners.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))
        || !Number.isFinite(row.lineWidthPx) || row.lineWidthPx <= 0
        || !row.screenBounds || ![row.screenBounds.x, row.screenBounds.y, row.screenBounds.width, row.screenBounds.height].every(Number.isFinite)
        || row.screenBounds.width <= 0 || row.screenBounds.height <= 0)) {
        throw new Error(`frame ${frameIndex} drawn sample ${row.instanceId} lacks the consumed projected geometry/line width`);
      }
    }
    const missingIds = expected.filter((row) => {
      const actual = observed.get(row.instanceId);
      return !actual || actual.status !== "drawn" || ["entityId", "operationId", "targetId", "phaseId"].some((field) => actual[field] !== row[field]);
    }).map((row) => row.instanceId).sort();
    const unsupportedIds = trace.observed.filter((row) => row.status === "unsupported").map((row) => row.instanceId).sort();
    if (missingIds.length || unsupportedIds.length) throw new Error(`frame ${frameIndex} has missing/unsupported samples: ${JSON.stringify({ missingIds, unsupportedIds })}`);
    if (JSON.stringify([...(trace.missingIds || [])].sort()) !== JSON.stringify(missingIds)
      || JSON.stringify([...(trace.unsupportedIds || [])].sort()) !== JSON.stringify(unsupportedIds)) throw new Error(`frame ${frameIndex} missing/unsupported declarations disagree with observed samples`);
    if (!/^[a-f0-9]{64}$/.test(trace.frameSha256 || "") || !trace.frameFile || !path.isAbsolute(trace.frameFile)) throw new Error(`frame ${frameIndex} has no verifiable PNG hash/file`);
    const frameBytes = await fs.readFile(trace.frameFile);
    if (sha256(frameBytes) !== trace.frameSha256) throw new Error(`frame ${frameIndex} PNG hash does not match motion receipt`);
    if (trace.outputSha256 !== evidence.outputSha256) throw new Error(`frame ${frameIndex} output hash disagrees with the required motion receipt`);
    checkedSamples += expected.length;
  }

  const rawOutputPath = args.output || manifest.output;
  if (!rawOutputPath || !path.isAbsolute(rawOutputPath)) throw new Error("--output or manifest.output must identify an absolute encoded output path");
  const outputPath = path.resolve(rawOutputPath);
  if (manifest.output && path.resolve(manifest.output) !== outputPath) throw new Error("--output does not match the encoded output path in manifest");
  const outputHash = sha256(await fs.readFile(outputPath));
  if (outputHash !== manifest.outputSha256 || outputHash !== evidence.outputSha256) throw new Error("encoded MP4 hash does not match manifest and motion receipt");
  return {
    schema: "motion-probe-report/1",
    status: "pass",
    scene: scenePath,
    manifest: manifestPath,
    output: outputPath,
    outputSha256: outputHash,
    viewport: { width: scene.width, height: scene.height },
    clock: { timeBasis: "scene-local", fps: scene.fps, durationSec: scene.duration, frameCount },
    requirements: requirements.map(({ id, scope, startSec, endSec, startFrame, endFrame }) => ({ id, scope, startSec, endSec, interval: "half-open", startFrame, endFrame, samples: endFrame - startFrame })),
    checkedFrames: expectedFrameIndices.length,
    checkedSamples,
    inputFingerprints: {
      scene: sceneFingerprint.sha256,
      drawModule: fingerprints.drawModule.status === "present" ? fingerprints.drawModule.sha256 : "not-provided",
      motionCore: fingerprints.motionCore.sha256,
      motionOps: fingerprints.motionOps.sha256,
      providerCatalog: catalogFingerprint.sha256,
      observedBrowserResources: resources.resources.length,
      hashedBrowserResources: resources.resources.filter((row) => row.hashStatus === "hashed").length,
      resourceScope: "captured local file URLs are rehashed; external responses retain render-time content hashes; system font resolution and inline/data/blob sources are not exposed",
    },
    duplicateFrames: 0,
    missingFrames: 0,
    unsupportedFrames: 0,
  };
}

const args = parseArgs(process.argv.slice(2));
probe(args).then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)).catch((error) => {
  process.stderr.write(`${JSON.stringify({ schema: "motion-probe-report/1", status: "fail", error: error.message }, null, 2)}\n`);
  process.exitCode = 1;
});
