import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test} from 'node:test';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const styleDir = path.join(skillDir, 'templates', 'styles', 'motion');
const runtimeDir = path.join(skillDir, 'templates', 'runtime', 'motion-vocabulary');
const index = JSON.parse(await fs.readFile(path.join(styleDir, 'index.json'), 'utf8'));
const runtimeIndex = JSON.parse(await fs.readFile(path.join(runtimeDir, 'index.json'), 'utf8'));
const productionMarkdown = (await fs.readFile(path.join(styleDir, 'motion-prompt.md'), 'utf8')).split(/\r?\n/);

function serial(value) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (ArrayBuffer.isView(value)) return {type: value.constructor.name, length: value.length};
  if (value && typeof value === 'object' && 'width' in value && 'height' in value) {
    return {type: 'canvas-like', width: value.width, height: value.height};
  }
  return Object.prototype.toString.call(value);
}

function makeContext(canvas) {
  const calls = [];
  const context = {
    canvas,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    measureText(text) {
      calls.push(['measureText', String(text)]);
      return {width: String(text).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2};
    },
    createLinearGradient(...args) { calls.push(['createLinearGradient', args]); return gradient('linear'); },
    createRadialGradient(...args) { calls.push(['createRadialGradient', args]); return gradient('radial'); },
    createPattern(...args) { calls.push(['createPattern', args.map(serial)]); return {pattern: true}; },
    getImageData(x, y, width, height) {
      calls.push(['getImageData', x, y, width, height]);
      return {data: new Uint8ClampedArray(width * height * 4), width, height};
    },
    createImageData(width, height) {
      calls.push(['createImageData', width, height]);
      return {data: new Uint8ClampedArray(width * height * 4), width, height};
    },
    getTransform() { return {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}; },
    isPointInPath() { return false; },
  };
  function gradient(kind) {
    return {addColorStop(offset, color) { calls.push(['addColorStop', kind, offset, color]); }};
  }
  const proxy = new Proxy(context, {
    get(target, property) {
      if (property in target) return target[property];
      if (typeof property === 'symbol') return undefined;
      return (...args) => { calls.push([String(property), args.map(serial)]); };
    },
    set(target, property, value) {
      target[property] = value;
      calls.push(['set', String(property), serial(value)]);
      return true;
    },
  });
  return {context: proxy, calls};
}

const canvasFactory = (width = 539, height = 208) => {
  const canvas = {width, height};
  canvas.getContext = () => {
    if (!canvas._context) canvas._context = makeContext(canvas).context;
    return canvas._context;
  };
  return canvas;
};

globalThis.document = {
  currentScript: null,
  createElement(tag) {
    assert.equal(tag, 'canvas');
    return canvasFactory();
  },
};

test('Motion Prompt index covers 240 source-bound L2 items and ten isolated runtime packs', async () => {
  assert.equal(index.coverage.elements, 240);
  assert.equal(index.packs.length, 10);
  assert.equal(runtimeIndex.packs.reduce((total, pack) => total + pack.count, 0), 240);
  assert.equal(runtimeIndex.packs.length, 10);
  assert.equal(new Set(index.entries.map((row) => row.id)).size, 240);
  assert.ok(index.entries.every((row) => /^[a-f0-9]{64}$/.test(row.sourceElementSha256)));
  assert.ok(index.entries.every((row) => row.l2CurationSourceSha256 === row.sourceElementSha256));
  for (const row of index.entries) {
    assert.ok(row.whatHappensZh?.trim(), `${row.id} has a Chinese visible-change description`);
    assert.ok(row.motionSpecZh?.length, `${row.id} keeps item-specific motion specs`);
    assert.ok(row.whenToUseZh?.trim(), `${row.id} states source use conditions`);
    const {start, end} = row.detailLines;
    const body = productionMarkdown.slice(start - 1, end).join('\n');
    assert.ok(body.startsWith(`## ${row.id} ·`), `${row.id} has stable L2 bounds`);
    assert.ok(body.includes(row.whatHappensZh), `${row.id} L2 contains its own what-happens description`);
    assert.ok(body.includes(row.whenToUseZh), `${row.id} L2 contains its own use condition`);
    assert.ok(body.includes(row.sourceElementSha256), `${row.id} L2 records the source binding`);
  }
});

test('every source element loads and draws deterministically after out-of-order local time calls', async () => {
  const modules = new Map();
  for (const pack of runtimeIndex.packs) {
    const module = await import(pathToFileURL(path.join(runtimeDir, pack.runtimePath)).href);
    assert.equal(module.PACK_INFO.pack, pack.pack);
    assert.equal(module.PACK_INFO.elementCount, 24);
    modules.set(pack.pack, module);
  }

  for (const row of index.entries) {
    const module = modules.get(row.pack ?? row.id.split(':')[1]);
    assert.ok(module, `${row.id} resolves to its pack module`);
    const element = module.createElement(row.localNumber);
    assert.equal(element.id, row.id);
    const target = makeContext({width: 1280, height: 720});
    const snapshots = new Map();
    let repeatedTime = 0;
    for (const time of [0.73, 2.84, 0.73]) {
      target.calls.length = 0;
      const result = element.draw(target.context, 1280, 720, time);
      assert.ok(Number.isFinite(result.scale) && result.scale > 0, `${row.id} has a valid contain scale`);
      assert.ok(result.width <= 1280 && result.height <= 720, `${row.id} stays inside target bounds`);
      if (time === 0.73) snapshots.set(repeatedTime++ === 0 ? 'first' : 'second', JSON.stringify(target.calls));
    }
    assert.equal(snapshots.get('first'), snapshots.get('second'), `${row.id} repeats the same frame after a different time`);
  }
});

test('adapter time modes, containment, pack isolation, and artstyle assets are explicit', async () => {
  const core = await import(pathToFileURL(path.join(runtimeDir, 'core.mjs')).href);
  assert.ok(Math.abs(core.mapLocalTime(9.5, 4.7) - 0.1) < 1e-10);
  assert.equal(core.mapLocalTime(8, 4.7, {mode: 'once'}), 4.699999);
  assert.equal(core.mapLocalTime(8, 4.7, {mode: 'hold', holdAtSeconds: 2.2}), 2.2);
  assert.equal(core.mapLocalTime(3, 4.7, {mode: 'hold-exit', holdAtSeconds: 1, exitAtSeconds: 2, exitSourceSeconds: 3}), 4);
  assert.throws(() => core.mapLocalTime(1, 4.7, {mode: 'hold'}), /hold mode requires/);

  const motion = await import(pathToFileURL(path.join(runtimeDir, 'motion.mjs')).href);
  const diagram = await import(pathToFileURL(path.join(runtimeDir, 'diagram.mjs')).href);
  assert.notEqual(motion.PACK_INFO.pack, diagram.PACK_INFO.pack);
  assert.notEqual(motion.createElement(1).id, diagram.createElement(1).id);
  const artstyle = await import(pathToFileURL(path.join(runtimeDir, 'artstyle.mjs')).href);
  await artstyle.ready;
  assert.ok(Array.isArray(artstyle.PACK_INFO.assetPaths) || artstyle.PACK_INFO.assetsRequired);
  const assets = await fs.readdir(path.join(runtimeDir, 'assets', 'artstyle'));
  assert.equal(assets.filter((name) => name.endsWith('.webp')).length, 27);
  const artstylePack = runtimeIndex.packs.find((pack) => pack.pack === 'artstyle');
  assert.equal(artstylePack.assets.length, 27);
  assert.ok(artstylePack.assets.every((asset) => asset.sourceSha256 === asset.localSha256));
  for (const row of index.entries.filter((item) => item.id.startsWith('motion-prompt:artstyle:'))) {
    assert.equal(row.assetPaths.length, 2);
    assert.ok(row.assetPaths.every((asset) => assets.includes(path.basename(asset))));
  }
});

test('browser artstyle asset loader resolves all 27 images to the checked-in local folder', async () => {
  const requested = [];
  const PreviousImage = globalThis.Image;
  globalThis.Image = class {
    constructor() { this.complete = false; this.naturalWidth = 0; }
    set src(value) {
      this._src = value;
      requested.push(value);
      queueMicrotask(() => {
        this.complete = true;
        this.naturalWidth = 1078;
        this.onload?.();
      });
    }
    get src() { return this._src; }
  };
  try {
    const href = `${pathToFileURL(path.join(runtimeDir, 'artstyle.mjs')).href}?mock-image-load=1`;
    const module = await import(href);
    await module.ready;
    const assetDirectory = new URL('./assets/artstyle/', href).href;
    assert.equal(requested.length, 27);
    assert.ok(requested.every((url) => url.startsWith(assetDirectory)));
    const names = await fs.readdir(path.join(runtimeDir, 'assets', 'artstyle'));
    assert.ok(requested.every((url) => names.includes(path.basename(new URL(url).pathname))));
  } finally {
    if (PreviousImage === undefined) delete globalThis.Image;
    else globalThis.Image = PreviousImage;
  }
});
