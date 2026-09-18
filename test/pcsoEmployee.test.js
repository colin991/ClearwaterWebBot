import assert from 'node:assert/strict';
import test from 'node:test';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  handleEmployeeAction,
  postPcsoErlcApi,
  quizForType,
  scoreAnswers,
  sessionStats,
  EMPLOYEE_OPEN_ACCESS,
} from '../utils/pcsoEmployee.js';
import { safeNextPath } from '../lib/discord-auth.js';

const instructor = { id: '100', username: 'inst', displayName: 'Instructor', pinellasRoles: [], guildRoles: [] };
const trainee = { id: '200', username: 'dep', displayName: 'Deputy', pinellasRoles: [], guildRoles: [] };

test('employee panel is open to every signed-in user until role IDs are set', () => {
  assert.equal(EMPLOYEE_OPEN_ACCESS, true);
});

test('each training type has a six-question quiz with explanations', () => {
  for (const type of ['patrol', 'srt', 'teu']) {
    const quiz = quizForType(type, { includeAnswer: true });
    assert.equal(quiz.length, 6);
    assert.ok(quiz.every((question) => question.explanation && Number.isInteger(question.correct)));
    const hidden = quizForType(type);
    assert.equal(hidden[0].correct, undefined);
  }
});

test('quiz scoring records missed questions and percent', () => {
  const scored = scoreAnswers('patrol', { p1: 0, p2: 1, p3: 1, p4: 1, p5: 1, p6: 1 });
  assert.equal(scored.correct, 5);
  assert.equal(scored.percent, 83);
  assert.equal(scored.missed.length, 1);
  assert.match(scored.missed[0].explanation, /backup/i);
});

test('instructor stats include overall percent and top missed questions', () => {
  const stats = sessionStats({
    participants: [
      { id: '1', name: 'A', submittedAt: 't', percent: 50, missed: [{ id: 'p1', prompt: 'Q1', explanation: 'E1' }] },
      { id: '2', name: 'B', submittedAt: 't', percent: 100, missed: [] },
      { id: '3', name: 'C', submittedAt: 't', percent: 50, missed: [{ id: 'p1', prompt: 'Q1', explanation: 'E1' }, { id: 'p2', prompt: 'Q2', explanation: 'E2' }] },
    ],
  });
  assert.equal(stats.overallPercent, 67);
  assert.equal(stats.topMissed[0].id, 'p1');
  assert.equal(stats.topMissed[0].count, 2);
});

test('training sessions, quizzes, and PCSOERLCAPI report decisions', async () => {
  const storePath = join(process.cwd(), 'data', 'pcso-employee.json');
  await unlink(storePath).catch(() => {});
  const created = await handleEmployeeAction('create-session', { type: 'srt' }, instructor);
  assert.equal(created.session.type, 'srt');
  assert.ok(created.session.code);

  const joined = await handleEmployeeAction('join-session', { code: created.session.code }, trainee);
  assert.equal(joined.session.you.joined, true);

  await handleEmployeeAction('start-training', { sessionId: created.session.id }, instructor);
  await handleEmployeeAction('start-quiz', { sessionId: created.session.id }, instructor);

  const answers = Object.fromEntries(quizForType('srt', { includeAnswer: true }).map((question) => [question.id, 0]));
  const submitted = await handleEmployeeAction('submit-quiz', { sessionId: created.session.id, answers }, trainee);
  assert.equal(submitted.session.you.submitted, true);
  assert.ok(Array.isArray(submitted.session.you.missed));

  const review = await handleEmployeeAction('review-quiz', { sessionId: created.session.id }, instructor);
  assert.equal(review.session.status, 'review');
  assert.ok(review.session.stats.topMissed.length <= 5);

  const listed = await handleEmployeeAction('bootstrap', {}, instructor);
  const report = listed.reports.find((row) => row.sessionId === created.session.id);
  assert.ok(report);
  assert.equal(report.status, 'pending');

  const calls = [];
  const decided = await handleEmployeeAction('decide-report', {
    reportId: report.id,
    decision: 'approved',
  }, instructor, {
    postPcsoErlcApi: async (path, body) => {
      calls.push({ path, body });
      return { ok: true, body: { accepted: true } };
    },
  });
  assert.equal(decided.report.status, 'approved');
  assert.equal(calls[0].path, '/training-reports');
  assert.equal(calls[0].body.action, 'approved');
  await unlink(storePath).catch(() => {});
});

test('employee panel paths are allowed after Discord login', () => {
  assert.equal(safeNextPath('/employee'), '/employee');
  assert.equal(safeNextPath('/employee-training.html'), '/employee/training');
  assert.equal(safeNextPath('/employee/reports'), '/employee/reports');
});

test('PCSOERLCAPI uses the PCSO ER:LC server-key, not the main ERLC_SERVER_KEY', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.PCSOERLCAPI_URL;
  const originalKey = process.env.PCSOERLCAPI_KEY;
  const originalErlc = process.env.ERLC_SERVER_KEY;
  const calls = [];
  process.env.PCSOERLCAPI_URL = 'https://pcsoerlcapi.example.com';
  process.env.PCSOERLCAPI_KEY = 'pcso-erlc-server-key';
  process.env.ERLC_SERVER_KEY = 'main-erlc-server-key';
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    };
  };
  try {
    const result = await postPcsoErlcApi('/training-reports', { action: 'approved' });
    assert.equal(result.ok, true);
    assert.equal(calls[0].url, 'https://pcsoerlcapi.example.com/training-reports');
    assert.equal(calls[0].headers['server-key'], 'pcso-erlc-server-key');
    assert.notEqual(calls[0].headers['server-key'], 'main-erlc-server-key');
    assert.equal(calls[0].headers.Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.PCSOERLCAPI_URL;
    else process.env.PCSOERLCAPI_URL = originalUrl;
    if (originalKey === undefined) delete process.env.PCSOERLCAPI_KEY;
    else process.env.PCSOERLCAPI_KEY = originalKey;
    if (originalErlc === undefined) delete process.env.ERLC_SERVER_KEY;
    else process.env.ERLC_SERVER_KEY = originalErlc;
  }
});

test('PCSOERLCAPI does not fall back to the main ERLC_SERVER_KEY', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.PCSOERLCAPI_URL;
  const originalKey = process.env.PCSOERLCAPI_KEY;
  const originalErlc = process.env.ERLC_SERVER_KEY;
  process.env.PCSOERLCAPI_URL = 'https://pcsoerlcapi.example.com';
  delete process.env.PCSOERLCAPI_KEY;
  process.env.ERLC_SERVER_KEY = 'main-erlc-server-key';
  globalThis.fetch = async () => {
    throw new Error('must not call the main-server key');
  };
  try {
    const result = await postPcsoErlcApi('/training-reports', { action: 'approved' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_configured');
    assert.match(result.error, /PCSOERLCAPI_KEY/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.PCSOERLCAPI_URL;
    else process.env.PCSOERLCAPI_URL = originalUrl;
    if (originalKey === undefined) delete process.env.PCSOERLCAPI_KEY;
    else process.env.PCSOERLCAPI_KEY = originalKey;
    if (originalErlc === undefined) delete process.env.ERLC_SERVER_KEY;
    else process.env.ERLC_SERVER_KEY = originalErlc;
  }
});
