import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bindSpeechTimeline, prepareSceneForTimeline } from "../scripts/bind-speech.mjs";
import { buildAsrcutVoicePlan, renderAudioPlan } from "../scripts/audio.mjs";
import { authorizeReview, compilePlan, exportAudio, freezePlan, hashPlan, importAsrJson, importSrt, insertPresentationInterval } from "../../laohu-asrcut/scripts/asrcut.mjs";

const require = createRequire(import.meta.url);
const MotionOps = require("../scripts/motion-ops.js");
const testDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(testDir, "..");
const repositoryDir = path.resolve(skillDir, "../../..");
const ffmpeg = process.env.MOTION_TEST_FFMPEG || process.env.MOTION_FFMPEG || "ffmpeg";
const ffmpegAvailable = spawnSync(ffmpeg, ["-version"], { encoding: "utf8" }).status === 0;
function rawAsrFixture(firstWordStartSec = 0.4) {
  return {
    segments: [{
      start: 0,
      end: 2,
      text: "为什么因为",
      words: [
        { text: "为什么", start: firstWordStartSec, end: firstWordStartSec + 0.1 },
        { text: "因为", start: 0.7, end: 0.75 },
      ],
    }],
  };
}
function compileFixture({ revision = 1, firstWordStartSec = 0.4, mediaPath = null, mediaSha256 = null, evidenceRef = null, transcriptSha256 = null, srt = false } = {}) {
  const options = {
    projectId: "speech-demo",
    sourceId: "source-a",
    sampleRateHz: 48000,
    sourceSampleRateHz: 48000,
    sourceDurationSamples: 96000,
    mediaPath,
    mediaSha256,
    evidenceRef,
    transcriptSha256,
  };
  const raw = rawAsrFixture(firstWordStartSec);
  let plan;
  if (srt) {
    plan = importSrt("1\n00:00:00,000 --> 00:00:02,000\n为什么会这样，因为……\n", options);
  } else {
    plan = importAsrJson(raw, { ...options, timeUnit: "seconds" });
  }
  plan.project.revision = revision;
  plan.integrity.planSha256 = hashPlan(plan);
  plan = freezePlan(plan);
  return { plan, timeline: compilePlan(plan) };
}
function compilePresentationFixture(presentationSamples = 24000) {
  const plan = importAsrJson({ segments: [
    { start: 0, end: 1, text: "A", words: [{ text: "A", start: 0.4, end: 0.5 }] },
    { start: 1, end: 2, text: "B", words: [{ text: "B", start: 1.2, end: 1.3 }] },
  ] }, { projectId: "speech-presentation", sourceId: "source-a", sampleRateHz: 48000, sourceSampleRateHz: 48000, sourceDurationSamples: 96000, timeUnit: "seconds" });
  const sourceId = plan.sources[0].id;
  const tokenIdsIn = (startSample, endSample) => plan.sources[0].transcript.segments.flatMap((segment) => segment.tokens
    .filter((token) => token.sourceRange && token.sourceRange.startSample >= startSample && token.sourceRange.endSample <= endSample).map((token) => token.id));
  plan.coverage = [
    { id: "speech-a", sourceId, sourceRange: { startSample: 0, endSample: 48000, sampleRateHz: 48000 }, disposition: "retain", decisionId: "speech-a-decision", tokenIds: tokenIdsIn(0, 48000) },
    { id: "speech-b", sourceId, sourceRange: { startSample: 48000, endSample: 96000, sampleRateHz: 48000 }, disposition: "retain", decisionId: "speech-b-decision", tokenIds: tokenIdsIn(48000, 96000) },
  ];
  plan.decisions = plan.coverage.map((coverage) => ({ id: coverage.decisionId, action: "retain", reason: "Retain the source interval.", coverageIds: [coverage.id], sourceRanges: [{ sourceId, sourceRange: coverage.sourceRange }], keptOccurrenceIds: [`${coverage.id}-occurrence`], tokenIds: coverage.tokenIds }));
  plan.sequence = plan.coverage.map((coverage) => ({ occurrenceId: `${coverage.id}-occurrence`, coverageId: coverage.id }));
  plan.integrity.planSha256 = hashPlan(plan);
  const afterOccurrenceId = plan.sequence[0].occurrenceId;
  const withPresentation = insertPresentationInterval(plan, {
    id: "diagram-bridge", decisionId: "diagram-bridge-decision", reason: "Let the relationship diagram resolve before the next spoken point.",
    afterOccurrenceId, sceneId: "relationship-bridge", durationSamples: presentationSamples,
    visualHandoff: { focus: "linked nodes", entryState: "nodes visible without a connection", exitCondition: "the connecting path reaches node B" },
    audioHandoff: { role: "continue-bed", rationale: "The music bed continues beneath the source-free visual explanation." },
    expectedRevision: plan.project.revision, expectedPlanSha256: hashPlan(plan),
  }, { authorized: true });
  const frozenPlan = freezePlan(withPresentation);
  return { plan: frozenPlan, timeline: compilePlan(frozenPlan) };
}
function baseScene() {
  return {
    version: 1,
    width: 96,
    height: 64,
    fps: 30,
    duration: 2,
    background: "#101820",
    objects: [{ id: "semantic-probe", type: "custom:speech-probe", data: { phases: [] } }],
    audioEvents: [{ id: "legacy-direct-event", filmTimeSec: 1.5 }],
  };
}
function baseSpec(timeline, options = {}) {
  const clip = timeline.clips[0];
  const anchor = options.anchor || (clip.words[0]
    ? { kind: "point", clipOccurrenceId: clip.occurrenceId, tokenId: clip.words[0].tokenId, edge: "start" }
    : { kind: "segment", clipOccurrenceId: clip.occurrenceId, segmentId: clip.transcriptSegments[0].segmentId, edge: "start" });
  const eventAnchor = { ...anchor, edge: "end" };
  return {
    format: "laohu.motion.speech-bindings/1",
    project: { id: timeline.project.id, revision: timeline.project.revision, planSha256: timeline.planSha256 },
    bindings: [{
      id: "question-focus",
      objectId: "semantic-probe",
      phases: [{
        id: "question-reveal",
        anchor,
        offset: { value: 2400, unit: "samples" },
        duration: { value: 24000, unit: "samples" },
        curve: "ease-out-cubic",
        channels: {
          x: { from: 10, to: 50, curve: "linear" },
          alpha: { from: 0, to: 1, duration: { value: 4800, unit: "samples" }, curve: "linear" },
        },
      }],
      events: [{
        id: "question-hit",
        phaseId: "question-reveal",
        anchor: eventAnchor,
      }],
    }],
  };
}
function wavReader(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  let offset = 12;
  let format = null;
  let channels = null;
  let sampleRate = null;
  let bits = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > buffer.length) throw new Error("truncated WAV chunk");
    if (name === "fmt ") {
      format = buffer.readUInt16LE(start);
      channels = buffer.readUInt16LE(start + 2);
      sampleRate = buffer.readUInt32LE(start + 4);
      bits = buffer.readUInt16LE(start + 14);
    } else if (name === "data") {
      data = buffer.subarray(start, start + length);
      break;
    }
    offset = start + length + (length & 1);
  }
  assert.equal(format, 3, "renderAudioPlan produces float PCM");
  assert.equal(channels, 2);
  assert.equal(sampleRate, 48000);
  assert.equal(bits, 32);
  assert.ok(data);
  return {
    durationSec: data.length / (sampleRate * channels * 4),
    rms(startSec, endSec) {
      const first = Math.max(0, Math.floor(startSec * sampleRate));
      const last = Math.min(data.length / (channels * 4), Math.floor(endSec * sampleRate));
      let sum = 0;
      let count = 0;
      for (let frame = first; frame < last; frame += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
          const value = data.readFloatLE((frame * channels + channel) * 4);
          sum += value * value;
          count += 1;
        }
      }
      return count ? Math.sqrt(sum / count) : 0;
    },
  };
}

function asrcutReceiptFixture(plan, timeline, wavBytes) {
  return {
    format: "laohu.asrcut.audio-artifact/2",
    project: structuredClone(plan.project),
    planSha256: hashPlan(plan),
    timelineFormat: timeline.format,
    output: "voice.wav",
    outputSha256: createHash("sha256").update(wavBytes).digest("hex"),
    sampleRateHz: timeline.clock.sampleRateHz,
    sampleCount: timeline.durationSamples,
    sampleFormat: "pcm_s16le",
    channels: 1,
    voiceTrackPlayback: "Play this single exported WAV once from project sample 0. Voice windows are conservative source-unit bounds, may include original source pauses, and must not be used to replay individual clips or infer mic-zero as final-mix silence.",
    clips: timeline.clips.map(({ occurrenceId, sourceId, coverageId, sourceRange, targetRange }) => ({ occurrenceId, sourceId, coverageId, sourceRange, targetRange })),
    units: timeline.units.map((unit) => unit.kind === "presentation"
      ? { kind: "presentation", id: unit.id, decisionId: unit.decisionId, reason: unit.reason, sceneId: unit.sceneId, durationSamples: unit.durationSamples, targetRange: unit.targetRange, visualHandoff: unit.visualHandoff, audioHandoff: unit.audioHandoff }
      : { kind: "source", occurrenceId: unit.occurrenceId, sourceId: unit.sourceId, coverageId: unit.coverageId, sourceRange: unit.sourceRange, targetRange: unit.targetRange, timingPrecision: unit.timingPrecision }),
    voiceWindows: timeline.units.filter((unit) => unit.kind === "source").map((unit) => ({ startSample: unit.targetRange.startSample, endSample: unit.targetRange.endSample, sampleRateHz: timeline.clock.sampleRateHz, basis: "conservative-retained-source-range", timingPrecision: unit.timingPrecision })),
  };
}

function pcm16Wav(sampleCount, sampleRate = 48000) {
  const bytes = Buffer.alloc(44 + sampleCount * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVE", 8);
  bytes.write("fmt ", 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index += 1) bytes.writeInt16LE(Math.round(Math.sin(index * Math.PI * 2 * 440 / sampleRate) * 16000), 44 + index * 2);
  return bytes;
}

test("ASR-cut /2 creates one locked voice asset and source-only conservative music duck windows", async () => {
  const root = path.join(repositoryDir, ".cache", "tmp", "asrcut-integration", "motion", "tests");
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "asrcut-audio-plan-"));
  try {
    const fixture = compilePresentationFixture();
    const plan = structuredClone(fixture.plan);
    const sourceFile = path.join(dir, "source-recording.bin");
    const sourceBytes = Buffer.from("mock source recording bytes for hash/provenance tests");
    await fs.writeFile(sourceFile, sourceBytes);
    plan.sources[0].mediaPath = sourceFile;
    plan.sources[0].sha256 = createHash("sha256").update(sourceBytes).digest("hex");
    plan.sources[0].primaryAudioTrackId = "source-a-primary-audio";
    plan.sources[0].tracks = [{ id: "source-a-primary-audio", kind: "audio", clock: { unit: "sample", sampleRateHz: 48000 }, syncToPrimaryAudio: { status: "primary" } }];
    plan.questions = plan.questions.filter((question) => question.id !== "media-source-not-provided");
    plan.authorization.mediaExport = true;
    plan.integrity.planSha256 = hashPlan(plan);
    const frozenPlan = freezePlan(plan);
    const timeline = compilePlan(frozenPlan);
    const voiceFile = path.join(dir, "voice.wav");
    const voiceWavBytes = pcm16Wav(timeline.durationSamples);
    await fs.writeFile(voiceFile, voiceWavBytes);
    const receipt = asrcutReceiptFixture(frozenPlan, timeline, voiceWavBytes);
    const editPlanPath = path.join(dir, "edit-plan.json");
    const timelinePath = path.join(dir, "timeline.json");
    const receiptPath = voiceFile + ".artifact.json";
    const outputPlanPath = path.join(dir, "audio-plan.json");
    await Promise.all([
      fs.writeFile(editPlanPath, JSON.stringify(frozenPlan)), fs.writeFile(timelinePath, JSON.stringify(timeline)),
      fs.writeFile(receiptPath, JSON.stringify(receipt)),
    ]);
    const basePlan = {
      schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 2.5,
      sampleRate: 48000, channels: 2, events: [], tracks: [{ id: "music-bed", assetId: "future-music", bus: "music", startSec: 0 }],
      voiceWindows: [], automation: [], timeMaps: [], assets: [{
        id: "future-music", file: "not-rendered-in-builder.wav", durationSec: 2.5, sha256: "a".repeat(64),
        license: "project-generated", redistribution: { status: "project-generated", basis: "synthetic builder fixture" }, reviewStatus: "candidate-unreviewed",
      }], generatedAssets: [],
    };
    const audioPlan = await buildAsrcutVoicePlan({
      basePlan, editPlan: frozenPlan, timeline, receipt, voiceFile, outputPlanPath,
      editPlanPath, timelinePath, receiptPath, voiceAssetId: "asrcut-voice", voiceTrackId: "asrcut-voice-track",
    });
    assert.equal(audioPlan.durationSec, 2.5, "the existing film duration is preserved exactly");
    assert.equal(audioPlan.tracks.filter((track) => track.bus === "voice").length, 1, "the single exported WAV is played once, never replayed by source clip");
    assert.deepEqual(audioPlan.tracks.find((track) => track.bus === "voice"), { id: "asrcut-voice-track", assetId: "asrcut-voice", bus: "voice", startSec: 0, locked: true });
    assert.deepEqual(audioPlan.voiceWindows.map(({ id, startSec, endSec, timingPrecision }) => ({ id, startSec, endSec, timingPrecision })), [
      { id: "asrcut-window-speech-a-occurrence", startSec: 0, endSec: 1, timingPrecision: timeline.units[0].timingPrecision },
      { id: "asrcut-window-speech-b-occurrence", startSec: 1.5, endSec: 2.5, timingPrecision: timeline.units[2].timingPrecision },
    ], "the source-free presentation has no voice window, while source timings remain in the compiled target clock");
    assert.deepEqual(audioPlan.asrcutBinding.presentationWindows.map(({ startSample, endSample, audioHandoff }) => ({ startSample, endSample, role: audioHandoff.role })), [
      { startSample: 48000, endSample: 72000, role: "continue-bed" },
    ]);
    assert.equal(audioPlan.asrcutBinding.sourceEvidence[0].transcript.status, "unlocated", "missing raw ASR evidence remains explicitly unlocated");
    await assert.rejects(buildAsrcutVoicePlan({
      basePlan: { ...basePlan, durationSec: 2.6 }, editPlan: frozenPlan, timeline, receipt, voiceFile, outputPlanPath,
      editPlanPath, timelinePath, receiptPath, voiceAssetId: "other-voice", voiceTrackId: "other-voice-track",
    }), /duration is locked/);
    await assert.rejects(buildAsrcutVoicePlan({
      basePlan: { ...basePlan, tracks: [...basePlan.tracks, { id: "existing-voice", assetId: "future-music", bus: "voice", startSec: 0 }] },
      editPlan: frozenPlan, timeline, receipt, voiceFile, outputPlanPath,
      editPlanPath, timelinePath, receiptPath, voiceAssetId: "other-voice", voiceTrackId: "other-voice-track",
    }), /already contains voice playback/);
    if (ffmpegAvailable) {
      const renderPlan = await buildAsrcutVoicePlan({
        editPlan: frozenPlan, timeline, receipt, voiceFile, outputPlanPath,
        editPlanPath, timelinePath, receiptPath, voiceAssetId: "rendered-asrcut-voice", voiceTrackId: "rendered-asrcut-voice-track",
      });
      const renderPlanPath = path.join(dir, "render-plan.json");
      const outputPath = path.join(dir, "rendered-mix.wav");
      const manifestPath = path.join(dir, "rendered-manifest.json");
      await fs.writeFile(renderPlanPath, JSON.stringify(renderPlan));
      const manifest = await renderAudioPlan({
        plan: renderPlanPath, assetIndex: path.join(skillDir, "assets", "audio", "index.json"), output: outputPath,
        manifest: manifestPath, cacheDir: path.join(dir, "render-cache"), ffmpeg, allowCandidate: true,
      });
      assert.equal(manifest.mix.inputCount, 1, "the complete ASR-cut WAV is the only voice input; no source clip is added a second time");
      assert.equal(manifest.tracks.length, 1);
      assert.equal(manifest.asrcutBinding.project.revision, frozenPlan.project.revision);
      assert.equal(wavReader(await fs.readFile(outputPath)).durationSec, 2.5);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("compiled speech anchors drive MotionOps channels and shared event time; moving one token moves both", async () => {
  const root = path.join(repositoryDir, ".cache", "tmp", "asrcut-integration", "motion", "tests");
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "speech-binding-consumer-"));
  try {
    const fakeSource = path.join(dir, "synthetic-recording.bin");
    const fakeSourceBytes = Buffer.from("synthetic timing fixture; not playable media");
    await fs.writeFile(fakeSource, fakeSourceBytes);
    const mediaHash = createHash("sha256").update(fakeSourceBytes).digest("hex");
    const fixtureA = compileFixture({ revision: 1, firstWordStartSec: 0.4, mediaPath: fakeSource, mediaSha256: mediaHash });
    const fixtureB = compileFixture({ revision: 2, firstWordStartSec: 0.7, mediaPath: fakeSource, mediaSha256: mediaHash });
    const timelineA = fixtureA.timeline;
    const timelineB = fixtureB.timeline;
    const specA = baseSpec(timelineA);
    const specB = baseSpec(timelineB);
    const original = await bindSpeechTimeline(baseScene(), timelineA, specA, { plan: fixtureA.plan });
    const moved = await bindSpeechTimeline(baseScene(), timelineB, specB, { plan: fixtureB.plan });

  const originalPhase = original.scene.objects[0].data.phases[0];
  const movedPhase = moved.scene.objects[0].data.phases[0];
    assert.equal(originalPhase.startSec, 0.45, "anchor target sample plus declared sample offset is the consumed phase start");
    assert.equal(movedPhase.startSec, 0.75, "the compiled target range moves the same semantic phase anchor");
    const originalValue = MotionOps.sampleChannels(0.55, originalPhase).channels.x.value;
    const movedValue = MotionOps.sampleChannels(0.55, movedPhase).channels.x.value;
    assert.ok(originalValue > 10, "the original semantic phase has progressed at the probe time");
    assert.equal(movedValue, 10, "MotionOps sees the actual phase as not yet started at the same probe time");
    assert.equal(original.receipt.sourceHashChecks[0].status, "verified");

    const mappedA = MotionOps.mapSceneEvents({ durationSec: 2, events: [{ id: "cue-a", eventId: "question-hit" }] }, original.scene, new Map())[0];
    const mappedB = MotionOps.mapSceneEvents({ durationSec: 2, events: [{ id: "cue-b", eventId: "question-hit" }] }, moved.scene, new Map())[0];
    assert.equal(mappedA.filmTimeSec, 0.5);
    assert.equal(mappedB.filmTimeSec, 0.8);
    assert.equal(mappedA.sourceEvent.phaseId, "question-reveal");
    await fs.writeFile(fakeSource, "changed source bytes");
    await assert.rejects(bindSpeechTimeline(baseScene(), timelineA, specA, { plan: fixtureA.plan }), /SHA-256 changed/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("presentation-boundary anchors drive phases/events without inventing word anchors and require direct-clock review after timeline revision", async () => {
  const { plan, timeline } = compilePresentationFixture();
  const scene = { ...baseScene(), duration: 3 };
  const presentation = timeline.units.find((unit) => unit.kind === "presentation");
  const spec = {
    format: "laohu.motion.speech-bindings/2",
    project: { id: timeline.project.id, revision: timeline.project.revision, planSha256: timeline.planSha256 },
    bindings: [{
      id: "bridge-binding", objectId: "semantic-probe",
      phases: [{ id: "bridge-reveal", anchor: { kind: "presentation", presentationId: presentation.id, edge: "start" }, offset: { value: 0, unit: "samples" }, duration: { value: 12000, unit: "samples" }, curve: "ease-out-cubic", channels: { alpha: { from: 0, to: 1 } } }],
      events: [{ id: "bridge-hit", phaseId: "bridge-reveal", anchor: { kind: "presentation", presentationId: presentation.id, edge: "end" } }],
    }],
    directFilmTimeEventReview: [{ eventId: "legacy-direct-event", action: "retain-absolute", reason: "This event intentionally remains at its independent film-global time." }],
  };
  const missingDirectReview = structuredClone(spec);
  delete missingDirectReview.directFilmTimeEventReview;
  await assert.rejects(bindSpeechTimeline(scene, timeline, missingDirectReview, { plan }), /review every current direct filmTimeSec event by ID/);
  const bound = await bindSpeechTimeline(scene, timeline, spec, { plan });
  const phase = bound.scene.objects[0].data.phases[0];
  assert.equal(phase.startSec, 1);
  assert.deepEqual(phase.speechAnchor, { kind: "presentation", edge: "start", presentationId: presentation.id, targetSample: 48000, timingPrecision: "project-sample-boundary" });
  assert.equal(Object.hasOwn(phase.speechAnchor, "clipOccurrenceId"), false);
  assert.equal(Object.hasOwn(phase.speechAnchor, "tokenIds"), false);
  assert.deepEqual(bound.receipt.anchorMap[0].presentationId, presentation.id);
  const event = MotionOps.mapSceneEvents({ durationSec: 3, events: [{ id: "bridge-cue", eventId: "bridge-hit" }] }, bound.scene, new Map())[0];
  assert.equal(event.filmTimeSec, 1.5, "event resolves to the presentation end boundary on the shared scene clock");
  assert.equal(bound.scene.audioEvents.find((item) => item.id === "legacy-direct-event").filmTimeSec, 1.5, "legacy direct film time stays absolute; it is not shifted automatically");
  assert.equal(bound.receipt.directFilmTimeEventReview.status, "explicitly-reviewed-after-timeline-change");

  const revisedDraft = insertPresentationInterval(plan, {
    id: "second-bridge", decisionId: "second-bridge-decision", reason: "Add a second explicit explanation beat.",
    afterOccurrenceId: plan.sequence[0].occurrenceId, sceneId: "second-bridge-scene", durationSamples: 4800,
    visualHandoff: { focus: "result node", entryState: "result is hidden", exitCondition: "result is visible" },
    audioHandoff: { role: "bed-duck", rationale: "Lower the bed while this short diagram resolves." },
    expectedRevision: plan.project.revision, expectedPlanSha256: hashPlan(plan),
  }, { authorized: true });
  const revisedPlan = freezePlan(revisedDraft);
  const revisedTimeline = compilePlan(revisedPlan);
  const revisedSpec = structuredClone(spec);
  revisedSpec.project = { id: revisedTimeline.project.id, revision: revisedTimeline.project.revision, planSha256: revisedTimeline.planSha256 };
  delete revisedSpec.directFilmTimeEventReview;
  await assert.rejects(bindSpeechTimeline(bound.scene, revisedTimeline, revisedSpec, { plan: revisedPlan }), /review every current direct filmTimeSec event by ID/);
  const remappedScene = structuredClone(bound.scene);
  remappedScene.audioEvents.find((item) => item.id === "legacy-direct-event").filmTimeSec = 2.1;
  const remappedSpec = structuredClone(revisedSpec);
  remappedSpec.directFilmTimeEventReview = [{ eventId: "legacy-direct-event", action: "remapped", reason: "The direct event was moved to the revised timeline's new end emphasis." }];
  const remapped = await bindSpeechTimeline(remappedScene, revisedTimeline, remappedSpec, { plan: revisedPlan });
  assert.equal(remapped.scene.audioEvents.find((item) => item.id === "legacy-direct-event").filmTimeSec, 2.1);
  assert.equal(remapped.receipt.directFilmTimeEventReview.reviewed[0].action, "remapped");
});

test("audio renderer consumes bound shared events and places PCM at the moved semantic target", { skip: !ffmpegAvailable }, async () => {
  const root = path.join(repositoryDir, ".cache", "tmp", "asrcut-integration", "motion", "tests");
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "speech-binding-audio-"));
  try {
    const fakeSource = path.join(dir, "synthetic-recording.bin");
    const fakeSourceBytes = Buffer.from("synthetic timing fixture; not playable media");
    await fs.writeFile(fakeSource, fakeSourceBytes);
    const mediaHash = createHash("sha256").update(fakeSourceBytes).digest("hex");
    const fixtureA = compileFixture({ revision: 1, firstWordStartSec: 0.4, mediaPath: fakeSource, mediaSha256: mediaHash });
    const fixtureB = compileFixture({ revision: 2, firstWordStartSec: 0.7, mediaPath: fakeSource, mediaSha256: mediaHash });
    const original = await bindSpeechTimeline(baseScene(), fixtureA.timeline, baseSpec(fixtureA.timeline), { plan: fixtureA.plan });
    const moved = await bindSpeechTimeline(baseScene(), fixtureB.timeline, baseSpec(fixtureB.timeline), { plan: fixtureB.plan });
    const audioPlan = (name) => ({
      schemaVersion: 1,
      timeUnit: "seconds",
      timeBasis: "film-global",
      durationSec: 2,
      sampleRate: 48000,
      channels: 2,
      events: [{ id: name + "-cue", eventId: "question-hit", assetId: name + "-tone", bus: "sfx", gainDb: -6 }],
      tracks: [],
      generatedAssets: [{ id: name + "-tone", generator: "ffmpeg-lavfi", recipe: { kind: "tone", durationSec: 0.18, frequencyHz: 880, gainDb: -12 } }],
    });
    const assetIndex = path.join(skillDir, "assets", "audio", "index.json");
    const renderOne = async (label, bound) => {
      const scenePath = path.join(dir, label + ".scene.json");
      const planPath = path.join(dir, label + ".audio-plan.json");
      const output = path.join(dir, label + ".wav");
      const manifest = path.join(dir, label + ".audio-manifest.json");
      await fs.writeFile(scenePath, JSON.stringify(bound.scene, null, 2) + "\n");
      await fs.writeFile(planPath, JSON.stringify(audioPlan(label), null, 2) + "\n");
      const audioManifest = await renderAudioPlan({
        plan: planPath,
        scene: scenePath,
        assetIndex,
        output,
        manifest,
        cacheDir: path.join(dir, label + "-cache"),
        ffmpeg,
        allowGeneratedPreview: true,
      });
      return { audioManifest, wav: wavReader(await fs.readFile(output)) };
    };
    const audioA = await renderOne("original", original);
    const audioB = await renderOne("moved", moved);
    assert.equal(audioA.audioManifest.events[0].filmTimeSec, 0.5);
    assert.equal(audioB.audioManifest.events[0].filmTimeSec, 0.8);
    assert.ok(audioA.wav.rms(0.52, 0.59) > 0.05, "actual float PCM contains the original event at its semantic target");
    assert.ok(audioA.wav.rms(0.82, 0.89) < 0.0001, "original render has no cue at the moved target");
    assert.ok(audioB.wav.rms(0.52, 0.59) < 0.0001, "moved render no longer cues at the old target");
    assert.ok(audioB.wav.rms(0.82, 0.89) > 0.05, "actual float PCM follows the recompiled target range");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("binding is revision/hash scoped, fail-closed for deleted tokens, and preserves direct legacy filmTimeSec events", async () => {
  const fixture = compileFixture();
  const { timeline, plan } = fixture;
  const spec = baseSpec(timeline);
  const bound = await bindSpeechTimeline(baseScene(), timeline, spec, { plan });
  assert.equal(bound.scene.audioEvents[0].id, "legacy-direct-event");
  assert.equal(MotionOps.findSceneAudioEvents(bound.scene).get("legacy-direct-event").timeSec, 1.5);
  assert.equal(bound.receipt.timeline.planSha256, timeline.planSha256);
  await assert.rejects(bindSpeechTimeline(baseScene(), timeline, {
    ...spec,
    project: { ...spec.project, revision: 7 },
  }, { plan }), /does not match/);
  const deleted = baseSpec(timeline, {
    anchor: { kind: "point", clipOccurrenceId: timeline.clips[0].occurrenceId, tokenId: "deleted-token", edge: "start" },
  });
  await assert.rejects(bindSpeechTimeline(baseScene(), timeline, deleted, { plan }), /missing\/deleted/);
  const tamperedTimeline = structuredClone(timeline);
  tamperedTimeline.clips[0].words[0].targetRange.startSample += 1;
  await assert.rejects(bindSpeechTimeline(baseScene(), tamperedTimeline, spec, { plan }), /does not exactly match/);
  const repeated = await bindSpeechTimeline(bound.scene, timeline, spec, { plan });
  assert.equal(repeated.scene.objects[0].data.phases.filter((phase) => phase.id === "question-reveal").length, 1, "rebind replaces only the previous binder-owned phase");
  assert.equal(repeated.scene.audioEvents.filter((event) => event.id === "question-hit").length, 1, "rebind does not duplicate the previous binder-owned cue");
  assert.equal(repeated.scene.audioEvents.find((event) => event.id === "legacy-direct-event").filmTimeSec, 1.5);
});

test("prepares a 2.25-second sample timeline as 68 whole motion frames without moving sample anchors", async () => {
  const { timeline, plan } = compilePresentationFixture(12000);
  assert.equal(timeline.durationSamples, 108000);
  assert.equal(timeline.clock.sampleRateHz, 48000);
  const scene = baseScene();
  scene.duration = 2.25;
  scene.audioEvents = [];
  const prepared = prepareSceneForTimeline(scene, timeline);
  assert.equal(prepared.scene.duration, 68 / 30);
  assert.equal(prepared.frameCount, 68);
  assert.equal(prepared.coverage.timeline.durationSamples, 108000);
  assert.equal(prepared.coverage.frameClock.requiredFrameCount, 68);
  assert.equal(prepared.coverage.frameClock.timelineCoverageOverhangFrames, 0.5);
  assert.equal(scene.duration, 2.25, "preparation leaves the caller's scene object untouched");

  const bound = await bindSpeechTimeline(scene, timeline, baseSpec(timeline), { plan });
  assert.equal(bound.scene.duration, 68 / 30);
  assert.equal(bound.receipt.timeline.durationSamples, 108000);
  assert.equal(bound.receipt.frameCoverage.frameClock.frameCount, 68);
  assert.equal(bound.receipt.anchorMap[0].anchorTargetSample, timeline.clips[0].words[0].targetRange.startSample);
  assert.equal(timeline.durationSamples, 108000, "frame coverage does not quantize the source audio clock");

  const mediaRoot = path.join(repositoryDir, ".cache", "tmp", "asrcut-integration", "motion", "tests");
  await fs.mkdir(mediaRoot, { recursive: true });
  const dir = await fs.mkdtemp(path.join(mediaRoot, "frame-coverage-audio-clock-"));
  try {
    const sourcePath = path.join(dir, "source.wav");
    const sourceBytes = pcm16Wav(96000);
    await fs.writeFile(sourcePath, sourceBytes);
    const exportPlan = structuredClone(plan);
    exportPlan.sources[0].mediaPath = sourcePath;
    exportPlan.sources[0].sha256 = createHash("sha256").update(sourceBytes).digest("hex");
    exportPlan.sources[0].primaryAudioTrackId = "source-a-primary-audio";
    exportPlan.sources[0].tracks = [{ id: "source-a-primary-audio", kind: "audio", clock: { unit: "sample", sampleRateHz: 48000 }, syncToPrimaryAudio: { status: "primary" } }];
    exportPlan.questions = exportPlan.questions.filter((question) => question.id !== "media-source-not-provided");
    exportPlan.authorization.mediaExport = true;
    exportPlan.project.revision += 1;
    exportPlan.state = "draft";
    exportPlan.review = { status: "not_requested" };
    exportPlan.integrity.planSha256 = hashPlan(exportPlan);
    const frozenForReview = freezePlan(exportPlan);
    const frozenExportPlan = authorizeReview(frozenForReview, "approved", hashPlan(frozenForReview));
    const exportTimeline = compilePlan(frozenExportPlan);
    const audioPath = path.join(dir, "presentation.wav");
    const exported = await exportAudio({
      plan: frozenExportPlan,
      timeline: exportTimeline,
      outPath: audioPath,
      tmpDir: path.join(dir, "tmp"),
      ffmpegPath: process.env.FFMPEG_PATH || ffmpeg,
      ffprobePath: process.env.FFPROBE_PATH || "ffprobe",
    });
    assert.equal(exported.receiptData.sampleRateHz, 48000);
    assert.equal(exported.receiptData.sampleCount, 108000, "exact PCM export retains source samples plus the authored 12000-sample presentation interval");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }

  assert.throws(() => prepareSceneForTimeline(scene, timeline, { lockedFrameCount: 67 }), /shorter than the 68 frames required/);
  const locked = prepareSceneForTimeline(scene, timeline, { lockedFrameCount: 68 });
  assert.equal(locked.scene.duration, 68 / 30);
});

test("timeline/1 binding preserves its original whole-frame and sufficient-scene-duration requirements", async () => {
  const { timeline, plan } = compileFixture();
  const scene = baseScene();
  const bound = await bindSpeechTimeline(scene, timeline, baseSpec(timeline), { plan });
  assert.equal(bound.scene.duration, scene.duration);
  assert.equal(Object.hasOwn(bound.scene, "motionTimelineCoverage"), false);
  assert.equal(Object.hasOwn(bound.receipt, "frameCoverage"), false);

  const short = { ...baseScene(), duration: 1.5 };
  await assert.rejects(bindSpeechTimeline(short, timeline, baseSpec(timeline), { plan }), /scene.duration is shorter than the compiled timeline/);
  const fractional = { ...baseScene(), duration: 2.01 };
  await assert.rejects(bindSpeechTimeline(fractional, timeline, baseSpec(timeline), { plan }), /duration × fps must resolve to a whole frame count/);
  assert.throws(() => prepareSceneForTimeline(scene, timeline), /available only for timeline\/2/);
  await assert.rejects(bindSpeechTimeline(scene, timeline, baseSpec(timeline), { plan, lockedFrameCount: 60 }), /lockedFrameCount applies only to timeline\/2/);
});

test("SRT segment anchors remain low precision and require an explicit coarse-cue choice", async () => {
  const { timeline, plan } = compileFixture({ srt: true });
  const spec = baseSpec(timeline, {
    anchor: { kind: "segment", clipOccurrenceId: timeline.clips[0].occurrenceId, segmentId: timeline.clips[0].transcriptSegments[0].segmentId, edge: "start" },
  });
  await assert.rejects(bindSpeechTimeline(baseScene(), timeline, spec, { plan }), /utterance timing/);
  spec.bindings[0].allowLowPrecision = true;
  const result = await bindSpeechTimeline(baseScene(), timeline, spec, { plan });
  assert.equal(result.receipt.anchorMap[0].timingPrecision, "utterance");
  assert.equal(result.receipt.anchorMap[0].segmentId, timeline.clips[0].transcriptSegments[0].segmentId);
  assert.equal(result.scene.objects[0].data.phases[0].speechAnchor.timingPrecision, "utterance");
});

test("draft timelines require preview; unsupported frame offsets and sample-clock mismatches are rejected", async () => {
  const { timeline, plan } = compileFixture();
  const frames = baseSpec(timeline);
  frames.bindings[0].phases[0].offset = { value: 1, unit: "frames" };
  await assert.rejects(bindSpeechTimeline(baseScene(), timeline, frames, { plan }), /samples or seconds/);
  const badRate = structuredClone(timeline);
  badRate.clips[0].words[0].targetRange.sampleRateHz = 44100;
  await assert.rejects(bindSpeechTimeline(baseScene(), badRate, baseSpec(badRate), { plan }), /does not match timeline.clock/);
  const draftPlan = structuredClone(plan);
  draftPlan.state = "draft";
  draftPlan.integrity.planSha256 = hashPlan(draftPlan);
  const draftTimeline = compilePlan(draftPlan);
  const draftSpec = baseSpec(draftTimeline);
  await assert.rejects(bindSpeechTimeline(baseScene(), draftTimeline, draftSpec, { plan: draftPlan }), /requires explicit preview/);
  const preview = await bindSpeechTimeline(baseScene(), draftTimeline, draftSpec, { plan: draftPlan, preview: true });
  assert.equal(preview.receipt.preview, true);
  assert.equal(preview.receipt.timeline.state, "draft");
});

test("raw ASR evidence is rehashed for binding; changed and missing evidence are rejected", async () => {
  const root = path.join(repositoryDir, ".cache", "tmp", "asrcut-integration", "motion", "tests");
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "speech-binding-asr-evidence-"));
  const evidencePath = path.join(dir, "asr.json");
  try {
    const evidenceBytes = Buffer.from(JSON.stringify(rawAsrFixture()));
    await fs.writeFile(evidencePath, evidenceBytes);
    const evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex");
    const fixture = compileFixture({ evidenceRef: evidencePath, transcriptSha256: evidenceSha256 });
    const bound = await bindSpeechTimeline(baseScene(), fixture.timeline, baseSpec(fixture.timeline), { plan: fixture.plan });
    assert.deepEqual(bound.receipt.transcriptEvidenceChecks, {
      verified: [{ sourceId: "source-a", status: "verified", sha256: evidenceSha256 }],
      unlocated: [],
    });
    assert.deepEqual(fixture.timeline.sources[0].transcript, {
      sha256: evidenceSha256,
      evidenceRef: evidencePath,
      evidenceHashMode: "raw-bytes",
    });

    await fs.writeFile(evidencePath, Buffer.from(JSON.stringify(rawAsrFixture(0.5))));
    await assert.rejects(
      bindSpeechTimeline(baseScene(), fixture.timeline, baseSpec(fixture.timeline), { plan: fixture.plan }),
      /transcript evidence hash no longer matches/,
    );
    await fs.rm(evidencePath);
    await assert.rejects(
      bindSpeechTimeline(baseScene(), fixture.timeline, baseSpec(fixture.timeline), { plan: fixture.plan }),
      /transcript evidence cannot be read/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("plans without a transcript evidenceRef are marked unlocated rather than verified", async () => {
  const { timeline, plan } = compileFixture();
  const bound = await bindSpeechTimeline(baseScene(), timeline, baseSpec(timeline), { plan });
  assert.deepEqual(bound.receipt.transcriptEvidenceChecks, {
    verified: [],
    unlocated: [{ sourceId: "source-a", status: "unlocated", sha256: timeline.sources[0].transcript.sha256, reason: "no-evidence-ref" }],
  });
  assert.equal(timeline.sources[0].transcript.evidenceRef, null);
});

test("CLI refuses --overwrite targets that alias direct, symlink, or hardlink media and transcript evidence inputs", async () => {
  const root = path.join(repositoryDir, ".cache", "tmp", "asrcut-integration", "motion", "tests");
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "speech-binding-output-safety-"));
  try {
    const mediaPath = path.join(dir, "recording.bin");
    const evidencePath = path.join(dir, "source-asr.json");
    const mediaBytes = Buffer.from("source media must never be replaced by a scene output");
    const evidenceBytes = Buffer.from(JSON.stringify(rawAsrFixture()));
    await fs.writeFile(mediaPath, mediaBytes);
    await fs.writeFile(evidencePath, evidenceBytes);
    const fixture = compileFixture({
      mediaPath,
      mediaSha256: createHash("sha256").update(mediaBytes).digest("hex"),
      evidenceRef: evidencePath,
      transcriptSha256: createHash("sha256").update(evidenceBytes).digest("hex"),
    });
    const scenePath = path.join(dir, "scene.json");
    const timelinePath = path.join(dir, "timeline.json");
    const planPath = path.join(dir, "edit-plan.json");
    const bindingsPath = path.join(dir, "bindings.json");
    await fs.writeFile(scenePath, JSON.stringify(baseScene()));
    await fs.writeFile(timelinePath, JSON.stringify(fixture.timeline));
    await fs.writeFile(planPath, JSON.stringify(fixture.plan));
    await fs.writeFile(bindingsPath, JSON.stringify(baseSpec(fixture.timeline)));
    const binderPath = path.join(skillDir, "scripts", "bind-speech.mjs");
    const attempt = (outPath) => spawnSync(process.execPath, [
      binderPath,
      "--scene", scenePath,
      "--timeline", timelinePath,
      "--bindings", bindingsPath,
      "--plan", planPath,
      "--out", outPath,
      "--overwrite",
    ], { encoding: "utf8" });
    const assertRefused = (outPath) => {
      const result = attempt(outPath);
      assert.notEqual(result.status, 0, `binder must refuse an alias to source input: ${outPath}`);
      assert.match(result.stderr, /Output path aliases an input/);
    };

    assertRefused(mediaPath);
    const symlinkPath = path.join(dir, "recording-symlink.bin");
    await fs.symlink(mediaPath, symlinkPath);
    assertRefused(symlinkPath);
    assert.equal((await fs.lstat(symlinkPath)).isSymbolicLink(), true, "rejected alias must remain a symlink");
    const hardlinkPath = path.join(dir, "recording-hardlink.bin");
    await fs.link(mediaPath, hardlinkPath);
    assertRefused(hardlinkPath);
    const mediaIdentity = await fs.stat(mediaPath);
    const hardlinkIdentity = await fs.stat(hardlinkPath);
    assert.equal(hardlinkIdentity.dev, mediaIdentity.dev);
    assert.equal(hardlinkIdentity.ino, mediaIdentity.ino, "rejected alias must remain the same source inode");
    assertRefused(evidencePath);
    assert.deepEqual(await fs.readFile(mediaPath), mediaBytes);
    assert.deepEqual(await fs.readFile(evidencePath), evidenceBytes);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
