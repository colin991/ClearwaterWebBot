import { MessageFlags } from 'discord.js';
import { logger } from './logger.js';

const SALARY_DM_WALLET_EMOJI = '<:unknown:1523184075290968125>';
const SALARY_DM_HEADER_IMAGE = 'https://i.postimg.cc/BQdHjDnP/clearwater-v2-market.webp';
const SALARY_DM_FOOTER_IMAGE = 'https://i.postimg.cc/SxC8CsnV/clearwaterfooter.webp';

function formatSalaryMoney(value) {
  const amount = Math.trunc(Number(value) || 0);
  return `C$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildSalaryPaidDmPayload({
  amount,
  departmentName,
  balance,
  walletUrl = 'https://www.cwrpvc.lol/internet/wallet',
} = {}) {
  const paid = formatSalaryMoney(amount);
  const available = formatSalaryMoney(balance);
  const depositor = String(departmentName || 'Department').trim().toUpperCase();
  const content = [
    `# ${SALARY_DM_WALLET_EMOJI} Wallet Update`,
    `> Congrats, you just got paid! ${paid} has been added to your account. You can view your account [here.](${walletUrl})`,
    '',
    `> Deposited by: **${depositor}**`,
    '',
    `> Available balance: **${available}**`,
  ].join('\n');

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: { url: SALARY_DM_HEADER_IMAGE },
                spoiler: true,
              },
            ],
          },
          { type: 14, spacing: 2 },
          { type: 10, content: content.slice(0, 4000) },
          { type: 14, divider: false, spacing: 1 },
          {
            type: 12,
            items: [{ media: { url: SALARY_DM_FOOTER_IMAGE } }],
          },
        ],
      },
    ],
  };
}

export async function sendSalaryPaidDm(client, discordId, details = {}) {
  if (!client || !/^\d{16,22}$/.test(String(discordId || ''))) return false;
  try {
    const user = await client.users.fetch(discordId);
    await user.send(buildSalaryPaidDmPayload(details));
    return true;
  } catch (error) {
    logger.warn(`Could not DM salary payout to ${discordId}`, error?.message || error);
    return false;
  }
}
