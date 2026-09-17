import { MessageFlags, escapeMarkdown } from 'discord.js';
import { membersForPlayer, playerIsInVoice } from './robloxDiscordMatch.js';
import { isVcExempt } from './enforcementExemptions.js';

const CHECK = '<:check:1514421732356653139>';
const CROSS = '<:x_:1514353388542890015>';
const BANNER = 'https://media.discordapp.net/attachments/1529616984755540088/1546535995736858644/clearwater_ban.png?format=webp&quality=lossless';

export function classifyDiscordPlayers(players, members, identities = {}, inVoice = () => false, voiceStates) {
  return players.map(player => {
    const matches = membersForPlayer(player, members, identities);
    const inVc = playerIsInVoice(player, members, identities, inVoice, voiceStates);
    return { ...player, inDiscord: matches.length > 0 || inVc, inVoice: inVc,
      exempt: isVcExempt(player, members, identities) };
  }).sort((a, b) => a.username.localeCompare(b.username));
}

export function buildDiscordCheckPanels(rows, timestamp = Math.floor(Date.now() / 1000), { banner = true } = {}) {
  const missing = rows.filter(p => !p.inDiscord);
  const noVoice = rows.filter(p => p.inDiscord && !p.inVoice);
  const voice = rows.filter(p => p.inVoice);
  const header = `# Discord Check\n${CROSS} **Missing Discord:** ${missing.length} · ${CHECK} **In Discord:** ${rows.length - missing.length} · **Online:** ${rows.length}\n**Not in VC:** ${noVoice.length} · **In VC:** ${voice.length}\n-# <t:${timestamp}:R>`;
  const sections = [
    [`${CROSS} Not in Discord`, missing, CROSS],
    [`${CROSS} In Discord — Not in VC`, noVoice, CROSS],
    [`${CHECK} In Discord — In VC`, voice, CHECK],
  ];
  const blocks = [];
  const clean = value => escapeMarkdown(String(value || '—').replace(/[\r\n`]/g, ' ').slice(0, 100));
  for (const [title, players, icon] of sections) {
    let text = `## ${title}\n`;
    if (!players.length) text += 'None';
    for (const player of players) {
      const line = `${icon} **${clean(player.username)}** · ${clean(player.team)} · \`${String(player.callsign || '—').replace(/[\r\n`]/g, ' ').slice(0, 60)}\`${player.exempt ? ' *(whitelist)*' : ''}\n`;
      if (text.length + line.length > 2800) { blocks.push(text.trim()); text = `## ${title} (continued)\n`; }
      text += line;
    }
    blocks.push(text.trim());
  }
  const pages = [];
  let page = [], size = header.length;
  for (const block of blocks) {
    if (size + block.length > 3600 && page.length) { pages.push(page); page = []; size = header.length; }
    page.push({ type: 10, content: block }); size += block.length;
  }
  if (page.length) pages.push(page);
  return pages.map((sections, index) => ({
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false },
    components: [{ type: 17, accent_color: 2829617, components: [
      ...(index === 0 && banner ? [{ type: 12, items: [{ media: { url: BANNER } }] }, { type: 14, divider: false, spacing: 1 }] : []),
      { type: 10, content: header + (pages.length > 1 ? `\n-# Page ${index + 1}/${pages.length}` : '') },
      ...sections,
    ] }],
  }));
}
