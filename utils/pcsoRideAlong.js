import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';
import { validateRideAlongWaiver } from './pcsoRideAlongWaiver.js';

const STORE_PATH = join(process.cwd(), 'data', 'pcso-ride-alongs.json');

export const RIDE_ALONG_MEETING_PLACES = Object.freeze(["Sheriff's Station", 'Police Station', 'City Hall']);
export const RIDE_ALONG_DURATION_MS = 40 * 60_000;
export const RIDE_ALONG_CONFIRM_LEAD_MS = 60 * 60_000;
export const RIDE_ALONG_SUPERVISOR_LEAD_MS = 15 * 60_000;
export const RIDE_ALONG_NO_SHOW_AFTER_MS = 10 * 60_000;
/** Unclaimed requests are released this long after the start time. */
export const RIDE_ALONG_UNCLAIMED_GRACE_MS = 15 * 60_000;
export const RIDE_ALONG_RULES = Object.freeze([
  '- Do not Take High Priority Calls.',
  '- Make sure the Civilian Wears a Ballistic Vest for added protection.',
  '- Do not Transport Suspects with a Civilian Ride-Along.',
  '- Do not exceed Speed Limits / Get into Pursuits.',
]);

const PREFIX = 'pra:';
const ACTIVE_STATUSES = new Set(['pending', 'approved', 'claimed', 'started']);
const SCHEDULED_STATUSES = new Set(['approved', 'claimed']);
const MAX_REQUEST_AHEAD_MS = 60 * 24 * 60 * 60_000;
let storeQueue = Promise.resolve();

function emptyStore() {
  return { requests: [] };
}

function normalizeStore(raw) {
  const store = raw && typeof raw === 'object' ? raw : emptyStore();
  if (!Array.isArray(store.requests)) store.requests = [];
  return store;
}

export function createFileRideAlongStore(path = STORE_PATH) {
  return {
    read: async () => normalizeStore(await readJsonFile(path, emptyStore())),
    write: async (store) => writeJsonFile(path, store),
  };
}

function newId() {
  return `ra_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

function clean(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function timeMs(value) {
  if (value == null || value === '') return NaN;
  const ms = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : NaN;
}

export function rideAlongEndAt(record) {
  return Number(record?.scheduledAt || 0) + RIDE_ALONG_DURATION_MS;
}

export function rideAlongRoleplayName(record) {
  return `${record?.firstName || ''} ${record?.lastName || ''}`.trim() || 'Unknown';
}

const unix = (ms) => Math.floor(Number(ms) / 1000);
const discordTime = (ms, style = 'F') => `<t:${unix(ms)}:${style}>`;

export function validateRideAlongTimeframe(fields = {}, now = Date.now()) {
  const startAt = timeMs(fields.startAt);
  if (!Number.isFinite(startAt)) throw new Error('Pick a date and a start time.');
  if (startAt < now + 60 * 60_000) throw new Error('Pick a start time at least 1 hour from now.');
  if (startAt > now + MAX_REQUEST_AHEAD_MS) throw new Error('Pick a start time within the next 60 days.');
  return { startAt, endAt: startAt + RIDE_ALONG_DURATION_MS, label: clean(fields.label, 120) };
}

export const RIDE_ALONG_REVIEW_MAX = 1500;

export function validateRideAlongReview(fields = {}) {
  const rating = Number(fields.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Pick a rating from 1 to 5 stars.');
  const feedback = String(fields.feedback ?? '').replace(/\r\n/g, '\n').trim().slice(0, RIDE_ALONG_REVIEW_MAX);
  return { rating, feedback };
}

function addNotice(record, notice, at) {
  const entry = { id: `n_${at.toString(36)}_${randomBytes(2).toString('hex')}`, at, ...notice };
  record.notices = [...(record.notices || []).filter((item) => !item.seenAt), entry].slice(-5);
  return entry;
}

function canReview(record, now) {
  if (record.review) return false;
  return record.status === 'completed' || (record.status === 'started' && now >= rideAlongEndAt(record));
}

export function validateRideAlongRequest(fields = {}, now = Date.now()) {
  const firstName = clean(fields.firstName, 40);
  const lastName = clean(fields.lastName, 40);
  const dob = clean(fields.dob, 20);
  if (!firstName) throw new Error('Enter your roleplay first name.');
  if (!lastName) throw new Error('Enter your roleplay last name.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(Date.parse(dob))) {
    throw new Error('Enter your roleplay date of birth.');
  }
  return {
    firstName,
    lastName,
    dob,
    timeframe: validateRideAlongTimeframe(fields, now),
    waiver: validateRideAlongWaiver(fields, { firstName, lastName }),
  };
}

function formatDob(dob) {
  const [year, month, day] = String(dob || '').split('-');
  return year && month && day ? `${month}/${day}/${year}` : String(dob || 'Unknown');
}

export function publicRideAlong(record, now = Date.now()) {
  return {
    id: record.id,
    status: record.status,
    firstName: record.firstName,
    lastName: record.lastName,
    dob: record.dob,
    requestedStartAt: record.requestedStartAt,
    requestedEndAt: record.requestedEndAt,
    requestedLabel: record.requestedLabel || '',
    scheduledAt: record.scheduledAt || null,
    endAt: record.scheduledAt ? rideAlongEndAt(record) : null,
    meetingPlace: record.meetingPlace || '',
    claimed: Boolean(record.claimedBy),
    supervisorName: record.claimedBy ? record.claimedByName || 'Assigned' : '',
    delayRequest: record.delayRequest || null,
    endedReason: ['denied', 'cancelled', 'unclaimed'].includes(record.status) ? record.endedReason || '' : '',
    review: record.review ? { rating: record.review.rating, feedback: record.review.feedback, at: record.review.at } : null,
    canReview: canReview(record, now),
    waiverSigned: Boolean(record.waiver?.signedAt),
    waiverSignedAt: record.waiver?.signedAt || null,
    createdAt: record.createdAt,
  };
}

export function rideAlongWaiverLog(store) {
  return store.requests
    .filter((record) => record.waiver?.signedAt)
    .sort((left, right) => right.waiver.signedAt - left.waiver.signedAt)
    .slice(0, 100)
    .map((record) => ({
      id: record.id,
      roleplayName: rideAlongRoleplayName(record),
      requesterId: record.requesterId,
      requesterUsername: record.requesterUsername,
      signature: record.waiver.signature,
      version: record.waiver.version,
      signedAt: record.waiver.signedAt,
      scheduledAt: record.scheduledAt || record.requestedStartAt || null,
      status: record.status,
      claimedBy: record.claimedBy || null,
      sentAt: record.waiver.sentAt || null,
    }));
}

export function unseenRideAlongNotices(store, userId) {
  return store.requests
    .filter((record) => record.requesterId === String(userId))
    .flatMap((record) => (record.notices || [])
      .filter((notice) => !notice.seenAt)
      .map((notice) => ({ ...notice, rideAlongId: record.id })))
    .sort((left, right) => right.at - left.at)
    .slice(0, 3);
}

export function rideAlongReviews(store) {
  return store.requests
    .filter((record) => record.review)
    .sort((left, right) => right.review.at - left.review.at)
    .slice(0, 100)
    .map((record) => ({
      id: record.id,
      requesterId: record.requesterId,
      requesterUsername: record.requesterUsername,
      roleplayName: rideAlongRoleplayName(record),
      scheduledAt: record.scheduledAt,
      meetingPlace: record.meetingPlace,
      claimedBy: record.claimedBy || null,
      claimedByName: record.claimedByName || '',
      rating: record.review.rating,
      feedback: record.review.feedback,
      at: record.review.at,
    }));
}

export function upcomingRideAlongs(store, now = Date.now()) {
  return store.requests
    .filter((record) => ['approved', 'claimed', 'started'].includes(record.status) && rideAlongEndAt(record) > now)
    .sort((left, right) => left.scheduledAt - right.scheduledAt)
    .map((record) => ({
      id: record.id,
      scheduledAt: record.scheduledAt,
      endAt: rideAlongEndAt(record),
      meetingPlace: record.meetingPlace,
      roleplayName: rideAlongRoleplayName(record),
      status: record.status === 'started' ? 'In progress' : (record.claimedBy ? 'Supervisor assigned' : 'Scheduled'),
    }));
}

export function rideAlongNoShowSummary(store) {
  const byRequester = new Map();
  for (const record of store.requests) {
    if (record.status !== 'no_show') continue;
    const entry = byRequester.get(record.requesterId) || {
      requesterId: record.requesterId,
      requesterUsername: record.requesterUsername,
      roleplayName: rideAlongRoleplayName(record),
      count: 0,
      lastAt: 0,
    };
    entry.count += 1;
    entry.lastAt = Math.max(entry.lastAt, Number(record.noShowAt || record.scheduledAt || 0));
    byRequester.set(record.requesterId, entry);
  }
  return [...byRequester.values()].sort((left, right) => right.count - left.count || right.lastAt - left.lastAt);
}

function adminRideAlong(record, noShows, now) {
  return {
    ...publicRideAlong(record, now),
    requesterId: record.requesterId,
    requesterUsername: record.requesterUsername,
    claimedBy: record.claimedBy || null,
    claimedByName: record.claimedByName || '',
    noShowCount: noShows.get(record.requesterId) || 0,
    noShowAt: record.noShowAt || null,
    endedAt: record.endedAt || null,
    endedReason: record.endedReason || '',
  };
}

export function adminRideAlongView(store, now = Date.now()) {
  const summary = rideAlongNoShowSummary(store);
  const noShows = new Map(summary.map((entry) => [entry.requesterId, entry.count]));
  const view = (record) => adminRideAlong(record, noShows, now);
  const sorted = [...store.requests].sort((left, right) => (
    (left.scheduledAt || left.requestedStartAt) - (right.scheduledAt || right.requestedStartAt)
  ));
  return {
    pending: sorted.filter((record) => record.status === 'pending').map(view),
    delays: sorted.filter((record) => record.delayRequest?.status === 'pending' && SCHEDULED_STATUSES.has(record.status)).map(view),
    upcoming: sorted.filter((record) => ['approved', 'claimed', 'started'].includes(record.status) && rideAlongEndAt(record) > now).map(view),
    history: [...store.requests]
      .filter((record) => !ACTIVE_STATUSES.has(record.status) || (record.scheduledAt && rideAlongEndAt(record) <= now))
      .sort((left, right) => (right.scheduledAt || right.requestedStartAt) - (left.scheduledAt || left.requestedStartAt))
      .slice(0, 50)
      .map(view),
    noShows: summary,
    reviews: rideAlongReviews(store),
    waivers: rideAlongWaiverLog(store),
    meetingPlaces: RIDE_ALONG_MEETING_PLACES,
  };
}

function button(id, label, style) {
  return new ButtonBuilder().setCustomId(`${PREFIX}${id}`).setLabel(label).setStyle(style);
}

function row(...buttons) {
  return new ActionRowBuilder().addComponents(...buttons);
}

export function rideAlongDetailLines(record, { includeRider = false } = {}) {
  const lines = [
    `**Start Time:** ${discordTime(record.scheduledAt)}`,
    `**End Time:** ${discordTime(rideAlongEndAt(record))}`,
    `**Meeting Spot:** ${record.meetingPlace}`,
  ];
  if (includeRider) {
    lines.push(`**Roleplay Name:** ${rideAlongRoleplayName(record)}`);
    lines.push(`**Their DOB:** ${formatDob(record.dob)}`);
  }
  return lines;
}

export function supervisorAlertPayload(record) {
  return {
    content: [
      `**A Ride Along Request is starting in 15 minutes** (${discordTime(record.scheduledAt, 'R')}). Click the button below to claim it.`,
      '',
      ...rideAlongDetailLines(record, { includeRider: true }),
    ].join('\n'),
    components: [row(button(`claim:${record.id}`, 'Claim Ride Along', ButtonStyle.Success))],
  };
}

export function supervisorClaimedPayload(record, claimerId) {
  const original = supervisorAlertPayload(record).content.split('\n').filter(Boolean)
    .map((line) => `~~${line}~~`).join('\n');
  return {
    content: `${original}\n\nThis has already been claimed by <@${claimerId}>.`,
    components: [],
    allowedMentions: { parse: [] },
  };
}

export function supervisorClosedPayload(record, reason) {
  const original = supervisorAlertPayload(record).content.split('\n').filter(Boolean)
    .map((line) => `~~${line}~~`).join('\n');
  return { content: `${original}\n\n${reason}`, components: [], allowedMentions: { parse: [] } };
}

export function claimerDetailsPayload(record) {
  return {
    content: ['**You claimed this Ride Along.**', '', ...rideAlongDetailLines(record, { includeRider: true })].join('\n'),
  };
}

export function rideAlongSupervisorLine(record) {
  if (!record?.claimedBy) return null;
  const name = record.claimedByName ? `${record.claimedByName} ` : '';
  return `**Supervisor:** ${name}(<@${record.claimedBy}>)`;
}

export function formatSupervisorName(profile = {}) {
  const roleplayName = profile.roleplayName && profile.roleplayName !== '—' ? profile.roleplayName : '';
  const name = [profile.rankName, roleplayName || profile.displayName].filter(Boolean).join(' ');
  const callsign = profile.callsign && profile.callsign !== '—' ? ` · ${profile.callsign}` : '';
  return clean(`${name}${name ? callsign : ''}`, 120);
}

export function riderClaimedPayload(record) {
  return {
    content: [
      '**A supervisor has claimed your Ride Along.**',
      '',
      rideAlongSupervisorLine(record),
      ...rideAlongDetailLines(record),
    ].filter(Boolean).join('\n'),
    allowedMentions: { parse: [] },
  };
}

export function riderSearchingPayload(record) {
  return {
    content: `Your Ride Along starts ${discordTime(record.scheduledAt, 'R')}. We are looking for an active supervisor to take your request. You will get another DM once it is claimed.`,
  };
}

export function riderConfirmPayload(record) {
  return {
    content: [
      `**Your Ride Along starts in 1 hour** (${discordTime(record.scheduledAt, 'R')}).`,
      `**Meeting Spot:** ${record.meetingPlace}`,
      '',
      'Are you still going to be there? If not, press **End Ride Along**. You can also delay or end it on the website.',
    ].join('\n'),
    components: [row(
      button(`here:${record.id}`, "I'll be there", ButtonStyle.Success),
      button(`end:${record.id}`, 'End Ride Along', ButtonStyle.Danger),
    )],
  };
}

export function startPromptPayload(record) {
  return {
    content: [
      `**It's time to start the Ride Along** with **${rideAlongRoleplayName(record)}** at **${record.meetingPlace}**.`,
      `Press **They showed up / Start** once they arrive. If they have not shown up after 10 minutes (${discordTime(record.scheduledAt + RIDE_ALONG_NO_SHOW_AFTER_MS, 'R')}), press **No Show**.`,
    ].join('\n'),
    components: [row(
      button(`start:${record.id}`, 'They showed up / Start', ButtonStyle.Success),
      button(`noshow:${record.id}`, 'No Show', ButtonStyle.Danger),
    )],
  };
}

export function rulesPayload() {
  return { content: ['**Ride Along started.** Remember:', '', ...RIDE_ALONG_RULES].join('\n') };
}

export function createRideAlongService({
  store = createFileRideAlongStore(),
  now = () => Date.now(),
  dmUser = async () => null,
  editMessage = async () => {},
  onDutySupervisors = async () => [],
  userName = async () => '',
  supervisorProfile = async () => null,
  renderWaiverPdf = async (record, options) => (await import('./pcsoRideAlongWaiverPdf.js')).renderRideAlongWaiverPdf(record, options),
} = {}) {
  async function withStore(mutate) {
    const run = storeQueue.then(async () => {
      const data = await store.read();
      const result = await mutate(data);
      await store.write(data);
      return result;
    });
    storeQueue = run.then(() => {}, () => {});
    return run;
  }

  async function read() {
    return store.read();
  }

  function find(data, id) {
    const record = data.requests.find((entry) => entry.id === String(id || ''));
    if (!record) throw new Error('That ride along request could not be found.');
    return record;
  }

  async function safeDm(userId, payload) {
    try {
      return await dmUser(userId, payload);
    } catch (error) {
      logger.warn(`Ride along DM to ${userId} failed: ${error?.message || error}`);
      return null;
    }
  }

  async function closeSupervisorMessages(record, payloadFor) {
    for (const ref of record.supervisorMessages || []) {
      await editMessage(ref, payloadFor(ref)).catch(() => {});
    }
  }

  async function sendWaiver(record) {
    if (!record.waiver?.signedAt) {
      await safeDm(record.claimedBy, { content: `**${rideAlongRoleplayName(record)}** has not signed the ride along liability waiver on the website.` });
      return;
    }
    let pdf = null;
    try {
      const claimerName = record.claimedByName || await userName(record.claimedBy).catch(() => '');
      pdf = await renderWaiverPdf(record, { claimerName });
    } catch (error) {
      logger.warn(`Ride along waiver PDF for ${record.id} failed: ${error?.message || error}`);
    }
    const files = pdf ? [new AttachmentBuilder(pdf, { name: waiverFilename(record) })] : [];
    const signed = `signed by **${record.waiver.signature}** ${discordTime(record.waiver.signedAt, 'f')}`;
    const riderSent = await safeDm(record.requesterId, {
      content: [
        `Your Ride Along has started. Here is your signed liability waiver (${signed}).`,
        rideAlongSupervisorLine(record),
      ].filter(Boolean).join('\n'),
      allowedMentions: { parse: [] },
      files,
    });
    const claimerSent = await safeDm(record.claimedBy, {
      content: `Signed liability waiver for **${rideAlongRoleplayName(record)}** (${signed}).`,
      files,
    });
    await withStore(async (data) => {
      const entry = find(data, record.id);
      entry.waiver = { ...entry.waiver, sentAt: now(), sentToRider: Boolean(riderSent), sentToClaimer: Boolean(claimerSent) };
    });
  }

  function resetSchedule(record) {
    record.confirmSentAt = null;
    record.confirmedAt = null;
    record.supervisorAlertAt = null;
    record.supervisorMessages = [];
    record.claimedBy = null;
    record.claimedAt = null;
    record.startPrompt = null;
    record.startPromptAt = null;
  }

  return {
    async listForUser(userId) {
      const data = await read();
      const t = now();
      return {
        mine: data.requests
          .filter((record) => record.requesterId === String(userId))
          .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0))
          .slice(0, 20)
          .map((record) => publicRideAlong(record, t)),
        upcoming: upcomingRideAlongs(data, t),
        notices: unseenRideAlongNotices(data, userId),
        meetingPlaces: RIDE_ALONG_MEETING_PLACES,
      };
    },

    async notices(userId) {
      return { notices: unseenRideAlongNotices(await read(), userId) };
    },

    async markNoticeSeen(userId, noticeId) {
      return withStore(async (data) => {
        for (const record of data.requests) {
          if (record.requesterId !== String(userId)) continue;
          const notice = (record.notices || []).find((item) => item.id === String(noticeId || ''));
          if (notice) notice.seenAt = now();
        }
        return { notices: unseenRideAlongNotices(data, userId) };
      });
    },

    async review(user, id, fields) {
      const parsed = validateRideAlongReview(fields);
      return withStore(async (data) => {
        const entry = find(data, id);
        if (entry.requesterId !== String(user.id)) throw new Error('You can only review your own ride along.');
        if (entry.review) throw new Error('You already left a review for this ride along.');
        if (!canReview(entry, now())) throw new Error('You can leave a review once your ride along is finished.');
        if (entry.status === 'started') {
          entry.status = 'completed';
          entry.endedAt = rideAlongEndAt(entry);
        }
        entry.review = { ...parsed, at: now() };
        for (const notice of entry.notices || []) {
          if (notice.kind === 'review' && !notice.seenAt) notice.seenAt = now();
        }
        return publicRideAlong(entry, now());
      });
    },

    async request(user, fields) {
      const parsed = validateRideAlongRequest(fields, now());
      return withStore(async (data) => {
        const open = data.requests.find((record) => record.requesterId === String(user.id) && ACTIVE_STATUSES.has(record.status)
          && (!record.scheduledAt || rideAlongEndAt(record) > now()));
        if (open) throw new Error('You already have a ride along request in progress. End it before requesting another.');
        const record = {
          id: newId(),
          status: 'pending',
          requesterId: String(user.id),
          requesterUsername: clean(user.displayName || user.username, 80),
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          dob: parsed.dob,
          requestedStartAt: parsed.timeframe.startAt,
          requestedEndAt: parsed.timeframe.endAt,
          requestedLabel: parsed.timeframe.label,
          waiver: { ...parsed.waiver, signedAt: now() },
          createdAt: now(),
        };
        data.requests.unshift(record);
        data.requests = data.requests.slice(0, 1000);
        return publicRideAlong(record, now());
      });
    },

    async signWaiver(user, id, fields) {
      return withStore(async (data) => {
        const record = find(data, id);
        if (record.requesterId !== String(user.id)) throw new Error('You can only sign the waiver for your own ride along.');
        if (record.waiver?.signedAt) throw new Error('The liability waiver is already signed.');
        if (!ACTIVE_STATUSES.has(record.status) || record.status === 'started') throw new Error('This ride along can no longer be changed.');
        record.waiver = { ...validateRideAlongWaiver(fields, record), signedAt: now() };
        return publicRideAlong(record, now());
      });
    },

    async waiverPdf(id) {
      const record = find(await read(), id);
      if (!record.waiver?.signedAt) throw new Error('No liability waiver was signed for this ride along.');
      const claimerName = record.claimedBy ? record.claimedByName || await userName(record.claimedBy).catch(() => '') : '';
      const pdf = await renderWaiverPdf(record, { claimerName });
      return { filename: waiverFilename(record), pdf };
    },

    async requestDelay(user, id, fields) {
      const timeframe = validateRideAlongTimeframe(fields, now());
      return withStore(async (data) => {
        const record = find(data, id);
        if (record.requesterId !== String(user.id)) throw new Error('You can only delay your own ride along.');
        if (record.status === 'pending') {
          record.requestedStartAt = timeframe.startAt;
          record.requestedEndAt = timeframe.endAt;
          record.requestedLabel = timeframe.label;
          return publicRideAlong(record, now());
        }
        if (!SCHEDULED_STATUSES.has(record.status)) throw new Error('This ride along can no longer be delayed.');
        record.delayRequest = {
          status: 'pending',
          requestedStartAt: timeframe.startAt,
          requestedEndAt: timeframe.endAt,
          label: timeframe.label,
          requestedAt: now(),
        };
        return publicRideAlong(record, now());
      });
    },

    async end(userId, id, { reason = 'Ended by the requester.', byRequester = true } = {}) {
      const record = await withStore(async (data) => {
        const entry = find(data, id);
        if (byRequester && entry.requesterId !== String(userId)) throw new Error('You can only end your own ride along.');
        if (!ACTIVE_STATUSES.has(entry.status) || entry.status === 'started') throw new Error('This ride along can no longer be ended.');
        entry.status = 'cancelled';
        entry.endedAt = now();
        entry.endedBy = String(userId);
        entry.endedReason = reason;
        return { ...entry };
      });
      await closeSupervisorMessages(record, () => supervisorClosedPayload(record, 'This ride along was ended by the requester.'));
      if (record.claimedBy) await safeDm(record.claimedBy, { content: `The Ride Along with **${rideAlongRoleplayName(record)}** at ${discordTime(record.scheduledAt)} was ended by the requester.` });
      if (!byRequester) await safeDm(record.requesterId, { content: `Your Ride Along request was ended. ${reason}` });
      return publicRideAlong(record, now());
    },

    async approve(reviewerId, id, { scheduledAt, meetingPlace }) {
      const at = timeMs(scheduledAt);
      if (!Number.isFinite(at) || at <= now()) throw new Error('Pick a start time in the future.');
      if (!RIDE_ALONG_MEETING_PLACES.includes(meetingPlace)) throw new Error('Pick a meeting place.');
      const record = await withStore(async (data) => {
        const entry = find(data, id);
        if (entry.status !== 'pending') throw new Error('That request was already reviewed.');
        entry.status = 'approved';
        entry.scheduledAt = at;
        entry.meetingPlace = meetingPlace;
        entry.approvedBy = String(reviewerId);
        entry.approvedAt = now();
        resetSchedule(entry);
        addNotice(entry, { kind: 'approved', title: 'Your ride along was approved.', scheduledAt: at, meetingPlace }, now());
        return { ...entry };
      });
      await safeDm(record.requesterId, {
        content: ['**Your Ride Along request was approved.**', '', ...rideAlongDetailLines(record)].join('\n'),
      });
      return record;
    },

    async deny(reviewerId, id, reason = '') {
      const record = await withStore(async (data) => {
        const entry = find(data, id);
        if (entry.status !== 'pending') throw new Error('That request was already reviewed.');
        entry.status = 'denied';
        entry.deniedBy = String(reviewerId);
        entry.endedAt = now();
        entry.endedReason = clean(reason, 300);
        addNotice(entry, { kind: 'denied', title: 'Your ride along request was denied.', text: entry.endedReason }, now());
        return { ...entry };
      });
      await safeDm(record.requesterId, {
        content: `Your Ride Along request was denied.${record.endedReason ? `\n**Reason:** ${record.endedReason}` : ''}`,
      });
      return record;
    },

    async reviewDelay(reviewerId, id, { approve, scheduledAt, meetingPlace }) {
      const at = approve ? timeMs(scheduledAt) : NaN;
      if (approve && (!Number.isFinite(at) || at <= now())) throw new Error('Pick the new start time.');
      if (approve && meetingPlace && !RIDE_ALONG_MEETING_PLACES.includes(meetingPlace)) throw new Error('Pick a meeting place.');
      const { record, previous } = await withStore(async (data) => {
        const entry = find(data, id);
        if (entry.delayRequest?.status !== 'pending') throw new Error('There is no pending delay request.');
        const before = { ...entry };
        entry.delayRequest = { ...entry.delayRequest, status: approve ? 'approved' : 'denied', reviewedBy: String(reviewerId), reviewedAt: now() };
        if (approve) {
          entry.status = 'approved';
          entry.scheduledAt = at;
          if (meetingPlace) entry.meetingPlace = meetingPlace;
          resetSchedule(entry);
          addNotice(entry, { kind: 'approved', title: 'Your ride along delay was approved.', scheduledAt: at, meetingPlace: entry.meetingPlace }, now());
        } else {
          addNotice(entry, { kind: 'denied', title: 'Your ride along delay was denied.', text: 'It is still set for the original time.', scheduledAt: entry.scheduledAt, meetingPlace: entry.meetingPlace }, now());
        }
        return { record: { ...entry }, previous: before };
      });
      if (approve) {
        await closeSupervisorMessages(previous, () => supervisorClosedPayload(previous, 'This ride along was rescheduled.'));
        if (previous.claimedBy) {
          await safeDm(previous.claimedBy, { content: `The Ride Along with **${rideAlongRoleplayName(previous)}** was rescheduled. It will be offered to on-duty supervisors again before the new time.` });
        }
        await safeDm(record.requesterId, {
          content: ['**Your Ride Along delay was approved.**', '', ...rideAlongDetailLines(record)].join('\n'),
        });
      } else {
        await safeDm(record.requesterId, { content: `Your Ride Along delay request was denied. It is still set for ${discordTime(record.scheduledAt)}.` });
      }
      return record;
    },

    async claim(userId, id) {
      const profile = await supervisorProfile(String(userId)).catch(() => null);
      const record = await withStore(async (data) => {
        const entry = find(data, id);
        if (entry.claimedBy) {
          throw new Error(entry.claimedBy === String(userId) ? 'You already claimed this ride along.' : 'This ride along has already been claimed.');
        }
        if (entry.status !== 'approved') throw new Error('This ride along is no longer available.');
        if (!(entry.supervisorMessages || []).some((ref) => ref.userId === String(userId))) {
          throw new Error('Only the on-duty supervisors who were alerted can claim this ride along.');
        }
        entry.status = 'claimed';
        entry.claimedBy = String(userId);
        entry.claimedByName = profile ? formatSupervisorName(profile) : '';
        entry.claimedAt = now();
        return { ...entry };
      });
      await closeSupervisorMessages(record, (ref) => (ref.userId === record.claimedBy
        ? { content: `${supervisorAlertPayload(record).content}\n\n**You claimed this ride along.**`, components: [] }
        : supervisorClaimedPayload(record, record.claimedBy)));
      await safeDm(record.claimedBy, claimerDetailsPayload(record));
      await safeDm(record.requesterId, riderClaimedPayload(record));
      return record;
    },

    async confirm(userId, id) {
      return withStore(async (data) => {
        const entry = find(data, id);
        if (entry.requesterId !== String(userId)) throw new Error('Only the requester can confirm this ride along.');
        if (!SCHEDULED_STATUSES.has(entry.status)) throw new Error('This ride along is no longer scheduled.');
        entry.confirmedAt = now();
        return { ...entry };
      });
    },

    async start(userId, id) {
      const record = await withStore(async (data) => {
        const entry = find(data, id);
        if (entry.claimedBy !== String(userId)) throw new Error('Only the supervisor who claimed this ride along can start it.');
        if (entry.status !== 'claimed') throw new Error('This ride along is no longer waiting to start.');
        entry.status = 'started';
        entry.startedAt = now();
        return { ...entry };
      });
      await sendWaiver(record);
      return record;
    },

    async noShow(userId, id) {
      const record = await withStore(async (data) => {
        const entry = find(data, id);
        if (entry.claimedBy !== String(userId)) throw new Error('Only the supervisor who claimed this ride along can mark a no show.');
        if (entry.status !== 'claimed') throw new Error('This ride along is no longer waiting to start.');
        const allowedAt = entry.scheduledAt + RIDE_ALONG_NO_SHOW_AFTER_MS;
        if (now() < allowedAt) throw new Error(`You can mark a No Show ${discordTime(allowedAt, 'R')}.`);
        entry.status = 'no_show';
        entry.noShowAt = now();
        entry.endedAt = now();
        entry.endedReason = 'No show';
        return { ...entry };
      });
      await safeDm(record.requesterId, { content: `You were marked as a **No Show** for your Ride Along at ${discordTime(record.scheduledAt)}.` });
      return record;
    },

    async tick() {
      const t = now();
      const data = await read();
      for (const snapshot of data.requests) {
        if (!SCHEDULED_STATUSES.has(snapshot.status) && snapshot.status !== 'started') continue;
        const at = Number(snapshot.scheduledAt || 0);
        if (!at) continue;
        try {
          if (snapshot.status === 'started' && t >= rideAlongEndAt(snapshot)) {
            await withStore(async (fresh) => {
              const entry = find(fresh, snapshot.id);
              if (entry.status === 'started') {
                entry.status = 'completed';
                entry.endedAt = rideAlongEndAt(entry);
                if (!entry.review) addNotice(entry, { kind: 'review', title: 'How was your ride along?', text: 'Leave a rating and feedback for PCSO.' }, t);
              }
            });
            continue;
          }
          if (!snapshot.confirmSentAt && t >= at - RIDE_ALONG_CONFIRM_LEAD_MS && t < at - RIDE_ALONG_SUPERVISOR_LEAD_MS) {
            await withStore(async (fresh) => { find(fresh, snapshot.id).confirmSentAt = t; });
            await safeDm(snapshot.requesterId, riderConfirmPayload(snapshot));
          }
          if (snapshot.status === 'approved' && !snapshot.supervisorAlertAt && t >= at - RIDE_ALONG_SUPERVISOR_LEAD_MS && t < at + RIDE_ALONG_UNCLAIMED_GRACE_MS) {
            await withStore(async (fresh) => { find(fresh, snapshot.id).supervisorAlertAt = t; });
            const supervisors = await onDutySupervisors().catch((error) => {
              logger.warn(`Ride along supervisor lookup failed: ${error?.message || error}`);
              return [];
            });
            const refs = [];
            for (const supervisor of supervisors) {
              if (String(supervisor.discordId) === snapshot.requesterId) continue;
              const sent = await safeDm(supervisor.discordId, supervisorAlertPayload(snapshot));
              if (sent?.channelId && sent?.messageId) refs.push({ userId: String(supervisor.discordId), ...sent });
            }
            await withStore(async (fresh) => {
              const entry = find(fresh, snapshot.id);
              entry.supervisorMessages = [...(entry.supervisorMessages || []), ...refs];
            });
            await safeDm(snapshot.requesterId, riderSearchingPayload(snapshot));
            logger.info(`Ride along ${snapshot.id}: alerted ${refs.length} on-duty supervisor(s).`);
          }
          if (snapshot.status === 'claimed' && !snapshot.startPromptAt && t >= at) {
            await withStore(async (fresh) => { find(fresh, snapshot.id).startPromptAt = t; });
            const sent = await safeDm(snapshot.claimedBy, startPromptPayload(snapshot));
            if (sent) await withStore(async (fresh) => { find(fresh, snapshot.id).startPrompt = sent; });
          }
          if (snapshot.status === 'approved' && t >= at + RIDE_ALONG_UNCLAIMED_GRACE_MS) {
            const released = await withStore(async (fresh) => {
              const entry = find(fresh, snapshot.id);
              if (entry.status !== 'approved') return null;
              entry.status = 'unclaimed';
              entry.endedAt = t;
              entry.endedReason = 'No on-duty supervisor claimed it.';
              addNotice(entry, { kind: 'denied', title: 'No supervisor was available for your ride along.', text: 'You can request a new one.' }, t);
              return { ...entry };
            });
            if (released) {
              await closeSupervisorMessages(released, () => supervisorClosedPayload(released, 'Nobody claimed this ride along in time.'));
              await safeDm(released.requesterId, { content: 'No on-duty supervisor was available to take your Ride Along. You can request a new one on the website.' });
            }
          }
        } catch (error) {
          logger.warn(`Ride along tick failed for ${snapshot.id}: ${error?.message || error}`);
        }
      }
    },

    adminView: async () => adminRideAlongView(await read(), now()),
  };
}

let defaultService = null;
let tickTimer = null;

export function waiverFilename(record) {
  const name = `${record.firstName || ''}-${record.lastName || ''}`.replace(/[^a-z0-9-]+/gi, '').slice(0, 40) || 'rider';
  return `ride-along-waiver-${name}.pdf`;
}

/** On-shift lists older than this are not trusted for ride along alerts. */
export const RIDE_ALONG_SHIFT_MAX_AGE_MS = 5 * 60_000;

export function rideAlongShiftIsFresh(snapshot, now = Date.now()) {
  const fetchedAt = Date.parse(snapshot?.fetchedAt || '');
  return Number.isFinite(fetchedAt) && now - fetchedAt <= RIDE_ALONG_SHIFT_MAX_AGE_MS;
}

/** Deputies on an active shift who are still on duty and Corporal+ in Discord right now. */
export async function eligibleRideAlongSupervisors(snapshot, { memberFor, isEligible, now = Date.now() } = {}) {
  if (!rideAlongShiftIsFresh(snapshot, now)) return [];
  const seen = new Set();
  const eligible = [];
  for (const deputy of snapshot?.deputies || []) {
    const discordId = String(deputy?.discordId || '');
    if (!deputy?.shift || !/^\d{16,22}$/.test(discordId) || seen.has(discordId)) continue;
    seen.add(discordId);
    const member = await memberFor(discordId).catch(() => null);
    if (member && isEligible(member)) eligible.push(deputy);
  }
  return eligible;
}

export function rideAlongServiceForClient(client) {
  if (defaultService) return defaultService;
  defaultService = createRideAlongService({
    dmUser: async (userId, payload) => {
      const user = await client.users.fetch(String(userId));
      const message = await user.send({ allowedMentions: { parse: [] }, ...payload, files: payload.files?.length ? payload.files : undefined });
      return { channelId: message.channelId, messageId: message.id };
    },
    editMessage: async (ref, payload) => {
      const channel = await client.channels.fetch(ref.channelId).catch(() => null);
      const message = channel?.isTextBased?.() ? await channel.messages.fetch(ref.messageId).catch(() => null) : null;
      if (message) await message.edit(payload);
    },
    supervisorProfile: async (userId) => {
      const { getPostedShiftSnapshot } = await import('./pinellasShiftPanel.js');
      const snapshot = await getPostedShiftSnapshot().catch(() => null);
      const deputy = (snapshot?.deputies || []).find((entry) => entry.discordId === String(userId));
      const { PINELLAS_GUILD_ID } = await import('./pinellasServer.js');
      const guild = client.guilds.cache.get(PINELLAS_GUILD_ID) || await client.guilds.fetch(PINELLAS_GUILD_ID).catch(() => null);
      const member = guild ? await guild.members.fetch(String(userId)).catch(() => null) : null;
      const { getHighestPinellasRank } = await import('./pinellasPromote.js');
      return {
        rankName: getHighestPinellasRank(member)?.name || deputy?.rankName || '',
        roleplayName: deputy?.roleplayName || '',
        callsign: deputy?.callsign || '',
        displayName: member?.displayName || member?.user?.globalName || member?.user?.username || '',
      };
    },
    userName: async (userId) => {
      const user = await client.users.fetch(String(userId));
      return user.globalName || user.username || '';
    },
    onDutySupervisors: async () => {
      const { getPostedShiftSnapshot, isOnDutyCorporalOrAbove, loadShiftPanelSnapshot } = await import('./pinellasShiftPanel.js');
      const { PINELLAS_GUILD_ID } = await import('./pinellasServer.js');
      let snapshot = await getPostedShiftSnapshot();
      if (!rideAlongShiftIsFresh(snapshot)) {
        snapshot = await loadShiftPanelSnapshot(client, { refresh: true }).catch((error) => {
          logger.warn(`Ride along: on-shift refresh failed (${error?.message || error})`);
          return snapshot;
        });
      }
      if (!rideAlongShiftIsFresh(snapshot)) {
        logger.warn('Ride along: on-shift list is stale, so no supervisors were alerted.');
        return [];
      }
      const guild = client.guilds.cache.get(PINELLAS_GUILD_ID) || await client.guilds.fetch(PINELLAS_GUILD_ID).catch(() => null);
      if (!guild) return [];
      return eligibleRideAlongSupervisors(snapshot, {
        memberFor: (discordId) => guild.members.fetch(discordId),
        isEligible: isOnDutyCorporalOrAbove,
      });
    },
  });
  return defaultService;
}

export function startRideAlongScheduler(client, { intervalMs = 30_000 } = {}) {
  if (tickTimer) return;
  const service = rideAlongServiceForClient(client);
  const run = () => service.tick().catch((error) => logger.warn(`Ride along scheduler failed: ${error?.message || error}`));
  tickTimer = setInterval(run, intervalMs);
  tickTimer.unref?.();
  setTimeout(run, 10_000).unref?.();
}

export function parseRideAlongButton(customId) {
  const match = String(customId || '').match(/^pra:(claim|here|end|start|noshow):(ra_[a-z0-9_]+)$/);
  return match ? { action: match[1], id: match[2] } : null;
}

export async function handleRideAlongInteraction(interaction) {
  if (!interaction.isButton?.()) return false;
  const parsed = parseRideAlongButton(interaction.customId);
  if (!parsed) return false;
  const service = rideAlongServiceForClient(interaction.client);
  const userId = interaction.user.id;
  try {
    if (parsed.action === 'claim') {
      await interaction.deferUpdate();
      await service.claim(userId, parsed.id);
      return true;
    }
    if (parsed.action === 'here') {
      const record = await service.confirm(userId, parsed.id);
      await interaction.update({
        content: `Thanks for confirming. See you at **${record.meetingPlace}** ${discordTime(record.scheduledAt, 'R')}.`,
        components: [],
      });
      return true;
    }
    if (parsed.action === 'end') {
      await service.end(userId, parsed.id);
      await interaction.update({ content: 'Your Ride Along was ended.', components: [] });
      return true;
    }
    if (parsed.action === 'start') {
      const record = await service.start(userId, parsed.id);
      await interaction.update({
        content: `Ride Along with **${rideAlongRoleplayName(record)}** started ${discordTime(record.startedAt, 'R')}.`,
        components: [],
      });
      await interaction.followUp(rulesPayload());
      return true;
    }
    if (parsed.action === 'noshow') {
      const record = await service.noShow(userId, parsed.id);
      await interaction.update({
        content: `**${rideAlongRoleplayName(record)}** was marked as a **No Show**. This is recorded in the admin panel.`,
        components: [],
      });
      return true;
    }
  } catch (error) {
    const reply = { content: String(error?.message || 'That ride along could not be updated.').slice(0, 1800), flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
    return true;
  }
  return true;
}
