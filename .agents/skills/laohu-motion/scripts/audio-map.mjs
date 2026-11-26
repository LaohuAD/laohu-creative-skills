// The index owns asset identity, classifications and review evidence.
export function audioMap(index) {
  const groups = [
    ['物理拟音', /fabric|glass|wood-contact|wood-slide|wood-set-down|latch|page|paper|surface|shutter|settle/, '纸、布、玻璃、木与机械接触'],
    ['空气扫动', /sweep|swish|zip-transition|air-build/, '慢扫、快划与反向吸入'],
    ['撞击落点', /impact|element-pop/, '轻触、落定到重击'],
    ['揭示光效', /reveal|sting|glitch/, '爬升、闪亮、故障强调'],
    ['界面短音', /interface|selection|notification|text-entry|light-touch|success/, '点击、导航、输入与确认'],
    ['脚步环境', /footstep/, '木地面、地毯、草地、雪地与水泥'],
    ['其他已登记音效', /.*/, '按具体角色检索'],
  ];
  const music = [], buckets = groups.map(() => []);
  for (const asset of index.assets) {
    if (!asset.role.startsWith('music-')) {
      buckets[groups.findIndex(([, pattern]) => pattern.test(asset.role))].push(asset);
      continue;
    }
    const meta = asset.musicMetadata || {}, mood = asset.moodAxis || {};
    const segment = {
      'music-explanation-bed':'讲解铺底', 'music-ending-cue':'收束', 'music-reveal-loop':'揭示',
      'music-reveal-bed':'悬念揭晓', 'music-progress-loop':'推进', 'music-tech-progress-bed':'推进',
      'music-loop':'按乐句与口播试听',
    }[asset.role] || asset.role;
    music.push([asset.id, asset.durationSec.toFixed(1)+'s', (mood.valence || '待听')+'/'+(mood.arousal || '待听'),
      meta.instruments?.value?.join('、') || '乐器待听', meta.density?.value || '密度待听', segment, asset.reviewStatus].join(' | '));
  }
  const lines = ['本地声音候选，共 '+index.assets.length+' 项。情绪坐标来自来源标签的初筛，未知项须实听。', '配乐 '+music.length+' 首 · ID | 时长 | 效价/唤醒 | 乐器 | 密度 | 候选段落 | 审核', ...music];
  lines.push('音效 '+buckets.flat().length+' 条 · 按登记角色归组，力度与材质需对照片段试听。');
  buckets.forEach((assets,i) => {
    if (assets.length) lines.push(groups[i][0]+' · '+assets.length+' · '+groups[i][2]+' · '+[assets[0],assets.at(-1)].map(a=>a.id).filter((id,j,ids)=>ids.indexOf(id)===j).join(' / '));
  });
  lines.push('仓库根目录运行 python3 .agents/skills/laohu-motion/scripts/sfx-sources.py local-groups --query 木。将子命令换为 local-search --asset-id <ID> 查看候选，或 source-search --help 查外部来源。');
  return lines.join('\n');
}
