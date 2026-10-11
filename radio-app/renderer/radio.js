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
  { label: 'TX VOL', value: () => String(state.settings.txVolume), adjust: (step) => changeTxVolume(step * 5) },
  { label: 'MIC', value: () => deviceLabel('audioinput', state.settings.micId), open: 'mic' },
  { label: 'LISTEN', value: () => deviceLabel('audiooutput', state.settings.outputId), open: 'headset' },
  { label: 'PTT', value: () => state.settings.ptt?.label || 'NONE', open: 'ptt' },
  { label: 'CHANNEL', value: () => String(state.channel || 'RADIO'), adjust: (step) => changeChannel(step), action: () => changeChannel(1) },
  { label: 'WHO', value: () => `${state.channels.reduce((total, channel) => total + (channel.members?.length || 0), 0)} ON`, open: 'users' },
  { label: 'FX', value: () => FX_LABELS[state.settings.listenFx] || 'OFF', adjust: (step) => cycleFx(step), action: () => cycleFx(1) },
  { label: 'FX LVL', value: () => `${fxLevel()}%`, adjust: (step) => changeFxLevel(step), action: () => changeFxLevel(1, true) },
  { label: 'POWER', value: () => powerText(), adjust: (step) => cyclePower(step), action: () => cyclePower(1) },
  { label: 'SIZE', value: () => `${radioSize()}%`, adjust: (step) => changeSize(step), open: 'size' },
  { label: 'SETUP', value: () => 'RUN', open: 'setup' },
];
const SETUP = [
  { label: 'TEST', value: () => 'MIC', open: 'test' },
  { label: 'ACCOUNT', value: () => accountText(), action: () => (decodeKey(state.settings.key) ? signOut() : signIn()) },
  { label: 'UPDATE', value: () => updateText(), action: () => void checkUpdates() },
];
const ROWS = { menu: MENU, setup: SETUP };
// Radio effects only change what this radio hears; what you send stays clean.
const FX_MODES = ['off', 'radio', 'police'];
const FX_LABELS = { off: 'OFF', radio: 'RADIO', police: 'POLICE' };
// LOW trims audio work for slower PCs; AUTO picks LOW on machines with few cores or little memory.
const POWER_MODES = ['auto', 'low', 'full'];
const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
// SIZE shrinks the whole radio overlay (percent of full size).
const SIZES = [50, 60, 70, 80, 90, 100];
// FX LVL: how strong the radio effect is (100% is the normal sound).
const FX_LEVELS = [25, 50, 75, 100, 125, 150];
const SIZE_ITEMS = [...SIZES].reverse().map((size) => ({ id: String(size), label: `${size}%` }));
const PARENT = { menu: 'home', setup: 'menu', mic: 'menu', ptt: 'menu', headset: 'menu', size: 'menu', test: 'setup', users: 'home' };
// PANIC asks first; a second press (or OK) within this long sends it.
const PANIC_CONFIRM_MS = 5000;
// The relay allows one PANIC per member every 2 minutes.
const PANIC_GAP_MS = 2 * 60 * 1000;
// Nobody touching the radio (no PTT, clicks or keys) for this long closes it; a warning shows for the last minute.
const IDLE_CLOSE_MS = 20 * 60 * 1000;
const IDLE_WARN_MS = 60 * 1000;

const state = {
  settings: { volume: 70, txVolume: 60, listenFx: 'radio', power: 'auto', size: 100, fxLevel: 100, deaf: false, key: '', micId: 'default', outputId: 'default', ptt: null, hook: false, channel: 'main' },
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
  pttHeld: false,
  rx: new Map(),
  panic: null,
  inVoice: false, // in the Discord channel already, so the radio stays quiet
  toast: null,
  update: null,
  capturing: false,
  mustBind: false, // first launch: the radio stays on the PTT screen until a talk key is picked
  firstSetup: false, // first launch: the size screen follows the talk key
  panicAsk: 0, // when PANIC was pressed and is waiting for ARE YOU SURE
  pttTimeoutUntil: 0, // the relay timed this member out of talking for spamming PTT
  micLevel: 0,
};

const audio = {
  ctx: null,
  micStream: null,
  micSource: null,
  txIn: null,
  txGain: null,
  rxIn: null,
  listenFx: null,
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
};

const net = { ws: null, retry: 0, timer: null, browser: false };

/* ---------- helpers ---------- */

function clampVolume(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function volumeGain() {
  return Math.pow(state.settings.volume / 100, 1.5) * 1.4;
}

/** Talk level: 70 sends the mic as-is, lower is quieter. */
function txVolumeGain() {
  return Math.pow(state.settings.txVolume / 70, 1.5);
}

// Quick changes (volume drags) are batched; every changed field is kept until it is written.
let saveTimer = null;
let pendingSave = {};
function saveSettings(patch) {
  Object.assign(state.settings, patch);
  Object.assign(pendingSave, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void flushSettings(); }, 250);
}

function flushSettings() {
  clearTimeout(saveTimer);
  const patch = pendingSave;
  pendingSave = {};
  return Object.keys(patch).length ? api.setSettings(patch) : Promise.resolve();
}

function saveNow(patch) {
  Object.assign(state.settings, patch);
  return api.setSettings(patch);
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
  audio.rxIn.connect(audio.listenFx.input);
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
  txHighpass.connect(audio.txGain);
  audio.capture = new AudioWorkletNode(ctx, 'radio-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { ceiling: 0.5 },
  });
  audio.txGain.connect(audio.capture);
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
  applyTxVolume();
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

function applyTxVolume() {
  if (audio.txGain) audio.txGain.gain.value = txVolumeGain();
}

const muted = () => Boolean(state.settings.deaf || state.inVoice);

function applyDeaf() {
  if (audio.deafGain) audio.deafGain.gain.value = muted() ? 0 : 1;
  el.deaf.classList.toggle('on', Boolean(state.settings.deaf));
}

function fxLevel() {
  const level = Number(state.settings.fxLevel);
  return FX_LEVELS.includes(level) ? level : 100;
}

function applyFx() {
  audio.listenFx?.setMode(state.settings.listenFx, fxLevel());
  audio.listenFx?.setStatic(state.rx.size > 0);
}

const lowPower = () => state.settings.power === 'low' || (state.settings.power !== 'full' && LOW_END);

function powerText() {
  if (state.settings.power === 'low') return 'LOW';
  if (state.settings.power === 'full') return 'FULL';
  return LOW_END ? 'AUTO LOW' : 'AUTO';
}

// LOW: a lighter Opus encoder, no effect oversampling, and fewer mic-level updates.
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
    audio.speakers.delete(id);
    speaker = null;
  }
  if (!speaker) {
    speaker = { ts: 0, next: 0, last: 0, decoder: null };
    const current = speaker;
    current.decoder = new AudioDecoder({
      output: (data) => playDecoded(current, id, data),
      error: () => { audio.speakers.delete(id); },
    });
    current.decoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2 });
    audio.speakers.set(id, current);
  }
  return speaker;
}

function onAudioFrame(buffer) {
  if (!audio.ctx || muted() || buffer.byteLength < 10) return;
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

function playDecoded(speaker, id, data) {
  const ctx = audio.ctx;
  const frames = data.numberOfFrames;
  const channels = Math.max(1, Math.min(2, data.numberOfChannels));
  const buffer = ctx.createBuffer(2, frames, data.sampleRate);
  for (let c = 0; c < 2; c += 1) {
    const plane = new Float32Array(frames);
    data.copyTo(plane, { planeIndex: Math.min(c, channels - 1), format: 'f32-planar' });
    buffer.copyToChannel(plane, c);
  }
  data.close();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.rxIn);
  const now = ctx.currentTime;
  // Small jitter buffer; if a stall left us far behind, skip ahead instead of lagging.
  if (speaker.next < now + 0.01 || speaker.next > now + 0.3) speaker.next = now + 0.06;
  source.start(speaker.next);
  speaker.next += buffer.duration;
}

setInterval(() => {
  const now = performance.now();
  for (const [id, speaker] of audio.speakers) {
    if (now - speaker.last > 15000) {
      try { speaker.decoder.close(); } catch { /* ignore */ }
      audio.speakers.delete(id);
    }
  }
}, 5000);

const TONES = {
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
    sendJson({ type: 'auth', code: result.code, version: state.version, channel: state.settings.channel });
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
    ? { type: 'auth', code: options.code, version: state.version, channel: state.settings.channel }
    : signingIn ? { type: 'hello', version: state.version } : { type: 'auth', key, version: state.version, channel: state.settings.channel };
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
    state.conn = 'lost';
    // Web radio: the secure address changes when the bot restarts, so ask the website again.
    if (api.refreshRelay) {
      void api.refreshRelay().then((url) => { if (url) state.settings.webRelay = url; }).catch(() => {});
    }
    net.retry += 1;
    net.timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(net.retry, 5)));
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
      state.error = '';
      state.me = message.you;
      state.conn = 'online';
      applyChannelStatus(message);
      if (state.settings.deaf) sendJson({ type: 'deaf', active: true });
      render();
      break;
    case 'status':
      applyChannelStatus(message);
      render();
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
        state.rx.set(message.id, { name: message.name || 'UNIT', source: message.source });
      } else if (state.rx.delete(message.id)) {
        squelchTail();
      }
      audio.listenFx?.setStatic(state.rx.size > 0);
      updateLamps();
      render();
      break;
    case 'tx':
      onTxReply(message);
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
  if (Array.isArray(message.channels)) state.channels = message.channels;
  state.botOnline = Boolean(message.online);
  state.listeners = message.listeners || 0;
  if ('dispatch' in message) state.dispatch = Boolean(message.dispatch);
  if ('inVoice' in message) {
    state.inVoice = Boolean(message.inVoice);
    applyDeaf();
  }
}

/* ---------- channels ---------- */

function changeChannel(step) {
  if (state.conn !== 'online' || state.channels.length < 2) {
    flash(String(state.channel || 'RADIO').toUpperCase().slice(0, 28), 1000);
    return;
  }
  if (state.tx !== 'idle') return;
  const index = Math.max(0, state.channels.findIndex((channel) => channel.id === state.channelId));
  const next = state.channels[(index + (step < 0 ? state.channels.length - 1 : 1)) % state.channels.length];
  saveSettings({ channel: next.id });
  sendJson({ type: 'channel', id: next.id });
}

function channelNumber() {
  return Math.max(0, state.channels.findIndex((channel) => channel.id === state.channelId)) + 1;
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
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance !== 'function') return;
  const utterance = new SpeechSynthesisUtterance(panicSpeech(message));
  const voices = synth.getVoices().filter((voice) => voice.localService && /^en/i.test(voice.lang));
  if (voices.length) utterance.voice = voices[0];
  utterance.volume = Math.max(0.2, Math.min(1, (Number(state.settings.volume) || 70) / 100));
  utterance.rate = 1.05;
  synth.cancel();
  synth.speak(utterance);
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
  state.panic = {
    name: String(message.name || 'UNKNOWN UNIT').toUpperCase().slice(0, 40),
    location: String(message.location || 'UNKNOWN LOCATION').toUpperCase().slice(0, 60),
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

function pttPress() {
  markActive();
  if (state.pttHeld) return;
  state.pttHeld = true;
  el.pttSide.classList.add('active');
  if (state.screen === 'test') return;
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
  state.tx = 'requesting';
  state.txCancel = false;
  sendJson({ type: 'tx', active: true });
}

function pttRelease() {
  if (!state.pttHeld) return;
  state.pttHeld = false;
  el.pttSide.classList.remove('active');
  if (state.tx === 'on') void stopTx();
  else if (state.tx === 'requesting') state.txCancel = true;
}

function onTxReply(message) {
  if (state.tx !== 'requesting') return;
  if (!message.ok) {
    state.tx = 'idle';
    playTone('busy');
    if (message.reason === 'timeout') {
      state.pttTimeoutUntil = Date.now() + (Number(message.seconds) || 60) * 1000;
      flash('PTT SPAM · TIMED OUT', 1500);
    } else if (message.reason === 'busy') flash(`BUSY ${String(message.name || '').toUpperCase()}`.trim());
    else flash(message.reason === 'invoice' ? 'IN DISCORD VC' : 'BOT OFFLINE');
    return;
  }
  state.tx = 'on';
  audio.pendingLen = 0;
  audio.held = null;
  audio.fadeIn = 0;
  audio.capture.port.postMessage({ active: true });
  playTone('permit');
  updateLamps();
  render();
  if (state.txCancel || !state.pttHeld) void stopTx();
  state.txCancel = false;
}

async function stopTx() {
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
  audio.capture?.port.postMessage({ active: false });
  state.tx = 'idle';
  updateLamps();
}

/* ---------- screens ---------- */

function setScreen(screen) {
  if (state.screen === 'test' && screen !== 'test' && audio.testGain) audio.testGain.gain.value = 0;
  if (state.capturing) {
    state.capturing = false;
    void api.capturePtt(false);
  }
  state.screen = screen;
  state.listIndex = 0;
  if (screen === 'menu' || screen === 'setup') void refreshDeviceCache();
  if (screen === 'test' && audio.testGain) audio.testGain.gain.value = volumeGain();
  if (screen === 'mic' || screen === 'headset') void loadDevices(screen);
  if (screen === 'size') state.listIndex = Math.max(0, SIZE_ITEMS.findIndex((item) => item.id === String(radioSize())));
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
function usersLines() {
  const lines = [];
  state.channels.forEach((channel, index) => {
    const members = channel.members || [];
    lines.push({ header: true, text: `CH ${index + 1} · ${channel.name} (${members.length})`, current: channel.id === state.channelId });
    if (!members.length) lines.push({ text: 'NOBODY', dim: true });
    for (const member of members) {
      const where = member.app && member.discord ? 'APP + VC' : member.discord ? 'DISCORD VC' : 'APP';
      lines.push({ text: member.name, where, me: member.id === state.me?.id });
    }
  });
  return lines;
}

function usersBody() {
  const lines = usersLines();
  if (!lines.length) return '<div class="small">NOT CONNECTED</div>';
  return `<ul class="list users">${lines.map((line, index) => {
    const classes = [index === state.listIndex ? 'sel' : '', line.header ? 'hdr' : '', line.dim ? 'dim' : '', line.current ? 'cur' : ''].filter(Boolean).join(' ');
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
      return '<div class="mid">NO SIGNAL</div><div class="small">RETRYING</div>';
    case 'error':
      return `<div class="mid">DENIED</div><div class="small">${escapeHtml(state.error.toUpperCase())}</div>`;
    default:
      break;
  }
  // Zone/channel card, like a handheld's main screen, then the units on this channel.
  let kind = '';
  let line;
  if (state.tx === 'on') {
    kind = 'tx';
    line = 'TRANSMITTING';
  } else if (state.rx.size) {
    kind = 'rx';
    line = `RX ${[...state.rx.values()].map((entry) => entry.name).join(', ')}`;
  } else if (!state.botOnline) {
    line = 'BOT OFFLINE · WAITING';
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
    + `<div class="state">${escapeHtml(line.toUpperCase())}</div></div>`;
  const members = state.channels.find((channel) => channel.id === state.channelId)?.members || [];
  html += `<div class="card units"><div class="zone">UNITS ON CH ${channelNumber()} (${members.length})</div>`
    + (members.length
      ? members.map((member) => `<div class="unit"><span>${escapeHtml(member.name.toUpperCase())}${member.id === state.me?.id ? ' (YOU)' : ''}</span>`
        + `<span class="where">${member.app && member.discord ? 'APP+VC' : member.discord ? 'VC' : 'APP'}</span></div>`).join('')
      : '<div class="unit dim">NOBODY</div>')
    + '</div>';
  return html;
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
  el.lcdSig.className = `sig${state.conn === 'online' ? (state.botOnline ? ' on' : ' weak') : ''}`;
  if (state.settings.deaf) el.lcdRight.textContent = 'DEAF';
  else if (state.inVoice) el.lcdRight.textContent = 'IN VC';
  else if (state.conn === 'online') el.lcdRight.textContent = `${state.listeners} ON`;
  else el.lcdRight.textContent = state.version || '';
  updateClock();
  let left = screen.toUpperCase();
  let body = '';

  switch (screen) {
    case 'home':
      left = `Z1 · ${String(state.me?.name || 'RADIO')}`.toUpperCase();
      el.softRightLabel.textContent = 'UNITS';
      body = homeBody();
      break;
    case 'users':
      left = "WHO'S ON";
      body = usersBody();
      break;
    case 'menu':
      body = rowsHtml(MENU, state.menuIndex);
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
    case 'size':
      left = state.firstSetup ? 'SET SIZE' : 'SIZE';
      body = (state.firstSetup ? '<div class="small">PICK THE RADIO SIZE · OK WHEN DONE</div>' : '')
        + listHtml(SIZE_ITEMS, state.listIndex, String(radioSize()));
      break;
    case 'test':
      body = '<div class="mid">SPEAK NOW</div><div class="meter"><b id="meterFill"></b></div><div class="small">YOU HEAR WHAT OTHERS HEAR</div>';
      break;
    case 'ptt': {
      left = 'PTT KEY';
      if (state.mustBind) {
        left = 'SET PTT KEY';
        body = '<div class="mid">PICK A TALK KEY</div><div class="small">PRESS THE KEY OR MOUSE 4/5 YOU WANT TO HOLD TO TALK</div>'
          + (state.settings.hook ? '' : '<div class="small dim">CLICK THE RADIO FIRST</div>');
        break;
      }
      const label = state.settings.ptt?.label || 'NONE';
      body = state.capturing
        ? '<div class="mid">PRESS KEY</div><div class="small">OR MOUSE 4/5 · ESC CANCEL</div>'
        : `<div class="mid">${escapeHtml(label)}</div><div class="small">${state.settings.hook ? '# TO CHANGE' : '# TO CHANGE · ONLY WHEN FOCUSED'}</div>`;
      break;
    }
    default:
      break;
  }
  if (state.panic) {
    left = 'PANIC';
    body = `<div class="big">PANIC</div><div class="mid">${escapeHtml(state.panic.name)}</div><div class="small">${escapeHtml(state.panic.location)}</div>`;
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
  el.lcdBody.innerHTML = body;
  el.lcdBody.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  if (screen === 'test') meterFill = $('meterFill');
  updateLamps();
}

function updateLamps() {
  el.lampTx.classList.toggle('on', state.tx === 'on');
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
    if (row.open) setScreen(row.open);
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
  } else if (screen === 'size') {
    if (state.firstSetup) return finishSetup();
    setScreen(PARENT.size);
  } else if (screen === 'test') {
    setScreen('setup');
  } else if (screen === 'ptt') {
    state.capturing = true;
    render();
    if (state.settings.hook) await api.capturePtt(true);
  }
}

function changeTxVolume(delta) {
  const txVolume = clampVolume(state.settings.txVolume + delta);
  if (txVolume === state.settings.txVolume) return;
  saveSettings({ txVolume });
  applyTxVolume();
  render();
}

async function cyclePower(step) {
  const before = lowPower();
  const index = Math.max(0, POWER_MODES.indexOf(state.settings.power));
  const power = POWER_MODES[(index + (step < 0 ? POWER_MODES.length - 1 : 1)) % POWER_MODES.length];
  await saveNow({ power });
  applyPower();
  if (before !== lowPower() && state.tx === 'idle') await initEncoder();
  render();
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
  return SIZES.includes(size) ? size : 100;
}

async function setSize(size) {
  if (size === radioSize()) return render();
  await saveNow({ size });
  return render();
}

// Arrows on the SIZE row step it up or down; OK opens the size list.
function changeSize(step) {
  const index = SIZES.indexOf(radioSize());
  return setSize(SIZES[Math.max(0, Math.min(SIZES.length - 1, index + (step < 0 ? -1 : 1)))]);
}

async function changeFxLevel(step, wrap = false) {
  let next = FX_LEVELS.indexOf(fxLevel()) + (step < 0 ? -1 : 1);
  if (wrap) next = (next + FX_LEVELS.length) % FX_LEVELS.length;
  const level = FX_LEVELS[Math.max(0, Math.min(FX_LEVELS.length - 1, next))];
  if (level === fxLevel()) return;
  await saveNow({ fxLevel: level });
  applyFx();
  render();
}

// First launch (or no talk key saved): wait on the PTT screen until one is picked.
function startBind() {
  state.mustBind = true;
  state.screen = 'ptt';
  state.capturing = true;
  render();
  if (state.settings.hook) void api.capturePtt(true);
}

// Talk key picked: then the size, then sign in.
function bindDone() {
  state.mustBind = false;
  state.capturing = false;
  state.firstSetup = true;
  setScreen('size');
}

function finishSetup() {
  state.firstSetup = false;
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
  if (screen === 'ptt' && state.capturing) {
    state.capturing = false;
    void api.capturePtt(false);
    render();
    return;
  }
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
  } else if (screen === 'size') {
    state.listIndex = (state.listIndex + delta + SIZE_ITEMS.length) % SIZE_ITEMS.length;
    void setSize(Number(SIZE_ITEMS[state.listIndex].id));
  } else if (screen === 'users') {
    const length = Math.max(1, usersLines().length);
    state.listIndex = (state.listIndex + delta + length) % length;
    render();
  }
}

function press(key) {
  playTone('key');
  if (state.mustBind) return undefined;
  if (state.panicAsk) return key === 'ok' || key === '#' ? sendPanic() : cancelPanic();
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
  const { screen } = state;
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
  if (screen === 'size' && index >= 0) {
    playTone('key');
    state.listIndex = index;
    void setSize(Number(SIZE_ITEMS[index].id)).then(() => choose());
    return undefined;
  }
  if ((screen === 'mic' || screen === 'headset') && index >= 0) {
    playTone('key');
    state.listIndex = index;
    return void choose();
  }
  if (screen === 'users' && index >= 0) {
    state.listIndex = index;
    return render();
  }
  if ((screen === 'ptt' && !state.capturing) || screen === 'test') return press('ok');
  if (screen === 'home' && (state.conn === 'signin' || state.conn === 'signing')) return press(state.conn === 'signin' ? 'ok' : '*');
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

  el.deaf.addEventListener('click', () => {
    const deaf = !state.settings.deaf;
    saveSettings({ deaf });
    applyDeaf();
    sendJson({ type: 'deaf', active: deaf });
    if (deaf) state.rx.clear();
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
      if (event.code === 'Escape') {
        if (state.mustBind) return;
        state.capturing = false;
        render();
        return;
      }
      const ptt = { kind: 'dom', code: event.code, label: event.code.replace(/^Key|^Digit/, '').toUpperCase() };
      state.capturing = false;
      void saveNow({ ptt }).then(() => (state.mustBind ? bindDone() : render()));
      return;
    }
    if (!state.settings.hook && state.settings.ptt?.kind === 'dom' && event.code === state.settings.ptt.code) {
      event.preventDefault();
      pttPress();
      return;
    }
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: '#', Escape: '*', Backspace: '*' };
    const key = map[event.key] || (/^[0-9*#]$/.test(event.key) ? event.key : null);
    if (key) {
      event.preventDefault();
      press(key);
    }
  });
  window.addEventListener('keyup', (event) => {
    if (!state.settings.hook && state.settings.ptt?.kind === 'dom' && event.code === state.settings.ptt.code) pttRelease();
  });
  window.addEventListener('blur', () => {
    if (!state.settings.hook) pttRelease();
  });

  api.onPtt((down) => (down ? pttPress() : pttRelease()));
  api.onPttBound((ptt) => {
    state.capturing = false;
    if (ptt) state.settings.ptt = ptt;
    // Escape on the first-launch screen does not skip it.
    if (state.mustBind) return void (ptt ? bindDone() : startBind());
    render();
  });
  api.onUpdate((update) => {
    state.update = update;
    render();
  });
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (state.screen === 'mic' || state.screen === 'headset') void loadDevices(state.screen);
    void refreshDeviceCache();
  });
}

async function init() {
  state.settings = { ...state.settings, ...(await api.getSettings()) };
  state.version = await api.version();
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
  if (!state.settings.ptt && !state.settings.web) startBind();
  else connect({ autoSignIn: true });
}

void init();
