import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {emptyProductionTable} from '../scripts/brief-production-units.mjs';

const repo = fileURLToPath(new URL('../../../..', import.meta.url));
const script = fileURLToPath(new URL('../scripts/laohu-showreel.mjs', import.meta.url));
const base = path.join(repo, '.cache/validation/motion-root-cause-20261119/phase');
const textDirection = ['--text-direction', '配准夹具'];
const block = (name, contents) => `<${name}>\n${contents}\n</${name}>\n`;
const direction = [
  'direction-name: 配准夹具',
  'resource-mode: 2',
  'resource-use: original:blueprint — 以制图线条标出同一对象的实际移动位置。',
  'motion-probe: required; reason: 对照方形在两个代表时点的实际移动位置。',
  'explore-moment: left@0.5 — 方形位于左侧标线旁。',
  'explore-moment: right@3.5 — 方形越过中间标线。',
].join('\n');
const role = block('role', '独立自动化技术夹具，检查两阶段和工程版本门槛。');
const input = block('inputs', '规格：320x180，8 fps。图形运动夹具，无声。');
const fixtureReview = ['--evidence-text', '自动化技术测试专用的模拟回复，核验 CLI 声明分支。', '--scope', '模拟记录当前测试计划、两个画面与指定样片的范围。'];
const sha = value => createHash('sha256').update(value).digest('hex');

test('exploration evidence and the final production snapshot enforce separate gates', t => {
  fs.mkdirSync(base, {recursive:true});
  const project = fs.mkdtempSync(path.join(base, 'phase-eval-'));
  t.after(() => fs.rmSync(project, {recursive:true, force:true}));
  const relative = path.relative(repo, project);
  const put = (file, data) => fs.writeFileSync(path.join(project, file), data);
  const read = file => JSON.parse(fs.readFileSync(path.join(project, file), 'utf8'));
  const receipt = () => read('.showreel-input-delivery.json');
  const cli = (command, ...args) => spawnSync(process.execPath, [script, command, relative, ...args], {
    cwd:repo, encoding:'utf8', timeout:45_000, maxBuffer:2 * 1024 * 1024,
  });
  const ok = (command, ...args) => {
    const result = cli(command, ...args);
    assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
    return result.stdout;
  };
  const rejects = (expected, command, ...args) => {
    const result = cli(command, ...args);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, expected);
  };

  ok('input-map', '--spec', '320x180', '--fps', '8', '--spec-source', 'explicit-user', '--spec-evidence-text', '自动化技术测试固定规格为 320x180，8fps。');
  ok('input-candidate', '--id', 'original:blueprint');
  put('brief.md', role + input + block('direction', direction));
  ok('scaffold', '--audio', 'none', '--phase', 'explore');
  assert.equal(receipt().projectPhase, 'explore');
  assert.equal(receipt().productionUnitsRequired, false);
  put('index.html', '<!doctype html><html><canvas width="320" height="180"></canvas><script type="module" src="./scene.js"></script></html>');
  const timeline = `export const DUR=4, FPS=8;
    export const SHOTS=[{ id:'opening',t0:0,t1:2 },{ id:'move',t0:2,t1:4 }];`;
  put('timeline.js', timeline + '\nexport const DRAFT=true;\n');
  const swatch = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path fill="#eba341" d="M0 0h20v20H0z"/></svg>';
  put('assets/swatch.svg', swatch);
  put('scene.js', `import {DUR} from './timeline.js';
    const square = new Image(); square.src = './assets/swatch.svg'; await square.decode();
    const ctx = document.querySelector('canvas').getContext('2d');
    window.DUR=DUR;
    window.render=t=>{ctx.fillStyle='#1d4868';ctx.fillRect(0,0,320,180);ctx.drawImage(square,25+t*65,76,36,36);};
    window.READY=true;window.render(0);`);
  rejects(/方向探索/u, 'build', ...textDirection);
  rejects(/方向探索/u, 'render', ...textDirection, '--determinism');
  rejects(/方向探索/u, 'progress', '--stage', 'review', '--publish', '.', '--final', ...textDirection);
  rejects(/等待用户确认/u, 'promote-production', '--audit', 'qa/audit.md');
  fs.mkdirSync(path.join(project, 'input'));
  for (const [id, time] of [['left','0.5'], ['right','3.5']]) {
    ok('render', ...textDirection, '--still', time);
    const still = receipt().explorations.at(-1).singleStill;
    assert.deepEqual(still.directionEvidence.paths, ['assets/swatch.svg']);
    ok('progress', '--stage', 'style', '--preview', still.path, '--frame-source', 'code', '--frame-event', id, '--frame-at', time);
  }
  rejects(/motion-probe required/u, 'progress', '--stage', 'style', '--confirm', ...fixtureReview);
  ok('probe', ...textDirection, '--start', '0', '--duration', '4', '--selection', 'moving-square', '--purpose', '用成功渲染的小样核对实际移动位置。');
  const probe = receipt().explorations.at(-1);
  assert.equal(probe.duration,4);
  assert.ok(fs.statSync(path.join(project, probe.mp4.path)).size > 0);
  ok('progress', '--stage', 'style', '--preview', probe.previewWebp.path);
  ok('progress', '--stage', 'style', '--confirm', ...fixtureReview);
  const styleHash = receipt().confirmations.style.designHash;
  rejects(/原八个 XML/u, 'promote-production', '--audit', 'qa/audit.md');

  const structure = emptyProductionTable.replace('</production-units>', [
    '| opening | 左侧 | 0 | 2 | 验证运动起段 | | 成片@timeline.js#opening | 无口播 | left@0.5 | 动画 |',
    '| move | 越线 | 2 | 4 | 验证运动后段 | | 成片@timeline.js#move | 无口播 | right@3.5 | 动画 |',
    '</production-units>', '', '### [opening] 左侧', '左侧方形在轴上开始移动，借真实帧检查位置。', '',
    '### [move] 越线', '保持相同构图，方形越过中间基线，检验相对位置。', '', '<screen-text-registry>', '</screen-text-registry>',
  ].join('\n'));
  const full = role + input + block('confirmations','这里只记录自动化测试输入。') + block('direction',direction)
    + block('structure',structure) + block('build','用相同时间轴驱动最终画面。')
    + block('gotchas','核对两段时钟和位置。') + block('start','在同一工程继续验证。');
  put('brief.md',full);
  put('qa/audit.md',`brief-sha256: ${'0'.repeat(64)}\n验证本地技术夹具的时间覆盖。\n`);
  rejects(/成片时间线/u, 'promote-production', '--audit', 'qa/audit.md');
  put('timeline.js', timeline);
  rejects(/审稿记录须含/u, 'promote-production', '--audit', 'qa/audit.md');
  fs.copyFileSync(path.join(project,receipt().keyframeSet.artifacts[0].path),path.join(project,'input/头像.png'));
  put('qa/audit.md',`brief-sha256: ${sha(full)}\n技术检查记录：前后两段沿同一轴移动，0–4 秒的区间首尾连续。\n`);
  ok('promote-production', '--audit', 'qa/audit.md');
  assert.equal(receipt().projectPhase,'production');
  assert.equal(receipt().confirmations.style.designHash,styleHash,'an unreferenced picture and full-film additions retain direction approval');
  fs.appendFileSync(path.join(project,'assets/swatch.svg'),'\n<!-- modified adopted visual -->\n');
  rejects(/采用素材、字体或屏显文字已变化/u, 'render', ...textDirection, '--determinism');
  put('assets/swatch.svg',swatch);

  put('film.json',JSON.stringify({version:1,duration:4,size:'320x180',fps:8,chapters:[
    {id:'a',project:'.',duration:2,inputs:['index.html','scene.js','timeline.js','assets']},
    {id:'b',project:'.',start:2,duration:2,inputs:['index.html','scene.js','timeline.js','assets']},
  ]}));
  const buildLong = (...args) => spawnSync(process.execPath,[script,'build-long',path.join(relative,'film.json'),...args],{cwd:repo,encoding:'utf8',timeout:45_000});
  assert.match(buildLong().stderr,/最终预览/u);
  ok('progress','--stage','review','--publish','.','--final',...textDirection);
  rejects(/尚无针对当前最终预览/u,'build',...textDirection);
  rejects(/尚无针对当前最终预览/u,'render',...textDirection);
  ok('progress','--stage','review','--confirm','--evidence-text','自动化技术测试中的独立导出确认。','--scope','确认当前版本最终预览的测试导出。');
  const exported = buildLong('--out','out/technical.mp4');
  assert.equal(exported.status,0,exported.stderr || exported.stdout);
  assert.match(exported.stdout,/2 chapter\(s\) rendered, 0 reused; technical acceptance passed/u);
  const tracks = spawnSync('ffprobe', ['-v','error','-show_entries','format=duration:stream=width,height,r_frame_rate','-of','json',path.join(project,'out/technical.mp4')], {encoding:'utf8'});
  assert.equal(tracks.status,0,tracks.stderr);
  const media = JSON.parse(tracks.stdout);
  assert.equal(media.streams.length,1);
  const {width,height,r_frame_rate:frameRate} = media.streams[0];
  assert.deepEqual([width,height,frameRate,Number(media.format.duration)],[320,180,'8/1',4]);
  put('scene.js',fs.readFileSync(path.join(project,'scene.js'),'utf8')+'\n// changed production renderer\n');
  rejects(/最终预览后项目内容已变化/u,'build',...textDirection);
  assert.match(buildLong().stderr,/最终预览后项目内容已变化/u);

  // Two same-length audio files are present in the tree before approval. A
  // second manifest can choose the wrong one without altering any file bytes.
  const restoredScene = fs.readFileSync(path.join(project,'scene.js'),'utf8').replace('\n// changed production renderer\n','');
  put('scene.js',restoredScene);
  const tone = (file, hz, duration) => {
    const result = spawnSync('ffmpeg', ['-v','error','-nostdin','-f','lavfi','-i',`sine=frequency=${hz}:duration=${duration}:sample_rate=48000`,
      '-af','volume=2.4','-ac','2','-c:a','pcm_s16le',path.join(project,file)],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  };
  tone('audio/approved.wav',440,4);
  tone('audio/other.wav',660,4);
  tone('audio/first-chapter.wav',440,2.025);
  const plan = read('film.json');
  put('audio-match.json',JSON.stringify({...plan,audio:'audio/approved.wav'}));
  put('audio-mismatch.json',JSON.stringify({...plan,audio:'audio/other.wav'}));
  put('chapter-audio.json',JSON.stringify({...plan,chapters:[{...plan.chapters[0],audio:'audio/first-chapter.wav'},plan.chapters[1]]}));
  const approveFinal = () => ok('progress','--stage','review','--confirm','--evidence-text','自动化测试对当前混音的独立模拟回复。','--scope','技术测试中确认当前版本的最终预览和所听的混音。');
  const buildNamed = (name,output) => spawnSync(process.execPath,[script,'build-long',path.join(relative,name),'--out',output],{cwd:repo,encoding:'utf8',timeout:45_000});
  ok('progress','--stage','review','--publish','.','--final','--reopen','--audio','audio/approved.wav',...textDirection);
  approveFinal();
  assert.equal(receipt().confirmations.export.reviewedAudio.path,'audio/approved.wav');
  const mismatch = buildNamed('audio-mismatch.json','out/wrong-audio.mp4');
  assert.notEqual(mismatch.status,0);
  assert.match(mismatch.stderr,/实际使用的音轨与已确认最终预览不同/u);
  assert.ok(!fs.existsSync(path.join(project,'out/wrong-audio.mp4')));
  const alternateEnv = spawnSync(process.execPath,[script,'build',relative,...textDirection],{cwd:repo,encoding:'utf8',env:{...process.env,AUDIO_FILE:'audio/other.wav'}});
  assert.match(alternateEnv.stderr,/AUDIO_FILE 与已确认/u);
  ok('build',...textDirection);
  const singleAudio = spawnSync('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_type','-of','csv=p=0',path.join(project,'out/final.mp4')],{encoding:'utf8'});
  assert.equal(singleAudio.status,0,singleAudio.stderr);
  assert.equal(singleAudio.stdout.trim(),'audio');
  const sameAudio = buildNamed('audio-match.json','out/approved-mix.mp4');
  assert.equal(sameAudio.status,0,`${sameAudio.stdout}\n${sameAudio.stderr}`);
  put('audio/narration-qa.json',JSON.stringify({generatedReport:true}));
  const repeat = buildNamed('audio-match.json','out/approved-mix-repeat.mp4');
  assert.equal(repeat.status,0,`${repeat.stdout}\n${repeat.stderr}`);
  ok('progress','--stage','review','--publish','.','--final','--reopen','--chapter-manifest','chapter-audio.json',...textDirection);
  approveFinal();
  const source = receipt().confirmations.export.reviewedAudio.path;
  assert.match(source,/^audio\/review\/[a-f0-9]{64}\.wav$/u);
  const time = spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',path.join(project,source)],{encoding:'utf8'});
  assert.equal(time.status,0,time.stderr);
  assert.equal(Number(time.stdout),4.025,'accepted short overhang is retained; an unassigned chapter receives silence');
  const chapterAudio = buildNamed('chapter-audio.json','out/chapters-mix.mp4');
  assert.equal(chapterAudio.status,0,`${chapterAudio.stdout}\n${chapterAudio.stderr}`);
});
