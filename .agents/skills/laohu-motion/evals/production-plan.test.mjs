import assert from "node:assert/strict";
import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { directorDesignMarkdown, inspectFilmReceipt, resolveCanonicalAttentionCameraRange, validatePlanFile } from "../scripts/production-plan.mjs";
import { resolveMotionRuntime } from "../scripts/laohu-motion-runtime.mjs";
import { attentionActorConsumer, resolveAttentionBindings } from "../templates/runtime/laohu-remotion/core/attention-phase.mjs";
import { captionManifestToSrt, compileCaptionManifest, compilePlan as compileAsrcutPlan, freezePlan as freezeAsrcutPlan, hashPlan as hashAsrcutPlan, importSrt } from "../../laohu-asrcut/scripts/asrcut.mjs";

const evalDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(evalDir, "..");
const repoRoot = path.resolve(skillDir, "../../..");
const templatesCli = path.join(skillDir, "scripts", "templates.mjs");
const productionPlanCli = path.join(skillDir, "scripts", "production-plan.mjs");
const evidenceRoot = path.join(repoRoot, ".cache", "validation", "motion-creative-production", "core");
const sourceEvidenceDir = path.join(repoRoot, ".cache", "validation", "motion-production-upgrade", "content");
const evalTmpRoot = path.join(repoRoot, ".cache", "tmp", "motion-creative-production", "core");

function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function fixturePngChunk(type, payload) {
  const name = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  let value = 0xffffffff;
  for (const byte of Buffer.concat([name, payload])) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  crc.writeUInt32BE((value ^ 0xffffffff) >>> 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  return Buffer.concat([length, name, payload, crc]);
}
function fixturePng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    fixturePngChunk("IHDR", header),
    fixturePngChunk("IDAT", deflateSync(Buffer.from([0, 255, 255, 255, 255]))),
    fixturePngChunk("IEND", Buffer.alloc(0)),
  ]);
}
function invoke(script, args, options = {}) {
  const tmpdir = options.tmpdir || evalTmpRoot;
  fsSync.mkdirSync(tmpdir, { recursive: true });
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.timeout || 1_200_000,
    maxBuffer: 24 * 1024 * 1024,
    env: { ...process.env, TMPDIR: tmpdir, ...(options.env || {}) },
  });
}
function assertCliOk(result, label) {
  assert.equal(result.error, undefined, label + ": " + (result.error?.message || "process spawn failed"));
  assert.equal(result.status, 0, label + " failed\nstdout:\n" + result.stdout + "\nstderr:\n" + result.stderr);
}
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}
async function bundledFfmpegPair(runId) {
  const pairDir = path.join(evalTmpRoot, "ffmpeg-pairs", runId);
  await fs.mkdir(pairDir, { recursive: true });
  const bundledFfmpeg = path.join(repoRoot, ".cache", "validation", "sound-foundation", "ffmpeg-runtime", "venv", "lib", "python3.12", "site-packages", "imageio_ffmpeg", "binaries", "ffmpeg-macos-aarch64-v9.0");
  const bundledFfprobe = path.join(repoRoot, ".cache", "tmp", "asrcut-media-probe", "ffprobe");
  await fs.access(bundledFfmpeg);
  await fs.access(bundledFfprobe);
  const ffmpeg = path.join(pairDir, "ffmpeg");
  const ffprobe = path.join(pairDir, "ffprobe");
  await fs.symlink(bundledFfmpeg, ffmpeg);
  await fs.symlink(bundledFfprobe, ffprobe);
  return ffmpeg;
}
async function buildV2DirectionPlan(runId, { candidate = "laohu-project-shot" } = {}) {
  const root = path.join(evidenceRoot, "production-plan-v2-eval", runId);
  await fs.mkdir(root, { recursive: true });
  const lockPath = path.join(root, "user-direction.md");
  const decisionText = "本轮用户要求以关系变化为核心，画面可以按真实材料重新组合。";
  await fs.writeFile(lockPath, "# 本轮方向\n\n" + decisionText + "\n");
  const candidateRow = candidate === "laohu-project-shot"
    ? { id: "project-shot-route", resourceType: "renderer-route", resourceId: "laohu-project-shot", fitReason: "The work can compose its own screen using the verified local Remotion host and mature module exports." }
    : { id: "authored-demo", resourceType: "template", resourceId: candidate, fitReason: "Technical reference only." };
  const plan = {
    format: "laohu.motion.production-plan/2",
    work: { id: runId, title: "Pre-render route fixture", directionMode: "locked-local" },
    inputs: {
      sourceMaterials: [{ id: "direction-lock", kind: "user-direction", role: "source-located direction lock", path: lockPath, sha256: sha256(await fs.readFile(lockPath)) }],
    },
    directionDecisions: [{
      id: "main-route", mode: "locked-local", rationale: "The screen should explain the actual relationship change with an adaptable local composition.",
      userLockRef: { sourceMaterialId: "direction-lock", locator: { lineStart: 3, lineEnd: 3 }, userDecision: decisionText, scope: "Preserve the relationship-change focus while allowing work-specific screen composition." },
      candidates: [candidateRow], selectedCandidateId: candidateRow.id,
    }],
    viewingUnits: [{
      id: "relationship-change", sourceRefs: [{ materialId: "direction-lock", locator: "line 3", kind: "direction" }],
      task: "Show the relationship change with a concrete visual arrangement.", completionSignal: "The viewer can follow the relation from its source to its result.",
    }],
    implementationPlan: [{
      id: "relationship-route", decisionId: "main-route", viewingUnitIds: ["relationship-change"],
      filmSegmentId: "relationship-segment", renderer: candidate === "laohu-project-shot" ? "laohu-project-shot" : "video-shotcraft-remotion",
      resourceType: candidate === "laohu-project-shot" ? "renderer-route" : "template", resourceId: candidate,
      mappingId: "relationship-consumer", consumerFields: candidate === "laohu-project-shot"
        ? ["modulePath", "moduleSha256", "exportName", "props", "dependencies", "assets"] : ["templateId"],
    }],
  };
  const planPath = path.join(root, "production-plan.json");
  await writeJson(planPath, plan);
  return { root, planPath, plan };
}
function designBrief() {
  return {
    sourceClockAndCoverage: "输入来源、冻结范围、唯一时钟及逐项覆盖边界。",
    contentLogic: "本段信息怎样承接前文、形成关系并落到观众能读出的结果。",
    globalVisualWorld: "全片空间、画幅、色彩角色、材质、光影、字体和层级关系。",
    objectsMaterialsAndText: "对象身份、可动部件、真实材料与屏显文字职责。",
    compositionAndState: "全幅构图、焦点顺序，以及对象进入前、变化中和落定后的状态。",
    cueByCuePicture: "逐 cue 讲述屏幕上会出现什么，如何表达该 cue 的内容。",
    actionsAndContinuity: "动作相位、前后镜头衔接、保留或退出的对象与阅读停留。",
    soundAndMix: "旁白、音乐、音效、环境声、混音关系及有声或无声选择。",
    resourcesAndConsumers: "每项必要素材、权利/获取状态与真实 Film/audio 消费者。",
    reverseReview: "从陌生观众角度复核可能误读、遗漏、遮挡和实际交接。",
  };
}
function globalDesignSettings() {
  return {
    frame: { width: 1920, height: 1080, fps: 30 },
    look: {
      palette: "暖纸白底、墨色结构和两种语义强调色。",
      surface: "清晰矢量线与低对比纸面纹理。",
      lighting: "均匀柔光，保留线条和文字对比。",
      spatialSystem: "全幅共用一个稳定空间锚点，关系线对准对象边界。",
      typography: "中文无衬线，标题、说明和注释采用明确字号层级。",
      hierarchy: "主对象优先，关系次之，解释文字最后读取。",
    },
    colorRoles: [
      { id: "ink", value: "#202329", meaning: "结构、轮廓与正文。" },
      { id: "accent", value: "#0E6F79", meaning: "当前承重关系与运行状态。" },
    ],
    textStyles: [{
      id: "label", fontFamily: "Noto Sans SC", fontWeight: "500", sizePx: 40, colorRoleId: "ink", lineHeight: 1.2, letterSpacing: 0, role: "可读说明与对象标签。",
      fontMaterialId: "font-noto-sans",
      consumerMappings: [{
        implementationPlanId: "relationship-route", mappingId: "relationship-consumer",
        fontFamilyField: "props.fontFamily", fontWeightField: "props.fontWeight", sizePxField: "props.fontSize",
        colorField: "props.color", lineHeightField: "props.lineHeight", letterSpacingField: "props.letterSpacing", fontFileField: "assets.fontFile",
      }],
    }],
  };
}
function directorUnitV2({ viewingUnitId, anchor, routeId, mappingId, content, scriptCues = [], sound, actionId = "reveal-links" }) {
  return {
    viewingUnitId,
    sourceAnchors: [anchor],
    designNarrative: content.narrative,
    purpose: content.purpose,
    visualGain: content.visualGain,
    representation: content.representation,
    composition: content.composition,
    focalOrder: content.focalOrder,
    look: { palette: "继承 globalSettings.look.palette 的语义色角色。", surface: "继承全片纸面材质；对象轮廓保持清晰。", lighting: "继承全片均匀柔光。", typography: "继承全局 label 字体；本单元屏显文字逐项引用 styleId。" },
    objects: [{
      id: "relation-map", role: "main relationship diagram", meaning: content.objectMeaning,
      appearance: "中心节点为墨色圆形，关系节点使用青色描边，箭头连接到实际目标边界。",
      movableParts: [{ id: "relation-links", role: "directional relationship links", appearance: "两条带箭头的青色线段，线宽与节点轮廓区分。", initialState: "连接线尚未显现。", processState: "连接线从中心节点向各目标节点逐条伸出。", resultState: "两条箭头稳定连接各自的目标节点。", consumerRefs: [{ implementationPlanId: routeId, responsibility: "绘制实际节点、关系线和箭头。" }] }],
      initialState: "一个孤立的中心节点。", processState: "关系线按口播 cue 顺序逐条生长，中心节点保持锚定。", resultState: "中心节点与两个有方向的目标节点完整可见。",
      consumerRefs: [{ implementationPlanId: routeId, responsibility: "实际 Film segment 的对象与关系绘制。" }],
    }],
    scriptCues,
    implementationPlanIds: [routeId],
    actions: [{
      id: actionId, phase: "change", triggerCueIds: scriptCues.map((cue) => cue.id), targetObjectIds: ["relation-map"],
      keyStates: [{ objectId: "relation-map", from: "孤立的中心节点", through: "第一条连接出现，第二条继续长出", to: "中心节点与两条方向明确的连接完整落定" }],
      timing: scriptCues.length
        ? { basis: "canonical-target-samples", startCueId: scriptCues[0].id, endCueId: scriptCues.at(-1).id, startOffsetSamples: 0, endOffsetSamples: 24000, relationship: "动作沿所引用口播 cue 的目标采样时钟推进，末端多停半秒供关系读取。" }
        : { basis: "semantic-budget", startCueId: null, endCueId: null, relationship: "纯视觉语义预算；不声明口播同步或绝对时码。" },
      pathOrMorph: "第一条箭头从中心节点上缘延伸至上方目标；第二条从中心节点右缘延伸至右下目标，节点位置固定，箭头端点贴合目标边界。",
      motionPurpose: "让抽象的方向关系在同一空间中变得可见。",
      handoff: "关系图停住供阅读；后续单元继续沿中心节点接入。",
      implementationPlanIds: [routeId],
    }],
    transition: { targetViewingUnitId: null, handoff: "结束时保留中心节点作为后续段落的接入锚点。", continuity: "沿用相同节点身份、颜色角色和画面坐标关系。" },
    sound,
  };
}
async function buildV3DirectionPlan(runId, { pendingMusic = false, unselectedMusic = false } = {}) {
  const built = await buildV2DirectionPlan(runId);
  const { plan } = built;
  plan.format = "laohu.motion.production-plan/3";
  const anchor = { materialId: "direction-lock", locator: "line 3", kind: "direction" };
  const fontPath = path.join(skillDir, "templates", "runtime", "laohu-native-clips", "lib", "fonts", "NotoSansSC-500.woff");
  plan.inputs.sourceMaterials.push({ id: "font-noto-sans", kind: "font-file", role: "hash-verified Noto Sans SC medium face used by the designed text style", path: fontPath, sha256: sha256(await fs.readFile(fontPath)) });
  const timelinePath = path.join(built.root, "timeline.json");
  const editPlanPath = path.join(built.root, "edit-plan.json");
  const words = [
    { tokenId: "source-1-seg-1-word-1", text: "第三层", targetRange: { startSample: 0, endSample: 48000, sampleRateHz: 48000 }, timingPrecision: "measured" },
    { tokenId: "source-1-seg-1-word-2", text: "是", targetRange: { startSample: 48000, endSample: 72000, sampleRateHz: 48000 }, timingPrecision: "measured" },
    { tokenId: "source-1-seg-1-word-3", text: "基础设施", targetRange: { startSample: 72000, endSample: 144000, sampleRateHz: 48000 }, timingPrecision: "measured" },
  ];
  await writeJson(timelinePath, {
    format: "laohu.asrcut.timeline/1", project: { id: "synthetic-direction-fixture", revision: 1 }, state: "frozen", coverageComplete: true,
    clock: { unit: "sample", sampleRateHz: 48000, quantization: "Synthetic technical fixture uses integer target samples." },
    durationSamples: 168000,
    clips: [{ occurrenceId: "source-1-occurrence-1", sourceId: "source-1", coverageId: "coverage-1", targetRange: { startSample: 0, endSample: 144000, sampleRateHz: 48000 }, words,
      transcriptSegments: [{ segmentId: "source-1-seg-1-sentence-1", text: "第三层，是基础设施。", targetRange: { startSample: 0, endSample: 144000, sampleRateHz: 48000 } }], timingPrecision: "measured" }],
  });
  await writeJson(editPlanPath, { format: "laohu.asrcut.edit-plan/1", state: "frozen", purpose: "synthetic isolated contract fixture only" });
  plan.inputs.asrcut = {
    timeline: { path: timelinePath, sha256: sha256(await fs.readFile(timelinePath)) },
    editPlan: { path: editPlanPath, sha256: sha256(await fs.readFile(editPlanPath)) },
  };
  const cue = (id, wordStart, wordEnd, exactText, continuityIn, continuityOut, visualNarration, screenText) => ({
    id,
    source: { kind: "token-range", occurrenceId: "source-1-occurrence-1", startTokenId: words[wordStart].tokenId, endTokenId: words[wordEnd].tokenId, exactText },
    continuityIn,
    continuityOut,
    visualNarration,
    screenText,
    actionIds: ["reveal-links"],
  });
  const screenText = {
    mode: "planned",
    items: [{
      id: "relationship-heading", text: "第三层 基础设施", role: "explanation", styleId: "label",
      layout: { position: "upper-center", region: "clear space above the diagram", alignment: "center", maxLines: 1, background: "none", layerOrder: "above-diagram" },
      visibility: { basis: "canonical-target-samples", startCueId: "cue-definition", endCueId: "cue-result", startOffsetSamples: 0, endOffsetSamples: 24000, retention: "remain visible through the result cue so the phrase is read as one heading", reason: "The heading names the relation shown below." },
      readingWindow: { startCueId: "cue-definition", endCueId: "cue-result", holdAcrossCues: true, reason: "Keep the complete phrase visible while narration crosses cue boundaries." },
      requiresReading: true,
      consumerRefs: [{ implementationPlanId: "relationship-route", mappingId: "relationship-consumer" }],
    }],
  };
  plan.directorDesign = {
    format: "laohu.motion.director-design/2",
    id: "design-" + runId,
    brief: designBrief(),
    globalSettings: globalDesignSettings(),
    narration: { mode: "timeline", reason: "The frozen canonical fixture supplies measured words; design coverage follows those exact token identities.", scriptSelections: [] },
    units: [directorUnitV2({
      viewingUnitId: "relationship-change", anchor, routeId: "relationship-route", mappingId: "relationship-consumer",
      content: {
        narrative: "As the speaker names the third layer, an isolated focal point appears on the warm paper field. As the relation is explained, two directional links grow from the fixed center toward separated target nodes; labels remain outside the arrows. The whole graph settles before handoff, so the viewer can read direction and ownership in one glance.",
        purpose: "Make the change from one isolated point to a relation visible.",
        visualGain: "Show the relation structure that spoken words alone cannot show at once.",
        representation: "One focal point connects to two nearby points through directional links.",
        composition: "Focal point at center-left; connected points form a readable diagonal around it.",
        focalOrder: "Focal point first, then the two links and their labels.",
        objectMeaning: "Shows the focal point, two target nodes, and the direction of their links.",
      },
      scriptCues: [
        cue("cue-definition", 0, 0, "第三层", "从开场留白接入一个尚未建立关系的中心节点。", "中心节点停在左中锚点，右侧保持空白，第一条关系线尚未出现；将视线交给下一 cue 的关系说明。", "暖纸全幅中，第三层索引先点亮，中心节点从画幅左中方淡入；背景保持安静，为后续关系留出右侧空间。", screenText),
        cue("cue-link", 1, 1, "是", "承接已点亮的第三层和固定中心节点，开始显示第一个关系方向。", "第一条青色方向线停在中心至上方目标的完整路径，中心节点身份和位置不变；下一 cue 将补齐第二个支撑目标。", "中心节点保持原位，第一条青色方向线从中心向上方目标延伸；镜头不切换，观众继续追踪同一个对象。", { mode: "none", reason: "这一词只承接定义，画面沿用中心节点和未完成的方向线，不再叠加另一句字幕。" }),
        cue("cue-result", 2, 2, "基础设施", "承接中心节点和第一条关系线，补齐基础设施结果图。", "第二条线和标签落定后，全图停在同一坐标空间；本句信息完整，片尾无后续 cue。", "第二条青色方向线接到右下目标，两个标签分别落在对应线旁；全图停在同一坐标空间，中心节点、箭头和文字保持可辨。", { mode: "none", reason: "讲述由图形关系承载，无需重复整句屏显。" }),
      ],
      sound: pendingMusic
        ? { intent: { voice: "planned", sfx: "none", music: "designed" }, reason: "保留口播轨并测试一条低密度音乐床；只在本片音轨试听后决定是否保留，不为每次连线加音效。", voiceTrackIds: ["locked-narration"], eventIds: [], trackIds: ["relationship-music"] }
        : { intent: { voice: "planned", sfx: "none", music: "none" }, reason: "保留现有口播的计划消费者，不设计额外音乐或动作音效。", voiceTrackIds: ["locked-narration"], eventIds: [], trackIds: [] },
    })],
    resourceTasks: pendingMusic ? [{
      id: "music-bed-acquisition",
      role: "music bed for the relationship explanation",
      requirement: "A continuous instrumental bed that remains unobtrusive beneath the locked narration.",
      viewingUnitIds: ["relationship-change"], actionIds: [],
      sourceQueries: [{ source: "catalog or licensed music source", query: "instrumental explanation bed, warm, low density, no sharp transient" }],
      selectionCriteria: ["Listen against this narration before acceptance.", "Reject metallic high tones and long sharp tails."],
      acquisitionPlan: {
        owner: "analysis", method: "Analysis may search and select a candidate, then retrieve it directly or hand the exact retrieval task to Motion or the relevant specialist.",
        retrievalSteps: ["Search the listed licensed source using the stated query and selection criteria.", "After choosing an actual candidate, download its source file and license evidence."],
        processingSteps: ["Probe format, duration, channels and actual SHA-256.", "Trim only the chosen excerpt and preserve the original source in the project asset location."],
        rightsChecks: ["Record source-file redistribution separately from permission to synchronize it into the finished video.", "Keep source page, license evidence and actual file hash linked to the asset record."],
        acceptanceChecks: ["Listen in context with narration and reject masking or distracting peaks.", "Confirm the exact registered asset is consumed by the planned audio track."],
        failureAction: "Keep the task pending and search another reviewed source; do not substitute silence or synthesize sound without authorization.",
      },
      consumerTargets: [{ kind: "audio-track", id: "relationship-music" }],
      selection: unselectedMusic ? null : { kind: "audio", assetId: "catalog.example-explanation-bed", sourceUrl: "https://example.invalid/sounds/explanation-bed", license: "CC0-1.0" },
      soundRole: "music", status: "pending",
    }] : [],
  };
  await writeJson(built.planPath, plan);
  return built;
}
async function buildF2Plan(runId, { demoReceipt = false, candidateAudio = false } = {}) {
  const root = path.join(evidenceRoot, "production-plan-eval", runId);
  await fs.mkdir(root, { recursive: true });
  const sourceContentPath = path.join(sourceEvidenceDir, "f2-structured-content.json");
  const blueprintPath = path.join(sourceEvidenceDir, "f2-film-v2.blueprint.json");
  const keyImagePath = path.join(sourceEvidenceDir, "f2-structured-keyframe.png");
  const originalReceiptPath = path.join(sourceEvidenceDir, "f2-structured-keyframe.manifest.json");
  const sourceMaterialHash = sha256(await fs.readFile(sourceContentPath));
  const blueprint = JSON.parse(await fs.readFile(blueprintPath, "utf8"));
  const proofReceiptPath = demoReceipt ? path.join(root, "demo-keyframe.manifest.json") : originalReceiptPath;
  const candidateAudioAssetId = "freesound.warm-synth-explanation-bed-530217";
  const audioIndexPath = path.join(skillDir, "assets", "audio", "index.json");
  if (demoReceipt) {
    const receipt = JSON.parse(await fs.readFile(originalReceiptPath, "utf8"));
    receipt.contentBinding.demoMode = true;
    await writeJson(proofReceiptPath, receipt);
  }
  const audioPlanPath = path.join(root, "audio-plan.json");
  const audioPlan = {
    schemaVersion: 1,
    timeUnit: "seconds",
    timeBasis: "film-global",
    durationSec: blueprint.clock.durationSec,
    sampleRate: 48000,
    channels: 2,
    events: [],
    tracks: candidateAudio ? [{
      id: "selected-candidate-explanation-bed",
      assetId: candidateAudioAssetId,
      bus: "music",
      startSec: 0,
      sourceInSec: 0,
      sourceOutSec: 10,
      gainDb: -18,
      envelope: { attackSec: 0.05, releaseSec: 0.05 },
    }] : [],
    voiceWindows: [],
    automation: [],
    timeMaps: [],
    assets: [],
    generatedAssets: [],
  };
  await writeJson(audioPlanPath, audioPlan);
  const plan = {
    format: "laohu.motion.production-plan/1",
    work: { id: "f2-production-integration-" + runId, title: "F2 structured consumer integration", directionMode: "technical-probe" },
    inputs: {
      sourceMaterials: [{
        id: "relation-content",
        kind: "structured-style-content",
        role: "relationship data for this shot",
        path: sourceContentPath,
        sha256: sourceMaterialHash,
      }],
      filmBlueprint: { path: blueprintPath, sha256: sha256(await fs.readFile(blueprintPath)) },
      audioPlan: { path: audioPlanPath, sha256: sha256(await fs.readFile(audioPlanPath)) },
      ...(candidateAudio ? { assetIndex: { path: audioIndexPath, sha256: sha256(await fs.readFile(audioIndexPath)) } } : {}),
    },
    ...(candidateAudio ? { audioPreview: { candidateAssetIds: [candidateAudioAssetId] } } : {}),
    directionDecisions: [{
      id: "relationship-direction",
      mode: "technical-probe",
      rationale: "The relationship change is explained through who supports whom; a relationship map makes the direction visible in one shot.",
      candidates: [
        {
          id: "f2-map",
          resourceType: "style",
          resourceId: "F2",
          fitReason: "The source design draws named people and directional relationship labels, which matches the viewing task for this unit.",
          limitations: "The receipt proves source/content execution only, not readability or audience fit.",
          keyStateEvidence: [{
            phase: "middle relationship state",
            path: keyImagePath,
            sha256: sha256(await fs.readFile(keyImagePath)),
            observation: "The output receipt binds the actual structured relationship JSON, registered F2 function, and exact Film layer inputs.",
            rendererReceipt: { path: proofReceiptPath, sha256: sha256(await fs.readFile(proofReceiptPath)) },
            contentMaterialId: "relation-content",
            filmSegmentId: "relation",
            mappingId: "style-layer-map",
          }],
        },
        {
          id: "f1-chart",
          resourceType: "style",
          resourceId: "F1",
          fitReason: "It can display quantitative values, but it does not express the relationship links in this unit.",
        },
      ],
      selectedCandidateId: "f2-map",
      decisionInputs: [],
    }],
    viewingUnits: [{
      id: "relationship-unit",
      sourceRefs: [{ materialId: "relation-content", locator: "nodes and edges", kind: "structured content" }],
      task: "Show how the named people and team relate to the focal person.",
      completionSignal: "Viewer can point to the focal person and read the three labeled links.",
    }],
    shots: [{
      id: "relationship-shot",
      viewingUnitIds: ["relationship-unit"],
      decisionId: "relationship-direction",
      filmSegmentId: "relation",
      visualIntent: "Keep the focal person clear while each labeled relationship becomes visible.",
      subjects: [],
      screenText: [],
      phases: {},
      audioIntent: { choice: "none", reason: "This short visual explanation is silent; narration and music are outside this bounded example.", eventIds: [] },
      sourceMappings: [
        { id: "renderer-map", role: "base", segmentId: "relation", renderer: "video-shotcraft-remotion", resourceType: "component", resourceId: "laohu-style-code-canvas", consumerFields: ["sourceCatalogId"] },
        { id: "style-layer-map", role: "layer", segmentId: "relation", renderer: "video-shotcraft-remotion", resourceType: "style", resourceId: "F2", layerIndex: 0, consumerFields: ["layers.0.props.styleId", "layers.0.props.content", "layers.0.props.contentSource"] },
      ],
    }],
    verification: {
      gates: [{
        id: "structured-content",
        inspect: "The Film manifest layer receipt binds F2 source identity, exact structured content hash, and source-material path/hash.",
        evidence: "Film /2 manifest and the renderer receipt referenced by the selected key-state evidence.",
        redoReason: "Correct the content/source mapping or rebuild the key-state with the actual selected source material.",
      }],
    },
    outputs: {
      picture: "outputs/picture-" + runId + ".mp4",
      filmManifest: "outputs/picture-" + runId + ".mp4.manifest.json",
      audioWav: "outputs/audio-" + runId + ".wav",
      audioManifest: "outputs/audio-" + runId + ".manifest.json",
      finalVideo: "outputs/final-" + runId + ".mp4",
    },
  };
  const planPath = path.join(root, "production-plan.json");
  await writeJson(planPath, plan);
  return { root, planPath, plan };
}

let cachedStyleLibraryReview = null;
let cachedStyleLibraryPageStats = null;
async function readStyleLibraryByPages() {
  if (cachedStyleLibraryReview) {
    return { reviewReceipt: structuredClone(cachedStyleLibraryReview), ...cachedStyleLibraryPageStats };
  }
  let cursor = null;
  let lastPage = null;
  let reviewedCharacters = 0;
  const reviewedIds = new Set();
  let pageCount = 0;
  do {
    const args = ["styles", "fulltext", "--library", "--page-characters", "24000", "--json"];
    if (cursor) args.push("--cursor", cursor);
    const pageResult = invoke(templatesCli, args);
    assertCliOk(pageResult, "sequential full-library page");
    lastPage = JSON.parse(pageResult.stdout);
    reviewedCharacters += lastPage.page.characterCount;
    for (const id of lastPage.page.ids) reviewedIds.add(id);
    assert.deepEqual(lastPage.missingIds, []);
    cursor = lastPage.nextCursor;
    pageCount += 1;
  } while (cursor);
  assert.ok(reviewedCharacters > 500_000, "the fixture consumes all 73 complete formal style references, not only a count receipt");
  assert.equal(lastPage.complete, true);
  assert.equal(lastPage.reviewReceipt.complete, true);
  cachedStyleLibraryReview = lastPage.reviewReceipt;
  cachedStyleLibraryPageStats = { reviewedCharacters, reviewedIds: [...reviewedIds], pageCount };
  return { reviewReceipt: structuredClone(cachedStyleLibraryReview), ...cachedStyleLibraryPageStats };
}

async function markF2PlanAsNewDirection(plan) {
  plan.work.directionMode = "new-direction";
  plan.styleLibraryReview = (await readStyleLibraryByPages()).reviewReceipt;
  const decision = plan.directionDecisions[0];
  decision.mode = "new-direction";
  const f2 = JSON.parse(await fs.readFile(path.join(skillDir, "templates", "styles", "compatibility-index.json"), "utf8"))
    .entries.find((row) => row.id === "F2");
  const f2Text = new TextDecoder().decode(await fs.readFile(path.join(skillDir, "templates", "styles", f2.contentPath)));
  const lines = f2Text.split(/\r?\n/);
  const line = lines.findIndex((item) => item.includes("人和人之间的箭头一条条画出来")) + 1;
  assert.ok(line > 0, "F2 fixture contains the cited original mechanism");
  decision.decisionInputs = [
    { resourceType: "style-library", resourceId: "all", whyRelevant: "Read the pinned full original corpus before choosing this new aesthetic direction." },
    {
      resourceType: "style", resourceId: "F2", whyRelevant: "The source mechanism draws relation arrows one by one and labels each arrow.",
      sourceLocation: { path: f2.contentPath, lineStart: line, lineEnd: line },
      applicability: "This viewing unit needs the links between named people to become visible.",
      preservedMechanism: "Reveal each directional link in sequence and place its original relationship label on that link.",
      consumerMappings: [{
        shotId: "relationship-shot", mappingId: "style-layer-map",
        howUsed: "The selected F2 Film layer consumes styleId F2 and the original node/edge fields, so its linked arrows and labels reveal the relationship progressively.",
      }],
    },
  ];
  return plan;
}

async function addF2V3DirectorDesign(plan) {
  plan.format = "laohu.motion.production-plan/3";
  const unit = plan.viewingUnits[0];
  const anchor = { materialId: unit.sourceRefs[0].materialId, locator: unit.sourceRefs[0].locator, kind: unit.sourceRefs[0].kind };
  const audioIndex = JSON.parse(await fs.readFile(path.join(skillDir, "assets", "audio", "index.json"), "utf8"));
  const asset = audioIndex.assets.find((row) => row.id === "freesound.warm-synth-explanation-bed-530217");
  assert.ok(asset, "the fixture uses an exact local asset-index entry");
  const audioPlan = JSON.parse(await fs.readFile(plan.inputs.audioPlan.path, "utf8"));
  const musicTrackIds = (audioPlan.tracks || []).filter((row) => row.bus === "music").map((row) => row.id);
  plan.verification.gates = plan.verification.gates.map((gate) => ({
    ...gate,
    scope: "relationship-segment",
    criterionRef: "criterion:structured-style-content-binding",
    observations: "Awaiting actual rendered-frame and listener review; not machine-rated as accepted.",
    status: "UNKNOWN",
    redoLocation: "production-plan.json#verification.gates." + gate.id,
  }));
  const selectedF2 = plan.directionDecisions[0].candidates.find((row) => row.id === "f2-map");
  selectedF2.resourceType = "component";
  selectedF2.resourceId = "laohu-style-code-canvas";
  selectedF2.fitReason = "The registered production consumer renders the source-selected F2 relationship mechanism inside the actual Film layer.";
  const evidenceFile = path.resolve(repoRoot, asset.source.licenseEvidenceFile);
  plan.inputs.sourceMaterials.push({
    id: "music-license-evidence", kind: "source-license-evidence", role: "hash-verified source-page/license evidence",
    path: evidenceFile, sha256: sha256(await fs.readFile(evidenceFile)),
  });
  plan.implementationPlan = [{
    id: "relationship-shot", decisionId: "relationship-direction", viewingUnitIds: [unit.id],
    filmSegmentId: "relation", renderer: "video-shotcraft-remotion", resourceType: "component", resourceId: "laohu-style-code-canvas",
    mappingId: "renderer-map", consumerFields: ["sourceCatalogId"],
  }];
  plan.directorDesign = {
    format: "laohu.motion.director-design/2", id: "f2-design-" + plan.work.id,
    brief: designBrief(),
    globalSettings: { ...globalDesignSettings(), textStyles: [] },
    narration: { mode: "none", reason: "This source-selected structured-content presentation has no recorded or scripted narration; the production audio plan is checked below for voice tracks/windows.", scriptSelections: [] },
    units: [directorUnitV2({
      viewingUnitId: unit.id, anchor, routeId: "relationship-shot", mappingId: "renderer-map", actionId: "draw-source-links",
      content: {
        narrative: "The named focal person holds the center of the frame. Three labeled directional links draw from the focal node to the source-selected people around it; each label stays beside its own arrow. The completed map holds so a viewer can scan who relates to whom without following moving nodes.",
        purpose: "Show the named focal person and the direction of each relationship.",
        visualGain: "The simultaneous spatial links make the abstract relationship visible at a glance.",
        representation: "A focal node connects to labeled nodes with directional arrows.",
        composition: "Keep the focal person central; distribute the three linked nodes around the focal node with clear separation.",
        focalOrder: "Focal node, directional links, then relationship labels.",
        objectMeaning: "Encodes each person and the direction/type of their link.",
      },
      scriptCues: [],
      sound: {
        intent: { voice: "none", sfx: "none", music: musicTrackIds.length ? "designed" : "none" },
        reason: "This is an explicitly non-narrated structured visual; use the selected music consumer only when the existing audio plan contains it, and add no illustrative arrow sounds.",
        voiceTrackIds: [], eventIds: [], trackIds: musicTrackIds,
      },
    })],
    resourceTasks: [{
      id: "selected-music-source", role: "music bed", requirement: "Use the selected source only after listening in context and confirming narration remains clear.",
      viewingUnitIds: [unit.id], actionIds: [],
      sourceQueries: [{ source: "Freesound source page", query: "the exact selected instrumental explanation-bed candidate" }],
      selectionCriteria: ["Assess the actual sound with narration.", "Reject masking, sharp tones or distracting changes."],
      acquisitionPlan: {
        owner: "laohu-arrangement", method: "Analysis selected and retrieved the exact indexed source; Motion consumes it through the existing audio-plan and asset-index contracts.",
        retrievalSteps: ["Resolve the selected asset ID to its indexed source page and download record.", "Read and preserve the exact source-page license evidence file."],
        processingSteps: ["Verify actual audio bytes against the index SHA-256.", "Choose source range and gain in the audio plan without rewriting the original source."],
        rightsChecks: ["Compare source page and license with the asset index.", "Record source-file redistribution separately from synchronization into the finished work."],
        acceptanceChecks: ["Confirm the actual selected file is consumed by the named audio track.", "Listen in context and check voice intelligibility and distracting transients."],
        failureAction: "If source fit fails, return to selection and choose another source; do not silently synthesize or replace with silence.",
      },
      consumerTargets: [{ kind: "audio-track", id: "selected-candidate-explanation-bed" }],
      selection: { kind: "audio", assetId: asset.id, sourceUrl: asset.source.page, license: asset.license },
      soundRole: "music", status: "satisfied",
      acquisition: {
        actualSha256: asset.sha256,
        rightsReview: {
          kind: "audio", selectedId: asset.id, sourceUrl: asset.source.page, license: asset.license,
          evidenceMaterialId: "music-license-evidence", reviewedBy: "asset-index source-page evidence review",
          basis: asset.redistribution.basis, sourceDistribution: "allowed", finishedWorkSync: "allowed",
        },
      },
    }],
  };
  return plan;
}

async function buildFontDeliveryPlan(runId) {
  const built = await buildV2DirectionPlan("font-delivery-" + runId);
  const { root, planPath, plan } = built;
  const fontRelativePath = "assets/Inter-variable.woff";
  const fontPath = path.join(root, fontRelativePath);
  await fs.mkdir(path.dirname(fontPath), { recursive: true });
  await fs.copyFile(path.join(skillDir, "templates/runtime/laohu-native-clips/lib/fonts/Inter-var.woff"), fontPath);
  const fontBytes = await fs.readFile(fontPath);
  const fontSha256 = sha256(fontBytes);
  const directionText = path.join(root, "user-direction.md");
  plan.format = "laohu.motion.production-plan/3";
  plan.work.title = "Actual local font producer and delivery verification fixture";
  plan.inputs.sourceMaterials.push({
    id: "local-inter-font", kind: "font-file", role: "the exact local variable font loaded by useFonts and consumed by this project-shot", path: fontPath, sha256: fontSha256,
  });
  plan.viewingUnits[0] = {
    id: "font-card-unit",
    sourceRefs: [{ materialId: "direction-lock", locator: "line 3", kind: "direction" }],
    task: "Show one short title in the declared local font.",
    completionSignal: "The actual project-shot displays the exact title with the planned family, weight, size and color.",
  };
  const modulePath = "shots/font-card.tsx";
  const moduleFile = path.join(root, modulePath);
  await fs.mkdir(path.dirname(moduleFile), { recursive: true });
  const moduleSource = `import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Core} from '@laohu/motion';

type FontCardProps={title:string;fontFamily:string;fontWeight:string;fontFaceWeight:string;fontSize:number;color:string;lineHeight:number;letterSpacing:number;fontFile:string};
export const FontCard:React.FC<FontCardProps>=(props)=>{
  const ready=Core.useFonts([{family:props.fontFamily,file:props.fontFile,weight:props.fontFaceWeight,weightProbes:[props.fontWeight]}]);
  if(!ready)return null;
  return <AbsoluteFill style={{background:'#f3efe5',alignItems:'center',justifyContent:'center'}}>
    <div style={{fontFamily:props.fontFamily,fontWeight:props.fontWeight,fontSize:props.fontSize,color:props.color,lineHeight:props.lineHeight,letterSpacing:props.letterSpacing}}>{props.title}</div>
  </AbsoluteFill>;
};
`;
  await fs.writeFile(moduleFile, moduleSource);
  const moduleSha256 = sha256(await fs.readFile(moduleFile));
  const props = {
    title: "Variable type",
    fontFamily: "Inter",
    fontWeight: "700",
    fontFaceWeight: "100 900",
    fontSize: 54,
    color: "#202329",
    lineHeight: 1.2,
    letterSpacing: 0,
    fontFile: fontRelativePath,
  };
  const filmBlueprint = {
    format: "laohu.huashu-film-blueprint/2", width: 1920, height: 1080, fps: 30,
    clock: { kind: "film-global", durationSec: 1 },
    segments: [{
      id: "font-card", renderer: "laohu-project-shot", compositionGroupId: "font-delivery",
      startSec: 0, endSec: 1, modulePath, moduleSha256, exportName: "FontCard", props,
      dependencies: [], assets: [{ path: fontRelativePath, sha256: fontSha256 }],
    }],
    compositionGroups: [{ id: "font-delivery", segmentIds: ["font-card"] }], transitionEdges: [],
  };
  const filmBlueprintPath = path.join(root, "film-blueprint.json");
  await writeJson(filmBlueprintPath, filmBlueprint);
  const audioPlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 1,
    sampleRate: 48000, channels: 2, events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [],
  };
  const audioPlanPath = path.join(root, "audio-plan.json");
  await writeJson(audioPlanPath, audioPlan);
  plan.inputs.filmBlueprint = { path: filmBlueprintPath, sha256: sha256(await fs.readFile(filmBlueprintPath)) };
  plan.inputs.audioPlan = { path: audioPlanPath, sha256: sha256(await fs.readFile(audioPlanPath)) };
  plan.implementationPlan = [{
    id: "font-shot", decisionId: "main-route", viewingUnitIds: ["font-card-unit"], filmSegmentId: "font-card",
    renderer: "laohu-project-shot", resourceType: "renderer-route", resourceId: "laohu-project-shot",
    mappingId: "font-shot-map", consumerFields: ["modulePath", "moduleSha256", "exportName", "props", "dependencies", "assets"],
  }];
  plan.shots = [{
    id: "font-shot", viewingUnitIds: ["font-card-unit"], decisionId: "main-route", filmSegmentId: "font-card",
    visualIntent: "Keep the short title centered with a clear paper background so the loaded type remains the only focal element.",
    subjects: [], screenText: [{ id: "font-title", text: props.title, role: "title", requiresReading: true }],
    phases: { read: { intent: "Hold the title long enough for one read", textIds: ["font-title"] } },
    audioIntent: { choice: "none", reason: "This one-second technical text card intentionally has no voice or music.", eventIds: [] },
    sourceMappings: [{
      id: "font-shot-map", role: "base", segmentId: "font-card", renderer: "laohu-project-shot",
      resourceType: "project-shot", resourceId: modulePath,
      consumerFields: ["modulePath", "moduleSha256", "exportName", "props", "dependencies", "assets", "props.fontFamily", "props.fontWeight", "props.fontSize", "props.color", "props.lineHeight", "props.letterSpacing", "props.fontFile"],
    }],
  }];
  const anchor = { materialId: "direction-lock", locator: "line 3", kind: "direction" };
  const cue = {
    id: "font-title-cue", source: { kind: "presentation-only", reason: "The title is a visual-only presentation with no script or recorded voice." },
    continuityIn: "The card opens on the paper field; the title is the sole new element.",
    continuityOut: "The title remains centered at full opacity against the unchanged paper field; the card ends without a next cue.",
    visualNarration: "A centered dark-charcoal title appears in Inter bold over a warm paper-white field. The title starts hidden, resolves without moving the camera, and holds at full opacity with clear space around it; no other object or text enters.",
    screenText: {
      mode: "planned", items: [{
        id: "font-title", text: props.title, role: "title", styleId: "local-label",
        layout: { position: "center", region: "the center of the warm paper field", alignment: "center", maxLines: 1, background: "none", layerOrder: "only text layer" },
        visibility: { basis: "semantic-budget", startCueId: "font-title-cue", endCueId: "font-title-cue", retention: "hold the title through the one-second card", reason: "The full title must remain visible for one reading pass." },
        readingWindow: { startCueId: "font-title-cue", endCueId: "font-title-cue", holdAcrossCues: false, reason: "One short two-word title stays centered with open space." },
        requiresReading: true, consumerRefs: [{ implementationPlanId: "font-shot", mappingId: "font-shot-map" }],
      }],
    },
    actionIds: ["reveal-links"],
  };
  const designUnit = directorUnitV2({
    viewingUnitId: "font-card-unit", anchor, routeId: "font-shot", mappingId: "font-shot-map",
    content: {
      narrative: "The only message is a short English title. The local variable-font file is hash-verified, loaded by the real Remotion project-shot module and used for the exact title consumer; open space and a fixed camera keep the words easy to locate.",
      purpose: "Display the title in the selected local font.",
      visualGain: "The actual rendered title connects the declared type choices to visible text.",
      representation: "A single centered title sits on a warm paper field.",
      composition: "Use a fixed centered composition with clear outer margins.",
      focalOrder: "Read the title; there are no competing objects.",
      objectMeaning: "The title is the only information-bearing object in this short card.",
    },
    scriptCues: [cue],
    sound: { intent: { voice: "none", sfx: "none", music: "none" }, reason: "No voice, music or sound effect is selected for this title card.", voiceTrackIds: [], eventIds: [], trackIds: [] },
    actionId: "reveal-links",
  });
  designUnit.sourceAnchors = [anchor];
  designUnit.actions[0].timing = { basis: "semantic-budget", startCueId: "font-title-cue", endCueId: "font-title-cue", relationship: "The title enters and remains in the same centered position for the full card." };
  plan.directorDesign = {
    format: "laohu.motion.director-design/2", id: "font-design-" + runId, brief: designBrief(),
    globalSettings: {
      ...globalDesignSettings(),
      textStyles: [{
        id: "local-label", fontFamily: props.fontFamily, fontWeight: props.fontWeight,
        sizePx: props.fontSize, colorRoleId: "ink", lineHeight: props.lineHeight, letterSpacing: props.letterSpacing,
        role: "the only title in this local font receipt fixture", fontMaterialId: "local-inter-font",
        consumerMappings: [{
          implementationPlanId: "font-shot", mappingId: "font-shot-map", fontFamilyField: "props.fontFamily",
          fontWeightField: "props.fontWeight", sizePxField: "props.fontSize", colorField: "props.color",
          lineHeightField: "props.lineHeight", letterSpacingField: "props.letterSpacing", fontFileField: "props.fontFile",
        }],
      }],
    },
    narration: { mode: "none", reason: "The canonical input contains no recording or script; the title is a visual presentation.", scriptSelections: [] },
    units: [designUnit], resourceTasks: [],
  };
  plan.verification = { gates: [{
    id: "visual-review", inspect: "Review the actual centered title and font against the plan.", evidence: "A real rendered frame and Film receipt are produced by this technical fixture; no human review is claimed.", redoReason: "Revise the visible title or its actual font consumer, then rerender.",
    scope: "one title card", criterionRef: "criterion:font-load-and-title-presence", observations: "No aesthetic conclusion has been recorded.", status: "UNKNOWN", redoLocation: "production-plan.json#verification.gates.visual-review",
  }] };
  plan.outputs = {
    picture: "outputs/font-card.mp4", filmManifest: "outputs/font-card.manifest.json",
    audioWav: "outputs/font-card.wav", audioManifest: "outputs/font-card.audio-manifest.json", finalVideo: "outputs/font-card-final.mp4",
  };
  await writeJson(planPath, plan);
  return { root, planPath, plan, fontSha256, fontRelativePath };
}

function structuralVoiceWav() {
  const sampleRate = 48000, frames = sampleRate, channels = 2;
  const buffer = Buffer.alloc(44 + frames * channels * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36);
  buffer.writeUInt32LE(frames * channels * 2, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    const value = Math.round(Math.sin(2 * Math.PI * 176 * frame / sampleRate) * 1600);
    buffer.writeInt16LE(value, 44 + frame * 4); buffer.writeInt16LE(value, 46 + frame * 4);
  }
  return buffer;
}

async function buildV4CaptionAttentionPlan(runId) {
  const built = await buildFontDeliveryPlan("attention-" + runId);
  const {root, planPath, plan} = built;
  plan.format = "laohu.motion.production-plan/4";
  plan.inputs.sourceMaterials = plan.inputs.sourceMaterials.filter((row) => row.id !== "local-inter-font");
  const captionFontPath = "assets/NotoSansSC-500.woff";
  const captionFontFile = path.join(root, captionFontPath);
  await fs.mkdir(path.dirname(captionFontFile), {recursive: true});
  await fs.copyFile(path.join(skillDir, "templates/runtime/laohu-native-clips/lib/fonts/NotoSansSC-500.woff"), captionFontFile);
  const captionFontSha256 = sha256(await fs.readFile(captionFontFile));
  plan.inputs.sourceMaterials.push({id: "local-caption-cjk", kind: "font-file",
    role: "synthetic technical fixture font loaded by the real project-shot to exercise the formal renderer receipt path",
    path: captionFontFile, sha256: captionFontSha256});
  const editPlanPath = path.join(root, "edit-plan.json");
  const timelinePath = path.join(root, "timeline.json");
  const captionDesignPath = path.join(root, "caption-design.json");
  const captionManifestPath = path.join(root, "caption-manifest.json");
  const captionsSrtPath = path.join(root, "captions.srt");
  const editPlanDraft = importSrt("1\n00:00:00,000 --> 00:00:01,000\n你好\n", {
    projectId: "attention-technical-fixture-" + runId, sourceId: "fixture-srt", sampleRateHz: 48000,
    sourceSampleRateHz: 48000, sourceDurationSamples: 48000,
  });
  editPlanDraft.format = "laohu.asrcut.edit-plan/2";
  editPlanDraft.authorization.presentationTiming = true;
  editPlanDraft.sequence = editPlanDraft.sequence.map((row) => ({kind: "source", ...row}));
  editPlanDraft.integrity.planSha256 = hashAsrcutPlan(editPlanDraft);
  const editPlan = freezeAsrcutPlan(editPlanDraft);
  const timeline = compileAsrcutPlan(editPlan);
  await writeJson(editPlanPath, editPlan);
  await writeJson(timelinePath, timeline);
  const timelineBytes = await fs.readFile(timelinePath);
  const timelineSha256 = sha256(timelineBytes);
  const planSha256 = hashAsrcutPlan(editPlan);
  const occurrence = timeline.clips[0].occurrenceId;
  const segment = timeline.clips[0].transcriptSegments[0];
  const captionDesign = {
    format: "laohu.asrcut.caption-design/1", projectId: editPlan.project.id, revision: editPlan.project.revision,
    planSha256, timelineSha256, profile: "zh-caption/1", coveragePolicy: "all-retained-speech/1", exclusions: [],
    cues: [{
      id: "caption-greeting", occurrenceId: occurrence, segmentId: segment.segmentId, lines: ["你好"],
      displayWindow: {range: structuredClone(segment.targetRange)}, segmentationDecision: "single short clause",
      reason: "The retained utterance is one short semantic caption cue.",
    }],
  };
  const captionManifest = compileCaptionManifest({plan: editPlan, timeline, design: captionDesign, planSha256, timelineSha256});
  await writeJson(captionDesignPath, captionDesign);
  await writeJson(captionManifestPath, captionManifest);
  await fs.writeFile(captionsSrtPath, captionManifestToSrt(captionManifest));
  plan.inputs.asrcut = {
    timeline: {path: path.relative(root, timelinePath), sha256: timelineSha256},
    editPlan: {path: path.relative(root, editPlanPath), sha256: sha256(await fs.readFile(editPlanPath))},
    captionManifest: {path: path.relative(root, captionManifestPath), sha256: sha256(await fs.readFile(captionManifestPath))},
  };

  const voiceRelativePath = "assets/structural-voice.wav";
  const voicePath = path.join(root, voiceRelativePath);
  await fs.mkdir(path.dirname(voicePath), {recursive: true});
  const voiceBytes = structuralVoiceWav();
  await fs.writeFile(voicePath, voiceBytes);
  const audioPlanPath = path.join(root, "audio-plan.json");
  const audioPlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 1,
    sampleRate: 48000, channels: 2, events: [],
    tracks: [{id: "locked-narration", assetId: "structural-voice", bus: "voice", startSec: 0, locked: true}],
    voiceWindows: [{id: "fixture-voice-window", startSec: 0, endSec: 1}],
    automation: [], timeMaps: [],
    assets: [{id: "structural-voice", file: voiceRelativePath, durationSec: 1, sha256: sha256(voiceBytes),
      license: "internal-test-fixture", redistribution: {status: "sync-only", basis: "Synthetic signal exists only to exercise the timeline voice-bus contract in this structural test.", syncUse: "allowed"}, reviewStatus: "ready"}],
    generatedAssets: [],
  };
  await writeJson(audioPlanPath, audioPlan);
  plan.inputs.audioPlan = {path: path.relative(root, audioPlanPath), sha256: sha256(await fs.readFile(audioPlanPath))};

  const blueprintPath = path.join(root, "film-blueprint.json");
  const blueprint = JSON.parse(await fs.readFile(blueprintPath, "utf8"));
  blueprint.clock = {kind: "asrcut-v2", timelinePath: path.relative(root, timelinePath), timelineSha256,
    editPlanPath: path.relative(root, editPlanPath), editPlanSha256: sha256(await fs.readFile(editPlanPath))};
  const segmentBlueprint = blueprint.segments[0];
  delete segmentBlueprint.startSec;
  delete segmentBlueprint.endSec;
  segmentBlueprint.unitIds = [occurrence];
  segmentBlueprint.props = {
    attentionGlobalFromSeconds: 0,
    captionManifest,
    captionStyle: {
      textStyleId: "caption-style", function: "subtitle", spatialRelation: "screen-overlay",
      temporalBehavior: "caption-manifest-display-window", coordinateSpace: "output-pixels",
      x: 520, y: 880, width: 880, height: 120, zIndex: 100, alignment: "center",
      background: "rgba(0,0,0,0.72)", paddingPx: 14, maxLines: 2,
      fontFamily: "Noto Sans SC", fontWeight: "500", sizePx: 34, color: "#ffffff", lineHeight: 1.2, letterSpacing: 0,
    },
    attentionPhases: [],
  };
  segmentBlueprint.assets = [{path: captionFontPath, sha256: captionFontSha256}];
  await writeJson(blueprintPath, blueprint);
  plan.inputs.filmBlueprint = {path: path.relative(root, blueprintPath), sha256: sha256(await fs.readFile(blueprintPath))};

  const routeFields = ["modulePath", "moduleSha256", "exportName", "props", "dependencies", "assets",
    "props.attentionPhases", "props.attentionGlobalFromSeconds", "props.captionManifest", "props.captionStyle",
    "props.captionStyle.fontFamily", "props.captionStyle.fontWeight", "props.captionStyle.sizePx", "props.captionStyle.color",
    "props.captionStyle.lineHeight", "props.captionStyle.letterSpacing", "props.captionStyle.fontFile"];
  plan.implementationPlan[0].consumerFields = routeFields;
  plan.shots[0].screenText = [];
  plan.shots[0].phases = {};
  plan.shots[0].visualIntent = "Technical fixture: bind one canonical subtitle and one phase target to the real registered renderer props.";
  plan.shots[0].audioIntent = {choice: "voice", reason: "The temporary signal satisfies the declared voice-bus structural path only.", eventIds: []};
  plan.shots[0].sourceMappings[0].consumerFields = [...routeFields];

  const design = plan.directorDesign;
  design.format = "laohu.motion.director-design/3";
  design.narration = {mode: "timeline", reason: "Use the exact retained ASRcut segment and compiled caption manifest; no word precision is claimed.", scriptSelections: []};
  design.globalSettings.colorRoles = [{id: "caption-white", value: "#ffffff", meaning: "Exact subtitle text color for the renderer binding."}];
  const textStyle = {
    id: "caption-style", fontFamily: "Noto Sans SC", fontWeight: "500", sizePx: 34,
    colorRoleId: "caption-white", lineHeight: 1.2, letterSpacing: 0,
    role: "Synthetic technical fixture style; local font load is checked through the real renderer receipt.",
    fontMaterialId: "local-caption-cjk",
    consumerMappings: [{implementationPlanId: "font-shot", mappingId: "font-shot-map",
      fontFamilyField: "props.captionStyle.fontFamily", fontWeightField: "props.captionStyle.fontWeight",
      sizePxField: "props.captionStyle.sizePx", colorField: "props.captionStyle.color",
      lineHeightField: "props.captionStyle.lineHeight", letterSpacingField: "props.captionStyle.letterSpacing",
      fontFileField: "props.captionStyle.fontFile"}],
  };
  design.globalSettings.textStyles = [textStyle];
  design.globalSettings.captionStyle = {
    textStyleId: "caption-style", function: "subtitle", spatialRelation: "screen-overlay",
    temporalBehavior: "caption-manifest-display-window", coordinateSpace: "output-pixels",
    x: 520, y: 880, width: 880, height: 120, zIndex: 100, alignment: "center",
    background: "rgba(0,0,0,0.72)", paddingPx: 14, maxLines: 2, fontFile: captionFontPath,
    consumerMappings: [{implementationPlanId: "font-shot", mappingId: "font-shot-map"}],
  };
  const designUnit = design.units[0];
  designUnit.designNarrative = "Technical render fixture: one declared actor is positioned by an explicit attention phase, while the compiled caption manifest is drawn by the registered Captions component. The test measures the resulting actor pixels; it makes no creative or readability acceptance claim.";
  designUnit.purpose = "Exercise canonical caption and attention bindings through a real Film /2 project-shot consumer.";
  designUnit.visualGain = "The test verifies that phase-owned geometry and the compiled cue reach the rendered frame.";
  designUnit.representation = "One bounded test rectangle and one manifest-backed caption layer.";
  designUnit.composition = "The test rectangle is centered at output x=640,y=400 with a 180×80 pixel box; caption box uses the exact global output-pixel layout.";
  designUnit.focalOrder = "The single actor is the only attention target; subtitle renders in its declared lower screen region.";
  designUnit.objects = [{id: "relation-map", role: "technical actor fixture", meaning: "Test rectangle used to verify actual rendered geometry.",
    appearance: "Solid magenta rectangle with fixed intrinsic content.", movableParts: [],
    initialState: "Not yet mounted.", processState: "Wrapped by the actual attention bridge with fixed dimensions.", resultState: "Visible 180×80 output-pixel rectangle under a phase-bound target role.",
    consumerRefs: [{implementationPlanId: "font-shot", responsibility: "Render the declared actor through AttentionBridge."}]}];
  designUnit.sound = {intent: {voice: "locked", sfx: "none", music: "none"},
    reason: "The temporary signal satisfies the timeline voice-bus structural path only.",
    voiceTrackIds: ["locked-narration"], eventIds: [], trackIds: []};
  const cue = designUnit.scriptCues[0];
  cue.source = {kind: "segment-range", occurrenceId: occurrence, startSegmentId: segment.segmentId, endSegmentId: segment.segmentId, exactText: segment.text};
  cue.continuityIn = "The technical frame enters at the exact retained segment start.";
  cue.continuityOut = "The actor and caption remain available through the canonical timeline end.";
  cue.visualNarration = "The fixed actor rectangle and the compiled subtitle render in separate declared screen regions.";
  cue.screenText = {mode: "none", reason: "Caption text is owned by the independent compiled manifest, not duplicated as planned screenText."};
  cue.actionIds = ["reveal-links"];
  const action = designUnit.actions[0];
  action.triggerCueIds = [cue.id];
  action.targetObjectIds = ["relation-map"];
  action.timing = {basis: "canonical-target-samples", startCueId: cue.id, endCueId: cue.id,
    startOffsetSamples: 0, endOffsetSamples: 0, relationship: "Technical property binding begins at the exact segment anchor and holds through its display span."};
  action.keyStates = [{objectId: "relation-map", from: "not mounted", through: "phase-bound", to: "visible at the declared geometry"}];
  action.pathOrMorph = "No creative motion is asserted; this fixture checks concrete size and placement at a rendered frame.";
  action.motionPurpose = "Prove that the real attention consumer applies phase-owned geometry.";
  action.handoff = "Retain this single actor through the canonical timeline end.";
  designUnit.attentionPhaseIds = ["phase-greeting"];
  design.attentionPhases = [{
    id: "phase-greeting", viewingUnitId: designUnit.viewingUnitId,
    anchors: {basis: "canonical-units", rows: [{kind: "caption", captionCueId: "caption-greeting", segmentId: segment.segmentId}]},
    mainTask: {id: "read-greeting", kind: "object", description: "Inspect the one technical actor while the exact compiled caption is available.", actorIds: ["relation-map"]},
    actorBindings: [{actorId: "relation-map", role: "target", owner: "phase-greeting", consumer: "laohu-motion.attention-actor-style/1",
      props: {x: 640, y: 400, width: 180, height: 80, scale: 1, rotation: 0, opacity: 1, visible: true, coordinateSpace: "world", zIndex: 4, depth: 2, focusDepth: 2},
      consumerRefs: [{implementationPlanId: "font-shot", mappingId: "font-shot-map", fieldPath: "props.attentionPhases"}]}],
    camera: {owner: "phase-greeting", consumer: "laohu.motion.camera-rig/1", consumerRefs: [{implementationPlanId: "font-shot", mappingId: "font-shot-map", fieldPath: "props.attentionPhases"}],
      keyframes: [{anchor: {captionCueId: "caption-greeting", segmentId: segment.segmentId, edge: "start", offsetSamples: 0}, center: [960, 540], zoom: 1, rotation: 0, stop: true}]},
    readingZones: [],
    readWindows: [{id: "read-greeting", taskId: "read-greeting", groupId: "greeting-caption", captionCueIds: ["caption-greeting"],
      captionRange: {startCueId: "caption-greeting", endCueId: "caption-greeting"}, screenTextIds: [], reason: "The exact manifest cue is the one reading item for this phase."}],
    actionIds: ["reveal-links"],
    sound: {eventIds: [], actionIds: [], reason: "No separate effect is required by this structural geometry test."},
    completion: {condition: "The selected frame resolves the actual actor bounds and exact subtitle cue.", exitState: "Actor retains its explicit phase geometry."},
    handoff: {targetPhaseId: null, condition: "No later phase exists in the one-second fixture.", entryState: "Final actor and subtitle are retained.", visualHold: "retain-to-canonical-end"},
  }];

  const modulePath = path.join(root, segmentBlueprint.modulePath);
  const moduleSource = `import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Core} from '@laohu/motion';
export const FontCard: React.FC<any> = (props) => {
  const ready=Core.useFonts([{family:props.captionStyle.fontFamily,file:props.captionStyle.fontFile,weight:'500',weightProbes:[props.captionStyle.fontWeight]}]);
  if(!ready)return null;
  return <AbsoluteFill style={{background:'#ffffff'}}>
  <Core.AttentionBridge phases={props.attentionPhases} globalFromSeconds={props.attentionGlobalFromSeconds} width={1920} height={1080}
    actors={[{id:'relation-map',node:<div data-test-attention-actor='relation-map' style={{width:'100%',height:'100%',background:'#e600ff'}}/>}]}
    screen={<Core.Captions manifest={props.captionManifest} style={props.captionStyle} globalFromSeconds={props.attentionGlobalFromSeconds}/>}/>
</AbsoluteFill>;
};
`;
  await fs.writeFile(modulePath, moduleSource);
  segmentBlueprint.moduleSha256 = sha256(await fs.readFile(modulePath));
  segmentBlueprint.props.captionManifest = captionManifest;
  segmentBlueprint.props.captionStyle = {...design.globalSettings.captionStyle, fontFamily: textStyle.fontFamily,
    fontWeight: textStyle.fontWeight, sizePx: textStyle.sizePx, color: "#ffffff", lineHeight: textStyle.lineHeight,
    letterSpacing: textStyle.letterSpacing, fontFile: captionFontPath, fontFileMaterialId: "local-caption-cjk"};
  const phaseStart = segment.targetRange.startSample / timeline.clock.sampleRateHz;
  const phaseEnd = timeline.durationSamples / timeline.clock.sampleRateHz;
  segmentBlueprint.props.attentionPhases = [{
    id: "phase-greeting", viewingUnitId: designUnit.viewingUnitId, start: phaseStart, end: phaseEnd,
    mainTask: structuredClone(design.attentionPhases[0].mainTask),
    cameraKeys: [{at: phaseStart, center: [960, 540], zoom: 1, rotation: 0, stop: true}],
    readingZones: [],
    readWindows: [{id: "read-greeting", taskId: "read-greeting", groupId: "greeting-caption", basis: "canonical-display-window",
      captionCueIds: ["caption-greeting"],
      screenTextIds: [], reason: "The exact manifest cue is the one reading item for this phase.",
      captionRange: {startCueId: "caption-greeting", endCueId: "caption-greeting"}, start: phaseStart, end: phaseEnd}],
    actorBindings: [{actorId: "relation-map", role: "target", owner: "phase-greeting", consumer: "laohu-motion.attention-actor-style/1",
      props: {x: 640, y: 400, width: 180, height: 80, scale: 1, rotation: 0, opacity: 1, visible: true,
        coordinateSpace: "world", zIndex: 4, depth: 2, focusDepth: 2}}],
  }];
  await writeJson(blueprintPath, blueprint);
  plan.inputs.filmBlueprint.sha256 = sha256(await fs.readFile(blueprintPath));
  await writeJson(planPath, plan);
  return {root, planPath, plan, captionManifest, captionDesign, captionsSrtPath, modulePath, occurrenceId: occurrence};
}

function creativeCaptionFixture(viewingUnitId = "font-card-unit") {
  return {
    format: "laohu.motion.creative-design/1",
    id: "creative-caption-fixture",
    narrationMode: "timeline",
    globalDirection: {
      audience: "A viewer encountering the idea for the first time.",
      centralIdea: "A point becomes understandable when its relation is shown.",
      experience: "Start with one clear object, then let the relation feel newly visible.",
      emotionalArc: "Recognition grows into a small moment of discovery.",
      visualLanguage: "A tactile, luminous diagram with a bold focal shape, restrained supporting labels, and purposeful spatial depth.",
      soundLanguage: "Keep the narration clear; any musical or effect accent follows a visible change and stays naturally integrated.",
      continuity: "Hold one visual world while changing the relationship inside it.",
      avoid: ["Competing simultaneous focal points", "Decorative motion without a visible cause"],
    },
    cueDesigns: [{
      id: "creative-caption-cue",
      viewingUnitId,
      captionCueId: "caption-greeting",
      picturePrompt: "On a warm, softly illuminated paper-like field, bring a single dimensional relationship point into view. Give it a confident, clean silhouette with a softly shaded rim and a small grounded shadow. Hold open space around it. The existing caption remains a separate, readable lower-screen element; do not add a second competing title. Let the point settle with a subtle physical ease, then leave the right side visually open for the next relation.",
      actors: [{
        id: "main-point",
        role: "relationship point",
        meaning: "The first entity from which the later relation will grow.",
        appearance: "A rounded, solid teal form with a bright edge light, gentle inner gradient, visible thickness, and a soft contact shadow; its contour is distinct from the caption lettering.",
        placement: "Medium-large, slightly left of screen center, facing the viewer; isolated with clear negative space on the right, in front of the background but behind any later foreground annotation.",
      }],
      foregroundText: [{
        id: "point-label",
        text: "起点",
        role: "object label",
        relationship: "Names the point without competing with the spoken caption.",
        appearance: "A compact Chinese sans-serif label in a semibold weight, roughly one third the height of the point; warm white lettering with a subtle dark edge or local backing for contrast, not a headline treatment.",
        placement: "Set just below and to the left of the point, aligned to its contour; visually separate from the persistent spoken caption and never cover the point's lit rim.",
      }],
      before: "The background is already established. No relationship point or object label is visible.",
      process: "The point rises from a slightly smaller, lower position and gains its rim light as it settles; its label follows a fraction later and stops close to the point. The camera remains steady so the viewer tracks one arrival.",
      after: "The point and its short label hold in the left-center region, clearly separated from the caption, with the right half still open for the next relation.",
      focus: {primaryActorId: "main-point", supportingActorIds: [], handoff: "The point stays anchored; the open right side becomes the next cue's arrival space."},
      emotion: {from: "curiosity", to: "orientation", mechanism: "Reveal one legible point from an otherwise quiet field, then hold long enough for it to become a stable reference."},
      sound: {
        voice: "Keep the exact locked narration clear and forward; this cue must not change its timing.",
        music: "A very restrained bed may continue beneath narration; keep the pause after the arrival calm.",
        sfx: "A short, soft rounded arrival accent may align with the point settling; no long high tail or unrelated impact.",
        fallback: "If no inspected asset fits this visual weight, keep the designed cue pending and acquire or select a better contextual sound; do not substitute a harsh synthetic tone or report suitability without a context listen.",
      },
    }],
    resourceFit: [],
  };
}

async function buildV5CaptionPlan(runId, {withRealization = false} = {}) {
  const built = await buildV4CaptionAttentionPlan("v5-" + runId);
  built.plan.format = "laohu.motion.production-plan/5";
  built.plan.creativeDesign = creativeCaptionFixture(built.plan.viewingUnits[0].id);
  const technicalDesign = built.plan.directorDesign;
  delete built.plan.directorDesign;
  const direction = await validatePlanFile(built.planPath, {stage: "direction", planOverride: built.plan});
  if (withRealization) {
    built.plan.directorDesign = technicalDesign;
    const selectedCandidate = built.plan.directionDecisions[0].candidates.find((row) => row.id === built.plan.directionDecisions[0].selectedCandidateId);
    const syntheticKeyStatePath = path.join(built.root, "synthetic-key-state.png");
    const syntheticKeyStateBytes = fixturePng();
    await fs.writeFile(syntheticKeyStatePath, syntheticKeyStateBytes);
    selectedCandidate.keyStateEvidence = [{phase: "caption-and-actor-result", path: "synthetic-key-state.png",
      sha256: sha256(syntheticKeyStateBytes), observation: "Synthetic structural fixture only; no aesthetic claim.",
      filmSegmentId: "font-card", mappingId: "font-shot-map", frameIndex: 15}];
    built.plan.directorDesign.creativeDesignRef = {
      id: direction.creativeDesignId,
      sha256: direction.creativeDesignIdentitySha256,
    };
  }
  await writeJson(built.planPath, built.plan);
  return {...built, creativeIdentity: direction.creativeDesignIdentitySha256};
}

test("production-plan/5 keeps Analysis creative design author-facing, binds Motion realization, and preserves formal receipts", async () => {
  const runId = "v5-creative-production-" + Date.now() + "-" + process.pid;
  const directionPlan = await buildV5CaptionPlan(runId + "-direction");
  const directionCheck = invoke(productionPlanCli, ["validate", "--plan", directionPlan.planPath, "--stage", "direction"]);
  assertCliOk(directionCheck, "V5 creative-only direction validation without a Motion realization");
  const directionResult = JSON.parse(directionCheck.stdout);
  assert.equal(directionResult.planFormat, "laohu.motion.production-plan/5");
  assert.equal(directionResult.creativeDesignId, "creative-caption-fixture");
  assert.match(directionResult.creativeDesignIdentitySha256, /^[a-f0-9]{64}$/);
  assert.equal(directionResult.directorDesignIdentitySha256, null, "Analysis direction is complete before a technical realization exists");

  const creativeMarkdownPath = path.join(path.dirname(directionPlan.planPath), "production", "design", "creative-design.md");
  const creativeExport = invoke(productionPlanCli, ["export-design", "--plan", directionPlan.planPath, "--output", creativeMarkdownPath]);
  assertCliOk(creativeExport, "V5 default export is the Analysis-authored human creative design");
  const creativeReceipt = JSON.parse(creativeExport.stdout);
  assert.equal(creativeReceipt.view, "creative");
  assert.equal(creativeReceipt.creativeDesignId, "creative-caption-fixture");
  const creativeMarkdown = await fs.readFile(creativeMarkdownPath, "utf8");
  for (const expected of [
    "0:00.000–0:01.000",
    "你好",
    "画面生成提示词",
    "rounded, solid teal form",
    "slightly left of screen center",
    "compact Chinese sans-serif label",
    "Set just below and to the left of the point",
    "前态：",
    "过程：",
    "后态：",
    "curiosity → orientation",
    "A short, soft rounded arrival accent",
    "If no inspected asset fits this visual weight",
  ]) assert.ok(creativeMarkdown.includes(expected), "human creative export includes " + expected);
  assert.doesNotMatch(creativeMarkdown.replace(/<!--[^>]*-->/g, ""), /main-point|point-label|consumerMappings|props\.|[a-f0-9]{64}/,
    "human creative design presents visible instructions, not internal IDs, renderer mappings or hashes");

  const noRealizationTechnical = invoke(productionPlanCli, ["export-design", "--plan", directionPlan.planPath,
    "--output", path.join(path.dirname(directionPlan.planPath), "technical-without-d3.md"), "--view", "technical"]);
  assert.notEqual(noRealizationTechnical.status, 0, "technical export cannot pretend Analysis prose is Motion realization");
  assert.match(noRealizationTechnical.stderr, /requires a validated directorDesign\/3 Motion realization/);
  const missingD3Production = invoke(productionPlanCli, ["verify-delivery", "--plan", directionPlan.planPath]);
  assert.notEqual(missingD3Production.status, 0, "formal delivery cannot pass with only Analysis direction");
  assert.match(missingD3Production.stderr, /verify-delivery accepts production-plan\/3.*production-plan\/4 or \/5 \+ directorDesign\/3/);

  const missingAppearance = structuredClone(directionPlan.plan);
  delete missingAppearance.creativeDesign.cueDesigns[0].actors[0].appearance;
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: missingAppearance}), /creative actor\.appearance/,
    "a semantic actor role cannot substitute for its visible appearance");
  const missingTextPlacement = structuredClone(directionPlan.plan);
  delete missingTextPlacement.creativeDesign.cueDesigns[0].foregroundText[0].placement;
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: missingTextPlacement}), /creative foreground text\.placement/,
    "screen text cannot be planned without its concrete relationship to the picture");
  const missingCue = structuredClone(directionPlan.plan);
  missingCue.creativeDesign.cueDesigns = [];
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: missingCue}), /creativeDesign\.cueDesigns must be a non-empty array/,
    "the schema cannot accept a global mood paragraph instead of a cue-by-cue design");

  const unreviewedDirection = structuredClone(directionPlan.plan);
  unreviewedDirection.work.directionMode = "new-direction";
  unreviewedDirection.directionDecisions[0].mode = "new-direction";
  delete unreviewedDirection.directionDecisions[0].userLockRef;
  unreviewedDirection.directionDecisions[0].decisionInputs = [];
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: unreviewedDirection}), /complete styles fulltext.*review receipt/,
    "separating creative from technical detail must not skip full style-library review");

  const fakeResourceFit = structuredClone(directionPlan.plan);
  fakeResourceFit.creativeDesign.resourceFit = [{
    resourceTaskId: "not-acquired-yet",
    context: "The exact transition beneath the spoken phrase.",
    requirements: ["A rounded arrival that supports the visible point"],
    outcome: "fit",
    evidence: {
      kind: "audio", assetId: "candidate-audio", sha256: "a".repeat(64), method: "technical-preview", observer: "automated waveform scan",
      recordMaterialId: "direction-lock", recordLocator: "line 3", contextStartSec: 0, contextEndSec: 1,
      observation: "A source waveform exists.",
    },
  }];
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: fakeResourceFit}), /source-screening and technical-preview are not suitability proof/,
    "a file/waveform preview cannot be used as context suitability proof");

  const resourceContext = "A short wooden arrival accent beneath the spoken reveal; use only a candidate that can be heard naturally in this exact cue.";
  const resourceRequirements = ["Brief rounded onset", "No piercing sustained tail", "Does not mask narration"];
  const unstartedPending = structuredClone(directionPlan.plan);
  unstartedPending.creativeDesign.resourceFit = [{resourceTaskId: "arrival-sfx", context: resourceContext,
    requirements: resourceRequirements, outcome: "pending"}];
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: unstartedPending}),
    /pending creative resource fit requires a hash-linked acquisition attempt/,
    "the old shortcut—declaring pending while doing no local inspection or search/get—cannot pass the direction handoff");

  const resourceReceiptPath = path.join(path.dirname(directionPlan.planPath), "synthetic-resource-acquisition-record.md");
  const resourceReceiptText = [
    "Synthetic structural fixture only; no real source search, download, license review, audition, or aesthetic judgment is claimed.",
    "This file exists to test that the handoff links an immutable acquisition record and distinguishes it from candidate bytes.",
  ].join("\n") + "\n";
  await fs.writeFile(resourceReceiptPath, resourceReceiptText);
  const resourceReceiptMaterial = {id: "synthetic-resource-acquisition-record", kind: "acquisition-record",
    role: "synthetic resource acquisition receipt for schema testing", path: path.relative(path.dirname(directionPlan.planPath), resourceReceiptPath),
    sha256: sha256(Buffer.from(resourceReceiptText))};
  const noAcquisitionAuthorizationPath = path.join(path.dirname(directionPlan.planPath), "synthetic-no-acquire-authorization.md");
  const explicitNoAcquireInstruction = "本轮明确只做方案设计，不搜索、获取或下载任何音效候选；后续须经用户明确授权后再准备素材。";
  const noAcquisitionAuthorizationText = "# Synthetic authorization-boundary fixture\n\n" + explicitNoAcquireInstruction + "\n";
  await fs.writeFile(noAcquisitionAuthorizationPath, noAcquisitionAuthorizationText);
  const noAcquisitionAuthorizationMaterial = {id: "synthetic-no-acquire-authorization", kind: "user-boundary-fixture",
    role: "synthetic source-located no-acquire instruction for structural testing only",
    path: path.relative(path.dirname(directionPlan.planPath), noAcquisitionAuthorizationPath),
    sha256: sha256(Buffer.from(noAcquisitionAuthorizationText))};
  const candidatePath = path.join(path.dirname(directionPlan.planPath), "synthetic-unreviewed-candidate.bin");
  const candidateBytes = Buffer.from("synthetic candidate bytes; not a playable sound asset", "utf8");
  await fs.writeFile(candidatePath, candidateBytes);
  const candidateMaterial = {id: "synthetic-unreviewed-candidate", kind: "audio-candidate-fixture",
    role: "synthetic unreviewed candidate bytes for structural testing only", path: path.relative(path.dirname(directionPlan.planPath), candidatePath),
    sha256: sha256(candidateBytes)};
  const generationAuthorizationPath = path.join(path.dirname(directionPlan.planPath), "synthetic-generation-authorization.md");
  const userGenerationInstruction = "若检索和获取的现成音效都不适配，只允许为 arrival-sfx 任务生成一个音效候选；不得生成音乐或口播。";
  const generationAuthorizationText = "# Synthetic user authorization fixture\n\n" + userGenerationInstruction + "\n";
  await fs.writeFile(generationAuthorizationPath, generationAuthorizationText);
  const generationAuthorizationMaterial = {id: "synthetic-generation-authorization", kind: "user-authorization-fixture",
    role: "synthetic source-located generation authorization for structural testing only",
    path: path.relative(path.dirname(directionPlan.planPath), generationAuthorizationPath), sha256: sha256(Buffer.from(generationAuthorizationText))};
  const generationAuthorization = {
    resourceTaskId: "arrival-sfx", soundRole: "sfx", sourceMaterialId: generationAuthorizationMaterial.id,
    locator: {lineStart: 3, lineEnd: 3}, userDecision: userGenerationInstruction,
    scope: "Only if source search/get finds no fitting candidate, generate one sfx candidate for arrival-sfx; no music or voice generation.",
  };
  const withAcquisitionMaterials = (sourcePlan) => {
    sourcePlan.inputs.sourceMaterials.push(structuredClone(resourceReceiptMaterial));
    return sourcePlan;
  };
  const acquiredButUnheard = withAcquisitionMaterials(structuredClone(directionPlan.plan));
  acquiredButUnheard.inputs.sourceMaterials.push(structuredClone(candidateMaterial));
  acquiredButUnheard.creativeDesign.resourceFit = [{resourceTaskId: "arrival-sfx", context: resourceContext,
    requirements: resourceRequirements, outcome: "pending", acquisition: {
      status: "acquired", method: "source-get", recordMaterialId: resourceReceiptMaterial.id, recordLocator: "line 2",
      summary: "Synthetic fixture represents a received candidate; no playable-audio or listening claim is made.",
      nextAction: "试听实际候选与当前口播和音乐的完整叠放；在听审完成前保持 pending。",
      candidate: {materialId: candidateMaterial.id, sha256: candidateMaterial.sha256},
    }}];
  const acquiredPendingValidation = await validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: acquiredButUnheard});
  assert.equal(acquiredPendingValidation.plan.creativeDesign.resourceFit[0].outcome, "pending",
    "a real hash-linked candidate can exist before context audition, without being marked suitable");
  const acquiredPendingPath = path.join(path.dirname(directionPlan.planPath), "synthetic-acquired-pending-plan.json");
  await writeJson(acquiredPendingPath, acquiredButUnheard);
  const acquiredPendingExportPath = path.join(path.dirname(directionPlan.planPath), "synthetic-acquired-pending-design.md");
  const acquiredPendingExport = invoke(productionPlanCli, ["export-design", "--plan", acquiredPendingPath, "--output", acquiredPendingExportPath]);
  assertCliOk(acquiredPendingExport, "human design export includes the concrete resource acquisition state and next action");
  const acquiredPendingMarkdown = await fs.readFile(acquiredPendingExportPath, "utf8");
  assert.match(acquiredPendingMarkdown, /获取进度：候选素材已获取并校验/);
  assert.match(acquiredPendingMarkdown, /下一步：试听实际候选与当前口播和音乐的完整叠放/);
  assert.match(acquiredPendingMarkdown, /情境试听／观看仍未完成，不能宣称适配/);

  const attemptedButUnresolved = withAcquisitionMaterials(structuredClone(directionPlan.plan));
  attemptedButUnresolved.creativeDesign.resourceFit = [{resourceTaskId: "arrival-sfx", context: resourceContext,
    requirements: resourceRequirements, outcome: "pending", acquisition: {
      status: "attempted-unresolved", method: "source-search", recordMaterialId: resourceReceiptMaterial.id, recordLocator: "line 2",
      summary: "Synthetic fixture receipt shape for a completed search with no candidate; no actual search is asserted.",
      nextAction: "扩大检索来源后再获取具体候选；若找到候选，再做口播与配乐情境听审。",
    }}];
  await assert.doesNotReject(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: attemptedButUnresolved}),
    "a source-located attempt receipt may keep suitability pending; it does not certify that a real attempt occurred");

  const blockedRetrieval = withAcquisitionMaterials(structuredClone(directionPlan.plan));
  blockedRetrieval.creativeDesign.resourceFit = [{resourceTaskId: "arrival-sfx", context: resourceContext,
    requirements: resourceRequirements, outcome: "pending", acquisition: {
      status: "blocked", method: "tool-boundary", recordMaterialId: resourceReceiptMaterial.id, recordLocator: "line 2",
      summary: "Synthetic fixture describes a retrieval-tool boundary, not an inability to listen.",
      nextAction: "恢复来源搜索／获取工具后重新检索和下载候选，再进行情境听审。",
    }}];
  await assert.doesNotReject(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: blockedRetrieval}),
    "a recorded retrieval boundary may remain pending and must explicitly identify retrieval to resume");
  const listeningOnlyBlocked = structuredClone(blockedRetrieval);
  listeningOnlyBlocked.creativeDesign.resourceFit[0].acquisition.nextAction = "等到试听能力可用后再决定。";
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: listeningOnlyBlocked}),
    /must name the source search\/get action to resume/,
    "lack of audition capability alone cannot block or skip source search/get");

  const planOnlyIsNotNoAcquire = withAcquisitionMaterials(structuredClone(directionPlan.plan));
  const planOnlyPath = path.join(path.dirname(directionPlan.planPath), "synthetic-plan-only-boundary.md");
  const planOnlyInstruction = "本轮先完成方案规划。";
  const planOnlyText = "# Synthetic plan-only fixture\n\n" + planOnlyInstruction + "\n";
  await fs.writeFile(planOnlyPath, planOnlyText);
  const planOnlyMaterial = {id: "synthetic-plan-only-boundary", kind: "user-direction-fixture",
    role: "synthetic plan-only direction, not an acquisition prohibition", path: path.relative(path.dirname(directionPlan.planPath), planOnlyPath),
    sha256: sha256(Buffer.from(planOnlyText))};
  planOnlyIsNotNoAcquire.inputs.sourceMaterials.push(planOnlyMaterial);
  planOnlyIsNotNoAcquire.creativeDesign.resourceFit = [{resourceTaskId: "arrival-sfx", context: resourceContext,
    requirements: resourceRequirements, outcome: "pending", acquisition: {
      status: "blocked", method: "authorization-boundary", recordMaterialId: planOnlyMaterial.id, recordLocator: "line 3",
      summary: "本轮先完成方案规划。", nextAction: "获得授权后再进行候选搜索与下载。",
    }}];
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: planOnlyIsNotNoAcquire}),
    /explicit no-acquire\/no-download instruction or a genuine permission\/credential boundary/,
    "plan-only wording cannot silently disable authorized resource preparation");

  const explicitNoAcquireBlocked = withAcquisitionMaterials(structuredClone(directionPlan.plan));
  explicitNoAcquireBlocked.inputs.sourceMaterials.push(noAcquisitionAuthorizationMaterial);
  explicitNoAcquireBlocked.creativeDesign.resourceFit = [{resourceTaskId: "arrival-sfx", context: resourceContext,
    requirements: resourceRequirements, outcome: "pending", acquisition: {
      status: "blocked", method: "authorization-boundary", recordMaterialId: noAcquisitionAuthorizationMaterial.id, recordLocator: "line 3",
      summary: "用户明确要求：" + explicitNoAcquireInstruction, nextAction: "用户明确授权后，再搜索和下载音效候选并进行情境听审。",
    }}];
  await assert.doesNotReject(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: explicitNoAcquireBlocked}),
    "a genuine source-located explicit no-acquire instruction may keep resource preparation blocked until its stated condition changes");

  const unquotedNoAcquireBoundary = structuredClone(explicitNoAcquireBlocked);
  unquotedNoAcquireBoundary.creativeDesign.resourceFit[0].acquisition.summary = "本轮资源获取被阻止。";
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: unquotedNoAcquireBoundary}),
    /summary must quote the exact bounded instruction/,
    "an authorization-boundary label cannot replace the exact source-located user instruction");

  const missingAcquisitionRecord = structuredClone(attemptedButUnresolved);
  missingAcquisitionRecord.creativeDesign.resourceFit[0].acquisition.recordMaterialId = "missing-record";
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: missingAcquisitionRecord}),
    /must link a hash-verified source record/,
    "a nonempty narrative cannot replace a source-material identity and hash");
  const missingCandidateFile = structuredClone(acquiredButUnheard);
  missingCandidateFile.creativeDesign.resourceFit[0].acquisition.candidate.materialId = "missing-candidate";
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: missingCandidateFile}),
    /must resolve to a hash-verified source material file/,
    "an acquisition record cannot claim an absent candidate file");
  const wrongCandidateHash = structuredClone(acquiredButUnheard);
  wrongCandidateHash.creativeDesign.resourceFit[0].acquisition.candidate.sha256 = "0".repeat(64);
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: wrongCandidateHash}),
    /candidate SHA-256 must match its exact hash-verified source material bytes/,
    "candidate identity must bind actual file bytes, not only an asset name");
  const generationLabelOnly = structuredClone(acquiredButUnheard);
  generationLabelOnly.creativeDesign.resourceFit[0].acquisition.method = "authorized-generation";
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: generationLabelOnly}),
    /requires a source-located, task- and role-specific generationAuthorization/,
    "method labels do not grant permission to generate replacement audio");

  const authorizedGenerationCandidate = withAcquisitionMaterials(structuredClone(directionPlan.plan));
  authorizedGenerationCandidate.inputs.sourceMaterials.push(structuredClone(generationAuthorizationMaterial), structuredClone(candidateMaterial));
  authorizedGenerationCandidate.creativeDesign.resourceFit = [{resourceTaskId: "arrival-sfx", soundRole: "sfx", context: resourceContext,
    requirements: resourceRequirements, outcome: "pending", acquisition: {
      status: "acquired", method: "authorized-generation", recordMaterialId: resourceReceiptMaterial.id, recordLocator: "line 2",
      summary: "Synthetic fixture records that a separately authorized generation path produced candidate bytes; no playable sound or fit claim is made.",
      nextAction: "先听实际生成文件与口播和音乐的情境混合，再决定是否适配。",
      candidate: {materialId: candidateMaterial.id, sha256: candidateMaterial.sha256},
      generationAuthorization: structuredClone(generationAuthorization),
    }}];
  await assert.doesNotReject(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: authorizedGenerationCandidate}),
    "an explicitly source-located task/role authorization permits a recorded generation method, without claiming suitability");

  const wrongGenerationTask = structuredClone(authorizedGenerationCandidate);
  wrongGenerationTask.creativeDesign.resourceFit[0].acquisition.generationAuthorization.resourceTaskId = "different-sfx-task";
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: wrongGenerationTask}),
    /resourceTaskId must match the exact current resourceFit resourceTaskId/,
    "generation authorization for another resource task cannot be reused");
  const wrongGenerationSource = structuredClone(authorizedGenerationCandidate);
  wrongGenerationSource.creativeDesign.resourceFit[0].acquisition.generationAuthorization.sourceMaterialId = "direction-lock";
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: wrongGenerationSource}),
    /userDecision must quote an exact instruction present inside its source-line locator/,
    "a source with a valid hash still cannot substitute for the exact user authorization text");
  const wrongGenerationRole = structuredClone(authorizedGenerationCandidate);
  wrongGenerationRole.creativeDesign.resourceFit[0].acquisition.generationAuthorization.soundRole = "music";
  await assert.rejects(() => validatePlanFile(directionPlan.planPath, {stage: "direction", planOverride: wrongGenerationRole}),
    /soundRole must match the exact current resourceFit soundRole/,
    "permission for music cannot be reused for a sound effect or vice versa");

  const linkedPlan = await buildV5CaptionPlan(runId + "-production", {withRealization: true});
  const wrongCaptionFontPath = structuredClone(linkedPlan.plan);
  wrongCaptionFontPath.directorDesign.globalSettings.captionStyle.fontFile = "assets/not-the-caption-font.woff2";
  await assert.rejects(() => validatePlanFile(linkedPlan.planPath, {stage: "direction", planOverride: wrongCaptionFontPath}),
    /captionStyle\.fontFile must identify the exact hash-verified textStyle fontMaterialId/,
    "the declared renderer caption font path must identify the selected, hash-verified font material");
  const wrongCaptionFontHash = structuredClone(linkedPlan.plan);
  wrongCaptionFontHash.inputs.sourceMaterials.find((row) => row.id === "local-caption-cjk").sha256 = "0".repeat(64);
  await assert.rejects(() => validatePlanFile(linkedPlan.planPath, {stage: "direction", planOverride: wrongCaptionFontHash}),
    /source material local-caption-cjk SHA-256 changed/,
    "a caption font byte change cannot pass by preserving only the font path or family name");
  const linkedValidation = invoke(productionPlanCli, ["validate", "--plan", linkedPlan.planPath, "--stage", "direction"]);
  assertCliOk(linkedValidation, "V5 D3 realization binds the exact creative design identity");
  const linkedResult = JSON.parse(linkedValidation.stdout);
  assert.equal(linkedResult.creativeDesignIdentitySha256, linkedPlan.creativeIdentity);
  assert.match(linkedResult.directorDesignIdentitySha256, /^[a-f0-9]{64}$/, "when Motion D3 exists, direction validation checks its schema and creative binding without claiming production receipts");
  const technicalDesignExport = invoke(productionPlanCli, ["export-design", "--plan", linkedPlan.planPath,
    "--output", path.join(path.dirname(linkedPlan.planPath), "linked-technical-design.md"), "--view", "technical"]);
  assertCliOk(technicalDesignExport, "V5 technical export validates Motion's exact creative-design link");
  const technicalDesignBinding = JSON.parse(technicalDesignExport.stdout);
  assert.equal(technicalDesignBinding.directorDesignIdentitySha256, linkedResult.directorDesignIdentitySha256);

  const staleRealization = structuredClone(linkedPlan.plan);
  staleRealization.directorDesign.creativeDesignRef.sha256 = "0".repeat(64);
  const stalePath = path.join(path.dirname(linkedPlan.planPath), "stale-creative-design-ref.json");
  await writeJson(stalePath, staleRealization);
  const staleExport = invoke(productionPlanCli, ["export-design", "--plan", stalePath,
    "--output", path.join(path.dirname(linkedPlan.planPath), "stale-technical.md"), "--view", "technical"]);
  assert.notEqual(staleExport.status, 0, "a D3 created for an older creative identity must not export as current");
  assert.match(staleExport.stderr, /directorDesign\/3 creativeDesignRef must bind the exact current creativeDesign\/1 identity and SHA-256/);

  const ffmpeg = await bundledFfmpegPair(runId);
  const render = invoke(productionPlanCli, ["run", "--plan", linkedPlan.planPath, "--work-root", repoRoot, "--ffmpeg", ffmpeg], {
    timeout: 1_200_000,
    tmpdir: path.join(evalTmpRoot, "v5-production", runId),
  });
  assertCliOk(render, "V5 real Film/audio production run with D3/creative bindings");
  const marker = render.stdout.match(/^PRODUCTION_PLAN_RECEIPT (.+)$/m);
  assert.ok(marker, "V5 render emits its durable production receipt");
  const receipt = JSON.parse(await fs.readFile(marker[1], "utf8"));
  assert.equal(receipt.planFormat, "laohu.motion.production-plan/5", "the outer run receipt preserves the original submitted plan format");
  assert.equal(receipt.designBinding.creativeDesignId, linkedResult.creativeDesignId);
  assert.equal(receipt.designBinding.creativeDesignIdentitySha256, linkedResult.creativeDesignIdentitySha256);
  assert.equal(receipt.inputHashes.creativeDesignIdentity, linkedResult.creativeDesignIdentitySha256);
  assert.equal(receipt.designBinding.directorDesignIdentitySha256, linkedResult.directorDesignIdentitySha256);
  assert.equal(receipt.inputHashes.directorDesignIdentity, receipt.designBinding.directorDesignIdentitySha256);

  const selectedProjectShot = linkedPlan.plan.directionDecisions[0].candidates.find((row) => row.id === "project-shot-route");
  assert.ok(receipt.artifacts.projectShotKeyStates.length > 0, "actual render records the captured project-shot key state");
  selectedProjectShot.keyStateEvidence = receipt.artifacts.projectShotKeyStates.map((row) => row.planProof);
  await writeJson(linkedPlan.planPath, linkedPlan.plan);

  const verified = invoke(productionPlanCli, ["verify-delivery", "--plan", linkedPlan.planPath, "--ffmpeg", ffmpeg], {
    timeout: 1_200_000,
    tmpdir: path.join(evalTmpRoot, "v5-production", runId),
  });
  assertCliOk(verified, "V5 verify-delivery rechecks the same creative/D3/Film/audio bindings");
  const verifiedResult = JSON.parse(verified.stdout);
  assert.equal(verifiedResult.result, "PASS");
  assert.equal(verifiedResult.planFormat, "laohu.motion.production-plan/5");
  assert.equal(verifiedResult.creativeDesignIdentitySha256, linkedResult.creativeDesignIdentitySha256);
  assert.equal(verifiedResult.directorDesignIdentitySha256, linkedResult.directorDesignIdentitySha256);

  const creativelyChanged = structuredClone(linkedPlan.plan);
  creativelyChanged.creativeDesign.cueDesigns[0].picturePrompt += " Add a new material transformation.";
  creativelyChanged.directorDesign.creativeDesignRef = {id: linkedResult.creativeDesignId, sha256: "f".repeat(64)};
  const creativelyChangedPath = path.join(path.dirname(linkedPlan.planPath), "post-production-creative-change.json");
  await writeJson(creativelyChangedPath, creativelyChanged);
  const staleDelivery = invoke(productionPlanCli, ["verify-delivery", "--plan", creativelyChangedPath, "--ffmpeg", ffmpeg], {
    timeout: 1_200_000,
    tmpdir: path.join(evalTmpRoot, "v5-production", runId),
  });
  assert.notEqual(staleDelivery.status, 0, "changing Analysis design after render cannot reuse old Film receipts");
  assert.match(staleDelivery.stderr, /creativeDesignRef must bind the exact current creativeDesign\/1 identity/);
});

test("canonical presentation and source-clip camera anchors resolve only their exact phase units", () => {
  const presentationRange = {startSample: 480, endSample: 960};
  const clipRange = {startSample: 0, endSample: 480};
  const canonical = {
    presentationUnitsById: new Map([["title-card", {id: "title-card", targetRange: presentationRange}]]),
    clipByOccurrenceId: new Map([["retained-clip", {occurrenceId: "retained-clip", targetRange: clipRange}]]),
  };
  assert.equal(resolveCanonicalAttentionCameraRange({presentationId: "title-card", edge: "start", offsetSamples: 12},
    [{kind: "presentation", presentationId: "title-card"}], canonical), presentationRange);
  assert.equal(resolveCanonicalAttentionCameraRange({occurrenceId: "retained-clip", edge: "end", offsetSamples: -12},
    [{kind: "source-clip", occurrenceId: "retained-clip", edge: "end"}], canonical), clipRange);
  assert.throws(() => resolveCanonicalAttentionCameraRange({presentationId: "title-card", edge: "start"},
    [{kind: "presentation", presentationId: "another-card"}], canonical), /included in its exact phase/);
  assert.throws(() => resolveCanonicalAttentionCameraRange({occurrenceId: "retained-clip", edge: "start"},
    [{kind: "source-clip", occurrenceId: "retained-clip", edge: "end"}], canonical), /exact occurrence boundary/);
});

test("runtime attention phases safely hide phase-local actors and activate semantic read zones only in their frame budget", () => {
  const phase = {
    id: "phase-a", start: 0, end: 2,
    mainTask: {id: "task-a", description: "Follow the current relation.", actorIds: ["relation-a"]},
    cameraKeys: [{at: 0, center: [960, 540], zoom: 1, rotation: 0}],
    readingZones: [{id: "zone-a", windowId: "read-a", textCueIds: ["label-a"], x: 100, y: 100, width: 100, height: 80}],
    readWindows: [{id: "read-a", taskId: "task-a", groupId: "task-a", captionCueIds: [], screenTextIds: ["label-a"],
      start: 0.5, end: 1.5, basis: "phase-frame-budget", reason: "The label uses the declared semantic frame interval."}],
    actorBindings: [{actorId: "relation-a", role: "target", owner: "phase-a", consumer: attentionActorConsumer,
      props: {x: 400, y: 400, width: 180, height: 80, scale: 1, rotation: 0, opacity: 1, visible: true, coordinateSpace: "world"}}],
  };
  const before = resolveAttentionBindings({phases: [phase], actorIds: ["relation-a", "relation-b"], time: 0.49});
  const active = resolveAttentionBindings({phases: [phase], actorIds: ["relation-a", "relation-b"], time: 1});
  const after = resolveAttentionBindings({phases: [phase], actorIds: ["relation-a", "relation-b"], time: 1.5});
  assert.deepEqual(before.readWindows, []);
  assert.deepEqual(before.readingZones, []);
  assert.equal(active.readWindows[0].basis, "phase-frame-budget");
  assert.equal(active.readingZones[0].id, "zone-a");
  assert.deepEqual(after.readWindows, []);
  assert.deepEqual(after.readingZones, []);
  const state = active;
  assert.equal(state.actors["relation-a"].visible, true);
  assert.deepEqual(state.actors["relation-b"], {visible: false, opacity: 0});
});

test("production-plan/4 compiles retained caption evidence through D3 design, readable export, and the actual Film consumer", async () => {
  const runId = "v4-caption-attention-" + Date.now() + "-" + process.pid;
  const built = await buildV4CaptionAttentionPlan(runId);
  const {root, planPath, plan, captionManifest, captionsSrtPath} = built;
  assert.equal(captionManifest.format, "laohu.asrcut.caption-manifest/1");
  assert.equal(captionManifest.cues[0].speechSpan.timingPrecision, "utterance", "SRT utterance evidence stays at utterance precision");
  assert.equal(captionManifest.cues[0].rawText, "你好\n", "source SRT formatting remains visible in the manifest evidence");
  assert.equal(await fs.readFile(captionsSrtPath, "utf8"), captionManifestToSrt(captionManifest), "SRT is exported from the exact compiled manifest");
  assert.match(await fs.readFile(captionsSrtPath, "utf8"), /\n你好\n$/);

  const validated = await validatePlanFile(planPath, {stage: "direction"});
  assert.equal(validated.plan.format, "laohu.motion.production-plan/4");
  assert.equal(validated.plan.directorDesign.format, "laohu.motion.director-design/3");
  assert.equal(validated.asrcutHandoff.captionManifest.integrity.manifestSha256, captionManifest.integrity.manifestSha256);
  assert.deepEqual(validated.attentionRuntimePhases.map((phase) => phase.id), ["phase-greeting"]);
  assert.equal(validated.attentionRuntimePhases[0].mainTask.actorIds[0], "relation-map");
  assert.deepEqual(validated.attentionConsumerBinding.rows[0].attentionPhaseIds, ["phase-greeting"]);
  assert.equal(validated.attentionConsumerBinding.rows[0].moduleUsage.attentionBridge, true);
  assert.equal(validated.attentionConsumerBinding.rows[0].moduleUsage.captions, true);
  assert.equal(validated.blueprint.segments[0].props.captionManifest.cues[0].id, "caption-greeting");
  assert.equal(validated.blueprint.segments[0].props.captionManifest.cues[0].displayWindow.startSample, 0);
  assert.equal(validated.blueprint.segments[0].props.attentionGlobalFromSeconds, validated.attentionRuntimePhases[0].start,
    "ASRcut V2 segment time is resolved from canonical phase timing; Film does not invent an independent startSec");
  assert.equal(validated.blueprint.segments[0].props.attentionPhases[0].actorBindings[0].props.depth, 2);

  const designPath = path.join(root, "design", "director-design.md");
  const exported = invoke(productionPlanCli, ["export-design", "--plan", planPath, "--output", path.relative(root, designPath), "--stage", "direction", "--view", "technical"]);
  assertCliOk(exported, "production-plan/4 D3 director export");
  const markdown = await fs.readFile(designPath, "utf8");
  assert.match(markdown, /production-plan\/4 的 directorDesign\/3/);
  assert.match(markdown, /最终字幕与逐条视线设计/);
  assert.match(markdown, /时间／字幕 \| 主要观看任务／目标 \| 具体画面与构图 \| 动作、其他元素与交接 \| 精确文字／样式／布局 \| 声音／完成/);
  assert.match(markdown, /caption-greeting/);
  assert.match(markdown, /口播词 你好；显示文案 你好/);
  assert.match(markdown, /Core\.Captions 消费 props\.captionManifest\/props\.captionStyle/);
  assert.match(markdown, /CameraRig/);
  assert.match(markdown, /retain-to-canonical-end/);

  const sourceClipAnchoredPlan = structuredClone(plan);
  const sourceClipPhase = sourceClipAnchoredPlan.directorDesign.attentionPhases[0];
  sourceClipPhase.anchors.rows.push(
    {kind: "source-clip", occurrenceId: built.occurrenceId, edge: "start"},
    {kind: "source-clip", occurrenceId: built.occurrenceId, edge: "end"},
  );
  sourceClipPhase.camera.keyframes[0].anchor = {occurrenceId: built.occurrenceId, edge: "start", offsetSamples: 0};
  const sourceClipValidated = await validatePlanFile(planPath, {stage: "direction", planOverride: sourceClipAnchoredPlan});
  assert.equal(sourceClipValidated.attentionRuntimePhases[0].cameraKeys[0].at, 0,
    "source-clip camera keys resolve from the actual retained occurrence boundary included in the phase");

  const captionPlusText = structuredClone(plan.directorDesign);
  const captionTextCue = captionPlusText.units[0].scriptCues[0];
  captionTextCue.screenText = {mode: "planned", items: [{
    id: "source-label", text: "来源标签", role: "label", styleId: "caption-style",
    layout: {position: "upper-left", region: "clear corner", alignment: "left", maxLines: 1, background: "none", layerOrder: "above-actor"},
    visibility: {basis: "semantic-budget", startCueId: captionTextCue.id, endCueId: captionTextCue.id, retention: "hold through the declared cue read", reason: "Keep this label available beside its caption."},
    readingWindow: {startCueId: captionTextCue.id, endCueId: captionTextCue.id, holdAcrossCues: false, reason: "The label and subtitle support the same task."},
    requiresReading: true,
    consumerRefs: [{implementationPlanId: "font-shot", mappingId: "font-shot-map"}],
  }]};
  captionPlusText.attentionPhases[0].readWindows[0].screenTextIds = ["source-label"];
  captionPlusText.attentionPhases[0].readWindows[0].screenTextRange = {startCueId: captionTextCue.id, endCueId: captionTextCue.id};
  const captionPlusTextMarkdown = directorDesignMarkdown(captionPlusText, null, null, false, captionManifest);
  assert.match(captionPlusTextMarkdown, /The fixed actor rectangle and the compiled subtitle render in separate declared screen regions/);
  assert.match(captionPlusTextMarkdown, /Solid magenta rectangle with fixed intrinsic content/);
  assert.match(captionPlusTextMarkdown, /来源标签/);
  assert.match(captionPlusTextMarkdown, /upper-left／clear corner／left/);

  const screenTextOnly = structuredClone(captionPlusText);
  screenTextOnly.narration = {mode: "none", reason: "A source-free title card has no narration or caption manifest.", scriptSelections: []};
  const titleCue = screenTextOnly.units[0].scriptCues[0];
  titleCue.source = {kind: "presentation-only", reason: "A source-free title card is a visual presentation."};
  titleCue.continuityIn = "The title begins over the warm-paper field.";
  titleCue.continuityOut = "The title remains until the declared presentation hold completes.";
  titleCue.visualNarration = "The exact title sits in the upper clear area, above the relation diagram.";
  titleCue.screenText.items[0].id = "presentation-title";
  titleCue.screenText.items[0].text = "关系图";
  titleCue.screenText.items[0].role = "title";
  titleCue.screenText.items[0].visibility = {basis: "semantic-budget", startCueId: titleCue.id, endCueId: titleCue.id, retention: "hold for the declared presentation read", reason: "The title introduces the visual subject."};
  screenTextOnly.units[0].actions[0].timing = {basis: "semantic-budget", startCueId: titleCue.id, endCueId: titleCue.id, relationship: "The label enters before relation lines appear."};
  screenTextOnly.attentionPhases[0].anchors = {basis: "semantic-budget", cueIds: [titleCue.id], startFrame: 0, endFrame: 24, fps: 24};
  screenTextOnly.attentionPhases[0].camera.keyframes[0].anchor = {frame: 0};
  screenTextOnly.attentionPhases[0].readWindows[0].captionCueIds = [];
  delete screenTextOnly.attentionPhases[0].readWindows[0].captionRange;
  screenTextOnly.attentionPhases[0].readWindows[0].screenTextIds = ["presentation-title"];
  screenTextOnly.attentionPhases[0].readWindows[0].screenTextRange = {startCueId: titleCue.id, endCueId: titleCue.id};
  const titleMarkdown = directorDesignMarkdown(screenTextOnly, null, null, false, null);
  assert.match(titleMarkdown, /时间／字幕 \| 主要观看任务／目标 \| 具体画面与构图 \| 动作、其他元素与交接 \| 精确文字／样式／布局 \| 声音／完成/);
  assert.match(titleMarkdown, /presentation-title/);
  assert.match(titleMarkdown, /关系图/);
  assert.match(titleMarkdown, /语义预算 font-title-cue → font-title-cue/);
  assert.match(titleMarkdown, /exact title sits in the upper clear area/);
  assert.match(titleMarkdown, /semantic frame 0/);
  assert.doesNotMatch(titleMarkdown, /口播词 你好/);
  const emptyDesign = structuredClone(screenTextOnly);
  emptyDesign.units[0].scriptCues = [];
  emptyDesign.attentionPhases = [];
  const emptyMarkdown = directorDesignMarkdown(emptyDesign, null, null, false, null);
  assert.doesNotMatch(emptyMarkdown, /\| 时间／字幕 \|/, "a genuinely empty no-narration design has no misleading table header");

  const rejectMutation = async (mutate, pattern, label) => {
    const altered = structuredClone(plan);
    mutate(altered);
    await assert.rejects(() => validatePlanFile(planPath, {stage: "direction", planOverride: altered}), pattern, label);
  };
  await rejectMutation((draft) => { delete draft.directorDesign.attentionPhases; }, /attentionPhases/, "formal /4 cannot omit its attention handoff");
  await rejectMutation((draft) => { draft.directorDesign.format = "laohu.motion.director-design/2"; }, /production-plan\/4 and \/5 require directorDesign\/3/, "formal /4 cannot pair with a legacy director schema");
  await rejectMutation((draft) => {
    draft.work.directionMode = "technical-probe";
    for (const decision of draft.directionDecisions || []) {
      decision.mode = "technical-probe";
      delete decision.userLockRef;
      delete decision.evidenceRef;
    }
    delete draft.directorDesign;
    for (const row of draft.implementationPlan || []) row.consumerFields = row.consumerFields.filter((field) => field !== "props.captionManifest" && !field.startsWith("props.captionStyle"));
    for (const shot of draft.shots || []) for (const mapping of shot.sourceMappings || []) {
      mapping.consumerFields = mapping.consumerFields.filter((field) => field !== "props.captionManifest" && !field.startsWith("props.captionStyle"));
    }
  }, /production-plan\/4 and \/5 require directorDesign\/3/, "technical-probe cannot waive a new /4 design");
  await rejectMutation((draft) => { draft.directorDesign.attentionPhases[0].mainTask.actorIds = ["fabricated-actor"]; }, /actual object or planned screenText/, "main task targets must be declared actors from their own viewing unit");
  await rejectMutation((draft) => { draft.directorDesign.attentionPhases[0].handoff.targetPhaseId = "orphan-phase"; }, /unknown phase/, "phase handoff cannot point to an orphan phase");
  await rejectMutation((draft) => { draft.directorDesign.attentionPhases[0].actorBindings[0].owner = "another-phase"; }, /property owner/, "actor properties cannot be claimed by another phase");
  await rejectMutation((draft) => {
    draft.directorDesign.attentionPhases[0].readWindows.push({id: "independent-read", taskId: "read-greeting", groupId: "competing-demand",
      captionCueIds: ["caption-greeting"], captionRange: {startCueId: "caption-greeting", endCueId: "caption-greeting"}, screenTextIds: [], reason: "Independent read task."});
  }, /independent concurrent demands/, "overlapping reading windows must share one declared task and group");
  await rejectMutation((draft) => { draft.inputs.asrcut.captionManifest.sha256 = "0".repeat(64); }, /SHA-256 changed/, "stale compiled caption bytes cannot be accepted");
  await rejectMutation((draft) => { draft.directorDesign.attentionPhases[0].camera.keyframes[0].anchor.segmentId = "invented-segment"; }, /exact token\/segment/, "camera keys must anchor the actual phase partition");

  const modulePath = built.modulePath;
  const blueprintPath = path.join(root, "film-blueprint.json");
  const assertModuleMutationRejects = async (mutateSource, pattern, label) => {
    const originalModule = await fs.readFile(modulePath);
    const originalBlueprint = await fs.readFile(blueprintPath);
    try {
      const source = originalModule.toString("utf8");
      const changedSource = mutateSource(source);
      assert.notEqual(changedSource, source, label + ": mutation must affect the actual module bytes");
      const changedBlueprint = JSON.parse(originalBlueprint.toString("utf8"));
      changedBlueprint.segments[0].moduleSha256 = sha256(Buffer.from(changedSource, "utf8"));
      await fs.writeFile(modulePath, changedSource);
      await writeJson(blueprintPath, changedBlueprint);
      const altered = structuredClone(plan);
      altered.inputs.filmBlueprint.sha256 = sha256(await fs.readFile(blueprintPath));
      await assert.rejects(() => validatePlanFile(planPath, {stage: "direction", planOverride: altered}), pattern, label);
    } finally {
      await fs.writeFile(modulePath, originalModule);
      await fs.writeFile(blueprintPath, originalBlueprint);
    }
  };
  await assertModuleMutationRejects((source) => source.replace("id:'relation-map'", "id:'invented-actor'"), /statically verifiable list of actual work-local actor ids/, "rehashing cannot detach the module actor id from compiled attention actors");
  await assertModuleMutationRejects((source) => source.replace("node:<div data-test-attention-actor='relation-map' style={{width:'100%',height:'100%',background:'#e600ff'}}/>", "node:undefined"), /statically verifiable list of actual work-local actor ids/, "a declared actor id must carry a statically renderable JSX node");
  await assertModuleMutationRejects((source) => source.replace("phases={props.attentionPhases}", "phases={other.attentionPhases}"), /exact props\.attentionPhases/, "a generic object member cannot impersonate the actual Film attention prop");
  await assertModuleMutationRejects((source) => source.replace("manifest={props.captionManifest}", "manifest={other.captionManifest}"), /exact captionManifest/, "a generic object member cannot impersonate the actual Film caption prop");

  const legacy = await buildV3DirectionPlan("v4-legacy-compat-" + Date.now() + "-" + process.pid);
  const legacyValidated = await validatePlanFile(legacy.planPath, {stage: "direction"});
  assert.equal(legacyValidated.plan.format, "laohu.motion.production-plan/3", "existing /3 + D2 artifacts retain their legacy reader/export route");
});

test("reference-index list restores full browse/filter results while overview stays compact", async () => {
  const all = invoke(templatesCli, ["list", "--type", "reference-index", "--json"], { timeout: 120_000 });
  assertCliOk(all, "full reference-index list");
  const references = JSON.parse(all.stdout);
  assert.equal(references.length, 347);
  assert.ok(references.every((row) => row.itemType === "reference-index" && row.availability === "source-only"));

  const camera = invoke(templatesCli, ["list", "--type", "reference-index", "--category", "camera", "--json"], { timeout: 120_000 });
  assertCliOk(camera, "camera reference-index filter");
  const cameraRows = JSON.parse(camera.stdout);
  assert.equal(cameraRows.length, 23);
  assert.ok(cameraRows.every((row) => (row.category || []).includes("camera")));

  const overview = invoke(templatesCli, ["overview", "--json"], { timeout: 120_000 });
  assertCliOk(overview, "compact resource overview");
  assert.ok(Buffer.byteLength(overview.stdout) < 12_000, "overview should summarize counts rather than print the full reference corpus");
  const groups = JSON.parse(overview.stdout).groups;
  assert.deepEqual(groups.map((row) => row.type), ["style", "template", "effect", "effect-library", "method", "reference-index", "style-profile", "source-index"]);
  assert.deepEqual(Object.fromEntries(groups.map((row) => [row.type, row.count])), {
    style: 73,
    template: 164,
    effect: 31,
    "effect-library": 4,
    method: 0,
    "reference-index": 347,
    "style-profile": 0,
    "source-index": 97,
  });

  const styleBrowse = invoke(templatesCli, ["styles", "compatibility", "browse", "--category", "A-G_代码样片", "--json"], { timeout: 120_000 });
  assertCliOk(styleBrowse, "explicit compatibility style content-capability browse");
  const styleRows = JSON.parse(styleBrowse.stdout).categories.flatMap((group) => group.entries);
  const capability = (id) => styleRows.find((row) => row.id === id)?.contentCapability;
  assert.equal(capability("F1").mode, "structured-content-adapter");
  assert.equal(capability("F1").demoMode, true, "a lookup with no caller input must disclose that direct preview would still be a demo");
  assert.deepEqual(capability("F1").consumedContentFields, ["title", "data[].label", "data[].value"]);
  assert.equal(capability("F1").productionAdapterId, "laohu-style-code-canvas");
  assert.match(capability("F1").contentFieldMeaning["data[].value"], /0–60/);
  assert.deepEqual(capability("F2").consumedContentFields, [
    "nodes[].key", "nodes[].x", "nodes[].y", "edges[].from", "edges[].to", "edges[].label", "edges[].at", "focalKey", "highlightLabel",
  ]);
  assert.equal(capability("A1").mode, "parent-text-only");
  assert.deepEqual(capability("A1").consumedContentFields, ["parentText"]);
  assert.equal(capability("A2").mode, "fixed-source-semantics");
  assert.deepEqual(capability("A2").consumedContentFields, []);
  assert.ok(!styleRows.some((row) => row.id === "B3"), "B3 has no drawing function and is not a callable compatibility entry");

  const showF2 = invoke(templatesCli, ["show", "F2", "--json"], { timeout: 120_000 });
  assertCliOk(showF2, "style show content-capability");
  assert.equal(JSON.parse(showF2.stdout)[0].contentCapability.productionAdapterId, "laohu-style-code-canvas");

  const describeF1 = invoke(templatesCli, ["styles", "compatibility", "describe", "--query", "F1", "--json"], { timeout: 120_000 });
  assertCliOk(describeF1, "style describe content-capability");
  const describedF1 = JSON.parse(describeF1.stdout);
  assert.equal(describedF1.contentCapability.mode, "structured-content-adapter");
  assert.equal(describedF1.contentCapability.productionAdapterId, "laohu-style-code-canvas");
  assert.equal(describedF1.contentCapability.demoMode, true);
});

test("production-plan/2 direction validates real materials and a feasible project-shot route before Film or audio exists", async () => {
  const runId = "v2-direction-route-" + Date.now() + "-" + process.pid;
  const { planPath, plan } = await buildV2DirectionPlan(runId);
  assert.equal(plan.inputs.filmBlueprint, undefined);
  assert.equal(plan.inputs.audioPlan, undefined);
  const inputs = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "inputs"]);
  assertCliOk(inputs, "production-plan/2 inputs stage without production wiring");
  const direction = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "direction"]);
  assertCliOk(direction, "production-plan/2 direction stage before work module and Film exist");
  const result = JSON.parse(direction.stdout);
  assert.equal(result.completeThroughStage, "direction");
  assert.equal(result.route, null, "a feasible host route is recorded without claiming a built Film or work composition");

  const missingRoutePath = path.join(path.dirname(planPath), "missing-route-evidence.json");
  const missingRoute = structuredClone(plan);
  missingRoute.inputs.sourceMaterials[0].sha256 = "0".repeat(64);
  await writeJson(missingRoutePath, missingRoute);
  const rejectedInputs = invoke(productionPlanCli, ["validate", "--plan", missingRoutePath, "--stage", "inputs"]);
  assert.notEqual(rejectedInputs.status, 0, "stage validation must verify actual material bytes");
  assert.match(rejectedInputs.stderr, /SHA-256 changed/);

  const incompleteProduction = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "production"]);
  assert.notEqual(incompleteProduction.status, 0, "production must still require the actual Film, audio, mappings and render proof");
  assert.match(incompleteProduction.stderr, /key-state (?:PNG|frame)|filmBlueprint|implementationPlan/);

  const demoRunId = "v2-reference-demo-" + Date.now() + "-" + process.pid;
  const { planPath: demoPath } = await buildV2DirectionPlan(demoRunId, { candidate: "laohu-authored-shot" });
  const demoDirection = invoke(productionPlanCli, ["validate", "--plan", demoPath, "--stage", "direction"]);
  assert.notEqual(demoDirection.status, 0, "the registered authored demonstration remains available for direct preview but cannot be selected as ordinary new-work content");
  assert.match(demoDirection.stderr, /reference or unclassified resource/);

  const executableHash = JSON.parse(direction.stdout).planSha256;
  assert.ok(executableHash, "direction result identifies the submitted document");
  const originalValidated = await validatePlanFile(planPath, { stage: "direction" });
  const reviewedCopy = structuredClone(plan);
  reviewedCopy.verification = { gates: [{
    id: "visual-check", inspect: "Review the real shot", evidence: "Independent review after render", redoReason: "Revise if the relation is unclear",
    scope: "relationship-segment", criterionRef: "criterion:relationship-order", observations: "This note is post-render and non-executable.",
    status: "UNKNOWN", redoLocation: "production-plan.json#verification.gates.visual-check",
  }] };
  const reviewedPath = path.join(path.dirname(planPath), "review-note-only.json");
  await writeJson(reviewedPath, reviewedCopy);
  const reviewedValidated = await validatePlanFile(reviewedPath, { stage: "direction" });
  assert.equal(reviewedValidated.executionPlanSha256, originalValidated.executionPlanSha256,
    "review observations do not change the executable input fingerprint or force a rerender");
});

test("production-plan/3 requires a concrete viewing design and keeps acquisition receipts outside stable design identity", async () => {
  const runId = "v3-design-identity-" + Date.now() + "-" + process.pid;
  const built = await buildV3DirectionPlan(runId, { pendingMusic: true });
  const { planPath, plan } = built;
  const first = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "direction"]);
  assertCliOk(first, "V3 complete direction design with pending acquisition task");
  const firstResult = JSON.parse(first.stdout);
  assert.match(firstResult.directorDesignIdentitySha256, /^[a-f0-9]{64}$/);
  assert.equal(firstResult.boundDirectorDesignIdentitySha256, null, "direction identity is available before Film/audio production inputs exist");
  const markdownPath = path.join(path.dirname(planPath), "production", "design", "director-design.md");
  const exported = invoke(productionPlanCli, ["export-design", "--plan", planPath, "--output", markdownPath]);
  assertCliOk(exported, "single-source human-readable director-design Markdown export");
  const exportReceipt = JSON.parse(exported.stdout);
  assert.equal(exportReceipt.generatedFromSingleSource, true);
  const markdown = await fs.readFile(markdownPath, "utf8");
  assert.equal((markdown.match(/^## /gm) || []).length, 10, "the human handoff keeps exactly ten fixed brief H2 sections");
  for (const heading of ["## 输入、时钟与覆盖", "## 内容关系", "## 全局视听世界", "## 对象、材质与文字", "## 镜头空间与状态", "## 逐句／逐 cue 画面", "## 动作、转场与连续性", "## 音轨与混音", "## 素材需求与适用场景", "## 反向检查"]) {
    assert.ok(markdown.includes(heading), "human handoff includes fixed brief section " + heading);
  }
  assert.ok(markdown.indexOf("## 全局视听世界") < markdown.indexOf("## 对象、材质与文字")
    && markdown.indexOf("## 对象、材质与文字") < markdown.indexOf("## 镜头空间与状态"),
  "global design direction precedes objects and unit composition");
  assert.ok(markdown.indexOf("## 逐句／逐 cue 画面") < markdown.indexOf("### 逐 cue 索引")
    && markdown.indexOf("### 逐 cue 索引") < markdown.indexOf("#### 第三层")
    && markdown.indexOf("#### 第三层") < markdown.indexOf("## 动作、转场与连续性"),
  "cue index precedes full creative cue prompts");
  assert.match(markdown, /#### 第三层/);
  assert.match(markdown, /#### 是/);
  assert.match(markdown, /#### 基础设施/);
  assert.match(markdown, /Noto Sans SC 500，当前设计字号 40px/);
  assert.match(markdown, /中心节点为墨色圆形/);
  assert.match(markdown, /0:00\.000–0:01\.000（项目采样时钟）/);
  assert.doesNotMatch(markdown, /relationship-route|consumerMappings|props\.|source-1-occurrence-1|source-1-seg-1-word-/);
  assert.doesNotMatch(markdown.replace(/<!--[^>]*-->/g, ""), /[a-f0-9]{64}/, "human creative view does not expose technical hashes outside machine metadata");
  assert.doesNotMatch(markdown, /真实 Film 消费者|实际 voice track|cue-definition|cue-link|cue-result/);
  const cueDefinitionBlock = markdown.split("#### 第三层")[1].split("#### 是")[0];
  assert.match(cueDefinitionBlock, /中心节点停在左中锚点/);
  assert.match(cueDefinitionBlock, /从“第三层”到“基础设施”/);
  const cueLinkBlock = markdown.split("#### 是")[1].split("#### 基础设施")[0];
  assert.match(cueLinkBlock, /第一条青色方向线从中心向上方目标延伸/);
  const cueResultBlock = markdown.split("#### 基础设施")[1].split("## 动作、转场与连续性")[0];
  assert.match(cueResultBlock, /第二条线和标签落定后/);

  const satisfied = structuredClone(plan);
  satisfied.directorDesign.resourceTasks[0].status = "satisfied";
  satisfied.directorDesign.resourceTasks[0].acquisition = {
    actualSha256: "a".repeat(64),
    rightsReview: {
      kind: "audio", selectedId: "catalog.example-explanation-bed",
      sourceUrl: "https://example.invalid/sounds/explanation-bed", license: "CC0-1.0",
      evidenceMaterialId: "direction-lock", reviewedBy: "asset reviewer",
      basis: "The selected source record and preserved license evidence identify this license.",
      sourceDistribution: "allowed", finishedWorkSync: "allowed",
    },
  };
  const satisfiedPath = path.join(path.dirname(planPath), "satisfied-plan.json");
  await writeJson(satisfiedPath, satisfied);
  const afterAcquire = invoke(productionPlanCli, ["validate", "--plan", satisfiedPath, "--stage", "direction"]);
  assertCliOk(afterAcquire, "acquired bytes and a bound rights receipt do not change Analysis design identity");
  assert.equal(JSON.parse(afterAcquire.stdout).directorDesignIdentitySha256, firstResult.directorDesignIdentitySha256);

  const changedSelection = structuredClone(satisfied);
  changedSelection.directorDesign.resourceTasks[0].selection.sourceUrl = "https://example.invalid/sounds/other-bed";
  changedSelection.directorDesign.resourceTasks[0].acquisition.rightsReview.sourceUrl = "https://example.invalid/sounds/other-bed";
  const changedSelectionPath = path.join(path.dirname(planPath), "changed-selection.json");
  await writeJson(changedSelectionPath, changedSelection);
  const changed = invoke(productionPlanCli, ["validate", "--plan", changedSelectionPath, "--stage", "direction"]);
  assertCliOk(changed, "a changed source choice remains a design change");
  assert.notEqual(JSON.parse(changed.stdout).directorDesignIdentitySha256, firstResult.directorDesignIdentitySha256);
  assert.equal(JSON.parse(changed.stdout).filmDesignIdentitySha256, firstResult.filmDesignIdentitySha256,
    "choosing another non-synchronized music asset updates full design, not the picture-only Film projection");

  const missingProcessing = structuredClone(plan);
  missingProcessing.directorDesign.resourceTasks[0].acquisitionPlan.processingSteps = [];
  const missingProcessingPath = path.join(path.dirname(planPath), "missing-processing.json");
  await writeJson(missingProcessingPath, missingProcessing);
  const incompleteTask = invoke(productionPlanCli, ["validate", "--plan", missingProcessingPath, "--stage", "direction"]);
  assert.notEqual(incompleteTask.status, 0, "a source URL without real retrieval, processing, rights, acceptance and failure instructions is not an executable task");
  assert.match(incompleteTask.stderr, /resource acquisitionPlan\.processingSteps must be a non-empty array/);

  const silentMistake = structuredClone(plan);
  silentMistake.directorDesign.units[0].sound.intent.music = "none";
  silentMistake.directorDesign.units[0].sound.trackIds = [];
  const silentPath = path.join(path.dirname(planPath), "pending-is-not-silent.json");
  await writeJson(silentPath, silentMistake);
  const disconnected = invoke(productionPlanCli, ["validate", "--plan", silentPath, "--stage", "direction"]);
  assert.notEqual(disconnected.status, 0, "a pending music task cannot be laundered into a silent unit");
  assert.match(disconnected.stderr, /must be linked to the unit's designed sound intent and planned consumer IDs/);
});

test("export-design resolves multi-action sample spans and keeps synchronized SFX cue-local", async () => {
  const runId = "v3-action-time-cue-sfx-" + Date.now() + "-" + process.pid;
  const built = await buildV3DirectionPlan(runId);
  const plan = structuredClone(built.plan);
  const unit = plan.directorDesign.units[0];
  const timelinePath = path.resolve(path.dirname(built.planPath), plan.inputs.asrcut.timeline.path);
  const timeline = JSON.parse(await fs.readFile(timelinePath, "utf8"));
  const clip = timeline.clips[0];
  clip.words[2] = {
    ...clip.words[2], text: "基础",
    targetRange: { startSample: 72000, endSample: 108000, sampleRateHz: 48000 },
  };
  clip.words.push({
    tokenId: "source-1-seg-1-word-4", text: "设施",
    targetRange: { startSample: 108000, endSample: 144000, sampleRateHz: 48000 }, timingPrecision: "measured",
  });
  await writeJson(timelinePath, timeline);
  plan.inputs.asrcut.timeline.sha256 = sha256(await fs.readFile(timelinePath));
  unit.scriptCues[1].source.endTokenId = "source-1-seg-1-word-3";
  unit.scriptCues[1].source.exactText = "是基础";
  unit.scriptCues[2].source.startTokenId = "source-1-seg-1-word-4";
  unit.scriptCues[2].source.endTokenId = "source-1-seg-1-word-4";
  unit.scriptCues[2].source.exactText = "设施";
  const baseAction = structuredClone(unit.actions[0]);
  const makeAction = (id, phase, cueId, startOffsetSamples, endOffsetSamples, pathOrMorph) => ({
    ...structuredClone(baseAction), id, phase, triggerCueIds: [cueId],
    timing: {
      basis: "canonical-target-samples", startCueId: cueId, endCueId: cueId,
      startOffsetSamples, endOffsetSamples,
      relationship: `由源 cue ${cueId} 的短语窗口触发；canonical samples 界定动作范围；这是该短语的起末边界；不声称短语内部有未测得的字级触发点。`,
    },
    pathOrMorph,
  });
  unit.actions = [
    makeAction("action-enter-center", "enter", "cue-definition", 0, -12000, "中心节点由空白处淡入左中锚点。"),
    makeAction("action-draw-first-link", "change", "cue-link", 0, -48000, "第一条方向线从中心节点延伸到上方目标。"),
    makeAction("action-highlight-second-link", "change", "cue-link", 24000, -12000, "第二条方向线接入右下目标。"),
    makeAction("action-settle-second-link", "hold", "cue-result", 0, 0, "第二条方向线落到右下目标，全图停稳。"),
  ];
  unit.scriptCues[0].actionIds = ["action-enter-center"];
  unit.scriptCues[1].actionIds = ["action-draw-first-link", "action-highlight-second-link"];
  unit.scriptCues[2].actionIds = ["action-settle-second-link"];
  unit.sound.intent.sfx = "designed";
  unit.sound.eventIds = ["sfx-first-link"];
  unit.sound.intent.music = "designed";
  unit.sound.trackIds = ["music-bed"];
  unit.sound.syncCues = [{
    kind: "audio-event", id: "sfx-first-link", actionId: "action-draw-first-link", phase: "change",
    relationship: "The soft click supports the first arrow reaching its target.",
  }, {
    kind: "audio-track", id: "music-bed", actionId: "action-settle-second-link", phase: "hold",
    relationship: "The unit-wide bed supports the final readable hold without assigning an SFX event to this cue.",
  }];

  const planPath = path.join(built.root, "multi-action-time-and-local-sfx.json");
  await writeJson(planPath, plan);
  const validation = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "direction"]);
  assertCliOk(validation, "multiple actions inside one multi-token cue use real source ranges and offsets; SFX stays on its cited action");
  const markdownPath = path.join(built.root, "production", "design", "multi-action-time-and-local-sfx.md");
  const exported = invoke(productionPlanCli, ["export-design", "--plan", planPath, "--output", markdownPath, "--view", "technical"]);
  assertCliOk(exported, "action timings and cue-local sound are exported from the validated JSON source");
  const markdown = await fs.readFile(markdownPath, "utf8");
  const cueBlock = (id, next) => markdown.split(`##### ${id}`)[1].split(next)[0];
  const definitionBlock = cueBlock("cue-definition", "##### cue-link");
  const linkBlock = cueBlock("cue-link", "##### cue-result");
  const resultBlock = cueBlock("cue-result", "## 动作、转场与连续性");
  const linkChange = linkBlock.split("- 【变化过程】")[1]?.split("- 【文字呈现】")[0] || "";

  assert.match(definitionBlock, /\*\*action-enter-center\*\*（enter；时段 0:00\.000–0:00\.750 秒/);
  assert.match(definitionBlock, /【编号·时间·原句】cue-definition；.*token .*：第三层/);
  assert.match(definitionBlock, /目标对象：relation-map/);
  assert.match(definitionBlock, /中心节点由空白处淡入左中锚点/);
  assert.match(linkChange, /^  - \*\*action-draw-first-link\*\*（change；时段 0:01\.000–0:01\.250 秒/m);
  assert.match(linkChange, /^  - \*\*action-highlight-second-link\*\*（change；时段 0:01\.500–0:02\.000 秒/m);
  assert.equal([...linkChange.matchAll(/^  - \*\*action-(?:draw-first-link|highlight-second-link)\*\*（change/mg)].length, 2,
    "both distinct actions are separate readable sub-items inside the same cue block");
  assert.equal([...linkChange.matchAll(/源 cue：cue-link/g)].length, 2,
    "each action cites its source cue ID without repeating the full source sentence");
  assert.doesNotMatch(linkChange, /occurrence .*token .*是基础/,
    "cue-level action items do not repeat the full source text");
  assert.equal([...linkBlock.matchAll(/token source-1-seg-1-word-2–source-1-seg-1-word-3：是基础/g)].length, 1,
    "the complete canonical source range is readable once in the cue header");
  assert.match(linkChange, /触发关系：由源 cue cue-link 的短语窗口触发；canonical samples 界定动作范围/);
  assert.equal((markdown.match(/这是该短语的起末边界；不声称短语内部有未测得的字级触发点。/g) || []).length, 1,
    "the repeated precision boundary is shown once in the action section, not once per action");
  assert.match(linkChange, /前／中／后关键态：relation-map /);
  assert.match(linkChange, /路径／形变：第一条方向线从中心节点延伸到上方目标。/);
  assert.match(resultBlock, /\*\*action-settle-second-link\*\*（hold；时段 0:02\.250–0:03\.000 秒/);

  assert.match(linkBlock, /计划音效事件 sfx-first-link.*关联动作 action-draw-first-link\/change（动作区间 0:01\.000–0:01\.250 秒/);
  assert.doesNotMatch(definitionBlock, /sfx-first-link/);
  assert.doesNotMatch(resultBlock, /sfx-first-link/);
  assert.match(definitionBlock, /单元声音尚未分配到本 cue/);
  assert.match(resultBlock, /本 cue 没有独立音效事件/);
  assert.match(resultBlock, /计划同步音轨 music-bed.*关联动作 action-settle-second-link\/hold/);
  for (const block of [definitionBlock, linkBlock, resultBlock]) {
    assert.match(block, /本单元音乐按全局层继承/);
  }

  const actionSection = markdown.split("## 动作、转场与连续性")[1].split("## 音轨与混音")[0];
  assert.match(actionSection, /##### action-draw-first-link（change）/);
  assert.match(actionSection, /对应来源范围：cue-link：occurrence .*token source-1-seg-1-word-2–source-1-seg-1-word-3：是基础/);
  assert.match(actionSection, /时间：0:01\.000–0:01\.250 秒（项目采样时钟；cue-link \+0 samples → cue-link -48000 samples）/);
  assert.match(actionSection, /##### action-highlight-second-link（change）[\s\S]*?时间：0:01\.500–0:02\.000 秒（项目采样时钟；cue-link \+24000 samples → cue-link -12000 samples）/);
  assert.match(actionSection, /前／中／后关键态：relation-map：/);
  assert.match(actionSection, /路径或形变：第一条方向线从中心节点延伸到上方目标。/);
});

test("export-design restores sentence punctuation only from a fully matched canonical transcript segment", async () => {
  const runId = "v3-punctuated-source-sentence-" + Date.now() + "-" + process.pid;
  const built = await buildV3DirectionPlan(runId);
  const plan = structuredClone(built.plan);
  const unit = plan.directorDesign.units[0];
  const wholeSentence = structuredClone(unit.scriptCues[0]);
  wholeSentence.id = "cue-whole-sentence";
  wholeSentence.source = {
    kind: "token-range", occurrenceId: "source-1-occurrence-1",
    startTokenId: "source-1-seg-1-word-1", endTokenId: "source-1-seg-1-word-3", exactText: "第三层是基础设施",
  };
  wholeSentence.continuityIn = "从空白场承接完整的一句讲述。";
  wholeSentence.continuityOut = "完整关系图停稳，片尾无后续 cue。";
  wholeSentence.screenText.items[0].visibility.startCueId = "cue-whole-sentence";
  wholeSentence.screenText.items[0].visibility.endCueId = "cue-whole-sentence";
  wholeSentence.screenText.items[0].readingWindow.startCueId = "cue-whole-sentence";
  wholeSentence.screenText.items[0].readingWindow.endCueId = "cue-whole-sentence";
  unit.scriptCues = [wholeSentence];
  unit.actions[0].triggerCueIds = [wholeSentence.id];
  unit.actions[0].timing.startCueId = wholeSentence.id;
  unit.actions[0].timing.endCueId = wholeSentence.id;
  const planPath = path.join(built.root, "whole-sentence-plan.json");
  await writeJson(planPath, plan);
  const validation = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "direction"]);
  assertCliOk(validation, "a complete word range maps to the exact full transcriptSegment time and text");
  const markdownPath = path.join(built.root, "production", "design", "whole-sentence.md");
  const exported = invoke(productionPlanCli, ["export-design", "--plan", planPath, "--output", markdownPath, "--view", "technical"]);
  assertCliOk(exported, "punctuated human-readable export uses only the matching canonical full sentence");
  const markdown = await fs.readFile(markdownPath, "utf8");
  assert.match(markdown, /完整句读取自同 occurrence 的 transcriptSegment“第三层，是基础设施。”/);
  assert.match(markdown, /第三层，是基础设施。/);
});

test("directorDesign/2 rejects incomplete and false cue coverage while preserving script-only and presentation branches", async () => {
  const runId = "v3-cue-contract-" + Date.now() + "-" + process.pid;
  const built = await buildV3DirectionPlan(runId);
  const validateMutation = async (name, mutate, expected) => {
    const candidate = structuredClone(built.plan);
    mutate(candidate);
    const candidatePath = path.join(built.root, name + ".json");
    await writeJson(candidatePath, candidate);
    const result = invoke(productionPlanCli, ["validate", "--plan", candidatePath, "--stage", "direction"]);
    assert.notEqual(result.status, 0, name + " must be rejected");
    assert.match(result.stderr, expected);
  };

  await validateMutation("missing-final-cue", (candidate) => {
    const unit = candidate.directorDesign.units[0];
    unit.scriptCues = unit.scriptCues.slice(0, 2);
    unit.scriptCues[0].screenText = { mode: "none", reason: "This negative fixture removes the cross-cue title so only missing narration coverage is tested." };
    candidate.directorDesign.globalSettings.textStyles = [];
    unit.actions[0].triggerCueIds = ["cue-definition", "cue-link"];
    unit.actions[0].timing = { basis: "canonical-target-samples", startCueId: "cue-definition", endCueId: "cue-link", startOffsetSamples: 0, endOffsetSamples: 0, relationship: "The action ends with the last retained source cue." };
  }, /must cover every valid word\/utterance/);
  await validateMutation("wrong-occurrence", (candidate) => {
    candidate.directorDesign.units[0].scriptCues[0].source.occurrenceId = "different-recording-take";
  }, /references an occurrence or source precision not present/);
  await validateMutation("wrong-exact-words", (candidate) => {
    candidate.directorDesign.units[0].scriptCues[0].source.exactText = "第三層 是";
  }, /exactText differs from its exact canonical occurrence\/token range/);
  await validateMutation("missing-continuity-out", (candidate) => {
    delete candidate.directorDesign.units[0].scriptCues[1].continuityOut;
  }, /director script cue\.continuityOut/);
  await validateMutation("duplicate-token-occurrence", (candidate) => {
    const cue = candidate.directorDesign.units[0].scriptCues[1];
    cue.source.startTokenId = "source-1-seg-1-word-1";
    cue.source.endTokenId = "source-1-seg-1-word-1";
    cue.source.exactText = "第三层";
  }, /cover every valid word\/utterance/);
  await validateMutation("empty-brief-section", (candidate) => {
    candidate.directorDesign.brief.contentLogic = "   ";
  }, /directorDesign\.brief\.contentLogic/);
  await validateMutation("missing-real-style", (candidate) => {
    candidate.directorDesign.globalSettings.textStyles = [];
  }, /styleId must resolve to an actual named global font\/style/);
  await validateMutation("none-cannot-hide-timeline", (candidate) => {
    const design = candidate.directorDesign;
    design.narration.mode = "none";
    design.units[0].scriptCues = [];
    design.globalSettings.textStyles = [];
    design.units[0].actions[0].triggerCueIds = [];
    design.units[0].actions[0].timing = { basis: "semantic-budget", startCueId: null, endCueId: null, relationship: "Unanchored visual action." };
    design.units[0].sound = { intent: { voice: "none", sfx: "none", music: "none" }, reason: "A false silence claim for a timeline with speech.", voiceTrackIds: [], eventIds: [], trackIds: [] };
  }, /canonical selected timeline contains spoken words/);

  const presentation = structuredClone(built.plan);
  delete presentation.inputs.asrcut;
  presentation.directorDesign.narration = { mode: "none", reason: "A genuinely source-free visual presentation with no voice recording or script.", scriptSelections: [] };
  const presentUnit = presentation.directorDesign.units[0];
  presentUnit.scriptCues = [{
    id: "title-presentation",
    source: { kind: "presentation-only", reason: "A title card introduces a source-free visual presentation." },
    continuityIn: "The video opens from an empty warm-paper field with no spoken or written source text.",
    continuityOut: "The title holds above the unchanged diagram space; the following cue remains within this same presentation unit.",
    visualNarration: "A dark teal title settles in the upper-center clear space above the empty relation map; the camera remains fixed and the background stays warm paper white.",
    screenText: {
      mode: "planned",
      items: [{
        id: "presentation-title", text: "关系图", role: "title", styleId: "label",
        layout: { position: "upper-center", region: "clear space above the diagram", alignment: "center", maxLines: 1, background: "none", layerOrder: "above-diagram" },
        visibility: { basis: "semantic-budget", startCueId: "title-presentation", endCueId: "title-presentation", retention: "hold for the title read", reason: "Name the visual presentation before links begin." },
        readingWindow: { startCueId: "title-presentation", endCueId: "title-presentation", holdAcrossCues: false, reason: "The title is a short familiar phrase on a clear background." },
        requiresReading: true,
        consumerRefs: [{ implementationPlanId: "relationship-route", mappingId: "relationship-consumer" }],
      }],
    },
    actionIds: ["reveal-links"],
  }];
  presentUnit.actions[0].triggerCueIds = ["title-presentation"];
  presentUnit.actions[0].timing = { basis: "semantic-budget", startCueId: "title-presentation", endCueId: "title-presentation", relationship: "The presentation title resolves before relation lines start." };
  presentUnit.sound = { intent: { voice: "none", sfx: "none", music: "none" }, reason: "Explicitly source-free and silent presentation.", voiceTrackIds: [], eventIds: [], trackIds: [] };
  const voicePhotoPath = path.join(built.root, "voice-photo.png");
  await fs.copyFile(path.join(sourceEvidenceDir, "f2-structured-keyframe.png"), voicePhotoPath);
  const voicePhoto = { id: "voice-photo-reference", kind: "visual-reference", role: "visual reference photograph; file happens to be named voice-photo.png", path: voicePhotoPath, sha256: sha256(await fs.readFile(voicePhotoPath)) };
  presentation.inputs.sourceMaterials.push(voicePhoto);
  presentation.viewingUnits[0].sourceRefs.push({ materialId: voicePhoto.id, locator: "full image", kind: "visual reference" });
  presentUnit.sourceAnchors.push({ materialId: voicePhoto.id, locator: "full image", kind: "visual reference" });
  const silentAudioPlanPath = path.join(built.root, "presentation-audio-plan.json");
  const silentAudioPlan = { schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 1, sampleRate: 48000, channels: 2, events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [] };
  await writeJson(silentAudioPlanPath, silentAudioPlan);
  presentation.inputs.audioPlan = { path: silentAudioPlanPath, sha256: sha256(await fs.readFile(silentAudioPlanPath)) };
  const presentationPath = path.join(built.root, "source-free-presentation.json");
  await writeJson(presentationPath, presentation);
  const presentationResult = invoke(productionPlanCli, ["validate", "--plan", presentationPath, "--stage", "direction"]);
  assertCliOk(presentationResult, "a visual reference named voice-photo.png does not invent narration; a hashed silent audio plan confirms no voice bus");

  const hiddenVoice = structuredClone(presentation);
  const hiddenVoicePlan = { ...silentAudioPlan, tracks: [{ id: "recorded-voice", assetId: "voice-bytes", bus: "voice" }], voiceWindows: [{ id: "voice-window", trackId: "recorded-voice", startSec: 0, endSec: 1 }] };
  const hiddenVoicePlanPath = path.join(built.root, "voice-plan-cannot-be-none.json");
  await writeJson(hiddenVoicePlanPath, hiddenVoicePlan);
  hiddenVoice.inputs.audioPlan = { path: hiddenVoicePlanPath, sha256: sha256(await fs.readFile(hiddenVoicePlanPath)) };
  const hiddenVoicePath = path.join(built.root, "voice-bus-cannot-be-none.json");
  await writeJson(hiddenVoicePath, hiddenVoice);
  const hiddenVoiceResult = invoke(productionPlanCli, ["validate", "--plan", hiddenVoicePath, "--stage", "direction"]);
  assert.notEqual(hiddenVoiceResult.status, 0, "narration:none cannot hide the actual declared voice bus/window");
  assert.match(hiddenVoiceResult.stderr, /conflicts with actual audio-plan voice bus tracks\/windows/);

  const scriptOnly = structuredClone(built.plan);
  delete scriptOnly.inputs.asrcut;
  const scriptFile = path.join(built.root, "unrecorded-script.txt");
  await fs.writeFile(scriptFile, "第三层是\n基础设施。\n");
  scriptOnly.inputs.sourceMaterials.push({ id: "unrecorded-script", kind: "script", role: "selected unrecorded narration text", path: scriptFile, sha256: sha256(await fs.readFile(scriptFile)) });
  scriptOnly.viewingUnits[0].sourceRefs.push({ materialId: "unrecorded-script", locator: "lines 1-2", kind: "narration script" });
  scriptOnly.directorDesign.units[0].sourceAnchors.push({ materialId: "unrecorded-script", locator: "lines 1-2", kind: "narration script" });
  scriptOnly.directorDesign.narration = {
    mode: "script-only", reason: "This selected script has no recording yet, so its cue timing remains semantic and unsynchronized.",
    scriptSelections: [{ materialId: "unrecorded-script", lineStart: 1, lineEnd: 2 }],
  };
  scriptOnly.directorDesign.globalSettings.textStyles = [];
  scriptOnly.directorDesign.units[0].scriptCues = [
    { id: "script-cue-1", source: { kind: "script-line-range", materialId: "unrecorded-script", lineStart: 1, lineEnd: 1, exactText: "第三层是" }, continuityIn: "从上句的层级编号继续建立新的说明对象。", continuityOut: "中心节点停在左中位置，右侧留白供下一句接入关系对象。", visualNarration: "第三层的中心节点在左中位置出现，右侧留出关系空间。", screenText: { mode: "none", reason: "图形关系承载讲述，不复制整句字幕。" }, actionIds: ["reveal-links"] },
    { id: "script-cue-2", source: { kind: "script-line-range", materialId: "unrecorded-script", lineStart: 2, lineEnd: 2, exactText: "基础设施。" }, continuityIn: "承接上一句建立的第三层节点，给出它的具体身份。", continuityOut: "中心和两个支撑节点均停稳；稿件结束后无下一 cue。", visualNarration: "两个支撑节点和箭头接入中心节点，完整关系图停住以便阅读。", screenText: { mode: "none", reason: "不重复口播；保留图形结果供理解。" }, actionIds: ["reveal-links"] },
  ];
  scriptOnly.directorDesign.units[0].actions[0].triggerCueIds = ["script-cue-1", "script-cue-2"];
  scriptOnly.directorDesign.units[0].actions[0].timing = { basis: "semantic-budget", startCueId: "script-cue-1", endCueId: "script-cue-2", relationship: "Two unsynchronized semantic beats; final hold lasts until the relation can be read." };
  const scriptOnlyPath = path.join(built.root, "unrecorded-script-only.json");
  await writeJson(scriptOnlyPath, scriptOnly);
  const scriptOnlyResult = invoke(productionPlanCli, ["validate", "--plan", scriptOnlyPath, "--stage", "direction"]);
  assertCliOk(scriptOnlyResult, "unrecorded script-line ranges are preserved without fabricated sample times");
});

test("production-plan/3 allows a concrete search/acquisition task before a source is selected and ties sync cues to action phases", async () => {
  const runId = "v3-unselected-source-" + Date.now() + "-" + process.pid;
  const { planPath, plan } = await buildV3DirectionPlan(runId, { pendingMusic: true, unselectedMusic: true });
  const pending = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "direction"]);
  assertCliOk(pending, "unselected but actionable resource search remains a valid Analysis design task");
  const pendingIds = JSON.parse(pending.stdout);
  assert.match(pendingIds.directorDesignIdentitySha256, /^[a-f0-9]{64}$/);
  assert.match(pendingIds.filmDesignIdentitySha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.directorDesign.resourceTasks[0].selection, null,
    "Analysis does not invent a source URL or asset ID before searching and hearing a real candidate");

  const selectedLater = structuredClone(plan);
  selectedLater.directorDesign.resourceTasks[0].selection = {
    kind: "audio", assetId: "catalog.example-explanation-bed",
    sourceUrl: "https://example.invalid/sounds/explanation-bed", license: "CC0-1.0",
  };
  const selectedPath = path.join(path.dirname(planPath), "candidate-selected-after-search.json");
  await writeJson(selectedPath, selectedLater);
  const selected = invoke(productionPlanCli, ["validate", "--plan", selectedPath, "--stage", "direction"]);
  assertCliOk(selected, "choosing a real candidate is a deliberate design revision");
  const selectedIds = JSON.parse(selected.stdout);
  assert.notEqual(selectedIds.directorDesignIdentitySha256, pendingIds.directorDesignIdentitySha256);
  assert.equal(selectedIds.filmDesignIdentitySha256, pendingIds.filmDesignIdentitySha256,
    "selecting a non-synchronized audio asset does not create a false Film dependency");

  const synced = structuredClone(selectedLater);
  synced.directorDesign.units[0].sound.syncCues = [{
    kind: "audio-track", id: "relationship-music", actionId: "reveal-links", phase: "change",
    relationship: "A quiet musical arrival follows the moment the second link completes.",
  }];
  const syncedPath = path.join(path.dirname(planPath), "sync-cue-bound-to-action.json");
  await writeJson(syncedPath, synced);
  const validSync = invoke(productionPlanCli, ["validate", "--plan", syncedPath, "--stage", "direction"]);
  assertCliOk(validSync, "synchronized sound cue references the actual planned track and existing motion phase");
  assert.notEqual(JSON.parse(validSync.stdout).filmDesignIdentitySha256, selectedIds.filmDesignIdentitySha256,
    "an explicit AV phase relationship changes the Film reuse identity");

  const invalid = structuredClone(synced);
  invalid.directorDesign.units[0].sound.syncCues[0].phase = "enter";
  const invalidPath = path.join(path.dirname(planPath), "sync-cue-wrong-phase.json");
  await writeJson(invalidPath, invalid);
  const rejected = invoke(productionPlanCli, ["validate", "--plan", invalidPath, "--stage", "direction"]);
  assert.notEqual(rejected.status, 0, "a sync cue cannot invent an action phase or a second free-form timestamp");
  assert.match(rejected.stderr, /phase must match its referenced action phase/);

  const scopeMismatch = structuredClone(plan);
  const followUpId = "relationship-follow-up";
  const followUpRouteId = "relationship-follow-up-route";
  scopeMismatch.viewingUnits[0].nextUnitId = followUpId;
  scopeMismatch.viewingUnits.push({
    id: followUpId,
    sourceRefs: structuredClone(scopeMismatch.viewingUnits[0].sourceRefs),
    task: "Continue the explanation in a separate viewing unit.",
    completionSignal: "The viewer can follow the second unit independently.",
  });
  const followUpRoute = structuredClone(scopeMismatch.implementationPlan[0]);
  followUpRoute.id = followUpRouteId;
  followUpRoute.viewingUnitIds = [followUpId];
  followUpRoute.filmSegmentId = "relationship-follow-up-segment";
  followUpRoute.mappingId = "relationship-follow-up-consumer";
  scopeMismatch.implementationPlan.push(followUpRoute);
  const followUpDesign = structuredClone(scopeMismatch.directorDesign.units[0]);
  followUpDesign.viewingUnitId = followUpId;
  followUpDesign.scriptCues = followUpDesign.scriptCues.filter((cue) => cue.id === "cue-result").map((cue) => ({ ...cue, actionIds: ["reveal-follow-up"] }));
  scopeMismatch.directorDesign.units[0].scriptCues = scopeMismatch.directorDesign.units[0].scriptCues.filter((cue) => cue.id !== "cue-result");
  scopeMismatch.directorDesign.units[0].scriptCues[0].screenText.items[0].visibility.endCueId = "cue-definition";
  scopeMismatch.directorDesign.units[0].scriptCues[0].screenText.items[0].visibility.endOffsetSamples = 24000;
  scopeMismatch.directorDesign.units[0].scriptCues[0].screenText.items[0].readingWindow.endCueId = "cue-definition";
  followUpDesign.implementationPlanIds = [followUpRouteId];
  followUpDesign.objects = followUpDesign.objects.map((item) => ({
    ...item,
    consumerRefs: item.consumerRefs.map((ref) => ({ ...ref, implementationPlanId: followUpRouteId })),
    movableParts: item.movableParts.map((part) => ({
      ...part, consumerRefs: part.consumerRefs.map((ref) => ({ ...ref, implementationPlanId: followUpRouteId })),
    })),
  }));
  followUpDesign.actions = followUpDesign.actions.map((action) => ({
    ...action,
    id: "reveal-follow-up",
    triggerCueIds: ["cue-result"],
    timing: { basis: "canonical-target-samples", startCueId: "cue-result", endCueId: "cue-result", startOffsetSamples: 0, endOffsetSamples: 0, relationship: "The completed relation holds on the final spoken cue before handoff." },
    implementationPlanIds: [followUpRouteId],
  }));
  followUpDesign.transition.targetViewingUnitId = null;
  followUpDesign.sound = {
    intent: { voice: "planned", sfx: "none", music: "none" },
    reason: "The last narration cue remains on the same locked voice track; no second music consumer is added.",
    voiceTrackIds: ["locked-narration"], eventIds: [], trackIds: [], syncCues: [],
  };
  scopeMismatch.directorDesign.units[0].actions[0].triggerCueIds = ["cue-definition", "cue-link"];
  scopeMismatch.directorDesign.units[0].actions[0].timing = { basis: "canonical-target-samples", startCueId: "cue-definition", endCueId: "cue-link", startOffsetSamples: 0, endOffsetSamples: 0, relationship: "The two first cues build the relation before the final handoff." };
  scopeMismatch.directorDesign.units[0].transition.targetViewingUnitId = followUpId;
  scopeMismatch.directorDesign.units.push(followUpDesign);
  scopeMismatch.directorDesign.resourceTasks.push({
    id: "follow-up-image-search",
    role: "supporting image for the second unit",
    requirement: "A source-bound image that supports the second explanation unit.",
    viewingUnitIds: [followUpId], actionIds: ["reveal-follow-up"],
    sourceQueries: [{ source: "licensed stock source", query: "a suitable supporting image" }],
    selectionCriteria: ["Check visual relevance and the actual usage terms."],
    acquisitionPlan: {
      owner: "laohu-image", method: "Search a suitable licensed source and select only after reviewing the real candidate.",
      retrievalSteps: ["Search the source with the stated query.", "Download the selected original and its source evidence."],
      processingSteps: ["Record the actual file hash and prepare the image for the named Film consumer."],
      rightsChecks: ["Check source redistribution separately from use in the finished video."],
      acceptanceChecks: ["Confirm the named Film consumer uses the selected image."],
      failureAction: "Keep pending and search another candidate.",
    },
    consumerTargets: [{ kind: "film-mapping", implementationPlanId: "relationship-route" }],
    selection: null, status: "pending",
  });
  const scopeMismatchPath = path.join(path.dirname(planPath), "resource-task-wrong-viewing-unit-consumer.json");
  await writeJson(scopeMismatchPath, scopeMismatch);
  const disconnectedResource = invoke(productionPlanCli, ["validate", "--plan", scopeMismatchPath, "--stage", "direction"]);
  assert.notEqual(disconnectedResource.status, 0, "a resource task cannot name one viewing unit/action while pointing only to a consumer used by another unit/action");
  assert.match(disconnectedResource.stderr, /Film consumer relationship-route is not used by any declared viewingUnitId or actionId/);
});

test("styles preview binds F2 --content-json through the registered source function", async (t) => {
  const browser = process.env.MOTION_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  try { await fs.access(browser); } catch {
    t.skip("requires an existing Chrome/Chromium for the source-function still preview; this test does not install a browser");
    return;
  }
  const runId = "style-cli-content-" + Date.now() + "-" + process.pid;
  const contentPath = path.join(sourceEvidenceDir, "f2-structured-content.json");
  const contentBytes = await fs.readFile(contentPath);
  const outputDir = path.join(evidenceRoot, "production-plan-eval", runId);
  const outputPath = path.join(outputDir, "f2-key-state.png");
  const manifestPath = path.join(outputDir, "f2-key-state.manifest.json");
  await fs.mkdir(outputDir, { recursive: true });
  const result = invoke(templatesCli, [
    "styles", "preview", "--query", "F2", "--content-json", contentPath,
    "--output", outputPath, "--manifest", manifestPath, "--time", "1", "--work-root", repoRoot, "--browser", browser,
  ], { timeout: 240_000 });
  assertCliOk(result, "F2 --content-json source-function still preview");
  const receipt = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(receipt.output.path, outputPath);
  assert.equal(receipt.contentBinding.status, "structured-content-bound");
  assert.equal(receipt.contentBinding.demoMode, false);
  assert.equal(receipt.contentBinding.contentSource.path, contentPath);
  assert.equal(receipt.contentBinding.contentSource.sha256, sha256(contentBytes));
  assert.ok(receipt.contentBinding.consumedFields.includes("edges[].label"));
  assert.equal(receipt.sourceCode.kind, "source-preserving-literal-adaptation");
  assert.ok(receipt.sourceCode.derivedPatch.derivedCodeSha256);
  assert.ok((await fs.stat(outputPath)).size > 0);
});

test("production-plan labels a technical probe and keeps its direction result outside formal production", async () => {
  const runId = "preflight-" + Date.now() + "-" + process.pid;
  const { planPath } = await buildF2Plan(runId);
  const inputs = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "inputs"]);
  assertCliOk(inputs, "inputs-stage validation");
  assert.equal(JSON.parse(inputs.stdout).nextStage, "direction");
  const direction = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "direction"]);
  assertCliOk(direction, "direction-stage validation");
  const probeResult = JSON.parse(direction.stdout);
  assert.equal(probeResult.resultClass, "technical-probe-validation");
  assert.equal(probeResult.probeOnly, true);
  assert.equal(probeResult.deliveryStatus, "technical-probe-only");
  assert.equal(probeResult.formalDelivery, false);
  assert.equal(probeResult.nextStage, "technical-probe-only");
  assert.equal(probeResult.outputs, null);
  assert.match(probeResult.route, /no render, mix, mux, or formal-delivery route/);
  const production = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "production"]);
  assert.notEqual(production.status, 0, "a technical probe cannot validate as an ordinary production plan");
  assert.match(production.stderr, /technical-probe is intentionally limited/);
  assert.match(production.stderr, /low-level renderer\/component preview/);
  assert.match(production.stderr, /new-direction.*locked-local.*evidence-local/);
  assert.match(production.stderr, /Do not relabel directionMode/);

  const demoRunId = "demo-" + Date.now() + "-" + process.pid;
  const demo = await buildF2Plan(demoRunId, { demoReceipt: true });
  await markF2PlanAsNewDirection(demo.plan);
  await writeJson(demo.planPath, demo.plan);
  const rejected = invoke(productionPlanCli, ["validate", "--plan", demo.planPath, "--stage", "production"]);
  assert.notEqual(rejected.status, 0, "production validation must reject a receipt marked as demo content");
  assert.match(rejected.stderr, /still uses demo|demoMode/i);

  const candidateRunId = "candidate-no-authorization-" + Date.now() + "-" + process.pid;
  const candidate = await buildF2Plan(candidateRunId, { candidateAudio: true });
  await markF2PlanAsNewDirection(candidate.plan);
  await writeJson(candidate.planPath, candidate.plan);
  const noAuthorization = invoke(productionPlanCli, ["run", "--plan", candidate.planPath, "--work-root", repoRoot]);
  assert.notEqual(noAuthorization.status, 0, "an unreviewed candidate must not be consumed without the explicit preview CLI flag");
  assert.match(noAuthorization.stderr, /--allow-unreviewed-preview/);
  await assert.rejects(fs.access(path.resolve(path.dirname(candidate.planPath), candidate.plan.outputs.picture)), { code: "ENOENT" });
});

test("the reproduced F2/Film 2 technical-probe shape cannot enter production render, mix, or mux", async () => {
  const runId = "technical-probe-production-block-" + Date.now() + "-" + process.pid;
  const { planPath, plan } = await buildF2Plan(runId);
  assert.equal(plan.work.directionMode, "technical-probe");
  assert.deepEqual(plan.directionDecisions[0].decisionInputs, []);
  assert.equal(plan.styleLibraryReview, undefined);

  const probe = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "direction"]);
  assertCliOk(probe, "direction-only technical probe validation");
  assert.equal(JSON.parse(probe.stdout).nextStage, "technical-probe-only");
  assert.equal(JSON.parse(probe.stdout).outputs, null);

  const commands = ["run", "render-film", "render-audio"];
  for (const command of commands) {
    const rejected = invoke(productionPlanCli, [command, "--plan", planPath, "--work-root", repoRoot]);
    assert.notEqual(rejected.status, 0, `${command} must reject a technical-probe plan before any renderer/mixer starts`);
    assert.match(rejected.stderr, /technical-probe is intentionally limited/);
    assert.match(rejected.stderr, /STAGE_FAIL technical-probe-boundary/);
    assert.match(rejected.stderr, /REDO_REASON .*preview\/render/);
    assert.match(rejected.stderr, /new-direction.*locked-local.*evidence-local/);
    assert.match(rejected.stderr, /不要伪改 directionMode/);
    assert.doesNotMatch(rejected.stderr, /先修复 production-plan 的具体结构/);
    assert.doesNotMatch(rejected.stdout + rejected.stderr, /PRODUCTION_PLAN_RECEIPT/,
      `${command} must not issue an ordinary production-run receipt for a technical probe`);
  }
  for (const output of Object.values(plan.outputs)) {
    await assert.rejects(fs.access(path.resolve(path.dirname(planPath), output)), { code: "ENOENT" }, `${output} must not be emitted by a technical probe`);
  }
});

test("new aesthetic directions require complete source-library review and a cited mechanism mapped to the selected Film consumer", async () => {
  const runId = "new-direction-gate-" + Date.now() + "-" + process.pid;
  const { planPath, plan } = await buildF2Plan(runId);
  plan.work.directionMode = "new-direction";
  const decision = plan.directionDecisions[0];
  decision.mode = "new-direction";

  const noReviewPath = path.join(path.dirname(planPath), "new-direction-no-review.json");
  await writeJson(noReviewPath, plan);
  const noReview = invoke(productionPlanCli, ["validate", "--plan", noReviewPath, "--stage", "direction"]);
  assert.notEqual(noReview.status, 0, "new direction without complete style-library coverage must fail before production");
  assert.match(noReview.stderr, /styleLibraryReview|complete styles fulltext/i);

  const fullReview = await readStyleLibraryByPages();
  assert.equal(fullReview.reviewedIds.length, 73, "the full review includes all formal ordinary style reference IDs");
  assert.ok(fullReview.pageCount > 1);
  plan.styleLibraryReview = fullReview.reviewReceipt;

  const emptyInputsPath = path.join(path.dirname(planPath), "new-direction-empty-inputs.json");
  await writeJson(emptyInputsPath, plan);
  const emptyInputs = invoke(productionPlanCli, ["validate", "--plan", emptyInputsPath, "--stage", "direction"]);
  assert.notEqual(emptyInputs.status, 0, "a complete page receipt alone is not direction evidence");
  assert.match(emptyInputs.stderr, /decisionInputs.*non-empty array|decisionInputs:\[\]|at least one original style passage/);

  await markF2PlanAsNewDirection(plan);
  const validPath = path.join(path.dirname(planPath), "new-direction-valid.json");
  await writeJson(validPath, plan);
  const valid = invoke(productionPlanCli, ["validate", "--plan", validPath, "--stage", "direction"]);
  assertCliOk(valid, "reviewed direction tied to the selected style consumer");
  assert.equal(JSON.parse(valid.stdout).completeThroughStage, "direction");

  const f2 = JSON.parse(await fs.readFile(path.join(skillDir, "templates", "styles", "compatibility-index.json"), "utf8"))
    .entries.find((row) => row.id === "F2");
  const blankSourcePath = path.join(path.dirname(planPath), "new-direction-blank-source-location.json");
  const blankSourcePlan = structuredClone(plan);
  blankSourcePlan.directionDecisions[0].decisionInputs[1].sourceLocation = { path: f2.contentPath, lineStart: 2, lineEnd: 2 };
  await writeJson(blankSourcePath, blankSourcePlan);
  const blankSource = invoke(productionPlanCli, ["validate", "--plan", blankSourcePath, "--stage", "direction"]);
  assert.notEqual(blankSource.status, 0, "the source locator must point to actual source text");
  assert.match(blankSource.stderr, /must include original source text/);

  const stalePath = path.join(path.dirname(planPath), "new-direction-stale-review.json");
  const stalePlan = structuredClone(plan);
  stalePlan.styleLibraryReview.pageCount += 1;
  await writeJson(stalePath, stalePlan);
  const stale = invoke(productionPlanCli, ["validate", "--plan", stalePath, "--stage", "direction"]);
  assert.notEqual(stale.status, 0, "a hand-edited/incomplete review receipt cannot pass the direction gate");
  assert.match(stale.stderr, /does not match a complete paginated read/i);

  const unmappedPath = path.join(path.dirname(planPath), "new-direction-unmapped-style.json");
  const unmappedPlan = structuredClone(plan);
  unmappedPlan.directionDecisions[0].decisionInputs[1].consumerMappings[0].mappingId = "not-a-film-mapping";
  await writeJson(unmappedPath, unmappedPlan);
  const unmapped = invoke(productionPlanCli, ["validate", "--plan", unmappedPath, "--stage", "direction"]);
  assert.notEqual(unmapped.status, 0, "a source citation not connected to a real selected Film consumer must fail");
  assert.match(unmapped.stderr, /absent from shot/);
});

test("locked-local requires a hash-checked source locator containing the user's decision and scope", async () => {
  const runId = "locked-local-source-" + Date.now() + "-" + process.pid;
  const { root, planPath, plan } = await buildF2Plan(runId);
  plan.work.directionMode = "locked-local";
  plan.directionDecisions[0].mode = "locked-local";
  const decisionText = "本轮用户明确要求保留 F2 关系图方向，仅更新关系标签。";
  const scope = "保留关系图方向，只替换用户指定的关系标签。";
  const decisionRecordPath = path.join(root, "user-decision-record.md");
  await fs.writeFile(decisionRecordPath, "# 用户方向锁定\n\n" + decisionText + "\n");
  plan.inputs.sourceMaterials.push({
    id: "user-direction-lock", kind: "user-decision-record", role: "verbatim user direction lock",
    path: decisionRecordPath, sha256: sha256(await fs.readFile(decisionRecordPath)),
  });
  plan.directionDecisions[0].userLockRef = {
    sourceMaterialId: "user-direction-lock",
    locator: { lineStart: 3, lineEnd: 3 },
    userDecision: decisionText,
    scope,
  };
  await writeJson(planPath, plan);
  const valid = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "direction"]);
  assertCliOk(valid, "source-located locked user direction");
  assert.equal(JSON.parse(valid.stdout).nextStage, "production");

  const legacyPath = path.join(root, "locked-local-legacy-string.json");
  const legacy = structuredClone(plan);
  legacy.directionDecisions[0].userLockRef = "user asked to keep the F2 direction";
  await writeJson(legacyPath, legacy);
  const legacyRejected = invoke(productionPlanCli, ["validate", "--plan", legacyPath, "--stage", "direction"]);
  assert.notEqual(legacyRejected.status, 0, "a free-form/model-authored lock label cannot stand in for the source decision");
  assert.match(legacyRejected.stderr, /no longer accepts a free-form string/);

  const inventedQuotePath = path.join(root, "locked-local-invented-quote.json");
  const inventedQuote = structuredClone(plan);
  inventedQuote.directionDecisions[0].userLockRef.userDecision = "用户要求彻底换成金融图表。";
  await writeJson(inventedQuotePath, inventedQuote);
  const quoteRejected = invoke(productionPlanCli, ["validate", "--plan", inventedQuotePath, "--stage", "direction"]);
  assert.notEqual(quoteRejected.status, 0, "the recorded user decision must appear at the exact pinned source locator");
  assert.match(quoteRejected.stderr, /must quote text present inside its exact source-material locator/);
});

test("production-plan accepts only a source-bound native OM key state whose original Film variables match", async (t) => {
  const runId = "native-om-proof-" + Date.now() + "-" + process.pid;
  const browser = process.env.MOTION_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  try { await fs.access(browser); } catch {
    t.skip("requires an existing Chrome/Chromium for the native source preview; this test does not install a browser");
    return;
  }
  const ffmpeg = await bundledFfmpegPair(runId);
  const workRoot = path.join(evalTmpRoot, "native-om", runId);
  const evidenceDir = path.join(evidenceRoot, "production-plan-eval", runId, "native-om");
  await fs.mkdir(workRoot, { recursive: true });
  await fs.mkdir(evidenceDir, { recursive: true });
  const templateId = "laohu-motion-finance-chart";
  const variables = {
    duration: 2, title: "收入变化", unit: "单位：亿元", source: "来源：技术夹具", badge: "示例数据",
    series: JSON.stringify([{ label: "A", value: 10 }, { label: "B", value: 18 }]),
    chart: "bar", highlightIndex: 1, highlightText: "1.8倍", highlightSub: "18 ÷ 10",
    mainColor: "#006ba2", dimColor: "#c6d2d8",
  };
  const inputPath = path.join(evidenceDir, "native-input.json");
  const projectPath = path.join(workRoot, "projects", templateId);
  const preparedSpecPath = path.join(projectPath, "laohu-native-template.json");
  const imagePath = path.join(evidenceDir, "native-key-state.png");
  const rendererReceiptPath = path.join(evidenceDir, "native-key-state.manifest.json");
  await writeJson(inputPath, { format: "laohu.huashu-native-template-spec/1", templateId, width: 1920, height: 1080, fps: 30, variables });
  const prepared = invoke(templatesCli, [
    "prepare", templateId, "--input", inputPath, "--output", projectPath, "--work-root", workRoot,
    "--browser", browser, "--ffmpeg", ffmpeg,
  ], { timeout: 240_000 });
  assertCliOk(prepared, "native OM project prepare for key-state proof");
  const preview = invoke(templatesCli, [
    "preview", templateId, "--spec", preparedSpecPath, "--output", imagePath, "--time", "1",
    "--work-root", workRoot, "--manifest", rendererReceiptPath, "--browser", browser, "--ffmpeg", ffmpeg,
  ], { timeout: 240_000 });
  assertCliOk(preview, "native OM actual source key-state preview");
  const previewReceipt = JSON.parse(await fs.readFile(rendererReceiptPath, "utf8"));
  assert.equal(previewReceipt.preparedSpecSha256, sha256(await fs.readFile(preparedSpecPath)));
  assert.equal(previewReceipt.media.path, imagePath);
  assert.equal(previewReceipt.sourceVerification.ok, true);

  const blueprintPath = path.join(evidenceDir, "film-blueprint.json");
  const audioPath = path.join(evidenceDir, "audio-plan.json");
  const blueprint = {
    format: "laohu.huashu-film-blueprint/1", width: 1920, height: 1080, fps: 30,
    clock: { kind: "film-global", durationSec: 2 },
    segments: [{ id: "native-finance", renderer: "laohu-native-om-template", templateId, variables, startSec: 0, endSec: 2 }],
  };
  const audioPlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 2, sampleRate: 48000, channels: 2,
    events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [],
  };
  await writeJson(blueprintPath, blueprint);
  await writeJson(audioPath, audioPlan);
  const decisionText = "本轮用户明确要求保留原生金融图表方向，仅更新指定的高亮分类。";
  const decisionRecordPath = path.join(evidenceDir, "user-direction-lock.md");
  await fs.writeFile(decisionRecordPath, "# 用户方向锁定\n\n" + decisionText + "\n");
  const plan = {
    format: "laohu.motion.production-plan/1",
    work: { id: runId, title: "Native OM key-state proof", directionMode: "locked-local" },
    inputs: {
      sourceMaterials: [
        { id: "native-chart-input", kind: "native-om-source-input", role: "original chart values and title", path: inputPath, sha256: sha256(await fs.readFile(inputPath)) },
        { id: "user-direction-lock", kind: "user-decision-record", role: "verbatim user direction lock", path: decisionRecordPath, sha256: sha256(await fs.readFile(decisionRecordPath)) },
      ],
      filmBlueprint: { path: blueprintPath, sha256: sha256(await fs.readFile(blueprintPath)) },
      audioPlan: { path: audioPath, sha256: sha256(await fs.readFile(audioPath)) },
    },
    directionDecisions: [{
      id: "native-chart-choice", mode: "locked-local", rationale: "The source chart consumes the original quantitative controls needed by this viewing unit.",
      userLockRef: { sourceMaterialId: "user-direction-lock", locator: { lineStart: 3, lineEnd: 3 }, userDecision: decisionText,
        scope: "Keep the source chart direction; update only the specified highlight." },
      candidates: [{
        id: "native-finance-chart", resourceType: "template", resourceId: templateId,
        fitReason: "The registered native OM chart receives this unit's title, data series and highlight through its original controls.",
        keyStateEvidence: [{
          phase: "mid-chart key state", path: imagePath, sha256: sha256(await fs.readFile(imagePath)),
          observation: "The actual source preview receipt binds the registered native OM source, exact prepared project index and original Film variable values.",
          rendererReceipt: { path: rendererReceiptPath, sha256: sha256(await fs.readFile(rendererReceiptPath)) },
          filmSegmentId: "native-finance", mappingId: "native-finance-base",
        }],
      }],
      selectedCandidateId: "native-finance-chart",
    }],
    viewingUnits: [{
      id: "finance-comparison", sourceRefs: [{ materialId: "native-chart-input", locator: "variables.series", kind: "source variables" }],
      task: "Show the change between the two values.", completionSignal: "The viewer can read the chart values and identify the highlighted category.",
    }],
    shots: [{
      id: "native-finance-shot", viewingUnitIds: ["finance-comparison"], decisionId: "native-chart-choice",
      filmSegmentId: "native-finance", visualIntent: "Keep both source chart values legible and preserve the source highlight.",
      subjects: [], screenText: [], phases: {},
      audioIntent: { choice: "none", reason: "The native source key-state is a visual verification fixture.", eventIds: [] },
      sourceMappings: [{
        id: "native-finance-base", role: "base", segmentId: "native-finance", renderer: "laohu-native-om-template",
        resourceType: "template", resourceId: templateId, consumerFields: ["templateId", "variables"],
      }],
    }],
    verification: { gates: [{
      id: "native-input-binding", inspect: "Compare the exact source preview receipt, project index hash and Film variables.",
      evidence: "Native OM preview manifest and production-plan validation output.", redoReason: "Rebuild the key state from the Film segment's exact source variables.",
    }] },
    outputs: {
      picture: "outputs/native-finance.mp4", filmManifest: "outputs/native-finance-film.json", audioWav: "outputs/native-finance.wav",
      audioManifest: "outputs/native-finance-audio.json", finalVideo: "outputs/native-finance-final.mp4",
    },
  };
  const planPath = path.join(evidenceDir, "production-plan.json");
  await writeJson(planPath, plan);
  const valid = invoke(productionPlanCli, ["validate", "--plan", planPath, "--stage", "production"]);
  assertCliOk(valid, "native OM preview bound to Film /1 source variables");
  assert.equal(JSON.parse(valid.stdout).route, "Film Blueprint /1 -> templates.mjs; audio-plan/1 -> audio.mjs");

  const changedBlueprint = structuredClone(blueprint);
  changedBlueprint.segments[0].variables.title = "未重新预演的标题";
  const changedBlueprintPath = path.join(evidenceDir, "film-blueprint-changed.json");
  await writeJson(changedBlueprintPath, changedBlueprint);
  const changedPlan = structuredClone(plan);
  changedPlan.inputs.filmBlueprint = { path: changedBlueprintPath, sha256: sha256(await fs.readFile(changedBlueprintPath)) };
  const changedPlanPath = path.join(evidenceDir, "production-plan-changed.json");
  await writeJson(changedPlanPath, changedPlan);
  const rejected = invoke(productionPlanCli, ["validate", "--plan", changedPlanPath, "--stage", "production"]);
  assert.notEqual(rejected.status, 0, "a source preview cannot certify changed Film content");
  assert.match(rejected.stderr, /variables\.title value/);
});

test("Film /1 verifies the registered child renderer receipt against its existing segment MP4", async (t) => {
  const evidenceDir = path.join(repoRoot, ".cache", "validation", "motion-production-upgrade", "ordinary");
  const planPath = path.join(evidenceDir, "production-plan.json");
  const filmManifestPath = path.join(evidenceDir, "film-manifest.json");
  let plan;
  try {
    plan = JSON.parse(await fs.readFile(planPath, "utf8"));
    await fs.access(filmManifestPath);
    await fs.access(path.resolve(evidenceDir, plan.outputs.picture));
  } catch {
    t.skip("requires the already-rendered ordinary Film /1 sample under .cache/validation; this test does not render segments");
    return;
  }
  const technicalReceiptPlan = structuredClone(plan);
  technicalReceiptPlan.work.directionMode = "technical-probe";
  for (const decision of technicalReceiptPlan.directionDecisions || []) decision.mode = "technical-probe";
  for (const material of technicalReceiptPlan.inputs.sourceMaterials || []) material.path = path.resolve(evidenceDir, material.path);
  for (const key of ["filmBlueprint", "audioPlan", "audioScene", "assetIndex"]) {
    if (technicalReceiptPlan.inputs[key]?.path) technicalReceiptPlan.inputs[key].path = path.resolve(evidenceDir, technicalReceiptPlan.inputs[key].path);
  }
  if (technicalReceiptPlan.inputs.assetIndex?.path) {
    technicalReceiptPlan.inputs.assetIndex.sha256 = sha256(await fs.readFile(technicalReceiptPlan.inputs.assetIndex.path));
  }
  if (technicalReceiptPlan.inputs.asrcut) {
    for (const key of ["timeline", "editPlan"]) technicalReceiptPlan.inputs.asrcut[key].path = path.resolve(evidenceDir, technicalReceiptPlan.inputs.asrcut[key].path);
  }
  for (const decision of technicalReceiptPlan.directionDecisions || []) {
    for (const candidate of decision.candidates || []) {
      for (const proof of candidate.keyStateEvidence || []) {
        proof.path = path.resolve(evidenceDir, proof.path);
        if (proof.rendererReceipt?.path) proof.rendererReceipt.path = path.resolve(evidenceDir, proof.rendererReceipt.path);
      }
    }
  }
  const technicalReceiptPlanPath = path.join(evidenceRoot, "legacy-fixtures", "ordinary-film-v1-technical-probe.json");
  await writeJson(technicalReceiptPlanPath, technicalReceiptPlan);
  const validated = await validatePlanFile(technicalReceiptPlanPath, { stage: "direction" });
  assert.equal(validated.plan.work.directionMode, "technical-probe");
  assert.equal(validated.outputs, null);
  await assert.rejects(validatePlanFile(technicalReceiptPlanPath), /technical-probe is intentionally limited/);
  const picturePath = path.resolve(evidenceDir, plan.outputs.picture);
  const accepted = await inspectFilmReceipt(validated, { picture: picturePath, filmManifest: filmManifestPath });
  assert.equal(accepted.segmentCount, 1);
  assert.equal(accepted.segmentReceipts.length, 1);
  assert.equal(accepted.segmentReceipts[0].kind, "native-template-render-evidence");

  const originalManifest = JSON.parse(await fs.readFile(filmManifestPath, "utf8"));
  const originalRow = originalManifest.segments[0];
  const originalChildPath = path.resolve(path.dirname(filmManifestPath), originalRow.receiptPath);
  const childBytes = await fs.readFile(originalChildPath);
  const childReceipt = JSON.parse(childBytes.toString("utf8"));
  assert.equal(accepted.segmentReceipts[0].sha256, sha256(childBytes));
  assert.equal(accepted.segmentReceipts[0].output.sha256, childReceipt.output.sha256);
  const copiedRoot = path.join(evalTmpRoot, "film-v1-child-receipt", Date.now() + "-" + process.pid);
  const copiedChildPath = path.join(copiedRoot, "child-receipt.json");
  const copiedManifestPath = path.join(copiedRoot, "film-manifest-tampered.json");
  await fs.mkdir(copiedRoot, { recursive: true });
  childReceipt.output.sha256 = "0".repeat(64);
  await writeJson(copiedChildPath, childReceipt);
  const tamperedManifest = structuredClone(originalManifest);
  tamperedManifest.output.path = picturePath;
  tamperedManifest.segments[0].renderedOutputPath = path.resolve(path.dirname(filmManifestPath), originalRow.renderedOutputPath);
  tamperedManifest.segments[0].receiptPath = copiedChildPath;
  await writeJson(copiedManifestPath, tamperedManifest);
  await assert.rejects(
    inspectFilmReceipt(validated, { picture: picturePath, filmManifest: copiedManifestPath }),
    /child renderer receipt output SHA-256 differs from the actual segment MP4/,
  );
});

test("run invokes the existing Film /2 renderer and audio-plan mixer and writes actual receipts", async () => {
  const runId = "render-" + Date.now() + "-" + process.pid;
  const { planPath, plan } = await buildF2Plan(runId, { candidateAudio: true });
  await markF2PlanAsNewDirection(plan);
  await writeJson(planPath, plan);
  const ffmpeg = await bundledFfmpegPair(runId);
  const result = invoke(productionPlanCli, ["run", "--plan", planPath, "--work-root", repoRoot, "--ffmpeg", ffmpeg, "--allow-unreviewed-preview"], {
    timeout: 1_200_000,
    tmpdir: path.join(evalTmpRoot, "production-plan-test", runId),
  });
  assertCliOk(result, "production-plan Film /2 + audio.mjs run");
  const marker = result.stdout.match(/^PRODUCTION_PLAN_RECEIPT (.+)$/m);
  assert.ok(marker, "the runner should expose its durable receipt path");
  const receipt = JSON.parse(await fs.readFile(marker[1], "utf8"));
  assert.equal(receipt.completed, true);
  assert.equal(receipt.supportedRoute.filmBlueprint, "/2");
  assert.equal(receipt.supportedRoute.audioPlan, "/1");
  assert.equal(receipt.audioPreview.requested, true);
  assert.deepEqual(receipt.audioPreview.selectedCandidateAssetIds, ["freesound.warm-synth-explanation-bed-530217"]);
  assert.equal(receipt.audioPreview.generatedPreviewAllowed, false);
  assert.deepEqual(receipt.stages.map((row) => row.consumer), [
    "scripts/templates.mjs render --film-blueprint",
    "scripts/audio.mjs --plan",
  ]);
  assert.ok(receipt.artifacts.film.consumerMappingsVerified.includes("style-layer-map"));
  assert.ok(receipt.artifacts.audio.wavSha256);
  assert.equal(receipt.artifacts.audio.technicalPreview, true);
  assert.equal(receipt.artifacts.audio.candidatePreviewAllowed, true);
  assert.equal(receipt.artifacts.audio.generatedPreviewAllowed, false);
  assert.deepEqual(receipt.artifacts.audio.sourceStatuses.map((asset) => [asset.assetId, asset.reviewStatus]), [
    ["freesound.warm-synth-explanation-bed-530217", "candidate-unreviewed"],
  ]);
  const filmManifest = JSON.parse(await fs.readFile(path.resolve(path.dirname(planPath), plan.outputs.filmManifest), "utf8"));
  const styleLayer = filmManifest.segments[0].layers[0];
  assert.equal(styleLayer.props.styleId, "F2");
  assert.equal(styleLayer.contentBinding.status, "structured-content-bound");
  assert.equal(styleLayer.contentBinding.demoMode, false);
  assert.equal(styleLayer.contentBinding.contentSource.sha256, plan.inputs.sourceMaterials[0].sha256);
  assert.equal(styleLayer.contentBinding.contentSha256, JSON.parse(await fs.readFile(path.join(sourceEvidenceDir, "f2-structured-keyframe.manifest.json"), "utf8")).contentBinding.contentSha256);
  assert.equal(receipt.artifacts.audio.finalVideoPath, path.resolve(path.dirname(planPath), plan.outputs.finalVideo));
});

test("production-plan/3 binds synchronized cues to Film while allowing mix-only audio changes to reuse the same Film", async () => {
  const runId = "v3-film-reuse-" + Date.now() + "-" + process.pid;
  const { planPath, plan } = await buildF2Plan(runId, { candidateAudio: true });
  await markF2PlanAsNewDirection(plan);
  await addF2V3DirectorDesign(plan);
  plan.directorDesign.units[0].sound.syncCues = [{
    kind: "audio-track", id: "selected-candidate-explanation-bed", actionId: "draw-source-links", phase: "change",
    relationship: "The track's first arrival supports the relationship map appearing as the links begin to form.",
  }];
  await writeJson(planPath, plan);
  const ffmpeg = await bundledFfmpegPair(runId);

  const wrongComponent = structuredClone(plan);
  wrongComponent.directionDecisions[0].candidates.find((row) => row.id === "f2-map").resourceId = "laohu-media-photo-montage";
  wrongComponent.implementationPlan[0].resourceId = "laohu-media-photo-montage";
  const wrongComponentPath = path.join(path.dirname(planPath), "wrong-style-consumer.json");
  await writeJson(wrongComponentPath, wrongComponent);
  const wrongComponentResult = invoke(productionPlanCli, ["run", "--plan", wrongComponentPath, "--work-root", repoRoot, "--ffmpeg", ffmpeg, "--allow-unreviewed-preview"], {
    timeout: 120_000,
    tmpdir: path.join(evalTmpRoot, "production-plan-test", runId),
  });
  assert.notEqual(wrongComponentResult.status, 0, "a production component without F2 support cannot stand in for the selected style consumer");
  assert.match(wrongComponentResult.stderr, /selected|candidate|consumer|style/);

  const selectedProof = wrongComponent.directionDecisions[0].candidates.find((row) => row.id === "f2-map").keyStateEvidence[0];
  const tamperedReceipt = JSON.parse(await fs.readFile(selectedProof.rendererReceipt.path, "utf8"));
  tamperedReceipt.contentBinding.contentSha256 = "0".repeat(64);
  const tamperedReceiptPath = path.join(sourceEvidenceDir, runId + "-tampered-f2-receipt.json");
  await writeJson(tamperedReceiptPath, tamperedReceipt);
  const tamperedReceiptPlan = structuredClone(plan);
  const proof = tamperedReceiptPlan.directionDecisions[0].candidates.find((row) => row.id === "f2-map").keyStateEvidence[0];
  proof.rendererReceipt = { path: tamperedReceiptPath, sha256: sha256(await fs.readFile(tamperedReceiptPath)) };
  const tamperedReceiptPlanPath = path.join(path.dirname(planPath), "tampered-style-content-receipt.json");
  await writeJson(tamperedReceiptPlanPath, tamperedReceiptPlan);
  const tamperedRun = invoke(productionPlanCli, ["run", "--plan", tamperedReceiptPlanPath, "--work-root", repoRoot, "--ffmpeg", ffmpeg, "--allow-unreviewed-preview"], {
    timeout: 120_000,
    tmpdir: path.join(evalTmpRoot, "production-plan-test", runId),
  });
  assert.notEqual(tamperedRun.status, 0, "the actual F2 consumer path still rejects a key-state receipt whose structured source content hash was changed");
  assert.match(tamperedRun.stderr, /structured-content hash differs from the exact selected source material/);

  const initial = invoke(productionPlanCli, ["run", "--plan", planPath, "--work-root", repoRoot, "--ffmpeg", ffmpeg, "--allow-unreviewed-preview"], {
    timeout: 1_200_000,
    tmpdir: path.join(evalTmpRoot, "production-plan-test", runId),
  });
  assertCliOk(initial, "V3 full Film and audio production run");
  const marker = initial.stdout.match(/^PRODUCTION_PLAN_RECEIPT (.+)$/m);
  assert.ok(marker, "V3 run exposes the actual durable receipt");
  const firstReceipt = JSON.parse(await fs.readFile(marker[1], "utf8"));
  const filmHash = firstReceipt.artifacts.film.sha256;
  const pictureHash = firstReceipt.artifacts.film.picture.sha256;
  assert.match(firstReceipt.designBinding.directorDesignIdentitySha256, /^[a-f0-9]{64}$/);
  assert.match(firstReceipt.designBinding.filmDesignIdentitySha256, /^[a-f0-9]{64}$/);
  assert.match(firstReceipt.designBinding.boundFilmDesignIdentitySha256, /^[a-f0-9]{64}$/);
  assert.equal(firstReceipt.designBinding.synchronizedAudioUses[0].id, "selected-candidate-explanation-bed");
  assert.equal(firstReceipt.inputHashes.audioPlan, plan.inputs.audioPlan.sha256);
  const previewAudioManifest = JSON.parse(await fs.readFile(path.resolve(path.dirname(planPath), plan.outputs.audioManifest), "utf8"));
  assert.deepEqual(previewAudioManifest.tracks.map((row) => [row.id, row.bus, row.assetId]), [
    ["selected-candidate-explanation-bed", "music", "freesound.warm-synth-explanation-bed-530217"],
  ], "the non-empty music-track receipt comes from the actual audio.mjs mix, not a test-authored receipt");
  const formalDelivery = invoke(productionPlanCli, ["verify-delivery", "--plan", planPath, "--ffmpeg", ffmpeg]);
  assert.notEqual(formalDelivery.status, 0, "an explicitly authorized candidate preview can run in production-plan/3 but cannot pass formal delivery");
  assert.match(formalDelivery.stderr, /formal production receipts cannot mark candidate\/generated\/technical-preview audio/,
    "the actual candidate music-track row passed ID/bus/asset matching before formal preview rejection");
  const candidateProductionExport = invoke(productionPlanCli, [
    "export-design", "--plan", planPath, "--output", path.join(path.dirname(planPath), "production", "design", "candidate-preview.md"),
    "--stage", "production", "--ffmpeg", ffmpeg,
  ]);
  assert.notEqual(candidateProductionExport.status, 0, "production export uses the same exact track checker and still rejects real candidate preview use");
  assert.match(candidateProductionExport.stderr, /formal production receipts cannot mark candidate\/generated\/technical-preview audio/);

  const audioPlanPath = path.resolve(path.dirname(planPath), plan.inputs.audioPlan.path);
  const changedAudioPlan = JSON.parse(await fs.readFile(audioPlanPath, "utf8"));
  changedAudioPlan.tracks[0].gainDb = -12;
  const changedAudioPath = path.join(path.dirname(planPath), "mix-only-gain-change.json");
  await writeJson(changedAudioPath, changedAudioPlan);
  const mixOnlyPlan = structuredClone(plan);
  mixOnlyPlan.inputs.audioPlan = { path: changedAudioPath, sha256: sha256(await fs.readFile(changedAudioPath)) };
  mixOnlyPlan.directorDesign.brief.soundAndMix += " 本轮仅将解释床音乐增益降低，画面内容与动作保持不变。";
  mixOnlyPlan.outputs.audioWav = "outputs/" + runId + "-gain-change.wav";
  mixOnlyPlan.outputs.audioManifest = "outputs/" + runId + "-gain-change.manifest.json";
  mixOnlyPlan.outputs.finalVideo = "outputs/" + runId + "-gain-change-final.mp4";
  const mixOnlyPath = path.join(path.dirname(planPath), "mix-only-gain-plan.json");
  await writeJson(mixOnlyPath, mixOnlyPlan);
  const remixed = invoke(productionPlanCli, ["render-audio", "--plan", mixOnlyPath, "--work-root", repoRoot, "--ffmpeg", ffmpeg, "--allow-unreviewed-preview"], {
    timeout: 1_200_000,
    tmpdir: path.join(evalTmpRoot, "production-plan-test", runId),
  });
  assertCliOk(remixed, "gain-only remaster reuses the actual Film instead of rerendering frames");
  const remixedMarker = remixed.stdout.match(/^PRODUCTION_PLAN_RECEIPT (.+)$/m);
  assert.ok(remixedMarker);
  const remixedReceipt = JSON.parse(await fs.readFile(remixedMarker[1], "utf8"));
  assert.equal(remixedReceipt.artifacts.film.sha256, filmHash);
  assert.equal(remixedReceipt.artifacts.film.picture.sha256, pictureHash);
  assert.equal(remixedReceipt.inputHashes.audioPlan, mixOnlyPlan.inputs.audioPlan.sha256,
    "mix-only changes remain recorded even though they do not alter Film design/timing identity");
  assert.notEqual(remixedReceipt.designBinding.directorDesignIdentitySha256, firstReceipt.designBinding.directorDesignIdentitySha256,
    "the full director design identity still records a soundAndMix brief edit");
  assert.equal(remixedReceipt.designBinding.filmDesignIdentitySha256, firstReceipt.designBinding.filmDesignIdentitySha256,
    "pure soundAndMix prose is excluded from Film reuse identity");
  assert.equal(remixedReceipt.designBinding.filmDesignIdentitySha256, firstReceipt.designBinding.filmDesignIdentitySha256);
  assert.equal(remixedReceipt.designBinding.boundFilmDesignIdentitySha256, firstReceipt.designBinding.boundFilmDesignIdentitySha256);
  assert.equal(remixedReceipt.designBinding.timingIdentitySha256, firstReceipt.designBinding.timingIdentitySha256);

  const shiftedAudioPlan = structuredClone(changedAudioPlan);
  shiftedAudioPlan.tracks[0].startSec = 0.4;
  const shiftedAudioPath = path.join(path.dirname(planPath), "synchronized-track-shift.json");
  await writeJson(shiftedAudioPath, shiftedAudioPlan);
  const shiftedPlan = structuredClone(mixOnlyPlan);
  shiftedPlan.inputs.audioPlan = { path: shiftedAudioPath, sha256: sha256(await fs.readFile(shiftedAudioPath)) };
  shiftedPlan.outputs.audioWav = "outputs/" + runId + "-sync-shift.wav";
  shiftedPlan.outputs.audioManifest = "outputs/" + runId + "-sync-shift.manifest.json";
  shiftedPlan.outputs.finalVideo = "outputs/" + runId + "-sync-shift-final.mp4";
  const shiftedPlanPath = path.join(path.dirname(planPath), "synchronized-track-shift-plan.json");
  await writeJson(shiftedPlanPath, shiftedPlan);
  const shifted = invoke(productionPlanCli, ["render-audio", "--plan", shiftedPlanPath, "--work-root", repoRoot, "--ffmpeg", ffmpeg, "--allow-unreviewed-preview"], {
    timeout: 1_200_000,
    tmpdir: path.join(evalTmpRoot, "production-plan-test", runId),
  });
  assert.notEqual(shifted.status, 0, "changing the schedule of a sound explicitly bound to a motion action invalidates Film reuse");
  assert.match(shifted.stderr, /no prior run receipt proves they were rendered against this V3 visual\/action design, synchronized audio cues, and canonical timing/);

  const visualChangePlan = structuredClone(mixOnlyPlan);
  visualChangePlan.directorDesign.units[0].actions[0].pathOrMorph += " Then the focal node scales up as the diagram resolves.";
  visualChangePlan.outputs.audioWav = "outputs/" + runId + "-visual-change.wav";
  visualChangePlan.outputs.audioManifest = "outputs/" + runId + "-visual-change.manifest.json";
  visualChangePlan.outputs.finalVideo = "outputs/" + runId + "-visual-change-final.mp4";
  const visualChangePath = path.join(path.dirname(planPath), "visual-action-change-plan.json");
  await writeJson(visualChangePath, visualChangePlan);
  const visualChange = invoke(productionPlanCli, ["render-audio", "--plan", visualChangePath, "--work-root", repoRoot, "--ffmpeg", ffmpeg, "--allow-unreviewed-preview"], {
    timeout: 1_200_000,
    tmpdir: path.join(evalTmpRoot, "production-plan-test", runId),
  });
  assert.notEqual(visualChange.status, 0, "a changed visual action cannot reuse Film rendered against the old action");
  assert.match(visualChange.stderr, /no prior run receipt proves they were rendered against this V3 visual\/action design, synchronized audio cues, and canonical timing/);
});

test("verify-delivery passes only after a real project-shot useFonts load is hash-bound into Film receipts", async () => {
  const runId = "font-delivery-" + Date.now() + "-" + process.pid;
  const built = await buildFontDeliveryPlan(runId);
  const direction = invoke(productionPlanCli, ["validate", "--plan", built.planPath, "--stage", "direction"]);
  assertCliOk(direction, "font receipt fixture direction validation");
  built.plan.directionDecisions[0].candidates[0].keyStateEvidence = [{
    phase: "loaded variable-font title frame", filmSegmentId: "font-card", mappingId: "font-shot-map", frameIndex: 15,
  }];
  await writeJson(built.planPath, built.plan);
  const ffmpeg = await bundledFfmpegPair(runId);
  const executed = invoke(productionPlanCli, ["run", "--plan", built.planPath, "--work-root", repoRoot, "--ffmpeg", ffmpeg], {
    timeout: 1_200_000,
    tmpdir: path.join(evalTmpRoot, "font-delivery", runId),
  });
  assertCliOk(executed, "actual Film /2 project-shot with local FontFace load and audio-plan delivery");
  const marker = executed.stdout.match(/^PRODUCTION_PLAN_RECEIPT (.+)$/m);
  assert.ok(marker, "the real production run exposes its durable output receipt");
  const runReceipt = JSON.parse(await fs.readFile(marker[1], "utf8"));
  assert.equal(runReceipt.completed, true);
  assert.equal(runReceipt.artifacts.projectShotKeyStates.length, 1);
  const proof = runReceipt.artifacts.projectShotKeyStates[0].planProof;
  assert.equal(proof.filmSegmentId, "font-card");
  built.plan.directionDecisions[0].candidates[0].keyStateEvidence = [proof];
  await writeJson(built.planPath, built.plan);

  const filmManifestPath = path.join(path.dirname(built.planPath), built.plan.outputs.filmManifest);
  const filmManifest = JSON.parse(await fs.readFile(filmManifestPath, "utf8"));
  const segment = filmManifest.segments.find((row) => row.id === "font-card");
  assert.ok(segment?.baseSource?.rendererFontLoads?.length, "the actual Film manifest carries its project-shot loader events");
  const fontLoad = segment.baseSource.rendererFontLoads[0];
  assert.deepEqual([fontLoad.family, fontLoad.file, fontLoad.weight, fontLoad.status, fontLoad.sha256], [
    "Inter", built.fontRelativePath, "100 900", "loaded", built.fontSha256,
  ]);
  assert.equal(fontLoad.readyCheck, true);
  assert.deepEqual(fontLoad.weightChecks.map((check) => check.weight), ["100", "900", "700"],
    "the range descriptor remains intact while legal endpoint and consumed-style weights are checked");
  assert.ok(fontLoad.weightChecks.every((check) => check.readyCheck === true));
  const childReceiptPath = path.resolve(path.dirname(filmManifestPath), segment.baseSource.rendererReceiptPath);
  const childReceipt = JSON.parse(await fs.readFile(childReceiptPath, "utf8"));
  assert.deepEqual(childReceipt.rendererFontLoads, segment.baseSource.rendererFontLoads,
    "the actual project-shot receipt and Film manifest bind the same loader event and verified asset hash");

  const verified = invoke(productionPlanCli, ["verify-delivery", "--plan", built.planPath, "--ffmpeg", ffmpeg]);
  assertCliOk(verified, "strict delivery acceptance after a real renderer/font receipt");
  const delivery = JSON.parse(verified.stdout);
  assert.equal(delivery.result, "PASS");
  assert.equal(delivery.creativeQuality, "UNKNOWN");
  assert.equal(delivery.fontEvidence[0].rendererFontLoad, "PASS");
  assert.equal(delivery.fontEvidence[0].loadReceipt[0].segmentId, "font-card");
  assert.equal(delivery.fontEvidence[0].loadReceipt[0].sha256, built.fontSha256);
  assert.equal(delivery.fontEvidence[0].loadReceipt[0].weight, "100 900");
  assert.ok(delivery.fontEvidence[0].loadReceipt[0].weightChecks.some((check) => check.weight === "700" && check.readyCheck === true),
    "strict delivery requires the actual planned text weight to be checked inside the descriptor range");

  const productionExportPath = path.join(built.root, "production", "design", "verified-production-design.md");
  const productionExport = invoke(productionPlanCli, [
    "export-design", "--plan", built.planPath, "--output", productionExportPath, "--stage", "production", "--view", "technical", "--ffmpeg", ffmpeg,
  ]);
  assertCliOk(productionExport, "production-stage export uses the same actual Film/audio receipt checker");
  assert.equal(JSON.parse(productionExport.stdout).stage, "production");
  const productionMarkdown = await fs.readFile(productionExportPath, "utf8");
  assert.match(productionMarkdown, /已核验生产消费 font-shot\/font-shot-map/);
  assert.match(productionMarkdown, /已核验输出/);
  assert.match(productionMarkdown, /不替代人工审美、可读性、试听或观众理解检查/);

  const audioManifestPath = path.resolve(path.dirname(built.planPath), built.plan.outputs.audioManifest);
  const audioManifest = JSON.parse(await fs.readFile(audioManifestPath, "utf8"));
  const staleReceipt = structuredClone(audioManifest);
  staleReceipt.planSha256 = "0".repeat(64);
  const staleReceiptPath = path.join(built.root, "outputs", "stale-audio-manifest.json");
  await writeJson(staleReceiptPath, staleReceipt);
  const stalePlan = structuredClone(built.plan);
  stalePlan.outputs.audioManifest = path.relative(path.dirname(built.planPath), staleReceiptPath);
  const stalePlanPath = path.join(built.root, "stale-audio-plan-binding.json");
  await writeJson(stalePlanPath, stalePlan);
  const staleExport = invoke(productionPlanCli, [
    "export-design", "--plan", stalePlanPath, "--output", path.join(built.root, "production", "design", "stale.md"), "--stage", "production", "--ffmpeg", ffmpeg,
  ]);
  assert.notEqual(staleExport.status, 0, "production export rejects a stale audio-plan hash in the real receipt");
  assert.match(staleExport.stderr, /audio manifest is stale or does not bind the current exact audio-plan file\/hash/);

  const mismatchedReceipt = structuredClone(audioManifest);
  mismatchedReceipt.tracks = [{ id: "unplanned-track", assetId: "unplanned-asset", bus: "music", audible: false }];
  const mismatchedReceiptPath = path.join(built.root, "outputs", "mismatched-audio-consumer.json");
  await writeJson(mismatchedReceiptPath, mismatchedReceipt);
  const mismatchedPlan = structuredClone(built.plan);
  mismatchedPlan.outputs.audioManifest = path.relative(path.dirname(built.planPath), mismatchedReceiptPath);
  const mismatchedPlanPath = path.join(built.root, "mismatched-audio-consumer-plan.json");
  await writeJson(mismatchedPlanPath, mismatchedPlan);
  const mismatchDelivery = invoke(productionPlanCli, ["verify-delivery", "--plan", mismatchedPlanPath, "--ffmpeg", ffmpeg]);
  assert.notEqual(mismatchDelivery.status, 0, "formal delivery rejects a track receipt not present in the selected audio-plan");
  assert.match(mismatchDelivery.stderr, /audio manifest track IDs\/buses\/assets differ from the exact selected audio-plan consumers/);

  const failedBuilt = await buildFontDeliveryPlan(runId + "-failed-font");
  const failedDirection = invoke(productionPlanCli, ["validate", "--plan", failedBuilt.planPath, "--stage", "direction"]);
  assertCliOk(failedDirection, "failed-font fixture direction validation");
  failedBuilt.plan.directionDecisions[0].candidates[0].keyStateEvidence = [{
    phase: "font load must fail before a key frame", filmSegmentId: "font-card", mappingId: "font-shot-map", frameIndex: 15,
  }];
  const failedModulePath = path.join(failedBuilt.root, "shots/font-card.tsx");
  const failedModuleSource = (await fs.readFile(failedModulePath, "utf8")).replace("file:props.fontFile", "file:'assets/missing-font.woff'");
  await fs.writeFile(failedModulePath, failedModuleSource);
  const failedBlueprintPath = failedBuilt.plan.inputs.filmBlueprint.path;
  const failedBlueprint = JSON.parse(await fs.readFile(failedBlueprintPath, "utf8"));
  failedBlueprint.segments[0].moduleSha256 = sha256(Buffer.from(failedModuleSource, "utf8"));
  await writeJson(failedBlueprintPath, failedBlueprint);
  failedBuilt.plan.inputs.filmBlueprint.sha256 = sha256(await fs.readFile(failedBlueprintPath));
  await writeJson(failedBuilt.planPath, failedBuilt.plan);
  const failedFontRender = invoke(productionPlanCli, ["run", "--plan", failedBuilt.planPath, "--work-root", repoRoot, "--ffmpeg", ffmpeg], {
    timeout: 1_200_000,
    tmpdir: path.join(evalTmpRoot, "font-delivery-failure", runId),
  });
  assert.notEqual(failedFontRender.status, 0, "an unresolved local font must fail the actual project-shot render");
  assert.doesNotMatch(failedFontRender.stdout + failedFontRender.stderr, /LAOHU_MOTION_FONT_LOAD\/1/,
    "the real loader must emit no successful-load event when FontFace.load fails");
});
