import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const STORE_PATH = join(process.cwd(), 'data', 'pcso-employee.json');

/** Role gates come later. Right now every signed-in user can run every employee action. */
export const EMPLOYEE_OPEN_ACCESS = true;

export const EMPLOYEE_ROLE_IDS = Object.freeze({
  startTraining: '',
  joinTraining: '',
  reportsAdmin: '',
  commandStaff: '',
  department: '',
  adminPanel: '',
});

export const TRAINING_TYPES = Object.freeze({
  patrol: { id: 'patrol', label: 'Regular Patrol Training' },
  srt: { id: 'srt', label: 'SRT Training' },
  teu: { id: 'teu', label: 'TEU Training' },
});

const QUIZZES = Object.freeze({
  patrol: [
    {
      id: 'p1',
      prompt: 'When should you request backup on a traffic stop?',
      choices: ['Never', 'When the stop feels unsafe or the driver is non-compliant', 'Only after a pursuit', 'Only if a supervisor is in VC'],
      correct: 1,
      explanation: 'Call for backup as soon as the stop feels unsafe or the driver stops complying. Do not wait for a pursuit or a supervisor to appear.',
    },
    {
      id: 'p2',
      prompt: 'What is the first thing you should do after arriving on a priority call?',
      choices: ['Park anywhere and run in', 'Mark on scene, state your location, then approach', 'Start ticketing civilians', 'Leave if nobody is there'],
      correct: 1,
      explanation: 'Mark on scene and give a location so dispatch and other units know you are there before you approach.',
    },
    {
      id: 'p3',
      prompt: 'A civilian is recording you. What do you do?',
      choices: ['Take the phone', 'Ignore lawful recording and keep working the call', 'Leave immediately', 'Arrest them for recording'],
      correct: 1,
      explanation: 'Lawful recording is allowed. Keep working the call unless they interfere with the scene.',
    },
    {
      id: 'p4',
      prompt: 'When is a vehicle pursuit usually justified in this department?',
      choices: ['Any speeding car', 'Only when policy and a supervisor allow it for a serious offense', 'Whenever you want', 'Never, even for violent felonies'],
      correct: 1,
      explanation: 'Pursuits follow department policy and supervisor approval for serious offenses, not every speeder.',
    },
    {
      id: 'p5',
      prompt: 'How should you talk on radio?',
      choices: ['Long stories', 'Short, clear status and location', 'Memes', 'Stay silent the whole shift'],
      correct: 1,
      explanation: 'Keep radio traffic short and clear: unit, status, and location.',
    },
    {
      id: 'p6',
      prompt: 'If you do not know a code or policy on scene, what should you do?',
      choices: ['Guess', 'Ask a supervisor or FTO', 'Leave', 'Invent a new code'],
      correct: 1,
      explanation: 'Ask an FTO or supervisor instead of guessing on a live call.',
    },
  ],
  srt: [
    {
      id: 's1',
      prompt: 'SRT should be requested when:',
      choices: ['A parking ticket is needed', 'A high-risk warrant, barricade, or armed suspect needs a specialized team', 'Any traffic stop', 'Only for parades'],
      correct: 1,
      explanation: 'SRT is for high-risk entries, barricades, and armed suspects — not routine patrol work.',
    },
    {
      id: 's2',
      prompt: 'Before an SRT entry you should:',
      choices: ['Rush the door immediately', 'Stage, brief roles, and wait for the team leader', 'Each member pick their own plan', 'Turn radios off'],
      correct: 1,
      explanation: 'Stage, brief assignments, and wait for the team leader. Do not freelance the door.',
    },
    {
      id: 's3',
      prompt: 'Who gives the go for a breach?',
      choices: ['The first person on scene', 'The SRT team leader / incident command', 'Any civilian', 'Whoever has the loudest mic'],
      correct: 1,
      explanation: 'The team leader or incident command authorizes the breach.',
    },
    {
      id: 's4',
      prompt: 'If a hostage is reported, SRT should:',
      choices: ['Ignore it', 'Slow the approach, hold a perimeter, and wait for a plan', 'Everyone enter from different doors', 'Leave the scene'],
      correct: 1,
      explanation: 'Hold a perimeter and wait for a coordinated plan. Do not rush a hostage scene.',
    },
    {
      id: 's5',
      prompt: 'Less-lethal on an SRT call is used:',
      choices: ['As a joke', 'When the team leader authorizes it and the threat allows it', 'On every call automatically', 'Never'],
      correct: 1,
      explanation: 'Less-lethal is a planned tool when the leader authorizes it and the threat allows it.',
    },
    {
      id: 's6',
      prompt: 'After the scene is clear, SRT should:',
      choices: ['Leave without a word', 'Call it secure, account for the team, and debrief', 'Start patrol tickets', 'Delete radio logs'],
      correct: 1,
      explanation: 'Call the scene secure, account for every operator, then debrief.',
    },
  ],
  teu: [
    {
      id: 't1',
      prompt: 'TEU’s primary job is:',
      choices: ['Jail intake only', 'Traffic enforcement, crash response, and roadway safety', 'Only SRT raids', 'Only paperwork'],
      correct: 1,
      explanation: 'TEU focuses on traffic enforcement, crashes, and keeping the roadway safe.',
    },
    {
      id: 't2',
      prompt: 'On a crash with injuries you should first:',
      choices: ['Write the citation', 'Make the scene safe and request Fire/EMS', 'Leave', 'Tow every car immediately'],
      correct: 1,
      explanation: 'Make the roadway safe and get Fire/EMS rolling before citations or tows.',
    },
    {
      id: 't3',
      prompt: 'A PIT or spike strip should be used:',
      choices: ['On any speeder', 'Only when trained, authorized, and the roadway is safe', 'In downtown crowds', 'Never with a supervisor'],
      correct: 1,
      explanation: 'PIT and spikes are trained, authorized tactics and only when the roadway is safe.',
    },
    {
      id: 't4',
      prompt: 'DUI investigation starts with:',
      choices: ['A jail sentence', 'Reasonable suspicion, then SFST if trained', 'Towing first', 'Ignoring the driver'],
      correct: 1,
      explanation: 'You need reasonable suspicion first, then SFSTs if you are trained to run them.',
    },
    {
      id: 't5',
      prompt: 'When directing traffic you should:',
      choices: ['Stand in a blind curve with no vest', 'Be visible, use clear hand signals, and watch approaching cars', 'Face away from traffic', 'Use your phone'],
      correct: 1,
      explanation: 'Stay visible, use clear signals, and watch approaching traffic.',
    },
    {
      id: 't6',
      prompt: 'A fleeing vehicle that is only a civil infraction:',
      choices: ['Always PIT immediately', 'Follow policy — do not start an unauthorized pursuit', 'Ram the car', 'Shoot the tires'],
      correct: 1,
      explanation: 'Civil infractions do not justify an unauthorized pursuit. Follow TEU/pursuit policy.',
    },
  ],
});

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

function newCode() {
  return randomBytes(3).toString('hex').toUpperCase();
}

function viewer(user) {
  return {
    id: String(user?.id || ''),
    name: String(user?.displayName || user?.username || 'Employee').slice(0, 80),
  };
}

export function canUseEmployeePanel(user) {
  return Boolean(user?.id);
}

export function canStartTraining(user) {
  if (!canUseEmployeePanel(user)) return false;
  if (EMPLOYEE_OPEN_ACCESS) return true;
  const role = String(EMPLOYEE_ROLE_IDS.startTraining || '');
  const roles = [...(user.guildRoles || []), ...(user.pinellasRoles || [])].map(String);
  return role && roles.includes(role);
}

export function canJoinTraining(user) {
  if (!canUseEmployeePanel(user)) return false;
  if (EMPLOYEE_OPEN_ACCESS) return true;
  const role = String(EMPLOYEE_ROLE_IDS.joinTraining || '');
  const roles = [...(user.guildRoles || []), ...(user.pinellasRoles || [])].map(String);
  return role && roles.includes(role);
}

export function quizForType(type, { includeAnswer = false } = {}) {
  const list = QUIZZES[type] || QUIZZES.patrol;
  return list.map((question) => {
    const row = {
      id: question.id,
      prompt: question.prompt,
      choices: [...question.choices],
    };
    if (includeAnswer) {
      row.correct = question.correct;
      row.explanation = question.explanation;
    }
    return row;
  });
}

export function scoreAnswers(type, answers = {}) {
  const list = QUIZZES[type] || QUIZZES.patrol;
  const missed = [];
  let correct = 0;
  for (const question of list) {
    const picked = Number(answers[question.id]);
    if (picked === question.correct) {
      correct += 1;
    } else {
      missed.push({
        id: question.id,
        prompt: question.prompt,
        picked: Number.isInteger(picked) ? question.choices[picked] || 'No answer' : 'No answer',
        correct: question.choices[question.correct],
        explanation: question.explanation,
      });
    }
  }
  const total = list.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  return { correct, total, percent, missed };
}

export function sessionStats(session) {
  const submitted = (session.participants || []).filter((row) => row.submittedAt);
  const percents = submitted.map((row) => Number(row.percent) || 0);
  const overall = percents.length
    ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length)
    : 0;
  const missCounts = new Map();
  for (const row of submitted) {
    for (const miss of row.missed || []) {
      const current = missCounts.get(miss.id) || { id: miss.id, prompt: miss.prompt, explanation: miss.explanation, count: 0 };
      current.count += 1;
      missCounts.set(miss.id, current);
    }
  }
  const topMissed = [...missCounts.values()]
    .sort((left, right) => right.count - left.count || left.prompt.localeCompare(right.prompt))
    .slice(0, 5);
  return {
    joined: (session.participants || []).length,
    submitted: submitted.length,
    overallPercent: overall,
    topMissed,
    participants: (session.participants || []).map((row) => ({
      id: row.id,
      name: row.name,
      submitted: Boolean(row.submittedAt),
      percent: row.submittedAt ? row.percent : null,
      missed: row.missed || [],
    })),
  };
}

function publicSession(session, user, { includeQuizAnswers = false } = {}) {
  const mine = (session.participants || []).find((row) => row.id === String(user?.id || ''));
  const instructor = String(session.createdBy?.id) === String(user?.id);
  const stats = instructor || EMPLOYEE_OPEN_ACCESS ? sessionStats(session) : null;
  return {
    id: session.id,
    code: session.code,
    type: session.type,
    typeLabel: TRAINING_TYPES[session.type]?.label || session.type,
    status: session.status,
    createdBy: session.createdBy,
    createdAt: session.createdAt,
    startedAt: session.startedAt || null,
    quizStartedAt: session.quizStartedAt || null,
    isInstructor: instructor,
    you: mine ? {
      joined: true,
      submitted: Boolean(mine.submittedAt),
      percent: mine.submittedAt ? mine.percent : null,
      missed: mine.missed || [],
    } : { joined: false },
    quiz: ['quiz', 'review', 'closed'].includes(session.status)
      ? quizForType(session.type, { includeAnswer: includeQuizAnswers || session.status !== 'quiz' || Boolean(mine?.submittedAt) })
      : [],
    stats,
  };
}

async function loadStore() {
  const data = await readJsonFile(STORE_PATH, { sessions: [], reports: [] });
  return {
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    reports: Array.isArray(data.reports) ? data.reports : [],
  };
}

async function saveStore(store) {
  await writeJsonFile(STORE_PATH, {
    sessions: store.sessions.slice(-80),
    reports: store.reports.slice(-200),
  });
}

export async function handleEmployeeAction(action, payload = {}, user = null, helpers = {}) {
  if (!canUseEmployeePanel(user)) {
    const error = new Error('Sign in with Discord to use the employee panel.');
    error.status = 401;
    throw error;
  }

  const store = await loadStore();
  const me = viewer(user);

  if (action === 'bootstrap' || action === 'list') {
    return {
      ok: true,
      openAccess: EMPLOYEE_OPEN_ACCESS,
      viewer: me,
      canStart: canStartTraining(user),
      canJoin: canJoinTraining(user),
      types: Object.values(TRAINING_TYPES),
      sessions: store.sessions
        .filter((session) => session.status !== 'closed')
        .slice(-40)
        .reverse()
        .map((session) => publicSession(session, user)),
      reports: store.reports.slice(-80).reverse(),
    };
  }

  if (action === 'create-session') {
    if (!canStartTraining(user)) {
      const error = new Error('You cannot start a training session yet.');
      error.status = 403;
      throw error;
    }
    const type = TRAINING_TYPES[payload.type] ? payload.type : '';
    if (!type) throw Object.assign(new Error('Pick SRT, TEU, or Regular Patrol training.'), { status: 400 });
    const session = {
      id: newId('train'),
      code: newCode(),
      type,
      status: 'open',
      createdBy: me,
      createdAt: new Date().toISOString(),
      startedAt: null,
      quizStartedAt: null,
      participants: [{ ...me, joinedAt: new Date().toISOString(), answers: {}, submittedAt: null, percent: null, missed: [] }],
    };
    store.sessions.push(session);
    await saveStore(store);
    return { ok: true, session: publicSession(session, user) };
  }

  if (action === 'join-session') {
    if (!canJoinTraining(user)) {
      const error = new Error('You cannot join a training session yet.');
      error.status = 403;
      throw error;
    }
    const code = String(payload.code || '').trim().toUpperCase();
    const session = store.sessions.find((row) => row.code === code);
    if (!session) throw Object.assign(new Error('No training session uses that code.'), { status: 404 });
    if (session.status === 'closed') throw Object.assign(new Error('That training session is closed.'), { status: 400 });
    if (!session.participants.some((row) => row.id === me.id)) {
      session.participants.push({
        ...me,
        joinedAt: new Date().toISOString(),
        answers: {},
        submittedAt: null,
        percent: null,
        missed: [],
      });
      await saveStore(store);
    }
    return { ok: true, session: publicSession(session, user) };
  }

  const session = store.sessions.find((row) => row.id === String(payload.sessionId || ''));
  if (['start-training', 'start-quiz', 'submit-quiz', 'review-quiz', 'session'].includes(action) && !session) {
    throw Object.assign(new Error('Training session not found.'), { status: 404 });
  }

  if (action === 'session') {
    return { ok: true, session: publicSession(session, user) };
  }

  if (action === 'start-training') {
    if (String(session.createdBy?.id) !== me.id && !EMPLOYEE_OPEN_ACCESS) {
      throw Object.assign(new Error('Only the instructor can start training.'), { status: 403 });
    }
    session.status = 'in_progress';
    session.startedAt = session.startedAt || new Date().toISOString();
    await saveStore(store);
    return { ok: true, session: publicSession(session, user) };
  }

  if (action === 'start-quiz') {
    if (String(session.createdBy?.id) !== me.id && !EMPLOYEE_OPEN_ACCESS) {
      throw Object.assign(new Error('Only the instructor can start the quiz.'), { status: 403 });
    }
    session.status = 'quiz';
    session.quizStartedAt = session.quizStartedAt || new Date().toISOString();
    await saveStore(store);
    return { ok: true, session: publicSession(session, user) };
  }

  if (action === 'submit-quiz') {
    const participant = session.participants.find((row) => row.id === me.id);
    if (!participant) throw Object.assign(new Error('Join this training before taking the quiz.'), { status: 400 });
    if (session.status !== 'quiz') throw Object.assign(new Error('The quiz is not open yet.'), { status: 400 });
    if (participant.submittedAt) {
      return { ok: true, session: publicSession(session, user, { includeQuizAnswers: true }) };
    }
    const scored = scoreAnswers(session.type, payload.answers || {});
    participant.answers = payload.answers && typeof payload.answers === 'object' ? payload.answers : {};
    participant.submittedAt = new Date().toISOString();
    participant.percent = scored.percent;
    participant.missed = scored.missed;
    store.reports.push({
      id: newId('trep'),
      kind: 'training',
      status: 'pending',
      sessionId: session.id,
      sessionCode: session.code,
      type: session.type,
      typeLabel: TRAINING_TYPES[session.type]?.label || session.type,
      trainee: me,
      instructor: session.createdBy,
      percent: scored.percent,
      missed: scored.missed,
      createdAt: new Date().toISOString(),
      decidedAt: null,
      decidedBy: null,
      api: null,
    });
    await saveStore(store);
    return { ok: true, session: publicSession(session, user, { includeQuizAnswers: true }) };
  }

  if (action === 'review-quiz') {
    if (String(session.createdBy?.id) !== me.id && !EMPLOYEE_OPEN_ACCESS) {
      throw Object.assign(new Error('Only the instructor can open the review.'), { status: 403 });
    }
    session.status = 'review';
    await saveStore(store);
    return { ok: true, session: publicSession(session, user, { includeQuizAnswers: true }) };
  }

  if (action === 'decide-report') {
    const report = store.reports.find((row) => row.id === String(payload.reportId || ''));
    if (!report) throw Object.assign(new Error('Report not found.'), { status: 404 });
    const decision = String(payload.decision || '').toLowerCase();
    if (decision !== 'approved' && decision !== 'denied') {
      throw Object.assign(new Error('Choose approve or deny.'), { status: 400 });
    }
    report.status = decision;
    report.decidedAt = new Date().toISOString();
    report.decidedBy = me;
    const posted = helpers.postPcsoErlcApi
      ? await helpers.postPcsoErlcApi('/training-reports', {
        action: decision,
        report,
      })
      : { ok: false, reason: 'not_configured' };
    report.api = {
      ok: Boolean(posted?.ok),
      reason: posted?.reason || null,
      error: posted?.error || null,
      at: new Date().toISOString(),
    };
    await saveStore(store);
    return { ok: true, report, api: report.api };
  }

  throw Object.assign(new Error(`Unknown employee action: ${action}`), { status: 400 });
}

export async function postPcsoErlcApi(path, body) {
  const base = String(process.env.PCSOERLCAPI_URL || '').replace(/\/$/, '');
  const key = String(process.env.PCSOERLCAPI_KEY || '').trim();
  if (!base) return { ok: false, reason: 'not_configured', error: 'PCSOERLCAPI_URL is not set on the host.' };
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Name': 'PCSOERLCAPI',
    };
    if (key) headers.Authorization = `Bearer ${key}`;
    const upstream = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: payload.error || `PCSOERLCAPI returned HTTP ${upstream.status}` };
    }
    return { ok: true, body: payload };
  } catch (error) {
    return { ok: false, error: error?.message || 'Could not reach PCSOERLCAPI.' };
  }
}
