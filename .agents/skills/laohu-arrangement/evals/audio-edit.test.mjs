import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decodeIndexedAsset, editSourceWav, readWavInfo, validateSpec } from "../scripts/audio-edit.mjs";

const evalDir = path.dirname(fileURLToPath(import.meta.url));
const arrangementDir = path.resolve(evalDir, "..");
const projectRoot = path.resolve(arrangementDir, "../../..");
const scriptFile = path.join(arrangementDir, "scripts", "audio-edit.mjs");
const cacheRoot = process.env.MOTION_AUDIO_TEST_TMP_DIR
  ? path.resolve(process.env.MOTION_AUDIO_TEST_TMP_DIR)
  : path.join(projectRoot, ".cache", "tmp", "arrangement-sound", "audio-edit-tests");
const artifactRoot = process.env.MOTION_AUDIO_TEST_ARTIFACTS_DIR
  ? path.resolve(process.env.MOTION_AUDIO_TEST_ARTIFACTS_DIR)
  : path.join(projectRoot, ".cache", "validation", "motion-resource-upgrade", "audio");
const ffmpeg = process.env.MOTION_TEST_FFMPEG || process.env.MOTION_FFMPEG;
const ffprobe = process.env.MOTION_TEST_FFPROBE || process.env.MOTION_FFPROBE
  || (ffmpeg && (path.isAbsolute(ffmpeg) || ffmpeg.includes(path.sep))
    ? path.join(path.dirname(path.resolve(ffmpeg)), "ffprobe") : "ffprobe");

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
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "real-source-edit-"));
  try {
    const source = path.join(directory, "source.wav");
    const specFile = path.join(directory, "edit-spec.json");
    const outputFile = path.join(directory, "derived.wav");
    const receiptFile = path.join(directory, "derived.receipt.json");
    await makeSine(source);
    const sourceHash = hash(await fs.readFile(source));
    const sourceAsset = {
      assetId: "licensed-source-asset",
      sha256: sourceHash,
      generationMode: "indexed-source",
      redistributionStatus: "redistributable",
    };
    const spec = {
      schemaVersion: 1,
      notes: "Technical test only; not a listening or ready-status claim.",
      layers: [
        { id: "tempo-layer", file: "source.wav", sourceAsset, sourceInSec: 0.1, sourceOutSec: 0.9, startSec: 0.2, gainDb: -6, fadeInSec: 0.02, fadeOutSec: 0.02, tempo: 2, repeatCount: 2, crossfadeSec: 0.05, hitPointsSec: [0.3] },
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
    assert.equal(receipt.sourceLineage.format, "laohu.audio-source-lineage/1");
    assert.equal(receipt.sourceLineage.status, "incomplete-source-declarations", "undeclared layers remain visibly incomplete");
    assert.equal(receipt.sourceLineage.parents[0].assetId, sourceAsset.assetId);
    assert.equal(receipt.sourceLineage.parents[0].sha256, sourceHash);
    assert.equal(receipt.layers[0].sourceAsset.redistributionStatus, "redistributable");
    assert.deepEqual(receipt.layers[0].hitPoints.map((item) => item.sample), [14400, 31200]);
    assert.equal(receipt.layers[1].edit.timeChange, "playback-rate-changes-pitch");
    assert.equal(receipt.layers[1].hitPoints[0].sample, 9600);
    assert.equal(hash(await fs.readFile(source)), sourceHash, "source WAV stays unchanged");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("indexed MP3 and OGG decode receipts bind original identity through a derived technical mix", { skip: !ffmpeg || !ffprobe }, async () => {
  const indexPath = path.join(projectRoot, ".agents", "skills", "laohu-motion", "assets", "audio", "index.json");
  const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
  const music = index.assets.find((asset) => asset.id === "freesound.music-explanatory-soft-piano-710546");
  const sfx = index.assets.find((asset) => asset.id === "kenney.impact-wood-light-001");
  assert.ok(music, "the real indexed Freesound MP3 is available");
  assert.ok(sfx, "the real indexed Kenney OGG is available");
  const validationDir = artifactRoot;
  const scratchDir = path.join(projectRoot, ".cache", "tmp", "motion-resource-upgrade", "audio", "identity-chain-test");
  await fs.mkdir(validationDir, { recursive: true });
  const musicOriginalPath = path.resolve(path.dirname(indexPath), music.file);
  const sfxOriginalPath = path.resolve(path.dirname(indexPath), sfx.file);
  const musicOriginalSha = hash(await fs.readFile(musicOriginalPath));
  const sfxOriginalSha = hash(await fs.readFile(sfxOriginalPath));
  const musicWav = path.join(validationDir, "identity-chain-soft-piano-decoded.wav");
  const musicDecodeReceiptPath = path.join(validationDir, "identity-chain-soft-piano-decoded.receipt.json");
  const sfxWav = path.join(validationDir, "identity-chain-wood-impact-decoded.wav");
  const sfxDecodeReceiptPath = path.join(validationDir, "identity-chain-wood-impact-decoded.receipt.json");
  const musicDecode = await decodeIndexedAsset({
    assetIndexFile: indexPath, assetId: music.id, outputFile: musicWav, receiptFile: musicDecodeReceiptPath,
    tmpDir: scratchDir, workRoot: projectRoot, ffmpeg, ffprobe, overwrite: true,
  });
  const sfxDecode = await decodeIndexedAsset({
    assetIndexFile: indexPath, assetId: sfx.id, outputFile: sfxWav, receiptFile: sfxDecodeReceiptPath,
    tmpDir: scratchDir, workRoot: projectRoot, ffmpeg, ffprobe, overwrite: true,
  });
  const musicInfo = await readWavInfo(musicWav);
  const sfxInfo = await readWavInfo(sfxWav);
  const durationSec = Math.min(5, musicInfo.durationSec);
  const impactDurationSec = Math.min(0.55, sfxInfo.durationSec);
  assert.ok(durationSec > 2 && impactDurationSec > 0.05);
  const specFile = path.join(validationDir, "identity-chain-technical-mix.spec.json");
  const outputFile = path.join(validationDir, "identity-chain-technical-mix.wav");
  const editReceiptFile = path.join(validationDir, "identity-chain-technical-mix.receipt.json");
  const spec = {
    schemaVersion: 1,
    notes: "Technical MP3+OGG decode and source-edit chain proof; not auditioned and not a creative mix approval.",
    layers: [
      {
        id: "indexed-music-bed", file: path.basename(musicWav), sourceAssetReceipt: path.basename(musicDecodeReceiptPath),
        sourceInSec: 0, sourceOutSec: durationSec, startSec: 0, gainDb: -12,
        fadeInSec: 0.15, fadeOutSec: 0.3,
      },
      {
        id: "indexed-wood-impact", file: path.basename(sfxWav), sourceAssetReceipt: path.basename(sfxDecodeReceiptPath),
        sourceInSec: 0, sourceOutSec: impactDurationSec, startSec: 1.2, gainDb: -14,
      },
    ],
  };
  await fs.writeFile(specFile, `${JSON.stringify(spec, null, 2)}\n`);
  const edit = await editSourceWav({
    specFile, outputFile, receiptFile: editReceiptFile, tmpDir: scratchDir, ffmpeg, overwrite: true,
  });
  const editReceipt = edit.receipt;
  assert.equal(editReceipt.reviewStatus, "candidate-unreviewed");
  assert.equal(editReceipt.sourceLineage.status, "indexed-decode-receipt-and-hash-matched");
  assert.equal(editReceipt.output.sha256, hash(await fs.readFile(outputFile)));
  assert.equal(editReceipt.output.durationSec, 5);
  const lineageById = new Map(editReceipt.sourceLineage.parents.map((parent) => [parent.parent.assetId, parent]));
  for (const [asset, decoded, originalSha, layerId] of [
    [music, musicDecode, musicOriginalSha, "indexed-music-bed"],
    [sfx, sfxDecode, sfxOriginalSha, "indexed-wood-impact"],
  ]) {
    const decodedReceipt = JSON.parse(await fs.readFile(decoded.receiptFile, "utf8"));
    const layer = editReceipt.layers.find((row) => row.id === layerId);
    const lineage = lineageById.get(asset.id);
    assert.equal(decodedReceipt.sourceSha256, originalSha);
    assert.equal(decodedReceipt.sourceAsset.id, asset.id);
    assert.equal(decodedReceipt.decoded.sha256, hash(await fs.readFile(decoded.output)));
    assert.equal(layer.source.sha256, decodedReceipt.decoded.sha256);
    assert.equal(layer.sourceAsset.sha256, decodedReceipt.decoded.sha256);
    assert.equal(layer.sourceAsset.sourceAssetReceiptSha256, hash(await fs.readFile(decoded.receiptFile)));
    assert.equal(layer.sourceAsset.parent.assetId, asset.id);
    assert.equal(layer.sourceAsset.parent.sha256, originalSha);
    assert.equal(lineage.sha256, decodedReceipt.decoded.sha256);
    assert.equal(lineage.parent.sha256, originalSha);
    assert.equal(lineage.parent.sourceProvenance.author, asset.author);
    assert.equal(lineage.parent.sourceProvenance.license, asset.license);
    assert.equal(lineage.parent.sourceProvenance.sourcePage, asset.source.page);
    assert.equal(decodedReceipt.reviewStatus, "candidate-unreviewed");
  }
  assert.equal(editReceipt.layers.find((row) => row.id === "indexed-music-bed").sourceAsset.parent.assetId, music.id);
  assert.equal(editReceipt.layers.find((row) => row.id === "indexed-wood-impact").sourceAsset.parent.assetId, sfx.id);
  assert.equal(hash(await fs.readFile(musicOriginalPath)), musicOriginalSha, "original MP3 stays unchanged");
  assert.equal(hash(await fs.readFile(sfxOriginalPath)), sfxOriginalSha, "original OGG stays unchanged");
});

test("audio-edit refuses source lineage metadata whose hash does not match the actual layer WAV", { skip: !ffmpeg }, async () => {
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "lineage-hash-mismatch-"));
  try {
    const source = path.join(directory, "source.wav");
    const specFile = path.join(directory, "spec.json");
    await makeSine(source);
    await fs.writeFile(specFile, JSON.stringify({
      schemaVersion: 1,
      layers: [{ id: "source", file: "source.wav", sourceAsset: {
        assetId: "mismatched-source", sha256: "0".repeat(64), generationMode: "indexed-source", redistributionStatus: "redistributable",
      } }],
    }));
    await assert.rejects(editSourceWav({
      specFile, outputFile: path.join(directory, "derived.wav"), receiptFile: path.join(directory, "derived.receipt.json"),
      tmpDir: path.join(directory, "tmp"), ffmpeg,
    }), /sourceAsset.sha256 does not match the actual source WAV/);
    assert.equal(await fs.access(path.join(directory, "derived.wav")).then(() => true, () => false), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("tempo keeps pitch while playbackRate changes pitch in actual rendered WAVs", { skip: !ffmpeg }, async () => {
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
    assert.ok(Math.abs(results[0].info.durationSec - 1.6) <= 2 / 48000);
    assert.ok(Math.abs(results[1].info.durationSec - 1.5) <= 2 / 48000);
    assert.ok(maxAdjacentDelta(results[1].samples) < maxAdjacentDelta(results[0].samples), "crossfade smooths the constructed signal discontinuity");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("cross-source music handoff keeps both independently faded layers overlapping instead of creating a gap", { skip: !ffmpeg }, async () => {
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, "cross-source-handoff-"));
  try {
    await makeSine(path.join(directory, "section-a.wav"), 440, 1, "0.45");
    await makeSine(path.join(directory, "section-b.wav"), 880, 1, "0.45");
    const layerA = { id: "section-a", file: "section-a.wav", startSec: 0, fadeOutSec: 0.3, gainDb: -6 };
    const layerB = { id: "section-b", file: "section-b.wav", startSec: 0.8, fadeInSec: 0.3, gainDb: -6 };
    const render = async (name, layers) => {
      const specFile = path.join(directory, `${name}.json`);
      const outputFile = path.join(directory, `${name}.wav`);
      const receiptFile = path.join(directory, `${name}.receipt.json`);
      await fs.writeFile(specFile, JSON.stringify({
        schemaVersion: 1,
        notes: "Technical linear-sum reference only; source phrase, harmony, and listening quality are not judged by this test.",
        layers,
      }, null, 2));
      const result = await editSourceWav({
        specFile, outputFile, receiptFile, tmpDir: path.join(directory, `${name}-tmp`), ffmpeg,
      });
      return { outputFile, result };
    };
    const soloA = await render("solo-a", [layerA]);
    const soloB = await render("solo-b", [layerB]);
    const mixed = await render("handoff", [layerA, layerB]);
    assert.ok(Math.abs(mixed.result.durationSec - 1.8) <= 1 / 48000);
    assert.equal(mixed.result.receipt.layers[0].edit.startSec, 0);
    assert.equal(mixed.result.receipt.layers[1].edit.startSec, 0.8);
    assert.ok(mixed.result.receipt.layers[0].edit.startSec + mixed.result.receipt.layers[0].edit.derivedDurationSec > mixed.result.receipt.layers[1].edit.startSec,
      "the first source remains active when the second source starts");
    const [a, b, sum] = await Promise.all([
      readFloatSamples(soloA.outputFile, 0.9, 0.95),
      readFloatSamples(soloB.outputFile, 0.9, 0.95),
      readFloatSamples(mixed.outputFile, 0.9, 0.95),
    ]);
    assert.equal(sum.length, a.length);
    assert.equal(sum.length, b.length);
    const maximumLinearSumError = Math.max(...sum.map((sample, index) => Math.abs(sample - a[index] - b[index])));
    assert.ok(maximumLinearSumError <= 1e-5,
      `cross-source handoff must equal the two independently faded source layers in their overlap (max error ${maximumLinearSumError})`);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("float source summing retains over-range peaks and reports them without normalization or limiting", { skip: !ffmpeg }, async () => {
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
