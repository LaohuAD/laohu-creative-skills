import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test, {afterEach} from "node:test";
import {fileURLToPath} from "node:url";
import {analyseAudio, runCheck} from "../scripts/laohu-audio-check.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const scriptPath = path.join(repoRoot, ".agents", "skills", "laohu-motion", "scripts", "laohu-audio-check.mjs");
const tmpRoot = process.env.MOTION_AUDIO_CHECK_TEST_TMP_DIR
  ? path.resolve(process.env.MOTION_AUDIO_CHECK_TEST_TMP_DIR)
  : path.join(repoRoot, ".cache", "tmp", "motion-audio-integration", "audio-temp");
const ffmpeg = process.env.MOTION_FFMPEG || "/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg";
const ffprobe = process.env.MOTION_FFPROBE || path.join(path.dirname(ffmpeg), "ffprobe");
const fixtures = [];

function run(executable, args, env = process.env) {
  const result = spawnSync(executable, args, {encoding: "utf8", env, maxBuffer: 16 * 1024 * 1024});
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout || "command failed");
  return result.stdout;
}

async function makeRoot(prefix) {
  await fs.mkdir(tmpRoot, {recursive: true});
  const root = await fs.mkdtemp(path.join(tmpRoot, prefix));
  fixtures.push(root);
  return root;
}

function windowsFile(root, name, windows) {
  const file = path.join(root, name);
  fsSync.writeFileSync(file, JSON.stringify({
    format: "laohu.motion.audio-check-windows/1",
    timeBasis: "film-global",
    windows,
  }, null, 2) + "\n");
  return file;
}

function makeGapMux(root) {
  const output = path.join(root, "pts-gap.mp4");
  run(ffmpeg, [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-copyts",
    "-f", "lavfi", "-i", "color=c=black:s=160x90:r=25:d=4",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=4",
    "-filter_complex", "[1:a]aselect='not(between(t,1,2))',asetpts=PTS+0.25/TB[a]",
    "-map", "0:v:0", "-map", "[a]", "-c:v", "libx264", "-preset", "ultrafast",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-t", "4", output,
  ]);
  return output;
}

function makeShortAudioMux(root) {
  const output = path.join(root, "audio-ends-before-video.mp4");
  run(ffmpeg, [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=black:s=160x90:r=25:d=4",
    "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=1.5",
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "ultrafast",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-t", "4", output,
  ]);
  return output;
}

function makeExactFrameBoundaryMux(root) {
  const output = path.join(root, "502-frame-exact-clock.mp4");
  run(ffmpeg, [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=black:s=160x90:r=30",
    "-f", "lavfi", "-t", "16.72", "-i", "anullsrc=r=48000:cl=stereo",
    "-map", "0:v:0", "-map", "1:a:0", "-frames:v", "502",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-video_track_timescale", "15360", "-c:a", "aac", "-b:a", "128k", output,
  ]);
  return output;
}

function makeAntiPhaseWav(root) {
  const output = path.join(root, "anti-phase.wav");
  run(ffmpeg, [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "aevalsrc=0.2*sin(2*PI*997*t)|-0.2*sin(2*PI*997*t):s=48000:d=2:c=stereo",
    "-c:a", "pcm_f32le", output,
  ]);
  return output;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => fs.rm(root, {recursive: true, force: true})));
});

test("CLI measures the actual mux on video-relative PCM and preserves leading and interior PTS gaps", {timeout: 90_000}, async () => {
  const root = await makeRoot("audio-check-pts-");
  const mux = makeGapMux(root);
  const frameProbe = JSON.parse(run(ffprobe, [
    "-v", "error", "-select_streams", "a:0", "-show_frames",
    "-show_entries", "frame=pts_time,nb_samples", "-of", "json", mux,
  ]));
  const frames = frameProbe.frames;
  let largestGapSec = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const previousEnd = Number(frames[index - 1].pts_time) + Number(frames[index - 1].nb_samples) / 48000;
    largestGapSec = Math.max(largestGapSec, Number(frames[index].pts_time) - previousEnd);
  }
  assert.ok(largestGapSec > 0.9, "the generated AAC fixture must contain a real interior decoded-frame PTS gap");

  const windows = windowsFile(root, "windows.json", [
    {eventId: "leading", startSec: 0.05, endSec: 0.2},
    {eventId: "before-gap", startSec: 0.6, endSec: 0.8},
    {eventId: "interior-gap", startSec: 1.4, endSec: 1.8},
    {eventId: "after-gap", startSec: 2.5, endSec: 2.8},
  ]);
  const outputDir = path.join(root, "check-output");
  const env = {...process.env, TMPDIR: root, MOTION_FFMPEG: ffmpeg, MOTION_FFPROBE: ffprobe};
  const help = spawnSync(process.execPath, [scriptPath, "--help"], {encoding: "utf8", env});
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: laohu-audio-check/);
  const cli = spawnSync(process.execPath, [
    scriptPath, mux, "--out-dir", outputDir, "--windows", windows,
    "--ffmpeg", ffmpeg, "--ffprobe", ffprobe,
  ], {encoding: "utf8", env, timeout: 90_000, maxBuffer: 8 * 1024 * 1024});
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const report = JSON.parse(cli.stdout);
  assert.equal(report.status, "measured");
  assert.equal(report.input.video.startSec, 0);
  assert.ok(report.input.stream.offsetFromVideoStartSec > 0.2, "fixture audio must begin after the video clock origin");
  assert.ok(report.analysis.decodedDurationSec > 4, "normalized PCM must retain the leading offset and interior PTS gap");
  assert.match(report.analysis.method.clock.ffmpegFilter, /aresample=async=1:first_pts=0/);
  assert.equal(report.analysis.method.clock.basis, "video-relative; sample index zero is the first video stream presentation timestamp");
  const measured = new Map(report.analysis.windows.map((row) => [row.eventId, row]));
  assert.ok(measured.get("leading").rmsDbfs < -100, "leading video-relative region must be represented as silence");
  assert.ok(measured.get("before-gap").rmsDbfs > -40, "signal before the PTS gap remains at its film-global time");
  assert.ok(measured.get("interior-gap").rmsDbfs < -100, "the interior timestamp gap must not be compressed away");
  assert.ok(measured.get("after-gap").rmsDbfs > -40, "signal after the PTS gap remains at its film-global time");
  for (const output of [report.outputs.wavePng, report.outputs.spectrumPng, report.outputs.json]) {
    assert.ok(fsSync.statSync(output).size > 0, "each reported analysis artifact must exist: " + output);
  }
  assert.match(report.analysis.method.spectrumAndRmsChannelMethod, /anti-phase stereo can cancel/);
  assert.equal(report.interpretation.includes("UNKNOWN"), true, "the checker must leave listening/quality unresolved");

  const token = "default-root-" + process.pid + "-" + Date.now();
  const defaultInput = path.join(root, token + ".mp4"), defaultOutput = path.join(repoRoot, ".cache", "validation", "audio-check", token);
  await fs.copyFile(mux, defaultInput);
  assert.equal(fsSync.existsSync(defaultOutput), false, "unique default output path must not preexist");
  try {
    const defaultRun = spawnSync(process.execPath, [scriptPath, defaultInput, "--ffmpeg", ffmpeg, "--ffprobe", ffprobe], {
      encoding: "utf8", env, timeout: 90_000, maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(defaultRun.status, 0, defaultRun.stderr || defaultRun.stdout);
    const defaultReport = JSON.parse(defaultRun.stdout);
    assert.ok(defaultReport.outputs.json.startsWith(defaultOutput + path.sep), "default output belongs to the invoking project work root, not the installed script directory");
  } finally {
    await fs.rm(defaultOutput, {recursive: true, force: true});
  }
});

test("an absent audio tail is reported as uncovered instead of being synthesized", {timeout: 90_000}, async () => {
  const root = await makeRoot("audio-check-short-tail-");
  const mux = makeShortAudioMux(root);
  const windows = windowsFile(root, "windows.json", [{eventId: "after-audio", startSec: 3.2, endSec: 3.8}]);
  const report = await runCheck({file: mux, outDir: path.join(root, "check-output"), windowsFile: windows, ffmpeg, ffprobe});
  assert.equal(report.input.video.durationSec, 4);
  assert.ok(report.analysis.decodedDurationSec < 2, "decoder must stop with the last real audio frame");
  assert.equal(report.analysis.windows[0].rmsDbfs, null);
  assert.equal(report.analysis.windows[0].decodedCoverageSec, 0);
  assert.ok(report.analysis.windows[0].missingAudioTailSec > 1);
  assert.equal(report.analysis.windows[0].measurementStatus, "audio-does-not-cover-complete-window");
});

test("mux probe uses exact video duration_ts and time_base at a frame boundary", {timeout: 90_000}, async () => {
  const root = await makeRoot("audio-check-rational-video-clock-");
  const mux = makeExactFrameBoundaryMux(root);
  const videoDurationSec = 257024 / 15360;
  const windows = windowsFile(root, "windows.json", [{eventId: "final-frame", startSec: videoDurationSec - 0.1, endSec: videoDurationSec}]);
  const report = await runCheck({file: mux, outDir: path.join(root, "check-output"), windowsFile: windows, ffmpeg, ffprobe});
  assert.equal(report.input.video.frameCount, 502);
  assert.equal(report.input.video.durationSec, videoDurationSec, "the video clock comes from 257024 ticks at 1/15360, not the rounded duration text");
  assert.deepEqual(report.input.video.durationClock, {
    durationSec: videoDurationSec,
    basis: "stream.duration_ts × stream.time_base",
    durationTs: "257024",
    timeBase: "1/15360",
  });
  assert.equal(report.input.stream.streamDurationSec, 16.72, "the shorter audio stream keeps its own exact 16.72-second duration");
  assert.equal(report.input.stream.durationClock.basis, "stream.duration_ts × stream.time_base");
  assert.equal(report.analysis.windows[0].measurementStatus, "audio-does-not-cover-complete-window", "the checker must not invent audio to fill the 13.333 ms video tail");
  assert.ok(report.analysis.windows[0].missingAudioTailSec > 0, "decoded audio must remain short of the exact video-window end");
});

test("mono spectrum/RMS cancellation is documented while stereo loudness remains measurable", {timeout: 90_000}, async () => {
  const root = await makeRoot("audio-check-anti-phase-");
  const wav = makeAntiPhaseWav(root);
  const env = {...process.env, TMPDIR: root};
  const analysis = await analyseAudio(wav, ffmpeg, "asetpts=PTS-0.000000000000/TB,aresample=async=1:first_pts=0", env);
  const spectralPower = analysis.bins.reduce((sum, value) => sum + value, 0);
  assert.ok(spectralPower < 1e-12, "opposite-phase channels cancel under the retained mono=(L+R)/2 source method");
  const report = await runCheck({
    file: makeAntiPhaseMux(root, wav), outDir: path.join(root, "check-output"), ffmpeg, ffprobe,
  });
  assert.ok(Number.isFinite(report.analysis.integratedLufs), "ebur128 analyzes the decoded stereo stream rather than the mono FFT reduction");
  assert.match(report.analysis.method.spectrumAndRmsChannelMethod, /anti-phase stereo can cancel/);
});

function makeAntiPhaseMux(root, wav) {
  const output = path.join(root, "anti-phase.mp4");
  run(ffmpeg, [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=black:s=160x90:r=25:d=2",
    "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "ultrafast",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-t", "2", output,
  ]);
  return output;
}

test("output collision checks resolve symlinks and protect mux/window inputs before writing", {timeout: 90_000}, async () => {
  const root = await makeRoot("audio-check-collision-");
  const mux = makeGapMux(root);
  const collisionDir = path.join(root, "collision");
  await fs.mkdir(collisionDir);
  const waveAlias = path.join(collisionDir, "wave.png");
  await fs.symlink(mux, waveAlias);
  await assert.rejects(
    runCheck({file: waveAlias, outDir: collisionDir, ffmpeg, ffprobe}),
    /refusing to overwrite analysis input/,
  );
  assert.equal((await fs.lstat(waveAlias)).isSymbolicLink(), true, "collision rejection must leave the input alias intact");
  assert.equal(fsSync.existsSync(path.join(collisionDir, "spectrum.png")), false, "collision rejection must happen before writing peer outputs");

  const windows = windowsFile(collisionDir, "analysis.json", []);
  await assert.rejects(
    runCheck({file: mux, outDir: collisionDir, windowsFile: windows, ffmpeg, ffprobe}),
    /refusing to overwrite analysis input/,
  );
  assert.equal(fsSync.existsSync(path.join(collisionDir, "spectrum.png")), false, "window collision rejection must happen before any output write");
});
