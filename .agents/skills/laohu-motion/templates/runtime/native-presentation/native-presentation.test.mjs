import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildChapterIndex} from './chapters.mjs';
import {createNativeCaptionTrack, DEFAULT_NATIVE_CAPTION_STYLE, NATIVE_CAPTION_PROFILE_IDS, resolveNativeCaptionProfile, verifyCaptionBinding, verifyNativeCaptionProfileReport} from './captions.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const stableValue = (value) => Array.isArray(value) ? value.map(stableValue)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])) : value;
const stableJson = (value) => JSON.stringify(stableValue(value));
const binding = {projectId: 'native-presentation-test', revision: 3, planSha256: '1'.repeat(64), timelineSha256: '2'.repeat(64)};

function seal(manifest) {
  delete manifest.integrity;
  manifest.integrity = {manifestSha256: digest(stableJson(manifest))};
  return manifest;
}

function makeManifest() {
  const lines = ['不是 3.14 米，而是 NVIDIA CUDA 12.4。'];
  const manifest = {
    format: 'laohu.asrcut.caption-manifest/2',
    project: {id: binding.projectId, revision: binding.revision},
    editPlan: {format: 'laohu.asrcut.edit-plan/1', planSha256: binding.planSha256},
    timeline: {format: 'laohu.asrcut.timeline/1', sha256: binding.timelineSha256},
    sourceClock: {sampleRateHz: 1000},
    sourceLanguage: 'zh-Hans',
    displayLanguages: ['zh-Hans', 'en'],
    cues: [{id: 'cue-1', lines, displayWindow: {startSample: 100, endSample: 900, sampleRateHz: 1000}, translations: [{
      language: 'en', lines: ['It is not 3.14 m; it is NVIDIA CUDA 12.4.'], sourceCueId: 'cue-1',
      sourceTextSha256: digest(stableJson(lines)), provenance: {origin: 'human-authored', status: 'reviewed', revision: 1},
    }]}],
  };
  return seal(manifest);
}

const manifest = makeManifest();
const expectedCaptionBinding = {...binding, manifestSha256: manifest.integrity.manifestSha256};
assert.deepEqual(await verifyCaptionBinding(manifest, expectedCaptionBinding), {...expectedCaptionBinding, sampleRateHz: 1000});
await assert.rejects(() => verifyCaptionBinding(manifest, {...expectedCaptionBinding, revision: 2}), {code: 'stale-caption-binding'});
const tamperedManifest = structuredClone(manifest);
tamperedManifest.cues[0].lines = ['是 3.14 米，而是 NVIDIA CUDA 12.4。'];
await assert.rejects(() => verifyCaptionBinding(tamperedManifest, expectedCaptionBinding), {code: 'invalid-caption-manifest-hash'});
const staleTranslation = makeManifest();
staleTranslation.cues[0].lines = ['是 3.14 米，而是 NVIDIA CUDA 12.4。'];
seal(staleTranslation);
await assert.rejects(() => verifyCaptionBinding(staleTranslation, {...binding, manifestSha256: staleTranslation.integrity.manifestSha256}), {code: 'stale-caption-translation'});
const missingLanguage = makeManifest();
missingLanguage.displayLanguages = ['zh-Hans', 'en', 'ja'];
seal(missingLanguage);
await assert.rejects(() => verifyCaptionBinding(missingLanguage, {...binding, manifestSha256: missingLanguage.integrity.manifestSha256}), {code: 'invalid-caption-translation'});
await assert.rejects(() => verifyCaptionBinding({...manifest, format: 'laohu.asrcut.caption-manifest/1'}, expectedCaptionBinding), {code: 'unsupported-caption-manifest'});

assert.deepEqual(NATIVE_CAPTION_PROFILE_IDS, ['native-16x9-outline-2_5', 'native-16x9-outline-3_0', 'native-16x9-outline-3_25', 'native-16x9-standard']);
const standardProfile = await resolveNativeCaptionProfile('native-16x9-standard', {width: 1920, height: 1080, displayLanguages: ['zh-CN', 'en']});
assert.equal(standardProfile.mode, 'locked');
assert.equal(standardProfile.style.fontFamily, 'Source Han Sans CN VF');
assert.equal(standardProfile.style.fontWeight, 700);
assert.equal(standardProfile.style.primarySizeAt1080, 48);
assert.equal(standardProfile.style.secondaryScale, 0.7);
assert.equal(standardProfile.style.outlineAt1080, 3.25);
assert.equal(standardProfile.style.secondaryOutlineScale, 0.7);
assert.equal(standardProfile.style.outlineAt1080 * standardProfile.style.secondaryOutlineScale, 2.275);
assert.deepEqual(standardProfile.style, {...DEFAULT_NATIVE_CAPTION_STYLE, outlineAt1080: 3.25, bottomSafeFraction: 0.0195});
assert.equal(standardProfile.style.backplate, null);
assert.equal(standardProfile.maxLinesPerLanguage['zh-CN'], 1);
assert.equal(standardProfile.maxLinesPerLanguage.en, 1);
const smallerStandardProfile = await resolveNativeCaptionProfile('native-16x9-standard', {width: 1280, height: 720, displayLanguages: ['zh-CN', 'en']});
assert.deepEqual(smallerStandardProfile, standardProfile);
await assert.rejects(() => resolveNativeCaptionProfile('native-16x9-standard', {width: 1920, height: 1200, displayLanguages: ['zh-CN', 'en']}), {code: 'caption-profile-aspect-mismatch'});
const standardProfileReport = {id: standardProfile.id, mode: standardProfile.mode, aspectRatio: standardProfile.aspectRatio,
  maxLinesPerLanguage: standardProfile.maxLinesPerLanguage, values: standardProfile.style,
  integritySha256: standardProfile.integrity.sha256};
assert.equal((await verifyNativeCaptionProfileReport(standardProfileReport, {width: 1920, height: 1080, displayLanguages: ['zh-CN', 'en']})).id, 'native-16x9-standard');
const changedStandardReport = structuredClone(standardProfileReport);
changedStandardReport.values.bottomSafeFraction = 0.05;
await assert.rejects(() => verifyNativeCaptionProfileReport(changedStandardReport, {width: 1920, height: 1080, displayLanguages: ['zh-CN', 'en']}), {code: 'caption-profile-report-mismatch'});
const candidateId = NATIVE_CAPTION_PROFILE_IDS[0];
const candidateCaptionProfile = await resolveNativeCaptionProfile(candidateId, {width: 1920, height: 1080, displayLanguages: manifest.displayLanguages, calibrationMode: true});
assert.equal(candidateCaptionProfile.mode, 'calibration-candidate');
assert.equal(candidateCaptionProfile.style.outlineAt1080, 2.5);
assert.equal(candidateCaptionProfile.style.bottomSafeFraction, 0.072);
assert.equal(DEFAULT_NATIVE_CAPTION_STYLE.bottomSafeFraction, 0.072);
assert.equal(candidateCaptionProfile.maxLinesPerLanguage.en, 1);
await assert.rejects(() => resolveNativeCaptionProfile(candidateId, {width: 1920, height: 1200, displayLanguages: manifest.displayLanguages, calibrationMode: true}), {code: 'caption-profile-aspect-mismatch'});
await assert.rejects(() => resolveNativeCaptionProfile(candidateId, {width: 1920, height: 1080, displayLanguages: manifest.displayLanguages}), {code: 'caption-profile-not-locked'});
await assert.rejects(() => resolveNativeCaptionProfile('project-invented-style', {width: 1920, height: 1080, displayLanguages: manifest.displayLanguages, calibrationMode: true}), {code: 'unknown-caption-profile'});
const profileReport = {id: candidateCaptionProfile.id, mode: candidateCaptionProfile.mode, aspectRatio: candidateCaptionProfile.aspectRatio,
  maxLinesPerLanguage: candidateCaptionProfile.maxLinesPerLanguage, values: candidateCaptionProfile.style,
  integritySha256: candidateCaptionProfile.integrity.sha256};
assert.equal((await verifyNativeCaptionProfileReport(profileReport, {width: 1920, height: 1080, displayLanguages: manifest.displayLanguages, calibrationMode: true})).id, candidateId);
const tamperedProfileReport = structuredClone(profileReport);
tamperedProfileReport.values.outlineAt1080 = 3.25;
await assert.rejects(() => verifyNativeCaptionProfileReport(tamperedProfileReport, {width: 1920, height: 1080, displayLanguages: manifest.displayLanguages, calibrationMode: true}), {code: 'caption-profile-report-mismatch'});

const fakeCaptionHost = {ownerDocument: {}, clientWidth: 1920, clientHeight: 1080};
const briefSha256 = 'a'.repeat(64);
let registeredProfile = null;
const captionRuntime = {calibrationProbe: false, assertBriefSha256(value) { assert.equal(value, briefSha256); },
  validateCaptionManifest() {}, recordCaptionProfile(value) { registeredProfile = value; }, caption() {}};
const captionOptions = {element: fakeCaptionHost, manifest, expectedBinding: expectedCaptionBinding, width: 1920, height: 1080,
  textRuntime: captionRuntime, captionContext: () => ({direction: 'main', scene: 'intro', object: 'subtitle'}), expectedBriefSha256: briefSha256};
await assert.rejects(() => createNativeCaptionTrack(captionOptions), {code: 'caption-profile-required'});
await assert.rejects(() => createNativeCaptionTrack({...captionOptions, profileId: candidateId, style: {primarySizeAt1080: 60}}), {code: 'caption-profile-overrides-forbidden'});
await assert.rejects(() => createNativeCaptionTrack({...captionOptions, profileId: candidateId}), {code: 'caption-profile-not-locked'});
const probeCaptionRuntime = {...captionRuntime, calibrationProbe: true};
await assert.rejects(() => createNativeCaptionTrack({...captionOptions, textRuntime: probeCaptionRuntime, profileId: candidateId}), {code: 'font-api-unavailable'});
assert.equal(registeredProfile.id, candidateId, 'the actual caption helper registers the shared profile it consumed');
assert.equal(registeredProfile.mode, 'calibration-candidate', 'a candidate is accepted only in the explicit probe runtime');

const chapterBinding = {...binding};
const chapterTimeline = {
  durationSeconds: 12,
  binding: chapterBinding,
  events: [
    {id: 'open', t0: 0, t1: 4},
    {id: 'explain', t0: 4, t1: 8.5},
    {id: 'close', t0: 8.5, t1: 12},
  ],
};
const chapterMetadata = [
  {id: 'opening', title: 'Opening', startEventId: 'open', endEventId: 'open'},
  {id: 'explanation', title: 'Explanation', startEventId: 'explain', endEventId: 'explain'},
  {id: 'ending', title: 'Ending', startEventId: 'close', endEventId: 'close'},
];
let seekedTo = null;
const chapters = buildChapterIndex({timeline: chapterTimeline, chapters: chapterMetadata, binding: chapterBinding,
  expectedBinding: chapterBinding, seek: (seconds) => { seekedTo = seconds; }});
assert.deepEqual(chapters.chapters.map(({id, startSec, endSec, timecode}) => [id, startSec, endSec, timecode]), [
  ['opening', 0, 4, '00:00:00.000'],
  ['explanation', 4, 8.5, '00:00:04.000'],
  ['ending', 8.5, 12, '00:00:08.500'],
]);
assert.equal(chapters.at(4.5)?.id, 'explanation');
assert.equal(chapters.at(8.5)?.id, 'ending');
assert.equal(chapters.at(12), null);
assert.equal(chapters.jumpTo('explanation').startSec, 4);
assert.equal(seekedTo, 4, 'jumpTo invokes the real seek callback at the current event-derived time');
assert.throws(() => buildChapterIndex({timeline: chapterTimeline, chapters: chapterMetadata, binding: chapterBinding,
  expectedBinding: {...chapterBinding, timelineSha256: '9'.repeat(64)}}), {code: 'stale-chapter-binding'});
assert.throws(() => buildChapterIndex({timeline: chapterTimeline,
  chapters: [{...chapterMetadata[0], startEventId: 'old-event'}], binding: chapterBinding, expectedBinding: chapterBinding}), {code: 'stale-chapter-event'});
assert.throws(() => chapters.jumpTo('missing'), {code: 'unknown-chapter'});

console.log('native-presentation checks passed: caption binding/staleness, shared profile IDs and values, aspect ratio, calibration gate, Brief binding, legacy style API, event index and seek hook');
