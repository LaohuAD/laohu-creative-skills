import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildSourcePresetPlan,
  buildComposerHitRows,
  buildRuntimeSampleUseReceipt,
  floatWav,
  generatePlan as generatePlanRaw,
  renderOneSfx,
  renderPresetStem,
  resolveDerivedDuckHits,
  resolveNativePresetVoicePolicy,
  resolveSourceEvents,
  resolveSourceFxLevelGainDb,
  verifyFilmManifest,
  wavFacts,
} from "../scripts/huashu-audio.mjs";
import { generatedAudioAssetIds, generatedAudioAssetScopes, renderAudioPlan, validateAudioPolicy, validatePlan } from "../scripts/audio.mjs";
import { editSourceWav, readWavInfo } from "../../laohu-arrangement/scripts/audio-edit.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const skillDir = path.join(repoRoot, ".agents", "skills", "laohu-motion");
const sourceLedger = JSON.parse(fsSync.readFileSync(path.join(skillDir, "templates", "maintenance", "source-ledger.json"), "utf8"));
const sourceRoot = process.env.MOTION_SOURCE_ROOT ? path.resolve(process.env.MOTION_SOURCE_ROOT) : null;
const huashuMotionSource = sourceLedger.sources.find((row) => row.id === "huashu-motion");
const audioSourcePaths = ["package.json", ...(huashuMotionSource?.files || []).map((row) => row.path).filter((file) => file.startsWith("cli/lib/"))];
const cacheRoot = process.env.MOTION_AUDIO_TEST_TMP_DIR
  ? path.resolve(process.env.MOTION_AUDIO_TEST_TMP_DIR)
  : path.join(repoRoot, ".cache", "tmp", "motion-local-integration", "audio");
const fixtures = [];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ffmpeg = process.env.MOTION_TEST_FFMPEG || process.env.MOTION_FFMPEG || "ffmpeg";
const ffprobe = process.env.MOTION_TEST_FFPROBE
  || (path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), "ffprobe") : "ffprobe");
const ffmpegAvailable = spawnSync(ffmpeg, ["-version"], { encoding: "utf8" }).status === 0;
const ffprobeAvailable = spawnSync(ffprobe, ["-version"], { encoding: "utf8" }).status === 0;

async function authorizeSyntheticTestAudio(plan, directory) {
  const requestPath = path.join(directory, "synthetic-audio-test-request.json");
  const requestAuth = {
    granted: true,
    scopes: ["music"],
    source: "explicit-user-request",
    instructionExcerpt: "Authorize synthetic PCM only for this isolated automated mixer regression fixture.",
  };
  const requestBytes = Buffer.from(JSON.stringify({ generationAuthorization: requestAuth }));
  await fs.writeFile(requestPath, requestBytes);
  const requestSha256 = sha256(requestBytes);
  const generatedScopesByAsset = [...generatedAudioAssetScopes(plan)].map(([assetId, scopes]) => ({
    assetId,
    scopes,
    authorizationRequestSha256: requestSha256,
  }));
  plan.audioPolicy = {
    format: "laohu.motion.audio-policy/1",
    mode: "explicit-user-authorized-generation",
    authorizations: [{ ...requestAuth, requestPath: path.basename(requestPath), requestSha256 }],
    generatedScopesByAsset,
    generatedAssetIds: generatedScopesByAsset.map((row) => row.assetId).sort(),
  };
  return plan;
}

function sourceSkipReason(relativePaths = audioSourcePaths) {
  if (!sourceRoot) return "MOTION_SOURCE_ROOT is unset; source PCM comparison skipped";
  const missing = relativePaths.find((relativePath) => !fsSync.existsSync(path.join(sourceRoot, "huashu-motion", relativePath)));
  return missing ? `MOTION_SOURCE_ROOT is missing huashu-motion/${missing}; source PCM comparison skipped` : false;
}
function decodeStereoFloat(file) {
  const decoded = spawnSync(ffmpeg, ["-nostdin", "-v", "error", "-i", file, "-map", "0:a:0", "-vn", "-ac", "2", "-ar", "48000", "-f", "f32le", "pipe:1"], {
    encoding: null, maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(decoded.error, undefined, decoded.error?.message);
  assert.equal(decoded.status, 0, decoded.stderr?.toString("utf8") || "float PCM decode failed");
  assert.ok(decoded.stdout.length > 0 && decoded.stdout.length % 8 === 0, "decoded audio must contain stereo float frames");
  return decoded.stdout;
}

function stereoFloatRmsWindow(bytes, startSec, endSec) {
  const first = Math.max(0, Math.round(startSec * 48000));
  const last = Math.min(bytes.length / 8, Math.round(endSec * 48000));
  let sum = 0, count = 0;
  for (let frame = first; frame < last; frame += 1) {
    const left = bytes.readFloatLE(frame * 8), right = bytes.readFloatLE(frame * 8 + 4);
    sum += left * left + right * right;
    count += 2;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function dbfs(rms) { return 20 * Math.log10(Math.max(rms, 1e-12)); }

function requiredFixtureGenerationScopes({ request, basePlan, film }) {
  const scopes = new Set();
  if (request.composition) {
    scopes.add("music");
    if ((request.bindings?.hitRiseCues || []).length) scopes.add("sfx");
  }
  if (request.musicPreset && !request.musicPreset.selectedMusicTrackId) scopes.add("music");
  if ((request.sfxEvents || []).length || (film.scene?.audioEvents || []).some((event) => event?.sourceAudio)) scopes.add("sfx");
  if (!(request.composition || request.musicPreset) && !(basePlan.tracks || []).some((track) => track.bus === "music")) {
    if ((film.nativeSourceCompositions || []).length || (film.nativeSourcePresetPlans || []).length) scopes.add("music");
    if ((film.nativeSourceSfxOnlyPlans || []).length) scopes.add("sfx");
  }
  return [...scopes].sort();
}

async function generatePlan(args) {
  const request = structuredClone(args.request);
  const scopes = requiredFixtureGenerationScopes({ request, basePlan: args.basePlan, film: args.film });
  if (!scopes.length || request.generationAuthorization) return generatePlanRaw(args);
  const requestFilePath = args.requestFilePath || (args.inputFiles || []).find((candidate) => {
    try {
      const fileRequest = JSON.parse(fsSync.readFileSync(candidate, "utf8"));
      delete fileRequest.generationAuthorization;
      const comparableRequest = structuredClone(args.request);
      delete comparableRequest.generationAuthorization;
      return JSON.stringify(fileRequest) === JSON.stringify(comparableRequest);
    }
    catch { return false; }
  }) || (args.inputFiles || []).find((candidate) => {
    try { return JSON.parse(fsSync.readFileSync(candidate, "utf8")).format === args.request.format; }
    catch { return false; }
  });
  assert.ok(requestFilePath, "generated fixture must pin the request file so test authorization can be hash-bound");
  request.generationAuthorization = {
    granted: true,
    scopes,
    source: "explicit-user-request",
    instructionExcerpt: "Authorized isolated test fixture synthesis for this generated-audio route.",
  };
  const requestBytes = Buffer.from(JSON.stringify(request));
  await fs.writeFile(requestFilePath, requestBytes);
  return generatePlanRaw({ ...args, request, requestFilePath, requestFileSha256: sha256(requestBytes) });
}

function readPinnedSource(relativePath) {
  const pin = huashuMotionSource?.files?.find((row) => row.path === relativePath);
  assert.ok(pin, `maintenance source ledger must pin huashu-motion/${relativePath}`);
  const bytes = fsSync.readFileSync(path.join(sourceRoot, "huashu-motion", relativePath));
  assert.equal(sha256(bytes), pin.sha256, `huashu-motion/${relativePath} must match maintenance source-ledger SHA-256`);
  return bytes;
}
async function verifyPinnedSourceTree(relativeDir = "cli/lib") {
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        const relativePath = path.relative(path.join(sourceRoot, "huashu-motion"), absolute).split(path.sep).join("/");
        readPinnedSource(relativePath);
      }
    }
  }
  await visit(path.join(sourceRoot, "huashu-motion", relativeDir));
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function fixture({ local = true, asrcut = false, preserveAt = null } = {}) {
  let directory;
  if (preserveAt) {
    directory = path.resolve(preserveAt);
    await fs.mkdir(path.dirname(directory), { recursive: true });
    await fs.mkdir(directory);
  } else {
    await fs.mkdir(cacheRoot, { recursive: true });
    directory = await fs.mkdtemp(path.join(cacheRoot, "fixture-"));
    fixtures.push(directory);
  }
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
  await verifyPinnedSourceTree();
  readPinnedSource("package.json");
  const sourceProjectRoot = path.join(sourceRoot, "huashu-motion");
  const referenceRoot = await fs.mkdtemp(path.join(cacheRoot, "pinned-synth-off-reference-"));
  fixtures.push(referenceRoot);
  const sourceLib = path.join(sourceProjectRoot, "cli", "lib");
  const referenceLib = path.join(referenceRoot, "cli", "lib");
  await fs.mkdir(path.dirname(referenceLib), { recursive: true });
  await fs.cp(sourceLib, referenceLib, { recursive: true });
  await fs.copyFile(path.join(sourceProjectRoot, "package.json"), path.join(referenceRoot, "package.json"));
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

test("SFX wrapper rejects ignored options and accepts options consumed by the selected source function", () => {
  class FakeTrack {
    constructor(duration) { this.n = Math.round(duration * 48000); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); }
    add(signal, at, gain = 1, pan = 0) {
      const offset = Math.round(at * 48000);
      const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
      const leftGain = Math.cos(angle) * gain * Math.SQRT2, rightGain = Math.sin(angle) * gain * Math.SQRT2;
      for (let index = 0; index < signal.length && offset + index < this.n; index += 1) {
        this.L[offset + index] += signal[index] * leftGain;
        this.R[offset + index] += signal[index] * rightGain;
      }
    }
  }
  const upstream = {
    sound: {
      Track: FakeTrack,
      SFX: {
        ding: { fn: (opts) => { const pitch = opts.pitch; return { sig: new Float32Array([pitch / 1000]), lead: 0 }; } },
      },
      KITS: { clean: {} },
    },
    dsp: { rng: () => () => 0.25 },
  };
  assert.throws(() => renderOneSfx({ upstream, name: "ding", kitName: "clean", options: { color: "blue" }, sourceGain: 1, sourcePan: 0, seed: "stable", key: () => 440 }), /option color is not read/);
  const rendered = renderOneSfx({ upstream, name: "ding", kitName: "clean", options: { pitch: 880 }, sourceGain: 1, sourcePan: 0, seed: "stable", key: () => 440 });
  assert.equal(rendered.options.pitch, 880);
});

test("generated audio detection is independent of review status and follows only generated lineage", () => {
  const requestSha256 = "a".repeat(64);
  const auth = {
    granted: true,
    scopes: ["music"],
    source: "explicit-user-request",
    instructionExcerpt: "Explicit test authorization for generating a music source.",
    requestPath: "request.json",
    requestSha256,
  };
  const generatedPlan = (reviewStatus, source = {}) => {
    const plan = {
      events: [],
      tracks: [{ id: "music-track", assetId: "generated-music", bus: "music", startSec: 0 }],
      assets: [{
        id: "generated-music", file: "generated.wav", durationSec: 1, sha256: "b".repeat(64),
        redistribution: { status: "project-generated", basis: "technical test" },
        reviewStatus,
        source: { generationMode: "original-synthesis", generationScopes: ["music"], ...source },
      }],
      audioPolicy: {
        format: "laohu.motion.audio-policy/1",
        mode: "explicit-user-authorized-generation",
        authorizations: [auth],
        generatedScopesByAsset: [{ assetId: "generated-music", scopes: ["music"], authorizationRequestSha256: requestSha256 }],
        generatedAssetIds: ["generated-music"],
      },
    };
    return plan;
  };
  for (const status of ["generated-unreviewed", "candidate-unreviewed", "ready"]) {
    const plan = generatedPlan(status);
    assert.deepEqual(generatedAudioAssetIds(plan), ["generated-music"], `${status} must not hide original synthesis`);
    assert.equal(validateAudioPolicy(plan).status, "explicit-user-authorized-generation");
  }

  const generatedParent = {
    assetId: "source-generated",
    sha256: "c".repeat(64),
    generationMode: "original-synthesis",
    generationScopes: ["music"],
    generationAuthorizationRequestSha256: requestSha256,
    redistributionStatus: "project-generated",
  };
  const derivedGenerated = generatedPlan("candidate-unreviewed", {
    generationMode: "audio-edit",
    generationScopes: ["music"],
    parent: generatedParent,
  });
  assert.deepEqual(generatedAudioAssetIds(derivedGenerated), ["generated-music"]);

  const derivedLicensed = generatedPlan("candidate-unreviewed", {
    generationMode: "source-edit",
    parent: {
      assetId: "licensed-source",
      sha256: "d".repeat(64),
      generationMode: "source-recording",
      redistributionStatus: "CC0-1.0",
    },
  });
  derivedLicensed.assets[0].redistribution = { status: "CC0-1.0", basis: "inherited test source" };
  derivedLicensed.audioPolicy = undefined;
  assert.deepEqual(generatedAudioAssetIds(derivedLicensed), [], "an edited licensed source is not original synthesis");

  const derivedMixed = generatedPlan("candidate-unreviewed", {
    generationMode: "audio-edit",
    generationScopes: ["music"],
    parents: [
      { assetId: "licensed-layer", sha256: "2".repeat(64), generationMode: "indexed-source", redistributionStatus: "redistributable" },
      generatedParent,
    ],
  });
  assert.deepEqual(generatedAudioAssetIds(derivedMixed), ["generated-music"], "a multi-layer audio edit retains generated ancestry when any parent was synthesized");

  const derivedNested = generatedPlan("ready", {
    generationMode: "audio-edit",
    generationScopes: ["music"],
    parent: {
      assetId: "edited-source",
      sha256: "3".repeat(64),
      generationMode: "source-edit",
      redistributionStatus: "project-generated",
      parent: generatedParent,
    },
  });
  assert.deepEqual(generatedAudioAssetIds(derivedNested), ["generated-music"], "nested source edits cannot hide an original-synthesis ancestor");

  const multiLicensed = generatedPlan("candidate-unreviewed", {
    generationMode: "audio-edit",
    parents: [
      { assetId: "licensed-layer-a", sha256: "4".repeat(64), generationMode: "indexed-source", redistributionStatus: "redistributable" },
      { assetId: "licensed-layer-b", sha256: "5".repeat(64), generationMode: "source-recording", redistributionStatus: "licensed-sync-only" },
    ],
  });
  multiLicensed.assets[0].redistribution = { status: "redistributable", basis: "all inputs are finished licensed sources" };
  multiLicensed.audioPolicy = undefined;
  assert.deepEqual(generatedAudioAssetIds(multiLicensed), [], "a multi-layer edit of declared finished sources does not become original synthesis");

  const lockedVoice = {
    events: [],
    tracks: [{ id: "locked-voice", assetId: "locked-voice", bus: "voice", startSec: 0, locked: true }],
    assets: [{ id: "locked-voice", file: "voice.wav", durationSec: 1, sha256: "e".repeat(64), redistribution: { status: "project-generated", basis: "user supplied recording" }, reviewStatus: "generated-unreviewed" }],
  };
  assert.deepEqual(generatedAudioAssetIds(lockedVoice), [], "a locked voice track is user/source audio, not a generated music/SFX route");
});

test("generation authorization is exact to the required sound role", () => {
  const requestSha256 = "f".repeat(64);
  const plan = {
    events: [{ id: "sfx-event", assetId: "generated-sfx", bus: "sfx" }],
    tracks: [],
    assets: [{
      id: "generated-sfx", file: "generated-sfx.wav", durationSec: 1, sha256: "1".repeat(64),
      reviewStatus: "candidate-unreviewed",
      redistribution: { status: "project-generated", basis: "test" },
      source: { generationMode: "original-synthesis", generationScopes: ["sfx"] },
    }],
    audioPolicy: {
      format: "laohu.motion.audio-policy/1", mode: "explicit-user-authorized-generation",
      authorizations: [{ granted: true, scopes: ["music"], source: "explicit-user-request", instructionExcerpt: "Explicitly authorize music generation only.", requestPath: "request.json", requestSha256 }],
      generatedScopesByAsset: [{ assetId: "generated-sfx", scopes: ["sfx"], authorizationRequestSha256: requestSha256 }],
      generatedAssetIds: ["generated-sfx"],
    },
  };
  assert.throws(() => validateAudioPolicy(plan), /does not grant sfx generation/);
  plan.audioPolicy.authorizations[0].scopes = ["sfx"];
  plan.audioPolicy.authorizations[0].instructionExcerpt = "做音效";
  assert.equal(validateAudioPolicy(plan).status, "explicit-user-authorized-generation", "a short but real explicit authorization is valid");
});

test("SFX-only request renders a public source function and audio.mjs consumes it without adding music", { skip: !ffmpegAvailable }, async () => {
  const sample = await fixture({ local: true });
  const assetsDir = path.join(sample.directory, "generated");
  await fs.mkdir(assetsDir, { recursive: true });
  const lockedSilence = floatWav({ n: 3 * 48000, L: new Float32Array(3 * 48000), R: new Float32Array(3 * 48000) });
  await fs.writeFile(path.join(sample.directory, "locked-silence.wav"), lockedSilence);
  const film = await verifyFilmManifest(sample.manifestPath);
  const request = {
    format: "laohu.motion.huashu-audio-request/1",
    sfxKit: "clean",
    sfxEvents: [{ id: "technical-tick", eventId: "event-local", name: "tick", options: {}, sourceGain: 0.5, sourcePan: 0, mixGainDb: -3, seed: "technical-seed" }],
  };
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2,
    events: [{ id: "huashu-sfx-event-legacy", eventId: "event-local", assetId: "huashu-sfx-legacy000000", bus: "sfx", gainDb: 0, timeMapId: "time-segment-1" }], tracks: [{ id: "locked-voice-track", assetId: "locked-voice", bus: "voice", startSec: 0, locked: true }],
    voiceWindows: [{ id: "voice-window", startSec: 0.5, endSec: 1.5 }],
    ducking: { targetGainDb: -12, attackSec: 0.05, releaseSec: 0.1 },
    automation: [], timeMaps: [...film.maps.values()],
    assets: [
      { id: "locked-voice", file: "locked-silence.wav", durationSec: 3, sha256: sha256(lockedSilence), license: "Project-generated test fixture", redistribution: { status: "project-generated", basis: "Neutral local silence used only for this technical test." }, reviewStatus: "generated-unreviewed" },
      { id: "huashu-sfx-legacy000000", file: "locked-silence.wav", durationSec: 3, sha256: sha256(lockedSilence), license: "CC0-1.0 test fixture", redistribution: { status: "redistributable", syncUse: "allowed", basis: "Neutral CC0 source fixture used to verify legacy event identity preservation." }, reviewStatus: "candidate-unreviewed" },
    ],
    generatedAssets: [],
  };
  const requestPath = path.join(sample.directory, "sfx-only-request.json");
  const basePlanPath = path.join(sample.directory, "sfx-only-base-plan.json");
  const outputPlan = path.join(sample.directory, "sfx-only-output-plan.json");
  const receiptPath = path.join(sample.directory, "sfx-only-receipt.json");
  await fs.writeFile(requestPath, JSON.stringify(request));
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan));
  await assert.rejects(generatePlan({
    request: { ...request, musicMixGainDb: -3 }, basePlan, basePlanPath, film,
    inputFiles: [requestPath, basePlanPath, sample.manifestPath],
    assetsDir, projectRoot: sample.directory, outputPlan, manifestPath: receiptPath,
  }), /musicMixGainDb requires a music source.*SFX-only level belongs to each sfxEvents/);
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
  assert.equal(result.plan.events.length, 2);
  const legacySfxEvent = result.plan.events.find((event) => event.id === "huashu-sfx-event-legacy");
  assert.deepEqual(legacySfxEvent, basePlan.events[0], "legacy Huashu SFX IDs remain readable and unchanged");
  const generatedSfxEvent = result.plan.events.find((event) => event.id.startsWith("laohu-sfx-event-"));
  assert.equal(generatedSfxEvent.eventId, "event-local");
  assert.equal(generatedSfxEvent.timeMapId, "time-segment-1");
  const generatedSfxAsset = result.plan.assets.find((asset) => asset.id.startsWith("laohu-sfx-"));
  assert.match(generatedSfxEvent.id, /^laohu-sfx-event-/);
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
    "--allow-candidate",
    "--allow-generated-preview",
  ], { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(consumer.status, 0, consumer.stderr || consumer.stdout);
  assert.match(consumer.stdout, /AUDIO_STREAM true/);
  assert.equal((await fs.stat(mixPath)).isFile(), true);
  const mixReceipt = JSON.parse(await fs.readFile(mixManifestPath, "utf8"));
  assert.equal(mixReceipt.events.length, 2);
  assert.equal(mixReceipt.events.some((event) => event.id === "huashu-sfx-event-legacy"), true);
  assert.equal(mixReceipt.events.some((event) => event.id.startsWith("laohu-sfx-event-")), true);
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
  const originalRequestSha256 = sha256(await fs.readFile(requestPath));
  const rawArgs = {
    request, basePlan, basePlanPath, film, inputFiles: [requestPath, basePlanPath, sample.manifestPath],
    requestFilePath: requestPath, requestFileSha256: originalRequestSha256,
    assetsDir, projectRoot: sample.directory,
    outputPlan: path.join(sample.directory, "unauthorized-output-plan.json"),
    manifestPath: path.join(sample.directory, "unauthorized-receipt.json"),
  };
  await assert.rejects(generatePlanRaw(rawArgs), /requires an explicit user request granting exactly the required music\/sfx scope/);
  assert.deepEqual(await fs.readdir(assetsDir), [], "unauthorized program synthesis must fail before writing any audio asset");
  const wrongScopeRequest = {
    ...request,
    generationAuthorization: { granted: true, scopes: ["sfx"], source: "explicit-user-request", instructionExcerpt: "做音效" },
  };
  const wrongScopePath = path.join(sample.directory, "wrong-scope-request.json");
  const wrongScopeBytes = Buffer.from(JSON.stringify(wrongScopeRequest));
  await fs.writeFile(wrongScopePath, wrongScopeBytes);
  await assert.rejects(generatePlanRaw({
    ...rawArgs,
    request: wrongScopeRequest,
    requestFilePath: wrongScopePath,
    requestFileSha256: sha256(wrongScopeBytes),
    outputPlan: path.join(sample.directory, "wrong-scope-output-plan.json"),
    manifestPath: path.join(sample.directory, "wrong-scope-receipt.json"),
  }), /does not grant required music generation scope/);
  assert.deepEqual(await fs.readdir(assetsDir), [], "an SFX-only authorization must not synthesize music");
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

  const policyBypassPlan = JSON.parse(JSON.stringify(result.plan));
  delete policyBypassPlan.audioPolicy;
  policyBypassPlan.assets[0].reviewStatus = "candidate-unreviewed";
  const policyBypassPlanPath = path.join(sample.directory, "policy-bypass-plan.json");
  const policyBypassMixPath = path.join(sample.directory, "policy-bypass-mix.wav");
  const policyBypassReceiptPath = path.join(sample.directory, "policy-bypass-mix.receipt.json");
  await fs.writeFile(policyBypassPlanPath, JSON.stringify(policyBypassPlan));
  const blockedMixer = spawnSync(process.execPath, [
    path.join(skillDir, "scripts", "audio.mjs"),
    "--plan", policyBypassPlanPath,
    "--asset-index", path.join(skillDir, "assets", "audio", "index.json"),
    "--output", policyBypassMixPath,
    "--manifest", policyBypassReceiptPath,
    "--cache-dir", path.join(sample.directory, "policy-bypass-cache"),
    "--ffmpeg", ffmpeg,
    "--allow-candidate", "--allow-generated-preview",
  ], { cwd: repoRoot, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  assert.notEqual(blockedMixer.status, 0, "technical preview switches cannot authorize original synthesis");
  assert.match(blockedMixer.stderr, /Program-generated audio requires an explicit, role-scoped user authorization/);
  assert.equal(await fs.access(policyBypassMixPath).then(() => true, () => false), false, "mixer rejects missing policy before writing its output");

  const legacyReplayPlan = JSON.parse(JSON.stringify(result.plan));
  delete legacyReplayPlan.audioPolicy;
  legacyReplayPlan.assets[0].reviewStatus = "ready";
  const legacyReplayPlanPath = path.join(sample.directory, "legacy-replay-plan.json");
  const legacyReplayMixPath = path.join(sample.directory, "legacy-replay-mix.wav");
  const legacyReplayReceiptPath = path.join(sample.directory, "legacy-replay-mix.receipt.json");
  await fs.writeFile(legacyReplayPlanPath, JSON.stringify(legacyReplayPlan));
  const legacyReplayMixer = spawnSync(process.execPath, [
    path.join(skillDir, "scripts", "audio.mjs"),
    "--plan", legacyReplayPlanPath,
    "--asset-index", path.join(skillDir, "assets", "audio", "index.json"),
    "--output", legacyReplayMixPath,
    "--manifest", legacyReplayReceiptPath,
    "--cache-dir", path.join(sample.directory, "legacy-replay-cache"),
    "--ffmpeg", ffmpeg,
    "--legacy-replay",
  ], { cwd: repoRoot, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(legacyReplayMixer.status, 0, legacyReplayMixer.stderr || legacyReplayMixer.stdout);
  const legacyReplayReceipt = JSON.parse(await fs.readFile(legacyReplayReceiptPath, "utf8"));
  assert.equal(legacyReplayReceipt.productionRoute, "legacy-project-replay");
  assert.equal(legacyReplayReceipt.audioGenerationPolicy.status, "legacy-replay");
  assert.equal(legacyReplayReceipt.technicalPreview, true, "a ready asset cannot turn legacy replay into an ordinary new production route");

  const expectedTrackId = result.plan.tracks.find((track) => track.bus === "music").id;
  const collisionPlan = JSON.parse(JSON.stringify(result.plan));
  collisionPlan.assets[0].id = "existing-asset-alias";
  collisionPlan.tracks[0].assetId = "existing-asset-alias";
  collisionPlan.tracks[0].bus = "voice";
  collisionPlan.audioPolicy.generatedAssetIds = ["existing-asset-alias"];
  collisionPlan.audioPolicy.generatedScopesByAsset[0].assetId = "existing-asset-alias";
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
  assert.equal(result.manifest.runtime.sourceVoiceDuckUsed, true, "canonical voiceWindows drive the source duck even when the locked voice WAV is supplied separately later");
  assert.equal(result.plan.assets[0].source.voiceDuckProcessing.applied, true);
  assert.deepEqual(result.plan.assets[0].source.voiceDuckProcessing.wordWindows, [{ start: 0.2, end: 0.8 }]);
  assert.equal(result.manifest.outputs.assets[0].wav.sampleRate, 48000);
  assert.equal(result.manifest.outputs.assets[0].wav.encoding, "pcm_f32le");
});

test("native preset keeps voice presence and source target when explicit audio-plan ducking owns attenuation", () => {
  const canonicalWindows = [{ id: "voice-native", startSec: 0.5, endSec: 1.5 }];
  const timeMap = { localStartSec: 0, filmStartSec: 0, speed: 2 };
  const explicit = resolveNativePresetVoicePolicy({
    basePlan: { voiceWindows: canonicalWindows, ducking: { targetGainDb: -12, attackSec: 0.05, releaseSec: 0.1 } },
    timeMap, durationSec: 3, voiceLufs: -25,
  });
  assert.equal(explicit.sourceVoiced, true, "an explicit final-mixer duck does not erase the mapped voice-overlap fact");
  assert.deepEqual(explicit.mappedVoiceWindows, [{ start: 1, end: 3 }]);
  assert.equal(explicit.targetLufs, -37, "the native preset retains the measured voice-relative source target");
  assert.deepEqual(explicit.voiceWindowsToBake, [], "source duck is omitted when the audio plan owns it");
  assert.equal(explicit.voiceDuckProcessing.applied, false);
  assert.equal(explicit.voiceDuckProcessing.processor, "audio-plan final mixer");
  assert.deepEqual(explicit.voiceDuckProcessing.requestedWordWindows, [{ start: 1, end: 3 }]);
  assert.equal(explicit.voiceDuckProcessing.voiceWindowsSha256,
    createHash("sha256").update('[{"endSec":1.5,"id":"voice-native","startSec":0.5}]').digest("hex"));
  assert.equal(resolveSourceFxLevelGainDb({ voiced: true, musicTargetLufs: explicit.targetLufs }), -15,
    "source FX gain remains based on the voice-relative music target");

  const sourceOwned = resolveNativePresetVoicePolicy({
    basePlan: { voiceWindows: canonicalWindows, ducking: null }, timeMap, durationSec: 3, voiceLufs: -25,
  });
  assert.equal(sourceOwned.sourceVoiced, true);
  assert.deepEqual(sourceOwned.voiceWindowsToBake, [{ start: 1, end: 3 }]);
  assert.equal(sourceOwned.voiceDuckProcessing, null, "only one duck owner is emitted for a native preset stem");
});

test("/2 voiced generated preset levels independent SFX against source music target then mixes once", { skip: !ffmpegAvailable || !ffprobeAvailable, timeout: 180_000 }, async (t) => {
  const sample = await fixture({ local: false });
  const voicePath = path.join(sample.directory, "voice-tone.wav");
  const voiceTone = spawnSync(ffmpeg, ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=3", "-af", "volume=0.05", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", voicePath], { encoding: "utf8" });
  assert.equal(voiceTone.status, 0, voiceTone.stderr || "voice tone fixture generation failed");
  const voiceBytes = await fs.readFile(voicePath);
  const voiceWindow = { id: "voice-on-sfx", startSec: 0.8, endSec: 1.2 };
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2,
    events: [], tracks: [{ id: "locked-voice", assetId: "voice-asset", bus: "voice", startSec: 0, gainDb: 0, locked: true }],
    voiceWindows: [voiceWindow], automation: [], timeMaps: [],
    assets: [{ id: "voice-asset", file: "voice-tone.wav", durationSec: 3, sha256: sha256(voiceBytes), license: "Project-generated technical tone fixture", redistribution: { status: "project-generated", basis: "A locally generated steady tone used only for source-level and final-mixer measurement." }, reviewStatus: "generated-unreviewed" }],
    generatedAssets: [],
  };
  const basePlanPath = path.join(sample.directory, "voiced-preset-base-plan.json");
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan));
  const film = await verifyFilmManifest(sample.manifestPath);
  const requestFor = (mixGainDb) => ({
    format: "laohu.motion.huashu-audio-request/2",
    musicPreset: {
      product: "ai", variant: 0, seed: "source-fx-level-contract", bpm: 100,
      sections: [{ eventId: "event-global", energy: 0.8 }],
      dropEventId: "event-global", ending: "ring",
    },
    sfxEvents: [{ id: "voice-window-ding", eventId: "event-global", name: "ding", kit: "clean", sourceGain: 0.5, sourcePan: 0, mixGainDb, seed: "source-fx-level-contract-ding" }],
  });
  const generated = {};
  for (const mixGainDb of [0, 2]) {
    const label = mixGainDb === 0 ? "zero-user-gain" : "two-db-user-gain";
    const request = requestFor(mixGainDb);
    const requestPath = path.join(sample.directory, label + "-request.json");
    const outputPlan = path.join(sample.directory, label + "-audio-plan.json");
    const receiptPath = path.join(sample.directory, label + "-receipt.json");
    const assetsDir = path.join(sample.directory, label + "-assets");
    await fs.mkdir(assetsDir, { recursive: true });
    await fs.writeFile(requestPath, JSON.stringify(request));
    generated[mixGainDb] = await generatePlan({
      request, basePlan, basePlanPath, film,
      inputFiles: [requestPath, basePlanPath, sample.manifestPath],
      assetsDir, projectRoot: sample.directory, outputPlan, manifestPath: receiptPath,
    });
  }
  const zero = generated[0], plusTwo = generated[2];
  const musicTargetLufs = plusTwo.manifest.composition.sourceMusicLevel.targetLufs;
  const expectedSourceFxLevelDb = musicTargetLufs + 22;
  const zeroBinding = zero.manifest.alignment.markAndHitBindings.find((row) => row.kind === "explicit-sfx" && row.requestId === "voice-window-ding");
  const plusTwoBinding = plusTwo.manifest.alignment.markAndHitBindings.find((row) => row.kind === "explicit-sfx" && row.requestId === "voice-window-ding");
  assert.equal(plusTwo.manifest.composition.sourceMusicLevel.targetBasis, "locked voice stereo LUFS - 12");
  assert.equal(zeroBinding.sourceLevelGainDb, expectedSourceFxLevelDb);
  assert.equal(plusTwoBinding.sourceLevelGainDb, expectedSourceFxLevelDb);
  assert.equal(zeroBinding.userPostMixGainDb, 0);
  assert.equal(plusTwoBinding.userPostMixGainDb, 2);
  assert.equal(zeroBinding.eventGainDb, expectedSourceFxLevelDb);
  assert.equal(plusTwoBinding.eventGainDb, expectedSourceFxLevelDb + 2, "caller gain is added once after source FX level without changing sourceGain");
  assert.equal(plusTwoBinding.source.gainBaked, 0.5);
  const zeroSfxEvent = zero.plan.events.find((event) => event.eventId === "event-global" && event.bus === "sfx");
  const plusTwoSfxEvent = plusTwo.plan.events.find((event) => event.eventId === "event-global" && event.bus === "sfx");
  const zeroSfx = zero.plan.assets.find((asset) => asset.id === zeroSfxEvent.assetId);
  const plusTwoSfx = plusTwo.plan.assets.find((asset) => asset.id === plusTwoSfxEvent.assetId);
  assert.equal(zeroSfx.sha256, plusTwoSfx.sha256, "post-mix gain changes do not re-render or re-level the source SFX WAV");
  assert.deepEqual(await fs.readFile(path.join(sample.directory, zeroSfx.file)), await fs.readFile(path.join(sample.directory, plusTwoSfx.file)));

  const musicTrack = plusTwo.plan.tracks.find((track) => track.bus === "music");
  const musicAsset = plusTwo.plan.assets.find((asset) => asset.id === musicTrack.assetId);
  assert.equal(musicAsset.source.voiceDuckProcessing.applied, true);
  assert.deepEqual(musicAsset.source.voiceDuckProcessing.wordWindows, [{ start: 0.8, end: 1.2 }]);
  const outputWav = path.join(sample.directory, "voiced-preset-final.wav");
  const consumerManifest = path.join(sample.directory, "voiced-preset-final-receipt.json");
  const audioScript = path.join(skillDir, "scripts", "audio.mjs");
  const consumer = spawnSync(process.execPath, [
    audioScript, "--plan", plusTwo.manifest.outputs.audioPlan,
    "--scene", path.join(sample.directory, "compiled-global-events.scene.json"),
    "--asset-index", path.join(skillDir, "assets", "audio", "index.json"),
    "--output", outputWav, "--manifest", consumerManifest,
    "--cache-dir", path.join(sample.directory, "audio-mixer-cache"), "--ffmpeg", ffmpeg,
    "--allow-generated-preview",
  ], { cwd: repoRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, MOTION_FFMPEG: ffmpeg } });
  assert.equal(consumer.error, undefined, consumer.error?.message);
  assert.equal(consumer.status, 0, consumer.stderr || consumer.stdout);
  const usage = JSON.parse(await fs.readFile(consumerManifest, "utf8"));
  assert.deepEqual(usage.voiceDuckProcessing.sourceProcessedTrackIds, [musicTrack.id]);
  assert.deepEqual(usage.voiceDuckProcessing.finalMixerTrackIds, [], "source duck is the sole owner for the generated music stem");
  const decodedFinal = decodeStereoFloat(outputWav);
  const decodedVoice = decodeStereoFloat(voicePath);
  const decodedMusic = decodeStereoFloat(path.join(sample.directory, musicAsset.file));
  const decodedSfx = decodeStereoFloat(path.join(sample.directory, plusTwoSfx.file));
  const eventGain = plusTwoSfxEvent.gainDb;
  const measurements = {
    sourceVoiceLufs: musicTargetLufs + 12,
    sourceMusicTargetLufs: musicTargetLufs,
    musicWindowRmsDbfs_0_8_1_2: dbfs(stereoFloatRmsWindow(decodedMusic, 0.8, 1.2)),
    voiceWindowRmsDbfs_0_8_1_2: dbfs(stereoFloatRmsWindow(decodedVoice, 0.8, 1.2)),
    sfxWindowRmsDbfs_event_1_0_1_2_after_event_gain: dbfs(stereoFloatRmsWindow(decodedSfx, 0, 0.2) * Math.pow(10, eventGain / 20)),
    finalWindowRmsDbfs_0_8_1_2: dbfs(stereoFloatRmsWindow(decodedFinal, 0.8, 1.2)),
    eventGainDb: eventGain,
    sourceLevelGainDb: plusTwoBinding.sourceLevelGainDb,
    userPostMixGainDb: plusTwoBinding.userPostMixGainDb,
    interpretation: "Measured RMS dBFS windows from generated WAV assets and the final mix; technical level evidence only, not LUFS equivalence or listening-quality judgment.",
  };
  assert.ok(Object.values(measurements).filter((value) => typeof value === "number").every(Number.isFinite));
  t.diagnostic(JSON.stringify(measurements));
  const decodedMux = spawnSync(ffmpeg, ["-nostdin", "-v", "error", "-i", outputWav, "-f", "null", "-"], { encoding: "utf8" });
  assert.equal(decodedMux.status, 0, decodedMux.stderr || "final mixed WAV failed FFmpeg decode");
});

test("ordinary sectioned preset plus a finished SFX asset reaches the shared event and single mixer", { skip: !ffmpegAvailable || !ffprobeAvailable, timeout: 120_000 }, async () => {
  const sample = await fixture({ local: false, preserveAt: process.env.MOTION_AUDIO_SAMPLE_OUTPUT_DIR || null });
  await fs.mkdir(cacheRoot, { recursive: true });
  const searchRoot = await fs.mkdtemp(path.join(cacheRoot, "sfx-search-work-"));
  const editTemp = path.join(cacheRoot, `audio-edit-${process.pid}-${Date.now()}`);
  const mixCache = path.join(cacheRoot, `audio-mixer-${process.pid}-${Date.now()}`);
  fixtures.push(searchRoot);
  const filmEvents = [
    { id: "event-open", filmTimeSec: 0, timeBasis: "film-global" },
    { id: "event-build", filmTimeSec: 3.2, timeBasis: "film-global" },
    { id: "event-contact", filmTimeSec: 6.1, timeBasis: "film-global" },
    { id: "event-result", filmTimeSec: 9.0, timeBasis: "film-global" },
    { id: "event-end", filmTimeSec: 11.5, timeBasis: "film-global" },
  ];
  const scenePath = path.resolve(sample.directory, sample.manifest.audioEventScene.path);
  const scene = { ...sample.scene, duration: 12, audioEvents: filmEvents };
  const sceneBytes = Buffer.from(JSON.stringify(scene, null, 2) + "\n");
  await fs.writeFile(scenePath, sceneBytes);
  const bindings = filmEvents.map((event) => ({
    ...sample.manifest.audioEventBindings[0],
    eventId: event.id,
    sourceEventId: event.id,
    sourceTimeBasis: "film-global",
    sourcePhaseId: null,
    compiledPhaseId: null,
    timeMapId: null,
  }));
  sample.manifest.audioEventScene.sha256 = sha256(sceneBytes);
  sample.manifest.audioEventBindings = bindings;
  await fs.writeFile(sample.manifestPath, JSON.stringify(sample.manifest, null, 2) + "\n");

  const sfxScript = path.join(repoRoot, ".agents", "skills", "laohu-motion", "scripts", "sfx-sources.py");
  const indexPath = path.join(repoRoot, ".agents", "skills", "laohu-motion", "assets", "audio", "index.json");
  const groupSearch = spawnSync("python3", [
    sfxScript, "local-groups", "--group-id", "short-contact-impact",
    "--action", "landing", "--material", "wood", "--intensity", "light",
    "--max-source-duration-sec", "0.2", "--work-root", searchRoot,
  ], { encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(groupSearch.status, 0, groupSearch.stderr || groupSearch.stdout);
  const groupResult = JSON.parse(groupSearch.stdout);
  assert.equal(groupResult.operation, "local-groups");
  assert.equal(groupResult.results.some((group) => group.candidates?.some((candidate) => candidate.assetId === "wyzowl.impact-light-firm")), true);

  const localSearch = spawnSync("python3", [
    sfxScript, "local-search", "--query", "small object landing wood",
    "--work-root", searchRoot, "--ffprobe", ffprobe,
  ], { encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(localSearch.status, 0, localSearch.stderr || localSearch.stdout);
  const searchResult = JSON.parse(localSearch.stdout);
  const candidate = searchResult.results.find((row) => row.assetId === "wyzowl.impact-light-firm");
  assert.ok(candidate, "the action/material search must return the indexed finished landing sound");
  assert.equal(candidate.status, "candidate");
  assert.equal(candidate.reviewStatus, "candidate-unreviewed");
  assert.equal(candidate.license, "CC0-1.0");

  const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
  const indexedAsset = index.assets.find((asset) => asset.id === candidate.assetId);
  assert.ok(indexedAsset);
  const sourceFile = path.join(path.dirname(indexPath), indexedAsset.file);
  const sourceBytes = await fs.readFile(sourceFile);
  assert.equal(sha256(sourceBytes), indexedAsset.sha256, "the actual indexed source file must match its recorded hash");
  const sourceFacts = await readWavInfo(sourceFile);
  const derivedFile = path.join(sample.directory, "audio", "derived", "light-wood-contact.wav");
  const derivedReceiptFile = path.join(sample.directory, "audio", "derived", "light-wood-contact.receipt.json");
  const editSpec = {
    schemaVersion: 1,
    notes: "Technical integration fixture only; not a listening or ready-status claim.",
    layers: [{
      id: "light-wood-contact", file: sourceFile, sourceInSec: 0,
      sourceOutSec: sourceFacts.durationSec, startSec: 0,
      fadeOutSec: 0.02, hitPointsSec: [indexedAsset.hitTimeSec],
      sourceAsset: {
        assetId: indexedAsset.id,
        sha256: indexedAsset.sha256,
        generationMode: indexedAsset.source?.generationMode || "indexed-source",
        ...(indexedAsset.source?.generationScopes ? { generationScopes: indexedAsset.source.generationScopes } : {}),
        redistributionStatus: indexedAsset.redistribution?.status || "unknown",
      },
    }],
  };
  const editSpecFile = path.join(sample.directory, "audio", "derived", "light-wood-contact.edit.json");
  await fs.mkdir(path.dirname(editSpecFile), { recursive: true });
  await fs.writeFile(editSpecFile, JSON.stringify(editSpec, null, 2) + "\n");
  const edited = await editSourceWav({
    specFile: editSpecFile, outputFile: derivedFile, receiptFile: derivedReceiptFile,
    tmpDir: editTemp, ffmpeg,
  });
  const derivedHitTimeSec = edited.receipt.layers[0].hitPoints[0].derivedFileSec;
  const derivedAsset = {
    id: "derived-light-wood-contact",
    file: path.relative(sample.directory, derivedFile).split(path.sep).join("/"),
    durationSec: edited.receipt.output.durationSec,
    sha256: edited.outputSha256,
    hitTimeSec: derivedHitTimeSec,
    hitTimeMethod: "audio-edit source-time mapping from indexed source sync point",
    hitTimeConfidence: indexedAsset.hitTimeConfidence,
    license: indexedAsset.license,
    redistribution: indexedAsset.redistribution,
    reviewStatus: "candidate-unreviewed",
    source: {
      ...indexedAsset.source,
      assetId: indexedAsset.id,
      generationMode: "audio-edit",
      parent: edited.receipt.sourceLineage.parents[0],
    },
    processing: { tool: "Arrangement audio-edit.mjs", receipt: path.relative(sample.directory, derivedReceiptFile).split(path.sep).join("/") },
  };
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 12,
    sampleRate: 48000, channels: 2,
    events: [{
      id: "cue-light-wood-contact", eventId: "event-contact", assetId: derivedAsset.id, bus: "sfx",
      sourceInSec: 0, sourceOutSec: derivedAsset.durationSec, hitTimeSec: derivedHitTimeSec,
    }],
    tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [derivedAsset], generatedAssets: [],
  };
  assert.deepEqual(generatedAudioAssetIds(basePlan), [], "editing a registered licensed candidate preserves its non-generated lineage independent of review status");
  const request = {
    format: "laohu.motion.huashu-audio-request/2",
    musicPreset: {
      style: "piano", seed: "sectioned-finished-sfx-integration", bpm: 100,
      sections: [
        { eventId: "event-open", energy: 0.3 },
        { eventId: "event-build", energy: 0.55 },
        { eventId: "event-result", energy: 0.8 },
        { eventId: "event-end", energy: 0.42 },
      ],
      dropEventId: "event-result", ending: "button", endEventId: "event-end",
    },
  };
  const requestPath = path.join(sample.directory, "audio-request.json");
  const basePlanPath = path.join(sample.directory, "audio-plan.base.json");
  const outputPlan = path.join(sample.directory, "audio-plan.generated.json");
  const sourceReceiptPath = path.join(sample.directory, "audio-source.receipt.json");
  const assetsDir = path.join(sample.directory, "audio", "generated");
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(requestPath, JSON.stringify(request, null, 2) + "\n");
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan, null, 2) + "\n");
  const film = await verifyFilmManifest(sample.manifestPath);
  const result = await generatePlan({
    request, basePlan, basePlanPath, film,
    inputFiles: [requestPath, basePlanPath, sample.manifestPath],
    assetsDir, projectRoot: sample.directory, outputPlan, manifestPath: sourceReceiptPath,
    requestFilePath: requestPath, requestFileSha256: sha256(Buffer.from(await fs.readFile(requestPath))),
  });
  assert.equal(result.plan.events.length, 1, "the finished SFX remains a single canonical event beside the new music track");
  assert.equal(result.plan.events[0].eventId, "event-contact");
  const sections = result.manifest.musicPreset.sourcePlan.sections.filter((row) => row.eventId);
  assert.deepEqual(sections.map((row) => row.eventId), ["event-open", "event-build", "event-result", "event-end"]);
  assert.ok(sections.every((row) => Number.isFinite(row.energy) && row.energy >= 0 && row.energy <= 1));
  assert.ok(sections[0].energy < sections[1].energy && sections[1].energy < sections[2].energy && sections[2].energy > sections[3].energy);
  assert.equal(result.manifest.musicPreset.request.dropEventId, "event-result");
  assert.equal(result.manifest.musicPreset.request.endEventId, "event-end");
  const musicTrack = result.plan.tracks.find((track) => track.bus === "music");
  assert.ok(musicTrack, "the sectioned request must emit an actual music track");
  const musicAsset = result.plan.assets.find((asset) => asset.id === musicTrack.assetId);
  const musicFile = path.resolve(sample.directory, musicAsset.file);
  const musicFacts = await readWavInfo(musicFile);
  assert.equal(musicFacts.format, "float-pcm");
  assert.equal(musicFacts.sampleRate, 48000);
  assert.equal(musicFacts.channels, 2);
  assert.ok(Math.abs(musicFacts.durationSec - 12) <= 1 / 48000);
  assert.equal(musicAsset.reviewStatus, "generated-unreviewed");

  const mixOutput = path.join(sample.directory, "final-mix-technical-preview.wav");
  const mixReceiptPath = path.join(sample.directory, "final-mix-technical-preview.receipt.json");
  const mixer = spawnSync(process.execPath, [
    path.join(repoRoot, ".agents", "skills", "laohu-motion", "scripts", "audio.mjs"),
    "--plan", outputPlan, "--scene", scenePath, "--asset-index", indexPath,
    "--output", mixOutput, "--manifest", mixReceiptPath,
    "--cache-dir", mixCache, "--ffmpeg", ffmpeg,
    "--allow-candidate", "--allow-generated-preview",
  ], { encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(mixer.status, 0, mixer.stderr || mixer.stdout);
  assert.match(mixer.stdout, /AUDIO_STREAM true/);
  const mixReceipt = JSON.parse(await fs.readFile(mixReceiptPath, "utf8"));
  assert.equal(mixReceipt.technicalPreview, true);
  const sfxUse = mixReceipt.events.find((event) => event.id === "cue-light-wood-contact");
  assert.ok(sfxUse);
  assert.equal(sfxUse.sharedEventId, "event-contact");
  assert.equal(sfxUse.hitTimeSec, derivedHitTimeSec);
  assert.ok(Math.abs(sfxUse.startFilmSec - (6.1 - derivedHitTimeSec)) < 1 / 48000);
  assert.equal(mixReceipt.usedAssets.find((asset) => asset.id === derivedAsset.id)?.reviewStatus, "candidate-unreviewed");
  assert.equal(mixReceipt.tracks.some((track) => track.assetId === musicAsset.id && track.bus === "music"), true);
  const finalProbe = spawnSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,sample_rate,channels,duration:format=duration", "-of", "json", mixOutput], { encoding: "utf8", timeout: 30_000 });
  assert.equal(finalProbe.status, 0, finalProbe.stderr || finalProbe.stdout);
  const probeJson = JSON.parse(finalProbe.stdout);
  const audioStream = probeJson.streams.find((stream) => stream.codec_type === "audio");
  assert.equal(audioStream.sample_rate, "48000");
  assert.equal(audioStream.channels, 2);
  assert.ok(Math.abs(Number(probeJson.format.duration) - 12) <= 1 / 48000);
  const decode = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", mixOutput, "-f", "null", "-"], { encoding: "utf8", timeout: 30_000 });
  assert.equal(decode.status, 0, decode.stderr || decode.stdout);

  const summary = {
    status: "technical-preview-only",
    listeningStatus: "UNKNOWN; no human listening was performed by this eval",
    sectionEvents: sections.map(({ eventId, energy }) => ({ eventId, energy })),
    sourcePreset: { style: request.musicPreset.style, seed: request.musicPreset.seed, bpm: request.musicPreset.bpm },
    musicWav: { file: path.relative(sample.directory, musicFile), sha256: musicAsset.sha256, ...musicFacts },
    sfx: { sourceAssetId: indexedAsset.id, sourceSha256: indexedAsset.sha256, derivedAssetId: derivedAsset.id, derivedSha256: derivedAsset.sha256, reviewStatus: "candidate-unreviewed", canonicalEventId: sfxUse.sharedEventId, filmTimeSec: sfxUse.sourceEventTimeSec, hitTimeSec: sfxUse.hitTimeSec, startFilmSec: sfxUse.startFilmSec },
    finalMix: { file: path.relative(sample.directory, mixOutput), sha256: mixReceipt.outputWavSha256, durationSec: mixReceipt.durationSec, sampleRateHz: audioStream.sample_rate, channels: audioStream.channels, technicalPreview: mixReceipt.technicalPreview },
  };
  await fs.writeFile(path.join(sample.directory, "technical-summary.json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
  await fs.rm(editTemp, { recursive: true, force: true });
  await fs.rm(mixCache, { recursive: true, force: true });
});

test("minor source-default /2 preset keeps its key context for rendered ding/chime SFX, with optional source PCM parity", async (t) => {
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
  const actualFacts = wavFacts(actualWav);
  assert.equal(actualFacts.sampleRate, 48000);
  assert.equal(actualFacts.channels, 2);
  assert.ok(actualFacts.frames > 0, "local generated chime has playable PCM before source comparison");
  await t.test("generated chime PCM matches the pinned source key callback", { skip: sourceSkipReason() }, async () => {
    await verifyPinnedSourceTree();
    readPinnedSource("package.json");
    const upstreamLib = path.join(sourceRoot, "huashu-motion", "cli", "lib");
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
});

test("generated preset PCM matches the pinned source music branch before full mixdown", { skip: sourceSkipReason() }, async () => {
  const sample = await fixture({ local: false });
  await verifyPinnedSourceTree();
  readPinnedSource("package.json");
  const upstreamLib = path.join(sourceRoot, "huashu-motion", "cli", "lib");
  const originalSoundPath = path.join(upstreamLib, "sound.js");
  const originalSoundText = readPinnedSource("cli/lib/sound.js").toString("utf8");
  const probeRoot = path.join(sample.directory, "upstream-music-branch-probe");
  const probeLib = path.join(probeRoot, "cli", "lib");
  await fs.mkdir(path.dirname(probeLib), { recursive: true });
  await fs.cp(upstreamLib, probeLib, { recursive: true });
  await fs.copyFile(path.join(sourceRoot, "huashu-motion", "package.json"), path.join(probeRoot, "package.json"));
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
    assert.match(result.manifest.runtime.samples, /^musicPreset only: project-local recorded-required pack preflighted and traced/);
    assert.equal(result.manifest.runtime.sampleScopes.musicPreset.mode, "recorded-required");
    assert.equal(result.manifest.runtime.sampleScopes.sfx.mode, "not-rendered");
    assert.equal(await fs.stat(path.join(fakeHome, ".cache", "huashu-motion", "samples")).then(() => true, () => false), false);

    assert.equal(result.manifest.runtime.runtimeOverlay.kind, "recorded-required-local-runtime-overlay");
    assert.equal(result.manifest.runtime.runtimeOverlay.localRuntimeClosureSha256, result.manifest.runtime.localRuntime.closureSha256);
    assert.equal(result.manifest.runtime.runtimeOverlay.sourceClosureSha256, result.manifest.source.closureSha256);
    assert.equal(result.manifest.runtime.runtimeOverlay.transformedSourceFiles.every((row) => row.path.startsWith("templates/runtime/laohu-audio-")), true);
    const runtimeSamples = await import(pathToFileURL(path.join(result.manifest.runtime.runtimeOverlay.root, "laohu-audio-samples.mjs")).href);
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

    const escapedRequest = { ...request, musicPreset: { ...request.musicPreset, samples: { mode: "recorded-required", packDir: path.join(path.dirname(sample.directory), "outside-recorded-pack") } } };
    await fs.mkdir(path.join(sample.directory, "escaped-pack-output"), { recursive: true });
    await assert.rejects(generatePlan({
      request: escapedRequest, basePlan, basePlanPath, film,
      inputFiles: [requestPath, basePlanPath, sample.manifestPath],
      assetsDir: path.join(sample.directory, "escaped-pack-output"), projectRoot: sample.directory,
      outputPlan: path.join(sample.directory, "escaped-pack-output-plan.json"), manifestPath: path.join(sample.directory, "escaped-pack-output-receipt.json"),
    }), /samples.packDir must stay inside --project-root/);

    const unlicensedPack = path.join(sample.directory, "unlicensed-pack");
    await fs.cp(packDir, unlicensedPack, { recursive: true });
    const unlicensedManifestPath = path.join(unlicensedPack, "manifest.json");
    const unlicensedManifest = JSON.parse(await fs.readFile(unlicensedManifestPath, "utf8"));
    delete unlicensedManifest.instruments.piano.license;
    await fs.writeFile(unlicensedManifestPath, JSON.stringify(unlicensedManifest, null, 2));
    const unlicensedRequest = { ...request, musicPreset: { ...request.musicPreset, samples: { mode: "recorded-required", packDir: unlicensedPack } } };
    await fs.mkdir(path.join(sample.directory, "unlicensed-pack-output"), { recursive: true });
    await assert.rejects(generatePlan({
      request: unlicensedRequest, basePlan, basePlanPath, film,
      inputFiles: [requestPath, basePlanPath, sample.manifestPath],
      assetsDir: path.join(sample.directory, "unlicensed-pack-output"), projectRoot: sample.directory,
      outputPlan: path.join(sample.directory, "unlicensed-pack-output-plan.json"), manifestPath: path.join(sample.directory, "unlicensed-pack-output-receipt.json"),
    }), /missing license or credit evidence/);

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

test("recorded-required music samples stay isolated from synth-off lofi SFX even with an escaping wurli manifest row", { skip: !ffmpegAvailable }, async (t) => {
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
    assert.equal(sfxReceipt.runtimeEntry, "templates/runtime/laohu-audio-mix.mjs");
    assert.match(sfxReceipt.localRuntimeClosureSha256, /^[a-f0-9]{64}$/);
    assert.match(sfxReceipt.sourceClosureSha256, /^[a-f0-9]{64}$/);

    const sfxEvent = withUnauthorizedRow.plan.events.find((event) => event.bus === "sfx");
    const sfxAsset = withUnauthorizedRow.plan.assets.find((asset) => asset.id === sfxEvent.assetId);
    const actual = await fs.readFile(path.resolve(sample.directory, sfxAsset.file));
    assert.deepEqual(sfxAsset.source.sampleUse, {
      mode: "synth-off", recordedSamplePackVisible: false,
      sourceRuntime: sfxReceipt.runtimeEntry,
      localRuntimeClosureSha256: sfxReceipt.localRuntimeClosureSha256,
      sourceClosureSha256: sfxReceipt.sourceClosureSha256,
      packCacheInitializedNullBeforeEnvironmentRestore: true,
    });
    assert.match(sfxAsset.license, /no upstream sample pack/);
    const isolatedSamples = await import(pathToFileURL(path.join(repoRoot, ".agents", "skills", "laohu-motion", "templates", "runtime", "laohu-audio-samples.mjs")).href);
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
    await t.test("SFX PCM matches the pinned source synth-off function", { skip: sourceSkipReason() }, async () => {
      const reference = await pinnedSynthOffSfx({
        root: withUnauthorizedRow.manifest.sfxKeyContext.rootMidi,
        scale: withUnauthorizedRow.manifest.sfxKeyContext.scale,
        seed: "ding:lofi-ding:1",
      });
      assert.deepEqual(actual, reference, "SFX PCM must match the pinned source lofi.ding synth-off function");
    });
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
    assert.match(unknown.stderr, /unsupported sample instrument ID: __unknown_contract_probe__/);
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
  const sourceAsset = { id: "selected-source", file: "selected-source.wav", durationSec: 6, sha256: sha256(sourceBytes), license: "CC0-1.0 test fixture", redistribution: { status: "redistributable", syncUse: "allowed", basis: "Neutral CC0 test source used only as a local clock fixture." }, reviewStatus: "candidate-unreviewed" };
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2,
    events: [], tracks: [{ id: "selected-bgm-track", assetId: sourceAsset.id, bus: "music", startSec: 0, speed: 1.5, sourceInSec: 0.5, sourceOutSec: 4, timeMapId: "time-segment-1", gainDb: -4 }],
    voiceWindows: [], automation: [{ id: "manual-hit-duck", eventId: "event-local", bus: "music", startSec: 0.49, endSec: 0.62, gainDb: -4 }], timeMaps: [{ ...sample.timeMap }], assets: [sourceAsset], generatedAssets: [],
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

test("music automation preserves legacy additive gain and converts explicit target gain once in the real mixer", { skip: !ffmpegAvailable || !ffprobeAvailable }, async () => {
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "music-automation-semantics-"));
  try {
    const source = path.join(directory, "source.wav");
    const generated = spawnSync(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "aevalsrc=0.5*sin(2*PI*440*t):s=48000:d=3", "-ac", "1", "-c:a", "pcm_s16le", source,
    ], { encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr || generated.error?.message);
    const sourceSha256 = sha256(await fs.readFile(source));
    const rights = { status: "project-generated", basis: "Synthetic PCM fixture created only for this mixer contract test." };
    const basePlan = {
      schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2,
      events: [], tracks: [{ id: "music-track", assetId: "music-asset", bus: "music", startSec: 0, gainDb: -13 }],
      voiceWindows: [], timeMaps: [], generatedAssets: [],
      assets: [{ id: "music-asset", file: "source.wav", durationSec: 3, sha256: sourceSha256, license: "project-generated test fixture", redistribution: rights, reviewStatus: "ready" }],
    };
    const planPath = path.join(directory, "audio-plan.json");
    const indexPath = path.join(directory, "audio-index.json");
    await fs.writeFile(indexPath, JSON.stringify({ schemaVersion: 1, assets: [] }));
    const rows = [
      { label: "legacy", automation: { id: "legacy-minus-eight", bus: "music", startSec: 1, endSec: 2, gainDb: -8 }, expectedDeltaDb: -8, expectedIsolatedSourceDb: -21, interpretation: "legacy-additive-delta" },
      { label: "target", automation: { id: "target-minus-nineteen", bus: "music", startSec: 1, endSec: 2, trackId: "music-track", targetGainDb: -19 }, expectedDeltaDb: -6, expectedIsolatedSourceDb: -19, interpretation: "target-applied-source-track-gain" },
    ];
    for (const row of rows) {
      const plan = { ...basePlan, automation: [row.automation] };
      await authorizeSyntheticTestAudio(plan, directory);
      validatePlan(plan);
      await fs.writeFile(planPath, JSON.stringify(plan));
      const output = path.join(directory, `${row.label}.wav`);
      const manifestPath = path.join(directory, `${row.label}.manifest.json`);
      await renderAudioPlan({
        plan: planPath, assetIndex: indexPath, output, manifest: manifestPath,
        cacheDir: path.join(directory, "runtime-cache", row.label), ffmpeg,
      });
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      const automationReceipt = manifest.tracks.find((track) => track.id === "music-track").automation[0];
      assert.equal(automationReceipt.baseGainDb, -13);
      assert.equal(automationReceipt.appliedDeltaDb, row.expectedDeltaDb);
      assert.equal(automationReceipt.sourceGainWithThisEntryOnlyDb, row.expectedIsolatedSourceDb);
      assert.equal(automationReceipt.sourceGainScope, "this-entry-only-at-full-automation-envelope; excludes-other-automation-ducking-track-fades-and-other-tracks");
      assert.equal(automationReceipt.interpretation, row.interpretation);
      const decoded = decodeStereoFloat(output);
      const before = dbfs(stereoFloatRmsWindow(decoded, 0.2, 0.8));
      const during = dbfs(stereoFloatRmsWindow(decoded, 1.2, 1.8));
      assert.ok(Math.abs((during - before) - row.expectedDeltaDb) < 0.25,
        `${row.label}: measured ${during - before} dB, expected ${row.expectedDeltaDb} dB`);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("overlapping music deltas sum in PCM while manifest gain values remain explicitly per-entry and isolated", { skip: !ffmpegAvailable }, async () => {
  const directory = await fs.mkdtemp(path.join(cacheRoot, "music-overlapping-delta-ledger-"));
  try {
    const source = path.join(directory, "source.wav");
    const generated = spawnSync(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "aevalsrc=0.5*sin(2*PI*440*t):s=48000:d=3", "-ac", "1", "-c:a", "pcm_s16le", source,
    ], { encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr || generated.error?.message);
    const sourceBytes = await fs.readFile(source);
    const plan = {
      schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2,
      events: [], tracks: [{ id: "music-track", assetId: "music-asset", bus: "music", startSec: 0, gainDb: -13 }],
      voiceWindows: [], timeMaps: [], generatedAssets: [],
      assets: [{ id: "music-asset", file: "source.wav", durationSec: 3, sha256: sha256(sourceBytes), license: "Project-generated technical fixture", redistribution: { status: "project-generated", basis: "Synthetic PCM created only for this isolated audio ledger regression." }, reviewStatus: "ready" }],
      automation: [
        { id: "first-minus-three", bus: "music", trackId: "music-track", startSec: 1, endSec: 2.5, deltaGainDb: -3, fadeInSec: 0.2, fadeOutSec: 0.2 },
        { id: "second-plus-two", bus: "music", trackId: "music-track", startSec: 1.6, endSec: 2.9, deltaGainDb: 2, fadeInSec: 0.2, fadeOutSec: 0.2 },
      ],
    };
    await authorizeSyntheticTestAudio(plan, directory);
    validatePlan(plan);
    const planPath = path.join(directory, "audio-plan.json");
    const output = path.join(directory, "overlap.wav");
    const manifestPath = path.join(directory, "overlap.manifest.json");
    const indexPath = path.join(directory, "audio-index.json");
    await fs.writeFile(planPath, JSON.stringify(plan));
    await fs.writeFile(indexPath, JSON.stringify({ schemaVersion: 1, assets: [] }));
    await renderAudioPlan({
      plan: planPath, assetIndex: indexPath, output, manifest: manifestPath,
      cacheDir: path.join(directory, "runtime-cache"), ffmpeg,
    });

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const trackReceipt = manifest.tracks.find((track) => track.id === "music-track");
    const [first, second] = trackReceipt.automation;
    assert.equal(first.baseGainDb, -13);
    assert.equal(first.appliedDeltaDb, -3);
    assert.equal(first.sourceGainWithThisEntryOnlyDb, -16);
    assert.equal(second.baseGainDb, -13);
    assert.equal(second.appliedDeltaDb, 2);
    assert.equal(second.sourceGainWithThisEntryOnlyDb, -11);
    assert.ok([first, second].every((row) => row.sourceGainScope === "this-entry-only-at-full-automation-envelope; excludes-other-automation-ducking-track-fades-and-other-tracks"));
    assert.ok([first, second].every((row) => !Object.hasOwn(row, "resultingSourceGainDb")));
    assert.match(manifest.automationSemantics, /volume-filter level is track\.gainDb \+ the sum of each applicable automation entry/);
    assert.match(manifest.automationSemantics, /does not collapse those time-varying controls or multiple tracks into one resulting gain number/);

    const decoded = decodeStereoFloat(output);
    const referenceDb = dbfs(stereoFloatRmsWindow(decoded, 0.25, 0.8));
    const firstOnlyDb = dbfs(stereoFloatRmsWindow(decoded, 1.28, 1.48));
    const overlappingDb = dbfs(stereoFloatRmsWindow(decoded, 1.9, 2.2));
    const secondOnlyDb = dbfs(stereoFloatRmsWindow(decoded, 2.6, 2.75));
    assert.ok(Math.abs(firstOnlyDb - referenceDb - (-3)) < 0.25, `first-only region changed by ${firstOnlyDb - referenceDb} dB`);
    assert.ok(Math.abs(overlappingDb - referenceDb - (-1)) < 0.25, `overlap changed by ${overlappingDb - referenceDb} dB`);
    assert.ok(Math.abs(secondOnlyDb - referenceDb - 2) < 0.25, `second-only region changed by ${secondOnlyDb - referenceDb} dB`);
    const combinedOverlapTrackGain = first.baseGainDb - 1;
    assert.equal(combinedOverlapTrackGain, -14);
    assert.notEqual(combinedOverlapTrackGain, first.sourceGainWithThisEntryOnlyDb);
    assert.notEqual(combinedOverlapTrackGain, second.sourceGainWithThisEntryOnlyDb);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("target gain rejects missing/invalid track scope, multiple gain fields, and overlap in either plan order", () => {
  const base = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 4, sampleRate: 48000, channels: 2,
    events: [], tracks: [{ id: "music-track", assetId: "asset", bus: "music", startSec: 0 }],
    voiceWindows: [], timeMaps: [], assets: [], generatedAssets: [],
  };
  const target = { id: "target", bus: "music", trackId: "music-track", startSec: 1, endSec: 3, targetGainDb: -18 };
  assert.throws(() => validatePlan({ ...base, automation: [{ ...target, trackId: undefined }] }), /targetGainDb requires a music trackId/);
  assert.throws(() => validatePlan({ ...base, automation: [{ ...target, trackId: "missing-track" }] }), /trackId must reference an existing music track/);
  assert.throws(() => validatePlan({ ...base, automation: [{ ...target, gainDb: -4 }] }), /exactly one of legacy gainDb, deltaGainDb, or targetGainDb/);
  const globalDelta = { id: "global-delta", bus: "music", startSec: 2, endSec: 2.5, gainDb: -3 };
  for (const automation of [[target, globalDelta], [globalDelta, target]]) {
    assert.throws(() => validatePlan({ ...base, automation }), /targetGainDb automation target overlaps another music automation/);
  }
  const locked = { ...base, tracks: [{ ...base.tracks[0], locked: true }], automation: [target] };
  assert.throws(() => validatePlan(locked), /cannot target locked music track/);
});

test("event-bound manual music automation must resolve to the shared scene and keeps its event identity in the render receipt", { skip: !ffmpegAvailable || !ffprobeAvailable }, async () => {
  const sample = await fixture({ local: false });
  const sourceFile = path.join(sample.directory, "event-bound-music.wav");
  const generated = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3", "-ac", "2", "-c:a", "pcm_f32le", sourceFile], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr || generated.error?.message);
  const sourceBytes = await fs.readFile(sourceFile);
  const plan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3, sampleRate: 48000, channels: 2,
    events: [],
    tracks: [{ id: "event-bound-music", assetId: "event-bound-asset", bus: "music", startSec: 0, gainDb: -13 }],
    voiceWindows: [],
    automation: [{ id: "event-bound-target", eventId: "event-global", bus: "music", trackId: "event-bound-music", startSec: 1.2, endSec: 1.8, targetGainDb: -19 }],
    timeMaps: [],
    assets: [{
      id: "event-bound-asset", file: "event-bound-music.wav", durationSec: 3, sha256: sha256(sourceBytes),
      license: "Project-generated technical test fixture",
      redistribution: { status: "project-generated", basis: "Synthetic PCM created only for this event-identity integration test." },
      reviewStatus: "generated-unreviewed",
    }],
    generatedAssets: [],
  };
  const planPath = path.join(sample.directory, "event-bound-plan.json");
  const indexPath = path.join(sample.directory, "empty-audio-index.json");
  await authorizeSyntheticTestAudio(plan, sample.directory);
  await fs.writeFile(planPath, JSON.stringify(plan));
  await fs.writeFile(indexPath, JSON.stringify({ schemaVersion: 1, assets: [] }));
  const run = async ({ scenePath = path.join(sample.directory, "compiled-global-events.scene.json"), suffix = "valid" } = {}) => {
    const output = path.join(sample.directory, `${suffix}.wav`);
    const manifest = path.join(sample.directory, `${suffix}.manifest.json`);
    return renderAudioPlan({
      plan: planPath, assetIndex: indexPath, scene: scenePath, output, manifest,
      cacheDir: path.join(sample.directory, `${suffix}-cache`), ffmpeg, allowGeneratedPreview: true,
    });
  };

  const valid = await run();
  const receipt = valid.tracks.find((track) => track.id === "event-bound-music").automation[0];
  assert.equal(receipt.eventId, "event-global");
  assert.equal(receipt.baseGainDb, -13);
  assert.equal(receipt.appliedDeltaDb, -6);
  assert.equal(receipt.sourceGainWithThisEntryOnlyDb, -19);

  await assert.rejects(renderAudioPlan({
    plan: planPath, assetIndex: indexPath, output: path.join(sample.directory, "no-scene.wav"),
    manifest: path.join(sample.directory, "no-scene.manifest.json"), cacheDir: path.join(sample.directory, "no-scene-cache"), ffmpeg,
    allowGeneratedPreview: true,
  }), /--scene is required to resolve event-bound music automation/);

  const missingEventScene = { ...sample.scene, audioEvents: [] };
  const missingEventScenePath = path.join(sample.directory, "missing-event.scene.json");
  await fs.writeFile(missingEventScenePath, JSON.stringify(missingEventScene));
  await assert.rejects(run({ scenePath: missingEventScenePath, suffix: "missing-event" }), /references missing shared audio event event-global/);
});
