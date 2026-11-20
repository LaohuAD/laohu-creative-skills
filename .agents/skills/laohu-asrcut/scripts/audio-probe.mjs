#!/usr/bin/env node
import {execFile, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat, mkdtemp, open, readFile, realpath, rm, stat, link, unlink} from 'node:fs/promises';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {AsrcutError, assertSafeOutputPath, hashPlan, validatePlan, verifyPlanEvidence} from './asrcut.mjs';

const exec = promisify(execFile);
export const SILENCE_MAP_FORMAT = 'laohu.asrcut.silence-map/1';
const WINDOW_MS = 10;
const ROOM_TONE_MIN_MS = 120;
const ROOM_TONE_MIN_DB = -88;
const ROOM_TONE_MAX_SPREAD_DB = 5;
const ROOM_TONE_MAX_CREST_DB = 12;
const SHA256 = /^[a-f0-9]{64}$/;

function fail(code, message, details) { throw new AsrcutError(code, message, details); }

export function sha256Bytes(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export async function hashMediaFile(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

export async function snapshotFile(path) {
  const absolute = resolve(path);
  const identity = await stat(absolute);
  if (!identity.isFile()) fail('invalid-media-file', `Expected a regular input file: ${absolute}`);
  return {path: absolute, dev: identity.dev, ino: identity.ino, sha256: await hashMediaFile(absolute)};
}

export async function confirmFile(snapshot) {
  const current = await snapshotFile(snapshot.path);
  if (current.dev !== snapshot.dev || current.ino !== snapshot.ino || current.sha256 !== snapshot.sha256) {
    fail('media-changed-during-run', `Input changed during media operation: ${snapshot.path}`);
  }
}

export async function inspectMedia(path, ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe', options = []) {
  try {
    const {stdout} = await exec(ffprobePath, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', ...options, '-of', 'json', path], {maxBuffer: 16 * 1024 * 1024});
    return JSON.parse(stdout);
  } catch (error) { fail('ffprobe-failed', `Could not inspect ${path}: ${error.stderr || error.message}`); }
}

export async function runFfmpeg(ffmpegPath, args, description) {
  try { await exec(ffmpegPath, ['-nostdin', '-hide_banner', '-v', 'error', ...args], {maxBuffer: 16 * 1024 * 1024}); }
  catch (error) { fail('ffmpeg-failed', `${description}: ${error.stderr || error.message}`); }
}

export function chooseStream(streams, kind, requested, label) {
  const matches = (streams ?? []).filter((stream) => stream.codec_type === kind && !stream.disposition?.attached_pic);
  if (requested !== null && requested !== undefined) {
    const selected = matches.find((stream) => stream.index === requested);
    if (selected) return selected;
    fail(`${kind}-stream-missing`, `${label} has no ${kind} stream with global index ${requested}`);
  }
  if (matches.length !== 1) fail(`${kind}-stream-ambiguous`, `${label} has ${matches.length} selectable ${kind} streams; declare an exact global stream index`);
  return matches[0];
}

export function probeFraction(value) {
  const parts = /^(\d+)\/(\d+)$/.exec(String(value));
  if (!parts) return null;
  const [numerator, denominator] = parts.slice(1).map(Number);
  return Number.isSafeInteger(numerator) && numerator > 0 && Number.isSafeInteger(denominator) && denominator > 0 ? {numerator, denominator} : null;
}

export async function newMediaPath(path, protectedPaths = []) {
  const proposed = resolve(path);
  await assertSafeOutputPath(proposed, protectedPaths);
  const absolute = join(await realpath(dirname(proposed)), basename(proposed));
  try {
    await lstat(absolute);
    fail('output-exists', `Refusing to replace an existing output or symlink: ${absolute}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return absolute;
}

export async function syncWrite(path, value) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(value); await handle.sync(); }
  finally { await handle.close(); }
}

export async function publishMediaFiles(rows) {
  const published = [];
  try {
    for (const {staged, target} of rows) {
      const handle = await open(staged, 'r');
      try { await handle.sync(); }
      finally { await handle.close(); }
      await link(staged, target);
      published.push({staged, target});
    }
  } catch (error) {
    for (const {staged, target} of published.reverse()) {
      const [from, to] = await Promise.allSettled([stat(staged), lstat(target)]);
      if (from.status === 'fulfilled' && to.status === 'fulfilled' && from.value.dev === to.value.dev && from.value.ino === to.value.ino) {
        await unlink(target).catch(() => {});
      }
    }
    if (error.code === 'EEXIST') fail('output-exists', 'An output was created during this operation; existing files were kept');
    throw error;
  }
}

export async function writeNewMediaText(path, value, protectedPaths = []) {
  const output = await newMediaPath(path, protectedPaths);
  const staging = await mkdtemp(join(dirname(output), '.asrcut-'));
  try {
    const staged = join(staging, basename(output));
    await syncWrite(staged, value);
    await publishMediaFiles([{staged, target: output}]);
  } finally { await rm(staging, {recursive: true, force: true}); }
  return output;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function mapDigest(map) {
  const {probeSha256, ...data} = map;
  return sha256Bytes(JSON.stringify(canonicalJson(data)));
}

function primaryAudio(source) {
  return source.tracks.find((track) => track.id === source.primaryAudioTrackId && track.kind === 'audio' && track.syncToPrimaryAudio?.status === 'primary');
}

function db(value) { return value > 0 ? 20 * Math.log10(value) : -Infinity; }
function roundedDb(value) { return Number.isFinite(value) ? Math.round(value * 1e4) / 1e4 : null; }

function probeParameters(noiseDb, minSilenceMs) {
  if (!Number.isFinite(noiseDb) || noiseDb < -120 || noiseDb >= 0) fail('invalid-noise-threshold', 'noiseDb must be at least -120 and below 0 dBFS');
  if (!Number.isFinite(minSilenceMs) || minSilenceMs < WINDOW_MS) fail('invalid-silence-duration', `minSilenceMs must be at least ${WINDOW_MS} ms`);
}

function pcmWindow(startSample, channels) {
  return {startSample, count: 0, sums: new Float64Array(channels), energies: new Float64Array(channels), peak: 0, zeroFrames: 0,
    firstCrossing: null, lastCrossing: null, nearestCrossing: null};
}

function addPcmFrame(window, chunk, byteOffset, previous, sample, target, allowCrossing) {
  let hasCrossing = false;
  let allCanCross = allowCrossing;
  let allZero = true;
  for (let channel = 0; channel < previous.length; channel += 1) {
    const current = chunk.readFloatLE(byteOffset + channel * 4);
    if (!Number.isFinite(current)) fail('invalid-pcm-sample', `Decoded sample ${sample} is not finite`);
    const before = previous[channel];
    const crosses = (before < 0 && current >= 0) || (before > 0 && current <= 0) || (before === 0 && current !== 0);
    allCanCross &&= crosses || (before === 0 && current === 0);
    hasCrossing ||= crosses;
    allZero &&= current === 0;
    previous[channel] = current;
    window.sums[channel] += current;
    window.energies[channel] += current * current;
    window.peak = Math.max(window.peak, Math.abs(current));
  }
  window.count += 1;
  if (allZero) window.zeroFrames += 1;
  if (hasCrossing && allCanCross) {
    window.firstCrossing ??= sample;
    window.lastCrossing = sample;
    if (window.nearestCrossing === null || Math.abs(sample - target) < Math.abs(window.nearestCrossing - target)) window.nearestCrossing = sample;
  }
}

function finishWindow(window, centerSample) {
  const energy = Math.max(...window.energies) / window.count;
  const rmsDb = db(Math.sqrt(energy));
  const maxMean = Math.max(...window.sums.map((sum) => Math.abs(sum / window.count)));
  return {
    ...window, energy, rmsDb, centerSample,
    endSample: window.startSample + window.count,
    crestDb: db(window.peak) - rmsDb,
    dcRatio: energy > 0 ? maxMean / Math.sqrt(energy) : 1,
  };
}

async function* decodeWindows(media, {ffmpegPath, windowSamples, range = null}) {
  const args = ['-nostdin', '-hide_banner', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', media.path,
    '-map', `0:${media.streamIndex}`, '-vn', '-sn', '-dn'];
  if (range) args.push('-af', `atrim=start_sample=${range.startSample}:end_sample=${range.endSample}`);
  args.push('-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1');
  const ffmpeg = spawn(ffmpegPath, args, {stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  let processError = null;
  let closed = false;
  ffmpeg.stderr.setEncoding('utf8');
  ffmpeg.stderr.on('data', (text) => { stderr = (stderr + text).slice(-8192); });
  ffmpeg.on('error', (error) => { processError = error; });
  const exit = new Promise((resolveExit) => ffmpeg.on('close', (code) => { closed = true; resolveExit(code); }));
  const frameBytes = media.channels * 4;
  const previous = new Float32Array(media.channels);
  const firstSample = range?.startSample ?? 0;
  let sample = firstSample;
  let carry = Buffer.alloc(0);
  let window = pcmWindow(firstSample, media.channels);
  const centerFor = (start) => start + Math.floor((Math.min(windowSamples, (range?.endSample ?? Infinity) - start) - 1) / 2);
  let center = centerFor(firstSample);
  try {
    for await (const chunk of ffmpeg.stdout) {
      const bytes = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const fullFrames = bytes.length - bytes.length % frameBytes;
      for (let offset = 0; offset < fullFrames; offset += frameBytes) {
        addPcmFrame(window, bytes, offset, previous, sample, center, sample > firstSample);
        sample += 1;
        if (window.count === windowSamples) {
          yield finishWindow(window, center);
          window = pcmWindow(sample, media.channels);
          center = centerFor(sample);
        }
      }
      carry = bytes.subarray(fullFrames);
    }
    const code = await exit;
    if (code !== 0 || processError) fail('ffmpeg-failed', `Could not decode selected audio stream: ${stderr || processError?.message || code}`);
    if (carry.length) fail('invalid-pcm-frame', 'Audio decoder returned a partial sample frame');
    if (window.count) yield finishWindow(window, window.startSample + Math.floor((window.count - 1) / 2));
  } finally {
    if (!closed) ffmpeg.kill('SIGTERM');
    await exit;
  }
}

function toneWindow(window, threshold) {
  return window.rmsDb >= ROOM_TONE_MIN_DB && window.rmsDb <= threshold && window.crestDb <= ROOM_TONE_MAX_CREST_DB
    && window.dcRatio <= 0.55 && window.zeroFrames / window.count <= 0.25;
}

function addToneWindow(run, window) {
  return {
    startSample: run?.startSample ?? window.startSample,
    endSample: window.endSample,
    minDb: Math.min(run?.minDb ?? Infinity, window.rmsDb),
    maxDb: Math.max(run?.maxDb ?? -Infinity, window.rmsDb),
    maxCrest: Math.max(run?.maxCrest ?? 0, window.crestDb),
    energy: (run?.energy ?? 0) + window.energy * window.count,
  };
}

function toneSpread(run) { return run.maxDb - run.minDb; }

function finishTone(run, sampleRateHz) {
  const count = run.endSample - run.startSample;
  const spread = toneSpread(run) / ROOM_TONE_MAX_SPREAD_DB;
  const crest = run.maxCrest / ROOM_TONE_MAX_CREST_DB;
  return {
    sourceRange: {startSample: run.startSample, endSample: run.endSample, sampleRateHz},
    rmsDb: roundedDb(db(Math.sqrt(run.energy / count))),
    stabilityScore: Math.round((1 - 0.7 * spread - 0.3 * crest) * 1000) / 1000,
  };
}

function closeSilence(run, rate, withPlan) {
  const count = run.endSample - run.startSample;
  const durationMs = count * 1000 / rate;
  return {
    startSample: run.startSample, endSample: run.endSample, durationMs,
    valleySample: run.valleySample, nearestZeroCrossingSample: run.nearestCrossing,
    minRmsDb: roundedDb(run.minDb), meanRmsDb: roundedDb(db(Math.sqrt(run.energy / count))),
    ...(withPlan ? {gapClassification: durationMs <= 350 ? 'micro_preserve' : durationMs <= 480 ? 'clause_candidate'
      : durationMs <= 650 ? 'sentence_candidate' : 'long_pause_candidate'} : {}),
  };
}

function quietWindow(run, window) {
  run ??= {startSample: window.startSample, minDb: Infinity, energy: 0, lastCrossing: null, nearestCrossing: null};
  const firstInRun = window.firstCrossing === run.startSample ? null : window.firstCrossing;
  const localNearest = window.nearestCrossing === run.startSample ? null : window.nearestCrossing;
  const windowLast = window.lastCrossing === run.startSample ? null : window.lastCrossing;
  if (window.rmsDb < run.minDb) {
    run.minDb = window.rmsDb;
    run.valleySample = window.centerSample;
    run.nearestCrossing = run.lastCrossing;
  }
  for (const crossing of [firstInRun, localNearest]) {
    if (crossing !== null && (run.nearestCrossing === null || Math.abs(crossing - run.valleySample) < Math.abs(run.nearestCrossing - run.valleySample))) {
      run.nearestCrossing = crossing;
    }
  }
  run.lastCrossing = windowLast ?? run.lastCrossing;
  run.endSample = window.endSample;
  run.energy += window.energy * window.count;
  return run;
}

function sourceWords(source) {
  return (source?.transcript.segments ?? []).flatMap((segment) => segment.tokens).filter((token) => token.sourceRange
    && ['aligned', 'measured'].includes(token.timingPrecision) && /[\p{L}\p{N}]/u.test(token.rawText))
    .sort((left, right) => left.sourceRange.startSample - right.sourceRange.startSample);
}

function onsetDrift(words, onsetSample, rate) {
  const maximumDistance = Math.round(rate * 0.18);
  const minimumDistance = Math.round(rate * 0.03);
  let lower = 0;
  let upper = words.length;
  while (lower < upper) {
    const mid = Math.floor((lower + upper) / 2);
    if (words[mid].sourceRange.startSample < onsetSample) lower = mid + 1;
    else upper = mid;
  }
  const candidates = [words[lower - 1], words[lower]].filter(Boolean).sort((left, right) => Math.abs(left.sourceRange.startSample - onsetSample) - Math.abs(right.sourceRange.startSample - onsetSample));
  const token = candidates[0];
  if (!token) return null;
  const offset = token.sourceRange.startSample - onsetSample;
  if (Math.abs(offset) < minimumDistance || Math.abs(offset) > maximumDistance) return null;
  return {tokenId: token.id, asrStartSample: token.sourceRange.startSample, energyOnsetSample: onsetSample,
    asrMinusOnsetSamples: offset, asrMinusOnsetMs: offset * 1000 / rate, basis: 'sustained-energy-rise'};
}

function selectPlanSource(plan, sourceId, input, pathSha256, baseDir) {
  if (!plan) return null;
  const validation = validatePlan(plan);
  if (validation.errors.length) fail('invalid-plan', 'The probe plan failed validation', validation.errors);
  if (sourceId !== null) {
    const source = plan.sources.find((item) => item.id === sourceId);
    if (!source || source.sha256 !== pathSha256) fail('probe-source-mismatch', `Input media must match the hash of plan source ${sourceId}`);
    return source;
  }
  const byHash = plan.sources.filter((source) => source.sha256 === pathSha256);
  const byPath = byHash.filter((source) => source.mediaPath && resolve(baseDir, source.mediaPath) === input);
  if (byPath.length === 1) return byPath[0];
  if (byHash.length === 1) return byHash[0];
  fail(byHash.length ? 'probe-source-ambiguous' : 'probe-source-mismatch', byHash.length
    ? 'Input matches several source IDs; select one with --source-id'
    : 'Input media does not match a recorded plan source hash');
}

async function audioDetails(path, ffprobePath, expectedPrimary, overrideIndex = null) {
  if (overrideIndex !== null && (!Number.isSafeInteger(overrideIndex) || overrideIndex < 0)) fail('invalid-audio-stream-index', 'Audio stream index must be a nonnegative integer');
  if (overrideIndex !== null && expectedPrimary?.streamIndex !== undefined && overrideIndex !== expectedPrimary.streamIndex) {
    fail('probe-stream-mismatch', 'Requested audio stream is different from the plan primary stream');
  }
  const probe = await inspectMedia(path, ffprobePath);
  const stream = chooseStream(probe.streams, 'audio', overrideIndex ?? expectedPrimary?.streamIndex, path);
  if (expectedPrimary && expectedPrimary.streamIndex === undefined) {
    const declared = chooseStream(probe.streams, 'audio', undefined, path);
    if (stream.index !== declared.index) fail('probe-stream-mismatch', 'Requested stream differs from the sole media audio stream');
  }
  const sampleRateHz = Number(stream.sample_rate);
  const channels = Number(stream.channels);
  const timeBase = probeFraction(stream.time_base);
  if (!Number.isSafeInteger(sampleRateHz) || sampleRateHz < 1 || !Number.isSafeInteger(channels) || channels < 1 || !timeBase
    || !Number.isSafeInteger(stream.index) || stream.index < 0) fail('unknown-audio-clock', `Audio stream in ${path} has no usable sample rate, channel count, or time base`);
  if (expectedPrimary && (expectedPrimary.clock?.unit !== 'sample' || expectedPrimary.clock.sampleRateHz !== sampleRateHz)) {
    fail('probe-clock-mismatch', 'Decoded audio has a different sample clock from the plan primary track');
  }
  const startPts = Number.isSafeInteger(stream.start_pts) ? stream.start_pts : null;
  return {path, streamIndex: stream.index, sampleRateHz, channels, timeBase, startPts};
}

export async function probeSilence({inputPath, audioStreamIndex = null, noiseDb = -38, minSilenceMs = 120,
  plan = null, sourceId = null, baseDir = process.cwd(), ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg', ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe'} = {}) {
  if (!inputPath) fail('missing-argument', 'probe-silence requires an input media path');
  if (sourceId !== null && !plan) fail('missing-argument', 'sourceId requires the matching edit plan');
  probeParameters(noiseDb, minSilenceMs);
  const snapshot = await snapshotFile(inputPath);
  const source = selectPlanSource(plan, sourceId, snapshot.path, snapshot.sha256, baseDir);
  if (plan) await verifyPlanEvidence(plan, {baseDir});
  const primary = source ? primaryAudio(source) : null;
  if (source && !primary) fail('primary-audio-missing', `Source ${source.id} has no declared primary audio track`);
  const media = await audioDetails(snapshot.path, ffprobePath, primary, audioStreamIndex);
  const rate = media.sampleRateHz;
  const windowSamples = Math.max(1, Math.round(rate * WINDOW_MS / 1000));
  const minSamples = Math.ceil(rate * minSilenceMs / 1000);
  const minToneSamples = Math.ceil(rate * ROOM_TONE_MIN_MS / 1000);
  const words = sourceWords(source);
  const silences = [];
  const roomToneCandidates = [];
  let quiet = null;
  let tone = null;
  let onset = null;
  let sampleCount = 0;
  const pushQuiet = () => {
    if (!quiet || quiet.endSample - quiet.startSample < minSamples) return null;
    const entry = closeSilence(quiet, rate, Boolean(plan));
    silences.push(entry);
    return entry;
  };
  const pushTone = () => {
    if (tone && tone.endSample - tone.startSample >= minToneSamples) roomToneCandidates.push(finishTone(tone, rate));
  };
  for await (const window of decodeWindows(media, {ffmpegPath, windowSamples})) {
    sampleCount = window.endSample;
    if (window.rmsDb <= noiseDb) {
      quiet = quietWindow(quiet, window);
      onset = null;
    } else {
      if (quiet) {
        const silence = pushQuiet();
        onset = silence && words.length ? {silence, startSample: window.startSample, strongSamples: 0} : null;
        quiet = null;
      }
      if (onset) {
        if (window.rmsDb < Math.min(-0.1, noiseDb + 6)) onset = null;
        else {
          onset.strongSamples += window.count;
          if (onset.strongSamples >= rate * 0.03) {
            const warning = onsetDrift(words, onset.startSample, rate);
            if (warning) onset.silence.onsetDriftWarning = warning;
            onset = null;
          }
        }
      }
    }
    if (!toneWindow(window, noiseDb)) {
      pushTone();
      tone = null;
    } else {
      const updated = addToneWindow(tone, window);
      if (toneSpread(updated) > ROOM_TONE_MAX_SPREAD_DB) {
        pushTone();
        tone = addToneWindow(null, window);
      } else tone = updated;
    }
  }
  pushQuiet();
  pushTone();
  if (!sampleCount) fail('empty-audio', 'The selected audio stream decoded zero samples');
  if (source?.durationSamples !== null && source?.durationSamples !== undefined && source.durationSamples !== sampleCount) {
    fail('probe-duration-mismatch', `Decoded ${sampleCount} samples; plan source ${source.id} declares ${source.durationSamples}`);
  }
  if (plan) await verifyPlanEvidence(plan, {baseDir});
  await confirmFile(snapshot);
  const map = {
    format: SILENCE_MAP_FORMAT,
    source: {id: source?.id ?? null, sha256: snapshot.sha256, streamIndex: media.streamIndex, sampleRateHz: rate, sampleCount,
      channels: media.channels, timeBase: media.timeBase, startPts: media.startPts},
    project: plan ? {...plan.project} : null,
    planSha256: plan ? hashPlan(plan) : null,
    parameters: {noiseDb, minSilenceMs, windowSamples},
    clock: {unit: 'sample', origin: 'first-decoded-sample', method: 'native-rate-interleaved-pcm-no-resampling', windowStatistic: 'highest-channel-rms'},
    silences,
    roomToneCandidates,
  };
  return {...map, probeSha256: mapDigest(map)};
}

function withinSamples(range, sampleCount, rate = undefined) {
  return range && Number.isSafeInteger(range.startSample) && Number.isSafeInteger(range.endSample) && range.startSample >= 0
    && range.endSample > range.startSample && range.endSample <= sampleCount && (rate === undefined || range.sampleRateHz === rate);
}

export function verifySilenceMap(map, {plan, sourceId} = {}) {
  if (!map || map.format !== SILENCE_MAP_FORMAT || !SHA256.test(map.probeSha256 ?? '') || mapDigest(map) !== map.probeSha256) {
    fail('invalid-silence-map', 'Silence map format or evidence digest does not match');
  }
  const binding = map.source;
  const sources = plan?.sources?.filter((item) => sourceId ? item.id === sourceId : map.source?.id ? item.id === map.source.id : item.sha256 === map.source?.sha256) ?? [];
  const [source] = sources;
  const primary = source ? primaryAudio(source) : null;
  if (sources.length !== 1 || !primary || !binding || (binding.id !== null && binding.id !== source.id)
    || !SHA256.test(binding.sha256 ?? '') || binding.sha256 !== source.sha256 || binding.sampleRateHz !== primary.clock?.sampleRateHz
    || primary.clock?.unit !== 'sample' || binding.sampleCount !== source.durationSamples || (map.project && map.project.id !== plan.project.id)
    || !Number.isSafeInteger(binding.sampleCount) || binding.sampleCount < 1 || !Number.isSafeInteger(binding.streamIndex) || binding.streamIndex < 0
    || (primary.streamIndex !== undefined && binding.streamIndex !== primary.streamIndex)) {
    fail('probe-source-mismatch', 'Silence map does not bind to a unique plan source, primary stream and sample clock');
  }
  probeParameters(map.parameters?.noiseDb, map.parameters?.minSilenceMs);
  if (!Array.isArray(map.silences) || !Array.isArray(map.roomToneCandidates)
    || map.parameters.windowSamples !== Math.max(1, Math.round(binding.sampleRateHz * WINDOW_MS / 1000))
    || map.silences.some((row) => !withinSamples(row, binding.sampleCount) || !Number.isSafeInteger(row.valleySample) || row.valleySample < row.startSample
      || row.valleySample >= row.endSample || (row.nearestZeroCrossingSample !== null && (!Number.isSafeInteger(row.nearestZeroCrossingSample)
        || row.nearestZeroCrossingSample <= row.startSample || row.nearestZeroCrossingSample >= row.endSample)))
    || map.roomToneCandidates.some((row) => !withinSamples(row.sourceRange, binding.sampleCount, binding.sampleRateHz)
      || !Number.isFinite(row.rmsDb) || !Number.isFinite(row.stabilityScore) || row.stabilityScore < 0 || row.stabilityScore > 1)) {
    fail('invalid-silence-map', 'Silence map sample windows or measurements are inconsistent');
  }
  return source;
}

export async function verifyRoomToneCandidate({silenceMap, sourceId, plan, range, baseDir = process.cwd(),
  ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg', ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe'} = {}) {
  const source = verifySilenceMap(silenceMap, {plan, sourceId});
  const {sampleRateHz, sampleCount, streamIndex} = silenceMap.source;
  if (!withinSamples(range, sampleCount, sampleRateHz) || !silenceMap.roomToneCandidates.some(({sourceRange}) =>
    sourceRange.startSample <= range.startSample && sourceRange.endSample >= range.endSample)) {
    fail('room-tone-not-probed', 'Requested room tone range is outside the measured stable, nonzero candidate');
  }
  if (!source.mediaPath) fail('media-path-missing', `Source ${source.id} has no linked media path`);
  const snapshot = await snapshotFile(resolve(baseDir, source.mediaPath));
  if (snapshot.sha256 !== source.sha256) fail('source-hash-stale', `The room tone source ${source.id} changed since probing`);
  const media = await audioDetails(snapshot.path, ffprobePath, primaryAudio(source), streamIndex);
  if (media.channels !== silenceMap.source.channels || media.startPts !== silenceMap.source.startPts
    || media.timeBase.numerator !== silenceMap.source.timeBase?.numerator || media.timeBase.denominator !== silenceMap.source.timeBase?.denominator) {
    fail('probe-clock-mismatch', 'Room tone source channel count, PTS origin or time base differs from the silence map');
  }
  let tone = null;
  for await (const window of decodeWindows(media, {ffmpegPath, windowSamples: silenceMap.parameters.windowSamples, range})) {
    if (!toneWindow(window, silenceMap.parameters.noiseDb)) fail('room-tone-signal-mismatch', 'Requested room tone includes digital zero, an impulse, excessive level or DC bias');
    tone = addToneWindow(tone, window);
  }
  if (!tone || tone.endSample !== range.endSample || toneSpread(tone) > ROOM_TONE_MAX_SPREAD_DB) {
    fail('room-tone-signal-mismatch', 'Requested room tone does not decode to the expected stable, nonzero source samples');
  }
  await confirmFile(snapshot);
  return finishTone(tone, sampleRateHz);
}

export function mediaCliOptions(argv) {
  const options = Object.create(null);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--') || arg.length < 3) fail('invalid-argument', `Expected an option name, got ${arg}`);
    const key = arg.slice(2);
    if (Object.hasOwn(options, key)) fail('invalid-argument', `Duplicate option --${key}`);
    const value = argv[index + 1];
    if (value !== undefined && !value.startsWith('--')) { options[key] = value; index += 1; }
    else options[key] = true;
  }
  return options;
}

export function mediaOptions(options, allowed, required) {
  for (const [key, value] of Object.entries(options)) {
    if (!allowed.includes(key)) fail('invalid-argument', `Unknown option --${key}`);
    if (typeof value !== 'string' || !value.length) fail('missing-argument', `Option --${key} requires a value`);
  }
  for (const key of required) if (!options[key]) fail('missing-argument', `Missing required option --${key}`);
}

export function mediaCliError(error) {
  const payload = {error: error.message, code: error instanceof AsrcutError ? error.code : 'runtime-error', details: error.details};
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
}

export async function runAudioProbeCli(options) {
  mediaOptions(options, ['input', 'audio-stream-index', 'noise-db', 'min-silence-ms', 'plan', 'source-id', 'out', 'ffmpeg', 'ffprobe'], ['input', 'out']);
  const inputPath = resolve(options.input);
  const planPath = options.plan ? resolve(options.plan) : null;
  const baseDir = planPath ? dirname(planPath) : process.cwd();
  const planBytes = planPath ? await readFile(planPath) : null;
  const plan = planBytes ? JSON.parse(planBytes) : null;
  const protectedPaths = [inputPath, planPath, ...(plan?.sources ?? []).flatMap((source) => [source.mediaPath, source.transcript?.evidenceRef]
    .filter(Boolean).map((ref) => resolve(baseDir, ref)))];
  await newMediaPath(options.out, protectedPaths);
  const map = await probeSilence({inputPath, plan, baseDir, sourceId: options['source-id'] ?? null,
    audioStreamIndex: options['audio-stream-index'] === undefined ? null : Number(options['audio-stream-index']),
    noiseDb: options['noise-db'] === undefined ? undefined : Number(options['noise-db']),
    minSilenceMs: options['min-silence-ms'] === undefined ? undefined : Number(options['min-silence-ms']),
    ffmpegPath: options.ffmpeg, ffprobePath: options.ffprobe});
  if (planPath && await hashMediaFile(planPath) !== sha256Bytes(planBytes)) fail('media-changed-during-run', 'The plan changed during the probe');
  const output = await writeNewMediaText(options.out, `${JSON.stringify(map, null, 2)}\n`, protectedPaths);
  process.stdout.write(`${JSON.stringify({ok: true, command: 'probe-silence', output, source: map.source,
    silences: map.silences.length, roomToneCandidates: map.roomToneCandidates.length, probeSha256: map.probeSha256}, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const [command, ...argv] = process.argv.slice(2);
    if (!command || command === '--help') {
      process.stdout.write('audio-probe.mjs probe-silence --input MEDIA [--audio-stream-index INDEX] [--noise-db -38] [--min-silence-ms 120] [--plan PLAN] [--source-id ID] --out NEW.json\n');
      return;
    }
    if (command !== 'probe-silence') fail('unknown-command', `Unknown command: ${command}`);
    process.exitCode = await runAudioProbeCli(mediaCliOptions(argv));
  })().catch(mediaCliError);
}
