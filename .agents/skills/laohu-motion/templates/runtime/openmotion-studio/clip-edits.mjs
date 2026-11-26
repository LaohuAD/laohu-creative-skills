import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { localFile } from '../laohu-showreel/scripts/lib/editor-model.mjs';

const exec = promisify(execFile);
export const catalogPath = 'assets/workbench/clips.json';
export const statePath = 'assets/clip-state.json';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encode = (value) => JSON.stringify(value, null, 2) + '\n';
const kinds = new Set(['animation', 'video', 'voice', 'music', 'sfx']);
const isAudio = (c) => ['voice', 'music', 'sfx'].includes(c.kind);
function read(root, name) {
  return JSON.parse(fs.readFileSync(localFile(root, name), 'utf8'));
}
function fileHash(file) {
  const h = createHash('sha256');
  return (async () => {
    for await (const bytes of fs.createReadStream(file)) h.update(bytes);
    return h.digest('hex');
  })();
}
export function readCut(root) {
  if (!fs.existsSync(path.join(root, catalogPath))) return null;
  const catalog = read(root, catalogPath);
  const state = read(root, statePath);
  if (
    catalog.version !== 1 ||
    state.version !== 1 ||
    !(catalog.duration > 0) ||
    !Array.isArray(catalog.clips) ||
    !Array.isArray(state.history)
  )
    throw Error('剪辑登记格式不正确');
  const ids = new Set(),
    numbers = new Set();
  for (const c of catalog.clips) {
    const number = c.kind + '-' + c.number;
    if (
      !kinds.has(c.kind) ||
      !/^[a-z0-9][a-z0-9_-]*$/i.test(c.id) ||
      !Number.isInteger(c.number) ||
      c.number < 1 ||
      !c.title ||
      numbers.has(number) ||
      ids.has(c.id) ||
      !Number.isFinite(c.t0) ||
      !Number.isFinite(c.t1) ||
      c.t0 < 0 ||
      c.t1 <= c.t0 ||
      c.t1 > catalog.duration + 0.001
    )
      throw Error('片段编号或区间无效：' + c.id);
    ids.add(c.id);
    numbers.add(number);
  }
  if (typeof state.edits !== 'object' || !state.edits) throw Error('剪辑状态不可读取');
  return { catalog, state, revision: digest(JSON.stringify([catalog, state])).slice(0, 20) };
}
function atomic(file, bytes) {
  const tmp = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(tmp, bytes, { flag: 'wx' });
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
function replaceFrom(source, target) {
  const tmp = target + '.' + randomUUID() + '.tmp';
  try {
    fs.copyFileSync(source, tmp, fs.constants.COPYFILE_FICLONE);
    fs.renameSync(tmp, target);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
function safeTarget(root, name) {
  const file = localFile(root, name);
  if (fs.lstatSync(file).isSymbolicLink()) throw Error('请使用项目内普通文件');
  return file;
}
async function renderMix(root, catalog, edits, output) {
  const base = localFile(root, catalog.baseMix);
  if ((await fileHash(base)) !== catalog.baseMixSha256) throw Error('原混音已更换，请刷新分轨素材');
  const differences = catalog.clips.filter((c) => isAudio(c) && edits[c.id]);
  if (!differences.length) {
    fs.copyFileSync(base, output, fs.constants.COPYFILE_FICLONE);
    return;
  }
  const args = ['-v', 'error', '-nostdin', '-y', '-i', base],
    filters = [],
    pads = ['[0:a]'];
  for (const c of differences) {
    const edit = edits[c.id],
      enabled = !edit.hidden && !edit.deleted;
    const n = args.filter((v) => v === '-i').length;
    const file = localFile(root, c.file);
    if (c.sha256 && (await fileHash(file)) !== c.sha256) throw Error('分轨素材已变化：' + c.title);
    args.push('-i', file);
    if (enabled) filters.push('[' + n + ':a]asplit=2[old' + n + '][new' + n + ']');
    const original = enabled ? '[old' + n + ']' : '[' + n + ':a]';
    filters.push(original + 'volume=-1,adelay=' + Math.round(c.t0 * 48000) + 'S:all=1[minus' + n + ']');
    pads.push('[minus' + n + ']');
    if (enabled) {
      const at = c.t0 + (edit.offset || 0);
      filters.push(
        '[new' +
          n +
          ']volume=' +
          Math.pow(10, (edit.db || 0) / 20) +
          ',adelay=' +
          Math.round(at * 48000) +
          'S:all=1[plus' +
          n +
          ']',
      );
      pads.push('[plus' + n + ']');
    }
  }
  filters.push(pads.join('') + 'amix=inputs=' + pads.length + ':duration=first:normalize=0[out]');
  await exec(
    'ffmpeg',
    [
      ...args,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[out]',
      '-map_metadata',
      '0',
      '-c:a',
      'pcm_s24le',
      output,
    ],
    { timeout: 180000 },
  );
}
const workingFile = '.showreel-progress/clip-working.json';
export function currentEdit(root) {
  try {
    const work = read(root,workingFile);
    process.kill(work.pid,0);
    return work;
  } catch { return null; }
}
export async function changeCut(root, request) {
  const scratch = path.join(root, '.showreel-progress');
  fs.mkdirSync(scratch, { recursive: true });
  localFile(root, '.showreel-progress/clip-lock', { exists: false });
  const lock = path.join(scratch, 'clip-edit.lock'),
    ticket = path.join(scratch, 'clip-ticket-' + randomUUID());
  const transaction = path.join(scratch, 'clip-transaction');
  fs.writeFileSync(ticket, String(process.pid), { flag: 'wx' });
  try {
    try {
      fs.linkSync(ticket, lock);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owner = Number(fs.readFileSync(lock, 'utf8'));
      if (!Number.isSafeInteger(owner) || owner <= 0) throw Error('请核对剪辑锁的恢复记录');
      try {
        process.kill(owner, 0);
        throw Error('项目正在保存剪辑，请刷新后再试');
      } catch (alive) {
        if (alive.code !== 'ESRCH') throw alive;
      }
      // All writers re-acquire the lock before touching any project asset.
      const reaper = lock + '.recover';
      fs.linkSync(ticket, reaper);
      try {
        if (fs.readFileSync(lock, 'utf8') !== String(owner)) throw Error('项目正被另一窗口恢复');
        fs.unlinkSync(lock);
        fs.linkSync(ticket, lock);
      } finally {
        fs.unlinkSync(reaper);
      }
    }
  } finally {
    fs.rmSync(ticket, { force: true });
  }
  let work;
  try {
    if (fs.existsSync(transaction)) {
      const marker = path.join(transaction, 'pending.json');
      if (fs.existsSync(marker)) {
        const j = JSON.parse(fs.readFileSync(marker, 'utf8')),
          current = readCut(root);
        if (current.state.serial !== j.nextSerial) {
          const target = safeTarget(root, current.catalog.mixTarget),
            receipt = safeTarget(root, current.catalog.mixReceipt);
          if (![j.priorHash, j.nextHash].includes(await fileHash(target)))
            throw Error('混音同时被外部修改，请核对 clip-transaction 中的原件');
          replaceFrom(path.join(transaction, 'prior.wav'), target);
          atomic(receipt, fs.readFileSync(path.join(transaction, 'prior.json')));
        }
      }
      fs.rmSync(transaction, { recursive: true });
    }
    const cut = readCut(root);
    if (request.action === 'recover') return cut?.revision;
    if (!cut || request.revision !== cut.revision) throw Error('剪辑已更新，请刷新后再操作');
    const { catalog, state } = cut,
      edits = { ...state.edits },
      history = [...state.history],
      redo = [...(state.redo || [])];
    let id = request.id;
    if (request.action === 'undo' || request.action === 'redo') {
      const undoing = request.action === 'undo';
      const entry = (undoing ? history : redo).pop();
      if (!entry) throw Error(undoing ? '没有可撤销的操作' : '没有可重做的操作');
      id = entry.id;
      (undoing ? redo : history).push({ id, before: edits[id] || null });
      if (entry.before) edits[id] = entry.before;
      else delete edits[id];
    } else {
      const c = catalog.clips.find((x) => x.id === id);
      if (!c) throw Error('找不到片段');
      const before = edits[id],
        after = { ...before };
      if (request.action === 'hide') after.hidden = true;
      else if (request.action === 'show') delete after.hidden;
      else if (request.action === 'remove') after.deleted = true;
      else if (request.action === 'restore') delete after.deleted;
      else if (request.action === 'shift' && isAudio(c) && Number.isFinite(request.value)) {
        after.offset = (after.offset || 0) + request.value;
        if (c.t0 + after.offset < 0 || c.t1 + after.offset > catalog.duration + 0.0001)
          throw Error('移动超出成片范围');
      } else if (
        request.action === 'gain' &&
        isAudio(c) &&
        Number.isFinite(request.value) &&
        request.value >= -60 &&
        request.value <= 0
      )
        after.db = request.value;
      else throw Error('不支持这个片段操作');
      if (!after.offset) delete after.offset;
      if (!after.db) delete after.db;
      if (JSON.stringify(before || {}) === JSON.stringify(after)) return cut.revision;
      if (Object.keys(after).length) edits[id] = after;
      else delete edits[id];
      history.push({ id, before: before || null });
      redo.length = 0;
    }
    const changed = catalog.clips.find((c) => c.id === id);
    if (!changed) throw Error('素材版本已变化，撤销前需核对');
    const audio = isAudio(changed);
    atomic(localFile(root,workingFile,{exists:false}),encode({pid:process.pid, stage:audio ? changed.kind : 'motion',
      item:audio ? changed.id : changed.scene || changed.id, clip:changed.id, title:changed.title, mix:audio}));
    const next = { ...state, edits, history, redo, serial: (state.serial || 0) + 1 };
    const stateFile = safeTarget(root, statePath);
    if (isAudio(changed)) {
      const target = safeTarget(root, catalog.mixTarget),
        receipt = safeTarget(root, catalog.mixReceipt);
      if (target === localFile(root, catalog.baseMix)) throw Error('需要保留独立的原混音');
      const before = read(root, catalog.mixReceipt);
      if (
        before.audioSha256 !== (state.mixSha256 || catalog.baseMixSha256) ||
        (await fileHash(target)) !== before.audioSha256
      )
        throw Error('混音已有其他修改，已保留原文件');
      work = transaction;
      fs.mkdirSync(work);
      const output = path.join(work, 'result.wav');
      await renderMix(root, catalog, edits, output);
      next.mixSha256 = await fileHash(output);
      fs.copyFileSync(target, path.join(work, 'prior.wav'), fs.constants.COPYFILE_FICLONE);
      const originalReceipt = fs.readFileSync(receipt);
      if (readCut(root).revision !== cut.revision || (await fileHash(target)) !== before.audioSha256)
        throw Error('制作期间工程已更新');
      fs.writeFileSync(path.join(work, 'prior.json'), originalReceipt);
      atomic(
        path.join(work, 'pending.json'),
        encode({ priorHash: before.audioSha256, nextHash: next.mixSha256, nextSerial: next.serial }),
      );
      try {
        replaceFrom(output, target);
        atomic(receipt, encode({ ...before, audioSha256: next.mixSha256 }));
        atomic(stateFile, encode(next));
      } catch (e) {
        replaceFrom(path.join(work, 'prior.wav'), target);
        atomic(receipt, originalReceipt);
        throw e;
      }
    } else atomic(stateFile, encode(next));
    return readCut(root).revision;
  } finally {
    fs.rmSync(path.join(root,workingFile),{force:true});
    if (work) fs.rmSync(work, { recursive: true, force: true });
    fs.unlinkSync(lock);
  }
}

export function saveSelection(root, request) {
  const cut = readCut(root),
    c = cut?.catalog.clips.find((c) => c.id === request.id);
  if (
    !c ||
    cut.revision !== request.revision ||
    !Number.isFinite(request.time) ||
    request.time < 0 ||
    request.time > cut.catalog.duration
  )
    throw Error('播放位置已过期');
  fs.mkdirSync(path.join(root, '.showreel-progress'), { recursive: true });
  const file = localFile(root, '.showreel-progress/selected-clip.json', { exists: false });
  atomic(
    file,
    encode({
      id: c.id,
      kind: c.kind,
      number: c.number,
      title: c.title,
      time: request.time,
      revision: cut.revision,
    }),
  );
  return cut.revision;
}

// Read the author's interval table when present. Existing showreels can already link
// their bilingual cue table to named shots; keep those shots on the film clock.
export function productionUnits(brief, shots, declared) {
  if (Array.isArray(declared)) return declared;
  const structure = brief.match(/<structure>([\s\S]*?)<\/structure>/i)?.[1] || '';
  const explicit = structure.match(/<production-units>([\s\S]*?)<\/production-units>/i)?.[1];
  const cells = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((s) => s.trim());
  if (explicit) {
    const rows = explicit
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith('|'))
      .slice(2);
    const used = new Set();
    const seconds = (value) => {
      if (!/^(?:\d+:)?\d+(?:\.\d+)?$/.test(value)) return NaN;
      return value.split(':').reduce((time, part) => time * 60 + Number(part), 0);
    };
    return rows.map((line) => {
      const [id, title, start, finish, description, clipId] = cells(line),
        t0 = seconds(start),
        t1 = seconds(finish);
      if (!id || !title || !Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0 || used.has(id))
        throw Error('Brief 动画分段表的编号或时码无效：' + id);
      used.add(id);
      return { id, title, t0, t1, description, clipId };
    });
  }
  const takeaways = new Map();
  for (const line of structure.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const [cue, range, id, meaning] = cells(line);
    if (cue && /^\d+(?:\.\d+)?[–—-]\d/.test(range || '') && meaning && !takeaways.has(id))
      takeaways.set(id, meaning);
  }
  return shots.map((s) => ({ ...s, description: takeaways.get(s.id) || '' }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [root, action, id, revision, rawValue] = process.argv.slice(2);
    const cut = readCut(root);
    if (!cut) throw Error('工程尚未登记可控片段');
    if (action === 'list') {
      const selection = path.join(root, '.showreel-progress/selected-clip.json');
      console.log(
        encode({
          revision: cut.revision,
          selection: fs.existsSync(selection) ? read(root, '.showreel-progress/selected-clip.json') : null,
          clips: cut.catalog.clips.map(({ id, kind, number, title, t0, t1 }) => ({
            id,
            kind,
            number,
            title,
            t0,
            t1,
            ...cut.state.edits[id],
          })),
        }),
      );
    } else
      console.log(
        await changeCut(root, {
          action,
          id,
          revision,
          value: rawValue === undefined ? undefined : Number(rawValue),
        }),
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
