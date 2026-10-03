import {
  formatWebsiteInquiry,
  PINELLAS_SUPPORT_OPTIONS,
  websiteTicketFields,
} from './pinellasSupport.js';
import { closeWebTicket, listWebTicketMessages, openWebTicket, postWebTicketReply } from './pcsoWebTickets.js';
import { completeWebsiteApplicationOnboarding, getPinellasApplicationStatus, reportWebsiteApplicationViolation, revealWebsiteApplicationResult, startWebsiteApplicationOnboarding, submitWebsiteApplication } from './pinellasApply.js';
import { listPcsoSiteFormsForUser } from './pcsoSiteForms.js';
import { fetchPcsoAssignedMelonlyCalls } from './melonly.js';
import { PINELLAS_MELONLY_DEPARTMENT_ID } from './pinellasShiftPanel.js';
import { PermissionFlagsBits } from 'discord.js';
import { PINELLAS_GUILD_ID, memberHasPinellasInfractionAccess } from './pinellasServer.js';
import { listPublicRecordsForAdmin, reviewPublicRecordFromWebsite } from './pcsoSiteFormDiscord.js';
import { rideAlongServiceForClient } from './pcsoRideAlong.js';
import { renderLibertyLocationMap } from './libertyMapImage.js';
import { nearestLibertyPostal } from './libertyMapCalibration.js';
import { logger } from './logger.js';

async function requirePcsoAdmin(client, userId, message) {
  const guild = client.guilds.cache.get(PINELLAS_GUILD_ID)
    || await client.guilds.fetch(PINELLAS_GUILD_ID).catch(() => null);
  const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
  const allowed = memberHasPinellasInfractionAccess(member)
    || member?.permissions?.has?.(PermissionFlagsBits.ManageRoles)
    || member?.permissions?.has?.(PermissionFlagsBits.Administrator);
  if (!allowed) {
    const error = new Error(message);
    error.status = 403;
    throw error;
  }
}

const COMPLAINT_FIELDS = Object.freeze([
  ['trooperName', 'Trooper’s name', 80, true],
  ['badgeNumber', 'Badge number', 40, true],
  ['location', 'Where it happened in-game', 160, false],
  ['reason', 'Reason', 160, true],
  ['description', 'Description', 2000, true],
  ['witnesses', 'Witnesses', 400, false],
]);

/** Postal labels farther than this from the pin are not worth naming. */
const COMPLAINT_POSTAL_RANGE = 0.06;

export function complaintMapPoint(fields = {}) {
  const left = Number(fields.mapLeft);
  const top = Number(fields.mapTop);
  if (fields.mapLeft == null || fields.mapTop == null || fields.mapLeft === '' || fields.mapTop === ''
    || !Number.isFinite(left) || !Number.isFinite(top) || left < 0 || left > 1 || top < 0 || top > 1) {
    throw new Error('Click the map to mark where it happened.');
  }
  return { left, top };
}

function complaintLocationText(point, landmark) {
  const nearest = nearestLibertyPostal(point);
  const lines = [nearest && nearest.distance <= COMPLAINT_POSTAL_RANGE
    ? `Marked on the map near postal ${nearest.postal} (map below).`
    : 'Marked on the map (map below).'];
  if (landmark) lines.push(`Landmark: ${landmark}`);
  return lines.join('\n');
}

export function formatWebsiteComplaint(fields = {}) {
  const point = complaintMapPoint(fields);
  const lines = ['Personnel complaint filed on the website.'];
  for (const [key, label, max, required] of COMPLAINT_FIELDS) {
    const value = String(fields[key] ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
    if (required && !value) throw new Error(`Enter: ${label}`);
    if (key === 'description' && value.length < 8) throw new Error('Describe what happened.');
    if (key === 'location') {
      lines.push(`${label}\n${complaintLocationText(point, value)}`);
      continue;
    }
    lines.push(`${label}\n${value || 'None listed'}`);
  }
  return lines.join('\n\n');
}

async function postComplaintMap(client, channelId, point) {
  const png = await renderLibertyLocationMap(point);
  if (!png) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  const nearest = nearestLibertyPostal(point);
  const near = nearest && nearest.distance <= COMPLAINT_POSTAL_RANGE ? ` (near postal ${nearest.postal})` : '';
  const { AttachmentBuilder } = await import('discord.js');
  await channel.send({
    content: `**Where it happened in-game**${near}`,
    files: [new AttachmentBuilder(png, { name: 'complaint-location.png' })],
    allowedMentions: { parse: [] },
  });
}

function sessionUser(payload = {}) {
  const id = String(payload.id || payload.discordId || '').trim();
  if (!/^\d{16,22}$/.test(id)) return null;
  return {
    id,
    username: String(payload.username || 'user').slice(0, 80),
    displayName: String(payload.displayName || payload.globalName || payload.username || 'user').slice(0, 80),
    avatar: String(payload.avatar || ''),
  };
}

export async function handlePcsoPortal(client, body = {}) {
  const kind = String(body.kind || '').trim();
  const action = String(body.action || 'list').trim();
  const user = sessionUser(body.user || body);

  if (kind === 'ticket-meta') {
    return {
      ok: true,
      types: PINELLAS_SUPPORT_OPTIONS.map((option) => ({
        type: option.type,
        title: option.title,
        description: option.description,
        fields: websiteTicketFields(option.type),
      })),
    };
  }

  if (kind === 'calls') {
    const apiKey = process.env.MELONLY_API_KEY?.trim() || '';
    if (!apiKey) {
      return { ok: true, configured: false, calls: [], message: 'Active calls are unavailable.' };
    }
    const result = await fetchPcsoAssignedMelonlyCalls(apiKey, {
      pinellasDepartmentId: PINELLAS_MELONLY_DEPARTMENT_ID,
    });
    return {
      ok: true,
      configured: true,
      calls: result.calls,
      message: result.calls.length ? undefined : 'No PCSO units are assigned to an active call.',
    };
  }

  if (!user) {
    const error = new Error('Sign in with Discord first.');
    error.status = 401;
    throw error;
  }

  if (kind === 'ticket') {
    if (action === 'list') {
      return { ok: true, ...(await listWebTicketMessages(client, user.id, body.channelId)) };
    }
    if (action === 'open') {
      const type = ['general', 'compliance', 'sheriff'].includes(body.type) ? body.type : 'general';
      const inquiry = formatWebsiteInquiry(type, body.fields || {});
      const opened = await openWebTicket(client, { user, type, inquiry });
      const thread = await listWebTicketMessages(client, user.id, opened.channelId);
      return { ok: true, ...opened, ...thread };
    }
    if (action === 'reply') {
      await postWebTicketReply(client, { user, content: body.content, channelId: body.channelId });
      return { ok: true, ...(await listWebTicketMessages(client, user.id, body.channelId)) };
    }
    if (action === 'close') {
      await closeWebTicket(client, { user, channelId: body.channelId });
      return { ok: true, ...(await listWebTicketMessages(client, user.id)) };
    }
  }

  if (kind === 'application') {
    if (action === 'status' || action === 'list') {
      return { ok: true, ...(await getPinellasApplicationStatus(user.id, { client })) };
    }
    if (action === 'submit') {
      const discordUser = await client.users.fetch(user.id);
      const status = await submitWebsiteApplication(client, discordUser, body.answers || {}, body.violations || []);
      return { ok: true, ...status, submitted: true };
    }
    if (action === 'reveal') {
      await revealWebsiteApplicationResult(user.id);
      return { ok: true, ...(await getPinellasApplicationStatus(user.id, { client })) };
    }
    if (action === 'onboarding-start') {
      await startWebsiteApplicationOnboarding(user.id, body.durationSeconds);
      return { ok: true };
    }
    if (action === 'onboarding-complete') {
      return { ok: true, ...(await completeWebsiteApplicationOnboarding(client, user.id)) };
    }
    if (action === 'violation') {
      await reportWebsiteApplicationViolation(client, user, body.violation);
      return { ok: true };
    }
  }

  if (kind === 'records') {
    return { ok: true, records: await listPcsoSiteFormsForUser(user.id) };
  }

  if (kind === 'complaint' && action === 'submit') {
    const inquiry = formatWebsiteComplaint(body.fields || {});
    const point = complaintMapPoint(body.fields || {});
    const opened = await openWebTicket(client, { user, type: 'compliance', inquiry });
    try {
      await postComplaintMap(client, opened.channelId, point);
    } catch (error) {
      logger.warn(`Complaint map for ${opened.channelId} failed: ${error?.message || error}`);
    }
    return {
      ok: true,
      ...opened,
      message: opened.existing
        ? 'Your complaint was added to your open Office of Professional Compliance ticket.'
        : 'Your complaint was opened as an Office of Professional Compliance ticket in Discord.',
    };
  }

  if (kind === 'ride-along') {
    const service = rideAlongServiceForClient(client);
    if (action === 'notices') return { ok: true, ...(await service.notices(user.id)) };
    if (action === 'notice-seen') return { ok: true, ...(await service.markNoticeSeen(user.id, body.noticeId)) };
    if (action === 'request') await service.request(user, body.fields || {});
    else if (action === 'delay') await service.requestDelay(user, body.id, body.fields || {});
    else if (action === 'end') await service.end(user.id, body.id);
    else if (action === 'review') await service.review(user, body.id, body.fields || {});
    else if (action !== 'list') {
      const error = new Error('Unknown ride along request.');
      error.status = 400;
      throw error;
    }
    return { ok: true, ...(await service.listForUser(user.id)) };
  }

  if (kind === 'admin-ride-along') {
    await requirePcsoAdmin(client, user.id, 'Admin permission is required to review ride alongs.');
    const service = rideAlongServiceForClient(client);
    if (action === 'approve') {
      await service.approve(user.id, body.id, { scheduledAt: body.scheduledAt, meetingPlace: body.meetingPlace });
    } else if (action === 'deny') {
      await service.deny(user.id, body.id, body.reason);
    } else if (action === 'delay-approve' || action === 'delay-deny') {
      await service.reviewDelay(user.id, body.id, {
        approve: action === 'delay-approve',
        scheduledAt: body.scheduledAt,
        meetingPlace: body.meetingPlace,
      });
    } else if (action === 'cancel') {
      await service.end(user.id, body.id, { reason: String(body.reason || 'Cancelled by PCSO staff.'), byRequester: false });
    } else if (action !== 'list') {
      const error = new Error('Unknown ride along request.');
      error.status = 400;
      throw error;
    }
    return { ok: true, ...(await service.adminView()) };
  }

  if (kind === 'admin-records') {
    await requirePcsoAdmin(client, user.id, 'Admin permission is required to review public records requests.');
    if (action === 'list') {
      return { ok: true, records: await listPublicRecordsForAdmin() };
    }
    if (action === 'review') {
      await reviewPublicRecordFromWebsite(client, {
        formId: body.formId,
        decision: body.decision === 'deny' ? 'deny' : 'approve',
        report: body.report,
        reviewerId: user.id,
      });
      return { ok: true, records: await listPublicRecordsForAdmin() };
    }
  }

  const error = new Error('Unknown portal request.');
  error.status = 400;
  throw error;
}
