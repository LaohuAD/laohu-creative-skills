// Per-run files let independent producers publish concurrently without rewriting status.json.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { localFile } from '../laohu-showreel/scripts/lib/editor-model.mjs';

const stages = new Set('input voice srt brief chapters cover motion music sfx mix export'.split(' '));
const directory = '.showreel-progress/tasks';
const tokenPattern = /^[a-f0-9-]{36}$/;
function publish(file, row) {
  const temporary = path.join(path.dirname(file), randomUUID() + '.tmp');
  fs.writeFileSync(temporary, JSON.stringify(row), {flag:'wx'});
  try { fs.linkSync(temporary, file); } finally { fs.unlinkSync(temporary); }
}
export function startTask(root, stage, item = '', title = '', ownerPid) {
  if (!stages.has(stage) || typeof item !== 'string' || item.length > 512 || title.length > 200) throw Error('制作阶段或条目标识无效');
  fs.mkdirSync(localFile(root,'.showreel-progress',{exists:false}),{recursive:true});
  const token = randomUUID(), dir = localFile(root,directory,{exists:false});
  fs.mkdirSync(dir,{recursive:true});
  publish(localFile(root,directory+'/'+token+'.json',{exists:false}), {stage,item,title,ownerPid});
  return token;
}
export function endTask(root, token, outcome) {
  if (!tokenPattern.test(token) || !['finish','stop'].includes(outcome)) throw Error('制作任务编号或结束状态无效');
  localFile(root,directory+'/'+token+'.json');
  const file = localFile(root,directory+'/'+token+'.end',{exists:false});
  try { publish(file,outcome); }
  catch (e) { if (e.code !== 'EEXIST' || JSON.parse(fs.readFileSync(file)) !== outcome) throw e; }
}
export function readTasks(root) {
  if (!fs.existsSync(path.join(root,directory))) return [];
  const dir = path.dirname(localFile(root,directory+'/index',{exists:false}));
  const latest = new Map();
  for (const name of fs.readdirSync(dir)) {
    const token = path.basename(name,'.json');
    if (name !== token+'.json' || !tokenPattern.test(token)) continue;
    const file = localFile(root,directory+'/'+name), row = JSON.parse(fs.readFileSync(file,'utf8'));
    const start = fs.statSync(file,{bigint:true}).birthtimeNs;
    const key = JSON.stringify([row.stage,row.item]);
    const previous = latest.get(key);
    if (previous && (previous.start > start || previous.start === start && previous.token > token)) continue;
    const end = localFile(root,directory+'/'+token+'.end',{exists:false});
    let status = fs.existsSync(end) ? JSON.parse(fs.readFileSync(end,'utf8')) : 'running';
    if (status==='running' && row.ownerPid) {
      try { process.kill(row.ownerPid,0); } catch (error) { if (error.code==='ESRCH') status='stop'; }
    }
    latest.set(key,{row:{stage:row.stage,item:row.item,title:row.title,status},start,token});
  }
  return [...latest.values()].map(r=>r.row);
}
