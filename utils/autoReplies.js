import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';

export const AUTO_REPLY_CATEGORY_ID = '1514026811850358804';

const IN_GAME_PUNISHMENT_REPLY = Object.freeze({
  flags: MessageFlags.IsComponentsV2,
  allowedMentions: { parse: [] },
});

function buildInGamePunishmentReply() {
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# <:wave:1514337303907274902> Hi there! Let me help you!',
      '<:mailbox:1514351393702412470> **You were most likely banned or kicked in-game randomly due to one of a couple reasons -**',
      '> 1. You were not in a proper registered VC listed under the **Roleplay VC** category while in-game',
      '> 2. You violated a rule that is heavily moderated and may not realize',
      '> 3. The bot accidentally made a mistake and kicked/banned you',
      '> 4. A moderator used a 3 letter command and accidentally kicked/banned you',
      '<:pin:1514353828567318528> If this is **not** one of your issues, please open a ticket here. For wrongful punishment, you can appeal and **use the resources in the links below.**',
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('In-game Ban Appeal')
        .setEmoji({ id: '1518377512839675944', name: 'MP_Shield' })
        .setStyle(ButtonStyle.Link)
        .setURL('https://melonly.xyz/forms/7470967607080783872'),
      new ButtonBuilder()
        .setLabel('View Your Moderations')
        .setEmoji({ id: '1514355480128913550', name: 'melonlym' })
        .setStyle(ButtonStyle.Link)
        .setURL('https://melonly.xyz/my/logs/7470308722904928256'),
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('https://cdn.discordapp.com/attachments/1529616984755540088/1545833442040619018/clearwater_footer.png'),
    ));

  return { ...IN_GAME_PUNISHMENT_REPLY, components: [container] };
}

function isPunishmentQuestion(content) {
  const normalized = String(content || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return normalized === 'blank'
    || /\b(?:banned|kicked)\s+for\s+no\s+reason\b/.test(normalized);
}

export async function handleAutoReply(message) {
  if (!message || message.author?.bot || !message.inGuild?.()) return false;
  if (String(message.channel?.parentId || '') !== AUTO_REPLY_CATEGORY_ID) return false;
  if (!isPunishmentQuestion(message.content)) return false;
  await message.channel.send(buildInGamePunishmentReply());
  return true;
}
