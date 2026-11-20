#!/usr/bin/env node
import { createReadStream, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { needsBriefTextInputs, readSetup, snapshot, textMap, visibleProjectFile, workbenchModel } from '../production-workbench/model.mjs';

import { readTasks } from '../production-workbench/tasks.mjs';
import { importInput, mediaTypes } from '../production-workbench/materials.mjs';
import { changeCut, currentEdit, readCut, saveSelection, productionUnits } from './clip-edits.mjs';

export const OPENMOTION_COMMIT = 'd10c1c9985ec874625818a9628d06a111a8feae8';
const repo = fileURLToPath(new URL('../../../../../../', import.meta.url));
const progressSource = fileURLToPath(new URL('./ProductionProgress.tsx', import.meta.url));
const embedSource = fileURLToPath(new URL('./GardenEmbed.tsx', import.meta.url));
const defaultGarden = fileURLToPath(new URL('../laohu-showreel/assets/editor/', import.meta.url));
const showreelCli = fileURLToPath(new URL('../../../scripts/laohu-showreel.mjs', import.meta.url));
const sceneTextFiles = new Set([textMap, '.cache/brief-text-contract.mjs', '.cache/native-caption-runtime.mjs']);
const officialOrigin = 'https://github.com/nexu-io/openmotion';
const execute = promisify(execFile);
const studioAssetTypes = new Map(Object.entries({
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.srt': 'text/plain; charset=utf-8',
}));
const gardenAssetTypes = new Map([...Object.entries(mediaTypes), ...studioAssetTypes, ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.glb', 'model/gltf-binary'], ['.gltf', 'model/gltf+json'], ['.ktx2', 'image/ktx2'], ['.wasm', 'application/wasm'],
  ...['.bin', '.hdr', '.exr'].map(extension => [extension, 'application/octet-stream'])]);

function workVolumePath(candidate, device) {
  let ancestor = path.resolve(candidate);
  while (!existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
  if (statSync(realpathSync(ancestor)).dev !== device) throw new Error(`路径须与工作目录位于同盘：${candidate}`);
  return candidate;
}

function command(executable, args, options = {}) {
  const { output, ...settings } = options;
  const result = spawnSync(executable, args, { ...settings, encoding: 'utf8', stdio: output ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} ${args[0]} 失败（${result.status ?? result.signal}）。`);
  return result.stdout;
}

function replaceSource(source, before, after, file) {
  if (source.split(before).length !== 2) throw new Error(`OpenMotion 接口与固定源码不符：${file}`);
  return source.replace(before, () => after);
}

function sourceOverlay(source, build) {
  const changes = new Map([
    ['studio/src/main.tsx', [
      ['import { StrictMode } from "react";', 'import { lazy, StrictMode, Suspense } from "react";'],
      ['createRoot(document.getElementById("root")!).render(',
        `const gardenEmbed = /^\\/studio\\/embed\\/?$/.test(window.location.pathname);
const GardenEmbed = lazy(() => import("./motion/GardenEmbed"));

createRoot(document.getElementById("root")!).render(`],
      ['        <MotionStudioHost><MotionApp /></MotionStudioHost>',
        `        {gardenEmbed ? <Suspense fallback={<div role="status">正在打开工程工作区…</div>}><GardenEmbed /></Suspense>
          : <MotionStudioHost><MotionApp /></MotionStudioHost>}`],
    ]],
    ['studio/src/motion/StudioHost.tsx', [
      ['  mvpEditor?: boolean;', '  mvpEditor?: boolean;\n  gardenEmbedded?: boolean;'],
    ]],
    ['studio/src/App.tsx', [
      ['  const mvpEditor = useStudioHost()?.mvpEditor ?? false;',
        '  const studioHost = useStudioHost();\n  const gardenEmbedded = studioHost?.gardenEmbedded === true;\n  const mvpEditor = studioHost?.mvpEditor ?? false;'],
      ['                onDragOver={fileDrop.onDragOver}\n                onDrop={fileDrop.onDrop}',
        '                onDragOver={gardenEmbedded ? undefined : fileDrop.onDragOver}\n                onDrop={gardenEmbedded ? undefined : fileDrop.onDrop}'],
      ['                <StudioHeader\n', '                {!gardenEmbedded && <StudioHeader\n'],
      ['                  onExport={handleExport}\n                />', '                  onExport={handleExport}\n                />}'],
    ]],
    ['studio/src/components/EditorShell.tsx', [
      ['import { useStudioHost } from "../motion/StudioHost";',
        'import { useStudioHost } from "../motion/StudioHost";\n\nconst GARDEN_PANELS = ["preview", "timeline"] as const;'],
      ['  const timelineEditCallbacks = useTimelineEditCallbacks({',
        '  const gardenEmbedded = useStudioHost()?.gardenEmbedded === true;\n  const timelineEditCallbacks = useTimelineEditCallbacks({'],
      ['<TimelineEditProvider value={timelineEditCallbacks}>', '<TimelineEditProvider value={gardenEmbedded ? {} : timelineEditCallbacks}>'],
      ['  const host = useStudioHost();', '  const host = useStudioHost();\n  const gardenEmbedded = host?.gardenEmbedded === true;'],
      ['      <StudioAgentTools />', '      {!gardenEmbedded && <StudioAgentTools />}'],
      ['        panels={host?.mvpEditor ? MVP_PANEL_IDS : undefined}', '        panels={gardenEmbedded ? GARDEN_PANELS : host?.mvpEditor ? MVP_PANEL_IDS : undefined}'],
      ['        storageKey={host?.mvpEditor ? "motion.mvp.dock.v1" : undefined}',
        '        storageKey={gardenEmbedded ? "motion.garden.dock.v1" : host?.mvpEditor ? "motion.mvp.dock.v1" : undefined}'],
      ...['previewOverlay','onPreviewBlockDrop','onFileDrop','onAssetDrop','onBlockDrop','onCompositionDrop','onDeleteElement','onCopyClip','onPasteClip','onDuplicateClip','canPasteClip','clipMenuItems','splitShortcut'].map(name => {
        const isPreview = name === 'previewOverlay' || name === 'onPreviewBlockDrop';
        const indent = isPreview ? '\n              ' : '\n            ';
        return [`${indent}${name}={${name}}`, `${indent}${name}={gardenEmbedded ? ${name === 'previewOverlay' ? 'null' : 'undefined'} : ${name}}`];
      }),
      ['        {panels}\n        {host?.panels}', '        {!gardenEmbedded && <>{panels}{host?.panels}</>}'],
    ]],
    ['studio/src/components/TimelineToolbar.tsx', [
      ['import { useMvpEditor } from "../motion/StudioHost";', 'import { useMvpEditor, useStudioHost } from "../motion/StudioHost";'],
      ['  const mvp = useMvpEditor();', '  const mvp = useMvpEditor();\n  const gardenEmbedded = useStudioHost()?.gardenEmbedded === true;'],
      ['        <div className="flex items-center gap-0.5">\n          {showHistory',
        '        {gardenEmbedded ? <div aria-hidden="true" /> : <div className="flex items-center gap-0.5">\n          {showHistory'],
      ['        </div>\n        <div className="flex items-center gap-0.5">\n          <TimelineBehaviorToggles />\n          {rightActions}',
        '        </div>}\n        <div className="flex items-center gap-0.5">\n          {!gardenEmbedded && <><TimelineBehaviorToggles />{rightActions}</>}'],
    ]],
    ['studio/src/motion/MotionStudioHost.tsx', [
      ["import { WorkspaceSaveStatus } from './WorkspaceSaveStatus';", "import { WorkspaceSaveStatus } from './WorkspaceSaveStatus';\nimport { ProductionProgress } from './ProductionProgress';"],
      ['headerActions: <WorkspaceSaveStatus />,', 'headerActions: <><WorkspaceSaveStatus /><ProductionProgress /></>,'],
    ]],
    ['studio/src/components/nle/TimelinePane.tsx', [
      ['import type { ReactNode } from "react";', 'import { useCallback, type ReactNode } from "react";'],
      ['import { MotionTimelineMedia } from "../../motion/MotionTimelineMedia";',
        'import { MotionTimelineMedia } from "../../motion/MotionTimelineMedia";\nimport { useStudioHost } from "../../motion/StudioHost";'],
      ['  const sizing = useTimelineDockSizing();', '  const sizing = useTimelineDockSizing();\n  const gardenEmbedded = useStudioHost()?.gardenEmbedded === true;'],
      ['    projectId,\n    seek,', '    projectId,\n    seek,\n    iframeRef,'],
      ['  // Move/resize/split come from the timeline edit context, not props.',
        `  const selectClip = useCallback((clip: TimelineElement | null) => {
    onSelectTimelineElement?.(clip);
    if (!clip || !/^laohu-(?:caption|frame|motion|section|seam|chapter)-/.test(clip.domId ?? clip.id)) return;
    const root = iframeRef.current?.contentDocument?.querySelector<HTMLElement>("[data-composition-id][data-fps]");
    const [numerator, denominator = 1] = (root?.dataset.fps ?? "30").split("/").map(Number);
    const fps = numerator / denominator;
    // Subtitle and shot boundaries can fall between two rendered frames.
    seek(Number.isFinite(fps) && fps > 0 ? Math.ceil(clip.start * fps - 1e-7) / fps : clip.start);
  }, [onSelectTimelineElement, seek, iframeRef]);

  // Move/resize/split come from the timeline edit context, not props.`],
      ['onSelectElement={onSelectTimelineElement}', 'onSelectElement={selectClip}'],
      ['      data-studio-timeline="true"', '      data-studio-timeline="true"\n      onContextMenuCapture={gardenEmbedded ? event => { event.preventDefault(); event.stopPropagation(); } : undefined}'],
      ['{timelineToolbar}<MotionTimelineMedia', '{timelineToolbar}{!gardenEmbedded && <MotionTimelineMedia'],
      ['onFileDrop={onFileDrop} onAssetDrop={onAssetDrop} />', 'onFileDrop={onFileDrop} onAssetDrop={onAssetDrop} />}'],
    ]],
    ['studio/src/player/components/Player.tsx', [
      ['          player.removeAttribute("no-load-timeout");', '          player.removeAttribute("no-load-timeout");\n          iframe.removeAttribute("srcdoc");'],
      [`        player.setAttribute("src", src);
        container.appendChild(player);`,
        `        container.appendChild(player);
        player.setAttribute("src", src);
        const blankLoad = new AbortController();
        // Keep the original player and sandbox when a local iframe navigation stalls at about:blank.
        const retryBlank = setTimeout(() => {
          if (!/^\\/(?:progress|studio\\/(?:embed|full))\\/?$/.test(window.location.pathname) || player.ready || iframe.contentDocument?.URL !== "about:blank") return;
          const preview = new URL(iframe.src, window.location.origin);
          if (preview.origin !== window.location.origin || !/^\\/api\\/projects\\/[^/]+\\/preview(?:\\/comp\\/.+)?$/.test(preview.pathname)) return;
          void fetch(preview, { cache: "no-store", signal: blankLoad.signal }).then(async response => {
            if (!response.ok) return;
            const html = await response.text();
            if (!blankLoad.signal.aborted && !player.ready && iframe.contentDocument?.URL === "about:blank" &&
                html.includes("data-hyperframes-preview-runtime") && html.includes("<base href=")) iframe.srcdoc = html;
          }).catch(() => {});
        }, 2200);`],
      ['          stopLoadingBrand();', '          clearTimeout(retryBlank);\n          blankLoad.abort();\n          stopLoadingBrand();'],
    ]],
  ]);
  for (const [file, replacements] of changes) {
    let text = command('git', ['-C', source, 'show', `${OPENMOTION_COMMIT}:${file}`], { output: true });
    for (const [before, after] of replacements) text = replaceSource(text, before, after, file);
    writeFileSync(path.join(build, file), text);
  }
  writeFileSync(path.join(build, 'studio/src/motion/ProductionProgress.tsx'), readFileSync(progressSource));
  writeFileSync(path.join(build, 'studio/src/motion/GardenEmbed.tsx'), readFileSync(embedSource));
}

function prepareRuntime(workRoot, cache, build, device) {
  const packageLock = path.join(build, 'package-lock.json');
  const compiled = path.join(build, 'studio/build/index.html');
  const stamp = path.join(build, '.laohu-overlay');
  const fingerprint = createHash('sha256').update(readFileSync(progressSource)).update(readFileSync(embedSource)).update(sourceOverlay.toString()).digest('hex');
  if (existsSync(compiled) && existsSync(stamp) && readFileSync(stamp, 'utf8') === fingerprint) return;
  const candidates = process.env.LAOHU_OPENMOTION_SOURCE ? [process.env.LAOHU_OPENMOTION_SOURCE] :
    [path.join(workRoot, '.cache/upstream/openmotion'), path.join(repo, '.cache/upstream/openmotion')];
  const source = candidates.find(candidate => existsSync(path.join(candidate, '.git')));
  if (!source) throw new Error(`工作盘缺少官方 OpenMotion 源码。把 ${officialOrigin} 的 Git checkout 放入 .cache/upstream/openmotion 或设置 LAOHU_OPENMOTION_SOURCE。`);
  workVolumePath(source, device);
  const remote = command('git', ['-C', source, 'remote', 'get-url', 'origin'], { output: true }).trim();
  if (!/^(?:https:\/\/github\.com\/|git@github\.com:)nexu-io\/openmotion(?:\.git)?\/?$/.test(remote)) {
    throw new Error(`OpenMotion 源码须来自 ${officialOrigin}。`);
  }
  command('git', ['-C', source, 'cat-file', '-e', `${OPENMOTION_COMMIT}^{commit}`], { output: true });
  mkdirSync(path.dirname(build), { recursive: true });
  // One writer per checkout. Keep any existing built Studio available when a second launcher is waiting.
  const lock = `${build}.build-lock`;
  try { mkdirSync(lock); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`OpenMotion Studio 构建正在进行。${lock}`); throw error; }
  try {
    if (!existsSync(packageLock)) {
      mkdirSync(build, { recursive: true });
      const archive = path.join(lock, 'official.tar');
      command('git', ['-C', source, 'archive', `--output=${archive}`, OPENMOTION_COMMIT]);
      command('tar', ['-xf', archive, '-C', build]);
    }
    const run = (...args) => command('npm', args, { cwd: build, env: process.env });
    const dependency = path.join(build, 'node_modules/@hyperframes/studio-server/package.json');
    if (!existsSync(dependency)) run('ci', '--no-audit', '--no-fund');
    sourceOverlay(source, build);
    run('run', 'build:studio');
    writeFileSync(stamp, fingerprint);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function sourceAdapter(project, workspace, build) {
  const adapter = path.join(project, 'studio/prepare.mjs');
  const binding = path.join(workspace, 'project/showreel-binding.json');
  if (workspace !== path.join(project, 'studio/openmotion') || !existsSync(adapter)) return null;
  const state = { phase: 'idle', note: '' };
  let pending;
  function run() {
    if (pending) return pending;
    Object.assign(state, { phase: 'running', note: '正在同步本片源文件…' });
    pending = execute(process.execPath, [adapter, '--openmotion-root', build], { cwd: project, maxBuffer: 128 * 1024 })
      .then(() => { Object.assign(state, { phase: 'idle', note: '' }); })
      .catch(error => {
        Object.assign(state, { phase: 'attention', note: '源文件同步待核验，Studio 编辑副本已保留。' });
        console.error('OpenMotion source sync:', String(error.stderr || error.message).split('\n').filter(Boolean).slice(0, 9).join('\n'));
        throw error;
      }).finally(() => { pending = undefined; });
    return pending;
  }
  function signature() {
    let files = [];
    if (existsSync(binding)) files = Object.keys(JSON.parse(readFileSync(binding, 'utf8')).sourceFiles ?? {});
    const check = ['studio/prepare.mjs', 'timeline.js', 'clock-data.js', '双语字幕.srt', 'voice/双语字幕.srt',
      'voice/caption-manifest.json', '.showreel-input-delivery.json', '.showreel-progress/workbench.json',
      '.showreel-progress/status.json', '.showreel-progress/workbench-checks.json', '.showreel-progress/artifacts', ...files];
    return JSON.stringify([...new Set(check)].sort().flatMap(file => {
      if (path.isAbsolute(file) || file.startsWith('studio/openmotion/') || file.split('/').includes('..')) return [];
      const item = statSync(path.join(project, file), { bigint: true, throwIfNoEntry: false });
      return [[file, String(item?.mtimeNs), String(item?.size)]];
    }));
  }
  return {
    run, state,
    start() {
      let seen, stable;
      try { seen = stable = signature(); }
      catch (error) { console.error('OpenMotion source sync:', error.message); }
      void run().catch(() => {});
      const timer = setInterval(() => {
        try {
          const next = signature();
          if (next === seen && next !== stable && !pending) {
            stable = next;
            void run().catch(() => {});
          }
          seen = next;
        } catch (error) { console.error('OpenMotion source sync:', error.message); }
      }, 1800);
      timer.unref();
      return () => { clearInterval(timer); return pending?.catch(() => {}); };
    },
  };
}

async function vacantPort(requested = 0) {
  const probe = createServer();
  try {
    const port = await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(requested, '127.0.0.1', () => resolve(probe.address().port));
    });
    await new Promise(resolve => probe.close(resolve));
    return port;
  } catch (error) {
    if (error.code === 'EADDRINUSE') return null;
    throw error;
  }
}

async function studioPort(requested) {
  if (requested) {
    const nativePort = Math.max(20000, requested + 1);
    if (!await vacantPort(requested) || !await vacantPort(nativePort)) {
      throw new Error(`OpenMotion Studio 需要空闲的 ${requested} 和 ${nativePort} 端口。`);
    }
    return requested;
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const port = await vacantPort();
    if (port < 65535 && await vacantPort(port + 1)) return port;
  }
  throw new Error('无法分配 OpenMotion Studio 的相邻本机端口。');
}

function reply(res, status, data, method = 'GET') {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(method === 'HEAD' ? undefined : JSON.stringify(data));
}

function serveEvidence(req, res, file, type) {
  const { size } = statSync(file);
  const headers = { 'Content-Type': type, 'Content-Length': size, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin', 'Accept-Ranges': 'bytes' };
  let start = 0, end = size - 1, status = 200;
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      if (range[1] && range[2]) end = Math.min(end, Number(range[2]));
    }
    if (!range || !range[1] && !range[2] || start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    headers['Content-Length'] = end - start + 1;
  }
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || !size) return res.end();
  const stream = createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

function serveGarden(req, res, root, file) {
  let target;
  try { target = realpathSync(path.resolve(root, file)); }
  catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
  const type = target && gardenAssetTypes.get(path.extname(target).toLowerCase());
  if (!type || !target.startsWith(realpathSync(root) + path.sep) || !statSync(target).isFile()) return false;
  const data = readFileSync(target);
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "frame-ancestors 'self'" });
  res.end(req.method === 'HEAD' ? undefined : data);
  return true;
}

function studioBridge(project, options, port, serveEditorFile, source) {
  const origin = `http://127.0.0.1:${port}`;
  const garden = options.garden ? path.resolve(project, options.garden) : defaultGarden;
  const cutShell = fileURLToPath(new URL('./', import.meta.url));
  const gardenEntry = options.garden ? 'index.html' : 'garden-studio.html';
  const gardenAssets = new Set(['/__showreel-editor/garden-studio.js', '/__showreel-editor/editor.css']);
  const dictationConfig=path.join(process.cwd(),'.cache','laohu-showreel','workbench-dictation.json');
  const configured=existsSync(dictationConfig)?JSON.parse(readFileSync(dictationConfig,'utf8')):{};
  const speechBinary=process.env.LAOHU_WORKBENCH_WHISPER || configured.binary;
  const speechModel=process.env.LAOHU_WORKBENCH_WHISPER_MODEL || configured.model;
  const dictation=Boolean(speechBinary && speechModel && existsSync(speechBinary) && existsSync(speechModel));
  let speechBusy=false;
  let memo, textCompile;
  const toEvidence = url => url?.replace(/^\/project\//, '/laohu-studio/evidence/');
  function evidenceLink(item) {
    return item.href ? { ...item, href: toEvidence(item.href) } : item;
  }
  async function currentTextProblem() {
    // Model polling and scene imports share one compiler job for the current Brief.
    for (let attempt = 0; attempt < 3; attempt++) {
      const source = needsBriefTextInputs(project);
      if (!source) return null;
      if (!textCompile || (textCompile.finishedAt &&
          (textCompile.source !== source || Date.now() - textCompile.finishedAt > 5000))) {
        const job = { source };
        job.done = execute(process.execPath, [showreelCli, 'text-inputs', project], { timeout: 60000 })
          .then(() => null, error => error.stderr?.trim().split('\n\n')[0].replace(/^laohu-showreel:\s*/u, '') ||
            '当前 Brief 的屏显文字与字体准备失败')
          .finally(() => { job.finishedAt = Date.now(); });
        textCompile = job;
      }
      const job = textCompile;
      const problem = await job.done;
      const current = needsBriefTextInputs(project);
      if (!current) return null;
      if (current === job.source) return problem || '当前 Brief 的字体资源尚未准备好';
    }
    return 'Brief 正在更新，等候当前版本的字体资源';
  }
  async function currentModel(setup) {
    const sceneInputError = await currentTextProblem();
    const versions = snapshot(project, setup);
    const artifacts = statSync(path.join(project, '.showreel-progress/artifacts'), { bigint: true, throwIfNoEntry: false });
    versions.revision = createHash('sha256').update(versions.revision).update(String(artifacts?.mtimeNs))
      .update(sceneInputError || '').digest('hex').slice(0, 20);
    if (memo?.revision !== versions.revision) {
      const value = workbenchModel(project, setup, versions, options)
        .then(model => ({ ...model, sceneInputError }))
        .catch(error => { if (memo?.revision === versions.revision) memo = null; throw error; });
      memo = { revision: versions.revision, value };
    }
    return memo.value;
  }
  function unitsForProgress(model, clips = []) {
    if (model.designError) return [];
    return model.designPlan?.units.filter(unit => ['动画', '混合'].includes(unit.role)).map(unit => ({
      ...unit,
      clipId: unit.clipIds.find(id => clips.some(clip => clip.id === id && clip.kind === 'animation')) ?? unit.clipIds[0] ?? '',
    }));
  }
  return async (req, res) => {
    const url = new URL(req.url || '/', origin);
    // Studio reuses preview URLs for fetches and iframe navigation. The iframe always needs a usable response body.
    if (req.method === 'GET' && req.headers['sec-fetch-dest'] === 'iframe' &&
        /^\/api\/projects\/[^/]+\/preview(?:\/comp\/.+)?$/.test(url.pathname)) {
      delete req.headers['if-none-match'];
      delete req.headers['if-modified-since'];
    }
    if (process.env.LAOHU_OPENMOTION_TRACE === '1' && /^\/api\/(?:projects|runtime)/.test(url.pathname)) {
      res.once('finish', () => console.error(req.method, res.statusCode, req.headers['sec-fetch-dest'] || '-', url.pathname, res.getHeader('content-type')));
    }
    const entry = url.pathname === '/' || /^\/progress\/?$/.test(url.pathname);
    const editor = /^\/studio\/(?:embed|full)\/?$/.test(url.pathname);
    const gardenAsset = gardenAssets.has(url.pathname);
    const oldWorkspace = /^\/studio\/production\/?$/.test(url.pathname);
    if (oldWorkspace || editor && !options.garden) {
      res.writeHead(302, {Location:'/progress','Cache-Control':'no-store'}); res.end(); return true;
    }
    const gardenModel = url.pathname === '/__workbench/model';
    const evidencePrefix = ['/laohu-studio/evidence/', '/project/'].find(prefix => url.pathname.startsWith(prefix));
    const cutApi = url.pathname === '/__workbench/cut';
    const importing = url.pathname === '/__workbench/input';
    const speech = url.pathname === '/__workbench/dictate';
    const selection = url.pathname === '/__workbench/selection';
    const cutAsset = ['/__workbench/cut.js','/__workbench/cut.css','/__workbench/progress-review.js'].includes(url.pathname);
    const sceneFile = url.pathname.startsWith('/__scene/');
    if (!importing && !speech &&  !cutAsset && !selection && !cutApi && !sceneFile && !entry && !editor && !gardenAsset && !gardenModel && !evidencePrefix && url.pathname !== '/laohu-studio/status') return false;
    if (![new URL(origin).host, `localhost:${port}`].includes(req.headers.host) ||
        req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
      reply(res, 403, { error: '制作工作台仅供本机访问' }, req.method);
      return true;
    }
    if (importing) {
      if(req.method !== 'POST' || req.headers.origin !== 'http://'+req.headers.host || !req.headers['x-input-name']) {
        reply(res,403,{error:'请从当前工作台导入本地素材'}); return true;
      }
      try {
        const file = await importInput(project,decodeURIComponent(req.headers['x-input-name']),req);
        reply(res,201,{file});
      } catch(e) { reply(res,400,{error:e.message}); }
      return true;
    }
    if (speech && req.method==='POST') {
      const format={'audio/webm':'matroska','audio/mp4':'mov','audio/ogg':'ogg','audio/wav':'wav'}[req.headers['content-type']?.split(';')[0]];
      if (!dictation || !format || req.headers.origin!=='http://'+req.headers.host) {reply(res,403,{error:'本机语音输入不可用'});return true;}
      if (speechBusy) {reply(res,409,{error:'请等上一条听写完成'});return true;}
      speechBusy=true;
      let folder;
      try {
        const data=[];let size=0;
        for await(const item of req){size+=item.length;if(size>4*1024*1024)throw Error('请将指令控制在 30 秒内');data.push(item);}
        folder=mkdtempSync(path.join(process.env.TMPDIR,'workbench-voice-'));
        const input=path.join(folder,'input'),wav=path.join(folder,'voice.wav'),out=path.join(folder,'command');
        writeFileSync(input,Buffer.concat(data));
        await execute('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file','-f',format,'-i',input,'-t','30','-vn','-ac','1','-ar','16000',wav],{timeout:30000});
        await execute(speechBinary,['-ng','-np','-nt','-l','zh','-t','4','-m',speechModel,'-otxt','-of',out,'-f',wav],{timeout:90000});
        reply(res,200,{text:readFileSync(out+'.txt','utf8').trim()});
      } catch(error){console.error('工作台听写',error.message);reply(res,422,{error:'未能识别这段录音，可以重新口述或输入文字'});}
      finally{if(folder)rmSync(folder,{force:true,recursive:true});speechBusy=false;}
      return true;
    }
    if ((cutApi || selection) && req.method === 'POST') {
      if (req.headers.origin !== origin && req.headers.origin !== 'http://'+req.headers.host ||
          req.headers['content-type'] !== 'application/json') { reply(res,403,{error:'需要本机工作台请求'}); return true; }
      try {
        let body = '';
        for await (const chunk of req) { body += chunk; if(body.length > 2048) throw Error('指令过长'); }
        const revision = selection ? saveSelection(project,JSON.parse(body)) : await changeCut(project,JSON.parse(body)); reply(res,200,{revision});
      } catch(error) {reply(res,409,{error:error.message});}
      return true;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      reply(res, 405, { error: '此入口提供只读制作证据' }, req.method);
      return true;
    }
    if (cutAsset || entry && !options.garden) {
      serveGarden(req,res,cutShell,cutAsset ? path.basename(url.pathname) : 'cut.html'); return true;
    }
    if (cutApi) {
      try {
        const cut = readCut(project);
        const setup = readSetup(project, options);
        const model = await currentModel(setup);
        const units = unitsForProgress(model, cut?.catalog.clips);
        const payload = cut ? { revision: cut.revision, clips: cut.catalog.clips, units: units ?? cut.catalog.units, assets: cut.catalog.assets,
          mix: cut.catalog.mixTarget, mixEdited: Boolean(cut.state.mixSha256 && cut.state.mixSha256 !== cut.catalog.baseMixSha256),
          mixHash: cut.state.mixSha256 || cut.catalog.baseMixSha256, edits: cut.state.edits, canUndo: cut.state.history.length > 0, canRedo: Boolean(cut.state.redo?.length) }
          : units || setup.mix ? { revision: 'planning', clips: [], units, edits: {}, canUndo: false,
            mix: setup.mix, mixHash: model.mix?.version } : null;
        reply(res, 200, payload, req.method);
      } catch(error){reply(res,422,{error:error.message});}
      return true;
    }
    let relative;
    if (sceneFile || evidencePrefix) {
      try { relative = decodeURIComponent(url.pathname.slice((sceneFile ? '/__scene/' : evidencePrefix).length)); }
      catch { reply(res, 404, { error: '无法读取当前工程资源' }, req.method); return true; }
      if (sceneTextFiles.has(relative)) {
        const problem = await currentTextProblem();
        if (problem) { reply(res, 409, { error: problem }, req.method); return true; }
      }
    }
    if (sceneFile) {
      let file;
      try { file=visibleProjectFile(project,readSetup(project,options),relative); } catch {}
      const ext=file && path.extname(file).toLowerCase();
      const type = gardenAssetTypes.get(ext) || ({
        '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
        '.txt': 'text/plain; charset=utf-8', '.ogg': 'audio/ogg',
      })[ext];
      if(!file || !type) reply(res,404,{error:'工程素材未就绪'});
      else {
        if(['.html','.js','.mjs','.css','.json'].includes(ext)){
          const bytes=readFileSync(file);
          res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; frame-ancestors 'self'"});res.end(req.method==='HEAD'?undefined:bytes);
        } else serveEvidence(req,res,file,type);
      }
      return true;
    }
    if (editor && options.standalone) {reply(res,404,{error:'当前项目使用片段工作台'});return true;}
    if (editor) {
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
      res.setHeader('Cache-Control', 'no-store');
      return serveEditorFile(new URL('/', origin), res);
    }
    if (entry || gardenAsset) {
      if (serveGarden(req, res, garden, entry ? gardenEntry : path.basename(url.pathname))) return true;
      reply(res, entry ? 503 : 404, { error: entry ? 'Garden Studio 外壳尚未就绪' : 'Garden 资源不存在' }, req.method);
      return true;
    }
    const setup = readSetup(project, options);
    if (gardenModel || url.pathname === '/laohu-studio/status') {
      const model = await currentModel(setup);
      const activeStage = { style: 'cover', scenes: 'motion', review: 'export' }[model.activeStage] ?? model.activeStage;
      const sourceNote = source?.state.note || undefined;
      if (gardenModel) {
        const briefFile=visibleProjectFile(project,setup,'brief.md');
        const units = unitsForProgress(model) ?? productionUnits(briefFile ? readFileSync(briefFile, 'utf8') : '', model.shots);
        reply(res, 200, { ...model, tasks: readTasks(project), editing: currentEdit(project), units, nativeStudio:!options.standalone,dictation, activeStage, sourceNote }, req.method);
      } else {
        reply(res, 200, { revision: model.revision, renderRevision: model.renderRevision, title: model.title, projectPhase: model.projectPhase,
          duration: model.duration, fps: model.fps, activeStage, sourceNote,
          stages: model.stages.map(evidenceLink), covers: model.covers.map(evidenceLink), shots: model.shots,
          directionSamples: model.directionSamples.map(evidenceLink),
          frames: model.frames.map(frame => ({ ...frame, file: toEvidence(frame.file) })),
          segments: model.segments.map(segment => ({ ...segment, proof: toEvidence(segment.proof), probes: segment.probes.map(evidenceLink) })),
          seams: model.seams.map(seam => ({ ...seam, proof: toEvidence(seam.proof) })),
        }, req.method);
      }
      return true;
    }
    if (evidencePrefix) {
      const type = gardenAssetTypes.get(path.extname(relative).toLowerCase());
      const file = type && visibleProjectFile(project, setup, relative);
      if (file) {
        serveEvidence(req, res, file, type);
        return true;
      }
    }
    reply(res, 404, { error: '该制作证据尚未提供' }, req.method);
    return true;
  };
}

export async function startOpenMotion(projectPath, options = {}) {
  const workRoot = realpathSync(process.cwd());
  const device = statSync(workRoot).dev;
  const project = realpathSync(workVolumePath(projectPath, device));
  if(existsSync(path.join(project,'.showreel-progress/clip-transaction'))){
    await changeCut(project,{action:'recover'});
  }
  const cache = workVolumePath(path.join(workRoot, '.cache', 'laohu-showreel'), device);
  const build = workVolumePath(path.join(cache, 'openmotion-studio', OPENMOTION_COMMIT), device);
  const workspace = workVolumePath(path.resolve(project, options.workspace || 'studio/openmotion'), device);
  const index = path.join(workspace, 'project', 'index.html');
  const source = sourceAdapter(project, workspace, build);
  const standalone = !existsSync(index) && !source;
  const tmp = workVolumePath(path.join(cache, 'tmp', 'openmotion-studio'), device);
  const npmCache = workVolumePath(path.join(cache, 'npm'), device);
  for (const directory of [tmp, npmCache]) mkdirSync(directory, { recursive: true });
  const port = await studioPort(options.port);
  Object.assign(process.env, { TMPDIR: tmp, TMP: tmp, TEMP: tmp, npm_config_cache: npmCache,
    MOTION_DATA_DIR: workspace, MOTION_BIND_HOST: '127.0.0.1', PORT: String(port),
    HYPERFRAMES_HISTORY_ROOT: workVolumePath(path.join(workspace, 'history'), device),
    HYPERFRAMES_CACHE_DIR: workVolumePath(path.join(cache, 'hyperframes'), device),
    HYPERFRAMES_CONFIG_DIR: workVolumePath(path.join(workspace, '.hyperframes-config'), device),
    OPENMOTION_TELEMETRY: '0', DO_NOT_TRACK: '1', HYPERFRAMES_NO_TELEMETRY: '1' });
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(chrome)) process.env.HYPERFRAMES_BROWSER_PATH ||= chrome;
  if (standalone) {
    const route=studioBridge(project,{...options,standalone:true},port,null,null);
    const server=createHttpServer((req,res)=>{route(req,res).then(handled=>{if(!handled)reply(res,404,{error:'未找到资源'});}).catch(error=>reply(res,500,{error:error.message}));});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    return {url:`http://127.0.0.1:${port}/progress`,async close(){await new Promise(resolve=>server.close(resolve));}};
  }
  prepareRuntime(workRoot, cache, build, device);
  if (!existsSync(index)) await source.run();

  const upstream = file => import(pathToFileURL(path.join(build, file)).href);
  const [{ startServer }, { WorkspaceStore }, { serveEditorFile }] = await Promise.all([
    upstream('server.ts'), upstream('workspace.ts'), upstream('editor-server.ts'),
  ]);
  const app = await startServer(new WorkspaceStore(workspace), port, {
    editor: true, fallbackIfPortBusy: false, privateHandler: studioBridge(project, options, port, serveEditorFile, source),
  });
  const stopRefresh = source?.start();
  return { url: `http://127.0.0.1:${port}/progress`, info: app.info,
    async close() { await Promise.all([stopRefresh?.(), app.close()]); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { positionals, values } = parseArgs({ allowPositionals: true, options: Object.fromEntries(
      ['port', 'workspace', 'garden', 'size', 'fps', 'duration', 'audio', 'workers', 'subframes', 'shutter', 'dpr', 'grain', 'crf']
        .map(name => [name, { type: 'string' }]),
    ) });
    if (positionals.length !== 1) throw new Error('用法 node server.mjs <project> [--port 51801]');
    const port = Number(values.port || 0);
    if (!Number.isInteger(port) || port < 0 || port > 65534) throw new Error('端口须为 0–65534 的整数。');
    const app = await startOpenMotion(positionals[0], { ...values, port,
      fps: Number(values.fps) || undefined, duration: Number(values.duration) || undefined });
    console.log(`Garden Studio ${app.url}\nOpenMotion 源码提交 ${OPENMOTION_COMMIT}`);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => app.close().finally(() => process.exit()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
