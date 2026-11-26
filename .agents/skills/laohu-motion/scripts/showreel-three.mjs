import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lockRoot = fileURLToPath(new URL('../templates/runtime/vendor-lock/', import.meta.url));
const lockFiles = ['package.json', 'package-lock.json'];
const lockBytes = lockFiles.map(name => fs.readFileSync(path.join(lockRoot, name)));
const pin = JSON.parse(lockBytes[1]).packages['node_modules/three'];
const lockKey = createHash('sha256').update(lockBytes[0]).update(lockBytes[1]).digest('hex').slice(0, 16);
const bundleItems = ['package.json', 'LICENSE', 'build', 'examples/jsm'];
const requiredFiles = ['package.json', 'LICENSE', 'build/three.module.js', 'build/three.core.js',
  'examples/jsm/geometries/RoundedBoxGeometry.js'];
const imports = { three: './vendor/three/build/three.module.js', 'three/addons/': './vendor/three/examples/jsm/' };

function verifyBundle(directory) {
  for (const name of requiredFiles) {
    const file = path.join(directory, name);
    if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error(`Three.js bundle is incomplete: ${file}`);
  }
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  if (metadata.name !== 'three' || metadata.version !== pin.version || metadata.license !== pin.license) {
    throw new Error(`Three.js ${pin.version} (${pin.license}) was expected at ${directory}`);
  }
  return { directory, version: pin.version, license: pin.license };
}

export function showreelThreeVendor(cache, assertWorkDisk, { install = false, env } = {}) {
  const parent = path.join(cache, 'vendor');
  const directory = assertWorkDisk(path.join(parent, lockKey), 'Three.js dependency cache');
  function readInstalled(root) {
    lockFiles.forEach((name, index) => {
      if (!fs.readFileSync(path.join(root, name)).equals(lockBytes[index])) throw new Error(`Three.js dependency lock differs at ${root}`);
    });
    const bundle = assertWorkDisk(path.join(root, 'node_modules', 'three'), 'Three.js dependency');
    return verifyBundle(bundle);
  }
  if (fs.lstatSync(directory, { throwIfNoEntry: false })) return readInstalled(directory);
  if (!install) return null;
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, '.three-install-'));
  try {
    lockFiles.forEach((name, index) => fs.writeFileSync(path.join(staging, name), lockBytes[index]));
    const result = spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {
      cwd: staging, env, stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Three.js npm ci failed (${result.status ?? result.signal})`);
    readInstalled(staging);
    try { fs.renameSync(staging, directory); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
    }
    return readInstalled(directory);
  } finally {
    fs.rmSync(staging, { force: true, recursive: true });
  }
}

export function mountShowreelThree(project, bundle, assertWorkDisk) {
  const vendor = assertWorkDisk(path.join(project, 'vendor'), 'project vendor directory');
  const destination = assertWorkDisk(path.join(vendor, 'three'), 'project Three.js directory');
  const vendorStat = fs.lstatSync(vendor, { throwIfNoEntry: false });
  if (vendorStat && !vendorStat.isDirectory()) throw new Error(`Use a local project directory for ${vendor}`);
  const destinationStat = fs.lstatSync(destination, { throwIfNoEntry: false });
  if (destinationStat) {
    if (!destinationStat.isDirectory()) throw new Error(`Use a local project directory for ${destination}`);
    verifyBundle(destination);
    return;
  }
  fs.mkdirSync(vendor, { recursive: true });
  const staging = fs.mkdtempSync(path.join(vendor, '.three-mount-'));
  try {
    for (const name of bundleItems) {
      const target = path.join(staging, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(path.join(bundle.directory, name), target, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
    }
    verifyBundle(staging);
    try { fs.renameSync(staging, destination); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code) || !fs.lstatSync(destination).isDirectory()) throw error;
      verifyBundle(destination);
    }
  } finally {
    fs.rmSync(staging, { force: true, recursive: true });
  }
}

export function withShowreelThreeImportMap(html) {
  if (!/<\/head>/i.test(html)) throw new Error('The Showreel starter must provide a <head> for the Three.js import map');
  return html.replace(/<\/head>/i, `<script type="importmap">${JSON.stringify({ imports })}</script>\n</head>`);
}
