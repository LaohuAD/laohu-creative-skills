import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { applyNativeOmSourceCueBindings, buildNativeClipFilmSpec, buildNativeOmFilmSpec, compileFilmSchedule, projectFilmEvents, resolveFilmTransitions, validateMotionSceneForSegment } from "../templates/adapters/laohu-film.mjs";

const format = "laohu.huashu-film-blueprint/1";
const dimensions = { width: 1920, height: 1080, fps: 30 };
const motionSegment = (id, startSec, endSec) => ({ id, renderer: "motion-scene", scenePath: id + ".json", sceneSha256: "a".repeat(64), startSec, endSec });
const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceLedger = JSON.parse(fsSync.readFileSync(path.join(skillDir, "templates/maintenance/source-ledger.json"), "utf8"));
const sourceRoot = process.env.MOTION_SOURCE_ROOT ? path.resolve(process.env.MOTION_SOURCE_ROOT) : null;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function sourcePin(relativePath) {
  const source = sourceLedger.sources.find((row) => row.id === "huashu-motion");
  const pin = source?.files?.find((row) => row.path === relativePath);
  assert.ok(source && pin, `maintenance source ledger must pin huashu-motion/${relativePath}`);
  return pin;
}
function sourceSkipReason(relativePaths) {
  if (!sourceRoot) return "MOTION_SOURCE_ROOT is unset; source cue comparison skipped";
  const missing = relativePaths.find((relativePath) => !fsSync.existsSync(path.join(sourceRoot, "huashu-motion", relativePath)));
  return missing ? `MOTION_SOURCE_ROOT is missing huashu-motion/${missing}; source cue comparison skipped` : false;
}
function readPinnedSource(relativePath) {
  const bytes = fsSync.readFileSync(path.join(sourceRoot, "huashu-motion", relativePath));
  assert.equal(sha256(bytes), sourcePin(relativePath).sha256, `huashu-motion/${relativePath} must match maintenance source-ledger SHA-256`);
  return bytes;
}

test("native clip film wrapper preserves the original grammar/data/cues timing contract", () => {
  const catalog = { templates: [{ id: "laohu-motion-y3-whiteboard", aliases: ["huashu-y3-whiteboard"], grammar: "y3_whiteboard", renderer: "native-clip", availability: "available", sourceId: "huashu-art-motion" }] };
  const sourceFields = {
    data: { title: "source fact", points: [{ x: 10, y: 20 }] },
    cues: [{ at: 0.4, kind: "point", text: "kept from the native grammar" }],
    theme: "chalk",
    duration: 1,
  };
  const spec = buildNativeClipFilmSpec({ templateId: "huashu-y3-whiteboard", variables: sourceFields }, 1, catalog);
  assert.equal(spec.grammar, "y3_whiteboard");
  assert.equal(spec.duration, 1);
  assert.equal(spec.fps, 30);
  assert.deepEqual(spec.data, sourceFields.data);
  assert.deepEqual(spec.cues, sourceFields.cues);
  assert.equal(spec.format, undefined);
  assert.equal(spec.templateId, undefined);
  assert.equal(spec.variables, undefined);
  assert.throws(() => buildNativeClipFilmSpec({ templateId: "laohu-motion-y3-whiteboard", variables: sourceFields }, 2, catalog), /must match the compiled body duration/);
  const sourceCue = { at: 0.25, kind: "point", text: "body cue", data: { keep: "exact", hit: 0.4 } };
  const noHandles = buildNativeClipFilmSpec({ templateId: "huashu-y3-whiteboard", variables: { data: { keep: true }, cues: [sourceCue] } }, 1, catalog, { bodyDurationSec: 1 });
  assert.equal(noHandles.cues[0].at, sourceCue.at);
  assert.deepEqual(noHandles.data, { keep: true });
  assert.deepEqual(noHandles.cues[0], sourceCue, "source cue timestamps and nested data stay byte-for-byte equivalent after JSON normalization");
  assert.throws(() => buildNativeClipFilmSpec({ templateId: "huashu-y3-whiteboard", variables: { cues: [{ at: 0.99, kind: "point" }] } }, 1.1, catalog, { tailHandleFrames: 3, bodyDurationSec: 1 }), /cannot be extended with transition handles/);
  assert.throws(() => buildNativeClipFilmSpec({ templateId: "huashu-y3-whiteboard", variables: { cues: [{ at: 1, kind: "point" }] } }, 1, catalog), /half-open body end/);
  assert.throws(() => buildNativeClipFilmSpec({ templateId: "unindexed", variables: {} }, 1, catalog), /must resolve to a catalogued native-clip grammar/);
});

test("full OM Film spec preserves source controls, word cues, source score, and rejects handles", () => {
  const catalog = { templates: [{ id: "laohu-motion-whiteboard", aliases: [], sourceId: "huashu-motion", sourcePath: "templates/whiteboard/index.html", renderer: "native-om-template-source", availability: "conditional" }] };
  const omCues = { words: [{ word: "海量", start: 0.25, end: 0.42 }] };
  const omScore = "X:1\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\nV:lead inst=piano\nC D E F |";
  const sourceCueBindings = [{ cueIndex: 1, kind: "point", sourceWord: "海量", word: "上下文", sfx: false }];
  const omMusic = { off: true };
  const sourceVariables = { title: "一个事实", point1: "海量文字", duration: 10, pace: 1 };
  const spec = buildNativeOmFilmSpec({ templateId: "laohu-motion-whiteboard", variables: sourceVariables, omCues, omScore, omMusic, sourceCueBindings }, 10, 30, catalog);
  assert.equal(spec.format, "laohu.huashu-native-template-spec/1");
  assert.equal(spec.templateId, "laohu-motion-whiteboard");
  assert.deepEqual(spec.variables, sourceVariables);
  assert.deepEqual(spec.omCues, omCues);
  assert.equal(spec.omScore, omScore);
  assert.deepEqual(spec.omMusic, omMusic);
  assert.deepEqual(spec.sourceCueBindings, sourceCueBindings);
  const pacedVariables = { ...sourceVariables, pace: 1.5 };
  const pacedSpec = buildNativeOmFilmSpec({ templateId: "laohu-motion-whiteboard", variables: pacedVariables }, 15, 30, catalog);
  assert.deepEqual(pacedSpec.variables, pacedVariables, "Film duration must not overwrite original source duration or pace controls");
  assert.throws(() => buildNativeOmFilmSpec({ templateId: "laohu-motion-whiteboard", variables: sourceVariables }, 10, 30, catalog, { headHandleFrames: 1 }), /cannot declare transition handles/);
  assert.throws(() => buildNativeOmFilmSpec({ templateId: "laohu-motion-whiteboard", variables: sourceVariables, omMusic: { style: "ambient" } }, 10, 30, catalog), /only \{ off: true \}/);
  assert.throws(() => buildNativeOmFilmSpec({ templateId: "laohu-motion-whiteboard", variables: sourceVariables, sourceCueBindings: [{ cueIndex: 1, kind: "point", sourceWord: "海量" }] }, 10, 30, catalog), /must change a manuscript word anchor or an original cue\.sfx/);
});

test("native OM source cue binding edits only selected original clip-spec fields and rejects templates without them", { skip: sourceSkipReason(["templates/whiteboard/index.html", "templates/talking-head/index.html"]) }, async () => {
  const html = readPinnedSource("templates/whiteboard/index.html").toString("utf8");
  const tag = /<script\b(?=[^>]*\bid\s*=\s*["']clip-spec["'])[^>]*>([\s\S]*?)<\/script>/i;
  const originalMatch = tag.exec(html);
  assert.ok(originalMatch, "whiteboard must keep its original clip-spec");
  const original = JSON.parse(originalMatch[1]);
  const result = applyNativeOmSourceCueBindings(html, [
    { cueIndex: 1, kind: "point", sourceWord: "海量", word: "上下文", sfx: false },
    { cueIndex: 2, kind: "draw", sourceWord: "文字", word: null },
  ], "whiteboard");
  const changedMatch = tag.exec(result.html);
  const changed = JSON.parse(changedMatch[1]);
  assert.equal(changed.cues[1].sfx, false);
  assert.equal(changed.cues[1].word, "上下文");
  assert.equal(changed.cues[1].at, original.cues[1].at);
  assert.equal(changed.cues[1].offset, original.cues[1].offset);
  assert.equal(changed.cues[2].word, null);
  assert.deepEqual(changed.cues.filter((_, index) => index !== 1 && index !== 2), original.cues.filter((_, index) => index !== 1 && index !== 2));
  assert.throws(() => applyNativeOmSourceCueBindings(html, [{ cueIndex: 1, kind: "point", sourceWord: "错误锚点", word: "上下文" }], "whiteboard"), /needs matching sourceWord/);
  const talkingHeadHtml = readPinnedSource("templates/talking-head/index.html").toString("utf8");
  assert.throws(() => applyNativeOmSourceCueBindings(talkingHeadHtml, [{ cueIndex: 0, kind: "phrase", word: "新稿词" }], "talking-head"), /no original script#clip-spec/);
});

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

test("incoming transition windows use source handles, replace a centered fixed-clock range, and retain body audio timing", async () => {
  const catalog = JSON.parse(await fs.readFile(new URL("../templates/catalog.json", import.meta.url), "utf8"));
  const blueprint = {
    format,
    ...dimensions,
    clock: { kind: "film-global", durationSec: 2 },
    segments: [
      { ...motionSegment("a", 0, 1), tailHandleFrames: 3 },
      { ...motionSegment("b", 1, 2), headHandleFrames: 3, incomingTransition: { id: "laohu-motion-whip", method: "whip", windowFrames: 6, parameters: { dir: 1 } } },
    ],
  };
  const schedule = compileFilmSchedule(blueprint);
  const transitions = resolveFilmTransitions(schedule, catalog);
  assert.equal(schedule.totalFrameCount, 60);
  assert.deepEqual(schedule.segments.map((item) => item.sourceFrameCount), [33, 33]);
  assert.deepEqual(transitions.map((item) => [item.id, item.method, item.windowFrames, item.windowFrameRange.startFrame, item.windowFrameRange.endFrame]), [["laohu-motion-whip", "whip", 6, 27, 33]]);
  assert.throws(() => resolveFilmTransitions(compileFilmSchedule({
    ...blueprint,
    segments: [
      { ...motionSegment("a", 0, 1), tailHandleFrames: 3 },
      { ...motionSegment("b", 1, 2), headHandleFrames: 3, incomingTransition: { id: "laohu-motion-materialcut", method: "comicPanels", windowFrames: 6, parameters: {} } },
    ],
  }), catalog), /TRANSITIONS\.comicPanels remains source-only.*PAINT\.dotPattern/);
  assert.deepEqual(schedule.segments[0].sourceLocalBodyRange, { startFrame: 0, endFrame: 30 });
  assert.deepEqual(schedule.segments[1].sourceLocalBodyRange, { startFrame: 3, endFrame: 33 });
  assert.throws(() => compileFilmSchedule({ ...blueprint, segments: [blueprint.segments[0], { ...blueprint.segments[1], headHandleFrames: 2 }] }), /needs at least 3 headHandleFrames/);
  assert.throws(() => compileFilmSchedule({
    ...blueprint,
    segments: [blueprint.segments[0], {
      ...blueprint.segments[1], renderer: "huashu-motion-template", templateId: "laohu-motion-y3-whiteboard", variables: {},
    }],
  }), /native-clip segment b preserves its source duration and cannot declare transition handles/);
  assert.throws(() => compileFilmSchedule({ ...blueprint, segments: [blueprint.segments[0], { ...blueprint.segments[1], incomingTransition: { ...blueprint.segments[1].incomingTransition, windowFrames: 7 } }] }), /even integer/);
  assert.throws(() => compileFilmSchedule({ ...blueprint, segments: [blueprint.segments[0], { ...blueprint.segments[1], incomingTransition: null }] }), /tail handles that are not consumed/);

  const scene = (duration, audioEvents) => ({ version: 1, width: 1920, height: 1080, fps: 30, duration, timeBasis: "scene-local", audioEvents });
  const sourceBySegment = new Map([
    ["a", { file: "/fixture/a.json", sha256: "a".repeat(64), scene: scene(1.1, [
      { id: "a-body", timeSec: 0.8, timeBasis: "scene-local" },
      { id: "a-tail", timeSec: 1.05, timeBasis: "scene-local" },
    ]), localDurationSec: 1.1 }],
    ["b", { file: "/fixture/b.json", sha256: "b".repeat(64), scene: scene(1.1, [
      { id: "b-head", timeSec: 0.05, timeBasis: "scene-local" },
      { id: "b-body", timeSec: 0.15, timeBasis: "scene-local" },
    ]), localDurationSec: 1.1 }],
  ]);
  const projection = projectFilmEvents(schedule, sourceBySegment, "/fixture/film-manifest.json");
  assert.deepEqual(projection.compiledScene.audioEvents.map((event) => event.id), ["a-body", "b-body"]);
  assert.deepEqual(projection.excludedAudioEvents.map((event) => [event.eventId, event.reason]), [
    ["a-tail", "source-tail-handle-outside-film-body"],
    ["b-head", "source-head-handle-outside-film-body"],
  ]);
  assert.equal(projection.audioTimeMaps[1].localStartSec, 0.1);
  assert.equal(projection.audioTimeMaps[1].localEndSec, 1.1);
  assert.equal(projection.audioTimeMaps[1].filmStartSec, 1);
  assert.equal(projection.audioTimeMaps[1].speed, 1);

  const boundaryBlueprint = {
    format,
    ...dimensions,
    clock: { kind: "film-global", durationSec: 2 },
    segments: [
      { ...motionSegment("native-scene", 0, 1) },
      {
        id: "native-clip", renderer: "huashu-motion-template", templateId: "laohu-motion-y3-whiteboard",
        variables: { duration: 1, cues: [] }, startSec: 1, endSec: 2,
        incomingTransition: {
          id: "laohu-motion-fade", method: "crossfade", mode: "boundary-frame", windowFrames: 6,
          boundaryReason: "The native whiteboard segment begins a new explanatory beat after the motion-scene handoff.",
        },
      },
    ],
  };
  const boundarySchedule = compileFilmSchedule(boundaryBlueprint);
  const boundaryTransitions = resolveFilmTransitions(boundarySchedule, catalog);
  assert.equal(boundarySchedule.totalFrameCount, 60, "boundary bridge replaces the centered window without changing the output clock");
  assert.deepEqual(boundarySchedule.segments.map((row) => row.sourceFrameCount), [30, 30], "boundary bridge does not require or invent source handles");
  assert.equal(boundaryTransitions[0].mode, "boundary-frame");
  assert.deepEqual(boundaryTransitions[0].windowFrameRange, { startFrame: 27, endFrame: 33 });
  assert.match(boundaryTransitions[0].boundaryReason, /new explanatory beat/);
  const nativeOmPair = compileFilmSchedule({
    format, ...dimensions, clock: { kind: "film-global", durationSec: 2 },
    segments: [
      { id: "native-om-a", renderer: "laohu-native-om-template", templateId: "laohu-motion-finance-chart", variables: { duration: 1 }, startSec: 0, endSec: 1 },
      {
        id: "native-om-b", renderer: "laohu-native-om-template", templateId: "laohu-motion-whiteboard", variables: { duration: 1 }, startSec: 1, endSec: 2,
        incomingTransition: { id: "laohu-motion-fade", method: "crossfade", mode: "boundary-frame", windowFrames: 6, boundaryReason: "A second native OM explanation follows a distinct chart scene." },
      },
    ],
  });
  assert.equal(nativeOmPair.totalFrameCount, 60, "native OM to native OM boundary bridge preserves the global frame clock");
  assert.deepEqual(nativeOmPair.segments.map((row) => row.sourceFrameCount), [30, 30], "native OM to native OM needs no handles");
  const baseBoundary = boundaryBlueprint.segments;
  assert.throws(() => compileFilmSchedule({ ...boundaryBlueprint, segments: [
    baseBoundary[0], { ...baseBoundary[1], incomingTransition: { ...baseBoundary[1].incomingTransition, boundaryReason: undefined } },
  ] }), /boundaryReason must briefly explain/);
  assert.throws(() => compileFilmSchedule({ ...boundaryBlueprint, segments: [
    baseBoundary[0], { ...baseBoundary[1], incomingTransition: { ...baseBoundary[1].incomingTransition, method: "matchCut", id: "laohu-motion-matchcut" } },
  ] }), /only the verified TRANSITIONS\.crossfade bitmap branch/);
  assert.throws(() => compileFilmSchedule({ ...boundaryBlueprint, segments: [
    motionSegment("motion-a", 0, 1), { ...motionSegment("motion-b", 1, 2), incomingTransition: baseBoundary[1].incomingTransition },
  ] }), /at least one native OM\/native-clip segment/);
  assert.throws(() => compileFilmSchedule({ ...boundaryBlueprint, segments: [
    { ...baseBoundary[0], tailHandleFrames: 3 }, baseBoundary[1],
  ] }), /must not declare head\/tail handles at this cut/);
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

test("native OM source declarations and score music cross into one canonical Film clock", () => {
  const scoreText = "X:1\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\nV:lead inst=piano\nC D E F |";
  const scoreSha256 = "a".repeat(64);
  const sourceScene = {
    version: 1, width: 1920, height: 1080, fps: 30, duration: 2, timeBasis: "scene-local",
    audioEvents: [{ id: "om.native-a.declared-sfx.0", timeSec: 0.75, timeBasis: "scene-local", sourceAudio: { kind: "declared-sfx", name: "pop" } }],
    huashuMotionRuntime: {
      format: "laohu.huashu-native-om-runtime-probe/1", segmentId: "native-a",
      labels: { "scene:point-1": 0.75 }, sound: { hits: [], music: { marks: {} } },
      soundPlan: { durationSec: 2, seed: 7, root: 60, scale: "major" }, cueEvidence: { words: [{ word: "海量", start: 0.25, end: 0.4 }] },
      composer: { scoreSha256, scoreText, cues: [{ type: "hit", at: 1 }], report: {} },
    },
  };
  const blueprint = {
    format, ...dimensions, clock: { kind: "film-global", durationSec: 2 },
    segments: [{ id: "native-a", renderer: "laohu-native-om-template", templateId: "laohu-motion-whiteboard", variables: { duration: 2 }, startSec: 0, endSec: 2 }],
  };
  const schedule = compileFilmSchedule(blueprint);
  const projection = projectFilmEvents(schedule, new Map([["native-a", { file: "/fixture/native-a.json", sha256: "b".repeat(64), scene: sourceScene, localDurationSec: 2 }]]), "/fixture/film-manifest.json");
  assert.equal(projection.compiledScene.audioEvents[0].id, "om.native-a.declared-sfx.0");
  assert.equal(projection.compiledScene.audioEvents[0].timeSec, 0.75, "canonical events preserve the source timeline's local seconds and receive the existing segment timeMap");
  assert.equal(projection.audioEventBindings[0].timeMapId, "time:native-a");
  assert.equal(projection.nativeSourceCompositions.length, 1);
  assert.equal(projection.nativeSourceCompositions[0].timeMapId, "time:native-a");
  assert.equal(projection.nativeSourceCompositions[0].scoreText, scoreText);
  assert.equal(projection.nativeSourceCompositions[0].scoreSha256, scoreSha256);
});

test("native OM default score-plan music records the original p0 and uses the nonzero segment timeMap only when enabled", () => {
  const sourceDeclaration = { id: "film", duration: 2, labels: { "scene:reveal": 1 }, hits: [], music: {} };
  const sourcePlan = { duration: 2, style: "ambient", product: null, choice: 0, seed: 17, sections: [{ id: "reveal", t: 1, energy: 0.8 }] };
  const sourceScene = {
    version: 1, width: 1920, height: 1080, fps: 30, duration: 2, timeBasis: "scene-local", audioEvents: [],
    huashuMotionRuntime: {
      format: "laohu.huashu-native-om-runtime-probe/1", segmentId: "preset-b", labels: sourceDeclaration.labels,
      sound: { hits: [], music: {} }, soundPlan: { durationSec: 2 }, sourceDeclaration,
      sourceDeclarationSha256: "c".repeat(64), sourcePlan, sourcePlanSha256: "d".repeat(64),
      sourceScore: null, composer: null,
    },
  };
  const blueprint = {
    format, ...dimensions, clock: { kind: "film-global", durationSec: 4 },
    segments: [motionSegment("lead-in", 0, 2), { id: "preset-b", renderer: "laohu-native-om-template", templateId: "laohu-motion-whiteboard", variables: { duration: 2 }, startSec: 2, endSec: 4 }],
  };
  const schedule = compileFilmSchedule(blueprint);
  const projection = projectFilmEvents(schedule, new Map([["preset-b", { file: "/fixture/preset-b.json", sha256: "e".repeat(64), scene: sourceScene, localDurationSec: 2 }]]), "/fixture/film-manifest.json");
  assert.equal(projection.nativeSourcePresetPlans.length, 1);
  assert.equal(projection.nativeSourcePresetPlans[0].segmentId, "preset-b");
  assert.equal(projection.nativeSourcePresetPlans[0].sourceDeclaration.labels["scene:reveal"], 1);
  assert.equal(projection.nativeSourcePresetPlans[0].sourcePlan.style, "ambient");
  assert.equal(projection.nativeSourcePresetPlans[0].timeMapId, "time:preset-b");
  assert.equal(projection.audioTimeMaps.find((row) => row.segmentId === "preset-b").filmStartSec, 2);

  const musicOffScene = structuredClone(sourceScene);
  musicOffScene.huashuMotionRuntime.sound.music.off = true;
  const offProjection = projectFilmEvents(schedule, new Map([["preset-b", { file: "/fixture/preset-b-off.json", sha256: "f".repeat(64), scene: musicOffScene, localDurationSec: 2 }]]), "/fixture/film-manifest.json");
  assert.deepEqual(offProjection.nativeSourcePresetPlans, [], "original music.off suppresses only the source default-music stem");
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
