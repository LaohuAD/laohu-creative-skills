#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream';
import { parseArgs } from 'node:util';
import { createProgressServer } from '../laohu-showreel/scripts/lib/editor-progress.mjs';
import { localFile } from '../laohu-showreel/scripts/lib/editor-model.mjs';
import { waveform } from '../laohu-showreel/scripts/lib/editor-media.mjs';
import { readSetup, snapshot, visibleProjectFile, workbenchModel } from './model.mjs';

const own = path.dirname(fileURLToPath(import.meta.url));
const legacyAssets = new Set(['/api/project', '/api/progress']);
const mime = {
  html:'text/html', css:'text/css', js:'text/javascript', mjs:'text/javascript', json:'application/json',
  srt:'text/plain', md:'text/plain', txt:'text/plain', wav:'audio/wav', mp3:'audio/mpeg', flac:'audio/flac',
  m4a:'audio/mp4', ogg:'audio/ogg', mp4:'video/mp4', webm:'video/webm', png:'image/png',
  webp:'image/webp', jpg:'image/jpeg', jpeg:'image/jpeg', svg:'image/svg+xml', ttf:'font/ttf',
  otf:'font/otf', woff:'font/woff', woff2:'font/woff2', avif:'image/avif', glb:'model/gltf-binary',
  gltf:'model/gltf+json', wasm:'application/wasm', ktx2:'image/ktx2',
};
const baseHeaders = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'SAMEORIGIN' };

function reply(res, status, value) {
  res.writeHead(status, { ...baseHeaders, 'Content-Type':'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function served(req, res, file) {
  const { size } = fs.statSync(file);
  const encoding = mime[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';
  const headers = { ...baseHeaders, 'Content-Type':encoding, 'Accept-Ranges':'bytes' };
  let start = 0, end = size-1, status = 200;
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range && (range[1] || range[2])) {
      start = range[1] ? +range[1] : Math.max(0, size-(+range[2]));
      if (range[1] && range[2]) end = Math.min(end, +range[2]);
    }
    if (!range || !range[1] && !range[2] || start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      res.writeHead(416, { ...headers, 'Content-Range':`bytes */${size}` }); res.end(); return;
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`; status = 206;
  }
  res.writeHead(status, { ...headers, 'Content-Length':Math.max(0, end-start+1) });
  if (req.method === 'HEAD' || !size) res.end();
  else pipeline(fs.createReadStream(file, { start, end }), res, () => {});
}

function forwardLegacy(req, res, target, url) {
  const headers = { ...req.headers, host:target.host };
  if (headers.origin) headers.origin = target.origin;
  const remote = http.request({ hostname:target.hostname, port:target.port,
    path:url.pathname + url.search, method:req.method, headers }, upstream => {
    res.writeHead(upstream.statusCode, upstream.headers);
    pipeline(upstream, res, () => {});
  });
  remote.on('error', () => { if (!res.headersSent) reply(res, 503, { error:'旧工作台当前不可用' }); });
  req.pipe(remote);
}

export async function startWorkbench(root, options = {}) {
  root = fs.realpathSync(root);
  const requested = options.port || 0;
  let memo = null, peaks = null;
  const legacy = await createProgressServer(root, options);
  const legacyUrl = new URL(legacy.url);
  const getModel = (setup, versions) => {
    if (memo?.revision === versions.revision) return memo.value;
    const value = workbenchModel(root, setup, versions, options).catch(error => {
      if (memo?.revision === versions.revision) memo = null;
      throw error;
    });
    memo = { revision:versions.revision, value };
    return value;
  };
  const server = http.createServer(async (req,res) => {
    try {
      const port = server.address().port;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host) || req.headers.origin && !hosts.map(host => 'http://'+host).includes(req.headers.origin)) {
        reply(res, 403, { error:'工作台仅供本机访问' }); return;
      }
      if (!['GET','HEAD'].includes(req.method)) {
        reply(res, 405, { error:'工作台提供制作审阅' }); return;
      }
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const code = decodeURIComponent(url.pathname);
      if (code === '/' || code === '/progress' || code === '/progress/') {
        served(req,res,path.join(own,'index.html')); return;
      }
      if (code === '/legacy-progress' || code === '/editor') {
        res.writeHead(302, { ...baseHeaders, Location:legacyUrl.href }); res.end(); return;
      }
      if (legacyAssets.has(code) || code.startsWith('/api/preview/') || code.startsWith('/__showreel-editor/') || code.startsWith('/artifact/')) {
        forwardLegacy(req,res,legacyUrl,url); return;
      }
      if (['/__workbench/client.js','/__workbench/style.css'].includes(code)) {
        served(req,res,path.join(own,path.basename(code))); return;
      }
      const setup = readSetup(root, options);
      if (code === '/__workbench/model') {
        const versions = snapshot(root, setup);
        if (url.searchParams.get('if') === versions.revision) { res.writeHead(304,baseHeaders); res.end(); return; }
        reply(res, 200, await getModel(setup, versions)); return;
      }
      if (code === '/__workbench/wave' && setup.voicePath) {
        const file = localFile(root, setup.voicePath);
        const stat = fs.statSync(file);
        const id = `${file}:${stat.mtimeMs}:${stat.size}`;
        if (id !== peaks?.id) peaks = { id, value:waveform(root,{ file:setup.voicePath }).catch(error => {
          if (peaks?.id === id) peaks = null;
          throw error;
        }) };
        const data = await peaks.value;
        reply(res, 200, { interval:data.interval, peaks:data.peaks }); return;
      }
      if (code.startsWith('/project/')) {
        const file = visibleProjectFile(root,setup,code.slice('/project/'.length));
        if (file) { served(req,res,file); return; }
      }
      reply(res, 404, { error:'该制作证据尚未提供' });
    } catch (error) {
      if (res.headersSent) res.destroy();
      else reply(res, 503, { error:`工作台正在重新读取项目。 ${error.message}` });
    }
  });
  try {
    await new Promise((resolve,reject) => {
      server.once('error',reject);
      server.listen(requested,'127.0.0.1',resolve);
    });
  } catch (error) { await legacy.close(); throw error; }
  return {
    url:`http://127.0.0.1:${server.address().port}/progress`,
    legacy:legacyUrl.href,
    async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await legacy.close();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const qualityKeys = ['workers','subframes','shutter','dpr','grain','crf'];
    const { positionals, values } = parseArgs({
      allowPositionals:true,
      options:{ port:{type:'string'}, size:{type:'string'}, fps:{type:'string'},
        audio:{type:'string'}, duration:{type:'string'},
        ...Object.fromEntries(qualityKeys.map(name => [name,{type:'string'}])) },
    });
    if (positionals.length !== 1) throw new Error('用法 node server.mjs <project> [--port 51801] [--size 1920x1080] [--fps 30]');
    const port = values.port ? Number(values.port) : 0;
    const fps = values.fps ? Number(values.fps) : undefined;
    if (!Number.isInteger(port) || port<0 || port>65535) throw new Error('端口必须是 0–65535 的整数。');
    if (values.size && !/^\d{2,5}x\d{2,5}$/.test(values.size)) throw new Error('画幅使用 WxH，例如 1920x1080。');
    if (fps !== undefined && !(fps>0 && fps<=240)) throw new Error('FPS 需要介于 0–240。');
    const duration = values.duration ? Number(values.duration) : undefined;
    if (duration !== undefined && !(duration>0 && duration<=14400)) throw new Error('时长需要介于 0–14400 秒。');
    const quality = Object.fromEntries(qualityKeys.filter(k => values[k] !== undefined).map(k => [k,Number(values[k])]));
    const app = await startWorkbench(positionals[0],{ port, size:values.size, fps, duration, audio:values.audio, quality });
    console.log(`制作工作台 ${app.url}\n旧工作台 ${app.legacy}`);
    for (const signal of ['SIGINT','SIGTERM','SIGHUP']) process.once(signal,() => app.close().then(() => process.exit()));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
