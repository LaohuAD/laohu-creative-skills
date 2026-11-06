import assert from "node:assert/strict";
import test from "node:test";
import { compileFilmSchedule, projectFilmEvents, validateMotionSceneForSegment } from "../templates/adapters/huashu-om.mjs";

const format = "laohu.huashu-film-blueprint/1";
const dimensions = { width: 1920, height: 1080, fps: 30 };
const motionSegment = (id, startSec, endSec) => ({ id, renderer: "motion-scene", scenePath: id + ".json", sceneSha256: "a".repeat(64), startSec, endSec });

test("film-global ranges independently ceil absolute boundaries without gaps or drift", () => {
  const blueprint = {
    format,
    ...dimensions,
    clock: { kind: "film-global", durationSec: 2.03 },
    segments: [motionSegment("opening", 0, 0.511), motionSegment("detail", 0.511, 2.03)],
  };
  const schedule = compileFilmSchedule(blueprint);
  assert.deepEqual(schedule.segments.map((row) => row.frameRange), [
    { startFrame: 0, endFrame: 16 },
    { startFrame: 16, endFrame: 61 },
  ]);
  assert.equal(schedule.totalFrameCount, 61);
  assert.equal(schedule.segments.reduce((total, row) => total + row.frameCount, 0), 61);
  assert.equal(schedule.segments[1].exactStartSec, 0.511);
  assert.ok(Math.abs(schedule.segments[1].frameStartResidualSec - (16 / 30 - 0.511)) < 1e-12);
  assert.ok(schedule.segments[1].roundingResidualSamples > 0);
});

test("film-global clock rejects gaps, overlaps, zero-frame segments, and mixed clock fields", () => {
  const base = {
    format,
    ...dimensions,
    clock: { kind: "film-global", durationSec: 1 },
    segments: [motionSegment("one", 0, 0.5), motionSegment("two", 0.5, 1)],
  };
  assert.throws(() => compileFilmSchedule({ ...base, segments: [motionSegment("one", 0, 0.49), motionSegment("two", 0.5, 1)] }), /uncovered gap/);
  assert.throws(() => compileFilmSchedule({ ...base, segments: [motionSegment("one", 0, 0.6), motionSegment("two", 0.5, 1)] }), /overlap or are out of order/);
  assert.throws(() => compileFilmSchedule({ ...base, segments: [motionSegment("one", 0, 0.001), motionSegment("two", 0.001, 0.002), motionSegment("three", 0.002, 1)] }), /collapses to zero frames/);
  assert.throws(() => compileFilmSchedule({ ...base, segments: [{ ...base.segments[0], unitIds: ["not-allowed"] }, base.segments[1]] }), /must not supply unitIds/);
});

test("asrcut-v2 compiles ordered source and presentation units on their sample clock", () => {
  const timeline = {
    format: "laohu.asrcut.timeline/2",
    state: "frozen",
    durationSamples: 96000,
    clock: { unit: "sample", sampleRateHz: 48000 },
    units: [
      { kind: "source", occurrenceId: "occurrence-a", targetRange: { startSample: 0, endSample: 48000, sampleRateHz: 48000 } },
      { kind: "presentation", id: "presentation-hold", targetRange: { startSample: 48000, endSample: 60000, sampleRateHz: 48000 } },
      { kind: "source", occurrenceId: "occurrence-b", targetRange: { startSample: 60000, endSample: 96000, sampleRateHz: 48000 } },
    ],
  };
  const blueprint = {
    format,
    ...dimensions,
    clock: { kind: "asrcut-v2", timelinePath: "timeline.json", timelineSha256: "b".repeat(64), editPlanPath: "plan.json", editPlanSha256: "c".repeat(64) },
    segments: [
      { id: "source-run", renderer: "motion-scene", scenePath: "a.json", sceneSha256: "d".repeat(64), unitIds: ["occurrence-a", "presentation-hold"] },
      { id: "last-source", renderer: "motion-scene", scenePath: "b.json", sceneSha256: "e".repeat(64), unitIds: ["occurrence-b"] },
    ],
  };
  const schedule = compileFilmSchedule(blueprint, timeline);
  assert.deepEqual(schedule.segments.map((row) => row.frameRange), [
    { startFrame: 0, endFrame: 38 },
    { startFrame: 38, endFrame: 60 },
  ]);
  assert.deepEqual(schedule.segments[0].unitIds, ["occurrence-a", "presentation-hold"]);
  assert.deepEqual(schedule.segments[0].sourceRange, { startSample: 0, endSample: 60000, sampleRateHz: 48000 });
  assert.equal(schedule.segments[1].exactStartSec, 1.25);
  assert.equal(schedule.segments[1].speed, (22 / 30) / 0.75);
  assert.equal(schedule.totalFrameCount, 60);
});

test("asrcut-v2 rejects reordering, missing units, time overrides, gaps, and duplicate unit identities", () => {
  const timeline = {
    format: "laohu.asrcut.timeline/2",
    state: "frozen",
    durationSamples: 96000,
    clock: { unit: "sample", sampleRateHz: 48000 },
    units: [
      { kind: "source", occurrenceId: "occurrence-a", targetRange: { startSample: 0, endSample: 48000, sampleRateHz: 48000 } },
      { kind: "presentation", id: "presentation-hold", targetRange: { startSample: 48000, endSample: 60000, sampleRateHz: 48000 } },
      { kind: "source", occurrenceId: "occurrence-b", targetRange: { startSample: 61000, endSample: 96000, sampleRateHz: 48000 } },
    ],
  };
  const base = {
    format,
    ...dimensions,
    clock: { kind: "asrcut-v2" },
    segments: [
      { id: "one", renderer: "motion-scene", scenePath: "a.json", sceneSha256: "a".repeat(64), unitIds: ["occurrence-a", "presentation-hold"] },
      { id: "two", renderer: "motion-scene", scenePath: "b.json", sceneSha256: "b".repeat(64), unitIds: ["occurrence-b"] },
    ],
  };
  assert.throws(() => compileFilmSchedule({ ...base, segments: [{ ...base.segments[0], unitIds: ["presentation-hold", "occurrence-a"] }, base.segments[1]] }, timeline), /consecutive timeline.units/);
  assert.throws(() => compileFilmSchedule({ ...base, segments: [base.segments[0]] }, timeline), /cover each frozen timeline unit exactly once/);
  assert.throws(() => compileFilmSchedule({ ...base, segments: [{ ...base.segments[0], startSec: 0 }, base.segments[1]] }, timeline), /must not supply startSec\/endSec/);
  assert.throws(() => compileFilmSchedule(base, timeline), /preceding frozen unit boundary/);
  const duplicate = structuredClone(timeline);
  duplicate.units[1].id = "occurrence-a";
  assert.throws(() => compileFilmSchedule(base, duplicate), /ambiguous across source occurrences and presentation IDs/);
});

test("assembler limits the first native mixed-runtime closure to its verified common output mode", () => {
  const blueprint = {
    format,
    width: 1920,
    height: 1080,
    fps: 24,
    clock: { kind: "film-global", durationSec: 1 },
    segments: [motionSegment("one", 0, 1)],
  };
  assert.throws(() => compileFilmSchedule(blueprint), /30 fps only/);
});

test("event projection preserves source basis and phase IDs while mapping local events through one segment clock", () => {
  const blueprint = {
    format,
    ...dimensions,
    clock: { kind: "film-global", durationSec: 1 },
    segments: [motionSegment("scene-a", 0, 1)],
  };
  const schedule = compileFilmSchedule(blueprint);
  const sourceScene = {
    version: 1,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 1,
    timeBasis: "scene-local",
    phases: [{ id: "reveal", startSec: 0.25, durationSec: 0.3, timeBasis: "scene-local" }],
    audioEvents: [
      { id: "local-hit", phaseId: "reveal", phaseOffsetSec: 0.05 },
      { id: "film-hit", filmTimeSec: 0.8 },
    ],
  };
  const sourceBySegment = new Map([["scene-a", {
    file: "/fixture/source-scene.json",
    sha256: "f".repeat(64),
    scene: sourceScene,
    localDurationSec: 1,
  }]]);
  const projection = projectFilmEvents(schedule, sourceBySegment, "/fixture/film-manifest.json");
  assert.equal(projection.compiledScene.timeBasis, "film-global");
  assert.deepEqual(projection.compiledScene.phases.map((phase) => phase.id), ["reveal"]);
  assert.deepEqual(projection.compiledScene.audioEvents.map((event) => [event.id, event.timeBasis, event.phaseId || null]), [
    ["local-hit", "scene-local", "reveal"],
    ["film-hit", "film-global", null],
  ]);
  assert.equal(projection.audioTimeMaps.length, 1);
  assert.equal(projection.audioTimeMaps[0].segmentId, "scene-a");
  assert.equal(projection.audioTimeMaps[0].filmStartSec, 0);
  assert.equal(projection.audioTimeMaps[0].speed, 1);
  const localBinding = projection.audioEventBindings.find((row) => row.eventId === "local-hit");
  const filmBinding = projection.audioEventBindings.find((row) => row.eventId === "film-hit");
  assert.equal(localBinding.sourceEventId, "local-hit");
  assert.equal(localBinding.sourcePhaseId, "reveal");
  assert.equal(localBinding.compiledPhaseId, "reveal");
  assert.equal(localBinding.sourceTimeBasis, "scene-local");
  assert.equal(localBinding.timeMapId, "time:scene-a");
  assert.equal(filmBinding.sourceTimeBasis, "film-global");
  assert.equal(filmBinding.timeMapId, null);
  assert.equal(projection.sourceScenes[0].sha256, "f".repeat(64));
});

test("local event maps use the rendered frame-aligned duration and reject cues beyond that clip", () => {
  const blueprint = {
    format,
    ...dimensions,
    clock: { kind: "film-global", durationSec: 1.01 },
    segments: [motionSegment("rounded", 0, 1.01)],
  };
  const schedule = compileFilmSchedule(blueprint);
  const scene = {
    version: 1,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 3,
    timeBasis: "scene-local",
    audioEvents: [{ id: "within-output", timeSec: 0.8, timeBasis: "scene-local" }],
  };
  const sourceBySegment = new Map([ ["rounded", {
    file: "/fixture/source-scene.json",
    sha256: "a".repeat(64),
    scene,
    localDurationSec: scene.duration,
  }] ]);
  const projection = projectFilmEvents(schedule, sourceBySegment, "/fixture/film-manifest.json");
  const map = projection.audioTimeMaps[0];
  assert.equal(map.localEndSec, 31 / 30);
  assert.equal(map.speed, (31 / 30) / 1.01);

  const lateScene = { ...scene, audioEvents: [{ id: "past-clip", timeSec: 1.1, timeBasis: "scene-local" }] };
  assert.throws(() => projectFilmEvents(schedule, new Map([ ["rounded", { ...sourceBySegment.get("rounded"), scene: lateScene }] ]), "/fixture/film-manifest.json"), /outside the rendered local duration/);

  const beyondSource = { ...scene, duration: 0.9, audioEvents: [{ id: "past-source", timeSec: 0.95, timeBasis: "scene-local" }] };
  assert.throws(() => projectFilmEvents(schedule, new Map([ ["rounded", { ...sourceBySegment.get("rounded"), scene: beyondSource, localDurationSec: 0.9 }] ]), "/fixture/film-manifest.json"), /outside the rendered local duration/);
});

test("Motion source scenes keep their duration and must already compile to the segment frame count", () => {
  const blueprint = {
    format,
    ...dimensions,
    clock: { kind: "film-global", durationSec: 1.01 },
    segments: [motionSegment("rounded", 0, 1.01)],
  };
  const [item] = compileFilmSchedule(blueprint).segments;
  const quantizedScene = {
    version: 1, width: 1920, height: 1080, fps: 30, duration: 1.02, timeBasis: "scene-local",
    phases: [{ id: "reveal", startSec: 0.2, durationSec: 0.3, timeBasis: "scene-local" }],
    audioEvents: [{ id: "reveal-hit", phaseId: "reveal", timeBasis: "scene-local", phaseOffsetSec: 0.05 }],
  };
  assert.equal(Math.round(quantizedScene.duration * item.fps), item.frameCount);
  assert.equal(validateMotionSceneForSegment(quantizedScene, item), quantizedScene.duration);
  assert.equal(quantizedScene.duration, 1.02, "validation must not mutate the source scene duration");

  const incompatible = { ...quantizedScene, duration: 3 };
  assert.throws(() => validateMotionSceneForSegment(incompatible, item), /must already compile to the segment's 31 output frames/);
});

test("Motion scenes reject a late local event or referenced phase instead of silently clipping it", () => {
  const blueprint = {
    format,
    ...dimensions,
    clock: { kind: "film-global", durationSec: 1.01 },
    segments: [motionSegment("rounded", 0, 1.01)],
  };
  const [item] = compileFilmSchedule(blueprint).segments;
  const lateEventScene = {
    version: 1, width: 1920, height: 1080, fps: 30, duration: 1.02, timeBasis: "scene-local",
    audioEvents: [{ id: "late-cue", timeSec: 1.04, timeBasis: "scene-local" }],
  };
  assert.throws(() => validateMotionSceneForSegment(lateEventScene, item), /scene-local event late-cue falls outside/);

  const latePhaseScene = {
    version: 1, width: 1920, height: 1080, fps: 30, duration: 1.02, timeBasis: "scene-local",
    phases: [{ id: "late-phase", startSec: 0.9, durationSec: 0.2, timeBasis: "scene-local" }],
    audioEvents: [{ id: "phase-cue", phaseId: "late-phase", timeBasis: "scene-local" }],
  };
  assert.throws(() => validateMotionSceneForSegment(latePhaseScene, item), /scene-local phase late-phase falls outside/);

  const inheritedLatePhase = {
    ...latePhaseScene,
    timeBasis: "film-global",
    phases: [{ id: "late-phase", startSec: 0.9, durationSec: 0.2 }],
  };
  assert.throws(() => validateMotionSceneForSegment(inheritedLatePhase, item), /scene-local phase late-phase falls outside/);
});

test("event projection fails closed on duplicate film IDs and missing time-basis declarations", () => {
  const blueprint = {
    format,
    ...dimensions,
    clock: { kind: "film-global", durationSec: 2 },
    segments: [motionSegment("a", 0, 1), motionSegment("b", 1, 2)],
  };
  const schedule = compileFilmSchedule(blueprint);
  const scene = (audioEvents, timeBasis = "scene-local") => ({
    version: 1, width: 1920, height: 1080, fps: 30, duration: 1, timeBasis, audioEvents,
  });
  const source = (id, value) => [id, { file: "/fixture/" + id + ".json", sha256: "a".repeat(64), scene: value, localDurationSec: 1 }];
  assert.throws(() => projectFilmEvents(schedule, new Map([
    source("a", scene([{ id: "duplicate", timeSec: 0.2 }])) ,
    source("b", scene([{ id: "duplicate", timeSec: 0.3 }])),
  ]), "/fixture/manifest.json"), /unique across the whole film/);
  assert.throws(() => projectFilmEvents(compileFilmSchedule({ ...blueprint, segments: [motionSegment("a", 0, 2)] }), new Map([
    source("a", scene([{ id: "unknown-basis", timeSec: 0.2 }], null)),
  ]), "/fixture/manifest.json"), /unknown timeBasis/);
});
