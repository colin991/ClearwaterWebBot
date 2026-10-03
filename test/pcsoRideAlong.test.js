import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRideAlongService,
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
  });
  return { service, clock, dms, edits, data: () => data };
}

const user = { id: 'rider1', username: 'rider' };

async function approvedRide(h, offset = 3 * HOUR) {
  await h.service.request(user, {
    firstName: 'John', lastName: 'Doe', dob: '1995-04-02',
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
  }, now);
  assert.equal(ok.timeframe.endAt - ok.timeframe.startAt, RIDE_ALONG_DURATION_MS);
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
  await h2.service.request(user, { firstName: 'A', lastName: 'B', dob: '1990-01-01', startAt: h2.clock.t + 2 * HOUR });
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
    firstName: 'A', lastName: 'B', dob: '1990-01-01', startAt: h.clock.t + 5 * HOUR, endAt: h.clock.t + 6 * HOUR,
  }), /already have a ride along/);
});

test('ride along buttons parse and approve rejects unknown meeting places', async () => {
  assert.deepEqual(parseRideAlongButton('pra:claim:ra_abc_123'), { action: 'claim', id: 'ra_abc_123' });
  assert.equal(parseRideAlongButton('pra:steal:ra_abc'), null);
  const h = harness();
  await h.service.request(user, {
    firstName: 'A', lastName: 'B', dob: '1990-01-01', startAt: h.clock.t + 2 * HOUR, endAt: h.clock.t + 3 * HOUR,
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
