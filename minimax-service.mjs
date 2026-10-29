import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { minimaxHttpsFetch } from './minimax-transport.mjs';

// Official docs verified 2026-10-28:
// https://platform.minimax.cn/docs/api-reference/speech-t2a-http
// https://platform.minimax.io/docs/api-reference/speech-t2a-http
// https://platform.minimax.cn/docs/faq/system-voice-id
export const VOICE_MODELS = ['speech-2.8-hd', 'speech-2.8-turbo', 'speech-2.6-hd', 'speech-2.6-turbo'];
export const VOICES = [
  { id: 'Chinese (Mandarin)_Gentleman', name: '温润男声' },
  { id: 'Chinese (Mandarin)_Radio_Host', name: '电台男主播' },
  { id: 'Chinese (Mandarin)_News_Anchor', name: '新闻女声' },
  { id: 'Chinese (Mandarin)_Wise_Women', name: '阅历姐姐' },
];
const ENDPOINTS = { cn: 'https://api.minimax.cn/v1/t2a_v2', global: 'https://api.minimax.io/v1/t2a_v2' };
const ALLOWED_ORIGINS = new Set(['https://api.minimax.cn', 'https://api.minimaxi.com', 'https://api.minimax.io']);
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export class VoiceError extends Error {
  constructor(message, status = 400, code = 'VOICE_ERROR') { super(message); this.name = 'VoiceError'; this.status = status; this.code = code; }
}
export function normalizeApiBase(base) {
  let url;
  try { url = new URL(base); } catch { throw new VoiceError('MiniMax 接入地址无效，请使用官方地址。', 400, 'INVALID_BASE'); }
  if (!ALLOWED_ORIGINS.has(url.origin) || url.username || url.password || url.search || url.hash
      || !['/', '/v1', '/v1/', '/v1/t2a_v2'].includes(url.pathname)) throw new VoiceError('仅支持 MiniMax 中国或国际官方语音接口。', 400, 'INVALID_BASE');
  return { endpoint: `${url.origin}/v1/t2a_v2`, region: url.hostname === 'api.minimax.io' ? 'global' : 'cn' };
}
/** Read only the specifically configured dotenv file; no shell expansion. */
export async function readVoiceConfigFile(configPath) {
  if (typeof configPath !== 'string' || !path.isAbsolute(configPath)) throw new VoiceError('语音配置文件必须使用完整路径。', 400, 'INVALID_CONFIG_PATH');
  let content;
  try { const info = await stat(configPath); if (!info.isFile() || info.size > 1024 * 1024) throw new Error(); content = await readFile(configPath, 'utf8'); }
  catch { throw new VoiceError('无法读取指定的 MiniMax 配置文件。', 503, 'CONFIG_READ_FAILED'); }
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?(MINIMAX_API_KEY|MINIMAX_API_BASE|MINIMAX_MODEL|MINIMAX_VOICE_ID)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  if (!values.MINIMAX_API_KEY?.trim()) throw new VoiceError('指定文件中没有 MiniMax API 密钥。', 503, 'CONFIG_KEY_MISSING');
  return { apiKey: values.MINIMAX_API_KEY, apiBase: values.MINIMAX_API_BASE, model: values.MINIMAX_MODEL, voiceId: values.MINIMAX_VOICE_ID };
}
function validateModel(value) { if (!VOICE_MODELS.includes(value)) throw new VoiceError('请选择受支持的 MiniMax 语音模型。', 400, 'INVALID_MODEL'); return value; }
function validateVoice(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\x00-\x1f\x7f]/.test(value)) throw new VoiceError('音色标识无效。', 400, 'INVALID_VOICE');
  return value.trim();
}
function validateKey(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 16384 || /[\x00-\x20\x7f]/.test(value.trim())) throw new VoiceError('MiniMax API 密钥格式无效。', 400, 'INVALID_KEY');
  return value.trim();
}
function publicResult(hash, meta, cached) {
  return { audioUrl: `/audio/${hash}.mp3`, durationMs: meta.durationMs ?? null, characters: meta.characters,
    cached, provider: 'MiniMax', model: meta.model, voiceId: meta.voiceId };
}
function validateAudioHex(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length % 2 || value.length > MAX_AUDIO_BYTES * 2 || !/^[\da-f]+$/i.test(value)) throw new VoiceError('MiniMax 返回的音频不完整，请稍后重试。', 502, 'INVALID_AUDIO');
  const bytes = Buffer.from(value, 'hex');
  if (!(bytes.subarray(0, 3).equals(Buffer.from('ID3')) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) throw new VoiceError('MiniMax 返回的文件不是有效的 MP3 音频。', 502, 'INVALID_AUDIO');
  return bytes;
}
async function responseJson(response) {
  if (Number(response.headers?.get?.('content-length') || 0) > MAX_AUDIO_BYTES * 2 + 1024 * 1024) throw new VoiceError('返回的音频过大，请按章节生成。', 502, 'RESPONSE_TOO_LARGE');
  try {
    if (!response.body?.getReader) return await response.json();
    const reader = response.body.getReader(), chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > MAX_AUDIO_BYTES * 2 + 1024 * 1024) { await reader.cancel(); throw new VoiceError('返回的音频过大，请按章节生成。', 502, 'RESPONSE_TOO_LARGE'); }
      chunks.push(Buffer.from(value)); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { if (error instanceof VoiceError) throw error; throw new VoiceError('MiniMax 暂未返回可读取的结果，请稍后重试。', 502, 'INVALID_RESPONSE'); }
}
export function createVoiceService({ cacheDir, fetchImpl = minimaxHttpsFetch, initialConfig = {}, env = process.env, timeoutMs = 180000 } = {}) {
  if (!cacheDir) throw new TypeError('cacheDir is required');
  const resolvedCache = path.resolve(cacheDir);
  let config = { apiKey: '', region: 'cn', endpoint: ENDPOINTS.cn, model: 'speech-2.8-hd', voiceId: VOICES[0].id }, configError = null;
  const active = new Map(); let queue = Promise.resolve();
  function setConfig(update = {}) {
    if (!update || typeof update !== 'object' || Array.isArray(update)) throw new VoiceError('语音设置格式无效。');
    const next = { ...config };
    if (update.apiKey !== undefined && update.apiKey !== '') next.apiKey = validateKey(update.apiKey);
    if (update.region !== undefined) { if (!Object.hasOwn(ENDPOINTS, update.region)) throw new VoiceError('请选择中国站或国际站。', 400, 'INVALID_REGION'); next.region = update.region; next.endpoint = ENDPOINTS[update.region]; }
    if (update.apiBase) Object.assign(next, normalizeApiBase(update.apiBase));
    if (update.model !== undefined && update.model !== '') next.model = validateModel(update.model);
    if (update.voiceId !== undefined && update.voiceId !== '') next.voiceId = validateVoice(update.voiceId);
    config = next; configError = null; return status();
  }
  function status() { return { configured: Boolean(config.apiKey), provider: 'MiniMax', model: config.model, voiceId: config.voiceId,
    region: config.region, voices: VOICES.map(v => ({ ...v })), models: [...VOICE_MODELS], ...(configError ? { configurationError: configError } : {}) }; }
  try { setConfig({ apiKey: env.MINIMAX_API_KEY, apiBase: env.MINIMAX_API_BASE, model: env.MINIMAX_MODEL, voiceId: env.MINIMAX_VOICE_ID, ...initialConfig }); }
  catch (error) { configError = error instanceof VoiceError ? error.message : '语音配置无效，请重新设置。'; }
  async function cachedResult(hash, fallback) {
    try { const info = await stat(path.join(resolvedCache, `${hash}.mp3`)); if (!info.isFile() || info.size < 4) return null;
      let meta; try { meta = JSON.parse(await readFile(path.join(resolvedCache, `${hash}.json`), 'utf8')); } catch { meta = fallback; }
      return publicResult(hash, { ...fallback, durationMs: typeof meta.durationMs === 'number' ? meta.durationMs : null }, true);
    } catch { return null; }
  }
  async function generate(hash, settings, text) {
    const fallback = { durationMs: null, characters: [...text].length, model: settings.model, voiceId: settings.voiceId };
    const cache = await cachedResult(hash, fallback); if (cache) return cache;
    if (!settings.apiKey) throw new VoiceError('请先连接 MiniMax 语音，再播放这一章。', 503, 'MINIMAX_NOT_CONFIGURED');
    let response;
    try { response = await fetchImpl(settings.endpoint, { method: 'POST', redirect: 'error',
      headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: settings.model, text, stream: false, output_format: 'hex', language_boost: 'Chinese', text_normalization_mode: 'quality',
        voice_setting: { voice_id: settings.voiceId, speed: 0.95, vol: 1, pitch: 0 }, audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }, subtitle_enable: false }) });
    } catch (error) { throw new VoiceError(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? '本章语音生成超时，请稍后重试。' : '暂时无法连接 MiniMax，请检查网络后重试。', 502, 'MINIMAX_CONNECTION_FAILED'); }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new VoiceError('MiniMax 未接受这份接入配置，请检查密钥与站点是否匹配。', 502, 'MINIMAX_AUTH_FAILED');
      if (response.status === 429) throw new VoiceError('MiniMax 请求较多，请稍等片刻再播放。', 429, 'MINIMAX_RATE_LIMIT');
      throw new VoiceError('MiniMax 语音服务暂时不可用，请稍后重试。', 502, 'MINIMAX_HTTP_ERROR');
    }
    const result = await responseJson(response);
    if (result?.base_resp?.status_code !== 0) { const code = Number(result?.base_resp?.status_code);
      throw new VoiceError(`MiniMax 未能完成语音生成${Number.isInteger(code) ? `（状态 ${code}）` : ''}，请检查账户额度、音色和接入配置。`, 502, 'MINIMAX_REJECTED'); }
    if (result?.data?.status !== 2) throw new VoiceError('MiniMax 尚未返回完整音频，请稍后重试。', 502, 'INCOMPLETE_AUDIO');
    const audio = validateAudioHex(result.data.audio), duration = Number(result.extra_info?.audio_length);
    const meta = { ...fallback, durationMs: Number.isFinite(duration) && duration > 0 ? duration : null, generatedAt: new Date().toISOString(), provider: 'MiniMax' };
    try { await mkdir(resolvedCache, { recursive: true }); const temp = path.join(resolvedCache, `${hash}.${randomUUID()}.tmp`);
      await writeFile(temp, audio, { mode: 0o600 }); await rename(temp, path.join(resolvedCache, `${hash}.mp3`));
      // Saved audio remains usable even if metadata write fails; never regenerate solely for metadata.
      try { await writeFile(path.join(resolvedCache, `${hash}.json`), JSON.stringify(meta), { mode: 0o600 }); } catch {}
    } catch { throw new VoiceError('语音已生成，但无法保存到本地，请检查项目目录是否可写。', 500, 'CACHE_WRITE_FAILED'); }
    return publicResult(hash, meta, false);
  }
  function synthesize(input = {}) {
    try { if (!input || typeof input !== 'object' || Array.isArray(input)) throw new VoiceError('讲解内容格式无效。');
      if (typeof input.text !== 'string' || !input.text.trim() || [...input.text].length > 9000) throw new VoiceError('每段讲解需包含 1 至 9000 个字符。', 400, 'INVALID_TEXT');
      const text = input.text.trim(), settings = { ...config, model: validateModel(input.model || config.model), voiceId: validateVoice(input.voiceId || config.voiceId) };
      const hash = createHash('sha256').update(JSON.stringify({ version: 1, region: settings.region, model: settings.model, voiceId: settings.voiceId, speed: 0.95, text })).digest('hex');
      if (active.has(hash)) return active.get(hash);
      const task = queue.catch(() => {}).then(() => generate(hash, settings, text)); queue = task.catch(() => {}); active.set(hash, task);
      task.finally(() => active.delete(hash)).catch(() => {}); return task;
    } catch (error) { return Promise.reject(error); }
  }
  function audioPath(hash) { if (!/^[a-f\d]{64}$/.test(hash)) throw new VoiceError('音频文件不存在。', 404, 'AUDIO_NOT_FOUND'); return path.join(resolvedCache, `${hash}.mp3`); }
  return { status, setConfig, synthesize, audioPath };
}
export function parseByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) throw new VoiceError('音频范围无效。', 416, 'INVALID_RANGE');
  let start, end;
  if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new VoiceError('音频范围无效。', 416, 'INVALID_RANGE'); start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1; if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) throw new VoiceError('音频范围无效。', 416, 'INVALID_RANGE'); end = Math.min(end, size - 1); }
  return { start, end };
}
