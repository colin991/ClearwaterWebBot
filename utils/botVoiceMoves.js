/** memberId -> expiry timestamp (ms) for recent bot-initiated VC moves */

const recentBotMoves = new Map();

const DEFAULT_TTL_MS = 20_000;

/**
 * Mark that our bot is about to move (or just moved) this member between VCs.
 * Frequency Change greeting checks this so bot-dragged joins do not trigger TTS.
 */
export function markBotVoiceMove(memberId, ttlMs = DEFAULT_TTL_MS) {
  const id = String(memberId || '').trim();
  if (!id) return;
  recentBotMoves.set(id, Date.now() + Math.max(1_000, Number(ttlMs) || DEFAULT_TTL_MS));
}

/** True if this member was recently moved by our bot. */
export function wasMovedByBot(memberId) {
  const id = String(memberId || '').trim();
  if (!id) return false;
  const expiresAt = recentBotMoves.get(id);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    recentBotMoves.delete(id);
    return false;
  }
  return true;
}

export function clearBotVoiceMove(memberId) {
  recentBotMoves.delete(String(memberId || '').trim());
}
