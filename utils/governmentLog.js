import { logger } from './logger.js';
import { v2Card } from './v2Message.js';
import { GOVERNMENT_LOG_CHANNEL_ID } from './governmentAccess.js';

async function fetchGovernmentLogChannel(client, config = {}) {
  const id = String(config.governmentLogChannelId || GOVERNMENT_LOG_CHANNEL_ID || '').trim();
  if (!id || !client?.isReady?.()) return null;
  const channel = await client.channels.fetch(id).catch((error) => {
    logger.error(`Government log channel fetch failed (${id})`, error);
    return null;
  });
  if (!channel?.isTextBased?.()) {
    logger.error(`Government log channel is not text-based (${id})`);
    return null;
  }
  return channel;
}

function money(amount) {
  const value = Math.trunc(Number(amount) || 0);
  return `C$${Math.abs(value).toLocaleString()}${value < 0 ? ' debt' : ''}`;
}

/**
 * Log fine submit / approve / deny to the government Discord log channel.
 */
export async function logGovernmentFine(client, {
  action,
  fine,
  actor,
  config = {},
} = {}) {
  const channel = await fetchGovernmentLogChannel(client, config);
  if (!channel || !fine) return false;

  const verb = action === 'approve'
    ? 'Fine approved'
    : action === 'deny'
      ? 'Fine denied'
      : 'Fine requested';

  const fields = [
    {
      name: 'Target',
      value: fine.targetId
        ? `<@${fine.targetId}> (\`${fine.targetId}\` · ${fine.targetDisplayName || fine.targetUsername || 'member'})`
        : 'Unknown',
    },
    { name: 'Amount', value: money(fine.amount) },
    { name: 'Reason', value: String(fine.reason || 'No reason given').slice(0, 1024) },
    {
      name: action === 'submit' ? 'Requested by' : 'Handled by',
      value: actor?.id
        ? `<@${actor.id}> (\`${actor.id}\` · ${actor.displayName || actor.username || 'staff'})`
        : 'Unknown',
    },
  ];

  if (action !== 'submit' && fine.requesterId) {
    fields.push({
      name: 'Originally requested by',
      value: `<@${fine.requesterId}> (\`${fine.requesterId}\` · ${fine.requesterName || 'member'})`,
    });
  }

  if (action === 'approve' && fine.balanceAfter != null) {
    fields.push({ name: 'Balance after fine', value: money(fine.balanceAfter) });
  }

  if (action === 'deny' && fine.reviewNote) {
    fields.push({ name: 'Denial note', value: String(fine.reviewNote).slice(0, 500) });
  }

  fields.push({
    name: 'When',
    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
  });

  await channel.send(v2Card({
    title: verb,
    description: `Clearwater Government · request \`${fine.id}\``,
    fields,
  })).catch((error) => {
    logger.error('Failed to post government fine log', error);
  });
  return true;
}
