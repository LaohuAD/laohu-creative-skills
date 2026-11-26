import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const evalDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(evalDir, '../../../..');
const wrapper = path.resolve(evalDir, '../scripts/laohu-showreel.mjs');
const validationRoot = path.join(repoRoot, '.cache/tmp/motion-progressive-audit/input-delivery-tests');
const evidenceRoot = path.join(repoRoot, '.cache/validation/motion-root-cause-20261119/map');
const previousEvidenceRoot = path.join(repoRoot, '.cache/validation/motion-progressive-20261117/runtime');
fs.mkdirSync(validationRoot, { recursive: true });

function projectPath(label) {
  return fs.mkdtempSync(path.join(validationRoot, `${label}-`));
}

function run(args, cwd = repoRoot, env = process.env) {
  const result = spawnSync(process.execPath, [wrapper, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

function runWithWrapper(wrapperPath, args, cwd, env = process.env) {
  const result = spawnSync(process.execPath, [wrapperPath, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

function brief(direction = '一张暖色静帧，左侧圆形缓慢移到右侧；motion-probe: not-required; reason: 本夹具只验证静态画幅与输入交付。') {
  return [
    ['role', '技术夹具：验证 Showreel 的目录、候选全文和本地 scaffold 接口。'],
    ['inputs', '本轮规格：1920x1080；使用合成输入，不含口播、音乐或外部媒体。'],
    ['confirmations', '本夹具用于本地技术验证，不作为用户审美确认或正式导出授权。'],
    ['direction', direction],
    ['structure', '一个技术镜头，核对工程规格和渲染入口。画面无文字。\n<screen-text-registry>\n</screen-text-registry>'],
    ['build', '不含音频；产物仅供技术接口检查。'],
    ['gotchas', '固定随机种子；确认项目中的正文标题完整显示。'],
    ['start', '准备 scaffold、输出一张静帧关键帧并检查输入回执。'],
  ].map(([tag, body]) => `<${tag}>\n${body}\n</${tag}>`).join('\n\n') + '\n';
}

function writeBrief(project, direction) {
  fs.writeFileSync(path.join(project, 'brief.md'), brief(direction));
}

function completeTechnicalProductionUnits(project, duration = 8, frameTime = 0.5) {
  const file = path.join(project, 'brief.md');
  const table = [
    '<production-units>',
    '| 稳定 ID | 段名 | 开始 | 结束 | 制作说明 | 对应片段 ID | 时间依据 | 讲述与字幕 | 关键设计帧 | 制作职责 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    `| fixture | 技术镜头 | 0 | ${duration} | 固定视点观察单个对象在测试画幅中的位置变化。 | | 计划 | 无口播 | fixture-frame@${frameTime} | 动画 |`,
    '</production-units>',
    '',
    '### [fixture] 技术镜头',
    `深色底上固定视点，方块从画面中央往右平移。${frameTime} 秒检查前后状态仍可辨；结束时让方块落定。`,
  ].join('\n');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('\n</structure>', `\n${table}\n</structure>`));
}

function writeTechnicalScene(project) {
  fs.writeFileSync(path.join(project, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Technical Fixture · 16:9 Motion Probe</title>
<style>html,body{margin:0;overflow:hidden;background:#101927}canvas{display:block;width:100vw;height:100vh}</style></head>
<body><canvas id="c" width="1920" height="1080"></canvas><script>
const canvas=document.getElementById('c'),ctx=canvas.getContext('2d'),W=1920,H=1080;
window.DUR=1.2;
window.render=t=>{
  const p=Math.max(0,Math.min(1,t/window.DUR));
  ctx.fillStyle='#101927';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(186,206,220,.12)';ctx.lineWidth=1;
  for(let x=80;x<W;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
  for(let y=60;y<H;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  for(let i=0;i<4;i++){
    const cx=690+i*180,depth=1-i*.14,alpha=.44+i*.13;
    ctx.strokeStyle='rgba(67,201,205,'+alpha+')';ctx.lineWidth=12*depth;
    ctx.beginPath();ctx.ellipse(cx,540,92*depth,262*depth,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.strokeStyle='#ed7557';ctx.lineWidth=5;ctx.setLineDash([13,17]);ctx.beginPath();ctx.moveTo(200,540);ctx.lineTo(1660,540);ctx.stroke();ctx.setLineDash([]);
  const x=220+p*1420,y=540+Math.sin(p*Math.PI*2)*38;
  ctx.shadowColor='rgba(255,190,92,.55)';ctx.shadowBlur=28;ctx.fillStyle='#ffbf5a';ctx.beginPath();ctx.arc(x,y,38,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
};
window.render(0);window.READY=true;
</script></body></html>\n`);
}

function readReceipt(project) {
  return JSON.parse(fs.readFileSync(path.join(project, '.showreel-input-delivery.json'), 'utf8'));
}

function writeLegacyReceipt(project, { partial = false } = {}) {
  const receipt = readReceipt(project);
  receipt.pageRecords = receipt.pageRecords.map(({ id, sha256, characters, bytes }) => ({ id, sha256, characters, bytes }));
  const delivered = receipt.pageRecords.slice(0, partial ? -1 : undefined)
    .map(({ id, sha256 }) => ({ id, sha256, deliveredAt: '2026-11-16T00:00:00.000Z' }));
  receipt.deliveredPages = delivered;
  delete receipt.deliverySources;
  if (partial) {
    receipt.status = 'pending';
    receipt.deliveryReceipt = null;
  } else {
    const digestRows = delivered.map(({ id, sha256 }) => ({ id, sha256 }));
    receipt.status = 'catalog-delivered';
    receipt.deliveryReceipt = {
      type: 'catalog-delivered',
      inputFingerprint: receipt.sourceFingerprint,
      pageCount: receipt.pageRecords.length,
      pagesSha256: createHash('sha256').update(JSON.stringify(digestRows)).digest('hex'),
      characters: delivered.reduce((sum, page) => sum + receipt.pageRecords.find(row => row.id === page.id).characters, 0),
      bytes: delivered.reduce((sum, page) => sum + receipt.pageRecords.find(row => row.id === page.id).bytes, 0),
      completedAt: '2026-11-16T00:00:00.000Z',
    };
  }
  fs.writeFileSync(path.join(project, '.showreel-input-delivery.json'), JSON.stringify(receipt, null, 2));
  return receipt;
}

function pngChunk(name, payload) {
  const type = Buffer.from(name, 'ascii');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  const crcInput = Buffer.concat([type, payload]);
  let crc = 0xffffffff;
  for (const byte of crcInput) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([header, type, payload, checksum]);
}

function solidPng(width, height, [red, green, blue]) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    const offset = 1 + x * 3;
    row[offset] = red; row[offset + 1] = green; row[offset + 2] = blue;
  }
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y++) row.copy(raw, y * row.length);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function deliverCatalog(project, target, invoke = run) {
  let receipt = readReceipt(project);
  const output = [];
  for (let index = 0; index < receipt.pageRecords.length; index++) {
    const page = invoke(['input-page', target, '--next']);
    assert.equal(page.status, 0, `${page.stdout}\n${page.stderr}`);
    const text = page.stdout;
    assert.ok([...text].length <= receipt.pageCharacterLimit, `目录页 ${receipt.pageRecords[index].id} 超过字符传输上限`);
    assert.equal(createHash('sha256').update(text).digest('hex'), receipt.pageRecords[index].sha256, `目录页 ${index + 1} 实际输出与回执不符`);
    assert.ok(text.includes(`输入交付页 ${receipt.pageRecords[index].id}`));
    output.push(text);
    receipt = readReceipt(project);
    if (index < receipt.pageRecords.length - 1) {
      assert.equal(receipt.status, 'pending');
      assert.equal(receipt.deliveryReceipt, null);
    } else assert.equal(receipt.status, 'catalog-delivered');
  }
  return { receipt, output: output.join('\n'), pageOutputs: output };
}

function deliverCandidate(project, target, id, invoke = run) {
  const output = [];
  let record;
  for (let index = 0; ; index++) {
    const result = invoke(['input-candidate', target, '--id', id, ...(index ? ['--next'] : [])]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const text = result.stdout;
    assert.ok([...text].length <= readReceipt(project).pageCharacterLimit, `候选 ${id} 正文页超过字符传输上限`);
    output.push(text);
    const state = readReceipt(project);
    record = state.candidates[id];
    assert.ok(record, `没有为 ${id} 写入候选全文回执`);
    assert.equal(createHash('sha256').update(text).digest('hex'), record.pageRecords[index].sha256, `候选 ${id} 第 ${index + 1} 页实际输出与回执不符`);
    assert.equal(record.deliveredPages.length, index + 1);
    if (record.status === 'candidate-delivered') break;
    assert.equal(record.status, 'pending');
  }
  return { record, output: output.join('\n'), pageOutputs: output };
}

function copyFileToMirror(relativePath, mirrorRoot) {
  const source = path.join(repoRoot, relativePath);
  const destination = path.join(mirrorRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function createRuntimeMirror(mirrorRoot) {
  for (const relativePath of [
    '.agents/skills/laohu-motion/scripts/laohu-showreel.mjs',
    '.agents/skills/laohu-motion/scripts/laohu-styles.py',
    '.agents/skills/laohu-motion/scripts/screen-text-contract.mjs',
    '.agents/skills/laohu-motion/scripts/screen-text-registry.mjs',
    '.agents/skills/laohu-asrcut/scripts/caption-manifest.mjs',
    '.agents/skills/laohu-motion/scripts/brief-typefaces.mjs',
    '.agents/skills/laohu-motion/scripts/brief-production-units.mjs',
    '.agents/skills/laohu-motion/scripts/showreel-project-phase.mjs',
    '.agents/skills/laohu-motion/scripts/showreel-review-audio.mjs',
    '.agents/skills/laohu-motion/scripts/showreel-three.mjs',
    '.agents/skills/laohu-motion/scripts/showreel-webgl.mjs',
    '.agents/skills/laohu-motion/templates/runtime/vendor-lock/package.json',
    '.agents/skills/laohu-motion/templates/runtime/vendor-lock/package-lock.json',
    '.agents/skills/laohu-motion/assets/typography/fonts.json',
    '.agents/skills/laohu-motion/assets/typography/uses.json',
    '.agents/skills/laohu-motion/SKILL.md',
    '.agents/skills/laohu-motion/references/motion-language.md',
    '.agents/skills/laohu-motion/references/production-collaboration.md',
    '.agents/skills/laohu-motion/references/typography-and-legibility.md',
    '.agents/skills/laohu-motion/references/showreel-runtime.md',
    '.agents/skills/laohu-motion/references/showreel-sound.md',
    '.agents/skills/laohu-writing/references/screen-text.md',
    '.agents/skills/laohu-analysis/SKILL.md',
    '.agents/skills/laohu-motion/references/pre-analysis.md',
    '.agents/skills/laohu-motion/references/direction-and-brief.md',
    '.agents/skills/laohu-motion/templates/catalog.json',
  ]) copyFileToMirror(relativePath, mirrorRoot);
  const localMotionIndex = '.agents/skills/laohu-motion/assets/motion-library/openmotion/catalog.json';
  if (fs.existsSync(path.join(repoRoot, localMotionIndex))) copyFileToMirror(localMotionIndex, mirrorRoot);
  for (const relativePath of [
    '.agents/skills/laohu-motion/templates/runtime/laohu-showreel',
    '.agents/skills/laohu-motion/templates/runtime/native-presentation',
    '.agents/skills/laohu-motion/templates/styles',
  ]) {
    const source = path.join(repoRoot, relativePath);
    const destination = path.join(mirrorRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true, dereference: true });
  }
}

test('doctor reports setup state without calling the runtime ready', t => {
  const workRoot = projectPath('doctor-first');
  t.after(() => fs.rmSync(workRoot, { recursive: true, force: true }));
  const result = run(['doctor'], workRoot);
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /node \d+.*need 18\+/);
  assert.match(result.stdout, /\[ok\] ffmpeg/);
  assert.match(result.stdout, /\[ok\] ffprobe/);
  assert.match(result.stdout, /work-root cache and TMP paths resolve to the same mounted volume/);
  assert.match(result.stdout, /\[not ready\] pinned runtime dependencies are not installed/);
  assert.match(result.stdout, /Next: .*laohu-showreel\.mjs' setup/);
  assert.equal(result.stdout.includes('\nready\n'), false);
  const cacheRoot = path.join(workRoot, '.cache/laohu-showreel/runtime');
  assert.ok(fs.existsSync(cacheRoot));
  assert.equal(fs.readdirSync(cacheRoot).some(name => fs.existsSync(path.join(cacheRoot, name, 'node_modules'))), false);
});

test('new project records a fresh 16:9 default and adapts only the local brief', t => {
  const project = projectPath('new-default');
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const target = path.relative(repoRoot, project);
  const prepared = run(['input-prepare', target]);
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  const receipt = readReceipt(project);
  assert.deepEqual(
    { size: receipt.currentSpec.size, fps: receipt.currentSpec.fps, source: receipt.currentSpec.source, mode: receipt.mode },
    { size: '1920x1080', fps: 30, source: 'default-16:9', mode: 'new-project' },
  );
  const localBrief = fs.readFileSync(path.join(project, 'brief.md'), 'utf8');
  const protectedBrief = fs.readFileSync(path.join(repoRoot, '.agents/skills/laohu-motion/templates/runtime/laohu-showreel/references/brief-template.md'), 'utf8');
  assert.notEqual(localBrief, protectedBrief);
  assert.match(localBrief, /本轮画幅与像素规格：1920x1080/);
  assert.match(localBrief, /制作工作台：默认在同一项目显示真实进度和可复查成果/);
  assert.match(localBrief, /启动服务后主动打开并核验浏览器/);
  assert.match(localBrief, /正式制作前等待用户针对当前方向关键帧作明确确认/);
});

test('full redesign ignores prior portrait settings unless this turn explicitly resumes or inherits them', t => {
  const project = projectPath('redesign-spec');
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const target = path.relative(repoRoot, project);
  fs.writeFileSync(path.join(project, 'render.mjs'), '// existing renderer fixture\n');
  fs.writeFileSync(path.join(project, 'editor.json'), JSON.stringify({ size: '1080x1920', fps: 24 }));
  fs.writeFileSync(path.join(project, 'brief.md'), '<inputs>旧 brief 遗留规格 1080x1920</inputs>\n');
  const partialRoute = run(['input-prepare', target]);
  assert.notEqual(partialRoute.status, 0);
  assert.match(partialRoute.stderr, /明确的全新重做/);

  const declared = run(['input-prepare', target, '--full-redesign', '--spec', '1080x1920', '--spec-source', 'explicit-user', '--spec-evidence-text', '用户在本轮明确要求竖屏，分辨率1080x1920']);
  assert.equal(declared.status, 0, `${declared.stdout}\n${declared.stderr}`);
  assert.equal(readReceipt(project).currentSpec.size, '1080x1920');
  const resumed = run(['input-prepare', target, '--full-redesign', '--resume']);
  assert.equal(resumed.status, 0, `${resumed.stdout}\n${resumed.stderr}`);
  assert.equal(readReceipt(project).currentSpec.size, '1080x1920');
  const redesigned = run(['input-prepare', target, '--full-redesign']);
  assert.equal(redesigned.status, 0, `${redesigned.stdout}\n${redesigned.stderr}`);
  assert.deepEqual(
    { size: readReceipt(project).currentSpec.size, source: readReceipt(project).currentSpec.source, mode: readReceipt(project).mode },
    { size: '1920x1080', source: 'default-16:9', mode: 'full-redesign' },
  );
});

test('one input-map emits every L0 page before selected candidate bodies', t => {
  const project = projectPath('progressive');
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const target = path.relative(repoRoot, project);
  const result = run(['input-map', target]);
  assert.equal(result.status, 0, result.stderr);
  let receipt = readReceipt(project);
  const styleIndex = JSON.parse(fs.readFileSync(path.join(repoRoot, '.agents/skills/laohu-motion/templates/styles/index.json'), 'utf8'));
  const authoringTemplate = fs.readFileSync(path.join(project, 'brief.md'), 'utf8');
  assert.match(authoringTemplate, /<structure>[\s\S]*?<production-units>\n\| 稳定 ID.*时间依据 \| 讲述与字幕 \| 关键设计帧 \| 制作职责 \|/u);
  assert.match(authoringTemplate, /### \[段ID\] 段名/u);
  assert.deepEqual(receipt.sources.map(source => source.id), ['formal-style-index', 'global-map']);
  assert.deepEqual(receipt.totals.fixed, { characters: 0, bytes: 0 });
  const indexSource = receipt.sources.find(source => source.id === 'formal-style-index');
  assert.equal(indexSource.sha256, createHash('sha256').update(fs.readFileSync(path.join(repoRoot, '.agents/skills/laohu-motion/templates/styles/index.json'))).digest('hex'));

  const output = result.stdout;
  const pageOutputs = output.split(/(?=^输入交付页 p-[a-f0-9]{16}$)/mu).filter(Boolean);
  const delivered = { output, pageOutputs };
  assert.equal(receipt.status, 'catalog-delivered');
  assert.equal(receipt.deliveredPages.length, receipt.pageRecords.length);
  assert.equal(receipt.deliveryReceipt.emittedPageCount, pageOutputs.length);
  assert.equal(receipt.deliveryReceipt.sourceReusedPageCount, 0);
  assert.ok(pageOutputs.length >= 1 && pageOutputs.length <= 3);
  for (let index = 0; index < pageOutputs.length; index++) {
    assert.equal(createHash('sha256').update(pageOutputs[index]).digest('hex'), receipt.pageRecords[index].sha256);
  }
  const totalCharacters = [...output].length;
  const totalBytes = Buffer.byteLength(output);
  const pageLengths = pageOutputs.map(page => [...page].length);
  assert.ok(totalCharacters <= 20_000);
  assert.equal(receipt.deliveryReceipt.characters, totalCharacters);
  assert.equal(receipt.deliveryReceipt.bytes, totalBytes);
  for (const entry of styleIndex.entries) assert.ok(output.includes(`${entry.id} |`), `目录中缺少 ${entry.id}`);
  assert.match(output, /Atlas（21 个家族，504 项）/u);
  assert.match(output, /Motion Prompt（240 项）/u);
  assert.match(output, /共同动作语言/u);
  assert.doesNotMatch(output, /固定项目材料|先验证几何节奏，再加表面质感/u);

  writeBrief(project);
  const noCandidate = run(['scaffold', target, '--audio', 'none']);
  assert.notEqual(noCandidate.status, 0);
  assert.match(noCandidate.stderr, /resource-mode: 2.*至少一个.*完整 L2/u);
  assert.match(noCandidate.stderr, /input-candidate/);
  assert.equal(fs.existsSync(path.join(project, 'index.html')), false);

  writeBrief(project, [
    'resource-mode: 1',
    'primary-style: original:art-deco',
    'resource-selection-quote: “这次主风格选用装饰艺术的几何构成。”',
    'resource-use: original:art-deco — 用清晰几何秩序建立段落主视觉，并承接本片的主要对象关系。',
    'resource-use: new:caption-news — 使用该项的阅读层级组织长标题与解释句，不改主风格身份。',
  ].join('\n'));
  const selectedButUnread = run(['scaffold', target, '--audio', 'none']);
  assert.notEqual(selectedButUnread.status, 0);
  assert.match(selectedButUnread.stderr, /brief 声明采用 original:art-deco.*L2 全文尚未完整实际输出/);
  assert.equal(fs.existsSync(path.join(project, 'index.html')), false);

  const first = deliverCandidate(project, target, 'original:art-deco');
  assert.equal(first.record.status, 'candidate-delivered');
  assert.ok(first.output.includes('先验证几何节奏，再加表面质感'), '所选候选回执必须对应实际全文输出');
  const firstFingerprint = first.record.fingerprint;
  const firstDeliveryReceipt = structuredClone(readReceipt(project).candidates['original:art-deco'].deliveryReceipt);
  const secondaryUnread = run(['scaffold', target, '--audio', 'none']);
  assert.notEqual(secondaryUnread.status, 0);
  assert.match(secondaryUnread.stderr, /brief 声明采用 new:caption-news.*L2 全文尚未完整实际输出/);
  const extraLocalResource = deliverCandidate(project, target, 'new:caption-news');
  assert.equal(extraLocalResource.record.status, 'candidate-delivered', '单一主风格下允许另用局部文字/动作资源，且同样读完整 L2');
  const withoutProductionUnits = run(['scaffold', target, '--audio', 'none']);
  assert.notEqual(withoutProductionUnits.status, 0);
  assert.match(withoutProductionUnits.stderr, /十列.*production-units/u);
  assert.equal(fs.existsSync(path.join(project, 'index.html')), false);
  completeTechnicalProductionUnits(project);
  const singleStyleScaffold = run(['scaffold', target, '--audio', 'none']);
  assert.equal(singleStyleScaffold.status, 0, `${singleStyleScaffold.stdout}\n${singleStyleScaffold.stderr}`);
  assert.match(singleStyleScaffold.stdout, /工程脚手架已创建/);
  assert.match(singleStyleScaffold.stdout, /代码方向探索帧.* --still /u);
  assert.match(singleStyleScaffold.stdout, /服务启动后请实际打开浏览器核验/);
  assert.equal(readReceipt(project).productionUnitsRequired, true);
  assert.doesNotMatch(singleStyleScaffold.stdout, /Open the workspace first/u);
  const firstPageId = first.record.pageRecords[0].id;
  const firstReplay = run(['input-candidate', target, '--id', 'original:art-deco', '--page-id', firstPageId]);
  assert.equal(firstReplay.status, 0, `${firstReplay.stdout}\n${firstReplay.stderr}`);
  assert.equal(createHash('sha256').update(firstReplay.stdout).digest('hex'), first.record.pageRecords[0].sha256);
  assert.equal(firstReplay.stdout, first.pageOutputs[0]);
  assert.match(firstReplay.stderr, /已重放候选 original:art-deco 正文页/);
  let afterCandidateReplay = readReceipt(project).candidates['original:art-deco'];
  assert.equal(afterCandidateReplay.status, 'candidate-delivered');
  assert.deepEqual(afterCandidateReplay.deliveryReceipt, firstDeliveryReceipt, 'replay output must not rewrite the original full-candidate receipt');
  assert.equal(afterCandidateReplay.candidateReplays.length, 1);
  assert.equal(afterCandidateReplay.candidateReplays[0].pageId, firstPageId);
  assert.match(afterCandidateReplay.candidateReplays[0].wrapperSha256, /^[a-f0-9]{64}$/u);
  const stalePage = run(['input-candidate', target, '--id', 'original:art-deco', '--page-id', '9999']);
  assert.notEqual(stalePage.status, 0);
  assert.match(stalePage.stderr, /没有 page-id 9999/u);
  assert.equal(readReceipt(project).candidates['original:art-deco'].candidateReplays.length, 1);

  const second = deliverCandidate(project, target, 'new:halftone-dossier');
  assert.equal(second.record.status, 'candidate-delivered');
  assert.equal(second.record.pageRecords.length, 2);
  const secondPageId = second.record.pageRecords.at(-1).id;
  const secondReplay = run(['input-candidate', target, '--id', 'new:halftone-dossier', '--page-id', secondPageId]);
  assert.equal(secondReplay.status, 0, `${secondReplay.stdout}\n${secondReplay.stderr}`);
  assert.equal(createHash('sha256').update(secondReplay.stdout).digest('hex'), second.record.pageRecords.at(-1).sha256);
  assert.equal(secondReplay.stdout, second.pageOutputs.at(-1), 'the requested later page must be emitted, not just a receipt');
  afterCandidateReplay = readReceipt(project).candidates['new:halftone-dossier'];
  assert.equal(afterCandidateReplay.status, 'candidate-delivered');
  assert.equal(afterCandidateReplay.candidateReplays[0].pageId, secondPageId);
  assert.equal(afterCandidateReplay.deliveryReceipt.pageCount, 2);
  receipt = readReceipt(project);
  assert.equal(receipt.candidates['original:art-deco'].status, 'candidate-delivered', '扩读另一张候选不应清空已读卡的独立回执');
  assert.equal(receipt.candidates['original:art-deco'].fingerprint, firstFingerprint);

  const legacyMandatoryFullText = styleIndex.entries.reduce((totals, row) => {
    const bytes = fs.readFileSync(path.join(repoRoot, row.translationSourcePath));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.translationSourceSha256, `完整正文源哈希失配：${row.id}`);
    return { cardCount: totals.cardCount + 1, characters: totals.characters + [...bytes.toString('utf8').replace(/^\uFEFF/u, '')].length, bytes: totals.bytes + bytes.length };
  }, { cardCount: 0, characters: 0, bytes: 0 });

  const metric = {
    format: 'laohu.motion.progressive-input-delivery-measurements/1',
    evidenceClass: 'BEHAVIOR',
    measuredBy: 'actual stdout bytes captured from laohu-showreel.mjs subprocesses; Unicode code points and UTF-8 bytes, not model tokens',
    fixedDocuments: receipt.totals.fixed,
    combinedInputDelivery: {
      invocations: 1,
      pageCount: receipt.deliveryReceipt.pageCount,
      emittedPageCount: receipt.deliveryReceipt.emittedPageCount,
      sourceReusedPageCount: receipt.deliveryReceipt.sourceReusedPageCount,
      pageCharacterLimit: receipt.pageCharacterLimit,
      pageLimitUnit: 'Unicode code points, not model tokens',
      averagePageCharacters: Math.round(totalCharacters / pageLengths.length),
      maximumPageCharacters: Math.max(...pageLengths),
      characters: totalCharacters,
      bytes: totalBytes,
      sha256: createHash('sha256').update(delivered.pageOutputs.join('')).digest('hex'),
    },
    packagingOverhead: {
      characters: totalCharacters - receipt.totals.fixed.characters - receipt.totals.catalog.characters,
      bytes: totalBytes - receipt.totals.fixed.bytes - receipt.totals.catalog.bytes,
      explanation: 'captured map output minus its directory body; includes page wrappers',
    },
    inputContent: {
      fixedDocuments: receipt.totals.fixed,
      globalMap: receipt.totals.catalog,
      legacyMandatoryFullText: {
        ...legacyMandatoryFullText,
        measurement: 'raw local source bodies for all formal cards; excludes page headings/wrappers and is not a measured historical stdout total',
      },
    },
    selectedCandidate: {
      id: 'original:art-deco',
      pageCount: first.record.deliveryReceipt.pageCount,
      deliveredCharacters: first.pageOutputs.reduce((sum, page) => sum + [...page].length, 0),
      deliveredBytes: first.pageOutputs.reduce((sum, page) => sum + Buffer.byteLength(page), 0),
      bodyCharacters: first.record.fullTextCharacters,
      bodyBytes: first.record.fullTextBytes,
      bodySha256: first.record.fullTextSha256,
    },
    expandedCandidate: {
      id: 'new:halftone-dossier',
      pageCount: second.record.deliveryReceipt.pageCount,
      deliveredCharacters: second.pageOutputs.reduce((sum, page) => sum + [...page].length, 0),
      deliveredBytes: second.pageOutputs.reduce((sum, page) => sum + Buffer.byteLength(page), 0),
      bodyCharacters: second.record.fullTextCharacters,
      bodyBytes: second.record.fullTextBytes,
      bodySha256: second.record.fullTextSha256,
    },
    catalogBinding: receipt.catalogBinding,
    formalStyleIndexSha256: receipt.styleIndexSha256,
  };
  const measurementPath = path.join(evidenceRoot, 'input-delivery-measurements.json');
  let previousMetric = null;
  try { previousMetric = JSON.parse(fs.readFileSync(path.join(previousEvidenceRoot, 'input-delivery-measurements.json'), 'utf8')); } catch {}
  const before = previousMetric?.catalogCompactionComparison?.before ? { ...previousMetric.catalogCompactionComparison.before } : (previousMetric ? {
    pageCount: previousMetric.combinedInputDelivery?.pageCount ?? null,
    fixedCharacters: previousMetric.inputContent?.fixedDocuments?.characters ?? previousMetric.fixedDocuments?.characters ?? null,
    catalogCharacters: previousMetric.inputContent?.richDirectory?.characters ?? null,
    totalOutputCharacters: previousMetric.combinedInputDelivery?.characters ?? null,
    packagingOverheadCharacters: previousMetric.packagingOverhead?.characters
      ?? (previousMetric.combinedInputDelivery?.characters !== undefined
        && (previousMetric.inputContent?.fixedDocuments?.characters ?? previousMetric.fixedDocuments?.characters) !== undefined
        && previousMetric.inputContent?.richDirectory?.characters !== undefined
        ? previousMetric.combinedInputDelivery.characters
          - (previousMetric.inputContent?.fixedDocuments?.characters ?? previousMetric.fixedDocuments?.characters)
          - previousMetric.inputContent.richDirectory.characters
        : null),
  } : null);
  if (before?.packagingOverheadCharacters === null && Number.isFinite(before.totalOutputCharacters)
    && Number.isFinite(before.fixedCharacters) && Number.isFinite(before.catalogCharacters)) {
    before.packagingOverheadCharacters = before.totalOutputCharacters - before.fixedCharacters - before.catalogCharacters;
  }
  const after = {
    pageCount: metric.combinedInputDelivery.pageCount,
    fixedCharacters: metric.inputContent.fixedDocuments.characters,
    catalogCharacters: metric.inputContent.globalMap.characters,
    totalOutputCharacters: metric.combinedInputDelivery.characters,
    packagingOverheadCharacters: metric.packagingOverhead.characters,
  };
  metric.catalogCompactionComparison = { measuredBy: 'actual captured wrapper stdout; character and byte differences are not token differences', before, after,
    savedCatalogCharacters: before?.catalogCharacters === null || before?.catalogCharacters === undefined ? null : before.catalogCharacters - after.catalogCharacters,
    savedOutputCharacters: before?.totalOutputCharacters === null || before?.totalOutputCharacters === undefined ? null : before.totalOutputCharacters - after.totalOutputCharacters };
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(measurementPath, `${JSON.stringify(metric, null, 2)}\n`);

  assert.ok(fs.existsSync(path.join(project, 'index.html')), '前面的 singleStyleScaffold 已成功创建新工程；此处复用该工程继续测试动态探索，不重复脚手架创建。');
  assert.ok(fs.existsSync(path.join(project, 'index.html')));
  assert.ok(fs.existsSync(path.join(project, 'build.sh')));
  writeTechnicalScene(project);
  fs.writeFileSync(path.join(project, 'brief.md'), brief('motion-probe: required; reason: 核验门打开时镜头穿过空间的连续运动是否可读。\nresource-use: original:art-deco — 只作为技术夹具输入，不视为审美范例。'));
  completeTechnicalProductionUnits(project, 1.2);
  const still = run(['render', target, '--text-direction', '技术方向', '--still', '0.5', '--purpose', '验证方向关键帧探索能真实渲染。']);
  assert.equal(still.status, 0, `${still.stdout}\n${still.stderr}`);
  assert.match(still.stdout, /已生成 1 张草稿探索帧/u);
  const exploration = readReceipt(project).explorations.at(-1);
  assert.equal(exploration.kind, 'still-or-directions');
  assert.equal(exploration.draft, true);
  assert.equal(exploration.fullProduction, false);
  const stillFile = path.join(project, exploration.artifacts[0].path);
  const stillBytes = fs.readFileSync(stillFile);
  assert.equal(createHash('sha256').update(stillBytes).digest('hex'), exploration.artifacts[0].sha256);
  assert.deepEqual({ width: stillBytes.readUInt32BE(16), height: stillBytes.readUInt32BE(20) }, { width: 1920, height: 1080 });
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'static-exploration-behavior.json'), `${JSON.stringify({
    format: 'laohu.motion.static-exploration-behavior/1',
    evidenceClass: 'BEHAVIOR',
    route: 'actual laohu-showreel.mjs render subprocess with --still',
    purpose: '验证方向关键帧探索能真实渲染。',
    draft: exploration.draft,
    fullProduction: exploration.fullProduction,
    artifact: { path: exploration.artifacts[0].path, sha256: exploration.artifacts[0].sha256, bytes: exploration.artifacts[0].bytes, width: exploration.artifacts[0].width, height: exploration.artifacts[0].height },
    result: 'PASS',
  }, null, 2)}\n`);

  const keyframeStage = run(['progress', target, '--stage', 'style', '--preview', exploration.artifacts[0].path,
    '--frame-source', 'code', '--frame-event', 'fixture-frame', '--frame-at', '0.5', '--reopen', '--message', '技术夹具：发布官方 render --still 生成的 16:9 关键帧。']);
  assert.equal(keyframeStage.status, 0, `${keyframeStage.stdout}\n${keyframeStage.stderr}`);
  const prematureConfirm = run(['progress', target, '--stage', 'style', '--confirm', '--selected-style', 'original:art-deco',
    '--evidence-text', '本地测试夹具模拟对话声明，不是实际用户确认。',
    '--scope', '验证 required-motion-probe 在没有可回放小样时会阻止风格确认。']);
  assert.notEqual(prematureConfirm.status, 0);
  assert.match(prematureConfirm.stderr, /motion-probe required/u);

  const probe = run(['probe', target, '--text-direction', '技术方向', '--start', '0', '--duration', '1', '--selection', 's01:0-1', '--purpose', '验证镜头穿过连续空间的动作是否清楚。']);
  assert.equal(probe.status, 0, `${probe.stdout}\n${probe.stderr}`);
  assert.match(probe.stdout, /已生成 1 秒动态草稿/u);
  const probeRecord = readReceipt(project).explorations.at(-1);
  assert.equal(probeRecord.kind, 'bounded-dynamic-probe');
  assert.equal(probeRecord.draft, true);
  assert.equal(probeRecord.fullProduction, false);
  assert.equal(probeRecord.duration, 1);
  const probeMp4 = path.join(project, probeRecord.mp4.path);
  const probeWebp = path.join(project, probeRecord.previewWebp.path);
  assert.equal(createHash('sha256').update(fs.readFileSync(probeMp4)).digest('hex'), probeRecord.mp4.sha256);
  assert.equal(createHash('sha256').update(fs.readFileSync(probeWebp)).digest('hex'), probeRecord.previewWebp.sha256);
  const mp4Info = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json', probeMp4], { encoding: 'utf8' });
  assert.equal(mp4Info.status, 0, mp4Info.stderr);
  const mp4Stream = JSON.parse(mp4Info.stdout).streams[0];
  assert.deepEqual({ width: mp4Stream.width, height: mp4Stream.height, frames: Number(mp4Stream.nb_read_frames) }, { width: 1920, height: 1080, frames: 30 });
  const webpInfo = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json', probeWebp], { encoding: 'utf8' });
  assert.equal(webpInfo.status, 0, webpInfo.stderr);
  const webpStream = JSON.parse(webpInfo.stdout).streams[0];
  assert.equal(webpStream.width, 640);
  assert.ok(Number(webpStream.nb_read_frames) >= 2, 'preview must be an animated WebP, not a still frame');

  const webpStage = run(['progress', target, '--stage', 'style', '--preview', probeRecord.previewWebp.path, '--message', '技术夹具：发布与关键帧同轮绑定的动态 WebP 草稿。']);
  assert.equal(webpStage.status, 0, `${webpStage.stdout}\n${webpStage.stderr}`);
  const playableProbe = run(['progress', target, '--stage', 'scenes', '--publish', '.', '--draft-probe', '--text-direction', '技术方向', '--duration', '1.2',
    '--selection', 's01:0-1.2', '--purpose', '检查门户开启后小球穿越空间的连续轨迹。']);
  assert.equal(playableProbe.status, 0, `${playableProbe.stdout}\n${playableProbe.stderr}`);
  assert.match(playableProbe.stdout, /技术动态草稿快照/u);
  const projectProbeRecord = readReceipt(project).explorations.at(-1);
  assert.equal(projectProbeRecord.kind, 'bounded-playable-project-probe');
  assert.equal(projectProbeRecord.draft, true);
  assert.equal(projectProbeRecord.fullProduction, false);
  assert.equal(projectProbeRecord.duration, 1.2);
  assert.match(projectProbeRecord.projectTreeSha256, /^[a-f0-9]{64}$/u);
  const styleConfirm = run(['progress', target, '--stage', 'style', '--confirm', '--selected-style', 'original:art-deco',
    '--evidence-text', '本地测试夹具模拟对话声明，不是实际用户确认。',
    '--scope', '确认技术夹具当前关键帧、动态小样、候选和 1920x1080 规格绑定。']);
  assert.equal(styleConfirm.status, 0, `${styleConfirm.stdout}\n${styleConfirm.stderr}`);
  const styleConfirmation = readReceipt(project).confirmations.style;
  assert.match(styleConfirmation.designHash, /^[a-f0-9]{64}$/u);
  assert.equal(styleConfirmation.motionProbeArtifactSet.designHash, probeRecord.designHash);
  assert.equal(styleConfirmation.motionProbeArtifactSet.artifacts[0].mp4Sha256, probeRecord.mp4.sha256);
  assert.equal(styleConfirmation.motionProbeArtifactSet.artifacts[0].previewSha256, probeRecord.previewWebp.sha256);
  assert.ok(styleConfirmation.motionProbeArtifactSet.artifacts.some(item => item.previewType === 'playable-project-snapshot'
    && item.previewId === projectProbeRecord.previewId && item.projectTreeSha256 === projectProbeRecord.projectTreeSha256));

  const scenesPublish = run(['progress', target, '--stage', 'scenes', '--publish', '.', '--text-direction', '技术方向', '--duration', '1.2', '--message', '技术夹具：同一短镜头可播放快照。']);
  assert.equal(scenesPublish.status, 0, `${scenesPublish.stdout}\n${scenesPublish.stderr}`);
  const progressState = JSON.parse(fs.readFileSync(path.join(project, '.showreel-progress/status.json'), 'utf8'));
  assert.equal(progressState.preview.stage, 'scenes');
  assert.equal(progressState.preview.final, false);
  assert.ok(fs.existsSync(path.join(project, progressState.preview.directory, 'index.html')));

  const stagedWebp = path.join(project, '.showreel-progress/artifacts', `${probeRecord.previewWebp.sha256}.webp`);
  fs.appendFileSync(stagedWebp, Buffer.from([0]));
  const changedProbe = run(['progress', target, '--stage', 'scenes', '--publish', '.', '--text-direction', '技术方向', '--duration', '1.2', '--message', '该次发布应因动态小样哈希改变而停止。']);
  assert.notEqual(changedProbe.status, 0);
  assert.match(changedProbe.stderr, /动态小样|旧确认不再适用/u);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, '.showreel-progress/status.json'), 'utf8')).preview, progressState.preview);

  fs.writeFileSync(path.join(evidenceRoot, 'dynamic-probe-behavior.json'), `${JSON.stringify({
    format: 'laohu.motion.dynamic-probe-behavior/1',
    evidenceClass: 'BEHAVIOR',
    route: 'actual wrapper probe subprocess → MP4 → animated WebP artifact and bounded playable scenes snapshot → style declaration → scenes snapshot',
    fixture: 'technical fixture; simulated CLI evidence is not real user confirmation or identity authentication',
    specification: readReceipt(project).currentSpec,
    mp4: { path: probeRecord.mp4.path, sha256: probeRecord.mp4.sha256, bytes: probeRecord.mp4.bytes, width: mp4Stream.width, height: mp4Stream.height, frames: Number(mp4Stream.nb_read_frames) },
    webp: { path: probeRecord.previewWebp.path, sha256: probeRecord.previewWebp.sha256, bytes: probeRecord.previewWebp.bytes, width: webpStream.width, height: webpStream.height, frames: Number(webpStream.nb_read_frames) },
    designHash: probeRecord.designHash,
    confirmationDesignHash: styleConfirmation.designHash,
    motionProbeArtifactSet: styleConfirmation.motionProbeArtifactSet,
    scenesSnapshot: { stage: progressState.preview.stage, final: progressState.preview.final, directory: progressState.preview.directory },
    changedWebpStopsReconfirmation: changedProbe.status !== 0,
    result: 'PASS',
  }, null, 2)}\n`);
});

test('Benchmark mode records a real local source and still requires a production L2 resource', t => {
  const project = projectPath('benchmark-source-gate');
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const target = path.relative(repoRoot, project);
  assert.equal(run(['input-prepare', target]).status, 0);
  deliverCatalog(project, target);

  const sourceId = 'SRC-0123456789ABCDEF';
  const sourcePath = path.join(project, 'benchmark', 'sources', `${sourceId}.json`);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  const source = {
    schema_version: 1,
    source_id: sourceId,
    identity: { title: '本地测试动画来源', creator: '技术夹具', medium: 'video', version: 'fixture-1' },
    provenance: { identity_basis: '本地测试来源记录', locator: 'fixture.mp4 00:00–00:10', access_scope: '技术测试夹具' },
    source_material: { reference_kind: 'media-source', reference: 'fixture.mp4', version: 'fixture-1', read_scope: '00:00–00:10', content_sha256: 'a'.repeat(64) },
    evidence_status: 'context-readable',
  };
  fs.writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
  const sourceSha256 = createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  const sourceLines = [
    'resource-mode: 3',
    'styleframe-source: cover',
    'benchmark-selection-quote: “请把我指定的动画片段作为这次作品的对标。”',
    `benchmark-source: ${sourceId} | path=benchmark/sources/${sourceId}.json | sha256=${sourceSha256}`,
    `benchmark-use: ${sourceId} — 借用其分层揭示方式处理本片的对象关系变化。`,
  ];
  writeBrief(project, sourceLines.join('\n'));
  const benchmarkOnly = run(['scaffold', target, '--audio', 'none']);
  assert.notEqual(benchmarkOnly.status, 0);
  assert.match(benchmarkOnly.stderr, /Benchmark 对标的研究来源不自动成为生产资源/u);
  assert.equal(fs.existsSync(path.join(project, 'index.html')), false);

  writeBrief(project, [
    ...sourceLines,
    'resource-use: new:caption-news — 采用分层图文关系表现本片的状态变化，不继承原示例的题材或整套排版。',
  ].join('\n'));
  const candidate = deliverCandidate(project, target, 'new:caption-news');
  assert.equal(candidate.record.status, 'candidate-delivered');
  completeTechnicalProductionUnits(project);
  const scaffold = run(['scaffold', target, '--audio', 'none']);
  assert.equal(scaffold.status, 0, `${scaffold.stdout}\n${scaffold.stderr}`);
  assert.match(scaffold.stdout, /Cover 设计目标图.*--frame-source cover.*--frame-event/u);
  assert.doesNotMatch(scaffold.stdout, /代码方向探索帧/u);
  assert.match(scaffold.stdout, /工程脚手架已创建/);
});

test('original-only is available only with a source-located explicit user request', t => {
  const project = projectPath('explicit-original-only');
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const target = path.relative(repoRoot, project);
  assert.equal(run(['input-prepare', target]).status, 0);
  deliverCatalog(project, target);

  writeBrief(project, [
    'resource-mode: original-only',
    'original-only-user-request: “请不要参考风格库或 Benchmark 来源，本片从锁定事实出发做原创表达。”',
  ].join('\n'));
  completeTechnicalProductionUnits(project);
  const scaffold = run(['scaffold', target, '--audio', 'none']);
  assert.equal(scaffold.status, 0, `${scaffold.stdout}\n${scaffold.stderr}`);
  assert.match(scaffold.stdout, /工程脚手架已创建/);
});

test('stable page IDs replay exact output and a configured character ceiling covers directory and candidate pages', t => {
  const project = projectPath('page-replay-low-limit');
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const target = path.relative(repoRoot, project);
  const prepared = run(['input-prepare', target, '--page-characters', '4000']);
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  assert.match(prepared.stdout, /4000 个 Unicode 字符/);
  assert.match(prepared.stdout, /4000 个 Unicode 字符/);
  assert.equal(readReceipt(project).pageCharacterLimit, 4000);

  const delivered = deliverCatalog(project, target);
  const selectedPage = delivered.receipt.pageRecords[0];
  const replay = run(['input-page', target, '--id', selectedPage.id]);
  assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`);
  assert.equal(createHash('sha256').update(replay.stdout).digest('hex'), selectedPage.sha256);
  assert.ok([...replay.stdout].length <= 4000);
  const afterReplay = readReceipt(project);
  assert.equal(afterReplay.status, 'catalog-delivered');
  assert.equal(afterReplay.pageReplays.at(-1).pageId, selectedPage.id);
  assert.equal(afterReplay.pageReplays.at(-1).pageSha256, selectedPage.sha256);
  assert.match(afterReplay.pageReplays.at(-1).wrapperSha256, /^[a-f0-9]{64}$/u);

  const candidate = deliverCandidate(project, target, 'new:caption-news');
  assert.equal(candidate.record.status, 'candidate-delivered');
  assert.ok(candidate.pageOutputs.every(page => [...page].length <= 4000));
  assert.ok(candidate.pageOutputs.length > 1, '字符上限应实际影响候选全文分页');
});

test('an independent method change keeps the emitted map and candidate receipts', t => {
  const mirrorRoot = projectPath('source-scoped-mirror');
  t.after(() => fs.rmSync(mirrorRoot, { recursive: true, force: true }));
  createRuntimeMirror(mirrorRoot);
  const mirrorWrapper = path.join(mirrorRoot, '.agents/skills/laohu-motion/scripts/laohu-showreel.mjs');
  const project = path.join(mirrorRoot, 'fixture-project');
  const target = 'fixture-project';
  const invoke = args => runWithWrapper(mirrorWrapper, args, mirrorRoot);

  const prepared = invoke(['input-prepare', target]);
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  const delivered = deliverCatalog(project, target, invoke);
  assert.equal(delivered.receipt.status, 'catalog-delivered');
  deliverCandidate(project, target, 'original:art-deco', invoke);
  const initial = readReceipt(project);
  assert.equal(initial.candidates['original:art-deco'].status, 'candidate-delivered');

  const changedSource = path.join(mirrorRoot, '.agents/skills/laohu-motion/references/showreel-runtime.md');
  fs.appendFileSync(changedSource, '\n\n本段仅为源级失效测试夹具。\n');
  const refreshed = invoke(['input-prepare', target, '--resume']);
  assert.equal(refreshed.status, 0, `${refreshed.stdout}\n${refreshed.stderr}`);
  const after = readReceipt(project);
  assert.equal(after.status, 'catalog-delivered');
  assert.equal(after.sourceFingerprint, initial.sourceFingerprint);
  assert.deepEqual(after.pageRecords, initial.pageRecords);
  assert.deepEqual(after.candidates['original:art-deco'], initial.candidates['original:art-deco']);

  const replayId = after.pageRecords[0].id;
  const replay = invoke(['input-page', target, '--id', replayId]);
  assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`);
  assert.ok(replay.stdout.includes(`输入交付页 ${replayId}`), `${replay.stdout}\n${replay.stderr}`);
  assert.equal(createHash('sha256').update(replay.stdout).digest('hex'), after.pageRecords[0].sha256);
  assert.equal(readReceipt(project).pageReplays.at(-1).pageId, replayId);
});

test('a complete legacy-shaped receipt for the same map can reuse recorded source delivery', t => {
  const mirrorRoot = projectPath('legacy-complete-receipt');
  t.after(() => fs.rmSync(mirrorRoot, { recursive: true, force: true }));
  createRuntimeMirror(mirrorRoot);
  const mirrorWrapper = path.join(mirrorRoot, '.agents/skills/laohu-motion/scripts/laohu-showreel.mjs');
  const project = path.join(mirrorRoot, 'fixture-project');
  const target = 'fixture-project';
  const invoke = args => runWithWrapper(mirrorWrapper, args, mirrorRoot);

  assert.equal(invoke(['input-prepare', target]).status, 0);
  const delivered = deliverCatalog(project, target, invoke);
  assert.equal(delivered.receipt.status, 'catalog-delivered');
  deliverCandidate(project, target, 'original:art-deco', invoke);
  const legacy = writeLegacyReceipt(project);
  assert.equal(legacy.deliverySources, undefined);
  assert.ok(legacy.pageRecords.every(page => page.sourceRefs === undefined));

  const changedSource = path.join(mirrorRoot, '.agents/skills/laohu-motion/references/showreel-runtime.md');
  fs.appendFileSync(changedSource, '\n\n本段仅为完整旧回执来源级迁移测试。\n');
  const refreshed = invoke(['input-prepare', target, '--resume']);
  assert.equal(refreshed.status, 0, `${refreshed.stdout}\n${refreshed.stderr}`);
  const after = readReceipt(project);
  assert.equal(after.status, 'catalog-delivered');
  assert.equal(after.candidates['original:art-deco'].status, 'candidate-delivered');
  assert.equal(after.deliveredPages.length, after.pageRecords.length);
  assert.ok(after.deliveredPages.every(page => page.deliveryBasis === 'source-reused' && page.sourceRefs[0].id === 'global-map'));
  assert.equal(after.deliveryReceipt.sourceReusedPageCount, after.pageRecords.length);
  const expanded = deliverCandidate(project, target, 'original:flat-vector', invoke);
  assert.equal(expanded.record.status, 'candidate-delivered');
});

test('a partial legacy receipt does not reuse any source pages', t => {
  const mirrorRoot = projectPath('legacy-partial-receipt');
  t.after(() => fs.rmSync(mirrorRoot, { recursive: true, force: true }));
  createRuntimeMirror(mirrorRoot);
  const mirrorWrapper = path.join(mirrorRoot, '.agents/skills/laohu-motion/scripts/laohu-showreel.mjs');
  const project = path.join(mirrorRoot, 'fixture-project');
  const target = 'fixture-project';
  const invoke = args => runWithWrapper(mirrorWrapper, args, mirrorRoot);

  assert.equal(invoke(['input-prepare', target]).status, 0);
  const delivered = deliverCatalog(project, target, invoke);
  assert.equal(delivered.receipt.status, 'catalog-delivered');
  const legacy = writeLegacyReceipt(project, { partial: true });
  assert.equal(legacy.status, 'pending');
  assert.equal(legacy.deliveryReceipt, null);
  assert.ok(legacy.deliveredPages.length < legacy.pageRecords.length);

  const refreshed = invoke(['input-prepare', target]);
  assert.equal(refreshed.status, 0, `${refreshed.stdout}\n${refreshed.stderr}`);
  const after = readReceipt(project);
  assert.equal(after.status, 'pending');
  assert.equal(after.deliveryReceipt, null);
  assert.equal(after.deliveredPages.length, 0, 'incomplete legacy output must be re-read because its source-to-page map is unavailable');
});

test('full-redesign default spec reaches the actual build subprocess and overrides stale portrait defaults', t => {
  const project = projectPath('full-redesign-build-spec');
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const target = path.relative(repoRoot, project);
  fs.writeFileSync(path.join(project, 'render.mjs'), '// existing renderer fixture\n');
  fs.writeFileSync(path.join(project, 'editor.json'), JSON.stringify({ size: '1080x1920', fps: 24 }));
  fs.writeFileSync(path.join(project, 'brief.md'), brief().replace('1920x1080', '1080x1920'));

  const prepared = run(['input-prepare', target, '--full-redesign']);
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  assert.deepEqual(
    { size: readReceipt(project).currentSpec.size, source: readReceipt(project).currentSpec.source },
    { size: '1920x1080', source: 'default-16:9' },
    'the prior project and brief portrait must not define this full redesign round',
  );
  fs.writeFileSync(path.join(project, 'brief.md'), brief('motion-probe: not-required; reason: 本技术夹具仅核验静帧关键帧与规格传递。\nresource-use: original:art-deco — 采用其秩序构图作为技术规格夹具输入。'));
  const delivered = deliverCatalog(project, target);
  assert.equal(delivered.receipt.status, 'catalog-delivered');
  deliverCandidate(project, target, 'original:art-deco');

  writeTechnicalScene(project);
  fs.mkdirSync(path.join(project, 'out'), { recursive: true });
  fs.writeFileSync(path.join(project, 'build.sh'), [
    '#!/bin/sh',
    'set -eu',
    'FPS=${FPS:-24}',
    'SIZE=${SIZE:-1080x1920}',
    'mkdir -p out',
    'if [ "${MOTION_TEST_CONSUME_ONLY:-0}" = 1 ]; then',
    '  printf "%s %s\\n" "$SIZE" "$FPS" > out/consumed-spec.txt',
    'else',
    '  node "$SKILL/scripts/render.mjs" . --fps "$FPS" --size "$SIZE" --determinism',
    '  node "$SKILL/scripts/inspect.mjs" qa out/final.mp4 --expect-size $SIZE --expect-fps $FPS',
    'fi',
  ].join('\n') + '\n');

  const workbenchCache = path.join(project, '.cache/laohu-showreel');
  fs.mkdirSync(workbenchCache, { recursive: true });
  for (const directory of ['runtime', 'playwright-browsers']) {
    fs.symlinkSync(path.join(repoRoot, '.cache/laohu-showreel', directory), path.join(workbenchCache, directory), 'dir');
  }

  fs.writeFileSync(path.join(project, 'keyframe.png'), solidPng(1920, 1080, [232, 184, 77]));
  const styleStage = run(['progress', '.', '--stage', 'style', '--preview', 'keyframe.png', '--message', 'technical fixture keyframe'], project);
  assert.equal(styleStage.status, 0, `${styleStage.stdout}\n${styleStage.stderr}`);
  const styleConfirm = run(['progress', '.', '--stage', 'style', '--confirm', '--selected-style', 'original:art-deco',
    '--evidence-text', '此技术夹具模拟了用户明确确认当前风格关键帧。',
    '--scope', '确认当前装饰艺术方向关键帧与本轮画幅'], project);
  assert.equal(styleConfirm.status, 0, `${styleConfirm.stdout}\n${styleConfirm.stderr}`);

  const revisionId = `${Date.now()}-feedface`;
  const snapshotRelative = `.showreel-progress/revisions/${revisionId}/project`;
  const snapshot = path.join(project, snapshotRelative);
  fs.mkdirSync(snapshot, { recursive: true });
  const exclusions = new Set(['.git', '.cache', 'node_modules', 'out', 'qa', '.showreel-progress', '.showreel-editor', '.showreel-cache', '__pycache__']);
  for (const entry of fs.readdirSync(project, { withFileTypes: true })) {
    if (exclusions.has(entry.name) || entry.name === '.showreel-input-delivery.json') continue;
    fs.cpSync(path.join(project, entry.name), path.join(snapshot, entry.name), { recursive: entry.isDirectory(), dereference: true });
  }
  const progressPath = path.join(project, '.showreel-progress/status.json');
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  const review = progress.stages.find(stage => stage.id === 'review');
  review.status = 'waiting';
  progress.current = 'review';
  progress.preview = { id: revisionId, stage: 'review', final: true, directory: snapshotRelative, name: 'technical fixture final preview' };
  fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  const exportConfirm = run(['progress', '.', '--stage', 'review', '--confirm',
    '--evidence-text', '此技术夹具模拟了用户明确确认当前最终预览可以导出。',
    '--scope', '确认当前最终预览版本可导出'], project);
  assert.equal(exportConfirm.status, 0, `${exportConfirm.stdout}\n${exportConfirm.stderr}`);

  const built = run(['build', '.', '--text-direction', '技术方向'], project, { ...process.env, MOTION_TEST_CONSUME_ONLY: '1' });
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  const consumedSpec = fs.readFileSync(path.join(project, 'out/consumed-spec.txt'), 'utf8').trim();
  assert.equal(consumedSpec, '1920x1080 30');

  fs.unlinkSync(path.join(project, 'out/consumed-spec.txt'));
  fs.writeFileSync(path.join(project, 'build.sh'), [
    '#!/bin/sh',
    'FPS=${FPS:-24}',
    'SIZE=${SIZE:-1080x1920}',
    'mkdir -p out',
    'printf "%s %s\\n" "$SIZE" "$FPS" > out/consumed-spec.txt',
    '# node "$SKILL/scripts/render.mjs" . --fps "$FPS" --size "$SIZE"',
    '# node "$SKILL/scripts/inspect.mjs" qa out/final.mp4 --expect-size $SIZE --expect-fps $FPS',
  ].join('\n') + '\n');
  const badRevisionId = `${Date.now()}-badc0ffe`;
  const badSnapshotRelative = `.showreel-progress/revisions/${badRevisionId}/project`;
  const badSnapshot = path.join(project, badSnapshotRelative);
  fs.mkdirSync(badSnapshot, { recursive: true });
  for (const entry of fs.readdirSync(project, { withFileTypes: true })) {
    if (exclusions.has(entry.name) || entry.name === '.showreel-input-delivery.json') continue;
    fs.cpSync(path.join(project, entry.name), path.join(badSnapshot, entry.name), { recursive: entry.isDirectory(), dereference: true });
  }
  const refreshedProgress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  refreshedProgress.stages.find(stage => stage.id === 'review').status = 'waiting';
  refreshedProgress.current = 'review';
  refreshedProgress.preview = { id: badRevisionId, stage: 'review', final: true, directory: badSnapshotRelative, name: 'comment-only invalid build fixture' };
  fs.writeFileSync(progressPath, `${JSON.stringify(refreshedProgress, null, 2)}\n`);
  const refreshedConfirm = run(['progress', '.', '--stage', 'review', '--confirm',
    '--evidence-text', '此技术夹具模拟了用户针对更新后的最终预览再次确认。',
    '--scope', '确认更新后的最终预览版本可导出'], project);
  assert.equal(refreshedConfirm.status, 0, `${refreshedConfirm.stdout}\n${refreshedConfirm.stderr}`);
  const badBuild = run(['build', '.', '--text-direction', '技术方向'], project);
  assert.notEqual(badBuild.status, 0);
  assert.match(badBuild.stderr, /可执行行未显示会用本轮 1920x1080 \/ 30 fps/u);
  assert.equal(fs.existsSync(path.join(project, 'out/consumed-spec.txt')), false, 'the wrapper must reject the comment-only size claim before the build subprocess runs');

  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'build-spec-consumption.json'), `${JSON.stringify({
    format: 'laohu.motion.build-spec-consumption/1',
    evidenceClass: 'BEHAVIOR',
    fixture: 'technical fixture; no film project or user approval was represented',
    priorConfig: { size: '1080x1920', fps: 24 },
    inputPrepareSpec: readReceipt(project).currentSpec,
    buildSubprocessConsumed: consumedSpec,
    result: 'PASS',
    commentOnlyBuildRejected: badBuild.stderr.includes('可执行行未显示会用本轮 1920x1080 / 30 fps'),
    limit: 'The CLI passes SIZE/FPS and checks active local build.sh command text; it does not authenticate user declarations or prevent a deliberately modified script from ignoring environment variables.',
  }, null, 2)}\n`);
});

test('catalog metadata alone cannot pass the real-output gate', t => {
  const project = projectPath('metadata-only');
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const target = path.relative(repoRoot, project);
  assert.equal(run(['input-prepare', target]).status, 0);
  writeBrief(project);
  const receipt = readReceipt(project);
  receipt.status = 'catalog-delivered';
  receipt.deliveryReceipt = {
    type: 'catalog-delivered',
    inputFingerprint: receipt.sourceFingerprint,
    pageCount: receipt.pageRecords.length,
    pagesSha256: '0'.repeat(64),
    characters: 0,
    bytes: 0,
  };
  fs.writeFileSync(path.join(project, '.showreel-input-delivery.json'), JSON.stringify(receipt));
  const result = run(['scaffold', target, '--audio', 'none']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /目录回执只有元数据或格式无效/);
  assert.match(result.stderr, /input-map/);
  assert.equal(fs.existsSync(path.join(project, 'index.html')), false);
});

test('Cover and code direction frames share the workbench with event-bound real renders', async t => {
  const project = projectPath('frame-source-and-comparison');
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const target = path.relative(repoRoot, project);
  const input = (source, probe = 'not-required') => brief([
    'resource-mode: original-only',
    'original-only-user-request: “技术夹具不采用任何目录或 Benchmark 来源。”',
    ...(source ? [`styleframe-source: ${source}`] : []),
    `motion-probe: ${probe}; reason: 以当前技术夹具验证设计帧与工作台的实际接口。`,
  ].join('\n'));
  const writeDesign = (source, probe) => fs.writeFileSync(path.join(project, 'brief.md'), input(source, probe));
  const publish = (file, source, event, seconds, extra = []) => run([
    'progress', target, '--stage', 'style', '--preview', file, '--frame-source', source,
    '--frame-event', event, '--frame-at', String(seconds), ...extra,
  ]);
  const confirm = () => run(['progress', target, '--stage', 'style', '--confirm', '--next', 'scenes',
    '--evidence-text', '本地技术夹具用明确声明模拟方向确认。',
    '--scope', '验证当前设计帧与选定时点的工作台绑定。']);
  const assertSuccess = result => assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const workbench = () => JSON.parse(fs.readFileSync(path.join(project, '.showreel-progress/status.json'), 'utf8'));
  assertSuccess(run(['input-prepare', target]));

  const frameRoot = 'qa/explorations';
  fs.mkdirSync(path.join(project, frameRoot), { recursive: true });
  const targetPng = `${frameRoot}/cover-target.png`;
  const otherPng = `${frameRoot}/cover-other.png`;
  const targetPngBytes = solidPng(1920, 1080, [34, 103, 165]);
  fs.writeFileSync(path.join(project, targetPng), targetPngBytes);
  // A single PNG can describe more than one event. Separate attachments still need separate event identities.
  fs.writeFileSync(path.join(project, otherPng), targetPngBytes);
  fs.writeFileSync(path.join(project, 'prompt.md'), '用于测试的生成提示词');
  fs.writeFileSync(path.join(project, 'bad.png'), targetPngBytes.subarray(0, 24));
  fs.writeFileSync(path.join(project, 'index.html'), '<!doctype html><meta charset="utf-8"><canvas id="frame"></canvas><script src="./scene.js"></script>');
  fs.writeFileSync(path.join(project, 'scene.js'), `const frame = document.querySelector('#frame');
    frame.width = 1920; frame.height = 1080;
    const ctx = frame.getContext('2d');
    window.DUR = 1.4;
    window.render = seconds => {
      ctx.fillStyle = '#19354e'; ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = '#fec682'; ctx.beginPath();
      ctx.arc(550 + 400 * seconds, 540, 180, 0, Math.PI * 2); ctx.fill();
    };
    window.render(0); window.READY = true;`);

  writeDesign(null);
  assert.match(publish(targetPng, 'cover', 'focus', 0.5).stderr, /来源不一致/u);
  assert.match(run(['render', target, '--text-direction', '技术方向', '--still=']).stderr, /非空 --still/u);
  assert.match(run(['render', target, '--text-direction', '技术方向', '--determinism']).stderr, /正式制作前需要用户/u);
  const renderStill = () => {
    assertSuccess(run(['render', target, '--text-direction', '技术方向', '--still', '0.5']));
    const still = readReceipt(project).explorations.at(-1);
    assert.equal(still.singleStill.timeSeconds, 0.5);
    return still.artifacts[0].path;
  };
  const defaultStill = renderStill();
  assertSuccess(publish(defaultStill, 'code', 'focus', 0.5));
  assertSuccess(confirm());
  assert.equal(readReceipt(project).confirmations.style.previewArtifactSet.artifacts[0].frame.source, 'code');

  writeDesign('cover', 'required');
  assert.match(publish(defaultStill, 'code', 'focus', 0.5).stderr, /来源不一致/u);
  assert.match(publish('prompt.md', 'cover', 'focus', 0.5).stderr, /实际 PNG/u);
  assert.match(publish('bad.png', 'cover', 'focus', 0.5).stderr, /PNG 无法完整解码/u);
  assert.match(run(['progress', target, '--stage', 'style', '--preview', targetPng, '--reopen']).stderr, /--frame-source cover/u);
  assertSuccess(publish(targetPng, 'cover', 'focus', 0.5, ['--reopen']));
  assertSuccess(publish(otherPng, 'cover', 'arrival', 0.9));
  assert.match(confirm().stderr, /motion-probe required/u);
  writeDesign('cover');
  assertSuccess(confirm());
  const approved = readReceipt(project).confirmations.style;
  assert.deepEqual(approved.previewArtifactSet.artifacts.map(item => item.frame.event), ['focus', 'arrival']);
  assert.ok(approved.previewArtifactSet.artifacts.every(item => item.frame.source === 'cover'));

  const actualStill = renderStill();
  const makeComparison = (file, event, time) => publish(file, 'code', event, time, ['--frame-role', 'implementation']);
  assert.match(makeComparison(targetPng, 'focus', 0.5).stderr, /相同秒数的单帧渲染回执/u);
  assert.match(makeComparison(actualStill, 'arrival', 0.5).stderr, /相同事件 ID 与秒数/u);
  assert.match(makeComparison(actualStill, 'focus', 0.9).stderr, /相同秒数的单帧渲染回执/u);
  fs.appendFileSync(path.join(project, 'scene.js'), '\n// New implementation revision.\n');
  assert.match(makeComparison(actualStill, 'focus', 0.5).stderr, /本轮工程在相同秒数的单帧渲染回执/u);
  assertSuccess(makeComparison(renderStill(), 'focus', 0.5));
  assert.deepEqual(readReceipt(project).confirmations.style, approved);
  assert.equal(workbench().current, 'scenes');
  const comparison = workbench().artifacts.find(item => item.frame?.role === 'implementation');
  assert.equal(comparison.frame.targetArtifactId, approved.previewArtifactSet.artifacts[0].id);
  assert.match(comparison.name, /左：设计目标图 \/ 右：工程实渲/u);
  const {createProgressServer} = await import('../templates/runtime/laohu-showreel/scripts/lib/editor-progress.mjs');
  const server = await createProgressServer(project);
  const workbenchCache = path.join(repoRoot, '.cache/laohu-showreel');
  const lockPath = path.join(repoRoot, '.agents/skills/laohu-motion/templates/runtime/laohu-showreel/scripts/package-lock.json');
  const lockDigest = createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex').slice(0, 16);
  const modules = path.join(workbenchCache, 'runtime', lockDigest, 'node_modules');
  const priorBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(workbenchCache, 'playwright-browsers');
  let browser;
  try {
    const base = new URL(server.url);
    const state = await fetch(new URL('/api/progress', base)).then(response => response.json());
    assert.deepEqual(state.artifacts.filter(row => row.frame).map(row => row.frame.role), ['design', 'design', 'implementation']);
    const response = await fetch(new URL(comparison.url, base));
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), 3840);
    assert.equal(bytes.readUInt32BE(20), 1080);

    const {chromium} = createRequire(import.meta.url)(path.join(modules, 'playwright'));
    browser = await chromium.launch({headless: true});
    const page = await browser.newPage();
    await page.goto(server.url);
    const image = page.locator('#artifact-content img');
    await image.waitFor({state: 'visible'});
    assert.equal(await image.getAttribute('alt'), comparison.name);
    assert.equal(await image.evaluate(async element => {
      await element.decode();
      return element.naturalWidth;
    }), 3840);
    assert.equal(await page.locator('[data-stage="style"] .stage-result').count(), 3);
  } finally {
    if (browser) await browser.close();
    if (priorBrowsersPath === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = priorBrowsersPath;
    await server.close();
  }

  fs.writeFileSync(path.join(project, targetPng), solidPng(1920, 1080, [91, 170, 67]));
  assert.match(run(['render', target, '--text-direction', '技术方向', '--determinism']).stderr, /原始设计图已变化/u);
  assertSuccess(publish(targetPng, 'cover', 'focus', 0.5, ['--reopen']));
  const revised = readReceipt(project).keyframeSet;
  assert.deepEqual(revised.artifacts.map(item => item.frame.event), ['arrival', 'focus']);
  assert.equal(revised.artifacts[0].sha256, approved.previewArtifactSet.artifacts[1].sha256);
  assert.equal(workbench().artifacts.some(item => item.frame?.role === 'implementation'), false);
  assert.match(run(['render', target, '--text-direction', '技术方向', '--determinism']).stderr, /风格确认绑定的关键帧集合已改变/u);
  assertSuccess(confirm());
  assert.notEqual(readReceipt(project).confirmations.style.designHash, approved.designHash);

  writeDesign(null);
  assertSuccess(run(['progress', target, '--stage', 'style', '--preview', renderStill(), '--reopen']));
  assert.equal(workbench().artifacts.some(item => item.frame), false);
  assertSuccess(confirm());
  const legacyFrame = readReceipt(project).confirmations.style.previewArtifactSet.artifacts[0];
  assert.equal(legacyFrame.frame, undefined);
});

test('scaffold stops at the next directory page until catalog output is complete', t => {
  const project = projectPath('missing-page');
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const target = path.relative(repoRoot, project);
  assert.equal(run(['input-prepare', target]).status, 0);
  writeBrief(project);
  const result = run(['scaffold', target, '--audio', 'none']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /目录页尚未全部输出/);
  assert.match(result.stderr, /input-map .* --resume/);
  assert.equal(fs.existsSync(path.join(project, 'index.html')), false);
});
