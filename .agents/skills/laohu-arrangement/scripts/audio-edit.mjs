#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function fail(message) { throw new Error(message); }
function finite(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(`${label} must be a finite number in [${min}, ${max}]`);
  }
  return value;
}
function integer(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} must be an integer in [${min}, ${max}]`);
  return value;
}
function stableId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) fail(`${label} must be a stable ID`);
  return value;
}
function fmt(value) { return Number(value.toFixed(9)).toString(); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

const LINEAGE_MODES = new Set(["original-synthesis", "source-edit", "transcode", "audio-edit", "source-recording", "indexed-source", "user-provided"]);

function normalizeAssetLineage(value, label, depth = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be a source asset lineage object`);
  if (depth > 8) fail(`${label} exceeds the supported lineage depth`);
  const allowed = new Set(["assetId", "sha256", "generationMode", "generationScopes", "generationAuthorizationRequestSha256", "redistributionStatus", "sourceAssetReceiptSha256", "sourceProvenance", "parent", "parents"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label}.${key} is not implemented by audio-edit/1`);
  const assetId = stableId(value.assetId, `${label}.assetId`);
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256)) fail(`${label}.sha256 must be a SHA-256`);
  const generationMode = value.generationMode == null ? "indexed-source" : value.generationMode;
  if (typeof generationMode !== "string" || !LINEAGE_MODES.has(generationMode)) fail(`${label}.generationMode is unsupported`);
  if (typeof value.redistributionStatus !== "string" || !value.redistributionStatus.trim()) fail(`${label}.redistributionStatus is required`);
  let generationScopes;
  if (value.generationScopes != null) {
    if (!Array.isArray(value.generationScopes) || value.generationScopes.some((scope) => !["music", "sfx"].includes(scope))) {
      fail(`${label}.generationScopes must contain only music and sfx`);
    }
    generationScopes = [...new Set(value.generationScopes)].sort();
  }
  if (value.generationAuthorizationRequestSha256 != null
      && (typeof value.generationAuthorizationRequestSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.generationAuthorizationRequestSha256))) {
    fail(`${label}.generationAuthorizationRequestSha256 must be a SHA-256`);
  }
  if (value.sourceAssetReceiptSha256 != null
      && (typeof value.sourceAssetReceiptSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sourceAssetReceiptSha256))) {
    fail(`${label}.sourceAssetReceiptSha256 must be a SHA-256`);
  }
  let sourceProvenance;
  if (value.sourceProvenance != null) {
    if (!value.sourceProvenance || typeof value.sourceProvenance !== "object" || Array.isArray(value.sourceProvenance)) {
      fail(`${label}.sourceProvenance must be an object`);
    }
    const provenanceFields = new Set(["provider", "key", "file", "role", "author", "sourcePage", "license", "licenseTitle", "licenseUrl", "sourceGetReceiptSha256", "sourceSearchReceiptSha256", "licenseEvidenceFile", "licenseEvidenceSha256", "reviewStatus"]);
    for (const key of Object.keys(value.sourceProvenance)) {
      if (!provenanceFields.has(key)) fail(`${label}.sourceProvenance.${key} is not implemented by audio-edit/1`);
      if (value.sourceProvenance[key] != null && typeof value.sourceProvenance[key] !== "string") {
        fail(`${label}.sourceProvenance.${key} must be a string when present`);
      }
    }
    sourceProvenance = Object.fromEntries(Object.entries(value.sourceProvenance).filter(([, item]) => item != null));
  }
  if (value.parent != null && value.parents != null) fail(`${label} cannot set both parent and parents`);
  const parentValues = value.parents ?? (value.parent == null ? [] : [value.parent]);
  if (!Array.isArray(parentValues) || parentValues.length > 8) fail(`${label}.parents must contain at most 8 source records`);
  const parents = parentValues.map((parent, index) => normalizeAssetLineage(parent, `${label}.parents[${index}]`, depth + 1));
  return {
    assetId,
    sha256: value.sha256.toLowerCase(),
    generationMode,
    ...(generationScopes ? { generationScopes } : {}),
    ...(value.generationAuthorizationRequestSha256 ? { generationAuthorizationRequestSha256: value.generationAuthorizationRequestSha256.toLowerCase() } : {}),
    redistributionStatus: value.redistributionStatus,
    ...(value.sourceAssetReceiptSha256 ? { sourceAssetReceiptSha256: value.sourceAssetReceiptSha256.toLowerCase() } : {}),
    ...(sourceProvenance ? { sourceProvenance } : {}),
    ...(parents.length === 1 ? { parent: parents[0] } : parents.length > 1 ? { parents } : {}),
  };
}

async function hashFile(file) {
  const hash = createHash("sha256");
  const stream = (await import("node:fs")).createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

function capture(command, argv, env, label) {
  const result = spawnSync(command, argv, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, env });
  if (result.error) fail(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed (exit ${result.status})\n${result.stdout || ""}\n${result.stderr || ""}`);
  return { stdout: result.stdout || "", stderr: result.stderr || "" };
}

function indexedSourceAssetFromReceipt(receipt, receiptBytes) {
  if (!receipt || typeof receipt !== "object" || receipt.format !== "laohu.audio-source-decode-receipt/1") {
    fail("sourceAssetReceipt must use laohu.audio-source-decode-receipt/1");
  }
  const decoded = receipt.decoded;
  const original = receipt.sourceAsset;
  if (!decoded || !original || typeof decoded !== "object" || typeof original !== "object") fail("sourceAssetReceipt is missing its decoded asset or indexed source asset");
  if (typeof decoded.assetId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(decoded.assetId)) fail("sourceAssetReceipt decoded asset ID is invalid");
  if (typeof decoded.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(decoded.sha256)) fail("sourceAssetReceipt decoded hash is invalid");
  if (typeof original.id !== "string" || typeof original.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(original.sha256)) fail("sourceAssetReceipt indexed source identity is invalid");
  if (typeof decoded.file !== "string" || !decoded.file.trim()) fail("sourceAssetReceipt decoded output file is invalid");
  if (receipt.sourceSha256 !== original.sha256.toLowerCase()
      || decoded.parentAssetId !== original.id || decoded.parentSha256 !== original.sha256.toLowerCase()) {
    fail("sourceAssetReceipt decoded parent does not match the indexed source asset");
  }
  if (!receipt.assetIndex || typeof receipt.assetIndex.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(receipt.assetIndex.sha256)) {
    fail("sourceAssetReceipt does not identify the exact source index hash");
  }
  const redistributionStatus = original.redistribution?.status || "unknown";
  const provenance = {
    provider: original.source?.provider,
    key: original.source?.key,
    file: original.file,
    role: original.role,
    author: original.author,
    sourcePage: original.source?.page,
    license: original.license,
    licenseTitle: original.licenseTitle || original.source?.licenseTitle,
    licenseUrl: original.licenseUrl || original.source?.licenseUrl,
    sourceGetReceiptSha256: original.source?.sourceGetReceiptSha256,
    sourceSearchReceiptSha256: original.source?.sourceSearchReceiptSha256,
    licenseEvidenceFile: original.source?.licenseEvidenceFile,
    licenseEvidenceSha256: original.source?.licenseEvidenceSha256,
    reviewStatus: original.reviewStatus,
  };
  const parent = normalizeAssetLineage({
    assetId: original.id,
    sha256: original.sha256,
    generationMode: "indexed-source",
    redistributionStatus,
    sourceProvenance: provenance,
  }, "sourceAssetReceipt.sourceAsset");
  return normalizeAssetLineage({
    assetId: decoded.assetId,
    sha256: decoded.sha256,
    generationMode: "transcode",
    redistributionStatus,
    sourceAssetReceiptSha256: sha256(receiptBytes),
    sourceProvenance: { ...provenance, file: decoded.file },
    parent,
  }, "sourceAssetReceipt.decoded");
}

function relativePathOrAbsolute(root, file) {
  const relative = path.relative(root, file);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)
    ? relative.split(path.sep).join("/")
    : file;
}

export async function decodeIndexedAsset({ assetIndexFile, assetId, outputFile, receiptFile, tmpDir,
  workRoot = process.cwd(), ffmpeg = process.env.MOTION_FFMPEG || "ffmpeg",
  ffprobe = process.env.MOTION_FFPROBE || "ffprobe", overwrite = false }) {
  if (![assetIndexFile, assetId, outputFile, receiptFile, tmpDir].every((value) => typeof value === "string" && value)) {
    fail("assetIndexFile, assetId, outputFile, receiptFile, and tmpDir are required");
  }
  stableId(assetId, "assetId");
  const indexPath = path.resolve(assetIndexFile);
  const outputPath = path.resolve(outputFile);
  const receiptPath = path.resolve(receiptFile);
  const tempPath = path.resolve(tmpDir);
  const workRootPath = path.resolve(workRoot);
  if (outputPath === receiptPath) fail("outputFile and receiptFile must be different paths");
  if (path.extname(outputPath).toLowerCase() !== ".wav") fail("decoded outputFile must use the .wav extension");
  const indexBytes = await fs.readFile(indexPath);
  const index = JSON.parse(indexBytes.toString("utf8"));
  if (!index || typeof index !== "object" || index.schemaVersion !== 1 || !Array.isArray(index.assets)) fail("asset index must use schemaVersion 1 and an assets array");
  const records = index.assets.filter((asset) => asset && asset.id === assetId);
  if (records.length !== 1) fail(`asset index must contain exactly one asset with ID ${assetId}`);
  const sourceAsset = records[0];
  if (typeof sourceAsset.file !== "string" || !sourceAsset.file.trim()) fail(`indexed asset ${assetId} has no relative file path`);
  if (path.isAbsolute(sourceAsset.file)) fail(`indexed asset ${assetId} file path must be relative to the index`);
  const sourcePath = path.resolve(path.dirname(indexPath), sourceAsset.file);
  const sourceRelative = path.relative(path.dirname(indexPath), sourcePath);
  if (sourceRelative === ".." || sourceRelative.startsWith(`..${path.sep}`) || path.isAbsolute(sourceRelative)) fail(`indexed asset ${assetId} file escapes the audio index directory`);
  if (typeof sourceAsset.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(sourceAsset.sha256)) fail(`indexed asset ${assetId} has no valid SHA-256`);
  if (await sameFile(sourcePath, outputPath) || await sameFile(sourcePath, receiptPath) || await sameFile(indexPath, outputPath) || await sameFile(indexPath, receiptPath)) {
    fail("output or receipt path collides with the indexed source or index");
  }
  const [actualSourceSha256, probed] = await Promise.all([
    hashFile(sourcePath),
    Promise.resolve(capture(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", sourcePath], process.env, "FFprobe indexed source")),
  ]);
  if (actualSourceSha256.toLowerCase() !== sourceAsset.sha256.toLowerCase()) fail(`indexed asset ${assetId} SHA-256 does not match its actual file`);
  let sourceProbe;
  try { sourceProbe = JSON.parse(probed.stdout); } catch { fail("FFprobe returned invalid JSON for indexed source"); }
  const audioStream = sourceProbe.streams?.find((stream) => stream.codec_type === "audio");
  if (!audioStream) fail(`indexed asset ${assetId} contains no audio stream`);
  const durationSec = Number(audioStream.duration || sourceProbe.format?.duration);
  if (!Number.isFinite(durationSec) || durationSec <= 0) fail(`FFprobe did not return a valid duration for indexed asset ${assetId}`);
  const codec = audioStream.codec_name || null;
  const sourceFormat = sourceProbe.format?.format_name || null;
  const sourceProbeInfo = {
    codec, format: sourceFormat,
    durationSec,
    sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : null,
    channels: audioStream.channels ?? null,
  };
  for (const candidate of [outputPath, receiptPath]) {
    if (!overwrite && await exists(candidate)) fail(`refusing to overwrite existing output without --overwrite: ${candidate}`);
  }
  if (await sameFile(outputPath, receiptPath)) fail("outputFile and receiptFile resolve to the same file");
  await fs.mkdir(tempPath, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(receiptPath), { recursive: true });
  const runDir = await fs.mkdtemp(path.join(tempPath, "audio-decode-"));
  const stageWav = path.join(runDir, "decoded.wav");
  const outputStage = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${process.pid}.partial`);
  const receiptStage = path.join(path.dirname(receiptPath), `.${path.basename(receiptPath)}.${process.pid}.partial`);
  const env = { ...process.env, TMPDIR: runDir, TMP: runDir, TEMP: runDir };
  try {
    const ffmpegVersion = capture(ffmpeg, ["-version"], env, "FFmpeg version check").stdout.split(/\r?\n/, 1)[0];
    const decodeArgs = ["-hide_banner", "-loglevel", "error", "-y", "-i", sourcePath, "-map", "0:a:0", "-vn", "-sn", "-dn", "-c:a", "pcm_f32le", "-ar", "48000", "-ac", "2", stageWav];
    capture(ffmpeg, decodeArgs, env, "FFmpeg indexed source decode");
    const decodedInfo = await readWavInfo(stageWav);
    if (decodedInfo.format !== "float-pcm" || decodedInfo.sampleRate !== 48000 || decodedInfo.channels !== 2 || decodedInfo.bitsPerSample !== 32) {
      fail("FFmpeg decoded output did not match float PCM32 48000 Hz stereo WAV");
    }
    if (Math.abs(decodedInfo.durationSec - durationSec) > 0.1) fail(`decoded duration ${decodedInfo.durationSec} differs materially from FFprobe source duration ${durationSec}`);
    const decodedSha256 = await hashFile(stageWav);
    if ((await hashFile(sourcePath)).toLowerCase() !== actualSourceSha256.toLowerCase()) fail("indexed source changed during decode");
    const decodedAssetId = `${assetId}.decoded-48000-f32-stereo`;
    const receipt = {
      format: "laohu.audio-source-decode-receipt/1",
      assetIndex: {
        file: relativePathOrAbsolute(workRootPath, indexPath),
        sha256: sha256(indexBytes),
      },
      sourceAsset: JSON.parse(JSON.stringify(sourceAsset)),
      sourceFile: relativePathOrAbsolute(path.dirname(indexPath), sourcePath),
      sourceProbe: sourceProbeInfo,
      sourceSha256: actualSourceSha256,
      decoded: {
        assetId: decodedAssetId,
        file: path.basename(outputPath),
        sha256: decodedSha256,
        format: decodedInfo.format,
        durationSec: decodedInfo.durationSec,
        sampleRate: decodedInfo.sampleRate,
        channels: decodedInfo.channels,
        bitsPerSample: decodedInfo.bitsPerSample,
        parentAssetId: sourceAsset.id,
        parentSha256: actualSourceSha256,
      },
      processing: {
        renderer: "FFmpeg",
        version: ffmpegVersion,
        argv: ["-map", "0:a:0", "-vn", "-sn", "-dn", "-c:a", "pcm_f32le", "-ar", "48000", "-ac", "2"],
        operation: "decode-indexed-compressed-source-to-float-pcm-wav",
      },
      reviewStatus: sourceAsset.reviewStatus || "candidate-unreviewed",
      reviewBoundary: "The receipt binds the indexed source file, its source hash, and the decoded WAV hash. Decoding and probing do not establish acoustic suitability or listening review.",
    };
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await fs.copyFile(stageWav, outputStage);
    await fs.writeFile(receiptStage, receiptBytes, { flag: "wx" });
    if (overwrite) {
      await fs.rename(outputStage, outputPath);
      await fs.rename(receiptStage, receiptPath);
    } else {
      let committedOutput = false;
      try {
        await fs.link(outputStage, outputPath);
        committedOutput = true;
        await fs.link(receiptStage, receiptPath);
      } catch (error) {
        if (committedOutput) await fs.rm(outputPath, { force: true });
        throw error;
      }
      await fs.rm(outputStage, { force: true });
      await fs.rm(receiptStage, { force: true });
    }
    return { output: outputPath, receiptFile: receiptPath, outputSha256: decodedSha256, receipt };
  } finally {
    await fs.rm(runDir, { recursive: true, force: true });
    await fs.rm(outputStage, { force: true });
    await fs.rm(receiptStage, { force: true });
  }
}

async function readWavInfo(file) {
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    if (stat.size < 44) fail(`source is not a complete RIFF/WAVE file: ${file}`);
    const header = Buffer.alloc(12);
    await handle.read(header, 0, header.length, 0);
    if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") {
      fail(`source must be a RIFF/WAVE file (RF64 is not supported here): ${file}`);
    }
    let offset = 12;
    let format = null;
    let channels = null;
    let sampleRate = null;
    let bitsPerSample = null;
    let byteRate = null;
    let dataBytes = null;
    let dataOffsetValue = null;
    while (offset + 8 <= stat.size) {
      const chunkHeader = Buffer.alloc(8);
      const read = await handle.read(chunkHeader, 0, 8, offset);
      if (read.bytesRead !== 8) break;
      const name = chunkHeader.toString("ascii", 0, 4);
      const size = chunkHeader.readUInt32LE(4);
      const dataOffset = offset + 8;
      if (dataOffset + size > stat.size) fail(`WAVE chunk ${name} exceeds the file size: ${file}`);
      if (name === "fmt ") {
        if (size < 16) fail(`WAVE fmt chunk is too short: ${file}`);
        const fmtBytes = Buffer.alloc(Math.min(size, 40));
        await handle.read(fmtBytes, 0, fmtBytes.length, dataOffset);
        format = fmtBytes.readUInt16LE(0);
        if (format === 0xfffe && size >= 40) {
          const subformat = fmtBytes.readUInt32LE(24);
          format = subformat;
        }
        channels = fmtBytes.readUInt16LE(2);
        sampleRate = fmtBytes.readUInt32LE(4);
        byteRate = fmtBytes.readUInt32LE(8);
        bitsPerSample = fmtBytes.readUInt16LE(14);
      } else if (name === "data" && dataBytes == null) {
        dataBytes = size;
        dataOffsetValue = dataOffset;
      }
      offset = dataOffset + size + (size & 1);
    }
    if (![1, 3].includes(format) || !channels || !sampleRate || !byteRate || !bitsPerSample || dataBytes == null) {
      fail(`source WAV needs PCM/float fmt and data chunks: ${file}`);
    }
    return {
      format: format === 1 ? "pcm" : "float-pcm",
      channels, sampleRate, bitsPerSample, dataBytes,
      dataOffset: dataOffsetValue,
      durationSec: dataBytes / byteRate,
    };
  } finally {
    await handle.close();
  }
}

async function measureWav(file, info) {
  const handle = await fs.open(file, "r");
  try {
    const bytesPerSample = info.bitsPerSample / 8;
    const blockAlign = bytesPerSample * info.channels;
    if (!Number.isInteger(bytesPerSample) || blockAlign < 1) fail("unsupported WAV sample width");
    const chunkSize = Math.max(blockAlign, Math.floor((1024 * 1024) / blockAlign) * blockAlign);
    const buffer = Buffer.alloc(chunkSize);
    let offset = info.dataOffset;
    let remaining = info.dataBytes;
    let peakAbsolute = 0;
    let samplesAboveFullScale = 0;
    while (remaining > 0) {
      const length = Math.min(remaining, chunkSize - (chunkSize % blockAlign));
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead !== length) fail("WAV data ended before its declared data chunk length");
      for (let pos = 0; pos < bytesRead; pos += bytesPerSample) {
        let sample;
        if (info.format === "float-pcm" && info.bitsPerSample === 32) sample = buffer.readFloatLE(pos);
        else if (info.format === "float-pcm" && info.bitsPerSample === 64) sample = buffer.readDoubleLE(pos);
        else if (info.bitsPerSample === 16) sample = buffer.readInt16LE(pos) / 32768;
        else if (info.bitsPerSample === 24) {
          let value = buffer[pos] | (buffer[pos + 1] << 8) | (buffer[pos + 2] << 16);
          if (value & 0x800000) value |= 0xff000000;
          sample = value / 8388608;
        } else if (info.bitsPerSample === 32) sample = buffer.readInt32LE(pos) / 2147483648;
        else fail(`peak measurement does not support ${info.bitsPerSample}-bit ${info.format}`);
        if (!Number.isFinite(sample)) fail("output WAV contains a non-finite sample");
        const absolute = Math.abs(sample);
        if (absolute > peakAbsolute) peakAbsolute = absolute;
        if (absolute > 1) samplesAboveFullScale += 1;
      }
      offset += bytesRead;
      remaining -= bytesRead;
    }
    return { peakAbsolute, samplesAboveFullScale };
  } finally {
    await handle.close();
  }
}

function tempoFilters(factor) {
  let remaining = factor;
  const filters = [];
  while (remaining > 2) { filters.push("atempo=2"); remaining /= 2; }
  while (remaining < 0.5) { filters.push("atempo=0.5"); remaining /= 0.5; }
  if (Math.abs(remaining - 1) > 1e-9) filters.push(`atempo=${fmt(remaining)}`);
  return filters;
}

function validateSpec(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec) || spec.schemaVersion !== 1) {
    fail("audio-edit spec must be an object with schemaVersion 1");
  }
  const allowedRoot = new Set(["schemaVersion", "layers", "notes"]);
  for (const key of Object.keys(spec)) if (!allowedRoot.has(key)) fail(`spec.${key} is not implemented by audio-edit/1`);
  if (!Array.isArray(spec.layers) || spec.layers.length < 1 || spec.layers.length > 8) {
    fail("spec.layers must contain 1–8 source layers");
  }
  const ids = new Set();
  for (const [index, layer] of spec.layers.entries()) {
    const label = `layers[${index}]`;
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) fail(`${label} must be an object`);
    const allowed = new Set(["id", "file", "sourceInSec", "sourceOutSec", "startSec", "gainDb", "fadeInSec", "fadeOutSec", "tempo", "playbackRate", "repeatCount", "crossfadeSec", "hitPointsSec", "sourceAsset", "sourceAssetReceipt"]);
    for (const key of Object.keys(layer)) if (!allowed.has(key)) fail(`${label}.${key} is not implemented by audio-edit/1`);
    layer.id = stableId(layer.id, `${label}.id`);
    if (ids.has(layer.id)) fail(`duplicate layer id: ${layer.id}`);
    ids.add(layer.id);
    if (typeof layer.file !== "string" || !layer.file.trim()) fail(`${label}.file is required`);
    if (layer.sourceAsset != null && layer.sourceAssetReceipt != null) fail(`${label} cannot set both sourceAsset and sourceAssetReceipt`);
    if (layer.sourceAssetReceipt != null && (typeof layer.sourceAssetReceipt !== "string" || !layer.sourceAssetReceipt.trim())) fail(`${label}.sourceAssetReceipt must be a receipt path`);
    if (layer.sourceAsset != null) layer.sourceAsset = normalizeAssetLineage(layer.sourceAsset, `${label}.sourceAsset`);
    for (const key of ["sourceInSec", "sourceOutSec", "startSec", "gainDb", "fadeInSec", "fadeOutSec", "tempo", "playbackRate", "crossfadeSec"]) {
      if (layer[key] != null) finite(layer[key], `${label}.${key}`, { min: key === "gainDb" ? -120 : 0 });
    }
    if (layer.sourceInSec == null) layer.sourceInSec = 0;
    if (layer.startSec == null) layer.startSec = 0;
    if (layer.gainDb == null) layer.gainDb = 0;
    if (layer.fadeInSec == null) layer.fadeInSec = 0;
    if (layer.fadeOutSec == null) layer.fadeOutSec = 0;
    if (layer.repeatCount == null) layer.repeatCount = 1;
    integer(layer.repeatCount, `${label}.repeatCount`, { min: 1, max: 16 });
    if (layer.tempo != null && layer.playbackRate != null) fail(`${label} cannot set both tempo and playbackRate`);
    if (layer.tempo != null) finite(layer.tempo, `${label}.tempo`, { min: 0.25, max: 4 });
    if (layer.playbackRate != null) finite(layer.playbackRate, `${label}.playbackRate`, { min: 0.25, max: 4 });
    if (layer.crossfadeSec == null) layer.crossfadeSec = 0;
    if (layer.repeatCount === 1 && layer.crossfadeSec !== 0) fail(`${label}.crossfadeSec requires repeatCount greater than 1`);
    if (!Array.isArray(layer.hitPointsSec || [])) fail(`${label}.hitPointsSec must be an array`);
    for (const [hitIndex, hit] of (layer.hitPointsSec || []).entries()) finite(hit, `${label}.hitPointsSec[${hitIndex}]`, { min: 0 });
  }
  if (spec.notes != null && typeof spec.notes !== "string") fail("spec.notes must be a string when present");
}

function calculateLayer(layer, info) {
  const sourceInSec = layer.sourceInSec;
  const sourceOutSec = layer.sourceOutSec == null ? info.durationSec : layer.sourceOutSec;
  if (sourceOutSec <= sourceInSec || sourceOutSec > info.durationSec + 1e-8) fail(`layer ${layer.id} source range is invalid`);
  const requestedFactor = layer.tempo == null ? (layer.playbackRate == null ? 1 : layer.playbackRate) : layer.tempo;
  const factor = layer.playbackRate == null ? requestedFactor : Math.round(48000 * requestedFactor) / 48000;
  const mode = layer.tempo != null ? "tempo-preserving-pitch" : layer.playbackRate != null ? "playback-rate-changes-pitch" : "unchanged";
  const trimmedDurationSec = sourceOutSec - sourceInSec;
  const segmentDurationSec = trimmedDurationSec / factor;
  if (layer.crossfadeSec >= segmentDurationSec && layer.repeatCount > 1) fail(`layer ${layer.id} crossfadeSec must be shorter than each transformed source segment`);
  const durationSec = segmentDurationSec * layer.repeatCount - layer.crossfadeSec * (layer.repeatCount - 1);
  if (durationSec <= 0) fail(`layer ${layer.id} has no duration after looping/crossfade`);
  if (layer.fadeInSec > durationSec || layer.fadeOutSec > durationSec) fail(`layer ${layer.id} fade duration exceeds its derived source duration`);
  const startSample = Math.round(layer.startSec * 48000);
  const hitPoints = [];
  for (const sourceSec of layer.hitPointsSec || []) {
    if (sourceSec < sourceInSec || sourceSec >= sourceOutSec) fail(`layer ${layer.id} hit point ${sourceSec} is outside the selected source range`);
    for (let repeatIndex = 0; repeatIndex < layer.repeatCount; repeatIndex += 1) {
      const localSec = (sourceSec - sourceInSec) / factor + repeatIndex * (segmentDurationSec - layer.crossfadeSec);
      hitPoints.push({ sourceSec, repeatIndex, localSec, layerOutputSec: startSample / 48000 + localSec });
    }
  }
  return {
    sourceInSec, sourceOutSec, factor, requestedFactor, mode, trimmedDurationSec,
    segmentDurationSec, durationSec, startSample, hitPoints,
  };
}

function buildFilterGraph(spec, layerInfos) {
  const filters = [];
  const labels = [];
  const outputLayers = [];
  const inputFiles = [];
  const expectedDurationSec = Math.max(...layerInfos.map(({ calc }) => calc.startSample / 48000 + calc.durationSec));
  for (const [index, item] of layerInfos.entries()) {
    const { layer, info, file, calc } = item;
    inputFiles.push(file);
    const input = `[${index}:a:0]`;
    const base = `base${index}`;
    const sourceFilters = [
      `atrim=start=${fmt(calc.sourceInSec)}:end=${fmt(calc.sourceOutSec)}`,
      "asetpts=PTS-STARTPTS",
      "aresample=48000",
      "aformat=sample_fmts=fltp:channel_layouts=stereo",
    ];
    if (layer.tempo != null) sourceFilters.push(...tempoFilters(layer.tempo));
    if (layer.playbackRate != null) {
      const changedRate = Math.round(48000 * layer.playbackRate);
      sourceFilters.push(`asetrate=${changedRate}`, "aresample=48000");
    }
    filters.push(`${input}${sourceFilters.join(",")}[${base}]`);
    let repeated = base;
    if (layer.repeatCount > 1) {
      const segmentLabels = Array.from({ length: layer.repeatCount }, (_, repeatIndex) => `rep${index}_${repeatIndex}`);
      filters.push(`[${base}]asplit=${layer.repeatCount}${segmentLabels.map((label) => `[${label}]`).join("")}`);
      if (layer.crossfadeSec > 0) {
        let current = segmentLabels[0];
        for (let repeatIndex = 1; repeatIndex < segmentLabels.length; repeatIndex += 1) {
          const next = `cross${index}_${repeatIndex}`;
          filters.push(`[${current}][${segmentLabels[repeatIndex]}]acrossfade=d=${fmt(layer.crossfadeSec)}:c1=tri:c2=tri[${next}]`);
          current = next;
        }
        repeated = current;
      } else {
        const joined = `joined${index}`;
        filters.push(`${segmentLabels.map((label) => `[${label}]`).join("")}concat=n=${segmentLabels.length}:v=0:a=1[${joined}]`);
        repeated = joined;
      }
    }
    const layerFilters = [];
    if (layer.fadeInSec > 0) layerFilters.push(`afade=t=in:st=0:d=${fmt(layer.fadeInSec)}`);
    if (layer.fadeOutSec > 0) layerFilters.push(`afade=t=out:st=${fmt(Math.max(0, calc.durationSec - layer.fadeOutSec))}:d=${fmt(layer.fadeOutSec)}`);
    if (layer.gainDb !== 0) layerFilters.push(`volume=${fmt(10 ** (layer.gainDb / 20))}`);
    layerFilters.push(`adelay=delays=${calc.startSample}S|${calc.startSample}S`);
    layerFilters.push(`apad=whole_dur=${fmt(expectedDurationSec)}`);
    const label = `layer${index}`;
    filters.push(`[${repeated}]${layerFilters.join(",")}[${label}]`);
    labels.push(label);
    outputLayers.push({ id: layer.id, sourceFile: layer.file, sourceInfo: info, ...calc });
  }
  const mix = labels.map((label) => `[${label}]`).join("");
  if (labels.length === 1) filters.push(`${mix}anull[mix]`);
  else filters.push(`${mix}amix=inputs=${labels.length}:duration=longest:normalize=0[mix]`);
  filters.push(`[mix]aformat=sample_fmts=flt:sample_rates=48000:channel_layouts=stereo[audio]`);
  return { filter: filters.join(";"), inputFiles, expectedDurationSec, outputLayers };
}

function run(command, argv, env, label) {
  const result = spawnSync(command, argv, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, env });
  if (result.error) fail(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed (exit ${result.status})\n${result.stdout || ""}\n${result.stderr || ""}`);
}

async function exists(file) { try { await fs.access(file); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function sameFile(left, right) {
  if (path.resolve(left) === path.resolve(right)) return true;
  try {
    const [a, b] = await Promise.all([fs.stat(left), fs.stat(right)]);
    return a.dev === b.dev && a.ino === b.ino;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}

export async function editSourceWav({ specFile, outputFile, receiptFile, tmpDir, ffmpeg = process.env.MOTION_FFMPEG || "ffmpeg", overwrite = false }) {
  if (![specFile, outputFile, receiptFile, tmpDir].every((value) => typeof value === "string" && value)) {
    fail("specFile, outputFile, receiptFile, and tmpDir are required");
  }
  const specPath = path.resolve(specFile);
  const outputPath = path.resolve(outputFile);
  const receiptPath = path.resolve(receiptFile);
  const tempPath = path.resolve(tmpDir);
  if (outputPath === receiptPath) fail("outputFile and receiptFile must be different paths");
  if (outputPath === specPath || receiptPath === specPath) fail("output or receipt path collides with the source spec");
  const specBytes = await fs.readFile(specPath);
  const spec = JSON.parse(specBytes.toString("utf8"));
  validateSpec(spec);
  for (const candidate of [outputPath, receiptPath]) {
    if (await sameFile(candidate, specPath)) fail("output or receipt path collides with the source spec");
  }
  if (path.extname(outputPath).toLowerCase() !== ".wav") fail("outputFile must use the .wav extension");
  const specDir = path.dirname(specPath);
  const layerInfos = [];
  for (const layer of spec.layers) {
    const file = path.resolve(specDir, layer.file);
    if (await sameFile(file, specPath) || await sameFile(file, outputPath) || await sameFile(file, receiptPath)) fail(`layer ${layer.id} source collides with a plan or output path`);
    const [info, sourceSha256] = await Promise.all([readWavInfo(file), hashFile(file)]);
    if (layer.sourceAssetReceipt) {
      const lineageReceiptPath = path.resolve(specDir, layer.sourceAssetReceipt);
      if (await sameFile(lineageReceiptPath, file) || await sameFile(lineageReceiptPath, specPath)
          || await sameFile(lineageReceiptPath, outputPath) || await sameFile(lineageReceiptPath, receiptPath)) {
        fail(`layer ${layer.id}.sourceAssetReceipt collides with a source, spec, output, or edit receipt`);
      }
      const lineageReceiptBytes = await fs.readFile(lineageReceiptPath);
      let lineageReceipt;
      try { lineageReceipt = JSON.parse(lineageReceiptBytes.toString("utf8")); }
      catch { fail(`layer ${layer.id}.sourceAssetReceipt is not valid JSON`); }
      layer.sourceAsset = indexedSourceAssetFromReceipt(lineageReceipt, lineageReceiptBytes);
      if (lineageReceipt.decoded.sha256.toLowerCase() !== sourceSha256.toLowerCase()) {
        fail(`layer ${layer.id}.sourceAssetReceipt decoded hash does not match the actual source WAV`);
      }
    }
    if (layer.sourceAsset && layer.sourceAsset.sha256.toLowerCase() !== sourceSha256.toLowerCase()) {
      fail(`layer ${layer.id}.sourceAsset.sha256 does not match the actual source WAV`);
    }
    const calc = calculateLayer(layer, info);
    layerInfos.push({ layer, info, file, sourceSha256, calc });
  }
  for (const candidate of [outputPath, receiptPath]) {
    if (!overwrite && await exists(candidate)) fail(`refusing to overwrite existing output without --overwrite: ${candidate}`);
  }
  if (await sameFile(outputPath, receiptPath)) fail("outputFile and receiptFile resolve to the same file");
  const graph = buildFilterGraph(spec, layerInfos);
  await fs.mkdir(tempPath, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(receiptPath), { recursive: true });
  const runDir = await fs.mkdtemp(path.join(tempPath, "audio-edit-"));
  const workWav = path.join(runDir, "derived.wav");
  const outputStage = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${process.pid}.partial`);
  const receiptStage = path.join(path.dirname(receiptPath), `.${path.basename(receiptPath)}.${process.pid}.partial`);
  const env = { ...process.env, TMPDIR: runDir, TMP: runDir, TEMP: runDir };
  try {
    const argv = ["-hide_banner", "-loglevel", "error", "-y"];
    for (const file of graph.inputFiles) argv.push("-i", file);
    argv.push("-filter_complex", graph.filter, "-map", "[audio]", "-t", fmt(graph.expectedDurationSec), "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", workWav);
    run(ffmpeg, argv, env, "FFmpeg source edit");
    const outputInfo = await readWavInfo(workWav);
    if (outputInfo.format !== "float-pcm" || outputInfo.sampleRate !== 48000 || outputInfo.channels !== 2 || outputInfo.bitsPerSample !== 32) {
      fail("FFmpeg output did not match float PCM32 48000 Hz stereo WAV");
    }
    if (Math.abs(outputInfo.durationSec - graph.expectedDurationSec) > 2 / outputInfo.sampleRate) {
      fail(`derived WAV duration ${outputInfo.durationSec} does not match planned ${graph.expectedDurationSec}`);
    }
    const metrics = await measureWav(workWav, outputInfo);
    const outputSha256 = await hashFile(workWav);
    const receipt = {
      format: "laohu.audio-edit-receipt/1",
      specSha256: sha256(specBytes),
      output: {
        file: path.basename(outputPath), sha256: outputSha256,
        durationSec: outputInfo.durationSec, sampleRate: outputInfo.sampleRate,
        channels: outputInfo.channels, bitsPerSample: outputInfo.bitsPerSample,
        peakAbsolute: metrics.peakAbsolute, samplesAboveFullScale: metrics.samplesAboveFullScale,
        peakMeasure: "Sample peak in float PCM; values above 1.0 are retained without normalization or limiting.",
      },
      sourceLineage: {
        format: "laohu.audio-source-lineage/1",
        operation: "audio-edit",
        status: layerInfos.every((row) => row.layer.sourceAsset?.sourceAssetReceiptSha256)
          ? "indexed-decode-receipt-and-hash-matched"
          : layerInfos.every((row) => row.layer.sourceAsset) ? "declared-and-hash-matched" : "incomplete-source-declarations",
        parents: layerInfos.map(({ layer, sourceSha256 }) => layer.sourceAsset
          ? { ...layer.sourceAsset, sha256: sourceSha256 }
          : { assetId: null, sha256: sourceSha256, generationMode: "unknown-source", redistributionStatus: "unknown" }),
        boundary: "Declared asset identity and lineage are bound to source WAV hashes; audio-edit cannot independently verify source license or human authorization claims.",
      },
      layers: graph.outputLayers.map((item, index) => ({
        id: item.id,
        source: {
          file: layerInfos[index].layer.file,
          sha256: layerInfos[index].sourceSha256,
          durationSec: item.sourceInfo.durationSec,
          format: item.sourceInfo.format,
          sampleRate: item.sourceInfo.sampleRate,
          channels: item.sourceInfo.channels,
        },
        sourceAsset: layerInfos[index].layer.sourceAsset || null,
        edit: {
          sourceInSec: item.sourceInSec,
          sourceOutSec: item.sourceOutSec,
          timeChange: item.mode,
          factor: item.factor,
          requestedFactor: item.requestedFactor,
          hitPointMapping: "Geometric source-time mapping by effective time-change factor; not an audio transient detector or measured audible peak.",
          repeatCount: layerInfos[index].layer.repeatCount,
          crossfadeSec: layerInfos[index].layer.crossfadeSec,
          fadeInSec: layerInfos[index].layer.fadeInSec,
          fadeOutSec: layerInfos[index].layer.fadeOutSec,
          gainDb: layerInfos[index].layer.gainDb,
          startSec: item.startSample / 48000,
          derivedDurationSec: item.durationSec,
        },
        hitPoints: item.hitPoints.map((hit) => ({
          sourceSec: hit.sourceSec,
          repeatIndex: hit.repeatIndex,
          derivedLocalSec: hit.localSec,
          derivedFileSec: hit.layerOutputSec,
          sample: Math.round(hit.layerOutputSec * 48000),
        })),
      })),
      processing: {
        renderer: "FFmpeg",
        sourceEditorOnly: true,
        noFilmTimelineOrBusMix: true,
        playbackRateChangesPitch: true,
        tempoPreservesPitch: true,
        summing: "Float PCM; no normalization, limiting, or clipping guard is applied. Inspect peakAbsolute and samplesAboveFullScale and audition the derived source.",
      },
      reviewStatus: "candidate-unreviewed",
      reviewBoundary: "Hash, metadata, edit parameters, and hit-point mapping are technical evidence only. The derived source must be listened to in context before it is marked reviewed or ready.",
    };
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await fs.copyFile(workWav, outputStage);
    await fs.writeFile(receiptStage, receiptBytes, { flag: "wx" });
    if (overwrite) {
      await fs.rename(outputStage, outputPath);
      await fs.rename(receiptStage, receiptPath);
    } else {
      let committedOutput = false;
      try {
        await fs.link(outputStage, outputPath);
        committedOutput = true;
        await fs.link(receiptStage, receiptPath);
      } catch (error) {
        if (committedOutput) await fs.rm(outputPath, { force: true });
        throw error;
      }
      await fs.rm(outputStage, { force: true });
      await fs.rm(receiptStage, { force: true });
    }
    return { output: outputPath, receiptFile: receiptPath, durationSec: outputInfo.durationSec, outputSha256, receipt };
  } finally {
    await fs.rm(runDir, { recursive: true, force: true });
    await fs.rm(outputStage, { force: true });
    await fs.rm(receiptStage, { force: true });
  }
}

function parseArgs(argv) {
  const values = new Set(["--spec", "--output", "--receipt", "--tmp-dir", "--ffmpeg"]);
  const options = { overwrite: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--overwrite") { options.overwrite = true; continue; }
    if (!values.has(key)) fail(`unknown argument ${key}`);
    if (!argv[index + 1] || argv[index + 1].startsWith("--")) fail(`missing value for ${key}`);
    const optionName = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const argumentNames = { spec: "specFile", output: "outputFile", receipt: "receiptFile", tmpDir: "tmpDir", ffmpeg: "ffmpeg" };
    options[argumentNames[optionName]] = argv[++index];
  }
  return options;
}

function parseDecodeArgs(argv) {
  const values = new Set(["--asset-index", "--asset-id", "--output", "--receipt", "--tmp-dir", "--work-root", "--ffmpeg", "--ffprobe"]);
  const options = { overwrite: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--overwrite") { options.overwrite = true; continue; }
    if (!values.has(key)) fail(`unknown decode argument ${key}`);
    if (!argv[index + 1] || argv[index + 1].startsWith("--")) fail(`missing value for ${key}`);
    const optionName = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const argumentNames = { assetIndex: "assetIndexFile", assetId: "assetId", output: "outputFile", receipt: "receiptFile", tmpDir: "tmpDir", workRoot: "workRoot", ffmpeg: "ffmpeg", ffprobe: "ffprobe" };
    options[argumentNames[optionName]] = argv[++index];
  }
  return options;
}

function usage() {
  return [
    "Usage: node scripts/audio-edit.mjs --spec /project/source-edit.json --output /project/derived.wav --receipt /project/derived.receipt.json --tmp-dir /project/.cache/tmp/audio-edit [--ffmpeg /path/to/ffmpeg] [--overwrite]",
    "The spec contains 1–8 local source WAV layers, relative trims, fades, optional tempo OR pitch-changing playbackRate, technical repeats/crossfades, and source hit points.",
    "Usage: node scripts/audio-edit.mjs decode-indexed-source --asset-index /project/.agents/skills/laohu-motion/assets/audio/index.json --asset-id indexed.asset-id --output /project/.cache/validation/decoded.wav --receipt /project/.cache/validation/decoded.receipt.json --tmp-dir /project/.cache/tmp/audio-edit [--work-root /project] [--ffmpeg /path/to/ffmpeg] [--ffprobe /path/to/ffprobe] [--overwrite]",
    "The decode receipt binds an indexed compressed source file and its hash to the decoded WAV hash; reference it as sourceAssetReceipt in an audio-edit layer.",
  ].join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) { process.stdout.write(usage() + "\n"); return; }
  if (argv[0] === "decode-indexed-source") {
    const result = await decodeIndexedAsset(parseDecodeArgs(argv.slice(1)));
    process.stdout.write(`WAV ${result.output}\nRECEIPT ${result.receiptFile}\nSHA256 ${result.outputSha256}\nSOURCE_ASSET ${result.receipt.sourceAsset.id}\nREVIEW_STATUS ${result.receipt.reviewStatus}\n`);
    return;
  }
  const result = await editSourceWav(parseArgs(argv));
  process.stdout.write(`WAV ${result.output}\nRECEIPT ${result.receiptFile}\nDURATION_SEC ${result.durationSec}\nSHA256 ${result.outputSha256}\nREVIEW_STATUS candidate-unreviewed\n`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n${usage()}\n`); process.exitCode = 1; });
}

export { buildFilterGraph, calculateLayer, parseArgs, parseDecodeArgs, readWavInfo, validateSpec };
