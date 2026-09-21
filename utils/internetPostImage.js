import sharp from 'sharp';

const WIDTH = 1000;
const MAX_BYTES = 8 * 1024 * 1024;
const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

async function imageBytes(value) {
  const data = String(value || '').match(/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,([a-z0-9+/=\s]+)$/i);
  if (data) {
    if (data[1].length > MAX_BYTES * 1.4) return null;
    const bytes = Buffer.from(data[1], 'base64');
    return bytes.length <= MAX_BYTES ? bytes : null;
  }
  let url;
  try { url = new URL(value); } catch { return null; }
  // Only fetch known image hosts, never arbitrary URLs from post content.
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    !/(^|\.)(discordapp\.com|discordapp\.net|discord\.com|rbxcdn\.com|giphy\.com|tenor\.com|public\.blob\.vercel-storage\.com)$/.test(url.hostname)) return null;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/') || Number(response.headers.get('content-length')) > MAX_BYTES) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('Post image exceeds size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function textImage(text, { size = 28, width = 940, color = '#e7e9ea', bold = false } = {}) {
  return sharp({ text: {
    text: `<span foreground="${color}"${bold ? ' weight="bold"' : ''}>${xml(text)}</span>`,
    font: `Arial ${size}`, width, rgba: true, wrap: 'word-char', spacing: 8,
  } }).png().toBuffer({ resolveWithObject: true });
}

export async function renderInternetPostImage(post, { followers = 0, avatarUrl = '', timestamp = '', reply = false } = {}) {
  const name = String(post.displayName || post.username || 'Internet user').slice(0, 80);
  const handle = String(post.username || 'user').replace(/@/g, '').slice(0, 80);
  const [body, avatar, media] = await Promise.all([
    textImage(String(post.content || 'Shared a post.').slice(0, 4000)),
    imageBytes(avatarUrl).catch(() => null),
    imageBytes(post.imageUrl || post.gifUrl).catch(() => null),
  ]);
  const layers = [];
  let avatarPng;
  if (avatar) {
    avatarPng = await sharp(avatar, { limitInputPixels: 40_000_000 }).resize(72, 72).composite([{
      input: Buffer.from('<svg width="72" height="72"><circle cx="36" cy="36" r="36" fill="white"/></svg>'), blend: 'dest-in',
    }]).png().toBuffer().catch(() => null);
  }
  if (avatarPng) layers.push({ input: avatarPng, left: 30, top: 30 });
  const title = await textImage(name, { size: 28, width: 840, bold: true });
  const subtitle = await textImage(`@${handle} · ${followers} follower${followers === 1 ? '' : 's'}`, { size: 25, width: 840, color: '#71767b' });
  layers.push({ input: title.data, left: 122, top: 38 });
  layers.push({ input: subtitle.data, left: 122, top: 44 + title.info.height });
  const bodyTop = Math.max(128, 64 + title.info.height + subtitle.info.height);
  layers.push({ input: body.data, left: 30, top: bodyTop });
  let y = bodyTop + body.info.height + 22;
  if (media) {
    const resized = await sharp(media, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 940, height: 650, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true }).catch(() => null);
    if (resized) {
      layers.push({ input: resized.data, left: Math.round((WIDTH - resized.info.width) / 2), top: y });
      y += resized.info.height + 24;
    }
  }
  if (timestamp) {
    const footer = await textImage(timestamp, { size: 25, color: '#71767b' });
    layers.push({ input: footer.data, left: 30, top: y });
    y += footer.info.height;
  }
  const height = y + 32;
  const base = Buffer.from(`<svg width="${WIDTH}" height="${height}"><rect x="1" y="1" width="998" height="${height - 2}" rx="28" fill="${reply ? '#0b1b28' : '#16191c'}" stroke="#272c30" stroke-width="2"/>${avatarPng ? '' : '<circle cx="66" cy="66" r="36" fill="#71767b"/><circle cx="66" cy="57" r="12" fill="#cfd3d6"/><path d="M44 89 Q44 68 66 68 Q88 68 88 89" fill="#cfd3d6"/>'}</svg>`);
  return sharp(base).composite(layers).png().toBuffer();
}
