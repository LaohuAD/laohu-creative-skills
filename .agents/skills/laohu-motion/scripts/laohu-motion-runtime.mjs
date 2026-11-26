import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const defaultSkillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function packageJsonPath(nodeModules, name) {
  return path.join(nodeModules, ...name.split('/'), 'package.json');
}

export function managedMotionRuntimeRoot({skillRoot = defaultSkillRoot, workRoot = repoRoot} = {}) {
  const runtimeSource = path.join(path.resolve(skillRoot), 'templates', 'runtime', 'laohu-remotion');
  const manifest = JSON.parse(fs.readFileSync(path.join(runtimeSource, 'package.json'), 'utf8'));
  const lockBytes = fs.readFileSync(path.join(runtimeSource, 'package-lock.json'));
  const version = manifest.dependencies?.remotion || 'unversioned';
  const lockHash = crypto.createHash('sha256').update(lockBytes).digest('hex').slice(0, 16);
  return path.join(path.resolve(workRoot), '.cache', 'tmp', 'laohu-motion', 'remotion-runtime', `${version}-${lockHash}`);
}

export function managedMotionBrowserCacheRoot({workRoot = repoRoot, runtimeRoot} = {}) {
  const runtime = path.resolve(runtimeRoot || managedMotionRuntimeRoot({workRoot}));
  return path.join(path.resolve(workRoot), '.cache', 'tmp', 'laohu-motion', 'remotion-browser', path.basename(runtime));
}

export function managedMotionBrowserExecutableCandidates({workRoot = repoRoot, runtimeRoot, platform = process.platform, arch = process.arch} = {}) {
  const platformName = platform === 'darwin' ? (arch === 'arm64' ? 'mac-arm64' : 'mac-x64')
    : platform === 'linux' ? (arch === 'arm64' ? 'linux-arm64' : 'linux64')
    : platform === 'win32' ? 'win64' : null;
  if (!platformName) return [];
  const root = path.join(managedMotionBrowserCacheRoot({workRoot, runtimeRoot}), 'node_modules', '.remotion',
    'chrome-headless-shell', platformName, `chrome-headless-shell-${platformName}`);
  const names = platform === 'win32' ? ['headless_shell.exe', 'chrome-headless-shell.exe']
    : ['headless_shell', 'chrome-headless-shell'];
  return names.map((name) => path.join(root, name));
}

export async function ensureManagedMotionBrowser({workRoot = repoRoot, runtimeRoot, browserExecutable} = {}) {
  if (browserExecutable) return {path:path.resolve(browserExecutable), downloaded:false, cacheRoot:null};
  const work = path.resolve(workRoot);
  const runtime = path.resolve(runtimeRoot || managedMotionRuntimeRoot({workRoot:work}));
  const cacheRoot = managedMotionBrowserCacheRoot({workRoot:work, runtimeRoot:runtime});
  const managedCandidates = managedMotionBrowserExecutableCandidates({workRoot:work, runtimeRoot:runtime});
  const cachedBeforeSetup = managedCandidates.find((candidate) => {
    try { const stat = fs.statSync(candidate); return stat.isFile() && Boolean(stat.mode & 0o111); }
    catch { return false; }
  });
  const anchorManifest = path.join(cacheRoot, 'package.json');
  const manifestBytes = Buffer.from('{"name":"laohu-motion-browser-cache","private":true,"version":"1.0.0"}\n');
  await fs.promises.mkdir(cacheRoot, {recursive:true});
  const existingManifest = await fs.promises.readFile(anchorManifest).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (existingManifest && !existingManifest.equals(manifestBytes)) throw new Error(`Refusing to replace an unexpected managed browser-cache anchor: ${anchorManifest}`);
  if (!existingManifest) await fs.promises.writeFile(anchorManifest, manifestBytes, {flag:'wx'});
  const runtimeRequire = createRequire(path.join(runtime, 'package.json'));
  const {ensureBrowser} = runtimeRequire('@remotion/renderer');
  if (typeof ensureBrowser !== 'function') throw new Error('The pinned Remotion renderer does not expose ensureBrowser');
  const tmpDir = path.join(work, '.cache', 'tmp', 'laohu-motion', 'browser-setup');
  const cacheDir = path.join(work, '.cache', 'tmp', 'laohu-motion', 'browser-cache');
  await Promise.all([fs.promises.mkdir(tmpDir, {recursive:true}), fs.promises.mkdir(cacheDir, {recursive:true})]);
  const envKeys = ['TMPDIR','TMP','TEMP','XDG_CACHE_HOME','REMOTION_CACHE_DIR'];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const previousCwd = process.cwd();
  let result;
  try {
    process.chdir(cacheRoot);
    process.env.TMPDIR = tmpDir;
    process.env.TMP = tmpDir;
    process.env.TEMP = tmpDir;
    process.env.XDG_CACHE_HOME = cacheDir;
    process.env.REMOTION_CACHE_DIR = cacheDir;
    result = await ensureBrowser({logLevel:'error'});
  } finally {
    process.chdir(previousCwd);
    for (const key of envKeys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
  const browserPath = path.resolve(result?.path || '');
  const stat = await fs.promises.stat(browserPath).catch(() => null);
  if (!stat?.isFile() || !(stat.mode & 0o111)) throw new Error(`Managed Remotion browser is not executable: ${browserPath}`);
  const workStat = await fs.promises.stat(work);
  const cacheStat = await fs.promises.stat(cacheRoot);
  if (workStat.dev !== cacheStat.dev) throw new Error(`Managed browser cache is on a different filesystem from workRoot: ${cacheRoot}`);
  return {path:browserPath, downloaded:!cachedBeforeSetup && managedCandidates.includes(browserPath), cacheRoot};
}

function projectNodeModulesCandidates({projectRoot, skillRoot, workRoot, runtimeRoot, env}) {
  const candidates = [];
  const add = (value, source) => {
    if (!value) return;
    const absolute = path.resolve(value);
    candidates.push({path:absolute, source});
  };

  add(env.MOTION_RUNTIME_NODE_MODULES, 'MOTION_RUNTIME_NODE_MODULES');
  for (const entry of String(env.NODE_PATH || '').split(path.delimiter)) add(entry, 'NODE_PATH');
  add(path.join(workRoot, 'node_modules'), 'work-project-node_modules');
  if (projectRoot !== workRoot) add(path.join(projectRoot, 'node_modules'), 'skill-project-node_modules');
  add(path.join(skillRoot, 'templates', 'runtime', 'laohu-remotion', 'node_modules'), 'canonical-skill-runtime');
  add(path.join(runtimeRoot, 'node_modules'), 'project-runtime-cache');
  // Historical caches remain optional compatibility candidates. New setup and doctor
  // flows use the canonical project-runtime-cache path above.
  for (const relative of [
    '.cache/tmp/laohu-motion/remotion-runtime/node_modules',
    '.cache/tmp/video-shotcraft/motion-renderer-runtime/node_modules',
    '.cache/tmp/video-shotcraft/remotion-runtime/node_modules',
  ]) add(path.join(workRoot, relative), 'legacy-project-runtime-cache');
  const seen = new Set();
  return candidates.filter((row) => {
    if (seen.has(row.path)) return false;
    seen.add(row.path);
    return true;
  });
}

export function resolveMotionRuntime({packages = [], expectedVersions = {}, projectRoot = repoRoot, skillRoot = defaultSkillRoot, workRoot = projectRoot, runtimeRoot, env = process.env} = {}) {
  const root = path.resolve(projectRoot);
  const skill = path.resolve(skillRoot);
  const work = path.resolve(workRoot);
  const runtime = path.resolve(runtimeRoot || env.MOTION_RUNTIME_ROOT || managedMotionRuntimeRoot({skillRoot:skill,workRoot:work}));
  const required = [...new Set(packages)];
  const searched = projectNodeModulesCandidates({projectRoot:root, skillRoot:skill, workRoot:work, runtimeRoot:runtime, env});
  const failures = [];
  for (const candidate of searched) {
    let nodeModules;
    try {
      nodeModules = fs.realpathSync(candidate.path);
    } catch {
      continue;
    }
    const runtimeRoot = path.dirname(candidate.path);
    const packageRows = [];
    let complete = true;
    for (const name of required) {
      const packagePath = packageJsonPath(nodeModules, name);
      try {
        const realPackagePath = fs.realpathSync(packagePath);
        const metadata = JSON.parse(fs.readFileSync(realPackagePath, 'utf8'));
        if (metadata.name !== name) throw new Error(`package identity mismatch: expected ${name}, found ${metadata.name || '(missing name)'}`);
        const expected = expectedVersions[name];
        if (expected && metadata.version !== expected) throw new Error(`version mismatch: expected ${expected}, found ${metadata.version || '(missing version)'}`);
        packageRows.push({name, version: metadata.version, path: isWithin(root, realPackagePath) ? path.relative(root, realPackagePath) : `explicit/${name}/package.json`});
      } catch (error) {
        const message = error.code === 'ENOENT' ? 'missing' : error.message || 'unreadable';
        failures.push(`${candidate.source} (${isWithin(root, candidate.path) ? path.relative(root, candidate.path) : 'explicit path'}): ${name} ${message}`);
        complete = false;
        break;
      }
    }
    if (!complete) continue;
    const require = createRequire(path.join(runtimeRoot, 'package.json'));
    return {
      repoRoot: root,
      skillRoot: skill,
      workRoot: work,
      runtimeRoot,
      nodeModules,
      nodeModulesPath: isWithin(root, nodeModules) ? path.relative(root, nodeModules) : 'explicit-node-module-path',
      resolutionSource: candidate.source,
      packages: packageRows,
      require,
    };
  }
  const names = required.length ? required.join(', ') : 'a renderer runtime package';
  const candidateText = searched.map((item) => `${item.source}:${isWithin(work, item.path) ? path.relative(work, item.path) : isWithin(skill, item.path) ? path.relative(skill, item.path) : '(explicit path)'}`).join(', ') || '(no configured, project, or existing cache candidates)';
  const detail = failures.length ? `; checked: ${failures.join('; ')}` : '';
  throw new Error(`Required Motion runtime package(s) ${names} are not available from explicit configuration, project dependencies, or existing project runtime caches. No dependency was installed. Candidates: ${candidateText}${detail}`);
}

export function loadMotionPackage(name, options = {}) {
  const resolved = resolveMotionRuntime({...options, packages: [name]});
  return {...resolved, value: resolved.require(name)};
}

export const __test = {projectNodeModulesCandidates};
