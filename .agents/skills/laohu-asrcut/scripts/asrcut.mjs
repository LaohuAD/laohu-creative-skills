#!/usr/bin/env node

import {createHash, randomBytes} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {link, lstat, mkdir, open, readFile, realpath, rename, rm, stat, unlink} from 'node:fs/promises';
import {basename, dirname, join, relative, resolve} from 'node:path';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {CAPTION_DESIGN_FORMAT, CAPTION_DESIGN_FORMAT_V2, CAPTION_MANIFEST_FORMAT, CAPTION_MANIFEST_FORMAT_V2, captionManifestToSrt, compileCaptionManifest, verifyCaptionManifest} from './caption-manifest.mjs';
import {applyEdits, containsRange, editorialMetadataErrors, sourceSpeechGaps} from './edit-operations.mjs';
import {compileAnimationHandoff, timelineSeams, verifyAnimationHandoff} from './animation-handoff.mjs';

export const EDIT_PLAN_FORMAT = 'laohu.asrcut.edit-plan/1';
export const EDIT_PLAN_V2_FORMAT = 'laohu.asrcut.edit-plan/2';
export const TIMELINE_FORMAT = 'laohu.asrcut.timeline/1';
export const TIMELINE_V2_FORMAT = 'laohu.asrcut.timeline/2';
export const DEFAULT_SAMPLE_RATE_HZ = 48000;

const isEditPlanV2 = (plan) => plan?.format === EDIT_PLAN_V2_FORMAT;
const sequenceKind = (plan, item) => isEditPlanV2(plan) ? item.kind : 'source';

const PRECISIONS = new Set(['measured', 'aligned', 'utterance', 'estimated']);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const safeInteger = (value) => Number.isSafeInteger(value);
const deepClone = (value) => JSON.parse(JSON.stringify(value));
const execFile = promisify(execFileCallback);

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function transcriptEvidencePaths(plan, baseDir = process.cwd()) {
  return plan.sources.map((source) => source.transcript?.evidenceRef)
    .filter(Boolean).map((reference) => resolve(baseDir, reference));
}

function mediaPaths(plan, baseDir) {
  return plan.sources.map((source) => source.mediaPath).filter(Boolean).map((path) => resolve(baseDir, path));
}

function rebasePlanEvidenceRefs(plan, sourceBaseDir, destinationBaseDir) {
  for (const source of plan.sources) {
    if (!source.transcript?.evidenceRef) continue;
    const evidencePath = resolve(sourceBaseDir, source.transcript.evidenceRef);
    source.transcript.evidenceRef = relative(destinationBaseDir, evidencePath) || basename(evidencePath);
  }
  plan.integrity.planSha256 = hashPlan(plan);
  return plan;
}

export class AsrcutError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'AsrcutError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new AsrcutError(code, message, details);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function planForHash(plan) {
  const copy = deepClone(plan);
  delete copy.review;
  delete copy.state;
  delete copy.annotations;
  if (copy.integrity) {
    delete copy.integrity.planSha256;
    delete copy.integrity.annotationSha256;
  }
  return stableValue(copy);
}

export function hashPlan(plan) {
  return sha256(JSON.stringify(planForHash(plan)));
}

export {CAPTION_DESIGN_FORMAT, CAPTION_DESIGN_FORMAT_V2, CAPTION_MANIFEST_FORMAT, CAPTION_MANIFEST_FORMAT_V2, captionManifestToSrt, compileCaptionManifest, verifyCaptionManifest};
export {applyEdits, compileAnimationHandoff, timelineSeams, verifyAnimationHandoff};

export function hashAnnotations(annotations = []) {
  return sha256(JSON.stringify(stableValue(annotations)));
}

function updateAnnotationHash(plan) {
  plan.integrity.annotationSha256 = hashAnnotations(plan.annotations ?? []);
  return plan;
}

function interval(startSample, endSample, sampleRateHz) {
  return {startSample, endSample, sampleRateHz};
}

function assertPositiveRate(rate, label = 'sampleRateHz') {
  if (!safeInteger(rate) || rate < 1) fail('invalid-clock', `${label} must be a positive integer`);
}

function msToSample(milliseconds, sampleRateHz, label) {
  const value = Number(milliseconds);
  assertPositiveRate(sampleRateHz);
  if (!Number.isFinite(value) || value < 0) fail('invalid-time', `${label} must be a non-negative finite time`);
  const samples = Math.round(value * sampleRateHz / 1000);
  if (!safeInteger(samples)) fail('invalid-time', `${label} exceeds the safe sample range`);
  return samples;
}

function secondsToSample(seconds, sampleRateHz, label) {
  const value = Number(seconds);
  assertPositiveRate(sampleRateHz);
  if (!Number.isFinite(value) || value < 0) fail('invalid-time', `${label} must be a non-negative finite time`);
  const samples = Math.round(value * sampleRateHz);
  if (!safeInteger(samples)) fail('invalid-time', `${label} exceeds the safe sample range`);
  return samples;
}

function parseSrtTimestamp(value) {
  const match = String(value).trim().match(/^(\d{2,}:)?(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) fail('invalid-srt-time', `Invalid SRT timestamp: ${value}`);
  const hours = Number((match[1] ?? '0:').replace(':', ''));
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  if (minutes > 59 || seconds > 59) fail('invalid-srt-time', `Invalid SRT timestamp: ${value}`);
  return (((hours * 60 + minutes) * 60) + seconds) * 1000 + milliseconds;
}

function parseSrt(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n[\t ]*\n+/).filter((block) => block.trim());
  const segments = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeIndex < 0) fail('invalid-srt', 'SRT cue is missing a time line');
    const match = lines[timeIndex].match(/^\s*(\S+)\s+-->\s+(\S+)/);
    if (!match) fail('invalid-srt', `Invalid SRT time line: ${lines[timeIndex]}`);
    const startMs = parseSrtTimestamp(match[1]);
    const endMs = parseSrtTimestamp(match[2]);
    if (endMs <= startMs) fail('invalid-srt-range', 'SRT cue end must be after its start');
    const rawText = lines.slice(timeIndex + 1).join('\n');
    segments.push({startMs, endMs, rawStart: match[1], rawEnd: match[2], rawText});
  }
  if (segments.length === 0) fail('empty-transcript', 'SRT contains no timed cues');
  return segments;
}

function parseJsonInput(raw) {
  if (typeof raw === 'string') {
    try { return {value: JSON.parse(raw), rawText: raw, evidenceHashMode: 'raw-bytes'}; }
    catch (error) { fail('invalid-json', `ASR JSON cannot be parsed: ${error.message}`); }
  }
  if (!raw || typeof raw !== 'object') fail('invalid-asr-json', 'ASR input must be a JSON object');
  return {value: raw, rawText: JSON.stringify(raw), evidenceHashMode: 'json-serialization'};
}

function getAsrRows(payload) {
  if (payload?.schema === 'laohu.cap-asr-transcript/1') {
    if (payload.timeBasis !== 'raw-recording-display-timeline') {
      fail('unknown-time-basis', 'Cap transcript timeBasis is missing or unsupported; source and project clocks cannot be guessed');
    }
    if (!Array.isArray(payload.utterances) || payload.utterances.length === 0) fail('empty-transcript', 'Cap transcript has no utterances');
    return {kind: 'cap-asr-json', rows: payload.utterances, basis: payload.timeBasis, cap: true};
  }
  const result = Array.isArray(payload?.result) ? payload.result[0] : payload?.result;
  const fromVolcFlash = Boolean(result && Array.isArray(result.utterances) && (Object.hasOwn(result, 'audio_info') || Object.hasOwn(payload, 'audio_info')));
  const rows = Array.isArray(payload?.segments) ? payload.segments
    : Array.isArray(payload?.utterances) ? payload.utterances
      : Array.isArray(result?.utterances) ? result.utterances : null;
  if (!rows?.length) fail('empty-transcript', 'ASR JSON must contain a non-empty segments or utterances array');
  return {kind: 'asr-json', rows, basis: payload?.timeBasis ?? payload?.time_basis ?? (fromVolcFlash ? 'volcengine-flash-utterance-ms' : 'declared-by-input'), cap: false, defaultTimeUnit: fromVolcFlash ? 'ms' : null};
}

function rowTimeEvidence(row, edge, options, word = false) {
  const isStart = edge === 'start';
  const capKey = isStart ? 'sourceStartMs' : 'sourceEndMs';
  const hasValue = (key) => row?.[key] !== undefined && row?.[key] !== null && Number.isFinite(Number(row[key]));
  let field = null;
  let unit = null;
  if (options.capLocal && hasValue(capKey)) { field = capKey; unit = 'ms'; }
  if (!field) {
    const candidates = isStart ? ['startMs', 'start_ms', 'start_time'] : ['endMs', 'end_ms', 'end_time'];
    for (const key of candidates) {
      if (!hasValue(key)) continue;
      field = key;
      if (key === 'startMs' || key === 'endMs' || key === 'start_ms' || key === 'end_ms') unit = 'ms';
      else unit = options.timeUnit ?? row?.timeUnit ?? row?.time_unit ?? null;
      break;
    }
  }
  if (!field) {
    const key = isStart ? 'start' : 'end';
    if (hasValue(key)) {
      field = key;
      unit = options.timeUnit ?? row?.timeUnit ?? row?.time_unit ?? null;
    }
  }
  if (!field) return null;
  if (unit === 'milliseconds') unit = 'ms';
  if (unit === 'seconds') unit = 's';
  if (!['ms', 's'].includes(unit)) fail('unknown-time-unit', `ASR ${word ? 'word' : 'segment'} field ${field} requires an explicit timeUnit of seconds or milliseconds`);
  const rawValue = row[field];
  const numeric = Number(rawValue);
  const milliseconds = unit === 's' ? numeric * 1000 : numeric;
  return {
    milliseconds,
    evidence: {value: rawValue, unit, field, clock: 'source-local'},
  };
}

function wordRows(row) {
  if (Array.isArray(row?.words)) return row.words;
  if (Array.isArray(row?.tokens)) return row.tokens;
  return [];
}

function normalizeRows(payload, rows, options, sourceId, sampleRateHz, cap = false) {
  const normalized = rows.map((row, index) => {
    const start = rowTimeEvidence(row, 'start', {...options, capLocal: cap});
    const end = rowTimeEvidence(row, 'end', {...options, capLocal: cap});
    if (!start || !end || end.milliseconds <= start.milliseconds) fail('invalid-asr-range', `ASR segment ${index + 1} has no valid explicit time range`);
    const sourceRange = interval(msToSample(start.milliseconds, sampleRateHz, 'segment start'), msToSample(end.milliseconds, sampleRateHz, 'segment end'), sampleRateHz);
    const precision = row?.timingPrecision && PRECISIONS.has(row.timingPrecision)
      ? row.timingPrecision : 'utterance';
    const globalHasStart = cap && row.globalStartMs !== undefined && row.globalStartMs !== null && Number.isFinite(Number(row.globalStartMs));
    const globalHasEnd = cap && row.globalEndMs !== undefined && row.globalEndMs !== null && Number.isFinite(Number(row.globalEndMs));
    const globalStartMs = globalHasStart ? Number(row.globalStartMs) : null;
    const globalEndMs = globalHasEnd ? Number(row.globalEndMs) : null;
    const tokens = wordRows(row).map((word, wordIndex) => {
      const wordStart = rowTimeEvidence(word, 'start', {...options, capLocal: cap}, true);
      const wordEnd = rowTimeEvidence(word, 'end', {...options, capLocal: cap}, true);
      const rawText = String(word?.text ?? word?.word ?? word?.token ?? '');
      const wordGlobalHasStart = cap && word.globalStartMs !== undefined && word.globalStartMs !== null && Number.isFinite(Number(word.globalStartMs));
      const wordGlobalHasEnd = cap && word.globalEndMs !== undefined && word.globalEndMs !== null && Number.isFinite(Number(word.globalEndMs));
      const wordGlobalStartMs = wordGlobalHasStart ? Number(word.globalStartMs) : null;
      const wordGlobalEndMs = wordGlobalHasEnd ? Number(word.globalEndMs) : null;
      const wordRange = wordStart && wordEnd && wordEnd.milliseconds > wordStart.milliseconds
        ? interval(msToSample(wordStart.milliseconds, sampleRateHz, 'word start'), msToSample(wordEnd.milliseconds, sampleRateHz, 'word end'), sampleRateHz)
        : null;
      return {
        id: `${sourceId}-seg-${String(index + 1).padStart(4, '0')}-word-${String(wordIndex + 1).padStart(4, '0')}`,
        rawText,
        sourceRange: wordRange,
        globalRangeMs: wordGlobalStartMs !== null && wordGlobalEndMs !== null ? {startMs: wordGlobalStartMs, endMs: wordGlobalEndMs} : null,
        evidenceClock: wordStart && wordEnd ? {
          start: wordStart.evidence,
          end: wordEnd.evidence,
          ...(wordGlobalStartMs !== null && wordGlobalEndMs !== null ? {
            globalStart: {value: word.globalStartMs, unit: 'ms', field: 'globalStartMs', clock: 'global'},
            globalEnd: {value: word.globalEndMs, unit: 'ms', field: 'globalEndMs', clock: 'global'},
          } : {}),
        } : null,
        timingPrecision: wordRange ? (word?.timingPrecision && PRECISIONS.has(word.timingPrecision) ? word.timingPrecision : 'measured') : 'utterance',
      };
    });
    const rawText = String(row?.text ?? row?.rawText ?? row?.transcript ?? '');
    return {
      id: `${sourceId}-seg-${String(index + 1).padStart(4, '0')}`,
      rawText,
      sourceRange,
      globalRangeMs: globalStartMs !== null && globalEndMs !== null ? {startMs: globalStartMs, endMs: globalEndMs} : null,
      evidenceClock: {
        start: start.evidence,
        end: end.evidence,
        ...(globalStartMs !== null && globalEndMs !== null ? {
          globalStart: {value: row.globalStartMs, unit: 'ms', field: 'globalStartMs', clock: 'global'},
          globalEnd: {value: row.globalEndMs, unit: 'ms', field: 'globalEndMs', clock: 'global'},
        } : {}),
      },
      timingPrecision: precision,
      tokens,
      recordingSegment: cap && Number.isInteger(row.recordingSegment) ? row.recordingSegment : null,
    };
  });
  return normalized;
}

function sourceTemplate({id, order, sampleRateHz, durationSamples, mediaPath, mediaSha256, transcriptKind, transcriptSha256, evidenceRef = null, evidenceHashMode, timeBasis, segments, recordingSegment = null, audioStreamIndex = null, videoTracks = []}) {
  if (!Array.isArray(videoTracks) || (videoTracks.length && (!mediaPath || !/^[a-f0-9]{64}$/.test(mediaSha256 ?? '')))) fail('video-track-media-required', 'Declared video tracks require the linked, hashed media source');
  const streamIndices = new Set(Number.isInteger(audioStreamIndex) ? [audioStreamIndex] : []);
  const video = videoTracks.map(({streamIndex, timebase, syncToPrimaryAudio}) => {
    if (!safeInteger(streamIndex) || streamIndex < 0 || streamIndices.has(streamIndex)) fail('invalid-video-track-declaration', 'Declared video tracks require distinct non-negative global stream indices');
    if (!safeInteger(timebase?.numerator) || timebase.numerator <= 0 || !safeInteger(timebase?.denominator) || timebase.denominator <= 0) fail('invalid-video-track-declaration', 'Declared video tracks require an exact positive PTS timebase');
    const offset = syncToPrimaryAudio?.offsetSeconds;
    const unknown = syncToPrimaryAudio?.status === 'unknown' && Object.keys(syncToPrimaryAudio).length === 1;
    const known = syncToPrimaryAudio?.status === undefined && ['measured', 'estimated'].includes(syncToPrimaryAudio?.precision)
      && safeInteger(offset?.numerator) && safeInteger(offset?.denominator) && offset.denominator > 0;
    if (!unknown && !known) fail('invalid-video-track-declaration', 'A video track requires a signed rational offset and its precision or explicit unknown synchronization');
    streamIndices.add(streamIndex);
    return {id: `${id}-video-${streamIndex}`, kind: 'video', streamIndex, clock: {unit: 'pts', timebase: deepClone(timebase)}, syncToPrimaryAudio: deepClone(syncToPrimaryAudio)};
  });
  return {
    id,
    order,
    sha256: mediaSha256 ?? null,
    mediaPath: mediaPath ?? null,
    durationSamples: durationSamples ?? null,
    recordingSegment,
    primaryAudioTrackId: mediaPath ? `${id}-primary-audio` : null,
    tracks: mediaPath ? [{
      id: `${id}-primary-audio`,
      kind: 'audio',
      ...(Number.isInteger(audioStreamIndex) ? {streamIndex: audioStreamIndex} : {}),
      clock: {unit: 'sample', sampleRateHz},
      syncToPrimaryAudio: {status: 'primary'},
    }, ...video] : [],
    transcript: {kind: transcriptKind, sha256: transcriptSha256, evidenceRef, evidenceHashMode, timeBasis, segments},
  };
}

function makePlan({projectId, sampleRateHz, sources, mediaDurationSamples, authorization = {}, questions = []}) {
  const coverage = [];
  const sequence = [];
  const decisions = [];
  const orderedSources = [...sources].sort((a, b) => a.order - b.order);
  for (const source of orderedSources) {
    const timed = source.transcript.segments.filter((item) => item.sourceRange);
    if (timed.length === 0) continue;
    const start = source.durationSamples !== null ? 0 : Math.min(...timed.map((item) => item.sourceRange.startSample));
    const end = source.durationSamples !== null ? source.durationSamples : Math.max(...timed.map((item) => item.sourceRange.endSample));
    if (end <= start) fail('invalid-source-scope', `Source ${source.id} has an empty known range`);
    if (timed.some((item) => item.sourceRange.startSample < start || item.sourceRange.endSample > end)) {
      fail('transcript-outside-source', `A transcript range falls outside the known source range for ${source.id}`);
    }
    const coverageId = `${source.id}-coverage-0001`;
    const decisionId = `${source.id}-decision-retain-all`;
    const tokenIds = timed.flatMap((segment) => segment.tokens.map((token) => token.id));
    coverage.push({
      id: coverageId,
      sourceId: source.id,
      sourceRange: interval(start, end, source.transcript.segments.find((s) => s.sourceRange)?.sourceRange.sampleRateHz ?? sampleRateHz),
      disposition: 'retain',
      decisionId,
      tokenIds,
    });
    decisions.push({
      id: decisionId,
      action: 'retain',
      reason: 'Imported source retained in its original order; no automatic deletion was applied.',
      coverageIds: [coverageId],
      sourceRanges: [{sourceId: source.id, sourceRange: interval(start, end, coverage.at(-1).sourceRange.sampleRateHz)}],
      keptOccurrenceIds: [`${coverageId}-occ-0001`],
      tokenIds,
    });
    sequence.push({occurrenceId: `${coverageId}-occ-0001`, coverageId});
  }
  if (coverage.length === 0) fail('no-timed-content', 'No source contained a usable timed transcript range');
  const plan = {
    format: EDIT_PLAN_FORMAT,
    project: {id: projectId, revision: 1},
    state: 'draft',
    review: {status: 'not_requested', approvedPlanSha256: null},
    authorization: {
      reorder: authorization.reorder === true,
      repeat: authorization.repeat === true,
      mediaExport: authorization.mediaExport === true,
    },
    clock: {sampleRateHz},
    sources: orderedSources,
    coverage,
    sequence,
    decisions,
    questions,
    spokenCorrections: [],
    displayText: [],
    annotations: [],
    integrity: {planSha256: null, annotationSha256: null},
  };
  updateAnnotationHash(plan);
  plan.integrity.planSha256 = hashPlan(plan);
  return plan;
}

function maybeQuestion({id, sourceId = null, question, blocks}) {
  return {id, sourceId, sourceRange: null, question, blocks};
}

export function importSrt(text, options = {}) {
  const projectId = String(options.projectId ?? 'asrcut-project');
  const sourceId = String(options.sourceId ?? 'source-1');
  const sampleRateHz = Number(options.sampleRateHz ?? DEFAULT_SAMPLE_RATE_HZ);
  const sourceSampleRateHz = Number(options.sourceSampleRateHz ?? sampleRateHz);
  assertPositiveRate(sampleRateHz, 'project sampleRateHz');
  assertPositiveRate(sourceSampleRateHz, 'source sampleRateHz');
  const rows = parseSrt(text);
  const segments = rows.map((row, index) => ({
    id: `${sourceId}-seg-${String(index + 1).padStart(4, '0')}`,
    rawText: row.rawText,
    sourceRange: interval(msToSample(row.startMs, sourceSampleRateHz, 'SRT start'), msToSample(row.endMs, sourceSampleRateHz, 'SRT end'), sourceSampleRateHz),
    globalRangeMs: null,
    evidenceClock: {
      start: {value: row.rawStart, unit: 'srt_timestamp', field: 'start timestamp', clock: 'source-local'},
      end: {value: row.rawEnd, unit: 'srt_timestamp', field: 'end timestamp', clock: 'source-local'},
    },
    timingPrecision: 'utterance',
    tokens: [],
  }));
  const transcriptHash = options.transcriptSha256 ?? sha256(String(text));
  const mediaHash = options.mediaSha256 ?? null;
  const durationSamples = options.sourceDurationSamples === undefined ? null : Number(options.sourceDurationSamples);
  if (durationSamples !== null && (!safeInteger(durationSamples) || durationSamples <= 0)) fail('invalid-duration', 'sourceDurationSamples must be a positive integer');
  const source = sourceTemplate({
    id: sourceId,
    order: 0,
    sampleRateHz: sourceSampleRateHz,
    durationSamples,
    mediaPath: options.mediaPath,
    mediaSha256: mediaHash,
    transcriptKind: 'srt',
    transcriptSha256: transcriptHash,
    evidenceRef: options.evidenceRef ?? null,
    evidenceHashMode: 'raw-bytes',
    timeBasis: 'srt-milliseconds',
    segments,
    audioStreamIndex: options.audioStreamIndex,
    videoTracks: options.videoTracks,
  });
  const questions = [];
  if (!options.mediaPath) questions.push(maybeQuestion({id: 'media-source-not-provided', sourceId, question: 'No source media was provided; the timeline is virtual and cannot be auditioned or exported as audio.', blocks: ['mediaExport']}));
  if (durationSamples === null) questions.push(maybeQuestion({id: 'source-duration-unknown', sourceId, question: 'The full source duration is unknown; SRT coverage applies only from the first cue to the last cue.', blocks: ['mediaExport']}));
  return makePlan({projectId, sampleRateHz, sources: [source], authorization: options.authorization, questions});
}

export function importAsrJson(raw, options = {}) {
  const parsed = parseJsonInput(raw);
  const payload = parsed.value;
  const projectId = String(options.projectId ?? 'asrcut-project');
  const sourceId = String(options.sourceId ?? 'source-1');
  const sampleRateHz = Number(options.sampleRateHz ?? DEFAULT_SAMPLE_RATE_HZ);
  const sourceSampleRateHz = Number(options.sourceSampleRateHz ?? sampleRateHz);
  assertPositiveRate(sampleRateHz, 'project sampleRateHz');
  assertPositiveRate(sourceSampleRateHz, 'source sampleRateHz');
  const {kind, rows, basis, cap, defaultTimeUnit} = getAsrRows(payload);
  const rowOptions = {...options, timeUnit: options.timeUnit ?? defaultTimeUnit ?? undefined};
  if (options.evidenceRef && typeof raw !== 'string' && !options.transcriptSha256) {
    fail('evidence-hash-required', 'When importing an in-memory ASR object with evidenceRef, provide the SHA-256 of the exact evidence file bytes as transcriptSha256');
  }
  const transcriptHash = options.transcriptSha256 ?? sha256(parsed.rawText);
  const evidenceHashMode = options.transcriptSha256 ? 'raw-bytes' : parsed.evidenceHashMode;
  const mediaHash = options.mediaSha256 ?? null;
  const durationSamples = options.sourceDurationSamples === undefined ? null : Number(options.sourceDurationSamples);
  if (durationSamples !== null && (!safeInteger(durationSamples) || durationSamples <= 0)) fail('invalid-duration', 'sourceDurationSamples must be a positive integer');

  if (!cap) {
    const segments = normalizeRows(payload, rows, rowOptions, sourceId, sourceSampleRateHz, false);
    const source = sourceTemplate({
      id: sourceId, order: 0, sampleRateHz: sourceSampleRateHz, durationSamples,
      mediaPath: options.mediaPath, mediaSha256: mediaHash, transcriptKind: kind,
      transcriptSha256: transcriptHash, evidenceRef: options.evidenceRef ?? null, evidenceHashMode, timeBasis: basis, segments,
      audioStreamIndex: options.audioStreamIndex,
      videoTracks: options.videoTracks,
    });
    const questions = [];
    if (!options.mediaPath) questions.push(maybeQuestion({id: 'media-source-not-provided', sourceId, question: 'No source media was provided; the timeline is virtual and cannot be auditioned or exported as audio.', blocks: ['mediaExport']}));
    if (durationSamples === null) questions.push(maybeQuestion({id: 'source-duration-unknown', sourceId, question: 'The full source duration is unknown; only the transcript-covered range is represented.', blocks: ['mediaExport']}));
    return makePlan({projectId, sampleRateHz, sources: [source], authorization: options.authorization, questions});
  }

  const selectedRows = options.recordingSegment === undefined
    ? rows
    : rows.filter((row) => Number(row.recordingSegment) === Number(options.recordingSegment));
  if (options.recordingSegment !== undefined && selectedRows.length === 0) {
    fail('cap-recording-segment-not-found', `No Cap utterances found for recordingSegment ${options.recordingSegment}`);
  }
  const byRecording = new Map();
  for (const row of selectedRows) {
    if (!Number.isInteger(row.recordingSegment) || !Number.isFinite(Number(row.sourceStartMs)) || !Number.isFinite(Number(row.sourceEndMs)) || !Number.isFinite(Number(row.globalStartMs)) || !Number.isFinite(Number(row.globalEndMs))) {
      fail('cap-clock-missing', 'Cap transcript requires recordingSegment and explicit source-local plus global time fields on every utterance');
    }
    if (!byRecording.has(row.recordingSegment)) byRecording.set(row.recordingSegment, []);
    byRecording.get(row.recordingSegment).push(row);
  }
  const recordingGroups = [...byRecording.entries()].map(([recordingSegment, groupRows]) => ({
    recordingSegment,
    rows: groupRows,
    globalStartMs: Math.min(...groupRows.map((row) => Number(row.globalStartMs))),
  })).sort((a, b) => a.globalStartMs - b.globalStartMs || a.recordingSegment - b.recordingSegment);
  if (options.videoTracks?.length && recordingGroups.length > 1) fail('video-track-cap-segment-required', 'Select one Cap recording segment and its actual media before declaring video tracks');
  const sources = recordingGroups.map((group, order) => {
    const id = options.recordingSegment === undefined ? `${sourceId}-recording-${group.recordingSegment}` : sourceId;
    const segments = normalizeRows(payload, group.rows, rowOptions, id, sourceSampleRateHz, true);
    const sourceDuration = options.recordingSegment === undefined
      ? (group.recordingSegment === recordingGroups[0].recordingSegment ? durationSamples : null)
      : durationSamples;
    return sourceTemplate({
      id, order, sampleRateHz: sourceSampleRateHz, durationSamples: sourceDuration,
      mediaPath: options.mediaPath, mediaSha256: mediaHash, transcriptKind: 'cap-asr-json',
      transcriptSha256: transcriptHash, evidenceRef: options.evidenceRef ?? null, evidenceHashMode, timeBasis: basis, segments,
      recordingSegment: group.recordingSegment,
      audioStreamIndex: options.audioStreamIndex,
      videoTracks: options.videoTracks,
    });
  });
  const questions = [];
  if (!options.mediaPath) questions.push(maybeQuestion({id: 'media-source-not-provided', question: 'Cap ASR contains transcript clocks but no linked audio path; the timeline is virtual and cannot be auditioned or exported.', blocks: ['mediaExport']}));
  if (durationSamples === null) questions.push(maybeQuestion({id: 'source-duration-unknown', question: 'The Cap transcript does not establish full recording duration; unmatched leading/trailing material is not classified.', blocks: ['mediaExport']}));
  if (recordingGroups.length > 1) questions.push(maybeQuestion({id: 'cap-segment-media-map-unknown', question: 'Multiple Cap recordingSegment clocks were kept separate and ordered by explicit global time; link each segment to its source media and offsets before media export.', blocks: ['mediaExport', 'crossTrackSync']}));
  return makePlan({projectId, sampleRateHz, sources, authorization: options.authorization, questions});
}

export function mergePlans(plans, options = {}) {
  if (!Array.isArray(plans) || plans.length === 0) fail('merge-empty', 'mergePlans requires at least one imported plan');
  const checks = plans.map((plan) => inspectPlan(plan));
  const invalidIndex = checks.findIndex((check) => check.errors.length > 0);
  if (invalidIndex >= 0) fail('merge-invalid-input', `Imported plan ${invalidIndex + 1} failed validation`, checks[invalidIndex].errors);
  const projectId = String(options.projectId ?? plans[0].project.id);
  if (plans.some((plan) => plan.project.id !== projectId)) fail('merge-project-id', 'All imported plans must already use the same project id; imports can be rerun with the requested id');
  const sampleRateHz = plans[0].clock.sampleRateHz;
  if (plans.some((plan) => plan.clock.sampleRateHz !== sampleRateHz)) fail('merge-project-clock', 'All imported plans must use the same project output sample rate');
  const outputV2 = plans.some(isEditPlanV2);
  if (plans.length > 1 && plans.some((plan) => isEditPlanV2(plan) && plan.sequence.some((item) => item.kind === 'presentation'))) {
    fail('merge-presentation-units', 'Merge source edit plans before authoring source-free presentation intervals; this merge cannot safely relocate or discard presentation boundary decisions');
  }
  const sources = plans.flatMap((plan) => plan.sources.map((source) => deepClone(source)));
  if (new Set(sources.map((source) => source.id)).size !== sources.length) fail('merge-source-id', 'Source ids must be unique across plans');
  const sourceIds = sources.map((source) => source.id);
  let sourceOrder = options.sourceOrder;
  if (sourceOrder === undefined && plans.length === 1) sourceOrder = [...sources].sort((a, b) => a.order - b.order).map((source) => source.id);
  if (!Array.isArray(sourceOrder) || sourceOrder.length !== sourceIds.length || new Set(sourceOrder).size !== sourceIds.length || sourceOrder.some((id) => !sourceIds.includes(id))) {
    fail('merge-source-order', 'Provide sourceOrder with each source id exactly once in the intended original order');
  }
  const rank = new Map(sourceOrder.map((id, index) => [id, index]));
  sources.sort((a, b) => rank.get(a.id) - rank.get(b.id));
  sources.forEach((source, index) => { source.order = index; });
  const coverage = plans.flatMap((plan) => deepClone(plan.coverage));
  const decisions = plans.flatMap((plan) => deepClone(plan.decisions));
  const spokenCorrections = plans.flatMap((plan) => deepClone(plan.spokenCorrections ?? []));
  const occurrenceMap = new Map();
  for (const plan of plans) {
    for (const occurrence of plan.sequence) {
      if (isEditPlanV2(plan) && occurrence.kind === 'presentation') continue;
      if (occurrenceMap.has(occurrence.occurrenceId)) fail('merge-occurrence-id', `Occurrence id ${occurrence.occurrenceId} is duplicated across plans`);
      occurrenceMap.set(occurrence.occurrenceId, deepClone(occurrence));
    }
  }
  const sourceOrderByCoverage = new Map(coverage.map((item) => [item.id, rank.get(item.sourceId)]));
  const sequence = plans.length === 1 && isEditPlanV2(plans[0])
    ? deepClone(plans[0].sequence)
    : [...occurrenceMap.values()].sort((a, b) => {
      const bySource = sourceOrderByCoverage.get(a.coverageId) - sourceOrderByCoverage.get(b.coverageId);
      if (bySource !== 0) return bySource;
      const left = coverage.find((item) => item.id === a.coverageId);
      const right = coverage.find((item) => item.id === b.coverageId);
      return left.sourceRange.startSample - right.sourceRange.startSample;
    }).map((item) => outputV2 ? {kind: 'source', ...item} : item);
  const questions = plans.flatMap((plan) => deepClone(plan.questions));
  const seenQuestions = new Set();
  for (const question of questions) {
    if (seenQuestions.has(question.id)) question.id = `${question.sourceId ?? 'source'}-${question.id}`;
    seenQuestions.add(question.id);
  }
  const authorization = Object.fromEntries(['reorder', 'repeat', 'mediaExport', ...(outputV2 ? ['presentationTiming'] : [])].map((key) => [key, plans.every((plan) => plan.authorization[key] === true)]));
  const displayText = plans.flatMap((plan) => deepClone(plan.displayText ?? []));
  const annotations = plans.flatMap((plan) => deepClone(plan.annotations ?? []));
  if (new Set(annotations.map((annotation) => annotation.id)).size !== annotations.length) {
    fail('merge-annotation-id', 'Annotation ids must be unique across merged plans');
  }
  const pacingProfiles = [...new Set(plans.map((plan) => plan.pacingProfile).filter(Boolean))];
  if (pacingProfiles.length > 1) fail('merge-pacing-profile-conflict', 'Merged plans have different editorial pacing profiles');
  const merged = {
    format: outputV2 ? EDIT_PLAN_V2_FORMAT : EDIT_PLAN_FORMAT,
    project: {id: projectId, revision: options.revision ?? Math.max(...plans.map((plan) => plan.project.revision))},
    state: 'draft',
    review: {status: 'not_requested', approvedPlanSha256: null},
    authorization,
    clock: {sampleRateHz},
    sources,
    coverage,
    sequence,
    decisions,
    questions,
    spokenCorrections,
    displayText,
    annotations,
    ...(pacingProfiles.length ? {pacingProfile: pacingProfiles[0]} : {}),
    ...(plans.some((plan) => plan.pauseWindows) ? {pauseWindows: plans.flatMap((plan) => deepClone(plan.pauseWindows ?? []))} : {}),
    ...(plans.some((plan) => plan.narrativeBeats) ? {narrativeBeats: plans.flatMap((plan) => deepClone(plan.narrativeBeats ?? []))} : {}),
    integrity: {planSha256: null, annotationSha256: null},
  };
  updateAnnotationHash(merged);
  merged.integrity.planSha256 = hashPlan(merged);
  const validation = inspectPlan(merged);
  if (validation.errors.length) fail('merge-invalid-result', 'Merged plan failed validation', validation.errors);
  return merged;
}

function sourceMap(plan) {
  return new Map(plan.sources.map((source) => [source.id, source]));
}

function validateRange(range, label, errors) {
  if (!range || typeof range !== 'object') { errors.push(`${label}: missing range`); return; }
  if (!safeInteger(range.startSample) || range.startSample < 0) errors.push(`${label}: startSample must be a non-negative safe integer`);
  if (!safeInteger(range.endSample) || range.endSample <= range.startSample) errors.push(`${label}: endSample must be greater than startSample`);
  if (!safeInteger(range.sampleRateHz) || range.sampleRateHz < 1) errors.push(`${label}: sampleRateHz must be a positive integer`);
}

function rangesEqual(a, b) {
  return a.startSample === b.startSample && a.endSample === b.endSample && a.sampleRateHz === b.sampleRateHz;
}

function inspectPlan(plan) {
  const errors = [];
  const warnings = [];
  if (!plan || ![EDIT_PLAN_FORMAT, EDIT_PLAN_V2_FORMAT].includes(plan.format)) errors.push(`format must be ${EDIT_PLAN_FORMAT} or ${EDIT_PLAN_V2_FORMAT}`);
  if (!plan?.project?.id || !safeInteger(plan?.project?.revision) || plan.project.revision < 1) errors.push('project id and positive revision are required');
  if (!['draft', 'frozen'].includes(plan?.state)) errors.push('state must be draft or frozen');
  if (!['not_requested', 'pending', 'approved', 'changes_requested'].includes(plan?.review?.status)) errors.push('review.status is invalid');
  if (!Number.isSafeInteger(plan?.clock?.sampleRateHz) || plan.clock.sampleRateHz < 1) errors.push('project sampleRateHz is required');
  if (!Array.isArray(plan?.sources) || plan.sources.length === 0) errors.push('at least one source is required');
  if (!Array.isArray(plan?.coverage) || plan.coverage.length === 0) errors.push('coverage must contain at least one classified source range');
  if (!Array.isArray(plan?.sequence)) errors.push('sequence must be an array');
  if (!Array.isArray(plan?.decisions)) errors.push('decisions must be an array');
  if (!Array.isArray(plan?.questions)) errors.push('questions must be an array');
  if (!Array.isArray(plan?.spokenCorrections)) errors.push('spokenCorrections must be an array; raw ASR cannot be overwritten');
  if (plan && plan.annotations !== undefined && !Array.isArray(plan.annotations)) errors.push('annotations must be an array; notes stay separate from raw transcript evidence');
  const authKeys = ['reorder', 'repeat', 'mediaExport', ...(isEditPlanV2(plan) ? ['presentationTiming'] : [])];
  if (!plan?.authorization || !authKeys.every((key) => typeof plan.authorization[key] === 'boolean')) errors.push(`authorization must explicitly declare ${authKeys.join(', ')} booleans`);
  if (plan && Object.hasOwn(plan, 'operations')) errors.push('unsupported operation declaration; only equal-speed trim, concatenate, repeat, and authorized reorder are represented by coverage and sequence');
  if (errors.length) return {errors, warnings};

  const sources = sourceMap(plan);
  if (sources.size !== plan.sources.length) errors.push('source ids must be unique');
  const coverageById = new Map();
  const decisionsById = new Map(plan.decisions.map((item) => [item.id, item]));
  const occurrenceById = new Map();
  const presentationById = new Map();
  const segmentById = new Map();
  const tokenById = new Map();
  if (decisionsById.size !== plan.decisions.length) errors.push('decision ids must be unique');
  for (const decision of plan.decisions) {
    const allowedActions = ['retain', 'delete', 'reorder', 'repeat', 'merge', 'query', ...(isEditPlanV2(plan) ? ['presentation'] : [])];
    if (!allowedActions.includes(decision.action)) errors.push(`decision ${decision.id ?? '(unknown)'} uses unsupported action ${decision.action}`);
    if (decision.operation && !['trim', 'concatenate', 'reorder', 'repeat'].includes(decision.operation)) errors.push(`decision ${decision.id ?? '(unknown)'} requests unsupported operation ${decision.operation}`);
    if (decision.action === 'presentation') {
      if (!isEditPlanV2(plan)) errors.push(`decision ${decision.id ?? '(unknown)'} cannot declare presentation in edit-plan/1`);
      if (typeof decision.reason !== 'string' || !decision.reason.trim()) errors.push(`presentation decision ${decision.id ?? '(unknown)'} requires a non-empty reason`);
      for (const key of ['coverageIds', 'sourceRanges', 'keptOccurrenceIds', 'tokenIds', 'presentationIds']) {
        if (!Array.isArray(decision[key])) errors.push(`presentation decision ${decision.id ?? '(unknown)'} requires ${key} array`);
      }
      if ((decision.coverageIds?.length ?? -1) !== 0 || (decision.sourceRanges?.length ?? -1) !== 0 || (decision.keptOccurrenceIds?.length ?? -1) !== 0 || (decision.tokenIds?.length ?? -1) !== 0) {
        errors.push(`presentation decision ${decision.id ?? '(unknown)'} cannot claim source coverage, ranges, occurrences, or tokens`);
      }
    }
  }

  for (const source of plan.sources) {
    if (!source.id || !Number.isSafeInteger(source.order) || source.order < 0) errors.push(`source ${source.id ?? '(unknown)'} requires a unique non-negative order`);
    if (source.sha256 !== null && !/^[a-f0-9]{64}$/.test(source.sha256 ?? '')) errors.push(`source ${source.id} has invalid media SHA-256`);
    if (source.durationSamples !== null && (!safeInteger(source.durationSamples) || source.durationSamples <= 0)) errors.push(`source ${source.id} durationSamples is invalid`);
    if (!Array.isArray(source.tracks) || !Array.isArray(source.transcript?.segments)) { errors.push(`source ${source.id} requires tracks and transcript segments`); continue; }
    if (!/^[a-f0-9]{64}$/.test(source.transcript.sha256 ?? '')) errors.push(`source ${source.id} transcript SHA-256 is missing or invalid`);
    if (!['raw-bytes', 'json-serialization'].includes(source.transcript.evidenceHashMode)) errors.push(`source ${source.id} transcript evidenceHashMode is invalid`);
    if (source.transcript.evidenceRef !== null && (typeof source.transcript.evidenceRef !== 'string' || source.transcript.evidenceRef.length === 0)) errors.push(`source ${source.id} transcript evidenceRef must be a non-empty path or null`);
    if (source.transcript.evidenceRef && source.transcript.evidenceHashMode !== 'raw-bytes') errors.push(`source ${source.id} transcript with evidenceRef must use raw-bytes hash mode`);
    if (source.primaryAudioTrackId !== null && !source.tracks.some((track) => track.id === source.primaryAudioTrackId && track.kind === 'audio' && track.syncToPrimaryAudio?.status === 'primary')) errors.push(`source ${source.id} primary audio track is not declared`);
    const primaryTrack = source.tracks.find((track) => track.id === source.primaryAudioTrackId);
    if (primaryTrack?.clock?.unit === 'sample' && !safeInteger(primaryTrack.clock.sampleRateHz)) errors.push(`source ${source.id} primary audio track has no integer sample rate`);
    for (const segment of source.transcript.segments) {
      if (segmentById.has(segment.id)) errors.push(`duplicate transcript segment id ${segment.id}`);
      segmentById.set(segment.id, {source, segment});
      if (segment.sourceRange) {
        validateRange(segment.sourceRange, `segment ${segment.id}`, errors);
        if (source.durationSamples !== null && segment.sourceRange.endSample > source.durationSamples) errors.push(`segment ${segment.id} exceeds source duration`);
      }
      if (!PRECISIONS.has(segment.timingPrecision)) errors.push(`segment ${segment.id} has invalid timingPrecision`);
      if (!Array.isArray(segment.tokens)) { errors.push(`segment ${segment.id} tokens must be an array`); continue; }
      for (const token of segment.tokens) {
        if (tokenById.has(token.id)) errors.push(`duplicate token id ${token.id}`);
        tokenById.set(token.id, {source, segment, token});
        if (token.sourceRange) {
          validateRange(token.sourceRange, `token ${token.id}`, errors);
          if (segment.sourceRange && (token.sourceRange.startSample < segment.sourceRange.startSample || token.sourceRange.endSample > segment.sourceRange.endSample)) errors.push(`token ${token.id} falls outside its transcript segment`);
          if (source.durationSamples !== null && token.sourceRange.endSample > source.durationSamples) errors.push(`token ${token.id} exceeds source duration`);
        }
        if (!PRECISIONS.has(token.timingPrecision)) errors.push(`token ${token.id} has invalid timingPrecision`);
      }
    }
  }
  const correctionIds = new Set();
  const correctionTargets = new Set();
  const segmentCorrectionTargets = new Set();
  const tokenCorrectionSegments = new Set();
  for (const correction of plan.spokenCorrections ?? []) {
    if (!correction?.id || correctionIds.has(correction.id)) errors.push(`spoken correction ids must be present and unique (${correction?.id ?? '(unknown)'})`);
    correctionIds.add(correction?.id);
    if (!['candidate', 'confirmed'].includes(correction?.status)) errors.push(`spoken correction ${correction?.id ?? '(unknown)'} has invalid status`);
    if (typeof correction?.spokenText !== 'string' || correction.spokenText.length === 0) errors.push(`spoken correction ${correction?.id ?? '(unknown)'} requires non-empty spokenText`);
    const segmentRef = segmentById.get(correction?.segmentId);
    if (!segmentRef || segmentRef.source.id !== correction.sourceId) {
      errors.push(`spoken correction ${correction?.id ?? '(unknown)'} references a missing segment or wrong source`);
      continue;
    }
    let targetText = segmentRef.segment.rawText;
    let targetRange = segmentRef.segment.sourceRange;
    let targetKey = JSON.stringify([correction.sourceId, correction.segmentId, null]);
    if (correction.tokenId !== null) {
      const tokenRef = tokenById.get(correction.tokenId);
      if (!tokenRef || tokenRef.source.id !== correction.sourceId || tokenRef.segment.id !== correction.segmentId) {
        errors.push(`spoken correction ${correction.id} references a missing token or a token outside its segment`);
        continue;
      }
      targetText = tokenRef.token.rawText;
      targetRange = tokenRef.token.sourceRange;
      targetKey = JSON.stringify([correction.sourceId, correction.segmentId, correction.tokenId]);
      tokenCorrectionSegments.add(JSON.stringify([correction.sourceId, correction.segmentId]));
    } else {
      segmentCorrectionTargets.add(JSON.stringify([correction.sourceId, correction.segmentId]));
    }
    if (correction.rawText !== targetText) errors.push(`spoken correction ${correction.id} rawText must match the untouched ASR source text`);
    if (correctionTargets.has(targetKey)) errors.push(`spoken correction target ${targetKey} is duplicated or overlaps another correction`);
    correctionTargets.add(targetKey);
    const verification = correction.verification;
    if (!verification || !['not-reviewed', 'audio-listening'].includes(verification.method)
      || !['not-reviewed', 'listened'].includes(verification.listeningStatus)
      || !['not-provided', 'aligned', 'failed'].includes(verification.alignmentStatus)) {
      errors.push(`spoken correction ${correction.id} has invalid listening/alignment evidence status`);
    }
    if (verification?.sourceRange) validateRange(verification.sourceRange, `spoken correction ${correction.id} evidence`, errors);
    if (verification && (Object.hasOwn(verification, 'reviewedBy') || Object.hasOwn(verification, 'sourceSha256'))
      && (correction.status !== 'confirmed' || typeof verification.reviewedBy !== 'string' || !verification.reviewedBy.trim() || verification.sourceSha256 !== segmentRef.source.sha256)) {
      errors.push(`spoken correction ${correction.id} reviewer and source checksum must bind the confirmation to its linked audio`);
    }
    if (correction.status === 'confirmed') {
      if (verification?.method !== 'audio-listening' || verification?.listeningStatus !== 'listened') errors.push(`confirmed spoken correction ${correction.id} requires declared audio listening`);
      if (!segmentRef.source.mediaPath || !segmentRef.source.sha256) errors.push(`confirmed spoken correction ${correction.id} requires a linked, hashed audio source`);
      if (!targetRange || !verification?.sourceRange || !rangesEqual(targetRange, verification.sourceRange)) errors.push(`confirmed spoken correction ${correction.id} requires an evidence range exactly matching its transcript target`);
    }
  }
  for (const target of tokenCorrectionSegments) if (segmentCorrectionTargets.has(target)) errors.push(`spoken correction for segment ${target} overlaps a token-level correction`);
  if (new Set(plan.sources.map((source) => source.order)).size !== plan.sources.length) errors.push('source order values must be unique');

  const bySource = new Map();
  for (const item of plan.coverage) {
    if (coverageById.has(item.id)) errors.push(`duplicate coverage id ${item.id}`);
    coverageById.set(item.id, item);
    const source = sources.get(item.sourceId);
    if (!source) { errors.push(`coverage ${item.id} references missing source ${item.sourceId}`); continue; }
    validateRange(item.sourceRange, `coverage ${item.id}`, errors);
    if (item.sourceRange.sampleRateHz !== source.transcript.segments.find((s) => s.sourceRange)?.sourceRange.sampleRateHz) errors.push(`coverage ${item.id} does not use source ${source.id} primary audio sample clock`);
    if (source.durationSamples !== null && item.sourceRange.endSample > source.durationSamples) errors.push(`coverage ${item.id} exceeds source duration`);
    if (!['retain', 'delete', 'unresolved'].includes(item.disposition)) errors.push(`coverage ${item.id} has invalid disposition`);
    if (item.disposition !== 'unresolved' && !decisionsById.has(item.decisionId)) errors.push(`coverage ${item.id} has no matching decision`);
    if (item.disposition !== 'unresolved' && decisionsById.has(item.decisionId)) {
      const decision = decisionsById.get(item.decisionId);
      if (!decision.coverageIds?.includes(item.id)) errors.push(`decision ${decision.id} does not reference coverage ${item.id}`);
      const hasSourceRange = (decision.sourceRanges ?? []).some((entry) => entry.sourceId === item.sourceId && entry.sourceRange && rangesEqual(entry.sourceRange, item.sourceRange));
      if (!hasSourceRange) errors.push(`decision ${decision.id} does not preserve the exact source range for coverage ${item.id}`);
      if (item.disposition === 'retain' && decision.action !== 'retain') errors.push(`retained coverage ${item.id} must reference a retain decision`);
      if (item.disposition === 'delete' && decision.action !== 'delete') errors.push(`deleted coverage ${item.id} must reference a delete decision`);
    }
    if (item.disposition === 'unresolved' && item.decisionId !== null) errors.push(`unresolved coverage ${item.id} cannot claim a completed decision`);
    const itemTokenIds = Array.isArray(item.tokenIds) ? item.tokenIds : [];
    if (!Array.isArray(item.tokenIds)) errors.push(`coverage ${item.id} tokenIds must be an array`);
    if (new Set(itemTokenIds).size !== itemTokenIds.length) errors.push(`coverage ${item.id} has duplicate tokenIds`);
    for (const tokenId of itemTokenIds) {
      const ref = tokenById.get(tokenId);
      if (!ref) errors.push(`coverage ${item.id} references missing token ${tokenId}`);
      else if (ref.source.id !== source.id) errors.push(`coverage ${item.id} references token ${tokenId} from another source`);
      else if (ref.token.sourceRange && (ref.token.sourceRange.startSample < item.sourceRange.startSample || ref.token.sourceRange.endSample > item.sourceRange.endSample)) errors.push(`coverage ${item.id} lists token ${tokenId} outside its source range`);
      else if (!ref.token.sourceRange) {
        const segment = ref.segment;
        if (segment.sourceRange && (segment.sourceRange.startSample < item.sourceRange.startSample || segment.sourceRange.endSample > item.sourceRange.endSample)) errors.push(`coverage ${item.id} lists untimed token ${tokenId} outside its complete utterance`);
      }
    }
    if (!bySource.has(item.sourceId)) bySource.set(item.sourceId, []);
    bySource.get(item.sourceId).push(item);
    const sourceSegments = source.transcript.segments;
    const expectedTokenOrder = [];
    for (const segment of sourceSegments) {
      if (!segment.sourceRange || segment.sourceRange.startSample >= item.sourceRange.endSample || segment.sourceRange.endSample <= item.sourceRange.startSample) continue;
      const boundaries = [item.sourceRange.startSample, item.sourceRange.endSample];
      const cutsUtterance = boundaries.some((boundary) => boundary > segment.sourceRange.startSample && boundary < segment.sourceRange.endSample);
      const hasUntimedWord = segment.tokens.length === 0 || segment.tokens.some((token) => !token.sourceRange);
      if (cutsUtterance && hasUntimedWord) errors.push(`coverage boundary falls inside utterance ${segment.id} with missing word timing`);
      for (const token of segment.tokens) {
        if (!token.sourceRange) {
          if (segment.sourceRange.startSample >= item.sourceRange.startSample && segment.sourceRange.endSample <= item.sourceRange.endSample && !itemTokenIds.includes(token.id)) {
            errors.push(`coverage ${item.id} omits wholly covered untimed token ${token.id}`);
          }
          if (segment.sourceRange.startSample >= item.sourceRange.startSample && segment.sourceRange.endSample <= item.sourceRange.endSample) expectedTokenOrder.push(token.id);
          continue;
        }
        const overlaps = token.sourceRange.startSample < item.sourceRange.endSample && token.sourceRange.endSample > item.sourceRange.startSample;
        if (!overlaps) continue;
        if (token.sourceRange.startSample < item.sourceRange.startSample || token.sourceRange.endSample > item.sourceRange.endSample) {
          errors.push(`coverage ${item.id} cuts through word ${token.id}`);
        } else if (!itemTokenIds.includes(token.id)) {
          errors.push(`coverage ${item.id} omits wholly covered token ${token.id}`);
        }
        if (token.sourceRange.startSample >= item.sourceRange.startSample && token.sourceRange.endSample <= item.sourceRange.endSample) expectedTokenOrder.push(token.id);
      }
    }
    if (expectedTokenOrder.length === itemTokenIds.length && expectedTokenOrder.some((tokenId, index) => tokenId !== itemTokenIds[index])) {
      errors.push(`coverage ${item.id} tokenIds must remain in source transcript order; token-list order cannot reorder spoken audio`);
    }
  }

  for (const [sourceId, items] of bySource) {
    const source = sources.get(sourceId);
    const sorted = [...items].sort((a, b) => a.sourceRange.startSample - b.sourceRange.startSample);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous.sourceRange.endSample !== current.sourceRange.startSample) errors.push(`coverage for source ${sourceId} has an overlap or unclassified gap between ${previous.id} and ${current.id}`);
    }
    if (source.durationSamples !== null && (sorted[0].sourceRange.startSample !== 0 || sorted.at(-1).sourceRange.endSample !== source.durationSamples)) {
      errors.push(`coverage for source ${sourceId} does not span the known full duration`);
    }
    const timedSegments = source.transcript.segments.filter((segment) => segment.sourceRange);
    if (source.durationSamples === null) {
      warnings.push(`source ${sourceId} full duration is unknown; coverage is limited to the declared range`);
    }
    for (const segment of timedSegments) {
      if (segment.tokens.length > 0 && segment.tokens.every((token) => token.sourceRange)) continue;
      for (const item of sorted) {
        for (const boundary of [item.sourceRange.startSample, item.sourceRange.endSample]) {
          if (boundary > segment.sourceRange.startSample && boundary < segment.sourceRange.endSample) errors.push(`coverage boundary falls inside untimed utterance ${segment.id}`);
        }
      }
    }
    if (items.some((item) => item.disposition === 'unresolved')) warnings.push(`source ${sourceId} has unresolved coverage`);
  }
  for (const source of plan.sources) {
    if (!bySource.has(source.id) || bySource.get(source.id).length === 0) errors.push(`source ${source.id} has no coverage classification`);
  }

  const sequenceByCoverage = new Map();
  const sequenceSourceItems = [];
  const presentationDecisionIds = new Set();
  for (const [sequenceIndex, item] of plan.sequence.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`sequence item ${sequenceIndex + 1} must be an object`);
      continue;
    }
    const kind = sequenceKind(plan, item);
    if (kind === 'presentation') {
      if (!isEditPlanV2(plan)) {
        errors.push(`sequence item ${sequenceIndex + 1} cannot declare presentation in edit-plan/1`);
        continue;
      }
      const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
      const allowedPresentationKeys = new Set(['kind', 'id', 'decisionId', 'reason', 'sceneId', 'durationSamples', 'visualHandoff', 'audioHandoff']);
      if (Object.keys(item).some((key) => !allowedPresentationKeys.has(key))) errors.push(`presentation ${item.id ?? '(unknown)'} contains unsupported or source-mapping fields`);
      if (!nonEmpty(item.id) || presentationById.has(item.id)) errors.push(`presentation ids must be present and unique (${item.id ?? '(unknown)'})`);
      if (item.id) presentationById.set(item.id, item);
      if (!safeInteger(item.durationSamples) || item.durationSamples <= 0) errors.push(`presentation ${item.id ?? '(unknown)'} durationSamples must be a positive integer on the project clock`);
      if (!nonEmpty(item.decisionId) || !nonEmpty(item.reason) || !nonEmpty(item.sceneId)) errors.push(`presentation ${item.id ?? '(unknown)'} requires decisionId, reason, and sceneId`);
      if (!item.visualHandoff || !nonEmpty(item.visualHandoff.focus) || !nonEmpty(item.visualHandoff.entryState) || !nonEmpty(item.visualHandoff.exitCondition)) errors.push(`presentation ${item.id ?? '(unknown)'} requires visual focus, entryState, and exitCondition`);
      if (!item.audioHandoff || !['continue-bed', 'bed-duck', 'sound-effect', 'quiet', 'none'].includes(item.audioHandoff.role) || !nonEmpty(item.audioHandoff.rationale)) errors.push(`presentation ${item.id ?? '(unknown)'} requires an audio handoff role and rationale`);
      if (!item.decisionId || !decisionsById.has(item.decisionId)) errors.push(`presentation ${item.id ?? '(unknown)'} has no matching decision record`);
      else {
        const decision = decisionsById.get(item.decisionId);
        if (decision.action !== 'presentation' || decision.reason !== item.reason || decision.presentationIds?.length !== 1 || decision.presentationIds[0] !== item.id) {
          errors.push(`presentation ${item.id ?? '(unknown)'} decision must record its exact id and reason without source mapping`);
        }
        if (presentationDecisionIds.has(item.decisionId)) errors.push(`presentation decision ${item.decisionId} can authorize only one presentation unit`);
        presentationDecisionIds.add(item.decisionId);
      }
      continue;
    }
    if (isEditPlanV2(plan) && kind !== 'source') {
      errors.push(`sequence item ${sequenceIndex + 1} must declare kind source or presentation`);
      continue;
    }
    if (isEditPlanV2(plan) && Object.keys(item).some((key) => !['kind', 'occurrenceId', 'coverageId'].includes(key))) errors.push(`source sequence item ${item.occurrenceId ?? '(unknown)'} contains unsupported fields`);
    sequenceSourceItems.push(item);
    const coverage = coverageById.get(item.coverageId);
    if (!coverage) { errors.push(`sequence occurrence ${item.occurrenceId} references missing coverage ${item.coverageId}`); continue; }
    if (coverage.disposition !== 'retain') errors.push(`sequence occurrence ${item.occurrenceId} references non-retained coverage ${item.coverageId}`);
    if (!item.occurrenceId || occurrenceById.has(item.occurrenceId)) errors.push(`occurrence ids must be present and unique (${item.occurrenceId})`);
    occurrenceById.set(item.occurrenceId, item);
    if (!sequenceByCoverage.has(item.coverageId)) sequenceByCoverage.set(item.coverageId, []);
    sequenceByCoverage.get(item.coverageId).push(item);
  }
  if (isEditPlanV2(plan)) {
    if (plan.authorization.presentationTiming !== true && presentationById.size > 0) errors.push('presentation timing is present without explicit presentationTiming authorization');
    if (presentationById.size && sequenceSourceItems.length === 0) errors.push('presentation timing requires at least one retained real source occurrence');
    for (const decision of plan.decisions.filter((item) => item.action === 'presentation')) {
      const ids = Array.isArray(decision.presentationIds) ? decision.presentationIds : [];
      if (ids.length !== 1 || !presentationById.has(ids[0]) || presentationById.get(ids[0]).decisionId !== decision.id) errors.push(`presentation decision ${decision.id} must map to exactly one sequence presentation`);
    }
    if (presentationDecisionIds.size !== presentationById.size) errors.push('every presentation must have exactly one decision record');
  }
  const annotationIds = new Set();
  for (const annotation of plan.annotations ?? []) {
    const label = `annotation ${annotation?.id ?? '(unknown)'}`;
    if (!annotation || typeof annotation !== 'object' || Array.isArray(annotation)) {
      errors.push('annotation entries must be objects');
      continue;
    }
    if (typeof annotation.id !== 'string' || !annotation.id.trim() || annotationIds.has(annotation.id)) errors.push(`${label} requires a unique non-empty id`);
    annotationIds.add(annotation.id);
    for (const key of ['userNote', 'analysisNote', 'motionDirection']) {
      if (annotation[key] != null && (typeof annotation[key] !== 'string' || !annotation[key].trim())) errors.push(`${label} ${key} must be non-empty text when present`);
    }
    if (!annotation.userNote && !annotation.analysisNote && !annotation.motionDirection) errors.push(`${label} requires a userNote, analysisNote, or motionDirection`);
    const source = sources.get(annotation.sourceId);
    const segmentRef = segmentById.get(annotation.segmentId);
    if (!source || !segmentRef || segmentRef.source.id !== annotation.sourceId) {
      errors.push(`${label} must reference a real sourceId and segmentId; transcript.rawText remains unchanged`);
      continue;
    }
    if (annotation.tokenId != null) {
      const tokenRef = tokenById.get(annotation.tokenId);
      if (!tokenRef || tokenRef.source.id !== annotation.sourceId || tokenRef.segment.id !== annotation.segmentId) {
        errors.push(`${label} tokenId must identify a real token in its source segment`);
      }
    }
    if (annotation.occurrenceId != null && !occurrenceById.has(annotation.occurrenceId)) {
      errors.push(`${label} occurrenceId must identify a retained sequence occurrence`);
    }
    if (annotation.motionBinding != null) {
      const binding = annotation.motionBinding;
      if (!annotation.motionDirection) errors.push(`${label} motionBinding requires a motionDirection`);
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)) errors.push(`${label} motionBinding must be a structured object`);
      else {
        if (!Array.isArray(binding.objects) || !Array.isArray(binding.states) || !Array.isArray(binding.assets)
          || !Array.isArray(binding.componentCalls) || !Array.isArray(binding.phases)
          || !Array.isArray(binding.transitions) || !Array.isArray(binding.audioEvents)) {
          errors.push(`${label} motionBinding requires objects, states, assets, componentCalls, phases, transitions, and audioEvents arrays`);
        }
        for (const phase of binding.phases ?? []) {
          const anchor = phase?.anchor;
          if (!anchor || !['point', 'segment', 'presentation'].includes(anchor.kind)) {
            errors.push(`${label} phase ${phase?.id ?? '(unknown)'} requires a real point, segment, or presentation anchor`);
            continue;
          }
          if (anchor.kind === 'presentation') {
            if (!presentationById.has(anchor.presentationId) || !['start', 'end'].includes(anchor.edge)) errors.push(`${label} phase ${phase.id} references a missing presentation or invalid edge`);
          } else {
            const occurrence = occurrenceById.get(anchor.clipOccurrenceId);
            if (!occurrence) errors.push(`${label} phase ${phase.id} references a missing retained occurrence`);
            else {
              const coverage = coverageById.get(occurrence.coverageId);
              if (coverage?.sourceId !== annotation.sourceId) errors.push(`${label} phase ${phase.id} occurrence belongs to another source`);
              if (anchor.kind === 'point') {
                const tokenRef = tokenById.get(anchor.tokenId);
                if (!tokenRef || tokenRef.source.id !== annotation.sourceId || tokenRef.segment.id !== annotation.segmentId || !['start', 'end'].includes(anchor.edge)) errors.push(`${label} phase ${phase.id} point must resolve to a retained token in the annotation segment`);
              } else if (anchor.segmentId !== annotation.segmentId || !['start', 'end'].includes(anchor.edge)) {
                errors.push(`${label} phase ${phase.id} segment anchor must resolve to the annotation segment`);
              }
            }
          }
          if (typeof phase.id !== 'string' || !phase.id.trim() || typeof phase.entryState !== 'string' || !phase.entryState.trim()
            || typeof phase.exitCondition !== 'string' || !phase.exitCondition.trim()) errors.push(`${label} phase needs id, entryState, and exitCondition`);
        }
      }
    }
  }
  if (plan.integrity?.annotationSha256 !== undefined
      && plan.integrity.annotationSha256 !== hashAnnotations(plan.annotations ?? [])) {
    errors.push('annotation hash is stale; recompile the explanatory notes and Motion binding layer');
  }

  for (const item of plan.coverage) {
    const occurrences = sequenceByCoverage.get(item.id) ?? [];
    if (item.disposition === 'retain' && occurrences.length === 0) errors.push(`retained coverage ${item.id} is missing from output sequence`);
    if (item.disposition !== 'retain' && occurrences.length > 0) errors.push(`non-retained coverage ${item.id} appears in output sequence`);
    if (occurrences.length > 1) {
      if (plan.authorization.repeat !== true) errors.push(`coverage ${item.id} is repeated without repeat authorization`);
      const repeatDecision = plan.decisions.find((decision) => decision.action === 'repeat' && decision.coverageIds.includes(item.id) && occurrences.every((entry) => decision.keptOccurrenceIds.includes(entry.occurrenceId)));
      if (!repeatDecision) errors.push(`coverage ${item.id} is repeated without a matching repeat decision`);
    }
  }
  for (const item of plan.coverage.filter((entry) => entry.disposition === 'delete')) {
    const decision = decisionsById.get(item.decisionId);
    if (!decision || decision.action !== 'delete' || !decision.coverageIds.includes(item.id)) {
      errors.push(`deleted coverage ${item.id} has no deletion decision mapping`);
      continue;
    }
    if (decision.relation !== 'repeated-content') continue;
    const keptOccurrences = decision.keptOccurrenceIds;
    if (!Array.isArray(keptOccurrences) || keptOccurrences.length === 0) {
      errors.push(`repeated deletion ${item.id} must point to a retained occurrence`);
      continue;
    }
    const declaredTokens = decision.tokenIds ?? [];
    if (!Array.isArray(declaredTokens)) {
      errors.push(`repeated deletion ${item.id} tokenIds must be an array`);
      continue;
    }
    const unmatchedTokens = new Set(declaredTokens);
    for (const keptId of keptOccurrences) {
      const retained = coverageById.get(occurrenceById.get(keptId)?.coverageId);
      if (retained?.disposition !== 'retain') {
        errors.push(`repeated deletion ${item.id} must point to a retained occurrence; invalid occurrence ${keptId}`);
        continue;
      }
      const retainedTokens = new Set(Array.isArray(retained.tokenIds) ? retained.tokenIds : []);
      const matchedTokens = declaredTokens.filter((tokenId) => retainedTokens.has(tokenId));
      for (const tokenId of matchedTokens) unmatchedTokens.delete(tokenId);
      if (matchedTokens.length > 0) continue;
      if ([...retainedTokens].some((tokenId) => tokenById.get(tokenId)?.token.sourceRange)) {
        errors.push(`repeated deletion ${item.id} must identify kept tokens in occurrence ${keptId}`);
        continue;
      }
      const segments = sources.get(retained.sourceId)?.transcript?.segments;
      const hasRetainedUtterance = Array.isArray(segments) && segments.some((segment) => {
        const range = segment.sourceRange;
        return range && range.sampleRateHz === retained.sourceRange.sampleRateHz
          && range.startSample >= retained.sourceRange.startSample && range.endSample <= retained.sourceRange.endSample
          && typeof segment.rawText === 'string' && segment.rawText.trim().length > 0;
      });
      if (!hasRetainedUtterance) errors.push(`repeated deletion ${item.id} must identify a complete retained utterance in occurrence ${keptId}`);
    }
    if (unmatchedTokens.size > 0) errors.push(`repeated deletion ${item.id} references tokenIds outside the declared retained occurrences: ${[...unmatchedTokens].join(', ')}`);
  }
  for (const decision of plan.decisions) {
    for (const coverageId of decision.coverageIds ?? []) {
      const coverage = coverageById.get(coverageId);
      if (!coverage) errors.push(`decision ${decision.id} references missing coverage ${coverageId}`);
      else if (['retain', 'delete', 'repeat', 'reorder', 'merge'].includes(decision.action) && !(decision.sourceRanges ?? []).some((entry) => entry.sourceId === coverage.sourceId && entry.sourceRange && rangesEqual(entry.sourceRange, coverage.sourceRange))) {
        errors.push(`decision ${decision.id} does not preserve source range for referenced coverage ${coverageId}`);
      }
    }
  }
  const expected = plan.coverage.filter((item) => item.disposition === 'retain')
    .sort((a, b) => (sources.get(a.sourceId)?.order ?? 0) - (sources.get(b.sourceId)?.order ?? 0) || a.sourceRange.startSample - b.sourceRange.startSample)
    .map((item) => item.id);
  const actual = [];
  for (const item of sequenceSourceItems) if (!actual.includes(item.coverageId)) actual.push(item.coverageId);
  const reorderRequired = expected.length !== actual.length || expected.some((id, index) => actual[index] !== id);
  if (reorderRequired) {
    if (plan.authorization.reorder !== true) errors.push('sequence changes source order without reorder authorization');
    const moved = new Set(actual.filter((id, index) => expected[index] !== id));
    const authorized = plan.decisions.some((decision) => decision.action === 'reorder' && [...moved].every((id) => decision.coverageIds.includes(id)));
    if (!authorized) errors.push('reordered sequence has no decision covering the moved source ranges');
  }

  for (const question of plan.questions) {
    if (!question || typeof question.question !== 'string' || !Array.isArray(question.blocks)) errors.push('question entries require question and blocks');
    if (question.blocks?.some((block) => !['freeze', 'mediaExport', 'crossTrackSync', 'precision'].includes(block))) errors.push(`question ${question.id} has an invalid blocking scope`);
  }
  errors.push(...editorialMetadataErrors(plan));
  if (plan.state === 'frozen' && plan.questions.some((question) => question.blocks.includes('freeze'))) errors.push('plan cannot be frozen while a freeze-blocking question remains');
  const expectedHash = hashPlan(plan);
  if (plan.integrity?.planSha256 && plan.integrity.planSha256 !== expectedHash) errors.push('plan hash is stale; recompile from the current source decisions');
  if (plan.review?.status === 'approved' && plan.review.approvedPlanSha256 !== expectedHash) errors.push('approval feedback is stale; it does not match the current edit decisions');
  const coverageComplete = plan.sources.every((source) => {
    const items = bySource.get(source.id) ?? [];
    if (source.durationSamples === null || items.length === 0 || items.some((item) => item.disposition === 'unresolved')) return false;
    const ordered = [...items].sort((a, b) => a.sourceRange.startSample - b.sourceRange.startSample);
    return ordered[0].sourceRange.startSample === 0
      && ordered.at(-1).sourceRange.endSample === source.durationSamples
      && ordered.every((item, index) => index === 0 || ordered[index - 1].sourceRange.endSample === item.sourceRange.startSample);
  });
  return {errors, warnings, planSha256: expectedHash, coverageComplete};
}

export function validatePlan(plan) {
  return inspectPlan(plan);
}

export function upsertAnnotation(plan, annotation) {
  const before = inspectPlan(plan);
  if (before.errors.length) fail('invalid-plan', 'Cannot annotate an invalid edit plan', before.errors);
  if (!annotation || typeof annotation !== 'object' || Array.isArray(annotation)) fail('invalid-annotation', 'An annotation must be a structured object');
  const allowed = new Set(['id', 'sourceId', 'segmentId', 'tokenId', 'occurrenceId', 'userNote', 'analysisNote', 'motionDirection', 'motionBinding']);
  const unsupported = Object.keys(annotation).filter((key) => !allowed.has(key));
  if (unsupported.length) fail('invalid-annotation', `Unsupported annotation fields: ${unsupported.join(', ')}`);
  if (typeof annotation.id !== 'string' || !annotation.id.trim()) fail('invalid-annotation', 'An annotation requires an existing stable id');
  const next = deepClone(plan);
  next.annotations ??= [];
  const existingIndex = next.annotations.findIndex((item) => item.id === annotation.id);
  if (existingIndex >= 0) {
    const existing = next.annotations[existingIndex];
    for (const key of ['sourceId', 'segmentId', 'tokenId', 'occurrenceId']) {
      if ((existing[key] ?? null) !== (annotation[key] ?? null)) fail('annotation-anchor-immutable', `Annotation ${annotation.id} cannot change its ${key}; create a new annotation id for a different anchor`);
    }
    if (existing.userNote != null && annotation.userNote != null && existing.userNote !== annotation.userNote) {
      fail('user-note-immutable', `Annotation ${annotation.id} preserves its original userNote; add a separate correction note if needed`);
    }
    if (plan.state === 'frozen' && existing.analysisNote != null && annotation.analysisNote != null && existing.analysisNote !== annotation.analysisNote) {
      fail('analysis-note-immutable', `Annotation ${annotation.id} preserves the original analysisNote after the edit plan is frozen`);
    }
    next.annotations[existingIndex] = {...existing, ...deepClone(annotation), userNote: existing.userNote ?? annotation.userNote};
  } else {
    next.annotations.push(deepClone(annotation));
  }
  updateAnnotationHash(next);
  if (hashPlan(next) !== before.planSha256) fail('annotation-changed-edit-hash', 'Notes and Motion bindings must not change the frozen source, timing, sequence, or approved edit hash');
  const validation = inspectPlan(next);
  if (validation.errors.length) fail('invalid-annotation', 'Annotation failed plan validation', validation.errors);
  return next;
}

export function insertPresentationInterval(plan, spec, {authorized = false} = {}) {
  if (authorized !== true) fail('presentation-not-authorized', 'Inserting source-free project time requires explicit presentation-timing authorization');
  const before = inspectPlan(plan);
  if (before.errors.length) fail('invalid-plan', 'Cannot add a presentation interval to an invalid edit plan', before.errors);
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) fail('invalid-presentation-spec', 'A presentation interval requires a structured spec');
  const allowedKeys = new Set(['id', 'decisionId', 'reason', 'afterOccurrenceId', 'position', 'sceneId', 'durationSamples', 'visualHandoff', 'audioHandoff', 'expectedRevision', 'expectedPlanSha256']);
  const unknownKeys = Object.keys(spec).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) fail('invalid-presentation-spec', `Unsupported presentation spec fields: ${unknownKeys.join(', ')}`);
  const expected = ['id', 'decisionId', 'reason', 'sceneId', 'durationSamples', 'visualHandoff', 'audioHandoff', 'expectedRevision', 'expectedPlanSha256'];
  const missing = expected.filter((key) => spec[key] === undefined || spec[key] === null);
  if (missing.length) fail('invalid-presentation-spec', `Presentation spec is missing: ${missing.join(', ')}`);
  if (spec.expectedRevision !== plan.project.revision || spec.expectedPlanSha256 !== before.planSha256) {
    fail('presentation-stale-reference', 'Presentation spec was prepared against a different plan revision or hash; re-evaluate its source boundary before applying');
  }
  const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
  if (!nonEmpty(spec.id) || !nonEmpty(spec.decisionId) || !nonEmpty(spec.reason) || !nonEmpty(spec.sceneId)) {
    fail('invalid-presentation-spec', 'Presentation id, decision, reason, and scene id must be non-empty strings');
  }
  const usesPosition = Object.hasOwn(spec, 'position');
  if (usesPosition === Object.hasOwn(spec, 'afterOccurrenceId') || (usesPosition ? !['before-first', 'after-last'].includes(spec.position) : !nonEmpty(spec.afterOccurrenceId))) {
    fail('invalid-presentation-spec', 'Choose exactly one afterOccurrenceId or position (before-first / after-last)');
  }
  if (!safeInteger(spec.durationSamples) || spec.durationSamples <= 0) fail('invalid-presentation-duration', 'durationSamples must be a positive integer on the project sample clock');
  if (!spec.visualHandoff || !nonEmpty(spec.visualHandoff.focus) || !nonEmpty(spec.visualHandoff.entryState) || !nonEmpty(spec.visualHandoff.exitCondition)) {
    fail('invalid-presentation-visual-handoff', 'visualHandoff requires a focus, entryState, and exitCondition');
  }
  if (!spec.audioHandoff || !['continue-bed', 'bed-duck', 'sound-effect', 'quiet', 'none'].includes(spec.audioHandoff.role) || !nonEmpty(spec.audioHandoff.rationale)) {
    fail('invalid-presentation-audio-handoff', 'audioHandoff requires a supported role and a rationale; it does not assert final mix silence');
  }
  if (plan.sequence.some((item) => sequenceKind(plan, item) === 'presentation' && item.id === spec.id)) fail('presentation-id-conflict', `Presentation id ${spec.id} already exists`);
  if (plan.decisions.some((decision) => decision.id === spec.decisionId)) fail('presentation-decision-conflict', `Decision id ${spec.decisionId} already exists`);
  const firstSourceIndex = plan.sequence.findIndex((item) => sequenceKind(plan, item) === 'source');
  if (firstSourceIndex < 0) fail('presentation-boundary-missing', 'A source-free presentation interval requires at least one retained real source occurrence');
  let insertAt = spec.position === 'before-first' ? firstSourceIndex : plan.sequence.length;
  if (!usesPosition) {
    const boundaryIndex = plan.sequence.findIndex((item) => sequenceKind(plan, item) === 'source' && item.occurrenceId === spec.afterOccurrenceId);
    if (boundaryIndex < 0) fail('presentation-boundary-missing', `Source occurrence ${spec.afterOccurrenceId} is not retained in the current sequence`);
    if (!plan.sequence.slice(boundaryIndex + 1).some((item) => sequenceKind(plan, item) === 'source')) {
      fail('presentation-boundary-terminal', 'Use position: after-last for a presentation after the final retained source');
    }
    insertAt = boundaryIndex + 1;
    while (insertAt < plan.sequence.length && sequenceKind(plan, plan.sequence[insertAt]) === 'presentation') insertAt += 1;
  }
  const copy = deepClone(plan);
  copy.format = EDIT_PLAN_V2_FORMAT;
  copy.authorization.presentationTiming = true;
  copy.state = 'draft';
  copy.project.revision += 1;
  copy.review = {status: 'not_requested', approvedPlanSha256: null};
  copy.sequence = copy.sequence.map((item) => sequenceKind(plan, item) === 'source' ? {kind: 'source', occurrenceId: item.occurrenceId, coverageId: item.coverageId} : item);
  const presentation = {
    kind: 'presentation',
    id: spec.id,
    decisionId: spec.decisionId,
    reason: spec.reason,
    sceneId: spec.sceneId,
    durationSamples: spec.durationSamples,
    visualHandoff: deepClone(spec.visualHandoff),
    audioHandoff: deepClone(spec.audioHandoff),
  };
  copy.sequence.splice(insertAt, 0, presentation);
  copy.decisions.push({
    id: spec.decisionId,
    action: 'presentation',
    reason: spec.reason,
    coverageIds: [],
    sourceRanges: [],
    keptOccurrenceIds: [],
    tokenIds: [],
    presentationIds: [spec.id],
  });
  copy.integrity.planSha256 = hashPlan(copy);
  const after = inspectPlan(copy);
  if (after.errors.length) fail('invalid-presentation-result', 'Presentation interval failed edit-plan validation', after.errors);
  return copy;
}

export async function verifyPlanEvidence(plan, {baseDir = process.cwd()} = {}) {
  const validation = inspectPlan(plan);
  if (validation.errors.length) fail('invalid-plan', 'Cannot verify evidence for an invalid edit plan', validation.errors);
  const verified = [];
  const unlocated = [];
  for (const source of plan.sources) {
    const transcript = source.transcript;
    if (!transcript.evidenceRef) {
      unlocated.push({sourceId: source.id, sha256: transcript.sha256, reason: 'no-evidence-ref'});
      continue;
    }
    if (transcript.evidenceHashMode !== 'raw-bytes') {
      fail('transcript-evidence-mode', `Source ${source.id} has an evidenceRef but its hash is not declared as raw file bytes`, {sourceId: source.id, evidenceRef: transcript.evidenceRef});
    }
    const evidencePath = resolve(baseDir, transcript.evidenceRef);
    let actualHash;
    try { actualHash = await hashFile(evidencePath); }
    catch (error) {
      fail('transcript-evidence-unreadable', `Source ${source.id} transcript evidence cannot be read`, {sourceId: source.id, evidenceRef: transcript.evidenceRef, code: error?.code ?? null});
    }
    if (actualHash !== transcript.sha256) {
      fail('transcript-evidence-stale', `Source ${source.id} transcript evidence hash no longer matches the imported source`, {sourceId: source.id, evidenceRef: transcript.evidenceRef, expectedSha256: transcript.sha256, actualSha256: actualHash});
    }
    verified.push({sourceId: source.id, evidenceRef: transcript.evidenceRef, sha256: actualHash});
  }
  return {verified, unlocated};
}

function roundRatio(value, numerator, denominator) {
  const product = BigInt(value) * BigInt(numerator);
  const divisor = BigInt(denominator);
  return Number((product * 2n + divisor) / (2n * divisor));
}

function mapSampleBoundary(sample, clipStart, sourceRate, targetRate) {
  return roundRatio(sample - clipStart, targetRate, sourceRate);
}

export function mapRangeToTarget(sourceRange, clipRange, targetRange, outputRate) {
  const startOffset = mapSampleBoundary(sourceRange.startSample, clipRange.startSample, sourceRange.sampleRateHz, outputRate);
  const endOffset = mapSampleBoundary(sourceRange.endSample, clipRange.startSample, sourceRange.sampleRateHz, outputRate);
  return interval(targetRange.startSample + startOffset, targetRange.startSample + endOffset, outputRate);
}

export function compilePlan(plan) {
  const inspection = inspectPlan(plan);
  if (inspection.errors.length) fail('invalid-plan', 'Edit plan failed validation', inspection.errors);
  const sources = sourceMap(plan);
  const coverageById = new Map(plan.coverage.map((item) => [item.id, item]));
  const segmentsBySource = new Map();
  const wordsById = new Map();
  const correctionsByTokenId = new Map((plan.spokenCorrections ?? []).filter((correction) => correction.tokenId !== null).map((correction) => [correction.tokenId, correction]));
  const correctionsBySegmentId = new Map((plan.spokenCorrections ?? []).filter((correction) => correction.tokenId === null).map((correction) => [correction.segmentId, correction]));
  for (const source of plan.sources) {
    segmentsBySource.set(source.id, source.transcript.segments);
    for (const segment of source.transcript.segments) for (const token of segment.tokens) wordsById.set(token.id, token);
  }
  let targetCursor = 0;
  const clips = [];
  const units = [];
  const warnings = [...inspection.warnings];
  const projectRate = plan.clock.sampleRateHz;
  for (const occurrence of plan.sequence) {
    if (isEditPlanV2(plan) && occurrence.kind === 'presentation') {
      const targetRange = interval(targetCursor, targetCursor + occurrence.durationSamples, projectRate);
      units.push({
        kind: 'presentation',
        id: occurrence.id,
        decisionId: occurrence.decisionId,
        reason: occurrence.reason,
        sceneId: occurrence.sceneId,
        durationSamples: occurrence.durationSamples,
        targetRange,
        visualHandoff: deepClone(occurrence.visualHandoff),
        audioHandoff: deepClone(occurrence.audioHandoff),
      });
      targetCursor = targetRange.endSample;
      continue;
    }
    const coverage = coverageById.get(occurrence.coverageId);
    const source = sources.get(coverage.sourceId);
    const sourceRange = coverage.sourceRange;
    const targetLength = roundRatio(sourceRange.endSample - sourceRange.startSample, projectRate, sourceRange.sampleRateHz);
    const targetRange = interval(targetCursor, targetCursor + targetLength, projectRate);
    const segmentRows = segmentsBySource.get(source.id) ?? [];
    const includedSegments = segmentRows.filter((segment) => segment.sourceRange && segment.sourceRange.startSample >= sourceRange.startSample && segment.sourceRange.endSample <= sourceRange.endSample);
    const words = [];
    for (const tokenId of coverage.tokenIds) {
      const token = wordsById.get(tokenId);
      if (!token?.sourceRange) continue;
      if (token.sourceRange.startSample < sourceRange.startSample || token.sourceRange.endSample > sourceRange.endSample) fail('cut-through-word', `Coverage ${coverage.id} cuts through word ${token.id}`);
      words.push({
        tokenId: token.id,
        text: token.rawText,
        ...(correctionsByTokenId.get(token.id)?.status === 'confirmed' ? {spokenText: correctionsByTokenId.get(token.id).spokenText} : {}),
        sourceRange: token.sourceRange,
        targetRange: mapRangeToTarget(token.sourceRange, sourceRange, targetRange, projectRate),
        timingPrecision: token.timingPrecision,
      });
    }
    const transcriptSegments = includedSegments.map((segment) => {
      const correction = correctionsBySegmentId.get(segment.id);
      return {
        segmentId: segment.id,
        text: segment.rawText,
        ...(correction?.status === 'confirmed' ? {spokenText: correction.spokenText} : {}),
        sourceRange: segment.sourceRange,
        targetRange: mapRangeToTarget(segment.sourceRange, sourceRange, targetRange, projectRate),
        timingPrecision: segment.timingPrecision,
      };
    });
    const allPrecisions = [...words.map((word) => word.timingPrecision), ...transcriptSegments.map((segment) => segment.timingPrecision)];
    const timingPrecision = allPrecisions.includes('estimated') ? 'estimated'
      : allPrecisions.includes('utterance') ? 'utterance'
        : allPrecisions.includes('aligned') ? 'aligned' : 'measured';
    if (timingPrecision === 'estimated' || timingPrecision === 'utterance') warnings.push(`clip ${occurrence.occurrenceId} contains ${timingPrecision} timing; do not use as a precise word cue`);
    const clip = {
      occurrenceId: occurrence.occurrenceId,
      sourceId: source.id,
      coverageId: coverage.id,
      sourceRange,
      targetRange,
      timingPrecision,
      words,
      transcriptSegments,
    };
    clips.push(clip);
    if (isEditPlanV2(plan)) units.push({kind: 'source', ...clip});
    targetCursor = targetRange.endSample;
  }
  const decisions = new Map(plan.decisions.map((decision) => [decision.id, decision]));
  const deletions = plan.coverage.filter((item) => item.disposition === 'delete').map((item) => {
    const decision = decisions.get(item.decisionId);
    return {
      coverageId: item.id,
      sourceId: item.sourceId,
      sourceRange: item.sourceRange,
      decisionId: decision.id,
      reason: decision.reason,
      keptOccurrenceIds: decision.keptOccurrenceIds,
    };
  });
  const timeline = {
    format: isEditPlanV2(plan) ? TIMELINE_V2_FORMAT : TIMELINE_FORMAT,
    project: {...plan.project},
    state: plan.state,
    review: deepClone(plan.review),
    planSha256: inspection.planSha256,
    annotationSha256: hashAnnotations(plan.annotations ?? []),
    sources: plan.sources.map((source) => ({
      id: source.id,
      order: source.order,
      recordingSegment: source.recordingSegment,
      sha256: source.sha256,
      primaryAudioTrackId: source.primaryAudioTrackId,
      tracks: deepClone(source.tracks),
      transcript: {sha256: source.transcript.sha256, evidenceRef: source.transcript.evidenceRef, evidenceHashMode: source.transcript.evidenceHashMode},
    })),
    clock: {
      sampleRateHz: projectRate,
      unit: 'sample',
      quantization: 'Each source/word boundary is rounded to the nearest output sample; intervals remain half-open.',
    },
    coverageComplete: inspection.coverageComplete,
    durationSamples: targetCursor,
    clips,
    deletions,
    questions: deepClone(plan.questions),
    warnings: [...new Set(warnings)],
    spokenCorrections: deepClone(plan.spokenCorrections ?? []),
  };
  if (Array.isArray(plan.annotations)) {
    timeline.annotations = plan.annotations.map((annotation) => {
      const matches = clips.filter((clip) => clip.sourceId === annotation.sourceId
        && (annotation.occurrenceId == null || clip.occurrenceId === annotation.occurrenceId));
      const resolvedTargets = matches.flatMap((clip) => {
        const target = annotation.tokenId != null
          ? clip.words.find((word) => word.tokenId === annotation.tokenId)
          : clip.transcriptSegments.find((segment) => segment.segmentId === annotation.segmentId);
        return target ? [{occurrenceId: clip.occurrenceId, targetRange: deepClone(target.targetRange), timingPrecision: target.timingPrecision}] : [];
      });
      return {
        ...deepClone(annotation),
        resolution: resolvedTargets.length ? 'resolved' : 'not-in-retained-timeline',
        resolvedTargets,
      };
    });
  }
  if (isEditPlanV2(plan)) timeline.units = units;
  return timeline;
}

export function freezePlan(plan) {
  const frozen = deepClone(plan);
  frozen.state = 'frozen';
  updateAnnotationHash(frozen);
  frozen.integrity.planSha256 = hashPlan(frozen);
  const result = inspectPlan(frozen);
  if (result.errors.length) fail('cannot-freeze', 'Plan cannot be frozen', result.errors);
  return frozen;
}

export function authorizeReview(plan, status, planSha256) {
  if (!['not_requested', 'pending', 'approved', 'changes_requested'].includes(status)) fail('invalid-review-status', `Unknown review status: ${status}`);
  const currentHash = hashPlan(plan);
  if (planSha256 && planSha256 !== currentHash) fail('stale-review', 'Review does not match the current plan hash');
  const copy = deepClone(plan);
  copy.review.status = status;
  copy.review.approvedPlanSha256 = status === 'approved' ? currentHash : null;
  return copy;
}

async function pathIdentity(pathValue) {
  const absolute = resolve(pathValue);
  try {
    const canonical = await realpath(absolute);
    const info = await stat(canonical);
    return {canonical, dev: info.dev, ino: info.ino, exists: true};
  } catch {
    let ancestor = dirname(absolute);
    const remainder = [basename(absolute)];
    while (ancestor !== dirname(ancestor)) {
      try {
        const canonicalAncestor = await realpath(ancestor);
        return {canonical: join(canonicalAncestor, ...remainder.reverse()), dev: null, ino: null, exists: false};
      } catch {
        remainder.push(basename(ancestor));
        ancestor = dirname(ancestor);
      }
    }
    return {canonical: absolute, dev: null, ino: null, exists: false};
  }
}

export async function assertSafeOutputPath(outPath, inputPaths = [], {replace = false} = {}) {
  if (!outPath) fail('missing-output', 'An output path is required');
  const output = await pathIdentity(outPath);
  for (const inputPath of inputPaths.filter(Boolean)) {
    const input = await pathIdentity(inputPath);
    const sameInode = output.exists && input.exists && output.dev === input.dev && output.ino === input.ino;
    if (output.canonical === input.canonical || sameInode) fail('path-alias', `Output path aliases an input and cannot be written: ${outPath}`);
  }
  if (output.exists && !replace) fail('output-exists', `Output already exists; use --replace only for a derived file: ${outPath}`);
  return output;
}

export async function writeJsonOutput(outPath, value, inputPaths = [], {replace = false} = {}) {
  await assertSafeOutputPath(outPath, inputPaths, {replace});
  const absolute = resolve(outPath);
  const tempPath = join(dirname(absolute), `.${basename(absolute)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  const handle = await open(tempPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    if (replace) await rename(tempPath, absolute);
    else {
      await link(tempPath, absolute);
      await unlink(tempPath).catch(() => {});
    }
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(tempPath).catch(() => {});
    throw error;
  }
  return absolute;
}

async function writeCaptionOutputPair(jsonPath, jsonValue, srtPath, srtText, inputPaths = [], {replace = false} = {}) {
  const jsonAbsolute = resolve(jsonPath);
  const srtAbsolute = resolve(srtPath);
  const jsonIdentity = await assertSafeOutputPath(jsonAbsolute, inputPaths, {replace});
  const srtIdentity = await assertSafeOutputPath(srtAbsolute, inputPaths, {replace});
  if (jsonIdentity.canonical === srtIdentity.canonical
    || (jsonIdentity.exists && srtIdentity.exists && jsonIdentity.dev === srtIdentity.dev && jsonIdentity.ino === srtIdentity.ino)) {
    fail('path-alias', 'Caption JSON and SRT outputs must be distinct files');
  }
  for (const output of [jsonAbsolute, srtAbsolute]) {
    try {
      const info = await lstat(output);
      if (info.isSymbolicLink() || !info.isFile()) fail('unsafe-output', `Caption output must be a regular file path, not a symlink or special file: ${output}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const rows = [
    {target: jsonAbsolute, bytes: Buffer.from(`${JSON.stringify(jsonValue, null, 2)}\n`, 'utf8')},
    {target: srtAbsolute, bytes: Buffer.from(srtText, 'utf8')},
  ];
  const staged = [];
  const backups = [];
  const committed = [];
  try {
    for (const row of rows) {
      const temp = join(dirname(row.target), `.${basename(row.target)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
      const handle = await open(temp, 'wx', 0o600);
      try { await handle.writeFile(row.bytes); await handle.sync(); }
      finally { await handle.close(); }
      staged.push({target: row.target, temp});
    }
    if (replace) {
      for (const row of rows) {
        try {
          await lstat(row.target);
          const backup = join(dirname(row.target), `.${basename(row.target)}.${process.pid}.${randomBytes(6).toString('hex')}.bak`);
          await rename(row.target, backup);
          backups.push({target: row.target, backup});
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    for (const row of staged) { await rename(row.temp, row.target); committed.push(row.target); }
    await Promise.all(backups.map(({backup}) => rm(backup, {force: true}).catch(() => {})));
  } catch (error) {
    await Promise.all(staged.map(({temp}) => rm(temp, {force: true})));
    await Promise.all(committed.map((target) => rm(target, {force: true})));
    for (const {target, backup} of backups.reverse()) await rename(backup, target).catch(() => {});
    throw error;
  }
  return {json: jsonAbsolute, srt: srtAbsolute};
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

async function ffprobeJson(ffprobePath, args) {
  try {
    const {stdout} = await execFile(ffprobePath, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
    return JSON.parse(stdout);
  } catch (error) {
    fail('ffprobe-failed', `ffprobe could not inspect media: ${error.stderr || error.message}`);
  }
}

async function inspectAudioSource(source, ffprobePath) {
  const mediaPath = source.mediaPath;
  if (!mediaPath) fail('media-path-missing', `Source ${source.id} has no linked mediaPath`);
  if (!source.sha256) fail('media-hash-missing', `Source ${source.id} has no evidence SHA-256`);
  const actualHash = await hashFile(mediaPath);
  if (actualHash !== source.sha256) fail('source-hash-stale', `Source ${source.id} no longer matches its imported media hash`);
  const primary = source.tracks.find((track) => track.id === source.primaryAudioTrackId && track.kind === 'audio');
  if (!primary || primary.syncToPrimaryAudio?.status !== 'primary') fail('primary-audio-missing', `Source ${source.id} has no declared primary audio track`);
  let probe;
  try { probe = await ffprobeJson(ffprobePath, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mediaPath]); }
  catch (probeError) {
    if (String(mediaPath).toLowerCase().endsWith('.wav')) {
      try {
        const {inspectWavFile} = await import('./audio-postprocess.mjs');
        const wav = await inspectWavFile(mediaPath);
        if (primary.streamIndex !== undefined && primary.streamIndex !== 0) fail('audio-stream-missing', `WAV source ${source.id} only has stream 0 but the plan declares stream ${primary.streamIndex}`);
        if (wav.sampleRateHz !== primary.clock?.sampleRateHz) fail('source-clock-mismatch', `WAV source ${source.id} sample rate does not match the declared primary clock`);
        if (source.durationSamples !== null && Math.abs(wav.sampleCount - source.durationSamples) > 1) fail('source-duration-mismatch', `WAV source ${source.id} sample count differs from declared durationSamples`);
        return {
          source,
          mediaPath,
          streamIndex: 0,
          sampleRateHz: wav.sampleRateHz,
          channels: wav.channels,
          channelLayout: null,
          sampleFormat: wav.audioFormat === 3 ? 'flt' : `s${wav.bitsPerSample}`,
          bitsPerSample: wav.bitsPerSample,
          originalIdentity: await pathIdentity(mediaPath),
        };
      } catch (wavError) {
        if (wavError instanceof AsrcutError) throw wavError;
      }
    }
    throw probeError;
  }
  const allStreams = Array.isArray(probe.streams) ? probe.streams : [];
  const audioStreams = allStreams.filter((stream) => stream.codec_type === 'audio');
  let stream = null;
  if (Number.isInteger(primary.streamIndex)) stream = audioStreams.find((candidate) => candidate.index === primary.streamIndex) ?? null;
  else if (audioStreams.length === 1) stream = audioStreams[0];
  else fail('audio-stream-ambiguous', `Source ${source.id} has ${audioStreams.length} audio streams; declare the intended streamIndex`);
  if (!stream) fail('audio-stream-missing', `Declared primary audio stream for source ${source.id} is not present in media`);
  const rate = Number(stream.sample_rate);
  if (!safeInteger(rate) || rate !== primary.clock?.sampleRateHz) fail('source-clock-mismatch', `Source ${source.id} decoded sample rate ${stream.sample_rate} does not match declared primary clock ${primary.clock?.sampleRateHz}`);
  if (source.durationSamples !== null && source.durationSamples > 0) {
    const durationSeconds = Number(stream.duration ?? probe.format?.duration);
    if (Number.isFinite(durationSeconds) && Math.abs(durationSeconds * rate - source.durationSamples) > 1) fail('source-duration-mismatch', `Source ${source.id} media duration differs from declared durationSamples`);
  }
  return {
    source,
    mediaPath,
    streamIndex: stream.index,
    sampleRateHz: rate,
    channels: Number(stream.channels),
    channelLayout: stream.channel_layout ?? null,
    sampleFormat: stream.sample_fmt ?? null,
    bitsPerSample: Number(stream.bits_per_raw_sample || stream.bits_per_sample || (stream.sample_fmt?.includes('32') ? 32 : 16)),
    originalIdentity: await pathIdentity(mediaPath),
  };
}

function pcmCodecFor(sources) {
  const maxBits = Math.max(...sources.map((source) => source.bitsPerSample));
  const hasFloat = sources.some((source) => String(source.sampleFormat).startsWith('flt') || String(source.sampleFormat).startsWith('dbl'));
  if (hasFloat || maxBits > 24) return {codec: 'pcm_s32le', container: 'wav'};
  if (maxBits > 16) return {codec: 'pcm_s24le', container: 'wav'};
  return {codec: 'pcm_s16le', container: 'wav'};
}

function ffmpegSilenceLayout(media) {
  const knownLayouts = new Set(['mono', 'stereo', '2.1', '3.0', '3.0(back)', '4.0', 'quad', '5.0', '5.0(side)', '5.1', '5.1(side)', '6.1', '7.1', '7.1(wide)', '7.1(wide-side)']);
  if (knownLayouts.has(media.channelLayout)) return media.channelLayout;
  const defaults = new Map([[1, 'mono'], [2, 'stereo'], [3, '2.1'], [4, 'quad'], [5, '5.0'], [6, '5.1'], [7, '6.1'], [8, '7.1']]);
  const fallback = defaults.get(media.channels);
  if (!fallback) fail('unsupported-channel-layout', `Cannot generate matching presentation silence for ${media.channels} channels without a known FFmpeg channel layout`);
  return fallback;
}

async function atomicWriteBytes(outPath, bytes, inputPaths, {replace = false} = {}) {
  await assertSafeOutputPath(outPath, inputPaths, {replace});
  const absolute = resolve(outPath);
  const tempPath = join(dirname(absolute), `.${basename(absolute)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  const handle = await open(tempPath, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    if (replace) await rename(tempPath, absolute);
    else {
      await link(tempPath, absolute);
      await unlink(tempPath).catch(() => {});
    }
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(tempPath).catch(() => {});
    throw error;
  }
  return absolute;
}

async function verifyRoomToneReplacements({plan, timeline, roomTone, silenceMap, authorizeRoomTone, baseDir, ffmpegPath, ffprobePath}) {
  if (roomTone == null && silenceMap == null && authorizeRoomTone !== true) return [];
  if (authorizeRoomTone !== true) fail('room-tone-not-authorized', 'Room-tone rendering requires explicit authorization in addition to mediaExport');
  if (!roomTone || !silenceMap) fail('room-tone-evidence-required', 'Room-tone rendering requires both a bound replacement request and the original source silence map');
  if (roomTone.format !== 'laohu.asrcut.room-tone/1' || roomTone.projectId !== plan.project.id || roomTone.revision !== plan.project.revision || roomTone.planSha256 !== timeline.planSha256) {
    fail('room-tone-request-stale', 'Room-tone request must bind the exact project, revision, and plan SHA-256');
  }
  if (Object.keys(roomTone).some((key) => !['format', 'projectId', 'revision', 'planSha256', 'replacements'].includes(key))
    || !Array.isArray(roomTone.replacements) || roomTone.replacements.length === 0) fail('invalid-room-tone-request', 'Room-tone request must contain at least one exact presentation replacement');
  const units = timeline.units ?? [];
  const used = new Set();
  const results = [];
  const {verifyRoomToneCandidate} = await import('./audio-probe.mjs');
  for (const row of roomTone.replacements) {
    if (!row || Object.keys(row).some((key) => !['presentationId', 'sourceId', 'roomToneSourceRange'].includes(key))) fail('invalid-room-tone-request', 'Invalid room-tone replacement fields');
    if (used.has(row.presentationId)) fail('room-tone-target-duplicate', `Presentation ${row.presentationId} has multiple replacement requests`);
    const index = units.findIndex((unit) => unit.kind === 'presentation' && unit.id === row.presentationId);
    if (index < 0) fail('room-tone-target-missing', `Presentation ${row.presentationId} must exist on the compiled timeline`);
    const previous = units.slice(0, index).findLast((unit) => unit.kind === 'source');
    const next = units.slice(index + 1).find((unit) => unit.kind === 'source');
    const source = plan.sources.find((item) => item.id === row.sourceId);
    if (!source || ![previous?.sourceId, next?.sourceId].includes(source.id)) fail('room-tone-source-not-adjacent', 'Room tone must originate on the primary track of an adjacent retained source');
    const range = row.roomToneSourceRange;
    const errors = [];
    validateRange(range, 'roomToneSourceRange', errors);
    if (errors.length || Object.keys(range).length !== 3 || range.endSample > source.durationSamples) fail('invalid-room-tone-range', 'Room tone requires an exact range inside the original source clock', errors);
    const sourceBounds = interval(0, source.durationSamples, range.sampleRateHz);
    if (!sourceSpeechGaps(source, sourceBounds).some((gap) => containsRange(gap.range, range))) fail('room-tone-overlaps-speech', 'Room-tone source range intersects transcript speech or lacks a bounded source gap');
    if (roundRatio(range.endSample - range.startSample, timeline.clock.sampleRateHz, range.sampleRateHz) !== units[index].durationSamples) {
      fail('room-tone-length-mismatch', `Replacement must render exactly ${units[index].durationSamples} project samples without padding or retiming`);
    }
    await verifyRoomToneCandidate({silenceMap, sourceId: source.id, plan, range, baseDir, ffmpegPath, ffprobePath});
    used.add(row.presentationId);
    results.push({presentationId: row.presentationId, sourceId: source.id, roomToneSourceRange: structuredClone(range), targetRange: units[index].targetRange,
      sourceSha256: source.sha256, probeSha256: silenceMap.probeSha256});
  }
  return results;
}

function audioSeamFades(timeline, units, seamFadeMs) {
  const requestedSamples = Math.round(seamFadeMs * timeline.clock.sampleRateHz / 1000);
  const seams = requestedSamples > 0 ? timelineSeams(timeline).filter((seam) => seam.type === 'source-cut') : [];
  const fadesIn = new Set(seams.map((seam) => seam.rightIndex));
  const fadesOut = new Set(seams.map((seam) => seam.leftIndex));
  const edges = units.map((unit, index) => {
    const length = unit.targetRange.endSample - unit.targetRange.startSample;
    const opposing = fadesIn.has(index) && fadesOut.has(index);
    const samples = Math.min(requestedSamples, opposing ? Math.floor(length / 2) : length);
    return {inSamples: fadesIn.has(index) ? samples : 0, outSamples: fadesOut.has(index) ? samples : 0};
  });
  const receipt = seams.map((seam) => ({targetSample: seam.targetSample, leftOccurrenceId: seam.left.occurrenceId, rightOccurrenceId: seam.right.occurrenceId,
    fadeOutSamples: edges[seam.leftIndex].outSamples, fadeInSamples: edges[seam.rightIndex].inSamples}));
  return {edges, receipt};
}

export async function exportAudio({plan, timeline, outPath, tmpDir = join(process.cwd(), '.cache/tmp/laohu-asrcut'), baseDir = process.cwd(), ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg', ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe', audioPlanPath = null, processedSourcePath = null, audioReceiptPath = null, seamFadeMs, roomTone = null, silenceMap = null, authorizeRoomTone = false, timelineSha256 = null} = {}) {
  if (!plan || !timeline || !outPath) fail('missing-export-input', 'exportAudio requires plan, compiled timeline, and outPath');
  if (seamFadeMs !== undefined && (!Number.isFinite(seamFadeMs) || seamFadeMs < 0 || seamFadeMs > 30)) fail('invalid-seam-fade', 'seamFadeMs must be a number from 0 to 30 milliseconds');
  if (timelineSha256 !== null && !/^[a-f0-9]{64}$/.test(timelineSha256)) fail('invalid-timeline-sha', 'timelineSha256 must identify the supplied canonical timeline file bytes');
  const validation = inspectPlan(plan);
  if (validation.errors.length) fail('invalid-plan', 'Cannot export from an invalid edit plan', validation.errors);
  const transcriptEvidence = await verifyPlanEvidence(plan, {baseDir});
  if (plan.state !== 'frozen') fail('plan-not-frozen', 'Audio export requires a frozen plan; freeze is a stable reference state, not approval or audition evidence');
  if (plan.authorization.mediaExport !== true) fail('export-not-authorized', 'Plan does not contain explicit mediaExport authorization');
  if (timeline.state !== 'frozen' || timeline.planSha256 !== validation.planSha256 || timeline.project.id !== plan.project.id || timeline.project.revision !== plan.project.revision) {
    fail('timeline-stale', 'Timeline identity, revision, state, or plan hash does not match the frozen edit plan');
  }
  const compiled = compilePlan(plan);
  if (stableJson(compiled) !== stableJson(timeline)) fail('timeline-not-canonical', 'Timeline differs from the deterministic compiler result; recompile before export');
  const blockers = plan.questions.filter((question) => question.blocks.includes('mediaExport'));
  if (blockers.length) fail('export-blocked-by-question', 'Unresolved questions block audio media export', blockers.map((question) => ({id: question.id, question: question.question})));
  if (!compiled.coverageComplete) fail('coverage-incomplete', 'Audio media export requires known full source durations and fully classified coverage');
  if (plan.coverage.some((item) => item.disposition === 'unresolved')) fail('unresolved-coverage', 'Audio media export is blocked while any source coverage remains unresolved');
  if (compiled.clips.length === 0 || compiled.durationSamples <= 0) fail('empty-export', 'Audio media export has no retained samples');
  if (!String(outPath).toLowerCase().endsWith('.wav')) fail('unsupported-output-format', 'This exporter supports PCM WAV only');

  const suppliedTreatment = [audioPlanPath, processedSourcePath, audioReceiptPath].filter(Boolean);
  if (suppliedTreatment.length !== 0 && suppliedTreatment.length !== 3) fail('source-treatment-incomplete', 'Processed-source export requires all of --audio-plan, --processed-source, and --audio-receipt; existing raw-source behavior remains unchanged when none are supplied');
  let sourceTreatment = null;
  if (suppliedTreatment.length === 3) {
    if (plan.sources.length !== 1) fail('source-treatment-multisource-unsupported', 'This first source-treatment adapter supports one explicitly bound source; multi-source timing/mixing is not inferred');
    const source = plan.sources[0];
    const absoluteSourcePath = source.mediaPath ? resolve(baseDir, source.mediaPath) : null;
    const {verifySourceTreatment} = await import('./audio-postprocess.mjs');
    sourceTreatment = await verifySourceTreatment({audioPlanPath, processedPath: processedSourcePath, receiptPath: audioReceiptPath, editPlan: plan, source: {...source, mediaPath: absoluteSourcePath}});
  }

  const absoluteOutput = resolve(outPath);
  const outputParent = dirname(absoluteOutput);
  const outputReceipt = `${absoluteOutput}.artifact.json`;
  const sourcePaths = [...mediaPaths(plan, baseDir), ...(sourceTreatment ? [audioPlanPath, processedSourcePath, audioReceiptPath] : [])];
  const evidencePaths = transcriptEvidencePaths(plan, baseDir);
  const planPathInputs = [absoluteOutput, outputReceipt, ...sourcePaths, ...evidencePaths];
  await assertSafeOutputPath(absoluteOutput, planPathInputs.filter((value) => value !== absoluteOutput));
  await assertSafeOutputPath(outputReceipt, [absoluteOutput, ...sourcePaths, ...evidencePaths]);
  const outputParentInfo = await stat(outputParent).catch(() => null);
  if (!outputParentInfo?.isDirectory()) fail('output-directory-missing', 'Audio export output directory must already exist');
  await mkdir(tmpDir, {recursive: true});
  const tempInfo = await stat(tmpDir);
  if (tempInfo.dev !== outputParentInfo.dev) fail('cross-volume-temp', 'Audio export temp directory and output must be on the same volume');

  const sourceDetails = new Map();
  for (const source of plan.sources) sourceDetails.set(source.id, await inspectAudioSource({...source, mediaPath: source.mediaPath ? resolve(baseDir, source.mediaPath) : null}, ffprobePath));
  if (sourceTreatment) {
    const original = sourceDetails.get(sourceTreatment.sourceId);
    if (!original || sourceTreatment.sampleRateHz !== original.sampleRateHz || sourceTreatment.sampleCount !== plan.sources[0].durationSamples || sourceTreatment.channels !== original.channels) {
      fail('source-treatment-clock', 'Processed source treatment must preserve the imported source sample rate, declared sample count, and channel count');
    }
    sourceDetails.set(sourceTreatment.sourceId, {...original, rawMediaPath: original.mediaPath, rawStreamIndex: original.streamIndex, mediaPath: sourceTreatment.mediaPath, streamIndex: sourceTreatment.streamIndex, sampleFormat: 's32', bitsPerSample: 32, processedSha256: sourceTreatment.outputSha256, processedIdentity: sourceTreatment.processedIdentity, sourceTreatment});
  }
  const mediaShapes = [...sourceDetails.values()];
  const firstShape = mediaShapes[0];
  for (const media of mediaShapes.slice(1)) {
    if (media.channels !== firstShape.channels || (media.channelLayout && firstShape.channelLayout && media.channelLayout !== firstShape.channelLayout)) {
      fail('channel-layout-mismatch', 'Audio sources have different channel layouts; this exporter will not silently mix or remap channels');
    }
  }
  const roomToneReplacements = await verifyRoomToneReplacements({plan, timeline: compiled, roomTone, silenceMap, authorizeRoomTone, baseDir, ffmpegPath, ffprobePath});
  const toneByPresentation = new Map(roomToneReplacements.map((row) => [row.presentationId, row]));

  const unique = randomBytes(8).toString('hex');
  const workDir = join(resolve(tmpDir), `asrcut-${process.pid}-${unique}`);
  await mkdir(workDir, {recursive: false});
  const temporaryWave = join(workDir, 'joined.wav');
  let finalOutputCreated = false;
  try {
    const args = ['-nostdin', '-hide_banner', '-v', 'error', '-y'];
    const filters = [];
    const timelineUnits = compiled.format === TIMELINE_V2_FORMAT
      ? compiled.units
      : compiled.clips.map((clip) => ({kind: 'source', ...clip}));
    const fades = audioSeamFades(compiled, timelineUnits, seamFadeMs ?? 0);
    let inputIndex = 0;
    const concatLabels = [];
    timelineUnits.forEach((unit, index) => {
      const label = `unit${index}`;
      if (unit.kind === 'presentation') {
        const silenceLength = unit.targetRange.endSample - unit.targetRange.startSample;
        if (!safeInteger(silenceLength) || silenceLength <= 0 || silenceLength !== unit.durationSamples) fail('invalid-presentation-range', `Presentation ${unit.id} has an invalid sample duration`);
        const tone = toneByPresentation.get(unit.id);
        if (tone) {
          const media = sourceDetails.get(tone.sourceId);
          const {startSample, endSample, sampleRateHz} = tone.roomToneSourceRange;
          if (sampleRateHz !== media.sampleRateHz) fail('room-tone-clock-mismatch', `Room tone for ${unit.id} does not match the verified primary audio sample rate`);
          args.push('-i', media.rawMediaPath ?? media.mediaPath);
          filters.push(`[${inputIndex}:${media.rawStreamIndex ?? media.streamIndex}]atrim=start_sample=${startSample}:end_sample=${endSample},asetpts=PTS-STARTPTS,aresample=${compiled.clock.sampleRateHz}:async=0:first_pts=0,atrim=end_sample=${silenceLength}[${label}]`);
          inputIndex += 1;
        } else {
          const layout = ffmpegSilenceLayout(firstShape);
          filters.push(`anullsrc=r=${compiled.clock.sampleRateHz}:cl=${layout},atrim=end_sample=${silenceLength},asetpts=PTS-STARTPTS[${label}]`);
        }
        concatLabels.push(`[${label}]`);
        return;
      }
      if (unit.kind !== 'source') fail('unsupported-timeline-unit', `Audio exporter cannot render timeline unit kind ${unit.kind}`);
      const clip = unit;
      const media = sourceDetails.get(clip.sourceId);
      if (clip.sourceRange.sampleRateHz !== media.sampleRateHz) fail('clip-source-clock-mismatch', `Clip ${clip.occurrenceId} does not use the decoded source sample rate`);
      args.push('-i', media.mediaPath);
      const wantedLength = clip.targetRange.endSample - clip.targetRange.startSample;
      if (!safeInteger(wantedLength) || wantedLength <= 0) fail('invalid-target-range', `Clip ${clip.occurrenceId} has an invalid compiled target length`);
      const {inSamples, outSamples} = fades.edges[index];
      const fadeIn = inSamples > 0 ? `,afade=t=in:ss=0:ns=${inSamples}` : '';
      const fadeOut = outSamples > 0 ? `,afade=t=out:ss=${wantedLength - outSamples}:ns=${outSamples}` : '';
      filters.push(`[${inputIndex}:${media.streamIndex}]atrim=start_sample=${clip.sourceRange.startSample}:end_sample=${clip.sourceRange.endSample},asetpts=PTS-STARTPTS,aresample=${compiled.clock.sampleRateHz}:async=0:first_pts=0,apad=whole_len=${wantedLength},atrim=end_sample=${wantedLength}${fadeIn}${fadeOut}[${label}]`);
      concatLabels.push(`[${label}]`);
      inputIndex += 1;
    });
    filters.push(`${concatLabels.join('')}concat=n=${timelineUnits.length}:v=0:a=1[outa]`);
    const {codec} = pcmCodecFor(mediaShapes);
    args.push('-filter_complex', filters.join(';'), '-map', '[outa]', '-map_metadata', '-1', '-c:a', codec, '-ar', String(compiled.clock.sampleRateHz), '-f', 'wav', temporaryWave);
    try { await execFile(ffmpegPath, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}); }
    catch (error) { fail('ffmpeg-failed', `ffmpeg could not render the compiled timeline: ${error.stderr || error.message}`); }

    let outputStream;
    try {
      const probe = await ffprobeJson(ffprobePath, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,duration_ts,time_base,channels,channel_layout', '-of', 'json', temporaryWave]);
      outputStream = probe.streams?.[0];
    } catch (probeError) {
      try {
        const {inspectWavFile} = await import('./audio-postprocess.mjs');
        const wav = await inspectWavFile(temporaryWave);
        outputStream = {sample_rate: wav.sampleRateHz, duration_ts: wav.sampleCount, channels: wav.channels, channel_layout: null};
      } catch { throw probeError; }
    }
    const outputRate = Number(outputStream?.sample_rate);
    const durationSamples = Number(outputStream?.duration_ts);
    if (outputRate !== compiled.clock.sampleRateHz || durationSamples !== compiled.durationSamples) {
      fail('rendered-sample-count-mismatch', `Rendered WAV reports ${durationSamples} samples at ${outputRate} Hz; expected ${compiled.durationSamples} samples at ${compiled.clock.sampleRateHz} Hz`);
    }
    const codecInfo = pcmCodecFor(mediaShapes);
    await link(temporaryWave, absoluteOutput);
    finalOutputCreated = true;
    const artifactSha256 = await hashFile(absoluteOutput);
    for (const media of mediaShapes) {
      const rawMediaPath = media.rawMediaPath ?? media.mediaPath;
      const actualHash = await hashFile(rawMediaPath);
      const currentIdentity = await pathIdentity(rawMediaPath);
      if (actualHash !== media.source.sha256 || currentIdentity.dev !== media.originalIdentity.dev || currentIdentity.ino !== media.originalIdentity.ino) {
        await unlink(absoluteOutput).catch(() => {});
        finalOutputCreated = false;
        fail('source-changed-during-export', `Source ${media.source.id} changed while exporting`);
      }
      if (media.sourceTreatment) {
        const processedHash = await hashFile(media.mediaPath);
        const processedIdentity = await pathIdentity(media.mediaPath);
        if (processedHash !== media.processedSha256 || processedIdentity.dev !== media.processedIdentity.dev || processedIdentity.ino !== media.processedIdentity.ino) {
          await unlink(absoluteOutput).catch(() => {});
          finalOutputCreated = false;
          fail('source-treatment-changed-during-export', `Processed source ${media.source.id} or its identity changed while exporting`);
        }
      }
    }
    if (sourceTreatment) {
      const {verifySourceTreatment} = await import('./audio-postprocess.mjs');
      const confirmed = await verifySourceTreatment({audioPlanPath, processedPath: processedSourcePath, receiptPath: audioReceiptPath, editPlan: plan, source: {...plan.sources[0], mediaPath: resolve(baseDir, plan.sources[0].mediaPath)}});
      if (confirmed.audioPlanSha256 !== sourceTreatment.audioPlanSha256 || confirmed.receiptSha256 !== sourceTreatment.receiptSha256 || confirmed.outputSha256 !== sourceTreatment.outputSha256) fail('source-treatment-stale', 'Source treatment plan/receipt/output changed during timeline export');
    }
    await verifyPlanEvidence(plan, {baseDir});
    const receipt = {
      format: compiled.format === TIMELINE_V2_FORMAT ? 'laohu.asrcut.audio-artifact/2' : 'laohu.asrcut.audio-artifact/1',
      project: deepClone(plan.project),
      planSha256: compiled.planSha256,
      timelineFormat: timeline.format,
      output: basename(absoluteOutput),
      outputSha256: artifactSha256,
      sampleRateHz: compiled.clock.sampleRateHz,
      sampleCount: compiled.durationSamples,
      sampleFormat: codecInfo.codec,
      channels: outputStream.channels,
      exportedAt: new Date().toISOString(),
      auditionStatus: 'not_auditioned',
      operation: sourceTreatment
        ? 'explicitly receipt-bound continuous source treatment, then the existing equal-speed compiler-mapped trims/concatenation; source audio hash is preserved separately and processing receipt is linked; no fades, overlap, retiming, duplicate source playback, or inferred mixing'
        : compiled.format === TIMELINE_V2_FORMAT
          ? 'equal-speed source trims concatenated once with exact project-sample presentation intervals; no fades, overlap, retiming, source duplication, or mixing'
          : 'equal-speed sample trim and concatenation; no fades, overlap, retiming, or mixing',
      transcriptEvidence: {verifiedSourceIds: transcriptEvidence.verified.map((entry) => entry.sourceId), unlocatedSourceIds: transcriptEvidence.unlocated.map((entry) => entry.sourceId)},
      clips: compiled.clips.map((clip) => ({occurrenceId: clip.occurrenceId, sourceId: clip.sourceId, coverageId: clip.coverageId, sourceRange: clip.sourceRange, targetRange: clip.targetRange})),
    };
    if (timelineSha256 !== null) receipt.timelineSha256 = timelineSha256;
    if (seamFadeMs !== undefined) {
      receipt.seamFadeMs = seamFadeMs;
      receipt.seamFades = fades.receipt;
    }
    if (roomToneReplacements.length) receipt.roomToneReplacements = roomToneReplacements;
    if (fades.receipt.length || roomToneReplacements.length) {
      receipt.operation = 'Equal-speed compiler-mapped trims and concatenation'
        + (sourceTreatment ? ' after receipt-bound continuous source treatment' : '')
        + (fades.receipt.length ? ' with sample-bounded edge fades on non-continuous source joins' : '')
        + (roomToneReplacements.length ? ' and equal-length verified original room tone in selected presentation windows' : '') + '.';
    }
    if (sourceTreatment) {
      receipt.audioTreatment = {
        format: 'laohu.asrcut.source-treatment/1',
        sourceId: sourceTreatment.sourceId,
        audioPlanSha256: sourceTreatment.audioPlanSha256,
        treatmentReceiptSha256: sourceTreatment.receiptSha256,
        originalSourceSha256: sourceTreatment.inputSha256,
        processedSourceSha256: sourceTreatment.outputSha256,
        sampleRateHz: sourceTreatment.sampleRateHz,
        sampleCount: sourceTreatment.sampleCount,
        channels: sourceTreatment.channels,
        renderedBeforeTimelineRanges: true,
        timelineMapping: 'existing-compiled-source-ranges',
      };
    }
    if (compiled.format === TIMELINE_V2_FORMAT) {
      receipt.timelineFormat = TIMELINE_V2_FORMAT;
      receipt.units = compiled.units.map((unit) => unit.kind === 'presentation'
        ? {kind: 'presentation', id: unit.id, decisionId: unit.decisionId, reason: unit.reason, sceneId: unit.sceneId, durationSamples: unit.durationSamples, targetRange: unit.targetRange, visualHandoff: unit.visualHandoff, audioHandoff: unit.audioHandoff}
        : {kind: 'source', occurrenceId: unit.occurrenceId, sourceId: unit.sourceId, coverageId: unit.coverageId, sourceRange: unit.sourceRange, targetRange: unit.targetRange, timingPrecision: unit.timingPrecision});
      receipt.voiceWindows = compiled.units.filter((unit) => unit.kind === 'source').map((unit) => ({
        startSample: unit.targetRange.startSample,
        endSample: unit.targetRange.endSample,
        sampleRateHz: compiled.clock.sampleRateHz,
        basis: 'conservative-retained-source-range',
        timingPrecision: unit.timingPrecision,
      }));
      receipt.voiceTrackPlayback = 'Play this single exported WAV once from project sample 0. Voice windows are conservative source-unit bounds, may include original source pauses, and must not be used to replay individual clips or infer mic-zero as final-mix silence.';
    }
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    await atomicWriteBytes(outputReceipt, receiptBytes, [absoluteOutput, ...sourcePaths, ...evidencePaths]);
    return {output: absoluteOutput, receipt: outputReceipt, receiptData: receipt};
  } catch (error) {
    if (finalOutputCreated) await unlink(absoluteOutput).catch(() => {});
    throw error;
  } finally {
    await rm(workDir, {recursive: true, force: true}).catch(() => {});
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  if (command === '--help' || command === '-h') return {command: null, options: {help: true}};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = rest[index + 1];
    const optionValue = !next || next.startsWith('--') ? true : next;
    if (optionValue !== true) index += 1;
    if (key === 'video-track') (options[key] ??= []).push(optionValue);
    else options[key] = optionValue;
  }
  return {command, options};
}

function declaredRational(value, label, {positive = false} = {}) {
  const match = typeof value === 'string' && value.match(/^([+-]?\d+)\/(\d+)$/);
  const numerator = Number(match?.[1]);
  const denominator = Number(match?.[2]);
  if (!match || !safeInteger(numerator) || !safeInteger(denominator) || denominator <= 0 || (positive && numerator <= 0)) {
    fail('invalid-video-track-declaration', `${label} requires an integer fraction with a positive denominator`);
  }
  return {numerator, denominator};
}

function videoTrackDeclarations(values) {
  return values.map((value) => {
    const fields = typeof value === 'string' ? value.split(',').map((part) => part.trim()) : [];
    const [index, ptsTimebase, offset, precision] = fields;
    if (!/^\d+$/.test(index ?? '') || !safeInteger(Number(index)) || (offset === 'unknown' ? fields.length !== 3 : fields.length !== 4 || !['measured', 'estimated'].includes(precision))) {
      fail('invalid-video-track-declaration', 'Use --video-track INDEX,PTS_NUM/DEN,SIGNED_OFFSET_NUM/DEN,measured|estimated or INDEX,PTS_NUM/DEN,unknown');
    }
    const timebase = declaredRational(ptsTimebase, 'Video PTS timebase', {positive: true});
    const syncToPrimaryAudio = offset === 'unknown' ? {status: 'unknown'} : {offsetSeconds: declaredRational(offset, 'Video offset in seconds'), precision};
    return {streamIndex: Number(index), timebase, syncToPrimaryAudio};
  });
}

async function verifyImportVideo({mediaPath, mediaSha256, videoTracks, audioStreamIndex, sourceRate, ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe'}) {
  if (!mediaPath) fail('video-track-media-required', '--video-track requires --source with the actual media');
  const probe = await ffprobeJson(ffprobePath, ['-v', 'error', '-show_streams', '-of', 'json', mediaPath]);
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const audio = streams.filter((stream) => stream.codec_type === 'audio' && (audioStreamIndex === undefined || stream.index === audioStreamIndex));
  if (audio.length !== 1) fail('video-import-primary-audio', 'Select the actual primary audio stream with --audio-stream-index when this video has several audio streams');
  const sampleRateHz = Number(audio[0].sample_rate);
  assertPositiveRate(sampleRateHz, 'source primary audio rate');
  if (sourceRate !== undefined && sourceRate !== sampleRateHz) fail('source-clock-mismatch', 'Declared source sample rate differs from the selected audio stream');
  for (const {streamIndex, timebase} of videoTracks) {
    const stream = streams.find((item) => item.index === streamIndex && item.codec_type === 'video' && !item.disposition?.attached_pic);
    if (!stream) fail('video-track-not-found', `Media has no usable video stream with global index ${streamIndex}`);
    const observed = declaredRational(stream.time_base, `Stream ${streamIndex} PTS timebase`, {positive: true});
    if (BigInt(observed.numerator) * BigInt(timebase.denominator) !== BigInt(timebase.numerator) * BigInt(observed.denominator)) {
      fail('video-clock-mismatch', `Video stream ${streamIndex} uses ${stream.time_base}, not the declared PTS timebase`);
    }
  }
  if (await hashFile(mediaPath) !== mediaSha256) fail('source-changed-during-import', 'Linked media changed while verifying the declared tracks');
  return {sampleRateHz, audioStreamIndex: audio[0].index};
}

function usage() {
  return [
    'Usage:',
    '  asrcut.mjs import --input <transcript.json|file.srt> --project-id <id> --out <edit-plan.json> [--source-id <id>] [--source <media>] [--source-sample-rate <Hz>] [--source-duration-samples <N>] [--audio-stream-index <index>] [--time-unit seconds|milliseconds] [--recording-segment <index>]',
    '      [--video-track INDEX,PTS_NUM/DEN,SIGNED_OFFSET_NUM/DEN,measured|estimated] [--video-track INDEX,PTS_NUM/DEN,unknown]',
    '      [--authorize-media-export] [--authorize-reorder] [--authorize-repeat]',
    '  asrcut.mjs merge --project-id <id> --plans <plan-a.json,plan-b.json> --source-order <id-a,id-b> --out <edit-plan.json>',
    '  asrcut.mjs apply-edits --plan <edit-plan.json> --ops <edit-ops.json> --out <revised-plan.json> [--silence-map <silence-map.json>] [--update-plan]',
    '  asrcut.mjs annotate --plan <edit-plan.json> --annotation <annotation.json> --out <new-edit-plan.json> [--update-plan]',
    '  asrcut.mjs insert-presentation --plan <edit-plan.json> --spec <presentation.json> --out <edit-plan.json> --authorize-presentation-timing [--update-plan]',
    '  asrcut.mjs validate --plan <edit-plan.json>',
    '  asrcut.mjs freeze --plan <edit-plan.json> --out <frozen-plan.json>',
    '  asrcut.mjs compile --plan <edit-plan.json> --out <timeline.json>',
    '  asrcut.mjs compile-captions --plan <edit-plan.json> --timeline <canonical-timeline.json> --design <caption-design.json> --out <caption-manifest.json> --srt <captions.srt>',
    '  asrcut.mjs export-srt --plan <edit-plan.json> --timeline <canonical-timeline.json> --manifest <caption-manifest.json> --out <captions.srt>',
    '  asrcut.mjs probe-silence --input <source> --out <silence-map.json> [--plan <edit-plan.json>] [--audio-stream-index <index>] [--noise-db <dB>] [--min-silence-ms <ms>]',
    '  asrcut.mjs export-audio --plan <frozen-plan.json> --timeline <timeline.json> --out <new-audio.wav> [--seam-fade-ms <0..30>] [--tmp-dir <same-volume-dir>]',
    '      [--audio-plan <source-audio-plan.json> --processed-source <processed-source.wav> --audio-receipt <processed-source.wav.audio.json>]',
    '      [--room-tone <replacement.json> --silence-map <silence-map.json> --authorize-room-tone]',
    '  asrcut.mjs extract-seams --plan <frozen-plan.json> --timeline <timeline.json> --audio <cut.wav> --out-dir <new-directory> [--audio-receipt <cut.wav.artifact.json>]',
    '  asrcut.mjs export-handoff --plan <frozen-plan.json> --timeline <timeline.json> --out <animation-handoff.json> [--silence-map <silence-map.json>]',
    '  asrcut.mjs export-video --plan <frozen-plan.json> --timeline <timeline.json> --fps <rate> --out <new-video.mov>',
    '  asrcut.mjs export-nle --plan <frozen-plan.json> --timeline <timeline.json> --fps <rate> --format fcpxml|edl|otio --out <new-file>',
    '  asrcut.mjs transcribe --file <audio> --out <new-raw-asr.json>',
  ].join('\n');
}

async function runCli(argv = process.argv.slice(2)) {
  const {command, options} = parseArgs(argv);
  if (!command || options.help) { process.stdout.write(`${usage()}\n`); return 0; }
  if (command === 'probe-silence') {
    const {runAudioProbeCli} = await import('./audio-probe.mjs');
    return runAudioProbeCli(options);
  }
  if (['extract-seams', 'export-video', 'export-nle'].includes(command)) {
    const {runMediaCli} = await import('./video-and-nle.mjs');
    return runMediaCli(command, options);
  }
  if (command === 'import') {
    if (!options.input || !options.out || !options['project-id']) fail('missing-argument', 'import requires --input, --project-id, and --out');
    const inputPath = resolve(options.input);
    const inputBytes = await readFile(inputPath);
    let sourceRate = options['source-sample-rate'] ? Number(options['source-sample-rate']) : undefined;
    let audioStreamIndex = options['audio-stream-index'] ? Number(options['audio-stream-index']) : undefined;
    const sourceDurationSamples = options['source-duration-samples'] ? Number(options['source-duration-samples']) : undefined;
    let mediaPath = null;
    let mediaSha256 = null;
    if (options.source) {
      mediaPath = resolve(options.source);
      mediaSha256 = await hashFile(mediaPath);
    }
    const videoTracks = options['video-track'] ? videoTrackDeclarations(options['video-track']) : [];
    if (videoTracks.length) {
      const observed = await verifyImportVideo({mediaPath, mediaSha256, videoTracks, audioStreamIndex, sourceRate, ffprobePath: options.ffprobe || undefined});
      sourceRate = observed.sampleRateHz;
      audioStreamIndex = observed.audioStreamIndex;
    }
    for (const key of ['authorize-media-export', 'authorize-reorder', 'authorize-repeat']) {
      if (Object.hasOwn(options, key) && options[key] !== true) fail('invalid-authorization-flag', `--${key} is a standalone explicit switch`);
    }
    const outputPath = resolve(options.out);
    const outputBaseDir = dirname(outputPath);
    const evidencePath = options['evidence-ref'] ? resolve(options['evidence-ref']) : inputPath;
    const evidenceRef = relative(outputBaseDir, evidencePath) || basename(evidencePath);
    const base = {
      projectId: options['project-id'],
      sourceId: options['source-id'] ?? 'source-1',
      sampleRateHz: options['project-sample-rate'] ? Number(options['project-sample-rate']) : DEFAULT_SAMPLE_RATE_HZ,
      sourceSampleRateHz: sourceRate,
      sourceDurationSamples,
      mediaPath,
      mediaSha256,
      transcriptSha256: sha256(inputBytes),
      evidenceRef,
      audioStreamIndex,
      videoTracks,
      authorization: {mediaExport: options['authorize-media-export'] === true, reorder: options['authorize-reorder'] === true, repeat: options['authorize-repeat'] === true},
      recordingSegment: options['recording-segment'] === undefined ? undefined : Number(options['recording-segment']),
      timeUnit: options['time-unit'],
    };
    const plan = inputPath.toLowerCase().endsWith('.srt')
      ? importSrt(inputBytes.toString('utf8'), base)
      : importAsrJson(inputBytes.toString('utf8'), base);
    const transcriptEvidence = await verifyPlanEvidence(plan, {baseDir: outputBaseDir});
    const outPath = await writeJsonOutput(outputPath, plan, [inputPath, mediaPath, evidencePath], {replace: options.replace === true});
    process.stdout.write(`${JSON.stringify({ok: true, command, output: outPath, project: plan.project, planSha256: plan.integrity.planSha256, transcriptEvidence, warnings: inspectPlan(plan).warnings}, null, 2)}\n`);
    return 0;
  }
  if (command === 'merge') {
    if (!options.plans || !options['project-id'] || !options.out) fail('missing-argument', 'merge requires --plans, --project-id, and --out');
    const planPaths = options.plans.split(',').map((entry) => resolve(entry.trim())).filter(Boolean);
    const plans = await Promise.all(planPaths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
    await Promise.all(plans.map((plan, index) => verifyPlanEvidence(plan, {baseDir: dirname(planPaths[index])})));
    const outputBaseDir = dirname(resolve(options.out));
    plans.forEach((plan, index) => rebasePlanEvidenceRefs(plan, dirname(planPaths[index]), outputBaseDir));
    const sourceOrder = options['source-order']?.split(',').map((entry) => entry.trim()).filter(Boolean);
    const merged = mergePlans(plans, {projectId: options['project-id'], sourceOrder});
    const outPath = await writeJsonOutput(options.out, merged, [...planPaths, ...transcriptEvidencePaths(merged, outputBaseDir)]);
    process.stdout.write(`${JSON.stringify({ok: true, command, output: outPath, project: merged.project, sources: merged.sources.map((source) => source.id), planSha256: merged.integrity.planSha256}, null, 2)}\n`);
    return 0;
  }
  if (command === 'apply-edits') {
    if (![options.plan, options.ops, options.out].every((value) => typeof value === 'string')) fail('missing-argument', 'apply-edits requires --plan, --ops, and --out');
    if (options['silence-map'] === true) fail('missing-argument', '--silence-map requires the verified map path');
    const planPath = resolve(options.plan);
    const specPath = resolve(options.ops);
    const outputPath = resolve(options.out);
    const baseDir = dirname(planPath);
    const mapPath = options['silence-map'] ? resolve(options['silence-map']) : null;
    if (baseDir !== dirname(outputPath)) fail('edit-output-location', 'Write the revised plan beside its input so relative media and transcript references keep their meaning');
    const inPlace = options['update-plan'] === true;
    if (inPlace !== (outputPath === planPath)) fail('edit-update-target', 'In-place updates require --update-plan and the exact --plan path as --out');
    if (inPlace) {
      const info = await lstat(planPath).catch(() => null);
      if (!info?.isFile() || info.nlink !== 1) fail('edit-update-target', '--update-plan requires an existing regular plan file without symlink or hard-link aliases');
    }
    const bytes = await readFile(planPath);
    const plan = JSON.parse(bytes.toString('utf8'));
    const spec = JSON.parse(await readFile(specPath, 'utf8'));
    const silenceMap = mapPath ? JSON.parse(await readFile(mapPath, 'utf8')) : null;
    await verifyPlanEvidence(plan, {baseDir});
    const revised = await applyEdits(plan, spec, {baseDir, silenceMap, ffmpegPath: options.ffmpeg || undefined, ffprobePath: options.ffprobe || undefined});
    const protectedPaths = [specPath, mapPath, ...mediaPaths(plan, baseDir), ...transcriptEvidencePaths(plan, baseDir)];
    if (!inPlace) protectedPaths.push(planPath);
    if (inPlace && !(await readFile(planPath)).equals(bytes)) fail('edit-update-source-changed', 'The input plan changed during this edit; reload before writing');
    await verifyPlanEvidence(revised, {baseDir});
    const output = await writeJsonOutput(outputPath, revised, protectedPaths, {replace: inPlace});
    process.stdout.write(`${JSON.stringify({ok: true, command, output, project: revised.project, planSha256: revised.integrity.planSha256, state: revised.state}, null, 2)}\n`);
    return 0;
  }
  if (command === 'insert-presentation') {
    if (!options.plan || !options.spec || !options.out || options['authorize-presentation-timing'] !== true) {
      fail('missing-argument', 'insert-presentation requires --plan, --spec, --out, and explicit --authorize-presentation-timing');
    }
    const planPath = resolve(options.plan);
    const specPath = resolve(options.spec);
    const outputPath = resolve(options.out);
    if (dirname(planPath) !== dirname(outputPath)) fail('presentation-output-location', 'Write the revised plan beside its input so transcript evidence references keep their exact meaning; rebase explicitly in a separate reviewed step if needed');
    const updatePlan = options['update-plan'] === true;
    const samePlanPath = outputPath === planPath;
    if (updatePlan && !samePlanPath) fail('presentation-update-target', '--update-plan requires --out to be the exact same path as --plan; symlink or hard-link aliases are not accepted');
    if (!updatePlan && samePlanPath) fail('presentation-in-place-explicit', 'Updating the edit plan in place requires explicit --update-plan');
    if (updatePlan) {
      const planStat = await lstat(planPath).catch(() => null);
      if (!planStat || planStat.isSymbolicLink() || planStat.nlink > 1) fail('presentation-update-target', '--update-plan requires an existing regular plan file with no symlink or hard-link aliases');
    }
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    const spec = JSON.parse(await readFile(specPath, 'utf8'));
    await verifyPlanEvidence(plan, {baseDir: dirname(planPath)});
    const revised = insertPresentationInterval(plan, spec, {authorized: true});
    const protectedPaths = [specPath, ...revised.sources.map((source) => source.mediaPath), ...transcriptEvidencePaths(revised, dirname(outputPath))];
    if (!updatePlan) protectedPaths.push(planPath);
    const outPath = await writeJsonOutput(outputPath, revised, protectedPaths, {replace: updatePlan || options.replace === true});
    process.stdout.write(`${JSON.stringify({ok: true, command, output: outPath, project: revised.project, planSha256: revised.integrity.planSha256, sequenceUnits: revised.sequence.length}, null, 2)}\n`);
    return 0;
  }
  if (command === 'annotate') {
    if (!options.plan || !options.annotation || !options.out) fail('missing-argument', 'annotate requires --plan, --annotation, and --out');
    const planPath = resolve(options.plan);
    const annotationPath = resolve(options.annotation);
    const outputPath = resolve(options.out);
    if (dirname(planPath) !== dirname(outputPath)) fail('annotation-output-location', 'Write the revised plan beside its input so transcript evidence references keep their exact meaning');
    const updatePlan = options['update-plan'] === true;
    if (updatePlan && outputPath !== planPath) fail('annotation-update-target', '--update-plan requires --out to be the exact same path as --plan');
    if (!updatePlan && outputPath === planPath) fail('annotation-in-place-explicit', 'Updating the edit plan in place requires explicit --update-plan');
    if (updatePlan) {
      const planStat = await lstat(planPath).catch(() => null);
      if (!planStat || planStat.isSymbolicLink() || planStat.nlink > 1) fail('annotation-update-target', '--update-plan requires an existing regular plan file with no symlink or hard-link aliases');
    }
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    const annotation = JSON.parse(await readFile(annotationPath, 'utf8'));
    await verifyPlanEvidence(plan, {baseDir: dirname(planPath)});
    const revised = upsertAnnotation(plan, annotation);
    const protectedPaths = [annotationPath, ...revised.sources.map((source) => source.mediaPath), ...transcriptEvidencePaths(revised, dirname(outputPath))];
    if (!updatePlan) protectedPaths.push(planPath);
    const outPath = await writeJsonOutput(outputPath, revised, protectedPaths, {replace: updatePlan || options.replace === true});
    process.stdout.write(`${JSON.stringify({ok: true, command, output: outPath, project: revised.project, planSha256: revised.integrity.planSha256, annotationId: annotation.id}, null, 2)}\n`);
    return 0;
  }
  if (command === 'validate') {
    if (!options.plan) fail('missing-argument', 'validate requires --plan');
    const planPath = resolve(options.plan);
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    const result = validatePlan(plan);
    const transcriptEvidence = await verifyPlanEvidence(plan, {baseDir: dirname(planPath)});
    process.stdout.write(`${JSON.stringify({ok: result.errors.length === 0, ...result, transcriptEvidence}, null, 2)}\n`);
    return result.errors.length ? 1 : 0;
  }
  if (command === 'freeze') {
    if (!options.plan || !options.out) fail('missing-argument', 'freeze requires --plan and --out');
    const planPath = resolve(options.plan);
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    const planBaseDir = dirname(planPath);
    await verifyPlanEvidence(plan, {baseDir: planBaseDir});
    const outputPath = resolve(options.out);
    const outputBaseDir = dirname(outputPath);
    rebasePlanEvidenceRefs(plan, planBaseDir, outputBaseDir);
    const frozen = freezePlan(plan);
    const outPath = await writeJsonOutput(outputPath, frozen, [planPath, ...frozen.sources.map((source) => source.mediaPath), ...transcriptEvidencePaths(frozen, outputBaseDir)], {replace: options.replace === true});
    process.stdout.write(`${JSON.stringify({ok: true, command, output: outPath, state: frozen.state, reviewStatus: frozen.review.status, planSha256: frozen.integrity.planSha256}, null, 2)}\n`);
    return 0;
  }
  if (command === 'compile') {
    if (!options.plan || !options.out) fail('missing-argument', 'compile requires --plan and --out');
    const planPath = resolve(options.plan);
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    const transcriptEvidence = await verifyPlanEvidence(plan, {baseDir: dirname(planPath)});
    const timeline = compilePlan(plan);
    const outPath = await writeJsonOutput(options.out, timeline, [planPath, ...plan.sources.map((source) => source.mediaPath), ...transcriptEvidencePaths(plan, dirname(planPath))], {replace: options.replace === true});
    process.stdout.write(`${JSON.stringify({ok: true, command, output: outPath, project: timeline.project, planSha256: timeline.planSha256, transcriptEvidence, clips: timeline.clips.length, durationSamples: timeline.durationSamples, coverageComplete: timeline.coverageComplete, warnings: timeline.warnings}, null, 2)}\n`);
    return 0;
  }
  if (command === 'compile-captions' || command === 'export-srt') {
    const needsDesign = command === 'compile-captions';
    if (!options.plan || !options.timeline || (needsDesign && (!options.design || !options.out || !options.srt))
      || (!needsDesign && (!options.manifest || !options.out))) {
      fail('missing-argument', needsDesign
        ? 'compile-captions requires --plan, --timeline, --design, --out, and --srt'
        : 'export-srt requires --plan, --timeline, --manifest, and --out');
    }
    const planPath = resolve(options.plan);
    const timelinePath = resolve(options.timeline);
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    await verifyPlanEvidence(plan, {baseDir: dirname(planPath)});
    const canonicalTimeline = compilePlan(plan);
    const timelineBytes = await readFile(timelinePath);
    const suppliedTimeline = JSON.parse(timelineBytes.toString('utf8'));
    if (stableJson(suppliedTimeline) !== stableJson(canonicalTimeline)) {
      fail('stale-timeline', 'Supplied timeline differs from the timeline recompiled from the supplied edit plan');
    }
    const timelineSha256 = sha256(timelineBytes);
    const planDigest = hashPlan(plan);
    const protectedInputs = [planPath, timelinePath, ...plan.sources.map((source) => source.mediaPath), ...transcriptEvidencePaths(plan, dirname(planPath))];
    if (needsDesign) {
      const designPath = resolve(options.design);
      const design = JSON.parse(await readFile(designPath, 'utf8'));
      const manifest = compileCaptionManifest({plan, timeline: canonicalTimeline, design, planSha256: planDigest, timelineSha256});
      const outputs = await writeCaptionOutputPair(options.out, manifest, options.srt, captionManifestToSrt(manifest), [...protectedInputs, designPath], {replace: options.replace === true});
      process.stdout.write(`${JSON.stringify({ok: true, command, format: manifest.format, displayLanguages: manifest.displayLanguages ?? null,
        manifest: outputs.json, srt: outputs.srt, manifestSha256: manifest.integrity.manifestSha256, cueCount: manifest.cues.length}, null, 2)}\n`);
      return 0;
    }
    const manifestPath = resolve(options.manifest);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    verifyCaptionManifest(manifest, {plan, timeline: canonicalTimeline, planSha256: planDigest, timelineSha256});
    const srt = captionManifestToSrt(manifest);
    const outPath = resolve(options.out);
    try {
      const info = await lstat(outPath);
      if (info.isSymbolicLink() || !info.isFile()) fail('unsafe-output', `SRT output must be a regular file path, not a symlink or special file: ${outPath}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await atomicWriteBytes(outPath, Buffer.from(srt, 'utf8'), [...protectedInputs, manifestPath], {replace: options.replace === true});
    process.stdout.write(`${JSON.stringify({ok: true, command, format: manifest.format, displayLanguages: manifest.displayLanguages ?? null,
      output: outPath, manifestSha256: manifest.integrity.manifestSha256, cueCount: manifest.cues.length}, null, 2)}\n`);
    return 0;
  }
  if (command === 'export-handoff') {
    if (![options.plan, options.timeline, options.out].every((value) => typeof value === 'string')) fail('missing-argument', 'export-handoff requires --plan, --timeline, and --out');
    if (options['silence-map'] === true) fail('missing-argument', '--silence-map requires the verified map path');
    const planPath = resolve(options.plan);
    const timelinePath = resolve(options.timeline);
    const baseDir = dirname(planPath);
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    const timelineBytes = await readFile(timelinePath);
    const mapPath = options['silence-map'] ? resolve(options['silence-map']) : null;
    const silenceMap = mapPath ? JSON.parse(await readFile(mapPath, 'utf8')) : null;
    const handoff = await compileAnimationHandoff({plan, timelineBytes, silenceMap, baseDir, ffmpegPath: options.ffmpeg || undefined, ffprobePath: options.ffprobe || undefined});
    const output = await writeJsonOutput(options.out, handoff, [planPath, timelinePath, mapPath, ...mediaPaths(plan, baseDir), ...transcriptEvidencePaths(plan, baseDir)]);
    process.stdout.write(`${JSON.stringify({ok: true, command, output, project: handoff.project, planSha256: handoff.planSha256, timelineSha256: handoff.timelineSha256,
      narrativeBeats: handoff.narrativeBeats.length, availablePauseWindows: handoff.availablePauseWindows.length, visualCueCandidates: handoff.visualCueCandidates.length, visualSeamRisks: handoff.visualSeamRisks.length}, null, 2)}\n`);
    return 0;
  }
  if (command === 'export-audio') {
    if (!options.plan || !options.timeline || !options.out) fail('missing-argument', 'export-audio requires --plan, --timeline, and --out');
    const planPath = resolve(options.plan);
    const timelinePath = resolve(options.timeline);
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    const timelineBytes = await readFile(timelinePath);
    const timeline = JSON.parse(timelineBytes.toString('utf8'));
    const treatmentArgs = [options['audio-plan'], options['processed-source'], options['audio-receipt']].filter(Boolean);
    if (treatmentArgs.length !== 0 && treatmentArgs.length !== 3) fail('source-treatment-incomplete', 'Use all three of --audio-plan, --processed-source, and --audio-receipt together; omit all three for the original export behavior');
    const outPath = resolve(options.out);
    const planBaseDir = dirname(planPath);
    const hasFade = Object.hasOwn(options, 'seam-fade-ms');
    const fadeValue = options['seam-fade-ms'];
    if (hasFade && (typeof fadeValue !== 'string' || !fadeValue.trim())) fail('invalid-seam-fade', '--seam-fade-ms requires a number from 0 to 30');
    const seamFadeMs = hasFade ? Number(fadeValue) : undefined;
    if (options['room-tone'] === true || options['silence-map'] === true) fail('missing-argument', '--room-tone and --silence-map require file paths');
    const roomTonePath = options['room-tone'] ? resolve(options['room-tone']) : null;
    const mapPath = options['silence-map'] ? resolve(options['silence-map']) : null;
    const protectedInputs = [planPath, timelinePath, roomTonePath, mapPath, ...mediaPaths(plan, planBaseDir), ...transcriptEvidencePaths(plan, planBaseDir), ...treatmentArgs.map((path) => resolve(path))];
    await assertSafeOutputPath(outPath, protectedInputs);
    await assertSafeOutputPath(`${outPath}.artifact.json`, [outPath, ...protectedInputs]);
    const roomTone = roomTonePath ? JSON.parse(await readFile(roomTonePath, 'utf8')) : null;
    const silenceMap = mapPath ? JSON.parse(await readFile(mapPath, 'utf8')) : null;
    const result = await exportAudio({plan, timeline, outPath, baseDir: planBaseDir,
      tmpDir: options['tmp-dir'] ? resolve(options['tmp-dir']) : undefined,
      ffmpegPath: options.ffmpeg || undefined, ffprobePath: options.ffprobe || undefined,
      audioPlanPath: options['audio-plan'] ? resolve(options['audio-plan']) : null,
      processedSourcePath: options['processed-source'] ? resolve(options['processed-source']) : null,
      audioReceiptPath: options['audio-receipt'] ? resolve(options['audio-receipt']) : null,
      seamFadeMs, roomTone, silenceMap, authorizeRoomTone: options['authorize-room-tone'] === true,
      timelineSha256: hasFade || roomTonePath ? sha256(timelineBytes) : null});
    process.stdout.write(`${JSON.stringify({ok: true, command, output: result.output, receipt: result.receipt, sampleRateHz: result.receiptData.sampleRateHz, sampleCount: result.receiptData.sampleCount, auditionStatus: result.receiptData.auditionStatus, audioTreatment: result.receiptData.audioTreatment ?? null}, null, 2)}\n`);
    return 0;
  }
  if (command === 'transcribe') {
    if (!options.file || !options.out) fail('missing-argument', 'transcribe requires --file and --out; this command explicitly contacts the configured provider');
    const {loadVolcConfig, transcribeVolcFlash} = await import('./asr-provider.mjs');
    const configPath = options['config-path'] ? resolve(options['config-path']) : undefined;
    const config = await loadVolcConfig({configPath});
    const audioPath = resolve(options.file);
    const result = await transcribeVolcFlash({audioPath, config});
    const outPath = await atomicWriteBytes(options.out, Buffer.from(result.rawJson, 'utf8'), [audioPath]);
    process.stdout.write(`${JSON.stringify({ok: true, command, output: outPath, requestId: result.requestId, statusCode: result.statusCode, httpStatus: result.httpStatus}, null, 2)}\n`);
    return 0;
  }
  fail('unknown-command', `Unknown command: ${command}\n${usage()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().then((code) => { process.exitCode = code; }).catch((error) => {
    const message = error instanceof AsrcutError ? {error: error.message, code: error.code, details: error.details} : {error: error.message, code: 'runtime-error'};
    process.stderr.write(`${JSON.stringify(message, null, 2)}\n`);
    process.exitCode = 1;
  });
}
