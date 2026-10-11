import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { logger } from './logger.js';

export const RADIO_DOWNLOAD_CHANNEL_ID = process.env.RADIO_DOWNLOAD_CHANNEL_ID?.trim() || '1514190592005902336';
/** Old "Get my radio key" button; kept so presses on stale copies get an answer. */
export const RADIO_KEY_BUTTON_ID = 'radio-app:key';
export const RADIO_RELEASE_REPO = 'colin991/ClearwaterWebBot';
export const RADIO_RELEASE_TAG_PREFIX = 'radio-v';
export const RADIO_DOWNLOAD_URL = `https://github.com/${RADIO_RELEASE_REPO}/releases/latest/download/ClearwaterRadio-Setup.exe`;
const PANEL_FOOTER = 'Clearwater Radio for Windows';
const REFRESH_MS = 2 * 60 * 1000;

/** The update feed installed radios read; using it keeps the embed and the apps on the same version. */
export const RADIO_UPDATE_FEED_URL = `https://github.com/${RADIO_RELEASE_REPO}/releases/latest/download/latest.yml`;

/**
 * Newest published Clearwater Radio release, or null when none exists yet.
 * Reads latest.yml (not the GitHub API) so it is never rate-limited on shared hosts.
 */
export async function fetchLatestRadioRelease(fetchImpl = fetch) {
  const response = await fetchImpl(`${RADIO_UPDATE_FEED_URL}?t=${Date.now()}`, {
    headers: { 'User-Agent': 'clearwater-bot', 'Cache-Control': 'no-cache' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Radio update feed returned ${response.status}`);
  const text = await response.text();
  const version = text.match(/^version:\s*['"]?([0-9][\w.-]*)['"]?\s*$/m)?.[1];
  if (!version) return null;
  const releaseDate = text.match(/^releaseDate:\s*['"]?([^'"\n]+)['"]?\s*$/m)?.[1] || null;
  return { version, publishedAt: releaseDate };
}

export function buildRadioDownloadPanel(release) {
  const published = release?.publishedAt ? Math.floor(Date.parse(release.publishedAt) / 1000) : null;
  const versionLine = release
    ? `**Latest version:** ${release.version}${published ? ` (released <t:${published}:R>)` : ''}`
    : '**Latest version:** the first build is being published. Check back soon.';
  const embed = new EmbedBuilder()
    .setColor(0x267bd7)
    .setTitle('📻 Clearwater Radio')
    .setDescription([
      'A radio overlay that sits on top of your game and talks through the radio bot in <#1514128904783139018>.',
      '',
      versionLine,
      '',
      '**Setup**',
      '1. Press **Download for Windows** and run the installer.',
      '2. Open the radio and press the center button to **sign in with Discord**.',
      '3. Press the gray button on the left for **MENU** and set your **MIC**, **LISTEN** (speakers or headset) and **PTT** key, then use **SETUP → TEST** to hear yourself.',
      '',
      'Only members of the Clearwater Discord server can use the radio. It checks every 5 minutes and closes if you leave the server or lose access to the radio channel.',
      '',
      'The app updates itself when a new version comes out. If Windows SmartScreen warns you, press **More info → Run anyway**.',
    ].join('\n'))
    .setFooter({ text: PANEL_FOOTER });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Download for Windows').setURL(RADIO_DOWNLOAD_URL),
  );
  return { embeds: [embed], components: [row] };
}

function embedSummary(embeds) {
  return JSON.stringify((embeds || []).map((embed) => {
    const data = typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
    return { title: data.title, description: data.description, footer: data.footer?.text };
  }));
}

export async function ensureRadioDownloadPanel(client) {
  const channel = await client.channels.fetch(RADIO_DOWNLOAD_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.messages) {
    logger.warn('Radio download channel is missing or not a text channel.');
    return;
  }
  let release = null;
  try {
    release = await fetchLatestRadioRelease();
  } catch (error) {
    logger.warn(`Could not read Clearwater Radio releases: ${error?.message || error}`);
  }
  const payload = buildRadioDownloadPanel(release);
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = recent?.find((message) => message.author?.id === client.user.id
    && message.embeds?.[0]?.footer?.text === PANEL_FOOTER);
  if (!existing) {
    await channel.send(payload);
    logger.info('Posted the Clearwater Radio download panel.');
    return;
  }
  if (embedSummary(existing.embeds) !== embedSummary(payload.embeds) || existing.components?.[0]?.components?.length !== 1) {
    await existing.edit(payload);
    logger.info('Updated the Clearwater Radio download panel.');
  }
}

/** Keeps the download embed posted and its version line current. */
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

export async function handleRadioDownloadInteraction(interaction) {
  if (!interaction.isButton?.() || interaction.customId !== RADIO_KEY_BUTTON_ID) return false;
  await interaction.reply({
    content: 'Radio keys are gone. Open the radio app and press the center button to **sign in with Discord**.',
    flags: MessageFlags.Ephemeral,
  });
  return true;
}
