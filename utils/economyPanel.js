import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import { logger } from './logger.js';
import {
  ECONOMY_DEATH_FEE,
  ECONOMY_DEPARTMENTS,
  ECONOMY_JOB_PAY,
  ECONOMY_MIN_LEO,
  ECONOMY_PAY_INTERVAL_MS,
  ECONOMY_ROBBERIES,
  ECONOMY_STARTER_GRANT,
  ECONOMY_STEAL_DISTANCE,
  ECONOMY_STEAL_SUCCESS_CHANCE,
  ECONOMY_TRANSFER_TAX_PERCENT,
  departmentById,
  formatMoney,
  formatRemain,
  parseMoney,
  transferTaxAmount,
} from './economyConfig.js';
import {
  beginReservedRobbery,
  canManageDepartmentFunds,
  cancelRobbery,
  departmentSpend,
  getAllDepartmentsView,
  getDepartmentView,
  getOverview,
  getWalletView,
  handleDeposit,
  handleTransfer,
  handleWithdraw,
  jobViewFor,
  listUserTransactions,
  rememberPendingSend,
  robberyPanelState,
  startRobberyReservation,
  takePendingSend,
} from './economyService.js';
import { fetchErlcServer, parseErlcPlayer } from './erlc.js';

export const ECO_PANEL_CHANNEL_ID = '1545267006360649728';

export const ECO_BANNER_URL = 'https://media.discordapp.net/attachments/1514190592005902336/1552098947349225483/clearwater_ban.png?format=webp&quality=lossless';
export const ECO_FOOTER_URL = 'https://media.discordapp.net/attachments/1529616984755540088/1545833442040619018/clearwater_footer.png?format=webp&quality=lossless';

export const ECO_IDS = Object.freeze({
  send: 'eco:send',
  sendUser: 'eco:send:user',
  sendConfirm: 'eco:send:confirm',
  sendCancel: 'eco:send:cancel',
  sendModal: 'eco:modal:send',
  wallet: 'eco:wallet',
  deposit: 'eco:wallet:deposit',
  withdraw: 'eco:wallet:withdraw',
  depositModal: 'eco:modal:deposit',
  withdrawModal: 'eco:modal:withdraw',
  transactions: 'eco:transactions',
  robberies: 'eco:robberies',
  robberyBegin: 'eco:robbery:begin',
  robberyCancel: 'eco:robbery:cancel',
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
  dept911: 'eco:dept:dispatch',
  deptCpd: 'eco:dept:dispatch',
  deptCfr: 'eco:dept:cfr',
  deptBpd: 'eco:dept:bpd',
  deptAll: 'eco:dept:all',
  deptInfo: 'eco:dept:info',
});

const ROBBERY_BUTTONS = Object.freeze({
  [ECO_IDS.robberyBank]: 'bank',
  [ECO_IDS.robberyJewelry]: 'jewelry',
  [ECO_IDS.robberyHouse]: 'house',
  [ECO_IDS.robberyAtm]: 'atm',
  [ECO_IDS.robberyRegister]: 'register',
});

const DEPT_BUTTONS = Object.freeze({
  [ECO_IDS.deptFhp]: 'fhp',
  [ECO_IDS.deptPcso]: 'pcso',
  [ECO_IDS.dept911]: 'dispatch',
  [ECO_IDS.deptCpd]: 'dispatch',
  [ECO_IDS.deptCfr]: 'cfr',
  [ECO_IDS.deptBpd]: 'bpd',
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

function button(id, label, style = ButtonStyle.Secondary, { disabled = false } = {}) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(String(label || 'Open').slice(0, 80))
    .setStyle(style)
    .setDisabled(Boolean(disabled));
}

function featureSection(text, label, id, style = ButtonStyle.Secondary, extras = {}) {
  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .setButtonAccessory(button(id, label, style, extras));
}

function txLine(tx) {
  const when = tx.createdAt ? `<t:${Math.floor(new Date(tx.createdAt).getTime() / 1000)}:R>` : '';
  const after = tx.cashAfter != null
    ? ` · cash ${formatMoney(tx.cashAfter)} / bank ${formatMoney(tx.bankAfter)}`
    : (tx.deptAfter != null ? ` · treasury ${formatMoney(tx.deptAfter)}` : (tx.serverAfter != null ? ` · server ${formatMoney(tx.serverAfter)}` : ''));
  return `\`${tx.id}\` **${tx.type}** ${formatMoney(tx.amount)} ${when}${tx.note ? `\n${tx.note}` : ''}${after}`;
}

function amountModal(id, title) {
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle(title)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Amount')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('amount')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(12)
            .setPlaceholder('1000'),
        ),
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

function robberyHeadline(state) {
  const session = state?.session || { status: 'idle' };
  const now = Date.now();
  let status = 'AVAILABLE';
  let extra = '';
  if (state?.priorityBlocked) status = 'DISABLED';
  if (session.status === 'reserved' && now < Number(session.reservedUntil || 0)) {
    status = 'RESERVED';
    extra = ` **${formatRemain(session.reservedUntil - now)} REMAINING**`;
  } else if (session.status === 'active') {
    status = 'ACTIVE';
    extra = session.endsAt ? ` · survive ${formatRemain(session.endsAt - now)}` : '';
  } else if (Object.values(state?.reasons || {}).includes('NOT ENOUGH LEO')) {
    status = 'DISABLED';
  } else if (Object.values(state?.reasons || {}).includes('COOLDOWN')) {
    status = 'COOLDOWN';
  }
  return [
    `**Robbery status:** ${status}${extra}`,
    `**LEO online:** ${state?.leoCount ?? 0} / ${state?.minLeo || ECONOMY_MIN_LEO}`,
    state?.priorityBlocked ? 'A normal priority is already pending or active.' : '',
  ].filter(Boolean).join('\n');
}

export function buildRobberyPanel(state = null, { userId = '' } = {}) {
  const reasons = state?.reasons || {};
  const session = state?.session || { status: 'idle' };
  const mine = String(session.reservedBy || '') === String(userId);
  const container = new ContainerBuilder().clearAccentColor()
    .addMediaGalleryComponents(banner())
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# <:moneybag1:1545436887404122205> Robbery System',
      '<:DownArrow:1518386518387851425> Select a robbery below to begin. You must successfully survive the required time before receiving your payout.',
      '',
      robberyHeadline(state),
      '',
      '> **Important:** If you are killed, arrested, respawn, disconnect, or leave the server while participating in an active robbery, your payout will be forfeited.',
    ].join('\n')));

  for (const robbery of ECONOMY_ROBBERIES) {
    const buttonId = Object.entries(ROBBERY_BUTTONS).find(([, id]) => id === robbery.id)?.[0];
    const blocked = reasons[robbery.id] || '';
    const scene = robbery.sceneMs
      ? `Remain at the scene for at least **${formatRemain(robbery.sceneMs)}** after the robbery begins.`
      : 'None. Your survival timer begins as soon as the robbery call is sent.';
    let label = robbery.id === 'bank' ? 'Start Heist' : 'Start Robbery';
    let disabled = Boolean(blocked);
    if (blocked) label = blocked;
    if (session.status === 'reserved' && mine && robbery.id === session.kind) {
      label = 'Begin Robbery';
      disabled = false;
    }
    container
      .addSeparatorComponents(divider())
      .addSectionComponents(featureSection([
        `##  ${robbery.name}`,
        `**Payout:** \`${formatMoney(robbery.min)} - ${formatMoney(robbery.max)}\``,
        `**Scene Requirement:** ${scene}`,
        `**Survival Requirement:** **${formatRemain(robbery.survivalMs)}**`,
      ].join('\n'), label, buttonId, ButtonStyle.Secondary, { disabled }));
  }

  if (session.status === 'reserved' && mine) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      button(ECO_IDS.robberyBegin, 'Begin Robbery', ButtonStyle.Success),
      button(ECO_IDS.robberyCancel, 'Cancel Reservation', ButtonStyle.Danger),
    ));
  }

  container
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

function departmentFundsText(dept, row) {
  const spent = row?.spentThisWeek || 0;
  const payroll = row?.payrollThisWeek || 0;
  const fail = row?.lastPayrollFail && Date.now() - Number(row.lastPayrollFail.at || 0) < 6 * 60 * 60 * 1000
    ? `\n<:DownArrow:1518386518387851425> **INSUFFICIENT DEPARTMENT FUNDS** — could not pay ${formatMoney(row.lastPayrollFail.needed)}`
    : '';
  return [
    `## ${dept.emoji} ${dept.name}`,
    `<:DownArrow:1518386518387851425> **Available Funds:** \`${formatMoney(row?.balance || 0)}\``,
    `<:DownArrow:1518386518387851425> **Weekly Funding:** \`${formatMoney(dept.weeklyGrant)}\``,
    `<:DownArrow:1518386518387851425> **Payroll This Week:** \`${formatMoney(payroll)}\``,
    `<:DownArrow:1518386518387851425> **Spent This Week:** \`${formatMoney(spent)}\`${fail}`,
  ].join('\n');
}

export function buildDepartmentFundsPanel(views = null) {
  const payload = Array.isArray(views)
    ? { departments: views, server: { balance: 0, transactions: [] } }
    : (views && typeof views === 'object' && Array.isArray(views.departments)
      ? views
      : { departments: ECONOMY_DEPARTMENTS.map((dept) => ({ ...dept, row: { balance: 0, spentThisWeek: 0, payrollThisWeek: 0 } })), server: { balance: 0, transactions: [] } });
  const depts = payload.departments;
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
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '## Server Treasury',
      `<:DownArrow:1518386518387851425> **Available Funds:** \`${formatMoney(payload.server?.balance || 0)}\``,
      `<:DownArrow:1518386518387851425> **Source:** ${ECONOMY_TRANSFER_TAX_PERCENT}% tax on player-to-player sends`,
    ].join('\n')))
    .addSeparatorComponents(divider({ large: true }))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## Department Financial Overview\nThe information below displays the current financial status of each Clearwater department.',
    ));

  for (const dept of depts) {
    container.addSeparatorComponents(divider());
    if (dept.id === 'bpd') {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(departmentFundsText(dept, dept.row)));
    } else {
      container.addSectionComponents(featureSection(
        departmentFundsText(dept, dept.row),
        'Transactions',
        `eco:dept:${dept.id}`,
      ));
    }
  }

  container
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## <:moneybag1:1545436887404122205> Weekly Spending\n**Spent This Week** tracks payroll and other authorized spending since the beginning of the current week. Weekly grants run once per department per week.',
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button(ECO_IDS.deptAll, 'View Transactions'),
      button(ECO_IDS.deptInfo, 'Finance Information'),
    ))
    .addSeparatorComponents(divider({ visible: false }))
    .addMediaGalleryComponents(footer());
  return v2(container, { ephemeral: true });
}

function walletPanel(view, overview = null) {
  const user = view.user;
  const lines = (view.transactions || []).map(txLine);
  const job = overview?.job;
  const robbery = overview?.robbery;
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# Wallet',
      `**Cash:** ${formatMoney(user.cash)}`,
      `**Bank:** ${formatMoney(user.bank)}`,
      `**Total Balance:** ${formatMoney((user.cash || 0) + (user.bank || 0))}`,
      '',
      '**Economy Overview**',
      `Active job: ${job?.team || 'Off duty'}`,
      `Current shift: ${job?.elapsed ? formatRemain(job.elapsed) : '—'}`,
      `Next paycheck: ${job?.civilian ? formatRemain(job.nextIn) : '—'}`,
      `LEO online: ${overview?.leoOnline ?? 0} / ${ECONOMY_MIN_LEO}`,
      `Active priority: ${overview?.priorityStatus || 'none'}`,
      `Robbery status: ${robbery?.session?.status || 'idle'}`,
      user.frozen ? '\n**This account is frozen.**' : '',
    ].filter(Boolean).join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button(ECO_IDS.deposit, 'Deposit', ButtonStyle.Success),
      button(ECO_IDS.withdraw, 'Withdraw'),
    ))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## Recent Transactions\n${lines.length ? lines.join('\n\n') : 'No transactions yet.'}`,
    ));
  return v2(container, { ephemeral: true });
}

function sendPicker() {
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## Send Money\nSelect the Discord user who should receive cash from your wallet. Bank funds are not sent. A 5% tax is taken from the amount and returned to the server treasury.',
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(ECO_IDS.sendUser)
        .setPlaceholder('Select a recipient')
        .setMinValues(1)
        .setMaxValues(1),
    ));
  return v2(container, { ephemeral: true });
}

function sendReview(pending) {
  const tax = transferTaxAmount(pending.amount);
  const received = pending.amount - tax;
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '## Review Transfer',
      `**Recipient:** <@${pending.toId}>`,
      `**Amount:** ${formatMoney(pending.amount)} (from Cash)`,
      `**Send tax (${ECONOMY_TRANSFER_TAX_PERCENT}%):** ${formatMoney(tax)} to the server treasury`,
      `**Recipient receives:** ${formatMoney(received)}`,
      `**Note:** ${pending.note || 'None'}`,
      '',
      'Confirm to complete this transfer. This cannot be undone except by staff refund.',
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button(ECO_IDS.sendConfirm, 'Confirm', ButtonStyle.Success),
      button(ECO_IDS.sendCancel, 'Cancel', ButtonStyle.Danger),
    ));
  return v2(container, { ephemeral: true });
}

function transactionsPanel(rows, title = 'Transactions') {
  const lines = (rows || []).map((tx) => [
    txLine(tx),
    tx.fromId || tx.toId ? `From <@${tx.fromId || 'system'}> → <@${tx.toId || 'system'}>` : '',
    tx.referenceId ? `Ref \`${tx.referenceId}\`` : '',
  ].filter(Boolean).join('\n'));
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## ${title}\n${lines.length ? lines.join('\n\n') : 'No recent transactions.'}`,
    ));
  return v2(container, { ephemeral: true });
}

function morePanel() {
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '## More Features',
      `**Starter grant:** ${formatMoney(ECONOMY_STARTER_GRANT)} once per Discord user. Leaving and rejoining does not pay again.`,
      `**Death fee:** ${formatMoney(ECONOMY_DEATH_FEE)} from Cash when you actually die. Balances can go negative.`,
      `**Steal:** \`;steal\` on Civilian, closest civilian within ${ECONOMY_STEAL_DISTANCE} studs, ${ECONOMY_STEAL_SUCCESS_CHANCE}% chance. Only Cash can be stolen.`,
      `**Civilian jobs:** ${formatMoney(ECONOMY_JOB_PAY)} every ${Math.round(ECONOMY_PAY_INTERVAL_MS / 60000)} minutes while you stay on an actual job such as bank, not while unemployed on Civilian.`,
      '**Bank:** Deposit Cash to protect it from steals. Withdraw to spend or send.',
      `**Send tax:** ${ECONOMY_TRANSFER_TAX_PERCENT}% of every player-to-player send goes to the server treasury. The recipient gets the rest.`,
    ].join('\n')));
  return v2(container, { ephemeral: true });
}

function jobDetailPanel(job, title) {
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `## ${title}`,
      `**Current Job:** ${job.team || 'Off duty'}`,
      `**In game:** ${job.inGame ? 'Yes' : 'No'}`,
      `**Pay Rate:** ${formatMoney(job.rate)} / ${Math.round(ECONOMY_PAY_INTERVAL_MS / 60000)} minutes`,
      `**Current Shift Time:** ${job.elapsed ? formatRemain(job.elapsed) : '—'}`,
      `**Time Until Next Paycheck:** ${job.civilian ? formatRemain(job.nextIn) : 'Not on an eligible job'}`,
      `**Money Earned This Session:** ${formatMoney(job.sessionEarned || 0)}`,
      '',
      job.civilian
        ? 'Changing teams or leaving the job resets that job timer. Reconnecting does not duplicate pay.'
        : 'Unemployed Civilian does not pay. Clock into a civilian job such as bank to start the 10-minute paycheck timer.',
    ].join('\n')));
  return v2(container, { ephemeral: true });
}

function jobsInfoPanel(kind) {
  const bodies = {
    whitelisted: [
      '## Whitelisted Jobs',
      'Department jobs are paid from that department\'s treasury through Melonly shifts, not from generated civilian pay.',
      '',
      ...ECONOMY_DEPARTMENTS.map((dept) => `**${dept.name}** — ${formatMoney(dept.shiftPay)} / 10 minutes from treasury`),
    ].join('\n'),
    public: [
      '## Public Jobs',
      'Civilian / public ER:LC jobs (bank, delivery, taxi, and other working jobs) pay **$50 every 10 complete minutes** while you stay on that job.',
      'Just being on the Civilian team does not pay. You have to be on an actual job.',
      'Pay goes to **Cash**.',
    ].join('\n'),
    payouts: [
      '## Payout Information',
      `- Civilian job (bank, delivery, taxi, etc.): ${formatMoney(ECONOMY_JOB_PAY)} / 10 minutes into Cash`,
      '- Department Melonly shifts: paid from that department treasury at the department rate',
      '- Robberies: random Cash payout between the listed minimum and maximum after survival',
      `- Death fee: ${formatMoney(ECONOMY_DEATH_FEE)} from Cash`,
    ].join('\n'),
    how: [
      '## How Jobs Work',
      'The bot checks your live ER:LC job. Unemployed civilians are not paid. Eligible civilian jobs are tracked server-side.',
      'Every complete 10-minute interval on the same job pays once. Switching teams starts a new unpaid timer.',
      'Department payroll uses Melonly shift start/end, not the civilian job timer.',
    ].join('\n'),
  };
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodies[kind] || bodies.how));
  return v2(container, { ephemeral: true });
}

function departmentDetailPanel(dept, view, { manager = false } = {}) {
  const row = view.row || {};
  const lines = (view.transactions || []).map(txLine);
  const fail = row.lastPayrollFail
    ? `\n**INSUFFICIENT DEPARTMENT FUNDS** last failed paycheck ${formatMoney(row.lastPayrollFail.needed)} for <@${row.lastPayrollFail.discordId}>`
    : '';
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `## ${dept.emoji} ${dept.name}`,
      `**Current Balance:** ${formatMoney(row.balance || 0)}`,
      `**Weekly Funding:** ${formatMoney(dept.weeklyGrant)}`,
      `**Payroll Rate:** ${formatMoney(dept.shiftPay)} / 10 minutes`,
      `**Payroll Spent This Week:** ${formatMoney(row.payrollThisWeek || 0)}`,
      `**Other Spending This Week:** ${formatMoney(Math.max(0, (row.spentThisWeek || 0) - (row.payrollThisWeek || 0)))}`,
      `**Next Weekly Funding:** after week \`${row.weeklyGrantWeekKey || 'pending'}\``,
      fail,
      '',
      manager
        ? 'Department administrators can spend funds with `-funds spend @user <amount> <reason>` in this department Discord.'
        : 'Only department administrators can spend or manage these funds.',
      '',
      `## Recent Transactions\n${lines.length ? lines.join('\n\n') : 'No transactions yet.'}`,
    ].join('\n')));
  return v2(container, { ephemeral: true });
}

async function livePlayers(client) {
  const server = client?.config?.erlcServerKey
    ? await fetchErlcServer(client.config.erlcServerKey, { timeoutMs: 2_500 }).catch(() => null)
    : null;
  return (server?.Players || []).map((entry) => {
    const mapped = parseErlcPlayer(entry);
    if (entry?.username == null) return mapped;
    return { ...mapped, username: entry.username || mapped.username, job: entry.job || mapped.job };
  });
}

export async function handleEconomyInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('eco:')) return false;
  const client = interaction.client;

  if (interaction.isUserSelectMenu?.() && id === ECO_IDS.sendUser) {
    const toId = interaction.values?.[0];
    if (!toId || toId === interaction.user.id) {
      await interaction.reply({ content: 'Pick a different Discord user.', flags: MessageFlags.Ephemeral });
      return true;
    }
    rememberPendingSend(interaction.user.id, { toId, amount: 0, note: '' });
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(ECO_IDS.sendModal)
        .setTitle('Send Money')
        .addLabelComponents(
          new LabelBuilder().setLabel('Amount').setTextInputComponent(
            new TextInputBuilder().setCustomId('amount').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12),
          ),
          new LabelBuilder().setLabel('Note (optional)').setTextInputComponent(
            new TextInputBuilder().setCustomId('note').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120),
          ),
        ),
    );
    return true;
  }

  if (interaction.isModalSubmit?.()) {
    const amount = parseMoney(interaction.fields.getTextInputValue('amount'));
    if (!Number.isFinite(amount) || amount <= 0) {
      await interaction.reply({ content: 'Enter a valid amount greater than $0.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (id === ECO_IDS.depositModal) {
      const result = await handleDeposit(interaction.user.id, amount);
      await interaction.reply({
        content: `Deposited ${formatMoney(amount)} to Bank. Cash ${formatMoney(result.user.cash)} · Bank ${formatMoney(result.user.bank)} · \`${result.tx.id}\``,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (id === ECO_IDS.withdrawModal) {
      const result = await handleWithdraw(interaction.user.id, amount);
      await interaction.reply({
        content: `Withdrew ${formatMoney(amount)} to Cash. Cash ${formatMoney(result.user.cash)} · Bank ${formatMoney(result.user.bank)} · \`${result.tx.id}\``,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (id === ECO_IDS.sendModal) {
      const pending = takePendingSend(interaction.user.id);
      if (!pending?.toId) {
        await interaction.reply({ content: 'Select a recipient again.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const note = interaction.fields.getTextInputValue('note') || '';
      rememberPendingSend(interaction.user.id, { toId: pending.toId, amount, note });
      await interaction.reply(sendReview({ toId: pending.toId, amount, note }));
      return true;
    }
    return false;
  }

  if (!interaction.isButton?.()) return false;

  if (id === ECO_IDS.send) {
    await interaction.reply(sendPicker());
    return true;
  }
  if (id === ECO_IDS.sendCancel) {
    takePendingSend(interaction.user.id);
    await interaction.reply({ content: 'Transfer cancelled.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (id === ECO_IDS.sendConfirm) {
    const pending = takePendingSend(interaction.user.id);
    if (!pending?.toId || !pending.amount) {
      await interaction.reply({ content: 'That transfer expired. Start again from Send.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const result = await handleTransfer(interaction.user.id, pending.toId, pending.amount, pending.note);
    const tax = result.taxAmount || 0;
    await interaction.reply({
      content: [
        `Sent ${formatMoney(pending.amount)} to <@${pending.toId}>.`,
        tax ? `Server tax (${ECONOMY_TRANSFER_TAX_PERCENT}%): ${formatMoney(tax)}. They received ${formatMoney(result.received)}.` : `They received ${formatMoney(result.received ?? pending.amount)}.`,
        `Note: ${pending.note || 'None'}`,
        `Transaction: \`${result.outgoing.id}\` · Ref \`${result.referenceId}\``,
        `<t:${Math.floor(Date.now() / 1000)}:F>`,
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return true;
  }
  if (id === ECO_IDS.wallet) {
    const overview = await getOverview(interaction.user.id, client);
    await interaction.reply(walletPanel(overview.wallet, overview));
    return true;
  }
  if (id === ECO_IDS.deposit) {
    await interaction.showModal(amountModal(ECO_IDS.depositModal, 'Deposit Cash'));
    return true;
  }
  if (id === ECO_IDS.withdraw) {
    await interaction.showModal(amountModal(ECO_IDS.withdrawModal, 'Withdraw Bank'));
    return true;
  }
  if (id === ECO_IDS.transactions) {
    const rows = await listUserTransactions(interaction.user.id, 15);
    await interaction.reply(transactionsPanel(rows, 'Your Transactions'));
    return true;
  }
  if (id === ECO_IDS.more) {
    await interaction.reply(morePanel());
    return true;
  }
  if (id === ECO_IDS.robberies) {
    const state = await robberyPanelState(client);
    await interaction.reply(buildRobberyPanel(state, { userId: interaction.user.id }));
    return true;
  }
  if (id === ECO_IDS.robberyBegin) {
    const session = await beginReservedRobbery(client, interaction.user);
    await interaction.reply({
      content: `Robbery started. Survive until <t:${Math.floor(session.endsAt / 1000)}:t>. Failed robberies pay $0.`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (id === ECO_IDS.robberyCancel) {
    await cancelRobbery(client, 'player-cancel', interaction.user.id);
    await interaction.reply({ content: 'Robbery reservation cancelled.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (ROBBERY_BUTTONS[id]) {
    const robberyId = ROBBERY_BUTTONS[id];
    const state = await robberyPanelState(client);
    const session = state.session || {};
    if (session.status === 'reserved' && String(session.reservedBy) === interaction.user.id && session.kind === robberyId) {
      const started = await beginReservedRobbery(client, interaction.user);
      await interaction.reply({
        content: `Robbery started. Survive until <t:${Math.floor(started.endsAt / 1000)}:t>.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await startRobberyReservation(client, interaction.user, robberyId);
    const next = await robberyPanelState(client);
    await interaction.reply(buildRobberyPanel(next, { userId: interaction.user.id }));
    return true;
  }
  if (id === ECO_IDS.jobs) {
    await interaction.reply(buildJobsPanel());
    return true;
  }
  if (id === ECO_IDS.jobsMy || id === ECO_IDS.jobsPaychecks) {
    const job = await jobViewFor(interaction.user.id, await livePlayers(client));
    await interaction.reply(jobDetailPanel(job, id === ECO_IDS.jobsMy ? 'My Job' : 'Paychecks'));
    return true;
  }
  if (id === ECO_IDS.jobsWhitelisted) {
    await interaction.reply(jobsInfoPanel('whitelisted'));
    return true;
  }
  if (id === ECO_IDS.jobsPublic) {
    await interaction.reply(jobsInfoPanel('public'));
    return true;
  }
  if (id === ECO_IDS.jobsPayouts) {
    await interaction.reply(jobsInfoPanel('payouts'));
    return true;
  }
  if (id === ECO_IDS.jobsHow) {
    await interaction.reply(jobsInfoPanel('how'));
    return true;
  }
  if (id === ECO_IDS.departments) {
    await interaction.reply(buildDepartmentFundsPanel(await getAllDepartmentsView()));
    return true;
  }
  if (id === ECO_IDS.deptInfo) {
    await interaction.reply(jobsInfoPanel('whitelisted'));
    return true;
  }
  if (id === ECO_IDS.deptAll) {
    const views = await getAllDepartmentsView();
    const depts = Array.isArray(views) ? views : (views.departments || []);
    const rows = [
      ...(views.server?.transactions || []),
      ...depts.flatMap((dept) => dept.transactions || []),
    ].slice(0, 15);
    await interaction.reply(transactionsPanel(rows, 'Department Transactions'));
    return true;
  }
  if (DEPT_BUTTONS[id]) {
    const dept = departmentById(DEPT_BUTTONS[id]);
    const view = await getDepartmentView(dept.id);
    const manager = canManageDepartmentFunds(interaction.member, interaction.guildId);
    await interaction.reply(departmentDetailPanel(dept, view, { manager }));
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

export { departmentSpend };
