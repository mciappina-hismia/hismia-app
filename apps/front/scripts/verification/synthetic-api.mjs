import { createServer } from 'node:http';
import { loopbackOrigin } from './scratch.mjs';

export const syntheticIdentity = Object.freeze({
  subject: 'synthetic-account',
  token: 'synthetic-bearer',
  email: 'synthetic@example.test',
  timestamp: '2026-01-01T00:00:00Z',
});

/** Inject the shared schema from scratch-built validation, never original dist.
 * One synthetic account, create-only persistence; no clinical/backend authorization claim.
 */
export async function startSyntheticApi({
  accountProfileSchema,
  asOf = '2026-01-01',
  port = 0,
} = {}) {
  if (typeof accountProfileSchema !== 'function' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf))
    throw new Error('Shared profile schema required');
  if (!Number.isInteger(port) || (port !== 0 && (port < 1024 || port > 65535)))
    throw new Error('Invalid synthetic port');
  const schema = accountProfileSchema(asOf);
  if (typeof schema?.safeParse !== 'function') throw new Error('Shared profile schema required');
  let profile = null;
  let closed;
  const counters = { requests: 0, routes: {}, statuses: {} };
  const sockets = new Set();
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    const route = ['/auth/me', '/profiles/onboarding'].includes(request.url)
      ? request.url
      : 'other';
    counters.requests++;
    counters.routes[route] = (counters.routes[route] ?? 0) + 1;
    function send(status, body) {
      counters.statuses[status] = (counters.statuses[status] ?? 0) + 1;
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify(body));
    }
    if (route === 'other') {
      request.resume();
      send(404, { code: 'not_found' });
      return;
    }
    const method = route === '/auth/me' ? 'GET' : 'POST';
    if (request.method !== method) {
      request.resume();
      send(405, { code: 'method_not_allowed' });
      return;
    }
    if (request.headers.authorization !== `Bearer ${syntheticIdentity.token}`) {
      request.resume();
      send(401, { code: 'unauthenticated' });
      return;
    }
    if (method === 'POST' && request.headers['content-type'] !== 'application/json') {
      request.resume();
      send(415, { code: 'unsupported_media_type' });
      return;
    }
    const chunks = [];
    let bytes = 0;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= 8192) chunks.push(chunk);
    });
    request.on('error', () => {
      if (!response.writableEnded) send(400, { code: 'invalid_request' });
    });
    request.on('end', () => {
      if (bytes > 8192) {
        send(413, { code: 'request_too_large' });
        return;
      }
      if (method === 'GET') {
        if (bytes) {
          send(400, { code: 'invalid_request' });
          return;
        }
        send(200, {
          sub: syntheticIdentity.subject,
          email: syntheticIdentity.email,
          role: 'authenticated',
        });
        return;
      }
      let input;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        send(400, { code: 'validation' });
        return;
      }
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        send(400, { code: 'validation' });
        return;
      }
      if (profile && profile.accountType !== parsed.data.accountType) {
        send(409, { code: 'type_conflict' });
        return;
      }
      const existed = profile !== null;
      if (!profile)
        profile = {
          ...parsed.data,
          createdAt: syntheticIdentity.timestamp,
          updatedAt: syntheticIdentity.timestamp,
        };
      send(existed ? 200 : 201, profile);
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const origin = loopbackOrigin(`http://127.0.0.1:${server.address().port}`);
  return Object.freeze({
    origin,
    reset(initial = null) {
      if (initial === null) {
        profile = null;
        return;
      }
      const parsed = schema.safeParse(initial);
      if (!parsed.success) throw new Error('Invalid synthetic profile fixture');
      profile = {
        ...parsed.data,
        createdAt: syntheticIdentity.timestamp,
        updatedAt: syntheticIdentity.timestamp,
      };
    },
    report() {
      return structuredClone(counters);
    },
    close() {
      if (closed) return closed;
      closed = (async () => {
        const socketClosed = [...sockets].map(
          (socket) => new Promise((resolve) => socket.once('close', resolve)),
        );
        const serverClosed = new Promise((resolve, reject) => {
          server.close((error) =>
            error ? reject(new Error('Synthetic API close failed')) : resolve(),
          );
        });
        // These are exclusively sockets accepted by this owned fixture server.
        for (const socket of sockets) socket.destroy();
        await Promise.all([serverClosed, ...socketClosed]);
        return { quiescent: !server.listening && sockets.size === 0 };
      })();
      return closed;
    },
  });
}
