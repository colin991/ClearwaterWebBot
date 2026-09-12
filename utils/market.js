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

export const MARKET_MERCH_BUTTON_ID = 'clearwater:market:merch';
export const MARKET_NEXT_PAGE_ID = 'clearwater:market:next:2';

const MERCH_OPTIONS = [
  ['Merch Option 1', 'https://www.roblox.com/catalog/106691928344245', 'https://media.discordapp.net/attachments/1514190592005902336/1548187903346216990/showcase_1.png?format=webp&quality=lossless'],
  ['Merch Option 2', 'https://www.roblox.com/catalog/109913225875241', 'https://media.discordapp.net/attachments/1514190592005902336/1548187902998085754/showcase_2.png?format=webp&quality=lossless'],
  ['Merch Option 3', 'https://www.roblox.com/catalog/77087897264090', 'https://media.discordapp.net/attachments/1514190592005902336/1548187902700421130/showcase_3.png?format=webp&quality=lossless'],
  ['Merch Option 4', 'https://www.roblox.com/catalog/73517680561669', 'https://media.discordapp.net/attachments/1514190592005902336/1548187902440251512/showcase_4.png?format=webp&quality=lossless'],
  ['Merch Option 5', 'https://www.roblox.com/catalog/127753513423078', 'https://media.discordapp.net/attachments/1514190592005902336/1548187902083866685/showcase_5.png?format=webp&quality=lossless'],
  ['Merch Option 6', 'https://www.roblox.com/catalog/98534605362699', 'https://cdn.discordapp.com/attachments/1514190592005902336/1548187901689593937/showcase_6.png'],
  ['Merch Option 7', 'https://www.roblox.com/catalog/103277843862005', 'https://media.discordapp.net/attachments/1514190592005902336/1548187905401561118/showcase_7.png?format=webp&quality=lossless'],
  ['Merch Option 8', 'https://www.roblox.com/catalog/77219104173056', 'https://media.discordapp.net/attachments/1514190592005902336/1548187905112150066/showcase_8.png?format=webp&quality=lossless'],
  ['Merch Option 9', 'https://www.roblox.com/catalog/131536270919648', 'https://media.discordapp.net/attachments/1514190592005902336/1548187926985187358/showcase_9.png?format=webp&quality=lossless'],
  ['Merch Option 10', 'https://www.roblox.com/catalog/81670878466754', 'https://media.discordapp.net/attachments/1514190592005902336/1548187926695776276/showcase_10.png?format=webp&quality=lossless'],
  ['Merch Option 11', 'https://www.roblox.com/catalog/96134346149636', 'https://cdn.discordapp.com/attachments/1514190592005902336/1548187926402302053/showcase_11.png'],
  ['Merch Option 12', 'https://www.roblox.com/catalog/127040259392695', 'https://media.discordapp.net/attachments/1514190592005902336/1548187927694151771/showcase_12.png?format=webp&quality=lossless'],
  ['Merch Option 13', 'https://www.roblox.com/catalog/87762024299256', 'https://media.discordapp.net/attachments/1514190592005902336/1548187927379583066/showcase_13.png?format=webp&quality=lossless'],
];

function v2(container, ephemeral = false) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    allowedMentions: { parse: [] },
  };
}

export function buildMarketPanel() {
  const container = new ContainerBuilder().clearAccentColor();
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(MARKET_MERCH_BUTTON_ID)
        .setLabel('Server Merch')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setLabel('Marketplace TOS')
        .setStyle(ButtonStyle.Link)
        .setURL('https://docs.google.com/document/d/1z7-Y9gKRO6yTcyD2YogCeg_nDF71kzUagIHPFTOkMVU/edit?usp=sharing'),
    ),
  );
  return v2(container);
}

function buildMerchPage(options, page, totalPages) {
  const container = new ContainerBuilder().clearAccentColor();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `# Server Merch\nChoose **Purchase** beside an item to open its Roblox catalog page.\n-# Page ${page} of ${totalPages}`,
  ));
  for (const [label, url, image] of options) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${label}**\nPurchase →`))
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Purchase').setStyle(ButtonStyle.Link).setURL(url),
      ))
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(image),
      ));
  }
  if (page < totalPages) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(MARKET_NEXT_PAGE_ID)
          .setLabel('Next Page')
          .setStyle(ButtonStyle.Primary),
      ));
  }
  return v2(container, true);
}

export async function handleMarketInteraction(interaction) {
  if (!interaction.isButton?.()) return false;
  const pages = [MERCH_OPTIONS.slice(0, 7), MERCH_OPTIONS.slice(7)];
  if (interaction.customId === MARKET_MERCH_BUTTON_ID) {
    await interaction.reply(buildMerchPage(pages[0], 1, pages.length));
    return true;
  }
  if (interaction.customId === MARKET_NEXT_PAGE_ID) {
    await interaction.update(buildMerchPage(pages[1], 2, pages.length));
    return true;
  }
  return false;
}
