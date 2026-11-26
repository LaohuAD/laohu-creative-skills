import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { localFile } from '../templates/runtime/laohu-showreel/scripts/lib/editor-model.mjs';
import { hasControlledBriefText } from './brief-typefaces.mjs';
import { captionSourceCues, compileBriefTextMap, readBriefCaptionSource } from './screen-text-registry.mjs';

const columns = ['稳定 ID', '段名', '开始', '结束', '制作说明', '对应片段 ID', '时间依据', '讲述与字幕', '关键设计帧', '制作职责'];
export const emptyProductionTable = `<production-units>\n| ${columns.join(' | ')} |\n| ${columns.map(() => '---').join(' | ')} |\n</production-units>`;
const idPattern = /^[a-z0-9][a-z0-9_-]*$/i;
const frameIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const anchorPattern = /^[\w.:-]+$/u;
const roles = new Set(['动画', '混合', '视频', '声音']);
const epsilon = 1e-6;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function filmSeconds(value) {
  if (!/^(?:\d+:){0,2}\d+(?:\.\d+)?$/.test(value)) return NaN;
  const parts = value.split(':').map(Number);
  if (parts.slice(1).some(part => part >= 60)) return NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function cells(line) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/u).map(cell => cell.replace(/\\\|/gu, '|').trim());
}

function ids(value, label, { empty = false, pattern = anchorPattern } = {}) {
  if (!value && empty) return [];
  const values = value.split(',').map(item => item.trim());
  if (values.some(item => !pattern.test(item)) || values.length !== new Set(values).size) throw Error(`${label}须用逗号分隔不重复的稳定 ID`);
  return values;
}

function readRef(value, label, isClock = false) {
  const match = /^([^#]+)#(.+)$/u.exec(value);
  if (!match || /[\\?\u0000]/u.test(match[1]) || /^(?:\/|[A-Za-z]:)/u.test(match[1]) || match[1].split('/').includes('..')) throw Error(`${label}需要项目相对路径与 #ID`);
  const [, file, selector] = match;
  if (isClock ? file !== 'timeline.js' && !/\.json$/iu.test(file) : !/\.(?:srt|json)$/iu.test(file)) throw Error(`${label}文件类型无效：${file}`);
  return { file, ids: ids(selector, label) };
}

function timing(value, label) {
  if (value === '计划' || value === '待对齐') return { status: value };
  if (!value.startsWith('成片@')) throw Error(`${label}须写计划、待对齐或成片@项目文件#区间ID`);
  const ref = readRef(value.slice('成片@'.length), label, true);
  const withEdge = id => /\.(?:t0|t1)$/u.test(id);
  if (ref.ids.length > 2 || ref.ids.length === 1 && withEdge(ref.ids[0]) || ref.ids.length === 2 && ref.ids.some(id => !withEdge(id))) throw Error(`${label}请绑定一个完整区间，或用区间ID.t0、区间ID.t1 选择两个实际端点`);
  return { status: '成片', ref };
}

function speech(value, label) {
  if (value === '无口播' || value === '口播待对齐') return { status: value, refs: [] };
  const sources = value.split(/[；;]/u).map(ref => ref.trim());
  const track = sources.filter(ref => ref === '原生字幕轨');
  if (track.length > 1) throw Error(`${label} 只能引用一次原生字幕轨`);
  return { status: track.length ? '原生字幕轨' : '引用', refs: sources.filter(ref => ref !== '原生字幕轨').map(ref => readRef(ref, label)) };
}

function framePlans(value, row, used, previous) {
  if (value === '无' && !['动画', '混合'].includes(row.role)) return { frames: [] };
  if (value.startsWith('无@') && value.slice(2).trim()) return { frames: [], frameReason: value.slice(2).trim() };
  if (value.startsWith('沿用@')) {
    const id = value.slice('沿用@'.length);
    if (!previous || !previous.frames.some(frame => frame.id === id) && previous.reuseFrameId !== id) throw Error(`片段 ${row.id} 要沿用前段可定位的实际设计帧 ID：${id}`);
    return { frames: [], reuseFrameId: id };
  }
  const frames = value.split(',').map(item => {
    const match = /^([^@]+)@(.+)$/u.exec(item.trim());
    const id = match?.[1];
    const time = filmSeconds(match?.[2] ?? '');
    if (!id || !frameIdPattern.test(id) || used.has(id) || !Number.isFinite(time) || time < row.t0 || time >= row.t1) {
      throw Error(`片段 ${row.id} 的关键设计帧须用片内时点和全片唯一的帧ID@秒，并在导演正文说明该帧要验证的状态`);
    }
    used.add(id);
    return { id, time, unitId: row.id };
  });
  return { frames };
}

function directors(structure) {
  const headings = [...structure.matchAll(/^#{1,6}[^\S\r\n]+[^\r\n]+$/gmu)];
  const bodies = new Map();
  for (const [index, heading] of headings.entries()) {
    const match = /^###\s+\[([a-z0-9_-]+)\]\s+(.+?)\s*$/iu.exec(heading[0]);
    if (!match) continue;
    const [, id, title] = match;
    if (bodies.has(id)) throw Error(`片段 ${id} 的导演正文重复`);
    // End at the next peer heading, allowing local subheadings within this unit.
    const next = headings.slice(index + 1).find(item => /^#{1,3}\s/u.test(item[0]));
    const body = structure.slice(heading.index + heading[0].length, next?.index)
      .split(/^\s*<(?:production-units|screen-text-registry)>\s*$/mu)[0]
      .replace(/^[\t ]*typeface-use[\t ]*:[^\r\n]*(?:\r?\n|$)/gmu, '').trim();
    bodies.set(id, { title, body });
  }
  return bodies;
}

// Older six-column briefs continue through the original reader. New films explicitly
// choose the expanded table consumed by this function and the live workbench.
export function readBriefProductionUnits(brief, { required = false, projectRoot } = {}) {
  const structure = /<structure>([\s\S]*?)<\/structure>/iu.exec(brief)?.[1] ?? '';
  const explicit = /<production-units>([\s\S]*?)<\/production-units>/iu.exec(structure);
  const lines = explicit?.[1].split(/\r?\n/u).filter(line => line.trim()) ?? [];
  const header = lines[0] ? cells(lines[0]) : [];
  if (!explicit || header.length <= 6) {
    if (required) throw Error('新项目需要补齐 <structure> 内的十列 <production-units> 制作片段表，包含逐段导演正文');
    return null;
  }
  const allTags = [...brief.matchAll(/<\/?production-units>/giu)];
  const allLocalTags = [...structure.matchAll(/<\/?production-units>/giu)];
  const screenText = /<screen-text-registry>[\s\S]*?<\/screen-text-registry>/iu.exec(structure);
  if (allTags.length !== 2 || allLocalTags.length !== 2 || screenText && explicit.index < screenText.index + screenText[0].length && screenText.index < explicit.index + explicit[0].length) {
    throw Error('Brief 的 <production-units> 须唯一、成对，置于 <structure> 内，与屏显文字登记分开');
  }
  if (header.length !== columns.length || header.some((cell, index) => cell !== columns[index]) || !lines[1] || cells(lines[1]).length !== columns.length || cells(lines[1]).some(cell => !/^:?-{3,}:?$/u.test(cell))) {
    throw Error(`Brief 制作片段表请使用既定列序：${columns.join(' | ')}`);
  }
  const designById = directors(structure);
  const textMap = hasControlledBriefText(brief) ? compileBriefTextMap(brief, {projectRoot}) : null;
  const captionSource = textMap?.captionSource;
  const typefaces = new Map(textMap?.typefaces?.map(({name, id, weight}) => [name, {id, weight}]));
  const screenEntries = (textMap?.entries ?? []).map(({typeface, ...entry}) =>
    typeface ? { ...entry, typeface: typefaces.get(typeface) } : entry);
  const used = new Set(), framesUsed = new Set();
  let end = 0, previous = null;
  const units = lines.slice(2).map((line, index) => {
    const row = cells(line);
    const [id, title, start, finish, description, clipId, basis, links, frames, role] = row;
    const t0 = filmSeconds(start ?? ''), t1 = filmSeconds(finish ?? '');
    if (row.length !== columns.length || !idPattern.test(id ?? '') || !title || !description || used.has(id) || !Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0 || (index > 0 || required) && Math.abs(t0-end) > epsilon || !roles.has(role)) {
      throw Error(`制作片段 ${id || index + 1} 的列、编号、角色或时码无效，请按整片连续区间顺序填写`);
    }
    const design = designById.get(id);
    if (!design?.body || design.title !== title) throw Error(`制作片段 ${id} 须有同一 <structure> 下标题一致的导演正文（### [${id}] ${title}）`);
    used.add(id);
    end = t1;
    const unit = { id, title, t0, t1, description, clipId, clipIds: ids(clipId, `${id} 的对应片段 ID`, { empty: true, pattern: idPattern }), role,
      timing: timing(basis, `${id} 的时间依据`), speech: speech(links, `${id} 的讲述与字幕`), directorHeading: `[${id}] ${design.title}`,
      directorText: design.body };
    Object.assign(unit, framePlans(frames, unit, framesUsed, previous));
    // The same text may enter in one unit and remain on screen in the next.
    const visibleText = screenEntries.filter(entry => entry.visibleStart < t1 && entry.visibleEnd > t0);
    if (visibleText.length) unit.screenText = visibleText;
    if (unit.reuseFrameId) unit.reusedFrameDesignRevision = previous.reusedFrameDesignRevision ?? previous.designRevision;
    unit.designRevision = sha(JSON.stringify(unit));
    previous = unit;
    return unit;
  });
  if (!units.length || used.size !== designById.size) throw Error('制作片段表与同一 <structure> 的逐段导演正文须逐一对应');
  return { format: 'laohu.motion.production-units/1', briefSha256: sha(brief), units,
    ...(captionSource ? { captionSource: {kind: captionSource.kind, path: captionSource.path, sha256: captionSource.sha256} } : {}) };
}

export function briefProductionInputs(plan) {
  return [...new Set([plan.captionSource?.path, ...plan.units.flatMap(unit =>
    [unit.timing.ref?.file, ...unit.speech.refs.map(ref => ref.file)])].filter(Boolean))];
}

export function parseSrt(text) {
  const stamp = '(\\d{2,}):(\\d{2}):(\\d{2})[,.](\\d{3})';
  const timing = new RegExp(`^\\s*${stamp}\\s+-->\\s+${stamp}(?:\\s.*)?$`);
  const seconds = ([h, m, s, ms]) => Number(h)*3600 + Number(m)*60 + Number(s) + Number(ms)/1000;
  return text.replace(/^\uFEFF/u, '').replace(/\r\n?/g, '\n').trim().split(/\n[\t ]*\n/g).flatMap(block => {
    const lines = block.split('\n');
    const row = lines.findIndex(line => timing.test(line));
    if (row < 0) return [];
    const match = timing.exec(lines[row]);
    const t0 = seconds(match.slice(1, 5)), t1 = seconds(match.slice(5, 9));
    const cue = lines.slice(row+1).filter(Boolean).join('\n');
    if (t1 <= t0 || !cue) return [];
    return [{ id: row > 0 && /^\d+$/u.test(lines[0]) ? lines[0] : String(t0), t0, t1, text: cue }];
  }).sort((a, b) => a.t0-b.t0 || a.t1-b.t1);
}

function sampleSeconds(range) {
  const { sampleRateHz, startSample, endSample } = range ?? {};
  if (!Number.isSafeInteger(sampleRateHz) || sampleRateHz <= 0 || !Number.isSafeInteger(startSample) || startSample < 0 || !Number.isSafeInteger(endSample) || endSample <= startSample) throw Error('时间源缺少有效的目标样本区间');
  return { t0: startSample/sampleRateHz, t1: endSample/sampleRateHz };
}

function asrcutIntervals(artifact) {
  if (!['laohu.asrcut.timeline/1', 'laohu.asrcut.timeline/2'].includes(artifact.format) || !Array.isArray(artifact.clips)) throw Error('需要 ASRcut 编译后的 timeline/1 或 timeline/2');
  const rows = artifact.format.endsWith('/2') ? artifact.units : artifact.clips;
  if (!Array.isArray(rows)) throw Error('ASRcut 时间源缺少剪后区间');
  return rows.map(row => ({ id: row.occurrenceId ?? row.id, ...sampleSeconds(row.targetRange),
    kind: row.kind ?? 'source', precision: row.timingPrecision,
    text: Array.isArray(row.transcriptSegments) ? row.transcriptSegments.map(item => item.spokenText ?? item.text).filter(Boolean).join('\n') : undefined }));
}

function point(id, rows, label) {
  const end = /\.(t[01])$/u.exec(id);
  const targetId = end ? id.slice(0, -end[0].length) : id;
  const matches = rows.filter(row => row.id === targetId && Number.isFinite(row.t0) && Number.isFinite(row.t1));
  const primary = matches[0];
  if (!primary || matches.some(row => row.t0 !== primary.t0 || row.t1 !== primary.t1)) throw Error(`${label}无法唯一定位区间 ${targetId}`);
  return end ? primary[end[1]] : { t0: primary.t0, t1: primary.t1 };
}

export function resolveBriefProductionUnits(root, plan, clock) {
  const files = new Map();
  const inputs = (file, purpose) => {
    const key = `${purpose}:${file}`;
    if (files.has(key)) return files.get(key);
    const bytes = fs.readFileSync(localFile(root, file));
    let rows, draftSource = false;
    if (file === 'timeline.js') {
      if (!clock || clock.draft || !(clock.duration > 0)) throw Error('等待工程的正式成片时钟');
      rows = [...clock.shots, ...clock.events, ...clock.chapters];
    } else if (purpose === 'speech' && file === plan.captionSource?.path) {
      if (sha(bytes) !== plan.captionSource.sha256) throw Error(`${file} 的 SHA-256 与 Brief 原生字幕登记不一致`);
      const current = readBriefCaptionSource(fs.readFileSync(localFile(root, 'brief.md'), 'utf8'), root);
      if (current?.path !== file || current.sha256 !== plan.captionSource.sha256) throw Error('Brief 的原生字幕源已变化，请重新读取制作片段');
      rows = captionSourceCues(current);
    } else if (/\.srt$/iu.test(file)) {
      rows = parseSrt(bytes.toString('utf8'));
    } else {
      const artifact = JSON.parse(bytes.toString('utf8'));
      rows = asrcutIntervals(artifact);
      draftSource = artifact.state !== 'frozen';
    }
    const source = { sha256: sha(bytes), rows, draftSource };
    files.set(key, source);
    return source;
  };
  const checked = plan.units.map(unit => {
    const issues = [], bindings = [];
    let timeState = unit.timing.status === '成片' ? 'bound' : unit.timing.status === '计划' ? 'planned' : 'waiting';
    let timeSource = null;
    try {
      const source = unit.timing.ref;
      if (source) {
        const { rows, sha256, draftSource } = inputs(source.file, 'time');
        if (draftSource) throw Error('等待冻结的 ASRcut 剪后时钟');
        const [start, finish] = source.ids.map(id => point(id, rows, source.file));
        const { t0, t1 } = source.ids.length === 1 ? start : { t0: start, t1: finish };
        if (!(Math.abs(t0-unit.t0) <= epsilon && Math.abs(t1-unit.t1) <= epsilon)) throw Error(`当前成片区间 ${t0}–${t1} 已不同于设计登记 ${unit.t0}–${unit.t1}`);
        timeSource = { ...source, sha256, t0, t1 };
      }
    } catch (error) {
      timeState = 'unresolved';
      issues.push(error.message);
    }
    if (unit.speech.status === '口播待对齐') issues.push('等候真实口播与字幕时码');
    const captionTrack = unit.speech.status === '原生字幕轨';
    if (captionTrack && !plan.captionSource) issues.push('原生字幕轨需要在 <inputs> 声明经过 SHA-256 校验的 caption-source');
    const speechSources = captionTrack && plan.captionSource
      ? [{file: plan.captionSource.path, automatic: true}, ...unit.speech.refs] : unit.speech.refs;
    for (const source of speechSources) {
      try {
        if (captionTrack && !source.automatic && source.file === plan.captionSource?.path) throw Error('同一片段只登记一次原生字幕源');
        const { rows, sha256, draftSource } = inputs(source.file, 'speech');
        if (draftSource) issues.push(`${source.file} 为待冻结的 ASRcut 剪后时钟`);
        const overlapping = rows.filter(row => row.kind !== 'presentation' && row.t0 < unit.t1 && row.t1 > unit.t0);
        // ASR occurrence lists may designate only the spoken material being used in the design.
        // A declared SRT is already the subtitle track, so carry all of its visible intersections.
        if (!source.automatic && (/\.srt$/iu.test(source.file) || source.file === plan.captionSource?.path)
          && overlapping.some(row => !source.ids.includes(row.id))) throw Error(`${source.file} 的当前字幕重叠范围已变化，请更新本段 cue 登记或使用原生字幕轨`);
        for (const id of source.automatic ? overlapping.map(row => row.id) : source.ids) {
          const matching = overlapping.filter(row => row.id === id);
          if (matching.length !== 1) throw Error(`${source.file}#${id} 缺失、重复或未在本片段出现`);
          const [row] = matching;
          bindings.push({ id, file: source.file, sha256, t0: row.t0, t1: row.t1,
            intersection: { t0: Math.max(row.t0, unit.t0), t1: Math.min(row.t1, unit.t1) },
            ...(row.text ? { text: row.text } : {}), ...(row.rows ? { rows: row.rows } : {}),
            ...(row.precision ? { precision: row.precision } : {}) });
        }
      } catch (error) { issues.push(error.message); }
    }
    // Hash the actual range and visible text separately from the source-file identity.
    // Another unit changing an unrelated cue need not invalidate this unit's design review.
    const currentRevision = sha(JSON.stringify([unit.designRevision, bindings.map(({ sha256, ...binding }) => binding)]));
    return { ...unit, timeState, timeSource, bindings, issues, sourceDesignRevision: unit.designRevision, designRevision: currentRevision };
  });
  const last = checked.at(-1);
  const issues = [];
  if (clock?.duration > 0 && !clock.draft && (checked[0].t0 > epsilon || Math.abs(last.t1-clock.duration) > epsilon)) issues.push(`制作片段登记须覆盖当前影片 [0, ${clock.duration})`);
  return { ...plan, units: checked, issues };
}
