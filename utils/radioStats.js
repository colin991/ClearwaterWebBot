import { EmbedBuilder } from 'discord.js';

/**
 * Weekly Clearwater Radio stats: time each member spent signed in on a radio and how many
 * transmissions they made. Posted in the radio voice channel's chat once a week, then started over.
 */
export const RADIO_STATS_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the week `at` falls in. */
export function radioStatsWeekStart(at) {
  const date = new Date(at);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day);
}

export function emptyRadioStats(at) {
  return { weekStart: radioStatsWeekStart(at), users: {} };
}

/**
 * @param {{ weekStart: number, users: Record<string, { name: string, onlineMs: number, talkMs: number, transmissions: number }> }} data
 */
export function createRadioStats(data, { now = () => Date.now() } = {}) {
  let stats = data?.weekStart && data?.users ? data : emptyRadioStats(now());
  const entry = (userId, name) => {
    const id = String(userId);
    stats.users[id] ||= { name: name || 'Unit', onlineMs: 0, talkMs: 0, transmissions: 0 };
    if (name) stats.users[id].name = name;
    return stats.users[id];
  };
  return {
    get data() {
      return stats;
    },
    /** One finished transmission. */
    addTalk({ userId, name, startedAt, endedAt }) {
      const row = entry(userId, name);
      row.transmissions += 1;
      row.talkMs += Math.max(0, (endedAt || 0) - (startedAt || 0));
    },
    /** Called on a timer with everyone signed in: each gets `elapsedMs` of radio time. */
    tick(users, elapsedMs) {
      const seen = new Set();
      for (const user of users || []) {
        if (!user?.userId || seen.has(user.userId)) continue;
        seen.add(user.userId);
        entry(user.userId, user.name).onlineMs += elapsedMs;
      }
    },
    due() {
      return now() >= stats.weekStart + RADIO_STATS_WEEK_MS;
    },
    report() {
      const rows = Object.entries(stats.users)
        .map(([userId, row]) => ({ userId, ...row }))
        .filter((row) => row.onlineMs > 0 || row.transmissions > 0)
        .sort((a, b) => b.onlineMs - a.onlineMs || b.transmissions - a.transmissions);
      return { weekStart: stats.weekStart, weekEnd: stats.weekStart + RADIO_STATS_WEEK_MS, rows };
    },
    reset() {
      stats = emptyRadioStats(now());
    },
  };
}

export function formatRadioDuration(ms) {
  const minutes = Math.round(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}

export function buildRadioStatsEmbed(report, limit = 25) {
  const lines = report.rows.slice(0, limit).map((row, index) => `${index + 1}. <@${row.userId}> · `
    + `**${formatRadioDuration(row.onlineMs)}** on radio · ${row.transmissions} transmission${row.transmissions === 1 ? '' : 's'}`
    + ` (${formatRadioDuration(row.talkMs)} talking)`);
  const more = report.rows.length > limit ? `\n…and ${report.rows.length - limit} more.` : '';
  const totalTx = report.rows.reduce((total, row) => total + row.transmissions, 0);
  return new EmbedBuilder()
    .setColor(0x267bd7)
    .setTitle('📻 Weekly radio stats')
    .setDescription(`<t:${Math.floor(report.weekStart / 1000)}:D> to <t:${Math.floor(report.weekEnd / 1000)}:D>\n\n${
      lines.length ? lines.join('\n') + more : 'Nobody used the radio this week.'}`)
    .setFooter({ text: `${report.rows.length} member${report.rows.length === 1 ? '' : 's'} · ${totalTx} transmissions` });
}
