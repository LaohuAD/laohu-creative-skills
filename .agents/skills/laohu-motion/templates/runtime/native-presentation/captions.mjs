export const CAPTION_MANIFEST_FORMAT = 'laohu.asrcut.caption-manifest/2';
export const SRT_CAPTION_MANIFEST_FORMAT = 'laohu.motion.srt-caption-manifest/1';
export const CAPTION_PROFILE_FORMAT = 'laohu.motion.caption-profile/1';
export const NATIVE_CAPTION_FONT_FAMILY = 'Source Han Sans CN VF';
export const NATIVE_CAPTION_FONT_URL = new URL('./fonts/SourceHanSansCN-700.ttf', import.meta.url).href;

export const DEFAULT_NATIVE_CAPTION_STYLE = Object.freeze({
  fontFamily: NATIVE_CAPTION_FONT_FAMILY,
  fontWeight: 700,
  primarySizeAt1080: 48,
  secondaryScale: 0.7,
  lineHeight: 1.08,
  rowGapAt1080: 2.5,
  horizontalSafeFraction: 0.06,
  bottomSafeFraction: 0.072,
  lowerRegionHeightFraction: 0.28,
  color: '#ffffff',
  outlineColor: '#000000',
  outlineAt1080: 2.5,
  secondaryOutlineScale: 0.7,
  shadowColor: '#000000',
  shadowOpacity: 0.75,
  shadowAngleDeg: -45,
  shadowDistanceAt1080: 5,
  shadowBlurAt1080: 7,
  backplate: null,
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isObject(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }

function validateCaptionStyle(style, {lockedProfile = false} = {}) {
  if (typeof style.fontFamily !== 'string' || !style.fontFamily || /["'\n\r]/.test(style.fontFamily)
    || !Number.isSafeInteger(style.fontWeight) || style.fontWeight < 100 || style.fontWeight > 900
    || !Number.isFinite(style.primarySizeAt1080) || style.primarySizeAt1080 <= 0
    || !Number.isFinite(style.secondaryScale) || style.secondaryScale <= 0 || style.secondaryScale > 1
    || !Number.isFinite(style.lineHeight) || style.lineHeight <= 0
    || !Number.isFinite(style.rowGapAt1080) || style.rowGapAt1080 < 0
    || !Number.isFinite(style.horizontalSafeFraction) || style.horizontalSafeFraction < 0 || style.horizontalSafeFraction >= 0.5
    || !Number.isFinite(style.bottomSafeFraction) || style.bottomSafeFraction < 0 || style.bottomSafeFraction >= 0.5
    || !Number.isFinite(style.lowerRegionHeightFraction) || style.lowerRegionHeightFraction <= 0 || style.lowerRegionHeightFraction > 0.5
    || !Number.isFinite(style.outlineAt1080) || style.outlineAt1080 < 0
    || !Number.isFinite(style.secondaryOutlineScale) || style.secondaryOutlineScale < 0
    || !Number.isFinite(style.shadowOpacity) || style.shadowOpacity < 0 || style.shadowOpacity > 1
    || !Number.isFinite(style.shadowAngleDeg)
    || !Number.isFinite(style.shadowDistanceAt1080) || style.shadowDistanceAt1080 < 0
    || !Number.isFinite(style.shadowBlurAt1080) || style.shadowBlurAt1080 < 0
    || !/^#[0-9a-f]{6}$/i.test(style.color) || !/^#[0-9a-f]{6}$/i.test(style.outlineColor)
    || !/^#[0-9a-f]{6}$/i.test(style.shadowColor)
    || (style.backplate != null && (!isObject(style.backplate) || typeof style.backplate.background !== 'string'
      || !Number.isFinite(style.backplate.paddingAt1080) || style.backplate.paddingAt1080 < 0
      || !Number.isFinite(style.backplate.horizontalPaddingAt1080) || style.backplate.horizontalPaddingAt1080 < 0
      || !Number.isFinite(style.backplate.radiusAt1080) || style.backplate.radiusAt1080 < 0))) {
    fail('invalid-caption-style', 'native caption style contains unsupported values');
  }
  if (lockedProfile && style.backplate !== null) fail('caption-profile-backplate-forbidden', 'locked caption profiles use the stable text treatment and do not add a per-scene backplate');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function stableJson(value) { return JSON.stringify(stableValue(value)); }

async function sha256(value) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') fail('webcrypto-unavailable', 'caption verification needs Web Crypto SHA-256');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const CAPTION_PROFILE_CATALOG = Object.freeze([
  {id: 'native-16x9-outline-2_5', aspectRatio: {width: 16, height: 9}, mode: 'calibration-candidate',
    style: {...DEFAULT_NATIVE_CAPTION_STYLE, outlineAt1080: 2.5}, maxLinesPerLanguage: 1},
  {id: 'native-16x9-outline-3_0', aspectRatio: {width: 16, height: 9}, mode: 'calibration-candidate',
    style: {...DEFAULT_NATIVE_CAPTION_STYLE, outlineAt1080: 3.0}, maxLinesPerLanguage: 1},
  {id: 'native-16x9-outline-3_25', aspectRatio: {width: 16, height: 9}, mode: 'calibration-candidate',
    style: {...DEFAULT_NATIVE_CAPTION_STYLE, outlineAt1080: 3.25}, maxLinesPerLanguage: 1},
  {id: 'native-16x9-standard', aspectRatio: {width: 16, height: 9}, mode: 'locked',
    // Calibrated to the rendered English outline, including the layout's paint padding.
    style: {...DEFAULT_NATIVE_CAPTION_STYLE, outlineAt1080: 3.25, bottomSafeFraction: 0.0195}, maxLinesPerLanguage: 1},
].map(profile => Object.freeze({...profile, aspectRatio: Object.freeze(profile.aspectRatio), style: Object.freeze(profile.style)})));

export const NATIVE_CAPTION_PROFILE_IDS = Object.freeze(CAPTION_PROFILE_CATALOG.map(profile => profile.id));

export async function resolveNativeCaptionProfile(profileId, {width, height, displayLanguages, calibrationMode = false} = {}) {
  const source = CAPTION_PROFILE_CATALOG.find(profile => profile.id === profileId);
  if (!source) fail('unknown-caption-profile', `caption profile ${String(profileId)} is not in the shared native profile registry`);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width * source.aspectRatio.height !== height * source.aspectRatio.width) {
    fail('caption-profile-aspect-mismatch', `caption profile ${source.id} is locked to ${source.aspectRatio.width}:${source.aspectRatio.height}`);
  }
  if (source.mode === 'calibration-candidate' && !calibrationMode) {
    fail('caption-profile-not-locked', `caption profile ${source.id} is a calibration candidate; production requires the selected shared profile to be locked`);
  }
  if (!Array.isArray(displayLanguages) || !displayLanguages.length
    || displayLanguages.some(language => typeof language !== 'string' || !language)) {
    fail('caption-profile-line-count-mismatch', `caption profile ${source.id} needs the manifest's displayed languages`);
  }
  const payload = {format: CAPTION_PROFILE_FORMAT, id: source.id, aspectRatio: structuredClone(source.aspectRatio), mode: source.mode,
    style: structuredClone(source.style), maxLinesPerLanguage: Object.fromEntries(displayLanguages.map(language => [language, source.maxLinesPerLanguage]))};
  validateCaptionStyle(payload.style, {lockedProfile: true});
  return {...payload, integrity: {sha256: await sha256(stableJson(payload))}};
}

export async function verifyNativeCaptionProfileReport(summary, {width, height, displayLanguages, calibrationMode = false} = {}) {
  if (!summary || typeof summary.id !== 'string') fail('invalid-caption-profile-report', 'live consumer reported no selected profile ID');
  const profile = await resolveNativeCaptionProfile(summary.id, {width, height, displayLanguages, calibrationMode});
  const expected = {id: profile.id, mode: profile.mode, aspectRatio: profile.aspectRatio,
    maxLinesPerLanguage: profile.maxLinesPerLanguage, values: profile.style, integritySha256: profile.integrity.sha256};
  if (stableJson(summary) !== stableJson(expected)) {
    fail('caption-profile-report-mismatch', `live caption consumer ${summary.id} does not match the shared profile values and hash`);
  }
  return profile;
}

function bindingFromManifest(manifest) {
  return {
    projectId: manifest?.project?.id,
    revision: manifest?.project?.revision,
    planSha256: manifest?.editPlan?.planSha256,
    timelineSha256: manifest?.timeline?.sha256,
    manifestSha256: manifest?.integrity?.manifestSha256,
  };
}

function validateBindingShape(binding, label) {
  if (!isObject(binding) || typeof binding.projectId !== 'string' || !binding.projectId
    || !Number.isSafeInteger(binding.revision) || binding.revision < 1
    || !/^[a-f0-9]{64}$/.test(binding.planSha256 ?? '')
    || !/^[a-f0-9]{64}$/.test(binding.timelineSha256 ?? '')
    || !/^[a-f0-9]{64}$/.test(binding.manifestSha256 ?? '')) {
    fail('invalid-caption-binding', `${label} must include projectId, revision, and current plan/timeline/manifest SHA-256 values`);
  }
}

export async function verifyCaptionBinding(manifest, expectedBinding) {
  const isSrt = manifest?.format === SRT_CAPTION_MANIFEST_FORMAT;
  if (!isSrt && manifest?.format !== CAPTION_MANIFEST_FORMAT) fail('unsupported-caption-manifest', `native bilingual rendering requires ${CAPTION_MANIFEST_FORMAT} or a compiled Brief SRT source`);
  if (!Array.isArray(manifest.cues) || !manifest.cues.length || !Array.isArray(manifest.displayLanguages) || !manifest.displayLanguages.length) {
    fail('invalid-caption-manifest', 'caption manifest must contain cues and an explicit displayLanguages order');
  }
  const actualBinding = isSrt ? {sourcePath: manifest.source?.path, sourceSha256: manifest.source?.sha256,
    manifestSha256: manifest.integrity?.manifestSha256} : bindingFromManifest(manifest);
  if (isSrt) {
    for (const binding of [actualBinding, expectedBinding]) {
      if (!isObject(binding) || typeof binding.sourcePath !== 'string' || !binding.sourcePath
        || !/^[a-f0-9]{64}$/u.test(binding.sourceSha256 ?? '') || !/^[a-f0-9]{64}$/u.test(binding.manifestSha256 ?? '')) {
        fail('invalid-caption-binding', 'compiled SRT needs its declared source path and both SHA-256 values');
      }
    }
  } else {
    validateBindingShape(expectedBinding, 'expectedBinding');
    validateBindingShape(actualBinding, 'manifest binding');
  }
  for (const key of Object.keys(actualBinding)) {
    if (actualBinding[key] !== expectedBinding[key]) fail('stale-caption-binding', `caption manifest ${key} does not match the current project binding`);
  }

  const copy = structuredClone(manifest);
  delete copy.integrity;
  const digest = await sha256(stableJson(copy));
  if (digest !== actualBinding.manifestSha256) fail('invalid-caption-manifest-hash', 'caption manifest contents do not match integrity.manifestSha256');

  const sourceLanguage = manifest.sourceLanguage;
  if (typeof sourceLanguage !== 'string' || !sourceLanguage) fail('invalid-caption-manifest', 'caption-manifest/2 requires a sourceLanguage');
  if (new Set(manifest.displayLanguages).size !== manifest.displayLanguages.length
    || manifest.displayLanguages.some((language) => typeof language !== 'string' || !language)) {
    fail('invalid-caption-manifest', 'displayLanguages must contain unique non-empty language tags');
  }
  if (manifest.displayLanguages.some((language) => !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language))) {
    fail('invalid-caption-manifest', 'displayLanguages must use BCP 47 language tags');
  }
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(sourceLanguage)) {
    fail('invalid-caption-manifest', 'sourceLanguage must use a BCP 47 language tag');
  }
  let priorEnd = -1;
  const rate = manifest.sourceClock?.sampleRateHz;
  if (!Number.isSafeInteger(rate) || rate < 1 || isSrt && (rate !== 1000 || !manifest.displayLanguages.includes(sourceLanguage))) {
    fail('invalid-caption-manifest', 'caption manifest has no valid source clock and language order');
  }
  const cueIds = new Set();
  for (const cue of manifest.cues) {
    const start = cue?.displayWindow?.startSample;
    const end = cue?.displayWindow?.endSample;
    if (typeof cue?.id !== 'string' || !cue.id || cueIds.has(cue.id)
      || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || start < priorEnd) {
      fail('invalid-caption-manifest', `caption ${cue?.id ?? '(unknown)'} has invalid or duplicate identity, or an invalid or overlapping display window`);
    }
    cueIds.add(cue.id);
    priorEnd = end;
    if (!Array.isArray(cue.lines) || cue.lines.length < 1 || cue.lines.length > 2
      || cue.lines.some((line) => typeof line !== 'string' || !line.trim())) {
      fail('invalid-caption-manifest', `caption ${cue.id} has no valid source-language display lines`);
    }
    if (Object.hasOwn(cue, 'translations') && !Array.isArray(cue.translations)) fail('invalid-caption-manifest', `caption ${cue.id} translations must be an array`);
    const translations = new Map();
    for (const translation of cue.translations ?? []) {
      if (!isObject(translation) || typeof translation.language !== 'string' || !translation.language) {
        fail('invalid-caption-translation', `caption ${cue.id} has a malformed translation row`);
      }
      if (translation.language === sourceLanguage || translations.has(translation.language)) {
        fail('invalid-caption-translation', `caption ${cue.id} repeats or source-matches translation language ${translation.language}`);
      }
      translations.set(translation.language, translation);
    }
    if ([...translations.keys()].some((language) => !manifest.displayLanguages.includes(language))) {
      fail('invalid-caption-translation', `caption ${cue.id} contains a translation language not requested by displayLanguages`);
    }
    for (const language of manifest.displayLanguages) {
      if (language === sourceLanguage) continue;
      const translation = translations.get(language);
      if (!translation || translation.sourceCueId !== cue.id || !Array.isArray(translation.lines)
        || translation.lines.length < 1 || translation.lines.length > 2
        || translation.lines.some((line) => typeof line !== 'string' || !line.trim() || /[\r\n]/.test(line))) {
        fail('invalid-caption-translation', `caption ${cue.id} is missing a valid ${language} row bound to its source cue`);
      }
      if (translation.sourceTextSha256 !== await sha256(stableJson(cue.lines))) {
        fail('stale-caption-translation', `caption ${cue.id} ${language} translation is stale against the current source display lines`);
      }
    }
    if (translations.size !== manifest.displayLanguages.filter((language) => language !== sourceLanguage).length) {
      fail('invalid-caption-translation', `caption ${cue.id} translations do not match the requested displayLanguages`);
    }
  }
  return {...actualBinding, sampleRateHz: rate};
}

function linesForLanguage(manifest, cue, language) {
  if (language === manifest.sourceLanguage) return cue.lines;
  const translation = (cue.translations ?? []).find((row) => row.language === language);
  if (!translation) fail('invalid-caption-translation', `caption ${cue.id} is missing translation ${language}`);
  return translation.lines;
}

function rgba(color, alpha) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) fail('invalid-caption-style', `only six-digit hex shadow colors are supported: ${color}`);
  const value = Number.parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function makeTextNode(document, lines, language, sizePx, style, strokePx, slotCount = lines.length) {
  const lineBoxHeight = sizePx * style.lineHeight;
  const row = document.createElement('div');
  row.lang = language;
  row.dataset.language = language;
  row.style.fontFamily = `"${style.fontFamily}", sans-serif`;
  row.style.fontWeight = String(style.fontWeight);
  row.style.fontSynthesis = 'none';
  row.style.fontSize = `${sizePx}px`;
  row.style.lineHeight = `${lineBoxHeight}px`;
  row.style.height = `${lineBoxHeight * slotCount}px`;
  row.style.display = 'flex';
  row.style.flexDirection = 'column';
  row.style.justifyContent = 'center';
  row.style.boxSizing = 'border-box';
  row.style.letterSpacing = '0';
  row.style.color = style.color;
  row.style.webkitTextStroke = `${strokePx}px ${style.outlineColor}`;
  row.style.paintOrder = 'stroke fill';
  row.style.textShadow = `${(Math.cos(style.shadowAngleDeg * Math.PI / 180) * style.shadowDistanceAt1080 * sizePx / style.primarySizeAt1080).toFixed(2)}px ${(Math.sin(Math.abs(style.shadowAngleDeg) * Math.PI / 180) * style.shadowDistanceAt1080 * sizePx / style.primarySizeAt1080).toFixed(2)}px ${(style.shadowBlurAt1080 * sizePx / style.primarySizeAt1080).toFixed(2)}px ${rgba(style.shadowColor, style.shadowOpacity)}`;
  row.style.textAlign = 'center';
  row.style.whiteSpace = 'nowrap';
  row.style.maxWidth = '100%';
  row.style.margin = '0';
  row.setAttribute('aria-label', lines.join(' '));
  for (let index = 0; index < slotCount; index++) {
    const lineNode = document.createElement('div');
    lineNode.dataset.lineIndex = String(index);
    lineNode.textContent = lines[index] ?? '';
    lineNode.style.height = `${lineBoxHeight}px`;
    lineNode.style.flex = `0 0 ${lineBoxHeight}px`;
    lineNode.style.display = 'flex';
    lineNode.style.alignItems = 'center';
    lineNode.style.justifyContent = 'center';
    lineNode.style.lineHeight = `${lineBoxHeight}px`;
    lineNode.style.whiteSpace = 'nowrap';
    row.append(lineNode);
  }
  return row;
}

function measureRow(row, maxWidthPx, paintPadPx, label) {
  const rect = row.getBoundingClientRect();
  const actualWidth = Math.max(rect.width, row.scrollWidth);
  const actualHeight = Math.max(rect.height, row.scrollHeight);
  if (!Number.isFinite(actualWidth) || actualWidth <= 0 || actualHeight <= 0) fail('caption-measurement-unavailable', `${label} has no measurable rendered glyph box`);
  const paintWidth = actualWidth + paintPadPx * 2;
  if (paintWidth > maxWidthPx + 0.5) {
    fail('caption-overflow', `${label} paint width ${paintWidth.toFixed(1)}px exceeds the ${maxWidthPx.toFixed(1)}px safe width; reflow the cue in the design`);
  }
  return {width: actualWidth, paintWidth, height: actualHeight};
}

function displayRows(manifest, cue, style, logicalHeight) {
  return manifest.displayLanguages.map((language, index) => {
    const lines = linesForLanguage(manifest, cue, language);
    const isPrimary = index === 0;
    const sizePx = (style.primarySizeAt1080 * logicalHeight / 1080) * (isPrimary ? 1 : style.secondaryScale);
    const strokePx = (style.outlineAt1080 * logicalHeight / 1080) * (isPrimary ? 1 : style.secondaryOutlineScale);
    return {language, lines, sizePx, strokePx, isPrimary};
  });
}

function buildCueNode(document, manifest, cue, style, logicalWidth, logicalHeight, maxWidthPx, maxLinesPerLanguage) {
  const group = document.createElement('div');
  group.dataset.captionCue = cue.id;
  group.style.display = 'flex';
  group.style.flexDirection = 'column';
  group.style.alignItems = 'center';
  group.style.justifyContent = 'center';
  group.style.width = '100%';
  group.style.maxWidth = `${maxWidthPx}px`;
  group.style.margin = '0 auto';
  group.style.gap = `${style.rowGapAt1080 * logicalHeight / 1080}px`;
  group.style.padding = '0';
  group.style.boxSizing = 'border-box';
  if (style.backplate) {
    group.style.background = style.backplate.background;
    group.style.padding = `${style.backplate.paddingAt1080 * logicalHeight / 1080}px ${style.backplate.horizontalPaddingAt1080 * logicalHeight / 1080}px`;
    group.style.borderRadius = `${style.backplate.radiusAt1080 * logicalHeight / 1080}px`;
  }
  const rowSpecs = displayRows(manifest, cue, style, logicalHeight);
  for (const [index, rowSpec] of rowSpecs.entries()) {
    const slotCount = maxLinesPerLanguage[rowSpec.language] ?? rowSpec.lines.length;
    if (rowSpec.lines.length > slotCount) fail('caption-profile-line-count-mismatch', `caption ${cue.id} ${rowSpec.language} exceeds its fixed ${slotCount}-line profile slot`);
    const row = makeTextNode(document, rowSpec.lines, rowSpec.language, rowSpec.sizePx, style, rowSpec.strokePx, slotCount);
    row.dataset.rowIndex = String(index);
    group.append(row);
  }
  return {group, rowSpecs};
}

export async function createNativeCaptionTrack({
  element,
  manifest,
  expectedBinding,
  width = 1920,
  height = 1080,
  style: styleOverrides,
  profileId,
  textRuntime,
  captionContext,
  expectedBriefSha256,
  fontUrl = NATIVE_CAPTION_FONT_URL,
} = {}) {
  if (!element || !element.ownerDocument) fail('invalid-caption-host', 'a real DOM element is required as the caption overlay host');
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) fail('invalid-caption-size', 'logical output width and height must be positive integers');
  const binding = await verifyCaptionBinding(manifest, expectedBinding);
  const briefBound = textRuntime != null;
  if (manifest.format === SRT_CAPTION_MANIFEST_FORMAT && !briefBound) fail('caption-text-contract-required', 'compiled SRT captions require the current Brief text runtime');
  let verifiedProfile = null;
  let maxLinesPerLanguage;
  let style;
  if (briefBound) {
    if (typeof profileId !== 'string' || !profileId) fail('caption-profile-required', 'brief-bound bilingual captions must select a profile ID from the shared registry');
    if (styleOverrides !== undefined) fail('caption-profile-overrides-forbidden', 'brief-bound captions cannot receive per-call style overrides');
    if (typeof captionContext !== 'function') fail('caption-context-required', 'brief-bound captions require the selected direction and actual scene/object context for each cue');
    if (typeof textRuntime.assertBriefSha256 !== 'function' || typeof textRuntime.validateCaptionManifest !== 'function'
      || typeof textRuntime.recordCaptionProfile !== 'function' || typeof textRuntime.caption !== 'function') {
      fail('caption-text-contract-required', 'caption consumer needs the current compiled Brief text runtime');
    }
    if (typeof expectedBriefSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedBriefSha256)) {
      fail('caption-brief-hash-required', 'caption consumer must bind to the current preflight Brief hash');
    }
    textRuntime.assertBriefSha256(expectedBriefSha256);
    textRuntime.validateCaptionManifest(manifest);
    verifiedProfile = await resolveNativeCaptionProfile(profileId, {width, height, displayLanguages: manifest.displayLanguages,
      calibrationMode: textRuntime.calibrationProbe === true});
    textRuntime.recordCaptionProfile(verifiedProfile);
    style = structuredClone(verifiedProfile.style);
    maxLinesPerLanguage = verifiedProfile.maxLinesPerLanguage;
  } else {
    if (profileId) fail('caption-profile-needs-brief-binding', 'a shared profile ID must be consumed through the current Brief text runtime');
    style = {...DEFAULT_NATIVE_CAPTION_STYLE, ...(styleOverrides ?? {})};
    maxLinesPerLanguage = Object.fromEntries(manifest.displayLanguages.map(language => [language,
      Math.max(1, ...manifest.cues.map(cue => linesForLanguage(manifest, cue, language).length))]));
  }
  validateCaptionStyle(style, {lockedProfile: briefBound});
  const document = element.ownerDocument;
  if (Math.abs(element.clientWidth - width) > 1 || Math.abs(element.clientHeight - height) > 1) {
    fail('caption-host-size-mismatch', `caption host layout size must match the declared ${width}×${height} logical output; received ${element.clientWidth}×${element.clientHeight}`);
  }
  const FontFaceClass = document.defaultView?.FontFace ?? globalThis.FontFace;
  if (typeof FontFaceClass !== 'function' || !document.fonts) fail('font-api-unavailable', 'native caption rendering requires FontFace and document.fonts');
  const face = new FontFaceClass(style.fontFamily, `url("${fontUrl}")`, {weight: String(style.fontWeight), style: 'normal'});
  await face.load();
  document.fonts.add(face);
  await document.fonts.ready;
  const fontSize = Math.max(12, style.primarySizeAt1080 * height / 1080);
  if (face.status !== 'loaded' || !document.fonts.check(`${style.fontWeight} ${fontSize}px "${style.fontFamily}"`, '中文 Caption 123')) {
    fail('caption-font-not-ready', `the selected ${style.fontFamily} face was not ready before measurement`);
  }

  const maxWidthPx = width * (1 - style.horizontalSafeFraction * 2);
  const bottomSafePx = height * style.bottomSafeFraction;
  const maxGroupHeightPx = height * style.lowerRegionHeightFraction;
  const scale = height / 1080;
  const maxPaintPadPx = (style.outlineAt1080 + style.shadowBlurAt1080 + style.shadowDistanceAt1080) * scale;
  const probeRoot = document.createElement('div');
  probeRoot.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;visibility:hidden;pointer-events:none;overflow:visible;`;
  document.body.append(probeRoot);
  const geometry = [];
  try {
    for (const cue of manifest.cues) {
      const {group, rowSpecs} = buildCueNode(document, manifest, cue, style, width, height, maxWidthPx, maxLinesPerLanguage);
      group.style.position = 'relative';
      group.style.width = `${maxWidthPx}px`;
      probeRoot.append(group);
      const rowMetrics = [];
      const paintPads = [];
      for (const [index, row] of [...group.children].entries()) {
        const shadowScale = rowSpecs[index].sizePx / style.primarySizeAt1080;
        const paintPadPx = rowSpecs[index].strokePx + (style.shadowBlurAt1080 + style.shadowDistanceAt1080) * shadowScale * scale;
        paintPads.push(paintPadPx);
        rowMetrics.push(measureRow(row, maxWidthPx, paintPadPx, `caption ${cue.id} ${rowSpecs[index].language}`));
      }
      const groupRect = group.getBoundingClientRect();
      const paintHeight = groupRect.height + 2 * Math.max(...paintPads);
      if (paintHeight > maxGroupHeightPx) fail('caption-overflow', `caption ${cue.id} paint group exceeds the reserved lower screen region`);
      geometry.push({cueId: cue.id, width: Math.max(...rowMetrics.map((row) => row.paintWidth)), height: paintHeight,
        layoutHeight: groupRect.height, rowMetrics, maxWidthPx, bottomSafePx, paintPadPx: Math.max(...paintPads)});
      group.remove();
    }
  } finally {
    probeRoot.remove();
  }

  const hostStyle = document.defaultView.getComputedStyle(element);
  if (hostStyle.position === 'static') element.style.position = 'relative';
  const root = document.createElement('div');
  root.dataset.nativeCaptionTrack = 'laohu.caption-track/1';
  root.style.position = 'absolute';
  root.style.left = `${style.horizontalSafeFraction * 100}%`;
  root.style.width = `${(1 - style.horizontalSafeFraction * 2) * 100}%`;
  root.style.bottom = `calc(${style.bottomSafeFraction * 100}% + ${maxPaintPadPx}px)`;
  root.style.zIndex = '100';
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.justifyContent = 'center';
  root.style.pointerEvents = 'none';
  root.style.boxSizing = 'border-box';
  root.setAttribute('aria-live', 'off');
  element.append(root);

  let currentCueId = null;
  function render(t) {
    if (!Number.isFinite(t) || t < 0) fail('invalid-render-time', 'render(t) expects a non-negative absolute time in seconds');
    const atSample = t * binding.sampleRateHz;
    const sample = Math.floor(atSample + Number.EPSILON * atSample);
    let low = 0, high = manifest.cues.length - 1, cue = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = manifest.cues[middle];
      if (t < candidate.displayWindow.startSample / binding.sampleRateHz) high = middle - 1;
      else if (t >= candidate.displayWindow.endSample / binding.sampleRateHz) low = middle + 1;
      else { cue = candidate; break; }
    }
    if (!cue) {
      if (currentCueId != null) root.replaceChildren();
      currentCueId = null;
      return {visible: false, cueId: null, sample};
    }
    if (currentCueId !== cue.id) {
      const {group} = buildCueNode(document, manifest, cue, style, width, height, maxWidthPx, maxLinesPerLanguage);
      group.style.textAlign = 'center';
      group.dataset.binding = binding.manifestSha256;
      root.replaceChildren(group);
      currentCueId = cue.id;
    }
    const rendered = root.firstElementChild;
    if (briefBound) {
      for (const language of manifest.displayLanguages) {
        const row = [...rendered.children].find(candidate => candidate.dataset.language === language);
        if (!row) fail('caption-profile-language-row-missing', `caption ${cue.id} ${language} has no fixed profile row`);
        const supplied = captionContext({cue, language, time: t, sample});
        if (!isObject(supplied)) fail('caption-context-required', `caption ${cue.id} ${language} needs direction, scene and object context`);
        const context = {...supplied, time: t};
        textRuntime.caption(context, `cue:${cue.id}:${language}`, exact => {
          const exactLines = exact.split('\n');
          if (exactLines.length > row.children.length) fail('caption-profile-line-count-mismatch', `caption ${cue.id} ${language} exceeds its fixed line slots`);
          for (let index = 0; index < row.children.length; index++) row.children[index].textContent = exactLines[index] ?? '';
          row.setAttribute('aria-label', exactLines.join(' '));
          row.dataset.briefTextFrame = String(t);
          if (!row.isConnected) fail('caption-consumer-detached', `caption ${cue.id} ${language} was not attached to the live overlay before its consumer trace`);
          const rowBox = row.getBoundingClientRect();
          if (!(rowBox.width > 0 && rowBox.height > 0)) fail('caption-consumer-not-measurable', `caption ${cue.id} ${language} has no live layout box`);
        });
      }
    }
    const box = rendered.getBoundingClientRect();
    const hostBox = element.getBoundingClientRect();
    const widthFactor = hostBox.width / width;
    const heightFactor = hostBox.height / height;
    if (briefBound && Math.abs(widthFactor - heightFactor) > 1e-5) {
      fail('caption-nonuniform-output-scale', 'locked caption profiles require proportional output scaling in both dimensions');
    }
    const safeWidth = hostBox.width * (1 - style.horizontalSafeFraction * 2);
    const renderPaintPad = maxPaintPadPx * heightFactor;
    if (box.width > safeWidth + 0.5 || box.height + renderPaintPad * 2 > hostBox.height * style.lowerRegionHeightFraction + 0.5) {
      fail('caption-overflow', `caption ${cue.id} exceeds the measured stage safe area at this render size`);
    }
    return {visible: true, cueId: cue.id, sample, displayWindow: {...cue.displayWindow}, rows: manifest.displayLanguages.length,
      measured: {width: box.width, height: box.height, outputScale: {x: widthFactor, y: heightFactor}}, binding};
  }

  return {
    binding,
    style: structuredClone(style),
    profile: verifiedProfile ? structuredClone(verifiedProfile) : null,
    geometry,
    render,
    destroy() { root.remove(); face.status === 'loaded' && document.fonts.delete(face); },
  };
}
