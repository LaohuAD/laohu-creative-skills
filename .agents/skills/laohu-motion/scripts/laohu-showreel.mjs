#!/usr/bin/env node
// Stable local entry for the byte-preserved motion-showreel runtime.
// Run from the confirmed work-project root so writable dependencies, caches, and media stay there.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {createBriefTextRuntime} from './screen-text-contract.mjs';
import {compileBriefTextMap, scanProjectTextBindings, textSourceFiles, writeReadOnlyBriefTextMap} from './screen-text-registry.mjs';
import {hasControlledBriefText, materializeAsset, prepareBriefTypefaces} from './brief-typefaces.mjs';
import {briefBlocks, explorationBlocks, readExplorationDirection, readDirectionAssets, compileExplorationTextMap, textEvidenceInRanges} from './showreel-project-phase.mjs';
import {prepareEditorReviewAudio, withLongformAudio, pcmFingerprint} from './showreel-review-audio.mjs';
import { emptyProductionTable, readBriefProductionUnits, resolveBriefProductionUnits } from './brief-production-units.mjs';
import {NATIVE_CAPTION_PROFILE_IDS, verifyNativeCaptionProfileReport} from '../templates/runtime/native-presentation/captions.mjs';
import {mountShowreelThree, showreelThreeVendor, withShowreelThreeImportMap} from './showreel-three.mjs';
import {selectShowreelWebgl, webglMode} from './showreel-webgl.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrapperSha256 = createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const runtimeRoot = path.join(skillRoot, 'templates/runtime/laohu-showreel');
const runtimeScripts = path.join(runtimeRoot, 'scripts');
const workRoot = path.resolve(process.cwd());
const workDevice = fs.statSync(fs.realpathSync(workRoot)).dev;
const lockPath = path.join(runtimeScripts, 'package-lock.json');
const lockHash = createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');
const runtimeCacheRoot = path.join(workRoot, '.cache', 'laohu-showreel');
const runtimeDepsRoot = path.join(runtimeCacheRoot, 'runtime', lockHash.slice(0, 16));
const sourceLockHash = createHash('sha256').update(fs.readFileSync(path.join(runtimeRoot, 'source-lock.json'))).digest('hex');
const executionRuntimeRoot = path.join(runtimeCacheRoot, 'execution', sourceLockHash, 'runtime');
const resourceCommands = ['resource-overview', 'resource-search', 'resource-get', 'resource-family', 'resource-compare', 'resource-category', 'resource-fulltext'];
const commands = new Set(['doctor', 'setup', 'test', ...resourceCommands, 'chapter-binding', 'chapter-index', 'brief-units', 'input-map', 'input-prepare', 'input-page', 'input-candidate', 'scaffold', 'promote-production', 'render', 'editor', 'preview', 'inspect', 'audio', 'audio-plan', 'audio-map', 'narration', 'progress', 'progress-task', 'probe', 'build-long', 'build', 'audio-scene', 'text-contract', 'text-inputs']);
const inputReceiptName = '.showreel-input-delivery.json';
const inputPageLimit = 8500;
const inputSegmentLimit = 6900;
const frameProgressOptions = new Set(['--frame-source', '--frame-event', '--frame-at', '--frame-role']);
const usage = `用法（从已确认的工作项目根目录运行）：
  node {SKILL_DIR}/scripts/laohu-showreel.mjs doctor [--webgl-smoke]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs verify-source
  node {SKILL_DIR}/scripts/laohu-showreel.mjs setup [--without-three]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs test
  node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-overview [--scope global-map|all|styles|atlas|motion|overlay|openmotion|motion-library|fonts]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-compare --ids <id1,id2,...>
  node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-category --source <styles|atlas|motion-prompt|openmotion|overlay|fonts> --category <类别或家族 ID>
  node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-search [--query <text>] [--category <类别>] [--source all|motion-library|style|atlas|motion-prompt|overlay|openmotion|showreel-recipe|local-effect|legacy-remotion|effect-library|fonts] [--text <字体查询的本轮原句>] [--limit N]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-get --id <resource-id> [--text <font: 字体需检查的本轮原句>]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-family --id <atlas-family-id>
  node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-fulltext --id <resource-id> --level L2|L3
  node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-fulltext --id <openmotion-id> --level L3 [--member <project-file>]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs chapter-binding <project> [--timeline timeline.js]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs chapter-index <project> [--chapters chapters.json] [--timeline timeline.js] [--video out/final.mp4] [--out chapter-index.json]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs brief-units <project> [--final]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs input-map <project> [--resume|--full-redesign] [--page-characters 2000..8500]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs input-prepare <project> [--resume|--full-redesign] [--page-characters 2000..8500]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs input-page <project> --next
  node {SKILL_DIR}/scripts/laohu-showreel.mjs input-page <project> --id <stable-page-id>  # replay one exact current page
  node {SKILL_DIR}/scripts/laohu-showreel.mjs input-candidate <project> --id <resource-id> [--next]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs input-candidate <project> --id <resource-id> --page-id <candidate-page-id>  # replay one exact current L2 body page
  node {SKILL_DIR}/scripts/laohu-showreel.mjs scaffold <slug-or-path> --audio file|none|synth|tone|layer [--phase explore] [--with-three]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs promote-production <project> --audit <project-relative audit.md>
  node {SKILL_DIR}/scripts/laohu-showreel.mjs render <project> --text-direction <selected-name> [render.mjs options]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs text-contract <project> --text-direction <selected-name> [--start <sec>] [--duration <sec>] [--fps <fps>] [--size WxH] [--exhaustive-frames]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs editor <project> [--port <local-port>]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs preview|inspect|audio|narration|progress|build-long <args...>
  node {SKILL_DIR}/scripts/laohu-showreel.mjs audio-scene <project> [--out <project-relative-or-absolute-json>]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs audio-map
  node {SKILL_DIR}/scripts/laohu-showreel.mjs audio-plan <original Motion audio.mjs args...>
  node {SKILL_DIR}/scripts/laohu-showreel.mjs build <project> --text-direction <selected-name> [build.sh options]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs probe <project> --text-direction <selected-name> --start <seconds> --duration <1..6> --selection <shot-or-time-range> --purpose <reason>
  node {SKILL_DIR}/scripts/laohu-showreel.mjs progress-task <project> start <stage> [item-id [name]]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs progress-task <project> finish|stop <task-token>
  node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage scenes --publish . --draft-probe --text-direction <selected-name> --duration <1..6> --selection <shot-or-time-range> --purpose <reason>
  node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --preview <target.png> --frame-source <cover|code|reference> --frame-event <id> --frame-at <seconds> [--reopen]
  node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --preview <rendered-still.png> --frame-source code --frame-event <id> --frame-at <seconds> --frame-role implementation
  node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage review --publish . --final --text-direction <selected-name> [--audio <project WAV>|--chapter-manifest <film.json>]

项目先用 input-map 一次接收 L0，再按观看任务展开 L1，用 input-candidate 读完拟采用项的 L2。规则、资源模式和工作台见 references/showreel-runtime.md 与 references/production-collaboration.md。`;

function verifyClosureAt(base) {
  const manifestPath = path.join(base, 'source-lock.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.sourceCommit !== '2b9a89340b70f632d31c0f1c69fce94a7912423e' || manifest.sourceSubtree !== 'skills/motion-showreel') {
    fail('local runtime source lock does not match the approved motion-showreel pin');
  }
  let checked = 0;
  for (const file of manifest.files) {
    if (path.isAbsolute(file.path) || file.path.split(/[\\/]/).includes('..')) fail(`unsafe path in source lock: ${file.path}`);
    const target = path.join(base, file.path);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`pinned runtime file is missing: ${file.path}`);
    const bytes = fs.readFileSync(target);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== file.bytes || digest !== file.sha256) fail(`pinned runtime file changed: ${file.path}`);
    checked++;
  }
  if (checked !== manifest.retainedSourceFiles) fail(`source lock lists ${checked} files but records ${manifest.retainedSourceFiles}`);
  return checked;
}
function verifySourceClosure() { return verifyClosureAt(runtimeRoot); }

function fail(message, code = 2) {
  console.error(`laohu-showreel: ${message}\n\n${usage}`);
  process.exit(code);
}

function volumePath(target, seenLinks = new Set()) {
  let probe = path.resolve(target);
  const missing = [];
  while (true) {
    let stat;
    try {
      stat = fs.lstatSync(probe);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) fail(`cannot resolve output path ${target}: ${error.message}`);
      const parent = path.dirname(probe);
      if (parent === probe) fail(`path has no existing ancestor: ${target}`);
      missing.unshift(path.basename(probe));
      probe = parent;
      continue;
    }
    if (stat.isSymbolicLink()) {
      const linkPath = path.resolve(probe);
      if (seenLinks.has(linkPath)) fail(`path contains a symlink cycle: ${target}`);
      seenLinks.add(linkPath);
      const linkTarget = fs.readlinkSync(probe);
      const resolvedTarget = path.isAbsolute(linkTarget)
        ? linkTarget
        : path.resolve(path.dirname(probe), linkTarget);
      return volumePath(path.resolve(resolvedTarget, ...missing), seenLinks);
    }
    const realProbe = fs.realpathSync(probe);
    return { path: path.resolve(realProbe, ...missing), device: fs.statSync(realProbe).dev };
  }
}

function assertWorkDisk(target, label = 'path') {
  const abs = path.resolve(workRoot, target);
  const resolved = volumePath(abs);
  if (resolved.device !== workDevice) fail(`${label} resolves to a different mounted volume than the confirmed work root: ${target}`);
  return abs;
}

function runtimeEnv() {
  const tmpRoot = path.join(workRoot, '.cache', 'tmp', 'laohu-showreel');
  for (const target of [path.join(workRoot, '.cache'), runtimeCacheRoot, runtimeDepsRoot, tmpRoot]) assertWorkDisk(target, 'cache/dependency path');
  const env = {
    ...process.env,
    TMPDIR: tmpRoot,
    TMP: tmpRoot,
    TEMP: tmpRoot,
    npm_config_cache: path.join(runtimeCacheRoot, 'npm'),
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_replace_registry_host: 'always',
    PLAYWRIGHT_BROWSERS_PATH: path.join(runtimeCacheRoot, 'playwright-browsers'),
    SHOWREEL_SAMPLES: path.join(runtimeCacheRoot, 'samples'),
    NODE_PATH: [path.join(runtimeDepsRoot, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
  };
  for (const dir of [tmpRoot, env.npm_config_cache, env.PLAYWRIGHT_BROWSERS_PATH, env.SHOWREEL_SAMPLES, runtimeDepsRoot]) fs.mkdirSync(dir, { recursive: true });
  for (const dir of [tmpRoot, env.npm_config_cache, env.PLAYWRIGHT_BROWSERS_PATH, env.SHOWREEL_SAMPLES, runtimeDepsRoot]) assertWorkDisk(dir, 'cache path');
  return env;
}

function probeShowreelBrowser(env, options = {}) {
  return selectShowreelWebgl({ cwd: workRoot, env, depsRoot: runtimeDepsRoot, assertWorkDisk,
    browserModule: path.join(getExecutionRuntime().scripts, 'lib/browser.mjs'),
    cacheDir: path.join(runtimeCacheRoot, 'webgl'), ...options });
}

let rendererProbe;
function bindShowreelBrowser(env) {
  if (env.SHOWREEL_ANGLE) return env;
  if (!rendererProbe) {
    rendererProbe = probeShowreelBrowser(env);
    if (!rendererProbe.selected.shader?.ok) console.error('[note] WebGL2 着色器探针未成帧；本次继续启动浏览器，可用 doctor --webgl-smoke 检查 3D 环境。');
  }
  env.SHOWREEL_ANGLE = rendererProbe.selected.angle;
  return env;
}

function spawn(command, args, { cwd = workRoot, env } = {}) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) fail(result.error.message, 1);
  return result.status ?? 1;
}

function run(command, args, options = {}) {
  process.exit(spawn(command, args, options));
}

function ensurePinnedDependencies(env) {
  const sourceFiles = ['package.json', 'package-lock.json'];
  for (const name of sourceFiles) {
    const source = path.join(runtimeScripts, name);
    const destination = path.join(runtimeDepsRoot, name);
    const bytes = fs.readFileSync(source);
    if (fs.existsSync(destination)) {
      if (!fs.readFileSync(destination).equals(bytes)) fail(`work-project runtime cache has a different ${name}; it is preserved at ${destination}`);
    } else {
      fs.writeFileSync(destination, bytes, { flag: 'wx' });
    }
  }
  const moduleRoot = path.join(runtimeDepsRoot, 'node_modules');
  if (!fs.existsSync(moduleRoot)) {
    const result = spawnSync('npm', ['ci', '--prefix', runtimeDepsRoot, '--no-audit', '--no-fund'], { cwd: runtimeDepsRoot, env, stdio: 'inherit' });
    if (result.error) fail(result.error.message, 1);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  assertWorkDisk(moduleRoot, 'runtime dependency path');
  for (const packageName of ['playwright', 'tone']) {
    if (!fs.existsSync(path.join(moduleRoot, packageName, 'package.json'))) fail(`pinned runtime dependency is incomplete: ${packageName}; existing cache is preserved`);
    const expected = JSON.parse(fs.readFileSync(lockPath, 'utf8')).packages[`node_modules/${packageName}`]?.version;
    const actual = JSON.parse(fs.readFileSync(path.join(moduleRoot, packageName, 'package.json'), 'utf8')).version;
    if (expected !== actual) fail(`pinned runtime dependency mismatch for ${packageName}: expected ${expected}, found ${actual}; existing cache is preserved`);
  }
  return 0;
}

function requirePinnedDependencies() {
  const moduleRoot = path.join(runtimeDepsRoot, 'node_modules');
  if (!fs.existsSync(moduleRoot)) fail('run the native setup command first; pinned dependencies belong in the work-project cache');
  assertWorkDisk(moduleRoot, 'runtime dependency path');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  for (const packageName of ['playwright', 'tone']) {
    const packageJson = path.join(moduleRoot, packageName, 'package.json');
    if (!fs.existsSync(packageJson)) fail(`run the native setup command first; pinned ${packageName} is missing from the work-project cache`);
    const expected = lock.packages[`node_modules/${packageName}`]?.version;
    const actual = JSON.parse(fs.readFileSync(packageJson, 'utf8')).version;
    if (expected !== actual) fail(`pinned runtime dependency mismatch for ${packageName}: expected ${expected}, found ${actual}`);
  }
}

function pinnedDependencyProblems() {
  const moduleRoot = path.join(runtimeDepsRoot, 'node_modules');
  if (!fs.existsSync(moduleRoot)) return ['pinned runtime dependencies are not installed in this work-project cache'];
  assertWorkDisk(moduleRoot, 'runtime dependency path');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const problems = [];
  for (const packageName of ['playwright', 'tone']) {
    const packageJson = path.join(moduleRoot, packageName, 'package.json');
    if (!fs.existsSync(packageJson)) {
      problems.push(`pinned ${packageName} is missing`);
      continue;
    }
    const expected = lock.packages[`node_modules/${packageName}`]?.version;
    const actual = JSON.parse(fs.readFileSync(packageJson, 'utf8')).version;
    if (expected !== actual) problems.push(`pinned ${packageName} version is ${actual}; expected ${expected}`);
  }
  return problems;
}

function diagnoseBaseEnvironment() {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  const nodeReady = Number.isFinite(major) && major >= 18;
  console.log(`[${nodeReady ? 'ok' : 'missing'}] node ${process.versions.node} (need 18+)`);
  let systemReady = nodeReady;
  for (const binary of ['ffmpeg', 'ffprobe']) {
    const result = spawnSync(binary, ['-version'], { encoding: 'utf8' });
    const version = result.status === 0 ? (result.stdout || '').split(/\r?\n/u)[0] : '';
    const ready = result.status === 0 && !!version;
    systemReady &&= ready;
    console.log(`[${ready ? 'ok' : 'missing'}] ${binary}${ready ? ` · ${version}` : ''}`);
  }
  return systemReady;
}

function animatedWebpSupport() {
  const encoders = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const ffmpegEncoder = encoders.status === 0 && /\blibwebp(?:_anim)?\b/u.test(`${encoders.stdout || ''}\n${encoders.stderr || ''}`);
  const muxer = spawnSync('img2webp', ['-version'], { encoding: 'utf8' });
  const img2webp = muxer.status === 0;
  return { available: ffmpegEncoder || img2webp, methods: [ffmpegEncoder ? 'ffmpeg/libwebp' : null, img2webp ? 'img2webp' : null].filter(Boolean) };
}

function printAnimatedWebpSupport() {
  const support = animatedWebpSupport();
  console.log('[ok] 同轮动态草稿可用 progress --stage scenes --draft-probe 发布不超过 6 秒的可播放项目快照；它不是正式制作预览。');
  console.log(`[${support.available ? 'ok' : 'unavailable'}] 动态 WebP artifact 转换：${support.available ? support.methods.join(' / ') : '未发现 ffmpeg libwebp encoder 或 img2webp；MP4 不能单独作为当前工作台可回放小样'}`);
  return support;
}

function getExecutionRuntime() {
  const modulesTarget = path.join(runtimeDepsRoot, 'node_modules');
  if (!fs.existsSync(modulesTarget)) fail('run the native setup command first; pinned dependencies are missing from the work-project cache');
  assertWorkDisk(modulesTarget, 'runtime dependency path');
  const executionParent = path.dirname(executionRuntimeRoot);
  fs.mkdirSync(executionParent, { recursive: true });
  assertWorkDisk(executionParent, 'execution cache path');
  const sourceModules = path.join(runtimeScripts, 'node_modules');
  if (!fs.existsSync(executionRuntimeRoot)) {
    const stageRoot = fs.mkdtempSync(path.join(executionParent, '.runtime-stage-'));
    const stagedRoot = path.join(stageRoot, 'runtime');
    const stagedModules = path.join(stagedRoot, 'scripts', 'node_modules');
    try {
      fs.cpSync(runtimeRoot, stagedRoot, {
      recursive: true,
      filter: source => path.resolve(source) !== sourceModules,
      });
      assertWorkDisk(stagedRoot, 'staged execution runtime');
      verifyClosureAt(stagedRoot);
      fs.symlinkSync(modulesTarget, stagedModules, 'dir');
      try { fs.renameSync(stagedRoot, executionRuntimeRoot); }
      catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes(error.code) || !fs.existsSync(executionRuntimeRoot)) throw error;
      }
    } finally {
      fs.rmSync(stageRoot, { recursive: true, force: true });
    }
  }
  assertWorkDisk(executionRuntimeRoot, 'execution runtime path');
  verifyClosureAt(executionRuntimeRoot);
  const copiedModules = path.join(executionRuntimeRoot, 'scripts', 'node_modules');
  const linkStat = fs.lstatSync(copiedModules, { throwIfNoEntry: false });
  if (!linkStat?.isSymbolicLink()) fail('execution runtime dependency link is missing or was replaced; it is preserved for review');
  let actualTarget;
  try { actualTarget = fs.realpathSync(copiedModules); }
  catch { fail('execution runtime dependency link is broken; it is preserved for review'); }
  if (actualTarget !== fs.realpathSync(modulesTarget)) fail('execution runtime dependency link points to another work-project cache; it is preserved for review');
  return { root: executionRuntimeRoot, scripts: path.join(executionRuntimeRoot, 'scripts') };
}

function runExecutionCopy(commandForRuntime) {
  const runtime = getExecutionRuntime();
  const spec = commandForRuntime(runtime);
  const result = spawnSync(spec.command, spec.args, {
    cwd: spec.cwd ?? workRoot,
    env: spec.env,
    stdio: 'inherit',
  });
  if (result.error) fail(result.error.message, 1);
  process.exit(result.status ?? 1);
}

function runtimeScriptRoot() {
  const modulesPath = path.join(runtimeScripts, 'node_modules');
  const stat = fs.lstatSync(modulesPath, { throwIfNoEntry: false });
  if (!stat) return runtimeRoot;
  if (!stat.isSymbolicLink()) return getExecutionRuntime().root;
  try {
    if (fs.realpathSync(modulesPath) === fs.realpathSync(path.join(runtimeDepsRoot, 'node_modules'))) return runtimeRoot;
  } catch {}
  return getExecutionRuntime().root;
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function fileSha256(file) {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const bytes = Buffer.allocUnsafe(Math.min(Math.max(fs.fstatSync(fd).size, 1), 1024 * 1024));
    for (let count = fs.readSync(fd, bytes); count; count = fs.readSync(fd, bytes)) hash.update(bytes.subarray(0, count));
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function codePointLength(text) { return Array.from(text).length; }
function shellQuote(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }
function projectReference(project) { return path.relative(workRoot, project) || '.'; }
function inputReceiptPath(project) { return path.join(project, inputReceiptName); }
function inputCommand(name, target, extra = '') {
  return `${shellQuote(process.execPath)} ${shellQuote(fileURLToPath(import.meta.url))} ${name} ${shellQuote(target)}${name === 'input-page' ? ' --next' : ''}${extra ? ` ${extra}` : ''}`;
}
function setupCommand() {
  return `${shellQuote(process.execPath)} ${shellQuote(fileURLToPath(import.meta.url))} setup`;
}

function adaptBriefText(text, currentSpec = '1920x1080') {
  const start = [
    '确认 work root 后尽早启动同一项目的 editor --progress 工作台，并主动打开浏览器核验；服务就绪不代表页面已打开，只有实际核验后才记录为已打开。阶段状态、方向关键帧、连续运动小样和可复查镜头自查完成后更新同一页。',
    '先确定本轮关键帧来源。明确调用 Cover 制作实图时，在 direction 中写 styleframe-source: cover，经核对的 PNG 按事件与秒数发布；普通 Motion 项目使用代码静帧。连续运动是核心时，同轮提供有明确镜头/时间范围且不超过 6 秒的动态草稿小样。',
    '正式制作前等待用户针对当前方向关键帧作明确确认，或记录用户对明确具体范围的免确认授权；“你决定”“给我惊喜”不单独构成豁免。记录用户原话、确认范围、设计指纹及关键帧文件哈希；CLI 回执只是制作端声明，不认证用户身份。',
    '完成画面与混音自查后，另行发布最终预览并等待用户确认当前版本可导出。用户明确确认前不执行 build 或其他正式成片导出。',
  ].join('\n');
  return text
    .replace('规格：…秒（≤1200，严格 / 允许浮动…秒）· 横屏/竖屏 · …×… · …fps', `规格：时长与帧率按本片确认；本轮画幅与像素规格：${currentSpec}`)
    .replace('制作过程预览：启用 / 未提出；用户反馈依据……；进度页链接……（启用时按 progress.md 更新阶段成果）', '制作工作台：默认在同一项目显示真实进度和可复查成果；启动服务后主动打开并核验浏览器；未核验时只记服务就绪与本机链接；按关键阶段和可看成果更新')
    .replace(/(<direction>\s*\n)/u, '$1motion-probe: pending-analysis; 由本片动作机制判断 required 或 not-required，并说明理由\n')
    .replace(/(<structure>\s*\n)/u, `$1填写唯一的十列制作片段登记，从片头到片尾使用成片时钟的连续区间；在同一 structure 为每行写一节 Markdown 标题“### [段ID] 段名”及完整导演正文。查本地制作协作的“时间片段与工作台交接”。\n\n${emptyProductionTable}\n\n`)
    .replace(/<start>[\s\S]*?<\/start>/u, `<start>\n${start}\n</start>`);
}

function isSha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJsonValue(value[key])]));
  return value;
}

function stableJsonStringify(value) { return JSON.stringify(stableJsonValue(value)); }

function callResourceCli(argv, { json = true } = {}) {
  const script = path.join(skillRoot, 'scripts', 'laohu-styles.py');
  if (!fs.existsSync(script)) fail('缺少统一视觉资源读取器 scripts/laohu-styles.py；不回退到旧75目录。');
  const repoRoot = path.resolve(skillRoot, '../../..');
  const result = spawnSync('python3', ['-B', script, ...argv], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) fail(`统一视觉资源读取失败：${result.error.message}`);
  if (result.status !== 0) {
    const summary = argv.filter((arg, index) => arg !== '--text' && !arg.startsWith('--text=') && argv[index - 1] !== '--text');
    fail(`统一视觉资源读取失败（${summary.join(' ')}）：${(result.stderr || result.stdout || 'resource CLI returned no details').trim()}`);
  }
  if (!json) return result.stdout || '';
  try { return JSON.parse(result.stdout); }
  catch { fail(`统一视觉资源读取器没有返回 JSON：${argv[0]}`); }
}

function parseLocalOptions(argv, allowed, command) {
  const values = {};
  for (let index = 0; index < argv.length; index++) {
    const part = argv[index], [name, inline] = part.split(/=(.*)/su, 2);
    if (!allowed.has(name)) fail(`${command} 不支持参数：${part}`);
    const value = inline ?? argv[++index];
    if (!value || value.startsWith('--')) fail(`${name} 缺少路径值。`);
    if (Object.hasOwn(values, name)) fail(`${name} 只能指定一次。`);
    values[name] = value;
  }
  return values;
}

async function currentChapterBinding(project, timelineRelative = 'timeline.js') {
  const briefPath = localProjectFile(project, 'brief.md', '章节绑定 brief');
  const timelinePath = localProjectFile(project, timelineRelative, '章节绑定 timeline.js');
  const planSha256 = sha256(fs.readFileSync(briefPath));
  const timelineSha256 = sha256(fs.readFileSync(timelinePath));
  const projectId = `showreel:${sha256(Buffer.from(projectReference(project))).slice(0, 24)}`;
  const revision = Number.parseInt(sha256(Buffer.from(`${planSha256}:${timelineSha256}`)).slice(0, 12), 16) + 1;
  return { projectId, revision, planSha256, timelineSha256 };
}

async function loadChapterTimeline(project, timelineRelative, binding) {
  const timelinePath = localProjectFile(project, timelineRelative, 'timeline.js');
  const url = `${pathToFileURL(timelinePath).href}?sha256=${binding.timelineSha256}`;
  let module;
  try { module = await import(url); }
  catch (error) { fail(`无法读取当前 timeline.js 模块：${error.message}`); }
  const durationSeconds = Number(module.DUR ?? module.durationSeconds ?? module.duration);
  const sourceEvents = module.CHAPTER_EVENTS ?? module.EVENTS ?? module.SHOTS;
  if (!(durationSeconds > 0) || !Array.isArray(sourceEvents)) fail('timeline.js 必须导出正时长 DUR 与 CHAPTER_EVENTS、EVENTS 或 SHOTS；章节时码不从自由输入推测。');
  const events = sourceEvents.map((event, index) => {
    if (!event || typeof event.id !== 'string' || !Number.isFinite(event.t0) || !Number.isFinite(event.t1)) fail(`timeline.js 的第 ${index + 1} 个章节事件必须有稳定 id、t0 与 t1。`);
    return { id: event.id, t0: event.t0, t1: event.t1 };
  });
  return { timelinePath, timeline: { durationSeconds, events, binding } };
}

function writeProjectArtifact(project, relativePath, content, label) {
  const target = outputPathInside(project, relativePath, label);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  assertWorkDisk(path.dirname(target), label);
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === content) return target;
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, { flag: 'w' });
  assertWorkDisk(temporary, label);
  fs.renameSync(temporary, target);
  return target;
}

function writeReadOnlyTextCoverage(project, report) {
  const cacheDir = path.join(project, '.cache');
  assertWorkDisk(cacheDir, 'screen text cache directory');
  fs.mkdirSync(cacheDir, {recursive: true});
  const target = path.join(cacheDir, 'brief-text-coverage.json');
  const existing = fs.lstatSync(target, {throwIfNoEntry: false});
  if (existing) {
    if (!existing.isFile()) fail(`existing ${target} is not an ordinary generated report; preserved`);
    let previous;
    try { previous = JSON.parse(fs.readFileSync(target, 'utf8')); } catch { fail(`existing ${target} is unreadable; preserved`); }
    if (previous.format !== 'laohu.motion.screen-text-coverage-report/1' || previous.generated !== true) fail(`existing ${target} is not a recognized generated report; preserved`);
  }
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({...report, format: 'laohu.motion.screen-text-coverage-report/1', generated: true}, null, 2)}\n`, {flag: 'wx', mode: 0o444});
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o444);
  } catch (error) {
    try { fs.rmSync(temporary, {force: true}); } catch {}
    throw error;
  }
  return target;
}

function writeReadOnlyRuntimeModule(project, relativePath, source, label) {
  const realProject = fs.realpathSync(project);
  const target = path.resolve(realProject, relativePath);
  const relative = path.relative(realProject, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail(`${label}必须位于当前项目内。`);
  const realParent = fs.realpathSync(path.dirname(target));
  const realRelative = path.relative(realProject, realParent);
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) fail(`${label}不能通过符号链接写出当前项目。`);
  assertWorkDisk(realParent, label);
  const sourceSha256 = sha256(Buffer.from(source));
  const marker = `// laohu-generated-runtime-module/1 path=${relativePath} sourceSha256=${sourceSha256}\n`;
  const generated = `${marker}${source}`;
  const current = fs.lstatSync(target, {throwIfNoEntry: false});
  if (current) {
    if (!current.isFile()) fail(`现有 ${target} 不是普通文件；已保留，未覆盖。`);
    const existing = fs.readFileSync(target, 'utf8');
    if (existing === generated) { fs.chmodSync(target, 0o444); return target; }
    const existingMarker = /^\/\/ laohu-generated-runtime-module\/1 path=([^\s]+) sourceSha256=([a-f0-9]{64})\n/u.exec(existing);
    if (existingMarker) {
      const oldSource = existing.slice(existingMarker[0].length);
      if (existingMarker[1] !== relativePath || sha256(Buffer.from(oldSource)) !== existingMarker[2]) {
        fail(`现有 ${target} 的生成标记与内容不匹配；已保留，未覆盖。`);
      }
    } else if (existing !== source) {
      fail(`现有 ${target} 与受信任 ${label} 源码不同；已保留，未覆盖。`);
    }
  }
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, generated, {flag: 'wx', mode: 0o444});
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o444);
  } catch (error) {
    try { fs.rmSync(temporary, {force: true}); } catch {}
    throw error;
  }
  return target;
}

function publishBriefTextInputs(project, map) {
  const readyMap = prepareBriefTypefaces(map, {
    repoRoot: fs.realpathSync(path.resolve(skillRoot, '../../..')),
    readFont: (id, text) => callResourceCli(['resource-get', '--id', id, `--text=${text}`]),
    outputPath: relative => outputPathInside(project, relative, '本片字体与许可'),
  });
  const mapOutput = outputPathInside(project, '.cache/brief-text-map.json', '屏显字项映射');
  fs.mkdirSync(path.dirname(mapOutput), {recursive: true});
  const textRuntimeSource = fs.readFileSync(fileURLToPath(new URL('./screen-text-contract.mjs', import.meta.url)), 'utf8');
  const textRuntimePath = writeReadOnlyRuntimeModule(project, '.cache/brief-text-contract.mjs', textRuntimeSource, '屏显文字受控 consumer');
  const captionRuntimeSource = fs.readFileSync(path.join(skillRoot, 'templates/runtime/native-presentation/captions.mjs'), 'utf8');
  const captionRuntimePath = writeReadOnlyRuntimeModule(project, '.cache/native-caption-runtime.mjs', captionRuntimeSource, '原生字幕正式 profile consumer');
  if (map.captionSource) {
    for (const name of ['SourceHanSansCN-700.ttf', 'OFL.txt']) {
      const source = path.join(skillRoot, 'templates/runtime/native-presentation/fonts', name);
      const target = outputPathInside(project, `fonts/captions/${name}`, '原生字幕字体及许可');
      materializeAsset(target, fs.readFileSync(source));
    }
  }
  const mapPath = writeReadOnlyBriefTextMap(project, readyMap);
  if (fs.statSync(mapPath).mode & 0o222) fail('编译后的 brief-text-map.json 未保持只读。');
  return {readyMap, mapPath, textRuntimePath, captionRuntimePath};
}

async function pageVisualAssets(page, port) {
  const urls = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  const origin = `http://127.0.0.1:${port}`;
  const visibleFile = /\.(?:avif|gif|jpe?g|png|svg|webp|webm|mp4|woff2?|ttf|otf|glb|gltf|hdr|exr)$/iu;
  const relative = urls.map(value => new URL(value)).filter(url => url.origin === origin && visibleFile.test(url.pathname))
    .map(url => decodeURIComponent(url.pathname.slice(1)));
  return [...new Set(relative)].sort();
}

function compileProjectBriefTextMap(project, brief, explore = isExploring(project)) {
  const compile = text => compileBriefTextMap(text, {projectRoot: project});
  if (!explore) return compile(brief);
  const problem = briefProblem(project, { explore: true });
  if (problem) fail(problem);
  return compileExplorationTextMap(brief, topLevelBriefBlocks(project, brief), compile);
}

function prepareProjectBriefTextInputs(project, explore = isExploring(project)) {
  const brief = fs.existsSync(path.join(project, 'brief.md'))
    ? fs.readFileSync(localProjectFile(project, 'brief.md', '屏显文字 brief'), 'utf8') : '';
  const previousPath = path.join(project, '.cache/brief-text-map.json');
  let previous;
  try { previous = JSON.parse(fs.readFileSync(previousPath, 'utf8')); } catch { /* The publisher diagnoses conflicts before replacing a cache file. */ }
  if (!hasControlledBriefText(brief, previous)) return;
  return publishBriefTextInputs(project, compileProjectBriefTextMap(project, brief, explore));
}

async function runBriefTextContract(project, {direction, start = 0, duration, fps = 30, size = '1920x1080', allowCaptionCalibration = false,
  captionProfile = null, businessQuery = '', enforceWindow = false, finalClockDuration = null, exhaustiveFrames = false,
  points, fullDuration = start === 0 && duration === undefined && points === undefined,
  useDefaultDirection = finalClockDuration !== null, publishReport = true, trackVisualAssets = false} = {}) {
  if (typeof direction !== 'string' || !direction.trim() || direction.trim() === '共用') fail('--text-direction 需要所选的具体方向名；共用只用于 Brief 登记，不能代替本轮选择。');
  requirePhaseDirection(project, direction);
  if (!Number.isFinite(start) || start < 0 || (duration !== undefined && (!Number.isFinite(duration) || duration <= 0))
    || !Number.isFinite(fps) || fps <= 0 || fps > 240) fail('屏显文字预检需要有效的 --start、--duration 和 --fps。');
  const sizeMatch = /^(\d+)x(\d+)$/u.exec(size);
  if (!sizeMatch || Number(sizeMatch[1]) % 2 || Number(sizeMatch[2]) % 2) fail(`无效画幅 ${size}；请使用偶数像素 WxH。`);
  const briefPath = localProjectFile(project, 'brief.md', '屏显文字 brief');
  const brief = fs.readFileSync(briefPath, 'utf8');
  const rawMap = compileProjectBriefTextMap(project, brief);
  const sources = textSourceFiles(project);
  const staticReport = scanProjectTextBindings(sources, rawMap, {direction, start, end: duration === undefined ? Infinity : start + duration, points});
  if (staticReport.status === 'FAIL') fail(`screen-text renderer 入口扫描发现未登记文字、未知 ID 或方向不匹配：\n${staticReport.problems.join('\n')}`);
  const rendererEntrypoints = sources.filter(source => source.rendererEntrypoint);
  if (!rendererEntrypoints.length) fail('index.html 没有可识别的真实 renderer 脚本入口；不能将静态规则误报为实际调用核验。');
  const {readyMap: map, mapPath, textRuntimePath, captionRuntimePath} = publishBriefTextInputs(project, rawMap);
  let shots = [];
  if (!points && !exhaustiveFrames) {
    const {readClock} = await import('../templates/runtime/production-workbench/model.mjs');
    try { shots = (await readClock(project)).shots; }
    catch (error) { console.warn(`屏显预检无法从 timeline.js 读取镜头边界：${error.message}`); }
  }

  // The contract launches a browser inside this process, before the separate
  // render command. Bind its own cache and temporary paths to the work volume.
  const {TMPDIR, TMP, TEMP, PLAYWRIGHT_BROWSERS_PATH, SHOWREEL_ANGLE} = bindShowreelBrowser(runtimeEnv());
  Object.assign(process.env, {TMPDIR, TMP, TEMP, PLAYWRIGHT_BROWSERS_PATH, SHOWREEL_ANGLE});
  const runtimeModule = path.join(getExecutionRuntime().scripts, 'lib/browser.mjs');
  const {loadChromium, launch, serve, resolveTarget, openPage} = await import(pathToFileURL(runtimeModule).href);
  const {w, h} = {w: Number(sizeMatch[1]), h: Number(sizeMatch[2])};
  const target = resolveTarget(project);
  const {server, port} = await serve(target.root);
  let browser;
  try {
    const chromium = await loadChromium(project);
    browser = await launch(chromium);
    const serializedMap = JSON.stringify(map).replace(/</gu, '\\u003c').replace(/\u2028/gu, '\\u2028').replace(/\u2029/gu, '\\u2029');
    const init = `(${createBriefTextRuntime.toString()})(${serializedMap}, {host: globalThis, guardCanvasText: true, allowCaptionCalibration: ${allowCaptionCalibration === true}});`;
    const query = new URLSearchParams(businessQuery);
    if (!useDefaultDirection) query.set('laohuTextDirection', direction.trim());
    if (captionProfile) query.set('laohuCaptionProfile', captionProfile);
    if (allowCaptionCalibration === true) query.set('laohuCaptionCalibration', '1');
    const page = await openPage(browser, {port, rel: target.rel, w, h, dpr: 1, query: query.toString(), init});
    const trace = await page.evaluate(async ({startAt, requestedDuration, fpsValue, selectedDirection, expectedBriefSha256, bounded,
      confirmedDuration, shots, points, exhaustiveFrames, fullDuration}) => {
      if (typeof window.render !== 'function') throw new Error('renderer page does not expose window.render(t)');
      const sceneDuration = Number(window.DUR);
      if (confirmedDuration !== null && (!Number.isFinite(sceneDuration) || Math.abs(sceneDuration - confirmedDuration) > 1e-6)) {
        throw new Error('工程页面的 window.DUR 与当前成片时钟不一致。');
      }
      const durationFromStart = sceneDuration - startAt;
      const total = requestedDuration ?? (points && !Number.isFinite(sceneDuration) ? Math.max(...points) - startAt + 1 / fpsValue : durationFromStart);
      if (!(Number.isFinite(total) && total > 0)) throw new Error('window.DUR is missing or invalid; pass --duration');
      if (bounded && (!(durationFromStart > 0) || total > durationFromStart + 1e-6)) throw new Error('取样时段须完整位于当前工程的实际时钟内。');
      const endAt = startAt + total;
      const api = window.__laohuBriefText;
      if (!api || api.format !== 'laohu.motion.screen-text-map/1') throw new Error('screen-text page contract was not installed');
      api.assertBriefSha256(expectedBriefSha256);
      api.resetUseTrace();
      const spec = {start: startAt, end: endAt, fps: fpsValue, direction: selectedDirection};
      const samplePlan = api.planFrames({...spec, shots, points, exhaustiveFrames});
      const times = samplePlan.times ?? samplePlan.frames.map(frame => startAt + frame / fpsValue);
      await api.traceRender(async () => {
        for (const time of times) {
          await (window.RENDER_CONTEXT === true ? window.render(time, {frameTime: time, fps: fpsValue}) : window.render(time));
        }
      });
      const {frames, ...sampling} = samplePlan;
      if (samplePlan.mode === 'keyframes') sampling.frameIndices = frames;
      return {duration: total, end: endAt, renderedFrames: times.length, sampling,
        coverage: api.coverage({...spec, samplePlan, fullDuration, strict: false}),
        consumerBriefSha256: api.briefSha256, usage: api.report()};
    }, {startAt: start, requestedDuration: duration, fpsValue: fps, selectedDirection: direction.trim(), expectedBriefSha256: map.briefSha256,
      bounded: enforceWindow, confirmedDuration: finalClockDuration, shots, points, exhaustiveFrames, fullDuration});
    const visualAssetPaths = trackVisualAssets || managedReceipt(project) ? await pageVisualAssets(page, port) : [];
    if (trace.consumerBriefSha256 !== map.briefSha256) fail('live renderer consumed a stale brief-text map; the current Brief hash is required.');
    const selectedTypefaces = new Map((map.typefaces ?? []).map(face => [face.name, face]));
    const textById = new Map(map.entries.map(entry => [entry.id, entry]));
    for (const {id, typeface: used} of trace.usage.used) {
      const planned = selectedTypefaces.get(textById.get(id)?.typeface);
      if (!planned && !used) continue;
      if (!planned || !used || used.id !== planned.id || used.weight !== planned.weight || used.sha256 !== planned.sha256
        || !Number.isFinite(used.weightRange?.min) || !Number.isFinite(used.weightRange?.max)
        || used.weightRange.min < planned.weightRange.min || used.weightRange.max > planned.weightRange.max) {
        fail(`实际文字绘制的字体与当前 Brief 声明不一致：${id}。`);
      }
    }
    if (stableJsonStringify(trace.coverage.captionProfile) !== stableJsonStringify(trace.usage.captionProfile)) {
      fail('caption profile reported by usage and coverage consumers does not match.');
    }
    if (trace.usage.captionProfile) {
      const displayLanguages = map.captionSource?.manifest.displayLanguages ?? [...new Set(map.entries.filter(entry => entry.caption).map(entry => entry.language))];
      await verifyNativeCaptionProfileReport(trace.usage.captionProfile, {width: w, height: h, displayLanguages, calibrationMode: allowCaptionCalibration === true});
    }
    const blocking = trace.coverage.statuses.filter(item => item.status === 'FAIL' || fullDuration && item.status === 'NOT_COVERED_ENTRY');
    const expectedCaptionSource = map.captionSource && {kind: map.captionSource.kind, path: map.captionSource.path,
      sha256: map.captionSource.sha256, manifestSha256: map.captionSource.manifest.integrity.manifestSha256};
    if (captionProfile && trace.usage.captionProfile?.id !== captionProfile) fail(`当前动态探针没有实际使用指定的字幕 profile ${captionProfile}。`);
    if (expectedCaptionSource && (fullDuration || trace.usage.captionSource) &&
      (stableJsonStringify(expectedCaptionSource) !== stableJsonStringify(trace.usage.captionSource) || !trace.usage.captionProfile)) {
      blocking.push({id: expectedCaptionSource.path, status: 'FAIL', reason: 'live native caption consumer did not use the declared source and locked profile'});
    }
    const report = {generated: true, generatedAt: new Date().toISOString(), overall: blocking.length ? 'FAIL_RENDER_TRACE' : 'OBSERVE_RENDER_TRACE_ONLY',
      evidenceBoundary: 'PASS_SAMPLED_RENDER_TRACE covers selected render(t) calls, PASS_RENDER_TRACE covers every frame of the checked window, and PASS_STILL_RENDER_TRACE covers only requested stills. These traces record bound consumers and their declared fonts/caption profile. Pixel visibility, OCR, reading comfort and quality require separate evidence.',
      static: staticReport, briefSha256: map.briefSha256, mapPath: path.relative(project, mapPath).split(path.sep).join('/'),
      direction: direction.trim(), start, end: trace.end, duration: trace.duration, fps, size, visualAssetPaths,
      consumerBriefSha256: trace.consumerBriefSha256,
      runtimeModules: {briefText: path.relative(project, textRuntimePath).split(path.sep).join('/'),
        caption: path.relative(project, captionRuntimePath).split(path.sep).join('/')},
      renderedFrames: trace.renderedFrames, sampling: trace.sampling, coverage: trace.coverage, usage: trace.usage,
      captionSource: expectedCaptionSource ?? null,
      limitations: ['Static scanning follows executable scripts in the index.html renderer entry graph. Canvas text draws during sampled render(t) must go through their registered consumer.',
        'Dynamic DOM/SVG/Three text and text embedded in images require controlled consumers and separate frame review.',
        'External-image wording remains OBSERVE_IMAGE_TEXT_REQUIRES_VISUAL_REVIEW and needs human frame review.']};
    const reportPath = publishReport ? writeReadOnlyTextCoverage(project, report) : null;
    console.log(`屏显文字受控调用核验：${report.overall}；${trace.sampling.mode} · ${trace.renderedFrames}${trace.sampling.gridFrames ? ` / ${trace.sampling.gridFrames}` : ''} 帧。${reportPath ? `报告：${path.relative(project, reportPath).split(path.sep).join('/')}` : ''}`);
    if (trace.usage.captionProfile) {
      const profile = trace.usage.captionProfile;
      console.log(`字幕 profile：${profile.id} · ${profile.mode} · 当前消费值与 Brief 哈希已写入报告。`);
    }
    for (const [status, count] of Object.entries(trace.coverage.statuses.reduce((all, {status}) => ({...all, [status]: (all[status] ?? 0) + 1}), {}))) console.log(`  ${status} · ${count} 项`);
    for (const item of trace.coverage.statuses.filter(item => item.status.startsWith('NOT_'))) console.log(`  ${item.status} · ${item.id} · ${item.reason}`);
    if (blocking.length) throw Error(`required screen text lacks its own in-window render trace:\n${blocking.map(item => `  ${item.status} · ${item.id}${item.reason ? ` · ${item.reason}` : ''}`).join('\n')}`);
    return report;
  } finally {
    await browser?.close().catch(() => {});
    server.close();
  }
}

const chapterWorkbenchLinkMarker = '<!-- laohu:chapter-workbench-link -->';
function ensureChapterWorkbenchLink(project) {
  const indexPath = localProjectFile(project, 'index.html', '工作台场景页面');
  const current = fs.readFileSync(indexPath, 'utf8');
  if (current.includes(chapterWorkbenchLinkMarker)) return false;
  const script = `${chapterWorkbenchLinkMarker}\n<script>(function(){try{if(window.parent===window||window.parent.location.pathname!=='/editor')return;}catch{return;}var link=document.createElement('a');link.textContent='打开可点击的章节播放器';link.hidden=true;link.setAttribute('aria-label','打开可点击的视频章节播放器');link.style.cssText='position:fixed;z-index:2147483000;top:12px;right:12px;padding:8px 12px;border-radius:6px;background:#171b22;color:#fff;border:1px solid #a8b4c5;font:14px system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 12px #0008';document.body.append(link);async function refresh(){try{var response=await fetch('./chapter-navigation.json?ts='+Date.now(),{cache:'no-store'});if(!response.ok)return;var item=await response.json();if(typeof item.playerPath!=='string'||!item.playerPath)return;var url=new URL(item.playerPath,location.href);if(url.origin!==location.origin)return;link.href=url.href;link.hidden=false;}catch{}}refresh();setInterval(refresh,1500);})();</script>`;
  const bodyClose = /<\/body\s*>/iu;
  if (!bodyClose.test(current)) fail('当前 index.html 缺少 </body>，无法安全挂入工作台章节入口；未修改原页面。');
  writeProjectArtifact(project, 'index.html', current.replace(bodyClose, `${script}\n</body>`), '工作台章节入口');
  return true;
}

function chapterPlayerHtml(index, videoRelativePath, sceneRelativePath) {
  const indexJson = JSON.stringify(index.chapters).replace(/</gu, '\\u003c').replace(/\u2028/gu, '\\u2028').replace(/\u2029/gu, '\\u2029');
  const duration = Number(index.durationSeconds);
  if (!(duration > 0)) fail('章节播放器需要绑定的正时长。');
  const encodeRelativePath = value => value.split(path.sep).join('/').split('/').map(part => ['.', '..'].includes(part) ? part : encodeURIComponent(part)).join('/').replace(/&/gu, '&amp;').replace(/"/gu, '&quot;');
  const videoSrc = videoRelativePath ? encodeRelativePath(videoRelativePath) : '';
  const sceneSrc = `${encodeRelativePath(sceneRelativePath)}?render=1&amp;chapter-preview=1`;
  const initialMode = videoRelativePath ? 'video' : 'scene';
  return `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>章节预览</title>
<style>body{margin:0;background:#101318;color:#eef1f5;font:15px system-ui,sans-serif}.shell{max-width:1100px;margin:auto;padding:18px}.head{display:flex;justify-content:space-between;align-items:center;gap:16px}.back{color:#d4e0f0}.chapters{display:flex;gap:8px;overflow:auto;padding:8px 0 14px;border-bottom:1px solid #39414c}.chapter{flex:none;background:#242b35;border:1px solid #485362;border-radius:5px;color:inherit;padding:8px 11px;text-align:left;cursor:pointer}.chapter[aria-current="true"]{border-color:#b7c9e4;background:#303c4c}.chapter small{display:block;color:#b4c0cf;margin-top:3px}.player{display:block;width:100%;height:min(72vh,620px);margin-top:14px;background:#000;border:0}.player[hidden]{display:none}.note{color:#b4c0cf;font-size:13px}</style>
<main class="shell"><div class="head"><strong>视频章节导航</strong><a class="back" href="index.html">返回项目画面</a></div><nav class="chapters" aria-label="章节导航"></nav><video id="chapter-video" class="player" controls preload="metadata"${videoSrc ? ` src="${videoSrc}"` : ''}${videoSrc ? '' : ' hidden'}></video><iframe id="chapter-scene" class="player" title="当前场景章节预览" src="${sceneSrc}"${videoSrc ? ' hidden' : ''}></iframe><p class="note">${videoSrc ? '章节时间由当前 timeline.js 事件编译；点击章节会将成片播放器实际 seek 到该章起点。' : '正式 MP4 尚未就绪；当前预览通过真实场景的 render(t) 到达绑定章节。生成 MP4 后重新运行 chapter-index，可切换为成片播放器。'}</p></main>
<script>const chapters=${indexJson};const duration=${duration};const video=document.querySelector('#chapter-video');const sceneFrame=document.querySelector('#chapter-scene');const nav=document.querySelector('.chapters');const note=document.querySelector('.note');const buttons=[];let mode='${initialMode}';let lastTime=0;window.DUR=duration;window.READY=false;function clampTime(seconds){const limit=mode==='video'&&Number.isFinite(video.duration)?Math.min(duration,video.duration):duration;return Math.max(0,Math.min(limit,Number(seconds)||0));}function update(time=mode==='video'?video.currentTime:lastTime){for(let i=0;i<buttons.length;i++){const item=chapters[i];buttons[i].setAttribute('aria-current',String(time>=item.startSec&&time<item.endSec));}}function ready(){if(mode==='video'){if(video.readyState<1)return;window.READY=true;}else{const scene=sceneFrame.contentWindow;if(!scene||typeof scene.render!=='function'){window.READY=false;return;}window.READY=true;scene.render(lastTime);}for(const button of buttons)button.disabled=false;update();}function seekVideo(seconds){const target=clampTime(seconds);if(Math.abs(video.currentTime-target)<0.005){update(target);return Promise.resolve(target);}return new Promise((resolve,reject)=>{const done=()=>{video.removeEventListener('seeked',done);video.removeEventListener('error',bad);update(target);resolve(target);};const bad=()=>{video.removeEventListener('seeked',done);video.removeEventListener('error',bad);reject(new Error('章节视频 seek 失败'));};video.addEventListener('seeked',done);video.addEventListener('error',bad);video.currentTime=target;});}function seekScene(seconds){const target=clampTime(seconds);const scene=sceneFrame.contentWindow;if(!window.READY||!scene||typeof scene.render!=='function')return Promise.reject(new Error('当前场景尚未提供可 seek 的 render(t)'));lastTime=target;try{const result=scene.render(target);update(target);return Promise.resolve(result).then(()=>target);}catch(error){return Promise.reject(error);}}function seek(seconds){return mode==='video'?seekVideo(seconds):seekScene(seconds);}window.render=seek;try{if(window.parent!==window&&window.parent.location.pathname==='/editor'){video.muted=true;}}catch{}for(const chapter of chapters){const button=document.createElement('button');button.className='chapter';button.type='button';button.disabled=true;button.setAttribute('aria-label',chapter.title+'，'+chapter.timecode);button.innerHTML='<span></span><small></small>';button.querySelector('span').textContent=chapter.title;button.querySelector('small').textContent=chapter.timecode;button.addEventListener('click',()=>{seek(chapter.startSec).then(()=>{if(mode==='video')video.focus();else sceneFrame.focus();}).catch(error=>{note.textContent=error.message;});});nav.append(button);buttons.push(button);}video.addEventListener('loadedmetadata',ready,{once:true});video.addEventListener('timeupdate',update);video.addEventListener('seeked',update);sceneFrame.addEventListener('load',ready);if(mode==='video'){if(video.readyState>=1)ready();video.addEventListener('error',()=>{mode='scene';video.hidden=true;sceneFrame.hidden=false;note.textContent='成片视频不可读；已切换到真实场景的 render(t) 章节预览。';if(sceneFrame.contentDocument?.readyState==='complete')ready();});}else ready();</script></html>\n`;
}

function splitInputText(text, maxChars) {
  const chars = Array.from(text);
  const pieces = [];
  let start = 0;
  while (start < chars.length) {
    let end = Math.min(start + maxChars, chars.length);
    if (end < chars.length) {
      const newline = chars.lastIndexOf('\n', end - 1);
      if (newline > start + Math.floor(maxChars * 0.65)) end = newline + 1;
    }
    pieces.push(chars.slice(start, end).join(''));
    start = end;
  }
  return pieces.length ? pieces : [''];
}

function makeInputBundle(currentSpec, pageLimit = inputPageLimit) {
  if (!Number.isInteger(pageLimit) || pageLimit < 2000 || pageLimit > inputPageLimit) fail(`--page-characters 必须是 2000–${inputPageLimit} 之间的整数。`);
  const catalogText = callResourceCli(['resource-overview', '--scope', 'global-map'], { json: false });
  const catalogBinding = sha256(Buffer.from(catalogText));
  const styleIndexPath = 'templates/styles/index.json';
  const indexBytes = fs.readFileSync(path.join(skillRoot, styleIndexPath));
  const styleIndexSha256 = sha256(indexBytes);
  const sources = [
    { id: 'formal-style-index', sourcePath: styleIndexPath, bytes: indexBytes.length, sha256: styleIndexSha256 },
    { id: 'global-map', sourcePath: 'scripts/laohu-styles.py resource-overview --scope global-map',
      bytes: Buffer.byteLength(catalogText), sha256: catalogBinding },
  ];
  const deliverySources = [{ id: 'global-map', kind: 'global-map', sha256: catalogBinding }];
  const fingerprint = sha256(Buffer.from(JSON.stringify({
    format: 'laohu.motion.input-global-map/1', sourceLockSha256: sourceLockHash, styleIndexSha256,
    catalogBinding, pageCharacterLimit: pageLimit,
    currentSpec: currentSpec ? { size: currentSpec.size, width: currentSpec.width, height: currentSpec.height, fps: currentSpec.fps, source: currentSpec.source } : null,
  })));
  const specLine = currentSpec ? `current-spec: ${currentSpec.size} · ${currentSpec.fps} fps · ${currentSpec.source}` : 'current-spec: unspecified';
  const pages = splitInputText(catalogText, pageLimit - 280).map((content, index) => {
    const id = `p-${sha256(Buffer.from(`${specLine}\n${pageLimit}\n${index}\n${content}`)).slice(0, 16)}`;
    const text = `输入交付页 ${id}\n${specLine}\n--- L0 全局星图开始 ---\n${content}${content.endsWith('\n') ? '' : '\n'}--- L0 全局星图结束 ---\n`;
    const characters = codePointLength(text);
    if (characters > pageLimit) fail(`输入页面超过 ${pageLimit} 个 Unicode 字符上限，未写入回执。`);
    return { id, sha256: sha256(Buffer.from(text)), characters, bytes: Buffer.byteLength(text), sourceRefs: [{ id: 'global-map', sha256: catalogBinding }], text };
  });
  return { fingerprint, pageLimit, sourceLockSha256: sourceLockHash, styleIndexSha256, catalogBinding, sources, deliverySources, pages,
    totals: { fixed: { characters: 0, bytes: 0 }, catalog: { characters: codePointLength(catalogText), bytes: Buffer.byteLength(catalogText) } } };
}

function stateFromBundle(project, bundle, currentSpec) {
  return {
    format: 'laohu.motion.input-delivery/2',
    projectPath: projectReference(project),
    mode: hasExistingRenderer(project) ? 'full-redesign' : 'new-project',
    currentSpec,
    pageCharacterLimit: bundle.pageLimit,
    sourceFingerprint: bundle.fingerprint,
    sourceLockSha256: bundle.sourceLockSha256,
    styleIndexSha256: bundle.styleIndexSha256,
    catalogBinding: bundle.catalogBinding,
    sources: bundle.sources,
    deliverySources: bundle.deliverySources,
    totals: bundle.totals,
    pageRecords: bundle.pages.map(({ id, sha256: digest, characters, bytes, sourceRefs }) => ({ id, sha256: digest, characters, bytes, sourceRefs })),
    deliveredPages: [],
    pageReplays: [],
    status: 'pending',
    deliveryReceipt: null,
    candidates: {},
    confirmations: {},
  };
}

function writeInputState(project, state) {
  const target = inputReceiptPath(project);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'w' });
  fs.renameSync(temporary, target);
}

function readInputState(project, allowUnreadable = false) {
  const target = inputReceiptPath(project);
  if (!fs.existsSync(target)) return null;
  try { return JSON.parse(fs.readFileSync(target, 'utf8')); }
  catch {
    if (allowUnreadable) return null;
    fail(`input-delivery state is unreadable; preserve ${target} and run ${inputCommand('input-map', project)}`);
  }
}

function expectedInputPageRecords(bundle) {
  return bundle.pages.map(({ id, sha256: digest, characters, bytes, sourceRefs }) => ({ id, sha256: digest, characters, bytes, sourceRefs }));
}

function inputDeliveryDigestRows(pageRecords, deliveredPages) {
  const delivered = new Map(deliveredPages.map(item => [item.id, item]));
  return pageRecords.map(page => {
    const item = delivered.get(page.id);
    return { id: page.id, currentPageSha256: page.sha256, outputPageSha256: item?.outputPageSha256 ?? null,
      deliveryBasis: item?.deliveryBasis || null, sourceRefs: page.sourceRefs || [], wrapperSha256: item?.wrapperSha256 || null };
  });
}

function validInputPageRecord(record, page, sourceMap = null) {
  if (!record || record.id !== page.id || record.currentPageSha256 !== page.sha256) return false;
  if (page.sourceRefs && stableJsonStringify(record.sourceRefs || []) !== stableJsonStringify(page.sourceRefs)) return false;
  if (record.deliveryBasis === 'actual-output') {
    return record.outputPageSha256 === page.sha256 && record.characters === page.characters && record.bytes === page.bytes
      && isSha256(record.wrapperSha256);
  }
  if (record.deliveryBasis === 'source-reused') {
    return record.outputPageSha256 === null && Array.isArray(page.sourceRefs) && page.sourceRefs.length > 0
      && page.sourceRefs.every(ref => sourceMap?.get(ref.id)?.sha256 === ref.sha256);
  }
  return false;
}

function priorDeliveryWasComplete(state) {
  if (!state || state.format !== 'laohu.motion.input-delivery/2' || state.status !== 'catalog-delivered'
    || state.deliveryReceipt?.type !== 'catalog-delivered' || state.deliveryReceipt.inputFingerprint !== state.sourceFingerprint
    || !Array.isArray(state.pageRecords) || !Array.isArray(state.deliveredPages)) return false;
  if (!state.pageRecords.length || state.deliveryReceipt.pageCount !== state.pageRecords.length) return false;
  if (state.pageRecords.every(page => !Array.isArray(page.sourceRefs))) {
    const delivered = state.deliveredPages;
    if (delivered.length !== state.pageRecords.length || delivered.some((item, index) => item.id !== state.pageRecords[index]?.id || item.sha256 !== state.pageRecords[index]?.sha256)) return false;
    const oldDigest = sha256(Buffer.from(JSON.stringify(delivered.map(({ id, sha256: digest }) => ({ id, sha256: digest })))));
    return state.deliveryReceipt.pagesSha256 === oldDigest;
  }
  const sourceMap = new Map((state.deliverySources || []).map(source => [source.id, source]));
  const deliveredMap = new Map(state.deliveredPages.map(item => [item.id, item]));
  if (deliveredMap.size !== state.pageRecords.length || state.pageRecords.some(page => !validInputPageRecord(deliveredMap.get(page.id), page, sourceMap))) return false;
  const rows = inputDeliveryDigestRows(state.pageRecords, state.deliveredPages);
  return state.deliveryReceipt.pagesSha256 === sha256(Buffer.from(JSON.stringify(rows)));
}

function unchangedSourceRef(previous, bundle, ref) {
  const current = bundle.deliverySources.find(source => source.id === ref.id);
  if (!current || current.sha256 !== ref.sha256) return false;
  if (Array.isArray(previous.deliverySources)) {
    return previous.deliverySources.find(source => source.id === ref.id)?.sha256 === ref.sha256;
  }
  const oldSource = previous.sources?.find(source => source.id === ref.id);
  const newSource = bundle.sources.find(source => source.id === ref.id);
  return !!oldSource && !!newSource && oldSource.sha256 === newSource.sha256 && oldSource.sourcePath === newSource.sourcePath;
}

function sameInputSpec(previous, currentSpec, bundle) {
  const old = previous.currentSpec || {}, next = currentSpec || {};
  return previous.sourceLockSha256 === bundle.sourceLockSha256
    && (previous.pageCharacterLimit || inputPageLimit) === bundle.pageLimit
    && old.size === next.size && old.width === next.width && old.height === next.height && old.fps === next.fps && old.source === next.source;
}

function refreshInputDelivery(project, state, bundle) {
  const pages = expectedInputPageRecords(bundle), sourceMap = new Map(bundle.deliverySources.map(source => [source.id, source]));
  const deliveredMap = new Map((state.deliveredPages || []).map(item => [item.id, item]));
  const deliveredPages = pages.flatMap(page => {
    const record = deliveredMap.get(page.id);
    return validInputPageRecord(record, page, sourceMap) ? [record] : [];
  });
  state.pageRecords = pages;
  state.deliveredPages = deliveredPages;
  state.sourceFingerprint = bundle.fingerprint;
  state.sourceLockSha256 = bundle.sourceLockSha256;
  state.styleIndexSha256 = bundle.styleIndexSha256;
  state.catalogBinding = bundle.catalogBinding;
  state.sources = bundle.sources;
  state.deliverySources = bundle.deliverySources;
  state.pageCharacterLimit = bundle.pageLimit;
  state.totals = bundle.totals;
  state.lastPreparedWrapperSha256 = wrapperSha256;
  const complete = deliveredPages.length === pages.length;
  state.status = complete ? 'catalog-delivered' : 'pending';
  if (!complete) { state.deliveryReceipt = null; return state; }
  const rows = inputDeliveryDigestRows(pages, deliveredPages);
  const emitted = deliveredPages.filter(item => item.deliveryBasis === 'actual-output');
  state.deliveryReceipt = { type: 'catalog-delivered', inputFingerprint: bundle.fingerprint, pageCount: pages.length,
    pagesSha256: sha256(Buffer.from(JSON.stringify(rows))), characters: emitted.reduce((sum, item) => sum + item.characters, 0),
    bytes: emitted.reduce((sum, item) => sum + item.bytes, 0), emittedPageCount: emitted.length,
    sourceReusedPageCount: deliveredPages.length - emitted.length,
    wrapperSha256s: [...new Set(emitted.map(item => item.wrapperSha256).filter(Boolean))], completedAt: new Date().toISOString() };
  return state;
}

function recordInputPageOutput(state, page, deliveredAt) {
  const actualRecord = { id: page.id, sha256: page.sha256, currentPageSha256: page.sha256, outputPageSha256: page.sha256,
    characters: page.characters, bytes: page.bytes, sourceRefs: page.sourceRefs, deliveryBasis: 'actual-output', wrapperSha256, deliveredAt };
  state.deliveredPages = (state.deliveredPages || []).filter(item => item.id !== page.id).concat(actualRecord);
}

function reconcileInputState(project, previous, bundle, currentSpec) {
  if (!previous || previous.format !== 'laohu.motion.input-delivery/2' || previous.projectPath !== projectReference(project)) return stateFromBundle(project, bundle, currentSpec);
  const priorComplete = priorDeliveryWasComplete(previous), canReuseSources = priorComplete && sameInputSpec(previous, currentSpec, bundle);
  const priorPages = new Map((previous.pageRecords || []).map(page => [page.id, page]));
  const priorDelivered = new Map((previous.deliveredPages || []).map(item => [item.id, item]));
  const nextPages = expectedInputPageRecords(bundle), sourceMap = new Map(bundle.deliverySources.map(source => [source.id, source]));
  const deliveredPages = [];
  for (const page of bundle.pages) {
    const oldPage = priorPages.get(page.id), oldDelivery = priorDelivered.get(page.id);
    if (oldPage && oldPage.sha256 === page.sha256 && oldDelivery && validInputPageRecord(oldDelivery, oldPage, new Map((previous.deliverySources || []).map(source => [source.id, source])))) {
      deliveredPages.push(oldDelivery);
      continue;
    }
    if (!canReuseSources || !page.sourceRefs.every(ref => unchangedSourceRef(previous, bundle, ref))) continue;
    deliveredPages.push({ id: page.id, sha256: page.sha256, currentPageSha256: page.sha256, outputPageSha256: null,
      characters: 0, bytes: 0, sourceRefs: page.sourceRefs, deliveryBasis: 'source-reused', wrapperSha256: null,
      reusedFromBundleFingerprint: previous.sourceFingerprint, deliveredAt: previous.deliveryReceipt.completedAt || new Date().toISOString() });
  }
  const state = { ...previous, currentSpec, mode: hasExistingRenderer(project) ? 'full-redesign' : 'new-project',
    deliverySources: bundle.deliverySources, pageRecords: nextPages, deliveredPages };
  return refreshInputDelivery(project, state, bundle);
}

function validateInputState(project, state, bundle) {
  if (!state || state.format !== 'laohu.motion.input-delivery/2') return 'missing';
  if (state.projectPath !== projectReference(project)) return 'project-moved';
  if (state.sourceFingerprint !== bundle.fingerprint || state.sourceLockSha256 !== bundle.sourceLockSha256 || state.styleIndexSha256 !== bundle.styleIndexSha256 || state.catalogBinding !== bundle.catalogBinding) return 'stale';
  if ((state.pageCharacterLimit || inputPageLimit) !== bundle.pageLimit) return 'page-plan-changed';
  const expected = expectedInputPageRecords(bundle);
  if (stableJsonStringify(state.pageRecords) !== stableJsonStringify(expected)) return 'page-plan-changed';
  if (!Array.isArray(state.deliveredPages)) return 'metadata-only';
  const deliveredMap = new Map(state.deliveredPages.map(item => [item.id, item]));
  const sourceMap = new Map(bundle.deliverySources.map(source => [source.id, source]));
  if (deliveredMap.size !== state.deliveredPages.length || state.deliveredPages.some(item => !expected.some(page => page.id === item.id))) return 'invalid-pages';
  const validCount = expected.filter(page => validInputPageRecord(deliveredMap.get(page.id), page, sourceMap)).length;
  if (validCount < expected.length) return state.status === 'pending' && !state.deliveryReceipt ? 'incomplete' : 'metadata-only';
  const rows = inputDeliveryDigestRows(expected, state.deliveredPages);
  if (state.status !== 'catalog-delivered' || state.deliveryReceipt?.type !== 'catalog-delivered' || state.deliveryReceipt.inputFingerprint !== bundle.fingerprint || state.deliveryReceipt.pageCount !== expected.length || state.deliveryReceipt.pagesSha256 !== sha256(Buffer.from(JSON.stringify(rows)))) return 'metadata-only';
  return 'complete';
}

function readResourceEntry(id) {
  const row = callResourceCli(['resource-get', '--id', id]);
  if (!row || row.id !== id) fail(`资源 ID 不存在：${id}`);
  return row;
}

function readResourceFulltext(id, level = 'L2') {
  const value = callResourceCli(['resource-fulltext', '--id', id, '--level', level]);
  if (!value || value.id !== id || value.level !== level || typeof value.path !== 'string' || typeof value.content !== 'string'
    || !isSha256(value.sha256) || sha256(Buffer.from(value.content)) !== value.sha256 || Buffer.byteLength(value.content) !== value.bytes) {
    fail(`资源 ${id} 的 ${level} 正文身份、哈希或字节数校验失败。`);
  }
  return value;
}

function makeCandidateBundle(resource, pageLimit = inputPageLimit) {
  if (!Number.isInteger(pageLimit) || pageLimit < 2000 || pageLimit > inputPageLimit) fail(`--page-characters 必须是 2000–${inputPageLimit} 之间的整数。`);
  const row = resource.entry || resource;
  const fulltext = resource.fulltext || readResourceFulltext(row.id, 'L2');
  const producerMarkdown = row.producerMarkdown ?? (['font', 'type-use'].includes(row.sourceType) ? fulltext.path : null);
  if (!row?.id || typeof producerMarkdown !== 'string' || !producerMarkdown || fulltext.id !== row.id) fail('候选全文缺少稳定资源 ID 或 L2 生产正文。');
  if (row.sourceType === 'openmotion' && (fulltext.path !== row.producerMarkdown || fulltext.sourceRevision !== row.sourceRevision)) {
    fail(`资源 ${row.id} 的目录记录在读取指南时已更新，请重新读取候选。`);
  }
  const content = fulltext.content;
  const digest = fulltext.sha256;
  const sourcePath = row.source?.path || row.sourcePath || producerMarkdown;
  const sourceSha256 = row.source?.sha256 || row.sourceSha256 || null;
  const fingerprint = sha256(Buffer.from(stableJsonStringify({ id: row.id, resource: row, fullTextPath: fulltext.path, fullTextSha256: digest, pageCharacterLimit: pageLimit })));
  const pageText = (chunk, number, total) => `候选 L2 全文页 ${number}/${total}\nresource-id: ${row.id}\nresource-name: ${row.name || row.title || ''}\nsource-path: ${sourcePath}\nproducer-markdown: ${producerMarkdown}\navailability: ${JSON.stringify(row.availability ?? null)}\nlimitations: ${JSON.stringify(row.limitations ?? null)}\nfulltext-path: ${fulltext.path}\nfulltext-sha256: ${digest}\npage-character-limit: ${pageLimit} Unicode codepoints\n此页为明确选中资源的完整生产正文。回执只证明实际字节输出，不证明理解；宿主截断时按当前页 ID 重放。\n--- L2 正文开始 ---\n${chunk}\n--- L2 正文结束 ---\n`;
  let rawPages = splitInputText(content, Math.max(400, Math.min(inputSegmentLimit, pageLimit - 500)));
  const longestHeader = codePointLength(pageText('', rawPages.length, rawPages.length));
  if (rawPages.some(chunk => codePointLength(chunk) + longestHeader > pageLimit)) {
    // In the worst case every character goes on its own page. Reserve space for
    // the resulting page number as well as long catalog-relative paths.
    const maxPages = codePointLength(content);
    const bodyLimit = pageLimit - codePointLength(pageText('', maxPages, maxPages));
    if (bodyLimit < 1) fail(`候选正文分页超过 ${pageLimit} 个 Unicode 字符传输上限：${row.id}`);
    rawPages = splitInputText(content, bodyLimit);
  }
  const pages = rawPages.map((chunk, index) => {
    const text = pageText(chunk, index + 1, rawPages.length);
    const characters = codePointLength(text);
    if (characters > pageLimit) fail(`候选正文分页超过 ${pageLimit} 个 Unicode 字符传输上限：${row.id}`);
    return { id: String(index + 1).padStart(4, '0'), sha256: sha256(Buffer.from(text)), characters, bytes: Buffer.byteLength(text), text };
  });
  return { id: row.id, name: row.name || row.title || row.id, sourceSet: row.sourceSet || row.category || null, sourcePath, sourceSha256,
    producerMarkdown, availability: row.availability ?? null, limitations: row.limitations ?? null,
    ...(row.sourceRevision ? { sourceRevision: row.sourceRevision } : {}),
    fullTextPath: fulltext.path, fullTextSha256: digest, fullTextCharacters: codePointLength(content), fullTextBytes: fulltext.bytes, fingerprint, pages };
}

function candidateReceiptStatus(record, candidate) {
  if (!record || record.fingerprint !== candidate.fingerprint || record.fullTextSha256 !== candidate.fullTextSha256 || record.sourceRevision !== candidate.sourceRevision) return 'stale';
  const expected = candidate.pages.map(({ id, sha256: digest, characters, bytes }) => ({ id, sha256: digest, characters, bytes }));
  if (JSON.stringify(record.pageRecords) !== JSON.stringify(expected)) return 'page-plan-changed';
  if (!Array.isArray(record.deliveredPages)) return 'metadata-only';
  if (record.deliveredPages.length > expected.length || record.deliveredPages.some((item, index) => item.id !== expected[index]?.id || item.sha256 !== expected[index]?.sha256)) return 'invalid-pages';
  if (record.deliveredPages.length < expected.length) return record.status === 'pending' && !record.deliveryReceipt ? 'incomplete' : 'metadata-only';
  const pagesDigest = sha256(Buffer.from(JSON.stringify(record.deliveredPages.map(({ id, sha256: digest }) => ({ id, sha256: digest })))));
  if (record.status !== 'candidate-delivered' || record.deliveryReceipt?.type !== 'candidate-delivered' || record.deliveryReceipt.candidateFingerprint !== candidate.fingerprint || record.deliveryReceipt.fullTextSha256 !== candidate.fullTextSha256 || record.deliveryReceipt.pageCount !== expected.length || record.deliveryReceipt.pagesSha256 !== pagesDigest) return 'metadata-only';
  return 'complete';
}

function hasExistingRenderer(project) {
  if (['index.html', 'timeline.js', 'render.mjs', 'editor.mjs', 'build.sh', 'production-plan.json', 'remotion.config.js', 'remotion.config.ts'].some(name => fs.existsSync(path.join(project, name)))) return true;
  const packagePath = path.join(project, 'package.json');
  if (!fs.existsSync(packagePath)) return false;
  try {
    const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    return names.some(name => name === 'remotion' || name.startsWith('@remotion/'));
  } catch { return false; }
}

function existingConfiguredSpec(project) {
  for (const file of ['editor.json', 'production-plan.json', 'project.json']) {
    const target = path.join(project, file);
    if (!fs.existsSync(target)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (typeof data.size === 'string' && /^\d{3,5}x\d{3,5}$/u.test(data.size)) {
        const [width, height] = data.size.split('x').map(Number);
        return { size: data.size, width, height, fps: Number.isFinite(data.fps) && data.fps > 0 ? data.fps : 30 };
      }
      if (Number.isInteger(data.width) && Number.isInteger(data.height) && data.width > 0 && data.height > 0) return { size: `${data.width}x${data.height}`, width: data.width, height: data.height, fps: Number.isFinite(data.fps) && data.fps > 0 ? data.fps : 30 };
    } catch {}
  }
  return null;
}

function currentSpecPlan(project, existingRenderer, argv, previous = null, resume = false, currentMode) {
  const spec = optionValue(argv, '--spec');
  const fpsValue = optionValue(argv, '--fps');
  const source = optionValue(argv, '--spec-source');
  const evidence = optionValue(argv, '--spec-evidence-text');
  const hasDeclaration = spec !== null || fpsValue !== null || source !== null || evidence !== null;
  if (resume && !hasDeclaration) {
    if (!previous?.currentSpec || previous.projectPath !== projectReference(project) || previous.mode !== currentMode) fail('--resume 只能继续同一路径、同一 new-project/full-redesign 模式的现有方案；任务模式变化时需重新确定规格。');
    return previous.currentSpec;
  }
  if (source && !['explicit-user', 'explicit-inherit', 'default-16:9'].includes(source)) fail('--spec-source 只能是 explicit-user、explicit-inherit 或 default-16:9。');
  if (source === 'default-16:9') {
    if (spec || fpsValue) fail('default-16:9 不能同时传入显式 --spec/--fps。');
    return { size: '1920x1080', width: 1920, height: 1080, fps: 30, source, ...(evidence ? { evidenceText: evidence.trim() } : {}), declarationBoundary: 'default for new work or full redesign when this turn supplied no different specification' };
  }
  if ((spec !== null || fpsValue !== null) && !source) fail('显式 --spec/--fps 必须同时标明 --spec-source explicit-user，并附 --spec-evidence-text；CLI 记录只是制作端声明。');
  if (source === 'explicit-user') {
    if (!spec || !/^\d{3,5}x\d{3,5}$/u.test(spec)) fail('explicit-user 需要 --spec <宽>x<高>，例如 1920x1080。');
    if (fpsValue && !(Number(fpsValue) > 0 && Number(fpsValue) <= 240)) fail('--fps 必须是 0–240 范围内的正数。');
    validateDeclaration(evidence, `本轮画幅 ${spec}${fpsValue ? `、${fpsValue} fps` : ''}`, '规格');
    const [width, height] = spec.split('x').map(Number);
    return { size: spec, width, height, fps: fpsValue ? Number(fpsValue) : 30, source, evidenceText: evidence.trim(), declarationBoundary: 'agent-recorded-conversation-claim; user identity is not authenticated' };
  }
  if (source === 'explicit-inherit') {
    if (!existingRenderer) fail('新工程没有可沿用的既有规格；未明确指定时默认横屏 16:9（1920×1080）。');
    const configured = existingConfiguredSpec(project);
    if (!configured) fail('无法从 editor.json/production-plan.json/project.json 核验既有画幅；请提供 explicit-user 规格并附用户对话依据。');
    if (spec && spec !== configured.size) fail(`explicit-inherit 必须沿用当前工程规格 ${configured.size}；若用户要求改变，使用 explicit-user 并更新规格。`);
    if (fpsValue && Number(fpsValue) !== configured.fps) fail(`explicit-inherit 的帧率为 ${configured.fps}；若用户要求改变，使用 explicit-user。`);
    validateDeclaration(evidence, `全新重做沿用既有规格 ${configured.size}`, '规格继承');
    return { ...configured, source, evidenceText: evidence.trim(), declarationBoundary: 'agent-recorded-conversation-claim; user identity is not authenticated' };
  }
  if (source === 'explicit-user' || source === 'explicit-inherit') fail('显式规格来源缺少对应参数。');
  return { size: '1920x1080', width: 1920, height: 1080, fps: 30, source: 'default-16:9', declarationBoundary: 'default for new work or full redesign when this turn supplied no different specification' };
}

function briefBlockTags(text) {
  const topLevel = [], screenTextRegistry = [];
  for (const tag of text.matchAll(/^[\t ]*<(\/)?([A-Za-z][A-Za-z0-9:_-]*)\s*>[\t ]*$/gm)) {
    if (tag[2] === 'production-units') continue;
    (tag[2] === 'screen-text-registry' ? screenTextRegistry : topLevel).push(tag);
  }
  return { topLevel, screenTextRegistry };
}

function isExploring(project, receipt = managedReceipt(project)) { return receipt?.projectPhase === 'explore'; }
function usesScopedDirection(receipt) { return receipt?.directionFingerprintVersion === 3 || Boolean(receipt?.projectPhase); }

function requireProductionPhase(project, receipt = managedReceipt(project)) {
  if (isExploring(project, receipt)) fail('当前工程仍在方向探索；正式制作、成片预览和导出须使用 promote-production，并通过全片 Brief、真实时码和方向确认。');
}

function projectExplorationDirection(project) {
  try { return readExplorationDirection(topLevelBriefBlocks(project).direction ?? ''); }
  catch (error) { fail(error.message); }
}

function requirePhaseDirection(project, direction) {
  if (!managedReceipt(project)?.projectPhase) return;
  const selected = projectExplorationDirection(project).name;
  if (direction?.trim() !== selected) fail(`当前 Brief 的 direction-name 为「${selected}」；使用 --text-direction ${shellQuote(selected)}。`);
}

function projectProductionUnits(project, required = false) {
  const file = path.join(project, 'brief.md');
  if (!required && !fs.existsSync(file)) return null;
  try {
    return readBriefProductionUnits(fs.readFileSync(localProjectFile(project, 'brief.md', '制作片段 Brief'), 'utf8'), { required, projectRoot: project });
  } catch (error) { fail(error.message); }
}

async function productionUnitView(project, final, required = false) {
  const design = projectProductionUnits(project, required);
  if (!design) return null;
  const { readClock } = await import('../templates/runtime/production-workbench/model.mjs');
  const clock = await readClock(project);
  const view = resolveBriefProductionUnits(project, design, clock);
  if (final) {
    if (!(clock.duration > 0) || clock.draft) fail('最终预览或导出需要已确定的工程成片时间线。');
    const receipt = managedReceipt(project);
    if (receipt?.projectPhase && (clock.fps !== receipt.currentSpec.fps || Math.abs(clock.duration * clock.fps - Math.round(clock.duration * clock.fps)) > 1e-6)) {
      fail('成片 timeline.js 须使用已确认的帧率，时长需落在成片帧边界。');
    }
    const issues = [...view.issues, ...view.units.flatMap(unit => {
      if (unit.timeState === 'bound' && !unit.issues.length) return [];
      return [`${unit.id}：${unit.issues.join('、') || '等待绑定当前成片时钟'}`];
    })];
    if (issues.length) fail(`当前制作片段的真实时码尚未对齐：\n${issues.join('\n')}`);
  }
  return view;
}

function briefProblem(project, { explore = false } = {}) {
  const briefPath = path.join(project, 'brief.md');
  if (!fs.existsSync(briefPath) || !fs.statSync(briefPath).isFile()) return `缺少 brief.md。Analysis 需按原模板八个 XML 块，在 ${briefPath} 写完本项目 brief 后再运行 scaffold。`;
  const text = fs.readFileSync(briefPath, 'utf8');
  const { topLevel: tags, screenTextRegistry } = briefBlockTags(text);
  const events = tags.map(match => `${match[1] ? '/' : ''}${match[2]}`);
  const present = new Set(tags.map(tag => tag[2]));
  const expected = briefBlocks.filter(name => !explore || present.has(name)).flatMap(name => [name, `/${name}`]);
  if (JSON.stringify(events) !== JSON.stringify(expected) || explore && explorationBlocks.some(name => !present.has(name))) {
    return `brief.md 顶层须按顺序使用${explore ? '探索所需的 <role>、<inputs>、<direction>，其他块按内容增补' : `原八个 XML 块：${briefBlocks.map(name => `<${name}>…</${name}>`).join(' ')}`}。请在同一文件补齐。`;
  }
  if (screenTextRegistry.length) {
    const structureIndex = events.indexOf('structure');
    const [structureOpen, structureClose] = tags.slice(structureIndex, structureIndex + 2);
    const [registryOpen, registryClose] = screenTextRegistry;
    if (structureIndex < 0 || screenTextRegistry.length !== 2 || registryOpen[1] || !registryClose[1]
      || registryOpen.index <= structureOpen.index || registryClose.index >= structureClose.index) {
      return 'brief.md 的屏显文字登记必须是在 <structure> 内唯一且成对的 <screen-text-registry>。';
    }
  }
  for (let index = 0; index < tags.length; index += 2) {
    const open = tags[index], close = tags[index + 1];
    if ((!explore || explorationBlocks.includes(open[2])) && !text.slice(open.index + open[0].length, close.index).trim()) {
      return `brief.md 的 <${open[2]}> 内容为空；请写入本轮实际设计。`;
    }
  }
  const unresolvedTemplateMarkers = [
    /……/u,
    /待填/u,
    /pending-analysis/iu,
    /(?:^|\n)\s*(?:format|benchmark|structure|style|signals|hook|signature|visual-language|palette|type|motion|camera|texture|sound)\s*:\s*…/imu,
    /#…|…×…|…fps|…秒/u,
    /\|\s*…\s*\|/u,
    '【要确认 · 默认】',
    '【不用确认 · 用户明确免除风格帧确认】',
    '按情况只保留下面一段',
  ];
  if (unresolvedTemplateMarkers.some(marker => typeof marker === 'string' ? text.includes(marker) : marker.test(text))) return 'brief.md 仍含模板占位内容；请在同一个文件中写成本片的真实 brief 后再 scaffold。';
  return null;
}

function requireInputDelivery(project, displayTarget, { explore = false } = {}) {
  const nextPrepare = inputCommand('input-map', displayTarget);
  const state = readInputState(project);
  if (!state) fail(`新工程 scaffold 需要当前目录回执。下一步：${nextPrepare}`);
  const bundle = makeInputBundle(state.currentSpec, state.pageCharacterLimit || inputPageLimit);
  const status = validateInputState(project, state, bundle);
  if (status === 'stale' || status === 'page-plan-changed' || status === 'project-moved') fail(`目录回执已${status === 'stale' ? '过期' : status === 'page-plan-changed' ? '改变' : '指向移动前的项目路径'}；重新准备并输出当前目录。下一步：${nextPrepare}`);
  if (status !== 'complete') {
    if (status !== 'incomplete') fail(`目录回执只有元数据或格式无效。下一步：${nextPrepare}`);
    if (state.deliveredPages.length < bundle.pages.length) fail(`目录页尚未全部输出。下一步：${nextPrepare} --resume；单页读取也可用 ${inputCommand('input-page', displayTarget)}`);
    fail(`目录回执只有元数据或格式无效。下一步：${nextPrepare}`);
  }
  const problem = briefProblem(project, { explore });
  if (problem) fail(problem);
  if (explore) {
    projectExplorationDirection(project);
    if (motionProbeDeclaration(project)?.status !== 'required') fail('方向探索请在 <direction> 写 motion-probe: required; reason: <要验证的连续动作>，再制作 3–6 秒动态小样。');
  }
  const direction = topLevelBriefBlocks(project).direction;
  const mode = resourceModeFromText(direction);
  const resourceUses = resourceUsesFromText(direction);
  const selectedIds = [...new Set(resourceUses.map(item => item.id))];
  const resourceUseIds = new Set(selectedIds);
  if (mode === '1') {
    const primaryId = primaryStyleFromText(direction);
    if (!primaryId || !resourceUseIds.has(primaryId)) fail('resource-mode: 1 必须用 `primary-style: <stable-id>` 标出恰好一个用户选定的主风格；额外动作、字体或字幕资源可另列 resource-use。');
  }
  if (mode === '2' && selectedIds.length === 0) fail('默认 resource-mode: 2 必须实际选用并读取至少一个正式资源的完整 L2；在 <direction> 记录 resource-use ID 与本片贡献，再运行 input-candidate。不能以未声明资源或空列表跳过 L2。');
  if (mode === '3' && !benchmarkSourceSelections(direction).length) fail('resource-mode: 3 必须记录用户当前明确选择的 Benchmark 对标来源及其项目本地来源文件、SHA-256 和本片贡献；不能用旧75风格 ID 或勾选式声明代替来源证据。');
  if (mode === '3' && selectedIds.length === 0) fail('Benchmark 对标的研究来源不自动成为生产资源；先把获准采用的方法编入统一资源目录，再用 input-candidate 实际读取其完整 L2。当前 wrapper 尚不把 Benchmark 源记录直接当生产 Markdown。');
  if (mode === 'original-only' && (selectedIds.length || hasBenchmarkSourceDeclaration(direction))) fail('resource-mode: original-only 不能同时声明目录或 Benchmark 来源；如有实际来源，改用对应模式并记录来源。');
  if (mode === '1' && !quotedEvidence(direction, 'resource-selection-quote')) fail('resource-mode: 1 必须记录用户当前选择该单一方向的原话：resource-selection-quote: “…”；不要自行代用户选风格。');
  if (mode === '3' && !quotedEvidence(direction, 'benchmark-selection-quote')) fail('resource-mode: 3 必须记录用户当前明确指定对标的原话：benchmark-selection-quote: “…”；不要把 Analysis 自选参考升格为用户对标。');
  if (mode === 'original-only' && !quotedEvidence(direction, 'original-only-user-request')) fail('original-only 只适用于用户明确要求不采用任何风格/Benchmark 来源的纯原创请求；请记录对应原话 `original-only-user-request: “…”`，不接受通用勾选或模型自我豁免。');
  const benchmarkBindings = mode === '3' ? validateBenchmarkSourceSelections(project, direction) : [];
  for (const id of selectedIds) {
    const candidate = makeCandidateBundle(readResourceEntry(id), bundle.pageLimit);
    if (candidateReceiptStatus(state.candidates?.[id], candidate) !== 'complete') fail(`brief 声明采用 ${id}，但当前 L2 全文尚未完整实际输出或已变化。下一步：${inputCommand('input-candidate', displayTarget)} --id ${id}`);
  }
  if (!explore) projectProductionUnits(project, true);
  return { mode, selectedIds, benchmarkBindings };
}

function pngDimensions(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function topLevelBriefBlocks(project, text = fs.readFileSync(path.join(project, 'brief.md'), 'utf8')) {
  const { topLevel: tags } = briefBlockTags(text);
  const blocks = {};
  for (let index = 0; index < tags.length; index += 2) {
    const open = tags[index], close = tags[index + 1];
    if (!open || !close || open[1] || !close[1] || open[2] !== close[2]) continue;
    blocks[open[2]] = text.slice(open.index + open[0].length, close.index).trim();
  }
  return blocks;
}

function styleframeSource(project) {
  if (!fs.existsSync(path.join(project, 'brief.md'))) return 'code';
  const lines = (topLevelBriefBlocks(project).direction || '').split(/\r?\n/u);
  const values = lines.flatMap(line => {
    const match = /^\s*styleframe-source\s*[:：]\s*(.*?)\s*$/iu.exec(line);
    return match ? [match[1]] : [];
  });
  if (values.length > 1 || (values.length && !['cover', 'code', 'reference', 'mixed'].includes(values[0]))) fail('Brief 的 direction 只接受一项 styleframe-source 声明（cover、code、reference 或 mixed）。');
  return values[0] || 'code';
}

function resolveProjectSpec(project, sizeOverride = null, receipt = readInputState(project, true), fpsOverride = null) {
  const blocks = fs.existsSync(path.join(project, 'brief.md')) ? topLevelBriefBlocks(project) : {};
  const specs = [];
  for (const file of ['editor.json', 'production-plan.json', 'project.json']) {
    const target = path.join(project, file);
    if (!fs.existsSync(target)) continue;
    try { specs.push(JSON.parse(fs.readFileSync(target, 'utf8'))); } catch {}
  }
  const managedNewOrRedesign = ['new-project', 'full-redesign'].includes(receipt?.mode);
  const specLine = (blocks.inputs || '').split(/\r?\n/u).find(line => /^\s*(?:规格|画幅|分辨率)\s*[:：]/u.test(line));
  const briefMatch = specLine?.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/u);
  let size = null, source = null;
  if (managedNewOrRedesign) {
    const recorded = receipt.currentSpec;
    if (!recorded || !/^\d{3,5}x\d{3,5}$/u.test(recorded.size || '') || !(recorded.fps > 0)) fail('当前新建/全新重做项目没有记录本轮规格来源；重新运行 input-prepare 确认 current-spec。');
    size = recorded.size;
    source = recorded.source;
    if (briefMatch && `${briefMatch[1]}x${briefMatch[2]}` !== size) fail(`brief 当前画幅与 input-prepare 记录的本轮规格 ${size} 不一致；先修正 brief，再生成关键帧。`);
    if (sizeOverride && sizeOverride !== size) fail(`本轮规格回执为 ${size}；不能只靠 --size 改成 ${sizeOverride}。如用户改变规格，重新记录 explicit-user 规格并生成新关键帧。`);
    if (fpsOverride && Number(fpsOverride) !== recorded.fps) fail(`本轮规格回执为 ${recorded.fps} fps；不能只靠 --fps 改变。`);
  } else {
    if (sizeOverride) { size = sizeOverride; source = 'runtime-parameter'; }
    if (!size) {
      const declared = specs.find(item => typeof item.size === 'string' && /^\d{3,5}x\d{3,5}$/u.test(item.size));
      if (declared) { size = declared.size; source = 'existing-project-config'; }
    }
    if (!size && briefMatch) { size = `${briefMatch[1]}x${briefMatch[2]}`; source = 'existing-brief-spec'; }
  }
  if (!size) return { size: null, width: null, height: null, fps: null, source: 'unknown-existing-project-spec' };
  const match = size.match(/^(\d{3,5})x(\d{3,5})$/u);
  if (!match) fail(`无法解析当前画幅规格：${size}`);
  const fpsRow = specs.find(item => Number.isFinite(item.fps) && item.fps > 0);
  const fpsMatch = (blocks.inputs || '').match(/(?:^|\D)(\d{2,3})\s*fps\b/iu);
  const fps = managedNewOrRedesign ? receipt.currentSpec.fps : fpsOverride ? Number(fpsOverride) : fpsRow?.fps || (fpsMatch ? Number(fpsMatch[1]) : 30);
  return { size, width: Number(match[1]), height: Number(match[2]), fps, source };
}

function selectedResourceBindings(project, ids, receipt) {
  const unique = [...new Set(ids)].sort();
  const direction = fs.existsSync(path.join(project, 'brief.md')) ? topLevelBriefBlocks(project).direction : '';
  const mode = resourceModeFromText(direction);
  const directionIds = [...new Set(resourceUsesFromText(direction).map(item => item.id))];
  if (unique.some(id => !directionIds.includes(id))) fail('方向确认绑定的每个采用资源都须先在 brief 的 <direction> 写明 resource-use ID 与本片贡献；不能只靠命令参数添加。');
  if (mode === '1' && (!unique.length || !unique.includes(primaryStyleFromText(direction)))) fail('用户选择的主风格及其 L2 绑定缺失。');
  if (mode === '1' && !quotedEvidence(direction, 'resource-selection-quote')) fail('用户选择的主风格缺少 brief 中记录的当前用户原话。');
  if ((mode === '2' || mode === '3') && directionIds.length < 1) fail(`resource-mode: ${mode} 没有任何正式 L2 资源绑定。`);
  if (mode === 'original-only' && (unique.length || directionIds.length || hasBenchmarkSourceDeclaration(direction))) fail('original-only 不能同时绑定正式资源或 Benchmark 来源。');
  const bindings = unique.map(id => {
    const entry = readResourceEntry(id);
    const fulltext = readResourceFulltext(id, 'L2');
    const candidate = receipt?.candidates?.[id];
    const bundle = makeCandidateBundle({ entry, fulltext }, receipt?.pageCharacterLimit || inputPageLimit);
    if (candidateReceiptStatus(candidate, bundle) !== 'complete') fail(`所选资源的当前 L2 全文尚未实际完整输出：${id}；使用 input-candidate --id ${id}`);
    return { id, sourcePath: fulltext.path, sourceSha256: fulltext.sha256, producerMarkdown: bundle.producerMarkdown,
      availability: entry.availability ?? null, limitations: entry.limitations ?? null,
      ...(entry.sourceRevision ? { sourceRevision: entry.sourceRevision } : {}) };
  });
  if (mode === '3') bindings.push(...validateBenchmarkSourceSelections(project, direction));
  if (mode === 'original-only') {
    const quote = quotedEvidence(direction, 'original-only-user-request');
    if (!quote) fail('original-only 缺少用户明确提出纯原创要求的原话。');
    bindings.push({ id: 'original-only', sourceType: 'conversation-request', selectionSha256: sha256(Buffer.from(quote)) });
  }
  return bindings;
}

function directionDesign(project, spec) {
  return { size: spec.size, fps: spec.fps, direction: topLevelBriefBlocks(project).direction, styleframeSource: styleframeSource(project) };
}

function directionEvidence(project, ranges, observedPaths = [], suppliedDirection = null) {
  const receipt = managedReceipt(project);
  const direction = receipt?.projectPhase ? projectExplorationDirection(project).name : suppliedDirection;
  const brief = fs.readFileSync(localProjectFile(project, 'brief.md', '方向证据 Brief'), 'utf8');
  const map = hasControlledBriefText(brief) || receipt?.projectPhase ? compileProjectBriefTextMap(project, brief) : { entries: [] };
  const text = textEvidenceInRanges(map, direction, ranges);
  const adopted = readDirectionAssets(topLevelBriefBlocks(project, brief).direction ?? '');
  const paths = [...new Set([...adopted, ...observedPaths, ...text.entries.map(entry => entry.assetPath).filter(Boolean)])].sort();
  const files = paths.map(relative => {
    if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').includes('..')) fail(`方向采用素材必须使用项目相对路径：${relative}`);
    return [relative, fileSha256(localProjectFile(project, relative, '方向采用素材或字体'))];
  });
  return { ranges, paths, direction, sha256: sha256(stableJsonStringify({ direction, ranges, text, files })) };
}

function currentDirectionEvidence(project, evidence) {
  return Boolean(evidence?.ranges?.length && Array.isArray(evidence.paths)
    && directionEvidence(project, evidence.ranges, evidence.paths, evidence.direction).sha256 === evidence.sha256);
}

function designFingerprint(project, selectedResources, artifact, spec, motionProbeArtifactSet = null, declaration = null) {
  if (usesScopedDirection(managedReceipt(project))) {
    return sha256(stableJsonStringify({ format: 'laohu.motion.design-fingerprint/3', design: directionDesign(project, spec), selectedResources,
      previewArtifactSet: { revision: artifact.revision, artifacts: artifact.artifacts }, motionProbeArtifactSet,
      declaration: { evidenceText: declaration.evidenceText, scope: declaration.scope } }));
  }
  const substantive = relevantBriefFingerprint(project);
  const binding = { format: 'laohu.motion.design-fingerprint/2', mode: readInputState(project, true)?.mode || 'legacy-project',
    spec, substantive, selectedResources, previewArtifactSet: { revision: artifact.revision, artifacts: artifact.artifacts } };
  if (motionProbeArtifactSet) binding.motionProbeArtifactSet = motionProbeArtifactSet;
  return sha256(Buffer.from(JSON.stringify(binding)));
}

function currentStyleArtifact(project, requireWaiting = false) {
  const statusPath = path.join(project, '.showreel-progress/status.json');
  if (!fs.existsSync(statusPath)) fail('尚无制作工作台的 style 阶段回执；先用 progress 发布当前 PNG 关键帧并将阶段设为 waiting。');
  const state = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  const stage = state.stages?.find(item => item.id === 'style');
  if (requireWaiting && stage?.status !== 'waiting') fail('风格确认必须针对工作台中当前待反馈的 style 阶段。');
  const receipt = readInputState(project, true);
  const scoped = usesScopedDirection(receipt);
  const set = receipt?.keyframeSet;
  const rows = (state.artifacts || []).filter(item => item.stage === 'style' && item.type === 'image' && item.url?.endsWith('.png') && item.frame?.role !== 'implementation');
  if (!rows.length) fail('style 阶段没有已发布的 PNG 关键帧；空 artifact 列表不能确认方向。');
  const legacy = receipt?.format !== 'laohu.motion.input-delivery/2';
  const source = styleframeSource(project);
  if (legacy && !set) {
    if (source !== 'code') fail('Cover 设计帧需按本轮受管入口发布实际 PNG 及其事件。');
    const row = rows.at(-1), name = path.basename(row.url);
    const artifactPath = localProjectFile(project, path.join('.showreel-progress/artifacts', name), '工作台关键帧');
    const bytes = fs.readFileSync(artifactPath), digest = sha256(bytes), dimensions = pngDimensions(bytes);
    if (name !== `${digest}.png` || !dimensions) fail('工作台关键帧必须是非空、哈希匹配且可读取像素尺寸的 PNG 文件。');
    const item = { id: row.id, path: path.relative(project, artifactPath).split(path.sep).join('/'), sha256: digest, width: dimensions.width, height: dimensions.height };
    return { revision: `legacy-${row.id}`, artifacts: [item], sha256: sha256(Buffer.from(JSON.stringify([item]))), path: item.path, width: item.width, height: item.height };
  }
  if (!set || !Array.isArray(set.artifacts) || !set.artifacts.length) fail('style 阶段没有本轮已发布的 PNG 关键帧集合；空 artifact 列表不能确认方向。');
  if (set.artifacts.at(-1)?.id !== rows.at(-1)?.id) fail('style 阶段出现了尚未纳入本轮关键帧集合的新 PNG；更新展示后再确认。');
  const design = projectProductionUnits(project, receipt?.productionUnitsRequired === true);
  const framePlans = new Map(design?.units.flatMap(unit => unit.frames.map(frame => [frame.id, {frame, unit}])));
  const explorationMoments = new Map(receipt?.projectPhase ? projectExplorationDirection(project).moments.map(moment => [moment.id, moment]) : []);
  const currentIds = new Set(rows.map(item => item.id));
  const artifacts = set.artifacts.map(item => {
    if (!currentIds.has(item.id)) fail('本轮关键帧集合中的 artifact 已不在工作台；重新发布完整关键帧集合。');
    const row = rows.find(entry => entry.id === item.id);
    const name = path.basename(row.url);
    const artifactPath = localProjectFile(project, path.join('.showreel-progress/artifacts', name), '工作台关键帧');
    const bytes = fs.readFileSync(artifactPath), digest = sha256(bytes), expected = name.match(/^([a-f0-9]{64})\.png$/u)?.[1];
    const dimensions = pngDimensions(bytes);
    if (!expected || expected !== digest || !dimensions) fail('工作台关键帧必须是非空、哈希匹配且可读取像素尺寸的 PNG 文件。');
    if (item.sha256 !== digest || item.width !== dimensions.width || item.height !== dimensions.height) fail('工作台关键帧哈希或像素尺寸与本轮记录不一致。');
    if (source !== 'mixed' && (item.frame?.source || 'code') !== source) fail('已发布关键帧的来源与当前 Brief 不一致；按本轮设计帧来源发布。');
    if (scoped && !currentDirectionEvidence(project, item.frame?.directionEvidence || item.directionEvidence)) {
      fail(`关键帧 ${item.frame?.event ?? item.id} 的采用素材、字体或屏显文字已变化；重新发布当前画面。`);
    }
    const moment = explorationMoments.get(item.frame?.event);
    if (moment) {
      if (item.frame.timeSeconds !== moment.time || item.frame.explorationMomentSha256 !== sha256(stableJsonStringify(moment))) {
        fail(`关键帧 ${moment.id} 的代表时点或要检查的状态已变化；重新渲染并发布当前画面。`);
      }
    } else if (design && (item.frame || receipt?.productionUnitsRequired)) {
      const plan = framePlans.get(item.frame?.event);
      if (!plan || !scoped && item.frame.unitDesignRevision !== plan.unit.designRevision || !Number.isFinite(item.frame.timeSeconds)
        || Math.abs(item.frame.timeSeconds - plan.frame.time) > 1e-6) {
        fail(`关键帧 ${item.frame?.event ?? item.id} 对应的 Brief 字项、导演内容或时点已变化；请按本版设计重新发布该帧。`);
      }
    } else if (receipt?.projectPhase) {
      fail('方向探索关键帧必须对应当前 Brief 的代表时刻；按当前登记重新发布。');
    }
    if (item.frame) {
      if (item.frame.sourceSha256 !== digest || stableJsonStringify(item.frame) !== stableJsonStringify(row.frame)) {
        fail('工作台与关键帧回执的来源或事件关联已变化；重新发布当前事件的设计图。');
      }
      const originalPath = localProjectFile(project, item.frame.sourcePath, '原始设计 PNG');
      if (sha256(fs.readFileSync(originalPath)) !== digest) fail('原始设计图已变化；重新发布该事件并确认。');
    }
    return { id: row.id, path: path.relative(project, artifactPath).split(path.sep).join('/'), sha256: digest, width: dimensions.width, height: dimensions.height,
      ...(item.frame ? { frame: item.frame } : item.directionEvidence ? { directionEvidence: item.directionEvidence } : {}) };
  });
  const aggregate = sha256(Buffer.from(JSON.stringify(artifacts)));
  const last = artifacts.at(-1);
  return { revision: set.revision, artifacts, sha256: aggregate, path: last.path, width: last.width, height: last.height };
}

function readProgressState(project) {
  const file = path.join(project, '.showreel-progress/status.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail('工作台阶段回执不可读取；保留原文件并检查 .showreel-progress/status.json。'); }
}

function relevantBriefFingerprint(project) {
  const blocks = topLevelBriefBlocks(project);
  const inputLines = (blocks.inputs || '').split(/\r?\n/u).filter(line => !/^\s*(?:制作工作台|进度页链接|服务地址|浏览器实际打开状态)\s*[:：]/u.test(line));
  return { inputs: inputLines.join('\n'), direction: blocks.direction || '', structure: blocks.structure || '', build: blocks.build || '', gotchas: blocks.gotchas || '' };
}

function projectTreeFingerprint(project, phaseAware = false) {
  const excluded = new Set(['.git', '.cache', 'node_modules', 'out', 'qa', '.showreel-progress', '.showreel-editor', '.showreel-cache', '__pycache__']);
  const rendererCacheFiles = new Set(['brief-text-map.json', 'brief-text-contract.mjs', 'native-caption-runtime.mjs']);
  const derivedStudio = path.join(project, 'studio', 'openmotion');
  const rows = [];
  const readFile = file => {
    const relative = path.relative(project, file).split(path.sep).join('/');
    const digest = relative === 'brief.md' ? sha256(Buffer.from(JSON.stringify(relevantBriefFingerprint(project)))) : fileSha256(file);
    rows.push([relative, relative === 'brief.md' ? null : fs.statSync(file).size, digest]);
  };
  const visit = (directory, ancestors = new Set()) => {
    const real = fs.realpathSync(directory);
    if (ancestors.has(real)) fail(`工程哈希遇到循环目录链接：${directory}`);
    const descendants = new Set([...ancestors, real]);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (directory === project && entry.name === inputReceiptName) continue;
      const file = path.join(directory, entry.name);
      // The protected narration check writes this report during an ordinary export.
      if (phaseAware && entry.name === 'narration-qa.json' && path.basename(directory) === 'audio') continue;
      if (phaseAware && entry.name === '.cache') {
        for (const name of rendererCacheFiles) {
          const input = path.join(file, name);
          if (fs.statSync(input, {throwIfNoEntry: false})?.isFile()) readFile(input);
        }
      }
      if (excluded.has(entry.name) || file === derivedStudio) continue;
      if (phaseAware && (entry.name === '.DS_Store' || /^\.env(?:\.|$)/u.test(entry.name) || /\.(?:tmp|pem|key)$/u.test(entry.name))) continue;
      if (entry.isSymbolicLink() && !phaseAware) {
        rows.push([path.relative(project, file).split(path.sep).join('/'), 'symlink', fs.readlinkSync(file)]);
        continue;
      }
      const info = entry.isSymbolicLink() ? fs.statSync(assertWorkDisk(file, '渲染依赖链接')) : entry;
      if (info.isDirectory()) visit(file, descendants);
      else if (info.isFile()) readFile(file);
    }
  };
  visit(project);
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return sha256(Buffer.from(JSON.stringify(rows)));
}

function currentFinalPreview(project, requireWaiting = true) {
  const state = readProgressState(project);
  const review = state?.stages?.find(item => item.id === 'review');
  const preview = state?.preview;
  const validReviewStatus = requireWaiting ? review?.status === 'waiting' : ['waiting', 'ready', 'running', 'complete', 'done', 'confirmed'].includes(review?.status);
  if (!validReviewStatus || preview?.stage !== 'review' || preview.final !== true) fail('正式导出前需要工作台中当前的 review --final 最终预览；确认时必须处于待确认状态。');
  const snapshot = path.resolve(project, preview.directory || '');
  if (!snapshot.startsWith(path.resolve(project) + path.sep) || !fs.existsSync(path.join(snapshot, 'index.html'))) fail('当前最终预览快照不存在或路径无效。');
  const scoped = usesScopedDirection(managedReceipt(project));
  const snapshotTreeSha256 = projectTreeFingerprint(snapshot, scoped);
  const workingTreeSha256 = projectTreeFingerprint(project, scoped);
  if (snapshotTreeSha256 !== workingTreeSha256) fail('最终预览后项目内容已变化；请重新发布并查看当前版本。');
  const reviewedAudio = scoped ? preview.reviewedAudio : undefined;
  if (scoped && (!reviewedAudio || reviewedAudio.path !== (preview.options?.audio ?? null))) {
    fail('当前最终预览缺少音轨绑定；重新发布 review --final 并预听当前版本。已确认的预览用 --reopen 开启新一轮。');
  }
  if (reviewedAudio?.path && fileSha256(localProjectFile(snapshot, reviewedAudio.path, '最终预览实际音轨')) !== reviewedAudio.sha256) {
    fail('最终预览的实际音轨文件已变化；请重新发布并预听。');
  }
  return { previewId: preview.id, previewDirectory: preview.directory, snapshotTreeSha256, workingTreeSha256, finalPreview: true,
    ...(scoped ? { reviewedAudio, previewOptionsSha256: sha256(stableJsonStringify({ options: preview.options, quality: preview.quality, reviewedAudio })) } : {}) };
}

function requireCurrentExportApproval(project, sizeOverride = null) {
  requireProductionPhase(project);
  const style = requireCurrentStyleApproval(project, sizeOverride);
  const finalPreview = currentFinalPreview(project, false);
  const confirmation = style.managed ? style.receipt.confirmations?.export : readProgressState(project)?.confirmations?.export;
  if (!confirmation || confirmation.previewId !== finalPreview.previewId || confirmation.snapshotTreeSha256 !== finalPreview.snapshotTreeSha256
    || confirmation.previewOptionsSha256 !== finalPreview.previewOptionsSha256
    || (style.designHash && confirmation.styleDesignHash !== style.designHash)) {
    fail('正式成片导出尚无针对当前最终预览的用户确认；风格确认与最终导出确认是两步。');
  }
  return { ...style, finalPreview, exportConfirmation: confirmation };
}

function keepReviewMix(project, file) {
  const digest = fileSha256(file);
  const relative = `audio/review/${digest}.wav`;
  const output = outputPathInside(project, relative, '最终预览冻结混音');
  fs.mkdirSync(path.dirname(output), {recursive:true});
  if (!fs.lstatSync(output, {throwIfNoEntry:false})) {
    const temporary = `${output}.${process.pid}.tmp`;
    try {
      fs.copyFileSync(file, temporary, fs.constants.COPYFILE_EXCL);
      if (fileSha256(temporary) !== digest) throw Error('生成混音在保存期间已变化；请重新发布。');
      fs.linkSync(temporary, output);
    } catch (error) { if (error.code !== 'EEXIST' || !fs.existsSync(output)) throw error; }
    finally { fs.rmSync(temporary, {force:true}); }
  }
  if (fs.lstatSync(output).isSymbolicLink() || fileSha256(output) !== digest) fail('既有最终预览混音与其哈希不匹配；保留文件，请检查后重新发布。');
  return relative;
}

async function prepareFinalReviewAudio(project, options, manifestPath, env) {
  let selectedPath;
  if (manifestPath) {
    if (options.audio) fail('最终预览指定 --chapter-manifest 时，音轨由该清单决定。');
    const file = localProjectFile(project, manifestPath, '最终预览分章清单');
    if (path.dirname(file) !== fs.realpathSync(project)) fail('最终预览请指定项目根目录中的分章清单，使用与 build-long 一致的章节路径。');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    selectedPath = withLongformAudio(project, manifest, env, (file, mixed) => {
      if (!file) return null;
      return mixed ? keepReviewMix(project, file) : path.relative(project, file).split(path.sep).join('/');
    }, file => localProjectFile(project, file, '分章预览音轨'));
  } else {
    const {readSetup} = await import('../templates/runtime/production-workbench/model.mjs');
    const {readCut} = await import('../templates/runtime/openmotion-studio/clip-edits.mjs');
    const audio = options.audio ?? readCut(project)?.catalog.mixTarget ?? readSetup(project, {}).mix ?? undefined;
    const {TMPDIR, TMP, TEMP} = env;
    Object.assign(process.env, {TMPDIR, TMP, TEMP});
    selectedPath = await prepareEditorReviewAudio(project, {...options, audio}, file => keepReviewMix(project, file));
    if (!selectedPath) {
      const script = path.join(project, 'build.sh');
      const defaultAudio = fs.existsSync(script) && /^\s*AUDIO=\$\{AUDIO:-(file|synth|tone|layer)\}\s*$/mu.test(fs.readFileSync(script, 'utf8'));
      if (defaultAudio) fail('当前项目指定了声音制作，先准备实际混音，再发布最终预览。');
    }
  }
  return selectedPath ? { path: selectedPath, sha256: fileSha256(localProjectFile(project, selectedPath, '最终预览音轨')) }
    : { path: null, sha256: null };
}

function verifyLongformReviewAudio(project, manifest, reviewed, env) {
  try {
    const matched = withLongformAudio(project, manifest, env, (file, mixed) => {
      if (!file || !reviewed.path) return !file && !reviewed.path;
      const approved = localProjectFile(project, reviewed.path, '已确认的最终预览音轨');
      return mixed ? pcmFingerprint(file, env) === pcmFingerprint(approved, env) : fileSha256(file) === reviewed.sha256;
    }, file => localProjectFile(project, file, '分章导出音轨'));
    if (!matched) fail('分章导出清单实际使用的音轨与已确认最终预览不同。请核对分章清单后用 review --final --chapter-manifest 重新发布并预听。');
  } catch (error) { fail(`无法核对分章导出音轨：${error.message}`); }
}

function buildReviewAudioEnv(project, reviewed, env) {
  if (!reviewed) return {};
  const mode = reviewed.path ? 'file' : 'none';
  if (env.AUDIO && env.AUDIO !== mode) fail('AUDIO 选择与已确认的最终预览音轨不同。请预听并确认要导出的版本。');
  if (reviewed.path && env.AUDIO_FILE && fileSha256(localProjectFile(project, env.AUDIO_FILE, '本次构建请求音轨')) !== reviewed.sha256) {
    fail('AUDIO_FILE 与已确认的最终预览音轨不同。请预听并确认要导出的版本。');
  }
  return { AUDIO: mode, ...(reviewed.path ? { AUDIO_FILE: reviewed.path } : {}) };
}

function requireManagedBuildSpecConsumer(project, spec) {
  const file = path.join(project, 'build.sh');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) fail('受管项目正式导出需要项目内普通文件 build.sh；请先恢复本地构建入口。');
  const source = fs.readFileSync(file, 'utf8');
  const executableLines = source.split(/\r?\n/u).filter(line => !line.trimStart().startsWith('#'));
  const activeSource = executableLines.join('\n');
  const hasDefault = name => new RegExp(`^[\\t ]*${name}=\\$\\{${name}:-[^}]+\\}[\\t ]*$`, 'mu').test(activeSource);
  const rendersWithSpec = activeSource.includes('node "$SKILL/scripts/render.mjs"') && activeSource.includes('--fps "$FPS" --size "$SIZE"');
  const qaWithSpec = activeSource.includes('node "$SKILL/scripts/inspect.mjs" qa') && activeSource.includes('--expect-size $SIZE') && activeSource.includes('--expect-fps $FPS');
  if (!hasDefault('SIZE') || !hasDefault('FPS') || !rendersWithSpec || !qaWithSpec) {
    fail(`本地 build.sh 的可执行行未显示会用本轮 ${spec.size} / ${spec.fps} fps 同时驱动画面渲染与验收；先按同一规格更新 build.sh，再重新发布最终预览并确认。`);
  }
}

function validateDynamicProbeReviewed(project, progressState) {
  const decision = motionProbeDeclaration(project);
  if (!decision) fail('brief 的 direction 必须记录 motion-probe: required/not-required 及具体理由；这是 Analysis 对本片动作机制的判断，脚本不自动理解题材。');
  if (decision.status === 'not-required') return null;
  const designHash = dynamicProbeDesignFingerprint(project);
  if (!designHash) fail('当前动态小样无法绑定到已完成的本轮设计和候选版本；更新候选/brief 后重新制作小样。');
  const staged = (progressState?.artifacts || []).filter(item => item.stage === 'style' && item.type === 'image' && item.url?.endsWith('.webp'));
  const receipt = managedReceipt(project);
  const scoped = usesScopedDirection(receipt);
  const records = receipt?.explorations || [];
  const usable = [];
  for (const item of staged) {
    const name = path.basename(item.url), stagedFile = path.join(project, '.showreel-progress/artifacts', name);
    if (!fs.existsSync(stagedFile) || !fs.statSync(stagedFile).isFile()) continue;
    const stagedSha256 = sha256(fs.readFileSync(stagedFile));
    if (`${stagedSha256}.webp` !== name) continue;
    const record = records.filter(value => value.kind === 'bounded-dynamic-probe' && value.draft === true && value.duration <= 6
      && value.previewWebpSha256 === stagedSha256 && value.designHash === designHash)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    if (!record) continue;
    if (scoped && !currentDirectionEvidence(project, record.directionEvidence) || receipt?.projectPhase && record.duration < 3) continue;
    const sourceWebp = localProjectFile(project, record.previewWebp?.path, '动态小样原始 WebP');
    const sourceMp4 = localProjectFile(project, record.mp4?.path, '动态小样 MP4');
    const webpBytes = fs.readFileSync(sourceWebp), mp4Bytes = fs.readFileSync(sourceMp4);
    if (sha256(webpBytes) !== stagedSha256 || sha256(mp4Bytes) !== record.mp4.sha256) continue;
    usable.push({ createdAt: record.createdAt, selection: record.selection, purpose: record.purpose, previewType: 'webp-artifact', designHash,
      mp4Sha256: record.mp4.sha256, previewSha256: stagedSha256, artifactId: item.id,
      ...(scoped ? { directionEvidence: record.directionEvidence } : {}) });
  }
  const previews = scoped ? progressState?.previews || [] : [progressState?.preview];
  if (!receipt?.projectPhase) {
    for (const record of records.filter(value => value.kind === 'bounded-playable-project-probe' && value.draft === true && value.duration <= 6 && value.designHash === designHash)) {
      if (!previews.some(preview => preview?.stage === 'scenes' && preview.final === false && record.previewId === preview.id && record.previewDirectory === preview.directory)) continue;
      const snapshotIndex = localProjectFile(project, path.join(record.previewDirectory, 'index.html'), '动态草稿播放快照');
      const snapshot = path.dirname(snapshotIndex), snapshotHash = projectTreeFingerprint(snapshot);
      if (snapshotHash !== record.projectTreeSha256 || (scoped
        ? !currentDirectionEvidence(project, record.directionEvidence) : snapshotHash !== projectTreeFingerprint(project))) continue;
      usable.push({ createdAt: record.createdAt, selection: record.selection, purpose: record.purpose, previewType: 'playable-project-snapshot', designHash,
        projectTreeSha256: snapshotHash, previewId: record.previewId, previewDirectory: record.previewDirectory,
        ...(scoped ? { directionEvidence: record.directionEvidence } : {}) });
    }
  }
  const latestBySelection = new Map();
  for (const sample of usable.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) latestBySelection.set(sample.selection, sample);
  const artifacts = [...latestBySelection.values()].map(({ createdAt, ...item }) => item).sort((a, b) => a.selection.localeCompare(b.selection));
  if (!artifacts.length) fail(`brief 声明 motion-probe required（${decision.reason}）；风格确认前需在同一工作台发布${receipt?.projectPhase ? '当前 3–6 秒动态小样的 WebP' : '绑定本轮设计的可播放 WebP 或短时 scenes 项目快照'}，并核验实际文件及采用内容。`);
  return { designHash, artifacts };
}

function inspectWebp(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`无法读取动态小样像素尺寸：${result.stderr || file}`);
  const dimensions = JSON.parse(result.stdout).streams?.[0];
  if (!(dimensions?.width > 0 && dimensions?.height > 0)) fail('动态小样没有可核验的像素尺寸。');
  return { width: dimensions.width, height: dimensions.height };
}

function outputPathInside(project, value, label) {
  const target = path.resolve(project, value);
  const relative = path.relative(path.resolve(project), target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail(`${label}必须位于当前项目内。`);
  const resolved = volumePath(target);
  const realProject = fs.realpathSync(project);
  const realRelative = path.relative(realProject, resolved.path);
  if (!realRelative || realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) fail(`${label}不能通过符号链接写出当前项目。`);
  if (resolved.device !== workDevice) fail(`${label}必须留在已确认的工作卷。`);
  return target;
}

function localProjectFile(project, value, label) {
  const target = path.resolve(project, value);
  const relative = path.relative(path.resolve(project), target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail(`${label}必须位于当前项目内。`);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`${label}不存在或不是文件：${value}`);
  const realProject = fs.realpathSync(project), realTarget = fs.realpathSync(target);
  const realRelative = path.relative(realProject, realTarget);
  if (!realRelative || realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) fail(`${label}不能通过符号链接引用项目外文件。`);
  assertWorkDisk(realTarget, label);
  return realTarget;
}

function recordProgressDeclaration(project, stageId, declaration) {
  const statusPath = path.join(project, '.showreel-progress/status.json');
  if (!fs.existsSync(statusPath)) return;
  const state = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  state.declarationRecords ||= [];
  state.declarationRecords.push({ stage: stageId, ...declaration, authenticity: 'producer-recorded conversation claim; user identity is not authenticated' });
  fs.writeFileSync(statusPath, `${JSON.stringify(state, null, 2)}\n`);
}

function recordProgressConfirmation(project, stageId, declaration) {
  const statusPath = path.join(project, '.showreel-progress/status.json');
  if (!fs.existsSync(statusPath)) return;
  const state = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  state.confirmations ||= {};
  state.confirmations[stageId] = { ...declaration, authenticity: 'producer-recorded conversation claim; user identity is not authenticated' };
  state.declarationRecords ||= [];
  state.declarationRecords.push({ stage: stageId, ...declaration, authenticity: 'producer-recorded conversation claim; user identity is not authenticated' });
  fs.writeFileSync(statusPath, `${JSON.stringify(state, null, 2)}\n`);
}

function recordExploration(project, record) {
  const receipt = readInputState(project, true);
  if (receipt?.format === 'laohu.motion.input-delivery/2') {
    receipt.explorations ||= [];
    receipt.explorations.push(record);
    writeInputState(project, receipt);
  }
}

function replaceValueOption(argv, option, value) {
  const clean = stripValueOptions(argv, new Set([option]));
  return [...clean, option, value];
}

function formalRenderBusinessQuery(argv) {
  const values = optionValues(argv, '--q');
  if (values.length > 1) fail('正式 render 只接受一个 --q；请把业务参数合并到同一条 query。');
  const raw = values[0] || '';
  const query = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  for (const key of query.keys()) {
    if (key.toLowerCase().startsWith('laohu')) fail(`正式 render 的 --q 不得注入保留的 laohu* 控制参数：${key}`);
  }
  return query.toString();
}

function formalRenderQuery(businessQuery, direction, contractReport) {
  const query = new URLSearchParams(businessQuery);
  query.set('laohuTextDirection', direction.trim());
  const profile = contractReport?.usage?.captionProfile;
  if (profile) {
    if (profile.mode !== 'locked' || typeof profile.id !== 'string' || !NATIVE_CAPTION_PROFILE_IDS.includes(profile.id)) {
      fail('正式 render 只能绑定预检中验证过的共享 locked 字幕 profile。');
    }
    query.set('laohuCaptionProfile', profile.id);
  }
  return query.toString();
}

function replaceFormalRenderQuery(argv, query) {
  return [...stripValueOptions(argv, new Set(['--q'])), '--q', query];
}

function collectPngFiles(root) {
  if (!fs.existsSync(root)) return [];
  if (fs.statSync(root).isFile()) return root.toLowerCase().endsWith('.png') ? [root] : [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectPngFiles(file));
    else if (entry.isFile() && file.toLowerCase().endsWith('.png')) files.push(file);
  }
  return files.sort();
}

function stillTextChecks(argv, businessQuery) {
  const poster = optionValue(argv, '--poster'), directions = optionValue(argv, '--directions');
  const still = optionValue(argv, '--still'), range = optionValue(argv, '--range');
  if (poster !== null && (directions !== null || still !== null || range !== null)
    || directions !== null && (still !== null || range !== null)) fail('静帧预检请单独指定 --poster、--directions 或 --still/--range。');
  if (poster !== null) return [{points: [Number(poster)], businessQuery}];
  if (directions !== null) {
    const names = directions.split(',').map(name => name.trim()).filter(Boolean);
    const at = optionValue(argv, '--at');
    const times = at === null ? [] : at.split(',').map(Number);
    if (!names.length || names.length > 5 || ![1, names.length].includes(times.length)) {
      fail('方向静帧需要 1–5 个 --directions 名称，并以 --at 指定一个共用时点或各方向的一个时点。');
    }
    const key = optionValue(argv, '--dir-param') || 'dir';
    if (key.toLowerCase().startsWith('laohu')) fail('静帧的 --dir-param 不能覆盖保留的 laohu* 控制参数。');
    return names.map((name, index) => {
      const query = new URLSearchParams(businessQuery);
      query.set(key, name);
      return {points: [times.length === 1 ? times[0] : times[index]], businessQuery: query.toString()};
    });
  }
  if (still === null && range === null) return null;
  const points = still === null ? [] : still.split(',').map(Number);
  if (range !== null) {
    const [from, to, step] = range.split(':').map(Number);
    if (![from, to, step].every(Number.isFinite) || from < 0 || to < from || step <= 0 || from + step === from) {
      fail('range 静帧需要有效的起止时间与正步长。');
    }
    for (let time = from; time <= to + 1e-9 && points.length <= 12; time += step) points.push(Number(time.toFixed(4)));
  }
  if (!points.length || points.length > 12 || points.some(time => !Number.isFinite(time) || time < 0)) fail('单次静帧探索需要 1–12 个有效时点。');
  return [{points, businessQuery}];
}

function renderStaticExploration(projectArg, argv, scripts, env, textReport) {
  const project = assertWorkDisk(projectArg, '静帧探索项目');
  const directions = optionValue(argv, '--directions');
  const still = optionValue(argv, '--still');
  const range = optionValue(argv, '--range');
  const poster = optionValue(argv, '--poster');
  const kind = directions !== null ? 'directions' : still !== null || range !== null ? 'stills' : 'poster';
  let selection = [];
  if (kind === 'directions') {
    selection = directions.split(',').map(value => value.trim()).filter(Boolean);
    if (!selection.length || selection.length > 5) fail('方向关键帧探索每组最多 5 个方向；超出时拆成多次真实比较。');
  } else if (still !== null) {
    selection = still.split(',').map(Number);
    if (!selection.length || selection.length > 12 || selection.some(value => !Number.isFinite(value) || value < 0)) fail('单次静帧探索需提供 1–12 个有效时间点。');
  } else if (range !== null) {
    const [start, end, step] = range.split(':').map(Number);
    const count = step > 0 ? Math.floor((end - start) / step + 1e-9) + 1 : Infinity;
    if (!(start >= 0 && end >= start && step > 0 && count <= 12)) fail('range 静帧探索一次最多 12 帧；请缩小时间范围或增大步长。');
    selection = { start, end, step, count };
  } else selection = [Number(poster)];
  const taskId = `${Date.now()}-${process.pid}`;
  const defaultOut = path.join(project, 'qa', 'explorations', taskId, kind === 'directions' || kind === 'poster' ? `${kind}.png` : 'frames');
  const explicitOut = optionValue(argv, '--out');
  const out = outputPathInside(project, explicitOut || defaultOut, '探索帧输出');
  const outRelative = path.relative(project, out).split(path.sep).join('/');
  if (!outRelative.startsWith('qa/explorations/')) fail('静帧/方向帧属于草稿探索，输出必须位于项目 qa/explorations/ 下并保留草稿标记。');
  const purpose = optionValue(argv, '--purpose') || '用于比较设计方向的静帧探索';
  const clean = stripValueOptions(argv, new Set(['--out', '--purpose']));
  const managed = managedReceipt(project);
  const phased = Boolean(managed?.projectPhase);
  const singleStillTime = kind === 'stills' && still !== null && range === null && poster === null && selection.length === 1 ? selection[0] : null;
  const singleStillPath = singleStillTime === null ? null : path.join(outRelative, `t_${singleStillTime.toFixed(2).padStart(6, '0')}.png`).split(path.sep).join('/');
  if (singleStillPath) outputPathInside(project, singleStillPath, '单帧渲染输出');
  const sourceTreeSha256 = managed && singleStillTime !== null ? projectTreeFingerprint(project, phased) : null;
  const frameEvidence = managed && singleStillTime !== null
    ? directionEvidence(project, [{ start: singleStillTime, end: singleStillTime }], textReport.visualAssetPaths, textReport.direction) : null;
  if (managed) {
    const spec = resolveProjectSpec(project, optionValue(argv, '--size'), managed, optionValue(argv, '--fps'));
    clean.splice(0, clean.length, ...replaceValueOption(replaceValueOption(clean, '--size', spec.size), '--fps', String(spec.fps)));
  }
  clean.push('--out', out);
  const result = runCaptured('render', [projectArg, ...clean], path.join(scripts, 'render.mjs'), env);
  if (result !== 0) process.exit(result);
  const outputRoot = kind === 'directions' ? out : kind === 'poster' ? out : out;
  const files = kind === 'directions' && !out.toLowerCase().endsWith('.png') ? `${out}.png`
    : kind === 'poster' && !out.toLowerCase().endsWith('.png') ? path.join(out, 'poster.png') : outputRoot;
  const paths = kind === 'directions' || kind === 'poster' ? collectPngFiles(files) : collectPngFiles(out);
  if (!paths.length) fail('静帧命令已结束，但没有可核验的 PNG 输出；不写探索回执。');
  const artifacts = paths.map(file => {
    const bytes = fs.readFileSync(file), dimensions = pngDimensions(bytes);
    if (!dimensions) fail(`探索帧不是有效 PNG：${file}`);
    return { path: path.relative(project, file).split(path.sep).join('/'), sha256: sha256(bytes), bytes: bytes.length, ...dimensions };
  });
  const record = { format: 'laohu.motion.draft-exploration/1', kind: 'still-or-directions', draft: true, fullProduction: false,
    purpose, selection, createdAt: new Date().toISOString(), projectSpec: resolveProjectSpec(project, optionValue(argv, '--size')),
    artifacts };
  if (sourceTreeSha256) {
    if (projectTreeFingerprint(project, phased) !== sourceTreeSha256) fail('单帧渲染期间工程内容已变化；请在当前版本重新渲染。');
    const renderedFrame = artifacts.find(artifact => artifact.path === singleStillPath);
    if (!renderedFrame) fail('单帧渲染未得到所请求时点的实际 PNG。');
    record.singleStill = { timeSeconds: singleStillTime, sourceTreeSha256, path: renderedFrame.path, sha256: renderedFrame.sha256,
      ...(frameEvidence ? { directionEvidence: frameEvidence } : {}) };
  }
  const sidecar = path.join(path.dirname(paths[0]), `${path.basename(paths[0], '.png')}.draft.json`);
  fs.writeFileSync(sidecar, `${JSON.stringify(record, null, 2)}\n`);
  record.sidecar = path.relative(project, sidecar).split(path.sep).join('/');
  recordExploration(project, record);
  console.log(`已生成 ${artifacts.length} 张草稿探索帧；PNG 像素与 SHA-256 已记录。它们只用于比较方向，不代表正式制作或导出。记录：${sidecar}`);
  process.exit(0);
}

async function runDynamicProbe(projectArg, argv, scripts, env) {
  const project = assertWorkDisk(projectArg, '动态小样项目');
  const start = Number(optionValue(argv, '--start'));
  const duration = Number(optionValue(argv, '--duration'));
  const textDirection = optionValue(argv, '--text-direction');
  const captionProfile = optionValue(argv, '--caption-profile');
  const selection = optionValue(argv, '--selection');
  const purpose = optionValue(argv, '--purpose');
  if (!(Number.isFinite(start) && start >= 0 && start < 1200)) fail('动态草稿需要有效的 --start（0–1200 秒）。');
  if (!(Number.isFinite(duration) && duration > 0 && duration <= 6)) fail('本地动态探索草稿 --duration 单段上限为 6 秒；这只是避免把全片标作探针的本地输出边界，不是动画设计时长限制。可按多个明确选区分次取样；正式内容不受此限制。');
  if (typeof selection !== 'string' || selection.trim().length < 2 || selection.length > 120) fail('动态草稿需要具体的 --selection，填写镜头 ID 或起止时间范围。');
  if (typeof purpose !== 'string' || purpose.trim().length < 8 || purpose.length > 400) fail('动态草稿需要具体的 --purpose，写明要检验的动作或衔接。');
  if (typeof textDirection !== 'string' || !textDirection.trim()) fail('动态草稿需指定 --text-direction <本轮所选方向名>，供逐 ID 检查必显字项。');
  if (captionProfile && !NATIVE_CAPTION_PROFILE_IDS.includes(captionProfile)) fail(`动态字幕校准只接受共享登记中的 candidate profile ID：${NATIVE_CAPTION_PROFILE_IDS.join('、')}`);
  const managed = managedReceipt(project);
  const phased = Boolean(managed?.projectPhase);
  requirePhaseDirection(project, textDirection);
  if (phased && (duration < 3 || !projectExplorationDirection(project).moments.some(moment => start <= moment.time && moment.time < start + duration))) {
    fail('方向小样需要 3–6 秒，并包含至少一个 Brief 登记的代表时刻。');
  }
  const projectSpec = managed ? resolveProjectSpec(project, optionValue(argv, '--size'), managed, optionValue(argv, '--fps')) : null;
  const textReport = await runBriefTextContract(project, {direction: textDirection, start, duration,
    fps: projectSpec?.fps ?? Number(optionValue(argv, '--fps') || 30), size: projectSpec?.size ?? optionValue(argv, '--size') ?? '1920x1080',
    allowCaptionCalibration: true, captionProfile, enforceWindow: phased, exhaustiveFrames});
  const designHash = dynamicProbeDesignFingerprint(project);
  if (managed && !designHash) fail('屏显文字检查后当前设计已无法绑定动态小样；更新到最新 Brief 后重试。');
  const unitView = await productionUnitView(project, false, managed?.productionUnitsRequired === true);
  let unitProbeBinding = {};
  if (unitView || phased) {
    const { snapshot, readSetup } = await import('../templates/runtime/production-workbench/model.mjs');
    unitProbeBinding = { renderRevision: snapshot(project, readSetup(project, {})).renderRevision,
      unitDesignRevisions: Object.fromEntries((unitView?.units ?? []).filter(unit => unit.t0 < start + duration && unit.t1 > start)
        .map(unit => [unit.id, unit.designRevision])) };
  }
  const sampleEvidence = usesScopedDirection(managed) ? directionEvidence(project, [{ start, end: start + duration }], textReport.visualAssetPaths, textReport.direction) : null;
  const renderSourceHash = phased ? projectTreeFingerprint(project, true) : null;
  const taskId = `${Date.now()}-${process.pid}`;
  const outputRoot = outputPathInside(project, path.join('qa', 'probes'), '动态草稿输出目录');
  const mp4 = path.join(outputRoot, `${taskId}-draft-probe.mp4`);
  const webp = path.join(outputRoot, `${taskId}-draft-probe.webp`);
  fs.mkdirSync(outputRoot, { recursive: true });
  const passKeys = new Set(['--size', '--fps', '--workers', '--subframes', '--shutter', '--dpr', '--grain', '--crf', '--audio']);
  const forwarded = [];
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index].split('=', 1)[0];
    if (['--start', '--duration', '--selection', '--purpose', '--text-direction', '--caption-profile'].includes(key)) { if (argv[index] === key) index++; continue; }
    if (passKeys.has(key)) { forwarded.push(argv[index]); if (argv[index] === key) forwarded.push(argv[++index]); }
    else fail(`probe 不支持参数：${argv[index]}`);
  }
  if (managed) {
    const normalized = stripValueOptions(forwarded, new Set(['--size', '--fps']));
    forwarded.splice(0, forwarded.length, ...normalized, '--size', projectSpec.size, '--fps', String(projectSpec.fps));
  }
  const rendererQuery = new URLSearchParams({laohuTextDirection: textDirection.trim(), laohuCaptionCalibration: '1'});
  if (captionProfile) rendererQuery.set('laohuCaptionProfile', captionProfile);
  const renderArgs = [projectArg, '--start', String(start), '--duration', String(duration), '--q', rendererQuery.toString(), '--out', mp4, ...forwarded];
  const result = runCaptured('probe', renderArgs, path.join(scripts, 'render.mjs'), env);
  if (result !== 0) process.exit(result);
  if (!fs.existsSync(mp4) || !fs.statSync(mp4).size) fail('动态小样渲染后没有实际 MP4 文件。');
  const conversion = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', 'fps=8,scale=640:-2:flags=lanczos', '-loop', '0', '-an', '-c:v', 'libwebp', '-quality', '75', '-compression_level', '4', webp], { cwd: project, env, encoding: 'utf8' });
  if (conversion.error || conversion.status !== 0 || !fs.existsSync(webp) || !fs.statSync(webp).size) {
    const frameRoot = path.join(outputRoot, `${taskId}-frames`);
    fs.mkdirSync(frameRoot, { recursive: true });
    const frameLimit = Math.max(1, Math.ceil(duration * 8));
    const framePattern = path.join(frameRoot, 'frame-%04d.png');
    const extraction = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', 'fps=8,scale=640:-2:flags=lanczos', '-frames:v', String(frameLimit), framePattern], { cwd: project, env, encoding: 'utf8' });
    const frames = fs.existsSync(frameRoot) ? fs.readdirSync(frameRoot).filter(name => /^frame-\d{4}\.png$/u.test(name)).sort().map(name => path.join(frameRoot, name)) : [];
    fs.rmSync(webp, { force: true });
    const mux = extraction.status === 0 && frames.length
      ? spawnSync('img2webp', ['-loop', '0', '-d', '125', '-lossy', '-q', '75', '-m', '4', ...frames, '-o', webp], { cwd: project, env, encoding: 'utf8' })
      : null;
    fs.rmSync(frameRoot, { recursive: true, force: true });
    if (extraction.error || extraction.status !== 0 || !frames.length || mux?.error || mux?.status !== 0 || !fs.existsSync(webp) || !fs.statSync(webp).size) {
      const primary = conversion.stderr || conversion.error?.message || `ffmpeg status ${conversion.status}`;
      const fallback = extraction.stderr || extraction.error?.message || mux?.stderr || mux?.error?.message || (!frames.length ? 'ffmpeg 未抽取出 PNG 帧' : `img2webp status ${mux?.status}`);
      fail(`已生成 MP4，但当前 progress 工作台还没有可回放动态小样。动画 WebP 转换失败：ffmpeg/libwebp：${primary}；img2webp 帧回退：${fallback}。请安装本机 ffmpeg libwebp encoder 或 img2webp 后重试。`);
    }
  }
  const mp4Bytes = fs.readFileSync(mp4), webpBytes = fs.readFileSync(webp);
  if (sha256(fs.readFileSync(path.join(project, 'brief.md'))) !== textReport.briefSha256
    || managed && dynamicProbeDesignFingerprint(project) !== designHash
    || phased && projectTreeFingerprint(project, true) !== renderSourceHash) {
    fail('动态小样渲染期间 Brief 或画面输入已变化；请用当前工程重新生成样片。');
  }
  const record = { format: 'laohu.motion.draft-exploration/1', kind: 'bounded-dynamic-probe', draft: true, fullProduction: false, ...unitProbeBinding,
    purpose: purpose.trim(), selection: selection.trim(), start, duration, createdAt: new Date().toISOString(), designHash,
    ...(sampleEvidence ? { directionEvidence: sampleEvidence } : {}),
    projectSpec: resolveProjectSpec(project, optionValue(argv, '--size')),
    mp4: { path: path.relative(project, mp4).split(path.sep).join('/'), sha256: sha256(mp4Bytes), bytes: mp4Bytes.length },
    previewWebp: { path: path.relative(project, webp).split(path.sep).join('/'), sha256: sha256(webpBytes), bytes: webpBytes.length, ...inspectWebp(webp) } };
  const sidecar = path.join(outputRoot, `${taskId}-draft-probe.json`);
  fs.writeFileSync(sidecar, `${JSON.stringify(record, null, 2)}\n`);
  record.sidecar = path.relative(project, sidecar).split(path.sep).join('/');
  record.previewWebpSha256 = record.previewWebp.sha256;
  recordExploration(project, record);
  console.log(`已生成 ${duration} 秒动态草稿：${mp4}\n工作台预览文件：${webp}\n请用 progress --stage style --preview '${record.previewWebp.path}' 发布到同一工作台。sidecar 明确标记 draft，不能当整片或正式制作。`);
  process.exit(0);
}

const styleResourceIdInProsePattern = '(?:original|new):[a-z0-9-]+|atlas:[a-z0-9-]+|motion-prompt:[a-z0-9-]+:\\d{3}|overlay:[a-z0-9-]+|openmotion-[a-z0-9]+(?:-[a-z0-9]+)*';
const typeResourceIdPattern = '(?:font|type-use):[a-z0-9-]+';
const recipeResourceIdPattern = '(?:laohu|video-shotcraft)-[a-z0-9]+(?:-[a-z0-9]+)*';
const resourceIdInProsePattern = `${styleResourceIdInProsePattern}|${typeResourceIdPattern}`;
const resourceIdPatternSource = `${resourceIdInProsePattern}|${recipeResourceIdPattern}`;

function resourceIdsFromText(text) {
  const pattern = new RegExp(`\\b(${resourceIdInProsePattern})\\b`, 'giu');
  return [...new Set([...String(text || '').matchAll(pattern)].map(match => match[1]))];
}

function resourceModeFromText(direction) {
  const declarations = [...String(direction || '').matchAll(/^\s*resource-mode\s*:\s*([^\r\n]+?)\s*$/gimu)].map(match => match[1].trim().toLowerCase());
  if (declarations.length > 1) fail('<direction> 只能有一条 resource-mode 声明。');
  if (!declarations.length) return '2';
  const mode = declarations[0];
  if (!['1', '2', '3', 'original-only'].includes(mode)) fail('resource-mode 仅支持 1、2、3 或用户明确授权时的 original-only；未声明时默认为 2。');
  return mode;
}

function resourceUsesFromText(direction) {
  const pattern = new RegExp(`^\\s*resource-use\\s*:\\s*(${resourceIdPatternSource})\\s*(?:—|–|-)\\s*(.+?)\\s*$`, 'gimu');
  const rows = [...String(direction || '').matchAll(pattern)].map(match => ({ id: match[1], contribution: match[2].trim() }));
  for (const row of rows) {
    if (row.contribution.length < 8 || /(?:待填|待定|pending-analysis|…|……)/iu.test(row.contribution)) {
      fail(`resource-use ${row.id} 缺少本片贡献与作用范围；写清它如何帮助当前对象、段落或观看任务。`);
    }
  }
  return rows;
}

function selectedResourceIdsFromDirection(direction) {
  return [...new Set(resourceUsesFromText(direction).map(item => item.id))];
}

function primaryStyleFromText(direction) {
  const matches = [...String(direction || '').matchAll(new RegExp(`^\\s*primary-style\\s*:\\s*(${styleResourceIdInProsePattern}|${recipeResourceIdPattern})\\s*$`, 'gimu'))];
  if (matches.length > 1) fail('<direction> 只能标记一个 primary-style。');
  return matches[0]?.[1] || null;
}

function quotedEvidence(direction, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = String(direction || '').match(new RegExp(`^\\s*${escaped}\\s*:\\s*[“\"]([^”\"]{8,})[”\"]\\s*$`, 'imu'));
  const value = match?.[1]?.trim();
  if (!value || /^(?:用户明确选择|用户已授权|用户明确要求|我已选择|explicitly selected|authorized)$/iu.test(value)) return null;
  return value;
}

function benchmarkSourceSelections(direction) {
  const sources = [];
  const sourcePattern = /^\s*benchmark-source\s*:\s*(SRC-[A-F0-9]{16})\s*\|\s*path=(\S+)\s*\|\s*sha256=([a-f0-9]{64})\s*$/gimu;
  for (const match of String(direction || '').matchAll(sourcePattern)) sources.push({ id: match[1], path: match[2], sha256: match[3].toLowerCase() });
  const uses = new Map();
  const usePattern = /^\s*benchmark-use\s*:\s*(SRC-[A-F0-9]{16})\s*(?:—|–|-)\s*(.+?)\s*$/gimu;
  for (const match of String(direction || '').matchAll(usePattern)) {
    const contribution = match[2].trim();
    if (contribution.length < 8 || /(?:待填|待定|pending-analysis|…|……)/iu.test(contribution)) fail(`benchmark-use ${match[1]} 缺少本片贡献与作用范围。`);
    uses.set(match[1], contribution);
  }
  return sources.map(item => ({ ...item, contribution: uses.get(item.id) || null }));
}

function hasBenchmarkSourceDeclaration(direction) {
  return /^\s*benchmark-(?:source|use)\s*:/imu.test(String(direction || ''));
}

function validateBenchmarkSourceSelections(project, direction) {
  const rows = benchmarkSourceSelections(direction);
  if (!rows.length) fail('Benchmark 对标必须有可定位的项目本地来源记录。');
  if (new Set(rows.map(item => item.id)).size !== rows.length) fail('Benchmark 来源 ID 重复；每个来源只记录一条真实文件绑定。');
  const quote = quotedEvidence(direction, 'benchmark-selection-quote');
  if (!quote) fail('Benchmark 对标缺少用户当前明确指定对象的原话。');
  return rows.map(row => {
    if (!row.contribution) fail(`Benchmark 来源 ${row.id} 没有对应 benchmark-use 行，需写明它对本片的具体贡献与适用范围。`);
    const target = path.resolve(project, row.path);
    const expectedTail = path.join('benchmark', 'sources', `${row.id}.json`);
    const relativeTail = path.relative(path.parse(target).root, target);
    if (!relativeTail.endsWith(expectedTail)) fail(`Benchmark 来源路径须定位至实际 benchmark/sources/${row.id}.json 记录。`);
    const stat = fs.lstatSync(target, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink()) fail(`Benchmark 来源记录不存在、不是普通文件或是符号链接：${row.path}`);
    const realTarget = fs.realpathSync(target);
    if (realTarget !== target) fail(`Benchmark 来源路径不能通过目录符号链接改变实际来源：${row.path}`);
    assertWorkDisk(realTarget, 'Benchmark source record');
    const bytes = fs.readFileSync(realTarget), digest = sha256(bytes);
    if (digest !== row.sha256) fail(`Benchmark 来源 ${row.id} 文件哈希已变化；按当前来源正文重新核读并更新 brief。`);
    let source;
    try { source = JSON.parse(bytes.toString('utf8')); } catch { fail(`Benchmark 来源 ${row.id} 不是有效 JSON。`); }
    const nonempty = value => typeof value === 'string' && value.trim().length > 0;
    if (source.source_id !== row.id || source.schema_version !== 1
      || !['title', 'creator', 'medium', 'version'].every(key => nonempty(source.identity?.[key]))
      || !['identity_basis', 'locator', 'access_scope'].every(key => nonempty(source.provenance?.[key]))
      || !['reference_kind', 'reference', 'version', 'read_scope'].every(key => nonempty(source.source_material?.[key]))
      || !['identity-checked', 'unit-located', 'context-readable', 'limited'].includes(source.evidence_status)
      || (source.source_material.content_sha256 !== undefined && !/^[a-f0-9]{64}$/iu.test(source.source_material.content_sha256))) {
      fail(`Benchmark 来源 ${row.id} 缺少真实身份、定位、访问范围或材料版本；不能用摘要/ID 替代来源记录。`);
    }
    return { id: `benchmark:${row.id}`, sourceType: 'benchmark-source', sourceId: row.id,
      sourcePath: path.relative(project, realTarget).split(path.sep).join('/'), sourceSha256: digest,
      sourceMaterialSha256: source.source_material.content_sha256 || null,
      selectionSha256: sha256(Buffer.from(quote)), contribution: row.contribution };
  });
}

function motionProbeDeclaration(project) {
  if (!fs.existsSync(path.join(project, 'brief.md'))) return null;
  const direction = topLevelBriefBlocks(project).direction || '';
  const match = direction.match(/^\s*motion-probe\s*:\s*(required|not-required)\s*;\s*(?:reason|理由)\s*[:：]\s*(.+?)\s*$/imu);
  if (!match || match[2].length < 8 || /(?:……|待判定|pending-analysis)/iu.test(match[2])) return null;
  return { status: match[1], reason: match[2] };
}

function dynamicProbeDesignFingerprint(project) {
  const receipt = managedReceipt(project);
  const decision = motionProbeDeclaration(project);
  if (!receipt?.currentSpec || !decision) return null;
  const ids = selectedResourceIdsFromDirection(topLevelBriefBlocks(project).direction);
  let selectedResources;
  try { selectedResources = selectedResourceBindings(project, ids, receipt); } catch { return null; }
  const spec = { size: receipt.currentSpec.size, width: receipt.currentSpec.width, height: receipt.currentSpec.height, fps: receipt.currentSpec.fps, source: receipt.currentSpec.source };
  if (usesScopedDirection(receipt)) return sha256(stableJsonStringify({ format: 'laohu.motion.probe-design/2', design: directionDesign(project, spec), selectedResources, probeDecision: decision }));
  return sha256(Buffer.from(JSON.stringify({ format: 'laohu.motion.probe-design/1', mode: receipt.mode, spec,
    substantive: relevantBriefFingerprint(project), selectedResources, probeDecision: decision, projectTreeSha256: projectTreeFingerprint(project) })));
}

function readFrameProgressOptions(argv, stage, managed) {
  const values = [...frameProgressOptions].map(option => {
    const occurrences = optionValues(argv, option);
    if (occurrences.length > 1) fail(`关键帧发布只接受一项 ${option}。`);
    return occurrences[0];
  });
  if (values.every(value => value === undefined)) return null;
  const [source, event, time, role = 'design'] = values;
  if (stage !== 'style' || !managed || argv.includes('--confirm') || optionValue(argv, '--publish')) {
    fail('关键帧来源与事件参数用于本轮受管项目的 style PNG 发布。');
  }
  if (!['cover', 'code', 'reference'].includes(source) || !['design', 'implementation'].includes(role)
    || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(event || '')
    || !/^\d+(?:\.\d+)?$/u.test(time || '') || !Number.isFinite(Number(time))) {
    fail('请提供 --frame-source cover|code|reference、--frame-event <稳定短 ID>、--frame-at <非负秒数>。--frame-role 可取 design 或 implementation。');
  }
  return { source, event, timeSeconds: Number(time), role };
}

function prepareFrameProgress(project, managed, frame, png, argv, env) {
  if (png?.type !== 'png') fail('发布关键帧需要实际 PNG 文件；提示词请作单独说明。');
  const spec = resolveProjectSpec(project, optionValue(argv, '--size'), managed);
  if (png.width !== spec.width || png.height !== spec.height) fail(`关键帧 PNG 实际规格需为本轮 ${spec.size}。`);
  const frameSource = styleframeSource(project);
  if (frame.role === 'design' && frameSource !== 'mixed' && frame.source !== frameSource) fail(`当前 Brief 的关键帧来源为 ${frameSource}；本次发布来源不一致。`);
  if (frame.role === 'implementation' && (frame.source !== 'code' || argv.includes('--reopen'))) {
    fail('工程实渲对照需要 code 来源，使用已确认的方向。重开方向请先发布该事件的新设计图。');
  }
  const decode = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-i', png.file, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8', env });
  if (decode.status !== 0) fail(`关键帧 PNG 无法完整解码：${decode.error?.message || decode.stderr || png.path}`);
  const phased = Boolean(managed.projectPhase);
  const upgradesScope = frame.role === 'design' && !usesScopedDirection(managed) && argv.includes('--reopen');
  const scoped = usesScopedDirection(managed) || upgradesScope;
  const moment = phased && projectExplorationDirection(project).moments.find(item => item.id === frame.event);
  let still = null;
  if (frame.source === 'code') {
    still = managed.explorations?.findLast(record => record.singleStill?.timeSeconds === frame.timeSeconds
      && record.singleStill.path === png.path && record.singleStill.sha256 === png.sha256)?.singleStill;
    if (!still || still.sourceTreeSha256 !== projectTreeFingerprint(project, phased)) {
      fail('代码帧需要本轮工程在相同秒数的单帧渲染回执；请用 render --text-direction <方向> --still <秒数>。');
    }
  }
  const name = optionValue(argv, '--name')?.trim();
  const timeLabel = `${frame.event} · ${frame.timeSeconds} 秒${name ? ` · ${name}` : ''}`;
  const metadata = { ...frame, sourcePath: png.path, sourceSha256: png.sha256 };
  if (scoped && frame.role === 'design') {
    metadata.directionEvidence = still?.directionEvidence ?? directionEvidence(project, [{ start: frame.timeSeconds, end: frame.timeSeconds }]);
    if (!currentDirectionEvidence(project, metadata.directionEvidence)) fail('关键帧的采用素材、字体或屏显文字已变化，请重新生成并发布。');
  }
  const design = projectProductionUnits(project, managed.productionUnitsRequired === true);
  const unit = design?.units.find(item => item.frames.some(candidate => candidate.id === frame.event));
  if (moment && frame.role === 'design') {
    if (moment.time !== frame.timeSeconds) fail(`关键帧 ${frame.event} 需要使用代表时刻登记的 ${moment.time} 秒。`);
    metadata.explorationMomentSha256 = sha256(stableJsonStringify(moment));
  } else if (isExploring(project, managed)) {
    fail(`方向探索关键帧 ${frame.event} 必须对应一个 Brief 代表时刻。请使用 --frame-role design。`);
  } else if (unit) {
    const candidate = unit.frames.find(item => item.id === frame.event);
    if (Math.abs(candidate.time - frame.timeSeconds) > 1e-6) fail(`关键帧 ${frame.event} 与 Brief 中的时点不同，请按登记的成片秒数发布。`);
    metadata.unitId = unit.id;
    metadata.unitDesignRevision = unit.designRevision;
  } else if (managed.productionUnitsRequired) fail(`关键帧 ${frame.event} 缺少 Brief 片段登记；请先确定片内时点及该帧要验证的状态。`);
  if (frame.role === 'design') {
    const label = {cover:'设计目标图 · Cover 生图',code:'设计目标图 · 代码',reference:'设计目标图 · 对标参考'}[frame.source];
    return { metadata, upgradesScope, name: `${label} · ${timeLabel}`, digest: png.sha256, argv: replaceValueOption(argv, '--preview', png.path) };
  }

  // Comparison is a working preview. The production/export path still checks fresh motion evidence.
  const approval = requireCurrentStyleApproval(project, null, { comparisonOnly: true });
  const target = approval.artifact.artifacts.find(item => item.frame?.event === frame.event);
  if (!target || target.frame.timeSeconds !== frame.timeSeconds) fail('工程实渲对照必须使用已确认设计图的相同事件 ID 与秒数。');
  metadata.targetArtifactId = target.id;
  metadata.targetSha256 = target.sha256;
  const temporaryRoot = outputPathInside(project, 'qa/explorations', '关键帧对照临时目录');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporaryRoot, '.frame-pair-'));
  const comparison = path.join(directory, 'comparison.png');
  const left = localProjectFile(project, target.path, '已确认设计 PNG');
  const result = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-i', left, '-i', png.file,
    '-filter_complex', '[0:v]format=rgb24[left];[1:v]format=rgb24[right];[left][right]hstack=inputs=2', '-frames:v', '1', '-threads', '1', comparison],
    { encoding: 'utf8', env });
  if (result.status !== 0 || !fs.existsSync(comparison)) {
    fs.rmSync(directory, { recursive: true, force: true });
    fail(`无法生成同一时刻的设计与实渲对照：${result.error?.message || result.stderr || '未获得对照图片'}`);
  }
  return { metadata, directory, name: `设计与实渲对照 · ${timeLabel} · 左：设计目标图 / 右：工程实渲`,
    digest: sha256(fs.readFileSync(comparison)), argv: replaceValueOption(replaceValueOption(argv, '--preview', path.relative(project, comparison)), '--status', 'ready') };
}

function archiveReplacedFrames(before, after) {
  const kept = new Set(after.artifacts.map(a => a.id));
  const prior = new Map((after.artifactHistory || []).map(a=>[a.id,a]));
  for (const a of before?.artifacts || []) if (a.frame && !kept.has(a.id))
    prior.set(a.id,{...a,createdAt:new Date().toISOString()});
  if (prior.size) after.artifactHistory = [...prior.values()];
}

function recordFrameProgress(project, managed, before, publication, png) {
  const after = readProgressState(project);
  const { metadata, digest } = publication;
  const artifactName = `${digest}.png`;
  const published = after?.artifacts?.find(item => item.stage === 'style' && item.url === `/artifact/${artifactName}` && !item.frame);
  if (!published) fail('工作台未登记刚发布的关键帧成果；请重新发布。');
  const artifactPath = `.showreel-progress/artifacts/${artifactName}`;
  const stagedPath = localProjectFile(project, artifactPath, '工作台关键帧');
  if (sha256(fs.readFileSync(stagedPath)) !== digest) fail('待发布的关键帧像素在发布期间发生变化；请重新发布。');

  // A rendered image can be identical at different events. The URL is content-addressed, while each row identifies its role and event.
  const row = { ...published, id: `${published.id}-${metadata.role}-${metadata.event}`, frame: metadata };
  const previousFrames = managed.keyframeSet?.artifacts || [];
  const removedFrames = new Set();
  if (metadata.role === 'design') {
    for (const item of previousFrames) {
      if (publication.upgradesScope || (styleframeSource(project) !== 'mixed' && (item.frame?.source || 'code') !== metadata.source) || item.frame?.event === metadata.event) removedFrames.add(item.id);
    }
    for (const artifact of after.artifacts) {
      if (artifact.frame?.role === 'implementation' && (artifact.frame.event === metadata.event
        || removedFrames.has(artifact.frame.targetArtifactId))) removedFrames.add(artifact.id);
    }
  }
  const earlierSameBytes = before?.artifacts?.find(item => item.id === published.id);
  after.artifacts = after.artifacts.flatMap(item => {
    if (removedFrames.has(item.id) || item.id === row.id
      || (metadata.role === 'implementation' && item.frame?.role === 'implementation' && item.frame.event === metadata.event)) return [];
    if (item.id !== published.id) return [item];
    return earlierSameBytes && !removedFrames.has(earlierSameBytes.id) ? [earlierSameBytes] : [];
  });
  after.artifacts.push(row);
  archiveReplacedFrames(before, after);
  writeProjectArtifact(project, '.showreel-progress/status.json', `${JSON.stringify(after, null, 2)}\n`, '关键帧工作台记录');
  if (metadata.role === 'design') {
    const frame = { id: row.id, path: artifactPath, sha256: digest, width: png.width, height: png.height, frame: metadata };
    updateReceipt(project, receipt => {
      if (publication.upgradesScope) receipt.directionFingerprintVersion = 3;
      const surviving = (receipt.keyframeSet?.artifacts || []).filter(item => !removedFrames.has(item.id));
      receipt.keyframeSet = { revision: `${Date.now()}-${digest.slice(0, 8)}`, artifacts: [...surviving, frame], updatedAt: new Date().toISOString() };
    });
  }
}

async function handleProgress(projectArg, argv, scripts, env) {
  const project = assertWorkDisk(projectArg, '工作台项目');
  const evidence = optionValue(argv, '--evidence-text'), scope = optionValue(argv, '--scope');
  const textDirection = optionValue(argv, '--text-direction');
  const chapterManifest = optionValue(argv, '--chapter-manifest');
  const selectedArgs = [...optionValues(argv, '--selected-resource'), ...optionValues(argv, '--selected-style')];
  const draftProbe = argv.includes('--draft-probe');
  const probeSelection = optionValue(argv, '--selection'), probePurpose = optionValue(argv, '--purpose');
  let clean = stripValueOptions(argv, new Set(['--evidence-text', '--scope', '--selected-style', '--selected-resource', '--text-direction', '--chapter-manifest', ...frameProgressOptions]));
  if (draftProbe) clean = stripValueOptions(clean.filter(value => value !== '--draft-probe'), new Set(['--selection', '--purpose']));
  else if (probeSelection !== null || probePurpose !== null) fail('--selection 与 --purpose 仅用于有明确时长和范围的 --draft-probe。');
  const stage = optionValue(clean, '--stage');
  if (!stage) fail('progress 需要 --stage。');
  const managed = managedReceipt(project);
  const phased = Boolean(managed?.projectPhase);
  const exploring = isExploring(project, managed);
  const publish = optionValue(clean, '--publish');
  const final = clean.includes('--final');
  const bindReviewAudio = usesScopedDirection(managed) && stage === 'review' && final && Boolean(publish);
  if (chapterManifest !== null && !bindReviewAudio) fail('--chapter-manifest 用于受管工程发布 review --final；其音轨随后在同一最终预览中预听。');
  if (exploring && (stage === 'review' || final || publish && !draftProbe)) requireProductionPhase(project, managed);
  if (exploring && stage === 'style' && clean.includes('--confirm') && optionValue(clean, '--next')) {
    fail('先用 progress --stage style --confirm 记录方向原话，再用 promote-production 验收完整资料并进入生产。');
  }
  const frame = readFrameProgressOptions(argv, stage, managed);
  if (draftProbe) {
    const duration = Number(optionValue(clean, '--duration'));
    const declaration = motionProbeDeclaration(project);
    if (!managed) fail('--draft-probe 需要本轮 input-prepare 规格与候选回执。');
    if (stage !== 'scenes' || !optionValue(clean, '--publish') || clean.includes('--final') || optionValue(clean, '--shot') || optionValue(clean, '--audio')) fail('--draft-probe 只接受 scenes 阶段的无声、非 final 项目快照发布。');
    if (!(Number.isFinite(duration) && duration > 0 && duration <= 6)) fail('--draft-probe 需要 0–6 秒以内的明确 duration；超出时请按选区拆成多个探索快照。');
    if (typeof probeSelection !== 'string' || probeSelection.trim().length < 2 || probeSelection.length > 120) fail('--draft-probe 需要明确 --selection 镜头或时间范围。');
    if (typeof probePurpose !== 'string' || probePurpose.trim().length < 8 || probePurpose.length > 400) fail('--draft-probe 需要具体 --purpose，写明要检查的动作或衔接。');
    if (declaration?.status !== 'required') fail('--draft-probe 只用于 brief 明确声明 motion-probe: required 的本轮设计。');
    currentStyleArtifact(project, true);
    if (!dynamicProbeDesignFingerprint(project)) fail('当前项目和候选尚不能绑定这次动态草稿；先完成候选全文与实际方向关键帧。');
    if (!optionValue(clean, '--message')) clean = [...clean, '--message', `技术动态探索：${probePurpose.trim()}`];
  }
  if (managed) {
    const spec = resolveProjectSpec(project, optionValue(clean, '--size'), managed, optionValue(clean, '--fps'));
    clean = replaceValueOption(replaceValueOption(clean, '--size', spec.size), '--fps', String(spec.fps));
  }
  const publishForRenderer = Boolean(publish && (stage === 'scenes' || phased && stage === 'review' && final));
  let finalClockDuration = null;
  if (phased && stage === 'review' && final) {
    if (!publish || fs.realpathSync(path.resolve(project, publish)) !== fs.realpathSync(project)) fail('成片最终预览须从同一项目发布：progress --stage review --publish . --final。');
    const units = await productionUnitView(project, true, true);
    const length = units.units.at(-1).t1;
    const override = optionValue(clean, '--duration');
    if (override !== null && Math.abs(Number(override) - length) > 1e-6) fail('最终预览必须覆盖当前成片时钟的完整时长。');
    clean = replaceValueOption(clean, '--duration', String(length));
    finalClockDuration = length;
  }
  let progressTextReport;
  if (draftProbe || publishForRenderer) {
    if (typeof textDirection !== 'string' || !textDirection.trim()) fail('动态草稿或 scenes 预览发布需指定 --text-direction <本轮所选方向名>。');
    requirePhaseDirection(project, textDirection);
    progressTextReport = await runBriefTextContract(project, {direction: textDirection, start: 0,
      duration: draftProbe ? Number(optionValue(clean, '--duration')) : undefined,
      fps: Number(optionValue(clean, '--fps') || managed?.currentSpec?.fps || 30),
      size: optionValue(clean, '--size') || managed?.currentSpec?.size || '1920x1080',
      allowCaptionCalibration: draftProbe, finalClockDuration, exhaustiveFrames});
  }
  const before = readProgressState(project);
  const beforeStage = before?.stages?.find(item => item.id === stage);
  const previewArg = optionValue(clean, '--preview');
  let previewSource = null;
  if (previewArg) {
    const file = localProjectFile(project, previewArg, '进度成果文件');
    const ext = path.extname(file).toLowerCase();
    if (stage === 'style' && ext === '.png') {
      const bytes = fs.readFileSync(file), dimensions = pngDimensions(bytes);
      if (!dimensions) fail('方向关键帧必须是可读取像素的非空 PNG。');
      previewSource = { file, path: path.relative(project, file).split(path.sep).join('/'), sha256: sha256(bytes), bytes: bytes.length, ...dimensions, type: 'png' };
    } else if (stage === 'style' && ext === '.webp') {
      previewSource = { file, path: path.relative(project, file).split(path.sep).join('/'), sha256: sha256(fs.readFileSync(file)), bytes: fs.statSync(file).size, ...inspectWebp(file), type: 'webp' };
    }
    if (stage === 'style' && previewSource && frame?.role !== 'implementation') {
      const status = optionValue(clean, '--status');
      if (status && status !== 'waiting') fail('风格方向图与动态小样必须发布为 waiting，供用户实际查看并回复。');
      if (!status) clean.push('--status', 'waiting');
    }
    if (stage === 'style' && previewSource?.type === 'png' && !frame && (phased || managed?.productionUnitsRequired || styleframeSource(project) !== 'code')) {
      fail(`发布本轮设计帧需要实际 PNG、--frame-source ${styleframeSource(project)}、--frame-event 和 --frame-at。`);
    }
  }

  const confirming = clean.includes('--confirm');
  let styleDeclaration = null, exportDeclaration = null;
  if (confirming) {
    validateDeclaration(evidence, scope, stage === 'review' ? '最终导出确认' : '阶段确认');
    if (stage === 'style') {
      const artifact = currentStyleArtifact(project, true);
      if (phased && new Set(artifact.artifacts.map(item => item.sha256)).size < 2) fail('方向确认前请发布至少两张对应 Brief 代表时刻且画面有可见差异的真实 PNG。');
      const blocks = topLevelBriefBlocks(project);
      const selectedIds = [...new Set([...selectedArgs, ...resourceIdsFromText(scope), ...selectedResourceIdsFromDirection(blocks.direction)])].sort();
      const selectedResources = managed ? selectedResourceBindings(project, selectedIds, managed) : [];
      const spec = resolveProjectSpec(project, optionValue(clean, '--size'), managed || readInputState(project, true), optionValue(clean, '--fps'));
      if (spec.width && artifact.artifacts.some(item => item.width !== spec.width || item.height !== spec.height)) fail('方向关键帧像素规格与当前本轮画幅不一致；按当前规格重新生成并发布。');
      const motionProbeArtifactSet = managed ? validateDynamicProbeReviewed(project, readProgressState(project)) : null;
      const declaration = { evidenceText: evidence.trim(), scope: scope.trim() };
      styleDeclaration = { type: 'conversation-declaration', stage: 'style', status: 'confirmed', ...declaration,
        selectedStyleIds: selectedIds.filter(id => /^(?:original|new):/u.test(id)), selectedResourceIds: selectedIds,
        previewArtifactSet: { revision: artifact.revision, artifacts: artifact.artifacts }, ...(motionProbeArtifactSet ? { motionProbeArtifactSet } : {}), spec,
        designHash: designFingerprint(project, selectedResources, artifact, spec, motionProbeArtifactSet, declaration), recordedAt: new Date().toISOString(),
        authenticity: 'producer-recorded conversation claim; user identity is not authenticated' };
    } else if (stage === 'review') {
      const style = managed ? requireCurrentStyleApproval(project, optionValue(clean, '--size')) : null;
      const finalPreview = currentFinalPreview(project, true);
      if (!/(?:当前版本|最终预览|导出|成片)/u.test(scope)) fail('最终确认范围需明确指向当前最终预览或导出。');
      exportDeclaration = { type: 'conversation-declaration', stage: 'review', status: 'confirmed', evidenceText: evidence.trim(), scope: scope.trim(),
        ...finalPreview, ...(style?.designHash ? { styleDesignHash: style.designHash } : {}), recordedAt: new Date().toISOString(),
        authenticity: 'producer-recorded conversation claim; user identity is not authenticated' };
    }
  }

  if (stage === 'review' && (final || confirming)) await productionUnitView(project, true, managed?.productionUnitsRequired === true);
  if (managed && publish) {
    if (stage === 'style') fail('style 阶段不能发布完整项目作为探针；可发布 PNG 关键帧、probe 生成的 WebP，或用受限 --draft-probe 发布短时 scenes 快照。');
    if (!draftProbe) requireCurrentStyleApproval(project, optionValue(clean, '--size'));
  }
  if (managed && final) requireCurrentStyleApproval(project, optionValue(clean, '--size'));
  let reviewedAudio;
  if (stage === 'review' && final && publish) {
    prepareProjectBriefTextInputs(project);
    if (bindReviewAudio) {
      try {
        reviewedAudio = await prepareFinalReviewAudio(project, {
          size: optionValue(clean, '--size'), fps: Number(optionValue(clean, '--fps')),
          duration: finalClockDuration ?? (optionValue(clean, '--duration') === null ? undefined : Number(optionValue(clean, '--duration'))),
          audio: optionValue(clean, '--audio') ?? undefined,
        }, chapterManifest, env);
      } catch (error) { fail(`无法准备最终预览音轨：${error.message}`); }
      if (reviewedAudio.path) clean = replaceValueOption(clean, '--audio', reviewedAudio.path);
    }
  }
  if (confirming) clean = stripValueOptions(clean, new Set(['--size', '--fps']));

  const framePublication = frame && prepareFrameProgress(project, managed, frame, previewSource, clean, env);
  if (framePublication) clean = replaceValueOption(framePublication.argv, '--name', framePublication.name);
  if (frame?.role === 'implementation' && !optionValue(clean, '--message') && beforeStage?.message) {
    clean.push('--message', beforeStage.message);
  }
  let exitCode;
  try { exitCode = runCaptured('progress', [projectArg, ...clean], path.join(scripts, 'progress.mjs'), env); }
  finally {
    if (framePublication?.directory) fs.rmSync(framePublication.directory, { recursive: true, force: true });
  }
  if (exitCode !== 0) process.exit(exitCode);
  if (managed && draftProbe) {
    const state = readProgressState(project), preview = state?.preview;
    if (preview?.stage !== 'scenes' || preview.final !== false || !preview.id || !preview.directory) fail('动态草稿快照未进入同一工作台的 scenes 预览；不写探索回执。');
    const snapshotIndex = localProjectFile(project, path.join(preview.directory, 'index.html'), '动态草稿播放快照');
    const snapshotHash = projectTreeFingerprint(path.dirname(snapshotIndex)), currentHash = projectTreeFingerprint(project);
    if (snapshotHash !== currentHash) fail('动态草稿快照与当前工程文件不一致；不写探索回执。');
    const receipt = managedReceipt(project);
    const duration = Number(optionValue(clean, '--duration'));
    const record = { format: 'laohu.motion.draft-exploration/1', kind: 'bounded-playable-project-probe', draft: true, fullProduction: false,
      purpose: probePurpose.trim(), selection: probeSelection.trim(), duration, createdAt: new Date().toISOString(),
      designHash: dynamicProbeDesignFingerprint(project), projectTreeSha256: snapshotHash,
      ...(usesScopedDirection(receipt) ? {directionEvidence: directionEvidence(project, [{start: 0, end: duration}], progressTextReport.visualAssetPaths, textDirection.trim())} : {}),
      projectSpec: resolveProjectSpec(project, optionValue(clean, '--size'), receipt, optionValue(clean, '--fps')),
      previewId: preview.id, previewDirectory: preview.directory };
    if (!record.designHash) fail('播放快照未能绑定当前设计哈希；不写探索回执。');
    recordExploration(project, record);
    console.log(`已发布 ${record.duration} 秒技术动态草稿快照：${preview.directory}。它可由同一工作台实际播放，仍是草稿，不代表正式制作或导出；请实际打开浏览器核看。`);
  }
  if (framePublication) recordFrameProgress(project, managed, before, framePublication, previewSource);
  else if (managed && previewSource?.type === 'png' && stage === 'style') {
    const after = readProgressState(project);
    const artifactName = `${previewSource.sha256}.png`;
    const artifact = after?.artifacts?.filter(item => item.stage === 'style' && item.type === 'image' && path.basename(item.url || '') === artifactName).at(-1);
    if (!artifact) fail('工作台未登记刚发布的 PNG artifact；不写关键帧回执。');
    const previous = managed.keyframeSet?.artifacts || [];
    const sameRound = beforeStage?.status === 'waiting' && !clean.includes('--reopen') && previous.length
      && previous.every(item => (item.frame?.source || 'code') === 'code');
    if (!sameRound && after.artifacts.some(item => item.stage === 'style' && item.frame)) {
      after.artifacts = after.artifacts.filter(item => item.stage !== 'style' || !item.frame);
      archiveReplacedFrames(before, after);
      writeProjectArtifact(project, '.showreel-progress/status.json', `${JSON.stringify(after, null, 2)}\n`, '关键帧工作台记录');
    }
    const frame = { id: artifact.id, path: `.showreel-progress/artifacts/${artifactName}`, sha256: previewSource.sha256, width: previewSource.width, height: previewSource.height };
    if (usesScopedDirection(managed)) {
      const still = managed.explorations?.findLast(record => record.singleStill?.path === previewSource.path
        && record.singleStill.sha256 === previewSource.sha256)?.singleStill;
      frame.directionEvidence = still?.directionEvidence ?? directionEvidence(project, [{ start: 0, end: Number.MAX_SAFE_INTEGER }]);
    }
    updateReceipt(project, receipt => {
      const frames = sameRound ? [...receipt.keyframeSet.artifacts.filter(item => item.id !== frame.id), frame] : [frame];
      receipt.keyframeSet = { revision: sameRound ? receipt.keyframeSet.revision : `${Date.now()}-${previewSource.sha256.slice(0, 8)}`, artifacts: frames, updatedAt: new Date().toISOString() };
    });
  }
  if (styleDeclaration) {
    if (managed) updateReceipt(project, receipt => { receipt.confirmations ||= {}; receipt.confirmations.style = styleDeclaration; });
    else recordProgressConfirmation(project, 'style', styleDeclaration);
  }
  if (exportDeclaration) {
    if (managed) updateReceipt(project, receipt => { receipt.confirmations ||= {}; receipt.confirmations.export = exportDeclaration; });
    else recordProgressConfirmation(project, 'export', exportDeclaration);
  }
  if (managed && final && publish) {
    if (reviewedAudio) {
      const state = readProgressState(project);
      state.preview.reviewedAudio = reviewedAudio;
      const archived = state.previews?.find(preview => preview.id === state.preview.id);
      if (archived) archived.reviewedAudio = reviewedAudio;
      writeProjectArtifact(project, '.showreel-progress/status.json', `${JSON.stringify(state, null, 2)}\n`, '最终预览音轨回执');
    }
    const finalPreview = currentFinalPreview(project, true);
    updateReceipt(project, receipt => { receipt.finalPreview = { ...finalPreview, styleDesignHash: receipt.confirmations?.style?.designHash || null, recordedAt: new Date().toISOString() }; });
  }
  if (confirming && !styleDeclaration && !exportDeclaration) recordProgressDeclaration(project, stage, { evidenceText: evidence.trim(), scope: scope.trim(), recordedAt: new Date().toISOString() });
  if (managed && previewSource?.type === 'webp' && stage === 'style') {
    const progress = readProgressState(project);
    const row = progress?.artifacts?.find(item => item.stage === 'style' && item.type === 'image' && path.basename(item.url || '') === `${previewSource.sha256}.webp`);
    if (!row) fail('动态 WebP 未进入工作台 artifact 列表。');
  }
  console.log('工作台的阶段或成果已更新。浏览器是否已打开需另行在实际浏览器中核验。');
  process.exit(0);
}

function requireCurrentStyleApproval(project, sizeOverride = null, { comparisonOnly = false } = {}) {
  const receipt = readInputState(project, true);
  const managed = receipt?.format === 'laohu.motion.input-delivery/2';
  const scoped = usesScopedDirection(receipt);
  const confirmation = managed ? receipt.confirmations?.style : readProgressState(project)?.confirmations?.style;
  if (!confirmation) fail('正式制作前需要用户对当前关键帧作明确确认；CLI 自行调用 confirmed 不算用户依据。');
  const artifact = currentStyleArtifact(project, false);
  if (artifact.revision !== confirmation.previewArtifactSet?.revision || JSON.stringify(artifact.artifacts) !== JSON.stringify(confirmation.previewArtifactSet?.artifacts)) fail('风格确认绑定的关键帧集合已改变；重新发布并等待用户确认。');
  const selectedIds = scoped ? selectedResourceIdsFromDirection(topLevelBriefBlocks(project).direction) : confirmation.selectedResourceIds || confirmation.selectedStyleIds || [];
  const selected = managed ? selectedResourceBindings(project, selectedIds, receipt) : [];
  const spec = resolveProjectSpec(project, sizeOverride, managed ? receipt : readInputState(project, true));
  if (spec.width && artifact.artifacts.some(item => item.width !== spec.width || item.height !== spec.height)) fail('已确认关键帧像素规格与当前项目规格不一致；重新生成并确认。');
  if (scoped ? spec.size !== confirmation.spec?.size || spec.fps !== confirmation.spec?.fps : JSON.stringify(spec) !== JSON.stringify(confirmation.spec)) fail('设计确认后的画幅、像素或帧率规格已变化；重新生成并确认关键帧。');
  const motionProbeArtifactSet = !managed ? null : comparisonOnly && !scoped
    ? confirmation.motionProbeArtifactSet || null
    : validateDynamicProbeReviewed(project, readProgressState(project));
  const fingerprint = designFingerprint(project, selected, artifact, spec, motionProbeArtifactSet, confirmation);
  if (fingerprint !== confirmation.designHash) fail('设计内容、已选风格、画幅或关键帧版本已改变；旧确认不再适用于当前版本。');
  return { managed, receipt, confirmation, artifact, selected, spec, designHash: fingerprint };
}

function hasStaticExplorationOptions(argv) {
  const values = ['--directions', '--still', '--range', '--poster'].flatMap(option => {
    const occurrences = optionValues(argv, option);
    if (occurrences.length > 1 || occurrences.some(value => !value.trim())) {
      fail(`静帧探索需要最多一项非空 ${option}。`);
    }
    return occurrences;
  });
  return values.length > 0;
}

function prepareFormalRender(project, argv) {
  const receipt = managedReceipt(project);
  requireProductionPhase(project, receipt);
  if (receipt?.projectPhase && !argv.includes('--determinism') && !argv.includes('--text-check')) {
    const out = optionValue(argv, '--out');
    if (!out || !path.relative(project, path.resolve(workRoot, out)).startsWith(`qa${path.sep}`)) {
      return requireCurrentExportApproval(project, optionValue(argv, '--size'));
    }
  }
  if (receipt) requireCurrentStyleApproval(project, optionValue(argv, '--size'));
  return null;
}

async function promoteProduction(project, auditRelative) {
  const receipt = managedReceipt(project);
  if (!isExploring(project, receipt)) fail('promote-production 用于同一个已 scaffold --phase explore 的项目。');
  if (!receipt.confirmations?.style) fail('仍在等待用户确认当前方向图和 3–6 秒动态小样；收到针对本轮方向的原话后用 progress --stage style --confirm 记录，再晋级。');
  requireInputDelivery(project, projectReference(project));
  const briefFile = localProjectFile(project, 'brief.md', '全片 Brief');
  const brief = fs.readFileSync(briefFile, 'utf8');
  const briefSha256 = sha256(brief);
  compileBriefTextMap(brief, {projectRoot: project});
  await productionUnitView(project, true, true);
  const approval = requireCurrentStyleApproval(project);
  if (!auditRelative || path.isAbsolute(auditRelative) || auditRelative.split(/[\\/]/u).includes('..')) fail('promote-production 需要 --audit <项目相对路径> 指向当前全片 Brief 的审稿记录。');
  const auditFile = localProjectFile(project, auditRelative, '全片 Brief 审稿记录');
  const audit = fs.readFileSync(auditFile, 'utf8');
  const lines = [...audit.matchAll(/^brief-sha256:\s*([a-f0-9]{64})[\t ]*$/gmu)];
  if (lines.length !== 1 || lines[0][1] !== briefSha256 || !audit.replace(lines[0][0], '').trim()) {
    fail('审稿记录须含本版全片 Brief 的 `brief-sha256: <SHA-256>` 和实际检查结论；Brief 变动后用新版审稿。');
  }
  updateReceipt(project, state => {
    if (!isExploring(project, state) || state.confirmations?.style?.designHash !== approval.designHash || fileSha256(briefFile) !== briefSha256) {
      fail('探索阶段、设计确认或 Brief 在晋级期间已变化；请以当前版本重新检查。');
    }
    state.projectPhase = 'production';
    state.productionUnitsRequired = true;
    state.promotion = { briefSha256, designHash: approval.designHash, auditPath: auditRelative, auditSha256: sha256(audit), recordedAt: new Date().toISOString() };
  });
  console.log('同一工程已进入生产阶段。全片 Brief、成片时钟和当前方向证据已对齐；完成实制后另行发布最终预览并记录导出确认。');
}

async function prepareBuildLong(projectArg, argv) {
  const manifestPath = path.resolve(workRoot, projectArg);
  const project = path.dirname(manifestPath);
  const receipt = managedReceipt(project);
  requireProductionPhase(project, receipt);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const preflight = [];
  let finalAudioBound = false;
  const requestedDirection = optionValue(argv, '--text-direction');
  for (const chapter of manifest.chapters || []) {
    if (typeof chapter.project !== 'string') continue;
    const chapterProject = path.resolve(project, chapter.project);
    const chapterReceipt = managedReceipt(chapterProject);
    requireProductionPhase(chapterProject, chapterReceipt);
    if (receipt?.projectPhase) {
      const chapterRelative = path.relative(fs.realpathSync(project), fs.realpathSync(chapterProject));
      if (path.isAbsolute(chapterRelative) || chapterRelative.split(path.sep).some(part => ['..', '.cache', 'out', 'qa', '.showreel-progress'].includes(part))) {
        fail('两阶段工程的章工程须位于当前已预览的项目内容内，不能指向外部路径或临时状态。');
      }
    }
    if (chapterReceipt && chapterProject !== project) {
      await productionUnitView(chapterProject, true, chapterReceipt.productionUnitsRequired === true);
      requireCurrentExportApproval(chapterProject);
    }
    const prepared = prepareProjectBriefTextInputs(chapterProject);
    if (prepared?.readyMap.entries.length) {
      const names = [...new Set(prepared.readyMap.entries.map(row => row.direction).filter(name => name !== '共用'))];
      const direction = chapterReceipt?.projectPhase ? projectExplorationDirection(chapterProject).name
        : requestedDirection ?? (names.length === 1 ? names[0] : null);
      if (!direction) fail(`分章预检需要指定 --text-direction <所选方向名>：${chapter.id}。`);
      preflight.push({chapter, chapterProject, direction, map: prepared.readyMap});
    }
  }
  if (receipt) {
    const units = await productionUnitView(project, true, receipt.productionUnitsRequired === true);
    const approval = requireCurrentExportApproval(project, optionValue(argv, '--size'));
    if (receipt.projectPhase && (manifest.size !== approval.spec.size || manifest.fps !== approval.spec.fps
      || Math.abs(manifest.duration - units.units.at(-1).t1) > 1e-6)) {
      fail('分章构建清单的总时长、画幅和帧率须与已确认的最终预览一致。');
    }
    if (approval.finalPreview.reviewedAudio) {
      verifyLongformReviewAudio(project, manifest, approval.finalPreview.reviewedAudio, runtimeEnv());
      finalAudioBound = true;
    }
  }
  prepareProjectBriefTextInputs(project);
  const checked = new Map();
  // Forward the same manifest object whose audio plan passed the final preview gate.
  let adapted = finalAudioBound;
  for (const {chapter, chapterProject, direction, map} of preflight) {
    const shared = {direction, size: manifest.size, fps: manifest.fps, exhaustiveFrames,
      useDefaultDirection: true, publishReport: false, trackVisualAssets: true};
    if (!checked.has(chapterProject)) checked.set(chapterProject, await runBriefTextContract(chapterProject, shared));
    const start = chapter.start ?? 0;
    const report = checked.get(chapterProject);
    const window = start === 0 && chapter.duration === report.duration ? report
      : await runBriefTextContract(chapterProject, {...shared, start, duration: chapter.duration, enforceWindow: true});
    if (Array.isArray(chapter.inputs)) {
      const dependencies = [report.mapPath, report.runtimeModules.briefText, ...(map.typefaces ?? []).map(face => face.assetPath)];
      if (map.entries.some(entry => entry.caption)) dependencies.push(report.runtimeModules.caption);
      if (map.captionSource) dependencies.push(map.captionSource.path, 'fonts/captions/SourceHanSansCN-700.ttf');
      dependencies.push(...new Set([...report.visualAssetPaths, ...window.visualAssetPaths].filter(file => /\.(?:woff2?|ttf|otf)$/iu.test(file))));
      const existing = new Set(chapter.inputs.filter(file => typeof file === 'string').map(file => path.resolve(chapterProject, file)));
      for (const file of new Set(dependencies)) {
        if (existing.has(path.resolve(chapterProject, file))) continue;
        localProjectFile(chapterProject, file, '文字相关的章节构建依赖');
        chapter.inputs.push(file);
        adapted = true;
      }
    }
  }
  return {manifestPath, project, manifest, adapted};
}

async function runAdaptedBuildLong({project, manifest}, argv, scripts, env) {
  const options = parseLocalOptions(argv.filter(arg => arg !== '--skip-qa'), new Set(['--out', '--cache', '--retries']), 'build-long');
  const {buildLong, runCommand} = await import(pathToFileURL(path.join(scripts, 'build-long.mjs')).href);
  const temporaryDir = fs.mkdtempSync(path.join(env.TMPDIR, 'chapter-manifest-'));
  const temporary = path.join(temporaryDir, 'film.json');
  const projectPath = file => path.resolve(project, file);
  const cache = projectPath(options['--cache'] || '.showreel-cache');
  // The runtime resolves paths and top-level narration/QA relative to the manifest.
  // Keep those operations on the original project while supplying a private file with the additive inputs.
  const audio = manifest.audio === undefined ? undefined : projectPath(manifest.audio);
  const runWithEnv = (binary, args) => runCommand(binary, args, {env});
  const runForProject = (binary, args) => runWithEnv(binary, args[0] === path.join(scripts, 'inspect.mjs') && args[1] === 'qa'
    ? replaceValueOption(args, '--out', projectPath('qa/final')) : args);
  try {
    if (cache === project) throw Error('cache must be a separate directory');
    const chapters = manifest.chapters.map(chapter => ({...chapter, project: projectPath(chapter.project),
      ...(chapter.audio === undefined ? {} : {audio: projectPath(chapter.audio)})}));
    fs.writeFileSync(temporary, JSON.stringify({...manifest, chapters, audio}), {flag: 'wx', mode: 0o600});
    if (audio && fs.existsSync(projectPath('audio/narration.json'))) {
      await runWithEnv(process.execPath, [path.join(scripts, 'narration.mjs'), 'check', project, '--duration', String(manifest.duration), '--audio', audio]);
    }
    await buildLong(temporary, {out: projectPath(options['--out'] || 'out/final.mp4'),
      cache, retries: options['--retries'] === undefined ? 1 : Number(options['--retries']),
      skipQa: argv.includes('--skip-qa'), run: runForProject});
  } finally {
    fs.rmSync(temporary, {force: true});
    fs.rmdirSync(temporaryDir);
  }
}

function writeStdoutFully(text) {
  const bytes = Buffer.from(text);
  let offset = 0;
  while (offset < bytes.length) offset += fs.writeSync(1, bytes, offset, bytes.length - offset);
}

const OUTPUT_OPTIONS = {
  render: new Set(['--out']),
  inspect: new Set(['--out']),
  audio: new Set(['--out', '--cache-dir']),
  narration: new Set(['--out']),
  'build-long': new Set(['--out', '--cache']),
};
const VALUE_OPTIONS = {
  render: new Set(['--out', '--start', '--duration', '--size', '--fps', '--workers', '--subframes', '--shutter', '--dpr', '--grain', '--crf', '--audio', '--purpose', '--text-direction', '--q']),
  editor: new Set(['--size', '--fps', '--duration', '--audio', '--workers', '--subframes', '--shutter', '--dpr', '--grain', '--crf', '--port']),
  preview: new Set(['--size', '--audio', '--fps', '--port']),
  inspect: new Set(['--out', '--cells', '--width', '--at', '--frames', '--step', '--freeze', '--timeline', '--expect-size', '--expect-fps', '--expect-duration', '--audio', '--thresh', '--debounce', '--tol']),
  audio: new Set(['--out', '--cache-dir', '--dur', '--lufs', '--bpm', '--shift', '--engine', '--drops']),
  narration: new Set(['--out', '--script', '--source', '--provider', '--model', '--voice', '--duration', '--max-chars', '--retries', '--audio', '--timestamps', '--transcriber', '--bgm', '--bgm-source', '--sfx', '--sfx-source', '--narration', '--bgm-gain', '--sfx-gain', '--duck-db']),
  progress: new Set(['--stage', '--status', '--message', '--done', '--total', '--preview', '--publish', '--size', '--fps', '--duration', '--audio', '--shot', '--name', '--next', '--reopen', '--workers', '--subframes', '--shutter', '--dpr', '--grain', '--crf', '--evidence-text', '--scope', '--selected-style', '--selected-resource', '--selection', '--purpose', '--text-direction', ...frameProgressOptions]),
  'build-long': new Set(['--out', '--cache', '--retries']),
};
function optionValue(argv, option) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === option) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail(`${option} needs a path value`);
      return argv[i + 1];
    }
    if (argv[i].startsWith(`${option}=`)) return argv[i].slice(option.length + 1);
  }
  return null;
}
function optionValues(argv, option) {
  const values = [];
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === option) {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) fail(`${option} needs a value`);
      values.push(argv[++index]);
    } else if (argv[index].startsWith(`${option}=`)) values.push(argv[index].slice(option.length + 1));
  }
  return values;
}
function stripValueOptions(argv, names) {
  const result = [];
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    const key = value.split('=', 1)[0];
    if (!names.has(key)) { result.push(value); continue; }
    if (value === key) index++;
  }
  return result;
}
function runCaptured(commandName, argv, script, env) {
  if (path.basename(script) === 'render.mjs') bindShowreelBrowser(env);
  const result = spawnSync(process.execPath, [script, ...argv], { cwd: workRoot, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) fail(result.error.message, 1);
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  return result.status ?? 1;
}
function managedReceipt(project) {
  const state = readInputState(project, true);
  return state?.format === 'laohu.motion.input-delivery/2' ? state : null;
}
function parseEvidenceOptions(argv, { evidence = '--evidence-text', scope = '--scope' } = {}) {
  return { evidenceText: optionValue(argv, evidence), scope: optionValue(argv, scope) };
}
function validateDeclaration(evidenceText, scope, kind) {
  if (typeof evidenceText !== 'string' || evidenceText.trim().length < 3 || evidenceText.length > 1200) fail(`${kind}需要 --evidence-text，填写用户在当前对话中的明确原话（3–1200 字）。这只是制作端声明，不认证说话人身份。`);
  if (typeof scope !== 'string' || scope.trim().length < 8 || scope.length > 400 || /^(确认|通过|同意|继续|ok|yes|approved|looks good)$/iu.test(scope.trim())) fail(`${kind}需要具体的 --scope（8–400 字），说明用户确认的方向、画面或导出范围。`);
  if (/^(你决定|给我惊喜|不用逐段问|surprise me|you decide|go ahead|continue)$/iu.test(evidenceText.trim())) fail(`“${evidenceText.trim()}”没有明确确认当前${kind}范围，不能作为批准依据。`);
}
function updateReceipt(project, mutate) {
  const state = readInputState(project, true);
  if (!state) return null;
  mutate(state);
  writeInputState(project, state);
  return state;
}
function positionalArgs(argv, valueOptions = new Set()) {
  const result = [];
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (valueOptions.has(value)) { i++; continue; }
    if (value.startsWith('--')) continue;
    result.push(value);
  }
  return result;
}
function checkedOutput(value, label) {
  if (typeof value !== 'string' || !value) fail(`${label} has no output path`);
  assertWorkDisk(path.isAbsolute(value) ? value : path.resolve(workRoot, value), label);
}
function checkAudioPlanTargets(argv) {
  for (const [option, label] of [
    ['--output', 'audio-plan WAV/plan output'],
    ['--manifest', 'audio-plan manifest output'],
    ['--cache-dir', 'audio-plan cache directory'],
    ['--final-output', 'audio-plan mux output'],
  ]) {
    const value = optionValue(argv, option);
    if (value) checkedOutput(value, label);
  }
}
function checkWritableTargets(name, argv, env) {
  const valueOptions = VALUE_OPTIONS[name] || new Set();
  const positional = positionalArgs(argv, valueOptions);
  const out = optionValue(argv, '--out');
  if (['render', 'editor', 'preview'].includes(name)) {
    if (positional[0]) {
      const project = assertWorkDisk(positional[0], `${name} project`);
      assertWorkDisk(path.join(project, 'out'), `${name} render output`);
      if (name === 'render') assertWorkDisk(path.join(project, 'qa'), 'render review-material output');
      if (name === 'editor') {
        assertWorkDisk(path.join(project, '.showreel-editor'), 'editor session/export output');
        if (argv.includes('--progress')) assertWorkDisk(path.join(project, '.showreel-progress'), 'editor progress output');
      }
    }
    if (name === 'render' && out) checkedOutput(out, 'render --out');
    return;
  }
  if (name === 'inspect') {
    const subcommand = positional[0], input = positional[1];
    if (!subcommand || !input) return;
    const defaultPrefix = path.join(path.dirname(path.resolve(workRoot, input)), '..', 'qa', path.basename(input, path.extname(input)));
    checkedOutput(out || defaultPrefix, 'inspect output');
    return;
  }
  if (name === 'audio') {
    const [subcommand, input] = positional;
    if (subcommand === 'build' && input) {
      const output = out || path.join(path.dirname(path.resolve(workRoot, input)), 'audio', 'music.wav');
      checkedOutput(output, 'audio build output');
      if (argv.includes('--stems')) checkedOutput(path.join(path.dirname(path.resolve(workRoot, output)), 'stems'), 'audio stems output');
    } else if (subcommand === 'samples' && input) {
      checkedOutput(path.join(env.SHOWREEL_SAMPLES, input), 'audio samples output');
    } else if (subcommand === 'check' && input) {
      const prefix = out || path.join(path.dirname(path.resolve(workRoot, input)), '..', 'qa', 'audio');
      checkedOutput(prefix, 'audio check output');
    } else if (subcommand === 'beats' && out) checkedOutput(out, 'audio beat-grid output');
    else if (subcommand === 'mux' && positional[2]) {
      const video = positional[1];
      const output = out || path.resolve(workRoot, video).replace(/\.mp4$/, '') + '-final.mp4';
      checkedOutput(output, 'audio mux output');
    }
    const cacheDir = optionValue(argv, '--cache-dir');
    if (cacheDir) checkedOutput(cacheDir, 'audio cache directory');
    return;
  }
  if (name === 'narration') {
    const [subcommand, projectArg] = positional;
    if (!subcommand || !projectArg) return;
    const project = assertWorkDisk(projectArg, 'narration project');
    assertWorkDisk(path.join(project, 'audio'), 'narration output directory');
    if (subcommand === 'mix' && out) checkedOutput(out, 'narration mix output');
    return;
  }
  if (name === 'progress') {
    const project = positional[0];
    if (project) {
      const root = assertWorkDisk(project, 'progress project');
      assertWorkDisk(path.join(root, '.showreel-progress'), 'progress output directory');
    }
    return;
  }
  if (name === 'build-long') {
    const manifestPath = positional[0];
    if (!manifestPath) return;
    const manifest = path.resolve(workRoot, manifestPath);
    assertWorkDisk(path.dirname(manifest), 'build-long project root');
    const root = path.dirname(manifest);
    checkedOutput(path.resolve(root, out || 'out/final.mp4'), 'build-long final output');
    checkedOutput(path.resolve(root, optionValue(argv, '--cache') || '.showreel-cache'), 'build-long render cache');
    if (!argv.includes('--skip-qa')) checkedOutput(path.resolve(root, 'qa/final'), 'build-long final QA output');
    const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    for (const chapter of data.chapters || []) {
      if (typeof chapter.project === 'string') assertWorkDisk(path.resolve(root, chapter.project), `build-long chapter ${chapter.id || '?'} project`);
    }
  }
}

const [command, ...cliArgs] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') {
  console.log(usage);
  process.exit(command ? 0 : 2);
}
if (command !== 'verify-source' && !commands.has(command)) fail(`unknown command: ${command}`);
const exhaustiveOptions = cliArgs.filter(value => value === '--exhaustive-frames' || value.startsWith('--exhaustive-frames='));
if (exhaustiveOptions.length && (!['text-contract', 'render', 'probe', 'progress', 'build', 'build-long'].includes(command)
  || exhaustiveOptions.length > 1 || exhaustiveOptions[0] !== '--exhaustive-frames')) fail(`${command} 不支持该 --exhaustive-frames 写法。`);
const exhaustiveFrames = exhaustiveOptions.length === 1;
const args = cliArgs.filter(value => value !== '--exhaustive-frames');
if (command === 'audio-map') {
  if (args.length) fail('audio-map 不接收参数');
  const {audioMap} = await import('./audio-map.mjs');
  console.log(audioMap(JSON.parse(fs.readFileSync(path.join(skillRoot, 'assets/audio/index.json'), 'utf8'))));
  process.exit(0);
}
const sourceFileCount = verifySourceClosure();
if (command === 'verify-source') {
  console.log(`PASS: verified ${sourceFileCount} pinned files in the local Motion Showreel runtime`);
  process.exit(0);
}
if (command === 'progress-task') {
  const [projectArg, op, id, item, title] = args;
  if (!projectArg) fail('progress-task 需要项目路径');
  const project = assertWorkDisk(projectArg, '制作进度项目');
  assertWorkDisk(path.join(project,'.showreel-progress/tasks'), '制作任务记录');
  const { startTask, endTask } = await import('../templates/runtime/production-workbench/tasks.mjs');
  if (op === 'start' && id && args.length <= 5) console.log(startTask(project,id,item,title));
  else if (['finish','stop'].includes(op) && args.length === 3) endTask(project,id,op);
  else fail('progress-task <project> start <stage> [条目ID [名称]] 或 finish|stop <任务编号>');
  process.exit(0);
}
if (command === 'text-contract') {
  if (!args[0]) fail('text-contract needs <project> and --text-direction <selected-name>');
  const project = assertWorkDisk(args[0], 'screen-text project');
  const options = parseLocalOptions(args.slice(1), new Set(['--text-direction', '--start', '--duration', '--fps', '--size']), command);
  if (!options['--text-direction']) fail('text-contract needs --text-direction <selected-name>');
  requirePinnedDependencies();
  await runBriefTextContract(project, {direction: options['--text-direction'],
    start: options['--start'] === undefined ? 0 : Number(options['--start']),
    duration: options['--duration'] === undefined ? undefined : Number(options['--duration']),
    fps: options['--fps'] === undefined ? 30 : Number(options['--fps']), size: options['--size'] || '1920x1080', exhaustiveFrames})
    .catch(error => { console.error(`laohu-showreel: ${error.message}`); process.exit(1); });
  process.exit(0);
}
if (command === 'text-inputs') {
  if (args.length !== 1) fail('text-inputs 需要一个项目路径。');
  const project = assertWorkDisk(args[0], '工作台屏显文字项目');
  try { prepareProjectBriefTextInputs(project); }
  catch (error) { fail(error.message); }
  process.exit(0);
}
if (resourceCommands.includes(command)) {
  const mapText = command === 'resource-overview' && optionValue(args, '--scope') === 'global-map' && !args.includes('--json');
  const result = callResourceCli([command, ...args], { json: !mapText });
  writeStdoutFully(mapText ? result : `${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}
if (command === 'brief-units') {
  if (!args[0] || args.length > 2 || args[1] && args[1] !== '--final') fail('brief-units 需要项目路径，可加 --final 校验当前成片时钟。');
  const project = assertWorkDisk(args[0], '制作片段项目');
  try { writeStdoutFully(`${JSON.stringify(await productionUnitView(project, args[1] === '--final', true), null, 2)}\n`); }
  catch (error) { fail(error.message); }
  process.exit(0);
}
if (command === 'chapter-binding' || command === 'chapter-index') {
  const target = args[0];
  if (!target) fail(`${command} 需要 <project>。`);
  const project = assertWorkDisk(target, '章节项目');
  const options = parseLocalOptions(args.slice(1), new Set(['--timeline', ...(command === 'chapter-index' ? ['--chapters', '--video', '--out'] : [])]), command);
  const timelineRelative = options['--timeline'] || 'timeline.js';
  const binding = await currentChapterBinding(project, timelineRelative);
  if (command === 'chapter-binding') {
    process.stdout.write(`${JSON.stringify(binding, null, 2)}\n`);
    process.exit(0);
  }
  const chaptersRelative = options['--chapters'] || 'chapters.json';
  const chaptersPath = localProjectFile(project, chaptersRelative, '章节元数据');
  let chapterMetadata;
  try { chapterMetadata = JSON.parse(fs.readFileSync(chaptersPath, 'utf8')); }
  catch (error) { fail(`章节元数据不是有效 JSON：${error.message}`); }
  if (!Array.isArray(chapterMetadata.chapters) || chapterMetadata.chapters.length < 2) fail('默认章节导航只用于实际多章节内容；至少提供两章真实内容，不补造章数。');
  const { timeline } = await loadChapterTimeline(project, timelineRelative, binding);
  const helperPath = path.join(skillRoot, 'templates/runtime/native-presentation/chapters.mjs');
  if (!fs.existsSync(helperPath)) fail('缺少受绑定保护的 chapters.mjs 章节消费者；先安装当前 native-presentation helper。');
  const { buildChapterIndex } = await import(pathToFileURL(helperPath).href);
  const compiled = buildChapterIndex({ timeline, chapters: chapterMetadata.chapters, binding: chapterMetadata.binding, expectedBinding: binding });
  const outputRelative = options['--out'] || 'chapter-index.json';
  if (!/\.json$/iu.test(outputRelative)) fail('章节索引输出必须使用 .json 扩展名；可通过 --out 指定项目内路径。');
  const videoRelative = options['--video'] || 'out/final.mp4';
  let videoPath = null, htmlRelative = null, videoFromHtml = null, sceneFromHtml = null;
  if (videoRelative !== 'none') {
    const videoCandidate = path.resolve(project, videoRelative);
    const videoExists = fs.existsSync(videoCandidate) && fs.statSync(videoCandidate).isFile();
    if (!videoExists && options['--video']) fail(`指定的章节播放器视频不存在：${videoRelative}`);
    videoPath = videoExists ? localProjectFile(project, videoRelative, '章节播放器视频') : outputPathInside(project, videoRelative, '章节播放器视频');
    htmlRelative = outputRelative.replace(/\.json$/iu, '.html');
    if (videoExists) videoFromHtml = path.relative(path.dirname(path.resolve(project, htmlRelative)), videoPath) || path.basename(videoPath);
    sceneFromHtml = path.relative(path.dirname(path.resolve(project, htmlRelative)), localProjectFile(project, 'index.html', '章节场景预览')) || 'index.html';
  }
  const output = { schema: 'laohu.motion.chapter-index/1', binding, durationSeconds: timeline.durationSeconds, chapters: compiled.chapters,
    ...(htmlRelative ? { interactivePlayer: { path: htmlRelative, mode: videoFromHtml ? 'video' : 'scene-render',
      behavior: videoFromHtml ? 'chapter buttons seek the bound video to the event start' : 'chapter buttons call the bound scene render(t) at the event start' } } : {}) };
  const outputText = `${JSON.stringify(output, null, 2)}\n`;
  const outputPath = writeProjectArtifact(project, outputRelative, outputText, '章节时间索引');
  const playerPath = htmlRelative ? writeProjectArtifact(project, htmlRelative, chapterPlayerHtml(output, videoFromHtml, sceneFromHtml), '章节播放器') : null;
  const linkPath = ensureChapterWorkbenchLink(project);
  const playerRelativeToProject = playerPath ? path.relative(project, playerPath).split(path.sep).join('/') : null;
  writeProjectArtifact(project, 'chapter-navigation.json', `${JSON.stringify({ schema: 'laohu.motion.chapter-navigation-link/1', playerPath: playerRelativeToProject }, null, 2)}\n`, '工作台章节入口目标');
  console.log(`章节时间索引已从当前 timeline.js 实际事件生成并绑定 brief/timeline：${path.relative(project, outputPath)}（${compiled.chapters.length} 章）。`);
  const playerBehavior = videoFromHtml ? '点击章节 seek 成片视频' : videoRelative !== 'none' ? '点击章节调用真实场景 render(t) 到达事件起点' : '未启用交互播放器';
  console.log(`平台章节时间码与实际播放器跳转分开：索引 JSON 可用于平台填写；交互播放器 ${playerPath ? path.relative(project, playerPath) : '未生成'}（${playerBehavior}）。无 MP4 时在正式场景预览中使用同一时间线；MP4 生成后重新运行本命令可切换为成片播放器。本命令不修改受保护 editor/runtime，也不把 MP4 像素章节条说成可点击。`);
  console.log(`默认工作台场景页含动态章节入口（${linkPath ? '刚加入，请重新载入工作台场景' : '已存在；若工作台早于入口建立，重新载入场景后可见'}）；播放器在工作台画面中打开，并可使用工作台时间轴查看当前视频帧。`);
  process.exit(0);
}
if (command === 'input-map' || command === 'input-prepare') {
  const target = args[0];
  if (!target) fail(`${command} 需要 <project>。`);
  const acceptedValueOptions = new Set(['--spec', '--spec-source', '--spec-evidence-text', '--fps', '--page-characters']);
  const recognizedFlags = new Set(['--full-redesign', '--resume']);
  for (let index = 1; index < args.length; index++) {
    const key = args[index].split('=', 1)[0];
    if (recognizedFlags.has(key)) continue;
    if (acceptedValueOptions.has(key)) { if (args[index] === key) index++; continue; }
    fail(`${command} 不支持参数：${args[index]}`);
  }
  const project = assertWorkDisk(target, 'input-delivery project');
  if (fs.existsSync(project) && !fs.statSync(project).isDirectory()) fail(`输入交付目标不是目录：${target}`);
  fs.mkdirSync(project, { recursive: true });
  assertWorkDisk(project, 'input-delivery project');
  const existingRenderer = hasExistingRenderer(project);
  const fullRedesign = args.includes('--full-redesign');
  const resume = args.includes('--resume');
  const previous = readInputState(project, true);
  const sameProject = previous?.projectPath === projectReference(project);
  const continuingProject = resume && sameProject && ['new-project', 'full-redesign'].includes(previous.mode);
  if (existingRenderer && !fullRedesign && !continuingProject) fail('已有渲染工程只有明确的全新重做才开始目录流程；局部修保留原项目路线，可用 resource-overview --scope global-map 查目录。');
  if (!existingRenderer && fullRedesign) fail('--full-redesign 只用于已有渲染工程。');
  const mode = continuingProject && !fullRedesign ? previous.mode : (existingRenderer ? 'full-redesign' : 'new-project');
  const currentSpec = currentSpecPlan(project, existingRenderer, args, sameProject ? previous : null, resume, mode);
  const pageOption = optionValue(args, '--page-characters');
  const pageCharacterLimit = pageOption === null ? (previous?.projectPath === projectReference(project) ? previous.pageCharacterLimit || inputPageLimit : inputPageLimit) : Number(pageOption);
  if (!Number.isInteger(pageCharacterLimit) || pageCharacterLimit < 2000 || pageCharacterLimit > inputPageLimit) fail(`--page-characters 必须是 2000–${inputPageLimit} 之间的整数，以适应宿主单次输出上限；Unicode 字符数不是 token 数。`);
  const bundle = makeInputBundle(currentSpec, pageCharacterLimit);
  const briefPath = path.join(project, 'brief.md');
  if (!fs.existsSync(briefPath)) {
    assertWorkDisk(briefPath, 'brief template output');
    const template = fs.readFileSync(path.join(runtimeRoot, 'references/brief-template.md'), 'utf8');
    const xmlTemplate = template.match(/```text\r?\n([\s\S]*?)\r?\n```/);
    if (!xmlTemplate) fail('原 brief-template.md 缺少围栏内的 XML 正文；已停止准备，没有创建项目 brief。');
    try { fs.writeFileSync(briefPath, `${adaptBriefText(xmlTemplate[1], currentSpec.size)}\n`, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') fail(`无法创建本地 brief 工作稿：${error.message}`); }
  }
  const state = reconcileInputState(project, previous, bundle, currentSpec);
  if (state !== previous && previous?.projectPath === projectReference(project) && previous?.candidates && typeof previous.candidates === 'object') state.candidates = previous.candidates;
  if (previous?.projectPath === projectReference(project) && previous.productionUnitsRequired) state.productionUnitsRequired = true;
  state.mode = mode;
  state.currentSpec = currentSpec;
  if (state.projectPath !== projectReference(project)) fail(`输入交付回执绑定了另一个项目路径；保留 brief，并用当前项目路径重新准备。`);
  if (command === 'input-map') {
    writeStdoutFully(bundle.pages.map(page => page.text).join(''));
    const deliveredAt = new Date().toISOString();
    for (const page of bundle.pages) recordInputPageOutput(state, page, deliveredAt);
    refreshInputDelivery(project, state, bundle);
    writeInputState(project, state);
    console.error(`已完整输出 L0 全局星图（${bundle.pages.length} 页，正文 ${bundle.totals.catalog.characters} 字）。回执：${inputReceiptPath(project)}。按观看问题展开 L1，拟采用项用 input-candidate 读取。`);
    process.exit(0);
  }
  writeInputState(project, state);
  console.log(`已准备全源 L0 星图，共 ${bundle.pages.length} 页；本项目单页上限 ${pageCharacterLimit} 个 Unicode 字符。`);
  console.log(`本轮规格：${currentSpec.size} / ${currentSpec.fps} fps；来源：${currentSpec.source}${currentSpec.evidenceText ? `；依据：${currentSpec.evidenceText}` : ''}。这是制作端记录，不认证对话身份。`);
  console.log(`当前全源 L0 ${bundle.totals.catalog.characters} 字 / ${bundle.totals.catalog.bytes} 字节。`);
  console.log(`项目目录回执：${inputReceiptPath(project)}`);
  if (state.status === 'catalog-delivered') console.log(`当前回执：catalog-delivered；本轮实际输出 ${state.deliveryReceipt.emittedPageCount} 页、复用同源历史输出 ${state.deliveryReceipt.sourceReusedPageCount} 页。历史输出不证明当前上下文仍持有或理解；缺上下文时用输入页 ID 有界回读。`);
  else console.log(`一次输出全源 L0：${inputCommand('input-map', target, '--resume')}。逐页读取：${inputCommand('input-page', target)}`);
  process.exit(0);
}
if (command === 'input-page') {
  const target = args[0];
  let pageId = null, next = false;
  for (let index = 1; index < args.length; index++) {
    if (args[index] === '--next') next = true;
    else if (args[index] === '--id' && args[index + 1]) pageId = args[++index];
    else if (args[index].startsWith('--id=')) pageId = args[index].slice('--id='.length);
    else fail(`input-page 不支持参数：${args[index]}`);
  }
  if (!target || Number(next) + Number(pageId !== null) !== 1) fail('input-page 需要 <project> --next 或 --id <stable-page-id>；按页 ID 可精确重放。');
  const project = assertWorkDisk(target, 'input-delivery project');
  const state = readInputState(project);
  if (!state) fail(`尚未准备输入交付。下一步：${inputCommand('input-map', target)}`);
  const bundle = makeInputBundle(state.currentSpec, state.pageCharacterLimit || inputPageLimit);
  const status = validateInputState(project, state, bundle);
  const prepareNext = inputCommand('input-map', target, '--resume');
  if (['stale', 'page-plan-changed', 'project-moved'].includes(status)) fail(`输入回执状态为 ${status}；请重新准备并输出当前页面。下一步：${prepareNext}`);
  if (!['complete', 'incomplete'].includes(status)) fail(`输入回执只有元数据或格式无效。下一步：${prepareNext}`);
  const sourceMap = new Map(bundle.deliverySources.map(source => [source.id, source]));
  let pageIndex;
  if (pageId !== null) {
    pageIndex = bundle.pages.findIndex(page => page.id === pageId);
    if (pageIndex < 0) fail(`当前输入中没有页面 ID ${pageId}。请重新运行 input-prepare 并使用当前回执中的稳定页 ID。`);
  } else {
    pageIndex = bundle.pages.findIndex(page => !validInputPageRecord(state.deliveredPages.find(item => item.id === page.id), page, sourceMap));
    if (pageIndex < 0) {
      console.error(`当前回执：catalog-delivered（${state.deliveryReceipt.pageCount} 页）。仅记录页面字节交付，不代表理解、当前上下文仍持有或质量判断。截断时可按稳定页 ID 回读。`);
      process.exit(0);
    }
  }
  const page = bundle.pages[pageIndex];
  writeStdoutFully(page.text);
  const deliveredAt = new Date().toISOString();
  recordInputPageOutput(state, page, deliveredAt);
  state.pageReplays ||= [];
  if (pageId !== null) state.pageReplays.push({ pageId: page.id, pageSha256: page.sha256, wrapperSha256, characters: page.characters, bytes: page.bytes, replayedAt: deliveredAt });
  refreshInputDelivery(project, state, bundle);
  writeInputState(project, state);
  if (pageId !== null) console.error(`\n已按页 ID 重放 ${page.id}（${page.characters} 字 / ${page.bytes} 字节，SHA-256 ${page.sha256}）。页面回执绑定 wrapper ${wrapperSha256.slice(0, 12)}；只证明输出，不证明理解。`);
  else if (state.status === 'catalog-delivered') console.error(`\n目录回执：catalog-delivered（${bundle.pages.length} 页；本轮实际输出 ${state.deliveryReceipt.emittedPageCount} 页、同源历史复用 ${state.deliveryReceipt.sourceReusedPageCount} 页）。历史输出不证明当前上下文仍持有或理解。`);
  else console.error(`\n已实际输出页 ${page.id}（${pageIndex + 1}/${bundle.pages.length}）。下一步：${inputCommand('input-page', target)}`);
  process.exit(0);
}
if (command === 'input-candidate') {
  const target = args[0];
  let id = null, next = false, pageId = null;
  for (let index = 1; index < args.length; index++) {
    if (args[index] === '--id' && args[index + 1]) id = args[++index];
    else if (args[index].startsWith('--id=')) id = args[index].slice('--id='.length);
    else if (args[index] === '--page-id' && args[index + 1]) pageId = args[++index];
    else if (args[index].startsWith('--page-id=')) pageId = args[index].slice('--page-id='.length);
    else if (args[index] === '--next') next = true;
    else fail(`不支持的 input-candidate 参数：${args[index]}`);
  }
  if (!target || !id) fail('input-candidate 需要 <project> --id <resource-id>；首次调用输出第 1 页，后续调用加 --next。宿主截断时可从当前资源回执取 page-id 并传 --page-id <page-id> 重放。');
  if (pageId !== null && next) fail('--page-id 精确重放不能与 --next 同用；请从当前候选回执取目标 page-id。');
  const project = assertWorkDisk(target, '候选全文项目');
  const state = readInputState(project);
  if (!state) fail(`还没有当前目录回执。下一步：${inputCommand('input-map', target)}`);
  const bundle = makeInputBundle(state.currentSpec, state.pageCharacterLimit || inputPageLimit);
  const prepareNext = inputCommand('input-map', target, '--resume');
  if (validateInputState(project, state, bundle) !== 'complete') fail(`当前全源 L0 尚未完整实际输出或已变化。下一步：${prepareNext}。`);
  const entry = readResourceEntry(id);
  const fulltext = readResourceFulltext(id, 'L2');
  const candidate = makeCandidateBundle({ entry, fulltext }, bundle.pageLimit);
  const previous = state.candidates?.[id];
  if (pageId !== null) {
    const page = candidate.pages.find(item => item.id === pageId);
    if (!page) fail(`当前候选 ${id} 没有 page-id ${pageId}。请从当前候选回执复制精确 page-id；正文或分页变化后旧 ID 失效。`);
    const priorPage = previous?.pageRecords?.find(item => item.id === pageId);
    if (!previous || previous.fingerprint !== candidate.fingerprint || priorPage?.sha256 !== page.sha256) {
      fail(`候选 ${id} 的 page-id ${pageId} 不属于当前全文/分页版本。先运行 input-candidate <project> --id ${id} 输出当前候选页，再按当前回执重放。`);
    }
  }
  let record = previous && candidateReceiptStatus(previous, candidate) !== 'stale' && candidateReceiptStatus(previous, candidate) !== 'page-plan-changed'
    ? previous
    : { format: 'laohu.motion.style-candidate-delivery/1', id, fingerprint: candidate.fingerprint, sourceSet: candidate.sourceSet,
      sourcePath: candidate.sourcePath, sourceSha256: candidate.sourceSha256, producerMarkdown: candidate.producerMarkdown,
      availability: candidate.availability, limitations: candidate.limitations, fullTextPath: candidate.fullTextPath,
      ...(candidate.sourceRevision ? { sourceRevision: candidate.sourceRevision } : {}),
      fullTextSha256: candidate.fullTextSha256, fullTextCharacters: candidate.fullTextCharacters, fullTextBytes: candidate.fullTextBytes,
      pageRecords: candidate.pages.map(({ id: pageId, sha256: digest, characters, bytes }) => ({ id: pageId, sha256: digest, characters, bytes })),
      deliveredPages: [], candidateReplays: [], status: 'pending', deliveryReceipt: null };
  if (pageId !== null) {
    const page = candidate.pages.find(item => item.id === pageId);
    writeStdoutFully(page.text);
    record.candidateReplays ||= [];
    record.candidateReplays.push({ pageId: page.id, candidateFingerprint: candidate.fingerprint, fullTextSha256: candidate.fullTextSha256,
      pageSha256: page.sha256, characters: page.characters, bytes: page.bytes, wrapperSha256, replayedAt: new Date().toISOString() });
    state.candidates ||= {};
    state.candidates[id] = record;
    writeInputState(project, state);
    console.error(`\n已重放候选 ${id} 正文页 ${page.id}（${page.characters} 字 / ${page.bytes} 字节，SHA-256 ${page.sha256}）。当前全文回执状态保持 ${record.status}；重放只证明本次输出，不证明理解。`);
    process.exit(0);
  }
  if (candidateReceiptStatus(record, candidate) === 'complete') {
    console.error(`候选 ${id} 的当前 L2 全文已输出（${candidate.fullTextCharacters} 字 / ${candidate.fullTextBytes} 字节，SHA-256 ${candidate.fullTextSha256}）。回执只证明字节交付。`);
    process.exit(0);
  }
  if (next && record.status === 'pending' && record.deliveredPages.length === 0) fail('候选全文尚未输出第一页；首次调用请省略 --next。');
  if (!next && record.deliveredPages.length > 0) fail('候选全文已开始分页；继续时请加 --next。');
  const pageIndex = record.deliveredPages.length;
  const page = candidate.pages[pageIndex];
  if (!page) fail(`候选全文页状态无效：${id}。`);
  writeStdoutFully(page.text);
  record.deliveredPages.push({ id: page.id, sha256: page.sha256, characters: page.characters, bytes: page.bytes, deliveredAt: new Date().toISOString() });
  if (record.deliveredPages.length === candidate.pages.length) {
    const refs = record.deliveredPages.map(({ id: pageId, sha256: digest }) => ({ id: pageId, sha256: digest }));
    record.status = 'candidate-delivered';
    record.deliveryReceipt = { type: 'candidate-delivered', candidateFingerprint: candidate.fingerprint, fullTextSha256: candidate.fullTextSha256,
      pageCount: candidate.pages.length, pagesSha256: sha256(Buffer.from(JSON.stringify(refs))), characters: record.deliveredPages.reduce((sum, item) => sum + item.characters, 0),
      bytes: record.deliveredPages.reduce((sum, item) => sum + item.bytes, 0), completedAt: new Date().toISOString() };
  }
  state.candidates ||= {};
  state.candidates[id] = record;
  writeInputState(project, state);
  if (record.status === 'candidate-delivered') console.error(`\n资源 ${id} 的完整 L2 正文已实际输出：${candidate.fullTextCharacters} 字 / ${candidate.fullTextBytes} 字节；输出页 ${record.deliveryReceipt.characters} 字 / ${record.deliveryReceipt.bytes} 字节。回执只证明字节交付。`);
  else console.error(`\n已实际输出资源 ${id} 的 L2 正文第 ${pageIndex + 1}/${candidate.pages.length} 页。下一步加 --next 继续。`);
  process.exit(0);
}
const env = runtimeEnv();

if (command === 'doctor') {
  if (args.length > 1 || args.length === 1 && args[0] !== '--webgl-smoke') fail('doctor accepts only --webgl-smoke');
  printAnimatedWebpSupport();
  const systemReady = diagnoseBaseEnvironment();
  const dependencyProblems = pinnedDependencyProblems();
  console.log(`[ok] work-root cache and TMP paths resolve to the same mounted volume (${workDevice})`);
  if (dependencyProblems.length) {
    console.log(`[not ready] ${dependencyProblems.join('; ')}`);
    console.log(`Next${systemReady ? '' : ', after system prerequisites pass,'}: ${setupCommand()}`);
    process.exit(systemReady ? 2 : 1);
  }
  console.log('[ok] pinned runtime dependencies are installed and version-checked');
  const filters = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { env, encoding: 'utf8' }).stdout || '';
  if (filters) for (const filter of ['tmix', 'loudnorm', 'ebur128', 'showspectrumpic', 'freezedetect', 'chromakey', 'drawtext']) {
    if (!filters.includes(` ${filter} `)) console.log(`[warn] ffmpeg lacks ${filter}`);
  }
  const librosa = spawnSync('python3', ['-c', 'import librosa'], { env, stdio: 'ignore' }).status === 0;
  console.log(`[${librosa ? 'ok' : 'optional'}] librosa (additional beat tracking)`);
  const smoke = args[0] === '--webgl-smoke';
  let three;
  try { three = showreelThreeVendor(runtimeCacheRoot, assertWorkDisk); }
  catch (error) { console.log(`[unavailable] Three.js extension: ${error.message}`); }
  if (three) console.log(`[ok] Three.js ${three.version} (${three.license}) · local browser bundle and addons`);
  else console.log(`[${smoke ? 'missing' : 'optional'}] Three.js extension · ${setupCommand()}`);
  const result = probeShowreelBrowser(env, { fresh: true, threeRoot: smoke && three ? three.directory : null });
  const { selected } = result;
  for (const attempt of result.attempts) {
    if (attempt === selected) continue;
    console.log(`[info] ANGLE ${attempt.angle} · ${attempt.shader?.reason || attempt.error || webglMode(attempt.shader?.renderer)}`);
  }
  if (selected.browser) console.log(`[ok] headless browser ${selected.browser} · ANGLE ${selected.angle}${env.SHOWREEL_ANGLE ? ' (explicit)' : ''}`);
  else console.log(`[missing] headless browser · ANGLE ${selected.angle} · ${selected.error} · ${setupCommand()}`);
  if (selected.shader?.ok) {
    console.log(`[ok] WebGL2: ${webglMode(selected.shader.renderer)} · shader 16×16 center ${selected.shader.center.join(',')}, background ${selected.shader.corner.join(',')}`);
  } else console.log(`[unavailable] WebGL2: ${selected.shader?.reason || 'browser unavailable'}; 2D rendering can use a working headless browser.`);
  if (smoke && selected.three) {
    const pixels = selected.three;
    console.log(`[${pixels.ok ? 'ok' : 'unavailable'}] Three.js WebGL2 pixels · ${pixels.reason || `r${pixels.revision} · ${pixels.coloredPixels} colored geometry pixels · ${pixels.blockedRequests} blocked external requests`}`);
  }
  process.exit(systemReady && selected.browser && (!smoke || selected.shader?.ok && selected.three?.ok) ? 0 : 1);
}
if (command === 'setup') {
  if (args.length > 1 || args.length === 1 && args[0] !== '--without-three') fail('setup accepts only --without-three');
  ensurePinnedDependencies(env);
  const scripts = getExecutionRuntime().scripts;
  const baseStatus = spawn('sh', [path.join(scripts, 'setup.sh'), runtimeDepsRoot], {
    env: { ...env, SHOWREEL_ANGLE: env.SHOWREEL_ANGLE || 'default' },
  });
  if (baseStatus !== 0 || args[0] === '--without-three') process.exit(baseStatus);
  try {
    const three = showreelThreeVendor(runtimeCacheRoot, assertWorkDisk, { install: true, env });
    console.log(`[ok] Three.js ${three.version} (${three.license}) · ready for offline scaffold --with-three`);
  } catch (error) {
    fail(`The base runtime is ready; Three.js setup failed: ${error.message}`, 1);
  }
  process.exit(0);
}
if (command === 'test') {
  requirePinnedDependencies();
  runExecutionCopy(runtime => ({ command: 'npm', args: ['test', ...args], cwd: runtime.scripts, env: bindShowreelBrowser(env) }));
}
if (command === 'scaffold') {
  const target = args[0];
  if (!target) fail('scaffold needs a project path');
  let audio;
  let withThree = false;
  let explore = false;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--audio' && args[i + 1]) audio = args[++i];
    else if (args[i].startsWith('--audio=')) audio = args[i].slice('--audio='.length);
    else if (args[i] === '--with-three') withThree = true;
    else if (args[i] === '--phase' || args[i].startsWith('--phase=')) {
      const phase = args[i] === '--phase' ? args[++i] : args[i].slice('--phase='.length);
      if (explore || phase !== 'explore') fail('scaffold 的可选阶段是 --phase explore；直接按原完整 Brief 启动时省略。');
      explore = true;
    }
    else fail(`unsupported scaffold option: ${args[i]}`);
  }
  if (!audio) fail('scaffold requires an explicit --audio choice; ordinary production uses file or none');
  if (!['file', 'none', 'synth', 'tone', 'layer'].includes(audio)) fail(`--audio must be file | none | synth | tone | layer (got ${audio})`);
  const project = assertWorkDisk(target, 'scaffold target');
  if (hasExistingRenderer(project)) fail('scaffold 只创建新工程，不能在已有渲染工程中运行；完整重做可准备目录但继续使用当前工程入口。');
  requireInputDelivery(project, target, { explore });
  const frameSource = styleframeSource(project);
  prepareProjectBriefTextInputs(project, explore);
  if (withThree) {
    if (fs.lstatSync(path.join(project, 'index.html'), {throwIfNoEntry: false})) fail('scaffold preserves the existing index.html');
    try {
      const three = showreelThreeVendor(runtimeCacheRoot, assertWorkDisk);
      if (!three) fail(`Three.js 离线依赖尚未准备。先运行 ${setupCommand()}，完成后可断网 scaffold --with-three。`);
      mountShowreelThree(project, three, assertWorkDisk);
    } catch (error) { fail(`项目 Three.js 依赖未挂载：${error.message}`); }
  }
  const result = spawnSync('sh', [path.join(runtimeScripts, 'scaffold.sh'), project, '--audio', audio], { env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) fail(`脚手架启动失败：${result.error.message}`, 1);
  if (result.status !== 0) fail(`本地工程脚手架未完成，保留项目现状供检查。原始提示：\n${result.stderr || result.stdout || '没有返回详细错误。'}`, result.status ?? 1);
  assertWorkDisk(project, 'scaffold project');
  assertWorkDisk(path.join(project, 'out'), 'render output');
  updateReceipt(project, receipt => {
    receipt.productionUnitsRequired = !explore;
    receipt.directionFingerprintVersion = 3;
    if (explore) receipt.projectPhase = 'explore';
  });
  const assetDir = path.join(project,'assets');
  fs.mkdirSync(assetDir,{recursive:true});
  const helper = path.join(assetDir,'media-layers.mjs');
  if(!fs.existsSync(helper)) fs.copyFileSync(path.join(skillRoot,'templates/runtime/openmotion-studio/media-layers.mjs'),helper,fs.constants.COPYFILE_EXCL);
  const cutFile=path.join(assetDir,'clip-state.json');
  if(!fs.existsSync(cutFile)) fs.writeFileSync(cutFile,JSON.stringify({version:1,edits:{},history:[],serial:0})+'\n',{flag:'wx'});
  const index=path.join(project,'index.html');
  const originalHTML=fs.readFileSync(index,'utf8');
  let html=withThree ? withShowreelThreeImportMap(originalHTML) : originalHTML;
  if(!html.includes('src="./assets/media-layers.mjs"')) html=html.replace(/<\/body>/i,'<script type="module" src="./assets/media-layers.mjs"></script>\n</body>');
  if(html!==originalHTML) fs.writeFileSync(index,html);
  ensureChapterWorkbenchLink(project);
  const spec = managedReceipt(project)?.currentSpec;
  const displayTarget = projectReference(project);
  const wrapper = fileURLToPath(import.meta.url);
  const audioLabel = { file: '使用已准备的成品音频', none: '无音频', synth: '使用已授权的生成配乐', tone: '使用已授权的合成音频', layer: '使用已授权的分层音频' }[audio];
  console.log(`工程脚手架已创建：${displayTarget}${spec ? `（本轮规格 ${spec.size} / ${spec.fps} fps）` : ''}。`);
  console.log(`音频选择：${audioLabel}。`);
  if (frameSource === 'reference' || frameSource === 'mixed') {
    console.log('将本轮选定的实际 PNG 按来源和事件发布：progress <project> --stage style --preview <image.png> --frame-source <reference|cover|code> --frame-event <事件ID> --frame-at <秒数>');
  } else if (frameSource === 'cover') {
    console.log(`Cover 设计目标图：node ${shellQuote(wrapper)} progress ${shellQuote(displayTarget)} --stage style --preview <本轮实际.PNG> --frame-source cover --frame-event <事件ID> --frame-at <秒数>`);
  } else {
    console.log(`代码方向探索帧：node ${shellQuote(wrapper)} render ${shellQuote(displayTarget)} --text-direction <本轮所选方向名> --still <秒数>`);
  }
  console.log(`同一项目工作台：node ${shellQuote(wrapper)} editor ${shellQuote(displayTarget)}；服务启动后请实际打开浏览器核验，服务就绪不代表页面已打开。`);
  if (explore) console.log(`方向探索：发布至少两张代表帧和一段 3–6 秒真实小样。收到方向确认、补齐完整 Brief 与成片时钟并审稿后，运行 promote-production ${shellQuote(displayTarget)} --audit <审稿记录路径>。`);
  else console.log('正式制作须先等待用户确认当前关键帧；最终预览与正式导出还要分别确认。');
  process.exit(0);
}
if (command === 'promote-production') {
  const target = args[0];
  if (!target) fail('promote-production 需要 <project> --audit <项目内审稿记录>。');
  const options = parseLocalOptions(args.slice(1), new Set(['--audit']), command);
  await promoteProduction(assertWorkDisk(target, '晋级制作工程'), options['--audit']);
  process.exit(0);
}
if (command === 'build') {
  const target = args[0];
  if (!target) fail('build needs a scaffolded project path');
  const project = assertWorkDisk(target, 'build project');
  requireProductionPhase(project);
  assertWorkDisk(path.join(project, 'out'), 'render output');
  await productionUnitView(project, true, managedReceipt(project)?.productionUnitsRequired === true);
  const approval = requireCurrentExportApproval(project);
  const managed = managedReceipt(project);
  const audioEnv = buildReviewAudioEnv(project, approval.finalPreview.reviewedAudio, env);
  const textDirection = optionValue(args.slice(1), '--text-direction');
  if (!textDirection) fail('正式构建需指定 --text-direction <当前已确认方向名>，并检查该方向所有必显登记文字。');
  requirePhaseDirection(project, textDirection);
  const cleanBuildArgs = stripValueOptions(args.slice(1), new Set(['--evidence-text', '--scope', '--text-direction']));
  const businessQuery = managed ? formalRenderBusinessQuery(cleanBuildArgs) : '';
  if (managed) requireManagedBuildSpecConsumer(project, approval.spec);
  const buildSpec = resolveProjectSpec(project, optionValue(args.slice(1), '--size'), managed || readInputState(project, true), optionValue(args.slice(1), '--fps'));
  const report = await runBriefTextContract(project, {direction: textDirection, businessQuery, start: 0, fps: buildSpec.fps || 30,
    size: buildSpec.size || '1920x1080', exhaustiveFrames, useDefaultDirection: !managed});
  const buildArgs = managed ? replaceFormalRenderQuery(cleanBuildArgs, formalRenderQuery(businessQuery, textDirection, report)) : cleanBuildArgs;
  requirePinnedDependencies();
  runExecutionCopy(runtime => ({
    command: 'sh',
    args: [path.join(project, 'build.sh'), ...buildArgs],
    env: { ...bindShowreelBrowser(env), ...audioEnv, SKILL: runtime.root, ...(managed ? { SIZE: approval.spec.size, FPS: String(approval.spec.fps) } : {}) },
  }));
}
if (command === 'audio-scene') {
  const target = args[0];
  if (!target) fail('audio-scene needs a scaffolded project path');
  const project = assertWorkDisk(target, 'audio-scene project');
  const out = optionValue(args.slice(1), '--out');
  const output = out ? path.resolve(project, out) : path.join(project, 'audio', 'audio-event-scene.json');
  assertWorkDisk(output, 'audio-scene output');
  run(process.execPath, [path.join(skillRoot, 'scripts', 'showreel-audio-scene.mjs'), project, '--out', output], { env });
}
if (command === 'audio-plan') {
  checkAudioPlanTargets(args);
  run(process.execPath, [path.join(skillRoot, 'scripts', 'audio.mjs'), ...args], { env });
}
const scriptNames = {
  render: 'render.mjs', editor: 'editor.mjs', preview: 'preview.mjs', inspect: 'inspect.mjs',
  audio: 'audio.mjs', narration: 'narration.mjs', progress: 'progress.mjs', 'build-long': 'build-long.mjs',
};
checkWritableTargets(command, args, env);
if (['editor', 'preview'].includes(command) && args[0]) {
  const target = assertWorkDisk(args[0], '场景预览项目');
  const file = fs.statSync(target, {throwIfNoEntry: false});
  if (file) prepareProjectBriefTextInputs(file.isDirectory() ? target : path.dirname(target));
}
if (command === 'editor' && !args.includes('--legacy')) {
  if (!args[0]) fail('editor 需要 <project>。');
  const project = assertWorkDisk(args[0], '工作台项目');
  assertWorkDisk(path.join(project, 'studio', 'openmotion'), 'OpenMotion 编辑副本');
  run(process.execPath, [path.join(skillRoot, 'templates', 'runtime', 'openmotion-studio', 'server.mjs'),
    project, ...args.slice(1).filter(item => item !== '--progress')], { env });
}
requirePinnedDependencies();
if (command === 'audio' && args[0] === 'build' && /\.tone\.m?js$/.test(args[1] || '')) {
  runExecutionCopy(runtime => ({ command: process.execPath, args: [path.join(runtime.scripts, 'audio.mjs'), ...args], env }));
}
const scripts = ['render', 'probe', 'build-long', 'editor'].includes(command)
  ? getExecutionRuntime().scripts : path.join(runtimeScriptRoot(), 'scripts');
if (command === 'progress') {
  if (!args[0]) fail('progress 需要 <project> 和阶段参数。');
  const argv = args.slice(1), stage = optionValue(argv,'--stage');
  const item = stage === 'scenes' && optionValue(argv,'--publish') ? optionValue(argv,'--shot')
    : stage === 'style' && optionValue(argv,'--preview') ? optionValue(argv,'--frame-event') : null;
  if (item) {
    const project = assertWorkDisk(args[0],'制作进度项目');
    const {startTask,endTask,readTasks} = await import('../templates/runtime/production-workbench/tasks.mjs');
    const category = stage === 'scenes' ? 'motion' : 'cover';
    if (!readTasks(project).some(t=>t.stage===category && t.item===item && t.status==='running')) {
      const token = startTask(project,category,item,optionValue(argv,'--name') || item,process.pid);
      process.once('exit',code=>endTask(project,token,code===0 ? 'finish' : 'stop'));
    }
  }
  await handleProgress(args[0], argv, scripts, env);
}
if (command === 'probe') {
  if (!args[0]) fail('probe 需要 <project>、明确镜头选区和目的。');
  const project = assertWorkDisk(args[0], '动态小样项目');
  if (managedReceipt(project) && !dynamicProbeDesignFingerprint(project)) fail('当前 brief、规格或已选候选尚不能绑定动态小样；先完成本轮设计与候选全文交付。');
  await runDynamicProbe(args[0], args.slice(1), scripts, env);
}
if (command === 'render') {
  if (!args[0]) fail('render 需要 <project>。');
  const project = assertWorkDisk(args[0], '渲染项目');
  const originalArgs = args.slice(1);
  const textDirection = optionValue(originalArgs, '--text-direction');
  if (!textDirection) fail('渲染与方向探索帧需指定 --text-direction <本轮所选方向名>，先绑定 Brief 精确字项。');
  const selectedDirection = textDirection.trim();
  requirePhaseDirection(project, selectedDirection);
  const businessQuery = formalRenderBusinessQuery(originalArgs);
  let renderArgs = stripValueOptions(originalArgs, new Set(['--text-direction', '--q']));
  const exploring = hasStaticExplorationOptions(renderArgs);
  const formalApproval = exploring ? null : prepareFormalRender(project, renderArgs);
  const reviewed = formalApproval?.finalPreview.reviewedAudio;
  if (reviewed) {
    const audio = optionValue(renderArgs, '--audio');
    const approvalEnv = buildReviewAudioEnv(project, reviewed, {AUDIO_FILE: audio ? path.resolve(workRoot, audio) : undefined, ...(audio ? {AUDIO:'file'} : {})});
    if (approvalEnv.AUDIO_FILE) renderArgs = replaceValueOption(renderArgs, '--audio', path.resolve(project, approvalEnv.AUDIO_FILE));
  }
  const receipt = managedReceipt(project);
  if (receipt) {
    const spec = resolveProjectSpec(project, optionValue(renderArgs, '--size'), receipt, optionValue(renderArgs, '--fps'));
    renderArgs = replaceValueOption(replaceValueOption(renderArgs, '--size', spec.size), '--fps', String(spec.fps));
  }
  const fps = Number(optionValue(renderArgs, '--fps') || receipt?.currentSpec?.fps || 30);
  const base = {direction: selectedDirection, businessQuery, fps, exhaustiveFrames,
    size: optionValue(renderArgs, '--size') || receipt?.currentSpec?.size || '1920x1080'};
  const start = optionValue(renderArgs, '--start'), duration = optionValue(renderArgs, '--duration');
  const checks = stillTextChecks(renderArgs, businessQuery) ?? [{start: Number(start ?? 0), duration: duration === null ? undefined : Number(duration)}];
  let contractReport;
  for (const check of checks) contractReport = await runBriefTextContract(project, {...base, ...check});
  renderArgs = replaceFormalRenderQuery(renderArgs, formalRenderQuery(businessQuery, selectedDirection, contractReport));
  if (exploring) renderStaticExploration(args[0], renderArgs, scripts, env, contractReport);
  run(process.execPath, [path.join(scripts, scriptNames.render), args[0], ...renderArgs], { env: bindShowreelBrowser(env) });
}
if (command === 'editor') {
  if (!args[0]) fail('editor 需要 <project>。');
  const project = assertWorkDisk(args[0], '工作台项目');
  assertWorkDisk(path.join(project, '.showreel-progress'), '工作台状态输出');
  let editorArgs = args.filter(item => item !== '--progress' && item !== '--legacy');
  const receipt = managedReceipt(project);
  if (receipt) {
    const spec = resolveProjectSpec(project, optionValue(editorArgs, '--size'), receipt, optionValue(editorArgs, '--fps'));
    editorArgs = replaceValueOption(replaceValueOption(editorArgs, '--size', spec.size), '--fps', String(spec.fps));
  }
  if (optionValue(editorArgs, '--port') !== null) fail('Showreel 旧工作台自动选择本机端口。固定端口请使用 OpenMotion Studio。');
  run(process.execPath, [path.join(scripts, scriptNames.editor), ...editorArgs, '--progress'], { env: bindShowreelBrowser(env) });
}
if (command === 'build-long') {
  if (!args[0]) fail('build-long 需要 longform manifest。');
  const config = await prepareBuildLong(args[0], args.slice(1));
  const browserEnv = bindShowreelBrowser(env);
  const forwarded = stripValueOptions(args.slice(1), new Set(['--text-direction']));
  if (!config.adapted) run(process.execPath, [path.join(scripts, scriptNames[command]), config.manifestPath, ...forwarded], { env: browserEnv });
  try { await runAdaptedBuildLong(config, forwarded, scripts, browserEnv); }
  catch (error) { console.error(`chapter build failed: ${error.message}`); process.exit(1); }
  process.exit(0);
}
run(process.execPath, [path.join(scripts, scriptNames[command]), ...args], { env });
