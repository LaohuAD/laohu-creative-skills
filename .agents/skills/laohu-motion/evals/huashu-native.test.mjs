import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const evalDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(evalDir, "..");
const repoRoot = path.resolve(skillDir, "../../..");
const cli = path.join(skillDir, "scripts", "templates.mjs");
const NATIVE_SPEC_FORMAT = "laohu.huashu-native-template-spec/1";

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
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }));
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
      assert.ok(preparedSpec.sourceVerification.checkedFiles >= 95, "the native entry must verify the main pinned CLI/runtime/template closure");
      assert.ok(preparedSpec.projectFiles.some((file) => file.path === "index.html"));

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
