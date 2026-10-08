import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const STORE_PATH = join(process.cwd(), 'data', 'pcso-chatbot.json');

export const DEFAULT_PCSO_CHATBOT = Object.freeze({
  greeting: 'Hi! Ask me a question about PCSO services, careers, records, or the website.',
  fallback: "I don't have an answer for that yet. Please use Contact PCSO so a staff member can help.",
  rules: [],
  updatedAt: null,
});

function cleanText(value, max) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function normalizeChatText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePcsoChatbot(input = {}) {
  const rules = (Array.isArray(input.rules) ? input.rules : []).map((rule) => ({
    id: cleanText(rule?.id, 80) || `answer_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`,
    triggers: [...new Set((Array.isArray(rule?.triggers) ? rule.triggers : [])
      .map((trigger) => cleanText(trigger, 120))
      .filter(Boolean))].slice(0, 20),
    response: cleanText(rule?.response, 2000),
    enabled: rule?.enabled !== false,
  })).filter((rule) => rule.triggers.length && rule.response).slice(0, 250);

  return {
    greeting: cleanText(input.greeting, 500) || DEFAULT_PCSO_CHATBOT.greeting,
    fallback: cleanText(input.fallback, 1000) || DEFAULT_PCSO_CHATBOT.fallback,
    rules,
    updatedAt: cleanText(input.updatedAt, 40) || null,
  };
}

export function findPcsoChatbotReply(message, config = DEFAULT_PCSO_CHATBOT) {
  const normalizedMessage = normalizeChatText(message);
  if (!normalizedMessage) return normalizePcsoChatbot(config).fallback;

  let best = null;
  for (const rule of normalizePcsoChatbot(config).rules) {
    if (!rule.enabled) continue;
    for (const trigger of rule.triggers) {
      const normalizedTrigger = normalizeChatText(trigger);
      if (!normalizedTrigger || !normalizedMessage.includes(normalizedTrigger)) continue;
      const score = normalizedTrigger.length;
      if (!best || score > best.score) best = { score, response: rule.response };
    }
  }
  return best?.response || normalizePcsoChatbot(config).fallback;
}

export async function getPcsoChatbot() {
  return normalizePcsoChatbot(await readJsonFile(STORE_PATH, DEFAULT_PCSO_CHATBOT));
}

export async function savePcsoChatbot(input) {
  const next = normalizePcsoChatbot({ ...input, updatedAt: new Date().toISOString() });
  await writeJsonFile(STORE_PATH, next, { backup: true });
  return next;
}
