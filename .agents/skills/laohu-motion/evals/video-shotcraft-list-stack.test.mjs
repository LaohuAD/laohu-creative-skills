import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import pathSync from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {__test as Shotcraft} from '../templates/adapters/video-shotcraft-remotion.mjs';

const skillDir = pathSync.resolve(pathSync.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = pathSync.resolve(skillDir, '../../..');
const validationRoot = pathSync.join(repoRoot, '.cache/tmp/motion-source-integration/visual');
const catalogPath = pathSync.join(skillDir, 'templates/catalog.json');
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const template = catalog.templates.find((row) => row.id === 'video-shotcraft-list-stack-five');
const entry = (id) => catalog.templates.find((row) => row.id === id) || catalog.referenceCatalog.entries.find((row) => row.id === id);
const runtimeManifest = pathSync.join(skillDir, 'templates/runtime/video-shotcraft/package.json');
const runtimeLock = pathSync.join(skillDir, 'templates/runtime/video-shotcraft/package-lock.json');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0); name.copy(chunk, 4); data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function solidPng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride; raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const at = rowStart + 1 + x * 4;
      raw[at] = rgba[0]; raw[at + 1] = rgba[1]; raw[at + 2] = rgba[2]; raw[at + 3] = rgba[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options});
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout;
}

function requireBrowser() {
  const candidates = [process.env.MOTION_CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean);
  const found = candidates.find((file) => fsSync.existsSync(file));
  assert.ok(found, 'Chrome/Chromium is required for the source-vs-adaptation render comparison');
  return found;
}

function requireFfmpeg() {
  const candidates = [process.env.MOTION_FFMPEG, '/opt/homebrew/Cellar/ffmpeg@7/7.1.5_3/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg'].filter(Boolean);
  const found = candidates.find((file) => {
    if (!fsSync.existsSync(file)) return false;
    return spawnSync(file, ['-version'], {encoding:'utf8',stdio:'ignore'}).status === 0;
  });
  assert.ok(found, 'a working ffmpeg/ffprobe pair is required for frame comparison');
  return found;
}

async function buildAssets(runRoot) {
  const assetsRoot = pathSync.join(runRoot, 'assets');
  const mediaDir = pathSync.join(assetsRoot, 'textures/live');
  await fs.mkdir(mediaDir, {recursive:true});
  const layout = JSON.parse(await fs.readFile(pathSync.join(skillDir, 'templates/upstream/video-shotcraft/demos/_textures/live-layout.json'), 'utf8'));
  const pageHeight = layout.papers.pageH;
  await fs.writeFile(pathSync.join(mediaDir, 'papers-full.png'), solidPng(1920, pageHeight, [250, 247, 242, 255]));
  const colors = [[205, 191, 167, 255], [199, 181, 153, 255], [190, 172, 145, 255], [180, 163, 138, 255], [171, 155, 130, 255]];
  const highlightWidths = [187, 244, 247, 240, 191];
  const cards = [];
  for (let index = 0; index < 5; index++) {
    const src = `textures/live/paper${index + 1}.png`;
    await fs.writeFile(pathSync.join(assetsRoot, src), solidPng(1104, 225, colors[index]));
    const sourceRect = layout.papers.cards[index];
    cards.push({
      src,
      assetLicense: 'authorized',
      rect: {x:sourceRect.x, y:sourceRect.y, width:sourceRect.w, height:sourceRect.h},
      highlight: {x:16, y:156, width:highlightWidths[index], height:20},
    });
  }
  const spec = {
    templateId:template.id, width:1920, height:1080, fps:30, durationInFrames:88, fidelityMode:'source-adapted-local',
    layers:[{catalogId:template.id, props:{
      contentUse:'already-introduced-materials', pageImage:'textures/live/papers-full.png', pageImageLicense:'authorized',
      pageHeight, cards, counterLabel:'Paper Radar', counterCaption:'Of 31 Fetched Today',
    }}],
  };
  const inputPath = pathSync.join(runRoot, 'adapted-input.json');
  await fs.writeFile(inputPath, JSON.stringify(spec, null, 2) + '\n', {flag:'wx'});
  return {assetsRoot, inputPath, pageHeight, cards};
}

function framemd5(file, ffmpeg) {
  const output = run(ffmpeg, ['-v','error','-i',file,'-f','framemd5','-']);
  return output.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => line.split(',').at(-1).trim());
}

function compareDecodedVideos(sourcePath, adaptedPath, ffmpeg, statsPath) {
  run(ffmpeg, ['-v','warning','-i',sourcePath,'-i',adaptedPath,'-lavfi',`[0:v][1:v]psnr=stats_file=${statsPath}`,'-f','null','-']);
  const lines = fsSync.readFileSync(statsPath, 'utf8').trim().split(/\r?\n/);
  return lines.map((line) => {
    const frame = Number(line.match(/\bn:(\d+)/)?.[1]);
    const value = line.match(/\bpsnr_avg:([^ ]+)/)?.[1];
    return {frame:frame - 1, psnrAvg:value === 'inf' ? Infinity : Number(value)};
  });
}

test('ListStackPress source-adapted-local has strict five-card, asset, timing and semantic-landmark contracts', async () => {
  assert.ok(template, 'catalog entry must be registered');
  assert.equal(template.availability, 'conditional');
  assert.equal(template.component.kind, 'source-adapted-full-scene');
  assert.deepEqual(template.fidelityModes, ['source-adapted-local']);
  const sourceOnly = entry('video-shotcraft-card-list-stack-press');
  assert.equal(sourceOnly.availability, 'source-only');
  assert.equal(sourceOnly.callable, false);
  assert.equal(sourceOnly.renderer, 'catalog-index');

  const runRoot = pathSync.join(validationRoot, `contract-${process.pid}-${Date.now()}`);
  await fs.mkdir(runRoot, {recursive:true});
  const fixture = await buildAssets(runRoot);
  const safeSpec = JSON.parse(await fs.readFile(fixture.inputPath, 'utf8'));
  const assetRecords = [];
  const validated = await Shotcraft.validateShotcraftSpec(catalog, template, safeSpec, {assetsRoot:fixture.assetsRoot, assetRecords});
  assert.equal(validated.durationInFrames, 88);
  assert.equal(validated.fidelityMode, 'source-adapted-local');
  assert.equal(assetRecords.length, 6);
  assert.deepEqual(validated.layers[0].props.cards.map((row) => row.assetLicense), Array(5).fill('authorized'));

  const tallPagePath = pathSync.join(fixture.assetsRoot, 'textures/live/papers-tall.png');
  await fs.writeFile(tallPagePath, solidPng(1920, 3000, [250, 247, 242, 255]));
  const tallPageSpec = JSON.parse(JSON.stringify(safeSpec));
  tallPageSpec.layers[0].props.pageImage = 'textures/live/papers-tall.png';
  tallPageSpec.layers[0].props.pageHeight = 3000;
  const tallPageStillVisible = await Shotcraft.validateShotcraftSpec(catalog, template, tallPageSpec, {assetsRoot:fixture.assetsRoot});
  assert.equal(tallPageStillVisible.layers[0].props.pageHeight, 3000, 'a tall page is allowed when the fixed final camera view still contains all five cards');
  const offscreenSpec = JSON.parse(JSON.stringify(tallPageSpec));
  const offscreenY = [1650, 1890.4, 2130.8, 2371.2, 2611.6];
  offscreenSpec.layers[0].props.cards = offscreenSpec.layers[0].props.cards.map((card,index)=>({...card,rect:{...card.rect,y:offscreenY[index]}}));
  await assert.rejects(
    Shotcraft.validateShotcraftSpec(catalog, template, offscreenSpec, {assetsRoot:fixture.assetsRoot}),
    /must fit fully inside the 1920×1080 viewport in the pinned ListStackPress final view \(frame 82/,
  );
  const offscreenInput = pathSync.join(runRoot, 'offscreen-input.json');
  const offscreenPrepared = pathSync.join(runRoot, 'offscreen-prepared.json');
  await fs.writeFile(offscreenInput, JSON.stringify(offscreenSpec, null, 2) + '\n', {flag:'wx'});
  const offscreenPrepare = spawnSync(process.execPath, [
    pathSync.join(skillDir,'scripts/templates.mjs'),'prepare',template.id,'--input',offscreenInput,
    '--output',offscreenPrepared,'--assets-root',fixture.assetsRoot,
  ], {encoding:'utf8',maxBuffer:16*1024*1024});
  assert.notEqual(offscreenPrepare.status, 0, 'prepare must reject five cards that are inside the page but outside the pinned camera view');
  assert.match(`${offscreenPrepare.stdout || ''}\n${offscreenPrepare.stderr || ''}`, /must fit fully inside the 1920×1080 viewport in the pinned ListStackPress final view \(frame 82/);
  assert.equal(fsSync.existsSync(offscreenPrepared), false, 'failed offscreen prepare must not emit a prepared artifact');

  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, template, {...safeSpec, durationInFrames:87}, {assetsRoot:fixture.assetsRoot}), /fixed at exactly 88 frames/);
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, template, {...safeSpec, fidelityMode:'exact-baseline'}, {assetsRoot:fixture.assetsRoot}), /source-adapted-local/);
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, template, { ...safeSpec, layers:[{catalogId:template.id,props:{...safeSpec.layers[0].props,contentUse:'new-explanatory-prose'}}] }, {assetsRoot:fixture.assetsRoot}), /already-introduced material/);
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, template, { ...safeSpec, layers:[{catalogId:template.id,props:{...safeSpec.layers[0].props,cards:safeSpec.layers[0].props.cards.slice(0,4)}}] }, {assetsRoot:fixture.assetsRoot}), /exactly five entries/);
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, template, { ...safeSpec, layers:[{catalogId:template.id,props:{...safeSpec.layers[0].props,camera:{cx:960,cy:500,zoom:1}}}] }, {assetsRoot:fixture.assetsRoot}), /camera is not consumed/);
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, template, { ...safeSpec, layers:[{catalogId:template.id,props:{...safeSpec.layers[0].props,pageHeight:fixture.pageHeight+1}}] }, {assetsRoot:fixture.assetsRoot}), /pageImage must be 1920/);
  const traversalSpec = JSON.parse(JSON.stringify(safeSpec));
  traversalSpec.layers[0].props.cards[0].src = '../outside.png';
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, template, traversalSpec, {assetsRoot:fixture.assetsRoot}), /relative PNG path under --assets-root/);

  const outsideDir = pathSync.join(runRoot, 'outside');
  await fs.mkdir(outsideDir);
  await fs.copyFile(pathSync.join(fixture.assetsRoot, 'textures/live/paper1.png'), pathSync.join(outsideDir, 'outside.png'));
  await fs.symlink(pathSync.join(outsideDir, 'outside.png'), pathSync.join(fixture.assetsRoot, 'textures/live/outside-link.png'));
  const symlinkSpec = JSON.parse(JSON.stringify(safeSpec));
  symlinkSpec.layers[0].props.cards[0].src = 'textures/live/outside-link.png';
  await assert.rejects(Shotcraft.validateShotcraftSpec(catalog, template, symlinkSpec, {assetsRoot:fixture.assetsRoot}), /symlink escapes/);

  const actions = [
    {id:'enter-1',landmarkId:'card-enter',index:0,semanticCueId:'enter-first'},
    {id:'flight-1',landmarkId:'nominal-flight-end',index:0,semanticCueId:'flight-first'},
    {id:'roll-5',landmarkId:'roll-end',index:4,semanticCueId:'count-five'},
    {id:'press-5',landmarkId:'stack-pulse-peak',index:4,semanticCueId:'press-last'},
    {id:'glaze-start',landmarkId:'glaze-visible-start',semanticCueId:'glaze'},
  ];
  const startSec = 0, endSec = 88 / 30;
  const segment = {
    id:'stack', renderer:'video-shotcraft-remotion', sourceCatalogId:template.id,
    componentPath:template.component.path, componentSha256:template.component.sha256, exportName:template.component.exportName,
    sourceCommit:template.sourceMethodAdaptation.sourceCommit, sourceDurationFrames:88, fidelityMode:'source-adapted-local',
    compositionGroupId:'stack-only', startSec, endSec, actionBindings:actions,
    layers:[{catalogId:template.id,props:{
      ...safeSpec.layers[0].props,
      pageImage:`assets/${safeSpec.layers[0].props.pageImage}`,
      cards:safeSpec.layers[0].props.cards.map((card)=>({...card,src:`assets/${card.src}`})),
    }}],
  };
  const blueprint={
    format:'laohu.huashu-film-blueprint/2',width:1920,height:1080,fps:30,
    clock:{kind:'film-global',durationSec:endSec},segments:[segment],
    compositionGroups:[{id:'stack-only',segmentIds:['stack']}],transitionEdges:[],
  };
  const schedule=await Shotcraft.compileFilmV2(blueprint,pathSync.join(runRoot,'film-blueprint.json'),catalog);
  assert.deepEqual(schedule.rows[0].actionBindings.map((row) => row.sourceFrameWithinComponent), [6,28,84,58,74]);
  await assert.rejects(Shotcraft.compileFilmV2({...blueprint,segments:[{...segment,layers:[...segment.layers,{catalogId:'video-shotcraft-backdrop',props:{tone:'light'}}]}]},pathSync.join(runRoot,'invalid-film.json'),catalog), /full-scene source route cannot be decomposed|must render its one pinned source component/);
});

test('ListStackPress source and local adaptation render the same 88-frame fixture sequence', async () => {
  assert.ok(template, 'catalog entry must be registered before rendering');
  const browser = requireBrowser();
  const ffmpeg = requireFfmpeg();
  const runRoot = pathSync.join(validationRoot, `render-${process.pid}-${Date.now()}`);
  const outputsRoot = pathSync.join(runRoot, 'outputs');
  await fs.mkdir(outputsRoot, {recursive:true});
  const fixture = await buildAssets(runRoot);
  const preparedPath = pathSync.join(runRoot, 'prepared.json');
  const previewPath = pathSync.join(outputsRoot, 'adapted-frame-76.png');
  const adaptedPath = pathSync.join(outputsRoot, 'adapted-88f.mp4');
  const adaptedManifest = pathSync.join(outputsRoot, 'adapted-manifest.json');
  const cacheRoot = pathSync.join(repoRoot, '.cache/tmp/video-shotcraft/motion-source-integration');
  await fs.mkdir(cacheRoot, {recursive:true});

  run(process.execPath, [pathSync.join(skillDir,'scripts/templates.mjs'),'prepare',template.id,'--input',fixture.inputPath,'--output',preparedPath,'--assets-root',fixture.assetsRoot]);
  const longCopySpec = JSON.parse(await fs.readFile(fixture.inputPath, 'utf8'));
  longCopySpec.layers[0].props.counterLabel = '资料核验进度';
  longCopySpec.layers[0].props.counterCaption = '本周已完成五项资料来源核验与重点内容整理';
  const longCopyInput = pathSync.join(runRoot, 'long-copy-input.json');
  const longCopyPrepared = pathSync.join(runRoot, 'long-copy-prepared.json');
  await fs.writeFile(longCopyInput, JSON.stringify(longCopySpec, null, 2) + '\n', {flag:'wx'});
  run(process.execPath, [pathSync.join(skillDir,'scripts/templates.mjs'),'prepare',template.id,'--input',longCopyInput,'--output',longCopyPrepared,'--assets-root',fixture.assetsRoot]);
  const overlapPreview = spawnSync(process.execPath, [
    pathSync.join(skillDir,'scripts/templates.mjs'),'preview',template.id,'--spec',longCopyPrepared,
    '--output',pathSync.join(outputsRoot,'long-copy-overlap.png'),'--time',(87/30).toFixed(9),
    '--assets-root',fixture.assetsRoot,'--cache-dir',pathSync.join(cacheRoot,'long-copy-overlap'),
    '--browser',browser,'--ffmpeg',ffmpeg,
  ], {encoding:'utf8',maxBuffer:16*1024*1024});
  assert.notEqual(overlapPreview.status, 0, 'real renderer layout must reject the 20-character caption when its glyph block collides with a visible card');
  assert.match(`${overlapPreview.stdout || ''}\n${overlapPreview.stderr || ''}`, /ListStackPress counter caption overlaps visible card .* at frame \d+/);
  const overlapRender = spawnSync(process.execPath, [
    pathSync.join(skillDir,'scripts/templates.mjs'),'render',template.id,'--spec',longCopyPrepared,
    '--output',pathSync.join(outputsRoot,'long-copy-overlap.mp4'),'--assets-root',fixture.assetsRoot,
    '--cache-dir',pathSync.join(cacheRoot,'long-copy-render-overlap'),'--browser',browser,'--ffmpeg',ffmpeg,
  ], {encoding:'utf8',maxBuffer:16*1024*1024});
  assert.notEqual(overlapRender.status, 0, 'full render must reject the 20-character caption before producing the complete sequence');
  assert.match(`${overlapRender.stdout || ''}\n${overlapRender.stderr || ''}`, /ListStackPress counter caption overlaps visible card .* at frame \d+/);
  const changedHighlightSpec = JSON.parse(await fs.readFile(fixture.inputPath, 'utf8'));
  changedHighlightSpec.layers[0].props.cards[0].highlight.width += 1;
  const changedHighlightInput = pathSync.join(runRoot, 'changed-highlight-input.json');
  const changedHighlightPrepared = pathSync.join(runRoot, 'changed-highlight-prepared.json');
  await fs.writeFile(changedHighlightInput, JSON.stringify(changedHighlightSpec, null, 2) + '\n', {flag:'wx'});
  run(process.execPath, [pathSync.join(skillDir,'scripts/templates.mjs'),'prepare',template.id,'--input',changedHighlightInput,'--output',changedHighlightPrepared,'--assets-root',fixture.assetsRoot]);
  const changedHighlightPreview = spawnSync(process.execPath, [
    pathSync.join(skillDir,'scripts/templates.mjs'),'preview',template.id,'--spec',changedHighlightPrepared,
    '--output',pathSync.join(outputsRoot,'changed-highlight-overlap.png'),'--time',(26/30).toFixed(9),
    '--assets-root',fixture.assetsRoot,'--cache-dir',pathSync.join(cacheRoot,'changed-highlight-overlap'),
    '--browser',browser,'--ffmpeg',ffmpeg,
  ], {encoding:'utf8',maxBuffer:16*1024*1024});
  assert.notEqual(changedHighlightPreview.status, 0, 'the source-copy compatibility exception must not apply after changing any pinned highlight geometry');
  assert.match(`${changedHighlightPreview.stdout || ''}\n${changedHighlightPreview.stderr || ''}`, /ListStackPress counter caption overlaps visible card 1 at frame 26/);
  run(process.execPath, [pathSync.join(skillDir,'scripts/templates.mjs'),'preview',template.id,'--spec',preparedPath,'--output',previewPath,'--time',(76/30).toFixed(9),'--assets-root',fixture.assetsRoot,'--cache-dir',pathSync.join(cacheRoot,'preview'),'--browser',browser,'--ffmpeg',ffmpeg]);
  run(process.execPath, [pathSync.join(skillDir,'scripts/templates.mjs'),'render',template.id,'--spec',preparedPath,'--output',adaptedPath,'--assets-root',fixture.assetsRoot,'--cache-dir',pathSync.join(cacheRoot,'adapted'),'--browser',browser,'--ffmpeg',ffmpeg,'--manifest',adaptedManifest]);

  const manifest = JSON.parse(await fs.readFile(adaptedManifest,'utf8'));
  assert.equal(manifest.render.durationInFrames,88);
  assert.equal(manifest.render.probe.frameCount,88);
  assert.equal(manifest.fidelityMode,'source-adapted-local');
  assert.equal(manifest.assets.length,6);
  assert.ok(manifest.source.localImplementation.sha256);

  const runtimeManifestBytes=await fs.readFile(runtimeManifest), runtimeLockBytes=await fs.readFile(runtimeLock);
  const runtimeHash=sha256(Buffer.concat([runtimeManifestBytes,runtimeLockBytes]));
  const runtimeRoot=pathSync.join(repoRoot,'.cache/tmp/video-shotcraft',`remotion-runtime-${runtimeHash.slice(0,16)}`);
  const runtimeRequire=createRequire(pathSync.join(runtimeRoot,'package.json'));
  const {bundle}=runtimeRequire('@remotion/bundler');
  const {renderMedia,renderStill,selectComposition}=runtimeRequire('@remotion/renderer');
  const sourcePublic=pathSync.join(runRoot,'source-public');
  await fs.mkdir(pathSync.join(sourcePublic,'textures/live'),{recursive:true});
  await fs.copyFile(pathSync.join(fixture.assetsRoot,'textures/live/papers-full.png'),pathSync.join(sourcePublic,'textures/live/papers-full.png'));
  for (let i=1;i<=5;i++) await fs.copyFile(pathSync.join(fixture.assetsRoot,`textures/live/paper${i}.png`),pathSync.join(sourcePublic,`textures/live/paper${i}.png`));
  const bundleDir=pathSync.join(runRoot,'source-bundle');
  const serveUrl=await bundle({
    entryPoint:pathSync.join(skillDir,'evals/video-shotcraft-list-stack-source-baseline.entry.tsx'),
    outDir:bundleDir,publicDir:sourcePublic,rootDir:repoRoot,enableCaching:false,
    webpackOverride:(config)=>{
      const require=runtimeRequire;
      config.resolve ||= {};
      config.resolve.modules=[...(config.resolve.modules||[]),pathSync.join(runtimeRoot,'node_modules')];
      config.resolve.alias={...(config.resolve.alias||{}),react:require.resolve('react'),'react-dom':require.resolve('react-dom')};
      return config;
    },
  });
  const sourceComposition=await selectComposition({serveUrl,id:'ListStackPressSourceBaseline',inputProps:{},browserExecutable:browser,logLevel:'error'});
  const sourcePath=pathSync.join(outputsRoot,'source-88f.mp4');
  const tempRoot=pathSync.join(runRoot,'remotion-tmp');
  const cacheDir=pathSync.join(runRoot,'remotion-cache');
  await fs.mkdir(tempRoot,{recursive:true}); await fs.mkdir(cacheDir,{recursive:true});
  const envKeys=['TMPDIR','TMP','TEMP','XDG_CACHE_HOME','npm_config_cache','REMOTION_CACHE_DIR'];
  const previous=Object.fromEntries(envKeys.map((key)=>[key,process.env[key]]));
  const envValues=[tempRoot,tempRoot,tempRoot,cacheDir,pathSync.join(cacheDir,'npm'),pathSync.join(cacheDir,'remotion')];
  envKeys.forEach((key,index)=>process.env[key]=envValues[index]);
  try {
    await renderMedia({serveUrl,composition:sourceComposition,inputProps:{},outputLocation:sourcePath,codec:'h264',audioCodec:null,muted:true,enforceAudioTrack:false,crf:17,pixelFormat:'yuv420p',browserExecutable:browser,logLevel:'error',overwrite:false});
    for (const frame of [0,6,13,18,26,34,76,87]) {
      await renderStill({serveUrl,composition:sourceComposition,inputProps:{},frame,output:pathSync.join(outputsRoot,`source-frame-${frame}.png`),imageFormat:'png',browserExecutable:browser,logLevel:'error',overwrite:false});
    }
  } finally {
    for (const key of envKeys) previous[key] == null ? delete process.env[key] : process.env[key]=previous[key];
  }
  for (const frame of [0,6,13,18,26,34,87]) {
    run(process.execPath, [pathSync.join(skillDir,'scripts/templates.mjs'),'preview',template.id,'--spec',preparedPath,'--output',pathSync.join(outputsRoot,`adapted-frame-${frame}.png`),'--time',(frame/30).toFixed(9),'--assets-root',fixture.assetsRoot,'--cache-dir',pathSync.join(cacheRoot,`preview-${frame}`),'--browser',browser,'--ffmpeg',ffmpeg]);
  }
  const pngKeyframes=[];
  for (const frame of [0,6,13,18,26,34,76,87]) {
    const sourceStill=pathSync.join(outputsRoot,`source-frame-${frame}.png`);
    const adaptedStill=pathSync.join(outputsRoot,`adapted-frame-${frame}.png`);
    const psnrPath=pathSync.join(outputsRoot,`source-vs-adapted-frame-${frame}.psnr.log`);
    run(ffmpeg,['-v','warning','-i',sourceStill,'-i',adaptedStill,'-lavfi',`[0:v][1:v]psnr=stats_file=${psnrPath}`,'-f','null','-']);
    const detail=fsSync.readFileSync(psnrPath,'utf8').trim();
    const psnrAvg=Number(detail.match(/\bpsnr_avg:([^ ]+)/)?.[1]);
    pngKeyframes.push({frame,sourcePngSha256:sha256(fsSync.readFileSync(sourceStill)),adaptedPngSha256:sha256(fsSync.readFileSync(adaptedStill)),psnrAvg:Number.isFinite(psnrAvg)?psnrAvg:'infinity',psnrStatsPath:psnrPath});
  }
  const sourceFrames=framemd5(sourcePath,ffmpeg), adaptedFrames=framemd5(adaptedPath,ffmpeg);
  assert.equal(sourceFrames.length,88,'source baseline must play sequentially for all 88 frames');
  assert.equal(adaptedFrames.length,88,'local adaptation must play sequentially for all 88 frames');
  const keyframes=[0,6,13,18,26,28,30,42,54,58,74,76,77,82,84,87];
  const frameStats=compareDecodedVideos(sourcePath,adaptedPath,ffmpeg,pathSync.join(outputsRoot,'source-vs-adapted-psnr.log'));
  assert.equal(frameStats.length,88,'decoded comparison must cover the complete sequence');
  const finitePsnr=frameStats.map((row)=>row.psnrAvg).filter(Number.isFinite);
  const meanPsnr=finitePsnr.reduce((sum,value)=>sum+value,0)/finitePsnr.length;
  const minPsnr=Math.min(...finitePsnr);
  assert.ok(minPsnr>=50,`minimum decoded-frame PSNR should remain >=50 dB (observed ${minPsnr.toFixed(2)})`);
  assert.ok(meanPsnr>=55,`mean decoded-frame PSNR should remain >=55 dB (observed ${meanPsnr.toFixed(2)})`);
  assert.ok(keyframes.every((index)=>frameStats[index].psnrAvg===Infinity||frameStats[index].psnrAvg>=50),'each declared keyframe should meet the decoded visual-difference threshold');
  const evidence={
    kind:'technical-fixture-source-adaptation-comparison',sourceCommit:template.sourceMethodAdaptation.sourceCommit,
    sourceComponent:{path:template.component.path,sha256:template.component.sha256},
    localImplementation:manifest.source.localImplementation,
    inputAssets:manifest.assets.map(({role,sha256,width,height,assetLicense})=>({role,sha256,width,height,assetLicense})),
    durationInFrames:88,fps:30,keyframes,decodedFrameCount:{source:sourceFrames.length,adapted:adaptedFrames.length},
    exactDecodedFrameMatches:sourceFrames.filter((hash,index)=>hash===adaptedFrames[index]).length,
    decodedFramePsnr:{metric:'ffmpeg psnr; same 1920x1080@30 sequence after decoding',meanDb:meanPsnr,minDb:minPsnr,firstDifferentFrame:frameStats.find((row)=>Number.isFinite(row.psnrAvg))?.frame,keyframes:keyframes.map((index)=>({frame:index,psnrAvg:Number.isFinite(frameStats[index].psnrAvg)?frameStats[index].psnrAvg:'infinity'}))},
    losslessPngKeyframes:pngKeyframes,
    sourceOutput:sourcePath,adaptedOutput:adaptedPath,preparedInput:preparedPath,previewOutput:previewPath,psnrStatsPath:pathSync.join(outputsRoot,'source-vs-adapted-psnr.log'),
    note:'Synthetic geometric PNGs and parity-only source copy are technical fixtures, not knowledge-animation sample or quality evidence.',
  };
  await fs.writeFile(pathSync.join(outputsRoot,'comparison.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
});
