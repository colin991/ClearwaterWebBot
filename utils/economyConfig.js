/** Central Clearwater Economy V2 configuration. */

export const ECONOMY_STARTER_GRANT = 500;
export const ECONOMY_DEATH_FEE = 500;
export const ECONOMY_JOB_PAY = 20;
export const ECONOMY_PAY_INTERVAL_MS = 10 * 60 * 1000;
export const ECONOMY_MIN_LEO = 10;
export const ECONOMY_ROBBERY_RESERVE_MS = 5 * 60 * 1000;
export const ECONOMY_ROBBERY_PREPARE_MS = 30 * 60 * 1000;
export const ECONOMY_ROBBERY_ABSENT_MS = 45_000;
export const ECONOMY_STEAL_SUCCESS_CHANCE = 50;
export const ECONOMY_STEAL_DISTANCE = 10;
export const ECONOMY_STEAL_COOLDOWN_MS = 45_000;
export const ECONOMY_TRANSFER_COOLDOWN_MS = 8_000;
export const ECONOMY_TRANSFER_TAX_PERCENT = 5;
export const ECONOMY_TX_RECENT = 12;
export const ECONOMY_TX_KEEP = 4_000;
export const ECONOMY_SCENE_RADIUS = 45;
/** The public API exposes Civilian team status, but not the player's in-game civilian job. */
export function isPaidCivilianJob(team) {
  return /^civilian(?:\s+team)?$/i.test(String(team || '').trim());
}

export const ECONOMY_PANEL_CHANNEL_ID = '1545267006360649728';
export const ECONOMY_LOG_CHANNEL_ID = '1549178818814812211';

export const ECONOMY_TX = Object.freeze({
  STARTER_GRANT: 'STARTER_GRANT',
  TRANSFER: 'TRANSFER',
  TRANSFER_TAX: 'TRANSFER_TAX',
  JOB_PAYCHECK: 'JOB_PAYCHECK',
  DEPARTMENT_SHIFT_PAY: 'DEPARTMENT_SHIFT_PAY',
  ROBBERY_PAYOUT: 'ROBBERY_PAYOUT',
  DEATH_FEE: 'DEATH_FEE',
  STEAL: 'STEAL',
  BANK_DEPOSIT: 'BANK_DEPOSIT',
  BANK_WITHDRAWAL: 'BANK_WITHDRAWAL',
  DEPARTMENT_WEEKLY_GRANT: 'DEPARTMENT_WEEKLY_GRANT',
  DEPARTMENT_PAYROLL: 'DEPARTMENT_PAYROLL',
  DEPARTMENT_TRANSFER: 'DEPARTMENT_TRANSFER',
  DEPARTMENT_PURCHASE: 'DEPARTMENT_PURCHASE',
  ADMIN_ADJUSTMENT: 'ADMIN_ADJUSTMENT',
  CITATION_FINE: 'CITATION_FINE',
  REFUND: 'REFUND',
});

export const ECONOMY_DEPARTMENTS = Object.freeze([
  {
    id: 'fhp',
    name: 'Florida Highway Patrol',
    short: 'FHP',
    guildId: '1513609541483499790',
    weeklyGrant: 250_000,
    shiftPay: 100,
    emoji: '<:FHP_Logo:1514421266776461314>',
    melonlyDepartmentId: '7470614371899543552',
  },
  {
    id: 'pcso',
    name: 'Pinellas County Sheriff\'s Office',
    short: 'PCSO',
    guildId: '1514100977920245760',
    weeklyGrant: 250_000,
    shiftPay: 100,
    emoji: '<:slogo:1546245229420744804>',
    melonlyDepartmentId: '7470323914464301056',
  },
  {
    id: 'dispatch',
    name: 'Pinellas County 911 Center',
    short: '911 Center',
    guildId: '1515101455525085337',
    weeklyGrant: 50_000,
    shiftPay: 50,
    emoji: '<:dispatch:1522721479370870825>',
    melonlyDepartmentId: '7471402738098638848',
  },
  {
    id: 'cfr',
    name: 'Clearwater Fire & Rescue',
    short: 'CFR',
    guildId: '1514804886292795544',
    weeklyGrant: 100_000,
    shiftPay: 50,
    emoji: '<:CFD:1514806304621989978>',
    melonlyDepartmentId: '7471029576076890112',
  },
  {
    id: 'bpd',
    name: 'Belleair Police Department',
    short: 'BPD',
    guildId: '1526890993327280240',
    weeklyGrant: 100_000,
    shiftPay: 50,
    emoji: '<:bpd_logo:1535160817606074378>',
    melonlyDepartmentId: '7492084093606170624',
  },
]);

export const ECONOMY_ROBBERIES = Object.freeze([
  {
    id: 'bank',
    name: 'Bank Heist',
    payout: 6_500,
    sceneMs: 2 * 60_000,
    survivalMs: 20 * 60_000,
    cooldownMs: 20 * 60_000,
    minLeo: ECONOMY_MIN_LEO,
    callKinds: ['bank'],
  },
  {
    id: 'jewelry',
    name: 'Jewelry Store Robbery',
    payout: 3_000,
    sceneMs: 60_000,
    survivalMs: 15 * 60_000,
    cooldownMs: 15 * 60_000,
    minLeo: ECONOMY_MIN_LEO,
    callKinds: ['jewelry'],
  },
  {
    id: 'house',
    name: 'House Robbery',
    payout: 1_500,
    sceneMs: 60_000,
    survivalMs: 13 * 60_000,
    cooldownMs: 12 * 60_000,
    minLeo: ECONOMY_MIN_LEO,
    callKinds: ['leo_server', 'house'],
  },
  {
    id: 'atm',
    name: 'ATM Robbery',
    payout: 700,
    sceneMs: 0,
    survivalMs: 12 * 60_000 + 30_000,
    cooldownMs: 10 * 60_000,
    minLeo: ECONOMY_MIN_LEO,
    callKinds: ['atm'],
  },
  {
    id: 'register',
    name: 'Cash Register Robbery',
    payout: 300,
    sceneMs: 0,
    survivalMs: 10 * 60_000,
    cooldownMs: 8 * 60_000,
    minLeo: ECONOMY_MIN_LEO,
    callKinds: ['leo_server', 'register', 'cash'],
  },
]);

export function departmentById(id) {
  return ECONOMY_DEPARTMENTS.find((entry) => entry.id === String(id || '')) || null;
}

export function departmentByGuildId(guildId) {
  return ECONOMY_DEPARTMENTS.find((entry) => entry.guildId === String(guildId || '')) || null;
}

export function robberyById(id) {
  return ECONOMY_ROBBERIES.find((entry) => entry.id === String(id || '')) || null;
}

/** Map an ER:LC 911/call description to a configured robbery kind. */
export function matchRobberyKindFromText(text) {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return '';
  if (/\bbank\b/.test(lower) && /\b(rob|heist|robbery)\b/.test(lower)) return 'bank';
  if (/jewel/.test(lower) && /\b(rob|heist|robbery)\b/.test(lower)) return 'jewelry';
  if (/\batm\b/.test(lower) && /\b(rob|heist|robbery)\b/.test(lower)) return 'atm';
  if ((/\bcash\s*register\b/.test(lower) || (/\bregister\b/.test(lower) && /\b(rob|heist|robbery)\b/.test(lower)))) return 'register';
  if (/\b(house|home|residential)\b/.test(lower) && /\b(rob|heist|robbery)\b/.test(lower)) return 'house';
  return '';
}

export function robberyPriorityLabel(kind) {
  const robbery = robberyById(kind);
  if (!robbery) return 'Robbery';
  if (kind === 'bank') return 'Bank Robbery';
  if (kind === 'jewelry') return 'Jewelry Robbery';
  if (kind === 'atm') return 'ATM Robbery';
  if (kind === 'register') return 'Cash Register Robbery';
  if (kind === 'house') return 'House Robbery';
  return robbery.name;
}

export function robberyFailReasonText(reason) {
  switch (String(reason || '')) {
    case 'died':
      return 'You died before completing the robbery.';
    case 'left-server':
      return 'You left the server before completing the robbery.';
    case 'jailed':
      return 'You were arrested or sent to jail.';
    case 'left-scene':
      return 'You left the robbery scene too early.';
    case 'player-cancel':
      return 'The robbery was cancelled.';
    case 'reservation-expired':
      return 'The robbery setup expired before it was committed.';
    default:
      return 'The robbery was unsuccessful.';
  }
}

export function formatMoney(amount) {
  const value = Math.trunc(Number(amount) || 0);
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US')}`;
}

export function transferTaxAmount(amount) {
  const value = Math.trunc(Number(amount) || 0);
  if (value <= 0) return 0;
  return Math.trunc((value * ECONOMY_TRANSFER_TAX_PERCENT) / 100);
}

export function parseMoney(value) {
  const cleaned = String(value || '').replace(/[$,\s]/g, '');
  if (!/^[+-]?\d+$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

export function formatRemain(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function economyWeekKey(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const utc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day));
  const date = new Date(utc);
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const weekYear = date.getUTCFullYear();
  const yearStart = Date.UTC(weekYear, 0, 1);
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}
