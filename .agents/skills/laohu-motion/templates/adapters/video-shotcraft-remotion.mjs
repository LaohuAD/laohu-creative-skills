import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {compilePlan, hashPlan, verifyPlanEvidence} from '../../../laohu-asrcut/scripts/asrcut.mjs';

const adapterDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(adapterDir, '../..');
const repoRoot = path.resolve(skillDir, '../../..');
const catalogPath = path.join(skillDir, 'templates/catalog.json');
const runtimeManifest = path.join(skillDir, 'templates/runtime/video-shotcraft/package.json');
const runtimeLock = path.join(skillDir, 'templates/runtime/video-shotcraft/package-lock.json');
const sourceId = 'video-shotcraft';
const sourceCommit = '1266a3ec4831289c4d893d42dd5102723658039a';
const SOURCE_ROOT = path.join(skillDir, 'templates/upstream/video-shotcraft');
const FILM_FORMAT_V2 = 'laohu.huashu-film-blueprint/2';
const FILM_MANIFEST_FORMAT = 'laohu.motion-film-manifest/1';
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
  'video-shotcraft-grain-dissolve': new Set(),
});
const PLACEMENT_REQUIRED = new Set(['video-shotcraft-text-reveal', 'video-shotcraft-sheen', 'video-shotcraft-speed-blur', 'video-shotcraft-clip-card']);
const MATERIAL_PLACEMENT = new Set(['video-shotcraft-grain', 'video-shotcraft-backdrop']);
const PLACEMENT_SUPPORTED = new Set([...PLACEMENT_REQUIRED, ...MATERIAL_PLACEMENT]);

function fail(message) { throw new Error(message); }
function obj(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`); return value; }
function keys(value, allowed, label) { for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label}.${key} is not consumed by the verified Shotcraft adapter`); }
function finite(value, label, {min = -Infinity, max = Infinity, integer = false} = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) fail(`${label} must be a finite ${integer ? 'integer' : 'number'} in [${min}, ${max}]`);
  return value;
}
function stableId(value, label) { if (typeof value !== 'string' || !ID.test(value)) fail(`${label} must be a stable ID`); return value; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
function consumedLayerRecord(layer) {
  const props = deepClone(layer.props || {});
  const derivedPatch = props.derivedPatch;
  delete props.derivedPatch;
  return {id:layer.id || null, catalogId:layer.catalogId, props, ...(layer.placement ? {placement:layer.placement} : {}), ...(derivedPatch ? {derivedPatch} : {})};
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function closeTo(a, b, tolerance = 1e-8) { return Math.abs(a - b) <= tolerance; }
function isWithin(parent, child) { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); }
function hex(value, label) { if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail(`${label} must be #RRGGBB`); return value; }
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

async function loadCatalog() { return JSON.parse(await fs.readFile(catalogPath, 'utf8')); }
function getEntry(catalog, id) {
  const entry = catalog.templates.find((row) => row.id === id && row.sourceId === sourceId);
  if (!entry) fail(`Unknown callable Shotcraft template ${id}`);
  if (entry.renderer !== 'video-shotcraft-remotion') fail(`${id} is not routed to video-shotcraft-remotion`);
  if (entry.availability === 'source-only') fail(`${id} remains source-only and cannot be rendered`);
  if (!entry.renderPreconditions?.length) fail(`${id} has no declared render preconditions`);
  return entry;
}
function isFullSceneEntry(entry) { return ['full-scene', 'source-adapted-full-scene'].includes(entry?.component?.kind); }

async function verifySourceAndEntry(catalog, entry) {
  const source = catalog.sources.find((row) => row.id === sourceId);
  if (!source || source.commit !== sourceCommit || source.vendorRoot !== 'templates/upstream/video-shotcraft') fail('Shotcraft catalog pin/root does not match approved source commit');
  const ledger = new Map((source.files || []).map((row) => [row.path, row]));
  const files = new Set();
  for (const relative of entry.closure || []) {
    if (typeof relative !== 'string' || path.posix.isAbsolute(relative) || relative.split('/').includes('..')) fail(`${entry.id} has an unsafe closure path`);
    const actualPath = path.resolve(SOURCE_ROOT, ...relative.split('/'));
    if (!isWithin(SOURCE_ROOT, actualPath)) fail(`${entry.id} closure escaped vendor root`);
    const bytes = await fs.readFile(actualPath).catch((error) => fail(`${entry.id} closure missing ${relative}: ${error.message}`));
    const pin = ledger.get(relative);
    if (!pin || pin.sha256 !== sha256(bytes)) fail(`${entry.id} closure hash is absent/stale in source ledger: ${relative}`);
    files.add(relative);
  }
  const component = entry.component;
  const componentPin = ledger.get(component?.path);
  if (!componentPin || componentPin.sha256 !== component.sha256 || !files.has(component.path)) fail(`${entry.id} component path/hash is not part of its verified closure`);
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
  return {sourceId, sourceCommit, componentPath: component.path, componentSha256: component.sha256, closure: [...files].sort().map((relative) => ({path: relative, sha256: ledger.get(relative).sha256})), ...(localImplementation ? {localImplementation} : {})};
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
    if (!['serif', 'sans', 'monospace'].includes(family)) fail(`${label}.fontFamily must select a registered system family`);
    out.fontFamily = family === 'serif' ? 'Georgia, "Songti SC", serif' : family === 'monospace' ? 'Menlo, monospace' : 'Arial, "Microsoft YaHei", sans-serif';
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

async function verifyDerivedPatchProvider(entry) {
  const provider = entry.derivedProvider;
  if (!provider || provider.patchId !== 'paper-title-card-copy' || !entry.allowedDerivedPatches?.includes(provider.patchId)) fail(`${entry.id} has no registered paper-title-card-copy provider`);
  if (provider.parentComponentPath !== entry.component.path || provider.parentComponentSha256 !== entry.component.sha256) fail(`${entry.id} derived provider parent lock differs from its source component`);
  const sourcePath = path.resolve(SOURCE_ROOT, entry.component.path);
  const sourceBytes = await fs.readFile(sourcePath);
  const source = sourceBytes.toString('utf8');
  if (sha256(sourceBytes) !== provider.parentComponentSha256) fail(`${entry.id} derived provider parent SHA-256 changed`);
  const derivedPath = path.resolve(skillDir, provider.entrypoint || '');
  if (!isWithin(path.join(skillDir, 'templates/adapters'), derivedPath)) fail(`${entry.id} derived provider path escapes the Motion adapter directory`);
  const derivedBytes = await fs.readFile(derivedPath);
  if (sha256(derivedBytes) !== provider.sha256) fail(`${entry.id} derived provider SHA-256 differs from its catalog lock`);
  if (derivedBytes.toString('utf8') !== transformGalleryCopySource(source)) fail(`${entry.id} derived provider differs from the exact source-limited copy transformation`);
  return {sourcePath, sourceSha256:provider.parentComponentSha256, path:derivedPath, sha256:provider.sha256};
}

export async function verifyDerivedPatchProviderForEntry(entry) {
  return verifyDerivedPatchProvider(entry);
}

function graphemeCount(value) {
  return [...new Intl.Segmenter('und', {granularity:'grapheme'}).segment(value)].length;
}

async function validateDerivedPatch(entry, patch) {
  obj(patch, `${entry.id}.derivedPatch`);
  keys(patch, new Set(['id', 'words', 'sub', 'subDigits']), `${entry.id}.derivedPatch`);
  if (patch.id !== 'paper-title-card-copy' || !entry.allowedDerivedPatches?.includes(patch.id)) fail(`${entry.id} does not register derived patch ${String(patch.id)}`);
  await verifyDerivedPatchProvider(entry);
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

async function validateNode(entry, props, {durationFrames, assetRecords = [], assetsRoot = null, publicRoot = null, catalog = null, fidelityMode = null} = {}) {
  obj(props, `${entry.id}.props`);
  keys(props, EXPORTED_FIELDS[entry.id] || new Set(), `${entry.id}.props`);
  const p = deepClone(props);
  switch (entry.id) {
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
      const mode = fidelityMode || 'exact-baseline';
      if (mode !== 'exact-baseline') fail('GrainDissolve currently supports exact-baseline only; it has no source props contract');
      if (durationFrames !== entry.sourceDurationFrames) fail(`GrainDissolve useT() reads useVideoConfig().durationInFrames; preserve the native ${entry.sourceDurationFrames}-frame composition context`);
      return {catalogId: entry.id, props: {}, fidelityMode: mode};
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
      if (!p.content || p.content.catalogId !== 'video-shotcraft-text-reveal') fail('SpeedBlur content is restricted to a validated TextReveal child; source child layer remains a composed foreground object');
      obj(p.content, 'content'); keys(p.content, new Set(['catalogId', 'props']), 'content');
      if (!catalog) fail('internal adapter error: nested components require the template catalog');
      const childEntry = entryById(catalog, p.content.catalogId);
      const child = await validateNode(childEntry, p.content.props, {durationFrames, catalog});
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
      const local = path.resolve(assetsRoot, p.src);
      if (!isWithin(path.resolve(assetsRoot), local)) fail('ClipCard asset escapes --assets-root');
      const bytes = await fs.readFile(local).catch((error) => fail(`ClipCard asset could not be read: ${error.message}`));
      const digest = sha256(bytes), extension = path.extname(local).toLowerCase();
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
    default: fail(`${entry.id} has no strict input validator`);
  }
}

function canonicalProps(value) { return canonical(value); }
function entryById(catalog, id) { return getEntry(catalog, id); }

export async function validateShotcraftSpec(catalog, entry, spec, options = {}) {
  obj(spec, 'Shotcraft template spec');
  keys(spec, new Set(['templateId', 'width', 'height', 'fps', 'durationInFrames', 'fidelityMode', 'layers', 'componentProps', 'theme', 'colors', 'timeSec']), 'Shotcraft template spec');
  if (spec.templateId !== entry.id) fail(`templateId must equal ${entry.id}`);
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
      if (sourceLayer.catalogId !== entry.id) fail('full-scene prepared input must call the exact catalog source component');
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
        node.props.derivedPatch = await validateDerivedPatch(entry, sourceLayer.derivedPatch);
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
    layers: node.layers ? node.layers : [{catalogId: node.catalogId, props: node.props}],
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
  const common = ['id', 'renderer', 'compositionGroupId', 'startSec', 'endSec', 'unitIds', 'layers', 'actionBindings'];
  if (segment.renderer === 'video-shotcraft-remotion') {
    keys(segment, new Set([...common, 'sourceCatalogId', 'componentPath', 'componentSha256', 'exportName', 'sourceCommit', 'sourceDurationFrames', 'fidelityMode', 'props', 'sourceFrameAtSegmentStart', 'eventScenePath', 'eventSceneSha256']), label);
  } else if (segment.renderer === 'motion-scene') {
    keys(segment, new Set([...common, 'scenePath', 'sceneSha256', 'drawModulePath', 'drawModuleSha256', 'templateEffects']), label);
    if (typeof segment.scenePath !== 'string' || !segment.scenePath.trim()) fail(`${label}.scenePath is required for motion-scene`);
    if (typeof segment.sceneSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(segment.sceneSha256)) fail(`${label}.sceneSha256 is required for motion-scene`);
    if ((segment.drawModulePath == null) !== (segment.drawModuleSha256 == null)) fail(`${label}.drawModulePath and .drawModuleSha256 must be supplied together`);
    if (segment.drawModulePath != null && (typeof segment.drawModulePath !== 'string' || !segment.drawModulePath.trim() || !/^[a-f0-9]{64}$/.test(segment.drawModuleSha256))) fail(`${label} custom draw module needs a path and SHA-256`);
    if (segment.templateEffects != null && segment.templateEffects !== 'huashu-art-motion-dg') fail(`${label}.templateEffects is not a registered local renderer effect`);
  } else if (segment.renderer === 'huashu-motion-template') {
    keys(segment, new Set([...common, 'templateId', 'variables', 'eventScenePath', 'eventSceneSha256']), label);
    stableId(segment.templateId, `${label}.templateId`); obj(segment.variables || {}, `${label}.variables`);
    if ((segment.eventScenePath == null) !== (segment.eventSceneSha256 == null)) fail(`${label}.eventScenePath and .eventSceneSha256 must be supplied together`);
    if (segment.eventScenePath != null && (typeof segment.eventScenePath !== 'string' || !segment.eventScenePath.trim() || !/^[a-f0-9]{64}$/.test(segment.eventSceneSha256))) fail(`${label}.eventScenePath needs a matching SHA-256`);
  } else fail(`${label}.renderer must be video-shotcraft-remotion, motion-scene, or huashu-motion-template`);
  stableId(segment.id, `${label}.id`); stableId(segment.compositionGroupId, `${label}.compositionGroupId`);
  if (segment.renderer === 'video-shotcraft-remotion') {
    if (segment.sourceCommit !== sourceCommit) fail(`${label}.sourceCommit must match the pinned Shotcraft commit`);
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

async function validateLocalBaseSource(segment, row, blueprintPath, catalog) {
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
  const template = catalog.templates.find((entry) => entry.id === segment.templateId);
  if (!template || template.renderer !== 'native-om-template-source' || template.availability === 'source-only') fail(`${segment.id}.templateId must resolve to a callable Huashu native OM template`);
  const source = catalog.sources.find((entry) => entry.id === template.sourceId);
  const sourceFile = source?.files?.find((file) => file.path === template.sourcePath);
  if (!sourceFile?.sha256) fail(`${segment.id} native template source has no pinned SHA-256`);
  return {renderer: segment.renderer, templateId: segment.templateId, templateSourcePath: template.sourcePath, templateSourceSha256: sourceFile.sha256, templateSourceId: template.sourceId, variables: deepClone(segment.variables || {})};
}

async function sourceActionFrame(entry, action, layers) {
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
      const sourcePath = path.resolve(SOURCE_ROOT, entry.component.path);
      const sourceBytes = await fs.readFile(sourcePath);
      if (sha256(sourceBytes) !== entry.component.sha256) fail(`${entry.id} pinned display-copy source hash changed before action binding`);
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

async function compileFilmV2(blueprint, blueprintPath, catalog) {
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
    if (seen.has(row.id)) fail(`duplicate segment id ${row.id}`); seen.add(row.id);
    const isShotcraft = raw.renderer === 'video-shotcraft-remotion';
    const entry = isShotcraft ? getEntry(catalog, raw.sourceCatalogId) : null;
    let baseSource = null;
    if (isShotcraft) {
      await verifySourceAndEntry(catalog, entry);
      if (entry.component.path !== raw.componentPath || entry.component.sha256 !== raw.componentSha256 || entry.component.exportName !== raw.exportName) fail(`${raw.id} component path/hash/export disagrees with its catalog record`);
      if (!entry.fidelityModes.includes(raw.fidelityMode)) fail(`${entry.id} does not support fidelityMode ${raw.fidelityMode}`);
      const baselineDuration = entry.sourceDurationFrames ?? entry.baselineProps?.duration ?? entry.baselineProps?.durationInFrames;
      if (raw.fidelityMode === 'exact-baseline' && raw.sourceDurationFrames !== baselineDuration) fail(`${raw.id} exact sourceDurationFrames must equal its cataloged native baseline duration`);
      if (raw.fidelityMode === 'exact-baseline' && row.frameCount !== raw.sourceDurationFrames) fail(`${raw.id} exact-baseline segment length must equal its complete source duration; no hidden hold, loop, trim, or time stretch is applied`);
      if (raw.fidelityMode === 'source-adapted-local') {
        if (entry.component.kind !== 'source-adapted-full-scene' || entry.sourceMethodAdaptation?.kind !== 'source-adapted-local') fail(`${raw.id} source-adapted-local is limited to catalog entries with an explicit local adaptation contract`);
        if (baselineDuration !== 88 || raw.sourceDurationFrames !== 88 || row.frameCount !== 88) fail(`${raw.id} ListStackPress adaptation must retain its fixed 88-frame source and segment duration`);
      }
      if (raw.fidelityMode === 'derived-patch') {
        if (entry.id !== 'video-shotcraft-paper-title-card-gallery') fail(`${raw.id} derived-patch is limited to the catalog-registered active gallery PaperTitleCard provider`);
        if (raw.sourceDurationFrames !== entry.sourceDurationFrames || row.frameCount !== entry.sourceDurationFrames) fail(`${raw.id} derived-patch must retain the complete ${entry.sourceDurationFrames}-frame source duration`);
        if (raw.props != null && canonicalProps(raw.props) !== canonicalProps({})) fail(`${raw.id} derived-patch content belongs only in its separate layer.derivedPatch object; source props remain empty`);
        await verifyDerivedPatchProvider(entry);
      }
      if (isFullSceneEntry(entry) && raw.layers != null && raw.layers.length !== 1) fail(`${raw.id} full-scene source route cannot be decomposed or overlaid; use explicitly selected local components for a recomposed scene`);
    } else {
      baseSource = await validateLocalBaseSource(raw, row, blueprintPath, catalog);
    }
    if (raw.eventScenePath != null && (typeof raw.eventScenePath !== 'string' || typeof raw.eventSceneSha256 !== 'string')) fail(`${raw.id} eventScenePath/eventSceneSha256 must be supplied together`);
    if (raw.eventScenePath != null && (raw.eventScenePath !== blueprint.audioEventScenePath || raw.eventSceneSha256 !== blueprint.audioEventSceneSha256)) fail(`${raw.id} event scene must be the single canonical film-global scene declared by the blueprint`);
    if (isShotcraft && raw.layers != null && raw.props != null && canonicalProps(raw.props) !== canonicalProps({})) fail(`${raw.id} cannot supply both layers and separately ignored top-level source props; put source values in its one layer`);
    const rawLayers = raw.layers || (isShotcraft ? [{catalogId: entry.id, props: raw.props || {}}] : []);
    if (!Array.isArray(rawLayers) || (isShotcraft && !rawLayers.length) || rawLayers.length > 8) fail(`${raw.id}.layers must contain ${isShotcraft ? '1–8' : '0–8'} ordered components`);
    if (isShotcraft && isFullSceneEntry(entry) && (rawLayers.length !== 1 || rawLayers[0]?.catalogId !== entry.id)) fail(`${raw.id} full-scene must render its one pinned source component without recomposition`);
    if (isShotcraft && raw.fidelityMode === 'derived-patch' && (rawLayers.length !== 1 || rawLayers[0]?.catalogId !== entry.id || rawLayers[0]?.derivedPatch == null)) fail(`${raw.id} derived-patch requires exactly one gallery source layer with a separate derivedPatch contract`);
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
      const validated = await validateNode(layerEntry, layerSpec.props || {}, {durationFrames: row.frameCount, assetsRoot: path.dirname(blueprintPath), assetRecords, catalog, fidelityMode: layerMode});
      if (layerSpec.derivedPatch != null) {
        if (!isShotcraft || raw.fidelityMode !== 'derived-patch' || layerEntry.id !== 'video-shotcraft-paper-title-card-gallery') fail(`${raw.id}.layers[${layerIndex}].derivedPatch is only consumed by its exact Shotcraft gallery derived-patch source layer`);
        validated.props.derivedPatch = await validateDerivedPatch(layerEntry, layerSpec.derivedPatch);
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
    const landmark = await sourceActionFrame(actionEntry, action, layers);
      const actionFrame = row.frameRange.startFrame + landmark.frame;
      if (actionFrame >= row.frameRange.endFrame) fail(`${action.id} source landmark falls beyond the rendered local segment frame domain`);
      let asrAnchor = null;
      if (action.timelineAnchor != null) {
        if (!clock.timeline) fail(`${action.id} cannot declare timelineAnchor without asrcut-v2`);
        const point = resolvePoint(clock.timeline, action.timelineAnchor, `${action.id}.timelineAnchor`);
        if (action.textRelation === 'literal') {
          const normalized = (text) => String(text || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
          if (normalized(point.text) !== normalized(landmark.actionText)) fail(`${action.id} literal text relation requires the retained ASR token to match the source display unit`);
        }
        const targetSec = point.sample / point.sampleRateHz;
        const targetFrame = frameBoundary(targetSec, blueprint.fps);
        const deltaFrames = targetFrame - actionFrame;
        const tolerance = finite(action.toleranceFrames ?? 0, `${action.id}.toleranceFrames`, {min: 0, max: 2, integer: true});
        if (Math.abs(deltaFrames) > tolerance) fail(`${action.id} source landmark is ${deltaFrames}f from the frozen ASR anchor, outside tolerance ${tolerance}f; keep both clocks and revise the edit/design explicitly`);
        asrAnchor = {...action.timelineAnchor, targetSample: point.sample, sampleRateHz: point.sampleRateHz, timingPrecision: point.timingPrecision, targetFrame, deltaFrames};
      } else if (clock.timeline) fail(`${action.id} needs a frozen ASR point anchor or must be explicitly omitted from speech binding`);
      actionBindings.push({id: action.id, landmarkId: action.landmarkId, componentCatalogId: action.componentCatalogId || entry?.id || null, componentInstanceId: action.componentInstanceId || landmark.layerId || null, sourceActionFrame: actionFrame, sourceFrameWithinComponent: landmark.frame, actionText: landmark.actionText, formula: landmark.formula, semanticCueId: action.semanticCueId, textRelation: action.textRelation || 'semantic', timelineAnchor: asrAnchor, audioEventId: action.audioEventId || null});
    }
    rows.push({...row, sourceEntry: entry, baseSource, layers, actionBindings, assetRecords});
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
  return {blueprint, blueprintPath, clock, rows, groups, transitionEdges: edgeRows, width: 1920, height: 1080, fps: 30, totalFrameCount, durationSec: totalFrameCount / 30};
}

async function childEnv(tmpDir, cacheDir) {
  await fs.mkdir(tmpDir, {recursive: true}); await fs.mkdir(cacheDir, {recursive: true});
  return {...process.env, TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, 'npm-cache'), REMOTION_CACHE_DIR: path.join(cacheDir, 'remotion')};
}

async function ensureRuntime(jobRoot) {
  await fs.mkdir(path.join(repoRoot, '.cache/tmp/video-shotcraft'), {recursive:true});
  const lockBytes = await fs.readFile(runtimeLock), manifestBytes = await fs.readFile(runtimeManifest);
  const lockHash = sha256(lockBytes), runtimeHash = sha256(Buffer.concat([manifestBytes, lockBytes]));
  const projectRuntime = path.join(repoRoot, '.cache/tmp/video-shotcraft', `remotion-runtime-${runtimeHash.slice(0, 16)}`);
  const nodeModules = path.join(projectRuntime, 'node_modules');
  const versionPath = path.join(nodeModules, 'remotion/package.json');
  const valid = await fs.readFile(versionPath, 'utf8').then((data) => JSON.parse(data).version === '4.0.484').catch(() => false);
  if (!valid) {
    await fs.mkdir(projectRuntime, {recursive: true});
    await fs.copyFile(runtimeManifest, path.join(projectRuntime, 'package.json'));
    await fs.copyFile(runtimeLock, path.join(projectRuntime, 'package-lock.json'));
    const env = await childEnv(path.join(jobRoot, 'tmp/npm'), path.join(repoRoot, '.cache/tmp/video-shotcraft/npm'));
    await new Promise((resolve, reject) => {
      const child = spawn('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: projectRuntime, env, stdio: 'pipe'});
      let stdout = '', stderr = '';
      child.stdout.on('data', (bytes) => { if (stdout.length < 20000) stdout += bytes; }); child.stderr.on('data', (bytes) => { if (stderr.length < 20000) stderr += bytes; });
      child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`npm ci failed (${code}): ${stderr || stdout}`)));
    });
  }
  return {runtimeRoot: projectRuntime, nodeModules, runtimeHash, lockHash, manifestSha256: sha256(manifestBytes)};
}

async function bundleRuntime(runtime, publicRoot, bundleRoot) {
  await fs.mkdir(bundleRoot, {recursive: true});
  const packagePath = path.join(runtime.runtimeRoot, 'package.json');
  const require = createRequire(packagePath);
  const {bundle} = require('@remotion/bundler');
  const entryPoint = path.join(adapterDir, 'video-shotcraft-entry.tsx');
  const outDir = path.join(bundleRoot, 'bundle');
  const serveUrl = await bundle({
    entryPoint, outDir, publicDir: publicRoot, rootDir: skillDir, enableCaching: false,
    webpackOverride: (config) => {
      config.resolve ||= {};
      config.resolve.modules = [...(config.resolve.modules || []), runtime.nodeModules];
      config.resolve.alias = {...(config.resolve.alias || {}), react: require.resolve('react'), 'react-dom': require.resolve('react-dom')};
      return config;
    },
  });
  return {serveUrl, bundleDir: outDir};
}

async function renderRemotion({runtime, spec, frame = null, outputPath, browser, workRoot}) {
  const require = createRequire(path.join(runtime.runtimeRoot, 'package.json'));
  const {renderMedia, renderStill, selectComposition} = require('@remotion/renderer');
  const publicRoot = path.join(workRoot, 'public');
  await fs.mkdir(publicRoot, {recursive: true});
  const env = await childEnv(path.join(workRoot, 'tmp'), path.join(workRoot, 'cache'));
  const envKeys = ['TMPDIR','TMP','TEMP','XDG_CACHE_HOME','npm_config_cache','REMOTION_CACHE_DIR'];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of envKeys) process.env[key] = env[key];
    const bundled = await bundleRuntime(runtime, publicRoot, workRoot);
    const inputProps = {runtimeSpec: spec};
    const composition = await selectComposition({serveUrl: bundled.serveUrl, id: 'Shotcraft', inputProps, browserExecutable: browser, logLevel: 'error'});
    if (frame != null) {
      await renderStill({serveUrl: bundled.serveUrl, composition, inputProps, frame, output: outputPath, imageFormat: 'png', browserExecutable: browser, logLevel: 'error', overwrite: false});
    } else {
      await renderMedia({serveUrl: bundled.serveUrl, composition, inputProps, outputLocation: outputPath, codec: 'h264', audioCodec: null, muted: true, enforceAudioTrack: false, crf: 17, pixelFormat: 'yuv420p', browserExecutable: browser, logLevel: 'error', overwrite: false});
    }
    return {composition: {id: composition.id, width: composition.width, height: composition.height, fps: composition.fps, durationInFrames: composition.durationInFrames}, bundleDir: bundled.bundleDir};
  } finally {
    for (const key of envKeys) {
      if (previous[key] == null) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
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
  const raw = await fs.readFile(inputPath); const input = JSON.parse(raw.toString('utf8'));
  const publicRoot = path.join(path.dirname(outputPath), `${path.basename(outputPath)}.public`);
  const assetRecords = [];
  const spec = await validateShotcraftSpec(catalog, entry, input, {assetsRoot: path.resolve(assetsRoot || path.dirname(inputPath)), publicRoot, assetRecords});
  const specBytes = Buffer.from(JSON.stringify(spec, null, 2) + '\n');
  await assertFreshOutput(outputPath); await assertFreshOutput(`${outputPath}.assets.json`); await fs.mkdir(path.dirname(outputPath), {recursive: true}); await fs.writeFile(outputPath, specBytes, {flag: 'wx'});
  const receipt = {format: 'laohu.video-shotcraft-prepared-input/1', templateId: entry.id, sourceId, sourceCommit, componentPath: entry.component.path, componentSha256: entry.component.sha256, specSha256: sha256(specBytes), assets: assetRecords.map(({sourcePath, ...asset}) => asset)};
  await fs.writeFile(`${outputPath}.assets.json`, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  return {outputPath, receiptPath: `${outputPath}.assets.json`, receipt};
}

export async function renderShotcraftTemplate({catalog, entry, specPath, outputPath, outputKind, timeSec, assetsRoot, cacheDir, browser, ffmpeg, manifestPath}) {
  const specBytes = await fs.readFile(specPath); const raw = JSON.parse(specBytes.toString('utf8'));
  if (outputKind === 'still' && path.extname(outputPath).toLowerCase() !== '.png') fail('Shotcraft still output must be a .png');
  if (outputKind !== 'still' && path.extname(outputPath).toLowerCase() !== '.mp4') fail('Shotcraft video output must be an .mp4');
  const resolvedAssetsRoot = path.resolve(assetsRoot || path.dirname(specPath));
  const jobRoot = path.resolve(cacheDir || path.join(repoRoot, '.cache/tmp/video-shotcraft', `render-${entry.id}-${process.pid}-${Date.now()}`));
  await fs.mkdir(jobRoot, {recursive: true});
  const publicRoot = path.join(jobRoot, 'public'); await fs.mkdir(publicRoot, {recursive: true});
  const assetRecords = [];
  const spec = await validateShotcraftSpec(catalog, entry, raw, {assetsRoot: resolvedAssetsRoot, publicRoot, assetRecords});
  assetRecords.length = 0;
  const runtimeSpec = deepClone(spec);
  await stageLocalAssets(runtimeSpec.layers, resolvedAssetsRoot, publicRoot, assetRecords, ffmpeg);
  const source = await verifySourceAndEntry(catalog, entry);
  await assertFreshOutput(outputPath); await fs.mkdir(path.dirname(outputPath), {recursive: true});
  const runtime = await ensureRuntime(jobRoot);
  const receiptPath = manifestPath ? path.resolve(manifestPath) : `${outputPath}.manifest.json`;
  await fs.mkdir(path.dirname(receiptPath), {recursive:true}); await assertFreshOutput(receiptPath);
  await assertSameVolume([path.dirname(specPath), path.dirname(outputPath), path.dirname(receiptPath), resolvedAssetsRoot, jobRoot, runtime.runtimeRoot, SOURCE_ROOT]);
  const frame = outputKind === 'still' ? finite(timeSec ?? raw.timeSec ?? 0, 'timeSec', {min: 0}) * spec.fps : null;
  if (frame != null && (!Number.isInteger(Math.round(frame)) || Math.round(frame) < 0 || Math.round(frame) >= spec.durationInFrames)) fail('preview time must resolve to a valid source frame');
  const rendered = await renderRemotion({runtime, spec: {...runtimeSpec, kind: 'single'}, frame: frame == null ? null : Math.round(frame), outputPath, browser, workRoot: jobRoot});
  const probe = outputKind === 'still' ? null : await ffprobeVideo(outputPath, ffmpeg);
  if (probe && (probe.frameCount !== spec.durationInFrames || probe.width !== spec.width || probe.height !== spec.height || !closeTo(probe.fps, spec.fps, 1e-6))) fail('Shotcraft clip probe differs from the declared frame clock/format');
  const output = await shaFile(outputPath);
  const manifest = {format: 'laohu.video-shotcraft-render-manifest/1', templateId: entry.id, source, fidelityMode: spec.fidelityMode, propsConsumed: spec.layers.map(consumedLayerRecord), assets: assetRecords.map(({sourcePath, ...row}) => row), runtime: {version: '4.0.484', packageLockSha256: runtime.lockHash, bundleDir: path.relative(jobRoot, rendered.bundleDir)}, render: {width: spec.width, height: spec.height, fps: spec.fps, durationInFrames: spec.durationInFrames, probe}, output: {path: outputPath, ...output}, workRoot: jobRoot};
  await fs.writeFile(receiptPath, JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
  return {outputPath, manifestPath: receiptPath, manifest, frameCount: spec.durationInFrames};
}

async function stageLocalAssets(layers, assetsRoot, publicRoot, records, ffmpeg) {
  for (const layer of layers) {
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
    if (layer.catalogId !== 'video-shotcraft-clip-card') continue;
    const props = layer.props;
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

async function renderLocalBaseSegments(schedule, blueprintPath, jobRoot, {browser, ffmpeg} = {}) {
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
    const localSegment = raw.renderer === 'motion-scene'
      ? {
          id: row.id, renderer: raw.renderer,
          scenePath: row.baseSource.scenePath, sceneSha256: row.baseSource.sceneSha256,
          ...(row.baseSource.drawModule ? {drawModulePath: row.baseSource.drawModule.path, drawModuleSha256: row.baseSource.drawModule.sha256} : {}),
          ...(raw.templateEffects ? {templateEffects: raw.templateEffects} : {}),
          startSec: 0, endSec: row.localDurationSec,
        }
      : {
          id: row.id, renderer: raw.renderer, templateId: raw.templateId,
          variables: {...(raw.variables || {}), duration: row.localDurationSec},
          ...(raw.eventScenePath ? {eventScenePath: path.resolve(path.dirname(blueprintPath), raw.eventScenePath), eventSceneSha256: raw.eventSceneSha256} : {}),
          startSec: 0, endSec: row.localDurationSec,
        };
    const localBlueprint = {format: NATIVE_OM_FILM_FORMAT, width: 1920, height: 1080, fps: 30, clock: {kind: 'film-global', durationSec: row.localDurationSec}, segments: [localSegment]};
    await fs.mkdir(localRoot, {recursive:true});
    await fs.writeFile(localBlueprintPath, JSON.stringify(localBlueprint, null, 2) + '\n', {flag:'wx'});
    const env = await childEnv(path.join(localRoot, 'tmp'), path.join(repoRoot, '.cache/tmp/video-shotcraft/npm'));
    const motionNodeModules = path.join(repoRoot, '.cache/tmp/video-shotcraft/motion-renderer-runtime/node_modules');
    env.NODE_PATH = [motionNodeModules, env.NODE_PATH].filter(Boolean).join(path.delimiter);
    const args = [cli, 'render', '--film-blueprint', localBlueprintPath, '--output', localOutput, '--work-root', localWorkRoot, '--manifest', localManifestPath, '--ffmpeg', path.resolve(ffmpegExe)];
    if (browser) args.push('--browser', path.resolve(browser));
    const child = await run(process.execPath, args, {cwd: skillDir, env});
    const receipt = JSON.parse(await fs.readFile(localManifestPath, 'utf8'));
    if (receipt.format !== 'laohu.huashu-om-film-manifest/1' || receipt.render?.frameCount !== row.frameCount) fail(`${row.id} local renderer receipt is missing or disagrees with the shared frame clock`);
    const media = await ffprobeVideo(localOutput, ffmpegExe);
    if (media.width !== 1920 || media.height !== 1080 || !closeTo(media.fps, 30, 1e-6) || media.frameCount !== row.frameCount || media.audioStreams !== 0 || media.codec !== 'h264') fail(`${row.id} local picture-only segment must be H.264 1920×1080@30 with exactly ${row.frameCount} frames and no audio`);
    const outputHash = await shaFile(localOutput);
    if (receipt.output?.sha256 !== outputHash.sha256) fail(`${row.id} local renderer output hash disagrees with its receipt`);
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
      renderer: raw.renderer,
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
    let segmentId = event.source.segmentId || null;
    let phase = event.phaseId ? phaseById.get(event.phaseId) : null;
    if (event.phaseId && !phase) fail(`canonical event ${eventId} references a missing phase`);
    if (phase?.segmentId) segmentId ||= phase.segmentId;
    if (!segmentId && event.timeBasis === 'film-global') segmentId = schedule.rows.find((row) => event.timeSec >= row.startSec - 1e-8 && event.timeSec <= row.endSec + 1e-8)?.id;
    if (!segmentId || !schedule.rows.some((row) => row.id === segmentId)) fail(`event ${eventId} must resolve to one segment for verified source ownership`);
    if (event.timeBasis === 'scene-local') {
      if (!phase || phase.segmentId !== segmentId || phase.timeBasis !== 'scene-local') fail(`scene-local event ${eventId} requires one scene-local phase carrying its segmentId`);
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

async function assertSameVolume(paths) { const devices = await Promise.all(paths.map(async (file) => ({file, dev:(await fs.stat(file)).dev}))); for (const row of devices) if (row.dev !== devices[0].dev) fail(`all source, temp, runtime, and output paths must stay on one filesystem: ${row.file}`); }
async function run(command, args, options = {}) { return new Promise((resolve, reject) => { const child = spawn(command,args,{cwd:options.cwd,env:options.env,stdio:'pipe'}); let stdout='',stderr=''; child.stdout.on('data',(b)=>{if(stdout.length<65536) stdout+=b}); child.stderr.on('data',(b)=>{if(stderr.length<65536) stderr+=b}); child.on('error',reject); child.on('close',(code)=>code===0?resolve({stdout,stderr}):reject(new Error(`${command} failed (${code}): ${stderr||stdout}`))); }); }

export async function renderFilm({blueprintPath, outputPath, workRoot, manifestPath, browser, ffmpeg} = {}) {
  if (![blueprintPath,outputPath,workRoot,manifestPath].every((file)=>typeof file==='string' && path.isAbsolute(file))) fail('renderFilm/2 requires absolute blueprint, output, workRoot, and manifest paths');
  if (outputPath === manifestPath) fail('film output and manifest must differ');
  if (path.extname(outputPath).toLowerCase() !== '.mp4') fail('renderFilm/2 picture output must be .mp4');
  const allowedWorkRoot=path.resolve(repoRoot,'.cache/tmp/video-shotcraft');
  if (!isWithin(allowedWorkRoot,path.resolve(workRoot))) fail(`renderFilm/2 workRoot must stay below ${allowedWorkRoot}`);
  await fs.mkdir(workRoot,{recursive:true}); await fs.mkdir(path.dirname(outputPath),{recursive:true}); await fs.mkdir(path.dirname(manifestPath),{recursive:true});
  await assertFreshOutput(outputPath); await assertFreshOutput(manifestPath);
  const catalog=await loadCatalog(); const blueprintBytes=await fs.readFile(blueprintPath); const blueprint=JSON.parse(blueprintBytes.toString('utf8'));
  const schedule=await compileFilmV2(blueprint,blueprintPath,catalog);
  const jobRoot=path.join(workRoot,`video-shotcraft-${sha256(blueprintBytes).slice(0,12)}-${process.pid}-${Date.now()}`); await fs.mkdir(jobRoot,{recursive:false});
  const localInputs = schedule.rows.flatMap((row) => row.baseSource ? [row.baseSource.scenePath, row.baseSource.drawModule?.path].filter(Boolean) : []);
  await assertSameVolume([path.dirname(blueprintPath), path.dirname(outputPath), path.dirname(manifestPath), jobRoot, SOURCE_ROOT, path.join(repoRoot,'.cache/tmp/video-shotcraft'), ...localInputs]);
  await fs.mkdir(path.join(jobRoot,'public'),{recursive:true});
  const scene=await readFilmScene(schedule); const projected=validateCompositionScene(scene,schedule);
  const assets=await stageFilmAssets(schedule,jobRoot,ffmpeg);
  const localBaseSegments=await renderLocalBaseSegments(schedule,blueprintPath,jobRoot,{browser,ffmpeg});
  const runtime=await ensureRuntime(jobRoot);
  await assertSameVolume([path.dirname(blueprintPath), path.dirname(outputPath), path.dirname(manifestPath), jobRoot, runtime.runtimeRoot, SOURCE_ROOT]);
  const runtimeSegments=schedule.rows.map((row)=>({id:row.id,frameRange:row.frameRange,layers:row.layers,...(localBaseSegments.has(row.id)?{baseVideo:{src:localBaseSegments.get(row.id).src}}:{})}));
  const spec={kind:'film',width:1920,height:1080,fps:30,durationInFrames:schedule.totalFrameCount,segments:runtimeSegments,transitionEdges:schedule.transitionEdges};
  const rendered=await renderRemotion({runtime,spec,outputPath,frame:null,browser,workRoot:jobRoot});
  const probe=await ffprobeVideo(outputPath,ffmpeg);
  if(probe.width!==1920||probe.height!==1080||!closeTo(probe.fps,30,1e-6)||probe.frameCount!==schedule.totalFrameCount||probe.audioStreams!==0) fail('Remotion/ffprobe output does not match v2 frame count or picture-only constraint');
  const output=await shaFile(outputPath);
  const manifestScenePath=scene?.absolutePath || null;
  const manifest={
    format:FILM_MANIFEST_FORMAT,
    source:{blueprintPath:path.relative(path.dirname(manifestPath),blueprintPath),blueprintSha256:sha256(blueprintBytes),clockKind:schedule.clock.clockKind,
      ...(schedule.clock.timelinePath?{timelinePath:path.relative(path.dirname(manifestPath),schedule.clock.timelinePath),timelineSha256:schedule.clock.timelineSha256,editPlanPath:path.relative(path.dirname(manifestPath),schedule.clock.editPlanPath),editPlanSha256:schedule.clock.editPlanSha256}:{}),
      sourceId,sourceCommit,renderer:'@remotion/renderer 4.0.484'},
    output:{path:path.relative(path.dirname(manifestPath),outputPath),sha256:output.sha256,kind:'picture-only-remotion-v2'},
    render:{width:1920,height:1080,fps:30,frameCount:schedule.totalFrameCount,durationSec:schedule.durationSec,probe},
    frameClock:{kind:schedule.clock.clockKind,method:'absolute-ceil-boundaries',fps:30,totalFrameCount:schedule.totalFrameCount},
    segments:schedule.rows.map((row)=>{
      const local=localBaseSegments.get(row.id);
      return {id:row.id,renderer:row.segment.renderer,sourceCatalogId:row.sourceEntry?.id||null,componentPath:row.sourceEntry?.component.path||null,componentSha256:row.sourceEntry?.component.sha256||null,exportName:row.sourceEntry?.component.exportName||null,sourceCommit:row.sourceEntry?sourceCommit:null,fidelityMode:row.segment.fidelityMode||(row.baseSource?'exact-source-plus-local-overlays':null),frameRange:row.frameRange,sourceRange:row.sourceRange,sourceDurationFrames:row.segment.sourceDurationFrames||null,expectedFrameCount:row.frameCount,observedFrameCount:row.frameCount,layers:row.layers.map(consumedLayerRecord),baseSource:row.baseSource?{sourcePath:row.baseSource.scenePath?relativeToBlueprint(blueprintPath,row.baseSource.scenePath):row.baseSource.templateSourcePath,sourceSha256:row.baseSource.sceneSha256||row.baseSource.templateSourceSha256,renderedOutputPath:local?path.relative(path.dirname(manifestPath),local.outputPath):null,renderedOutputSha256:local?.outputSha256||null,rendererReceiptPath:local?path.relative(path.dirname(manifestPath),local.receiptPath):null,rendererReceiptSha256:local?.receiptSha256||null,stagedPublicPath:local?.stagedPath||null,stagedSha256:local?.stagedSha256||null,probe:local?.probe||null}:null,actionBindings:row.actionBindings};
    }),
    compositionGroups:schedule.groups,
    transitionEdges:schedule.transitionEdges,
    assets:[...assets,...[...localBaseSegments.entries()].map(([segmentId,row])=>({segmentId,role:'pre-rendered-local-picture-segment',path:row.stagedPath,sha256:row.stagedSha256,sourcePath:row.sourcePath,sourceSha256:row.sourceSha256,renderer:row.renderer,receiptPath:path.relative(path.dirname(manifestPath),row.receiptPath),receiptSha256:row.receiptSha256,probe:row.probe}))],
    ...(scene?{audioEventScene:{path:path.relative(path.dirname(manifestPath),scene.absolutePath),sha256:scene.sha256,format:MOTION_SCENE_FORMAT}}:{}),
    audioTimeMaps:projected.maps,
    audioEventBindings:projected.bindings,
    sourceScenes:projected.sourceScenes.map((row)=>({...row,path:path.relative(path.dirname(manifestPath),manifestScenePath)})),
    sourceActionBindings:projected.actionBindings,
    runtime:{version:'4.0.484',packageLockSha256:runtime.lockHash,bundleDir:path.relative(jobRoot,rendered.bundleDir),workRoot:jobRoot},
    assembly:{method:'single-remotion-composition-with-picture-only-local-base-segments',transitionEdges:schedule.transitionEdges.map((row)=>({id:row.id,mechanism:row.transitionMechanism,window:{startFrame:row.startFrame,durationInFrames:row.durationInFrames},peakFrame:row.peakFrame})),audioStream:'absent',audioMixOwner:'scripts/audio.mjs (invoke once after picture render)'},
  };
  if (scene) for(const row of manifest.audioEventBindings) {row.sourceScenePath=manifest.audioEventScene.path;row.sourceSceneSha256=manifest.audioEventScene.sha256;}
  await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return {outputPath,manifestPath,manifestSha256:sha256(Buffer.from(JSON.stringify(manifest,null,2)+'\n')),frameCount:schedule.totalFrameCount,durationSec:schedule.durationSec,segments:schedule.rows.length,workRoot:jobRoot};
}

export const __test = {compileFilmV2, frameBoundary, resolvePoint, validateNode, validatePlacement, validateShotcraftSpec, validateCompositionScene, validateDerivedPatch, transformGalleryCopySource, verifyDerivedPatchProvider};
