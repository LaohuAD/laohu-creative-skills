#!/usr/bin/env node

import {createHash, randomBytes} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {copyFile, link, lstat, mkdir, open, readFile, realpath, rm, stat, unlink} from 'node:fs/promises';
import {basename, dirname, extname, join, relative, resolve} from 'node:path';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {compilePlan, hashPlan, TIMELINE_FORMAT, TIMELINE_V2_FORMAT, verifyPlanEvidence} from './asrcut.mjs';

export const AUDIO_PLAN_FORMAT = 'laohu.asrcut.audio-plan/1';
export const AUDIO_POSTPROCESS_FORMAT = 'laohu.asrcut.audio-postprocess/1';
const execFile = promisify(execFileCallback);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const timingCache = new Map();

export class AudioPostprocessError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'AudioPostprocessError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) { throw new AudioPostprocessError(code, message, details); }

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function checkedNumber(value, label, min, max, {integer = false} = {}) {
  if (!finite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail('invalid-audio-plan', `${label} must be ${integer ? 'an integer ' : ''}from ${min} to ${max}`);
  }
  return value;
}

function rejectUnknownKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-audio-plan', `${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) fail('invalid-audio-plan', `${label} contains unsupported fields: ${unknown.join(', ')}`);
}

function audioStepsToFilters(steps, sampleRateHz) {
  if (!Array.isArray(steps)) fail('invalid-audio-plan', 'audio-plan.steps must be an array');
  const filters = [];
  let normalize = null;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step || typeof step !== 'object' || Array.isArray(step)) fail('invalid-audio-plan', `steps[${index}] must be an object`);
    const allowedByType = {
      denoise: ['type', 'reason', 'noiseReductionDb', 'noiseFloorDb', 'residualFloorDb', 'trackNoise', 'trackResidual'],
      highpass: ['type', 'reason', 'frequencyHz', 'poles'],
      equalizer: ['type', 'reason', 'frequencyHz', 'gainDb', 'widthQ'],
      deesser: ['type', 'reason', 'intensity', 'maxDeessing'],
      compressor: ['type', 'reason', 'thresholdDb', 'ratio', 'attackMs', 'releaseMs', 'makeupDb'],
      limiter: ['type', 'reason', 'limitDbtp', 'attackMs', 'releaseMs'],
      gain: ['type', 'reason', 'gainDb'],
      normalize: ['type', 'reason', 'targetLufs', 'maxTruePeakDbtp', 'maxGainDb'],
    };
    const allowed = allowedByType[step.type];
    if (!allowed) fail('unsupported-audio-step', `Unsupported audio step: ${String(step.type)}`);
    rejectUnknownKeys(step, allowed, `steps[${index}]`);
    if (typeof step.reason !== 'string' || step.reason.trim().length < 8) fail('invalid-audio-plan', `steps[${index}].reason must briefly record the audible or measured diagnosis`);
    switch (step.type) {
      case 'denoise': {
        const reduction = checkedNumber(step.noiseReductionDb ?? 8, `steps[${index}].noiseReductionDb`, 0.1, 24);
        const floor = checkedNumber(step.noiseFloorDb ?? -50, `steps[${index}].noiseFloorDb`, -80, -20);
        const residualFloor = checkedNumber(step.residualFloorDb ?? -38, `steps[${index}].residualFloorDb`, -80, -20);
        const trackNoise = step.trackNoise === true;
        const trackResidual = step.trackResidual === true;
        filters.push(`afftdn=nr=${reduction}:nf=${floor}:rf=${residualFloor}:tn=${trackNoise ? 1 : 0}:tr=${trackResidual ? 1 : 0}`);
        break;
      }
      case 'highpass': {
        const frequency = checkedNumber(step.frequencyHz, `steps[${index}].frequencyHz`, 35, Math.min(180, sampleRateHz / 2 - 1));
        const poles = checkedNumber(step.poles ?? 2, `steps[${index}].poles`, 1, 2, {integer: true});
        filters.push(`highpass=f=${frequency}:p=${poles}`);
        break;
      }
      case 'equalizer': {
        const frequency = checkedNumber(step.frequencyHz, `steps[${index}].frequencyHz`, 40, sampleRateHz / 2 - 20);
        const gain = checkedNumber(step.gainDb, `steps[${index}].gainDb`, -6, 6);
        const q = checkedNumber(step.widthQ ?? 1, `steps[${index}].widthQ`, 0.35, 4);
        filters.push(`equalizer=f=${frequency}:t=q:w=${q}:g=${gain}`);
        break;
      }
      case 'deesser': {
        const intensity = checkedNumber(step.intensity ?? 0.35, `steps[${index}].intensity`, 0.05, 0.8);
        const maxDeessing = checkedNumber(step.maxDeessing ?? 0.5, `steps[${index}].maxDeessing`, 0.05, 0.8);
        filters.push(`deesser=i=${intensity}:m=${maxDeessing}`);
        break;
      }
      case 'compressor': {
        const thresholdDb = checkedNumber(step.thresholdDb ?? -22, `steps[${index}].thresholdDb`, -40, -6);
        const ratio = checkedNumber(step.ratio ?? 2, `steps[${index}].ratio`, 1.2, 4);
        const attack = checkedNumber(step.attackMs ?? 15, `steps[${index}].attackMs`, 1, 100);
        const release = checkedNumber(step.releaseMs ?? 120, `steps[${index}].releaseMs`, 30, 500);
        const makeupDb = checkedNumber(step.makeupDb ?? 0, `steps[${index}].makeupDb`, 0, 6);
        const threshold = 10 ** (thresholdDb / 20);
        const makeup = 10 ** (makeupDb / 20);
        filters.push(`acompressor=threshold=${threshold}:ratio=${ratio}:attack=${attack}:release=${release}:makeup=${makeup}:detection=rms:link=average`);
        break;
      }
      case 'limiter': {
        const limitDbtp = checkedNumber(step.limitDbtp ?? -1.5, `steps[${index}].limitDbtp`, -6, -0.3);
        const attack = checkedNumber(step.attackMs ?? 5, `steps[${index}].attackMs`, 0.5, 20);
        const release = checkedNumber(step.releaseMs ?? 50, `steps[${index}].releaseMs`, 10, 250);
        const limit = 10 ** (limitDbtp / 20);
        filters.push(`alimiter=limit=${limit}:attack=${attack}:release=${release}:level=0:asc=0:latency=1`);
        break;
      }
      case 'gain': {
        const gainDb = checkedNumber(step.gainDb, `steps[${index}].gainDb`, -12, 12);
        filters.push(`volume=${gainDb}dB`);
        break;
      }
      case 'normalize': {
        if (normalize || index !== steps.length - 1) fail('invalid-audio-plan', 'At most one normalize step is allowed, and it must be the final step');
        normalize = {
          targetLufs: checkedNumber(step.targetLufs, `steps[${index}].targetLufs`, -28, -14),
          maxTruePeakDbtp: checkedNumber(step.maxTruePeakDbtp ?? -1.5, `steps[${index}].maxTruePeakDbtp`, -6, -0.5),
          maxGainDb: checkedNumber(step.maxGainDb ?? 9, `steps[${index}].maxGainDb`, 0, 12),
        };
        break;
      }
      default:
        fail('unsupported-audio-step', `Unsupported audio step: ${String(step.type)}; use only denoise, highpass, equalizer, deesser, compressor, limiter, gain, or normalize`);
    }
  }
  return {filters, normalize};
}

export function validateAudioPlan(plan) {
  if (!plan || typeof plan !== 'object' || plan.format !== AUDIO_PLAN_FORMAT) fail('invalid-audio-plan', `audio-plan.format must be ${AUDIO_PLAN_FORMAT}`);
  rejectUnknownKeys(plan, ['format', 'revision', 'project', 'binding', 'diagnosis', 'protection', 'steps', 'review'], 'audio-plan');
  if (!Number.isInteger(plan.revision) || plan.revision < 1) fail('invalid-audio-plan', 'audio-plan.revision must be a positive integer');
  const binding = plan.binding;
  if (!binding || !['source', 'compiled-timeline'].includes(binding.kind)) fail('invalid-audio-plan', 'audio-plan.binding.kind must be source or compiled-timeline');
  const bindingFields = ['kind', 'mediaPath', 'mediaSha256', 'sampleRateHz', 'sampleCount', 'channels', 'sourceId', 'project', 'editPlanPath', 'timelinePath', 'receiptPath', 'planSha256', 'timelineFormat', 'timelineSha256', 'receiptSha256'];
  rejectUnknownKeys(binding, bindingFields, 'audio-plan.binding');
  if (typeof binding.mediaPath !== 'string' || !binding.mediaPath) fail('invalid-audio-plan', 'audio-plan.binding.mediaPath is required');
  if (typeof binding.mediaSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(binding.mediaSha256)) fail('invalid-audio-plan', 'audio-plan.binding.mediaSha256 must be a SHA-256 hex value');
  if (binding.sourceId !== undefined && (typeof binding.sourceId !== 'string' || !binding.sourceId)) fail('invalid-audio-plan', 'binding.sourceId must be a non-empty string when set');
  if (plan.project !== null) { rejectUnknownKeys(plan.project, ['id', 'revision'], 'audio-plan.project'); if (typeof plan.project.id !== 'string' || !Number.isInteger(plan.project.revision)) fail('invalid-audio-plan', 'audio-plan.project must contain id and integer revision'); }
  rejectUnknownKeys(plan.diagnosis, ['voice', 'issues', 'basis'], 'audio-plan.diagnosis');
  if (!['spoken_voice', 'mixed_voice', 'unknown'].includes(plan.diagnosis.voice) || !Array.isArray(plan.diagnosis.issues) || typeof plan.diagnosis.basis !== 'string') fail('invalid-audio-plan', 'audio-plan.diagnosis must explicitly record voice type, issues, and diagnosis basis');
  rejectUnknownKeys(plan.protection, ['preserveBackgroundAudio', 'preserveDuration', 'preserveSampleRate', 'preserveChannels', 'timeStretch', 'pitchShift', 'mix', 'overwriteSource'], 'audio-plan.protection');
  if (plan.protection.preserveBackgroundAudio !== true || plan.protection.timeStretch !== false || plan.protection.pitchShift !== false || plan.protection.mix !== false || plan.protection.overwriteSource !== false) fail('invalid-audio-plan', 'Audio plans must protect background content and must not stretch, pitch-shift, mix, or overwrite source media');
  rejectUnknownKeys(plan.review, ['method', 'status', 'auditionStatus'], 'audio-plan.review');
  if (plan.review.method !== 'same-content-same-loudness-ab' || !['pending', 'reviewed'].includes(plan.review.status) || plan.review.auditionStatus !== 'not_auditioned') fail('invalid-audio-plan', 'audio-plan.review must use pending/reviewed status and cannot pre-claim audition');
  if (binding.kind === 'compiled-timeline') {
    for (const field of ['editPlanPath', 'timelinePath', 'receiptPath', 'planSha256', 'timelineSha256', 'receiptSha256']) {
      if (typeof binding[field] !== 'string' || !binding[field]) fail('invalid-audio-plan', `compiled-timeline binding.${field} is required`);
    }
  }
  if (!Array.isArray(plan.steps)) fail('invalid-audio-plan', 'audio-plan.steps must be an array');
  if (plan.protection?.preserveDuration !== true || plan.protection?.preserveSampleRate !== true || plan.protection?.preserveChannels !== true) {
    fail('invalid-audio-plan', 'Audio plans must preserve the decoded sample rate, channel count, and exact sample count');
  }
  audioStepsToFilters(plan.steps, binding.sampleRateHz ?? 192000);
  if (binding.kind === 'compiled-timeline' && plan.steps.some((step) => !['gain', 'limiter', 'normalize'].includes(step.type))) {
    fail('context-required-step', 'A compiled-timeline audio plan has no contiguous source context; only static gain, peak limiter, or measured loudness normalization can run after cuts. Run denoise, EQ, de-essing, and compression on the continuous source before timeline rendering.');
  }
  return true;
}

function relativeRef(baseDir, path) { return relative(baseDir, resolve(path)) || basename(path); }

export async function createAudioPlan({inputPath, outPath, mode = 'source', editPlanPath, timelinePath, receiptPath, projectId = null, sourceId = null} = {}) {
  if (!inputPath || !outPath) fail('missing-argument', 'createAudioPlan requires inputPath and outPath');
  const absoluteInput = resolve(inputPath);
  const absoluteOutput = resolve(outPath);
  const outputBase = dirname(absoluteOutput);
  const inputHash = await hashFile(absoluteInput);
  const plan = {
    format: AUDIO_PLAN_FORMAT,
    revision: 1,
    project: projectId ? {id: projectId, revision: 1} : null,
    binding: {
      kind: mode,
      mediaPath: relativeRef(outputBase, absoluteInput),
      mediaSha256: inputHash,
      sampleRateHz: null,
      sampleCount: null,
      channels: null,
      ...(sourceId ? {sourceId} : {}),
    },
    diagnosis: {voice: 'spoken_voice', issues: [], basis: 'pending_human_review'},
    protection: {preserveBackgroundAudio: true, preserveDuration: true, preserveSampleRate: true, preserveChannels: true, timeStretch: false, pitchShift: false, mix: false, overwriteSource: false},
    steps: [],
    review: {method: 'same-content-same-loudness-ab', status: 'pending', auditionStatus: 'not_auditioned'},
  };
  const protectedInputs = [absoluteInput];
  if (mode === 'compiled-timeline') {
    if (!editPlanPath || !timelinePath || !receiptPath) fail('missing-argument', 'compiled-timeline mode requires editPlanPath, timelinePath, and receiptPath');
    const ePath = resolve(editPlanPath);
    const tPath = resolve(timelinePath);
    const rPath = resolve(receiptPath);
    const editPlan = JSON.parse(await readFile(ePath, 'utf8'));
    const timeline = JSON.parse(await readFile(tPath, 'utf8'));
    const receipt = JSON.parse(await readFile(rPath, 'utf8'));
    await verifyPlanEvidence(editPlan, {baseDir: dirname(ePath)});
    const canonicalTimeline = compilePlan(editPlan);
    if (editPlan.state !== 'frozen' || timeline.state !== 'frozen' || ![TIMELINE_FORMAT, TIMELINE_V2_FORMAT].includes(timeline.format)
      || timeline.planSha256 !== hashPlan(editPlan) || JSON.stringify(canonicalTimeline) !== JSON.stringify(timeline)) {
      fail('timeline-stale', 'Compiled-timeline audio plan requires a frozen, canonical ASRCUT timeline matching the current edit plan');
    }
    if (receipt.format !== 'laohu.asrcut.audio-artifact/1' && receipt.format !== 'laohu.asrcut.audio-artifact/2') fail('artifact-receipt-invalid', 'The media receipt is not an ASRCUT audio artifact');
    if (receipt.project?.id !== editPlan.project?.id || receipt.project?.revision !== editPlan.project?.revision || receipt.planSha256 !== hashPlan(editPlan)
      || receipt.timelineFormat !== timeline.format || receipt.outputSha256 !== inputHash || !['not_auditioned', 'auditioned'].includes(receipt.auditionStatus)) {
      fail('artifact-binding-stale', 'Cut audio receipt does not match the frozen plan, timeline, and input audio hash');
    }
    plan.project = {...editPlan.project};
    Object.assign(plan.binding, {
      kind: 'compiled-timeline',
      project: {...editPlan.project},
      planSha256: hashPlan(editPlan),
      timelineFormat: timeline.format,
      timelineSha256: await hashFile(tPath),
      receiptSha256: await hashFile(rPath),
      editPlanPath: relativeRef(outputBase, ePath),
      timelinePath: relativeRef(outputBase, tPath),
      receiptPath: relativeRef(outputBase, rPath),
      sampleRateHz: receipt.sampleRateHz,
      sampleCount: receipt.sampleCount,
      channels: receipt.channels,
    });
    protectedInputs.push(ePath, tPath, rPath);
  } else if (mode !== 'source') fail('invalid-audio-plan', 'mode must be source or compiled-timeline');
  validateAudioPlan(plan);
  await writeNewJson(absoluteOutput, plan, protectedInputs);
  return {path: absoluteOutput, plan, planSha256: await hashFile(absoluteOutput)};
}

async function writeNewJson(path, value, protectedInputs) {
  await assertNewPath(path, protectedInputs);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const tempPath = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  const handle = await open(tempPath, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  catch (error) { await handle.close().catch(() => {}); await unlink(tempPath).catch(() => {}); throw error; }
  await handle.close();
  try { await link(tempPath, path); }
  catch (error) { await unlink(tempPath).catch(() => {}); if (error.code === 'EEXIST') fail('output-exists', `Refusing to replace output created during plan writing: ${path}`); throw error; }
  await unlink(tempPath);
}

async function identity(path) {
  const absolute = resolve(path);
  const info = await lstat(absolute).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
  let canonical = absolute;
  if (info) canonical = await realpath(absolute);
  else {
    const parent = await realpath(dirname(absolute)).catch(() => resolve(dirname(absolute)));
    canonical = join(parent, basename(absolute));
  }
  return {path: absolute, canonical, info, dev: info?.dev, ino: info?.ino};
}

async function assertNewPath(outPath, inputPaths = []) {
  const output = await identity(outPath);
  if (output.info) fail('output-exists', `Refusing to replace an existing output: ${outPath}`);
  for (const inputPath of inputPaths.filter(Boolean)) {
    const input = await identity(inputPath);
    if (output.canonical === input.canonical || (output.info && input.info && output.dev === input.dev && output.ino === input.ino)) {
      fail('path-alias', `Output path aliases an input and cannot be written: ${outPath}`);
    }
  }
}

function parseWavHeader(path) {
  return open(path, 'r').then(async (handle) => {
    try {
      const header = Buffer.alloc(12);
      const {bytesRead} = await handle.read(header, 0, header.length, 0);
      if (bytesRead !== 12 || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
        fail('unsupported-wave', 'Only RIFF/WAVE PCM or IEEE-float WAV media is supported for this first processing route');
      }
      let offset = 12;
      let format = null;
      let dataSize = null;
      let dataOffset = null;
      let remaining = (await handle.stat()).size;
      while (offset + 8 <= remaining) {
        const chunk = Buffer.alloc(8);
        const read = await handle.read(chunk, 0, 8, offset);
        if (read.bytesRead !== 8) break;
        const name = chunk.toString('ascii', 0, 4);
        const size = chunk.readUInt32LE(4);
        const start = offset + 8;
        if (name === 'fmt ') {
          const fmt = Buffer.alloc(Math.min(size, 64));
          const got = await handle.read(fmt, 0, fmt.length, start);
          if (got.bytesRead < 16) fail('unsupported-wave', 'WAV fmt chunk is incomplete');
          format = {audioFormat: fmt.readUInt16LE(0), channels: fmt.readUInt16LE(2), sampleRateHz: fmt.readUInt32LE(4), byteRate: fmt.readUInt32LE(8), blockAlign: fmt.readUInt16LE(12), bitsPerSample: fmt.readUInt16LE(14)};
          if (format.audioFormat === 0xfffe && got.bytesRead >= 26) format.audioFormat = fmt.readUInt16LE(24);
        }
        if (name === 'data' && dataSize === null) { dataSize = size; dataOffset = start; }
        offset = start + size + (size % 2);
        if (offset > remaining) fail('unsupported-wave', 'WAV chunk exceeds the file length');
        if (format && dataSize !== null) break;
      }
      if (!format || dataSize === null) fail('unsupported-wave', 'WAV is missing its fmt or data chunk');
      if (![1, 3].includes(format.audioFormat) || format.channels < 1 || format.channels > 8 || format.sampleRateHz < 8000 || format.sampleRateHz > 192000
        || format.blockAlign !== format.channels * Math.ceil(format.bitsPerSample / 8) || dataSize % format.blockAlign !== 0) {
        fail('unsupported-wave', 'WAV must contain 1–8 channel PCM/float audio at 8–192 kHz with complete sample frames');
      }
      return {...format, sampleCount: dataSize / format.blockAlign, dataBytes: dataSize, dataOffset};
    } finally { await handle.close(); }
  });
}

async function ffmpegVersion(ffmpegPath) {
  try {
    const {stdout, stderr} = await execFile(ffmpegPath, ['-version'], {encoding: 'utf8', maxBuffer: 2 * 1024 * 1024});
    return `${stdout || stderr}`.split(/\r?\n/)[0].trim();
  } catch (error) { fail('ffmpeg-unavailable', `Configured FFmpeg could not run: ${error.stderr || error.message}`); }
}

async function runFfmpeg(ffmpegPath, args, label) {
  try { return await execFile(ffmpegPath, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}); }
  catch (error) { fail('ffmpeg-failed', `${label}: ${error.stderr || error.message}`); }
}

async function inspectSingleAudioStream(ffmpegPath, inputPath) {
  let diagnostic = '';
  try {
    const result = await execFile(ffmpegPath, ['-hide_banner', '-i', inputPath], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
    diagnostic = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
  } catch (error) {
    diagnostic = `${error.stderr ?? ''}\n${error.stdout ?? ''}`;
    if (!diagnostic.includes('Stream #')) fail('ffmpeg-stream-inspection-failed', `FFmpeg could not inspect audio streams: ${error.message}`);
  }
  const indexes = [...diagnostic.matchAll(/Stream #\d+:(\d+)(?:\[[^\]]+\])?(?:\([^)]*\))?: Audio:/g)].map((match) => Number(match[1]));
  if (!indexes.length) fail('audio-stream-missing', 'Input contains no readable audio stream');
  if (indexes.length !== 1) fail('multiple-audio-streams', 'Input contains multiple audio streams. This path will not silently drop background/system audio or guess synchronization; prepare and review a single mixed track first.');
  return indexes[0];
}

function parseLoudnorm(stderr) {
  const blocks = [...String(stderr).matchAll(/\{\s*"input_i"[\s\S]*?\n\s*\}/g)];
  if (!blocks.length) fail('loudness-measurement-failed', 'FFmpeg did not return loudnorm measurement JSON');
  let parsed;
  try { parsed = JSON.parse(blocks.at(-1)[0]); } catch (error) { fail('loudness-measurement-failed', `Could not parse FFmpeg loudness report: ${error.message}`); }
  const integratedLufs = Number(parsed.input_i);
  const truePeakDbtp = Number(parsed.input_tp);
  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbtp)) fail('loudness-measurement-failed', 'FFmpeg loudness measurement has no finite integrated loudness/true-peak values');
  return {integratedLufs, truePeakDbtp, rangeLra: Number.isFinite(Number(parsed.input_lra)) ? Number(parsed.input_lra) : null};
}

async function measureLoudness(ffmpegPath, path) {
  const {stderr} = await runFfmpeg(ffmpegPath, ['-nostdin', '-hide_banner', '-i', path, '-map', '0:a:0', '-af', 'loudnorm=I=-23:TP=-2:LRA=7:print_format=json', '-f', 'null', '-'], `Could not measure loudness of ${basename(path)}`);
  return parseLoudnorm(stderr);
}

async function decodeInput(ffmpegPath, inputPath, outputPath, streamIndex) {
  await runFfmpeg(ffmpegPath, ['-nostdin', '-hide_banner', '-v', 'error', '-i', inputPath, '-map', `0:${streamIndex}`, '-vn', '-map_metadata', '-1', '-c:a', 'pcm_f32le', '-f', 'wav', outputPath], 'Could not decode the bound input audio');
  return parseWavHeader(outputPath);
}

async function renderFilterChain(ffmpegPath, inputPath, outputPath, filters, codec = 'pcm_f32le', {delaySamples = 0, expectedSamples = null} = {}) {
  const args = ['-nostdin', '-hide_banner', '-v', 'error', '-i', inputPath, '-map', '0:a:0', '-vn', '-map_metadata', '-1'];
  const chain = [];
  if (delaySamples > 0) chain.push(`adelay=${delaySamples}S:all=1`, `apad=pad_len=${delaySamples}`);
  chain.push(...filters);
  if (delaySamples > 0) chain.push(`atrim=start_sample=${2 * delaySamples}:end_sample=${2 * delaySamples + expectedSamples}`, 'asetpts=PTS-STARTPTS');
  else if (filters.length) chain.push('asetpts=PTS-STARTPTS');
  if (chain.length) args.push('-af', chain.join(','));
  args.push('-c:a', codec, '-f', 'wav', outputPath);
  await runFfmpeg(ffmpegPath, args, 'FFmpeg could not process the requested audio steps');
  return parseWavHeader(outputPath);
}

function assertSameShape(expected, actual, label) {
  if (expected.sampleRateHz !== actual.sampleRateHz || expected.channels !== actual.channels || expected.sampleCount !== actual.sampleCount) {
    fail('audio-shape-changed', `${label} changed decoded sample rate, channel count, or exact sample count`, {expected: {sampleRateHz: expected.sampleRateHz, channels: expected.channels, sampleCount: expected.sampleCount}, actual: {sampleRateHz: actual.sampleRateHz, channels: actual.channels, sampleCount: actual.sampleCount}});
  }
}

async function applyGain(ffmpegPath, inputPath, outputPath, gainDb, codec = 'pcm_f32le') {
  return renderFilterChain(ffmpegPath, inputPath, outputPath, [`volume=${gainDb}dB`], codec);
}

async function createTimingPhrase(sampleRateHz, channels, outPath) {
  const frameCount = Math.round(sampleRateHz * 1.7);
  const phraseFrames = Math.round(sampleRateHz * 0.12);
  const positions = [0.2, 0.7, 1.25].map((seconds) => Math.round(sampleRateHz * seconds));
  const dataBytes = frameCount * channels * 4;
  if (dataBytes > 64 * 1024 * 1024) fail('latency-probe-too-large', 'The timing probe exceeds the bounded fixture size');
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8, 'ascii');
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(3, 20); buffer.writeUInt16LE(channels, 22); buffer.writeUInt32LE(sampleRateHz, 24);
  buffer.writeUInt32LE(sampleRateHz * channels * 4, 28); buffer.writeUInt16LE(channels * 4, 32); buffer.writeUInt16LE(32, 34);
  buffer.write('data', 36, 'ascii'); buffer.writeUInt32LE(dataBytes, 40);
  let randomState = 0x7f4a7c15;
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 0x100000000 * 2 - 1; };
  const phrase = new Float32Array(phraseFrames);
  for (let frame = 0; frame < phraseFrames; frame += 1) {
    const t = frame / sampleRateHz;
    const envelope = Math.sin(Math.PI * frame / Math.max(1, phraseFrames - 1)) ** 2;
    const modulation = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4.5 * t));
    const voiced = 0.42 * Math.sin(2 * Math.PI * 180 * t) + 0.26 * Math.sin(2 * Math.PI * 430 * t) + 0.18 * Math.sin(2 * Math.PI * 1050 * t) + 0.10 * Math.sin(2 * Math.PI * 2700 * t);
    phrase[frame] = envelope * modulation * (voiced + 0.12 * random());
  }
  for (let frame = 0; frame < frameCount; frame += 1) {
    const floor = 0.0005 * random();
    for (let channel = 0; channel < channels; channel += 1) buffer.writeFloatLE(floor, 44 + (frame * channels + channel) * 4);
  }
  for (const position of positions) for (let frame = 0; frame < phraseFrames; frame += 1) for (let channel = 0; channel < channels; channel += 1) {
    const offset = 44 + ((position + frame) * channels + channel) * 4;
    buffer.writeFloatLE(buffer.readFloatLE(offset) + phrase[frame], offset);
  }
  const handle = await open(outPath, 'wx', 0o600);
  try { await handle.writeFile(buffer); } finally { await handle.close(); }
  return {positions, phraseFrames, frameCount};
}

async function readFloatWav(path, shape) {
  if (shape.audioFormat !== 3 || shape.bitsPerSample !== 32) fail('latency-probe-format', 'Timing probe output was not 32-bit float WAV');
  const handle = await open(path, 'r');
  try {
    const data = Buffer.alloc(shape.dataBytes);
    const {bytesRead} = await handle.read(data, 0, data.length, shape.dataOffset);
    if (bytesRead !== data.length) fail('latency-probe-format', 'Timing probe WAV data is truncated');
    return data;
  } finally { await handle.close(); }
}

function normalizedCorrelation(input, output, channels, position, phraseFrames, lag, stride) {
  let dot = 0; let inputEnergy = 0; let outputEnergy = 0;
  for (let frame = 0; frame < phraseFrames; frame += stride) for (let channel = 0; channel < channels; channel += 1) {
    const inputIndex = 44 + ((position + frame) * channels + channel) * 4;
    const outputIndex = 44 + ((position + frame + lag) * channels + channel) * 4;
    const x = input.readFloatLE(inputIndex); const y = output.readFloatLE(outputIndex);
    dot += x * y; inputEnergy += x * x; outputEnergy += y * y;
  }
  if (inputEnergy <= 1e-20 || outputEnergy <= 1e-20) return 0;
  return Math.abs(dot) / Math.sqrt(inputEnergy * outputEnergy);
}

function estimateLag(input, output, channels, position, phraseFrames, sampleRateHz) {
  const maxLag = Math.round(sampleRateHz * 0.05);
  let coarseBest = {lag: 0, correlation: -1};
  const coarseStride = Math.max(1, Math.ceil(sampleRateHz / 12000));
  const lagStride = Math.max(1, Math.ceil(sampleRateHz / 12000));
  for (let lag = -maxLag; lag <= maxLag; lag += lagStride) {
    const correlation = normalizedCorrelation(input, output, channels, position, phraseFrames, lag, coarseStride);
    if (correlation > coarseBest.correlation) coarseBest = {lag, correlation};
  }
  let best = {lag: coarseBest.lag, correlation: -1}; let second = -1;
  for (let lag = Math.max(-maxLag, coarseBest.lag - lagStride); lag <= Math.min(maxLag, coarseBest.lag + lagStride); lag += 1) {
    const correlation = normalizedCorrelation(input, output, channels, position, phraseFrames, lag, 1);
    if (correlation > best.correlation) { if (Math.abs(lag - best.lag) > 2) second = Math.max(second, best.correlation); best = {lag, correlation}; }
    else if (Math.abs(lag - best.lag) > 2) second = Math.max(second, correlation);
  }
  return {...best, confidenceMargin: best.correlation - Math.max(0, second)};
}

async function calibrateFilterTiming(ffmpegPath, version, filters, sampleRateHz, channels, workDir) {
  const cacheKey = JSON.stringify({version, filters, sampleRateHz, channels});
  if (timingCache.has(cacheKey)) return timingCache.get(cacheKey);
  if (!filters.length) return {status: 'passed', method: 'bypass-path-sample-index', offsetsSamples: [0, 0, 0], confidence: 1};
  const inputPath = join(workDir, 'latency-probe-input.wav');
  const outputPath = join(workDir, 'latency-probe-output.wav');
  const compensatedPath = join(workDir, 'latency-probe-compensated.wav');
  const {positions, phraseFrames, frameCount} = await createTimingPhrase(sampleRateHz, channels, inputPath);
  const inputShape = await parseWavHeader(inputPath);
  const input = await readFloatWav(inputPath, inputShape);
  const outputShape = await renderFilterChain(ffmpegPath, inputPath, outputPath, filters);
  if (outputShape.sampleRateHz !== sampleRateHz || outputShape.channels !== channels || outputShape.sampleCount !== frameCount) fail('latency-probe-shape', 'Timing probe changed sample rate, channel count, or total samples');
  const output = await readFloatWav(outputPath, outputShape);
  const estimates = positions.map((position) => estimateLag(input, output, channels, position, phraseFrames, sampleRateHz));
  if (estimates.some((estimate) => estimate.correlation < 0.25 || estimate.confidenceMargin < 0.00005)) {
    const result = {status: 'unverified', method: 'three-position-voiced-noise-correlation', offsetsSamples: estimates.map(({lag}) => lag), confidence: estimates.map(({correlation, confidenceMargin}) => ({correlation, margin: confidenceMargin})), reason: 'One or more voiced-passage timing correlations did not have adequate confidence'};
    timingCache.set(cacheKey, result);
    return result;
  }
  const offsets = estimates.map(({lag}) => lag);
  if (!offsets.every((offset) => offset === offsets[0])) {
    const result = {status: 'unverified', method: 'three-position-voiced-noise-correlation', offsetsSamples: offsets, confidence: estimates.map(({correlation, confidenceMargin}) => ({correlation, margin: confidenceMargin})), reason: 'Measured delay varied across the three separated test passages'};
    timingCache.set(cacheKey, result);
    return result;
  }
  const compensationSamples = Math.max(0, offsets[0]);
  if (offsets[0] < 0) {
    const result = {status: 'unverified', method: 'three-position-voiced-noise-correlation', offsetsSamples: offsets, confidence: estimates.map(({correlation, confidenceMargin}) => ({correlation, margin: confidenceMargin})), reason: 'The filter chain advances the test signal; this phase has no safe source-context compensation for an advance'};
    timingCache.set(cacheKey, result);
    return result;
  }
  const compensatedShape = await renderFilterChain(ffmpegPath, inputPath, compensatedPath, filters, 'pcm_f32le', {delaySamples: compensationSamples, expectedSamples: frameCount});
  if (compensatedShape.sampleRateHz !== sampleRateHz || compensatedShape.channels !== channels || compensatedShape.sampleCount !== frameCount) fail('latency-compensation-shape', 'Explicit filter-latency compensation changed the probe sample shape');
  const compensated = await readFloatWav(compensatedPath, compensatedShape);
  const postCompensation = positions.map((position) => estimateLag(input, compensated, channels, position, phraseFrames, sampleRateHz));
  if (postCompensation.some((estimate) => estimate.lag !== 0 || estimate.correlation < 0.25 || estimate.confidenceMargin < 0.00005)) {
    const result = {status: 'unverified', method: 'three-position-voiced-noise-correlation', offsetsSamples: offsets, postCompensationOffsetsSamples: postCompensation.map(({lag}) => lag), confidence: postCompensation.map(({correlation, confidenceMargin}) => ({correlation, margin: confidenceMargin})), compensationSamples, reason: 'Post-compensation correlation did not return all three passages to zero sample offset'};
    timingCache.set(cacheKey, result);
    return result;
  }
  const result = {status: 'passed', method: 'three-position-voiced-noise-correlation', offsetsSamples: offsets, postCompensationOffsetsSamples: postCompensation.map(({lag}) => lag), confidence: postCompensation.map(({correlation, confidenceMargin}) => ({correlation, margin: confidenceMargin})), measuredLatencySamples: offsets[0], compensationSamples};
  timingCache.set(cacheKey, result);
  return result;
}

function buildReviewHtml({feedbackBinding, title, baselineName, matchedName, metrics}) {
  const escaped = (value) => String(value).replace(/[&<>"']/g, (character) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
  const binding = JSON.stringify(feedbackBinding).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escaped(title)}</title>
<style>
body{font:16px/1.6 system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 18px;color:#18212f;background:#f6f8fb}main{background:#fff;border:1px solid #dce3ea;border-radius:14px;padding:24px}h1{font-size:1.4rem}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.item{border:1px solid #dce3ea;border-radius:10px;padding:16px}audio{width:100%}.note{color:#586579}.metrics{font-family:ui-monospace,monospace;font-size:.9rem}.feedback{margin-top:20px}textarea{width:100%;min-height:100px;box-sizing:border-box}button{padding:10px 16px;margin-top:10px}.warning{background:#fff6dd;padding:12px;border-radius:8px}@media(max-width:640px){.grid{grid-template-columns:1fr}}
</style><main><h1>${escaped(title)}</h1>
<p class="warning">请交替试听 A 与 B。两版都按各自匹配增益降低到共同综合响度 ${escaped(metrics.commonTargetLufs.toFixed(2))} LUFS，并同时受真峰值上限约束。试听匹配只用于公平比较，不改变正式处理输出；页面和回执不代表人工听审，请勾选真实完成试听后再导出反馈。</p>
<section class="grid"><article class="item"><h2>A · 原声试听副本</h2><audio controls preload="metadata" src="${escaped(baselineName)}"></audio><p class="metrics">匹配后综合响度：${escaped(metrics.baseline.integratedLufs.toFixed(2))} LUFS<br>真峰值：${escaped(metrics.baseline.truePeakDbtp.toFixed(2))} dBTP<br>A 试听匹配增益：${escaped(metrics.baselineMatchGainDb.toFixed(2))} dB</p></article>
<article class="item"><h2>B · 处理版试听副本</h2><audio controls preload="metadata" src="${escaped(matchedName)}"></audio><p class="metrics">处理交付版：${escaped(metrics.processed.integratedLufs.toFixed(2))} LUFS · ${escaped(metrics.processed.truePeakDbtp.toFixed(2))} dBTP<br>匹配后综合响度：${escaped(metrics.matchedProcessed.integratedLufs.toFixed(2))} LUFS · ${escaped(metrics.matchedProcessed.truePeakDbtp.toFixed(2))} dBTP<br>B 试听匹配增益：${escaped(metrics.matchGainDb.toFixed(2))} dB<br>匹配后与 A 差：${escaped(metrics.matchDifferenceDb.toFixed(2))} LU</p></article></section>
<p class="note">这是同一份输入的同一时长比较。A 和 B 都是只供公平比较的试听副本；正式处理版另存为音频输出。只听到差异，不自动等于某版更适合发布。</p>
<section class="feedback"><h2>可选：记录听感</h2><label><input id="auditioned" type="checkbox"> 我已经在相近播放响度下交替试听 A 和 B</label><p><label>我的偏好
<select id="preference"><option value="undecided">尚未判断</option><option value="original">A 原始音频</option><option value="processed">B 处理版</option><option value="neither">两版都不合适</option></select></label></p><p><label for="notes">具体听到什么（例如闷、齿音、环境声、声音变薄、动态不自然）</label><textarea id="notes"></textarea></p><button id="download" disabled>下载试听反馈 JSON</button><p id="status" class="note">勾选完成试听后可导出反馈。反馈只供后续判断，不会自动改写音频方案。</p></section>
</main><script>
const binding=${binding};const checkbox=document.querySelector('#auditioned');const button=document.querySelector('#download');checkbox.addEventListener('change',()=>button.disabled=!checkbox.checked);button.addEventListener('click',()=>{if(!checkbox.checked)return;const feedback={format:'laohu.asrcut.audio-review-feedback/1',binding,auditionStatus:'auditioned',auditionedAt:new Date().toISOString(),preference:document.querySelector('#preference').value,notes:document.querySelector('#notes').value};const blob=new Blob([JSON.stringify(feedback,null,2)+'\\n'],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='audio-review-feedback.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);document.querySelector('#status').textContent='反馈文件已下载；它不会自动应用到 audio-plan。'});
</script></html>\n`;
}

async function publishNewFile(stagedPath, destination) {
  const handle = await open(stagedPath, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
  try { await link(stagedPath, destination); }
  catch (error) { if (error.code === 'EEXIST') fail('output-exists', `Refusing to replace output created during processing: ${destination}`); throw error; }
  await unlink(stagedPath);
}

async function checkCompiledBinding(plan, planDir) {
  const binding = plan.binding;
  if (binding.kind !== 'compiled-timeline') return [];
  const editPlanPath = resolve(planDir, binding.editPlanPath);
  const timelinePath = resolve(planDir, binding.timelinePath);
  const receiptPath = resolve(planDir, binding.receiptPath);
  const [editPlanBytes, timelineBytes, receiptBytes] = await Promise.all([readFile(editPlanPath), readFile(timelinePath), readFile(receiptPath)]);
  const editPlan = JSON.parse(editPlanBytes.toString('utf8'));
  const timeline = JSON.parse(timelineBytes.toString('utf8'));
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  await verifyPlanEvidence(editPlan, {baseDir: dirname(editPlanPath)});
  if (editPlan.state !== 'frozen' || hashPlan(editPlan) !== binding.planSha256 || sha256(timelineBytes) !== binding.timelineSha256 || sha256(receiptBytes) !== binding.receiptSha256) {
    fail('audio-binding-stale', 'Compiled timeline or its ASRCUT plan/receipt changed after the audio-plan was created');
  }
  if (JSON.stringify(compilePlan(editPlan)) !== JSON.stringify(timeline) || timeline.state !== 'frozen' || timeline.planSha256 !== binding.planSha256) fail('audio-binding-stale', 'Bound timeline is no longer the canonical frozen compile of its edit plan');
  if (receipt.project?.id !== editPlan.project?.id || receipt.project?.revision !== editPlan.project?.revision || receipt.planSha256 !== binding.planSha256 || receipt.timelineFormat !== timeline.format) {
    fail('audio-binding-stale', 'Bound cut receipt no longer matches the frozen ASRCUT identities');
  }
  const input = resolve(planDir, binding.mediaPath);
  if (await hashFile(input) !== receipt.outputSha256 || receipt.outputSha256 !== binding.mediaSha256) fail('audio-binding-stale', 'Bound cut audio no longer matches its artifact receipt');
  return [editPlanPath, timelinePath, receiptPath];
}

export async function processAudioPlan({planPath, outPath, tmpDir, ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg'} = {}) {
  if (!planPath || !outPath) fail('missing-argument', 'processAudioPlan requires planPath and outPath');
  const absolutePlan = resolve(planPath);
  const planBytes = await readFile(absolutePlan);
  const plan = JSON.parse(planBytes.toString('utf8'));
  validateAudioPlan(plan);
  const planSha256 = sha256(planBytes);
  const planDir = dirname(absolutePlan);
  const inputPath = resolve(planDir, plan.binding.mediaPath);
  if (await hashFile(inputPath) !== plan.binding.mediaSha256) fail('source-hash-stale', 'Audio input changed since audio-plan creation');
  const bindingInputs = await checkCompiledBinding(plan, planDir);
  const inputIdentity = await identity(inputPath);
  const bindingSnapshots = new Map([[absolutePlan, planSha256]]);
  for (const path of bindingInputs) bindingSnapshots.set(path, await hashFile(path));
  const out = resolve(outPath);
  if (extname(out).toLowerCase() !== '.wav') fail('unsupported-output-format', 'This processor writes a new PCM WAV only');
  const outputDir = dirname(out);
  const outputParent = await stat(outputDir).catch(() => null);
  if (!outputParent?.isDirectory()) fail('output-directory-missing', 'Output directory must already exist');
  const baseName = basename(out, extname(out));
  const baselineFinal = join(outputDir, `${baseName}.ab-source.wav`);
  const matchedFinal = join(outputDir, `${baseName}.ab-match.wav`);
  const receiptFinal = `${out}.audio.json`;
  const reviewFinal = `${out}.review.html`;
  const finalPaths = [out, baselineFinal, matchedFinal, receiptFinal, reviewFinal];
  const protectedInputs = [absolutePlan, inputPath, ...bindingInputs];
  for (const path of finalPaths) await assertNewPath(path, protectedInputs.concat(finalPaths.filter((other) => other !== path)));
  const workRoot = resolve(tmpDir ?? join(process.cwd(), '.cache/tmp/asrcut-audio'));
  await mkdir(workRoot, {recursive: true});
  const workInfo = await stat(workRoot);
  if (workInfo.dev !== outputParent.dev) fail('cross-volume-temp', 'Processing temp directory must be on the same volume as the output directory');
  const runId = `${process.pid}-${randomBytes(8).toString('hex')}`;
  const workDir = join(workRoot, `audio-postprocess-${runId}`);
  await mkdir(workDir, {recursive: false});
  const dryPath = join(workDir, 'decoded-source.wav');
  const processPath = join(workDir, 'processed-float.wav');
  const normalizedPath = join(workDir, 'normalized-float.wav');
  const finalStagePath = join(workDir, 'processed.wav');
  const baselineFloatPath = join(workDir, 'baseline-match-float.wav');
  const matchFloatPath = join(workDir, 'processed-match-float.wav');
  const baselineStagePath = join(workDir, 'baseline.wav');
  const matchPath = join(workDir, 'matched.wav');
  const outputsPublished = [];
  const stagedOutputs = [];
  try {
    const version = await ffmpegVersion(ffmpegPath);
    const audioStreamIndex = await inspectSingleAudioStream(ffmpegPath, inputPath);
    const dryShape = await decodeInput(ffmpegPath, inputPath, dryPath, audioStreamIndex);
    if (plan.binding.kind === 'compiled-timeline'
      && (dryShape.sampleRateHz !== plan.binding.sampleRateHz || dryShape.sampleCount !== plan.binding.sampleCount || dryShape.channels !== plan.binding.channels)) {
      fail('audio-binding-shape-stale', 'Decoded cut WAV no longer matches the bound export receipt sample rate, channel count, or sample count');
    }
    const {filters, normalize} = audioStepsToFilters(plan.steps, dryShape.sampleRateHz);
    const timing = await calibrateFilterTiming(ffmpegPath, version, filters, dryShape.sampleRateHz, dryShape.channels, workDir);
    if (timing.status !== 'passed' && (plan.binding.kind === 'compiled-timeline' || plan.binding.sourceId)) {
      fail('latency-unverified', 'This audio plan is bound to an ASRCUT source/timeline, but the selected filter chain did not pass three-position voiced-passage timing calibration. No output was written.', timing);
    }
    const preNormalizeShape = await renderFilterChain(ffmpegPath, dryPath, processPath, filters, 'pcm_f32le', {delaySamples: timing.compensationSamples ?? 0, expectedSamples: dryShape.sampleCount});
    assertSameShape(dryShape, preNormalizeShape, 'Audio processing');
    let processedFloatPath = processPath;
    let normalization = null;
    if (normalize) {
      const preMeasure = await measureLoudness(ffmpegPath, processPath);
      const desiredGainDb = normalize.targetLufs - preMeasure.integratedLufs;
      const peakLimitedGainDb = normalize.maxTruePeakDbtp - preMeasure.truePeakDbtp;
      const appliedGainDb = clamp(Math.min(desiredGainDb, peakLimitedGainDb), -normalize.maxGainDb, normalize.maxGainDb);
      const normalizedShape = await applyGain(ffmpegPath, processPath, normalizedPath, appliedGainDb);
      assertSameShape(dryShape, normalizedShape, 'Loudness normalization');
      const measured = await measureLoudness(ffmpegPath, normalizedPath);
      if (measured.truePeakDbtp > normalize.maxTruePeakDbtp + 0.1 || Math.abs(measured.integratedLufs - normalize.targetLufs) > 0.5) {
        fail('normalize-target-unmet', 'Static gain could not meet both the requested integrated loudness and true-peak limit; the output was rejected instead of calling it normalized', {targetLufs: normalize.targetLufs, measuredLufs: measured.integratedLufs, maxTruePeakDbtp: normalize.maxTruePeakDbtp, measuredTruePeakDbtp: measured.truePeakDbtp, appliedGainDb});
      }
      processedFloatPath = normalizedPath;
      normalization = {targetLufs: normalize.targetLufs, maxTruePeakDbtp: normalize.maxTruePeakDbtp, desiredGainDb, appliedGainDb, measuredLufs: measured.integratedLufs, measuredTruePeakDbtp: measured.truePeakDbtp, status: 'target-and-peak-verified'};
    }
    const [baselineOriginal, processedLoudness] = await Promise.all([measureLoudness(ffmpegPath, dryPath), measureLoudness(ffmpegPath, processedFloatPath)]);
    if (processedLoudness.truePeakDbtp > 0) fail('processed-true-peak-over', 'Processed floating-point audio exceeds 0 dBTP; refusing integer PCM quantization because it could clip. Lower gain or add a verified normalize step.');
    const baselineSafetyGainDb = Math.min(0, -1 - baselineOriginal.truePeakDbtp);
    const safeBaselineShape = await applyGain(ffmpegPath, dryPath, baselineFloatPath, baselineSafetyGainDb);
    assertSameShape(dryShape, safeBaselineShape, 'A/B baseline preparation');
    const baselineForA = await measureLoudness(ffmpegPath, baselineFloatPath);
    const ceilingDbtp = -1;
    const commonTargetLufs = Math.min(
      baselineForA.integratedLufs,
      processedLoudness.integratedLufs,
      baselineForA.integratedLufs + ceilingDbtp - baselineForA.truePeakDbtp,
      processedLoudness.integratedLufs + ceilingDbtp - processedLoudness.truePeakDbtp,
    );
    const gainA = commonTargetLufs - baselineForA.integratedLufs;
    const gainB = commonTargetLufs - processedLoudness.integratedLufs;
    if (gainA < -36 || gainB < -36 || gainA > 0.05 || gainB > 0.05) fail('ab-match-unavailable', 'A/B copies cannot reach a common safe loudness within the 36 dB attenuation range; no comparison page was published', {gainA, gainB, commonTargetLufs});
    await applyGain(ffmpegPath, baselineFloatPath, baselineStagePath, gainA, 'pcm_s32le');
    await applyGain(ffmpegPath, processedFloatPath, matchPath, gainB, 'pcm_s32le');
    const finalShape = await renderFilterChain(ffmpegPath, processedFloatPath, finalStagePath, [], 'pcm_s32le');
    const baselineFinalShape = await parseWavHeader(baselineStagePath);
    const matchedShape = await parseWavHeader(matchPath);
    assertSameShape(dryShape, finalShape, 'Final PCM quantization');
    assertSameShape(dryShape, baselineFinalShape, 'A/B baseline PCM quantization');
    assertSameShape(dryShape, matchedShape, 'A/B processed PCM quantization');
    const [baselineMatchedLoudness, processedMatchedLoudness] = await Promise.all([measureLoudness(ffmpegPath, baselineStagePath), measureLoudness(ffmpegPath, matchPath)]);
    const matchDifferenceDb = processedMatchedLoudness.integratedLufs - baselineMatchedLoudness.integratedLufs;
    const thresholdDb = 0.5;
    if (Math.abs(matchDifferenceDb) > thresholdDb || baselineMatchedLoudness.truePeakDbtp > ceilingDbtp + 0.1 || processedMatchedLoudness.truePeakDbtp > ceilingDbtp + 0.1) {
      fail('ab-match-unverified', 'Quantized A/B comparison did not meet the measured loudness tolerance or peak ceiling; no output was published', {differenceLufs: matchDifferenceDb, toleranceLufs: thresholdDb, baselineTruePeakDbtp: baselineMatchedLoudness.truePeakDbtp, processedTruePeakDbtp: processedMatchedLoudness.truePeakDbtp, peakCeilingDbtp: ceilingDbtp});
    }
    const boundTimeline = plan.binding.kind === 'compiled-timeline' ? JSON.parse(await readFile(resolve(planDir, plan.binding.timelinePath), 'utf8')) : null;
    const receiptData = {
      format: AUDIO_POSTPROCESS_FORMAT,
      audioPlanSha256: planSha256,
      project: plan.project,
      binding: plan.binding.kind === 'compiled-timeline'
        ? {kind: plan.binding.kind, project: plan.binding.project, planSha256: plan.binding.planSha256, timelineFormat: plan.binding.timelineFormat, timelineSha256: plan.binding.timelineSha256, sourceOccurrences: (boundTimeline?.clips ?? []).map((clip) => ({occurrenceId: clip.occurrenceId, sourceId: clip.sourceId, sourceRange: clip.sourceRange, targetRange: clip.targetRange})), timelineUnits: boundTimeline?.units ?? boundTimeline?.clips?.map((clip) => ({kind: 'source', ...clip})) ?? []}
        : {kind: 'source', sourceId: plan.binding.sourceId ?? null},
      input: {name: basename(inputPath), sha256: plan.binding.mediaSha256, sampleRateHz: dryShape.sampleRateHz, sampleCount: dryShape.sampleCount, channels: dryShape.channels, sampleFormat: 'pcm_f32le-decode'},
      output: {name: basename(out), sha256: await hashFile(finalStagePath), sampleRateHz: dryShape.sampleRateHz, sampleCount: dryShape.sampleCount, channels: dryShape.channels, sampleFormat: 'pcm_s32le'},
      comparison: {
        baselineOriginal: {integratedLufs: baselineOriginal.integratedLufs, truePeakDbtp: baselineOriginal.truePeakDbtp},
        baseline: {name: basename(baselineFinal), sha256: await hashFile(baselineStagePath), integratedLufs: baselineMatchedLoudness.integratedLufs, truePeakDbtp: baselineMatchedLoudness.truePeakDbtp, gainDb: baselineSafetyGainDb + gainA},
        processed: {integratedLufs: processedLoudness.integratedLufs, truePeakDbtp: processedLoudness.truePeakDbtp},
        matchedCopy: {name: basename(matchedFinal), sha256: await hashFile(matchPath), integratedLufs: processedMatchedLoudness.integratedLufs, truePeakDbtp: processedMatchedLoudness.truePeakDbtp, gainDb: gainB},
        commonTargetLufs,
        differenceLufs: matchDifferenceDb,
        isMatchedWithinTolerance: true,
        toleranceLufs: thresholdDb,
        peakCeilingDbtp: ceilingDbtp,
      },
      processing: {engine: 'FFmpeg', version, steps: plan.steps, filterChain: filters, normalization, bypass: plan.steps.length === 0},
      timing: {latencyCalibration: timing, latencyCompensation: {inputLeadingPadSamples: timing.compensationSamples ?? 0, inputTrailingPadSamples: timing.compensationSamples ?? 0, removedOutputLeadingSamples: 2 * (timing.compensationSamples ?? 0), expectedOutputSampleCount: dryShape.sampleCount, method: 'measured-filter-delay-plus-context-pad-and-exact-range-map'}, exactSampleCountPreserved: true, exactSampleRatePreserved: true, channelCountPreserved: true, unexplainedTrimOrPadding: false},
      auditionStatus: 'not_auditioned',
      processedAt: new Date().toISOString(),
    };
    const receiptBytes = Buffer.from(`${JSON.stringify(receiptData, null, 2)}\n`, 'utf8');
    const feedbackBinding = {audioPlanSha256: planSha256, sourceSha256: plan.binding.mediaSha256, processedOutputSha256: receiptData.output.sha256, comparison: {baselineSha256: receiptData.comparison.baseline.sha256, matchedSha256: receiptData.comparison.matchedCopy.sha256, differenceLufs: matchDifferenceDb}, project: receiptData.binding.project ?? plan.project, planSha256: receiptData.binding.planSha256 ?? null, timelineFormat: receiptData.binding.timelineFormat ?? null, auditionStatus: 'awaiting-human-listening'};
    const reviewBytes = Buffer.from(buildReviewHtml({title: '口播音频 A/B 审阅', baselineName: basename(baselineFinal), matchedName: basename(matchedFinal), metrics: {baseline: baselineMatchedLoudness, matchedProcessed: processedMatchedLoudness, processed: processedLoudness, baselineMatchGainDb: baselineSafetyGainDb + gainA, matchGainDb: gainB, commonTargetLufs, matchDifferenceDb}, feedbackBinding}), 'utf8');
    const currentPlanHash = await hashFile(absolutePlan);
    const currentInputHash = await hashFile(inputPath);
    const currentInputIdentity = await identity(inputPath);
    if (currentPlanHash !== planSha256 || currentInputHash !== plan.binding.mediaSha256 || currentInputIdentity.dev !== inputIdentity.dev || currentInputIdentity.ino !== inputIdentity.ino) fail('source-changed-during-processing', 'The audio-plan or input audio changed during processing; no result was published');
    for (const [path, hash] of bindingSnapshots) if (await hashFile(path) !== hash) fail('audio-binding-stale-during-processing', `Bound plan/timeline/receipt changed during processing: ${basename(path)}; no result was published`);
    const staged = [{source: finalStagePath, target: out}, {source: baselineStagePath, target: baselineFinal}, {source: matchPath, target: matchedFinal}, {bytes: receiptBytes, target: receiptFinal}, {bytes: reviewBytes, target: reviewFinal}];
    for (const item of staged) {
      const stagePath = join(outputDir, `.${basename(item.target)}.${runId}.stage`);
      if (item.source) await copyFile(item.source, stagePath, 1);
      else { const handle = await open(stagePath, 'wx', 0o600); try { await handle.writeFile(item.bytes); await handle.sync(); } finally { await handle.close(); } }
      stagedOutputs.push(stagePath);
      await publishNewFile(stagePath, item.target);
      outputsPublished.push(item.target);
    }
    return {output: out, outputs: finalPaths, receipt: receiptFinal, review: reviewFinal, receiptData};
  } catch (error) {
    await Promise.all(outputsPublished.map((path) => unlink(path).catch(() => {})));
    throw error;
  } finally {
    await Promise.all(stagedOutputs.map((path) => unlink(path).catch(() => {})));
    await rm(workDir, {recursive: true, force: true});
  }
}

export async function inspectWavFile(path) { return parseWavHeader(path); }

export async function verifySourceTreatment({audioPlanPath, processedPath, receiptPath, editPlan, source} = {}) {
  if (!audioPlanPath || !processedPath || !receiptPath || !editPlan || !source) fail('source-treatment-incomplete', 'A source treatment requires its audio-plan, processed WAV, receipt, edit plan, and source');
  const absolutePlanPath = resolve(audioPlanPath);
  const planBytes = await readFile(absolutePlanPath);
  const audioPlan = JSON.parse(planBytes.toString('utf8'));
  validateAudioPlan(audioPlan);
  const planHash = sha256(planBytes);
  if (audioPlan.binding.kind !== 'source' || audioPlan.binding.sourceId !== source.id) fail('source-treatment-binding', 'Source treatment is not bound to this exact edit-plan source id');
  if (source.sha256 !== audioPlan.binding.mediaSha256 || typeof source.mediaPath !== 'string') fail('source-treatment-source-hash', 'Edit-plan source hash/path does not match the source audio-plan');
  const originalInputPath = resolve(dirname(absolutePlanPath), audioPlan.binding.mediaPath);
  if (await hashFile(originalInputPath) !== source.sha256 || await hashFile(source.mediaPath) !== source.sha256) fail('source-treatment-source-hash', 'Original source media no longer matches the edit-plan and audio-plan hash');
  const absoluteProcessed = resolve(processedPath);
  const receiptBytes = await readFile(receiptPath);
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  if (receipt.format !== AUDIO_POSTPROCESS_FORMAT || receipt.audioPlanSha256 !== planHash || receipt.binding?.kind !== 'source' || receipt.binding?.sourceId !== source.id
    || receipt.input?.sha256 !== source.sha256 || receipt.auditionStatus !== 'not_auditioned' || receipt.timing?.latencyCalibration?.status !== 'passed') {
    fail('source-treatment-receipt', 'Source-treatment receipt does not prove a calibrated, unauditioned result for this source/audio-plan');
  }
  if (await hashFile(absoluteProcessed) !== receipt.output?.sha256 || basename(absoluteProcessed) !== receipt.output?.name) fail('source-treatment-output-hash', 'Processed source audio does not match its receipt hash/name');
  const shape = await parseWavHeader(absoluteProcessed);
  const primary = source.tracks?.find((track) => track.id === source.primaryAudioTrackId && track.kind === 'audio');
  if (!primary || primary.syncToPrimaryAudio?.status !== 'primary' || shape.sampleRateHz !== primary.clock?.sampleRateHz
    || (source.durationSamples !== null && shape.sampleCount !== source.durationSamples)
    || shape.sampleRateHz !== receipt.input?.sampleRateHz || shape.sampleCount !== receipt.input?.sampleCount || shape.channels !== receipt.input?.channels
    || shape.sampleRateHz !== receipt.output?.sampleRateHz || shape.sampleCount !== receipt.output?.sampleCount || shape.channels !== receipt.output?.channels) {
    fail('source-treatment-clock', 'Processed source does not preserve the edit-plan source sample clock, full duration, channels, and receipt shape');
  }
  if (shape.audioFormat !== 1 || shape.bitsPerSample !== 32 || receipt.output.sampleFormat !== 'pcm_s32le') fail('source-treatment-format', 'Processed source for ASRCUT must be the verified 32-bit PCM WAV produced by audio-postprocess');
  const inputIdentity = await identity(source.mediaPath);
  const processedIdentity = await identity(absoluteProcessed);
  return {
    audioPlanPath: absolutePlanPath,
    receiptPath: resolve(receiptPath),
    processedPath: absoluteProcessed,
    audioPlanSha256: planHash,
    receiptSha256: sha256(receiptBytes),
    inputSha256: source.sha256,
    outputSha256: receipt.output.sha256,
    sourceId: source.id,
    mediaPath: absoluteProcessed,
    sampleRateHz: shape.sampleRateHz,
    sampleCount: shape.sampleCount,
    channels: shape.channels,
    bitsPerSample: shape.bitsPerSample,
    sampleFormat: 's32',
    streamIndex: 0,
    originalIdentity: inputIdentity,
    processedIdentity,
  };
}

function parseArgs(argv) {
  const [command, ...args] = argv;
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith('--')) fail('invalid-argument', `Unexpected argument: ${args[index]}`);
    const key = args[index].slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) fail('invalid-argument', `Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return {command, options};
}

function usage() {
  return [
    'audio-postprocess.mjs create-plan --input <media.wav> --out <audio-plan.json> [--mode source] [--source-id <edit-plan-source-id>]',
    'audio-postprocess.mjs create-plan --input <cut.wav> --out <audio-plan.json> --mode compiled-timeline --edit-plan <frozen-plan.json> --timeline <timeline.json> --receipt <cut.wav.artifact.json>',
    'audio-postprocess.mjs process --plan <audio-plan.json> --out <new-processed.wav> [--tmp-dir <same-volume-dir>] [--ffmpeg <path>]',
  ].join('\n');
}

export async function runAudioCli(argv = process.argv.slice(2)) {
  const {command, options} = parseArgs(argv);
  const acceptedOptions = command === 'create-plan'
    ? ['input', 'out', 'mode', 'edit-plan', 'timeline', 'receipt', 'project-id', 'source-id']
    : command === 'process' ? ['plan', 'out', 'tmp-dir', 'ffmpeg'] : [];
  const unknownOptions = Object.keys(options).filter((key) => !acceptedOptions.includes(key));
  if (unknownOptions.length) fail('invalid-argument', `Unsupported ${command ?? 'command'} option(s): ${unknownOptions.map((key) => `--${key}`).join(', ')}`);
  if (command === 'create-plan') {
    if (!options.input || !options.out) fail('missing-argument', 'create-plan requires --input and --out');
    const result = await createAudioPlan({inputPath: options.input, outPath: options.out, mode: options.mode ?? 'source', editPlanPath: options['edit-plan'], timelinePath: options.timeline, receiptPath: options.receipt, projectId: options['project-id'] ?? null, sourceId: options['source-id'] ?? null});
    process.stdout.write(`${JSON.stringify({ok: true, command, output: result.path, planSha256: result.planSha256, mode: result.plan.binding.kind, inputSha256: result.plan.binding.mediaSha256}, null, 2)}\n`);
    return 0;
  }
  if (command === 'process') {
    if (!options.plan || !options.out) fail('missing-argument', 'process requires --plan and --out');
    const result = await processAudioPlan({planPath: options.plan, outPath: options.out, tmpDir: options['tmp-dir'], ffmpegPath: options.ffmpeg ?? process.env.FFMPEG_PATH ?? 'ffmpeg'});
    process.stdout.write(`${JSON.stringify({ok: true, command, output: result.output, receipt: result.receipt, review: result.review, sampleRateHz: result.receiptData.output.sampleRateHz, sampleCount: result.receiptData.output.sampleCount, auditionStatus: result.receiptData.auditionStatus, loudnessMatchDifferenceLufs: result.receiptData.comparison.differenceLufs}, null, 2)}\n`);
    return 0;
  }
  if (command === 'help' || command === '--help') { process.stdout.write(`${usage()}\n`); return 0; }
  fail('unknown-command', `Unknown audio-postprocess command: ${command ?? ''}\n${usage()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAudioCli().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${JSON.stringify({error: error.message, code: error.code ?? 'runtime-error', details: error.details}, null, 2)}\n`);
    process.exitCode = 1;
  });
}
