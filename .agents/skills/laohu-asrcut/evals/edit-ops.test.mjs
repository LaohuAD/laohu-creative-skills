import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {access, link, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyEdits, authorizeReview, compileAnimationHandoff, compilePlan, exportAudio, freezePlan, hashPlan, importAsrJson, importSrt,
  insertPresentationInterval, mergePlans, upsertAnnotation, validatePlan, verifyAnimationHandoff} from '../scripts/asrcut.mjs';
import {inspectWavFile} from '../scripts/audio-postprocess.mjs';
import {probeSilence} from '../scripts/audio-probe.mjs';
import {resolveAnchor, validateTimeline} from '../../laohu-motion/scripts/bind-speech.mjs';
import {validatePlanFile} from '../../laohu-motion/scripts/production-plan.mjs';

const rate = 48000;
const sourceId = 'source-a';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const cache = join(repoRoot, '.cache/tmp/asrcut-edit-ops-evals');
await mkdir(cache, {recursive: true});
const root = await mkdtemp(join(cache, 'checks-'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const samples = (seconds) => Math.round(seconds * rate);
const range = (start, end) => ({startSample: samples(start), endSample: samples(end), sampleRateHz: rate});
const raised = (sample) => [[.15, .60], [.88, 1.18], [2.13, 2.48], [2.55, 2.80]].some(([start, end]) => sample >= samples(start) && sample < samples(end));
const frequency = 400;

function writeSyntheticWave(isSpeech = raised, durationSec = 3.2) {
  const length = samples(durationSec);
  const data = Buffer.alloc(44 + length * 2);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(length * 2, 40);
  for (let index = 0; index < length; index += 1) {
    const amplitude = isSpeech(index) ? 8000 : 150;
    data.writeInt16LE(Math.round(amplitude * Math.sin(2 * Math.PI * frequency * (index + 5) / rate)), 44 + index * 2);
  }
  return data;
}

const ops = (plan, operations, extra = {}) => ({format: 'laohu.asrcut.edit-ops/1', expectedRevision: plan.project.revision,
  expectedPlanSha256: hashPlan(plan), operations, ...extra});
const checkError = (code) => (error) => error.code === code;
const writeJson = async (name, value) => { const file = join(root, name); await writeFile(file, jsonBytes(value)); return file; };
const cli = (args) => spawnSync(process.execPath, [resolve(here, '../scripts/asrcut.mjs'), ...args], {cwd: repoRoot, env: {...process.env, TMPDIR: root}, encoding: 'utf8'});
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;

async function pauseFixture(kind, milliseconds, {interference = false} = {}) {
  const leftEnd = .52;
  const rightStart = leftEnd + milliseconds / 1000;
  const sourceRange = range(leftEnd, rightStart);
  const speech = (sample) => (sample >= samples(.16) && sample < samples(leftEnd - .035))
    || (sample >= samples(rightStart + .035) && sample < samples(rightStart + .28))
    || (interference && sample >= samples(.82) && sample < samples(.84));
  const waveform = writeSyntheticWave(speech, 2.6);
  const mediaPath = `${kind}-${milliseconds}${interference ? '-interference' : ''}.wav`;
  await writeFile(join(root, mediaPath), waveform);
  const plan = importAsrJson({segments: [
    {start: .15, end: leftEnd, text: '先确认对象', words: [{start: .15, end: leftEnd, text: '先确认对象'}]},
    {start: rightStart, end: rightStart + .3, text: '再看操作', words: [{start: rightStart, end: rightStart + .3, text: '再看操作'}]},
  ]}, {projectId: `${kind}-${milliseconds}-fixture`, sourceId, sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: samples(2.6),
    mediaPath, mediaSha256: sha256(waveform), timeUnit: 'seconds', authorization: {mediaExport: true}});
  const silenceMap = await probeSilence({inputPath: join(root, mediaPath), plan, sourceId, baseDir: root});
  const edit = (removeMs, at = leftEnd + .11) => ({id: 'trim-measured-window', op: 'trim-pause', sourceId, sourceRange: range(at, at + removeMs / 1000),
    pauseRange: sourceRange, pauseKind: kind, reason: 'Shorten the measured empty space between the complete utterances'});
  return {plan, edit, mediaSha256: plan.sources[0].sha256, options: {baseDir: root, silenceMap}};
}

async function verifyPacingWindows() {
  for (const [kind, minimum, maximum] of [['clause', 350, 480], ['sentence', 450, 650], ['paragraph', 600, 850]]) {
    for (const milliseconds of [minimum, maximum]) {
      const {plan, edit, options} = await pauseFixture(kind, milliseconds);
      await assert.rejects(applyEdits(plan, ops(plan, [edit(50)]), options), (error) =>
        ['micro-pause-protected', 'pause-window-protected'].includes(error.code) && (error.code === 'micro-pause-protected' || error.details.originalDurationMs === milliseconds));
    }
    const {plan, edit, options} = await pauseFixture(kind, maximum + 100);
    const withinBand = edit(maximum + 100 - minimum - 20);
    const trimmed = await applyEdits(plan, ops(plan, [withinBand]), options);
    assert.equal(compilePlan(trimmed).durationSamples, plan.sources[0].durationSamples - (withinBand.sourceRange.endSample - withinBand.sourceRange.startSample));
    const overshoot = edit(maximum + 100 - minimum + 1);
    await assert.rejects(applyEdits(plan, ops(plan, [overshoot]), options), checkError('pause-window-overshoot'));
  }

  const short = await pauseFixture('sentence', 420);
  await assert.rejects(applyEdits(short.plan, ops(short.plan, [short.edit(30)]), short.options), checkError('pause-window-protected'));
  const standard = await pauseFixture('sentence', 630);
  const previousCut = standard.edit(108);
  await assert.rejects(applyEdits(standard.plan, ops(standard.plan, [{...previousCut, pauseRange: previousCut.sourceRange,
    reason: 'try a generic edit approval or a shorter declaration'}]), standard.options), (error) =>
    error.code === 'pause-window-protected' && error.details.originalDurationMs === 630 && error.details.proposedDurationMs === 522);
  const compact = await applyEdits(standard.plan, ops(standard.plan, [], {pacingProfile: 'compact'}));
  const compactPlan = await applyEdits(compact, ops(compact, [standard.edit(205)]), standard.options);
  assert.equal(compactPlan.pacingProfile, 'compact');
  assert.equal(compilePlan(compactPlan).durationSamples, samples(2.6) - samples(.205));
  const natural = await pauseFixture('sentence', 980);
  await assert.rejects(applyEdits(natural.plan, ops(natural.plan, [natural.edit(200)], {pacingProfile: 'natural'}), natural.options), checkError('pause-window-protected'));
  const naturalLong = await pauseFixture('sentence', 1100);
  const naturalPlan = await applyEdits(naturalLong.plan, ops(naturalLong.plan, [naturalLong.edit(380)], {pacingProfile: 'natural'}), naturalLong.options);
  assert.equal(compilePlan(naturalPlan).durationSamples, samples(2.6) - samples(.38));

  const interfered = await pauseFixture('sentence', 630, {interference: true});
  const aroundPulse = interfered.edit(190, .73);
  await assert.rejects(applyEdits(interfered.plan, ops(interfered.plan, [aroundPulse]), interfered.options), checkError('pause-cut-outside-probe'));
  const evidence = {method: 'audio-listening', listeningStatus: 'listened', sourceSha256: interfered.mediaSha256, sourceRange: aroundPulse.sourceRange,
    reviewedBy: 'synthetic attestation fixture', finding: 'The generated 20ms signal pulse interrupts the quiet gap'};
  const cleared = await applyEdits(interfered.plan, ops(interfered.plan, [{...aroundPulse, verification: evidence}]), interfered.options);
  assert.deepEqual(cleared.decisions.at(-1).pauseVerification, evidence);
  await assert.rejects(applyEdits(interfered.plan, ops(interfered.plan, [{...aroundPulse, verification: {...evidence, sourceRange: range(.72, .92)}}]), interfered.options), checkError('invalid-pause-verification'));

  const userNote = {id: 'local-pause-direction', sourceId, segmentId: standard.plan.sources[0].transcript.segments[0].id,
    userNote: '这一次停顿想紧一点，给画面留 0.42 秒就够了。'};
  const directed = upsertAnnotation(standard.plan, userNote);
  const requestedCut = standard.edit(210);
  const direction = {method: 'user-direction', userNoteId: userNote.id, excerpt: userNote.userNote, sourceSha256: standard.mediaSha256,
    sourceRange: requestedCut.pauseRange, targetDurationSamples: samples(.42)};
  const directedPlan = await applyEdits(directed, ops(directed, [{...requestedCut, verification: direction}]), standard.options);
  assert.equal(compilePlan(directedPlan).durationSamples, samples(2.6) - samples(.21));
  await assert.rejects(applyEdits(directed, ops(directed, [{...requestedCut, verification: {...direction, excerpt: 'invented directive'}}]), standard.options), checkError('invalid-pause-verification'));
}

try {
  await verifyPacingWindows();
  const source = writeSyntheticWave();
  const sourcePath = join(root, 'source.wav');
  await writeFile(sourcePath, source);
  const asr = {
    segments: [
      {start: .15, end: .60, text: '看这里，示例。', words: [{start: .15, end: .24, text: '看'}, {start: .24, end: .40, text: '这里'}, {start: .42, end: .60, text: '示例'}]},
      {start: .88, end: 1.18, text: '先布局，', words: [{start: .88, end: 1.18, text: '先布局'}]},
      {start: 2.13, end: 2.48, text: '第一步。', words: [{start: 2.13, end: 2.25, text: '第一'}, {start: 2.25, end: 2.48, text: '步'}]},
      {start: 2.55, end: 2.80, text: '收尾。', words: [{start: 2.55, end: 2.80, text: '收尾'}]},
    ],
  };
  const plan = importAsrJson(asr, {projectId: 'edit-ops-test', sourceId, sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: samples(3.2),
    mediaPath: 'source.wav', mediaSha256: sha256(source), timeUnit: 'seconds', authorization: {mediaExport: true, repeat: true, reorder: true}});
  const originalPlanBytes = jsonBytes(plan);
  const [segment1, segment2, segment3] = plan.sources[0].transcript.segments;
  const originalOccurrenceId = plan.sequence[0].occurrenceId;
  const map = await probeSilence({inputPath: sourcePath, plan, sourceId, baseDir: root});
  const trim = {id: 'trim-long-gap', op: 'trim-pause', sourceId, sourceRange: range(1.50, 1.85), pauseRange: range(1.18, 2.13), pauseKind: 'sentence',
    reason: 'The first instruction ends before the demonstration begins', visualSeamRisk: 'jump-cut', visualMaskHint: 'Cover the actual join with the demonstration card'};
  await assert.rejects(applyEdits(plan, ops(plan, [{id: 'micro', op: 'delete-range', sourceId, sourceRange: range(.65, .75), reason: 'too fast'}])), checkError('micro-pause-protected'));
  const tailCrop = {id: 'real-program-tail', op: 'delete-range', sourceId, sourceRange: range(.79, 3.2), reason: 'The program ends after the complete first utterance'};
  const headCrop = {id: 'real-program-head', op: 'delete-range', sourceId, sourceRange: range(0, .70), reason: 'The program starts before the complete second utterance'};
  await assert.rejects(applyEdits(plan, ops(plan, [tailCrop])), checkError('program-edge-probe-required'));
  const croppedTail = await applyEdits(plan, ops(plan, [tailCrop]), {baseDir: root, silenceMap: map});
  assert.equal(compilePlan(croppedTail).clips[0].sourceRange.endSample, samples(.79));
  const croppedHead = await applyEdits(plan, ops(plan, [headCrop]), {baseDir: root, silenceMap: map});
  assert.equal(compilePlan(croppedHead).clips[0].sourceRange.startSample, samples(.70));
  const anotherSource = importAsrJson(asr, {projectId: plan.project.id, sourceId: 'source-b', sampleRateHz: rate, sourceSampleRateHz: rate,
    sourceDurationSamples: samples(3.2), mediaPath: 'source.wav', mediaSha256: sha256(source), timeUnit: 'seconds'});
  const twoSources = mergePlans([plan, anotherSource], {sourceOrder: [sourceId, 'source-b']});
  await assert.rejects(applyEdits(twoSources, ops(twoSources, [tailCrop]), {baseDir: root, silenceMap: map}), checkError('micro-pause-protected'));
  const lockedEdge = await applyEdits(plan, ops(plan, [], {pauseWindows: [{id: 'locked-tail', sourceId, sourceRange: range(.8, .84),
    pauseKind: 'micro', function: 'user-locked', reason: 'User has locked this original gap'}]}));
  await assert.rejects(applyEdits(lockedEdge, ops(lockedEdge, [tailCrop]), {baseDir: root, silenceMap: map}), checkError('functional-pause-protected'));
  await assert.rejects(applyEdits(plan, ops(plan, [{id: 'clipped-word', op: 'delete-range', sourceId, sourceRange: range(.37, .60), reason: 'test'}])), checkError('cut-through-word'));
  await assert.rejects(applyEdits(plan, ops(plan, [trim])), checkError('pause-probe-required'));
  await assert.rejects(applyEdits(plan, ops(plan, [{id: 'proof-bypass', op: 'delete-range', sourceId, sourceRange: trim.sourceRange, reason: 'test'}])), checkError('pause-operation-required'));
  const srt = importSrt('1\n00:00:00,150 --> 00:00:01,180\n逗号在这里，仍是一个语段。\n', {projectId: 'srt-test', sourceId});
  await assert.rejects(applyEdits(srt, ops(srt, [{id: 'srt-internal', op: 'delete-range', sourceId, sourceRange: range(.55, .75), reason: 'test'}])), checkError('cut-through-utterance'));
  const protectedPlan = await applyEdits(plan, ops(plan, [], {pauseWindows: [{id: 'lock', sourceId, sourceRange: range(1.2, 2), pauseKind: 'paragraph', function: 'visual-action', reason: 'This interval shows an intentional UI operation'}]}));
  await assert.rejects(applyEdits(protectedPlan, ops(protectedPlan, [trim], {pauseWindows: []}), {baseDir: root, silenceMap: map}), checkError('functional-pause-protected'));
  await assert.rejects(applyEdits(protectedPlan, ops(protectedPlan, [trim]), {baseDir: root, silenceMap: map}), checkError('functional-pause-protected'));
  const {probeSha256: unused, ...forgedData} = structuredClone(map);
  forgedData.silences[0].meanRmsDb -= 1;
  const forgedMap = {...forgedData, probeSha256: sha256(JSON.stringify(canonical(forgedData)))};
  await assert.rejects(applyEdits(plan, ops(plan, [trim]), {baseDir: root, silenceMap: forgedMap}), checkError('silence-map-acoustics-stale'));

  const candidate = {id: 'speech-fixture', op: 'spoken-correction', sourceId, segmentId: segment2.id, spokenText: '清楚布局'};
  const display = {id: 'screen-fixture', op: 'set-display-text', segmentId: segment1.id, text: '屏显示例', tokenIds: [segment1.tokens[0].id]};
  const approved = authorizeReview(freezePlan(plan), 'approved', hashPlan(plan));
  const edited = await applyEdits(approved, ops(approved, [trim, candidate, display], {pacingProfile: 'standard-narration',
    narrativeBeats: [{id: 'takeaway', sourceId, segmentIds: [segment1.id, segment2.id], role: '引入操作示例'}]}), {baseDir: root, silenceMap: map});
  assert.equal(edited.project.revision, 2);
  assert.equal(edited.state, 'draft');
  assert.deepEqual(edited.review, {status: 'not_requested', approvedPlanSha256: null});
  assert.notEqual(hashPlan(plan), hashPlan(edited));
  assert.deepEqual(edited.sources, plan.sources);
  assert.ok(originalPlanBytes.equals(jsonBytes(plan)));
  assert.deepEqual(edited.coverage.map(({sourceRange, disposition}) => [sourceRange, disposition]), [[range(0, 1.50), 'retain'], [range(1.50, 1.85), 'delete'], [range(1.85, 3.20), 'retain']]);
  assert.deepEqual(edited.coverage.flatMap((row) => row.tokenIds), plan.coverage[0].tokenIds);
  assert.equal(edited.displayText[0].text, '屏显示例');
  assert.equal(edited.spokenCorrections[0].status, 'candidate');
  assert.equal(compilePlan(edited).clips[0].transcriptSegments.find((row) => row.segmentId === segment2.id).spokenText, undefined);
  assert.equal(edited.decisions.find((row) => row.id === trim.id).visualSeamRisk, 'jump-cut');
  await assert.rejects(applyEdits(edited, ops(plan, [candidate])), checkError('edit-ops-stale'));
  await assert.rejects(applyEdits(edited, ops(edited, [{...candidate, status: 'confirmed', verification: {method: 'audio-listening', listeningStatus: 'listened', sourceRange: range(.88, 1.18)}}]), {baseDir: root}), checkError('spoken-listening-evidence-required'));
  const confirmed = await applyEdits(edited, ops(edited, [{...candidate, status: 'confirmed', verification: {method: 'audio-listening', listeningStatus: 'listened',
    sourceRange: range(.88, 1.18), reviewedBy: 'synthetic test attestation', sourceSha256: plan.sources[0].sha256}}]), {baseDir: root});
  assert.equal(compilePlan(confirmed).clips[0].transcriptSegments.find((row) => row.segmentId === segment2.id).spokenText, candidate.spokenText);

  const repeatedDeletion = {id: 'remove-duplicate', op: 'delete-range', sourceId, sourceRange: range(2.13, 2.48), reason: 'Keep the earlier full instance',
    relation: 'repeated-content', keptOccurrenceIds: [originalOccurrenceId], keptTokenIds: [segment1.tokens[0].id]};
  const removed = await applyEdits(plan, ops(plan, [repeatedDeletion]));
  assert.deepEqual(removed.decisions.at(-1).keptOccurrenceIds, [originalOccurrenceId]);
  await assert.rejects(applyEdits(plan, ops(plan, [{...repeatedDeletion, keptTokenIds: [segment3.tokens[0].id]}])), checkError('edit-kept-occurrence-stale'));
  const restored = await applyEdits(removed, ops(removed, [{id: 'restore-duplicate', op: 'delete-range', sourceId, sourceRange: repeatedDeletion.sourceRange, reason: 'Restore the full explanation',
    restore: true, revertedFromDecisionId: repeatedDeletion.id}]));
  assert.equal(compilePlan(restored).durationSamples, samples(3.2));
  assert.equal(compilePlan(restored).deletions.length, 0);
  assert.equal(restored.decisions.find((row) => row.id === repeatedDeletion.id).reason, repeatedDeletion.reason);
  assert.equal(restored.decisions.at(-1).revertedFromDecisionId, repeatedDeletion.id);
  const changedAfterRestore = await applyEdits(restored, ops(restored, [{id: 'delete-restored-word', op: 'delete-range', sourceId, sourceRange: range(2.13, 2.25), reason: 'Remove one complete token from the restored take'}]));
  assert.deepEqual(changedAfterRestore.decisions.find((row) => row.id === repeatedDeletion.id).sourceRanges, [{sourceId, sourceRange: repeatedDeletion.sourceRange}]);
  const unauthorised = structuredClone(edited);
  unauthorised.authorization.reorder = unauthorised.authorization.repeat = false;
  unauthorised.integrity.planSha256 = hashPlan(unauthorised);
  const repeat = {id: 'repeat-for-mapping', op: 'repeat', occurrenceId: originalOccurrenceId, newOccurrenceId: 'cue-repeated', reason: 'Replay the earlier example for a comparison'};
  const reorder = {id: 'swap-example', op: 'reorder', occurrenceIds: edited.sequence.map((row) => row.occurrenceId).reverse(), reason: 'Present the shorter demonstration first'};
  await assert.rejects(applyEdits(unauthorised, ops(unauthorised, [repeat])), checkError('edit-repeat-not-authorized'));
  await assert.rejects(applyEdits(unauthorised, ops(unauthorised, [reorder])), checkError('edit-reorder-not-authorized'));
  const reordered = await applyEdits(edited, ops(edited, [reorder]));
  assert.deepEqual(reordered.sequence.map((row) => row.occurrenceId), reorder.occurrenceIds);

  const presentation = (input, position) => ({id: `show-${position}`, decisionId: `visual-${position}`, position,
    reason: 'Viewer can read the demonstration card', sceneId: `scene-${position}`, durationSamples: samples(.2),
    visualHandoff: {focus: 'Read the card', entryState: 'Card appears', exitCondition: 'Viewer sees the main term'},
    audioHandoff: {role: 'quiet', rationale: 'Music may continue after the voice stop'}, expectedRevision: input.project.revision, expectedPlanSha256: hashPlan(input)});
  let presentationPlan = insertPresentationInterval(edited, presentation(edited, 'before-first'), {authorized: true});
  assert.throws(() => insertPresentationInterval(edited, {...presentation(edited, 'before-first'), afterOccurrenceId: originalOccurrenceId}, {authorized: true}), checkError('invalid-presentation-spec'));
  presentationPlan = freezePlan(insertPresentationInterval(presentationPlan, presentation(presentationPlan, 'after-last'), {authorized: true}));
  const timeline = compilePlan(presentationPlan);
  assert.deepEqual(timeline.units.map((row) => row.kind), ['presentation', 'source', 'source', 'presentation']);
  assert.deepEqual(timeline.units.map((row) => row.targetRange.startSample), [0, samples(.2), samples(1.7), samples(3.05)]);
  const timelineIndex = validateTimeline(timeline);
  const headAnchor = resolveAnchor({kind: 'presentation', presentationId: timeline.units[0].id, edge: 'start'}, timelineIndex);
  const tailAnchor = resolveAnchor({kind: 'presentation', presentationId: timeline.units.at(-1).id, edge: 'end'}, timelineIndex);
  assert.deepEqual(headAnchor.tokenIds, []);
  assert.deepEqual(tailAnchor.tokenIds, []);
  assert.equal(headAnchor.targetSample, 0);
  assert.equal(tailAnchor.targetSample, timeline.durationSamples);
  const presentationWithoutSource = structuredClone(presentationPlan);
  presentationWithoutSource.sequence = presentationWithoutSource.sequence.filter((row) => row.kind === 'presentation');
  presentationWithoutSource.integrity.planSha256 = hashPlan(presentationWithoutSource);
  assert.ok(validatePlan(presentationWithoutSource).errors.some((error) => error.includes('at least one retained real source occurrence')));

  const planPath = await writeJson('frozen-plan.json', presentationPlan);
  const timelinePath = await writeJson('timeline.json', timeline);
  const mapPath = await writeJson('silence-map.json', map);
  const handoffPath = join(root, 'handoff.json');
  const handoffResult = cli(['export-handoff', '--plan', planPath, '--timeline', timelinePath, '--silence-map', mapPath, '--out', handoffPath]);
  assert.equal(handoffResult.status, 0, handoffResult.stderr);
  const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
  const timelineBytes = await readFile(timelinePath);
  assert.ok(timelineBytes.equals(jsonBytes(timeline)));
  assert.equal(handoff.timelineSha256, sha256(timelineBytes));
  assert.equal(handoff.planSha256, hashPlan(presentationPlan));
  assert.equal(handoff.silenceProbe.probeSha256, map.probeSha256);
  assert.equal(handoff.narrativeBeats[0].role, '引入操作示例');
  assert.deepEqual(handoff.narrativeBeats[0].segmentIds, [segment1.id, segment2.id]);
  assert.equal(handoff.availablePauseWindows.length, 1);
  assert.equal(handoff.availablePauseWindows[0].durationSec, .60);
  assert.equal(handoff.availablePauseWindows[0].sourceParts.length, 2);
  assert.deepEqual(handoff.visualCueCandidates.map((row) => row.text), ['看这里', '第一步']);
  assert.deepEqual(handoff.visualCueCandidates[0].targetRange, timeline.clips[0].words[0].targetRange);
  assert.equal(handoff.visualSeamRisks[1].risk, 'jump-cut');
  assert.equal(handoff.visualSeamRisks[1].visualMaskHint, trim.visualMaskHint);
  const noProbe = await compileAnimationHandoff({plan: presentationPlan, timelineBytes, baseDir: root});
  assert.deepEqual(noProbe.availablePauseWindows, []);
  const repeated = freezePlan(await applyEdits(presentationPlan, ops(presentationPlan, [repeat])));
  const repeatedTimeline = compilePlan(repeated);
  const repeatHandoff = await compileAnimationHandoff({plan: repeated, timelineBytes: jsonBytes(repeatedTimeline), baseDir: root});
  const sameCue = repeatHandoff.visualCueCandidates.filter((row) => row.text === '看这里');
  assert.equal(sameCue.length, 2);
  assert.equal(sameCue[0].tokenId, sameCue[1].tokenId);
  assert.notEqual(sameCue[0].occurrenceId, sameCue[1].occurrenceId);
  assert.notDeepEqual(sameCue[0].targetRange, sameCue[1].targetRange);
  await assert.rejects(verifyAnimationHandoff(handoff, {plan: repeated, timelineBytes: jsonBytes(repeatedTimeline), baseDir: root}), checkError('animation-handoff-stale'));

  const fileRef = async (file) => ({path: file, sha256: sha256(await readFile(file))});
  const motionPlan = {format: 'laohu.motion.production-plan/4', work: {id: 'motion-inputs', title: '首尾展示与停顿', directionMode: 'technical-probe'},
    inputs: {sourceMaterials: [{id: 'spoken-input', kind: 'source', role: 'Narration evidence', ...await fileRef(sourcePath)}],
      asrcut: {timeline: await fileRef(timelinePath), editPlan: await fileRef(planPath), animationHandoff: await fileRef(handoffPath), silenceMap: await fileRef(mapPath)}}};
  const motionPath = await writeJson('motion-plan.json', motionPlan);
  const motionReady = await validatePlanFile(motionPath, {stage: 'inputs'});
  assert.deepEqual(motionReady.asrcutHandoff.animationHandoff.availablePauseWindows, handoff.availablePauseWindows);
  assert.equal(motionReady.asrcutHandoff.timeline.units.at(-1).kind, 'presentation');
  const motionCli = spawnSync(process.execPath, [resolve(here, '../../laohu-motion/scripts/production-plan.mjs'), 'validate', '--plan', motionPath, '--stage', 'inputs'],
    {env: {...process.env, TMPDIR: root}, encoding: 'utf8'});
  assert.equal(motionCli.status, 0, motionCli.stderr);
  assert.deepEqual(JSON.parse(motionCli.stdout).animationHandoff.visualCueCandidates, handoff.visualCueCandidates);
  const forgedHandoff = structuredClone(handoff);
  forgedHandoff.visualCueCandidates[0].occurrenceId = timeline.units[0].id;
  const forgedHandoffPath = await writeJson('forged-handoff.json', forgedHandoff);
  motionPlan.inputs.asrcut.animationHandoff = await fileRef(forgedHandoffPath);
  await writeFile(motionPath, jsonBytes(motionPlan));
  await assert.rejects(validatePlanFile(motionPath, {stage: 'inputs'}), /does not match the exact compiled plan/);

  const baseExport = {plan: presentationPlan, timeline, baseDir: root, tmpDir: root};
  const oldAudio = await exportAudio({...baseExport, outPath: join(root, 'base.wav')});
  const fadedAudio = await exportAudio({...baseExport, seamFadeMs: 15, outPath: join(root, 'faded.wav')});
  assert.equal(oldAudio.receiptData.seamFadeMs, undefined);
  assert.equal(fadedAudio.receiptData.seamFadeMs, 15);
  assert.deepEqual(fadedAudio.receiptData.seamFades, [{targetSample: samples(1.70), leftOccurrenceId: timeline.clips[0].occurrenceId,
    rightOccurrenceId: timeline.clips[1].occurrenceId, fadeOutSamples: 720, fadeInSamples: 720}]);
  assert.equal(oldAudio.receiptData.sampleCount, fadedAudio.receiptData.sampleCount);
  assert.notEqual(oldAudio.receiptData.outputSha256, fadedAudio.receiptData.outputSha256);
  await assert.rejects(exportAudio({...baseExport, seamFadeMs: 31, outPath: join(root, 'bad-fade.wav')}), checkError('invalid-seam-fade'));
  const shape = await inspectWavFile(oldAudio.output);
  const oldWave = await readFile(oldAudio.output);
  const fadedWave = await readFile(fadedAudio.output);
  assert.notEqual(oldWave.readInt16LE(shape.dataOffset + samples(1.70) * 2), 0);
  assert.equal(fadedWave.readInt16LE(shape.dataOffset + samples(1.70) * 2), 0);
  assert.equal(oldWave.readInt16LE(shape.dataOffset + samples(.35) * 2), fadedWave.readInt16LE(shape.dataOffset + samples(.35) * 2));
  const restoreTimeline = compilePlan(freezePlan(restored));
  const contiguous = await exportAudio({plan: freezePlan(restored), timeline: restoreTimeline, baseDir: root, tmpDir: root,
    seamFadeMs: 15, outPath: join(root, 'contiguous.wav')});
  assert.deepEqual(contiguous.receiptData.seamFades, []);

  const request = {format: 'laohu.asrcut.room-tone/1', projectId: presentationPlan.project.id, revision: presentationPlan.project.revision,
    planSha256: hashPlan(presentationPlan), replacements: [{presentationId: timeline.units[0].id, sourceId, roomToneSourceRange: range(1.25, 1.45)}]};
  const tonePath = join(root, 'tone.wav');
  await assert.rejects(exportAudio({...baseExport, roomTone: request, silenceMap: map, outPath: tonePath}), checkError('room-tone-not-authorized'));
  const wrongLength = structuredClone(request);
  wrongLength.replacements[0].roomToneSourceRange = range(1.25, 1.47);
  await assert.rejects(exportAudio({...baseExport, roomTone: wrongLength, silenceMap: map, authorizeRoomTone: true, outPath: tonePath}), checkError('room-tone-length-mismatch'));
  await assert.rejects(access(tonePath));
  const tonedAudio = await exportAudio({...baseExport, roomTone: request, silenceMap: map, authorizeRoomTone: true, outPath: tonePath});
  const toneWave = await readFile(tonePath);
  const toneShape = await inspectWavFile(tonePath);
  assert.equal(toneShape.sampleCount, oldAudio.receiptData.sampleCount);
  assert.equal(toneWave.readInt16LE(toneShape.dataOffset), source.readInt16LE(44 + samples(1.25) * 2));
  assert.equal(oldWave.readInt16LE(shape.dataOffset), 0);
  assert.equal(tonedAudio.receiptData.roomToneReplacements[0].probeSha256, map.probeSha256);
  assert.equal(tonedAudio.receiptData.auditionStatus, 'not_auditioned');
  assert.deepEqual(tonedAudio.receiptData.clips, oldAudio.receiptData.clips);

  const cliPlanPath = await writeJson('input-plan.json', plan);
  const specPath = await writeJson('operations.json', ops(plan, [trim]));
  const applied = cli(['apply-edits', '--plan', cliPlanPath, '--ops', specPath, '--silence-map', mapPath, '--out', join(root, 'edited.json')]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.deepEqual(await readFile(cliPlanPath), originalPlanBytes);
  const alias = join(root, 'hard-link.json');
  await link(cliPlanPath, alias);
  const rejected = cli(['apply-edits', '--plan', cliPlanPath, '--ops', specPath, '--silence-map', mapPath, '--out', alias]);
  assert.equal(JSON.parse(rejected.stderr).code, 'path-alias');
  const rejectedUpdate = cli(['apply-edits', '--plan', cliPlanPath, '--ops', specPath, '--silence-map', mapPath, '--out', cliPlanPath, '--update-plan']);
  assert.equal(JSON.parse(rejectedUpdate.stderr).code, 'edit-update-target');

  const avSource = join(root, 'two-pictures.mov');
  const generated = spawnSync(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=30:duration=3.4',
    '-itsoffset', '0.1', '-i', sourcePath, '-map', '0:v:0', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', avSource],
  {env: {...process.env, TMPDIR: root}, encoding: 'utf8'});
  assert.equal(generated.status, 0, generated.stderr);
  const probed = spawnSync(process.env.FFPROBE_PATH ?? 'ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', avSource], {encoding: 'utf8'});
  assert.equal(probed.status, 0, probed.stderr);
  const [picture0, picture1, audio] = JSON.parse(probed.stdout).streams;
  const localOffset = (Number(picture0.start_time) - Number(audio.start_time));
  assert.ok(Math.abs(localOffset + .1) < 1e-6);
  const rawAsrPath = await writeJson('import-source-asr.json', asr);
  const importedAvPath = join(root, 'avs-plan.json');
  const importArgs = ['import', '--input', rawAsrPath, '--source', avSource, '--project-id', 'av-import', '--source-id', sourceId,
    '--source-duration-samples', String(samples(3.2)), '--audio-stream-index', String(audio.index), '--time-unit', 'seconds', '--authorize-media-export'];
  const importedAv = cli([...importArgs, '--video-track', `${picture0.index},${picture0.time_base},-1/10,measured`, '--video-track', `${picture1.index},${picture1.time_base},unknown`, '--out', importedAvPath]);
  assert.equal(importedAv.status, 0, importedAv.stderr);
  const importedPlan = JSON.parse(await readFile(importedAvPath, 'utf8'));
  assert.equal(importedPlan.authorization.mediaExport, true);
  assert.equal(importedPlan.authorization.reorder, false);
  assert.deepEqual(importedPlan.sources[0].tracks.map((row) => row.syncToPrimaryAudio), [{status: 'primary'},
    {offsetSeconds: {numerator: -1, denominator: 10}, precision: 'measured'}, {status: 'unknown'}]);
  const badClockPath = join(root, 'incorrect-clock.json');
  const badClock = cli([...importArgs, '--video-track', `${picture0.index},1/2,0/1,measured`, '--out', badClockPath]);
  assert.equal(JSON.parse(badClock.stderr).code, 'video-clock-mismatch');
  await assert.rejects(access(badClockPath));
  const frozenAvPath = join(root, 'avs-frozen.json');
  const avTimelinePath = join(root, 'avs-timeline.json');
  for (const args of [['freeze', '--plan', importedAvPath, '--out', frozenAvPath], ['compile', '--plan', frozenAvPath, '--out', avTimelinePath]]) {
    const result = cli(args);
    assert.equal(result.status, 0, result.stderr);
  }
  const exportArgs = ['export-video', '--plan', frozenAvPath, '--timeline', avTimelinePath, '--fps', '30', '--tmp-dir', root];
  const unknownPath = join(root, 'bad-sync.mov');
  const unknownVideo = cli([...exportArgs, '--video-streams', `${sourceId}=${picture1.index}`, '--out', unknownPath]);
  assert.equal(JSON.parse(unknownVideo.stderr).code, 'video-sync-unknown');
  await assert.rejects(access(unknownPath));
  const avOut = join(root, 'verified-offset.mov');
  const exportedAv = cli([...exportArgs, '--video-streams', `${sourceId}=${picture0.index}`, '--out', avOut]);
  assert.equal(exportedAv.status, 0, exportedAv.stderr);
  const avReceipt = JSON.parse(await readFile(`${avOut}.video-artifact.json`, 'utf8'));
  assert.equal(avReceipt.units[0].videoTrackLocalSeconds.start, .1);
  assert.equal(avReceipt.audio.sampleCount, samples(3.2));

  console.log(JSON.stringify({ok: true, scope: 'edit operations, handoff and Motion input, presentation, audio fades and room tone',
    planSha256: handoff.planSha256, timelineSha256: handoff.timelineSha256, probeSha256: map.probeSha256, fadedPcmSha256: fadedAudio.receiptData.outputSha256,
    roomTonePcmSha256: tonedAudio.receiptData.outputSha256, durationSamples: timeline.durationSamples, auditionStatus: tonedAudio.receiptData.auditionStatus,
    videoImportedTrackOffsetSeconds: localOffset, videoFrames: avReceipt.frameCount}));
} finally {
  await rm(root, {recursive: true, force: true});
}
