/**
 * Server-rendered CWFR ticket transcript page (cwpcso.com/transcripts/cwfr/<id>), branded as
 * Clearwater Fire & Rescue rather than PCSO. Every value from the record is escaped here.
 */

const FALLBACK_LOGO = '/assets/fire-ops-logo.png';
const ROLE_LABEL = { bot: 'BOT', staff: 'STAFF', member: 'MEMBER' };

export const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function safeUrl(url) {
  const value = String(url || '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(value) ? value : '';
}

function formatDate(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  return new Date(time).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

function timeTag(iso, className = '') {
  const label = formatDate(iso);
  if (!label) return '';
  return `<time class="${className}" datetime="${escapeHtml(iso)}">${escapeHtml(label)}</time>`;
}

function discordTimestamp(seconds, style) {
  const date = new Date(Number(seconds) * 1000);
  if (!Number.isFinite(date.getTime())) return '';
  const iso = date.toISOString();
  if (style === 'R') return `<span class="ts">${escapeHtml(formatDate(iso))}</span>`;
  return `<time class="ts" datetime="${iso}">${escapeHtml(formatDate(iso))}</time>`;
}

/** Inline Discord markdown on already-escaped text. */
function inline(text, mentions) {
  const users = mentions?.users || {};
  const roles = mentions?.roles || {};
  const channels = mentions?.channels || {};
  const codes = [];
  let out = text.replace(/`([^`\n]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out
    .replace(/&#60;a?:(\w{1,32}):(\d{16,22})&#62;/g, (_, name, id) => (
      `<img class="emoji" src="https://cdn.discordapp.com/emojis/${id}.png" alt=":${name}:" title=":${name}:">`
    ))
    .replace(/&#60;@!?(\d{16,22})&#62;/g, (_, id) => `<span class="mention">@${escapeHtml(users[id] || 'Unknown user')}</span>`)
    .replace(/&#60;@&#38;(\d{16,22})&#62;/g, (_, id) => `<span class="mention">@${escapeHtml(roles[id] || 'Unknown role')}</span>`)
    .replace(/&#60;#(\d{16,22})&#62;/g, (_, id) => `<span class="mention">#${escapeHtml(channels[id] || 'deleted-channel')}</span>`)
    .replace(/&#60;t:(-?\d{1,13})(?::([tTdDfFR]))?&#62;/g, (_, seconds, style) => discordTimestamp(seconds, style))
    .replace(/@(here|everyone)\b/g, '<span class="mention">@$1</span>')
    .replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])(https:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)]);
}

/** Block-level Discord markdown: code blocks, headings, quotes, lists, subtext. */
export function renderMarkdown(source, mentions) {
  const blocks = [];
  const escaped = escapeHtml(source).replace(/```(?:[\w-]*\n)?([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre><code>${code.replace(/^\n+|\n+$/g, '')}</code></pre>`);
    return `\n\u0001${blocks.length - 1}\u0001\n`;
  });
  const html = [];
  let quote = [];
  const flushQuote = () => {
    if (quote.length) html.push(`<blockquote>${quote.join('<br>')}</blockquote>`);
    quote = [];
  };
  for (const line of escaped.split('\n')) {
    const block = line.match(/^\u0001(\d+)\u0001$/);
    if (block) { flushQuote(); html.push(blocks[Number(block[1])]); continue; }
    const quoted = line.match(/^&#62; ?(.*)$/);
    if (quoted) { quote.push(inline(quoted[1], mentions)); continue; }
    flushQuote();
    const heading = line.match(/^(#{1,3}) (.+)$/);
    if (heading) { html.push(`<h${heading[1].length + 1} class="md-h">${inline(heading[2], mentions)}</h${heading[1].length + 1}>`); continue; }
    const subtext = line.match(/^-# (.+)$/);
    if (subtext) { html.push(`<div class="subtext">${inline(subtext[1], mentions)}</div>`); continue; }
    const item = line.match(/^\s*[-*] (.+)$/);
    if (item) { html.push(`<div class="li">${inline(item[1], mentions)}</div>`); continue; }
    html.push(line.trim() ? `<div>${inline(line, mentions)}</div>` : '<div class="gap"></div>');
  }
  flushQuote();
  return html.join('');
}

function renderMessage(message, mentions) {
  const author = message.author || {};
  const role = ROLE_LABEL[author.role] ? author.role : 'member';
  const avatar = safeUrl(author.avatarUrl);
  const body = [];
  if (message.content) body.push(renderMarkdown(message.content, mentions));
  for (const embed of message.embeds || []) {
    const color = Number.isInteger(embed.color) ? `#${embed.color.toString(16).padStart(6, '0')}` : 'var(--border)';
    body.push(`<div class="embed" style="border-left-color:${color}">${[
      embed.title ? `<div class="embed-title">${inline(escapeHtml(embed.title), mentions)}</div>` : '',
      embed.description ? renderMarkdown(embed.description, mentions) : '',
      ...(embed.fields || []).map((field) => `<div class="embed-field"><strong>${inline(escapeHtml(field.name), mentions)}</strong>${renderMarkdown(field.value, mentions)}</div>`),
      safeUrl(embed.imageUrl) ? `<img class="media" src="${escapeHtml(embed.imageUrl)}" alt="" loading="lazy">` : '',
    ].join('')}</div>`);
  }
  for (const part of message.parts || []) {
    if (part.kind === 'text') body.push(`<div class="part">${renderMarkdown(part.content, mentions)}</div>`);
    else if (part.kind === 'image' && safeUrl(part.url)) body.push(`<img class="media" src="${escapeHtml(part.url)}" alt="" loading="lazy">`);
  }
  for (const file of message.attachments || []) {
    const url = safeUrl(file.url);
    if (!url) continue;
    body.push(file.image
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><img class="media" src="${escapeHtml(url)}" alt="${escapeHtml(file.name)}" loading="lazy"></a>`
      : `<a class="file" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(file.name)}</a>`);
  }
  return `<article class="msg">
  ${avatar ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy">` : '<div class="avatar"></div>'}
  <div class="msg-main">
    <div class="msg-head"><span class="name name-${role}">${escapeHtml(author.name || 'Unknown')}</span><span class="badge badge-${role}">${ROLE_LABEL[role]}</span>${timeTag(message.createdAt, 'stamp')}</div>
    <div class="msg-body">${body.join('') || '<div class="muted">(no text)</div>'}</div>
  </div>
</article>`;
}

function person(entry) {
  if (!entry?.name) return 'Unknown';
  return entry.username && entry.username !== entry.name ? `${entry.name} (@${entry.username})` : entry.name;
}

const STYLES = `
:root{--bg:#1a1b1f;--panel:#232428;--panel-2:#2b2d31;--border:#35373c;--text:#e3e5e8;--muted:#9a9ca3;--brand:#c8102e;--brand-2:#9e0b22;--mention-bg:rgba(200,16,46,.22);--mention:#ffb3bf;--link:#ff8a9a}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 "Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.top{background:linear-gradient(90deg,var(--brand-2),var(--brand));border-top:2px solid #ff4d63}
.top-inner{max-width:880px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:10px;font-weight:700}
.top-inner img{width:28px;height:28px;border-radius:50%;object-fit:cover}
main{max-width:880px;margin:0 auto;padding:14px 16px 32px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:12px}
h1{font-size:18px;margin:0 0 4px}
.sub{color:var(--muted);font-size:13px;margin-bottom:12px}
.meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px 16px}
.meta dt{color:var(--muted);font-size:10px;letter-spacing:.06em;text-transform:uppercase}
.meta dd{margin:2px 0 0;overflow-wrap:anywhere}
.reason{margin-top:12px;color:var(--muted);overflow-wrap:anywhere}.reason strong{color:var(--text)}
.msg{display:flex;gap:12px;padding:8px 0}
.avatar{width:36px;height:36px;border-radius:50%;flex:none;background:var(--panel-2);object-fit:cover}
.msg-main{min-width:0;flex:1}
.msg-head{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
.name{font-weight:600}.name-member{color:#ff8a9a}
.badge{font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;color:#fff}
.badge-bot{background:#5865f2}.badge-staff{background:var(--brand)}.badge-member{background:#248046}
.stamp{color:var(--muted);font-size:11px}
.msg-body{overflow-wrap:anywhere}
.md-h{margin:8px 0 4px;line-height:1.25}h2.md-h{font-size:20px}h3.md-h{font-size:17px}h4.md-h{font-size:15px}
blockquote{margin:4px 0;padding:0 0 0 10px;border-left:3px solid var(--border)}
pre{background:#1e1f22;border:1px solid var(--border);border-radius:4px;padding:8px;white-space:pre-wrap;margin:4px 0}
code{background:#1e1f22;border-radius:3px;padding:0 3px;font:12px/1.4 Consolas,Menlo,monospace}pre code{padding:0}
.mention{background:var(--mention-bg);color:var(--mention);border-radius:3px;padding:0 2px;font-weight:500}
.ts{background:rgba(255,255,255,.07);border-radius:3px;padding:0 2px}
a{color:var(--link)}
.subtext{color:var(--muted);font-size:12px}
.li::before{content:"• ";color:var(--muted)}
.gap{height:8px}
.emoji{width:20px;height:20px;vertical-align:-4px}
h2.md-h .emoji{width:26px;height:26px;vertical-align:-5px}
.embed{background:var(--panel-2);border-left:4px solid var(--border);border-radius:4px;padding:8px 10px;margin:6px 0;max-width:560px}
.embed-title{font-weight:700;margin-bottom:4px}.embed-field{margin-top:6px}
.part+.part{margin-top:6px}
.media{display:block;max-width:min(100%,460px);max-height:320px;border-radius:6px;margin:6px 0}
.file{display:inline-block;background:var(--panel-2);border:1px solid var(--border);border-radius:4px;padding:6px 10px;margin:4px 0}
.muted,.foot{color:var(--muted)}
.foot{text-align:center;font-size:11px;margin-top:28px}
@media (max-width:520px){.meta{grid-template-columns:1fr 1fr}}
`;

const LOCALIZE = `document.querySelectorAll('time[datetime]').forEach(function(el){var d=new Date(el.getAttribute('datetime'));if(!isNaN(d))el.textContent=d.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});});`;

function shell({ title, logo, brand, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#c8102e">
<title>${escapeHtml(title)}</title>
<link rel="icon" type="image/png" href="${escapeHtml(logo)}">
<style>${STYLES}</style>
</head>
<body>
<header class="top"><div class="top-inner"><img src="${escapeHtml(logo)}" alt=""><span>${escapeHtml(brand)}</span></div></header>
<main>${body}</main>
<script>${LOCALIZE}</script>
</body>
</html>`;
}

export function renderFireTranscriptPage(record) {
  const brand = 'Clearwater Fire & Rescue';
  const logo = safeUrl(record?.guild?.iconUrl) || FALLBACK_LOGO;
  const mentions = record.mentions || {};
  const header = `<section class="card">
  <h1>#${escapeHtml(record.channel?.name || 'ticket')}</h1>
  <div class="sub">${escapeHtml(brand)} · Ticket transcript</div>
  <dl class="meta">
    <div><dt>Ticket</dt><dd>${escapeHtml(record.ticket?.title || 'Support')}</dd></div>
    <div><dt>Opened by</dt><dd>${escapeHtml(person(record.opener))}</dd></div>
    <div><dt>Opened</dt><dd>${timeTag(record.openedAt)}</dd></div>
    <div><dt>Closed</dt><dd>${timeTag(record.closedAt)}</dd></div>
    <div><dt>Claimed by</dt><dd>${escapeHtml(record.claimedBy ? person(record.claimedBy) : 'Nobody')}</dd></div>
    <div><dt>Closed because</dt><dd>${escapeHtml(record.closedBecause || 'Closed')}</dd></div>
    <div><dt>Messages</dt><dd>${Number(record.messageCount) || 0}</dd></div>
  </dl>
  ${record.reason ? `<div class="reason"><strong>Reason:</strong> ${escapeHtml(record.reason)}</div>` : ''}
</section>`;
  const messages = (record.messages || []).map((message) => renderMessage(message, mentions)).join('\n');
  return shell({
    title: `#${record.channel?.name || 'ticket'} | CWFR Ticket Transcript`,
    logo,
    brand,
    body: `${header}
<section class="card">${messages || '<div class="muted">No messages were saved.</div>'}</section>
<p class="foot">Anyone with this link can view this transcript, so only share it with people you trust.</p>`,
  });
}

export function renderFireTranscriptError(title, message) {
  return shell({
    title: `${title} | CWFR Ticket Transcript`,
    logo: FALLBACK_LOGO,
    brand: 'Clearwater Fire & Rescue',
    body: `<section class="card"><h1>${escapeHtml(title)}</h1><div class="sub">${escapeHtml(message)}</div></section>`,
  });
}
