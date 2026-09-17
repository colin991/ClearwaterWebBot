import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const STORE_PATH = join(process.cwd(), 'data', 'pcso-site-forms.json');

export const PCSO_FORM_KINDS = Object.freeze([
  'police-report',
  'crime-stoppers',
  'public-records',
  'complaint',
]);

export function pcsoFormChannelId(kind) {
  const specific = {
    'police-report': process.env.PCSO_POLICE_REPORT_CHANNEL_ID,
    'crime-stoppers': process.env.PCSO_CRIME_STOPPERS_CHANNEL_ID,
    'public-records': process.env.PCSO_PUBLIC_RECORDS_CHANNEL_ID,
    complaint: process.env.PCSO_COMPLAINT_CHANNEL_ID,
  };
  return String(specific[kind] || process.env.PCSO_SITE_FORMS_CHANNEL_ID || '').trim();
}

export function publicSiteUrl() {
  return String(process.env.PUBLIC_SITE_URL || 'https://cwrpvc.lol').replace(/\/$/, '');
}

function clean(value, max) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

export function validatePcsoSiteForm(kind, fields = {}, sessionUser = null) {
  const type = String(kind || '').trim();
  if (!PCSO_FORM_KINDS.includes(type)) {
    throw new Error('Unknown form.');
  }

  if (type === 'crime-stoppers') {
    const tip = clean(fields.tip, 1500);
    if (tip.length < 8) throw new Error('Enter an anonymous tip.');
    return { kind: type, fields: { tip } };
  }

  if (type === 'police-report') {
    const description = clean(fields.description, 2000);
    if (description.length < 8) throw new Error('Describe what happened.');
    const mapLeft = Number(fields.mapLeft);
    const mapTop = Number(fields.mapTop);
    if (!Number.isFinite(mapLeft) || !Number.isFinite(mapTop) || mapLeft < 0 || mapLeft > 1 || mapTop < 0 || mapTop > 1) {
      throw new Error('Select a location on the in-game map.');
    }
    return {
      kind: type,
      fields: {
        name: clean(fields.name, 80),
        incident: clean(fields.incident, 120),
        description,
        mapLeft: Number(mapLeft.toFixed(5)),
        mapTop: Number(mapTop.toFixed(5)),
      },
    };
  }

  if (type === 'public-records') {
    if (!sessionUser?.id) throw new Error('Sign in with Discord to request public records.');
    const subjectType = String(fields.subjectType || '').trim() === 'case' ? 'case' : 'deputy';
    const subject = clean(fields.subject, 120);
    if (subject.length < 2) {
      throw new Error(subjectType === 'case' ? 'Enter a case number.' : 'Enter the deputy name.');
    }
    return {
      kind: type,
      fields: {
        subjectType,
        subject,
        details: clean(fields.details, 1500),
      },
      requester: {
        discordId: String(sessionUser.id),
        username: clean(sessionUser.username || sessionUser.globalName, 80),
      },
    };
  }

  const name = clean(fields.trooperName, 80);
  const badge = clean(fields.badgeNumber, 40);
  const location = clean(fields.location, 160);
  const reason = clean(fields.reason, 160);
  const description = clean(fields.description, 2000);
  if (!name) throw new Error('Enter the trooper’s name.');
  if (!badge) throw new Error('Enter the badge number.');
  if (!location) throw new Error('Enter where it happened in-game.');
  if (!reason) throw new Error('Enter a reason.');
  if (description.length < 8) throw new Error('Describe what happened.');
  return {
    kind: type,
    fields: {
      trooperName: name,
      badgeNumber: badge,
      location,
      reason,
      description,
      witnesses: clean(fields.witnesses, 400),
    },
    requester: sessionUser?.id
      ? { discordId: String(sessionUser.id), username: clean(sessionUser.username || sessionUser.globalName, 80) }
      : null,
  };
}

export function createPcsoSiteFormRecord(entry = {}) {
  return {
    ...entry,
    id: String(entry.id || newId('form')),
    status: entry.status || (entry.kind === 'public-records' ? 'pending' : 'submitted'),
    createdAt: entry.createdAt || new Date().toISOString(),
  };
}

function canPersistSiteForms() {
  return !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME;
}

export async function savePcsoSiteForm(entry) {
  const record = createPcsoSiteFormRecord(entry);
  if (!canPersistSiteForms()) return record;
  try {
    const store = await readJsonFile(STORE_PATH, { entries: [] });
    const entries = Array.isArray(store.entries) ? store.entries : [];
    const index = entries.findIndex((item) => item.id === record.id);
    if (index >= 0) entries[index] = { ...entries[index], ...record };
    else entries.unshift(record);
    store.entries = entries.slice(0, 500);
    await writeJsonFile(STORE_PATH, store);
  } catch (error) {
    if (!['EROFS', 'EACCES'].includes(String(error?.code || ''))) throw error;
  }
  return record;
}

export async function getPcsoSiteForm(id) {
  const store = await readJsonFile(STORE_PATH, { entries: [] });
  return (store.entries || []).find((entry) => entry.id === String(id)) || null;
}

export async function updatePcsoSiteForm(id, patch) {
  const store = await readJsonFile(STORE_PATH, { entries: [] });
  const entries = Array.isArray(store.entries) ? store.entries : [];
  const index = entries.findIndex((entry) => entry.id === String(id));
  if (index < 0) return null;
  entries[index] = { ...entries[index], ...patch, updatedAt: new Date().toISOString() };
  store.entries = entries;
  await writeJsonFile(STORE_PATH, store);
  return entries[index];
}
