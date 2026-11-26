#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { preflightFfmpeg } from "./laohu-ffmpeg-preflight.mjs";
import { loadMotionPackage } from "./laohu-motion-runtime.mjs";
import { STYLE_CONTENT_ADAPTER_MANIFEST, STYLE_CONTENT_ADAPTER_MANIFEST_SHA256 } from "../templates/adapters/style-content-adapter.mjs";
import { verifyStyleLibraryEntry } from "../templates/adapters/video-shotcraft-remotion.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(skillDir, "templates", "catalog.json");
const maintenanceSourceLedgerPath = path.join(skillDir, "templates", "maintenance", "source-ledger.json");
const STYLE_LIBRARY_SOURCE_ID = "laohu-style-library";

function usage() {
  return [
    "Usage:",
    "  node scripts/templates.mjs styles list [--category <tag>]",
    "  node scripts/templates.mjs styles overview [--category <tag>] [--json]",
    "  node scripts/templates.mjs styles browse [--category <tag>] [--json]",
    "  node scripts/templates.mjs styles search --query <words> [--category <tag>] [--limit <n>]",
    "  node scripts/templates.mjs styles get --query <ID-or-name>",
    "  node scripts/templates.mjs styles describe --query <ID-or-name> [--json]",
    "  node scripts/templates.mjs styles selection --selection-file <path> [--names]",
    "  node scripts/templates.mjs styles fulltext --query <ID-or-name> [--page-characters 12000 --cursor <nextCursor> --json]",
    "  node scripts/templates.mjs styles fulltext --library [--page-characters 12000 --cursor <nextCursor> --json]",
    "  node scripts/templates.mjs styles hash [--query <ID-or-name>]",
    "  node scripts/templates.mjs styles compatibility list|browse|overview|search|get|describe|fulltext|hash [options]",
    "  node scripts/templates.mjs styles compatibility preview|render --query <A-G-ID> ... (legacy renderer only)",
    "  node scripts/templates.mjs overview [--type all|style|template|effect|effect-library|method|reference-index|style-profile|source-index] [--source <id>] [--category <tag>] [--status <availability>] [--json]",
    "  node scripts/templates.mjs browse [--type all|style|template|effect|effect-library|method|reference-index|style-profile|source-index] [--source <id>] [--category <tag>] [--status <availability>] [--json]",
    "  node scripts/templates.mjs describe --type <template|effect|effect-library|method|reference-index|style-profile|source-index|style> --query <ID> [--json]",
    "  node scripts/templates.mjs styles preview --query <A-G-ID|F1|F2> [--text <material>] [--content-json /absolute/work/content.json] --output /absolute/frame.png --time <seconds> [--work-root /absolute/workspace]",
    "  node scripts/templates.mjs styles render --query <A-G-ID|F1|F2> [--text <material>] [--content-json /absolute/work/content.json] --output /absolute/clip.mp4 --duration-frames <n> [--work-root /absolute/workspace]",
    "  node scripts/templates.mjs discover --query <visual-or-motion-descriptors> [--content <viewing-task>] [--needs <material-or-input>] [--intent <tag>] [--family <tag>] [--target <tag>] [--runtime <tag>] [--category <tag>] [--limit <n>] [--json]",
    "  node scripts/templates.mjs list [--all] [--research] [--json] [--status available|conditional|source-only] [--type template|method|effect|effect-library|reference-index|style-profile] [--use <words>] [--content <words>] [--needs <input>] [--intent <tag>] [--family <tag>] [--target <tag>] [--runtime <tag>] [--source <source-id>] [--category <tag>]",
    "  node scripts/templates.mjs show <production-id> [--research] [--json]",
    "  node scripts/templates.mjs verify [--source <source-id>] [--source-root /absolute/maintenance/templates/upstream]",
    "  node scripts/templates.mjs prepare <template-id> --input /absolute/spec.json --output /absolute/prepared.json",
    "  node scripts/templates.mjs preview <template-id> --spec /absolute/spec.json --output /absolute/frame.png --time 1.5 [--samples 0,2,1,2] [--assets-root /absolute/media-dir] [--manifest /absolute/evidence.json] [--browser /absolute/chrome] [--hardware] [--no-frequent-readback]",
    "  node scripts/templates.mjs render <template-id> --spec /absolute/spec.json --output /absolute/clip.mp4 [--work-root /absolute/workspace] [--runtime-root /absolute/workspace/.cache/tmp/laohu-motion/remotion-runtime] [--assets-root /absolute/media-dir] [--cache-dir /absolute/workspace/.cache/tmp/laohu-motion/template-render] [--manifest /absolute/evidence.json] [--browser /absolute/chrome] [--ffmpeg /absolute/ffmpeg] [--hardware] [--no-frequent-readback]",
    "  node scripts/templates.mjs prepare <native-scene-id> --input /absolute/spec.json --output /absolute/WORK_ROOT/.cache/tmp/native-scene/project --work-root /absolute/WORK_ROOT/.cache/tmp/native-scene",
    "  node scripts/templates.mjs render <native-scene-id> --spec /absolute/WORK_ROOT/.cache/tmp/native-scene/project/laohu-native-template.json --output /absolute/WORK_ROOT/.cache/tmp/native-scene/clip.mp4 --work-root /absolute/WORK_ROOT/.cache/tmp/native-scene [--manifest /absolute/WORK_ROOT/.cache/tmp/native-scene/receipt.json] [--browser /absolute/chrome] [--ffmpeg /absolute/ffmpeg]",
    "  node scripts/templates.mjs preview finance-chart-native --spec /absolute/WORK_ROOT/.cache/tmp/native-scene/project/laohu-native-template.json --output /absolute/WORK_ROOT/.cache/tmp/native-scene/frame.png --time 1.5 --work-root /absolute/WORK_ROOT/.cache/tmp/native-scene",
    "  node scripts/templates.mjs render --film-blueprint /absolute/blueprint.json --output /absolute/film.mp4 --work-root /absolute/WORK_ROOT [--runtime-root /absolute/WORK_ROOT/.cache/tmp/laohu-motion/remotion-runtime] [--manifest /absolute/film-manifest.json] [--browser /absolute/chrome] [--ffmpeg /absolute/ffmpeg]",
    "  node scripts/templates.mjs preview comic-reaction-scene --spec /absolute/prepared-scene.json --output /absolute/frame.png --time 1.5 [--cache-dir /absolute/WORK_ROOT/.cache/tmp/template-render]",
    "  node scripts/templates.mjs render comic-reaction-scene --spec /absolute/prepared-scene.json --output /absolute/scene.mp4 --cache-dir /absolute/WORK_ROOT/.cache/tmp/template-render",
    "  Software/SwiftShader is the default capture mode for repeatable frame reads. --hardware opts into GPU capture for diagnosis; its pixel hashes are not covered by the default seek evidence. --software remains accepted as a compatibility alias.",
    "",
    "Template commands use local production IDs; local runtime closures are hash-checked before rendering. Source identity and original-byte comparison are available through explicit maintenance commands.",
  ].join("\n");
}

async function runStyleLibraryCommand(argv) {
  let forwarded = null;
  if (["styles", "style"].includes(argv[0])) {
    forwarded = argv.slice(1);
  } else if (argv[0] === "describe") {
    const typeIndex = argv.indexOf("--type");
    if (typeIndex >= 0 && argv[typeIndex + 1] === "style") {
      forwarded = ["describe", ...argv.slice(1).filter((_, index) => index !== typeIndex - 1 && index !== typeIndex)];
    }
  } else if (argv[0] === "show" && /^[A-Z]+\d+$/i.test(argv[1] || "")) {
    forwarded = ["compatibility", "get", "--query", argv[1]];
  } else if (argv[0] === "show" && /^(?:laohu-motion-)?style-[a-z0-9-]+$/i.test(argv[1] || "")) {
    const slug = String(argv[1]).replace(/^(?:laohu-motion-)?style-/i, "").toLowerCase();
    const query = `original:${slug}`;
    forwarded = argv.includes("--json")
      ? ["describe", "--query", query, "--json"]
      : ["fulltext", "--query", query];
  } else if (argv[0] === "list") {
    const typeIndex = argv.indexOf("--type");
    if (typeIndex >= 0 && argv[typeIndex + 1] === "style") {
      const listArgs = [];
      for (let index = 1; index < argv.length; index += 1) {
        if (argv[index] === "--type") { index += 1; continue; }
        if (["--json", "--all"].includes(argv[index])) continue;
        listArgs.push(argv[index]);
      }
      forwarded = ["list", ...listArgs];
    }
  }
  if (!forwarded) return false;
  let compatibility = forwarded[0] === "compatibility";
  if (compatibility) forwarded = forwarded.slice(1);
  const [subcommand, ...styleArgs] = forwarded;
  if (["preview", "render"].includes(subcommand) && !compatibility) {
    // Keep the former A–G command as a narrow legacy alias for existing projects.
    // New style references are never rendered through this Remotion path.
    compatibility = true;
  }
  if (subcommand === "preview" || subcommand === "render") {
    const args = parseArgs([subcommand, ...styleArgs]);
    if (!args.query || !args.output) throw new Error(`styles ${subcommand} requires --query and --output`);
    if (args.positionals.length) throw new Error(`styles ${subcommand} accepts the style ID through --query`);
    const styleId = String(args.query).toUpperCase();
    const defaultDurationFrames = styleId === "F1" ? 255 : styleId === "F2" ? 300 : 90;
    const supportsStructuredContent = styleId === "F1" || styleId === "F2";
    if (!supportsStructuredContent && !args.text) throw new Error(`styles ${subcommand} for ${args.query} requires --text; --content-json is supported only by F1 and F2`);
    if (args.contentJson && !supportsStructuredContent) throw new Error(`styles ${subcommand} --content-json is supported only by F1/F2, not ${args.query}`);
    let content;
    let contentSource;
    if (args.contentJson) {
      if (!path.isAbsolute(args.contentJson)) throw new Error("--content-json must be an absolute JSON file path under the selected work root");
      const contentPath = path.resolve(args.contentJson);
      const contentBytes = await fs.readFile(contentPath).catch((error) => { throw new Error(`--content-json cannot be read at ${contentPath}: ${error.message}`); });
      try { content = JSON.parse(contentBytes.toString("utf8")); }
      catch (error) { throw new Error(`--content-json is invalid JSON at ${contentPath}: ${error.message}`); }
      if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("--content-json root must be a JSON object matching F1 or F2 content");
      contentSource = { path: contentPath, sha256: crypto.createHash("sha256").update(contentBytes).digest("hex") };
    }
    const workRoot = path.resolve(args.workRoot || process.env.WORK_ROOT || path.resolve(skillDir, "../../.."));
    if (contentSource && !isWithin(workRoot, contentSource.path)) throw new Error(`--content-json must remain under the selected work root: ${workRoot}`);
    const roots = await projectCacheRoots(workRoot);
    const cacheDir = path.resolve(args.cacheDir || path.join(roots.temporary, "laohu-motion", "style-render"));
    if (!isWithin(roots.cache, cacheDir)) throw new Error(`Style renderer cache must stay below the selected workRoot .cache: ${roots.cache}`);
    const output = await requireStyleMediaOutput(args.output, "style output", workRoot);
    const manifest = await requireStyleMediaOutput(args.manifest || `${output}.manifest.json`, "style render manifest", workRoot);
    if (manifest === output) throw new Error("--manifest and --output must be different paths");
    const adapter = await import("../templates/adapters/video-shotcraft-remotion.mjs");
    const result = await adapter.renderStyleCode({
      styleId: args.query,
      parentText: args.text || "",
      ...(content != null ? { content } : {}),
      ...(contentSource ? { contentSource } : {}),
      outputPath: output,
      outputKind: subcommand === "preview" ? "still" : "render",
      timeSec: args.time == null ? 1 : Number(args.time),
      durationInFrames: args.durationFrames == null ? defaultDurationFrames : Number(args.durationFrames),
      workRoot,
      runtimeRoot: args.runtimeRoot ? path.resolve(args.runtimeRoot) : undefined,
      cacheDir,
      browser: args.browser ? path.resolve(args.browser) : undefined,
      manifestPath: manifest,
    });
    process.stdout.write(`OUTPUT ${result.outputPath}\nSTYLE ${args.query}\nMANIFEST ${result.manifestPath}\nSHA256 ${result.output.sha256}\n`);
    return true;
  }
  if (!["list", "browse", "overview", "search", "get", "describe", "selection", "fulltext", "hash"].includes(subcommand)) {
    throw new Error(`Unknown style-library command ${subcommand || "(none)"}`);
  }
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const library = catalog.styleLibrary;
  const indexRelative = compatibility ? library?.compatibilityIndexPath : library?.indexPath;
  const expectedCount = compatibility ? library?.compatibilityStyleCount : library?.styleCount;
  const expectedPreviews = compatibility ? library?.compatibilityPreviewCount : library?.previewCount;
  if (!library || library.format !== "laohu.motion.style-library/1"
      || !Number.isInteger(expectedCount) || expectedCount < 1
      || !Number.isInteger(expectedPreviews) || expectedPreviews < 0
      || (compatibility && !indexRelative)) {
    throw new Error(`Motion catalog does not declare a valid ${compatibility ? "compatibility" : "ordinary"} style index`);
  }
  const script = path.resolve(skillDir, library.cli);
  const index = path.resolve(skillDir, indexRelative);
  if (!isWithin(skillDir, script) || !isWithin(skillDir, index)) throw new Error("Style library CLI/index must stay inside the Motion Skill");
  const styleIndex = JSON.parse(await fs.readFile(index, "utf8"));
  if (styleIndex.format !== library.format || styleIndex.coverage?.styleCount !== expectedCount
      || styleIndex.coverage?.previewCount !== expectedPreviews || !Array.isArray(styleIndex.entries)
      || styleIndex.entries.length !== expectedCount) {
    throw new Error(`${compatibility ? "Compatibility" : "Ordinary"} style index coverage disagrees with templates/catalog.json`);
  }
  const indexBytes = await fs.readFile(index);
  const expectedIndexHash = compatibility ? library.compatibilityIndexSha256 : library.indexSha256;
  if (!expectedIndexHash || sha256(indexBytes) !== expectedIndexHash) {
    throw new Error(`${compatibility ? "Compatibility" : "Ordinary"} style index SHA-256 disagrees with templates/catalog.json`);
  }
  if (!compatibility && styleIndex.entries.some((row) => row.kind !== "style-reference"
      || row.route?.kind !== "reference-style" || row.route.callable !== false || row.selectionEligible !== true)) {
    throw new Error("Ordinary style index contains a non-reference or non-selectable route");
  }
  if (compatibility && styleIndex.entries.some((row) => row.route?.kind !== "remotion-canvas-function"
      || row.route.callable !== true)) {
    throw new Error("Compatibility style index may expose only explicitly registered callable legacy functions");
  }
  const projectRoot = path.resolve(skillDir, "../../..");
  const child = spawnSync("python3", [script, subcommand, "--index", index, ...styleArgs], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
  if (child.error) throw child.error;
  if (child.stdout && subcommand === "describe") {
    const described = JSON.parse(child.stdout);
    const sourceRow = described;
    described.contentCapability = await styleContentCapability(sourceRow, catalog);
    const metadata = sourceRow.metadata || {};
    const summary = sourceRow.resourceSummary || {};
    const excerptText = ["materials", "actions", "camera", "composition", "sequence", "conditions"]
      .flatMap((facet) => Array.isArray(summary[facet]) ? summary[facet] : [])
      .map((item) => item?.text)
      .filter(Boolean);
    const styleQuery = [sourceRow.name, metadata.look, metadata.fit, metadata.keywords, metadata.style, ...excerptText]
      .filter(Boolean).join(" ");
    const terms = discoveryTerms({ query: styleQuery }).filter((term) => {
      if (/^[\u3400-\u9fff]+$/u.test(term)) return term.length > 1;
      if (/^\d+$/.test(term)) return false;
      return (term.length >= 4 || ["cad", "bom", "pbr", "3d"].includes(term)) && !STYLE_CONSUMER_STOP_WORDS.has(term);
    });
    const related = [
      ...(catalog.templates || []).map((entry) => discoveryProductionCard(entry, "template", terms, {})),
      ...(catalog.effects || []).map((entry) => discoveryProductionCard(entry, "effect", terms, {})),
    ].filter(Boolean).sort((a, b) => b.match.score - a.match.score || a.id.localeCompare(b.id));
    described.registeredConsumers = related.map((card) => {
      const entry = (card.itemType === "template" ? catalog.templates : catalog.effects)
        .find((candidate) => (candidate.productionId || candidate.id) === card.id || candidate.id === card.id);
      return {
        id: card.id,
        itemType: card.itemType,
        title: card.title,
        availability: card.availability,
        rendererRegistered: card.rendererRegistered,
        renderer: card.renderer,
        purpose: card.purpose,
        inputRequirements: entry?.inputRequirements || [],
        conditions: card.conditions,
        parameters: entry?.parameters || null,
        match: card.match,
        command: card.nextStep.command,
        relationMeaning: "lexical relation to this resource's declared metadata/source excerpts; inspect show and compare against the current shot before selecting",
      };
    });
    if (described.route?.kind === "remotion-canvas-function") {
      described.callableConsumer = {
        renderer: described.route.renderer,
        componentPath: described.route.componentPath,
        sourceFunction: described.route.sourceFunction,
        sharedHelperPath: described.route.sharedHelperPath,
        dependencies: sourceRow.dependencies || [],
        command: described.route.command,
        status: "registered-source-function; rendering this function does not itself add it to a Film timeline",
      };
    }
    described.consumerLookup = {
      method: "lexical lookup against registered catalog purpose/content/conditions",
      aestheticSelection: false,
      nextStep: `node scripts/templates.mjs discover --query "<当前镜头的观看关系 材料 动作/力度 外观>" --json`,
      note: "A source prompt is reference material. These related consumers are real registered entries to inspect, not proof that they implement this resource's full treatment.",
    };
    process.stdout.write(`${JSON.stringify(described, null, 2)}\n`);
  } else if (child.stdout) {
    const jsonOutputCommands = new Set(["list", "browse", "overview", "search", "get"]);
    let parsed = null;
    if (jsonOutputCommands.has(subcommand)) {
      try { parsed = JSON.parse(child.stdout); } catch {}
    }
    if (parsed !== null) {
      const decorated = await decorateStyleOutput(parsed, styleIndex, catalog);
      process.stdout.write(`${JSON.stringify(decorated, null, 2)}\n`);
    } else {
      process.stdout.write(child.stdout);
      if (["list", "browse", "overview"].includes(subcommand)) {
        process.stdout.write(compatibility
          ? "\n兼容内容映射：F1/F2 接受真实结构化数据，A1 需要调用者文本；其余来源函数按原接口运行。演示可渲染不等于已接入本片内容。\n"
          : "\n风格参考提示：普通库中的条目都不提供渲染器。用 `styles fulltext --query <ID>` 读完整原文，再由本地 Showreel 工程实现本片参数。\n");
      }
    }
  }
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.status !== 0) throw new Error(`Style library command failed with exit code ${child.status}`);
  return true;
}

const STYLE_CONTENT_CAPABILITY_CACHE = new Map();
const STYLE_CONTENT_FIELD_MEANING = Object.freeze({
  parentText: "调用者传入的完整文本原样进入来源函数的 PARENT 变量；该字段是屏显内容，不代表其他视觉数据也被替换。",
  title: "F1 图表标题。",
  "data[].label": "F1 每个数据项显示的类别标签。",
  "data[].value": "F1 每个数据项的数值；来源机制将其映射到固定 0–60 纵轴范围。",
  "nodes[].key": "F2 节点的真实名称，也是关系端点引用键。",
  "nodes[].x": "F2 节点横向归一化位置，适配器限制为 0.1–0.9。",
  "nodes[].y": "F2 节点纵向归一化位置，适配器限制为 0.1–0.9。",
  "edges[].from": "F2 关系起点，必须引用已有节点。",
  "edges[].to": "F2 关系终点，必须引用不同的已有节点。",
  "edges[].label": "F2 箭头旁显示的真实关系文字。",
  "edges[].at": "F2 来源动画时钟内该关系开始显现的秒数。",
  focalKey: "F2 被来源函数作为焦点强调的节点键。",
  highlightLabel: "F2 被来源函数强调的关系文字，必须对应唯一一条关系。",
});

async function styleContentCapability(row, catalog) {
  if (STYLE_CONTENT_CAPABILITY_CACHE.has(row.id)) return STYLE_CONTENT_CAPABILITY_CACHE.get(row.id);
  const route = row.route || {};
  const callable = route.kind === "remotion-canvas-function" && route.callable === true;
  const placeholder = route.kind === "source-placeholder";
  if (!callable) {
    const capability = {
      mode: placeholder ? "empty-source-placeholder" : "source-only-reference",
      demoMode: null,
      consumedContentFields: [],
      contentFieldMeaning: {},
      productionAdapterId: null,
      renderer: null,
      evidence: { sourcePath: row.sourcePath || null, sourceSha256: row.sourceSha256 || null },
      note: placeholder
        ? "Empty source record: no function, content fields, or production consumer are registered."
        : route.kind === "reference-style"
          ? "This complete style card informs native Showreel direction and shot design. It has no one-click renderer; Motion implements its selected visual parameters in the local deterministic project."
          : "Original prompt may inform a decision, but this row has no callable source function or content adapter.",
    };
    STYLE_CONTENT_CAPABILITY_CACHE.set(row.id, capability);
    return capability;
  }

  const adapterSpec = STYLE_CONTENT_ADAPTER_MANIFEST.styles[row.id];
  const rendererApi = await import("../templates/adapters/video-shotcraft-remotion.mjs");
  const renderWithoutInputs = await rendererApi.prepareStyleCodeSpec({ styleId: row.id }).then(
    (prepared) => prepared,
    (error) => {
      if (/requires nonempty --text material/.test(error.message)) return null;
      throw error;
    },
  );
  const withParentText = await rendererApi.prepareStyleCodeSpec({ styleId: row.id, parentText: "本片待映射文本" });
  const parentTextFields = withParentText.contentBinding.consumedFields || [];
  let mode = "fixed-source-semantics";
  let demoMode = renderWithoutInputs?.contentBinding.demoMode ?? false;
  let consumedContentFields = parentTextFields;
  let productionAdapterId = null;
  let sourceEvidence = {
    sourcePath: row.sourcePath || null,
    sourceSha256: row.sourceSha256 || null,
    sourceFunction: route.sourceFunction || null,
    sourceFunctionSha256: withParentText.sourceCode.sourceCodeHash,
  };
  let note = "Registered source function; actual source input inspection found no structured content consumer. A successful demo render does not adapt the source to this work.";

  if (adapterSpec) {
    if (row.sourceSha256 !== adapterSpec.sourceSha256) throw new Error(`${row.id} indexed source hash differs from the source-preserving content adapter manifest`);
    const consumer = (catalog.templates || []).find((entry) =>
      (entry.productionId || entry.id) === "laohu-style-code-canvas" && entry.styleIds?.includes(row.id));
    if (!consumer || consumer.availability !== "available" || consumer.renderer !== "video-shotcraft-remotion") {
      throw new Error(`${row.id} structured content adapter has no matching available Film consumer in catalog`);
    }
    const sampleContent = row.id === "F1"
      ? { title: "样例趋势", data: [{ label: "甲", value: 0 }, { label: "乙", value: 18 }] }
      : { nodes: [{ key: "甲", x: 0.25, y: 0.25 }, { key: "乙", x: 0.75, y: 0.75 }], edges: [{ from: "甲", to: "乙", label: "关联", at: 1 }], focalKey: "甲", highlightLabel: "关联" };
    const adapted = await rendererApi.prepareStyleCodeSpec({ styleId: row.id, content: sampleContent });
    if (adapted.contentBinding.status !== "structured-content-bound" || adapted.contentBinding.demoMode) {
      throw new Error(`${row.id} source content adapter did not bind its structured fields`);
    }
    mode = "structured-content-adapter";
    demoMode = true;
    consumedContentFields = adapted.contentBinding.consumedFields || [];
    productionAdapterId = consumer.productionId || consumer.id;
    sourceEvidence = {
      ...sourceEvidence,
      adapterManifestFormat: STYLE_CONTENT_ADAPTER_MANIFEST.format,
      adapterManifestSha256: STYLE_CONTENT_ADAPTER_MANIFEST_SHA256,
      sourceFenceSha256: adapted.sourceCode.sourceCodeHash,
      productionConsumer: productionAdapterId,
      contentBindingStatusWhenSupplied: adapted.contentBinding.status,
    };
    note = "Without structured content, direct preview remains the source demo. Supplying the listed fields binds caller data through the pinned source-preserving adapter and the registered Film /2 consumer.";
  } else if (parentTextFields.includes("parentText")) {
    mode = "parent-text-only";
    demoMode = false;
    consumedContentFields = ["parentText"];
    note = "This source consumes only the caller-provided PARENT text; no other structured content fields are mapped. Rendering requires nonempty text.";
  }

  const capability = {
    mode,
    demoMode,
    consumedContentFields,
    contentFieldMeaning: Object.fromEntries(consumedContentFields.map((field) => [field, STYLE_CONTENT_FIELD_MEANING[field] || "Passed into this field exactly as validated by the registered source adapter."])),
    productionAdapterId,
    renderer: route.renderer || null,
    evidence: sourceEvidence,
    note,
  };
  STYLE_CONTENT_CAPABILITY_CACHE.set(row.id, capability);
  return capability;
}

async function decorateStyleOutput(value, styleIndex, catalog) {
  const rowsById = new Map((styleIndex.entries || []).map((row) => [row.id, row]));
  async function visit(item) {
    if (Array.isArray(item)) return Promise.all(item.map(visit));
    if (!item || typeof item !== "object") return item;
    const styleRow = typeof item.id === "string" ? rowsById.get(item.id) : null;
    if (styleRow) item.contentCapability = await styleContentCapability(styleRow, catalog);
    else for (const value of Object.values(item)) await visit(value);
    return item;
  }
  return visit(value);
}

const STYLE_CONSUMER_STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "to", "in", "on", "for", "as", "from", "with", "at", "by", "it", "this", "that",
  "its", "is", "are", "be", "was", "were", "own", "your", "user", "we", "our", "not", "no", "do", "does", "did",
  "where", "what", "when", "how", "before", "after", "again", "into", "one", "two", "each", "every", "all", "some",
  "like", "than", "then", "there", "here", "any", "other", "same", "only", "more", "most", "very", "also", "still",
  "thing", "things", "object", "objects", "part", "parts", "product", "products", "file", "files", "source", "scene",
  "film", "text", "label", "labels", "line", "lines", "frame", "camera", "layer", "layers", "material", "materials",
  "draw", "drawn", "drawing", "render", "style", "visual", "whole", "number", "numbers", "real", "making",
]);

function parseArgs(argv) {
  const command = argv.shift();
  const flags = new Set(["--all", "--research", "--json", "--software", "--hardware", "--no-frequent-readback"]);
  const values = new Set(["--status", "--type", "--intent", "--family", "--target", "--runtime", "--source", "--source-root", "--category", "--use", "--content", "--content-json", "--needs", "--input", "--spec", "--output", "--time", "--samples", "--assets-root", "--cache-dir", "--manifest", "--browser", "--ffmpeg", "--work-root", "--runtime-root", "--film-blueprint", "--query", "--text", "--duration-frames", "--limit"]);
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

async function readCatalog({ includeMaintenance = false, includeResearch = false } = {}) {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  if (![1, 2].includes(catalog.schemaVersion) || !Array.isArray(catalog.templates)
      || !Array.isArray(catalog.effectLibraries) || !Array.isArray(catalog.methods)) {
    throw new Error(`Unsupported or invalid catalog schema ${catalog.schemaVersion}; scripts/templates.mjs supports versions 1 and 2: ${catalogPath}`);
  }
  if (catalog.schemaVersion === 2 && !Array.isArray(catalog.effects)) throw new Error(`Catalog schema 2 requires an effects array: ${catalogPath}`);
  catalog.effects ||= [];
  catalog.sources = Array.isArray(catalog.sources) ? catalog.sources : [];
  catalog.sourceTreeIndex = [];
  catalog.referenceCatalog = { entries: [] };
  if (includeMaintenance || includeResearch) {
    const ledger = JSON.parse(await fs.readFile(maintenanceSourceLedgerPath, "utf8"));
    if (ledger.format !== "laohu.motion.maintenance-source-ledger/1" || !Array.isArray(ledger.sources)
        || !Array.isArray(ledger.sourceOnlyTemplates) || !Array.isArray(ledger.sourceTreeIndex)
        || !Array.isArray(ledger.referenceCatalog?.entries)) {
      throw new Error(`Invalid Motion maintenance source ledger: ${maintenanceSourceLedgerPath}`);
    }
    catalog.sources = ledger.sources;
    catalog.sourceTreeIndex = ledger.sourceTreeIndex;
    catalog.referenceCatalog = ledger.referenceCatalog;
    catalog.otherSources = ledger.otherSources || [];
    if (includeResearch) catalog.templates = [...catalog.templates, ...ledger.sourceOnlyTemplates];
  }
  return catalog;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function sourceById(catalog, sourceId, sourceRoot = null) {
  const source = catalog.sources.find((entry) => entry.id === sourceId);
  if (!source) throw new Error(`Unknown source ${sourceId}`);
  if (!sourceRoot || !source.sourcePathPrefix) return { source, vendorRoot: null };
  if (!path.isAbsolute(sourceRoot)) throw new Error("--source-root must be an absolute path to the maintenance source snapshot root");
  const originalPrefix = "templates/upstream/";
  const relativeRoot = source.sourcePathPrefix.startsWith(originalPrefix)
    ? source.sourcePathPrefix.slice(originalPrefix.length)
    : source.id === "fy-code-animation" && source.sourcePathPrefix === "implementations"
      ? "implementations"
      : null;
  if (!relativeRoot) throw new Error(`Source path prefix is not a recognized pinned snapshot mapping: ${source.sourcePathPrefix}`);
  const snapshotRoot = path.resolve(sourceRoot);
  const vendorRoot = path.resolve(snapshotRoot, relativeRoot);
  if (!isWithin(snapshotRoot, vendorRoot)) throw new Error(`Source snapshot path escapes --source-root: ${source.sourcePathPrefix}`);
  return { source, vendorRoot };
}

async function verifyFyCodeAnimationEntry(entry, source) {
  const issues = [];
  let checkedFiles = 0;
  const add = (pathValue, error) => issues.push({templateId:entry.id, ...(pathValue ? {path:pathValue} : {}), error});
  const expectedCommit = "d9a545afa393b2ffab4f36e87371691daf8e502c";
  const runtimeRoot = path.resolve(skillDir, "templates/runtime/laohu-remotion");
  const templatesRoot = path.resolve(skillDir, "templates");
  const declaration = source?.localRuntime;
  if (!source || source.commit !== expectedCommit || source.sourcePathPrefix !== "implementations"
      || declaration?.manifestPath !== "templates/runtime/laohu-remotion/fy-code-animation-closure.json"
      || !/^[a-f0-9]{64}$/.test(declaration?.manifestSha256 || "")) {
    add(null, "fy-code-animation source and local closure pins are incomplete");
    return {issues, checkedFiles};
  }
  if (entry.availability !== "conditional" || entry.callable !== true || !entry.renderPreconditions?.length) {
    add(null, "fy-code-animation Remotion entries must remain conditional, callable, and declare render preconditions");
  }
  if (!entry.id?.startsWith("laohu-") || !entry.productionId?.startsWith("laohu-")) {
    add(null, "fy-code-animation provenance must use a project-owned local catalog and production ID");
  }
  if (entry.adapter?.entrypoint !== "templates/adapters/video-shotcraft-entry.tsx") {
    add(entry.adapter?.entrypoint || null, "fy-code-animation entry must route through the shared local Remotion composition");
  } else {
    const entrypoint = path.resolve(skillDir, entry.adapter.entrypoint);
    if (!isWithin(templatesRoot, entrypoint)) add(entry.adapter.entrypoint, "fy-code-animation entrypoint escapes templates");
    else try { await fs.access(entrypoint); checkedFiles += 1; }
    catch { add(entry.adapter.entrypoint, "fy-code-animation local Remotion entrypoint is missing"); }
  }
  const manifestPath = path.resolve(skillDir, declaration.manifestPath);
  let manifest = null;
  try {
    if (!isWithin(runtimeRoot, manifestPath)) throw new Error("closure manifest escapes the local runtime");
    const bytes = await fs.readFile(manifestPath);
    checkedFiles += 1;
    if (sha256(bytes) !== declaration.manifestSha256) throw new Error("closure manifest SHA-256 differs from catalog pin");
    manifest = JSON.parse(bytes.toString("utf8"));
    if (manifest.format !== "laohu.motion.local-remotion-closure/1" || manifest.source?.id !== source.id
        || manifest.source?.commit !== source.commit || !Array.isArray(manifest.files)) throw new Error("closure manifest source identity or file map is invalid");
  } catch (error) { add(declaration.manifestPath, `could not verify fy-code-animation local closure: ${error.message}`); }
  if (!manifest) return {issues, checkedFiles};

  const sourceFiles = new Map((source.files || []).map((row) => [row.path, row]));
  const mappings = new Map(manifest.files.map((row) => [row.sourcePath, row]));
  const verifyModule = async (relative) => {
    if (typeof relative !== "string" || path.posix.isAbsolute(relative) || relative.split("/").includes("..")) {
      add(relative, "fy-code-animation closure contains an unsafe relative source path");
      return null;
    }
    const pin = sourceFiles.get(relative);
    const sourcePath = `${source.sourcePathPrefix}/${relative}`;
    const mapping = mappings.get(sourcePath);
    if (!pin || !mapping || mapping.sourceSha256 !== pin.sha256) {
      add(sourcePath, "fy-code-animation source/local mapping is missing or differs from the pinned source hash");
      return null;
    }
    const localPath = path.resolve(skillDir, mapping.localPath || "");
    if (!isWithin(runtimeRoot, localPath)) {
      add(mapping.localPath, "fy-code-animation local module escaped templates/runtime/laohu-remotion");
      return null;
    }
    try {
      const stat = await fs.lstat(localPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("local module must be a regular file");
      const bytes = await fs.readFile(localPath);
      checkedFiles += 1;
      if (sha256(bytes) !== mapping.localSha256) throw new Error("local module SHA-256 differs from closure pin");
    } catch (error) { add(mapping.localPath, `could not verify fy-code-animation local module: ${error.message}`); }
    return mapping;
  };

  for (const relative of [...new Set([...(entry.closure || []), ...(entry.sourceComponents || [])])]) await verifyModule(relative);
  const sourceExternalFiles = new Map((source.externalFiles || []).map((row) => [row.path, row]));
  for (const external of manifest.externalFiles || []) {
    const pin = sourceExternalFiles.get(external.sourcePath);
    if (!pin || pin.sha256 !== external.sourceSha256 || pin.gitBlob !== external.sourceGitBlob) {
      add(external.sourcePath, "fy-code-animation external support-file mapping differs from the source snapshot pin");
      continue;
    }
    const helperPath = path.resolve(skillDir, external.localPath || "");
    const helperRoot = path.resolve(skillDir, "scripts");
    if (!isWithin(helperRoot, helperPath)) {
      add(external.localPath, "fy-code-animation external support helper must remain under the local Motion scripts directory");
      continue;
    }
    try {
      const stat = await fs.lstat(helperPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("local support helper must be a regular file");
      const bytes = await fs.readFile(helperPath);
      checkedFiles += 1;
      if (sha256(bytes) !== external.localSha256) throw new Error("local support helper SHA-256 differs from closure pin");
    } catch (error) { add(external.localPath, `could not verify fy-code-animation external support helper: ${error.message}`); }
  }
  const mappedExternalPaths = new Set((manifest.externalFiles || []).map((row) => row.sourcePath));
  for (const external of sourceExternalFiles.values()) {
    if (!mappedExternalPaths.has(external.path)) add(external.path, "fy-code-animation closure omits a pinned external source support file");
  }
  const component = entry.component;
  if (!component?.path || !component?.exportName || component.kind !== "local-effect") {
    add(component?.path || null, "fy-code-animation entry must name one local-effect component and export");
    return {issues, checkedFiles};
  }
  const localCandidate = (value) => {
    if (typeof value !== "string") return null;
    const relative = value.startsWith(".agents/skills/laohu-motion/") ? value.slice(".agents/skills/laohu-motion/".length) : value;
    if (path.posix.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) return null;
    const absolute = path.resolve(skillDir, relative);
    return isWithin(templatesRoot, absolute) ? absolute : null;
  };
  const actualLocalPath = component.local === true ? localCandidate(component.path) : null;
  if (component.local === true && !actualLocalPath) add(component.path, "fy-code-animation component path escapes the local templates tree");
  const sourcePathValue = String(entry.sourcePath || "");
  if (component.local === true) {
    const declaredLocalPath = sourcePathValue.startsWith("local:") ? localCandidate(sourcePathValue.slice("local:".length)) : null;
    const adapterLocalPath = localCandidate(entry.adapter?.localPath);
    if (!declaredLocalPath || declaredLocalPath !== actualLocalPath || !adapterLocalPath || adapterLocalPath !== actualLocalPath) {
      add(sourcePathValue || component.path, "local fy-code-animation component, sourcePath, and adapter localPath must identify the same project-owned file");
    }
    if (!/^[a-f0-9]{64}$/.test(component.sha256 || "") || component.sha256 !== component.localSha256) {
      add(component.path, "local fy-code-animation component needs one exact SHA-256 pin");
    }
    if (!(entry.sourceComponents || []).length) add(component.path, "local authored fy-code-animation entries must declare their complete sourceComponents closure");
    if (actualLocalPath) try {
      const stat = await fs.lstat(actualLocalPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("component must be a regular file");
      const bytes = await fs.readFile(actualLocalPath);
      checkedFiles += 1;
      if (sha256(bytes) !== component.sha256) add(component.path, "local fy-code-animation component SHA-256 differs from its catalog pin");
    } catch (error) { add(component.path, `could not inspect local fy-code-animation component: ${error.message}`); }
  } else {
    const prefix = `${source.sourcePathPrefix}/`;
    const relative = component.path.startsWith(prefix) ? component.path.slice(prefix.length) : null;
    const mapping = relative ? await verifyModule(relative) : null;
    if (!relative || sourcePathValue !== component.path) add(component.path, "fy-code-animation source component path must use its pinned implementations/ source path");
    if (!relative || !(entry.closure || []).includes(relative) || !mapping
        || mapping.sourceSha256 !== component.sha256 || mapping.localPath !== component.localPath
        || mapping.localSha256 !== component.localSha256) {
      add(component.path, "fy-code-animation component source/local hashes must match the declared recursive closure");
    }
    const adapterPath = localCandidate(entry.adapter?.localPath);
    const expectedAdapterPath = localCandidate(component.localPath);
    if (!adapterPath || adapterPath !== expectedAdapterPath) add(entry.adapter?.localPath || component.path, "fy-code-animation adapter localPath must match the pinned local component mapping");
  }
  if (Array.isArray(manifest.localConsumers)) for (const consumer of manifest.localConsumers) {
    const consumerPath = localCandidate(consumer.localPath);
    if (!consumerPath) { add(consumer.localPath, "fy-code-animation local consumer escapes the local templates tree"); continue; }
    try {
      const bytes = await fs.readFile(consumerPath);
      checkedFiles += 1;
      if (sha256(bytes) !== consumer.sha256) add(consumer.localPath, "fy-code-animation local authoring consumer SHA-256 differs from closure pin");
    } catch (error) { add(consumer.localPath, `could not verify fy-code-animation local authoring consumer: ${error.message}`); }
  }
  return {issues, checkedFiles};
}

async function readLocalRuleRef(reference) {
  if (typeof reference !== "string" || !/^references\/[A-Za-z0-9._/-]+#[A-Za-z0-9._-]+$/.test(reference)) {
    throw new Error("localRuleRef must use references/<file>.md#<stable-anchor>");
  }
  const [relative, anchor] = reference.split("#");
  const referenceRoot = path.resolve(skillDir, "references");
  const file = path.resolve(skillDir, relative);
  if (!isWithin(referenceRoot, file) || path.extname(file).toLowerCase() !== ".md") throw new Error("localRuleRef must resolve to a Markdown file below the local references directory");
  const realRoot = await fs.realpath(referenceRoot);
  const realFile = await fs.realpath(file);
  if (!isWithin(realRoot, realFile)) throw new Error("localRuleRef resolves outside the local references directory");
  const contents = await fs.readFile(realFile, "utf8");
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marker = new RegExp(`<a\\s+id=["']${escaped}["']\\s*><\\/a>`, "i");
  const match = marker.exec(contents);
  if (!match) throw new Error(`localRuleRef anchor #${anchor} is missing from ${relative}`);
  const nextAnchor = /<a\s+id=["'][^"']+["']\s*><\/a>/gi;
  nextAnchor.lastIndex = match.index + match[0].length;
  const next = nextAnchor.exec(contents);
  const section = contents.slice(match.index, next ? next.index : contents.length).trim();
  if (!section) throw new Error(`localRuleRef anchor #${anchor} has an empty section`);
  return { relative, anchor, contents: section };
}

function matchesCatalogId(entry, id) {
  return id === entry.id || id === entry.productionId || (isLocalMethod(entry) && id === localMethodId(entry))
    || (Array.isArray(entry.aliases) && entry.aliases.includes(id))
    || (Array.isArray(entry.legacyIds) && entry.legacyIds.includes(id));
}

function productionDisplayId(entry) {
  if (typeof entry?.productionId === "string" && entry.productionId.trim()) return entry.productionId;
  if (isLocalMethod(entry)) return localMethodId(entry);
  return entry?.id || "unknown-template";
}

function productionRenderer(entry) {
  if (entry?.renderer === "native-om-template-source") return "native-scene";
  if (entry?.renderer === "native-style-scene") return "native-scene";
  if (entry?.renderer === "native-html-canvas-template") return "html-canvas-scene";
  if (entry?.renderer === "video-shotcraft-remotion") return "remotion-scene";
  return entry?.renderer;
}

function isLocalMethod(entry) {
  return (entry?.capability === "local-method" || entry?.kind === "style-profile") && typeof entry.localRuleRef === "string";
}

function localMethodId(entry) {
  return `style-${entry.name}`;
}

function templateById(catalog, id, args = {}) {
  // Research callers asking for an upstream profile by its real ID must not be
  // shadowed by a production method's legacy alias with the same string.
  if ((args.research || args.all) && id) {
    const exactReference = catalog.referenceCatalog.entries.find((item) => item.id === id);
    if (exactReference) return exactReference;
  }
  const entry = catalog.templates.find((item) => matchesCatalogId(item, id));
  if (entry) return entry;
  const method = (catalog.methods || []).find((item) => matchesCatalogId(item, id));
  if (method) return method;
  const reference = catalog.referenceCatalog.entries.find((item) => item.id === id || item.templateId === id || (isLocalMethod(item) && localMethodId(item) === id));
  if (reference) return reference;
  const effect = catalog.effectLibraries.find((item) => matchesCatalogId(item, id));
  if (effect) return effect;
  const localEffect = (catalog.effects || []).find((item) => matchesCatalogId(item, id));
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

const SELECTED_LOCAL_NATIVE_CLIPS = new Set([
  "laohu-motion-t1-3b1b",
  "laohu-motion-t2-keynote-ui",
  "laohu-motion-t3-finance-chart",
  "laohu-motion-y1-kurzgesagt",
  "laohu-motion-y2-vox",
  "laohu-motion-y3-whiteboard",
  "laohu-motion-y4-storytime",
  "laohu-motion-y5-kinetic-type",
]);

async function verifySelectedNativeClipRuntime(catalog, entry) {
  if (!SELECTED_LOCAL_NATIVE_CLIPS.has(entry.id)) return null;
  const declared = entry.localRuntime;
  if (!declared || typeof declared.directory !== "string" || typeof declared.manifestPath !== "string" || !/^[0-9a-f]{64}$/.test(declared.manifestSha256 || "")) {
    throw new Error(`${entry.id} has no pinned local selected-clip runtime; catalog localRuntime must declare directory, manifestPath, and manifestSha256`);
  }
  const templatesRoot = path.join(skillDir, "templates");
  const runtimeParent = path.join(templatesRoot, "runtime");
  const runtimeRoot = path.resolve(skillDir, declared.directory);
  const manifestPath = path.resolve(skillDir, declared.manifestPath);
  if (!isWithin(runtimeParent, runtimeRoot) || !isWithin(runtimeRoot, manifestPath)) throw new Error(`${entry.id} localRuntime paths must stay inside templates/runtime and its declared directory`);
  const templatesStat = await fs.lstat(templatesRoot).catch((error) => { throw new Error(`${entry.id} templates root is missing: ${error.message}`); });
  if (!templatesStat.isDirectory() || templatesStat.isSymbolicLink()) throw new Error(`${entry.id} templates root must be a real directory, not a symlink`);
  const templatesRootReal = await fs.realpath(templatesRoot);
  const runtimeParentStat = await fs.lstat(runtimeParent).catch((error) => { throw new Error(`${entry.id} local runtime parent is missing: ${error.message}`); });
  if (!runtimeParentStat.isDirectory() || runtimeParentStat.isSymbolicLink()) throw new Error(`${entry.id} local runtime parent must be a real directory, not a symlink`);
  const runtimeParentReal = await fs.realpath(runtimeParent);
  if (!isWithin(templatesRootReal, runtimeParentReal)) throw new Error(`${entry.id} local runtime parent resolves outside templates`);
  const runtimeRootStat = await fs.lstat(runtimeRoot).catch((error) => { throw new Error(`${entry.id} local runtime directory is missing: ${error.message}`); });
  if (!runtimeRootStat.isDirectory() || runtimeRootStat.isSymbolicLink()) throw new Error(`${entry.id} local runtime root must be a real directory, not a symlink`);
  const runtimeRootReal = await fs.realpath(runtimeRoot);
  if (!isWithin(runtimeParentReal, runtimeRootReal)) throw new Error(`${entry.id} local runtime root resolves outside templates/runtime`);
  const manifestStat = await fs.lstat(manifestPath).catch((error) => { throw new Error(`${entry.id} local runtime manifest is missing: ${error.message}`); });
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error(`${entry.id} local runtime manifest must be a real file, not a symlink`);
  const manifestReal = await fs.realpath(manifestPath);
  if (!isWithin(runtimeRootReal, manifestReal)) throw new Error(`${entry.id} local runtime manifest resolves outside its declared directory`);
  const manifestBytes = await fs.readFile(manifestPath).catch((error) => { throw new Error(`${entry.id} local runtime manifest is missing: ${error.message}`); });
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== declared.manifestSha256) throw new Error(`${entry.id} local runtime manifest SHA-256 differs from catalog`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const source = catalog.sources.find((item) => item.id === entry.sourceId);
  if (!source || manifest.format !== "laohu.motion.selected-native-clip-runtime/1"
      || manifest.source?.id !== source.id || manifest.source?.commit !== source.commit
      || manifest.scope?.runtimeEntrypoint !== "clip.html" || manifest.scope?.servedRoot !== "/engine"
      || !manifest.scope?.templateIds?.includes(entry.id) || !manifest.scope?.grammars?.includes(entry.grammar)
      || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error(`${entry.id} local runtime manifest does not match its catalogued source, grammar, entrypoint, and file closure`);
  }
  const sourcePins = new Map((source.files || []).map((file) => [file.path, file]));
  const localPaths = new Set();
  const urlPins = new Map();
  const checkedFiles = [];
  for (const file of manifest.files) {
    const relative = file?.path;
    if (typeof relative !== "string" || !relative || path.posix.isAbsolute(relative) || relative.split(/[\\/]/).some((part) => !part || part === "." || part === "..") || relative.includes("\\") || localPaths.has(relative)) {
      throw new Error(`${entry.id} local runtime manifest has an unsafe or duplicate path`);
    }
    if (typeof file.urlPath !== "string" || !file.urlPath.startsWith("/engine/") || file.urlPath !== `/engine/${relative}` || urlPins.has(file.urlPath) || !/^[0-9a-f]{64}$/.test(file.sha256 || "")) {
      throw new Error(`${entry.id} local runtime manifest has an invalid served path or file hash for ${relative}`);
    }
    if (typeof file.sourcePath !== "string" || !/^[0-9a-f]{64}$/.test(file.sourceSha256 || "")) throw new Error(`${entry.id} local runtime manifest is missing pinned source attribution for ${relative}`);
    const sourcePin = sourcePins.get(file.sourcePath);
    if (!sourcePin || sourcePin.sha256 !== file.sourceSha256) throw new Error(`${entry.id} local runtime source attribution differs from the catalog source ledger for ${file.sourcePath}`);
    const absolute = path.resolve(runtimeRoot, relative);
    if (!isWithin(runtimeRoot, absolute)) throw new Error(`${entry.id} local runtime file escaped its declared directory: ${relative}`);
    const segments = relative.split("/");
    let cursor = runtimeRoot;
    for (const [index, segment] of segments.entries()) {
      cursor = path.join(cursor, segment);
      const stat = await fs.lstat(cursor).catch((error) => { throw new Error(`${entry.id} local runtime file is missing (${relative}): ${error.message}`); });
      if (stat.isSymbolicLink()) throw new Error(`${entry.id} local runtime path cannot traverse a symlink: ${relative}`);
      if (index < segments.length - 1 && !stat.isDirectory()) throw new Error(`${entry.id} local runtime parent path is not a directory: ${relative}`);
      if (index === segments.length - 1 && !stat.isFile()) throw new Error(`${entry.id} local runtime files must be regular files: ${relative}`);
    }
    const absoluteReal = await fs.realpath(absolute);
    if (!isWithin(runtimeRootReal, absoluteReal)) throw new Error(`${entry.id} local runtime file resolves outside its declared directory: ${relative}`);
    const bytes = await fs.readFile(absolute);
    const digest = sha256(bytes);
    if (digest !== file.sha256 || bytes.length !== file.bytes) throw new Error(`${entry.id} local runtime file differs from its closure manifest: ${relative}`);
    const pin = { sha256: file.sha256, sourcePath: file.sourcePath, sourceSha256: file.sourceSha256, mapping: file.mapping || "source-byte-copy" };
    urlPins.set(file.urlPath, pin);
    localPaths.add(relative);
    checkedFiles.push({ path: relative, sourcePath: file.sourcePath, sha256: digest, sourceSha256: file.sourceSha256, bytes: bytes.length, mapping: pin.mapping });
  }
  if (!urlPins.has("/engine/clip.html") || !urlPins.has(`/engine/clips/${entry.grammar}.js`)) throw new Error(`${entry.id} local runtime closure omits its HTML entrypoint or selected grammar`);
  const verification = {
    ok: true,
    kind: "selected-local-native-clip-closure",
    sourceId: source.id,
    sourceCommit: source.commit,
    closureManifestPath: declared.manifestPath,
    closureManifestSha256: manifestSha256,
    checkedFiles: checkedFiles.length,
    files: checkedFiles,
    issues: [],
    upstreamTreeRequiredAtRuntime: false,
  };
  return { runtimeRoot, manifest, manifestPath, manifestSha256, source, sourceVerification: verification, urlPins };
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

function requireNativeStyleScene(entry, action) {
  if (entry.renderer !== "native-style-scene" || entry.id !== "comic-pop-reaction" || !entry.adapter?.entrypoint) {
    throw new Error(`${entry.id} is catalogued as ${entry.renderer || "unconnected source"}; ${action} requires a local scene entrypoint`);
  }
}

async function verifyLocalStyleSceneRuntime(catalog, entry) {
  requireNativeStyleScene(entry, "runtime verification");
  const declaration = entry.localRuntime;
  const library = catalog.effectLibraries.find((row) => row.id === declaration?.libraryId);
  if (!declaration?.manifestPath || !/^[0-9a-f]{64}$/.test(declaration.manifestSha256 || "")
      || !library || library.localRuntime !== declaration.manifestPath
      || library.localRuntimeManifestSha256 !== declaration.manifestSha256) {
    throw new Error(`${entry.id} local scene closure is not fully pinned by both the template and effect-library records`);
  }
  const runtimeRoot = path.resolve(skillDir, "templates", "runtime");
  const manifestPath = path.resolve(skillDir, declaration.manifestPath);
  if (!isWithin(runtimeRoot, manifestPath)) throw new Error(`${entry.id} local scene closure manifest escapes templates/runtime`);
  const manifestBytes = await fs.readFile(manifestPath);
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== declaration.manifestSha256) throw new Error(`${entry.id} local scene closure manifest SHA-256 differs from catalog`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const source = catalog.sources.find((row) => row.id === entry.sourceId);
  if (!source || manifest.schemaVersion !== 1 || manifest.source?.id !== source.id || manifest.source?.commit !== source.commit) {
    throw new Error(`${entry.id} local scene closure source identity differs from its fixed catalog pin`);
  }
  const localLibrary = manifest.libraries?.[library.id];
  if (!Array.isArray(localLibrary?.loadOrder)
      || JSON.stringify(localLibrary.loadOrder.map((row) => row.sourcePath)) !== JSON.stringify(library.loadOrder)) {
    throw new Error(`${entry.id} local scene closure load order differs from the production library record`);
  }
  const pinned = new Map((source.files || []).map((row) => [row.path, row]));
  const modules = new Map((manifest.modules || []).map((row) => [row.sourcePath, row]));
  const fonts = new Map((manifest.fontAssets || []).map((row) => [row.sourcePath, row]));
  const files = [];
  const verify = async (row, pin, label) => {
    if (!row || !pin || row.sha256 !== pin.sha256 || (pin.gitBlob && row.gitBlob !== pin.gitBlob) || row.bytes !== pin.bytes) {
      throw new Error(`${label} does not match the catalogued source pin`);
    }
    const absolute = path.resolve(runtimeRoot, row.localPath || "");
    if (!row.localPath || !isWithin(runtimeRoot, absolute)) throw new Error(`${label} local path escapes templates/runtime`);
    const stat = await fs.lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} local path must be a real file`);
    const bytes = await fs.readFile(absolute);
    const digest = sha256(bytes);
    if (digest !== row.localSha256 || digest !== pin.sha256 || bytes.length !== row.bytes) {
      throw new Error(`${label} local bytes differ from the fixed source and local SHA pins`);
    }
    const result = { sourcePath: row.sourcePath, localPath: row.localPath, sha256: digest, bytes: bytes.length, license: pin.license || row.license || null };
    files.push(result);
    return result;
  };
  for (const item of localLibrary.loadOrder) {
    const row = modules.get(item.sourcePath);
    if (!row || row.localPath !== item.localPath) throw new Error(`${entry.id} closure module ${item.sourcePath} has no exact local mapping`);
    await verify(row, pinned.get(item.sourcePath), `Scene module ${item.sourcePath}`);
  }
  for (const font of library.fontDependencies || []) {
    const row = fonts.get(font.path);
    if (!row || !(row.families || []).includes(font.family)) throw new Error(`${entry.id} font ${font.family} has no exact local family mapping`);
    await verify(row, pinned.get(font.path), `Font ${font.family}`);
  }
  for (const sourcePath of ["scripts/engine/lib/fonts/OFL.txt"]) {
    const row = (manifest.licenseFiles || []).find((item) => item.sourcePath === sourcePath && item.localPath === "laohu-scenes/comic-pop-reaction/fonts/OFL.txt");
    if (!row) throw new Error(`${entry.id} font license text is absent from the local closure manifest`);
    await verify(row, pinned.get(sourcePath), `Font license ${sourcePath}`);
  }
  const sourceClosureSha256 = sha256(Buffer.from(JSON.stringify(files)));
  return {
    ok: true,
    kind: "local-style-scene-closure",
    sourceId: source.id,
    sourceCommit: source.commit,
    manifestPath: declaration.manifestPath,
    manifestSha256,
    sourceClosureSha256,
    checkedFiles: files.length,
    files,
    upstreamTreeRequiredAtRuntime: false,
  };
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
  if (spec.templateId != null && !matchesCatalogId(entry, spec.templateId)) throw new Error(`Spec templateId is ${JSON.stringify(spec.templateId)}; expected ${entry.id} or a declared alias`);
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

function computeCatalogCoverage(catalog) {
  const countBy = (rows, key) => rows.reduce((counts, row) => {
    const value = typeof key === "function" ? key(row) : row[key];
    const label = typeof value === "string" && value.trim() ? value : "(missing)";
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});
  const sourceOnlyTemplates = catalog.templates.filter((entry) => entry.availability === "source-only").map((entry) => ({
    id: entry.id, sourceId: entry.sourceId, sourcePath: entry.sourcePath || null, sourceGitBlob: entry.sourceGitBlob || null,
    gap: entry.limitations || (entry.parameters?.reason ? [entry.parameters.reason] : []),
    runtimeVerification: entry.runtimeVerification || null,
  }));
  const conditionalTemplates = catalog.templates.filter((entry) => entry.availability === "conditional").map((entry) => ({
    id: entry.id, sourceId: entry.sourceId, sourcePath: entry.sourcePath || null,
    conditions: entry.renderPreconditions || entry.conditions || entry.limitations || [],
    runtimeVerification: entry.runtimeVerification || null,
  }));
  const availableTemplates = catalog.templates.filter((entry) => entry.availability === "available").map((entry) => ({
    id: entry.id, sourceId: entry.sourceId, sourcePath: entry.sourcePath || null,
    runtimeVerification: entry.runtimeVerification || null,
  }));
  const effects = catalog.effects || [];
  const methods = catalog.effectLibraries.flatMap((library) => (library.functions || []).map((method) => ({ id: method.id, libraryId: library.id })));
  const uniqueMethodIds = [...new Set(methods.map((method) => method.id))].sort();
  const linkedMethodIds = new Set(effects.flatMap((effect) => effect.sourceFunctions || []));
  const fontDeclarations = [
    ...catalog.templates.flatMap((entry) => (entry.adapter?.fontAssets || []).map((font) => ({
      ownerKind: "template", ownerId: entry.id, family: font.family, sourceId: font.sourceId, path: font.path, use: font.use || null,
    }))),
    ...effects.flatMap((effect) => (effect.fontDependencies || []).map((font) => ({
      ownerKind: "effect", ownerId: effect.id, family: font.family, sourceId: effect.sourceRef?.sourceId || null, path: font.path, use: "renderer-source-font",
    }))),
  ];
  const fontsByPath = new Map();
  for (const font of fontDeclarations) {
    const key = `${font.sourceId}:${font.path}`;
    const row = fontsByPath.get(key) || { sourceId: font.sourceId, path: font.path, families: new Set(), templateIds: new Set(), effectIds: new Set(), uses: new Set() };
    if (font.family) row.families.add(font.family);
    if (font.ownerKind === "template") row.templateIds.add(font.ownerId);
    if (font.ownerKind === "effect") row.effectIds.add(font.ownerId);
    if (font.use) row.uses.add(font.use);
    fontsByPath.set(key, row);
  }
  const fonts = [...fontsByPath.values()].map((row) => ({
    sourceId: row.sourceId, path: row.path,
    families: [...row.families].sort(), templateIds: [...row.templateIds].sort(), effectIds: [...row.effectIds].sort(), uses: [...row.uses].sort(),
  })).sort((a, b) => `${a.sourceId}:${a.path}`.localeCompare(`${b.sourceId}:${b.path}`));
  const trees = catalog.sourceTreeIndex || [];
  const treeFileRows = trees.flatMap((tree) => tree.files || []);
  const references = catalog.referenceCatalog?.entries || [];
  return {
    format: "laohu.motion.catalog-computed-coverage/1",
    basis: "Independent catalog collections are counted separately at verify time. Do not add counts to imply runtime availability; each row retains its availability and runtimeVerification.",
    sourceRecords: { count: (catalog.sources || []).length, uniquePinnedRepositories: new Set((catalog.sources || []).map((source) => source.repository).filter(Boolean)).size },
    pinnedSourceFiles: {
      rows: (catalog.sources || []).reduce((sum, source) => sum + (source.files?.length || 0), 0),
      rowsWithPath: (catalog.sources || []).flatMap((source) => source.files || []).filter((file) => typeof file.path === "string" && file.path).length,
      rowsWithGitBlob: (catalog.sources || []).flatMap((source) => source.files || []).filter((file) => typeof file.gitBlob === "string" && file.gitBlob).length,
      rowsWithSha256: (catalog.sources || []).flatMap((source) => source.files || []).filter((file) => typeof file.sha256 === "string" && file.sha256).length,
      bySource: (catalog.sources || []).map((source) => ({ id: source.id, repository: source.repository || null, commit: source.commit || null, status: source.status || null, sourceTreeIndexId: source.sourceTreeIndexId || null, fileRows: source.files?.length || 0 })),
    },
    sourceTreeResearchIndex: {
      treeEntries: trees.length,
      declaredTrackedFiles: trees.reduce((sum, tree) => sum + (Number.isInteger(tree.trackedFiles) ? tree.trackedFiles : 0), 0),
      exactFileRows: treeFileRows.length,
      rowsWithGitBlob: treeFileRows.filter((row) => typeof row.gitBlob === "string" && row.gitBlob).length,
      treesWithFileRows: trees.filter((tree) => Array.isArray(tree.files) && tree.files.length > 0).length,
      treesWithoutFileRows: trees.filter((tree) => !Array.isArray(tree.files) || tree.files.length === 0).map((tree) => tree.id),
    },
    templates: {
      entries: catalog.templates.length,
      byAvailability: countBy(catalog.templates, "availability"),
      byRuntimeVerification: countBy(catalog.templates, "runtimeVerification"),
      available: availableTemplates, conditional: conditionalTemplates, sourceOnly: sourceOnlyTemplates,
    },
    effects: {
      entries: effects.length,
      byAvailability: countBy(effects, "availability"),
      byRuntimeVerification: countBy(effects, "runtimeVerification"),
      items: effects.map((effect) => ({
        id: effect.id, sourceId: effect.sourceRef?.sourceId || null, sourceFiles: effect.sourceRef?.files || [],
        availability: effect.availability, runtimeVerification: effect.runtimeVerification || null,
      })),
    },
    effectLibrariesAndMethods: {
      libraryEntries: catalog.effectLibraries.length,
      librariesByAvailability: countBy(catalog.effectLibraries, "availability"),
      methodIndexEntries: methods.length,
      uniqueSourceMethodIds: uniqueMethodIds.length,
      uniqueMethodsLinkedFromEffectRecords: uniqueMethodIds.filter((methodId) => linkedMethodIds.has(methodId)).length,
      methodsWithoutEffectRecord: uniqueMethodIds.filter((methodId) => !linkedMethodIds.has(methodId)),
      methodIndexEntriesByLibrary: catalog.effectLibraries.map((library) => ({ id: library.id, sourceId: library.sourceId, availability: library.availability, methodEntries: (library.functions || []).length })),
    },
    referenceIndex: {
      entries: references.length,
      byAvailability: countBy(references, "availability"),
      byRuntimeVerification: countBy(references, "runtimeVerification"),
      sourceOnly: references.filter((entry) => entry.availability === "source-only").map((entry) => ({
        id: entry.id, ...(entry.templateId == null ? {} : { templateId: entry.templateId }), sourceId: entry.sourceId,
        sourceTreeIndexId: entry.sourceTreeIndexId || null, repository: entry.repository || null,
        sourcePath: entry.sourcePath || entry.path || null, reason: entry.reason || null,
        gap: entry.gap || entry.reason || entry.summary || entry.description || null,
      })),
    },
    fontDependencies: {
      declarations: fontDeclarations.length,
      uniqueSourceAssets: fonts.length,
      uniqueAssetsBySource: fonts.reduce((counts, font) => { counts[font.sourceId] = (counts[font.sourceId] || 0) + 1; return counts; }, {}),
      assets: fonts,
    },
  };
}

async function verifyCatalog(catalog, { sourceRoot = null } = {}) {
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
  const registerTemplateIds = (entry, label) => {
    if (typeof entry.id !== "string" || !entry.id) {
      issues.push({ id: entry.id, error: `${label} has no stable ID` });
      return;
    }
    if (templateIds.has(entry.id)) issues.push({ id: entry.id, error: `${label} ID or alias collides with another catalog item` });
    else templateIds.add(entry.id);
    if (entry.productionId != null) {
      if (typeof entry.productionId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.productionId)) {
        issues.push({ id: entry.id, productionId: entry.productionId, error: `${label} productionId must be a stable lowercase function name` });
      } else if (entry.productionId === entry.id) {
        // Canonical ID is already registered above.
      } else if (templateIds.has(entry.productionId)) {
        issues.push({ id: entry.id, productionId: entry.productionId, error: `${label} productionId collides with another catalog item` });
      } else templateIds.add(entry.productionId);
    }
    if (entry.aliases == null) return;
    if (!Array.isArray(entry.aliases) || entry.aliases.some((alias) => typeof alias !== "string" || !alias.trim())
      || new Set(entry.aliases).size !== entry.aliases.length) {
      issues.push({ id: entry.id, error: `${label} aliases must be unique non-empty strings` });
      return;
    }
    for (const alias of entry.aliases) {
      if (templateIds.has(alias)) issues.push({ id: entry.id, alias, error: `${label} alias collides with another catalog ID or alias` });
      else templateIds.add(alias);
    }
  };

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
    const sourceFiles = Array.isArray(sourceEntry.files) ? sourceEntry.files : [];
    if (sourceEntry.sourcePathPrefix && !sourceFiles.length) issues.push({ sourceId: sourceEntry.id, error: "source snapshot mapping has no pinned files" });
    if (!sourceEntry.sourcePathPrefix && sourceFiles.length) issues.push({ sourceId: sourceEntry.id, error: "source has file pins but no sourcePathPrefix" });
    if (sourceFiles.some((file) => typeof file.path !== "string" || !file.path || !/^[0-9a-f]{64}$/.test(file.sha256 || "")
      || (file.gitBlob != null && !/^[0-9a-f]{40}$/.test(file.gitBlob)) || (file.bytes != null && (!Number.isInteger(file.bytes) || file.bytes < 0)))) {
      issues.push({ sourceId: sourceEntry.id, error: "source ledger contains an invalid path, SHA-256, Git blob, or byte count" });
    }
    const pinnedPaths = new Set(sourceFiles.map((file) => file.path));
    if (pinnedPaths.size !== sourceFiles.length) issues.push({ sourceId: sourceEntry.id, error: "duplicate file path in source hash ledger" });
    const snapshotExclusions = sourceEntry.sourceSnapshotExclusions ?? [];
    if (!Array.isArray(snapshotExclusions)) {
      issues.push({ sourceId: sourceEntry.id, error: "sourceSnapshotExclusions must be an array when declared" });
    }
    const snapshotExclusionPaths = new Set();
    for (const [exclusionIndex, exclusion] of (Array.isArray(snapshotExclusions) ? snapshotExclusions : []).entries()) {
      const label = `sourceSnapshotExclusions[${exclusionIndex}]`;
      if (!exclusion || typeof exclusion.path !== "string" || !exclusion.path.trim()
          || path.posix.isAbsolute(exclusion.path) || path.posix.normalize(exclusion.path) !== exclusion.path
          || exclusion.path === ".." || exclusion.path.startsWith("../")
          || !/^[0-9a-f]{64}$/.test(exclusion.sha256 || "")
          || !/^[0-9a-f]{40}$/.test(exclusion.gitBlob || "")
          || !Number.isInteger(exclusion.bytes) || exclusion.bytes < 0
          || typeof exclusion.reason !== "string" || !exclusion.reason.trim()) {
        issues.push({ sourceId: sourceEntry.id, path: exclusion?.path || null, error: `${label} must declare a normalized in-root path, source hashes, byte count and reason` });
        continue;
      }
      if (pinnedPaths.has(exclusion.path) || snapshotExclusionPaths.has(exclusion.path)) {
        issues.push({ sourceId: sourceEntry.id, path: exclusion.path, error: `${label} duplicates a pinned or previously excluded path` });
      }
      snapshotExclusionPaths.add(exclusion.path);
    }
    const externalSourceFiles = Array.isArray(sourceEntry.externalFiles) ? sourceEntry.externalFiles : [];
    const externalPaths = new Set();
    for (const [externalIndex, external] of externalSourceFiles.entries()) {
      const label = `externalFiles[${externalIndex}]`;
      if (!external || typeof external.path !== "string" || !external.path.trim()
          || path.posix.isAbsolute(external.path) || path.posix.normalize(external.path) !== external.path
          || external.path === ".." || external.path.startsWith("../")
          || !/^[0-9a-f]{64}$/.test(external.sha256 || "")
          || (external.gitBlob != null && !/^[0-9a-f]{40}$/.test(external.gitBlob))
          || !Number.isInteger(external.bytes) || external.bytes < 0) {
        issues.push({ sourceId: sourceEntry.id, path: external?.path || null, error: `${label} must declare a normalized snapshot-root path, SHA-256, Git blob, and byte count` });
        continue;
      }
      if (pinnedPaths.has(external.path) || snapshotExclusionPaths.has(external.path) || externalPaths.has(external.path)) {
        issues.push({ sourceId: sourceEntry.id, path: external.path, error: `${label} duplicates a pinned, excluded, or previously declared external path` });
      }
      externalPaths.add(external.path);
    }
    if (!sourceEntry.sourcePathPrefix || !sourceRoot) {
      continue;
    }
    const { vendorRoot } = sourceById(catalog, sourceEntry.id, sourceRoot);
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
    for (const exclusion of Array.isArray(snapshotExclusions) ? snapshotExclusions : []) {
      if (typeof exclusion?.path !== "string" || !snapshotExclusionPaths.has(exclusion.path)) continue;
      const target = path.resolve(vendorRoot, exclusion.path);
      if (!isWithin(vendorRoot, target)) {
        issues.push({ sourceId: sourceEntry.id, path: exclusion.path, error: "declared snapshot exclusion escapes source vendor root" });
        continue;
      }
      try {
        const bytes = await fs.readFile(target);
        checked += 1;
        checkedGitBlobs += 1;
        const actualSha = sha256(bytes);
        const actualBlob = gitBlob(bytes);
        if (bytes.length !== exclusion.bytes) issues.push({ sourceId: sourceEntry.id, path: exclusion.path, expectedBytes: exclusion.bytes, actualBytes: bytes.length, error: "source snapshot exclusion byte count mismatch" });
        if (actualSha !== exclusion.sha256) issues.push({ sourceId: sourceEntry.id, path: exclusion.path, expected: exclusion.sha256, actual: actualSha, error: "source snapshot exclusion sha256 mismatch" });
        if (actualBlob !== exclusion.gitBlob) issues.push({ sourceId: sourceEntry.id, path: exclusion.path, expected: exclusion.gitBlob, actual: actualBlob, error: "source snapshot exclusion Git blob mismatch" });
      } catch (error) {
        issues.push({ sourceId: sourceEntry.id, path: exclusion.path, error: error.message });
      }
    }
    for (const external of externalSourceFiles) {
      if (!external?.path || !externalPaths.has(external.path)) continue;
      const target = path.resolve(sourceRoot, external.path);
      if (!isWithin(sourceRoot, target)) {
        issues.push({ sourceId: sourceEntry.id, path: external.path, error: "external source snapshot path escapes --source-root" });
        continue;
      }
      try {
        const bytes = await fs.readFile(target);
        const actual = sha256(bytes);
        checked += 1;
        if (bytes.length !== external.bytes) issues.push({ sourceId: sourceEntry.id, path: external.path, expectedBytes: external.bytes, actualBytes: bytes.length, error: "external source snapshot byte count mismatch" });
        if (actual !== external.sha256) issues.push({ sourceId: sourceEntry.id, path: external.path, expected: external.sha256, actual, error: "external source snapshot sha256 mismatch" });
        if (external.gitBlob) {
          checkedGitBlobs += 1;
          const actualBlob = gitBlob(bytes);
          if (actualBlob !== external.gitBlob) issues.push({ sourceId: sourceEntry.id, path: external.path, expected: external.gitBlob, actual: actualBlob, error: "external source snapshot Git blob mismatch" });
        }
      } catch (error) {
        issues.push({ sourceId: sourceEntry.id, path: external.path, error: error.message });
      }
    }
    try {
      const actualPaths = new Set(await listFiles(vendorRoot));
      for (const filePath of actualPaths) if (!pinnedPaths.has(filePath) && !snapshotExclusionPaths.has(filePath)) {
        issues.push({ sourceId: sourceEntry.id, path: filePath, error: "vendored file is not listed as a pinned source file or an explicit snapshot exclusion" });
      }
      for (const filePath of pinnedPaths) if (!actualPaths.has(filePath)) issues.push({ sourceId: sourceEntry.id, path: filePath, error: "source hash ledger contains a file absent from vendorRoot" });
      for (const filePath of snapshotExclusionPaths) if (!actualPaths.has(filePath)) issues.push({ sourceId: sourceEntry.id, path: filePath, error: "declared snapshot exclusion is absent from vendorRoot" });
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
    registerTemplateIds(entry, "template");
    const verifiedStyleLibraryConsumer = entry.id === "laohu-style-code-canvas" && entry.sourceId === STYLE_LIBRARY_SOURCE_ID
      && catalog.styleLibrary?.format === "laohu.motion.style-library/1";
    if (!catalog.sources.some((source) => source.id === entry.sourceId) && !verifiedStyleLibraryConsumer) {
      issues.push({ templateId: entry.id, error: `unknown source ${entry.sourceId}` });
    }
    if (!["available", "conditional", "source-only"].includes(entry.availability)) issues.push({ templateId: entry.id, error: `invalid availability ${entry.availability}` });
    if (!entry.parameters || !entry.fixedMechanism) issues.push({ templateId: entry.id, error: "missing source interface or fixed mechanism" });
    if (entry.availability !== "source-only" && !entry.sourcePath) issues.push({ templateId: entry.id, error: "runnable template is missing sourcePath" });
    if (entry.sourcePath && entry.sourcePathVendored !== false) {
      const source = catalog.sources.find((item) => item.id === entry.sourceId);
      if (source?.files && entry.sourceId === "fy-code-animation") {
        if (entry.sourcePath.startsWith("local:")) {
          if (entry.component?.local !== true) issues.push({ templateId: entry.id, path: entry.sourcePath, error: "local sourcePath is reserved for a hash-pinned local fy-code-animation consumer" });
        } else {
          const prefix = `${source.sourcePathPrefix}/`;
          const relative = entry.sourcePath.startsWith(prefix) ? entry.sourcePath.slice(prefix.length) : null;
          if (!relative || !source.files.some((file) => file.path === relative)) issues.push({ templateId: entry.id, path: entry.sourcePath, error: "fy-code-animation sourcePath is not in its pinned implementation file ledger" });
        }
      } else if (source?.files && !source.files.some((file) => file.path === entry.sourcePath)) {
        issues.push({ templateId: entry.id, path: entry.sourcePath, error: "template sourcePath is not in its source file ledger" });
      }
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
      if (sourceRoot) try {
        const sourceHtml = await fs.readFile(path.join(sourceById(catalog, entry.sourceId, sourceRoot).vendorRoot, entry.sourcePath), "utf8");
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
      if (entry.sourceId === "fy-code-animation") {
        const source = catalog.sources.find((item) => item.id === entry.sourceId);
        const verified = await verifyFyCodeAnimationEntry(entry, source);
        issues.push(...verified.issues);
        checkedAdapterFiles += verified.checkedFiles;
        continue;
      }
      if (entry.sourceId === STYLE_LIBRARY_SOURCE_ID) {
        try {
          const verified = await verifyStyleLibraryEntry(catalog, entry);
          checkedAdapterFiles += 3 + verified.styles.length * 3;
        } catch (error) {
          issues.push({ templateId: entry.id, path: "templates/styles/index.json", error: `could not verify local 341-style source consumer: ${error.message}` });
        }
        continue;
      }
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
        if (entry.id === "video-shotcraft-list-stack-five"
            && (entry.component?.kind !== "source-adapted-full-scene" || !entry.fidelityModes?.includes("source-adapted-local") || entry.sourceDurationFrames !== 88)) {
          issues.push({ templateId: entry.id, error: "ListStackPress adaptation must remain a fixed-duration source-adapted-full-scene with source-adapted-local fidelity mode" });
        }
      }
      if (!entry.renderPreconditions?.length) issues.push({ templateId: entry.id, error: "Shotcraft conditional entry is missing render preconditions" });
      if (entry.derivedProvider) {
        try {
          const adapter = await import("../templates/adapters/video-shotcraft-remotion.mjs");
          const verified = await adapter.verifyDerivedPatchProviderForEntry(catalog, entry);
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

  for (const method of catalog.methods || []) {
    registerTemplateIds(method, "local method");
    if (method.capability !== "local-method" || method.kind !== "local-method" || method.renderable !== false
        || method.callable !== false || method.renderer !== "local-rule-method" || !method.name
        || method.id !== `style-${method.name}` || !method.localRuleRef || !method.readWhen) {
      issues.push({ methodId: method.id, error: "local method must have a stable style-* identity, exact local rule, use condition, and no renderer route" });
      continue;
    }
    try { await readLocalRuleRef(method.localRuleRef); }
    catch (error) { issues.push({ methodId: method.id, error: `local method rule is unavailable: ${error.message}` }); }
  }

  const effectIds = new Set();
  for (const effect of catalog.effects || []) {
    if (effectIds.has(effect.id)) issues.push({ effectId: effect.id, error: "duplicate local effect ID" });
    effectIds.add(effect.id);
    registerTemplateIds(effect, "local effect");
    if (!effect.id || !effect.sourceRef || !catalog.sources.some((source) => source.id === effect.sourceRef.sourceId)) issues.push({ effectId: effect.id, error: "local effect must reference a catalogued source" });
    if (!effect.adapter?.path || !effect.renderer || !effect.intent || !effect.family || !effect.target) issues.push({ effectId: effect.id, error: "local effect is missing its adapter, renderer, intent, family, or target contract" });
    if (!Array.isArray(effect.intents) || effect.intents.length === 0 || effect.intents.some((tag) => typeof tag !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(tag)) || new Set(effect.intents).size !== effect.intents.length) {
      issues.push({ effectId: effect.id, error: "local effect must declare unique stable intent tags for exact semantic filtering" });
    }
    if (!Array.isArray(effect.parameters) || !effect.timebase || !effect.phase || !Array.isArray(effect.controlledAttributes)) issues.push({ effectId: effect.id, error: "local effect is missing actual parameter, timebase, phase, or controlled-attribute details" });
    const wiredRenderers = new Set(["custom:laohu-motion-effects", "custom:laohu-motion-target", "custom:laohu-motion-transition", "custom:laohu-motion-operation", "custom:laohu-network-pass", "custom:laohu-motion-recipes", "custom:laohu-motion-postprocess"]);
    if (effect.availability === "available" && !wiredRenderers.has(effect.renderer)) issues.push({ effectId: effect.id, error: "available local effect has no wired renderer" });
    if (effect.adapter?.supportingRenderer && !wiredRenderers.has(effect.adapter.supportingRenderer)) issues.push({ effectId: effect.id, error: "local effect supporting renderer is not wired" });
    for (const sourcePath of effect.sourceRef?.files || []) {
      const source = catalog.sources.find((item) => item.id === effect.sourceRef.sourceId);
      const sourceTree = source?.sourceTreeIndexId ? catalog.sourceTreeIndex.find((tree) => tree.id === source.sourceTreeIndexId) : null;
      const isPinnedLedgerFile = source?.files?.some((file) => file.path === sourcePath);
      const isFixedIndexFile = sourceTree?.files?.some((file) => file.path === sourcePath);
      if (!isPinnedLedgerFile && !isFixedIndexFile) issues.push({ effectId: effect.id, path: sourcePath, error: "local effect source file is absent from both the pinned source ledger and its fixed sourceTreeIndex" });
    }
    const knownSourceMethods = new Set(catalog.effectLibraries.flatMap((library) => (library.functions || []).map((method) => method.id)));
    for (const methodId of effect.sourceFunctions || []) if (!knownSourceMethods.has(methodId)) issues.push({ effectId: effect.id, sourceFunction: methodId, error: "local effect source function is not indexed in an effect library" });
    if (effect.fontDependencies != null) {
      if (!Array.isArray(effect.fontDependencies)) {
        issues.push({ effectId: effect.id, error: "fontDependencies must be an array when declared" });
      } else {
        const source = catalog.sources.find((item) => item.id === effect.sourceRef?.sourceId);
        const seenFamilies = new Set();
        for (const [fontIndex, font] of effect.fontDependencies.entries()) {
          const label = `fontDependencies[${fontIndex}]`;
          if (!font || typeof font !== "object" || Array.isArray(font)
              || typeof font.family !== "string" || !font.family.trim()
              || typeof font.path !== "string" || !font.path.trim()
              || typeof font.weight !== "string" || !font.weight.trim()
              || typeof font.style !== "string" || !font.style.trim()) {
            issues.push({ effectId: effect.id, error: `${label} must declare family, pinned source path, weight and style` });
            continue;
          }
          if (seenFamilies.has(font.family)) issues.push({ effectId: effect.id, error: `${label} duplicates font family ${font.family}` });
          seenFamilies.add(font.family);
          if (!source?.files?.some((file) => file.path === font.path)
              || !(effect.sourceRef.files || []).includes(font.path)) {
            issues.push({ effectId: effect.id, path: font.path, error: `${label} must be included in both the source file ledger and this effect sourceRef` });
          }
        }
      }
    }
    try { await fs.access(path.resolve(skillDir, effect.adapter.path)); }
    catch { issues.push({ effectId: effect.id, path: effect.adapter.path, error: "local effect adapter is missing" }); }
    if (effect.sourceRef?.sourceId === "garden-motion-showreel") {
      const expectedRenderer = effect.id === "laohu-motion-recipe-webgl-crt-post" ? "custom:laohu-motion-postprocess" : "custom:laohu-motion-recipes";
      const method = effect.sourceMethod;
      const source = catalog.sources.find((row) => row.id === "garden-motion-showreel");
      const sourceRefPaths = new Set(effect.sourceRef.files || []);
      const recipeSource = method?.path;
      if (effect.renderer !== expectedRenderer || effect.adapter?.path !== "templates/adapters/laohu-motion-recipes.js") {
        issues.push({ effectId: effect.id, error: "Garden source recipe is not wired to the shared local recipe renderer" });
      }
      if (effect.sourceRef.commit !== source?.commit || effect.sourceRef.license !== "MIT"
        || recipeSource !== "skills/motion-showreel/references/recipes.md"
        || !Number.isInteger(method?.lineStart) || !Number.isInteger(method?.lineEnd) || method.lineStart < 1 || method.lineEnd < method.lineStart
        || !sourceRefPaths.has(recipeSource) || !sourceRefPaths.has("skills/motion-showreel/assets/starter/motion.js")) {
        issues.push({ effectId: effect.id, error: "Garden recipe source identity/snippet range/helper ledger is incomplete" });
      } else {
        const sourceRecord = source?.files?.find((file) => file.path === recipeSource);
        if (!sourceRecord) issues.push({ effectId: effect.id, path: recipeSource, error: "Garden recipe snippet is not in the exact source file ledger" });
        else if (sourceRoot) {
          try {
            const { vendorRoot } = sourceById(catalog, source.id, sourceRoot);
            const recipeText = await fs.readFile(path.join(vendorRoot, recipeSource), "utf8");
            const selected = recipeText.split("\n").slice(method.lineStart - 1, method.lineEnd).join("\n");
            if (!selected.includes(method.heading)) issues.push({ effectId: effect.id, path: recipeSource, error: "Garden line-range snippet does not contain its exact recipe heading" });
          } catch (error) { issues.push({ effectId: effect.id, path: recipeSource, error: `could not verify Garden recipe snippet: ${error.message}` }); }
        }
      }
      const expectedRecipeId = effect.id.replace(/^laohu-motion-recipe-/, "");
      try {
        const provider = await fs.readFile(path.resolve(skillDir, effect.adapter.path), "utf8");
        const renderEntry = await fs.readFile(path.join(skillDir, "scripts", "render.mjs"), "utf8");
        const filmEntry = await fs.readFile(path.join(skillDir, "templates", "adapters", "laohu-film.mjs"), "utf8");
        if (!provider.includes(JSON.stringify(expectedRecipeId)) || !provider.includes(JSON.stringify(effect.renderer))) {
          issues.push({ effectId: effect.id, path: effect.adapter.path, error: "Garden adapter does not implement the catalogued recipe ID and renderer" });
        }
        if (!renderEntry.includes("motionRecipes.validateScene(scene)") || !renderEntry.includes("LAOHU_MOTION_POSTPROCESS(canvas")
            || !renderEntry.includes("LAOHU_MOTION_PREPARE_FRAME") || !renderEntry.includes("resolveMotionRecipeFrameAssets")) {
          issues.push({ effectId: effect.id, path: "scripts/render.mjs", error: "Motion scene render entry does not validate and consume recipe frames, source SVG preparation, and post-processing before capture" });
        }
        if (!filmEntry.includes("MotionRecipes.validateScene(scene)")) {
          issues.push({ effectId: effect.id, path: "templates/adapters/laohu-film.mjs", error: "Film motion-scene validator does not apply the shared Motion recipe schema to /1 and asrcut-v2 /2" });
        }
        checkedAdapterFiles += 3;
      } catch (error) { issues.push({ effectId: effect.id, error: `could not verify Garden renderer consumer chain: ${error.message}` }); }
    }
    if (effect.renderer === "custom:laohu-network-pass") {
      try {
        const provider = await fs.readFile(path.resolve(skillDir, effect.adapter.path), "utf8");
        if (!provider.includes(JSON.stringify(effect.renderer)) || !provider.includes("root.MOTION_RENDERERS") || !provider.includes("function createSourceGroup")) issues.push({ effectId: effect.id, path: effect.adapter.path, error: "network pass adapter does not register the catalogued renderer with its source scene factory" });
        const toolkit = catalog.effectLibraries.find((library) => library.id === "laohu-motion-toolkit");
        if (!toolkit || toolkit.sourceId !== effect.sourceRef.sourceId) issues.push({ effectId: effect.id, error: "network pass renderer requires the catalogued Huashu toolkit closure" });
      } catch (error) { issues.push({ effectId: effect.id, path: effect.adapter.path, error: "could not verify network pass source adapter: " + error.message }); }
    }
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
  const gardenStyleProfiles = catalog.referenceCatalog.entries.filter((entry) => entry.sourceId === "garden-motion-showreel" && entry.kind === "style-profile");
  if (gardenStyleProfiles.length) {
    issues.push({ sourceId: "garden-motion-showreel", error: "Retired duplicate Garden style profiles must not remain in the active reference catalog; use the protected original style index." });
  }
  const motionRecipes = (catalog.effects || []).filter((effect) => effect.sourceRef?.sourceId === "garden-motion-showreel");
  if (catalog.sources.some((source) => source.id === "garden-motion-showreel") && motionRecipes.length !== 15) {
    issues.push({ sourceId: "garden-motion-showreel", error: `expected 15 individually indexed Garden recipes; found ${motionRecipes.length}` });
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
    registerTemplateIds(effect, "effect library");
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
    sourceSnapshotComparison: {
      status: sourceRoot ? "COMPARED" : "NOT_PERFORMED",
      sourceRootRequired: !sourceRoot,
      comparedSourceCount: sourceRoot ? catalog.sources.filter((source) => source.sourcePathPrefix).length : 0,
      comparedFiles: sourceRoot ? checked : 0,
    },
    catalogCoverage: computeCatalogCoverage(catalog),
    issues,
  };
}

async function verifySource(catalog, sourceId, { sourceRoot = null } = {}) {
  const source = catalog.sources.find((entry) => entry.id === sourceId);
  if (!source) return { ok: false, checkedFiles: 0, issues: [{ sourceId, error: "unknown source" }] };
  const targetTemplates = catalog.templates.filter((entry) => entry.sourceId === sourceId);
  const dependencyIds = new Set([sourceId]);
  for (const entry of targetTemplates) {
    for (const dependency of entry.adapter?.runtimeDependencySourceIds || []) dependencyIds.add(dependency);
    for (const asset of entry.adapter?.fontAssets || []) dependencyIds.add(asset.sourceId);
    for (const dependency of entry.runtimeDependencies || []) if (dependency.providerSourceId) dependencyIds.add(dependency.providerSourceId);
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
  return verifyCatalog(single, { sourceRoot });
}

function productionSearchText(entry, kind) {
  const fields = kind === "needs"
    ? [entry.inputRequirements, entry.renderPreconditions, entry.conditions, entry.parameters, entry.actualInputs, entry.requiredInputs]
    : kind === "content"
      ? [entry.name, entry.purpose, entry.contentFit, entry.fixedMechanism, entry.category, entry.storyFit, entry.parameterUse, entry.readWhen]
      : [entry.name, entry.purpose, entry.intent, entry.intents, entry.family, entry.target, entry.targets, entry.category, entry.contentFit, entry.fixedMechanism, entry.readWhen];
  return JSON.stringify(fields).toLowerCase();
}

function matchesWords(entry, value, kind) {
  if (!value) return true;
  const text = productionSearchText(entry, kind);
  return value.toLowerCase().split(/\s+/u).filter(Boolean).every((word) => text.includes(word));
}

function productionView(entry) {
  const value = structuredClone(entry);
  const rights = entry.sourceEvidence?.license || entry.sourceRef?.license || entry.source?.license || entry.rightsBoundary;
  if (rights && value.license == null) value.license = rights;
  for (const key of [
    "sourceId", "sourcePath", "sourceEvidence", "sourceGitBlob", "sourceBytes", "sourceCommit", "sourceClosurePaths",
    "sourceRef", "sourceImplementationIndex", "catalogSourceId", "sourceOnlyReason", "sourceTemplateId", "sourceSchema",
    "sourceExample", "source", "sourceRefs", "sourcePathVendored", "upstreamPath", "nativeInterface",
    "localRuntime", "runtimeVerification", "adapter", "aliases", "legacyIds", "catalogId", "catalogRole",
  ]) delete value[key];
  if (value.parameters && typeof value.parameters === "object") delete value.parameters.interface;
  if (value.compositionSupport && typeof value.compositionSupport === "object") delete value.compositionSupport.sourceAudioContext;
  if (Array.isArray(value.category)) {
    value.category = value.category.map((item) => item === "huashu-motion-template" ? "native-scene" : item);
  }
  value.renderer = productionRenderer(entry);
  value.id = entry.productionId || entry.id;
  return value;
}

function productionMethodView(entry, includeMethod = false) {
  const value = {
    id: localMethodId(entry),
    itemType: "method",
    capability: "local-method",
    title: entry.title || entry.name,
    name: entry.name,
    availability: "local-method",
    renderable: false,
    localRuleRef: entry.localRuleRef,
    readWhen: entry.readWhen,
    showCommand: `node scripts/templates.mjs show ${localMethodId(entry)}`,
  };
  if (includeMethod) value.method = entry.methodContents;
  return value;
}

const RESOURCE_OVERVIEW_TYPES = ["style", "template", "effect", "effect-library", "method", "reference-index", "style-profile", "source-index"];
const SOURCE_FILTER_TYPES = new Set(["template", "effect", "effect-library", "reference-index", "style-profile", "source-index"]);
const CATEGORY_FILTER_TYPES = new Set(["style", "template", "effect", "effect-library", "reference-index", "style-profile"]);
const STATUS_FILTER_TYPES = new Set(["template", "effect", "effect-library", "method", "reference-index", "style-profile"]);

function resourceCountsBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const value = selector(row) || "unclassified";
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function resourceSourceId(entry) {
  return entry?.sourceId || entry?.sourceRef?.sourceId || entry?.source?.sourceId || entry?.source?.id || entry?.catalogSourceId || null;
}

function resourceCategory(entry) {
  const value = entry?.category;
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

function resourceMatchesFilters(entry, args, type) {
  if (args.source && resourceSourceId(entry) !== args.source && entry?.id !== args.source && entry?.sourceTreeIndexId !== args.source) return false;
  if (args.category) {
    const categories = resourceCategory(entry);
    if (!categories.some((category) => String(category).toLowerCase() === args.category.toLowerCase())) return false;
  }
  if (args.status && entry?.availability !== args.status) return false;
  return true;
}

function resourceCommand(type, action = "browse", suffix = "") {
  const source = suffix ? ` ${suffix}` : "";
  return `node scripts/templates.mjs ${action} --type ${type}${source} --json`;
}

function sourceSummaryForEntry(entry, catalog) {
  const sourceId = resourceSourceId(entry);
  const source = sourceId ? (catalog.sources || []).find((item) => item.id === sourceId) : null;
  return {
    id: sourceId,
    repository: source?.repository || entry?.repository || null,
    commit: source?.commit || entry?.sourceCommit || entry?.commit || null,
    status: source?.status || null,
    license: source?.license || entry?.license || entry?.rightsBoundary || null,
    sourcePath: entry?.sourcePath || entry?.path || null,
    sourceGitBlob: entry?.sourceGitBlob || null,
    sourceSha256: entry?.sourceSha256 || entry?.sourceEvidence?.sha256 || null,
    sourceTreeIndexId: source?.sourceTreeIndexId || entry?.sourceTreeIndexId || null,
  };
}

function styleResourceCard(row) {
  const route = row.route || {};
  const callable = route.kind === "remotion-canvas-function" && route.callable === true;
  const placeholder = route.kind === "source-placeholder";
  const referenceStyle = route.kind === "reference-style" && route.callable === false;
  const resourceSummary = row.resourceSummary || null;
  const summary = [resourceSummary?.appearance?.text, resourceSummary?.applicability?.text].filter(Boolean);
  return {
    id: row.id,
    itemType: "style",
    title: row.name,
    category: row.category,
    capability: callable ? "callable-source-function" : placeholder ? "empty-source-placeholder" : referenceStyle ? "full-style-reference" : "full-prompt-reference",
    availability: callable ? "registered-callable-function" : placeholder ? "empty-source-placeholder" : referenceStyle ? "style-reference-only" : "source-reference-only",
    callable,
    renderable: callable,
    productionRenderer: callable ? route.renderer : null,
    previewPath: row.previewPath || null,
    summary,
    resourceSummary,
    declaredFacets: resourceSummary,
    consumer: {
      role: callable ? "registered callable source function" : placeholder ? "empty pinned source placeholder" : referenceStyle ? "non-callable style reference" : "source-only visual prompt reference",
      boundary: route.consumerBoundary || (callable ? "Callable style function; compare its actual consumed material and renderer controls before using." : "Reference input only; it does not itself implement a production scene."),
      command: route.command || null,
      renderer: callable ? route.renderer : null,
    },
    sourceEvidence: {
      sourcePath: row.sourcePath || null,
      sourceSha256: row.sourceSha256 || null,
      localPath: row.contentPath,
      localSha256: row.localSha256,
      lines: row.lines,
      licenseId: row.licenseId || null,
      dependencies: row.dependencies || [],
    },
    sourceOnlyDecisionInput: !callable && !placeholder,
    productionBoundary: callable
      ? "Registered source function; it can be rendered as its own preview/clip but does not automatically become a Film timeline consumer."
      : placeholder ? "Empty pinned source placeholder; no creative content or renderer is inferred."
        : "Reference prompt only; use as a visual decision input, not as a renderer or permission to redraw the source scene.",
    nextStep: {
      describeCommand: `node scripts/templates.mjs describe --type style --query ${row.id} --json`,
      sourceCommand: `node scripts/templates.mjs styles fulltext --query ${row.id}`,
      consumerCommand: "node scripts/templates.mjs discover --query \"<current shot descriptors>\" --json",
    },
  };
}

function catalogResourceCard(entry, type, catalog) {
  const isSourceOnly = entry.availability === "source-only" || type === "reference-index" || type === "style-profile";
  const id = productionDisplayId(entry);
  const title = entry.name || entry.title || entry.templateId || id;
  const renderer = !isSourceOnly && entry.renderer ? productionRenderer(entry) : null;
  const role = type === "method" ? "local decision method; not a renderer"
    : type === "effect-library" ? "support library; not a standalone rendered effect"
      : isSourceOnly ? "source-only visual/motion reference; not a production implementation"
        : type === "effect" ? "registered effect consumer"
          : "registered production template consumer";
  const summary = [entry.purpose, entry.contentFit, entry.fixedMechanism, entry.summary, entry.description, entry.use, entry.readWhen]
    .filter((value) => typeof value === "string" && value.trim());
  const declaredFacets = {};
  for (const key of [
    "visualActions", "actionLandmarks", "sourceActionLandmarks", "actualInputs", "runtimeDependencies",
    "durationContract", "clock", "transitionMechanism", "sourceMethod", "phase", "endBehavior",
    "family", "intent", "intents", "target", "targets", "controlledAttributes", "timebase",
    "energy", "duration", "fps", "orientation", "ratio", "tags", "readWhen", "reason",
  ]) {
    if (entry[key] != null) declaredFacets[key] = entry[key];
  }
  const conditions = [entry.inputRequirements, entry.renderPreconditions, entry.conditions, entry.notSuitableWhen, entry.limitations, entry.gap, entry.reason]
    .flatMap((value) => Array.isArray(value) ? value : typeof value === "string" ? [value] : [])
    .filter((value, index, rows) => rows.indexOf(value) === index);
  const source = sourceSummaryForEntry(entry, catalog);
  const callableProductionRoute = !isSourceOnly
    && ["template", "effect"].includes(type)
    && ["available", "conditional"].includes(entry.availability)
    && Boolean(renderer);
  const callableBasis = callableProductionRoute ? "registered-local-production-renderer"
    : isSourceOnly ? "source-only-reference"
      : type === "method" ? "decision-method-not-renderer"
        : type === "effect-library" ? "support-library-not-standalone-renderer"
          : "no-registered-production-renderer";
  const card = {
    id,
    itemType: type,
    title,
    kind: entry.kind || (type === "reference-index" ? "catalog-reference" : type),
    availability: entry.availability || (type === "method" ? "local-method" : null),
    runtimeVerification: entry.runtimeVerification || null,
    capability: type === "method" ? "local-method" : isSourceOnly ? "source-only-reference" : renderer ? "registered-consumer" : "catalog-entry-without-registered-renderer",
    sourceOnlyDecisionInput: isSourceOnly,
    callable: callableProductionRoute,
    callableBasis,
    catalogDeclaredCallable: typeof entry.callable === "boolean" ? entry.callable : null,
    renderable: !isSourceOnly && entry.availability === "available" && Boolean(renderer),
    rendererRegistered: !isSourceOnly && Boolean(renderer),
    productionRenderer: renderer,
    summary,
    declaredFacets,
    consumer: type === "method" ? { role, localRuleRef: entry.localRuleRef || null }
      : type === "effect-library" ? { role, functions: entry.functions || [], loadOrder: entry.loadOrder || [], usageContract: entry.usageContract || null }
        : isSourceOnly ? { role, boundary: "This row can inform source/style/motion decisions when its summary supports that use. It is not a local production renderer; inspect the pinned source record and limitations before relying on it." }
          : { role, command: `node scripts/templates.mjs show ${id}`, renderer: renderer || null },
    conditions,
    callabilityConditions: entry.availability === "conditional" && callableProductionRoute ? conditions : [],
    category: entry.category || null,
    source,
    nextStep: {
      describeCommand: `node scripts/templates.mjs describe --type ${type} --query ${entry.id} --json`,
      showCommand: type === "method" ? `node scripts/templates.mjs show ${localMethodId(entry)}`
        : `node scripts/templates.mjs show ${entry.id}${isSourceOnly ? " --research" : ""} --json`,
    },
  };
  if (type === "reference-index" || type === "style-profile") {
    card.indexedRenderer = entry.renderer || null;
    card.sourceIndexPath = entry.sourceIndexPath || null;
    card.sourceIndexSha256 = entry.sourceIndexSha256 || null;
    card.sourceImplementationState = entry.implementationState || null;
  }
  if (type === "method") card.localRuleRef = entry.localRuleRef || null;
  return card;
}

async function loadStyleResourceIndex(catalog) {
  const library = catalog.styleLibrary;
  if (!library || library.format !== "laohu.motion.style-library/1") throw new Error("Motion catalog does not declare a valid style resource index");
  const indexPath = path.resolve(skillDir, library.indexPath);
  if (!isWithin(skillDir, indexPath)) throw new Error("Style resource index must stay inside the Motion Skill");
  const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
  if (index.format !== "laohu.motion.style-library/1" || !Array.isArray(index.entries)) throw new Error("Invalid style resource index");
  return index;
}

function sourceIndexItems(catalog) {
  const refCounts = resourceCountsBy(catalog.referenceCatalog?.entries || [], (entry) => resourceSourceId(entry));
  const templateCounts = resourceCountsBy(catalog.templates || [], (entry) => resourceSourceId(entry));
  const effectCounts = resourceCountsBy(catalog.effects || [], (entry) => resourceSourceId(entry));
  const libraryCounts = resourceCountsBy(catalog.effectLibraries || [], (entry) => resourceSourceId(entry));
  const treeById = new Map((catalog.sourceTreeIndex || []).map((tree) => [tree.id, tree]));
  const sources = (catalog.sources || []).map((source) => {
    const tree = source.sourceTreeIndexId ? treeById.get(source.sourceTreeIndexId) : null;
    return {
      id: source.id,
      itemType: "source-record",
      repository: source.repository || null,
      commit: source.commit || null,
      status: source.status || null,
      license: source.license || null,
      sourcePathPrefix: source.sourcePathPrefix || null,
      sourceTreeIndexId: source.sourceTreeIndexId || null,
      trackedFileCount: tree && Number.isInteger(tree.trackedFiles) ? tree.trackedFiles : null,
      exactTreeFileRows: tree && Array.isArray(tree.files) ? tree.files.length : null,
      pinnedFileRows: (source.files || []).length,
      registeredRecords: {
        templates: templateCounts[source.id] || 0,
        effects: effectCounts[source.id] || 0,
        effectLibraries: libraryCounts[source.id] || 0,
        references: refCounts[source.id] || 0,
      },
      nextStep: {
        verifyCommand: `node scripts/templates.mjs verify --source ${source.id}`,
        browseCommand: `node scripts/templates.mjs browse --type reference-index --source ${source.id} --json`,
        describeCommand: `node scripts/templates.mjs describe --type source-index --query ${source.id} --json`,
      },
    };
  });
  const trees = (catalog.sourceTreeIndex || []).map((tree) => ({
    id: tree.id,
    itemType: "source-tree-index",
    repository: tree.repository || null,
    commit: tree.commit || null,
    trackedFileCount: Number.isInteger(tree.trackedFiles) ? tree.trackedFiles : null,
    exactFileRows: Array.isArray(tree.files) ? tree.files.length : null,
    classification: tree.classification || null,
    sourceIds: (catalog.sources || []).filter((source) => source.sourceTreeIndexId === tree.id).map((source) => source.id),
    nextStep: {
      describeCommand: `node scripts/templates.mjs describe --type source-index --query ${tree.id} --json`,
    },
  }));
  return { sources, trees };
}

function resourceCollection(catalog, type, styleIndex = null) {
  if (type === "style") return (styleIndex?.entries || []).map(styleResourceCard);
  if (type === "template") return (catalog.templates || []).map((entry) => catalogResourceCard(entry, type, catalog));
  if (type === "effect") return (catalog.effects || []).map((entry) => catalogResourceCard(entry, type, catalog));
  if (type === "effect-library") return (catalog.effectLibraries || []).map((entry) => catalogResourceCard(entry, type, catalog));
  if (type === "method") return (catalog.methods || []).map((entry) => catalogResourceCard(entry, type, catalog));
  if (type === "reference-index") return (catalog.referenceCatalog?.entries || []).filter((entry) => entry.kind !== "style-profile").map((entry) => catalogResourceCard(entry, type, catalog));
  if (type === "style-profile") return (catalog.referenceCatalog?.entries || []).filter((entry) => entry.kind === "style-profile").map((entry) => catalogResourceCard(entry, type, catalog));
  if (type === "source-index") return sourceIndexItems(catalog);
  throw new Error(`Unknown resource type ${type}`);
}

function filterTypesForResourceArgs(args) {
  const requested = args.type || "all";
  if (requested !== "all" && !RESOURCE_OVERVIEW_TYPES.includes(requested)) {
    throw new Error(`Unknown resource --type ${requested}; choose ${RESOURCE_OVERVIEW_TYPES.join(", ")}, or all`);
  }
  const explicit = requested !== "all";
  let types = explicit ? [requested] : [...RESOURCE_OVERVIEW_TYPES];
  if (args.source) {
    if (explicit && !SOURCE_FILTER_TYPES.has(requested)) throw new Error(`--source is not a filter for resource type ${requested}`);
    types = types.filter((type) => SOURCE_FILTER_TYPES.has(type));
  }
  if (args.category) {
    if (explicit && !CATEGORY_FILTER_TYPES.has(requested)) throw new Error(`--category is not a filter for resource type ${requested}`);
    types = types.filter((type) => CATEGORY_FILTER_TYPES.has(type));
  }
  if (args.status) {
    if (explicit && !STATUS_FILTER_TYPES.has(requested)) throw new Error(`--status is not a filter for resource type ${requested}`);
    types = types.filter((type) => STATUS_FILTER_TYPES.has(type));
  }
  return { requested, types };
}

function sourceIndexOverview(catalog, args) {
  const data = sourceIndexItems(catalog);
  let sources = data.sources;
  let trees = data.trees;
  if (args.source) {
    sources = sources.filter((source) => source.id === args.source);
    const linkedTrees = new Set(sources.map((source) => source.sourceTreeIndexId).filter(Boolean));
    trees = trees.filter((tree) => linkedTrees.has(tree.id) || tree.id === args.source);
  }
  return {
    sourceRecords: { count: sources.length, withPinnedFileRows: sources.filter((source) => source.pinnedFileRows > 0).length, entries: sources },
    sourceTreeIndexes: { count: trees.length, withExactFileRows: trees.filter((tree) => tree.exactFileRows > 0).length, entries: trees },
    commands: {
      browse: "node scripts/templates.mjs browse --type source-index --json",
      verifySource: "node scripts/templates.mjs verify --source <source-id>",
      sourceRecords: "node scripts/templates.mjs list --research --source <source-id> --json",
    },
  };
}

function resourceTypeSummary(type, items, catalog, styleIndex, args) {
  if (type === "source-index") return sourceIndexOverview(catalog, args);
  const availability = resourceCountsBy(items, (item) => item.availability);
  const categories = type === "style"
    ? styleIndex?.coverage?.categories || {}
    : resourceCountsBy(items, (item) => resourceCategory(item).join(" · "));
  const sources = resourceCountsBy(items, (item) => resourceSourceId(item));
  const summary = {
    type,
    count: items.length,
    byAvailability: availability,
    byCategory: categories,
    bySourceId: sources,
    browseCommand: resourceCommand(type, "browse"),
  };
  if (type === "style") {
    summary.bySourceId = {};
    summary.sourceLocation = "Each style entry carries its exact local/source path, content hash and license ID; the library index does not register per-row upstream source IDs.";
    summary.withPreview = styleIndex.coverage?.previewCount || 0;
    summary.withoutPreview = items.length - summary.withPreview;
    summary.callableSourceFunctions = styleIndex.coverage?.callableCanvasFunctions || 0;
    summary.completePromptReferences = styleIndex.coverage?.completePromptRoutes || 0;
    summary.emptyPlaceholders = styleIndex.coverage?.sourcePlaceholders || 0;
    summary.selectionNote = "All ordinary entries are complete style references. The 25 preserved A–G code functions are available only through the explicit compatibility index.";
  } else if (type === "template") {
    summary.productionTemplates = items.filter((item) => item.availability !== "source-only").length;
    summary.sourceOnlyReferences = items.filter((item) => item.availability === "source-only").length;
    summary.sourceOnlyNote = "Source-only rows can inform visual/motion decisions where their source description supports it, but they are not production templates in this registry.";
  } else if (type === "reference-index" || type === "style-profile") {
    summary.byKind = resourceCountsBy(items, (item) => item.kind);
    summary.sourceOnlyDecisionInput = items.length;
    summary.productionBoundary = "Every entry in this group is source-only; no row here is a local production renderer.";
  } else if (type === "method") {
    summary.bySourceId = {};
    summary.localRuleReferences = items.filter((item) => item.consumer?.localRuleRef).length;
    summary.localDecisionMethods = items.length;
    summary.productionBoundary = "Methods guide shot/style decisions; they are not renderers.";
  } else if (type === "effect-library") {
    summary.registeredSupportLibraries = items.length;
    summary.productionBoundary = "Libraries provide support functions and load order; a library is not a standalone rendered effect.";
  }
  if (args.source) summary.sourceFilter = args.source;
  if (args.category) summary.categoryFilter = args.category;
  if (args.status) summary.statusFilter = args.status;
  return summary;
}

function resourceOverviewText(data) {
  process.stdout.write("Motion 资源全貌（各登记集合分别计数，不相加推断唯一资产或可运行数量）\n");
  process.stdout.write(`${data.retrievalNote}\n`);
  for (const group of data.groups) {
    process.stdout.write(`\n${group.title}：${group.summary.count ?? `${group.summary.sourceRecords?.count || 0} 个 source / ${group.summary.sourceTreeIndexes?.count || 0} 个 tree`}\n`);
    for (const [key, value] of Object.entries(group.summary)) {
      if (["type", "count", "browseCommand", "sourceRecords", "sourceTreeIndexes", "byCategory", "bySourceId", "byAvailability"].includes(key)) continue;
      process.stdout.write(`  ${key}: ${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
    }
    if (group.summary.byAvailability && Object.keys(group.summary.byAvailability).length) process.stdout.write(`  状态：${JSON.stringify(group.summary.byAvailability, null, 2)}\n`);
    process.stdout.write(`  展开：${group.expandCommand}\n`);
  }
  process.stdout.write("\n按类型展开会列出该组全部登记摘要；选择单条记录后用 describe 查看精确原件、许可、consumer 与条件。这里的检索是词面定位，不替代审美判断；不会默认输出全部源代码。\n");
}

function resourceBrowseText(data) {
  for (const group of data.groups) {
    process.stdout.write(`\n${group.title}（${group.count} 条）\n`);
    const entries = Array.isArray(group.entries) ? group.entries : [...(group.entries?.sources || []), ...(group.entries?.trees || [])];
    for (const entry of entries) {
      const title = typeof entry.title === "string" ? entry.title : entry.title?.zh || entry.title?.en || entry.name || entry.repository || "";
      const role = entry.consumer?.role || entry.capability || entry.itemType || "source-index";
      const state = entry.availability || entry.status || role;
      const category = Array.isArray(entry.category) ? entry.category.join(" · ") : entry.category;
      process.stdout.write(`- ${entry.id} [${state}] ${title}${category ? `（${category}）` : ""}\n`);
      if (entry.summary?.length) process.stdout.write(`  说明：${entry.summary.join("；")}\n`);
      if (entry.declaredFacets && Object.keys(entry.declaredFacets).length) process.stdout.write(`  材料/动作/镜头等登记字段：${JSON.stringify(entry.declaredFacets)}\n`);
      if (entry.conditions?.length) process.stdout.write(`  输入与条件：${entry.conditions.join("；")}\n`);
      if (entry.consumer) {
        const consumer = { role: entry.consumer.role };
        for (const key of ["command", "localRuleRef", "boundary", "usageContract", "functions", "loadOrder"]) {
          if (entry.consumer[key] != null) consumer[key] = entry.consumer[key];
        }
        process.stdout.write(`  consumer：${JSON.stringify(consumer)}\n`);
      }
      if (entry.source) process.stdout.write(`  原件定位：${JSON.stringify(entry.source)}\n`);
      if (entry.sourceEvidence) process.stdout.write(`  原件定位：${JSON.stringify(entry.sourceEvidence)}\n`);
      if (entry.registeredRecords) process.stdout.write(`  已登记关联：${JSON.stringify(entry.registeredRecords)}\n`);
      if (entry.itemType === "source-record") {
        process.stdout.write(`  来源：repo=${entry.repository || "(未登记)"}; commit=${entry.commit || "(未登记)"}; license=${entry.license || "(未登记)"}; pinnedFiles=${entry.pinnedFileRows}; tree=${entry.sourceTreeIndexId || "(未关联)"}\n`);
      }
      if (entry.itemType === "source-tree-index") {
        process.stdout.write(`  代码树：repo=${entry.repository || "(未登记)"}; commit=${entry.commit || "(未登记)"}; trackedFiles=${entry.trackedFileCount ?? "(未登记)"}; exactFileRows=${entry.exactFileRows ?? "(未登记)"}; classification=${entry.classification || "(未登记)"}; sourceIds=${JSON.stringify(entry.sourceIds)}\n`);
      }
      if (entry.sourceOnlyDecisionInput) process.stdout.write("  边界：可在原件说明支持时作为视觉决策输入；不是本地生产 renderer。\n");
      if (entry.nextStep?.describeCommand) process.stdout.write(`  精确展开：${entry.nextStep.describeCommand}\n`);
    }
  }
}

async function resourceCatalogView(catalog, args) {
  const { requested, types } = filterTypesForResourceArgs(args);
  if (args.source && !catalog.sources.some((source) => source.id === args.source)) throw new Error(`Unknown source ${args.source}`);
  if (args.status && !["available", "conditional", "source-only", "local-method", "preloadable-local-classic-scripts"].includes(args.status)) {
    throw new Error(`Unknown --status ${args.status}`);
  }
  const styleIndex = types.includes("style") ? await loadStyleResourceIndex(catalog) : null;
  const groups = [];
  for (const type of types) {
    let entries = resourceCollection(catalog, type, styleIndex);
    if (type !== "source-index") {
      entries = entries.filter((entry) => resourceMatchesFilters(entry, args, type));
    } else {
      if (args.status) throw new Error("--status is not supported for source-index; use its exact source status in --query describe instead");
      if (args.source) {
        const linkedSources = new Set(entries.sources.filter((entry) => entry.id === args.source).map((entry) => entry.id));
        const linkedTrees = new Set(entries.sources.filter((entry) => linkedSources.has(entry.id)).map((entry) => entry.sourceTreeIndexId).filter(Boolean));
        entries = {
          sources: entries.sources.filter((entry) => linkedSources.has(entry.id)),
          trees: entries.trees.filter((entry) => linkedTrees.has(entry.id) || entry.id === args.source),
        };
      }
    }
    if (args.command === "browse" && type === "style") {
      const sourceRows = new Map((styleIndex?.entries || []).map((row) => [row.id, row]));
      entries = await Promise.all(entries.map(async (entry) => {
        const sourceRow = sourceRows.get(entry.id);
        if (!sourceRow) throw new Error(`Style resource ${entry.id} is missing its indexed source record`);
        return { ...entry, contentCapability: await styleContentCapability(sourceRow, catalog) };
      }));
    }
    const fullSummary = resourceTypeSummary(type, entries, catalog, styleIndex, args);
    const summary = args.command !== "overview"
      ? fullSummary
      : type === "source-index"
        ? {
          sourceRecords: { count: fullSummary.sourceRecords.count, withPinnedFileRows: fullSummary.sourceRecords.withPinnedFileRows },
          sourceTreeIndexes: { count: fullSummary.sourceTreeIndexes.count, withExactFileRows: fullSummary.sourceTreeIndexes.withExactFileRows },
          commands: fullSummary.commands,
        }
        : Object.fromEntries(Object.entries(fullSummary).filter(([key]) => !["byCategory", "bySourceId"].includes(key) || (type === "style" && key === "bySourceId")));
    const count = type === "source-index" ? entries.sources.length + entries.trees.length : entries.length;
    const title = ({
      style: "本地视觉风格库",
      template: "生产模板与 source-only 模板参考",
      effect: "生产 effect",
      "effect-library": "effect 支撑库",
      method: "本地决策方法",
      "reference-index": "来源索引与参考条目",
      "style-profile": "source-only 风格资料",
      "source-index": "来源记录与代码树索引",
    })[type];
    const group = {
      type,
      title,
      count,
      summary,
      expandCommand: resourceCommand(type),
    };
    if (args.command === "browse") group.entries = entries;
    groups.push(group);
  }
  const data = {
    format: args.command === "browse" ? "laohu.motion.resource-catalog-browse/1" : "laohu.motion.resource-catalog-overview/1",
    scope: "current catalog.json plus its maintenance source-ledger.json and the catalog-declared local style index; no parallel resource index is created",
    selectedType: requested,
    groups,
    retrievalNote: "Counts describe separate registered collections and do not imply runtime availability. Source-only records can inform visual/motion decisions when their descriptions support that use, but their indexed renderer fields are not production implementations. Discovery and style matching remain lexical; inspect describe/show and source conditions before choosing.",
    commands: {
      overview: "node scripts/templates.mjs overview --json",
      browseSelectedType: "node scripts/templates.mjs browse --type <type> --json",
      describe: "node scripts/templates.mjs describe --type <type> --query <id> --json",
      legacyStyleOverview: "node scripts/templates.mjs styles overview --json",
    },
  };
  if (args.json) process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  else if (args.command === "overview") resourceOverviewText(data);
  else resourceBrowseText(data);
}

function findResourceRecord(catalog, type, query, styleIndex = null) {
  const exact = (rows, getId = (row) => row.id) => rows.find((row) => getId(row) === query);
  if (type === "style") return exact(styleIndex?.entries || []);
  if (type === "template") return exact(catalog.templates || [], (row) => row.productionId || row.id) || exact(catalog.templates || []);
  if (type === "effect") return exact(catalog.effects || []);
  if (type === "effect-library") return exact(catalog.effectLibraries || []);
  if (type === "method") return exact(catalog.methods || [], (row) => localMethodId(row)) || exact(catalog.methods || []);
  if (type === "reference-index") return exact(catalog.referenceCatalog?.entries || [], (row) => row.kind === "style-profile" ? null : row.id);
  if (type === "style-profile") return exact(catalog.referenceCatalog?.entries || [], (row) => row.kind === "style-profile" ? row.id : null);
  if (type === "source-index") {
    const sources = catalog.sources || [];
    const trees = catalog.sourceTreeIndex || [];
    const source = exact(sources) || sources.find((row) => row.sourceTreeIndexId === query);
    if (source) return { source, tree: trees.find((row) => row.id === source.sourceTreeIndexId) || null };
    const tree = exact(trees);
    if (tree) return { source: sources.find((row) => row.sourceTreeIndexId === tree.id) || null, tree };
  }
  return null;
}

async function describeResource(catalog, args) {
  const type = args.type;
  if (!type || type === "all" || !RESOURCE_OVERVIEW_TYPES.includes(type)) {
    throw new Error(`describe requires one exact --type: ${RESOURCE_OVERVIEW_TYPES.join(", ")}`);
  }
  if (!args.query?.trim()) throw new Error("describe requires --query <registered-id>");
  if (type === "style") throw new Error("Style descriptions use the compatible `styles describe --query <ID>` command");
  const row = findResourceRecord(catalog, type, args.query.trim());
  if (!row) throw new Error(`No ${type} resource matches ${args.query}`);
  if (type === "source-index") {
    const source = row.source;
    const tree = row.tree;
    const sourceId = source?.id || null;
    const refs = (catalog.referenceCatalog?.entries || []).filter((entry) => resourceSourceId(entry) === sourceId);
    const templates = (catalog.templates || []).filter((entry) => resourceSourceId(entry) === sourceId);
    const effects = (catalog.effects || []).filter((entry) => resourceSourceId(entry) === sourceId);
    const libraries = (catalog.effectLibraries || []).filter((entry) => resourceSourceId(entry) === sourceId);
    return {
      format: "laohu.motion.source-index-description/1",
      type,
      id: args.query,
      sourceRecord: source || null,
      sourceTreeIndex: tree || null,
      relatedRegistries: {
        templates: templates.length, effects: effects.length, effectLibraries: libraries.length,
        references: refs.length,
        referencesByKind: resourceCountsBy(refs, (entry) => entry.kind),
      },
      productionBoundary: "A source or source-tree record documents provenance and indexed paths. It is not itself a production renderer; inspect specific registered template/effect entries separately.",
      commands: {
        verify: sourceId ? `node scripts/templates.mjs verify --source ${sourceId}` : null,
        browseSourceRecords: sourceId ? `node scripts/templates.mjs list --research --source ${sourceId} --json` : null,
        browseReferences: sourceId ? `node scripts/templates.mjs browse --type reference-index --source ${sourceId} --json` : null,
      },
    };
  }
  if (type === "method") {
    const localRule = await readLocalRuleRef(row.localRuleRef);
    return {
      format: "laohu.motion.resource-description/1", type,
      ...catalogResourceCard(row, type, catalog),
      originalRecord: row,
      localRule: { path: localRule.relative, anchor: localRule.anchor, contents: localRule.contents },
      consumerBoundary: "Local decision guidance only; it does not render or register a template/effect.",
    };
  }
  const isSourceOnly = row.availability === "source-only" || type === "reference-index" || type === "style-profile";
  return {
    format: "laohu.motion.resource-description/1",
    ...catalogResourceCard(row, type, catalog),
    originalRecord: row,
    sourceOnlyBoundary: isSourceOnly ? "This source-only record may inform a visual/motion decision when its source description supports it. It is not callable production output, even if an index row stores a renderer label." : null,
  };
}

function printList(catalog, args) {
  const researchScope = !!(args.research || args.all || args.status === "source-only" || args.source || ["reference-index", "style-profile"].includes(args.type));
  const explicitScope = !!(researchScope || args.status || args.category || args.type || args.intent || args.family || args.target || args.runtime || args.use || args.content || args.needs);
  const localMethods = (catalog.methods || []).map((entry) => ({ ...entry, itemType: "method", methodId: localMethodId(entry) }));
  const entries = [
    ...catalog.templates.filter((entry) => researchScope || entry.availability !== "source-only").map((entry) => ({ ...entry, itemType: "template" })),
    ...(!researchScope ? localMethods : []),
    ...(researchScope
      ? catalog.referenceCatalog.entries.map((entry) => ({ ...entry, itemType: entry.kind === "style-profile" ? "style-profile" : "reference-index" }))
      : []),
    ...catalog.effectLibraries.map((entry) => ({ ...entry, itemType: "effect-library", status: entry.availability })),
    ...(catalog.effects || []).map((entry) => ({ ...entry, itemType: "effect" })),
  ].filter((entry) => {
    if (!explicitScope && entry.itemType !== "method" && !["available", "conditional", "preloadable-local-classic-scripts"].includes(entry.availability)) return false;
    if (args.status && entry.availability !== args.status && !(entry.itemType === "method" && args.status === "source-only")) return false;
    if (args.source && entry.sourceId !== args.source && entry.catalogSourceId !== args.source && entry.sourceRef?.sourceId !== args.source) return false;
    if (args.type && entry.itemType !== args.type) return false;
    if (args.intent && entry.intent !== args.intent && !(Array.isArray(entry.intents) && entry.intents.includes(args.intent))) return false;
    if (args.family && entry.family !== args.family) return false;
    if (args.target && entry.target !== args.target && !(Array.isArray(entry.targets) && entry.targets.includes(args.target))) return false;
    if (args.runtime && entry.renderer !== args.runtime && entry.runtimeVerification !== args.runtime) return false;
    if (args.category && !(Array.isArray(entry.category) && entry.category.includes(args.category))) return false;
    if (!matchesWords(entry, args.use, "use") || !matchesWords(entry, args.content, "content") || !matchesWords(entry, args.needs, "needs")) return false;
    return true;
  }).sort((a, b) => String(a.productionId || a.id).localeCompare(String(b.productionId || b.id)));
  if (args.json) {
    const rows = args.research || args.all || args.type === "style-profile"
      ? entries
      : entries.map((entry) => entry.itemType === "method" ? productionMethodView(entry) : productionView(entry));
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  for (const entry of entries) {
    const id = entry.itemType === "method" ? localMethodId(entry) : entry.productionId || entry.id;
    const title = entry.name || (typeof entry.title === "string" ? entry.title : entry.title?.zh || entry.title?.en) || entry.templateId || id;
    const use = entry.itemType === "method" ? entry.readWhen : entry.purpose || entry.contentFit || entry.intent || entry.fixedMechanism || entry.usageContract || "Local renderer capability";
    const needs = entry.itemType === "method" ? "本地方法参考；不可直接渲染" : (entry.inputRequirements || entry.renderPreconditions || entry.conditions || []).slice(0, 2).join("；");
    const state = entry.itemType === "method" ? "local-method" : entry.availability || entry.status;
    process.stdout.write(`${id}\t${entry.itemType}\t${state}\t${title}\t${use}${needs ? `\t输入：${needs}` : ""}\n`);
  }
}

const DISCOVERY_STOP_WORDS = new Set([
  "动画", "视频", "画面", "风格", "效果", "创作", "制作", "呈现", "内容", "相关", "对应", "这个", "那个",
  "需要", "希望", "想要", "最好", "适合", "可以", "可能", "一个", "一种", "一些", "什么", "怎么", "怎样", "如何", "一下", "制作",
  "然后", "里面", "整体", "之前", "下面", "用户", "观众", "读者", "进行", "完成", "变得", "更加", "应该", "大概",
]);

function discoveryTerms(args) {
  const input = [args.query, args.content, args.needs, args.intent, args.family, args.target, args.runtime, args.category]
    .filter((value) => typeof value === "string" && value.trim()).join(" ");
  const chineseStopWords = [...DISCOVERY_STOP_WORDS].filter((word) => /^[\u3400-\u9fff]+$/u.test(word)).sort((a, b) => b.length - a.length);
  const searchableInput = input.replace(/[\u3400-\u9fff]+/gu, (run) => {
    let remainder = run;
    for (const stopWord of chineseStopWords) remainder = remainder.split(stopWord).join(" ");
    return remainder;
  });
  const tokens = searchableInput.match(/[\u3400-\u9fff]+|[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*/gu) || [];
  const result = [];
  for (const token of tokens) {
    if (/^[\u3400-\u9fff]+$/u.test(token)) {
      if (token.length <= 2) {
        if (!DISCOVERY_STOP_WORDS.has(token)) result.push(token);
      } else {
        if (!DISCOVERY_STOP_WORDS.has(token)) result.push(token);
        for (let index = 0; index < token.length - 1; index += 1) {
          const pair = token.slice(index, index + 2);
          if (!DISCOVERY_STOP_WORDS.has(pair)) result.push(pair);
        }
      }
    } else if (!DISCOVERY_STOP_WORDS.has(token.toLowerCase())) result.push(token.toLowerCase());
  }
  return [...new Set(result)];
}

function discoveryText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(discoveryText).join(" ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key} ${discoveryText(item)}`).join(" ");
  return "";
}

function discoveryFiltersMatch(entry, args, itemType) {
  const includes = (actual, requested) => {
    if (!requested) return true;
    const haystack = discoveryText(actual).toLowerCase();
    return haystack.includes(requested.toLowerCase());
  };
  if (args.intent && !includes([entry.intent, entry.intents], args.intent)) return false;
  if (args.family && !includes(entry.family, args.family)) return false;
  if (args.target && !includes([entry.target, entry.targets], args.target)) return false;
  if (args.runtime && !includes([entry.renderer, entry.runtimeVerification], args.runtime)) return false;
  if (args.category && !includes(entry.category, args.category)) return false;
  if (itemType === "effect-library" && args.runtime && !includes(entry.renderer, args.runtime)) return false;
  return true;
}

function scoreDiscoveryEntry(entry, terms) {
  const title = discoveryText([entry.id, entry.productionId, entry.name, entry.title]).toLowerCase();
  const fit = discoveryText([entry.purpose, entry.contentFit, entry.readWhen, entry.intent, entry.intents, entry.family, entry.target, entry.targets, entry.category, entry.keywords]).toLowerCase();
  const detail = discoveryText(entry).toLowerCase();
  const matchedTerms = [];
  let score = 0;
  for (const term of terms) {
    const query = term.toLowerCase();
    if (title.includes(query)) { score += 8; matchedTerms.push(term); }
    else if (fit.includes(query)) { score += 4; matchedTerms.push(term); }
    else if (detail.includes(query)) { score += 1; matchedTerms.push(term); }
  }
  return { score, matchedTerms };
}

function productionConditions(entry) {
  const values = [entry.inputRequirements, entry.renderPreconditions, entry.conditions, entry.limitations, entry.notSuitableWhen]
    .flatMap((value) => Array.isArray(value) ? value : value ? [value] : []);
  return [...new Set(values.map((value) => typeof value === "string" ? value : JSON.stringify(value)))];
}

const MATERIAL_HANDOFF_ROUTE_DEFINITIONS = [
  {
    id: "video-clip-card",
    mediaType: "已有且获准使用的视频片段",
    role: "以真实视频运动作为本段画面材料；画面 consumer 固定静音播放源片段。",
    boundary: "只承载现有视频，不会把实拍转换成水彩、卡通或其他绘画风格。",
  },
  {
    id: "laohu-media-photo-montage",
    mediaType: "已有且获准使用的 PNG 静图",
    role: "展示真实图片，并由已登记组件对图片做 Ken Burns 式平滑推近。",
    boundary: "运动是镜头对静图的平移/缩放，不会生成杯中液体、蒸汽或水彩笔触动画。",
  },
  {
    id: "image-collage-explanation",
    mediaType: "已有且获准使用的照片、文档、截图或视频帧/帧序列",
    role: "把证据图片或视频帧按空间关系组织成拼贴讲解画面。",
    boundary: "拼贴承载现有证据材料，不会补造缺失的过程画面或改变素材画风。",
  },
  {
    id: "laohu-motion-recipe-wipe-reveal",
    mediaType: "已有全画幅 PNG，或已渲染好的 PNG 序列",
    role: "只在两段已有画面之间做擦除式转场；PNG 序列的运动必须预先存在。",
    boundary: "这是转场输入，不是图像/视频素材生成器，也不适合单独表达液体倾倒过程。",
  },
];

function materialHandoffRoutes(catalog) {
  const productionEntries = [...(catalog.templates || []), ...(catalog.effects || [])]
    .filter((row) => row.motionUse?.intendedUse === "production-implementation" && row.motionUse?.ordinaryProductionCandidate === true);
  return MATERIAL_HANDOFF_ROUTE_DEFINITIONS.flatMap((definition) => {
    const entry = productionEntries.find((row) => (row.productionId || row.id) === definition.id || row.id === definition.id);
    if (!entry) return [];
    const itemType = (catalog.effects || []).includes(entry) ? "effect" : "template";
    const routeId = entry.productionId || entry.id;
    return [{
      id: routeId,
      itemType,
      title: entry.name || entry.title || entry.id,
      availability: entry.availability,
      renderable: entry.availability === "available" && !!entry.renderer,
      rendererRegistered: !!entry.renderer,
      renderer: productionRenderer(entry),
      mediaType: definition.mediaType,
      role: definition.role,
      boundary: definition.boundary,
      assetStatus: "not-assessed-by-discover; verify the actual local file and reuse rights before prepare",
      purpose: entry.purpose || entry.contentFit || entry.intent || null,
      fixedMechanism: entry.fixedMechanism || null,
      conditions: productionConditions(entry),
      nextStep: {
        listCommand: `node scripts/templates.mjs list --type ${itemType} --json`,
        command: `node scripts/templates.mjs show ${routeId}`,
        consumer: "读取本地登记的真实字段、素材条件和边界；只有素材与条件均核对后才交给 renderer。",
      },
    }];
  });
}

function noProductionMatchHandoff(routes) {
  return {
    status: "no-registered-production-match",
    assetStatus: "not-assessed-by-discover; no media file or rights declaration was verified by this text query",
    explanation: "本次检索没有找到与查询语义直接匹配的可登记生产模板或 effect。风格提示/方法卡命中不能代替画面 consumer；以下只是现有素材承载或转场入口，不是本次风格匹配、素材已取得或目标画面已实现的证明。",
    nextStep: "先取得并核实本片可用的真实素材及使用权，再用下面的 show 命令核对对应 consumer。若没有能承载目标过程的现成素材与已登记入口，就明确标记缺口，不把水彩提示词当作授权临时重画引擎。",
    routes,
  };
}

function materialRequirementHandoff(routes, args, templates, effects) {
  if (!routes.length) return null;
  const hasProductionHits = templates.length > 0 || effects.length > 0;
  const declaredNeed = typeof args.needs === "string" && args.needs.trim() ? args.needs.trim() : null;
  if (!declaredNeed && hasProductionHits) return null;
  if (!declaredNeed) return noProductionMatchHandoff(routes);
  if (!hasProductionHits) {
    return {
      ...noProductionMatchHandoff(routes),
      requirement: declaredNeed,
      requirementStatus: "declared-but-unverified",
    };
  }
  return {
    status: "declared-material-unverified",
    requirement: declaredNeed,
    assetStatus: "not-assessed-by-discover; this text-only query did not read an asset path or rights declaration",
    explanation: hasProductionHits
      ? "目录有词面命中的生产模板/effect，但它们不能证明 --needs 所写材料已存在、获准使用，或能承担本镜所需状态。下列真实 consumer 只说明各自能承载什么输入。"
      : "没有直接命中的生产模板/effect，且 --needs 所写材料只是一段检索文字。下列真实 consumer 供已有素材承载或转场核对，不表示素材已存在或获得授权。",
    nextStep: "先核对素材文件、内容、使用权和目标状态，再运行相应 show 对照真实输入条件；没有素材时选择能承载现有材料的表达路径，或只暂停依赖该材料的部分。不得把风格摘要当作缺失素材的替代。",
    productionMatchesThatDoNotVerifyTheNeed: [...templates, ...effects].map((item) => ({
      id: item.id, itemType: item.itemType, availability: item.availability, purpose: item.purpose,
      command: item.nextStep.command,
    })),
    routes,
  };
}

function discoveryProductionCard(entry, itemType, terms, args) {
  if (!(["available", "conditional"].includes(entry.availability)) || !entry.renderer) return null;
  if (!discoveryFiltersMatch(entry, args, itemType)) return null;
  const motionUse = entry.motionUse || { intendedUse: "unknown", reuseScale: "unknown", ordinaryProductionCandidate: false };
  const match = scoreDiscoveryEntry(entry, terms);
  if (match.score <= 0) return null;
  const id = entry.productionId || entry.id;
  const card = {
    id,
    itemType,
    title: entry.name || entry.title || entry.id,
    availability: entry.availability,
    renderable: entry.availability === "available",
    rendererRegistered: true,
    renderer: productionRenderer(entry),
    intendedUse: motionUse.intendedUse,
    reuseScale: motionUse.reuseScale,
    ordinaryProductionCandidate: motionUse.ordinaryProductionCandidate === true,
    purpose: entry.purpose || entry.contentFit || entry.intent || entry.fixedMechanism || null,
    conditions: productionConditions(entry),
    match,
    nextStep: {
      command: `node scripts/templates.mjs show ${id}`,
      consumer: "该命令读取本地已登记的实际生产入口、字段、素材要求及条件；按其 renderer 后续制作。",
    },
  };
  if (motionUse.intendedUse === "reference") {
    card.referenceKind = motionUse.referenceKind || "reference";
    card.statusMeaning = "参考示例可检查或走技术预览；它不是普通新作品的生产候选。";
  } else if (motionUse.intendedUse !== "production-implementation" || motionUse.ordinaryProductionCandidate !== true) {
    card.statusMeaning = "用途分类未确认；保留查看入口，不作为普通生产候选。";
  }
  if (entry.availability === "conditional") {
    card.conditionsMeaning = card.conditions.length
      ? "这里仅展示目录卡实际登记的条件，不代表本次已经满足。"
      : "索引卡没有登记可展示的条件，继续前必须执行 show 核对完整条件。";
    if (motionUse.intendedUse === "production-implementation" && motionUse.ordinaryProductionCandidate === true) {
      card.statusMeaning = `条件生产实现；${card.conditionsMeaning}`;
    }
  }
  return card;
}

async function searchRegisteredStyles(catalog, query, category = null) {
  const library = catalog.styleLibrary;
  if (!library || library.format !== "laohu.motion.style-library/1" || !Number.isInteger(library.styleCount) || library.styleCount < 1) {
    throw new Error("Motion catalog does not point to a valid indexed local visual style library");
  }
  const script = path.resolve(skillDir, library.cli);
  const index = path.resolve(skillDir, library.indexPath);
  if (!isWithin(skillDir, script) || !isWithin(skillDir, index)) throw new Error("Style discovery CLI/index must stay inside the Motion Skill");
  const childArgs = [script, "search", "--index", index, "--query", query, "--limit", String(library.styleCount), "--json"];
  if (category) childArgs.push("--category", category);
  const child = spawnSync("python3", childArgs, {
    cwd: path.resolve(skillDir, "../../.."), encoding: "utf8", maxBuffer: 32 * 1024 * 1024, env: process.env,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Style discovery search failed: ${(child.stderr || child.stdout || "unknown error").trim()}`);
  let rows;
  try { rows = JSON.parse(child.stdout); } catch (error) { throw new Error(`Style discovery returned invalid JSON: ${error.message}`); }
  if (!Array.isArray(rows)) throw new Error("Style discovery search must return an array");
  if (rows.some((row) => row.route?.kind === "source-placeholder" || row.selectionEligible === false)) {
    throw new Error("Style discovery returned an excluded empty source placeholder");
  }
  return rows;
}

function styleDiscoveryCard(row, terms, registeredConsumers) {
  const route = row.route || {};
  const item = {
    id: row.id,
    title: row.name,
    category: row.category,
    routeKind: route.kind,
    callable: route.callable === true,
    renderer: route.renderer || null,
    previewPath: row.previewPath || null,
    resourceSummary: row.resourceSummary || null,
    sourceEvidence: {
      sourcePath: row.sourcePath || null,
      sourceSha256: row.sourceSha256 || null,
      contentPath: row.contentPath,
      localSha256: row.localSha256,
      licenseId: row.licenseId || null,
      dependencies: row.dependencies || [],
    },
    match: { score: Number(row.lexicalScore || 0), matchedTerms: terms.filter((term) => discoveryText([row.id, row.name, row.category, row.metadata, row.searchTerms]).toLowerCase().includes(term.toLowerCase())) },
  };
  if (route.kind === "remotion-canvas-function" && route.callable === true) {
    item.capability = "renderable-style-function";
    item.renderable = true;
    item.nextStep = {
      command: route.command,
      consumer: route.componentPath || route.renderer,
      note: "此入口可独立预览/渲染该函数；它不会自动加入当前 Film 时间线。",
    };
  } else if (route.kind === "reference-style" && route.callable === false) {
    item.capability = "style-reference";
    item.renderable = false;
    item.nextStep = {
      command: `node scripts/templates.mjs styles fulltext --query ${row.id}`,
      consumer: "完整风格卡供本片方向设计和逐镜核对；代码参数由新 Motion Showreel 工程实现。",
      registeredConsumersToInspect: registeredConsumers.map((consumer) => ({
        id: consumer.id, itemType: consumer.itemType, availability: consumer.availability,
        renderer: consumer.renderer, purpose: consumer.purpose, conditions: consumer.conditions,
        command: consumer.nextStep.command,
      })),
    };
    if (!registeredConsumers.length) {
      item.nextStep.materialConsumerHandoffRef = "$.materialHandoff";
      item.nextStep.materialConsumerHandoffNote = "本次没有匹配到可检查的 production consumer；materialHandoff 只列现存素材承载与获取入口，不表示它们实现了这条风格处理。";
    }
  } else if (route.kind === "complete-production-prompt" && route.callable === false) {
    item.capability = "style-prompt-reference";
    item.renderable = false;
    item.nextStep = {
      command: `node scripts/templates.mjs styles fulltext --query ${row.id}`,
      consumer: "完整风格文字只作为本镜风格参考；到下列本地生产候选的 show 入口核对真实可调字段后再决定能否承载。",
      registeredConsumersToInspect: registeredConsumers.map((consumer) => ({
        id: consumer.id, itemType: consumer.itemType, availability: consumer.availability,
        renderer: consumer.renderer,
        purpose: consumer.purpose,
        conditions: consumer.conditions,
        command: consumer.nextStep.command,
      })),
      note: "提示词不是可执行镜头；若现有 consumer 没有承接所需风格字段，不得凭摘要新画 Canvas/SVG/native/media/Three 场景。",
    };
    if (registeredConsumers.length === 0) {
      item.nextStep.materialConsumerHandoffRef = "$.materialHandoff";
      item.nextStep.materialConsumerHandoffNote = "本次没有匹配到可检查的生产 consumer；结果中的 materialHandoff 只列现存媒体承载/转场候选，不表示它们实现了这条风格提示。";
    }
  } else {
    throw new Error(`Unrecognized style route ${route.kind || "(missing)"} for ${row.id}`);
  }
  return item;
}

async function printDiscover(catalog, args) {
  if (!args.query?.trim()) throw new Error("discover requires --query with concrete viewing-relation/material/emotional-intensity or motion descriptors");
  const declaredStyleCount = catalog.styleLibrary?.styleCount;
  if (!Number.isInteger(declaredStyleCount) || declaredStyleCount < 1) {
    throw new Error("Motion catalog does not declare a valid indexed visual style count");
  }
  const limit = args.limit == null ? 3 : Number(args.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > declaredStyleCount) throw new Error(`discover --limit must be an integer from 1 to ${declaredStyleCount}; the value is applied per result group and per style category`);
  const terms = discoveryTerms(args);
  if (!terms.length) throw new Error("discover --query has no searchable descriptors after generic words were removed; give concrete terms such as 明亮/像素/层级/对比/实拍");
  const scoredResources = [
    ...(catalog.templates || []).map((entry) => discoveryProductionCard(entry, "template", terms, args)),
    ...(catalog.effects || []).map((entry) => discoveryProductionCard(entry, "effect", terms, args)),
  ].filter(Boolean).sort((a, b) => b.match.score - a.match.score || a.id.localeCompare(b.id));
  const scoredProduction = scoredResources.filter((item) => item.intendedUse === "production-implementation" && item.ordinaryProductionCandidate === true);
  const referenceDemonstrations = scoredResources.filter((item) => item.intendedUse === "reference");
  const unclassifiedResources = scoredResources.filter((item) => !["production-implementation", "reference"].includes(item.intendedUse));
  const templates = scoredProduction.filter((item) => item.itemType === "template");
  const effects = scoredProduction.filter((item) => item.itemType === "effect");

  const methods = [];
  for (const entry of catalog.methods || []) {
    if (!discoveryFiltersMatch(entry, args, "method")) continue;
    const localRule = await readLocalRuleRef(entry.localRuleRef);
    const scored = scoreDiscoveryEntry({ ...entry, methodContents: localRule.contents }, terms);
    if (scored.score <= 0) continue;
    methods.push({
      id: localMethodId(entry), itemType: "method", title: entry.title || entry.name,
      availability: "local-method", renderable: false, localRuleRef: entry.localRuleRef,
      readWhen: entry.readWhen, match: scored,
      nextStep: { command: `node scripts/templates.mjs show ${localMethodId(entry)}`, consumer: "读取本地方法卡，用于镜头/材料决策；它本身不是可渲染对象。" },
    });
  }
  methods.sort((a, b) => b.match.score - a.match.score || a.id.localeCompare(b.id));

  const styleIndexPath = path.resolve(skillDir, catalog.styleLibrary.indexPath);
  if (!isWithin(skillDir, styleIndexPath)) throw new Error("Style discovery index must stay inside the Motion Skill");
  const styleIndex = JSON.parse(await fs.readFile(styleIndexPath, "utf8"));
  const coverage = styleIndex.coverage || {};
  const styleEntries = Array.isArray(styleIndex.entries) ? styleIndex.entries : [];
  const actualCallable = styleEntries.filter((row) => row.route?.kind === "remotion-canvas-function" && row.route.callable === true).length;
  const actualPrompts = styleEntries.filter((row) => row.route?.kind === "complete-production-prompt" && row.route.callable === false).length;
  const actualPlaceholders = styleEntries.filter((row) => row.route?.kind === "source-placeholder" && row.selectionEligible === false).length;
  const actualReferenceStyles = styleEntries.filter((row) => row.route?.kind === "reference-style" && row.route.callable === false).length;
  const actualPreviewCount = styleEntries.filter((row) => typeof row.previewPath === "string" && row.previewPath.length > 0).length;
  const actualNonCallableCodePrompts = styleEntries.filter((row) => row.category === "A-G_代码样片" && row.route?.kind === "complete-production-prompt" && row.route.callable === false).length;
  const categoryCounts = {};
  for (const row of styleEntries) {
    if (typeof row.id !== "string" || !row.id.trim() || typeof row.category !== "string" || !row.category.trim()) {
      throw new Error("Style index contains a record without a stable ID or category");
    }
    categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1;
    const route = row.route || {};
    const validRouteState = route.kind === "remotion-canvas-function"
      ? route.callable === true && row.selectionEligible === true
      : route.kind === "complete-production-prompt"
        ? route.callable === false && row.selectionEligible === true
        : route.kind === "source-placeholder"
          ? route.callable === false && row.selectionEligible === false
        : route.kind === "reference-style"
          ? route.callable === false && row.kind === "style-reference" && row.selectionEligible === true
          : false;
    if (!validRouteState) throw new Error(`Style index route identity/eligibility disagrees for ${row.id}`);
  }
  const declaredCategories = coverage.categories && typeof coverage.categories === "object" && !Array.isArray(coverage.categories)
    ? coverage.categories
    : null;
  const categoryIdentityMatches = declaredCategories
    && Object.keys(categoryCounts).length === Object.keys(declaredCategories).length
    && Object.entries(categoryCounts).every(([category, count]) => declaredCategories[category] === count)
    && Object.values(declaredCategories).reduce((sum, count) => sum + count, 0) === styleEntries.length;
  const uniqueIds = new Set(styleEntries.map((row) => row.id));
  if (styleIndex.format !== "laohu.motion.style-library/1"
      || !Number.isInteger(coverage.styleCount) || coverage.styleCount < 1
      || styleEntries.length !== coverage.styleCount || declaredStyleCount !== coverage.styleCount
      || uniqueIds.size !== styleEntries.length
      || !categoryIdentityMatches
      || coverage.previewCount !== actualPreviewCount
      || coverage.callableCanvasFunctions !== actualCallable
      || coverage.completePromptRoutes !== actualPrompts
      || coverage.nonCallableCodePrompts !== actualNonCallableCodePrompts
      || coverage.sourcePlaceholders !== actualPlaceholders
      || actualCallable + actualPrompts + actualPlaceholders + actualReferenceStyles !== coverage.styleCount
      || actualCallable + actualPrompts + actualPlaceholders + actualReferenceStyles !== styleEntries.length) {
    throw new Error("Style index coverage is inconsistent with its registered entries or catalog declaration; rebuild the index before discover");
  }
  const styleRows = await searchRegisteredStyles(catalog, terms.join(" "), args.category || null);
  const consumerCandidates = [...templates, ...effects];
  const styleItems = styleRows.map((row) => styleDiscoveryCard(row, terms, consumerCandidates));
  const grouped = new Map();
  for (const style of styleItems) {
    const group = grouped.get(style.category) || [];
    group.push(style);
    grouped.set(style.category, group);
  }
  const styleCategories = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, rows]) => ({
    category, matched: rows.length, shown: Math.min(limit, rows.length),
    candidates: rows.sort((a, b) => b.match.score - a.match.score || a.id.localeCompare(b.id)).slice(0, limit),
  }));
  const supportLibraries = (catalog.effectLibraries || []).map((entry) => ({
    id: entry.id, title: entry.name, availability: entry.availability, renderable: false,
    purpose: entry.usageContract || entry.fixedMechanism || null,
    nextStep: { command: `node scripts/templates.mjs show ${entry.id}`, consumer: "依赖/函数支撑库，不能作为单独效果或镜头渲染。" },
  }));
  const productionEntries = [...(catalog.templates || []), ...(catalog.effects || [])];
  const needsMaterialInspection = typeof args.needs === "string" && args.needs.trim().length > 0;
  const handoffRoutes = (templates.length === 0 && effects.length === 0) || needsMaterialInspection
    ? materialHandoffRoutes(catalog)
    : [];
  const materialHandoff = materialRequirementHandoff(handoffRoutes, args, templates, effects);
  const unrouted = productionEntries.filter((entry) => ["available", "conditional"].includes(entry.availability) && !entry.renderer);
  const result = {
    format: "laohu.motion.visual-discovery/1",
    query: { original: args.query, terms, content: args.content || null, needs: args.needs || null, intent: args.intent || null, family: args.family || null, target: args.target || null, runtime: args.runtime || null, category: args.category || null },
    retrieval: {
      method: "lexical lookup across registered local metadata and indexed style text; not semantic interpretation or automatic aesthetic selection",
      note: "Matches and lexical scores do not prove visual fit. Review source-located summaries, original content, source state, registered consumer contracts and actual shot materials before composition.",
      limitMeaning: "--limit is a presentation cap for each production result group, method group and style category. It is not a quality threshold; category groups are never truncated by one global head-first list, and no minimum candidate count is required.",
    },
    counts: {
      production: {
        templatesAvailable: catalog.templates.filter((entry) => entry.motionUse?.ordinaryProductionCandidate === true && entry.availability === "available" && !!entry.renderer).length,
        templatesConditional: catalog.templates.filter((entry) => entry.motionUse?.ordinaryProductionCandidate === true && entry.availability === "conditional" && !!entry.renderer).length,
        effectsAvailable: (catalog.effects || []).filter((entry) => entry.motionUse?.ordinaryProductionCandidate === true && entry.availability === "available" && !!entry.renderer).length,
        effectsConditional: (catalog.effects || []).filter((entry) => entry.motionUse?.ordinaryProductionCandidate === true && entry.availability === "conditional" && !!entry.renderer).length,
        referenceDemonstrationsMatched: referenceDemonstrations.length,
        unclassifiedMatched: unclassifiedResources.length,
        notRouted: unrouted.map((entry) => ({ id: entry.productionId || entry.id, itemType: catalog.templates.includes(entry) ? "template" : "effect", availability: entry.availability, nextStep: { command: `node scripts/templates.mjs show ${entry.productionId || entry.id}`, consumer: "目录状态未接到已登记 renderer；show 核对接口后才可判断生产路径。" } })),
      },
      methodsIndexed: (catalog.methods || []).length,
      styleLibrary: { total: coverage.styleCount, previews: coverage.previewCount, callableCanvasFunctions: coverage.callableCanvasFunctions, completePrompts: coverage.completePromptRoutes, referenceStyles: actualReferenceStyles, excludedEmptyPlaceholders: coverage.sourcePlaceholders, categories: Object.keys(coverage.categories || {}).length },
      matched: { templates: templates.length, effects: effects.length, methods: methods.length, styles: styleItems.length, styleCategories: styleCategories.length },
      returned: { templates: Math.min(limit, templates.length), effects: Math.min(limit, effects.length), methods: Math.min(limit, methods.length), styles: styleCategories.reduce((sum, group) => sum + group.candidates.length, 0) },
    },
    candidates: {
      renderable: templates.filter((item) => item.availability === "available").slice(0, limit),
      conditional: templates.filter((item) => item.availability === "conditional").slice(0, limit),
      referenceDemonstrations: referenceDemonstrations.slice(0, limit),
      unclassified: unclassifiedResources.slice(0, limit),
      effects: effects.slice(0, limit),
      effectsRenderable: effects.filter((item) => item.availability === "available").slice(0, limit),
      effectsConditional: effects.filter((item) => item.availability === "conditional").slice(0, limit),
      methods: methods.slice(0, limit),
      styleCategories,
      supportLibraries,
      excludedPlaceholderCount: coverage.sourcePlaceholders,
    },
    ...(materialHandoff ? { materialHandoff } : {}),
  };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`视觉发现：${args.query}\n检索词：${terms.join("、")}\n`);
  process.stdout.write("检索是词面索引，摘要保留原文定位；词面分数不代表适配或审美判断。\n");
  const printCards = (label, rows) => {
    process.stdout.write(`\n${label}（匹配 ${rows.length}，显示 ${Math.min(limit, rows.length)}）\n`);
    for (const row of rows.slice(0, limit)) {
      const condition = row.availability === "conditional" ? `\n  条件：${row.conditions.join("；") || "请检查 show 卡"}` : "";
      process.stdout.write(`- ${row.id} [${row.availability}] ${row.title}${condition}\n  查看：${row.nextStep.command}\n`);
    }
  };
  printCards("可直接进入已登记 renderer 的模板", templates.filter((item) => item.availability === "available"));
  printCards("需逐项满足条件的模板", templates.filter((item) => item.availability === "conditional"));
  printCards("仅供查看或技术预览的参考示例", referenceDemonstrations);
  printCards("用途尚未分类、不能作为生产候选的条目", unclassifiedResources);
  printCards("已登记局部效果", effects);
  printCards("本地方法卡（不可渲染）", methods);
  process.stdout.write(`\n风格卡命中 ${styleItems.length} 条；按 ${styleCategories.length} 个来源类别分组（每类最多 ${limit} 条）：\n`);
  for (const group of styleCategories) {
    process.stdout.write(`- ${group.category} (${group.matched})\n`);
    for (const row of group.candidates) process.stdout.write(`  ${row.id} [${row.capability}] ${row.title} → ${row.nextStep.command}\n`);
  }
  process.stdout.write(`\n风格库：${coverage.styleCount} 条（${coverage.callableCanvasFunctions} 个可直接渲染函数，${coverage.completePromptRoutes} 条完整提示词，${coverage.sourcePlaceholders} 个空占位已排除）。完整提示词不是镜头；风格需落到真实登记 consumer 的字段。\n`);
  if (result.materialHandoff) {
    process.stdout.write(`\n材料需求交接：${result.materialHandoff.status}。${result.materialHandoff.nextStep}\n`);
    for (const route of result.materialHandoff.routes) {
      process.stdout.write(`- ${route.id} [${route.availability}; renderable=${route.renderable}] ${route.mediaType}\n  ${route.role} ${route.boundary}\n  条件：${route.conditions.join("；") || "无目录条件字段；仍须检查 show"}\n  列表：${route.nextStep.listCommand}\n  检查：${route.nextStep.command}\n`);
    }
  }
}

async function printShow(entry, asJson, catalog, args = {}) {
  if (isLocalMethod(entry) && !args.research && !args.all) {
    const localRule = await readLocalRuleRef(entry.localRuleRef);
    const methodEntry = { ...entry, methodContents: localRule.contents };
    if (asJson) {
      process.stdout.write(`${JSON.stringify(productionMethodView(methodEntry, true), null, 2)}\n`);
      return;
    }
    const id = localMethodId(entry);
    process.stdout.write(`${entry.title || entry.name} (${id})\n`);
    process.stdout.write("能力：本地方法参考；可用于制作判断，不是可直接渲染的模板或效果。\n");
    process.stdout.write(`适用情境：${entry.readWhen}\n`);
    process.stdout.write(`本地规则：${localRule.relative}#${localRule.anchor}\n\n`);
    process.stdout.write(localRule.contents.endsWith("\n") ? localRule.contents : `${localRule.contents}\n`);
    return;
  }
  if (entry.availability === "source-only" && !args.research && !args.all) {
    throw new Error(`${entry.productionId || entry.id} is a maintenance/research record; pass --research to inspect source-only evidence`);
  }
  if (asJson) {
    process.stdout.write(`${JSON.stringify(args.research || args.all ? entry : productionView(entry), null, 2)}\n`);
    return;
  }
  const id = entry.productionId || entry.id;
  const title = entry.name || (typeof entry.title === "string" ? entry.title : entry.title?.zh || entry.title?.en) || entry.templateId || id;
  process.stdout.write(`${title} (${id})\n`);
  if (entry.availability) process.stdout.write(`可调用状态：${entry.availability}\n`);
  if (entry.purpose || entry.contentFit) process.stdout.write(`用途：${entry.purpose || entry.contentFit}\n`);
  if (entry.fixedMechanism) process.stdout.write(`实际机制：${entry.fixedMechanism}\n`);
  if (entry.renderer) process.stdout.write(`渲染入口：${productionRenderer(entry)}\n`);
  if (entry.inputRequirements?.length) process.stdout.write(`输入：${entry.inputRequirements.join("；")}\n`);
  if (entry.renderPreconditions?.length) process.stdout.write(`运行条件：${entry.renderPreconditions.join("；")}\n`);
  if (entry.parameters) process.stdout.write(`可用字段：${JSON.stringify(entry.parameters)}\n`);
  if (entry.conditions?.length) process.stdout.write(`条件：${entry.conditions.join("；")}\n`);
  if (entry.adapter?.path) process.stdout.write(`本地适配器：${entry.adapter.path}\n`);
  if (entry.renderer === "native-style-scene") {
    process.stdout.write(`调用：node scripts/templates.mjs prepare ${id} --input <spec.json> --output <prepared.json>\n`);
    process.stdout.write(`调用：node scripts/templates.mjs preview ${id} --spec <prepared.json> --output <frame.png> --time <seconds>\n`);
    process.stdout.write(`调用：node scripts/templates.mjs render ${id} --spec <prepared.json> --output <scene.mp4> --cache-dir <external-cache>\n`);
  }
  if (entry.limitations?.length) process.stdout.write(`边界：${entry.limitations.join("；")}\n`);
  if (args.research || args.all) process.stdout.write(`来源记录：${entry.sourceId || "unknown"} · ${entry.sourcePath || entry.catalogRole || "catalog record"}\n`);
}

async function projectCacheRoots(workRootValue) {
  const requestedRoot = workRootValue || process.env.WORK_ROOT || process.cwd();
  if (typeof requestedRoot !== "string" || !path.isAbsolute(requestedRoot)) {
    throw new Error("WORK_ROOT must be absolute; otherwise run from the project root or pass an absolute --work-root");
  }
  const projectRoot = path.resolve(requestedRoot);
  const realRoot = await fs.realpath(projectRoot).catch((error) => {
    throw new Error(`WORK_ROOT is not an existing readable directory: ${projectRoot} (${error.message})`);
  });
  const rootStat = await fs.stat(realRoot);
  if (!rootStat.isDirectory()) throw new Error(`WORK_ROOT is not a directory: ${projectRoot}`);
  if (isWithin(skillDir, projectRoot) || isWithin(await fs.realpath(skillDir), realRoot)) {
    throw new Error("WORK_ROOT cannot be inside the installed Motion skill; choose the user's project or media workspace");
  }
  return {
    projectRoot,
    cache: path.join(projectRoot, ".cache"),
    temporary: path.join(projectRoot, ".cache", "tmp"),
  };
}

async function requireStyleMediaOutput(outputValue, label = "media output", workRootValue) {
  if (!outputValue) throw new Error(`${label} is required`);
  const output = path.resolve(outputValue);
  const roots = await projectCacheRoots(workRootValue);
  if (isWithin(skillDir, output) && !isWithin(roots.cache, output)) {
    throw new Error(`${label} cannot be written into the installed Motion skill; choose an external WORK_ROOT or project .cache path`);
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  const existing = await fs.lstat(output).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (existing) throw new Error(`${label} already exists; choose a new path to preserve it: ${output}`);
  return output;
}

async function prepareComicPopScene(args, catalog, entry) {
  requireNativeStyleScene(entry, "prepare");
  if (!args.input || !args.output) throw new Error("prepare comic-pop-reaction requires --input and --output");
  const inputPath = path.resolve(args.input);
  const inputBytes = await fs.readFile(inputPath);
  const input = JSON.parse(inputBytes.toString("utf8"));
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Template input must be a JSON object");
  if (input.templateId != null && !matchesCatalogId(entry, input.templateId)) throw new Error(`Spec templateId is ${JSON.stringify(input.templateId)}; expected ${entry.id} or a declared alias`);
  if (!Number.isFinite(input.duration) || input.duration <= 0 || input.duration * 30 > 1800) throw new Error("duration must be > 0 and no longer than 60 seconds at the fixed 30 fps output rate");
  if (input.fps != null && input.fps !== 30) throw new Error("comic-pop-reaction uses the source scene's measured 30 fps action clock");
  if (Math.abs(input.duration * 30 - Math.round(input.duration * 30)) > 1e-7) throw new Error("duration × 30 must be a whole frame count");
  if (input.width != null && input.width !== 1920) throw new Error("comic-pop-reaction is fixed at 1920×1080");
  if (input.height != null && input.height !== 1080) throw new Error("comic-pop-reaction is fixed at 1920×1080");
  const parameters = input.parameters || {};
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("parameters must be a JSON object");
  const allowed = new Set(["caption", "impactWord", "posterImage"]);
  for (const key of Object.keys(parameters)) if (!allowed.has(key)) throw new Error(`parameters.${key} is not consumed by the original scene adapter`);
  for (const key of ["caption", "impactWord"]) {
    if (parameters[key] == null) continue;
    if (typeof parameters[key] !== "string" || !parameters[key].trim()) throw new Error(`parameters.${key} must be non-empty text`);
    if (parameters[key].length > 80) throw new Error(`parameters.${key} exceeds 80 characters; the original fixed box has no multiline or shrink-to-fit control`);
    if (/[\r\n\u2028\u2029]/u.test(parameters[key])) throw new Error(`parameters.${key} must be one line`);
  }

  const sourceVerification = await verifyLocalStyleSceneRuntime(catalog, entry);
  const data = {
    sourceTemplateId: entry.id,
    ...(parameters.caption != null ? { caption: parameters.caption } : {}),
    ...(parameters.impactWord != null ? { impactWord: parameters.impactWord } : {}),
  };
  const assetsRoot = path.resolve(args.assetsRoot || path.dirname(inputPath));
  const assets = [];
  if (parameters.posterImage != null) {
    const resolved = await resolveLocalAsset(parameters.posterImage, assetsRoot, "parameters.posterImage");
    if (resolved.dataUrl) throw new Error("parameters.posterImage must be an authorized local raster file, not an inline or remote image");
    const extension = path.extname(resolved.input).toLowerCase();
    const contentTypeByExtension = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
    const contentType = contentTypeByExtension[extension];
    if (!contentType) throw new Error("parameters.posterImage supports local PNG, JPEG, or WebP files only");
    const bytes = await fs.readFile(resolved.input);
    const isPng = bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isWebp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!(contentType === "image/png" ? isPng : contentType === "image/jpeg" ? isJpeg : isWebp)) {
      throw new Error("parameters.posterImage extension and image bytes do not match");
    }
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("parameters.posterImage must be a non-empty local file no larger than 20 MiB");
    data.posterImageDataUrl = `data:${contentType};base64,${bytes.toString("base64")}`;
    assets.push({ label: "parameters.posterImage", path: resolved.relative, sha256: sha256(bytes), bytes: bytes.length, contentType });
  }
  const prepared = {
    version: 1,
    templateId: entry.id,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: input.duration,
    background: "transparent",
    objects: [{ id: "comic-pop-reaction", type: entry.adapter.entrypoint, space: "screen", data }],
  };
  const output = await requireStyleMediaOutput(args.output, "prepared scene output", args.workRoot);
  const receiptPath = `${output}.assets.json`;
  await requireStyleMediaOutput(receiptPath, "prepared scene receipt", args.workRoot);
  const preparedBytes = Buffer.from(`${JSON.stringify(prepared, null, 2)}\n`);
  const receipt = {
    kind: "native-style-scene-input-receipt",
    templateId: entry.id,
    sourceId: entry.sourceId,
    sourceCommit: catalog.sources.find((source) => source.id === entry.sourceId).commit,
    sourceVerification,
    adapter: { path: entry.adapter.path, entrypoint: entry.adapter.entrypoint, effectLibraryId: entry.adapter.effectLibraryId, localRuntimeManifestSha256: entry.adapter.localRuntimeManifestSha256 },
    preparedSpecSha256: sha256(preparedBytes),
    spec: prepared,
    assetsRoot,
    assets,
  };
  await fs.writeFile(output, preparedBytes, { flag: "wx" });
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`PREPARED ${output}\nASSET_RECEIPT ${receiptPath}\nTEMPLATE ${productionDisplayId(entry)}\nLOCAL_CLOSURE ${sourceVerification.sourceClosureSha256}\n`);
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
  const valueAt = (root, field) => field.split(".").reduce((value, key) => value == null ? undefined : value[key], root);
  // The raw Art Motion page is not OM's CLIP.mount wrapper. Accepting these
  // controls would claim pacing/voice binding that this renderer never runs.
  if (Object.hasOwn(spec, "pace")) throw new Error("native-clip does not consume pace; resolve cue times explicitly or use the source OM template runtime that implements CLIP.mount/ClipCues");
  for (const ignored of entry.parameters?.declaredOnlyIgnoredSpecData || []) {
    if (valueAt(spec, ignored.path) !== undefined) throw new Error(`${entry.id} does not consume ${ignored.path}; remove this ineffective control or choose a renderer that implements it`);
  }
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
    for (const field of ["word", "nth", "edge", "offset"]) {
      if (Object.hasOwn(cue, field)) throw new Error(`cues[${index}].${field} is not consumed by native-clip; bind the real narration time to at before rendering, or use the source OM cue-binding runtime`);
    }
    for (const alternative of entry.sourceSchema?.needs?.[cue.kind] || []) {
      if (!alternative.split("|").some((field) => valueAt(cue, field) != null)) {
        throw new Error(`cues[${index}] ${cue.kind} requires ${alternative} per the source cue contract`);
      }
    }
    if (entry.grammar === "y1_kurzgesagt" && cue.kind === "enter" && cue.data && Object.hasOwn(cue.data, "dur")) {
      throw new Error(`cues[${index}].data.dur is not consumed by y1 enter; put dur beside at/kind (cues[${index}].dur), not inside data`);
    }
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
  const productionId = productionDisplayId(entry);
  if (entry.availability === "source-only") {
    throw new Error(productionId + " is not callable yet; " + action + " requires a verified local native-scene route");
  }
  if (entry.renderer !== "native-om-template-source" || entry.sourceId !== "huashu-motion"
      || !/^templates\/[a-z0-9][a-z0-9-]*\/index\.html$/.test(entry.sourcePath || "")) {
    throw new Error(productionId + " is not a locally callable native-scene template; " + action + " requires a production catalog entry routed through the verified native-scene adapter");
  }
}

function validateNativeOmCues(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.words)) throw new Error("omCues must be an object with a words array using the original OM cue format");
  let lastStart = -Infinity;
  const words = value.words.map((word, index) => {
    if (!word || typeof word !== "object" || Array.isArray(word) || typeof word.word !== "string" || !word.word.trim()) throw new Error("omCues.words[" + index + "] requires a non-empty word string");
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end < word.start || word.start < lastStart) throw new Error("omCues.words[" + index + "] must preserve nondecreasing finite start/end seconds");
    lastStart = word.start;
    return structuredClone(word);
  });
  return { ...structuredClone(value), words };
}

function applyNativeOmCues(html, cues) {
  if (!cues) return html;
  const body = `<script type="application/json" id="om-cues">${JSON.stringify(cues).replace(/</g, "\\u003c")}</script>`;
  const withoutExisting = html.replace(/<script\b(?=[^>]*\bid\s*=\s*["']om-cues["'])[^>]*>[\s\S]*?<\/script>/gi, "");
  const head = /<head\b[^>]*>/i.exec(withoutExisting);
  if (head) {
    const at = head.index + head[0].length;
    return withoutExisting.slice(0, at) + "\n" + body + withoutExisting.slice(at);
  }
  const htmlTag = /<html\b[^>]*>/i.exec(withoutExisting);
  if (htmlTag) {
    const at = htmlTag.index + htmlTag[0].length;
    return withoutExisting.slice(0, at) + "\n" + body + withoutExisting.slice(at);
  }
  const firstScript = /<script\b/i.exec(withoutExisting);
  const at = firstScript ? firstScript.index : 0;
  return withoutExisting.slice(0, at) + body + "\n" + withoutExisting.slice(at);
}

function validateNativeOmScore(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) throw new Error("omScore must be a non-empty ABC score string when supplied");
  if (/<\/script\b/i.test(value)) throw new Error("omScore must not contain a closing script tag");
  return value;
}

function validateNativeOmMusic(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("omMusic must be an object using the original OM.music control contract");
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "off" || value.off !== true) throw new Error("omMusic currently supports only { off: true } to disable the original OM default music source");
  return { off: true };
}

function applyNativeOmMusic(html, music) {
  if (!music) return html;
  const body = `<script>if (!window.OM || typeof OM.music !== "function") throw new Error("native OM music adapter could not find the original OM.music API"); OM.music(${JSON.stringify(music)});</script>`;
  const closeBody = /<\/body\s*>/i.exec(html);
  if (closeBody) return html.slice(0, closeBody.index) + body + "\n" + html.slice(closeBody.index);
  return html + "\n" + body + "\n";
}

function applyNativeOmScore(html, score) {
  if (score == null) return html;
  const body = `<script type="text/vnd.abc" id="om-score">${score}</script>`;
  const withoutExisting = html.replace(/<script\b(?=[^>]*\bid\s*=\s*["']om-score["'])[^>]*>[\s\S]*?<\/script>/gi, "");
  const head = /<head\b[^>]*>/i.exec(withoutExisting);
  if (head) {
    const at = head.index + head[0].length;
    return withoutExisting.slice(0, at) + "\n" + body + withoutExisting.slice(at);
  }
  const firstScript = /<script\b/i.exec(withoutExisting);
  const at = firstScript ? firstScript.index : 0;
  return withoutExisting.slice(0, at) + body + "\n" + withoutExisting.slice(at);
}

async function probeNativeOmRuntime(projectPath, runtimeRoot, browserPath) {
  const htmlPath = path.join(projectPath, "index.html");
  const html = await fs.readFile(htmlPath, "utf8");
  const captureApi = await import(pathToFileURL(path.join(runtimeRoot, "cli", "lib", "capture.js")).href);
  const soundApi = await import(pathToFileURL(path.join(runtimeRoot, "cli", "lib", "sound.js")).href);
  const composedApi = await import(pathToFileURL(path.join(runtimeRoot, "cli", "lib", "composed.js")).href);
  const film = await captureApi.openFilm(htmlPath, { chrome: browserPath, video: "seek", lenient: true });
  try {
    const declaration = await soundApi.probe({ root: projectPath, index: htmlPath, om: path.join(projectPath, ".om") }, html, film);
    const cueEvidence = JSON.parse(await film.evaluate("JSON.stringify((() => { const words = window.OM && OM.words ? OM.words() : []; const cues = window.CLIP && CLIP.ctx && CLIP.ctx.spec ? CLIP.ctx.spec.cues : []; return { words, timelineIds: Object.keys(window.__timelines || {}), clipProblems: window.CLIP && Array.isArray(CLIP.problems) ? CLIP.problems : [], clipCues: cues.map((q, cueIndex) => { let wordTimeSec = null; if (q.word) { if (window.OM && OM.cue) { try { const value = OM.cue(q.word, q.nth || 1, q.edge); if (Number.isFinite(value)) wordTimeSec = value; } catch {} } if (!Number.isFinite(wordTimeSec) && window.ClipCues && ClipCues.findWord) { try { const value = ClipCues.findWord(words, q.word, q.nth || 1, q.edge); if (Number.isFinite(value)) wordTimeSec = value; } catch {} } } return { cueIndex, kind: q.kind, word: q.word || null, nth: q.nth || 1, edge: q.edge || \"start\", offsetSec: Number(q.offset) || 0, wordTimeSec, atSec: q.at, sfx: q.sfx === undefined ? null : q.sfx }; }) }; })())"));
    const scoreText = composedApi.readScore(html);
    const sourcePlan = soundApi.plan({ ...declaration, voice: false });
    const sourceDeclaration = {
      id: declaration.id,
      duration: declaration.duration,
      labels: declaration.labels || {},
      hits: declaration.hits || [],
      music: declaration.music || {},
    };
    const sourcePlanData = JSON.parse(JSON.stringify(sourcePlan));
    const sourceDeclarationSha256 = sha256(Buffer.from(canonical(sourceDeclaration), "utf8"));
    const sourcePlanSha256 = sha256(Buffer.from(canonical(sourcePlanData), "utf8"));
    let composer = null;
    if (scoreText && !declaration.music?.off) {
      const composed = composedApi.renderComposed(scoreText, {
        labels: declaration.labels || {},
        marks: declaration.music?.marks || {},
        duration: sourcePlan.duration,
        seed: sourcePlan.seed,
      });
      composer = {
        scoreSha256: sha256(Buffer.from(scoreText, "utf8")),
        scoreText,
        cues: (composed.perf?.cues || []).filter((cue) => ["hit", "rise"].includes(cue.type)),
        hits: composed.hits || [],
        report: composed.report || null,
      };
    }
    if (cueEvidence.timelineIds.length !== 1) throw new Error("native OM runtime probe requires exactly one original timeline; found " + cueEvidence.timelineIds.length);
    if (declaration.errors?.length) throw new Error("original OM sound probe reported errors: " + declaration.errors.join("; "));
    return {
      format: "laohu.huashu-native-om-runtime-probe/1",
      timelineId: declaration.id,
      durationSec: declaration.duration,
      labels: declaration.labels || {},
      sound: { hits: declaration.hits || [], music: declaration.music || {} },
      sourceDeclaration,
      sourceDeclarationSha256,
      sourcePlan: sourcePlanData,
      sourcePlanSha256,
      soundPlan: { durationSec: sourcePlan.duration, seed: sourcePlan.seed, kit: scoreText && !declaration.music?.kit ? "cinematic" : sourcePlan.kit, root: sourcePlan.root, scale: sourcePlan.scale },
      cueEvidence: { words: cueEvidence.words, timelineIds: cueEvidence.timelineIds, clipProblems: cueEvidence.clipProblems, clipCues: cueEvidence.clipCues, source: "original OM.words(), initialized CLIP.ctx.spec, OM.cue and ClipCues.findWord" },
      sourceScore: scoreText ? { scoreSha256: sha256(Buffer.from(scoreText, "utf8")), scoreText, musicOff: Boolean(declaration.music?.off) } : null,
      composer,
      source: { sourceSoundApi: "cli/lib/sound.js probe(project, html, initializedPage)", cueApi: "runtime/om.js OM.words()", scoreApi: scoreText ? "cli/lib/composed.js readScore/renderComposed" : null },
    };
  } finally {
    await film.close();
  }
}

function nativeOmTemplateName(entry) {
  const match = /^templates\/([^/]+)\/index\.html$/.exec(entry.sourcePath || "");
  if (!match) throw new Error(entry.id + " has no recognized native OM template source path");
  return match[1];
}

async function ensureNativeWorkRoot(workRootValue, relatedPaths = []) {
  if (!workRootValue || !path.isAbsolute(workRootValue)) throw new Error("native-scene commands require an absolute --work-root on the same volume as the project");
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

async function preflightNativeOmFfmpeg(args) {
  const executable = args.ffmpeg ? path.resolve(args.ffmpeg) : "ffmpeg";
  const env = { ...process.env };
  if (args.ffmpeg) {
    if (!(await fs.stat(executable).catch(() => null))) throw new Error("--ffmpeg does not exist: " + executable);
    env.PATH = path.dirname(executable) + path.delimiter + (env.PATH || "");
  }
  return preflightFfmpeg(executable, { env });
}

async function nativeOmExecutables(runtimeRoot, args, tempRoot) {
  const browserApi = await import(pathToFileURL(path.join(runtimeRoot, "cli", "lib", "browser.js")).href);
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
    omCli: path.join(runtimeRoot, "cli", "laohu-film.mjs"),
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

function gitBlobSha1(bytes) {
  return crypto.createHash("sha1").update(Buffer.from("blob " + bytes.length + "\0")).update(bytes).digest("hex");
}

async function verifyNativeOmRuntime(entry, catalog) {
  const declared = entry.localRuntime;
  if (!declared || declared.directory !== "templates/runtime/laohu-film-native"
      || declared.manifestPath !== "templates/runtime/laohu-film-native/closure.json") {
    throw new Error(entry.id + " has no selected local native-OM runtime closure");
  }
  const runtimeRoot = path.resolve(skillDir, declared.directory);
  const manifestPath = path.resolve(skillDir, declared.manifestPath);
  if (!isWithin(path.join(skillDir, "templates", "runtime"), runtimeRoot)
      || !isWithin(runtimeRoot, manifestPath)) throw new Error(entry.id + " local native-OM runtime escapes templates/runtime");
  const manifestBytes = await fs.readFile(manifestPath);
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== declared.manifestSha256) throw new Error(entry.id + " local native-OM closure manifest differs from its catalog pin");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const source = sourceById(catalog, entry.sourceId).source;
  if (manifest.format !== "laohu.motion.native-om-runtime-closure/1"
      || manifest.source?.id !== source.id
      || manifest.source?.commit !== source.commit) {
    throw new Error(entry.id + " local closure source identity/commit does not match the catalog entry");
  }
  const templateName = nativeOmTemplateName(entry);
  if (!manifest.templates?.[templateName]) throw new Error(entry.id + " is not included in the local native-OM closure");
  for (const file of manifest.files || []) {
    const absolute = path.resolve(runtimeRoot, file.path);
    if (!isWithin(runtimeRoot, absolute)) throw new Error(entry.id + " local closure file escapes runtime root: " + file.path);
    const bytes = await fs.readFile(absolute);
    if (sha256(bytes) !== file.sha256) throw new Error(entry.id + " local closure file hash mismatch: " + file.path);
  }
  for (const file of manifest.sharedExactByteModules || []) {
    const absolute = path.resolve(skillDir, file.localPath);
    if (!isWithin(path.join(skillDir, "templates", "runtime"), absolute)) throw new Error(entry.id + " shared local closure path escapes templates/runtime");
    const bytes = await fs.readFile(absolute);
    if (sha256(bytes) !== file.sourceSha256) throw new Error(entry.id + " shared local exact-byte module hash mismatch: " + file.localPath);
  }
  return { runtimeRoot, manifest, manifestSha256, verification: { ok: true, checkedFiles: (manifest.files || []).length + (manifest.sharedExactByteModules || []).length, sourceCommit: manifest.source.commit } };
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
  if (input.templateId != null && !matchesCatalogId(entry, input.templateId)) throw new Error("input templateId is " + JSON.stringify(input.templateId) + "; expected " + entry.id + " or a declared alias");
  const fps = input.fps == null ? 30 : input.fps;
  if (![24, 25, 30, 50, 60].includes(fps)) throw new Error("fps must be one of 24, 25, 30, 50, or 60");
  const width = input.width == null ? 1920 : input.width;
  const height = input.height == null ? 1080 : input.height;
  if (width !== 1920 || height !== 1080) throw new Error("these native OM sources are authored for 1920x1080; use another renderer for a different frame");
  const runtime = await verifyNativeOmRuntime(entry, catalog);
  const sourceVerification = runtime.verification;
  const runtimeRoot = runtime.runtimeRoot;
  const templateName = nativeOmTemplateName(entry);
  const htmlPath = path.join(runtimeRoot, "templates", templateName, "index.html");
  const projectApi = await import(pathToFileURL(path.join(runtimeRoot, "cli", "lib", "project.js")).href);
  const sourceTemplateHtml = await fs.readFile(htmlPath, "utf8");
  const omAdapter = await import("../templates/adapters/laohu-film.mjs");
  const validatedSourceCueBindings = omAdapter.applyNativeOmSourceCueBindings(sourceTemplateHtml, input.sourceCueBindings, entry.id).applied;
  const declarations = projectApi.readVariables(sourceTemplateHtml);
  const declarationsById = new Map(declarations.map((declaration) => [declaration.id, declaration]));
  const supplied = input.variables == null ? {} : input.variables;
  if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) throw new Error("variables must be a JSON object");
  const omCues = validateNativeOmCues(input.omCues);
  const omScore = validateNativeOmScore(input.omScore);
  const omMusic = validateNativeOmMusic(input.omMusic);
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
  const sourceDurationControlSec = values.duration == null ? Number(durationDecl?.default) : values.duration;
  if (!Number.isFinite(sourceDurationControlSec) || sourceDurationControlSec <= 0) throw new Error("the native OM template must have a positive source duration control");
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
  const runtimeProjectApi = await import(pathToFileURL(path.join(runtimeRoot, "cli", "lib", "project.js")).href);
  const executables = await nativeOmExecutables(runtimeRoot, args, tempRoot);
  runNativeOm(executables.omCli, ["new", outputValue, "--template", templateName], {
    env: executables.env, cwd: runtimeRoot, label: "Laohu Film native project setup",
  });
  const projectIndex = path.join(outputValue, "index.html");
  let projectHtml = await fs.readFile(projectIndex, "utf8");
  if (Object.keys(values).length) projectHtml = runtimeProjectApi.setVariables(projectHtml, values);
  const sourceCueBindingsResult = omAdapter.applyNativeOmSourceCueBindings(projectHtml, validatedSourceCueBindings, entry.id);
  projectHtml = sourceCueBindingsResult.html;
  projectHtml = applyNativeOmCues(projectHtml, omCues);
  projectHtml = applyNativeOmScore(projectHtml, omScore);
  projectHtml = applyNativeOmMusic(projectHtml, omMusic);
  await fs.writeFile(projectIndex, projectHtml);
  const sourceRuntimeProbe = await probeNativeOmRuntime(outputValue, runtimeRoot, executables.browserPath);
  const durationSec = sourceRuntimeProbe.durationSec;
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error("original native OM runtime probe returned a non-positive duration");
  if (Math.abs(durationSec * fps - Math.round(durationSec * fps)) > 1e-7) throw new Error("original native OM runtime duration " + durationSec + "s at " + fps + " fps is not frame-aligned");
  const projectVariables = runtimeProjectApi.readVariables(projectHtml).map((declaration) => ({
    id: declaration.id, type: declaration.type, value: declaration.default,
  }));
  const prepared = {
    format: NATIVE_OM_SPEC_FORMAT,
    templateId: entry.id,
    sourceId: entry.sourceId,
    sourceCommit: catalog.sources.find((source) => source.id === entry.sourceId).commit,
    sourceVerification,
    runtimeClosure: { directory: entry.localRuntime.directory, manifestPath: entry.localRuntime.manifestPath, manifestSha256: runtime.manifestSha256 },
    sourceTemplatePath: entry.sourcePath,
    sourceTemplateSha256: sha256(await fs.readFile(htmlPath)),
    templateName,
    projectPath: outputValue,
    projectIndexPath: projectIndex,
    projectIndexSha256: sha256(await fs.readFile(projectIndex)),
    projectFiles: await hashNativeProjectFiles(outputValue),
    projectHashScope: "OM project input files; excludes the original CLI's append-only .om/renders.jsonl runtime log",
    sourceCueBindings: sourceCueBindingsResult.applied.length ? sourceCueBindingsResult.applied : null,
    omCues: omCues ? { words: omCues.words.length, sha256: sha256(Buffer.from(JSON.stringify(omCues), "utf8")), originalElement: "script#om-cues" } : null,
    omScore: omScore ? { sha256: sha256(Buffer.from(omScore, "utf8")), originalElement: "script#om-score" } : null,
    omMusic,
    sourceDurationControlSec,
    durationSec,
    durationAuthority: "original-om-browser-runtime-probe",
    sourceRuntimeProbe,
    sourceRuntimeProbeSha256: sha256(Buffer.from(JSON.stringify(sourceRuntimeProbe), "utf8")),
    fps, width, height,
    preparedAt: new Date().toISOString(),
  };
  const specPath = path.join(outputValue, "laohu-native-template.json");
  await fs.writeFile(specPath, JSON.stringify(prepared, null, 2) + "\n", { flag: "wx" });
  process.stdout.write("PREPARED " + outputValue + "\nSPEC " + specPath + "\nTEMPLATE " + productionDisplayId(entry) + "\nSOURCE " + entry.sourcePath + "\n");
}

async function readPreparedNativeOm(args, catalog, entry, specPath) {
  const spec = JSON.parse(await fs.readFile(specPath, "utf8"));
  if (spec.format !== NATIVE_OM_SPEC_FORMAT) throw new Error("native OM spec format must be " + NATIVE_OM_SPEC_FORMAT);
  if (!matchesCatalogId(entry, spec.templateId)) throw new Error("prepared spec templateId is " + JSON.stringify(spec.templateId) + "; expected " + entry.id + " or a declared alias");
  if (spec.sourceId !== entry.sourceId) throw new Error("prepared spec sourceId does not match the selected catalog entry");
  const runtime = await verifyNativeOmRuntime(entry, catalog);
  const sourceVerification = runtime.verification;
  const projectPath = path.resolve(spec.projectPath || "");
  const projectIndexPath = path.resolve(spec.projectIndexPath || path.join(projectPath, "index.html"));
  if (!spec.projectPath || !path.isAbsolute(spec.projectPath)) throw new Error("prepared native OM projectPath must be absolute");
  const workRootValue = args.workRoot || args.cacheDir;
  if (!workRootValue || !path.isAbsolute(workRootValue)) throw new Error("native OM render/preview requires an absolute --work-root (or absolute compatibility --cache-dir)");
  if (!isWithin(path.resolve(workRootValue), projectPath)) throw new Error("prepared native OM project must remain below --work-root");
  if (spec.runtimeClosure?.manifestSha256 && spec.runtimeClosure.manifestSha256 !== runtime.manifestSha256) {
    throw new Error("prepared native OM project was created with a different local runtime closure; rerun prepare before rendering");
  }
  const indexBytes = await fs.readFile(projectIndexPath);
  if (sha256(indexBytes) !== spec.projectIndexSha256) throw new Error("prepared project index changed after prepare; rerun prepare from the intended input");
  if (!isWithin(projectPath, projectIndexPath)) throw new Error("prepared project index escapes its project directory");
  const currentFiles = await hashNativeProjectFiles(projectPath);
  const comparableFiles = currentFiles.filter((file) => !(path.resolve(specPath) === path.resolve(projectPath, file.path)));
  const expectedFiles = Array.isArray(spec.projectFiles) ? spec.projectFiles : [];
  if (JSON.stringify(comparableFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error("prepared native OM project files changed after prepare; rerun prepare from the intended input");
  }
  return { spec, projectPath, projectIndexPath, sourceVerification, runtimeRoot: runtime.runtimeRoot };
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
  return {
    durationSec: Number(parsed.format?.duration),
    width: Number(video.width),
    height: Number(video.height),
    fps: parseNativeFps(video.avg_frame_rate),
    frameCount: video.nb_frames == null ? null : Number(video.nb_frames),
    videoCodec: video.codec_name,
    audioStreams: audio.length,
  };
}

function remuxNativeOmPictureOnly(ffmpeg, source, output, env) {
  const result = spawnSync(ffmpeg || "ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", source,
    "-map", "0:v:0", "-c:v", "copy", "-an", "-movflags", "+faststart", output,
  ], { encoding: "utf8", env, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error("failed to create picture-only native OM output with audio explicitly disabled: " + (result.error?.message || result.stderr || result.status));
}

async function renderNativeOmAction(args, catalog, entry) {
  requireNativeOmTemplate(entry, args.command);
  if (!args.spec) throw new Error("native OM render/preview requires --spec");
  const workRootValue = args.workRoot || args.cacheDir;
  if (!workRootValue || !path.isAbsolute(workRootValue)) throw new Error("native OM render/preview requires an absolute --work-root (or absolute compatibility --cache-dir)");
  if (!args.output) throw new Error("native OM render/preview requires --output");
  if (args.command === "render") await preflightNativeOmFfmpeg(args);
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
  const preparedSpecBytes = await fs.readFile(preparedSpecPath);
  const nativeProjectApi = await import(pathToFileURL(path.join(prepared.runtimeRoot, "cli", "lib", "project.js")).href);
  const projectIndexHtml = await fs.readFile(prepared.projectIndexPath, "utf8");
  const variables = Object.fromEntries(nativeProjectApi.readVariables(projectIndexHtml).map((declaration) => [declaration.id, declaration.default]));
  const output = await requireNewOutput(args.output, [path.join(skillDir, "templates"), skillDir]);
  const { workRoot, tempRoot } = await ensureNativeWorkRoot(args.workRoot || args.cacheDir, [output]);
  if (!isWithin(workRoot, prepared.projectPath)) throw new Error("prepared project must remain below --work-root so browser profiles and renders stay on the same external volume");
  const runtimeRoot = prepared.runtimeRoot;
  const executables = await nativeOmExecutables(runtimeRoot, args, tempRoot);
  let mediaInfo;
  let omOutput = "";
  let sourceRuntimeProbe = await probeNativeOmRuntime(prepared.projectPath, runtimeRoot, executables.browserPath);
  if (Math.abs(sourceRuntimeProbe.durationSec - prepared.spec.durationSec) > 1e-7) {
    throw new Error("original OM runtime duration " + sourceRuntimeProbe.durationSec + "s differs from the prepared runtime-probe duration " + prepared.spec.durationSec + "s; rebuild the Film clock from the initialized source timeline");
  }
  if (prepared.spec.omCues != null) {
    const unresolved = sourceRuntimeProbe.cueEvidence.clipCues.filter((cue) => cue.word && cue.wordTimeSec == null)
      .map(({ cueIndex, kind, word }) => ({ cueIndex, kind, word }));
    const clipProblems = sourceRuntimeProbe.cueEvidence.clipProblems || [];
    if (unresolved.length || clipProblems.length) throw new Error("native OM source cue words or initialized CLIP diagnostics are unresolved by the original OM.cue/ClipCues in the supplied omCues; bind each applicable source cue to a manuscript word or clear its obsolete source anchor before rendering: " + JSON.stringify({ unresolved, clipProblems }));
  }
  if (args.command === "preview") {
    const time = Number(args.time);
    if (!Number.isFinite(time) || time < 0 || time >= prepared.spec.durationSec) throw new Error("preview --time must be in [0, " + prepared.spec.durationSec + ") seconds");
    const result = runNativeOm(executables.omCli, ["still", prepared.projectPath, "--at", String(time), "--out", output], {
      env: executables.env, cwd: runtimeRoot, label: "Laohu Film native still",
    });
    omOutput = (result.stdout + result.stderr).trim();
    const bytes = await fs.readFile(output);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Laohu Film native preview did not produce a valid PNG");
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width !== prepared.spec.width || height !== prepared.spec.height) throw new Error("preview dimensions " + width + "x" + height + " do not match prepared spec");
    mediaInfo = { format: "png", width, height, timeSec: time, bytes: bytes.length, sha256: sha256(bytes) };
    mediaInfo.sourceRuntimeProbe = {
      format: sourceRuntimeProbe.format,
      durationSec: sourceRuntimeProbe.durationSec,
      timelineId: sourceRuntimeProbe.timelineId,
      labelCount: Object.keys(sourceRuntimeProbe.labels).length,
      declaredHitCount: sourceRuntimeProbe.sound.hits.length,
      cueWordCount: sourceRuntimeProbe.cueEvidence.words.length,
      composerCueCount: sourceRuntimeProbe.composer?.cues.length || 0,
    };
  } else {
    const fps = Number(args.fps || prepared.spec.fps);
    if (![24, 25, 30, 50, 60].includes(fps)) throw new Error("native OM render fps must be one of 24, 25, 30, 50, or 60");
    const sourceOutput = path.join(workRoot, "source-renders", entry.id + "-" + process.pid + "-" + Date.now() + ".mp4");
    await fs.mkdir(path.dirname(sourceOutput), { recursive: true });
    await ensureNativeWorkRoot(workRoot, [sourceOutput, output]);
    const result = runNativeOm(executables.omCli, [
      "render", prepared.projectPath, "--format", "mp4", "--fps", String(fps), "--workers", "1", "--video", "seek", "--silent", "--out", sourceOutput,
    ], { env: executables.env, cwd: runtimeRoot, label: "Laohu Film native render" });
    omOutput = (result.stdout + result.stderr).trim();
    const sourceMediaInfo = await nativeOmMediaInfo(sourceOutput, executables.env);
    if (sourceMediaInfo.width !== prepared.spec.width || sourceMediaInfo.height !== prepared.spec.height) throw new Error("render dimensions do not match the prepared native OM project");
    if (Math.abs(sourceMediaInfo.fps - fps) > 1e-6) throw new Error("render fps does not match the requested fps");
    const expectedFrames = Math.round(prepared.spec.durationSec * fps);
    if (sourceMediaInfo.frameCount != null && sourceMediaInfo.frameCount !== expectedFrames) throw new Error("render frame count is " + sourceMediaInfo.frameCount + "; expected " + expectedFrames);
    remuxNativeOmPictureOnly(executables.ffmpegPath, sourceOutput, output, executables.env);
    mediaInfo = await nativeOmMediaInfo(output, executables.env);
    if (mediaInfo.audioStreams !== 0) throw new Error("local native OM output contains audio after explicit -an remux; refusing a second soundtrack consumer");
    if (mediaInfo.width !== prepared.spec.width || mediaInfo.height !== prepared.spec.height) throw new Error("picture-only render dimensions do not match the prepared native OM project");
    if (Math.abs(mediaInfo.fps - fps) > 1e-6) throw new Error("picture-only render fps does not match the requested fps");
    if (mediaInfo.frameCount != null && mediaInfo.frameCount !== expectedFrames) throw new Error("picture-only render frame count is " + mediaInfo.frameCount + "; expected " + expectedFrames);
    mediaInfo.expectedFrameCount = expectedFrames;
    mediaInfo.audioRemoval = { sourceRenderAudioStreams: sourceMediaInfo.audioStreams, cliSilent: true, remuxVideoCodecCopy: true, ffmpegAn: true };
    mediaInfo.outputSha256 = sha256(await fs.readFile(output));
    mediaInfo.sourceRuntimeProbe = {
      format: sourceRuntimeProbe.format,
      durationSec: sourceRuntimeProbe.durationSec,
      timelineId: sourceRuntimeProbe.timelineId,
      labelCount: Object.keys(sourceRuntimeProbe.labels).length,
      declaredHitCount: sourceRuntimeProbe.sound.hits.length,
      cueWordCount: sourceRuntimeProbe.cueEvidence.words.length,
      composerCueCount: sourceRuntimeProbe.composer?.cues.length || 0,
    };
    await fs.rm(sourceOutput, { force: true });
  }
  const manifestPath = args.manifest ? path.resolve(args.manifest) : output + ".manifest.json";
  await requireNewOutput(manifestPath, [path.join(skillDir, "templates"), skillDir]);
  mediaInfo.path = output;
  const manifest = {
    format: "laohu.huashu-native-template-render/1",
    templateId: entry.id,
    sourceId: entry.sourceId,
    sourceCommit: catalog.sources.find((source) => source.id === entry.sourceId).commit,
    sourceVerification: prepared.sourceVerification,
    sourceTemplate: { path: entry.sourcePath, sha256: prepared.spec.sourceTemplateSha256 },
    preparedSpecPath: preparedSpecPath,
    preparedSpecSha256: sha256(preparedSpecBytes),
    projectPath: prepared.projectPath,
    projectIndexSha256: prepared.spec.projectIndexSha256,
    projectFileHashes: prepared.spec.projectFiles,
    projectHashScope: prepared.spec.projectHashScope,
    sourceDurationControlSec: prepared.spec.sourceDurationControlSec ?? null,
    runtimeDurationSec: prepared.spec.durationSec,
    durationAuthority: prepared.spec.durationAuthority || "legacy-prepared-spec-runtime-probed-before-render",
    omCues: prepared.spec.omCues || null,
    sourceCueBindings: prepared.spec.sourceCueBindings || null,
    runtimeOverlay: prepared.spec.runtimeOverlay || null,
    sourceRuntimeProbe,
    omRuntimeRenderLog: await fs.readFile(path.join(prepared.projectPath, ".om", "renders.jsonl")).then((bytes) => ({ path: ".om/renders.jsonl", sha256: sha256(bytes) })).catch(() => null),
    variables,
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
  process.stdout.write("OUTPUT " + output + "\nTEMPLATE " + productionDisplayId(entry) + "\nMEDIA " + JSON.stringify(mediaInfo) + "\nMANIFEST " + manifestPath + "\n");
}

async function prepare(args, catalog, entry) {
  if (entry.renderer === "native-style-scene") return prepareComicPopScene(args, catalog, entry);
  if (entry.renderer === "video-shotcraft-remotion") {
    if (!args.input || !args.output) throw new Error("prepare requires --input and --output");
    const inputPath = path.resolve(args.input);
    const output = await requireNewOutput(args.output, [path.join(skillDir, "templates"), skillDir]);
    const receiptPath = `${output}.assets.json`;
    await requireNewOutput(receiptPath, [path.join(skillDir, "templates"), skillDir]);
    const adapter = await import("../templates/adapters/video-shotcraft-remotion.mjs");
    const result = await adapter.prepareShotcraftInput({catalog, entry, inputPath, outputPath:output, assetsRoot:args.assetsRoot ? path.resolve(args.assetsRoot) : undefined});
    process.stdout.write(`PREPARED ${result.outputPath}\nASSET_RECEIPT ${result.receiptPath}\nTEMPLATE ${productionDisplayId(entry)}\nSOURCE ${entry.component.path}\n`);
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
  const selectedLocalRuntime = await verifySelectedNativeClipRuntime(catalog, entry);
  const sourceVerification = selectedLocalRuntime?.sourceVerification || await verifySource(catalog, entry.sourceId);
  if (!sourceVerification.ok) throw new Error(`Pinned source verification failed; refusing to prepare from a changed/missing source: ${JSON.stringify(sourceVerification.issues)}`);
  const assetsRoot = path.resolve(args.assetsRoot || path.dirname(inputPath));
  const assets = await inspectSpecAssets(spec, assetsRoot);
  const output = await requireNewOutput(args.output, [path.join(skillDir, "templates"), skillDir]);
  const receiptPath = `${output}.assets.json`;
  await requireNewOutput(receiptPath, [path.join(skillDir, "templates"), skillDir]);
  await fs.writeFile(output, `${JSON.stringify(spec, null, 2)}\n`, { flag: "wx" });
  const receipt = { kind: "native-template-input-receipt", templateId: entry.id, sourceId: entry.sourceId, sourceCommit: catalog.sources.find((source) => source.id === entry.sourceId).commit, sourceVerification, specSha256: sha256(Buffer.from(`${JSON.stringify(spec, null, 2)}\n`)), assetsRoot, assets };
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`PREPARED ${output}\nASSET_RECEIPT ${receiptPath}\nTEMPLATE ${productionDisplayId(entry)}\nSOURCE ${entry.sourcePath}\n`);
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
  const htmlPage = await deriveNativeHtmlPage(catalog, entry, preparedSpec, sourceVerification);
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
  process.stdout.write(`PREPARED ${output}\nASSET_RECEIPT ${receiptPath}\nTEMPLATE ${productionDisplayId(entry)}\nSOURCE ${entry.sourceId}@${receipt.sourceCommit} ${entry.sourcePath}\n`);
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
  const declaration = entry.adapter?.localRuntime;
  const templatesRoot = path.join(skillDir, "templates");
  const runtimeParent = path.join(templatesRoot, "runtime");
  if (!declaration?.directory || !declaration?.manifestPath || !/^[a-f0-9]{64}$/.test(declaration.manifestSha256 || "")) {
    throw new Error(`${entry.id} has no pinned local Showcase runtime closure`);
  }
  const runtimeRoot = path.resolve(skillDir, declaration.directory);
  const manifestPath = path.resolve(skillDir, declaration.manifestPath);
  if (!isWithin(runtimeParent, runtimeRoot) || !isWithin(runtimeRoot, manifestPath)) throw new Error(`${entry.id} local runtime paths must remain inside templates/runtime`);
  const rootStat = await fs.lstat(runtimeRoot).catch((error) => { throw new Error(`${entry.id} local runtime is missing: ${error.message}`); });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error(`${entry.id} local runtime must be a real directory`);
  const manifestStat = await fs.lstat(manifestPath).catch((error) => { throw new Error(`${entry.id} local runtime manifest is missing: ${error.message}`); });
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error(`${entry.id} local runtime manifest must be a regular file`);
  const manifestBytes = await fs.readFile(manifestPath);
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== declaration.manifestSha256) throw new Error(`${entry.id} local runtime manifest SHA differs from catalog`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const source = catalog.sources.find((row) => row.id === entry.sourceId);
  if (!source || manifest.format !== "laohu.motion.local-native-html-closure/1"
      || manifest.source?.id !== source.id || manifest.source?.commit !== source.commit
      || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error(`${entry.id} local runtime manifest does not match the pinned source or lacks a file closure`);
  }
  const sourceByIdMap = new Map(catalog.sources.map((row) => [row.id, row]));
  const localFilesBySourcePath = new Map();
  const localFilesBySourceKey = new Map();
  const checkedFiles = [];
  for (const row of manifest.files) {
    if (!row || typeof row.sourcePath !== "string" || typeof row.localPath !== "string"
        || !/^[a-f0-9]{64}$/.test(row.sourceSha256 || "") || !/^[a-f0-9]{64}$/.test(row.localSha256 || "")) {
      throw new Error(`${entry.id} local runtime manifest has an incomplete source/local mapping`);
    }
    const localPath = path.resolve(skillDir, row.localPath);
    if (!isWithin(runtimeParent, localPath)) throw new Error(`${entry.id} local runtime file escapes templates/runtime: ${row.localPath}`);
    const localStat = await fs.lstat(localPath).catch((error) => { throw new Error(`${entry.id} local runtime file is missing (${row.localPath}): ${error.message}`); });
    if (!localStat.isFile() || localStat.isSymbolicLink()) throw new Error(`${entry.id} local runtime path must resolve to a regular file: ${row.localPath}`);
    const bytes = await fs.readFile(localPath);
    const digest = sha256(bytes);
    if (digest !== row.localSha256) throw new Error(`${entry.id} local runtime file differs from closure hash: ${row.localPath}`);

    // The source path is provenance only. Correlate its source hash to the checked-in source ledger
    // without opening templates/upstream during prepare or render.
    let sourceMatch = null;
    for (const sourceRow of catalog.sources) {
      const prefix = `${sourceRow.sourcePathPrefix || ""}/`;
      if (!sourceRow.sourcePathPrefix || !row.sourcePath.startsWith(prefix)) continue;
      const relative = row.sourcePath.slice(prefix.length);
      const pin = sourceRow.files?.find((file) => file.path === relative);
      if (pin) { sourceMatch = { sourceId: sourceRow.id, relative, pin }; break; }
    }
    if (sourceMatch && sourceMatch.pin.sha256 !== row.sourceSha256) {
      throw new Error(`${entry.id} source attribution disagrees with the catalog ledger for ${row.sourcePath}`);
    }
    const cssSourceRow = row.sourcePath === entry.adapter.fontCssSourcePath;
    if (!sourceMatch && !cssSourceRow) throw new Error(`${entry.id} local mapping has no catalog source pin: ${row.sourcePath}`);
    if (cssSourceRow && row.sourceSha256 !== entry.adapter.fontCssSourceSha256) throw new Error(`${entry.id} CSS source pin differs from its catalog adapter record`);
    const mapped = { ...row, localPath: path.resolve(skillDir, row.localPath), bytes: bytes.length, sourceId: sourceMatch?.sourceId || null, sourceRelative: sourceMatch?.relative || null };
    localFilesBySourcePath.set(row.sourcePath, mapped);
    if (sourceMatch) localFilesBySourceKey.set(`${sourceMatch.sourceId}:${sourceMatch.relative}`, mapped);
    checkedFiles.push({ sourcePath: row.sourcePath, sourceSha256: row.sourceSha256, localPath: row.localPath, localSha256: digest, bytes: bytes.length, sourceId: mapped.sourceId });
  }
  for (const relative of entry.closure || []) {
    const key = `${entry.sourceId}:${relative}`;
    if (!localFilesBySourceKey.has(key)) throw new Error(`${entry.id} local runtime closure omits catalogued page dependency ${relative}`);
  }
  const cssRow = manifest.files.find((row) => row.sourcePath === entry.adapter.fontCssSourcePath);
  const adapterCssPath = path.resolve(templatesRoot, entry.adapter.fontCssPath || "");
  const manifestCssPath = cssRow ? path.resolve(skillDir, cssRow.localPath) : null;
  if (!cssRow
      || !isWithin(runtimeParent, adapterCssPath)
      || !isWithin(runtimeParent, manifestCssPath)
      || adapterCssPath !== manifestCssPath
      || cssRow.localSha256 !== entry.adapter.fontCssSha256) {
    throw new Error(`${entry.id} local font CSS does not match the declared local closure mapping`);
  }
  for (const asset of entry.adapter.fontAssets || []) {
    const sourceRow = sourceByIdMap.get(asset.sourceId);
    const key = `${asset.sourceId}:${asset.path}`;
    const mapped = localFilesBySourceKey.get(key);
    const pin = sourceRow?.files?.find((file) => file.path === asset.path);
    if (!mapped || !pin || mapped.sourceSha256 !== pin.sha256) throw new Error(`${entry.id} font ${asset.family} has no verified local runtime mapping`);
  }
  return {
    ok: true,
    kind: "selected-local-showcase-closure",
    sourceId: source.id,
    sourceCommit: source.commit,
    closureManifestPath: declaration.manifestPath,
    closureManifestSha256: manifestSha256,
    checkedFiles,
    localFilesBySourcePath,
    localFilesBySourceKey,
    manifest,
    source,
    adapter: { kind: entry.adapter.kind, fontCssPath: cssRow.localPath, sha256: cssRow.localSha256 },
    upstreamTreeRequiredAtRuntime: false,
  };
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

async function deriveNativeHtmlPage(catalog, entry, spec, verifiedClosure = null) {
  const closure = verifiedClosure || await verifyNativeHtmlSources(catalog, entry);
  const { source, localFilesBySourceKey } = closure;
  const html = localFilesBySourceKey.get(`${entry.sourceId}:${entry.sourcePath}`);
  if (!html) throw new Error(`Local Showcase closure has no HTML page mapping for ${entry.sourcePath}`);
  const sourcePath = html.localPath;
  const originalBytes = await fs.readFile(sourcePath);
  const sourcePin = source.files.find((file) => file.path === entry.sourcePath);
  const originalSha256 = sha256(originalBytes);
  if (!sourcePin || sourcePin.sha256 !== html.sourceSha256 || sourcePin.sha256 !== originalSha256) throw new Error(`Local HTML/source ledger mismatch for ${entry.id}; refusing to derive from changed source`);
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
  return { source, sourcePath, sourcePin, originalBytes, originalSha256, bytes, derivedSha256: sha256(bytes), literalReplacements, sourcePatches, upstreamTreeRequiredAtRuntime: false };
}

async function startNativeHtmlServer(catalog, entry, htmlPage, sourceVerification) {
  const sourcesById = new Map(catalog.sources.map((source) => [source.id, source]));
  const allowedFonts = new Map((entry.adapter.fontAssets || []).map((asset) => [asset.cssRoute, asset]));
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
        pin = sourceVerification.localFilesBySourceKey.get(`${entry.sourceId}:${relative}`);
        if (!pin || !(entry.closure || []).includes(relative)) throw new Error(`unlisted original source request ${relative}`);
        sourceId = entry.sourceId;
        file = pin.localPath;
        if (relative === entry.sourcePath && htmlPage) {
          bytes = htmlPage.bytes;
          if (sha256(bytes) !== htmlPage.derivedSha256) throw new Error("derived HTML response does not match its receipt hash");
          if (htmlPage.derivedSha256 !== htmlPage.originalSha256) derived = { originalSha256: htmlPage.originalSha256, servedSha256: htmlPage.derivedSha256, reason: "content-literal-and-canvas-state-adapter", replacements: htmlPage.literalReplacements, sourcePatches: htmlPage.sourcePatches };
        } else bytes = await fs.readFile(file);
        if (relative !== entry.sourcePath && sha256(bytes) !== pin.localSha256) throw new Error(`pinned local source changed after verification: ${relative}`);
        if (relative === entry.sourcePath && !derived && sha256(bytes) !== pin.localSha256) throw new Error(`pinned local source changed after verification: ${relative}`);
        servedFiles.set(`${sourceId}:${relative}`, { sourceId, path: relative, sha256: sha256(bytes), bytes: bytes.length, pinnedSha256: pin.localSha256, sourceSha256: pin.sourceSha256, matchesPin: sha256(bytes) === pin.localSha256, ...(derived ? { derived } : {}) });
      } else {
        let decodedPathname = null;
        try { decodedPathname = decodeURIComponent(pathname); } catch {}
        const asset = decodedPathname == null ? null : allowedFonts.get(decodedPathname);
        if (asset) {
          sourceId = asset.sourceId;
          relative = asset.path;
          const key = `${sourceId}:${relative}`;
          pin = sourceVerification.localFilesBySourceKey.get(key);
          if (!pin) throw new Error(`font asset has no verified local runtime mapping: ${key}`);
          file = pin.localPath;
          bytes = await fs.readFile(file);
          if (sha256(bytes) !== pin.localSha256) throw new Error(`pinned local font changed after verification: ${key}`);
          servedFiles.set(key, { sourceId, path: relative, localPath: pin.localPath, sha256: sha256(bytes), bytes: bytes.length, pinnedSha256: pin.localSha256, sourceSha256: pin.sourceSha256, matchesPin: sha256(bytes) === pin.localSha256, license: sourcesById.get(sourceId)?.license || null });
        }
      }
      if (!file || !bytes) { response.writeHead(404); response.end("Not found"); return; }
      response.writeHead(200, {
        "content-type": contentType(file),
        "content-length": bytes.length,
        "cache-control": pathname.startsWith("/showcase-fonts/") ? "public, max-age=31536000, immutable" : "no-store",
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
  let runtimeDependency;
  try {
    runtimeDependency = loadMotionPackage("playwright", {expectedVersions:{playwright:"1.55.0"}});
    ({ chromium } = runtimeDependency.value);
  } catch (error) { throw new Error(`Local Playwright is required for native HTML/Canvas rendering; it was not found in the project runtime cache. No dependency was installed. ${error.message}`); }
  requireNativeHtmlTemplate(entry, options.action || "render");
  const sourceVerification = await verifyNativeHtmlSources(options.catalog, entry);
  const htmlPage = await deriveNativeHtmlPage(options.catalog, entry, spec, sourceVerification);
  const { server, origin, servedFiles, adapterResponses } = await startNativeHtmlServer(options.catalog, entry, htmlPage, sourceVerification);
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
      if (url.origin === origin) {
        try { localRequests.push(decodeURIComponent(url.pathname)); }
        catch { localRequests.push(url.pathname); }
      }
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
    return { browser, browserExecutable: browserPath || "playwright-managed-default", browserTempRoot, runtimeDependency: {resolutionSource:runtimeDependency.resolutionSource, nodeModulesPath:runtimeDependency.nodeModulesPath, packages:runtimeDependency.packages}, page, server, origin, source: htmlPage.source, sourceVerification, htmlPage, firstBoot, consoleRows, requestFailures, externalRequests, localRequests, servedFiles, adapterResponses, sourceLoadFonts: firstBoot.sourceLoadFonts };
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
    return { family, path: asset.cssRoute, loaded: boot.fontStatus[family]?.loadedFaceCount > 0 };
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
  if (receipt && !matchesCatalogId(entry, receipt.templateId)) throw new Error(`Prepared input receipt belongs to ${receipt.templateId}, not ${entry.id}`);
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
  const { browser, browserExecutable, runtimeDependency, page, server, origin, source, sourceVerification: runtimeSourceVerification,
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
  const sourcePathPrefix = catalog.sources.find((row) => row.id === entry.sourceId)?.sourcePathPrefix || null;
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
      runtimeDependency,
      capture: { mode: softwareCapture ? "software-swiftshader" : "hardware-gpu-diagnostic", software: softwareCapture, frequentReadback: !args.noFrequentReadback, stabilityClaim: softwareCapture && !args.noFrequentReadback ? "fresh-document-realm-per-frame-with-willReadFrequently" : "outside-default-repeatable-pixel-evidence-scope" },
      browserTempRoot,
      sourceVerification: runtimeSourceVerification,
      sourcePathPrefix,
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
  process.stdout.write(`OUTPUT ${output}\nTEMPLATE ${productionDisplayId(entry)}\nBOOT ${lastBoot.ready ? "READY" : "FAILED"}\nPIXEL_HASHES ${frameRows.map((row) => row.pixelHash).join(",")}\n`);
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
  let runtimeDependency;
  try {
    runtimeDependency = loadMotionPackage("playwright", {expectedVersions:{playwright:"1.55.0"}});
    ({ chromium } = runtimeDependency.value);
  } catch (error) { throw new Error(`Local Playwright is required for native template rendering; it was not found in the project runtime cache. No dependency was installed. ${error.message}`); }
  const selectedLocalRuntime = options.selectedLocalRuntime || await verifySelectedNativeClipRuntime(options.catalog, entry);
  const source = options.catalog.sources.find((item) => item.id === entry.sourceId);
  if (!source) throw new Error(`Unknown source ${entry.sourceId}`);
  if (!selectedLocalRuntime) throw new Error(`${entry.id} has no pinned local runtime closure; production rendering does not read maintenance snapshots`);
  const sourceVerification = selectedLocalRuntime?.sourceVerification || await verifySource(options.catalog, entry.sourceId);
  if (!sourceVerification.ok) throw new Error(`Pinned source verification failed; refusing to load changed/missing source: ${JSON.stringify(sourceVerification.issues)}`);
  const engineRoot = selectedLocalRuntime.runtimeRoot;
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
    return { browser, browserExecutable: browserPath || "playwright-managed-default", runtimeDependency: {resolutionSource:runtimeDependency.resolutionSource, nodeModulesPath:runtimeDependency.nodeModulesPath, packages:runtimeDependency.packages}, browserTempRoot, page, server, origin, source, sourceVerification, selectedLocalRuntime, mappedSpec, readiness, consoleRows, externalRequests, localRequests, expectedPaths, missingRuntimeRequests, servedFiles };
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

async function renderComicPopSceneAction(args, catalog, entry) {
  requireNativeStyleScene(entry, args.command);
  if (!args.spec || !args.output) throw new Error(`${args.command} comic-pop-reaction requires --spec and --output`);
  const specPath = path.resolve(args.spec);
  const specBytes = await fs.readFile(specPath);
  const spec = JSON.parse(specBytes.toString("utf8"));
  const receiptPath = `${specPath}.assets.json`;
  const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") throw new Error(`prepared scene receipt is missing: ${receiptPath}`);
    throw error;
  }));
  if (receipt.kind !== "native-style-scene-input-receipt" || !matchesCatalogId(entry, receipt.templateId)) throw new Error(`Prepared scene receipt does not belong to ${entry.id}`);
  if (receipt.preparedSpecSha256 !== sha256(specBytes)) throw new Error("Prepared scene changed after prepare; re-run prepare to refresh its input and asset binding");
  if (spec.version !== 1 || spec.templateId !== entry.id || spec.width !== 1920 || spec.height !== 1080 || spec.fps !== 30
      || !Number.isFinite(spec.duration) || spec.duration <= 0 || Math.abs(spec.duration * spec.fps - Math.round(spec.duration * spec.fps)) > 1e-7
      || !Array.isArray(spec.objects) || spec.objects.length !== 1 || spec.objects[0]?.type !== entry.adapter.entrypoint) {
    throw new Error("Prepared scene does not satisfy the pinned comic-pop-reaction scene contract");
  }
  const data = spec.objects[0].data || {};
  const allowedData = new Set(["sourceTemplateId", "caption", "impactWord", "posterImageDataUrl"]);
  for (const key of Object.keys(data)) if (!allowedData.has(key)) throw new Error(`Prepared scene contains unsupported local input ${key}`);
  const inlineImage = data.posterImageDataUrl;
  if (inlineImage != null) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/u.exec(inlineImage);
    if (!match) throw new Error("Prepared poster image is not a local raster data URL");
    const imageBytes = Buffer.from(match[2], "base64");
    if (sha256(imageBytes) !== receipt.assets?.find((row) => row.label === "parameters.posterImage")?.sha256) {
      throw new Error("Prepared poster image bytes differ from the asset receipt");
    }
  } else if (receipt.assets?.some((row) => row.label === "parameters.posterImage")) {
    throw new Error("Prepared scene is missing the image bound by its receipt");
  }
  const sourceVerification = await verifyLocalStyleSceneRuntime(catalog, entry);
  if (receipt.sourceVerification?.manifestSha256 !== sourceVerification.manifestSha256
      || receipt.sourceVerification?.sourceClosureSha256 !== sourceVerification.sourceClosureSha256) {
    throw new Error("Local scene closure changed after prepare; re-run prepare to refresh the pinned receipt");
  }

  const output = await requireStyleMediaOutput(args.output, "scene media output", args.workRoot);
  const isPreview = args.command === "preview";
  if (isPreview && path.extname(output).toLowerCase() !== ".png") throw new Error("preview output must be .png");
  if (!isPreview && path.extname(output).toLowerCase() !== ".mp4") throw new Error("render output must be .mp4");
  const finalManifestPath = args.manifest ? await requireStyleMediaOutput(args.manifest, "scene media manifest", args.workRoot) : `${output}.manifest.json`;
  if (!args.manifest) await requireStyleMediaOutput(finalManifestPath, "scene media manifest", args.workRoot);
  if (finalManifestPath === output) throw new Error("--manifest and --output must be different paths");
  const roots = await projectCacheRoots(args.workRoot);
  const requestedCache = args.cacheDir || process.env.MOTION_TEMPLATE_CACHE_DIR;
  if (requestedCache && !path.isAbsolute(requestedCache)) throw new Error("--cache-dir and MOTION_TEMPLATE_CACHE_DIR must be absolute paths");
  const cacheBase = path.resolve(requestedCache || path.join(roots.temporary, "laohu-motion-template-render"));
  if (isWithin(skillDir, cacheBase)) throw new Error("Motion render cache cannot be created inside the installed skill; pass a project WORK_ROOT or --cache-dir");
  if (isWithin("/tmp", cacheBase) || isWithin("/private/tmp", cacheBase)) throw new Error("Motion render cache cannot use system temporary storage; pass an external-drive --cache-dir");
  await fs.mkdir(cacheBase, { recursive: true });
  const runId = `${process.pid}-${Date.now()}`;
  const rendererCache = path.join(cacheBase, `render-cache-${runId}`);
  if (isWithin(rendererCache, output) || isWithin(rendererCache, finalManifestPath)) throw new Error("Motion output and its manifest must stay outside the per-run browser cache");
  const intermediateRoot = cacheBase;
  await fs.mkdir(intermediateRoot, { recursive: true });
  let rendererSpecPath = specPath;
  let stagedScene = null;
  if (isWithin(rendererCache, rendererSpecPath)) {
    stagedScene = path.join(intermediateRoot, `scene-stage-${runId}.json`);
    await fs.writeFile(stagedScene, specBytes, { flag: "wx" });
    rendererSpecPath = stagedScene;
  }
  let renderSpec = spec;
  if (isPreview) {
    const timeSec = Number(args.time);
    if (!Number.isFinite(timeSec) || timeSec < 0 || timeSec >= spec.duration) throw new Error(`preview --time must be in [0, ${spec.duration}) seconds`);
    renderSpec = structuredClone(spec);
    renderSpec.duration = 1 / renderSpec.fps;
    renderSpec.objects[0].data.timeOffsetSec = timeSec;
    stagedScene = path.join(intermediateRoot, `scene-preview-${runId}.json`);
    await fs.writeFile(stagedScene, `${JSON.stringify(renderSpec, null, 2)}\n`, { flag: "wx" });
    rendererSpecPath = stagedScene;
  }
  const temporaryMp4 = isPreview ? path.join(intermediateRoot, `scene-preview-${runId}.mp4`) : output;
  const renderArgs = [
    path.join(skillDir, "scripts", "render.mjs"),
    "--scene", rendererSpecPath,
    "--output", temporaryMp4,
    "--cache-dir", rendererCache,
    "--template-effects", entry.adapter.effectLibraryId,
    "--draw-module", path.resolve(skillDir, entry.adapter.path),
  ];
  if (args.browser) renderArgs.push("--browser", path.resolve(args.browser));
  if (args.ffmpeg) renderArgs.push("--ffmpeg", path.resolve(args.ffmpeg));
  if (isPreview) renderArgs.push("--samples", "0");
  else if (args.samples) renderArgs.push("--samples", args.samples);
  const runEnv = { ...process.env, TMPDIR: rendererCache, TMP: rendererCache, TEMP: rendererCache };
  let child;
  try {
    child = spawnSync(process.execPath, renderArgs, { cwd: skillDir, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: runEnv });
  } finally {
    if (stagedScene) await fs.rm(stagedScene, { force: true });
  }
  if (child.error) throw new Error(`Motion render entry could not start: ${child.error.message}`);
  if (child.status !== 0) throw new Error(`Motion render entry failed (exit ${child.status})\n${child.stdout}\n${child.stderr}`);
  const childManifestPath = child.stdout.match(/^MANIFEST (.+)$/m)?.[1]?.trim();
  if (!childManifestPath) throw new Error("Motion render entry did not return its technical manifest path");
  const childManifestBytes = await fs.readFile(childManifestPath);
  const renderEvidence = JSON.parse(childManifestBytes.toString("utf8"));
  const sourceFunctionCalls = renderEvidence.templateEffects?.calls?.[entry.adapter.sourceFunction] || 0;
  const consumerEvidence = renderEvidence.consumerEvidence?.comicPopReaction || null;
  if (sourceFunctionCalls < 1 || !(consumerEvidence?.calls > 0)) {
    throw new Error("The source scene function or local input adapter received no actual frame calls");
  }
  const requiredFonts = new Set((entry.adapter.fontDependencies || []).map((font) => font.family));
  const loadedFonts = new Set((renderEvidence.templateEffectStage?.fontAssets || []).filter((font) => font.status === "loaded").map((font) => font.family));
  if ([...requiredFonts].some((font) => !loadedFonts.has(font))) throw new Error("A required local scene font did not load in the real browser render");

  let media;
  if (isPreview) {
    const samplePath = renderEvidence.samples?.[0]?.file;
    if (!samplePath) throw new Error("Motion render entry did not capture the requested still frame");
    const png = await fs.readFile(samplePath);
    if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Motion render entry sample is not a valid PNG");
    await fs.writeFile(output, png, { flag: "wx" });
    media = { format: "png", width: 1920, height: 1080, timeSec: Number(args.time), bytes: png.length, sha256: sha256(png) };
    await fs.rm(temporaryMp4, { force: true });
  } else {
    const mp4 = await fs.readFile(output);
    if (!mp4.length || mp4.subarray(4, 8).toString("ascii") !== "ftyp") throw new Error("Motion render entry did not produce a valid MP4 container");
    media = { format: "mp4", bytes: mp4.length, sha256: sha256(mp4), frameCount: renderEvidence.frameCount, fps: renderEvidence.render?.fps, durationSec: renderEvidence.render?.duration };
  }
  media.path = output;
  const finalManifest = {
    kind: "native-style-scene-render-evidence",
    templateId: entry.id,
    functionName: entry.id,
    renderer: entry.adapter.entrypoint,
    source: { id: entry.sourceId, commit: catalog.sources.find((row) => row.id === entry.sourceId).commit, path: entry.sourcePath, sha256: entry.sourceEvidence?.sha256, license: entry.sourceEvidence?.license },
    sourceVerification,
    sourceFunction: { id: entry.adapter.sourceFunction, calls: sourceFunctionCalls },
    inputAdapter: consumerEvidence,
    inputAssets: receipt.assets || [],
    requested: isPreview ? { kind: "preview", timeSec: Number(args.time) } : { kind: "render", fps: media.fps, durationSec: media.durationSec },
    media,
    renderEvidencePath: childManifestPath,
    renderEvidenceSha256: sha256(childManifestBytes),
    quality: "UNKNOWN: technical capture does not certify visual quality or audience response",
  };
  await fs.writeFile(finalManifestPath, `${JSON.stringify(finalManifest, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`OUTPUT ${output}\nTEMPLATE ${productionDisplayId(entry)}\nMANIFEST ${finalManifestPath}\nSOURCE_CALLS ${sourceFunctionCalls}\n`);
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
  if (receipt && !matchesCatalogId(entry, receipt.templateId)) throw new Error(`Prepared input receipt belongs to ${receipt.templateId}, not ${entry.id}`);
  if (receipt && receipt.specSha256 !== sha256(Buffer.from(raw))) throw new Error(`Prepared spec hash differs from ${receiptPath}; re-run prepare so its asset binding is current`);
  const assetsRoot = path.resolve(args.assetsRoot || receipt?.assetsRoot || path.dirname(specPath));
  const selectedLocalRuntime = await verifySelectedNativeClipRuntime(catalog, entry);
  const sourceVerification = selectedLocalRuntime?.sourceVerification || await verifySource(catalog, entry.sourceId);
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
    frequentReadback: !args.noFrequentReadback, browserTempRoot, selectedLocalRuntime,
  }));
  const { browser, browserExecutable, runtimeDependency, page, server, source, sourceVerification: runtimeSourceVerification, selectedLocalRuntime: runtimeLocalClosure, readiness, consoleRows, externalRequests, localRequests, expectedPaths, missingRuntimeRequests, servedFiles } = runtime;
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
  const pinnedByPath = runtimeLocalClosure
    ? runtimeLocalClosure.urlPins
    : new Map(source.files.map((file) => [`/engine/${file.path.replace(/^scripts\/engine\//, "")}`, { sha256: file.sha256 }]));
  const servedSourceFiles = [...servedFiles.entries()].map(([urlPath, file]) => {
    const pin = pinnedByPath.get(urlPath);
    return { urlPath, sha256: file.sha256, bytes: file.bytes, pinnedSha256: pin?.sha256 || null, ...(pin?.sourcePath ? { sourcePath: pin.sourcePath, sourceSha256: pin.sourceSha256, mapping: pin.mapping } : {}), matchesPin: Boolean(pin && pin.sha256 === file.sha256) };
  });
  const servedPinMismatches = servedSourceFiles.filter((file) => !file.matchesPin);
  const manifest = {
    kind: "native-template-render-evidence",
    templateId: entry.id,
    grammar: entry.grammar,
    source: { id: source.id, repository: source.repository, commit: source.commit, sourcePath: entry.sourcePath },
    sourceRuntime: { contract: "CLIP_SPEC -> __ready/__bootFailed -> renderFrame(t)", runtimeSourceMode: runtimeLocalClosure ? "selected-local-source-closure" : "verified-vendored-source-tree", upstreamTreeRequiredAtRuntime: !runtimeLocalClosure, readiness, browserExecutable, runtimeDependency, browserTempRoot, capture: { mode: softwareCapture ? "software-swiftshader" : "hardware-gpu-diagnostic", software: softwareCapture, frequentReadback: !args.noFrequentReadback, stabilityClaim: softwareCapture && !args.noFrequentReadback ? "matches-default-software-willReadFrequently-evidence-scope" : "outside-default-repeatable-pixel-evidence-scope" }, sourceVerification: runtimeSourceVerification, runtimePathsExpected: expectedPaths, runtimePathsRequested: [...new Set(localRequests)], missingRuntimeRequests, servedSourceFiles, servedPinMismatches, algorithmsRewritten: false },
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
  process.stdout.write(`OUTPUT ${output}\nTEMPLATE ${productionDisplayId(entry)}\nBOOT ${readiness.ready ? "READY" : "FAILED"}\nPIXEL_HASHES ${frameRows.map((row) => row.pixelHash).join(",")}\n`);
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
  const workRoot = path.resolve(args.workRoot || process.env.WORK_ROOT || repoRoot);
  const roots = await projectCacheRoots(workRoot);
  const allowedCacheRoot = path.join(roots.cache, 'tmp', 'laohu-motion', 'template-render');
  const cacheDir = path.resolve(args.cacheDir || allowedCacheRoot);
  if (!isWithin(roots.cache, cacheDir)) throw new Error(`Template render cache must stay below the selected workRoot .cache: ${roots.cache}`);
  await fs.mkdir(cacheDir, {recursive:true});
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
    cacheDir, workRoot, runtimeRoot:args.runtimeRoot ? path.resolve(args.runtimeRoot) : undefined,
    browser:args.browser ? path.resolve(args.browser) : undefined,
    ffmpeg:args.ffmpeg ? path.resolve(args.ffmpeg) : undefined, manifestPath,
  });
  process.stdout.write(`OUTPUT ${result.outputPath}\nTEMPLATE ${productionDisplayId(entry)}\nMANIFEST ${result.manifestPath}\nFRAME_COUNT ${result.frameCount}\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && ["--help", "-h", "help"].includes(argv[0])) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (await runStyleLibraryCommand(argv)) return;
  const args = parseArgs(argv);
  if (args.sourceRoot && args.command !== "verify") throw new Error("--source-root is available only with the maintenance verify command");
  const resourceViewRequest = ["overview", "browse", "describe"].includes(args.command);
  const researchRequest = !!(resourceViewRequest || args.research || args.all || args.status === "source-only" || args.source
    || (args.command === "list" && ["reference-index", "style-profile"].includes(args.type)));
  const includeMaintenance = args.command === "verify" || researchRequest;
  const catalog = await readCatalog({ includeMaintenance, includeResearch: args.command === "verify" || researchRequest });
  if (args.command === "list") {
    if (args.status && !["available", "conditional", "source-only"].includes(args.status)) throw new Error(`Unknown --status ${args.status}`);
    if (args.source && !catalog.sources.some((source) => source.id === args.source)) throw new Error(`Unknown source ${args.source}`);
    printList(catalog, args);
    return;
  }
  if (args.command === "discover") {
    await printDiscover(catalog, args);
    return;
  }
  if (["overview", "browse"].includes(args.command)) {
    if (args.positionals.length) throw new Error(`${args.command} does not accept positional arguments; use --type to select a collection`);
    if (args.limit) throw new Error(`${args.command} does not support --limit; use --type/--source/--category/--status to narrow the complete registry view`);
    await resourceCatalogView(catalog, args);
    return;
  }
  if (args.command === "describe") {
    if (args.positionals.length) throw new Error("describe does not accept positional arguments; use --type and --query");
    const description = await describeResource(catalog, args);
    process.stdout.write(`${JSON.stringify(description, null, 2)}\n`);
    return;
  }
  if (args.command === "verify") {
    if (args.source && !catalog.sources.some((source) => source.id === args.source)) throw new Error(`Unknown source ${args.source}`);
    let sourceRoot = null;
    if (args.sourceRoot) {
      if (!path.isAbsolute(args.sourceRoot)) throw new Error("--source-root must be an absolute path to the maintenance source snapshot root");
      sourceRoot = await fs.realpath(path.resolve(args.sourceRoot)).catch((error) => { throw new Error(`--source-root cannot be resolved: ${error.message}`); });
      if (!(await fs.stat(sourceRoot)).isDirectory()) throw new Error("--source-root must resolve to a directory");
    }
    const result = args.source ? await verifySource(catalog, args.source, { sourceRoot }) : await verifyCatalog(catalog, { sourceRoot });
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
        ? await import('../templates/adapters/laohu-film.mjs')
        : (() => { throw new Error(`Unsupported film blueprint format ${blueprint.format}; /1 and /2 are the only registered film clocks`); })();
    const result = await adapter.renderFilm({
      blueprintPath,
      outputPath: path.resolve(args.output),
      workRoot: path.resolve(args.workRoot),
      runtimeRoot: args.runtimeRoot ? path.resolve(args.runtimeRoot) : undefined,
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
  const entry = templateById(catalog, id, args);
  if (args.command === "show") await printShow(entry, args.json, catalog, args);
  else if (isLocalMethod(entry)) throw new Error(`${localMethodId(entry)} is a local method reference, not a renderable template or effect; use show to read its production method`);
  else if (args.command === "prepare") await prepare(args, catalog, entry);
  else if (entry.renderer === "native-style-scene") await renderComicPopSceneAction(args, catalog, entry);
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
