import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {captionSourceDeclaration, compileBriefTypefaces, hasBriefTypefaces} from './brief-typefaces.mjs';
import {SCREEN_TEXT_MAP_FORMAT} from './screen-text-contract.mjs';
import {localFile} from '../templates/runtime/laohu-showreel/scripts/lib/editor-model.mjs';
import {CAPTION_MANIFEST_FORMAT_V2, captionManifestToSrt} from '../../laohu-asrcut/scripts/caption-manifest.mjs';
import {SRT_CAPTION_MANIFEST_FORMAT} from '../templates/runtime/native-presentation/captions.mjs';

export const SCREEN_TEXT_HEADERS = ['ID', '精确原文', '材料 / cue', '方向 · 画面 · 出现起止 · 完整可读起止', '对象 · 作用 · 空间 / 动态关系', '必显'];

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

const escRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stableJson = value => JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
  ? Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]])) : row);
const languageTag = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;

function extractBlock(text, name) {
  const open = new RegExp(`^<${escRegex(name)}>\\s*$`, 'gm');
  const close = new RegExp(`^</${escRegex(name)}>\\s*$`, 'gm');
  const opens = [...text.matchAll(open)], closes = [...text.matchAll(close)];
  if (opens.length !== 1 || closes.length !== 1 || closes[0].index < opens[0].index) {
    fail('brief-xml-block-invalid', `brief.md needs exactly one <${name}>...</${name}> block in the original eight-block XML`);
  }
  return text.slice(opens[0].index + opens[0][0].length, closes[0].index);
}

function decodeCell(value) {
  return value
    .replace(/\\\|/g, '|')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function splitTableRow(line) {
  const source = line.trim();
  if (!source.startsWith('|') || !source.endsWith('|')) return null;
  const cells = [];
  let current = '', escaped = false;
  for (const char of source.slice(1, -1)) {
    if (escaped) { current += `\\${char}`; escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '|') { cells.push(decodeCell(current.trim())); current = ''; continue; }
    current += char;
  }
  if (escaped) current += '\\';
  cells.push(decodeCell(current.trim()));
  return cells;
}

function readRange(text, label, allowNone = false) {
  if (allowNone && /^(?:无|—|-)$/u.test(text.trim())) return null;
  const match = /^(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*秒?$/u.exec(text.trim());
  if (!match) fail('brief-text-time-invalid', `${label} must be an absolute seconds range such as 0.000–2.520 秒`);
  const start = Number(match[1]), end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) fail('brief-text-time-invalid', `${label} has an invalid or empty time range`);
  return {start, end};
}

function parseFrameCell(value, id) {
  const parts = value.split('·').map(part => part.trim());
  if (parts.length !== 4 || !parts[0] || parts[0].length > 32 || /[<>|\r\n]/u.test(parts[0])) {
    fail('brief-text-scope-invalid', `${id}: use 方向 · 画面 · 出现起止 · 完整可读起止`);
  }
  const appearance = /^出现\s+(.+)$/u.exec(parts[2]);
  const readable = /^完整可读\s+(.+)$/u.exec(parts[3]);
  if (!appearance || !readable) fail('brief-text-scope-invalid', `${id}: label the appearance and complete-reading intervals in Chinese`);
  const visible = readRange(appearance[1], `${id} appearance interval`);
  const read = readRange(readable[1], `${id} complete-reading interval`, true);
  if (read && (read.start < visible.start || read.end > visible.end)) fail('brief-text-scope-invalid', `${id}: complete-reading interval must sit inside the appearance interval`);
  return {direction: parts[0], scene: parts[1], visibleStart: visible.start, visibleEnd: visible.end,
    readableStart: read?.start ?? null, readableEnd: read?.end ?? null};
}

function parseObjectCell(value, id) {
  const parts = value.split('｜').map(part => part.trim());
  if (parts.length !== 3 || parts.some(part => !part)) {
    fail('brief-text-relation-invalid', `${id}: use 对象｜作用｜空间与动态关系，with all three cells filled in`);
  }
  return {object: parts[0], role: parts[1], relation: parts[2]};
}

function parseSourceCell(value, id) {
  if (!value) fail('brief-text-source-required', `${id}: add a source/material anchor`);
  const caption = /^字幕\s+([^/｜]+?)\s*[/｜]\s*([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)\s*[/｜]\s*(.+)$/u.exec(value);
  if (caption) {
    const [, cueId, language, provenance] = caption.map(part => part?.trim());
    const expected = `cue:${cueId}:${language}`;
    if (id !== expected) fail('brief-caption-id-invalid', `${id}: caption IDs must bind to their real cue and language as ${expected}`);
    return {source: value, caption: true, cueId, language, provenance, imageText: false, assetPath: null};
  }
  const imageText = /^(?:外部图片字|截图中文字|录屏中文字)\s*｜\s*([^｜]+)\s*｜\s*(.+)$/u.exec(value);
  if (imageText) return {source: value, caption: false, cueId: null, language: null, provenance: imageText[2].trim(), imageText: true, assetPath: imageText[1].trim()};
  return {source: value, caption: false, cueId: null, language: null, provenance: value, imageText: false, assetPath: null};
}

export function parseBriefTextRegistry(briefText) {
  if (typeof briefText !== 'string' || !briefText.trim()) fail('brief-missing', 'project brief.md is missing or empty');
  const blocks = [...briefText.matchAll(/^<(role|inputs|confirmations|direction|structure|build|gotchas|start)>\s*$/gm)].map(match => match[1]);
  if (blocks.join('|') !== 'role|inputs|confirmations|direction|structure|build|gotchas|start') {
    fail('brief-eight-block-contract', 'brief.md must contain the original eight XML blocks once each, in order');
  }
  const structure = extractBlock(briefText, 'structure');
  const openMarkers = [...structure.matchAll(/^<screen-text-registry>\s*$/gm)];
  const closeMarkers = [...structure.matchAll(/^<\/screen-text-registry>\s*$/gm)];
  if (!openMarkers.length && !closeMarkers.length && captionSourceDeclaration.test(briefText)) return [];
  if (openMarkers.length !== 1 || closeMarkers.length !== 1 || closeMarkers[0].index < openMarkers[0].index) {
    fail('brief-text-registry-missing', 'add one <screen-text-registry> around the human-readable Markdown table inside <structure>');
  }
  const registry = structure.slice(openMarkers[0].index + openMarkers[0][0].length, closeMarkers[0].index);
  const lines = registry.split(/\r?\n/u).filter(line => line.trim().startsWith('|'));
  if (lines.length === 0) return [];
  if (lines.length < 2) fail('brief-text-table-missing', 'screen-text-registry must contain a Markdown header and separator when it has entries');
  const header = splitTableRow(lines[0]);
  if (header.length !== SCREEN_TEXT_HEADERS.length || header.some((cell, index) => cell !== SCREEN_TEXT_HEADERS[index])) {
    fail('brief-text-table-header-invalid', `screen text table headers must be: ${SCREEN_TEXT_HEADERS.join(' | ')}`);
  }
  if (!splitTableRow(lines[1]).every(cell => /^:?-{3,}:?$/u.test(cell))) fail('brief-text-table-separator-invalid', 'screen text table needs a Markdown separator row');
  const entries = [];
  const ids = new Set();
  for (const [rowIndex, line] of lines.slice(2).entries()) {
    const row = splitTableRow(line);
    if (row.length !== SCREEN_TEXT_HEADERS.length) fail('brief-text-table-row-invalid', `text table row ${rowIndex + 3} has ${row.length} cells; expected ${SCREEN_TEXT_HEADERS.length}`);
    const [id, exact, sourceCell, frameCell, objectCell, requiredCell] = row;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u.test(id)) fail('brief-text-id-invalid', `invalid screen text ID ${id || '(empty)'}`);
    if (ids.has(id)) fail('brief-text-id-duplicate', `screen text ID ${id} appears more than once`);
    ids.add(id);
    if (!exact || exact !== exact.trim()) fail('brief-text-exact-required', `${id}: exact wording must be a non-empty cell without edge whitespace`);
    if (/[\r\n]/u.test(exact)) fail('brief-text-exact-multiline', `${id}: encode a displayed line break as \\n inside the table cell`);
    const exactText = exact.replace(/\\n/gu, '\n');
    if (!exactText.trim()) fail('brief-text-exact-required', `${id}: exact wording must contain visible text`);
    const scope = parseFrameCell(frameCell, id), object = parseObjectCell(objectCell, id), source = parseSourceCell(sourceCell, id);
    if (!['必显', '可选'].includes(requiredCell)) fail('brief-text-required-value-invalid', `${id}: required column must be 必显 or 可选`);
    entries.push({id, exact: exactText, ...source, ...scope, ...object, mustDisplay: requiredCell === '必显'});
  }
  return entries;
}

function compileSrtCaptionManifest(text, source) {
  const stamp = '(\\d{2,}):([0-5]\\d):([0-5]\\d)[,.](\\d{3})';
  const timing = new RegExp(`^\\s*${stamp}\\s+-->\\s+${stamp}\\s*$`, 'u');
  const milliseconds = ([h, m, s, ms]) => ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(ms);
  const blocks = text.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').replace(/\n+$/u, '').split(/\n[\t ]*\n+/u);
  const ids = new Set();
  let previousEnd = 0;
  const cues = blocks.map((block, index) => {
    const [id, timestamp, ...displayLines] = block.split('\n');
    const match = timing.exec(timestamp ?? '');
    if (!/^\d{1,55}$/u.test(id) || ids.has(id) || !match || displayLines.length !== source.displayLanguages.length
      || displayLines.some(line => !line.trim() || /<\/?[a-z][^>]*>/iu.test(line))) {
      fail('brief-caption-srt-invalid', `${source.path}: SRT cue ${index + 1} must have a unique numeric ID, a time line, and one plain-text line per declared language`);
    }
    const startSample = milliseconds(match.slice(1, 5)), endSample = milliseconds(match.slice(5, 9));
    if (!Number.isSafeInteger(startSample) || !Number.isSafeInteger(endSample) || endSample <= startSample || startSample < previousEnd) {
      fail('brief-caption-srt-window', `${source.path}#${id}: SRT display windows must be positive, ordered, and non-overlapping`);
    }
    ids.add(id);
    previousEnd = endSample;
    const lines = [displayLines[source.displayLanguages.indexOf(source.sourceLanguage)]];
    return {id, lines, displayWindow: {startSample, endSample},
      translations: source.displayLanguages.flatMap((language, line) => language === source.sourceLanguage ? [] : [{
        language, lines: [displayLines[line]], sourceCueId: id, sourceTextSha256: sha256(stableJson(lines)),
      }])};
  });
  const manifest = {format: SRT_CAPTION_MANIFEST_FORMAT, source: {path: source.path, sha256: source.sha256},
    sourceClock: {sampleRateHz: 1000, unit: 'millisecond'}, sourceLanguage: source.sourceLanguage,
    displayLanguages: source.displayLanguages, cues};
  return {...manifest, integrity: {manifestSha256: sha256(stableJson(manifest))}};
}

export function readBriefCaptionSource(briefText, projectRoot) {
  if (!captionSourceDeclaration.test(briefText)) return null;
  const lines = extractBlock(briefText, 'inputs').split(/\r?\n/u).filter(line => captionSourceDeclaration.test(line));
  if (lines.length !== 1 || briefText.split(/\r?\n/u).filter(line => captionSourceDeclaration.test(line)).length !== 1) {
    fail('brief-caption-source-duplicate', 'Declare one caption-source inside <inputs>.');
  }
  const fields = lines[0].replace(captionSourceDeclaration, '').split('|').map(field => field.trim());
  const [kind, relative, digest, language, order] = fields;
  const sourceSha256 = /^sha256=([a-f0-9]{64})$/u.exec(digest ?? '')?.[1];
  const sourceLanguage = /^source=(.+)$/u.exec(language ?? '')?.[1];
  const displayLanguages = /^display=(.+)$/u.exec(order ?? '')?.[1]?.split(',').map(tag => tag.trim());
  const manifestFile = kind === 'caption-manifest/2' && fields.length === 3 && /\.json$/iu.test(relative ?? '');
  const srtFile = kind === 'srt' && fields.length === 5 && /\.srt$/iu.test(relative ?? '')
    && languageTag.test(sourceLanguage ?? '') && displayLanguages?.includes(sourceLanguage) && displayLanguages.length <= 4
    && displayLanguages.every(tag => languageTag.test(tag)) && new Set(displayLanguages).size === displayLanguages.length;
  if (!(manifestFile || srtFile) || !sourceSha256 || !relative || relative.split('/').some(part => !part || part === '.') || /^(?:[A-Za-z][A-Za-z\d+.-]*:)/u.test(relative)) {
    fail('brief-caption-source-invalid', 'Use caption-source: caption-manifest/2 | project/path.json | sha256=<64 hex> or caption-source: srt | project/path.srt | sha256=<64 hex> | source=zh-CN | display=zh-CN,en inside <inputs>.');
  }
  if (!projectRoot) fail('brief-caption-project-required', 'A project root is required to verify the declared caption-source.');
  let bytes;
  try { bytes = fs.readFileSync(localFile(projectRoot, relative)); }
  catch (error) { fail('brief-caption-source-unreadable', `Cannot read project caption-source ${relative}: ${error.message}`); }
  if (sha256(bytes) !== sourceSha256) fail('stale-brief-caption-source', `${relative}: caption-source file SHA-256 differs from <inputs>; verify this revision before updating the Brief.`);
  const source = {kind, path: relative, sha256: sourceSha256};
  let utf8;
  try { utf8 = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  catch { fail('brief-caption-source-invalid', `${relative}: caption-source must be valid UTF-8.`); }
  if (srtFile) return {...source, manifest: compileSrtCaptionManifest(utf8, {...source, sourceLanguage, displayLanguages})};
  try {
    const manifest = JSON.parse(utf8);
    if (manifest.format !== CAPTION_MANIFEST_FORMAT_V2 || !manifest.cues?.length || !manifest.displayLanguages?.length
      || !languageTag.test(manifest.sourceLanguage ?? '') || !manifest.displayLanguages.every(tag => languageTag.test(tag))
      || new Set(manifest.displayLanguages).size !== manifest.displayLanguages.length) fail('brief-caption-manifest-invalid', `Expected a complete ${CAPTION_MANIFEST_FORMAT_V2} with explicit displayed languages.`);
    captionManifestToSrt(manifest); // Verify the ASRcut manifest hash and each source-translation identity.
    return {...source, manifest};
  } catch (error) { fail('brief-caption-manifest-invalid', `${relative}: ${error.message}`); }
}

export function captionSourceCues(source) {
  const {manifest} = source;
  const rate = manifest.sourceClock?.sampleRateHz;
  const ids = new Set();
  let previousEnd = 0;
  return manifest.cues.map(cue => {
    const {startSample, endSample} = cue.displayWindow ?? {};
    if (typeof cue.id !== 'string' || !cue.id.trim() || /[\r\n]/u.test(cue.id) || ids.has(cue.id)
      || !Number.isSafeInteger(rate) || rate <= 0 || !Number.isSafeInteger(startSample) || !Number.isSafeInteger(endSample)
      || startSample < previousEnd || endSample <= startSample) {
      fail('brief-caption-manifest-invalid', `${source.path}: missing or duplicate cue identity, or invalid display window at ${cue.id ?? '(unknown cue)'}`);
    }
    ids.add(cue.id);
    previousEnd = endSample;
    const rows = manifest.displayLanguages.map(language => {
      const lines = language === manifest.sourceLanguage ? cue.lines : cue.translations?.find(row => row.language === language)?.lines;
      if (!Array.isArray(lines) || !lines.length || !lines.every(line => typeof line === 'string' && line.trim() && !/[\r\n]/u.test(line))) {
        fail('brief-caption-manifest-invalid', `${source.path}#${cue.id}: invalid ${language} display lines`);
      }
      return {language, lines};
    });
    return {id: cue.id, t0: startSample / rate, t1: endSample / rate, text: rows.flatMap(row => row.lines).join('\n'), rows};
  });
}

export function compileBriefTextMap(briefText, {projectRoot} = {}) {
  const entries = parseBriefTextRegistry(briefText);
  const briefSha256 = sha256(briefText);
  const map = {format: SCREEN_TEXT_MAP_FORMAT, sourceFile: 'brief.md', briefSha256, generated: true, entries};
  const captionSource = readBriefCaptionSource(briefText, projectRoot);
  if (captionSource) {
    if (entries.some(entry => entry.caption)) fail('brief-caption-source-conflict', 'Remove the inline caption rows: one caption-source already declares the native subtitle track.');
    const explicitIds = new Set(entries.map(entry => entry.id));
    for (const cue of captionSourceCues(captionSource)) {
      for (const {language, lines} of cue.rows) {
        const id = `cue:${cue.id}:${language}`;
        if (explicitIds.has(id)) fail('brief-caption-id-conflict', `${id}: reserved for the declared caption-source.`);
        const provenance = `${captionSource.path}#${cue.id}`;
        entries.push({id, exact: lines.join('\n'), source: `字幕 ${cue.id} / ${language} / ${provenance}`, caption: true,
          cueId: cue.id, language, provenance, imageText: false, assetPath: null, direction: '共用', scene: '原生字幕轨',
          visibleStart: cue.t0, visibleEnd: cue.t1, readableStart: cue.t0, readableEnd: cue.t1,
          object: `字幕:${language}`, role: '字幕', relation: '固定字幕安全区', mustDisplay: true});
      }
    }
    map.captionSource = captionSource;
  }
  if (hasBriefTypefaces(briefText)) {
    Object.assign(map, compileBriefTypefaces(briefText, extractBlock(briefText, 'direction'), extractBlock(briefText, 'structure'), entries));
  }
  return map;
}

export function scanProjectTextBindings(sourceFiles, map, {direction, start = 0, end = Infinity, points} = {}) {
  const entries = new Map(map.entries.map(entry => [entry.id, entry]));
  const used = new Set();
  const problems = [];
  if (map.entries.length && direction && !map.entries.some(entry => entry.direction === direction || entry.direction === '共用')) {
    problems.push(`selected direction ${direction} has no registered text instances`);
  }
  const methods = new Set(['canvas', 'dom', 'svg', 'texture', 'glyphPath', 'caption', 'externalImage', 'assertExact']);
  const splitArguments = (text, openIndex) => {
    const args = [];
    let start = openIndex + 1, depth = 1, quote = '', escaped = false;
    for (let index = openIndex + 1; index < text.length; index++) {
      const char = text[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
      if (char === '(' || char === '[' || char === '{') { depth++; continue; }
      if (char === ')' || char === ']' || char === '}') {
        depth--;
        if (depth === 0) { args.push(text.slice(start, index).trim()); return {args, end: index}; }
        continue;
      }
      if (char === ',' && depth === 1) { args.push(text.slice(start, index).trim()); start = index + 1; }
    }
    return null;
  };
  const parseHelper = expression => {
    const match = /^screenText\.(canvas|dom|svg|texture|glyphPath|caption|externalImage|assertExact)\s*\(/u.exec(expression);
    if (!match || !methods.has(match[1])) return null;
    const open = expression.indexOf('(', match[0].length - 1);
    const call = splitArguments(expression, open);
    if (!call) return null;
    const idArg = match[1] === 'assertExact' ? call.args[0] : call.args[1];
    const id = /^(['"])([^'"]+)\1$/u.exec(idArg || '')?.[2];
    return {method: match[1], id: id ?? null, dynamicId: !id};
  };
  for (const source of sourceFiles) {
    const text = typeof source.content === 'string' ? source.content : '';
    const bindingPattern = /screenText\.(canvas|dom|svg|texture|glyphPath|caption|externalImage|assertExact)\s*\(/gu;
    for (const call of text.matchAll(bindingPattern)) {
      const parsed = parseHelper(text.slice(call.index));
      const id = parsed?.id;
      if (!parsed) { problems.push(`${source.path}: screenText call has an invalid or unclosed argument list`); continue; }
      if (!id) continue; // Stable lookup maps and loops are checked against each actual runtime call.
      if (!entries.has(id)) { problems.push(`${source.path}: unknown brief screen-text ID ${id}`); continue; }
      used.add(id);
    }
    // A raw Canvas number or string is still text, including when drawn through an imported helper.
    const textLiteral = /^(?:"(?:[^"\\]|\\[\s\S])+"|'(?:[^'\\]|\\[\s\S])+'|`(?:[^`\\]|\\[\s\S])+`|[-+]?(?:\d+\.?\d*|\.\d+))$/u;
    const visibleCalls = /\.(fillText|strokeText)\s*\(/gu;
    for (const call of text.matchAll(visibleCalls)) {
      const first = splitArguments(text, call.index + call[0].length - 1)?.args[0];
      if (first && textLiteral.test(first)) problems.push(`${source.path}: literal text passed to ${call[1]} bypasses the brief ID consumer`);
    }
    if (!source.rendererEntrypoint) continue;
    const domWrites = /\.(textContent|innerText)\s*=\s*([^;\r\n]+)/gu;
    for (const write of text.matchAll(domWrites)) {
      if (textLiteral.test(write[2].trim())) problems.push(`${source.path}: literal text assigned to ${write[1]} bypasses the brief ID consumer`);
    }
    const geometryLiterals = /new\s+TextGeometry\s*\(\s*(['"`])[^'"`]*\1/gu;
    if (geometryLiterals.test(text)) problems.push(`${source.path}: literal Three.js text geometry bypasses the brief ID consumer`);
  }
  const runtimeRequired = map.entries.filter(entry => entry.mustDisplay && (!direction || entry.direction === '共用' || entry.direction === direction)
    && (points ? points.some(time => entry.visibleStart <= time && time < entry.visibleEnd) : entry.visibleStart < end && entry.visibleEnd > start)).map(entry => entry.id);
  return {status: problems.length ? 'FAIL' : 'OBSERVE_RUNTIME_COVERAGE_REQUIRED', evidence: 'renderer-entry static scan only; no pixel/OCR claim',
    usedLiteralIds: [...used], runtimeRequired, problems,
    externalImageText: map.entries.filter(entry => entry.imageText).map(entry => ({id: entry.id, assetPath: entry.assetPath, status: 'OBSERVE_IMAGE_TEXT_REQUIRES_VISUAL_REVIEW'}))};
}

export function textSourceFiles(projectRoot) {
  const skipped = new Set(['.cache', '.showreel-progress', 'node_modules', 'out', 'qa', 'input', 'audio', 'fonts', 'vendor']);
  const files = [];
  const root = path.resolve(projectRoot);
  const visited = new Set();
  const rel = absolute => path.relative(root, absolute).split(path.sep).join('/');
  function addScript(absolute, rendererEntrypoint = false) {
    const target = path.resolve(absolute);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return;
    if (relative.split(path.sep).some(part => skipped.has(part)) || !/\.(?:mjs|cjs|js)$/iu.test(target)) return;
    if (visited.has(target)) return;
    visited.add(target);
    const content = fs.readFileSync(target, 'utf8');
    files.push({path: rel(target), content, rendererEntrypoint});
    const imports = /(?:\bimport\s*(?:[^'"`]*?\sfrom\s*)?|\bimport\s*\()(['"])(\.\.?\/[^'"]+)\1/gu;
    for (const match of content.matchAll(imports)) {
      const candidate = path.resolve(path.dirname(target), match[2]);
      const choices = [candidate, ...['.mjs', '.js', '.cjs'].map(extension => `${candidate}${extension}`), path.join(candidate, 'index.mjs'), path.join(candidate, 'index.js')];
      const found = choices.find(choice => fs.existsSync(choice) && fs.statSync(choice).isFile());
      if (found) addScript(found, false);
    }
  }
  const htmlPath = path.join(root, 'index.html');
  if (!fs.existsSync(htmlPath) || !fs.statSync(htmlPath).isFile()) return files;
  const html = fs.readFileSync(htmlPath, 'utf8');
  let inlineIndex = 0;
  for (const tag of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)) {
    const source = /\bsrc\s*=\s*(['"])(.*?)\1/iu.exec(tag[1])?.[2];
    if (source) {
      if (/^(?:https?:|data:|\/\/)/iu.test(source)) continue;
      const target = path.resolve(root, decodeURIComponent(source.split(/[?#]/u, 1)[0]));
      addScript(target, true);
    } else if (tag[2].trim()) files.push({path: `index.html#inline-script-${++inlineIndex}`, content: tag[2], rendererEntrypoint: true});
  }
  return files;
}

export function writeReadOnlyBriefTextMap(projectRoot, map) {
  const cacheDir = path.join(projectRoot, '.cache');
  fs.mkdirSync(cacheDir, {recursive: true});
  const target = path.join(cacheDir, 'brief-text-map.json');
  const content = `${JSON.stringify(map, null, 2)}\n`;
  const current = fs.lstatSync(target, {throwIfNoEntry: false});
  if (current) {
    if (!current.isFile()) fail('brief-text-map-cache-conflict', `existing ${target} is not an ordinary generated file; preserved`);
    const existing = fs.readFileSync(target, 'utf8');
    let old;
    try { old = JSON.parse(existing); } catch { fail('brief-text-map-cache-conflict', `existing ${target} is unreadable; preserved`); }
    if (old.format !== SCREEN_TEXT_MAP_FORMAT || old.generated !== true || old.sourceFile !== 'brief.md') {
      fail('brief-text-map-cache-conflict', `existing ${target} is not a recognized generated map; preserved`);
    }
    if (existing === content && (current.mode & 0o222) === 0) return target;
  }
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, content, {flag: 'wx', mode: 0o444});
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o444);
  } catch (error) {
    try { fs.rmSync(temporary, {force: true}); } catch {}
    throw error;
  }
  return target;
}
