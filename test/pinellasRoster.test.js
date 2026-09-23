import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  activityForPinellasRoster,
  assignPinellasCallsign,
  parsePinellasRosterRows,
  planPinellasCallsignRepairs,
  resolvePinellasRosterMemberStatus,
  summarizePinellasPunishments,
} from '../utils/pinellasRoster.js';
import { isActiveMelonlyLoa, shiftLastActivityMs } from '../utils/melonly.js';

test('roster status values follow sheet dropdown choices', () => {
  const now = Date.now();
  assert.equal(summarizePinellasPunishments([], now), 'Clean Record');
  assert.equal(summarizePinellasPunishments([
    { type: 'strike', status: 'active', expiresAt: new Date(now + 60_000).toISOString() },
  ], now), 'Strike 1');
  assert.equal(summarizePinellasPunishments([
    { type: 'suspension', status: 'active', expiresAt: new Date(now + 60_000).toISOString() },
  ], now), 'Suspended');
  assert.equal(activityForPinellasRoster('Activity Exempt'), 'Activity Exempt');
  assert.equal(activityForPinellasRoster('Active', { onLoa: true }), 'LOA');
  assert.equal(isActiveMelonlyLoa({
    reviewedAt: Math.floor(now / 1000),
    startAt: Math.floor(now / 1000) - 10,
    endAt: Math.floor(now / 1000) + 60,
  }, now), true);
  assert.equal(shiftLastActivityMs({
    createdAt: Math.floor((now - 60_000) / 1000),
    endedAt: Math.floor(now / 1000),
  }), Math.floor(now / 1000) * 1000);
});

function rosterState({ recent = [], complete = true, loa = [], infractions = [] } = {}) {
  return {
    infractionsByUser: new Map(infractions),
    loaIds: new Set(loa),
    recentShiftState: { discordIds: new Set(recent), complete },
    activityState: { baseByUser: {}, inactiveByUser: {} },
    activityStateChanged: false,
  };
}

test('four days without a shift marks inactive and a new shift restores active', () => {
  const discordId = '123456789012345678';
  const state = rosterState();
  assert.equal(resolvePinellasRosterMemberStatus(state, discordId, 'Active').activity, 'Inactive');
  assert.equal(state.activityState.inactiveByUser[discordId], true);

  state.recentShiftState.discordIds.add(discordId);
  assert.equal(resolvePinellasRosterMemberStatus(state, discordId, 'Inactive').activity, 'Active');
  assert.equal(state.activityState.inactiveByUser[discordId], undefined);
});

test('manual inactivity and Activity Exempt are not automatically cleared', () => {
  const discordId = '123456789012345678';
  const recent = rosterState({ recent: [discordId] });
  assert.equal(resolvePinellasRosterMemberStatus(recent, discordId, 'Inactive').activity, 'Inactive');

  const exempt = rosterState();
  assert.equal(resolvePinellasRosterMemberStatus(exempt, discordId, 'Activity Exempt').activity, 'Activity Exempt');
});

test('suspension and LOA take priority over inactivity', () => {
  const discordId = '123456789012345678';
  const loa = rosterState({ loa: [discordId] });
  assert.equal(resolvePinellasRosterMemberStatus(loa, discordId, 'Inactive').activity, 'LOA');

  const suspension = rosterState({
    loa: [discordId],
    infractions: [[discordId, [{ type: 'suspension', status: 'active', expiresAt: null }]]],
  });
  assert.equal(resolvePinellasRosterMemberStatus(suspension, discordId, 'Inactive').activity, 'Suspension');

  const incomplete = rosterState({ complete: false });
  assert.equal(resolvePinellasRosterMemberStatus(incomplete, discordId, 'Active').activity, 'Active');
});
test('rank change selects an open callsign row and carries manual notes', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const originalFetch = global.fetch;
  let batchBody = null;

  global.fetch = async (url, options = {}) => {
    const address = String(url);
    if (address.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (address.includes('/values:batchUpdate')) {
      batchBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ totalUpdatedCells: batchBody.data.length }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (address.includes('/values/')) {
      return new Response(JSON.stringify({
        values: [
          ['Master Deputy', null, '1201', null, 'Old Name', null, '123456789012345678', null, 'Manual appointment', null, 'Active', null, 'Clean Record'],
          ['Deputy Second Class', null, '1300', null, '', null, '', null, '', null, 'N/A', null, 'Clean Record'],
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected URL: ${address}`);
  };

  try {
    const client = {
      config: {
        googleServiceAccountEmail: 'sheet-bot@example.iam.gserviceaccount.com',
        googlePrivateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        pcsoRosterSpreadsheetId: 'test-sheet',
        melonlyApiKey: '',
      },
    };
    const member = {
      id: '123456789012345678',
      guild: { id: '1514100977920245760' },
      roles: { cache: new Map([['1514359908978397254', {}]]) },
    };

    const result = await assignPinellasCallsign(client, member, 'Alex Morgan');
    assert.equal(result.callsign, '1300');
    assert.equal(result.nickname, '1300 | Alex Morgan');
    assert.equal(result.moved, true);

    const updates = new Map(batchBody.data.map((entry) => [entry.range, entry.values[0][0]]));
    assert.equal(updates.get("'PCSO I Main Database'!M12"), 'Manual appointment');
    assert.equal(updates.get("'PCSO I Main Database'!M11"), '');
    assert.equal(updates.get("'PCSO I Main Database'!I12"), 'Alex Morgan');
    assert.equal(updates.get("'PCSO I Main Database'!K12"), member.id);
    assert.equal([...updates.keys()].some((range) => /![EG]\d+$/.test(range)), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('roster parser keeps the manual notes column separate', () => {
  const [row] = parsePinellasRosterRows([
    ['Corporal', null, '1132', null, 'Taylor West', null, '123456789012345678', null, 'Manual only', null, 'Active', null, 'Clean Record'],
  ]);
  assert.equal(row.rowNumber, 11);
  assert.equal(row.rank, 'Corporal');
  assert.equal(row.callsign, '1132');
  assert.equal(row.callsignColumn, 'F');
  assert.equal(row.notes, 'Manual only');
  assert.equal(row.activity, 'Active');
  assert.equal(row.punishment, 'Clean Record');
});

test('roster parser treats a numeric left column as the callsign', () => {
  const [row] = parsePinellasRosterRows([
    ['2100', '09/21/2026', 'Master Sergeant', null, 'SpookySleepyyZ', null, '107', null, '', null, 'Active', null, 'Juan Martinez'],
  ]);
  assert.equal(row.rank, 'Master Sergeant');
  assert.equal(row.callsign, '2100');
  assert.equal(row.callsignColumn, 'D');
});

function rankRows(rank, callsigns) {
  return callsigns.map((callsign) => ({
    rank,
    callsign: String(callsign),
    callsignColumn: 'D',
    rowNumber: 11,
  }));
}

test('repairs duplicated Staff Sergeant callsigns and cascades Sergeant', () => {
  const rows = [
    ...rankRows('Master Sergeant', [2100, 2101, 2102, 2103, 2104, 2105, 2106, 2107, 2108, 2109]),
    ...rankRows('Staff Sergeant', [2110, 2111, 2112, 2113, 2114, 2115, 2112, 2113, 2114, 2115]),
    ...rankRows('Sergeant', [2116, 2117, 2118, 2119, 2120, 2121, 2122, 2123, 2124, 2125]),
    { rank: '', callsign: '', callsignColumn: 'D', rowNumber: 41 },
    ...rankRows('Master Deputy', [1201, 1202, 1203]),
  ];
  rows.forEach((row, index) => { row.rowNumber = index + 11; });

  const repairs = planPinellasCallsignRepairs(rows);
  assert.deepEqual(
    repairs.map((entry) => `${entry.from}->${entry.to}`),
    ['2112->2116', '2113->2117', '2114->2118', '2115->2119',
      '2116->2120', '2117->2121', '2118->2122', '2119->2123',
      '2120->2124', '2121->2125', '2122->2126', '2123->2127',
      '2124->2128', '2125->2129'],
  );
  assert.equal(repairs.every((entry) => entry.column === 'D'), true);
  assert.deepEqual(
    rows.filter((row) => row.rank === 'Staff Sergeant').map((row) => row.callsign),
    ['2110', '2111', '2112', '2113', '2114', '2115', '2116', '2117', '2118', '2119'],
  );
  assert.deepEqual(
    rows.filter((row) => row.rank === 'Sergeant').map((row) => row.callsign),
    ['2120', '2121', '2122', '2123', '2124', '2125', '2126', '2127', '2128', '2129'],
  );
  assert.deepEqual(
    rows.filter((row) => row.rank === 'Master Deputy').map((row) => row.callsign),
    ['1201', '1202', '1203'],
  );
});

test('does not rewrite unique sequential callsigns', () => {
  const rows = rankRows('Staff Sergeant', [2110, 2111, 2112, 2113, 2114, 2115, 2116, 2117, 2118, 2119]);
  assert.deepEqual(planPinellasCallsignRepairs(rows), []);
});
