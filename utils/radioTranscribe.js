import { logger } from './logger.js';

/**
 * Speech-to-text for recorded radio transmissions, so staff can search what was said, plus a
 * profanity check on each transcript. Uses OpenAI's transcription API with the bot's existing
 * OPENAI_API_KEY (the same key /say uses). Transcripts live in the recordings index and are deleted
 * with the recordings after 24 hours.
 */
export const RADIO_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const TRANSCRIBE_TIMEOUT_MS = 60_000;
/** Shorter than this is a click or a breath; not worth a request. */
const MIN_SECONDS = 0.6;
/** Waiting transcriptions beyond this are dropped (oldest first) so a backlog can't grow forever. */
const MAX_QUEUE = 200;
/** Steers the model toward radio words it would otherwise misspell. */
const RADIO_PROMPT = 'Police, fire and DOT radio traffic in a Roblox roleplay server (ER:LC, Clearwater, Liberty County). '
  + '10-4, copy, en route, on scene, postal, 10-8, 10-7, dispatch, traffic stop, pursuit, suspect, BOLO.';

/* ---------- profanity ---------- */

// Word starts; a word matches when it begins with one of these (so "fucking" matches "fuck").
const PROFANE_STEMS = [
  'fuck', 'motherfuck', 'shit', 'bullshit', 'bitch', 'cunt', 'asshole', 'dickhead', 'bastard',
  'whore', 'slut', 'pussy', 'wank', 'twat', 'jackass', 'dumbass', 'smartass',
  // Slurs.
  'nigg', 'faggot', 'retard', 'tranny', 'kike', 'wetback',
];
// Whole words only, because they start harmless words ("cocktail", "Dickens", "spicy", "prickly").
const PROFANE_WORDS = [
  'ass', 'dick', 'dicks', 'cock', 'cocks', 'prick', 'pricks', 'fuk', 'fuks',
  'fag', 'fags', 'coon', 'coons', 'spic', 'spics', 'chink', 'chinks',
];
// Words that start with a stem above but are harmless.
const SAFE_WORDS = new Set([
  'shitake', 'pussycat', 'pussyfoot', 'retardant', 'retardants', 'retardation', 'bastardize', 'whorl', 'whorls',
]);

function wordList(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .match(/[a-z*]+/g) || [];
}

/** "fucking" -> "f*****g": first and last letter kept, so staff know which word without reading it. */
export function maskWord(word) {
  const value = String(word || '');
  if (value.length <= 2) return `${value[0] || ''}*`;
  return `${value[0]}${'*'.repeat(value.length - 2)}${value.at(-1)}`;
}

/**
 * The profane words in a transcript, lowercased and in the order said (each once). The
 * transcription model sometimes censors words itself ("f***"); those count too.
 * extraWords: more words or stems from RADIO_PROFANITY_WORDS (comma separated).
 */
export function findProfanity(text, { extraWords = [] } = {}) {
  const extras = extraWords.map((word) => String(word).trim().toLowerCase()).filter(Boolean);
  const stems = [...PROFANE_STEMS, ...extras];
  const found = [];
  for (const word of wordList(text)) {
    if (found.includes(word)) continue;
    if (/^[a-z]\*{2,}[a-z]?$/.test(word)) {
      found.push(word);
      continue;
    }
    if (word.includes('*') || SAFE_WORDS.has(word)) continue;
    if (PROFANE_WORDS.includes(word) || stems.some((stem) => word.startsWith(stem))) found.push(word);
  }
  return found;
}

/* ---------- transcription ---------- */

/** One recording's text, from its Ogg Opus audio. */
export async function transcribeAudio(audio, { apiKey, model = RADIO_TRANSCRIBE_MODEL, fetchImpl = fetch } = {}) {
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/ogg' }), 'transmission.ogg');
  form.append('model', model);
  form.append('language', 'en');
  form.append('prompt', RADIO_PROMPT);
  form.append('response_format', 'json');
  const response = await fetchImpl(TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Transcription failed (${response.status}): ${body?.error?.message || 'no details'}`);
    error.status = response.status;
    throw error;
  }
  return String(body?.text || '').trim();
}

/**
 * A one-at-a-time transcription queue. add(entry, audio) transcribes a saved recording and calls
 * onResult(entry, { transcript, profanity }) when it's done. Without an API key it does nothing.
 */
export function createRadioTranscriber({
  apiKey = '',
  model = '',
  extraWords = '',
  onResult = () => {},
  transcribe = transcribeAudio,
} = {}) {
  const key = String(apiKey || '').trim();
  const extras = String(extraWords || '').split(',').map((word) => word.trim()).filter(Boolean);
  const pending = [];
  let running = false;
  let idle = Promise.resolve();
  let pausedUntil = 0;

  async function drain() {
    while (pending.length) {
      const wait = pausedUntil - Date.now();
      if (wait > 0) await new Promise((resolve) => { setTimeout(resolve, wait).unref?.(); });
      const { entry, audio } = pending.shift();
      try {
        const transcript = await transcribe(audio, { apiKey: key, model: model || RADIO_TRANSCRIBE_MODEL });
        await onResult(entry, { transcript, profanity: findProfanity(transcript, { extraWords: extras }) });
      } catch (error) {
        // Rate limited: wait a minute before the next one. Anything else just skips this recording.
        if (error?.status === 429) pausedUntil = Date.now() + 60_000;
        logger.warn(`Radio transcript for ${entry?.id} failed: ${error?.message || error}`);
      }
    }
  }

  return {
    configured: Boolean(key),
    add(entry, audio) {
      if (!key || !entry?.id || !audio?.length || Number(entry.seconds || 0) < MIN_SECONDS) return false;
      pending.push({ entry, audio });
      if (pending.length > MAX_QUEUE) pending.splice(0, pending.length - MAX_QUEUE);
      if (!running) {
        running = true;
        idle = drain().finally(() => { running = false; });
      }
      return true;
    },
    get queued() { return pending.length; },
    /** For tests: resolves when the queue is empty. */
    flush: () => idle,
  };
}
