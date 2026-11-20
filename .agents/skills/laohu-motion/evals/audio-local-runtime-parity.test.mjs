import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath, pathToFileURL} from "node:url";
import {loadUpstream} from "../scripts/laohu-audio-source.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const skillRoot = path.join(repoRoot, ".agents", "skills", "laohu-motion");
const runtimeRoot = path.join(skillRoot, "templates", "runtime");
const sourceRoot = process.env.MOTION_SOURCE_ROOT ? path.resolve(process.env.MOTION_SOURCE_ROOT) : null;
const upstreamRoot = sourceRoot ? path.join(sourceRoot, "huashu-motion") : null;
const sourceParitySkip = sourceRoot ? false : "MOTION_SOURCE_ROOT is unset; pinned-source PCM comparison skipped";
const tmpRoot = process.env.MOTION_AUDIO_TEST_TMP_DIR
  ? path.resolve(process.env.MOTION_AUDIO_TEST_TMP_DIR)
  : path.join(repoRoot, ".cache", "tmp", "motion-local-integration", "audio");
const validationRoot = process.env.MOTION_AUDIO_TEST_VALIDATION_DIR
  ? path.resolve(process.env.MOTION_AUDIO_TEST_VALIDATION_DIR)
  : path.join(repoRoot, ".cache", "validation", "motion-local-integration", "audio");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const ffmpeg = process.env.MOTION_TEST_FFMPEG || process.env.MOTION_FFMPEG || "ffmpeg";
const ffmpegAvailable = spawnSync(ffmpeg, ["-version"], {encoding: "utf8"}).status === 0;
const canonical = (value) => Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]" : value && typeof value === "object" ? "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}" : JSON.stringify(value);

function pcmSha(track) {
  return sha256(Buffer.concat([Buffer.from(track.L.buffer), Buffer.from(track.R.buffer)]));
}

test("local Huashu mixdown PCM matches the pinned source for SFX-only, default-score, and ABC-score branches", {skip: sourceParitySkip, timeout: 120_000}, async () => {
  await fs.mkdir(tmpRoot, {recursive: true});
  await fs.mkdir(validationRoot, {recursive: true});
  const catalog = JSON.parse(await fs.readFile(path.join(skillRoot, "templates", "catalog.json"), "utf8"));
  const sourceRecord = catalog.sources.find((row) => row.id === "huashu-motion");
  const localPin = sourceRecord?.localRuntime;
  assert.ok(localPin, "catalog must include the selected local audio closure mapping");
  const sourceLedger = new Map(sourceRecord.files.map((row) => [row.path, row]));
  const sourceClosure = localPin.sourceClosurePaths.slice().sort().map((path) => {
    const row = sourceLedger.get(path);
    assert.ok(row, `catalog source ledger must contain ${path}`);
    return {path, sha256: row.sha256, gitBlob: row.gitBlob || null};
  });
  assert.equal(sha256(Buffer.from(canonical(sourceClosure))), localPin.sourceClosureSha256, "real catalog sourceClosureSha256 must hash its mapped source rows");
  assert.equal(sha256(Buffer.from(canonical(localPin.files))), localPin.closureSha256, "real catalog closureSha256 must hash its actual local file map");
  const builderPin = localPin.files.find((row) => row.path === "templates/runtime/laohu-audio-samples-build.mjs");
  assert.deepEqual(
    {sourcePath: builderPin?.sourcePath, sourceSha256: builderPin?.sourceSha256, sha256: builderPin?.sha256},
    {sourcePath: "cli/lib/samples-build.js", sourceSha256: sourceLedger.get("cli/lib/samples-build.js")?.sha256, sha256: sha256(await fs.readFile(path.join(runtimeRoot, "laohu-audio-samples-build.mjs")))},
    "real catalog must map and hash the local sample builder",
  );

  const envNames = ["OM_SAMPLES", "LAOHU_REQUIRE_RECORDED", "OM_MIX"];
  const previous = new Map(envNames.map((name) => [name, process.env[name]]));
  let rows;
  try {
    process.env.OM_SAMPLES = "off";
    delete process.env.LAOHU_REQUIRE_RECORDED;
    delete process.env.OM_MIX;
    const [localSound, localSamples, localScore] = await Promise.all([
      import(pathToFileURL(path.join(runtimeRoot, "laohu-audio-mix.mjs")).href),
      import(pathToFileURL(path.join(runtimeRoot, "laohu-audio-samples.mjs")).href),
      import(pathToFileURL(path.join(runtimeRoot, "laohu-audio-score.mjs")).href),
    ]);
    localSamples.resetPack();
    localScore.resetVoices();
    assert.equal(localSamples.packDir(), "off");
    assert.equal(localSamples.loadPack(), null);

    const source = await loadUpstream();
    assert.equal(process.env.OM_SAMPLES, "off");
    assert.equal(process.env.OM_MIX, undefined, "the experimental OM_MIX=chains branch must remain disabled by default");
    const cases = [
      ["sfx-only", {
        id: "local-parity-sfx", duration: 0.65,
        music: {off: true, seed: "local-parity"},
        hits: [{name: "click", at: 0.2, options: {}, seed: "sfx-click"}, {name: "thud", at: 0.42, options: {pitch: 1.1}, seed: "sfx-thud"}],
      }, {}],
      ["default-score", {
        id: "local-parity-default", duration: 2,
        music: {style: "piano", seed: "local-parity", bpm: 96, ending: "button", end: 1.8},
        hits: [{name: "click", at: 0.7, seed: "score-click"}],
      }, {}],
      ["abc-score", {
        id: "local-parity-abc", duration: 2,
        music: {seed: "local-parity", bpm: 90},
        hits: [{name: "click", at: 0.65, seed: "abc-click"}],
      }, {score: "X:1\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\nV:lead inst=piano\nC D !hit!E F |"}],
      ["generated-source-group-zero-gain", {
        id: "local-parity-request-group", duration: 1.8, voice: true,
        music: {style: "mallet", seed: "request-group-parity", bpm: 96},
        hits: [{name: "click", at: 0.72, gain: 0.8, pan: 0.1}],
      }, {voiced: true, words: [{start: 0.24, end: 0.63}], voiceLufs: -24}],
    ];
    rows = [];
    for (const [name, declaration, options] of cases) {
      const original = source.sound.mixdown(declaration, options);
      const migrated = name === "generated-source-group-zero-gain"
        ? localSound.mixdown(declaration, { ...options, musicGainDb: 0, mixBusMode: "default-sum" })
        : localSound.mixdown(declaration, options);
      const sourceLeft = Buffer.from(original.out2.L.buffer);
      const localLeft = Buffer.from(migrated.out2.L.buffer);
      const sourceRight = Buffer.from(original.out2.R.buffer);
      const localRight = Buffer.from(migrated.out2.R.buffer);
      assert.deepEqual(localLeft, sourceLeft, `${name} left-channel PCM must match pinned source byte-for-byte`);
      assert.deepEqual(localRight, sourceRight, `${name} right-channel PCM must match pinned source byte-for-byte`);
      rows.push({
        name, frames: original.out2.n, sourcePcmSha256: pcmSha(original.out2), localPcmSha256: pcmSha(migrated.out2),
        sourcePeak: original.peak, localPeak: migrated.peak, sourceLufs: original.finalLufs, localLufs: migrated.finalLufs,
      });
    }
    const groupP0 = {
      id: "local-parity-request-group-gain", duration: 1.8, voice: true,
      music: {style: "mallet", seed: "request-group-gain", bpm: 96},
      hits: [{name: "click", at: 0.72, gain: 0.8, pan: 0.1}],
    };
    const groupOptions = {voiced: true, words: [{start: 0.24, end: 0.63}], voiceLufs: -24, mixBusMode: "default-sum"};
    const zeroGain = localSound.mixdown(groupP0, {...groupOptions, musicGainDb: 0});
    const minusSixGain = localSound.mixdown(groupP0, {...groupOptions, musicGainDb: -6});
    assert.notDeepEqual(Buffer.from(zeroGain.out2.L.buffer), Buffer.from(minusSixGain.out2.L.buffer), "nonzero pre-bus music gain must change produced PCM under the shared source mixdown");
    assert.notDeepEqual(Buffer.from(zeroGain.out2.R.buffer), Buffer.from(minusSixGain.out2.R.buffer), "nonzero pre-bus music gain must change both stereo channels");
    rows.push({
      name: "generated-source-group-minus-six-db",
      frames: minusSixGain.out2.n,
      zeroGainPcmSha256: pcmSha(zeroGain.out2),
      minusSixGainPcmSha256: pcmSha(minusSixGain.out2),
      zeroGainLufs: zeroGain.finalLufs,
      minusSixGainLufs: minusSixGain.finalLufs,
      mixBusMode: minusSixGain.mixBusMode,
    });
  } finally {
    for (const [name, value] of previous) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
  const evidence = {
    format: "laohu.motion.local-audio-parity/1",
    sourceCommit: "52467f99c602b76ba86d511d37acdfe93fa1e16e",
    sourceClosureSha256: localPin.sourceClosureSha256,
    localRuntimeClosureSha256: localPin.closureSha256,
    omMixChainsEnabled: false,
    samplePack: "OM_SAMPLES=off; source and local sample-pack caches initialized null",
    branches: rows,
    result: "Float32 stereo PCM byte-identical in source branches and generated-group 0 dB; -6 dB changes PCM under a voiced shared-bus mix",
  };
  const evidencePath = path.join(validationRoot, `audio-local-runtime-parity-${process.pid}-${crypto.randomBytes(4).toString("hex")}.json`);
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {flag: "wx"});
});

test("local samples builder preserves the pinned source algorithm and produces identical piano fixture outputs", {skip: !ffmpegAvailable ? "FFmpeg is unavailable" : sourceParitySkip, timeout: 120_000}, async () => {
  await fs.mkdir(tmpRoot, {recursive: true});
  await fs.mkdir(validationRoot, {recursive: true});
  const runRoot = await fs.mkdtemp(path.join(tmpRoot, "audio-builder-source-parity-"));
  const sourceOut = path.join(runRoot, "source-pack");
  const localOut = path.join(runRoot, "local-pack");
  const rawSeed = path.join(runRoot, "raw-seed");
  const fakeBin = path.join(runRoot, "fake-bin");
  const curlLog = path.join(runRoot, "curl-invoked.log");
  const prior = new Map(["OM_SAMPLES", "LAOHU_REQUIRE_RECORDED", "PATH", "TMPDIR", "TMP", "TEMP"].map((name) => [name, process.env[name]]));
  await Promise.all([fs.mkdir(rawSeed, {recursive: true}), fs.mkdir(fakeBin, {recursive: true})]);
  for (const [name, frequency, duration] of [["C4v4.flac", 261.625565, 1.25], ["rel40.flac", 700, 0.5]]) {
    const generated = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`, "-ac", "1", "-c:a", "flac", path.join(rawSeed, name)], {encoding: "utf8"});
    assert.equal(generated.status, 0, generated.stderr || generated.error?.message);
  }
  const curlFile = path.join(fakeBin, "curl");
  await fs.writeFile(curlFile, `#!/bin/sh\nprintf 'called\\n' >> '${curlLog}'\nexit 91\n`);
  await fs.chmod(curlFile, 0o755);
  for (const out of [sourceOut, localOut]) {
    const cache = path.join(out, ".src");
    const repoKey = "sfzinstruments_SalamanderGrandPiano";
    const rawPath = path.join(cache, "raw", repoKey, "Samples");
    await fs.mkdir(rawPath, {recursive: true});
    await fs.writeFile(path.join(cache, `${repoKey}@3382bf94.json`), JSON.stringify({tree: [
      {type: "blob", path: "Samples/C4v4.flac"}, {type: "blob", path: "Samples/rel40.flac"},
    ]}));
    for (const name of ["C4v4.flac", "rel40.flac"]) await fs.copyFile(path.join(rawSeed, name), path.join(rawPath, name));
  }

  try {
    process.env.OM_SAMPLES = "off";
    delete process.env.LAOHU_REQUIRE_RECORDED;
    const tmpEnvironment = process.env.MOTION_AUDIO_TEST_TMP_DIR || tmpRoot;
    Object.assign(process.env, {
      PATH: [path.dirname(ffmpeg), fakeBin, prior.get("PATH") || ""].filter(Boolean).join(path.delimiter),
      TMPDIR: tmpEnvironment, TMP: tmpEnvironment, TEMP: tmpEnvironment,
    });
    const [sourceBuilder, localBuilder] = await Promise.all([
      import(pathToFileURL(path.join(upstreamRoot, "cli", "lib", "samples-build.js")).href + `?parity=${crypto.randomUUID()}`),
      import(pathToFileURL(path.join(runtimeRoot, "laohu-audio-samples-build.mjs")).href + `?parity=${crypto.randomUUID()}`),
    ]);
    const [sourceCode, localCode] = await Promise.all([
      fs.readFile(path.join(upstreamRoot, "cli", "lib", "samples-build.js"), "utf8"),
      fs.readFile(path.join(runtimeRoot, "laohu-audio-samples-build.mjs"), "utf8"),
    ]);
    const provenanceLines = localCode.split("\n").slice(0, 3).join("\n");
    assert.ok(localCode.startsWith(provenanceLines + "\n"));
    const normalizedLocalCode = localCode.slice(provenanceLines.length + 1)
      .replace("import { OmError } from './laohu-audio-mix.mjs';", "import { OmError } from './project.js';")
      .replace("import { packDir } from './laohu-audio-samples.mjs';", "import { packDir } from './samples.js';");
    assert.equal(normalizedLocalCode, sourceCode, "builder implementation should differ only by its provenance header and local helper imports");

    const sourceLog = [], localLog = [];
    await sourceBuilder.buildSamples({out: sourceOut, only: ["piano"], log: (line) => sourceLog.push(line)});
    await localBuilder.buildSamples({out: localOut, only: ["piano"], log: (line) => localLog.push(line)});
    await assert.rejects(fs.access(curlLog), {code: "ENOENT"});
    const sourceManifest = JSON.parse(await fs.readFile(path.join(sourceOut, "manifest.json"), "utf8"));
    const localManifest = JSON.parse(await fs.readFile(path.join(localOut, "manifest.json"), "utf8"));
    assert.deepEqual(localManifest.instruments, sourceManifest.instruments);
    assert.deepEqual(await fs.readFile(path.join(localOut, "NOTICE.txt")), await fs.readFile(path.join(sourceOut, "NOTICE.txt")));
    const rows = [];
    for (const item of [...sourceManifest.instruments.piano.samples, ...sourceManifest.instruments.piano.releases]) {
      const [sourceBytes, localBytes] = await Promise.all([
        fs.readFile(path.join(sourceOut, item.file)), fs.readFile(path.join(localOut, item.file)),
      ]);
      const decoded = [sourceOut, localOut].map((out) => spawnSync(ffmpeg, ["-v", "error", "-i", path.join(out, item.file), "-f", "f32le", "-ac", "1", "-ar", "48000", "-"], {encoding: "buffer", maxBuffer: 16 << 20}));
      for (const result of decoded) assert.equal(result.status, 0, result.stderr?.toString() || result.error?.message);
      assert.deepEqual(decoded[1].stdout, decoded[0].stdout, `${item.file} decoded PCM must match the pinned source builder`);
      rows.push({file: item.file, sourceContainerSha256: sha256(sourceBytes), localContainerSha256: sha256(localBytes), sourcePcmSha256: sha256(decoded[0].stdout), localPcmSha256: sha256(decoded[1].stdout)});
    }
    const catalog = JSON.parse(await fs.readFile(path.join(skillRoot, "templates", "catalog.json"), "utf8"));
    const localPin = catalog.sources.find((row) => row.id === "huashu-motion")?.localRuntime;
    const evidence = {
      format: "laohu.motion.local-samples-builder-parity/1",
      sourceCommit: "52467f99c602b76ba86d511d37acdfe93fa1e16e",
      sourceBuilderSha256: "65fa21018f49d23ad7f2d2a81f2f43b4edecbf3a7fe3881616c1ba40a8515abc",
      localBuilderSha256: sha256(await fs.readFile(path.join(runtimeRoot, "laohu-audio-samples-build.mjs"))),
      only: ["piano"], cacheFixture: "synthetic Salamander-named sine recordings; no third-party audio",
      curlInvoked: false, sourceLog, localLog, encodedOutputs: rows,
      result: "source and local builder manifest instrument rows, notices and decoded 48 kHz PCM are identical for this fixture; Ogg serial/checksum container fields differ",
      localRuntimeClosureSha256: localPin?.closureSha256 || null,
      sourceClosureSha256: localPin?.sourceClosureSha256 || null,
    };
    const evidencePath = path.join(validationRoot, `audio-local-samples-builder-parity-${process.pid}-${crypto.randomBytes(4).toString("hex")}.json`);
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {flag: "wx"});
  } finally {
    for (const [name, value] of prior) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
    await fs.rm(runRoot, {recursive: true, force: true});
  }
});
