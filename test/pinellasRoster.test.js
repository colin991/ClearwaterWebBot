import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  activityForPinellasRoster,
  assignPinellasCallsign,
  parsePinellasRosterRows,
  summarizePinellasPunishments,
} from '../utils/pinellasRoster.js';
import { isActiveMelonlyLoa } from '../utils/melonly.js';

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
  assert.equal(row.notes, 'Manual only');
  assert.equal(row.activity, 'Active');
  assert.equal(row.punishment, 'Clean Record');
});
