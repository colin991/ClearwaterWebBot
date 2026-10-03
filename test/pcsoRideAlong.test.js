import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRideAlongService,
  eligibleRideAlongSupervisors,
  parseRideAlongButton,
  RIDE_ALONG_DURATION_MS,
  RIDE_ALONG_RULES,
  rulesPayload,
  validateRideAlongRequest,
} from '../utils/pcsoRideAlong.js';
import { complaintMapPoint, formatWebsiteComplaint } from '../utils/pcsoSitePortal.js';

const HOUR = 60 * 60_000;
const MIN = 60_000;

function harness(start = Date.parse('2026-10-13T12:00:00Z')) {
  let data = { requests: [] };
  const clock = { t: start };
  const dms = [];
  const edits = [];
  let messageId = 0;
  const service = createRideAlongService({
    store: {
      read: async () => structuredClone(data),
      write: async (next) => { data = structuredClone(next); },
    },
    now: () => clock.t,
    dmUser: async (userId, payload) => {
      messageId += 1;
      dms.push({ userId: String(userId), payload });
      return { channelId: `dm-${userId}`, messageId: `m${messageId}` };
    },
    editMessage: async (ref, payload) => { edits.push({ ref, payload }); },
    onDutySupervisors: async () => [{ discordId: 'sup1' }, { discordId: 'sup2' }],
    userName: async (id) => `name-${id}`,
    supervisorProfile: async (id) => ({ rankName: 'Sergeant', roleplayName: `Miller ${id}`, callsign: '1S-02' }),
    renderWaiverPdf: async (record, options) => Buffer.from(`PDF ${record.waiver.signature} ${options.claimerName}`),
  });
  return { service, clock, dms, edits, data: () => data };
}

const user = { id: 'rider1', username: 'rider' };

async function approvedRide(h, offset = 3 * HOUR) {
  await h.service.request(user, {
    firstName: 'John', lastName: 'Doe', dob: '1995-04-02', waiverAgree: true, waiverSignature: 'John Doe',
    startAt: new Date(h.clock.t + offset).toISOString(),
    label: 'Tue, Oct 13, 3:00 PM',
  });
  const id = h.data().requests[0].id;
  await h.service.approve('admin1', id, { scheduledAt: h.clock.t + offset, meetingPlace: "Sheriff's Station" });
  return id;
}

test('ride along requests need a name, DOB, and a future timeframe', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  assert.throws(() => validateRideAlongRequest({ lastName: 'Doe', dob: '1990-01-01' }, now), /first name/);
  assert.throws(() => validateRideAlongRequest({ firstName: 'J', lastName: 'D', dob: 'x' }, now), /date of birth/);
  assert.throws(() => validateRideAlongRequest({
    firstName: 'J', lastName: 'D', dob: '1990-01-01', startAt: now + 10 * MIN, endAt: now + HOUR,
  }, now), /1 hour/);
  assert.throws(() => validateRideAlongRequest({ firstName: 'J', lastName: 'D', dob: '1990-01-01' }, now), /start time/);
  const ok = validateRideAlongRequest({
    firstName: 'J', lastName: 'D', dob: '1990-01-01', startAt: now + 3 * HOUR, endAt: now + 9 * HOUR,
    waiverAgree: true, waiverSignature: ' j  d ',
  }, now);
  assert.equal(ok.timeframe.endAt - ok.timeframe.startAt, RIDE_ALONG_DURATION_MS);
});

test('ride along requests need a signed liability waiver matching the roleplay name', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const base = { firstName: 'John', lastName: 'Doe', dob: '1990-01-01', startAt: now + 3 * HOUR };
  assert.throws(() => validateRideAlongRequest({ ...base, waiverSignature: 'John Doe' }, now), /agree to the liability waiver/);
  assert.throws(() => validateRideAlongRequest({ ...base, waiverAgree: true }, now), /Type your roleplay name/);
  assert.throws(() => validateRideAlongRequest({ ...base, waiverAgree: true, waiverSignature: 'Jane Roe' }, now), /exactly: John Doe/);
  assert.equal(validateRideAlongRequest({ ...base, waiverAgree: true, waiverSignature: 'john doe' }, now).waiver.signature, 'john doe');
});

test('the signed waiver is DMed to the rider and claimer at start and logged for admins', async () => {
  const h = harness();
  const id = await approvedRide(h);
  h.clock.t += 2 * HOUR + 45 * MIN;
  await h.service.tick();
  await h.service.claim('sup1', id);
  h.clock.t += 15 * MIN;
  await h.service.tick();
  const before = h.dms.length;
  await h.service.start('sup1', id);
  const sent = h.dms.slice(before);
  assert.deepEqual(sent.map((dm) => dm.userId), ['rider1', 'sup1']);
  for (const dm of sent) {
    assert.match(dm.payload.content, /liability waiver/);
    assert.equal(dm.payload.files.length, 1);
    assert.equal(dm.payload.files[0].name, 'ride-along-waiver-John-Doe.pdf');
    assert.equal(String(dm.payload.files[0].attachment), 'PDF John Doe Sergeant Miller sup1 · 1S-02');
  }
  const view = await h.service.adminView();
  assert.equal(view.waivers.length, 1);
  assert.equal(view.waivers[0].signature, 'John Doe');
  assert.ok(view.waivers[0].sentAt);
  assert.equal((await h.service.waiverPdf(id)).filename, 'ride-along-waiver-John-Doe.pdf');
});

test('older requests without a waiver can sign it from the website', async () => {
  const h = harness();
  const id = await approvedRide(h);
  const stored = h.data();
  delete stored.requests[0].waiver;
  assert.equal((await h.service.listForUser('rider1')).mine[0].waiverSigned, false);
  await assert.rejects(h.service.signWaiver({ id: 'x' }, id, { waiverAgree: true, waiverSignature: 'John Doe' }), /your own/);
  const signed = await h.service.signWaiver(user, id, { waiverAgree: true, waiverSignature: 'John Doe' });
  assert.equal(signed.waiverSigned, true);
  await assert.rejects(h.service.signWaiver(user, id, { waiverAgree: true, waiverSignature: 'John Doe' }), /already signed/);
});

test('approve and deny leave a website notice that clears once seen', async () => {
  const h = harness();
  await approvedRide(h);
  let { notices } = await h.service.notices('rider1');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, 'approved');
  assert.equal(notices[0].meetingPlace, "Sheriff's Station");
  assert.equal((await h.service.markNoticeSeen('rider1', notices[0].id)).notices.length, 0);
  assert.equal((await h.service.notices('someone-else')).notices.length, 0);

  const h2 = harness();
  await h2.service.request(user, { firstName: 'A', lastName: 'B', dob: '1990-01-01', waiverAgree: true, waiverSignature: 'A B', startAt: h2.clock.t + 2 * HOUR });
  await h2.service.deny('admin1', h2.data().requests[0].id, 'No supervisors that day');
  ({ notices } = await h2.service.listForUser('rider1'));
  assert.equal(notices[0].kind, 'denied');
  assert.equal(notices[0].text, 'No supervisors that day');
});

test('riders can review a finished ride along once and admins see it', async () => {
  const h = harness();
  const id = await approvedRide(h);
  await assert.rejects(h.service.review(user, id, { rating: 5 }), /once your ride along is finished/);
  h.clock.t += 2 * HOUR + 45 * MIN;
  await h.service.tick();
  await h.service.claim('sup1', id);
  h.clock.t += 15 * MIN;
  await h.service.tick();
  await h.service.start('sup1', id);
  h.clock.t += 41 * MIN;
  await h.service.tick();
  const { notices, mine } = await h.service.listForUser('rider1');
  assert.ok(notices.some((notice) => notice.kind === 'review'));
  assert.equal(mine[0].canReview, true);
  await assert.rejects(h.service.review(user, id, { rating: 9 }), /1 to 5/);
  await assert.rejects(h.service.review({ id: 'other' }, id, { rating: 4 }), /your own/);
  await h.service.review(user, id, { rating: 4, feedback: '  Great deputy, very professional.  ' });
  await assert.rejects(h.service.review(user, id, { rating: 5 }), /already left a review/);
  const view = await h.service.adminView();
  assert.equal(view.reviews.length, 1);
  assert.equal(view.reviews[0].rating, 4);
  assert.equal(view.reviews[0].feedback, 'Great deputy, very professional.');
  assert.equal(view.reviews[0].claimedBy, 'sup1');
  assert.ok(!(await h.service.notices('rider1')).notices.some((notice) => notice.kind === 'review'));
});

test('full ride along flow: approve, check-in, supervisor claim, start, rules', async () => {
  const h = harness();
  const id = await approvedRide(h);
  assert.match(h.dms.at(-1).payload.content, /approved/);
  assert.equal(h.data().requests[0].scheduledAt + RIDE_ALONG_DURATION_MS, h.data().requests[0].scheduledAt + 40 * MIN);

  h.clock.t += 2 * HOUR;
  await h.service.tick();
  const confirm = h.dms.at(-1);
  assert.equal(confirm.userId, 'rider1');
  assert.match(confirm.payload.content, /starts in 1 hour/);
  assert.deepEqual(confirm.payload.components[0].components.map((b) => b.data.custom_id), [`pra:here:${id}`, `pra:end:${id}`]);
  await h.service.tick();
  assert.equal(h.dms.filter((dm) => /starts in 1 hour/.test(dm.payload.content)).length, 1);

  h.clock.t += 45 * MIN;
  await h.service.tick();
  const alerts = h.dms.filter((dm) => /starting in 15 minutes/.test(dm.payload.content));
  assert.deepEqual(alerts.map((dm) => dm.userId), ['sup1', 'sup2']);
  assert.match(alerts[0].payload.content, /Roleplay Name:\*\* John Doe/);
  assert.match(alerts[0].payload.content, /Their DOB:\*\* 04\/02\/1995/);
  assert.match(h.dms.at(-1).payload.content, /looking for an active supervisor/);

  await h.service.claim('sup2', id);
  await assert.rejects(h.service.claim('sup1', id), /already been claimed/);
  const struck = h.edits.find((edit) => edit.ref.userId === 'sup1');
  assert.match(struck.payload.content, /^~~/);
  assert.match(struck.payload.content, /already been claimed by <@sup2>/);
  const claimer = h.dms.find((dm) => dm.userId === 'sup2' && /You claimed/.test(dm.payload.content));
  assert.match(claimer.payload.content, /End Time/);
  const rider = h.dms.find((dm) => dm.userId === 'rider1' && /claimed your Ride Along/.test(dm.payload.content));
  assert.match(rider.payload.content, /Meeting Spot:\*\* Sheriff's Station/);
  assert.match(rider.payload.content, /\*\*Supervisor:\*\* Sergeant Miller sup2 · 1S-02 \(<@sup2>\)/);
  assert.equal((await h.service.listForUser('rider1')).mine[0].supervisorName, 'Sergeant Miller sup2 · 1S-02');
  assert.doesNotMatch(rider.payload.content, /DOB/);

  h.clock.t += 15 * MIN;
  await h.service.tick();
  const prompt = h.dms.at(-1);
  assert.equal(prompt.userId, 'sup2');
  assert.match(prompt.payload.content, /time to start/);
  await assert.rejects(h.service.noShow('sup2', id), /No Show <t:/);
  await assert.rejects(h.service.start('sup1', id), /Only the supervisor/);
  await h.service.start('sup2', id);
  assert.deepEqual(rulesPayload().content.split('\n').slice(2), [...RIDE_ALONG_RULES]);

  h.clock.t += 41 * MIN;
  await h.service.tick();
  assert.equal(h.data().requests[0].status, 'completed');
});

test('no show is allowed 10 minutes after the start and is logged for admins', async () => {
  const h = harness();
  const id = await approvedRide(h);
  h.clock.t += 2 * HOUR + 45 * MIN;
  await h.service.tick();
  await h.service.claim('sup1', id);
  h.clock.t += 15 * MIN;
  await h.service.tick();
  h.clock.t += 10 * MIN;
  await h.service.noShow('sup1', id);
  const view = await h.service.adminView();
  assert.equal(view.noShows.length, 1);
  assert.equal(view.noShows[0].count, 1);
  assert.equal(view.history[0].status, 'no_show');
});

test('requester can end a ride along and supervisors see it was ended', async () => {
  const h = harness();
  const id = await approvedRide(h);
  h.clock.t += 2 * HOUR + 45 * MIN;
  await h.service.tick();
  await h.service.end('rider1', id);
  assert.equal(h.data().requests[0].status, 'cancelled');
  assert.equal(h.edits.length, 2);
  assert.match(h.edits[0].payload.content, /ended by the requester/);
  await assert.rejects(h.service.claim('sup1', id), /no longer available/);
});

test('delay requests wait for admin approval and then reschedule the reminders', async () => {
  const h = harness();
  const id = await approvedRide(h);
  const later = h.clock.t + 6 * HOUR;
  await h.service.requestDelay(user, id, { startAt: later, endAt: later + HOUR, label: 'later' });
  let view = await h.service.adminView();
  assert.equal(view.delays.length, 1);
  assert.equal(h.data().requests[0].scheduledAt, h.clock.t + 3 * HOUR);
  await h.service.reviewDelay('admin1', id, { approve: true, scheduledAt: later, meetingPlace: 'City Hall' });
  view = await h.service.adminView();
  assert.equal(view.delays.length, 0);
  assert.equal(view.upcoming[0].scheduledAt, later);
  assert.equal(view.upcoming[0].meetingPlace, 'City Hall');
  h.clock.t += 2 * HOUR;
  await h.service.tick();
  assert.equal(h.dms.filter((dm) => /starts in 1 hour/.test(dm.payload.content)).length, 0);
});

test('unclaimed ride alongs are released after the grace period', async () => {
  const h = harness();
  await approvedRide(h);
  h.clock.t += 2 * HOUR + 45 * MIN;
  await h.service.tick();
  h.clock.t += 31 * MIN;
  await h.service.tick();
  assert.equal(h.data().requests[0].status, 'unclaimed');
  assert.match(h.dms.at(-1).payload.content, /No on-duty supervisor was available/);
});

test('only one open ride along request per person', async () => {
  const h = harness();
  await approvedRide(h);
  await assert.rejects(h.service.request(user, {
    firstName: 'A', lastName: 'B', dob: '1990-01-01', waiverAgree: true, waiverSignature: 'A B', startAt: h.clock.t + 5 * HOUR, endAt: h.clock.t + 6 * HOUR,
  }), /already have a ride along/);
});

test('ride along buttons parse and approve rejects unknown meeting places', async () => {
  assert.deepEqual(parseRideAlongButton('pra:claim:ra_abc_123'), { action: 'claim', id: 'ra_abc_123' });
  assert.equal(parseRideAlongButton('pra:steal:ra_abc'), null);
  const h = harness();
  await h.service.request(user, {
    firstName: 'A', lastName: 'B', dob: '1990-01-01', waiverAgree: true, waiverSignature: 'A B', startAt: h.clock.t + 2 * HOUR, endAt: h.clock.t + 3 * HOUR,
  });
  await assert.rejects(h.service.approve('admin', h.data().requests[0].id, { scheduledAt: h.clock.t + HOUR, meetingPlace: 'Beach' }), /meeting place/);
});

test('website complaints become an Office of Professional Compliance ticket inquiry', () => {
  const fields = {
    trooperName: 'Dep. Smith', badgeNumber: '1A-12', location: 'Gas station', reason: 'Rude',
    description: 'Was rude during a stop.', witnesses: '', mapLeft: 0.2814, mapTop: 0.811,
  };
  const text = formatWebsiteComplaint(fields);
  assert.match(text, /Trooper’s name\nDep\. Smith/);
  assert.match(text, /Badge number\n1A-12/);
  assert.match(text, /Where it happened in-game\nMarked on the map near postal 201 \(map below\)\.\nLandmark: Gas station/);
  assert.match(text, /Witnesses\nNone listed/);
  assert.match(formatWebsiteComplaint({ ...fields, location: '' }), /in-game\nMarked on the map near postal 201 \(map below\)\.\n\nReason/);
  assert.throws(() => formatWebsiteComplaint({ ...fields, mapLeft: '' }), /Click the map/);
  assert.throws(() => formatWebsiteComplaint({ ...fields, mapTop: 2 }), /Click the map/);
  assert.throws(() => formatWebsiteComplaint({ trooperName: 'x', mapLeft: 0.5, mapTop: 0.5 }), /Badge number/);
  assert.deepEqual(complaintMapPoint({ mapLeft: '0.5', mapTop: '0.25' }), { left: 0.5, top: 0.25 });
});

test('ride along alerts only go to on-shift deputies who are on duty and Corporal or higher', async () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const deputy = (discordId, shift = { id: discordId }) => ({ discordId, shift });
  const members = {
    '100000000000000001': { onDuty: true, corporal: true },
    '100000000000000002': { onDuty: true, corporal: false },
    '100000000000000003': { onDuty: false, corporal: true },
    '100000000000000004': { onDuty: true, corporal: true },
  };
  const options = {
    now,
    memberFor: async (id) => members[id] || null,
    isEligible: (member) => member.onDuty && member.corporal,
  };
  const snapshot = {
    fetchedAt: new Date(now - 60_000).toISOString(),
    deputies: [
      deputy('100000000000000001'),
      deputy('100000000000000002'),
      deputy('100000000000000003'),
      deputy('100000000000000004', null),
      deputy('100000000000000001'),
      deputy('100000000000000009'),
    ],
  };
  const picked = await eligibleRideAlongSupervisors(snapshot, options);
  assert.deepEqual(picked.map((entry) => entry.discordId), ['100000000000000001']);
  const stale = { ...snapshot, fetchedAt: new Date(now - 6 * 60_000).toISOString() };
  assert.deepEqual(await eligibleRideAlongSupervisors(stale, options), []);
  assert.deepEqual(await eligibleRideAlongSupervisors({ deputies: snapshot.deputies }, options), []);
});

test('live Discord check needs the on-duty role and a Corporal or higher rank', async () => {
  const { isOnDutyCorporalOrAbove, PINELLAS_ON_DUTY_ROLE_ID } = await import('../utils/pinellasShiftPanel.js');
  const { PINELLAS_RANKS } = await import('../utils/pinellasPromote.js');
  const corporal = PINELLAS_RANKS.findIndex((rank) => rank.name === 'Corporal');
  const member = (...roleIds) => ({ roles: { cache: new Set(roleIds) } });
  const corporalRole = PINELLAS_RANKS[corporal].roleId;
  const higherRole = PINELLAS_RANKS[0].roleId;
  const lowerRole = PINELLAS_RANKS[corporal + 1].roleId;
  assert.equal(isOnDutyCorporalOrAbove(member(PINELLAS_ON_DUTY_ROLE_ID, corporalRole)), true);
  assert.equal(isOnDutyCorporalOrAbove(member(PINELLAS_ON_DUTY_ROLE_ID, higherRole)), true);
  assert.equal(isOnDutyCorporalOrAbove(member(PINELLAS_ON_DUTY_ROLE_ID, lowerRole)), false);
  assert.equal(isOnDutyCorporalOrAbove(member(corporalRole)), false);
  assert.equal(isOnDutyCorporalOrAbove(null), false);
});

test('supervisor names skip blank shift fields', async () => {
  const { formatSupervisorName } = await import('../utils/pcsoRideAlong.js');
  assert.equal(formatSupervisorName({ rankName: 'Corporal', roleplayName: '—', callsign: '—', displayName: 'Andre' }), 'Corporal Andre');
  assert.equal(formatSupervisorName({}), '');
});

test('server rejects bypassed ride along inputs the browser would normally block', async () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const base = {
    firstName: 'John', lastName: 'Doe', startAt: now + 3 * HOUR, waiverAgree: true, waiverSignature: 'John Doe',
  };
  for (const dob of ['2026-02-30', '1850-01-01', '2030-01-01', '1990-13-01', '1990-1-1']) {
    assert.throws(() => validateRideAlongRequest({ ...base, dob }, now), /date of birth/, dob);
  }
  const parsed = validateRideAlongRequest({ ...base, dob: '1990-01-01', firstName: 'x'.repeat(500), waiverSignature: 'x'.repeat(40) + ' Doe', label: '<b>fake</b>' }, now);
  assert.equal(parsed.firstName.length, 40);
  assert.equal(parsed.timeframe.label, '');

  const h = harness();
  const id = await approvedRide(h);
  await h.service.end('admin1', id, { reason: 'x'.repeat(5000), byRequester: false });
  assert.equal(h.data().requests[0].endedReason.length, 300);
  const h2 = harness();
  await h2.service.request(user, {
    firstName: 'A', lastName: 'B', dob: '1990-01-01', waiverAgree: true, waiverSignature: 'A B', startAt: h2.clock.t + 2 * HOUR,
  });
  await assert.rejects(
    h2.service.approve('admin', h2.data().requests[0].id, { scheduledAt: h2.clock.t + 90 * 24 * HOUR, meetingPlace: 'City Hall' }),
    /60 days/,
  );
});
