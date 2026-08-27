import { PREFIX, RANK_FLOOR, requireMinRank } from '../utils/prefixHelpers.js';
import { v2Card } from '../utils/v2Message.js';

const GROUPS = [
  {
    title: 'Punishments',
    lines: [
      `\`-warn @user [reason]\` — Warn · **${RANK_FLOOR.anyStaff}+**`,
      `\`-mute @user [duration] [reason]\` — Mute · **${RANK_FLOOR.anyStaff}+**`,
      `\`-unmute @user [reason]\` — Unmute · **${RANK_FLOOR.anyStaff}+**`,
      `\`-kick @user [reason]\` — Kick · **${RANK_FLOOR.administrator}+**`,
      `\`-ban @user [duration] [reason]\` — Ban · **${RANK_FLOOR.supervisor}+**`,
      `\`-softban @user [reason]\` — Softban · **${RANK_FLOOR.supervisor}+**`,
      `\`-unban <userId>\` — Unban · **${RANK_FLOOR.supervisor}+**`,
    ],
  },
  {
    title: 'Cases & notes',
    lines: [
      `\`-case <id>\` / \`-modlogs @user\` / \`-points @user\` — View · **${RANK_FLOOR.anyStaff}+**`,
      `\`-note\` / \`-notes\` / \`-presets\` — Notes & presets · **${RANK_FLOOR.anyStaff}+**`,
      `\`-editcase <id> …\` — Edit case · **${RANK_FLOOR.administrator}+**`,
      `\`-void @user\` — Clear modlogs · **${RANK_FLOOR.seniorSupervisor}+**`,
    ],
  },
  {
    title: 'Channels & cleanup',
    lines: [
      `\`-purge\` / \`-clean\` — Cleanup · **${RANK_FLOOR.leadModerator}+**`,
      `\`-lock\` / \`-unlock\` / \`-locked\` — Channel locks · **${RANK_FLOOR.supervisor}+**`,
    ],
  },
  {
    title: 'Info',
    lines: [
      `\`-roles\` / \`-members\` / \`-mutes\` / \`-modstats\` / \`-inviteinfo\` / \`-id\` / \`-diagnose\` / \`${PREFIX}help\` — **${RANK_FLOOR.anyStaff}+**`,
      `\`-vc [#channel]\` — Voice channel member count · **Administrator**`,
      `\`-nick\` — Nickname · **${RANK_FLOOR.administrator}+**`,
      `\`-bans\` — Timed ban cases · **${RANK_FLOOR.supervisor}+**`,
    ],
  },
];

export default {
  name: 'help',
  aliases: ['commands', 'modhelp', 'circle'],
  description: 'Show Clearwater Circle-style moderation commands.',
  minRank: RANK_FLOOR.anyStaff,
  async execute(message) {
    requireMinRank(message, RANK_FLOOR.anyStaff);
    await message.reply(v2Card({
      title: 'Moderation Commands',
      description: [
        `Prefix: \`${PREFIX}\` · Rank-locked`,
        `**Warn** any staff · **Kick** ${RANK_FLOOR.administrator}+ · **Ban** ${RANK_FLOOR.supervisor}+`,
      ].join('\n'),
      fields: GROUPS.map((group) => ({
        name: group.title,
        value: group.lines.join('\n').slice(0, 1024),
      })),
    }));
  },
};
