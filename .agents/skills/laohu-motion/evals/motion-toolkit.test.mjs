import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(skillDir, "../../..");
const renderCli = path.join(skillDir, "scripts", "render.mjs");
const templatesCli = path.join(skillDir, "scripts", "templates.mjs");
const catalogPath = path.join(skillDir, "templates", "catalog.json");
const validationRoot = process.env.MOTION_VALIDATION_DIR ? path.resolve(process.env.MOTION_VALIDATION_DIR) : path.join(repoRoot, ".cache", "validation", "motion-blocks");
const tempRoot = process.env.MOTION_TEST_TMP ? path.resolve(process.env.MOTION_TEST_TMP) : path.join(repoRoot, ".cache", "tmp", "motion-blocks");
const ffmpeg = process.env.MOTION_FFMPEG || "/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg";
const ffprobe = process.env.MOTION_FFPROBE || path.join(path.dirname(ffmpeg), "ffprobe");
const browser = process.env.MOTION_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function run(executable, args, label, env = {}) {
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  assert.equal(result.error, undefined, `${label}: ${result.error?.message || "process spawn failed"}`);
  assert.equal(result.status, 0, `${label} failed (status=${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result.stdout;
}

const DRAW_MODULE = String.raw`
(() => {
  const TYPE = "custom:laohu-motion-toolkit-probe";
  window.MOTION_RENDERERS = {
    [TYPE](ctx, object, timeSec, scene) {
      const data = object.data;
      const p = window.MO.anim(timeSec, 0, scene.duration, window.MO.sineInOut);
      const steppedTime = window.MO.step(timeSec, 12);
      const springProgress = window.MO.spring(timeSec, { duration: 0.5, bounce: 0.15 });
      const impactProgress = window.MO.springHz(timeSec, 2.4, 8);
      const checkpoint = (label) => {
        if (timeSec !== 0.74) return;
        const bytes = ctx.getImageData(0, 0, scene.width, scene.height).data;
        window.MOTION_TOOLKIT_CHECKPOINTS ||= [];
        window.MOTION_TOOLKIT_CHECKPOINTS.push({ label, bytes: new Uint8ClampedArray(bytes) });
      };
      const fit = window.TY.fitFloor(ctx, data.title, 118, 18, data.fontFamily, { maxLines: 1, floor: 12 });
      if (!fit.ok || fit.cut) throw new Error("technical title did not fit the caller-provided font box");
      window.TY.text(ctx, data.title, 16, 20, { size: fit.size, fam: data.fontFamily, color: "#20242a", align: "left" });
      window.TY.rise(ctx, data.caption, 16, 42, p, { size: 11, fam: data.fontFamily, color: "#39424c", align: "left" });
      window.TY.fmt(12345.6, 1);
      checkpoint("typography");

      const yScale = window.CH.lin(0, 10, 152, 86);
      const ticks = window.CH.ticks(0, 10, 4);
      window.CH.grid(ctx, { x: 132, y: 74, w: 168, h: 78 }, ticks, yScale, p, { font: "9px sans-serif", col: "rgba(20,30,40,.18)", zeroCol: "#20242a", labelCol: "#43515f", side: "left" });
      window.CH.bars(ctx, [{ x: 160, v: 4.2 }, { x: 204, v: 7.6 }, { x: 248, v: 6.1 }], yScale, 16, p, { col: "#2e78a8", label: true, font: "9px sans-serif", fmt: (value) => window.TY.fmt(value, 0) });
      window.CH.line(ctx, [[140, 146], [177, 128], [218, 137], [260, 91]], p, { col: "#c92430", lw: 2, headR: 3 });
      window.CH.callout(ctx, timeSec, 0.24, { x: 204, y: yScale(7.6), tx: 285, ty: 58, lines: ["sample"], col: "#20242a", dotCol: "#c92430", font: "9px sans-serif", r: 3 });
      checkpoint("chart");

      const image = window.MOTION_TOOLKIT_SOURCE;
      const imageSize = window.MD.size(image);
      const geometry = window.MD.cover(ctx, image, { x: 16, y: 56, w: 72, h: 50, fit: "contain" });
      const anchor = window.MD.toScreen(geometry, [0.5, 0.5]);
      ctx.fillStyle = "#c92430"; ctx.beginPath(); ctx.arc(anchor[0], anchor[1], 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(58, 135); window.MD.print(ctx, image, 35, 20, { border: 2, caption: data.caption, polaroid: true, shadow: false, tape: true }); ctx.restore();
      window.MD.label(ctx, data.caption, 18, 120, { size: 9, fam: data.fontFamily, maxW: 86, t: timeSec, at: 0.1 });
      checkpoint("media");

      window.UI.icon(ctx, "agent", 290, 28, 20, "#c92430", timeSec);
      window.UI.sheen(ctx, null, p, { x0: 130, x1: 300, width: 18, alpha: 0.16, col: "255,255,255", comp: "lighter" });
      checkpoint("ui");
      const cameraPath = window.CAM.at([
        { t: 0, x: 160, y: 90, z: 1, r: 0 },
        { t: scene.duration, x: 164, y: 88, z: 1.04, r: 0 },
      ], timeSec);
      const camera = window.CAM.track(cameraPath, [{ at: 0.3, kind: "push", k: 0.08, dur: 0.6 }], timeSec);
      const screenAnchor = window.CAM.toScreen(camera, 164 + steppedTime, 88);
      ctx.save(); window.CAM.apply(ctx, camera);
      ctx.fillStyle = "rgba(201,36,48," + Math.max(0.15, Math.min(1, impactProgress)) + ")";
      ctx.beginPath(); ctx.arc(164 + steppedTime, 88, 2 + Math.max(0, Math.min(1, springProgress)), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      window.CAM.with(ctx, camera, (world) => { world.fillStyle = "rgba(46,120,168,.5)"; world.fillRect(157, 82, 2, 2); });
      ctx.fillStyle = "#c92430"; ctx.fillRect(screenAnchor[0] - 1, screenAnchor[1] - 1, 2, 2);
      checkpoint("camera");
      ctx.save(); ctx.translate(138, 44); window.CL.tornRect(ctx, 142, 10, 23, 2); ctx.fillStyle = "rgba(201,36,48,.12)"; ctx.fill(); ctx.restore();
      window.CL.tape(ctx, 118, 58, -0.08, 30);
      window.CL.pin(ctx, 108, 58, "#c92430");
      window.CL.highlight(ctx, 140, 54, 122, 5, p, "rgba(218,207,8,.8)");
      const points = window.CL.stringPts([136, 160], [294, 160], 0.04, 12);
      const cumulative = window.DG.cum(points);
      window.CL.string(ctx, points, cumulative, cumulative.at(-1) * p, { col: "#b8433f", lw: 1.5, shadow: null });
      checkpoint("collage");

      window.MOTION_TOOLKIT_LAST_FRAME = { timeSec, progress: p, fit, imageSize, mappedAnchor: anchor };
    },
  };

  window.MOTION_READY = async () => {
    const scene = window.MOTION_SCENE;
    const source = new Image();
    const probe = scene.objects.find((object) => object.id === "toolkit-probe");
    if (!probe) throw new Error("toolkit probe object is missing");
    source.src = probe.data.imageDataUrl;
    await source.decode();
    window.MOTION_TOOLKIT_SOURCE = source;
    const probeCanvas = document.createElement("canvas");
    probeCanvas.width = scene.width; probeCanvas.height = scene.height;
    const seekTimes = [0, 0.74, 2, 1.26, 0.74];
    const hashes = [];
    const captures = [];
    for (const timeSec of seekTimes) {
      window.MotionCore.drawFrame(probeCanvas, scene, timeSec, window.MOTION_RENDERERS, true);
      const pixels = new Uint8ClampedArray(probeCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, scene.width, scene.height).data);
      captures.push(pixels);
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index += 1) hash = Math.imul(hash ^ pixels[index], 16777619);
      hashes.push((hash >>> 0).toString(16).padStart(8, "0"));
    }
    let differentChannels = 0, maxChannelDelta = 0, sumChannelDelta = 0;
    for (let index = 0; index < captures[1].length; index += 1) {
      const delta = Math.abs(captures[1][index] - captures[4][index]);
      if (delta) differentChannels += 1;
      if (delta > maxChannelDelta) maxChannelDelta = delta;
      sumChannelDelta += delta;
    }
    const initialCalls = Object.fromEntries(Object.entries(window.MOTION_TEMPLATE_EFFECTS.calls));
    const checkpointSnapshots = window.MOTION_TOOLKIT_CHECKPOINTS || [];
    const checkpointLabels = [...new Set(checkpointSnapshots.map((row) => row.label))];
    const checkpointRepeat = Object.fromEntries(checkpointLabels.map((label) => {
      const pair = checkpointSnapshots.filter((row) => row.label === label);
      let differentChannels = 0, maxChannelDelta = 0, sumChannelDelta = 0;
      for (let index = 0; index < pair[0].bytes.length; index += 1) {
        const delta = Math.abs(pair[0].bytes[index] - pair[1].bytes[index]);
        if (delta) differentChannels += 1;
        if (delta > maxChannelDelta) maxChannelDelta = delta;
        sumChannelDelta += delta;
      }
      return [label, { differentChannels, maxChannelDelta, meanChannelDelta: sumChannelDelta / pair[0].bytes.length }];
    }));
    window.MOTION_EVIDENCE ||= {};
    window.MOTION_EVIDENCE.toolkitSeek = {
      assessment: "technical caller-media/font fixture; exact original global functions are called through a custom Motion renderer; not a human visual-quality review",
      sourceMediaLoaded: { width: source.naturalWidth, height: source.naturalHeight, suppliedBySceneData: true },
      font: { family: probe.data.fontFamily, loadedByToolkit: false, callerSupplied: true },
      seekTimes,
      outputHashes: hashes,
      strictRepeatedPixelCheck: { status: differentChannels === 0 ? "PASS" : "FAIL", differentChannels, maxChannelDelta, meanChannelDelta: sumChannelDelta / captures[1].length },
      checkpointRepeat,
      initialProbeCalls: initialCalls,
      frameStateAtEnd: window.MOTION_TOOLKIT_LAST_FRAME,
      sourceMethod: "MotionCore.drawFrame -> custom:laohu-motion-toolkit-probe -> original MO/CAM/TY/CH/MD/UI/CL/DG globals",
    };
    return true;
  };
})();
`;

test("laohu-motion-toolkit composes original source functions with a custom renderer and local DG effects adapter", { timeout: 900_000 }, async (t) => {
  for (const file of [ffmpeg, ffprobe, browser]) await fs.access(file);
  await fs.mkdir(validationRoot, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(validationRoot, `toolkit-e2e-${process.pid}-`));
  const scenePath = path.join(runRoot, "toolkit-scene.json");
  const drawModulePath = path.join(runRoot, "toolkit-draw.js");
  const outputPath = path.join(runRoot, "toolkit.mp4");
  const ffprobePath = path.join(runRoot, "ffprobe.json");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="32" viewBox="0 0 48 32"><rect width="48" height="32" fill="#e9dcc0"/><circle cx="16" cy="16" r="9" fill="#c92430"/><rect x="29" y="7" width="12" height="18" fill="#2e78a8"/></svg>';
  const scene = {
    version: 1,
    width: 320,
    height: 180,
    fps: 30,
    duration: 2,
    background: "#f7f5ef",
    timeBasis: "scene-local",
    objects: [{
      id: "toolkit-probe",
      type: "custom:laohu-motion-toolkit-probe",
      space: "screen",
      data: {
        title: "TOOLKIT",
        caption: "source media",
        fontFamily: "sans-serif",
        imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      },
    },
    { id: "toolkit-dg-target", type: "rect", space: "screen", x: 96, y: 126, width: 20, height: 12, fill: "#242424" },
    {
      id: "toolkit-local-effects",
      type: "custom:laohu-motion-effects",
      space: "screen",
      data: {
        phases: [{ id: "toolkit-emphasis", startSec: 0.1, durationSec: 0.6, timeBasis: "scene-local", curve: "linear" }],
        motionEffects: [
          {
            id: "toolkit-effect-circumscribe",
            effectId: "laohu-motion-dg-circumscribe",
            targetId: "toolkit-dg-target",
            phaseId: "toolkit-emphasis",
            geometry: { rect: { x: 96, y: 126, width: 20, height: 12 } },
            parameters: { color: "#c92430", lineWidth: 1.5, timeWidth: 0.35 },
          },
          {
            id: "toolkit-effect-brace",
            effectId: "laohu-motion-dg-brace",
            targetId: "toolkit-dg-target",
            phaseId: "toolkit-emphasis",
            geometry: { x: 116, y0: 126, y1: 138 },
            parameters: { color: "#c92430", lineWidth: 1.5, depth: 8 },
          },
          {
            id: "toolkit-effect-indicate",
            effectId: "laohu-motion-dg-indicate-frame-pulse",
            targetId: "toolkit-dg-target",
            phaseId: "toolkit-emphasis",
            geometry: { rect: { x: 96, y: 126, width: 20, height: 12 } },
            parameters: { color: "#c92430", lineWidth: 1.5, timeWidth: 0.35, scale: 1 },
          },
        ],
      },
    }],
    events: [],
    bindings: [],
    variables: {},
  };
  await fs.writeFile(scenePath, JSON.stringify(scene, null, 2) + "\n");
  await fs.writeFile(drawModulePath, DRAW_MODULE);
  const env = {
    MOTION_FFMPEG: ffmpeg,
    MOTION_FFPROBE: ffprobe,
    MOTION_BROWSER: browser,
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
  };
  const stdout = run(process.execPath, [
    renderCli,
    "--scene", scenePath,
    "--output", outputPath,
    "--cache-dir", path.join(tempRoot, `toolkit-cache-${path.basename(runRoot)}`),
    "--browser", browser,
    "--ffmpeg", ffmpeg,
    "--template-effects", "laohu-motion-toolkit",
    "--draw-module", drawModulePath,
    "--samples", "0,0.37,0.74,1.96",
    "--overwrite",
  ], "laohu-motion-toolkit render", env);
  const manifestLine = stdout.match(/^MANIFEST\s+(.+)$/m);
  assert.ok(manifestLine, "render.mjs returns the actual technical evidence manifest path");
  const manifestPath = path.resolve(manifestLine[1].trim());
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.frameCount, 60);
  assert.equal(manifest.templateEffects.id, "laohu-motion-toolkit");
  assert.equal(manifest.templateEffects.sourceId, "huashu-art-motion");
  assert.equal(manifest.templateEffects.sourceCommit, "8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c");
  assert.equal(manifest.templateEffects.localRuntime, "templates/runtime/laohu-effects/closure.json");
  assert.equal(manifest.templateEffects.sourceFiles.length, 11);
  assert.ok(manifest.templateEffects.sourceFiles.every((file) => file.localPath && (file.localPath.startsWith("laohu-native-clips/lib/") || file.localPath.startsWith("laohu-effects/"))), "all loaded source functions came from the shared local runtime closure");
  assert.equal(manifest.templateEffects.invocationInstrumentation.includes("body, receiver, arguments, and return value are unchanged"), true);
  assert.equal(manifest.localEffects.validatedInstances.length, 3, "the toolkit scene also passes through the existing local DG effect validator");
  assert.ok(manifest.localEffects.adapter.sha256, "the same-scene DG effects use the existing registered adapter");
  for (const [id, sourceFunction] of [
    ["toolkit-effect-circumscribe", "DG.circumscribe"],
    ["toolkit-effect-brace", "DG.brace"],
    ["toolkit-effect-indicate", "DG.indicate"],
  ]) {
    const row = manifest.localEffects.runtimeEvidence.instances[id];
    assert.ok(row?.calls > 0, `${id} is rendered through the existing local DG adapter`);
    assert.equal(row.sourceFunction, sourceFunction);
  }
  const toolkitSeek = manifest.consumerEvidence?.toolkitSeek;
  assert.ok(toolkitSeek, "custom renderer stores a same-MotionCore out-of-order/repeated seek probe");
  assert.deepEqual(toolkitSeek.seekTimes, [0, 0.74, 2, 1.26, 0.74]);
  assert.deepEqual(toolkitSeek.sourceMediaLoaded, { width: 48, height: 32, suppliedBySceneData: true });
  assert.deepEqual(toolkitSeek.font, { family: "sans-serif", loadedByToolkit: false, callerSupplied: true });
  assert.notEqual(toolkitSeek.outputHashes[0], toolkitSeek.outputHashes[2], "p=1 source state must visibly differ from p=0 in the technical fixture");
  assert.equal(toolkitSeek.strictRepeatedPixelCheck.status, toolkitSeek.strictRepeatedPixelCheck.differentChannels === 0 ? "PASS" : "FAIL");
  for (const id of [
    "MO.anim", "MO.step", "MO.lagged", "MO.sineInOut", "MO.quintOut", "MO.spring", "MO.expoOut", "MO.springHz",
    "CAM.apply", "CAM.with", "CAM.toScreen", "CAM.at", "CAM.track",
    "TY.fitFloor", "TY.rise", "TY.text", "TY.fmt", "TY.tabular",
    "CH.lin", "CH.ticks", "CH.grid", "CH.bars", "CH.line", "CH.callout",
    "MD.size", "MD.cover", "MD.toScreen", "MD.print", "MD.label",
    "UI.icon", "UI.sheen", "CL.tornRect", "CL.tape", "CL.pin", "CL.highlight", "CL.stringPts", "CL.string",
    "DG.cum", "DG.drawPartial",
  ]) {
    assert.ok(toolkitSeek.initialProbeCalls[id] >= 5, `${id} must be called by the technical seek probe: ${toolkitSeek.initialProbeCalls[id]}`);
    assert.ok(manifest.templateEffects.calls[id] >= 60, `${id} must be called for encoded frames: ${manifest.templateEffects.calls[id]}`);
  }
  for (const id of ["DG.circumscribe", "DG.brace", "DG.indicate", "MO.thereAndBack"]) {
    assert.ok(manifest.templateEffects.calls[id] > 0, `${id} is invoked by the same-scene existing local DG effect adapter`);
  }
  const probeStdout = run(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", outputPath], "toolkit ffprobe capture");
  await fs.writeFile(ffprobePath, probeStdout);
  const probe = JSON.parse(probeStdout);
  const video = probe.streams.filter((row) => row.codec_type === "video");
  assert.equal(video.length, 1);
  assert.equal(Number(video[0].nb_read_frames), 60);
  assert.equal(Number(video[0].width), 320);
  assert.equal(Number(video[0].height), 180);

  const filmScene = { ...scene, width: 1920, height: 1080 };
  const filmScenePath = path.join(runRoot, "film-toolkit-scene.json");
  const filmBlueprintPath = path.join(runRoot, "film-toolkit-blueprint.json");
  const filmManifestPath = path.join(runRoot, "film-toolkit-manifest.json");
  const filmOutputPath = path.join(runRoot, "film-toolkit.mp4");
  const filmWorkRoot = path.join(tempRoot, `toolkit-film-${path.basename(runRoot)}`);
  await fs.mkdir(filmWorkRoot, { recursive: true });
  const filmSceneText = JSON.stringify(filmScene, null, 2) + "\n";
  await fs.writeFile(filmScenePath, filmSceneText);
  const drawModuleBytes = await fs.readFile(drawModulePath);
  const filmBlueprint = {
    format: "laohu.huashu-film-blueprint/1",
    width: 1920,
    height: 1080,
    fps: 30,
    clock: { kind: "film-global", durationSec: 2 },
    segments: [{
      id: "toolkit-film-segment",
      renderer: "motion-scene",
      scenePath: path.basename(filmScenePath),
      sceneSha256: createHash("sha256").update(filmSceneText).digest("hex"),
      drawModulePath: path.basename(drawModulePath),
      drawModuleSha256: createHash("sha256").update(drawModuleBytes).digest("hex"),
      templateEffects: "laohu-motion-toolkit",
      startSec: 0,
      endSec: 2,
    }],
  };
  await fs.writeFile(filmBlueprintPath, JSON.stringify(filmBlueprint, null, 2) + "\n");
  const filmStdout = run(process.execPath, [
    templatesCli,
    "render",
    "--film-blueprint", filmBlueprintPath,
    "--output", filmOutputPath,
    "--work-root", filmWorkRoot,
    "--manifest", filmManifestPath,
    "--browser", browser,
    "--ffmpeg", ffmpeg,
  ], "Film/1 toolkit closure render", { timeout: 600_000, env: { ...env, OM_SAMPLES: "off" } });
  const filmManifest = JSON.parse(await fs.readFile(filmManifestPath, "utf8"));
  assert.match(filmStdout, /FRAME_COUNT 60/);
  assert.equal(filmManifest.render.frameCount, 60);
  assert.equal(filmManifest.assembly.audioStream, "absent");
  const filmSegment = filmManifest.segments.find((row) => row.id === "toolkit-film-segment");
  assert.equal(filmSegment.renderer, "motion-scene");
  const filmReceiptPath = path.resolve(path.dirname(filmManifestPath), filmSegment.receiptPath);
  const filmReceipt = JSON.parse(await fs.readFile(filmReceiptPath, "utf8"));
  assert.equal(filmReceipt.templateEffects.id, "laohu-motion-toolkit");
  assert.equal(filmReceipt.templateEffects.sourceId, "huashu-art-motion");
  assert.equal(filmReceipt.templateEffects.sourceCommit, "8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c");
  for (const id of [
    "MO.anim", "MO.step", "MO.lagged", "MO.sineInOut", "MO.quintOut", "MO.spring", "MO.expoOut", "MO.springHz",
    "CAM.apply", "CAM.with", "CAM.toScreen", "CAM.at", "CAM.track",
    "TY.fitFloor", "TY.rise", "TY.text", "TY.tabular", "TY.fmt",
    "CH.lin", "CH.ticks", "CH.grid", "CH.bars", "CH.line", "CH.callout",
    "MD.size", "MD.cover", "MD.toScreen", "MD.print", "MD.label",
    "UI.icon", "UI.sheen", "CL.tornRect", "CL.tape", "CL.pin", "CL.highlight", "CL.stringPts", "CL.string",
    "DG.cum", "DG.drawPartial",
  ]) assert.ok(filmReceipt.templateEffects.calls[id] >= 60, `Film final consumer must call ${id}; observed ${filmReceipt.templateEffects.calls[id]}`);
  for (const id of ["DG.circumscribe", "DG.brace", "DG.indicate", "MO.thereAndBack"]) {
    assert.ok(filmReceipt.templateEffects.calls[id] > 0, `Film final consumer invokes ${id} through the existing local DG effect adapter`);
  }
  assert.equal(filmReceipt.localEffects.validatedInstances.length, 3, "Film/1 keeps the DG effect adapter in the same toolkit scene");
  assert.ok(filmReceipt.localEffects.adapter.sha256, "Film/1 receipt identifies the loaded existing DG effects adapter");
  for (const [id, sourceFunction] of [
    ["toolkit-effect-circumscribe", "DG.circumscribe"],
    ["toolkit-effect-brace", "DG.brace"],
    ["toolkit-effect-indicate", "DG.indicate"],
  ]) {
    const row = filmReceipt.localEffects.runtimeEvidence.instances[id];
    assert.ok(row?.calls > 0, `Film/1 actually draws ${id} through the existing DG effects adapter`);
    assert.equal(row.sourceFunction, sourceFunction);
  }
  const filmProbe = JSON.parse(run(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", filmOutputPath], "toolkit Film ffprobe capture"));
  const filmVideo = filmProbe.streams.filter((row) => row.codec_type === "video");
  assert.equal(filmVideo.length, 1);
  assert.equal(Number(filmVideo[0].nb_read_frames), 60);
  assert.equal(Number(filmVideo[0].width), 1920);
  assert.equal(Number(filmVideo[0].height), 1080);
  const filmToolkitEvidencePath = path.join(runRoot, "film-toolkit-evidence.json");
  await fs.writeFile(filmToolkitEvidencePath, JSON.stringify({
    assessment: "technical Film/1 toolkit consumer; no human visual review",
    filmManifestPath,
    filmOutputPath,
    filmReceiptPath,
    templateEffects: filmReceipt.templateEffects.id,
    sourceId: filmReceipt.templateEffects.sourceId,
    sourceCommit: filmReceipt.templateEffects.sourceCommit,
    frameCount: Number(filmVideo[0].nb_read_frames),
    dimensions: [Number(filmVideo[0].width), Number(filmVideo[0].height)],
    sourceCalls: filmReceipt.templateEffects.calls,
    localEffects: filmReceipt.localEffects,
  }, null, 2) + "\n");
  if (toolkitSeek.strictRepeatedPixelCheck.status === "FAIL") {
    process.stdout.write(`TOOLKIT_STRICT_REPEAT_PIXEL_FAIL ${JSON.stringify(toolkitSeek.strictRepeatedPixelCheck)}\n`);
  }
  process.stdout.write(`TOOLKIT_E2E_EVIDENCE ${manifestPath}\nTOOLKIT_FILM_E2E_EVIDENCE ${filmToolkitEvidencePath}\n`);
});
