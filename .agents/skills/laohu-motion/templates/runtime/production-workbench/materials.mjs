import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { localFile } from '../laohu-showreel/scripts/lib/editor-model.mjs';

export const inputFolder = '.showreel-progress/user-inputs';
export const mediaTypes = Object.freeze({
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.avif':'image/avif',
  '.mp4':'video/mp4', '.mov':'video/quicktime', '.webm':'video/webm', '.m4v':'video/mp4',
  '.mp3':'audio/mpeg', '.wav':'audio/wav', '.flac':'audio/flac', '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.aac':'audio/aac',
  '.txt':'text/plain; charset=utf-8', '.srt':'text/plain; charset=utf-8', '.md':'text/plain; charset=utf-8', '.vtt':'text/vtt; charset=utf-8',
});
export function inputFiles(root) {
  const dir = path.join(root, inputFolder);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes:true}).filter(e => e.isFile() && /^[a-f0-9]{64}-/.test(e.name) && mediaTypes[path.extname(e.name).toLowerCase()])
    .map(e => ({file:inputFolder + '/' + e.name, name:e.name.slice(65)}));
}
export function inputStamp(root, relative) {
  const file = localFile(root, relative);
  if (fs.realpathSync(file) !== file || !mediaTypes[path.extname(file).toLowerCase()]) return null;
  const stat = fs.statSync(file, {bigint:true});
  return [stat.ino, stat.size, stat.mtimeNs].join('-');
}

export function removeInput(root, setup, relative, stamp) {
  const registered = [...setup.userInputs, ...inputFiles(root)].some(row => row.file === relative);
  if (!registered || !stamp || inputStamp(root, relative) !== stamp) throw Error('素材已变化，请重新查看后删除');
  const original = localFile(root, relative);
  const configFile = path.join(root, '.showreel-progress/workbench.json');
  if (!setup.userInputs.some(row => row.file === relative)) {
    fs.unlinkSync(original);
    return;
  }
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const userInputs = config.userInputs.filter(row => row.file !== relative);
  const staged = path.join(path.dirname(original), '.'+randomUUID());
  const pending = configFile+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(pending, JSON.stringify({...config,userInputs},null,2)+'\n', {flag:'wx'});
  try {
    fs.renameSync(original,staged);
    try { fs.renameSync(pending,configFile); }
    catch (error) { fs.renameSync(staged,original); throw error; }
    fs.unlinkSync(staged);
  } finally { fs.rmSync(pending,{force:true}); }
}

export async function importInput(root, name, stream) {
  if (!name || Buffer.byteLength(name) > 180 || /[\\/?#:\x00-\x1f]/.test(name) || name.startsWith('.') || !mediaTypes[path.extname(name).toLowerCase()])
    throw Error('请选择图片、声音、视频或文本素材');
  for (const rel of ['.showreel-progress', inputFolder]) {
    const dir = localFile(root, rel, {exists:false});
    if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
    if (fs.lstatSync(dir).isSymbolicLink() || !fs.statSync(dir).isDirectory()) throw Error('素材目录无效');
  }
  const tmp = localFile(root, inputFolder + '/.' + randomUUID(), {exists:false});
  const hash = createHash('sha256');
  let size = 0;
  try {
    await pipeline(stream, new Transform({transform(chunk, _, cb) { size += chunk.length; hash.update(chunk); cb(null, chunk); }}), fs.createWriteStream(tmp,{flags:'wx'}));
    if (!size) throw Error('文件为空');
    const file = inputFolder + '/' + hash.digest('hex') + '-' + name;
    try { fs.linkSync(tmp, localFile(root,file,{exists:false})); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    return file;
  } finally { fs.rmSync(tmp,{force:true}); }
}

export function materialViews({root, setup, input, progress, catalog, edits, activePlan, validTime, applies, url, exists}) {
  const clips = (catalog.clips || []).filter(c => !edits[c.id]?.hidden && !edits[c.id]?.deleted && (!c.file || exists(c.file)));
  const linkedAssets = new Map((catalog.assets || []).map(a=>[a.id,a]));
  const used = new Set(), currentHashes = new Set();
  const designFrames = [];
  for (const a of input.keyframeSet?.artifacts || []) {
    const f = a.frame;
    if (f?.role !== 'design' || !validTime(f.timeSeconds) || !applies(f.event,f.timeSeconds) || !exists(a.path)) continue;
    const slot = activePlan?.find(p => p.id === f.event && Math.abs(p.time-f.timeSeconds)<1e-6);
    if (activePlan && (!slot || slot.artifacts && !slot.artifacts.some(x=>x.file===url(a.path) && x.role==='design'))) continue;
    if (a.sha256 && createHash('sha256').update(fs.readFileSync(localFile(root,a.path))).digest('hex') !== a.sha256) continue;
    designFrames.push({id:f.event, title:slot?.title || setup.labels[f.event] || f.event, time:f.timeSeconds,
      unitId:slot?.unitId || f.unitId, file:url(a.path), source:f.source});
    used.add(a.path); used.add(f.sourcePath); currentHashes.add(a.sha256);
  }
  const inputs = [...(setup.userInputs || []), ...inputFiles(root)].filter((a,i,arr) => a.file && exists(a.file) && arr.findIndex(b=>a.file===b.file)===i)
    .map(a => ({...a, stamp:inputStamp(root,a.file), name:a.name || path.basename(a.file), href:url(a.file), uses:clips.filter(c => c.file===a.file || c.sourceFiles?.includes(a.file) || linkedAssets.get(c.assetId)?.sourceFiles?.includes(a.file) || (a.clipIds || []).includes(c.id)).map(c=>c.id)}));
  const sound = {};
  for (const kind of ['voice','music','sfx']) sound[kind] = clips.filter(c => c.kind===kind && exists(c.file)).map(c=>({
    id:c.id, number:c.number, title:c.title, db:edits[c.id]?.db || 0, t0:c.t0+(edits[c.id]?.offset||0), t1:c.t1+(edits[c.id]?.offset||0), href:url(c.file),
  }));
  for (const c of clips) { used.add(c.file); used.add(c.thumbnail); }
  const history = [], seen = new Set();
  function historyFile(file,name,kind,date,hash) {
    if (!file || used.has(file) || seen.has(file) || hash && (currentHashes.has(hash) || seen.has(hash)) || !exists(file)) return;
    seen.add(file); if(hash)seen.add(hash);
    history.push({name:name || path.basename(file), kind, date, href:url(file)});
  }
  for (const a of [...(progress.artifactHistory || []), ...(progress.artifacts || [])].reverse()) {
    if (!a.url?.startsWith('/artifact/')) continue;
    const base=path.basename(a.url); historyFile('.showreel-progress/artifacts/'+base,a.name,'制作记录',a.createdAt,base.split('.')[0]);
  }
  for (const ex of [...(input.explorations || [])].reverse()) {
    for (const a of [ex.mp4, ...(ex.artifacts || [])].filter(Boolean)) historyFile(a.path,ex.purpose+' · '+path.basename(a.path),'探索样片',ex.createdAt,a.sha256);
  }
  for (const a of setup.covers || []) historyFile(a.file,a.name,'参考方案');
  for (const a of input.keyframeSet?.artifacts || []) historyFile(a.path,setup.labels[a.frame?.event] || a.frame?.event,'未用于当前工程',null,a.sha256);
  for (const a of catalog.history || []) historyFile(a.file,a.title,'处理记录',a.date,a.sha256);
  const dir=path.join(root,'.showreel-progress/artifacts');
  if (fs.existsSync(dir)) for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
    if(!e.isFile() || !/^[a-f0-9]{64}\.[a-z0-9]+$/i.test(e.name))continue;
    historyFile('.showreel-progress/artifacts/'+e.name,'已保存的制作记录 · '+e.name.slice(0,8),'制作记录',null,e.name.split('.')[0]);
  }
  designFrames.sort((a,b)=>a.time-b.time);
  return {inputs, history, designFrames, sound};
}
