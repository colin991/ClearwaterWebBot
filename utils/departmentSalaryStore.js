import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const storePath = join(process.cwd(), 'data', 'department-salaries.json');

export const SALARY_TIMEZONE = 'America/New_York';
export const SALARY_WEEKDAYS = Object.freeze([
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]);

export const defaultDepartmentSalaryConfig = Object.freeze({
  timezone: SALARY_TIMEZONE,
  weekday: 0,
  time: '00:00',
  lastPayoutWeekKey: '',
  lastPayoutAt: null,
  payoutReceipts: {},
  departments: [],
});

function parseTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 0, minute: 0 };
  const hour = Math.min(23, Math.max(0, Number.parseInt(match[1], 10)));
  const minute = Math.min(59, Math.max(0, Number.parseInt(match[2], 10)));
  return { hour, minute };
}

function clampAmount(value) {
  const amount = Math.trunc(Number(value ?? 0));
  return Number.isSafeInteger(amount) && amount >= 0 ? Math.min(amount, 1_000_000) : 0;
}

function normalizePayRole(entry = {}, index = 0) {
  const roleId = String(entry.roleId || entry.employeeRoleId || entry.id || '').trim();
  return {
    id: String(entry.id || randomUUID()),
    roleId: /^\d{16,22}$/.test(roleId) ? roleId : '',
    label: String(entry.label || entry.name || `Role ${index + 1}`).trim().slice(0, 80),
    amount: clampAmount(entry.amount ?? entry.weeklyAmount),
  };
}

function normalizePayRoles(entry = {}) {
  if (Array.isArray(entry.roles) && entry.roles.length) {
    return entry.roles.map((role, index) => normalizePayRole(role, index));
  }
  const legacyRoleId = String(entry.employeeRoleId || '').trim();
  if (/^\d{16,22}$/.test(legacyRoleId)) {
    return [normalizePayRole({
      roleId: legacyRoleId,
      amount: entry.weeklyAmount ?? entry.amount ?? 0,
      label: entry.employeeRoleName || 'Employee',
    }, 0)];
  }
  return [];
}

export function highestPayRoleForMember(department, roleIds = []) {
  const held = new Set((Array.isArray(roleIds) ? roleIds : []).map(String));
  const matches = (department?.roles || [])
    .filter((role) => role.roleId && role.amount > 0 && held.has(String(role.roleId)))
    .sort((a, b) => b.amount - a.amount);
  return matches[0] || null;
}

function normalizeDepartment(entry = {}, index = 0) {
  const roles = normalizePayRoles(entry);
  const top = [...roles].sort((a, b) => b.amount - a.amount)[0] || null;
  return {
    id: String(entry.id || randomUUID()),
    name: String(entry.name || `Department ${index + 1}`).trim().slice(0, 80),
    guildId: /^\d{16,22}$/.test(String(entry.guildId || '')) ? String(entry.guildId) : '',
    roles,
    employeeRoleId: top?.roleId || '',
    weeklyAmount: top?.amount || 0,
    enabled: entry.enabled !== false,
    payMode: entry.payMode === 'hours' ? 'hours' : 'flat',
  };
}

export function normalizeDepartmentSalaryConfig(input = {}) {
  const weekday = Number.parseInt(input.weekday, 10);
  const { hour, minute } = parseTime(input.time);
  const departments = Array.isArray(input.departments)
    ? input.departments.map((entry, index) => normalizeDepartment(entry, index))
    : [];
  const receipts = input.payoutReceipts && typeof input.payoutReceipts === 'object'
    ? input.payoutReceipts
    : {};
  return {
    timezone: SALARY_TIMEZONE,
    weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : 0,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    lastPayoutWeekKey: String(input.lastPayoutWeekKey || '').slice(0, 16),
    lastPayoutAt: input.lastPayoutAt || null,
    payoutReceipts: receipts,
    departments,
  };
}

export async function getDepartmentSalaryConfig() {
  const raw = await readJsonFile(storePath, defaultDepartmentSalaryConfig);
  return normalizeDepartmentSalaryConfig(raw);
}

export async function saveDepartmentSalaryConfig(input, { preservePayoutMeta = false } = {}) {
  const existing = await getDepartmentSalaryConfig();
  const next = normalizeDepartmentSalaryConfig(input);
  if (preservePayoutMeta) {
    next.lastPayoutWeekKey = String(existing.lastPayoutWeekKey || '');
    next.lastPayoutAt = existing.lastPayoutAt || null;
    next.payoutReceipts = existing.payoutReceipts && typeof existing.payoutReceipts === 'object'
      ? existing.payoutReceipts
      : {};
  }
  await writeJsonFile(storePath, next, { backup: true });
  return next;
}

function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[map.weekday] ?? 0,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === '24' ? '0' : map.hour),
    minute: Number(map.minute),
  };
}

function isoWeekKeyFromParts({ year, month, day }) {
  const utc = Date.UTC(year, month - 1, day);
  const date = new Date(utc);
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const weekYear = date.getUTCFullYear();
  const yearStart = Date.UTC(weekYear, 0, 1);
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

export function salaryWeekKey(date = new Date(), config = defaultDepartmentSalaryConfig) {
  const parts = zonedParts(date, config.timezone || SALARY_TIMEZONE);
  return isoWeekKeyFromParts(parts);
}

function zonedInstantMs({ year, month, day, hour, minute }, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
    const delta = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - asUtc;
    guess += delta;
  }
  return guess;
}

function addDaysToParts(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function computeNextSalaryPayoutAt(config = defaultDepartmentSalaryConfig, now = new Date()) {
  const timeZone = config.timezone || SALARY_TIMEZONE;
  const { hour, minute } = parseTime(config.time);
  const current = zonedParts(now, timeZone);
  const targetWeekday = Number.isInteger(config.weekday) ? config.weekday : 0;
  let dayOffset = (targetWeekday - current.weekday + 7) % 7;
  let targetDay = { year: current.year, month: current.month, day: current.day };
  if (dayOffset === 0) {
    const todayMs = zonedInstantMs({ ...current, hour, minute }, timeZone);
    if (now.getTime() >= todayMs) dayOffset = 7;
  }
  if (dayOffset) targetDay = addDaysToParts(current, dayOffset);
  return new Date(zonedInstantMs({ ...targetDay, hour, minute }, timeZone)).toISOString();
}

export function isSalaryPayoutDue(config = defaultDepartmentSalaryConfig, now = new Date()) {
  const timeZone = config.timezone || SALARY_TIMEZONE;
  const { hour, minute } = parseTime(config.time);
  const current = zonedParts(now, timeZone);
  if (current.weekday !== (Number.isInteger(config.weekday) ? config.weekday : 0)) return false;
  if (current.hour !== hour || current.minute !== minute) return false;
  const weekKey = salaryWeekKey(now, config);
  return weekKey !== String(config.lastPayoutWeekKey || '');
}

export function salaryReceiptKey(weekKey, departmentId, discordId) {
  return `${weekKey}:${departmentId}:${discordId}`;
}

export function hasSalaryReceipt(config, weekKey, departmentId, discordId) {
  const key = salaryReceiptKey(weekKey, departmentId, discordId);
  return Boolean(config?.payoutReceipts?.[key]);
}

export function rememberSalaryReceipt(config, weekKey, departmentId, discordId) {
  const key = salaryReceiptKey(weekKey, departmentId, discordId);
  config.payoutReceipts = config.payoutReceipts && typeof config.payoutReceipts === 'object'
    ? config.payoutReceipts
    : {};
  config.payoutReceipts[key] = new Date().toISOString();
  const entries = Object.entries(config.payoutReceipts);
  if (entries.length > 5000) {
    config.payoutReceipts = Object.fromEntries(entries.slice(-4000));
  }
}

export function enabledSalaryDepartments(config = defaultDepartmentSalaryConfig) {
  return (config.departments || []).filter((department) => (
    department.enabled
    && department.guildId
    && (department.roles || []).some((role) => role.roleId && role.amount > 0)
  ));
}

export function publicSalarySchedule(config = defaultDepartmentSalaryConfig) {
  const nextPayoutAt = computeNextSalaryPayoutAt(config);
  return {
    timezone: config.timezone || SALARY_TIMEZONE,
    weekday: config.weekday,
    time: config.time,
    lastPayoutAt: config.lastPayoutAt || null,
    lastPayoutWeekKey: config.lastPayoutWeekKey || '',
    nextPayoutAt,
  };
}

export function publicSalaryDepartments(config = defaultDepartmentSalaryConfig) {
  return (config.departments || []).map((department) => ({
    id: department.id,
    name: department.name,
    guildId: department.guildId,
    roles: (department.roles || []).map((role) => ({ ...role })),
    employeeRoleId: department.employeeRoleId,
    weeklyAmount: department.weeklyAmount,
    enabled: department.enabled,
    payMode: department.payMode,
  }));
}
