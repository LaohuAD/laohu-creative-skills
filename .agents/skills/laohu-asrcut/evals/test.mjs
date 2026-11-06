import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {link, mkdir, readFile, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {promisify} from 'node:util';
import {loadVolcConfig, probeAudioDuration, transcribeVolcFlash} from '../scripts/asr-provider.mjs';
import {
  assertSafeOutputPath,
  authorizeReview,
  compilePlan,
  exportAudio,
  freezePlan,
  hashPlan,
  importAsrJson,
  importSrt,
  insertPresentationInterval,
  mergePlans,
  validatePlan,
  verifyPlanEvidence,
} from '../scripts/asrcut.mjs';

let assertionCount = 0;
for (const method of ['equal', 'deepEqual', 'ok', 'throws', 'rejects']) {
  const original = assert[method].bind(assert);
  assert[method] = (...args) => {
    assertionCount += 1;
    return original(...args);
  };
}

const root = resolve('.cache/tmp/asrcut-integration/core-tests');
const execFileAsync = promisify(execFile);
await rm(root, {recursive: true, force: true});
await mkdir(join(root, 'artifacts'), {recursive: true});
const rate = 1000;

function rehash(plan) {
  plan.integrity.planSha256 = hashPlan(plan);
  return plan;
}

function makeSplitDeletePlan(plan) {
  const sourceId = plan.sources[0].id;
  const clock = rate;
  const tokenIdsIn = (startSample, endSample) => plan.sources[0].transcript.segments.flatMap((segment) => segment.tokens
    .filter((token) => token.sourceRange && token.sourceRange.startSample >= startSample && token.sourceRange.endSample <= endSample).map((token) => token.id));
  const retainedA = `${sourceId}-keep-a`;
  const removed = `${sourceId}-delete-middle`;
  const retainedB = `${sourceId}-keep-b`;
  plan.coverage = [
    {id: retainedA, sourceId, sourceRange: {startSample: 0, endSample: 20, sampleRateHz: clock}, disposition: 'retain', decisionId: `${retainedA}-decision`, tokenIds: tokenIdsIn(0, 20)},
    {id: removed, sourceId, sourceRange: {startSample: 20, endSample: 80, sampleRateHz: clock}, disposition: 'delete', decisionId: `${removed}-decision`, tokenIds: []},
    {id: retainedB, sourceId, sourceRange: {startSample: 80, endSample: 100, sampleRateHz: clock}, disposition: 'retain', decisionId: `${retainedB}-decision`, tokenIds: tokenIdsIn(80, 100)},
  ];
  plan.decisions = [
    {id: `${retainedA}-decision`, action: 'retain', reason: 'Keep first source interval.', coverageIds: [retainedA], sourceRanges: [{sourceId, sourceRange: plan.coverage[0].sourceRange}], keptOccurrenceIds: [`${retainedA}-occ-0001`], tokenIds: plan.coverage[0].tokenIds},
    {id: `${removed}-decision`, action: 'delete', reason: 'Test deletion closure.', coverageIds: [removed], sourceRanges: [{sourceId, sourceRange: plan.coverage[1].sourceRange}], keptOccurrenceIds: [], tokenIds: []},
    {id: `${retainedB}-decision`, action: 'retain', reason: 'Keep final source interval.', coverageIds: [retainedB], sourceRanges: [{sourceId, sourceRange: plan.coverage[2].sourceRange}], keptOccurrenceIds: [`${retainedB}-occ-0001`], tokenIds: plan.coverage[2].tokenIds},
  ];
  plan.sequence = [{occurrenceId: `${retainedA}-occ-0001`, coverageId: retainedA}, {occurrenceId: `${retainedB}-occ-0001`, coverageId: retainedB}];
  plan.questions = [];
  return rehash(plan);
}

function wav16(samples, sampleRateHz) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRateHz, 24); buffer.writeUInt32LE(sampleRateHz * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  return buffer;
}

function readWav16(buffer) {
  let offset = 12;
  while (offset + 8 < buffer.length) {
    const size = buffer.readUInt32LE(offset + 4);
    if (buffer.toString('ascii', offset, offset + 4) === 'data') {
      const values = [];
      for (let position = offset + 8; position < offset + 8 + size; position += 2) values.push(buffer.readInt16LE(position));
      return values;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV data chunk missing');
}

function assertAudioReceiptUnitsMatchSchema(receipt, schema) {
  const branches = schema.$defs.audioReceiptUnit.oneOf;
  assert.equal(branches.length, 2);
  assert.equal(branches.every((branch) => branch.additionalProperties === false), true);
  assert.equal(branches.some((branch) => Object.hasOwn(branch.properties, 'words') || Object.hasOwn(branch.properties, 'transcriptSegments')), false);
  for (const unit of receipt.units) {
    const branch = branches.find((candidate) => candidate.properties.kind.const === unit.kind);
    assert.ok(branch, `receipt unit kind ${unit.kind} has a schema branch`);
    const propertyKeys = Object.keys(branch.properties).sort();
    assert.deepEqual([...branch.required].sort(), propertyKeys, `${unit.kind} receipt schema is minimal and fully required`);
    assert.deepEqual(Object.keys(unit).sort(), propertyKeys, `${unit.kind} receipt row matches schema without copied ASR`);
    assert.equal(unit.kind, branch.properties.kind.const);
    for (const rangeName of ['targetRange', ...(unit.kind === 'source' ? ['sourceRange'] : [])]) {
      assert.deepEqual(Object.keys(unit[rangeName]).sort(), ['endSample', 'sampleRateHz', 'startSample']);
      assert.ok(Number.isInteger(unit[rangeName].startSample));
      assert.ok(Number.isInteger(unit[rangeName].endSample));
      assert.ok(Number.isInteger(unit[rangeName].sampleRateHz));
    }
    if (unit.kind === 'presentation') {
      assert.deepEqual(Object.keys(unit.visualHandoff).sort(), ['entryState', 'exitCondition', 'focus']);
      assert.deepEqual(Object.keys(unit.audioHandoff).sort(), ['rationale', 'role']);
      assert.ok(['continue-bed', 'bed-duck', 'sound-effect', 'quiet', 'none'].includes(unit.audioHandoff.role));
    }
  }
}

function timelineWithOneCoverage(plan) { return compilePlan(plan); }

// SRT import preserves source timestamp text and locatable evidence identity; it never creates word times.
const srt = '1\n00:00:00,000 --> 00:00:00,020\n开头\n\n2\n00:00:00,080 --> 00:00:00,100\n结尾\n';
const basic = importSrt(srt, {projectId: 'test-project', sourceId: 'srt-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
assert.equal(basic.sources[0].transcript.evidenceRef, null);
assert.equal(basic.sources[0].transcript.segments[0].evidenceClock.start.value, '00:00:00,000');
assert.equal(basic.sources[0].transcript.segments[0].tokens.length, 0);
assert.equal(validatePlan(basic).errors.length, 0);
assert.equal(compilePlan(basic).durationSamples, 100);
assert.deepEqual([compilePlan(basic).clips[0].sourceRange.startSample, compilePlan(basic).clips[0].sourceRange.endSample], [0, 100]);

// Deletion must have a corresponding decision; retained silence remains on the target clock.
const cutPlan = makeSplitDeletePlan(basic);
assert.equal(validatePlan(cutPlan).errors.length, 0);
const cutTimeline = compilePlan(cutPlan);
assert.equal(cutTimeline.coverageComplete, true);
assert.equal(cutTimeline.durationSamples, 40);
assert.equal(cutTimeline.clips.length, 2);
assert.equal(cutTimeline.deletions.length, 1);
assert.deepEqual(cutTimeline.clips.map((clip) => [clip.targetRange.startSample, clip.targetRange.endSample]), [[0, 20], [20, 40]]);
const orphanDelete = structuredClone(cutPlan);
orphanDelete.coverage[1].decisionId = 'missing-decision';
rehash(orphanDelete);
assert.ok(validatePlan(orphanDelete).errors.some((error) => error.includes('deleted coverage')));
const gapCoverage = structuredClone(cutPlan);
gapCoverage.coverage[1].sourceRange.startSample = 21;
rehash(gapCoverage);
assert.ok(validatePlan(gapCoverage).errors.some((error) => error.includes('unclassified gap')));
const secondCoverageSource = importSrt('1\n00:00:00,000 --> 00:00:00,100\n第二源\n', {projectId: 'test-project', sourceId: 'second-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
const sourceCoveragePlan = mergePlans([basic, secondCoverageSource], {projectId: 'test-project', sourceOrder: ['srt-source', 'second-source']});
const omittedSource = structuredClone(sourceCoveragePlan);
omittedSource.coverage = omittedSource.coverage.filter((coverage) => coverage.sourceId !== 'second-source');
const keptCoverageIds = new Set(omittedSource.coverage.map((coverage) => coverage.id));
omittedSource.sequence = omittedSource.sequence.filter((entry) => keptCoverageIds.has(entry.coverageId));
omittedSource.decisions = omittedSource.decisions.filter((decision) => decision.coverageIds.every((coverageId) => keptCoverageIds.has(coverageId)));
rehash(omittedSource);
assert.ok(validatePlan(omittedSource).errors.some((error) => error.includes('second-source has no coverage classification')));
assert.equal(validatePlan(omittedSource).coverageComplete, false);
const orderedWords = importAsrJson({segments: [{startMs: 0, endMs: 100, text: '先后顺序', words: [
  {startMs: 10, endMs: 20, text: '先'}, {startMs: 30, endMs: 40, text: '后'},
]}]}, {projectId: 'word-order-test', sourceId: 'ordered-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
orderedWords.coverage[0].tokenIds.reverse();
rehash(orderedWords);
assert.ok(validatePlan(orderedWords).errors.some((error) => error.includes('tokenIds must remain in source transcript order')));

// Two different sources with overlapping timestamps must not be cross-validated against one another's words.
const timed = importAsrJson({segments: [{startMs: 0, endMs: 100, text: '整句', words: [{startMs: 20, endMs: 80, text: '中间词'}]}]}, {
  projectId: 'merge-test', sourceId: 'timed-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100,
});
const volcFlashPlan = importAsrJson({audio_info: {duration: 100}, result: {utterances: [{start_time: 25, end_time: 75, text: '火山时码', words: [{start_time: 30, end_time: 60, text: '逐词'}]}]}}, {
  projectId: 'volc-test', sourceId: 'volc-source', sampleRateHz: 1000, sourceSampleRateHz: 1000, sourceDurationSamples: 100,
});
assert.equal(volcFlashPlan.sources[0].transcript.timeBasis, 'volcengine-flash-utterance-ms');
assert.deepEqual([volcFlashPlan.sources[0].transcript.segments[0].sourceRange.startSample, volcFlashPlan.sources[0].transcript.segments[0].sourceRange.endSample], [25, 75]);
assert.deepEqual(volcFlashPlan.sources[0].transcript.segments[0].tokens[0].evidenceClock.start, {value: 30, unit: 'ms', field: 'start_time', clock: 'source-local'});

// Cap import keeps the declared source-local clock for cuts and preserves global time as separate evidence.
const capFixture = importAsrJson({
  schema: 'laohu.cap-asr-transcript/1',
  timeBasis: 'raw-recording-display-timeline',
  utterances: [{
    recordingSegment: 0, sourceStartMs: 10, sourceEndMs: 50, sourceTimelineStartMs: 10, sourceTimelineEndMs: 50,
    globalStartMs: 210, globalEndMs: 250, text: '本地时钟',
    words: [{text: '本地', sourceStartMs: 20, sourceEndMs: 30, globalStartMs: 220, globalEndMs: 230}],
  }],
}, {projectId: 'cap-clock-test', sourceId: 'cap-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 1000});
const capSegment = capFixture.sources[0].transcript.segments[0];
assert.equal(capFixture.sources[0].transcript.timeBasis, 'raw-recording-display-timeline');
assert.deepEqual([capSegment.sourceRange.startSample, capSegment.sourceRange.endSample], [10, 50]);
assert.deepEqual([capSegment.globalRangeMs.startMs, capSegment.globalRangeMs.endMs], [210, 250]);
assert.deepEqual([capSegment.tokens[0].sourceRange.startSample, capSegment.tokens[0].sourceRange.endSample], [20, 30]);
assert.deepEqual([capSegment.evidenceClock.globalStart.value, capSegment.evidenceClock.globalEnd.value], [210, 250]);
assert.deepEqual([capSegment.tokens[0].globalRangeMs.startMs, capSegment.tokens[0].globalRangeMs.endMs], [220, 230]);
assert.deepEqual([capSegment.tokens[0].evidenceClock.globalStart.value, capSegment.tokens[0].evidenceClock.globalEnd.value], [220, 230]);
assert.equal(capSegment.recordingSegment, 0);
assert.equal(validatePlan(capFixture).errors.length, 0);

// ASR remains untouched; only a listening-confirmed correction is exposed as spokenText.
const correctionMediaPath = join(root, 'correction-source.wav');
const correctionMediaBytes = wav16(Array.from({length: 100}, (_, index) => index), rate);
await writeFile(correctionMediaPath, correctionMediaBytes);
const correctionMediaHash = createHash('sha256').update(correctionMediaBytes).digest('hex');
const correctionPlan = importAsrJson({segments: [{startMs: 0, endMs: 100, text: '这是一段原始识别', words: [{startMs: 20, endMs: 80, text: '原始识别'}]}]}, {
  projectId: 'correction-test', sourceId: 'correction-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100, mediaPath: correctionMediaPath, mediaSha256: correctionMediaHash,
});
const correctionSegment = correctionPlan.sources[0].transcript.segments[0];
const correctionToken = correctionSegment.tokens[0];
correctionPlan.spokenCorrections = [{
  id: 'correction-candidate', sourceId: 'correction-source', segmentId: correctionSegment.id, tokenId: correctionToken.id,
  rawText: correctionToken.rawText, spokenText: '口语核听后的文本', status: 'candidate',
  verification: {method: 'not-reviewed', listeningStatus: 'not-reviewed', alignmentStatus: 'not-provided', sourceRange: null},
}];
rehash(correctionPlan);
assert.equal(validatePlan(correctionPlan).errors.length, 0);
const candidateCorrectionTimeline = compilePlan(correctionPlan);
assert.equal(candidateCorrectionTimeline.clips[0].words[0].text, '原始识别');
assert.equal(Object.hasOwn(candidateCorrectionTimeline.clips[0].words[0], 'spokenText'), false);
assert.equal(candidateCorrectionTimeline.spokenCorrections[0].status, 'candidate');
const confirmedCorrection = structuredClone(correctionPlan);
confirmedCorrection.spokenCorrections[0].status = 'confirmed';
confirmedCorrection.spokenCorrections[0].verification = {method: 'audio-listening', listeningStatus: 'listened', alignmentStatus: 'not-provided', sourceRange: correctionToken.sourceRange};
rehash(confirmedCorrection);
assert.equal(validatePlan(confirmedCorrection).errors.length, 0);
const confirmedCorrectionTimeline = compilePlan(confirmedCorrection);
assert.equal(confirmedCorrectionTimeline.clips[0].words[0].text, '原始识别');
assert.equal(confirmedCorrectionTimeline.clips[0].words[0].spokenText, '口语核听后的文本');
const confirmedWithoutAudio = structuredClone(confirmedCorrection);
confirmedWithoutAudio.sources[0].mediaPath = null;
confirmedWithoutAudio.sources[0].sha256 = null;
rehash(confirmedWithoutAudio);
assert.ok(validatePlan(confirmedWithoutAudio).errors.some((error) => error.includes('requires a linked, hashed audio source')));
const sentenceCorrection = importSrt('1\n00:00:00,000 --> 00:00:00,100\n一句字幕\n', {projectId: 'sentence-correction', sourceId: 'sentence-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100, mediaPath: correctionMediaPath, mediaSha256: correctionMediaHash});
const sentenceCorrectionSegment = sentenceCorrection.sources[0].transcript.segments[0];
sentenceCorrection.spokenCorrections = [{
  id: 'sentence-correction-confirmed', sourceId: 'sentence-source', segmentId: sentenceCorrectionSegment.id, tokenId: null,
  rawText: sentenceCorrectionSegment.rawText, spokenText: '核听后确认的整句', status: 'confirmed',
  verification: {method: 'audio-listening', listeningStatus: 'listened', alignmentStatus: 'not-provided', sourceRange: sentenceCorrectionSegment.sourceRange},
}];
rehash(sentenceCorrection);
assert.equal(validatePlan(sentenceCorrection).errors.length, 0);
assert.equal(compilePlan(sentenceCorrection).clips[0].transcriptSegments[0].text, sentenceCorrectionSegment.rawText);
assert.equal(compilePlan(sentenceCorrection).clips[0].transcriptSegments[0].spokenText, '核听后确认的整句');
const ungroundedCorrection = structuredClone(confirmedCorrection);
ungroundedCorrection.spokenCorrections[0].verification.sourceRange.endSample -= 1;
rehash(ungroundedCorrection);
assert.ok(validatePlan(ungroundedCorrection).errors.some((error) => error.includes('exactly matching its transcript target')));
const overwrittenRaw = structuredClone(correctionPlan);
overwrittenRaw.spokenCorrections[0].rawText = '不匹配的原始识别';
rehash(overwrittenRaw);
assert.ok(validatePlan(overwrittenRaw).errors.some((error) => error.includes('must match the untouched ASR source text')));
const sentenceSource = importSrt('1\n00:00:00,000 --> 00:00:00,050\n前半\n\n2\n00:00:00,050 --> 00:00:00,100\n后半\n', {
  projectId: 'merge-test', sourceId: 'sentence-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100,
});
sentenceSource.coverage = [
  {...sentenceSource.coverage[0], id: 'sentence-source-left', sourceRange: {startSample: 0, endSample: 50, sampleRateHz: rate}, decisionId: 'sentence-source-left-decision'},
  {...sentenceSource.coverage[0], id: 'sentence-source-right', sourceRange: {startSample: 50, endSample: 100, sampleRateHz: rate}, decisionId: 'sentence-source-right-decision'},
];
sentenceSource.decisions = sentenceSource.coverage.map((coverage) => ({id: coverage.decisionId, action: 'retain', reason: 'Original order.', coverageIds: [coverage.id], sourceRanges: [{sourceId: 'sentence-source', sourceRange: coverage.sourceRange}], keptOccurrenceIds: [`${coverage.id}-occ-0001`], tokenIds: []}));
sentenceSource.sequence = sentenceSource.coverage.map((coverage) => ({coverageId: coverage.id, occurrenceId: `${coverage.id}-occ-0001`}));
rehash(sentenceSource);
const merged = mergePlans([timed, sentenceSource], {projectId: 'merge-test', sourceOrder: ['timed-source', 'sentence-source']});
assert.equal(validatePlan(merged).errors.length, 0);
assert.equal(merged.sources[0].order, 0);
assert.equal(merged.sources[1].order, 1);

// Explicitly authorized reorder and repeated source occurrences are distinct identities.
const reorder = structuredClone(cutPlan);
reorder.authorization.reorder = true;
reorder.sequence.reverse();
reorder.decisions.push({id: 'reorder-decision', action: 'reorder', reason: 'Test authorized reorder.', coverageIds: [reorder.coverage[0].id, reorder.coverage[2].id], sourceRanges: reorder.coverage.filter((entry) => entry.disposition === 'retain').map((entry) => ({sourceId: entry.sourceId, sourceRange: entry.sourceRange})), keptOccurrenceIds: [], tokenIds: []});
rehash(reorder);
assert.equal(validatePlan(reorder).errors.length, 0);
assert.deepEqual(compilePlan(reorder).clips.map((clip) => clip.sourceRange.startSample), [80, 0]);
const repeated = importSrt('1\n00:00:00,000 --> 00:00:00,100\n重播\n', {projectId: 'repeat-test', sourceId: 'repeat-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100, authorization: {repeat: true}});
const repeatCoverage = repeated.coverage[0];
repeated.sequence.push({coverageId: repeatCoverage.id, occurrenceId: `${repeatCoverage.id}-occ-0002`});
repeated.authorization.repeat = true;
repeated.decisions.push({id: 'repeat-decision', action: 'repeat', reason: 'Authorized emphasis.', coverageIds: [repeatCoverage.id], sourceRanges: [{sourceId: repeatCoverage.sourceId, sourceRange: repeatCoverage.sourceRange}], keptOccurrenceIds: repeated.sequence.map((entry) => entry.occurrenceId), tokenIds: []});
rehash(repeated);
assert.equal(validatePlan(repeated).errors.length, 0);
assert.notEqual(compilePlan(repeated).clips[0].occurrenceId, compilePlan(repeated).clips[1].occurrenceId);
assert.equal(compilePlan(repeated).durationSamples, 200);
const unlocatedEvidence = await verifyPlanEvidence(repeated);
assert.deepEqual(unlocatedEvidence, {verified: [], unlocated: [{sourceId: 'repeat-source', sha256: repeated.sources[0].transcript.sha256, reason: 'no-evidence-ref'}]});

// Missing clock, partial word/utterance boundaries, stale hash, and unsupported transforms are explicit failures.
assert.throws(() => importAsrJson({segments: [{start: 0, end: 1, text: 'no unit'}]}, {projectId: 'clock-test', sourceId: 'clock-source'}), /explicit timeUnit/);
const noClock = structuredClone(cutPlan);
noClock.clock.sampleRateHz = null;
rehash(noClock);
assert.ok(validatePlan(noClock).errors.some((error) => error.includes('project sampleRateHz')));
const partialSentence = importSrt('1\n00:00:00,000 --> 00:00:00,100\n整句\n', {projectId: 'partial-test', sourceId: 'partial-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
partialSentence.coverage = [
  {...partialSentence.coverage[0], id: 'partial-a', sourceRange: {startSample: 0, endSample: 50, sampleRateHz: rate}},
  {...partialSentence.coverage[0], id: 'partial-b', sourceRange: {startSample: 50, endSample: 100, sampleRateHz: rate}},
];
partialSentence.decisions = partialSentence.coverage.map((coverage) => ({id: coverage.id, action: 'retain', reason: 'Should fail sentence boundary.', coverageIds: [coverage.id], sourceRanges: [{sourceId: coverage.sourceId, sourceRange: coverage.sourceRange}], keptOccurrenceIds: [`${coverage.id}-occ`], tokenIds: []}));
partialSentence.coverage.forEach((coverage) => { coverage.decisionId = coverage.id; });
partialSentence.sequence = partialSentence.coverage.map((coverage) => ({coverageId: coverage.id, occurrenceId: `${coverage.id}-occ`}));
rehash(partialSentence);
assert.ok(validatePlan(partialSentence).errors.some((error) => error.includes('inside utterance')));
const stale = structuredClone(cutPlan);
stale.decisions[0].reason = 'Changed after compilation.';
assert.ok(validatePlan(stale).errors.some((error) => error.includes('hash is stale')));
const unsupported = structuredClone(cutPlan);
unsupported.decisions[0].action = 'speed';
rehash(unsupported);
assert.ok(validatePlan(unsupported).errors.some((error) => error.includes('unsupported action')));
const unknownOperation = structuredClone(cutPlan);
unknownOperation.operations = [{type: 'crossfade'}];
rehash(unknownOperation);
assert.ok(validatePlan(unknownOperation).errors.some((error) => error.includes('unsupported operation declaration')));

// A review-state-only change does not stale the editing hash; an approval tied to another hash is rejected.
const reviewed = authorizeReview(cutPlan, 'pending', cutPlan.integrity.planSha256);
assert.equal(reviewed.integrity.planSha256, cutPlan.integrity.planSha256);
assert.equal(validatePlan(reviewed).errors.length, 0);
const staleApproval = authorizeReview(cutPlan, 'approved', cutPlan.integrity.planSha256);
staleApproval.decisions[0].reason = 'Changed after approval.';
rehash(staleApproval);
assert.ok(validatePlan(staleApproval).errors.some((error) => error.includes('approval feedback is stale')));

// Real FFmpeg export from a deterministic 100-sample WAV: output values and exact sample count prove trim/concat mapping only.
const inputPath = join(root, 'source.wav');
const sourceSamples = Array.from({length: 100}, (_, index) => index - 50);
const inputBytes = wav16(sourceSamples, rate);
await writeFile(inputPath, inputBytes);
const mediaHash = createHash('sha256').update(inputBytes).digest('hex');
const transcriptPath = join(root, 'fixture-asr.json');
const transcriptText = `${JSON.stringify({segments: [
  {startMs: 0, endMs: 10, text: '首段', words: [{startMs: 0, endMs: 10, text: '首段'}]},
  {startMs: 90, endMs: 100, text: '末段', words: [{startMs: 90, endMs: 100, text: '末段'}]},
]} )}\n`;
const transcriptBytes = Buffer.from(transcriptText, 'utf8');
await writeFile(transcriptPath, transcriptBytes);
const transcriptHash = createHash('sha256').update(transcriptBytes).digest('hex');
const exportPlan = importAsrJson(transcriptText, {
  projectId: 'export-test', sourceId: 'audio-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100,
  mediaPath: inputPath, mediaSha256: mediaHash, evidenceRef: transcriptPath, transcriptSha256: transcriptHash, timeUnit: 'ms', authorization: {mediaExport: true},
});
assert.equal(exportPlan.sources[0].transcript.evidenceHashMode, 'raw-bytes');
const verifiedEvidence = await verifyPlanEvidence(exportPlan);
assert.deepEqual(verifiedEvidence.verified.map((entry) => [entry.sourceId, entry.sha256]), [['audio-source', transcriptHash]]);
assert.deepEqual(verifiedEvidence.unlocated, []);
const trimmedPlan = makeSplitDeletePlan(exportPlan);
const frozenExportPlan = freezePlan(trimmedPlan);
const exportTimeline = compilePlan(frozenExportPlan);
const exportPath = join(root, 'artifacts', 'joined.wav');
const exportResult = await exportAudio({plan: frozenExportPlan, timeline: exportTimeline, outPath: exportPath, tmpDir: join(root, 'tmp')});
assert.equal(exportResult.receiptData.sampleCount, 40);
assert.equal(exportResult.receiptData.sampleRateHz, rate);
assert.equal(exportResult.receiptData.auditionStatus, 'not_auditioned');
assert.deepEqual(readWav16(await readFile(exportPath)), [...sourceSamples.slice(0, 20), ...sourceSamples.slice(80, 100)]);
assert.equal(createHash('sha256').update(await readFile(inputPath)).digest('hex'), mediaHash);

// A source-free presentation is a real compiled unit. The source pause is retained once,
// then the exact 800 project samples are inserted once between A and B.
const pacingInputPath = join(root, 'pacing-source.wav');
const pacingSourceSamples = [...Array(800).fill(100), ...Array(200).fill(0), ...Array(1000).fill(-200)];
const pacingBytes = wav16(pacingSourceSamples, rate);
await writeFile(pacingInputPath, pacingBytes);
const pacingMediaHash = createHash('sha256').update(pacingBytes).digest('hex');
const pacingPlan = importAsrJson({segments: [
  {startMs: 0, endMs: 800, text: 'A', words: [{startMs: 100, endMs: 200, text: 'A'}]},
  {startMs: 1000, endMs: 2000, text: 'B', words: [{startMs: 1100, endMs: 1200, text: 'B'}]},
]}, {projectId: 'presentation-test', sourceId: 'pacing-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 2000, mediaPath: pacingInputPath, mediaSha256: pacingMediaHash, authorization: {mediaExport: true}});
const pacingSourceId = pacingPlan.sources[0].id;
const pacingTokenIdsIn = (startSample, endSample) => pacingPlan.sources[0].transcript.segments.flatMap((segment) => segment.tokens
  .filter((token) => token.sourceRange && token.sourceRange.startSample >= startSample && token.sourceRange.endSample <= endSample).map((token) => token.id));
pacingPlan.coverage = [
  {id: 'pacing-a', sourceId: pacingSourceId, sourceRange: {startSample: 0, endSample: 1000, sampleRateHz: rate}, disposition: 'retain', decisionId: 'pacing-a-decision', tokenIds: pacingTokenIdsIn(0, 1000)},
  {id: 'pacing-b', sourceId: pacingSourceId, sourceRange: {startSample: 1000, endSample: 2000, sampleRateHz: rate}, disposition: 'retain', decisionId: 'pacing-b-decision', tokenIds: pacingTokenIdsIn(1000, 2000)},
];
pacingPlan.decisions = pacingPlan.coverage.map((coverage) => ({id: coverage.decisionId, action: 'retain', reason: `Retain source interval ${coverage.id}.`, coverageIds: [coverage.id], sourceRanges: [{sourceId: pacingSourceId, sourceRange: coverage.sourceRange}], keptOccurrenceIds: [`${coverage.id}-occ-0001`], tokenIds: coverage.tokenIds}));
pacingPlan.sequence = pacingPlan.coverage.map((coverage) => ({occurrenceId: `${coverage.id}-occ-0001`, coverageId: coverage.id}));
rehash(pacingPlan);
assert.equal(validatePlan(pacingPlan).errors.length, 0);
assert.throws(() => insertPresentationInterval(pacingPlan, {}, {authorized: false}), (error) => error.code === 'presentation-not-authorized');
const stalePresentationSpec = {
  id: 'between-a-b', decisionId: 'between-a-b-decision', reason: 'Give the diagram time to resolve before B.', afterOccurrenceId: pacingPlan.sequence[0].occurrenceId,
  sceneId: 'diagram-resolution', durationSamples: 800,
  visualHandoff: {focus: 'two linked nodes', entryState: 'nodes are visible but disconnected', exitCondition: 'connection completes and points to B'},
  audioHandoff: {role: 'continue-bed', rationale: 'Keep the bed under the source-free explanation interval.'},
  expectedRevision: pacingPlan.project.revision, expectedPlanSha256: hashPlan(pacingPlan),
};
assert.throws(() => insertPresentationInterval(pacingPlan, {...stalePresentationSpec, expectedRevision: 0}, {authorized: true}), (error) => error.code === 'presentation-stale-reference');
const insertedPresentation = insertPresentationInterval(pacingPlan, stalePresentationSpec, {authorized: true});
assert.equal(insertedPresentation.format, 'laohu.asrcut.edit-plan/2');
assert.equal(insertedPresentation.project.revision, pacingPlan.project.revision + 1);
assert.equal(validatePlan(insertedPresentation).errors.length, 0);
assert.deepEqual(insertedPresentation.sequence.map((unit) => unit.kind), ['source', 'presentation', 'source']);
assert.equal(Object.hasOwn(insertedPresentation.sequence[1], 'afterOccurrenceId'), false);

// The CLI supports explicit, atomic in-place plan iteration while preserving the input's evidence base.
const cliPlanPath = join(root, 'edit-plan.json');
const cliSpecPath = join(root, 'presentation.json');
await writeFile(cliPlanPath, `${JSON.stringify(pacingPlan, null, 2)}\n`);
await writeFile(cliSpecPath, `${JSON.stringify(stalePresentationSpec, null, 2)}\n`);
const cli = resolve('.agents/skills/laohu-asrcut/scripts/asrcut.mjs');
const inPlaceArgs = ['insert-presentation', '--plan', cliPlanPath, '--spec', cliSpecPath, '--out', cliPlanPath, '--authorize-presentation-timing'];
const protectedInPlace = await execFileAsync(process.execPath, [cli, ...inPlaceArgs], {cwd: process.cwd()}).then(() => null, (error) => error.stderr.toString());
assert.match(protectedInPlace, /presentation-in-place-explicit/);
await execFileAsync(process.execPath, [cli, ...inPlaceArgs, '--update-plan'], {cwd: process.cwd()});
const cliUpdatedPlan = JSON.parse(await readFile(cliPlanPath, 'utf8'));
assert.equal(validatePlan(cliUpdatedPlan).errors.length, 0);
assert.deepEqual(cliUpdatedPlan.sequence.map((unit) => unit.kind), ['source', 'presentation', 'source']);
assert.equal(cliUpdatedPlan.project.revision, pacingPlan.project.revision + 1);
const symlinkPlanPath = join(root, 'edit-plan-symlink.json');
await symlink(cliPlanPath, symlinkPlanPath);
const planBytesBeforeAliasAttempts = await readFile(cliPlanPath);
const aliasArgs = (planPath) => ['insert-presentation', '--plan', planPath, '--spec', cliSpecPath, '--out', planPath, '--authorize-presentation-timing', '--update-plan'];
const symlinkUpdateError = await execFileAsync(process.execPath, [cli, ...aliasArgs(symlinkPlanPath)], {cwd: process.cwd()}).then(() => '', (error) => error.stderr.toString());
assert.match(symlinkUpdateError, /no symlink or hard-link aliases/);
const hardlinkPlanPath = join(root, 'edit-plan-hardlink.json');
await link(cliPlanPath, hardlinkPlanPath);
const hardlinkUpdateError = await execFileAsync(process.execPath, [cli, ...aliasArgs(hardlinkPlanPath)], {cwd: process.cwd()}).then(() => '', (error) => error.stderr.toString());
assert.match(hardlinkUpdateError, /no symlink or hard-link aliases/);
assert.deepEqual(await readFile(cliPlanPath), planBytesBeforeAliasAttempts, 'alias rejection leaves the original plan untouched');
const presentationTimeline = compilePlan(insertedPresentation);
assert.equal(presentationTimeline.format, 'laohu.asrcut.timeline/2');
assert.equal(presentationTimeline.durationSamples, 2800);
assert.deepEqual(presentationTimeline.units.map((unit) => [unit.kind, unit.targetRange.startSample, unit.targetRange.endSample]), [['source', 0, 1000], ['presentation', 1000, 1800], ['source', 1800, 2800]]);
assert.deepEqual(presentationTimeline.clips.map((clip) => [clip.sourceRange.startSample, clip.sourceRange.endSample, clip.targetRange.startSample, clip.targetRange.endSample]), [[0, 1000, 0, 1000], [1000, 2000, 1800, 2800]]);
assert.deepEqual(presentationTimeline.clips[1].words[0].sourceRange, {startSample: 1100, endSample: 1200, sampleRateHz: rate});
assert.deepEqual(presentationTimeline.clips[1].words[0].targetRange, {startSample: 1900, endSample: 2000, sampleRateHz: rate});
assert.equal(presentationTimeline.units[1].sourceRange, undefined);
const malformedPresentation = structuredClone(insertedPresentation);
malformedPresentation.sequence[1].audioHandoff.role = 'silent-because-mic-zero';
rehash(malformedPresentation);
assert.ok(validatePlan(malformedPresentation).errors.some((error) => error.includes('audio handoff')));
const unauthoredDecision = structuredClone(insertedPresentation);
unauthoredDecision.decisions.at(-1).reason = 'Different purpose than the display unit.';
rehash(unauthoredDecision);
assert.ok(validatePlan(unauthoredDecision).errors.some((error) => error.includes('exact id and reason')));
const mergedPresentationSingle = mergePlans([insertedPresentation], {projectId: 'presentation-test', sourceOrder: [pacingSourceId]});
assert.deepEqual(mergedPresentationSingle.sequence, insertedPresentation.sequence);
const secondPresentationSpec = {
  id: 'between-a-b-followup', decisionId: 'between-a-b-followup-decision', reason: 'Let the second visual relation settle before the next spoken explanation.', afterOccurrenceId: pacingPlan.sequence[0].occurrenceId,
  sceneId: 'diagram-followup', durationSamples: 400,
  visualHandoff: {focus: 'result node', entryState: 'the first connection is visible', exitCondition: 'the result node is visually stable for the next phrase'},
  audioHandoff: {role: 'continue-bed', rationale: 'Continue the existing bed while the second diagram relation resolves.'},
};
const twoPresentationPlan = insertPresentationInterval(insertedPresentation, {
  ...secondPresentationSpec,
  expectedRevision: insertedPresentation.project.revision,
  expectedPlanSha256: hashPlan(insertedPresentation),
}, {authorized: true});
assert.deepEqual(twoPresentationPlan.sequence.map((unit) => unit.kind), ['source', 'presentation', 'presentation', 'source']);
const mergedTwoPresentationSingle = mergePlans([twoPresentationPlan], {projectId: 'presentation-test', sourceOrder: [pacingSourceId]});
assert.deepEqual(mergedTwoPresentationSingle.sequence, twoPresentationPlan.sequence);
assert.deepEqual(compilePlan(mergedTwoPresentationSingle).units.map((unit) => unit.kind), ['source', 'presentation', 'presentation', 'source']);
const otherPresentationSource = importSrt('1\n00:00:00,000 --> 00:00:00,100\n另一源\n', {projectId: 'presentation-test', sourceId: 'other-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
assert.throws(() => mergePlans([insertedPresentation, otherPresentationSource], {projectId: 'presentation-test', sourceOrder: [pacingSourceId, 'other-source']}), (error) => error.code === 'merge-presentation-units');

const frozenPresentation = freezePlan(insertedPresentation);
const frozenPresentationTimeline = compilePlan(frozenPresentation);
const presentationOutputPath = join(root, 'artifacts', 'pacing-with-presentation.wav');
const presentationExport = await exportAudio({plan: frozenPresentation, timeline: frozenPresentationTimeline, outPath: presentationOutputPath, tmpDir: join(root, 'tmp')});
const renderedPacingSamples = readWav16(await readFile(presentationOutputPath));
const receiptSchema = JSON.parse(await readFile(resolve('.agents/skills/laohu-asrcut/schemas/asrcut.schema.json'), 'utf8'));
assertAudioReceiptUnitsMatchSchema(presentationExport.receiptData, receiptSchema);
assert.equal(presentationExport.receiptData.format, 'laohu.asrcut.audio-artifact/2');
assert.equal(presentationExport.receiptData.sampleCount, 2800);
assert.deepEqual(presentationExport.receiptData.voiceWindows.map(({startSample, endSample}) => [startSample, endSample]), [[0, 1000], [1800, 2800]]);
assert.match(presentationExport.receiptData.voiceTrackPlayback, /single exported WAV once/);
assert.deepEqual(renderedPacingSamples, [...pacingSourceSamples.slice(0, 1000), ...Array(800).fill(0), ...pacingSourceSamples.slice(1000)]);
assert.equal(createHash('sha256').update(await readFile(pacingInputPath)).digest('hex'), pacingMediaHash);

const staleTimeline = structuredClone(exportTimeline);
staleTimeline.clips[0].targetRange.endSample += 1;
await assert.rejects(() => exportAudio({plan: frozenExportPlan, timeline: staleTimeline, outPath: join(root, 'artifacts', 'stale.wav'), tmpDir: join(root, 'tmp')}), /does not match|differs from/);
const unauthorizedPlan = structuredClone(frozenExportPlan);
unauthorizedPlan.authorization.mediaExport = false;
rehash(unauthorizedPlan);
await assert.rejects(() => exportAudio({plan: unauthorizedPlan, timeline: exportTimeline, outPath: join(root, 'artifacts', 'unauthorized.wav'), tmpDir: join(root, 'tmp')}), /mediaExport authorization/);

// A changed ASR evidence file invalidates both reusable provenance checks and a new media export.
await writeFile(transcriptPath, Buffer.from(`${transcriptText} `, 'utf8'));
await assert.rejects(() => verifyPlanEvidence(frozenExportPlan), (error) => error.code === 'transcript-evidence-stale');
const staleEvidenceOutput = join(root, 'artifacts', 'stale-evidence.wav');
await assert.rejects(() => exportAudio({plan: frozenExportPlan, timeline: exportTimeline, outPath: staleEvidenceOutput, tmpDir: join(root, 'tmp')}), (error) => error.code === 'transcript-evidence-stale');
await assert.rejects(() => stat(staleEvidenceOutput));

// Alias checks include symbolic and hard links; the raw input itself can never become an output.
const softAlias = join(root, 'source-alias.wav');
const hardAlias = join(root, 'source-hardlink.wav');
await symlink(inputPath, softAlias);
await link(inputPath, hardAlias);
await assert.rejects(() => assertSafeOutputPath(softAlias, [inputPath]), /aliases an input/);
await assert.rejects(() => assertSafeOutputPath(hardAlias, [inputPath]), /aliases an input/);
await assert.rejects(() => assertSafeOutputPath(transcriptPath, [transcriptPath]), /aliases an input/);
await assert.rejects(() => assertSafeOutputPath(join(root, 'artifacts', 'joined.wav'), [inputPath]), /Output already exists/);

// Mock provider verifies explicit request fields and raw response preservation without credentials in the return value.
const providerAudio = join(root, 'provider.wav');
await writeFile(providerAudio, wav16([0, 1], rate));
assert.equal(await probeAudioDuration(providerAudio, {ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe'}), 0.002);
await assert.rejects(() => probeAudioDuration(providerAudio, {ffprobePath: join(root, 'missing-ffprobe')}), /Could not verify local audio duration/);
const apiKeyConfig = await loadVolcConfig({env: {}, configPath: 'unused.env', readFileImpl: async () => 'VOLCENGINE_SPEECH_API_KEY=mock-file-key\nVOLCENGINE_SPEECH_UID=not-used\n'});
assert.equal(apiKeyConfig.authMode, 'api_key');
assert.equal(apiKeyConfig.uid, 'laohu-asr');
const legacyConfig = await loadVolcConfig({env: {}, configPath: 'unused.env', readFileImpl: async () => 'VOLCENGINE_SPEECH_APP_ID=app-id\nVOLCENGINE_SPEECH_ACCESS_TOKEN=access-token\n'});
assert.equal(legacyConfig.authMode, 'app_id_access_token');
assert.equal(legacyConfig.apiKey, '');
const exactResponse = '{"result":{"utterances":[]}}';
let captured;
const mockFetch = async (url, init) => {
  captured = {url, init};
  return new Response(exactResponse, {status: 200, headers: {'X-Api-Status-Code': '20000000', 'X-Api-Message': 'OK'}});
};
const provider = await transcribeVolcFlash({audioPath: providerAudio, config: {authMode: 'api_key', apiKey: 'secret-test-key', flashUrl: 'https://example.invalid/asr'}, requestId: 'fixture-request', probeDurationImpl: async () => 0.002, fetchImpl: mockFetch});
assert.equal(provider.rawJson, exactResponse);
assert.equal(captured.init.headers['X-Api-Key'], 'secret-test-key');
assert.equal(captured.init.headers['X-Api-Request-Id'], 'fixture-request');
assert.equal(JSON.parse(captured.init.body).request.enable_itn, false);
assert.equal(JSON.parse(captured.init.body).request.show_utterances, true);
assert.equal(JSON.parse(captured.init.body).user.uid, 'laohu-asr');
assert.equal(provider.sourceDurationSeconds, 0.002);
assert.ok(!JSON.stringify(provider).includes('secret-test-key'));
let oversizedUploadAttempted = false;
await assert.rejects(() => transcribeVolcFlash({
  audioPath: providerAudio,
  config: {authMode: 'api_key', apiKey: 'secret-test-key', flashUrl: 'https://example.invalid/asr'},
  probeDurationImpl: async () => 7200.001,
  fetchImpl: async () => { oversizedUploadAttempted = true; throw new Error('must not be called'); },
}), /exceeds the verified duration limit/);
assert.equal(oversizedUploadAttempted, false);
await assert.rejects(() => transcribeVolcFlash({
  audioPath: providerAudio,
  config: {authMode: 'api_key', apiKey: 'secret-test-key', flashUrl: 'https://example.invalid/asr'},
  probeDurationImpl: async () => Number.NaN,
  fetchImpl: async () => { oversizedUploadAttempted = true; throw new Error('must not be called'); },
}), /verified positive finite audio duration/);
assert.equal(oversizedUploadAttempted, false);

console.log(JSON.stringify({ok: true, assertions: assertionCount, virtualTimelineSamples: cutTimeline.durationSamples, exportSamples: exportResult.receiptData.sampleCount, exportHash: exportResult.receiptData.outputSha256, auditionStatus: exportResult.receiptData.auditionStatus, evidence: 'synthetic WAV/ASR/SRT only; no real ASR, listening, or quality claim'}));
await rm(root, {recursive: true, force: true});
