import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadioReleaseHandler } from '../lib/bot-api/radio-release.js';

const release = {
  tag_name: 'radio-v1.0.96',
  published_at: '2026-10-11T00:00:00Z',
  assets: [
    { id: 1, name: 'ClearwaterRadio-Setup.exe', size: 104857600, digest: 'sha256:abc' },
    { id: 2, name: 'latest.yml', size: 300 },
  ],
};

function fakeGithub(calls) {
  return async (url, options = {}) => {
    calls.push({ url: String(url), auth: options.headers?.Authorization });
    if (String(url).endsWith('/releases/latest')) return new Response(JSON.stringify(release), { status: 200 });
    const asset = String(url).match(/releases\/assets\/(\d+)$/);
    if (asset) return new Response(null, { status: 302, headers: { location: `https://objects.example/${asset[1]}?sig=x` } });
    if (String(url) === 'https://objects.example/2?sig=x') return new Response('version: 1.0.96\n', { status: 200 });
    return new Response('', { status: 404 });
  };
}

async function call(handler, file) {
  const response = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b = '') { this.body = b; } };
  await handler({ method: 'GET', url: file ? `/api/bot/radio-release?file=${file}` : '/api/bot/radio-release', query: file ? { file } : {} }, response);
  return response;
}

test('the website serves the latest radio release from the private repo with its token', async () => {
  const calls = [];
  const handler = createRadioReleaseHandler({ env: { RADIO_RELEASE_TOKEN: 'tok' }, fetchImpl: fakeGithub(calls) });

  const info = await call(handler, '');
  assert.equal(info.statusCode, 200);
  assert.deepEqual(JSON.parse(info.body), { version: '1.0.96', publishedAt: '2026-10-11T00:00:00Z', size: 104857600, sha256: 'abc', url: '/radio/update/ClearwaterRadio-Setup.exe' });

  const exe = await call(handler, 'ClearwaterRadio-Setup.exe');
  assert.equal(exe.statusCode, 302);
  assert.equal(exe.headers.location, 'https://objects.example/1?sig=x');

  const yml = await call(handler, 'latest.yml');
  assert.equal(yml.statusCode, 200);
  assert.equal(yml.body, 'version: 1.0.96\n');

  assert.ok(calls.filter((c) => c.url.startsWith('https://api.github.com')).every((c) => c.auth === 'Bearer tok'));
  assert.equal(calls.find((c) => c.url.startsWith('https://objects.example')).auth, undefined, 'the token never goes to the download host');
});

test('only the installer and update metadata can be fetched', async () => {
  const handler = createRadioReleaseHandler({ env: {}, fetchImpl: fakeGithub([]) });
  assert.equal((await call(handler, '../secrets')).statusCode, 404);
  assert.equal((await call(handler, 'ClearwaterRadio-Setup.exe.blockmap')).statusCode, 404);
});
