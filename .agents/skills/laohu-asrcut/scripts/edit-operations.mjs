import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {resolve} from 'node:path';
import {AsrcutError, compilePlan, hashPlan, validatePlan} from './asrcut.mjs';

const EDIT_OPS_FORMAT = 'laohu.asrcut.edit-ops/1';
const PACING_PROFILES = new Set(['standard-narration', 'compact', 'natural']);
const PAUSE_KINDS = new Set(['head', 'tail', 'micro', 'clause', 'sentence', 'paragraph', 'emphasis']);
const PAUSE_FUNCTIONS = new Set(['emotional-beat', 'system-sound', 'visual-action', 'user-locked', 'visual-comprehension']);
const STANDARD_PAUSE_WINDOWS_MS = new Map([['clause', [350, 480]], ['sentence', [450, 650]], ['paragraph', [600, 850]]]);
const COMPACT_PAUSE_WINDOWS_MS = new Map([['clause', [250, 350]], ['sentence', [400, 450]], ['paragraph', [550, 600]]]);
const NATURAL_PAUSE_WINDOWS_MS = new Map([['clause', [500, 1000]], ['sentence', [700, 1000]], ['paragraph', [900, 1000]]]);
const PROFILE_PAUSE_WINDOWS_MS = new Map([['standard-narration', STANDARD_PAUSE_WINDOWS_MS], ['compact', COMPACT_PAUSE_WINDOWS_MS], ['natural', NATURAL_PAUSE_WINDOWS_MS]]);
const PRECISE_WORD = new Set(['measured', 'aligned']);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const unique = (values) => [...new Set(values)];
const sourceUnit = (item) => item.kind !== 'presentation';
const overlaps = (a, b) => a.startSample < b.endSample && b.startSample < a.endSample;
export const containsRange = (outer, inner) => outer.sampleRateHz === inner.sampleRateHz
  && outer.startSample <= inner.startSample && outer.endSample >= inner.endSample;
const equalRange = (a, b) => a?.startSample === b?.startSample && a?.endSample === b?.endSample && a?.sampleRateHz === b?.sampleRateHz;
const sampleRange = (startSample, endSample, sampleRateHz) => ({startSample, endSample, sampleRateHz});

const fail = (code, message, details) => { throw new AsrcutError(code, message, details); };
const validRange = (range) => record(range) && Object.keys(range).every((key) => ['startSample', 'endSample', 'sampleRateHz'].includes(key))
  && Number.isSafeInteger(range.startSample) && range.startSample >= 0
  && Number.isSafeInteger(range.endSample) && range.endSample > range.startSample
  && Number.isSafeInteger(range.sampleRateHz) && range.sampleRateHz > 0;

function requireKeys(value, keys, label) {
  if (!record(value) || Object.keys(value).some((key) => !keys.includes(key))) fail('invalid-edit-operation', `${label} has unsupported fields or is not an object`);
}

function requireIds(ids, label) {
  if (!Array.isArray(ids) || ids.some((id) => !nonEmpty(id)) || new Set(ids).size !== ids.length) {
    fail('invalid-edit-operation', `${label} must contain distinct non-empty IDs`);
  }
}

function sourceScope(plan, sourceId) {
  const source = plan.sources.find((entry) => entry.id === sourceId);
  if (!source) fail('edit-source-missing', `Source ${sourceId} is absent from the current edit plan`);
  const coverage = plan.coverage.filter((item) => item.sourceId === sourceId).sort((a, b) => a.sourceRange.startSample - b.sourceRange.startSample);
  return {source, coverage, bounds: {...coverage[0].sourceRange, endSample: coverage.at(-1).sourceRange.endSample}};
}

function preciseWords(segment) {
  const spoken = segment.tokens.filter((token) => nonEmpty(token.rawText));
  return spoken.length > 0 && spoken.every((token) => token.sourceRange && PRECISE_WORD.has(token.timingPrecision));
}

export function sourceSpeechGaps(source, bounds) {
  const speech = source.transcript.segments.flatMap((segment) => {
    if (!segment.sourceRange) return [];
    return preciseWords(segment) ? segment.tokens.map((token) => token.sourceRange).filter(Boolean) : [segment.sourceRange];
  }).filter((range) => overlaps(range, bounds)).sort((a, b) => a.startSample - b.startSample);
  if (!speech.length) return [];
  const gaps = [];
  let cursor = bounds.startSample;
  for (const [index, range] of speech.entries()) {
    if (range.startSample > cursor) gaps.push({kind: index === 0 ? 'head' : 'interior', range: sampleRange(cursor, range.startSample, bounds.sampleRateHz)});
    cursor = Math.max(cursor, range.endSample);
  }
  if (cursor < bounds.endSample) gaps.push({kind: 'tail', range: sampleRange(cursor, bounds.endSample, bounds.sampleRateHz)});
  return gaps;
}

function requireCutBoundaries(source, range) {
  for (const segment of source.transcript.segments) {
    if (!segment.sourceRange || !overlaps(range, segment.sourceRange)) continue;
    const boundaries = [range.startSample, range.endSample].filter((value) => segment.sourceRange.startSample < value && value < segment.sourceRange.endSample);
    for (const boundary of boundaries) {
      const cutWord = segment.tokens.find((token) => token.sourceRange?.startSample < boundary && boundary < token.sourceRange?.endSample);
      if (cutWord) fail('cut-through-word', `Cut at sample ${boundary} intersects word ${cutWord.id}`);
      if (!preciseWords(segment) || segment.tokens.some((token) => !token.sourceRange)) {
        fail('cut-through-utterance', `Cut at sample ${boundary} falls inside ${segment.id} without complete measured/aligned word evidence`);
      }
    }
  }
}

function rangeTokens(source, range) {
  return source.transcript.segments.flatMap((segment) => segment.tokens
    .filter((token) => (token.sourceRange || segment.sourceRange) && containsRange(range, token.sourceRange ?? segment.sourceRange))
    .map((token) => token.id));
}

export function editorialMetadataErrors(plan) {
  const errors = [];
  if (Object.hasOwn(plan, 'pacingProfile') && !PACING_PROFILES.has(plan.pacingProfile)) errors.push('pacingProfile must identify a supported profile');
  const pauseIds = new Set();
  if (Object.hasOwn(plan, 'pauseWindows') && !Array.isArray(plan.pauseWindows)) errors.push('pauseWindows must be an array');
  for (const row of Array.isArray(plan.pauseWindows) ? plan.pauseWindows : []) {
    if (!record(row) || Object.keys(row).some((key) => !['id', 'sourceId', 'sourceRange', 'pauseKind', 'reason', 'function'].includes(key))
      || !nonEmpty(row.id) || pauseIds.has(row.id) || !PAUSE_KINDS.has(row.pauseKind) || !validRange(row.sourceRange) || !nonEmpty(row.reason)
      || (Object.hasOwn(row, 'function') && !PAUSE_FUNCTIONS.has(row.function))) {
      errors.push('each pause window requires a unique id, exact source range, semantic pauseKind, reason and supported function when present');
      continue;
    }
    pauseIds.add(row.id);
    const source = plan.sources.find((item) => item.id === row.sourceId);
    const coverage = plan.coverage.filter((item) => item.sourceId === row.sourceId && validRange(item.sourceRange));
    if (!source || !coverage.length) { errors.push(`pause window ${row.id} has no source scope`); continue; }
    const {bounds} = sourceScope(plan, row.sourceId);
    if (!containsRange(bounds, row.sourceRange)) errors.push(`pause window ${row.id} exceeds its source scope or uses a different clock`);
    else if (!row.function && !sourceSpeechGaps(source, bounds).some((gap) => containsRange(gap.range, row.sourceRange))) {
      errors.push(`pause window ${row.id} overlaps transcript speech or has no source gap evidence`);
    }
  }
  if (Object.hasOwn(plan, 'narrativeBeats') && !Array.isArray(plan.narrativeBeats)) errors.push('narrativeBeats must be an array');
  const beatIds = new Set();
  const beatSegments = new Set();
  for (const row of Array.isArray(plan.narrativeBeats) ? plan.narrativeBeats : []) {
    const source = plan.sources.find((item) => item.id === row?.sourceId);
    const order = new Map((source?.transcript?.segments ?? []).map((segment, index) => [segment.id, index]));
    if (!record(row) || Object.keys(row).some((key) => !['id', 'sourceId', 'segmentIds', 'role'].includes(key))
      || !nonEmpty(row.id) || beatIds.has(row.id) || !nonEmpty(row.role) || !Array.isArray(row.segmentIds) || !row.segmentIds.length
      || row.segmentIds.some((id, index) => !order.has(id) || beatSegments.has(id) || (index > 0 && order.get(id) !== order.get(row.segmentIds[index - 1]) + 1))) {
      errors.push('each narrative beat requires a unique id, an author-supplied role, and nonoverlapping consecutive real source segment IDs');
      continue;
    }
    beatIds.add(row.id);
    row.segmentIds.forEach((id) => beatSegments.add(id));
  }
  const decisions = new Map(plan.decisions.map((decision) => [decision.id, decision]));
  for (const decision of plan.decisions) {
    for (const key of ['visualSeamRisk', 'visualMaskHint']) if (Object.hasOwn(decision, key) && !nonEmpty(decision[key])) errors.push(`decision ${decision.id} ${key} must be non-empty text`);
    if (Object.hasOwn(decision, 'pauseKind') || Object.hasOwn(decision, 'pauseRange')) {
      const sourceId = decision.sourceRanges?.[0]?.sourceId;
      const source = plan.sources.find((item) => item.id === sourceId);
      const hasCoverage = plan.coverage.some((item) => item.sourceId === sourceId);
      if (decision.action !== 'delete' || !PAUSE_KINDS.has(decision.pauseKind) || !validRange(decision.pauseRange)
        || !source || !hasCoverage || !decision.sourceRanges.every((row) => row.sourceId === sourceId && containsRange(decision.pauseRange, row.sourceRange))
        || !sourceSpeechGaps(source, sourceScope(plan, sourceId).bounds).some((gap) => containsRange(gap.range, decision.pauseRange))) {
        errors.push(`decision ${decision.id} does not identify an exact semantic pause enclosing its deletion ranges`);
      }
    }
    if (Object.hasOwn(decision, 'pauseException') && !['retake-adjacent', 'speech-error-adjacent'].includes(decision.pauseException)) errors.push(`decision ${decision.id} has an unsupported micro-pause exception`);
    if (Object.hasOwn(decision, 'revertedFromDecisionId')) {
      const prior = decisions.get(decision.revertedFromDecisionId);
      if (!prior || prior === decision || plan.decisions.indexOf(prior) >= plan.decisions.indexOf(decision)) errors.push(`decision ${decision.id} must point to an earlier decision to record a reversion`);
    }
  }
  return errors;
}

function programEdgeCut(plan, scope, selection, gap) {
  const {source, bounds} = scope;
  const inside = (sample) => gap.startSample < sample && sample < gap.endSample;
  const head = selection.startSample === bounds.startSample && inside(selection.endSample);
  const tail = selection.endSample === bounds.endSample && inside(selection.startSample);
  if (!head && !tail) return null;
  const cutSample = head ? selection.endSample : selection.startSample;
  const coverageById = new Map(plan.coverage.map((row) => [row.id, row]));
  const remaining = plan.sequence.filter(sourceUnit).flatMap((item) => {
    const coverage = coverageById.get(item.coverageId);
    if (coverage.sourceId !== source.id) return [{atCut: false}];
    const {sourceRange} = coverage;
    const start = head ? Math.max(sourceRange.startSample, cutSample) : sourceRange.startSample;
    const end = tail ? Math.min(sourceRange.endSample, cutSample) : sourceRange.endSample;
    return end > start ? [{atCut: (head ? start : end) === cutSample}] : [];
  });
  const atProgramEdge = head ? remaining[0]?.atCut : remaining.at(-1)?.atCut;
  if (!atProgramEdge || remaining.filter((item) => item.atCut).length !== 1) return null;
  return {kind: head ? 'head' : 'tail', sample: cutSample};
}

function protectFunctionalPause(plan, scope, operation) {
  const {source, bounds} = scope;
  const range = operation.sourceRange;
  const protectedWindow = (plan.pauseWindows ?? []).find((row) => row.sourceId === source.id && row.function && overlaps(row.sourceRange, range));
  if (protectedWindow) fail('functional-pause-protected', `Edit intersects protected ${protectedWindow.function} window ${protectedWindow.id}`);
  if (operation.op === 'trim-pause') {
    const blocking = plan.questions.find((entry) => (!entry.sourceId || entry.sourceId === source.id) && entry.blocks.some((value) => ['precision', 'crossTrackSync'].includes(value))
      && (!entry.sourceRange || overlaps(entry.sourceRange, range)));
    if (blocking) fail('pause-precision-blocked', `Question ${blocking.id} blocks a precise pause edit`);
    const marked = (plan.annotations ?? []).find((annotation) => {
      if (annotation.sourceId !== source.id || (!annotation.userNote && !annotation.motionBinding)) return false;
      const segment = source.transcript.segments.find((row) => row.id === annotation.segmentId);
      const markedRange = annotation.tokenId ? segment?.tokens.find((token) => token.id === annotation.tokenId)?.sourceRange : segment?.sourceRange;
      return markedRange && overlaps(markedRange, range);
    });
    if (marked) fail('pause-annotation-protected', `Annotation ${marked.id} covers the proposed pause cut; resolve its timing intent before trimming`);
  }
  if (Object.hasOwn(operation, 'pauseException') && !['retake-adjacent', 'speech-error-adjacent'].includes(operation.pauseException)) fail('invalid-pause-exception', 'A micro-pause exception requires a declared retake-adjacent or speech-error-adjacent reason');
  const microMs = plan.pacingProfile === 'natural' ? 600 : 350;
  const protectedGap = sourceSpeechGaps(source, bounds).find(({kind, range: gap}) => kind === 'interior' && overlaps(gap, range)
    && (gap.endSample - gap.startSample) * 1000 <= microMs * gap.sampleRateHz
    && !(range.startSample < gap.startSample && range.endSample > gap.endSample));
  if (protectedGap && !operation.pauseException) {
    const programEdge = operation.op === 'delete-range' ? programEdgeCut(plan, scope, range, protectedGap.range) : null;
    if (programEdge) return programEdge;
    fail('micro-pause-protected', `Edit intersects a protected natural gap of at most ${microMs}ms`, protectedGap.range);
  }
  return null;
}

function measuredPauseRange(gap, quiet) {
  return sampleRange(Math.max(gap.startSample, quiet.startSample), Math.min(gap.endSample, quiet.endSample), gap.sampleRateHz);
}

function retainedPauseSamples(coverage, range) {
  return coverage.filter((item) => item.disposition === 'retain').reduce((sum, {sourceRange}) =>
    sum + Math.max(0, Math.min(range.endSample, sourceRange.endSample) - Math.max(range.startSample, sourceRange.startSample)), 0);
}

function verifyPauseOverride(plan, scope, operation, gap, measured) {
  const evidence = operation.verification;
  const deny = () => fail('invalid-pause-verification', 'Pause override requires a source-bound listening finding or an exact existing user pacing instruction for this window');
  if (!record(evidence) || !scope.source.sha256 || evidence.sourceSha256 !== scope.source.sha256 || !validRange(evidence.sourceRange)) deny();
  if (evidence.method === 'audio-listening') {
    requireKeys(evidence, ['method', 'listeningStatus', 'sourceSha256', 'sourceRange', 'reviewedBy', 'finding'], 'pause listening evidence');
    if (evidence.listeningStatus !== 'listened' || !nonEmpty(evidence.reviewedBy) || !nonEmpty(evidence.finding) || !equalRange(evidence.sourceRange, operation.sourceRange)) deny();
  } else if (evidence.method === 'user-direction') {
    requireKeys(evidence, ['method', 'sourceSha256', 'sourceRange', 'userNoteId', 'excerpt', 'targetDurationSamples'], 'pause direction evidence');
    const note = (plan.annotations ?? []).find((row) => row.id === evidence.userNoteId && row.sourceId === scope.source.id);
    const segment = scope.source.transcript.segments.find((row) => row.id === note?.segmentId);
    const adjacent = segment?.sourceRange && (overlaps(segment.sourceRange, gap)
      || segment.sourceRange.endSample === gap.startSample || segment.sourceRange.startSample === gap.endSample);
    const kept = measured ? retainedPauseSamples(scope.coverage, measured) - (operation.sourceRange.endSample - operation.sourceRange.startSample) : -1;
    if (!adjacent || !nonEmpty(note?.userNote) || !nonEmpty(evidence.excerpt) || !note.userNote.includes(evidence.excerpt)
      || !measured || !equalRange(evidence.sourceRange, measured) || !Number.isSafeInteger(evidence.targetDurationSamples)
      || evidence.targetDurationSamples <= 0 || evidence.targetDurationSamples !== kept) deny();
  } else deny();
  return structuredClone(evidence);
}

function protectMeasuredPause(plan, scope, operation, gap, silenceMap) {
  if (operation.pauseKind === 'micro' && !operation.pauseException) fail('micro-pause-protected', 'Preserve a natural micro pause unless the adjacent retake or speech error has been established');
  const measuredQuiet = silenceMap.silences.find((row) => row.startSample <= operation.sourceRange.startSample && row.endSample >= operation.sourceRange.endSample);
  const measured = measuredQuiet ? measuredPauseRange(gap.range, measuredQuiet) : null;
  const override = Object.hasOwn(operation, 'verification') ? verifyPauseOverride(plan, scope, operation, gap.range, measured) : null;
  if (!measured) {
    const quietBoundary = (boundary) => silenceMap.silences.some((row) => row.startSample < boundary && row.endSample > boundary);
    const verifiedInterference = override?.method === 'audio-listening' && quietBoundary(operation.sourceRange.startSample) && quietBoundary(operation.sourceRange.endSample);
    if (!verifiedInterference) fail('pause-cut-outside-probe', 'The removed range must fit inside measured low energy, or enclose a documented interference between measured low-energy cut points');
  }
  if (override) return override;
  if (operation.pauseKind === 'emphasis') fail('pause-window-protected', 'Preserve the intended emphasis pause unless a separately evidenced trim is required');
  const band = PROFILE_PAUSE_WINDOWS_MS.get(plan.pacingProfile ?? 'standard-narration').get(operation.pauseKind);
  if (!band) return null;
  const [minimumMs, maximumMs] = band;
  const {startSample, endSample, sampleRateHz} = measured;
  const available = retainedPauseSamples(scope.coverage, measured);
  const resulting = available - (operation.sourceRange.endSample - operation.sourceRange.startSample);
  const details = {sourcePauseRange: measured, originalDurationMs: (endSample - startSample) * 1000 / sampleRateHz,
    retainedDurationMs: available * 1000 / sampleRateHz, proposedDurationMs: resulting * 1000 / sampleRateHz, minimumMs, maximumMs};
  if ((endSample - startSample) * 1000 <= maximumMs * sampleRateHz || available * 1000 <= maximumMs * sampleRateHz) {
    fail('pause-window-protected', 'Preserve the complete measured pause at or below its pacing window unless a separate source-bound exception applies', details);
  }
  if (resulting * 1000 < minimumMs * sampleRateHz) fail('pause-window-overshoot', 'Proposed trim would leave less than the pacing window of measured source pause', details);
  return null;
}

const metadataKeys = ['visualSeamRisk', 'visualMaskHint', 'revertedFromDecisionId'];
function decisionRecord(id, action, reason, coverage, keptOccurrenceIds, tokenIds, metadata = {}) {
  return {id, action, reason, coverageIds: coverage.map((item) => item.id),
    sourceRanges: coverage.map(({sourceId, sourceRange}) => ({sourceId, sourceRange})), keptOccurrenceIds, tokenIds, ...metadata};
}

function decisionMetadata(operation, previousDecisions) {
  const result = {};
  for (const key of metadataKeys) {
    if (!Object.hasOwn(operation, key)) continue;
    if (!nonEmpty(operation[key])) fail('invalid-edit-operation', `${key} must be non-empty text`);
    result[key] = operation[key];
  }
  if (result.revertedFromDecisionId && !previousDecisions.has(result.revertedFromDecisionId)) fail('edit-reversion-missing', 'revertedFromDecisionId must reference a decision already present in the input revision');
  if (operation.op === 'trim-pause') Object.assign(result, {pauseKind: operation.pauseKind, pauseRange: operation.pauseRange});
  if (operation.pauseException) result.pauseException = operation.pauseException;
  return result;
}

function restoreDeletion(plan, operation, scope, metadata) {
  const target = scope.coverage.find((item) => item.disposition === 'delete' && item.decisionId === operation.revertedFromDecisionId && equalRange(item.sourceRange, operation.sourceRange));
  if (!target) fail('edit-reversion-missing', 'restore:true requires the exact currently deleted coverage range and its earlier decision ID');
  const order = new Map(plan.sources.map((source) => [source.id, source.order]));
  const coverage = new Map(plan.coverage.map((item) => [item.id, item]));
  const compare = (a, b) => order.get(a.sourceId) - order.get(b.sourceId) || a.sourceRange.startSample - b.sourceRange.startSample;
  const orderedUnits = plan.sequence.filter(sourceUnit);
  const firstLater = orderedUnits.findIndex((item) => compare(coverage.get(item.coverageId), target) > 0);
  if (firstLater !== -1 && orderedUnits.slice(firstLater).some((item) => compare(coverage.get(item.coverageId), target) < 0)) {
    fail('edit-reversion-ambiguous', 'The restored range has no unique source-order position in this reordered sequence');
  }
  const earlier = orderedUnits[firstLater === -1 ? orderedUnits.length - 1 : firstLater - 1];
  const later = orderedUnits[firstLater];
  const start = earlier ? plan.sequence.indexOf(earlier) + 1 : 0;
  const end = later ? plan.sequence.indexOf(later) : plan.sequence.length;
  if (earlier && later && start !== end) fail('edit-reversion-ambiguous', 'A presentation owns the restoration boundary; author its placement explicitly before restoring this range');
  const insertAt = earlier && !later ? start : end;
  const occurrenceId = `${operation.id}-restored`;
  if (plan.sequence.some((item) => (item.occurrenceId ?? item.id) === occurrenceId)) fail('edit-id-conflict', `Occurrence ${occurrenceId} already exists`);
  target.disposition = 'retain';
  target.decisionId = operation.id;
  const item = {occurrenceId, coverageId: target.id};
  if (plan.format.endsWith('/2')) item.kind = 'source';
  plan.sequence.splice(insertAt, 0, item);
  plan.decisions.push(decisionRecord(operation.id, 'retain', operation.reason, [target], [occurrenceId], target.tokenIds, metadata));
}

function projectOldOccurrence(id, remapped, tokenIds, repeated, coverageById, sourcesById) {
  if (!remapped.has(id)) return [id];
  const children = remapped.get(id);
  if (!repeated) return children.map((item) => item.occurrenceId);
  const withTokens = children.filter((item) => coverageById.get(item.coverageId).tokenIds.some((tokenId) => tokenIds.includes(tokenId)));
  if (withTokens.length > 0) return withTokens.map((item) => item.occurrenceId);
  if (tokenIds.length === 0) {
    const complete = children.filter((item) => {
      const coverage = coverageById.get(item.coverageId);
      return sourcesById.get(coverage.sourceId).transcript.segments.some((segment) => nonEmpty(segment.rawText) && segment.sourceRange && containsRange(coverage.sourceRange, segment.sourceRange));
    });
    if (complete.length === 1) return [complete[0].occurrenceId];
  }
  fail('edit-kept-occurrence-stale', `Deletion would lose or ambiguously move the retained evidence for repeated occurrence ${id}`);
}

function deleteCoverage(plan, scope, operation, metadata) {
  const {source, coverage} = scope;
  const range = operation.sourceRange;
  const affected = coverage.filter((item) => overlaps(item.sourceRange, range));
  if (!affected.length || affected.some((item) => item.disposition !== 'retain')) fail('edit-range-not-retained', 'Deletion requires only currently retained coverage in the selected source range');
  const replacements = new Map();
  const deleted = [];
  const existingCoverageIds = new Set(plan.coverage.map((row) => row.id));
  for (const [index, item] of affected.entries()) {
    const start = Math.max(range.startSample, item.sourceRange.startSample);
    const end = Math.min(range.endSample, item.sourceRange.endSample);
    const slices = [[item.sourceRange.startSample, start, 'retain'], [start, end, 'delete'], [end, item.sourceRange.endSample, 'retain']];
    const isWhole = start === item.sourceRange.startSample && end === item.sourceRange.endSample;
    const children = slices.filter(([from, to]) => to > from).map(([from, to, disposition], slice) => {
      const id = isWhole ? item.id : `${operation.id}-range-${index + 1}-${slice + 1}`;
      if (!isWhole && existingCoverageIds.has(id)) fail('edit-id-conflict', `Coverage ${id} already exists`);
      const sourceRange = sampleRange(from, to, range.sampleRateHz);
      const child = {id, sourceId: source.id, sourceRange, disposition, decisionId: disposition === 'retain' ? item.decisionId : operation.id, tokenIds: rangeTokens(source, sourceRange)};
      if (disposition === 'delete') deleted.push(child);
      return child;
    });
    replacements.set(item.id, children);
  }
  plan.coverage = plan.coverage.flatMap((item) => replacements.get(item.id) ?? [item]);
  const newCoverage = new Map(plan.coverage.map((item) => [item.id, item]));
  const sourcesById = new Map(plan.sources.map((item) => [item.id, item]));
  const remapped = new Map();
  const existingIds = new Set(plan.sequence.map((item) => item.occurrenceId ?? item.id));
  plan.sequence = plan.sequence.flatMap((item, index) => {
    if (!sourceUnit(item) || !replacements.has(item.coverageId)) return [item];
    const children = replacements.get(item.coverageId).filter((row) => row.disposition === 'retain').map((row, fragment) => {
      const occurrenceId = fragment === 0 ? item.occurrenceId : `${operation.id}-occ-${index + 1}-${fragment + 1}`;
      if (fragment > 0 && existingIds.has(occurrenceId)) fail('edit-id-conflict', `Occurrence ${occurrenceId} already exists`);
      return {...item, occurrenceId, coverageId: row.id};
    });
    remapped.set(item.occurrenceId, children);
    return children;
  });
  const replacementIds = (id) => replacements.get(id)?.filter((item) => item.disposition === 'retain').map((item) => item.id) ?? [id];
  const liveDeletionDecisions = new Set(plan.coverage.filter((row) => row.disposition === 'delete').map((row) => row.decisionId));
  for (const decision of plan.decisions) {
    // A reverted decision keeps its original ranges and reason even when later edits give the active ranges new IDs.
    if (decision.action === 'delete' && !liveDeletionDecisions.has(decision.id)) {
      decision.coverageIds = (decision.coverageIds ?? []).filter((id) => newCoverage.has(id));
      continue;
    }
    const repeatLink = decision.action === 'delete' && decision.relation === 'repeated-content';
    if (decision.keptOccurrenceIds?.some((id) => remapped.has(id))) {
      decision.keptOccurrenceIds = unique(decision.keptOccurrenceIds.flatMap((id) => projectOldOccurrence(id, remapped, decision.tokenIds ?? [], repeatLink, newCoverage, sourcesById)));
    }
    const affectedIds = (decision.coverageIds ?? []).filter((id) => replacements.has(id));
    if (!affectedIds.length) continue;
    if (decision.action === 'delete') {
      decision.coverageIds = decision.coverageIds.filter((id) => newCoverage.has(id));
      continue;
    }
    decision.coverageIds = unique(decision.coverageIds.flatMap(replacementIds));
    const surviving = decision.coverageIds.map((id) => newCoverage.get(id));
    const replacedRanges = affected.filter((item) => affectedIds.includes(item.id)).map((item) => item.sourceRange);
    const newRanges = surviving.filter((item) => affectedIds.flatMap(replacementIds).includes(item.id)).map(({sourceId, sourceRange}) => ({sourceId, sourceRange}));
    decision.sourceRanges = [...(decision.sourceRanges ?? []).filter((row) => row.sourceId !== source.id || !replacedRanges.some((prior) => equalRange(row.sourceRange, prior))), ...newRanges];
    const survivingTokens = new Set(surviving.flatMap((item) => item.tokenIds));
    decision.tokenIds = (decision.tokenIds ?? []).filter((id) => survivingTokens.has(id));
  }
  for (const annotation of plan.annotations ?? []) {
    const anchors = [annotation.occurrenceId, ...(annotation.motionBinding?.phases ?? []).map((phase) => phase.anchor?.clipOccurrenceId)].filter(Boolean);
    if (anchors.some((id) => remapped.has(id) && !remapped.get(id).some((item) => item.occurrenceId === id))) {
      fail('edit-annotation-occurrence-stale', `Edit removes an occurrence explicitly referenced by annotation ${annotation.id}`);
    }
  }
  if (operation.relation === 'repeated-content') {
    requireIds(operation.keptOccurrenceIds, 'keptOccurrenceIds');
    requireIds(operation.keptTokenIds ?? [], 'keptTokenIds');
    if (!operation.keptOccurrenceIds.length) fail('edit-kept-occurrence-missing', 'Repeated-content deletion requires the real retained occurrence IDs');
    const keptTokenIds = operation.keptTokenIds ?? [];
    const kept = unique(operation.keptOccurrenceIds.flatMap((id) => projectOldOccurrence(id, remapped, keptTokenIds, true, newCoverage, sourcesById)));
    plan.decisions.push(decisionRecord(operation.id, 'delete', operation.reason, deleted, kept, keptTokenIds, {...metadata, relation: operation.relation}));
  } else {
    if (operation.relation != null || Object.hasOwn(operation, 'keptOccurrenceIds') || Object.hasOwn(operation, 'keptTokenIds')) {
      fail('invalid-edit-operation', 'Retained-evidence fields are only accepted for repeated-content deletions');
    }
    plan.decisions.push(decisionRecord(operation.id, 'delete', operation.reason, deleted, [], deleted.flatMap((item) => item.tokenIds), metadata));
  }
}

function changeSequence(plan, operation, metadata) {
  const sourceOccurrences = plan.sequence.filter(sourceUnit);
  if (plan.authorization[operation.op] !== true) fail(`edit-${operation.op}-not-authorized`, `The edit plan does not authorize ${operation.op}`);
  if (operation.op === 'repeat') {
    const existing = sourceOccurrences.find((item) => item.occurrenceId === operation.occurrenceId);
    if (!existing) fail('edit-occurrence-missing', `Occurrence ${operation.occurrenceId} is not retained`);
    if (!nonEmpty(operation.newOccurrenceId) || plan.sequence.some((item) => (item.occurrenceId ?? item.id) === operation.newOccurrenceId)) fail('edit-id-conflict', 'Repeat requires a new, unique occurrence ID');
    const coverage = plan.coverage.find((item) => item.id === existing.coverageId);
    plan.sequence.splice(plan.sequence.indexOf(existing) + 1, 0, {...existing, occurrenceId: operation.newOccurrenceId});
    const kept = plan.sequence.filter((item) => item.coverageId === coverage.id).map((item) => item.occurrenceId);
    plan.decisions.push(decisionRecord(operation.id, 'repeat', operation.reason, [coverage], kept, coverage.tokenIds, metadata));
    return;
  }
  requireIds(operation.occurrenceIds, 'occurrenceIds');
  const byId = new Map(sourceOccurrences.map((item) => [item.occurrenceId, item]));
  if (operation.occurrenceIds.length !== byId.size || operation.occurrenceIds.some((id) => !byId.has(id))) fail('edit-reorder-scope', 'Reorder requires an exact permutation of the currently retained source occurrences');
  if (operation.occurrenceIds.every((id, index) => id === sourceOccurrences[index].occurrenceId)) fail('edit-reorder-no-change', 'Requested occurrence order already matches the current sequence');
  let index = 0;
  plan.sequence = plan.sequence.map((item) => sourceUnit(item) ? byId.get(operation.occurrenceIds[index++]) : item);
  const movedCoverage = new Set(operation.occurrenceIds.filter((id, position) => id !== sourceOccurrences[position].occurrenceId).map((id) => byId.get(id).coverageId));
  const sourceOrder = new Map(plan.sources.map((source) => [source.id, source.order]));
  const originalCoverage = plan.coverage.filter((item) => item.disposition === 'retain').sort((left, right) =>
    sourceOrder.get(left.sourceId) - sourceOrder.get(right.sourceId) || left.sourceRange.startSample - right.sourceRange.startSample);
  const reorderedCoverage = unique(operation.occurrenceIds.map((id) => byId.get(id).coverageId));
  reorderedCoverage.forEach((id, position) => { if (id !== originalCoverage[position].id) movedCoverage.add(id); });
  const affected = plan.coverage.filter((item) => movedCoverage.has(item.id));
  const kept = operation.occurrenceIds.filter((id) => movedCoverage.has(byId.get(id).coverageId));
  plan.decisions.push(decisionRecord(operation.id, 'reorder', operation.reason, affected, kept, affected.flatMap((item) => item.tokenIds), metadata));
}

async function correctSpeech(plan, operation, baseDir) {
  const {source} = sourceScope(plan, operation.sourceId);
  const segment = source.transcript.segments.find((row) => row.id === operation.segmentId);
  const tokenId = operation.tokenId ?? null;
  const target = tokenId === null ? segment : segment?.tokens.find((row) => row.id === tokenId);
  if (!target || !nonEmpty(operation.spokenText)) fail('invalid-edit-operation', 'Spoken correction requires a real source segment/word and non-empty spokenText');
  const status = operation.status ?? 'candidate';
  let verification = {method: 'not-reviewed', listeningStatus: 'not-reviewed', alignmentStatus: 'not-provided', sourceRange: null};
  if (status === 'confirmed') {
    verification = operation.verification;
    if (!record(verification)) fail('spoken-listening-evidence-required', 'Confirmed correction requires an externally supplied listening record');
    requireKeys(verification, ['method', 'listeningStatus', 'alignmentStatus', 'sourceRange', 'reviewedBy', 'sourceSha256'], 'spoken listening evidence');
    if (verification.method !== 'audio-listening' || verification.listeningStatus !== 'listened' || !nonEmpty(verification.reviewedBy)
      || !validRange(verification.sourceRange) || !equalRange(target.sourceRange, verification.sourceRange)
      || !source.mediaPath || !source.sha256 || verification.sourceSha256 !== source.sha256) {
      fail('spoken-listening-evidence-required', 'Confirmed correction requires an identified reviewer, the exact audio range and the linked source SHA-256');
    }
    const digest = createHash('sha256');
    try { for await (const chunk of createReadStream(resolve(baseDir, source.mediaPath))) digest.update(chunk); }
    catch { fail('spoken-listening-source-unreadable', `Cannot read the linked original audio for ${source.id}`); }
    if (digest.digest('hex') !== source.sha256) fail('spoken-listening-source-stale', `The linked audio for ${source.id} differs from the submitted listening evidence`);
    if (verification.alignmentStatus === undefined) verification = {...verification, alignmentStatus: 'not-provided'};
  } else if (status !== 'candidate' || Object.hasOwn(operation, 'verification')) fail('invalid-edit-operation', 'Candidate corrections do not carry a listened verification');
  const existing = plan.spokenCorrections.find((item) => item.id === operation.id);
  if (existing && (existing.sourceId !== source.id || existing.segmentId !== segment.id || existing.tokenId !== tokenId || (existing.status === 'confirmed' && status !== 'confirmed'))) {
    fail('spoken-correction-anchor-immutable', 'Existing spoken correction IDs preserve the evidence anchor and a confirmed correction cannot be downgraded implicitly');
  }
  const correction = {id: operation.id, sourceId: source.id, segmentId: segment.id, tokenId, rawText: target.rawText, spokenText: operation.spokenText, status, verification: structuredClone(verification)};
  if (existing) plan.spokenCorrections[plan.spokenCorrections.indexOf(existing)] = correction;
  else plan.spokenCorrections.push(correction);
}

function setDisplayText(plan, operation) {
  const segment = plan.sources.flatMap((source) => source.transcript.segments).find((row) => row.id === operation.segmentId);
  if (!segment || typeof operation.text !== 'string') fail('invalid-edit-operation', 'Display text requires a real segment and a text string');
  if (Object.hasOwn(operation, 'tokenIds')) {
    requireIds(operation.tokenIds, 'display tokenIds');
    const declared = new Set(operation.tokenIds);
    const sourceOrder = segment.tokens.filter((token) => declared.has(token.id)).map((token) => token.id);
    if (sourceOrder.length !== declared.size || sourceOrder.some((id, index) => id !== operation.tokenIds[index])) fail('invalid-edit-operation', 'Display tokenIds must identify tokens in the segment in source order');
  }
  const existing = plan.displayText.find((row) => row.id === operation.id);
  if (existing && existing.segmentId !== operation.segmentId) fail('display-text-anchor-immutable', 'An existing display text ID preserves its original segment');
  const {id, segmentId, text, tokenIds} = operation;
  const row = {id, segmentId, text, ...(tokenIds !== undefined ? {tokenIds: [...tokenIds]} : {})};
  if (existing) plan.displayText[plan.displayText.indexOf(existing)] = row;
  else plan.displayText.push(row);
}

export async function verifyProbeAcoustics(silenceMap, {plan, sourceId, baseDir = process.cwd(), ffmpegPath, ffprobePath} = {}) {
  const {verifySilenceMap, probeSilence} = await import('./audio-probe.mjs');
  const source = verifySilenceMap(silenceMap, {plan, sourceId});
  if (!source.mediaPath) fail('media-path-missing', `Source ${source.id} has no linked audio to verify the supplied probe`);
  const measured = await probeSilence({inputPath: resolve(baseDir, source.mediaPath), audioStreamIndex: silenceMap.source.streamIndex,
    noiseDb: silenceMap.parameters.noiseDb, minSilenceMs: silenceMap.parameters.minSilenceMs, sourceId: source.id, plan, baseDir, ffmpegPath, ffprobePath});
  const measuredSilences = (map) => map.silences.map(({startSample, endSample, durationMs, valleySample, nearestZeroCrossingSample, minRmsDb, meanRmsDb}) => ({
    startSample, endSample, durationMs, valleySample, nearestZeroCrossingSample, minRmsDb, meanRmsDb,
  }));
  const sameSource = ['sha256', 'streamIndex', 'sampleRateHz', 'sampleCount', 'channels', 'startPts'].every((key) => measured.source[key] === silenceMap.source[key])
    && measured.source.timeBase.numerator === silenceMap.source.timeBase?.numerator
    && measured.source.timeBase.denominator === silenceMap.source.timeBase?.denominator;
  if (!sameSource || measured.parameters.windowSamples !== silenceMap.parameters.windowSamples
    || JSON.stringify(measuredSilences(measured)) !== JSON.stringify(measuredSilences(silenceMap))) {
    fail('silence-map-acoustics-stale', 'The supplied silence map cannot be reproduced from its linked original audio and declared probe parameters');
  }
  return source;
}

const timingKeys = ['id', 'op', 'sourceId', 'sourceRange', 'reason', ...metadataKeys, 'pauseException', 'relation', 'keptOccurrenceIds', 'keptTokenIds'];
const operationKeys = new Map([
  ['delete-range', [...timingKeys, 'restore']],
  ['trim-pause', [...timingKeys, 'pauseRange', 'pauseKind', 'verification']],
  ['reorder', ['id', 'op', 'occurrenceIds', 'reason', ...metadataKeys]],
  ['repeat', ['id', 'op', 'occurrenceId', 'newOccurrenceId', 'reason', ...metadataKeys]],
  ['spoken-correction', ['id', 'op', 'sourceId', 'segmentId', 'tokenId', 'spokenText', 'status', 'verification']],
  ['set-display-text', ['id', 'op', 'segmentId', 'text', 'tokenIds']],
]);

export async function applyEdits(plan, spec, {baseDir = process.cwd(), silenceMap = null, ffmpegPath, ffprobePath} = {}) {
  const before = validatePlan(plan);
  if (before.errors.length) fail('invalid-plan', 'Cannot apply edits to an invalid plan', before.errors);
  requireKeys(spec, ['format', 'expectedRevision', 'expectedPlanSha256', 'operations', 'pacingProfile', 'pauseWindows', 'narrativeBeats'], 'edit-ops');
  if (spec.format !== EDIT_OPS_FORMAT || !Array.isArray(spec.operations)) fail('invalid-edit-ops', `Expected ${EDIT_OPS_FORMAT} with an operations array`);
  if (spec.expectedRevision !== plan.project.revision || spec.expectedPlanSha256 !== before.planSha256) fail('edit-ops-stale', 'Edit operations must bind the input revision and edit-plan SHA-256');
  if (!spec.operations.length && !['pacingProfile', 'pauseWindows', 'narrativeBeats'].some((key) => Object.hasOwn(spec, key))) fail('empty-edit-ops', 'The edit operation document contains no operations or editorial metadata');
  const next = structuredClone(plan);
  next.state = 'draft';
  next.project.revision += 1;
  next.review = {status: 'not_requested', approvedPlanSha256: null};
  for (const key of ['pacingProfile', 'pauseWindows', 'narrativeBeats']) if (Object.hasOwn(spec, key)) next[key] = structuredClone(spec[key]);
  const metadataErrors = editorialMetadataErrors(next);
  if (metadataErrors.length) fail('invalid-editorial-metadata', 'Editorial metadata did not match the source evidence', metadataErrors);
  for (const protectedWindow of (plan.pauseWindows ?? []).filter((row) => row.function)) {
    if (!(next.pauseWindows ?? []).some((row) => row.id === protectedWindow.id && row.sourceId === protectedWindow.sourceId
      && row.function === protectedWindow.function && containsRange(row.sourceRange, protectedWindow.sourceRange))) {
      fail('functional-pause-protected', `Editorial metadata cannot drop or narrow protected source window ${protectedWindow.id}`);
    }
  }
  const previousDecisions = new Set(plan.decisions.map((item) => item.id));
  const handled = new Set();
  let probedSourceId = null;
  const verifyOperationProbe = async (sourceId) => {
    if (probedSourceId === sourceId) return;
    await verifyProbeAcoustics(silenceMap, {plan, sourceId, baseDir, ffmpegPath, ffprobePath});
    probedSourceId = sourceId;
  };
  for (const operation of spec.operations) {
    const allowedKeys = operationKeys.get(operation?.op);
    if (!allowedKeys || !nonEmpty(operation?.id) || handled.has(operation.id)) fail('invalid-edit-operation', 'Each operation requires a supported op and a unique non-empty ID');
    requireKeys(operation, allowedKeys, `operation ${operation.id}`);
    handled.add(operation.id);
    if (operation.op === 'spoken-correction') { await correctSpeech(next, operation, baseDir); continue; }
    if (operation.op === 'set-display-text') { setDisplayText(next, operation); continue; }
    if (!nonEmpty(operation.reason)) fail('invalid-edit-operation', `Operation ${operation.id} requires a non-empty reason`);
    if (next.decisions.some((item) => item.id === operation.id)) fail('edit-id-conflict', `Decision ${operation.id} already exists`);
    const metadata = decisionMetadata(operation, previousDecisions);
    if (['repeat', 'reorder'].includes(operation.op)) { changeSequence(next, operation, metadata); continue; }
    const scope = sourceScope(next, operation.sourceId);
    if (!validRange(operation.sourceRange) || !containsRange(scope.bounds, operation.sourceRange)) fail('invalid-edit-range', `Operation ${operation.id} requires a non-empty exact range on its source sample clock`);
    if (Object.hasOwn(operation, 'restore')) {
      if (operation.restore !== true || !operation.revertedFromDecisionId || operation.pauseException || operation.relation || operation.keptOccurrenceIds || operation.keptTokenIds) fail('invalid-edit-operation', 'Restoration requires restore:true and a preceding deletion ID');
      restoreDeletion(next, operation, scope, metadata);
      continue;
    }
    requireCutBoundaries(scope.source, operation.sourceRange);
    const programEdge = protectFunctionalPause(next, scope, operation);
    if (programEdge) {
      if (!silenceMap) fail('program-edge-probe-required', `The selected program ${programEdge.kind} inside a natural gap requires its original-source silence map`);
      await verifyOperationProbe(scope.source.id);
      if (!silenceMap.silences.some((row) => row.startSample < programEdge.sample && row.endSample > programEdge.sample)) {
        fail('program-edge-outside-probe', `The selected program ${programEdge.kind} boundary must be inside a measured low-energy span`);
      }
    }
    if (operation.op === 'delete-range' && sourceSpeechGaps(scope.source, scope.bounds).some((gap) => containsRange(gap.range, operation.sourceRange))) {
      fail('pause-operation-required', 'Select trim-pause and source acoustic evidence for an edit confined to a speech gap');
    }
    if (operation.op === 'trim-pause') {
      if (!PAUSE_KINDS.has(operation.pauseKind) || !validRange(operation.pauseRange) || !containsRange(operation.pauseRange, operation.sourceRange)) fail('invalid-pause-range', 'Trim requires a semantic pauseKind and an exact enclosing pauseRange');
      const gap = sourceSpeechGaps(scope.source, scope.bounds).find((row) => containsRange(row.range, operation.pauseRange));
      if (!gap) fail('invalid-pause-range', 'Trim pause range must be contained in a single source gap with no transcript speech');
      if ((gap.kind === 'interior' && ['head', 'tail'].includes(operation.pauseKind)) || (gap.kind !== 'interior' && gap.kind !== operation.pauseKind)) fail('invalid-pause-range', 'Head and tail trims must match their actual source boundaries');
      const statedWindow = (next.pauseWindows ?? []).find((row) => row.sourceId === scope.source.id
        && containsRange(gap.range, row.sourceRange) && overlaps(row.sourceRange, operation.sourceRange));
      if (statedWindow && statedWindow.pauseKind !== operation.pauseKind) fail('pause-kind-conflict', `Pause ${statedWindow.id} is classified as ${statedWindow.pauseKind} in the editorial record`);
      if (!silenceMap) fail('pause-probe-required', 'A trim-pause operation requires the original-source silence map; transcript-only inputs can supply candidates');
      await verifyOperationProbe(scope.source.id);
      const verifiedOverride = protectMeasuredPause(next, scope, operation, gap, silenceMap);
      if (verifiedOverride) metadata.pauseVerification = verifiedOverride;
    }
    deleteCoverage(next, scope, operation, metadata);
  }
  next.integrity ??= {};
  next.integrity.planSha256 = hashPlan(next);
  compilePlan(next);
  return next;
}
