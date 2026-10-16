import { renderFireTranscriptError, renderFireTranscriptPage } from '../cwfr-transcript-page.js';

const ID_PATTERN = /^[a-f0-9]{32}$/;

function sendHtml(response, status, html, cache = 'no-store') {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', cache);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.end(html);
}

function transcriptId(request) {
  const fromQuery = request?.query?.id;
  if (typeof fromQuery === 'string') return fromQuery;
  try {
    return new URL(request.url || '/', 'http://localhost').searchParams.get('id') || '';
  } catch {
    return '';
  }
}

/**
 * A CWFR ticket transcript (cwpcso.com/transcripts/cwfr/<id>). The record lives on the bot host;
 * the unguessable id in the link is what lets someone view it.
 */
export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return sendHtml(response, 405, renderFireTranscriptError('Not allowed', 'This page can only be viewed.'));
  }
  const id = String(transcriptId(request)).toLowerCase();
  if (!ID_PATTERN.test(id)) {
    return sendHtml(response, 404, renderFireTranscriptError('Transcript not found', 'Check that the link is complete.'));
  }

  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) {
    return sendHtml(response, 503, renderFireTranscriptError('Transcript unavailable', 'The bot is offline right now. Try again later.'));
  }

  try {
    const botResponse = await fetch(`${apiUrl}/api/cwfr/transcript?${new URLSearchParams({ id })}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (botResponse.status === 404 || botResponse.status === 400) {
      return sendHtml(response, 404, renderFireTranscriptError('Transcript not found', 'This transcript does not exist or was removed.'));
    }
    if (!botResponse.ok) throw new Error(`Bot API ${botResponse.status}`);
    const record = await botResponse.json();
    // Transcripts never change once saved, so the CDN can keep them briefly.
    return sendHtml(response, 200, renderFireTranscriptPage(record), 'public, s-maxage=300, stale-while-revalidate=600');
  } catch {
    return sendHtml(response, 503, renderFireTranscriptError('Transcript unavailable', 'The bot is offline right now. Try again later.'));
  }
}
