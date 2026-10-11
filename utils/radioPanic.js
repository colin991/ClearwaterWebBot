import { parseErlcEmergencyCall } from './erlcCallRadio.js';
import {
  erlcEventPayloads,
  extractWebhookCommandText,
  extractWebhookEventType,
  extractWebhookPlayer,
  isCustomCommandEvent,
} from './erlcSceneCommands.js';

const DEDUP_MS = 15_000;
const PANIC_COMMAND = /^[:;]\s*panic\b\s*(.*)$/i;

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    return asObject(JSON.parse(value));
  } catch {
    return null;
  }
}

/**
 * ER:LC's custom-command webhook sends `{ event, origin, data: { command: "panic", argument: "Main St" } }`:
 * the command arrives without its `;` and the rest of the line separately.
 */
function commandPanic(payload) {
  for (const object of [payload, payload?.data, payload?.Data].map(asObject).filter(Boolean)) {
    const command = object.command ?? object.Command;
    if (typeof command !== 'string') continue;
    const match = /^[:;]?\s*panic\b\s*(.*)$/i.exec(command.trim());
    if (!match) return null;
    const argument = object.argument ?? object.Argument ?? object.args ?? object.Args ?? '';
    return [match[1], Array.isArray(argument) ? argument.join(' ') : String(argument)].join(' ').trim();
  }
  return null;
}

function parseOne(payload) {
  const text = extractWebhookCommandText(payload);
  const typed = PANIC_COMMAND.exec(text);
  const location = typed ? typed[1].trim() : commandPanic(payload);
  if (location !== null) {
    const player = extractWebhookPlayer(payload);
    return { name: player.username, robloxId: player.robloxId, location };
  }
  // Any other chat command (";ss 10-8") is never a panic, even if it says the word.
  if (/^[:;]/.test(text) || isCustomCommandEvent(payload)) return null;
  const call = parseErlcEmergencyCall(payload);
  const described = /\bpanic\b/i.test(call.description) && !/\bpanic\s*attack/i.test(call.description);
  if (!/\bpanic\b/i.test(extractWebhookEventType(payload)) && !described) return null;
  return { name: call.callerName, robloxId: /^\d+$/.test(call.callerId || '') ? call.callerId : '', location: call.location };
}

/**
 * Reads an ER:LC webhook body (one event or a batch) for panics: an event or emergency call
 * labelled "panic", or `;panic [location]` typed in game.
 * @returns {{ name: string, robloxId: string, location: string }[]}
 */
export function parseRadioPanics(payload) {
  return erlcEventPayloads(payload).map(parseOne).filter(Boolean);
}

/** @returns {{ name: string, robloxId: string, location: string } | null} the first panic in a webhook body. */
export function parseRadioPanic(payload) {
  return parseRadioPanics(payload)[0] || null;
}

/**
 * Turns ER:LC events and command-log entries into radio panic alerts, ignoring repeats of the same panic
 * (the webhook and the command log both report one `;panic`).
 */
export function createRadioPanicWatch(send, now = Date.now) {
  const recent = new Map();
  return (payload) => {
    const sent = [];
    for (const panic of parseRadioPanics(payload)) {
      const key = `${panic.robloxId || panic.name}|${panic.location}`.toLowerCase();
      const at = now();
      if (recent.has(key) && at - recent.get(key) < DEDUP_MS) continue;
      recent.set(key, at);
      for (const [entry, time] of recent) if (at - time > DEDUP_MS) recent.delete(entry);
      send({ type: 'panic', name: panic.name || panic.robloxId, robloxId: panic.robloxId, location: panic.location, at });
      sent.push(panic);
    }
    return sent;
  };
}

/** "Building Street" or "Postal 123" for a parsed ER:LC player, or '' when the game has no location. */
export function playerLocationLabel(player) {
  const location = player?.location || {};
  return [location.building, location.street].filter(Boolean).join(' ')
    || (location.postal ? `Postal ${location.postal}` : '');
}

/** The in-game player matching a Roblox ID or any of the given names. */
export function findPanicPlayer(players, { robloxId = '', names = [] } = {}) {
  const id = String(robloxId || '');
  const handles = new Set(names.map((name) => String(name || '').trim().toLowerCase()).filter(Boolean));
  return players.find((player) => id && String(player.robloxId) === id)
    || players.find((player) => handles.has(String(player.username || '').toLowerCase()))
    || null;
}
