import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmod, link, mkdir, readFile, readdir, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {promisify} from 'node:util';
import {loadVolcConfig, probeAudioDuration, transcribeVolcFlash} from '../scripts/asr-provider.mjs';
import {createAudioPlan, inspectWavFile, processAudioPlan, validateAudioPlan} from '../scripts/audio-postprocess.mjs';
import {
  assertSafeOutputPath,
  captionManifestToSrt,
  compileCaptionManifest,
  authorizeReview,
  compilePlan,
  exportAudio,
  freezePlan,
  hashPlan,
  importAsrJson,
  importSrt,
  insertPresentationInterval,
  mergePlans,
  upsertAnnotation,
  validatePlan,
  verifyPlanEvidence,
  verifyCaptionManifest,
} from '../scripts/asrcut.mjs';

let assertionCount = 0;
for (const method of ['equal', 'deepEqual', 'ok', 'throws', 'rejects']) {
  const original = assert[method].bind(assert);
  assert[method] = (...args) => {
    assertionCount += 1;
    return original(...args);
  };
}

const root = resolve('.cache/tmp/asrcut-audio/core-tests');
const execFileAsync = promisify(execFile);
await rm(root, {recursive: true, force: true});
await mkdir(join(root, 'artifacts'), {recursive: true});
const rate = 1000;

function rehash(plan) {
  plan.integrity.planSha256 = hashPlan(plan);
  return plan;
}

function historicalPlanHash(plan) {
  const stable = (value) => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  const copy = structuredClone(plan);
  delete copy.review; delete copy.state; delete copy.annotations;
  if (copy.integrity) { delete copy.integrity.planSha256; delete copy.integrity.annotationSha256; }
  return createHash('sha256').update(JSON.stringify(stable(copy))).digest('hex');
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

function syntheticVoiceWav(durationSeconds = 5, sampleRateHz = 48000) {
  const count = Math.round(durationSeconds * sampleRateHz);
  let state = 0x51f15e5d;
  const samples = Array.from({length: count}, (_, index) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const noise = ((state / 0x100000000) * 2 - 1) * 0.005;
    const time = index / sampleRateHz;
    const active = (time >= 0.28 && time < 2.42) || (time >= 2.82 && time < durationSeconds - 0.25);
    if (!active) return Math.round(noise * 32767);
    const f0 = 132 + 7 * Math.sin(2 * Math.PI * 1.3 * time);
    const envelope = 0.28 + 0.72 * Math.abs(Math.sin(2 * Math.PI * 2.7 * time));
    const voice = envelope * (0.26 * Math.sin(2 * Math.PI * f0 * time)
      + 0.13 * Math.sin(2 * Math.PI * 2 * f0 * time + 0.2)
      + 0.08 * Math.sin(2 * Math.PI * 680 * time + 0.6)
      + 0.045 * Math.sin(2 * Math.PI * 1450 * time + 0.9));
    return Math.round(Math.max(-0.8, Math.min(0.8, voice + noise)) * 32767);
  });
  return wav16(samples, sampleRateHz);
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
const legacyBasic = structuredClone(basic);
delete legacyBasic.annotations;
delete legacyBasic.integrity.annotationSha256;
assert.equal(hashPlan(legacyBasic), basic.integrity.planSha256, 'plans created before annotations remain hash-compatible');
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

// Caption manifests bind semantic display decisions to actual retained occurrences.
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const captionUtterancePlan = importAsrJson({segments: [{startMs: 0, endMs: 20, text: '开头'}, {startMs: 80, endMs: 100, text: '结尾'}]},
  {projectId: 'caption-utterance', sourceId: 'caption-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
const utteranceTimeline = compilePlan(captionUtterancePlan);
const utteranceTimelineBytes = Buffer.from(`${JSON.stringify(utteranceTimeline, null, 2)}\n`);
const utteranceDesign = {
  format: 'laohu.asrcut.caption-design/1', projectId: captionUtterancePlan.project.id, revision: captionUtterancePlan.project.revision,
  planSha256: hashPlan(captionUtterancePlan), timelineSha256: sha(utteranceTimelineBytes), profile: 'zh-caption/1', coveragePolicy: 'all-retained-speech/1',
  cues: [
    {id: 'caption-opening', occurrenceId: captionUtterancePlan.sequence[0].occurrenceId, segmentId: captionUtterancePlan.sources[0].transcript.segments[0].id,
      lines: ['开头'], displayWindow: {range: {startSample: 0, endSample: 20, sampleRateHz: rate}},
      segmentationDecision: 'single semantic clause', reason: 'the retained utterance is one readable clause'},
    {id: 'caption-closing', occurrenceId: captionUtterancePlan.sequence[0].occurrenceId, segmentId: captionUtterancePlan.sources[0].transcript.segments[1].id,
      lines: ['结尾'], displayWindow: {range: {startSample: 80, endSample: 100, sampleRateHz: rate}},
      segmentationDecision: 'single semantic clause', reason: 'the retained utterance is one readable clause'},
  ],
};
const utteranceManifest = compileCaptionManifest({plan: captionUtterancePlan, timeline: utteranceTimeline, design: utteranceDesign,
  planSha256: hashPlan(captionUtterancePlan), timelineSha256: sha(utteranceTimelineBytes)});
assert.equal(utteranceManifest.cues[0].speechSpan.timingPrecision, 'utterance', 'segment-only ASR stays at utterance precision');
assert.equal(utteranceManifest.integrity.manifestSha256, 'ddefad9db675c474b70a1b3b7b92e450f55184e26f2e2d95ee4ef60c5829bc7f', '/1 manifest hash remains byte-compatible with the pre-/2 compiler');
assert.equal(sha(Buffer.from(`${JSON.stringify(utteranceManifest, null, 2)}\n`)), 'fce44fc99db1ab0bc935b267dd0089a095c31c4e91fd9e094a5db03a439403dd', '/1 serialized manifest bytes remain unchanged');
assert.equal(sha(captionManifestToSrt(utteranceManifest)), 'c9e97571a63f1ee72a8118d6a3c255cfea4db0a2d8d820635a9868de18528484', '/1 SRT bytes remain unchanged');
assert.throws(() => compileCaptionManifest({plan: captionUtterancePlan, timeline: utteranceTimeline, planSha256: hashPlan(captionUtterancePlan),
  timelineSha256: sha(utteranceTimelineBytes), design: {...utteranceDesign, cues: [{...utteranceDesign.cues[0], displayWindow: {...utteranceDesign.cues[0].displayWindow, timingPrecision: 'measured'}}, utteranceDesign.cues[1]]}}), /cannot claim greater precision/);
assert.equal(captionManifestToSrt(utteranceManifest).includes('开头'), true);
assert.equal(verifyCaptionManifest(utteranceManifest, {plan: captionUtterancePlan, timeline: utteranceTimeline,
  planSha256: hashPlan(captionUtterancePlan), timelineSha256: sha(utteranceTimelineBytes)}), true);

// caption-design/2 binds translated rows to the unchanged Chinese source cue and keeps one shared window.
const bilingualSourceText = '不是 3.14 米，而是 NVIDIA CUDA 12.4。';
const bilingualPlan = importAsrJson({segments: [{startMs: 0, endMs: 100, text: bilingualSourceText}]},
  {projectId: 'caption-bilingual-v2', sourceId: 'caption-bilingual-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
const bilingualTimeline = compilePlan(bilingualPlan);
const bilingualTimelineBytes = Buffer.from(`${JSON.stringify(bilingualTimeline, null, 2)}\n`);
const bilingualCue = {id: 'bilingual-proper-noun-negation', occurrenceId: bilingualPlan.sequence[0].occurrenceId,
  segmentId: bilingualPlan.sources[0].transcript.segments[0].id, lines: [bilingualSourceText],
  translations: [{language: 'en', lines: ["It is not 3.14 m; it is NVIDIA CUDA 12.4."], sourceCueId: 'bilingual-proper-noun-negation',
    sourceTextSha256: sha(JSON.stringify([bilingualSourceText])), provenance: {origin: 'human-authored', status: 'reviewed', revision: 1}}],
  displayWindow: {range: {startSample: 0, endSample: 100, sampleRateHz: rate}},
  segmentationDecision: 'one complete negated comparison', reason: 'keep the condition, quantity, unit, and product name together'};
const bilingualDesign = {format: 'laohu.asrcut.caption-design/2', projectId: bilingualPlan.project.id, revision: bilingualPlan.project.revision,
  planSha256: hashPlan(bilingualPlan), timelineSha256: sha(bilingualTimelineBytes), profile: 'verbatim/1', coveragePolicy: 'all-retained-speech/1',
  sourceLanguage: 'zh-Hans', displayLanguages: ['zh-Hans', 'en'], cues: [bilingualCue]};
const bilingualManifest = compileCaptionManifest({plan: bilingualPlan, timeline: bilingualTimeline, design: bilingualDesign,
  planSha256: hashPlan(bilingualPlan), timelineSha256: sha(bilingualTimelineBytes)});
assert.equal(bilingualManifest.format, 'laohu.asrcut.caption-manifest/2');
assert.equal(bilingualManifest.cues[0].lines.join(''), bilingualSourceText, 'English stays out of the Chinese source lines');
assert.equal(bilingualManifest.cues[0].translations[0].lines[0], "It is not 3.14 m; it is NVIDIA CUDA 12.4.");
assert.deepEqual(bilingualManifest.cues[0].displayWindow, {startSample: 0, endSample: 100, sampleRateHz: rate,
  timingPrecision: 'utterance', leadSamples: 0, holdSamples: 0}, 'both language rows inherit the same real utterance window');
assert.equal(bilingualManifest.cues[0].anchors[0].tokenIds, undefined, 'segment-only ASR does not receive invented English word anchors');
assert.equal(captionManifestToSrt(bilingualManifest), `1\n00:00:00,000 --> 00:00:00,100\n${bilingualSourceText}\nIt is not 3.14 m; it is NVIDIA CUDA 12.4.\n`);
assert.equal(verifyCaptionManifest(bilingualManifest, {plan: bilingualPlan, timeline: bilingualTimeline,
  planSha256: hashPlan(bilingualPlan), timelineSha256: sha(bilingualTimelineBytes)}), true);
assert.throws(() => compileCaptionManifest({plan: bilingualPlan, timeline: bilingualTimeline,
  design: {...bilingualDesign, cues: [{...bilingualCue, lines: ['是 3.14 米，而是 NVIDIA CUDA 12.4。']}]},
  planSha256: hashPlan(bilingualPlan), timelineSha256: sha(bilingualTimelineBytes)}), /is stale against its Chinese display lines/,
  'a changed Chinese cue cannot keep an old English translation binding');
assert.throws(() => compileCaptionManifest({plan: bilingualPlan, timeline: bilingualTimeline,
  design: {...bilingualDesign, cues: [{...bilingualCue, translations: null}]},
  planSha256: hashPlan(bilingualPlan), timelineSha256: sha(bilingualTimelineBytes)}), /translations must be an array when supplied/,
  'an explicit null translation list cannot silently fall back to an untranslated cue');
assert.throws(() => compileCaptionManifest({plan: bilingualPlan, timeline: bilingualTimeline,
  design: {...bilingualDesign, displayLanguages: ['zh-Hans', 'en', 'ja']},
  planSha256: hashPlan(bilingualPlan), timelineSha256: sha(bilingualTimelineBytes)}), /missing the requested ja translation/,
  'a requested language cannot silently disappear');
assert.throws(() => compileCaptionManifest({plan: bilingualPlan, timeline: bilingualTimeline,
  design: {...bilingualDesign, cues: [{...bilingualCue, tokenIds: ['invented-english-token'], segmentId: undefined}]},
  planSha256: hashPlan(bilingualPlan), timelineSha256: sha(bilingualTimelineBytes)}), /references missing token/,
  'English remains a translation and cannot become a fabricated ASR token');

const staleManifest = structuredClone(utteranceManifest);
staleManifest.cues[0].displayText = '篡改';
assert.throws(() => verifyCaptionManifest(staleManifest, {plan: captionUtterancePlan, timeline: utteranceTimeline,
  planSha256: hashPlan(captionUtterancePlan), timelineSha256: sha(utteranceTimelineBytes)}), /hash is stale/);
assert.throws(() => compileCaptionManifest({plan: captionUtterancePlan, timeline: utteranceTimeline, planSha256: hashPlan(captionUtterancePlan),
  timelineSha256: '0'.repeat(64), design: utteranceDesign}), /stale/);
const invalidWindowDesign = {...utteranceDesign, cues: [utteranceDesign.cues[0], {...utteranceDesign.cues[1],
  displayWindow: {range: {startSample: 80, endSample: 101, sampleRateHz: rate}}}]};
assert.throws(() => compileCaptionManifest({plan: captionUtterancePlan, timeline: utteranceTimeline, design: invalidWindowDesign,
  planSha256: hashPlan(captionUtterancePlan), timelineSha256: sha(utteranceTimelineBytes)}), /must stay within its retained occurrence/);
const legacyDisplayPlan = structuredClone(captionUtterancePlan);
legacyDisplayPlan.displayText = [{id: 'display-only', segmentId: captionUtterancePlan.sources[0].transcript.segments[0].id, text: '旧式屏幕文字。'}];
rehash(legacyDisplayPlan);
assert.equal(hashPlan(legacyDisplayPlan), historicalPlanHash(legacyDisplayPlan), 'legacy non-empty displayText retains historical edit-plan hash semantics');
const legacyHashBeforeCaptionCompile = hashPlan(legacyDisplayPlan);
const legacyTimeline = compilePlan(legacyDisplayPlan);
const legacyTimelineBytes = Buffer.from(`${JSON.stringify(legacyTimeline, null, 2)}\n`);
const externalCaptionDesign = {...utteranceDesign, planSha256: legacyHashBeforeCaptionCompile, timelineSha256: sha(legacyTimelineBytes)};
const displaySeparateManifest = compileCaptionManifest({plan: legacyDisplayPlan, timeline: legacyTimeline, design: externalCaptionDesign,
  planSha256: legacyHashBeforeCaptionCompile, timelineSha256: sha(legacyTimelineBytes)});
assert.equal(hashPlan(legacyDisplayPlan), legacyHashBeforeCaptionCompile, 'compiling independent captions does not mutate the old edit plan or displayText');
assert.equal(legacyDisplayPlan.displayText[0].text, '旧式屏幕文字。');
assert.equal(displaySeparateManifest.cues.length, 2);
const trailingBreakSrtPlan = importSrt('1\n00:00:00,000 --> 00:00:00,100\n你好\n',
  {projectId: 'caption-srt-layout', sourceId: 'srt-layout-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
const trailingBreakTimeline = compilePlan(trailingBreakSrtPlan);
const trailingBreakTimelineSha = sha(Buffer.from(`${JSON.stringify(trailingBreakTimeline, null, 2)}\n`));
const trailingBreakDesign = {format: 'laohu.asrcut.caption-design/1', projectId: trailingBreakSrtPlan.project.id,
  revision: trailingBreakSrtPlan.project.revision, planSha256: hashPlan(trailingBreakSrtPlan), timelineSha256: trailingBreakTimelineSha,
  profile: 'zh-caption/1', coveragePolicy: 'all-retained-speech/1', cues: [{id: 'srt-layout-cue',
    occurrenceId: trailingBreakSrtPlan.sequence[0].occurrenceId, segmentId: trailingBreakSrtPlan.sources[0].transcript.segments[0].id,
    lines: ['你好'], displayWindow: {range: {startSample: 0, endSample: 100, sampleRateHz: rate}},
    segmentationDecision: 'one semantic utterance', reason: 'SRT line ending is layout metadata, not spoken text'}]};
const trailingBreakManifest = compileCaptionManifest({plan: trailingBreakSrtPlan, timeline: trailingBreakTimeline,
  design: trailingBreakDesign, planSha256: hashPlan(trailingBreakSrtPlan), timelineSha256: trailingBreakTimelineSha});
assert.equal(trailingBreakManifest.cues[0].rawText, '你好\n', 'source ASR/SRT text remains unchanged in the manifest');
assert.equal(trailingBreakManifest.cues[0].lexicalText, '你好');
assert.equal(captionManifestToSrt(trailingBreakManifest).includes('你好\n\n'), false, 'SRT layout newline is not re-emitted as an empty subtitle line');
assert.throws(() => compileCaptionManifest({plan: trailingBreakSrtPlan, timeline: trailingBreakTimeline,
  design: {...trailingBreakDesign, cues: [{...trailingBreakDesign.cues[0], lines: ['你']}]},
  planSha256: hashPlan(trailingBreakSrtPlan), timelineSha256: trailingBreakTimelineSha}), /omits spoken text/);

const punctuationPlan = importAsrJson({segments: [{startMs: 0, endMs: 100, text: '价格3.14，网址https://a.b/x', words: [
  {startMs: 0, endMs: 20, text: '价格'}, {startMs: 20, endMs: 40, text: '3.14'}, {startMs: 40, endMs: 50, text: '，'},
  {startMs: 50, endMs: 70, text: '网址'}, {startMs: 70, endMs: 100, text: 'https://a.b/x'},
]}]}, {projectId: 'caption-punctuation', sourceId: 'punct-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
const punctuationTimeline = compilePlan(punctuationPlan);
const punctuationTimelineBytes = Buffer.from(`${JSON.stringify(punctuationTimeline, null, 2)}\n`);
const punctuationDesign = {format: 'laohu.asrcut.caption-design/1', projectId: punctuationPlan.project.id, revision: punctuationPlan.project.revision,
  planSha256: hashPlan(punctuationPlan), timelineSha256: sha(punctuationTimelineBytes), profile: 'zh-caption/1', coveragePolicy: 'all-retained-speech/1',
  cues: [{id: 'punctuation-cue', occurrenceId: punctuationPlan.sequence[0].occurrenceId,
    tokenIds: punctuationPlan.coverage[0].tokenIds, lines: ['价格3.14，', '网址https://a.b/x？'], punctuationDecision: 'retain ASR punctuation and add terminal question mark to match the authored question',
    displayWindow: {range: {startSample: 0, endSample: 100, sampleRateHz: rate}}, segmentationDecision: 'one clause with a semantic phrase break', reason: 'the price and URL remain readable together'}]};
const punctuationManifest = compileCaptionManifest({plan: punctuationPlan, timeline: punctuationTimeline, design: punctuationDesign,
  planSha256: hashPlan(punctuationPlan), timelineSha256: sha(punctuationTimelineBytes)});
assert.equal(punctuationManifest.cues[0].rawText, '价格3.14，网址https://a.b/x');
assert.equal(punctuationManifest.cues[0].displayText, '价格3.14，网址https://a.b/x？');
assert.throws(() => compileCaptionManifest({plan: punctuationPlan, timeline: punctuationTimeline, design: {...punctuationDesign,
  cues: [{...punctuationDesign.cues[0], lines: ['价格3.14，', '网址https://a.bx？']} ]}, planSha256: hashPlan(punctuationPlan), timelineSha256: sha(punctuationTimelineBytes)}), /changes spoken text or protected punctuation/);
assert.throws(() => compileCaptionManifest({plan: punctuationPlan, timeline: punctuationTimeline, design: {...punctuationDesign,
  cues: [{...punctuationDesign.cues[0], tokenIds: [...punctuationDesign.cues[0].tokenIds].reverse()}]}, planSha256: hashPlan(punctuationPlan), timelineSha256: sha(punctuationTimelineBytes)}), /contiguous timeline word order/);

const screenPhrases = [
  ['“价格”是3.14，网址https://a.b/x。', '价格是3.14网址https://a.b/x', 'Price 3.14 at https://a.b/x'],
  ['能源、芯片、', '能源、芯片', 'Energy and chips'],
  ['应用呢？', '应用呢？', 'What about apps?'],
  ['快看！', '快看！', 'Look!'],
];
const screenPlan = importAsrJson({segments: [{
  startMs: 0, endMs: 100, text: screenPhrases.map(([source]) => source).join(''),
  words: screenPhrases.map(([text], index) => ({startMs: index * 25, endMs: (index + 1) * 25, text})),
}]}, {projectId: 'caption-screen-phrases', sourceId: 'screen-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
const screenTimeline = compilePlan(screenPlan);
const screenBinding = {plan: screenPlan, timeline: screenTimeline, planSha256: hashPlan(screenPlan),
  timelineSha256: sha(Buffer.from(`${JSON.stringify(screenTimeline, null, 2)}\n`))};
const screenDesign = {
  format: 'laohu.asrcut.caption-design/2', projectId: screenPlan.project.id, revision: screenPlan.project.revision,
  planSha256: screenBinding.planSha256, timelineSha256: screenBinding.timelineSha256,
  profile: 'zh-caption/2', coveragePolicy: 'all-retained-speech/1', sourceLanguage: 'zh-Hans', displayLanguages: ['zh-Hans', 'en'],
  cues: screenPhrases.map(([, zh, en], index) => ({
    id: `screen-${index}`, occurrenceId: screenPlan.sequence[0].occurrenceId, tokenIds: [screenPlan.coverage[0].tokenIds[index]],
    lines: [zh], displayWindow: {range: {startSample: index * 25, endSample: (index + 1) * 25, sampleRateHz: rate}},
    segmentationDecision: 'display each semantic phrase in its own window', reason: 'match the retained word anchors',
    punctuationDecision: 'omit display commas, stops and the enumeration mark at the screen boundary',
    translations: [{language: 'en', lines: [en], sourceCueId: `screen-${index}`, sourceTextSha256: sha(JSON.stringify([zh])),
      provenance: {origin: 'machine-assisted', status: 'draft', revision: 1}}],
  })),
};
const screenManifest = compileCaptionManifest({...screenBinding, design: screenDesign});
assert.deepEqual(screenManifest.cues.map((cue) => cue.rawText), screenPhrases.map(([source]) => source));
assert.deepEqual(screenManifest.cues.map((cue) => cue.lines[0]), screenPhrases.map(([, zh]) => zh));
assert.ok(captionManifestToSrt(screenManifest).includes('能源、芯片\nEnergy and chips'));
assert.equal(verifyCaptionManifest(screenManifest, screenBinding), true);
function changeScreenLine(index, zh, punctuationDecision = screenDesign.cues[index].punctuationDecision) {
  const cues = structuredClone(screenDesign.cues);
  cues[index].lines = [zh];
  cues[index].translations[0].sourceTextSha256 = sha(JSON.stringify([zh]));
  cues[index].punctuationDecision = punctuationDecision;
  return compileCaptionManifest({...screenBinding, design: {...screenDesign, cues}});
}
assert.throws(() => changeScreenLine(0, '价格是3.14，网址https://a.b/x'), /comma, full stop, or trailing enumeration mark/);
assert.throws(() => changeScreenLine(0, '价格是314网址https://a.b/x'), /spoken character or protected punctuation/);
assert.throws(() => changeScreenLine(0, '价格是3.14网址https://ab/x'), /spoken character or protected punctuation/);
assert.throws(() => changeScreenLine(1, '能源芯片'), /spoken character or protected punctuation/);
assert.throws(() => changeScreenLine(1, '能源、芯片、'), /comma, full stop, or trailing enumeration mark/);
assert.throws(() => changeScreenLine(2, '应用呢'), /spoken character or protected punctuation/);
assert.throws(() => changeScreenLine(3, '快看'), /spoken character or protected punctuation/);
assert.throws(() => changeScreenLine(1, '能源、芯片', ''), /punctuationDecision/);

const urlPunctuationPlan = importAsrJson({segments: [{startMs: 0, endMs: 100, text: '访问官网https://example.com获取最新价格',
  words: [{startMs: 0, endMs: 100, text: '访问官网https://example.com获取最新价格'}]}]},
{projectId: 'caption-url-boundary', sourceId: 'url-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
const urlPunctuationTimeline = compilePlan(urlPunctuationPlan);
const urlTimelineBytes = Buffer.from(`${JSON.stringify(urlPunctuationTimeline, null, 2)}\n`);
const urlCue = {id: 'url-boundary-cue', occurrenceId: urlPunctuationPlan.sequence[0].occurrenceId,
  tokenIds: urlPunctuationPlan.coverage[0].tokenIds, lines: ['访问官网https://example.com，', '获取最新价格'],
  punctuationDecision: 'add one authored clause separator after the complete URL token',
  displayWindow: {range: {startSample: 0, endSample: 100, sampleRateHz: rate}}, segmentationDecision: 'break after the URL phrase', reason: 'separate the destination from the resulting action'};
const urlManifest = compileCaptionManifest({plan: urlPunctuationPlan, timeline: urlPunctuationTimeline,
  design: {format: 'laohu.asrcut.caption-design/1', projectId: urlPunctuationPlan.project.id, revision: urlPunctuationPlan.project.revision,
    planSha256: hashPlan(urlPunctuationPlan), timelineSha256: sha(urlTimelineBytes), profile: 'zh-caption/1', coveragePolicy: 'all-retained-speech/1', cues: [urlCue]},
  planSha256: hashPlan(urlPunctuationPlan), timelineSha256: sha(urlTimelineBytes)});
assert.equal(urlManifest.cues[0].displayText, '访问官网https://example.com，获取最新价格');
assert.throws(() => compileCaptionManifest({plan: urlPunctuationPlan, timeline: urlPunctuationTimeline,
  design: {format: 'laohu.asrcut.caption-design/1', projectId: urlPunctuationPlan.project.id, revision: urlPunctuationPlan.project.revision,
    planSha256: hashPlan(urlPunctuationPlan), timelineSha256: sha(urlTimelineBytes), profile: 'zh-caption/1', coveragePolicy: 'all-retained-speech/1',
    cues: [{...urlCue, lines: ['访问官网https://examplecom，', '获取最新价格'], tokenIds: [urlPunctuationPlan.coverage[0].tokenIds[0]]}]},
  planSha256: hashPlan(urlPunctuationPlan), timelineSha256: sha(urlTimelineBytes)}), /changes spoken text or protected punctuation/);
const unicodeUrlPlan = importAsrJson({segments: [{startMs: 0, endMs: 100, text: '访问https://example.com/文档下载',
  words: [{startMs: 0, endMs: 100, text: '访问https://example.com/文档下载'}]}]},
{projectId: 'caption-url-unicode', sourceId: 'unicode-url-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
const unicodeUrlTimeline = compilePlan(unicodeUrlPlan);
const unicodeUrlTimelineSha = sha(Buffer.from(`${JSON.stringify(unicodeUrlTimeline, null, 2)}\n`));
assert.throws(() => compileCaptionManifest({plan: unicodeUrlPlan, timeline: unicodeUrlTimeline,
  design: {format: 'laohu.asrcut.caption-design/1', projectId: unicodeUrlPlan.project.id, revision: unicodeUrlPlan.project.revision,
    planSha256: hashPlan(unicodeUrlPlan), timelineSha256: unicodeUrlTimelineSha, profile: 'zh-caption/1', coveragePolicy: 'all-retained-speech/1',
    cues: [{...urlCue, occurrenceId: unicodeUrlPlan.sequence[0].occurrenceId, tokenIds: unicodeUrlPlan.coverage[0].tokenIds,
      lines: ['访问https://example.com/，', '文档下载']}]},
  planSha256: hashPlan(unicodeUrlPlan), timelineSha256: unicodeUrlTimelineSha}), /inside a decimal or URL token/);

const holdPlan = importAsrJson({segments: [{startMs: 0, endMs: 20, text: '读完', words: [{startMs: 0, endMs: 20, text: '读完'}]}]},
  {projectId: 'caption-hold', sourceId: 'hold-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100});
const holdTimeline = compilePlan(holdPlan);
const holdTimelineSha = sha(Buffer.from(`${JSON.stringify(holdTimeline, null, 2)}\n`));
const holdCue = {id: 'hold-cue', occurrenceId: holdPlan.sequence[0].occurrenceId, tokenIds: holdPlan.coverage[0].tokenIds,
  lines: ['读完'], displayWindow: {range: {startSample: 0, endSample: 40, sampleRateHz: rate}, holdSamples: 20, reason: 'allow a brief reading finish after the spoken phrase'},
  segmentationDecision: 'one short clause', reason: 'preserve one semantic unit'};
const holdManifest = compileCaptionManifest({plan: holdPlan, timeline: holdTimeline, planSha256: hashPlan(holdPlan), timelineSha256: holdTimelineSha,
  design: {format: 'laohu.asrcut.caption-design/1', projectId: holdPlan.project.id, revision: holdPlan.project.revision,
    planSha256: hashPlan(holdPlan), timelineSha256: holdTimelineSha, profile: 'zh-caption/1', coveragePolicy: 'all-retained-speech/1', cues: [holdCue]}});
assert.equal(holdManifest.cues[0].displayWindow.holdSamples, 20, 'a small explicit justified reading hold remains allowed');

const longGapPlan = importAsrJson({segments: [
  {startMs: 0, endMs: 1000, text: '开头', words: [{startMs: 0, endMs: 1000, text: '开头'}]},
  {startMs: 9000, endMs: 10000, text: '结尾', words: [{startMs: 9000, endMs: 10000, text: '结尾'}]},
]}, {projectId: 'caption-long-gap', sourceId: 'long-gap-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 10000});
const longGapTimeline = compilePlan(longGapPlan);
const longGapTimelineSha = sha(Buffer.from(`${JSON.stringify(longGapTimeline, null, 2)}\n`));
const longGapBase = {format: 'laohu.asrcut.caption-design/1', projectId: longGapPlan.project.id, revision: longGapPlan.project.revision,
  planSha256: hashPlan(longGapPlan), timelineSha256: longGapTimelineSha, profile: 'zh-caption/1', coveragePolicy: 'all-retained-speech/1'};
const longGapCues = longGapPlan.sources[0].transcript.segments.map((segment, index) => ({id: `long-gap-${index}`, occurrenceId: longGapPlan.sequence[0].occurrenceId,
  tokenIds: [segment.tokens[0].id], lines: [segment.rawText], displayWindow: {range: {startSample: index ? 9000 : 0, endSample: index ? 10000 : 1000, sampleRateHz: rate}},
  segmentationDecision: 'one utterance per clause', reason: 'retain exact spoken words'}));
assert.throws(() => compileCaptionManifest({plan: longGapPlan, timeline: longGapTimeline, design: {...longGapBase, cues: [longGapCues[0],
  {...longGapCues[1], displayWindow: {range: {startSample: 1000, endSample: 10000, sampleRateHz: rate}, leadSamples: 8000, reason: 'unjustified early hold'}}]},
  planSha256: hashPlan(longGapPlan), timelineSha256: longGapTimelineSha}), /0\.\.500 ms lead-in/);

const captionCliDir = join(root, 'caption-cli');
await mkdir(captionCliDir, {recursive: true});
const captionPlanPath = join(captionCliDir, 'edit-plan.json');
const captionTimelinePath = join(captionCliDir, 'timeline.json');
const captionDesignPath = join(captionCliDir, 'caption-design.json');
const captionManifestPath = join(captionCliDir, 'caption-manifest.json');
const captionSrtPath = join(captionCliDir, 'captions.srt');
const verifiedSrtPath = join(captionCliDir, 'verified-captions.srt');
await writeFile(captionPlanPath, `${JSON.stringify(captionUtterancePlan, null, 2)}\n`);
await writeFile(captionTimelinePath, utteranceTimelineBytes);
await writeFile(captionDesignPath, `${JSON.stringify(utteranceDesign, null, 2)}\n`);
await execFileAsync(process.execPath, [resolve('.agents/skills/laohu-asrcut/scripts/asrcut.mjs'), 'compile-captions', '--plan', captionPlanPath,
  '--timeline', captionTimelinePath, '--design', captionDesignPath, '--out', captionManifestPath, '--srt', captionSrtPath]);
const cliCaptionManifest = JSON.parse(await readFile(captionManifestPath, 'utf8'));
const cliCaptionSrt = await readFile(captionSrtPath, 'utf8');
assert.equal(cliCaptionManifest.integrity.manifestSha256, utteranceManifest.integrity.manifestSha256);
assert.equal(cliCaptionSrt, captionManifestToSrt(cliCaptionManifest));
await execFileAsync(process.execPath, [resolve('.agents/skills/laohu-asrcut/scripts/asrcut.mjs'), 'export-srt', '--plan', captionPlanPath,
  '--timeline', captionTimelinePath, '--manifest', captionManifestPath, '--out', verifiedSrtPath]);
assert.equal(await readFile(verifiedSrtPath, 'utf8'), cliCaptionSrt, 'saved manifest exports deterministic SRT after timeline revalidation');
const bilingualCliPlanPath = join(captionCliDir, 'bilingual-edit-plan.json');
const bilingualCliTimelinePath = join(captionCliDir, 'bilingual-timeline.json');
const bilingualCliDesignPath = join(captionCliDir, 'bilingual-caption-design.json');
const bilingualCliManifestPath = join(captionCliDir, 'bilingual-caption-manifest.json');
const bilingualCliSrtPath = join(captionCliDir, 'bilingual-captions.srt');
const bilingualCliReexportPath = join(captionCliDir, 'bilingual-reexport.srt');
await writeFile(bilingualCliPlanPath, `${JSON.stringify(bilingualPlan, null, 2)}\n`);
await writeFile(bilingualCliTimelinePath, bilingualTimelineBytes);
await writeFile(bilingualCliDesignPath, `${JSON.stringify(bilingualDesign, null, 2)}\n`);
const bilingualCompileResult = await execFileAsync(process.execPath, [resolve('.agents/skills/laohu-asrcut/scripts/asrcut.mjs'), 'compile-captions',
  '--plan', bilingualCliPlanPath, '--timeline', bilingualCliTimelinePath, '--design', bilingualCliDesignPath,
  '--out', bilingualCliManifestPath, '--srt', bilingualCliSrtPath]);
assert.equal(JSON.parse(bilingualCompileResult.stdout).format, 'laohu.asrcut.caption-manifest/2', 'CLI reports its explicit manifest version');
assert.deepEqual(JSON.parse(bilingualCompileResult.stdout).displayLanguages, ['zh-Hans', 'en']);
const cliBilingualManifest = JSON.parse(await readFile(bilingualCliManifestPath, 'utf8'));
assert.equal(cliBilingualManifest.cues[0].lines.join(''), bilingualSourceText);
assert.equal(await readFile(bilingualCliSrtPath, 'utf8'), captionManifestToSrt(bilingualManifest));
const bilingualExportResult = await execFileAsync(process.execPath, [resolve('.agents/skills/laohu-asrcut/scripts/asrcut.mjs'), 'export-srt',
  '--plan', bilingualCliPlanPath, '--timeline', bilingualCliTimelinePath, '--manifest', bilingualCliManifestPath, '--out', bilingualCliReexportPath]);
assert.equal(JSON.parse(bilingualExportResult.stdout).format, 'laohu.asrcut.caption-manifest/2');
assert.equal(await readFile(bilingualCliReexportPath, 'utf8'), await readFile(bilingualCliSrtPath, 'utf8'), 'CLI re-export keeps the paired cue on its single display window');
const forgedTimelinePath = join(captionCliDir, 'forged-timeline.json');
const forgedTimeline = structuredClone(utteranceTimeline);
forgedTimeline.clips[0].targetRange.endSample -= 1;
await writeFile(forgedTimelinePath, `${JSON.stringify(forgedTimeline, null, 2)}\n`);
await assert.rejects(execFileAsync(process.execPath, [resolve('.agents/skills/laohu-asrcut/scripts/asrcut.mjs'), 'compile-captions', '--plan', captionPlanPath,
  '--timeline', forgedTimelinePath, '--design', captionDesignPath, '--out', join(captionCliDir, 'forged.json'), '--srt', join(captionCliDir, 'forged.srt')]), /Supplied timeline differs/);
await assert.rejects(readFile(join(captionCliDir, 'forged.json')));
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
const noteSource = timed.sources[0];
const noteSegment = noteSource.transcript.segments[0];
const noteToken = noteSegment.tokens[0];
const noteOccurrence = timed.sequence[0];
const userNoted = upsertAnnotation(timed, {
  id: 'note-bridge', sourceId: noteSource.id, segmentId: noteSegment.id, tokenId: noteToken.id,
  occurrenceId: noteOccurrence.occurrenceId,
  userNote: '这里保留用户原来的对象关系。',
});
assert.equal(userNoted.project.revision, 1, 'a note-only update does not revise the frozen edit timing identity');
assert.equal(userNoted.integrity.planSha256, timed.integrity.planSha256, 'an annotation does not change the edit hash');
assert.equal(userNoted.sources[0].transcript.segments[0].rawText, '整句', 'user notes never overwrite raw ASR text');
const motionNoted = upsertAnnotation(userNoted, {
  id: 'note-bridge', sourceId: noteSource.id, segmentId: noteSegment.id, tokenId: noteToken.id,
  occurrenceId: noteOccurrence.occurrenceId,
  analysisNote: '观众需要看出前态与结果的对应关系。',
  motionDirection: '先显出原因，再让结果沿同一对象关系落定。',
  motionBinding: {
    objects: [{id: 'reason-card', role: 'cause'}],
    states: [{objectId: 'reason-card', state: 'result-visible'}],
    assets: [{id: 'diagram-local', role: 'explanatory-vector'}],
    componentCalls: [{componentId: 'laohu-authored-shot', componentInstanceId: 'caption-title', shotId: 'caption-type', props: {title: '结果'}}],
    phases: [{id: 'reveal-result', anchor: {kind: 'point', clipOccurrenceId: noteOccurrence.occurrenceId, tokenId: noteToken.id, edge: 'start'}, entryState: 'result hidden', exitCondition: 'result label readable'}],
    transitions: [{id: 'cause-to-result', fromObjectId: 'reason-card', toObjectId: 'result-card', mechanism: 'retain shared relation while result appears'}],
    audioEvents: [{id: 'result-hit', role: 'soft-impact', rationale: 'Mark the first visible result at the shared speech anchor.'}],
  },
});
assert.equal(motionNoted.annotations[0].userNote, '这里保留用户原来的对象关系。', 'Motion refinement keeps the original user note in the same annotation record');
const annotatedTimeline = compilePlan(motionNoted);
assert.equal(annotatedTimeline.annotations[0].resolution, 'resolved');
assert.deepEqual(annotatedTimeline.annotations[0].resolvedTargets[0], {
  occurrenceId: noteOccurrence.occurrenceId,
  targetRange: {startSample: 20, endSample: 80, sampleRateHz: rate},
  timingPrecision: 'measured',
});
assert.equal(annotatedTimeline.annotationSha256, motionNoted.integrity.annotationSha256, 'the compiled note layer has its own hash');
assert.equal(annotatedTimeline.annotations[0].motionBinding.phases[0].anchor.tokenId, noteToken.id);
assert.throws(() => upsertAnnotation(motionNoted, {...motionNoted.annotations[0], userNote: '改写原始用户备注'}), /preserves its original userNote/);
const frozenMotionNoted = freezePlan(motionNoted);
const frozenTimelineBefore = compilePlan(frozenMotionNoted);
const frozenEditHash = frozenMotionNoted.integrity.planSha256;
const frozenRevision = frozenMotionNoted.project.revision;
const refinedAfterFreeze = upsertAnnotation(frozenMotionNoted, {
  id: 'note-bridge', sourceId: noteSource.id, segmentId: noteSegment.id, tokenId: noteToken.id,
  occurrenceId: noteOccurrence.occurrenceId,
  userNote: '这里保留用户原来的对象关系。',
  analysisNote: '观众需要看出前态与结果的对应关系。',
  motionDirection: '冻结的发音范围内先显出原因，再让结果沿原对象关系落定。',
  motionBinding: {
    objects: [{id: 'reason-card', role: 'cause'}],
    states: [{objectId: 'reason-card', state: 'result-visible'}],
    assets: [{id: 'diagram-local', role: 'explanatory-vector'}],
    componentCalls: [{componentId: 'laohu-authored-shot', componentInstanceId: 'caption-title', shotId: 'caption-type', props: {title: '结果'}}],
    phases: [{id: 'reveal-result', anchor: {kind: 'point', clipOccurrenceId: noteOccurrence.occurrenceId, tokenId: noteToken.id, edge: 'start'}, entryState: 'result hidden', exitCondition: 'result label readable'}],
    transitions: [{id: 'cause-to-result', fromObjectId: 'reason-card', toObjectId: 'result-card', mechanism: 'retain shared relation while result appears'}],
    audioEvents: [{id: 'result-hit', role: 'soft-impact', rationale: 'Mark the first visible result at the shared speech anchor.'}],
  },
});
assert.equal(refinedAfterFreeze.state, 'frozen', 'Motion can refine its note layer without reopening the frozen edit plan');
assert.equal(refinedAfterFreeze.project.revision, frozenRevision, 'note refinement does not create an edit-plan revision');
assert.equal(refinedAfterFreeze.integrity.planSha256, frozenEditHash, 'the approved edit hash remains unchanged');
assert.deepEqual(refinedAfterFreeze.review, frozenMotionNoted.review, 'note refinement preserves review status and its approved hash');
assert.equal(refinedAfterFreeze.sources[0].transcript.segments[0].rawText, '整句');
assert.deepEqual(refinedAfterFreeze.sequence, frozenMotionNoted.sequence);
assert.deepEqual(refinedAfterFreeze.coverage, frozenMotionNoted.coverage);
assert.equal(refinedAfterFreeze.annotations[0].userNote, '这里保留用户原来的对象关系。');
assert.equal(refinedAfterFreeze.annotations[0].analysisNote, '观众需要看出前态与结果的对应关系。');
const frozenTimelineAfter = compilePlan(refinedAfterFreeze);
assert.equal(frozenTimelineAfter.planSha256, frozenTimelineBefore.planSha256);
assert.equal(frozenTimelineAfter.annotationSha256, refinedAfterFreeze.integrity.annotationSha256);
assert.notEqual(frozenTimelineAfter.annotationSha256, frozenTimelineBefore.annotationSha256, 'Motion note refinements are visible through the separate timeline annotation hash');
assert.equal(frozenTimelineAfter.durationSamples, frozenTimelineBefore.durationSamples);
assert.deepEqual(frozenTimelineAfter.clips.map((clip) => clip.targetRange), frozenTimelineBefore.clips.map((clip) => clip.targetRange));
assert.throws(() => upsertAnnotation(frozenMotionNoted, {...frozenMotionNoted.annotations[0], analysisNote: '替换分析判断'}), /preserves the original analysisNote/);
assert.throws(() => upsertAnnotation(frozenMotionNoted, {...frozenMotionNoted.annotations[0], sequence: []}), /Unsupported annotation fields/);
const staleAnnotationHash = structuredClone(refinedAfterFreeze);
staleAnnotationHash.annotations[0].motionDirection = 'tampered note';
assert.ok(validatePlan(staleAnnotationHash).errors.some((error) => error.includes('annotation hash is stale')));
const frozenSequenceEdit = structuredClone(refinedAfterFreeze);
frozenSequenceEdit.sequence[0].coverageId = 'tampered-coverage';
assert.ok(validatePlan(frozenSequenceEdit).errors.some((error) => error.includes('plan hash is stale')));
const frozenTranscriptEdit = structuredClone(refinedAfterFreeze);
frozenTranscriptEdit.sources[0].transcript.segments[0].rawText = '改动后的口播';
assert.ok(validatePlan(frozenTranscriptEdit).errors.some((error) => error.includes('plan hash is stale')));
const orphanAnnotation = structuredClone(motionNoted);
orphanAnnotation.annotations[0].segmentId = 'nonexistent-segment';
rehash(orphanAnnotation);
assert.ok(validatePlan(orphanAnnotation).errors.some((error) => error.includes('real sourceId and segmentId')));
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
const correctionCaptionInput = (plan, timeline, {cueId, tokenId = null, segmentId = null, lines}) => {
  const clip = timeline.clips[0];
  const anchorRow = tokenId == null ? clip.transcriptSegments.find((row) => row.segmentId === segmentId)
    : clip.words.find((row) => row.tokenId === tokenId);
  const timelineSha256 = sha(Buffer.from(`${JSON.stringify(timeline, null, 2)}\n`));
  const planSha256 = hashPlan(plan);
  return {plan, timeline, planSha256, timelineSha256, design: {
    format: 'laohu.asrcut.caption-design/1', projectId: plan.project.id, revision: plan.project.revision,
    planSha256, timelineSha256, profile: 'verbatim/1', coveragePolicy: 'all-retained-speech/1',
    cues: [{id: cueId, occurrenceId: clip.occurrenceId, ...(tokenId == null ? {segmentId} : {tokenIds: [tokenId]}),
      lines, displayWindow: {range: anchorRow.targetRange}, segmentationDecision: 'one verified spoken unit',
      reason: 'Use only the lexical wording carried by the retained canonical row.'}],
  }};
};
const unconfirmedCaptionInput = correctionCaptionInput(correctionPlan, candidateCorrectionTimeline, {
  cueId: 'unconfirmed-correction-caption', tokenId: correctionToken.id, lines: ['口语核听后的文本'],
});
assert.throws(() => compileCaptionManifest(unconfirmedCaptionInput), /verbatim\/1/,
  'an unconfirmed candidate cannot replace retained raw ASR wording in a caption');
const rawAsrCaption = compileCaptionManifest(correctionCaptionInput(correctionPlan, candidateCorrectionTimeline, {
  cueId: 'raw-asr-caption', tokenId: correctionToken.id, lines: ['原始识别'],
}));
assert.equal(rawAsrCaption.cues[0].rawText, '原始识别');
assert.equal(rawAsrCaption.cues[0].lexicalText, '原始识别');
assert.equal(Object.hasOwn(rawAsrCaption.cues[0], 'correctionProvenance'), false);
const confirmedCaptionInput = correctionCaptionInput(confirmedCorrection, confirmedCorrectionTimeline, {
  cueId: 'confirmed-correction-caption', tokenId: correctionToken.id, lines: ['口语核听后的文本'],
});
const confirmedCaption = compileCaptionManifest(confirmedCaptionInput);
assert.equal(confirmedCaption.cues[0].rawText, '原始识别', 'the correction never overwrites raw ASR evidence');
assert.equal(confirmedCaption.cues[0].lexicalText, '口语核听后的文本');
assert.equal(confirmedCaption.cues[0].displayText, '口语核听后的文本');
assert.deepEqual(confirmedCaption.cues[0].correctionProvenance, [{
  correctionId: 'correction-candidate', occurrenceId: confirmedCorrectionTimeline.clips[0].occurrenceId,
  sourceId: 'correction-source', segmentId: correctionSegment.id, tokenId: correctionToken.id,
  rawText: '原始识别', spokenText: '口语核听后的文本', status: 'confirmed',
  verificationMethod: 'audio-listening', listeningStatus: 'listened',
}]);
assert.ok(captionManifestToSrt(confirmedCaption).includes('口语核听后的文本'));
assert.equal(verifyCaptionManifest(confirmedCaption, confirmedCaptionInput), true);
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
const sentenceCorrectionTimeline = compilePlan(sentenceCorrection);
assert.equal(sentenceCorrectionTimeline.clips[0].transcriptSegments[0].text, sentenceCorrectionSegment.rawText);
assert.equal(sentenceCorrectionTimeline.clips[0].transcriptSegments[0].spokenText, '核听后确认的整句');
const confirmedSentenceCaptionInput = correctionCaptionInput(sentenceCorrection, sentenceCorrectionTimeline, {
  cueId: 'confirmed-sentence-correction-caption', segmentId: sentenceCorrectionSegment.id, lines: ['核听后确认的整句'],
});
const confirmedSentenceCaption = compileCaptionManifest(confirmedSentenceCaptionInput);
assert.equal(confirmedSentenceCaption.cues[0].rawText, sentenceCorrectionSegment.rawText);
assert.equal(confirmedSentenceCaption.cues[0].lexicalText, '核听后确认的整句');
assert.equal(confirmedSentenceCaption.cues[0].correctionProvenance[0].tokenId, undefined,
  'segment-level confirmed corrections preserve provenance without inventing token anchors');
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
const repeatedSpeechPlan = makeSplitDeletePlan(importAsrJson({segments: [
  {startMs: 0, endMs: 20, text: '先看', words: [{startMs: 4, endMs: 18, text: '先看'}]},
  {startMs: 20, endMs: 80, text: '先看', words: [{startMs: 32, endMs: 54, text: '先看'}]},
  {startMs: 80, endMs: 100, text: '继续', words: [{startMs: 84, endMs: 98, text: '继续'}]},
]}, {projectId: 'repeated-speech-test', sourceId: 'repeated-speech-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100}));
const deletedTokenId = repeatedSpeechPlan.sources[0].transcript.segments[1].tokens[0].id;
repeatedSpeechPlan.coverage[1].tokenIds = [deletedTokenId];
const repeatedDeleteDecision = repeatedSpeechPlan.decisions[1];
repeatedDeleteDecision.relation = 'repeated-content';
repeatedDeleteDecision.tokenIds = repeatedSpeechPlan.coverage[0].tokenIds;
repeatedDeleteDecision.keptOccurrenceIds = [repeatedSpeechPlan.sequence[0].occurrenceId];
rehash(repeatedSpeechPlan);
assert.deepEqual(validatePlan(repeatedSpeechPlan).errors, []);
assert.deepEqual(compilePlan(repeatedSpeechPlan).deletions[0].keptOccurrenceIds, repeatedDeleteDecision.keptOccurrenceIds);

const wrongRepeatLink = structuredClone(repeatedSpeechPlan);
wrongRepeatLink.decisions[1].keptOccurrenceIds = [wrongRepeatLink.sequence[1].occurrenceId];
wrongRepeatLink.decisions[1].tokenIds = [deletedTokenId];
rehash(wrongRepeatLink);
assert.ok(validatePlan(wrongRepeatLink).errors.some((error) => error.includes('tokenIds outside the declared retained occurrences')));
assert.throws(() => compilePlan(wrongRepeatLink), /failed validation/);

const missingRepeatTokens = structuredClone(repeatedSpeechPlan);
missingRepeatTokens.decisions[1].tokenIds = [];
rehash(missingRepeatTokens);
assert.ok(validatePlan(missingRepeatTokens).errors.some((error) => error.includes('must identify kept tokens')));

const unrelatedKeptOccurrence = structuredClone(repeatedSpeechPlan);
unrelatedKeptOccurrence.decisions[1].keptOccurrenceIds.push(unrelatedKeptOccurrence.sequence[1].occurrenceId);
rehash(unrelatedKeptOccurrence);
assert.ok(validatePlan(unrelatedKeptOccurrence).errors.some((error) => error.includes(`must identify kept tokens in occurrence ${unrelatedKeptOccurrence.sequence[1].occurrenceId}`)));

const sentenceRepeatPlan = makeSplitDeletePlan(importSrt('1\n00:00:00,000 --> 00:00:00,020\n先看\n\n2\n00:00:00,020 --> 00:00:00,080\n先看\n\n3\n00:00:00,080 --> 00:00:00,100\n继续\n', {
  projectId: 'sentence-repeat-test', sourceId: 'sentence-repeat-source', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: 100,
}));
sentenceRepeatPlan.decisions[1].relation = 'repeated-content';
sentenceRepeatPlan.decisions[1].keptOccurrenceIds = [sentenceRepeatPlan.sequence[0].occurrenceId];
rehash(sentenceRepeatPlan);
assert.deepEqual(validatePlan(sentenceRepeatPlan).errors, []);
assert.equal(compilePlan(sentenceRepeatPlan).clips[0].transcriptSegments[0].text, '先看');

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
assert.equal(exportResult.receiptData.audioTreatment, undefined, 'legacy export receipt remains trim-only when no treatment is supplied');
assert.equal(exportResult.receiptData.operation, 'equal-speed sample trim and concatenation; no fades, overlap, retiming, or mixing');
assert.deepEqual(readWav16(await readFile(exportPath)), [...sourceSamples.slice(0, 20), ...sourceSamples.slice(80, 100)]);
assert.equal(createHash('sha256').update(await readFile(inputPath)).digest('hex'), mediaHash);

// First-stage source repair uses continuous synthetic audio, measured filter latency,
// float intermediates, matched-loudness A/B copies, and the existing timeline mapping.
const voiceRate = 48000;
const voicePath = join(root, 'voice-source.wav');
const voiceBytes = syntheticVoiceWav(5, voiceRate);
await writeFile(voicePath, voiceBytes);
const voiceSha = createHash('sha256').update(voiceBytes).digest('hex');
const audioPlanPath = join(root, 'voice-audio-plan.json');
const createdAudioPlan = await createAudioPlan({inputPath: voicePath, outPath: audioPlanPath, projectId: 'voice-treatment-test', sourceId: 'voice-source'});
const voiceAudioPlan = createdAudioPlan.plan;
voiceAudioPlan.diagnosis = {voice: 'spoken_voice', issues: ['Synthetic stationary noise is present between the generated voiced sections.'], basis: 'synthetic_signal_fixture'};
voiceAudioPlan.steps = [
  {type: 'denoise', reason: 'The synthetic source includes stable low-level noise under speech.', noiseReductionDb: 8, noiseFloorDb: -50, residualFloorDb: -38},
  {type: 'highpass', reason: 'Remove only the synthetic low rumble below the voiced band.', frequencyHz: 80, poles: 2},
  {type: 'equalizer', reason: 'Test a restrained cut in the synthetic low-mid band.', frequencyHz: 240, gainDb: -2, widthQ: 1},
  {type: 'deesser', reason: 'Exercise the supported dynamic sibilance-control filter.', intensity: 0.25, maxDeessing: 0.4},
  {type: 'compressor', reason: 'Test gentle control of the generated voiced envelope peaks.', thresholdDb: -24, ratio: 2, attackMs: 15, releaseMs: 120, makeupDb: 0},
  {type: 'normalize', reason: 'Measure this test target and enforce the declared true-peak ceiling.', targetLufs: -24, maxTruePeakDbtp: -1.5, maxGainDb: 9},
];
await writeFile(audioPlanPath, `${JSON.stringify(voiceAudioPlan, null, 2)}\n`);
assert.equal(validateAudioPlan(voiceAudioPlan), true);
const schemaForAudio = JSON.parse(await readFile(resolve('.agents/skills/laohu-asrcut/schemas/asrcut.schema.json'), 'utf8'));
assert.ok(schemaForAudio.$defs.audioPlan.properties.steps.items.$ref.endsWith('/audioPlanStep'));
assert.equal(schemaForAudio.$defs.audioPlanStep.oneOf.every((branch) => branch.additionalProperties === false && branch.required.includes('reason')), true);
const missingStepReason = structuredClone(voiceAudioPlan);
delete missingStepReason.steps[0].reason;
assert.throws(() => validateAudioPlan(missingStepReason), /reason/);
const unknownStepParameter = structuredClone(voiceAudioPlan);
unknownStepParameter.steps[0].shell = 'not-accepted';
assert.throws(() => validateAudioPlan(unknownStepParameter), /unsupported fields: shell/);
const unknownPlanParameter = structuredClone(voiceAudioPlan);
unknownPlanParameter.unrecognizedControl = true;
assert.throws(() => validateAudioPlan(unknownPlanParameter), /unsupported fields: unrecognizedControl/);

const processedVoicePath = join(root, 'artifacts', 'voice-processed.wav');
const processedVoice = await processAudioPlan({planPath: audioPlanPath, outPath: processedVoicePath, tmpDir: join(root, 'tmp')});
assert.equal(processedVoice.receiptData.timing.latencyCalibration.status, 'passed');
assert.equal(processedVoice.receiptData.timing.latencyCalibration.offsetsSamples.length, 3);
assert.deepEqual(processedVoice.receiptData.timing.latencyCalibration.postCompensationOffsetsSamples, [0, 0, 0]);
assert.ok(processedVoice.receiptData.timing.latencyCalibration.confidence.every((value) => value.correlation >= 0.25));
assert.equal(processedVoice.receiptData.timing.exactSampleCountPreserved, true);
assert.equal(processedVoice.receiptData.processing.normalization.status, 'target-and-peak-verified');
assert.equal(processedVoice.receiptData.auditionStatus, 'not_auditioned');
assert.ok(Math.abs(processedVoice.receiptData.comparison.differenceLufs) <= 0.5);
assert.ok(processedVoice.receiptData.comparison.baseline.truePeakDbtp <= -0.9);
assert.ok(processedVoice.receiptData.comparison.matchedCopy.truePeakDbtp <= -0.9);
const processedShape = await inspectWavFile(processedVoicePath);
assert.deepEqual([processedShape.sampleRateHz, processedShape.sampleCount, processedShape.channels, processedShape.bitsPerSample], [voiceRate, 5 * voiceRate, 1, 32]);
const abBaselineShape = await inspectWavFile(`${processedVoicePath.slice(0, -4)}.ab-source.wav`);
const abMatchedShape = await inspectWavFile(`${processedVoicePath.slice(0, -4)}.ab-match.wav`);
assert.deepEqual([abBaselineShape.sampleRateHz, abBaselineShape.sampleCount, abBaselineShape.channels], [voiceRate, processedShape.sampleCount, 1]);
assert.deepEqual([abMatchedShape.sampleRateHz, abMatchedShape.sampleCount, abMatchedShape.channels], [voiceRate, processedShape.sampleCount, 1]);
const audioReviewHtml = await readFile(processedVoice.review, 'utf8');
assert.equal([...audioReviewHtml.matchAll(/<audio controls/g)].length, 2);
assert.match(audioReviewHtml, /我已经在相近播放响度下交替试听 A 和 B/);
assert.match(audioReviewHtml, /not_auditioned|人工听审/);

// Empty plans remain a measurable bypass; unsupported multi-stream audio is rejected rather than losing bed/system tracks.
const bypassPlanPath = join(root, 'bypass-audio-plan.json');
const bypassPlan = (await createAudioPlan({inputPath: voicePath, outPath: bypassPlanPath})).plan;
await writeFile(bypassPlanPath, `${JSON.stringify(bypassPlan, null, 2)}\n`);
const bypassResult = await processAudioPlan({planPath: bypassPlanPath, outPath: join(root, 'artifacts', 'voice-bypass.wav'), tmpDir: join(root, 'tmp')});
assert.equal(bypassResult.receiptData.processing.bypass, true);
assert.deepEqual(bypassResult.receiptData.timing.latencyCalibration.offsetsSamples, [0, 0, 0]);
const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
const multiStreamPath = join(root, 'voice-with-two-tracks.mka');
await execFileAsync(ffmpegPath, ['-nostdin', '-hide_banner', '-v', 'error', '-i', voicePath, '-i', voicePath, '-map', '0:a:0', '-map', '1:a:0', '-c:a', 'pcm_s16le', '-f', 'matroska', multiStreamPath]);
const multiStreamPlanPath = join(root, 'multi-stream-plan.json');
const multiStreamPlan = (await createAudioPlan({inputPath: multiStreamPath, outPath: multiStreamPlanPath})).plan;
await writeFile(multiStreamPlanPath, `${JSON.stringify(multiStreamPlan, null, 2)}\n`);
const multiStreamOutput = join(root, 'artifacts', 'must-not-drop-system-track.wav');
await assert.rejects(() => processAudioPlan({planPath: multiStreamPlanPath, outPath: multiStreamOutput, tmpDir: join(root, 'tmp')}), (error) => error.code === 'multiple-audio-streams');
await assert.rejects(() => stat(multiStreamOutput));
for (const suffix of ['.ab-source.wav', '.ab-match.wav', '.audio.json', '.review.html']) await assert.rejects(() => stat(join(root, 'artifacts', `must-not-drop-system-track${suffix}`)));

await assert.rejects(() => processAudioPlan({planPath: audioPlanPath, outPath: voicePath, tmpDir: join(root, 'tmp')}), (error) => ['output-exists', 'path-alias'].includes(error.code));
assert.equal(createHash('sha256').update(await readFile(voicePath)).digest('hex'), voiceSha, 'output alias rejection leaves the original source untouched');

// Clipping/normalization failures leave no deliverables and do not alter the original source.
const tooHotPlanPath = join(root, 'too-hot-audio-plan.json');
const tooHotPlan = structuredClone(bypassPlan);
tooHotPlan.steps = [{type: 'gain', reason: 'Stress the float peak guard with excessive gain.', gainDb: 12}];
await writeFile(tooHotPlanPath, `${JSON.stringify(tooHotPlan, null, 2)}\n`);
const tooHotOutput = join(root, 'artifacts', 'must-not-clip.wav');
await assert.rejects(() => processAudioPlan({planPath: tooHotPlanPath, outPath: tooHotOutput, tmpDir: join(root, 'tmp')}), (error) => error.code === 'processed-true-peak-over');
await assert.rejects(() => stat(tooHotOutput));
for (const suffix of ['.ab-source.wav', '.ab-match.wav', '.audio.json', '.review.html']) await assert.rejects(() => stat(join(root, 'artifacts', `must-not-clip${suffix}`)));
const impossibleNormalizePath = join(root, 'impossible-normalize-plan.json');
const impossibleNormalize = structuredClone(bypassPlan);
impossibleNormalize.steps = [
  {type: 'gain', reason: 'Raise the synthetic source before a deliberately impossible target.', gainDb: 6},
  {type: 'normalize', reason: 'Set an unreachable target/true-peak combination for rejection testing.', targetLufs: -14, maxTruePeakDbtp: -6, maxGainDb: 0.5},
];
await writeFile(impossibleNormalizePath, `${JSON.stringify(impossibleNormalize, null, 2)}\n`);
const impossibleNormalizeOutput = join(root, 'artifacts', 'must-not-claim-normalized.wav');
await assert.rejects(() => processAudioPlan({planPath: impossibleNormalizePath, outPath: impossibleNormalizeOutput, tmpDir: join(root, 'tmp')}), (error) => error.code === 'normalize-target-unmet');
await assert.rejects(() => stat(impossibleNormalizeOutput));
for (const suffix of ['.ab-source.wav', '.ab-match.wav', '.audio.json', '.review.html']) await assert.rejects(() => stat(join(root, 'artifacts', `must-not-claim-normalized${suffix}`)));
assert.equal(createHash('sha256').update(await readFile(voicePath)).digest('hex'), voiceSha);

// Bind continuous source repair to the existing edit-plan and verify that the compiler trims it only after treatment.
const sourceSpeechPlan = importAsrJson({segments: [
  {startMs: 300, endMs: 2400, text: '合成口播前段', words: [{startMs: 500, endMs: 2300, text: '合成口播前段'}]},
  {startMs: 2950, endMs: 4650, text: '合成口播后段', words: [{startMs: 3000, endMs: 4600, text: '合成口播后段'}]},
]}, {projectId: 'voice-treatment-test', sourceId: 'voice-source', sampleRateHz: voiceRate, sourceSampleRateHz: voiceRate, sourceDurationSamples: 5 * voiceRate, mediaPath: voicePath, mediaSha256: voiceSha, timeUnit: 'ms', authorization: {mediaExport: true}});
const voiceSourceId = sourceSpeechPlan.sources[0].id;
const voiceTokenIdsIn = (startSample, endSample) => sourceSpeechPlan.sources[0].transcript.segments.flatMap((segment) => segment.tokens
  .filter((token) => token.sourceRange && token.sourceRange.startSample >= startSample && token.sourceRange.endSample <= endSample).map((token) => token.id));
const voiceCoverage = [
  {id: 'voice-a', sourceId: voiceSourceId, sourceRange: {startSample: 0, endSample: 120000, sampleRateHz: voiceRate}, disposition: 'retain', decisionId: 'voice-a-decision', tokenIds: voiceTokenIdsIn(0, 120000)},
  {id: 'voice-gap', sourceId: voiceSourceId, sourceRange: {startSample: 120000, endSample: 140000, sampleRateHz: voiceRate}, disposition: 'delete', decisionId: 'voice-gap-decision', tokenIds: []},
  {id: 'voice-b', sourceId: voiceSourceId, sourceRange: {startSample: 140000, endSample: 240000, sampleRateHz: voiceRate}, disposition: 'retain', decisionId: 'voice-b-decision', tokenIds: voiceTokenIdsIn(140000, 240000)},
];
sourceSpeechPlan.coverage = voiceCoverage;
sourceSpeechPlan.decisions = voiceCoverage.map((coverage, index) => ({id: coverage.decisionId, action: coverage.disposition, reason: index === 1 ? 'Remove this controlled synthetic gap.' : `Retain ${coverage.id} from the continuous source.`, coverageIds: [coverage.id], sourceRanges: [{sourceId: voiceSourceId, sourceRange: coverage.sourceRange}], keptOccurrenceIds: coverage.disposition === 'retain' ? [`${coverage.id}-occ-0001`] : [], tokenIds: coverage.tokenIds}));
sourceSpeechPlan.sequence = voiceCoverage.filter((coverage) => coverage.disposition === 'retain').map((coverage) => ({occurrenceId: `${coverage.id}-occ-0001`, coverageId: coverage.id}));
sourceSpeechPlan.questions = [];
rehash(sourceSpeechPlan);
assert.equal(validatePlan(sourceSpeechPlan).errors.length, 0);
const frozenVoicePlan = freezePlan(sourceSpeechPlan);
const frozenVoiceTimeline = compilePlan(frozenVoicePlan);
assert.equal(frozenVoiceTimeline.durationSamples, 220000);
const frozenVoicePlanPath = join(root, 'voice-edit-plan.json');
const frozenVoiceTimelinePath = join(root, 'voice-timeline.json');
await writeFile(frozenVoicePlanPath, `${JSON.stringify(frozenVoicePlan, null, 2)}\n`);
await writeFile(frozenVoiceTimelinePath, `${JSON.stringify(frozenVoiceTimeline, null, 2)}\n`);
const treatedCutPath = join(root, 'artifacts', 'voice-cut-after-treatment.wav');
const treatedCut = await exportAudio({plan: frozenVoicePlan, timeline: frozenVoiceTimeline, outPath: treatedCutPath, tmpDir: join(root, 'tmp'), audioPlanPath, processedSourcePath: processedVoicePath, audioReceiptPath: processedVoice.receipt});
assert.equal(treatedCut.receiptData.sampleCount, 220000);
assert.equal(treatedCut.receiptData.audioTreatment.format, 'laohu.asrcut.source-treatment/1');
assert.equal(treatedCut.receiptData.audioTreatment.sourceId, voiceSourceId);
assert.equal(treatedCut.receiptData.audioTreatment.originalSourceSha256, voiceSha);
assert.equal(treatedCut.receiptData.audioTreatment.processedSourceSha256, processedVoice.receiptData.output.sha256);
assert.equal(treatedCut.receiptData.audioTreatment.renderedBeforeTimelineRanges, true);
assert.equal(treatedCut.receiptData.audioTreatment.timelineMapping, 'existing-compiled-source-ranges');
assert.match(treatedCut.receiptData.operation, /continuous source treatment/);
assert.equal(createHash('sha256').update(await readFile(voicePath)).digest('hex'), voiceSha);

// Compiled-timeline processing is limited to post-cut static gain/normalization and is bound to exact snapshots.
const rawCutPath = join(root, 'artifacts', 'voice-raw-cut.wav');
const rawCut = await exportAudio({plan: frozenVoicePlan, timeline: frozenVoiceTimeline, outPath: rawCutPath, tmpDir: join(root, 'tmp')});
const receiptSchemaVoice = schemaForAudio.$defs.audioArtifact.properties.audioTreatment;
assert.equal(receiptSchemaVoice.properties.originalSourceSha256.pattern, '^[a-f0-9]{64}$');
const compiledAudioPlanPath = join(root, 'compiled-audio-plan.json');
const compiledAudioPlan = (await createAudioPlan({inputPath: rawCutPath, outPath: compiledAudioPlanPath, mode: 'compiled-timeline', editPlanPath: frozenVoicePlanPath, timelinePath: frozenVoiceTimelinePath, receiptPath: rawCut.receipt})).plan;
compiledAudioPlan.steps = [{type: 'gain', reason: 'Balance the already-compiled whole-track playback level.', gainDb: -1}];
await writeFile(compiledAudioPlanPath, `${JSON.stringify(compiledAudioPlan, null, 2)}\n`);
assert.equal(validateAudioPlan(compiledAudioPlan), true);
const compiledProcessed = await processAudioPlan({planPath: compiledAudioPlanPath, outPath: join(root, 'artifacts', 'compiled-level-adjusted.wav'), tmpDir: join(root, 'tmp')});
assert.equal(compiledProcessed.receiptData.binding.kind, 'compiled-timeline');
const contextStepPlan = structuredClone(compiledAudioPlan);
contextStepPlan.steps = [{type: 'equalizer', reason: 'This EQ requires source context and must be rejected after cuts.', frequencyHz: 240, gainDb: -2}];
assert.throws(() => validateAudioPlan(contextStepPlan), (error) => error.code === 'context-required-step');

// Mutation injection proves audio-plan/edit-plan/timeline/receipt snapshots are rechecked before output publish.
const originalVoicePlanBytes = await readFile(frozenVoicePlanPath);
const originalVoiceTimelineBytes = await readFile(frozenVoiceTimelinePath);
const originalRawReceiptBytes = await readFile(rawCut.receipt);
const raceTargets = [
  ['audio-plan', null, null, /audio-plan or input audio changed during processing/],
  ['edit-plan', frozenVoicePlanPath, originalVoicePlanBytes, /Bound plan\/timeline\/receipt changed during processing/],
  ['timeline', frozenVoiceTimelinePath, originalVoiceTimelineBytes, /Bound plan\/timeline\/receipt changed during processing/],
  ['receipt', rawCut.receipt, originalRawReceiptBytes, /Bound plan\/timeline\/receipt changed during processing/],
];
for (const [label, targetPath, originalBytes, expectedError] of raceTargets) {
  const racePlanPath = join(root, `race-${label}-audio-plan.json`);
  const racePlan = (await createAudioPlan({inputPath: rawCutPath, outPath: racePlanPath, mode: 'compiled-timeline', editPlanPath: frozenVoicePlanPath, timelinePath: frozenVoiceTimelinePath, receiptPath: rawCut.receipt})).plan;
  racePlan.steps = [{type: 'gain', reason: 'Use a stable static level step for the race test.', gainDb: -1}];
  await writeFile(racePlanPath, `${JSON.stringify(racePlan, null, 2)}\n`);
  const mutationPath = label === 'audio-plan' ? racePlanPath : targetPath;
  const restoreBytes = label === 'audio-plan' ? await readFile(racePlanPath) : originalBytes;
  if (label !== 'audio-plan') await writeFile(mutationPath, restoreBytes);
  const markerPath = join(root, `race-${label}.marker`);
  const wrapperPath = join(root, `race-${label}-ffmpeg.mjs`);
  const wrapper = `#!/usr/bin/env node\nimport {appendFileSync, existsSync, writeFileSync} from 'node:fs';\nimport {spawnSync} from 'node:child_process';\nconst args = process.argv.slice(2);\nconst target = ${JSON.stringify(mutationPath)};\nconst marker = ${JSON.stringify(markerPath)};\nconst real = ${JSON.stringify(ffmpegPath)};\nif (!args.includes('-version') && !existsSync(marker)) { writeFileSync(marker, 'mutated'); appendFileSync(target, '\\n'); }\nconst result = spawnSync(real, args, {stdio: 'inherit'});\nprocess.exit(result.status ?? 1);\n`;
  await writeFile(wrapperPath, wrapper);
  await chmod(wrapperPath, 0o755);
  const raceOutput = join(root, 'artifacts', `race-${label}.wav`);
  await assert.rejects(() => processAudioPlan({planPath: racePlanPath, outPath: raceOutput, tmpDir: join(root, 'tmp'), ffmpegPath: wrapperPath}), expectedError);
  await assert.rejects(() => stat(raceOutput));
  await assert.rejects(() => stat(`${raceOutput}.audio.json`));
  await writeFile(mutationPath, restoreBytes);
  await rm(markerPath, {force: true});
}
assert.deepEqual((await readdir(join(root, 'tmp'))).filter((name) => name.startsWith('audio-postprocess-')), [], 'temporary render folders are removed after failure');

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

await import('./edit-ops.test.mjs');
await import('./media-tools.test.mjs');
