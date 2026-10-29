import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHttpsFetch } from '../minimax-transport.mjs';

function mockRequest({ status = 200, headers = {}, data = ['{"ok":true}'], delay = 0, never = false } = {}) {
  const observed = { calls: 0 };
  observed.impl = (url, options, callback) => {
    observed.calls++; observed.url = url; observed.options = options;
    const request = new EventEmitter();
    request.setTimeout = ms => { observed.timeout = ms; };
    request.destroy = () => { observed.destroyed = true; };
    request.end = body => {
      observed.body = body;
      if (never) return;
      setTimeout(() => {
        if (observed.destroyed) return;
        const response = new EventEmitter(); response.statusCode = status; response.headers = headers;
        response.destroy = () => { response.destroyed = true; };
        callback(response);
        for (const chunk of data) if (!response.destroyed) response.emit('data', Buffer.from(chunk));
        if (!response.destroyed) response.emit('end');
      }, delay);
    };
    return request;
  };
  return observed;
}
test('native transport preserves request and fetch-compatible response without a short connect timeout', async () => {
  const mock = mockRequest({ headers: { 'content-type': 'application/json' }, delay: 20 });
  const agent = { testAgent: true };
  const transport = createHttpsFetch({ requestImpl: mock.impl, agent });
  const response = await transport('https://api.minimax.cn/v1/t2a_v2', { method: 'POST', headers: { Authorization: 'Bearer private-test' }, body: '{"text":"你好"}', signal: AbortSignal.timeout(2000) });
  assert.equal(response.status, 200); assert.equal(response.ok, true); assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get('Content-Type'), 'application/json'); assert.equal(response.headers.get('missing'), null);
  assert.equal(mock.timeout, 0); assert.equal(mock.options.agent, agent); assert.equal(mock.options.headers.Authorization, 'Bearer private-test');
  assert.equal(mock.options.headers['Accept-Encoding'], 'identity'); assert.equal(mock.body, '{"text":"你好"}');
});
test('redirects are not followed and explicit error mode rejects them', async () => {
  const mock = mockRequest({ status: 302, headers: { location: 'https://untrusted.example' } });
  const transport = createHttpsFetch({ requestImpl: mock.impl });
  await assert.rejects(transport('https://api.minimax.cn', { redirect: 'error' }), /redirect/); assert.equal(mock.calls, 1);
  const manual = mockRequest({ status: 302, data: [] });
  const result = await createHttpsFetch({ requestImpl: manual.impl })('https://api.minimax.cn');
  assert.equal(result.status, 302); assert.equal(result.ok, false); assert.equal(manual.calls, 1);
});
test('overall abort covers an unresolved DNS or connection phase', async () => {
  const mock = mockRequest({ never: true }), controller = new AbortController();
  const pending = createHttpsFetch({ requestImpl: mock.impl })('https://api.minimax.cn', { signal: controller.signal });
  const reason = new Error('deadline'); reason.name = 'TimeoutError'; controller.abort(reason);
  await assert.rejects(pending, { name: 'TimeoutError' }); assert.equal(mock.destroyed, true);
});
test('response size is enforced for both content-length and streamed chunks', async () => {
  for (const options of [{ headers: { 'content-length': '101' } }, { data: ['123456', '789101'] }]) {
    const mock = mockRequest(options), transport = createHttpsFetch({ requestImpl: mock.impl, maxResponseBytes: 10 });
    await assert.rejects(transport('https://api.minimax.cn'), /size limit/);
  }
});
test('transport rejects insecure or credential-bearing URLs without connecting', async () => {
  const mock = mockRequest(), transport = createHttpsFetch({ requestImpl: mock.impl });
  await assert.rejects(transport('http://api.minimax.cn'), /HTTPS/);
  await assert.rejects(transport('https://user:password@api.minimax.cn'), /credentials/);
  assert.equal(mock.calls, 0);
});
