import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { preflightFfmpeg } from "../scripts/laohu-ffmpeg-preflight.mjs";

const evalDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(evalDir, "..");
const repoRoot = path.resolve(skillDir, "../../..");
const cli = path.join(skillDir, "scripts", "templates.mjs");
const catalogPath = path.join(skillDir, "templates", "catalog.json");
const maintenanceLedgerPath = path.join(skillDir, "templates", "maintenance", "source-ledger.json");
const nodeRequire = createRequire(import.meta.url);
const MotionOps = nodeRequire(path.join(skillDir, "scripts", "motion-ops.js"));
const HuashuLocalEffects = nodeRequire(path.join(skillDir, "templates", "adapters", "laohu-effects.js"));

function invoke(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.timeout || 120_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...(options.env || {}) },
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, payload])));
  return Buffer.concat([length, name, payload, checksum]);
}

function tinyPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.from([
    0, 220, 90, 70, 255, 220, 90, 70, 255,
    0, 220, 90, 70, 255, 220, 90, 70, 255,
  ]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function browserExecutable() {
  const configured = process.env.MOTION_TEMPLATE_TEST_BROWSER || process.env.MOTION_BROWSER || process.env.CHROME_PATH;
  if (configured) return configured;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { /* candidate is not installed */ }
  }
  for (const command of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
    const result = spawnSync("which", [command], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  return null;
}

async function ffprobeExecutable() {
  const configured = process.env.MOTION_FFPROBE || process.env.LAOHU_FFPROBE || process.env.FFPROBE_PATH;
  const candidates = [
    configured,
    path.join(repoRoot, ".cache", "tmp", "asrcut-media-probe", "ffprobe"),
    path.join(repoRoot, ".cache", "tmp", "asrcut-media-probe", "ffprobe9.0.2.17", "17"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { /* candidate is not installed */ }
  }
  const result = spawnSync("which", ["ffprobe"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null;
}

function assertCliOk(result, label) {
  assert.equal(result.error, undefined, `${label}: ${result.error?.message || "process spawn failed"}`);
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

test("catalog routes callable native entries and guards source requirements", async (t) => {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const maintenanceLedger = JSON.parse(await fs.readFile(maintenanceLedgerPath, "utf8"));
  const verifiedTemplates = [...catalog.templates, ...maintenanceLedger.sourceOnlyTemplates];
  const verifiedSources = maintenanceLedger.sources;
  const verifiedTrees = maintenanceLedger.sourceTreeIndex;
  const verifiedReferences = maintenanceLedger.referenceCatalog.entries;
  const fyLocalEntries = catalog.templates.filter((entry) => entry.sourceId === "fy-code-animation");
  assert.equal(fyLocalEntries.length, 9, "the selected companion source contributes nine local Remotion entries");
  assert.ok(fyLocalEntries.every((entry) => entry.id.startsWith("laohu-") && entry.productionId.startsWith("laohu-")),
    "upstream identity stays in sourceId while public template and production IDs are locally named");
  const verify = invoke(["verify"]);
  assertCliOk(verify, "dynamic catalog verification");
  const verifiedCatalog = JSON.parse(verify.stdout);
  const coverage = verifiedCatalog.catalogCoverage;
  const countBy = (rows, key) => rows.reduce((counts, row) => {
    const value = row[key];
    const label = typeof value === "string" && value.trim() ? value : "(missing)";
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});
  assert.equal(coverage.format, "laohu.motion.catalog-computed-coverage/1");
  assert.deepEqual(coverage.templates.byAvailability, countBy(verifiedTemplates, "availability"));
  assert.deepEqual(coverage.templates.byRuntimeVerification, countBy(verifiedTemplates, "runtimeVerification"));
  assert.deepEqual(coverage.templates.sourceOnly, verifiedTemplates.filter((entry) => entry.availability === "source-only").map((entry) => ({
    id: entry.id, sourceId: entry.sourceId, sourcePath: entry.sourcePath || null, sourceGitBlob: entry.sourceGitBlob || null,
    gap: entry.limitations || (entry.parameters?.reason ? [entry.parameters.reason] : []), runtimeVerification: entry.runtimeVerification || null,
  })));
  assert.deepEqual(coverage.effects.byAvailability, countBy(catalog.effects, "availability"));
  assert.deepEqual(coverage.effects.byRuntimeVerification, countBy(catalog.effects, "runtimeVerification"));
  const sourceMethods = catalog.effectLibraries.flatMap((library) => library.functions || []);
  const effectMethodIds = new Set(catalog.effects.flatMap((effect) => effect.sourceFunctions || []));
  const uniqueMethodIds = [...new Set(sourceMethods.map((method) => method.id))];
  assert.equal(coverage.effectLibrariesAndMethods.methodIndexEntries, sourceMethods.length);
  assert.equal(coverage.effectLibrariesAndMethods.uniqueSourceMethodIds, uniqueMethodIds.length);
  assert.deepEqual(coverage.effectLibrariesAndMethods.methodsWithoutEffectRecord, uniqueMethodIds.filter((id) => !effectMethodIds.has(id)).sort());
  assert.deepEqual(coverage.sourceTreeResearchIndex, {
    treeEntries: verifiedTrees.length,
    declaredTrackedFiles: verifiedTrees.reduce((sum, tree) => sum + (Number.isInteger(tree.trackedFiles) ? tree.trackedFiles : 0), 0),
    exactFileRows: verifiedTrees.reduce((sum, tree) => sum + (tree.files?.length || 0), 0),
    rowsWithGitBlob: verifiedTrees.flatMap((tree) => tree.files || []).filter((row) => typeof row.gitBlob === "string" && row.gitBlob).length,
    treesWithFileRows: verifiedTrees.filter((tree) => Array.isArray(tree.files) && tree.files.length > 0).length,
    treesWithoutFileRows: verifiedTrees.filter((tree) => !Array.isArray(tree.files) || tree.files.length === 0).map((tree) => tree.id),
  });
  const pinnedFiles = verifiedSources.flatMap((source) => source.files || []);
  assert.deepEqual(coverage.pinnedSourceFiles, {
    rows: pinnedFiles.length,
    rowsWithPath: pinnedFiles.filter((file) => typeof file.path === "string" && file.path).length,
    rowsWithGitBlob: pinnedFiles.filter((file) => typeof file.gitBlob === "string" && file.gitBlob).length,
    rowsWithSha256: pinnedFiles.filter((file) => typeof file.sha256 === "string" && file.sha256).length,
    bySource: verifiedSources.map((source) => ({ id: source.id, repository: source.repository || null, commit: source.commit || null, status: source.status || null, sourceTreeIndexId: source.sourceTreeIndexId || null, fileRows: source.files?.length || 0 })),
  });
  assert.deepEqual(coverage.referenceIndex.sourceOnly, verifiedReferences.filter((entry) => entry.availability === "source-only").map((entry) => ({
    id: entry.id, ...(entry.templateId == null ? {} : { templateId: entry.templateId }), sourceId: entry.sourceId,
    sourceTreeIndexId: entry.sourceTreeIndexId || null, repository: entry.repository || null,
    sourcePath: entry.sourcePath || entry.path || null, reason: entry.reason || null,
    gap: entry.gap || entry.reason || entry.summary || entry.description || null,
  })));
  const expectedFontAssets = new Map();
  for (const entry of verifiedTemplates) for (const font of entry.adapter?.fontAssets || []) expectedFontAssets.set(`${font.sourceId}:${font.path}`, font);
  for (const effect of catalog.effects) for (const font of effect.fontDependencies || []) expectedFontAssets.set(`${effect.sourceRef.sourceId}:${font.path}`, font);
  const expectedFontDeclarations = verifiedTemplates.reduce((sum, entry) => sum + (entry.adapter?.fontAssets?.length || 0), 0)
    + catalog.effects.reduce((sum, effect) => sum + (effect.fontDependencies?.length || 0), 0);
  assert.equal(coverage.fontDependencies.declarations, expectedFontDeclarations);
  assert.equal(coverage.fontDependencies.uniqueSourceAssets, expectedFontAssets.size);
  assert.deepEqual(coverage.fontDependencies.assets.find((font) => font.path === "scripts/engine/lib/fonts/NotoSerifSC-sub.woff")?.effectIds, ["laohu-motion-network-pass"]);
  assert.equal(catalog.coverage, undefined, "stale static coverage counts must not remain a second source of truth");
  assert.equal(catalog.coveragePolicy.format, "laohu.motion.catalog-coverage-policy/1");
  const repeatFailures = catalog.effects.filter((effect) => /repeat-pixel check FAIL/.test(effect.runtimeVerification || ""));
  assert.ok(repeatFailures.length > 0, "the catalog must retain known repeated-seek failures");
  assert.deepEqual(coverage.effects.items.filter((effect) => /repeat-pixel check FAIL/.test(effect.runtimeVerification || ""))
    .map((effect) => [effect.id, effect.runtimeVerification]), repeatFailures.map((effect) => [effect.id, effect.runtimeVerification]));
  const list = invoke(["list", "--json"]);
  assertCliOk(list, "default list");
  const entries = JSON.parse(list.stdout);
  assert.equal(entries.length, 73, "the default production inventory excludes the retired duplicate Garden style methods while retaining registered templates, effects, and libraries");
  const styleConsumer = entries.find((entry) => entry.id === "laohu-style-code-canvas");
  assert.deepEqual(styleConsumer?.styleIds, ["F1", "F2"], "the F1/F2 consumer remains listed in the callable inventory");
  assert.equal(catalog.templates.find((entry) => entry.id === "laohu-style-code-canvas")?.sourceId, "laohu-style-library",
    "the catalog retains the independent style-library source identity");
  assert.equal(entries.filter((entry) => entry.itemType === "effect").length, 31, "the effect inventory includes 15 registered Garden recipe rows in addition to existing local effects and operations");
  assert.equal(entries.filter((entry) => entry.itemType === "method").length, 43, "the normal inventory exposes all indexed source methods for retrieval");
  assert.ok(entries.some((entry) => entry.id === "laohu-motion-network-pass" && entry.itemType === "effect"), "the callable inventory includes the verified source pixel-to-network action group");
  const effectLibraries = entries.filter((entry) => entry.itemType === "effect-library");
  assert.deepEqual(effectLibraries.map((entry) => entry.id).sort(), ["laohu-comic-scene-runtime", "laohu-motion-dg", "laohu-motion-toolkit", "laohu-motion-transitions"]);
  assert.equal(effectLibraries.find((entry) => entry.id === "laohu-motion-toolkit")?.availability, "preloadable-local-classic-scripts");
  assert.ok(entries.filter((entry) => entry.itemType === "template").every((entry) => ["native-clip", "native-html-canvas-template", "native-om-template-source", "video-shotcraft-remotion", "native-scene", "remotion-scene", "html-canvas-scene"].includes(entry.renderer)));
  assert.ok(entries.filter((entry) => entry.itemType === "effect").every((entry) => ["custom:laohu-motion-effects", "custom:laohu-motion-target", "custom:laohu-motion-operation", "custom:laohu-motion-transition", "custom:laohu-network-pass", "custom:laohu-motion-recipes", "custom:laohu-motion-postprocess"].includes(entry.renderer)));
  assert.equal(entries.find((entry) => entry.id === "laohu-motion-follow-box")?.operationId, "laohu.motion-follow-box/1");
  const canonicalLibrary = invoke(["show", "laohu-motion-dg", "--json"]);
  const legacyLibrary = invoke(["show", "huashu-art-motion-dg", "--json"]);
  assertCliOk(canonicalLibrary, "canonical effect library show");
  assertCliOk(legacyLibrary, "legacy effect library alias show");
  assert.deepEqual(JSON.parse(legacyLibrary.stdout), JSON.parse(canonicalLibrary.stdout), "the legacy library alias resolves to the canonical local ID");
  const canonicalShow = invoke(["show", "laohu-motion-y3-whiteboard", "--json"]);
  const legacyShow = invoke(["show", "huashu-y3-whiteboard", "--json"]);
  assertCliOk(canonicalShow, "canonical show");
  assertCliOk(legacyShow, "legacy alias show");
  assert.deepEqual(JSON.parse(legacyShow.stdout), JSON.parse(canonicalShow.stdout), "show resolves the old template ID to the exact canonical catalog record");
  const focusQuery = invoke(["list", "--type", "effect", "--intent", "focus", "--json"]);
  assertCliOk(focusQuery, "stable intent-tag query");
  assert.deepEqual(JSON.parse(focusQuery.stdout).map((entry) => entry.id).sort(), ["laohu-motion-dg-circumscribe", "laohu-motion-dg-indicate-frame-pulse"]);
  const researchList = invoke(["list", "--all", "--json"]);
  assertCliOk(researchList, "research-inclusive list");
  const researchEntries = JSON.parse(researchList.stdout);
  assert.equal(researchEntries.find((entry) => entry.id === "laohu-motion-y2-vox")?.availability, "available");
  for (const id of ["motion-code-video-showcase-big-card", "motion-code-video-showcase-segment"]) {
    const entry = researchEntries.find((item) => item.id === id);
    assert.equal(entry?.sourceId, "motion-code-video-showcase");
    assert.equal(entry?.availability, "available");
    assert.equal(entry?.renderer, "native-html-canvas-template");
  }
  for (const id of ["laohu-motion-finance-chart", "laohu-motion-kinetic-type"]) {
    const entry = researchEntries.find((item) => item.id === id);
    assert.equal(entry?.sourceId, "huashu-motion");
    assert.equal(entry?.availability, "conditional");
    assert.equal(entry?.renderer, "native-om-template-source");
    assert.equal(entry?.runtimeVerification, "native-om-cli-chrome-preview-render-ffprobe-verified");
    assert.ok(entry?.nativeInterface?.runtimeSource.includes("cli/om.js"));
  }
  for (const id of ["laohu-motion-whiteboard", "laohu-motion-kurzgesagt", "laohu-motion-math-3b1b"]) {
    const entry = researchEntries.find((item) => item.id === id);
    assert.equal(entry?.sourceId, "huashu-motion");
    assert.equal(entry?.availability, "conditional");
    assert.equal(entry?.renderer, "native-om-template-source");
    assert.match(entry?.sourcePath || "", /^templates\/(whiteboard|kurzgesagt|math-3b1b)\/index\.html$/);
    assert.ok(entry?.renderPreconditions?.length >= 3, `${id} declares its original source/runtime/duration inputs`);
    assert.ok(entry?.parameters?.sourceControls?.some((control) => control.id === "duration"), `${id} exposes its original duration control`);
  }

  const parameterAudit = new Map(catalog.templates.filter((entry) => entry.grammar).map((entry) => [entry.id, entry]));
  for (const id of ["laohu-motion-t1-3b1b", "laohu-motion-t3-finance-chart", "laohu-motion-y3-whiteboard", "laohu-motion-y4-storytime", "laohu-motion-y5-kinetic-type"]) {
    const entry = parameterAudit.get(id);
    assert.ok(entry.sourceSchema.specData.includes("camera"), `${id} keeps the original schema declaration`);
    assert.ok(!entry.parameters.specData.includes("camera"), `${id} does not present camera as a consumed parameter`);
    assert.ok(!entry.trueParameterization.specData.includes("camera"), `${id} actual parameter view excludes camera`);
    assert.equal(entry.parameters.declaredOnlyIgnoredSpecData[0]?.path, "data.camera");
  }
  for (const id of ["laohu-motion-t2-keynote-ui", "laohu-motion-y1-kurzgesagt", "laohu-motion-y2-vox"]) {
    assert.ok(parameterAudit.get(id).parameters.specData.includes("camera"), `${id} source actually consumes camera`);
  }
  for (const entry of parameterAudit.values()) {
    assert.match(entry.parameters.cueCommonScope, /shared runtime transport envelope/i);
    assert.match(entry.trueParameterization.cueFieldsScope, /not every field is an active visual control/i);
  }

  const sourceOnly = maintenanceLedger.sourceOnlyTemplates[0];
  assert.ok(sourceOnly, "maintenance ledger must retain source-only rows");
  const blocked = invoke(["prepare", sourceOnly.id, "--research", "--input", "missing.json", "--output", "out.json"]);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /source-only|only supports catalog entries/i);

  const t3 = verifiedTemplates.find((entry) => entry.id === "laohu-motion-t3-finance-chart");
  assert.ok(t3?.sourceSchema?.specNeeds?.includes("data.series"));
  assert.ok(t3.parameters.specData.includes("xAxis"), "t3 exposes its source-consumed xAxis field");
  assert.ok(t3.trueParameterization.specData.includes("xAxis"), "t3 actual parameter view exposes xAxis");
  for (const [id, expected] of [
    ["motiongit-385712-unit-a", "sc/wall2 frames"],
    ["motiongit-385712-unit-f", "preconfigured d* sequences"],
    ["motiongit-385712-unit-s11", "d596 preview frames"],
  ]) {
    assert.ok(verifiedTemplates.find((entry) => entry.id === id)?.assetNotes?.includes(expected), `${id} retains its source-specific media boundary`);
  }
  const cacheRoot = path.join(repoRoot, ".cache", "tmp");
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "laohu-motion-template-invalid-t3-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const t3Input = path.join(runRoot, "missing-series.json");
  await fs.writeFile(t3Input, `${JSON.stringify({ grammar: "t3_finance_chart", duration: 2, cues: [] })}\n`);
  const t3Result = invoke(["prepare", t3.id, "--input", t3Input, "--output", `${t3Input}.prepared.json`]);
  assert.notEqual(t3Result.status, 0);
  assert.match(t3Result.stderr, /non-empty data\.series/);

  const fractionalInput = path.join(runRoot, "fractional-frame-duration.json");
  await fs.writeFile(fractionalInput, `${JSON.stringify({ grammar: "t1_3b1b", duration: 2.01, fps: 30, cues: [] })}\n`);
  const fractionalResult = invoke(["prepare", "huashu-t1-3b1b", "--input", fractionalInput, "--output", `${fractionalInput}.prepared.json`]);
  assert.notEqual(fractionalResult.status, 0);
  assert.match(fractionalResult.stderr, /not a whole number.*frame-aligned duration/s);

  const alignedInput = path.join(runRoot, "aligned-frame-duration.json");
  await fs.writeFile(alignedInput, `${JSON.stringify({ grammar: "t1_3b1b", duration: 2, fps: 30, cues: [] })}\n`);
  const alignedResult = invoke(["prepare", "huashu-t1-3b1b", "--input", alignedInput, "--output", `${alignedInput}.prepared.json`]);
  assertCliOk(alignedResult, "frame-aligned duration prepare");
});

test("fy-code-animation source comparison checks selected files and exact documentation exclusions", async (t) => {
  const sourceRoot = path.resolve(process.env.MOTION_FY_SOURCE_ROOT || path.join(
    repoRoot, ".cache", "restore", "animation-foundation-20261111-01", "sources", "animation-foundation", "fy-code-animation",
  ));
  try { await fs.access(path.join(sourceRoot, "implementations", "audio-sync", "beat-grid.mjs")); }
  catch { t.skip("pinned fy-code-animation snapshot is not present in the external project cache"); return; }

  const tempRoot = path.join(repoRoot, ".cache", "tmp");
  await fs.mkdir(tempRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(tempRoot, "fy-source-snapshot-compare-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const copiedRoot = path.join(runRoot, "snapshot");
  await fs.mkdir(copiedRoot, { recursive: true });
  await fs.cp(path.join(sourceRoot, "implementations"), path.join(copiedRoot, "implementations"), { recursive: true });
  await fs.mkdir(path.join(copiedRoot, "scripts"), { recursive: true });
  await fs.copyFile(path.join(sourceRoot, "scripts", "glyph_outline.py"), path.join(copiedRoot, "scripts", "glyph_outline.py"));

  const compare = () => invoke([
    "verify", "--source", "fy-code-animation", "--source-root", copiedRoot, "--json",
  ]);
  const clean = compare();
  assertCliOk(clean, "pinned fy-code-animation source comparison");
  const cleanResult = JSON.parse(clean.stdout);
  assert.equal(cleanResult.checkedFiles, 54, "42 selected implementation modules, 11 explicit implementation-tree documentation/bootstrap rows, and 1 external helper are hash checked");
  assert.equal(cleanResult.checkedGitBlobs, 54);
  assert.deepEqual(cleanResult.sourceSnapshotComparison, {
    status: "COMPARED", sourceRootRequired: false, comparedSourceCount: 1, comparedFiles: 54,
  });

  const excludedReadme = path.join(copiedRoot, "implementations", "audio-sync", "README.md");
  const originalReadme = await fs.readFile(excludedReadme);
  await fs.appendFile(excludedReadme, "\nchanged after pin\n");
  const changedExcluded = compare();
  assert.equal(changedExcluded.status, 1);
  const changedExcludedResult = JSON.parse(changedExcluded.stdout);
  assert.ok(changedExcludedResult.issues.some((issue) => issue.path === "audio-sync/README.md" && /sha256 mismatch/.test(issue.error)));
  await fs.writeFile(excludedReadme, originalReadme);

  const externalHelper = path.join(copiedRoot, "scripts", "glyph_outline.py");
  const originalHelper = await fs.readFile(externalHelper);
  await fs.appendFile(externalHelper, "\nchanged after pin\n");
  const changedHelper = compare();
  assert.equal(changedHelper.status, 1);
  const changedHelperResult = JSON.parse(changedHelper.stdout);
  assert.ok(changedHelperResult.issues.some((issue) => issue.path === "scripts/glyph_outline.py" && /external source snapshot sha256 mismatch/.test(issue.error)));
  await fs.writeFile(externalHelper, originalHelper);

  await fs.writeFile(path.join(copiedRoot, "implementations", "unindexed-extra.ts"), "export {};\n");
  const extraFile = compare();
  assert.equal(extraFile.status, 1);
  const extraFileResult = JSON.parse(extraFile.stdout);
  assert.ok(extraFileResult.issues.some((issue) => issue.path === "unindexed-extra.ts" && /not listed as a pinned source file or an explicit snapshot exclusion/.test(issue.error)));
});

test("native render entrypoints reject an FFmpeg loader failure before starting source rendering", async (t) => {
  if (process.platform === "win32") {
    t.skip("uses a small POSIX executable fixture to simulate a dynamic-loader failure");
    return;
  }
  const runRoot = await fs.mkdtemp(path.join(repoRoot, ".cache", "tmp", "motion-ffmpeg-preflight-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const brokenFfmpeg = path.join(runRoot, "ffmpeg-loader-failure");
  await fs.writeFile(brokenFfmpeg, "#!/bin/sh\nprintf '%s\\n' 'dyld: Library not loaded: fixture/libx265.216.dylib' >&2\nexit 127\n");
  await fs.chmod(brokenFfmpeg, 0o755);
  const expectedError = /FFmpeg preflight failed before source rendering[\s\S]*Library not loaded: fixture\/libx265\.216\.dylib/;
  const env = { TMPDIR: path.join(runRoot, "tmp") };
  await fs.mkdir(env.TMPDIR, { recursive: true });

  const directWorkRoot = path.join(runRoot, "direct-work");
  const direct = invoke([
    "render", "laohu-motion-finance-chart", "--spec", path.join(runRoot, "not-read-before-preflight.json"),
    "--output", path.join(directWorkRoot, "direct.mp4"), "--work-root", directWorkRoot, "--ffmpeg", brokenFfmpeg,
  ], { env, timeout: 15_000 });
  assert.equal(direct.status, 1, direct.stderr || direct.stdout);
  assert.match(direct.stderr, expectedError);
  assert.equal(await fs.stat(directWorkRoot).then(() => true).catch(() => false), false,
    "single-template native render must reject the loader failure before preparing an OM project or launching capture");

  const filmWorkRoot = path.join(runRoot, "film-work");
  const blueprintPath = path.join(runRoot, "film-blueprint.json");
  await fs.writeFile(blueprintPath, JSON.stringify({
    format: "laohu.huashu-film-blueprint/1",
    width: 1920, height: 1080, fps: 30,
    clock: { kind: "film-global", durationSec: 2 },
    segments: [{
      id: "native-om", renderer: "laohu-native-om-template", templateId: "laohu-motion-finance-chart",
      variables: { duration: 2, title: "preflight", series: JSON.stringify([{ label: "A", value: 1 }]) },
      startSec: 0, endSec: 2,
    }],
  }, null, 2) + "\n");
  const runnableFfmpeg = path.join(runRoot, "ffmpeg-valid");
  await fs.writeFile(runnableFfmpeg, "#!/bin/sh\nprintf '%s\\n' 'ffmpeg version 7.1.5 fixture'\n");
  await fs.chmod(runnableFfmpeg, 0o755);
  assert.deepEqual(preflightFfmpeg(runnableFfmpeg, { env }), {
    executable: runnableFfmpeg,
    version: "ffmpeg version 7.1.5 fixture",
  });
  const film = invoke([
    "render", "--film-blueprint", blueprintPath, "--output", path.join(runRoot, "film.mp4"),
    "--work-root", filmWorkRoot, "--manifest", path.join(runRoot, "film-manifest.json"), "--ffmpeg", brokenFfmpeg,
  ], { env, timeout: 15_000 });
  assert.equal(film.status, 1, film.stderr || film.stdout);
  assert.match(film.stderr, expectedError);
  const workEntries = await fs.readdir(filmWorkRoot).catch(() => []);
  assert.equal(workEntries.some((name) => name.startsWith("huashu-om-")), false,
    "Film/1 must reject the loader failure before the original OM source segment begins rendering");
});

test("raw native clip preparation rejects inactive controls before a successful-looking render", async (t) => {
  const root = path.join(repoRoot, ".cache", "tmp");
  await fs.mkdir(root, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(root, "native-cue-consumers-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  async function prepare(name, id, spec) {
    const input = path.join(runRoot, name + ".json");
    await fs.writeFile(input, JSON.stringify(spec));
    return invoke(["prepare", id, "--input", input, "--output", input + ".prepared.json"]);
  }
  const base = { grammar: "y1_kurzgesagt", duration: 8, cues: [{ kind: "point", at: 1, text: "node" }] };
  const misplaced = await prepare("misplaced", "laohu-motion-y1-kurzgesagt", {
    ...base, cues: [...base.cues, { kind: "enter", at: 3, data: { index: 0, dur: 4 } }],
  });
  assert.notEqual(misplaced.status, 0);
  assert.match(misplaced.stderr, /data\.dur is not consumed.*put dur beside/);
  const valid = await prepare("duration", "laohu-motion-y1-kurzgesagt", {
    ...base, cues: [...base.cues, { kind: "enter", at: 3, dur: 4, data: { index: 0 } }],
  });
  assertCliOk(valid, "source-consumed top-level duration");
  const pace = await prepare("pace", "laohu-motion-y1-kurzgesagt", { ...base, pace: 2 });
  assert.notEqual(pace.status, 0);
  assert.match(pace.stderr, /native-clip does not consume pace/);
  const word = await prepare("word", "laohu-motion-y1-kurzgesagt", {
    ...base, cues: [{ ...base.cues[0], word: "node" }],
  });
  assert.notEqual(word.status, 0);
  assert.match(word.stderr, /word is not consumed by native-clip/);
  const camera = await prepare("ignored-camera", "laohu-motion-y5-kinetic-type", {
    grammar: "y5_kinetic_type", duration: 8, data: { camera: "snap" }, cues: [],
  });
  assert.notEqual(camera.status, 0);
  assert.match(camera.stderr, /does not consume data\.camera/);
  const missing = await prepare("missing-text", "laohu-motion-y1-kurzgesagt", {
    ...base, cues: [{ kind: "point", at: 1 }],
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /point requires text/);
  const tokens = await prepare("alternative-tokens", "laohu-motion-t1-3b1b", {
    grammar: "t1_3b1b", duration: 8, cues: [{ kind: "equation", at: 1, data: { tokens: ["x", "=", "1"] } }],
  });
  assertCliOk(tokens, "source alternative required field");
  const zero = await prepare("zero-number", "laohu-motion-t2-keynote-ui", {
    grammar: "t2_keynote_ui", duration: 8, cues: [{ kind: "number", at: 1, data: { value: 0 } }],
  });
  assertCliOk(zero, "zero is a provided source number");
});

test("local-effect catalog, validator, and adapter expose one consumed parameter contract", async () => {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  assert.equal(catalog.schemaVersion, 2);
  const huashuEffects = catalog.effects.filter((effect) => ["custom:laohu-motion-effects", "custom:laohu-motion-target"].includes(effect.renderer));
  assert.equal(huashuEffects.length, 5);
  assert.deepEqual(Object.keys(HuashuLocalEffects.DEFINITION).sort(), huashuEffects.map((effect) => effect.id).sort());
  for (const effect of huashuEffects) {
    assert.ok(effect.intents.length > 0 && effect.intents.every((tag) => /^[a-z0-9][a-z0-9-]*$/.test(tag)), `${effect.id} exposes stable exact-query intent tags`);
    const contract = MotionOps.localEffectContracts[effect.id];
    assert.ok(contract, `${effect.id} has a MotionOps contract`);
    const consumedParameters = effect.parameters.filter((parameter) => parameter.name.startsWith("parameters."))
      .map((parameter) => parameter.name.slice("parameters.".length)).sort();
    assert.deepEqual(consumedParameters, [...contract.parameters].sort(), `${effect.id} catalog fields match validator fields exactly`);
    const geometryNames = effect.parameters.filter((parameter) => parameter.name.startsWith("geometry.")).map((parameter) => parameter.name);
    const expectedGeometry = contract.geometry === "brace" ? ["geometry.x", "geometry.y0/y1"] : [`geometry.${contract.geometry}`];
    assert.deepEqual(geometryNames.sort(), expectedGeometry.sort(), `${effect.id} catalog geometry matches the validator`);
    assert.ok(effect.sourceFunctions.includes(HuashuLocalEffects.DEFINITION[effect.id].sourceFunction), `${effect.id} names the adapter's original source function`);
  }
  const pulse = catalog.effects.find((effect) => effect.id === "laohu-motion-dg-indicate-frame-pulse");
  assert.ok(pulse.parameters.some((parameter) => parameter.name === "parameters.scale"));
  assert.ok(!catalog.effects.find((effect) => effect.id === "laohu-motion-dg-circumscribe").parameters.some((parameter) => parameter.name === "parameters.scale"));

  const followBox = catalog.effects.find((effect) => effect.id === "laohu-motion-follow-box");
  assert.equal(followBox.operationId, "laohu.motion-follow-box/1");
  assert.equal(followBox.renderer, MotionOps.MOTION_OPERATION_RENDERER);
  assert.ok(followBox.parameters.some((parameter) => parameter.name === "nativeParameters.fromLineWidthPx"));
  assert.ok(followBox.parameters.some((parameter) => parameter.name === "nativeParameters.toLineWidthPx"));
  assert.ok(MotionOps.validateMotionOperations, "the operation is registered by the local Motion consumer");

  const sharedPhase = { id: "emphasis-window", startSec: 0.2, durationSec: 0.6, timeBasis: "scene-local", curve: "linear" };
  const validInstance = {
    id: "outline-instance",
    effectId: "huashu-dg-circumscribe",
    targetId: "named-target",
    phaseId: sharedPhase.id,
    geometry: { rect: { x: 20, y: 25, width: 40, height: 30 } },
    parameters: { color: "#ff0000", lineWidth: 3, timeWidth: 0.3 },
  };
  const scene = {
    duration: 1,
    objects: [
      { id: "named-target", type: "rect", space: "screen", x: 20, y: 25, width: 40, height: 30, fill: "#222222" },
      { id: "local-effects", type: "custom:huashu-local-effects", space: "screen", data: {
        phases: [sharedPhase],
        audioEvents: [{ id: "outline-sound", phaseId: sharedPhase.id, phaseOffsetSec: 0.1 }],
        motionEffects: [validInstance],
      } },
    ],
  };
  const [validated] = MotionOps.validateLocalEffects(scene);
  assert.equal(validated.phase, sharedPhase, "the visual effect consumes the shared phase record by identity");
  const audioEvent = MotionOps.findSceneAudioEvents(scene).get("outline-sound");
  assert.equal(audioEvent.phaseId, validated.phaseId);
  assert.ok(Math.abs(audioEvent.timeSec - 0.3) < 1e-12);
  assert.equal(audioEvent.timeBasis, "scene-local");

  const invalidScale = structuredClone(scene);
  invalidScale.objects[1].data.motionEffects[0].parameters.scale = 1.2;
  assert.throws(() => MotionOps.validateLocalEffects(invalidScale), /parameters\.scale is not consumed by laohu-motion-dg-circumscribe/);
  const unboundTarget = structuredClone(scene);
  unboundTarget.objects[1].data.motionEffects[0].targetId = "missing-target";
  assert.throws(() => MotionOps.validateLocalEffects(unboundTarget), /does not identify a scene object/);

  const directTargetPhase = { id: "target-reveal", startSec: 0.2, endSec: 1, timeBasis: "scene-local" };
  const directTargetScene = {
    duration: 1,
    objects: [
      { id: "direct-target", type: "custom:huashu-local-target", space: "screen", data: {
        primitive: "rect", geometry: { x: 8, y: 12, width: 20, height: 16 }, fill: "#ff0000",
      } },
      { id: "local-effects", type: "custom:huashu-local-effects", space: "screen", data: {
        phases: [directTargetPhase],
        motionEffects: [{
          id: "direct-reveal", effectId: "huashu-mo-staggered-target-reveal", targetId: "direct-target", phaseId: directTargetPhase.id,
          geometry: { rect: { x: 8, y: 12, width: 20, height: 16 } }, parameters: {},
          stagger: { groupId: "one-target", index: 0, count: 1, ratio: 0.2 },
        }],
      } },
    ],
  };
  assert.equal(MotionOps.validateLocalEffects(directTargetScene)[0].effectId, "laohu-motion-mo-staggered-target-reveal");
  const missingStagger = structuredClone(directTargetScene);
  delete missingStagger.objects[1].data.motionEffects[0].stagger;
  assert.throws(() => MotionOps.validateLocalEffects(missingStagger), /stagger is required/);
});

test("native y2 accepts authored text cues without image assets", async (t) => {
  const cacheRoot = path.join(repoRoot, ".cache", "tmp");
  await fs.mkdir(cacheRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(cacheRoot, "laohu-motion-template-text-only-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, "text", "scene.json");
  const prepared = path.join(root, "prepared-text", "scene.json");
  const spec = {
    grammar: "y2_vox",
    duration: 4,
    fps: 24,
    width: 640,
    height: 360,
    cues: [
      { at: 0.2, kind: "title", text: "从数据中学习" },
      { at: 1.4, kind: "point", text: "判断与答案的差距会触发参数调整" },
    ],
  };
  await fs.mkdir(path.dirname(input), { recursive: true });
  // This test deliberately avoids an image requirement; all files stay in project cache.
  await fs.writeFile(input, `${JSON.stringify(spec, null, 2)}\n`);
  const result = invoke(["prepare", "huashu-y2-vox", "--input", input, "--output", prepared]);
  assertCliOk(result, "text-only y2 prepare");
});

test("explicit local Chrome uses stable software capture and preserves cross-directory image inputs", async (t) => {
  const browser = await browserExecutable();
  let playwrightAvailable = false;
  try { nodeRequire.resolve("playwright"); playwrightAvailable = true; } catch { /* live render needs local Playwright */ }
  if (!browser || !playwrightAvailable) {
    t.skip("requires a local Chrome/Chromium executable and an already-installed Playwright; no dependency is installed by this test");
    return;
  }

  const cacheRoot = path.join(repoRoot, ".cache", "tmp");
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "laohu-motion-template-live-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const sourceRoot = path.join(runRoot, "source");
  const assetsRoot = path.join(runRoot, "local-assets");
  const preparedRoot = path.join(runRoot, "prepared-elsewhere");
  const outputRoot = path.join(runRoot, "outputs");
  await Promise.all([sourceRoot, assetsRoot, preparedRoot, outputRoot].map((directory) => fs.mkdir(directory, { recursive: true })));

  const sourcePath = path.join(sourceRoot, "scene.json");
  const preparedPath = path.join(preparedRoot, "scene.json");
  const outputPath = path.join(outputRoot, "y2.png");
  const manifestPath = path.join(outputRoot, "y2.manifest.json");
  const browserCache = path.join(runRoot, "y2-browser-cache");
  await fs.writeFile(path.join(assetsRoot, "fixture.png"), tinyPng());
  const spec = {
    grammar: "y2_vox",
    duration: 4,
    fps: 24,
    width: 640,
    height: 360,
    cues: [
      { at: 0.2, kind: "title", text: "图像样本进入训练" },
      { at: 0.8, kind: "image", text: "本地样本", image: "fixture.png" },
      { at: 2.0, kind: "point", text: "模型给出判断" },
    ],
  };
  await fs.writeFile(sourcePath, `${JSON.stringify(spec, null, 2)}\n`);

  const prepared = invoke(["prepare", "huashu-y2-vox", "--input", sourcePath, "--output", preparedPath, "--assets-root", assetsRoot]);
  assertCliOk(prepared, "cross-directory image prepare");
  const receipt = JSON.parse(await fs.readFile(`${preparedPath}.assets.json`, "utf8"));
  assert.equal(receipt.assetsRoot, assetsRoot);
  assert.equal(receipt.assets[0].path, "fixture.png");

  const relativeTmp = ".cache/tmp/motion-template-relative-native-clip";
  const preview = invoke(["preview", "huashu-y2-vox", "--spec", preparedPath, "--output", outputPath, "--samples", "1.2,0.4,1.2", "--browser", browser, "--cache-dir", browserCache, "--manifest", manifestPath], {
    env: { TMPDIR: relativeTmp, TMP: relativeTmp, TEMP: relativeTmp },
  });
  assertCliOk(preview, "explicit-browser y2 preview");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.sourceRuntime.readiness.ready, true);
  assert.equal(manifest.sourceRuntime.browserExecutable, browser);
  assert.ok(path.isAbsolute(manifest.sourceRuntime.browserTempRoot));
  assert.ok(manifest.sourceRuntime.browserTempRoot.startsWith(`${browserCache}${path.sep}`), "native clip Playwright temp files must use the absolute selected project cache even when inherited TMPDIR is relative");
  assert.equal(manifest.sourceRuntime.capture.mode, "software-swiftshader");
  assert.equal(manifest.sourceRuntime.capture.frequentReadback, true);
  assert.ok(manifest.sourceRuntime.runtimePathsRequested.some((resource) => resource.startsWith("/input/fixture.png")));
  assert.deepEqual(manifest.sourceRuntime.missingRuntimeRequests, []);
  assert.deepEqual(manifest.console.errors, []);
  assert.deepEqual(manifest.network.blockedRequests, []);
  assert.equal(manifest.renderedFrames[0].pixelHash, manifest.renderedFrames[2].pixelHash);
  assert.deepEqual(manifest.renderedFrames[2].repeatComparison, {
    samePixelBytes: true,
    differentPixels: 0,
    differingChannels: 0,
    maxChannelDelta: 0,
  });

  const textOnlySpecs = [
    { grammar: "y2_vox", duration: 4, fps: 24, width: 640, height: 360, cues: [{ at: 0.2, kind: "title", text: "从数据中学习" }, { at: 1.5, kind: "point", text: "模型作出判断" }] },
    { grammar: "y2_vox", duration: 4, fps: 24, width: 640, height: 360, cues: [{ at: 0.2, kind: "title", text: "机器怎样学习" }, { at: 1.5, kind: "point", text: "模型作出判断" }] },
  ];
  const textHashes = [];
  for (let index = 0; index < textOnlySpecs.length; index += 1) {
    const textInput = path.join(sourceRoot, `text-only-${index}.json`);
    const textPrepared = path.join(preparedRoot, `text-only-${index}.json`);
    const textOutput = path.join(outputRoot, `text-only-${index}.png`);
    const textManifest = path.join(outputRoot, `text-only-${index}.manifest.json`);
    await fs.writeFile(textInput, `${JSON.stringify(textOnlySpecs[index], null, 2)}\n`);
    const textPrepare = invoke(["prepare", "huashu-y2-vox", "--input", textInput, "--output", textPrepared]);
    assertCliOk(textPrepare, `text-only variant ${index} prepare`);
    const textPreview = invoke(["preview", "huashu-y2-vox", "--spec", textPrepared, "--output", textOutput, "--time", "1.2", "--browser", browser, "--manifest", textManifest]);
    assertCliOk(textPreview, `text-only variant ${index} preview`);
    const textEvidence = JSON.parse(await fs.readFile(textManifest, "utf8"));
    assert.deepEqual(textEvidence.console.errors, []);
    textHashes.push(textEvidence.renderedFrames[0].pixelHash);
  }
  assert.notEqual(textHashes[0], textHashes[1], "a source-consumed title change must alter the rendered pixels");
});

test("Moessif original HTML templates load local fonts, preserve source bytes, and consume their real controls", async (t) => {
  const browser = await browserExecutable();
  let playwrightAvailable = false;
  try { nodeRequire.resolve("playwright"); playwrightAvailable = true; } catch { /* live render needs local Playwright */ }
  if (!browser || !playwrightAvailable) {
    t.skip("requires a local Chrome/Chromium executable and an already-installed Playwright; no dependency is installed by this test");
    return;
  }
  const cacheRoot = path.resolve(process.env.MOTION_TEST_TMP || path.join(repoRoot, ".cache", "tmp"));
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "laohu-motion-showcase-live-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const inputRoot = path.join(runRoot, "input");
  const preparedRoot = path.join(runRoot, "prepared");
  const outputRoot = path.join(runRoot, "output");
  await Promise.all([inputRoot, preparedRoot, outputRoot].map((directory) => fs.mkdir(directory, { recursive: true })));
  const cases = [
    {
      id: "motion-code-video-showcase-big-card",
      spec: { templateId: "motion-code-video-showcase-big-card", duration: 1, fps: 30, width: 1920, height: 1080, parameters: { layout: 2, index: 2, total: 11, color: "#ffc857", first: "想做", keyword: "科普视频？", brand: "老胡造梦" } },
      changed: (parameters) => { parameters.keyword = "模型怎样学习？"; },
    },
    {
      id: "motion-code-video-showcase-segment",
      spec: { templateId: "motion-code-video-showcase-segment", duration: 1, fps: 30, width: 1920, height: 1080, parameters: { title: "一句话，讲清楚", subtitle: "先说重点，再给证据", brand: "老胡造梦", capsuleName: "示例风格", capsuleCategory: "分类", t0: 0.25, speed: 1.2, theme: "coral-noir" } },
      changed: (parameters) => { parameters.title = "</script><script>window.__injected=1</script>"; parameters.capsuleName = "学习路径"; parameters.capsuleCategory = "因果"; },
    },
  ];
  for (const item of cases) {
    const rows = [];
    for (const variant of ["base", "changed"]) {
      const spec = structuredClone(item.spec);
      if (variant === "changed") item.changed(spec.parameters);
      const input = path.join(inputRoot, `${item.id}-${variant}.json`);
      const prepared = path.join(preparedRoot, `${item.id}-${variant}.json`);
      const output = path.join(outputRoot, `${item.id}-${variant}.png`);
      const manifestPath = path.join(outputRoot, `${item.id}-${variant}.manifest.json`);
      const browserCache = path.join(runRoot, `${item.id}-${variant}-browser-cache`);
      await fs.writeFile(input, `${JSON.stringify(spec, null, 2)}\n`);
      const prepare = invoke(["prepare", item.id, "--input", input, "--output", prepared]);
      assertCliOk(prepare, `${item.id} ${variant} prepare`);
      const relativeTmp = path.join(runRoot, "browser-temp", `${item.id}-${variant}`);
      const preview = invoke(["preview", item.id, "--spec", prepared, "--output", output, "--samples", "0.5,0.7,0.5", "--browser", browser, "--cache-dir", browserCache, "--manifest", manifestPath], {
        env: { TMPDIR: relativeTmp, TMP: relativeTmp, TEMP: relativeTmp },
      });
      assertCliOk(preview, `${item.id} ${variant} preview`);
      const evidence = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      assert.equal(evidence.sourceRuntime.boot.initial.ready, true);
      assert.equal(evidence.sourceRuntime.capture.mode, "software-swiftshader");
      assert.equal(evidence.sourceRuntime.capture.frequentReadback, true);
      assert.deepEqual(evidence.sourceRuntime.missingRuntimeRequests, []);
      assert.deepEqual(evidence.sourceRuntime.servedPinMismatches, []);
      assert.deepEqual(evidence.console.errors, []);
      assert.deepEqual(evidence.network.blockedRequests, []);
      assert.ok(path.isAbsolute(evidence.sourceRuntime.browserTempRoot));
      assert.ok(evidence.sourceRuntime.browserTempRoot.startsWith(`${browserCache}${path.sep}`), "Playwright temp profile must use the absolute external project cache even when inherited TMPDIR is relative");
      assert.ok(evidence.sourceRuntime.boot.initial.expectedFontAssets.every((font) => font.loaded), "every family awaited by original loadFonts must be loaded from a pinned local source");
      assert.equal(evidence.renderedFrames[0].pixelSha256, evidence.renderedFrames[2].pixelSha256, "fresh page realms must replay the same source frame pixel-for-pixel");
      if (item.id.endsWith("segment")) {
        assert.notEqual(evidence.source.originalHtmlSha256, evidence.source.servedHtmlSha256, "declared content literals and scoped callsite patches produce derived HTML bytes");
        assert.equal(evidence.source.htmlAdapter.replacements.length, 5);
        assert.ok(evidence.source.htmlAdapter.replacements.every((replacement) => replacement.encoding.includes("JSON string literal")));
        assert.equal(evidence.source.htmlAdapter.sourcePatches.length, 2);
        assert.ok(evidence.source.htmlAdapter.sourcePatches.every((patch) => patch.alignment === "left" && patch.state.includes("ctx.save()/ctx.restore()") && !patch.originalDrawingFunctionModified));
        const expectedName = variant === "base" ? "示例风格" : "学习路径";
        const expectedCategory = variant === "base" ? "分类" : "因果";
        assert.ok(evidence.renderedFrames[0].capsuleCallEvidence.length >= 1, "original capsule call evidence is captured during boot and requested rendering");
        assert.ok(evidence.renderedFrames[0].capsuleCallEvidence.every((call) => call.branch === "themed" && call.textAlign === "left" && call.name === expectedName && call.category === expectedCategory), "rendered source calls receive declared content with scoped left alignment");
      } else {
        assert.equal(evidence.source.originalHtmlSha256, evidence.source.servedHtmlSha256, "big-card runs directly from the original HTML bytes");
      }
      rows.push(evidence.renderedFrames[1].pixelSha256);
    }
    assert.notEqual(rows[0], rows[1], `${item.id} source-consumed content changes must alter rendered pixels`);
  }

  const defaultCapsuleSpec = structuredClone(cases[1].spec);
  delete defaultCapsuleSpec.parameters.capsuleName;
  delete defaultCapsuleSpec.parameters.capsuleCategory;
  const defaultCapsuleInput = path.join(inputRoot, "segment-default-capsule.json");
  const defaultCapsulePrepared = path.join(preparedRoot, "segment-default-capsule.json");
  await fs.writeFile(defaultCapsuleInput, `${JSON.stringify(defaultCapsuleSpec, null, 2)}\n`);
  const defaultCapsulePrepare = invoke(["prepare", cases[1].id, "--input", defaultCapsuleInput, "--output", defaultCapsulePrepared]);
  assertCliOk(defaultCapsulePrepare, "segment default capsule prepare");
  const preparedCapsule = JSON.parse(await fs.readFile(defaultCapsulePrepared, "utf8"));
  assert.equal(preparedCapsule.parameters.capsuleName, "章节");
  assert.equal(preparedCapsule.parameters.capsuleCategory, "");

  const invalidGlass = path.join(inputRoot, "segment-glass-subtitle.json");
  await fs.writeFile(invalidGlass, `${JSON.stringify({ ...cases[1].spec, parameters: { ...cases[1].spec.parameters, theme: "aqua-morandi" } }, null, 2)}\n`);
  const blocked = invoke(["prepare", cases[1].id, "--input", invalidGlass, "--output", path.join(preparedRoot, "segment-glass-subtitle.json")]);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /does not consume PLACEHOLDER_SUB/);
});

test("Showcase prepare resolves its font CSS from the declared templates and skill-root bases", async (t) => {
  const cacheRoot = path.resolve(process.env.MOTION_TEST_TMP || path.join(repoRoot, ".cache", "tmp"));
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "showcase-css-prepare-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const entry = JSON.parse(await fs.readFile(path.join(repoRoot, ".agents/skills/laohu-motion/templates/catalog.json"), "utf8"))
    .templates.find((row) => row.id === "motion-code-video-showcase-big-card");
  const input = path.join(runRoot, "input.json");
  const prepared = path.join(runRoot, "prepared.json");
  await fs.writeFile(input, `${JSON.stringify({templateId:entry.id,duration:1,fps:30,width:1920,height:1080,parameters:{brand:"技术测试"}}, null, 2)}\n`);
  const result = invoke(["prepare", entry.id, "--input", input, "--output", prepared]);
  assertCliOk(result, "Showcase big-card prepare");
  const receipt = JSON.parse(await fs.readFile(`${prepared}.assets.json`, "utf8"));
  assert.equal(receipt.adapter.fontCssPath, entry.adapter.fontCssPath);
  const checkedCss = receipt.sourceVerification.checkedFiles.find((row) => row.sourcePath === entry.adapter.fontCssSourcePath);
  assert.ok(checkedCss, "prepare verifies the manifest CSS row using the local closure");
  assert.equal(checkedCss.localPath, path.join("templates", entry.adapter.fontCssPath));
  assert.equal(checkedCss.localSha256, entry.adapter.fontCssSha256);
  assert.equal(receipt.sourceVerification.adapter.sha256, entry.adapter.fontCssSha256, "the prepared receipt's render binding comes from the loader's verified local CSS record");
});

test("DG preload initializes the original camera library to the requested non-1920 stage", async (t) => {
  const browser = await browserExecutable();
  const configuredFfmpeg = process.env.MOTION_FFMPEG || process.env.MOTION_TEMPLATE_TEST_FFMPEG;
  const ffmpeg = configuredFfmpeg || (() => {
    const result = spawnSync("which", ["ffmpeg"], { encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : null;
  })();
  let playwrightAvailable = false;
  try { nodeRequire.resolve("playwright"); playwrightAvailable = true; } catch { /* live render needs local Playwright */ }
  if (!browser || !ffmpeg || !playwrightAvailable) {
    t.skip("requires an installed browser, FFmpeg, and Playwright; no dependency is installed by this test");
    return;
  }

  const cacheRoot = path.join(repoRoot, ".cache", "tmp");
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "laohu-motion-dg-stage-"));
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const scenePath = path.join(runRoot, "scene.json");
  const drawPath = path.join(runRoot, "stage-probe.js");
  const outputPath = path.join(runRoot, "scene.mp4");
  const cachePath = path.join(runRoot, "cache");
  const scene = { version: 1, width: 640, height: 360, fps: 1, duration: 1, background: "#101820", layers: [], objects: [], events: [], bindings: [], variables: {} };
  await fs.writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
  await fs.writeFile(drawPath, `
const center = window.CAM.toScreen({ x: 0, y: 0, z: 1 }, 0, 0);
if (center[0] !== 320 || center[1] !== 180) throw new Error("CAM.toScreen did not receive the requested 640x360 stage: " + JSON.stringify(center));
window.MOTION_RENDERERS = {};
window.MOTION_EVIDENCE = { cameraStageProbe: { worldOrigin: [0, 0], screen: center } };
`);
  const result = spawnSync(process.execPath, [
    path.join(skillDir, "scripts", "render.mjs"),
    "--scene", scenePath,
    "--output", outputPath,
    "--cache-dir", cachePath,
    "--browser", browser,
    "--ffmpeg", ffmpeg,
    "--draw-module", drawPath,
    "--template-effects", "huashu-art-motion-dg",
    "--overwrite",
  ], { cwd: repoRoot, encoding: "utf8", timeout: 180_000, env: process.env });
  assertCliOk(result, "non-1920 DG camera stage render");
  const manifestPath = result.stdout.split(/\r?\n/).find((line) => line.startsWith("MANIFEST "))?.slice("MANIFEST ".length);
  assert.ok(manifestPath, `render did not report its manifest: ${result.stdout}`);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest.templateEffectStage, { requested: { width: 640, height: 360 }, actual: { width: 640, height: 360 }, fontAssets: [] });
  assert.deepEqual(manifest.consumerEvidence.cameraStageProbe, { worldOrigin: [0, 0], screen: [320, 180] });
});

test("legacy compatibility style render passes the requested frame duration through to rendered media", async (t) => {
  const browser = await browserExecutable();
  const ffprobe = await ffprobeExecutable();
  if (!browser || !ffprobe) {
    t.skip("requires an available Chrome/Chromium and ffprobe; no dependency is installed by this test");
    return;
  }
  const runRoot = await fs.mkdtemp(path.join(repoRoot, ".cache", "tmp", "motion-style-duration-"));
  const output = path.join(runRoot, "a2-24-frames.mp4");
  const manifestPath = path.join(runRoot, "a2-24-frames.manifest.json");
  try {
    const result = invoke([
      "styles", "compatibility", "render", "--query", "A2", "--text", "今天我想讲清一件事",
      "--output", output, "--duration-frames", "24", "--work-root", repoRoot,
      "--cache-dir", path.join(runRoot, "render-cache"), "--browser", browser,
      "--manifest", manifestPath,
    ], {timeout: 180_000});
    assertCliOk(result, "A2 24-frame style render");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    assert.equal(manifest.input.durationInFrames, 24);
    assert.equal(manifest.runtime.composition.durationInFrames, 24,
      "Remotion selectComposition must receive the requested duration, not the 90-frame default");
    const probe = spawnSync(ffprobe, [
      "-v", "error", "-count_frames", "-select_streams", "v:0",
      "-show_entries", "stream=nb_frames,nb_read_frames,width,height,avg_frame_rate",
      "-of", "json", output,
    ], {encoding: "utf8", timeout: 30_000});
    assert.equal(probe.error, undefined, `ffprobe did not start: ${probe.error?.message || "unknown error"}`);
    assert.equal(probe.status, 0, `ffprobe failed: ${probe.stderr}`);
    const stream = JSON.parse(probe.stdout).streams?.[0];
    assert.ok(stream, "rendered MP4 must contain a video stream");
    assert.equal(Number(stream.nb_read_frames ?? stream.nb_frames), 24,
      "the encoded MP4 must contain the requested 24 frames");
    assert.equal(stream.width, 1920);
    assert.equal(stream.height, 1080);
    assert.equal(stream.avg_frame_rate, "30/1");
  } finally {
    await fs.rm(runRoot, {recursive: true, force: true});
  }
});
