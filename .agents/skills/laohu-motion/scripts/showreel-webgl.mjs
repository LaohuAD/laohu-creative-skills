import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
const cacheLifetime = 15 * 60 * 1000;
const probeVersion = createHash('sha256').update(fs.readFileSync(self)).digest('hex');

function pathVersion(candidate) {
  if (!candidate) return null;
  const stats = fs.statSync(candidate, { throwIfNoEntry: false });
  return [candidate, stats?.ino, stats?.mtimeMs, stats?.size];
}

function contextKey(env, browserModule, depsRoot) {
  const session = env.CODEX_THREAD_ID || env.CODEX_SESSION_ID || env.TERM_SESSION_ID || env.ITERM_SESSION_ID || process.ppid;
  const confinement = [env.CODEX_PERMISSION_PROFILE, env.APP_SANDBOX_CONTAINER_ID, env.SANDBOX_PROFILE, env.FLATPAK_ID, env.SNAP];
  const context = [probeVersion, process.platform, process.arch, os.hostname(), os.release(), process.getuid?.(), session, confinement,
    browserModule, depsRoot, pathVersion(env.CHROME_PATH), pathVersion(env.PLAYWRIGHT_BROWSERS_PATH)];
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}

function attempt(angle, { cwd, env, browserModule, depsRoot, threeRoot }) {
  const result = spawnSync(process.execPath, [self, browserModule, depsRoot, threeRoot || ''], {
    cwd, env: { ...env, SHOWREEL_ANGLE: angle }, encoding: 'utf8', timeout: 35_000,
  });
  try {
    if (result.status === 0) return { angle, ...JSON.parse(result.stdout) };
  } catch {}
  return { angle, error: result.error?.message ?? result.stderr?.trim().slice(0, 420) ?? 'browser probe failed' };
}

export function isAppleMetal(renderer = '') { return /angle metal|apple.*metal|metal.*apple/i.test(renderer); }

export function webglMode(renderer = '') {
  if (isAppleMetal(renderer)) return 'Apple Metal (hardware)';
  if (/swiftshader/i.test(renderer)) return 'SwiftShader (software fallback)';
  if (/llvmpipe|software/i.test(renderer)) return `${renderer} (software fallback)`;
  return renderer || 'renderer not reported';
}

export function selectShowreelWebgl({ cwd, env, browserModule, depsRoot, cacheDir, assertWorkDisk, fresh = false, threeRoot = null }) {
  const explicit = env.SHOWREEL_ANGLE;
  const angles = explicit ? [explicit] : process.platform === 'darwin' ? ['metal', 'default', 'swiftshader'] : ['default', 'swiftshader'];
  let file;
  if (!explicit) {
    file = assertWorkDisk(path.join(cacheDir, `${contextKey(env, browserModule, depsRoot)}.json`), 'WebGL selection cache');
    if (!fresh && !threeRoot) {
      try {
        const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (angles.includes(cached.selected.angle) && cached.selected.shader?.ok && Date.now() - cached.at < cacheLifetime) {
          return { ...cached, cached: true };
        }
      } catch {}
    }
  }
  const attempts = [];
  for (const angle of angles) {
    const expectedMetal = !explicit && angle === 'metal';
    const result = attempt(angle, { cwd, env, browserModule, depsRoot, threeRoot });
    attempts.push(result);
    if (!result.shader?.ok || (expectedMetal && !isAppleMetal(result.shader.renderer))) continue;
    const selection = { selected: result, attempts, at: Date.now() };
    if (file) {
      fs.mkdirSync(cacheDir, { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporary, JSON.stringify(selection) + '\n', { flag: 'wx' });
        fs.renameSync(temporary, file);
      } finally { fs.rmSync(temporary, { force: true }); }
    }
    return selection;
  }
  // A functioning browser can still render 2D when every WebGL2 draw failed.
  const selected = attempts.find(row => row.shader?.ok) ?? attempts.find(row => row.angle === 'default' && row.browser)
    ?? attempts.find(row => row.browser) ?? attempts.at(-1);
  // A fresh failed probe invalidates a previously successful selection in this context.
  if (file && fs.existsSync(file)) fs.rmSync(file);
  return { selected, attempts };
}

function drawWebgl() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) return { ok: false, reason: 'WebGL2 context unavailable' };
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
  const shader = (type, source) => {
    const item = gl.createShader(type);
    gl.shaderSource(item, source);
    gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
    return item;
  };
  try {
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, `#version 300 es
      const vec2 vertices[3] = vec2[3](vec2(-0.75, -0.75), vec2(0.75, -0.75), vec2(0.0, 0.75));
      void main() { gl_Position = vec4(vertices[gl_VertexID], 0.0, 1.0); }`));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      out vec4 color;
      void main() { color = vec4(0.75, 0.25, 0.5, 1.0); }`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.viewport(0, 0, 16, 16);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixel = (x, y) => {
      const bytes = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      return Array.from(bytes);
    };
    const center = pixel(8, 8);
    const corner = pixel(0, 0);
    const expected = [191, 64, 128, 255];
    const glError = gl.getError();
    const ok = !glError && center.every((value, index) => Math.abs(value - expected[index]) <= 1)
      && corner.join(',') === '0,0,0,255';
    return { ok, renderer, center, corner, ...(ok ? {} : { reason: `unexpected shader pixels (GL error ${glError})` }) };
  } catch (error) {
    return { ok: false, renderer, reason: error.message };
  } finally {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

async function drawThree(browser, serve, root) {
  const { server, port } = await serve(root);
  const origin = `http://127.0.0.1:${port}`;
  const page = await browser.newPage();
  const requestsOutsideProject = [];
  try {
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        requestsOutsideProject.push(url.origin);
        return route.abort();
      }
      if (url.pathname === '/__three_smoke.html') return route.fulfill({ contentType: 'text/html', body: `<!doctype html>
        <script type="importmap">{"imports":{"three":"./build/three.module.js","three/addons/":"./examples/jsm/"}}</script>` });
      return route.continue();
    });
    await page.goto(`${origin}/__three_smoke.html`);
    const evidence = await page.evaluate(async () => {
      const THREE = await import('three');
      const { RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js');
      const size = 32;
      const renderer = new THREE.WebGLRenderer({ antialias: false });
      const buffer = new THREE.WebGLRenderTarget(size, size);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 10);
      camera.position.z = 4;
      const geometry = new RoundedBoxGeometry(1.4, 1.4, 1.4, 2, 0.15);
      const material = new THREE.MeshNormalMaterial();
      const object = new THREE.Mesh(geometry, material);
      object.rotation.set(0.4, 0.7, 0.1);
      scene.add(object);
      renderer.setRenderTarget(buffer);
      renderer.render(scene, camera);
      const pixels = new Uint8Array(size * size * 4);
      renderer.readRenderTargetPixels(buffer, 0, 0, size, size, pixels);
      let coloredPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 48) coloredPixels++;
      }
      const center = Array.from(pixels.slice((size / 2 * size + size / 2) * 4, (size / 2 * size + size / 2) * 4 + 4));
      const corner = Array.from(pixels.slice(0, 4));
      const glError = renderer.getContext().getError();
      geometry.dispose();
      material.dispose();
      buffer.dispose();
      renderer.dispose();
      return { ok: !glError && coloredPixels > 80 && coloredPixels < 800 && corner.join(',') === '0,0,0,255'
        && center.slice(0, 3).some(value => value > 48), revision: THREE.REVISION, coloredPixels, center, corner };
    });
    return { ...evidence, ok: evidence.ok && !requestsOutsideProject.length, blockedRequests: requestsOutsideProject.length };
  } catch (error) {
    return { ok: false, reason: error.message.split('\n')[0], blockedRequests: requestsOutsideProject.length };
  } finally {
    await page.close();
    server.close();
  }
}

async function runProbe(browserModule, depsRoot, threeRoot) {
  const { loadChromium, launch, serve } = await import(pathToFileURL(browserModule).href);
  const chromium = await loadChromium(depsRoot);
  const browser = await launch({ launch: options => chromium.launch({ ...options, timeout: 8000 }) });
  try {
    const page = await browser.newPage();
    const shader = await page.evaluate(drawWebgl).catch(error => ({ ok: false, reason: error.message.split('\n')[0] }));
    await page.close();
    const three = threeRoot && shader.ok ? await drawThree(browser, serve, threeRoot) : null;
    return { browser: browser.version(), shader, ...(three ? { three } : {}) };
  } finally { await browser.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  try { console.log(JSON.stringify(await runProbe(...process.argv.slice(2)))); }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
