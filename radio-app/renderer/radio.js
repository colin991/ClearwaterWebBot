'use strict';

/* global AudioEncoder, AudioDecoder, AudioData, EncodedAudioChunk */

const api = window.radioApp;
const $ = (id) => document.getElementById(id);
const el = {
  lcdLeft: $('lcdLeft'),
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
// Rows on the MENU (left soft key) and SETUP screens: name on the left, current value on the right.
const MENU = [
  { label: 'VOL', value: () => String(state.settings.volume), adjust: (step) => changeVolume(step * 5) },
  { label: 'MIC', value: () => deviceLabel('audioinput', state.settings.micId), open: 'mic' },
  { label: 'LISTEN', value: () => deviceLabel('audiooutput', state.settings.outputId), open: 'headset' },
  { label: 'PTT', value: () => state.settings.ptt?.label || 'NONE', open: 'ptt' },
  { label: 'CHANNEL', value: () => String(state.channel || 'RADIO'), action: () => flash(String(state.channel || 'RADIO').toUpperCase().slice(0, 14), 1000) },
  { label: 'FX', value: () => (state.settings.filter ? 'LIGHT' : 'OFF'), adjust: () => toggleFilter(), action: () => toggleFilter() },
  { label: 'SETUP', value: () => 'RUN', open: 'setup' },
];
const SETUP = [
  { label: 'TEST', value: () => 'MIC', open: 'test' },
  { label: 'ACCOUNT', value: () => accountText(), action: () => (decodeKey(state.settings.key) ? signOut() : signIn()) },
  { label: 'UPDATE', value: () => updateText(), action: () => void checkUpdates() },
];
const ROWS = { menu: MENU, setup: SETUP };
const PARENT = { menu: 'home', setup: 'menu', mic: 'menu', ptt: 'menu', headset: 'menu', test: 'setup' };

const state = {
  settings: { volume: 70, filter: true, deaf: false, key: '', micId: 'default', outputId: 'default', ptt: null, hook: false },
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
  botOnline: false,
  listeners: 0,
  me: null,
  tx: 'idle', // idle | requesting | on
  txCancel: false,
  pttHeld: false,
  rx: new Map(),
  toast: null,
  update: null,
  capturing: false,
  micLevel: 0,
};

const audio = {
  ctx: null,
  micStream: null,
  micSource: null,
  txFilter: null,
  rxFilter: null,
  rxDry: null,
  volume: null,
  deafGain: null,
  toneOut: null,
  testGain: null,
  capture: null,
  encoder: null,
  pending: new Float32Array(FRAME_SAMPLES),
  pendingLen: 0,
  ts: 0,
  draining: false,
  speakers: new Map(),
};

const net = { ws: null, retry: 0, timer: null };

/* ---------- helpers ---------- */

function clampVolume(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function volumeGain() {
  return Math.pow(state.settings.volume / 100, 1.5) * 1.4;
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

function distortionCurve(amount) {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i * 2) / curve.length - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

/** Light handheld-radio sound: narrow band, a little mid push and grit, then squashed. */
function createRadioFilter(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 350;
  highpass.Q.value = 0.8;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3000;
  lowpass.Q.value = 0.8;
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1700;
  mid.gain.value = 5;
  mid.Q.value = 1;
  const shaper = ctx.createWaveShaper();
  shaper.curve = distortionCurve(5);
  shaper.oversample = '2x';
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -26;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  input.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(mid);
  mid.connect(shaper);
  shaper.connect(compressor);
  compressor.connect(wet);
  wet.connect(output);
  input.connect(dry);
  dry.connect(output);
  return {
    input,
    output,
    setEnabled(on) {
      wet.gain.value = on ? 0.9 : 0;
      dry.gain.value = on ? 0 : 1;
    },
  };
}

async function initAudio() {
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  audio.ctx = ctx;
  await ctx.audioWorklet.addModule('capture-worklet.js');

  audio.volume = ctx.createGain();
  audio.deafGain = ctx.createGain();
  audio.volume.connect(audio.deafGain);
  audio.deafGain.connect(ctx.destination);
  audio.toneOut = ctx.createGain();
  audio.toneOut.connect(ctx.destination);

  audio.rxFilter = createRadioFilter(ctx);
  audio.rxFilter.output.connect(audio.volume);
  audio.rxDry = ctx.createGain();
  audio.rxDry.connect(audio.volume);

  audio.txFilter = createRadioFilter(ctx);
  audio.capture = new AudioWorkletNode(ctx, 'radio-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const sink = ctx.createGain();
  sink.gain.value = 0;
  audio.txFilter.output.connect(audio.capture);
  audio.capture.connect(sink);
  sink.connect(ctx.destination);
  audio.testGain = ctx.createGain();
  audio.testGain.gain.value = 0;
  audio.txFilter.output.connect(audio.testGain);
  audio.testGain.connect(ctx.destination);

  audio.capture.port.onmessage = (event) => {
    const data = event.data || {};
    if (data.samples) onSamples(data.samples);
    if (typeof data.level === 'number') onMicLevel(data.level);
  };

  applyVolume();
  applyDeaf();
  applyFilter();
  await applyOutput();
  await openMic();
  await initEncoder();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
}

function applyVolume() {
  if (!audio.ctx) return;
  const gain = volumeGain();
  audio.volume.gain.value = gain;
  audio.toneOut.gain.value = gain;
  if (state.screen === 'test') audio.testGain.gain.value = gain;
}

function applyDeaf() {
  if (audio.deafGain) audio.deafGain.gain.value = state.settings.deaf ? 0 : 1;
  el.deaf.classList.toggle('on', Boolean(state.settings.deaf));
}

function applyFilter() {
  audio.txFilter?.setEnabled(state.settings.filter);
  audio.rxFilter?.setEnabled(state.settings.filter);
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
    audio.micSource.connect(audio.txFilter.input);
  }
  updateLamps();
}

async function initEncoder() {
  if (typeof AudioEncoder === 'undefined') {
    flash('NO OPUS');
    return;
  }
  const base = { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 64000 };
  let config = { ...base, opus: { frameDuration: 20000, complexity: 8 } };
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

function onSamples(samples) {
  const encoder = audio.encoder;
  if (state.tx !== 'on' || !encoder || encoder.state !== 'configured') return;
  let offset = 0;
  while (offset < samples.length) {
    const take = Math.min(FRAME_SAMPLES - audio.pendingLen, samples.length - offset);
    audio.pending.set(samples.subarray(offset, offset + take), audio.pendingLen);
    audio.pendingLen += take;
    offset += take;
    if (audio.pendingLen === FRAME_SAMPLES) {
      // Discord plays stereo Opus, so send the mono mic on both channels.
      const planar = new Float32Array(FRAME_SAMPLES * 2);
      planar.set(audio.pending, 0);
      planar.set(audio.pending, FRAME_SAMPLES);
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
      audio.pendingLen = 0;
    }
  }
}

let meterFill = null;
function onMicLevel(level) {
  state.micLevel = level;
  el.lampMic.classList.toggle('hot', Boolean(audio.micStream) && level > 0.06);
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
  if (!audio.ctx || state.settings.deaf || buffer.byteLength < 10) return;
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
  // Other radios already filtered their own voice; only Discord voices get the effect here.
  source.connect(state.rx.get(id)?.source === 'app' ? audio.rxDry : audio.rxFilter.input);
  const now = ctx.currentTime;
  if (speaker.next < now + 0.01) speaker.next = now + 0.06; // small jitter buffer
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
  if (!ctx || state.settings.deaf) return;
  const length = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.18 * (1 - i / length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.rxFilter.input);
  source.start();
}

/* ---------- network ---------- */

function sendJson(message) {
  if (net.ws && net.ws.readyState === WebSocket.OPEN) net.ws.send(JSON.stringify(message));
}

function relayUrl() {
  return decodeKey(state.settings.key)?.u || state.settings.relayUrl || '';
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
  render();
}

async function onLoginInfo(message) {
  if (state.conn !== 'signing') return;
  if (message.available === false || !message.clientId) {
    signInFailed('SIGN-IN NOT SET UP');
    return;
  }
  const result = await api.signIn({ clientId: message.clientId, redirectUri: message.redirectUri });
  if (state.conn !== 'signing') return;
  if (!result?.code) {
    signInFailed(result?.error || 'SIGN-IN CANCELLED');
    return;
  }
  sendJson({ type: 'auth', code: result.code, version: state.version });
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
  ws.onopen = () => ws.send(JSON.stringify(signingIn ? { type: 'hello', version: state.version } : { type: 'auth', key, version: state.version }));
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
      signInFailed(state.error || 'NO SIGNAL');
      return;
    }
    if (event.code === 4001) {
      // Old or revoked sign-in: ask for Discord sign-in again.
      void saveNow({ key: '' });
      state.conn = 'signin';
      render();
      return;
    }
    if (event.code === 4002 || event.code === 4003) {
      state.conn = 'error';
      render();
      return;
    }
    state.conn = 'lost';
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
      state.channel = message.channel || 'RADIO';
      state.botOnline = Boolean(message.online);
      state.listeners = message.listeners || 0;
      state.conn = 'online';
      if (state.settings.deaf) sendJson({ type: 'deaf', active: true });
      render();
      break;
    case 'status':
      state.channel = message.channel || state.channel;
      state.botOnline = Boolean(message.online);
      state.listeners = message.listeners || 0;
      render();
      break;
    case 'talk':
      if (message.active) {
        state.rx.set(message.id, { name: message.name || 'UNIT', source: message.source });
      } else if (state.rx.delete(message.id)) {
        squelchTail();
      }
      updateLamps();
      render();
      break;
    case 'tx':
      onTxReply(message);
      break;
    case 'error':
      state.error = message.message || 'Radio error.';
      break;
    default:
      break;
  }
}

/* ---------- push to talk ---------- */

function pttPress() {
  if (state.pttHeld) return;
  state.pttHeld = true;
  el.pttSide.classList.add('active');
  if (state.screen === 'test') return;
  if (state.conn !== 'online') {
    playTone('busy');
    flash(state.conn === 'signin' ? 'SIGN IN' : 'NO LINK');
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
    flash(message.reason === 'busy' ? `BUSY ${String(message.name || '').toUpperCase()}`.trim() : 'BOT OFFLINE');
    return;
  }
  state.tx = 'on';
  audio.pendingLen = 0;
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
  state.tx = 'idle';
  audio.draining = true;
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
    return `<li class="${index === selected ? 'sel' : ''}">${mark}${escapeHtml(item.label.toUpperCase())}</li>`;
  }).join('')}</ul>`;
}

function rowsHtml(rows, selected) {
  return `<ul class="list rows">${rows.map((row, index) => {
    const on = index === selected;
    return `<li class="${on ? 'sel' : ''}"><span class="caret">${on ? '&gt;' : ''}</span>`
      + `<span class="name">${escapeHtml(row.label)}</span>`
      + `<span class="val">${escapeHtml(String(row.value()).toUpperCase())}</span></li>`;
  }).join('')}</ul>`;
}

function homeBody() {
  if (state.update?.state === 'installing') return '<div class="mid">UPDATING</div><div class="small">RADIO WILL REOPEN</div>';
  if (state.update?.state === 'downloading') return `<div class="mid">UPDATING</div><div class="small">DOWNLOADING ${state.update.percent || 0}%</div>`;
  if (state.toast) return `<div class="mid">${escapeHtml(state.toast.text)}</div>`;
  switch (state.conn) {
    case 'signin':
      return `<div class="mid">SIGN IN</div><div class="small">${state.error ? `${escapeHtml(state.error.toUpperCase())} · ` : ''}PRESS CENTER FOR DISCORD</div>`;
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
  if (state.tx === 'on') return '<div class="big">TX</div><div class="small">TALKING</div>';
  if (state.rx.size) {
    const names = [...state.rx.values()].map((entry) => entry.name.toUpperCase()).join(', ');
    return `<div class="big">RX</div><div class="small">${escapeHtml(names)}</div>`;
  }
  if (!state.botOnline) return '<div class="mid">BOT OFFLINE</div><div class="small">WAITING FOR RADIO</div>';
  const hint = state.settings.ptt ? String(state.me?.name || '').toUpperCase() : 'SET PTT IN MENU';
  return `<div class="big">READY</div><div class="small">${escapeHtml(hint)}</div>`;
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
  el.softLeftLabel.textContent = screen === 'home' ? 'MENU' : 'RADIO';
  el.softRightLabel.textContent = 'HOME';
  el.lcdRight.textContent = state.version || '';
  let left = screen.toUpperCase();
  let body = '';

  switch (screen) {
    case 'home':
      left = String(state.channel || 'RADIO').toUpperCase().slice(0, 14);
      if (state.settings.deaf) el.lcdRight.textContent = 'DEAF';
      else if (state.conn === 'online') el.lcdRight.textContent = `${state.listeners} ON`;
      el.softRightLabel.textContent = `VOL ${state.settings.volume}`;
      body = homeBody();
      break;
    case 'menu':
      body = rowsHtml(MENU, state.menuIndex);
      break;
    case 'setup':
      body = rowsHtml(SETUP, state.setupIndex);
      el.softRightLabel.textContent = '* BACK';
      break;
    case 'mic':
    case 'headset':
      left = screen === 'mic' ? 'MIC' : 'LISTEN';
      body = state.devices.length
        ? listHtml(state.devices, state.listIndex, screen === 'mic' ? state.settings.micId : state.settings.outputId)
        : '<div class="small">LOADING</div>';
      el.softRightLabel.textContent = '# SET';
      break;
    case 'test':
      body = '<div class="mid">SPEAK NOW</div><div class="meter"><b id="meterFill"></b></div><div class="small">YOU HEAR YOUR RADIO VOICE</div>';
      el.softRightLabel.textContent = '# STOP';
      break;
    case 'ptt': {
      left = 'PTT KEY';
      const label = state.settings.ptt?.label || 'NONE';
      body = state.capturing
        ? '<div class="mid">PRESS KEY</div><div class="small">OR MOUSE 4/5 · ESC CANCEL</div>'
        : `<div class="mid">${escapeHtml(label)}</div><div class="small">${state.settings.hook ? '# TO CHANGE' : '# TO CHANGE · ONLY WHEN FOCUSED'}</div>`;
      break;
    }
    default:
      break;
  }
  el.lcdLeft.textContent = left;
  el.lcdBody.innerHTML = body;
  el.lcdBody.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  if (screen === 'test') meterFill = $('meterFill');
  updateLamps();
}

function updateLamps() {
  el.lampTx.classList.toggle('on', state.tx === 'on');
  el.lampRx.classList.toggle('on', state.rx.size > 0 && !state.settings.deaf);
  el.lampMic.classList.toggle('on', Boolean(audio.micStream));
  const angle = -135 + (270 * state.settings.volume) / 100;
  el.vol.style.transform = `rotate(${angle}deg)`;
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
  } else if (screen === 'test') {
    setScreen('setup');
  } else if (screen === 'ptt') {
    state.capturing = true;
    render();
    if (state.settings.hook) await api.capturePtt(true);
  }
}

async function toggleFilter() {
  await saveNow({ filter: !state.settings.filter });
  applyFilter();
  render();
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
  }
}

function press(key) {
  playTone('key');
  // Gray left button: open the menu from the radio screen, otherwise go straight back to the radio.
  if (key === 'softL') return setScreen(state.screen === 'home' ? 'menu' : 'home');
  if (key === 'softR') {
    if (state.screen === 'mic' || state.screen === 'headset' || state.screen === 'test') return void choose();
    return setScreen('home');
  }
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

function bindControls() {
  document.querySelectorAll('.keypad button').forEach((button) => {
    button.addEventListener('click', () => press(button.dataset.key));
  });
  for (const id of ['softL', 'softR', 'up', 'down', 'left', 'right', 'ok']) {
    $(id).addEventListener('click', () => press(id));
  }

  el.deaf.addEventListener('click', () => {
    const deaf = !state.settings.deaf;
    saveSettings({ deaf });
    applyDeaf();
    sendJson({ type: 'deaf', active: deaf });
    if (deaf) state.rx.clear();
    flash(deaf ? 'DEAFENED' : 'UNDEAFENED', 900);
  });

  $('quit').addEventListener('click', () => { void quitApp(); });
  $('emer').addEventListener('click', () => flash('EMER N/A', 900));
  el.ch.addEventListener('click', () => flash(String(state.channel || 'RADIO').toUpperCase().slice(0, 14), 1200));

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
      if (event.code !== 'Escape') {
        const ptt = { kind: 'dom', code: event.code, label: event.code.replace(/^Key|^Digit/, '').toUpperCase() };
        void saveNow({ ptt });
      }
      state.capturing = false;
      render();
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
  try {
    await initAudio();
  } catch {
    flash('AUDIO ERR', 3000);
  }
  void refreshDeviceCache();
  connect();
}

void init();
