import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildSourcePresetPlan,
  buildComposerHitRows,
  buildRuntimeSampleUseReceipt,
  floatWav,
  generatePlan,
  renderOneSfx,
  renderPresetStem,
  resolveDerivedDuckHits,
  resolveSourceEvents,
  verifyFilmManifest,
  wavFacts,
} from "../scripts/huashu-audio.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cacheRoot = process.env.MOTION_AUDIO_TEST_TMP_DIR
  ? path.resolve(process.env.MOTION_AUDIO_TEST_TMP_DIR)
  : path.join(repoRoot, ".cache", "tmp", "motion-huashu-integration", "audio-tests");
const fixtures = [];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ffmpeg = process.env.MOTION_TEST_FFMPEG || process.env.MOTION_FFMPEG || "ffmpeg";
const ffmpegAvailable = spawnSync(ffmpeg, ["-version"], { encoding: "utf8" }).status === 0;

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function fixture({ local = true, asrcut = false } = {}) {
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "fixture-"));
  fixtures.push(directory);
  const put = async (name, value) => {
    const bytes = Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
    const file = path.join(directory, name);
    await fs.writeFile(file, bytes);
    return { file, sha256: sha256(bytes) };
  };
  const blueprint = await put("blueprint.json", { format: "test-blueprint/1" });
  const sourceScene = await put("source-scene.json", { version: 1, source: "pinned-by-manifest" });
  const event = local
    ? { id: "event-local", phaseId: "phase-local", phaseOffsetSec: 0.5, timeBasis: "scene-local" }
    : { id: "event-global", filmTimeSec: 1, timeBasis: "film-global" };
  const scene = {
    version: 1,
    width: 640,
    height: 360,
    fps: 30,
    duration: 3,
    timeBasis: "film-global",
    phases: local ? [{ id: "phase-local", startSec: 0.5, durationSec: 1.5, timeBasis: "scene-local" }] : [],
    audioEvents: [event],
  };
  const compiledScene = await put("compiled-global-events.scene.json", scene);
  const timeMap = {
    id: "time-segment-1",
    segmentId: "segment-1",
    localStartSec: 0,
    localEndSec: 2,
    filmStartSec: 0,
    speed: 2,
    sourceRange: asrcut ? { startSample: 0, endSample: 48000, sampleRateHz: 48000 } : { startSec: 0, endSec: 1 },
    frameRange: { startFrame: 0, endFrame: 30 },
    roundingResidualSamples: 0,
  };
  const timeline = asrcut ? await put("timeline.json", { format: "timeline/2" }) : null;
  const editPlan = asrcut ? await put("edit-plan.json", { format: "edit-plan/1" }) : null;
  const manifest = {
    format: "laohu.huashu-om-film-manifest/1",
    source: {
      blueprintPath: "./blueprint.json",
      blueprintSha256: blueprint.sha256,
      clockKind: asrcut ? "asrcut-v2" : "film-global",
      ...(asrcut ? {
        timelinePath: "./timeline.json",
        timelineSha256: timeline.sha256,
        editPlanPath: "./edit-plan.json",
        editPlanSha256: editPlan.sha256,
      } : {}),
    },
    audioEventScene: { path: "./compiled-global-events.scene.json", sha256: compiledScene.sha256, format: "motion-scene-v1" },
    audioTimeMaps: local ? [timeMap] : [],
    audioEventBindings: [{
      eventId: event.id,
      sourceEventId: event.id,
      segmentId: "segment-1",
      sourceScenePath: "./source-scene.json",
      sourceSceneSha256: sourceScene.sha256,
      sourceOwner: "scene.audioEvents",
      sourceTimeBasis: local ? "scene-local" : "film-global",
      sourcePhaseId: local ? "phase-local" : null,
      compiledPhaseId: local ? "phase-local" : null,
      timeMapId: local ? timeMap.id : null,
    }],
    sourceScenes: [{ segmentId: "segment-1", path: "./source-scene.json", sha256: sourceScene.sha256 }],
  };
  const manifestFile = await put("film-manifest.json", manifest);
  return { directory, manifestPath: manifestFile.file, blueprintPath: blueprint.file, scene, manifest, sourceScene, timeMap };
}

async function syntheticPianoPack(directory) {
  const packDir = path.join(directory, "recorded-samples");
  await fs.mkdir(packDir, { recursive: true });
  const instruments = {};
  const credit = "Synthetic sine sample generated locally for adapter contract tests.";
  for (const id of ["piano", "celli", "violas", "violins"]) {
    const relative = `${id}/tone.wav`;
    const file = path.join(packDir, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tone = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=261.625565:sample_rate=48000:duration=0.5", "-ac", "1", "-c:a", "pcm_s16le", file], { encoding: "utf8" });
    assert.equal(tone.status, 0, tone.stderr || tone.error?.message);
    instruments[id] = {
      license: "project-generated test fixture",
      credit: [credit],
      drum: false,
      samples: [{ file: relative, ch: 1, root: 60, layer: "mf", rr: "1" }],
    };
  }
  const releaseRelative = "piano/release.wav";
  const releaseFile = path.join(packDir, releaseRelative);
  const releaseTone = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=700:sample_rate=48000:duration=0.25", "-ac", "1", "-c:a", "pcm_s16le", releaseFile], { encoding: "utf8" });
  assert.equal(releaseTone.status, 0, releaseTone.stderr || releaseTone.error?.message);
  instruments.piano.releases = [{ file: releaseRelative, ch: 1, root: 60, layer: "mf", rr: "1" }];
  await fs.writeFile(path.join(packDir, "manifest.json"), JSON.stringify({ version: 2, instruments }, null, 2));
  await fs.writeFile(path.join(packDir, "NOTICE.txt"), `- ${credit}\n`);
  return packDir;
}

async function setEscapingWurli(packDir, projectRoot, present) {
  const manifestPath = path.join(packDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (present) {
    const credit = "Synthetic silent sample for isolated SFX pack-visibility regression.";
    const outsideFile = path.join(projectRoot, "outside-wurli.wav");
    const silence = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "0.5", "-c:a", "pcm_s16le", outsideFile], { encoding: "utf8" });
    assert.equal(silence.status, 0, silence.stderr || silence.error?.message);
    manifest.instruments.wurli = {
      license: "project-generated test fixture",
      credit: [credit], drum: false,
      samples: [{ file: "../outside-wurli.wav", ch: 1, root: 60, layer: "mf", rr: "1" }],
    };
    await fs.appendFile(path.join(packDir, "NOTICE.txt"), `- ${credit}\n`);
  } else delete manifest.instruments.wurli;
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

async function pinnedSynthOffSfx({ root, scale, seed }) {
  const sourceRoot = path.join(repoRoot, ".agents", "skills", "laohu-motion", "templates", "upstream", "huashu-motion");
  const referenceRoot = await fs.mkdtemp(path.join(cacheRoot, "pinned-synth-off-reference-"));
  fixtures.push(referenceRoot);
  const sourceLib = path.join(sourceRoot, "cli", "lib");
  const referenceLib = path.join(referenceRoot, "cli", "lib");
  await fs.mkdir(path.dirname(referenceLib), { recursive: true });
  await fs.cp(sourceLib, referenceLib, { recursive: true });
  await fs.copyFile(path.join(sourceRoot, "package.json"), path.join(referenceRoot, "package.json"));
  const priorSamples = process.env.OM_SAMPLES;
  const priorRequired = process.env.LAOHU_REQUIRE_RECORDED;
  try {
    process.env.OM_SAMPLES = "off";
    delete process.env.LAOHU_REQUIRE_RECORDED;
    const [sound, score, dsp, samples] = await Promise.all([
      import(pathToFileURL(path.join(referenceLib, "sound.js")).href),
      import(pathToFileURL(path.join(referenceLib, "score.js")).href),
      import(pathToFileURL(path.join(referenceLib, "dsp.js")).href),
      import(pathToFileURL(path.join(referenceLib, "samples.js")).href),
    ]);
    assert.equal(samples.packDir(), "off");
    assert.equal(samples.loadPack(), null);
    const key = (degree, octave) => dsp.mtof(score.deg({ root, scale }, Math.round(degree) - 1, octave - 4));
    return renderOneSfx({
      upstream: { sound, score, dsp, samples }, name: "ding", kitName: "lofi", options: {},
      sourceGain: 1, sourcePan: 0, seed, key,
    }).wav;
  } finally {
    if (priorSamples == null) delete process.env.OM_SAMPLES;
    else process.env.OM_SAMPLES = priorSamples;
    if (priorRequired == null) delete process.env.LAOHU_REQUIRE_RECORDED;
    else process.env.LAOHU_REQUIRE_RECORDED = priorRequired;
  }
}

test("film manifest verifies pinned files and maps a scene-local event through its unique segment clock", async () => {
  const sample = await fixture({ local: true });
  const film = await verifyFilmManifest(sample.manifestPath);
  const resolved = resolveSourceEvents(["event-local"], 3, film).get("event-local");
  assert.equal(resolved.timeMapId, "time-segment-1");
  assert.equal(resolved.phaseId, "phase-local");
  assert.equal(resolved.filmTimeSec, 0.5);
  assert.equal(film.maps.get("time-segment-1").speed, 2);
});

test("Shotcraft /2 picture-only film manifests verify the output, exact segment clock, canonical event projection, and retain the legacy consumer", async (t) => {
  if (!ffmpegAvailable) return t.skip("a working local ffmpeg/ffprobe pair is required for the actual /2 picture receipt");
  const sample = await fixture({ local: false, asrcut: false });
  const scene = {...sample.scene, duration: 1, audioEvents: [{id: "event-global", filmTimeSec: 0.5, timeBasis: "film-global"}]};
  const scenePath = path.join(sample.directory, "compiled-global-events.scene.json");
  await fs.writeFile(scenePath, JSON.stringify(scene));
  const sceneHash = sha256(Buffer.from(JSON.stringify(scene)));
  const picturePath = path.join(sample.directory, "picture-only.mp4");
  const video = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=1920x1080:r=30:d=1", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", picturePath], {encoding: "utf8"});
  assert.equal(video.status, 0, video.stderr || video.error?.message);
  const pictureHash = sha256(await fs.readFile(picturePath));
  sample.manifest.format = "laohu.motion-film-manifest/1";
  sample.manifest.audioEventScene = {path: "./compiled-global-events.scene.json", sha256: sceneHash, format: "motion-scene-v1"};
  sample.manifest.audioTimeMaps = [{id: "time:segment-1", segmentId: "segment-1", localStartSec: 0, localEndSec: 1, filmStartSec: 0, speed: 1, sourceRange: {startSec: 0, endSec: 1}, frameRange: {startFrame: 0, endFrame: 30}, frameStartResidualSec: 0, frameEndResidualSec: 0, roundingResidualSamples: 0}];
  sample.manifest.sourceScenes = [{segmentId: "segment-1", path: "./compiled-global-events.scene.json", sha256: sceneHash}];
  sample.manifest.audioEventBindings = [{eventId: "event-global", sourceEventId: "event-global", segmentId: "segment-1", sourceScenePath: "./compiled-global-events.scene.json", sourceSceneSha256: sceneHash, sourceOwner: "scene.audioEvents", sourceTimeBasis: "film-global", sourcePhaseId: null, compiledPhaseId: null, timeMapId: null}];
  sample.manifest.output = {path: "./picture-only.mp4", sha256: pictureHash, kind: "picture-only-remotion-v2"};
  sample.manifest.render = {width: 1920, height: 1080, fps: 30, frameCount: 30, durationSec: 1, probe: {codec: "h264", width: 1920, height: 1080, fps: 30, frameCount: 30, durationSec: 1, audioStreams: 0}};
  sample.manifest.frameClock = {kind: "film-global", method: "absolute-ceil-boundaries", fps: 30, totalFrameCount: 30};
  sample.manifest.segments = [{id: "segment-1", renderer: "video-shotcraft-remotion", sourceRange: {startSec: 0, endSec: 1}, frameRange: {startFrame: 0, endFrame: 30}, expectedFrameCount: 30, observedFrameCount: 30, baseSource: null}];
  await fs.writeFile(sample.manifestPath, JSON.stringify(sample.manifest));

  const film = await verifyFilmManifest(sample.manifestPath);
  const resolved = resolveSourceEvents(["event-global"], 1, film).get("event-global");
  assert.equal(film.manifest.format, "laohu.motion-film-manifest/1");
  assert.equal(film.source.clockKind, "film-global");
  assert.equal(resolved.timeMapId, null);
  assert.equal(resolved.filmTimeSec, 0.5);
  assert.equal(film.verifiedFiles.some((item) => item.path === picturePath), true);

  const validManifest = JSON.stringify(sample.manifest);
  sample.manifest.output.sha256 = "0".repeat(64);
  await fs.writeFile(sample.manifestPath, JSON.stringify(sample.manifest));
  await assert.rejects(verifyFilmManifest(sample.manifestPath), /SHA-256 is stale/);
  sample.manifest = JSON.parse(validManifest);
  sample.manifest.audioEventBindings.push({...sample.manifest.audioEventBindings[0]});
  await fs.writeFile(sample.manifestPath, JSON.stringify(sample.manifest));
  await assert.rejects(verifyFilmManifest(sample.manifestPath), /ambiguous event-to-clock binding/);
  sample.manifest = JSON.parse(validManifest);
  sample.manifest.sourceScenes[0].path = "./source-scene.json";
  sample.manifest.sourceScenes[0].sha256 = sceneHash;
  await fs.writeFile(sample.sourceScene.file, JSON.stringify(scene));
  await fs.writeFile(sample.manifestPath, JSON.stringify(sample.manifest));
  await assert.rejects(verifyFilmManifest(sample.manifestPath), /canonical event scene/);
});

test("film-global blueprint needs no ASR timeline and never receives a local timeMap", async () => {
  const sample = await fixture({ local: false, asrcut: false });
  const film = await verifyFilmManifest(sample.manifestPath);
  const resolved = resolveSourceEvents(["event-global"], 3, film).get("event-global");
  assert.equal(film.source.clockKind, "film-global");
  assert.equal(resolved.timeMapId, null);
  assert.equal(resolved.filmTimeSec, 1);
});

test("asrcut film manifest verifies canonical timeline and edit-plan hashes", async () => {
  const sample = await fixture({ local: true, asrcut: true });
  const film = await verifyFilmManifest(sample.manifestPath);
  assert.equal(film.source.clockKind, "asrcut-v2");
  assert.equal(film.verifiedFiles.some((item) => item.path.endsWith("timeline.json")), true);
  assert.equal(film.verifiedFiles.some((item) => item.path.endsWith("edit-plan.json")), true);
});

test("two non-frame-aligned segment clocks preserve exact sample anchors through the audio consumer", async () => {
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "nonaligned-"));
  fixtures.push(directory);
  const put = async (name, value) => {
    const bytes = Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
    const file = path.join(directory, name);
    await fs.writeFile(file, bytes);
    return { file, sha256: sha256(bytes) };
  };
  const blueprint = await put("blueprint.json", { format: "test-blueprint/1", durationSec: 2.2 });
  const sourceA = await put("source-a.json", { segmentId: "segment-a" });
  const sourceB = await put("source-b.json", { segmentId: "segment-b" });
  const phases = [
    { id: "phase-a", startSec: 0.7, durationSec: 0.5, timeBasis: "scene-local" },
    { id: "phase-b", startSec: 0.1, durationSec: 0.4, timeBasis: "scene-local" },
  ];
  const events = [
    { id: "event-a", phaseId: "phase-a", phaseOffsetSec: 0.25, timeBasis: "scene-local" },
    { id: "event-b", phaseId: "phase-b", phaseOffsetSec: 0.2, timeBasis: "scene-local" },
  ];
  const scene = { version: 1, width: 640, height: 360, fps: 30, duration: 2.2, timeBasis: "film-global", phases, audioEvents: events };
  const compiledScene = await put("compiled-global-events.scene.json", scene);
  const maps = [
    {
      id: "map-a", segmentId: "segment-a", localStartSec: 0, localEndSec: 1,
      filmStartSec: 4848 / 48000, speed: 1,
      sourceRange: { startSample: 4848, endSample: 52848, sampleRateHz: 48000 },
      frameRange: { startFrame: 4, endFrame: 34 },
      frameStartResidualSec: 4 / 30 - 4848 / 48000,
      frameEndResidualSec: 34 / 30 - 52848 / 48000,
      roundingResidualSamples: 1552,
    },
    {
      id: "map-b", segmentId: "segment-b", localStartSec: 0, localEndSec: 1,
      filmStartSec: 52848 / 48000, speed: 1,
      sourceRange: { startSample: 52848, endSample: 100848, sampleRateHz: 48000 },
      frameRange: { startFrame: 34, endFrame: 64 },
      frameStartResidualSec: 34 / 30 - 52848 / 48000,
      frameEndResidualSec: 64 / 30 - 100848 / 48000,
      roundingResidualSamples: 1552,
    },
  ];
  const manifest = {
    format: "laohu.huashu-om-film-manifest/1",
    source: { blueprintPath: "./blueprint.json", blueprintSha256: blueprint.sha256, clockKind: "asrcut-v2", timelinePath: "./timeline.json", timelineSha256: "0".repeat(64), editPlanPath: "./edit-plan.json", editPlanSha256: "0".repeat(64) },
    audioEventScene: { path: "./compiled-global-events.scene.json", sha256: compiledScene.sha256, format: "motion-scene-v1" },
    audioTimeMaps: maps,
    audioEventBindings: [
      { eventId: "event-a", sourceEventId: "event-a", segmentId: "segment-a", sourceScenePath: "./source-a.json", sourceSceneSha256: sourceA.sha256, sourceOwner: "scene.audioEvents", sourceTimeBasis: "scene-local", sourcePhaseId: "phase-a", compiledPhaseId: "phase-a", timeMapId: "map-a" },
      { eventId: "event-b", sourceEventId: "event-b", segmentId: "segment-b", sourceScenePath: "./source-b.json", sourceSceneSha256: sourceB.sha256, sourceOwner: "scene.audioEvents", sourceTimeBasis: "scene-local", sourcePhaseId: "phase-b", compiledPhaseId: "phase-b", timeMapId: "map-b" },
    ],
    sourceScenes: [
      { segmentId: "segment-a", path: "./source-a.json", sha256: sourceA.sha256 },
      { segmentId: "segment-b", path: "./source-b.json", sha256: sourceB.sha256 },
    ],
  };
  await put("timeline.json", { format: "timeline/2" });
  await put("edit-plan.json", { format: "edit-plan/2" });
  manifest.source.timelineSha256 = sha256(await fs.readFile(path.join(directory, "timeline.json")));
  manifest.source.editPlanSha256 = sha256(await fs.readFile(path.join(directory, "edit-plan.json")));
  const manifestFile = await put("film-manifest.json", manifest);
  const film = await verifyFilmManifest(manifestFile.file);
  const a = resolveSourceEvents(["event-a"], 2.2, film).get("event-a");
  const b = resolveSourceEvents(["event-b"], 2.2, film).get("event-b");
  assert.equal(film.maps.get("map-a").filmStartSec, 4848 / 48000);
  assert.equal(film.maps.get("map-a").filmStartSec, 0.101);
  assert.equal(film.maps.get("map-a").speed, 1);
  assert.equal(film.maps.get("map-b").filmStartSec, 52848 / 48000);
  assert.equal(a.filmTimeSec, 0.101 + 0.95);
  assert.equal(b.filmTimeSec, 1.101 + 0.3);
  assert.equal(a.timeMapId, "map-a");
  assert.equal(b.timeMapId, "map-b");
  assert.ok(Math.abs(maps[0].frameRange.startFrame / 30 - maps[0].filmStartSec - 0.0323333333333333) < 1e-12);
});

test("stale source hashes, duplicate event clocks, and wrong timeMap speeds fail closed", async () => {
  const sample = await fixture({ local: true });
  await fs.appendFile(sample.blueprintPath, " ");
  await assert.rejects(verifyFilmManifest(sample.manifestPath), /SHA-256 is stale/);

  const fresh = await fixture({ local: true });
  const manifest = JSON.parse(await fs.readFile(fresh.manifestPath, "utf8"));
  manifest.audioEventBindings.push({ ...manifest.audioEventBindings[0] });
  await fs.writeFile(fresh.manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyFilmManifest(fresh.manifestPath), /ambiguous event-to-clock binding/);

  const badSpeed = JSON.parse(await fs.readFile(fresh.manifestPath, "utf8"));
  badSpeed.audioEventBindings.pop();
  badSpeed.audioTimeMaps[0].speed = 3;
  await fs.writeFile(fresh.manifestPath, JSON.stringify(badSpeed));
  await assert.rejects(verifyFilmManifest(fresh.manifestPath), /speed does not equal/);
});

test("composer hit/rise ordinals preserve canonical event and timeMap binding, and unmatched marks reject", () => {
  const event = { eventId: "event-local", phaseId: "phase-local", timeMapId: "time-segment-1", filmTimeSec: 0.5 };
  const rendered = {
    perf: { cues: [{ type: "hit", at: 0.5 }] },
    hits: [
      { name: "impact", at: 0.5, dur: 0.8, gain: 0.9, pan: 0 },
      { name: "subdrop", at: 0.5, dur: 1, gain: 0.6, pan: 0 },
    ],
    report: { unmatched: [] },
  };
  const bindings = { cueBindings: new Map([[0, "event-local"]]) };
  const rows = buildComposerHitRows(rendered, bindings, new Map([["event-local", event]]), "clean", 12, () => 0, {}, { fps: 30 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].timeMapId, "time-segment-1");
  assert.match(rows[0].id, /^event-local--score-cue-0--/);
  assert.throws(() => buildComposerHitRows({ ...rendered, report: { unmatched: ["late"] } }, bindings, new Map([["event-local", event]]), "clean", 12, () => 0, {}, { fps: 30 }), /unmatched/);
});

test("public SFX wrapper preserves mono gain/pan, applies kit post once, and keeps stereo hard-pan convention", () => {
  const tracks = [];
  class FakeTrack {
    constructor(duration) { this.n = Math.round(duration * 48000); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); tracks.push(this); }
    add(signal, at, gain = 1, pan = 0) {
      const offset = Math.round(at * 48000);
      const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
      const leftGain = Math.cos(angle) * gain * Math.SQRT2, rightGain = Math.sin(angle) * gain * Math.SQRT2;
      for (let index = 0; index < signal.length && offset + index < this.n; index += 1) {
        if (Math.abs(pan) >= 1) (pan < 0 ? this.L : this.R)[offset + index] += signal[index] * gain;
        else { this.L[offset + index] += signal[index] * leftGain; this.R[offset + index] += signal[index] * rightGain; }
      }
    }
  }
  let postCalls = 0, seenOptions;
  const upstream = {
    sound: {
      Track: FakeTrack,
      SFX: { tick: { fn: (options) => { seenOptions = options; return { sig: new Float32Array([0.25]), lead: 0 }; } } },
      KITS: { clean: { post: (samples) => { postCalls += 1; return Float32Array.from(samples, (value) => value * 2); } } },
    },
    dsp: { rng: (seed) => () => 0.25 },
  };
  const mono = renderOneSfx({ upstream, name: "tick", kitName: "clean", options: {}, sourceGain: 0.5, sourcePan: 0, seed: "stable", key: () => 440 });
  assert.equal(postCalls, 1);
  assert.equal(seenOptions.gain, 0.5);
  assert.equal(seenOptions.pan, 0);
  const monoFacts = wavFacts(mono.wav);
  assert.equal(monoFacts.encoding, "pcm_f32le");
  assert.equal(mono.wav.readFloatLE(44), 0.25);
  assert.equal(mono.wav.readFloatLE(48), 0.25);

  upstream.sound.KITS.clean = {};
  const left = new Float32Array(4800), right = new Float32Array(4800);
  left[0] = 0.25; right[0] = 0.5;
  upstream.sound.SFX.pair = { fn: () => ({ sig: [left, right], lead: 0.1 }) };
  const stereo = renderOneSfx({ upstream, name: "pair", kitName: "clean", options: {}, sourceGain: 0.5, sourcePan: 0.75, seed: "stable", key: () => 440 });
  assert.equal(stereo.sourcePan, null);
  assert.equal(stereo.sourcePanApplied, "upstream-stereo-hard-pan; event pan ignored by upstream renderSfx");
  assert.equal(stereo.lead, 0.1);
  assert.equal(stereo.wav.readFloatLE(44), 0.125);
  assert.equal(stereo.wav.readFloatLE(48), 0.25);
});

test("SFX-only request renders a public source function and audio.mjs consumes it without adding music", { skip: !ffmpegAvailable }, async () => {
  const sample = await fixture({ local: true });
  const assetsDir = path.join(sample.directory, "generated");
  await fs.mkdir(assetsDir, { recursive: true });
  const lockedSilence = floatWav({ n: 3 * 48000, L: new Float32Array(3 * 48000), R: new Float32Array(3 * 48000) });
  await fs.writeFile(path.join(sample.directory, "locked-silence.wav"), lockedSilence);
  const request = {
    format: "laohu.motion.huashu-audio-request/1",
    sfxKit: "clean",
    sfxEvents: [{ id: "technical-tick", eventId: "event-local", name: "tick", options: {}, sourceGain: 0.5, sourcePan: 0, mixGainDb: -3, seed: "technical-seed" }],
  };
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2,
    events: [], tracks: [{ id: "locked-voice-track", assetId: "locked-voice", bus: "voice", startSec: 0, locked: true }],
    voiceWindows: [{ id: "voice-window", startSec: 0.5, endSec: 1.5 }],
    ducking: { targetGainDb: -12, attackSec: 0.05, releaseSec: 0.1 },
    automation: [], timeMaps: [],
    assets: [{ id: "locked-voice", file: "locked-silence.wav", durationSec: 3, sha256: sha256(lockedSilence), license: "Project-generated test fixture", redistribution: { status: "project-generated", basis: "Neutral local silence used only for this technical test." }, reviewStatus: "generated-unreviewed" }],
    generatedAssets: [],
  };
  const requestPath = path.join(sample.directory, "sfx-only-request.json");
  const basePlanPath = path.join(sample.directory, "sfx-only-base-plan.json");
  const outputPlan = path.join(sample.directory, "sfx-only-output-plan.json");
  const receiptPath = path.join(sample.directory, "sfx-only-receipt.json");
  await fs.writeFile(requestPath, JSON.stringify(request));
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan));
  const film = await verifyFilmManifest(sample.manifestPath);
  const invalidSeedRequest = { ...request, sfxEvents: [{ ...request.sfxEvents[0], seed: { unstable: true } }] };
  await assert.rejects(generatePlan({
    request: invalidSeedRequest, basePlan, basePlanPath, film,
    inputFiles: [requestPath, basePlanPath, sample.manifestPath],
    assetsDir, projectRoot: sample.directory, outputPlan, manifestPath: receiptPath,
  }), /seed must be a finite number or string/);
  const result = await generatePlan({
    request, basePlan, basePlanPath, film, inputFiles: [requestPath, basePlanPath, sample.manifestPath],
    assetsDir, projectRoot: sample.directory, outputPlan, manifestPath: receiptPath,
  });
  assert.equal(result.plan.tracks.some((track) => track.bus === "music"), false);
  assert.deepEqual(result.plan.tracks[0], basePlan.tracks[0]);
  assert.deepEqual(result.plan.voiceWindows, basePlan.voiceWindows);
  assert.deepEqual(result.plan.ducking, basePlan.ducking);
  assert.equal(result.plan.assets.find((asset) => asset.id === "locked-voice").file, "locked-silence.wav");
  assert.equal(result.plan.events.length, 1);
  assert.equal(result.plan.events[0].eventId, "event-local");
  assert.equal(result.plan.events[0].timeMapId, "time-segment-1");
  const generatedSfxAsset = result.plan.assets.find((asset) => asset.id.startsWith("huashu-sfx-"));
  assert.equal(generatedSfxAsset.reviewStatus, "generated-unreviewed");
  assert.equal(result.manifest.composition.status, "omitted; SFX-only request");
  assert.equal(result.manifest.outputs.assets.length, 1);
  assert.equal((await fs.stat(path.join(assetsDir, `${generatedSfxAsset.id}.wav`))).isFile(), true);

  const mixPath = path.join(sample.directory, "sfx-only-mix.wav");
  const mixManifestPath = path.join(sample.directory, "sfx-only-mix.receipt.json");
  const audioScript = path.join(repoRoot, ".agents", "skills", "laohu-motion", "scripts", "audio.mjs");
  const consumer = spawnSync(process.execPath, [
    audioScript,
    "--plan", outputPlan,
    "--scene", path.join(sample.directory, "compiled-global-events.scene.json"),
    "--asset-index", path.join(repoRoot, ".agents", "skills", "laohu-motion", "assets", "audio", "index.json"),
    "--output", mixPath,
    "--manifest", mixManifestPath,
    "--cache-dir", path.join(sample.directory, "audio-cache"),
    "--ffmpeg", ffmpeg,
    "--allow-generated-preview",
  ], { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(consumer.status, 0, consumer.stderr || consumer.stdout);
  assert.match(consumer.stdout, /AUDIO_STREAM true/);
  assert.equal((await fs.stat(mixPath)).isFile(), true);
  const mixReceipt = JSON.parse(await fs.readFile(mixManifestPath, "utf8"));
  assert.equal(mixReceipt.events.length, 1);
  assert.equal(mixReceipt.events[0].sharedEventId, "event-local");
  assert.equal(mixReceipt.tracks.some((track) => track.bus === "music"), false);
  assert.equal(mixReceipt.tracks.some((track) => track.id === "locked-voice-track" && track.locked), true);
});

test("music-only request generates one music track without requiring or adding SFX", async () => {
  const sample = await fixture({ local: true });
  const assetsDir = path.join(sample.directory, "generated-music");
  await fs.mkdir(assetsDir, { recursive: true });
  const scoreText = "X:1\nT:Technical test\nM:4/4\nL:1/4\nK:C\nCDEF|";
  const scoreSha256 = sha256(Buffer.from(scoreText, "utf8"));
  const request = {
    format: "laohu.motion.huashu-audio-request/1",
    composition: { scoreText, seed: "music-only-test", durationSec: 3 },
    scoreSha256,
    bindings: { scoreSha256, marks: [], hitRiseCues: [] },
    musicMixGainDb: -3,
  };
  const basePlan = { schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2, events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [] };
  const requestPath = path.join(sample.directory, "music-only-request.json");
  const basePlanPath = path.join(sample.directory, "music-only-base-plan.json");
  const outputPlan = path.join(sample.directory, "music-only-output-plan.json");
  const receiptPath = path.join(sample.directory, "music-only-receipt.json");
  await fs.writeFile(requestPath, JSON.stringify(request));
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan));
  const film = await verifyFilmManifest(sample.manifestPath);
  const result = await generatePlan({
    request, basePlan, basePlanPath, film, inputFiles: [requestPath, basePlanPath, sample.manifestPath],
    assetsDir, projectRoot: sample.directory, outputPlan, manifestPath: receiptPath,
  });
  assert.equal(result.plan.tracks.filter((track) => track.bus === "music").length, 1);
  assert.equal(result.plan.events.length, 0);
  assert.equal(result.plan.assets.length, 1);
  assert.equal(result.plan.assets[0].reviewStatus, "generated-unreviewed");
  assert.equal(result.manifest.composition.scoreSha256, scoreSha256);
  assert.equal(result.manifest.outputs.assets.length, 1);

  const expectedTrackId = result.plan.tracks.find((track) => track.bus === "music").id;
  const collisionPlan = JSON.parse(JSON.stringify(result.plan));
  collisionPlan.assets[0].id = "existing-asset-alias";
  collisionPlan.tracks[0].assetId = "existing-asset-alias";
  collisionPlan.tracks[0].bus = "voice";
  const collisionPlanPath = path.join(sample.directory, "music-collision-base-plan.json");
  await fs.writeFile(collisionPlanPath, JSON.stringify(collisionPlan));
  await assert.rejects(generatePlan({
    request, basePlan: collisionPlan, basePlanPath: collisionPlanPath, film,
    inputFiles: [requestPath, collisionPlanPath, sample.manifestPath],
    assetsDir, projectRoot: sample.directory,
    outputPlan: path.join(sample.directory, "music-collision-output-plan.json"),
    manifestPath: path.join(sample.directory, "music-collision-receipt.json"),
  }), new RegExp("Generated music track ID already exists.*" + expectedTrackId));
});

test("/2 product preset generates a music-only stem and binds section/drop through canonical event IDs", async () => {
  const sample = await fixture({ local: false });
  const assetsDir = path.join(sample.directory, "generated-preset");
  await fs.mkdir(assetsDir, { recursive: true });
  const request = {
    format: "laohu.motion.huashu-audio-request/2",
    musicPreset: {
      product: "ai", variant: 0, seed: "preset-smoke", bpm: 100,
      sections: [{ eventId: "event-global", energy: 0.8 }],
      dropEventId: "event-global", ending: "ring",
    },
    musicMixGainDb: -2,
  };
  const basePlan = { schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2, events: [], tracks: [], voiceWindows: [{ id: "voice-window", startSec: 0.2, endSec: 0.8 }], automation: [], timeMaps: [], assets: [], generatedAssets: [] };
  const requestPath = path.join(sample.directory, "preset-request.json");
  const basePlanPath = path.join(sample.directory, "preset-base-plan.json");
  const outputPlan = path.join(sample.directory, "preset-output-plan.json");
  const receiptPath = path.join(sample.directory, "preset-receipt.json");
  await fs.writeFile(requestPath, JSON.stringify(request));
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan));
  const film = await verifyFilmManifest(sample.manifestPath);
  const result = await generatePlan({
    request, basePlan, basePlanPath, film, inputFiles: [requestPath, basePlanPath, sample.manifestPath],
    assetsDir, projectRoot: sample.directory, outputPlan, manifestPath: receiptPath,
  });
  assert.equal(result.plan.tracks.filter((track) => track.bus === "music").length, 1);
  assert.equal(result.plan.events.length, 0);
  assert.equal(result.plan.assets.length, 1);
  assert.equal(result.plan.assets[0].reviewStatus, "generated-unreviewed");
  assert.equal(result.manifest.composition.style, "cinematic");
  assert.equal(result.manifest.composition.scale, "minor");
  assert.equal([57, 58, 60, 62].includes(result.manifest.composition.keyMidi), true);
  assert.equal(result.manifest.musicPreset.request.dropEventId, "event-global");
  assert.equal(result.manifest.musicPreset.sourcePlan.sections.some((row) => row.eventId === "event-global" && row.drop), true);
  assert.equal(result.manifest.musicPreset.sourcePlan.voiced, true);
  assert.equal(result.manifest.musicPreset.sourcePlan.sections.find((row) => row.eventId === "event-global").energy, 0.7);
  assert.equal(result.manifest.alignment.markAndHitBindings.some((row) => row.kind === "source-preset-drop" && row.eventId === "event-global" && row.canonicalFilmTimeSec === 1), true);
  assert.equal(result.manifest.runtime.sourceMixdownUsed, false);
  assert.equal(result.manifest.runtime.sourceVoiceDuckUsed, false);
  assert.equal(result.manifest.outputs.assets[0].wav.sampleRate, 48000);
  assert.equal(result.manifest.outputs.assets[0].wav.encoding, "pcm_f32le");
});

test("minor source-default /2 preset keeps its source key callback for rendered ding/chime SFX", async () => {
  const sample = await fixture({ local: false });
  const assetsDir = path.join(sample.directory, "generated-preset-tonal-sfx");
  await fs.mkdir(assetsDir, { recursive: true });
  const request = {
    format: "laohu.motion.huashu-audio-request/2",
    musicPreset: { product: "ai", variant: 0, seed: "preset-smoke", bpm: 100 },
    sfxEvents: [{ id: "preset-tonal-chime", eventId: "event-global", name: "chime", options: {}, sourceGain: 1, sourcePan: 0, mixGainDb: 0, seed: "preset-tonal-chime" }],
  };
  const basePlan = { schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2, events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [] };
  const requestPath = path.join(sample.directory, "preset-tonal-sfx-request.json");
  const basePlanPath = path.join(sample.directory, "preset-tonal-sfx-base-plan.json");
  const outputPlan = path.join(sample.directory, "preset-tonal-sfx-output-plan.json");
  const receiptPath = path.join(sample.directory, "preset-tonal-sfx-receipt.json");
  await fs.writeFile(requestPath, JSON.stringify(request));
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan));
  const film = await verifyFilmManifest(sample.manifestPath);
  const result = await generatePlan({
    request, basePlan, basePlanPath, film, inputFiles: [requestPath, basePlanPath, sample.manifestPath],
    assetsDir, projectRoot: sample.directory, outputPlan, manifestPath: receiptPath,
  });
  assert.equal(result.manifest.musicPreset.sourcePlan.scale, "minor");
  assert.equal(result.manifest.musicPreset.sourcePlan.rootMidi, 58);
  assert.deepEqual(result.manifest.keyContext, { rootMidi: 60, scale: "major" });
  assert.deepEqual(result.manifest.sfxKeyContext, { rootMidi: 58, scale: "minor", basis: "pinned-source-music-preset-plan" });

  const sfxEvent = result.plan.events.find((event) => event.bus === "sfx" && event.eventId === "event-global");
  assert.ok(sfxEvent, "generatePlan must add the requested tonal SFX event");
  const sfxAsset = result.plan.assets.find((asset) => asset.id === sfxEvent.assetId);
  assert.ok(sfxAsset?.source?.outputKind?.includes("SFX"));
  const actualWav = await fs.readFile(path.resolve(path.dirname(outputPlan), sfxAsset.file));
  const upstreamLib = path.join(repoRoot, ".agents", "skills", "laohu-motion", "templates", "upstream", "huashu-motion", "cli", "lib");
  const [sourceSound, sourceScore, sourceDsp] = await Promise.all([
    import(pathToFileURL(path.join(upstreamLib, "sound.js")).href),
    import(pathToFileURL(path.join(upstreamLib, "score.js")).href),
    import(pathToFileURL(path.join(upstreamLib, "dsp.js")).href),
  ]);
  const keyFor = (rootMidi, scale) => (degree, octave) => sourceDsp.mtof(sourceScore.deg({ root: rootMidi, scale }, Math.round(degree) - 1, octave - 4));
  const expectedSourceKey = renderOneSfx({
    upstream: { sound: sourceSound, dsp: sourceDsp }, name: "chime", kitName: "clean", options: {},
    sourceGain: 1, sourcePan: 0, seed: "preset-tonal-chime", key: keyFor(58, "minor"),
  });
  const defaultCKey = renderOneSfx({
    upstream: { sound: sourceSound, dsp: sourceDsp }, name: "chime", kitName: "clean", options: {},
    sourceGain: 1, sourcePan: 0, seed: "preset-tonal-chime", key: keyFor(60, "major"),
  });
  assert.deepEqual(actualWav, expectedSourceKey.wav, "rendered chime PCM must use the source preset root/scale");
  assert.notDeepEqual(actualWav, defaultCKey.wav, "rendered chime must not silently keep the SFX-only default C major key");
});

test("generated preset PCM matches the pinned source music branch before full mixdown", async () => {
  const sample = await fixture({ local: false });
  const upstreamLib = path.join(repoRoot, ".agents", "skills", "laohu-motion", "templates", "upstream", "huashu-motion", "cli", "lib");
  const originalSoundPath = path.join(upstreamLib, "sound.js");
  const originalSoundText = await fs.readFile(originalSoundPath, "utf8");
  const catalog = JSON.parse(await fs.readFile(path.join(repoRoot, ".agents", "skills", "laohu-motion", "templates", "catalog.json"), "utf8"));
  const pinnedSource = catalog.sources.find((row) => row.id === "huashu-motion");
  const pinnedSound = pinnedSource.files.find((row) => row.path === "cli/lib/sound.js");
  assert.equal(sha256(Buffer.from(originalSoundText)), pinnedSound.sha256);
  const probeRoot = path.join(sample.directory, "upstream-music-branch-probe");
  const probeLib = path.join(probeRoot, "cli", "lib");
  await fs.mkdir(path.dirname(probeLib), { recursive: true });
  await fs.cp(upstreamLib, probeLib, { recursive: true });
  await fs.copyFile(path.join(repoRoot, ".agents", "skills", "laohu-motion", "templates", "upstream", "huashu-motion", "package.json"), path.join(probeRoot, "package.json"));
  const marker = "    balanceLows(music);\n    duck(music, words);\n  }\n  const fx = new Track(p.duration);";
  assert.equal(originalSoundText.includes(marker), true, "pinned source music-branch probe point moved");
  const probeSource = originalSoundText.replace(marker, "    balanceLows(music);\n    if (process.env.LAOHU_PRESET_MUSIC_ONLY_PROBE === '1') return { presetPlan: p, music };\n    duck(music, words);\n  }\n  const fx = new Track(p.duration);");
  await fs.writeFile(path.join(probeLib, "sound.js"), probeSource);
  const probeSound = await import(`${pathToFileURL(path.join(probeLib, "sound.js")).href}?probe=${Date.now()}`);
  const vendorScore = await import(pathToFileURL(path.join(upstreamLib, "score.js")).href);
  const vendorDsp = await import(pathToFileURL(path.join(upstreamLib, "dsp.js")).href);
  const requestPlan = buildSourcePresetPlan({
    preset: {
      product: "ai", variant: 0, seed: "source-pcm-comparison", bpm: 96,
      sections: [{ eventId: "section-open", energy: 0.45 }, { eventId: "section-drop", energy: 0.8 }],
      dropEventId: "section-drop", ending: "button", endEventId: "section-drop",
    },
    durationSec: 4,
    resolvedEvents: new Map([
      ["section-open", { filmTimeSec: 0.2 }],
      ["section-drop", { filmTimeSec: 2.1 }],
    ]),
    id: "source-pcm-comparison",
    keyContext: { provided: false, rootMidi: 60, scale: "major" },
    voice: false,
  });
  const presetPlan = probeSound.plan(requestPlan.plan);
  const hits = [
    { name: "stamp", at: 1.94, gain: 0.8, eventId: "fixture-stamp" },
    { name: "impact", at: 1.97, gain: 0.6, eventId: "fixture-impact" },
  ];
  requestPlan.plan.hits = hits.map(({ name, at, gain }) => ({ name, at, gain }));
  const local = renderPresetStem({ upstream: { sound: probeSound, score: vendorScore, dsp: vendorDsp }, presetPlan, hits });
  const priorProbe = process.env.LAOHU_PRESET_MUSIC_ONLY_PROBE;
  const priorMix = process.env.OM_MIX;
  process.env.LAOHU_PRESET_MUSIC_ONLY_PROBE = "1";
  delete process.env.OM_MIX;
  try {
    const pinned = probeSound.mixdown(requestPlan.plan, { voiced: false, words: [] });
    assert.equal(pinned.presetPlan.style, presetPlan.style);
    assert.equal(pinned.presetPlan.scale, presetPlan.scale);
    assert.equal(pinned.music.n, local.track.n);
    assert.deepEqual(Buffer.from(pinned.music.L.buffer), Buffer.from(local.track.L.buffer));
    assert.deepEqual(Buffer.from(pinned.music.R.buffer), Buffer.from(local.track.R.buffer));
  } finally {
    if (priorProbe == null) delete process.env.LAOHU_PRESET_MUSIC_ONLY_PROBE;
    else process.env.LAOHU_PRESET_MUSIC_ONLY_PROBE = priorProbe;
    if (priorMix == null) delete process.env.OM_MIX;
    else process.env.OM_MIX = priorMix;
  }
});

test("recorded-required pack validates identities, uses decoded recorded files, rejects missing roles, and refuses silent decoder fallback", { skip: !ffmpegAvailable }, async () => {
  const sample = await fixture({ local: false });
  const packDir = await syntheticPianoPack(sample.directory);
  const fakeHome = path.join(sample.directory, "fake-home");
  await fs.mkdir(fakeHome, { recursive: true });
  const basePlan = { schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2, events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [] };
  const request = { format: "laohu.motion.huashu-audio-request/2", musicPreset: { style: "piano", seed: "recorded-piano", bpm: 80, samples: { mode: "recorded-required", packDir } } };
  const requestPath = path.join(sample.directory, "recorded-request.json");
  const basePlanPath = path.join(sample.directory, "recorded-base-plan.json");
  await fs.writeFile(requestPath, JSON.stringify(request));
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan));
  const film = await verifyFilmManifest(sample.manifestPath);
  const priorHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    await fs.mkdir(path.join(sample.directory, "recorded-output"), { recursive: true });
    const result = await generatePlan({
      request, basePlan, basePlanPath, film,
      inputFiles: [requestPath, basePlanPath, sample.manifestPath],
      assetsDir: path.join(sample.directory, "recorded-output"),
      projectRoot: sample.directory,
      outputPlan: path.join(sample.directory, "recorded-output-plan.json"),
      manifestPath: path.join(sample.directory, "recorded-output-receipt.json"),
    });
    const packReceipt = result.manifest.musicPreset.samplePack;
    assert.deepEqual(packReceipt.requiredInstrumentIds, ["celli", "piano", "violas", "violins"]);
    assert.equal(packReceipt.usedInstrumentIds.includes("piano"), true);
    assert.equal(packReceipt.decodeTrace.length > 0, true);
    assert.equal(packReceipt.usedFiles.every((row) => /^[a-f0-9]{64}$/.test(row.sha256)), true);
    assert.equal(packReceipt.usedFiles.every((row) => row.runtime.decoded), true);
    assert.equal(packReceipt.selectedFiles.every((row) => row.runtime.selectedForNoteOrRelease), true);
    assert.equal(packReceipt.manifest.sha256.length, 64);
    assert.match(result.manifest.runtime.samples, /^musicPreset only: recorded-required pack preflighted and traced/);
    assert.equal(result.manifest.runtime.sampleScopes.musicPreset.mode, "recorded-required");
    assert.equal(result.manifest.runtime.sampleScopes.sfx.mode, "not-rendered");
    assert.equal(await fs.stat(path.join(fakeHome, ".cache", "huashu-motion", "samples")).then(() => true, () => false), false);

    const runtimeSamples = await import(pathToFileURL(path.join(result.manifest.runtime.runtimeOverlay.root, "cli", "lib", "samples.js")).href);
    const releaseRelative = "piano/release.wav";
    const releaseSampler = runtimeSamples.samplerStereo("piano", { release: true });
    const releasedNote = releaseSampler(440, 0.05, 0.7, () => 0);
    assert.equal(releasedNote.L.length > 0, true);
    assert.equal(runtimeSamples.__laohuSampleTrace.decodedFiles.some((row) => row.file === releaseRelative), true);
    const releaseReceipt = buildRuntimeSampleUseReceipt(runtimeSamples.__laohuSampleTrace, packReceipt.files);
    const releaseRuntimeFile = releaseReceipt.usedFiles.find((row) => row.file === releaseRelative);
    assert.equal(releaseRuntimeFile.runtime.decoded, true);
    assert.equal(releaseRuntimeFile.runtime.selectedForNoteOrRelease, true);
    assert.deepEqual(releaseRuntimeFile.runtime.selectionKinds, ["release"]);

    const missingPack = path.join(sample.directory, "missing-role-pack");
    await fs.mkdir(missingPack, { recursive: true });
    await fs.writeFile(path.join(missingPack, "manifest.json"), JSON.stringify({ version: 2, instruments: {} }));
    await fs.writeFile(path.join(missingPack, "NOTICE.txt"), "No sample instruments in this pack.\n");
    const missingRequest = { ...request, musicPreset: { ...request.musicPreset, samples: { mode: "recorded-required", packDir: missingPack } } };
    await fs.mkdir(path.join(sample.directory, "missing-output"), { recursive: true });
    await assert.rejects(generatePlan({
      request: missingRequest, basePlan, basePlanPath, film,
      inputFiles: [requestPath, basePlanPath, sample.manifestPath],
      assetsDir: path.join(sample.directory, "missing-output"), projectRoot: sample.directory,
      outputPlan: path.join(sample.directory, "missing-output-plan.json"), manifestPath: path.join(sample.directory, "missing-output-receipt.json"),
    }), /lacks required instrument ID celli/);

    const fakeFfmpeg = path.join(sample.directory, "empty-sample-decoder.sh");
    await fs.writeFile(fakeFfmpeg, `#!/bin/sh\ncase " $* " in *" -f f32le "*) exit 0;; esac\nexec ${ffmpeg} "$@"\n`);
    await fs.chmod(fakeFfmpeg, 0o755);
    const priorFfmpeg = process.env.MOTION_FFMPEG;
    process.env.MOTION_FFMPEG = fakeFfmpeg;
    try {
      await fs.mkdir(path.join(sample.directory, "empty-decode-output"), { recursive: true });
      await assert.rejects(generatePlan({
        request, basePlan, basePlanPath, film,
        inputFiles: [requestPath, basePlanPath, sample.manifestPath],
        assetsDir: path.join(sample.directory, "empty-decode-output"), projectRoot: sample.directory,
        outputPlan: path.join(sample.directory, "empty-decode-plan.json"), manifestPath: path.join(sample.directory, "empty-decode-receipt.json"),
      }), /recorded sample decoder returned empty PCM/);
    } finally {
      if (priorFfmpeg == null) delete process.env.MOTION_FFMPEG;
      else process.env.MOTION_FFMPEG = priorFfmpeg;
    }
  } finally {
    if (priorHome == null) delete process.env.HOME;
    else process.env.HOME = priorHome;
  }
});

test("recorded-required music samples are isolated from synth-off lofi SFX even with an escaping wurli manifest row", { skip: !ffmpegAvailable }, async () => {
  const sample = await fixture({ local: false });
  const packDir = await syntheticPianoPack(sample.directory);
  const fakeHome = path.join(sample.directory, "fake-home");
  await fs.mkdir(fakeHome, { recursive: true });
  const request = {
    format: "laohu.motion.huashu-audio-request/2",
    musicPreset: { style: "piano", seed: "recorded-pack-sfx-isolation", bpm: 80, samples: { mode: "recorded-required", packDir } },
    sfxEvents: [{ id: "lofi-ding", eventId: "event-global", name: "ding", kit: "lofi" }],
  };
  const basePlan = { schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2, events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [] };
  const requestPath = path.join(sample.directory, "recorded-pack-sfx-request.json");
  const basePlanPath = path.join(sample.directory, "recorded-pack-sfx-base-plan.json");
  await fs.writeFile(requestPath, JSON.stringify(request));
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan));
  const film = await verifyFilmManifest(sample.manifestPath);
  const priorHome = process.env.HOME;
  const priorSamples = process.env.OM_SAMPLES;
  const priorRequired = process.env.LAOHU_REQUIRE_RECORDED;
  process.env.HOME = fakeHome;
  process.env.OM_SAMPLES = "caller-sample-pack-sentinel";
  process.env.LAOHU_REQUIRE_RECORDED = "caller-required-sentinel";
  const run = async (label) => {
    const assetsDir = path.join(sample.directory, `isolated-${label}-assets`);
    await fs.mkdir(assetsDir, { recursive: true });
    return generatePlan({
      request, basePlan, basePlanPath, film,
      inputFiles: [requestPath, basePlanPath, sample.manifestPath],
      assetsDir, projectRoot: sample.directory,
      outputPlan: path.join(sample.directory, `isolated-${label}-plan.json`),
      manifestPath: path.join(sample.directory, `isolated-${label}-receipt.json`),
    });
  };
  try {
    await setEscapingWurli(packDir, sample.directory, true);
    const withUnauthorizedRow = await run("with-wurli");
    assert.equal(process.env.OM_SAMPLES, packDir, "the music import setting is restored after the isolated SFX import");
    assert.equal(process.env.LAOHU_REQUIRE_RECORDED, "1", "the recorded music render setting is restored after the isolated SFX import");

    const musicReceipt = withUnauthorizedRow.manifest.runtime.sampleScopes.musicPreset;
    const sfxReceipt = withUnauthorizedRow.manifest.runtime.sampleScopes.sfx;
    assert.equal(musicReceipt.mode, "recorded-required");
    assert.equal(withUnauthorizedRow.manifest.musicPreset.samplePack.usedInstrumentIds.includes("piano"), true);
    assert.equal(withUnauthorizedRow.manifest.musicPreset.samplePack.usedInstrumentIds.includes("wurli"), false);
    assert.equal(sfxReceipt.mode, "synth-off");
    assert.equal(sfxReceipt.recordedSamplePackVisible, false);
    assert.equal(sfxReceipt.importPolicy.environmentBeforeFirstImport.OM_SAMPLES, "off");
    assert.equal(sfxReceipt.importPolicy.environmentBeforeFirstImport.LAOHU_REQUIRE_RECORDED, null);
    assert.equal(sfxReceipt.importPolicy.visiblePackAtFirstImport, false);
    assert.equal(sfxReceipt.importPolicy.packCacheInitializedNullBeforeEnvironmentRestore, true);
    assert.equal(sfxReceipt.importPolicy.environmentRestoredAfterImport, true);

    const sfxEvent = withUnauthorizedRow.plan.events.find((event) => event.bus === "sfx");
    const sfxAsset = withUnauthorizedRow.plan.assets.find((asset) => asset.id === sfxEvent.assetId);
    const actual = await fs.readFile(path.resolve(sample.directory, sfxAsset.file));
    assert.deepEqual(sfxAsset.source.sampleUse, {
      mode: "synth-off", recordedSamplePackVisible: false,
      sourceRuntime: sfxReceipt.runtimeRoot,
      packCacheInitializedNullBeforeEnvironmentRestore: true,
    });
    assert.match(sfxAsset.license, /no upstream sample pack/);
    const reference = await pinnedSynthOffSfx({
      root: withUnauthorizedRow.manifest.sfxKeyContext.rootMidi,
      scale: withUnauthorizedRow.manifest.sfxKeyContext.scale,
      seed: "ding:lofi-ding:1",
    });
    assert.deepEqual(actual, reference, "SFX PCM must match the pinned source lofi.ding synth-off function");

    const isolatedSamples = await import(pathToFileURL(path.join(sfxReceipt.runtimeRoot, "cli", "lib", "samples.js")).href);
    assert.equal(isolatedSamples.loadPack(), null, "the SFX runtime has cached no pack even after the music env is restored");
    assert.equal(await fs.stat(path.join(fakeHome, ".cache", "huashu-motion", "samples")).then(() => true, () => false), false);

    await setEscapingWurli(packDir, sample.directory, false);
    const withoutUnauthorizedRow = await run("without-wurli");
    const secondEvent = withoutUnauthorizedRow.plan.events.find((event) => event.bus === "sfx");
    const secondAsset = withoutUnauthorizedRow.plan.assets.find((asset) => asset.id === secondEvent.assetId);
    const secondPcm = await fs.readFile(path.resolve(sample.directory, secondAsset.file));
    assert.equal(secondAsset.sha256, sfxAsset.sha256, "adding or removing an unauthorized wurli entry cannot change synth-off SFX output");
    assert.deepEqual(secondPcm, actual);
    assert.equal(withoutUnauthorizedRow.manifest.runtime.sampleScopes.musicPreset.mode, "recorded-required");
    assert.equal(withoutUnauthorizedRow.manifest.runtime.sampleScopes.sfx.mode, "synth-off");
  } finally {
    if (priorHome == null) delete process.env.HOME;
    else process.env.HOME = priorHome;
    if (priorSamples == null) delete process.env.OM_SAMPLES;
    else process.env.OM_SAMPLES = priorSamples;
    if (priorRequired == null) delete process.env.LAOHU_REQUIRE_RECORDED;
    else process.env.LAOHU_REQUIRE_RECORDED = priorRequired;
  }
});

test("samples build rejects escaping output before mkdir and rejects unknown --only IDs without writing", async () => {
  const sample = await fixture({ local: false });
  const script = path.join(repoRoot, ".agents", "skills", "laohu-motion", "scripts", "huashu-audio.mjs");
  const sibling = path.join(path.dirname(sample.directory), path.basename(sample.directory) + "-external");
  await fs.mkdir(sibling, { recursive: true });
  const symlink = path.join(sample.directory, "external-link");
  await fs.symlink(sibling, symlink, "dir");
  const escapingOutput = path.join(symlink, "new-parent", "sample-pack");
  try {
    const escaped = spawnSync(process.execPath, [script, "samples", "build", "--out", escapingOutput, "--only", "piano"], {
      cwd: sample.directory,
      encoding: "utf8",
      env: { ...process.env, MOTION_FFMPEG: ffmpeg },
    });
    assert.notEqual(escaped.status, 0);
    assert.match(escaped.stderr, /must stay inside the current project root/);
    await assert.rejects(fs.stat(path.join(sibling, "new-parent")), { code: "ENOENT" });

    const unknownOutput = path.join(sample.directory, "unknown-id-pack");
    const unknown = spawnSync(process.execPath, [script, "samples", "build", "--out", unknownOutput, "--only", "__unknown_contract_probe__"], {
      cwd: sample.directory,
      encoding: "utf8",
      env: { ...process.env, MOTION_FFMPEG: ffmpeg },
    });
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /unsupported upstream instrument ID: __unknown_contract_probe__/);
    await assert.rejects(fs.stat(unknownOutput), { code: "ENOENT" });
  } finally {
    await fs.rm(sibling, { recursive: true, force: true });
  }
});

test("/2 selected BGM derives only its cropped track, maps canonical events through sourceIn/speed/timeMap, and rebases the replacement", { skip: !ffmpegAvailable }, async () => {
  const sample = await fixture({ local: true });
  const assetsDir = path.join(sample.directory, "generated-selected-bgm");
  await fs.mkdir(assetsDir, { recursive: true });
  const sourceFile = path.join(sample.directory, "selected-source.wav");
  const rendered = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6", "-ac", "2", "-c:a", "pcm_f32le", sourceFile], { encoding: "utf8" });
  assert.equal(rendered.status, 0, rendered.stderr || rendered.error?.message);
  const sourceBytes = await fs.readFile(sourceFile);
  const sourceAsset = { id: "selected-source", file: "selected-source.wav", durationSec: 6, sha256: sha256(sourceBytes), license: "Neutral technical test fixture", redistribution: { status: "project-generated", basis: "Synthetic sine wave used only as a local clock fixture." }, reviewStatus: "generated-unreviewed" };
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2,
    events: [], tracks: [{ id: "selected-bgm-track", assetId: sourceAsset.id, bus: "music", startSec: 0, speed: 1.5, sourceInSec: 0.5, sourceOutSec: 4, timeMapId: "time-segment-1", gainDb: -4 }],
    voiceWindows: [], automation: [{ id: "manual-hit-duck", eventId: "event-local", bus: "music", startSec: 0.49, endSec: 0.62, gainDb: -4 }], timeMaps: [{ id: sample.timeMap.id, segmentId: sample.timeMap.segmentId, localStartSec: sample.timeMap.localStartSec, localEndSec: sample.timeMap.localEndSec, filmStartSec: sample.timeMap.filmStartSec, speed: sample.timeMap.speed, sourceRange: sample.timeMap.sourceRange, frameRange: sample.timeMap.frameRange }], assets: [sourceAsset], generatedAssets: [],
  };
  const request = {
    format: "laohu.motion.huashu-audio-request/2", musicMixGainDb: -1,
    musicPreset: { style: "piano", seed: "selected-bgm", bpm: 100, selectedMusicTrackId: "selected-bgm-track", sections: [{ eventId: "event-local", energy: 0.8 }], ending: "button", endEventId: "event-local" },
    sfxEvents: [
      { id: "impact-at-local-event", eventId: "event-local", name: "impact" },
      { id: "tonal-chime-on-unmeasured-bgm", eventId: "event-local", name: "chime" },
    ],
  };
  const requestPath = path.join(sample.directory, "selected-bgm-request.json");
  const basePlanPath = path.join(sample.directory, "selected-bgm-base-plan.json");
  const outputPlan = path.join(sample.directory, "selected-bgm-output-plan.json");
  const receiptPath = path.join(sample.directory, "selected-bgm-receipt.json");
  await fs.writeFile(requestPath, JSON.stringify(request));
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan));
  const film = await verifyFilmManifest(sample.manifestPath);
  const result = await generatePlan({ request, basePlan, basePlanPath, film, inputFiles: [requestPath, basePlanPath, sample.manifestPath], assetsDir, projectRoot: sample.directory, outputPlan, manifestPath: receiptPath });
  assert.equal(result.plan.tracks.length, 1);
  assert.equal(result.plan.tracks[0].id, "selected-bgm-track");
  assert.equal(result.plan.tracks[0].assetId.startsWith("laohu-music-"), true);
  assert.equal(result.plan.tracks[0].sourceInSec, 0);
  assert.equal(result.plan.tracks[0].sourceOutSec, 3.5);
  assert.equal(result.plan.tracks[0].speed, 1.5);
  assert.equal(result.plan.tracks[0].timeMapId, "time-segment-1");
  assert.equal(result.plan.tracks[0].gainDb, -5);
  assert.equal(result.manifest.musicPreset.selectedSource.effectiveSpeed, 3);
  assert.equal(result.manifest.musicPreset.selectedSource.sourceInSec, 0.5);
  assert.equal(result.manifest.musicPreset.selectedSource.sourceOutSec, 4);
  assert.deepEqual(result.manifest.sfxKeyContext, { rootMidi: 60, scale: "major", basis: "default-request-keyContext; selected source BGM tonal center unmeasured" });
  const section = result.manifest.alignment.markAndHitBindings.find((row) => row.kind === "source-preset-section");
  assert.equal(section.canonicalFilmTimeSec, 0.5);
  assert.equal(section.sourceMusicSec, 1.5);
  assert.equal(result.manifest.musicPreset.automationResolution.suppressedDerivedDucks.length, 1);
  assert.equal(result.manifest.musicPreset.automationResolution.suppressedDerivedDucks[0].eventId, "event-local");
  assert.equal(result.manifest.musicPreset.automationResolution.suppressedDerivedDucks[0].reason, "same-canonical-event-manual-automation-wins");
  assert.equal(result.manifest.musicPreset.automationResolution.appliedDerivedDuckEventIds.includes("event-local"), false);
});

test("derived hit ducks yield to same-event or overlapping manual music automation in film time", () => {
  const hitA = { eventId: "event-a", name: "impact", at: 1.5, filmTimeSec: 0.5 };
  const hitB = { eventId: "event-b", name: "shutter", at: 2.5, filmTimeSec: 2 };
  const hitC = { eventId: "event-c", name: "hit", at: 4, filmTimeSec: 4 };
  const result = resolveDerivedDuckHits({
    hits: [hitA, hitB, hitC],
    effectiveSpeed: 3,
    manualAutomation: [
      { id: "exact-owner", bus: "music", eventId: "event-a", startSec: 2.8, endSec: 2.9 },
      { id: "overlap-film-range", bus: "music", startSec: 1.99, endSec: 2.05 },
      { id: "unrelated", bus: "music", startSec: 3, endSec: 3.2 },
    ],
  });
  assert.deepEqual(result.applied.map((hit) => hit.eventId), ["event-c"]);
  assert.deepEqual(result.suppressed.map((row) => row.reason), [
    "same-canonical-event-manual-automation-wins",
    "overlapping-film-range-manual-automation-wins",
  ]);
  assert.deepEqual(result.suppressed[0].derivedDuckFilmRangeSec, [0.5 - 0.01 / 3, 0.5 + 0.38 / 3]);
});

test("refuses to move a non-empty base plan with relative assets and ASR evidence", async () => {
  const sample = await fixture({ local: false });
  const request = { format: "laohu.motion.huashu-audio-request/1", sfxEvents: [{ id: "tick", eventId: "event-global", name: "tick" }] };
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2,
    events: [], tracks: [{ id: "locked-voice-track", assetId: "voice", bus: "voice", startSec: 0, locked: true }],
    voiceWindows: [{ id: "voice-window", startSec: 0.5, endSec: 1.5 }],
    automation: [], timeMaps: [], assets: [{ id: "voice", file: "audio/voice.wav", durationSec: 3, sha256: "a".repeat(64), license: "test", redistribution: { status: "project-generated", basis: "test" }, reviewStatus: "generated-unreviewed" }], generatedAssets: [],
    asrcutBinding: { format: "laohu.motion.asrcut-audio-binding/1", evidence: { editPlan: "./frozen-edit-plan.json", timeline: "./timeline.json", receipt: "./voice.wav.artifact.json" } },
  };
  const basePlanPath = path.join(sample.directory, "base-plan.json");
  const requestPath = path.join(sample.directory, "request.json");
  const movedDirectory = path.join(sample.directory, "moved-plan");
  await fs.mkdir(movedDirectory, { recursive: true });
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan));
  await fs.writeFile(requestPath, JSON.stringify(request));
  const film = await verifyFilmManifest(sample.manifestPath);
  await assert.rejects(generatePlan({
    request, basePlan, basePlanPath, film, inputFiles: [requestPath, basePlanPath, sample.manifestPath],
    assetsDir: path.join(sample.directory, "generated"), projectRoot: sample.directory,
    outputPlan: path.join(movedDirectory, "output-plan.json"), manifestPath: path.join(movedDirectory, "receipt.json"),
  }), /same directory.*relative asset files and ASR evidence references/);
});

test("float WAV preserves over-range PCM without clipping and rejects non-finite samples", () => {
  assert.throws(() => floatWav({ n: 2, L: new Float32Array([1.25, Number.NEGATIVE_INFINITY]), R: new Float32Array([-1.5, 0]) }), /non-finite/);
  const valid = floatWav({ n: 1, L: new Float32Array([1.25]), R: new Float32Array([-1.5]) });
  const facts = wavFacts(valid);
  assert.equal(valid.readFloatLE(44), 1.25);
  assert.equal(valid.readFloatLE(48), -1.5);
  assert.equal(facts.overRangeSampleCount, 2);
  assert.equal(facts.peakAboveFullScalePreserved, true);
});
