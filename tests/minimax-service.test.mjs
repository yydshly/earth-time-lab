import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVoiceService, readVoiceConfigFile, normalizeApiBase, parseByteRange } from '../minimax-service.mjs';
import { createAppServer, isAllowedLocalRequest } from '../server.mjs';

const demoAudio = Buffer.from('ID3\x04\x00\x00mock-mp3-data-for-tests');
const response = (changes = {}) => ({ ok: true, status: 200, json: async () => ({ base_resp: { status_code: 0 }, data: { status: 2, audio: demoAudio.toString('hex') }, extra_info: { audio_length: 4321 }, ...changes }) });
async function temporary(t) {
  const prefix = path.join(tmpdir(), 'time-atlas-voice-test-');
  const dir = await mkdtemp(prefix);
  t.after(async () => { const resolved = path.resolve(dir); if (!resolved.startsWith(path.resolve(prefix))) throw new Error('Unsafe test cleanup path'); await rm(resolved, { recursive: true, force: true }); });
  return dir;
}
async function instance(t, options = {}) { return createVoiceService({ cacheDir: await temporary(t), env: {}, ...options }); }
test('voice status never returns credentials and validates official endpoints', async t => {
  const service = await instance(t, { initialConfig: { apiKey: 'sample-secret-token', apiBase: 'https://api.minimaxi.com/v1/' } });
  assert.equal(service.status().configured, true);
  assert.equal(service.status().region, 'cn');
  assert.equal(JSON.stringify(service.status()).includes('sample-secret-token'), false);
  assert.equal(normalizeApiBase('https://api.minimax.io').region, 'global');
  for (const address of ['https://evil.example/v1', 'http://api.minimax.cn', 'https://api.minimax.cn@evil.example', 'https://api.minimax.cn/v1/other']) assert.throws(() => normalizeApiBase(address), /官方/);
  assert.throws(() => service.setConfig({ model: 'unknown', apiKey: 'replacement' }), /模型/);
  assert.equal(service.status().model, 'speech-2.8-hd');
});
test('missing credentials and invalid text fail before contacting MiniMax', async t => {
  let calls = 0;
  const service = await instance(t, { fetchImpl: async () => { calls++; return response(); } });
  await assert.rejects(service.synthesize({ text: '你好' }), { code: 'MINIMAX_NOT_CONFIGURED' });
  await assert.rejects(service.synthesize({ text: ' ' }), { code: 'INVALID_TEXT' });
  await assert.rejects(service.synthesize({ text: '字'.repeat(9001) }), { code: 'INVALID_TEXT' });
  assert.equal(calls, 0);
});
test('synthesis deduplicates concurrent requests, caches audio and sends official settings', async t => {
  let calls = 0, submitted;
  const service = await instance(t, { initialConfig: { apiKey: 'test-key' }, fetchImpl: async (url, init) => {
    calls++; submitted = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
    return response();
  } });
  const input = { text: '地球在自转，每座城市的钟面不同。', chapterId: 'intro' };
  const [one, two] = await Promise.all([service.synthesize(input), service.synthesize(input)]);
  assert.deepEqual(one, two); assert.equal(calls, 1); assert.equal(one.cached, false);
  assert.equal(one.durationMs, 4321); assert.equal(one.characters, [...input.text].length);
  assert.equal(submitted.url, 'https://api.minimax.cn/v1/t2a_v2');
  assert.equal(submitted.body.voice_setting.voice_id, 'Chinese (Mandarin)_Gentleman');
  assert.equal(submitted.body.output_format, 'hex'); assert.equal(submitted.auth, 'Bearer test-key');
  const cached = await service.synthesize({ ...input, chapterId: 'same-text-different-id' });
  assert.equal(cached.cached, true); assert.equal(calls, 1); assert.equal(cached.audioUrl, one.audioUrl);
  await service.synthesize({ text: input.text, model: 'speech-2.8-turbo' }); assert.equal(calls, 2);
});
test('requests for distinct chapters run serially and failed requests do not poison queue', async t => {
  let active = 0, maximum = 0, count = 0;
  const service = await instance(t, { initialConfig: { apiKey: 'test' }, fetchImpl: async () => {
    active++; maximum = Math.max(maximum, active); count++;
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return count === 1 ? response({ base_resp: { status_code: 1008, status_msg: 'secret should stay private' } }) : response();
  } });
  const values = await Promise.allSettled([service.synthesize({ text: '第一章' }), service.synthesize({ text: '第二章' })]);
  assert.equal(values[0].status, 'rejected'); assert.equal(values[0].reason.message.includes('secret'), false);
  assert.equal(values[1].status, 'fulfilled'); assert.equal(maximum, 1);
});
test('malformed hex, wrong formats and incomplete upstream responses are rejected', async t => {
  for (const data of [{ status: 2, audio: 'not-hex' }, { status: 2, audio: '01020304' }, { status: 1, audio: demoAudio.toString('hex') }]) {
    const service = await instance(t, { initialConfig: { apiKey: 'test' }, fetchImpl: async () => response({ data }) });
    await assert.rejects(service.synthesize({ text: '测试内容' }), error => ['INVALID_AUDIO', 'INCOMPLETE_AUDIO'].includes(error.code));
  }
});
test('upstream transport and HTTP failures are sanitized', async t => {
  for (const fetchImpl of [async () => { throw new Error('test-key internal failure'); }, async () => ({ ok: false, status: 401 })]) {
    const service = await instance(t, { initialConfig: { apiKey: 'test-key' }, fetchImpl });
    await assert.rejects(service.synthesize({ text: '测试内容' }), error => !error.message.includes('test-key') && error.status === 502);
  }
});
test('only a designated dotenv file is parsed without executing its content', async t => {
  const dir = await temporary(t), file = path.join(dir, '.env.minimax');
  await writeFile(file, '# config\nMINIMAX_API_KEY="example-private-key"\nMINIMAX_API_BASE=https://api.minimax.cn/v1 # official\nUNRELATED_SECRET=ignored\n');
  const result = await readVoiceConfigFile(file);
  assert.equal(result.apiKey, 'example-private-key'); assert.equal(result.apiBase, 'https://api.minimax.cn/v1');
  assert.equal(Object.keys(result).includes('UNRELATED_SECRET'), false);
});
test('byte ranges cover ordinary, open-ended, suffix and invalid cases', () => {
  assert.deepEqual(parseByteRange('bytes=3-8', 20), { start: 3, end: 8 });
  assert.deepEqual(parseByteRange('bytes=3-', 20), { start: 3, end: 19 });
  assert.deepEqual(parseByteRange('bytes=-8', 20), { start: 12, end: 19 });
  assert.deepEqual(parseByteRange('bytes=3-999', 20), { start: 3, end: 19 });
  assert.equal(parseByteRange(undefined, 20), null);
  for (const value of ['bytes=20-', 'bytes=8-3', 'bytes=-0', 'bytes=0-1,4-5', 'bad']) assert.throws(() => parseByteRange(value, 20), { status: 416 });
});
test('Origin and Host checks block foreign sites but allow local CLI and same-origin browser', () => {
  const req = headers => ({ method: 'POST', headers });
  assert.equal(isAllowedLocalRequest(req({ host: '127.0.0.1:4318', origin: 'http://127.0.0.1:4318' }), 4318), true);
  assert.equal(isAllowedLocalRequest(req({ host: '127.0.0.1:4318', 'sec-fetch-mode': 'cors' }), 4318), true);
  assert.equal(isAllowedLocalRequest(req({ host: 'evil.example:4318' }), 4318), false);
  assert.equal(isAllowedLocalRequest(req({ host: '127.0.0.1:4318', origin: 'https://evil.example' }), 4318), false);
  assert.equal(isAllowedLocalRequest(req({ host: '127.0.0.1:4318', 'sec-fetch-site': 'same-origin' }), 4318), false);
});
test('HTTP synthesis, private status and Range playback work end to end with mock provider', async t => {
  const service = await instance(t, { initialConfig: { apiKey: 'private-test-key' }, fetchImpl: async () => response() });
  const server = createAppServer({ voiceService: service });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = await (await fetch(`${base}/api/voice/status`)).json();
  assert.equal(status.configured, true); assert.equal(JSON.stringify(status).includes('private-test-key'), false);
  const denied = await fetch(`${base}/api/voice/config`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://untrusted.example' }, body: JSON.stringify({ apiKey: 'evil' }) });
  assert.equal(denied.status, 403);
  const generated = await fetch(`${base}/api/voice/synthesize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '测试章节' }) });
  assert.equal(generated.status, 200); const info = await generated.json();
  const ranged = await fetch(`${base}${info.audioUrl}`, { headers: { Range: 'bytes=0-2' } });
  assert.equal(ranged.status, 206); assert.equal(ranged.headers.get('content-range'), `bytes 0-2/${demoAudio.length}`); assert.equal(await ranged.text(), 'ID3');
  const invalid = await fetch(`${base}${info.audioUrl}`, { headers: { Range: 'bytes=9999-' } }); assert.equal(invalid.status, 416);
  const head = await fetch(`${base}${info.audioUrl}`, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(demoAudio.length));
});
