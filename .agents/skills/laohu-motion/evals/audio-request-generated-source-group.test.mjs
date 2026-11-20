import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath, pathToFileURL} from "node:url";
import {preflightFfmpeg} from "../scripts/laohu-ffmpeg-preflight.mjs";
import {floatWav, generatePlan, validateFilmMaps} from "../scripts/laohu-audio-source.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const skillRoot = path.join(repoRoot, ".agents", "skills", "laohu-motion");
const tmpRoot = process.env.MOTION_AUDIO_TEST_TMP_DIR
  ? path.resolve(process.env.MOTION_AUDIO_TEST_TMP_DIR)
  : path.join(repoRoot, ".cache", "tmp", "motion-local-integration", "audio");
const validationRoot = process.env.MOTION_AUDIO_TEST_VALIDATION_DIR
  ? path.resolve(process.env.MOTION_AUDIO_TEST_VALIDATION_DIR)
  : path.join(repoRoot, ".cache", "validation", "motion-local-integration", "audio");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

function makeVoiceWav(durationSec, channels = 1) {
  const rate = 48000;
  const frames = Math.round(durationSec * rate);
  const dataBytes = frames * channels * 4;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(36 + dataBytes, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(3, 20); bytes.writeUInt16LE(channels, 22); bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * channels * 4, 28); bytes.writeUInt16LE(channels * 4, 32); bytes.writeUInt16LE(32, 34); bytes.write("data", 36); bytes.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    const envelope = frame < rate * 0.12 ? frame / (rate * 0.12) : 1;
    const sample = 0.17 * envelope * Math.sin(2 * Math.PI * 220 * frame / rate);
    for (let channel = 0; channel < channels; channel += 1) bytes.writeFloatLE(sample * (channel === 0 ? 1 : 0.92), 44 + (frame * channels + channel) * 4);
  }
  return bytes;
}

function writeJson(file, value) { return fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", {flag: "wx"}); }

async function makeFixture(root, {requestOverrides = {}, basePlanOverrides = {}, timeMapRow = null} = {}) {
  const audioDir = path.join(root, "audio");
  const assetsDir = path.join(audioDir, "generated");
  await fs.mkdir(assetsDir, {recursive: true});
  const voiceBytes = makeVoiceWav(2);
  const voicePath = path.join(audioDir, "voice.wav");
  await fs.writeFile(voicePath, voiceBytes, {flag: "wx"});
  const voiceHash = sha256(voiceBytes);
  const voiceWindows = [{id: "voice-window-01", startSec: 0.2, endSec: 0.8}];
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 2,
    sampleRate: 48000, channels: 2, events: [],
    tracks: [{id: "voice-locked", assetId: "voice-input", bus: "voice", startSec: 0, locked: true}],
    voiceWindows, automation: [], timeMaps: [], generatedAssets: [],
    assets: [{
      id: "voice-input", file: "voice.wav", durationSec: 2, sha256: voiceHash,
      license: "Synthetic technical fixture", redistribution: {status: "project-generated", basis: "Generated as a local test signal; not user speech."}, reviewStatus: "ready",
    }],
    ...basePlanOverrides,
  };
  const basePlanPath = path.join(audioDir, "base-plan.json");
  await writeJson(basePlanPath, basePlan);
  const request = {
    format: "laohu.motion.huashu-audio-request/2",
    musicPreset: {style: "mallet", seed: "group-e2e", bpm: 96, sections: [{eventId: "event-section", energy: 0.75}]},
    musicMixGainDb: -6,
    sfxEvents: [{id: "manual-click", eventId: "event-click", name: "click", sourceGain: 0.8, sourcePan: 0.1}],
    generationAuthorization: {
      granted: true,
      scopes: ["music", "sfx"],
      source: "explicit-user-request",
      instructionExcerpt: "Authorized original music and SFX for the isolated source group test.",
    },
    ...requestOverrides,
  };
  const requestPath = path.join(root, "request.json");
  await writeJson(requestPath, request);
  const eventTimeBasis = timeMapRow ? "scene-local" : "film-global";
  const scene = {
    version: 1, timeBasis: "film-global", duration: 2, fps: 30,
    audioEvents: [
      timeMapRow ? {id: "event-click", timeSec: 0.62, timeBasis: eventTimeBasis} : {id: "event-click", filmTimeSec: 0.72, timeBasis: eventTimeBasis},
      timeMapRow ? {id: "event-section", timeSec: 1.1, timeBasis: eventTimeBasis} : {id: "event-section", filmTimeSec: 1.1, timeBasis: eventTimeBasis},
    ],
  };
  const scenePath = path.join(root, "canonical-scene.json");
  const sceneBytes = Buffer.from(JSON.stringify(scene, null, 2) + "\n");
  await fs.writeFile(scenePath, sceneBytes, {flag: "wx"});
  const sourceSceneBytes = Buffer.from("{\"source\":\"fixture-only\"}\n");
  const sourceScenePath = path.join(root, "source-scene.json");
  await fs.writeFile(sourceScenePath, sourceSceneBytes, {flag: "wx"});
  const blueprintBytes = Buffer.from("{\"fixture\":\"audio source-group technical test\"}\n");
  const blueprintPath = path.join(root, "blueprint.json");
  await fs.writeFile(blueprintPath, blueprintBytes, {flag: "wx"});
  const filmManifest = {
    format: "laohu.motion-film-manifest/1",
    audioEventScene: {format: "motion-scene-v1", path: "canonical-scene.json", sha256: sha256(sceneBytes)},
    audioTimeMaps: timeMapRow ? [timeMapRow] : [],
    sourceScenes: [{segmentId: "segment-01", path: "source-scene.json", sha256: sha256(sourceSceneBytes)}],
    audioEventBindings: ["event-click", "event-section"].map((eventId) => ({
      eventId, sourceEventId: eventId, segmentId: "segment-01",
      sourceScenePath: "source-scene.json", sourceSceneSha256: sha256(sourceSceneBytes),
      sourceTimeBasis: eventTimeBasis, timeMapId: timeMapRow ? timeMapRow.id : null, compiledPhaseId: null, sourcePhaseId: null,
    })),
  };
  const filmManifestPath = path.join(root, "film-manifest.json");
  await writeJson(filmManifestPath, filmManifest);
  const film = {
    manifestPath: filmManifestPath, manifest: filmManifest, scene,
    maps: timeMapRow ? validateFilmMaps([timeMapRow], scene) : new Map(), bindings: new Map(["event-click", "event-section"].map((eventId) => [eventId, {
      eventId, segmentId: "segment-01", sourceSceneSha256: sha256(sourceSceneBytes),
      timeBasis: eventTimeBasis, timeMapId: timeMapRow ? timeMapRow.id : null, phaseId: null,
    }])),
    sourceScenes: new Map([["segment-01", {path: sourceScenePath, sha256: sha256(sourceSceneBytes), scene: {}}]]),
    verifiedFiles: [{path: scenePath}, {path: sourceScenePath}, {path: blueprintPath}],
    nativeSourceCompositions: [], nativeSourcePresetPlans: [], nativeSourceSfxOnlyPlans: [],
    blueprintPath, blueprintSha256: sha256(blueprintBytes), scenePath, sceneSha256: sha256(sceneBytes),
  };
  const outputPlan = path.join(audioDir, "generated-plan.json");
  const receiptPath = path.join(audioDir, "generated-plan.receipt.json");
  const generated = await generatePlan({
    request, basePlan, basePlanPath, film, inputFiles: [requestPath, basePlanPath, filmManifestPath, scenePath],
    requestFilePath: requestPath, requestFileSha256: sha256(await fs.readFile(requestPath)),
    assetsDir, projectRoot: root, outputPlan, manifestPath: receiptPath,
  });
  return {root, audioDir, assetsDir, basePlan, request, requestPath, voiceHash, voiceWindows, scenePath, filmManifestPath, outputPlan, receiptPath, generated};
}

test("request /2 generated source group binds one local mixdown, canonical hit, and separate locked voice through audio.mjs", {timeout: 180_000}, async () => {
  await fs.mkdir(tmpRoot, {recursive: true});
  await fs.mkdir(validationRoot, {recursive: true});
  const root = await fs.mkdtemp(path.join(tmpRoot, "request-generated-source-group-"));
  const fixture = await makeFixture(root);
  const {plan, manifest: receipt} = fixture.generated;
  const groupTrack = plan.tracks.find((row) => row.sourceGeneratedGroup);
  assert.ok(groupTrack, "eligible /2 preset+manual SFX request must create one explicitly bound generated group track");
  assert.equal(plan.schemaVersion, 1, "the bounded route stays within audio-plan/1");
  assert.deepEqual(plan.events, [], "the baked SFX hit must not be emitted as a second audio-plan event");
  assert.equal(plan.tracks.filter((row) => row.bus === "voice").length, 1, "voice remains a separate single locked track");
  assert.equal(groupTrack.gainDb, 0, "the bounded music gain is baked before the shared bus");
  const groupReceipt = receipt.alignment.requestGeneratedSourceGroups[0];
  assert.equal(groupReceipt.sourceMixdown.function, "sound.mixdown");
  assert.equal(groupReceipt.sourceMixdown.mixBusMode, "default-sum");
  assert.equal(groupReceipt.sourceMixdown.musicGainDb, -6);
  assert.equal(groupReceipt.sourceMixdown.sourceHitCount, 1);
  assert.equal(groupReceipt.bakedCanonicalEvents.length, 1);
  assert.equal(groupReceipt.bakedCanonicalEvents[0].eventId, "event-click");
  assert.equal(groupReceipt.voiceBinding.trackId, "voice-locked");
  assert.equal(groupReceipt.voiceBinding.narrationIncludedInBakedAsset, false);

  const runtime = await import(pathToFileURL(path.join(skillRoot, "templates", "runtime", "laohu-audio-mix.mjs")).href + "?source-group=" + crypto.randomUUID());
  const expectedVoiceWords = [{start: 0.2, end: 0.8}];
  assert.deepEqual(groupReceipt.sourceMixdown.voiceDuckProcessing.wordWindows, expectedVoiceWords,
    "receipt must record the native sound.mixdown {start,end} words after the full-film identity mapping");
  assert.equal(groupReceipt.sourceMixdown.voiceDuckProcessing.applied, true);
  assert.equal(groupReceipt.voiceBinding.voiceWindows[0].startSec, 0.2,
    "audio-plan voiceWindows retain their canonical startSec/endSec fields");

  const decodedVoice = spawnSync(process.env.MOTION_FFMPEG || "ffmpeg", [
    "-nostdin", "-v", "error", "-i", path.join(fixture.audioDir, "voice.wav"), "-map", "0:a:0", "-vn",
    "-af", "aformat=sample_fmts=fltp:channel_layouts=stereo", "-ac", "2", "-ar", "48000", "-f", "f32le", "pipe:1",
  ], {encoding: null, maxBuffer: 32 << 20});
  assert.equal(decodedVoice.status, 0, decodedVoice.stderr?.toString("utf8") || decodedVoice.error?.message);
  assert.equal(decodedVoice.stdout.length % 8, 0);
  const voiceFrames = decodedVoice.stdout.length / 8;
  const voiceL = new Float32Array(voiceFrames), voiceR = new Float32Array(voiceFrames);
  for (let index = 0; index < voiceFrames; index += 1) {
    voiceL[index] = decodedVoice.stdout.readFloatLE(index * 8);
    voiceR[index] = decodedVoice.stdout.readFloatLE(index * 8 + 4);
  }
  const expectedVoiceLufs = runtime.loudness(voiceL, voiceR);
  assert.equal(groupReceipt.voiceBinding.voiceLufs, expectedVoiceLufs,
    "voice target must use independent final-mixer stereo rematrix measurement, with no fixed +3 LU");
  assert.match(groupReceipt.voiceBinding.voiceLufsMeasurement, /stereo aformat decode/);
  assert.doesNotMatch(groupReceipt.voiceBinding.voiceLufsMeasurement, /\+ 3/);

  const duckTrack = new runtime.Track(3);
  for (let frame = 0; frame < duckTrack.n; frame += 1) {
    const value = 0.2 * Math.sin(2 * Math.PI * 440 * frame / 48000);
    duckTrack.L[frame] = value; duckTrack.R[frame] = value;
  }
  runtime.duck(duckTrack, [{start: 1, end: 2}]);
  const rms = (channel, start, end) => {
    const first = Math.round(start * 48000), last = Math.round(end * 48000);
    let sum = 0;
    for (let frame = first; frame < last; frame += 1) sum += channel[frame] * channel[frame];
    return Math.sqrt(sum / (last - first));
  };
  const outsideBefore = rms(duckTrack.L, 0.3, 0.8);
  const insideWindow = rms(duckTrack.L, 1.3, 1.8);
  const outsideAfter = rms(duckTrack.L, 2.45, 2.9);
  assert.ok(insideWindow < outsideBefore * 0.5, `source duck must attenuate inside the word window (${insideWindow} < ${outsideBefore} * 0.5)`);
  assert.ok(outsideAfter > insideWindow * 1.8, `source duck must release after the word window (${outsideAfter} > ${insideWindow} * 1.8)`);

  const expectedMinusSix = runtime.mixdown(groupReceipt.sourceP0, {
    voiced: true, words: expectedVoiceWords, voiceLufs: groupReceipt.voiceBinding.voiceLufs,
    musicGainDb: -6, mixBusMode: "default-sum",
  });
  const expectedZero = runtime.mixdown(groupReceipt.sourceP0, {
    voiced: true, words: [], voiceLufs: groupReceipt.voiceBinding.voiceLufs,
    musicGainDb: 0, mixBusMode: "default-sum",
  });
  assert.deepEqual(await fs.readFile(path.join(fixture.assetsDir, groupTrack.assetId + ".wav")), floatWav(expectedMinusSix.out2), "generated group WAV must be the actual source mixdown result at -6 dB pre-bus");
  assert.notDeepEqual(Buffer.from(expectedMinusSix.out2.L.buffer), Buffer.from(expectedZero.out2.L.buffer), "the generated music gain must change source PCM");
  assert.notDeepEqual(await fs.readFile(path.join(fixture.assetsDir, groupTrack.assetId + ".wav")), floatWav(expectedZero.out2),
    "generated group WAV must include the source duck window, not merely claim it in the receipt");

  const indexPath = path.join(root, "audio-index.json");
  await writeJson(indexPath, {schemaVersion: 1, assets: []});
  const audioOutput = path.join(root, "final-mix.wav");
  const consumerManifestPath = path.join(root, "audio-usage.json");
  const consumerCache = path.join(root, "consumer-cache");
  const configuredFfmpeg = process.env.MOTION_FFMPEG || "ffmpeg";
  preflightFfmpeg(configuredFfmpeg);
  const ffmpegTmp = path.join(tmpRoot, "ffmpeg");
  await fs.mkdir(ffmpegTmp, {recursive: true});
  const env = {...process.env, TMPDIR: ffmpegTmp, TMP: ffmpegTmp, TEMP: ffmpegTmp, MOTION_FFMPEG: configuredFfmpeg, MOTION_VALIDATION_DIR: validationRoot};
  const consumer = spawnSync(process.execPath, [
    path.join(skillRoot, "scripts", "audio.mjs"),
    "--plan", fixture.outputPlan, "--scene", fixture.scenePath, "--asset-index", indexPath,
    "--output", audioOutput, "--manifest", consumerManifestPath, "--cache-dir", consumerCache,
    "--ffmpeg", configuredFfmpeg, "--allow-generated-preview",
  ], {encoding: "utf8", env, maxBuffer: 16 * 1024 * 1024});
  assert.equal(consumer.status, 0, "audio.mjs must independently verify and consume the group receipt:\n" + consumer.stdout + "\n" + consumer.stderr);
  const usage = JSON.parse(await fs.readFile(consumerManifestPath, "utf8"));
  assert.equal(usage.schemaVersion, 1);
  assert.equal(usage.sourceGeneratedSourceGroups.length, 1);
  assert.equal(usage.sourceGeneratedSourceGroups[0].sourceHitCount, 1);
  assert.equal(usage.sourceGeneratedSourceGroups[0].voiceTrackId, "voice-locked");
  assert.equal(usage.sourceGeneratedSourceGroups[0].narrationIncludedInBakedAsset, false);
  assert.equal(usage.events.length, 0, "the canonical hit is not rendered a second time by audio.mjs");
  assert.equal(usage.tracks.filter((row) => row.bus === "voice").length, 1, "audio.mjs mixes the locked voice exactly once");
  assert.equal(usage.tracks.find((row) => row.id === groupTrack.id).sourceGeneratedGroup.sourceHitCount, 1);
  assert.ok((await fs.stat(audioOutput)).size > 44, "the final mixed audio file must be produced");

  const evidence = {
    format: "laohu.motion.request-generated-source-group-e2e/1",
    producerSelection: receipt.alignment.requestGeneratedSourceGroupSelection,
    sourceCommit: groupReceipt.sourceCommit,
    localRuntimeClosureSha256: groupReceipt.localRuntimeClosureSha256,
    sourceClosureSha256: groupReceipt.sourceClosureSha256,
    requestSha256: groupReceipt.requestSha256,
    sourceP0Sha256: groupReceipt.p0Sha256,
    groupAssetSha256: groupReceipt.outputWav.sha256,
    sourceMixdown: groupReceipt.sourceMixdown,
    canonicalHitCount: groupReceipt.bakedCanonicalEvents.length,
    lockedVoiceTrackId: groupReceipt.voiceBinding.trackId,
    voiceWindowsSha256: groupReceipt.voiceBinding.voiceWindowsSha256,
    consumerWavSha256: usage.outputWavSha256,
    consumerManifestSha256: sha256(await fs.readFile(consumerManifestPath)),
    ffmpeg: configuredFfmpeg,
    result: "producer group WAV matches source mixdown with correctly mapped {start,end} words, independent stereo voice LUFS, and -6 dB pre-bus music; audio.mjs verifies receipt and mixes one separate locked voice; canonical SFX remains baked once",
  };
  const evidencePath = path.join(validationRoot, "audio-request-generated-source-group-" + process.pid + "-" + crypto.randomBytes(4).toString("hex") + ".json");
  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n", {flag: "wx"});
});

test("request /2 source group preserves canonical Film timeMap residual presence through audio.mjs", {timeout: 180_000}, async () => {
  await fs.mkdir(tmpRoot, {recursive: true});
  const configuredFfmpeg = process.env.MOTION_FFMPEG || "ffmpeg";
  preflightFfmpeg(configuredFfmpeg);
  const fps = 30, sourceStartSec = 0.1, sourceEndSec = 1.91;
  const startFrame = Math.ceil(sourceStartSec * fps), endFrame = Math.ceil(sourceEndSec * fps);
  const frameStartResidualSec = startFrame / fps - sourceStartSec;
  const frameEndResidualSec = endFrame / fps - sourceEndSec;
  const canonicalMap = {
    id: "time:segment-01", segmentId: "segment-01", localStartSec: 0,
    localEndSec: (endFrame - startFrame) / fps, filmStartSec: sourceStartSec,
    speed: ((endFrame - startFrame) / fps) / (sourceEndSec - sourceStartSec),
    sourceRange: {startSec: sourceStartSec, endSec: sourceEndSec},
    frameRange: {startFrame, endFrame},
    frameStartResidualSec,
    frameEndResidualSec,
    roundingResidualSamples: (frameStartResidualSec + frameEndResidualSec) * 48000,
  };
  assert.equal(canonicalMap.frameStartResidualSec, 0);
  assert.ok(canonicalMap.frameEndResidualSec > 0);
  const maps = [
    {name: "explicit-zero-and-nonzero", row: canonicalMap},
    {name: "optional-start-residual-absent", row: Object.fromEntries(Object.entries(canonicalMap).filter(([key]) => key !== "frameStartResidualSec"))},
  ];
  for (const {name, row} of maps) {
    const root = await fs.mkdtemp(path.join(tmpRoot, "request-generated-time-map-residual-" + name + "-"));
    const fixture = await makeFixture(root, {timeMapRow: row});
    const {plan, manifest: receipt} = fixture.generated;
    assert.ok(plan.tracks.some((track) => track.sourceGeneratedGroup), name + " must use the request-generated source-group route");
    assert.deepEqual(plan.timeMaps, [row], name + " plan must retain the exact canonical Film map shape");
    assert.deepEqual(receipt.alignment.timeMaps, [row], name + " receipt must retain the exact canonical Film map shape");

    const indexPath = path.join(root, "audio-index.json");
    await writeJson(indexPath, {schemaVersion: 1, assets: []});
    const output = path.join(root, "final-mix.wav"), outputReceipt = path.join(root, "audio-usage.json");
    const consumerCache = path.join(root, ".cache", "audio");
    const ffmpegTmp = path.join(tmpRoot, "ffmpeg");
    await fs.mkdir(ffmpegTmp, {recursive: true});
    const env = {...process.env, TMPDIR: ffmpegTmp, TMP: ffmpegTmp, TEMP: ffmpegTmp, MOTION_FFMPEG: configuredFfmpeg};
    const consumer = spawnSync(process.execPath, [
      path.join(skillRoot, "scripts", "audio.mjs"),
      "--plan", fixture.outputPlan, "--scene", fixture.scenePath, "--asset-index", indexPath,
      "--output", output, "--manifest", outputReceipt, "--cache-dir", consumerCache,
      "--ffmpeg", configuredFfmpeg, "--allow-generated-preview",
    ], {encoding: "utf8", env, timeout: 60_000, maxBuffer: 16 << 20});
    assert.equal(consumer.status, 0, name + " canonical map must pass the actual final mixer:\n" + consumer.stdout + "\n" + consumer.stderr);
    const usage = JSON.parse(await fs.readFile(outputReceipt, "utf8"));
    assert.equal(usage.sourceGeneratedSourceGroups.length, 1, name + " source group remains uniquely consumed");
    assert.ok((await fs.stat(output)).size > 44, name + " final WAV must be written");
    const decoded = spawnSync(configuredFfmpeg, ["-nostdin", "-v", "error", "-i", output, "-f", "null", "-"], {encoding: "utf8", env});
    assert.equal(decoded.status, 0, name + " final WAV must decode: " + decoded.stderr);
  }
});

test("transformed non-locked voice skips source loudness measurement and falls back to the separate music stem with source duck", {timeout: 180_000}, async () => {
  await fs.mkdir(tmpRoot, {recursive: true});
  const root = await fs.mkdtemp(path.join(tmpRoot, "request-generated-source-group-voice-transform-"));
  const fixture = await makeFixture(root, {
    basePlanOverrides: {
      tracks: [{ id: "voice-locked", assetId: "voice-input", bus: "voice", startSec: 0, locked: false, speed: 1.2 }],
    },
  });
  assert.equal(fixture.generated.plan.tracks.some((row) => row.sourceGeneratedGroup), false,
    "the optimized source group is excluded when its separate voice input cannot use the locked one-times measurement path");
  const musicTrack = fixture.generated.plan.tracks.find((row) => row.bus === "music");
  assert.ok(musicTrack, "the ordinary separate music-stem route remains available");
  const musicAsset = fixture.generated.plan.assets.find((row) => row.id === musicTrack.assetId);
  assert.equal(fixture.generated.manifest.alignment.requestGeneratedSourceGroupSelection.reasons.includes("voice-track-not-locked"), true);
  assert.equal(musicAsset.source.voiceDuckProcessing.applied, true,
    "canonical voiceWindows still duck the music stem without trying to measure transformed voice LUFS");
  assert.deepEqual(musicAsset.source.voiceDuckProcessing.wordWindows, [{start: 0.2, end: 0.8}]);
  assert.equal(fixture.generated.manifest.composition.sourceMusicLevel.targetLufs, -28,
    "the unsupported voice measurement uses the source's existing voice fallback level");
  const consumerOutput = path.join(root, "transformed-voice-final.wav");
  const consumerManifest = path.join(root, "transformed-voice-final.json");
  const consumer = spawnSync(process.execPath, [
    path.join(skillRoot, "scripts", "audio.mjs"),
    "--plan", fixture.outputPlan, "--scene", fixture.scenePath,
    "--asset-index", path.join(skillRoot, "assets", "audio", "index.json"),
    "--output", consumerOutput, "--manifest", consumerManifest,
    "--cache-dir", path.join(root, ".cache", "audio"),
    "--ffmpeg", process.env.MOTION_FFMPEG || "ffmpeg", "--allow-generated-preview",
  ], {encoding: "utf8", timeout: 60_000, maxBuffer: 8 << 20});
  assert.equal(consumer.status, 0, "audio.mjs must consume the stem without applying a second voice duck:\n" + consumer.stdout + "\n" + consumer.stderr);
  const usage = JSON.parse(await fs.readFile(consumerManifest, "utf8"));
  assert.deepEqual(usage.voiceDuckProcessing.sourceProcessedTrackIds, [musicTrack.id]);
  assert.deepEqual(usage.voiceDuckProcessing.finalMixerTrackIds, [], "the source stem is the one and only duck owner");
  assert.equal(usage.voiceDuckProcessing.requestedWindows[0].startSec, 0.2);
  const decoded = spawnSync(process.env.MOTION_FFMPEG || "ffmpeg", ["-v", "error", "-i", consumerOutput, "-f", "null", "-"], {encoding: "utf8"});
  assert.equal(decoded.status, 0, decoded.stderr || decoded.error?.message);
});

test("incompatible per-hit seed, kit, and plan automation honestly stay on separate-stem route", {timeout: 180_000}, async () => {
  await fs.mkdir(tmpRoot, {recursive: true});
  const cases = [
    {
      name: "custom-seed",
      requestOverrides: {sfxEvents: [{id: "manual-click", eventId: "event-click", name: "click", sourceGain: 0.8, sourcePan: 0.1, seed: "caller-seed"}]},
      basePlanOverrides: {}, reason: "custom-sfx-seed-not-source-equivalent",
    },
    {
      name: "incompatible-kit",
      requestOverrides: {sfxEvents: [{id: "manual-click", eventId: "event-click", name: "click", sourceGain: 0.8, sourcePan: 0.1, kit: "organic"}]},
      basePlanOverrides: {}, reason: "sfx-kit-differs-from-source-preset-kit",
    },
    {
      name: "plan-automation",
      requestOverrides: {},
      basePlanOverrides: {automation: [{id: "existing-music-ride", bus: "music", startSec: 0.1, endSec: 1.8, gainDb: -3}]},
      reason: "audio-plan-automation",
    },
  ];
  const resultRows = [];
  for (const item of cases) {
    const root = await fs.mkdtemp(path.join(tmpRoot, "request-generated-source-group-fallback-" + item.name + "-"));
    const fixture = await makeFixture(root, {requestOverrides: item.requestOverrides, basePlanOverrides: item.basePlanOverrides});
    const selection = fixture.generated.manifest.alignment.requestGeneratedSourceGroupSelection;
    assert.equal(selection.selected, false, item.name + " must not claim the shared source group");
    assert.ok(selection.reasons.includes(item.reason), item.name + " must name why it fell back: " + selection.reasons.join(", "));
    assert.equal(fixture.generated.plan.tracks.some((row) => row.sourceGeneratedGroup), false, item.name + " must not write a group owner marker");
    assert.equal(fixture.generated.plan.events.length, 1, item.name + " keeps its manual SFX event as an independently rendered stem");
    assert.equal(fixture.generated.manifest.alignment.requestGeneratedSourceGroups.length, 0);
    if (item.name === "plan-automation") assert.deepEqual(fixture.generated.plan.automation, item.basePlanOverrides.automation);
    resultRows.push({name: item.name, reason: item.reason, selected: selection.selected, generatedGroupTracks: 0, separateSfxEvents: fixture.generated.plan.events.length});
  }
  const evidence = {format: "laohu.motion.request-generated-source-group-fallback/1", cases: resultRows, result: "all ineligible controls retained the separate-stem route with an explicit exclusion reason"};
  const evidencePath = path.join(validationRoot, "audio-request-generated-source-group-fallback-" + process.pid + "-" + crypto.randomBytes(4).toString("hex") + ".json");
  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n", {flag: "wx"});
});
