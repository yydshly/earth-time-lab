import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createVoiceService, readVoiceConfigFile, parseByteRange, VoiceError } from './minimax-service.mjs';
import { createAppVersionService } from './app-version-service.mjs';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.join(projectDir, 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.geojson': 'application/geo+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
function json(res, status, data) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(data)); }
async function bodyJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new VoiceError('请求必须使用 JSON 格式。', 415, 'JSON_REQUIRED');
  let bytes = 0; const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 65536) throw new VoiceError('讲解或设置内容过长，请分章节生成。', 413, 'BODY_TOO_LARGE'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new VoiceError('请求内容不是有效的 JSON。', 400, 'INVALID_JSON'); }
}
export function isAllowedLocalRequest(req, port) {
  const host = req.headers.host;
  if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (req.headers.origin !== undefined && req.headers.origin !== `http://${host}`) return false;
  // Node fetch sends sec-fetch-mode but has no sec-fetch-site; same-origin browser
  // mutations must supply Origin, while origin-less local command-line clients work.
  if (req.method === 'POST' && !req.headers.origin && req.headers['sec-fetch-site']) return false;
  return true;
}
export function createAppServer({ root = defaultRoot, voiceService = createVoiceService({ cacheDir: path.join(projectDir, '.voice-cache') }), appVersionService } = {}) {
  const resolvedRoot = path.resolve(root);
  const versionService = appVersionService || createAppVersionService({ root: resolvedRoot });
  const server = http.createServer(async (req, res) => {
    try {
      if (!isAllowedLocalRequest(req, server.address()?.port)) { json(res, 403, { error: '仅允许从本机同刻页面访问。', code: 'LOCAL_ORIGIN_REQUIRED' }); return; }
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); res.setHeader('X-Content-Type-Options', 'nosniff');
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/health' && req.method === 'GET') { json(res, 200, { app: 'earth-time-lab', status: 'ok' }); return; }
      if (pathname === '/api/app-version' && req.method === 'GET') { json(res, 200, { app: 'earth-time-lab', version: await versionService.getVersion() }); return; }
      if (pathname === '/api/voice/status' && req.method === 'GET') { json(res, 200, voiceService.status()); return; }
      if (pathname === '/api/voice/config' && req.method === 'POST') { json(res, 200, voiceService.setConfig(await bodyJson(req))); return; }
      if (pathname === '/api/voice/synthesize' && req.method === 'POST') { json(res, 200, await voiceService.synthesize(await bodyJson(req))); return; }
      if (pathname.startsWith('/api/')) { json(res, 404, { error: '接口不存在。', code: 'NOT_FOUND' }); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, { error: '不支持此请求方法。', code: 'METHOD_NOT_ALLOWED' }); return; }
      const audioMatch = /^\/audio\/([a-f\d]{64})\.mp3$/.exec(pathname);
      if (audioMatch) {
        const file = voiceService.audioPath(audioMatch[1]); let info;
        try { info = await stat(file); if (!info.isFile()) throw new Error(); } catch { json(res, 404, { error: '本地音频不存在。', code: 'AUDIO_NOT_FOUND' }); return; }
        let range; try { range = parseByteRange(req.headers.range, info.size); } catch { res.writeHead(416, { 'content-range': `bytes */${info.size}` }); res.end(); return; }
        const headers = { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=31536000, immutable', 'content-length': range ? range.end - range.start + 1 : info.size };
        if (range) headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`;
        res.writeHead(range ? 206 : 200, headers); if (req.method === 'HEAD') { res.end(); return; }
        const stream = createReadStream(file, range || undefined); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res); return;
      }
      const file = path.resolve(resolvedRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (file !== resolvedRoot && !file.startsWith(resolvedRoot + path.sep)) { json(res, 403, { error: '此路径不可访问。', code: 'FORBIDDEN_PATH' }); return; }
      if (!(await stat(file)).isFile()) throw new Error('Not a file');
      const data = await readFile(file); res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (error instanceof VoiceError) json(res, error.status, { error: error.message, code: error.code });
      else json(res, 404, { error: '内容暂时不可用。', code: 'NOT_FOUND' });
    }
  });
  server.requestTimeout = 240000; server.headersTimeout = 15000; return server;
}
async function start() {
  const port = Number(process.env.PORT || 4318); let configPath = process.env.MINIMAX_CONFIG_PATH;
  if (!configPath) { try { configPath = JSON.parse(await readFile(path.join(projectDir, '.voice-settings.json'), 'utf8')).configPath; } catch {} }
  let initialConfig = {};
  if (configPath) { try { initialConfig = await readVoiceConfigFile(configPath); } catch (error) { console.error(error instanceof VoiceError ? error.message : 'MiniMax 配置文件读取失败。'); } }
  const voiceService = createVoiceService({ cacheDir: path.join(projectDir, '.voice-cache'), initialConfig });
  const server = createAppServer({ voiceService });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Open http://127.0.0.1:${port} if Time Atlas is already running, or set PORT to another port.` : 'Time Atlas could not start.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Time Atlas: http://127.0.0.1:${port}`));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await start();
