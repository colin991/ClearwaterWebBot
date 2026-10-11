/**
 * "<@user> talked from 14:35:34-14:35:57" lines in the radio channel's chat, one per radio transmission.
 * Times are Discord timestamps, so everyone sees them in their own time zone. Lines are batched
 * a couple of seconds so a busy channel doesn't hit Discord's rate limit.
 */
const MAX_MESSAGE = 1900;

const unix = (ms) => Math.floor(ms / 1000);

/** @param {{ userId: string, startedAt: number, endedAt: number, channelName?: string, onDiscordChannel?: boolean }} entry */
export function formatTalkLine({ userId, startedAt, endedAt, channelName = '', onDiscordChannel = true }) {
  const line = `<@${userId}> talked from <t:${unix(startedAt)}:T>-<t:${unix(Math.max(endedAt, startedAt))}:T>`;
  return onDiscordChannel || !channelName ? line : `${line} on ${channelName}`;
}

/**
 * @param {{ send: (content: string) => Promise<unknown>, flushMs?: number, onError?: (error: unknown) => void }} options
 */
export function createRadioTalkLog({ send, flushMs = 2000, onError = () => {} }) {
  let pending = [];
  let timer = null;

  async function flush() {
    timer = null;
    const lines = pending;
    pending = [];
    let message = '';
    const messages = [];
    for (const line of lines) {
      if (message && message.length + 1 + line.length > MAX_MESSAGE) {
        messages.push(message);
        message = '';
      }
      message = message ? `${message}\n${line}` : line;
    }
    if (message) messages.push(message);
    for (const content of messages) {
      try {
        await send(content);
      } catch (error) {
        onError(error);
      }
    }
  }

  return {
    add(entry) {
      pending.push(formatTalkLine(entry));
      if (!timer) {
        timer = setTimeout(() => { void flush(); }, flushMs);
        timer.unref?.();
      }
    },
    flush,
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
