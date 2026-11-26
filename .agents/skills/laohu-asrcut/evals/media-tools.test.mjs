import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {link, mkdir, mkdtemp, readFile, stat, symlink, writeFile} from 'node:fs/promises';
import {basename, join, relative, resolve} from 'node:path';
import {promisify} from 'node:util';
import {compilePlan, exportAudio, freezePlan, hashPlan, importAsrJson, insertPresentationInterval,
  mergePlans, upsertAnnotation, validatePlan} from '../scripts/asrcut.mjs';
import {createAudioPlan, inspectWavFile, processAudioPlan} from '../scripts/audio-postprocess.mjs';
import {hashMediaFile, inspectMedia, probeSilence, publishMediaFiles, sha256Bytes, verifyRoomToneCandidate, verifySilenceMap} from '../scripts/audio-probe.mjs';
import {exportNle, exportVideo, extractSeams} from '../scripts/video-and-nle.mjs';

const exec = promisify(execFile);
const artifacts = resolve(process.env.ASRCUT_MEDIA_VALIDATION ?? '.cache/validation/asrcut-layered-20261120/media');
await mkdir(artifacts, {recursive: true});
const root = await mkdtemp(join(artifacts, 'fixture-'));
const tmpDir = join(root, 'tmp');
await mkdir(tmpDir);
const env = {...process.env, TMPDIR: tmpDir};
const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe';
const tools = {ffmpegPath, ffprobePath, tmpDir};
const rate = 48000;
const fps = '30000/1001';
const cli = resolve('.agents/skills/laohu-asrcut/scripts/asrcut.mjs');
const samples = (seconds) => Math.round(seconds * rate);
const errorCode = (code) => (error) => error.code === code;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const runFfmpeg = (args) => exec(ffmpegPath, ['-nostdin', '-hide_banner', '-v', 'error', '-n', ...args], {env});
const readJson = async (path) => JSON.parse(await readFile(path));

function wav16(count, sample) {
  const buffer = Buffer.alloc(44 + count * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(count * 2, 40);
  for (let index = 0; index < count; index += 1) buffer.writeInt16LE(sample(index), 44 + index * 2);
  return buffer;
}

async function pcm(path) {
  const wave = await inspectWavFile(path);
  return (await readFile(path)).subarray(wave.dataOffset, wave.dataOffset + wave.dataBytes);
}

function rehash(plan) { plan.integrity.planSha256 = hashPlan(plan); return plan; }

async function writeBinding(plan, name) {
  assert.deepEqual(validatePlan(plan).errors, []);
  const frozen = freezePlan(plan);
  const planPath = join(root, `${name}.plan.json`);
  const timelinePath = join(root, `${name}.timeline.json`);
  const timeline = compilePlan(frozen);
  await Promise.all([writeFile(planPath, json(frozen), {flag: 'wx'}), writeFile(timelinePath, json(timeline), {flag: 'wx'})]);
  return {plan: frozen, timeline, planPath, timelinePath, timelineSha256: await hashMediaFile(timelinePath)};
}

let randomState = 0x72fa4dda;
const sourceWave = join(root, 'waveform-source.wav');
await writeFile(sourceWave, wav16(samples(2.4), (index) => {
  const t = index / rate;
  if (t < 0.24) return 0;
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  const background = Math.round((randomState / 0x100000000 - 0.5) * 120);
  if ((t >= 0.24 && t < 0.64) || (t >= 1.38 && t < 1.84)) return Math.round(6000 * Math.sin(2 * Math.PI * 417 * t)) + background;
  if (index === samples(0.96)) return 4000;
  return background;
}), {flag: 'wx'});
const wavePlan = importAsrJson({segments: [
  {startMs: 250, endMs: 640, text: '第一声', words: [{startMs: 250, endMs: 610, text: '第一声'}]},
  {startMs: 1450, endMs: 1850, text: '第二声', words: [{startMs: 1450, endMs: 1830, text: '第二声'}]},
]}, {projectId: 'wave-fixture', sourceId: 'wave', sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: samples(2.4),
  mediaPath: sourceWave, mediaSha256: await hashMediaFile(sourceWave), timeUnit: 'ms', audioStreamIndex: 0, authorization: {mediaExport: true}});
const waveBinding = await writeBinding(wavePlan, 'wave');
const mapPath = join(root, 'silence-map.json');
const mapCliPath = resolve('.agents/skills/laohu-asrcut/scripts/audio-probe.mjs');
const mapArgs = ['probe-silence', '--input', sourceWave, '--plan', waveBinding.planPath, '--out', mapPath];
await exec(process.execPath, [mapCliPath, ...mapArgs], {env});
const map = await readJson(mapPath);
assert.equal(map.source.sampleRateHz, rate);
assert.equal(map.source.sampleCount, samples(2.4));
assert.equal(map.source.streamIndex, 0);
assert.equal(map.source.sha256, await hashMediaFile(sourceWave));
assert.equal(verifySilenceMap(map, {plan: waveBinding.plan, sourceId: 'wave'}).id, 'wave');
assert.equal(map.silences[0].durationMs, 240);
assert.equal(map.silences[0].gapClassification, 'micro_preserve');
assert.equal(map.silences[0].minRmsDb, null);
assert.equal(map.silences[0].nearestZeroCrossingSample, null);
const voicedGap = map.silences.find((row) => row.onsetDriftWarning);
assert.equal(voicedGap.startSample, samples(0.64));
assert.equal(voicedGap.endSample, samples(1.38));
assert.equal(voicedGap.onsetDriftWarning.asrMinusOnsetMs, 70);
assert.ok(voicedGap.valleySample > voicedGap.startSample && voicedGap.valleySample < voicedGap.endSample);
const mono16 = await pcm(sourceWave);
const crossing = voicedGap.nearestZeroCrossingSample;
const before = mono16.readInt16LE((crossing - 1) * 2);
const after = mono16.readInt16LE(crossing * 2);
assert.ok(before !== after && before * after <= 0);
assert.ok(map.roomToneCandidates.some((row) => row.sourceRange.startSample === samples(0.64)));
assert.ok(map.roomToneCandidates.every((row) => row.sourceRange.startSample >= samples(0.64)
  && !(row.sourceRange.startSample <= samples(0.96) && row.sourceRange.endSample > samples(0.96))));
await verifyRoomToneCandidate({silenceMap: map, sourceId: 'wave', plan: waveBinding.plan,
  range: {startSample: samples(0.7), endSample: samples(0.89), sampleRateHz: rate}, ...tools});
await assert.rejects(verifyRoomToneCandidate({silenceMap: map, sourceId: 'wave', plan: waveBinding.plan,
  range: {startSample: samples(0.92), endSample: samples(1.0), sampleRateHz: rate}, ...tools}), errorCode('room-tone-not-probed'));
assert.throws(() => verifySilenceMap({...map, probeSha256: '0'.repeat(64)}, {plan: waveBinding.plan}), errorCode('invalid-silence-map'));
await assert.rejects(exec(process.execPath, [mapCliPath, ...mapArgs], {env}), (error) => /output-exists/.test(error.stderr));

const multi = join(root, 'camera & screen.mov');
const second = join(root, 'separate take.mov');
const color = (name, size = '96x64') => `color=c=${name}:s=${size}:r=${fps}:d=4.8`;
const tone = (frequency) => `sine=f=${frequency}:r=${rate}:d=4.8`;
const sourceCodec = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-video_track_timescale', '30000', '-c:a', 'pcm_s16le'];
await runFfmpeg(['-f', 'lavfi', '-i', color('blue'), '-f', 'lavfi', '-i', color('red'), '-f', 'lavfi', '-i', tone(111), '-f', 'lavfi', '-i', tone(270),
  '-filter_complex', "[1:v]drawbox=x=0:y=0:w=iw:h=ih:color=yellow:t=fill:enable='gte(t,0.07)'[selected]", '-map', '0:v', '-map', '[selected]',
  '-map', '2:a', '-map', '3:a', ...sourceCodec, multi]);
await runFfmpeg(['-f', 'lavfi', '-i', color('green', '80x64'), '-f', 'lavfi', '-i', tone(680), '-map', '0:v', '-map', '1:a', ...sourceCodec, second]);
await assert.rejects(probeSilence({inputPath: multi, ...tools}), errorCode('audio-stream-ambiguous'));
const multiProbe = await probeSilence({inputPath: multi, audioStreamIndex: 3, ...tools});
assert.equal(multiProbe.source.streamIndex, 3);
assert.equal(multiProbe.source.sampleCount, samples(4.8));

async function sourcePlan(sourceId, media, audioStreamIndex, offset, videoIndices, ranges) {
  const retainedRanges = ranges.filter(([, , retained]) => retained);
  const draft = importAsrJson({segments: retainedRanges.map(([a, b], index) => ({startMs: (a + 0.05) * 1000, endMs: (b - 0.05) * 1000,
    text: `Sentence ${index}.`, words: [{startMs: (a + 0.07) * 1000, endMs: (b - 0.07) * 1000, text: `Word ${index}`}]}))},
  {projectId: 'camera-fixture', sourceId, sampleRateHz: rate, sourceSampleRateHz: rate, sourceDurationSamples: samples(4.8),
    mediaPath: media.slice(root.length + 1), mediaSha256: await hashMediaFile(media), audioStreamIndex, authorization: {mediaExport: true}});
  draft.sources[0].tracks.push(...videoIndices.map((streamIndex) => ({id: `${sourceId}-video-${streamIndex}`, kind: 'video', streamIndex,
    clock: {unit: 'pts', timebase: {numerator: 1, denominator: 30000}},
    syncToPrimaryAudio: {offsetSeconds: {numerator: Math.round(offset * 100), denominator: 100}, precision: 'measured'}})));
  draft.coverage = ranges.map(([a, b, retained], index) => {
    const startSample = samples(a);
    const endSample = samples(b);
    const id = `${sourceId}-coverage-${index}`;
    const tokenIds = draft.sources[0].transcript.segments.flatMap((segment) => segment.tokens.filter(({sourceRange}) => sourceRange.startSample >= startSample && sourceRange.endSample <= endSample).map((token) => token.id));
    return {id, sourceId, sourceRange: {startSample, endSample, sampleRateHz: rate}, disposition: retained ? 'retain' : 'delete', decisionId: `${id}-decision`, tokenIds};
  });
  draft.sequence = draft.coverage.filter((row) => row.disposition === 'retain').map((row) => ({occurrenceId: `${row.id}-occ`, coverageId: row.id}));
  draft.decisions = draft.coverage.map((row) => ({id: row.decisionId, action: row.disposition, reason: `Synthetic source range ${row.id}.`, coverageIds: [row.id],
    sourceRanges: [{sourceId, sourceRange: row.sourceRange}], keptOccurrenceIds: row.disposition === 'retain' ? [`${row.id}-occ`] : [], tokenIds: row.tokenIds}));
  draft.questions = [];
  return rehash(draft);
}

const take1 = await sourcePlan('screen', multi, 3, -0.1, [0, 1], [
  [0, 0.73111, true], [0.73111, 1.09185, true], [1.09185, 1.60123, false], [1.60123, 3.25111, true],
  [3.25111, 4.60431, true], [4.60431, 4.8, false],
]);
const take2 = await sourcePlan('camera', second, 1, 0, [0], [[0, 1.60867, true], [1.60867, 2.26412, false], [2.26412, 4.8, true]]);
let edit = mergePlans([take1, take2], {sourceOrder: ['screen', 'camera']});
edit.pacingProfile = 'standard-narration';
edit.decisions.find(({id}) => id === 'screen-coverage-2-decision').visualSeamRisk = 'jump-cut';
edit.decisions.find(({id}) => id === 'screen-coverage-2-decision').visualMaskHint = 'Keep the diagram on screen';
rehash(edit);
const speech = edit.sources[0].transcript.segments[0];
edit = upsertAnnotation(edit, {id: 'watch-diagram', sourceId: 'screen', segmentId: speech.id, tokenId: speech.tokens[0].id,
  occurrenceId: edit.sequence[0].occurrenceId, userNote: '核对图表 & 光标', analysisNote: null});

function insert(plan, id, position, length) {
  return insertPresentationInterval(plan, {id, decisionId: `${id}-decision`, reason: `Show the ${id} placeholder.`, position, sceneId: `${id}-scene`,
    durationSamples: samples(length), visualHandoff: {focus: `${id} artwork`, entryState: 'blank', exitCondition: 'viewer reads title'},
    audioHandoff: {role: 'quiet', rationale: 'Provide an interval for editorial handoff.'},
    expectedRevision: plan.project.revision, expectedPlanSha256: hashPlan(plan)}, {authorized: true});
}
edit = insert(edit, 'opening', 'before-first', 0.37);
edit = insert(edit, 'closing', 'after-last', 0.41);
const binding = await writeBinding(edit, 'cut');
await assert.rejects(probeSilence({inputPath: multi, plan: binding.plan, baseDir: root, sourceId: 'screen', audioStreamIndex: 2, ...tools}), errorCode('probe-stream-mismatch'));

const wav = join(root, 'cut.wav');
const artifact = await exportAudio({...binding, outPath: wav, baseDir: root, seamFadeMs: 15, ...tools});
const cutReceipt = artifact.receiptData;
assert.equal(cutReceipt.sampleCount, binding.timeline.durationSamples);
assert.equal(cutReceipt.seamFadeMs, 15);
const seamBinding = {...binding, audioPath: wav, outDir: join(root, 'seams'), ...tools};
const extracted = await extractSeams(seamBinding);
const found = extracted.manifestData;
assert.equal(found.auditionStatus, 'not_auditioned');
assert.equal(found.timelineSha256, binding.timelineSha256);
assert.deepEqual(found.seams.map((row) => row.kind), ['presentation-to-source', 'source-discontinuity', 'source-change', 'source-discontinuity', 'source-to-presentation']);
assert.ok(found.seams[0].clippedAtTimelineStart);
assert.ok(found.seams.at(-1).clippedAtTimelineEnd);
const cutBytes = await pcm(wav);
for (const row of found.seams) {
  const expectedPcm = cutBytes.subarray(row.targetRange.startSample * 2, row.targetRange.endSample * 2);
  assert.deepEqual(await pcm(join(extracted.output, row.file)), expectedPcm);
  if (!row.clippedAtTimelineStart && !row.clippedAtTimelineEnd) assert.equal(row.sampleCount, samples(2.5));
  assert.equal(row.targetRange.startSample + row.seamOffsetSamples, row.targetSample);
}
await assert.rejects(extractSeams(seamBinding), errorCode('output-exists'));
const nestedTemp = join(root, 'temp-collides-with-seams');
await assert.rejects(extractSeams({...seamBinding, outDir: nestedTemp, tmpDir: join(nestedTemp, 'tmp')}), errorCode('temp-output-alias'));
await assert.rejects(stat(nestedTemp), (error) => error.code === 'ENOENT');
const brokenReceiptPath = join(root, 'foreign-receipt.json');
await writeFile(brokenReceiptPath, json({...cutReceipt, timelineSha256: '0'.repeat(64)}), {flag: 'wx'});
await assert.rejects(extractSeams({...seamBinding, outDir: join(root, 'foreign-seams'), audioReceiptPath: brokenReceiptPath}), errorCode('audio-receipt-stale'));
const corruptAudio = join(root, 'corrupt.wav');
const original = await readFile(wav);
original[original.length - 1] ^= 0x1;
await writeFile(corruptAudio, original, {flag: 'wx'});
await assert.rejects(extractSeams({...seamBinding, outDir: join(root, 'corrupt-seams'), audioPath: corruptAudio, audioReceiptPath: artifact.receipt}), errorCode('audio-hash-stale'));
const staleTimelinePath = join(root, 'stale.timeline.json');
await writeFile(staleTimelinePath, json({...binding.timeline, durationSamples: binding.timeline.durationSamples + 1}), {flag: 'wx'});
await assert.rejects(extractSeams({...seamBinding, outDir: join(root, 'stale-seams'), timelinePath: staleTimelinePath}), errorCode('timeline-not-canonical'));

const videoBindings = {planPath: binding.planPath, timelinePath: binding.timelinePath, fps, videoStreams: {screen: 1}, ...tools};
const mov = join(root, 'cut.mov');
const rendered = await exportVideo({...videoBindings, audioPath: wav, outPath: mov});
const receipt = rendered.receiptData;
assert.equal(receipt.audio.workflow, 'reused-bound-pcm');
assert.equal(receipt.audio.pcmSha256, sha256Bytes(cutBytes));
assert.equal(receipt.audio.sampleCount, binding.timeline.durationSamples);
assert.ok(Math.abs(receipt.finalVideoMinusAudioSeconds) <= 0.5 * 1001 / 30000);
assert.equal(receipt.units[0].picture, 'black-placeholder');
assert.equal(receipt.units.at(-1).picture, 'black-placeholder');
assert.equal(receipt.units[1].videoStreamIndex, 1);
assert.equal(receipt.units[1].sampledStartFrame, 3);
assert.equal(receipt.units[1].videoTrackLocalSeconds.start, 0.1);
assert.deepEqual(receipt.units.map((unit) => unit.frameRange.startFrame), binding.timeline.units.map((unit) => Math.round(unit.targetRange.startSample / rate * 30000 / 1001)));
for (const [index, row] of receipt.units.entries()) {
  if (index) assert.equal(row.frameRange.startFrame, receipt.units[index - 1].frameRange.endFrame);
}
const probe = await inspectMedia(mov, ffprobePath);
assert.equal(probe.streams[0].nb_frames, String(receipt.frameCount));
assert.equal(probe.streams[0].duration_ts, receipt.frameCount * 1001);
assert.equal(probe.streams[1].duration_ts, binding.timeline.durationSamples);
const {stdout: packets} = await exec(ffprobePath, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts,duration', '-of', 'json', mov], {env});
JSON.parse(packets).packets.forEach((packet, index) => assert.deepEqual([packet.pts, packet.duration], [index * 1001, 1001]));
const rgb = (frame) => exec(ffmpegPath, ['-nostdin', '-hide_banner', '-v', 'error', '-i', mov, '-map', '0:v:0',
  '-vf', `select=eq(n\\,${frame}),crop=2:2:40:40,format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], {env, encoding: 'buffer'}).then(({stdout}) => [...stdout.subarray(0, 3)]);
assert.ok((await rgb(0)).every((value) => value < 8));
const selectedPicture = await rgb(receipt.units[1].frameRange.startFrame);
assert.ok(selectedPicture[0] > 200 && selectedPicture[1] > 200 && selectedPicture[2] < 20, `expected calibrated yellow frame; got ${selectedPicture}`);
assert.ok((await rgb(receipt.frameCount - 1)).every((value) => value < 8));

const rawVideo = join(root, 'regenerated.mov');
const regenerated = await exportVideo({...videoBindings, outPath: rawVideo, seamFadeMs: 15});
assert.equal(regenerated.receiptData.audio.workflow, 'rendered-from-frozen-plan');
assert.equal(regenerated.receiptData.audio.pcmSha256, receipt.audio.pcmSha256);
await assert.rejects(exportVideo({...videoBindings, outPath: mov, audioPath: wav}), errorCode('output-exists'));
const alias = join(root, 'input-alias.mov');
await link(multi, alias);
await assert.rejects(exportVideo({...videoBindings, outPath: alias, audioPath: wav}), errorCode('path-alias'));
const symlinkPath = join(root, 'dangling.mov');
await symlink(join(root, 'absent-target.mov'), symlinkPath);
await assert.rejects(exportVideo({...videoBindings, outPath: symlinkPath, audioPath: wav}), errorCode('output-exists'));
const blockedOut = join(root, 'role-conflict.mov');
await writeFile(`${blockedOut}.video-artifact.json`, 'Keep this user file.', {flag: 'wx'});
await assert.rejects(exportVideo({...videoBindings, outPath: blockedOut, audioPath: wav}), errorCode('output-exists'));
await assert.rejects(stat(blockedOut), (error) => error.code === 'ENOENT');
assert.equal(await readFile(`${blockedOut}.video-artifact.json`, 'utf8'), 'Keep this user file.');
const rolledBack = join(root, 'rolled-back-output.mov');
await assert.rejects(publishMediaFiles([{staged: mov, target: rolledBack}, {staged: rendered.receipt, target: `${blockedOut}.video-artifact.json`}]), errorCode('output-exists'));
await assert.rejects(stat(rolledBack), (error) => error.code === 'ENOENT');
assert.equal(await readFile(`${blockedOut}.video-artifact.json`, 'utf8'), 'Keep this user file.');
const failedOut = join(root, 'failed-render.mov');
await assert.rejects(exportVideo({...videoBindings, outPath: failedOut, audioPath: wav, ffmpegPath: '/usr/bin/false'}), errorCode('ffmpeg-failed'));
await assert.rejects(stat(failedOut), (error) => error.code === 'ENOENT');
await assert.rejects(stat(`${failedOut}.video-artifact.json`), (error) => error.code === 'ENOENT');

const unknown = structuredClone(edit);
unknown.sources[0].tracks.at(-1).syncToPrimaryAudio = {status: 'unknown'};
const unknownBinding = await writeBinding(rehash(unknown), 'unknown');
await assert.rejects(exportVideo({...videoBindings, ...unknownBinding, outPath: join(root, 'unknown.mov'), audioPath: wav}), errorCode('video-sync-unknown'));
await assert.rejects(exportVideo({...videoBindings, outPath: join(root, 'ambiguous.mov'), audioPath: wav, videoStreams: {}}), errorCode('video-track-ambiguous'));
const noAuthorization = structuredClone(edit);
noAuthorization.authorization.mediaExport = false;
const blocked = await writeBinding(rehash(noAuthorization), 'blocked');
await assert.rejects(exportVideo({...videoBindings, ...blocked, outPath: join(root, 'unauthorized.mov'), audioPath: wav}), errorCode('export-not-authorized'));

const treatmentBinding = await writeBinding(take2, 'continuous-treatment');
const audioPlanPath = join(root, 'continuous-audio-plan.json');
const createdAudioPlan = await createAudioPlan({inputPath: second, outPath: audioPlanPath, projectId: take2.project.id, sourceId: 'camera'});
createdAudioPlan.plan.steps = [{type: 'gain', gainDb: -3, reason: 'Use an observable and timing-calibrated fixture gain.'}];
await writeFile(audioPlanPath, json(createdAudioPlan.plan));
const processedSourcePath = join(root, 'continuous-audio-processed.wav');
const processed = await processAudioPlan({planPath: audioPlanPath, outPath: processedSourcePath, ...tools});
const treatment = {audioPlanPath, processedSourcePath, audioReceiptPath: processed.receipt};
const treatedCutPath = join(root, 'treated-cut.wav');
const treatedCut = await exportAudio({plan: treatmentBinding.plan, timeline: treatmentBinding.timeline, outPath: treatedCutPath, baseDir: root, ...tools, ...treatment});
assert.equal(treatedCut.receiptData.timelineSha256, undefined, 'older receipt layout can still be used');
const compatibility = await extractSeams({...treatmentBinding, audioPath: treatedCutPath, outDir: join(root, 'legacy-receipt-seams'), ...tools});
assert.equal(compatibility.manifestData.seams.length, 1);
const treatedVideo = await exportVideo({...treatmentBinding, fps, outPath: join(root, 'treated-cut.mov'), ...tools, ...treatment});
assert.equal(treatedVideo.receiptData.audio.audioTreatment.processedSourceSha256, processed.receiptData.output.sha256);
assert.equal(treatedVideo.receiptData.audio.sampleFormat, 'pcm_s32le');
assert.equal(treatedVideo.receiptData.audio.pcmSha256, sha256Bytes(await pcm(treatedCutPath)));
await assert.rejects(exportVideo({...treatmentBinding, fps, outPath: join(root, 'incomplete-treatment.mov'), ...tools, audioPlanPath}), errorCode('source-treatment-incomplete'));

const nle = {};
for (const [format, stream] of [['fcpxml', 1], ['otio', 1], ['edl', 0]]) {
  const outPath = join(root, `cut.${format}`);
  nle[format] = await exportNle({...videoBindings, outPath, format, videoStreams: {screen: stream}});
  assert.ok(nle[format].markers > 4);
  assert.equal(nle[format].timelineSha256, binding.timelineSha256);
}
const otio = await readJson(nle.otio.output);
assert.equal(otio.OTIO_SCHEMA, 'Timeline.1');
assert.deepEqual(otio.tracks.children.map(({kind}) => kind), ['Video', 'Audio']);
assert.equal(otio.tracks.children[0].children[1].media_references.DEFAULT_MEDIA.metadata.asrcut.streamIndex, 1);
assert.equal(otio.tracks.children[1].children[1].media_references.DEFAULT_MEDIA.metadata.asrcut.streamIndex, 3);
assert.equal(otio.tracks.children[1].children.reduce((count, unit) => count + unit.source_range.duration.value, 0), binding.timeline.durationSamples);
assert.ok(otio.tracks.children[0].markers.some((marker) => marker.name.includes('jump-cut')));
const xml = await readFile(nle.fcpxml.output, 'utf8');
assert.match(xml, /<video ref="a1" srcID="2"/);
assert.match(xml, /<audio ref="a1" srcID="2"/);
assert.match(xml, /核对图表 &amp; 光标/);
const edl = await readFile(nle.edl.output, 'utf8');
assert.match(edl, /FCM: NON-DROP FRAME/);
assert.match(edl, /\* LOC: .*jump-cut/);
assert.match(edl, /001  BL/);
await assert.rejects(exportNle({...videoBindings, outPath: join(root, 'alternate-track.edl'), format: 'edl'}), errorCode('edl-source-unsupported'));

if (process.env.ASRCUT_FCPXML_DTD) await exec('xmllint', ['--noout', '--dtdvalid', relative(root, resolve(process.env.ASRCUT_FCPXML_DTD)), basename(nle.fcpxml.output)], {env, cwd: root});
const routed = await exec(process.execPath, [cli, 'probe-silence', '--input', sourceWave, '--out', join(root, 'from-main-cli.json')], {env});
assert.equal(JSON.parse(routed.stdout).ok, true);
const cliNle = await exec(process.execPath, [cli, 'export-nle', '--plan', binding.planPath, '--timeline', binding.timelinePath, '--fps', fps,
  '--out', join(root, 'from-main-cli.otio'), '--format', 'otio', '--video-streams', 'screen=1'], {env});
assert.equal(JSON.parse(cliNle.stdout).format, 'otio');
const cliSeams = await exec(process.execPath, [cli, 'extract-seams', '--plan', binding.planPath, '--timeline', binding.timelinePath,
  '--audio', wav, '--out-dir', join(root, 'from-main-cli-seams'), '--tmp-dir', tmpDir], {env});
assert.equal(JSON.parse(cliSeams.stdout).seams, found.seams.length);
assert.equal(await hashMediaFile(binding.timelinePath), binding.timelineSha256);
assert.equal(await hashMediaFile(multi), take1.sources[0].sha256);
process.stdout.write(`${JSON.stringify({ok: true, fixture: root, verifiedInputs: [sourceWave, multi, second], seams: found.seams.length,
  frameCount: receipt.frameCount, sampleCount: receipt.audio.sampleCount, nle: Object.fromEntries(Object.entries(nle).map(([format, row]) => [format, row.output]))}, null, 2)}\n`);
