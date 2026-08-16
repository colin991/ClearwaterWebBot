/**
 * Normalize public logo / avatar https URLs for Clearwater Internet.
 * Converts common gallery page links into direct image CDN URLs.
 */

const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg)(?:$|\?)/i;

/** Hosts we allow for business / official logos (must stay in sync with CSP img-src). */
export const LOGO_IMAGE_HOST_RE = /^(?:(?:media\d*|cdn|images-ext-\d+)\.)?discord(?:app)?\.(?:com|net)$|^(?:.+\.)?blob\.vercel-storage\.com$|^(?:.+\.)?public\.blob\.vercel-storage\.com$|^i\.imgur\.com$|^iili\.io$|^(?:media\d*|i)\.giphy\.com$/i;

function freeimageDirectUrl(pathname) {
  const part = String(pathname || '').split('/').filter(Boolean).pop() || '';
  if (!part) return '';
  // /i/Csq13Ga or /i/add-a-subheading-19.Csq13Ga → Csq13Ga
  const id = (part.includes('.') ? part.split('.').pop() : part).replace(/[^a-zA-Z0-9]/g, '');
  return id ? `https://iili.io/${id}.png` : '';
}

function imgurDirectUrl(pathname) {
  const part = String(pathname || '').split('/').filter(Boolean).pop() || '';
  const id = part.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9]/g, '');
  return id ? `https://i.imgur.com/${id}.png` : '';
}

/**
 * @param {string} value
 * @returns {string} https image URL or ''
 */
export function normalizeLogoImageUrl(value) {
  const raw = String(value || '').trim().slice(0, 500);
  if (!raw) return '';
  if (/^assets\/[a-z0-9._-]+$/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (/["'()\\\s]/.test(raw)) return '';

    const host = url.hostname.toLowerCase();

    if (host === 'freeimage.host' || host.endsWith('.freeimage.host')) {
      return freeimageDirectUrl(url.pathname);
    }
    if (host === 'imgur.com' || host === 'www.imgur.com' || host === 'm.imgur.com') {
      return imgurDirectUrl(url.pathname);
    }
    if (host === 'i.imgur.com' || host === 'iili.io') {
      url.hash = '';
      return url.href;
    }

    url.hash = '';
    const href = url.href;
    if (IMAGE_EXT_RE.test(url.pathname) || LOGO_IMAGE_HOST_RE.test(host)) return href;
    return '';
  } catch {
    return '';
  }
}
