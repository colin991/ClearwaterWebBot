'use strict';

/* global AudioEncoder, AudioDecoder, AudioData, EncodedAudioChunk */

const api = window.radioApp;
const $ = (id) => document.getElementById(id);
const el = {
  radio: $('radio'),
  lcdLeft: $('lcdLeft'),
  lcdSig: $('lcdSig'),
  lcdDate: $('lcdDate'),
  lcdTime: $('lcdTime'),
  lcdRight: $('lcdRight'),
  lcdBody: $('lcdBody'),
  softLeftLabel: $('softLeftLabel'),
  softRightLabel: $('softRightLabel'),
  lampTx: $('lampTx'),
  lampRx: $('lampRx'),
  lampMic: $('lampMic'),
  deaf: $('deaf'),
  vol: $('vol'),
  ch: $('ch'),
  pttSide: $('pttSide'),
};

const KEY_PREFIX = 'CWR2.';
const REMOVED_CLOSE_MS = 6000;
const FRAME_SAMPLES = 960; // 20 ms at 48 kHz
const TX_FADE_IN = 240; // 5 ms
const TX_FADE_OUT = 720; // 15 ms
// Rows on the MENU (left soft key) and SETUP screens: name on the left, current value on the right.
const MENU = [
  { label: 'VOL', value: () => String(state.settings.volume), adjust: (step) => changeVolume(step * 5) },
  { label: 'MIC', value: () => deviceLabel('audioinput', state.settings.micId), open: 'mic' },
  { label: 'LISTEN', value: () => deviceLabel('audiooutput', state.settings.outputId), open: 'headset' },
  { label: 'PTT', value: () => bindLabel('ptt'), bind: 'ptt' },
  { label: 'CHANNEL', value: () => String(state.channel || 'RADIO'), adjust: (step) => changeChannel(step), action: () => changeChannel(1) },
  { label: 'SCAN', value: () => scanText(), open: 'scan' },
  { label: 'SCAN PTT', value: () => bindLabel('scanPtt'), bind: 'scanPtt' },
  { label: 'CH KEY', value: () => bindLabel('chanKey'), bind: 'chanKey' },
  { label: 'REPLAY', value: () => (audio.replay ? 'STOP' : 'LAST 30s'), action: () => replay() },
  { label: 'WHERE AM I', value: () => (state.game?.postal ? `PST ${state.game.postal}` : 'SAY'), action: () => whereAmI() },
  { label: 'NEAREST', value: () => `${state.game?.nearest?.length || 0} UNITS`, open: 'nearest' },
  { label: 'SCENES', value: () => `${state.scenes.length} ON`, open: 'scenes', dispatch: true },
  { label: 'MONITOR', value: () => (state.monitor ? 'ON' : 'OFF'), adjust: () => toggleMonitor(), action: () => toggleMonitor(), staff: true },
  { label: 'PRACTICE', value: () => (state.practice ? 'ON' : 'OFF'), adjust: () => togglePractice(), action: () => togglePractice() },
  { label: 'REPLAY KEY', value: () => bindLabel('replayKey'), bind: 'replayKey' },
  { label: 'WHO', value: () => `${state.channels.reduce((total, channel) => total + (channel.members?.length || 0), 0)} ON`, open: 'users' },
  { label: 'FX', value: () => FX_LABELS[state.settings.listenFx] || 'OFF', adjust: (step) => cycleFx(step), action: () => cycleFx(1) },
  { label: 'SIZE', value: () => `${radioSize()}%`, adjust: (step) => changeSize(step), open: 'size' },
  { label: 'BAR ANIM', value: () => (state.settings.sigAnim === false ? 'OFF' : 'ON'), adjust: () => toggleSigAnim(), action: () => toggleSigAnim() },
  { label: 'SETUP', value: () => 'RUN', open: 'setup' },
];
const SETUP = [
  { label: 'TEST', value: () => 'MIC', open: 'test' },
  { label: 'ACCOUNT', value: () => accountText(), action: () => (decodeKey(state.settings.key) ? signOut() : signIn()) },
  { label: 'UPDATE', value: () => updateText(), action: () => void checkUpdates() },
  { label: 'TUTORIAL', value: () => 'SHOW', action: () => startTutorial() },
];
// Hotkeys: the talk key, a second talk key for your scan channel, replay, and next channel.
const BIND_NAMES = { ptt: 'PTT KEY', scanPtt: 'SCAN PTT', replayKey: 'REPLAY KEY', chanKey: 'CH KEY' };
const BIND_HELP = {
  ptt: 'HOLD TO TALK',
  scanPtt: 'HOLD TO TALK ON YOUR FIRST SCAN CHANNEL',
  replayKey: 'PLAYS THE LAST 30 SECONDS OF RADIO',
  chanKey: 'SWITCHES TO THE NEXT CHANNEL',
};
// First launch: talk key, then these (each can be skipped), then size, mic check and the tutorial.
const SETUP_BINDS = ['replayKey', 'chanKey'];
// Replay keeps this much of what the radio played.
const REPLAY_MS = 30_000;
// Letting go of PTT keeps transmitting this long, so the end of what you said isn't cut off.
const PTT_TAIL_MS = 1000;
// Stuck mic: the radio lets go of a transmission held this long (the relay cuts it too).
const STUCK_MIC_MS = 60_000;
// Whisper: a private call to one unit stays armed this long after its last use.
const WHISPER_IDLE_MS = 60_000;
// Settings shared between this member's desktop and phone radios.
const SYNC_KEYS = ['volume', 'listenFx', 'scan'];
// Staff rows (MONITOR) only show for admins, dispatch rows (SCENES) only for !C names.
const ROWS = {
  get menu() {
    return MENU.filter((row) => (!row.staff || state.me?.staff) && (!row.dispatch || String(state.me?.name || '').includes('!C')));
  },
  setup: SETUP,
};
// Radio effects only change what this radio hears; what you send stays clean.
const FX_MODES = ['off', 'radio', 'police'];
const FX_LABELS = { off: 'OFF', radio: 'RADIO', police: 'POLICE' };
// Slower PCs (few cores or little memory) get lighter audio work automatically.
const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
// SIZE: a dial from 60% to 130% of full size, in 5% steps.
const SIZE_MIN = 60;
const SIZE_MAX = 130;
const SIZE_STEP = 5;
const PARENT = { scenes: 'menu', nearest: 'menu', menu: 'home', setup: 'menu', mic: 'menu', ptt: 'menu', headset: 'menu', size: 'menu', scan: 'menu', test: 'setup', users: 'home', unit: 'users', tutorial: 'home' };
// PANIC asks first; a second press (or OK) within this long sends it.
const PANIC_CONFIRM_MS = 5000;
// The relay allows one PANIC per member every 2 minutes.
const PANIC_GAP_MS = 2 * 60 * 1000;
// Nobody touching the radio (no PTT, clicks or keys) for this long closes it; a warning shows for the last minute.
const IDLE_CLOSE_MS = 20 * 60 * 1000;
const IDLE_WARN_MS = 60 * 1000;

const state = {
  settings: {
    volume: 70, listenFx: 'radio', size: 100, scan: [], deaf: false, key: '', micId: 'default', outputId: 'default',
    ptt: null, scanPtt: null, replayKey: null, chanKey: null, sigAnim: true, syncAt: 0, tutorialDone: false, hook: false, channel: 'main',
  },
  version: '',
  screen: 'home',
  menuIndex: 0,
  setupIndex: 0,
  deviceCache: { audioinput: [], audiooutput: [] },
  listIndex: 0,
  devices: [],
  conn: 'signin', // signin | signing | connecting | lost | online | error | removed
  error: '',
  channel: 'RADIO',
  channelId: 'main',
  channels: [],
  idleWarn: false,
  botOnline: false,
  listeners: 0,
  me: null,
  tx: 'idle', // idle | requesting | on
  txCancel: false,
  txKind: 'main', // which talk key started the transmission
  pttReleasedAt: 0,
  pttHeld: false,
  rx: new Map(),
  talking: {}, // channel id -> ids of everyone talking there, for the units lists
  panic: null,
  inVoice: false, // in the Discord channel already, so the radio stays quiet
  toast: null,
  update: null,
  capturing: false,
  mustBind: false, // first launch: the radio stays on the PTT screen until a talk key is picked
  firstSetup: false, // first launch: the size screen follows the talk key
  panicAsk: 0, // when PANIC was pressed and is waiting for ARE YOU SURE
  pttTimeoutUntil: 0, // the relay timed this member out of talking for spamming PTT
  muted: false, // force-muted by staff: can listen, can't talk
  signal: null, // this radio's signal from the staff coverage map (0.1-1); null = clear
  game: null, // { postal, street, speed, heading, nearest } from the game, null when not in game
  damagedUntil: 0, // downed in game: the radio is cracked and very weak until then
  monitor: false, // staff live listen: every channel, listen-only
  scenes: [], // dispatch: units in scene / traffic stop voice channels { name, channel, seconds }
  scenesAt: 0,
  event: null, // staff's temporary event channel { name } while open
  modal: null, // a staff warning or the recorded-transmissions notice: { title, text, kind }
  weather: '', // server weather: clear, rain, fog, thunderstorm
  practice: false, // PRACTICE: PTT records and plays you back, nothing goes out
  practiceTx: false,
  retryAt: 0, // RADIO UPDATING: when the next try is
  lastHeard: null, // { name, at } of the last transmission heard on this channel
  micLevel: 0,
  bindWhich: 'ptt', // which hotkey the PTT KEY screen is setting
  txChannel: '', // channel this radio is transmitting on (its own, or a scan channel)
  txStartedAt: 0,
  whisper: null, // { id, name, until }: PTT talks privately to this unit
  unit: null, // the unit picked on WHO'S ON: { id, name, app, channelId }
  calls: [], // pending 911 calls: { id, name, kind, detail, waited }
  callsAt: 0,
  tutorialPage: 0,
};

const audio = {
  ctx: null,
  micStream: null,
  micSource: null,
  txIn: null,
  txGain: null,
  rxIn: null,
  listenFx: null,
  signalFx: null,
  volume: null,
  deafGain: null,
  toneOut: null,
  testGain: null,
  capture: null,
  encoder: null,
  pending: new Float32Array(FRAME_SAMPLES),
  pendingLen: 0,
  held: null,
  fadeIn: 0,
  ts: 0,
  draining: false,
  speakers: new Map(),
  history: [], // what the radio played, for REPLAY: { at, samples }
  replay: null,
};

const net = { ws: null, retry: 0, timer: null, browser: false, wasOnline: false };
// A dropped link retries fast (RECONNECTING); after this many misses the bot is treated as down
// and the radio shows RADIO UPDATING and tries again every 10 seconds, keeping all settings.
const QUICK_RETRIES = 3;
const UPDATING_RETRY_MS = 10_000;

/* ---------- helpers ---------- */

function clampVolume(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function volumeGain() {
  return Math.pow(state.settings.volume / 100, 1.5) * 1.4;
}

/** Talk level: a little under the mic's own level, so loud mics don't clip. */
const TX_GAIN = Math.pow(60 / 70, 1.5);

// Quick changes (volume drags) are batched; every changed field is kept until it is written.
let saveTimer = null;
let pendingSave = {};
function saveSettings(patch) {
  Object.assign(state.settings, patch);
  Object.assign(pendingSave, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void flushSettings(); }, 250);
  scheduleSync(patch);
}

function flushSettings() {
  clearTimeout(saveTimer);
  const patch = pendingSave;
  pendingSave = {};
  return Object.keys(patch).length ? api.setSettings(patch) : Promise.resolve();
}

function saveNow(patch) {
  Object.assign(state.settings, patch);
  scheduleSync(patch);
  return api.setSettings(patch);
}

// Settings sync: a change to a shared setting is sent to the bot, which hands it to this member's other radio.
let syncTimer = null;
let applyingSync = false;
function scheduleSync(patch) {
  if (applyingSync || !SYNC_KEYS.some((key) => patch && key in patch)) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushSync, 1000);
}

function pushSync() {
  if (state.conn !== 'online') return;
  const syncAt = Date.now();
  state.settings.syncAt = syncAt;
  void api.setSettings({ syncAt });
  sendJson({ type: 'settings', data: Object.fromEntries(SYNC_KEYS.map((key) => [key, state.settings[key]])), updatedAt: syncAt });
}

// Signed in: newer settings saved from the other radio win; otherwise this radio's are shared.
function applySync(synced) {
  if (!synced?.data || !(Number(synced.updatedAt) > (Number(state.settings.syncAt) || 0))) {
    if (!synced || (Number(state.settings.syncAt) || 0) > Number(synced.updatedAt || 0)) pushSync();
    return;
  }
  const patch = {};
  for (const key of SYNC_KEYS) if (key in synced.data) patch[key] = synced.data[key];
  applyingSync = true;
  void saveNow({ ...patch, syncAt: Number(synced.updatedAt) });
  applyingSync = false;
  applyVolume();
  applyFx();
  if ('scan' in patch) sendJson({ type: 'scan', ids: scanIds() });
  flash('SETTINGS SYNCED', 1000);
}

async function quitApp() {
  try { await flushSettings(); } catch { /* still quit */ }
  api.quit();
}

function flash(text, ms = 1400) {
  const toast = { text, until: Date.now() + ms };
  state.toast = toast;
  render();
  setTimeout(() => {
    if (state.toast === toast) {
      state.toast = null;
      render();
    }
  }, ms);
}

function decodeKey(key) {
  const text = String(key || '').trim();
  if (!text.startsWith(KEY_PREFIX)) return null;
  try {
    const b64 = text.slice(KEY_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '==='.slice((b64.length + 3) % 4)));
    return payload && typeof payload.u === 'string' && /^wss?:\/\//.test(payload.u) ? payload : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- audio ---------- */

function softClipCurve(drive) {
  const curve = new Float32Array(1024);
  const norm = Math.tanh(drive);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i * 2) / curve.length - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

function noiseBuffer(ctx, seconds) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

const FX_SETTINGS = {
  radio: { low: 300, high: 3200, mid: 4, drive: 1.6, makeup: 0.55, hiss: 0.004 },
  police: { low: 450, high: 2600, mid: 7, drive: 2.6, makeup: 0.5, hiss: 0.012 },
};

// Scales an effect: below 100% it opens toward clean audio, above it gets narrower and grittier.
function fxStrength(fx, level) {
  if (!fx) return null;
  const t = Math.max(0.25, Math.min(1.5, level / 100));
  const under = Math.min(t, 1);
  const over = Math.max(0, t - 1);
  return {
    low: (80 + (fx.low - 80) * under) * (1 + over * 0.6),
    high: (8000 - (8000 - fx.high) * under) / (1 + over * 0.5),
    mid: fx.mid * t,
    drive: 1 + (fx.drive - 1) * t,
    makeup: fx.makeup,
    hiss: fx.hiss * t,
  };
}

/**
 * Optional listening effect: band-limited radio voice, a little grit and background static.
 * OFF passes audio straight through, so normal listening is never coloured.
 */
function createRadioFx(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.Q.value = 0.7;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.Q.value = 0.7;
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1800;
  mid.Q.value = 0.9;
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '2x';
  const makeup = ctx.createGain();
  input.connect(dry);
  dry.connect(output);
  highpass.connect(lowpass);
  lowpass.connect(mid);
  mid.connect(shaper);
  shaper.connect(makeup);
  makeup.connect(wet);
  wet.connect(output);
  // The effect chain only gets audio while an effect is on, so OFF costs nothing.
  let wetLinked = false;
  const linkWet = (on) => {
    if (on === wetLinked) return;
    wetLinked = on;
    if (on) input.connect(highpass);
    else input.disconnect(highpass);
  };

  // Static bed: plays only while someone is talking and an effect is on.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 2);
  noise.loop = true;
  const noiseBand = ctx.createBiquadFilter();
  noiseBand.type = 'bandpass';
  noiseBand.frequency.value = 2400;
  noiseBand.Q.value = 0.6;
  const hiss = ctx.createGain();
  hiss.gain.value = 0;
  noiseBand.connect(hiss);
  hiss.connect(output);
  noise.start();
  // Static is only wired in while it can be heard.
  let noiseLinked = false;
  const linkNoise = (on) => {
    if (on === noiseLinked) return;
    noiseLinked = on;
    if (on) noise.connect(noiseBand);
    else noise.disconnect(noiseBand);
  };

  let mode = 'off';
  let strength = 100;
  return {
    input,
    output,
    get mode() { return mode; },
    setMode(next, level = 100) {
      mode = FX_SETTINGS[next] ? next : 'off';
      strength = level;
      const fx = fxStrength(FX_SETTINGS[mode], strength);
      dry.gain.value = fx ? 0 : 1;
      wet.gain.value = fx ? 1 : 0;
      linkWet(Boolean(fx));
      if (!fx) {
        hiss.gain.value = 0;
        linkNoise(false);
        return;
      }
      highpass.frequency.value = fx.low;
      lowpass.frequency.value = fx.high;
      mid.gain.value = fx.mid;
      shaper.curve = softClipCurve(fx.drive);
      makeup.gain.value = fx.makeup;
    },
    setLowPower(low) {
      shaper.oversample = low ? 'none' : '2x';
    },
    setStatic(active) {
      const fx = fxStrength(FX_SETTINGS[mode], strength);
      linkNoise(Boolean(fx && active));
      hiss.gain.setTargetAtTime(fx && active ? fx.hiss : 0, ctx.currentTime, 0.03);
    },
  };
}

/**
 * Weak signal (staff coverage map: far from a cell tower or in a weak area): the voice is muffled,
 * gets a static bed and the odd dropout, but always still comes through. Works with FX on or off.
 */
function createSignalFx(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 20000;
  muffle.Q.value = 0.7;
  const gate = ctx.createGain();
  input.connect(muffle);
  muffle.connect(gate);
  gate.connect(output);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 2);
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1800;
  band.Q.value = 0.5;
  const hiss = ctx.createGain();
  hiss.gain.value = 0;
  band.connect(hiss);
  hiss.connect(output);
  noise.start();
  let noiseLinked = false;
  const linkNoise = (on) => {
    if (on === noiseLinked) return;
    noiseLinked = on;
    if (on) noise.connect(band);
    else noise.disconnect(band);
  };
  let weakness = 0;
  let hearing = false;
  let dropTimer = null;
  // Short random dips while a weak voice comes in.
  const dropouts = () => {
    dropTimer = null;
    if (!hearing || weakness < 0.3) return;
    if (Math.random() < weakness * 0.7) {
      const at = ctx.currentTime;
      gate.gain.setTargetAtTime(Math.max(0.08, 0.55 - 0.45 * weakness), at, 0.01);
      gate.gain.setTargetAtTime(1, at + 0.04 + Math.random() * 0.14 * weakness, 0.02);
    }
    dropTimer = setTimeout(dropouts, 220 + Math.random() * 600);
  };
  return {
    input,
    output,
    /** signal 0.1-1 (null = clear) of what is being heard; hearing = someone is talking. */
    set(signal, active) {
      weakness = signal === null || signal === undefined || signal >= 0.85 ? 0 : Math.min(1, (0.85 - signal) / 0.75);
      hearing = Boolean(active) && weakness > 0;
      const at = ctx.currentTime;
      muffle.frequency.setTargetAtTime(weakness ? 3600 - 2500 * weakness : 20000, at, 0.05);
      linkNoise(hearing);
      hiss.gain.setTargetAtTime(hearing ? 0.012 + 0.07 * weakness : 0, at, 0.04);
      if (!hearing) gate.gain.setTargetAtTime(1, at, 0.02);
      if (hearing && !dropTimer) dropouts();
    },
  };
}

/** The weakest signal among the voices coming in right now (null when all are clear). */
function heardSignal() {
  let weakest = null;
  for (const voice of state.rx.values()) {
    if (Number.isFinite(voice.signal) && (weakest === null || voice.signal < weakest)) weakest = voice.signal;
  }
  // A damaged radio (downed in game) hears everything weak too.
  if (state.rx.size && state.damagedUntil > Date.now()) weakest = Math.min(weakest ?? 1, 0.15);
  return weakest;
}

/** Bars for this radio's own signal: 4 is clear, 1 is barely there (matches the bot's signalBars). */
function signalBars(signal) {
  if (!Number.isFinite(signal)) return 4;
  if (signal >= 0.8) return 4;
  if (signal >= 0.55) return 3;
  if (signal >= 0.3) return 2;
  return 1;
}

async function initAudio() {
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  audio.ctx = ctx;
  await ctx.audioWorklet.addModule('capture-worklet.js');

  // Listening: every voice -> optional radio FX -> listen volume -> limiter -> deafen -> speakers.
  audio.rxIn = ctx.createGain();
  audio.listenFx = createRadioFx(ctx);
  audio.volume = ctx.createGain();
  const rxLimiter = new AudioWorkletNode(ctx, 'radio-limiter', {
    outputChannelCount: [2],
    processorOptions: { ceiling: 0.7 }, // about -3 dBFS
  });
  audio.deafGain = ctx.createGain();
  audio.signalFx = createSignalFx(ctx);
  audio.rxIn.connect(audio.signalFx.input);
  audio.signalFx.output.connect(audio.listenFx.input);
  audio.listenFx.output.connect(audio.volume);
  audio.volume.connect(rxLimiter);
  rxLimiter.connect(audio.deafGain);
  audio.deafGain.connect(ctx.destination);
  audio.toneOut = ctx.createGain();
  audio.toneOut.connect(ctx.destination);

  // Talking: clean voice (no effects). The mic's auto gain levels it, TX VOL scales it, and a
  // limiter caps peaks at -6 dBFS so the bot never blasts the channel.
  const txHighpass = ctx.createBiquadFilter();
  txHighpass.type = 'highpass';
  txHighpass.frequency.value = 90;
  audio.txIn = txHighpass;
  audio.txGain = ctx.createGain();
  audio.txGain.gain.value = TX_GAIN;
  txHighpass.connect(audio.txGain);
  audio.capture = new AudioWorkletNode(ctx, 'radio-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { ceiling: 0.5 },
  });
  audio.txGain.connect(audio.capture);
  applyMicBoost();
  // TEST plays the limited talk signal; at gain 0 it still keeps the worklet running.
  audio.testGain = ctx.createGain();
  audio.testGain.gain.value = 0;
  audio.capture.connect(audio.testGain);
  audio.testGain.connect(ctx.destination);

  audio.capture.port.onmessage = (event) => {
    const data = event.data || {};
    if (data.samples) onSamples(data.samples);
    if (typeof data.level === 'number') onMicLevel(data.level);
  };

  applyVolume();
  applyDeaf();
  applyFx();
  applyPower();
  await applyOutput();
  await openMic();
  await initEncoder();
  await resumeAudio();
}

/** Audio can start suspended; any click, key or incoming voice wakes it. */
async function resumeAudio() {
  if (audio.ctx?.state === 'suspended') await audio.ctx.resume().catch(() => {});
}

function applyVolume() {
  if (!audio.ctx) return;
  const gain = volumeGain();
  audio.volume.gain.value = gain;
  audio.toneOut.gain.value = gain;
  if (state.screen === 'test') audio.testGain.gain.value = gain;
}

// BAR ANIM: the signal bars bob up and down (faster while talking or hearing someone).
async function toggleSigAnim() {
  await saveNow({ sigAnim: state.settings.sigAnim === false });
  render();
}

const muted = () => Boolean(state.settings.deaf || state.inVoice);

function applyDeaf() {
  if (audio.deafGain) audio.deafGain.gain.value = muted() ? 0 : 1;
  el.deaf.classList.toggle('on', Boolean(state.settings.deaf));
}

function applyFx() {
  audio.listenFx?.setMode(state.settings.listenFx, 100);
  audio.listenFx?.setStatic(state.rx.size > 0);
}

const lowPower = () => LOW_END;

// Slower PCs: a lighter Opus encoder, no effect oversampling, and fewer mic-level updates.
function applyPower() {
  const low = lowPower();
  audio.listenFx?.setLowPower(low);
  audio.capture?.port.postMessage({ levelEvery: low ? 24 : 8 });
  document.body.classList.toggle('low-power', low);
}

async function applyOutput() {
  if (!audio.ctx || typeof audio.ctx.setSinkId !== 'function') return;
  const id = state.settings.outputId;
  try {
    await audio.ctx.setSinkId(!id || id === 'default' ? '' : id);
  } catch {
    flash('LISTEN ERR');
    await audio.ctx.setSinkId('').catch(() => {});
  }
}

async function openMic() {
  if (!audio.ctx) return;
  if (audio.micStream) audio.micStream.getTracks().forEach((track) => track.stop());
  try { audio.micSource?.disconnect(); } catch { /* ignore */ }
  audio.micStream = null;
  audio.micSource = null;
  const id = state.settings.micId;
  const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: id && id !== 'default' ? { ...base, deviceId: { exact: id } } : base,
    });
  } catch {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: base });
      if (id && id !== 'default') flash('MIC MISSING');
    } catch {
      flash('NO MIC');
    }
  }
  if (stream) {
    audio.micStream = stream;
    audio.micSource = audio.ctx.createMediaStreamSource(stream);
    audio.micSource.connect(audio.txIn);
  }
  updateLamps();
}

async function initEncoder() {
  try { audio.encoder?.close(); } catch { /* ignore */ }
  audio.encoder = null;
  if (typeof AudioEncoder === 'undefined') {
    flash('NO OPUS');
    return;
  }
  const base = { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 64000 };
  let config = { ...base, opus: { frameDuration: 20000, complexity: lowPower() ? 4 : 8 } };
  try {
    const support = await AudioEncoder.isConfigSupported(config);
    if (!support.supported) config = base;
  } catch {
    config = base;
  }
  audio.encoder = new AudioEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      if (net.ws && net.ws.readyState === WebSocket.OPEN && (state.tx === 'on' || audio.draining)) net.ws.send(data);
    },
    error: () => { audio.encoder = null; },
  });
  audio.encoder.configure(config);
}

function encodeFrame(samples) {
  const encoder = audio.encoder;
  if (!encoder || encoder.state !== 'configured') return;
  // Discord plays stereo Opus, so send the mono mic on both channels.
  const planar = new Float32Array(FRAME_SAMPLES * 2);
  planar.set(samples, 0);
  planar.set(samples, FRAME_SAMPLES);
  const frame = new AudioData({
    format: 'f32-planar',
    sampleRate: 48000,
    numberOfFrames: FRAME_SAMPLES,
    numberOfChannels: 2,
    timestamp: audio.ts,
    data: planar,
  });
  audio.ts += 20000;
  encoder.encode(frame);
  frame.close();
}

// Transmissions fade in and out so a quick PTT tap does not pop: the newest frame is held back
// until the next one arrives, so the end can be faded when PTT is let go.
function onSamples(samples) {
  if (state.practiceTx && audio.practice) {
    if (audio.practiceLen < (audio.ctx?.sampleRate || 48000) * 30) {
      audio.practice.push(samples.slice(0));
      audio.practiceLen += samples.length;
    }
    return;
  }
  const encoder = audio.encoder;
  if (state.tx !== 'on' || !encoder || encoder.state !== 'configured') return;
  let offset = 0;
  while (offset < samples.length) {
    const take = Math.min(FRAME_SAMPLES - audio.pendingLen, samples.length - offset);
    for (let i = 0; i < take; i += 1) {
      const gain = audio.fadeIn < TX_FADE_IN ? (audio.fadeIn += 1) / TX_FADE_IN : 1;
      audio.pending[audio.pendingLen + i] = samples[offset + i] * gain;
    }
    audio.pendingLen += take;
    offset += take;
    if (audio.pendingLen === FRAME_SAMPLES) {
      if (audio.held) encodeFrame(audio.held);
      audio.held = audio.pending.slice();
      audio.pendingLen = 0;
    }
  }
}

// End of a transmission: fade the held frame and any partial one to silence, then one silent frame.
function encodeTail() {
  const tail = new Float32Array((audio.held ? FRAME_SAMPLES : 0) + audio.pendingLen);
  if (audio.held) tail.set(audio.held, 0);
  tail.set(audio.pending.subarray(0, audio.pendingLen), audio.held ? FRAME_SAMPLES : 0);
  const fade = Math.min(tail.length, TX_FADE_OUT);
  for (let i = 0; i < fade; i += 1) tail[tail.length - fade + i] *= 1 - (i + 1) / fade;
  const frames = Math.ceil(tail.length / FRAME_SAMPLES) + 1;
  const padded = new Float32Array(frames * FRAME_SAMPLES);
  padded.set(tail, 0);
  for (let i = 0; i < frames; i += 1) encodeFrame(padded.subarray(i * FRAME_SAMPLES, (i + 1) * FRAME_SAMPLES));
  audio.held = null;
  audio.pendingLen = 0;
}

let meterFill = null;
// The last screen and selection drawn, so a refresh keeps your scroll place instead of jumping to the top.
let lastDrawn = { screen: '', sel: '' };
let micHot = false;
function onMicLevel(level) {
  state.micLevel = level;
  const hot = Boolean(audio.micStream) && level > 0.06;
  if (hot !== micHot) {
    micHot = hot;
    el.lampMic.classList.toggle('hot', hot);
  }
  if (meterFill) meterFill.style.width = `${Math.min(100, Math.round(level * 140))}%`;
}

function speakerFor(id) {
  let speaker = audio.speakers.get(id);
  if (speaker && speaker.decoder.state === 'closed') {
    dropSpeaker(id, speaker);
    speaker = null;
  }
  if (!speaker) {
    // Each voice plays through its own player (capture-worklet.js), which buffers and smooths it.
    const player = new AudioWorkletNode(audio.ctx, 'radio-player', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    player.connect(audio.rxIn);
    speaker = { ts: 0, last: 0, decoder: null, player };
    const current = speaker;
    current.decoder = new AudioDecoder({
      output: (data) => playDecoded(current, id, data),
      error: () => { dropSpeaker(id, current); },
    });
    current.decoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2 });
    audio.speakers.set(id, current);
  }
  return speaker;
}

function onAudioFrame(buffer) {
  if (!audio.ctx || !audio.rxIn || muted() || buffer.byteLength < 10) return;
  if (audio.ctx.state === 'suspended') void resumeAudio();
  const view = new DataView(buffer);
  if (view.getUint8(0) !== 1) return;
  const id = view.getBigUint64(1).toString();
  const packet = new Uint8Array(buffer, 9);
  const speaker = speakerFor(id);
  speaker.last = performance.now();
  try {
    speaker.decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: speaker.ts, data: packet }));
  } catch {
    // A bad packet only drops 20 ms.
  }
  speaker.ts += 20000;
}

function dropSpeaker(id, speaker) {
  if (audio.speakers.get(id) === speaker) audio.speakers.delete(id);
  try { speaker.decoder.close(); } catch { /* already closed */ }
  try { speaker.player.disconnect(); } catch { /* ignore */ }
}

function playDecoded(speaker, id, data) {
  const frames = data.numberOfFrames;
  const channels = Math.max(1, Math.min(2, data.numberOfChannels));
  const left = new Float32Array(frames);
  data.copyTo(left, { planeIndex: 0, format: 'f32-planar' });
  let right = left;
  if (channels > 1) {
    right = new Float32Array(frames);
    data.copyTo(right, { planeIndex: 1, format: 'f32-planar' });
  }
  data.close();
  remember(left.slice());
  const transfer = right === left ? [left.buffer] : [left.buffer, right.buffer];
  speaker.player.port.postMessage({ left, right: right === left ? null : right }, transfer);
}

// REPLAY: keep the last 30 seconds of what the radio played.
function remember(samples) {
  const at = Date.now();
  audio.history.push({ at, samples });
  while (audio.history.length && at - audio.history[0].at > REPLAY_MS) audio.history.shift();
}

// Plays the last 30 seconds of radio again (gaps between transmissions shortened); again stops it.
function replay() {
  markActive();
  const ctx = audio.ctx;
  if (audio.replay) {
    try { audio.replay.stop(); } catch { /* already over */ }
    return undefined;
  }
  const since = Date.now() - REPLAY_MS;
  const chunks = audio.history.filter((chunk) => chunk.at >= since);
  if (!ctx || !chunks.length) return flash('NOTHING TO REPLAY', 1000);
  const gap = Math.round(ctx.sampleRate * 0.3);
  let length = 0;
  chunks.forEach((chunk, index) => {
    if (index && chunk.at - chunks[index - 1].at > 1000) length += gap;
    length += chunk.samples.length;
  });
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const out = buffer.getChannelData(0);
  let offset = 0;
  chunks.forEach((chunk, index) => {
    if (index && chunk.at - chunks[index - 1].at > 1000) offset += gap;
    out.set(chunk.samples, offset);
    offset += chunk.samples.length;
  });
  void resumeAudio();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.rxIn);
  source.onended = () => {
    if (audio.replay !== source) return;
    audio.replay = null;
    render();
  };
  audio.replay = source;
  source.start();
  flash(`REPLAY ${waitText(buffer.duration * 1000)}`, 1200);
  return undefined;
}

setInterval(() => {
  const now = performance.now();
  for (const [id, speaker] of audio.speakers) {
    if (now - speaker.last > 15000) dropSpeaker(id, speaker);
  }
}, 5000);

const TONES = {
  call: [[980, 0.09], [0, 0.05], [980, 0.09]],
  permit: [[1250, 0.07]],
  end: [[900, 0.05], [1250, 0.05]],
  busy: [[420, 0.12], [0, 0.06], [420, 0.12], [0, 0.06], [420, 0.12]],
  key: [[1600, 0.03]],
};

function playTone(name) {
  const ctx = audio.ctx;
  if (!ctx) return;
  let at = ctx.currentTime + 0.01;
  for (const [freq, duration] of TONES[name] || []) {
    if (freq > 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.08, at + 0.005);
      gain.gain.setValueAtTime(0.08, at + duration - 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain);
      gain.connect(audio.toneOut);
      osc.start(at);
      osc.stop(at + duration + 0.02);
    }
    at += duration;
  }
}

/** Short static burst when a transmission ends, like a real squelch tail. */
function squelchTail() {
  const ctx = audio.ctx;
  if (!ctx || muted() || !FX_SETTINGS[state.settings.listenFx]) return;
  const length = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.18 * (1 - i / length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.rxIn);
  source.start();
}

/* ---------- network ---------- */

function sendJson(message) {
  if (net.ws && net.ws.readyState === WebSocket.OPEN) net.ws.send(JSON.stringify(message));
}

function relayUrl() {
  // The web radio (cwpcso.com/radio) reaches the relay over a secure address the website hands it.
  return state.settings.webRelay || decodeKey(state.settings.key)?.u || state.settings.relayUrl || '';
}

function accountText() {
  if (!decodeKey(state.settings.key)) return 'SIGN IN';
  return state.me?.name ? `${state.me.name} · SIGN OUT` : 'SIGN OUT';
}

function signIn() {
  if (state.conn === 'signing') return;
  state.error = '';
  setScreen('home');
  connect({ signIn: true });
}

async function signOut() {
  await saveNow({ key: '' });
  state.me = null;
  state.error = '';
  setScreen('home');
  connect();
}

function signInFailed(message) {
  if (net.ws) {
    const old = net.ws;
    net.ws = null;
    old.onclose = null;
    try { old.close(); } catch { /* ignore */ }
  }
  state.conn = 'signin';
  state.error = message || 'SIGN-IN FAILED';
  // Blink so a press that fails straight away is still visible.
  flash('SIGN-IN FAILED', 900);
}

async function onLoginInfo(message) {
  if (state.conn !== 'signing') return;
  if (message.available === false || !message.clientId) {
    // The bot host has no Discord client ID/secret configured.
    signInFailed('BOT HAS NO DISCORD SECRET');
    return;
  }
  net.browser = true;
  const result = await api.signIn({ clientId: message.clientId, redirectUri: message.redirectUri });
  net.browser = false;
  if (state.conn !== 'signing') return;
  if (!result?.code) {
    signInFailed(result?.error || 'SIGN-IN CANCELLED');
    return;
  }
  // The relay link can drop while the member approves in the browser: hand the code over on a fresh one.
  if (net.ws?.readyState === WebSocket.OPEN) {
    sendJson({ type: 'auth', code: result.code, version: state.version, channel: state.settings.channel, scan: scanIds() });
  } else {
    connect({ signIn: true, code: result.code });
  }
}

// Removed from the Discord server or the radio channel: the radio closes itself.
async function accessRemoved(message) {
  state.conn = 'removed';
  state.error = message || 'You are no longer allowed on this radio.';
  state.me = null;
  forceTxOff();
  render();
  try { await saveNow({ key: '' }); } catch { /* ignore */ }
  setTimeout(() => { void quitApp(); }, REMOVED_CLOSE_MS);
}

function connect(options = {}) {
  clearTimeout(net.timer);
  if (net.ws) {
    const old = net.ws;
    net.ws = null;
    old.onclose = null;
    try { old.close(); } catch { /* ignore */ }
  }
  forceTxOff();
  state.rx.clear();
  const key = state.settings.key;
  const signingIn = Boolean(options.signIn);
  if (!signingIn && !decodeKey(key)) {
    // Not signed in yet: open Discord sign-in straight away (OK retries if it is closed).
    if (options.autoSignIn) return signIn();
    state.conn = 'signin';
    render();
    return;
  }
  state.conn = signingIn ? 'signing' : 'connecting';
  render();
  let ws;
  try {
    ws = new WebSocket(relayUrl());
  } catch {
    state.conn = signingIn ? 'signin' : 'error';
    state.error = 'Bad radio address.';
    render();
    return;
  }
  ws.binaryType = 'arraybuffer';
  net.ws = ws;
  const hello = options.code
    ? { type: 'auth', code: options.code, version: state.version, channel: state.settings.channel, scan: scanIds() }
    : signingIn ? { type: 'hello', version: state.version } : { type: 'auth', key, version: state.version, channel: state.settings.channel, scan: scanIds() };
  ws.onopen = () => ws.send(JSON.stringify(hello));
  ws.onmessage = (event) => {
    if (typeof event.data !== 'string') {
      onAudioFrame(event.data);
      return;
    }
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    onMessage(message);
  };
  ws.onerror = () => {};
  ws.onclose = (event) => {
    if (net.ws !== ws) return;
    net.ws = null;
    forceTxOff();
    state.rx.clear();
    updateLamps();
    if (state.conn === 'removed') return;
    if (event.code === 4004) {
      void accessRemoved(state.error);
      return;
    }
    if (state.conn === 'signing') {
      // Still approving in the browser: the code goes over a new link when it arrives.
      if (net.browser) return;
      signInFailed(state.error || 'NO SIGNAL');
      return;
    }
    if (event.code === 4001) {
      // Old or revoked sign-in: open Discord sign-in again.
      void saveNow({ key: '' });
      signIn();
      return;
    }
    if (event.code === 4002 || event.code === 4003) {
      state.conn = 'error';
      render();
      return;
    }
    // Web radio: the secure address changes when the bot restarts, so ask the website again.
    if (api.refreshRelay) {
      void api.refreshRelay().then((url) => { if (url) state.settings.webRelay = url; }).catch(() => {});
    }
    net.retry += 1;
    const quick = net.retry <= QUICK_RETRIES;
    state.conn = quick ? (net.wasOnline ? 'lost' : 'connecting') : 'updating';
    const delay = quick ? 1000 * 2 ** (net.retry - 1) : UPDATING_RETRY_MS;
    state.retryAt = Date.now() + delay;
    net.timer = setTimeout(connect, delay);
    render();
  };
}

function onMessage(message) {
  switch (message.type) {
    case 'login':
      void onLoginInfo(message);
      break;
    case 'session':
      if (decodeKey(message.key)) void saveNow({ key: message.key });
      break;
    case 'ready':
      net.retry = 0;
      net.wasOnline = true;
      if (message.game !== undefined) state.game = message.game || null;
      state.error = '';
      state.me = message.you;
      applyMicBoost();
      state.conn = 'online';
      state.calls = [];
      state.callsAt = 0;
      applyChannelStatus(message);
      if (state.settings.deaf) sendJson({ type: 'deaf', active: true });
      applySync(message.synced);
      state.monitor = false;
      // A web radio opened from the staff panel's Listen live, or a desktop radio that had it on.
      if (state.me?.staff && state.settings.monitor) sendJson({ type: 'monitor', active: true });
      sendPendingCrashes();
      if (!state.settings.recordNotice) {
        showModal({ title: 'RECORDED', text: 'RADIO TRANSMISSIONS ARE RECORDED AND KEPT FOR 24 HOURS SO STAFF CAN REVIEW REPORTS.', kind: 'notice' });
      }
      render();
      break;
    case 'status':
      applyChannelStatus(message);
      render();
      break;
    case 'game':
      state.game = message.game || null;
      if (state.screen === 'home' || state.screen === 'menu' || state.screen === 'nearest') render();
      break;
    case 'channel':
      // Switched channel: voices from the old one no longer apply.
      state.rx.clear();
      audio.listenFx?.setStatic(false);
      applyChannelStatus(message);
      updateLamps();
      flash(String(state.channel).toUpperCase().slice(0, 28), 1200);
      break;
    case 'talk':
      if (message.active) {
        state.rx.set(message.id, { name: message.name || 'UNIT', source: message.source, channel: message.channel || state.channelId, signal: Number.isFinite(message.signal) ? message.signal : null });
      } else if (state.rx.delete(message.id)) {
        squelchTail();
      }
      if (!message.active && (message.channel || state.channelId) === state.channelId) state.lastHeard = { name: message.name || 'UNIT', at: Date.now() };
      audio.listenFx?.setStatic(state.rx.size > 0);
      talkPopup();
      updateLamps();
      render();
      break;
    case 'whisper':
      // A private call to this radio only.
      if (message.active) {
        state.rx.set(message.id, { name: message.name || 'UNIT', whisper: true, channel: state.channelId, signal: Number.isFinite(message.signal) ? message.signal : null });
        flash(`WHISPER FROM ${String(message.name || 'UNIT').toUpperCase()}`.slice(0, 28), 1200);
      } else if (state.rx.delete(message.id)) {
        squelchTail();
      }
      talkPopup();
      updateLamps();
      render();
      break;
    case 'warning':
      // A staff warning stays up until OK.
      playTone('busy');
      showModal({ title: 'STAFF WARNING', text: String(message.text || ''), kind: 'warning' });
      speak('Staff warning.');
      break;
    case 'shout':
      // Staff announcement, read aloud on every radio.
      playTone('call');
      flash(`STAFF · ${String(message.text || '').toUpperCase()}`.slice(0, 90), 6000);
      setTimeout(() => speak(`Staff announcement. ${message.text || ''}`), 450);
      break;
    case 'event':
      if (message.open) {
        playTone('call');
        flash(`EVENT CHANNEL OPEN · ${String(message.name || 'EVENT').toUpperCase()}`.slice(0, 40), 3000);
      }
      break;
    case 'monitor':
      state.monitor = Boolean(message.ok && message.active);
      if (!message.ok) flash('STAFF ONLY', 1400);
      else flash(state.monitor ? 'MONITOR ON · ALL CHANNELS' : 'MONITOR OFF', 1400);
      if (!state.monitor) {
        // Voices on channels this radio no longer hears.
        for (const [id, voice] of [...state.rx]) if (voice.channel !== state.channelId && !scanIds().includes(voice.channel)) state.rx.delete(id);
        updateLamps();
      }
      render();
      break;
    case 'damage':
      // Downed in game: the radio is cracked and very weak for a while.
      state.damagedUntil = Date.now() + (Number(message.seconds) || 20) * 1000;
      applyDamage();
      playTone('busy');
      render();
      break;
    case 'notice':
      if (message.kind === 'off-team') {
        playTone('busy');
        flash('OFF TEAM · STAFF HAVE BEEN TOLD', 5000);
        speak('You are on the civilian team on the police radio. Staff have been told.');
      }
      break;
    case 'locked':
      playTone('busy');
      flash(`CH ${channelNumber(message.channel)} LOCKED · RANK`, 1600);
      break;
    case 'moved': {
      saveSettings({ channel: message.channel });
      const why = { 'event-closed': 'EVENT CLOSED · BACK ON CH 1', locked: 'CHANNEL LOCKED · BACK ON CH 1' }[message.reason];
      flash(why || `DISPATCH MOVED YOU · CH ${channelNumber(message.channel)}`, 1800);
      break;
    }
    case 'move':
      if (message.ok) flash(`MOVED ${String(message.name || 'UNIT').toUpperCase()} · CH ${channelNumber(message.channel)}`.slice(0, 32), 1400);
      else flash(message.reason === 'dispatch-only' ? 'DISPATCH (!C) ONLY' : 'UNIT NOT ON A RADIO', 1400);
      break;
    case 'talking':
      state.talking = message.channels || {};
      render();
      break;
    case 'tx':
      onTxReply(message);
      break;
    case 'cut':
      // A !C dispatcher took the channel, or the mic was stuck open for a minute.
      forceTxOff();
      playTone('busy');
      flash(message.reason === 'stuck' ? 'STUCK MIC · CUT' : 'DISPATCH PRIORITY', 1500);
      render();
      break;
    case 'panic-wait':
      // Another radio of yours (or a reconnect) already used the 2 minutes.
      lastPanicAt = Date.now() - PANIC_GAP_MS + message.seconds * 1000;
      panicCooldown(message.seconds);
      break;
    case 'panic':
      showPanic(message);
      break;
    case 'invoice':
      state.inVoice = Boolean(message.active);
      applyDeaf();
      if (state.inVoice && state.tx === 'on') void stopTx();
      flash(state.inVoice ? 'IN DISCORD VC' : 'RADIO ON', 1600);
      break;
    case 'error':
      state.error = message.message || 'Radio error.';
      break;
    default:
      break;
  }
}

function applyChannelStatus(message) {
  state.channel = message.channel || state.channel;
  if (message.channelId) state.channelId = message.channelId;
  if (Array.isArray(message.channels)) {
    state.channels = message.channels;
    state.talking = Object.fromEntries(message.channels.map((channel) => [channel.id, (channel.members || []).filter((member) => member.talking).map((member) => member.id)]));
  }
  state.botOnline = Boolean(message.online);
  state.listeners = message.listeners || 0;
  if ('dispatch' in message) state.dispatch = Boolean(message.dispatch);
  if ('muted' in message) state.muted = Boolean(message.muted);
  if ('signal' in message) state.signal = Number.isFinite(message.signal) ? message.signal : null;
  if ('weather' in message) applyWeather(message.weather);
  if ('monitor' in message) state.monitor = Boolean(message.monitor);
  if ('event' in message) state.event = message.event || null;
  if (Array.isArray(message.scenes)) {
    state.scenes = message.scenes;
    state.scenesAt = Date.now();
  }
  if ('lastHeard' in message) state.lastHeard = message.lastHeard;
  if (Array.isArray(message.calls)) {
    // A new 911 call waiting: a short tone and a flash.
    const known = new Set(state.calls.map((call) => call.id));
    const fresh = message.calls.filter((call) => !known.has(call.id));
    if (state.callsAt && fresh.length) {
      playTone('call');
      flash(`911 · ${String(fresh[0].name).toUpperCase()} WAITING`.slice(0, 30), 1600);
    }
    state.calls = message.calls;
    state.callsAt = Date.now();
  }
  if (state.muted && state.tx === 'on') void stopTx();
  if ('inVoice' in message) {
    state.inVoice = Boolean(message.inVoice);
    applyDeaf();
  }
}

/* ---------- channels ---------- */

// WHO'S ON: OK on a channel's header (or clicking it twice) moves the radio to that channel.
function joinChannel(id) {
  if (id === state.channelId) return flash(`ON ${String(state.channel).toUpperCase()}`.slice(0, 28), 900);
  if (state.conn !== 'online') return flash('NO SIGNAL', 1000);
  if (state.tx !== 'idle') return undefined;
  saveSettings({ channel: id });
  sendJson({ type: 'channel', id });
  return undefined;
}

// Some members' voices go out a little louder; the relay says how much when the radio signs in.
function applyMicBoost() {
  audio.capture?.port.postMessage({ boost: Number(state.me?.boost) || 1 });
}

function changeChannel(step) {
  if (state.conn !== 'online' || state.channels.length < 2) {
    flash(String(state.channel || 'RADIO').toUpperCase().slice(0, 28), 1000);
    return;
  }
  if (state.tx !== 'idle') return;
  // Channels this member's Melonly rank can't use are skipped.
  const open = state.channels.filter((channel) => !channel.locked || channel.id === state.channelId);
  if (open.length < 2) return void flash('OTHER CHANNELS LOCKED', 1200);
  const index = Math.max(0, open.findIndex((channel) => channel.id === state.channelId));
  const next = open[(index + (step < 0 ? open.length - 1 : 1)) % open.length];
  saveSettings({ channel: next.id });
  sendJson({ type: 'channel', id: next.id });
}

function channelNumber(id = state.channelId) {
  return Math.max(0, state.channels.findIndex((channel) => channel.id === id)) + 1;
}

// Scan mode: hear up to two other channels as well as your own; you always talk on your own.
function scanIds() {
  return (Array.isArray(state.settings.scan) ? state.settings.scan : []).filter((id) => id !== state.channelId).slice(0, 2);
}

function scanText() {
  const ids = scanIds();
  return ids.length ? ids.map((id) => `CH ${channelNumber(id)}`).join('+') : 'OFF';
}

function scanItems() {
  return state.channels.filter((channel) => channel.id !== state.channelId && !channel.locked)
    .map((channel) => ({ id: channel.id, label: `CH ${channelNumber(channel.id)} · ${channel.name}` }));
}

async function toggleScan(id) {
  const current = scanIds();
  const scan = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id].slice(-2);
  await saveNow({ scan });
  sendJson({ type: 'scan', ids: scan });
  render();
}

function clockText(at = Date.now()) {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function updateClock() {
  const now = new Date();
  el.lcdDate.textContent = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  el.lcdTime.textContent = clockText(now.getTime());
}

const PANIC_MS = 10_000;
let panicTimer = null;

let panicBuffer = null;

// Unit "1A-12" -> "1 A 12"; postal "204" -> "2 0 4", read like dispatch instead of "two hundred four".
function spokenUnit(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ')
    .replace(/(\d)([A-Z])|([A-Z])(\d)/g, '$1$3 $2$4').replace(/\s+/g, ' ').trim();
}

function spokenDigits(text) {
  return String(text || '').replace(/[^A-Za-z0-9]+/g, '').split('').join(' ');
}

function panicSpeech(message) {
  const who = message.unit ? spokenUnit(message.unit) : String(message.name || 'Unknown unit');
  if (message.postal) return `${who} panic at postal ${spokenDigits(message.postal)}`;
  return message.location ? `${who} panic at ${message.location}` : `${who} panic`;
}

// Free on-device text to speech (Windows' built-in voices), only on this radio, never into Discord.
function speakPanic(message) {
  speak(panicSpeech(message));
}

// The panic sound, played twice back to back on the radio's speaker at the radio's volume,
// with the voice reading the unit and postal while the second one plays.
async function playPanicSound(message = {}) {
  const ctx = audio.ctx;
  if (!ctx) {
    speakPanic(message);
    return;
  }
  if (ctx.state === 'suspended') await resumeAudio();
  try {
    if (!panicBuffer) {
      const bytes = Uint8Array.from(atob(window.PANIC_SOUND || ''), (c) => c.charCodeAt(0));
      panicBuffer = await ctx.decodeAudioData(bytes.buffer);
    }
  } catch {
    playTone('busy');
    speakPanic(message);
    return;
  }
  setTimeout(() => speakPanic(message), Math.round((panicBuffer.duration + 0.15) * 1000));
  let at = ctx.currentTime + 0.02;
  for (let i = 0; i < 2; i += 1) {
    const source = ctx.createBufferSource();
    source.buffer = panicBuffer;
    source.connect(audio.toneOut);
    source.start(at);
    at += panicBuffer.duration + 0.15;
  }
}

// An in-game panic: flash the radio red and show who and where for 10 seconds.
function showPanic(message) {
  const map = message.map && Number.isFinite(message.map.x) && Number.isFinite(message.map.y) ? message.map : null;
  state.panic = {
    name: String(message.name || 'UNKNOWN UNIT').toUpperCase().slice(0, 40),
    location: String(message.location || 'UNKNOWN LOCATION').toUpperCase().slice(0, 60),
    postal: String(message.postal || '').toUpperCase().slice(0, 8),
    map,
  };
  clearTimeout(panicTimer);
  void playPanicSound(message);
  el.radio.classList.add('panic');
  panicTimer = setTimeout(() => {
    state.panic = null;
    el.radio.classList.remove('panic');
    render();
  }, PANIC_MS);
  render();
}

// PANIC button: every radio flashes with your name and in-game location (the relay allows one press per 2 minutes).
let lastPanicAt = 0;
let panicAskTimer = null;

// First press asks ARE YOU SURE; PANIC again or OK sends, anything else (or 5 s) cancels.
function waitText(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function panicCooldown(seconds) {
  flash(`PANIC WAIT ${waitText(seconds * 1000)}`, 1500);
}

function askPanic() {
  if (state.panicAsk) return sendPanic();
  if (state.conn !== 'online') {
    flash('NO SIGNAL', 1000);
    return;
  }
  const wait = lastPanicAt + PANIC_GAP_MS - Date.now();
  if (wait > 0) return panicCooldown(wait / 1000);
  state.panicAsk = Date.now();
  playTone('busy');
  clearTimeout(panicAskTimer);
  panicAskTimer = setTimeout(() => cancelPanic(), PANIC_CONFIRM_MS);
  render();
}

function cancelPanic() {
  if (!state.panicAsk) return;
  clearTimeout(panicAskTimer);
  state.panicAsk = 0;
  render();
}

function sendPanic() {
  clearTimeout(panicAskTimer);
  state.panicAsk = 0;
  if (state.conn !== 'online') {
    flash('NO SIGNAL', 1000);
    return;
  }
  const wait = lastPanicAt + PANIC_GAP_MS - Date.now();
  if (wait > 0) return panicCooldown(wait / 1000);
  lastPanicAt = Date.now();
  sendJson({ type: 'panic' });
  flash('PANIC SENT', 1200);
}

/* ---------- push to talk ---------- */

// Pending end of a transmission after PTT was let go (see PTT_TAIL_MS).
let txTail = null;

function releaseTx(delay = PTT_TAIL_MS) {
  clearTimeout(txTail);
  txTail = setTimeout(() => {
    txTail = null;
    if (!state.pttHeld) void stopTx();
  }, delay);
}

/** @param {'main'|'scan'} kind the talk key, or the second key that talks on your scan channel */
function pttPress(kind = 'main') {
  markActive();
  if (state.pttHeld) return;
  state.pttHeld = kind;
  el.pttSide.classList.add('active');
  if (txTail) {
    clearTimeout(txTail);
    txTail = null;
    // Pressed again within the tail: the same key just keeps talking.
    if (state.tx === 'on' && state.txKind === kind) return;
    // The other key: end that transmission first, then start this one.
    if (state.tx === 'on') {
      void stopTx().then(() => {
        if (state.pttHeld !== kind) return;
        state.pttHeld = false;
        pttPress(kind);
      });
      return;
    }
  }
  if (state.screen === 'test') return;
  if (state.practice) return startPractice();
  if (state.conn !== 'online') {
    playTone('busy');
    flash(state.conn === 'signin' ? 'SIGN IN' : 'NO LINK');
    return;
  }
  if (state.inVoice) {
    playTone('busy');
    flash('IN DISCORD VC');
    return;
  }
  if (state.settings.deaf) {
    playTone('busy');
    flash('DEAFENED · NO TALK');
    return;
  }
  if (state.muted) {
    playTone('busy');
    flash('MUTED BY STAFF');
    return;
  }
  if (state.pttTimeoutUntil > Date.now()) {
    playTone('busy');
    flash(`TIMED OUT ${waitText(state.pttTimeoutUntil - Date.now())}`);
    return;
  }
  if (!audio.micStream || !audio.encoder) {
    playTone('busy');
    flash(audio.micStream ? 'NO OPUS' : 'NO MIC');
    return;
  }
  const request = { type: 'tx', active: true };
  if (kind === 'scan') {
    const scan = scanIds()[0];
    if (!scan) {
      playTone('busy');
      flash('NO SCAN CHANNEL');
      return;
    }
    request.channel = scan;
  } else if (state.whisper) {
    // Whisper armed: the talk key talks to that one unit.
    request.to = state.whisper.id;
    state.whisper.until = Date.now() + WHISPER_IDLE_MS;
  }
  state.tx = 'requesting';
  state.txKind = kind;
  state.txCancel = false;
  sendJson(request);
}

function pttRelease(kind = 'main') {
  if (!state.pttHeld || state.pttHeld !== kind) return;
  state.pttHeld = false;
  state.pttReleasedAt = Date.now();
  el.pttSide.classList.remove('active');
  if (state.practiceTx) return endPractice();
  if (state.tx === 'on') releaseTx();
  else if (state.tx === 'requesting') state.txCancel = true;
}

function onTxReply(message) {
  if (state.tx !== 'requesting') return;
  if (!message.ok) {
    state.tx = 'idle';
    playTone('busy');
    if (message.reason === 'muted') {
      state.muted = true;
      flash('MUTED BY STAFF');
    } else if (message.reason === 'deaf') {
      flash('DEAFENED · NO TALK');
    } else if (message.reason === 'timeout') {
      state.pttTimeoutUntil = Date.now() + (Number(message.seconds) || 60) * 1000;
      flash('PTT SPAM · TIMED OUT', 1500);
    } else if (message.reason === 'busy') flash(`BUSY ${String(message.name || '').toUpperCase()}`.trim());
    else if (message.reason === 'monitor') flash('MONITOR · LISTEN ONLY');
    else if (message.reason === 'whisper-offline') {
      state.whisper = null;
      flash('UNIT NOT ON A RADIO');
    } else flash(message.reason === 'invoice' ? 'IN DISCORD VC' : 'BOT OFFLINE');
    return;
  }
  state.tx = 'on';
  state.txChannel = message.to ? '' : (message.channel || state.channelId);
  state.txStartedAt = Date.now();
  audio.pendingLen = 0;
  audio.held = null;
  audio.fadeIn = 0;
  audio.capture.port.postMessage({ active: true });
  playTone('permit');
  updateLamps();
  render();
  // Let go before the channel answered: the tail counts from when PTT was let go.
  if (state.txCancel || !state.pttHeld) releaseTx(Math.max(0, state.pttReleasedAt + PTT_TAIL_MS - Date.now()));
  state.txCancel = false;
}

async function stopTx() {
  clearTimeout(txTail);
  txTail = null;
  if (state.tx !== 'on') return;
  audio.capture.port.postMessage({ active: false });
  audio.draining = true;
  encodeTail();
  state.tx = 'idle';
  try {
    await audio.encoder?.flush();
  } catch {
    // Encoder reset; the relay times the transmission out on its own.
  }
  audio.draining = false;
  sendJson({ type: 'tx', active: false });
  playTone('end');
  updateLamps();
  render();
}

function forceTxOff() {
  clearTimeout(txTail);
  txTail = null;
  audio.capture?.port.postMessage({ active: false });
  state.tx = 'idle';
  updateLamps();
}

/* ---------- screens ---------- */

function bindLabel(which) {
  return state.settings[which]?.label || 'NONE';
}

// Opens the hotkey screen for one of the keys.
function openBind(which) {
  setScreen('ptt');
  state.bindWhich = which;
  render();
}

function setScreen(screen) {
  if (state.screen === 'test' && screen !== 'test' && audio.testGain) audio.testGain.gain.value = 0;
  if (state.capturing) {
    state.capturing = false;
    void api.capturePtt(false, state.bindWhich);
  }
  if (screen !== 'ptt') state.bindWhich = 'ptt';
  state.screen = screen;
  state.listIndex = 0;
  if (screen === 'menu' || screen === 'setup') void refreshDeviceCache();
  if (screen === 'test' && audio.testGain) audio.testGain.gain.value = volumeGain();
  if (screen === 'mic' || screen === 'headset') void loadDevices(screen);
  render();
}

async function refreshDeviceCache() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.deviceCache = {
      audioinput: devices.filter((device) => device.kind === 'audioinput'),
      audiooutput: devices.filter((device) => device.kind === 'audiooutput'),
    };
  } catch {
    return;
  }
  if (ROWS[state.screen]) render();
}

function deviceLabel(kind, id) {
  const device = state.deviceCache[kind].find((entry) => entry.deviceId === (id || 'default'));
  return device?.label || (id && id !== 'default' ? 'MISSING' : 'DEFAULT');
}

async function loadDevices(screen) {
  const kind = screen === 'mic' ? 'audioinput' : 'audiooutput';
  const current = screen === 'mic' ? state.settings.micId : state.settings.outputId;
  let devices = [];
  try {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === kind);
  } catch {
    devices = [];
  }
  if (!devices.some((device) => device.deviceId === 'default')) devices.unshift({ deviceId: 'default', label: 'Default' });
  state.devices = devices.map((device, index) => ({
    id: device.deviceId,
    label: (device.label || `Device ${index + 1}`),
  }));
  state.listIndex = Math.max(0, state.devices.findIndex((device) => device.id === (current || 'default')));
  if (state.screen === screen) render();
}

function listHtml(items, selected, current) {
  // Full device names wrap; the LCD scrolls to keep the highlighted one in view.
  return `<ul class="list">${items.map((item, index) => {
    const mark = current !== undefined && item.id === current ? '*' : ' ';
    return `<li class="${index === selected ? 'sel' : ''}" data-row="${index}">${mark}${escapeHtml(item.label.toUpperCase())}</li>`;
  }).join('')}</ul>`;
}

// Lines of the WHO screen: a header per channel, then everyone on it (app radio, Discord VC, or both).
// A channel's units with whoever is talking first.
function channelMembers(channel) {
  const talking = new Set(state.talking[channel?.id] || []);
  return (channel?.members || [])
    .map((member) => ({ ...member, talking: talking.has(member.id) }))
    .sort((a, b) => Number(b.talking) - Number(a.talking));
}

function usersLines() {
  const lines = [];
  state.channels.forEach((channel, index) => {
    const members = channelMembers(channel);
    lines.push({ header: true, channelId: channel.id, text: `CH ${index + 1} · ${channel.name} (${members.length})${channel.locked ? ' · LOCKED' : ''}`, current: channel.id === state.channelId });
    if (!members.length) lines.push({ text: 'NOBODY', dim: true });
    for (const member of members) {
      const where = `${member.label ? `${member.label} · ` : ''}${member.app && member.discord ? 'APP + VC' : member.discord ? 'DISCORD VC' : 'APP'}`;
      lines.push({ text: member.name, where, me: member.id === state.me?.id, talking: member.talking, id: member.id, app: member.app, channelId: channel.id });
    }
  });
  return lines;
}

function usersBody() {
  const lines = usersLines();
  if (!lines.length) return '<div class="small">NOT CONNECTED</div>';
  return `<ul class="list users">${lines.map((line, index) => {
    const classes = [index === state.listIndex ? 'sel' : '', line.header ? 'hdr' : '', line.dim ? 'dim' : '', line.current ? 'cur' : '', line.talking ? 'talking' : ''].filter(Boolean).join(' ');
    const where = line.where ? `<span class="where">${escapeHtml(line.where)}</span>` : '';
    return `<li class="${classes}" data-row="${index}">${escapeHtml(String(line.text).toUpperCase())}${line.me ? ' (YOU)' : ''}${where}</li>`;
  }).join('')}</ul>`;
}

function rowsHtml(rows, selected) {
  return `<ul class="list rows">${rows.map((row, index) => {
    const on = index === selected;
    // The highlighted row's value gets clickable arrows when it can be turned up and down.
    const arrows = on && row.adjust;
    return `<li class="${on ? 'sel' : ''}" data-row="${index}"><span class="caret">${on ? '&gt;' : ''}</span>`
      + `<span class="name">${escapeHtml(row.label)}</span>`
      + `<span class="val">${arrows ? '<b class="adj" data-step="-1">&#9664;</b>' : ''}`
      + `${escapeHtml(String(row.value()).toUpperCase())}${arrows ? '<b class="adj" data-step="1">&#9654;</b>' : ''}</span></li>`;
  }).join('')}</ul>`;
}

/* ---------- game data, weather, practice ---------- */

const WET_WEATHER = { rain: 'RAIN', thunderstorm: 'THUNDERSTORM' };

// How long this transmission has been going: 0:07.
function talkTime() {
  const started = state.practiceTx ? state.practiceStartedAt : state.txStartedAt;
  const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Nearest postal and street live as you drive, with a speed and heading worked out from the game.
function gameLine() {
  const game = state.game;
  if (!game?.postal && !game?.street) return '';
  const parts = [game.postal ? `PST ${game.postal}` : '', game.street || ''];
  if (Number.isFinite(game.speed)) parts.push(`${game.speed} MPH${game.heading && game.speed > 0 ? ` ${game.heading}` : ''}`);
  return `<div class="last game">${escapeHtml(parts.filter(Boolean).join(' · ').toUpperCase())}</div>`;
}

// Cracked screen while the radio is damaged (downed in game); clears itself when it recovers.
let damageTimer = null;
function applyDamage() {
  const damaged = state.damagedUntil > Date.now();
  document.getElementById('crack')?.toggleAttribute('hidden', !damaged);
  document.body.classList.toggle('damaged', damaged);
  clearTimeout(damageTimer);
  if (damaged) damageTimer = setTimeout(() => { applyDamage(); render(); }, state.damagedUntil - Date.now() + 50);
  else state.damagedUntil = 0;
  updateLamps();
}

// A pop-up over the screen (staff warning, recorded-transmissions notice) until OK or BACK.
function showModal(modal) {
  state.modal = modal;
  render();
}

function closeModal() {
  if (state.modal?.kind === 'notice') saveSettings({ recordNotice: true });
  state.modal = null;
  render();
}

// MONITOR (staff only): hear every channel, listen-only. The relay checks Administrator live.
function toggleMonitor() {
  if (!state.me?.staff) return flash('STAFF ONLY', 1200);
  const active = !state.monitor;
  saveSettings({ monitor: active });
  sendJson({ type: 'monitor', active });
  return undefined;
}

// SCENES (dispatch): how long each unit has been in a scene or traffic stop voice channel.
function scenesBody() {
  if (!state.scenes.length) return '<div class="mid">NO SCENES</div><div class="small">NOBODY IN A SCENE OR TRAFFIC STOP VC</div>';
  const extra = Math.floor((Date.now() - state.scenesAt) / 1000);
  return `<ul class="list users">${state.scenes.map((scene) => `<li>${escapeHtml(String(scene.name).toUpperCase())}`
    + `<span class="where">${escapeHtml(String(scene.channel).toUpperCase())} · ${waitText((scene.seconds + extra) * 1000)}</span></li>`).join('')}</ul>`;
}

// Crash reporter: errors on this radio go to the staff panel (sent now, or on the next sign-in).
const CRASH_KEY = `${KEY_PREFIX}crashes`;
function reportCrash(error, where) {
  const report = {
    type: 'crash',
    message: String(error?.message || error || 'Unknown error').slice(0, 300),
    stack: String(error?.stack || '').slice(0, 2000),
    where,
    version: String(state.version || ''),
    platform: String(navigator.userAgent || '').slice(0, 60),
    at: Date.now(),
  };
  if (net.ws?.readyState === WebSocket.OPEN && state.conn === 'online') return sendJson(report);
  try {
    const queued = JSON.parse(localStorage.getItem(CRASH_KEY) || '[]');
    localStorage.setItem(CRASH_KEY, JSON.stringify([...queued, report].slice(-5)));
  } catch { /* storage off: lose it */ }
  return undefined;
}

async function sendPendingCrashes() {
  let queued = [];
  try {
    queued = JSON.parse(localStorage.getItem(CRASH_KEY) || '[]');
    localStorage.removeItem(CRASH_KEY);
  } catch { queued = []; }
  // The desktop app's own (main process) crashes, saved to disk.
  try { queued.push(...((await api.takeCrashes?.()) || []).map((crash) => ({ type: 'crash', ...crash }))); } catch { /* older app */ }
  for (const report of queued.slice(-5)) sendJson({ ...report, type: 'crash' });
}

let crashCount = 0;
window.addEventListener('error', (event) => {
  if ((crashCount += 1) <= 5) reportCrash(event.error || event.message, 'renderer');
});
window.addEventListener('unhandledrejection', (event) => {
  if ((crashCount += 1) <= 5) reportCrash(event.reason, 'promise');
});

// NEAREST: the 3 closest units on a radio in game, with their postal and distance.
function nearestBody() {
  if (!state.game) return '<div class="mid">NOT IN GAME</div><div class="small">JOIN THE SERVER TO SEE NEARBY UNITS</div>';
  const units = state.game.nearest || [];
  if (!units.length) return '<div class="mid">NO UNITS NEARBY</div><div class="small">NO OTHER RADIO USERS IN GAME</div>';
  return `<ul class="list users">${units.map((unit) => `<li>${escapeHtml(String(unit.name).toUpperCase())}`
    + `<span class="where">${unit.postal ? `PST ${escapeHtml(unit.postal)} · ` : ''}${Number(unit.miles).toFixed(1)} MI</span></li>`).join('')}</ul>`
    + '<div class="small dim">UPDATES EVERY 5s</div>';
}

// Rain or a storm in game: an alert on the radio screen when it starts.
function applyWeather(next) {
  const weather = String(next || '');
  if (weather === state.weather) return;
  const wasWet = Boolean(WET_WEATHER[state.weather]);
  state.weather = weather;
  if (WET_WEATHER[weather] && !wasWet) {
    playTone('call');
    flash(`WEATHER ALERT · ${WET_WEATHER[weather]}`, 2200);
  }
}

/** Reads text aloud with the computer's own (free) voice, like the panic announcement. */
function speak(text) {
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance !== 'function') return false;
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices().filter((voice) => voice.localService && /^en/i.test(voice.lang));
  if (voices.length) utterance.voice = voices[0];
  utterance.volume = Math.max(0.2, Math.min(1, (Number(state.settings.volume) || 70) / 100));
  utterance.rate = 1.05;
  synth.cancel();
  synth.speak(utterance);
  return true;
}

// WHERE AM I: reads your postal (and street) aloud.
function whereAmI() {
  const game = state.game;
  if (!game?.postal) {
    flash('NOT IN GAME', 1200);
    speak('Location unavailable. You are not in game.');
    return;
  }
  const digits = String(game.postal).split('').join(' ');
  speak(`You are at postal ${digits}${game.street ? `, ${game.street}` : ''}.`);
  flash(`PST ${game.postal}${game.street ? ` · ${game.street}` : ''}`.toUpperCase().slice(0, 30), 1800);
}

// PRACTICE: PTT records you and plays it back through the radio sound, nothing goes on air.
function togglePractice() {
  state.practice = !state.practice;
  if (!state.practice) endPractice(false);
  flash(state.practice ? 'PRACTICE ON · NOT LIVE' : 'PRACTICE OFF · LIVE', 1200);
  render();
}

function startPractice() {
  if (!audio.capture || !audio.micStream) {
    playTone('busy');
    flash('NO MIC');
    return;
  }
  state.practiceTx = true;
  state.practiceStartedAt = Date.now();
  audio.practice = [];
  audio.practiceLen = 0;
  audio.capture.port.postMessage({ active: true });
  playTone('permit');
  updateLamps();
  render();
}

// Up to 30 seconds is kept; letting go plays it back.
function endPractice(playBack = true) {
  if (!state.practiceTx) return;
  state.practiceTx = false;
  audio.capture?.port.postMessage({ active: false });
  playTone('end');
  updateLamps();
  render();
  const chunks = audio.practice || [];
  audio.practice = null;
  const ctx = audio.ctx;
  if (!playBack || !ctx || !chunks.length) return;
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.rxIn);
  // Played back after the end tone, as others would hear you.
  source.start(ctx.currentTime + 0.35);
  flash('PLAYING BACK', Math.min(4000, 400 + buffer.duration * 1000));
}

function homeBody() {
  if (state.update?.state === 'installing') return '<div class="mid">UPDATING</div><div class="small">RADIO WILL REOPEN</div>';
  if (state.update?.state === 'downloading') return `<div class="mid">UPDATING</div><div class="small">DOWNLOADING ${state.update.percent || 0}%</div>`;
  if (state.toast) return `<div class="mid">${escapeHtml(state.toast.text)}</div>`;
  switch (state.conn) {
    case 'signin':
      return `<div class="mid">SIGN IN</div><div class="small">${state.error ? `${escapeHtml(state.error.toUpperCase())} · ` : ''}${state.error ? 'PRESS OK TO TRY AGAIN' : 'PRESS OK FOR DISCORD'}</div>`;
    case 'signing':
      return '<div class="mid">SIGNING IN</div><div class="small">FINISH IN YOUR BROWSER · * CANCEL</div>';
    case 'removed':
      return `<div class="mid">NO ACCESS</div><div class="small">${escapeHtml(state.error.toUpperCase())}</div><div class="small dim">RADIO CLOSING</div>`;
    case 'connecting':
      return '<div class="mid">CONNECTING</div><div class="small dim">. . .</div>';
    case 'lost':
      return '<div class="mid">RECONNECTING</div><div class="small">LINK DROPPED · TRYING AGAIN</div><div class="small dim">. . .</div>';
    case 'updating':
      return `<div class="mid">RADIO UPDATING</div><div class="small">PLEASE WAIT · SETTINGS ARE KEPT</div>`
        + `<div class="small dim">TRYING AGAIN IN ${Math.max(1, Math.ceil((state.retryAt - Date.now()) / 1000))}s</div>`;
    case 'error':
      return `<div class="mid">DENIED</div><div class="small">${escapeHtml(state.error.toUpperCase())}</div>`;
    default:
      break;
  }
  // Zone/channel card, like a handheld's main screen, then the units on this channel.
  let kind = '';
  let line;
  if (state.practiceTx) {
    kind = 'tx';
    line = `PRACTICE · TALKING ${talkTime()} · NOT LIVE`;
  } else if (state.tx === 'on') {
    kind = 'tx';
    if (!state.txChannel && state.whisper) line = `WHISPERING ${state.whisper.name} · ${talkTime()}`;
    else line = `${state.txChannel && state.txChannel !== state.channelId ? `TRANSMITTING ON CH ${channelNumber(state.txChannel)}` : 'TRANSMITTING'} · ${talkTime()}`;
  } else if (state.practice) {
    line = 'PRACTICE MODE · PTT TO TEST · NOT LIVE';
  } else if (state.monitor && !state.rx.size) {
    line = 'STAFF MONITOR · ALL CHANNELS · LISTEN ONLY';
  } else if (state.damagedUntil > Date.now()) {
    kind = 'tx';
    line = `RADIO DAMAGED · ${Math.ceil((state.damagedUntil - Date.now()) / 1000)}s`;
  } else if (state.rx.size) {
    kind = 'rx';
    // Scanned channels show which channel the voice is on; whispers say so.
    line = `RX ${[...state.rx.values()].map((entry) => {
      if (entry.whisper) return `WHISPER ${entry.name}`;
      return entry.channel && entry.channel !== state.channelId ? `${entry.name} (CH ${channelNumber(entry.channel)})` : entry.name;
    }).join(', ')}`;
  } else if (audio.replay) {
    line = 'REPLAYING LAST 30s';
  } else if (state.whisper) {
    line = `WHISPER ${state.whisper.name} · PTT IS PRIVATE`;
  } else if (!state.botOnline) {
    line = 'BOT OFFLINE · WAITING';
  } else if (state.muted) {
    line = 'MUTED BY STAFF · NO TALK';
  } else if (state.settings.deaf) {
    line = 'DEAFENED · NO TALK';
  } else if (state.pttTimeoutUntil > Date.now()) {
    line = `PTT TIMED OUT FOR SPAM · ${waitText(state.pttTimeoutUntil - Date.now())}`;
  } else if (state.inVoice) {
    line = 'MUTED + NO TALK · IN DISCORD VC';
  } else {
    line = state.settings.ptt ? 'READY' : 'READY · SET PTT IN SETTINGS';
  }
  const dispatch = typeof state.dispatch === 'boolean'
    ? `<span class="dispatch ${state.dispatch ? 'on' : 'off'}">DISPATCH ${state.dispatch ? 'ACTIVE' : 'OFFLINE'}</span>`
    : '';
  let html = `<div class="card ${kind}"><div class="zone">Zone 1 · CH ${channelNumber()}${dispatch}</div>`
    + `<div class="chan">${escapeHtml(state.channel || 'Radio')}</div>`
    + `<div class="state">${escapeHtml(line.toUpperCase())}</div>`
    + (state.lastHeard?.name
      ? `<div class="last">LAST HEARD ${escapeHtml(String(state.lastHeard.name).toUpperCase())} · ${clockText(state.lastHeard.at)}</div>`
      : '')
    + (scanIds().length ? `<div class="last">SCAN ${escapeHtml(scanText())}</div>` : '')
    + gameLine()
    + (WET_WEATHER[state.weather] ? `<div class="last weather">&#9888; ${WET_WEATHER[state.weather]} · ROADS ARE WET</div>` : '')
    + (state.whisper ? `<button type="button" class="end-whisper" data-end-whisper>&#9632; END WHISPER TO ${escapeHtml(state.whisper.name)}</button>` : '')
    + '</div>';
  html += callsCard();
  const members = channelMembers(state.channels.find((channel) => channel.id === state.channelId));
  html += `<div class="card units"><div class="zone">UNITS ON CH ${channelNumber()} (${members.length})</div>`
    + (members.length
      ? members.map((member) => `<div class="unit${member.talking ? ' talking' : ''}"><span>${escapeHtml(member.name.toUpperCase())}${member.id === state.me?.id ? ' (YOU)' : ''}</span>`
        + `<span class="where">${member.label ? `${escapeHtml(member.label)} · ` : ''}${member.app && member.discord ? 'APP+VC' : member.discord ? 'VC' : 'APP'}</span></div>`).join('')
      : '<div class="unit dim">NOBODY</div>')
    + '</div>';
  return html;
}

// 911 calls waiting: callers in the Discord 911 channel and recent in-game calls, with how long they've waited.
function callsCard() {
  if (!state.calls.length) return '';
  const extra = Math.round((Date.now() - state.callsAt) / 1000);
  const shown = state.calls.slice(0, 2);
  const more = state.calls.length - shown.length;
  return `<div class="card calls"><div class="zone">911 PENDING (${state.calls.length})</div>${shown.map((call) => {
    const where = call.kind === 'discord' ? 'IN 911 VC' : call.detail || 'IN GAME';
    return `<div class="unit"><span>${escapeHtml(String(call.name).toUpperCase())} · ${escapeHtml(String(where).toUpperCase())}</span>`
      + `<span class="where">${escapeHtml(waitText((call.waited + extra) * 1000))}</span></div>`;
  }).join('')}${more > 0 ? `<div class="call-detail">+${more} MORE</div>` : ''}</div>`;
}

// WHO'S ON → a unit: whisper to them, or (dispatch only) move them to another channel.
const isDispatcher = () => String(state.me?.name || '').includes('!C');

function unitItems() {
  const unit = state.unit;
  if (!unit) return [];
  const items = [];
  if (unit.app && unit.id !== state.me?.id) items.push({ id: 'whisper', label: 'WHISPER (PRIVATE CALL)' });
  if (unit.app && unit.id !== state.me?.id && isDispatcher()) {
    for (const channel of state.channels) {
      if (channel.id !== unit.channelId) items.push({ id: `move:${channel.id}`, label: `MOVE TO CH ${channelNumber(channel.id)} · ${channel.name}` });
    }
  }
  return items;
}

function chooseUnit(item) {
  const unit = state.unit;
  if (!item || !unit) return;
  if (item.id === 'whisper') {
    state.whisper = { id: unit.id, name: String(unit.name).toUpperCase(), until: Date.now() + WHISPER_IDLE_MS };
    setScreen('home');
    flash(`WHISPER ${state.whisper.name}`.slice(0, 28), 1200);
  } else if (item.id.startsWith('move:')) {
    sendJson({ type: 'move', userId: unit.id, channel: item.id.slice(5) });
    setScreen('users');
  }
}

function endWhisper(text = 'WHISPER OFF') {
  if (!state.whisper) return;
  state.whisper = null;
  if (state.tx === 'on' && !state.txChannel) void stopTx();
  flash(text, 900);
}

// Who is talking, for the pop-up shown while the radio is minimized (desktop) or in the background (web).
function talkPopup() {
  const names = [...state.rx.values()].map((entry) => (entry.whisper ? `${entry.name} (WHISPER)` : entry.name));
  api.talkPopup?.(names.length ? `${names.join(', ')} talking` : '');
}

/* ---------- tutorial ---------- */

function tutorialPages() {
  const key = (which, fallback) => (state.settings[which]?.label ? `PRESS ${state.settings[which].label}` : fallback);
  const talk = state.settings.web ? 'HOLD THE TALK BAR' : `HOLD ${state.settings.ptt?.label || 'YOUR PTT KEY'}`;
  return [
    { title: 'WELCOME', text: 'CLEARWATER RADIO QUICK TOUR · OK NEXT · BACK GOES BACK' },
    { title: 'TALK', text: `${talk} TO TALK, LET GO TO LISTEN · DISPATCH (!C) CAN CUT IN` },
    { title: 'CHANNELS', text: `TURN THE CH KNOB OR ${key('chanKey', 'SET A CH KEY')} · SCAN HEARS 2 MORE CHANNELS` },
    { title: 'UNITS', text: 'HOME KEY SHOWS WHO IS ON · OK ON A UNIT TO WHISPER TO THEM' },
    { title: 'REPLAY', text: `${key('replayKey', 'MENU → REPLAY')} TO HEAR THE LAST 30 SECONDS AGAIN` },
    { title: 'PANIC', text: 'PRESS PANIC TWICE TO SEND · EVERY RADIO SEES YOU AND YOUR POSTAL' },
    { title: 'SETTINGS', text: 'GEAR KEY: VOLUME, MIC, HOTKEYS · OK TO FINISH' },
  ];
}

function startTutorial() {
  setScreen('tutorial');
  state.tutorialPage = 0;
  render();
}

function tutorialStep(step) {
  const pages = tutorialPages();
  const page = state.tutorialPage + step;
  if (page < 0) return render();
  if (page >= pages.length) return finishTutorial();
  state.tutorialPage = page;
  return render();
}

function finishTutorial() {
  void saveNow({ tutorialDone: true });
  if (state.firstSetup) return finishSetup();
  setScreen('home');
  return undefined;
}

function updateText() {
  const update = state.update;
  if (!update) return 'CHECK';
  switch (update.state) {
    case 'checking': return 'CHECKING';
    case 'current': return 'CURRENT';
    case 'downloading': return `GET ${update.percent || 0}%`;
    case 'installing': return 'INSTALLING';
    case 'dev': return 'DEV BUILD';
    case 'error': return 'FAILED';
    default: return 'CHECK';
  }
}

function render() {
  const { screen } = state;
  meterFill = null;
  el.softLeftLabel.textContent = screen === 'home' ? 'SETTINGS' : 'RADIO';
  el.softRightLabel.textContent = 'HOME';
  // Status bar: signal bars, then DEAF / IN VC / who is on the channel.
  // Signal bars sweep while looking for the relay and bounce while a voice comes in (just for looks).
  const searching = ['connecting', 'lost', 'signing', 'updating'].includes(state.conn);
  // Online, the bars show this radio's own signal from the coverage map.
  el.lcdSig.className = `sig${state.conn === 'online' ? (state.botOnline ? ` on b${signalBars(state.signal)}` : ' weak') : ''}${searching ? ' scan' : ''}`
    + `${state.rx.size ? ' rx' : ''}${state.tx === 'on' ? ' tx' : ''}${state.settings.sigAnim === false ? '' : ' anim'}`;
  if (state.settings.deaf) el.lcdRight.textContent = 'DEAF';
  else if (state.inVoice) el.lcdRight.textContent = 'IN VC';
  else if (state.practice) el.lcdRight.textContent = 'PRACTICE';
  else if (state.conn === 'updating') el.lcdRight.textContent = 'NO SVC';
  else if (state.conn === 'online') el.lcdRight.textContent = `${state.listeners} ON`;
  else el.lcdRight.textContent = state.version || '';
  updateClock();
  let left = screen.toUpperCase();
  let body = '';

  switch (screen) {
    case 'home':
      // Callsign from the Discord nickname ("1A-12 | Name"), else the name.
      left = `Z1 · ${String(state.me?.callsign || state.me?.name || 'RADIO')}`.toUpperCase();
      el.softRightLabel.textContent = 'UNITS';
      body = homeBody();
      break;
    case 'users':
      left = "WHO'S ON";
      body = usersBody();
      break;
    case 'nearest':
      left = 'NEAREST UNITS';
      body = nearestBody();
      break;
    case 'scenes':
      left = 'SCENE TIMERS';
      body = scenesBody();
      break;
    case 'unit': {
      left = 'UNIT';
      const items = unitItems();
      body = `<div class="small">${escapeHtml(String(state.unit?.name || '').toUpperCase())}</div>`
        + (items.length ? listHtml(items, state.listIndex) : '<div class="small dim">ONLY UNITS ON A RADIO APP CAN BE CALLED</div>');
      break;
    }
    case 'tutorial': {
      const pages = tutorialPages();
      const page = pages[Math.min(state.tutorialPage, pages.length - 1)];
      left = `TOUR ${state.tutorialPage + 1}/${pages.length}`;
      body = `<div class="mid">${escapeHtml(page.title)}</div><div class="small tour">${escapeHtml(page.text)}</div>`;
      break;
    }
    case 'menu':
      body = rowsHtml(ROWS.menu, state.menuIndex);
      break;
    case 'setup':
      body = rowsHtml(SETUP, state.setupIndex);
      break;
    case 'mic':
    case 'headset':
      left = screen === 'mic' ? 'MIC' : 'LISTEN';
      body = state.devices.length
        ? listHtml(state.devices, state.listIndex, screen === 'mic' ? state.settings.micId : state.settings.outputId)
        : '<div class="small">LOADING</div>';
      break;
    case 'scan': {
      left = 'SCAN';
      const items = scanItems();
      const on = new Set(scanIds());
      body = items.length
        ? `<div class="small">OK TURNS A CHANNEL ON OR OFF · YOU TALK ON CH ${channelNumber()}</div><ul class="list">${items.map((item, index) => `<li class="${index === state.listIndex ? 'sel' : ''}" data-row="${index}">${on.has(item.id) ? '[X]' : '[ ]'} ${escapeHtml(item.label.toUpperCase())}</li>`).join('')}</ul>`
        : '<div class="small">NOT CONNECTED</div>';
      break;
    }
    case 'size':
      left = state.firstSetup ? 'SET SIZE' : 'SIZE';
      body = sizeDialHtml()
        + `<div class="small">${state.firstSetup ? 'TURN THE DIAL · OK WHEN DONE' : 'TURN THE DIAL · OK SAVES'}</div>`;
      break;
    case 'test':
      if (state.firstSetup) left = 'MIC CHECK';
      body = '<div class="mid">SPEAK NOW</div><div class="meter"><b id="meterFill"></b></div><div class="small">YOU HEAR WHAT OTHERS HEAR</div>'
        + (state.firstSetup ? '<div class="small">BAR MOVES = MIC WORKS · OK WHEN DONE</div>' : '');
      break;
    case 'ptt': {
      const which = state.bindWhich;
      left = BIND_NAMES[which];
      if (state.mustBind) {
        left = 'SET PTT KEY';
        body = '<div class="mid">PICK A TALK KEY</div><div class="small">PRESS THE KEY OR MOUSE 4/5 YOU WANT TO HOLD TO TALK</div>'
          + (state.settings.hook ? '' : '<div class="small dim">CLICK THE RADIO FIRST</div>');
        break;
      }
      if (state.firstSetup) {
        left = `SET ${BIND_NAMES[which]}`;
        body = `<div class="mid">PRESS A KEY</div><div class="small">${BIND_HELP[which]} · OR MOUSE 4/5</div><div class="small dim">OK OR BACK SKIPS</div>`;
        break;
      }
      const label = bindLabel(which);
      const clear = which === 'ptt' ? '' : ' · BKSP CLEARS';
      body = state.capturing
        ? `<div class="mid">PRESS KEY</div><div class="small">OR MOUSE 4/5 · ESC CANCEL${clear}</div>`
        : `<div class="mid">${escapeHtml(label)}</div><div class="small">${BIND_HELP[which]}</div><div class="small">${state.settings.hook ? '# TO CHANGE' : '# TO CHANGE · ONLY WHEN FOCUSED'}</div>`;
      break;
    }
    default:
      break;
  }
  if (state.panic) {
    left = 'PANIC';
    // Mini map with a marker at the postal, and the postal big underneath.
    const postal = state.panic.postal ? `<div class="postal">POSTAL ${escapeHtml(state.panic.postal)}</div>` : '';
    body = `<div class="mid">${escapeHtml(state.panic.name)}</div>`
      + (state.panic.map ? '<div class="pmap" id="pmap"><i></i></div>' : '<div class="big">PANIC</div>')
      + postal
      + `<div class="small">${escapeHtml(state.panic.location)}</div>`;
  }
  if (state.modal) {
    left = state.modal.title;
    body = `<div class="modal ${escapeHtml(state.modal.kind)}"><div class="mid">${escapeHtml(state.modal.title)}</div>`
      + `<div class="small">${escapeHtml(String(state.modal.text).toUpperCase())}</div><div class="small dim">PRESS OK</div></div>`;
  }
  if (state.panicAsk) {
    left = 'PANIC';
    body = '<div class="big">ARE YOU SURE?</div><div class="small">PRESS PANIC OR OK TO SEND · BACK TO CANCEL</div>';
  }
  if (state.idleWarn) {
    left = 'INACTIVE';
    const seconds = Math.max(0, Math.ceil((IDLE_CLOSE_MS - (Date.now() - lastActiveAt)) / 1000));
    body = `<div class="mid">CLOSING IN ${seconds}s</div><div class="small">NO ACTIVITY FOR 20 MIN · PRESS ANY KEY TO STAY ON</div>`;
  }
  // First-launch setup has no way out but finishing it.
  if (state.mustBind || state.firstSetup) {
    el.softLeftLabel.textContent = '';
    el.softRightLabel.textContent = '';
  }
  el.lcdLeft.textContent = left;
  const sel = `${state.listIndex}:${state.menuIndex}:${state.setupIndex}`;
  const sameScreen = lastDrawn.screen === screen;
  const scrollTop = sameScreen ? el.lcdBody.scrollTop : 0;
  el.lcdBody.innerHTML = body;
  el.lcdBody.scrollTop = scrollTop;
  // Only a new selection scrolls the list; live updates (talking, joins) leave it where you scrolled.
  if (!sameScreen || lastDrawn.sel !== sel) el.lcdBody.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  lastDrawn = { screen, sel };
  if (screen === 'test') meterFill = $('meterFill');
  placeMap();
  updateLamps();
}

// The map is scaled up and shifted so the postal sits in the middle of the window.
function placeMap() {
  const box = $('pmap');
  const point = state.panic?.map;
  if (!box || !point || !window.RADIO_MAP) return;
  const size = 520;
  const width = box.clientWidth || 180;
  const height = box.clientHeight || 72;
  box.style.backgroundImage = `url("${window.RADIO_MAP}")`;
  box.style.backgroundSize = `${size}px ${size}px`;
  box.style.backgroundPosition = `${Math.round(width / 2 - point.x * size)}px ${Math.round(height / 2 - point.y * size)}px`;
}

function updateLamps() {
  audio.signalFx?.set(heardSignal(), state.rx.size > 0);
  el.lampTx.classList.toggle('on', state.tx === 'on' || state.practiceTx);
  el.lampRx.classList.toggle('on', state.rx.size > 0 && !muted());
  el.lampMic.classList.toggle('on', Boolean(audio.micStream));
  const angle = -135 + (270 * state.settings.volume) / 100;
  el.vol.style.transform = `rotate(${angle}deg)`;
  // CH points at the channel, spread over the same arc as VOL.
  const channels = Math.max(1, state.channels.length);
  const chAngle = channels > 1 ? -135 + (270 * (channelNumber() - 1)) / (channels - 1) : 0;
  el.ch.style.transform = `rotate(${chAngle}deg)`;
}

/* ---------- controls ---------- */

function changeVolume(delta) {
  const volume = clampVolume(state.settings.volume + delta);
  if (volume === state.settings.volume) return;
  saveSettings({ volume });
  applyVolume();
  if (state.screen === 'home') flash(`VOL ${volume}`, 700);
  else render();
}

async function choose() {
  const { screen } = state;
  if (ROWS[screen]) {
    const row = ROWS[screen][screen === 'menu' ? state.menuIndex : state.setupIndex];
    if (row.bind) openBind(row.bind);
    else if (row.open) setScreen(row.open);
    else if (row.action) row.action();
  } else if (screen === 'mic' || screen === 'headset') {
    const device = state.devices[state.listIndex];
    if (!device) return;
    if (screen === 'mic') {
      await saveNow({ micId: device.id });
      await openMic();
    } else {
      await saveNow({ outputId: device.id });
      await applyOutput();
    }
    void refreshDeviceCache();
    setScreen(PARENT[screen]);
    flash('SAVED', 800);
  } else if (screen === 'scan') {
    const item = scanItems()[state.listIndex];
    if (item) await toggleScan(item.id);
  } else if (screen === 'size') {
    // First launch: size, then a mic check.
    if (state.firstSetup) return setScreen('test');
    setScreen(PARENT.size);
  } else if (screen === 'users') {
    const line = usersLines()[state.listIndex];
    if (line?.header) joinChannel(line.channelId);
    else if (line?.id) {
      state.unit = { id: line.id, name: line.text, app: line.app, channelId: line.channelId };
      setScreen('unit');
    }
  } else if (screen === 'unit') {
    chooseUnit(unitItems()[state.listIndex]);
  } else if (screen === 'tutorial') {
    tutorialStep(1);
  } else if (screen === 'test') {
    if (state.firstSetup) return startTutorial();
    setScreen('setup');
  } else if (screen === 'ptt' && state.firstSetup) {
    // First launch: OK skips an optional hotkey.
    back();
  } else if (screen === 'ptt') {
    state.capturing = true;
    render();
    if (state.settings.hook) await api.capturePtt(true, state.bindWhich);
  }
}

async function cycleFx(step) {
  const index = Math.max(0, FX_MODES.indexOf(state.settings.listenFx));
  const listenFx = FX_MODES[(index + (step < 0 ? FX_MODES.length - 1 : 1)) % FX_MODES.length];
  await saveNow({ listenFx });
  applyFx();
  render();
}

function radioSize() {
  const size = Number(state.settings.size);
  if (!Number.isFinite(size) || size <= 0) return 100;
  return Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(size / SIZE_STEP) * SIZE_STEP));
}

async function setSize(size) {
  if (size === radioSize()) return render();
  await saveNow({ size });
  return render();
}

// Arrows on the SIZE row (or on the dial screen) step it 5% up or down; OK opens the dial.
function changeSize(step) {
  return setSize(Math.max(SIZE_MIN, Math.min(SIZE_MAX, radioSize() + (step < 0 ? -SIZE_STEP : SIZE_STEP))));
}

// The dial sweeps 240 degrees, open at the bottom: 60% at lower left, 130% at lower right.
const DIAL = { cx: 60, cy: 52, r: 40, start: 150, sweep: 240 };

function dialPoint(fraction, radius = DIAL.r) {
  const angle = ((DIAL.start + DIAL.sweep * fraction) * Math.PI) / 180;
  return [DIAL.cx + radius * Math.cos(angle), DIAL.cy + radius * Math.sin(angle)];
}

function dialArc(fraction) {
  const [x0, y0] = dialPoint(0);
  const [x1, y1] = dialPoint(fraction);
  const large = DIAL.sweep * fraction > 180 ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${DIAL.r} ${DIAL.r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function sizeDialHtml() {
  const size = radioSize();
  const fraction = (size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN);
  const ticks = [];
  for (let value = SIZE_MIN; value <= SIZE_MAX; value += 10) {
    const at = (value - SIZE_MIN) / (SIZE_MAX - SIZE_MIN);
    const [x0, y0] = dialPoint(at, DIAL.r + 4);
    const [x1, y1] = dialPoint(at, DIAL.r + (value === 100 ? 11 : 8));
    ticks.push(`<line class="${value === 100 ? 'tick full' : 'tick'}" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`);
  }
  const [nx, ny] = dialPoint(fraction, DIAL.r - 9);
  const [kx, ky] = dialPoint(fraction);
  return '<div class="size-dial"><b class="adj" data-step="-1">&#9664;</b>'
    + `<svg class="dial" viewBox="0 0 120 92" role="slider" aria-label="Radio size" aria-valuemin="${SIZE_MIN}" aria-valuemax="${SIZE_MAX}" aria-valuenow="${size}">`
    + `<path class="track" d="${dialArc(1)}"/>`
    + (fraction > 0 ? `<path class="fill" d="${dialArc(fraction)}"/>` : '')
    + ticks.join('')
    + `<line class="needle" x1="${DIAL.cx}" y1="${DIAL.cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}"/>`
    + `<circle class="hub" cx="${DIAL.cx}" cy="${DIAL.cy}" r="4"/><circle class="knob-dot" cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="4.5"/>`
    + `<text x="${DIAL.cx}" y="${DIAL.cy + 30}" text-anchor="middle">${size}%</text>`
    + `<text class="end" x="14" y="90" text-anchor="middle">${SIZE_MIN}</text><text class="end" x="106" y="90" text-anchor="middle">${SIZE_MAX}</text>`
    + '</svg><b class="adj" data-step="1">&#9654;</b></div>';
}

// Pointing at the dial picks the size under the pointer (5% steps).
function sizeFromPointer(event) {
  const dial = el.lcdBody.querySelector('svg.dial');
  if (!dial) return null;
  const box = dial.getBoundingClientRect();
  const x = ((event.clientX - box.left) / box.width) * 120 - DIAL.cx;
  const y = ((event.clientY - box.top) / box.height) * 92 - DIAL.cy;
  let angle = (Math.atan2(y, x) * 180) / Math.PI;
  if (angle < DIAL.start - 60) angle += 360; // 0-90 degrees is the right-hand end of the sweep
  const fraction = Math.max(0, Math.min(1, (angle - DIAL.start) / DIAL.sweep));
  // The gap at the bottom snaps to whichever end is closer.
  const gap = angle > DIAL.start + DIAL.sweep ? (x < 0 ? 0 : 1) : fraction;
  return Math.round((SIZE_MIN + gap * (SIZE_MAX - SIZE_MIN)) / SIZE_STEP) * SIZE_STEP;
}

// First launch (or no talk key saved): wait on the PTT screen until one is picked.
function startBind() {
  state.mustBind = true;
  state.screen = 'ptt';
  state.capturing = true;
  render();
  if (state.settings.hook) void api.capturePtt(true);
}

// Talk key picked: then the optional hotkeys, the size, a mic check and the tour, then sign in.
function bindDone() {
  state.mustBind = false;
  state.capturing = false;
  state.firstSetup = true;
  setupBind(SETUP_BINDS[0]);
}

function setupBind(which) {
  if (!which) return setScreen('size');
  setScreen('ptt');
  state.bindWhich = which;
  state.capturing = true;
  render();
  if (state.settings.hook) void api.capturePtt(true, which);
  return undefined;
}

// A setup hotkey was set or skipped: on to the next one.
function nextSetupBind(which) {
  setupBind(SETUP_BINDS[SETUP_BINDS.indexOf(which) + 1]);
}

function finishSetup() {
  state.firstSetup = false;
  void saveNow({ tutorialDone: true });
  setScreen('home');
  flash(`PTT ${state.settings.ptt?.label || 'SET'}`, 1200);
  connect({ autoSignIn: true });
}

async function checkUpdates() {
  state.update = { state: 'checking' };
  render();
  // Progress arrives through onUpdate; only the dev build answers here directly.
  const result = await api.checkForUpdates();
  if (result?.state === 'dev') {
    state.update = result;
    render();
  }
}

function back() {
  const { screen } = state;
  if (screen === 'home' && state.conn === 'signing') {
    void api.cancelSignIn();
    signInFailed('SIGN-IN CANCELLED');
    return;
  }
  if (screen === 'home' && state.whisper) return endWhisper();
  if (screen === 'ptt' && state.firstSetup) {
    // Skip this hotkey.
    const which = state.bindWhich;
    if (state.capturing) void api.capturePtt(false, which);
    state.capturing = false;
    return nextSetupBind(which);
  }
  if (screen === 'ptt' && state.capturing) {
    state.capturing = false;
    void api.capturePtt(false, state.bindWhich);
    render();
    return;
  }
  if (screen === 'tutorial') return void tutorialStep(-1);
  if (state.firstSetup) return void finishSetup();
  setScreen(PARENT[screen] || 'home');
}

function move(delta) {
  const { screen } = state;
  if (screen === 'home') {
    changeVolume(delta < 0 ? 5 : -5);
  } else if (ROWS[screen]) {
    const field = screen === 'menu' ? 'menuIndex' : 'setupIndex';
    const rows = ROWS[screen];
    state[field] = (state[field] + delta + rows.length) % rows.length;
    render();
  } else if ((screen === 'mic' || screen === 'headset') && state.devices.length) {
    state.listIndex = (state.listIndex + delta + state.devices.length) % state.devices.length;
    render();
  } else if (screen === 'scan' && scanItems().length) {
    state.listIndex = (state.listIndex + delta + scanItems().length) % scanItems().length;
    render();
  } else if (screen === 'size') {
    // Up turns the dial up.
    void changeSize(-delta);
  } else if (screen === 'users') {
    const length = Math.max(1, usersLines().length);
    state.listIndex = (state.listIndex + delta + length) % length;
    render();
  } else if (screen === 'unit' && unitItems().length) {
    state.listIndex = (state.listIndex + delta + unitItems().length) % unitItems().length;
    render();
  } else if (screen === 'tutorial') {
    tutorialStep(delta);
  }
}

function press(key) {
  playTone('key');
  if (state.mustBind) return undefined;
  if (state.panicAsk) return key === 'ok' || key === '#' ? sendPanic() : cancelPanic();
  if (state.modal && ['ok', '#', 'back', '*'].includes(key)) return closeModal();
  if (state.firstSetup && (key === 'softL' || key === 'softR')) return undefined;
  // Gray left button: open the menu from the radio screen, otherwise go straight back to the radio.
  if (key === 'softL') return setScreen(state.screen === 'home' ? 'menu' : 'home');
  // Home key: back to the radio screen; on the radio screen it opens every unit on every channel.
  if (key === 'softR') return setScreen(state.screen === 'home' ? 'users' : 'home');
  if (key === 'back') return back();
  if (key === 'up') return move(-1);
  if (key === 'down') return move(1);
  const rows = ROWS[state.screen];
  if (key === 'left' || key === 'right') {
    const step = key === 'left' ? -1 : 1;
    if (state.screen === 'home') return changeVolume(step * 5);
    if (state.screen === 'size') return void changeSize(step);
    const row = rows?.[state.screen === 'menu' ? state.menuIndex : state.setupIndex];
    if (row?.adjust) return void row.adjust(step);
    return step < 0 ? back() : void choose();
  }
  if (key === '#') return void choose();
  // Center of the d-pad: select, or open the menu from the home screen.
  if (key === 'ok') {
    if (state.screen !== 'home') return void choose();
    return state.conn === 'signin' ? signIn() : setScreen('menu');
  }
  if (key === '*') return back();
  // Number keys pick a row: 1 = first row.
  if (rows && /^[1-9]$/.test(key) && Number(key) <= rows.length) {
    state[state.screen === 'menu' ? 'menuIndex' : 'setupIndex'] = Number(key) - 1;
    return void choose();
  }
  return undefined;
}

/* ---------- inactivity ---------- */

let lastActiveAt = Date.now();

function markActive() {
  lastActiveAt = Date.now();
  if (state.idleWarn) {
    state.idleWarn = false;
    render();
  }
}

// Nobody has keyed up or touched the radio for 20 minutes: warn for the last minute, then shut it off.
function checkIdle() {
  // Count the PTT timeout down on the radio screen.
  if (state.pttTimeoutUntil) {
    if (state.pttTimeoutUntil <= Date.now()) state.pttTimeoutUntil = 0;
    if (state.screen === 'home' && !state.toast) render();
  }
  // Stuck mic: let go of a transmission held for a minute.
  if (state.tx === 'on' && Date.now() - state.txStartedAt > STUCK_MIC_MS) {
    void stopTx();
    flash('STUCK MIC · CUT', 1500);
  }
  if (state.whisper && state.whisper.until < Date.now() && state.tx !== 'on') endWhisper('WHISPER ENDED');
  // The 911 waiting times count up on the radio screen.
  if (state.calls.length && state.screen === 'home' && !state.toast && Date.now() % 5000 < 1000) render();
  // Talk timer and the RADIO UPDATING countdown tick every second.
  if (state.screen === 'home' && !state.toast && (state.tx === 'on' || state.practiceTx || state.conn === 'updating' || state.damagedUntil)) render();
  if (state.screen === 'scenes' && !state.toast) render();
  if (state.pttHeld || state.tx === 'on') return markActive();
  const idle = Date.now() - lastActiveAt;
  if (idle >= IDLE_CLOSE_MS) {
    void quitApp();
  } else if (idle >= IDLE_CLOSE_MS - IDLE_WARN_MS) {
    if (!state.idleWarn) playTone('busy');
    state.idleWarn = true;
    render();
  }
}

// Clicking the screen: pick a row, use its arrows, or press OK on the sign-in card.
function clickLcd(event) {
  if (state.mustBind || state.panic) return;
  if (state.panicAsk) return;
  if (state.modal) return void closeModal();
  const { screen } = state;
  if (event.target.closest('[data-end-whisper]')) {
    playTone('key');
    return void endWhisper();
  }
  const item = event.target.closest('li[data-row]');
  const index = item ? Number(item.dataset.row) : -1;
  if (ROWS[screen] && index >= 0) {
    playTone('key');
    const field = screen === 'menu' ? 'menuIndex' : 'setupIndex';
    const row = ROWS[screen][index];
    const step = Number(event.target.closest('[data-step]')?.dataset.step || 0);
    state[field] = index;
    if (step && row.adjust) return void row.adjust(step);
    if (row.open || row.action) return void choose();
    return render();
  }
  if (screen === 'scan' && index >= 0) {
    playTone('key');
    state.listIndex = index;
    return void choose();
  }
  if (screen === 'size') {
    const step = Number(event.target.closest('[data-step]')?.dataset.step || 0);
    if (step) {
      playTone('key');
      void changeSize(step);
    }
    // The dial itself is turned with the pointer (see the lcdBody pointer handlers).
    return undefined;
  }
  if ((screen === 'mic' || screen === 'headset') && index >= 0) {
    playTone('key');
    state.listIndex = index;
    return void choose();
  }
  if (screen === 'users' && index >= 0) {
    // A unit opens whisper / move straight away; a channel header joins on the second click.
    const again = state.listIndex === index;
    state.listIndex = index;
    const line = usersLines()[index];
    if (line?.id || (again && line?.header)) return void choose();
    return render();
  }
  if (screen === 'unit' && index >= 0) {
    playTone('key');
    state.listIndex = index;
    return void choose();
  }
  if (screen === 'tutorial') return void tutorialStep(1);
  if ((screen === 'ptt' && !state.capturing) || screen === 'test') return press('ok');
  if (screen === 'home' && (state.conn === 'signin' || state.conn === 'signing')) return press(state.conn === 'signin' ? 'ok' : '*');
  return undefined;
}

// Which hotkey (when the radio has no global key hook) a key belongs to.
function domBind(code) {
  return ['ptt', 'scanPtt', 'replayKey', 'chanKey'].find((which) => state.settings[which]?.kind === 'dom' && state.settings[which].code === code) || '';
}

// A hotkey went down or up: talk, talk on the scan channel, replay, or next channel.
function onBind({ which, down }) {
  if (which === 'ptt') return down ? pttPress() : pttRelease();
  if (which === 'scanPtt') return down ? pttPress('scan') : pttRelease('scan');
  if (!down) return undefined;
  markActive();
  if (which === 'replayKey') return replay();
  if (which === 'chanKey') return changeChannel(1);
  return undefined;
}

function bindControls() {
  window.addEventListener('pointerdown', () => { markActive(); void resumeAudio(); });
  window.addEventListener('keydown', () => { markActive(); void resumeAudio(); });
  window.addEventListener('wheel', markActive, { passive: true });
  setInterval(checkIdle, 1000);
  document.querySelectorAll('.keypad button').forEach((button) => {
    button.addEventListener('click', () => press(button.dataset.key));
  });
  for (const id of ['softL', 'softR', 'up', 'down', 'left', 'right', 'ok', 'back']) {
    $(id).addEventListener('click', () => press(id));
  }
  // The screen's own labels and rows click too.
  el.softLeftLabel.addEventListener('click', () => press('softL'));
  el.softRightLabel.addEventListener('click', () => press('softR'));
  el.lcdBody.addEventListener('click', clickLcd);
  // SIZE dial: drag around it, click a spot on it, or scroll over it.
  let dialDrag = false;
  const dialTo = (event) => {
    const size = sizeFromPointer(event);
    if (size !== null && size !== radioSize()) void setSize(size);
  };
  el.lcdBody.addEventListener('pointerdown', (event) => {
    if (state.screen !== 'size' || !event.target.closest('svg.dial')) return;
    el.lcdBody.setPointerCapture(event.pointerId);
    dialDrag = true;
    dialTo(event);
  });
  el.lcdBody.addEventListener('pointermove', (event) => { if (dialDrag) dialTo(event); });
  el.lcdBody.addEventListener('pointerup', () => { dialDrag = false; });
  el.lcdBody.addEventListener('pointercancel', () => { dialDrag = false; });
  el.lcdBody.addEventListener('wheel', (event) => {
    if (state.screen !== 'size') return;
    event.preventDefault();
    void changeSize(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  el.deaf.addEventListener('click', () => {
    const deaf = !state.settings.deaf;
    // Deafening while talking ends the transmission.
    if (deaf && state.tx === 'on') void stopTx();
    else if (deaf && state.tx === 'requesting') state.txCancel = true;
    saveSettings({ deaf });
    applyDeaf();
    sendJson({ type: 'deaf', active: deaf });
    if (deaf) state.rx.clear();
    updateLamps();
    flash(deaf ? 'DEAFENED' : 'UNDEAFENED', 900);
  });

  $('quit').addEventListener('click', () => { void quitApp(); });
  $('emer').addEventListener('click', askPanic);
  // CH knob: turn it like VOL (drag up/down or scroll); a plain click steps to the next channel.
  let chDrag = null;
  el.ch.addEventListener('pointerdown', (event) => {
    el.ch.setPointerCapture(event.pointerId);
    chDrag = { y: event.clientY, moved: false };
  });
  el.ch.addEventListener('pointermove', (event) => {
    if (!chDrag) return;
    const steps = Math.trunc((chDrag.y - event.clientY) / 18);
    if (!steps) return;
    chDrag.y -= steps * 18;
    chDrag.moved = true;
    changeChannel(steps > 0 ? 1 : -1);
  });
  el.ch.addEventListener('pointerup', () => {
    if (chDrag && !chDrag.moved) changeChannel(1);
    chDrag = null;
  });
  el.ch.addEventListener('pointercancel', () => { chDrag = null; });
  // The CH label under the knob clicks to the next channel too.
  el.ch.nextElementSibling?.addEventListener('click', () => changeChannel(1));
  el.ch.addEventListener('wheel', (event) => {
    event.preventDefault();
    changeChannel(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  // Side PTT bar: hold with the mouse.
  el.pttSide.addEventListener('pointerdown', (event) => {
    el.pttSide.setPointerCapture(event.pointerId);
    pttPress();
  });
  el.pttSide.addEventListener('pointerup', pttRelease);
  el.pttSide.addEventListener('pointercancel', pttRelease);

  // VOL knob: drag up/down or scroll.
  let drag = null;
  el.vol.addEventListener('pointerdown', (event) => {
    el.vol.setPointerCapture(event.pointerId);
    drag = { y: event.clientY, volume: state.settings.volume };
  });
  el.vol.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const volume = clampVolume(drag.volume + (drag.y - event.clientY));
    if (volume !== state.settings.volume) changeVolume(volume - state.settings.volume);
  });
  el.vol.addEventListener('pointerup', () => { drag = null; });
  el.vol.addEventListener('wheel', (event) => {
    event.preventDefault();
    changeVolume(event.deltaY < 0 ? 5 : -5);
  }, { passive: false });

  // Keyboard while the radio has focus.
  window.addEventListener('keydown', (event) => {
    if (state.screen === 'ptt' && state.capturing && !state.settings.hook) {
      event.preventDefault();
      const which = state.bindWhich;
      if (event.code === 'Escape') {
        if (state.mustBind) return;
        state.capturing = false;
        if (state.firstSetup) return void nextSetupBind(which);
        render();
        return;
      }
      const binding = event.code === 'Backspace' && which !== 'ptt'
        ? null
        : { kind: 'dom', code: event.code, label: event.code.replace(/^Key|^Digit/, '').toUpperCase() };
      state.capturing = false;
      void saveNow({ [which]: binding }).then(() => {
        if (state.mustBind) return bindDone();
        if (state.firstSetup) return nextSetupBind(which);
        return render();
      });
      return;
    }
    if (!state.settings.hook && !event.repeat) {
      const which = domBind(event.code);
      if (which) {
        event.preventDefault();
        onBind({ which, down: true });
        return;
      }
    }
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: '#', Escape: '*', Backspace: '*' };
    const key = map[event.key] || (/^[0-9*#]$/.test(event.key) ? event.key : null);
    if (key) {
      event.preventDefault();
      press(key);
    }
  });
  window.addEventListener('keyup', (event) => {
    if (state.settings.hook) return;
    const which = domBind(event.code);
    if (which) onBind({ which, down: false });
  });
  window.addEventListener('blur', () => {
    if (state.settings.hook) return;
    pttRelease();
    pttRelease('scan');
  });

  api.onPtt((down) => (down ? pttPress() : pttRelease()));
  api.onPttBound((ptt) => {
    state.capturing = false;
    if (ptt) state.settings.ptt = ptt;
    // Escape on the first-launch screen does not skip it.
    if (state.mustBind) return void (ptt ? bindDone() : startBind());
    render();
  });
  api.onBind?.(onBind);
  api.onBindBound?.(({ which, binding }) => {
    state.capturing = false;
    state.settings[which] = binding || null;
    if (state.firstSetup && state.screen === 'ptt') return void nextSetupBind(which);
    render();
  });
  document.addEventListener('visibilitychange', talkPopup);
  api.onUpdate((update) => {
    state.update = update;
    render();
  });
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (state.screen === 'mic' || state.screen === 'headset') void loadDevices(state.screen);
    void refreshDeviceCache();
  });
}

// Start-up: the Clearwater logo on the screen while the radio turns on.
function bootAnimation() {
  const boot = document.getElementById('boot');
  if (!boot) return;
  const logo = boot.querySelector('img');
  if (logo && window.RADIO_LOGO) logo.src = window.RADIO_LOGO;
  const version = boot.querySelector('.boot-ver');
  if (version && state.version) version.textContent = /^\d/.test(state.version) ? `v${state.version}` : `${state.version} RADIO`;
  boot.hidden = false;
  setTimeout(() => boot.classList.add('done'), 1900);
  setTimeout(() => { boot.hidden = true; }, 2400);
}

async function init() {
  state.settings = { ...state.settings, ...(await api.getSettings()) };
  state.version = await api.version();
  bootAnimation();
  bindControls();
  applyDeaf();
  render();
  // Keep the clock current and let the message card expire.
  setInterval(() => (state.screen === 'home' && !state.toast ? render() : updateClock()), 15_000);
  try {
    await initAudio();
  } catch {
    flash('AUDIO ERR', 3000);
  }
  void refreshDeviceCache();
  // A talk key comes first; the web radio has its own hold-to-talk bar instead.
  if (!state.settings.ptt && !state.settings.web) return startBind();
  connect({ autoSignIn: true });
  // Radios set up before the tour (and the web radio's first visit) see it once.
  if (!state.settings.tutorialDone) startTutorial();
  return undefined;
}

void init();
