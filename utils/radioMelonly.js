import {
  fetchMelonlyDepartmentMemberByDiscord,
  fetchMelonlyDepartmentRanks,
  fetchMelonlyDepartments,
} from './melonly.js';
import { logger } from './logger.js';

/**
 * Melonly department and rank on the radio: shown next to callsigns, and used for rank-based
 * channel access (staff pick which department ranks may use each channel on the staff page).
 */

const RANK_WORDS = [
  [/\bprobationary\b/gi, 'PROB'], [/\bsenior\b/gi, 'SR'], [/\bmaster\b/gi, 'MSTR'], [/\bdeputy\b/gi, 'DEP'],
  [/\bcorporal\b/gi, 'CPL'], [/\bsergeant\b/gi, 'SGT'], [/\blieutenant\b/gi, 'LT'], [/\bcaptain\b/gi, 'CPT'],
  [/\bmajor\b/gi, 'MAJ'], [/\bcolonel\b/gi, 'COL'], [/\bcommander\b/gi, 'CMDR'], [/\bdetective\b/gi, 'DET'],
  [/\bofficer\b/gi, 'OFC'], [/\btrooper\b/gi, 'TPR'], [/\bassistant\b/gi, 'ASST'], [/\bfirefighter\b/gi, 'FF'],
  [/\bdispatcher\b/gi, 'DISP'], [/\bsheriff\b/gi, 'SHERIFF'], [/\bchief\b/gi, 'CHIEF'], [/\bspecialist\b/gi, 'SPEC'],
];

/** "Senior Deputy" -> "SR DEP": short enough for the radio's units list. */
export function shortRank(name) {
  let text = String(name || '').trim();
  for (const [pattern, short] of RANK_WORDS) text = text.replace(pattern, short);
  return text.replace(/\s+/g, ' ').toUpperCase().slice(0, 14);
}

/** "Pinellas County Sheriff's Office" -> "PCSO"; short names stay as they are. */
export function shortDepartment(name) {
  const text = String(name || '').trim();
  const bracket = text.match(/\(([A-Za-z0-9]{2,8})\)/);
  if (bracket) return bracket[1].toUpperCase();
  if (text.length <= 8) return text.toUpperCase();
  const initials = text.replace(/'s\b/gi, '').split(/[\s-]+/).filter((word) => /^[A-Za-z]/.test(word) && !/^(of|the|and|for)$/i.test(word))
    .map((word) => word[0]).join('');
  return (initials || text).toUpperCase().slice(0, 8);
}

/**
 * Looks members up in every Melonly department. lookup(discordId) gives
 * [{ departmentId, department, short, rankId, rank, rankShort }] (empty when not in any).
 */
export function createMelonlyProfiles({ apiKey, fetchDepartments = fetchMelonlyDepartments, fetchRanks = fetchMelonlyDepartmentRanks, fetchMember = fetchMelonlyDepartmentMemberByDiscord }) {
  async function departments() {
    const list = await fetchDepartments(apiKey);
    return (list || []).filter((dept) => dept?.id && dept.activated !== false);
  }

  return {
    get configured() {
      return Boolean(apiKey);
    },
    /** Every department with its ranks, for the staff page's channel access picker. */
    async catalog() {
      if (!apiKey) return [];
      const list = await departments();
      return Promise.all(list.map(async (dept) => ({
        id: String(dept.id),
        name: String(dept.name || 'Department'),
        short: shortDepartment(dept.name),
        ranks: ((await fetchRanks(apiKey, dept.id).catch(() => [])) || [])
          .map((rank) => ({ id: String(rank.id), name: String(rank.name || 'Rank'), position: Number(rank.position) || 0 }))
          .sort((a, b) => a.position - b.position),
      })));
    },
    async lookup(discordId) {
      if (!apiKey || !/^\d{15,22}$/.test(String(discordId))) return [];
      const found = [];
      for (const dept of await departments()) {
        const member = await fetchMember(apiKey, dept.id, discordId).catch((error) => {
          logger.warn(`Radio: Melonly lookup in ${dept.name} failed (${error?.message || error})`);
          return null;
        });
        if (!member?.rankId || member.inactive === true) continue;
        const ranks = await fetchRanks(apiKey, dept.id).catch(() => []);
        const rank = (ranks || []).find((entry) => String(entry.id) === String(member.rankId));
        found.push({
          departmentId: String(dept.id),
          department: String(dept.name || ''),
          short: shortDepartment(dept.name),
          rankId: String(member.rankId),
          rank: String(rank?.name || ''),
          rankShort: shortRank(rank?.name),
        });
      }
      return found;
    },
  };
}

/** The label next to a callsign: "PCSO SGT" (first department), or '' when not in Melonly. */
export function profileLabel(profile) {
  const first = Array.isArray(profile) ? profile[0] : null;
  if (!first) return '';
  return [first.short, first.rankShort].filter(Boolean).join(' ').slice(0, 22);
}

/**
 * Channel access rules from the staff page: { [channelId]: { ranks: ["deptId:rankId", ...] } }.
 * A channel with no rule (or an empty list) is open to everyone.
 */
export function normalizeAccess(raw = {}, channels = ['fire', 'dot', 'marine', 'freq', 'srt', 'event']) {
  const access = {};
  for (const channel of channels) {
    const ranks = Array.isArray(raw?.[channel]?.ranks) ? raw[channel].ranks : [];
    const clean = [...new Set(ranks.map(String).filter((key) => /^[\w-]{1,64}:[\w-]{1,64}$/.test(key)))].slice(0, 200);
    if (clean.length) access[channel] = { ranks: clean };
  }
  return access;
}

/** Whether a member (their Melonly profile, and whether they're an admin) may use a channel. */
export function canUseChannel(access, channel, { profile = [], staff = false } = {}) {
  const rule = access?.[channel];
  if (!rule?.ranks?.length || staff) return true;
  const allowed = new Set(rule.ranks);
  return (profile || []).some((entry) => allowed.has(`${entry.departmentId}:${entry.rankId}`));
}
