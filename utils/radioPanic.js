import { isErlcCommandEvent, parseErlcEmergencyCall } from './erlcCallRadio.js';

const DEDUP_MS = 15_000;

function commandText(payload) {
  const objects = [payload?.Data, payload?.data, payload?.Payload, payload?.payload, payload].filter((item) => item && typeof item === 'object');
  for (const object of objects) {
    for (const key of ['Command', 'command', 'Message', 'message', 'Content', 'content', 'Text', 'text']) {
      if (typeof object[key] === 'string' && object[key].trim()) return object[key].trim();
    }
  }
  return '';
}

function typeText(payload) {
  const objects = [payload?.Data, payload?.data, payload?.Payload, payload?.payload, payload].filter((item) => item && typeof item === 'object');
  for (const object of objects) {
    for (const key of ['Type', 'type', 'EventType', 'eventType', 'Event', 'event', 'Name', 'name']) {
      if (typeof object[key] === 'string' && object[key].trim()) return object[key].trim();
    }
  }
  return '';
}

/**
 * Reads an ER:LC webhook event as a panic: an event or emergency call labelled "panic",
 * or a `;panic [location]` message typed in game.
 * @returns {{ name: string, location: string } | null}
 */
export function parseRadioPanic(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const call = parseErlcEmergencyCall(payload);
  if (isErlcCommandEvent(payload)) {
    const match = /^;\s*panic\b\s*(.*)$/i.exec(commandText(payload));
    if (!match) return null;
    return { name: call.callerName || call.callerId, location: match[1].trim() || call.location };
  }
  const described = /\bpanic\b/i.test(call.description) && !/\bpanic\s*attack/i.test(call.description);
  if (!/\bpanic\b/i.test(typeText(payload)) && !described) return null;
  return { name: call.callerName || call.callerId, location: call.location };
}

/** Turns ER:LC webhook events into radio panic alerts, ignoring repeats of the same panic. */
export function createRadioPanicWatch(send, now = Date.now) {
  const recent = new Map();
  return (payload) => {
    const panic = parseRadioPanic(payload);
    if (!panic) return null;
    const key = `${panic.name}|${panic.location}`.toLowerCase();
    const at = now();
    if (recent.has(key) && at - recent.get(key) < DEDUP_MS) return null;
    recent.set(key, at);
    for (const [entry, time] of recent) if (at - time > DEDUP_MS) recent.delete(entry);
    send({ type: 'panic', name: panic.name, location: panic.location, at });
    return panic;
  };
}
