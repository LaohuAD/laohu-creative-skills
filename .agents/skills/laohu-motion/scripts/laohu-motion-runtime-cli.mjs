#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolveMotionRuntime, managedMotionRuntimeRoot, managedMotionBrowserExecutableCandidates, ensureManagedMotionBrowser} from './laohu-motion-runtime.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, '..');
const defaultProjectRoot = path.resolve(defaultSkillRoot, '../../..');
const REMOTION_VERSION = '4.0.537';

function usage() {
  return [
    'Usage:',
    '  node scripts/laohu-motion-runtime-cli.mjs doctor [--skill-root <absolute> --work-root <absolute> --runtime-root <absolute>]',
    '  node scripts/laohu-motion-runtime-cli.mjs setup [--skill-root <absolute> --work-root <absolute> --runtime-root <absolute>]',
    '',
    'The canonical manifest and lock live in skillRoot/templates/runtime/laohu-remotion/.',
    'Dependencies install once in a workRoot/.cache runtime selected by Remotion version and canonical lock hash.',
    'Setup provisions the matching Remotion headless browser in the external workRoot cache when needed.',
    'Doctor probes the local browser and FFmpeg, then renders a pinned Canvas style frame.',
  ].join('\n');
}

function parse(argv) {
  const command = argv.shift();
  if (!['doctor', 'setup'].includes(command)) throw new Error(usage());
  const args = {command, json:false};
  for (let index=0; index<argv.length; index+=1) {
    const key=argv[index];
    if (key==='--json') { args.json=true; continue; }
    if (!['--skill-root','--work-root','--runtime-root','--browser','--ffmpeg'].includes(key)) throw new Error(`Unknown option ${key}\n${usage()}`);
    const value=argv[++index];
    if (!value || value.startsWith('--') || !path.isAbsolute(value)) throw new Error(`${key} must be an absolute path`);
    args[key.slice(2).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=path.resolve(value);
  }
  args.skillRoot ||= defaultSkillRoot;
  args.workRoot ||= process.env.WORK_ROOT ? path.resolve(process.env.WORK_ROOT) : defaultProjectRoot;
  args.runtimeRoot ||= process.env.MOTION_RUNTIME_ROOT ? path.resolve(process.env.MOTION_RUNTIME_ROOT) : managedMotionRuntimeRoot({skillRoot:args.skillRoot,workRoot:args.workRoot});
  if (!path.isAbsolute(args.skillRoot) || !path.isAbsolute(args.workRoot) || !path.isAbsolute(args.runtimeRoot)) throw new Error('skillRoot, workRoot, and runtimeRoot must be absolute');
  const skillPath=path.join(args.skillRoot,'templates','runtime','laohu-remotion');
  if (!path.isAbsolute(skillPath)) throw new Error('invalid skillRoot');
  const cacheRoot=path.join(args.workRoot,'.cache');
  const relative=path.relative(cacheRoot,args.runtimeRoot);
  if (relative==='..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('runtimeRoot must stay below workRoot/.cache so package installation and render caches remain on the project disk');
  return args;
}

function hash(bytes) {
  return createHash(bytes);
}

function createHash(bytes) {
  return import('node:crypto').then(({createHash:make})=>make('sha256').update(bytes).digest('hex'));
}

async function pathExists(target) {
  try { await fs.lstat(target); return true; }
  catch (error) { if (error.code==='ENOENT') return false; throw error; }
}

function findCommand(name) {
  const result=spawnSync('which',[name],{encoding:'utf8',stdio:'pipe'});
  return result.status===0?result.stdout.trim():null;
}

async function executable(candidate) {
  if(!candidate)return false;
  try { const stat=await fs.stat(candidate); return stat.isFile()&&Boolean(stat.mode&0o111); }
  catch { return false; }
}

async function resolveBrowser(args) {
  const candidates=[args.browser,process.env.MOTION_CHROME,process.env.CHROME_PATH,
    ...managedMotionBrowserExecutableCandidates({workRoot:args.workRoot,runtimeRoot:args.runtimeRoot}),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    findCommand('chromium'),findCommand('chromium-browser'),findCommand('google-chrome'),findCommand('google-chrome-stable')];
  for(const candidate of candidates)if(await executable(candidate))return path.resolve(candidate);
  return null;
}

async function resolveFfmpeg(args) {
  const candidates=[args.ffmpeg,process.env.MOTION_FFMPEG,findCommand('ffmpeg')];
  for(const candidate of candidates)if(await executable(candidate))return path.resolve(candidate);
  return null;
}

function probeVersion(executablePath,flag) {
  const result=spawnSync(executablePath,[flag],{encoding:'utf8',stdio:'pipe',timeout:15000});
  if(result.error||result.status!==0)throw new Error(result.error?.message||result.stderr||`${path.basename(executablePath)} returned ${result.status}`);
  return (result.stdout||result.stderr||'').split(/\r?\n/,1)[0].trim();
}

async function runDoctor(args) {
  const sourceRoot=path.join(args.skillRoot,'templates','runtime','laohu-remotion');
  const sourceManifest=path.join(sourceRoot,'package.json');
  const sourceLock=path.join(sourceRoot,'package-lock.json');
  const targetManifest=path.join(args.runtimeRoot,'package.json');
  const targetLock=path.join(args.runtimeRoot,'package-lock.json');
  const manifestBytes=await fs.readFile(sourceManifest);
  const lockBytes=await fs.readFile(sourceLock);
  const wantedManifestHash=await hash(manifestBytes), wantedLockHash=await hash(lockBytes);
  const issues=[];
  for (const [label,file,wanted] of [['runtime manifest',targetManifest,wantedManifestHash],['runtime lock',targetLock,wantedLockHash]]) {
    const bytes=await fs.readFile(file).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
    if (!bytes) issues.push(`${label} missing at ${file}`);
    else if (await hash(bytes)!==wanted) issues.push(`${label} differs from canonical skill ${path.relative(args.skillRoot,file)}`);
  }
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  const dependencies=manifest.dependencies||{};
  const expectedVersions={...dependencies};
  for (const name of ['remotion','@remotion/bundler','@remotion/renderer','@remotion/three','@remotion/paths']) {
    if (expectedVersions[name]!==REMOTION_VERSION) issues.push(`${name} must be pinned to ${REMOTION_VERSION}, found ${expectedVersions[name]||'(missing)'}`);
  }
  let resolved=null;
  if (issues.length===0) {
    try {
      resolved=resolveMotionRuntime({packages:Object.keys(expectedVersions),expectedVersions,projectRoot:args.skillRoot,skillRoot:args.skillRoot,workRoot:args.workRoot,runtimeRoot:args.runtimeRoot});
    } catch (error) { issues.push(error.message); }
  }
  let browser=null,ffmpeg=null,browserVersion=null,ffmpegVersion=null,renderSmoke=null;
  if(issues.length===0){
    browser=await resolveBrowser(args);
    ffmpeg=await resolveFfmpeg(args);
    if(!browser)issues.push('local Chrome/Chromium executable was not found; pass --browser or set CHROME_PATH/MOTION_CHROME');
    if(!ffmpeg)issues.push('FFmpeg executable was not found; pass --ffmpeg or set MOTION_FFMPEG');
  }
  if(issues.length===0){
    try{browserVersion=probeVersion(browser,'--version');}catch(error){issues.push(`browser version probe failed: ${error.message}`);}
    try{ffmpegVersion=probeVersion(ffmpeg,'-version');}catch(error){issues.push(`FFmpeg version probe failed: ${error.message}`);}
  }
  if(issues.length===0){
    const lockKey=`${REMOTION_VERSION}-${wantedLockHash.slice(0,16)}`;
    const evidenceDir=path.join(args.workRoot,'.cache','validation','motion-runtime-doctor',lockKey,`${Date.now()}-${process.pid}`);
    const output=path.join(evidenceDir,'canvas-style-smoke.png');
    const manifestPath=path.join(evidenceDir,'canvas-style-smoke.manifest.json');
    try{
      await fs.mkdir(evidenceDir,{recursive:true});
      const adapterUrl=pathToFileURL(path.join(args.skillRoot,'templates','adapters','video-shotcraft-remotion.mjs')).href;
      const {renderStyleCode}=await import(adapterUrl);
      await renderStyleCode({styleId:'A2',parentText:'Motion 运行时检查',outputPath:output,outputKind:'still',timeSec:.5,durationInFrames:90,workRoot:args.workRoot,runtimeRoot:args.runtimeRoot,browser,cacheDir:path.join(args.workRoot,'.cache','tmp','laohu-motion','doctor-render'),manifestPath});
      const imageBytes=await fs.readFile(output);
      if(imageBytes.length<100||imageBytes.toString('ascii',1,4)!=='PNG')throw new Error('rendered output is not a nonempty PNG');
      renderSmoke={status:'pass',styleId:'A2',output,manifestPath,bytes:imageBytes.length,sha256:await hash(imageBytes)};
    }catch(error){renderSmoke={status:'fail',error:error.stack||error.message};issues.push(`actual Remotion Canvas render smoke failed: ${error.message}`);}
  }
  const result={format:'laohu.motion-runtime-doctor/2',status:issues.length?'fail':'pass',skillRoot:args.skillRoot,workRoot:args.workRoot,runtimeRoot:args.runtimeRoot,canonicalManifestSha256:wantedManifestHash,canonicalLockSha256:wantedLockHash,expectedVersions,packages:resolved?.packages||[],resolutionSource:resolved?.resolutionSource||null,browser:{path:browser,version:browserVersion},ffmpeg:{path:ffmpeg,version:ffmpegVersion},renderSmoke,issues};
  return result;
}

async function setup(args) {
  const workStat=await fs.stat(args.workRoot).catch(error=>{throw new Error(`workRoot must already exist and be readable: ${args.workRoot} (${error.message})`)});
  if (!workStat.isDirectory()) throw new Error(`workRoot is not a directory: ${args.workRoot}`);
  const sourceRoot=path.join(args.skillRoot,'templates','runtime','laohu-remotion');
  const files=[['package.json',path.join(sourceRoot,'package.json')],['package-lock.json',path.join(sourceRoot,'package-lock.json')]];
  await fs.mkdir(args.runtimeRoot,{recursive:true});
  const runtimeStat=await fs.stat(args.runtimeRoot);
  if (runtimeStat.dev!==workStat.dev) throw new Error(`workRoot and runtimeRoot are on different filesystems: ${args.workRoot} / ${args.runtimeRoot}`);
  for (const [name,source] of files) {
    const target=path.join(args.runtimeRoot,name);
    const sourceBytes=await fs.readFile(source);
    const existing=await fs.readFile(target).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
    if (existing && await hash(existing)!==await hash(sourceBytes)) throw new Error(`refusing to replace an existing ${target} that differs from the canonical Motion runtime`);
    if (!existing) await fs.writeFile(target,sourceBytes,{flag:'wx'});
  }
  const nodeModules=path.join(args.runtimeRoot,'node_modules');
  if (await pathExists(nodeModules)) {
    const browserSetup=await ensureManagedBrowserForSetup(args);
    const diagnosis=await runDoctor(args);
    if (diagnosis.status==='pass') return {...diagnosis,setup:'already-installed',installPerformed:false,browserSetup};
    throw new Error(`node_modules already exists but doctor failed; refusing to let npm ci remove it. Choose an empty dedicated --runtime-root or repair it manually. ${JSON.stringify(diagnosis.issues)}`);
  }
  const tmpRoot=path.join(args.workRoot,'.cache','tmp','laohu-motion','setup-tmp');
  const npmCache=path.join(args.workRoot,'.cache','npm','laohu-motion');
  await fs.mkdir(tmpRoot,{recursive:true});
  await fs.mkdir(npmCache,{recursive:true});
  const child=spawnSync(process.env.NPM || 'npm',['ci','--no-audit','--no-fund'],{
    cwd:args.runtimeRoot,encoding:'utf8',stdio:'pipe',maxBuffer:16*1024*1024,
    env:{...process.env,TMPDIR:tmpRoot,TMP:tmpRoot,TEMP:tmpRoot,npm_config_cache:npmCache},
  });
  if (child.error || child.status!==0) throw new Error(`npm ci failed in ${args.runtimeRoot}: ${child.error?.message||child.stderr||child.stdout||child.status}`);
  const browserSetup=await ensureManagedBrowserForSetup(args);
  const diagnosis=await runDoctor(args);
  if (diagnosis.status!=='pass') throw new Error(`runtime setup completed but doctor failed: ${JSON.stringify(diagnosis.issues)}`);
  return {...diagnosis,setup:'installed',installPerformed:true,npmCache,tmpRoot,browserSetup};
}

async function ensureManagedBrowserForSetup(args) {
  const existing=await resolveBrowser(args);
  if (existing) return {path:existing,downloaded:false,cacheRoot:null};
  return ensureManagedMotionBrowser({workRoot:args.workRoot,runtimeRoot:args.runtimeRoot});
}

async function main() {
  const args=parse(process.argv.slice(2));
  const result=args.command==='setup'?await setup(args):await runDoctor(args);
  process.stdout.write(args.json?`${JSON.stringify(result)}\n`:`${JSON.stringify(result,null,2)}\n`);
  if (result.status==='fail') process.exitCode=1;
}

main().catch(error=>{process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;});
