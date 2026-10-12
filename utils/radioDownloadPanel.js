import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import { logger } from './logger.js';
import { readUpdateCatalog } from './updateLog.js';

export const RADIO_DOWNLOAD_CHANNEL_ID = process.env.RADIO_DOWNLOAD_CHANNEL_ID?.trim() || '1558963608929435723';
/** Where the panel used to be; the bot's old copy there is removed once the new one is up. */
const OLD_DOWNLOAD_CHANNEL_IDS = ['1514190592005902336'];
/** Footer of the old embed panel, to find and remove it. */
const OLD_PANEL_FOOTER = 'Clearwater Radio for Windows';
/** Old "Get my radio key" button; kept so presses on stale copies get an answer. */
export const RADIO_KEY_BUTTON_ID = 'radio-app:key';
export const RADIO_UPDATE_LOG_BUTTON_ID = 'radio-app:updates';
export const RADIO_RELEASE_REPO = 'colin991/ClearwaterWebBot';
export const RADIO_DOWNLOAD_URL = `https://github.com/${RADIO_RELEASE_REPO}/releases/latest/download/ClearwaterRadio-Setup.exe`;
export const RADIO_WEBSITE_URL = 'https://www.cwpcso.com/radio';
/** The website's download page (version, size, checksum, then the installer). */
export const RADIO_DOWNLOAD_PAGE_URL = 'https://www.cwpcso.com/radio/download';
const REFRESH_MS = 2 * 60 * 1000;

/**
 * Banner at the top of the panel, sent as an attachment. Discord CDN links expire, so the first download is
 * kept in data/; a file committed at assets/clearwater-radio-banner.png is used before either.
 */
const BANNER_NAME = 'clearwater-radio-banner.png';
const BANNER_URL = process.env.RADIO_PANEL_BANNER_URL?.trim()
  || 'https://cdn.discordapp.com/attachments/1533940161497530468/1558949741675552788/clearwater_ban_1.png?ex=6acd4c96&is=6acbfb16&hm=bf7a8abb2513f96effe1ededd93380a5da4d742d8af11abaeaa9399e16ee2adc&';
const BANNER_FILES = [join(process.cwd(), 'assets', BANNER_NAME), join(process.cwd(), 'data', BANNER_NAME)];

const PANEL_TEXT = [
  '# <:CRP:1514421531844022352> Clearwater Radio',
  '',
  'We are proud to announce that our Developer <@1074411240757137589> has now made an Radio that you can access on your Desktop or your phone. ',
  '',
  'The reason this was made is for easy access to the radio, For Example if you are in an traffic stop and then your suspect runs off you can press your PTT key and give callouts. ',
  '',
  'Another example is that if your speaking to someone in an Frequency Change Channel talking to someone and then you get called to an call so you can respond and talk to the person in the FC Channel in till you get on scene.',
  '',
  '## How to install Clearwater Radio',
  '**1.** You must click the download link below to download the radio.',
  '**2.** After you installed it you must setup your PTT Key and set the size of your radio we suggest around 80%.',
  '**3.** After you setup your radio you will be redirected to discord authorization or may be told to sign in on the radio display so we can get your discord nickname for the Server for our system to function.',
  '**4.** Finally you can press the little **<:Settings:1514354007416504400> Settings** button and select your Microphone Input and your Listen Output aswell as change your PTT Key.',
  '',
  '## Important Information',
  '',
  'If you run MAC os or do not trust this download you can use our website but we **highly recommend that you use the radio unless you are on phone or MAC os**',
  '',
  'Finally If you see any bugs in our system click the bug reports link below to be taken to the site.',
].join('\n');

/** The panel message (Components V2). `banner` is true when the banner attachment is sent with it. */
export function buildRadioDownloadPanel({ banner = false } = {}) {
  const container = new ContainerBuilder();
  if (banner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${BANNER_NAME}`)),
    );
  }
  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(PANEL_TEXT))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Download Radio').setURL(RADIO_DOWNLOAD_PAGE_URL),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Radio Website').setURL(RADIO_WEBSITE_URL),
      new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('Update Log').setCustomId(RADIO_UPDATE_LOG_BUTTON_ID),
    ));
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

/** Text, labels, links and button ids of a panel, to tell whether a posted copy is current (images left out). */
export function panelSignature(components) {
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    const data = typeof node.toJSON === 'function' ? node.toJSON() : node;
    for (const key of ['content', 'label', 'url', 'custom_id']) if (typeof data[key] === 'string') parts.push(`${key}:${data[key]}`);
    for (const child of data.components || []) walk(child);
  };
  for (const component of components || []) walk(component);
  return parts.join('\n');
}

let bannerWarned = false;
async function loadBanner(fetchImpl = fetch) {
  for (const path of BANNER_FILES) {
    const saved = await readFile(path).catch(() => null);
    if (saved?.length) return saved;
  }
  try {
    const response = await fetchImpl(BANNER_URL, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const image = Buffer.from(await response.arrayBuffer());
    await writeFile(BANNER_FILES[1], image).catch((error) => logger.warn(`Could not keep the radio panel banner: ${error?.message || error}`));
    return image;
  } catch (error) {
    if (!bannerWarned) logger.warn(`Radio panel banner could not be downloaded (${error?.message || error}); posting without it.`);
    bannerWarned = true;
    return null;
  }
}

const isPanel = (message, client) => message.author?.id === client.user.id
  && panelSignature(message.components).includes(`custom_id:${RADIO_UPDATE_LOG_BUTTON_ID}`);

async function removeOldPanels(client) {
  for (const id of OLD_DOWNLOAD_CHANNEL_IDS) {
    if (id === RADIO_DOWNLOAD_CHANNEL_ID) continue;
    const channel = await client.channels.fetch(id).catch(() => null);
    const recent = channel?.messages ? await channel.messages.fetch({ limit: 50 }).catch(() => null) : null;
    for (const message of recent?.values?.() || []) {
      if (message.author?.id !== client.user.id) continue;
      if (message.embeds?.[0]?.footer?.text !== OLD_PANEL_FOOTER && !isPanel(message, client)) continue;
      await message.delete().then(() => logger.info('Removed the old Clearwater Radio download panel.')).catch(() => {});
    }
  }
}

export async function ensureRadioDownloadPanel(client) {
  const channel = await client.channels.fetch(RADIO_DOWNLOAD_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.messages) {
    logger.warn('Radio download channel is missing or not a text channel.');
    return;
  }
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = recent?.find((message) => isPanel(message, client));
  const wanted = panelSignature(buildRadioDownloadPanel().components);
  const current = existing && panelSignature(existing.components) === wanted;
  // Up to date, with its banner (or still no banner to add): nothing to do.
  if (current && existing.attachments?.size) return removeOldPanels(client);
  const image = await loadBanner();
  if (current && !image) return removeOldPanels(client);
  const payload = {
    ...buildRadioDownloadPanel({ banner: Boolean(image) }),
    files: image ? [new AttachmentBuilder(image, { name: BANNER_NAME })] : [],
  };
  if (existing) {
    await existing.edit({ ...payload, attachments: [] });
    logger.info('Updated the Clearwater Radio download panel.');
  } else {
    await channel.send(payload);
    logger.info('Posted the Clearwater Radio download panel.');
  }
  return removeOldPanels(client);
}

/** Keeps the download panel posted and current. */
export function startRadioDownloadPanel(client) {
  const run = () => {
    void ensureRadioDownloadPanel(client).catch((error) => {
      logger.error('Clearwater Radio download panel failed', error);
    });
  };
  const first = setTimeout(run, 2_000);
  const timer = setInterval(run, REFRESH_MS);
  timer.unref?.();
  first.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

/** The newest radio updates from the update catalog, for the Update Log button (fits one message). */
export function radioUpdateLogText(updates, limit = 5, now = Date.now()) {
  const radio = (updates || [])
    .filter((entry) => /radio/i.test(`${entry.id} ${entry.title}`))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
  if (!radio.length) return 'No radio updates yet.';
  const lines = ['## Clearwater Radio updates'];
  for (const entry of radio) {
    // Never "in 2 hours": an entry dated ahead of the clock shows as just now.
    const at = Math.floor(Math.min(Date.parse(entry.createdAt), now) / 1000);
    const short = String(entry.title).replace(/^Radio:\s*/i, '');
    const title = short.charAt(0).toUpperCase() + short.slice(1);
    lines.push('', `**${title}**${Number.isFinite(at) ? ` · <t:${at}:R>` : ''}`, entry.summary);
  }
  const text = lines.join('\n');
  if (text.length > 3900 && limit > 1) return radioUpdateLogText(radio, limit - 1, now);
  return text.slice(0, 3900);
}

export async function handleRadioDownloadInteraction(interaction) {
  if (!interaction.isButton?.()) return false;
  if (interaction.customId === RADIO_UPDATE_LOG_BUTTON_ID) {
    const { updates } = await readUpdateCatalog();
    await interaction.reply({
      components: [new TextDisplayBuilder().setContent(radioUpdateLogText(updates))],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return true;
  }
  if (interaction.customId !== RADIO_KEY_BUTTON_ID) return false;
  await interaction.reply({
    content: 'Radio keys are gone. Open the radio app and press the center button to **sign in with Discord**.',
    flags: MessageFlags.Ephemeral,
  });
  return true;
}
