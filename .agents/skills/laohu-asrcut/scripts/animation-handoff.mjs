import {createHash} from 'node:crypto';
import {AsrcutError, compilePlan, mapRangeToTarget, verifyPlanEvidence} from './asrcut.mjs';
import {verifyProbeAcoustics} from './edit-operations.mjs';

const FORMAT = 'laohu.asrcut.animation-handoff/1';
const PRECISE_WORD = new Set(['measured', 'aligned']);
const WATCHABLE_PAUSE = new Set(['sentence', 'paragraph', 'emphasis']);
const CUE_PATTERN = /(?<attention>大家看|请看|看这里|看这里的|看屏幕|屏幕左边|屏幕右边|look\s+(?:here|at))|(?<step>第[一二三四五六七八九十百\d]+步|step\s+(?:\d+|one|two|three)\b)|(?<comparison>作对比|做对比|对比|相比|比较一下|compare\b)/giu;
const fail = (code, message, details) => { throw new AsrcutError(code, message, details); };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const range = (startSample, endSample, sampleRateHz) => ({startSample, endSample, sampleRateHz});
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

const stableJson = (value) => JSON.stringify(canonical(value));

export function timelineSeams(timeline) {
  const units = timeline.units ?? timeline.clips.map((clip) => ({kind: 'source', ...clip}));
  return units.slice(1).flatMap((right, index) => {
    const left = units[index];
    const sourcePair = left.kind === 'source' && right.kind === 'source';
    if (sourcePair && left.sourceId === right.sourceId && left.sourceRange.endSample === right.sourceRange.startSample) return [];
    if (left.kind === 'presentation' && right.kind === 'presentation') return [];
    return [{left, right, leftIndex: index, rightIndex: index + 1, targetSample: right.targetRange.startSample, type: sourcePair ? 'source-cut' : 'presentation-boundary'}];
  });
}

function exactWordAnchor(clip, word) {
  if (!word || !PRECISE_WORD.has(word.timingPrecision) || word.targetRange.endSample <= word.targetRange.startSample) return null;
  return {occurrenceId: clip.occurrenceId, tokenId: word.tokenId, targetRange: word.targetRange, timingPrecision: word.timingPrecision};
}

function speechRows(plan, timeline) {
  const sourceSegments = new Map(plan.sources.map((source) => [source.id, source.transcript.segments]));
  const beatBySegment = new Map((plan.narrativeBeats ?? []).flatMap((beat) => beat.segmentIds.map((id) => [id, beat])));
  return timeline.clips.flatMap((clip) => {
    const wordsByToken = new Map(clip.words.map((word) => [word.tokenId, word]));
    const compiledSegments = new Map(clip.transcriptSegments.map((segment) => [segment.segmentId, segment]));
    return sourceSegments.get(clip.sourceId).flatMap((segment) => {
      const words = segment.tokens.flatMap((token) => wordsByToken.has(token.id) ? [wordsByToken.get(token.id)] : []);
      const compiled = compiledSegments.get(segment.id);
      const precise = words.filter((word) => nonEmpty(word.text) && exactWordAnchor(clip, word));
      if (!precise.length && (!compiled || !nonEmpty(compiled.text))) return [];
      const completeWords = precise.length > 0 && precise.length === segment.tokens.filter((token) => nonEmpty(token.rawText)).length;
      const targetRange = !completeWords && compiled ? compiled.targetRange
        : range(Math.min(...precise.map((word) => word.targetRange.startSample)), Math.max(...precise.map((word) => word.targetRange.endSample)), timeline.clock.sampleRateHz);
      if (targetRange.endSample <= targetRange.startSample) return [];
      return [{clip, words, anchors: precise.map((word) => exactWordAnchor(clip, word)), segmentId: segment.id, beat: beatBySegment.get(segment.id), targetRange}];
    });
  });
}

function narrativeBeats(rows) {
  const result = [];
  for (const row of rows) {
    const {clip, beat, targetRange, anchors, segmentId} = row;
    const previous = result.at(-1);
    if (beat && previous?.semanticBeatId === beat.id && previous.occurrenceId === clip.occurrenceId) {
      previous.segmentIds.push(segmentId);
      previous.targetRange = range(Math.min(previous.targetRange.startSample, targetRange.startSample), Math.max(previous.targetRange.endSample, targetRange.endSample), targetRange.sampleRateHz);
      if (!previous.firstWordAnchor) previous.firstWordAnchor = anchors[0] ?? null;
      if (anchors.length) previous.lastWordAnchor = anchors.at(-1);
      continue;
    }
    result.push({id: `${clip.occurrenceId}-beat-${result.length + 1}`, semanticBeatId: beat?.id ?? null,
      role: beat?.role ?? 'unclassified', roleEvidence: beat ? 'author-source-segments' : 'undetermined',
      occurrenceId: clip.occurrenceId, sourceId: clip.sourceId, segmentIds: [segmentId], targetRange,
      firstWordAnchor: anchors[0] ?? null, lastWordAnchor: anchors.at(-1) ?? null});
  }
  return result;
}

function visualCueCandidates(rows) {
  return rows.flatMap(({clip, words, segmentId}) => {
    let joined = '';
    const tokenText = [];
    for (const word of words) {
      // Keep word-to-text positions instead of estimating acoustic time from characters.
      const rawText = (word.spokenText ?? word.text).trim();
      const englishBoundary = /[\p{Script=Latin}\d]$/u.test(joined) && /^[\p{Script=Latin}\d]/u.test(rawText);
      if (englishBoundary) joined += ' ';
      const start = joined.length;
      joined += rawText;
      if (rawText) tokenText.push({start, end: joined.length, word});
    }
    return [...joined.matchAll(CUE_PATTERN)].flatMap((match) => {
      const matched = tokenText.filter((item) => item.start < match.index + match[0].length && item.end > match.index).map((item) => item.word);
      if (!matched.length || matched.some((word) => !exactWordAnchor(clip, word))) return [];
      const anchor = exactWordAnchor(clip, matched[0]);
      const phraseRange = range(anchor.targetRange.startSample, Math.max(...matched.map((word) => word.targetRange.endSample)), anchor.targetRange.sampleRateHz);
      return [{...anchor, category: Object.entries(match.groups).find(([, value]) => value !== undefined)[0], text: match[0], segmentId,
        tokenIds: matched.map((word) => word.tokenId), phraseRange}];
    });
  });
}

function projectedPauseWindows(plan, timeline, silenceMap, probedSource) {
  if (!silenceMap) return [];
  const projectRate = timeline.clock.sampleRateHz;
  const units = timeline.units ?? timeline.clips.map((clip) => ({kind: 'source', ...clip}));
  const decisions = (plan.decisions ?? []).flatMap((decision) => {
    if (decision.action !== 'delete' || !decision.pauseRange || !decision.pauseKind) return [];
    const active = plan.coverage.some((item) => item.disposition === 'delete' && item.decisionId === decision.id);
    const sourceId = decision.sourceRanges[0]?.sourceId;
    return active && sourceId ? [{id: decision.id, sourceId, sourceRange: decision.pauseRange, pauseKind: decision.pauseKind, reason: decision.reason}] : [];
  });
  const editorialWindows = [...(plan.pauseWindows ?? []), ...decisions];
  const result = [];
  for (const pause of editorialWindows) {
    if (pause.sourceId !== probedSource.id || !WATCHABLE_PAUSE.has(pause.pauseKind) || (pause.function && pause.function !== 'emotional-beat' && pause.function !== 'visual-comprehension')) continue;
    for (const silence of silenceMap.silences) {
      const from = Math.max(pause.sourceRange.startSample, silence.startSample);
      const to = Math.min(pause.sourceRange.endSample, silence.endSample);
      if (from >= to) continue;
      const parts = [];
      for (const [index, clip] of units.entries()) {
        if (clip.kind !== 'source' || clip.sourceId !== pause.sourceId) continue;
        const start = Math.max(from, clip.sourceRange.startSample);
        const end = Math.min(to, clip.sourceRange.endSample);
        if (end <= start) continue;
        const sourceRange = range(start, end, clip.sourceRange.sampleRateHz);
        const targetRange = mapRangeToTarget(sourceRange, clip.sourceRange, clip.targetRange, projectRate);
        if (targetRange.endSample <= targetRange.startSample) continue;
        parts.push({index, occurrenceId: clip.occurrenceId, sourceId: clip.sourceId, sourceRange, targetRange});
      }
      const groups = [];
      for (const part of parts) {
        const group = groups.at(-1);
        const previous = group?.at(-1);
        // A repeat restarts its source clock. Presentation time also breaks an otherwise available source pause.
        if (previous && part.index === previous.index + 1 && previous.targetRange.endSample === part.targetRange.startSample
          && previous.sourceRange.endSample <= part.sourceRange.startSample) group.push(part);
        else groups.push([part]);
      }
      for (const group of groups) {
        const startSample = group[0].targetRange.startSample;
        const endSample = group.at(-1).targetRange.endSample;
        if ((endSample - startSample) * 1000 < 450 * projectRate) continue;
        result.push({editorialId: pause.id, pauseKind: pause.pauseKind, reason: pause.reason,
          ...(pause.function ? {function: pause.function} : {}),
          targetRange: range(startSample, endSample, projectRate), startSec: startSample / projectRate, endSec: endSample / projectRate,
          durationSec: (endSample - startSample) / projectRate, evidence: 'author-classification-and-reproduced-source-probe',
          sourceParts: group.map(({index, ...part}) => part)});
      }
    }
  }
  const deduplicated = new Map();
  for (const row of result) {
    const key = JSON.stringify([row.pauseKind, row.targetRange.startSample, row.targetRange.endSample, row.sourceParts.map((part) => part.occurrenceId)]);
    if (!deduplicated.has(key)) deduplicated.set(key, row);
  }
  return [...deduplicated.values()].sort((a, b) => a.targetRange.startSample - b.targetRange.startSample || a.targetRange.endSample - b.targetRange.endSample);
}

function visualSeamRisks(plan, timeline) {
  const byId = new Map(plan.decisions.map((decision) => [decision.id, decision]));
  const projectRate = timeline.clock.sampleRateHz;
  return timelineSeams(timeline).map(({left, right, targetSample, type}) => {
    const sameSource = type === 'source-cut' && left.sourceId === right.sourceId;
    const skipped = sameSource ? right.sourceRange.startSample - left.sourceRange.endSample : null;
    const rangesBetween = sameSource && skipped > 0 ? timeline.deletions.filter((row) => row.sourceId === left.sourceId
      && row.sourceRange.startSample < right.sourceRange.startSample && row.sourceRange.endSample > left.sourceRange.endSample) : [];
    const related = [...new Set([...rangesBetween.map((row) => row.decisionId), ...[left.decisionId, right.decisionId].filter(Boolean),
      ...plan.decisions.filter((decision) => ['reorder', 'repeat'].includes(decision.action) && [left.occurrenceId, right.occurrenceId].some((id) => id && decision.keptOccurrenceIds?.includes(id))).map((decision) => decision.id)])];
    const explicitRisk = related.map((id) => byId.get(id)?.visualSeamRisk).find(nonEmpty);
    const explicitMask = related.map((id) => byId.get(id)?.visualMaskHint).find(nonEmpty);
    const risk = explicitRisk ?? (type === 'presentation-boundary' ? 'presentation-boundary' : !sameSource ? 'source-switch' : skipped < 0 ? 'nonmonotonic-source' : skipped * 1000 > 350 * left.sourceRange.sampleRateHz ? 'jump-cut-candidate' : 'check-current-frame');
    const defaultHint = type === 'presentation-boundary' ? 'Check the presentation entry/exit state against the adjacent retained shot.'
      : 'Check the adjacent frames for action continuity; when a jump is visible, use a matching cutaway, screen insert, or motion card.';
    return {targetSample, targetSec: targetSample / projectRate, type, risk, riskEvidence: explicitRisk ? 'editorial-decision' : 'time-mapping-heuristic',
      visualMaskHint: explicitMask ?? defaultHint, decisionIds: related,
      leftOccurrenceId: left.occurrenceId ?? null, rightOccurrenceId: right.occurrenceId ?? null,
      leftPresentationId: left.kind === 'presentation' ? left.id : null, rightPresentationId: right.kind === 'presentation' ? right.id : null,
      skippedSourceSamples: skipped !== null && skipped > 0 ? skipped : null};
  });
}

export async function compileAnimationHandoff({plan, timelineBytes, silenceMap = null, baseDir = process.cwd(), ffmpegPath, ffprobePath} = {}) {
  if (!plan || !Buffer.isBuffer(timelineBytes)) fail('missing-handoff-input', 'Animation handoff requires the edit plan and exact canonical timeline file bytes');
  await verifyPlanEvidence(plan, {baseDir});
  const timeline = compilePlan(plan);
  if (plan.state !== 'frozen') fail('plan-not-frozen', 'Animation handoff requires a frozen canonical edit plan');
  let supplied;
  try { supplied = JSON.parse(timelineBytes.toString('utf8')); }
  catch { fail('timeline-not-canonical', 'Animation handoff requires readable canonical timeline JSON'); }
  if (stableJson(supplied) !== stableJson(timeline)) fail('timeline-not-canonical', 'Animation handoff timeline differs from the current deterministic compiler result');
  const probedSource = silenceMap ? await verifyProbeAcoustics(silenceMap, {plan, baseDir, ffmpegPath, ffprobePath}) : null;
  const rows = speechRows(plan, timeline);
  return {format: FORMAT, project: {...timeline.project}, planSha256: timeline.planSha256, timelineSha256: sha256(timelineBytes),
    sampleRateHz: timeline.clock.sampleRateHz, durationSamples: timeline.durationSamples, pacingProfile: plan.pacingProfile ?? null,
    silenceProbe: silenceMap ? {sourceId: probedSource.id, sourceSha256: probedSource.sha256, probeSha256: silenceMap.probeSha256} : null,
    narrativeBeats: narrativeBeats(rows), availablePauseWindows: projectedPauseWindows(plan, timeline, silenceMap, probedSource),
    visualCueCandidates: visualCueCandidates(rows), visualSeamRisks: visualSeamRisks(plan, timeline)};
}

export async function verifyAnimationHandoff(handoff, options) {
  const canonicalHandoff = await compileAnimationHandoff(options);
  if (stableJson(handoff) !== stableJson(canonicalHandoff)) fail('animation-handoff-stale', 'Animation handoff differs from the canonical plan, timeline bytes, and probe evidence');
  return canonicalHandoff;
}
