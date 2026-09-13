import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PINELLAS_EMPLOYEE_WELCOME_ROLE_ID,
  PINELLAS_GUILD_ID,
} from './pinellasServer.js';
import { logger } from './logger.js';

export const PINELLAS_APPLY_CHANNEL_ID = '1514443793607295058';
export const PINELLAS_APPLY_REVIEW_CHANNEL_ID = '1546250122713767966';
export const PINELLAS_APPLY_APPROVED_ROLE_ID = '1514362658227490989';
/** Role pinged in the review channel when an application is submitted. */
export const PINELLAS_APPLY_REVIEW_PING_ROLE_ID = '1514361105244356639';

export const PINELLAS_APPLY_START_ID = 'pinellas:apply:start';
export const PINELLAS_APPLY_OPEN_ID = 'pinellas:apply:open';
export const PINELLAS_APPLY_APPROVE_PREFIX = 'pinellas:apply:approve:';
export const PINELLAS_APPLY_DENY_PREFIX = 'pinellas:apply:deny:';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = path.join(ROOT, 'data', 'pinellas-applications.json');
const BANNER_PATH = path.join(ROOT, 'assets', 'pcso-application-banner.png');
const FOOTER_PATH = path.join(ROOT, 'assets', 'pcso-application-footer.png');

const SAVE_EMOJI = '<:Save:1517217415098798280>';
const ARROW_EMOJI = { id: '1517217487165460591', name: 'rightarrow' };

const DENY_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
const ANSWER_TIMEOUT_MS = 20 * 60 * 1000;
/** Discord Components V2: total Text Display content across a message must stay under 4000. */
const V2_DISPLAYABLE_TEXT_BUDGET = 3900;

/** @type {Map<string, { applicationId: string, index: number, answers: string[], updatedAt: number }>} */
const activeSessions = new Map();

function memberHasRole(member, roleId) {
  if (member?.roles?.cache?.has?.(roleId)) return true;
  if (Array.isArray(member?.roles)) return member.roles.map(String).includes(roleId);
  return false;
}

/** Review access comes from staff permissions or the designated PCSO employee role. */
export function memberCanReviewPinellasApplications(member, permissions = member?.permissions) {
  return Boolean(
    memberHasRole(member, PINELLAS_EMPLOYEE_WELCOME_ROLE_ID)
    || permissions?.has?.(PermissionFlagsBits.Administrator)
    || permissions?.has?.(PermissionFlagsBits.ManageRoles),
  );
}

export const PINELLAS_APPLY_QUESTIONS = Object.freeze([
  { key: 'roblox', prompt: '**1.** What is your Roblox username?', writing: false },
  { key: 'age', prompt: '**2.** How old are you? *(Required, but does not affect results.)*', writing: false },
  { key: 'why', prompt: '**3.** Why do you wish to join the Pinellas County Sheriff\'s Office?', writing: true },
  { key: 'activity', prompt: '**4.** How active do you plan to be on a scale of **1-10**?', writing: false, scale: true },
  { key: 'tenCodes', prompt: '**5.** How well do you know your 10 codes on a scale from **1-10**?', writing: false, scale: true },
  { key: 'speeding', prompt: '**6.** You witness a vehicle drive by you going **15 miles per hour** over the speed limit. What do you do?', writing: true },
  { key: 'robbery', prompt: '**7.** You are the first to arrive on scene of an active robbery in progress and the suspects seem to be getting ready to make an escape. What are your next steps as you wait for backup to arrive?', writing: true },
  { key: 'crash', prompt: '**8.** You are driving down Colonial Drive and witness **2 vehicles** crash into each other. What are your next steps?', writing: true },
  { key: 'neighbors', prompt: '**9.** You are driving by someone\'s home and witness a heated argument going down between **2 neighbors**. What do you do?', writing: true },
  { key: 'plate', prompt: '**10.** You search up a parked vehicle\'s plate in CAD and realize it is **unregistered**. What are your next steps?', writing: true },
  { key: 'noAsk', prompt: '**11.** Do you understand that asking someone to review your application will result in an **immediate fail**? (Yes/No)', writing: false, yesNo: true },
  { key: 'training', prompt: '**12.** Do you understand that you will have to complete a **training** and **R/A** after approval? (Yes/No)', writing: false, yesNo: true },
]);

const REQUIREMENTS_BODY = [
  'Before you begin, confirm you meet these requirements:',
  '',
  '• Have a sense of **maturity**.',
  '• Use **2+ sentences** on all questions that require writing.',
  '• **DO NOT** use any form of artificial intelligence.',
  '• Must **not** be in FHP inside of Clearwater Roleplay.',
  '• Must be okay with completing the **training** and **R/A** after approval.',
  '',
  'Reply in this DM with your answer to each question. After you send an answer, I will send the next question. Type `cancel` anytime to stop.',
].join('\n');

function newId() {
  return randomBytes(6).toString('hex');
}

async function readStore() {
  try {
    const store = JSON.parse(await readFile(STORE_PATH, 'utf8'));
    return {
      applications: Array.isArray(store.applications) ? store.applications : [],
      denials: store.denials && typeof store.denials === 'object' ? store.denials : {},
      sessions: store.sessions && typeof store.sessions === 'object' ? store.sessions : {},
    };
  } catch {
    return { applications: [], denials: {}, sessions: {} };
  }
}

async function writeStore(store) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

async function persistSession(userId, session) {
  const store = await readStore();
  store.sessions = store.sessions || {};
  if (session) {
    store.sessions[userId] = {
      applicationId: session.applicationId,
      index: session.index,
      answers: session.answers,
      updatedAt: session.updatedAt,
    };
    activeSessions.set(userId, store.sessions[userId]);
  } else {
    delete store.sessions[userId];
    activeSessions.delete(userId);
  }
  await writeStore(store);
}

async function loadSession(userId) {
  const cached = activeSessions.get(userId);
  if (cached) return cached;

  const store = await readStore();
  const session = store.sessions?.[userId];
  if (!session) return null;

  if (Date.now() - Number(session.updatedAt || 0) > ANSWER_TIMEOUT_MS) {
    await persistSession(userId, null);
    return null;
  }

  activeSessions.set(userId, session);
  return session;
}

async function sendDmQuestion(target, question, index) {
  const payload = questionPayload(question, index, PINELLAS_APPLY_QUESTIONS.length);
  try {
    if (typeof target.reply === 'function') {
      return await target.reply(payload);
    }
    return await target.send(payload);
  } catch (error) {
    logger.error('Pinellas apply: failed to send question DM', error);
    if (target.channel?.send) {
      return target.channel.send(payload);
    }
    if (typeof target.send === 'function') {
      return target.send(payload);
    }
    throw error;
  }
}

function sentenceCount(text) {
  return String(text || '')
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function validateAnswer(question, raw) {
  const text = String(raw || '').trim();
  if (!text) return { ok: false, error: 'Please send a non-empty answer.' };
  if (text.length > 1800) return { ok: false, error: 'Keep each answer under 1800 characters.' };

  if (question.scale) {
    const value = Number.parseInt(text, 10);
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      return { ok: false, error: 'Reply with a whole number from **1** to **10**.' };
    }
    return { ok: true, value: String(value) };
  }

  if (question.yesNo) {
    const normalized = text.toLowerCase();
    if (/^(n|no|nope)$/i.test(normalized)) {
      return { ok: false, error: 'You must answer **Yes** to continue this application.' };
    }
    if (!/^(y|yes|yeah|yep|yea)$/i.test(normalized)) {
      return { ok: false, error: 'Please answer **Yes** or **No**.' };
    }
    return { ok: true, value: 'Yes' };
  }

  if (question.writing && sentenceCount(text) < 2) {
    return { ok: false, error: 'Please use **at least 2 sentences** for this writing question.' };
  }

  return { ok: true, value: text };
}

function v2Payload(decorate, { files, ephemeral = false, allowedMentions } = {}) {
  const container = new ContainerBuilder().clearAccentColor();
  decorate(container);
  let flags = MessageFlags.IsComponentsV2;
  if (ephemeral) flags |= MessageFlags.Ephemeral;
  const payload = { components: [container], flags };
  if (files?.length) payload.files = files;
  if (allowedMentions) payload.allowedMentions = allowedMentions;
  return payload;
}

function dmCard(title, body) {
  return v2Payload((container) => {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${SAVE_EMOJI} **${title}**\n\n${body}`),
    );
  });
}

function questionPayload(question, index, total) {
  return v2Payload((container) => {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `${SAVE_EMOJI} **Question ${index + 1}/${total}**`,
        '',
        question.prompt,
        question.writing ? '\n-# Reminder: use **2+ sentences**. Do not use AI.' : '',
      ].filter(Boolean).join('\n')),
    );
  });
}

async function loadPanelFiles() {
  const files = [];
  const available = new Set();
  const assets = [
    [BANNER_PATH, 'pcso-application-banner.png'],
    [FOOTER_PATH, 'pcso-application-footer.png'],
  ];

  for (const [filePath, name] of assets) {
    try {
      const buffer = await readFile(filePath);
      files.push(new AttachmentBuilder(buffer, { name }));
      available.add(name);
    } catch (error) {
      logger.warn(
        `Pinellas apply: optional artwork ${name} is unavailable; posting the panel without it (${error?.message || error}).`,
      );
    }
  }

  return { files, available };
}

export async function buildPinellasApplyPanel() {
  const { files, available } = await loadPanelFiles();
  return v2Payload((container) => {
    if (available.has('pcso-application-banner.png')) {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL('attachment://pcso-application-banner.png'),
        ),
      );
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      );
    }

    container
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
          `# ${SAVE_EMOJI} Entry Application`,
          '> Be the change you want to see in your county! Ever been interested in becoming a Deputy? We are seeking members to join our ranks and help maintain peace and prosperity experience for our citizens, whether new to the experience or an veteran enforcement officer, we want you!',
        ].join('\n')),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(PINELLAS_APPLY_START_ID)
            .setLabel('Start Entry Process')
            .setEmoji(ARROW_EMOJI)
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(PINELLAS_APPLY_OPEN_ID)
            .setLabel('Applications Open')
            .setEmoji(ARROW_EMOJI)
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
      );

    if (available.has('pcso-application-footer.png')) {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL('attachment://pcso-application-footer.png'),
        ),
      );
    }
  }, { files });
}

export async function postPinellasApplyPanel(client) {
  const channel = await client.channels.fetch(PINELLAS_APPLY_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error(`Could not access apply channel \`${PINELLAS_APPLY_CHANNEL_ID}\`.`);
  }
  return channel.send(await buildPinellasApplyPanel());
}

async function beginApplicationSession(user) {
  const store = await readStore();
  const deniedUntil = Number(store.denials?.[user.id] || 0);
  if (deniedUntil > Date.now()) {
    const when = Math.floor(deniedUntil / 1000);
    throw new Error(`You can re-apply after <t:${when}:R> (<t:${when}:f>).`);
  }

  const existingPending = (store.applications || []).find(
    (entry) => entry.userId === user.id && entry.status === 'pending',
  );
  if (existingPending) {
    throw new Error('You already have a pending application under review.');
  }
  const existingSession = await loadSession(user.id);
  if (existingSession) {
    throw new Error('You already have an application in progress in DMs. Finish it or type `cancel`.');
  }

  const applicationId = newId();
  const session = {
    applicationId,
    index: 0,
    answers: [],
    updatedAt: Date.now(),
  };
  await persistSession(user.id, session);

  await user.send(dmCard('Entry Application', REQUIREMENTS_BODY));
  await sendDmQuestion(user, PINELLAS_APPLY_QUESTIONS[0], 0);
  return applicationId;
}

async function submitApplication(client, user, session) {
  const store = await readStore();
  const answers = PINELLAS_APPLY_QUESTIONS.map((question, index) => ({
    key: question.key,
    prompt: question.prompt,
    answer: session.answers[index] || '—',
  }));

  const application = {
    id: session.applicationId,
    userId: user.id,
    username: user.username,
    status: 'pending',
    answers,
    createdAt: new Date().toISOString(),
  };
  store.applications = [application, ...(store.applications || [])].slice(0, 500);
  if (store.sessions) delete store.sessions[user.id];
  await writeStore(store);
  activeSessions.delete(user.id);

  const reviewChannel = await client.channels.fetch(PINELLAS_APPLY_REVIEW_CHANNEL_ID).catch(() => null);
  if (!reviewChannel?.isTextBased?.()) {
    throw new Error('Review channel is unavailable. Your answers were saved — contact staff.');
  }

  const header = [
    `# ${SAVE_EMOJI} Application Review`,
    `<@&${PINELLAS_APPLY_REVIEW_PING_ROLE_ID}> — new entry application ready for review.`,
    `Applicant: <@${user.id}> (\`${user.id}\` / **${user.username}**)`,
    `Application ID: \`${application.id}\``,
  ].join('\n');

  const answersText = answers.map((entry, index) => (
    `**${index + 1}.** ${entry.prompt.replace(/^\*\*\d+\.\*\*\s*/, '')}\n${entry.answer}`
  )).join('\n\n');

  const transcriptName = `application-${application.id}.txt`;
  const transcriptBody = [
    'Pinellas County Sheriff\'s Office — Entry Application',
    `Application ID: ${application.id}`,
    `Applicant: ${user.username} (${user.id})`,
    `Submitted: ${application.createdAt}`,
    '',
    answers.map((entry, index) => (
      `${index + 1}. ${entry.prompt.replace(/^\*\*\d+\.\*\*\s*/, '')}\n${entry.answer}`
    )).join('\n\n'),
  ].join('\n');

  const attachNote = `\n\n-# Full answers are in the attached \`${transcriptName}\`.`;
  const answersBudget = Math.max(0, V2_DISPLAYABLE_TEXT_BUDGET - header.length);
  let preview = answersText;
  if (preview.length > answersBudget) {
    const room = Math.max(0, answersBudget - attachNote.length);
    preview = `${preview.slice(0, room)}${attachNote}`;
  }

  // Always attach the transcript so long writing answers never blow the V2 text budget.
  const files = [
    new AttachmentBuilder(Buffer.from(transcriptBody, 'utf8'), { name: transcriptName }),
  ];

  const payload = v2Payload((container) => {
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(preview || '\u200b'))
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addFileComponents(new FileBuilder().setURL(`attachment://${transcriptName}`))
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${PINELLAS_APPLY_APPROVE_PREFIX}${application.id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${PINELLAS_APPLY_DENY_PREFIX}${application.id}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger),
        ),
      );
  }, {
    files,
    allowedMentions: {
      parse: [],
      roles: [PINELLAS_APPLY_REVIEW_PING_ROLE_ID],
      users: [user.id],
    },
  });

  await reviewChannel.send(payload);
  await user.send(dmCard(
    'Application Submitted',
    [
      'Thank you for submitting your application! It will be reviewed shortly by command staff.',
      'In the mean time feel free to talk with our employees in general and maybe ask them what it\'s like to be a deputy for PCSO.',
    ].join('\n'),
  ));
}

export async function handlePinellasApplyInteraction(interaction) {
  if (!interaction.isButton()) return false;
  const id = interaction.customId || '';

  if (id === PINELLAS_APPLY_OPEN_ID) {
    await interaction.reply({
      content: 'Applications are currently open.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
    return true;
  }

  if (id === PINELLAS_APPLY_START_ID) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await beginApplicationSession(interaction.user);
      await interaction.editReply({
        content: 'I opened your entry application in DMs. Check your Direct Messages to continue.',
      });
    } catch (error) {
      const message = String(error?.message || error);
      if (/Cannot send messages to this user|DM/i.test(message)) {
        await interaction.editReply({
          content: 'I could not DM you. Please enable **Direct Messages from server members**, then try again.',
        });
        return true;
      }
      await interaction.editReply({ content: message.slice(0, 1800) });
    }
    return true;
  }

  if (id.startsWith(PINELLAS_APPLY_APPROVE_PREFIX) || id.startsWith(PINELLAS_APPLY_DENY_PREFIX)) {
    const approve = id.startsWith(PINELLAS_APPLY_APPROVE_PREFIX);
    const applicationId = id.slice(
      (approve ? PINELLAS_APPLY_APPROVE_PREFIX : PINELLAS_APPLY_DENY_PREFIX).length,
    );

    if (!memberCanReviewPinellasApplications(interaction.member, interaction.memberPermissions)) {
      await interaction.reply({
        content: `You need **Administrator**, **Manage Roles**, or <@&${PINELLAS_EMPLOYEE_WELCOME_ROLE_ID}> to review applications.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const store = await readStore();
    const application = (store.applications || []).find((entry) => entry.id === applicationId);
    if (!application) {
      await interaction.editReply({ content: 'That application was not found.' });
      return true;
    }
    if (application.status !== 'pending') {
      await interaction.editReply({ content: `This application was already **${application.status}**.` });
      return true;
    }

    application.status = approve ? 'approved' : 'denied';
    application.reviewedAt = new Date().toISOString();
    application.reviewedBy = interaction.user.id;

    const guild = interaction.client.guilds.cache.get(PINELLAS_GUILD_ID)
      || await interaction.client.guilds.fetch(PINELLAS_GUILD_ID).catch(() => null);
    const member = guild
      ? await guild.members.fetch(application.userId).catch(() => null)
      : null;
    const user = await interaction.client.users.fetch(application.userId).catch(() => null);

    if (approve) {
      if (member) {
        await member.roles.add(
          PINELLAS_APPLY_APPROVED_ROLE_ID,
          `Pinellas application approved by ${interaction.user.tag}`,
        ).catch((error) => {
          logger.error('Pinellas apply: failed to add approved role', error);
        });
      }
      if (user) {
        await user.send(dmCard(
          'Application Approved',
          [
            'Congratulations — your Pinellas County Sheriff\'s Office entry application was **approved**.',
            '',
            'You have been given your department role. Complete your **training** and **R/A** as directed by command staff.',
            '',
            `-# Reviewed by ${interaction.user.tag}`,
          ].join('\n'),
        )).catch(() => null);
      }
    } else {
      store.denials = store.denials || {};
      store.denials[application.userId] = Date.now() + DENY_COOLDOWN_MS;
      if (user) {
        const until = Math.floor(store.denials[application.userId] / 1000);
        await user.send(dmCard(
          'Application Denied',
          [
            'Your Pinellas County Sheriff\'s Office entry application was **denied**.',
            '',
            `You may re-apply after **3 days** (<t:${until}:R>).`,
            '',
            `-# Reviewed by ${interaction.user.tag}`,
          ].join('\n'),
        )).catch(() => null);
      }
    }

    await writeStore(store);

    await interaction.message.edit(v2Payload((container) => {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
          `# ${SAVE_EMOJI} Application ${approve ? 'Approved' : 'Denied'}`,
          `Applicant: <@${application.userId}> (\`${application.userId}\`)`,
          `Application ID: \`${application.id}\``,
          `Reviewed by: <@${interaction.user.id}>`,
          '',
          approve
            ? 'Role granted and applicant notified.'
            : 'Applicant notified. Re-apply allowed after 3 days.',
        ].join('\n')),
      );
    })).catch(() => null);

    await interaction.editReply({
      content: approve
        ? `Approved <@${application.userId}> and assigned the department role.`
        : `Denied <@${application.userId}>. They can re-apply in 3 days.`,
    });
    return true;
  }

  return false;
}

export async function handlePinellasApplyDm(message) {
  if (message.guild || message.author.bot) return false;
  const session = await loadSession(message.author.id);
  if (!session) return false;

  if (Date.now() - session.updatedAt > ANSWER_TIMEOUT_MS) {
    await persistSession(message.author.id, null);
    await message.reply(dmCard(
      'Application Timed Out',
      'Your application session expired. Click **Start Entry Process** again in the applications channel.',
    )).catch(() => null);
    return true;
  }

  const text = String(message.content || '').trim();
  if (/^cancel$/i.test(text)) {
    await persistSession(message.author.id, null);
    await message.reply(dmCard(
      'Application Cancelled',
      'Your entry application was cancelled. You can start again anytime.',
    )).catch(() => null);
    return true;
  }

  const question = PINELLAS_APPLY_QUESTIONS[session.index];
  if (!question) {
    await persistSession(message.author.id, null);
    return true;
  }

  const validated = validateAnswer(question, text);
  if (!validated.ok) {
    await message.reply(dmCard('Invalid Answer', validated.error)).catch(() => null);
    return true;
  }

  session.answers[session.index] = validated.value;
  session.index += 1;
  session.updatedAt = Date.now();
  await persistSession(message.author.id, session);

  if (session.index >= PINELLAS_APPLY_QUESTIONS.length) {
    try {
      await submitApplication(message.client, message.author, session);
    } catch (error) {
      await persistSession(message.author.id, null);
      logger.error('Pinellas apply submit failed', error);
      await message.reply(dmCard(
        'Submit Failed',
        String(error?.message || 'Could not submit your application. Please contact staff.'),
      )).catch(() => null);
    }
    return true;
  }

  await sendDmQuestion(
    message,
    PINELLAS_APPLY_QUESTIONS[session.index],
    session.index,
  );
  return true;
}
