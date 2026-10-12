/**
 * Clearwater Radio installer and update feed, served from the website so they keep working while the
 * GitHub repository is private. The token only needs read access to the repository's releases.
 *
 *   /radio/update                     release details for the download page (JSON)
 *   /radio/update/latest.yml          update metadata the desktop app checks
 *   /radio/update/<installer>.exe     redirect to a short-lived download link for the installer
 */
const DEFAULT_REPO = 'colin991/ClearwaterWebBot';
const INSTALLER = 'ClearwaterRadio-Setup.exe';
const SERVED_FILES = new Set([INSTALLER, 'latest.yml']);

function send(response, status, body, type = 'application/json; charset=utf-8', cache = 'no-store') {
  response.statusCode = status;
  response.setHeader('Content-Type', type);
  response.setHeader('Cache-Control', cache);
  return response.end(typeof body === 'string' ? body : JSON.stringify(body));
}

export function radioReleaseConfig(env = process.env) {
  return {
    repo: env.RADIO_RELEASE_REPO?.trim() || DEFAULT_REPO,
    token: env.RADIO_RELEASE_TOKEN?.trim() || env.GITHUB_TOKEN?.trim() || '',
  };
}

function requestedFile(request) {
  const fromQuery = request?.query?.file;
  if (typeof fromQuery === 'string') return fromQuery;
  try {
    return new URL(request.url || '/', 'http://localhost').searchParams.get('file') || '';
  } catch {
    return '';
  }
}

function githubHeaders(token, accept = 'application/vnd.github+json') {
  const headers = { Accept: accept, 'User-Agent': 'clearwater-radio-release', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Signed link GitHub hands out for a release asset; it needs no token and expires after a few minutes. */
async function assetLink(config, asset, fetchImpl) {
  const result = await fetchImpl(`https://api.github.com/repos/${config.repo}/releases/assets/${asset.id}`, {
    headers: githubHeaders(config.token, 'application/octet-stream'),
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  });
  const location = result.headers.get('location');
  if (result.status >= 300 && result.status < 400 && location) return location;
  throw new Error(`asset ${asset.name}: ${result.status}`);
}

export function createRadioReleaseHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handler(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return send(response, 405, { error: 'Method not allowed' });
    }
    const file = requestedFile(request);
    if (file && !SERVED_FILES.has(file)) return send(response, 404, { error: 'Not found' });

    const config = radioReleaseConfig(env);
    try {
      const latest = await fetchImpl(`https://api.github.com/repos/${config.repo}/releases/latest`, {
        headers: githubHeaders(config.token),
        signal: AbortSignal.timeout(8000),
      });
      if (!latest.ok) throw new Error(`latest release: ${latest.status}`);
      const release = await latest.json();
      const assets = release.assets || [];

      if (!file) {
        const installer = assets.find((asset) => asset.name === INSTALLER);
        if (!installer) throw new Error('no installer on the latest release');
        return send(response, 200, {
          version: String(release.tag_name || '').replace(/^radio-v/, ''),
          publishedAt: release.published_at || null,
          size: installer.size,
          sha256: String(installer.digest || '').replace(/^sha256:/, ''),
          url: `/radio/update/${INSTALLER}`,
        }, undefined, 's-maxage=60, stale-while-revalidate=300');
      }

      const asset = assets.find((item) => item.name === file);
      if (!asset) return send(response, 404, { error: 'Not found' });
      const link = await assetLink(config, asset, fetchImpl);
      if (file === INSTALLER) {
        response.statusCode = 302;
        response.setHeader('Location', link);
        response.setHeader('Cache-Control', 'no-store');
        return response.end();
      }
      const metadata = await fetchImpl(link, { signal: AbortSignal.timeout(8000) });
      if (!metadata.ok) throw new Error(`${file}: ${metadata.status}`);
      return send(response, 200, await metadata.text(), 'text/yaml; charset=utf-8', 's-maxage=60, stale-while-revalidate=300');
    } catch (error) {
      console.error('Radio release lookup failed:', error?.message || error);
      return send(response, 502, { error: config.token ? 'The radio download is unavailable right now.' : 'Radio downloads are not set up yet.' });
    }
  };
}

export default createRadioReleaseHandler();
