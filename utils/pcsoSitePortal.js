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

  if (kind === 'admin-records') {
    const guild = client.guilds.cache.get(PINELLAS_GUILD_ID)
      || await client.guilds.fetch(PINELLAS_GUILD_ID).catch(() => null);
    const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
    const allowed = memberHasPinellasInfractionAccess(member)
      || member?.permissions?.has?.(PermissionFlagsBits.ManageRoles)
      || member?.permissions?.has?.(PermissionFlagsBits.Administrator);
    if (!allowed) {
      const error = new Error('Admin permission is required to review public records requests.');
      error.status = 403;
      throw error;
    }
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
