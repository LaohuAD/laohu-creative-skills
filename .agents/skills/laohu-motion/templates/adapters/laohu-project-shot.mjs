import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolveMotionRuntime} from '../../scripts/laohu-motion-runtime.mjs';

const adapterDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(adapterDir, '../..');
const templatesRuntimeDir = path.join(skillDir, 'templates/runtime/laohu-remotion');
const motionIndexPath = path.join(templatesRuntimeDir, 'components/shots/index.ts');
const hostTemplatePath = path.join(adapterDir, 'laohu-project-shot-entry.tsx');
const PROJECT_SHOT_FORMAT = 'laohu.motion-project-shot-render-receipt/1';
const SAFE_EXPORT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const TEXT_EXTENSIONS = new Set(['.cjs', '.css', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const RESOLVE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json', '.css', '.svg', '.png', '.webp', '.jpg', '.jpeg', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mov'];
const MAX_LOCAL_FILES = 512;
const MAX_IMPORT_DEPTH = 64;

function fail(message) { throw new Error(message); }
function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function safeRelative(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\\') || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
    fail(`${label} must be a non-empty project-relative POSIX path`);
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) fail(`${label} must not contain empty, dot, or parent path segments`);
  return parts.join('/');
}
function packageNameFor(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}
function externalSpecifier(specifier) {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:');
}
function staticSpecifiers(source, extension, parser) {
  if (extension === '.css') {
    const values = [];
    for (const match of source.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']\s*\)?/g)) values.push(match[1]);
    for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const value = match[1].trim();
      if (!value.startsWith('data:')) values.push(value);
    }
    return values;
  }
  if (!TEXT_EXTENSIONS.has(extension)) return [];
  let ast;
  try {
    ast = parser.parse(source, {sourceType: 'unambiguous', plugins: ['typescript', 'jsx']});
  } catch (error) {
    fail(`project shot dependency cannot be parsed for deterministic import closure: ${error.message}`);
  }
  const values = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) visit(child); return; }
    if (['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration'].includes(node.type) && node.source?.type === 'StringLiteral') values.push(node.source.value);
    if (node.type === 'CallExpression' && node.callee?.type === 'Import') {
      const argument = node.arguments?.[0];
      if (argument?.type !== 'StringLiteral') fail('project shot modules must use statically named imports; dynamic import expressions cannot be hash-verified');
      values.push(argument.value);
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require') {
      const argument = node.arguments?.[0];
      if (argument?.type !== 'StringLiteral') fail('project shot modules must use statically named require() imports; computed package paths cannot be hash-verified');
      values.push(argument.value);
    }
    if (node.type === 'NewExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'URL' && node.arguments?.[0]?.type === 'StringLiteral') {
      values.push(node.arguments[0].value);
    }
    for (const [key, child] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'comments', 'tokens', 'errors'].includes(key)) continue;
      visit(child);
    }
  };
  visit(ast.program);
  return values;
}
async function resolveLocalFile(root, baseFile, specifier, label) {
  if (!specifier || specifier.startsWith('/') || path.win32.isAbsolute(specifier) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier)) fail(`${label} must resolve to a local relative file`);
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  const base = path.resolve(path.dirname(baseFile), cleanSpecifier);
  if (!isWithin(root, base)) fail(`${label} escapes the project/runtime source root`);
  const candidates = [base];
  if (!path.extname(base)) {
    for (const extension of RESOLVE_EXTENSIONS) candidates.push(`${base}${extension}`);
    for (const extension of RESOLVE_EXTENSIONS) candidates.push(path.join(base, `index${extension}`));
  }
  for (const candidate of candidates) {
    const stat = await fs.stat(candidate).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (!stat?.isFile()) continue;
    const actual = await fs.realpath(candidate);
    if (!isWithin(root, actual)) fail(`${label} resolves through a link outside the project/runtime source root`);
    return actual;
  }
  fail(`${label} could not resolve local import ${JSON.stringify(specifier)}`);
}
async function inspectFileClosure({entryPath, root, rootLabel, parser, runtimeNodeModules, runtimeRequire, files, externalImports, depth = 0}) {
  if (depth > MAX_IMPORT_DEPTH) fail('project shot import closure exceeds the supported nesting depth');
  const absolute = await fs.realpath(entryPath);
  if (!isWithin(root, absolute)) fail(`${rootLabel} dependency escaped its source root`);
  if (files.has(absolute)) return;
  if (files.size >= MAX_LOCAL_FILES) fail('project shot import closure contains too many local files');
  const stat = await fs.lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${rootLabel} dependency must be a regular file`);
  const bytes = await fs.readFile(absolute);
  const extension = path.extname(absolute).toLowerCase();
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  files.set(absolute, {path: relative, sha256: sha256(bytes), bytes: bytes.length});
  const imports = staticSpecifiers(bytes.toString('utf8'), extension, parser);
  for (const specifier of imports) {
    if (specifier === '@laohu/motion') {
      await inspectFileClosure({entryPath: motionIndexPath, root: templatesRuntimeDir, rootLabel: 'stable @laohu/motion', parser, runtimeNodeModules, runtimeRequire, files: files.runtimeFiles, externalImports, depth: 0});
      continue;
    }
    if (specifier.startsWith('@laohu/motion/')) fail('project shot imports must use the stable @laohu/motion surface without private subpaths');
    if (externalSpecifier(specifier)) {
      if (specifier.startsWith('node:')) fail(`project shot cannot bundle Node-only import ${specifier}`);
      externalImports.add(specifier);
      continue;
    }
    const dependency = await resolveLocalFile(root, absolute, specifier, `${rootLabel} import`);
    await inspectFileClosure({entryPath: dependency, root, rootLabel, parser, runtimeNodeModules, runtimeRequire, files, externalImports, depth: depth + 1});
  }
}

function parseDeclaredFiles(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const rows = value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`${label}[${index}] must be an object`);
    const allowed = new Set(['path', 'sha256']);
    for (const key of Object.keys(item)) if (!allowed.has(key)) fail(`${label}[${index}].${key} is not supported`);
    const relativePath = safeRelative(item.path, `${label}[${index}].path`);
    if (typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) fail(`${label}[${index}].sha256 must be a SHA-256 hex digest`);
    return {path: relativePath, sha256: item.sha256};
  }).sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(rows.map((row) => row.path)).size !== rows.length) fail(`${label} contains duplicate paths`);
  return rows;
}
function parseAssetPaths(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const rows = value.map((item, index) => {
    if (typeof item !== 'string' && (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => key !== 'path'))) {
      fail(`${label}[${index}] must be an asset path or an object with only a path field`);
    }
    return {path: safeRelative(typeof item === 'string' ? item : item.path, `${label}[${index}].path`)};
  }).sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(rows.map((row) => row.path)).size !== rows.length) fail(`${label} contains duplicate paths`);
  return rows;
}
async function inspectDeclaredFiles({rows, root, label, prepare = false}) {
  const result = [];
  for (const row of rows) {
    const absolute = await resolveLocalFile(root, path.join(root, '__root__.mjs'), row.path, `${label}.${row.path}`);
    const stat = await fs.lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label}.${row.path} must be a regular file`);
    const bytes = await fs.readFile(absolute);
    const actual = sha256(bytes);
    if (!prepare && actual !== row.sha256) fail(`${label}.${row.path} SHA-256 is stale`);
    result.push({path: row.path, absolutePath: absolute, sha256: actual, bytes: bytes.length});
  }
  return result;
}
async function resolveRuntimePackages({runtimeNodeModules, runtimeRequire, importSpecifiers}) {
  const runtimeRoot = path.dirname(path.resolve(runtimeNodeModules));
  const lockPath = path.join(runtimeRoot, 'package-lock.json');
  const lockBytes = await fs.readFile(lockPath).catch((error) => fail(`canonical Motion runtime lock is unavailable: ${error.message}`));
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const specifiers = [...new Set(importSpecifiers)].sort();
  const byPackage = new Map();
  for (const specifier of specifiers) {
    const name = packageNameFor(specifier);
    const packageJsonPath = path.join(runtimeNodeModules, ...name.split('/'), 'package.json');
    const manifestBytes = await fs.readFile(packageJsonPath).catch((error) => fail(`project shot import ${specifier} is not provided by the canonical Motion runtime: ${error.message}`));
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const locked = lock.packages?.[`node_modules/${name}`];
    if (manifest.name !== name || !locked || manifest.version !== locked.version) fail(`project shot import ${specifier} does not match the canonical locked runtime package ${name}`);
    runtimeRequire.resolve(specifier);
    const row = byPackage.get(name) || {name, version: manifest.version, specifiers: []};
    row.specifiers.push(specifier);
    byPackage.set(name, row);
  }
  return [...byPackage.values()].map((row) => ({...row, specifiers: [...new Set(row.specifiers)].sort()}));
}

export async function resolveProjectShotModule({segment, blueprintPath, runtimeNodeModules, skillRoot = skillDir, prepare = false}) {
  if (!segment || typeof segment !== 'object' || Array.isArray(segment)) fail('project shot segment must be an object');
  if (!path.isAbsolute(blueprintPath)) fail('project shot blueprintPath must be absolute');
  if (!path.isAbsolute(runtimeNodeModules)) fail('project shot runtimeNodeModules must be absolute');
  const sourceRoot = await fs.realpath(path.dirname(blueprintPath));
  const moduleRelativePath = safeRelative(segment.modulePath, `${segment.id || 'project shot'}.modulePath`);
  if (path.posix.extname(moduleRelativePath).toLowerCase() !== '.tsx') fail(`${segment.id || 'project shot'}.modulePath must point to a local .tsx module`);
  if (!prepare && (typeof segment.moduleSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(segment.moduleSha256))) fail(`${segment.id || 'project shot'}.moduleSha256 must be a SHA-256 hex digest`);
  if (typeof segment.exportName !== 'string' || (segment.exportName !== 'default' && !SAFE_EXPORT.test(segment.exportName))) fail(`${segment.id || 'project shot'}.exportName must be a named TSX export or default`);
  const modulePath = await resolveLocalFile(sourceRoot, path.join(sourceRoot, '__root__.mjs'), moduleRelativePath, `${segment.id || 'project shot'}.modulePath`);
  const moduleStat = await fs.lstat(modulePath);
  if (!moduleStat.isFile() || moduleStat.isSymbolicLink()) fail(`${segment.id || 'project shot'} module must be a regular file`);
  const moduleBytes = await fs.readFile(modulePath);
  const moduleSha256 = sha256(moduleBytes);
  if (!prepare && moduleSha256 !== segment.moduleSha256) fail(`${segment.id || 'project shot'}.moduleSha256 is stale`);
  if (segment.props != null && (typeof segment.props !== 'object' || Array.isArray(segment.props))) fail(`${segment.id || 'project shot'}.props must be a JSON object`);
  let props;
  try { props = JSON.parse(JSON.stringify(segment.props || {})); }
  catch { fail(`${segment.id || 'project shot'}.props must be JSON serializable`); }
  const propsSha256 = sha256(Buffer.from(canonical(props), 'utf8'));
  const declaredDependencies = prepare ? [] : parseDeclaredFiles(segment.dependencies, `${segment.id || 'project shot'}.dependencies`);
  const declaredAssets = prepare ? parseAssetPaths(segment.assets, `${segment.id || 'project shot'}.assets`) : parseDeclaredFiles(segment.assets, `${segment.id || 'project shot'}.assets`);
  if (!prepare) await inspectDeclaredFiles({rows: declaredDependencies, root: sourceRoot, label: `${segment.id || 'project shot'}.dependencies`});
  const assetFiles = await inspectDeclaredFiles({rows: declaredAssets, root: sourceRoot, label: `${segment.id || 'project shot'}.assets`, prepare});
  const runtimeRoot = path.dirname(runtimeNodeModules);
  const runtimeRequire = createRequire(path.join(runtimeRoot, 'package.json'));
  let parser;
  try { parser = runtimeRequire('@babel/parser'); }
  catch (error) { fail(`canonical Motion runtime has no locked TSX parser for import-closure verification: ${error.message}`); }
  const projectFiles = new Map();
  const externalImports = new Set();
  const runtimeFiles = new Map();
  projectFiles.runtimeFiles = runtimeFiles;
  await inspectFileClosure({entryPath: modulePath, root: sourceRoot, rootLabel: 'project shot', parser, runtimeNodeModules, runtimeRequire, files: projectFiles, externalImports});
  projectFiles.delete(motionIndexPath);
  projectFiles.delete(motionIndexPath);
  const moduleRecord = projectFiles.get(modulePath);
  if (!moduleRecord || moduleRecord.sha256 !== moduleSha256) fail('project shot module changed during import-closure inspection');
  const discoveredDependencies = [...projectFiles.values()].filter((row) => row.path !== moduleRelativePath).sort((a, b) => a.path.localeCompare(b.path));
  const declaredByPath = new Map(declaredDependencies.map((row) => [row.path, row.sha256]));
  if (!prepare && (declaredByPath.size !== discoveredDependencies.length || discoveredDependencies.some((row) => declaredByPath.get(row.path) !== row.sha256))) {
    const discoveredPaths = discoveredDependencies.map((row) => `${row.path}@${row.sha256}`);
    const declaredPaths = declaredDependencies.map((row) => `${row.path}@${row.sha256}`);
    fail(`${segment.id || 'project shot'}.dependencies must exactly match its imported local file closure; discovered ${JSON.stringify(discoveredPaths)}, declared ${JSON.stringify(declaredPaths)}`);
  }
  const runtimeImports = new Set(externalImports);
  const stableModules = [...runtimeFiles.values()].sort((a, b) => a.path.localeCompare(b.path));
  const runtimePackages = await resolveRuntimePackages({runtimeNodeModules, runtimeRequire, importSpecifiers: [...runtimeImports]});
  const projectSourceFiles = [moduleRecord, ...discoveredDependencies].sort((a, b) => a.path.localeCompare(b.path));
  const sourceGraphSha256 = sha256(Buffer.from(canonical(projectSourceFiles.map(({path: filePath, sha256: digest}) => ({path: filePath, sha256: digest}))), 'utf8'));
  const stableModuleGraphSha256 = sha256(Buffer.from(canonical(stableModules.map(({path: filePath, sha256: digest}) => ({path: filePath, sha256: digest}))), 'utf8'));
  const absoluteSkillRoot = path.resolve(skillRoot);
  const renderDriverPath = path.join(adapterDir, 'video-shotcraft-remotion.mjs');
  return {
    renderer: 'laohu-project-shot',
    sourceRoot,
    module: {path: moduleRelativePath, absolutePath: modulePath, sha256: moduleSha256, exportName: segment.exportName},
    props,
    propsSha256,
    dependencies: discoveredDependencies.map(({path: filePath, sha256: digest, bytes}) => ({path: filePath, sha256: digest, bytes})),
    sourceFiles: projectSourceFiles.map(({path: filePath, sha256: digest, bytes}) => ({path: filePath, sha256: digest, bytes})),
    sourceGraphSha256,
    assets: assetFiles.map(({path: filePath, sha256: digest, bytes}) => ({path: filePath, absolutePath: assetFiles.find((row) => row.path === filePath).absolutePath, sha256: digest, bytes})),
    stableModules,
    stableModuleGraphSha256,
    runtimePackages,
    runtimeLockSha256: sha256(await fs.readFile(path.join(runtimeRoot, 'package-lock.json'))),
    adapter: {
      path: path.relative(absoluteSkillRoot, path.join(adapterDir, 'laohu-project-shot.mjs')).split(path.sep).join('/'),
      sha256: sha256(await fs.readFile(path.join(adapterDir, 'laohu-project-shot.mjs'))),
      hostPath: path.relative(absoluteSkillRoot, hostTemplatePath).split(path.sep).join('/'),
      hostSha256: sha256(await fs.readFile(hostTemplatePath)),
      renderDriverPath: path.relative(absoluteSkillRoot, renderDriverPath).split(path.sep).join('/'),
      renderDriverSha256: sha256(await fs.readFile(renderDriverPath)),
    },
  };
}

/** Reads current work files and emits the hash fields required by a Film /2 project-shot segment. */
export async function prepareProjectShotDescriptor({modulePath, exportName, props = {}, assets = [], blueprintPath, runtimeNodeModules, skillRoot = skillDir} = {}) {
  const segment = {id: 'project-shot-prepare', modulePath, exportName, props, assets};
  const inspected = await resolveProjectShotModule({segment, blueprintPath, runtimeNodeModules, skillRoot, prepare: true});
  return {
    renderer: 'laohu-project-shot',
    modulePath: inspected.module.path,
    moduleSha256: inspected.module.sha256,
    exportName: inspected.module.exportName,
    props: inspected.props,
    dependencies: inspected.dependencies.map(({path: filePath, sha256: digest}) => ({path: filePath, sha256: digest})),
    assets: inspected.assets.map(({path: filePath, sha256: digest}) => ({path: filePath, sha256: digest})),
  };
}

export async function createProjectShotEntrypoint({projectShot, outputPath}) {
  if (!projectShot?.module?.exportName || !path.isAbsolute(outputPath)) fail('createProjectShotEntrypoint requires a verified module export and absolute outputPath');
  const importLine = projectShot.module.exportName === 'default'
    ? "import ProjectShot from '@laohu/project-shot';"
    : `import {${projectShot.module.exportName} as ProjectShot} from '@laohu/project-shot';`;
  const source = `import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {LaohuProjectShotHost} from '@laohu/project-shot-host';
${importLine}

type RuntimeSpec = {width:number; height:number; fps:number; durationInFrames:number; props:Record<string, unknown>};
const ProjectShotComposition: React.FC<{runtimeSpec:RuntimeSpec}> = ({runtimeSpec}) => {
  if (runtimeSpec.width !== 1920 || runtimeSpec.height !== 1080 || runtimeSpec.fps !== 30) throw new Error('Film /2 project shots require the shared 1920×1080@30 frame contract');
  return <LaohuProjectShotHost ShotComponent={ProjectShot} shotProps={runtimeSpec.props} />;
};
const Root: React.FC = () => <Composition
  id="LaohuProjectShot"
  component={ProjectShotComposition}
  width={1920}
  height={1080}
  fps={30}
  durationInFrames={1}
  defaultProps={{runtimeSpec:{width:1920,height:1080,fps:30,durationInFrames:1,props:{}}}}
  calculateMetadata={({props}:{props:{runtimeSpec:RuntimeSpec}}) => {
    const spec=props.runtimeSpec;
    if (!Number.isSafeInteger(spec.durationInFrames) || spec.durationInFrames < 1) throw new Error('project shot durationInFrames must be a positive integer');
    if (spec.width !== 1920 || spec.height !== 1080 || spec.fps !== 30) throw new Error('project shot metadata must preserve the Film /2 frame contract');
    return {width:spec.width,height:spec.height,fps:spec.fps,durationInFrames:spec.durationInFrames};
  }}
/>;
registerRoot(Root);
`;
  await fs.mkdir(path.dirname(outputPath), {recursive: true});
  await fs.writeFile(outputPath, source, {flag: 'wx'});
  return {path: outputPath, sha256: sha256(Buffer.from(source, 'utf8')), bytes: Buffer.byteLength(source)};
}

export async function stageProjectShotAssets(projectShot, publicRoot) {
  if (!path.isAbsolute(publicRoot)) fail('project shot publicRoot must be absolute');
  await fs.mkdir(publicRoot, {recursive: true});
  const realPublicRoot = await fs.realpath(publicRoot);
  const records = [];
  for (const asset of projectShot.assets || []) {
    const destination = path.resolve(realPublicRoot, ...asset.path.split('/'));
    if (!isWithin(realPublicRoot, destination)) fail(`project shot asset ${asset.path} escapes the render public root`);
    await fs.mkdir(path.dirname(destination), {recursive: true});
    let cursor = destination;
    while (isWithin(realPublicRoot, cursor) && cursor !== realPublicRoot) {
      const stat = await fs.lstat(cursor).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
      if (stat?.isSymbolicLink()) fail(`project shot asset destination contains a symlink: ${asset.path}`);
      cursor = path.dirname(cursor);
    }
    try { await fs.copyFile(asset.absolutePath, destination, fsConstants.COPYFILE_EXCL); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existingHash = sha256(await fs.readFile(destination));
      if (existingHash !== asset.sha256) fail(`project shot staged asset path collision: ${asset.path}`);
    }
    const bytes = await fs.readFile(destination);
    const destinationStat = await fs.lstat(destination);
    if (!destinationStat.isFile() || destinationStat.isSymbolicLink()) fail(`project shot staged asset is not a regular file: ${asset.path}`);
    const actual = sha256(bytes);
    if (actual !== asset.sha256) fail(`project shot staged asset changed while copying: ${asset.path}`);
    records.push({path: asset.path, stagedPath: asset.path, sha256: actual, bytes: bytes.length});
  }
  return records;
}

export function projectShotWebpackAliases(projectShot, {runtimeRoot, nodeModules}) {
  if (!path.isAbsolute(runtimeRoot) || !path.isAbsolute(nodeModules)) fail('project shot webpack aliases require absolute canonical runtime paths');
  const runtimeRequire = createRequire(path.join(runtimeRoot, 'package.json'));
  const aliases = {
    '@laohu/project-shot$': projectShot.module.absolutePath,
    '@laohu/project-shot-host$': hostTemplatePath,
    '@laohu/motion$': motionIndexPath,
  };
  for (const dependency of projectShot.runtimePackages || []) {
    for (const specifier of dependency.specifiers) aliases[`${specifier}$`] = runtimeRequire.resolve(specifier);
  }
  for (const specifier of ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', 'remotion']) {
    try { aliases[`${specifier}$`] = runtimeRequire.resolve(specifier); } catch { /* unused optional subpath */ }
  }
  return aliases;
}

function validateRendererFontLoads(fontLoads, projectShotAssets, segmentId) {
  if (!Array.isArray(fontLoads)) fail(`${segmentId} project-shot rendererFontLoads must be an array`);
  const seen = new Set();
  for (const [index, font] of fontLoads.entries()) {
    const label = `${segmentId} project-shot rendererFontLoads[${index}]`;
    if (!font || typeof font !== 'object' || Array.isArray(font)) fail(`${label} must be an object`);
    const key = JSON.stringify([font.family, font.file, font.weight, font.style]);
    if (seen.has(key)) fail(`${label} duplicates a loaded font identity`);
    seen.add(key);
    if (font.format !== 'laohu.motion.font-load-event/1' || font.producer !== '@laohu/motion/core/fonts.useFonts'
        || typeof font.family !== 'string' || !font.family.trim()
        || typeof font.file !== 'string' || !font.file.trim()
        || typeof font.weight !== 'string' || !font.weight.trim()
        || !Array.isArray(font.weightChecks) || font.weightChecks.length === 0
        || font.weightChecks.some((check) => !check || typeof check.weight !== 'string' || !check.weight.trim() || check.readyCheck !== true)
        || typeof font.style !== 'string' || !font.style.trim()
        || font.status !== 'loaded' || font.readyCheck !== true
        || !/^[a-f0-9]{64}$/.test(font.sha256 || '') || !Number.isSafeInteger(font.bytes) || font.bytes < 1) {
      fail(`${label} does not contain a successful useFonts load bound to hash-verified source bytes`);
    }
    const asset = projectShotAssets.find((row) => row.path === font.file && row.sha256 === font.sha256 && row.bytes === font.bytes);
    if (!asset) fail(`${label} file/hash/size do not match a declared project-shot asset`);
    if (!Array.isArray(font.observations) || !font.observations.includes('Remotion browser callback')) {
      fail(`${label} lacks the actual Remotion browser load observation`);
    }
  }
  return fontLoads;
}

export function createProjectShotReceipt({projectShot, entry, outputPath, outputHash, render, rendererFontLoads = render?.fontLoads || [], runtime, assets, segmentId}) {
  const relativeOutput = path.basename(outputPath);
  const boundFontLoads = validateRendererFontLoads(rendererFontLoads, projectShot.assets, segmentId);
  return {
    format: PROJECT_SHOT_FORMAT,
    renderer: 'laohu-project-shot',
    segmentId,
    source: {
      module: {path: projectShot.module.path, sha256: projectShot.module.sha256, exportName: projectShot.module.exportName},
      props: projectShot.props,
      propsSha256: projectShot.propsSha256,
      dependencies: projectShot.dependencies,
      sourceFiles: projectShot.sourceFiles,
      sourceGraphSha256: projectShot.sourceGraphSha256,
      stableModules: projectShot.stableModules.map(({path: filePath, sha256: digest, bytes}) => ({path: filePath, sha256: digest, bytes})),
      stableModuleGraphSha256: projectShot.stableModuleGraphSha256,
      runtimePackages: projectShot.runtimePackages,
      runtimeLockSha256: projectShot.runtimeLockSha256,
      assets,
      adapter: projectShot.adapter,
    },
    generatedEntry: {path: path.basename(entry.path), sha256: entry.sha256, bytes: entry.bytes},
    runtime: {version: '4.0.537', packageLockSha256: runtime.lockHash, resolutionSource: runtime.resolutionSource, packages: runtime.packages},
    render: {compositionId: render.composition.id, width: render.composition.width, height: render.composition.height, fps: render.composition.fps, durationInFrames: render.composition.durationInFrames, audioStream: 'absent'},
    rendererFontLoads: boundFontLoads,
    output: {path: relativeOutput, sha256: outputHash.sha256, bytes: outputHash.bytes},
  };
}

export function verifyProjectShotReceipt(receipt, {projectShot, entry, render, outputHash, segmentId, expectedFrameCount}) {
  if (receipt?.format !== PROJECT_SHOT_FORMAT || receipt.renderer !== 'laohu-project-shot' || receipt.segmentId !== segmentId) fail(`${segmentId} project shot child receipt has the wrong identity`);
  if (receipt.source?.module?.path !== projectShot.module.path || receipt.source.module.sha256 !== projectShot.module.sha256 || receipt.source.module.exportName !== projectShot.module.exportName) fail(`${segmentId} project shot child receipt does not bind the verified module path/hash/export`);
  if (receipt.source?.propsSha256 !== projectShot.propsSha256 || canonical(receipt.source.props) !== canonical(projectShot.props)) fail(`${segmentId} project shot child receipt does not bind the consumed props`);
  if (receipt.generatedEntry?.sha256 !== entry?.sha256 || receipt.generatedEntry?.bytes !== entry?.bytes) fail(`${segmentId} project shot generated entry hash is stale`);
  if (canonical(receipt.source.dependencies) !== canonical(projectShot.dependencies) || receipt.source.sourceGraphSha256 !== projectShot.sourceGraphSha256) fail(`${segmentId} project shot child receipt dependency closure is stale`);
  const stableModules = projectShot.stableModules.map(({path: filePath, sha256: digest, bytes}) => ({path: filePath, sha256: digest, bytes}));
  if (canonical(receipt.source.stableModules) !== canonical(stableModules) || receipt.source.stableModuleGraphSha256 !== projectShot.stableModuleGraphSha256) fail(`${segmentId} project shot child receipt stable @laohu/motion dependency closure is stale`);
  if (canonical(receipt.source.runtimePackages) !== canonical(projectShot.runtimePackages) || receipt.source.runtimeLockSha256 !== projectShot.runtimeLockSha256) fail(`${segmentId} project shot child receipt canonical package evidence is stale`);
  if (canonical(receipt.source.adapter) !== canonical(projectShot.adapter)) fail(`${segmentId} project shot child receipt adapter/host hashes are stale`);
  if (canonical(receipt.source.assets) !== canonical(projectShot.assets.map(({path: assetPath, sha256: digest, bytes}) => ({path: assetPath, stagedPath: assetPath, sha256: digest, bytes})))) fail(`${segmentId} project shot child receipt staged asset evidence is stale`);
  validateRendererFontLoads(receipt.rendererFontLoads || [], projectShot.assets, segmentId);
  if (receipt.render?.width !== 1920 || receipt.render?.height !== 1080 || receipt.render?.fps !== 30 || receipt.render?.durationInFrames !== expectedFrameCount || receipt.render?.audioStream !== 'absent') fail(`${segmentId} project shot child receipt does not preserve the Film /2 picture-only frame contract`);
  if (receipt.output?.sha256 !== outputHash.sha256 || receipt.output?.bytes !== outputHash.bytes) fail(`${segmentId} project shot child output hash disagrees with its receipt`);
  if (render?.composition?.durationInFrames !== expectedFrameCount || render.composition.width !== 1920 || render.composition.height !== 1080 || render.composition.fps !== 30) fail(`${segmentId} Remotion project shot composition disagrees with the compiled Film /2 range`);
  return true;
}

function projectShotPrepareUsage() {
  return [
    'Prepare the source/dependency locks for one Film /2 laohu-project-shot segment:',
    '  node .agents/skills/laohu-motion/templates/adapters/laohu-project-shot.mjs prepare --blueprint <film-blueprint.json> --module <project-relative.tsx> --export <ComponentExport> [--props-json <JSON-object>] [--asset <project-relative-file>]...',
    'The command reads the module import closure and requested public assets, then prints the exact moduleSha256/dependencies/assets fields to paste into that segment. It does not edit the blueprint or source files.',
  ].join('\n');
}

async function runProjectShotPrepareCli(argv) {
  const [command, ...args] = argv;
  if (command === '--help' || command === '-h') {
    process.stdout.write(`${projectShotPrepareUsage()}\n`);
    return;
  }
  if (command !== 'prepare') fail(`expected the prepare command\n${projectShotPrepareUsage()}`);
  const options = new Map();
  const assets = [];
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === '--asset') {
      const value = args[++index];
      if (!value) fail('--asset requires a path');
      assets.push(value);
      continue;
    }
    if (!['--blueprint', '--module', '--export', '--props-json', '--work-root'].includes(key)) fail(`unsupported project-shot option ${key}`);
    const value = args[++index];
    if (!value) fail(`${key} requires a value`);
    if (options.has(key)) fail(`${key} may be supplied only once`);
    options.set(key, value);
  }
  const blueprintPath = path.resolve(options.get('--blueprint') || '');
  const workRoot = path.resolve(options.get('--work-root') || process.env.WORK_ROOT || path.resolve(skillDir, '../../..'));
  const modulePath = options.get('--module');
  const exportName = options.get('--export');
  if (!options.has('--blueprint') || !modulePath || !exportName) fail(`--blueprint, --module, and --export are required\n${projectShotPrepareUsage()}`);
  let props = {};
  if (options.has('--props-json')) {
    try { props = JSON.parse(options.get('--props-json')); }
    catch (error) { fail(`--props-json must be valid JSON: ${error.message}`); }
  }
  const runtime = resolveMotionRuntime({packages: ['@babel/parser'], projectRoot: path.resolve(skillDir, '../../..'), skillRoot: skillDir, workRoot, runtimeRoot: process.env.MOTION_RUNTIME_ROOT});
  const descriptor = await prepareProjectShotDescriptor({modulePath, exportName, props, assets, blueprintPath, runtimeNodeModules: runtime.nodeModules, skillRoot: skillDir});
  process.stdout.write(`${JSON.stringify(descriptor, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runProjectShotPrepareCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 1;
  });
}

export const __test = {staticSpecifiers, safeRelative, PROJECT_SHOT_FORMAT};
