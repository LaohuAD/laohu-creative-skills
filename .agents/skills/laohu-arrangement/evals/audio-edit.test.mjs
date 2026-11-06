import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { editSourceWav, readWavInfo, validateSpec } from "../scripts/audio-edit.mjs";

const evalDir = path.dirname(fileURLToPath(import.meta.url));
const arrangementDir = path.resolve(evalDir, "..");
const projectRoot = path.resolve(arrangementDir, "../../..");
const scriptFile = path.join(arrangementDir, "scripts", "audio-edit.mjs");
const ffmpeg = process.env.MOTION_TEST_FFMPEG || process.env.MOTION_FFMPEG;

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { encoding: "utf8", env, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} failed:\n${result.stdout || ""}\n${result.stderr || ""}`);
  return result;
}
async function makeSine(file, frequency = 440, duration = 1, amplitude = "0.45") {
  run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `aevalsrc=${amplitude}*sin(2*PI*${frequency}*t):s=48000:d=${duration}`,
    "-ac", "1", "-c:a", "pcm_s16le", file,
  ]);
}
async function readFloatSamples(file, startSec, endSec) {
  const info = await readWavInfo(file);
  assert.equal(info.format, "float-pcm");
  assert.equal(info.bitsPerSample, 32);
  const handle = await fs.open(file, "r");
  try {
    const start = Math.floor(startSec * info.sampleRate) * info.channels;
    const end = Math.min(Math.floor(endSec * info.sampleRate) * info.channels, info.dataBytes / 4);
    const buffer = Buffer.alloc((end - start) * 4);
    await handle.read(buffer, 0, buffer.length, info.dataOffset + start * 4);
    return Array.from({ length: buffer.length / 4 }, (_, index) => buffer.readFloatLE(index * 4));
  } finally {
    await handle.close();
  }
}
function positiveZeroCrossings(samples) {
  let count = 0;
  for (let i = 1; i < samples.length; i += 1) if (samples[i - 1] <= 0 && samples[i] > 0) count += 1;
  return count;
}
function maxAdjacentDelta(samples) {
  let maximum = 0;
  for (let i = 1; i < samples.length; i += 1) maximum = Math.max(maximum, Math.abs(samples[i] - samples[i - 1]));
  return maximum;
}

test("audio-edit spec refuses ambiguous tempo and unsupported fields", () => {
  assert.throws(() => validateSpec({ schemaVersion: 1, layers: [{ id: "x", file: "x.wav", tempo: 1.2, playbackRate: 1.2 }] }), /cannot set both/);
  assert.throws(() => validateSpec({ schemaVersion: 1, layers: [{ id: "x", file: "x.wav", automaticNormalize: true }] }), /not implemented/);
});

test("CLI edits real source WAVs, records duration/hash/hitpoint mapping, and keeps source files intact", { skip: !ffmpeg }, async () => {
  const cacheRoot = path.join(projectRoot, ".cache", "tmp", "arrangement-sound", "audio-edit-tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "real-source-edit-"));
  try {
    const source = path.join(directory, "source.wav");
    const specFile = path.join(directory, "edit-spec.json");
    const outputFile = path.join(directory, "derived.wav");
    const receiptFile = path.join(directory, "derived.receipt.json");
    await makeSine(source);
    const sourceHash = hash(await fs.readFile(source));
    const spec = {
      schemaVersion: 1,
      notes: "Technical test only; not a listening or ready-status claim.",
      layers: [
        { id: "tempo-layer", file: "source.wav", sourceInSec: 0.1, sourceOutSec: 0.9, startSec: 0.2, gainDb: -6, fadeInSec: 0.02, fadeOutSec: 0.02, tempo: 2, repeatCount: 2, crossfadeSec: 0.05, hitPointsSec: [0.3] },
        { id: "rate-layer", file: "source.wav", sourceInSec: 0.2, sourceOutSec: 0.8, startSec: 0.1, playbackRate: 1.5, hitPointsSec: [0.35] },
      ],
    };
    await fs.writeFile(specFile, JSON.stringify(spec, null, 2));
    const cli = run(process.execPath, [
      scriptFile, "--spec", specFile, "--output", outputFile,
      "--receipt", receiptFile, "--tmp-dir", path.join(directory, "tmp"), "--ffmpeg", ffmpeg,
    ], { ...process.env, TMPDIR: path.join(directory, "tmp") });
    assert.match(cli.stdout, new RegExp(`RECEIPT ${receiptFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.doesNotMatch(cli.stdout, /RECEIPT \[object Object\]/);
    const info = await readWavInfo(outputFile);
    assert.equal(info.format, "float-pcm");
    assert.equal(info.sampleRate, 48000);
    assert.equal(info.channels, 2);
    assert.equal(info.bitsPerSample, 32);
    assert.ok(Math.abs(info.durationSec - 0.95) <= 1 / 48000, `duration was ${info.durationSec}, expected 0.95`);
    const receipt = JSON.parse(await fs.readFile(receiptFile, "utf8"));
    assert.equal(receipt.reviewStatus, "candidate-unreviewed");
    assert.equal(receipt.output.sha256, hash(await fs.readFile(outputFile)));
    assert.equal(receipt.layers[0].edit.timeChange, "tempo-preserving-pitch");
    assert.deepEqual(receipt.layers[0].hitPoints.map((item) => item.sample), [14400, 31200]);
    assert.equal(receipt.layers[1].edit.timeChange, "playback-rate-changes-pitch");
    assert.equal(receipt.layers[1].hitPoints[0].sample, 9600);
    assert.equal(hash(await fs.readFile(source)), sourceHash, "source WAV stays unchanged");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("tempo keeps pitch while playbackRate changes pitch in actual rendered WAVs", { skip: !ffmpeg }, async () => {
  const cacheRoot = path.join(projectRoot, ".cache", "tmp", "arrangement-sound", "audio-edit-tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "tempo-vs-rate-"));
  try {
    const source = path.join(directory, "source.wav");
    await makeSine(source, 440, 1, "0.5");
    const outputs = [];
    for (const [id, field, factor] of [["tempo", "tempo", 2], ["rate", "playbackRate", 2]]) {
      const specFile = path.join(directory, `${id}.json`);
      const outputFile = path.join(directory, `${id}.wav`);
      const receiptFile = path.join(directory, `${id}.receipt.json`);
      await fs.writeFile(specFile, JSON.stringify({ schemaVersion: 1, layers: [{ id, file: "source.wav", [field]: factor }] }));
      await editSourceWav({ specFile, outputFile, receiptFile, tmpDir: path.join(directory, "tmp"), ffmpeg });
      outputs.push({ outputFile, info: await readWavInfo(outputFile) });
    }
    for (const { info } of outputs) assert.ok(Math.abs(info.durationSec - 0.5) <= 1 / 48000);
    const tempoSamples = await readFloatSamples(outputs[0].outputFile, 0.1, 0.4);
    const rateSamples = await readFloatSamples(outputs[1].outputFile, 0.1, 0.4);
    assert.ok(Math.abs(positiveZeroCrossings(tempoSamples) / 0.3 - 440) < 20, "atempo preserves the source pitch");
    assert.ok(Math.abs(positiveZeroCrossings(rateSamples) / 0.3 - 880) < 30, "asetrate playbackRate changes source pitch");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("technical loop crossfade reduces a discontinuous source seam without claiming musical phrase validity", { skip: !ffmpeg }, async () => {
  const cacheRoot = path.join(projectRoot, ".cache", "tmp", "arrangement-sound", "audio-edit-tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "loop-seam-"));
  try {
    const source = path.join(directory, "two-materials.wav");
    run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "sine=frequency=233:duration=0.37:sample_rate=48000",
      "-f", "lavfi", "-i", "sine=frequency=877:duration=0.43:sample_rate=48000",
      "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[a]", "-map", "[a]", "-ac", "1", "-c:a", "pcm_s16le", source,
    ]);
    const results = [];
    for (const crossfadeSec of [0, 0.1]) {
      const name = crossfadeSec ? "cross" : "hard";
      const specFile = path.join(directory, `${name}.json`);
      const outputFile = path.join(directory, `${name}.wav`);
      await fs.writeFile(specFile, JSON.stringify({
        schemaVersion: 1,
        layers: [{ id: name, file: "two-materials.wav", repeatCount: 2, crossfadeSec }],
      }));
      await editSourceWav({ specFile, outputFile, receiptFile: `${outputFile}.receipt.json`, tmpDir: path.join(directory, "tmp"), ffmpeg });
      const info = await readWavInfo(outputFile);
      const seamStart = crossfadeSec ? 0.7 : 0.79;
      const seamEnd = crossfadeSec ? 0.81 : 0.81;
      results.push({ info, samples: await readFloatSamples(outputFile, seamStart, seamEnd) });
    }
    assert.ok(Math.abs(results[0].info.durationSec - 1.6) <= 1 / 48000);
    assert.ok(Math.abs(results[1].info.durationSec - 1.5) <= 1 / 48000);
    assert.ok(maxAdjacentDelta(results[1].samples) < maxAdjacentDelta(results[0].samples), "crossfade smooths the constructed signal discontinuity");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("float source summing retains over-range peaks and reports them without normalization or limiting", { skip: !ffmpeg }, async () => {
  const cacheRoot = path.join(projectRoot, ".cache", "tmp", "arrangement-sound", "audio-edit-tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "float-headroom-"));
  try {
    const source = path.join(directory, "source.wav");
    const specFile = path.join(directory, "sum.json");
    await makeSine(source, 440, 0.5, "0.8");
    const layers = Array.from({ length: 8 }, (_, index) => ({ id: `layer-${index + 1}`, file: "source.wav", gainDb: 12 }));
    await fs.writeFile(specFile, JSON.stringify({ schemaVersion: 1, layers }));
    const outputFile = path.join(directory, "summed.wav");
    const receiptFile = path.join(directory, "summed.receipt.json");
    const result = await editSourceWav({ specFile, outputFile, receiptFile, tmpDir: path.join(directory, "tmp"), ffmpeg });
    assert.ok(result.receipt.output.peakAbsolute > 1.5, "float output retains the summed over-range peak");
    assert.ok(result.receipt.output.samplesAboveFullScale > 0, "receipt reports samples above full scale");
    assert.match(result.receipt.processing.summing, /no normalization, limiting, or clipping guard/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("source spec path and same-inode aliases cannot be overwritten as outputs", { skip: !ffmpeg }, async () => {
  const cacheRoot = path.join(projectRoot, ".cache", "tmp", "arrangement-sound", "audio-edit-tests");
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "path-protection-"));
  try {
    const source = path.join(directory, "source.wav");
    const specFile = path.join(directory, "spec.json");
    await makeSine(source);
    await fs.writeFile(specFile, JSON.stringify({ schemaVersion: 1, layers: [{ id: "source", file: "source.wav" }] }));
    const originalSpecHash = hash(await fs.readFile(specFile));
    await assert.rejects(editSourceWav({
      specFile, outputFile: specFile, receiptFile: path.join(directory, "receipt.json"),
      tmpDir: path.join(directory, "tmp"), ffmpeg, overwrite: true,
    }), /collides with the source spec/);
    const hardlink = path.join(directory, "spec-hardlink.json");
    await fs.link(specFile, hardlink);
    await assert.rejects(editSourceWav({
      specFile, outputFile: hardlink, receiptFile: path.join(directory, "hardlink.receipt.json"),
      tmpDir: path.join(directory, "tmp"), ffmpeg, overwrite: true,
    }), /collides with the source spec/);
    assert.equal(hash(await fs.readFile(specFile)), originalSpecHash);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
