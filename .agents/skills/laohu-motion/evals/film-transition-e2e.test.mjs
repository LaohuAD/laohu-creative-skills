import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { floatWav, generatePlan, resolveSourceEvents, verifyFilmManifest } from "../scripts/laohu-audio-source.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(skillDir, "../../..");
const templateCli = path.join(skillDir, "scripts", "templates.mjs");
const audioCli = path.join(skillDir, "scripts", "audio.mjs");
const catalogPath = path.join(skillDir, "templates", "catalog.json");
const motionCorePath = path.join(skillDir, "scripts", "motion-core.js");
const motionOpsPath = path.join(skillDir, "scripts", "motion-ops.js");
const transitionAdapterPath = path.join(skillDir, "templates", "adapters", "laohu-transitions.js");
const transitionSourceRoot = path.resolve(process.env.MOTION_TRANSITION_SOURCE_ROOT || path.join(
  repoRoot, ".cache", "restore", "animation-foundation-20261111-01", "motion", "templates", "upstream", "huashu-art-motion",
));
const nodeRequire = createRequire(import.meta.url);
const { chromium } = nodeRequire("playwright");
const ffmpeg = process.env.MOTION_FFMPEG || "/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg";
const ffprobe = process.env.MOTION_FFPROBE || path.join(path.dirname(ffmpeg), "ffprobe");
const browser = process.env.MOTION_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const RATE = 48_000;

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function run(executable, args, label, { timeout = 300_000, env = {} } = {}) {
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  assert.equal(result.error, undefined, `${label}: ${result.error?.message || "process spawn failed"}`);
  assert.equal(result.status, 0, `${label} failed (status=${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result.stdout;
}
async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  return sha256(await fs.readFile(file));
}
function decodeFrame(ffmpegPath, file, frameIndex) {
  const result = spawnSync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-i", file,
    "-vf", `select=eq(n\\,${frameIndex}),scale=64:36`, "-fps_mode", "vfr", "-frames:v", "1",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
  ], { encoding: null, timeout: 60_000, maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined, `frame decode failed: ${result.error?.message || "unknown"}`);
  assert.equal(result.status, 0, `frame decode failed: ${result.stderr?.toString("utf8")}`);
  assert.equal(result.stdout.length, 64 * 36 * 3, `frame ${frameIndex} was not decoded to the expected probe dimensions`);
  return result.stdout;
}
function meanAbsoluteDifference(left, right) {
  assert.equal(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index] - right[index]);
  return sum / left.length;
}
function probeVideo(ffprobePath, file) {
  const text = run(ffprobePath, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file], "ffprobe");
  const data = JSON.parse(text);
  const video = data.streams.filter((row) => row.codec_type === "video");
  const audio = data.streams.filter((row) => row.codec_type === "audio");
  return { video, audio, durationSec: Number(data.format.duration) };
}

test("Film/1 renders moving A/B source handles, preserves a native clip, and feeds the locked-clock audio chain", { timeout: 900_000 }, async () => {
  for (const file of [ffmpeg, ffprobe, browser]) await fs.access(file);
  const validationRoot = path.join(repoRoot, ".cache", "validation", "motion-fusion-implementation");
  const tempRoot = path.join(repoRoot, ".cache", "tmp", "motion-fusion-implementation");
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(validationRoot, `film-e2e-${process.pid}-`));
  const workRoot = path.join(tempRoot, `film-e2e-${path.basename(runRoot)}`);
  const env = {
    MOTION_FFMPEG: ffmpeg,
    MOTION_FFPROBE: ffprobe,
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    OM_SAMPLES: "off",
  };
  await fs.mkdir(workRoot, { recursive: true });

  const movingScene = ({ id, fill, fromX, toX, bodyTime, bodyEvent, phaseId, excludedEvent, excludedTime }) => ({
    version: 1,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 1.1,
    timeBasis: "scene-local",
    background: "#111827",
    phases: [{ id: phaseId, startSec: bodyTime - 0.05, durationSec: 0.2, timeBasis: "scene-local" }],
    objects: [{ id: `${id}-block`, type: "rect", space: "screen", x: fromX, y: 420, width: 220, height: 220, fill }],
    events: [{ id: `${id}-travel`, target: { kind: "object", id: `${id}-block` }, property: "x", start: 0, duration: 1.1, from: fromX, to: toX }],
    audioEvents: [
      { id: bodyEvent, phaseId, phaseOffsetSec: 0.05, timeBasis: "scene-local" },
      { id: excludedEvent, timeSec: excludedTime, timeBasis: "scene-local" },
    ],
  });

  const sceneA = movingScene({ id: "a", fill: "#ee2a35", fromX: 120, toX: 1560, bodyTime: 0.72, bodyEvent: "a-body-hit", phaseId: "a-body-phase", excludedEvent: "a-tail-handle-hit", excludedTime: 1.05 });
  const sceneB = movingScene({ id: "b", fill: "#2477e8", fromX: 1780, toX: 340, bodyTime: 0.22, bodyEvent: "b-body-hit", phaseId: "b-body-phase", excludedEvent: "b-head-handle-hit", excludedTime: 0.05 });
  const sceneD = {
    version: 1, width: 1920, height: 1080, fps: 30, duration: 1, timeBasis: "scene-local", background: "#111827",
    objects: [{ id: "d-block", type: "rect", space: "screen", x: 80, y: 420, width: 220, height: 220, fill: "#32b46b" }],
    events: [{ id: "d-travel", target: { kind: "object", id: "d-block" }, property: "x", start: 0, duration: 1, from: 80, to: 1620 }],
    audioEvents: [],
  };
  const eventSceneC = {
    version: 1, width: 1920, height: 1080, fps: 30, duration: 1, timeBasis: "scene-local",
    phases: [{ id: "native-phase", startSec: 0.35, durationSec: 0.2, timeBasis: "scene-local" }],
    audioEvents: [{ id: "native-body-hit", phaseId: "native-phase", phaseOffsetSec: 0.05, timeBasis: "scene-local" }],
  };
  const nativeCues = [
    { at: 0.12, kind: "title", text: "Source native clip" },
    { at: 0.42, kind: "draw", text: "Idea", data: { icon: "bulb", arrow: false } },
  ];

  const sceneAPath = path.join(runRoot, "motion-a.json");
  const sceneBPath = path.join(runRoot, "motion-b.json");
  const sceneDPath = path.join(runRoot, "motion-d.json");
  const eventSceneCPath = path.join(runRoot, "native-event-scene.json");
  const blueprintPath = path.join(runRoot, "film-blueprint.json");
  const picturePath = path.join(runRoot, "picture-only.mp4");
  const filmManifestPath = path.join(runRoot, "film-manifest.json");
  const sceneASha = await writeJson(sceneAPath, sceneA);
  const sceneBSha = await writeJson(sceneBPath, sceneB);
  const sceneDSha = await writeJson(sceneDPath, sceneD);
  const eventSceneCSha = await writeJson(eventSceneCPath, eventSceneC);
  const blueprint = {
    format: "laohu.huashu-film-blueprint/1",
    width: 1920,
    height: 1080,
    fps: 30,
    clock: { kind: "film-global", durationSec: 4 },
    segments: [
      { id: "a", renderer: "motion-scene", scenePath: "motion-a.json", sceneSha256: sceneASha, startSec: 0, endSec: 1, tailHandleFrames: 3 },
      { id: "b", renderer: "motion-scene", scenePath: "motion-b.json", sceneSha256: sceneBSha, startSec: 1, endSec: 2, headHandleFrames: 3, incomingTransition: { id: "laohu-motion-whip", method: "whip", windowFrames: 6, parameters: { dir: 1 } } },
      {
        id: "native-c",
        renderer: "huashu-motion-template",
        templateId: "laohu-motion-y3-whiteboard",
        variables: { duration: 1, cues: nativeCues },
        eventScenePath: "native-event-scene.json",
        eventSceneSha256: eventSceneCSha,
        startSec: 2,
        endSec: 3,
      },
      {
        id: "scene-d",
        renderer: "motion-scene", scenePath: "motion-d.json", sceneSha256: sceneDSha,
        startSec: 3, endSec: 4,
        incomingTransition: {
          id: "laohu-motion-fade", method: "crossfade", mode: "boundary-frame", windowFrames: 6,
          boundaryReason: "The native whiteboard resolves its beat before a separate moving scene introduces the next visual unit.",
        },
      },
    ],
  };
  const blueprintSha = await writeJson(blueprintPath, blueprint);
  const filmStdout = run(process.execPath, [templateCli, "render", "--film-blueprint", blueprintPath, "--output", picturePath, "--work-root", workRoot, "--manifest", filmManifestPath, "--browser", browser, "--ffmpeg", ffmpeg], "Film/1 render", { timeout: 600_000, env });
  const filmManifest = JSON.parse(await fs.readFile(filmManifestPath, "utf8"));
  assert.match(filmStdout, /FRAME_COUNT 120/);
  assert.equal(filmManifest.source.blueprintSha256, blueprintSha);
  assert.equal(filmManifest.render.frameCount, 120);
  assert.equal(filmManifest.assembly.audioStream, "absent", "Film/1 picture output is explicitly picture-only until the audio consumer muxes it");
  assert.equal(filmManifest.assembly.transition, "pinned-source-rendered-centered-A/B-windows");
  assert.equal(filmManifest.transitions.length, 2);
  const transition = filmManifest.transitions.find((row) => row.method === "whip");
  const boundaryTransition = filmManifest.transitions.find((row) => row.mode === "boundary-frame");
  assert.ok(boundaryTransition, "a native clip adjacent to a different renderer receives a boundary-frame source bridge");
  assert.equal(boundaryTransition.method, "crossfade");
  assert.match(boundaryTransition.boundaryReason, /separate moving scene/);
  assert.deepEqual(boundaryTransition.windowFrameRange, { startFrame: 87, endFrame: 93 });
  assert.equal(boundaryTransition.handleMap, null);
  assert.deepEqual(boundaryTransition.boundaryFrameMap.preceding.movingFrames, { startFrame: 27, endFrame: 30 });
  assert.deepEqual(boundaryTransition.boundaryFrameMap.incoming.movingFrames, { startFrame: 0, endFrame: 3 });
  assert.deepEqual(boundaryTransition.boundaryFrameMap.preceding.heldOutputRange, { startFrame: 3, endFrame: 6 });
  assert.deepEqual(boundaryTransition.boundaryFrameMap.incoming.heldOutputRange, { startFrame: 0, endFrame: 3 });
  assert.equal(boundaryTransition.renderedOutput.frameCount, 6);
  assert.ok(boundaryTransition.renderReceipt.sourceFunctionCalls["TRANSITIONS.crossfade"] >= 6);
  assert.ok(boundaryTransition.frames.every((row) => row.sourceFunctionCallCompleted && row.adapterCallsForInstance >= 1));
  assert.ok(boundaryTransition.frames.slice(0, 3).every((row) => row.B.held));
  assert.ok(boundaryTransition.frames.slice(3).every((row) => row.A.held));
  assert.equal(boundaryTransition.frames[3].A.sha256, boundaryTransition.frames[5].A.sha256, "A holds its actual last body frame after the cut");
  assert.equal(boundaryTransition.frames[0].B.sha256, boundaryTransition.frames[2].B.sha256, "B holds its actual first body frame before the cut");
  assert.deepEqual(transition.windowFrameRange, { startFrame: 27, endFrame: 33 });
  assert.equal(transition.handleMap.totalFrameCountDelta, 0);
  assert.deepEqual(transition.handleMap.preceding.sourceRange, { startFrame: 27, endFrame: 33 });
  assert.deepEqual(transition.handleMap.incoming.sourceRange, { startFrame: 0, endFrame: 6 });
  assert.equal(transition.renderedOutput.frameCount, 6);
  assert.ok(transition.renderReceipt.sourceFunctionCalls["TRANSITIONS.whip"] >= 6);
  assert.ok(transition.renderReceipt.adapterCalls.whip >= 6);
  assert.equal(transition.frames.length, 6);
  assert.ok(transition.frames.every((row) => row.sourceFunctionCallCompleted && row.adapterCallsForInstance >= 1));
  assert.ok(transition.frames.every((row) => row.adapterCallTimesSec.some((time) => Math.abs(time - row.outputFrameTimeSec) < 1e-8)));
  assert.ok(transition.outputPaths === undefined, "internal absolute transition output paths are not leaked into the portable film receipt");

  const segmentA = filmManifest.segments.find((row) => row.id === "a");
  const segmentB = filmManifest.segments.find((row) => row.id === "b");
  const segmentC = filmManifest.segments.find((row) => row.id === "native-c");
  const segmentD = filmManifest.segments.find((row) => row.id === "scene-d");
  const sourceA = path.resolve(path.dirname(filmManifestPath), segmentA.renderedOutputPath);
  const sourceB = path.resolve(path.dirname(filmManifestPath), segmentB.renderedOutputPath);
  const movementA = meanAbsoluteDifference(decodeFrame(ffmpeg, sourceA, 27), decodeFrame(ffmpeg, sourceA, 32));
  const movementB = meanAbsoluteDifference(decodeFrame(ffmpeg, sourceB, 0), decodeFrame(ffmpeg, sourceB, 5));
  assert.ok(movementA > 3, `A's body/tail handle must contain visible source motion; observed mean pixel delta ${movementA}`);
  assert.ok(movementB > 3, `B's head/body handle must contain visible source motion; observed mean pixel delta ${movementB}`);
  assert.equal(segmentC.renderer, "huashu-motion-template");
  assert.equal(segmentC.template.grammar, "y3_whiteboard");
  assert.ok(segmentC.nativeCueBindings.every((cue) => cue.sourceDataPreserved && cue.sourceAtSec === cue.renderAtSec));
  const nativeSpecPath = path.resolve(path.dirname(filmManifestPath), filmManifest.assembly.workRoot, "specs", "native-c.json");
  const renderedNativeSpec = JSON.parse(await fs.readFile(nativeSpecPath, "utf8"));
  assert.deepEqual(renderedNativeSpec.cues, nativeCues, "the actual native CLI receives the same data/cues and times as the film source");
  assert.equal(segmentC.headHandleFrames, 0);
  assert.equal(segmentC.tailHandleFrames, 0);
  assert.equal(segmentD.renderer, "motion-scene");
  assert.equal(segmentD.headHandleFrames, 0);
  assert.equal(segmentD.observedFrameCount, 30);
  const nativeTailMovement = meanAbsoluteDifference(decodeFrame(ffmpeg, path.resolve(path.dirname(filmManifestPath), segmentC.renderedOutputPath), 27), decodeFrame(ffmpeg, path.resolve(path.dirname(filmManifestPath), segmentC.renderedOutputPath), 29));
  const sceneHeadMovement = meanAbsoluteDifference(decodeFrame(ffmpeg, path.resolve(path.dirname(filmManifestPath), segmentD.renderedOutputPath), 0), decodeFrame(ffmpeg, path.resolve(path.dirname(filmManifestPath), segmentD.renderedOutputPath), 2));
  assert.ok(nativeTailMovement > 0.25, `native clip tail contributes actual moving source frames before the held boundary frame; observed ${nativeTailMovement}`);
  assert.ok(sceneHeadMovement > 0.25, `other renderer head contributes actual moving source frames after its held boundary frame; observed ${sceneHeadMovement}`);
  const excluded = new Map(filmManifest.excludedAudioEvents.map((row) => [row.eventId, row.reason]));
  assert.equal(excluded.get("a-tail-handle-hit"), "source-tail-handle-outside-film-body");
  assert.equal(excluded.get("b-head-handle-hit"), "source-head-handle-outside-film-body");
  assert.equal(filmManifest.audioEventBindings.length, 3);

  const verifiedFilm = await verifyFilmManifest(filmManifestPath);
  const resolved = resolveSourceEvents(["a-body-hit", "b-body-hit", "native-body-hit"], 3, verifiedFilm);
  assert.ok(Math.abs(resolved.get("a-body-hit").filmTimeSec - 0.72) < 1e-8);
  assert.ok(Math.abs(resolved.get("b-body-hit").filmTimeSec - 1.12) < 1e-8, "B's handle offset maps visual body events back onto its original film-global body clock");
  assert.ok(Math.abs(resolved.get("native-body-hit").filmTimeSec - 2.4) < 1e-8, "the native clip event enters the same verified film clock");
  assert.equal(resolved.has("a-tail-handle-hit"), false);
  assert.equal(resolved.has("b-head-handle-hit"), false);

  const audioRoot = path.join(runRoot, "audio");
  const assetsDir = path.join(audioRoot, "generated");
  await fs.mkdir(assetsDir, { recursive: true });
  const lockedSilence = floatWav({ n: RATE * 4, L: new Float32Array(RATE * 4), R: new Float32Array(RATE * 4) });
  const lockedVoicePath = path.join(audioRoot, "locked-voice.wav");
  await fs.writeFile(lockedVoicePath, lockedSilence);
  const request = {
    format: "laohu.motion.huashu-audio-request/1",
    sfxKit: "clean",
    generationAuthorization: {
      granted: true,
      scopes: ["sfx"],
      source: "explicit-user-request",
      instructionExcerpt: "Synthetic technical fixture: generate only the three deterministic SFX used to verify the Film/1 shared-clock audio chain.",
    },
    sfxEvents: ["a-body-hit", "b-body-hit", "native-body-hit"].map((eventId) => ({
      id: `technical-${eventId}`, eventId, name: "tick", options: {}, sourceGain: 0.5, sourcePan: 0, mixGainDb: -3, seed: `seed-${eventId}`,
    })),
  };
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 4, sampleRate: RATE, channels: 2,
    events: [],
    tracks: [{ id: "locked-voice-track", assetId: "locked-voice", bus: "voice", startSec: 0, locked: true }],
    voiceWindows: [{ id: "fixture-voice-window", startSec: 0.5, endSec: 1.5 }],
    ducking: { targetGainDb: -12, attackSec: 0.05, releaseSec: 0.1 },
    automation: [], timeMaps: [],
    assets: [{ id: "locked-voice", file: "locked-voice.wav", durationSec: 4, sha256: sha256(lockedSilence), license: "Project-generated technical fixture", redistribution: { status: "project-generated", basis: "Neutral silence preserves the locked voice-track clock in this technical test." }, reviewStatus: "generated-unreviewed" }],
    generatedAssets: [],
  };
  const requestPath = path.join(audioRoot, "request.json");
  const basePlanPath = path.join(audioRoot, "base-plan.json");
  const generatedPlanPath = path.join(audioRoot, "generated-plan.json");
  const audioSourceReceiptPath = path.join(audioRoot, "audio-source-receipt.json");
  await writeJson(requestPath, request);
  await writeJson(basePlanPath, basePlan);
  const generated = await generatePlan({
    request, basePlan, basePlanPath, film: verifiedFilm,
    inputFiles: [requestPath, basePlanPath, filmManifestPath],
    requestFilePath: requestPath, requestFileSha256: sha256(await fs.readFile(requestPath)),
    assetsDir, projectRoot: repoRoot, outputPlan: generatedPlanPath, manifestPath: audioSourceReceiptPath,
  });
  assert.deepEqual(generated.plan.events.map((row) => row.eventId).sort(), ["a-body-hit", "b-body-hit", "native-body-hit"]);
  assert.equal(generated.plan.tracks[0].locked, true);
  assert.equal(generated.plan.tracks[0].assetId, "locked-voice");
  assert.equal(generated.manifest.status, "generated-unreviewed");
  const mixedWavPath = path.join(audioRoot, "mix.wav");
  const audioManifestPath = path.join(audioRoot, "audio-manifest.json");
  const finalPath = path.join(audioRoot, "film-with-audio.mp4");
  const audioStdout = run(process.execPath, [
    audioCli,
    "--plan", generatedPlanPath,
    "--scene", path.resolve(path.dirname(filmManifestPath), filmManifest.audioEventScene.path),
    "--output", mixedWavPath,
    "--manifest", audioManifestPath,
    "--cache-dir", path.join(workRoot, "audio-cache"),
    "--ffmpeg", ffmpeg,
    "--video", picturePath,
    "--final-output", finalPath,
    "--allow-generated-preview",
  ], "audio plan render and picture mux", { timeout: 300_000, env });
  assert.match(audioStdout, /FINAL /);
  const finalProbe = probeVideo(ffprobe, finalPath);
  assert.equal(finalProbe.video.length, 1);
  assert.equal(finalProbe.audio.length, 1, "the existing audio renderer muxes the generated plan over the locked-clock picture output");
  assert.equal(Number(finalProbe.video[0].nb_read_frames), 120);
  assert.ok(Math.abs(finalProbe.durationSec - 4) < 0.05);
  assert.equal(generated.manifest.outputs.assets.length, 3);
  assert.equal(generated.manifest.qualityBoundary.includes("No generated audio has been auditioned or approved"), true);

  const evidence = {
    schema: "laohu-motion-film-e2e-evidence/1",
    assessment: "technical-integration-only; no human visual or audio quality review was performed",
    command: ["node", "scripts/templates.mjs", "render", "--film-blueprint", path.relative(repoRoot, blueprintPath), "--output", path.relative(repoRoot, picturePath), "--work-root", path.relative(repoRoot, workRoot), "--manifest", path.relative(repoRoot, filmManifestPath), "--browser", browser, "--ffmpeg", ffmpeg],
    filmManifestPath: path.relative(repoRoot, filmManifestPath),
    pictureOutputPath: path.relative(repoRoot, picturePath),
    audioPlanPath: path.relative(repoRoot, generatedPlanPath),
    audioReceiptPath: path.relative(repoRoot, audioManifestPath),
    finalMuxPath: path.relative(repoRoot, finalPath),
    outputFrames: finalProbe.video[0].nb_read_frames,
    outputDurationSec: finalProbe.durationSec,
    transitionMethod: transition.method,
    boundaryTransitionMethod: boundaryTransition.method,
    boundaryTransitionMode: boundaryTransition.mode,
    boundaryTransitionWindowFrameRange: boundaryTransition.windowFrameRange,
    boundaryTransitionReason: boundaryTransition.boundaryReason,
    nativeTailMovementMeanPixelDelta: nativeTailMovement,
    sceneHeadMovementMeanPixelDelta: sceneHeadMovement,
    sourceCallsOverall: transition.renderReceipt.sourceFunctionCalls["TRANSITIONS.whip"],
    adapterCallsOverall: transition.renderReceipt.adapterCalls.whip,
    aMovementMeanPixelDelta: movementA,
    bMovementMeanPixelDelta: movementB,
    bodyAudioEvents: Object.fromEntries([...resolved].map(([id, row]) => [id, row.filmTimeSec])),
    excludedHandleAudioEventIds: [...excluded.keys()],
    nativeSourceCuesPreserved: renderedNativeSpec.cues,
    generatedAudioReviewStatus: "generated-unreviewed",
  };
  await writeJson(path.join(runRoot, "evidence.json"), evidence);
  process.stdout.write(`FILM_E2E_EVIDENCE ${path.join(runRoot, "evidence.json")}\n`);
  process.stdout.write(`FILM_E2E_FINAL ${finalPath}\n`);
});

test("complete native OM and motion-scene boundary crossfade render as a fixed-clock picture-only Film", { timeout: 900_000 }, async (t) => {
  for (const file of [ffmpeg, ffprobe, browser]) await fs.access(file);
  const validationRoot = path.join(repoRoot, ".cache", "validation", "motion-fusion-implementation");
  const tempRoot = path.join(repoRoot, ".cache", "tmp", "motion-fusion-implementation");
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(validationRoot, `native-om-boundary-e2e-${process.pid}-`));
  const workRoot = path.join(tempRoot, `native-om-boundary-${path.basename(runRoot)}`);
  const preserve = process.env.MOTION_PRESERVE_BOUNDARY_OM_E2E === "1";
  if (preserve) process.stderr.write(`NATIVE_OM_BOUNDARY_EVIDENCE ${runRoot}\n`);
  else t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const env = { MOTION_FFMPEG: ffmpeg, MOTION_FFPROBE: ffprobe, TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot, OM_SAMPLES: "off" };
  await fs.mkdir(workRoot, { recursive: true });

  const scene = {
    version: 1, width: 1920, height: 1080, fps: 30, duration: 2, timeBasis: "scene-local", background: "#111827",
    objects: [{ id: "bridge-block", type: "rect", space: "screen", x: 80, y: 420, width: 220, height: 220, fill: "#36a0e6" }],
    events: [{ id: "bridge-travel", target: { kind: "object", id: "bridge-block" }, property: "x", start: 0, duration: 2, from: 80, to: 1620 }],
    audioEvents: [],
  };
  const scenePath = path.join(runRoot, "motion-scene.json");
  const blueprintPath = path.join(runRoot, "film-blueprint.json");
  const picturePath = path.join(runRoot, "picture-only.mp4");
  const filmManifestPath = path.join(runRoot, "film-manifest.json");
  const sceneSha = await writeJson(scenePath, scene);
  const blueprint = {
    format: "laohu.huashu-film-blueprint/1", width: 1920, height: 1080, fps: 30,
    clock: { kind: "film-global", durationSec: 4 },
    segments: [
      { id: "motion-scene-a", renderer: "motion-scene", scenePath: "motion-scene.json", sceneSha256: sceneSha, startSec: 0, endSec: 2 },
      {
        id: "complete-native-om-b", renderer: "laohu-native-om-template", templateId: "laohu-motion-finance-chart",
        variables: {
          duration: 2, title: "技术验证图表", unit: "单位：条", source: "来源：合成边界帧夹具", badge: "验证输入",
          series: JSON.stringify([{ label: "A", value: 8 }, { label: "B", value: 14 }]), chart: "bar", highlightIndex: 1,
        },
        startSec: 2, endSec: 4,
        incomingTransition: {
          id: "laohu-motion-fade", method: "crossfade", mode: "boundary-frame", windowFrames: 6,
          boundaryReason: "A source-native chart scene begins after a separate motion-scene establishes the preceding visual unit.",
        },
      },
    ],
  };
  const blueprintSha = await writeJson(blueprintPath, blueprint);
  run(process.execPath, [templateCli, "render", "--film-blueprint", blueprintPath, "--output", picturePath, "--work-root", workRoot, "--manifest", filmManifestPath, "--browser", browser, "--ffmpeg", ffmpeg], "complete native OM boundary Film render", { timeout: 600_000, env });

  const manifestBytes = await fs.readFile(filmManifestPath);
  const filmManifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.equal(filmManifest.source.blueprintSha256, blueprintSha);
  assert.equal(filmManifest.render.frameCount, 120);
  assert.equal(filmManifest.assembly.audioStream, "absent");
  const nativeSegment = filmManifest.segments.find((row) => row.id === "complete-native-om-b");
  assert.equal(nativeSegment.renderer, "laohu-native-om-template");
  assert.equal(nativeSegment.template.id, "laohu-motion-finance-chart");
  const transition = filmManifest.transitions.find((row) => row.mode === "boundary-frame");
  assert.ok(transition, "the complete native OM segment must enter the actual A/B boundary-frame renderer path");
  assert.equal(transition.method, "crossfade");
  assert.equal(transition.sourceFunction, "TRANSITIONS.crossfade");
  assert.equal(transition.renderedOutput.frameCount, 6);
  assert.deepEqual(transition.windowFrameRange, { startFrame: 57, endFrame: 63 });
  assert.deepEqual(transition.boundaryFrameMap.preceding.movingFrames, { startFrame: 57, endFrame: 60 });
  assert.deepEqual(transition.boundaryFrameMap.incoming.movingFrames, { startFrame: 0, endFrame: 3 });
  assert.equal(transition.handleMap, null);
  assert.ok(transition.renderReceipt.sourceFunctionCalls["TRANSITIONS.crossfade"] >= 6);
  assert.ok(transition.frames.slice(0, 3).every((row) => row.B.held));
  assert.ok(transition.frames.slice(3).every((row) => row.A.held));

  const sceneSegment = filmManifest.segments.find((row) => row.id === "motion-scene-a");
  const sceneOutput = path.resolve(path.dirname(filmManifestPath), sceneSegment.renderedOutputPath);
  const nativeOutput = path.resolve(path.dirname(filmManifestPath), nativeSegment.renderedOutputPath);
  assert.notEqual(sceneOutput, nativeOutput, "the bridge must receive two independently rendered source clips");
  assert.equal(sceneSegment.renderer, "motion-scene");
  assert.equal(new Set(transition.frames.slice(0, 3).map((row) => row.A.sha256)).size, 3, "the preceding renderer contributes three distinct actual pixel frames into the bridge");
  assert.equal(new Set(transition.frames.slice(3).map((row) => row.B.sha256)).size, 3, "the complete native OM renderer contributes three distinct actual pixel frames out of the bridge");

  const frameEvidence = [];
  for (const frameIndex of [56, 59, 60, 62, 63]) {
    const output = path.join(runRoot, `encoded-frame-${String(frameIndex).padStart(3, "0")}.png`);
    run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", picturePath, "-vf", `select=eq(n\\,${frameIndex}),scale=960:540`, "-fps_mode", "vfr", "-frames:v", "1", output], `extract encoded frame ${frameIndex}`);
    const bytes = await fs.readFile(output);
    assert.ok(bytes.length > 1_000, `encoded frame ${frameIndex} PNG must contain image data`);
    frameEvidence.push({ frameIndex, relativePath: path.basename(output), sha256: sha256(bytes), timing: frameIndex < 57 ? "before" : frameIndex < 63 ? "inside-window" : "after" });
  }
  const evidence = {
    format: "laohu.motion.native-om-boundary-frame-e2e/1",
    assessment: "real complete native OM and motion-scene media exercised through pinned TRANSITIONS.crossfade boundary-frame composition; fixed 120-frame clock and picture-only output verified; technical source/runtime evidence only, no human visual quality review",
    source: { blueprintSha256: blueprintSha, motionSceneSha256: sceneSha, nativeTemplateId: nativeSegment.template.id },
    output: { relativePath: path.basename(picturePath), sha256: sha256(await fs.readFile(picturePath)), frameCount: filmManifest.render.frameCount, durationSec: filmManifest.render.durationSec },
    manifest: { relativePath: path.basename(filmManifestPath), sha256: sha256(manifestBytes) },
    transition: { mode: transition.mode, method: transition.method, sourceFunction: transition.sourceFunction, sourceCommit: transition.sourceCommit, windowFrames: transition.windowFrames, windowFrameRange: transition.windowFrameRange, boundaryFrameMap: transition.boundaryFrameMap, renderReceipt: transition.renderReceipt },
    extractedEncodedFrames: frameEvidence,
  };
  const evidencePath = path.join(runRoot, "evidence.json");
  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  if (preserve) process.stdout.write(`NATIVE_OM_BOUNDARY_EVIDENCE_JSON ${evidencePath}\n`);
});

test("two different complete native OM templates crossfade through actual bitmap boundary frames", { timeout: 900_000 }, async (t) => {
  for (const file of [ffmpeg, ffprobe, browser]) await fs.access(file);
  const validationRoot = path.join(repoRoot, ".cache", "validation", "motion-fusion-implementation");
  const tempRoot = path.join(repoRoot, ".cache", "tmp", "motion-fusion-implementation");
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(validationRoot, `native-om-native-boundary-e2e-${process.pid}-`));
  const workRoot = path.join(tempRoot, `native-om-native-boundary-${path.basename(runRoot)}`);
  const preserve = process.env.MOTION_PRESERVE_NATIVE_NATIVE_E2E === "1";
  if (preserve) process.stderr.write(`NATIVE_OM_NATIVE_EVIDENCE ${runRoot}\n`);
  else t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const env = { MOTION_FFMPEG: ffmpeg, MOTION_FFPROBE: ffprobe, TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot, OM_SAMPLES: "off" };
  await fs.mkdir(workRoot, { recursive: true });

  const blueprintPath = path.join(runRoot, "film-blueprint.json");
  const picturePath = path.join(runRoot, "picture-only.mp4");
  const filmManifestPath = path.join(runRoot, "film-manifest.json");
  const blueprint = {
    format: "laohu.huashu-film-blueprint/1", width: 1920, height: 1080, fps: 30,
    clock: { kind: "film-global", durationSec: 12 },
    segments: [
      {
        id: "finance-chart-a", renderer: "laohu-native-om-template", templateId: "laohu-motion-finance-chart",
        variables: {
          duration: 2, title: "技术验证图表", unit: "单位：条", source: "来源：合成边界帧夹具", badge: "验证输入",
          series: JSON.stringify([{ label: "A", value: 8 }, { label: "B", value: 14 }]), chart: "bar", highlightIndex: 1,
        },
        startSec: 0, endSec: 2,
      },
      {
        id: "whiteboard-b", renderer: "laohu-native-om-template", templateId: "laohu-motion-whiteboard",
        variables: {
          duration: 10, pace: 1, title: "白板技术验证", point1: "第一条技术事实", draw1Text: "合成输入",
          point2: "第二条技术事实", draw2Text: "source renderer", point3: "边界帧照常取样", draw3Text: "没有手柄帧",
          highlightIndex: 1,
        },
        startSec: 2, endSec: 12,
        incomingTransition: {
          id: "laohu-motion-fade", method: "crossfade", mode: "boundary-frame", windowFrames: 6,
          boundaryReason: "The whiteboard continues the explanation after a distinct source-native finance chart shot.",
        },
      },
    ],
  };
  const blueprintSha = await writeJson(blueprintPath, blueprint);
  run(process.execPath, [templateCli, "render", "--film-blueprint", blueprintPath, "--output", picturePath, "--work-root", workRoot, "--manifest", filmManifestPath, "--browser", browser, "--ffmpeg", ffmpeg], "native OM to native OM boundary Film render", { timeout: 600_000, env });

  const manifestBytes = await fs.readFile(filmManifestPath);
  const filmManifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.equal(filmManifest.source.blueprintSha256, blueprintSha);
  assert.equal(filmManifest.render.frameCount, 360);
  assert.equal(filmManifest.render.durationSec, 12);
  assert.equal(filmManifest.assembly.audioStream, "absent");
  const finance = filmManifest.segments.find((row) => row.id === "finance-chart-a");
  const whiteboard = filmManifest.segments.find((row) => row.id === "whiteboard-b");
  assert.equal(finance.renderer, "laohu-native-om-template");
  assert.equal(whiteboard.renderer, "laohu-native-om-template");
  assert.equal(finance.template.id, "laohu-motion-finance-chart");
  assert.equal(whiteboard.template.id, "laohu-motion-whiteboard");
  assert.equal(finance.tailHandleFrames, 0);
  assert.equal(whiteboard.headHandleFrames, 0);
  const transition = filmManifest.transitions.find((row) => row.mode === "boundary-frame");
  assert.ok(transition, "native OM to native OM must enter the fixed bitmap bridge");
  assert.equal(transition.method, "crossfade");
  assert.equal(transition.sourceFunction, "TRANSITIONS.crossfade");
  assert.equal(transition.windowFrames, 6);
  assert.deepEqual(transition.windowFrameRange, { startFrame: 57, endFrame: 63 });
  assert.equal(transition.handleMap, null);
  assert.ok(transition.renderReceipt.sourceFunctionCalls["TRANSITIONS.crossfade"] >= 6);
  assert.ok(transition.frames.slice(0, 3).every((row) => row.B.held));
  assert.ok(transition.frames.slice(3).every((row) => row.A.held));

  const extractedEncodedFrames = [];
  for (const frameIndex of [56, 59, 60, 62, 63]) {
    const output = path.join(runRoot, `encoded-frame-${String(frameIndex).padStart(3, "0")}.png`);
    run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", picturePath, "-vf", `select=eq(n\\,${frameIndex}),scale=960:540`, "-fps_mode", "vfr", "-frames:v", "1", output], `extract native-native encoded frame ${frameIndex}`);
    const bytes = await fs.readFile(output);
    assert.ok(bytes.length > 1_000);
    extractedEncodedFrames.push({ frameIndex, relativePath: path.basename(output), sha256: sha256(bytes), timing: frameIndex < 57 ? "before" : frameIndex < 63 ? "inside-window" : "after" });
  }
  const evidence = {
    format: "laohu.motion.native-om-native-boundary-frame-e2e/1",
    assessment: "two distinct full native OM templates render through the pinned TRANSITIONS.crossfade bitmap boundary bridge; each keeps its own source duration and zero handles; 360-frame global clock and picture-only output verified; technical evidence only, no human visual quality review",
    source: { blueprintSha256: blueprintSha, templates: [{ segmentId: finance.id, templateId: finance.template.id }, { segmentId: whiteboard.id, templateId: whiteboard.template.id }] },
    output: { relativePath: path.basename(picturePath), sha256: sha256(await fs.readFile(picturePath)), frameCount: filmManifest.render.frameCount, durationSec: filmManifest.render.durationSec },
    manifest: { relativePath: path.basename(filmManifestPath), sha256: sha256(manifestBytes) },
    transition: { mode: transition.mode, method: transition.method, sourceFunction: transition.sourceFunction, sourceCommit: transition.sourceCommit, windowFrames: transition.windowFrames, windowFrameRange: transition.windowFrameRange, boundaryFrameMap: transition.boundaryFrameMap, renderReceipt: transition.renderReceipt },
    extractedEncodedFrames,
  };
  const evidencePath = path.join(runRoot, "evidence.json");
  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  if (preserve) process.stdout.write(`NATIVE_OM_NATIVE_EVIDENCE_JSON ${evidencePath}\n`);
});

test("49 callable pinned source transition methods render five seek states; retain strict repeat-pixel failures and block comicPanels", { timeout: 300_000 }, async (t) => {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const library = catalog.effectLibraries.find((row) => row.id === "laohu-motion-transitions");
  assert.ok(library, "catalog records the source transition closure");
  const missingSource = await Promise.all((library.loadOrder || []).map(async (file) => {
    try { await fs.access(path.join(transitionSourceRoot, file)); return null; }
    catch { return file; }
  })).then((rows) => rows.filter(Boolean));
  if (missingSource.length) {
    t.skip(`optional pinned transition source snapshot is unavailable (${missingSource[0]}); local consumer tests remain active`);
    return;
  }
  const groups = new Map(catalog.effects.filter((row) => row.renderer === "custom:laohu-motion-transition").map((row) => [row.id, row]));
  const requiredParameters = {
    same: { continuityEvidence: "The paired frames are consecutive states of one continuous world and camera." },
    lensReveal: {
      lensProfile: [{ at: 0, x: 160, y: 90, r: 0 }, { at: 0.5, x: 160, y: 90, r: 100 }, { at: 1, x: 160, y: 90, r: 280 }],
      ring: [120, 240, 255], ring2: [70, 230, 255],
    },
    matchCut: { matchedCutEvidence: "The technical fixture's center colors match at the join.", width: 0.2, at: 0.5 },
    fillZoom: { cx: 160, cy: 90, fill: "#2477e8", maxZoom: 8 },
    zoomThrough: { cx: 160, cy: 90, zoom: 4, bg: "#111827" },
    expandRect: { rect: { x: 40, y: 25, w: 240, h: 130 } },
  };
  const methods = library.functions.map((sourceRow) => {
    const method = sourceRow.id.replace(/^TRANSITIONS\./, "");
    const group = groups.get(sourceRow.groupId);
    assert.ok(group?.sourceFunctions.includes(sourceRow.id), `${sourceRow.id} resolves to its canonical method group`);
    return { method, groupId: sourceRow.groupId, availability: sourceRow.availability, parameters: requiredParameters[method] || {} };
  });
  assert.equal(methods.length, 50, "inventory count is derived from the pinned source function list");
  const callableMethods = methods.filter((row) => row.availability !== "source-only");
  const sourceOnlyMethods = methods.filter((row) => row.availability === "source-only");
  assert.equal(callableMethods.length, 49);
  assert.deepEqual(sourceOnlyMethods.map((row) => row.method), ["comicPanels"]);

  const validationRoot = path.join(repoRoot, ".cache", "validation", "motion-blocks");
  const tempRoot = path.join(repoRoot, ".cache", "tmp", "motion-blocks");
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
  const suffix = `transition-source-smoke-${process.pid}-${Date.now()}`;
  const profilePath = path.join(tempRoot, suffix);
  const resultPath = path.join(validationRoot, `${suffix}.json`);
  const context = await chromium.launchPersistentContext(profilePath, { executablePath: browser, headless: true, viewport: { width: 320, height: 180 } });
  try {
    const page = await context.newPage();
    await page.setContent('<canvas id="stage" width="320" height="180"></canvas>');
    await page.addScriptTag({ path: motionCorePath });
    await page.addScriptTag({ path: motionOpsPath });
    for (const file of library.loadOrder) await page.addScriptTag({ path: path.join(transitionSourceRoot, file) });
    await page.addScriptTag({ path: transitionAdapterPath });
    const report = await page.evaluate(async ({ methods, callableMethods }) => {
      const width = 320, height = 180;
      window.U.setStage(width, height);
      const makeSource = (background, accent, x) => {
        const source = document.createElement("canvas");
        source.width = width; source.height = height;
        const context = source.getContext("2d");
        context.fillStyle = background; context.fillRect(0, 0, width, height);
        context.fillStyle = accent; context.fillRect(x, 34, 96, 76);
        context.beginPath(); context.arc(width - x / 2, 122, 30, 0, Math.PI * 2); context.fillStyle = "#ffffff"; context.fill();
        return source.toDataURL("image/png");
      };
      const A = makeSource("#c92430", "#f6bd3c", 28);
      const B = makeSource("#173f8a", "#34b78f", 194);
      const sourceCalls = Object.create(null);
      const sourceProgress = Object.create(null);
      for (const row of methods) {
        const original = window.TRANSITIONS[row.method];
        if (typeof original !== "function") throw new Error(`Missing pinned source function TRANSITIONS.${row.method}`);
        window.TRANSITIONS[row.method] = function(...args) {
          sourceCalls[row.method] = (sourceCalls[row.method] || 0) + 1;
          (sourceProgress[row.method] ||= []).push(args[3]);
          return Reflect.apply(original, this, args);
        };
      }
      const sceneObject = (row) => ({
        id: `transition-${row.method}`,
        type: "custom:laohu-motion-transition",
        data: {
          instanceId: `instance-${row.method}`,
          progress: 0.5,
          transitionDurationSec: 1,
          groupId: row.groupId,
          method: row.method,
          parameters: row.parameters,
          sourceFrames: { A, B },
        },
      });
      const scene = {
        version: 1, width, height, fps: 30, duration: 1, timeBasis: "scene-local",
        objects: callableMethods.map(sceneObject),
      };
      const renderers = {};
      window.LaohuMotionTransitions.register(renderers);
      await window.LaohuMotionTransitions.prepare(scene);
      const stage = document.getElementById("stage");
      const seekOrder = [0, 0.37, 1, 0.63, 0.37];
      const results = [];
      const errors = [];
      const preparedItems = scene.objects.slice();
      for (const row of methods) {
        if (row.availability === "source-only") {
          results.push({ method: row.method, groupId: row.groupId, availability: row.availability, sourceCalls: 0, seekOrder: [], outputHashes: [], repeatDiff: null, repeatedSeekMatches: null });
          continue;
        }
        const item = preparedItems.find((candidate) => candidate.data.method === row.method);
        scene.objects = [item];
        const hashes = [];
        let firstRepeatedPixels = null;
        let repeatDiff = null;
        for (const progress of seekOrder) {
          item.data.progress = progress;
          try {
            window.MotionCore.drawFrame(stage, scene, progress, renderers, true);
            const pixels = stage.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height).data;
            if (progress === 0.37) {
              if (firstRepeatedPixels == null) firstRepeatedPixels = new Uint8ClampedArray(pixels);
              else {
                let count = 0, max = 0, sum = 0;
                for (let index = 0; index < pixels.length; index += 1) {
                  const difference = Math.abs(pixels[index] - firstRepeatedPixels[index]);
                  if (difference) count += 1;
                  if (difference > max) max = difference;
                  sum += difference;
                }
                repeatDiff = { differentChannels: count, maxChannelDelta: max, meanChannelDelta: sum / pixels.length };
              }
            }
            let hash = 2166136261;
            for (let index = 0; index < pixels.length; index += 1) hash = Math.imul(hash ^ pixels[index], 16777619);
            hashes.push((hash >>> 0).toString(16).padStart(8, "0"));
          } catch (error) {
            errors.push({ method: row.method, progress, message: String(error?.message || error) });
            break;
          }
        }
        results.push({
          method: row.method,
          groupId: row.groupId,
          availability: row.availability,
          sourceCalls: sourceCalls[row.method] || 0,
          sourceProgress: sourceProgress[row.method] || [],
          seekOrder,
          outputHashes: hashes,
          repeatDiff,
          repeatedSeekMatches: hashes.length === seekOrder.length && hashes[1] === hashes.at(-1),
        });
      }
      let sourceOnlyRejection = null;
      try {
        await window.LaohuMotionTransitions.prepare({ ...scene, objects: [sceneObject(methods.find((row) => row.availability === "source-only"))] });
      } catch (error) {
        sourceOnlyRejection = String(error?.message || error);
      }
      return {
        sourceMethodCount: Object.keys(window.TRANSITIONS).length,
        preparedMethodCount: window.LaohuMotionTransitions.evidence.renderedInstances.length,
        adapterCalls: window.LaohuMotionTransitions.evidence.calls,
        perInstanceCalls: window.LaohuMotionTransitions.evidence.callsByInstance,
        methods: results,
        errors,
        sourceOnlyRejection,
      };
    }, { methods, callableMethods });
    assert.equal(report.sourceMethodCount, 50);
    assert.equal(report.preparedMethodCount, 49);
    assert.deepEqual(report.errors, []);
    assert.match(report.sourceOnlyRejection, /comicPanels remains source-only: TRANSITIONS\.comicPanels calls PAINT\.dotPattern/);
    assert.ok(report.methods.filter((row) => row.availability !== "source-only").every((row) => row.sourceCalls === 5), "each callable original method receives all five ordered and repeated seek states");
    const repeatFailures = report.methods.filter((row) => row.availability !== "source-only" && !row.repeatedSeekMatches).map(({ method, repeatDiff }) => ({ method, repeatDiff }));
    assert.equal(repeatFailures.length, 2, `strict repeated-pixel check must retain the two independently confirmed source repeat differences: ${JSON.stringify(repeatFailures)}`);
    assert.deepEqual(repeatFailures.map((row) => row.method).sort(), ["crossfade", "swirl"]);
    assert.ok(repeatFailures.every((row) => row.repeatDiff?.maxChannelDelta > 0 && row.repeatDiff?.meanChannelDelta > 0));
    assert.equal(report.methods.find((row) => row.method === "comicPanels").sourceCalls, 0);
    assert.ok(report.methods.filter((row) => row.availability !== "source-only").every((row) => report.perInstanceCalls[`instance-${row.method}`]?.calls === 5));
    const bytes = Buffer.from(JSON.stringify({
      schema: "laohu-transition-source-smoke/1",
      assessment: "source call coverage and five-state rendering evidence; strict repeated-pixel equality fails for crossfade and swirl, which independent fresh-process direct-source versus adapter evidence shows are source repeat deltas; cause not assigned; no human visual quality review",
      sourceId: library.sourceId,
      sourceFile: "scripts/engine/transitions.js",
      sourceFunctionCount: report.sourceMethodCount,
      callableFunctionCount: report.preparedMethodCount,
      strictRepeatedPixelCheck: { status: repeatFailures.length ? "FAIL" : "PASS", failures: repeatFailures },
      independentColdProcessParityEvidence: ".cache/validation/motion-building-blocks/audit/source-repeat-isolation-6048-1794044346068.json",
      sourceOnly: report.methods.filter((row) => row.availability === "source-only").map((row) => ({ method: row.method, reason: report.sourceOnlyRejection })),
      seekOrder: [0, 0.37, 1, 0.63, 0.37],
      methods: report.methods,
    }, null, 2) + "\n");
    await fs.writeFile(resultPath, bytes, { flag: "wx" });
    process.stdout.write(`TRANSITION_SOURCE_SMOKE ${resultPath}\n`);
  } finally {
    await context.close();
  }
});
