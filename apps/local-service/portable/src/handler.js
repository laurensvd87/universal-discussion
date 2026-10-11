import { randomUUID, timingSafeEqual } from 'node:crypto';

const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const validId = value => typeof value === 'string' && idPattern.test(value);
const commandKeys = {
  'create-root': ['sourceId', 'discussionId', 'body', 'expectedVersion'],
  reply: ['discussionId', 'sourceId', 'replyToId', 'body', 'expectedVersion'],
  edit: ['discussionId', 'contributionId', 'body', 'expectedVersion'],
  withdraw: ['discussionId', 'contributionId', 'expectedVersion'],
};
function fault(code, status = 400) { throw Object.assign(new Error(code), { code, status }); }
function exactKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) fault('invalid-request');
}
function equal(a, b) {
  const aa = Buffer.from(a ?? ''); const bb = Buffer.from(b ?? '');
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function pagination(params, allowed = []) {
  if ([...params.keys()].some(key => !['cursor', 'limit', ...allowed].includes(key)) || [...new Set(params.keys())].some(key => params.getAll(key).length !== 1)) fault('invalid-query');
  const limitText = params.get('limit') ?? '25';
  if (!/^[1-9]\d?$/.test(limitText) || Number(limitText) > 50) fault('invalid-query');
  const cursor = params.get('cursor');
  if (cursor !== null && !idPattern.test(cursor)) fault('invalid-query');
  return { cursor, limit: Number(limitText) };
}
async function bodyOf(request, ceiling) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length; if (size > ceiling) fault('body-too-large', 413);
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fault('invalid-json'); }
}

export function createPortableHandler({ repository, config, logger = () => {} }) {
  if (config.mode !== 'synthetic-rehearsal') throw new Error('portable-mode-required');
  return async function handler(request, response) {
    const requestId = randomUUID();
    const reply = (status, value, code = 'ok') => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-request-id': requestId });
      response.end(JSON.stringify(value));
      try { logger({ requestId, code }); } catch { /* Logging never changes authority. */ }
    };
    try {
      const headers = request.headers ?? {};
      const rawHeaders = request.rawHeaders ?? Object.entries(headers).flat();
      if (Buffer.byteLength(rawHeaders.join('\r\n')) > config.maxHeaderBytes) fault('headers-too-large', 431);
      const names = rawHeaders.filter((_, index) => index % 2 === 0).map(name => name.toLowerCase());
      if (['host', 'origin', 'authorization', 'content-type', 'content-length'].some(name => names.filter(item => item === name).length > 1)) fault('invalid-headers');
      if (headers.host !== config.allowedHost) fault('host-denied', 403);
      if (headers.origin !== undefined && headers.origin !== config.allowedOrigin) fault('origin-denied', 403);
      if (typeof request.url !== 'string' || request.url.length > 8192 || !request.url.startsWith('/') || request.url.startsWith('//') || /[\\#]/.test(request.url) || request.url.split('?')[0].includes('%')) fault('invalid-path');
      const rawPath = request.url.split('?')[0];
      const url = new URL(request.url, 'http://portable.invalid');
      if (url.pathname !== rawPath) fault('invalid-path');
      if (request.method === 'GET' && ['/health/live', '/health/ready'].includes(url.pathname)) {
        if (url.search) fault('invalid-query');
        const ready = url.pathname === '/health/live' || await repository.health();
        return reply(ready ? 200 : 503, { status: ready ? 'ok' : 'unavailable' }, ready ? 'ok' : 'unavailable');
      }
      if (!['GET', 'POST'].includes(request.method)) fault('method-denied', 405);
      const auth = headers.authorization;
      if (typeof auth !== 'string' || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(auth)) fault('unauthorized', 401);
      const token = auth.slice(7);
      const guest = equal(token, config.readToken);
      const principal = guest ? null : await repository.authenticate(token);
      if (!guest && !principal) fault('unauthorized', 401);
      if (request.method === 'GET') {
        if (headers['transfer-encoding'] || (headers['content-length'] && headers['content-length'] !== '0')) fault('invalid-request');
        if (url.pathname === '/portable/v1/topics') return reply(200, await repository.listTopics(pagination(url.searchParams)));
        if (url.pathname === '/portable/v1/sources') {
          const page = pagination(url.searchParams, ['topicId']); const topicId = url.searchParams.get('topicId');
          if (!topicId || !idPattern.test(topicId)) fault('invalid-query');
          return reply(200, await repository.listSources({ ...page, topicId }));
        }
        const discussion = /^\/portable\/v1\/discussions\/([a-zA-Z0-9_-]{1,128})$/.exec(url.pathname);
        if (discussion) return reply(200, await repository.readDiscussion({ discussionId: discussion[1], ...pagination(url.searchParams) }));
        if (url.pathname === '/portable/v1/source/resolve') {
          pagination(url.searchParams, ['url']);
          if (url.searchParams.has('cursor') || url.searchParams.has('limit')) fault('invalid-query');
          const sourceUrl = url.searchParams.get('url');
          if (!sourceUrl || sourceUrl.length > 2048) fault('invalid-query');
          return reply(200, await repository.resolveSource({ url: sourceUrl }));
        }
        if (url.pathname === '/portable/v1/related') {
          const params = new URLSearchParams(url.searchParams);
          if (!params.has('limit')) params.set('limit', '5');
          const page = pagination(params, ['sourceId']); const sourceId = params.get('sourceId');
          if (!sourceId || !validId(sourceId) || page.cursor !== null || page.limit > 20) fault('invalid-query');
          return reply(200, await repository.findRelated({ sourceId, limit: page.limit }));
        }
        fault('not-found', 404);
      }
      if (!principal) fault('write-denied', 403);
      if (headers.origin !== config.allowedOrigin) fault('origin-required', 403);
      if (url.search) fault('invalid-query');
      const match = /^\/portable\/v1\/commands\/(create-root|reply|edit|withdraw)$/.exec(url.pathname);
      if (!match) fault('not-found', 404);
      if (headers['content-type'] !== 'application/json') fault('content-type-denied', 415);
      if (headers['content-length'] !== undefined && (!/^\d+$/.test(headers['content-length']) || Number(headers['content-length']) > config.maxBodyBytes)) fault('body-too-large', 413);
      const body = await bodyOf(request, config.maxBodyBytes);
      exactKeys(body, ['requestId', 'payload']);
      if (!validId(body.requestId)) fault('invalid-request');
      const payload = body.payload; const kind = match[1]; exactKeys(payload, commandKeys[kind]);
      for (const key of commandKeys[kind]) {
        if (key === 'expectedVersion') { if (!Number.isSafeInteger(payload[key]) || payload[key] < 0) fault('invalid-request'); }
        else if (key === 'body') { if (typeof payload[key] !== 'string' || !payload[key].trim() || payload[key].length > 8000) fault('invalid-request'); }
        else if (!validId(payload[key])) fault('invalid-request');
      }
      return reply(200, await repository.command({ principal, requestId: body.requestId, kind, payload }));
    } catch (error) {
      const safe = { invalid:400, 'invalid-request':400, 'invalid-query':400, 'invalid-json':400, 'invalid-path':400, 'invalid-headers':400, 'headers-too-large':431, 'body-too-large':413, 'host-denied':403, 'origin-denied':403, 'origin-required':403, unauthorized:401, 'write-denied':403, 'method-denied':405, 'content-type-denied':415, 'not-found':404, forbidden:403, conflict:409, 'version-conflict':409, 'request-conflict':409 };
      const code = Object.hasOwn(safe, error.code) ? error.code : 'unavailable';
      reply(safe[code] ?? 503, { error: code, requestId }, code);
    }
  };
}
