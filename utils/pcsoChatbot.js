import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const STORE_PATH = join(process.cwd(), 'data', 'pcso-chatbot.json');

export const DEFAULT_PCSO_CHATBOT = Object.freeze({
  greeting: 'Hi! Ask me a question about PCSO services, careers, records, or the website.',
  fallback: "I don't have an answer for that yet. Please use Contact PCSO so a staff member can help.",
  rules: [
    {
      id: 'basic_greeting',
      triggers: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
      response: 'Hello! I can help you find applications, public records, police reports, ride-alongs, policies, events, live operations, and other PCSO website resources.',
      enabled: true,
    },
    {
      id: 'basic_help',
      triggers: ['help', 'what can you do', 'what can i ask', 'how can you help'],
      response: 'You can ask me how to apply, contact PCSO, submit a report, request public records, schedule a ride-along, view policies, find events, or open the Live Operations dashboard.',
      enabled: true,
    },
    {
      id: 'basic_thanks',
      triggers: ['thank you', 'thanks', 'thank you for your help'],
      response: "You're welcome! Let me know if you need help finding anything else on the PCSO website.",
      enabled: true,
    },
    {
      id: 'basic_careers',
      triggers: ['how do i apply', 'where do i apply', 'application', 'join pcso', 'careers'],
      response: 'Visit the Careers page to view recruitment information and start or track your application: /careers',
      enabled: true,
    },
    {
      id: 'basic_contact',
      triggers: ['contact pcso', 'open a ticket', 'support ticket', 'i need support', 'talk to staff'],
      response: 'Use the Contact PCSO page to open or review a support ticket: /contact',
      enabled: true,
    },
    {
      id: 'basic_records',
      triggers: ['public records', 'records request', 'request records', 'get a report copy'],
      response: 'You can submit and track a public records request here: /public-records',
      enabled: true,
    },
    {
      id: 'basic_report',
      triggers: ['file a police report', 'submit a police report', 'report an incident', 'police report'],
      response: 'Use the File a Police Report page to submit an incident report: /police-report',
      enabled: true,
    },
    {
      id: 'basic_ride_along',
      triggers: ['ride along', 'ride-along', 'request a ride along'],
      response: 'The Ride-Along Portal has requests, scheduling, rules, waiver status, and reviews: /ride-along',
      enabled: true,
    },
    {
      id: 'basic_policies',
      triggers: ['policies', 'sop', 'standard operating procedures', 'radio procedures'],
      response: 'Search PCSO policies and standard operating procedures in the Policies and SOP Library: /policies',
      enabled: true,
    },
    {
      id: 'basic_events',
      triggers: ['events', 'calendar', 'training dates', 'recruitment session'],
      response: 'View upcoming public events, recruitment sessions, and training dates on the Community Events Calendar: /calendar',
      enabled: true,
    },
    {
      id: 'basic_operations',
      triggers: ['live operations', 'server status', 'who is on duty', 'current weather', 'active priority'],
      response: 'The Live Operations dashboard shows server status, weather, priorities, on-duty personnel, districts, and Watch Commanders: /operations',
      enabled: true,
    },
    {
      id: 'basic_directory',
      triggers: ['deputy directory', 'find a deputy', 'staff directory', 'roster'],
      response: 'Use the Deputy Directory to search personnel by callsign, rank, division, or name: /deputy-directory',
      enabled: true,
    },
  ],
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
