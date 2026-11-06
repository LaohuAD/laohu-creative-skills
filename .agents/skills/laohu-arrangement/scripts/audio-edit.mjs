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

async function hashFile(file) {
  const hash = createHash("sha256");
  const stream = (await import("node:fs")).createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
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
    const allowed = new Set(["id", "file", "sourceInSec", "sourceOutSec", "startSec", "gainDb", "fadeInSec", "fadeOutSec", "tempo", "playbackRate", "repeatCount", "crossfadeSec", "hitPointsSec"]);
    for (const key of Object.keys(layer)) if (!allowed.has(key)) fail(`${label}.${key} is not implemented by audio-edit/1`);
    layer.id = stableId(layer.id, `${label}.id`);
    if (ids.has(layer.id)) fail(`duplicate layer id: ${layer.id}`);
    ids.add(layer.id);
    if (typeof layer.file !== "string" || !layer.file.trim()) fail(`${label}.file is required`);
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
    if (Math.abs(outputInfo.durationSec - graph.expectedDurationSec) > 1 / outputInfo.sampleRate) {
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

function usage() {
  return [
    "Usage: node scripts/audio-edit.mjs --spec /project/source-edit.json --output /project/derived.wav --receipt /project/derived.receipt.json --tmp-dir /project/.cache/tmp/audio-edit [--ffmpeg /path/to/ffmpeg] [--overwrite]",
    "The spec contains 1–8 local source WAV layers, relative trims, fades, optional tempo OR pitch-changing playbackRate, technical repeats/crossfades, and source hit points.",
  ].join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) { process.stdout.write(usage() + "\n"); return; }
  const result = await editSourceWav(parseArgs(argv));
  process.stdout.write(`WAV ${result.output}\nRECEIPT ${result.receiptFile}\nDURATION_SEC ${result.durationSec}\nSHA256 ${result.outputSha256}\nREVIEW_STATUS candidate-unreviewed\n`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n${usage()}\n`); process.exitCode = 1; });
}

export { buildFilterGraph, calculateLayer, parseArgs, readWavInfo, validateSpec };
