#!/usr/bin/env node
/*
 * Selected measurement and visualization routines migrated from:
 * ConardLi/garden-skills, commit 08150e750bdc8c8dc452fb43c8ef5221b71c4308
 *   skills/motion-showreel/scripts/audio.mjs (measureLoudness, analyseAudio,
 *   measurement and picture portions of check)
 *   skills/motion-showreel/scripts/lib/fft.mjs (fft, stft)
 *
 * MIT License
 * Copyright (c) 2026
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Local adaptation adds the CLI, explicit FFmpeg/ffprobe selection, video-relative
 * PTS normalization, optional film-global windows, path-collision guards and a
 * measurement receipt. Source measurement order and numerical operations remain.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SR = 48000;
const SOURCE_COMMIT = "08150e750bdc8c8dc452fb43c8ef5221b71c4308";
const SOURCE_FILES = Object.freeze([
  { path: "skills/motion-showreel/scripts/audio.mjs", sha256: "28288b54ba6facb9ed1a41b151ed9f0d1b1daab4445ee1efdd18bd2d57a8a41c", lines: "147-169, 203-262" },
  { path: "skills/motion-showreel/scripts/lib/fft.mjs", sha256: "5b0ea953cc794e6072e11767a5b6ce624e97190d11eba8970062030a7a62866b", lines: "1-37" },
]);
const OCTAVES_HZ = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// In-place iterative radix-2 complex FFT. re/im are Float64Array of power-of-two length.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

// Magnitude spectrogram frames of a mono signal.
function stft(x, nfft = 1024, hop = 256) {
  const win = new Float64Array(nfft).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (nfft - 1)));
  const frames = Math.max(0, 1 + Math.floor((x.length - nfft) / hop)), out = [];
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < nfft; i++) { re[i] = x[f * hop + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const mag = new Float32Array(nfft / 2 + 1);
    for (let k = 0; k <= nfft / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    out.push(mag);
  }
  return out;
}

function resolveTools({ ffmpeg, ffprobe } = {}) {
  const resolvedFfmpeg = ffmpeg || process.env.MOTION_FFMPEG || "ffmpeg";
  const resolvedFfprobe = ffprobe || process.env.MOTION_FFPROBE
    || (path.isAbsolute(resolvedFfmpeg)
      ? path.join(path.dirname(resolvedFfmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
      : "ffprobe");
  return { ffmpeg: resolvedFfmpeg, ffprobe: resolvedFfprobe };
}

function probeMux(file, ffprobe, env) {
  const result = spawnSync(ffprobe, [
    "-v", "error",
    "-show_entries", "format=start_time,duration:stream=index,codec_type,codec_name,width,height,sample_rate,channels,channel_layout,duration,duration_ts,time_base,nb_frames,start_time,bit_rate",
    "-of", "json", file,
  ], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, env });
  if (result.error || result.status !== 0) throw new Error("could not probe mux: " + (result.error?.message || result.stderr.trim().split("\n").pop() || result.status));
  let data;
  try { data = JSON.parse(result.stdout); } catch (error) { throw new Error("ffprobe returned malformed JSON: " + error.message); }
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const audio = data.streams?.find((stream) => stream.codec_type === "audio");
  if (!video || !audio) throw new Error("input must be a mux containing video and a decodable audio stream");
  const videoStartSec = numberOr(video.start_time, 0);
  const audioStartSec = numberOr(audio.start_time, 0);
  const videoDurationEvidence = streamDurationEvidence(video)
    || (Number.isFinite(Number(data.format?.duration))
      ? {durationSec: Number(data.format.duration), basis: "format.duration fallback", durationTs: null, timeBase: video.time_base || null}
      : null);
  const audioDurationEvidence = streamDurationEvidence(audio);
  const videoDurationSec = videoDurationEvidence?.durationSec ?? NaN;
  if (!(videoDurationSec > 0)) throw new Error("mux has no usable video duration");
  return {
    video: {
      streamIndex: video.index,
      codec: video.codec_name || null,
      width: Number.isFinite(Number(video.width)) ? Number(video.width) : null,
      height: Number.isFinite(Number(video.height)) ? Number(video.height) : null,
      frameCount: Number.isFinite(Number(video.nb_frames)) ? Number(video.nb_frames) : null,
      startSec: videoStartSec,
      durationSec: videoDurationSec,
      durationClock: videoDurationEvidence,
    },
    audio: {
      streamIndex: audio.index,
      codec: audio.codec_name || null,
      sampleRateHz: Number.isFinite(Number(audio.sample_rate)) ? Number(audio.sample_rate) : null,
      channels: Number.isFinite(Number(audio.channels)) ? Number(audio.channels) : null,
      channelLayout: audio.channel_layout || null,
      streamDurationSec: audioDurationEvidence?.durationSec ?? null,
      durationClock: audioDurationEvidence,
      streamStartSec: audioStartSec,
      offsetFromVideoStartSec: audioStartSec - videoStartSec,
      bitRate: Number.isFinite(Number(audio.bit_rate)) ? Number(audio.bit_rate) : null,
    },
    videoStartSec,
    videoDurationSec,
    timestampFilter: "asetpts=PTS-" + videoStartSec.toFixed(12) + "/TB,aresample=async=1:first_pts=0",
  };
}

function streamDurationEvidence(stream) {
  const ticks = typeof stream.duration_ts === "string" || typeof stream.duration_ts === "number"
    ? String(stream.duration_ts).match(/^(-?\d+)$/) : null;
  const timeBase = typeof stream.time_base === "string" ? stream.time_base.match(/^(\d+)\/(\d+)$/) : null;
  if (ticks && timeBase) {
    const tickCount = BigInt(ticks[1]);
    const numerator = BigInt(timeBase[1]);
    const denominator = BigInt(timeBase[2]);
    if (tickCount >= 0n && numerator > 0n && denominator > 0n) {
      const durationSec = Number(tickCount * numerator) / Number(denominator);
      if (Number.isFinite(durationSec)) {
        return {durationSec, basis: "stream.duration_ts × stream.time_base", durationTs: ticks[1], timeBase: timeBase[1] + "/" + timeBase[2]};
      }
    }
  }
  const direct = Number(stream.duration);
  if (Number.isFinite(direct) && direct >= 0) {
    return {durationSec: direct, basis: "stream.duration", durationTs: null, timeBase: stream.time_base || null};
  }
  return null;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function binaryVersion(executable, env) {
  const result = spawnSync(executable, ["-version"], { encoding: "utf8", maxBuffer: 1024 * 1024, env });
  if (result.error || result.status !== 0) throw new Error("required media tool is unavailable: " + executable + " (" + (result.error?.message || result.stderr.trim().split("\n")[0] || result.status) + ")");
  return result.stdout.split(/\r?\n/, 1)[0] || executable;
}

function measureLoudness(file, ffmpeg, timestampFilter, env) {
  const meter = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-loglevel", "info", "-copyts", "-i", file, "-map", "0:a:0", "-vn", "-af", timestampFilter + ",ebur128=peak=true:framelog=verbose", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env });
  if (meter.error || meter.status !== 0) throw new Error("could not measure audio: " + (meter.error?.message || meter.stderr.trim().split("\n").pop() || meter.status));
  if (!meter.stderr.includes("Summary:")) throw new Error("could not measure audio: ffmpeg returned no ebur128 summary");
  const sum = meter.stderr.slice(meter.stderr.lastIndexOf("Summary:"));
  const I = +(/I:\s+(-?[\d.]+) LUFS/.exec(sum)?.[1] ?? NaN);
  const LRA = +(/LRA:\s+(-?[\d.]+) LU/.exec(sum)?.[1] ?? NaN);
  const TP = +(/Peak:\s+(-?(?:[\d.]+|inf)) dBFS/.exec(sum)?.[1]?.replace("-inf", "-Infinity") ?? NaN);
  if ([I, LRA, TP].some(Number.isNaN)) throw new Error("could not measure audio: malformed ebur128 summary");
  return { I, LRA, TP };
}

async function analyseAudio(file, ffmpeg, timestampFilter, env) {
  const ff = spawn(ffmpeg, ["-v", "error", "-copyts", "-i", file, "-map", "0:a:0", "-vn", "-af", timestampFilter, "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { stdio: ["ignore", "pipe", "pipe"], env });
  let err = "", pending = Buffer.alloc(0), n = 0, clip = 0, count = 0, energy = 0, quietStart = -1;
  const fftWindow = new Float32Array(4096), bins = new Float64Array(2049), energies = [], quiet = [];
  const bucketSize = Math.round(SR * 0.01), quietSize = Math.round(SR * 0.05);
  let bucketEnergy = 0, quietEnergy = 0;
  ff.stderr.on("data", d => { err = (err + d).slice(-4096); });
  const closed = new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", code => code === 0 ? resolve() : reject(new Error("audio decode failed: " + (err.trim() || "exit " + code))));
  });
  // Observe rejection while stdout is consumed, then propagate it below.
  closed.catch(() => {});
  if (!ff.stdout) throw new Error("ffmpeg did not open an audio output stream");
  for await (const chunk of ff.stdout) {
    const buf = pending.length ? Buffer.concat([pending, chunk]) : chunk, end = buf.length - buf.length % 8;
    for (let i = 0; i < end; i += 8) {
      const l = buf.readFloatLE(i), r = buf.readFloatLE(i + 4), mono = (l + r) / 2;
      if (Math.abs(l) >= 0.999 || Math.abs(r) >= 0.999) clip++;
      energy = mono * mono; bucketEnergy += energy; quietEnergy += energy;
      fftWindow[count++] = mono; n++;
      if (count === fftWindow.length) {
        const spectrum = stft(fftWindow, 4096, 2048)[0];
        for (let k = 0; k < spectrum.length; k++) bins[k] += spectrum[k] * spectrum[k];
        fftWindow.copyWithin(0, 2048); count = 2048;
      }
      if (n % bucketSize === 0) { energies.push(bucketEnergy); bucketEnergy = 0; }
      if (n % quietSize === 0) {
        const s = n - quietSize, db = 10 * Math.log10(quietEnergy / quietSize + 1e-12);
        if (db < -50) { if (quietStart < 0) quietStart = s; }
        else { if (quietStart >= 0 && (s - quietStart) / SR >= 0.6) quiet.push([+(quietStart / SR).toFixed(2), +(s / SR).toFixed(2)]); quietStart = -1; }
        quietEnergy = 0;
      }
    }
    pending = Buffer.from(buf.subarray(end));
  }
  await closed;
  if (!n || pending.length) throw new Error("audio decoder returned empty or truncated PCM");
  if (n % bucketSize) energies.push(bucketEnergy);
  if (quietStart >= 0 && (n - quietStart) / SR >= 0.6) quiet.push([+(quietStart / SR).toFixed(2), +(n / SR).toFixed(2)]);
  const rmsDb = (a, b) => {
    const i0 = Math.max(0, Math.round(a * SR / bucketSize)), i1 = Math.min(energies.length, Math.round(b * SR / bucketSize));
    if (i1 <= i0) return NaN;
    let sum = 0; for (let i = i0; i < i1; i++) sum += energies[i];
    return 10 * Math.log10(sum / ((i1 - i0) * bucketSize) + 1e-12);
  };
  return { n, clip, bins, quiet, rmsDb };
}

function validateWindows(file, durationSec) {
  if (!file) return [];
  let input;
  try { input = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { throw new Error("event windows JSON could not be read: " + error.message); }
  if (!input || typeof input !== "object" || Array.isArray(input)
      || input.format !== "laohu.motion.audio-check-windows/1"
      || input.timeBasis !== "film-global" || !Array.isArray(input.windows)) {
    throw new Error("--windows must be laohu.motion.audio-check-windows/1 with timeBasis film-global and a windows array");
  }
  const seen = new Set();
  return input.windows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("event window " + index + " must be an object");
    if (typeof row.eventId !== "string" || !row.eventId.trim()) throw new Error("event window " + index + ".eventId must be a non-empty stable ID");
    if (seen.has(row.eventId)) throw new Error("event windows contain duplicate eventId " + row.eventId);
    seen.add(row.eventId);
    const startSec = row.startSec, endSec = row.endSec;
    if (typeof startSec !== "number" || !Number.isFinite(startSec) || startSec < 0
        || typeof endSec !== "number" || !Number.isFinite(endSec) || endSec <= startSec
        || endSec > durationSec + 1e-8) {
      throw new Error("event window " + row.eventId + " must be a positive film-global interval within video/film duration " + durationSec.toFixed(3) + "s");
    }
    return { eventId: row.eventId, ...(typeof row.label === "string" ? { label: row.label } : {}), startSec, endSec };
  });
}

function picture(file, filter, png, ffmpeg, timestampFilter, env) {
  fs.rmSync(png, { force: true });
  const graph = "[0:a:0]" + timestampFilter + "," + filter + "[frame]";
  const result = spawnSync(ffmpeg, ["-v", "error", "-y", "-copyts", "-i", file, "-filter_complex", graph, "-map", "[frame]", "-an", "-frames:v", "1", png], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, env });
  if (result.error || result.status !== 0 || !fs.existsSync(png) || fs.statSync(png).size === 0) {
    throw new Error("could not write " + png + (result.stderr ? ": " + result.stderr.trim().split("\n").pop() : result.error?.message ? ": " + result.error.message : ""));
  }
}

function realTargetPath(file) {
  let cursor = path.resolve(file);
  const suffix = [];
  while (!fs.existsSync(cursor)) {
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error("refusing output path with dangling symlink: " + cursor);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  let real;
  try { real = fs.realpathSync(cursor); }
  catch (error) { throw new Error("could not resolve output path " + file + ": " + error.message); }
  return path.join(real, ...suffix);
}

function assertOutputsDoNotReplaceInputs(outputs, protectedFiles) {
  const protectedPaths = new Map(protectedFiles.filter(Boolean).map((file) => [realTargetPath(file), path.resolve(file)]));
  for (const output of outputs) {
    const target = realTargetPath(output);
    if (protectedPaths.has(target)) {
      throw new Error("refusing to overwrite analysis input " + protectedPaths.get(target) + " with output " + output);
    }
  }
}

function eventWindowMeasurement(row, rmsDb, decodedDurationSec) {
  const coveredStart = Math.min(row.endSec, Math.max(row.startSec, 0));
  const coveredEnd = Math.min(row.endSec, decodedDurationSec);
  const coveredSec = Math.max(0, coveredEnd - coveredStart);
  const complete = row.startSec >= 0 && row.endSec <= decodedDurationSec + 1e-8;
  const value = complete ? rmsDb(row.startSec, row.endSec) : NaN;
  return {
    ...row,
    rmsDbfs: Number.isFinite(value) ? +value.toFixed(2) : null,
    decodedCoverageSec: +coveredSec.toFixed(6),
    missingAudioTailSec: +Math.max(0, row.endSec - decodedDurationSec).toFixed(6),
    measurementStatus: complete ? "measured" : "audio-does-not-cover-complete-window",
    measurement: "source 10 ms mono-average RMS buckets; a missing audio tail is not synthesized",
  };
}

export async function runCheck({ file, outDir, windowsFile = null, ffmpeg: requestedFfmpeg, ffprobe: requestedFfprobe }) {
  if (typeof file !== "string" || !file) throw new Error("usage: laohu-audio-check.mjs <muxed-file> [--out-dir DIR] [--windows FILE]");
  const input = path.resolve(file);
  if (!fs.existsSync(input) || !fs.statSync(input).isFile()) throw new Error("muxed audio input is missing or not a file: " + input);
  const { ffmpeg, ffprobe } = resolveTools({ ffmpeg: requestedFfmpeg, ffprobe: requestedFfprobe });
  const tempDir = path.resolve(path.join(process.cwd(), ".cache", "tmp", "audio-check"));
  fs.mkdirSync(tempDir, { recursive: true });
  const env = { ...process.env, TMPDIR: tempDir, TMP: tempDir, TEMP: tempDir };
  const ffmpegVersion = binaryVersion(ffmpeg, env), ffprobeVersion = binaryVersion(ffprobe, env);
  const mux = probeMux(input, ffprobe, env);
  const windowsInput = windowsFile ? path.resolve(windowsFile) : null;
  const target = path.resolve(outDir || path.join(
    process.cwd(), ".cache", "validation", "audio-check",
    path.basename(input, path.extname(input)).replace(/[^A-Za-z0-9._-]+/g, "-") || "mux",
  ));
  const wavePng = path.join(target, "wave.png"), spectrumPng = path.join(target, "spectrum.png");
  const analysisJson = path.join(target, "analysis.json");
  assertOutputsDoNotReplaceInputs([wavePng, spectrumPng, analysisJson], [input, windowsInput]);
  fs.mkdirSync(target, { recursive: true });
  const timestampFilter = mux.timestampFilter;
  const loudness = measureLoudness(input, ffmpeg, timestampFilter, env);
  picture(input, "showwavespic=s=1600x320:split_channels=1:colors=0x4fd1c5|0xf6ad55", wavePng, ffmpeg, timestampFilter, env);
  picture(input, "showspectrumpic=s=1600x520:legend=1:scale=log", spectrumPng, ffmpeg, timestampFilter, env);
  // Decode and analyse incrementally: full-length stereo + mono + every FFT frame used
  // several GB on 20-minute audio. This retains only one FFT window and 10 ms RMS buckets.
  const { n, clip, bins, quiet, rmsDb } = await analyseAudio(input, ffmpeg, timestampFilter, env);
  const durationSec = n / SR;
  const band = (a, b) => { let s = 0; for (let k = Math.round(a * 4096 / SR); k < Math.round(b * 4096 / SR); k++) s += bins[k] || 0; return s; };
  const power = OCTAVES_HZ.map(c => band(c / Math.SQRT2, c * Math.SQRT2) + 1e-20);
  const ref = power[5];
  const octavePowerDbRe1k = OCTAVES_HZ.map((centerHz, index) => ({ centerHz, db: +(10 * Math.log10(power[index] / ref)).toFixed(1) }));
  const lowDbRe1k = 10 * Math.log10((power[0] + power[1] + power[2]) / 3 / ref);
  const highDbRe1k = 10 * Math.log10((power[7] + power[8]) / 2 / ref);
  const windows = validateWindows(windowsFile, mux.videoDurationSec).map((row) => eventWindowMeasurement(row, rmsDb, durationSec));
  const result = {
    format: "laohu.motion.audio-check/1",
    status: "measured",
    source: {
      repository: "ConardLi/garden-skills",
      commit: SOURCE_COMMIT,
      license: "MIT",
      files: SOURCE_FILES,
      migration: "measureLoudness, analyseAudio, check measurement/picture fragments, fft, stft",
    },
    input: { name: path.basename(input), video: mux.video, stream: mux.audio },
    tools: { ffmpeg: ffmpegVersion, ffprobe: ffprobeVersion },
    analysis: {
      decodedDurationSec: +durationSec.toFixed(6), sampleRateHz: SR, channels: 2,
      integratedLufs: loudness.I, loudnessRangeLu: loudness.LRA, truePeakDbfs: loudness.TP,
      clippedSampleCount: clip,
      octavePowerDbRe1k,
      lowOctaves31_5To125DbRe1k: +lowDbRe1k.toFixed(2),
      upperOctaves4To8kDbRe1k: +highDbRe1k.toFixed(2),
      quietIntervalsSec: quiet,
      windows,
      method: {
        fftWindowSamples: 4096, fftHopSamples: 2048, rmsBucketSec: 0.01, quietProbeSec: 0.05,
        spectrumAndRmsChannelMethod: "mono=(L+R)/2 from the source implementation; anti-phase stereo can cancel in these measures, while ebur128 measures the decoded stereo stream",
        clock: {
          basis: "video-relative; sample index zero is the first video stream presentation timestamp",
          inputTimestampsCopied: true,
          videoStartSec: mux.videoStartSec,
          audioStartSec: mux.audio.streamStartSec,
          audioOffsetFromVideoStartSec: mux.audio.offsetFromVideoStartSec,
          ffmpegFilter: timestampFilter,
          leadingAndInteriorPtsGaps: "restored by aresample async; inserted samples represent timing recovery, not original encoded payload",
          audioEnd: "the analyzer decodes through the final real audio frame and does not extend an absent audio tail to the video end",
        },
        quietProbeSourceThresholdDbfs: -50, quietReportedAfterSec: 0.6,
        eventWindowClock: windowsFile ? "explicit film-global windows; measurement only; no event time is moved" : null,
      },
    },
    outputs: { wavePng, spectrumPng, json: analysisJson },
    interpretation: "Measurements and plots only. This command does not edit, normalize, repair, approve, or audition audio; listening and quality status remain UNKNOWN.",
  };
  fs.writeFileSync(result.outputs.json, JSON.stringify(result, null, 2) + "\n");
  return result;
}

function parseArgs(argv) {
  const values = {}, positional = [], allowed = new Set(["--out-dir", "--windows", "--ffmpeg", "--ffprobe"]);
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === "--help" || value === "-h") return { help: true, values, positional };
    if (!value.startsWith("--")) { positional.push(value); continue; }
    if (!allowed.has(value)) throw new Error("unknown option " + value);
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(value + " requires a value");
    if (Object.hasOwn(values, value)) throw new Error(value + " may only be supplied once");
    values[value] = argv[++i];
  }
  return { help: false, values, positional };
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write("Usage: laohu-audio-check.mjs <muxed-file> [--out-dir DIR] [--windows FILE] [--ffmpeg PATH] [--ffprobe PATH]\n");
    return null;
  }
  if (args.positional[0] === "check") args.positional.shift();
  if (args.positional.length !== 1) throw new Error("usage: laohu-audio-check.mjs <muxed-file> [--out-dir DIR] [--windows FILE]");
  const result = await runCheck({
    file: args.positional[0],
    outDir: args.values["--out-dir"],
    windowsFile: args.values["--windows"] || null,
    ffmpeg: args.values["--ffmpeg"],
    ffprobe: args.values["--ffprobe"],
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write("ERROR " + (error.stack || error.message) + "\n");
    process.exitCode = 1;
  });
}

export { analyseAudio, fft, measureLoudness, stft, validateWindows };
