import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath, pathToFileURL} from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const skillRoot = path.join(repoRoot, ".agents", "skills", "laohu-motion");
const tmpRoot = process.env.MOTION_AUDIO_TEST_TMP_DIR
  ? path.resolve(process.env.MOTION_AUDIO_TEST_TMP_DIR)
  : path.join(repoRoot, ".cache", "tmp", "motion-local-integration", "audio");
const validationRoot = process.env.MOTION_AUDIO_TEST_VALIDATION_DIR
  ? path.resolve(process.env.MOTION_AUDIO_TEST_VALIDATION_DIR)
  : path.join(repoRoot, ".cache", "validation", "motion-local-integration", "audio");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const ffmpeg = process.env.MOTION_TEST_FFMPEG || process.env.MOTION_FFMPEG || "ffmpeg";
const ffprobe = process.env.MOTION_FFPROBE || (path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), "ffprobe") : "ffprobe");
const ffmpegAvailable = spawnSync(ffmpeg, ["-version"], {encoding: "utf8"}).status === 0;

async function syntheticPianoPack(directory) {
  const packDir = path.join(directory, "recorded-samples");
  await fs.mkdir(packDir, {recursive: true});
  const instruments = {};
  const credit = "Synthetic sine sample generated locally for adapter contract tests.";
  for (const id of ["piano", "celli", "violas", "violins"]) {
    const relative = `${id}/tone.wav`;
    const file = path.join(packDir, relative);
    await fs.mkdir(path.dirname(file), {recursive: true});
    const rendered = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=261.625565:sample_rate=48000:duration=0.5", "-ac", "1", "-c:a", "pcm_s16le", file], {encoding: "utf8"});
    assert.equal(rendered.status, 0, rendered.stderr || rendered.error?.message);
    instruments[id] = {license: "project-generated test fixture", credit: [credit], drum: false, samples: [{file: relative, ch: 1, root: 60, layer: "mf", rr: "1"}]};
  }
  const releaseFile = "piano/release.wav";
  const release = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=700:sample_rate=48000:duration=0.25", "-ac", "1", "-c:a", "pcm_s16le", path.join(packDir, releaseFile)], {encoding: "utf8"});
  assert.equal(release.status, 0, release.stderr || release.error?.message);
  instruments.piano.releases = [{file: releaseFile, ch: 1, root: 60, layer: "mf", rr: "1"}];
  await fs.writeFile(path.join(packDir, "manifest.json"), JSON.stringify({version: 2, instruments}, null, 2));
  await fs.writeFile(path.join(packDir, "NOTICE.txt"), `- ${credit}\n`);
  return packDir;
}

async function seedPianoBuildCache(outDirectory, rawSeedDirectory) {
  const cache = path.join(outDirectory, ".src");
  const repoKey = "sfzinstruments_SalamanderGrandPiano";
  const sourceCommitPrefix = "3382bf94";
  const rawTarget = path.join(cache, "raw", repoKey, "Samples");
  await fs.mkdir(rawTarget, {recursive: true});
  const tree = {tree: [
    {type: "blob", path: "Samples/C4v4.flac"},
    {type: "blob", path: "Samples/rel40.flac"},
  ]};
  await fs.writeFile(path.join(cache, `${repoKey}@${sourceCommitPrefix}.json`), JSON.stringify(tree));
  for (const name of ["C4v4.flac", "rel40.flac"]) await fs.copyFile(path.join(rawSeedDirectory, name), path.join(rawTarget, name));
}

test("no-sample generatePlan imports the catalog-pinned local audio closure without an upstream tree", {timeout: 120_000}, async () => {
  await fs.mkdir(tmpRoot, {recursive: true});
  await fs.mkdir(validationRoot, {recursive: true});
  const runRoot = await fs.mkdtemp(path.join(tmpRoot, "audio-local-runtime-isolation-"));
  const isolatedSkill = path.join(runRoot, ".agents", "skills", "laohu-motion");
  const scriptsRoot = path.join(isolatedSkill, "scripts");
  const templatesRoot = path.join(isolatedSkill, "templates");
  const localProject = path.join(runRoot, "project");
  await Promise.all([
    fs.mkdir(scriptsRoot, {recursive: true}),
    fs.mkdir(path.join(templatesRoot, "runtime"), {recursive: true}),
    fs.mkdir(localProject, {recursive: true}),
  ]);
  for (const file of ["audio.mjs", "laohu-audio-source.mjs", "motion-core.js", "motion-ops.js"]) {
    await fs.copyFile(path.join(skillRoot, "scripts", file), path.join(scriptsRoot, file));
  }
  const asrcutRoot = path.join(runRoot, ".agents", "skills", "laohu-asrcut", "scripts");
  await fs.mkdir(asrcutRoot, {recursive: true});
  await fs.copyFile(path.join(repoRoot, ".agents", "skills", "laohu-asrcut", "scripts", "asrcut.mjs"), path.join(asrcutRoot, "asrcut.mjs"));
  await fs.copyFile(path.join(repoRoot, ".agents", "skills", "laohu-asrcut", "scripts", "caption-manifest.mjs"), path.join(asrcutRoot, "caption-manifest.mjs"));
  await fs.copyFile(path.join(skillRoot, "templates", "catalog.json"), path.join(templatesRoot, "catalog.json"));
  await fs.cp(path.join(skillRoot, "templates", "runtime"), path.join(templatesRoot, "runtime"), {recursive: true});
  await fs.mkdir(path.join(localProject, "assets"), {recursive: true});

  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 1,
    sampleRate: 48000, channels: 2, events: [], tracks: [], voiceWindows: [],
    automation: [], timeMaps: [], assets: [], generatedAssets: [],
  };
  const basePlanPath = path.join(localProject, "base-plan.json");
  const filmManifestPath = path.join(localProject, "film-manifest.json");
  await fs.writeFile(basePlanPath, `${JSON.stringify(basePlan, null, 2)}\n`);
  await fs.writeFile(filmManifestPath, `${JSON.stringify({format: "test-film-manifest/1"}, null, 2)}\n`);
  const request = {
    format: "laohu.motion.huashu-audio-request/2",
    musicPreset: {style: "piano", seed: "local-isolated", bpm: 96},
    generationAuthorization: {
      granted: true,
      scopes: ["music"],
      source: "explicit-user-request",
      instructionExcerpt: "Authorized original music for the isolated runtime test.",
    },
  };
  const requestPath = path.join(localProject, "request.json");
  const requestBytes = Buffer.from(`${JSON.stringify(request, null, 2)}\n`);
  await fs.writeFile(requestPath, requestBytes);
  const film = {
    manifestPath: filmManifestPath,
    manifest: {format: "test-film-manifest/1"},
    scene: {duration: 1, fps: 30, audioEvents: []},
    maps: new Map(), bindings: new Map(), sourceScenes: new Map(), verifiedFiles: [],
    nativeSourceCompositions: [], nativeSourcePresetPlans: [], nativeSourceSfxOnlyPlans: [],
    blueprintPath: "blueprint.json", blueprintSha256: "0".repeat(64),
    scenePath: "compiled.scene.json", sceneSha256: "1".repeat(64),
  };
  const sourceEntry = path.join(scriptsRoot, "laohu-audio-source.mjs");
  const {generatePlan} = await import(`${pathToFileURL(sourceEntry).href}?isolation=${crypto.randomUUID()}`);
  const result = await generatePlan({
    request, basePlan, basePlanPath, film, inputFiles: [requestPath, basePlanPath, filmManifestPath],
    requestFilePath: requestPath, requestFileSha256: sha256(requestBytes),
    assetsDir: path.join(localProject, "assets"), projectRoot: localProject,
    outputPlan: path.join(localProject, "audio-plan.json"),
    manifestPath: path.join(localProject, "audio-plan-receipt.json"),
  });

  const upstreamRoot = path.join(isolatedSkill, "templates", "upstream", "huashu-motion");
  await assert.rejects(fs.access(upstreamRoot), {code: "ENOENT"});
  assert.equal(result.manifest.runtime.localRuntime.entry, "templates/runtime/laohu-audio-mix.mjs");
  assert.equal(result.manifest.source.closureSha256, "5a26d346ea81fade680d35c12db137730e05e1568954035b1dc0e3847dd5deba");
  assert.match(result.manifest.runtime.localRuntime.closureSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.manifest.runtime.localRuntime.sourceClosureSha256, result.manifest.source.closureSha256);
  assert.equal(result.manifest.runtime.localRuntime.importPolicy.environmentBeforeFirstImport.OM_SAMPLES, "off");
  assert.equal(result.manifest.runtime.localRuntime.importPolicy.packCacheInitializedNullBeforeEnvironmentRestore, true);
  assert.equal(result.manifest.runtime.localRuntime.importPolicy.environmentRestoredAfterImport, true);
  assert.equal(result.plan.tracks.some((track) => track.sourceGeneratedGroup), true, "the isolated route must produce the bounded shared source group from the local mixdown closure");
  assert.equal(result.manifest.alignment.requestGeneratedSourceGroups.length, 1);
  assert.equal(result.manifest.alignment.requestGeneratedSourceGroups[0].sourceMixdown.mixBusMode, "default-sum");
  const evidence = {
    format: "laohu.motion.local-audio-runtime-isolation/1",
    upstreamTreePresent: false,
    importEntry: result.manifest.runtime.localRuntime.entry,
    sourceClosureSha256: result.manifest.source.closureSha256,
    localRuntimeClosureSha256: result.manifest.runtime.localRuntime.closureSha256,
    localFiles: result.manifest.runtime.localRuntime.files.map(({path: filePath, sha256: digest, sourcePath, sourceSha256}) => ({path: filePath, sha256: digest, sourcePath, sourceSha256})),
    outputPlanSha256: sha256(await fs.readFile(path.join(localProject, "audio-plan.json"))),
    outputReceiptSha256: sha256(await fs.readFile(path.join(localProject, "audio-plan-receipt.json"))),
  };
  const evidencePath = path.join(validationRoot, `audio-local-runtime-isolation-${process.pid}-${crypto.randomBytes(4).toString("hex")}.json`);
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {flag: "wx"});
});

test("samples build runs the catalog-pinned local builder without an upstream tree or network and preserves existing instruments", {skip: !ffmpegAvailable, timeout: 120_000}, async () => {
  await fs.mkdir(tmpRoot, {recursive: true});
  await fs.mkdir(validationRoot, {recursive: true});
  const runRoot = await fs.mkdtemp(path.join(tmpRoot, "audio-local-samples-build-isolation-"));
  const isolatedSkill = path.join(runRoot, ".agents", "skills", "laohu-motion");
  const scriptsRoot = path.join(isolatedSkill, "scripts");
  const templatesRoot = path.join(isolatedSkill, "templates");
  const localProject = path.join(runRoot, "project");
  const fakeBin = path.join(runRoot, "fake-bin");
  const curlLog = path.join(runRoot, "curl-invoked.log");
  const outDirectory = path.join(localProject, "samples");
  const prior = new Map(["HOME", "PATH", "TMPDIR", "TMP", "TEMP", "OM_SAMPLES", "LAOHU_REQUIRE_RECORDED", "LAOHU_FFMPEG", "MOTION_FFMPEG", "MOTION_FFPROBE"].map((name) => [name, process.env[name]]));
  await Promise.all([
    fs.mkdir(scriptsRoot, {recursive: true}),
    fs.mkdir(path.join(templatesRoot, "runtime"), {recursive: true}),
    fs.mkdir(localProject, {recursive: true}),
    fs.mkdir(fakeBin, {recursive: true}),
  ]);
  for (const file of ["audio.mjs", "huashu-audio.mjs", "laohu-audio-source.mjs", "motion-core.js", "motion-ops.js"]) {
    await fs.copyFile(path.join(skillRoot, "scripts", file), path.join(scriptsRoot, file));
  }
  const asrcutRoot = path.join(runRoot, ".agents", "skills", "laohu-asrcut", "scripts");
  await fs.mkdir(asrcutRoot, {recursive: true});
  await fs.copyFile(path.join(repoRoot, ".agents", "skills", "laohu-asrcut", "scripts", "asrcut.mjs"), path.join(asrcutRoot, "asrcut.mjs"));
  await fs.copyFile(path.join(repoRoot, ".agents", "skills", "laohu-asrcut", "scripts", "caption-manifest.mjs"), path.join(asrcutRoot, "caption-manifest.mjs"));
  await fs.copyFile(path.join(skillRoot, "templates", "catalog.json"), path.join(templatesRoot, "catalog.json"));
  await fs.cp(path.join(skillRoot, "templates", "runtime"), path.join(templatesRoot, "runtime"), {recursive: true});
  await fs.writeFile(path.join(fakeBin, "curl"), `#!/bin/sh\nprintf 'called\\n' >> '${curlLog}'\nexit 91\n`);
  await fs.chmod(path.join(fakeBin, "curl"), 0o755);

  const rawSeed = path.join(runRoot, "raw-seed");
  await fs.mkdir(rawSeed, {recursive: true});
  for (const [name, frequency, duration] of [["C4v4.flac", 261.625565, 1.25], ["rel40.flac", 700, 0.5]]) {
    const generated = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`, "-ac", "1", "-c:a", "flac", path.join(rawSeed, name)], {encoding: "utf8"});
    assert.equal(generated.status, 0, generated.stderr || generated.error?.message);
  }
  await fs.mkdir(path.join(outDirectory, "violin"), {recursive: true});
  const priorSample = path.join(outDirectory, "violin", "existing.wav");
  const priorSampleResult = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.5", "-ac", "1", "-c:a", "pcm_s16le", priorSample], {encoding: "utf8"});
  assert.equal(priorSampleResult.status, 0, priorSampleResult.stderr || priorSampleResult.error?.message);
  const priorCredit = "Synthetic existing-pack violin fixture; no external recording used.";
  await fs.writeFile(path.join(outDirectory, "manifest.json"), JSON.stringify({version: 2, built: "fixture", instruments: {
    violin: {license: "project-generated test fixture", credit: [priorCredit], drum: false, samples: [{file: "violin/existing.wav", ch: 1, root: 69, layer: "mf", rr: "1"}]},
  }}, null, 2));
  await fs.writeFile(path.join(outDirectory, "NOTICE.txt"), `- ${priorCredit}\n`);
  await seedPianoBuildCache(outDirectory, rawSeed);

  const tmpEnvironment = process.env.MOTION_AUDIO_TEST_TMP_DIR || tmpRoot;
  Object.assign(process.env, {
    HOME: path.join(localProject, "fake-home"), PATH: fakeBin,
    TMPDIR: tmpEnvironment, TMP: tmpEnvironment, TEMP: tmpEnvironment,
    MOTION_FFMPEG: ffmpeg, MOTION_FFPROBE: ffprobe,
  });
  delete process.env.LAOHU_REQUIRE_RECORDED;
  delete process.env.OM_SAMPLES;
  delete process.env.LAOHU_FFMPEG;
  try {
    const entry = path.join(scriptsRoot, "huashu-audio.mjs");
    const built = spawnSync(process.execPath, [entry, "samples", "build", "--out", outDirectory, "--only", "piano"], {
      cwd: localProject,
      encoding: "utf8",
      env: {...process.env, CURL_LOG: curlLog},
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(built.status, 0, built.stderr || built.stdout || built.error?.message);
    assert.match(built.stdout, /SOURCE_COMMIT 52467f99c602b76ba86d511d37acdfe93fa1e16e/);
    assert.match(built.stdout, /SAMPLE_BUILDER_LOCAL true/);
    assert.match(built.stdout, /VALIDATED_INSTRUMENT_IDS piano/);
    await assert.rejects(fs.access(curlLog), {code: "ENOENT"});
    const manifest = JSON.parse(await fs.readFile(path.join(outDirectory, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.instruments.piano.samples.map((row) => row.root), [60]);
    assert.deepEqual(manifest.instruments.piano.releases.map((row) => row.root), [60]);
    assert.ok(manifest.instruments.violin, "--only piano must retain instruments already in the project pack");
    assert.ok((await fs.readFile(path.join(outDirectory, "NOTICE.txt"), "utf8")).includes(priorCredit));
    assert.ok(manifest.instruments.piano.credit.some((credit) => credit.includes("CC BY 3.0")));
    await assert.rejects(fs.access(path.join(isolatedSkill, "templates", "upstream", "huashu-motion")), {code: "ENOENT"});
    const unknownPath = path.join(localProject, "unknown-id-pack");
    const unknown = spawnSync(process.execPath, [entry, "samples", "build", "--out", unknownPath, "--only", "__unknown_contract_probe__"], {
      cwd: localProject, encoding: "utf8", env: {...process.env, CURL_LOG: curlLog}, maxBuffer: 2 * 1024 * 1024,
    });
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /unsupported sample instrument ID: __unknown_contract_probe__/);
    await assert.rejects(fs.access(unknownPath), {code: "ENOENT"});
    const escapedDirectory = path.join(runRoot, "escaped-output");
    const escapedLink = path.join(localProject, "external-link");
    await fs.mkdir(escapedDirectory, {recursive: true});
    await fs.symlink(escapedDirectory, escapedLink, "dir");
    const escapedOutput = path.join(escapedLink, "new-parent", "sample-pack");
    const escaped = spawnSync(process.execPath, [entry, "samples", "build", "--out", escapedOutput, "--only", "piano"], {
      cwd: localProject, encoding: "utf8", env: {...process.env, CURL_LOG: curlLog}, maxBuffer: 2 * 1024 * 1024,
    });
    assert.notEqual(escaped.status, 0);
    assert.match(escaped.stderr, /must stay inside the current project root/);
    await assert.rejects(fs.access(path.join(escapedDirectory, "new-parent")), {code: "ENOENT"});
    const evidence = {
      format: "laohu.motion.local-samples-build-isolation/1",
      upstreamTreePresent: false,
      curlInvoked: false,
      sourceCommit: "52467f99c602b76ba86d511d37acdfe93fa1e16e",
      requestedInstrumentIds: ["piano"],
      resultingInstrumentIds: Object.keys(manifest.instruments).sort(),
      rejectedUnknownInstrument: unknown.status !== 0,
      rejectedEscapingOutputBeforeMkdir: escaped.status !== 0,
      sampleFiles: await Promise.all([...manifest.instruments.piano.samples, ...manifest.instruments.piano.releases].map(async (row) => ({file: row.file, bytes: (await fs.stat(path.join(outDirectory, row.file))).size, root: row.root}))),
      outputManifestSha256: sha256(await fs.readFile(path.join(outDirectory, "manifest.json"))),
      noticeSha256: sha256(await fs.readFile(path.join(outDirectory, "NOTICE.txt"))),
      sourceLocalMapping: {sourcePath: "cli/lib/samples-build.js", localPath: "templates/runtime/laohu-audio-samples-build.mjs"},
    };
    const evidencePath = path.join(validationRoot, `audio-local-samples-build-isolation-${process.pid}-${crypto.randomBytes(4).toString("hex")}.json`);
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {flag: "wx"});
  } finally {
    for (const [name, value] of prior) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
    await fs.rm(runRoot, {recursive: true, force: true});
  }
});

test("recorded-required generatePlan uses a traced local runtime overlay without an upstream tree and preserves baseline PCM", {skip: !ffmpegAvailable, timeout: 120_000}, async () => {
  await fs.mkdir(tmpRoot, {recursive: true});
  await fs.mkdir(validationRoot, {recursive: true});
  const runRoot = await fs.mkdtemp(path.join(tmpRoot, "audio-recorded-runtime-isolation-"));
  const isolatedSkill = path.join(runRoot, ".agents", "skills", "laohu-motion");
  const scriptsRoot = path.join(isolatedSkill, "scripts");
  const templatesRoot = path.join(isolatedSkill, "templates");
  const localProject = path.join(runRoot, "project");
  await Promise.all([
    fs.mkdir(scriptsRoot, {recursive: true}),
    fs.mkdir(path.join(templatesRoot, "runtime"), {recursive: true}),
    fs.mkdir(localProject, {recursive: true}),
  ]);
  for (const file of ["audio.mjs", "laohu-audio-source.mjs", "motion-core.js", "motion-ops.js"]) {
    await fs.copyFile(path.join(skillRoot, "scripts", file), path.join(scriptsRoot, file));
  }
  const asrcutRoot = path.join(runRoot, ".agents", "skills", "laohu-asrcut", "scripts");
  await fs.mkdir(asrcutRoot, {recursive: true});
  await fs.copyFile(path.join(repoRoot, ".agents", "skills", "laohu-asrcut", "scripts", "asrcut.mjs"), path.join(asrcutRoot, "asrcut.mjs"));
  await fs.copyFile(path.join(repoRoot, ".agents", "skills", "laohu-asrcut", "scripts", "caption-manifest.mjs"), path.join(asrcutRoot, "caption-manifest.mjs"));
  await fs.copyFile(path.join(skillRoot, "templates", "catalog.json"), path.join(templatesRoot, "catalog.json"));
  const runtimeRoot = path.join(skillRoot, "templates", "runtime");
  for (const file of ["LAOHU-AUDIO-LICENSE.txt", "laohu-audio-composed.mjs", "laohu-audio-composer.mjs", "laohu-audio-dsp.mjs", "laohu-audio-fx.mjs", "laohu-audio-mix.mjs", "laohu-audio-samples-build.mjs", "laohu-audio-samples.mjs", "laohu-audio-score.mjs"]) {
    await fs.copyFile(path.join(runtimeRoot, file), path.join(templatesRoot, "runtime", file));
  }
  await fs.mkdir(path.join(localProject, "assets"), {recursive: true});

  const packDir = await syntheticPianoPack(localProject);
  const basePlan = {
    schemaVersion: 1, timeUnit: "seconds", timeBasis: "film-global", durationSec: 3,
    sampleRate: 48000, channels: 2, events: [], tracks: [], voiceWindows: [], automation: [], timeMaps: [], assets: [], generatedAssets: [],
  };
  const basePlanPath = path.join(localProject, "recorded-base-plan.json");
  const filmManifestPath = path.join(localProject, "film-manifest.json");
  await fs.writeFile(basePlanPath, `${JSON.stringify(basePlan, null, 2)}\n`);
  await fs.writeFile(filmManifestPath, `${JSON.stringify({format: "test-film-manifest/1"}, null, 2)}\n`);
  const request = {
    format: "laohu.motion.huashu-audio-request/2",
    musicPreset: {style: "piano", seed: "recorded-piano", bpm: 80, samples: {mode: "recorded-required", packDir}},
    generationAuthorization: {
      granted: true,
      scopes: ["music"],
      source: "explicit-user-request",
      instructionExcerpt: "Authorized original music for the recorded sample test.",
    },
  };
  const requestPath = path.join(localProject, "recorded-request.json");
  const requestBytes = Buffer.from(`${JSON.stringify(request, null, 2)}\n`);
  await fs.writeFile(requestPath, requestBytes);
  const film = {
    manifestPath: filmManifestPath,
    manifest: {format: "test-film-manifest/1"},
    scene: {duration: 3, fps: 30, audioEvents: []},
    maps: new Map(), bindings: new Map(), sourceScenes: new Map(), verifiedFiles: [],
    nativeSourceCompositions: [], nativeSourcePresetPlans: [], nativeSourceSfxOnlyPlans: [],
    blueprintPath: "blueprint.json", blueprintSha256: "0".repeat(64),
    scenePath: "compiled.scene.json", sceneSha256: "1".repeat(64),
  };
  const sourceEntry = path.join(scriptsRoot, "laohu-audio-source.mjs");
  const {generatePlan} = await import(`${pathToFileURL(sourceEntry).href}?recorded-isolation=${crypto.randomUUID()}`);
  const prior = new Map(["HOME", "MOTION_FFMPEG", "MOTION_FFPROBE", "LAOHU_FFMPEG"].map((name) => [name, process.env[name]]));
  process.env.HOME = path.join(localProject, "fake-home");
  process.env.MOTION_FFMPEG = ffmpeg;
  process.env.MOTION_FFPROBE = ffprobe;
  try {
    const result = await generatePlan({
      request, basePlan, basePlanPath, film, inputFiles: [requestPath, basePlanPath, filmManifestPath],
      requestFilePath: requestPath, requestFileSha256: sha256(requestBytes),
      assetsDir: path.join(localProject, "assets"), projectRoot: localProject,
      outputPlan: path.join(localProject, "recorded-output-plan.json"),
      manifestPath: path.join(localProject, "recorded-output-receipt.json"),
    });
    const upstreamRoot = path.join(isolatedSkill, "templates", "upstream", "huashu-motion");
    await assert.rejects(fs.access(upstreamRoot), {code: "ENOENT"});
    assert.equal(result.manifest.runtime.runtimeOverlay.kind, "recorded-required-local-runtime-overlay");
    assert.equal(result.manifest.runtime.runtimeOverlay.sourceClosureSha256, result.manifest.source.closureSha256);
    assert.equal(result.manifest.runtime.runtimeOverlay.transformedSourceFiles.length, 7);
    assert.equal(result.manifest.runtime.runtimeOverlay.transformedSourceFiles.every((row) => row.path.startsWith("templates/runtime/laohu-audio-")), true);
    const samplePack = result.manifest.musicPreset.samplePack;
    assert.equal(samplePack.usedInstrumentIds.includes("piano"), true);
    assert.equal(samplePack.decodeTrace.length > 0, true);
    assert.equal(samplePack.selectedFiles.every((row) => row.runtime.selectedForNoteOrRelease), true);
    const musicAsset = result.plan.assets.find((asset) => asset.id === result.manifest.musicPreset.outputWav.assetId);
    // Compare at the same stage: the emitted stem now includes the source music-level step.
    // Take both checkpoints in a test-only copy of the separately pinned mixdown implementation.
    const oracleDir = path.join(runRoot, "source-oracle");
    await fs.cp(result.manifest.runtime.runtimeOverlay.root, oracleDir, {recursive:true});
    const oraclePath = path.join(oracleDir, "laohu-audio-mix.mjs");
    const original = await fs.readFile(oraclePath, "utf8");
    const levelStep = "if (isFinite(ml)) music.scale(undb(musicTarget - ml));";
    assert.ok(original.includes(levelStep));
    await fs.writeFile(oraclePath, original.replace(levelStep,
      "const beforeLevel = {n:music.n,L:music.L.slice(),R:music.R.slice()}; " + levelStep + " return {beforeLevel,music};"));
    const {buildSourcePresetPlan, floatWav} = await import(pathToFileURL(sourceEntry).href);
    const input = buildSourcePresetPlan({preset:request.musicPreset,durationSec:3,id:path.basename(basePlanPath),
      resolvedEvents:new Map(),keyContext:{provided:false,rootMidi:60,scale:"major"}});
    const prevPack = process.env.OM_SAMPLES;
    const prevDecoder = process.env.LAOHU_FFMPEG;
    try {
      process.env.OM_SAMPLES = packDir;
      process.env.LAOHU_FFMPEG = ffmpeg;
      const oracle = await import(pathToFileURL(oraclePath).href);
      const {beforeLevel,music} = oracle.mixdown(input.plan,{mixBusMode:"default-sum"});
      const tone = await fs.readFile(path.join(packDir,"piano","tone.wav"));
      const inputPcm = tone.subarray(tone.indexOf(Buffer.from("data"))+8);
      if (sha256(inputPcm) === "4b3d41cf3c83cfc37d07b21677bd7c18510182736ef323009019795494d60021") {
        assert.equal(sha256(floatWav(beforeLevel)), "a5a4387e82a7c78e6d61fbc4e30376f24daa58bf99584d4c404c0ad2d35c3953");
      }
      assert.equal(musicAsset.sha256,sha256(floatWav(music)), "exported stem must match the levelled reference sample for sample");
    } finally {
      if (prevPack == null) delete process.env.OM_SAMPLES; else process.env.OM_SAMPLES = prevPack;
      if (prevDecoder == null) delete process.env.LAOHU_FFMPEG; else process.env.LAOHU_FFMPEG = prevDecoder;
    }
    const evidence = {
      format: "laohu.motion.recorded-audio-local-runtime-isolation/1",
      upstreamTreePresent: false,
      runtimeOverlay: result.manifest.runtime.runtimeOverlay,
      localRuntimeClosureSha256: result.manifest.runtime.localRuntime.closureSha256,
      sourceClosureSha256: result.manifest.source.closureSha256,
      recordedSampleManifestSha256: samplePack.manifest.sha256,
      actualSampleUse: {usedInstrumentIds: samplePack.usedInstrumentIds, decodedFiles: samplePack.decodedFiles, selectedFiles: samplePack.selectedFiles},
      musicAssetSha256: musicAsset.sha256,
      outputPlanSha256: sha256(await fs.readFile(path.join(localProject, "recorded-output-plan.json"))),
      outputReceiptSha256: sha256(await fs.readFile(path.join(localProject, "recorded-output-receipt.json"))),
    };
    const evidencePath = path.join(validationRoot, `audio-recorded-runtime-isolation-${process.pid}-${crypto.randomBytes(4).toString("hex")}.json`);
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {flag: "wx"});
  } finally {
    for (const [name, value] of prior) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("audio-map covers the indexed library once within its context budget", async () => {
  const {audioMap} = await import("../scripts/audio-map.mjs");
  const index = JSON.parse(await fs.readFile(path.join(skillRoot, "assets/audio/index.json")));
  const map = audioMap(index);
  const music = index.assets.filter(asset => asset.role.startsWith("music-"));
  for (const asset of music) assert.equal(map.split(asset.id + " | ").length, 2);
  const counts = [...map.matchAll(/^\S+ · (\d+) · /gm)].map(match => Number(match[1]));
  assert.equal(counts.reduce((a,b) => a+b, music.length), index.assets.length);
  assert.ok([...map].length <= 4500);
});

test("audio-plan masters the complete stereo mix and meters the output WAV", {skip: !ffmpegAvailable}, async () => {
  const {validatePlan} = await import("../scripts/audio.mjs");
  await fs.mkdir(tmpRoot, {recursive:true});
  const dir = await fs.mkdtemp(path.join(tmpRoot, "master-"));
  const clip = path.join(dir, "tone.wav");
  const make = spawnSync(ffmpeg, ["-v","error","-f","lavfi","-i","sine=frequency=2200:duration=6:sample_rate=48000",
    "-ac","2","-c:a","pcm_f32le",clip], {encoding:"utf8"});
  assert.equal(make.status,0,make.stderr);
  const music = {id:"bed",assetId:"fixture",bus:"music",startSec:0,highpassHz:90,
    vocalPocket:{freqHz:2200,widthQ:1,gainDb:-2.5},pan:0.3};
  const plan = {schemaVersion:1,timeUnit:"seconds",timeBasis:"film-global",durationSec:6,sampleRate:48000,channels:2,
    assets:[{id:"fixture",file:"tone.wav",durationSec:6,sha256:sha256(await fs.readFile(clip)),license:"offline test fixture",
      reviewStatus:"candidate-unreviewed",redistribution:{status:"sync-only",basis:"local technical test"}}],
    tracks:[music],masterLoudnorm:{targetLufs:-14,truePeakDbtp:-1,lra:11}};
  for (const field of ["pan","highpassHz","vocalPocket","ducking"]) {
    const track = {id:"locked",assetId:"fixture",bus:"music",startSec:0,locked:true,[field]:music[field] ?? {}};
    assert.throws(() => validatePlan({...plan,tracks:[track]}), /locked|not implemented/);
  }
  for (const field of ["sourceProcessing", "sourceGeneratedGroup"]) {
    assert.throws(() => validatePlan({...plan,tracks:[{...music,[field]:{}}]}), /source-owned mix/);
    const {masterLoudnorm, ...withoutMaster} = plan;
    assert.throws(() => validatePlan({...withoutMaster,tracks:[{...music,[field]:{}}]}), /source-owned mix/);
  }
  assert.throws(() => validatePlan({...plan,masterLoudnorm:{...plan.masterLoudnorm,typo:1}}),/typo/);
  assert.throws(() => validatePlan({...plan,tracks:[{...music,pan:1.1}]}),/pan/);
  const file = name => path.join(dir,name);
  await fs.writeFile(file("plan.json"),JSON.stringify(plan));
  const result = spawnSync(process.execPath,[path.join(skillRoot,"scripts/laohu-showreel.mjs"),"audio-plan",
    "--plan",file("plan.json"),"--output",file("final.wav"),"--manifest",file("receipt.json"),
    "--cache-dir",file("cache"),"--allow-candidate","--ffmpeg",ffmpeg],{cwd:repoRoot,encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  const {mix} = JSON.parse(await fs.readFile(file("receipt.json")));
  assert.match(mix.filterGraph,/highpass=f=90,equalizer=f=2200:t=q:w=1:g=-2.5,pan=stereo/);
  assert.match(mix.masterLoudnorm.filter, /linear=true$/);
  assert.ok(["dynamic","linear"].includes(mix.masterLoudnorm.mode));
  const probe = spawnSync(ffprobe,["-v","error","-show_streams","-of","json",file("final.wav")],{encoding:"utf8"});
  const [stream] = JSON.parse(probe.stdout).streams;
  assert.equal(stream.sample_rate,"48000"); assert.equal(stream.channels,2); assert.equal(Number(stream.duration_ts),6*48000);
  const meter = spawnSync(ffmpeg,["-hide_banner","-nostats","-i",file("final.wav"),"-af","ebur128=peak=true","-f","null","-"],{encoding:"utf8"});
  assert.equal(meter.status,0,meter.stderr);
  const summary = meter.stderr.split("Summary:").at(-1);
  const loudness = Number(summary.match(/I:\s*([-\d.]+) LUFS/)[1]);
  const peak = Number(summary.match(/Peak:\s*([-\d.]+) dBFS/)[1]);
  assert.ok(Math.abs(loudness+14)<=1 && peak<=-1,summary);
  assert.ok(Math.abs(mix.masterLoudnorm.output.integratedLufs-loudness)<0.2);
});
