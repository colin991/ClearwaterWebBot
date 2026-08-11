import { readMediaToken } from '../lib/privacy.js';

const MAX_BYTES = 2_000_000;

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405;
    return response.end();
  }

  const url = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
  const source = readMediaToken(url.searchParams.get('t') || '');
  if (!source) {
    response.statusCode = 404;
    return response.end();
  }

  try {
    const upstream = await fetch(source, {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'image/*' },
    });
    const contentType = String(upstream.headers.get('content-type') || '');
    const length = Number(upstream.headers.get('content-length') || 0);
    if (!upstream.ok || !contentType.startsWith('image/') || length > MAX_BYTES) {
      response.statusCode = 404;
      return response.end();
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_BYTES) {
      response.statusCode = 404;
      return response.end();
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(buffer);
  } catch {
    response.statusCode = 404;
    response.end();
  }
}
