import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const motionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(motionRoot, '../../..');
const wrapper = path.join(motionRoot, 'scripts/laohu-showreel.mjs');

function runRaw(args, cwd = repoRoot) {
  const result = spawnSync(process.execPath, [wrapper, ...args], { cwd, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
  return result;
}

function run(args, cwd = repoRoot) {
  const result = runRaw(args, cwd);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

test('ordinary project input delivers all-source L0, selected Atlas L2, and scaffolds without an old style ID', (t) => {
  const project = path.join(repoRoot, '.cache/tmp', `resource-consumer-${process.pid}`);
  fs.mkdirSync(project, { recursive: true });
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const writeBrief = (direction, textBindings = '') => fs.writeFileSync(path.join(project, 'brief.md'), [
    '<role>', '设计一支面向一般成年人的短篇解释动画。', '</role>',
    '<inputs>', '备份的存储介质可能共同损坏。', '</inputs>',
    '<confirmations>', '本测试使用默认规格与无声导出选择。', '</confirmations>',
    '<direction>', direction, '</direction>',
    '<structure>', '先呈现同盘副本，再呈现分离存放后的故障差异。',
    '<production-units>',
    '| 稳定 ID | 段名 | 开始 | 结束 | 制作说明 | 对应片段 ID | 时间依据 | 讲述与字幕 | 关键设计帧 | 制作职责 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| compare | 同盘与分盘 | 0 | 8 | 同一故障冲击下比较两种存放方式，故障变化后停留到两列可以辨清。 | | 计划 | 无口播 | separate-disks@6 | 动画 |',
    '</production-units>',
    '### [compare] 同盘与分盘',
    '固定俯视图。左半画面两张纸置于同一矩形盘框，右半两张纸各有独立框。先让观众看清两侧都存在两份，再发送同姿态的故障标记。左侧两份随盘框熄灭，右侧一份维持可见，6 秒的 separate-disks 帧校对差别。',
    textBindings, '</structure>',
    '<build>', '按同一时间线实现与检查关键状态。', '</build>',
    '<gotchas>', '示意画面不声称来自真实系统记录。', '</gotchas>',
    '<start>', '先提交关键帧并检查连续动作。', '</start>',
  ].join('\n'));
  writeBrief('用可读的具体形态解释备份位置与共同故障的关系。');

  const overview = JSON.parse(run(['resource-overview', '--scope', 'global-map', '--json']).stdout);
  assert.equal(overview.schema, 'laohu.motion.global-map/1');
  assert.equal(overview.styleCategories.flatMap(group => group.styles).length, 75);
  assert.equal(overview.coverage.motionPromptItems, 240);
  assert.equal(overview.coverage.overlay, 20);
  assert.ok(overview.atlasProductionNote?.includes('示意'));
  assert.equal(overview.atlasFamilies.length, 21);
  assert.equal(overview.coverage.atlasMembers, 504);
  assert.ok(overview.atlasFamilies.every(family => family.mechanism && family.useConditions));
  const styleIds = overview.styleCategories.flatMap(group => group.styles.map(row => row.id)).slice(0, 10);
  const compare = JSON.parse(run(['resource-compare', '--ids', styleIds.join(',')]).stdout);
  assert.equal(compare.memberCount, 10);
  assert.deepEqual(compare.resources.map(row => row.id), styleIds);
  for (const field of ['shape', 'colorLighting', 'typeLayout', 'material', 'composition', 'infoOrganization']) {
    assert.ok(Object.hasOwn(compare.resources[0].appearance, field), `L1 style card must preserve appearance.${field}`);
  }

  const familyId = overview.atlasFamilies[0].id;
  const family = JSON.parse(run(['resource-category', '--source', 'atlas', '--category', familyId]).stdout);
  assert.equal(family.schema, 'laohu.motion.resource-family/1');
  assert.equal(family.memberCount, overview.atlasFamilies[0].memberCount);
  assert.equal(new Set(family.resources.map(item => item.id)).size, family.memberCount);
  const searchId = family.resources[0].id;
  assert.ok(searchId, 'selected Atlas L1 family must expose member IDs');
  const metadata = JSON.parse(run(['resource-get', '--id', searchId]).stdout);
  assert.equal(metadata.id, searchId);
  assert.ok(metadata.producerMarkdown);
  const l2 = JSON.parse(run(['resource-fulltext', '--id', searchId, '--level', 'L2']).stdout);
  assert.equal(l2.id, searchId);
  assert.equal(l2.level, 'L2');
  assert.ok(l2.content.length > 0);

  const l0Output = run(['input-map', project]).stdout;
  const statePath = path.join(project, '.showreel-input-delivery.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.status, 'catalog-delivered');
  assert.ok(state.sources.some(source => source.id === 'global-map'));
  assert.ok(l0Output.includes(familyId));
  assert.ok(l0Output.includes('resource-search --source fonts'));
  assert.match(l0Output, /L0 全局星图/u);
  assert.ok(state.deliveryReceipt.pageCount <= 3);
  assert.ok([...l0Output].length <= 20_000);

  // Zero IDs used to skip all selected-resource L2 checks after the old-75 gate was removed.
  const zeroIds = runRaw(['scaffold', project, '--audio', 'none']);
  assert.notEqual(zeroIds.status, 0);
  assert.match(zeroIds.stderr, /resource-mode: 2.*至少一个.*完整 L2/u);
  assert.equal(fs.existsSync(path.join(project, 'index.html')), false);

  writeBrief(`resource-mode: 2\nresource-use: ${searchId} — 以来源说明的分层方式表现同盘副本与故障传播，仅用于这一段关系解释。`);
  const noL2 = runRaw(['scaffold', project, '--audio', 'none']);
  assert.notEqual(noL2.status, 0);
  assert.match(noL2.stderr, new RegExp(`brief 声明采用 ${searchId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}.*L2 全文尚未完整实际输出`, 'u'));
  assert.equal(fs.existsSync(path.join(project, 'index.html')), false);

  let l2Output = '';
  let candidateState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  let candidateGuard = 0;
  while (candidateState.candidates?.[searchId]?.status !== 'candidate-delivered') {
    assert.ok(candidateGuard++ < 20, 'selected Atlas L2 pages should terminate');
    const page = run(['input-candidate', project, '--id', searchId, ...(candidateGuard > 1 ? ['--next'] : [])]);
    assert.ok(page.stdout.includes(searchId));
    l2Output += page.stdout;
    candidateState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  }
  assert.match(l2Output, new RegExp(searchId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
  const fontId = 'font:noto-sans-sc-variable';
  const font = JSON.parse(run(['resource-get', '--id', fontId, '--text', '同盘副本']).stdout);
  assert.equal(font.availability, 'local-font');
  assert.equal(font.coverage.supported, true);
  const fontBody = JSON.parse(run(['resource-fulltext', '--id', fontId, '--level', 'L2']).stdout);
  const useId = 'type-use:stable-labels';
  const usedResources = [
    `resource-use: ${searchId} — 分层帮助看清共同故障。`,
    `resource-use: ${fontId} — 小尺寸阅读标签。`,
    `resource-use: ${useId} — 同级标签保持可以逐项比较，故障发生时标签与盘框同步变化。`,
    `typeface: label | ${fontId} | 600`,
  ];
  const textBindings = [
    'typeface-use: id=left-label | label',
    '<screen-text-registry>',
    '| ID | 精确原文 | 材料 / cue | 方向 · 画面 · 出现起止 · 完整可读起止 | 对象 · 作用 · 空间 / 动态关系 | 必显 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| left-label | 同盘副本 | 当前技术演示 | 技术夹具 · compare · 出现 0–8 秒 · 完整可读 0–8 秒 | 左列标签｜标记存储关系｜居于左外框上方 | 必显 |',
    '</screen-text-registry>',
  ].join('\n');
  writeBrief([`resource-mode: 1\nprimary-style: ${fontId}`, ...usedResources].join('\n'), textBindings);
  assert.match(runRaw(['scaffold', project, '--audio', 'none']).stderr, /必须用 `primary-style/u,
    'a local font can support a selected style without replacing the primary style');
  writeBrief(['resource-mode: 2', ...usedResources].join('\n'), textBindings);
  for (const id of [fontId, useId]) {
    const unread = runRaw(['scaffold', project, '--audio', 'none']);
    assert.notEqual(unread.status, 0);
    assert.ok(unread.stderr.includes(`brief 声明采用 ${id}，但当前 L2 全文尚未完整实际输出`), unread.stderr);
    for (let pageIndex = 0; candidateState.candidates?.[id]?.status !== 'candidate-delivered'; pageIndex++) {
      assert.ok(pageIndex < 20, 'typography L2 pages should terminate');
      const page = run(['input-candidate', project, '--id', id, ...(pageIndex ? ['--next'] : [])]);
      assert.ok(page.stdout.includes(id));
      candidateState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
  }
  // Method references, fonts and Atlas sources share the original L2 gate.
  run(['scaffold', project, '--audio', 'none']);
  const refreshed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(refreshed.candidates[searchId].fullTextSha256, l2.sha256);
  assert.equal(refreshed.candidates[fontId].fullTextSha256, fontBody.sha256);
  assert.equal(refreshed.candidates[useId].status, 'candidate-delivered');
  const textMap = JSON.parse(fs.readFileSync(path.join(project, '.cache/brief-text-map.json'), 'utf8'));
  assert.equal(textMap.entries[0].typeface, 'label');
  const [face] = textMap.typefaces;
  assert.equal(face.id, fontId);
  assert.equal(face.weight, 600);
  const digest = filename => createHash('sha256').update(fs.readFileSync(path.join(project, filename))).digest('hex');
  assert.equal(digest(face.assetPath), font.file.sha256, 'ordinary scaffold makes the actual bound bytes available to its renderer');
  assert.equal(digest(face.licensePath), font.license.sha256);
  const notice = fs.readFileSync(path.join(project, face.noticePath), 'utf8');
  for (const value of [font.copyright, font.license.path, path.basename(face.licensePath), path.basename(face.assetPath)]) {
    assert.ok(notice.includes(value), `the distributed notice must link the asset and original license to its real attribution: ${value}`);
  }
  assert.equal(path.basename(face.noticePath), `${digest(face.noticePath)}.notice.txt`);
});
