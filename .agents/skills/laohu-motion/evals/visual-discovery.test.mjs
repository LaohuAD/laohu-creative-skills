import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(skillDir, "../../..");
const cli = path.join(skillDir, "scripts/templates.mjs");
const validationRoot = path.join(projectRoot, ".cache", "validation", "direction-music-upgrade", "direction");
const tmpRoot = path.join(projectRoot, ".cache", "tmp", "direction-music-upgrade", "direction");
const catalog = JSON.parse(fs.readFileSync(path.join(skillDir, "templates/catalog.json"), "utf8"));
const styleIndex = JSON.parse(fs.readFileSync(path.join(skillDir, "templates/styles/index.json"), "utf8"));
const sourceLedger = JSON.parse(fs.readFileSync(path.join(skillDir, "templates/maintenance/source-ledger.json"), "utf8"));

function run(args) {
  fs.mkdirSync(tmpRoot, { recursive: true });
  return execFileSync("node", [cli, ...args], {
    cwd: projectRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, TMPDIR: tmpRoot },
  });
}

function discover(query, limit = 2) {
  return JSON.parse(run(["discover", "--query", query, "--limit", String(limit), "--json"]));
}

function listedProductionConditions(entry) {
  return [entry.inputRequirements, entry.renderPreconditions, entry.conditions, entry.limitations, entry.notSuitableWhen]
    .flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])
    .filter((value, index, rows) => rows.indexOf(value) === index)
    .map((value) => typeof value === "string" ? value : JSON.stringify(value));
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

test("discover joins production candidates, the current method inventory, and all indexed style references", () => {
  const result = discover("明亮 卡通 科普 关系层级", 1);
  const entries = styleIndex.entries;
  const callable = entries.filter((row) => row.route?.callable === true).length;
  const prompts = entries.filter((row) => row.route?.kind === "complete-production-prompt").length;
  const placeholders = entries.filter((row) => row.route?.kind === "source-placeholder").length;
  const references = entries.filter((row) => row.kind === "style-reference" && row.route?.kind === "reference-style" && row.route.callable === false).length;

  assert.equal(result.format, "laohu.motion.visual-discovery/1");
  assert.equal(result.counts.methodsIndexed, catalog.methods.length);
  assert.equal(result.counts.styleLibrary.total, entries.length);
  assert.equal(result.counts.styleLibrary.callableCanvasFunctions, callable);
  assert.equal(result.counts.styleLibrary.completePrompts, prompts);
  assert.equal(result.counts.styleLibrary.excludedEmptyPlaceholders, placeholders);
  assert.equal(result.counts.styleLibrary.referenceStyles, references);
  assert.equal(references, entries.length);
  assert.equal(styleIndex.coverage.sourceSet.original, 43);
  assert.equal(styleIndex.coverage.sourceSet.new, entries.length - 43);
  assert.equal(new Set(entries.map((row) => row.id)).size, entries.length, "style record identity must be unique");
  const actualCategories = entries.reduce((counts, row) => ({ ...counts, [row.category]: (counts[row.category] || 0) + 1 }), {});
  assert.deepEqual(actualCategories, styleIndex.coverage.categories);
  assert.equal(entries.filter((row) => typeof row.previewPath === "string" && row.previewPath.length > 0).length, styleIndex.coverage.previewCount);
  assert.ok(result.candidates.styleCategories.length > 1, "broad query should preserve multiple category groups");
  for (const group of result.candidates.styleCategories) {
    assert.ok(group.candidates.length <= 1, "--limit applies within each category");
    assert.ok(group.matched >= group.candidates.length);
  }
  assert.ok(result.counts.matched.styles >= result.counts.returned.styles);
  assert.equal(result.candidates.methods.length, Math.min(1, result.counts.matched.methods));
  assert.ok(result.candidates.methods.every((row) => row.itemType === "method" && row.renderable === false));
  assert.deepEqual(result.counts.production.notRouted, []);
  assert.ok(result.candidates.supportLibraries.length > 0);
  assert.ok(result.candidates.supportLibraries.every((row) => row.renderable === false));
  assert.ok(!JSON.stringify(result).includes('"availability": "source-only"'));
  assert.ok(!JSON.stringify(result).includes('"kind": "source-placeholder"'));
});

test("catalog use profiles cover every production record and keep authored demos visible outside ordinary candidates", () => {
  assert.equal(catalog.templates.length, 38);
  assert.equal(catalog.effects.length, 31);
  assert.equal(catalog.methods.length, 0, "retired duplicate Garden style methods are not in the active method menu");
  assert.equal(styleIndex.entries.length, 73, "ordinary styles contain the 43 protected originals and 30 accepted new references");
  for (const kind of ["templates", "effects", "methods"]) {
    const rows = catalog[kind];
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, `${kind} IDs stay unique`);
    for (const row of rows) {
      assert.ok(row.motionUse, `${kind}/${row.id} has an explicit use profile`);
      assert.ok(["reference", "production-implementation", "unknown"].includes(row.motionUse.intendedUse));
      assert.ok(["primitive", "coupled-group", "full-shot", "unknown"].includes(row.motionUse.reuseScale));
      assert.equal(typeof row.motionUse.ordinaryProductionCandidate, "boolean");
    }
  }
  const authored = catalog.templates.find((row) => row.id === "laohu-authored-shot");
  assert.deepEqual(authored.motionUse.referenceValues, [{
    parameter: "shotId",
    values: ["formation-camera", "material-craft", "caption-type", "glyph-anatomy"],
  }]);
  assert.equal(authored.motionUse.inspectable, true);
  assert.equal(authored.motionUse.technicalPreview, true);
  assert.equal(authored.motionUse.legacyRenderable, true);
  assert.equal(authored.motionUse.ordinaryProductionCandidate, false);

  const result = discover("laohu-authored-shot", 5);
  assert.ok(result.candidates.referenceDemonstrations.some((row) => row.id === "laohu-authored-shot"));
  assert.ok(!result.candidates.renderable.some((row) => row.id === "laohu-authored-shot"));
  assert.ok(!result.candidates.conditional.some((row) => row.id === "laohu-authored-shot"));
  const allTemplates = JSON.parse(run(["overview", "--json"])).groups.find((row) => row.type === "template");
  assert.equal(allTemplates.summary.byAvailability.available + allTemplates.summary.byAvailability.conditional, 38,
    "overview continues to include every local template while separating source-only records");
});

test("discover distinguishes production renderers from non-callable style references and explicit compatibility code", () => {
  const available = catalog.templates.find((entry) => entry.availability === "available" && entry.renderer);
  const availableId = available.productionId || available.id;
  const availableResult = discover(availableId, 1);
  const availableCard = [...availableResult.candidates.renderable, ...availableResult.candidates.effectsRenderable]
    .find((row) => row.id === availableId);
  assert.ok(availableCard, `discover must return available entry ${availableId}`);
  assert.equal(availableCard.renderable, true);
  assert.equal(availableCard.rendererRegistered, true);
  assert.match(availableCard.nextStep.command, new RegExp(`show ${availableId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));

  const conditional = catalog.templates.find((entry) => entry.availability === "conditional" && entry.renderPreconditions?.length);
  const conditionalId = conditional.productionId || conditional.id;
  const conditionalResult = discover("图表 数据 数值", 3);
  const conditionalCard = conditionalResult.candidates.conditional.find((row) => row.id === conditionalId);
  assert.ok(conditionalCard, `query must retrieve conditional entry ${conditionalId}`);
  assert.equal(conditionalCard.renderable, false);
  assert.equal(conditionalCard.rendererRegistered, true);
  assert.deepEqual(conditionalCard.conditions, listedProductionConditions(conditional));
  assert.match(conditionalCard.statusMeaning, /不代表本次已经满足/);

  const availableEffect = catalog.effects.find((entry) => entry.availability === "available" && entry.renderer);
  const availableEffectId = availableEffect.productionId || availableEffect.id;
  const availableEffectResult = discover(availableEffectId, 1);
  assert.ok(availableEffectResult.candidates.effectsRenderable.some((row) => row.id === availableEffectId));
  const conditionalEffect = catalog.effects.find((entry) => entry.availability === "conditional" && entry.renderer);
  const conditionalEffectId = conditionalEffect.productionId || conditionalEffect.id;
  const conditionalEffectResult = discover(conditionalEffectId, 1);
  const conditionalEffectCard = conditionalEffectResult.candidates.effectsConditional.find((row) => row.id === conditionalEffectId);
  assert.ok(conditionalEffectCard, `discover must keep conditional effect ${conditionalEffectId} separate`);
  assert.equal(conditionalEffectCard.renderable, false);
  assert.deepEqual(conditionalEffectCard.conditions, listedProductionConditions(conditionalEffect));

  const ordinaryStyles = JSON.parse(run(["styles", "list", "--json"]));
  assert.equal(ordinaryStyles.length, 73);
  assert.ok(ordinaryStyles.every((row) => /^(?:original|new):/.test(row.id)
    && row.kind === "style-reference" && row.route?.kind === "reference-style" && row.route.callable === false));
  const compatibilityStyles = JSON.parse(run(["styles", "compatibility", "list", "--json"]));
  assert.equal(compatibilityStyles.length, 25);
  assert.ok(compatibilityStyles.every((row) => row.route?.kind === "remotion-canvas-function" && row.route.callable === true));
  assert.ok(!ordinaryStyles.some((row) => row.id === "F1"), "legacy callable code is not exposed in the normal style menu");
  const f1 = JSON.parse(run(["styles", "compatibility", "describe", "--query", "F1", "--json"]));
  assert.equal(f1.contentCapability.mode, "structured-content-adapter");
  assert.equal(f1.contentCapability.productionAdapterId, "laohu-style-code-canvas");

  const reference = discover("纸张 剪纸 地图", 1).candidates.styleCategories.flatMap((group) => group.candidates)
    .find((row) => row.capability === "style-reference");
  assert.ok(reference);
  assert.equal(reference.renderable, false);
  assert.match(reference.nextStep.command, /styles fulltext --query (?:original|new):/);
});

test("ordinary style index has no legacy prompts, callable functions, or empty placeholders", () => {
  assert.ok(styleIndex.entries.every((row) => row.route?.kind === "reference-style" && row.route.callable === false));
  assert.equal(styleIndex.entries.filter((row) => row.route?.callable === true).length, 0);
  assert.equal(styleIndex.entries.filter((row) => row.route?.kind === "source-placeholder").length, 0);
  const compatibility = JSON.parse(run(["styles", "compatibility", "list", "--json"]));
  assert.equal(compatibility.length, 25);
  assert.ok(compatibility.every((row) => row.route?.callable === true));
});

test("discover refuses vague or missing search descriptors", () => {
  const vague = spawnSync("node", [cli, "discover", "--query", "这个动画应该怎么制作", "--json"], { cwd: projectRoot, encoding: "utf8" });
  assert.notEqual(vague.status, 0);
  assert.match(vague.stderr, /no searchable descriptors/);
  const missing = spawnSync("node", [cli, "discover", "--json"], { cwd: projectRoot, encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /requires --query/);
  const overLimit = spawnSync("node", [cli, "discover", "--query", "明亮 卡通", "--limit", String(catalog.styleLibrary.styleCount + 1), "--json"], { cwd: projectRoot, encoding: "utf8" });
  assert.notEqual(overLimit.status, 0);
  assert.match(overLimit.stderr, new RegExp(`1 to ${catalog.styleLibrary.styleCount}`));
});

test("legacy list, show, and styles-search commands retain their existing routes", () => {
  const styles = JSON.parse(run(["styles", "search", "--query", "明亮 卡通", "--limit", "2", "--json"]));
  assert.ok(Array.isArray(styles));
  assert.ok(styles.length <= 2);

  const effects = JSON.parse(run(["list", "--type", "effect", "--intent", "emphasis", "--json"]));
  assert.ok(Array.isArray(effects));
  assert.ok(effects.every((row) => row.itemType === "effect"));

  const alias = JSON.parse(run(["show", "style-flat-vector", "--json"]));
  assert.equal(alias.id, "original:flat-vector");
  assert.equal(alias.kind, "style-reference");
  assert.equal(alias.route.callable, false);
});

test("fulltext pagination covers every indexed record and resumes a single long record without truncation", () => {
  fs.mkdirSync(validationRoot, { recursive: true });
  const seenIds = [];
  const textById = new Map();
  let cursor = null;
  let firstFingerprint = null;
  let expectedPage = 1;
  let finalPage = null;
  while (true) {
    const args = ["styles", "fulltext", "--library", "--page-characters", "24000", "--json"];
    if (cursor) args.push("--cursor", cursor);
    const page = JSON.parse(run(args));
    assert.equal(page.format, "laohu.motion.style-library-fulltext-page/1");
    assert.equal(page.scope.kind, "library");
    assert.equal(page.page.number, expectedPage);
    assert.ok(page.page.characterCount <= 24000, "the library page stays within its requested Unicode-character budget");
    if (firstFingerprint == null) firstFingerprint = page.libraryFingerprint;
    assert.deepEqual(page.libraryFingerprint, firstFingerprint, "all pages must refer to one unchanged library fingerprint");
    for (const id of page.page.ids) seenIds.push(id);
    for (const segment of page.page.segments) textById.set(segment.id, (textById.get(segment.id) || "") + segment.text);
    assert.deepEqual(page.missingIds, [], "no indexed record may disappear from a complete review");
    finalPage = page;
    cursor = page.nextCursor;
    expectedPage += 1;
    if (!cursor) break;
  }

  assert.equal(finalPage.complete, true);
  assert.equal(finalPage.reviewReceipt.complete, true);
  assert.deepEqual(finalPage.reviewReceipt.missingIds, []);
  assert.equal(finalPage.reviewReceipt.libraryFingerprint.entryCount, styleIndex.entries.length);
  assert.equal(new Set(seenIds).size, styleIndex.entries.length);
  assert.deepEqual([...new Set(seenIds)], styleIndex.entries.map((row) => row.id), "the review covers the complete formal ordinary index");
  for (const row of styleIndex.entries) {
    const expected = new TextDecoder().decode(fs.readFileSync(path.resolve(skillDir, "templates", "styles", row.contentPath)));
    assert.equal(textById.get(row.id), expected, `${row.id} paged text reconstructs its exact pinned local source`);
  }

  const longId = "new:visual-investigation";
  const long = JSON.parse(run(["styles", "fulltext", "--query", longId, "--page-characters", "7000", "--json"]));
  assert.ok(long.nextCursor, "a long single source entry must offer a continuation cursor");
  assert.ok(long.page.segments[0].text.length <= 7000);
  let longText = long.page.segments.map((item) => item.text).join("");
  let longCursor = long.nextCursor;
  let longPages = 1;
  while (longCursor) {
    const next = JSON.parse(run(["styles", "fulltext", "--query", longId, "--page-characters", "7000", "--cursor", longCursor, "--json"]));
    assert.deepEqual(next.libraryFingerprint, long.libraryFingerprint);
    assert.deepEqual(next.page.ids, [longId]);
    longText += next.page.segments.map((item) => item.text).join("");
    longCursor = next.nextCursor;
    longPages += 1;
  }
  const longRow = styleIndex.entries.find((row) => row.id === longId);
  const expectedLong = new TextDecoder().decode(fs.readFileSync(path.resolve(skillDir, "templates", "styles", longRow.contentPath)));
  assert.ok(longPages > 1, "the long accepted style reference exercises continuation");
  assert.equal(longText, expectedLong, "continuation reconstructs the complete pinned local entry without truncation");

  const shortcut = spawnSync("node", [cli, "styles", "fulltext", "--library", "--review-receipt", "--json"], {
    cwd: projectRoot, encoding: "utf8", env: { ...process.env, TMPDIR: tmpRoot },
  });
  assert.notEqual(shortcut.status, 0, "the CLI must not expose a one-shot receipt command that skips page-by-page source delivery");
  assert.match(shortcut.stderr, /unrecognized arguments/);

  const changedPageSize = spawnSync("node", [cli, "styles", "fulltext", "--library", "--page-characters", "23000", "--cursor", JSON.parse(run(["styles", "fulltext", "--library", "--page-characters", "24000", "--json"])).nextCursor, "--json"], {
    cwd: projectRoot, encoding: "utf8", env: { ...process.env, TMPDIR: tmpRoot },
  });
  assert.notEqual(changedPageSize.status, 0, "a cursor cannot resume under a changed page size");
  assert.match(changedPageSize.stderr, /PAGE_SIZE_MISMATCH/);
});

test("retired Garden style profiles leave only thin aliases to the canonical original cards", () => {
  const profiles = sourceLedger.referenceCatalog.entries.filter((row) => row.kind === "style-profile");
  const typed = JSON.parse(run(["list", "--type", "style-profile", "--json"]));
  const allTyped = JSON.parse(run(["list", "--all", "--type", "style-profile", "--json"]));
  assert.equal(profiles.length, 0);
  assert.deepEqual(typed, []);
  assert.deepEqual(allTyped, []);
  assert.equal(catalog.methods.length, 0);

  const alias = JSON.parse(run(["show", "laohu-motion-style-paper-cut", "--json"]));
  assert.equal(alias.id, "original:paper-cut");
  assert.equal(alias.kind, "style-reference");
  assert.equal(alias.route.kind, "reference-style");
  assert.equal(alias.contentCapability.renderer, null);
  assert.match(alias.originalText, /剪纸/);
});

test("a real zero-production discovery query hands off to verified material consumers without claiming style fit", () => {
  const result = JSON.parse(run([
    "discover", "--query", "温暖 水彩 咖啡 杯子 液体 倒入 蒸汽",
    "--content", "咖啡倒入杯子", "--needs", "杯子液体蒸汽", "--limit", "3", "--json",
  ]));
  assert.equal(result.counts.matched.templates, 0);
  assert.equal(result.counts.matched.effects, 0);
  assert.equal(result.materialHandoff.status, "no-registered-production-match");
  assert.match(result.materialHandoff.assetStatus, /not-assessed/);
  assert.match(result.materialHandoff.explanation, /不是本次风格匹配/);
  assert.ok(result.materialHandoff.routes.length > 0);

  const routeById = new Map(result.materialHandoff.routes.map((row) => [row.id, row]));
  const expected = [
    ["video-clip-card", "template"],
    ["laohu-media-photo-montage", "template"],
    ["image-collage-explanation", "template"],
    ["laohu-motion-recipe-wipe-reveal", "effect"],
  ];
  for (const [id, type] of expected) {
    const route = routeById.get(id);
    assert.ok(route, `expected registered material handoff ${id}`);
    assert.equal(route.itemType, type);
    assert.equal(route.renderable, route.availability === "available" && route.rendererRegistered);
    assert.equal(route.nextStep.command, `node scripts/templates.mjs show ${id}`);
    assert.equal(route.nextStep.listCommand, `node scripts/templates.mjs list --type ${type} --json`);
  }
  assert.match(routeById.get("video-clip-card").boundary, /不会把实拍转换成水彩/);
  assert.match(routeById.get("laohu-media-photo-montage").boundary, /不会生成杯中液体/);
  assert.match(routeById.get("image-collage-explanation").mediaType, /视频帧/);
  assert.match(routeById.get("laohu-motion-recipe-wipe-reveal").boundary, /不是图像\/视频素材生成器/);

  const referenceCards = result.candidates.styleCategories.flatMap((group) => group.candidates)
    .filter((row) => row.capability === "style-reference");
  assert.ok(referenceCards.length > 0);
  assert.ok(referenceCards.every((row) => row.renderable === false && row.callable === false));
});

test("overview exposes every category and keeps entries without preview images in the inventory", () => {
  const result = JSON.parse(run(["styles", "overview", "--json"]));
  const entries = result.categories.flatMap((group) => group.entries);
  assert.equal(result.format, "laohu.motion.style-resource-overview/1");
  assert.equal(result.coverage.total, 73);
  assert.equal(entries.length, styleIndex.entries.length);
  assert.equal(result.coverage.categories && Object.values(result.coverage.categories).reduce((sum, value) => sum + value, 0), 73);
  assert.equal(result.coverage.withPreview, 30);
  assert.equal(result.coverage.withoutPreview, 43);
  assert.equal(result.coverage.callableSourceFunctions, 0);
  assert.equal(result.coverage.fullPromptReferences, 0);
  assert.equal(result.coverage.emptySourcePlaceholders, 0);
  assert.deepEqual(new Set(result.coverage.categories && Object.keys(result.coverage.categories)), new Set(Object.keys(styleIndex.coverage.categories)));
  const noPreviewOriginal = entries.find((row) => row.id === "original:blueprint");
  assert.ok(noPreviewOriginal, "a protected original without a preview remains browseable");
  assert.equal(noPreviewOriginal.preview, null);
  assert.equal(noPreviewOriginal.capability, "non-callable-style-reference");
  assert.equal(noPreviewOriginal.selectionEligible, true);
  assert.match(result.retrievalNote, /not aesthetic judgments/);
});

test("top-level resource overview and typed browse cover every registry without treating source indexes as renderers", () => {
  const result = JSON.parse(run(["overview", "--json"]));
  const groups = new Map(result.groups.map((group) => [group.type, group]));
  const referenceRows = sourceLedger.referenceCatalog.entries;
  const expected = {
    style: styleIndex.entries.length,
    template: catalog.templates.length + sourceLedger.sourceOnlyTemplates.length,
    effect: catalog.effects.length,
    "effect-library": catalog.effectLibraries.length,
    method: catalog.methods.length,
    "reference-index": referenceRows.filter((row) => row.kind !== "style-profile").length,
    "style-profile": 0,
  };
  assert.equal(result.format, "laohu.motion.resource-catalog-overview/1");
  for (const [type, count] of Object.entries(expected)) assert.equal(groups.get(type).summary.count, count, `${type} registry count`);
  assert.equal(groups.get("source-index").summary.sourceRecords.count, sourceLedger.sources.length);
  assert.equal(groups.get("source-index").summary.sourceTreeIndexes.count, sourceLedger.sourceTreeIndex.length);
  assert.match(result.retrievalNote, /not production implementations/);
  assert.match(result.retrievalNote, /remain lexical/);
  assert.match(groups.get("style").expandCommand, /browse --type style/);
  assert.match(groups.get("effect").expandCommand, /browse --type effect/);
  assert.deepEqual(groups.get("style").summary.bySourceId, {}, "style source lineage is exposed as exact per-entry paths/hashes, not invented source IDs");

  const shotcraftReferences = JSON.parse(run(["browse", "--type", "reference-index", "--source", "video-shotcraft", "--json"]));
  assert.equal(shotcraftReferences.groups[0].entries.length, referenceRows.filter((row) => row.sourceId === "video-shotcraft" && row.kind !== "style-profile").length);
  assert.ok(shotcraftReferences.groups[0].entries.every((row) => row.source.id === "video-shotcraft"));
  assert.ok(shotcraftReferences.groups[0].entries.every((row) => row.productionRenderer === null && row.rendererRegistered === false));

  const shotcraft = JSON.parse(run(["browse", "--type", "source-index", "--source", "video-shotcraft", "--json"]));
  const sourceGroup = shotcraft.groups[0];
  assert.equal(sourceGroup.type, "source-index");
  assert.deepEqual(sourceGroup.entries.sources.map((row) => row.id), ["video-shotcraft"]);
  assert.ok(sourceGroup.summary.sourceRecords.entries[0].registeredRecords.references >= 270);
  assert.match(sourceGroup.entries.sources[0].nextStep.describeCommand, /describe --type source-index --query video-shotcraft/);

  const shotcraftDetails = JSON.parse(run(["describe", "--type", "source-index", "--query", "video-shotcraft", "--json"]));
  const expectedShotcraftReferences = referenceRows.filter((row) => row.sourceId === "video-shotcraft");
  assert.equal(shotcraftDetails.sourceRecord.status, "pinned-remotion-components-and-source-only-gallery-index");
  assert.equal(shotcraftDetails.relatedRegistries.references, expectedShotcraftReferences.length);
  assert.equal(shotcraftDetails.relatedRegistries.referencesByKind.style, 150);
  assert.equal(shotcraftDetails.relatedRegistries.referencesByKind.card, 124);
  assert.match(shotcraftDetails.productionBoundary, /not itself a production renderer/);
});

test("typed describe opens exact originals, consumers, conditions, and local rules by registry", () => {
  const templateId = catalog.templates.find((row) => row.availability === "available").productionId
    || catalog.templates.find((row) => row.availability === "available").id;
  const template = JSON.parse(run(["describe", "--type", "template", "--query", templateId, "--json"]));
  assert.equal(template.itemType, "template");
  assert.equal(template.originalRecord.id, catalog.templates.find((row) => (row.productionId || row.id) === templateId).id);
  assert.ok(template.source.sourcePath);
  assert.equal(template.rendererRegistered, true);
  assert.ok(template.consumer.command.includes(`show ${templateId}`));

  const effect = catalog.effects.find((row) => row.renderer);
  const effectDescription = JSON.parse(run(["describe", "--type", "effect", "--query", effect.id, "--json"]));
  assert.equal(effectDescription.originalRecord.id, effect.id);
  assert.deepEqual(effectDescription.conditions, listedProductionConditions(effect));
  assert.equal(effectDescription.rendererRegistered, effect.availability !== "source-only");

  const library = JSON.parse(run(["describe", "--type", "effect-library", "--query", catalog.effectLibraries[0].id, "--json"]));
  assert.equal(library.originalRecord.id, catalog.effectLibraries[0].id);
  assert.equal(library.consumer.role, "support library; not a standalone rendered effect");
  assert.ok(library.consumer.loadOrder.length > 0);

  assert.deepEqual(JSON.parse(run(["list", "--type", "method", "--json"])), [], "retired style rewrite cards do not remain as local methods");

  const reference = sourceLedger.referenceCatalog.entries.find((row) => row.sourceId === "video-shotcraft");
  const referenceDescription = JSON.parse(run(["describe", "--type", "reference-index", "--query", reference.id, "--json"]));
  assert.equal(referenceDescription.originalRecord.id, reference.id);
  assert.equal(referenceDescription.callable, false);
  assert.equal(referenceDescription.renderable, false);
  assert.equal(referenceDescription.rendererRegistered, false);
  assert.equal(referenceDescription.productionRenderer, null);
  assert.equal(referenceDescription.indexedRenderer, "catalog-index");
  assert.match(referenceDescription.sourceOnlyBoundary, /not callable production output/);

  const style = JSON.parse(run(["styles", "describe", "--query", "original:blueprint", "--json"]));
  assert.equal(style.id, "original:blueprint");
  assert.equal(style.kind, "style-reference");
  assert.equal(style.route.kind, "reference-style");
});

test("typed browse returns every matching record and overview/browse reject head-style limits", () => {
  const type = JSON.parse(run(["browse", "--type", "template", "--json"]));
  assert.equal(type.groups[0].entries.length, catalog.templates.length + sourceLedger.sourceOnlyTemplates.length);
  const effectLibrary = JSON.parse(run(["browse", "--type", "effect-library", "--json"]));
  assert.equal(effectLibrary.groups[0].entries.length, catalog.effectLibraries.length);
  assert.ok(effectLibrary.groups[0].entries.every((row) => row.rendererRegistered === true));
  for (const command of ["overview", "browse"]) {
    const rejected = spawnSync("node", [cli, command, "--type", "template", "--limit", "2"], { cwd: projectRoot, encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /does not support --limit/);
  }
});

test("resource cards derive callable from a registered local production renderer and keep conditional/source-only boundaries", () => {
  const templates = JSON.parse(run(["browse", "--type", "template", "--json"])).groups[0].entries;
  const mathEntry = catalog.templates.find((row) => row.productionId === "math-explanation-clip");
  const math = templates.find((row) => row.id === "math-explanation-clip");
  assert.ok(mathEntry && math);
  assert.equal(mathEntry.availability, "available");
  assert.equal(mathEntry.renderer, "native-clip");
  assert.equal(Object.hasOwn(mathEntry, "callable"), false, "fixture preserves the missing top-level declaration that exposed the regression");
  assert.equal(math.callable, true, "registered native-clip consumer remains callable despite the absent catalog flag");
  assert.equal(math.callableBasis, "registered-local-production-renderer");
  assert.equal(math.catalogDeclaredCallable, null);
  assert.equal(math.renderable, true);
  assert.equal(math.rendererRegistered, true);
  const describedMath = JSON.parse(run(["describe", "--type", "template", "--query", "math-explanation-clip", "--json"]));
  assert.equal(describedMath.callable, true);
  assert.equal(describedMath.catalogDeclaredCallable, null);
  assert.equal(describedMath.rendererRegistered, true);

  const photoEntry = catalog.templates.find((row) => row.productionId === "laohu-media-photo-montage");
  const photo = templates.find((row) => row.id === "laohu-media-photo-montage");
  assert.ok(photoEntry && photo);
  assert.equal(photo.availability, "conditional");
  assert.equal(photo.callable, true, "registered provider can be invoked after its conditions are met");
  assert.equal(photo.catalogDeclaredCallable, true);
  assert.equal(photo.renderable, false, "conditional is not currently renderable without satisfying its inputs");
  assert.equal(photo.rendererRegistered, true);
  assert.deepEqual(photo.callabilityConditions, listedProductionConditions(photoEntry));
  assert.ok(photo.callabilityConditions.some((condition) => /PNG assets/.test(condition)));
  const describedPhoto = JSON.parse(run(["describe", "--type", "template", "--query", "laohu-media-photo-montage", "--json"]));
  assert.equal(describedPhoto.callable, true);
  assert.equal(describedPhoto.renderable, false);
  assert.deepEqual(describedPhoto.callabilityConditions, photo.callabilityConditions);

  const sourceOnlyTemplate = templates.find((row) => row.availability === "source-only");
  assert.ok(sourceOnlyTemplate);
  assert.equal(sourceOnlyTemplate.callable, false);
  assert.equal(sourceOnlyTemplate.callableBasis, "source-only-reference");
  assert.equal(sourceOnlyTemplate.renderable, false);
  assert.equal(sourceOnlyTemplate.rendererRegistered, false);
  const describedSourceOnlyTemplate = JSON.parse(run(["describe", "--type", "template", "--query", sourceOnlyTemplate.id, "--json"]));
  assert.equal(describedSourceOnlyTemplate.callable, false);
  assert.equal(describedSourceOnlyTemplate.renderable, false);
  assert.equal(describedSourceOnlyTemplate.rendererRegistered, false);

  const references = JSON.parse(run(["browse", "--type", "reference-index", "--json"])).groups[0].entries;
  const sourceOnly = references.find((row) => row.sourceOnlyDecisionInput);
  assert.ok(sourceOnly);
  assert.equal(sourceOnly.callable, false);
  assert.equal(sourceOnly.callableBasis, "source-only-reference");
  assert.equal(sourceOnly.renderable, false);
  assert.equal(sourceOnly.rendererRegistered, false);

  const methods = JSON.parse(run(["browse", "--type", "method", "--json"])).groups[0].entries;
  assert.ok(methods.every((row) => row.callable === false && row.callableBasis === "decision-method-not-renderer"));
  const libraries = JSON.parse(run(["browse", "--type", "effect-library", "--json"])).groups[0].entries;
  assert.ok(libraries.every((row) => row.callable === false && row.callableBasis === "support-library-not-standalone-renderer"));
});

test("selected descriptions preserve original source and point to actual registered consumers with source-located facets", () => {
  for (const row of styleIndex.entries) {
    const body = fs.readFileSync(path.resolve(skillDir, "templates/styles", row.contentPath));
    assert.equal(sha256(body), row.localSha256, `${row.id} local body hash`);
    assert.match(row.sourceSha256, /^[a-f0-9]{64}$/, `${row.id} source evidence hash`);
    if (row.sourceSet === "original") {
      assert.equal(sha256(body), row.sourceSha256, `${row.id} protected original body hash`);
    } else {
      assert.equal(row.sourceSet, "new", `${row.id} declares a recognized source set`);
      assert.ok(row.sourcePath, `${row.id} retains its actual source location`);
      assert.ok(row.sourceEvidenceStatus?.includes("source-text-method"), `${row.id} records transcription evidence type`);
    }
    if (row.previewPath) {
      const image = fs.readFileSync(path.resolve(skillDir, "templates/styles", row.previewPath));
      assert.equal(sha256(image), row.previewLocalSha256, `${row.id} local preview hash`);
      assert.equal(sha256(image), row.previewSourceSha256, `${row.id} source preview hash`);
    }
  }

  const original = JSON.parse(run(["styles", "describe", "--query", "original:blueprint", "--json"]));
  assert.equal(original.originalText, fs.readFileSync(path.resolve(skillDir, "templates/runtime/laohu-showreel/references/styles/blueprint.md"), "utf8"));
  assert.equal(original.sourceEvidence.licenseId, "RUNTIME-MIT");
  assert.equal(original.route.kind, "reference-style");

  const added = JSON.parse(run(["styles", "describe", "--query", "new:lidar-survey", "--json"]));
  assert.equal(added.sourceEvidence.licenseId, "LEMO-MIT");
  assert.equal(added.previewType, "static-only");
  assert.equal(added.route.kind, "reference-style");

  const f1 = JSON.parse(run(["styles", "compatibility", "describe", "--query", "F1", "--json"]));
  assert.equal(f1.route.kind, "remotion-canvas-function");
  assert.ok(f1.callableConsumer.componentPath);
  assert.ok(f1.callableConsumer.sourceFunction);
  assert.equal(f1.callableConsumer.status, "registered-source-function; rendering this function does not itself add it to a Film timeline");
});

test("the three real lexical queries preserve per-category style groups and exact fulltext pointers", () => {
  const queries = [
    "从下往上 逐层堆叠 产业结构 层级关系",
    "分层堆叠 增长 累积 现代编辑感",
    "五个部分 逐个出现 清单 卡片 白板",
  ];
  for (const query of queries) {
    const result = discover(query, 2);
    assert.match(result.retrieval.method, /lexical lookup/);
    assert.match(result.retrieval.note, /do not prove visual fit/);
    assert.ok(result.counts.matched.styles > 0, `query should retrieve style references: ${query}`);
    assert.ok(result.candidates.styleCategories.length > 1, `category coverage should not be flattened into a head prefix: ${query}`);
    for (const group of result.candidates.styleCategories) {
      assert.ok(group.candidates.length <= 2);
      assert.ok(group.candidates.every((item) => item.capability === "style-reference"
        && item.sourceEvidence.contentPath && /styles fulltext --query (?:original|new):/.test(item.nextStep.command)));
    }
  }
});

test("a generic production hit does not satisfy an explicit missing-media requirement", () => {
  const result = JSON.parse(run([
    "discover", "--query", "像素 计数 结果冲击", "--content", "步骤解释",
    "--needs", "图像或本地素材", "--limit", "2", "--json",
  ]));
  assert.ok(result.counts.matched.templates > 0 || result.counts.matched.effects > 0, "fixture must include generic lexical production hits");
  assert.equal(result.materialHandoff.status, "declared-material-unverified");
  assert.match(result.materialHandoff.assetStatus, /did not read an asset path or rights declaration/);
  assert.ok(result.materialHandoff.productionMatchesThatDoNotVerifyTheNeed.length > 0);
  assert.ok(result.materialHandoff.routes.length > 0);
  assert.match(result.materialHandoff.explanation, /不能证明 --needs/);
});
