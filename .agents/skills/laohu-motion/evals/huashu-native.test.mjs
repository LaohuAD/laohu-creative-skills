import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { floatWav, generatePlan, loadUpstream, verifyFilmManifest, wavFacts } from "../scripts/laohu-audio-source.mjs";

const evalDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(evalDir, "..");
const repoRoot = path.resolve(skillDir, "../../..");
const cli = path.join(skillDir, "scripts", "templates.mjs");
const NATIVE_SPEC_FORMAT = "laohu.huashu-native-template-spec/1";
const maintenanceSourceAvailable = Boolean(process.env.MOTION_SOURCE_ROOT);

function executableFromPath(name) {
  const result = spawnSync("which", [name], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function nativeRuntime() {
  const browser = process.env.MOTION_BROWSER || process.env.MOTION_TEMPLATE_TEST_BROWSER
    || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const ffmpeg = process.env.MOTION_FFMPEG || process.env.MOTION_TEST_FFMPEG || process.env.MOTION_TEMPLATE_TEST_FFMPEG || executableFromPath("ffmpeg");
  return { browser, ffmpeg };
}

function invoke(args, { timeout = 240_000, cwd = repoRoot } = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
}

function assertCliOk(result, label) {
  assert.equal(result.error, undefined, `${label}: ${result.error?.message || "process spawn failed"}`);
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function baseSpec(templateId, variables) {
  return { format: NATIVE_SPEC_FORMAT, templateId, fps: 30, width: 1920, height: 1080, variables };
}

function rawRgba(ffmpeg, imagePath) {
  const result = spawnSync(ffmpeg, ["-v", "error", "-i", imagePath, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], {
    encoding: null, timeout: 60_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr?.toString("utf8"));
  return result.stdout;
}

function changedPixelCount(left, right) {
  assert.equal(left.length, right.length);
  let changed = 0;
  for (let offset = 0; offset < left.length; offset += 4) {
    if (left[offset] !== right[offset] || left[offset + 1] !== right[offset + 1]
        || left[offset + 2] !== right[offset + 2] || left[offset + 3] !== right[offset + 3]) changed += 1;
  }
  return changed;
}

function floatPcmFromWav(buffer) {
  let offset = 12, formatTag = null, bitsPerSample = null, data = null;
  while (offset + 8 <= buffer.length) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > buffer.length) throw new Error("Malformed WAV chunk " + name);
    if (name === "fmt ") {
      formatTag = buffer.readUInt16LE(body);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    }
    if (name === "data") data = buffer.subarray(body, body + size);
    offset = body + size + (size & 1);
  }
  assert.equal(formatTag, 3, "expected IEEE-float WAV");
  assert.equal(bitsPerSample, 32, "expected 32-bit float WAV");
  assert.ok(data, "expected WAV data chunk");
  return data;
}

function rawFloatPcm(ffmpeg, file, startSec = null, endSec = null) {
  const args = ["-v", "error", "-i", file];
  if (startSec != null) args.push("-af", `atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS`);
  args.push("-f", "f32le", "-acodec", "pcm_f32le", "-ar", "48000", "-ac", "2", "-");
  const result = spawnSync(ffmpeg, args, { encoding: null, timeout: 120_000, maxBuffer: 256 * 1024 * 1024 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr?.toString("utf8"));
  return result.stdout;
}

function floatPeak(pcm) {
  let peak = 0;
  for (let offset = 0; offset < pcm.length; offset += 4) peak = Math.max(peak, Math.abs(pcm.readFloatLE(offset)));
  return peak;
}

function videoPacketHashes(ffprobe, file) {
  const result = spawnSync(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_packets", "-show_data_hash", "sha256", "-show_entries", "packet=data_hash", "-of", "json", file], {
    encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || "ffprobe packet hash failed");
  return JSON.parse(result.stdout).packets.map((packet) => packet.data_hash);
}

test("main-pinned OM finance-chart and kinetic-type prepare, preview, render and reject stale inputs", async (t) => {
  const { browser, ffmpeg } = nativeRuntime();
  try { await fs.access(browser); } catch {
    t.skip("requires the caller's existing Chrome/Chromium; this test does not install a browser");
    return;
  }
  if (!ffmpeg) {
    t.skip("requires an existing FFmpeg executable, preferably the project-approved FFmpeg 7 runtime");
    return;
  }

  const cacheRoot = path.resolve(process.env.MOTION_TEST_TMP || path.join(repoRoot, ".cache", "tmp"));
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "huashu-native-om-e2e-"));
  t.after(() => process.env.MOTION_TEST_KEEP_ARTIFACTS === "1"
    ? process.stdout.write(`HUASHU_NATIVE_EVIDENCE ${runRoot}\n`)
    : fs.rm(runRoot, { recursive: true, force: true }));
  const workRoot = path.join(runRoot, "work");
  const inputRoot = path.join(runRoot, "input");
  const outputRoot = path.join(runRoot, "output");
  await Promise.all([workRoot, inputRoot, outputRoot].map((directory) => fs.mkdir(directory, { recursive: true })));
  const runtimeFlags = ["--browser", browser, "--ffmpeg", ffmpeg];

  const cases = [
    {
      id: "huashu-motion-finance-chart",
      base: baseSpec("huashu-motion-finance-chart", {
        duration: 2,
        title: "收入变化",
        unit: "单位：亿元",
        source: "来源：技术夹具",
        badge: "示例数据",
        series: JSON.stringify([{ label: "A", value: 10 }, { label: "B", value: 18 }]),
        chart: "bar",
        highlightIndex: 1,
        highlightText: "1.8倍",
        highlightSub: "18 ÷ 10",
        mainColor: "#006ba2",
        dimColor: "#c6d2d8",
      }),
      mutate(variables) {
        variables.series = JSON.stringify([{ label: "A", value: 10 }, { label: "B", value: 80 }]);
      },
    },
    {
      id: "huashu-motion-kinetic-type",
      base: baseSpec("huashu-motion-kinetic-type", {
        duration: 2,
        titleWord: "模型",
        titleSub: "怎样预测",
        item1: "输入", item1Sub: "给定已知数据", item1Key: "已知数据", item1Label: "步骤 01",
        item2: "调整", item2Sub: "修改参数再算一次", item2Key: "参数", item2Label: "步骤 02",
        item3: "验证", item3Sub: "用新数据检查结果", item3Key: "新数据", item3Label: "步骤 03",
        highlightWord: "验证",
      }),
      mutate(variables) { variables.titleWord = "算式"; },
    },
  ];

  const renderReceipts = [];
  for (const item of cases) {
    const variants = [];
    for (const [variantName, mutate] of [["base", null], ["changed", item.mutate]]) {
      const spec = structuredClone(item.base);
      if (mutate) mutate(spec.variables);
      const inputPath = path.join(inputRoot, `${item.id}-${variantName}.json`);
      const projectPath = path.join(workRoot, "projects", `${item.id}-${variantName}`);
      const specPath = path.join(projectPath, "laohu-native-template.json");
      const previewPath = path.join(outputRoot, `${item.id}-${variantName}.png`);
      const previewManifestPath = path.join(outputRoot, `${item.id}-${variantName}.preview.json`);
      await fs.writeFile(inputPath, `${JSON.stringify(spec, null, 2)}\n`);
      const prepared = invoke([
        "prepare", item.id, "--input", inputPath, "--output", projectPath, "--work-root", workRoot, ...runtimeFlags,
      ]);
      assertCliOk(prepared, `${item.id} ${variantName} prepare`);
      const preparedSpec = JSON.parse(await fs.readFile(specPath, "utf8"));
      assert.equal(preparedSpec.sourceId, "huashu-motion");
      assert.equal(preparedSpec.sourceVerification.ok, true);
      const localClosure = JSON.parse(await fs.readFile(path.join(repoRoot, ".agents/skills/laohu-motion/templates/runtime/laohu-film-native/closure.json"), "utf8"));
      assert.equal(preparedSpec.sourceVerification.checkedFiles, localClosure.files.length + localClosure.sharedExactByteModules.length, "the native entry verifies every file in its selected package and shared-module closure");
      assert.ok(localClosure.files.some((file) => file.path === "runtime/om-engine.js"), "the real OM capture dependency is pinned in the selected local runtime");
      assert.ok(preparedSpec.projectFiles.some((file) => file.path === "index.html"));
      if (item.id === "huashu-motion-finance-chart") {
        const copiedChart = await fs.readFile(path.join(projectPath, "vendor/clip/lib/chart.js"));
        const sharedChart = await fs.readFile(path.join(repoRoot, ".agents/skills/laohu-motion/templates/runtime/laohu-native-clips/lib/chart.js"));
        assert.deepEqual(copiedChart, sharedChart, "om new resolves the verified shared chart module and copies the exact pinned implementation into the new project");
      }

      const preview = invoke([
        "preview", item.id, "--spec", specPath, "--output", previewPath, "--time", "1", "--work-root", workRoot,
        "--manifest", previewManifestPath, ...runtimeFlags,
      ]);
      assertCliOk(preview, `${item.id} ${variantName} preview`);
      const previewManifest = JSON.parse(await fs.readFile(previewManifestPath, "utf8"));
      assert.equal(previewManifest.media.width, 1920);
      assert.equal(previewManifest.media.height, 1080);
      assert.equal(previewManifest.sourceVerification.ok, true);
      assert.equal(previewManifest.projectHashScope.includes(".om/renders.jsonl"), true);
      variants.push({ specPath, projectPath, media: previewManifest.media });

      if (variantName === "base") {
        const outputPath = path.join(outputRoot, `${item.id}.mp4`);
        const manifestPath = path.join(outputRoot, `${item.id}.render.json`);
        const render = invoke([
          "render", item.id, "--spec", specPath, "--output", outputPath, "--work-root", workRoot,
          "--manifest", manifestPath, ...runtimeFlags,
        ]);
        assertCliOk(render, `${item.id} render`);
        const renderManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        assert.equal(renderManifest.media.durationSec, 2);
        assert.equal(renderManifest.media.width, 1920);
        assert.equal(renderManifest.media.height, 1080);
        assert.equal(renderManifest.media.fps, 30);
        assert.equal(renderManifest.media.frameCount, 60);
        assert.equal(renderManifest.media.audioStreams, 0);
        assert.equal(renderManifest.sourceVerification.checkedFiles, preparedSpec.sourceVerification.checkedFiles);
        renderReceipts.push(manifestPath);
      }
    }
    assert.notEqual(variants[0].media.sha256, variants[1].media.sha256, `${item.id} original controls must change actual browser pixels`);

    // A project input mutation after prepare must fail before writing successful media.
    const mutationPath = path.join(variants[1].projectPath, "unlisted-input.js");
    await fs.writeFile(mutationPath, "// changed after prepare\n");
    const staleOutput = path.join(outputRoot, `${item.id}-stale.png`);
    const stale = invoke([
      "preview", item.id, "--spec", variants[1].specPath, "--output", staleOutput, "--time", "1", "--work-root", workRoot, ...runtimeFlags,
    ]);
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /project files changed after prepare/);
    await assert.rejects(fs.access(staleOutput), { code: "ENOENT" });
  }

  const invalidDir = path.join(workRoot, "invalid");
  const invalidInput = path.join(inputRoot, "unknown-variable.json");
  await fs.writeFile(invalidInput, `${JSON.stringify(baseSpec("huashu-motion-finance-chart", { duration: 2, madeUp: "ignored?" }), null, 2)}\n`);
  const invalid = invoke([
    "prepare", "huashu-motion-finance-chart", "--input", invalidInput, "--output", invalidDir, "--work-root", workRoot, ...runtimeFlags,
  ]);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /not an original control/);
  await assert.rejects(fs.access(invalidDir), { code: "ENOENT" });

  const invalidStepInput = path.join(inputRoot, "invalid-duration-step.json");
  await fs.writeFile(invalidStepInput, `${JSON.stringify(baseSpec("huashu-motion-kinetic-type", { duration: 2.01 }), null, 2)}\n`);
  const invalidStep = invoke([
    "prepare", "huashu-motion-kinetic-type", "--input", invalidStepInput, "--output", path.join(workRoot, "invalid-fps"), "--work-root", workRoot, ...runtimeFlags,
  ]);
  assert.notEqual(invalidStep.status, 0);
  assert.match(invalidStep.stderr, /must follow the source step 0\.5/);

  assert.equal(renderReceipts.length, 2);
});

test("native OM word anchors change the original canvas and sound time; source cue mute preserves pixels and flows through Film to audio", async (t) => {
  const { browser, ffmpeg } = nativeRuntime();
  try { await fs.access(browser); } catch {
    t.skip("requires the caller's existing Chrome/Chromium; this test does not install a browser");
    return;
  }
  if (!ffmpeg) {
    t.skip("requires an existing FFmpeg executable, preferably the project-approved FFmpeg 7 runtime");
    return;
  }

  const cacheRoot = path.resolve(process.env.MOTION_TEST_TMP || path.join(repoRoot, ".cache", "tmp"));
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "native-om-film-audio-e2e-"));
  if (process.env.MOTION_PRESERVE_NATIVE_OM_E2E === "1") {
    process.stderr.write("NATIVE_OM_E2E_ARTIFACTS " + runRoot + "\n");
  } else {
    t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  }
  const workRoot = path.join(runRoot, "native-work");
  const inputRoot = path.join(runRoot, "inputs");
  const outputRoot = path.join(runRoot, "outputs");
  await Promise.all([workRoot, inputRoot, outputRoot].map((directory) => fs.mkdir(directory, { recursive: true })));
  const runtimeFlags = ["--browser", browser, "--ffmpeg", ffmpeg];
  function sourceCueBindings(mutePoint = false) {
    return [
      { cueIndex: 1, kind: "point", sourceWord: "海量", word: "上下文", ...(mutePoint ? { sfx: false } : {}) },
      { cueIndex: 2, kind: "draw", sourceWord: "文字", word: null },
      { cueIndex: 3, kind: "point", sourceWord: "学会", word: null },
      { cueIndex: 4, kind: "draw", sourceWord: "下一个词", word: null },
      { cueIndex: 5, kind: "point", sourceWord: "没人教", word: null },
      { cueIndex: 6, kind: "draw", sourceWord: "不知道", word: null },
      { cueIndex: 7, kind: "highlight", sourceWord: "照样", word: null },
    ];
  }
  const variables = {
    duration: 10,
    pace: 1,
    title: "AI 如何学习文字",
    point1: "它利用上下文预测",
    draw1Text: "训练材料",
    point2: "它按上下文预测",
    draw2Text: "继续预测",
    point3: "回答仍可能出错",
    draw3Text: "不是理解",
    highlightIndex: 1,
  };
  const score = "X:1\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\nV:lead inst=piano\nC D !hit!E F |";
  async function preparePreview(name, wordStart, mutePoint = false) {
    const input = {
      ...baseSpec("laohu-motion-whiteboard", structuredClone(variables)),
      omCues: { words: [{ word: "上下文", start: wordStart, end: wordStart + 0.25 }] },
      sourceCueBindings: sourceCueBindings(mutePoint),
    };
    const inputPath = path.join(inputRoot, name + ".json");
    const projectPath = path.join(workRoot, name);
    const specPath = path.join(projectPath, "laohu-native-template.json");
    const previewPath = path.join(outputRoot, name + ".png");
    const previewManifestPath = path.join(outputRoot, name + ".preview.json");
    await fs.writeFile(inputPath, JSON.stringify(input, null, 2) + "\n");
    const prepare = invoke([
      "prepare", "laohu-motion-whiteboard", "--input", inputPath, "--output", projectPath, "--work-root", workRoot, ...runtimeFlags,
    ], { timeout: 900_000 });
    assertCliOk(prepare, name + " prepare");
    const prepared = JSON.parse(await fs.readFile(specPath, "utf8"));
    assert.equal(prepared.templateId, "laohu-motion-whiteboard");
    assert.deepEqual(prepared.sourceCueBindings, sourceCueBindings(mutePoint));
    const preview = invoke([
      "preview", "laohu-motion-whiteboard", "--spec", specPath, "--output", previewPath, "--time", "1.8", "--work-root", workRoot,
      "--manifest", previewManifestPath, ...runtimeFlags,
    ], { timeout: 900_000 });
    assertCliOk(preview, name + " preview");
    return {
      input,
      prepared,
      previewPath,
      previewManifest: JSON.parse(await fs.readFile(previewManifestPath, "utf8")),
    };
  }

  const early = await preparePreview("early-word", 0.1);
  const late = await preparePreview("late-word", 1.6);
  const muted = await preparePreview("muted-original-point", 0.1, true);
  const earlyProbe = early.previewManifest.sourceRuntimeProbe;
  const lateProbe = late.previewManifest.sourceRuntimeProbe;
  const mutedProbe = muted.previewManifest.sourceRuntimeProbe;
  assert.equal(earlyProbe.cueEvidence.words[0].word, "上下文");
  assert.equal(earlyProbe.cueEvidence.clipProblems.length, 0, "unmatched source demo anchors must be cleared before render");
  assert.equal(lateProbe.cueEvidence.words[0].word, "上下文");
  assert.equal(earlyProbe.cueEvidence.clipCues[1].word, "上下文");
  assert.equal(lateProbe.cueEvidence.clipCues[1].word, "上下文");
  assert.ok(Math.abs(earlyProbe.cueEvidence.clipCues[1].atSec - 0.6) < 1 / 30);
  assert.ok(Math.abs(lateProbe.cueEvidence.clipCues[1].atSec - 2.1) < 1 / 30);
  assert.ok(Math.abs(earlyProbe.labels["scene:point-1"] - 0.6) < 1 / 30);
  assert.ok(Math.abs(lateProbe.labels["scene:point-1"] - 2.1) < 1 / 30);
  assert.ok(earlyProbe.labels["scene:point-1"] < 1.8, "the early original point cue must have started by the sampled frame");
  assert.ok(lateProbe.labels["scene:point-1"] > 1.8, "the late original point cue must not have started by the same sampled frame");
  assert.ok(earlyProbe.sound.hits.some((hit) => hit.name === "pop" && Math.abs(hit.at - 0.6) < 1 / 30));
  assert.ok(lateProbe.sound.hits.some((hit) => hit.name === "pop" && Math.abs(hit.at - 2.1) < 1 / 30));
  assert.equal(mutedProbe.labels["scene:point-1"], earlyProbe.labels["scene:point-1"], "muting preserves the original OM word anchor");
  assert.equal(mutedProbe.sound.hits.some((hit) => hit.name === "pop" && Math.abs(hit.at - 0.6) < 1 / 30), false);
  const earlyPixels = rawRgba(ffmpeg, early.previewPath);
  const latePixels = rawRgba(ffmpeg, late.previewPath);
  const mutedPixels = rawRgba(ffmpeg, muted.previewPath);
  assert.ok(changedPixelCount(earlyPixels, latePixels) > 1000, "the same sampled browser frame must contain actual changed canvas pixels when the source word moves");
  assert.equal(changedPixelCount(earlyPixels, mutedPixels), 0, "source cue sfx false must silence without changing original OM drawing pixels");

  const invalidInput = {
    ...baseSpec("laohu-motion-whiteboard", structuredClone(variables)),
    omCues: { words: [{ word: "上下文", start: 0.1, end: 0.35 }] },
  };
  const invalidInputPath = path.join(inputRoot, "unbound-source-words.json");
  const invalidProject = path.join(workRoot, "unbound-source-words");
  await fs.writeFile(invalidInputPath, JSON.stringify(invalidInput, null, 2) + "\n");
  const invalidPrepare = invoke([
    "prepare", "laohu-motion-whiteboard", "--input", invalidInputPath, "--output", invalidProject, "--work-root", workRoot, ...runtimeFlags,
  ], { timeout: 900_000 });
  assertCliOk(invalidPrepare, "unbound source words prepare");
  const invalidPreviewPath = path.join(outputRoot, "unbound-source-words.png");
  const invalidPreview = invoke([
    "preview", "laohu-motion-whiteboard", "--spec", path.join(invalidProject, "laohu-native-template.json"),
    "--output", invalidPreviewPath, "--time", "1.8", "--work-root", workRoot, ...runtimeFlags,
  ], { timeout: 900_000 });
  assert.notEqual(invalidPreview.status, 0);
  assert.match(invalidPreview.stderr, /source cue words or initialized CLIP diagnostics are unresolved by the original OM\.cue\/ClipCues/);
  await assert.rejects(fs.access(invalidPreviewPath), { code: "ENOENT" });

  const blueprint = {
    format: "laohu.huashu-film-blueprint/1",
    width: 1920, height: 1080, fps: 30,
    clock: { kind: "film-global", durationSec: 10 },
    segments: [{
      id: "native-board",
      renderer: "laohu-native-om-template",
      templateId: "laohu-motion-whiteboard",
      variables: structuredClone(variables),
      omCues: { words: [{ word: "上下文", start: 0.1, end: 0.35 }] },
      omScore: score,
      sourceCueBindings: sourceCueBindings(false),
      startSec: 0,
      endSec: 10,
    }],
  };
  const blueprintPath = path.join(inputRoot, "film-blueprint.json");
  const filmOutput = path.join(outputRoot, "picture-only-film.mp4");
  const filmManifestPath = path.join(outputRoot, "film-manifest.json");
  const filmWorkRoot = path.join(runRoot, "film-work");
  await fs.writeFile(blueprintPath, JSON.stringify(blueprint, null, 2) + "\n");
  const filmRender = invoke([
    "render", "--film-blueprint", blueprintPath, "--output", filmOutput, "--work-root", filmWorkRoot,
    "--manifest", filmManifestPath, ...runtimeFlags,
  ], { timeout: 900_000 });
  assertCliOk(filmRender, "complete native OM Film render");
  const filmManifest = JSON.parse(await fs.readFile(filmManifestPath, "utf8"));
  assert.equal(filmManifest.output.kind, "picture-only-hard-cut");
  assert.equal(filmManifest.render.durationSec, 10);
  assert.equal(filmManifest.segments[0].renderer, "laohu-native-om-template");
  assert.equal(filmManifest.segments[0].sourceRuntimeProbe.sourceCueBindings.length, 7);
  assert.equal(filmManifest.audioTimeMaps[0].id, "time:native-board");
  assert.equal(filmManifest.nativeSourceCompositions.length, 1);
  assert.equal(filmManifest.nativeSourceCompositions[0].timeMapId, "time:native-board");
  assert.equal(filmManifest.nativeSourceCompositions[0].scoreText, score);
  const eventScene = JSON.parse(await fs.readFile(path.resolve(path.dirname(filmManifestPath), filmManifest.audioEventScene.path), "utf8"));
  const sourceSceneRecord = filmManifest.sourceScenes.find((row) => row.segmentId === "native-board");
  assert.ok(sourceSceneRecord, "Film manifest must retain the complete original OM event scene as a hashed source reference");
  const sourceScene = JSON.parse(await fs.readFile(path.resolve(path.dirname(filmManifestPath), sourceSceneRecord.path), "utf8"));
  const pointHit = eventScene.audioEvents.find((event) => event.sourceAudio?.kind === "declared-sfx"
    && event.sourceAudio.name === "pop" && Math.abs(event.timeSec - 0.6) < 1 / 30);
  assert.ok(pointHit, "original CLIP.mount point sound must enter the Film event scene at the manuscript word anchor");
  assert.equal(sourceScene.huashuMotionRuntime.cueEvidence.clipCues[1].word, "上下文");
  assert.ok(Math.abs(sourceScene.huashuMotionRuntime.cueEvidence.clipCues[1].atSec - 0.6) < 1 / 30);
  const filmBinding = filmManifest.audioEventBindings.find((binding) => binding.sourceEventId === pointHit.id);
  assert.equal(filmBinding.timeMapId, "time:native-board");

  const audioProject = path.join(runRoot, "audio-project");
  const assetsDir = path.join(audioProject, "assets");
  await Promise.all([audioProject, assetsDir].map((directory) => fs.mkdir(directory, { recursive: true })));
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 10, sampleRate: 48000, channels: 2,
    events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [],
  };
  const request = { format: "laohu.motion.huashu-audio-request/1", musicMixGainDb: -3 };
  const requestPath = path.join(audioProject, "request.json");
  const basePlanPath = path.join(audioProject, "base-plan.json");
  const outputPlan = path.join(audioProject, "audio-plan.json");
  const audioReceiptPath = path.join(audioProject, "audio-plan-receipt.json");
  await fs.writeFile(requestPath, JSON.stringify(request, null, 2) + "\n");
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan, null, 2) + "\n");
  const verifiedFilm = await verifyFilmManifest(filmManifestPath);
  const generated = await generatePlan({
    request, basePlan, basePlanPath, film: verifiedFilm,
    inputFiles: [requestPath, basePlanPath, filmManifestPath],
    assetsDir, projectRoot: audioProject, outputPlan, manifestPath: audioReceiptPath,
  });
  const musicTrack = generated.plan.tracks.find((track) => track.bus === "music");
  assert.ok(musicTrack, "the original OM score music stem must become an audio-plan music track");
  assert.equal(musicTrack.gainDb, -3, "native OM musicMixGainDb applies once as the final track post-gain");
  assert.equal(musicTrack.timeMapId, "time:native-board");
  assert.ok(musicTrack.sourceOutSec >= 9.99 && musicTrack.sourceOutSec <= 10.01);
  assert.equal(generated.manifest.alignment.nativeSourceMusic.length, 1);
  assert.equal(generated.manifest.composition.status, "original OM source music");
  assert.equal(generated.manifest.composition.sourceScoreSegments[0].segmentId, "native-board", "original OM ABC music must not be reported as an SFX-only request");
  const nativePointEvent = generated.plan.events.find((event) => event.eventId === pointHit.id);
  assert.ok(nativePointEvent, "the original source hit must become one canonical generated SFX event");
  assert.equal(nativePointEvent.timeMapId, "time:native-board");
  const nativePointBinding = generated.manifest.alignment.markAndHitBindings.find((row) => row.eventId === pointHit.id);
  assert.equal(nativePointBinding.kind, "native-om-source-sfx");
  assert.ok(Math.abs(nativePointBinding.canonicalFilmTimeSec - 0.6) < 1 / 30);
  assert.equal(generated.manifest.runtime.finalMixer, "scripts/audio.mjs remains the sole final audio-plan mixer");

  const audioCli = path.join(skillDir, "scripts", "audio.mjs");
  const mixedWav = path.join(audioProject, "mixed.wav");
  const audioManifestPath = path.join(audioProject, "mixed-manifest.json");
  const finalVideo = path.join(audioProject, "final-with-audio.mp4");
  const canonicalEventScenePath = path.resolve(path.dirname(filmManifestPath), filmManifest.audioEventScene.path);
  const audioRun = spawnSync(process.execPath, [
    audioCli, "--plan", outputPlan, "--output", mixedWav, "--manifest", audioManifestPath,
    "--cache-dir", path.join(audioProject, ".cache", "tmp", "audio"), "--ffmpeg", ffmpeg,
    "--scene", canonicalEventScenePath, "--allow-generated-preview", "--video", filmOutput, "--final-output", finalVideo,
  ], { cwd: repoRoot, encoding: "utf8", timeout: 900_000, maxBuffer: 32 * 1024 * 1024, env: process.env });
  assert.equal(audioRun.error, undefined, audioRun.error?.message);
  assert.equal(audioRun.status, 0, "audio.mjs native OM integration failed\nstdout:\n" + audioRun.stdout + "\nstderr:\n" + audioRun.stderr);
  const audioManifest = JSON.parse(await fs.readFile(audioManifestPath, "utf8"));
  assert.equal(audioManifest.audioStream, true);
  assert.equal(audioManifest.mux.output, finalVideo);
  const ffprobe = path.join(path.dirname(ffmpeg), "ffprobe");
  const finalProbe = spawnSync(ffprobe, ["-v", "error", "-show_streams", "-of", "json", finalVideo], { encoding: "utf8", timeout: 60_000 });
  assert.equal(finalProbe.status, 0, finalProbe.stderr || finalProbe.error?.message);
  const streams = JSON.parse(finalProbe.stdout).streams;
  assert.equal(streams.filter((stream) => stream.codec_type === "video").length, 1);
  assert.equal(streams.filter((stream) => stream.codec_type === "audio").length, 1);

  const sourceMixdownProject = path.join(runRoot, "source-mixdown-audio-project");
  const sourceMixdownAssets = path.join(sourceMixdownProject, "assets");
  await Promise.all([sourceMixdownProject, sourceMixdownAssets].map((directory) => fs.mkdir(directory, { recursive: true })));
  const sourceMixdownRequest = { format: "laohu.motion.huashu-audio-request/1" };
  const sourceMixdownRequestPath = path.join(sourceMixdownProject, "request.json");
  const sourceMixdownBasePath = path.join(sourceMixdownProject, "base-plan.json");
  const sourceMixdownOutputPath = path.join(sourceMixdownProject, "audio-plan.json");
  const sourceMixdownReceiptPath = path.join(sourceMixdownProject, "audio-plan-receipt.json");
  await fs.writeFile(sourceMixdownRequestPath, JSON.stringify(sourceMixdownRequest, null, 2) + "\n");
  await fs.writeFile(sourceMixdownBasePath, JSON.stringify(basePlan, null, 2) + "\n");
  const sourceMixdown = await generatePlan({
    request: sourceMixdownRequest, basePlan, basePlanPath: sourceMixdownBasePath, film: verifiedFilm,
    inputFiles: [sourceMixdownRequestPath, sourceMixdownBasePath, filmManifestPath],
    assetsDir: sourceMixdownAssets, projectRoot: sourceMixdownProject,
    outputPlan: sourceMixdownOutputPath, manifestPath: sourceMixdownReceiptPath,
  });
  const sourceMixdownTrack = sourceMixdown.plan.tracks[0];
  assert.equal(sourceMixdown.plan.tracks.length, 1, "ordinary native ABC route is one complete source soundtrack track");
  assert.equal(sourceMixdownTrack.bus, "music");
  assert.equal(sourceMixdownTrack.timeMapId, "time:native-board");
  assert.equal(sourceMixdownTrack.gainDb, 0);
  assert.deepEqual(sourceMixdown.plan.events, [], "source SFX baked into mixdown must not become duplicate audio-plan events");
  assert.deepEqual(sourceMixdown.manifest.alignment.nativeSourceMusic, []);
  assert.equal(sourceMixdown.manifest.runtime.sourceMixdownUsed, true);
  assert.equal(sourceMixdown.manifest.alignment.nativeSourceSoundtracks.length, 1);
  assert.equal(sourceMixdown.manifest.alignment.nativeSourceSoundtracks[0].sourceScoreSha256, sourceScene.huashuMotionRuntime.sourceScore.scoreSha256);
  assert.equal(sourceMixdown.manifest.alignment.nativeSourceSoundtracks[0].bakedCanonicalEvents.length, sourceScene.audioEvents.length);
  assert.equal(sourceMixdown.manifest.alignment.nativeSourceSoundtracks[0].sourceMixdown.function, "sound.mixdown");
  assert.equal(sourceMixdown.manifest.alignment.nativeSourceSoundtracks[0].sourceMixdown.voiced, false);
  assert.match(sourceMixdown.manifest.runtime.api, /sound\.mixdown\(p0/);
  const sourceMixdownAsset = sourceMixdown.plan.assets.find((asset) => asset.id === sourceMixdownTrack.assetId);
  assert.equal(sourceMixdownAsset.source.outputKind, "native-om-original-sound-mixdown-stereo-soundtrack");
  const sourceMixdownAssetPath = path.resolve(path.dirname(sourceMixdownOutputPath), sourceMixdownAsset.file);
  const sourceMixdownBytes = await fs.readFile(sourceMixdownAssetPath);
  const originalRuntime = sourceScene.huashuMotionRuntime;
  const upstream = maintenanceSourceAvailable ? await loadUpstream() : null;
  let originalMixdownWav = sourceMixdownBytes;
  if (upstream) {
    const originalMixdown = upstream.sound.mixdown(originalRuntime.sourceDeclaration, {
      voiced: false, score: originalRuntime.sourceScore.scoreText,
    });
    originalMixdownWav = floatWav(originalMixdown.out2);
    assert.deepEqual(sourceMixdownBytes, originalMixdownWav, "asset PCM must be byte-identical to the pinned original sound.mixdown output");
  } else {
    process.stderr.write("SOURCE_PCM_PARITY_SKIP: MOTION_SOURCE_ROOT is unset; local asset-to-mixer behavior remains checked\n");
  }
  assert.equal(wavFacts(sourceMixdownBytes).overRangeSampleCount, 0);
  assert.ok(wavFacts(sourceMixdownBytes).peakAbs <= 1);
  const sourceMixdownAudioCli = path.join(skillDir, "scripts", "audio.mjs");
  const sourceMixdownMixedWav = path.join(sourceMixdownProject, "mixed.wav");
  const sourceMixdownAudioManifest = path.join(sourceMixdownProject, "mixed-manifest.json");
  const sourceMixdownFinalVideo = path.join(sourceMixdownProject, "final-with-audio.mp4");
  const sourceMixdownMux = spawnSync(process.execPath, [
    sourceMixdownAudioCli, "--plan", sourceMixdownOutputPath, "--output", sourceMixdownMixedWav,
    "--manifest", sourceMixdownAudioManifest, "--cache-dir", path.join(sourceMixdownProject, ".cache", "tmp", "audio"),
    "--ffmpeg", ffmpeg, "--scene", canonicalEventScenePath, "--allow-generated-preview",
    "--video", filmOutput, "--final-output", sourceMixdownFinalVideo,
  ], { cwd: repoRoot, encoding: "utf8", timeout: 900_000, maxBuffer: 32 * 1024 * 1024, env: process.env });
  assert.equal(sourceMixdownMux.error, undefined, sourceMixdownMux.error?.message);
  assert.equal(sourceMixdownMux.status, 0, "native ABC source mixdown final audio.mjs mux failed\nstdout:\n" + sourceMixdownMux.stdout + "\nstderr:\n" + sourceMixdownMux.stderr);
  const mixdownAudioPcm = rawFloatPcm(ffmpeg, sourceMixdownMixedWav);
  assert.deepEqual(mixdownAudioPcm, floatPcmFromWav(originalMixdownWav), "audio.mjs must preserve the single source soundtrack PCM with no added bus gain or SFX duplication");
  assert.ok(floatPeak(mixdownAudioPcm) <= 1, "original source limiter peak must survive the final audio-plan assembly");
  assert.deepEqual(videoPacketHashes(path.join(path.dirname(ffmpeg), "ffprobe"), filmOutput), videoPacketHashes(path.join(path.dirname(ffmpeg), "ffprobe"), sourceMixdownFinalVideo), "copy-muxed video packets must remain byte-identical to the picture-only source");

  const voiceProject = path.join(runRoot, "source-mixdown-voice-project");
  const voiceAssets = path.join(voiceProject, "assets");
  await Promise.all([voiceProject, voiceAssets].map((directory) => fs.mkdir(directory, { recursive: true })));
  const voiceFixture = upstream
    ? new upstream.sound.Track(10)
    : { n: 10 * 48000, L: new Float32Array(10 * 48000), R: new Float32Array(10 * 48000) };
  for (let sample = 0; sample < voiceFixture.n; sample += 1) {
    const value = Math.sin(2 * Math.PI * 180 * sample / 48000) * 0.045;
    voiceFixture.L[sample] = value;
    voiceFixture.R[sample] = value;
  }
  const voiceFixtureWav = floatWav(voiceFixture);
  const voiceFixtureSha256 = createHash("sha256").update(voiceFixtureWav).digest("hex");
  const voiceFixturePath = path.join(voiceAssets, "locked-voice-fixture.wav");
  await fs.writeFile(voiceFixturePath, voiceFixtureWav);
  const voiceWindows = [
    { id: "voice-window-a", startSec: 0.2, endSec: 0.7 },
    { id: "voice-window-b", startSec: 1.3, endSec: 1.8 },
  ];
  const voiceBasePlan = {
    ...basePlan,
    tracks: [{ id: "locked-voice-fixture", assetId: "voice-fixture", bus: "voice", startSec: 0, locked: true }],
    voiceWindows,
    assets: [{
      id: "voice-fixture", file: "assets/locked-voice-fixture.wav", durationSec: 10,
      sha256: voiceFixtureSha256, license: "project-generated technical fixture",
      redistribution: { status: "project-generated", basis: "Synthetic tone used only to verify original source mixdown voice ownership." },
      reviewStatus: "generated-unreviewed", source: { outputKind: "technical-voice-binding-fixture" },
    }],
  };
  const voiceRequestPath = path.join(voiceProject, "request.json");
  const voiceBasePath = path.join(voiceProject, "base-plan.json");
  const voiceOutputPlan = path.join(voiceProject, "audio-plan.json");
  const voiceReceiptPath = path.join(voiceProject, "audio-plan-receipt.json");
  const voiceRequest = { format: "laohu.motion.huashu-audio-request/1" };
  await fs.writeFile(voiceRequestPath, JSON.stringify(voiceRequest, null, 2) + "\n");
  await fs.writeFile(voiceBasePath, JSON.stringify(voiceBasePlan, null, 2) + "\n");
  const voiceSourceMixdown = await generatePlan({
    request: voiceRequest, basePlan: voiceBasePlan, basePlanPath: voiceBasePath, film: verifiedFilm,
    inputFiles: [voiceRequestPath, voiceBasePath, filmManifestPath, voiceFixturePath],
    assetsDir: voiceAssets, projectRoot: voiceProject, outputPlan: voiceOutputPlan, manifestPath: voiceReceiptPath,
  });
  const voiceSourceRow = voiceSourceMixdown.manifest.alignment.nativeSourceSoundtracks[0];
  const voiceSourceTrack = voiceSourceMixdown.plan.tracks.find((track) => track.id === voiceSourceRow.trackId);
  const voicePremixAsset = voiceSourceMixdown.plan.assets.find((asset) => asset.id === voiceSourceRow.assetId);
  const voicePremixBytes = await fs.readFile(path.resolve(voiceProject, voicePremixAsset.file));
  assert.equal(voiceSourceMixdown.plan.events.length, 0, "canonical SFX baked into original source mixdown must not be rendered as separate events");
  assert.equal(voiceSourceTrack.locked, undefined, "source premix must not use the locked-track bypass");
  assert.equal(voiceSourceTrack.gainDb, 0);
  assert.equal(voiceSourceTrack.sourceProcessing.format, "laohu.motion.source-premix-processing/1");
  assert.equal(voiceSourceTrack.sourceProcessing.owner, "huashu-motion.sound.mixdown");
  assert.equal(voiceSourceTrack.sourceProcessing.voiceBinding.trackId, "locked-voice-fixture");
  assert.equal(voiceSourceTrack.sourceProcessing.voiceBinding.fileSha256, voiceFixtureSha256);
  assert.equal(voiceSourceTrack.sourceProcessing.voiceBinding.timeMapId, "time:native-board");
  assert.deepEqual(voiceSourceTrack.sourceProcessing.voiceBinding.mappedWords, [{ start: 0.2, end: 0.7 }, { start: 1.3, end: 1.8 }]);
  assert.equal(voiceSourceRow.sourceMixdown.voiced, true);
  assert.equal(voiceSourceRow.sourceMixdown.sourceHitCount, voiceSourceRow.bakedCanonicalEvents.length);
  assert.equal(voiceSourceMixdown.manifest.runtime.sourceVoiceDuckUsed, true);
  assert.equal(voiceSourceMixdown.manifest.runtime.sourceMixdownUsed, true);
  assert.equal(voiceSourceTrack.sourceProcessing.receiptSha256, createHash("sha256").update(await fs.readFile(voiceReceiptPath)).digest("hex"));
  assert.equal(voiceSourceTrack.sourceProcessing.assetSha256, voicePremixAsset.sha256);
  assert.notDeepEqual(voicePremixBytes, originalMixdownWav, "voiced:true source mixdown must take a different source branch from the no-voice mix");
  const decodedVoice = spawnSync(ffmpeg, ["-nostdin", "-v", "error", "-i", voiceFixturePath, "-map", "0:a:0", "-vn", "-ac", "2", "-ar", "48000", "-f", "f32le", "pipe:1"], {
    encoding: null, timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(decodedVoice.error, undefined, decodedVoice.error?.message);
  assert.equal(decodedVoice.status, 0, decodedVoice.stderr?.toString("utf8"));
  assert.equal(decodedVoice.stdout.length % 8, 0, "the generated voice fixture decodes as complete stereo float frames");
  const decodedVoiceLeft = new Float32Array(decodedVoice.stdout.length / 8);
  const decodedVoiceRight = new Float32Array(decodedVoice.stdout.length / 8);
  for (let frame = 0; frame < decodedVoiceLeft.length; frame += 1) {
    decodedVoiceLeft[frame] = decodedVoice.stdout.readFloatLE(frame * 8);
    decodedVoiceRight[frame] = decodedVoice.stdout.readFloatLE(frame * 8 + 4);
  }
  if (upstream) {
    const directlyMeasuredVoiceLufs = upstream.sound.loudness(decodedVoiceLeft, decodedVoiceRight);
    assert.ok(Math.abs(voiceSourceRow.voiceBinding.voiceLufs - directlyMeasuredVoiceLufs) < 1e-8, "source mixdown voiceLufs must come from the pinned source loudness function over the actual two decoded voice channels, without a fixed mono/stereo offset");
    const originalVoiceMixdown = upstream.sound.mixdown(originalRuntime.sourceDeclaration, {
      voiced: true,
      words: voiceSourceRow.sourceMixdown.wordWindows,
      voiceLufs: voiceSourceRow.sourceMixdown.voiceLufs,
      score: originalRuntime.sourceScore.scoreText,
    });
    assert.deepEqual(voicePremixBytes, floatWav(originalVoiceMixdown.out2), "source soundtrack PCM must match the original sound.mixdown voiced:true output byte-for-byte");
  } else {
    process.stderr.write("SOURCE_PCM_PARITY_SKIP: MOTION_SOURCE_ROOT is unset; locked-voice source loudness/source-mixdown comparison is skipped\n");
  }

  const voiceMixedWav = path.join(voiceProject, "mixed.wav");
  const voiceAudioManifestPath = path.join(voiceProject, "mixed-manifest.json");
  const voiceFinalVideo = path.join(voiceProject, "final-with-audio.mp4");
  const voiceAudioRun = spawnSync(process.execPath, [
    sourceMixdownAudioCli, "--plan", voiceOutputPlan, "--output", voiceMixedWav,
    "--manifest", voiceAudioManifestPath, "--cache-dir", path.join(voiceProject, ".cache", "tmp", "audio"),
    "--ffmpeg", ffmpeg, "--scene", canonicalEventScenePath, "--allow-generated-preview",
    "--video", filmOutput, "--final-output", voiceFinalVideo,
  ], { cwd: repoRoot, encoding: "utf8", timeout: 900_000, maxBuffer: 32 * 1024 * 1024, env: process.env });
  assert.equal(voiceAudioRun.error, undefined, voiceAudioRun.error?.message);
  assert.equal(voiceAudioRun.status, 0, "voice-aware original source mixdown final audio.mjs mux failed\nstdout:\n" + voiceAudioRun.stdout + "\nstderr:\n" + voiceAudioRun.stderr);
  const voiceAudioManifest = JSON.parse(await fs.readFile(voiceAudioManifestPath, "utf8"));
  assert.equal(voiceAudioManifest.sourcePremixProcessing.length, 1);
  assert.equal(voiceAudioManifest.sourcePremixProcessing[0].sourceVoiceDuckApplied, true);
  assert.equal(voiceAudioManifest.sourcePremixProcessing[0].voiceTrackId, "locked-voice-fixture");
  assert.equal(voiceAudioManifest.mix.inputCount, 2, "the source mixdown and locked voice are each consumed once");
  assert.equal(voiceAudioManifest.events.length, 0, "baked source SFX must not be re-added after the source mixdown");
  assert.equal(voiceAudioManifest.tracks.filter((track) => track.bus === "voice").length, 1);
  assert.equal(voiceAudioManifest.tracks.filter((track) => track.sourcePremix).length, 1);
  assert.ok(!voiceAudioManifest.mix.filterGraph.includes("volume="), "audio.mjs must not apply a second duck or gain automation pass over the source premix");
  const voiceAssetFromPlan = voiceSourceMixdown.plan.assets.find((asset) => asset.id === "voice-fixture");
  const voiceReferenceWav = path.join(voiceProject, "voice-plus-source-reference.wav");
  const voiceReference = spawnSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", path.resolve(voiceProject, voiceAssetFromPlan.file), "-i", path.resolve(voiceProject, voicePremixAsset.file),
    "-filter_complex", voiceAudioManifest.mix.filterGraph, "-map", "[mix]", "-t", "10", "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", voiceReferenceWav,
  ], { encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024, env: process.env });
  assert.equal(voiceReference.error, undefined, voiceReference.error?.message);
  assert.equal(voiceReference.status, 0, voiceReference.stderr || "could not generate the two-input voice/source PCM reference");
  assert.deepEqual(rawFloatPcm(ffmpeg, voiceMixedWav), rawFloatPcm(ffmpeg, voiceReferenceWav), "the final PCM must contain exactly one source premix plus exactly one locked voice, with no post-mix duck/gain pass");
  assert.deepEqual(videoPacketHashes(path.join(path.dirname(ffmpeg), "ffprobe"), filmOutput), videoPacketHashes(path.join(path.dirname(ffmpeg), "ffprobe"), voiceFinalVideo), "voice-aware audio mux must leave picture packets unchanged");

  const runPremixReject = async (label, mutate, expectedPattern) => {
    const badPlan = structuredClone(voiceSourceMixdown.plan);
    mutate(badPlan);
    const badPath = path.join(voiceProject, `${label}.plan.json`);
    const badOutput = path.join(voiceProject, `${label}.wav`);
    const badManifest = path.join(voiceProject, `${label}.receipt.json`);
    await fs.writeFile(badPath, JSON.stringify(badPlan, null, 2) + "\n");
    const result = spawnSync(process.execPath, [
      sourceMixdownAudioCli, "--plan", badPath, "--output", badOutput,
      "--manifest", badManifest, "--cache-dir", path.join(voiceProject, ".cache", "tmp", label),
      "--ffmpeg", ffmpeg, "--scene", canonicalEventScenePath, "--allow-generated-preview",
    ], { cwd: repoRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: process.env });
    assert.notEqual(result.status, 0, `${label} must be rejected before mixing`);
    assert.match(result.stderr, expectedPattern, `${label} rejected for an unexpected reason: ${result.stderr}`);
  };
  await runPremixReject("stale-voice-windows", (plan) => { plan.voiceWindows[0].endSec += 0.05; }, /voiceWindows changed/);
  await runPremixReject("stale-source-time-map", (plan) => { plan.timeMaps[0].filmStartSec += 0.25; }, /timeMap changed/);
  await runPremixReject("locked-premix-bypass", (plan) => { plan.tracks.find((track) => track.sourceProcessing).locked = true; }, /locked track .* cannot be cropped/);
  await runPremixReject("duplicate-baked-hit", (plan) => {
    const baked = plan.tracks.find((track) => track.sourceProcessing).sourceProcessing.bakedCanonicalEvents[0];
    plan.events.push({ id: "duplicate-source-hit", eventId: baked.eventId, assetId: "voice-fixture", bus: "sfx", timeMapId: baked.timeMapId });
  }, /must not also appear as an audio-plan event/);
  await runPremixReject("post-mix-automation", (plan) => {
    plan.automation.push({ id: "late-music-automation", bus: "music", startSec: 0, endSec: 1, gainDb: -2 });
  }, /cannot be applied after original sound\.mixdown/);
  const changedVoiceWav = Buffer.from(voiceFixtureWav);
  const changedVoiceSampleOffset = 44 + 4 * 137;
  changedVoiceWav.writeFloatLE(changedVoiceWav.readFloatLE(changedVoiceSampleOffset) * 0.5, changedVoiceSampleOffset);
  const changedVoicePath = path.join(voiceAssets, "locked-voice-fixture-changed.wav");
  await fs.writeFile(changedVoicePath, changedVoiceWav);
  const changedVoiceSha = createHash("sha256").update(changedVoiceWav).digest("hex");
  await runPremixReject("stale-voice-file", (plan) => {
    const voiceAsset = plan.assets.find((asset) => asset.id === "voice-fixture");
    voiceAsset.file = "assets/locked-voice-fixture-changed.wav";
    voiceAsset.sha256 = changedVoiceSha;
  }, /voice asset differs/);

  const pacedBlueprint = structuredClone(blueprint);
  pacedBlueprint.clock.durationSec = 15;
  pacedBlueprint.segments[0].id = "paced-board";
  pacedBlueprint.segments[0].variables.duration = 10;
  pacedBlueprint.segments[0].variables.pace = 1.5;
  pacedBlueprint.segments[0].omCues = { words: [{ word: "上下文", start: 2.4, end: 2.8 }] };
  pacedBlueprint.segments[0].startSec = 0;
  pacedBlueprint.segments[0].endSec = 15;
  const pacedBlueprintPath = path.join(inputRoot, "paced-film-blueprint.json");
  const pacedFilmOutput = path.join(outputRoot, "paced-picture-only-film.mp4");
  const pacedFilmManifestPath = path.join(outputRoot, "paced-film-manifest.json");
  const pacedFilmWorkRoot = path.join(runRoot, "paced-film-work");
  await fs.writeFile(pacedBlueprintPath, JSON.stringify(pacedBlueprint, null, 2) + "\n");
  const pacedRender = invoke([
    "render", "--film-blueprint", pacedBlueprintPath, "--output", pacedFilmOutput, "--work-root", pacedFilmWorkRoot,
    "--manifest", pacedFilmManifestPath, ...runtimeFlags,
  ], { timeout: 900_000 });
  assertCliOk(pacedRender, "pace 1.5 native OM Film render");
  const pacedManifest = JSON.parse(await fs.readFile(pacedFilmManifestPath, "utf8"));
  assert.equal(pacedManifest.render.durationSec, 15);
  assert.equal(pacedManifest.render.frameCount, 450);
  assert.equal(pacedManifest.segments[0].sourceRuntimeProbe.sourceDurationControlSec, 10);
  assert.equal(pacedManifest.segments[0].sourceRuntimeProbe.runtimeDurationSec, 15);
  assert.equal(pacedManifest.segments[0].sourceRuntimeProbe.durationAuthority, "original-om-browser-runtime-probe");
  const pacedSceneRecord = pacedManifest.sourceScenes.find((row) => row.segmentId === "paced-board");
  const pacedScene = JSON.parse(await fs.readFile(path.resolve(path.dirname(pacedFilmManifestPath), pacedSceneRecord.path), "utf8"));
  assert.equal(pacedScene.huashuMotionRuntime.cueEvidence.clipCues[1].wordTimeSec, 2.4);
  assert.ok(Math.abs(pacedScene.huashuMotionRuntime.cueEvidence.clipCues[1].atSec - 2.9) < 1 / 30, "word-anchored source cue keeps the original transcript time plus original offset under pace");
  assert.ok(Math.abs(pacedScene.huashuMotionRuntime.cueEvidence.clipCues[2].atSec - 4.2) < 1 / 30, "unanchored original cue time is scaled by the original ClipCues.prepare pace");
  const pacedPointHit = pacedScene.audioEvents.find((event) => event.sourceAudio?.name === "pop" && Math.abs(event.timeSec - 2.9) < 1 / 30);
  assert.ok(pacedPointHit, "the original point SFX follows the original paced cue time");
  const pacedBinding = pacedManifest.audioEventBindings.find((binding) => binding.sourceEventId === pacedPointHit.id);
  assert.equal(pacedBinding.timeMapId, "time:paced-board");
});

test("native OM default score preset is consumed as one source music stem; music.off and nonzero Film starts stay aligned", async (t) => {
  const { browser, ffmpeg } = nativeRuntime();
  try { await fs.access(browser); } catch {
    t.skip("requires the caller's existing Chrome/Chromium; this test does not install a browser");
    return;
  }
  if (!ffmpeg) {
    t.skip("requires an existing FFmpeg executable, preferably the project-approved FFmpeg 7 runtime");
    return;
  }

  const cacheRoot = path.resolve(process.env.MOTION_TEST_TMP || path.join(repoRoot, ".cache", "tmp"));
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "native-om-default-preset-e2e-"));
  if (process.env.MOTION_PRESERVE_NATIVE_OM_E2E === "1") {
    process.stderr.write("NATIVE_OM_DEFAULT_PRESET_E2E_ARTIFACTS " + runRoot + "\n");
  } else {
    t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  }
  const workRoot = path.join(runRoot, "work");
  const inputRoot = path.join(runRoot, "input");
  const outputRoot = path.join(runRoot, "output");
  await Promise.all([workRoot, inputRoot, outputRoot].map((directory) => fs.mkdir(directory, { recursive: true })));
  const runtimeFlags = ["--browser", browser, "--ffmpeg", ffmpeg];
  const variables = {
    duration: 10, pace: 1, title: "音频技术夹具", point1: "原生模板节奏", draw1Text: "默认配乐",
    point2: "音乐关闭", draw2Text: "保留画面", point3: "分段映射", draw3Text: "单一混音器",
    highlightIndex: 1,
  };
  const sourceCueBindings = [
    { cueIndex: 1, kind: "point", sourceWord: "海量", word: null },
    { cueIndex: 2, kind: "draw", sourceWord: "文字", word: null },
    { cueIndex: 3, kind: "point", sourceWord: "学会", word: null },
    { cueIndex: 4, kind: "draw", sourceWord: "下一个词", word: null },
    { cueIndex: 5, kind: "point", sourceWord: "没人教", word: null },
    { cueIndex: 6, kind: "draw", sourceWord: "不知道", word: null },
    { cueIndex: 7, kind: "highlight", sourceWord: "照样", word: null },
  ];
  const blueprint = {
    format: "laohu.huashu-film-blueprint/1", width: 1920, height: 1080, fps: 30,
    clock: { kind: "film-global", durationSec: 20 },
    segments: [
      { id: "music-off", renderer: "laohu-native-om-template", templateId: "laohu-motion-whiteboard", variables: structuredClone(variables), omMusic: { off: true }, sourceCueBindings, startSec: 0, endSec: 10 },
      { id: "default-preset", renderer: "laohu-native-om-template", templateId: "laohu-motion-whiteboard", variables: structuredClone(variables), sourceCueBindings, startSec: 10, endSec: 20 },
    ],
  };
  const blueprintPath = path.join(inputRoot, "default-preset-film-blueprint.json");
  const filmOutput = path.join(outputRoot, "default-preset-picture-only.mp4");
  const filmManifestPath = path.join(outputRoot, "default-preset-film-manifest.json");
  await fs.writeFile(blueprintPath, JSON.stringify(blueprint, null, 2) + "\n");
  const render = invoke([
    "render", "--film-blueprint", blueprintPath, "--output", filmOutput, "--work-root", workRoot,
    "--manifest", filmManifestPath, ...runtimeFlags,
  ], { timeout: 900_000 });
  assertCliOk(render, "native OM default-preset Film render");
  const filmManifest = JSON.parse(await fs.readFile(filmManifestPath, "utf8"));
  assert.equal(filmManifest.render.durationSec, 20);
  assert.equal(filmManifest.nativeSourceCompositions.length, 0, "this fixture contains no ABC scores");
  assert.equal(filmManifest.nativeSourcePresetPlans.length, 1, "music.off must omit only its own source preset stem");
  const sourcePreset = filmManifest.nativeSourcePresetPlans[0];
  assert.equal(sourcePreset.segmentId, "default-preset");
  assert.equal(sourcePreset.timeMapId, "time:default-preset");
  assert.equal(sourcePreset.sourceDeclaration.duration, 10);
  assert.deepEqual(sourcePreset.sourceDeclaration.music, {});
  assert.equal(sourcePreset.sourcePlan.duration, 10);
  assert.ok(Object.keys(sourcePreset.sourceDeclaration.labels).length > 0, "the original p0 scene labels must reach score.plan");
  const offSceneRecord = filmManifest.sourceScenes.find((row) => row.segmentId === "music-off");
  const offScene = JSON.parse(await fs.readFile(path.resolve(path.dirname(filmManifestPath), offSceneRecord.path), "utf8"));
  assert.equal(offScene.huashuMotionRuntime.sourceDeclaration.music.off, true, "omMusic.off must be observed through the original OM.music API");
  assert.ok(offScene.audioEvents.some((event) => event.sourceAudio?.kind === "declared-sfx"), "music.off leaves original declared SFX available to the canonical audio plan");

  const audioProject = path.join(runRoot, "audio-project");
  const assetsDir = path.join(audioProject, "assets");
  await Promise.all([audioProject, assetsDir].map((directory) => fs.mkdir(directory, { recursive: true })));
  const request = { format: "laohu.motion.huashu-audio-request/1", musicMixGainDb: -4 };
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 20, sampleRate: 48000, channels: 2,
    events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [],
  };
  const requestPath = path.join(audioProject, "request.json");
  const basePlanPath = path.join(audioProject, "base-plan.json");
  const outputPlan = path.join(audioProject, "audio-plan.json");
  const audioReceiptPath = path.join(audioProject, "audio-plan-receipt.json");
  await fs.writeFile(requestPath, JSON.stringify(request, null, 2) + "\n");
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan, null, 2) + "\n");
  const verifiedFilm = await verifyFilmManifest(filmManifestPath);
  const generated = await generatePlan({
    request, basePlan, basePlanPath, film: verifiedFilm,
    inputFiles: [requestPath, basePlanPath, filmManifestPath],
    assetsDir, projectRoot: audioProject, outputPlan, manifestPath: audioReceiptPath,
  });
  const musicTracks = generated.plan.tracks.filter((track) => track.bus === "music");
  assert.equal(musicTracks.length, 1, "the default source plan creates one music track without mixing source SFX twice");
  assert.equal(musicTracks[0].timeMapId, "time:default-preset");
  assert.equal(musicTracks[0].gainDb, -4, "musicMixGainDb applies once after source stem rendering");
  assert.equal(generated.plan.timeMaps.find((row) => row.id === musicTracks[0].timeMapId).filmStartSec, 10, "the native stem starts at its segment's nonzero Film time");
  assert.equal(generated.manifest.alignment.nativeSourceMusic.length, 1);
  assert.equal(generated.manifest.alignment.nativeSourceMusic[0].kind, "default-score-preset");
  assert.equal(generated.manifest.alignment.nativeSourceMusic[0].sourcePlanSha256, sourcePreset.sourcePlanSha256);
  assert.equal(generated.manifest.alignment.nativeSourceMusic[0].sourceMusicTargetLufs, -18);
  assert.equal(generated.manifest.composition.status, "original OM source music");
  assert.equal(generated.manifest.composition.defaultPresetSegments[0].segmentId, "default-preset");
  assert.equal(generated.manifest.alignment.nativeSourceMusicSuppression, null);
  assert.match(generated.manifest.runtime.api, /score\.plan\/renderScore/);
  assert.equal(generated.manifest.runtime.sourceMixdownUsed, false);
  assert.ok(generated.manifest.alignment.nativeSourceSoundtrackSelection.reasons.includes("separate-music-mix-gain"), "independent music gain keeps the music-off source SFX on the stems route");
  assert.ok(generated.plan.events.some((event) => event.eventId.startsWith("om.music-off.declared-sfx.")), "music-off SFX remain separately editable when the request asks for independent music gain");
  assert.equal(generated.manifest.runtime.finalMixer, "scripts/audio.mjs remains the sole final audio-plan mixer");
  const musicAsset = generated.plan.assets.find((asset) => asset.id === musicTracks[0].assetId);
  const musicAssetPath = path.resolve(path.dirname(outputPlan), musicAsset.file);
  const musicBytes = await fs.readFile(musicAssetPath);
  assert.equal(musicAsset.source.outputKind, "native-om-original-renderScore-preset-stereo-music");
  assert.ok(musicBytes.length > 100_000, "the source plan must render a non-empty music-only float WAV stem");

  const audioCli = path.join(skillDir, "scripts", "audio.mjs");
  const mixedWav = path.join(audioProject, "mixed.wav");
  const audioManifestPath = path.join(audioProject, "mixed-manifest.json");
  const finalVideo = path.join(audioProject, "final-with-audio.mp4");
  const canonicalEventScenePath = path.resolve(path.dirname(filmManifestPath), filmManifest.audioEventScene.path);
  const audioRun = spawnSync(process.execPath, [
    audioCli, "--plan", outputPlan, "--output", mixedWav, "--manifest", audioManifestPath,
    "--cache-dir", path.join(audioProject, ".cache", "tmp", "audio"), "--ffmpeg", ffmpeg,
    "--scene", canonicalEventScenePath, "--allow-generated-preview", "--video", filmOutput, "--final-output", finalVideo,
  ], { cwd: repoRoot, encoding: "utf8", timeout: 900_000, maxBuffer: 32 * 1024 * 1024, env: process.env });
  assert.equal(audioRun.error, undefined, audioRun.error?.message);
  assert.equal(audioRun.status, 0, "default native preset final audio.mjs mix failed\nstdout:\n" + audioRun.stdout + "\nstderr:\n" + audioRun.stderr);
  const audioManifest = JSON.parse(await fs.readFile(audioManifestPath, "utf8"));
  assert.equal(audioManifest.audioStream, true);
  const ffprobe = path.join(path.dirname(ffmpeg), "ffprobe");
  const finalProbe = spawnSync(ffprobe, ["-v", "error", "-show_streams", "-of", "json", finalVideo], { encoding: "utf8", timeout: 60_000 });
  assert.equal(finalProbe.status, 0, finalProbe.stderr || finalProbe.error?.message);
  const streams = JSON.parse(finalProbe.stdout).streams;
  assert.equal(streams.filter((stream) => stream.codec_type === "video").length, 1);
  assert.equal(streams.filter((stream) => stream.codec_type === "audio").length, 1);

  const presetMixdownProject = path.join(runRoot, "default-source-mixdown-project");
  const presetMixdownAssets = path.join(presetMixdownProject, "assets");
  await Promise.all([presetMixdownProject, presetMixdownAssets].map((directory) => fs.mkdir(directory, { recursive: true })));
  const presetMixdownRequest = { format: "laohu.motion.huashu-audio-request/1" };
  const presetMixdownRequestPath = path.join(presetMixdownProject, "request.json");
  const presetMixdownBasePath = path.join(presetMixdownProject, "base-plan.json");
  const presetMixdownOutputPath = path.join(presetMixdownProject, "audio-plan.json");
  const presetMixdownReceiptPath = path.join(presetMixdownProject, "audio-plan-receipt.json");
  await fs.writeFile(presetMixdownRequestPath, JSON.stringify(presetMixdownRequest, null, 2) + "\n");
  await fs.writeFile(presetMixdownBasePath, JSON.stringify(basePlan, null, 2) + "\n");
  const presetMixdown = await generatePlan({
    request: presetMixdownRequest, basePlan, basePlanPath: presetMixdownBasePath, film: verifiedFilm,
    inputFiles: [presetMixdownRequestPath, presetMixdownBasePath, filmManifestPath],
    assetsDir: presetMixdownAssets, projectRoot: presetMixdownProject,
    outputPlan: presetMixdownOutputPath, manifestPath: presetMixdownReceiptPath,
  });
  assert.equal(presetMixdown.plan.tracks.length, 2, "the default preset and music-off SFX group each use one source soundtrack track");
  const presetMixdownTrack = presetMixdown.plan.tracks.find((track) => track.timeMapId === "time:default-preset");
  const sfxOnlyTrack = presetMixdown.plan.tracks.find((track) => track.timeMapId === "time:music-off");
  assert.ok(presetMixdownTrack && sfxOnlyTrack, "both source segments must keep their own native timeMap");
  assert.equal(presetMixdownTrack.gainDb, 0);
  assert.equal(sfxOnlyTrack.gainDb, 0);
  assert.deepEqual(presetMixdown.plan.events, [], "native SFX baked into either source mixdown must not be duplicated as audio-plan events");
  const defaultSceneRecord = filmManifest.sourceScenes.find((row) => row.segmentId === "default-preset");
  const defaultScene = JSON.parse(await fs.readFile(path.resolve(path.dirname(filmManifestPath), defaultSceneRecord.path), "utf8"));
  assert.equal(presetMixdown.manifest.alignment.nativeSourceSoundtracks.length, 2);
  const defaultSourceMixdown = presetMixdown.manifest.alignment.nativeSourceSoundtracks.find((row) => row.segmentId === "default-preset");
  const sfxOnlySourceMixdown = presetMixdown.manifest.alignment.nativeSourceSoundtracks.find((row) => row.segmentId === "music-off");
  assert.ok(defaultSourceMixdown && sfxOnlySourceMixdown);
  assert.deepEqual(defaultSourceMixdown.bakedCanonicalEvents.map((row) => row.eventId).sort(), defaultScene.audioEvents.map((event) => event.id).sort());
  assert.equal(sfxOnlySourceMixdown.kind, "sfx-only");
  assert.equal(sfxOnlySourceMixdown.sourceMusicOff, true);
  assert.equal(sfxOnlySourceMixdown.sourceMixdown.musicOn, false);
  assert.equal(sfxOnlySourceMixdown.sourceMixdown.scoreSha256, null);
  assert.equal(sfxOnlySourceMixdown.sourceMixdown.sourceHitCount, offScene.huashuMotionRuntime.sourceDeclaration.hits.length);
  assert.deepEqual(sfxOnlySourceMixdown.bakedCanonicalEvents.map((row) => row.eventId).sort(), offScene.audioEvents.map((event) => event.id).sort());
  assert.equal(sfxOnlyTrack.sourceProcessing.sourceKind, "sfx-only");
  assert.equal(presetMixdown.manifest.runtime.sourceMixdownUsed, true);
  assert.equal(presetMixdown.manifest.alignment.nativeSourceMusic.length, 0);
  assert.deepEqual(presetMixdown.manifest.alignment.nativeSourceSoundtrackSelection.selectedKinds.sort(), ["default-score-preset", "sfx-only"]);
  const presetMixdownAsset = presetMixdown.plan.assets.find((asset) => asset.id === presetMixdownTrack.assetId);
  const presetMixdownAssetPath = path.resolve(path.dirname(presetMixdownOutputPath), presetMixdownAsset.file);
  const presetMixdownBytes = await fs.readFile(presetMixdownAssetPath);
  assert.equal(presetMixdownAsset.source.outputKind, "native-om-original-sound-mixdown-stereo-soundtrack");
  const sfxOnlyAsset = presetMixdown.plan.assets.find((asset) => asset.id === sfxOnlyTrack.assetId);
  const sfxOnlyAssetPath = path.resolve(path.dirname(presetMixdownOutputPath), sfxOnlyAsset.file);
  const sfxOnlyBytes = await fs.readFile(sfxOnlyAssetPath);
  assert.equal(sfxOnlyAsset.source.outputKind, "native-om-original-sound-mixdown-stereo-soundtrack");
  let originalPresetMixdownWav = presetMixdownBytes;
  let originalSfxOnlyWav = sfxOnlyBytes;
  if (maintenanceSourceAvailable) {
    const upstream = await loadUpstream();
    const originalPresetMixdown = upstream.sound.mixdown(sourcePreset.sourceDeclaration, { voiced: false, score: null });
    originalPresetMixdownWav = floatWav(originalPresetMixdown.out2);
    assert.deepEqual(presetMixdownBytes, originalPresetMixdownWav, "default preset asset must be byte-identical to original sound.mixdown PCM");
    const originalSfxOnlyMixdown = upstream.sound.mixdown(offScene.huashuMotionRuntime.sourceDeclaration, { voiced: false, score: null });
    assert.equal(originalSfxOnlyMixdown.musicOn, false, "original p0 music.off keeps music disabled while sound.mixdown still renders its FX group");
    originalSfxOnlyWav = floatWav(originalSfxOnlyMixdown.out2);
    assert.deepEqual(sfxOnlyBytes, originalSfxOnlyWav, "music-off SFX asset must be byte-identical to the pinned original sound.mixdown output");
  } else {
    process.stderr.write("SOURCE_PCM_PARITY_SKIP: MOTION_SOURCE_ROOT is unset; local preset/SFX asset-to-mixer behavior remains checked\n");
  }
  assert.equal(wavFacts(sfxOnlyBytes).overRangeSampleCount, 0);
  assert.ok(wavFacts(sfxOnlyBytes).peakAbs <= 1);
  assert.equal(wavFacts(presetMixdownBytes).overRangeSampleCount, 0);
  assert.ok(wavFacts(presetMixdownBytes).peakAbs <= 1);
  const presetMixdownMixedWav = path.join(presetMixdownProject, "mixed.wav");
  const presetMixdownAudioManifest = path.join(presetMixdownProject, "mixed-manifest.json");
  const presetMixdownFinalVideo = path.join(presetMixdownProject, "final-with-audio.mp4");
  const presetMixdownMux = spawnSync(process.execPath, [
    audioCli, "--plan", presetMixdownOutputPath, "--output", presetMixdownMixedWav,
    "--manifest", presetMixdownAudioManifest, "--cache-dir", path.join(presetMixdownProject, ".cache", "tmp", "audio"),
    "--ffmpeg", ffmpeg, "--scene", canonicalEventScenePath, "--allow-generated-preview",
    "--video", filmOutput, "--final-output", presetMixdownFinalVideo,
  ], { cwd: repoRoot, encoding: "utf8", timeout: 900_000, maxBuffer: 32 * 1024 * 1024, env: process.env });
  assert.equal(presetMixdownMux.error, undefined, presetMixdownMux.error?.message);
  assert.equal(presetMixdownMux.status, 0, "default preset source mixdown final mux failed\nstdout:\n" + presetMixdownMux.stdout + "\nstderr:\n" + presetMixdownMux.stderr);
  const mixedWavFacts = wavFacts(await fs.readFile(presetMixdownMixedWav));
  assert.equal(mixedWavFacts.overRangeSampleCount, 0, "RIFF full-scale scan must start at the actual data chunk after the fmt chunk");
  assert.ok(mixedWavFacts.peakAbs <= 1, "final audio.mjs PCM must retain the pinned source limiter peak");
  const presetSegmentPcm = rawFloatPcm(ffmpeg, presetMixdownMixedWav, 10, 20);
  const sfxOnlySegmentPcm = rawFloatPcm(ffmpeg, presetMixdownMixedWav, 0, 10);
  assert.deepEqual(presetSegmentPcm, floatPcmFromWav(originalPresetMixdownWav), "nonzero Film timeMap must preserve the original default-preset mixdown PCM");
  assert.deepEqual(sfxOnlySegmentPcm, floatPcmFromWav(originalSfxOnlyWav), "audio.mjs must preserve the original music-off SFX group PCM with no duplicate canonical events");
  assert.ok(floatPeak(presetSegmentPcm) <= 1 && floatPeak(sfxOnlySegmentPcm) <= 1, "original source limiter peaks must survive the final audio-plan assembly");
  const ffprobeForPreset = path.join(path.dirname(ffmpeg), "ffprobe");
  assert.deepEqual(videoPacketHashes(ffprobeForPreset, filmOutput), videoPacketHashes(ffprobeForPreset, presetMixdownFinalVideo), "copy-muxed video packets must remain byte-identical to the picture-only source");

  const explicitProject = path.join(runRoot, "explicit-audio-project");
  const explicitAssets = path.join(explicitProject, "assets");
  await Promise.all([explicitProject, explicitAssets].map((directory) => fs.mkdir(directory, { recursive: true })));
  const overrideScore = "X:1\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\nC D E F |";
  const overrideRequest = {
    format: "laohu.motion.huashu-audio-request/1",
    composition: { scoreText: overrideScore, seed: "explicit-film-choice", durationSec: 20 },
    scoreSha256: createHash("sha256").update(overrideScore).digest("hex"),
    bindings: { scoreSha256: createHash("sha256").update(overrideScore).digest("hex") },
    musicMixGainDb: -2,
  };
  const overrideRequestPath = path.join(explicitProject, "request.json");
  const overrideBasePath = path.join(explicitProject, "base-plan.json");
  const overrideOutputPath = path.join(explicitProject, "audio-plan.json");
  const overrideReceiptPath = path.join(explicitProject, "audio-plan-receipt.json");
  await fs.writeFile(overrideRequestPath, JSON.stringify(overrideRequest, null, 2) + "\n");
  await fs.writeFile(overrideBasePath, JSON.stringify(basePlan, null, 2) + "\n");
  const explicitResult = await generatePlan({
    request: overrideRequest, basePlan, basePlanPath: overrideBasePath, film: verifiedFilm,
    inputFiles: [overrideRequestPath, overrideBasePath, filmManifestPath],
    assetsDir: explicitAssets, projectRoot: explicitProject, outputPlan: overrideOutputPath, manifestPath: overrideReceiptPath,
  });
  assert.equal(explicitResult.plan.tracks.filter((track) => track.bus === "music").length, 1);
  assert.equal(explicitResult.plan.tracks.find((track) => track.bus === "music").timeMapId, undefined, "the explicit film-wide score keeps its own clock");
  assert.deepEqual(explicitResult.manifest.alignment.nativeSourceMusic, [], "the Film source preset is preserved as evidence but not duplicated under an explicit request");
  assert.deepEqual(explicitResult.manifest.alignment.nativeSourceMusicSuppression, {
    count: 1, scoreCount: 0, presetCount: 1, reason: "explicit-audio-request-selected-the-film-music-source",
  });

  const lockedProject = path.join(runRoot, "locked-bgm-project");
  const lockedAssets = path.join(lockedProject, "assets");
  await Promise.all([lockedProject, lockedAssets].map((directory) => fs.mkdir(directory, { recursive: true })));
  const lockedAssetPath = path.join(lockedAssets, "locked-bgm.wav");
  await fs.copyFile(musicAssetPath, lockedAssetPath);
  const lockedAsset = { ...musicAsset, id: "locked-existing-music", file: "assets/locked-bgm.wav" };
  const lockedTrack = {
    id: "locked-existing-track", assetId: lockedAsset.id, bus: "music", startSec: 0, locked: true,
  };
  const lockedBasePlan = { ...basePlan, assets: [lockedAsset], tracks: [lockedTrack] };
  const lockedRequest = { format: "laohu.motion.huashu-audio-request/1", musicMixGainDb: 0 };
  const lockedRequestPath = path.join(lockedProject, "request.json");
  const lockedBasePath = path.join(lockedProject, "base-plan.json");
  const lockedOutputPath = path.join(lockedProject, "audio-plan.json");
  const lockedReceiptPath = path.join(lockedProject, "audio-plan-receipt.json");
  await fs.writeFile(lockedRequestPath, JSON.stringify(lockedRequest, null, 2) + "\n");
  await fs.writeFile(lockedBasePath, JSON.stringify(lockedBasePlan, null, 2) + "\n");
  const lockedResult = await generatePlan({
    request: lockedRequest, basePlan: lockedBasePlan, basePlanPath: lockedBasePath, film: verifiedFilm,
    inputFiles: [lockedRequestPath, lockedBasePath, filmManifestPath],
    assetsDir: lockedAssets, projectRoot: lockedProject, outputPlan: lockedOutputPath, manifestPath: lockedReceiptPath,
  });
  assert.deepEqual(lockedResult.plan.tracks.filter((track) => track.bus === "music"), [lockedTrack], "existing locked BGM keeps priority over automatic source default music");
  assert.deepEqual(lockedResult.manifest.alignment.nativeSourceMusic, []);
  assert.deepEqual(lockedResult.manifest.alignment.nativeSourceMusicSuppression, {
    count: 1, scoreCount: 0, presetCount: 1, reason: "existing-audio-plan-music-track-preserved",
  });
  assert.deepEqual(lockedResult.manifest.composition, { status: "existing audio-plan music track preserved", trackIds: ["locked-existing-track"] });
});

test("Film /2 separates canonical outer event bindings from native OM source mixdown ownership through audio.mjs", async (t) => {
  const { browser, ffmpeg } = nativeRuntime();
  try { await fs.access(browser); } catch {
    t.skip("requires the caller's existing Chrome/Chromium; this test does not install a browser");
    return;
  }
  if (!ffmpeg) {
    t.skip("requires an existing FFmpeg executable, preferably the project-approved FFmpeg 7 runtime");
    return;
  }
  const cacheRoot = path.resolve(process.env.MOTION_TEST_TMP || path.join(repoRoot, ".cache", "tmp"));
  await fs.mkdir(cacheRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(cacheRoot, "native-om-film-v2-audio-e2e-"));
  if (process.env.MOTION_PRESERVE_NATIVE_OM_E2E === "1") process.stderr.write("NATIVE_OM_FILM_V2_AUDIO_E2E_ARTIFACTS " + runRoot + "\n");
  else t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
  const workRoot = path.join(repoRoot, ".cache", "tmp", "video-shotcraft", "motion-composition-integration", path.basename(runRoot));
  const inputRoot = path.join(runRoot, "inputs"), outputRoot = path.join(runRoot, "outputs");
  const audioProject = path.join(runRoot, "audio-project"), assetsDir = path.join(audioProject, "assets");
  await Promise.all([workRoot, inputRoot, outputRoot, audioProject, assetsDir].map((directory) => fs.mkdir(directory, { recursive: true })));
  const runtimeFlags = ["--browser", browser, "--ffmpeg", ffmpeg];
  const variables = { duration: 10, pace: 1, title: "音频交接技术夹具", point1: "原生声音归属", draw1Text: "原混音接口", point2: "事件时钟", draw2Text: "Film 合并场景", point3: "最终消费者", draw3Text: "一次输出", highlightIndex: 1 };
  const score = "X:1\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\nV:lead inst=piano\nC D !hit!E F |";
  const sourceCueBindings = [
    { cueIndex: 1, kind: "point", sourceWord: "海量", word: null }, { cueIndex: 2, kind: "draw", sourceWord: "文字", word: null },
    { cueIndex: 3, kind: "point", sourceWord: "学会", word: null }, { cueIndex: 4, kind: "draw", sourceWord: "下一个词", word: null },
    { cueIndex: 5, kind: "point", sourceWord: "没人教", word: null }, { cueIndex: 6, kind: "draw", sourceWord: "不知道", word: null },
    { cueIndex: 7, kind: "highlight", sourceWord: "照样", word: null },
  ];
  const outerScene = {
    format: "motion-scene-v1", version: 1, width: 1920, height: 1080, fps: 30, duration: 11, timeBasis: "film-global", phases: [], objects: [],
    audioEvents: [
      { id: "outer-canonical-overlay-event", segmentId: "native-board", filmTimeSec: 8.25, timeBasis: "film-global", kind: "overlay-cue" },
      { id: "outer-html-event", segmentId: "native-html", filmTimeSec: 10.5, timeBasis: "film-global", kind: "html-cue" },
    ],
  };
  const outerScenePath = path.join(inputRoot, "outer-canonical-overlay-scene.json");
  const outerSceneBytes = Buffer.from(JSON.stringify(outerScene, null, 2) + "\n");
  await fs.writeFile(outerScenePath, outerSceneBytes);
  const blueprint = {
    format: "laohu.huashu-film-blueprint/2", width: 1920, height: 1080, fps: 30,
    clock: { kind: "film-global", durationSec: 11 }, audioEventScenePath: outerScenePath,
    audioEventSceneSha256: createHash("sha256").update(outerSceneBytes).digest("hex"),
    segments: [
      { id: "native-board", compositionGroupId: "group-native", renderer: "laohu-native-om-template", templateId: "laohu-motion-whiteboard", variables,
        omCues: { words: [{ word: "上下文", start: 0.1, end: 0.35 }] }, omScore: score, sourceCueBindings, startSec: 0, endSec: 10 },
      { id: "native-html", compositionGroupId: "group-native", renderer: "native-html-canvas-template", templateId: "motion-code-video-showcase-big-card",
        parameters: { layout: 2, index: 1, total: 3, color: "#ffcf5c", first: "本地", keyword: "音频链", brand: "老胡造梦" }, startSec: 10, endSec: 11,
        incomingTransition: { id: "laohu-motion-fade", method: "crossfade", windowFrames: 10, parameters: {}, mode: "boundary-frame", boundaryReason: "完整原生白板切换到原生代码卡，采用明确边界帧交接。" } },
    ],
    compositionGroups: [{ id: "group-native", segmentIds: ["native-board", "native-html"] }], transitionEdges: [],
  };
  const blueprintPath = path.join(inputRoot, "film-blueprint.json"), filmOutput = path.join(outputRoot, "picture-only-film.mp4"), filmManifestPath = path.join(outputRoot, "film-manifest.json");
  await fs.writeFile(blueprintPath, JSON.stringify(blueprint, null, 2) + "\n");
  const filmRender = invoke(["render", "--film-blueprint", blueprintPath, "--output", filmOutput, "--work-root", workRoot, "--manifest", filmManifestPath, ...runtimeFlags], { timeout: 900_000 });
  assertCliOk(filmRender, "complete native OM Film /2 render");
  const filmManifest = JSON.parse(await fs.readFile(filmManifestPath, "utf8"));
  assert.equal(filmManifest.format, "laohu.motion-film-manifest/2");
  assert.equal(filmManifest.segments[0].renderer, "laohu-native-om-template");
  assert.equal(filmManifest.segments[1].renderer, "native-html-canvas-template", "one complete native HTML source remains a separate non-OM base segment");
  assert.equal(filmManifest.transitions.length, 1, "the /2 Film post-process runs the pinned transition renderer for the native source boundary");
  assert.equal(filmManifest.transitions[0].method, "crossfade");
  assert.equal(filmManifest.transitions[0].mode, "boundary-frame");
  assert.deepEqual(filmManifest.transitions[0].windowFrameRange, { startFrame: 295, endFrame: 305 });
  assert.equal(filmManifest.transitions[0].frames.length, 10);
  assert.equal(filmManifest.transitions[0].renderedOutput.frameCount, 10);
  assert.equal(filmManifest.assembly.method, "remotion-composition-with-picture-only-local-base-segments-then-source-transition-postprocess");
  assert.equal(filmManifest.assembly.transitions[0].sourceFunction, "TRANSITIONS.crossfade");
  assert.equal(filmManifest.nativeBaseSources.length, 1);
  assert.equal(filmManifest.nativeSourceCompositions.length, 1, "original OM score remains a native-source declaration");
  const canonicalScenePath = path.resolve(path.dirname(filmManifestPath), filmManifest.audioEventScene.path);
  const canonicalScene = JSON.parse(await fs.readFile(canonicalScenePath, "utf8"));
  const nativeHit = canonicalScene.audioEvents.find((event) => event.sourceAudio?.kind === "score-sfx");
  const outerEvent = canonicalScene.audioEvents.find((event) => event.id === "outer-canonical-overlay-event");
  const htmlEvent = canonicalScene.audioEvents.find((event) => event.id === "outer-html-event");
  assert.ok(nativeHit, "native source score hit is projected into the canonical Film scene");
  assert.ok(outerEvent, "caller overlay event survives source projection");
  assert.ok(htmlEvent, "non-OM native HTML source segment retains its canonical event binding");
  const bindings = new Map(filmManifest.audioEventBindings.map((row) => [row.eventId, row]));
  for (const eventId of [nativeHit.id, outerEvent.id, htmlEvent.id]) {
    const binding = bindings.get(eventId);
    assert.ok(binding);
    assert.equal(binding.sourceScenePath, filmManifest.audioEventScene.path, "native and outer events resolve against canonical sourceScenes");
    assert.equal(binding.sourceSceneSha256, filmManifest.audioEventScene.sha256);
  }
  assert.deepEqual(filmManifest.sourceScenes.find((row) => row.segmentId === "native-board"), {
    segmentId: "native-board", path: filmManifest.audioEventScene.path, sha256: filmManifest.audioEventScene.sha256,
  });

  const request = { format: "laohu.motion.huashu-audio-request/1" };
  const basePlan = { schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 11, sampleRate: 48000, channels: 2,
    events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [] };
  const requestPath = path.join(audioProject, "request.json"), basePlanPath = path.join(audioProject, "base-plan.json");
  const outputPlan = path.join(audioProject, "audio-plan.json"), audioReceiptPath = path.join(audioProject, "audio-plan-receipt.json");
  await fs.writeFile(requestPath, JSON.stringify(request, null, 2) + "\n");
  await fs.writeFile(basePlanPath, JSON.stringify(basePlan, null, 2) + "\n");
  const verifiedFilm = await verifyFilmManifest(filmManifestPath);
  const generated = await generatePlan({ request, basePlan, basePlanPath, film: verifiedFilm, inputFiles: [requestPath, basePlanPath, filmManifestPath],
    assetsDir, projectRoot: audioProject, outputPlan, manifestPath: audioReceiptPath });
  assert.equal(generated.plan.tracks.length, 1, "original sound.mixdown remains one owner of the native source soundtrack");
  assert.equal(generated.plan.events.length, 0, "original hits already baked into sound.mixdown are not duplicated in the audio plan");
  assert.equal(generated.plan.tracks[0].sourceProcessing.format, "laohu.motion.source-premix-processing/2");
  assert.equal(generated.plan.tracks[0].sourceProcessing.nativeBaseSourceContract, "nativeBaseSources/1");
  assert.equal(generated.manifest.alignment.nativeSourceSoundtracks[0].sourceSceneSha256, filmManifest.nativeBaseSources[0].sourceSceneSha256);

  const mixedWav = path.join(audioProject, "mixed.wav"), audioManifestPath = path.join(audioProject, "mixed-manifest.json"), finalVideo = path.join(audioProject, "final-with-audio.mp4");
  const audioRun = spawnSync(process.execPath, [path.join(skillDir, "scripts", "audio.mjs"), "--plan", outputPlan, "--output", mixedWav,
    "--manifest", audioManifestPath, "--cache-dir", path.join(audioProject, ".cache", "tmp", "audio"), "--ffmpeg", ffmpeg,
    "--scene", canonicalScenePath, "--allow-generated-preview", "--video", filmOutput, "--final-output", finalVideo],
  { cwd: repoRoot, encoding: "utf8", timeout: 900_000, maxBuffer: 32 * 1024 * 1024, env: process.env });
  assert.equal(audioRun.error, undefined, audioRun.error?.message);
  assert.equal(audioRun.status, 0, "Film /2 source-premix must pass audio.mjs final consumer\nstdout:\n" + audioRun.stdout + "\nstderr:\n" + audioRun.stderr);
  const audioManifest = JSON.parse(await fs.readFile(audioManifestPath, "utf8"));
  assert.equal(audioManifest.audioStream, true);
  const finalProbe = spawnSync(path.join(path.dirname(ffmpeg), "ffprobe"), ["-v", "error", "-show_streams", "-of", "json", finalVideo], { encoding: "utf8", timeout: 60_000 });
  assert.equal(finalProbe.status, 0, finalProbe.stderr || finalProbe.error?.message);
  const streams = JSON.parse(finalProbe.stdout).streams;
  assert.equal(streams.filter((stream) => stream.codec_type === "video").length, 1);
  assert.equal(streams.filter((stream) => stream.codec_type === "audio").length, 1);
});
