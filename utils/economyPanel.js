import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { logger } from './logger.js';

export const ECO_PANEL_CHANNEL_ID = '1545267006360649728';

export const ECO_BANNER_URL = 'https://media.discordapp.net/attachments/1514190592005902336/1552098947349225483/clearwater_ban.png?format=webp&quality=lossless';
export const ECO_FOOTER_URL = 'https://media.discordapp.net/attachments/1529616984755540088/1545833442040619018/clearwater_footer.png?format=webp&quality=lossless';

export const ECO_IDS = Object.freeze({
  send: 'eco:send',
  wallet: 'eco:wallet',
  transactions: 'eco:transactions',
  robberies: 'eco:robberies',
  jobs: 'eco:jobs',
  departments: 'eco:departments',
  more: 'eco:more',
  robberyBank: 'eco:robbery:bank',
  robberyJewelry: 'eco:robbery:jewelry',
  robberyHouse: 'eco:robbery:house',
  robberyAtm: 'eco:robbery:atm',
  robberyRegister: 'eco:robbery:register',
  jobsMy: 'eco:jobs:my',
  jobsPaychecks: 'eco:jobs:paychecks',
  jobsWhitelisted: 'eco:jobs:whitelisted',
  jobsPublic: 'eco:jobs:public',
  jobsPayouts: 'eco:jobs:payouts',
  jobsHow: 'eco:jobs:how',
  deptFhp: 'eco:dept:fhp',
  deptPcso: 'eco:dept:pcso',
  dept911: 'eco:dept:911',
  deptCpd: 'eco:dept:cpd',
  deptCfr: 'eco:dept:cfr',
  deptAll: 'eco:dept:all',
  deptInfo: 'eco:dept:info',
});

function v2(container, { ephemeral = false } = {}) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    allowedMentions: { parse: [] },
  };
}

function banner() {
  return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(ECO_BANNER_URL));
}

function footer() {
  return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(ECO_FOOTER_URL));
}

function divider({ large = false, visible = true } = {}) {
  const separator = new SeparatorBuilder().setDivider(visible);
  if (large) separator.setSpacing(SeparatorSpacingSize.Large);
  return separator;
}

function button(id, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

function featureSection(text, label, id, style = ButtonStyle.Secondary) {
  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .setButtonAccessory(button(id, label, style));
}

function comingSoon(title) {
  return v2(
    new ContainerBuilder().clearAccentColor()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## ${title}\nThis economy feature is not wired up yet. The panel is in place so the rest of the system can be added next.`,
      )),
    { ephemeral: true },
  );
}

export function buildEconomyHomePanel() {
  const container = new ContainerBuilder().clearAccentColor()
    .addMediaGalleryComponents(banner())
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# <:money:1552072876184707122> Clearwater Economy',
      'Manage your money, earn cash through roleplay, and keep track of your financial activity throughout Clearwater Roleplay.',
      '',
      'Use the buttons below to access your wallet, transfer funds, review transactions, and explore additional economy features.',
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button(ECO_IDS.send, 'Send', ButtonStyle.Success),
      button(ECO_IDS.wallet, 'Wallet'),
      button(ECO_IDS.transactions, 'Transactions'),
    ))
    .addSeparatorComponents(divider({ large: true }))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## Economy Opportunities\nThere are several ways to earn and manage money throughout Clearwater. Choose an option below to learn more.',
    ))
    .addSeparatorComponents(divider())
    .addSectionComponents(featureSection([
      '## <:moneybag1:1545436887404122205> Robberies',
      '<:DownArrow:1518386518387851425> Looking to make money quickly? Participate in available robberies throughout the server for higher-risk, higher-reward payouts.',
      '',
      'Be prepared for law enforcement to respond and remember to follow all server rules while participating.',
    ].join('\n'), 'Click Here', ECO_IDS.robberies))
    .addSeparatorComponents(divider())
    .addSectionComponents(featureSection([
      '## <:newsletter:1545460416497451010> Jobs & Paychecks',
      '<:DownArrow:1518386518387851425> Earn money through roleplay by working different jobs across Clearwater.',
      '',
      'Both whitelisted and non-whitelisted members can participate in available jobs and receive payouts based on their roleplay.',
    ].join('\n'), 'Click Here', ECO_IDS.jobs))
    .addSeparatorComponents(divider())
    .addSectionComponents(featureSection([
      '## <:MP_Shield:1518377512839675944> Department Funds',
      '<:DownArrow:1518386518387851425> View your department\'s available balance and review its latest financial transactions.',
      '',
      'Department funds may be used for approved department purchases, operations, events, and other authorized expenses.',
    ].join('\n'), 'Click Here', ECO_IDS.departments))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '### <:configure:1514353566469324921> More Features\nExplore additional ways to earn, spend, and manage your money throughout Clearwater Roleplay.',
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button(ECO_IDS.more, 'More Features'),
    ))
    .addSeparatorComponents(divider({ visible: false }))
    .addMediaGalleryComponents(footer());
  return v2(container);
}

export function buildRobberyPanel() {
  const container = new ContainerBuilder().clearAccentColor()
    .addMediaGalleryComponents(banner())
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# <:moneybag1:1545436887404122205> Robbery System',
      '<:DownArrow:1518386518387851425> Select a robbery below to begin. You must successfully survive the required time before receiving your payout.',
      '',
      '> **Important:** If you are killed, arrested, respawn, disconnect, or leave the server while participating in an active robbery, your payout will be forfeited.',
    ].join('\n')))
    .addSeparatorComponents(divider())
    .addSectionComponents(featureSection([
      '##  Bank Heist',
      '**Payout:** `$6,500 - $10,000`',
      '**Scene Requirement:** Remain at the bank for at least **2 minutes** after the robbery call is sent.',
      '**Survival Requirement:** **15 minutes**',
    ].join('\n'), 'Start Heist', ECO_IDS.robberyBank))
    .addSeparatorComponents(divider())
    .addSectionComponents(featureSection([
      '##  Jewelry Store Robbery',
      '**Payout:** `$3,000 - $5,000`',
      '**Scene Requirement:** Remain at the jewelry store for at least **1 minute** after the robbery call is sent.',
      '**Survival Requirement:** **10 minutes**',
    ].join('\n'), 'Start Robbery', ECO_IDS.robberyJewelry))
    .addSeparatorComponents(divider())
    .addSectionComponents(featureSection([
      '##  House Robbery',
      '**Payout:** `$1,500 - $3,500`',
      '**Scene Requirement:** Remain near the house for at least **1 minute** after the robbery call is sent.',
      '**Survival Requirement:** **8 minutes**',
    ].join('\n'), 'Start Robbery', ECO_IDS.robberyHouse))
    .addSeparatorComponents(divider())
    .addSectionComponents(featureSection([
      '##  ATM Robbery',
      '**Payout:** `$700 - $2,000`',
      '**Scene Requirement:** None. Your survival timer begins as soon as the robbery call is sent.',
      '**Survival Requirement:** **7 minutes 30 seconds**',
    ].join('\n'), 'Start Robbery', ECO_IDS.robberyAtm))
    .addSeparatorComponents(divider())
    .addSectionComponents(featureSection([
      '##  Cash Register Robbery',
      '**Payout:** `$300 - $1,000`',
      '**Scene Requirement:** None. Your survival timer begins as soon as the robbery call is sent.',
      '**Survival Requirement:** **5 minutes**',
    ].join('\n'), 'Start Robbery', ECO_IDS.robberyRegister))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '### <:DownArrow:1518386518387851425> Robbery Guidelines',
      '- Only begin a robbery when you are ready to actively roleplay it.',
      '- Do not intentionally reset, respawn, or disconnect to avoid law enforcement.',
      '- Payouts are only awarded after the full survival requirement is completed.',
      '- Starting another robbery while one is already active may result in the new robbery being voided.',
      '- All Clearwater Roleplay rules remain in effect during robberies.',
      '-# GTA Driving in max **105** mph even in pursuits',
    ].join('\n')));
  return v2(container, { ephemeral: true });
}

export function buildJobsPanel() {
  const container = new ContainerBuilder().clearAccentColor()
    .addMediaGalleryComponents(banner())
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# <:newsletter:1545460416497451010> Jobs & Paychecks',
      'Earn money through roleplay by taking on different jobs throughout Clearwater Roleplay.',
      '',
      'Browse available jobs, view their requirements, check payout information, and learn how you can earn money while participating in the community.',
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button(ECO_IDS.jobsMy, 'My Job'),
      button(ECO_IDS.jobsPaychecks, 'Paychecks'),
    ))
    .addSeparatorComponents(divider({ large: true }))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## Job Opportunities\nChoose a job that fits your roleplay and start earning money throughout Clearwater. Job availability, requirements, and payouts may vary.',
    ))
    .addSeparatorComponents(divider())
    .addSectionComponents(featureSection([
      '## <:MP_Shield:1518377512839675944> Whitelisted Jobs',
      '<:DownArrow:1518386518387851425> Some jobs require you to be a member of an approved department or organization.',
    ].join('\n'), 'View Whitelisted', ECO_IDS.jobsWhitelisted))
    .addSeparatorComponents(divider())
    .addSectionComponents(featureSection([
      '## <:newsletter:1545460416497451010> Public Jobs',
      '<:DownArrow:1518386518387851425> Public jobs are available to members without requiring department membership.',
    ].join('\n'), 'View Public Jobs', ECO_IDS.jobsPublic))
    .addSeparatorComponents(divider())
    .addSectionComponents(featureSection([
      '## <:moneybag1:1545436887404122205> Payout Information',
      '<:DownArrow:1518386518387851425> Review how payouts are calculated for different jobs and roleplay activities.',
    ].join('\n'), 'View Payouts', ECO_IDS.jobsPayouts))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button(ECO_IDS.jobsHow, 'How it works?', ButtonStyle.Danger),
    ))
    .addSeparatorComponents(divider({ visible: false }))
    .addMediaGalleryComponents(footer());
  return v2(container, { ephemeral: true });
}

function departmentFundsText(emoji, name) {
  return [
    `## ${emoji} ${name}`,
    '<:DownArrow:1518386518387851425> **Available Funds:** `$25,000`',
    '<:DownArrow:1518386518387851425> **Pending Funds:** `$2,500`',
    '<:DownArrow:1518386518387851425> **Spent This Week:** `$4,250`',
  ].join('\n');
}

function departmentSection(emoji, name, id) {
  return featureSection(departmentFundsText(emoji, name), 'Transactions', id);
}

export function buildDepartmentFundsPanel() {
  const container = new ContainerBuilder().clearAccentColor()
    .addMediaGalleryComponents(banner())
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# <:MP_Shield:1518377512839675944> Department Funds',
      'Manage and monitor department finances throughout Clearwater Roleplay.',
      '',
      'View each department\'s available balance, pending funds, and spending activity for the current week.',
    ].join('\n')))
    .addSeparatorComponents(divider({ large: true }))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## Department Financial Overview\nThe information below displays the current financial status of each Clearwater department.',
    ))
    .addSeparatorComponents(divider())
    .addSectionComponents(departmentSection('<:FHP_Logo:1514421266776461314>', 'Florida Highway Patrol', ECO_IDS.deptFhp))
    .addSeparatorComponents(divider())
    .addSectionComponents(departmentSection('<:slogo:1546245229420744804>', 'Pinellas County Sheriff\'s Office', ECO_IDS.deptPcso))
    .addSeparatorComponents(divider())
    .addSectionComponents(departmentSection('<:dispatch:1522721479370870825>', 'Pinellas County 911 Center', ECO_IDS.dept911))
    .addSeparatorComponents(divider())
    .addSectionComponents(departmentSection('<:CFD:1514806304621989978>', 'Clearwater Fire & Rescue', ECO_IDS.deptCfr))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      departmentFundsText('<:bpd_logo:1535160817606074378>', 'Belleair Police Department'),
    ))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## <:moneybag1:1545436887404122205> Weekly Spending\n**Spent This Week** tracks the total amount each department has spent since the beginning of the current week.',
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button(ECO_IDS.deptAll, 'View Transactions'),
      button(ECO_IDS.deptInfo, 'Finance Information'),
    ))
    .addSeparatorComponents(divider({ visible: false }))
    .addMediaGalleryComponents(footer());
  return v2(container, { ephemeral: true });
}

const COMING_SOON = Object.freeze({
  [ECO_IDS.send]: 'Send',
  [ECO_IDS.wallet]: 'Wallet',
  [ECO_IDS.transactions]: 'Transactions',
  [ECO_IDS.more]: 'More Features',
  [ECO_IDS.robberyBank]: 'Bank Heist',
  [ECO_IDS.robberyJewelry]: 'Jewelry Store Robbery',
  [ECO_IDS.robberyHouse]: 'House Robbery',
  [ECO_IDS.robberyAtm]: 'ATM Robbery',
  [ECO_IDS.robberyRegister]: 'Cash Register Robbery',
  [ECO_IDS.jobsMy]: 'My Job',
  [ECO_IDS.jobsPaychecks]: 'Paychecks',
  [ECO_IDS.jobsWhitelisted]: 'Whitelisted Jobs',
  [ECO_IDS.jobsPublic]: 'Public Jobs',
  [ECO_IDS.jobsPayouts]: 'Payout Information',
  [ECO_IDS.jobsHow]: 'How Jobs Work',
  [ECO_IDS.deptFhp]: 'FHP Transactions',
  [ECO_IDS.deptPcso]: 'PCSO Transactions',
  [ECO_IDS.dept911]: '911 Center Transactions',
  [ECO_IDS.deptCpd]: '911 Center Transactions',
  [ECO_IDS.deptCfr]: 'CFR Transactions',
  [ECO_IDS.deptAll]: 'Department Transactions',
  [ECO_IDS.deptInfo]: 'Finance Information',
});

export async function handleEconomyInteraction(interaction) {
  if (!interaction.isButton?.()) return false;
  const id = String(interaction.customId || '');
  if (!id.startsWith('eco:')) return false;

  if (id === ECO_IDS.robberies) {
    await interaction.reply(buildRobberyPanel());
    return true;
  }
  if (id === ECO_IDS.jobs) {
    await interaction.reply(buildJobsPanel());
    return true;
  }
  if (id === ECO_IDS.departments) {
    await interaction.reply(buildDepartmentFundsPanel());
    return true;
  }
  const title = COMING_SOON[id];
  if (title) {
    await interaction.reply(comingSoon(title));
    return true;
  }
  return false;
}

export async function postEconomyPanel(client) {
  const channel = client.channels?.cache?.get(ECO_PANEL_CHANNEL_ID)
    || await client.channels?.fetch?.(ECO_PANEL_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error(`Economy channel \`${ECO_PANEL_CHANNEL_ID}\` is unavailable.`);
  }
  const sent = await channel.send(buildEconomyHomePanel());
  logger.info(`Economy panel posted in ${channel.id} (${sent.id}).`);
  return sent;
}
