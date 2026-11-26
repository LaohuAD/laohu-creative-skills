import {createHash} from 'node:crypto';

export const CAPTION_DESIGN_FORMAT_V1 = 'laohu.asrcut.caption-design/1';
export const CAPTION_MANIFEST_FORMAT_V1 = 'laohu.asrcut.caption-manifest/1';
export const CAPTION_DESIGN_FORMAT_V2 = 'laohu.asrcut.caption-design/2';
export const CAPTION_MANIFEST_FORMAT_V2 = 'laohu.asrcut.caption-manifest/2';
// Keep the original exports as stable aliases for existing consumers.
export const CAPTION_DESIGN_FORMAT = CAPTION_DESIGN_FORMAT_V1;
export const CAPTION_MANIFEST_FORMAT = CAPTION_MANIFEST_FORMAT_V1;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stableValue = (value) => Array.isArray(value) ? value.map(stableValue)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])) : value;
const stableJson = (value) => JSON.stringify(stableValue(value));
const PRECISION_RANK = new Map([['measured', 0], ['aligned', 1], ['utterance', 2], ['estimated', 3]]);

function bad(message) { const error = new Error(message); error.code = 'invalid-caption-handoff'; throw error; }
function requireText(value, label) { if (typeof value !== 'string' || !value.trim()) bad(`${label} must be a non-empty string`); return value; }
function requireLanguageTag(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)) bad(`${label} must be a BCP 47 language tag`);
  return value;
}
const hashCaptionLines = (lines) => sha256(stableJson(lines));
function requireRange(range, label, rate) {
  if (!range || !Number.isSafeInteger(range.startSample) || !Number.isSafeInteger(range.endSample)
    || range.startSample < 0 || range.endSample <= range.startSample || range.sampleRateHz !== rate) bad(`${label} must be a positive half-open range on the project clock`);
}
function onlyKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.has(key)) bad(`${label} contains unsupported field ${key}`);
}
function manifestHash(manifest) {
  const copy = structuredClone(manifest);
  delete copy.integrity;
  return sha256(stableJson(copy));
}
function timecode(sample, rate) {
  const ms = Math.floor(sample * 1000 / rate + 0.5);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor(ms / 60000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

const INSERTABLE_ZH_PUNCTUATION = new Set(Array.from('，、；：！？'));
const OPTIONAL_CHINESE_DISPLAY_MARKS = /[，。；：“”‘’]/u;
const CAPTION_PROFILES = new Set(['zh-caption/1', 'zh-caption/2', 'verbatim/1']);
const han = (character) => /\p{Script=Han}/u.test(character);
const asciiTokenCharacter = (character) => Boolean(character) && /[A-Za-z0-9_.:/?#&=%+@~-]/.test(character);

function validateChineseScreenText(rawText, displayText, punctuationDecision, label) {
  if (/[，。]/u.test(displayText) || /、[；：“”‘’]*$/u.test(displayText)) {
    bad(`${label} has a Chinese comma, full stop, or trailing enumeration mark in a screen caption`);
  }
  if (rawText === displayText) return;
  requireText(punctuationDecision, `${label} punctuationDecision`);
  const lastContentIndex = rawText.replace(/[，。；：“”‘’]+$/u, '').length - 1;
  let displayIndex = 0;
  for (let rawIndex = 0; rawIndex < rawText.length; rawIndex += 1) {
    const mark = rawText[rawIndex];
    if (mark === displayText[displayIndex]) {
      displayIndex += 1;
    } else if (!OPTIONAL_CHINESE_DISPLAY_MARKS.test(mark) && !(mark === '、' && rawIndex === lastContentIndex)) {
      bad(`${label} changes a spoken character or protected punctuation at ${JSON.stringify(mark)}`);
    }
  }
  if (displayIndex !== displayText.length) bad(`${label} adds text or punctuation to the spoken source`);
}

function validateDisplayText(rawText, displayText, profile, punctuationDecision, label) {
  if (profile === 'zh-caption/2') return validateChineseScreenText(rawText, displayText, punctuationDecision, label);
  if (profile === 'verbatim/1' && displayText !== rawText) bad(`${label} must exactly preserve text under verbatim/1`);
  if (displayText === rawText) return;
  if (profile !== 'zh-caption/1') bad(`${label} may change only explicit zh-caption/1 punctuation while preserving every spoken character`);
  const mayDropTerminalStop = profile === 'zh-caption/1' && rawText.endsWith('。') && !displayText.endsWith('。');
  if (mayDropTerminalStop && /[？！]$/.test(displayText)) bad(`${label} cannot replace a spoken terminal full stop with a different sentence-ending mark`);
  const wanted = mayDropTerminalStop ? rawText.slice(0, -1) : rawText;
  // After a slash, Unicode is valid URL path content. Protect the whole
  // undelimited run; authors can add prose punctuation after a host-only URL,
  // but an unmarked Unicode path boundary is inherently ambiguous.
  const protectedSpans = [...wanted.matchAll(/https?:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[^\s，。、！？；：]*)?|\b\d+(?:\.\d+)+\b/gu)]
    .map((match) => [match.index, match.index + match[0].length]);
  let rawIndex = 0;
  for (let i = 0; i < displayText.length; i += 1) {
    const character = displayText[i];
    if (wanted[rawIndex] === character) { rawIndex += 1; continue; }
    if (!INSERTABLE_ZH_PUNCTUATION.has(character)) bad(`${label} changes spoken text or protected punctuation at ${JSON.stringify(character)}`);
    const previous = displayText[i - 1] ?? '';
    const next = displayText[i + 1] ?? '';
    const isTerminalEmphasis = i === displayText.length - 1 && ['？', '！'].includes(character);
    const isHanBoundary = (han(previous) && han(next)) || (han(previous) && asciiTokenCharacter(next)) || (asciiTokenCharacter(previous) && han(next));
    const isChineseEnumeration = isHanBoundary && ['、', '，', '；', '：'].includes(character);
    if (!isTerminalEmphasis && !isChineseEnumeration) bad(`${label} may insert punctuation only between adjacent Han text or as terminal question/exclamation punctuation`);
    if (isTerminalEmphasis && !punctuationDecision) bad(`${label} needs an explicit punctuationDecision for authored terminal question/exclamation punctuation`);
    if (protectedSpans.some(([start, end]) => rawIndex > start && rawIndex < end)) bad(`${label} cannot insert punctuation inside a decimal or URL token`);
    if (['、', '，', '；', '：'].includes(character) && !punctuationDecision) bad(`${label} needs an explicit punctuationDecision for authored punctuation`);
  }
  if (rawIndex !== wanted.length) bad(`${label} omits spoken text or punctuation`);
}

function indexTimeline(timeline) {
  const occurrences = new Map();
  const tokens = new Map();
  const segments = new Map();
  const confirmedCorrections = new Map();
  const correctionKey = (sourceId, kind, id) => `${sourceId}\0${kind}\0${id}`;
  for (const clip of timeline.clips ?? []) {
    if (!clip.occurrenceId || occurrences.has(clip.occurrenceId)) bad('timeline occurrence ids must be unique');
    occurrences.set(clip.occurrenceId, clip);
    for (const [wordIndex, word] of (clip.words ?? []).entries()) tokens.set(`${clip.occurrenceId}\0${word.tokenId}`, {clip, row: word, wordIndex});
    for (const segment of clip.transcriptSegments ?? []) segments.set(`${clip.occurrenceId}\0${segment.segmentId}`, {clip, row: segment});
  }
  for (const correction of timeline.spokenCorrections ?? []) {
    if (correction?.status !== 'confirmed') continue;
    requireText(correction.id, 'confirmed correction.id');
    requireText(correction.segmentId, `confirmed correction ${correction.id}.segmentId`);
    requireText(correction.rawText, `confirmed correction ${correction.id}.rawText`);
    requireText(correction.spokenText, `confirmed correction ${correction.id}.spokenText`);
    const kind = correction.tokenId == null ? 'segment' : 'token';
    const anchorId = kind === 'token' ? correction.tokenId : correction.segmentId;
    const key = correctionKey(requireText(correction.sourceId, 'confirmed correction.sourceId'), kind,
      requireText(anchorId, `confirmed correction.${kind}Id`));
    if (confirmedCorrections.has(key)) bad(`timeline repeats a confirmed spoken correction for ${kind} ${anchorId}`);
    confirmedCorrections.set(key, correction);
  }
  const requiredAnchors = new Set();
  for (const clip of timeline.clips ?? []) {
    if ((clip.words ?? []).length) for (const word of clip.words) requiredAnchors.add(`token\0${clip.occurrenceId}\0${word.tokenId}`);
    else for (const segment of clip.transcriptSegments ?? []) requiredAnchors.add(`segment\0${clip.occurrenceId}\0${segment.segmentId}`);
  }
  return {occurrences, tokens, segments, confirmedCorrections, correctionKey, requiredAnchors,
    occurrenceOrder: new Map((timeline.clips ?? []).map((clip, i) => [clip.occurrenceId, i]))};
}

function compileCue(cue, index, rate, durationSamples, profile) {
  onlyKeys(cue, new Set(['id', 'occurrenceId', 'tokenIds', 'segmentId', 'lines', 'displayWindow', 'segmentationDecision', 'reason', 'punctuationDecision']), 'caption cue');
  onlyKeys(cue.displayWindow, new Set(['range', 'timingPrecision', 'leadSamples', 'holdSamples', 'reason']), `caption ${cue.id}.displayWindow`);
  requireText(cue?.id, 'caption cue.id');
  requireText(cue?.occurrenceId, `caption ${cue.id}.occurrenceId`);
  const clip = index.occurrences.get(cue.occurrenceId);
  if (!clip) bad(`caption ${cue.id} references an occurrence outside the retained timeline`);
  const refs = [];
  if (Array.isArray(cue.tokenIds) && cue.tokenIds.length) {
    if (cue.segmentId != null) bad(`caption ${cue.id} must anchor tokens or a segment, not both`);
    for (const tokenId of cue.tokenIds) {
      requireText(tokenId, `caption ${cue.id}.tokenIds item`);
      const found = index.tokens.get(`${cue.occurrenceId}\0${tokenId}`);
      if (!found) bad(`caption ${cue.id} references missing token ${tokenId} in occurrence ${cue.occurrenceId}`);
      refs.push({kind: 'token', id: tokenId, row: found.row, wordIndex: found.wordIndex});
    }
    if (new Set(cue.tokenIds).size !== cue.tokenIds.length) bad(`caption ${cue.id} repeats a token anchor`);
  } else if (cue.segmentId != null) {
    requireText(cue.segmentId, `caption ${cue.id}.segmentId`);
    const found = index.segments.get(`${cue.occurrenceId}\0${cue.segmentId}`);
    if (!found) bad(`caption ${cue.id} references missing segment ${cue.segmentId} in occurrence ${cue.occurrenceId}`);
    if ((clip.words ?? []).length) bad(`caption ${cue.id} must use actual token anchors when this occurrence has word evidence`);
    refs.push({kind: 'segment', id: cue.segmentId, row: found.row});
  } else bad(`caption ${cue.id} needs tokenIds or segmentId as an occurrence anchor`);

  const ordered = refs;
  if (ordered[0].kind === 'token') {
    for (let i = 1; i < ordered.length; i += 1) {
      if (ordered[i].wordIndex !== ordered[i - 1].wordIndex + 1) bad(`caption ${cue.id} tokenIds must follow contiguous timeline word order`);
    }
  }
  const rawText = ordered.map((ref) => ref.row.text).join('');
  const rawLineBreaksRemoved = (rawText.match(/\r\n|\r|\n/g) ?? []).length;
  const correctionProvenance = [];
  const lexicalSourceText = ordered.map((ref) => {
    const correction = index.confirmedCorrections.get(index.correctionKey(clip.sourceId, ref.kind, ref.id));
    const spokenText = ref.row.spokenText;
    if (spokenText != null) {
      if (typeof spokenText !== 'string' || !spokenText.length || !correction
        || correction.rawText !== ref.row.text || correction.spokenText !== spokenText
        || correction.status !== 'confirmed' || correction.verification?.method !== 'audio-listening'
        || correction.verification?.listeningStatus !== 'listened') {
        bad(`caption ${cue.id} has spokenText without a matching listening-confirmed canonical correction`);
      }
      correctionProvenance.push({correctionId: correction.id, occurrenceId: cue.occurrenceId, sourceId: clip.sourceId,
        segmentId: correction.segmentId, ...(correction.tokenId == null ? {} : {tokenId: correction.tokenId}),
        rawText: correction.rawText, spokenText: correction.spokenText, status: correction.status,
        verificationMethod: correction.verification.method, listeningStatus: correction.verification.listeningStatus});
    } else if (correction) {
      bad(`caption ${cue.id} has a confirmed correction that is missing from its canonical ${ref.kind} row`);
    }
    return spokenText ?? ref.row.text;
  }).join('');
  const lexicalLineBreaksRemoved = (lexicalSourceText.match(/\r\n|\r|\n/g) ?? []).length;
  const lexicalText = lexicalSourceText.replace(/\r\n|\r|\n/g, '');
  if (!lexicalText) bad(`caption ${cue.id} anchors empty spoken text`);
  const precision = ordered.reduce((worst, ref) => PRECISION_RANK.get(ref.row.timingPrecision) > PRECISION_RANK.get(worst) ? ref.row.timingPrecision : worst, 'measured');
  const speechRange = {
    startSample: Math.min(...ordered.map((ref) => ref.row.targetRange.startSample)),
    endSample: Math.max(...ordered.map((ref) => ref.row.targetRange.endSample)),
    sampleRateHz: rate,
  };
  const displayRange = cue.displayWindow?.range;
  requireRange(displayRange, `caption ${cue.id}.displayWindow.range`, rate);
  if (displayRange.endSample > durationSamples || displayRange.startSample < clip.targetRange.startSample || displayRange.endSample > clip.targetRange.endSample) bad(`caption ${cue.id} display window must stay within its retained occurrence and timeline`);
  const leadSamples = cue.displayWindow.leadSamples ?? 0;
  const holdSamples = cue.displayWindow.holdSamples ?? 0;
  if (!Number.isSafeInteger(leadSamples) || leadSamples < 0 || leadSamples > Math.floor(rate / 2)) bad(`caption ${cue.id} leadSamples must be an explicit 0..500 ms lead-in`);
  if (!Number.isSafeInteger(holdSamples) || holdSamples < 0 || holdSamples > rate * 2) bad(`caption ${cue.id} holdSamples must be an explicit 0..2000 ms hold`);
  if (displayRange.startSample !== speechRange.startSample - leadSamples || displayRange.endSample !== speechRange.endSample + holdSamples) bad(`caption ${cue.id} display window must match its anchored speech span plus its declared lead/hold`);
  if ((leadSamples || holdSamples) && !cue.displayWindow.reason) bad(`caption ${cue.id} adjusted display timing needs an explicit displayWindow.reason`);
  if (precision === 'utterance' && (leadSamples || holdSamples) && cue.displayWindow.timingPrecision && cue.displayWindow.timingPrecision !== 'utterance') bad(`caption ${cue.id} cannot refine utterance-only timing through display-window adjustments`);
  if (cue.displayWindow?.timingPrecision && PRECISION_RANK.get(cue.displayWindow.timingPrecision) < PRECISION_RANK.get(precision)) bad(`caption ${cue.id} display timing cannot claim greater precision than its speech anchors`);
  const lines = cue.lines;
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 2 || lines.some((line) => typeof line !== 'string' || !line.trim())) bad(`caption ${cue.id}.lines must contain one or two explicit non-empty semantic lines`);
  const displayText = lines.join('');
  validateDisplayText(lexicalText, displayText, profile, cue.punctuationDecision, `caption ${cue.id}.lines`);
  requireText(cue.segmentationDecision, `caption ${cue.id}.segmentationDecision`);
  requireText(cue.reason, `caption ${cue.id}.reason`);
  const timingPrecision = cue.displayWindow.timingPrecision ?? precision;
  if (!PRECISION_RANK.has(timingPrecision)) bad(`caption ${cue.id} has an unknown display timing precision`);
  return {
    id: cue.id,
    anchors: [{occurrenceId: cue.occurrenceId, ...(refs[0].kind === 'token' ? {tokenIds: ordered.map((ref) => ref.id)} : {segmentId: refs[0].id})}],
    rawText,
    lexicalText,
    sourceTextNormalization: {method: 'line-breaks-are-layout/1', lineBreaksRemoved: lexicalLineBreaksRemoved,
      ...(rawLineBreaksRemoved === lexicalLineBreaksRemoved ? {} : {rawLineBreaksRemoved})},
    ...(correctionProvenance.length ? {correctionProvenance} : {}),
    displayText,
    lines: [...lines],
    speechSpan: {...speechRange, timingPrecision: precision},
    displayWindow: {...displayRange, timingPrecision, leadSamples, holdSamples, ...(cue.displayWindow.reason ? {reason: cue.displayWindow.reason} : {})},
    segmentationDecision: cue.segmentationDecision,
    reason: cue.reason,
    punctuationDecision: cue.punctuationDecision ?? null,
    profile,
    _sort: [index.occurrenceOrder.get(cue.occurrenceId), speechRange.startSample],
  };
}

function compileCaptionManifestV1({plan, timeline, design, planSha256, timelineSha256}) {
  onlyKeys(design, new Set(['format', 'projectId', 'revision', 'planSha256', 'timelineSha256', 'profile', 'coveragePolicy', 'cues', 'exclusions']), 'caption design');
  if (!plan || !timeline || !design) bad('plan, canonical timeline, and caption design are required');
  if (design.format !== CAPTION_DESIGN_FORMAT) bad(`caption design format must be ${CAPTION_DESIGN_FORMAT}`);
  if (design.projectId !== plan.project?.id || design.revision !== plan.project?.revision) bad('caption design project id/revision does not match the edit plan');
  if (design.planSha256 !== planSha256 || design.timelineSha256 !== timelineSha256) bad('caption design is stale against the supplied edit plan or timeline');
  if (design.coveragePolicy !== 'all-retained-speech/1') bad('formal caption design must explicitly cover all retained speech in the selected edit timeline');
  const profile = design.profile ?? 'zh-caption/1';
  if (!CAPTION_PROFILES.has(profile)) bad(`unsupported caption punctuation profile ${profile}`);
  if (!Array.isArray(design.cues) || !design.cues.length) bad('caption design.cues must explicitly describe at least one semantic caption cue');
  const clock = timeline.clock;
  if (!clock || !Number.isSafeInteger(clock.sampleRateHz) || clock.sampleRateHz < 1) bad('canonical timeline has no valid sample clock');
  const index = indexTimeline(timeline);
  const ids = new Set();
  const covered = new Set();
  const authored = design.cues.map((cue) => {
    const compiled = compileCue(cue, index, clock.sampleRateHz, timeline.durationSamples, profile);
    if (ids.has(compiled.id)) bad(`duplicate caption cue id ${compiled.id}`);
    ids.add(compiled.id);
    for (const anchor of compiled.anchors) {
      const kind = anchor.tokenIds ? 'token' : 'segment';
      for (const id of anchor.tokenIds ?? [anchor.segmentId]) {
        const key = `${kind}\0${anchor.occurrenceId}\0${id}`;
        if (covered.has(key)) bad(`caption design duplicates retained speech anchor ${id}`);
        covered.add(key);
      }
    }
    return compiled;
  });
  const exclusions = design.exclusions ?? [];
  if (!Array.isArray(exclusions) || exclusions.length) bad('formal caption manifests cover every retained speech anchor; partial exclusions need a separately declared upstream scope and are not accepted here');
  for (const exclusion of exclusions) {
    onlyKeys(exclusion, new Set(['occurrenceId', 'tokenIds', 'segmentId', 'reason']), 'caption exclusion');
    requireText(exclusion.reason, 'caption exclusion.reason');
    const occurrenceId = requireText(exclusion.occurrenceId, 'caption exclusion.occurrenceId');
    const refs = Array.isArray(exclusion.tokenIds) && exclusion.tokenIds.length ? exclusion.tokenIds.map((id) => ['token', id])
      : exclusion.segmentId ? [['segment', exclusion.segmentId]] : [];
    if (!refs.length || (exclusion.segmentId && exclusion.tokenIds?.length)) bad('caption exclusion must name tokens or a segment, not both');
    for (const [kind, id] of refs) {
      if (kind === 'token' && !index.tokens.has(`${occurrenceId}\0${id}`)) bad(`caption exclusion references unknown token ${id}`);
      if (kind === 'segment' && (!index.segments.has(`${occurrenceId}\0${id}`) || index.occurrences.get(occurrenceId)?.words?.length)) bad(`caption exclusion references unknown or token-resolved segment ${id}`);
      const key = `${kind}\0${occurrenceId}\0${id}`;
      if (covered.has(key)) bad(`caption exclusion duplicates a caption anchor ${id}`);
      covered.add(key);
    }
  }
  for (const key of index.requiredAnchors) if (!covered.has(key)) bad(`caption design omits retained speech anchor ${key.split('\0').at(-1)}`);
  for (const key of covered) if (!index.requiredAnchors.has(key)) bad(`caption design contains an unexpected or duplicate speech anchor ${key.split('\0').at(-1)}`);
  for (let i = 1; i < authored.length; i += 1) {
    const prior = authored[i - 1], next = authored[i];
    if (next._sort[0] < prior._sort[0] || (next._sort[0] === prior._sort[0] && next._sort[1] < prior._sort[1])) bad('caption cues must follow retained timeline and speech order');
  }
  const cues = authored.map(({_sort, ...cue}) => cue);
  for (let i = 1; i < cues.length; i += 1) {
    if (cues[i].displayWindow.startSample < cues[i - 1].displayWindow.endSample) bad(`caption display windows overlap: ${cues[i - 1].id} and ${cues[i].id}`);
  }
  const manifest = {
    format: CAPTION_MANIFEST_FORMAT,
    project: {id: plan.project.id, revision: plan.project.revision},
    editPlan: {format: plan.format, planSha256},
    timeline: {format: timeline.format, sha256: timelineSha256},
    sourceClock: structuredClone(clock),
    sources: (timeline.sources ?? []).map(({id, sha256: sourceSha256, transcript}) => ({id, sha256: sourceSha256, transcriptSha256: transcript?.sha256 ?? null})),
    profile,
    coverage: {
      policy: 'all-retained-speech/1',
      excluded: [],
    },
    cues,
  };
  if (timeline.planSha256 !== planSha256 || timeline.project?.id !== plan.project?.id || timeline.project?.revision !== plan.project?.revision) bad('timeline project or edit-plan identity differs from the supplied plan');
  if (!Array.isArray(timeline.sources) || timeline.sources.length !== plan.sources.length) bad('timeline source identities must match the edit plan');
  for (const source of plan.sources) {
    const compiled = timeline.sources.find((row) => row.id === source.id);
    if (!compiled || compiled.sha256 !== source.sha256 || compiled.transcript?.sha256 !== source.transcript?.sha256) bad(`timeline source hash differs from edit-plan source ${source.id}`);
  }
  onlyKeys(manifest, new Set(['format', 'project', 'editPlan', 'timeline', 'sourceClock', 'sources', 'profile', 'coverage', 'cues']), 'compiled caption manifest');
  manifest.integrity = {manifestSha256: manifestHash(manifest)};
  return manifest;
}

function verifyCaptionManifestV1(manifest, {plan, timeline, planSha256, timelineSha256}) {
  onlyKeys(manifest, new Set(['format', 'project', 'editPlan', 'timeline', 'sourceClock', 'sources', 'profile', 'coverage', 'cues', 'integrity']), 'caption manifest');
  onlyKeys(manifest.integrity, new Set(['manifestSha256']), 'caption manifest.integrity');
  onlyKeys(manifest.coverage, new Set(['policy', 'excluded']), 'caption manifest.coverage');
  if (manifest?.format !== CAPTION_MANIFEST_FORMAT) bad(`caption manifest format must be ${CAPTION_MANIFEST_FORMAT}`);
  if (manifest.integrity?.manifestSha256 !== manifestHash(manifest)) bad('caption manifest content hash is stale or invalid');
  if (manifest.coverage?.policy !== 'all-retained-speech/1' || manifest.coverage?.excluded?.length) bad('caption manifest has an unsupported or partial speech coverage policy');
  const rebuilt = compileCaptionManifest({plan, timeline, design: {
    format: CAPTION_DESIGN_FORMAT,
    projectId: manifest.project?.id,
    revision: manifest.project?.revision,
    planSha256: manifest.editPlan?.planSha256,
    timelineSha256: manifest.timeline?.sha256,
    profile: manifest.profile,
    coveragePolicy: manifest.coverage?.policy,
    exclusions: manifest.coverage?.excluded,
    cues: manifest.cues?.map((cue) => ({
      id: cue.id,
      occurrenceId: cue.anchors?.[0]?.occurrenceId,
      ...(cue.anchors?.[0]?.tokenIds ? {tokenIds: cue.anchors[0].tokenIds} : {segmentId: cue.anchors?.[0]?.segmentId}),
      lines: cue.lines,
      displayWindow: {range: {startSample: cue.displayWindow?.startSample, endSample: cue.displayWindow?.endSample, sampleRateHz: cue.displayWindow?.sampleRateHz},
        timingPrecision: cue.displayWindow?.timingPrecision, leadSamples: cue.displayWindow?.leadSamples, holdSamples: cue.displayWindow?.holdSamples,
        ...(cue.displayWindow?.reason ? {reason: cue.displayWindow.reason} : {})},
      reason: cue.reason,
      segmentationDecision: cue.segmentationDecision,
      punctuationDecision: cue.punctuationDecision ?? undefined,
    })),
  }, planSha256, timelineSha256});
  if (stableJson(rebuilt) !== stableJson(manifest)) bad('caption manifest does not match the actual retained timeline anchors and target ranges');
  return true;
}

function compileCaptionManifestV2({plan, timeline, design, planSha256, timelineSha256}) {
  onlyKeys(design, new Set(['format', 'projectId', 'revision', 'planSha256', 'timelineSha256', 'profile', 'coveragePolicy', 'sourceLanguage', 'displayLanguages', 'cues', 'exclusions']), 'caption design/2');
  if (design?.format !== CAPTION_DESIGN_FORMAT_V2) bad(`caption design format must be ${CAPTION_DESIGN_FORMAT_V2}`);
  const sourceLanguage = requireLanguageTag(design.sourceLanguage, 'caption design/2.sourceLanguage');
  if (!Array.isArray(design.displayLanguages) || !design.displayLanguages.length || design.displayLanguages.length > 4) bad('caption design/2.displayLanguages must name one to four visible languages in reading order');
  const displayLanguages = design.displayLanguages.map((language, index) => requireLanguageTag(language, `caption design/2.displayLanguages[${index}]`));
  if (new Set(displayLanguages).size !== displayLanguages.length) bad('caption design/2.displayLanguages must not repeat a language');
  const translatedLanguages = displayLanguages.filter((language) => language !== sourceLanguage);

  if (!Array.isArray(design.cues)) bad('caption design/2.cues must be an array');
  const translationRows = new Map();
  for (const cue of design.cues) {
    requireText(cue?.id, 'caption cue.id');
    if (Object.hasOwn(cue, 'translations') && !Array.isArray(cue.translations)) bad(`caption ${cue.id}.translations must be an array when supplied`);
    const translations = cue.translations ?? [];
    if (!Array.isArray(translations)) bad(`caption ${cue.id}.translations must be an array`);
    const byLanguage = new Map();
    for (const [translationIndex, translation] of translations.entries()) {
      onlyKeys(translation, new Set(['language', 'lines', 'sourceCueId', 'sourceTextSha256', 'provenance']), `caption ${cue.id}.translations[${translationIndex}]`);
      const language = requireLanguageTag(translation.language, `caption ${cue.id}.translations[${translationIndex}].language`);
      if (language === sourceLanguage) bad(`caption ${cue.id} translations cannot duplicate the source language ${sourceLanguage}`);
      if (byLanguage.has(language)) bad(`caption ${cue.id} repeats translation language ${language}`);
      if (!translatedLanguages.includes(language)) bad(`caption ${cue.id} has an unrequested translation language ${language}`);
      if (!Array.isArray(translation.lines) || translation.lines.length < 1 || translation.lines.length > 2
        || translation.lines.some((line) => typeof line !== 'string' || !line.trim() || line !== line.trim() || /[\r\n]/.test(line))) {
        bad(`caption ${cue.id} translation ${language}.lines must contain one or two trimmed non-empty display lines`);
      }
      if (translation.sourceCueId !== cue.id) bad(`caption ${cue.id} translation ${language} is bound to a different source cue`);
      if (!/^[a-f0-9]{64}$/.test(translation.sourceTextSha256 ?? '')) bad(`caption ${cue.id} translation ${language}.sourceTextSha256 must be a lowercase SHA-256`);
      if (!Array.isArray(cue.lines) || translation.sourceTextSha256 !== hashCaptionLines(cue.lines)) bad(`caption ${cue.id} translation ${language} is stale against its Chinese display lines`);
      onlyKeys(translation.provenance, new Set(['origin', 'status', 'revision']), `caption ${cue.id} translation ${language}.provenance`);
      if (!['human-authored', 'machine-assisted'].includes(translation.provenance?.origin)) bad(`caption ${cue.id} translation ${language}.provenance.origin must state who produced it`);
      if (!['draft', 'reviewed'].includes(translation.provenance?.status)) bad(`caption ${cue.id} translation ${language}.provenance.status must be draft or reviewed`);
      if (!Number.isSafeInteger(translation.provenance?.revision) || translation.provenance.revision < 1) bad(`caption ${cue.id} translation ${language}.provenance.revision must be a positive integer`);
      byLanguage.set(language, {
        language,
        lines: [...translation.lines],
        sourceCueId: translation.sourceCueId,
        sourceTextSha256: translation.sourceTextSha256,
        provenance: structuredClone(translation.provenance),
      });
    }
    for (const language of translatedLanguages) if (!byLanguage.has(language)) bad(`caption ${cue.id} is missing the requested ${language} translation`);
    if (byLanguage.size !== translatedLanguages.length) bad(`caption ${cue.id} translations do not match the requested display languages`);
    translationRows.set(cue.id, translatedLanguages.map((language) => byLanguage.get(language)));
  }

  const baseDesign = {
    ...design,
    format: CAPTION_DESIGN_FORMAT_V1,
    cues: design.cues.map(({translations: _translations, ...cue}) => cue),
  };
  delete baseDesign.sourceLanguage;
  delete baseDesign.displayLanguages;
  const baseManifest = compileCaptionManifestV1({plan, timeline, design: baseDesign, planSha256, timelineSha256});
  const manifest = structuredClone(baseManifest);
  delete manifest.integrity;
  manifest.format = CAPTION_MANIFEST_FORMAT_V2;
  manifest.sourceLanguage = sourceLanguage;
  manifest.displayLanguages = displayLanguages;
  manifest.cues = manifest.cues.map((cue) => ({...cue, translations: translationRows.get(cue.id) ?? []}));
  manifest.integrity = {manifestSha256: manifestHash(manifest)};
  return manifest;
}

export function compileCaptionManifest(input) {
  if (input?.design?.format === CAPTION_DESIGN_FORMAT_V1) return compileCaptionManifestV1(input);
  if (input?.design?.format === CAPTION_DESIGN_FORMAT_V2) return compileCaptionManifestV2(input);
  bad(`caption design format must be ${CAPTION_DESIGN_FORMAT_V1} or ${CAPTION_DESIGN_FORMAT_V2}`);
}

function verifyCaptionManifestV2(manifest, {plan, timeline, planSha256, timelineSha256}) {
  onlyKeys(manifest, new Set(['format', 'project', 'editPlan', 'timeline', 'sourceClock', 'sources', 'profile', 'coverage', 'cues', 'sourceLanguage', 'displayLanguages', 'integrity']), 'caption manifest/2');
  onlyKeys(manifest.integrity, new Set(['manifestSha256']), 'caption manifest.integrity');
  onlyKeys(manifest.coverage, new Set(['policy', 'excluded']), 'caption manifest.coverage');
  if (manifest?.format !== CAPTION_MANIFEST_FORMAT_V2) bad(`caption manifest format must be ${CAPTION_MANIFEST_FORMAT_V2}`);
  if (manifest.integrity?.manifestSha256 !== manifestHash(manifest)) bad('caption manifest content hash is stale or invalid');
  if (manifest.coverage?.policy !== 'all-retained-speech/1' || manifest.coverage?.excluded?.length) bad('caption manifest has an unsupported or partial speech coverage policy');
  const rebuilt = compileCaptionManifestV2({plan, timeline, design: {
    format: CAPTION_DESIGN_FORMAT_V2,
    projectId: manifest.project?.id,
    revision: manifest.project?.revision,
    planSha256: manifest.editPlan?.planSha256,
    timelineSha256: manifest.timeline?.sha256,
    profile: manifest.profile,
    coveragePolicy: manifest.coverage?.policy,
    sourceLanguage: manifest.sourceLanguage,
    displayLanguages: manifest.displayLanguages,
    exclusions: manifest.coverage?.excluded,
    cues: manifest.cues?.map((cue) => ({
      id: cue.id,
      occurrenceId: cue.anchors?.[0]?.occurrenceId,
      ...(cue.anchors?.[0]?.tokenIds ? {tokenIds: cue.anchors[0].tokenIds} : {segmentId: cue.anchors?.[0]?.segmentId}),
      lines: cue.lines,
      translations: cue.translations,
      displayWindow: {range: {startSample: cue.displayWindow?.startSample, endSample: cue.displayWindow?.endSample, sampleRateHz: cue.displayWindow?.sampleRateHz},
        timingPrecision: cue.displayWindow?.timingPrecision, leadSamples: cue.displayWindow?.leadSamples, holdSamples: cue.displayWindow?.holdSamples,
        ...(cue.displayWindow?.reason ? {reason: cue.displayWindow.reason} : {})},
      reason: cue.reason,
      segmentationDecision: cue.segmentationDecision,
      punctuationDecision: cue.punctuationDecision ?? undefined,
    })),
  }, planSha256, timelineSha256});
  if (stableJson(rebuilt) !== stableJson(manifest)) bad('caption manifest/2 does not match the actual retained timeline anchors, translation bindings, and target ranges');
  return true;
}

export function verifyCaptionManifest(manifest, input) {
  if (manifest?.format === CAPTION_MANIFEST_FORMAT_V1) return verifyCaptionManifestV1(manifest, input);
  if (manifest?.format === CAPTION_MANIFEST_FORMAT_V2) return verifyCaptionManifestV2(manifest, input);
  bad(`caption manifest format must be ${CAPTION_MANIFEST_FORMAT_V1} or ${CAPTION_MANIFEST_FORMAT_V2}`);
}

function captionDisplayLines(manifest, cue) {
  if (manifest?.format === CAPTION_MANIFEST_FORMAT_V1) return cue.lines;
  if (manifest?.format !== CAPTION_MANIFEST_FORMAT_V2 || !Array.isArray(manifest.displayLanguages)) bad('cannot export SRT from an unsupported caption manifest');
  const translations = new Map((cue.translations ?? []).map((translation) => [translation.language, translation]));
  const rows = [];
  for (const language of manifest.displayLanguages) {
    if (language === manifest.sourceLanguage) rows.push(...cue.lines);
    else {
      const translation = translations.get(language);
      if (!translation || translation.sourceCueId !== cue.id || translation.sourceTextSha256 !== hashCaptionLines(cue.lines)) bad(`caption ${cue.id} has a missing or stale ${language} translation`);
      rows.push(...translation.lines);
    }
  }
  return rows;
}

export function captionManifestToSrt(manifest) {
  if (![CAPTION_MANIFEST_FORMAT_V1, CAPTION_MANIFEST_FORMAT_V2].includes(manifest?.format)
    || manifest.integrity?.manifestSha256 !== manifestHash(manifest)) bad('cannot export SRT from an invalid caption manifest');
  const rate = manifest.sourceClock?.sampleRateHz;
  if (!Number.isSafeInteger(rate) || rate < 1) bad('caption manifest has no valid source clock');
  return manifest.cues.map((cue, index) => `${index + 1}\n${timecode(cue.displayWindow.startSample, rate)} --> ${timecode(cue.displayWindow.endSample, rate)}\n${captionDisplayLines(manifest, cue).join('\n')}`).join('\n\n') + '\n';
}
