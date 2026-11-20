import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {compilePlan, hashPlan, verifyPlanEvidence} from '../../../laohu-asrcut/scripts/asrcut.mjs';
import {resolveMotionRuntime, managedMotionRuntimeRoot, ensureManagedMotionBrowser} from '../../scripts/laohu-motion-runtime.mjs';
import {assembleTransitionFilm, parseIncomingTransition, projectFilmEvents, renderTransitionWindow, resolveFilmTransitions} from './laohu-film.mjs';
import {adaptStyleCodeContent, validateContentSource, STYLE_CONTENT_ADAPTER_MANIFEST} from './style-content-adapter.mjs';
import {createProjectShotEntrypoint, createProjectShotReceipt, projectShotWebpackAliases, resolveProjectShotModule, stageProjectShotAssets, verifyProjectShotReceipt} from './laohu-project-shot.mjs';

const adapterDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(adapterDir, '../..');
const repoRoot = path.resolve(skillDir, '../../..');
const catalogPath = path.join(skillDir, 'templates/catalog.json');
const runtimeManifest = path.join(skillDir, 'templates/runtime/laohu-remotion/package.json');
const runtimeLock = path.join(skillDir, 'templates/runtime/laohu-remotion/package-lock.json');
const styleIndexPath = path.join(skillDir, 'templates/styles/index.json');
const compatibilityStyleIndexPath = path.join(skillDir, 'templates/styles/compatibility-index.json');
const styleRoot = path.join(skillDir, 'templates/styles');
const sourceId = 'video-shotcraft';
const sourceCommit = '1266a3ec4831289c4d893d42dd5102723658039a';
const styleLibrarySourceId = 'laohu-style-library';
const templatesRoot = path.join(skillDir, 'templates');
const runtimeParent = path.join(templatesRoot, 'runtime');
const localRuntimeRoot = path.join(runtimeParent, 'laohu-remotion');
const FILM_FORMAT_V2 = 'laohu.huashu-film-blueprint/2';
const FILM_MANIFEST_FORMAT = 'laohu.motion-film-manifest/2';
const MOTION_SCENE_FORMAT = 'motion-scene-v1';
const NATIVE_OM_FILM_FORMAT = 'laohu.huashu-film-blueprint/1';
const templateCli = path.join(skillDir, 'scripts/templates.mjs');
const EPS = 1e-9;
const CUES_FOR_LIST_STACK = [6, 18, 30, 42, 54];
const LIST_STACK_FINAL_VIEW = Object.freeze({frame:82, cx:960, cy:815, zoom:0.86, width:1920, height:1080});
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MotionOps = createRequire(import.meta.url)('../../scripts/motion-ops.js');
const findSceneAudioEvents = MotionOps.findSceneAudioEvents;

const EXPORTED_FIELDS = Object.freeze({
  'video-shotcraft-list-stack-five': new Set(['contentUse', 'pageImage', 'pageImageLicense', 'pageHeight', 'cards', 'counterLabel', 'counterCaption']),
  'video-shotcraft-paper-title-card': new Set(['duration', 'words', 'sub', 'subDigits', 'fontSize', 'ink', 'accent', 'muted', 'paper', 'theme', 'colors']),
  'video-shotcraft-paper-title-card-gallery': new Set(),
  'video-shotcraft-text-reveal': new Set(['text', 'start', 'by', 'variant', 'each', 'gap', 'ease', 'style', 'unitStylePreset', 'out']),
  'video-shotcraft-sheen': new Set(['progress', 'progressTrack', 'color', 'width', 'angle', 'strength']),
  'video-shotcraft-stage': new Set(['look', 'keyLight', 'fill', 'horizon', 'intensity', 'breathe', 'grain', 'vignette', 'style', 'backgroundDecor']),
  'video-shotcraft-speed-blur': new Set(['vx', 'vy', 'amount', 'max', 'style', 'content']),
  'video-shotcraft-grain': new Set(['opacity', 'step', 'scale', 'freq', 'blend', 'style']),
  'video-shotcraft-backdrop': new Set(['tone', 'light', 'accent', 'grain', 'vignette', 'drift', 'style']),
  'video-shotcraft-clip-card': new Set(['src', 'caption', 'size', 'radius', 'muted', 'captionSize', 'startFrom', 'durationInFrames', 'loopDurationInFrames', 'loopCrossfadeInFrames', 'assetLicense']),
  'video-shotcraft-flash-cut': new Set(['duration']),
  'video-shotcraft-grain-dissolve': new Set(['brandName']),
  'laohu-motion-layer-router': new Set(),
  'laohu-authored-shot': new Set(['shotId', 'parameters']),
  'laohu-typography-track-in': new Set(['text', 'family', 'size', 'weight', 'at', 'dur', 'from', 'to', 'color', 'style']),
  'laohu-background-flow-field': new Set(['seed', 'zones', 'color', 'period', 'lines', 'steps', 'stepLength']),
  'laohu-character-walk-cycle': new Set(['originX', 'ground', 'speed', 'period', 'legLength', 'color']),
  'laohu-data-animated-bars': new Set(['data', 'width', 'height', 'family', 'domain', 'rank', 'sourceLabel', 'suffix', 'decimals', 'startFrame', 'endFrame', 'fromProgress', 'toProgress']),
  'laohu-media-photo-montage': new Set(['slots', 'background']),
  'laohu-three-volume': new Set(['theme', 'state', 'waveOffset', 'clay']),
  'laohu-transition-overlap': new Set(['textA', 'textB', 'colorA', 'colorB', 'background', 'family', 'size', 'weight', 'startFrame', 'endFrame', 'method', 'direction', 'softness', 'width', 'height', 'center', 'moveOutgoing', 'axis', 'distance', 'origin', 'factor', 'perspective', 'maxBlur']),
  'laohu-style-code-canvas': new Set(['styleId', 'content', 'contentSource']),
});
const PLACEMENT_REQUIRED = new Set(['video-shotcraft-text-reveal', 'video-shotcraft-sheen', 'video-shotcraft-speed-blur', 'video-shotcraft-clip-card', 'laohu-typography-track-in', 'laohu-data-animated-bars']);
const MATERIAL_PLACEMENT = new Set(['video-shotcraft-grain', 'video-shotcraft-backdrop']);
const PLACEMENT_SUPPORTED = new Set([...PLACEMENT_REQUIRED, ...MATERIAL_PLACEMENT]);

function fail(message) { throw new Error(message); }
function obj(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`); return value; }
function keys(value, allowed, label) { for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label}.${key} is not consumed by the verified Shotcraft adapter`); }
function finite(value, label, {min = -Infinity, max = Infinity, integer = false} = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) fail(`${label} must be a finite ${integer ? 'integer' : 'number'} in [${min}, ${max}]`);
  return value;
}
function validateGlyphOutline(value, label) {
  obj(value, label);
  const fields = new Set(['char','font','upm','ascender','descender','xHeight','capHeight','advance','d','contours']);
  keys(value, fields, label);
  if (typeof value.char !== 'string' || Array.from(value.char).length !== 1) fail(`${label}.char must be exactly one Unicode scalar`);
  if (typeof value.font !== 'string' || !value.font.trim() || value.font.length > 160) fail(`${label}.font must be a non-empty font family name of at most 160 characters`);
  finite(value.upm, `${label}.upm`, {min:1,max:100000,integer:true});
  for (const field of ['ascender','descender','xHeight','capHeight','advance']) finite(value[field], `${label}.${field}`, {min:-100000,max:100000,integer:true});
  if (value.advance < 0) fail(`${label}.advance must be non-negative`);
  if (typeof value.d !== 'string' || !value.d.trim() || value.d.length > 2_000_000) fail(`${label}.d must be a non-empty SVG path string of at most 2,000,000 characters`);
  if (!Array.isArray(value.contours) || value.contours.length < 1 || value.contours.length > 256) fail(`${label}.contours must contain 1–256 glyph contours`);
  let pointCount = 0;
  for (const [contourIndex, contour] of value.contours.entries()) {
    if (!Array.isArray(contour) || contour.length < 1 || contour.length > 4096) fail(`${label}.contours[${contourIndex}] must contain 1–4096 points`);
    pointCount += contour.length;
    if (pointCount > 32768) fail(`${label}.contours may contain at most 32,768 points total`);
    for (const [pointIndex, point] of contour.entries()) {
      if (!Array.isArray(point) || point.length !== 3) fail(`${label}.contours[${contourIndex}][${pointIndex}] must be [x,y,onCurve]`);
      finite(point[0], `${label}.contours[${contourIndex}][${pointIndex}].x`, {min:-100000,max:100000,integer:true});
      finite(point[1], `${label}.contours[${contourIndex}][${pointIndex}].y`, {min:-100000,max:100000,integer:true});
      if (![0,1].includes(point[2])) fail(`${label}.contours[${contourIndex}][${pointIndex}].onCurve must be 0 or 1`);
    }
  }
  return value;
}
function stableId(value, label) { if (typeof value !== 'string' || !ID.test(value)) fail(`${label} must be a stable ID`); return value; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
function consumedLayerRecord(layer) {
  const props = deepClone(layer.props || {});
  const derivedPatch = props.derivedPatch;
  const canvasCodeSpec = props.canvasCodeSpec;
  const contentBinding = props.contentBinding;
  const sourceCodeEvidence = props.sourceCodeEvidence;
  delete props.derivedPatch;
  delete props.canvasCodeSpec;
  delete props.contentBinding;
  delete props.sourceCodeEvidence;
  const styleCode = canvasCodeSpec && sourceCodeEvidence ? {
    styleId:canvasCodeSpec.styleId,
    durationInFrames:canvasCodeSpec.durationInFrames,
    style:sourceCodeEvidence.style,
    sourceCode:sourceCodeEvidence.sourceCode,
  } : null;
  return {id:layer.id || null, catalogId:layer.catalogId, props,
    ...(layer.placement ? {placement:layer.placement} : {}),
    ...(derivedPatch ? {derivedPatch} : {}),
    ...(contentBinding ? {contentBinding} : {}),
    ...(styleCode ? {styleCode} : {})};
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function closeTo(a, b, tolerance = 1e-8) { return Math.abs(a - b) <= tolerance; }
function isWithin(parent, child) { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); }
function hex(value, label) { if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail(`${label} must be #RRGGBB`); return value; }
function validateDeclaredLocalParameters(entry, parameters) {
  const declared = entry.parameters?.supported;
  if (!Array.isArray(declared)) return;
  const byName = new Map(declared.map((row) => [row.name, row]));
  for (const [name, value] of Object.entries(parameters)) {
    const row = byName.get(name);
    if (!row || value == null) continue;
    if (row.fixedValue !== undefined && value !== row.fixedValue) fail(`${entry.id}.${name} is fixed to ${JSON.stringify(row.fixedValue)} by the local renderer contract`);
    if (row.type === 'number' || row.type === 'integer') {
      finite(value, `${entry.id}.${name}`, {min: row.min ?? -Infinity, max: row.max ?? Infinity, integer: row.type === 'integer'});
    } else if (row.type === 'boolean' && typeof value !== 'boolean') {
      fail(`${entry.id}.${name} must be a boolean`);
    } else if (row.type === 'enum' && !row.values?.includes(value)) {
      fail(`${entry.id}.${name} must be one of ${JSON.stringify(row.values || [])}`);
    } else if (row.type === 'single-line string') {
      if (typeof value !== 'string') fail(`${entry.id}.${name} must be a string`);
      const length = Array.from(value).length;
      if (row.minLength != null && length < row.minLength) fail(`${entry.id}.${name} must contain at least ${row.minLength} characters`);
      if (row.maxLength != null && length > row.maxLength) fail(`${entry.id}.${name} must contain at most ${row.maxLength} characters`);
    }
  }
}
function finiteRange(object, fields, label) {
  obj(object, label); keys(object, new Set(fields), label);
  for (const field of fields) finite(object[field], `${label}.${field}`, {min: 0, max: 1});
  return object;
}
function validatePlacement(value, label, {required = false} = {}) {
  if (value == null) {
    if (required) fail(`${label} is required so this local component has an explicit composition target`);
    return null;
  }
  obj(value, label);
  keys(value, new Set(['x', 'y', 'width', 'height', 'clip', 'alignX', 'alignY']), label);
  const x = finite(value.x, `${label}.x`, {min: -1920, max: 3840, integer: true});
  const y = finite(value.y, `${label}.y`, {min: -1080, max: 2160, integer: true});
  const width = finite(value.width, `${label}.width`, {min: 1, max: 3840, integer: true});
  const height = finite(value.height, `${label}.height`, {min: 1, max: 2160, integer: true});
  if (x + width <= 0 || y + height <= 0 || x >= 1920 || y >= 1080) fail(`${label} rectangle must intersect the declared 1920×1080 composition`);
  if (value.clip != null && typeof value.clip !== 'boolean') fail(`${label}.clip must be boolean`);
  if (value.alignX != null && !['left', 'center', 'right'].includes(value.alignX)) fail(`${label}.alignX must be left, center, or right`);
  if (value.alignY != null && !['top', 'center', 'bottom'].includes(value.alignY)) fail(`${label}.alignY must be top, center, or bottom`);
  return {x, y, width, height, clip: value.clip !== false, alignX: value.alignX || 'left', alignY: value.alignY || 'top'};
}
function validateLayerPlacement(catalogId, value, label) {
  const required = PLACEMENT_REQUIRED.has(catalogId);
  if (value == null) {
    if (required) fail(`${label} is required so this local component has an explicit composition target`);
    return null;
  }
  if (!PLACEMENT_SUPPORTED.has(catalogId)) fail(`${catalogId} does not support local placement; preserve its native source bounds`);
  if (MATERIAL_PLACEMENT.has(catalogId)) {
    obj(value, label);
    keys(value, new Set(['x', 'y', 'width', 'height']), label);
    const rect = validatePlacement(value, label);
    return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
  }
  return validatePlacement(value, label, {required});
}

async function loadCatalog() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  if (!Array.isArray(catalog.sources)) fail('Motion production catalog has no minimal source pins');
  return catalog;
}
function getEntry(catalog, id) {
  const entry = catalog.templates.find((row) => row.renderer === 'video-shotcraft-remotion'
    && (row.id === id || row.productionId === id || row.aliases?.includes(id) || row.legacyIds?.includes(id)));
  if (!entry) fail(`Unknown callable Shotcraft template ${id}`);
  if (entry.renderer !== 'video-shotcraft-remotion') fail(`${id} is not routed to video-shotcraft-remotion`);
  if (entry.availability === 'source-only') fail(`${id} remains source-only and cannot be rendered`);
  if (!entry.renderPreconditions?.length) fail(`${id} has no declared render preconditions`);
  return entry;
}
function resolveCatalogEntry(catalog, entry) {
  if (!Array.isArray(catalog?.templates) || typeof entry?.id !== 'string') return entry;
  const matches = catalog.templates.filter((row) => row.renderer === 'video-shotcraft-remotion'
    && (row.id === entry.id || row.productionId === entry.id || (entry.productionId && row.productionId === entry.productionId)));
  if (matches.length > 1) fail(`Shotcraft entry identity ${entry.id} is ambiguous in the production catalog`);
  return matches[0] || entry;
}
function isFullSceneEntry(entry) { return ['full-scene', 'source-adapted-full-scene'].includes(entry?.component?.kind); }

export async function verifyStyleLibraryEntry(catalog, entry) {
  const library = catalog.styleLibrary;
  const compatibilityRepository = library?.compatibilitySourceRepository;
  const compatibilityCommit = library?.compatibilitySourceCommit;
  const componentPath = 'templates/runtime/laohu-remotion/components/styles/code-canvas.tsx';
  if (!library || library.format !== 'laohu.motion.style-library/1'
      || library.indexPath !== 'templates/styles/index.json'
      || library.compatibilityIndexPath !== 'templates/styles/compatibility-index.json'
      || library.compatibilityLicensePath !== 'templates/styles/licenses/LICENSE'
      || library.compatibilityStyleCount !== 25 || library.compatibilityPreviewCount !== 25
      || compatibilityRepository !== 'https://github.com/wqb578/code-animation-341-styles'
      || compatibilityCommit !== '01576924a2b316d1f11ae33f75d3c005e8781451'
      || library.compatibilitySourceIndexSha256 !== '5649497294ff60d0ae1a33780ab59ea7e3bad1f5f777b566ecc23c37aaccdd27') {
    fail('local ordinary style index and separately pinned 25-entry legacy compatibility index are incomplete');
  }
  if (entry.id !== 'laohu-style-code-canvas' || entry.productionId !== 'laohu-style-code-canvas'
      || entry.sourceId !== styleLibrarySourceId || entry.sourcePath !== 'local:templates/styles/entries/F1.md+F2.md'
      || entry.availability !== 'available' || entry.callable !== true || entry.renderer !== 'video-shotcraft-remotion'
      || !entry.renderPreconditions?.length || entry.adapter?.entrypoint !== 'templates/adapters/video-shotcraft-entry.tsx'
      || entry.adapter?.localComponentRouter !== 'templates/runtime/laohu-remotion/components/styles/code-canvas.tsx'
      || !Array.isArray(entry.fidelityModes) || canonical(entry.fidelityModes) !== canonical(['native-props'])
      || entry.licenseId !== '341-CUSTOM-NONCOMMERCIAL'
      || !Array.isArray(entry.styleIds) || canonical(entry.styleIds) !== canonical(['F1','F2'])
      || entry.component?.path !== componentPath || entry.component?.exportName !== 'CanvasCodeStyle'
      || entry.component?.kind !== 'full-scene') {
    fail(`${entry.id} is not the pinned F1/F2 full-scene consumer of the original CanvasCodeStyle`);
  }
  const componentAbsolute = path.resolve(skillDir, componentPath);
  if (!isWithin(templatesRoot, componentAbsolute)) fail(`${entry.id} CanvasCodeStyle path escaped templates`);
  const componentStat = await fs.lstat(componentAbsolute).catch((error) => fail(`${entry.id} CanvasCodeStyle is missing: ${error.message}`));
  if (!componentStat.isFile() || componentStat.isSymbolicLink()) fail(`${entry.id} CanvasCodeStyle must be a regular local file`);
  const componentBytes = await fs.readFile(componentAbsolute);
  const componentHash = sha256(componentBytes);
  if (componentHash !== entry.component.sha256 || componentHash !== entry.component.localSha256) fail(`${entry.id} CanvasCodeStyle SHA-256 differs from its catalog lock`);
  const ordinaryIndexBytes = await fs.readFile(path.resolve(skillDir, library.indexPath));
  if (sha256(ordinaryIndexBytes) !== library.indexSha256) fail('ordinary style index SHA-256 differs from its catalog pin');
  const ordinaryIndex = JSON.parse(ordinaryIndexBytes.toString('utf8'));
  if (ordinaryIndex.format !== library.format || ordinaryIndex.coverage?.styleCount !== library.styleCount
      || ordinaryIndex.coverage?.previewCount !== library.previewCount
      || ordinaryIndex.entries?.length !== library.styleCount
      || ordinaryIndex.entries.some((row) => row.route?.kind !== 'reference-style' || row.route.callable !== false)) {
    fail('ordinary style index disagrees with its catalog coverage or contains a non-reference route');
  }
  const indexBytes = await fs.readFile(compatibilityStyleIndexPath);
  if (sha256(indexBytes) !== library.compatibilityIndexSha256) fail('legacy compatibility index SHA-256 differs from its catalog pin');
  const index = JSON.parse(indexBytes.toString('utf8'));
  if (index.format !== library.format || index.coverage?.styleCount !== library.compatibilityStyleCount
      || index.coverage?.previewCount !== library.compatibilityPreviewCount
      || index.source?.repository !== compatibilityRepository || index.source?.commit !== compatibilityCommit
      || index.source?.sourceIndexSha256 !== library.compatibilitySourceIndexSha256
      || index.source?.sourceAttribution !== library.compatibilitySourceAttribution
      || index.entries?.length !== library.compatibilityStyleCount
      || index.entries.some((row) => row.route?.kind !== 'remotion-canvas-function' || row.route.callable !== true)) {
    fail('legacy compatibility index disagrees with its catalog/source-repository pin');
  }
  const licensePath = path.resolve(skillDir, library.compatibilityLicensePath);
  const stylesRoot = path.resolve(skillDir, 'templates/styles');
  if (!isWithin(stylesRoot, licensePath)) fail('style library license path escaped templates/styles');
  const licenseBytes = await fs.readFile(licensePath).catch((error) => fail(`style library license is missing: ${error.message}`));
  const licenseIndexRow=index.licenses?.find((row)=>row.localPath==='licenses/LICENSE');
  if (!licenseIndexRow || sha256(licenseBytes)!==licenseIndexRow.sha256 || path.relative(stylesRoot,licensePath)!==licenseIndexRow.localPath) fail('the pinned custom non-commercial license bytes differ from the style index');
  const styleRecords = [];
  for (const styleId of entry.styleIds) {
    const {row, contentHash, helperHash} = await loadCallableStyle(styleId);
    if (row.licenseId !== entry.licenseId || row.route.componentPath !== componentPath
        || row.route.componentLocalSha256 !== componentHash
        || row.route.sourceFunctionSha256 !== STYLE_CONTENT_ADAPTER_MANIFEST.styles[styleId]?.sourceFenceSha256) {
      fail(`${styleId} source index does not bind to this component and literal adapter manifest`);
    }
    styleRecords.push({id:styleId,sourcePath:row.sourcePath,sourceSha256:row.sourceSha256,localPath:row.contentPath,localSha256:contentHash,sourceFunctionSha256:row.route.sourceFunctionSha256,helperSourcePath:row.route.sharedHelperPath,helperSha256:helperHash,licenseId:row.licenseId});
  }
  return {
    sourceId:styleLibrarySourceId,
    sourceCommit:compatibilityCommit,
    sourceRepository:compatibilityRepository,
    componentPath:entry.component.path,
    componentSha256:componentHash,
    componentLocalPath:componentPath,
    componentLocalSha256:componentHash,
    licenseId:entry.licenseId,
    licensePath:library.compatibilityLicensePath,
    licenseSha256:sha256(licenseBytes),
    indexPath:library.compatibilityIndexPath,
    indexSha256:sha256(indexBytes),
    sourceIndexSha256:index.source.sourceIndexSha256,
    supportedStyleIds:entry.styleIds,
    styles:styleRecords,
    upstreamTreeRequiredAtRuntime:false,
  };
}

async function verifySourceAndEntry(catalog, entry) {
  if (entry.sourceId === styleLibrarySourceId) return verifyStyleLibraryEntry(catalog, entry);
  if (entry.sourceId === 'fy-code-animation' && entry.component?.local === true) {
    return verifyFoundationShotEntry(catalog, entry);
  }
  if (entry.sourceId === 'fy-code-animation') return verifyFyComponentEntry(catalog, entry);
  const source = catalog.sources.find((row) => row.id === sourceId);
  if (!source || source.commit !== sourceCommit || source.sourcePathPrefix !== 'templates/upstream/video-shotcraft') fail('Shotcraft catalog source pin/path prefix does not match approved commit');
  const ledger = new Map((source.files || []).map((row) => [row.path, row]));
  const declaration = source.localRuntime;
  if (!declaration || declaration.directory !== 'templates/runtime/laohu-remotion' || declaration.manifestPath !== 'templates/runtime/laohu-remotion/closure.json' || !/^[a-f0-9]{64}$/.test(declaration.manifestSha256 || '')) fail('Shotcraft has no pinned local Remotion closure');
  const runtimeRoot = path.resolve(skillDir, declaration.directory);
  const manifestPath = path.resolve(skillDir, declaration.manifestPath);
  if (!isWithin(runtimeParent, runtimeRoot) || !isWithin(runtimeRoot, manifestPath)) fail('Shotcraft local runtime closure paths escaped templates/runtime');
  const manifestBytes = await fs.readFile(manifestPath).catch((error) => fail(`Shotcraft local closure manifest is missing: ${error.message}`));
  if (sha256(manifestBytes) !== declaration.manifestSha256) fail('Shotcraft local closure manifest SHA differs from catalog');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.format !== 'laohu.motion.local-remotion-closure/1' || manifest.source?.id !== sourceId || manifest.source?.commit !== sourceCommit || !Array.isArray(manifest.files)) fail('Shotcraft local closure manifest does not match the pinned source');
  const mappedBySourcePath = new Map();
  const mappedBySourceRelative = new Map();
  for (const row of manifest.files) {
    if (!row || typeof row.sourcePath !== 'string' || typeof row.localPath !== 'string' || !/^[a-f0-9]{64}$/.test(row.sourceSha256 || '') || !/^[a-f0-9]{64}$/.test(row.localSha256 || '')) fail('Shotcraft local closure contains an incomplete source/local mapping');
    const prefix = `${source.sourcePathPrefix}/`;
    if (!row.sourcePath.startsWith(prefix)) continue;
    const relative = row.sourcePath.slice(prefix.length);
    const pin = ledger.get(relative);
    if (!pin || pin.sha256 !== row.sourceSha256) fail(`Shotcraft source attribution differs from catalog ledger: ${relative}`);
    const localPath = path.resolve(skillDir, row.localPath);
    if (!isWithin(templatesRoot, localPath)) fail(`Shotcraft local closure file escaped templates: ${row.localPath}`);
    const stat = await fs.lstat(localPath).catch((error) => fail(`Shotcraft local closure file is missing (${row.localPath}): ${error.message}`));
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`Shotcraft local closure path must be a regular file: ${row.localPath}`);
    const bytes = await fs.readFile(localPath);
    if (sha256(bytes) !== row.localSha256) fail(`Shotcraft local closure file differs from its pinned SHA: ${row.localPath}`);
    const mapped = {...row, relative, localPath};
    mappedBySourcePath.set(relative, mapped);
    mappedBySourceRelative.set(relative, mapped);
  }
  const files = new Set();
  for (const relative of entry.closure || []) {
    if (typeof relative !== 'string' || path.posix.isAbsolute(relative) || relative.split('/').includes('..')) fail(`${entry.id} has an unsafe closure path`);
    const pin = ledger.get(relative);
    const mapped = mappedBySourcePath.get(relative);
    if (!pin || !mapped || pin.sha256 !== mapped.sourceSha256) fail(`${entry.id} local closure omits or misattributes ${relative}`);
    files.add(relative);
  }
  const component = entry.component;
  const componentPin = ledger.get(component?.path);
  const componentMap = mappedBySourcePath.get(component?.path);
  if (!componentPin || componentPin.sha256 !== component.sha256 || !componentMap || componentMap.sourceSha256 !== component.sha256 || !files.has(component.path)) fail(`${entry.id} component path/hash is not part of its verified local closure`);
  let localImplementation = null;
  if (entry.sourceMethodAdaptation) {
    const local = entry.sourceMethodAdaptation.localImplementation;
    if (!local?.path || !local.sha256 || !local.exportName) fail(`${entry.id} source adaptation needs a pinned local implementation path/export/hash`);
    const absolute = path.resolve(skillDir, local.path);
    if (!isWithin(path.join(skillDir, 'templates'), absolute)) fail(`${entry.id} local adaptation escaped templates`);
    const localBytes = await fs.readFile(absolute).catch((error) => fail(`${entry.id} local adaptation missing ${local.path}: ${error.message}`));
    if (sha256(localBytes) !== local.sha256) fail(`${entry.id} local adaptation SHA-256 is stale`);
    localImplementation = {path:local.path, exportName:local.exportName, sha256:local.sha256, fidelityMode:'source-adapted-local'};
  }
  return {sourceId, sourceCommit, componentPath: component.path, componentSha256: component.sha256, componentLocalPath: componentMap.localPath, componentLocalSha256: componentMap.localSha256, closure: [...files].sort().map((relative) => ({path: relative, sha256: ledger.get(relative).sha256, localPath: mappedBySourcePath.get(relative).localPath, localSha256: mappedBySourcePath.get(relative).localSha256})), localRuntimeRoot: path.relative(skillDir, runtimeRoot), upstreamTreeRequiredAtRuntime: false, ...(localImplementation ? {localImplementation} : {})};
}

async function verifyFyComponentEntry(catalog, entry) {
  const source=catalog.sources.find((row)=>row.id==='fy-code-animation');
  const declaration=source?.localRuntime;
  if(!source||source.commit!=='d9a545afa393b2ffab4f36e87371691daf8e502c'||source.sourcePathPrefix!=='implementations'
    ||!declaration||declaration.manifestPath!=='templates/runtime/laohu-remotion/fy-code-animation-closure.json'
    ||!/^[a-f0-9]{64}$/.test(declaration.manifestSha256||'')) fail('fy-code-animation source and local closure pins are incomplete');
  const manifestPath=path.resolve(skillDir,declaration.manifestPath);
  const manifestBytes=await fs.readFile(manifestPath).catch(error=>fail(`fy-code-animation closure is missing: ${error.message}`));
  if(sha256(manifestBytes)!==declaration.manifestSha256) fail('fy-code-animation local closure manifest hash differs from the catalog');
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  if(manifest.format!=='laohu.motion.local-remotion-closure/1'||manifest.source?.id!=='fy-code-animation'||manifest.source?.commit!==source.commit||!Array.isArray(manifest.files)) fail('fy-code-animation local closure has invalid source identity');
  const pins=new Map((source.files||[]).map(row=>[row.path,row]));
  const mappings=new Map(manifest.files.map(row=>[row.sourcePath,row]));
  const checked=[];
  for(const relative of entry.closure||[]){
    if(typeof relative!=='string'||path.posix.isAbsolute(relative)||relative.split('/').includes('..')) fail(`${entry.id} has an unsafe closure path`);
    const sourcePath=`implementations/${relative}`;
    const pin=pins.get(relative),mapping=mappings.get(sourcePath);
    if(!pin||!mapping||pin.sha256!==mapping.sourceSha256) fail(`${entry.id} omits or misattributes source module ${sourcePath}`);
    const localPath=path.resolve(skillDir,mapping.localPath);
    if(!isWithin(templatesRoot,localPath)) fail(`${entry.id} local module escapes templates: ${mapping.localPath}`);
    const stat=await fs.lstat(localPath).catch(error=>fail(`${entry.id} local module is missing ${mapping.localPath}: ${error.message}`));
    if(!stat.isFile()||stat.isSymbolicLink()) fail(`${entry.id} local module must be a regular file: ${mapping.localPath}`);
    const bytes=await fs.readFile(localPath);
    if(sha256(bytes)!==mapping.localSha256) fail(`${entry.id} local module SHA-256 changed: ${mapping.localPath}`);
    checked.push({sourcePath,sourceSha256:mapping.sourceSha256,localPath:mapping.localPath,localSha256:mapping.localSha256});
  }
  const componentPath=entry.component?.path;
  const componentMap=mappings.get(componentPath);
  if(!componentMap||componentMap.sourceSha256!==entry.component.sha256||!(entry.closure||[]).includes(componentPath.slice('implementations/'.length))) fail(`${entry.id} component is not pinned inside its source closure`);
  return {sourceId:source.id,sourceCommit:source.commit,componentPath,componentSha256:entry.component.sha256,componentLocalPath:componentMap.localPath,componentLocalSha256:componentMap.localSha256,closure:checked,localRuntimeRoot:path.relative(skillDir,path.join(templatesRoot,'runtime','laohu-remotion')),upstreamTreeRequiredAtRuntime:false};
}

async function verifyFoundationShotEntry(catalog,entry){
  const localComponents={
    'laohu-motion-layer-router':{path:'templates/runtime/laohu-remotion/components/shots/foundation-layer.tsx',exportName:'FoundationLayer'},
    'laohu-authored-shot':{path:'templates/runtime/laohu-remotion/components/shots/registry.tsx',exportName:'LocalAuthoredShot'},
  };
  const expected=localComponents[entry.id];
  if(!expected) fail(`${entry.id} is not an allowlisted local foundation component`);
  const component=entry.component;
  if(component?.exportName!==expected.exportName||component?.path!==expected.path||!isWithin(localRuntimeRoot,path.resolve(skillDir,component.path))||!/^[a-f0-9]{64}$/.test(component.localSha256||'')) fail(`${entry.id} needs a pinned in-runtime component path/hash/export`);
  const componentPath=path.resolve(skillDir,component.path);
  const bytes=await fs.readFile(componentPath).catch(error=>fail(`local foundation shot component is missing: ${error.message}`));
  if(sha256(bytes)!==component.localSha256) fail('local foundation shot component hash changed');
  const source=catalog.sources.find(row=>row.id==='fy-code-animation');
  if(!source||source.commit!=='d9a545afa393b2ffab4f36e87371691daf8e502c') fail('local foundation shot lost its pinned companion source identity');
  const required=new Set(entry.sourceComponents||[]);
  const sourceFiles=new Map((source.files||[]).map(row=>[row.path,row]));
  if(!required.size) fail('local foundation shot must declare its companion source modules');
  const closure=[];
  for(const item of [...required].sort()){
    const pin=sourceFiles.get(item);
    if(!pin) fail(`local foundation shot source module is not pinned: ${item}`);
    const checked=await verifyFyComponentEntry(catalog,{id:entry.id,sourceId:source.id,component:{path:`implementations/${item}`,sha256:pin.sha256},closure:[item]});
    closure.push(...checked.closure);
  }
  return {sourceId:source.id,sourceCommit:source.commit,componentPath:component.path,componentSha256:component.localSha256,componentLocalPath:component.path,componentLocalSha256:component.localSha256,closure,localRuntimeRoot:path.relative(skillDir,localRuntimeRoot),upstreamTreeRequiredAtRuntime:false,assembly:'local allowlisted Shotcraft layer router',sourceComponents:[...required].sort()};
}

const ASSET_LICENSES = new Set(['user-owned', 'licensed', 'public-domain', 'authorized']);
async function readLocalPng(src, license, assetsRoot, label) {
  if (typeof src !== 'string' || !src || path.isAbsolute(src) || src.split(/[\\/]/).includes('..') || /^[a-z]+:/i.test(src)) fail(`${label}.src must be a relative PNG path under --assets-root`);
  if (!ASSET_LICENSES.has(license)) fail(`${label}.assetLicense must be user-owned, licensed, public-domain, or authorized; rights are caller-declared and never inferred`);
  if (!assetsRoot) fail(`${label} requires --assets-root`);
  if (path.extname(src).toLowerCase() !== '.png') fail(`${label}.src must name a PNG image`);
  const root = await fs.realpath(assetsRoot).catch((error) => fail(`image assets root could not be resolved: ${error.message}`));
  const candidate = path.resolve(root, src);
  if (!isWithin(root, candidate)) fail(`${label}.src escapes --assets-root`);
  const real = await fs.realpath(candidate).catch((error) => fail(`${label}.src could not be resolved: ${error.message}`));
  if (!isWithin(root, real)) fail(`${label}.src symlink escapes --assets-root`);
  const stat = await fs.stat(real);
  if (!stat.isFile()) fail(`${label}.src must resolve to a regular file`);
  const bytes = await fs.readFile(real);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR') fail(`${label}.src is not a valid PNG header`);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 20000 || height > 20000) fail(`${label}.src has unsupported image dimensions ${width}×${height}`);
  return {path:real, bytes, width, height, sha256:sha256(bytes)};
}

function validateRect(value, label, {maxX, maxY} = {}) {
  obj(value, label); keys(value, new Set(['x', 'y', 'width', 'height']), label);
  const rect = {
    x:finite(value.x, `${label}.x`, {min:0, max:maxX}),
    y:finite(value.y, `${label}.y`, {min:0, max:maxY}),
    width:finite(value.width, `${label}.width`, {min:1, max:maxX}),
    height:finite(value.height, `${label}.height`, {min:1, max:maxY}),
  };
  if (rect.x + rect.width > maxX || rect.y + rect.height > maxY) fail(`${label} must fit within its declared page/card bounds`);
  return rect;
}

function assertListStackCardsFitFinalView(cards) {
  const view = LIST_STACK_FINAL_VIEW;
  for (const [index, card] of cards.entries()) {
    const {x, y, width, height} = card.rect;
    const left = view.cx + (x - view.cx) * view.zoom;
    const right = view.cx + (x + width - view.cx) * view.zoom;
    const top = 540 + (y - view.cy) * view.zoom;
    const bottom = 540 + (y + height - view.cy) * view.zoom;
    if (left < 0 || right > view.width || top < 0 || bottom > view.height) {
      fail(`cards[${index}].rect must fit fully inside the 1920×1080 viewport in the pinned ListStackPress final view (frame ${view.frame}, cy=${view.cy}, zoom=${view.zoom}); reposition the page/card mapping or choose another composition. The source camera and 88-frame timing are fixed.`);
    }
  }
}

function validateTextStyle(value, label = 'style') {
  if (value == null) return {};
  obj(value, label);
  const allowed = new Set(['fontFamily', 'fontSize', 'fontWeight', 'color', 'lineHeight', 'textAlign', 'maxWidth', 'letterSpacing']);
  keys(value, allowed, label);
  const out = {};
  if (value.fontFamily != null) {
    const family = value.fontFamily;
    const systemFamilies = {
      serif: 'Georgia, "Songti SC", serif',
      sans: 'Arial, "Microsoft YaHei", sans-serif',
      monospace: 'Menlo, monospace',
    };
    if (Object.hasOwn(systemFamilies, family)) out.fontFamily = systemFamilies[family];
    else if (Object.values(systemFamilies).includes(family)) out.fontFamily = family;
    else fail(`${label}.fontFamily must select a registered system family`);
  }
  if (value.fontSize != null) out.fontSize = finite(value.fontSize, `${label}.fontSize`, {min: 24, max: 260});
  if (value.fontWeight != null) out.fontWeight = finite(value.fontWeight, `${label}.fontWeight`, {min: 300, max: 900, integer: true});
  if (value.color != null) out.color = hex(value.color, `${label}.color`);
  if (value.lineHeight != null) out.lineHeight = finite(value.lineHeight, `${label}.lineHeight`, {min: 0.8, max: 2});
  if (value.textAlign != null && !['left', 'center', 'right'].includes(value.textAlign)) fail(`${label}.textAlign must be left, center, or right`);
  if (value.maxWidth != null) out.maxWidth = finite(value.maxWidth, `${label}.maxWidth`, {min: 1, max: 1920});
  if (value.letterSpacing != null && (typeof value.letterSpacing !== 'string' || !/^-?(?:\d+(?:\.\d+)?)(?:px|em)$/.test(value.letterSpacing))) fail(`${label}.letterSpacing must be a fixed px/em value`);
  if (value.letterSpacing != null) out.letterSpacing = value.letterSpacing;
  return out;
}

function transformGalleryCopySource(source) {
  const start = source.indexOf('const WORDS: { text: string; accent?: boolean; br?: boolean }[] = [');
  const end = source.indexOf('\n];', start);
  if (start < 0 || end < 0) fail('paper-title-card-copy source patch cannot locate the pinned WORDS literal');
  let patched = source.slice(0, start) + source.slice(end + 3);
  const substitutions = [
    ["const SUB = 'shots rendered today';", ''],
    ["const SUB_DIGITS = '12';", ''],
    ['export const PaperTitleCard: React.FC = () => {', 'export const PaperTitleCard: React.FC<{ words: { text: string; accent?: boolean; br?: boolean }[]; sub: string; subDigits: string }> = (props) => {\n  const WORDS = props.words;\n  const SUB = props.sub;\n  const SUB_DIGITS = props.subDigits;'],
  ];
  for (const [before, after] of substitutions) {
    if (!patched.includes(before)) fail(`paper-title-card-copy source patch cannot locate pinned line: ${before}`);
    patched = patched.replace(before, after);
  }
  return patched;
}

async function verifyDerivedPatchProvider(catalog, entry) {
  const provider = entry.derivedProvider;
  if (!provider || provider.patchId !== 'paper-title-card-copy' || !entry.allowedDerivedPatches?.includes(provider.patchId)) fail(`${entry.id} has no registered paper-title-card-copy provider`);
  if (provider.parentComponentPath !== entry.component.path || provider.parentComponentSha256 !== entry.component.sha256) fail(`${entry.id} derived provider parent lock differs from its source component`);
  const verified = await verifySourceAndEntry(catalog, entry);
  const component = verified.closure.find((row) => row.path === entry.component.path);
  if (!component || component.sha256 !== provider.parentComponentSha256) fail(`${entry.id} derived provider parent SHA-256 changed`);
  const sourcePath = path.resolve(skillDir, component.localPath);
  const sourceBytes = await fs.readFile(sourcePath);
  const source = sourceBytes.toString('utf8');
  if (sha256(sourceBytes) !== component.localSha256) fail(`${entry.id} derived provider local parent SHA-256 changed`);
  const derivedPath = path.resolve(skillDir, provider.entrypoint || '');
  if (!isWithin(path.join(skillDir, 'templates/adapters'), derivedPath)) fail(`${entry.id} derived provider path escapes the Motion adapter directory`);
  const derivedBytes = await fs.readFile(derivedPath);
  if (sha256(derivedBytes) !== provider.sha256) fail(`${entry.id} derived provider SHA-256 differs from its catalog lock`);
  if (derivedBytes.toString('utf8') !== transformGalleryCopySource(source)) fail(`${entry.id} derived provider differs from the exact source-limited copy transformation`);
  return {sourcePath, sourceSha256:provider.parentComponentSha256, path:derivedPath, sha256:provider.sha256};
}

export async function verifyDerivedPatchProviderForEntry(catalog, entry) {
  return verifyDerivedPatchProvider(catalog, entry);
}

function graphemeCount(value) {
  return [...new Intl.Segmenter('und', {granularity:'grapheme'}).segment(value)].length;
}

async function validateDerivedPatch(catalog, entry, patch) {
  obj(patch, `${entry.id}.derivedPatch`);
  keys(patch, new Set(['id', 'words', 'sub', 'subDigits']), `${entry.id}.derivedPatch`);
  if (patch.id !== 'paper-title-card-copy' || !entry.allowedDerivedPatches?.includes(patch.id)) fail(`${entry.id} does not register derived patch ${String(patch.id)}`);
  await verifyDerivedPatchProvider(catalog, entry);
  const contract = entry.patchContract;
  if (!contract || contract.parentShaRequired !== true || contract.derivedShaRequired !== true) fail(`${entry.id} derived patch contract must lock parent and transformed component hashes`);
  if (!Array.isArray(patch.words) || patch.words.length < 1 || patch.words.length > contract.maxWords) fail(`derivedPatch.words must contain 1–${contract.maxWords} words`);
  let total = 0;
  const words = patch.words.map((word, index) => {
    obj(word, `derivedPatch.words[${index}]`);
    keys(word, new Set(['text', 'accent', 'br']), `derivedPatch.words[${index}]`);
    if (typeof word.text !== 'string' || !word.text.trim() || /[\r\n\u2028\u2029]/.test(word.text)) fail(`derivedPatch.words[${index}].text must be a non-empty single-line string`);
    const count = graphemeCount(word.text);
    if (count > contract.maxGraphemesPerWord) fail(`derivedPatch.words[${index}].text exceeds ${contract.maxGraphemesPerWord} graphemes`);
    total += count;
    for (const flag of ['accent', 'br']) if (word[flag] != null && typeof word[flag] !== 'boolean') fail(`derivedPatch.words[${index}].${flag} must be boolean`);
    return {text:word.text, ...(word.accent != null?{accent:word.accent}:{}), ...(word.br != null?{br:word.br}:{})};
  });
  if (total > contract.maxGraphemesTotal) fail(`derivedPatch words exceed ${contract.maxGraphemesTotal} total graphemes`);
  const finalVisibleFrame = 4 + 4 * (words.length - 1) + 9;
  const fadeStartFrame = entry.sourceDurationFrames - 8;
  if (finalVisibleFrame > fadeStartFrame) fail(`last derived PaperTitleCard word becomes fully visible at source frame ${finalVisibleFrame}, after whole-card fade begins at ${fadeStartFrame}; shorten the words or use fewer words`);
  if (typeof patch.sub !== 'string' || patch.sub.length > 48 || /[\r\n\u2028\u2029]/.test(patch.sub)) fail('derivedPatch.sub must be a single line of at most 48 characters');
  if (typeof patch.subDigits !== 'string' || patch.subDigits.length > 8 || !/^[\d.,%+\- ]*$/.test(patch.subDigits)) fail('derivedPatch.subDigits must contain at most 8 numeric/punctuation characters');
  return {id:patch.id, words, sub:patch.sub, subDigits:patch.subDigits, parentComponentSha256:entry.derivedProvider.parentComponentSha256, derivedComponentSha256:entry.derivedProvider.sha256, providerPath:entry.derivedProvider.entrypoint};
}

function parseStaticGalleryWords(source) {
  const block = source.match(/const WORDS: \{ text: string; accent\?: boolean; br\?: boolean \}\[\] = \[([\s\S]*?)\n\];/);
  if (!block) fail('cannot parse pinned PaperTitleCard WORDS source literal');
  const rows = [...block[1].matchAll(/\{\s*text:\s*'((?:\\.|[^'])*)'([^}]*)\}/g)];
  if (!rows.length) fail('pinned PaperTitleCard WORDS literal has no parseable display units');
  return rows.map((match) => ({
    text:match[1].replace(/\\(['\\])/g, '$1'),
    ...(match[2].match(/accent:\s*true/) ? {accent:true} : {}),
    ...(match[2].match(/br:\s*true/) ? {br:true} : {}),
  }));
}

async function validateNode(entry, props, {durationFrames, assetRecords = [], assetsRoot = null, publicRoot = null, catalog = null, fidelityMode = null, blueprintPath = null} = {}) {
  entry = resolveCatalogEntry(catalog, entry);
  obj(props, `${entry.id}.props`);
  keys(props, EXPORTED_FIELDS[entry.id] || new Set(), `${entry.id}.props`);
  const p = deepClone(props);
  validateDeclaredLocalParameters(entry, p);
  switch (entry.id) {
    case 'laohu-style-code-canvas': {
      if (!['F1','F2'].includes(p.styleId) || !entry.styleIds?.includes(p.styleId)) fail('laohu-style-code-canvas accepts only catalog-pinned F1 or F2 styles');
      if (p.content == null) fail(`${p.styleId} Film layers require structured content; fixed source demos are available only through the explicit style preview route`);
      const minimumFrames = p.styleId === 'F1' ? 255 : 300;
      if (durationFrames < minimumFrames) fail(`${p.styleId} must retain at least its complete ${minimumFrames}-frame source clock`);
      const contentSource = validateContentSource(p.contentSource, true);
      if (contentSource) {
        if (path.isAbsolute(contentSource.path) || path.win32.isAbsolute(contentSource.path) || contentSource.path.split(/[\\/]/).includes('..')) fail('contentSource.path must stay relative to the Film blueprint directory');
        if (!blueprintPath) fail('contentSource verification requires a Film blueprint path');
        const sourcePath = path.resolve(path.dirname(blueprintPath), contentSource.path);
        if (!isWithin(path.dirname(path.resolve(blueprintPath)), sourcePath)) fail('contentSource.path escaped the Film blueprint directory');
        const sourceBytes = await fs.readFile(sourcePath).catch((error) => fail(`contentSource file is missing: ${error.message}`));
        if (sha256(sourceBytes) !== contentSource.sha256) fail('contentSource.sha256 does not match the content JSON bytes');
        let sourceContent;
        try { sourceContent = JSON.parse(sourceBytes.toString('utf8')); }
        catch (error) { fail(`contentSource must contain JSON: ${error.message}`); }
        if (canonical(sourceContent) !== canonical(p.content)) fail('contentSource JSON content differs from the Film layer content');
      }
      const prepared = await prepareStyleCodeSpec({styleId:p.styleId,content:p.content,contentSource});
      if (prepared.contentBinding.status !== 'structured-content-bound' || prepared.contentBinding.demoMode) fail(`${p.styleId} Film consumer did not bind structured content`);
      p.content = prepared.content;
      p.contentSource = contentSource;
      p.canvasCodeSpec = {...prepared.spec,durationInFrames:durationFrames};
      p.contentBinding = prepared.contentBinding;
      p.sourceCodeEvidence = {style:prepared.style,sourceCode:prepared.sourceCode};
      return {catalogId:entry.id,props:p,fidelityMode:'native-props'};
    }
    case 'video-shotcraft-list-stack-five': {
      if (fidelityMode !== 'source-adapted-local') fail('ListStackPress adaptation requires fidelityMode source-adapted-local; it is not an exact source scene');
      if (durationFrames !== 88) fail('ListStackPress adaptation is fixed at exactly 88 frames; no duration stretch, trim, hold, or loop is supported');
      if (p.contentUse !== 'already-introduced-materials') fail('ListStackPress is limited to already-introduced material and short labels; new explanatory prose must remain readable before any fast stack');
      const pageHeight = finite(p.pageHeight, 'pageHeight', {min: 1080, max: 8000, integer:true});
      const page = await readLocalPng(p.pageImage, p.pageImageLicense, assetsRoot, 'pageImage');
      if (page.width !== 1920 || page.height !== pageHeight) fail(`pageImage must be 1920×${pageHeight}; PageCam2D uses a 1920 px source page`);
      if (typeof p.counterLabel !== 'string' || !p.counterLabel.trim() || p.counterLabel.length > 28 || /[\r\n]/.test(p.counterLabel)) fail('counterLabel must be one short line of at most 28 characters');
      if (typeof p.counterCaption !== 'string' || !p.counterCaption.trim() || p.counterCaption.length > 48 || /[\r\n]/.test(p.counterCaption)) fail('counterCaption must be one short line of at most 48 characters');
      if (!Array.isArray(p.cards) || p.cards.length !== 5) fail('ListStackPress is fixed to five cards; cards must contain exactly five entries');
      assetRecords.push({role:'page-background-image', path:p.pageImage, sourcePath:page.path, sha256:page.sha256, bytes:page.bytes.length, width:page.width, height:page.height, source:'caller-provided local asset', assetLicense:p.pageImageLicense});
      p.cards = await Promise.all(p.cards.map(async (card, index) => {
        const label = `cards[${index}]`;
        obj(card, label); keys(card, new Set(['src', 'assetLicense', 'rect', 'highlight']), label);
        const rect = validateRect(card.rect, `${label}.rect`, {maxX:1920, maxY:pageHeight});
        const highlight = validateRect(card.highlight, `${label}.highlight`, {maxX:rect.width, maxY:rect.height});
        const asset = await readLocalPng(card.src, card.assetLicense, assetsRoot, label);
        const ratioError = Math.abs(asset.width / asset.height - rect.width / rect.height) / (rect.width / rect.height);
        if (ratioError > 0.01) fail(`${label}.src aspect ratio differs from its target rectangle by more than 1%; resize/crop with user approval before use`);
        assetRecords.push({role:`card-image-${index + 1}`, path:card.src, sourcePath:asset.path, sha256:asset.sha256, bytes:asset.bytes.length, width:asset.width, height:asset.height, source:'caller-provided local asset', assetLicense:card.assetLicense});
        return {src:card.src, assetLicense:card.assetLicense, rect, highlight};
      }));
      assertListStackCardsFitFinalView(p.cards);
      return {catalogId:entry.id, props:p, fidelityMode:'source-adapted-local'};
    }
    case 'video-shotcraft-paper-title-card': {
      const mode = fidelityMode || 'native-props';
      if (!['exact-baseline', 'native-props'].includes(mode)) fail('PaperTitleCard supports exact-baseline or native-props');
      if (p.duration != null) finite(p.duration, 'duration', {min: 25, max: 600, integer: true});
      else p.duration = durationFrames;
      if (p.duration !== durationFrames) fail('PaperTitleCard componentProps.duration must equal its enclosing segment frameCount; do not stretch, hold, or loop a full source scene');
      if (p.theme != null && !['ink-press', 'modern-light', 'morning', 'midnight', 'rose-noir', 'oceanic', 'forest', 'sunset'].includes(p.theme)) fail('theme is not a source VisualThemeProvider theme');
      p.theme ||= 'ink-press';
      if (p.colors != null) {
        obj(p.colors, 'colors');
        const allowed = new Set(['page', 'surface', 'field', 'text', 'muted', 'accent', 'border', 'stage']);
        keys(p.colors, allowed, 'colors');
        for (const [name, value] of Object.entries(p.colors)) hex(value, `colors.${name}`);
      }
      if (mode === 'exact-baseline' && p.colors != null) fail('exact-baseline PaperTitleCard does not accept a colors override; choose native-props for a palette change');
      const actualProps = Object.fromEntries(Object.entries(p).filter(([key]) => !['theme', 'colors'].includes(key)));
      const sourceDuration = actualProps.duration;
      delete actualProps.duration;
      if (actualProps.words != null) {
        if (!Array.isArray(actualProps.words) || actualProps.words.length < 1 || actualProps.words.length > 9) fail('words must contain 1 to 9 source word objects');
        actualProps.words.forEach((word, i) => {
          obj(word, `words[${i}]`); keys(word, new Set(['text', 'accent']), `words[${i}]`);
          if (typeof word.text !== 'string' || !word.text.trim() || word.text.length > 32 || /[\r\n]/.test(word.text)) fail(`words[${i}].text must be a single-line string of 1–32 characters`);
          if (word.accent != null && typeof word.accent !== 'boolean') fail(`words[${i}].accent must be boolean`);
        });
        const finalVisibleFrame = 4 + 4 * (actualProps.words.length - 1) + 9;
        const fadeStartFrame = sourceDuration - 8;
        if (finalVisibleFrame > fadeStartFrame) fail(`last PaperTitleCard word becomes fully visible at source frame ${finalVisibleFrame}, after whole-card fade begins at ${fadeStartFrame}; shorten the words or give the source scene more frames`);
      }
      if (actualProps.sub != null && (typeof actualProps.sub !== 'string' || actualProps.sub.length > 48 || /[\r\n]/.test(actualProps.sub))) fail('sub must be a single line of at most 48 characters');
      if (actualProps.subDigits != null && (typeof actualProps.subDigits !== 'string' || actualProps.subDigits.length > 8 || !/^[\d.,%+\- ]*$/.test(actualProps.subDigits))) fail('subDigits must contain at most 8 digits/punctuation characters');
      if (actualProps.fontSize != null) finite(actualProps.fontSize, 'fontSize', {min: 24, max: 180});
      for (const field of ['ink', 'accent', 'muted', 'paper']) if (actualProps[field] != null) hex(actualProps[field], field);
      if (mode === 'exact-baseline' && canonical({duration: sourceDuration, theme: p.theme, componentProps: actualProps}) !== canonical(entry.baselineProps)) fail('exact-baseline PaperTitleCard must use the pinned catalog baseline props byte-for-byte; choose native-props for changes');
      return {catalogId: entry.id, props: {theme: p.theme, ...(p.colors ? {colors: p.colors} : {}), componentProps: {duration: sourceDuration, ...actualProps}}, fidelityMode: mode};
    }
    case 'video-shotcraft-paper-title-card-gallery': {
      const mode = fidelityMode || 'exact-baseline';
      if (durationFrames !== entry.sourceDurationFrames) fail(`active gallery PaperTitleCard has a fixed ${entry.sourceDurationFrames}-frame source duration; do not hold, trim, or stretch it`);
      if (mode === 'exact-baseline') {
        if (canonicalProps(p) !== canonicalProps({})) fail('gallery PaperTitleCard exact-baseline accepts no props; source has fixed copy, fixed theme, no content API');
      } else if (mode === 'derived-patch') {
        if (canonicalProps(p) !== canonicalProps({})) fail('gallery PaperTitleCard derived-patch still has no source props; supply its separate layer.derivedPatch contract');
      }
      else fail('gallery PaperTitleCard supports exact-baseline or the explicitly gated derived-patch mode only');
      return {catalogId: entry.id, props: {}, fidelityMode: mode};
    }
    case 'video-shotcraft-grain-dissolve': {
      const mode = fidelityMode || 'source-adapted-local';
      if (mode !== 'source-adapted-local') fail('GrainDissolve content replacement requires fidelityMode source-adapted-local');
      if (durationFrames !== entry.sourceDurationFrames) fail(`GrainDissolve useT() reads useVideoConfig().durationInFrames; preserve the native ${entry.sourceDurationFrames}-frame composition context`);
      if (typeof p.brandName !== 'string' || !p.brandName.trim() || /[\r\n\u2028\u2029]/.test(p.brandName)) fail('GrainDissolve requires brandName as one non-empty line of caller-supplied content');
      return {catalogId: entry.id, props: {brandName: p.brandName}, fidelityMode: mode};
    }
    case 'video-shotcraft-text-reveal': {
      if (typeof p.text !== 'string' || !p.text.length || p.text.length > 300 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(p.text)) fail('text must be 1–300 printable characters');
      if (p.by != null && !['char', 'word', 'line'].includes(p.by)) fail('by must be char, word, or line');
      if (p.variant != null && !['rise', 'blur', 'drop', 'scale', 'track'].includes(p.variant)) fail('variant is not an upstream TextReveal variant');
      if (p.ease != null && !['snappy', 'out', 'smooth', 'swift', 'exit', 'anticip', 'overshoot', 'linear'].includes(p.ease)) fail('ease must select a registered upstream EASE');
      if (p.start != null) finite(p.start, 'start', {min: 0, max: durationFrames - 1});
      if (p.each != null) finite(p.each, 'each', {min: 1, max: 180});
      if (p.gap != null) finite(p.gap, 'gap', {min: 0, max: 60});
      p.style = validateTextStyle(p.style);
      const visibleUnits = (p.by === 'line' ? p.text.split('\n') : p.by === 'word' ? p.text.split(/(\s+)/).filter((unit) => !/^\s+$/.test(unit)) : Array.from(p.text)).length;
      const resolvedGap = p.gap ?? (p.by === 'char' || p.by == null ? 1.6 : p.by === 'word' ? 4 : 7);
      const finalVisibleFrame = (p.start ?? 0) + Math.max(0, visibleUnits - 1) * resolvedGap + (p.each ?? 18);
      const disappearStart = p.out?.start ?? durationFrames;
      if (finalVisibleFrame > disappearStart || finalVisibleFrame >= durationFrames) fail(`last TextReveal unit completes at ${finalVisibleFrame}, outside the readable window ending at ${disappearStart}; shorten text, tighten staggering, or extend the enclosing segment`);
      if (p.unitStylePreset != null) {
        obj(p.unitStylePreset, 'unitStylePreset'); keys(p.unitStylePreset, new Set(['highlightIndices', 'highlightColor']), 'unitStylePreset');
        if (p.unitStylePreset.highlightIndices != null && (!Array.isArray(p.unitStylePreset.highlightIndices) || p.unitStylePreset.highlightIndices.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 299))) fail('unitStylePreset.highlightIndices must be non-negative text-unit indexes');
        if (p.unitStylePreset.highlightColor != null) hex(p.unitStylePreset.highlightColor, 'unitStylePreset.highlightColor');
        p.highlightIndices = p.unitStylePreset.highlightIndices || [];
        p.highlightColor = p.unitStylePreset.highlightColor || '#ff6a2a';
        delete p.unitStylePreset;
      }
      if (p.out != null) { obj(p.out, 'out'); keys(p.out, new Set(['start', 'dur']), 'out'); finite(p.out.start, 'out.start', {min: 0, max: durationFrames - 1}); if (p.out.dur != null) finite(p.out.dur, 'out.dur', {min: 1, max: durationFrames}); }
      return {catalogId: entry.id, props: p, fidelityMode: 'native-props'};
    }
    case 'video-shotcraft-sheen': {
      if ((p.progress == null) === (p.progressTrack == null)) fail('provide exactly one of progress or progressTrack');
      if (p.progress != null) finite(p.progress, 'progress', {min: 0, max: 1});
      if (p.progressTrack != null) {
        obj(p.progressTrack, 'progressTrack'); keys(p.progressTrack, new Set(['from', 'to', 'startFrame', 'endFrame', 'ease']), 'progressTrack');
        finite(p.progressTrack.from, 'progressTrack.from', {min: 0, max: 1}); finite(p.progressTrack.to, 'progressTrack.to', {min: 0, max: 1});
        finite(p.progressTrack.startFrame, 'progressTrack.startFrame', {min: 0, max: durationFrames - 1, integer: true});
        finite(p.progressTrack.endFrame, 'progressTrack.endFrame', {min: p.progressTrack.startFrame + 1, max: durationFrames, integer: true});
        if (p.progressTrack.ease != null && !['snappy', 'out', 'smooth', 'swift', 'exit', 'anticip', 'overshoot', 'linear'].includes(p.progressTrack.ease)) fail('progressTrack.ease must select a registered upstream EASE');
      }
      if (p.color != null) hex(p.color, 'color'); if (p.width != null) finite(p.width, 'width', {min: 0.02, max: 1}); if (p.angle != null) finite(p.angle, 'angle', {min: -90, max: 90}); if (p.strength != null) finite(p.strength, 'strength', {min: 0, max: 1});
      return {catalogId: entry.id, props: p, fidelityMode: 'native-props'};
    }
    case 'video-shotcraft-stage': {
      if (!['midnight', 'aurora', 'ember', 'graphite', 'lime', 'paper', 'porcelain', 'sand'].includes(p.look)) fail('Stage requires a registered source LOOKS key');
      for (const field of ['keyLight', 'fill']) if (p[field] != null && p[field] !== null) finiteRange(p[field], ['x', 'y'], field);
      if (p.horizon != null) finite(p.horizon, 'horizon', {min: 0, max: 1}); if (p.intensity != null) finite(p.intensity, 'intensity', {min: 0, max: 2});
      if (p.breathe != null) finite(p.breathe, 'breathe', {min: 0, max: 1}); if (p.grain != null) finite(p.grain, 'grain', {min: 0, max: 1}); if (p.vignette != null) finite(p.vignette, 'vignette', {min: 0, max: 1});
      if (p.backgroundDecor != null) {
        if (!Array.isArray(p.backgroundDecor)) fail('backgroundDecor must be an array of source-verified Stage background children');
        for (const [i, child] of p.backgroundDecor.entries()) {
          obj(child, `backgroundDecor[${i}]`);
          keys(child, new Set(['catalogId', 'props']), `backgroundDecor[${i}]`);
          if (!['video-shotcraft-dust', 'video-shotcraft-grid-floor'].includes(child.catalogId)) fail('Stage children stay under its vignette/grain as background decor; foreground content must be a sibling layer after Stage');
          const childProps = obj(child.props || {}, `backgroundDecor[${i}].props`);
          const allowed = child.catalogId === 'video-shotcraft-dust'
            ? new Set(['count', 'seed', 'drift', 'opacity', 'color'])
            : new Set(['horizon', 'cell', 'scroll', 'opacity', 'color']);
          keys(childProps, allowed, `backgroundDecor[${i}].props`);
          if (childProps.color != null) hex(childProps.color, `backgroundDecor[${i}].props.color`);
          if (child.catalogId === 'video-shotcraft-dust') {
            if (childProps.count != null) finite(childProps.count, 'Dust.count', {min: 0, max: 100, integer: true});
            if (childProps.seed != null) finite(childProps.seed, 'Dust.seed', {min: 0, max: 100000, integer: true});
            if (childProps.drift != null) finite(childProps.drift, 'Dust.drift', {min: 0, max: 10});
            if (childProps.opacity != null) finite(childProps.opacity, 'Dust.opacity', {min: 0, max: 1});
          } else {
            if (childProps.horizon != null) finite(childProps.horizon, 'GridFloor.horizon', {min: 0, max: 1});
            if (childProps.opacity != null) finite(childProps.opacity, 'GridFloor.opacity', {min: 0, max: 1});
            for (const field of ['cell', 'scroll']) if (childProps[field] != null) finite(childProps[field], `GridFloor.${field}`, {min: 0, max: 100});
          }
        }
      }
      if (p.style != null) fail('Stage style is intentionally not exposed: it overrides the source background layer');
      return {catalogId: entry.id, props: p, fidelityMode: 'native-props'};
    }
    case 'video-shotcraft-speed-blur': {
      finite(p.vx, 'vx', {min: -300, max: 300}); if (p.vy != null) finite(p.vy, 'vy', {min: -300, max: 300});
      if (p.amount != null) finite(p.amount, 'amount', {min: 0, max: 4}); if (p.max != null) finite(p.max, 'max', {min: 0, max: 120});
      if (!p.content) fail('SpeedBlur content is restricted to one validated TextReveal or ClipCard child; arbitrary React/code children are not accepted');
      obj(p.content, 'content'); keys(p.content, new Set(['catalogId', 'props']), 'content');
      if (!catalog) fail('internal adapter error: nested components require the template catalog');
      const childEntry = entryById(catalog, p.content.catalogId);
      if (!['video-shotcraft-text-reveal', 'video-shotcraft-clip-card'].includes(childEntry.id)) fail('SpeedBlur content is restricted to one validated TextReveal or ClipCard child; arbitrary React/code children are not accepted');
      const child = await validateNode(childEntry, p.content.props, {durationFrames, assetRecords, assetsRoot, publicRoot, catalog, fidelityMode:'native-props'});
      p.content = {catalogId: child.catalogId, props: child.props};
      if (p.style != null) fail('SpeedBlur style is not exposed because source style controls layer placement');
      return {catalogId: entry.id, props: p, fidelityMode: 'native-props'};
    }
    case 'video-shotcraft-grain': {
      if (p.opacity != null) finite(p.opacity, 'opacity', {min: 0, max: 0.3}); if (p.step != null) finite(p.step, 'step', {min: 1, max: 30, integer: true});
      if (p.scale != null) finite(p.scale, 'scale', {min: 0.25, max: 4}); if (p.freq != null) finite(p.freq, 'freq', {min: 0.1, max: 2});
      if (p.blend != null && !['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'color-dodge', 'color-burn'].includes(p.blend)) fail('blend is not a safe source-supported mix-blend mode');
      if (p.style != null) fail('Grain style is not exposed; it can alter the source layer scope/placement');
      return {catalogId: entry.id, props: p, fidelityMode: 'native-props'};
    }
    case 'video-shotcraft-backdrop': {
      if (p.tone != null && !['light', 'dark'].includes(p.tone)) fail('tone must be light or dark');
      if (p.light != null) finiteRange(p.light, ['x', 'y'], 'light'); if (p.accent != null) hex(p.accent, 'accent');
      if (p.grain != null) finite(p.grain, 'grain', {min: 0, max: 0.3}); if (p.vignette != null) finite(p.vignette, 'vignette', {min: 0, max: 1}); if (p.drift != null) finite(p.drift, 'drift', {min: 0, max: 120});
      if (p.style != null) fail('Backdrop style is not exposed; it can override the source background layer');
      return {catalogId: entry.id, props: p, fidelityMode: 'native-props'};
    }
    case 'video-shotcraft-clip-card': {
      if (p.muted === false) fail('ClipCard audio is disabled in picture-only Shotcraft renders; the existing audio-plan/audio.mjs consumer must mix once');
      if (typeof p.src !== 'string' || !p.src || path.isAbsolute(p.src) || p.src.split(/[\\/]/).includes('..') || /^[a-z]+:/i.test(p.src)) fail('ClipCard src must be a local relative asset path under --assets-root');
      if (!assetsRoot) fail('ClipCard requires --assets-root');
      const root = await fs.realpath(assetsRoot).catch((error) => fail(`ClipCard assets root could not be resolved: ${error.message}`));
      const candidate = path.resolve(root, p.src);
      if (!isWithin(root, candidate)) fail('ClipCard asset escapes --assets-root');
      const local = await fs.realpath(candidate).catch((error) => fail(`ClipCard asset could not be resolved: ${error.message}`));
      if (!isWithin(root, local)) fail('ClipCard asset symlink escapes --assets-root');
      const stat = await fs.stat(local).catch((error) => fail(`ClipCard asset could not be inspected: ${error.message}`));
      if (!stat.isFile()) fail('ClipCard asset must resolve to a regular file');
      const bytes = await fs.readFile(local).catch((error) => fail(`ClipCard asset could not be read: ${error.message}`));
      const digest = sha256(bytes), extension = path.extname(candidate).toLowerCase();
      if (!['.mp4', '.mov', '.webm', '.m4v'].includes(extension)) fail('ClipCard requires an explicit local video asset (.mp4/.mov/.webm/.m4v)');
      assetRecords.push({role: 'clip-card-video', path: p.src, sourcePath: local, sha256: digest, bytes: bytes.length, source: 'user-local-assets-root', license: p.assetLicense || null});
      if (p.muted == null) p.muted = true;
      if (p.size != null) finite(p.size, 'size', {min: 96, max: 1200}); if (p.radius != null) finite(p.radius, 'radius', {min: 0, max: 80});
      if (p.captionSize != null) finite(p.captionSize, 'captionSize', {min: 17, max: 64}); if (p.startFrom != null) finite(p.startFrom, 'startFrom', {min: 0, max: 100000, integer: true});
      if (p.durationInFrames != null && p.durationInFrames !== durationFrames) fail('ClipCard durationInFrames must equal the enclosing segment frameCount');
      if (p.assetLicense == null || !['user-owned', 'licensed', 'public-domain', 'authorized'].includes(p.assetLicense)) fail('ClipCard requires assetLicense: user-owned, licensed, public-domain, or authorized; asset rights are caller-declared and never inferred');
      if (p.loopDurationInFrames != null) {
        finite(p.loopDurationInFrames, 'loopDurationInFrames', {min: 1, max: durationFrames, integer: true});
        if (p.loopCrossfadeInFrames != null) finite(p.loopCrossfadeInFrames, 'loopCrossfadeInFrames', {min: 1, max: p.loopDurationInFrames - 1, integer: true});
        const step = p.loopDurationInFrames - (p.startFrom || 0) - (p.loopCrossfadeInFrames || 8);
        if (step < (p.loopCrossfadeInFrames || 8)) fail('explicit ClipCard loop would create more than two overlapping layers; choose a valid loop duration or omit looping');
      } else if (p.loopCrossfadeInFrames != null) fail('loopCrossfadeInFrames requires explicit loopDurationInFrames');
      p.durationInFrames = durationFrames;
      return {catalogId: entry.id, props: p, fidelityMode: 'native-props'};
    }
    case 'video-shotcraft-flash-cut': {
      finite(p.duration ?? 10, 'duration', {min: 1, max: 60, integer: true});
      if ((p.duration ?? 10) !== 10) fail('current verified FlashCut calling context is 10 frames; the TSX accepts duration but altered edge timing has not been verified');
      return {catalogId: entry.id, props: {duration: 10}, fidelityMode: fidelityMode || 'exact-baseline'};
    }
    case 'laohu-motion-layer-router':
      if (fidelityMode !== 'native-props') fail('laohu-motion-layer-router is a local layer router and only accepts native-props compositions');
      return {catalogId:entry.id,props:{},fidelityMode};
    case 'laohu-authored-shot': {
      if(!['formation-camera','material-craft','caption-type','glyph-anatomy'].includes(p.shotId)) fail('shotId must select one registered local authored shot');
      const parameters=obj(p.parameters||{},'parameters');
      const fields=p.shotId==='formation-camera'?new Set(['title','caption','bpm','accent'])
        :p.shotId==='material-craft'?new Set(['label','accent'])
        :p.shotId==='caption-type'?new Set(['title','caption','accent','titleAtFrame'])
          :new Set(['glyph','title','accent']);
      keys(parameters,fields,'parameters');
      for(const field of ['title','caption']) if(parameters[field]!=null&&(typeof parameters[field]!=='string'||!parameters[field].trim()||Array.from(parameters[field]).length>140)) fail(`parameters.${field} must contain 1–140 characters`);
      if(parameters.accent!=null) hex(parameters.accent,'parameters.accent');
      if(parameters.titleAtFrame!=null) finite(parameters.titleAtFrame,'parameters.titleAtFrame',{min:0,max:durationFrames-1,integer:true});
      if(parameters.bpm!=null) finite(parameters.bpm,'parameters.bpm',{min:30,max:240});
      if(parameters.label!=null&&(!/^[\p{L}\p{N} /:!?×.\-]+$/u.test(parameters.label)||Array.from(parameters.label).length>30)) fail('parameters.label must use supported bitmap glyphs and contain at most 30 characters');
      if(p.shotId==='glyph-anatomy') {
        if(parameters.glyph==null) fail('glyph-anatomy requires parameters.glyph from scripts/laohu-glyph-outline.py');
        validateGlyphOutline(parameters.glyph,'parameters.glyph');
        if(parameters.title!=null&&(typeof parameters.title!=='string'||!parameters.title.trim()||Array.from(parameters.title).length>80)) fail('parameters.title must contain 1–80 characters');
      }
      p.parameters=parameters;
      return {catalogId:entry.id,props:p,fidelityMode:'native-props'};
    }
    case 'laohu-typography-track-in': {
      if (typeof p.text !== 'string' || !p.text.trim() || Array.from(p.text).length > 160) fail('TrackIn text must contain 1–160 characters');
      if (typeof p.family !== 'string' || !/^[\p{L}\p{N} _,'"-]{1,100}$/u.test(p.family)) fail('TrackIn family must be a plain local font family name');
      finite(p.size, 'size', {min:18,max:260});
      if (p.weight != null) finite(p.weight, 'weight', {min:100,max:900,integer:true});
      if (p.at != null) finite(p.at, 'at', {min:0,max:durationFrames-1});
      if (p.dur != null) finite(p.dur, 'dur', {min:1,max:durationFrames});
      for (const field of ['from','to']) if (p[field] != null) finite(p[field],field,{min:-1,max:1});
      if (p.color != null) hex(p.color,'color');
      p.style=validateTextStyle(p.style,'style');
      return {catalogId:entry.id,props:p,fidelityMode:'native-props'};
    }
    case 'laohu-background-flow-field': {
      if (p.seed != null && (typeof p.seed !== 'string' || p.seed.length > 128)) fail('FlowField seed must be a string of at most 128 characters');
      if (p.color != null) hex(p.color,'color');
      if (p.period != null) finite(p.period,'period',{min:0.1,max:600});
      if (p.lines != null) finite(p.lines,'lines',{min:1,max:2000,integer:true});
      if (p.steps != null) finite(p.steps,'steps',{min:1,max:200,integer:true});
      if (p.stepLength != null) finite(p.stepLength,'stepLength',{min:0.1,max:100});
      if (p.zones != null) {
        if (!Array.isArray(p.zones) || p.zones.length > 24) fail('FlowField zones must be an array of at most 24 reading zones');
        p.zones=p.zones.map((zone,index)=>{
          obj(zone,`zones[${index}]`); keys(zone,new Set(['x','y','width','height','padding','feather','floor']),`zones[${index}]`);
          for(const field of ['x','y','width','height']) finite(zone[field],`zones[${index}].${field}`,{min:field==='width'||field==='height'?1:-3840,max:field==='width'?3840:field==='height'?2160:3840});
          if(zone.padding!=null) finite(zone.padding,`zones[${index}].padding`,{min:0,max:400});
          if(zone.feather!=null) finite(zone.feather,`zones[${index}].feather`,{min:1,max:1200});
          if(zone.floor!=null) finite(zone.floor,`zones[${index}].floor`,{min:0,max:1});
          return zone;
        });
      }
      return {catalogId:entry.id,props:p,fidelityMode:'native-props'};
    }
    case 'laohu-character-walk-cycle': {
      if (p.originX != null) finite(p.originX,'originX',{min:-1920,max:3840});
      if (p.ground != null) finite(p.ground,'ground',{min:-1080,max:2160});
      if (p.speed != null) finite(p.speed,'speed',{min:0,max:1200});
      if (p.period != null) finite(p.period,'period',{min:0.05,max:30});
      if (p.legLength != null) finite(p.legLength,'legLength',{min:16,max:600});
      if (p.color != null) hex(p.color,'color');
      return {catalogId:entry.id,props:p,fidelityMode:'native-props'};
    }
    case 'laohu-data-animated-bars': {
      if(!Array.isArray(p.data)||p.data.length<1||p.data.length>16) fail('AnimatedBars data must contain 1–16 rows');
      if(!Array.isArray(p.domain)||p.domain.length!==2) fail('AnimatedBars domain must be [minimum, maximum]');
      finite(p.domain[0],'domain[0]'); finite(p.domain[1],'domain[1]');
      if(p.domain[0]>0||p.domain[1]<0||p.domain[1]<=p.domain[0]) fail('AnimatedBars domain must be increasing and include zero');
      const ids=new Set();
      p.data=p.data.map((datum,index)=>{
        obj(datum,`data[${index}]`); keys(datum,new Set(['id','label','from','to','color']),`data[${index}]`);
        stableId(datum.id,`data[${index}].id`);
        if(ids.has(datum.id)) fail('AnimatedBars data IDs must be unique'); ids.add(datum.id);
        if(typeof datum.label!=='string'||!datum.label.trim()||Array.from(datum.label).length>64) fail(`data[${index}].label must contain 1–64 characters`);
        for(const field of ['from','to']) finite(datum[field],`data[${index}].${field}`,{min:p.domain[0],max:p.domain[1]});
        if(datum.color!=null) hex(datum.color,`data[${index}].color`);
        return datum;
      });
      finite(p.width,'width',{min:240,max:1920,integer:true}); finite(p.height,'height',{min:180,max:1080,integer:true});
      if(typeof p.family!=='string'||!p.family.trim()||p.family.length>100) fail('AnimatedBars family must be a local font-family name');
      if(typeof p.sourceLabel!=='string'||!p.sourceLabel.trim()||p.sourceLabel.length>120) fail('AnimatedBars sourceLabel must name the data source');
      if(p.rank!=null&&typeof p.rank!=='boolean') fail('AnimatedBars rank must be boolean');
      if(p.suffix!=null&&(typeof p.suffix!=='string'||p.suffix.length>16)) fail('AnimatedBars suffix must be at most 16 characters');
      if(p.decimals!=null) finite(p.decimals,'decimals',{min:0,max:6,integer:true});
      finite(p.startFrame,'startFrame',{min:0,max:durationFrames-1,integer:true});
      finite(p.endFrame,'endFrame',{min:p.startFrame+1,max:durationFrames,integer:true});
      if(p.fromProgress!=null) finite(p.fromProgress,'fromProgress',{min:0,max:1});
      if(p.toProgress!=null) finite(p.toProgress,'toProgress',{min:0,max:1});
      return {catalogId:entry.id,props:p,fidelityMode:'native-props'};
    }
    case 'laohu-media-photo-montage': {
      if(p.background!=null) hex(p.background,'background');
      if(!Array.isArray(p.slots)||p.slots.length<1||p.slots.length>12) fail('PhotoMontage slots must contain 1–12 photo intervals');
      if(!assetsRoot) fail('PhotoMontage requires --assets-root or an input spec directory containing its PNG images');
      let previousEnd=-Infinity;
      p.slots=await Promise.all(p.slots.map(async(slot,index)=>{
        obj(slot,`slots[${index}]`);keys(slot,new Set(['id','start','end','file','width','height','focus','fromZoom','toZoom','assetLicense']),`slots[${index}]`);
        stableId(slot.id,`slots[${index}].id`);
        finite(slot.start,`slots[${index}].start`,{min:0,max:durationFrames/30});finite(slot.end,`slots[${index}].end`,{min:0,max:durationFrames/30});
        if(slot.end<=slot.start||slot.start<previousEnd) fail('PhotoMontage slots must be ordered, positive-duration, and non-overlapping'); previousEnd=slot.end;
        finite(slot.width,`slots[${index}].width`,{min:1,max:12000,integer:true});finite(slot.height,`slots[${index}].height`,{min:1,max:12000,integer:true});
        if(!Array.isArray(slot.focus)||slot.focus.length!==2) fail(`slots[${index}].focus must be a normalized [x,y] point`);slot.focus.forEach((v,i)=>finite(v,`slots[${index}].focus[${i}]`,{min:0,max:1}));
        if(slot.fromZoom!=null) finite(slot.fromZoom,`slots[${index}].fromZoom`,{min:1,max:4});if(slot.toZoom!=null) finite(slot.toZoom,`slots[${index}].toZoom`,{min:1,max:4});
        const asset=await readLocalPng(slot.file,slot.assetLicense,assetsRoot,`slots[${index}]`);
        if(asset.width!==slot.width||asset.height!==slot.height) fail(`slots[${index}] metadata dimensions do not match its PNG bytes`);
        assetRecords.push({role:`photo-montage-${slot.id}`,path:slot.file,sourcePath:asset.path,sha256:asset.sha256,bytes:asset.bytes.length,width:asset.width,height:asset.height,source:'caller-provided local asset',assetLicense:slot.assetLicense});
        return slot;
      }));
      return {catalogId:entry.id,props:p,fidelityMode:'native-props'};
    }
    case 'laohu-three-volume': {
      const th=obj(p.theme,'theme');
      keys(th,new Set(['ink','paper','paper2','cream','accent','accent2','palette','sprinkle','serif','sans','mono']),'theme');
      for(const field of ['ink','paper','paper2','cream','accent','accent2']) hex(th[field],`theme.${field}`);
      for(const field of ['serif','sans','mono']) if(typeof th[field]!=='string'||!th[field].trim()||th[field].length>100) fail(`theme.${field} must be a local font-family name`);
      if(!Array.isArray(th.palette)||th.palette.length>24) fail('theme.palette must contain at most 24 swatches');
      th.palette=th.palette.map((swatch,index)=>{obj(swatch,`theme.palette[${index}]`);keys(swatch,new Set(['name','hex']),`theme.palette[${index}]`);if(typeof swatch.name!=='string'||!swatch.name.trim()||swatch.name.length>24)fail(`theme.palette[${index}].name is required`);hex(swatch.hex,`theme.palette[${index}].hex`);return swatch;});
      if(!Array.isArray(th.sprinkle)||th.sprinkle.length>24) fail('theme.sprinkle must contain at most 24 colors'); th.sprinkle.forEach((color,index)=>hex(color,`theme.sprinkle[${index}]`));
      const state=obj(p.state,'state');
      keys(state,new Set(['drop','sink','field','flat','rise','detail','wire','amp','dark','cam']),'state');
      for(const field of ['drop','sink','field','rise','wire','dark']) finite(state[field],`state.${field}`,{min:0,max:1});
      if(state.flat!=null) finite(state.flat,'state.flat',{min:0,max:1});
      finite(state.detail,'state.detail',{min:0,max:8}); finite(state.amp,'state.amp',{min:0,max:1});
      const cam=obj(state.cam,'state.cam'); keys(cam,new Set(['ang','dist','height','target']),'state.cam');
      finite(cam.ang,'state.cam.ang',{min:-Math.PI*4,max:Math.PI*4}); finite(cam.dist,'state.cam.dist',{min:4,max:120}); finite(cam.height,'state.cam.height',{min:-30,max:60});
      if(!Array.isArray(cam.target)||cam.target.length!==3) fail('state.cam.target must be a three-number point'); cam.target.forEach((n,index)=>finite(n,`state.cam.target[${index}]`,{min:-100,max:100}));
      if(p.waveOffset!=null) finite(p.waveOffset,'waveOffset',{min:-100000,max:100000});
      if(p.clay!=null) hex(p.clay,'clay');
      return {catalogId:entry.id,props:p,fidelityMode:'native-props'};
    }
    case 'laohu-transition-overlap': {
      for(const field of ['textA','textB']) if(typeof p[field]!=='string'||!p[field].trim()||Array.from(p[field]).length>100) fail(`${field} must contain 1–100 characters`);
      for(const field of ['colorA','colorB','background']) if(p[field]!=null) hex(p[field],field);
      if(p.family!=null&&(typeof p.family!=='string'||!p.family.trim()||p.family.length>100)) fail('family must be a local font-family name');
      if(p.size!=null) finite(p.size,'size',{min:18,max:220}); if(p.weight!=null) finite(p.weight,'weight',{min:100,max:900,integer:true});
      finite(p.startFrame,'startFrame',{min:0,max:durationFrames-1,integer:true}); finite(p.endFrame,'endFrame',{min:p.startFrame+1,max:durationFrames,integer:true});
      if(!['crossfade','fade-through','directional-wipe','iris','push','shared-axis','zoom-through','page-flip','whip-pan'].includes(p.method)) fail('method must select a registered source presentation function');
      if(p.direction!=null&&!['left','right','up','down'].includes(p.direction)) fail('direction must be left, right, up, or down');
      if(p.softness!=null) finite(p.softness,'softness',{min:0,max:0.5});
      if(p.width!=null) finite(p.width,'width',{min:1,max:3840}); if(p.height!=null) finite(p.height,'height',{min:1,max:2160});
      if(p.center!=null){if(!Array.isArray(p.center)||p.center.length!==2)fail('center must be a normalized [x,y] point');p.center.forEach((v,i)=>finite(v,`center[${i}]`,{min:0,max:1}));}
      if(p.moveOutgoing!=null&&typeof p.moveOutgoing!=='boolean') fail('moveOutgoing must be boolean');
      if(p.axis!=null&&!['x','y','z'].includes(p.axis)) fail('axis must be x, y, or z'); if(p.distance!=null) finite(p.distance,'distance',{min:0,max:1000});
      if(p.origin!=null&&(typeof p.origin!=='string'||!/^(?:\d+(?:\.\d+)?%\s+){1}\d+(?:\.\d+)?%$/.test(p.origin))) fail('origin must use a percentage x/y pair');
      if(p.factor!=null) finite(p.factor,'factor',{min:0.1,max:10}); if(p.perspective!=null) finite(p.perspective,'perspective',{min:100,max:5000}); if(p.maxBlur!=null) finite(p.maxBlur,'maxBlur',{min:0,max:64});
      return {catalogId:entry.id,props:p,fidelityMode:'native-props'};
    }
    default: fail(`${entry.id} has no strict input validator`);
  }
}

function canonicalProps(value) { return canonical(value); }
function entryById(catalog, id) { return getEntry(catalog, id); }

export async function validateShotcraftSpec(catalog, entry, spec, options = {}) {
  entry = resolveCatalogEntry(catalog, entry);
  obj(spec, 'Shotcraft template spec');
  keys(spec, new Set(['templateId', 'width', 'height', 'fps', 'durationInFrames', 'fidelityMode', 'layers', 'componentProps', 'theme', 'colors', 'timeSec']), 'Shotcraft template spec');
  if (spec.templateId !== entry.id && spec.templateId !== entry.productionId) fail(`templateId must equal ${entry.id} or its production ID ${entry.productionId || entry.id}`);
  if ((spec.width ?? 1920) !== 1920 || (spec.height ?? 1080) !== 1080 || (spec.fps ?? 30) !== 30) fail('the verified Shotcraft adapter currently renders 1920×1080 at 30 fps only');
  const rootPaperFields = ['componentProps', 'theme', 'colors'].filter((field) => Object.hasOwn(spec, field));
  if (entry.id !== 'video-shotcraft-paper-title-card' && rootPaperFields.length) {
    fail(`${entry.id} does not consume root-level ${rootPaperFields.join(', ')}; pass source props through its layers or use the active PaperTitleCard template route`);
  }
  if (entry.id === 'video-shotcraft-paper-title-card' && spec.layers != null && rootPaperFields.length) {
    fail('PaperTitleCard accepts either root-level componentProps/theme/colors or one source layer with nested props, not both');
  }
  const durationFrames = finite(spec.durationInFrames, 'durationInFrames', {min: 1, max: 3600, integer: true});
  let node;
  if (isFullSceneEntry(entry)) {
    if (spec.layers != null) {
      if (!Array.isArray(spec.layers) || spec.layers.length !== 1) fail('full-scene prepared input must contain exactly one source component layer');
      const [sourceLayer] = spec.layers;
      obj(sourceLayer, 'layers[0]'); keys(sourceLayer, new Set(['catalogId', 'props', 'derivedPatch']), 'layers[0]');
      if (getEntry(catalog, sourceLayer.catalogId).id !== entry.id) fail('full-scene prepared input must call the exact catalog source component');
      const normalizedProps = sourceLayer.props == null ? {} : obj(sourceLayer.props, 'layers[0].props');
      const sourceProps = entry.id === 'video-shotcraft-paper-title-card'
        ? (() => {
          keys(normalizedProps, new Set(['componentProps', 'theme', 'colors']), 'layers[0].props');
          if (normalizedProps.componentProps != null) obj(normalizedProps.componentProps, 'layers[0].props.componentProps');
          return {...(normalizedProps.componentProps || {}), ...(normalizedProps.theme ? {theme:normalizedProps.theme} : {}), ...(normalizedProps.colors ? {colors:normalizedProps.colors} : {})};
        })()
        : normalizedProps;
      const resolvedMode = spec.fidelityMode || (entry.component.kind === 'source-adapted-full-scene' ? 'source-adapted-local' : 'exact-baseline');
      if (entry.component.kind === 'source-adapted-full-scene' && resolvedMode !== 'source-adapted-local') fail(`${entry.id} only supports source-adapted-local fidelityMode`);
      node = await validateNode(entry, sourceProps, {durationFrames, catalog, fidelityMode:resolvedMode, ...options});
      if (sourceLayer.derivedPatch != null) {
        if (spec.fidelityMode !== 'derived-patch' || entry.id !== 'video-shotcraft-paper-title-card-gallery') fail('derivedPatch is accepted only by the gallery PaperTitleCard derived-patch route');
        node.props.derivedPatch = await validateDerivedPatch(catalog, entry, sourceLayer.derivedPatch);
      } else if (spec.fidelityMode === 'derived-patch') fail('derived-patch mode requires a separate sourceLayer.derivedPatch contract');
    } else if (entry.id === 'video-shotcraft-paper-title-card') {
      const props = {...(spec.componentProps || {}), ...(spec.theme ? {theme: spec.theme} : {}), ...(spec.colors ? {colors: spec.colors} : {})};
      node = await validateNode(entry, props, {durationFrames, catalog, fidelityMode:spec.fidelityMode || 'native-props', ...options});
    } else {
      const resolvedMode = spec.fidelityMode || (entry.component.kind === 'source-adapted-full-scene' ? 'source-adapted-local' : 'exact-baseline');
      if (entry.component.kind === 'source-adapted-full-scene' && resolvedMode !== 'source-adapted-local') fail(`${entry.id} only supports source-adapted-local fidelityMode`);
      node = await validateNode(entry, spec.componentProps || {}, {durationFrames, catalog, fidelityMode:resolvedMode, ...options});
    }
  } else {
    if (spec.fidelityMode != null && spec.fidelityMode !== 'native-props') fail(`${entry.id} supports native-props only`);
    if (!Array.isArray(spec.layers) || spec.layers.length < 1 || spec.layers.length > 8) fail('local-effect spec requires 1–8 ordered component layers');
    const layers = [];
    for (const [index, layerSpec] of spec.layers.entries()) {
      obj(layerSpec, `layers[${index}]`); keys(layerSpec, new Set(['id', 'catalogId', 'props', 'placement']), `layers[${index}]`);
      if (layerSpec.id != null) stableId(layerSpec.id, `layers[${index}].id`);
      const childEntry = getEntry(catalog, layerSpec.catalogId);
      const validated = await validateNode(childEntry, layerSpec.props || {}, {durationFrames, catalog, fidelityMode:'native-props', ...options});
      const placement = validateLayerPlacement(childEntry.id, layerSpec.placement, `layers[${index}].placement`);
      if (childEntry.id === 'video-shotcraft-text-reveal' && validated.props.style?.maxWidth != null && validated.props.style.maxWidth > placement.width) fail(`layers[${index}].props.style.maxWidth cannot exceed its adapter-local placement width`);
      layers.push({...validated, ...(layerSpec.id ? {id:layerSpec.id} : {}), ...(placement ? {placement} : {})});
    }
    const layerIds = layers.map((layer) => layer.id).filter(Boolean);
    if (new Set(layerIds).size !== layerIds.length) fail('local-effect layer ids must be unique within one prepared composition');
    node = {layers};
  }
  const safeSpec = {
    templateId: entry.id,
    width: 1920, height: 1080, fps: 30,
    durationInFrames: durationFrames,
    fidelityMode: node.fidelityMode || spec.fidelityMode || 'native-props',
    layers: node.layers ? node.layers.map((layer) => ({
      catalogId: layer.catalogId,
      props: layer.props,
      ...(layer.id ? {id:layer.id} : {}),
      ...(layer.placement ? {placement:layer.placement} : {}),
    })) : [{catalogId: node.catalogId, props: node.props}],
  };
  Object.defineProperty(safeSpec, '_assetRecords', {value: options.assetRecords || [], enumerable: false});
  return safeSpec;
}

function frameBoundary(timeSec, fps) { const boundary = Math.ceil(timeSec * fps - EPS); return boundary === 0 ? 0 : boundary; }
function resolvePoint(timeline, anchor, label) {
  obj(anchor, label); keys(anchor, new Set(['kind', 'clipOccurrenceId', 'tokenId', 'edge']), label);
  if (anchor.kind !== 'point' || !['start', 'end'].includes(anchor.edge)) fail(`${label} currently supports an explicit ASR point token anchor only`);
  const occurrenceId = stableId(anchor.clipOccurrenceId, `${label}.clipOccurrenceId`);
  const tokenId = stableId(anchor.tokenId, `${label}.tokenId`);
  const unit = timeline.units.find((row) => row.kind === 'source' && row.occurrenceId === occurrenceId);
  const word = unit?.words?.find((row) => row.tokenId === tokenId);
  if (!word?.targetRange) fail(`${label} tokenId/occurrenceId does not resolve to one retained token in the frozen timeline`);
  if (!['measured', 'aligned'].includes(word.timingPrecision)) fail(`${label} refuses ${word.timingPrecision || 'unknown'} token precision as a precise animation cue`);
  return {sample: anchor.edge === 'start' ? word.targetRange.startSample : word.targetRange.endSample, sampleRateHz: word.targetRange.sampleRateHz, timingPrecision: word.timingPrecision, text: word.text};
}

async function loadAsrcutClock(blueprint, blueprintPath) {
  const clock = obj(blueprint.clock, 'clock');
  if (clock.kind === 'film-global') {
    keys(clock, new Set(['kind', 'durationSec']), 'clock');
    return {clockKind: 'film-global', durationSec: finite(clock.durationSec, 'clock.durationSec', {min: Number.EPSILON}), timeline: null, sourceEvidence: {}};
  }
  if (clock.kind !== 'asrcut-v2') fail('clock.kind must be film-global or asrcut-v2');
  keys(clock, new Set(['kind', 'timelinePath', 'timelineSha256', 'editPlanPath', 'editPlanSha256']), 'clock');
  for (const field of ['timelinePath', 'editPlanPath']) if (typeof clock[field] !== 'string' || !clock[field]) fail(`clock.${field} is required`);
  const base = path.dirname(blueprintPath);
  const timelinePath = path.resolve(base, clock.timelinePath), planPath = path.resolve(base, clock.editPlanPath);
  const [timelineBytes, planBytes] = await Promise.all([fs.readFile(timelinePath), fs.readFile(planPath)]);
  const timelineHash = sha256(timelineBytes), planHash = sha256(planBytes);
  if (timelineHash !== clock.timelineSha256 || planHash !== clock.editPlanSha256) fail('ASR timeline/edit-plan SHA-256 does not match the blueprint lock');
  const timeline = JSON.parse(timelineBytes.toString('utf8')), plan = JSON.parse(planBytes.toString('utf8'));
  if (timeline.format !== 'laohu.asrcut.timeline/2' || timeline.state !== 'frozen' || plan.format !== 'laohu.asrcut.edit-plan/2' || plan.state !== 'frozen') fail('asrcut-v2 requires a frozen timeline/2 and edit-plan/2');
  if (hashPlan(plan) !== timeline.planSha256 || canonical(compilePlan(plan)) !== canonical(timeline)) fail('ASR timeline is not the canonical compile of its frozen edit plan');
  for (const source of plan.sources || []) if (source.sha256 && source.mediaPath) {
    const media = path.resolve(path.dirname(planPath), source.mediaPath);
    if (sha256(await fs.readFile(media)) !== source.sha256) fail(`ASR source media hash changed: ${source.id}`);
  }
  const evidence = await verifyPlanEvidence(plan, {baseDir: path.dirname(planPath)});
  return {clockKind: 'asrcut-v2', durationSec: timeline.durationSamples / timeline.clock.sampleRateHz, timeline,
    timelinePath, timelineSha256: timelineHash, editPlanPath: planPath, editPlanSha256: planHash,
    evidence: {verified: evidence.verified.map((item) => item.sourceId), unlocated: evidence.unlocated.map((item) => ({sourceId: item.sourceId, reason: item.reason}))}};
}

function validateSegmentSpan(segment, index, clock, scheduleCursor) {
  const label = `segments[${index}]`;
  obj(segment, label);
  const common = ['id', 'renderer', 'compositionGroupId', 'startSec', 'endSec', 'unitIds', 'layers', 'actionBindings', 'incomingTransition'];
  if (segment.renderer === 'video-shotcraft-remotion') {
    keys(segment, new Set([...common, 'sourceCatalogId', 'componentPath', 'componentSha256', 'exportName', 'sourceCommit', 'sourceDurationFrames', 'fidelityMode', 'props', 'sourceFrameAtSegmentStart', 'eventScenePath', 'eventSceneSha256']), label);
  } else if (segment.renderer === 'motion-scene') {
    keys(segment, new Set([...common, 'scenePath', 'sceneSha256', 'drawModulePath', 'drawModuleSha256', 'templateEffects']), label);
    if (typeof segment.scenePath !== 'string' || !segment.scenePath.trim()) fail(`${label}.scenePath is required for motion-scene`);
    if (typeof segment.sceneSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(segment.sceneSha256)) fail(`${label}.sceneSha256 is required for motion-scene`);
    if ((segment.drawModulePath == null) !== (segment.drawModuleSha256 == null)) fail(`${label}.drawModulePath and .drawModuleSha256 must be supplied together`);
    if (segment.drawModulePath != null && (typeof segment.drawModulePath !== 'string' || !segment.drawModulePath.trim() || !/^[a-f0-9]{64}$/.test(segment.drawModuleSha256))) fail(`${label} custom draw module needs a path and SHA-256`);
    if (segment.templateEffects != null && segment.templateEffects !== 'huashu-art-motion-dg') fail(`${label}.templateEffects is not a registered local renderer effect`);
  } else if (segment.renderer === 'laohu-project-shot') {
    keys(segment, new Set([...common, 'modulePath', 'moduleSha256', 'exportName', 'props', 'dependencies', 'assets']), label);
    if (typeof segment.modulePath !== 'string' || !segment.modulePath.trim()) fail(`${label}.modulePath is required for laohu-project-shot`);
    if (typeof segment.moduleSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(segment.moduleSha256)) fail(`${label}.moduleSha256 must be a SHA-256 hex digest`);
    if (typeof segment.exportName !== 'string' || !segment.exportName.trim()) fail(`${label}.exportName is required for laohu-project-shot`);
    if (segment.props != null && (!segment.props || typeof segment.props !== 'object' || Array.isArray(segment.props))) fail(`${label}.props must be an object`);
    if (segment.dependencies != null && !Array.isArray(segment.dependencies)) fail(`${label}.dependencies must be an array`);
    if (segment.assets != null && !Array.isArray(segment.assets)) fail(`${label}.assets must be an array`);
  } else if (segment.renderer === 'native-html-canvas-template') {
    keys(segment, new Set([...common, 'templateId', 'parameters']), label);
    stableId(segment.templateId, `${label}.templateId`); obj(segment.parameters || {}, `${label}.parameters`);
  } else if (segment.renderer === 'laohu-native-om-template') {
    keys(segment, new Set([...common, 'templateId', 'variables', 'omCues', 'omScore', 'omMusic', 'sourceCueBindings']), label);
    stableId(segment.templateId, `${label}.templateId`); obj(segment.variables || {}, `${label}.variables`);
  } else if (segment.renderer === 'huashu-motion-template') {
    // Compatibility spelling for old /2 candidates. It is normalized only
    // after catalog type proves that this is a complete native OM template;
    // the raw native-clip grammar remains outside Film /2.
    keys(segment, new Set([...common, 'templateId', 'variables', 'eventScenePath', 'eventSceneSha256', 'omCues', 'omScore', 'omMusic', 'sourceCueBindings']), label);
    stableId(segment.templateId, `${label}.templateId`); obj(segment.variables || {}, `${label}.variables`);
    if ((segment.eventScenePath == null) !== (segment.eventSceneSha256 == null)) fail(`${label}.eventScenePath and .eventSceneSha256 must be supplied together`);
    if (segment.eventScenePath != null && (typeof segment.eventScenePath !== 'string' || !segment.eventScenePath.trim() || !/^[a-f0-9]{64}$/.test(segment.eventSceneSha256))) fail(`${label}.eventScenePath needs a matching SHA-256`);
  } else fail(`${label}.renderer must be video-shotcraft-remotion, laohu-project-shot, motion-scene, or laohu-native-om-template`);
  stableId(segment.id, `${label}.id`); stableId(segment.compositionGroupId, `${label}.compositionGroupId`);
  if (segment.renderer === 'video-shotcraft-remotion') {
    if (typeof segment.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(segment.sourceCommit)) fail(`${label}.sourceCommit must be a pinned 40-character commit`);
    if (typeof segment.sourceCatalogId !== 'string') fail(`${label}.sourceCatalogId is required`);
    if (typeof segment.componentPath !== 'string' || typeof segment.exportName !== 'string') fail(`${label} must identify the exact component path/export`);
    if (typeof segment.componentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(segment.componentSha256)) fail(`${label}.componentSha256 is required`);
    if (segment.sourceDurationFrames != null) finite(segment.sourceDurationFrames, `${label}.sourceDurationFrames`, {min: 1, max: 100000, integer: true});
    if (segment.sourceFrameAtSegmentStart != null && finite(segment.sourceFrameAtSegmentStart, `${label}.sourceFrameAtSegmentStart`, {min: 0, max: 100000, integer: true}) !== 0) fail(`${label}.sourceFrameAtSegmentStart currently supports only 0; source trims require a separately verified mapping and cannot be silently ignored`);
    if (!['exact-baseline', 'native-props', 'derived-patch', 'source-adapted-local'].includes(segment.fidelityMode)) fail(`${label}.fidelityMode must be exact-baseline, native-props, derived-patch, or source-adapted-local`);
  }
  let startSec, endSec, range;
  if (clock.clockKind === 'film-global') {
    if (Object.hasOwn(segment, 'unitIds')) fail(`${label} under film-global cannot contain unitIds`);
    startSec = finite(segment.startSec, `${label}.startSec`, {min: 0}); endSec = finite(segment.endSec, `${label}.endSec`, {min: 0});
    if (endSec <= startSec) fail(`${label} endSec must exceed startSec`);
    range = {startSec, endSec};
  } else {
    if (Object.hasOwn(segment, 'startSec') || Object.hasOwn(segment, 'endSec')) fail(`${label} under asrcut-v2 uses unitIds, never hand-authored seconds`);
    if (!Array.isArray(segment.unitIds) || !segment.unitIds.length) fail(`${label}.unitIds must be a non-empty frozen unit list`);
    const units = segment.unitIds.map((id) => {
      stableId(id, `${label}.unitIds[]`);
      const unit = clock.timeline.units.find((row) => row.occurrenceId === id || row.id === id);
      if (!unit) fail(`${label}.unitIds references missing frozen timeline unit ${id}`);
      return unit;
    });
    for (const id of segment.unitIds) {
      const ix = clock.timeline.units.findIndex((row) => row.occurrenceId === id || row.id === id);
      if (ix !== scheduleCursor.nextUnitIndex++) fail(`${label}.unitIds must consume each frozen timeline unit once, in order`);
    }
    const first = units[0].targetRange, last = units.at(-1).targetRange;
    for (let i = 1; i < units.length; i++) if (units[i - 1].targetRange.endSample !== units[i].targetRange.startSample) fail(`${label}.unitIds contain a gap or overlap`);
    startSec = first.startSample / first.sampleRateHz; endSec = last.endSample / last.sampleRateHz;
    range = {startSample: first.startSample, endSample: last.endSample, sampleRateHz: first.sampleRateHz};
  }
  const startFrame = frameBoundary(startSec, 30), endFrame = frameBoundary(endSec, 30);
  if (startFrame !== scheduleCursor.frame) fail(`${label} does not meet the previous absolute-ceil frame boundary`);
  if (endFrame <= startFrame) fail(`${label} collapses to zero frames`);
  scheduleCursor.frame = endFrame;
  scheduleCursor.exactEnd = endSec;
  return {id: segment.id, segment, startSec, endSec, frameRange: {startFrame, endFrame}, frameCount: endFrame - startFrame, localDurationSec: (endFrame - startFrame) / 30, exactDurationSec: endSec - startSec, sourceRange: range, fps: 30, width: 1920, height: 1080};
}

async function validateLocalBaseSource(segment, row, blueprintPath, catalog, runtimeContext = {}) {
  if (segment.renderer === 'motion-scene') {
    const sourcePath = path.resolve(path.dirname(blueprintPath), segment.scenePath);
    const bytes = await fs.readFile(sourcePath);
    const actual = sha256(bytes);
    if (actual !== segment.sceneSha256) fail(`${segment.id}.sceneSha256 is stale`);
    const scene = JSON.parse(bytes.toString('utf8'));
    if (scene.format !== MOTION_SCENE_FORMAT || scene.version !== 1) fail(`${segment.id} motion scene must be motion-scene-v1`);
    if (scene.width !== 1920 || scene.height !== 1080 || scene.fps !== 30 || !closeTo(scene.duration, row.localDurationSec, 1 / 30)) fail(`${segment.id} motion scene must already render the complete ${row.frameCount}-frame 1920×1080@30 segment`);
    if (Math.round(scene.duration * 30) !== row.frameCount) fail(`${segment.id} motion scene duration does not match its compiled frame count`);
    let drawModule = null;
    if (segment.drawModulePath) {
      const file = path.resolve(path.dirname(blueprintPath), segment.drawModulePath);
      const drawBytes = await fs.readFile(file);
      if (sha256(drawBytes) !== segment.drawModuleSha256) fail(`${segment.id}.drawModuleSha256 is stale`);
      drawModule = {path: file, sha256: segment.drawModuleSha256};
    }
    return {renderer: segment.renderer, scenePath: sourcePath, sceneSha256: actual, scene, drawModule};
  }
  if (segment.renderer === 'laohu-project-shot') {
    const workRoot = path.resolve(runtimeContext.workRoot || repoRoot);
    const runtimeRoot = path.resolve(runtimeContext.runtimeRoot || process.env.MOTION_RUNTIME_ROOT || managedMotionRuntimeRoot({skillRoot: skillDir, workRoot}));
    const runtimeNodeModules = path.resolve(runtimeContext.nodeModules || path.join(runtimeRoot, 'node_modules'));
    const projectShot = await resolveProjectShotModule({segment, blueprintPath, runtimeNodeModules, skillRoot: skillDir});
    return {
      renderer: segment.renderer,
      projectShot,
      width: row.width,
      height: row.height,
      fps: row.fps,
      durationInFrames: row.frameCount,
    };
  }
  const template = catalog.templates.find((entry) => entry.id === segment.templateId || (entry.aliases || []).includes(segment.templateId));
  if (!template || template.availability === 'source-only') fail(`${segment.id}.templateId must resolve to a callable catalogued full-frame source template`);
  const renderer = segment.renderer === 'huashu-motion-template' ? 'laohu-native-om-template' : segment.renderer;
  if (renderer === 'laohu-native-om-template') {
    if (segment.eventScenePath != null) fail(`${segment.id} complete OM source events are generated from the verified runtime probe; use the one canonical audioEventScenePath only for film-global events`);
    if (template.renderer !== 'native-om-template-source'
        || template.compositionSupport?.filmV2Base !== true
        || template.compositionSupport?.renderer !== 'laohu-native-om-template') {
      fail(`${segment.id}.templateId must resolve to a catalogued full OM template enabled for Film /2 base composition`);
    }
    const source = catalog.sources.find((entry) => entry.id === template.sourceId);
    const sourceFile = source?.files?.find((file) => file.path === template.sourcePath);
    if (!sourceFile?.sha256) fail(`${segment.id} native OM template source has no pinned SHA-256`);
    return {
      renderer,
      ...(segment.renderer !== renderer ? {normalizedFromRenderer: segment.renderer} : {}),
      templateId: template.id,
      templateSourcePath: template.sourcePath,
      templateSourceSha256: sourceFile.sha256,
      templateSourceId: template.sourceId,
      variables: deepClone(segment.variables || {}),
      ...(segment.omCues == null ? {} : {omCues: deepClone(segment.omCues)}),
      ...(segment.omScore == null ? {} : {omScore: deepClone(segment.omScore)}),
      ...(segment.omMusic == null ? {} : {omMusic: deepClone(segment.omMusic)}),
      ...(segment.sourceCueBindings == null ? {} : {sourceCueBindings: deepClone(segment.sourceCueBindings)}),
    };
  }
  if (segment.renderer === 'native-html-canvas-template') {
    if (template.renderer !== 'native-html-canvas-template'
        || template.compositionSupport?.filmV2Base !== true
        || template.compositionSupport?.renderer !== 'native-html-canvas-template'
        || !['source-full-frame', 'fixed-source-full-frame'].includes(template.compositionSupport?.framePolicy)) {
      fail(`${segment.id}.templateId must resolve to a catalogued full-frame HTML/Canvas template enabled for Film /2 base composition`);
    }
    if (!template.sourceSha256) fail(`${segment.id} native HTML template has no pinned source SHA-256`);
    return {
      renderer,
      templateId: template.id,
      templateSourcePath: template.sourcePath,
      templateSourceSha256: template.sourceSha256,
      templateSourceId: template.sourceId,
      parameters: deepClone(segment.parameters || {}),
    };
  }
  fail(`${segment.id}.renderer is not an enabled local full-frame Film /2 base renderer`);
}

function projectShotBinding(source) {
  return {
    module: {path: source.module.path, sha256: source.module.sha256, exportName: source.module.exportName},
    props: source.props,
    propsSha256: source.propsSha256,
    dependencies: source.dependencies,
    sourceFiles: source.sourceFiles,
    sourceGraphSha256: source.sourceGraphSha256,
    stableModules: source.stableModules.map(({path: filePath, sha256: digest, bytes}) => ({path: filePath, sha256: digest, bytes})),
    stableModuleGraphSha256: source.stableModuleGraphSha256,
    runtimePackages: source.runtimePackages,
    runtimeLockSha256: source.runtimeLockSha256,
    assets: source.assets.map(({path: filePath, sha256: digest, bytes}) => ({path: filePath, sha256: digest, bytes})),
    adapter: source.adapter,
  };
}

async function sourceActionFrame(catalog, entry, action, layers, options = {}) {
  obj(action, 'action binding');
  keys(action, new Set(['id', 'landmarkId', 'index', 'wordText', 'unitText', 'semanticCueId', 'componentCatalogId', 'componentInstanceId', 'textRelation', 'timelineAnchor', 'audioEventId', 'toleranceFrames']), 'action binding');
  stableId(action.id, 'action binding.id'); stableId(action.landmarkId, 'action binding.landmarkId'); stableId(action.semanticCueId, 'action binding.semanticCueId');
  if (action.componentCatalogId != null) stableId(action.componentCatalogId, 'action binding.componentCatalogId');
  if (action.componentInstanceId != null) stableId(action.componentInstanceId, 'action binding.componentInstanceId');
  if (action.componentInstanceId != null && action.componentCatalogId == null) fail('action binding.componentInstanceId requires componentCatalogId so it resolves to the actual rendered component kind');
  if (action.textRelation != null && !['semantic', 'literal'].includes(action.textRelation)) fail('action binding.textRelation must be semantic or literal');
  if (action.audioEventId != null) stableId(action.audioEventId, 'action binding.audioEventId');
  const candidates = layers.filter((item) => item.catalogId === entry.id);
  const matches = action.componentInstanceId == null
    ? candidates
    : candidates.filter((item) => item.id === action.componentInstanceId);
  if (matches.length !== 1) fail(action.componentInstanceId
    ? `${action.id} componentInstanceId must resolve to exactly one rendered ${entry.id} layer`
    : `${action.id} must use componentInstanceId when more than one ${entry.id} layer is rendered`);
  const node = matches[0];
  if (entry.id === 'laohu-authored-shot' && node?.props?.shotId === 'caption-type' && action.landmarkId === 'caption-title-reveal') {
    if (!Number.isSafeInteger(options.targetFrame) || !Number.isSafeInteger(options.segmentStartFrame)
        || !Number.isSafeInteger(options.segmentFrameCount)) fail(`${action.id} caption-title-reveal requires a resolved frozen ASR point inside its rendered segment`);
    const localFrame = options.targetFrame - options.segmentStartFrame;
    if (localFrame < 0 || localFrame >= options.segmentFrameCount) fail(`${action.id} ASR title anchor must fall inside its rendered caption-type segment`);
    const title = node.props.parameters?.title;
    if (typeof title !== 'string' || !title.trim()) fail(`${action.id} caption-title-reveal requires the actual caption-type title text`);
    const explicitAt = node.props.parameters.titleAtFrame;
    if (explicitAt != null && explicitAt !== localFrame) fail(`${action.id} ASR-derived titleAtFrame conflicts with the authored component parameter`);
    return {
      frame: localFrame, actionIndex: null, actionText: title, layerId: node.id || null,
      formula: `CaptionTypeShot TrackIn.at = ASR targetFrame ${options.targetFrame} - segment startFrame ${options.segmentStartFrame}`,
      componentProp: {path: ['parameters', 'titleAtFrame'], value: localFrame},
    };
  }
  if (entry.id === 'video-shotcraft-list-stack-five') {
    if (action.textRelation === 'literal') fail('ListStackPress motion landmarks are not literal text reveals; bind them semantically to the same film-global event clock');
    const indexedLandmarks = new Map([
      ['card-enter', (index) => CUES_FOR_LIST_STACK[index]],
      ['nominal-flight-end', (index) => CUES_FOR_LIST_STACK[index] + 22],
      ['roll-end', (index) => CUES_FOR_LIST_STACK[index] + 22 + 8],
      ['stack-pulse-peak', (index) => CUES_FOR_LIST_STACK[index] + 4],
    ]);
    const fixedLandmarks = new Map([
      ['camera-motion-end', 82], ['glaze-visible-start', 74], ['glaze-full', 77],
      ['glaze-fade-start', 84], ['glaze-end', 87],
    ]);
    if (indexedLandmarks.has(action.landmarkId)) {
      const range = action.landmarkId === 'stack-pulse-peak' ? {min:1,max:4} : {min:0,max:4};
      const index = finite(action.index, 'action binding.index', {...range, integer:true});
      return {frame:indexedLandmarks.get(action.landmarkId)(index), actionIndex:index, actionText:null, layerId:node.id || null, formula:`ListStackPress source frame: ${action.landmarkId}[${index}]`};
    }
    if (fixedLandmarks.has(action.landmarkId)) {
      if (action.index != null) fail(`${action.landmarkId} is a fixed source frame and does not accept index`);
      return {frame:fixedLandmarks.get(action.landmarkId), actionIndex:null, actionText:null, layerId:node.id || null, formula:`ListStackPress source frame: ${action.landmarkId}`};
    }
  }
  if (action.landmarkId === 'word-reveal' && entry.id.startsWith('video-shotcraft-paper-title-card')) {
    const index = finite(action.index, 'action binding.index', {min: 0, max: 8, integer: true});
    let words = entry.id === 'video-shotcraft-paper-title-card' ? node?.props.componentProps?.words : node?.props.derivedPatch?.words;
    if (entry.id === 'video-shotcraft-paper-title-card-gallery' && !words) {
      const verified = await verifySourceAndEntry(catalog, entry);
      const component = verified.closure.find((row) => row.path === entry.component.path);
      if (!component || component.sha256 !== entry.component.sha256) fail(`${entry.id} pinned display-copy source hash changed before action binding`);
      const sourceBytes = await fs.readFile(path.resolve(skillDir, component.localPath));
      if (sha256(sourceBytes) !== component.localSha256) fail(`${entry.id} local display-copy source hash changed before action binding`);
      words = parseStaticGalleryWords(sourceBytes.toString('utf8'));
    }
    if (!Array.isArray(words) || index >= words.length) fail('word-reveal index must resolve to the actual validated source word list');
    const wordText = action.wordText;
    if (typeof wordText !== 'string' || wordText !== words[index].text) fail(`action binding.wordText must exactly match the pinned/rendered PaperTitleCard word at index ${index}`);
    return {frame: 4 + 4 * index, actionIndex: index, actionText: wordText, layerId:node.id || null, formula: 'source frame = 4 + 4 * wordIndex'};
  }
  if (action.landmarkId === 'unit-reveal' && entry.id === 'video-shotcraft-text-reveal') {
    const props = node?.props || {};
    const text = props.text || '';
    const by = props.by || 'char';
    const units = by === 'line' ? text.split('\n') : by === 'word' ? text.split(/(\s+)/).filter((unit) => !/^\s+$/.test(unit)) : Array.from(text);
    const index = finite(action.index, 'action binding.index', {min: 0, max: Math.max(0, units.length - 1), integer: true});
    if (typeof action.unitText !== 'string' || action.unitText !== units[index]) fail(`action binding.unitText must exactly match TextReveal's ${by} split unit at index ${index}`);
    const gap = props.gap ?? (by === 'char' ? 1.6 : by === 'word' ? 4 : 7);
    const frame = Math.ceil((props.start ?? 0) + index * gap - EPS);
    return {frame, actionIndex: index, actionText: action.unitText, layerId:node.id || null, formula: 'ceil(start + visibleUnitIndex * resolvedGap)'};
  }
  fail(`No verified source action landmark ${action.landmarkId} is registered for ${entry.id}`);
}

async function compileFilmV2(blueprint, blueprintPath, catalog, runtimeContext = {}) {
  obj(blueprint, 'film blueprint');
  keys(blueprint, new Set(['format', 'width', 'height', 'fps', 'clock', 'segments', 'compositionGroups', 'transitionEdges', 'audioEventScenePath', 'audioEventSceneSha256']), 'film blueprint');
  if (blueprint.format !== FILM_FORMAT_V2) fail(`film blueprint.format must be ${FILM_FORMAT_V2}`);
  if (blueprint.width !== 1920 || blueprint.height !== 1080 || blueprint.fps !== 30) fail('/2 requires 1920×1080@30fps so pinned source frames retain their frame timing');
  const clock = await loadAsrcutClock(blueprint, blueprintPath);
  const cursor = {frame: 0, exactEnd: 0, nextUnitIndex: 0};
  if (!Array.isArray(blueprint.segments) || blueprint.segments.length < 1) fail('segments must be a non-empty ordered list');
  const seen = new Set();
  const rows = [];
  for (const [index, raw] of blueprint.segments.entries()) {
    const row = validateSegmentSpan(raw, index, clock, cursor);
    row.incomingTransition = parseIncomingTransition(raw.incomingTransition, `segments[${index}].incomingTransition`);
    if (seen.has(row.id)) fail(`duplicate segment id ${row.id}`); seen.add(row.id);
    const isShotcraft = raw.renderer === 'video-shotcraft-remotion';
    const entry = isShotcraft ? getEntry(catalog, raw.sourceCatalogId) : null;
    let sourceVerification = null;
    let baseSource = null;
    if (isShotcraft) {
      sourceVerification = await verifySourceAndEntry(catalog, entry);
      if (raw.sourceCommit !== sourceVerification.sourceCommit) fail(`${raw.id}.sourceCommit must match ${sourceVerification.sourceId}'s verified pinned commit`);
      if (entry.component.path !== raw.componentPath || entry.component.sha256 !== raw.componentSha256 || entry.component.exportName !== raw.exportName) fail(`${raw.id} component path/hash/export disagrees with its catalog record`);
      if (!entry.fidelityModes.includes(raw.fidelityMode)) fail(`${entry.id} does not support fidelityMode ${raw.fidelityMode}`);
      const baselineDuration = entry.sourceDurationFrames ?? entry.baselineProps?.duration ?? entry.baselineProps?.durationInFrames;
      if (raw.fidelityMode === 'exact-baseline' && raw.sourceDurationFrames !== baselineDuration) fail(`${raw.id} exact sourceDurationFrames must equal its cataloged native baseline duration`);
      if (raw.fidelityMode === 'exact-baseline' && row.frameCount !== raw.sourceDurationFrames) fail(`${raw.id} exact-baseline segment length must equal its complete source duration; no hidden hold, loop, trim, or time stretch is applied`);
      if (raw.fidelityMode === 'source-adapted-local') {
        if (entry.component.kind !== 'source-adapted-full-scene' || entry.sourceMethodAdaptation?.kind !== 'source-adapted-local') fail(`${raw.id} source-adapted-local is limited to catalog entries with an explicit local adaptation contract`);
        if (!Number.isSafeInteger(baselineDuration) || raw.sourceDurationFrames !== baselineDuration || row.frameCount !== baselineDuration) fail(`${raw.id} source adaptation must retain its fixed ${baselineDuration}-frame source and segment duration`);
      }
      if (raw.fidelityMode === 'derived-patch') {
        if (entry.id !== 'video-shotcraft-paper-title-card-gallery') fail(`${raw.id} derived-patch is limited to the catalog-registered active gallery PaperTitleCard provider`);
        if (raw.sourceDurationFrames !== entry.sourceDurationFrames || row.frameCount !== entry.sourceDurationFrames) fail(`${raw.id} derived-patch must retain the complete ${entry.sourceDurationFrames}-frame source duration`);
        if (raw.props != null && canonicalProps(raw.props) !== canonicalProps({})) fail(`${raw.id} derived-patch content belongs only in its separate layer.derivedPatch object; source props remain empty`);
        await verifyDerivedPatchProvider(catalog, entry);
      }
      if (isFullSceneEntry(entry) && raw.layers != null && raw.layers.length !== 1) fail(`${raw.id} full-scene source route cannot be decomposed or overlaid; use explicitly selected local components for a recomposed scene`);
    } else {
      baseSource = await validateLocalBaseSource(raw, row, blueprintPath, catalog, runtimeContext);
    }
    if (raw.eventScenePath != null && (typeof raw.eventScenePath !== 'string' || typeof raw.eventSceneSha256 !== 'string')) fail(`${raw.id} eventScenePath/eventSceneSha256 must be supplied together`);
    if (raw.eventScenePath != null && (raw.eventScenePath !== blueprint.audioEventScenePath || raw.eventSceneSha256 !== blueprint.audioEventSceneSha256)) fail(`${raw.id} event scene must be the single canonical film-global scene declared by the blueprint`);
    if (isShotcraft && raw.layers != null && raw.props != null && canonicalProps(raw.props) !== canonicalProps({})) fail(`${raw.id} cannot supply both layers and separately ignored top-level source props; put source values in its one layer`);
    const rawLayers = raw.layers || (isShotcraft ? [{catalogId: entry.id, props: raw.props || {}}] : []);
    if (!Array.isArray(rawLayers) || (isShotcraft && !rawLayers.length) || rawLayers.length > 8) fail(`${raw.id}.layers must contain ${isShotcraft ? '1–8' : '0–8'} ordered components`);
    if (isShotcraft && isFullSceneEntry(entry) && (rawLayers.length !== 1 || getEntry(catalog, rawLayers[0]?.catalogId).id !== entry.id)) fail(`${raw.id} full-scene must render its one pinned source component without recomposition`);
    if (isShotcraft && raw.fidelityMode === 'derived-patch' && (rawLayers.length !== 1 || getEntry(catalog, rawLayers[0]?.catalogId).id !== entry.id || rawLayers[0]?.derivedPatch == null)) fail(`${raw.id} derived-patch requires exactly one gallery source layer with a separate derivedPatch contract`);
    const assetRecords = [];
    const layers = [];
    for (const [layerIndex, layerSpec] of rawLayers.entries()) {
      obj(layerSpec, `${raw.id}.layers[${layerIndex}]`);
      keys(layerSpec, new Set(['id', 'catalogId', 'props', 'placement', 'derivedPatch']), `${raw.id}.layers[${layerIndex}]`);
      if (layerSpec.id != null) stableId(layerSpec.id, `${raw.id}.layers[${layerIndex}].id`);
      const layerEntry = getEntry(catalog, layerSpec.catalogId);
      await verifySourceAndEntry(catalog, layerEntry);
      if (!isShotcraft && layerEntry.component.kind !== 'local-effect') fail(`${raw.id}.layers can only overlay validated local-effect Shotcraft components; transitions must use transitionEdges`);
      if (isShotcraft && raw.fidelityMode === 'exact-baseline' && layerEntry.id !== entry.id) fail('exact-baseline must not layer a changed renderer beside the pinned source scene');
      const layerMode = isShotcraft ? raw.fidelityMode : 'native-props';
      const validated = await validateNode(layerEntry, layerSpec.props || {}, {durationFrames: row.frameCount, assetsRoot: path.dirname(blueprintPath), blueprintPath, assetRecords, catalog, fidelityMode: layerMode});
      if (layerSpec.derivedPatch != null) {
        if (!isShotcraft || raw.fidelityMode !== 'derived-patch' || layerEntry.id !== 'video-shotcraft-paper-title-card-gallery') fail(`${raw.id}.layers[${layerIndex}].derivedPatch is only consumed by its exact Shotcraft gallery derived-patch source layer`);
        validated.props.derivedPatch = await validateDerivedPatch(catalog, layerEntry, layerSpec.derivedPatch);
      } else if (isShotcraft && raw.fidelityMode === 'derived-patch') fail(`${raw.id} derived-patch source layer is missing layer.derivedPatch`);
      const placement = validateLayerPlacement(layerEntry.id, layerSpec.placement, `${raw.id}.layers[${layerIndex}].placement`);
      if (layerEntry.id === 'video-shotcraft-text-reveal' && validated.props.style?.maxWidth != null && validated.props.style.maxWidth > placement.width) fail(`${raw.id}.layers[${layerIndex}] maxWidth cannot exceed its adapter-local placement width`);
      layers.push({...validated, ...(layerSpec.id ? {id:layerSpec.id} : {}), ...(placement ? {placement} : {})});
    }
    const layerIds = layers.map((layer) => layer.id).filter(Boolean);
    if (new Set(layerIds).size !== layerIds.length) fail(`${raw.id}.layers ids must be unique within one segment`);
    const actionBindings = [];
    if (raw.actionBindings != null && !Array.isArray(raw.actionBindings)) fail(`${raw.id}.actionBindings must be an array`);
    for (const action of raw.actionBindings || []) {
      if (!isShotcraft && !action.componentCatalogId) fail(`${action.id}.componentCatalogId is required to bind a local overlay action to its actual Shotcraft source component`);
      const actionEntry = getEntry(catalog, isShotcraft ? (action.componentCatalogId || entry.id) : action.componentCatalogId);
      let asrAnchor = null;
      let targetFrame = null;
      if (action.timelineAnchor != null) {
        if (!clock.timeline) fail(`${action.id} cannot declare timelineAnchor without asrcut-v2`);
        const point = resolvePoint(clock.timeline, action.timelineAnchor, `${action.id}.timelineAnchor`);
        const targetSec = point.sample / point.sampleRateHz;
        targetFrame = frameBoundary(targetSec, blueprint.fps);
        asrAnchor = {...action.timelineAnchor, targetSample: point.sample, sampleRateHz: point.sampleRateHz, timingPrecision: point.timingPrecision, targetFrame};
      } else if (clock.timeline) fail(`${action.id} needs a frozen ASR point anchor or must be explicitly omitted from speech binding`);
      const landmark = await sourceActionFrame(catalog, actionEntry, action, layers,
        targetFrame == null ? {} : {targetFrame, segmentStartFrame: row.frameRange.startFrame, segmentFrameCount: row.frameCount});
      const actionFrame = row.frameRange.startFrame + landmark.frame;
      if (actionFrame < row.frameRange.startFrame || actionFrame >= row.frameRange.endFrame) fail(`${action.id} source landmark falls beyond the rendered local segment frame domain`);
      if (landmark.componentProp) {
        const targetLayer = layers.find((layer) => layer.catalogId === actionEntry.id
          && (action.componentInstanceId == null || layer.id === action.componentInstanceId));
        let destination = targetLayer?.props;
        for (const part of landmark.componentProp.path.slice(0, -1)) destination = destination?.[part];
        if (!destination || typeof destination !== 'object') fail(`${action.id} computed component property path is not present in its validated layer`);
        const field = landmark.componentProp.path.at(-1);
        if (destination[field] != null && destination[field] !== landmark.componentProp.value) fail(`${action.id} computed component property conflicts with its validated layer value`);
        destination[field] = landmark.componentProp.value;
      }
      if (asrAnchor) {
        const deltaFrames = targetFrame - actionFrame;
        const tolerance = finite(action.toleranceFrames ?? 0, `${action.id}.toleranceFrames`, {min: 0, max: 2, integer: true});
        if (Math.abs(deltaFrames) > tolerance) fail(`${action.id} source landmark is ${deltaFrames}f from the frozen ASR anchor, outside tolerance ${tolerance}f; keep both clocks and revise the edit/design explicitly`);
        asrAnchor.deltaFrames = deltaFrames;
        if (action.textRelation === 'literal') {
          const point = resolvePoint(clock.timeline, action.timelineAnchor, `${action.id}.timelineAnchor`);
          const normalized = (text) => String(text || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
          if (normalized(point.text) !== normalized(landmark.actionText)) fail(`${action.id} literal text relation requires the retained ASR token to match the source display unit`);
        }
      }
      actionBindings.push({id: action.id, landmarkId: action.landmarkId, componentCatalogId: actionEntry?.id || null, componentInstanceId: action.componentInstanceId || landmark.layerId || null, sourceActionFrame: actionFrame, sourceFrameWithinComponent: landmark.frame, actionText: landmark.actionText, formula: landmark.formula, semanticCueId: action.semanticCueId, textRelation: action.textRelation || 'semantic', timelineAnchor: asrAnchor, audioEventId: action.audioEventId || null});
    }
    rows.push({...row, sourceEntry: entry, sourceVerification, baseSource, layers, actionBindings, assetRecords});
  }
  if (clock.clockKind === 'asrcut-v2' && cursor.nextUnitIndex !== clock.timeline.units.length) fail('segments must cover every frozen timeline unit exactly once');
  const totalFrameCount = rows.at(-1).frameRange.endFrame;
  if (!closeTo(cursor.exactEnd, clock.durationSec)) fail('film segments do not end at the declared global/frozen duration');
  if (frameBoundary(clock.durationSec, blueprint.fps) !== totalFrameCount) fail('film segments do not cover the absolute-ceil output frame clock');

  if (!Array.isArray(blueprint.compositionGroups) || !blueprint.compositionGroups.length) fail('compositionGroups must partition every continuous segment');
  const groups = [], groupBySegment = new Map(); let nextSegment = 0;
  for (const [gi, raw] of blueprint.compositionGroups.entries()) {
    obj(raw, `compositionGroups[${gi}]`); keys(raw, new Set(['id', 'segmentIds']), `compositionGroups[${gi}]`); stableId(raw.id, `compositionGroups[${gi}].id`);
    if (!Array.isArray(raw.segmentIds) || !raw.segmentIds.length) fail(`compositionGroups[${gi}].segmentIds must be non-empty`);
    const members = raw.segmentIds.map((id) => {
      const found = rows[nextSegment];
      if (!found || found.id !== id) fail('compositionGroups must partition ordered adjacent segments exactly once');
      nextSegment += 1; groupBySegment.set(id, raw.id); return found;
    });
    groups.push({id: raw.id, segmentIds: raw.segmentIds.slice(), frameRange: {startFrame: members[0].frameRange.startFrame, endFrame: members.at(-1).frameRange.endFrame}});
  }
  if (nextSegment !== rows.length) fail('compositionGroups must include every segment exactly once');
  for (const item of rows) if (item.segment.compositionGroupId !== groupBySegment.get(item.id)) fail(`${item.id}.compositionGroupId must match its one containing compositionGroup`);

  const edgeRows = [];
  if (!Array.isArray(blueprint.transitionEdges)) fail('transitionEdges must be an array (use [] when no transitions are needed)');
  const edgeIds = new Set();
  for (const [index, raw] of blueprint.transitionEdges.entries()) {
    obj(raw, `transitionEdges[${index}]`);
    keys(raw, new Set(['id', 'fromSegmentId', 'toSegmentId', 'sourceCatalogId', 'styleKey', 'phaseId', 'eventId', 'eventScenePath', 'eventSceneSha256']), `transitionEdges[${index}]`);
    stableId(raw.id, `transitionEdges[${index}].id`); if (edgeIds.has(raw.id)) fail(`duplicate transition edge id ${raw.id}`); edgeIds.add(raw.id);
    const from = rows.find((item) => item.id === raw.fromSegmentId), to = rows.find((item) => item.id === raw.toSegmentId);
    if (!from || !to || rows.indexOf(to) !== rows.indexOf(from) + 1) fail(`${raw.id} must connect adjacent existing segments`);
    if (from.frameRange.endFrame !== to.frameRange.startFrame) fail(`${raw.id} endpoints must meet at one exact cut; exact full-scene clips have no implicit handles`);
    if (groupBySegment.get(from.id) !== groupBySegment.get(to.id)) fail(`${raw.id} requires both segments in the same Remotion compositionGroup`);
    const entry = getEntry(catalog, raw.sourceCatalogId);
    if (entry.id !== 'video-shotcraft-flash-cut' || entry.transitionMechanism !== 'cover-cut-overlay' && entry.fixedMechanism?.includes('cover-cut overlay') !== true) fail(`${raw.id} catalog does not record the source cover-cut mechanism`);
    if (raw.styleKey !== 'flash-cut') fail(`${raw.id}.styleKey must be the verified flash-cut style`);
    if (!raw.phaseId) fail(`${raw.id}.phaseId is required so the covered cut is visible to the canonical event clock`);
    const startFrame = from.frameRange.endFrame - 5, durationInFrames = 10, peakFrame = startFrame + 4;
    if (startFrame < 0 || peakFrame !== from.frameRange.endFrame - 1) fail(`${raw.id} must preserve source FlashCut 10f window at cut−5 and local 4f peak (cut−1)`);
    if (raw.eventId != null) stableId(raw.eventId, `${raw.id}.eventId`);
    if ((raw.eventScenePath == null) !== (raw.eventSceneSha256 == null)) fail(`${raw.id}.eventScenePath/eventSceneSha256 must be supplied together`);
    if (raw.eventScenePath != null && (raw.eventScenePath !== blueprint.audioEventScenePath || raw.eventSceneSha256 !== blueprint.audioEventSceneSha256)) fail(`${raw.id} transition event scene must be the same canonical film-global event scene; do not duplicate/re-clock it`);
    edgeRows.push({id: raw.id, fromSegmentId: from.id, toSegmentId: to.id, fromFrame: from.frameRange.endFrame, toFrame: to.frameRange.startFrame, sourceCatalogId: entry.id, styleKey: raw.styleKey, phaseId: raw.phaseId, eventId: raw.eventId || null, eventScenePath: raw.eventScenePath || null, eventSceneSha256: raw.eventSceneSha256 || null, startFrame, durationInFrames, peakFrame, transitionMechanism: 'cover-cut-overlay'});
  }
  const transitionSchedule = {
    width:1920, height:1080, fps:30, totalFrameCount,
    segments:rows.map((row, index) => {
      const incomingHalfWindowFrames = row.incomingTransition?.windowFrames / 2 || 0;
      const outgoingHalfWindowFrames = rows[index + 1]?.incomingTransition?.windowFrames / 2 || 0;
      if (incomingHalfWindowFrames + outgoingHalfWindowFrames > row.frameCount) fail(`${row.id} body is too short for adjacent boundary transition windows`);
      return {
        ...row,
        headHandleFrames:0,
        tailHandleFrames:0,
        incomingHalfWindowFrames,
        outgoingHalfWindowFrames,
        sourceFrameCount:row.frameCount,
        sourceLocalBodyRange:{startFrame:0, endFrame:row.frameCount},
        transitionWindowFrameRange:row.incomingTransition ? {
          startFrame:row.frameRange.startFrame - incomingHalfWindowFrames,
          endFrame:row.frameRange.startFrame + incomingHalfWindowFrames,
        } : null,
      };
    }),
  };
  const nativeFullFrameRenderers = new Set(['laohu-native-om-template', 'native-html-canvas-template']);
  for (let index = 1; index < rows.length; index += 1) {
    const current = rows[index], input = current.incomingTransition;
    if (!input) continue;
    if (input.mode !== 'boundary-frame') fail(`${current.id}.incomingTransition in Film /2 requires mode boundary-frame; this route has no source handles`);
    const previous = rows[index - 1];
    const previousRenderer = previous.baseSource?.renderer || previous.segment.renderer;
    const currentRenderer = current.baseSource?.renderer || current.segment.renderer;
    if (!nativeFullFrameRenderers.has(previousRenderer) && !nativeFullFrameRenderers.has(currentRenderer)) {
      fail(`${current.id}.incomingTransition boundary-frame requires at least one complete native OM or full-frame HTML source segment`);
    }
    const sameCutFlash = edgeRows.find((edge) => edge.fromSegmentId === previous.id && edge.toSegmentId === current.id);
    if (sameCutFlash) fail(`${current.id}.incomingTransition and ${sameCutFlash.id} cannot both own the same cut`);
    const range = transitionSchedule.segments[index].transitionWindowFrameRange;
    const overlap = (left, right) => left.startFrame < right.endFrame && right.startFrame < left.endFrame;
    const conflictingFlash = edgeRows.find((edge) => overlap(range, {startFrame:edge.startFrame, endFrame:edge.startFrame + edge.durationInFrames}));
    if (conflictingFlash) fail(`${current.id}.incomingTransition overlaps FlashCut ${conflictingFlash.id}; choose one transition owner for the shared output frames`);
    const conflictingBoundary = rows.slice(1).find((candidate) => candidate.id !== current.id && candidate.incomingTransition
      && overlap(range, transitionSchedule.segments[rows.indexOf(candidate)].transitionWindowFrameRange));
    if (conflictingBoundary) fail(`${current.id}.incomingTransition overlaps boundary transition ${conflictingBoundary.id}`);
  }
  const transitionPlan = resolveFilmTransitions(transitionSchedule, catalog);
  return {blueprint, blueprintPath, clock, rows:transitionSchedule.segments, transitionSchedule, groups, transitionEdges:edgeRows, transitionPlan, width:1920, height:1080, fps:30, totalFrameCount, durationSec:totalFrameCount / 30};
}

async function childEnv(tmpDir, cacheDir) {
  await fs.mkdir(tmpDir, {recursive: true}); await fs.mkdir(cacheDir, {recursive: true});
  return {...process.env, TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, 'npm-cache'), REMOTION_CACHE_DIR: path.join(cacheDir, 'remotion')};
}

async function ensureRuntime(jobRoot, workRootValue = process.env.WORK_ROOT || repoRoot, runtimeRootValue) {
  const lockBytes = await fs.readFile(runtimeLock), manifestBytes = await fs.readFile(runtimeManifest);
  const lockHash = sha256(lockBytes), runtimeHash = sha256(Buffer.concat([manifestBytes, lockBytes]));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const expectedVersions = manifest.dependencies || {};
  const workRoot = path.resolve(workRootValue);
  const runtimeRoot = path.resolve(runtimeRootValue || process.env.MOTION_RUNTIME_ROOT || managedMotionRuntimeRoot({skillRoot:skillDir,workRoot}));
  const resolved = resolveMotionRuntime({
    packages: Object.keys(expectedVersions),
    expectedVersions,
    projectRoot: repoRoot,
    skillRoot: skillDir,
    workRoot,
    runtimeRoot,
  });
  const remotionPackages = resolved.packages.filter((row) => row.name === 'remotion' || row.name.startsWith('@remotion/'));
  if (remotionPackages.some((row) => row.version !== '4.0.537')) fail(`Canonical Motion runtime must keep every Remotion package at 4.0.537: ${JSON.stringify(remotionPackages)}`);
  const cachedLockPath = path.join(resolved.runtimeRoot, 'package-lock.json');
  const cachedLock = await fs.readFile(cachedLockPath, 'utf8').catch(() => null);
  if (!cachedLock || sha256(Buffer.from(cachedLock)) !== lockHash) fail(`Project-local Remotion runtime lock does not match the canonical Skill lock at ${resolved.runtimeRoot}`);
  void jobRoot;
  return {runtimeRoot: resolved.runtimeRoot, nodeModules: resolved.nodeModules, nodeModulesPath: resolved.nodeModulesPath, resolutionSource: resolved.resolutionSource, packages: resolved.packages, runtimeHash, lockHash, manifestSha256: sha256(manifestBytes)};
}

async function bundleRuntime(runtime, publicRoot, bundleRoot, {entryPoint = path.join(adapterDir, 'video-shotcraft-entry.tsx'), moduleAliases = {}} = {}) {
  await fs.mkdir(bundleRoot, {recursive: true});
  const packagePath = path.join(runtime.runtimeRoot, 'package.json');
  const require = createRequire(packagePath);
  const {bundle} = require('@remotion/bundler');
  const outDir = path.join(bundleRoot, 'bundle');
  const serveUrl = await bundle({
    entryPoint, outDir, publicDir: publicRoot, rootDir: skillDir, enableCaching: false,
    webpackOverride: (config) => {
      config.resolve ||= {};
      config.resolve.modules = [...(config.resolve.modules || []), runtime.nodeModules];
      config.resolve.alias = {...(config.resolve.alias || {}), ...moduleAliases, react: require.resolve('react'), 'react-dom': require.resolve('react-dom')};
      return config;
    },
  });
  return {serveUrl, bundleDir: outDir};
}

async function renderRemotion({runtime, spec, frame = null, outputPath, browser, workRoot, browserCacheRoot = repoRoot, compositionId = 'Shotcraft', entryPoint, moduleAliases}) {
  const require = createRequire(path.join(runtime.runtimeRoot, 'package.json'));
  const {renderMedia, renderStill, selectComposition} = require('@remotion/renderer');
  const fontLoadEvents = new Map();
  const fontLoadEventErrors = [];
  const onBrowserLog = (log) => {
    const prefix = 'LAOHU_MOTION_FONT_LOAD/1 ';
    if (typeof log?.text !== 'string' || !log.text.startsWith(prefix)) return;
    try {
      const event = JSON.parse(log.text.slice(prefix.length));
      if (event.format !== 'laohu.motion.font-load-event/1' || event.producer !== '@laohu/motion/core/fonts.useFonts'
          || typeof event.family !== 'string' || !event.family.trim()
          || typeof event.file !== 'string' || !event.file.trim()
          || typeof event.weight !== 'string' || !event.weight.trim()
          || !Array.isArray(event.weightChecks) || event.weightChecks.length === 0
          || event.weightChecks.some((check) => !check || typeof check.weight !== 'string' || !check.weight.trim() || check.readyCheck !== true)
          || typeof event.style !== 'string' || !event.style.trim()
          || event.status !== 'loaded' || event.readyCheck !== true) {
        throw new Error('font-load event does not satisfy the real useFonts loaded/check contract');
      }
      const key = JSON.stringify([event.family, event.file, event.weight, event.style]);
      const prior = fontLoadEvents.get(key);
      const stackTrace = Array.isArray(log.stackTrace) ? log.stackTrace.map(({url, lineNumber}) => ({url, lineNumber})) : [];
      fontLoadEvents.set(key, {
        format: event.format, producer: event.producer, family: event.family, file: event.file,
        weight: event.weight, weightChecks: event.weightChecks, style: event.style, status: event.status, readyCheck: event.readyCheck,
        observations: ['Remotion browser callback'],
        stackTrace: stackTrace.length ? stackTrace : (prior?.stackTrace || []),
      });
    } catch (error) {
      fontLoadEventErrors.push(error.message || String(error));
    }
  };
  const publicRoot = path.join(workRoot, 'public');
  await fs.mkdir(publicRoot, {recursive: true});
  const env = await childEnv(path.join(workRoot, 'tmp'), path.join(workRoot, 'cache'));
  const envKeys = ['TMPDIR','TMP','TEMP','XDG_CACHE_HOME','npm_config_cache','REMOTION_CACHE_DIR'];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of envKeys) process.env[key] = env[key];
    const selectedBrowser = browser
      ? {path:path.resolve(browser), downloaded:false, cacheRoot:null}
      : await ensureManagedMotionBrowser({workRoot:browserCacheRoot,runtimeRoot:runtime.runtimeRoot});
    await assertSameVolume([path.resolve(browserCacheRoot),runtime.runtimeRoot,workRoot,...(selectedBrowser.cacheRoot ? [selectedBrowser.path] : [])]);
    const bundled = await bundleRuntime(runtime, publicRoot, workRoot, {entryPoint, moduleAliases});
    const inputProps = {runtimeSpec: spec};
    const composition = await selectComposition({serveUrl: bundled.serveUrl, id: compositionId, inputProps, browserExecutable: selectedBrowser.path, logLevel: 'error', onBrowserLog});
    if (frame != null) {
      await renderStill({serveUrl: bundled.serveUrl, composition, inputProps, frame, output: outputPath, imageFormat: 'png', browserExecutable: selectedBrowser.path, logLevel: 'error', overwrite: false});
    } else {
      await renderMedia({serveUrl: bundled.serveUrl, composition, inputProps, outputLocation: outputPath, codec: 'h264', audioCodec: null, muted: true, enforceAudioTrack: false, crf: 17, pixelFormat: 'yuv420p', browserExecutable: selectedBrowser.path, logLevel: 'error', overwrite: false, onBrowserLog});
    }
    if (fontLoadEventErrors.length) fail('Remotion emitted an invalid font-load event: ' + fontLoadEventErrors.join('; '));
    return {composition: {id: composition.id, width: composition.width, height: composition.height, fps: composition.fps, durationInFrames: composition.durationInFrames}, bundleDir: bundled.bundleDir, browser:selectedBrowser, fontLoads:[...fontLoadEvents.values()]};
  } finally {
    for (const key of envKeys) {
      if (previous[key] == null) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
}

function readStyleCodeBlock(text, styleId) {
  const match = /^```(?:js|javascript)\s*\n([\s\S]*?)\n```\s*$/m.exec(text);
  if (!match) fail(`${styleId} has no JavaScript source fence`);
  if (!new RegExp(`\\bS\\.${styleId}\\s*=`).test(match[1])) fail(`${styleId} source fence does not define its registered Canvas function`);
  return match[1];
}

async function loadCallableStyle(styleId) {
  if (typeof styleId !== 'string' || !/^[A-G]\d+$/.test(styleId)) fail('direct Canvas style rendering supports only the pinned A–G code samples');
  const index = JSON.parse(await fs.readFile(compatibilityStyleIndexPath, 'utf8'));
  const library = JSON.parse(await fs.readFile(catalogPath, 'utf8')).styleLibrary;
  if (index.format !== 'laohu.motion.style-library/1'
      || index.coverage?.styleCount !== library?.compatibilityStyleCount
      || index.coverage?.previewCount !== library?.compatibilityPreviewCount
      || index.entries?.length !== library?.compatibilityStyleCount
      || index.source?.repository !== library?.compatibilitySourceRepository
      || index.source?.commit !== library?.compatibilitySourceCommit) fail('the local legacy compatibility style index or preview coverage is stale');
  const row = index.entries.find((entry) => entry.id === styleId);
  if (!row) fail(`unknown legacy compatibility style ${styleId}`);
  if (row.category !== 'A-G_代码样片' || row.route?.kind !== 'remotion-canvas-function' || row.route?.callable !== true) fail(`${styleId} has a complete production prompt but no direct Canvas function route`);
  const contentPath = path.resolve(styleRoot, row.contentPath);
  if (!isWithin(styleRoot, contentPath)) fail(`${styleId} content path escaped the style library`);
  const content = await fs.readFile(contentPath);
  const contentHash = sha256(content);
  if (contentHash !== row.localSha256 || contentHash !== row.sourceSha256) fail(`${styleId} fulltext is not byte-identical to its pinned source`);
  const helperRow = index.sharedSources?.find((entry) => entry.localPath === 'code/_公共函数.js');
  if (!helperRow) fail('A–G shared Canvas helper has no source/local hash mapping');
  const helperPin=STYLE_CONTENT_ADAPTER_MANIFEST.sharedHelper;
  if (helperRow.sourcePath!==helperPin.sourcePath || helperRow.sourceSha256!==helperPin.sourceSha256
      || helperRow.localPath!==helperPin.localPath || helperRow.localSha256!==helperPin.sourceSha256) fail('A–G shared Canvas helper differs from the source-preserving adapter pin');
  const helperPath = path.resolve(styleRoot, helperRow.localPath);
  if (!isWithin(styleRoot, helperPath)) fail('A–G helper path escaped the style library');
  const helperBytes = await fs.readFile(helperPath);
  const helper = helperBytes.toString('utf8');
  if (sha256(helperBytes) !== helperRow.localSha256 || helperRow.localSha256 !== helperRow.sourceSha256) fail('A–G shared Canvas helper differs from its pinned source');
  const sourceText = content.toString('utf8').replace(/^\uFEFF/, '');
  const code = readStyleCodeBlock(sourceText, styleId);
  return {row, contentHash, helperRow, helperHash: sha256(helperBytes), code, helper};
}

/** Prepare the exact CanvasCodeStyle props for a Remotion Film layer consumer.
 * This carries the pinned source fence/helper and any verified literal-only patch;
 * it does not compile or inject caller-authored JavaScript.
 */
export async function prepareStyleCodeSpec({styleId, parentText, content, contentSource} = {}) {
  if (parentText !== undefined && typeof parentText !== 'string') fail('style Canvas --text material must be a string');
  const hasParentText = typeof parentText === 'string' && Boolean(parentText.trim());
  const {row, contentHash, helperRow, helperHash, code:sourceCode, helper} = await loadCallableStyle(styleId);
  const adapted = adaptStyleCodeContent({styleId,sourceCode,sourceSha256:row.sourceSha256,content,parentTextProvided:hasParentText});
  if (adapted.usesParentText && !hasParentText) fail(`${styleId} Canvas source consumes PARENT and requires nonempty --text material`);
  const contentSourceInput = validateContentSource(contentSource, content !== undefined);
  const sourceCodeHash = sha256(Buffer.from(sourceCode));
  const executedCodeHash = sha256(Buffer.from(adapted.code));
  const contentBinding = {
    status: adapted.contentBindingStatus,
    demoMode: adapted.demoMode,
    consumedFields: adapted.consumedFields,
    ignoredFields: adapted.ignoredFields,
    ...(contentSourceInput ? {contentSource:contentSourceInput} : {}),
    ...(adapted.contentSha256 ? {contentSha256:adapted.contentSha256} : {}),
  };
  return {
    spec:{styleId,code:adapted.code,helper,width:1920,height:1080,parentText:hasParentText ? parentText : '',serif:'"Noto Serif SC", "Songti SC", "SimSun", serif',...(adapted.content?{content:adapted.content}:{})},
    style:{id:styleId,name:row.name,category:row.category,licenseId:row.licenseId,sourcePath:row.sourcePath,sourceSha256:row.sourceSha256,localPath:row.contentPath,localSha256:contentHash,previewPath:row.previewPath,previewSha256:row.previewLocalSha256},
    sourceCode:{kind:adapted.adaptation ? 'source-preserving-literal-adaptation' : 'exact-prompt-fence',drawFunction:`S.${styleId}`,sourceCodeHash,executedCodeHash,helperSourcePath:helperRow.sourcePath,helperSourceSha256:helperRow.sourceSha256,helperLocalSha256:helperHash,rewritten:Boolean(adapted.adaptation),...(adapted.adaptation ? {derivedPatch:adapted.adaptation} : {})},
    contentBinding,
    ...(adapted.content ? {content:adapted.content} : {}),
    ...(adapted.contentSha256 ? {contentSha256:adapted.contentSha256} : {}),
    ...(contentSourceInput ? {contentSource:contentSourceInput} : {}),
    input:{...(parentText !== undefined ? {text:parentText} : {}),...(adapted.content ? {content:adapted.content} : {})},
  };
}

export async function renderStyleCode({styleId, parentText, content, contentSource, outputPath, outputKind, timeSec = 1, durationInFrames = 90, workRoot = process.env.WORK_ROOT || repoRoot, runtimeRoot, cacheDir, browser, manifestPath} = {}) {
  if (outputKind !== 'still' && outputKind !== 'render') fail('style Canvas output kind must be still or render');
  if (typeof outputPath !== 'string' || !path.isAbsolute(outputPath)) fail('style Canvas output path must be absolute');
  if (outputKind === 'still' && path.extname(outputPath).toLowerCase() !== '.png') fail('style Canvas still output must be a .png');
  if (outputKind === 'render' && path.extname(outputPath).toLowerCase() !== '.mp4') fail('style Canvas video output must be an .mp4');
  if (!Number.isSafeInteger(durationInFrames) || durationInFrames < 1 || durationInFrames > 1800) fail('style Canvas duration must be 1–1800 frames');
  if (content !== undefined) {
    const minimumFrames = styleId === 'F1' ? 255 : styleId === 'F2' ? 300 : Infinity;
    if (durationInFrames < minimumFrames) fail(`${styleId} structured content render must retain at least its ${minimumFrames}-frame source clock`);
  }
  const contentSourceInput = validateContentSource(contentSource, content !== undefined);
  if (contentSourceInput) {
    if (!path.isAbsolute(contentSourceInput.path)) fail('style Canvas contentSource.path must be absolute for direct rendering');
    const sourceStat = await fs.lstat(contentSourceInput.path).catch((error) => fail(`style Canvas contentSource is missing: ${error.message}`));
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) fail('style Canvas contentSource must be a regular non-symlink JSON file');
    const sourceBytes = await fs.readFile(contentSourceInput.path);
    if (sha256(sourceBytes) !== contentSourceInput.sha256) fail('style Canvas contentSource.sha256 does not match the input bytes');
    let sourceContent;
    try { sourceContent = JSON.parse(sourceBytes.toString('utf8')); }
    catch (error) { fail(`style Canvas contentSource must contain JSON: ${error.message}`); }
    if (canonical(sourceContent) !== canonical(content)) fail('style Canvas contentSource JSON differs from the supplied structured content');
  }
  const fps = 30;
  const frame = outputKind === 'still' ? Math.round(finite(timeSec, 'style preview time', {min:0}) * fps) : null;
  if (frame != null && frame >= durationInFrames) fail('style preview time must resolve inside the requested frame duration');
  const prepared = await prepareStyleCodeSpec({styleId,parentText,content,contentSource});
  const resolvedWorkRoot = path.resolve(workRoot);
  const resolvedCacheDir = path.resolve(cacheDir || path.join(resolvedWorkRoot, '.cache', 'tmp', 'laohu-motion', 'style-render'));
  if (!isWithin(path.join(resolvedWorkRoot, '.cache'), resolvedCacheDir)) fail('style Canvas cache must stay under the selected workRoot .cache');
  const jobRoot = path.join(resolvedCacheDir, `${styleId}-${Date.now()}-${process.pid}`);
  await fs.mkdir(jobRoot, {recursive:true});
  await fs.mkdir(path.dirname(outputPath), {recursive:true});
  await assertFreshOutput(outputPath);
  if (manifestPath) { await fs.mkdir(path.dirname(manifestPath), {recursive:true}); await assertFreshOutput(manifestPath); }
  const runtime = await ensureRuntime(jobRoot, resolvedWorkRoot, runtimeRoot);
  await assertSameVolume([resolvedWorkRoot, jobRoot, runtime.runtimeRoot, outputPath, ...(manifestPath ? [manifestPath] : [])]);
  const spec = {...prepared.spec,durationInFrames};
  const rendered = await renderRemotion({runtime, spec, frame, outputPath, browser, workRoot:jobRoot, browserCacheRoot:resolvedWorkRoot, compositionId:'StyleCode'});
  const output = await shaFile(outputPath);
  const evidence = {
    kind:'341-style-canvas-render-evidence',
    status:'rendered',
    style:prepared.style,
    sourceCode:prepared.sourceCode,
    contentBinding:prepared.contentBinding,
    input:{...prepared.input,...(prepared.contentSource ? {contentSource:prepared.contentSource} : {}),...(prepared.contentSha256 ? {contentSha256:prepared.contentSha256} : {}),width:1920,height:1080,fps,durationInFrames,frame},
    runtime:{version:'4.0.537',nodeModulesPath:runtime.nodeModulesPath,runtimeHash:runtime.runtimeHash,lockHash:runtime.lockHash,composition:rendered.composition},
    output:{path:outputPath,...output,mediaType:path.extname(outputPath).toLowerCase()},
    limitations:['This proves the pinned Canvas function executed and produced media. It does not establish audience comprehension, visual fidelity to the prompt, or aesthetic quality.'],
  };
  if (manifestPath) await fs.writeFile(manifestPath, `${JSON.stringify(evidence,null,2)}\n`, {flag:'wx'});
  return {outputPath,manifestPath:manifestPath||null,output,evidence};
}

async function assertFreshOutput(file) { const stat = await fs.lstat(file).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error)); if (stat?.isSymbolicLink()) fail(`output cannot be symlink: ${file}`); if (stat) fail(`output already exists: ${file}`); }
async function shaFile(file) { const bytes = await fs.readFile(file); return {sha256: sha256(bytes), bytes: bytes.length}; }
async function probeSourceVideo(file, ffmpeg = 'ffmpeg') {
  const ffprobe = path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') : 'ffprobe';
  const result = await new Promise((resolve, reject) => {
    const child = spawn(ffprobe, ['-v','error','-count_frames','-show_streams','-show_format','-of','json',file], {stdio:'pipe'});
    let out='', err=''; child.stdout.on('data',(bytes)=>out+=bytes); child.stderr.on('data',(bytes)=>err+=bytes);
    child.on('error',reject); child.on('close',(code)=>code===0?resolve(out):reject(new Error(`ffprobe source video failed: ${err}`)));
  });
  const data = JSON.parse(result), videos = data.streams.filter((row) => row.codec_type === 'video');
  if (videos.length !== 1) fail('ClipCard input must contain exactly one video stream');
  const video = videos[0];
  const fraction = (value) => { const [num, den] = String(value || '').split('/').map(Number); return den ? num / den : Number.NaN; };
  const fps = fraction(video.avg_frame_rate), nominalFps = fraction(video.r_frame_rate);
  const frameCount = Number(video.nb_read_frames ?? video.nb_frames);
  if (!Number.isFinite(fps) || !Number.isSafeInteger(frameCount) || frameCount < 1) fail('ClipCard input requires a readable frame count and frame rate');
  if (!closeTo(fps, nominalFps, 1e-6)) fail('ClipCard variable-frame-rate media is unsupported because frame-index alignment would be ambiguous');
  return {fps, frameCount, durationSec:Number(data.format.duration), audioStreamCount:data.streams.filter((row)=>row.codec_type==='audio').length};
}
async function ffprobeVideo(file, ffmpeg = 'ffmpeg') {
  const ffprobe = path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') : 'ffprobe';
  const result = await new Promise((resolve, reject) => { const child = spawn(ffprobe, ['-v','error','-count_frames','-show_streams','-show_format','-of','json',file], {stdio:'pipe'}); let out=''; let err=''; child.stdout.on('data',(b)=>out+=b); child.stderr.on('data',(b)=>err+=b); child.on('error',reject); child.on('close',(code)=>code===0?resolve(out):reject(new Error(`ffprobe failed: ${err}`))); });
  const data = JSON.parse(result); const videos = data.streams.filter((row) => row.codec_type === 'video'); const audios = data.streams.filter((row) => row.codec_type === 'audio');
  if (videos.length !== 1 || audios.length) fail('Shotcraft output must contain one video stream and no audio stream (audio-plan remains the one mixer)');
  const video = videos[0]; const [num, den] = String(video.avg_frame_rate || '').split('/').map(Number); const fps = den ? num / den : NaN;
  const frameCount = Number(video.nb_read_frames ?? video.nb_frames);
  return {codec: video.codec_name, pixelFormat:video.pix_fmt, width: video.width, height: video.height, fps, frameCount, durationSec: Number(data.format.duration), audioStreams: audios.length};
}

export async function prepareShotcraftInput({catalog, entry, inputPath, outputPath, assetsRoot}) {
  entry = resolveCatalogEntry(catalog, entry);
  const raw = await fs.readFile(inputPath); const input = JSON.parse(raw.toString('utf8'));
  const publicRoot = path.join(path.dirname(outputPath), `${path.basename(outputPath)}.public`);
  const assetRecords = [];
  const spec = await validateShotcraftSpec(catalog, entry, input, {assetsRoot: path.resolve(assetsRoot || path.dirname(inputPath)), publicRoot, assetRecords});
  const source = await verifySourceAndEntry(catalog, entry);
  for (const layer of spec.layers) await verifySourceAndEntry(catalog, getEntry(catalog, layer.catalogId));
  const specBytes = Buffer.from(JSON.stringify(spec, null, 2) + '\n');
  await assertFreshOutput(outputPath); await assertFreshOutput(`${outputPath}.assets.json`); await fs.mkdir(path.dirname(outputPath), {recursive: true}); await fs.writeFile(outputPath, specBytes, {flag: 'wx'});
  const receipt = {format: 'laohu.video-shotcraft-prepared-input/1', templateId: entry.id, sourceId:source.sourceId, sourceCommit:source.sourceCommit, componentPath: entry.component.path, componentSha256: entry.component.sha256, componentLocalSha256:source.componentLocalSha256, specSha256: sha256(specBytes), assets: assetRecords.map(({sourcePath, ...asset}) => asset)};
  await fs.writeFile(`${outputPath}.assets.json`, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  return {outputPath, receiptPath: `${outputPath}.assets.json`, receipt};
}

export async function renderShotcraftTemplate({catalog, entry, specPath, outputPath, outputKind, timeSec, assetsRoot, cacheDir, workRoot, runtimeRoot, browser, ffmpeg, manifestPath}) {
  entry = resolveCatalogEntry(catalog, entry);
  const specBytes = await fs.readFile(specPath); const raw = JSON.parse(specBytes.toString('utf8'));
  if (outputKind === 'still' && path.extname(outputPath).toLowerCase() !== '.png') fail('Shotcraft still output must be a .png');
  if (outputKind !== 'still' && path.extname(outputPath).toLowerCase() !== '.mp4') fail('Shotcraft video output must be an .mp4');
  const resolvedAssetsRoot = path.resolve(assetsRoot || path.dirname(specPath));
  const jobRoot = path.resolve(cacheDir || path.join(repoRoot, '.cache/tmp/template-render', `render-${entry.productionId || entry.id}-${process.pid}-${Date.now()}`));
  await fs.mkdir(jobRoot, {recursive: true});
  const publicRoot = path.join(jobRoot, 'public'); await fs.mkdir(publicRoot, {recursive: true});
  const assetRecords = [];
  const spec = await validateShotcraftSpec(catalog, entry, raw, {assetsRoot: resolvedAssetsRoot, publicRoot, assetRecords});
  assetRecords.length = 0;
  const runtimeSpec = deepClone(spec);
  await stageLocalAssets(runtimeSpec.layers, resolvedAssetsRoot, publicRoot, assetRecords, ffmpeg);
  const source = await verifySourceAndEntry(catalog, entry);
  for (const layer of spec.layers) await verifySourceAndEntry(catalog, getEntry(catalog, layer.catalogId));
  await assertFreshOutput(outputPath); await fs.mkdir(path.dirname(outputPath), {recursive: true});
  const resolvedWorkRoot = path.resolve(workRoot || process.env.WORK_ROOT || repoRoot);
  const runtime = await ensureRuntime(jobRoot, resolvedWorkRoot, runtimeRoot);
  const receiptPath = manifestPath ? path.resolve(manifestPath) : `${outputPath}.manifest.json`;
  await fs.mkdir(path.dirname(receiptPath), {recursive:true}); await assertFreshOutput(receiptPath);
  await assertSameVolume([path.dirname(specPath), path.dirname(outputPath), path.dirname(receiptPath), resolvedAssetsRoot, jobRoot, runtime.runtimeRoot, localRuntimeRoot]);
  const frame = outputKind === 'still' ? finite(timeSec ?? raw.timeSec ?? 0, 'timeSec', {min: 0}) * spec.fps : null;
  if (frame != null && (!Number.isInteger(Math.round(frame)) || Math.round(frame) < 0 || Math.round(frame) >= spec.durationInFrames)) fail('preview time must resolve to a valid source frame');
  const rendered = await renderRemotion({runtime, spec: {...runtimeSpec, kind: 'single'}, frame: frame == null ? null : Math.round(frame), outputPath, browser, workRoot: jobRoot, browserCacheRoot:resolvedWorkRoot});
  const probe = outputKind === 'still' ? null : await ffprobeVideo(outputPath, ffmpeg);
  if (probe && (probe.frameCount !== spec.durationInFrames || probe.width !== spec.width || probe.height !== spec.height || !closeTo(probe.fps, spec.fps, 1e-6))) fail('Shotcraft clip probe differs from the declared frame clock/format');
  const output = await shaFile(outputPath);
  const manifest = {format: 'laohu.video-shotcraft-render-manifest/1', templateId: entry.id, source, fidelityMode: spec.fidelityMode, propsConsumed: spec.layers.map(consumedLayerRecord), componentSources:await Promise.all(spec.layers.map(async(layer)=>({catalogId:layer.catalogId,...await verifySourceAndEntry(catalog,getEntry(catalog,layer.catalogId))}))), assets: assetRecords.map(({sourcePath, ...row}) => row), runtime: {version: '4.0.537', packageLockSha256: runtime.lockHash, nodeModulesPath: runtime.nodeModulesPath, resolutionSource:runtime.resolutionSource, packages: runtime.packages, bundleDir: path.relative(jobRoot, rendered.bundleDir)}, render: {width: spec.width, height: spec.height, fps: spec.fps, durationInFrames: spec.durationInFrames, probe}, output: {path: outputPath, ...output}, workRoot: jobRoot};
  await fs.writeFile(receiptPath, JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
  return {outputPath, manifestPath: receiptPath, manifest, frameCount: spec.durationInFrames};
}

async function stageLocalAssets(layers, assetsRoot, publicRoot, records, ffmpeg) {
  const stageClipCard = async (props) => {
    const sourcePath = path.resolve(assetsRoot, props.src);
    const bytes = await fs.readFile(sourcePath);
    const digest = sha256(bytes), extension = path.extname(sourcePath).toLowerCase();
    const staged = `clip-card/${digest.slice(0,16)}${extension}`;
    const target = path.join(publicRoot, staged);
    await fs.mkdir(path.dirname(target), {recursive:true});
    await fs.copyFile(sourcePath, target, fsConstants.COPYFILE_EXCL).catch((error) => { if(error.code!=='EEXIST') throw error; });
    const probe = await probeSourceVideo(sourcePath, ffmpeg);
    if (!closeTo(probe.fps, 30, 1e-6)) fail('ClipCard source media must be 30 fps so source startFrom/loop frame inputs stay on the Remotion composition clock');
    const startFrom = props.startFrom || 0;
    if (props.loopDurationInFrames != null) {
      if (startFrom + props.loopDurationInFrames > probe.frameCount) fail('explicit ClipCard loopDurationInFrames exceeds the verified local video frame range; no implicit wrap or hold is added');
    } else if (startFrom + props.durationInFrames > probe.frameCount) fail(`ClipCard needs ${props.durationInFrames} source frames from startFrom=${startFrom}, but the local video has ${probe.frameCount}; no implicit hold or loop is added`);
    props.src = staged;
    records.push({role:'clip-card-video', path:path.relative(assetsRoot, sourcePath), stagedPath:staged, sha256:digest, bytes:bytes.length, source:'caller-provided local asset', declaredFps:probe.fps, sourceFrameCount:probe.frameCount, durationSec:probe.durationSec, audioStreamIgnored:true, assetLicense:props.assetLicense});
  };
  for (const layer of layers) {
    if(layer.catalogId==='laohu-media-photo-montage'){
      for(const [index,slot] of layer.props.slots.entries()){
        const asset=await readLocalPng(slot.file,slot.assetLicense,assetsRoot,`slots[${index}]`);
        const staged=`laohu-media-photo-montage/${asset.sha256}.png`,target=path.join(publicRoot,staged);
        await fs.mkdir(path.dirname(target),{recursive:true});
        await fs.copyFile(asset.path,target,fsConstants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error;});
        records.push({role:`photo-montage-${slot.id}`,path:slot.file,stagedPath:staged,sha256:asset.sha256,bytes:asset.bytes.length,width:asset.width,height:asset.height,source:'caller-provided local asset',assetLicense:slot.assetLicense});
        slot.file=staged;
      }
      continue;
    }
    if (layer.catalogId === 'video-shotcraft-list-stack-five') {
      const stagePng = async (src, license, role) => {
        const asset = await readLocalPng(src, license, assetsRoot, role);
        const staged = `laohu-list-stack-five/${asset.sha256}.png`;
        const target = path.join(publicRoot, staged);
        await fs.mkdir(path.dirname(target), {recursive:true});
        await fs.copyFile(asset.path, target, fsConstants.COPYFILE_EXCL).catch((error) => { if (error.code !== 'EEXIST') throw error; });
        records.push({role, path:src, stagedPath:staged, sha256:asset.sha256, bytes:asset.bytes.length, width:asset.width, height:asset.height, source:'caller-provided local asset', assetLicense:license});
        return staged;
      };
      const p = layer.props;
      p.pageImage = await stagePng(p.pageImage, p.pageImageLicense, 'page-background-image');
      for (const [index, card] of p.cards.entries()) card.src = await stagePng(card.src, card.assetLicense, `card-image-${index + 1}`);
      continue;
    }
    if (layer.catalogId === 'video-shotcraft-clip-card') {
      await stageClipCard(layer.props);
      continue;
    }
    if (layer.catalogId === 'video-shotcraft-speed-blur' && layer.props.content?.catalogId === 'video-shotcraft-clip-card') {
      await stageClipCard(layer.props.content.props);
    }
  }
}

async function stageFilmAssets(schedule, jobRoot, ffmpeg) {
  const records = [];
  for (const item of schedule.rows) {
    const assetRows=[];
    const root=path.join(jobRoot,'public');
    await stageLocalAssets(item.layers, path.dirname(schedule.blueprintPath), root, assetRows, ffmpeg);
    for(const record of assetRows) records.push({segmentId:item.id,...record});
  }
  return records;
}

async function renderLocalBaseSegments(schedule, blueprintPath, jobRoot, {browser, ffmpeg, workspaceRoot, runtimeRoot, runtime} = {}) {
  const rendered = new Map();
  const cli = path.join(skillDir, 'scripts/templates.mjs');
  const ffmpegExe = ffmpeg || process.env.MOTION_FFMPEG || 'ffmpeg';
  for (const row of schedule.rows) {
    if (!row.baseSource) continue;
    const localRoot = path.join(jobRoot, 'local-base', row.id);
    const localBlueprintPath = path.join(localRoot, 'film-blueprint.json');
    const localOutput = path.join(localRoot, 'picture-only.mp4');
    const localManifestPath = path.join(localRoot, 'film-manifest.json');
    const localWorkRoot = path.join(localRoot, 'render-work');
    const raw = row.segment;
    if (row.baseSource.renderer === 'laohu-project-shot') {
      if (!runtime) fail(`${row.id} project-shot renderer requires the canonical locked Remotion runtime`);
      const currentProjectShot = await resolveProjectShotModule({
        segment: raw,
        blueprintPath,
        runtimeNodeModules: runtime.nodeModules,
        skillRoot: skillDir,
      });
      if (canonical(projectShotBinding(currentProjectShot)) !== canonical(projectShotBinding(row.baseSource.projectShot))) {
        fail(`${row.id} project shot source/dependency evidence changed after Film /2 validation`);
      }
      await fs.mkdir(localRoot, {recursive:true});
      const stagedAssets = await stageProjectShotAssets(currentProjectShot, path.join(localWorkRoot, 'public'));
      const entry = await createProjectShotEntrypoint({projectShot: currentProjectShot, outputPath: path.join(localRoot, 'generated-entry.tsx')});
      const moduleAliases = projectShotWebpackAliases(currentProjectShot, {runtimeRoot: runtime.runtimeRoot, nodeModules: runtime.nodeModules});
      const render = await renderRemotion({
        runtime,
        spec: {width: row.width, height: row.height, fps: row.fps, durationInFrames: row.frameCount, props: currentProjectShot.props},
        outputPath: localOutput,
        browser,
        workRoot: localWorkRoot,
        browserCacheRoot: workspaceRoot,
        compositionId: 'LaohuProjectShot',
        entryPoint: entry.path,
        moduleAliases,
      });
      const rendererFontLoads = render.fontLoads.map((font) => {
        const asset = stagedAssets.find((row) => row.path === font.file && row.stagedPath === font.file);
        if (!asset) fail(`${row.id} loaded local font ${font.file} is not an exact hash-verified project-shot public asset`);
        return { ...font, sha256: asset.sha256, bytes: asset.bytes };
      });
      const media = await ffprobeVideo(localOutput, ffmpegExe);
      if (media.width !== row.width || media.height !== row.height || !closeTo(media.fps, row.fps, 1e-6)
          || media.frameCount !== row.frameCount || media.audioStreams !== 0 || media.codec !== 'h264') {
        fail(`${row.id} project shot must render picture-only H.264 ${row.width}×${row.height}@${row.fps} with exactly ${row.frameCount} frames`);
      }
      const outputHash = await shaFile(localOutput);
      const receipt = createProjectShotReceipt({
        projectShot: currentProjectShot,
        entry,
        outputPath: localOutput,
        outputHash,
        render,
        rendererFontLoads,
        runtime,
        assets: stagedAssets,
        segmentId: row.id,
      });
      await fs.writeFile(localManifestPath, JSON.stringify(receipt, null, 2) + '\n', {flag:'wx'});
      verifyProjectShotReceipt(JSON.parse(await fs.readFile(localManifestPath, 'utf8')), {
        projectShot: currentProjectShot,
        entry,
        render,
        outputHash,
        segmentId: row.id,
        expectedFrameCount: row.frameCount,
      });
      const stagedPath = `local-base/${outputHash.sha256}.mp4`;
      const stagedFile = path.join(jobRoot, 'public', stagedPath);
      await fs.mkdir(path.dirname(stagedFile), {recursive:true});
      await fs.copyFile(localOutput, stagedFile, fsConstants.COPYFILE_EXCL);
      const stagedHash = await shaFile(stagedFile);
      if (stagedHash.sha256 !== outputHash.sha256) fail(`${row.id} staged project shot changed before Film composition`);
      rendered.set(row.id, {
        src: stagedPath,
        outputPath: localOutput,
        outputSha256: outputHash.sha256,
        receiptPath: localManifestPath,
        receiptSha256: sha256(await fs.readFile(localManifestPath)),
        sourcePath: currentProjectShot.module.path,
        sourceSha256: currentProjectShot.module.sha256,
        rendererFontLoads,
        renderer: row.baseSource.renderer,
        projectShot: projectShotBinding(currentProjectShot),
        generatedEntrySha256: entry.sha256,
        stagedPath,
        stagedSha256: stagedHash.sha256,
        probe: media,
      });
      continue;
    }
    if (row.baseSource.renderer === 'native-html-canvas-template') {
      const localSpecPath = path.join(localRoot, 'native-html-spec.json');
      const localSpec = {
        templateId: row.baseSource.templateId,
        duration: row.localDurationSec,
        fps: 30,
        width: 1920,
        height: 1080,
        parameters: deepClone(row.baseSource.parameters || {}),
      };
      await fs.mkdir(localRoot, {recursive:true});
      await fs.writeFile(localSpecPath, JSON.stringify(localSpec, null, 2) + '\n', {flag:'wx'});
      const env = await childEnv(path.join(localRoot, 'tmp'), path.join(localRoot, 'cache'));
      env.WORK_ROOT=workspaceRoot;
      env.MOTION_RUNTIME_ROOT=runtimeRoot;
      const motionNodeModules = path.join(runtimeRoot, 'node_modules');
      env.NODE_PATH = [motionNodeModules, env.NODE_PATH].filter(Boolean).join(path.delimiter);
      const args = [cli, 'render', row.baseSource.templateId, '--spec', localSpecPath, '--output', localOutput,
        '--cache-dir', localWorkRoot, '--manifest', localManifestPath, '--ffmpeg', path.resolve(ffmpegExe)];
      if (browser) args.push('--browser', path.resolve(browser));
      const child = await run(process.execPath, args, {cwd: skillDir, env});
      const receipt = JSON.parse(await fs.readFile(localManifestPath, 'utf8'));
      if (receipt.kind !== 'native-html-canvas-template-render-evidence'
          || receipt.templateId !== row.baseSource.templateId
          || receipt.spec?.frameCount !== row.frameCount
          || receipt.spec?.width !== 1920 || receipt.spec?.height !== 1080 || receipt.spec?.fps !== 30) {
        fail(`${row.id} native HTML renderer receipt is missing or disagrees with the shared full-frame clock`);
      }
      const media = await ffprobeVideo(localOutput, ffmpegExe);
      if (media.width !== 1920 || media.height !== 1080 || !closeTo(media.fps, 30, 1e-6)
          || media.frameCount !== row.frameCount || media.audioStreams !== 0 || media.codec !== 'h264') {
        fail(`${row.id} native HTML base must render full-frame H.264 1920×1080@30 with exactly ${row.frameCount} frames and no audio`);
      }
      const outputHash = await shaFile(localOutput);
      if (receipt.output?.sha256 !== outputHash.sha256) fail(`${row.id} native HTML output hash disagrees with its receipt`);
      const stagedPath = `local-base/${outputHash.sha256}.mp4`;
      const stagedFile = path.join(jobRoot, 'public', stagedPath);
      await fs.mkdir(path.dirname(stagedFile), {recursive:true});
      await fs.copyFile(localOutput, stagedFile, fsConstants.COPYFILE_EXCL);
      const stagedHash = await shaFile(stagedFile);
      if (stagedHash.sha256 !== outputHash.sha256) fail(`${row.id} staged native HTML picture hash changed before Remotion composition`);
      rendered.set(row.id, {
        src: stagedPath, outputPath: localOutput, outputSha256: outputHash.sha256,
        receiptPath: localManifestPath, receiptSha256: sha256(await fs.readFile(localManifestPath)),
        sourcePath: row.baseSource.templateSourcePath, sourceSha256: row.baseSource.templateSourceSha256,
        renderer: row.baseSource.renderer, stagedPath, stagedSha256: stagedHash.sha256,
        probe: media, childOutput: child.stdout.trim(),
      });
      continue;
    }
    const localSegment = row.baseSource.renderer === 'motion-scene'
      ? {
          id: row.id, renderer: row.baseSource.renderer,
          scenePath: row.baseSource.scenePath, sceneSha256: row.baseSource.sceneSha256,
          ...(row.baseSource.drawModule ? {drawModulePath: row.baseSource.drawModule.path, drawModuleSha256: row.baseSource.drawModule.sha256} : {}),
          ...(raw.templateEffects ? {templateEffects: raw.templateEffects} : {}),
          startSec: 0, endSec: row.localDurationSec,
        }
      : {
          id: row.id, renderer: row.baseSource.renderer, templateId: row.baseSource.templateId,
          variables: deepClone(row.baseSource.variables || {}),
          ...(row.baseSource.omCues ? {omCues: deepClone(row.baseSource.omCues)} : {}),
          ...(row.baseSource.omScore ? {omScore: deepClone(row.baseSource.omScore)} : {}),
          ...(row.baseSource.omMusic ? {omMusic: deepClone(row.baseSource.omMusic)} : {}),
          ...(row.baseSource.sourceCueBindings ? {sourceCueBindings: deepClone(row.baseSource.sourceCueBindings)} : {}),
          startSec: 0, endSec: row.localDurationSec,
        };
    const localBlueprint = {format: NATIVE_OM_FILM_FORMAT, width: 1920, height: 1080, fps: 30, clock: {kind: 'film-global', durationSec: row.localDurationSec}, segments: [localSegment]};
    await fs.mkdir(localRoot, {recursive:true});
    await fs.writeFile(localBlueprintPath, JSON.stringify(localBlueprint, null, 2) + '\n', {flag:'wx'});
    const env = await childEnv(path.join(localRoot, 'tmp'), path.join(repoRoot, '.cache/tmp/video-shotcraft/npm'));
    env.WORK_ROOT=workspaceRoot;
    env.MOTION_RUNTIME_ROOT=runtimeRoot;
    const motionNodeModules = path.join(runtimeRoot, 'node_modules');
    env.NODE_PATH = [motionNodeModules, env.NODE_PATH].filter(Boolean).join(path.delimiter);
    const args = [cli, 'render', '--film-blueprint', localBlueprintPath, '--output', localOutput, '--work-root', localWorkRoot, '--runtime-root', runtimeRoot, '--manifest', localManifestPath, '--ffmpeg', path.resolve(ffmpegExe)];
    if (browser) args.push('--browser', path.resolve(browser));
    const child = await run(process.execPath, args, {cwd: skillDir, env});
    const receipt = JSON.parse(await fs.readFile(localManifestPath, 'utf8'));
    if (receipt.format !== 'laohu.huashu-om-film-manifest/1' || receipt.render?.frameCount !== row.frameCount) fail(`${row.id} local renderer receipt is missing or disagrees with the shared frame clock`);
    const childSegment = receipt.segments?.find((item) => item.id === row.id);
    let nativeSource = null;
    if (raw.renderer === 'laohu-native-om-template') {
      if (!childSegment || childSegment.renderer !== 'laohu-native-om-template'
          || typeof childSegment.sourceScenePath !== 'string' || !childSegment.sourceScenePath
          || !/^[a-f0-9]{64}$/.test(childSegment.sourceSceneSha256 || '')) {
        fail(`${row.id} complete OM child receipt must retain its rendered source event scene and SHA-256`);
      }
      const childSourceScenePath = path.resolve(path.dirname(localManifestPath), childSegment.sourceScenePath);
      const childSourceSceneBytes = await fs.readFile(childSourceScenePath);
      const childSourceSceneSha256 = sha256(childSourceSceneBytes);
      if (childSourceSceneSha256 !== childSegment.sourceSceneSha256) fail(`${row.id} complete OM child source scene changed after its receipt`);
      const childSourceSceneRecord = receipt.sourceScenes?.find((item) => item.segmentId === row.id);
      if (!childSourceSceneRecord
          || path.resolve(path.dirname(localManifestPath), childSourceSceneRecord.path) !== childSourceScenePath
          || childSourceSceneRecord.sha256 !== childSourceSceneSha256) {
        fail(`${row.id} complete OM child source scene is not bound by its own sourceScenes receipt row`);
      }
      const childSourceScene = JSON.parse(childSourceSceneBytes.toString('utf8'));
      const runtimeProbe = childSourceScene.huashuMotionRuntime;
      if (runtimeProbe?.format !== 'laohu.huashu-native-om-runtime-probe/1') fail(`${row.id} complete OM child source scene lacks its initialized original runtime probe`);
      if (childSegment.sourceCueBindings != null && canonical(childSegment.sourceCueBindings) !== canonical(runtimeProbe.sourceCueBindings || [])) {
        fail(`${row.id} complete OM sourceCueBindings differ between rendered child receipt and source runtime scene`);
      }
      nativeSource = {
        segmentId: row.id,
        renderer: 'laohu-native-om-template',
        templateId: row.baseSource.templateId,
        sourceScenePath: childSourceScenePath,
        sourceSceneSha256: childSourceSceneSha256,
        sourceScene: childSourceScene,
        sourceRuntimeProbeSha256: sha256(Buffer.from(canonical(runtimeProbe), 'utf8')),
        sourceCueBindings: childSegment.sourceCueBindings || null,
        childManifestPath: localManifestPath,
        childManifestSha256: sha256(await fs.readFile(localManifestPath)),
        childOutputSha256: receipt.output?.sha256 || null,
      };
    }
    const media = await ffprobeVideo(localOutput, ffmpegExe);
    if (media.width !== 1920 || media.height !== 1080 || !closeTo(media.fps, 30, 1e-6) || media.frameCount !== row.frameCount || media.audioStreams !== 0 || media.codec !== 'h264') fail(`${row.id} local picture-only segment must be H.264 1920×1080@30 with exactly ${row.frameCount} frames and no audio`);
    const outputHash = await shaFile(localOutput);
    if (receipt.output?.sha256 !== outputHash.sha256) fail(`${row.id} local renderer output hash disagrees with its receipt`);
    if (nativeSource && nativeSource.childOutputSha256 !== outputHash.sha256) fail(`${row.id} complete OM child output hash differs from its verified render receipt`);
    const stagedPath = `local-base/${outputHash.sha256}.mp4`;
    const stagedFile = path.join(jobRoot, 'public', stagedPath);
    await fs.mkdir(path.dirname(stagedFile), {recursive:true});
    await fs.copyFile(localOutput, stagedFile, fsConstants.COPYFILE_EXCL);
    const stagedHash = await shaFile(stagedFile);
    if (stagedHash.sha256 !== outputHash.sha256) fail(`${row.id} staged local picture hash changed before Remotion composition`);
    rendered.set(row.id, {
      src: stagedPath,
      outputPath: localOutput,
      outputSha256: outputHash.sha256,
      receiptPath: localManifestPath,
      receiptSha256: sha256(await fs.readFile(localManifestPath)),
      sourcePath: row.baseSource.scenePath || row.baseSource.templateSourcePath,
      sourceSha256: row.baseSource.sceneSha256 || row.baseSource.templateSourceSha256,
      renderer: row.baseSource.renderer,
      ...(nativeSource ? {nativeSource} : {}),
      stagedPath,
      stagedSha256: stagedHash.sha256,
      probe: media,
      childOutput: child.stdout.trim(),
    });
  }
  return rendered;
}
function relativeToBlueprint(blueprintPath, target) { return path.relative(path.dirname(blueprintPath), target) || path.basename(target); }

function validateCompositionScene(scene, schedule) {
  if (!scene) return {scene:null, scenePath:null, sceneSha256:null, maps:[], bindings:[], sourceScenes:[], actionBindings:[]};
  obj(scene.value, 'audioEventScene');
  if (scene.value.format !== MOTION_SCENE_FORMAT || scene.value.version !== 1 || scene.value.timeBasis !== 'film-global') fail('audioEventScene must be a version-1 motion-scene with film-global canonical time');
  finite(scene.value.duration, 'audioEventScene.duration', {min:Number.EPSILON});
  if (!closeTo(scene.value.duration, schedule.durationSec, 1 / schedule.fps)) fail('canonical audioEventScene duration must cover the rendered film clock');
  const events = findSceneAudioEvents(scene.value);
  const phases = [...(scene.value.phases || []), ...(scene.value.objects || []).flatMap((row) => row.data?.phases || [])];
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const nativeSourceEventBindings = new Map();
  for (const binding of scene.nativeSourceEventBindings || []) {
    if (nativeSourceEventBindings.has(binding.eventId)) fail(`native source event ${binding.eventId} has multiple composition segment bindings`);
    nativeSourceEventBindings.set(binding.eventId, binding);
  }
  const nativeSourcePhaseSegments = new Map((scene.nativeSourcePhaseBindings || []).map((binding) => [binding.phaseId, binding.segmentId]));
  const maps = schedule.rows.map((row) => ({
    id: `time:${row.id}`, segmentId:row.id, localStartSec:0, localEndSec:row.localDurationSec,
    filmStartSec:row.startSec, speed:row.localDurationSec / row.exactDurationSec, sourceRange:row.sourceRange,
    frameRange:row.frameRange, frameStartResidualSec:row.frameRange.startFrame / 30 - row.startSec,
    frameEndResidualSec:row.frameRange.endFrame / 30 - row.endSec,
    roundingResidualSamples:((row.frameRange.startFrame / 30 - row.startSec)+(row.frameRange.endFrame / 30 - row.endSec))*48000,
  }));
  const sourceScenes = new Map();
  const bindings = [];
  const seen = new Set();
  for (const [eventId, event] of events) {
    if (seen.has(eventId)) fail(`duplicate canonical audio event ${eventId}`); seen.add(eventId);
    const nativeSourceBinding = nativeSourceEventBindings.get(eventId) || null;
    let segmentId = event.source.segmentId || nativeSourceBinding?.segmentId || null;
    let phase = event.phaseId ? phaseById.get(event.phaseId) : null;
    if (event.phaseId && !phase) fail(`canonical event ${eventId} references a missing phase`);
    const phaseSegmentId = phase ? (phase.segmentId || nativeSourcePhaseSegments.get(phase.id) || null) : null;
    if (phaseSegmentId) segmentId ||= phaseSegmentId;
    if (nativeSourceBinding && (nativeSourceBinding.segmentId !== segmentId || (nativeSourceBinding.sourcePhaseId || null) !== (event.phaseId || null))) {
      fail(`native source event ${eventId} no longer matches its original segment/phase projection binding`);
    }
    if (!segmentId && event.timeBasis === 'film-global') segmentId = schedule.rows.find((row) => event.timeSec >= row.startSec - 1e-8 && event.timeSec <= row.endSec + 1e-8)?.id;
    if (!segmentId || !schedule.rows.some((row) => row.id === segmentId)) fail(`event ${eventId} must resolve to one segment for verified source ownership`);
    if (event.timeBasis === 'scene-local') {
      if (phase) {
        if (phaseSegmentId !== segmentId || phase.timeBasis !== 'scene-local') fail(`scene-local event ${eventId} phase must carry its one owning segmentId`);
      } else if (event.source.segmentId !== segmentId && nativeSourceBinding?.segmentId !== segmentId) {
        fail(`scene-local event ${eventId} without a phase must carry its explicit segmentId`);
      }
      if (event.timeSec > schedule.rows.find((row) => row.id === segmentId).localDurationSec + 1e-8) fail(`scene-local event ${eventId} falls outside its rendered segment`);
    } else if (event.timeBasis !== 'film-global') fail(`event ${eventId} has an unknown time basis`);
    const segment = schedule.rows.find((row) => row.id === segmentId);
    if (event.timeBasis === 'film-global' && (event.timeSec < segment.startSec - 1e-8 || event.timeSec > segment.endSec + 1e-8) && !event.phaseId) fail(`film-global event ${eventId} time does not fall in its owning segment`);
    sourceScenes.set(segmentId, {segmentId, path:scene.path, sha256:scene.sha256});
    bindings.push({eventId, sourceEventId:eventId, segmentId, sourceScenePath:scene.path, sourceSceneSha256:scene.sha256, sourceOwner:event.owner, sourceTimeBasis:event.timeBasis, sourcePhaseId:event.phaseId, compiledPhaseId:event.phaseId, timeMapId:event.timeBasis === 'scene-local' ? `time:${segmentId}` : null});
  }
  const actionBindings = [];
  for (const row of schedule.rows) for (const action of row.actionBindings) {
    if (action.audioEventId) {
      const event = events.get(action.audioEventId); const binding = bindings.find((item) => item.eventId === action.audioEventId);
      if (!event || !binding || binding.segmentId !== row.id) fail(`${action.id} audioEventId must resolve to exactly one event from the same segment in the canonical scene`);
      if (event.phaseId == null || !phaseById.has(event.phaseId)) fail(`${action.id} audio event must refer to a canonical phase`);
    }
    actionBindings.push({segmentId:row.id, ...action});
  }
  for (const edge of schedule.transitionEdges) {
    const phase = phaseById.get(edge.phaseId);
    if (!phase) fail(`transition ${edge.id} phaseId must resolve to a canonical visual phase`);
    const startSec = finite(phase.startSec, `${edge.phaseId}.startSec`, {min:0});
    const endSec = phase.endSec != null ? finite(phase.endSec, `${edge.phaseId}.endSec`, {min:startSec}) : startSec + finite(phase.durationSec, `${edge.phaseId}.durationSec`, {min:Number.EPSILON});
    const phaseStart = frameBoundary(startSec, 30), phaseEnd = frameBoundary(endSec, 30);
    if (!(phaseStart <= edge.peakFrame && phaseEnd > edge.fromFrame)) fail(`transition ${edge.id} canonical phase must include the FlashCut peak and cross the hidden hard cut`);
    if (edge.eventId) {
      const event = events.get(edge.eventId); if (!event || event.phaseId !== edge.phaseId) fail(`${edge.id}.eventId must be a real canonical audio event bound to the same phaseId`);
    }
  }
  return {scene:scene.value, scenePath:scene.path, sceneSha256:scene.sha256, maps, bindings, sourceScenes:[...sourceScenes.values()], actionBindings};
}

async function readFilmScene(schedule) {
  const {blueprint} = schedule;
  if ((blueprint.audioEventScenePath == null) !== (blueprint.audioEventSceneSha256 == null)) fail('audioEventScenePath and audioEventSceneSha256 must be provided together');
  if (!blueprint.audioEventScenePath) {
    const hasActions = schedule.rows.some((row) => row.actionBindings.some((action) => action.audioEventId)) || schedule.transitionEdges.some((edge) => edge.eventId);
    if (hasActions) fail('audio event binding needs the canonical audioEventScenePath/SHA pair');
    return null;
  }
  const scenePath = path.resolve(path.dirname(schedule.blueprintPath), blueprint.audioEventScenePath);
  const bytes = await fs.readFile(scenePath); const actual = sha256(bytes);
  if (actual !== blueprint.audioEventSceneSha256) fail('canonical audioEventScene SHA-256 is stale');
  return {path:relativeToBlueprint(schedule.blueprintPath, scenePath), absolutePath:scenePath, sha256:actual, value:JSON.parse(bytes.toString('utf8'))};
}

async function projectNativeBaseAudioScenes(scene, schedule, localBaseSegments, manifestPath, jobRoot) {
  const nativeRows = schedule.rows.filter((row) => localBaseSegments.get(row.id)?.nativeSource);
  if (!nativeRows.length) return scene;
  const outputManifestPath = path.resolve(manifestPath);
  const sourceBySegment = new Map(nativeRows.map((row) => {
    const source = localBaseSegments.get(row.id).nativeSource;
    return [row.id, {file:source.sourceScenePath, sha256:source.sourceSceneSha256, scene:source.sourceScene, localDurationSec:row.localDurationSec}];
  }));
  const projectionSchedule = {
    width:schedule.width, height:schedule.height, fps:schedule.fps, totalFrameCount:schedule.totalFrameCount,
    segments:nativeRows.map((row) => ({
      id:row.id,
      localBodyStartSec:0,
      localBodyEndSec:row.localDurationSec,
      localDurationSec:row.localDurationSec,
      exactStartSec:row.startSec,
      exactEndSec:row.endSec,
      exactDurationSec:row.exactDurationSec,
      sourceRange:row.sourceRange,
      frameRange:row.frameRange,
      frameStartResidualSec:row.frameRange.startFrame / schedule.fps - row.startSec,
      frameEndResidualSec:row.frameRange.endFrame / schedule.fps - row.endSec,
      roundingResidualSamples:((row.frameRange.startFrame / schedule.fps - row.startSec) + (row.frameRange.endFrame / schedule.fps - row.endSec)) * 48000,
      headHandleFrames:0,
      tailHandleFrames:0,
    })),
  };
  const projected = projectFilmEvents(projectionSchedule, sourceBySegment, outputManifestPath);
  const sourceSegmentByPhase = new Map();
  for (const binding of projected.audioEventBindings) {
    if (!binding.sourcePhaseId) continue;
    const prior = sourceSegmentByPhase.get(binding.sourcePhaseId);
    if (prior && prior !== binding.segmentId) fail(`native OM source phase ${binding.sourcePhaseId} is shared across segments and cannot bind to one local Film clock`);
    sourceSegmentByPhase.set(binding.sourcePhaseId, binding.segmentId);
  }
  const nativeEvents = projected.compiledScene.audioEvents;
  const nativePhases = projected.compiledScene.phases;
  const base = scene?.value ? structuredClone(scene.value) : {
    format:MOTION_SCENE_FORMAT, version:1, width:schedule.width, height:schedule.height, fps:schedule.fps,
    duration:schedule.durationSec, timeBasis:'film-global', phases:[], objects:[], audioEvents:[],
  };
  if (base.format !== MOTION_SCENE_FORMAT || base.version !== 1 || base.timeBasis !== 'film-global') fail('native OM audio projection requires the existing canonical film-global event scene');
  if (!closeTo(base.duration, schedule.durationSec, 1 / schedule.fps)) fail('native OM audio projection must retain the existing canonical Film duration');
  const existingEvents = findSceneAudioEvents(base);
  for (const [eventId] of findSceneAudioEvents(projected.compiledScene)) {
    if (existingEvents.has(eventId)) fail(`native OM event ${eventId} conflicts with an event in the caller canonical scene; resolve the ownership conflict before Film render`);
  }
  const existingPhases = new Set([...(base.phases || []), ...(base.objects || []).flatMap((row) => row.data?.phases || [])].map((row) => row.id));
  for (const phase of projected.compiledScene.phases || []) {
    if (existingPhases.has(phase.id)) fail(`native OM phase ${phase.id} conflicts with a phase in the caller canonical scene; resolve the ownership conflict before Film render`);
  }
  const existingCompositions = base.nativeSourceCompositions || [];
  const existingPresets = base.nativeSourcePresetPlans || [];
  const sourceSegmentIds = new Set(nativeRows.map((row) => row.id));
  if ([...existingCompositions, ...existingPresets].some((row) => sourceSegmentIds.has(row.segmentId))) fail('native OM source-music declaration conflicts with an existing canonical source declaration for the same segment');
  const merged = {
    ...base,
    phases:[...(base.phases || []), ...nativePhases],
    audioEvents:[...(base.audioEvents || []), ...nativeEvents],
    nativeSourceCompositions:[...existingCompositions, ...(projected.compiledScene.nativeSourceCompositions || [])],
    nativeSourcePresetPlans:[...existingPresets, ...(projected.compiledScene.nativeSourcePresetPlans || [])],
  };
  const priorEventBindings = scene?.nativeSourceEventBindings || [];
  const priorPhaseBindings = scene?.nativeSourcePhaseBindings || [];
  if (priorEventBindings.length || priorPhaseBindings.length) fail('caller canonical scene cannot predeclare native OM source projection bindings');
  const outputPath = path.join(jobRoot, 'compiled-audio-event-scene.json');
  const bytes = Buffer.from(JSON.stringify(merged, null, 2) + '\n');
  await fs.writeFile(outputPath, bytes, {flag:'wx'});
  return {
    path:relativeToBlueprint(schedule.blueprintPath, outputPath),
    absolutePath:outputPath,
    sha256:sha256(bytes),
    value:merged,
    nativeSourceEventBindings:projected.audioEventBindings.map((binding) => ({eventId:binding.eventId, segmentId:binding.segmentId, sourcePhaseId:binding.sourcePhaseId || null})),
    nativeSourcePhaseBindings:[...sourceSegmentByPhase].map(([phaseId, segmentId]) => ({phaseId, segmentId})),
    nativeSourceProjection:projected,
    originalInput:scene ? {path:scene.path, absolutePath:scene.absolutePath, sha256:scene.sha256} : null,
  };
}

async function assertSameVolume(paths) {
  const devices = await Promise.all(paths.map(async (file) => {
    let candidate=path.resolve(file);
    while (true) {
      try { return {file, checkedPath:candidate, dev:(await fs.stat(candidate)).dev}; }
      catch (error) {
        if (!['ENOENT','ENOTDIR'].includes(error.code)) throw error;
        const parent=path.dirname(candidate);
        if (parent===candidate) throw error;
        candidate=parent;
      }
    }
  }));
  for (const row of devices) if (row.dev !== devices[0].dev) fail(`all source, temp, runtime, and output paths must stay on one filesystem: ${row.file} (checked ${row.checkedPath})`);
}
async function run(command, args, options = {}) { return new Promise((resolve, reject) => { const child = spawn(command,args,{cwd:options.cwd,env:options.env,stdio:'pipe'}); let stdout='',stderr=''; child.stdout.on('data',(b)=>{if(stdout.length<65536) stdout+=b}); child.stderr.on('data',(b)=>{if(stderr.length<65536) stderr+=b}); child.on('error',reject); child.on('close',(code)=>code===0?resolve({stdout,stderr}):reject(new Error(`${command} failed (${code}): ${stderr||stdout}`))); }); }

export async function renderFilm({blueprintPath, outputPath, workRoot, runtimeRoot, manifestPath, browser, ffmpeg} = {}) {
  if (![blueprintPath,outputPath,workRoot,manifestPath].every((file)=>typeof file==='string' && path.isAbsolute(file))) fail('renderFilm/2 requires absolute blueprint, output, workRoot, and manifest paths');
  if (outputPath === manifestPath) fail('film output and manifest must differ');
  if (path.extname(outputPath).toLowerCase() !== '.mp4') fail('renderFilm/2 picture output must be .mp4');
  const suppliedWorkRoot=path.resolve(workRoot);
  if (isWithin(skillDir,suppliedWorkRoot)) fail('renderFilm/2 workRoot cannot be inside the installed Motion Skill');
  const legacyCacheRoots=[path.resolve(repoRoot,'.cache/tmp/film-render'),path.resolve(repoRoot,'.cache/tmp/video-shotcraft')];
  const legacyCacheRoot=legacyCacheRoots.find((root)=>isWithin(root,suppliedWorkRoot));
  const workspaceRoot=legacyCacheRoot?repoRoot:suppliedWorkRoot;
  const jobParent=legacyCacheRoot?suppliedWorkRoot:path.join(workspaceRoot,'.cache','tmp','laohu-motion','film-render');
  await fs.mkdir(jobParent,{recursive:true}); await fs.mkdir(path.dirname(outputPath),{recursive:true}); await fs.mkdir(path.dirname(manifestPath),{recursive:true});
  await assertFreshOutput(outputPath); await assertFreshOutput(manifestPath);
  const catalog=await loadCatalog(); const blueprintBytes=await fs.readFile(blueprintPath); const blueprint=JSON.parse(blueprintBytes.toString('utf8'));
  const runtime=await ensureRuntime(null,workspaceRoot,runtimeRoot);
  const schedule=await compileFilmV2(blueprint,blueprintPath,catalog,{runtimeRoot:runtime.runtimeRoot,nodeModules:runtime.nodeModules,workRoot:workspaceRoot});
  const jobRoot=path.join(jobParent,`film-render-${sha256(blueprintBytes).slice(0,12)}-${process.pid}-${Date.now()}`); await fs.mkdir(jobRoot,{recursive:false});
  const localInputs = schedule.rows.flatMap((row) => row.baseSource ? [
    row.baseSource.scenePath,
    row.baseSource.drawModule?.path,
    ...(row.baseSource.projectShot ? row.baseSource.projectShot.sourceFiles.map((file) => path.join(row.baseSource.projectShot.sourceRoot, ...file.path.split('/'))) : []),
    ...(row.baseSource.projectShot ? row.baseSource.projectShot.assets.map((asset) => asset.absolutePath) : []),
  ].filter(Boolean) : []);
  await assertSameVolume([path.dirname(blueprintPath), path.dirname(outputPath), path.dirname(manifestPath), jobRoot, workspaceRoot, localRuntimeRoot, ...localInputs]);
  await fs.mkdir(path.join(jobRoot,'public'),{recursive:true});
  await assertSameVolume([path.dirname(blueprintPath), path.dirname(outputPath), path.dirname(manifestPath), jobRoot, runtime.runtimeRoot, localRuntimeRoot]);
  let scene=await readFilmScene(schedule); let projected=validateCompositionScene(scene,schedule);
  const assets=await stageFilmAssets(schedule,jobRoot,ffmpeg);
  const localBaseSegments=await renderLocalBaseSegments(schedule,blueprintPath,jobRoot,{browser,ffmpeg,workspaceRoot,runtimeRoot:runtime.runtimeRoot,runtime});
  scene=await projectNativeBaseAudioScenes(scene,schedule,localBaseSegments,manifestPath,jobRoot);
  projected=validateCompositionScene(scene,schedule);
  const runtimeSegments=schedule.rows.map((row)=>({id:row.id,frameRange:row.frameRange,layers:row.layers,...(localBaseSegments.has(row.id)?{baseVideo:{src:localBaseSegments.get(row.id).src}}:{})}));
  const spec={kind:'film',width:1920,height:1080,fps:30,durationInFrames:schedule.totalFrameCount,segments:runtimeSegments,transitionEdges:schedule.transitionEdges};
  const renderOutputPath=schedule.transitionPlan.length?path.join(jobRoot,'remotion-picture-only.mp4'):outputPath;
  const rendered=await renderRemotion({runtime,spec,outputPath:renderOutputPath,frame:null,browser,workRoot:jobRoot,browserCacheRoot:workspaceRoot});
  const preTransitionProbe=await ffprobeVideo(renderOutputPath,ffmpeg);
  if(preTransitionProbe.width!==1920||preTransitionProbe.height!==1080||!closeTo(preTransitionProbe.fps,30,1e-6)||preTransitionProbe.frameCount!==schedule.totalFrameCount||preTransitionProbe.audioStreams!==0) fail('Remotion/ffprobe output does not match v2 frame count or picture-only constraint');
  let transitionReceipts=[];
  let finalOutputPath=renderOutputPath;
  let probe=preTransitionProbe;
  if(schedule.transitionPlan.length){
    const transitionFfmpeg=ffmpeg||process.env.MOTION_FFMPEG||'ffmpeg';
    const renderedSegments=schedule.rows.map((row)=>({output:renderOutputPath,sourceFrameOffset:row.frameRange.startFrame,expectedFrameCount:row.frameCount}));
    for(const plan of schedule.transitionPlan) transitionReceipts.push(await renderTransitionWindow(plan,schedule.transitionSchedule,renderedSegments,jobRoot,{browser:browser||null,ffmpeg:transitionFfmpeg,nodeModulesPath:runtime.nodeModules}));
    const transitionOutput=await assembleTransitionFilm(transitionFfmpeg,outputPath,jobRoot,renderedSegments,schedule.transitionSchedule,transitionReceipts);
    probe=await ffprobeVideo(transitionOutput,transitionFfmpeg);
    if(probe.width!==1920||probe.height!==1080||!closeTo(probe.fps,30,1e-6)||probe.frameCount!==schedule.totalFrameCount||probe.audioStreams!==0) fail('source transition assembly does not preserve the Film /2 output frame clock or picture-only constraint');
    await fs.link(transitionOutput,outputPath).catch((error)=>fail('cannot commit Film /2 output without replacing an existing file: '+error.message));
    await fs.unlink(transitionOutput);
    finalOutputPath=outputPath;
  }
  const output=await shaFile(finalOutputPath);
  const manifestScenePath=scene?.absolutePath || null;
  const manifest={
    format:FILM_MANIFEST_FORMAT,
    source:{blueprintPath:path.relative(path.dirname(manifestPath),blueprintPath),blueprintSha256:sha256(blueprintBytes),clockKind:schedule.clock.clockKind,
      ...(scene?.originalInput?{canonicalEventSceneInput:{path:path.relative(path.dirname(manifestPath),scene.originalInput.absolutePath),sha256:scene.originalInput.sha256}}:{}),
      ...(schedule.clock.timelinePath?{timelinePath:path.relative(path.dirname(manifestPath),schedule.clock.timelinePath),timelineSha256:schedule.clock.timelineSha256,editPlanPath:path.relative(path.dirname(manifestPath),schedule.clock.editPlanPath),editPlanSha256:schedule.clock.editPlanSha256}:{}),
      sourceId,sourceCommit,renderer:'@remotion/renderer 4.0.537'},
    output:{path:path.relative(path.dirname(manifestPath),outputPath),sha256:output.sha256,kind:schedule.transitionPlan.length?'picture-only-remotion-v2-with-source-transition-postprocess':'picture-only-remotion-v2'},
    render:{width:1920,height:1080,fps:30,frameCount:schedule.totalFrameCount,durationSec:schedule.durationSec,probe},
    frameClock:{kind:schedule.clock.clockKind,method:'absolute-ceil-boundaries',fps:30,totalFrameCount:schedule.totalFrameCount},
    segments:schedule.rows.map((row)=>{
      const local=localBaseSegments.get(row.id);
      const projectShot = row.baseSource?.projectShot;
      return {
        id:row.id,
        renderer:row.baseSource?.renderer||row.segment.renderer,
        ...(row.baseSource?.normalizedFromRenderer?{normalizedFromRenderer:row.baseSource.normalizedFromRenderer}:{}),
        sourceCatalogId:row.sourceEntry?.id||null,
        componentPath:row.sourceEntry?.component.path||null,
        componentSha256:row.sourceEntry?.component.sha256||null,
        exportName:row.sourceEntry?.component.exportName||null,
        sourceCommit:row.sourceVerification?.sourceCommit||null,
        sourceId:row.sourceVerification?.sourceId||null,
        sourceEvidence:row.sourceVerification||null,
        fidelityMode:row.segment.fidelityMode||(row.baseSource?'exact-source-plus-local-overlays':null),
        frameRange:row.frameRange,
        sourceRange:row.sourceRange,
        sourceDurationFrames:row.segment.sourceDurationFrames||null,
        expectedFrameCount:row.frameCount,
        observedFrameCount:row.frameCount,
        layers:row.layers.map(consumedLayerRecord),
        baseSource:row.baseSource?{
          renderer:row.baseSource.renderer,
          templateId:row.baseSource.templateId||null,
          sourcePath:projectShot?.module.path || (row.baseSource.scenePath ? relativeToBlueprint(blueprintPath,row.baseSource.scenePath) : row.baseSource.templateSourcePath),
          sourceSha256:projectShot?.module.sha256 || row.baseSource.sceneSha256 || row.baseSource.templateSourceSha256,
          ...(projectShot ? {projectShot: local?.projectShot || projectShotBinding(projectShot), generatedEntrySha256:local?.generatedEntrySha256||null} : {}),
          renderedOutputPath:local?path.relative(path.dirname(manifestPath),local.outputPath):null,
          renderedOutputSha256:local?.outputSha256||null,
          rendererReceiptPath:local?path.relative(path.dirname(manifestPath),local.receiptPath):null,
          rendererReceiptSha256:local?.receiptSha256||null,
          ...(local?.rendererFontLoads?.length?{rendererFontLoads:local.rendererFontLoads}:{}),
          stagedPublicPath:local?.stagedPath||null,
          stagedSha256:local?.stagedSha256||null,
          probe:local?.probe||null,
        }:null,
        actionBindings:row.actionBindings,
      };
    }),
    compositionGroups:schedule.groups,
    transitionEdges:schedule.transitionEdges,
    transitions:transitionReceipts.map((row)=>({segmentId:row.segmentId,previousSegmentId:row.previousSegmentId,id:row.id,method:row.method,mode:row.mode,boundaryReason:row.boundaryReason,windowFrames:row.windowFrames,windowFrameRange:row.windowFrameRange,boundaryFrameMap:row.boundaryFrameMap||null,sourceFunction:row.sourceFunction,sourceCommit:row.sourceCommit,parameters:row.parameters,frames:row.frames,receiptPath:path.relative(path.dirname(manifestPath),row.receiptPath),renderedOutput:{path:path.relative(path.dirname(manifestPath),row.renderedOutput.path),sha256:row.renderedOutput.sha256,frameCount:row.renderedOutput.frameCount},renderReceipt:{path:path.relative(path.dirname(manifestPath),row.renderReceipt.path),sha256:row.renderReceipt.sha256,sourceFunctionCalls:row.renderReceipt.sourceFunctionCalls,adapterCalls:row.renderReceipt.adapterCalls}})),
    assets:[...assets,...[...localBaseSegments.entries()].map(([segmentId,row])=>({segmentId,role:'pre-rendered-local-picture-segment',path:row.stagedPath,sha256:row.stagedSha256,sourcePath:row.sourcePath,sourceSha256:row.sourceSha256,renderer:row.renderer,receiptPath:path.relative(path.dirname(manifestPath),row.receiptPath),receiptSha256:row.receiptSha256,probe:row.probe}))],
    ...(scene?{audioEventScene:{path:path.relative(path.dirname(manifestPath),scene.absolutePath),sha256:scene.sha256,format:MOTION_SCENE_FORMAT}}:{}),
    audioTimeMaps:projected.maps,
    audioEventBindings:projected.bindings,
    sourceScenes:projected.sourceScenes.map((row)=>({...row,path:path.relative(path.dirname(manifestPath),manifestScenePath)})),
    nativeBaseSources:[...localBaseSegments.entries()].flatMap(([segmentId,row])=>row.nativeSource?[{
      segmentId,
      renderer:'laohu-native-om-template',
      templateId:row.nativeSource.templateId,
      childSegmentId:row.nativeSource.segmentId,
      childFilmManifestPath:path.relative(path.dirname(manifestPath),row.nativeSource.childManifestPath),
      childFilmManifestSha256:row.nativeSource.childManifestSha256,
      childOutputSha256:row.nativeSource.childOutputSha256,
      sourceScenePath:path.relative(path.dirname(manifestPath),row.nativeSource.sourceScenePath),
      sourceSceneSha256:row.nativeSource.sourceSceneSha256,
      sourceRuntimeProbeSha256:row.nativeSource.sourceRuntimeProbeSha256,
      sourceCueBindings:row.nativeSource.sourceCueBindings,
    }]:[]),
    nativeSourceCompositions:scene?.value?.nativeSourceCompositions||[],
    nativeSourcePresetPlans:scene?.value?.nativeSourcePresetPlans||[],
    sourceActionBindings:projected.actionBindings,
    runtime:{version:'4.0.537',packageLockSha256:runtime.lockHash,nodeModulesPath:runtime.nodeModulesPath,resolutionSource:runtime.resolutionSource,packages:runtime.packages,bundleDir:path.relative(jobRoot,rendered.bundleDir),workRoot:path.relative(path.dirname(manifestPath),jobRoot)},
    assembly:{method:schedule.transitionPlan.length?'remotion-composition-with-picture-only-local-base-segments-then-source-transition-postprocess':'single-remotion-composition-with-picture-only-local-base-segments',transitionEdges:schedule.transitionEdges.map((row)=>({id:row.id,mechanism:row.transitionMechanism,window:{startFrame:row.startFrame,durationInFrames:row.durationInFrames},peakFrame:row.peakFrame})),transitions:schedule.transitionPlan.map((row)=>({id:row.id,method:row.method,mode:row.mode,windowFrameRange:row.windowFrameRange,sourceFunction:row.sourceFunction})),audioStream:'absent',audioMixOwner:'scripts/audio.mjs (invoke once after picture render)'},
  };
  if (scene) for(const row of manifest.audioEventBindings) {row.sourceScenePath=manifest.audioEventScene.path;row.sourceSceneSha256=manifest.audioEventScene.sha256;}
  await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return {outputPath,manifestPath,manifestSha256:sha256(Buffer.from(JSON.stringify(manifest,null,2)+'\n')),frameCount:schedule.totalFrameCount,durationSec:schedule.durationSec,segments:schedule.rows.length,workRoot:jobRoot};
}

export const __test = {compileFilmV2, frameBoundary, resolvePoint, validateNode, validatePlacement, validateShotcraftSpec, validateCompositionScene, validateDerivedPatch, transformGalleryCopySource, verifyDerivedPatchProvider, renderRemotion};
