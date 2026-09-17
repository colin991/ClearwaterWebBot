import {
  formatWebsiteInquiry,
  PINELLAS_SUPPORT_OPTIONS,
  websiteTicketFields,
} from './pinellasSupport.js';
import { listWebTicketMessages, openWebTicket, postWebTicketReply } from './pcsoWebTickets.js';
import { getPinellasApplicationStatus, submitWebsiteApplication } from './pinellasApply.js';
import { listPcsoSiteFormsForUser } from './pcsoSiteForms.js';
import { fetchPcsoAssignedMelonlyCalls } from './melonly.js';
import { PINELLAS_MELONLY_DEPARTMENT_ID } from './pinellasShiftPanel.js';

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
      return { ok: true, ...(await listWebTicketMessages(client, user.id)) };
    }
    if (action === 'open') {
      const type = ['general', 'compliance', 'sheriff'].includes(body.type) ? body.type : 'general';
      const inquiry = formatWebsiteInquiry(type, body.fields || {});
      const opened = await openWebTicket(client, { user, type, inquiry });
      const thread = await listWebTicketMessages(client, user.id);
      return { ok: true, ...opened, ...thread };
    }
    if (action === 'reply') {
      await postWebTicketReply(client, { user, content: body.content });
      return { ok: true, ...(await listWebTicketMessages(client, user.id)) };
    }
  }

  if (kind === 'application') {
    if (action === 'status' || action === 'list') {
      return { ok: true, ...(await getPinellasApplicationStatus(user.id)) };
    }
    if (action === 'submit') {
      const discordUser = await client.users.fetch(user.id);
      const status = await submitWebsiteApplication(client, discordUser, body.answers || {});
      return { ok: true, ...status, submitted: true };
    }
  }

  if (kind === 'records') {
    return { ok: true, records: await listPcsoSiteFormsForUser(user.id) };
  }

  const error = new Error('Unknown portal request.');
  error.status = 400;
  throw error;
}
