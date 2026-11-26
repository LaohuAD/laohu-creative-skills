import { createHash } from 'node:crypto';

export const briefBlocks = ['role', 'inputs', 'confirmations', 'direction', 'structure', 'build', 'gotchas', 'start'];
export const explorationBlocks = ['role', 'inputs', 'direction'];

const declarations = (direction, key) => [...direction.matchAll(new RegExp(`^[\\t ]*${key}[\\t ]*[:：][\\t ]*(.+?)[\\t ]*$`, 'gmu'))].map(match => match[1]);
export const readDirectionAssets = direction => [...new Set(declarations(direction, 'direction-asset'))].sort();

export function readExplorationDirection(direction) {
  const names = declarations(direction, 'direction-name');
  if (names.length !== 1 || names[0] === '共用' || !/^[^<>|\r\n]{1,32}$/u.test(names[0])) {
    throw Error('方向探索需要一项明确的 direction-name，使用与 --text-direction 相同的具体方向名称。');
  }
  const moments = declarations(direction, 'explore-moment').map(line => {
    const match = /^([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})\s*@\s*(\d+(?:\.\d+)?)\s+[—–]\s+(.+)$/u.exec(line);
    if (!match || !Number.isFinite(Number(match[2]))) throw Error('代表时刻须用 explore-moment: <事件ID>@<非负秒数> — <需要在真实画面检查的状态>。');
    return { id: match[1], time: Number(match[2]), state: match[3] };
  });
  if (moments.length < 2 || moments.length > 4 || new Set(moments.map(moment => moment.id)).size !== moments.length) {
    throw Error('方向探索需要 2–4 个具有唯一事件 ID 的代表时刻。');
  }
  return { name: names[0], moments };
}

export function compileExplorationTextMap(brief, blocks, compile) {
  const normalized = briefBlocks.map(name => {
    let body = blocks[name] ?? '';
    if (name === 'structure' && !body.includes('<screen-text-registry>')) {
      body += '\n<screen-text-registry>\n</screen-text-registry>';
    }
    return `<${name}>\n${body}\n</${name}>`;
  }).join('\n\n');
  return { ...compile(normalized), briefSha256: createHash('sha256').update(brief).digest('hex') };
}

export function textEvidenceInRanges(map, direction, ranges) {
  const entries = map.entries.filter(entry => (!direction || entry.direction === direction || entry.direction === '共用')
    && ranges.some(({ start, end }) => entry.visibleEnd > start && (start === end ? entry.visibleStart <= start : entry.visibleStart < end)))
    .sort((left, right) => left.id.localeCompare(right.id));
  const used = new Set(entries.map(entry => entry.typeface).filter(Boolean));
  const typefaces = (map.typefaces ?? []).filter(face => used.has(face.name)).sort((left, right) => left.name.localeCompare(right.name));
  return { entries, typefaces };
}
