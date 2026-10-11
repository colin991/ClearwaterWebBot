import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  UserSelectMenuBuilder,
} from 'discord.js';
import { logger } from './logger.js';
import { normalizeCoverage } from './radioCoverage.js';
import { normalizeAccess } from './radioMelonly.js';

/**
 * Clearwater Radio staff tools: the admin panel (/radio-staff: force-mute / kick off the radio) and the
 * panic history post. Only members with Administrator use the panel.
 */
export const RADIO_STAFF_PREFIX = 'radio-staff:';
export const RADIO_STAFF_PICK_ID = `${RADIO_STAFF_PREFIX}pick`;
export const RADIO_STAFF_REFRESH_ID = `${RADIO_STAFF_PREFIX}refresh`;
/** Kicked members can't sign back in to the radio for this long. */
export const RADIO_KICK_BLOCK_MS = 5 * 60 * 1000;
const PANEL_FOOTER = 'Clearwater Radio staff panel';
/** The same panel on the website, for admins signed in with Discord. */
export const RADIO_STAFF_URL = 'https://www.cwpcso.com/radio-staff';
export const RADIO_STAFF_ACTIONS = Object.freeze(['mute', 'unmute', 'kick']);
/** Website-only staff tools: warning pop-ups, shout-outs, the event channel and recordings. */
export const RADIO_STAFF_TOOLS = Object.freeze(['warn', 'shout', 'event-open', 'event-close', 'recordings', 'recording', 'ranks', 'access']);
export const RADIO_WARNING_MAX = 200;
export const RADIO_SHOUT_MAX = 200;

// radioBot.js registers the live relay controls here once the radio is running.
let controls = null;
export function setRadioStaffControls(next) {
  controls = next;
}

export function isRadioAdmin(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

export function buildRadioPanicEmbed(alert) {
  const at = Math.floor((alert.at || Date.now()) / 1000);
  const where = [alert.location, alert.postal ? `postal ${alert.postal}` : ''].filter(Boolean).join(' · ') || 'Unknown';
  return new EmbedBuilder()
    .setColor(0xc0261b)
    .setTitle('🚨 Radio panic')
    .addFields(
      { name: 'Who', value: `${alert.userId ? `<@${alert.userId}> · ` : ''}${alert.name || 'Unknown'}${alert.unit ? ` (${alert.unit})` : ''}`.slice(0, 1024) },
      { name: 'Where', value: String(where).slice(0, 1024) },
      { name: 'When', value: `<t:${at}:F> (<t:${at}:R>)` },
      { name: 'From', value: alert.source === 'radio' ? 'PANIC button on a radio' : 'In game (;panic or an ER:LC panic)' },
    );
}

/** The ephemeral panel: who is on the radio, who is muted, and actions for the picked member. */
export function buildRadioStaffPanel(selectedId = '') {
  const users = controls?.users() || [];
  const muted = new Set(controls?.muted || []);
  const embed = new EmbedBuilder().setColor(0x267bd7).setTitle('📻 Radio staff panel').setFooter({ text: PANEL_FOOTER });
  if (!controls) {
    embed.setDescription('The radio is not running on the bot host right now.');
    return { embeds: [embed], components: [] };
  }
  const online = users.length
    ? users.slice(0, 25).map((user) => `<@${user.userId}> · ${user.channelName}${user.muted ? ' · 🔇 muted' : ''}`).join('\n')
    : 'Nobody is on a radio.';
  const mutedOffline = [...muted].filter((id) => !users.some((user) => user.userId === id));
  embed.setDescription([
    `**On the radio now (${users.length})**`,
    online,
    mutedOffline.length ? `\n**Also muted (not on a radio)**\n${mutedOffline.map((id) => `<@${id}>`).join(', ')}` : '',
    '\nPick a member below to force-mute, unmute or kick them off the radio. A kick keeps them off for 5 minutes.',
  ].filter(Boolean).join('\n'));
  const rows = [new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder().setCustomId(RADIO_STAFF_PICK_ID).setPlaceholder('Pick a member').setMinValues(1).setMaxValues(1),
  )];
  const buttons = [];
  if (selectedId) {
    const user = users.find((entry) => entry.userId === selectedId);
    embed.addFields({
      name: 'Selected',
      value: `<@${selectedId}> · ${user ? `on ${user.channelName}` : 'not on a radio'} · ${muted.has(selectedId) ? '🔇 muted' : 'can talk'}`,
    });
    buttons.push(muted.has(selectedId)
      ? new ButtonBuilder().setCustomId(`${RADIO_STAFF_PREFIX}unmute:${selectedId}`).setLabel('Unmute').setStyle(ButtonStyle.Success)
      : new ButtonBuilder().setCustomId(`${RADIO_STAFF_PREFIX}mute:${selectedId}`).setLabel('Force mute').setStyle(ButtonStyle.Secondary));
    buttons.push(new ButtonBuilder().setCustomId(`${RADIO_STAFF_PREFIX}kick:${selectedId}`).setLabel('Kick off radio').setStyle(ButtonStyle.Danger));
  }
  buttons.push(new ButtonBuilder().setCustomId(selectedId ? `${RADIO_STAFF_REFRESH_ID}:${selectedId}` : RADIO_STAFF_REFRESH_ID).setLabel('Refresh').setStyle(ButtonStyle.Primary));
  buttons.push(new ButtonBuilder().setURL(RADIO_STAFF_URL).setLabel('Open on cwpcso.com').setStyle(ButtonStyle.Link));
  rows.push(new ActionRowBuilder().addComponents(buttons));
  return { embeds: [embed], components: rows };
}

/**
 * What the website panel shows: who is on the radio and who is muted. nameOf fills in names for
 * muted members who are not on a radio.
 */
export function radioStaffSnapshot(nameOf = () => '') {
  if (!controls) return { running: false, users: [], muted: [], coverage: normalizeCoverage({}), positions: [], flags: [], crashes: [], scenes: [], event: null, access: {}, melonly: false };
  const users = controls.users();
  const onRadio = new Set(users.map((user) => user.userId));
  return {
    running: true,
    users: users.map((user) => ({
      userId: user.userId,
      name: user.name || nameOf(user.userId) || 'Unknown',
      channel: user.channelName,
      muted: Boolean(user.muted),
      since: user.since || null,
      signal: user.signal ?? null,
      monitor: Boolean(user.monitor),
      label: user.label || '',
    })),
    muted: [...(controls.muted || [])].filter((id) => !onRadio.has(id)).map((id) => ({ userId: id, name: nameOf(id) || '' })),
    coverage: controls.coverage?.() || normalizeCoverage({}),
    positions: controls.positions?.() || [],
    // Flags for staff to look at, like a Civilian-team player on the police radio.
    flags: (controls.flags?.() || []).map((flag) => ({ ...flag, name: flag.name || nameOf(flag.userId) || 'Unknown' })),
    // Radio crash reports (desktop and web), newest first.
    crashes: (controls.crashes?.() || []).map((crash) => ({ ...crash, name: crash.name || nameOf(crash.userId) || 'Unknown' })),
    // Units in the scene / traffic stop voice channels and how long they've been there.
    scenes: (controls.scenes?.() || []).map((scene) => ({ ...scene })),
    event: controls.event?.() || null,
    // Rank-based channel access: { channelId: { ranks: ['deptId:rankId'] } }, and whether Melonly is set up.
    access: controls.access?.() || {},
    melonly: Boolean(controls.melonly?.()),
  };
}

/**
 * Force-mute, unmute or kick a member, then post it in the radio channel chat. Used by the Discord
 * panel and the website. Throws with a status when it can't be done.
 */
export async function runRadioStaffAction(action, userId, by, { from = '' } = {}) {
  const fail = (message, status) => Object.assign(new Error(message), { status });
  if (!RADIO_STAFF_ACTIONS.includes(action)) throw fail('Unknown action.', 400);
  if (!/^\d{15,22}$/.test(String(userId))) throw fail('Pick a member first.', 400);
  if (!controls) throw fail('The radio is not running on the bot host right now.', 503);
  const suffix = from ? ` (${from})` : '';
  let note;
  let closed = 0;
  if (action === 'kick') {
    closed = controls.kick(userId, by);
    note = `👢 <@${by}> kicked <@${userId}> off the radio for 5 minutes${closed ? '' : ' (they were not on a radio)'}${suffix}.`;
  } else {
    await controls.setMuted(userId, action === 'mute', by);
    note = action === 'mute'
      ? `🔇 <@${by}> force-muted <@${userId}> on the radio${suffix}.`
      : `🔊 <@${by}> unmuted <@${userId}> on the radio${suffix}.`;
  }
  logger.info(`Radio staff: ${action} ${userId} by ${by}${suffix}`);
  // Not awaited, so a slow Discord post never holds up the panel's reply.
  void Promise.resolve(controls.postStaff?.({ content: note, allowedMentions: { parse: [] } })).catch(() => {});
  return { ok: true, action, userId, closed };
}

/** Saves the coverage map from the website and notes it in the radio channel chat. */
export async function saveRadioCoverage(raw, by) {
  if (!controls?.setCoverage) throw Object.assign(new Error('The radio is not running on the bot host right now.'), { status: 503 });
  const saved = await controls.setCoverage(normalizeCoverage(raw), by);
  const towers = saved.towers.length;
  const zones = saved.zones.filter((zone) => zone.kind !== 'building').length;
  const buildings = saved.zones.length - zones;
  logger.info(`Radio staff: coverage saved by ${by} (${towers} towers, ${zones} weak areas, ${buildings} tunnels/garages, building interference ${saved.buildings ? 'on' : 'off'})`);
  const tunnels = buildings || saved.buildings
    ? `, ${buildings} tunnel${buildings === 1 ? '' : 's'}/garage${buildings === 1 ? '' : 's'} (building interference ${saved.buildings ? 'on' : 'off'})`
    : '';
  const note = `📡 <@${by}> updated radio coverage (website): ${towers} cell tower${towers === 1 ? '' : 's'}, ${zones} weak-signal area${zones === 1 ? '' : 's'}${tunnels}.`;
  void Promise.resolve(controls.postStaff?.({ content: note, allowedMentions: { parse: [] } })).catch(() => {});
  return saved;
}

/** Handles the panel's buttons and select; returns true when the interaction was the radio staff panel's. */
export async function handleRadioStaffInteraction(interaction) {
  const id = interaction.customId;
  if (typeof id !== 'string' || !id.startsWith(RADIO_STAFF_PREFIX)) return false;
  if (!isRadioAdmin(interaction)) {
    await interaction.reply({ content: 'Only admins can use the radio staff panel.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (id === RADIO_STAFF_PICK_ID && interaction.isUserSelectMenu?.()) {
    await interaction.update(buildRadioStaffPanel(interaction.values[0]));
    return true;
  }
  const [, action, userId = ''] = id.split(':');
  if (action === 'refresh') {
    await interaction.update(buildRadioStaffPanel(userId));
    return true;
  }
  if (!controls || !/^\d{15,22}$/.test(userId)) {
    await interaction.reply({ content: 'The radio is not running on the bot host right now.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!RADIO_STAFF_ACTIONS.includes(action)) return false;
  await runRadioStaffAction(action, userId, interaction.user.id);
  await interaction.update(buildRadioStaffPanel(userId));
  return true;
}

const cleanText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * The website's staff tools. Returns what the page needs; throws with a status when it can't.
 * warn: a pop-up on one unit's radio. shout: text read aloud on every radio. event-open / event-close:
 * the temporary event channel. recordings / recording: the last 24 hours of transmissions.
 */
export async function runRadioStaffTool(action, payload, by) {
  const fail = (message, status) => Object.assign(new Error(message), { status });
  if (!RADIO_STAFF_TOOLS.includes(action)) throw fail('Unknown action.', 400);
  if (!controls) throw fail('The radio is not running on the bot host right now.', 503);
  const note = (content) => { void Promise.resolve(controls.postStaff?.({ content, allowedMentions: { parse: [] } })).catch(() => {}); };

  if (action === 'warn') {
    const userId = String(payload?.userId || '');
    const text = cleanText(payload?.text, RADIO_WARNING_MAX);
    if (!/^\d{15,22}$/.test(userId)) throw fail('Pick a member first.', 400);
    if (!text) throw fail('Write the warning first.', 400);
    const sent = controls.warn?.(userId, text) || 0;
    if (!sent) throw fail('They are not on a radio right now.', 409);
    logger.info(`Radio staff: warning to ${userId} by ${by}`);
    note(`⚠️ <@${by}> sent <@${userId}> a radio warning (website): "${text}"`);
    return { ok: true, action, userId };
  }
  if (action === 'shout') {
    const text = cleanText(payload?.text, RADIO_SHOUT_MAX);
    if (!text) throw fail('Write the announcement first.', 400);
    controls.shout?.(text);
    logger.info(`Radio staff: shout-out by ${by}`);
    note(`📢 <@${by}> played an announcement on every radio (website): "${text}"`);
    return { ok: true, action };
  }
  if (action === 'event-open') {
    const opened = controls.openEvent?.(cleanText(payload?.name, 32), by);
    if (!opened) throw fail('The event channel is not available.', 503);
    logger.info(`Radio staff: event channel "${opened.name}" opened by ${by}`);
    note(`🎪 <@${by}> opened the event channel on the radio: **${opened.name}** (CH 6).`);
    return { ok: true, action, event: opened };
  }
  if (action === 'event-close') {
    const moved = controls.closeEvent?.() || 0;
    logger.info(`Radio staff: event channel closed by ${by} (${moved} moved to CH 1)`);
    note(`🎪 <@${by}> closed the event channel; ${moved} radio${moved === 1 ? '' : 's'} moved back to CH 1.`);
    return { ok: true, action, moved };
  }
  if (action === 'ranks') {
    // Melonly departments and their ranks, for the channel access picker.
    if (!controls.melonly?.()) throw fail('Melonly is not set up on the bot host (MELONLY_API_KEY).', 409);
    try {
      return { ok: true, action, departments: (await controls.catalog?.()) || [] };
    } catch (error) {
      logger.warn(`Radio staff: Melonly ranks failed (${error?.message || error})`);
      throw fail('Could not load the Melonly ranks. Try again shortly.', 503);
    }
  }
  if (action === 'access') {
    const saved = await controls.setAccess?.(normalizeAccess(payload?.access || {}), by);
    if (!saved) throw fail('The radio is not running on the bot host right now.', 503);
    const locked = Object.keys(saved);
    logger.info(`Radio staff: channel access saved by ${by} (${locked.join(', ') || 'all open'})`);
    note(`🔒 <@${by}> updated radio channel access (website): ${locked.length ? `${locked.length} channel${locked.length === 1 ? '' : 's'} limited by Melonly rank` : 'every channel open to everyone'}.`);
    return { ok: true, action, access: saved };
  }
  if (action === 'recordings') {
    const list = (await controls.recordings?.()) || [];
    return { ok: true, action, recordings: list.slice(0, 300) };
  }
  // recording: one transmission's audio, as base64 Ogg Opus for the page to play.
  const found = await controls.recording?.(String(payload?.id || ''));
  if (!found?.audio) throw fail('That recording is gone (they are kept for 24 hours).', 404);
  logger.info(`Radio staff: recording ${found.entry.id} played by ${by}`);
  return { ok: true, action, recording: found.entry, audio: found.audio.toString('base64'), type: 'audio/ogg' };
}
