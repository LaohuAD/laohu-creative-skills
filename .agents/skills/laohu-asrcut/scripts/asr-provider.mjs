import {randomUUID} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import {extname, resolve} from 'node:path';
import {homedir} from 'node:os';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';

const DEFAULT_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash';
const DEFAULT_RESOURCE_ID = 'volc.bigasr.auc_turbo';
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_AUDIO_DURATION_SECONDS = 2 * 60 * 60;
const execFile = promisify(execFileCallback);

function parseEnvFile(text) {
  const values = {};
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

export async function loadVolcConfig({env = process.env, configPath = resolve(homedir(), '.config/laohu/volcengine-asr.env'), readFileImpl = readFile} = {}) {
  let fileValues = {};
  try { fileValues = parseEnvFile(await readFileImpl(configPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`Cannot read provider configuration file (${error.code ?? 'read-error'})`); }
  const merged = {...fileValues, ...env};
  const apiKey = merged.VOLCENGINE_SPEECH_API_KEY ?? '';
  const appKey = merged.VOLCENGINE_SPEECH_APP_ID ?? '';
  const accessKey = merged.VOLCENGINE_SPEECH_ACCESS_TOKEN ?? '';
  const legacyAuthReady = !apiKey && appKey.length > 0 && accessKey.length > 0;
  if (!apiKey && !legacyAuthReady) throw new Error('Provider credentials are unavailable; configure VOLCENGINE_SPEECH_API_KEY or both VOLCENGINE_SPEECH_APP_ID and VOLCENGINE_SPEECH_ACCESS_TOKEN in the local environment/config file.');
  return {
    apiKey,
    appId: appKey,
    accessToken: accessKey,
    authMode: apiKey ? 'api_key' : 'app_id_access_token',
    resourceId: merged.VOLCENGINE_SPEECH_RESOURCE_ID ?? 'volc.seedasr.auc',
    submitUrl: merged.VOLCENGINE_SPEECH_SUBMIT_URL ?? 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit',
    queryUrl: merged.VOLCENGINE_SPEECH_QUERY_URL ?? 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query',
    flashResourceId: merged.VOLCENGINE_SPEECH_FLASH_RESOURCE_ID ?? DEFAULT_RESOURCE_ID,
    flashUrl: merged.VOLCENGINE_SPEECH_FLASH_URL ?? DEFAULT_ENDPOINT,
    uid: 'laohu-asr',
  };
}

export async function probeAudioDuration(audioPath, {ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe', execFileImpl = execFile} = {}) {
  const absoluteAudioPath = resolve(audioPath);
  let result;
  try {
    result = await execFileImpl(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', absoluteAudioPath], {encoding: 'utf8', maxBuffer: 1024 * 1024});
  } catch (error) {
    throw new Error(`Could not verify local audio duration with ffprobe (${error?.code ?? error?.name ?? 'probe-error'}); no media was uploaded`);
  }
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw new Error('ffprobe returned invalid duration data; no media was uploaded'); }
  const durationSeconds = Number(parsed?.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('ffprobe did not provide a positive finite audio duration; no media was uploaded');
  return durationSeconds;
}

export async function transcribeVolcFlash({audioPath, config, fetchImpl = globalThis.fetch, requestId = randomUUID(), ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe', probeDurationImpl = probeAudioDuration} = {}) {
  if (!audioPath || !config) throw new Error('transcribeVolcFlash requires audioPath and an explicit loaded config');
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available');
  const absoluteAudioPath = resolve(audioPath);
  const info = await stat(absoluteAudioPath);
  if (!info.isFile()) throw new Error('ASR input must be a regular local audio file');
  if (info.size <= 0 || info.size > MAX_AUDIO_BYTES) throw new Error('ASR input must be non-empty and no larger than 100 MiB');
  const extension = extname(absoluteAudioPath).toLowerCase().replace(/^\./, '');
  if (!['wav', 'mp3', 'ogg', 'opus'].includes(extension)) throw new Error('Flash ASR input must be WAV, MP3, OGG, or OPUS');
  const durationSeconds = Number(await probeDurationImpl(absoluteAudioPath, {ffprobePath}));
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('A verified positive finite audio duration is required before upload');
  if (durationSeconds > MAX_AUDIO_DURATION_SECONDS) throw new Error('Flash ASR accepts audio up to 2 hours; this input exceeds the verified duration limit and was not uploaded');
  const audioBytes = await readFile(absoluteAudioPath);
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Resource-Id': config.flashResourceId ?? config.resourceId ?? DEFAULT_RESOURCE_ID,
    'X-Api-Request-Id': requestId,
    'X-Api-Sequence': '-1',
  };
  const useApiKey = config.authMode === 'api_key' || (!config.authMode && Boolean(config.apiKey));
  if (useApiKey && config.apiKey) headers['X-Api-Key'] = config.apiKey;
  else if (config.appId && config.accessToken) {
    headers['X-Api-App-Key'] = config.appId;
    headers['X-Api-Access-Key'] = config.accessToken;
  } else throw new Error('Provider configuration does not contain one complete supported authentication mode');
  const body = {
    user: {uid: 'laohu-asr'},
    audio: {data: audioBytes.toString('base64'), format: extension === 'opus' ? 'ogg' : extension},
    request: {model_name: 'bigmodel', enable_itn: false, enable_punc: true, enable_ddc: false, show_utterances: true},
  };
  let response;
  try { response = await fetchImpl(config.flashUrl ?? config.endpoint ?? DEFAULT_ENDPOINT, {method: 'POST', headers, body: JSON.stringify(body)}); }
  catch (error) { throw new Error(`ASR provider request failed before receiving a response (${error?.name ?? 'network-error'})`); }
  const rawText = await response.text();
  let payload;
  try { payload = JSON.parse(rawText); }
  catch { throw new Error(`ASR provider returned invalid JSON (HTTP ${response.status})`); }
  const statusCode = response.headers?.get?.('X-Api-Status-Code') ?? null;
  const message = response.headers?.get?.('X-Api-Message') ?? null;
  if (!response.ok || (statusCode !== null && statusCode !== '20000000')) {
    const logId = response.headers?.get?.('X-Tt-Logid') ?? null;
    const suffix = logId ? `; provider log id ${logId}` : '';
    throw new Error(`ASR provider rejected the request (HTTP ${response.status}${statusCode ? `, status ${statusCode}` : ''})${suffix}`);
  }
  const rawJson = rawText;
  return {payload, rawJson, requestId, statusCode, httpStatus: response.status, message, sourceDurationSeconds: durationSeconds, warnings: info.size > 20 * 1024 * 1024 ? ['File exceeds the recommended 20 MiB direct-upload size but is within the 100 MiB hard limit.'] : []};
}

export const providerLimits = Object.freeze({endpoint: DEFAULT_ENDPOINT, resourceId: DEFAULT_RESOURCE_ID, maxAudioBytes: MAX_AUDIO_BYTES, maxAudioDurationSeconds: MAX_AUDIO_DURATION_SECONDS, supportedFormats: ['wav', 'mp3', 'ogg', 'opus']});
