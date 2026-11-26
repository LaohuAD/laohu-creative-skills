#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir, mkdtemp, readFile, realpath, rm, rmdir, stat} from 'node:fs/promises';
import {basename, dirname, extname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {AsrcutError, assertSafeOutputPath, compilePlan, exportAudio, verifyPlanEvidence} from './asrcut.mjs';
import {inspectWavFile} from './audio-postprocess.mjs';
import {chooseStream, confirmFile, hashMediaFile, inspectMedia, mediaCliError, mediaCliOptions, mediaOptions,
  newMediaPath, probeFraction, publishMediaFiles, runFfmpeg, sha256Bytes, snapshotFile, syncWrite, writeNewMediaText} from './audio-probe.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const VIDEO_ARTIFACT_FORMAT = 'laohu.asrcut.video-artifact/1';
const SEAM_MANIFEST_FORMAT = 'laohu.asrcut.seams-manifest/1';
const PCM_BITS = {pcm_s16le: 16, pcm_s24le: 24, pcm_s32le: 32};
const DEFAULT_TMP = () => join(process.cwd(), '.cache/tmp/laohu-asrcut');

function fail(code, message, details) { throw new AsrcutError(code, message, details); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sourceUnits(timeline) { return timeline.units ?? timeline.clips.map((clip) => ({kind: 'source', ...clip})); }
function span(range) { return range.endSample - range.startSample; }

async function boundTimeline(planPath, timelinePath, {requireMediaExport = true} = {}) {
  if (!planPath || !timelinePath) fail('missing-argument', 'Media operation requires planPath and timelinePath');
  const [planFile, timelineFile] = await Promise.all([snapshotFile(planPath), snapshotFile(timelinePath)]);
  const [planBytes, timelineBytes] = await Promise.all([readFile(planFile.path), readFile(timelineFile.path)]);
  if (sha256Bytes(planBytes) !== planFile.sha256 || sha256Bytes(timelineBytes) !== timelineFile.sha256) {
    fail('media-changed-during-run', 'Plan or timeline changed while loading');
  }
  const plan = JSON.parse(planBytes);
  const timeline = JSON.parse(timelineBytes);
  const baseDir = dirname(planFile.path);
  if (plan.state !== 'frozen' || timeline.state !== 'frozen') fail('plan-not-frozen', 'Media operation requires the canonical frozen plan and timeline');
  if (requireMediaExport && plan.authorization?.mediaExport !== true) fail('export-not-authorized', 'Plan has no mediaExport authorization');
  await verifyPlanEvidence(plan, {baseDir});
  const canonical = JSON.parse(JSON.stringify(compilePlan(plan)));
  if (!isDeepStrictEqual(canonical, timeline)) fail('timeline-not-canonical', 'Timeline does not match the deterministic compilation of this frozen plan');
  if (requireMediaExport && plan.questions.some((question) => question.blocks.includes('mediaExport'))) {
    fail('export-blocked-by-question', 'Unresolved questions block this media operation');
  }
  if (!timeline.coverageComplete || plan.coverage.some((item) => item.disposition === 'unresolved') || !timeline.clips.length || !timeline.durationSamples) {
    fail('coverage-incomplete', 'Media operation requires a nonempty timeline with known, classified source coverage');
  }
  const protectedPaths = [planFile.path, timelineFile.path, ...plan.sources.flatMap((source) => [source.mediaPath, source.transcript.evidenceRef]
    .filter(Boolean).map((ref) => resolve(baseDir, ref)))];
  return {plan, timeline, baseDir, protectedPaths, planFile, timelineFile, timelineSha256: timelineFile.sha256};
}

async function confirmTimeline(binding) {
  await Promise.all([confirmFile(binding.planFile), confirmFile(binding.timelineFile), verifyPlanEvidence(binding.plan, {baseDir: binding.baseDir})]);
}

function audioClipIdentity(clip) {
  const {occurrenceId, sourceId, coverageId, sourceRange, targetRange} = clip;
  return {occurrenceId, sourceId, coverageId, sourceRange, targetRange};
}

function audioUnitIdentity(unit) {
  if (unit.kind === 'source') return {kind: unit.kind, ...audioClipIdentity(unit), timingPrecision: unit.timingPrecision};
  const {kind, id, decisionId, reason, sceneId, durationSamples, targetRange, visualHandoff, audioHandoff} = unit;
  return {kind, id, decisionId, reason, sceneId, durationSamples, targetRange, visualHandoff, audioHandoff};
}

async function boundCutAudio(binding, audioPath, receiptPath = null) {
  if (!audioPath) fail('missing-argument', 'Select the exported PCM WAV for the frozen timeline');
  const [wavFile, receiptFile] = await Promise.all([snapshotFile(audioPath), snapshotFile(receiptPath ?? `${resolve(audioPath)}.artifact.json`)]);
  const bytes = await readFile(receiptFile.path);
  if (sha256Bytes(bytes) !== receiptFile.sha256) fail('media-changed-during-run', 'Audio receipt changed while loading');
  const receipt = JSON.parse(bytes);
  const {timeline} = binding;
  const expectedFormat = `laohu.asrcut.audio-artifact/${timeline.units ? 2 : 1}`;
  if (receipt.format !== expectedFormat || !isDeepStrictEqual(receipt.project, timeline.project)
    || receipt.planSha256 !== timeline.planSha256 || receipt.timelineFormat !== timeline.format
    || (receipt.timelineSha256 !== undefined && receipt.timelineSha256 !== binding.timelineSha256)
    || !Array.isArray(receipt.clips) || !isDeepStrictEqual(receipt.clips.map(audioClipIdentity), timeline.clips.map(audioClipIdentity))
    || (timeline.units && (!Array.isArray(receipt.units) || !isDeepStrictEqual(receipt.units.map(audioUnitIdentity), timeline.units.map(audioUnitIdentity))))) {
    fail('audio-receipt-stale', 'WAV receipt does not match this project revision and canonical clip/presentation mapping');
  }
  if (!SHA256.test(receipt.outputSha256 ?? '') || receipt.outputSha256 !== wavFile.sha256) fail('audio-hash-stale', 'WAV bytes do not match their export receipt');
  const wave = await inspectWavFile(wavFile.path);
  if (wave.audioFormat !== 1 || PCM_BITS[receipt.sampleFormat] !== wave.bitsPerSample || wave.channels !== receipt.channels
    || wave.sampleCount !== receipt.sampleCount || wave.sampleRateHz !== receipt.sampleRateHz
    || wave.sampleCount !== timeline.durationSamples || wave.sampleRateHz !== timeline.clock.sampleRateHz) {
    fail('audio-clock-mismatch', 'Exported WAV PCM encoding, channel count or sample clock does not match the timeline and receipt');
  }
  return {wavFile, receiptFile, receipt, wave};
}

async function temporaryWorkspace(parent, tmpDir, outputs) {
  const outputInfo = await stat(parent);
  if (!outputInfo.isDirectory()) fail('output-directory-missing', 'Output parent must be a directory');
  const root = resolve(tmpDir ?? DEFAULT_TMP());
  const {canonical} = await assertSafeOutputPath(root, [], {replace: true});
  if (outputs.some((output) => {
    const suffix = relative(output, canonical);
    return !suffix || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`));
  })) fail('temp-output-alias', 'Temporary workspace must be outside all reserved output paths');
  await mkdir(root, {recursive: true});
  const resolvedRoot = await realpath(root);
  if ((await stat(resolvedRoot)).dev !== outputInfo.dev) fail('cross-volume-temp', 'Temporary workspace and output must be on the same volume');
  return mkdtemp(join(resolvedRoot, 'asrcut-media-'));
}

function seamRecords(timeline, receipt = null) {
  const rows = sourceUnits(timeline);
  const replacedTone = new Set((receipt?.roomToneReplacements ?? []).map((row) => row.presentationId));
  const seams = [];
  const ref = (unit) => unit.kind === 'source'
    ? {kind: 'source', sourceId: unit.sourceId, occurrenceId: unit.occurrenceId, sourceRange: unit.sourceRange}
    : {kind: 'presentation', id: unit.id, audio: replacedTone.has(unit.id) ? 'room-tone' : 'presentation-placeholder'};
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const next = rows[index];
    let kind;
    if (previous.kind === 'source' && next.kind === 'source') {
      if (previous.sourceId === next.sourceId && previous.sourceRange.endSample === next.sourceRange.startSample) continue;
      kind = previous.sourceId === next.sourceId ? 'source-discontinuity' : 'source-change';
    } else {
      if (previous.kind === 'presentation' && next.kind === 'presentation' && !replacedTone.has(previous.id) && !replacedTone.has(next.id)) continue;
      kind = `${previous.kind}-to-${next.kind}`;
    }
    seams.push({kind, targetSample: next.targetRange.startSample, previous: ref(previous), next: ref(next)});
  }
  return seams;
}

function waveDataHash(path, wave, startSample = 0, endSample = wave.sampleCount) {
  return hashRange(path, wave.dataOffset + startSample * wave.blockAlign, wave.dataOffset + endSample * wave.blockAlign);
}

async function hashRange(path, start, exclusiveEnd) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path, {start, end: exclusiveEnd - 1})) digest.update(chunk);
  return digest.digest('hex');
}

function audioRange(startSample, endSample, sampleRateHz) { return {startSample, endSample, sampleRateHz}; }

export async function extractSeams({planPath, timelinePath, audioPath, audioReceiptPath = null, outDir, tmpDir,
  ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg'} = {}) {
  if (!outDir) fail('missing-argument', 'extract-seams requires a new output directory');
  const binding = await boundTimeline(planPath, timelinePath);
  const audio = await boundCutAudio(binding, audioPath, audioReceiptPath);
  const output = await newMediaPath(outDir, [...binding.protectedPaths, audio.wavFile.path, audio.receiptFile.path]);
  const {sampleRateHz, sampleCount} = audio.wave;
  const radius = Math.round(1.25 * sampleRateHz);
  const work = await temporaryWorkspace(dirname(output), tmpDir, [output]);
  let outputOwned = false;
  const staged = [];
  try {
    const seams = [];
    for (const record of seamRecords(binding.timeline, audio.receipt)) {
      const startSample = Math.max(0, record.targetSample - radius);
      const endSample = Math.min(sampleCount, record.targetSample + radius);
      const id = `seam-${String(seams.length + 1).padStart(4, '0')}`;
      const file = `${id}.wav`;
      const path = join(work, file);
      await runFfmpeg(ffmpegPath, ['-n', '-protocol_whitelist', 'file,pipe', '-i', audio.wavFile.path, '-map', '0:a:0',
        '-af', `atrim=start_sample=${startSample}:end_sample=${endSample},asetpts=PTS-STARTPTS`, '-map_metadata', '-1', '-c:a', audio.receipt.sampleFormat, path], `Could not extract ${id}`);
      const slice = await inspectWavFile(path);
      if (slice.sampleCount !== endSample - startSample || slice.sampleRateHz !== sampleRateHz || slice.blockAlign !== audio.wave.blockAlign
        || await waveDataHash(path, slice) !== await waveDataHash(audio.wavFile.path, audio.wave, startSample, endSample)) {
        fail('seam-slice-mismatch', `${id} does not contain the exact source PCM sample window`);
      }
      seams.push({...record, id, file, wavSha256: await hashMediaFile(path), targetRange: audioRange(startSample, endSample, sampleRateHz),
        seamOffsetSamples: record.targetSample - startSample, sampleCount: slice.sampleCount,
        clippedAtTimelineStart: startSample === 0 && record.targetSample < radius,
        clippedAtTimelineEnd: endSample === sampleCount && sampleCount - record.targetSample < radius});
      staged.push({staged: path, target: join(output, file)});
    }
    const manifest = {format: SEAM_MANIFEST_FORMAT, project: binding.timeline.project, planSha256: binding.timeline.planSha256,
      timelineSha256: binding.timelineSha256, audioSha256: audio.wavFile.sha256, audioReceiptSha256: audio.receiptFile.sha256,
      sampleRateHz, radiusSamples: radius, auditionStatus: 'not_auditioned', seams};
    const name = 'seams-manifest.json';
    const manifestPath = join(work, name);
    await syncWrite(manifestPath, json(manifest));
    staged.push({staged: manifestPath, target: join(output, name)});
    await Promise.all([confirmTimeline(binding), confirmFile(audio.wavFile), confirmFile(audio.receiptFile)]);
    await mkdir(output);
    outputOwned = true;
    await publishMediaFiles(staged);
    return {output, manifest: join(output, name), manifestData: manifest};
  } catch (error) {
    if (outputOwned) await rmdir(output).catch(() => {});
    throw error;
  } finally { await rm(work, {recursive: true, force: true}).catch(() => {}); }
}

function gcd(a, b) { return b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b); }

function rational(numerator, denominator = 1) {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  const factor = gcd(n, d);
  return {n: n / factor, d: d / factor};
}

function addRational(a, b) { return rational(a.n * b.d + b.n * a.d, a.d * b.d); }
function subtractRational(a, b) { return addRational(a, {n: -b.n, d: b.d}); }
function compareRational(a, b) { return a.n * b.d - b.n * a.d; }
function seconds(value) { return Number(value.n) / Number(value.d); }
function rangeSeconds(range, side) { return rational(range[`${side}Sample`], range.sampleRateHz); }
function frameSeconds(frames, fps) { return rational(BigInt(frames) * BigInt(fps.denominator), fps.numerator); }

function frameAt(time, fps) {
  const numerator = time.n * BigInt(fps.numerator);
  const denominator = time.d * BigInt(fps.denominator);
  if (numerator < 0n) fail('negative-frame-time', 'Cannot quantize a negative track-local timestamp');
  const frame = Number((2n * numerator + denominator) / (2n * denominator));
  if (!Number.isSafeInteger(frame)) fail('frame-count-overflow', 'Frame time exceeds the supported integer range');
  return frame;
}

export function parseFrameRate(value) {
  const string = String(value ?? '');
  const pair = /^\d+$/.test(string) ? {numerator: Number(string), denominator: 1} : probeFraction(string);
  if (!pair?.numerator || pair.numerator > 1000000 || pair.denominator > 1000000 || pair.numerator / pair.denominator > 240) {
    fail('invalid-frame-rate', 'Frame rate must be a positive integer or exact ratio such as 30000/1001, at most 240 fps');
  }
  const reduced = rational(pair.numerator, pair.denominator);
  return {numerator: Number(reduced.n), denominator: Number(reduced.d)};
}

function sameRate(a, b) { return a.numerator * b.denominator === b.numerator * a.denominator; }
function ffRate(fps) { return `${fps.numerator}/${fps.denominator}`; }

function decimalSeconds(text) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(text ?? ''));
  if (!match) return null;
  const fractional = match[3] ?? '';
  return rational(BigInt(`${match[1]}${match[2]}${fractional}`), 10n ** BigInt(fractional.length));
}

function streamClock(stream, key, fallback = null) {
  const timebase = probeFraction(stream.time_base);
  const ticks = stream[key];
  if (timebase && Number.isSafeInteger(ticks)) return rational(BigInt(ticks) * BigInt(timebase.numerator), timebase.denominator);
  const label = key === 'duration_ts' ? 'duration' : 'start_time';
  return decimalSeconds(stream[label]) ?? fallback;
}

function videoTrack(source, selected) {
  const tracks = source.tracks.filter((track) => track.kind === 'video');
  if (selected === undefined && tracks.length === 1) return tracks[0];
  if (selected !== undefined) {
    const matches = tracks.filter((track) => track.streamIndex === selected);
    if (matches.length === 1) return matches[0];
    if (tracks.length === 1 && tracks[0].streamIndex === undefined) return tracks[0];
    fail('video-track-not-declared', `Source ${source.id} has no unique video track declared for stream ${selected}`);
  }
  if (!tracks.length) fail('video-track-not-declared', `Source ${source.id} needs a declared video track and a calibrated offset`);
  fail('video-track-ambiguous', `Source ${source.id} has several video tracks; select its exact stream index`);
}

function explicitOffset(track, sourceId) {
  const sync = track.syncToPrimaryAudio;
  const offset = sync?.offsetSeconds;
  if (sync?.status !== undefined || !['measured', 'estimated'].includes(sync?.precision) || !Number.isSafeInteger(offset?.numerator)
    || !Number.isSafeInteger(offset?.denominator) || offset.denominator <= 0) {
    fail('video-sync-unknown', `Video track ${track.id} on source ${sourceId} lacks a known offset to its primary audio clock`);
  }
  return {offset: rational(offset.numerator, offset.denominator), sync};
}

function videoDetails(source, probe, selected, fallbackDuration = null) {
  const track = videoTrack(source, selected);
  const {offset, sync} = explicitOffset(track, source.id);
  if (track.streamIndex === undefined) {
    const unambiguous = chooseStream(probe.streams, 'video', null, source.id);
    if (selected !== undefined && selected !== unambiguous.index) fail('video-track-not-declared', `Source ${source.id} sync is bound to the sole video stream`);
  }
  const stream = chooseStream(probe.streams, 'video', selected ?? track.streamIndex, source.id);
  const timebase = probeFraction(stream.time_base);
  const declaredClock = track.clock?.timebase;
  if (!timebase || track.clock?.unit !== 'pts' || (declaredClock && !sameRate(declaredClock, timebase))) {
    fail('video-clock-mismatch', `Video source ${source.id} decoded PTS clock differs from its declared track`);
  }
  const fps = probeFraction(stream.avg_frame_rate) ?? probeFraction(stream.r_frame_rate);
  const audioStart = decimalSeconds(probe.format?.start_time) ?? rational(0);
  const start = streamClock(stream, 'start_pts', audioStart);
  const streamEnd = streamClock(stream, 'duration_ts');
  const containerEnd = decimalSeconds(probe.format?.duration);
  const duration = streamEnd
    ?? (containerEnd ? subtractRational(addRational(audioStart, containerEnd), start) : null)
    ?? (fallbackDuration && fallbackDuration.n > 0n ? fallbackDuration : null);
  if (!fps || !duration || duration.n <= 0n || !Number.isSafeInteger(stream.width) || stream.width < 1 || !Number.isSafeInteger(stream.height) || stream.height < 1) {
    fail('video-clock-unknown', `Video source ${source.id} has no usable frame rate, dimensions or stream extent`);
  }
  const videoStreams = probe.streams.filter((item) => item.codec_type === 'video' && !item.disposition?.attached_pic);
  const srcID = videoStreams.findIndex((item) => item.index === stream.index) + 1;
  const rotation = stream.side_data_list?.find((row) => Number.isFinite(row.rotation))?.rotation ?? 0;
  const quarterTurn = Math.abs(rotation) % 180 === 90;
  const sar = probeFraction(String(stream.sample_aspect_ratio ?? '').replace(':', '/')) ?? {numerator: 1, denominator: 1};
  const displayWidth = stream.width * sar.numerator / sar.denominator;
  return {stream, srcID, trackId: track.id, offset, sync, fps, timebase, start, duration,
    startPts: Number.isSafeInteger(stream.start_pts) ? stream.start_pts : null,
    width: quarterTurn ? stream.height : displayWidth, height: quarterTurn ? displayWidth : stream.height};
}

async function retainedMedia(binding, videoStreams, ffprobePath, {allowAudioOnly = false} = {}) {
  const sourceIds = [...new Set(binding.timeline.clips.map((clip) => clip.sourceId))];
  for (const key of Object.keys(videoStreams)) {
    if (!sourceIds.includes(key)) fail('unknown-video-source', `No retained source matches the video stream selection ${key}`);
  }
  const sources = new Map();
  for (const sourceId of sourceIds) {
    const source = binding.plan.sources.find((row) => row.id === sourceId);
    if (!source?.mediaPath || !SHA256.test(source.sha256 ?? '')) fail('media-evidence-missing', `Source ${sourceId} needs a linked media path and SHA-256`);
    const snapshot = await snapshotFile(resolve(binding.baseDir, source.mediaPath));
    if (snapshot.sha256 !== source.sha256) fail('source-hash-stale', `Source ${sourceId} no longer matches its imported media hash`);
    const probe = await inspectMedia(snapshot.path, ffprobePath);
    const primary = source.tracks.find((track) => track.kind === 'audio' && track.id === source.primaryAudioTrackId && track.syncToPrimaryAudio?.status === 'primary');
    if (!primary) fail('primary-audio-missing', `Source ${sourceId} has no declared primary audio track`);
    const audio = chooseStream(probe.streams, 'audio', primary.streamIndex, sourceId);
    const rate = Number(audio.sample_rate);
    if (!Number.isSafeInteger(rate) || rate !== primary.clock?.sampleRateHz || primary.clock.unit !== 'sample') {
      fail('source-clock-mismatch', `Primary audio on ${sourceId} does not match the declared sample rate`);
    }
    const audioDuration = streamClock(audio, 'duration_ts');
    if (audioDuration && Math.abs(seconds(audioDuration) * rate - source.durationSamples) > 1) fail('source-duration-mismatch', `Source ${sourceId} PCM duration differs from the declared primary clock`);
    const origins = probe.streams.map((stream) => streamClock(stream, 'start_pts')).filter(Boolean);
    const assetOrigin = decimalSeconds(probe.format?.start_time) ?? origins.reduce((earliest, origin) => compareRational(origin, earliest) < 0n ? origin : earliest, rational(0));
    const audioStreams = probe.streams.filter((stream) => stream.codec_type === 'audio');
    const audioOrigin = streamClock(audio, 'start_pts', assetOrigin);
    const audioOrdinal = audioStreams.findIndex((stream) => stream.index === audio.index) + 1;
    const containsVideo = probe.streams.some((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
    const selected = Object.hasOwn(videoStreams, sourceId) ? videoStreams[sourceId] : undefined;
    const audioDurationFallback = rational(source.durationSamples, rate);
    const video = allowAudioOnly && !containsVideo && selected === undefined && !source.tracks.some((track) => track.kind === 'video')
      ? null : videoDetails(source, probe, selected, audioDurationFallback);
    if (video && binding.plan.questions.some((question) => question.blocks.includes('crossTrackSync') && (question.sourceId == null || question.sourceId === sourceId))) {
      fail('video-sync-unresolved', `Open cross-track synchronization question blocks source ${sourceId}`);
    }
    sources.set(sourceId, {source, snapshot, assetOrigin, audio: {stream: audio, srcID: audioOrdinal, trackId: primary.id, rate,
      start: audioOrigin, duration: rational(source.durationSamples, rate), streamCount: audioStreams.length}, video, probe});
  }
  return sources;
}

function dimensions(sources, width, height) {
  const firstVideo = [...sources.values()].find((source) => source.video)?.video;
  if ((width === undefined) !== (height === undefined)) fail('invalid-video-size', 'Select both width and height together');
  width ??= firstVideo ? Math.max(2, 2 * Math.round(firstVideo.width / 2)) : 1920;
  height ??= firstVideo ? Math.max(2, 2 * Math.round(firstVideo.height / 2)) : 1080;
  if ([width, height].some((value) => !Number.isSafeInteger(value) || value < 2 || value > 16384 || value % 2 !== 0)) {
    fail('invalid-video-size', 'Width and height must be even integers between 2 and 16384');
  }
  return {width, height};
}

function frameRows(timeline, sources, fps) {
  return sourceUnits(timeline).map((unit) => {
    const startFrame = frameAt(rangeSeconds(unit.targetRange, 'start'), fps);
    const endFrame = frameAt(rangeSeconds(unit.targetRange, 'end'), fps);
    const frameCount = endFrame - startFrame;
    const row = {unit, startFrame, endFrame, frameCount};
    if (unit.kind === 'presentation') return row;
    const media = sources.get(unit.sourceId);
    if (!media.video) return {...row, media};
    const {video} = media;
    const sourceStart = subtractRational(rangeSeconds(unit.sourceRange, 'start'), video.offset);
    const sourceEnd = subtractRational(rangeSeconds(unit.sourceRange, 'end'), video.offset);
    const tolerance = rational(video.timebase.numerator, video.timebase.denominator);
    if (sourceStart.n < 0n || compareRational(sourceEnd, addRational(video.duration, tolerance)) > 0n) {
      fail('video-source-bounds', `Synchronized video range for occurrence ${unit.occurrenceId} falls outside the selected video track`);
    }
    const total = frameAt(video.duration, fps);
    if (frameCount && total < 1) fail('video-source-bounds', `Occurrence ${unit.occurrenceId} selects no decodable video frame at the output rate`);
    const sourceStartFrame = Math.min(Math.max(0, total - 1), frameAt(sourceStart, fps));
    const sourceEndFrame = Math.min(total, frameAt(sourceEnd, fps));
    const keepFrames = frameCount ? Math.min(frameCount, Math.max(1, sourceEndFrame - sourceStartFrame)) : 0;
    const holdFrames = frameCount - keepFrames;
    if (holdFrames > 1) fail('video-frame-mapping', `Occurrence ${unit.occurrenceId} would require more than one frame of end hold to satisfy the timeline`);
    return {...row, media, sourceStart, sourceEnd, sourceStartFrame, keepFrames, holdFrames};
  });
}

async function renderPart(row, path, fps, {width, height}, ffmpegPath) {
  const rate = ffRate(fps);
  const args = ['-n'];
  if (row.unit.kind === 'presentation') {
    args.push('-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=${rate}`, '-map', '0:v:0');
  } else {
    const {snapshot, video, assetOrigin} = row.media;
    const sourceStartSec = (row.sourceStartFrame * fps.denominator) / fps.numerator;
    const streamShiftSec = Math.max(0, seconds(subtractRational(video.start, assetOrigin)));
    const useFastSeek = sourceStartSec > 15;
    if (useFastSeek) {
      const seekSec = Math.max(0, sourceStartSec + streamShiftSec);
      const pipeline = [
        'setpts=PTS-STARTPTS', `fps=fps=${rate}:start_time=0:round=near`,
        `trim=start_frame=0:end_frame=${row.keepFrames}`,
        'setpts=PTS-STARTPTS', 'scale=w=max(2\\,trunc(iw*sar/2)*2):h=max(2\\,trunc(ih/2)*2)', 'setsar=1',
        `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`, 'setsar=1', 'format=yuv420p',
      ];
      if (row.holdFrames) pipeline.push(`tpad=stop_mode=clone:stop=${row.holdFrames}`);
      args.push('-protocol_whitelist', 'file,pipe', '-ss', seekSec.toFixed(6), '-i', snapshot.path, '-map', `0:${video.stream.index}`, '-vf', pipeline.join(','));
    } else {
      const pipeline = [
        'setpts=PTS-STARTPTS', `fps=fps=${rate}:start_time=0:round=near`,
        `trim=start_frame=${row.sourceStartFrame}:end_frame=${row.sourceStartFrame + row.keepFrames}`,
        'setpts=PTS-STARTPTS', 'scale=w=max(2\\,trunc(iw*sar/2)*2):h=max(2\\,trunc(ih/2)*2)', 'setsar=1',
        `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`, 'setsar=1', 'format=yuv420p',
      ];
      if (row.holdFrames) pipeline.push(`tpad=stop_mode=clone:stop=${row.holdFrames}`);
      args.push('-protocol_whitelist', 'file,pipe', '-i', snapshot.path, '-map', `0:${video.stream.index}`, '-vf', pipeline.join(','));
    }
  }
  args.push('-frames:v', String(row.frameCount), '-an', '-sn', '-dn', '-map_metadata', '-1', '-c:v', 'libx264', '-preset', 'veryfast',
    '-crf', '17', '-bf', '0', '-pix_fmt', 'yuv420p', '-r', rate, '-fps_mode', 'cfr', '-video_track_timescale', String(fps.numerator), path);
  await runFfmpeg(ffmpegPath, args, `Could not render ${row.unit.occurrenceId ?? row.unit.id}`);
}

function exactMovieScale(fps, rate) {
  const result = BigInt(fps.numerator) * BigInt(rate) / gcd(BigInt(fps.numerator), BigInt(rate));
  if (result > 2147483647n) fail('movie-timescale-overflow', 'The frame and sample clocks have no supported exact common MOV time scale');
  return String(result);
}

async function muxVideo(partPaths, audio, out, fps, work, ffmpegPath) {
  const concatPath = join(work, 'video-parts.ffconcat');
  await syncWrite(concatPath, `ffconcat version 1.0\n${partPaths.map((part) => `file '${basename(part)}'`).join('\n')}\n`);
  // Rebuild continuous packet timestamps after the concat demuxer's microsecond offsets.
  const timestamps = `setts=pts=N*${fps.denominator}:dts=N*${fps.denominator}:duration=${fps.denominator}:time_base=1/${fps.numerator}`;
  await runFfmpeg(ffmpegPath, ['-n', '-f', 'concat', '-safe', '1', '-i', concatPath, '-protocol_whitelist', 'file,pipe', '-i', audio.wavFile.path,
    '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '-1', '-map_chapters', '-1', '-c:v', 'copy', '-c:a', 'copy', '-bsf:v', timestamps,
    '-video_track_timescale', String(fps.numerator), '-movie_timescale', exactMovieScale(fps, audio.wave.sampleRateHz),
    '-use_editlist', '0', '-movflags', '+faststart', out], 'Could not mux the frame-aligned video and PCM');
}

async function verifyMux(out, fps, frameCount, resolution, audio, work, ffmpegPath, ffprobePath) {
  const probe = await inspectMedia(out, ffprobePath);
  const video = chooseStream(probe.streams, 'video', null, out);
  const stream = chooseStream(probe.streams, 'audio', null, out);
  const videoTB = probeFraction(video.time_base);
  const audioTB = probeFraction(stream.time_base);
  const observedFps = probeFraction(video.avg_frame_rate);
  if (Number(video.nb_frames) !== frameCount || !videoTB || !sameRate(videoTB, {numerator: 1, denominator: fps.numerator})
    || BigInt(video.duration_ts ?? -1) !== BigInt(frameCount) * BigInt(fps.denominator) || Number(video.start_pts) !== 0
    || !observedFps || !sameRate(observedFps, fps) || video.width !== resolution.width || video.height !== resolution.height) {
    fail('rendered-frame-clock-mismatch', 'Rendered video frame count, duration, rate, origin or dimensions differ from the quantized timeline');
  }
  if (Number(stream.sample_rate) !== audio.wave.sampleRateHz || stream.channels !== audio.wave.channels || stream.codec_name !== audio.receipt.sampleFormat
    || !audioTB || !sameRate(audioTB, {numerator: 1, denominator: audio.wave.sampleRateHz}) || Number(stream.duration_ts) !== audio.wave.sampleCount
    || Number(stream.start_pts) !== 0) fail('rendered-audio-clock-mismatch', 'MOV did not preserve the trusted PCM stream sample clock, channels or encoding');
  const digestFile = join(work, 'audio-pcm-sha256.txt');
  await runFfmpeg(ffmpegPath, ['-n', '-i', out, '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-hash', 'sha256', digestFile], 'Could not verify muxed PCM bytes');
  const reported = /^SHA256=([a-f0-9]{64})$/i.exec((await readFile(digestFile, 'utf8')).trim())?.[1]?.toLowerCase();
  if (reported !== await waveDataHash(audio.wavFile.path, audio.wave)) fail('rendered-audio-hash-mismatch', 'MOV PCM packets differ from the exact WAV audio samples');
  return reported;
}

function videoReceiptRow(row) {
  const {unit, startFrame, endFrame, frameCount} = row;
  const frameRange = {startFrame, endFrame, frameCount};
  if (unit.kind === 'presentation') {
    return {...audioUnitIdentity(unit), frameRange, picture: frameCount ? 'black-placeholder' : 'below-one-target-frame'};
  }
  const {video} = row.media;
  return {kind: unit.kind, ...audioClipIdentity(unit), frameRange,
    picture: frameCount ? 'selected-source-video' : 'below-one-target-frame',
    videoTrackId: video.trackId, videoStreamIndex: video.stream.index, syncToPrimaryAudio: video.sync,
    sourceVideoFrameClock: {basis: 'first-decoded-picture-frame', startPts: video.startPts, timeBase: video.timebase},
    videoTrackLocalSeconds: {start: seconds(row.sourceStart), end: seconds(row.sourceEnd)},
    sampledStartFrame: row.sourceStartFrame, sampledFrameCount: row.keepFrames, endHoldFrames: row.holdFrames};
}

export async function exportVideo({planPath, timelinePath, outPath, fps: rate, width, height, videoStreams = {}, tmpDir,
  audioPath = null, audioReceiptPath = null, audioPlanPath = null, processedSourcePath = null, seamFadeMs, seamCrossfadeMs,
  ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg', ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe'} = {}) {
  if (extname(outPath ?? '').toLowerCase() !== '.mov') fail('unsupported-output-format', 'Video export requires a new .mov file to preserve PCM');
  const reuseAudio = Boolean(audioPath);
  const treatmentPaths = [audioPlanPath, processedSourcePath, audioReceiptPath].filter(Boolean);
  if (reuseAudio && (audioPlanPath || processedSourcePath || seamFadeMs !== undefined || seamCrossfadeMs !== undefined)) {
    fail('conflicting-audio-options', 'Use the receipt-bound WAV as supplied, or render the WAV with source treatment and seam fade/crossfade options');
  }
  if (!reuseAudio && treatmentPaths.length !== 0 && treatmentPaths.length !== 3) fail('source-treatment-incomplete', 'Use all three continuous source treatment paths');
  const fps = parseFrameRate(rate);
  const binding = await boundTimeline(planPath, timelinePath);
  const audioInputPaths = reuseAudio ? [audioPath, audioReceiptPath ?? `${resolve(audioPath)}.artifact.json`] : treatmentPaths;
  const inputs = [...binding.protectedPaths, ...audioInputPaths];
  const output = await newMediaPath(outPath, inputs);
  const receipt = await newMediaPath(`${output}.video-artifact.json`, [output, ...inputs]);
  const sources = await retainedMedia(binding, videoStreams, ffprobePath);
  const resolution = dimensions(sources, width, height);
  const rows = frameRows(binding.timeline, sources, fps);
  const frameCount = rows.at(-1).endFrame;
  if (frameCount < 1) fail('empty-frame-export', 'The entire timeline is shorter than one quantized video frame');
  const work = await temporaryWorkspace(dirname(output), tmpDir, [output, receipt]);
  const stageVideo = join(work, 'joined.mov');
  const stageReceipt = join(work, 'joined.video-artifact.json');
  try {
    const audioSnapshots = reuseAudio ? [] : await Promise.all(audioInputPaths.map(snapshotFile));
    let audio;
    if (reuseAudio) audio = await boundCutAudio(binding, audioPath, audioReceiptPath);
    else {
      const result = await exportAudio({plan: binding.plan, timeline: binding.timeline, timelineSha256: binding.timelineSha256,
        outPath: join(work, 'audio.wav'), tmpDir: work, baseDir: binding.baseDir, ffmpegPath, ffprobePath,
        audioPlanPath, processedSourcePath, audioReceiptPath, seamFadeMs, seamCrossfadeMs});
      audio = await boundCutAudio(binding, result.output, result.receipt);
    }
    const parts = [];
    for (const row of rows) {
      if (!row.frameCount) continue;
      const path = join(work, `part-${String(parts.length + 1).padStart(5, '0')}.mov`);
      await renderPart(row, path, fps, resolution, ffmpegPath);
      parts.push(path);
    }
    await muxVideo(parts, audio, stageVideo, fps, work, ffmpegPath);
    const audioPcmSha256 = await verifyMux(stageVideo, fps, frameCount, resolution, audio, work, ffmpegPath, ffprobePath);
    const timingError = subtractRational(frameSeconds(frameCount, fps), rational(audio.wave.sampleCount, audio.wave.sampleRateHz));
    const receiptData = {format: VIDEO_ARTIFACT_FORMAT, project: binding.timeline.project, planSha256: binding.timeline.planSha256,
      timelineSha256: binding.timelineSha256, output: basename(output), outputSha256: await hashMediaFile(stageVideo), fps, ...resolution,
      frameCount, quantization: 'nearest-frame-from-each-absolute-target-sample-boundary', finalVideoMinusAudioSeconds: seconds(timingError),
      audio: {sampleRateHz: audio.wave.sampleRateHz, sampleCount: audio.wave.sampleCount, channels: audio.wave.channels,
        sampleFormat: audio.receipt.sampleFormat, pcmSha256: audioPcmSha256, wavSha256: audio.wavFile.sha256, receiptSha256: audio.receiptFile.sha256,
        workflow: reuseAudio ? 'reused-bound-pcm' : 'rendered-from-frozen-plan', audioTreatment: audio.receipt.audioTreatment ?? null,
        seamFadeMs: audio.receipt.seamFadeMs ?? 0, ...(audio.receipt.seamCrossfadeMs !== undefined ? {seamCrossfadeMs: audio.receipt.seamCrossfadeMs} : {}), roomToneReplacements: audio.receipt.roomToneReplacements ?? []},
      units: rows.map(videoReceiptRow), auditionStatus: 'not_auditioned', viewingStatus: 'not_viewed'};
    await syncWrite(stageReceipt, json(receiptData));
    await Promise.all([confirmTimeline(binding), confirmFile(audio.wavFile), confirmFile(audio.receiptFile),
      ...audioSnapshots.map(confirmFile), ...[...sources.values()].map(({snapshot}) => confirmFile(snapshot))]);
    await publishMediaFiles([{staged: stageVideo, target: output}, {staged: stageReceipt, target: receipt}]);
    return {output, receipt, receiptData};
  } finally { await rm(work, {recursive: true, force: true}).catch(() => {}); }
}

function editorMarkers(plan, timeline) {
  const rows = [];
  const add = (kind, name, targetSample, endSample = targetSample, fields = {}) => rows.push({kind, name, targetSample, endSample, ...fields});
  if (plan.pacingProfile) add('pacing-profile', `Pacing profile: ${plan.pacingProfile}`, 0, 0, {pacingProfile: plan.pacingProfile});
  const coverage = new Map(plan.coverage.map((row) => [row.id, row]));
  for (const seam of seamRecords(timeline)) {
    const {previous, next, targetSample} = seam;
    const sameSource = previous.kind === 'source' && next.kind === 'source' && previous.sourceId === next.sourceId;
    const gapFrom = previous.sourceRange?.endSample;
    const gapTo = next.sourceRange?.startSample;
    const neighbors = [previous.occurrenceId, next.occurrenceId].filter(Boolean);
    const matching = plan.decisions.filter((decision) => decision.visualSeamRisk && (decision.keptOccurrenceIds?.some((id) => neighbors.includes(id))
      || (sameSource && gapFrom < gapTo && decision.coverageIds?.some((id) => {
        const item = coverage.get(id);
        return item?.sourceId === previous.sourceId && item.sourceRange.startSample < gapTo && item.sourceRange.endSample > gapFrom;
      }))));
    if (matching.length) {
      for (const decision of matching) add('visual-seam-risk', `${decision.visualSeamRisk}${decision.visualMaskHint ? ` · ${decision.visualMaskHint}` : ''}`,
        targetSample, targetSample, {decisionId: decision.id, visualSeamRisk: decision.visualSeamRisk, visualMaskHint: decision.visualMaskHint ?? null, seamKind: seam.kind});
    } else add('seam', `ASRcut ${seam.kind}`, targetSample);
  }
  // An editorial risk can belong to a source occurrence even if there is no outgoing cut.
  for (const decision of plan.decisions.filter((item) => item.visualSeamRisk && !rows.some((row) => row.decisionId === item.id))) {
    const direct = timeline.clips.find((clip) => decision.keptOccurrenceIds?.includes(clip.occurrenceId) || decision.coverageIds?.includes(clip.coverageId));
    if (direct) add('visual-seam-risk', `${decision.visualSeamRisk}${decision.visualMaskHint ? ` · ${decision.visualMaskHint}` : ''}`,
      direct.targetRange.startSample, direct.targetRange.startSample,
      {decisionId: decision.id, visualSeamRisk: decision.visualSeamRisk, visualMaskHint: decision.visualMaskHint ?? null});
  }
  for (const annotation of timeline.annotations ?? []) {
    const name = [annotation.userNote, annotation.analysisNote].filter(Boolean).join(' · ') || `Annotation ${annotation.id}`;
    for (const {occurrenceId, targetRange} of annotation.resolvedTargets ?? []) {
      add('annotation', name, targetRange.startSample, targetRange.endSample, {annotationId: annotation.id, occurrenceId});
    }
  }
  for (const unit of (timeline.units ?? []).filter((item) => item.kind === 'presentation')) {
    add('presentation', `Presentation ${unit.id} · ${unit.reason}`, unit.targetRange.startSample, unit.targetRange.endSample, {presentationId: unit.id});
  }
  return rows.sort((a, b) => a.targetSample - b.targetSample);
}

function embeddedTimecode(media) {
  if (!media.video) return rational(0);
  const tag = media.video.stream.tags?.timecode ?? media.probe.format?.tags?.timecode
    ?? media.probe.streams.find((item) => item.codec_tag_string === 'tmcd')?.tags?.timecode;
  if (tag === undefined) return rational(0);
  const fields = /^(\d{2}):(\d{2}):(\d{2})([:;])(\d{2})$/.exec(tag);
  const fps = media.video.fps;
  const nominal = Math.round(fps.numerator / fps.denominator);
  if (!fields) fail('unsupported-source-timecode', `Source ${media.source.id} carries an unrecognized embedded timecode`);
  const [hours, minutes, sec, delimiter, subframe] = fields.slice(1);
  const [h, m, s, f] = [hours, minutes, sec, subframe].map(Number);
  if (h > 23 || m > 59 || s > 59 || f >= nominal) fail('unsupported-source-timecode', `Source ${media.source.id} carries an invalid embedded timecode`);
  let frames = ((h * 60 + m) * 60 + s) * nominal + f;
  if (delimiter === ';') {
    if (fps.denominator !== 1001 || ![30000, 60000].includes(fps.numerator)) fail('unsupported-source-timecode', 'Drop-frame timecode must use a 30000/1001 or 60000/1001 source clock');
    const drop = nominal / 15;
    if (m % 10 !== 0 && s === 0 && f < drop) fail('unsupported-source-timecode', 'Source drop-frame timecode names a skipped frame');
    frames -= drop * (h * 60 + m - Math.floor((h * 60 + m) / 10));
  }
  return frameSeconds(frames, fps);
}

function nleOrigin(media, kind) {
  return addRational(embeddedTimecode(media), subtractRational(media[kind].start, media.assetOrigin));
}

function nleVideoStart(row) {
  const nativeFrame = frameAt(row.sourceStart, row.media.video.fps);
  return addRational(nleOrigin(row.media, 'video'), frameSeconds(nativeFrame, row.media.video.fps));
}

function nleAudioStart(row) {
  return addRational(nleOrigin(row.media, 'audio'), rangeSeconds(row.unit.sourceRange, 'start'));
}

function xml(value) {
  return String(value).replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '')
    .replace(/[&<>"'\n\r\t]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\n': '&#10;', '\r': '&#13;', '\t': '&#9;'})[c]);
}

function xmlTime({n, d}) {
  if (d > 2147483647n || n < -(2n ** 63n) || n >= 2n ** 63n) fail('fcpxml-time-overflow', 'Time does not fit FCPXML rational limits');
  return d === 1n ? `${n}s` : `${n}/${d}s`;
}

function clipName(row) {
  return row.unit.kind === 'presentation' ? `Presentation ${row.unit.id}` : `${basename(row.media.snapshot.path)} · ${row.unit.occurrenceId}`;
}

function markersByFrame(rows, markers, fps, rate) {
  const painted = rows.filter((row) => row.frameCount > 0);
  const endFrame = painted.at(-1)?.endFrame ?? 0;
  const result = new Map();
  for (const marker of markers) {
    const frame = Math.min(endFrame - 1, frameAt(rational(marker.targetSample, rate), fps));
    const row = painted.find((range) => frame >= range.startFrame && frame < range.endFrame);
    if (!row) continue;
    if (!result.has(row)) result.set(row, []);
    result.get(row).push({...marker, frame, localFrame: frame - row.startFrame});
  }
  return result;
}

function fcpxml({binding, sources, rows, fps, resolution, markers}) {
  const assets = new Map([...sources.values()].map((media, index) => [media.source.id, {asset: `a${index + 1}`, format: `f${index + 1}`} ]));
  const sampleRateHz = binding.timeline.clock.sampleRateHz;
  const markerTargets = markersByFrame(rows, markers, fps, sampleRateHz);
  const frameTime = (count) => xmlTime(frameSeconds(count, fps));
  const resourceLines = [...sources.values()].map((media) => {
    const {asset, format} = assets.get(media.source.id);
    const {video, audio, assetOrigin} = media;
    const timecode = embeddedTimecode(media);
    const audioEnd = addRational(subtractRational(audio.start, assetOrigin), audio.duration);
    const videoEnd = video ? addRational(subtractRational(video.start, assetOrigin), video.duration) : audioEnd;
    const duration = compareRational(audioEnd, videoEnd) >= 0n ? audioEnd : videoEnd;
    const videoCount = media.probe.streams.filter((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic).length;
    const basenameXml = xml(basename(media.snapshot.path));
    return `${video ? `    <format id="${format}" frameDuration="${xmlTime(frameSeconds(1, video.fps))}" width="${video.stream.width}" height="${video.stream.height}"/>\n` : ''}`
      + `    <asset id="${asset}" name="${basenameXml}" start="${xmlTime(timecode)}" duration="${xmlTime(duration)}" hasAudio="1" audioSources="${audio.streamCount}" audioChannels="${audio.stream.channels}" audioRate="${audio.rate}"`
      + `${video ? ` hasVideo="1" videoSources="${videoCount}" format="${format}"` : ''}>\n`
      + `      <media-rep kind="original-media" src="${xml(pathToFileURL(media.snapshot.path).href)}"/>\n    </asset>`;
  });
  const spine = rows.filter((row) => row.frameCount).map((row) => {
    const timing = `name="${xml(clipName(row))}" offset="${frameTime(row.startFrame)}" start="0s" duration="${frameTime(row.frameCount)}"`;
    const markersXml = (markerTargets.get(row) ?? []).map((marker) => `          <marker start="${frameTime(marker.localFrame)}" duration="${frameTime(1)}" value="${xml(marker.name)}" note="${xml(`Target sample ${marker.targetSample}`)}"/>`).join('\n');
    if (row.unit.kind === 'presentation') return `        <gap ${timing}>\n${markersXml}\n        </gap>`;
    const {asset} = assets.get(row.media.source.id);
    const {audio, video} = row.media;
    const projectDuration = frameSeconds(row.frameCount, fps);
    const sourceAudioDuration = rational(span(row.unit.sourceRange), row.unit.sourceRange.sampleRateHz);
    const audioDuration = compareRational(sourceAudioDuration, projectDuration) < 0n ? sourceAudioDuration : projectDuration;
    const audioXml = `          <audio ref="${asset}" srcID="${audio.srcID}"${video ? ' lane="-1"' : ''} offset="0s" start="${xmlTime(nleAudioStart(row))}" duration="${xmlTime(audioDuration)}" role="dialogue"/>`;
    if (!video) return `        <clip ${timing}>\n${audioXml}\n${markersXml}\n        </clip>`;
    const videoXml = `          <video ref="${asset}" srcID="${video.srcID}" offset="0s" start="${xmlTime(nleVideoStart(row))}" duration="${frameTime(row.frameCount)}"/>`;
    return `        <clip ${timing}>\n${videoXml}\n${audioXml}\n${markersXml}\n        </clip>`;
  });
  const audioRates = {32000: '32k', 44100: '44.1k', 48000: '48k', 88200: '88.2k', 96000: '96k', 176400: '176.4k', 192000: '192k'};
  const audioRate = audioRates[sampleRateHz];
  const channels = Math.max(...[...sources.values()].map(({audio}) => audio.stream.channels));
  const project = xml(binding.timeline.project.id);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10">\n  <resources>\n`
    + `    <format id="projectFormat" frameDuration="${frameTime(1)}" width="${resolution.width}" height="${resolution.height}"/>\n${resourceLines.join('\n')}\n  </resources>\n`
    + `  <event name="ASRcut">\n    <project name="${project}">\n      <sequence format="projectFormat" duration="${frameTime(rows.at(-1).endFrame)}" tcStart="0s" tcFormat="NDF" audioLayout="${channels === 1 ? 'mono' : channels === 2 ? 'stereo' : 'surround'}"${audioRate ? ` audioRate="${audioRate}"` : ''}>\n`
    + `        <spine>\n${spine.join('\n')}\n        </spine>\n        <metadata><md key="com.laohu.asrcut.planSha256" value="${binding.timeline.planSha256}"/><md key="com.laohu.asrcut.timelineSha256" value="${binding.timelineSha256}"/></metadata>\n`
    + `      </sequence>\n    </project>\n  </event>\n</fcpxml>\n`;
}

function otioTime(value, rate) { return {'OTIO_SCHEMA': 'RationalTime.1', rate, value}; }
function otioRange(startTime, duration) { return {'OTIO_SCHEMA': 'TimeRange.1', start_time: startTime, duration}; }
function otioNode(schema, name, metadata, fields = {}) { return {OTIO_SCHEMA: schema, metadata, name, ...fields}; }

function otioGap(row, duration) {
  return otioNode('Gap.1', clipName(row), {asrcut: {kind: row.unit.kind, presentationId: row.unit.id ?? null,
    targetRange: row.unit.targetRange, visualHandoff: row.unit.visualHandoff ?? null, audioHandoff: row.unit.audioHandoff ?? null}},
  {source_range: otioRange(otioTime(0, duration.rate), duration), effects: [], markers: []});
}

function otioClip(row, kind, duration) {
  const sourceTrack = row.media[kind];
  const rate = kind === 'video' ? sourceTrack.fps.numerator / sourceTrack.fps.denominator : sourceTrack.rate;
  const sourceStart = kind === 'video' ? nleVideoStart(row) : nleAudioStart(row);
  const rawStart = seconds(nleOrigin(row.media, kind));
  const start = seconds(sourceStart) * rate;
  const available = otioRange(otioTime(rawStart * rate, rate), otioTime(seconds(sourceTrack.duration) * rate, rate));
  const mediaReference = otioNode('ExternalReference.1', basename(row.media.snapshot.path),
    {asrcut: {kind, streamIndex: sourceTrack.stream.index, trackId: sourceTrack.trackId, sourceId: row.media.source.id,
      sourceSha256: row.media.snapshot.sha256, ...(kind === 'video' ? {syncToPrimaryAudio: sourceTrack.sync} : {})}},
    {target_url: pathToFileURL(row.media.snapshot.path).href, available_range: available, available_image_bounds: null});
  return otioNode('Clip.2', clipName(row), {asrcut: {...audioClipIdentity(row.unit), streamIndex: sourceTrack.stream.index}}, {
    source_range: otioRange(otioTime(start, rate), duration), effects: [], markers: [],
    media_references: {DEFAULT_MEDIA: mediaReference}, active_media_reference_key: 'DEFAULT_MEDIA',
  });
}

function openTimelineIO({binding, sources, rows, fps, markers, resolution}) {
  const rate = fps.numerator / fps.denominator;
  const audioRate = binding.timeline.clock.sampleRateHz;
  const hasVideo = [...sources.values()].some((row) => row.video);
  const markerNodes = markers.map((marker) => otioNode('Marker.2', marker.name, {asrcut: marker}, {
    color: marker.kind === 'visual-seam-risk' ? 'RED' : 'BLUE',
    marked_range: otioRange(otioTime(marker.targetSample, audioRate), otioTime(marker.endSample - marker.targetSample, audioRate)),
  }));
  const videoChildren = hasVideo ? rows.filter((row) => row.frameCount).map((row) => {
    const duration = otioTime(row.frameCount, rate);
    return row.media?.video ? otioClip(row, 'video', duration) : otioGap(row, duration);
  }) : [];
  const audioChildren = rows.map((row) => {
    const duration = otioTime(span(row.unit.targetRange), audioRate);
    return row.unit.kind === 'source' ? otioClip(row, 'audio', duration) : otioGap(row, duration);
  });
  const makeTrack = (kind, name, children, trackMarkers) => otioNode('Track.1', name, {},
    {kind, children, source_range: null, effects: [], markers: trackMarkers});
  const tracks = [];
  if (hasVideo) tracks.push(makeTrack('Video', 'Selected video', videoChildren, markerNodes));
  tracks.push(makeTrack('Audio', 'Primary source audio', audioChildren, hasVideo ? [] : markerNodes));
  const metadata = {asrcut: {project: binding.timeline.project, planSha256: binding.timeline.planSha256, timelineSha256: binding.timelineSha256,
    pacingProfile: binding.plan.pacingProfile ?? null, fps, resolution, sampleRateHz: audioRate,
    omittedVideoUnits: rows.filter((row) => !row.frameCount).map((row) => row.unit.occurrenceId ?? row.unit.id)}};
  const stack = otioNode('Stack.1', 'tracks', {}, {children: tracks, source_range: null, effects: [], markers: []});
  return json(otioNode('Timeline.1', binding.timeline.project.id, metadata, {tracks: stack, global_start_time: otioTime(0, rate)}));
}

function cmxTime(frame, nominal) {
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= nominal * 24 * 3600) fail('edl-timecode-overflow', 'CMX 3600 timecode falls outside a single 24-hour run');
  const pad = (number) => String(number).padStart(2, '0');
  const seconds = Math.floor(frame / nominal);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, frame % nominal].map(pad).join(':');
}

function edlLine(value) { return String(value).replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim(); }

function cmxEdl({binding, rows, fps, markers}) {
  const nominal = Math.round(fps.numerator / fps.denominator);
  const ntsc = fps.denominator === 1001 && [24000, 30000, 60000].includes(fps.numerator);
  if (!ntsc && (fps.denominator !== 1 || ![24, 25, 30, 48, 50, 60].includes(nominal))) fail('edl-frame-rate-unsupported', 'CMX 3600 requires a standard non-drop timecode rate');
  const visible = rows.filter((row) => row.frameCount);
  if (visible.length > 999) fail('edl-event-overflow', 'A single CMX 3600 EDL supports at most 999 events');
  if (visible.some((row) => row.unit.kind === 'source' && (!row.media.video || row.media.video.srcID !== 1 || !sameRate(row.media.video.fps, fps)))) {
    fail('edl-source-unsupported', 'CMX 3600 preserves one video track with the same source and project frame rate. Use FCPXML or OTIO for other streams, audio, or mixed frame rates');
  }
  const result = [`TITLE: ${edlLine(binding.timeline.project.id)}`, 'FCM: NON-DROP FRAME', ''];
  const markerTargets = markersByFrame(rows, markers, fps, binding.timeline.clock.sampleRateHz);
  const reels = new Map();
  const time = (frame) => cmxTime(frame, nominal);
  for (const [index, row] of visible.entries()) {
    const presentation = row.unit.kind === 'presentation';
    if (!presentation && !reels.has(row.unit.sourceId)) reels.set(row.unit.sourceId, `R${String(reels.size + 1).padStart(7, '0')}`);
    const reel = presentation ? 'BL' : reels.get(row.unit.sourceId);
    const sourceStart = presentation ? 0 : frameAt(nleVideoStart(row), fps);
    result.push(`${String(index + 1).padStart(3, '0')}  ${reel.padEnd(8)} V     C        ${time(sourceStart)} ${time(sourceStart + row.frameCount)} ${time(row.startFrame)} ${time(row.endFrame)}`);
    if (index === 0) result.push(`* ASRCUT RATE ${ffRate(fps)}  PLAN ${binding.timeline.planSha256}  TIMELINE ${binding.timelineSha256}`);
    result.push(`* FROM CLIP NAME: ${edlLine(clipName(row))}`);
    if (!presentation) result.push(`* FROM FILE: ${pathToFileURL(row.media.snapshot.path).href}`);
    for (const marker of markerTargets.get(row) ?? []) result.push(`* LOC: ${time(sourceStart + marker.localFrame)} ${marker.kind === 'visual-seam-risk' ? 'RED' : 'BLUE'} ${edlLine(marker.name)} [record ${time(marker.frame)}; sample ${marker.targetSample}]`);
    result.push('');
  }
  return `${result.join('\r\n')}\r\n`;
}

export async function exportNle({planPath, timelinePath, outPath, format, fps: rate, width, height, videoStreams = {},
  ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe'} = {}) {
  const writers = {fcpxml, otio: openTimelineIO, edl: cmxEdl};
  if (!Object.hasOwn(writers, format) || extname(outPath ?? '').toLowerCase() !== `.${format}`) {
    fail('unsupported-output-format', 'Select fcpxml, edl or otio and use the matching output suffix');
  }
  const fps = parseFrameRate(rate);
  const binding = await boundTimeline(planPath, timelinePath, {requireMediaExport: false});
  const output = await newMediaPath(outPath, binding.protectedPaths);
  const sources = await retainedMedia(binding, videoStreams, ffprobePath, {allowAudioOnly: format !== 'edl'});
  const resolution = dimensions(sources, width, height);
  const rows = frameRows(binding.timeline, sources, fps);
  if (rows.at(-1).endFrame < 1 && (format !== 'otio' || [...sources.values()].some(({video}) => video))) {
    fail('empty-frame-export', 'This exchange timeline is shorter than one quantized video frame');
  }
  const markers = editorMarkers(binding.plan, binding.timeline);
  const contents = writers[format]({binding, sources, rows, fps, resolution, markers});
  await Promise.all([confirmTimeline(binding), ...[...sources.values()].map(({snapshot}) => confirmFile(snapshot))]);
  await writeNewMediaText(output, contents, binding.protectedPaths);
  return {output, format, fps, markers: markers.length, planSha256: binding.timeline.planSha256, timelineSha256: binding.timelineSha256,
    audioRepresentation: format === 'otio' ? 'editable-primary-track-sample-clock' : format === 'fcpxml' ? 'editable-primary-audio-frame-aligned' : 'video-only',
    subframeVideoUnits: rows.filter((row) => !row.frameCount).map((row) => row.unit.occurrenceId ?? row.unit.id)};
}

function streamSelections(value) {
  if (!value) return Object.create(null);
  if (typeof value !== 'string') fail('missing-argument', 'Option --video-streams requires a value');
  const entries = Object.create(null);
  for (const part of value.split(',')) {
    const match = /^([^=,]+)=(\d+)$/.exec(part);
    if (!match || !Number.isSafeInteger(Number(match[2])) || Object.hasOwn(entries, match[1])) {
      fail('invalid-video-stream-selection', 'Use a comma-separated sourceId=globalVideoStreamIndex list with one selection per source');
    }
    entries[match[1]] = Number(match[2]);
  }
  return entries;
}

export async function runMediaCli(command, options) {
  const common = ['plan', 'timeline'];
  const video = ['fps', 'width', 'height', 'video-streams', 'ffprobe', 'out'];
  const binding = {planPath: options.plan, timelinePath: options.timeline};
  let result;
  if (command === 'extract-seams') {
    mediaOptions(options, [...common, 'audio', 'audio-receipt', 'out-dir', 'tmp-dir', 'ffmpeg'], [...common, 'audio', 'out-dir']);
    const rendered = await extractSeams({...binding, audioPath: options.audio, audioReceiptPath: options['audio-receipt'],
      outDir: options['out-dir'], tmpDir: options['tmp-dir'], ffmpegPath: options.ffmpeg});
    result = {output: rendered.output, manifest: rendered.manifest, seams: rendered.manifestData.seams.length, auditionStatus: 'not_auditioned'};
  } else {
    const videoInput = {...binding, outPath: options.out, fps: options.fps, videoStreams: streamSelections(options['video-streams']),
      width: options.width ? Number(options.width) : undefined, height: options.height ? Number(options.height) : undefined, ffprobePath: options.ffprobe};
    if (command === 'export-video') {
      mediaOptions(options, [...common, ...video, 'audio', 'audio-receipt', 'audio-plan', 'processed-source', 'seam-fade-ms', 'seam-crossfade-ms', 'tmp-dir', 'ffmpeg'], [...common, 'fps', 'out']);
      const rendered = await exportVideo({...videoInput, tmpDir: options['tmp-dir'], ffmpegPath: options.ffmpeg, audioPath: options.audio,
        audioReceiptPath: options['audio-receipt'], audioPlanPath: options['audio-plan'], processedSourcePath: options['processed-source'],
        seamFadeMs: options['seam-fade-ms'] ? Number(options['seam-fade-ms']) : undefined,
        seamCrossfadeMs: options['seam-crossfade-ms'] ? Number(options['seam-crossfade-ms']) : undefined});
      result = {output: rendered.output, receipt: rendered.receipt, fps: rendered.receiptData.fps, frameCount: rendered.receiptData.frameCount,
        auditionStatus: 'not_auditioned', viewingStatus: 'not_viewed'};
    } else if (command === 'export-nle') {
      mediaOptions(options, [...common, ...video, 'format'], [...common, 'fps', 'out', 'format']);
      result = await exportNle({...videoInput, format: options.format});
    } else fail('unknown-command', `Unknown command: ${command}`);
  }
  process.stdout.write(json({ok: true, command, ...result}));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const [command, ...argv] = process.argv.slice(2);
    if (!command || command === '--help') {
      process.stdout.write('video-and-nle.mjs extract-seams --plan PLAN --timeline TIMELINE --audio CUT.wav [--audio-receipt RECEIPT] --out-dir NEW_DIR\n'
        + 'video-and-nle.mjs export-video --plan PLAN --timeline TIMELINE --fps RATE [--audio CUT.wav] --out NEW.mov\n'
        + 'video-and-nle.mjs export-nle --plan PLAN --timeline TIMELINE --fps RATE --format fcpxml|edl|otio --out NEW_FILE\n');
      return;
    }
    process.exitCode = await runMediaCli(command, mediaCliOptions(argv));
  })().catch(mediaCliError);
}
