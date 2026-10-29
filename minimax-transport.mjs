import https from 'node:https';

// Native HTTPS uses the operating system resolver and the full caller deadline.
// Unlike undici fetch, it does not impose a separate ten-second connect deadline.
// TLS certificate verification remains enabled; redirects are never followed.
const sharedAgent = new https.Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 2, timeout: 0 });
export const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;

function abortedError(signal) {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('HTTPS request was aborted'); error.name = 'AbortError'; return error;
}

/** Minimal fetch-compatible HTTPS transport needed by MiniMax's JSON API. */
export function createHttpsFetch({ requestImpl = https.request, agent = sharedAgent, maxResponseBytes = MAX_RESPONSE_BYTES } = {}) {
  return function httpsFetch(input, init = {}) {
    return new Promise((resolve, reject) => {
      let url;
      try { url = new URL(input); } catch { reject(new TypeError('Invalid HTTPS URL')); return; }
      if (url.protocol !== 'https:' || url.username || url.password) { reject(new TypeError('Only HTTPS URLs without embedded credentials are allowed')); return; }
      const signal = init.signal || AbortSignal.timeout(180000);
      if (signal.aborted) { reject(abortedError(signal)); return; }
      let request, incoming, settled = false;
      const chunks = []; let bytes = 0;
      function finish(error, result) {
        if (settled) return; settled = true; signal.removeEventListener('abort', abort);
        if (error) { request?.destroy(); incoming?.destroy(); reject(error); }
        else resolve(result);
      }
      function abort() { finish(abortedError(signal)); }
      signal.addEventListener('abort', abort, { once: true });
      try {
        request = requestImpl(url, { method: init.method || 'GET', headers: { 'Accept-Encoding': 'identity', ...init.headers }, agent }, response => {
          incoming = response;
          if (settled) { response.destroy(); return; }
          response.on('error', error => finish(error));
          response.on('aborted', () => finish(new Error('HTTPS response was interrupted')));
          const status = response.statusCode || 0;
          if (status >= 300 && status < 400 && init.redirect === 'error') { finish(new Error('HTTPS redirect was rejected')); return; }
          if (Number(response.headers['content-length'] || 0) > maxResponseBytes) { finish(new RangeError('HTTPS response exceeds the size limit')); return; }
          if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') { finish(new Error('Unexpected compressed HTTPS response')); return; }
          response.on('data', chunk => {
            if (settled) return;
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytes += buffer.length;
            if (bytes > maxResponseBytes) { finish(new RangeError('HTTPS response exceeds the size limit')); return; }
            chunks.push(buffer);
          });
          response.on('end', () => {
            if (settled) return;
            const body = Buffer.concat(chunks, bytes);
            const headers = { get(name) { const value = response.headers[String(name).toLowerCase()]; return value === undefined ? null : Array.isArray(value) ? value.join(', ') : String(value); } };
            finish(null, { ok: status >= 200 && status < 300, status, headers,
              json: async () => JSON.parse(body.toString('utf8')),
              text: async () => body.toString('utf8'),
              arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
            });
          });
        });
        request.on('error', error => finish(error));
        // Do not set a per-socket or per-connect deadline; signal covers DNS,
        // connection, TLS, request upload and full response download together.
        request.setTimeout?.(0);
        if (signal.aborted) { abort(); return; }
        request.end(init.body);
      } catch (error) { finish(error); }
    });
  };
}

export const minimaxHttpsFetch = createHttpsFetch();
export function closeMinimaxConnections() { sharedAgent.destroy(); }
