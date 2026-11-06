#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(skillDir, "templates", "catalog.json");
const require = createRequire(import.meta.url);

function usage() {
  return [
    "Usage:",
    "  node scripts/templates.mjs list [--all] [--json] [--status available|conditional|source-only] [--type template|effect|effect-library|reference-index] [--intent <tag>] [--family <tag>] [--target <tag>] [--runtime <tag>] [--source <source-id>] [--category <tag>]",
    "  node scripts/templates.mjs show <template-id> [--json]",
    "  node scripts/templates.mjs verify [--source <source-id>]",
    "  node scripts/templates.mjs prepare <template-id> --input /absolute/spec.json --output /absolute/prepared.json",
    "  node scripts/templates.mjs preview <template-id> --spec /absolute/spec.json --output /absolute/frame.png --time 1.5 [--samples 0,2,1,2] [--assets-root /absolute/media-dir] [--manifest /absolute/evidence.json] [--browser /absolute/chrome] [--hardware] [--no-frequent-readback]",
    "  node scripts/templates.mjs render <template-id> --spec /absolute/spec.json --output /absolute/clip.mp4 [--assets-root /absolute/media-dir] [--cache-dir /absolute/project/.cache/tmp/template-render] [--manifest /absolute/evidence.json] [--browser /absolute/chrome] [--ffmpeg /absolute/ffmpeg] [--hardware] [--no-frequent-readback]",
    "  node scripts/templates.mjs prepare <huashu-motion-finance-chart|huashu-motion-kinetic-type> --input /absolute/spec.json --output /absolute/project/.cache/tmp/huashu/new-finance-project --work-root /absolute/project/.cache/tmp/huashu",
    "  node scripts/templates.mjs render <huashu-motion-finance-chart|huashu-motion-kinetic-type> --spec /absolute/project/.cache/tmp/huashu/new-finance-project/laohu-native-template.json --output /absolute/project/.cache/tmp/huashu/finance.mp4 --work-root /absolute/project/.cache/tmp/huashu [--manifest /absolute/project/.cache/tmp/huashu/receipt.json] [--browser /absolute/chrome] [--ffmpeg /absolute/ffmpeg]",
    "  node scripts/templates.mjs preview <huashu-motion-finance-chart|huashu-motion-kinetic-type> --spec /absolute/project/.cache/tmp/huashu/new-finance-project/laohu-native-template.json --output /absolute/project/.cache/tmp/huashu/frame.png --time 1.5 --work-root /absolute/project/.cache/tmp/huashu",
    "  node scripts/templates.mjs render --film-blueprint /absolute/blueprint.json --output /absolute/film.mp4 --work-root /absolute/project/.cache/tmp/video-shotcraft [--manifest /absolute/film-manifest.json] [--browser /absolute/chrome] [--ffmpeg /absolute/ffmpeg]",
    "  Software/SwiftShader is the default capture mode for repeatable frame reads. --hardware opts into GPU capture for diagnosis; its pixel hashes are not covered by the default seek evidence. --software remains accepted as a compatibility alias.",
    "",
    "Shotcraft Remotion entries render their pinned TSX source through the vendored local adapter. Legacy renderers keep their existing source-page contracts.",
  ].join("\n");
}

function parseArgs(argv) {
  const command = argv.shift();
  const flags = new Set(["--all", "--json", "--software", "--hardware", "--no-frequent-readback"]);
  const values = new Set(["--status", "--type", "--intent", "--family", "--target", "--runtime", "--source", "--category", "--input", "--spec", "--output", "--time", "--samples", "--assets-root", "--cache-dir", "--manifest", "--browser", "--ffmpeg", "--work-root", "--film-blueprint"]);
  const args = { command, positionals: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (flags.has(key)) args[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true;
    else if (values.has(key)) {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw new Error(`Missing value for ${key}`);
      args[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = argv[++index];
    } else if (key.startsWith("--")) throw new Error(`Unknown argument ${key}`);
    else args.positionals.push(key);
  }
  return args;
}

async function readCatalog() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  if (![1, 2].includes(catalog.schemaVersion) || !Array.isArray(catalog.sources) || !Array.isArray(catalog.templates)
      || !Array.isArray(catalog.effectLibraries) || !Array.isArray(catalog.sourceTreeIndex)
      || !Array.isArray(catalog.referenceCatalog?.entries)) {
    throw new Error(`Unsupported or invalid catalog schema ${catalog.schemaVersion}; scripts/templates.mjs supports versions 1 and 2: ${catalogPath}`);
  }
  if (catalog.schemaVersion === 2 && !Array.isArray(catalog.effects)) throw new Error(`Catalog schema 2 requires an effects array: ${catalogPath}`);
  catalog.effects ||= [];
  return catalog;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function sourceById(catalog, sourceId) {
  const source = catalog.sources.find((entry) => entry.id === sourceId);
  if (!source) throw new Error(`Unknown source ${sourceId}`);
  if (!source.vendorRoot) return { source, vendorRoot: null };
  const vendorRoot = path.resolve(skillDir, source.vendorRoot);
  if (!isWithin(path.join(skillDir, "templates", "upstream"), vendorRoot)) throw new Error(`Source vendorRoot must stay below templates/upstream: ${source.vendorRoot}`);
  return { source, vendorRoot };
}

function templateById(catalog, id) {
  const entry = catalog.templates.find((item) => item.id === id);
  if (entry) return entry;
  const reference = catalog.referenceCatalog.entries.find((item) => item.id === id || item.templateId === id);
  if (reference) return reference;
  const effect = catalog.effectLibraries.find((item) => item.id === id);
  if (effect) return effect;
  const localEffect = (catalog.effects || []).find((item) => item.id === id);
  if (localEffect) return localEffect;
  throw new Error(`Unknown template, reference, or effect library ${id}; run list to see available IDs`);
  return entry;
}

function requireNativeClip(entry, action) {
  if (entry.availability === "source-only") {
    throw new Error(`${entry.id} is indexed as source-only; ${action} is unavailable because this source has no verified native-clip adapter`);
  }
  if (entry.renderer !== "native-clip" || !entry.grammar || !entry.sourcePath?.startsWith("scripts/engine/clips/")) {
    throw new Error(`${entry.id} is catalogued as ${entry.renderer || "unconnected source"}; ${action} only supports catalog entries explicitly wired to the native-clip renderer`);
  }
  if (entry.availability === "conditional" && !(entry.renderPreconditions || []).length) {
    throw new Error(`${entry.id} is conditional but its required local inputs are not declared; ${action} is blocked until the catalog records the conditions`);
  }
}

function requireNativeHtmlTemplate(entry, action) {
  if (entry.availability === "source-only") {
    throw new Error(`${entry.id} is indexed as source-only; ${action} is unavailable because this source has no verified native HTML/Canvas adapter`);
  }
  if (entry.renderer !== "native-html-canvas-template" || !entry.adapter?.kind || !entry.sourcePath?.startsWith("templates/")) {
    throw new Error(`${entry.id} is catalogued as ${entry.renderer || "unconnected source"}; ${action} only supports entries explicitly wired to the native HTML/Canvas renderer`);
  }
  if (!entry.adapter.fontCssPath || !/^[0-9a-f]{64}$/.test(entry.adapter.fontCssSha256 || "")) {
    throw new Error(`${entry.id} has no pinned local font CSS adapter; ${action} is blocked until its font closure is verified`);
  }
}

const SHOWCASE_THEME_IDS = [
  "coral-noir", "claude-light", "aqua-morandi", "amber-noir",
  "blueprint-stone", "graphite-signal", "celadon-paper", "crimson-theater",
];

function assertSingleLineText(value, label, maxLength, { allowEmpty = true } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) throw new Error(`${label} must be a ${allowEmpty ? "string" : "non-empty string"}`);
  if (value.length > maxLength) throw new Error(`${label} is longer than ${maxLength} characters; the original layout has no multiline or automatic wrapping control`);
  if (/[\r\n\u2028\u2029]/.test(value)) throw new Error(`${label} must be one line because the original Canvas layout draws a single line`);
}

function validateNativeHtmlSpec(spec, entry) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("Template input must be a JSON object");
  if (spec.templateId != null && spec.templateId !== entry.id) throw new Error(`Spec templateId is ${JSON.stringify(spec.templateId)}; expected ${entry.id}`);
  if (!Number.isFinite(spec.duration) || spec.duration <= 0) throw new Error("duration must be a finite number > 0");
  if (spec.fps != null && (!Number.isInteger(spec.fps) || spec.fps < 1 || spec.fps > 60)) throw new Error("fps must be an integer from 1 to 60");
  const fps = spec.fps || 30;
  const frameCount = spec.duration * fps;
  if (Math.abs(frameCount - Math.round(frameCount)) > 1e-7) throw new Error(`duration ${spec.duration}s at ${fps} fps is not frame-aligned; choose a duration where duration × fps is a whole number`);
  if (spec.width != null && spec.width !== 1920) throw new Error("the original showcase canvas is fixed at 1920 pixels wide");
  if (spec.height != null && spec.height !== 1080) throw new Error("the original showcase canvas is fixed at 1080 pixels high");
  const parameters = spec.parameters || {};
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("parameters must be a JSON object");
  const allowedParameters = entry.id === "motion-code-video-showcase-big-card"
    ? new Set(["layout", "index", "total", "color", "first", "keyword", "brand", "theme"])
    : new Set(["title", "subtitle", "brand", "theme", "t0", "speed", "capsuleName", "capsuleCategory"]);
  for (const key of Object.keys(parameters)) if (!allowedParameters.has(key)) throw new Error(`parameters.${key} is not an original control for ${entry.id}`);
  if (parameters.theme != null && !SHOWCASE_THEME_IDS.includes(parameters.theme)) throw new Error(`theme must be one of the original canonical IDs: ${SHOWCASE_THEME_IDS.join(", ")}`);

  if (entry.id === "motion-code-video-showcase-big-card") {
    if (Math.abs(spec.duration - 1) > 1e-7) throw new Error("big-card is an original fixed one-second card; duration cannot be changed");
    const layout = parameters.layout ?? 0;
    if (!Number.isInteger(layout) || layout < 0 || layout > 3) throw new Error("parameters.layout must be 0, 1, 2, or 3 (the source has four fixed layouts)");
    for (const field of ["index", "total"]) {
      const value = parameters[field] ?? (field === "index" ? 1 : 11);
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`parameters.${field} must be a positive safe integer`);
    }
    const color = parameters.color ?? "#ffcf5c";
    if (typeof color !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) throw new Error("parameters.color must be a #RGB or #RRGGBB value accepted by the original renderer");
    assertSingleLineText(parameters.first ?? "想做", "parameters.first", 48, { allowEmpty: false });
    assertSingleLineText(parameters.keyword ?? "科普视频？", "parameters.keyword", 64, { allowEmpty: false });
    if (typeof parameters.brand !== "string") throw new Error("parameters.brand is required so the original {{BRAND}} placeholder is not shown");
    assertSingleLineText(parameters.brand, "parameters.brand", 40);
    for (const key of ["t0", "speed", "title", "subtitle"]) {
      if (parameters[key] != null) throw new Error(`parameters.${key} is not consumed by the original big-card page`);
    }
  } else if (entry.id === "motion-code-video-showcase-segment") {
    if (spec.duration > 30) throw new Error("segment duration is capped at 30 seconds for this original short-form source page");
    if (typeof parameters.title !== "string") throw new Error("parameters.title is required because the original page contains PLACEHOLDER_TITLE");
    if (typeof parameters.brand !== "string") throw new Error("parameters.brand is required so the original {{BRAND}} placeholder is not shown");
    assertSingleLineText(parameters.title, "parameters.title", 56, { allowEmpty: false });
    assertSingleLineText(parameters.brand, "parameters.brand", 40);
    const subtitle = parameters.subtitle ?? "";
    assertSingleLineText(subtitle, "parameters.subtitle", 72);
    assertSingleLineText(parameters.capsuleName ?? "章节", "parameters.capsuleName", 24);
    assertSingleLineText(parameters.capsuleCategory ?? "", "parameters.capsuleCategory", 24);
    const t0 = parameters.t0 ?? 0;
    const speed = parameters.speed ?? 1;
    if (!Number.isFinite(t0) || t0 < 0) throw new Error("parameters.t0 must be a finite number >= 0 (seconds, as consumed by common.js)");
    if (!Number.isFinite(speed) || speed <= 0 || speed > 8) throw new Error("parameters.speed must be a finite multiplier > 0 and <= 8");
    if (parameters.layout != null || parameters.color != null || parameters.index != null || parameters.total != null || parameters.first != null || parameters.keyword != null) {
      throw new Error("the original segment page has no layout, color, index, total, first, or keyword query controls");
    }
    if (parameters.theme === "aqua-morandi" && subtitle.length > 0) {
      throw new Error("the original aqua-morandi glass branch does not consume PLACEHOLDER_SUB; omit subtitle or choose a non-glass theme");
    }
  } else {
    throw new Error(`${entry.id} has no native HTML/Canvas input validator`);
  }
}

async function verifyCatalog(catalog) {
  const issues = [];
  let checked = 0;
  let checkedGitBlobs = 0;
  let checkedRuntimeEntrypoints = 0;
  let checkedEffectLoadOrderFiles = 0;
  let checkedAdapterFiles = 0;
  let checkedShotcraftRuntimeEntries = 0;
  let checkedShotcraftStyleMappings = 0;
  let checkedDerivedPatchProviders = 0;
  const sourceIds = new Set();
  const treeIds = new Set();
  const templateIds = new Set();

  function gitBlob(bytes) {
    return crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  }

  async function listFiles(root) {
    const result = [];
    async function walk(directory, prefix = "") {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) {
          issues.push({ path: relative, error: "symbolic links are not allowed in a vendored source tree" });
        } else if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
        else if (entry.isFile()) result.push(relative);
        else issues.push({ path: relative, error: "unsupported filesystem entry in vendored source tree" });
      }
    }
    await walk(root);
    return result.sort();
  }

  for (const sourceEntry of catalog.sources) {
    if (sourceIds.has(sourceEntry.id)) issues.push({ sourceId: sourceEntry.id, error: "duplicate source ID" });
    sourceIds.add(sourceEntry.id);
    const { vendorRoot } = sourceById(catalog, sourceEntry.id);
    const sourceFiles = Array.isArray(sourceEntry.files) ? sourceEntry.files : [];
    if (sourceEntry.vendorRoot && !sourceFiles.length) issues.push({ sourceId: sourceEntry.id, error: "vendored source has no pinned files" });
    if (!sourceEntry.vendorRoot && sourceFiles.length) issues.push({ sourceId: sourceEntry.id, error: "source has a file ledger but no vendorRoot" });
    if (!sourceEntry.vendorRoot) {
      continue;
    }
    const pinnedPaths = new Set(sourceFiles.map((file) => file.path));
    if (pinnedPaths.size !== sourceFiles.length) issues.push({ sourceId: sourceEntry.id, error: "duplicate file path in source hash ledger" });
    for (const file of sourceFiles) {
      const target = path.resolve(vendorRoot, file.path);
      if (!isWithin(vendorRoot, target)) {
        issues.push({ sourceId: sourceEntry.id, path: file.path, error: "path escapes source vendor root" });
        continue;
      }
      try {
        const bytes = await fs.readFile(target);
        const actual = sha256(bytes);
        checked += 1;
        if (actual !== file.sha256) issues.push({ sourceId: sourceEntry.id, path: file.path, expected: file.sha256, actual, error: "sha256 mismatch" });
        if (file.gitBlob) {
          checkedGitBlobs += 1;
          const actualBlob = gitBlob(bytes);
          if (actualBlob !== file.gitBlob) issues.push({ sourceId: sourceEntry.id, path: file.path, expected: file.gitBlob, actual: actualBlob, error: "git blob mismatch" });
        }
      } catch (error) {
        issues.push({ sourceId: sourceEntry.id, path: file.path, error: error.message });
      }
    }
    try {
      const actualPaths = new Set(await listFiles(vendorRoot));
      for (const filePath of actualPaths) if (!pinnedPaths.has(filePath)) issues.push({ sourceId: sourceEntry.id, path: filePath, error: "vendored file is not listed in the source hash ledger" });
      for (const filePath of pinnedPaths) if (!actualPaths.has(filePath)) issues.push({ sourceId: sourceEntry.id, path: filePath, error: "source hash ledger contains a file absent from vendorRoot" });
    } catch (error) {
      issues.push({ sourceId: sourceEntry.id, error: `could not enumerate source vendor tree: ${error.message}` });
    }
    if (sourceEntry.runtimeEntrypoint) {
      const entrypoint = path.resolve(vendorRoot, sourceEntry.runtimeEntrypoint);
      try {
        if (!isWithin(vendorRoot, entrypoint)) throw new Error("runtime entrypoint escapes vendorRoot");
        const html = await fs.readFile(entrypoint, "utf8");
        checkedRuntimeEntrypoints += 1;
        const htmlScripts = [...html.matchAll(/<script\s+src=["']([^"']+)["']/g)].map((match) => match[1]);
        for (const script of htmlScripts) {
          const resolved = path.posix.normalize(path.posix.join(sourceEntry.runtimeScriptRoot || "", script));
          if (resolved.startsWith("../") || resolved === "..") {
            issues.push({ sourceId: sourceEntry.id, path: resolved, error: "runtime script path escapes script root" });
            continue;
          }
          if (!pinnedPaths.has(resolved)) issues.push({ sourceId: sourceEntry.id, path: resolved, error: "runtime entrypoint references a file missing from the hash ledger" });
          else {
            try {
              const scriptPath = path.resolve(vendorRoot, resolved);
              if (!isWithin(vendorRoot, scriptPath)) throw new Error("script path escapes vendorRoot");
              await fs.access(scriptPath);
            }
            catch { issues.push({ sourceId: sourceEntry.id, path: resolved, error: "runtime entrypoint references a missing vendored file" }); }
          }
        }
        const fontIndex = path.resolve(vendorRoot, sourceEntry.runtimeScriptRoot || "", "lib/fonts.js");
        const fontSource = await fs.readFile(fontIndex, "utf8");
        const fontPaths = [...fontSource.matchAll(/url:'([^']+)'/g)].map((match) => path.posix.normalize(path.posix.join(sourceEntry.runtimeScriptRoot || "", match[1])));
        for (const fontPath of fontPaths) {
          if (!pinnedPaths.has(fontPath)) issues.push({ sourceId: sourceEntry.id, path: fontPath, error: "FONT_FACES references a font missing from the hash ledger" });
        }
        for (const supportFile of sourceEntry.supportFiles || []) {
          if (!pinnedPaths.has(supportFile)) issues.push({ sourceId: sourceEntry.id, path: supportFile, error: "declared support file missing from hash ledger" });
        }
        for (const entry of catalog.templates.filter((item) => item.sourceId === sourceEntry.id)) {
          if (entry.sourcePath && entry.sourcePathVendored !== false && !pinnedPaths.has(entry.sourcePath)) issues.push({ templateId: entry.id, path: entry.sourcePath, error: "template source missing from hash ledger" });
        }
      } catch (error) {
        issues.push({ sourceId: sourceEntry.id, path: sourceEntry.runtimeEntrypoint, error: `could not verify native runtime closure: ${error.message}` });
      }
    }
  }

  for (const tree of catalog.sourceTreeIndex) {
    if (treeIds.has(tree.id)) issues.push({ sourceTreeId: tree.id, error: "duplicate source tree ID" });
    treeIds.add(tree.id);
    if (Array.isArray(tree.files)) {
      const paths = new Set();
      for (const file of tree.files) {
        if (typeof file.path !== "string" || !file.path) issues.push({ sourceTreeId: tree.id, error: "source tree row has no path" });
        else if (paths.has(file.path)) issues.push({ sourceTreeId: tree.id, path: file.path, error: "duplicate source tree path" });
        else paths.add(file.path);
        if (file.gitBlob != null && !/^[0-9a-f]{40}$/.test(file.gitBlob)) issues.push({ sourceTreeId: tree.id, path: file.path, error: "invalid Git blob ID in source tree index" });
      }
      if (tree.trackedFiles != null && tree.trackedFiles !== tree.files.length) issues.push({ sourceTreeId: tree.id, error: `trackedFiles=${tree.trackedFiles} differs from indexed rows=${tree.files.length}` });
    }
  }
  for (const source of catalog.sources) {
    if (source.sourceTreeIndexId && !treeIds.has(source.sourceTreeIndexId)) issues.push({ sourceId: source.id, sourceTreeIndexId: source.sourceTreeIndexId, error: "sourceTreeIndexId has no matching index" });
  }

  for (const entry of catalog.templates) {
    if (templateIds.has(entry.id)) issues.push({ templateId: entry.id, error: "duplicate template ID" });
    templateIds.add(entry.id);
    if (!catalog.sources.some((source) => source.id === entry.sourceId)) issues.push({ templateId: entry.id, error: `unknown source ${entry.sourceId}` });
    if (!["available", "conditional", "source-only"].includes(entry.availability)) issues.push({ templateId: entry.id, error: `invalid availability ${entry.availability}` });
    if (!entry.parameters || !entry.fixedMechanism) issues.push({ templateId: entry.id, error: "missing source interface or fixed mechanism" });
    if (entry.availability !== "source-only" && !entry.sourcePath) issues.push({ templateId: entry.id, error: "runnable template is missing sourcePath" });
    if (entry.sourcePath && entry.sourcePathVendored !== false) {
      const source = catalog.sources.find((item) => item.id === entry.sourceId);
      if (source?.files && !source.files.some((file) => file.path === entry.sourcePath)) issues.push({ templateId: entry.id, path: entry.sourcePath, error: "template sourcePath is not in its source file ledger" });
    }
    if (entry.renderer === "native-html-canvas-template") {
      const source = catalog.sources.find((item) => item.id === entry.sourceId);
      const pinnedPaths = new Set((source?.files || []).map((file) => file.path));
      for (const relative of entry.closure || []) {
        if (!pinnedPaths.has(relative)) issues.push({ templateId: entry.id, path: relative, error: "native HTML closure file is missing from the source hash ledger" });
      }
      for (const dependency of entry.adapter?.runtimeDependencySourceIds || []) {
        if (!sourceIds.has(dependency) && !catalog.sources.some((item) => item.id === dependency)) issues.push({ templateId: entry.id, sourceId: dependency, error: "native HTML runtime dependency source is not catalogued" });
      }
      for (const asset of entry.adapter?.fontAssets || []) {
        const fontSource = catalog.sources.find((item) => item.id === asset.sourceId);
        const fontFile = fontSource?.files?.find((file) => file.path === asset.path);
        if (!fontFile) issues.push({ templateId: entry.id, sourceId: asset.sourceId, path: asset.path, error: "native HTML font asset is not pinned in its source ledger" });
      }
      try {
        const cssPath = path.resolve(skillDir, "templates", entry.adapter.fontCssPath);
        if (!isWithin(path.join(skillDir, "templates"), cssPath)) throw new Error("font CSS path escapes templates");
        const cssBytes = await fs.readFile(cssPath);
        checkedAdapterFiles += 1;
        if (sha256(cssBytes) !== entry.adapter.fontCssSha256) issues.push({ templateId: entry.id, path: entry.adapter.fontCssPath, expected: entry.adapter.fontCssSha256, actual: sha256(cssBytes), error: "font CSS adapter SHA-256 mismatch" });
      } catch (error) {
        issues.push({ templateId: entry.id, path: entry.adapter?.fontCssPath, error: `could not verify font CSS adapter: ${error.message}` });
      }
      try {
        const sourceHtml = await fs.readFile(path.join(sourceById(catalog, entry.sourceId).vendorRoot, entry.sourcePath), "utf8");
        const actualImports = [...sourceHtml.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)].map((match) => match[1]).filter((item) => item.startsWith("."));
        for (const importPath of actualImports) {
          const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry.sourcePath), importPath));
          if (resolved.startsWith("../") || resolved === "..") issues.push({ templateId: entry.id, path: resolved, error: "native HTML module import escapes source tree" });
          else if (!pinnedPaths.has(resolved)) issues.push({ templateId: entry.id, path: resolved, error: "native HTML module import is missing from source hash ledger" });
        }
      } catch (error) {
        issues.push({ templateId: entry.id, path: entry.sourcePath, error: `could not inspect native HTML module closure: ${error.message}` });
      }
    }
    if (entry.renderer === "video-shotcraft-remotion") {
      checkedShotcraftRuntimeEntries += 1;
      if (entry.sourceId !== "video-shotcraft" || entry.availability !== "conditional" || entry.callable !== true) {
        issues.push({ templateId: entry.id, error: "Shotcraft Remotion entries must remain conditional, explicitly callable, and pinned to video-shotcraft" });
      }
      const source = catalog.sources.find((item) => item.id === entry.sourceId);
      const pinned = new Map((source?.files || []).map((file) => [file.path, file]));
      const component = entry.component;
      if (!component?.path || !component?.exportName || !component?.sha256 || !Array.isArray(entry.closure) || !entry.closure.includes(component.path)) {
        issues.push({ templateId: entry.id, error: "Shotcraft entry must identify one exact source component and its recursive pinned closure" });
      }
      for (const relative of entry.closure || []) {
        const file = pinned.get(relative);
        if (!file) issues.push({ templateId: entry.id, path: relative, error: "Shotcraft callable closure is missing from the source hash ledger" });
      }
      if (component && pinned.get(component.path)?.sha256 !== component.sha256) {
        issues.push({ templateId: entry.id, path: component.path, error: "Shotcraft callable component hash does not match its source ledger row" });
      }
      const adapterPath = entry.adapter?.entrypoint;
      if (adapterPath !== "templates/adapters/video-shotcraft-entry.tsx") {
        issues.push({ templateId: entry.id, path: adapterPath, error: "Shotcraft callable entry must route through the shared pinned-source Remotion entrypoint" });
      } else {
        try {
          const absolute = path.resolve(skillDir, adapterPath);
          if (!isWithin(path.join(skillDir, "templates"), absolute)) throw new Error("entrypoint escapes templates");
          await fs.access(absolute); checkedAdapterFiles += 1;
        } catch (error) { issues.push({ templateId: entry.id, path: adapterPath, error: `Shotcraft Remotion entrypoint is missing: ${error.message}` }); }
      }
      if (entry.sourceMethodAdaptation) {
        const adaptation = entry.sourceMethodAdaptation;
        if (adaptation.kind !== "source-adapted-local" || adaptation.sourceCommit !== source?.commit || adaptation.sourceImplementation?.path !== component?.path || adaptation.sourceImplementation?.sha256 !== component?.sha256) {
          issues.push({ templateId: entry.id, error: "source-adapted-local entry must preserve exact pinned source component identity and commit" });
        }
        const local = adaptation.localImplementation;
        if (!local?.path || !local?.exportName || !local?.sha256 || entry.adapter?.localImplementation?.path !== local.path || entry.adapter?.localImplementation?.sha256 !== local.sha256 || entry.adapter?.localImplementation?.exportName !== local.exportName) {
          issues.push({ templateId: entry.id, error: "source-adapted-local catalog adapter/local implementation identity is incomplete or inconsistent" });
        } else {
          try {
            const absolute = path.resolve(skillDir, local.path);
            if (!isWithin(path.join(skillDir, "templates"), absolute)) throw new Error("local adaptation escapes templates");
            const localBytes = await fs.readFile(absolute);
            checkedAdapterFiles += 1;
            if (sha256(localBytes) !== local.sha256) issues.push({ templateId: entry.id, path: local.path, error: "source-adapted-local implementation SHA-256 mismatch" });
          } catch (error) { issues.push({ templateId: entry.id, path: local.path, error: `could not verify source-adapted-local implementation: ${error.message}` }); }
        }
        if (entry.component?.kind !== "source-adapted-full-scene" || !entry.fidelityModes?.includes("source-adapted-local") || entry.sourceDurationFrames !== 88) {
          issues.push({ templateId: entry.id, error: "ListStackPress adaptation must remain a fixed-duration source-adapted-full-scene with source-adapted-local fidelity mode" });
        }
      }
      if (!entry.renderPreconditions?.length) issues.push({ templateId: entry.id, error: "Shotcraft conditional entry is missing render preconditions" });
      if (entry.derivedProvider) {
        try {
          const adapter = await import("../templates/adapters/video-shotcraft-remotion.mjs");
          const verified = await adapter.verifyDerivedPatchProviderForEntry(entry);
          checkedDerivedPatchProviders += 1;
          checkedAdapterFiles += 1;
          if (verified.sourceSha256 !== entry.derivedProvider.parentComponentSha256 || verified.sha256 !== entry.derivedProvider.sha256) {
            issues.push({ templateId: entry.id, error: "derived patch provider verification returned hashes outside the catalog pin" });
          }
        } catch (error) {
          issues.push({ templateId: entry.id, path: entry.derivedProvider.entrypoint, error: `could not verify source-limited derived patch: ${error.message}` });
        }
      }
    }
  }

  const effectIds = new Set();
  for (const effect of catalog.effects || []) {
    if (effectIds.has(effect.id)) issues.push({ effectId: effect.id, error: "duplicate local effect ID" });
    effectIds.add(effect.id);
    if (!effect.id || !effect.sourceRef || !catalog.sources.some((source) => source.id === effect.sourceRef.sourceId)) issues.push({ effectId: effect.id, error: "local effect must reference a catalogued source" });
    if (!effect.adapter?.path || !effect.renderer || !effect.intent || !effect.family || !effect.target) issues.push({ effectId: effect.id, error: "local effect is missing its adapter, renderer, intent, family, or target contract" });
    if (!Array.isArray(effect.intents) || effect.intents.length === 0 || effect.intents.some((tag) => typeof tag !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(tag)) || new Set(effect.intents).size !== effect.intents.length) {
      issues.push({ effectId: effect.id, error: "local effect must declare unique stable intent tags for exact semantic filtering" });
    }
    if (!Array.isArray(effect.parameters) || !effect.timebase || !effect.phase || !Array.isArray(effect.controlledAttributes)) issues.push({ effectId: effect.id, error: "local effect is missing actual parameter, timebase, phase, or controlled-attribute details" });
    const wiredRenderers = new Set(["custom:huashu-local-effects", "custom:huashu-local-target", "custom:laohu-motion-operation"]);
    if (effect.availability === "available" && !wiredRenderers.has(effect.renderer)) issues.push({ effectId: effect.id, error: "available local effect has no wired renderer" });
    if (effect.adapter?.supportingRenderer && !wiredRenderers.has(effect.adapter.supportingRenderer)) issues.push({ effectId: effect.id, error: "local effect supporting renderer is not wired" });
    for (const sourcePath of effect.sourceRef?.files || []) {
      const source = catalog.sources.find((item) => item.id === effect.sourceRef.sourceId);
      if (!source?.files?.some((file) => file.path === sourcePath)) issues.push({ effectId: effect.id, path: sourcePath, error: "local effect source file is absent from the pinned source ledger" });
    }
    try { await fs.access(path.resolve(skillDir, effect.adapter.path)); }
    catch { issues.push({ effectId: effect.id, path: effect.adapter.path, error: "local effect adapter is missing" }); }
    if (effect.operationId) {
      try {
        const providerPath = path.resolve(skillDir, effect.adapter.path);
        const provider = await fs.readFile(providerPath, "utf8");
        const renderer = await fs.readFile(path.join(skillDir, "scripts", "render.mjs"), "utf8");
        if (!provider.includes(JSON.stringify(effect.operationId))) issues.push({ effectId: effect.id, path: effect.adapter.path, error: "operationId is absent from the registered local provider" });
        if (!provider.includes(JSON.stringify(effect.renderer))) issues.push({ effectId: effect.id, path: effect.adapter.path, error: "renderer ID is absent from the local provider" });
        if (!renderer.includes("validateMotionOperations(scene)") || !renderer.includes("registerMotionOperations(renderers, records)")) {
          issues.push({ effectId: effect.id, path: "scripts/render.mjs", error: "render entry does not validate and register the declared local operation provider" });
        }
        checkedAdapterFiles += 1;
      } catch (error) {
        issues.push({ effectId: effect.id, error: `could not verify local operation consumer: ${error.message}` });
      }
    }
  }
  for (const entry of catalog.referenceCatalog.entries) {
    if (templateIds.has(entry.id)) issues.push({ templateId: entry.id, error: "catalog reference ID collides with another item" });
    templateIds.add(entry.id);
    if (!catalog.sources.some((source) => source.id === entry.sourceId)) issues.push({ templateId: entry.id, error: `unknown source ${entry.sourceId}` });
    if (entry.availability !== "source-only" || entry.callable !== false || entry.renderer !== "catalog-index") issues.push({ templateId: entry.id, error: "reference catalog row must remain source-only and non-callable" });
  }
  const shotcraftStyles = catalog.referenceCatalog.entries.filter((entry) => entry.sourceId === "video-shotcraft" && entry.kind === "style");
  const shotcraftCards = new Map(catalog.referenceCatalog.entries.filter((entry) => entry.sourceId === "video-shotcraft" && entry.kind === "card").map((entry) => [entry.cardId, entry]));
  if (catalog.sources.some((source) => source.id === "video-shotcraft") && shotcraftStyles.length !== 150) {
    issues.push({ sourceId: "video-shotcraft", error: `expected 150 indexed style mappings; found ${shotcraftStyles.length}` });
  }
  const styleKeys = new Set();
  for (const entry of shotcraftStyles) {
    checkedShotcraftStyleMappings += 1;
    const mapping = entry.sourceImplementationIndex;
    if (entry.availability !== "source-only" || entry.callable !== false || entry.renderer !== "catalog-index") {
      issues.push({ templateId: entry.id, error: "Shotcraft style index must not imply a callable renderer" });
    }
    if (styleKeys.has(entry.styleKey)) issues.push({ templateId: entry.id, styleKey: entry.styleKey, error: "duplicate Shotcraft source style key" });
    styleKeys.add(entry.styleKey);
    if (!mapping || mapping.styleKey !== entry.styleKey || mapping.cardId !== entry.cardId || !mapping.recipePath || !Array.isArray(mapping.implementations) || mapping.implementations.length < 1) {
      issues.push({ templateId: entry.id, error: "Shotcraft style row lacks its source-pinned recipe/component crosswalk" });
      continue;
    }
    if (!shotcraftCards.has(entry.cardId)) issues.push({ templateId: entry.id, cardId: entry.cardId, error: "Shotcraft style mapping has no indexed parent card" });
    if (!Array.isArray(mapping.npmPackageRoots) || typeof mapping.staticFileEvidence !== "string" || typeof mapping.galleryMediaRef !== "string") {
      issues.push({ templateId: entry.id, error: "Shotcraft source crosswalk must retain npm, staticFile, and gallery-media evidence" });
    }
    for (const implementation of mapping.implementations) {
      if (!implementation.path || !implementation.path.endsWith(".tsx") || !implementation.exportName || !Array.isArray(implementation.localImportClosure)) {
        issues.push({ templateId: entry.id, error: "Shotcraft source crosswalk implementation needs exact TSX path/export and recursive closure mapping" });
      }
      if (!String(implementation.sourceClosureStatus || "").startsWith("source-mapped-only")) {
        issues.push({ templateId: entry.id, error: "Shotcraft style crosswalk must keep non-vendored implementation status explicit" });
      }
    }
  }
  for (const effect of catalog.effectLibraries) {
    if (templateIds.has(effect.id)) issues.push({ effectLibraryId: effect.id, error: "effect library ID collides with another item" });
    templateIds.add(effect.id);
    const source = catalog.sources.find((item) => item.id === effect.sourceId);
    if (!source) issues.push({ effectLibraryId: effect.id, error: `unknown source ${effect.sourceId}` });
    const pinnedPaths = new Set((source?.files || []).map((file) => file.path));
    for (const filePath of effect.loadOrder || []) {
      if (!pinnedPaths.has(filePath)) issues.push({ effectLibraryId: effect.id, path: filePath, error: "effect load-order file missing from source ledger" });
      else checkedEffectLoadOrderFiles += 1;
    }
  }

  return {
    ok: issues.length === 0,
    checkedFiles: checked,
    checkedGitBlobs,
    checkedRuntimeEntrypoints,
    checkedEffectLoadOrderFiles,
    checkedAdapterFiles,
    checkedShotcraftRuntimeEntries,
    checkedShotcraftStyleMappings,
    checkedDerivedPatchProviders,
    sourceCount: catalog.sources.length,
    sourceTreeCount: catalog.sourceTreeIndex.length,
    templateCount: catalog.templates.length,
    referenceCatalogCount: catalog.referenceCatalog.entries.length,
    effectLibraryCount: catalog.effectLibraries.length,
    issues,
  };
}

async function verifySource(catalog, sourceId) {
  const source = catalog.sources.find((entry) => entry.id === sourceId);
  if (!source) return { ok: false, checkedFiles: 0, issues: [{ sourceId, error: "unknown source" }] };
  const targetTemplates = catalog.templates.filter((entry) => entry.sourceId === sourceId);
  const dependencyIds = new Set([sourceId]);
  for (const entry of targetTemplates) {
    for (const dependency of entry.adapter?.runtimeDependencySourceIds || []) dependencyIds.add(dependency);
    for (const asset of entry.adapter?.fontAssets || []) dependencyIds.add(asset.sourceId);
  }
  const sources = catalog.sources.filter((entry) => dependencyIds.has(entry.id));
  const indexedTreeIds = new Set(sources.map((entry) => entry.sourceTreeIndexId).filter(Boolean));
  const single = {
    ...catalog,
    sources,
    templates: targetTemplates,
    referenceCatalog: { ...catalog.referenceCatalog, entries: catalog.referenceCatalog.entries.filter((entry) => entry.sourceId === sourceId) },
    effectLibraries: catalog.effectLibraries.filter((entry) => entry.sourceId === sourceId),
    effects: (catalog.effects || []).filter((entry) => entry.sourceRef?.sourceId === sourceId),
    sourceTreeIndex: catalog.sourceTreeIndex.filter((entry) => indexedTreeIds.has(entry.id)),
  };
  return verifyCatalog(single);
}

function printList(catalog, args) {
  const explicitScope = !!(args.all || args.status || args.source || args.category || args.type || args.intent || args.family || args.target || args.runtime);
  const entries = [
    ...catalog.templates.map((entry) => ({ ...entry, itemType: "template" })),
    ...(args.all || args.status === "source-only" || args.source || args.category
      ? catalog.referenceCatalog.entries.map((entry) => ({ ...entry, itemType: "reference-index" })) : []),
    ...(args.all || args.source || args.category
      ? catalog.effectLibraries.map((entry) => ({ ...entry, itemType: "effect-library", status: entry.availability })) : []),
    ...(catalog.effects || []).map((entry) => ({ ...entry, itemType: "effect" })),
  ].filter((entry) => {
    if (!explicitScope && !["available", "conditional"].includes(entry.availability)) return false;
    if (args.status && entry.availability !== args.status) return false;
    if (args.source && entry.sourceId !== args.source && entry.catalogSourceId !== args.source) return false;
    if (args.type && entry.itemType !== args.type) return false;
    if (args.intent && entry.intent !== args.intent && !(Array.isArray(entry.intents) && entry.intents.includes(args.intent))) return false;
    if (args.family && entry.family !== args.family) return false;
    if (args.target && entry.target !== args.target && !(Array.isArray(entry.targets) && entry.targets.includes(args.target))) return false;
    if (args.runtime && entry.renderer !== args.runtime && entry.runtimeVerification !== args.runtime) return false;
    if (args.category) {
      const categories = Array.isArray(entry.category) ? entry.category : [];
      if (!categories.includes(args.category)) return false;
    }
    return true;
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (args.json) {
    process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
    return;
  }
  for (const entry of entries) {
    const title = entry.name || (typeof entry.title === "string" ? entry.title : entry.title?.zh || entry.title?.en) || entry.templateId || entry.id;
    const runtime = entry.runtimeVerification || (entry.itemType === "effect-library" ? entry.renderer : entry.itemType === "reference-index" ? "index-only" : "not-recorded");
    process.stdout.write(`${entry.id}\t${entry.itemType}\t${entry.availability || entry.status}\t${runtime}\t${title}\n`);
  }
}

function printShow(entry, asJson, catalog) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
    return;
  }
  if (entry.itemType === "effect" || (entry.intent && entry.adapter && entry.sourceRef)) {
    process.stdout.write(`${entry.name || entry.id} (${entry.id})\n`);
    process.stdout.write(`状态：${entry.availability} / runtime ${entry.runtimeVerification || "not-recorded"}\n`);
    process.stdout.write(`用途：${entry.intent}；家族：${entry.family}；变体：${entry.variant || "source mechanism"}\n`);
    if (Array.isArray(entry.intents) && entry.intents.length) process.stdout.write(`用途标签（精确查询）：${entry.intents.join(", ")}\n`);
    process.stdout.write(`目标：${entry.target}；renderer：${entry.renderer}\n`);
    const source = catalog.sources.find((row) => row.id === entry.sourceRef.sourceId);
    process.stdout.write(`来源：${entry.sourceRef.sourceId}${source?.locallyAuthored ? "（本地实现）" : ` @ ${source?.commit}`}；${(entry.sourceRef.files || []).join(", ")}\n`);
    process.stdout.write(`适配器：${entry.adapter.path}\n`);
    process.stdout.write(`参数：${JSON.stringify(entry.parameters)}\n`);
    process.stdout.write(`时钟/阶段：${JSON.stringify({ timebase: entry.timebase, phase: entry.phase, endBehavior: entry.endBehavior })}\n`);
    if (entry.conditions?.length) process.stdout.write(`条件：${entry.conditions.join("；")}\n`);
    return;
  }
  if (entry.functions && entry.loadOrder) {
    const source = catalog.sources.find((row) => row.id === entry.sourceId);
    process.stdout.write(`${entry.name} (${entry.id})\n`);
    process.stdout.write(`状态：${entry.availability} / renderer ${entry.renderer}\n`);
    process.stdout.write(`来源：${source?.id} @ ${source?.commit}\n`);
    process.stdout.write(`原始加载顺序：${entry.loadOrder.join(" → ")}\n`);
    process.stdout.write(`全局接口：${(entry.globals || []).join(", ")}\n`);
    for (const item of entry.functions) process.stdout.write(`  ${item.id}${item.signature} — ${item.mechanism}\n`);
    process.stdout.write(`调用契约：${entry.usageContract}\n`);
    if (entry.limitations?.length) process.stdout.write(`边界：${entry.limitations.join("；")}\n`);
    return;
  }
  const title = entry.name || (typeof entry.title === "string" ? entry.title : entry.title?.zh || entry.title?.en) || entry.templateId || entry.id;
  process.stdout.write(`${title} (${entry.id})\n`);
  process.stdout.write(`状态：${entry.availability || "reference-only"} / runtime ${entry.runtimeVerification || "not-connected"}\n`);
  if (entry.contentFit) process.stdout.write(`适用：${entry.contentFit}\n`);
  if (entry.fixedMechanism) process.stdout.write(`固定机制：${entry.fixedMechanism}\n`);
  process.stdout.write(`来源：${entry.sourceId || "unknown"} :: ${entry.sourcePath || entry.catalogRole || "catalog record"}\n`);
  if (entry.parameters) process.stdout.write(`参数：${JSON.stringify(entry.parameters)}\n`);
  if (entry.reason) process.stdout.write(`状态说明：${entry.reason}\n`);
  if (entry.inputRequirements?.length) process.stdout.write(`输入条件：${entry.inputRequirements.join("；")}\n`);
  if (entry.limitations?.length) process.stdout.write(`边界：${entry.limitations.join("；")}\n`);
}

function checkSpec(spec, entry) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("Template input must be a JSON object");
  if (spec.grammar !== entry.grammar) throw new Error(`Spec grammar is ${JSON.stringify(spec.grammar)}; ${entry.id} requires ${entry.grammar}`);
  if (!Number.isFinite(spec.duration) || spec.duration <= 0) throw new Error("Original clip contract requires duration > 0");
  if (spec.fps != null && (!Number.isFinite(spec.fps) || spec.fps <= 0)) throw new Error("fps must be a finite number > 0");
  const fps = spec.fps || 30;
  const exactFrameCount = spec.duration * fps;
  if (Math.abs(exactFrameCount - Math.round(exactFrameCount)) > 1e-7) {
    const lowerDuration = Math.floor(exactFrameCount) / fps;
    const upperDuration = Math.ceil(exactFrameCount) / fps;
    throw new Error(`duration ${spec.duration}s at ${fps} fps is ${exactFrameCount.toFixed(6)} frames, not a whole number; choose a frame-aligned duration such as ${lowerDuration.toFixed(6)}s or ${upperDuration.toFixed(6)}s before prepare/render`);
  }
  for (const key of ["width", "height"]) {
    if (spec[key] != null && (!Number.isInteger(spec[key]) || spec[key] <= 0 || spec[key] > 8192)) throw new Error(`${key} must be a positive integer no greater than the adapter's 8192-pixel safety limit`);
  }
  if (spec.cues != null && !Array.isArray(spec.cues)) throw new Error("cues must be an array");
  if (spec.data != null && (typeof spec.data !== "object" || Array.isArray(spec.data))) throw new Error("data must be an object");
  for (const requiredPath of entry.sourceSchema?.specNeeds || entry.parameters.requiredSpecFields || []) {
    const parts = requiredPath.split(".");
    let value = spec;
    for (const part of parts) value = value == null ? undefined : value[part];
    if (requiredPath === "data.series" && (!Array.isArray(value) || value.length === 0)) {
      throw new Error(`${entry.id} requires a non-empty ${requiredPath} array; the source chart has no data to draw`);
    }
    if (value == null) throw new Error(`${entry.id} requires ${requiredPath} per the original clip_schema.json`);
  }
  for (const [index, cue] of (spec.cues || []).entries()) {
    if (!cue || typeof cue !== "object" || Array.isArray(cue)) throw new Error(`cues[${index}] must be an object`);
    const supportedKinds = entry.sourceSchema?.kinds || entry.parameters.cueKinds || [];
    if (typeof cue.kind !== "string" || !supportedKinds.includes(cue.kind)) throw new Error(`cues[${index}].kind is not supported by ${entry.grammar}`);
    if (cue.at != null && !Number.isFinite(cue.at)) throw new Error(`cues[${index}].at must be a finite number`);
  }
  for (const requirement of entry.renderPreconditions || []) {
    if (requirement === "data.character.frames" && !(spec.data?.character?.frames && typeof spec.data.character.frames === "object" && !Array.isArray(spec.data.character.frames) && (spec.data.character.frames.rest || spec.data.character.frames.talk))) {
      throw new Error(`${entry.id} requires ${requirement} with at least a rest or talk image; provide authorized local pose images before preparing or rendering`);
    }
    if (requirement === "cues.image-or-frames" && !(spec.cues || []).some((cue) => (cue.kind === "image" || cue.kind === "clip") && (cue.image || (Array.isArray(cue.frames) && cue.frames.length)))) {
      throw new Error(`${entry.id} requires an image/clip cue with a local image or frame sequence; source demo media is not bundled`);
    }
  }
}

async function requireNewOutput(outputValue, forbiddenRoots = []) {
  if (!outputValue) throw new Error("--output is required");
  const output = path.resolve(outputValue);
  for (const forbidden of forbiddenRoots) {
    if (isWithin(forbidden, output)) throw new Error(`Refusing to write into a vendored source or skill-definition directory: ${output}`);
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  try {
    await fs.access(output);
    throw new Error(`Output already exists; choose a new path to preserve it: ${output}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return output;
}

const NATIVE_OM_SPEC_FORMAT = "laohu.huashu-native-template-spec/1";

function requireNativeOmTemplate(entry, action) {
  if (entry.availability === "source-only") {
    throw new Error(entry.id + " is indexed as source-only; " + action + " is unavailable until its native OM browser output has been verified");
  }
  if (entry.renderer !== "native-om-template-source" || entry.sourceId !== "huashu-motion"
      || !/^templates\/(finance-chart|kinetic-type)\/index\.html$/.test(entry.sourcePath || "")) {
    throw new Error(entry.id + " is catalogued as " + (entry.renderer || "unconnected source") + "; " + action + " only supports the connected huashu-motion finance-chart and kinetic-type native OM templates");
  }
}

function nativeOmTemplateName(entry) {
  const match = /^templates\/([^/]+)\/index\.html$/.exec(entry.sourcePath || "");
  if (!match) throw new Error(entry.id + " has no recognized native OM template source path");
  return match[1];
}

async function ensureNativeWorkRoot(workRootValue, relatedPaths = []) {
  if (!workRootValue || !path.isAbsolute(workRootValue)) throw new Error("native huashu-motion commands require an absolute --work-root on the same volume as the project");
  const workRoot = path.resolve(workRootValue);
  await fs.mkdir(workRoot, { recursive: true });
  const tempRoot = path.join(workRoot, "browser-temp");
  await fs.mkdir(tempRoot, { recursive: true });
  const rootDevice = (await fs.stat(skillDir)).dev;
  if ((await fs.stat(workRoot)).dev !== rootDevice) throw new Error("--work-root is on a different volume from the project; refusing cross-volume temporary files: " + workRoot);
  for (const candidate of relatedPaths.filter(Boolean)) {
    const absolute = path.resolve(candidate);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    if ((await fs.stat(path.dirname(absolute))).dev !== rootDevice) throw new Error("native output/cache path is on a different volume from the project: " + absolute);
  }
  return { workRoot, tempRoot, device: rootDevice };
}

function nativeOmEnv({ tempRoot, browserPath, ffmpegPath }) {
  const env = { ...process.env, OM_SAMPLES: "off", TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot };
  if (browserPath) env.OM_CHROME = browserPath;
  if (ffmpegPath) env.PATH = path.dirname(path.resolve(ffmpegPath)) + path.delimiter + (env.PATH || "");
  return env;
}

async function nativeOmExecutables(vendorRoot, args, tempRoot) {
  const browserApi = await import(pathToFileURL(path.join(vendorRoot, "cli", "lib", "browser.js")).href);
  const browserPath = args.browser ? path.resolve(args.browser) : (process.env.OM_CHROME || browserApi.findChrome());
  if (!browserPath || !(await fs.stat(browserPath).catch(() => null))) throw new Error("no Chrome/Chromium browser found; pass --browser /absolute/path/to/browser");
  const browserVersion = browserApi.chromeVersion(browserPath);
  const ffmpegPath = args.ffmpeg ? path.resolve(args.ffmpeg) : null;
  if (ffmpegPath && !(await fs.stat(ffmpegPath).catch(() => null))) throw new Error("--ffmpeg does not exist: " + ffmpegPath);
  return {
    browserPath,
    browserVersion,
    ffmpegPath,
    env: nativeOmEnv({ tempRoot, browserPath, ffmpegPath }),
    omCli: path.join(vendorRoot, "cli", "om.js"),
  };
}

function runNativeOm(omCli, argv, { env, cwd, label }) {
  const result = spawnSync(process.execPath, [omCli, ...argv], {
    cwd, env, encoding: "utf8", maxBuffer: 128 * 1024 * 1024, timeout: 15 * 60 * 1000,
  });
  if (result.error) throw new Error(label + " could not start: " + result.error.message);
  if (result.status !== 0) throw new Error(label + " failed (exit " + result.status + "):\n" + (result.stderr || result.stdout || "").trim());
  return { stdout: result.stdout || "", stderr: result.stderr || "" };
}

async function hashNativeProjectFiles(projectRoot) {
  const files = [];
  async function walk(directory, prefix = "") {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? prefix + "/" + item.name : item.name;
      const absolute = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw new Error("symbolic link is not allowed in a prepared native OM project: " + relative);
      if (item.isDirectory()) await walk(absolute, relative);
      else if (relative === ".om/renders.jsonl") {
        // The original OM CLI appends render timing/output records here on every invocation.
        // It is runtime metadata, not an input to the template project.
      }
      else if (item.isFile()) {
        const bytes = await fs.readFile(absolute);
        files.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  await walk(projectRoot);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function parseNativeFps(value) {
  if (!value) return null;
  const parts = String(value).split("/");
  return parts.length === 1 ? Number(parts[0]) : Number(parts[0]) / Number(parts[1]);
}

async function prepareNativeOm(args, catalog, entry) {
  requireNativeOmTemplate(entry, "prepare");
  if (!args.input || !args.output) throw new Error("native OM prepare requires --input and --output (a new project directory)");
  const inputPath = path.resolve(args.input);
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("native OM input must be a JSON object");
  if (input.format != null && input.format !== NATIVE_OM_SPEC_FORMAT) throw new Error("format must be " + NATIVE_OM_SPEC_FORMAT);
  if (input.templateId != null && input.templateId !== entry.id) throw new Error("input templateId is " + JSON.stringify(input.templateId) + "; expected " + entry.id);
  const fps = input.fps == null ? 30 : input.fps;
  if (![24, 25, 30, 50, 60].includes(fps)) throw new Error("fps must be one of 24, 25, 30, 50, or 60");
  const width = input.width == null ? 1920 : input.width;
  const height = input.height == null ? 1080 : input.height;
  if (width !== 1920 || height !== 1080) throw new Error("these native OM sources are authored for 1920x1080; use another renderer for a different frame");
  const sourceVerification = await verifySource(catalog, entry.sourceId);
  if (!sourceVerification.ok) throw new Error("Pinned source verification failed; refusing to prepare from a changed/missing source: " + JSON.stringify(sourceVerification.issues));
  const vendorRoot = sourceById(catalog, entry.sourceId).vendorRoot;
  const templateName = nativeOmTemplateName(entry);
  const htmlPath = path.join(vendorRoot, "templates", templateName, "index.html");
  const projectApi = await import(pathToFileURL(path.join(vendorRoot, "cli", "lib", "project.js")).href);
  const declarations = projectApi.readVariables(await fs.readFile(htmlPath, "utf8"));
  const declarationsById = new Map(declarations.map((declaration) => [declaration.id, declaration]));
  const supplied = input.variables == null ? {} : input.variables;
  if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) throw new Error("variables must be a JSON object");
  for (const key of Object.keys(supplied)) if (!declarationsById.has(key)) throw new Error("variables." + key + " is not an original control for " + entry.id);
  const values = {};
  for (const declaration of declarations) {
    if (!Object.prototype.hasOwnProperty.call(supplied, declaration.id)) continue;
    const raw = supplied[declaration.id];
    const value = projectApi.coerce(declaration, raw && typeof raw === "object" ? JSON.stringify(raw) : raw);
    if (declaration.type === "number" && declaration.step != null) {
      const base = declaration.min == null ? 0 : declaration.min;
      const steps = (value - base) / declaration.step;
      if (Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error("variables." + declaration.id + " must follow the source step " + declaration.step);
    }
    values[declaration.id] = value;
  }
  const durationDecl = declarationsById.get("duration");
  const durationSec = values.duration == null ? Number(durationDecl?.default) : values.duration;
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error("the native OM template must have a positive duration variable");
  if (Math.abs(durationSec * fps - Math.round(durationSec * fps)) > 1e-7) throw new Error("duration " + durationSec + "s at " + fps + " fps is not frame-aligned");
  if (templateName === "finance-chart") {
    const seriesRaw = values.series == null ? declarationsById.get("series")?.default : values.series;
    let series;
    try { series = JSON.parse(seriesRaw); } catch (error) { throw new Error("variables.series must be valid JSON: " + error.message); }
    if (!Array.isArray(series) || !series.length) throw new Error("variables.series must be a non-empty JSON array");
    const kind = values.chart == null ? declarationsById.get("chart")?.default : values.chart;
    if (kind === "candle" && series.some((row) => !row || ["o", "h", "l", "c"].some((key) => !Number.isFinite(Number(row[key]))))) {
      throw new Error("candle series items must each contain finite o, h, l, and c values");
    }
    const highlightIndex = values.highlightIndex == null ? Number(declarationsById.get("highlightIndex")?.default) : values.highlightIndex;
    if (highlightIndex >= series.length) throw new Error("variables.highlightIndex " + highlightIndex + " is outside the " + series.length + "-item series");
  }
  if (templateName === "kinetic-type") {
    const paletteRaw = values.palette == null ? declarationsById.get("palette")?.default : values.palette;
    let palette;
    try { palette = JSON.parse(paletteRaw); } catch (error) { throw new Error("variables.palette must be valid JSON: " + error.message); }
    if (!Array.isArray(palette) || !palette.length || palette.some((row) => !Array.isArray(row) || row.length !== 2)) {
      throw new Error("variables.palette must be a non-empty JSON array of [background, text] pairs");
    }
  }

  const outputValue = path.resolve(args.output);
  const { workRoot, tempRoot } = await ensureNativeWorkRoot(args.workRoot || args.cacheDir, [outputValue]);
  if (!isWithin(workRoot, outputValue)) throw new Error("native prepared project must be below --work-root");
  if (isWithin(skillDir, outputValue)) throw new Error("refusing to create a native OM project inside the skill definition");
  if (await fs.stat(outputValue).catch(() => null)) throw new Error("Output directory already exists; choose a new project path: " + outputValue);
  const executables = await nativeOmExecutables(vendorRoot, args, tempRoot);
  runNativeOm(executables.omCli, ["new", outputValue, "--template", templateName], {
    env: executables.env, cwd: vendorRoot, label: "huashu-motion om new",
  });
  const projectIndex = path.join(outputValue, "index.html");
  let projectHtml = await fs.readFile(projectIndex, "utf8");
  if (Object.keys(values).length) projectHtml = projectApi.setVariables(projectHtml, values);
  await fs.writeFile(projectIndex, projectHtml);
  const projectVariables = projectApi.readVariables(projectHtml).map((declaration) => ({
    id: declaration.id, type: declaration.type, value: declaration.default,
  }));
  const prepared = {
    format: NATIVE_OM_SPEC_FORMAT,
    templateId: entry.id,
    sourceId: entry.sourceId,
    sourceCommit: catalog.sources.find((source) => source.id === entry.sourceId).commit,
    sourceVerification,
    sourceTemplatePath: entry.sourcePath,
    sourceTemplateSha256: sha256(await fs.readFile(htmlPath)),
    templateName,
    projectPath: outputValue,
    projectIndexPath: projectIndex,
    projectIndexSha256: sha256(await fs.readFile(projectIndex)),
    projectFiles: await hashNativeProjectFiles(outputValue),
    projectHashScope: "OM project input files; excludes the original CLI's append-only .om/renders.jsonl runtime log",
    variables: projectVariables,
    fps, width, height, durationSec,
    preparedAt: new Date().toISOString(),
  };
  const specPath = path.join(outputValue, "laohu-native-template.json");
  await fs.writeFile(specPath, JSON.stringify(prepared, null, 2) + "\n", { flag: "wx" });
  process.stdout.write("PREPARED " + outputValue + "\nSPEC " + specPath + "\nTEMPLATE " + entry.id + "\nSOURCE " + entry.sourcePath + "\n");
}

async function readPreparedNativeOm(args, catalog, entry, specPath) {
  const spec = JSON.parse(await fs.readFile(specPath, "utf8"));
  if (spec.format !== NATIVE_OM_SPEC_FORMAT) throw new Error("native OM spec format must be " + NATIVE_OM_SPEC_FORMAT);
  if (spec.templateId !== entry.id) throw new Error("prepared spec templateId is " + JSON.stringify(spec.templateId) + "; expected " + entry.id);
  if (spec.sourceId !== entry.sourceId) throw new Error("prepared spec sourceId does not match the selected catalog entry");
  const sourceVerification = await verifySource(catalog, entry.sourceId);
  if (!sourceVerification.ok) throw new Error("Pinned source verification failed before native OM " + args.command + ": " + JSON.stringify(sourceVerification.issues));
  const projectPath = path.resolve(spec.projectPath || "");
  const projectIndexPath = path.resolve(spec.projectIndexPath || path.join(projectPath, "index.html"));
  if (!spec.projectPath || !path.isAbsolute(spec.projectPath)) throw new Error("prepared native OM projectPath must be absolute");
  const workRootValue = args.workRoot || args.cacheDir;
  if (!workRootValue || !path.isAbsolute(workRootValue)) throw new Error("native OM render/preview requires an absolute --work-root (or absolute compatibility --cache-dir)");
  if (!isWithin(path.resolve(workRootValue), projectPath)) throw new Error("prepared native OM project must remain below --work-root");
  const indexBytes = await fs.readFile(projectIndexPath);
  if (sha256(indexBytes) !== spec.projectIndexSha256) throw new Error("prepared project index changed after prepare; rerun prepare from the intended input");
  if (!isWithin(projectPath, projectIndexPath)) throw new Error("prepared project index escapes its project directory");
  const currentFiles = await hashNativeProjectFiles(projectPath);
  const comparableFiles = currentFiles.filter((file) => !(path.resolve(specPath) === path.resolve(projectPath, file.path)));
  const expectedFiles = Array.isArray(spec.projectFiles) ? spec.projectFiles : [];
  if (JSON.stringify(comparableFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error("prepared native OM project files changed after prepare; rerun prepare from the intended input");
  }
  return { spec, projectPath, projectIndexPath, sourceVerification };
}

async function nativeOmMediaInfo(output, env) {
  const result = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,avg_frame_rate,nb_frames,codec_name",
    "-of", "json", output,
  ], { encoding: "utf8", env, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error("ffprobe failed for native OM output: " + (result.error?.message || result.stderr || result.status));
  const parsed = JSON.parse(result.stdout);
  const video = (parsed.streams || []).find((stream) => stream.codec_type === "video");
  const audio = (parsed.streams || []).filter((stream) => stream.codec_type === "audio");
  if (!video) throw new Error("native OM output has no video stream");
  if (audio.length) throw new Error("native OM template was expected to be picture-only, but the output contains audio");
  return {
    durationSec: Number(parsed.format?.duration),
    width: Number(video.width),
    height: Number(video.height),
    fps: parseNativeFps(video.avg_frame_rate),
    frameCount: video.nb_frames == null ? null : Number(video.nb_frames),
    videoCodec: video.codec_name,
    audioStreams: 0,
  };
}

async function renderNativeOmAction(args, catalog, entry) {
  requireNativeOmTemplate(entry, args.command);
  if (!args.spec) throw new Error("native OM render/preview requires --spec");
  const workRootValue = args.workRoot || args.cacheDir;
  if (!workRootValue || !path.isAbsolute(workRootValue)) throw new Error("native OM render/preview requires an absolute --work-root (or absolute compatibility --cache-dir)");
  if (!args.output) throw new Error("native OM render/preview requires --output");
  const preliminaryWorkRoot = path.resolve(workRootValue);
  await ensureNativeWorkRoot(preliminaryWorkRoot, [path.resolve(args.output)]);
  const suppliedSpecPath = path.resolve(args.spec);
  const suppliedSpec = JSON.parse(await fs.readFile(suppliedSpecPath, "utf8"));
  let preparedSpecPath = suppliedSpecPath;
  if (!suppliedSpec.projectPath) {
    const projectPath = path.join(preliminaryWorkRoot, "projects", entry.id + "-" + Date.now().toString(36));
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await prepareNativeOm({
      ...args,
      command: "prepare",
      input: suppliedSpecPath,
      output: projectPath,
      workRoot: preliminaryWorkRoot,
    }, catalog, entry);
    preparedSpecPath = path.join(projectPath, "laohu-native-template.json");
  }
  const prepared = await readPreparedNativeOm(args, catalog, entry, preparedSpecPath);
  const output = await requireNewOutput(args.output, [path.join(skillDir, "templates"), skillDir]);
  const { workRoot, tempRoot } = await ensureNativeWorkRoot(args.workRoot || args.cacheDir, [output]);
  if (!isWithin(workRoot, prepared.projectPath)) throw new Error("prepared project must remain below --work-root so browser profiles and renders stay on the same external volume");
  const vendorRoot = sourceById(catalog, entry.sourceId).vendorRoot;
  const executables = await nativeOmExecutables(vendorRoot, args, tempRoot);
  let mediaInfo;
  let omOutput = "";
  if (args.command === "preview") {
    const time = Number(args.time);
    if (!Number.isFinite(time) || time < 0 || time >= prepared.spec.durationSec) throw new Error("preview --time must be in [0, " + prepared.spec.durationSec + ") seconds");
    const result = runNativeOm(executables.omCli, ["still", prepared.projectPath, "--at", String(time), "--out", output], {
      env: executables.env, cwd: vendorRoot, label: "huashu-motion om still",
    });
    omOutput = (result.stdout + result.stderr).trim();
    const bytes = await fs.readFile(output);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("huashu-motion preview did not produce a valid PNG");
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width !== prepared.spec.width || height !== prepared.spec.height) throw new Error("preview dimensions " + width + "x" + height + " do not match prepared spec");
    mediaInfo = { format: "png", width, height, timeSec: time, bytes: bytes.length, sha256: sha256(bytes) };
  } else {
    const fps = Number(args.fps || prepared.spec.fps);
    if (![24, 25, 30, 50, 60].includes(fps)) throw new Error("native OM render fps must be one of 24, 25, 30, 50, or 60");
    const result = runNativeOm(executables.omCli, [
      "render", prepared.projectPath, "--format", "mp4", "--fps", String(fps), "--workers", "1", "--video", "seek", "--out", output,
    ], { env: executables.env, cwd: vendorRoot, label: "huashu-motion om render" });
    omOutput = (result.stdout + result.stderr).trim();
    mediaInfo = await nativeOmMediaInfo(output, executables.env);
    if (mediaInfo.width !== prepared.spec.width || mediaInfo.height !== prepared.spec.height) throw new Error("render dimensions do not match the prepared native OM project");
    if (Math.abs(mediaInfo.fps - fps) > 1e-6) throw new Error("render fps does not match the requested fps");
    const expectedFrames = Math.round(prepared.spec.durationSec * fps);
    if (mediaInfo.frameCount != null && mediaInfo.frameCount !== expectedFrames) throw new Error("render frame count is " + mediaInfo.frameCount + "; expected " + expectedFrames);
    mediaInfo.expectedFrameCount = expectedFrames;
    mediaInfo.outputSha256 = sha256(await fs.readFile(output));
  }
  const manifestPath = args.manifest ? path.resolve(args.manifest) : output + ".manifest.json";
  await requireNewOutput(manifestPath, [path.join(skillDir, "templates"), skillDir]);
  const manifest = {
    format: "laohu.huashu-native-template-render/1",
    templateId: entry.id,
    sourceId: entry.sourceId,
    sourceCommit: catalog.sources.find((source) => source.id === entry.sourceId).commit,
    sourceVerification: prepared.sourceVerification,
    sourceTemplate: { path: entry.sourcePath, sha256: prepared.spec.sourceTemplateSha256 },
    preparedSpecPath: preparedSpecPath,
    projectPath: prepared.projectPath,
    projectIndexSha256: prepared.spec.projectIndexSha256,
    projectFileHashes: prepared.spec.projectFiles,
    projectHashScope: prepared.spec.projectHashScope,
    omRuntimeRenderLog: await fs.readFile(path.join(prepared.projectPath, ".om", "renders.jsonl")).then((bytes) => ({ path: ".om/renders.jsonl", sha256: sha256(bytes) })).catch(() => null),
    variables: prepared.spec.variables,
    browser: { path: executables.browserPath, version: executables.browserVersion },
    ffmpegPath: executables.ffmpegPath,
    tempRoot,
    requested: args.command === "preview" ? { kind: "preview", timeSec: mediaInfo.timeSec } : { kind: "render", fps: mediaInfo.fps, durationSec: prepared.spec.durationSec },
    output,
    media: mediaInfo,
    omOutput,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  process.stdout.write("OUTPUT " + output + "\nTEMPLATE " + entry.id + "\nMEDIA " + JSON.stringify(mediaInfo) + "\nMANIFEST " + manifestPath + "\n");
}

async function prepare(args, catalog, entry) {
  if (entry.renderer === "video-shotcraft-remotion") {
    if (!args.input || !args.output) throw new Error("prepare requires --input and --output");
    const sourceVerification = await verifySource(catalog, entry.sourceId);
    if (!sourceVerification.ok) throw new Error(`Pinned Shotcraft source verification failed: ${JSON.stringify(sourceVerification.issues)}`);
    const inputPath = path.resolve(args.input);
    const output = await requireNewOutput(args.output, [path.join(skillDir, "templates"), skillDir]);
    const receiptPath = `${output}.assets.json`;
    await requireNewOutput(receiptPath, [path.join(skillDir, "templates"), skillDir]);
    const adapter = await import("../templates/adapters/video-shotcraft-remotion.mjs");
    const result = await adapter.prepareShotcraftInput({catalog, entry, inputPath, outputPath:output, assetsRoot:args.assetsRoot ? path.resolve(args.assetsRoot) : undefined});
    process.stdout.write(`PREPARED ${result.outputPath}\nASSET_RECEIPT ${result.receiptPath}\nTEMPLATE ${entry.id}\nSOURCE ${entry.component.path}\n`);
    return;
  }
  if (entry.renderer === "native-html-canvas-template") return prepareNativeHtml(args, catalog, entry);
  if (entry.renderer === "native-om-template-source") return prepareNativeOm(args, catalog, entry);
  requireNativeClip(entry, "prepare");
  if (!args.input || !args.output) throw new Error("prepare requires --input and --output");
  const inputPath = path.resolve(args.input);
  const raw = await fs.readFile(inputPath, "utf8");
  const spec = JSON.parse(raw);
  checkSpec(spec, entry);
  const sourceVerification = await verifySource(catalog, entry.sourceId);
  if (!sourceVerification.ok) throw new Error(`Pinned source verification failed; refusing to prepare from a changed/missing source: ${JSON.stringify(sourceVerification.issues)}`);
  const assetsRoot = path.resolve(args.assetsRoot || path.dirname(inputPath));
  const assets = await inspectSpecAssets(spec, assetsRoot);
  const output = await requireNewOutput(args.output, [path.join(skillDir, "templates"), skillDir]);
  const receiptPath = `${output}.assets.json`;
  await requireNewOutput(receiptPath, [path.join(skillDir, "templates"), skillDir]);
  await fs.writeFile(output, `${JSON.stringify(spec, null, 2)}\n`, { flag: "wx" });
  const receipt = { kind: "native-template-input-receipt", templateId: entry.id, sourceId: entry.sourceId, sourceCommit: catalog.sources.find((source) => source.id === entry.sourceId).commit, sourceVerification, specSha256: sha256(Buffer.from(`${JSON.stringify(spec, null, 2)}\n`)), assetsRoot, assets };
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`PREPARED ${output}\nASSET_RECEIPT ${receiptPath}\nTEMPLATE ${entry.id}\nSOURCE ${entry.sourcePath}\n`);
}

async function prepareNativeHtml(args, catalog, entry) {
  requireNativeHtmlTemplate(entry, "prepare");
  if (!args.input || !args.output) throw new Error("prepare requires --input and --output");
  const inputPath = path.resolve(args.input);
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  validateNativeHtmlSpec(input, entry);
  const sourceVerification = await verifyNativeHtmlSources(catalog, entry);
  const parameters = structuredClone(input.parameters || {});
  let preparedSpec;
  if (entry.id === "motion-code-video-showcase-big-card") {
    preparedSpec = {
      templateId: entry.id,
      duration: 1,
      fps: input.fps || 30,
      width: 1920,
      height: 1080,
      parameters: {
        layout: parameters.layout ?? 0,
        index: parameters.index ?? 1,
        total: parameters.total ?? 11,
        color: parameters.color ?? "#ffcf5c",
        first: parameters.first ?? "想做",
        keyword: parameters.keyword ?? "科普视频？",
        brand: parameters.brand,
        ...(parameters.theme ? { theme: parameters.theme } : {}),
      },
    };
  } else {
    preparedSpec = {
      templateId: entry.id,
      duration: input.duration,
      fps: input.fps || 30,
      width: 1920,
      height: 1080,
      parameters: {
        title: parameters.title,
        subtitle: parameters.subtitle ?? "",
        brand: parameters.brand,
        capsuleName: parameters.capsuleName ?? "章节",
        capsuleCategory: parameters.capsuleCategory ?? "",
        t0: parameters.t0 ?? 0,
        speed: parameters.speed ?? 1,
        ...(parameters.theme ? { theme: parameters.theme } : {}),
      },
    };
  }
  validateNativeHtmlSpec(preparedSpec, entry);
  const htmlPage = await deriveNativeHtmlPage(catalog, entry, preparedSpec);
  const output = await requireNewOutput(args.output, [path.join(skillDir, "templates"), skillDir]);
  const receiptPath = `${output}.assets.json`;
  await requireNewOutput(receiptPath, [path.join(skillDir, "templates"), skillDir]);
  const specBytes = Buffer.from(`${JSON.stringify(preparedSpec, null, 2)}\n`);
  const receipt = {
    kind: "native-html-canvas-template-input-receipt",
    templateId: entry.id,
    sourceId: entry.sourceId,
    sourceCommit: catalog.sources.find((source) => source.id === entry.sourceId).commit,
    sourcePath: entry.sourcePath,
    originalSourceHtmlSha256: htmlPage.originalSha256,
    sourceVerification,
    adapter: { kind: entry.adapter.kind, fontCssPath: entry.adapter.fontCssPath, fontCssSha256: entry.adapter.fontCssSha256, fontAssets: entry.adapter.fontAssets },
    preparedSpecSha256: sha256(specBytes),
    spec: preparedSpec,
    htmlAdaptation: { originalSha256: htmlPage.originalSha256, derivedSha256: htmlPage.derivedSha256, literalReplacements: htmlPage.literalReplacements, sourcePatches: htmlPage.sourcePatches },
    assets: [],
  };
  await fs.writeFile(output, specBytes, { flag: "wx" });
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`PREPARED ${output}\nASSET_RECEIPT ${receiptPath}\nTEMPLATE ${entry.id}\nSOURCE ${entry.sourceId}@${receipt.sourceCommit} ${entry.sourcePath}\n`);
}

function collectSpecAssetValues(spec) {
  const values = [];
  for (const [index, cue] of (spec.cues || []).entries()) {
    if (cue.image != null) values.push({ value: cue.image, label: `cues[${index}].image` });
    if (Array.isArray(cue.frames)) cue.frames.forEach((value, frame) => values.push({ value, label: `cues[${index}].frames[${frame}]` }));
  }
  if (spec.data?.image != null) values.push({ value: spec.data.image, label: "data.image" });
  const frames = spec.data?.character?.frames;
  if (frames && typeof frames === "object" && !Array.isArray(frames)) {
    for (const [pose, value] of Object.entries(frames)) values.push({ value, label: `data.character.frames.${pose}` });
  }
  return values;
}

async function resolveLocalAsset(value, assetsRoot, label) {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty local path`);
  if (/^data:/i.test(value)) return { dataUrl: value };
  if (/^https?:/i.test(value)) throw new Error(`${label} points to a network URL; this renderer is offline-only and will not fetch it`);
  const input = path.isAbsolute(value) ? path.resolve(value) : path.resolve(assetsRoot, value);
  if (!isWithin(assetsRoot, input)) throw new Error(`${label} escapes --assets-root; keep authorized local media inside the declared root`);
  return fs.stat(input).then((stat) => {
    if (!stat.isFile()) throw new Error(`${label} is not a file: ${input}`);
    return { input, relative: path.relative(assetsRoot, input).split(path.sep).join("/") };
  });
}

async function inspectSpecAssets(spec, assetsRoot) {
  const assets = [];
  for (const item of collectSpecAssetValues(spec)) {
    const resolved = await resolveLocalAsset(item.value, assetsRoot, item.label);
    assets.push(resolved.dataUrl ? { label: item.label, kind: "data-url", sha256: sha256(Buffer.from(resolved.dataUrl)) } : { label: item.label, path: resolved.relative, sha256: sha256(await fs.readFile(resolved.input)) });
  }
  return assets;
}

async function mapSpecAssets(spec, assetsRoot, origin) {
  const mapped = structuredClone(spec);
  const replace = async (parent, key, label) => {
    if (parent && parent[key] != null) {
      const resolved = await resolveLocalAsset(parent[key], assetsRoot, label);
      if (!resolved.dataUrl) parent[key] = `${origin}/input/${resolved.relative.split("/").map(encodeURIComponent).join("/")}`;
    }
  };
  for (const [index, cue] of (mapped.cues || []).entries()) {
    await replace(cue, "image", `cues[${index}].image`);
    if (Array.isArray(cue.frames)) {
      for (let frame = 0; frame < cue.frames.length; frame += 1) {
        const resolved = await resolveLocalAsset(cue.frames[frame], assetsRoot, `cues[${index}].frames[${frame}]`);
        if (!resolved.dataUrl) cue.frames[frame] = `${origin}/input/${resolved.relative.split("/").map(encodeURIComponent).join("/")}`;
      }
    }
  }
  await replace(mapped.data, "image", "data.image");
  const characterFrames = mapped.data?.character?.frames;
  if (characterFrames && typeof characterFrames === "object" && !Array.isArray(characterFrames)) {
    for (const [pose, value] of Object.entries(characterFrames)) {
      const resolved = await resolveLocalAsset(value, assetsRoot, `data.character.frames.${pose}`);
      if (!resolved.dataUrl) mapped.data.character.frames[pose] = `${origin}/input/${resolved.relative.split("/").map(encodeURIComponent).join("/")}`;
    }
  }
  return mapped;
}

function safeFile(root, relative) {
  const decoded = decodeURIComponent(relative);
  const full = path.resolve(root, decoded);
  if (!isWithin(root, full)) return null;
  return full;
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4" })[ext] || "application/octet-stream";
}

async function startLocalServer(engineRoot, inputRoot) {
  const servedFiles = new Map();
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      let file = null;
      if (pathname.startsWith("/engine/")) file = safeFile(engineRoot, pathname.slice("/engine/".length));
      else if (pathname.startsWith("/input/")) file = safeFile(inputRoot, pathname.slice("/input/".length));
      if (!file) { response.writeHead(404); response.end("Not found"); return; }
      const stat = await fs.stat(file);
      if (!stat.isFile()) { response.writeHead(404); response.end("Not found"); return; }
      const bytes = await fs.readFile(file);
      if (pathname.startsWith("/engine/")) servedFiles.set(pathname, { sha256: sha256(bytes), bytes: bytes.length });
      response.writeHead(200, { "content-type": contentType(file), "content-length": bytes.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
      response.end(bytes);
    } catch {
      response.writeHead(404); response.end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}`, servedFiles };
}

async function verifyNativeHtmlSources(catalog, entry) {
  const sourceIds = [...new Set([entry.sourceId, ...(entry.adapter?.runtimeDependencySourceIds || [])])];
  const sources = await Promise.all(sourceIds.map(async (sourceId) => ({ sourceId, ...(await verifySource(catalog, sourceId)) })));
  const adapterPath = path.resolve(skillDir, "templates", entry.adapter?.fontCssPath || "");
  const templatesRoot = path.join(skillDir, "templates");
  if (!entry.adapter?.fontCssPath || !isWithin(templatesRoot, adapterPath)) throw new Error(`${entry.id} font CSS adapter path must stay below templates`);
  const adapterBytes = await fs.readFile(adapterPath);
  const adapterSha256 = sha256(adapterBytes);
  if (adapterSha256 !== entry.adapter.fontCssSha256) throw new Error(`Pinned font CSS adapter changed: expected ${entry.adapter.fontCssSha256}, received ${adapterSha256}`);
  const failed = sources.filter((result) => !result.ok);
  if (failed.length) throw new Error(`Pinned native HTML source closure failed verification; refusing to prepare/render changed bytes: ${JSON.stringify(failed.map((result) => ({ sourceId: result.sourceId, issues: result.issues })))}`);
  return { ok: true, sources, adapter: { path: entry.adapter.fontCssPath, sha256: adapterSha256, bytes: adapterBytes.length } };
}

function jsStringLiteral(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function replaceSegmentLiteral(sourceText, identifier, originalLiteral, replacementValue) {
  const escaped = originalLiteral.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(const\\s+${identifier}\\s*=\\s*)'${escaped}'(?=\\s*;)`, "g");
  const matches = [...sourceText.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`Expected one original ${identifier} literal, found ${matches.length}; refusing an ambiguous HTML adaptation`);
  return {
    sourceText: sourceText.replace(pattern, (_match, prefix) => `${prefix}${jsStringLiteral(replacementValue)}`),
    record: { identifier, originalLiteral, replacementValue, encoding: "JSON string literal with HTML parser terminators escaped" },
  };
}

function replaceSegmentCapsuleCall(sourceText, branch, originalCall, capsuleName, capsuleCategory, optionsArgument = "") {
  const matches = sourceText.split(originalCall).length - 1;
  if (matches !== 1) throw new Error(`Expected one original ${branch} capsule call, found ${matches}; refusing an ambiguous HTML adaptation`);
  const encodedName = jsStringLiteral(capsuleName);
  const encodedCategory = jsStringLiteral(capsuleCategory);
  const derivedCall = [
    "ctx.save();",
    "ctx.textAlign = 'left';",
    "window.__templateCapsuleLabelCalls = window.__templateCapsuleLabelCalls || [];",
    `window.__templateCapsuleLabelCalls.push({ branch: ${jsStringLiteral(branch)}, textAlign: ctx.textAlign, name: ${encodedName}, category: ${encodedCategory} });`,
    `try { drawCapsuleLabel(ctx, 1, ${encodedName}, ${encodedCategory}${optionsArgument}); } finally { ctx.restore(); }`,
  ].join(" ");
  return {
    sourceText: sourceText.replace(originalCall, derivedCall),
    record: {
      kind: "canvas-context-state-isolation",
      branch,
      originalCall,
      derivedCall,
      alignment: "left",
      state: "ctx.save()/ctx.restore() around the original drawCapsuleLabel call",
      originalDrawingFunctionModified: false,
    },
  };
}

async function deriveNativeHtmlPage(catalog, entry, spec) {
  const { source, vendorRoot } = sourceById(catalog, entry.sourceId);
  const sourcePath = path.resolve(vendorRoot, entry.sourcePath);
  if (!isWithin(vendorRoot, sourcePath)) throw new Error(`Template source escapes vendorRoot: ${entry.sourcePath}`);
  const originalBytes = await fs.readFile(sourcePath);
  const sourcePin = source.files.find((file) => file.path === entry.sourcePath);
  const originalSha256 = sha256(originalBytes);
  if (!sourcePin || sourcePin.sha256 !== originalSha256) throw new Error(`Original HTML pin mismatch for ${entry.id}; refusing to derive from changed source`);
  const literalReplacements = [];
  const sourcePatches = [];
  let bytes = originalBytes;
  if (entry.id === "motion-code-video-showcase-segment") {
    let text = originalBytes.toString("utf8");
    const capsuleName = spec.parameters.capsuleName ?? "章节";
    const capsuleCategory = spec.parameters.capsuleCategory ?? "";
    const replacements = [
      ["BRAND", "{{BRAND}}", spec.parameters.brand],
      ["PLACEHOLDER_TITLE", "风格段标题", spec.parameters.title],
    ];
    if (spec.parameters.theme !== "aqua-morandi") replacements.push(["PLACEHOLDER_SUB", "替换 drawScene() 开始做真正的画面", spec.parameters.subtitle ?? ""]);
    for (const [identifier, literal, value] of replacements) {
      const changed = replaceSegmentLiteral(text, identifier, literal, value);
      text = changed.sourceText;
      literalReplacements.push(changed.record);
    }
    literalReplacements.push(
      { identifier: "capsuleName", originalLiteral: "示例风格", replacementValue: capsuleName, encoding: "JSON string literal with HTML parser terminators escaped", appliedToCallSites: 2 },
      { identifier: "capsuleCategory", originalLiteral: "分类", replacementValue: capsuleCategory, encoding: "JSON string literal with HTML parser terminators escaped", appliedToCallSites: 2 },
    );
    const callSites = [
      { branch: "themed", originalCall: "drawCapsuleLabel(ctx, 1, '示例风格', '分类', HUD.capsule);", optionsArgument: ", HUD.capsule" },
      { branch: "legacy", originalCall: "drawCapsuleLabel(ctx, 1, '示例风格', '分类');", optionsArgument: "" },
    ];
    for (const callSite of callSites) {
      const changed = replaceSegmentCapsuleCall(text, callSite.branch, callSite.originalCall, capsuleName, capsuleCategory, callSite.optionsArgument);
      text = changed.sourceText;
      sourcePatches.push(changed.record);
    }
    bytes = Buffer.from(text, "utf8");
  }
  return { source, vendorRoot, sourcePath, sourcePin, originalBytes, originalSha256, bytes, derivedSha256: sha256(bytes), literalReplacements, sourcePatches };
}

async function startNativeHtmlServer(catalog, entry, htmlPage) {
  const { vendorRoot } = sourceById(catalog, entry.sourceId);
  const sourcesById = new Map(catalog.sources.map((source) => [source.id, source]));
  const pinned = new Map();
  for (const sourceId of [entry.sourceId, ...(entry.adapter.runtimeDependencySourceIds || [])]) {
    const source = sourcesById.get(sourceId);
    for (const file of source?.files || []) pinned.set(`${sourceId}:${file.path}`, file);
  }
  const allowedFonts = new Map((entry.adapter.fontAssets || []).map((asset) => [`${asset.sourceId}:${asset.path}`, asset]));
  const adapterCssPath = path.resolve(skillDir, "templates", entry.adapter.fontCssPath);
  const servedFiles = new Map();
  const adapterResponses = new Map();
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const pathname = url.pathname;
      let sourceId = null;
      let relative = null;
      let file = null;
      let bytes = null;
      let pin = null;
      let derived = null;
      if (pathname === "/shared/fonts.css") {
        file = adapterCssPath;
        bytes = await fs.readFile(file);
        const actualSha256 = sha256(bytes);
        adapterResponses.set(pathname, { sha256: actualSha256, bytes: bytes.length, pinnedSha256: entry.adapter.fontCssSha256, matchesPin: actualSha256 === entry.adapter.fontCssSha256 });
        if (actualSha256 !== entry.adapter.fontCssSha256) throw new Error("font CSS adapter changed after verification");
      } else if (pathname.startsWith("/templates/")) {
        const decoded = decodeURIComponent(pathname.slice("/templates/".length));
        relative = path.posix.normalize(path.posix.join("templates", decoded));
        if (relative.startsWith("../") || relative === "..") throw new Error("template path escapes source root");
        pin = pinned.get(`${entry.sourceId}:${relative}`);
        if (!pin || !(entry.closure || []).includes(relative)) throw new Error(`unlisted original source request ${relative}`);
        sourceId = entry.sourceId;
        file = path.resolve(vendorRoot, relative);
        if (!isWithin(vendorRoot, file)) throw new Error("template file escapes source root");
        if (relative === entry.sourcePath && htmlPage) {
          bytes = htmlPage.bytes;
          if (sha256(bytes) !== htmlPage.derivedSha256) throw new Error("derived HTML response does not match its receipt hash");
          if (htmlPage.derivedSha256 !== htmlPage.originalSha256) derived = { originalSha256: htmlPage.originalSha256, servedSha256: htmlPage.derivedSha256, reason: "content-literal-and-canvas-state-adapter", replacements: htmlPage.literalReplacements, sourcePatches: htmlPage.sourcePatches };
        } else bytes = await fs.readFile(file);
        if (relative !== entry.sourcePath && sha256(bytes) !== pin.sha256) throw new Error(`pinned source changed after verification: ${relative}`);
        if (relative === entry.sourcePath && !derived && sha256(bytes) !== pin.sha256) throw new Error(`pinned source changed after verification: ${relative}`);
        servedFiles.set(`${sourceId}:${relative}`, { sourceId, path: relative, sha256: sha256(bytes), bytes: bytes.length, pinnedSha256: pin.sha256, matchesPin: sha256(bytes) === pin.sha256, ...(derived ? { derived } : {}) });
      } else if (pathname.startsWith("/font-assets/")) {
        const decoded = decodeURIComponent(pathname.slice("/font-assets/".length));
        const separator = decoded.indexOf("/");
        if (separator < 1) throw new Error("font asset URL must include its catalog source ID and relative path");
        sourceId = decoded.slice(0, separator);
        relative = path.posix.normalize(decoded.slice(separator + 1));
        if (relative.startsWith("../") || relative === "..") throw new Error("font asset path escapes source root");
        const key = `${sourceId}:${relative}`;
        if (!allowedFonts.has(key)) throw new Error(`font asset is not declared by this adapter: ${key}`);
        pin = pinned.get(key);
        if (!pin) throw new Error(`font asset is not in the verified source closure: ${key}`);
        const fontSource = sourcesById.get(sourceId);
        const fontRoot = sourceById(catalog, sourceId).vendorRoot;
        file = path.resolve(fontRoot, relative);
        if (!fontRoot || !isWithin(fontRoot, file)) throw new Error("font asset escapes its source root");
        bytes = await fs.readFile(file);
        if (sha256(bytes) !== pin.sha256) throw new Error(`pinned font changed after verification: ${key}`);
        servedFiles.set(key, { sourceId, path: relative, sha256: sha256(bytes), bytes: bytes.length, pinnedSha256: pin.sha256, matchesPin: sha256(bytes) === pin.sha256, license: fontSource?.license || null });
      }
      if (!file || !bytes) { response.writeHead(404); response.end("Not found"); return; }
      response.writeHead(200, {
        "content-type": contentType(file),
        "content-length": bytes.length,
        "cache-control": pathname.startsWith("/font-assets/") ? "public, max-age=31536000, immutable" : "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(bytes);
    } catch {
      response.writeHead(404); response.end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}`, servedFiles, adapterResponses };
}

function htmlPageUrl(entry, spec, origin, frameSerial = 0) {
  const url = new URL(`/${entry.sourcePath}`, origin);
  const p = spec.parameters;
  if (entry.id === "motion-code-video-showcase-big-card") {
    for (const key of ["layout", "index", "total", "color", "first", "keyword", "brand"]) {
      const fallback = { layout: 0, index: 1, total: 11, color: "#ffcf5c", first: "想做", keyword: "科普视频？" }[key];
      url.searchParams.set(key, String(p[key] ?? fallback));
    }
    if (p.theme) url.searchParams.set("theme", p.theme);
  } else {
    url.searchParams.set("seg", "1");
    url.searchParams.set("t0", String(p.t0 ?? 0));
    url.searchParams.set("speed", String(p.speed ?? 1));
    url.searchParams.set("dur", String(spec.duration));
    if (p.theme) url.searchParams.set("theme", p.theme);
  }
  url.searchParams.set("__frame", String(frameSerial));
  return url.href;
}

async function launchWithProjectBrowserTempRoot(runRoot, launch) {
  const absoluteRunRoot = path.resolve(runRoot);
  if (!path.isAbsolute(absoluteRunRoot)) throw new Error("Browser cache root must resolve to an absolute project path");
  await fs.mkdir(absoluteRunRoot, { recursive: true });
  const browserTempRoot = await fs.mkdtemp(path.join(absoluteRunRoot, "playwright-browser-tmp-"));
  const previousTempEnvironment = Object.fromEntries(["TMPDIR", "TMP", "TEMP"].map((key) => [key, process.env[key]]));
  let cleaned = false;
  const cleanupBrowserTempRoot = async () => {
    if (cleaned) return;
    cleaned = true;
    await fs.rm(browserTempRoot, { recursive: true, force: true });
  };
  try {
    for (const key of Object.keys(previousTempEnvironment)) process.env[key] = browserTempRoot;
    const runtime = await launch(browserTempRoot);
    return { ...runtime, browserTempRoot, cleanupBrowserTempRoot };
  } catch (error) {
    await cleanupBrowserTempRoot();
    throw error;
  } finally {
    for (const [key, value] of Object.entries(previousTempEnvironment)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function launchNativeHtmlPage(spec, entry, options = {}) {
  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch (error) { throw new Error(`Local Playwright is required for native HTML/Canvas rendering; it was not found in Node's module path. No dependency was installed. Original error: ${error.message}`); }
  requireNativeHtmlTemplate(entry, options.action || "render");
  const sourceVerification = await verifyNativeHtmlSources(options.catalog, entry);
  const htmlPage = await deriveNativeHtmlPage(options.catalog, entry, spec);
  const { server, origin, servedFiles, adapterResponses } = await startNativeHtmlServer(options.catalog, entry, htmlPage);
  const externalRequests = [];
  const localRequests = [];
  const consoleRows = [];
  const requestFailures = [];
  const browserPath = options.browser || process.env.MOTION_BROWSER || process.env.CHROME_PATH;
  const browserTempRoot = options.browserTempRoot;
  if (!path.isAbsolute(browserTempRoot || "")) throw new Error("Native HTML rendering requires an absolute browserTempRoot under the selected project cache; relative TMPDIR values are not used");
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: options.software ? ["--disable-gpu", "--use-gl=swiftshader"] : [], ...(browserPath ? { executablePath: browserPath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin === origin) localRequests.push(url.pathname);
    });
    page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText || "request failed" }));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        externalRequests.push(route.request().url());
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type())) consoleRows.push({ type: message.type(), text: message.text() });
    });
    page.on("pageerror", (error) => consoleRows.push({ type: "pageerror", text: error.message }));
    await page.addInitScript((frequentReadback) => {
      if (!frequentReadback) return;
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, attributes) {
        if (this.id === "c" && type === "2d") attributes = { ...(attributes || {}), willReadFrequently: true };
        return getContext.call(this, type, attributes);
      };
    }, options.frequentReadback !== false);
    let firstBoot;
    try {
      firstBoot = await bootNativeHtmlDocument(page, htmlPageUrl(entry, spec, origin), entry, spec, localRequests, htmlPage);
    } catch (error) {
      error.evidence = { localRequests: [...localRequests], externalRequests, requestFailures, console: consoleRows, servedFiles: [...servedFiles.entries()], adapterResponses: [...adapterResponses.entries()] };
      throw error;
    }
    return { browser, browserExecutable: browserPath || "playwright-managed-default", browserTempRoot, page, server, origin, source: htmlPage.source, sourceVerification, htmlPage, firstBoot, consoleRows, requestFailures, externalRequests, localRequests, servedFiles, adapterResponses, sourceLoadFonts: firstBoot.sourceLoadFonts };
  } catch (error) {
    if (browser) await browser.close();
    server.close();
    throw error;
  }
}

function extractOriginalLoadFonts(htmlPage) {
  const source = htmlPage.originalBytes.toString("utf8");
  const match = source.match(/loadFonts\(\s*\[([^\]]+)\]/);
  if (!match) throw new Error("Could not read the original page's loadFonts call; refusing to claim its font dependencies");
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((row) => row[1]);
}

async function bootNativeHtmlDocument(page, pageUrl, entry, spec, localRequests, htmlPage) {
  const sourceLoadFonts = extractOriginalLoadFonts(htmlPage);
  await page.goto(pageUrl, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => !!window.__ready || !!window.__bootError || !!window.__bootFailed, null, { timeout: 120000 });
  const boot = await page.evaluate((families) => {
    const normalize = (value) => String(value || "").replace(/^['"]|['"]$/g, "").trim().toLowerCase();
    const faces = Array.from(document.fonts).map((face) => ({ family: face.family, weight: face.weight, style: face.style, status: face.status }));
    const fontStatus = Object.fromEntries(families.map((family) => {
      const matching = faces.filter((face) => normalize(face.family) === family.toLowerCase());
      return [family, { faceCount: matching.length, loadedFaceCount: matching.filter((face) => face.status === "loaded").length, faces: matching }];
    }));
    const canvas = document.querySelector("canvas#c");
    return {
      ready: !!window.__ready,
      failed: window.__bootError || window.__bootFailed || null,
      duration: window.DURATION ?? null,
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      fontStatus,
      allFontFaces: faces,
    };
  }, sourceLoadFonts);
  const requested = new Set(localRequests);
  const expectedFontAssets = sourceLoadFonts.map((family) => {
    const asset = entry.adapter.fontAssets.find((font) => font.family === family);
    if (!asset) throw new Error(`${entry.id} has no pinned local font mapping for original loadFonts family ${family}`);
    const encoded = asset.path.split("/").map(encodeURIComponent).join("/");
    return { family, path: `/font-assets/${asset.sourceId}/${encoded}`, loaded: boot.fontStatus[family]?.loadedFaceCount > 0 };
  });
  const missingFonts = expectedFontAssets.filter((font) => !font.loaded || !requested.has(font.path));
  const expectedCanvas = boot.canvas?.width === 1920 && boot.canvas?.height === 1080;
  if (!boot.ready || boot.failed || !expectedCanvas || missingFonts.length) {
    throw new Error(`Original HTML runtime boot/font gate failed for ${entry.id}: ${JSON.stringify({ boot, expectedFontAssets, missingFonts })}`);
  }
  return { ...boot, sourceLoadFonts, expectedFontAssets };
}

async function renderNativeHtmlFrame(page, entry, spec, timeSec, serial) {
  const frame = await page.evaluate(async ({ time, width, height }) => {
    const canvas = document.querySelector("canvas#c");
    if (!canvas || canvas.width !== width || canvas.height !== height) throw new Error("original canvas dimensions differ from the fixed source dimensions");
    if (typeof window.renderFrame !== "function") throw new Error("original window.renderFrame(t) is unavailable");
    window.renderFrame(time);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    const pixelSha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
    let hash = 2166136261;
    let alphaPixels = 0;
    let nonBlackPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      hash = Math.imul(hash ^ pixels[index], 16777619);
      hash = Math.imul(hash ^ pixels[index + 1], 16777619);
      hash = Math.imul(hash ^ pixels[index + 2], 16777619);
      hash = Math.imul(hash ^ pixels[index + 3], 16777619);
      if (pixels[index + 3] > 0) alphaPixels += 1;
      if (pixels[index] > 8 || pixels[index + 1] > 8 || pixels[index + 2] > 8) nonBlackPixels += 1;
    }
    return { timeSec: time, width: canvas.width, height: canvas.height, pixelHash: (hash >>> 0).toString(16).padStart(8, "0"), pixelSha256, alphaPixels, nonBlackPixels, capsuleCallEvidence: window.__templateCapsuleLabelCalls || [], png: canvas.toDataURL("image/png").split(",")[1] };
  }, { time: timeSec, width: 1920, height: 1080 });
  return { ...frame, serial, png: Buffer.from(frame.png, "base64") };
}

async function renderNativeHtmlAction(args, catalog, entry) {
  if (args.software && args.hardware) throw new Error("--software and --hardware are mutually exclusive; software capture is the default");
  requireNativeHtmlTemplate(entry, args.command);
  if (!args.spec || !args.output) throw new Error(`${args.command} requires --spec and --output`);
  const specPath = path.resolve(args.spec);
  const raw = await fs.readFile(specPath, "utf8");
  const spec = JSON.parse(raw);
  validateNativeHtmlSpec(spec, entry);
  const receiptPath = `${specPath}.assets.json`;
  const receipt = await fs.readFile(receiptPath, "utf8").then((text) => JSON.parse(text)).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (receipt && receipt.templateId !== entry.id) throw new Error(`Prepared input receipt belongs to ${receipt.templateId}, not ${entry.id}`);
  if (receipt && receipt.preparedSpecSha256 !== sha256(Buffer.from(raw))) throw new Error(`Prepared spec hash differs from ${receiptPath}; re-run prepare so its source and adapter binding is current`);
  const sourceVerification = await verifyNativeHtmlSources(catalog, entry);
  if (receipt && (receipt.sourceCommit !== catalog.sources.find((source) => source.id === entry.sourceId).commit
      || receipt.adapter?.fontCssSha256 !== sourceVerification.adapter.sha256)) {
    throw new Error(`Prepared source or font adapter binding differs from ${receiptPath}; re-run prepare`);
  }
  const output = await requireNewOutput(args.output, [path.join(skillDir, "templates"), skillDir]);
  const manifestPath = args.manifest ? await requireNewOutput(args.manifest, [path.join(skillDir, "templates"), skillDir]) : null;
  if (manifestPath === output) throw new Error("--manifest and --output must be different paths");
  const isPreview = args.command === "preview";
  const outputExt = path.extname(output).toLowerCase();
  if (isPreview && outputExt !== ".png") throw new Error("preview output must be .png");
  if (!isPreview && ![".mp4", ".png"].includes(outputExt)) throw new Error("render output must be .mp4 or .png");

  const repoRoot = path.resolve(skillDir, "../../..");
  const runRoot = path.resolve(args.cacheDir || process.env.MOTION_TEMPLATE_CACHE_DIR || path.join(repoRoot, ".cache", "tmp", "laohu-motion-template-render"));
  await fs.mkdir(runRoot, { recursive: true });
  const outputDevice = (await fs.stat(path.dirname(output))).dev;
  const cacheDevice = (await fs.stat(runRoot)).dev;
  if (outputDevice !== cacheDevice) throw new Error(`render cache and output must be on the same volume; cache=${runRoot}`);
  const softwareCapture = !args.hardware;
  const runtime = await launchWithProjectBrowserTempRoot(runRoot, (browserTempRoot) => launchNativeHtmlPage(spec, entry, {
      catalog,
      browser: args.browser,
      browserTempRoot,
      software: softwareCapture,
      frequentReadback: !args.noFrequentReadback,
      action: args.command,
    }));
  const { browser, browserExecutable, page, server, origin, source, sourceVerification: runtimeSourceVerification,
    htmlPage, firstBoot, consoleRows, requestFailures, externalRequests, localRequests, servedFiles, adapterResponses,
    browserTempRoot, cleanupBrowserTempRoot } = runtime;
  const runDir = path.join(runRoot, `showcase-${entry.id}-${process.pid}-${Date.now()}`);
  const frameRows = [];
  let frameDirectory = null;
  let failure = null;
  let frameSerial = 0;
  const reloadAndBoot = async () => {
    const boot = await bootNativeHtmlDocument(page, htmlPageUrl(entry, spec, origin, frameSerial++), entry, spec, localRequests, htmlPage);
    return boot;
  };
  const renderAt = async (time) => {
    const boot = await reloadAndBoot();
    const frame = await renderNativeHtmlFrame(page, entry, spec, time, frameSerial);
    return { boot, frame };
  };
  let repeatCheck = null;
  let lastBoot = firstBoot;
  try {
    if (isPreview || outputExt === ".png") {
      const times = args.samples ? args.samples.split(",").map((value) => Number(value.trim())) : [Number(args.time ?? 0)];
      if (!times.length || times.some((time) => !Number.isFinite(time) || time < 0 || time > spec.duration)) throw new Error(`--time/--samples values must be between 0 and ${spec.duration}`);
      const seen = new Map();
      for (const time of times) {
        const { boot, frame } = await renderAt(time);
        lastBoot = boot;
        if (frameRows.length === 0) await fs.writeFile(output, frame.png, { flag: "wx" });
        const prior = seen.get(time);
        const row = { timeSec: frame.timeSec, width: frame.width, height: frame.height, pixelHash: frame.pixelHash, pixelSha256: frame.pixelSha256, alphaPixels: frame.alphaPixels, nonBlackPixels: frame.nonBlackPixels, ...(frame.capsuleCallEvidence.length ? { capsuleCallEvidence: frame.capsuleCallEvidence } : {}) };
        if (prior) row.repeatComparison = { samePixelBytes: prior.pixelSha256 === frame.pixelSha256, previousPixelSha256: prior.pixelSha256 };
        else seen.set(time, { pixelSha256: frame.pixelSha256 });
        frameRows.push(row);
      }
    } else {
      const ffmpeg = args.ffmpeg || process.env.MOTION_FFMPEG || "ffmpeg";
      const fps = spec.fps || 30;
      const count = Math.round(spec.duration * fps);
      await fs.mkdir(runDir, { recursive: true });
      frameDirectory = runDir;
      for (let index = 0; index < count; index += 1) {
        const time = index / fps;
        const { boot, frame } = await renderAt(time);
        lastBoot = boot;
        await fs.writeFile(path.join(runDir, `frame-${String(index).padStart(6, "0")}.png`), frame.png, { flag: "wx" });
        if (index === 0 || index === count - 1 || index % Math.max(1, Math.floor(fps)) === 0) {
          frameRows.push({ frame: index, timeSec: frame.timeSec, width: frame.width, height: frame.height, pixelHash: frame.pixelHash, pixelSha256: frame.pixelSha256, alphaPixels: frame.alphaPixels, nonBlackPixels: frame.nonBlackPixels });
        }
      }
      const probeTime = entry.id === "motion-code-video-showcase-big-card" ? 0.5 : Math.min(spec.duration * 0.5, spec.duration - 1 / fps);
      const repeatedOne = await renderAt(probeTime);
      const repeatedTwo = await renderAt(probeTime);
      lastBoot = repeatedTwo.boot;
      repeatCheck = { timeSec: probeTime, samePixelBytes: repeatedOne.frame.pixelSha256 === repeatedTwo.frame.pixelSha256, firstPixelSha256: repeatedOne.frame.pixelSha256, repeatedPixelSha256: repeatedTwo.frame.pixelSha256, realmResetBetweenCaptures: true };
      const ff = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(runDir, "frame-%06d.png"), "-frames:v", String(count), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { encoding: "utf8" });
      if (ff.error) throw ff.error;
      if (ff.status !== 0) throw new Error(`FFmpeg failed (${ff.status}): ${ff.stderr || ff.stdout}`);
      await fs.rm(runDir, { recursive: true, force: true });
      frameDirectory = null;
    }
  } catch (error) { failure = error; }
  finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await cleanupBrowserTempRoot();
  }
  if (failure) {
    if (frameDirectory) failure.message += `\nIntermediate source frames retained at ${frameDirectory}`;
    throw failure;
  }

  const warningRows = consoleRows.filter((row) => row.type === "warning");
  const errorRows = consoleRows.filter((row) => row.type !== "warning");
  const outputBytes = await fs.readFile(output);
  const servedSourceFiles = [...servedFiles.values()];
  const servedPinMismatches = servedSourceFiles.filter((file) => !file.matchesPin && !file.derived);
  const expectedFontPaths = firstBoot.expectedFontAssets.map((font) => font.path);
  const sourceRoot = sourceById(catalog, entry.sourceId).vendorRoot;
  const closurePaths = (entry.closure || []).filter((filePath) => /\.(?:html|js)$/i.test(filePath)).map((filePath) => `/${filePath}`);
  const runtimePathsExpected = [...new Set([
    `/${entry.sourcePath}`,
    ...closurePaths,
    "/shared/fonts.css",
    ...expectedFontPaths,
  ])];
  const requestedSet = new Set(localRequests);
  const missingRuntimeRequests = runtimePathsExpected.filter((resource) => !requestedSet.has(resource));
  const derivedHtml = servedSourceFiles.find((file) => file.path === entry.sourcePath)?.derived || null;
  const manifest = {
    kind: "native-html-canvas-template-render-evidence",
    templateId: entry.id,
    renderer: entry.renderer,
    source: { id: source.id, repository: source.repository, commit: source.commit, sourcePath: entry.sourcePath, originalHtmlSha256: htmlPage.originalSha256, servedHtmlSha256: htmlPage.derivedSha256, htmlAdapter: derivedHtml },
    sourceRuntime: {
      contract: "original HTML page __ready/__bootError -> window.renderFrame(t)",
      boot: { initial: firstBoot, last: lastBoot },
      browserExecutable,
      capture: { mode: softwareCapture ? "software-swiftshader" : "hardware-gpu-diagnostic", software: softwareCapture, frequentReadback: !args.noFrequentReadback, stabilityClaim: softwareCapture && !args.noFrequentReadback ? "fresh-document-realm-per-frame-with-willReadFrequently" : "outside-default-repeatable-pixel-evidence-scope" },
      browserTempRoot,
      sourceVerification: runtimeSourceVerification,
      sourceRoot,
      runtimePathsExpected,
      runtimePathsRequested: [...requestedSet],
      missingRuntimeRequests,
      servedSourceFiles,
      adapterResponses: [...adapterResponses.entries()].map(([urlPath, item]) => ({ urlPath, ...item })),
      servedPinMismatches,
      algorithmsRewritten: false,
      renderRealm: "one fresh document/module realm per rendered frame; original source frame function called once at requested time",
    },
    spec: { path: specPath, sha256: sha256(Buffer.from(raw)), preparedReceipt: receiptPath, width: 1920, height: 1080, fps: spec.fps || 30, requestedDuration: spec.duration, frameCount: Math.round(spec.duration * (spec.fps || 30)), frameAligned: true, actualEncodedDuration: spec.duration },
    output: { path: output, sha256: sha256(outputBytes), bytes: outputBytes.length, mediaType: outputExt },
    renderedFrames: frameRows,
    deterministicRepeatCheck: repeatCheck,
    console: { warnings: warningRows, errors: errorRows },
    network: { mode: "loopback-only", blockedRequests: externalRequests, requestFailures },
    limitations: ["Pixel hashes establish the original renderer output under this browser, software capture, and local font closure at sampled times; they do not establish content accuracy, readability, audience comprehension, or aesthetic quality."],
  };
  if (manifestPath) await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  for (const row of warningRows) process.stderr.write(`SOURCE WARNING: ${row.text}\n`);
  for (const row of errorRows) process.stderr.write(`SOURCE ERROR: ${row.text}\n`);
  process.stdout.write(`OUTPUT ${output}\nTEMPLATE ${entry.id}\nBOOT ${lastBoot.ready ? "READY" : "FAILED"}\nPIXEL_HASHES ${frameRows.map((row) => row.pixelHash).join(",")}\n`);
  if (manifestPath) process.stdout.write(`MANIFEST ${manifestPath}\n`);
  if (externalRequests.length) throw new Error(`Unexpected external requests were blocked: ${externalRequests.join(", ")}`);
  if (missingRuntimeRequests.length) throw new Error(`Original HTML runtime resources were not requested: ${missingRuntimeRequests.join(", ")}`);
  if (servedPinMismatches.length) throw new Error(`Served original source/font bytes did not match the catalog pins: ${JSON.stringify(servedPinMismatches)}`);
  if (requestFailures.length) throw new Error(`Original HTML runtime had ${requestFailures.length} failed local request(s); inspect network.requestFailures in the manifest`);
  if (errorRows.length) throw new Error(`Original HTML runtime emitted ${errorRows.length} console error(s); inspect the preserved source console output`);
  if (repeatCheck && !repeatCheck.samePixelBytes) throw new Error(`Fresh-realm repeated capture at ${repeatCheck.timeSec}s changed pixel bytes; inspect deterministicRepeatCheck in ${manifestPath || output}`);
}

async function launchPage(spec, entry, specPath, options = {}) {
  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch (error) { throw new Error(`Local Playwright is required for native template rendering; it was not found in Node's module path. No dependency was installed. Original error: ${error.message}`); }
  const { source, vendorRoot } = sourceById(options.catalog, entry.sourceId);
  const sourceVerification = await verifySource(options.catalog, entry.sourceId);
  if (!sourceVerification.ok) throw new Error(`Pinned source verification failed; refusing to load changed/missing source: ${JSON.stringify(sourceVerification.issues)}`);
  const engineRoot = path.join(vendorRoot, "scripts", "engine");
  const assetsRoot = path.resolve(options.assetsRoot || path.dirname(path.resolve(specPath)));
  const browserTempRoot = options.browserTempRoot;
  if (!path.isAbsolute(browserTempRoot || "")) throw new Error("Native clip rendering requires an absolute browserTempRoot under the selected project cache; relative TMPDIR values are not used");
  const { server, origin, servedFiles } = await startLocalServer(engineRoot, assetsRoot);
  const externalRequests = [];
  const consoleRows = [];
  const localRequests = [];
  let browser;
  try {
    const mappedSpec = await mapSpecAssets(spec, assetsRoot, origin);
    const browserPath = options.browser || process.env.MOTION_BROWSER || process.env.CHROME_PATH;
    browser = await chromium.launch({ headless: true, args: options.software ? ["--disable-gpu", "--use-gl=swiftshader"] : [], ...(browserPath ? { executablePath: browserPath } : {}) });
    const page = await browser.newPage({ viewport: { width: spec.width || 1920, height: spec.height || 1080 }, deviceScaleFactor: 1 });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin === origin) localRequests.push(url.pathname);
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        externalRequests.push(route.request().url());
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type())) consoleRows.push({ type: message.type(), text: message.text() });
    });
    page.on("pageerror", (error) => consoleRows.push({ type: "pageerror", text: error.message }));
    await page.addInitScript((payload) => {
      if (payload.frequentReadback) {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, attributes) {
          if (this.id === "c" && type === "2d") attributes = { ...(attributes || {}), willReadFrequently: true };
          return getContext.call(this, type, attributes);
        };
      }
      window.CLIP_SPEC = payload.spec;
    }, { spec: mappedSpec, frequentReadback: options.frequentReadback !== false });
    await page.goto(`${origin}/engine/clip.html?render=1`, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => !!window.__ready || !!window.__bootFailed, null, { timeout: 120000 });
    const readiness = await page.evaluate(() => ({ ready: !!window.__ready, failed: window.__bootFailed || null, total: window.__total || null, fps: window.__fps || null, size: window.__size || null, grammar: window.CLIP_CTX?.spec?.grammar || null }));
    if (!readiness.ready || readiness.grammar !== entry.grammar) {
      const detail = readiness.failed || `unexpected runtime grammar ${readiness.grammar}`;
      const error = new Error(`Original ${entry.grammar} boot failed: ${detail}`);
      error.evidence = { sourceCommit: source.commit, readiness, console: consoleRows, externalRequests };
      throw error;
    }
    const html = await fs.readFile(path.join(engineRoot, "clip.html"), "utf8");
    const expectedPaths = ["/engine/clip.html", ...[...html.matchAll(/<script\s+src=["']([^"']+)["']/g)].map((match) => `/engine/${path.posix.join("scripts/engine", match[1]).replace(/^scripts\/engine\//, "")}`), `/engine/clips/${entry.grammar}.js`];
    const fontsJs = await fs.readFile(path.join(engineRoot, "lib", "fonts.js"), "utf8");
    expectedPaths.push(...[...fontsJs.matchAll(/url:'([^']+)'/g)].map((match) => `/engine/${path.posix.normalize(match[1])}`));
    const requested = new Set(localRequests);
    const missingRuntimeRequests = expectedPaths.filter((resource) => !requested.has(resource));
    return { browser, browserExecutable: browserPath || "playwright-managed-default", browserTempRoot, page, server, origin, source, sourceVerification, mappedSpec, readiness, consoleRows, externalRequests, localRequests, expectedPaths, missingRuntimeRequests, servedFiles };
  } catch (error) {
    if (browser) await browser.close();
    server.close();
    throw error;
  }
}

async function renderFrame(page, timeSec) {
  const result = await page.evaluate((time) => {
    const canvas = window.__canvas;
    if (typeof window.renderFrame !== "function") throw new Error("original renderFrame(t) is unavailable");
    window.renderFrame(time);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    let alphaPixels = 0;
    let nonBlackPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      hash = Math.imul(hash ^ pixels[index], 16777619);
      hash = Math.imul(hash ^ pixels[index + 1], 16777619);
      hash = Math.imul(hash ^ pixels[index + 2], 16777619);
      hash = Math.imul(hash ^ pixels[index + 3], 16777619);
      if (pixels[index + 3] > 0) alphaPixels += 1;
      if (pixels[index] > 8 || pixels[index + 1] > 8 || pixels[index + 2] > 8) nonBlackPixels += 1;
    }
    window.__templateLastCapture ||= new Map();
    const prior = window.__templateLastCapture.get(time);
    let repeatComparison = null;
    if (prior) {
      let differentPixels = 0, differingChannels = 0, maxChannelDelta = 0;
      for (let index = 0; index < pixels.length; index += 1) {
        const delta = Math.abs(pixels[index] - prior[index]);
        if (delta) { differingChannels += 1; maxChannelDelta = Math.max(maxChannelDelta, delta); }
        if ((index & 3) === 3 && (pixels[index] !== prior[index] || pixels[index - 1] !== prior[index - 1] || pixels[index - 2] !== prior[index - 2])) differentPixels += 1;
      }
      repeatComparison = { samePixelBytes: differingChannels === 0, differentPixels, differingChannels, maxChannelDelta };
    }
    window.__templateLastCapture.set(time, new Uint8ClampedArray(pixels));
    return { timeSec: time, width: canvas.width, height: canvas.height, pixelHash: (hash >>> 0).toString(16).padStart(8, "0"), alphaPixels, nonBlackPixels, repeatComparison, png: canvas.toDataURL("image/png").split(",")[1] };
  }, timeSec);
  return { ...result, png: Buffer.from(result.png, "base64") };
}

async function renderAction(args, catalog, entry) {
  if (args.software && args.hardware) throw new Error("--software and --hardware are mutually exclusive; software capture is the default");
  const softwareCapture = !args.hardware;
  requireNativeClip(entry, args.command);
  if (!args.spec || !args.output) throw new Error(`${args.command} requires --spec and --output`);
  const specPath = path.resolve(args.spec);
  const raw = await fs.readFile(specPath, "utf8");
  const spec = JSON.parse(raw);
  checkSpec(spec, entry);
  const receiptPath = `${specPath}.assets.json`;
  const receipt = await fs.readFile(receiptPath, "utf8").then((text) => JSON.parse(text)).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (receipt && receipt.templateId !== entry.id) throw new Error(`Prepared input receipt belongs to ${receipt.templateId}, not ${entry.id}`);
  if (receipt && receipt.specSha256 !== sha256(Buffer.from(raw))) throw new Error(`Prepared spec hash differs from ${receiptPath}; re-run prepare so its asset binding is current`);
  const assetsRoot = path.resolve(args.assetsRoot || receipt?.assetsRoot || path.dirname(specPath));
  const sourceVerification = await verifySource(catalog, entry.sourceId);
  if (!sourceVerification.ok) throw new Error(`Pinned source verification failed; refusing to render from changed/missing source: ${JSON.stringify(sourceVerification.issues)}`);
  const assetInputs = await inspectSpecAssets(spec, assetsRoot);
  if (receipt && JSON.stringify(assetInputs) !== JSON.stringify(receipt.assets)) {
    throw new Error("Prepared local asset hashes differ from the receipt; refusing to render stale or changed media");
  }
  const output = await requireNewOutput(args.output, [path.join(skillDir, "templates"), skillDir]);
  const manifestPath = args.manifest ? await requireNewOutput(args.manifest, [path.join(skillDir, "templates"), skillDir]) : null;
  if (manifestPath === output) throw new Error("--manifest and --output must be different paths");
  const isPreview = args.command === "preview";
  if (isPreview && path.extname(output).toLowerCase() !== ".png") throw new Error("preview output must be .png");
  if (!isPreview && ![".mp4", ".png"].includes(path.extname(output).toLowerCase())) throw new Error("render output must be .mp4 or .png");
  const runRoot = path.resolve(args.cacheDir || process.env.MOTION_TEMPLATE_CACHE_DIR || path.join(process.cwd(), ".cache", "tmp", "laohu-motion-template-render"));
  await fs.mkdir(runRoot, { recursive: true });
  await fs.mkdir(path.dirname(output), { recursive: true });
  const outputDevice = (await fs.stat(path.dirname(output))).dev;
  const cacheDevice = (await fs.stat(runRoot)).dev;
  if (outputDevice !== cacheDevice) throw new Error(`render cache and output must be on the same volume; cache=${runRoot}`);
  const runtime = await launchWithProjectBrowserTempRoot(runRoot, (browserTempRoot) => launchPage(spec, entry, specPath, {
    catalog, browser: args.browser, assetsRoot, software: softwareCapture,
    frequentReadback: !args.noFrequentReadback, browserTempRoot,
  }));
  const { browser, browserExecutable, page, server, source, sourceVerification: runtimeSourceVerification, readiness, consoleRows, externalRequests, localRequests, expectedPaths, missingRuntimeRequests, servedFiles } = runtime;
  const { browserTempRoot, cleanupBrowserTempRoot } = runtime;
  const runDir = path.join(runRoot, `render-${process.pid}-${Date.now()}`);
  let frameDirectory = null;
  const frameRows = [];
  let failure = null;
  try {
    await fs.mkdir(path.dirname(output), { recursive: true });
    if (isPreview || path.extname(output).toLowerCase() === ".png") {
      const times = args.samples ? args.samples.split(",").map((value) => Number(value.trim())) : [Number(args.time ?? 0)];
      if (!times.length || times.some((time) => !Number.isFinite(time) || time < 0 || time > spec.duration)) throw new Error(`--time/--samples values must be between 0 and ${spec.duration}`);
      for (const time of times) {
        const frame = await renderFrame(page, time);
        if (frameRows.length === 0) await fs.writeFile(output, frame.png, { flag: "wx" });
        frameRows.push({ timeSec: frame.timeSec, width: frame.width, height: frame.height, pixelHash: frame.pixelHash, alphaPixels: frame.alphaPixels, nonBlackPixels: frame.nonBlackPixels, repeatComparison: frame.repeatComparison });
      }
    } else {
      const ffmpeg = args.ffmpeg || process.env.MOTION_FFMPEG || "ffmpeg";
      const fps = spec.fps || 30;
      const width = spec.width || 1920;
      const height = spec.height || 1080;
      const count = Math.ceil(spec.duration * fps - 1e-9);
      await fs.mkdir(runDir, { recursive: true });
      frameDirectory = runDir;
      for (let index = 0; index < count; index += 1) {
        const time = index / fps;
        const frame = await renderFrame(page, time);
        await fs.writeFile(path.join(runDir, `frame-${String(index).padStart(6, "0")}.png`), frame.png, { flag: "wx" });
        if (index === 0 || index === count - 1 || index % Math.max(1, Math.floor(fps)) === 0) frameRows.push({ frame: index, timeSec: frame.timeSec, pixelHash: frame.pixelHash, alphaPixels: frame.alphaPixels, nonBlackPixels: frame.nonBlackPixels });
      }
      const ff = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(runDir, "frame-%06d.png"), "-frames:v", String(count), "-t", String(spec.duration), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { encoding: "utf8" });
      if (ff.error) throw ff.error;
      if (ff.status !== 0) throw new Error(`FFmpeg failed (${ff.status}): ${ff.stderr || ff.stdout}`);
      await fs.rm(runDir, { recursive: true, force: true });
      frameDirectory = null;
    }
  } catch (error) { failure = error; }
  finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await cleanupBrowserTempRoot();
  }
  if (failure) {
    if (frameDirectory) failure.message += `\nIntermediate source frames retained at ${frameDirectory}`;
    throw failure;
  }
  const warningRows = consoleRows.filter((row) => row.type === "warning");
  const errorRows = consoleRows.filter((row) => row.type !== "warning");
  const outputBytes = await fs.readFile(output);
  const pinnedByPath = new Map(source.files.map((file) => [`/engine/${file.path.replace(/^scripts\/engine\//, "")}`, file.sha256]));
  const servedSourceFiles = [...servedFiles.entries()].map(([urlPath, file]) => ({ urlPath, sha256: file.sha256, bytes: file.bytes, pinnedSha256: pinnedByPath.get(urlPath) || null, matchesPin: pinnedByPath.has(urlPath) && pinnedByPath.get(urlPath) === file.sha256 }));
  const servedPinMismatches = servedSourceFiles.filter((file) => !file.matchesPin);
  const manifest = {
    kind: "native-template-render-evidence",
    templateId: entry.id,
    grammar: entry.grammar,
    source: { id: source.id, repository: source.repository, commit: source.commit, sourcePath: entry.sourcePath },
    sourceRuntime: { contract: "CLIP_SPEC -> __ready/__bootFailed -> renderFrame(t)", readiness, browserExecutable, browserTempRoot, capture: { mode: softwareCapture ? "software-swiftshader" : "hardware-gpu-diagnostic", software: softwareCapture, frequentReadback: !args.noFrequentReadback, stabilityClaim: softwareCapture && !args.noFrequentReadback ? "matches-default-software-willReadFrequently-evidence-scope" : "outside-default-repeatable-pixel-evidence-scope" }, sourceVerification: runtimeSourceVerification, runtimePathsExpected: expectedPaths, runtimePathsRequested: [...new Set(localRequests)], missingRuntimeRequests, servedSourceFiles, servedPinMismatches, algorithmsRewritten: false },
    spec: { path: specPath, sha256: sha256(Buffer.from(raw)), width: spec.width || 1920, height: spec.height || 1080, fps: spec.fps || 30, duration: spec.duration },
    output: { path: output, sha256: sha256(outputBytes), bytes: outputBytes.length, mediaType: path.extname(output).toLowerCase() },
    renderedFrames: frameRows,
    console: { warnings: warningRows, errors: errorRows },
    network: { mode: "loopback-only", blockedRequests: externalRequests },
    limitations: ["Pixel hashes establish the source renderer's output at sampled times only; they do not establish content accuracy, readability, audience comprehension, or aesthetic quality."],
  };
  if (manifestPath) await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  for (const row of warningRows) process.stderr.write(`SOURCE WARNING: ${row.text}\n`);
  for (const row of errorRows) process.stderr.write(`SOURCE ERROR: ${row.text}\n`);
  process.stdout.write(`OUTPUT ${output}\nTEMPLATE ${entry.id}\nBOOT ${readiness.ready ? "READY" : "FAILED"}\nPIXEL_HASHES ${frameRows.map((row) => row.pixelHash).join(",")}\n`);
  if (manifestPath) process.stdout.write(`MANIFEST ${manifestPath}\n`);
  if (externalRequests.length) throw new Error(`Unexpected external requests were blocked: ${externalRequests.join(", ")}`);
  if (missingRuntimeRequests.length) throw new Error(`Original runtime resources were not requested: ${missingRuntimeRequests.join(", ")}`);
  if (servedPinMismatches.length) throw new Error(`Served source bytes did not match the catalog pins: ${JSON.stringify(servedPinMismatches)}`);
  if (errorRows.length) throw new Error(`Original runtime emitted ${errorRows.length} console error(s); inspect the preserved source console output`);
}

async function renderShotcraftAction(args, catalog, entry) {
  if (!args.spec || !args.output) throw new Error(`${args.command} requires --spec and --output`);
  if (args.command === 'preview' && path.extname(args.output).toLowerCase() !== '.png') throw new Error('Shotcraft preview output must be .png');
  if (args.command === 'render' && path.extname(args.output).toLowerCase() !== '.mp4') throw new Error('Shotcraft render output must be .mp4; use preview for a still frame');
  const repoRoot = path.resolve(skillDir, '../../..');
  const allowedCacheRoot = path.resolve(repoRoot, '.cache/tmp/video-shotcraft');
  const cacheDir = path.resolve(args.cacheDir || allowedCacheRoot);
  await fs.mkdir(allowedCacheRoot, {recursive:true});
  if (!isWithin(allowedCacheRoot, cacheDir)) throw new Error(`Shotcraft cache must stay below ${allowedCacheRoot}`);
  const sourceVerification = await verifySource(catalog, entry.sourceId);
  if (!sourceVerification.ok) throw new Error(`Pinned Shotcraft source verification failed: ${JSON.stringify(sourceVerification.issues)}`);
  const output = await requireNewOutput(args.output, [path.join(skillDir, 'templates'), skillDir]);
  const manifestPath = args.manifest ? await requireNewOutput(args.manifest, [path.join(skillDir, 'templates'), skillDir]) : `${output}.manifest.json`;
  if (!args.manifest) await requireNewOutput(manifestPath, [path.join(skillDir, 'templates'), skillDir]);
  if (manifestPath === output) throw new Error('--manifest and --output must be different paths');
  await fs.mkdir(path.dirname(output), {recursive:true});
  await fs.mkdir(path.dirname(manifestPath), {recursive:true});
  const adapter = await import('../templates/adapters/video-shotcraft-remotion.mjs');
  const result = await adapter.renderShotcraftTemplate({
    catalog, entry, specPath:path.resolve(args.spec), outputPath:output,
    outputKind:args.command === 'preview' ? 'still' : 'render',
    timeSec:args.time == null ? undefined : Number(args.time),
    assetsRoot:args.assetsRoot ? path.resolve(args.assetsRoot) : undefined,
    cacheDir, browser:args.browser ? path.resolve(args.browser) : undefined,
    ffmpeg:args.ffmpeg ? path.resolve(args.ffmpeg) : undefined, manifestPath,
  });
  process.stdout.write(`OUTPUT ${result.outputPath}\nTEMPLATE ${entry.id}\nMANIFEST ${result.manifestPath}\nFRAME_COUNT ${result.frameCount}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = await readCatalog();
  if (args.command === "list") {
    if (args.status && !["available", "conditional", "source-only"].includes(args.status)) throw new Error(`Unknown --status ${args.status}`);
    if (args.source && !catalog.sources.some((source) => source.id === args.source)) throw new Error(`Unknown source ${args.source}`);
    printList(catalog, args);
    return;
  }
  if (args.command === "verify") {
    if (args.source && !catalog.sources.some((source) => source.id === args.source)) throw new Error(`Unknown source ${args.source}`);
    const result = args.source ? await verifySource(catalog, args.source) : await verifyCatalog(catalog);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!["show", "prepare", "preview", "render"].includes(args.command)) throw new Error(`Unknown command ${args.command || "(none)"}`);
  if (args.filmBlueprint) {
    if (args.command !== "render") throw new Error("--film-blueprint is supported only with render");
    if (args.positionals.length) throw new Error("render --film-blueprint does not take a template ID positional argument");
    if (!args.output || !args.workRoot) throw new Error("render --film-blueprint requires --output and an absolute --work-root");
    const blueprintPath = path.resolve(args.filmBlueprint);
    const blueprint = JSON.parse(await fs.readFile(blueprintPath, 'utf8'));
    const adapter = blueprint.format === 'laohu.huashu-film-blueprint/2'
      ? await import('../templates/adapters/video-shotcraft-remotion.mjs')
      : blueprint.format === 'laohu.huashu-film-blueprint/1'
        ? await import('../templates/adapters/huashu-om.mjs')
        : (() => { throw new Error(`Unsupported film blueprint format ${blueprint.format}; /1 and /2 are the only registered film clocks`); })();
    const result = await adapter.renderFilm({
      blueprintPath,
      outputPath: path.resolve(args.output),
      workRoot: path.resolve(args.workRoot),
      manifestPath: path.resolve(args.manifest || (path.resolve(args.output) + ".manifest.json")),
      browser: args.browser ? path.resolve(args.browser) : undefined,
      ffmpeg: args.ffmpeg ? path.resolve(args.ffmpeg) : undefined,
      hardware: args.hardware === true,
    });
    process.stdout.write("OUTPUT " + result.outputPath + "\nMANIFEST " + result.manifestPath + "\nFRAME_COUNT " + result.frameCount + "\nDURATION " + result.durationSec + "\n");
    return;
  }
  const id = args.positionals[0];
  if (!id) throw new Error(`${args.command} requires a template ID`);
  const entry = templateById(catalog, id);
  if (args.command === "show") printShow(entry, args.json, catalog);
  else if (args.command === "prepare") await prepare(args, catalog, entry);
  else if (entry.renderer === "video-shotcraft-remotion") await renderShotcraftAction(args, catalog, entry);
  else if (entry.renderer === "native-om-template-source") await renderNativeOmAction(args, catalog, entry);
  else if (entry.renderer === "native-html-canvas-template") await renderNativeHtmlAction(args, catalog, entry);
  else await renderAction(args, catalog, entry);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n${usage()}\n`);
  if (error.evidence) process.stderr.write(`BOOT_EVIDENCE ${JSON.stringify(error.evidence)}\n`);
  process.exitCode = 1;
});
