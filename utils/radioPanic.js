import { parseErlcEmergencyCall } from './erlcCallRadio.js';
import {
  erlcEventPayloads,
  extractWebhookCommandText,
  extractWebhookEventType,
  extractWebhookPlayer,
} from './erlcSceneCommands.js';

const DEDUP_MS = 15_000;
const PANIC_COMMAND = /^[:;]\s*panic\b\s*(.*)$/i;

function parseOne(payload) {
  const text = extractWebhookCommandText(payload);
  const command = PANIC_COMMAND.exec(text);
  if (command) {
    const player = extractWebhookPlayer(payload);
    return { name: player.username || player.robloxId, location: command[1].trim() };
  }
  // Any other chat command (";ss 10-8") is never a panic, even if it says the word.
  if (/^[:;]/.test(text)) return null;
  const call = parseErlcEmergencyCall(payload);
  const described = /\bpanic\b/i.test(call.description) && !/\bpanic\s*attack/i.test(call.description);
  if (!/\bpanic\b/i.test(extractWebhookEventType(payload)) && !described) return null;
  return { name: call.callerName || call.callerId, location: call.location };
}

/**
 * Reads an ER:LC webhook body (one event or a batch) for panics: an event or emergency call
 * labelled "panic", or `;panic [location]` typed in game.
 * @returns {{ name: string, location: string }[]}
 */
export function parseRadioPanics(payload) {
  return erlcEventPayloads(payload).map(parseOne).filter(Boolean);
}

/** @returns {{ name: string, location: string } | null} the first panic in a webhook body. */
export function parseRadioPanic(payload) {
  return parseRadioPanics(payload)[0] || null;
}

/** Turns ER:LC events and command-log entries into radio panic alerts, ignoring repeats of the same panic. */
export function createRadioPanicWatch(send, now = Date.now) {
  const recent = new Map();
  return (payload) => {
    const sent = [];
    for (const panic of parseRadioPanics(payload)) {
      const key = `${panic.name}|${panic.location}`.toLowerCase();
      const at = now();
      if (recent.has(key) && at - recent.get(key) < DEDUP_MS) continue;
      recent.set(key, at);
      for (const [entry, time] of recent) if (at - time > DEDUP_MS) recent.delete(entry);
      send({ type: 'panic', name: panic.name, location: panic.location, at });
      sent.push(panic);
    }
    return sent;
  };
}
