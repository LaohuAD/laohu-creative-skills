import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  compilePlan,
  exportAudio,
  freezePlan,
  importAsrJson,
  validatePlan,
} from '../scripts/asrcut.mjs';
import {applyEdits, verifyProbeAcoustics} from '../scripts/edit-operations.mjs';
import {compileAnimationHandoff, verifyAnimationHandoff} from '../scripts/animation-handoff.mjs';
import {inspectMediaSummary, probeSilence, verifySilenceMap} from '../scripts/audio-probe.mjs';
import {createAudioPlan, inspectWavFile, processAudioPlan, validateAudioPlan} from '../scripts/audio-postprocess.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const TMP_BASE = join(REPO_ROOT, '.cache/tmp');
const RATE = 48000;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function makeRng(seed = 1234567) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

function encodeMonoWav16(samples, sampleRateHz = RATE) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRateHz, 24);
  buf.writeUInt32LE(sampleRateHz * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buf;
}

function readWavFloats(buf, header) {
  const samples = new Float64Array(header.sampleCount);
  const bytesPerSample = header.bitsPerSample / 8;
  for (let i = 0; i < header.sampleCount; i += 1) {
    const offset = header.dataOffset + i * header.blockAlign;
    if (header.bitsPerSample === 16) samples[i] = buf.readInt16LE(offset) / 32768;
    else if (header.bitsPerSample === 32 && header.audioFormat === 1) samples[i] = buf.readInt32LE(offset) / 2147483648;
    else if (header.bitsPerSample === 24) {
      const b0 = buf[offset];
      const b1 = buf[offset + 1];
      const b2 = buf[offset + 2];
      const val = (b2 << 24) | (b1 << 16) | (b0 << 8);
      samples[i] = (val >> 8) / 8388608;
    } else throw new Error(`Unsupported sample format: ${bytesPerSample}`);
  }
  return samples;
}

function minWindowRms(samples, start, end, winSize = 96) {
  let minRms = Infinity;
  for (let i = start; i + winSize <= end; i += Math.floor(winSize / 2)) {
    let sum = 0;
    for (let j = 0; j < winSize; j += 1) sum += samples[i + j] * samples[i + j];
    const rms = Math.sqrt(sum / winSize);
    if (rms < minRms) minRms = rms;
  }
  return minRms;
}

const root = await mkdtemp(join(TMP_BASE, 'asrcut-multimodal-test-'));

try {
  // 1. Noisy-room WAV (ambient floor ~ -30 dBFS, speech ~ -12 dBFS) for adaptive probe + zero-drift crossfade + handoff emotion/visualCues
  const totalSec = 4.0;
  const totalSamples = Math.round(totalSec * RATE);
  const rng = makeRng(42);
  const noisy = new Float64Array(totalSamples);
  const floorAmp = 10 ** (-30 / 20); // ~0.0316 (-30 dBFS ambient room tone)
  const speechAmp = 10 ** (-12 / 20); // ~0.251 (-12 dBFS voice)
  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / RATE;
    let v = rng() * floorAmp * 1.6;
    if ((t >= 0.25 && t < 1.15) || (t >= 2.55 && t < 3.65)) {
      v += speechAmp * (0.65 * Math.sin(2 * Math.PI * 220 * t) + 0.35 * Math.sin(2 * Math.PI * 440 * t));
    }
    noisy[i] = Math.max(-0.98, Math.min(0.98, v));
  }
  const noisyPath = join(root, 'noisy-room.wav');
  const noisyBytes = encodeMonoWav16(noisy, RATE);
  await writeFile(noisyPath, noisyBytes);

  // Verify inspect-media
  const inspected = await inspectMediaSummary({inputPath: noisyPath, countSamples: true});
  assert.equal(inspected.format, 'laohu.asrcut.media-inspect/1');
  assert.equal(inspected.decodedAudioSamples.sampleCount, totalSamples);
  assert.equal(inspected.decodedAudioSamples.sampleRateHz, RATE);
  assert.equal(inspected.syncOffsetStatus, 'audio-only');

  // Verify legacy -38 dB misses silences in -30 dBFS room, while auto finds the 1.4s pause + room tone!
  const fixedProbe = await probeSilence({inputPath: noisyPath, noiseDb: -38});
  assert.equal(fixedProbe.silences.length, 0);

  const asr = {
    segments: [
      {
        id: 'seg-1',
        start: 0.25,
        end: 1.15,
        text: '前面铺垫完',
        words: [
          {id: 'w1', start: 0.25, end: 0.70, text: '前面'},
          {id: 'w2', start: 0.70, end: 1.15, text: '铺垫完'},
        ],
      },
      {
        id: 'seg-2',
        start: 2.55,
        end: 3.65,
        text: '真相恰恰相反',
        words: [
          {id: 'w3', start: 2.55, end: 3.05, text: '真相'},
          {id: 'w4', start: 3.05, end: 3.65, text: '恰恰相反'},
        ],
      },
    ],
  };
  const asrPath = join(root, 'noisy-asr.json');
  const asrRaw = `${JSON.stringify(asr, null, 2)}\n`;
  await writeFile(asrPath, asrRaw);

  const plan = importAsrJson(asrRaw, {
    projectId: 'multimodal-demo',
    sourceId: 'src-1',
    sampleRateHz: RATE,
    sourceSampleRateHz: RATE,
    sourceDurationSamples: totalSamples,
    mediaPath: noisyPath,
    mediaSha256: sha256(noisyBytes),
    transcriptSha256: sha256(Buffer.from(asrRaw)),
    evidenceRef: 'noisy-asr.json',
    timeUnit: 'seconds',
    authorization: {mediaExport: true, reorder: false, repeat: false},
  });
  const planPath = join(root, 'plan.json');
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);

  const autoProbe = await probeSilence({inputPath: noisyPath, noiseDb: 'auto', plan, baseDir: root});
  assert.equal(autoProbe.parameters.noiseDbMode, 'auto');
  assert.ok(autoProbe.parameters.noiseDb > -30 && autoProbe.parameters.noiseDb < -12, `unexpected auto noiseDb ${autoProbe.parameters.noiseDb}`);
  assert.ok(autoProbe.silences.length >= 1, 'auto probe should detect silence in noisy room');
  assert.ok(autoProbe.roomToneCandidates.length >= 1, 'auto probe should detect room tone candidate');
  verifySilenceMap(autoProbe, {plan});
  await verifyProbeAcoustics(autoProbe, {plan, baseDir: root});

  // 2. Apply trim-pause + emotion/energy narrativeBeats + author visualCues
  const [seg1, seg2] = plan.sources[0].transcript.segments;
  const pauseStart = Math.round(1.15 * RATE);
  const pauseEnd = Math.round(2.55 * RATE);
  const trimStart = Math.round(1.47 * RATE); // leave 0.32s tail
  const trimEnd = Math.round(2.32 * RATE);   // leave 0.23s head => 0.55s total pause
  const ops = {
    format: 'laohu.asrcut.edit-ops/1',
    expectedRevision: plan.project.revision,
    expectedPlanSha256: plan.integrity.planSha256,
    pacingProfile: 'standard-narration',
    pauseWindows: [
      {
        id: 'pw-turn',
        sourceId: 'src-1',
        sourceRange: {startSample: pauseStart, endSample: pauseEnd, sampleRateHz: RATE},
        pauseKind: 'emphasis',
        reason: '反转前情绪蓄力与压缩长空白',
        function: 'emotional-beat',
      },
    ],
    narrativeBeats: [
      {id: 'beat-1', sourceId: 'src-1', segmentIds: [seg1.id], role: '铺垫问题', emotion: '克制铺垫', energy: 'medium', pacingNote: '语速稳步推进'},
      {id: 'beat-2', sourceId: 'src-1', segmentIds: [seg2.id], role: '核心反转', emotion: '反差上扬', energy: 'peak', pacingNote: '反转词重音落地'},
    ],
    visualCues: [
      {id: 'vc-turn', sourceId: 'src-1', segmentId: seg2.id, tokenIds: seg2.tokens.map((t) => t.id), category: 'turn', note: '切对比反转卡片'},
    ],
    operations: [
      {
        id: 'trim-1',
        op: 'trim-pause',
        sourceId: 'src-1',
        sourceRange: {startSample: trimStart, endSample: trimEnd, sampleRateHz: RATE},
        pauseRange: {startSample: pauseStart, endSample: pauseEnd, sampleRateHz: RATE},
        pauseKind: 'sentence',
        reason: '将 1.40 秒长停顿收紧到 0.55 秒标准句末停顿',
      },
    ],
  };

  // First verify functional-pause protection blocks trimming a pauseWindow marked with function:'emotional-beat'
  await assert.rejects(() => applyEdits(plan, ops, {baseDir: root, silenceMap: autoProbe}), (err) => err.code === 'functional-pause-protected');

  // Now classify pw-turn as sentence (without blocking function) to allow trimming, while keeping emotion/energy + visualCues
  const editableOps = structuredClone(ops);
  editableOps.pauseWindows = [
    {
      id: 'pw-turn',
      sourceId: 'src-1',
      sourceRange: {startSample: pauseStart, endSample: pauseEnd, sampleRateHz: RATE},
      pauseKind: 'sentence',
      reason: '句末兼反转蓄力窗口',
    },
  ];
  const edited = await applyEdits(plan, editableOps, {baseDir: root, silenceMap: autoProbe});
  assert.equal(validatePlan(edited).errors.length, 0);
  const frozen = freezePlan(edited);
  const timeline = compilePlan(frozen);
  const timelineBytes = Buffer.from(`${JSON.stringify(timeline, null, 2)}\n`, 'utf8');

  // Verify animation handoff carries emotion/energy/pacingNote and author visualCues
  const handoff = await compileAnimationHandoff({plan: frozen, timelineBytes, silenceMap: autoProbe, baseDir: root});
  await verifyAnimationHandoff(handoff, {plan: frozen, timelineBytes, silenceMap: autoProbe, baseDir: root});
  assert.equal(handoff.narrativeBeats.length, 2);
  assert.equal(handoff.narrativeBeats[0].emotion, '克制铺垫');
  assert.equal(handoff.narrativeBeats[1].energy, 'peak');
  assert.equal(handoff.narrativeBeats[1].pacingNote, '反转词重音落地');
  assert.equal(handoff.visualCueCandidates.length, 1);
  assert.equal(handoff.visualCueCandidates[0].text, '真相恰恰相反');
  assert.equal(handoff.visualCueCandidates[0].category, 'turn');
  assert.equal(handoff.visualCueCandidates[0].evidence, 'author-semantic-cue');
  assert.equal(handoff.visualCueCandidates[0].note, '切对比反转卡片');
  assert.equal(handoff.availablePauseWindows.length, 1);
  assert.ok(Math.abs(handoff.availablePauseWindows[0].durationSec - 0.55) < 0.02);

  // 3. Compare seam-fade-ms (legacy dip-to-zero) vs seam-crossfade-ms (new zero-drift equal-power crossfade)
  const fadedOut = join(root, 'cut-fade.wav');
  const xfadeOut = join(root, 'cut-xfade.wav');
  const fadedRes = await exportAudio({plan: frozen, timeline, outPath: fadedOut, baseDir: root, tmpDir: root, seamFadeMs: 15, timelineSha256: sha256(timelineBytes)});
  const xfadeRes = await exportAudio({plan: frozen, timeline, outPath: xfadeOut, baseDir: root, tmpDir: root, seamCrossfadeMs: 15, timelineSha256: sha256(timelineBytes)});

  assert.equal(fadedRes.receiptData.sampleCount, timeline.durationSamples);
  assert.equal(xfadeRes.receiptData.sampleCount, timeline.durationSamples);
  assert.equal(xfadeRes.receiptData.seamCrossfadeMs, 15);
  assert.equal(xfadeRes.receiptData.seamCrossfades.length, 1);
  assert.equal(xfadeRes.receiptData.seamCrossfades[0].mode, 'equal-power-crossfade');

  // Verify conflicting flags rejected
  await assert.rejects(() => exportAudio({plan: frozen, timeline, outPath: join(root, 'both.wav'), baseDir: root, tmpDir: root, seamFadeMs: 10, seamCrossfadeMs: 10}),
    (err) => err.code === 'conflicting-seam-fade-options');

  // Measure actual PCM energy right across the seam sample (1.47 * RATE = 70560)
  const seamSample = timeline.clips[1].targetRange.startSample;
  const fadedBuf = await readFile(fadedOut);
  const xfadeBuf = await readFile(xfadeOut);
  const fadedSamples = readWavFloats(fadedBuf, await inspectWavFile(fadedOut));
  const xfadeSamples = readWavFloats(xfadeBuf, await inspectWavFile(xfadeOut));
  const fadedMinAtSeam = minWindowRms(fadedSamples, seamSample - 1200, seamSample + 1200, 96);
  const xfadeMinAtSeam = minWindowRms(xfadeSamples, seamSample - 1200, seamSample + 1200, 96);
  // Legacy dip-to-zero plunges way down near 0; equal-power crossfade preserves ambient room tone floor!
  assert.ok(fadedMinAtSeam < 0.004, `expected dip-to-zero under 0.004, got ${fadedMinAtSeam}`);
  assert.ok(xfadeMinAtSeam > 0.015, `expected continuous room tone > 0.015 across crossfade seam, got ${xfadeMinAtSeam}`);

  // 4. Test audio-postprocess controlled limiter + normalize on expressive peaked speech
  const dynSamples = new Float64Array(RATE * 5);
  for (let i = 0; i < dynSamples.length; i += 1) {
    const t = i / RATE;
    // Normal human speech body (~ -22 LUFS) with one brief expressive exclamation spike reaching -1.4 dBFS
    let amp = 0.14;
    if (t >= 2.0 && t < 2.08) amp = 0.85;
    dynSamples[i] = amp * (0.6 * Math.sin(2 * Math.PI * 190 * t) + 0.4 * Math.sin(2 * Math.PI * 380 * t));
  }
  const dynPath = join(root, 'expressive-peaks.wav');
  await writeFile(dynPath, encodeMonoWav16(dynSamples, RATE));

  // Without limiter, static normalize to -16 LUFS / -1.5 dBTP fails because of the spike
  const staticPlanPath = join(root, 'static-norm.audio-plan.json');
  const staticPlan = (await createAudioPlan({inputPath: dynPath, outPath: staticPlanPath})).plan;
  staticPlan.steps = [{type: 'normalize', reason: 'Raise overall level to -16 LUFS target without limiter.', targetLufs: -16, maxTruePeakDbtp: -1.5, maxGainDb: 12}];
  await writeFile(staticPlanPath, `${JSON.stringify(staticPlan, null, 2)}\n`);
  await assert.rejects(() => processAudioPlan({planPath: staticPlanPath, outPath: join(root, 'static-out.wav'), tmpDir: root}),
    (err) => err.code === 'normalize-target-unmet');

  // With controlled gain + limiter + normalize, passes 3-point latency calibration and hits both LUFS & true-peak targets!
  const limitedPlanPath = join(root, 'limited-norm.audio-plan.json');
  const limitedPlan = (await createAudioPlan({inputPath: dynPath, outPath: limitedPlanPath})).plan;
  limitedPlan.steps = [
    {type: 'gain', reason: 'Lift expressive recording body before transparent peak control.', gainDb: 8},
    {type: 'limiter', reason: 'Tame single brief exclamation peak without flattening speech body.', limitDbtp: -2.0, attackMs: 5, releaseMs: 50},
    {type: 'normalize', reason: 'Deliver consistent -16 LUFS loudness within -1.5 dBTP ceiling.', targetLufs: -16, maxTruePeakDbtp: -1.5, maxGainDb: 9},
  ];
  await writeFile(limitedPlanPath, `${JSON.stringify(limitedPlan, null, 2)}\n`);
  assert.equal(validateAudioPlan(limitedPlan), true);
  const limitedRes = await processAudioPlan({planPath: limitedPlanPath, outPath: join(root, 'limited-out.wav'), tmpDir: root});
  assert.equal(limitedRes.receiptData.timing.exactSampleCountPreserved, true);
  assert.equal(limitedRes.receiptData.timing.latencyCalibration.status, 'passed');
  assert.ok(Math.abs(limitedRes.receiptData.processing.normalization.measuredLufs - (-16)) <= 0.5);
  assert.ok(limitedRes.receiptData.processing.normalization.measuredTruePeakDbtp <= -1.4);

  // 5. Intent-driven thinking pause (hesitation + thinking-pause exception) + multi-clip asplit export + Volcengine -1 blank token filter
  const hesSec = 4.2;
  const hesSamples = Math.round(hesSec * RATE);
  const hesWave = new Float64Array(hesSamples);
  const rng2 = makeRng(99);
  for (let i = 0; i < hesSamples; i += 1) {
    const t = i / RATE;
    let v = rng2() * 0.002;
    // Word 1: 0.20..0.80, 0.55s thinking pause (0.80..1.35), Word 2: 1.35..1.95, 0.30s thinking pause (1.95..2.25), Word 3: 2.25..3.20
    if ((t >= 0.20 && t < 0.80) || (t >= 1.35 && t < 1.95) || (t >= 2.25 && t < 3.20)) {
      v += 0.24 * Math.sin(2 * Math.PI * 240 * t);
    }
    hesWave[i] = Math.max(-0.98, Math.min(0.98, v));
  }
  const hesWavPath = join(root, 'hesitation.wav');
  const hesWavBytes = encodeMonoWav16(hesWave, RATE);
  await writeFile(hesWavPath, hesWavBytes);

  // Use Volcengine utterance format including a negative-timestamp blank placeholder token to test import resilience
  const volcAsr = {
    result: {
      utterances: [
        {
          start_time: 200,
          end_time: 3200,
          text: '这个功能其实很简单',
          words: [
            {text: ' ', start_time: -1, end_time: -1},
            {text: '这个功能', start_time: 200, end_time: 800},
            {text: '其实', start_time: 1350, end_time: 1950},
            {text: '很简单', start_time: 2250, end_time: 3200},
          ],
        },
      ],
    },
  };
  const volcRaw = `${JSON.stringify(volcAsr, null, 2)}\n`;
  await writeFile(join(root, 'volc-asr.json'), volcRaw);
  const hesPlan = importAsrJson(volcRaw, {
    projectId: 'hesitation-demo',
    sourceId: 'src-hes',
    sampleRateHz: RATE,
    sourceSampleRateHz: RATE,
    sourceDurationSamples: hesSamples,
    mediaPath: hesWavPath,
    mediaSha256: sha256(hesWavBytes),
    transcriptSha256: sha256(Buffer.from(volcRaw)),
    evidenceRef: 'volc-asr.json',
    timeUnit: 'milliseconds',
    authorization: {mediaExport: true, reorder: false, repeat: false},
  });
  assert.equal(validatePlan(hesPlan).errors.length, 0);
  // Negative-timestamp blank token must be filtered out, leaving 3 real words
  assert.equal(hesPlan.sources[0].transcript.segments[0].tokens.length, 3);
  const hesProbe = await probeSilence({inputPath: hesWavPath, noiseDb: 'auto', plan: hesPlan, baseDir: root});
  assert.ok(hesProbe.silences.length >= 2, 'probe should find both thinking pauses');

  const p1Start = Math.round(0.80 * RATE);
  const p1End = Math.round(1.35 * RATE);   // 550 ms thinking pause (inside sentence no-touch band!)
  const p2Start = Math.round(1.95 * RATE);
  const p2End = Math.round(2.25 * RATE);   // 300 ms short thinking pause (inside <=350 ms micro band!)

  // 5a: Treating a 550ms thinking pause as 'sentence' is blocked by sentence no-touch guard
  await assert.rejects(() => applyEdits(hesPlan, {
    format: 'laohu.asrcut.edit-ops/1',
    expectedRevision: hesPlan.project.revision,
    expectedPlanSha256: hesPlan.integrity.planSha256,
    pacingProfile: 'standard-narration',
    operations: [{
      id: 'bad-sentence-trim',
      op: 'trim-pause',
      sourceId: 'src-hes',
      pauseKind: 'sentence',
      pauseRange: {startSample: p1Start, endSample: p1End, sampleRateHz: RATE},
      sourceRange: {startSample: Math.round(0.88 * RATE), endSample: Math.round(1.29 * RATE), sampleRateHz: RATE},
      reason: '错把思考停顿按句末规则修剪',
    }],
  }, {baseDir: root, silenceMap: hesProbe}), (err) => err.code === 'pause-window-protected');

  // 5b: Trimming a 300ms short pause without thinking-pause exception is blocked by micro-pause guard
  await assert.rejects(() => applyEdits(hesPlan, {
    format: 'laohu.asrcut.edit-ops/1',
    expectedRevision: hesPlan.project.revision,
    expectedPlanSha256: hesPlan.integrity.planSha256,
    pacingProfile: 'standard-narration',
    operations: [{
      id: 'missing-exception',
      op: 'trim-pause',
      sourceId: 'src-hes',
      pauseKind: 'hesitation',
      pauseRange: {startSample: p2Start, endSample: p2End, sampleRateHz: RATE},
      sourceRange: {startSample: Math.round(2.02 * RATE), endSample: Math.round(2.20 * RATE), sampleRateHz: RATE},
      reason: '缺少思考停顿例外说明',
    }],
  }, {baseDir: root, silenceMap: hesProbe}), (err) => err.code === 'micro-pause-protected');

  // 5c: Never allow cutting inside a continuous word even when labeled hesitation
  await assert.rejects(() => applyEdits(hesPlan, {
    format: 'laohu.asrcut.edit-ops/1',
    expectedRevision: hesPlan.project.revision,
    expectedPlanSha256: hesPlan.integrity.planSha256,
    pacingProfile: 'standard-narration',
    operations: [{
      id: 'cut-word-attempt',
      op: 'trim-pause',
      sourceId: 'src-hes',
      pauseKind: 'hesitation',
      pauseRange: {startSample: p1Start, endSample: p1End, sampleRateHz: RATE},
      sourceRange: {startSample: Math.round(0.70 * RATE), endSample: Math.round(1.20 * RATE), sampleRateHz: RATE},
      reason: '试图切进词身应被硬拒绝',
    }],
  }, {baseDir: root, silenceMap: hesProbe}), (err) => err.code === 'cut-through-word' || err.code === 'pause-cut-outside-pause');

  // 5d: Properly labeled hesitation (0.55s -> 0.14s) + hesitation with thinking-pause exception (0.30s -> 0.12s) SUCCEED!
  const hesEdited = await applyEdits(hesPlan, {
    format: 'laohu.asrcut.edit-ops/1',
    expectedRevision: hesPlan.project.revision,
    expectedPlanSha256: hesPlan.integrity.planSha256,
    pacingProfile: 'standard-narration',
    operations: [
      {
        id: 'trim-hes-1',
        op: 'trim-pause',
        sourceId: 'src-hes',
        pauseKind: 'hesitation',
        pauseRange: {startSample: p1Start, endSample: p1End, sampleRateHz: RATE},
        sourceRange: {startSample: Math.round(0.88 * RATE), endSample: Math.round(1.29 * RATE), sampleRateHz: RATE},
        reason: '句中组织语言思考停顿 0.55s 抽紧至 0.14s',
      },
      {
        id: 'trim-hes-2',
        op: 'trim-pause',
        sourceId: 'src-hes',
        pauseKind: 'hesitation',
        pauseException: 'thinking-pause',
        pauseRange: {startSample: p2Start, endSample: p2End, sampleRateHz: RATE},
        sourceRange: {startSample: Math.round(2.02 * RATE), endSample: Math.round(2.20 * RATE), sampleRateHz: RATE},
        reason: '句中短思考停顿 0.30s 抽紧至 0.12s',
      },
    ],
  }, {baseDir: root, silenceMap: hesProbe});
  assert.equal(validatePlan(hesEdited).errors.length, 0);
  const hesFrozen = freezePlan(hesEdited);
  const hesTimeline = compilePlan(hesFrozen);
  assert.equal(hesTimeline.clips.length, 3);
  const hesOut = join(root, 'hes-cut.wav');
  const hesExport = await exportAudio({
    plan: hesFrozen,
    timeline: hesTimeline,
    outPath: hesOut,
    baseDir: root,
    tmpDir: root,
    seamCrossfadeMs: 12,
    timelineSha256: sha256(Buffer.from(`${JSON.stringify(hesTimeline, null, 2)}\n`)),
  });
  assert.equal(hesExport.receiptData.sampleCount, hesTimeline.durationSamples);
  assert.equal(hesExport.receiptData.seamCrossfades.length, 2);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    scope: 'multimodal upgrades + v2 intent-driven hesitation pause, Volcengine -1 filter, multi-clip asplit export',
    autoNoiseDb: autoProbe.parameters.noiseDb,
    fadedMinAtSeam: Number(fadedMinAtSeam.toFixed(5)),
    xfadeMinAtSeam: Number(xfadeMinAtSeam.toFixed(5)),
    limitedLufs: limitedRes.receiptData.processing.normalization.measuredLufs,
    limitedTruePeakDbtp: limitedRes.receiptData.processing.normalization.measuredTruePeakDbtp,
    hesClips: hesTimeline.clips.length,
    hesSeamCrossfades: hesExport.receiptData.seamCrossfades.length,
  }, null, 2)}\n`);
} finally {
  await rm(root, {recursive: true, force: true});
}
