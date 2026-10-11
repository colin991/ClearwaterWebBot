/* global AudioEncoder, AudioDecoder, AudioData, EncodedAudioChunk */
'use strict';

/**
 * Clearwater Radio in the browser (cwpcso.com/radio). Same relay and protocol as the desktop app:
 * the website trades the Discord session for a radio key, then this page talks Opus over a wss link.
 * Kept light for phones: no effects, one gain stage, WebCodecs for Opus.
 */

const FRAME_SAMPLES = 960; // 20 ms at 48 kHz
const PANIC_GAP_MS = 15_000;
const PANIC_SHOW_MS = 10_000;
const TONES = {
  permit: [[1250, 0.07]],
  end: [[900, 0.05], [1250, 0.05]],
  busy: [[420, 0.12], [0, 0.06], [420, 0.12], [0, 0.06], [420, 0.12]],
};

const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'), who: $('who'), link: $('link'), screen: $('screen'), zone: $('zone'), count: $('count'),
  channel: $('channel'), state: $('state'), channels: $('channels'), ptt: $('ptt'), pttLabel: $('pttLabel'),
  emer: $('emer'), volume: $('volume'), deaf: $('deaf'), units: $('units'), unitsChannel: $('unitsChannel'),
  toast: $('toast'), panicBox: $('panicBox'), panicWho: $('panicWho'), panicWhere: $('panicWhere'),
  problemTitle: $('problemTitle'), problemText: $('problemText'),
};

const saved = (() => {
  try { return JSON.parse(localStorage.getItem('cw-radio') || '{}'); } catch { return {}; }
})();
const state = {
  session: null, // { key, url, name }
  conn: 'off', // off | connecting | online
  channelId: saved.channel || 'main',
  channel: 'Radio',
  channels: [],
  listeners: 0,
  botOnline: true,
  inVoice: false,
  deaf: Boolean(saved.deaf),
  volume: Number.isFinite(saved.volume) ? saved.volume : 70,
  tx: 'idle', // idle | requesting | on
  txCancel: false,
  pttHeld: false,
  rx: new Map(), // id -> name
  you: null,
  lastPanicAt: 0,
  panic: null,
  stopped: false,
};
const audio = {
  ctx: null, out: null, tones: null, capture: null, mic: null, micSource: null,
  encoder: null, pending: new Float32Array(FRAME_SAMPLES), pendingLen: 0, ts: 0, draining: false,
  speakers: new Map(), panicBuffer: null,
};
let ws = null;
let retryTimer = null;
let retryDelay = 1000;
let toastTimer = null;
let panicTimer = null;
let wakeLock = null;

function persist() {
  try {
    localStorage.setItem('cw-radio', JSON.stringify({ channel: state.channelId, deaf: state.deaf, volume: state.volume }));
  } catch { /* private mode */ }
}

function view(name) {
  el.app.dataset.view = name;
}

function toast(text, ms = 1800) {
  el.toast.textContent = text;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
}

function problem(title, text, retry = true) {
  el.problemTitle.textContent = title;
  el.problemText.textContent = text;
  $('retry').hidden = !retry;
  view('problem');
}

const supported = () => typeof AudioEncoder === 'function' && typeof AudioDecoder === 'function'
  && typeof AudioWorkletNode === 'function' && Boolean(navigator.mediaDevices?.getUserMedia);

/* ---------- sign-in ---------- */

async function fetchSession() {
  const response = await fetch('/api/bot/radio', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) return { signIn: true };
  if (!response.ok) return { error: body.error || 'The radio is offline right now.' };
  return body;
}

async function boot() {
  view('loading');
  let result;
  try {
    result = await fetchSession();
  } catch {
    result = { error: 'Could not reach the website. Check your connection.' };
  }
  if (result.signIn) return view('signin');
  if (result.error) return problem('Radio offline', result.error);
  state.session = result;
  el.who.textContent = result.name ? `Signed in as ${result.name}` : 'Signed in';
  if (!supported()) {
    return problem('Browser not supported',
      'This browser cannot run the radio. Use a recent Chrome, Edge or Safari (iOS 26 or newer).', false);
  }
  if (audio.ctx) return connect();
  view('start');
}

/* ---------- audio ---------- */

async function initAudio() {
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  audio.ctx = ctx;
  audio.out = ctx.createGain();
  audio.out.connect(ctx.destination);
  audio.tones = ctx.createGain();
  audio.tones.connect(ctx.destination);
  applyVolume();
  await ctx.audioWorklet.addModule('radio-worklet.js');
  audio.capture = new AudioWorkletNode(ctx, 'radio-capture', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
    processorOptions: { ceiling: 0.5 },
  });
  audio.capture.port.postMessage({ levelEvery: 48 });
  const sink = ctx.createGain();
  sink.gain.value = 0; // keeps the worklet pulled without playing the mic back
  audio.capture.connect(sink);
  sink.connect(ctx.destination);
  audio.capture.port.onmessage = (event) => {
    if (event.data?.samples) onSamples(event.data.samples);
  };
  await initEncoder();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
}

async function initEncoder() {
  const base = { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 64000 };
  let config = { ...base, opus: { frameDuration: 20000, complexity: 5 } };
  try {
    if (!(await AudioEncoder.isConfigSupported(config)).supported) config = base;
  } catch {
    config = base;
  }
  audio.encoder = new AudioEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      if (ws?.readyState === WebSocket.OPEN && (state.tx === 'on' || audio.draining)) ws.send(data);
    },
    error: () => { audio.encoder = null; },
  });
  audio.encoder.configure(config);
}

async function openMic() {
  if (audio.mic) return true;
  try {
    audio.mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch {
    toast('Allow the microphone to talk', 2600);
    return false;
  }
  audio.micSource = audio.ctx.createMediaStreamSource(audio.mic);
  const highpass = audio.ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 90;
  audio.micSource.connect(highpass);
  highpass.connect(audio.capture);
  return true;
}

function applyVolume() {
  const gain = state.deaf || state.inVoice ? 0 : (state.volume / 100) ** 2 * 1.6;
  if (audio.out) audio.out.gain.value = gain;
  if (audio.tones) audio.tones.gain.value = Math.max(0.15, (state.volume / 100) ** 2);
}

function resume() {
  if (audio.ctx?.state === 'suspended') void audio.ctx.resume().catch(() => {});
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
      // Discord plays stereo Opus, so the mono mic goes on both channels.
      const planar = new Float32Array(FRAME_SAMPLES * 2);
      planar.set(audio.pending, 0);
      planar.set(audio.pending, FRAME_SAMPLES);
      const frame = new AudioData({
        format: 'f32-planar', sampleRate: 48000, numberOfFrames: FRAME_SAMPLES, numberOfChannels: 2,
        timestamp: audio.ts, data: planar,
      });
      audio.ts += 20000;
      encoder.encode(frame);
      frame.close();
      audio.pendingLen = 0;
    }
  }
}

function speakerFor(id) {
  let speaker = audio.speakers.get(id);
  if (speaker && speaker.decoder.state === 'closed') speaker = null;
  if (!speaker) {
    const current = { ts: 0, next: 0, last: 0, decoder: null };
    current.decoder = new AudioDecoder({
      output: (data) => playDecoded(current, data),
      error: () => { audio.speakers.delete(id); },
    });
    current.decoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2 });
    audio.speakers.set(id, current);
    speaker = current;
  }
  return speaker;
}

function onAudioFrame(buffer) {
  if (!audio.ctx || state.deaf || state.inVoice || buffer.byteLength < 10) return;
  resume();
  const view8 = new DataView(buffer);
  if (view8.getUint8(0) !== 1) return;
  const id = view8.getBigUint64(1).toString();
  const speaker = speakerFor(id);
  speaker.last = performance.now();
  try {
    speaker.decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: speaker.ts, data: new Uint8Array(buffer, 9) }));
  } catch {
    // A bad packet only drops 20 ms.
  }
  speaker.ts += 20000;
}

function playDecoded(speaker, data) {
  const ctx = audio.ctx;
  const frames = data.numberOfFrames;
  // Phones get one channel: the radio is mono anyway, and it halves the work.
  const buffer = ctx.createBuffer(1, frames, data.sampleRate);
  const plane = new Float32Array(frames);
  data.copyTo(plane, { planeIndex: 0, format: 'f32-planar' });
  buffer.copyToChannel(plane, 0);
  data.close();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.out);
  const now = ctx.currentTime;
  // A slightly deeper jitter buffer than desktop, for mobile networks.
  if (speaker.next < now + 0.01 || speaker.next > now + 0.4) speaker.next = now + 0.1;
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

function playTone(name) {
  const ctx = audio.ctx;
  if (!ctx) return;
  let at = ctx.currentTime + 0.01;
  for (const [freq, seconds] of TONES[name] || []) {
    if (freq) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.005);
      gain.gain.setValueAtTime(0.25, at + seconds - 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      osc.connect(gain);
      gain.connect(audio.tones);
      osc.start(at);
      osc.stop(at + seconds + 0.01);
    }
    at += seconds;
  }
}

/* ---------- relay link ---------- */

function sendJson(message) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function setConn(conn) {
  state.conn = conn;
  render();
}

function connect() {
  clearTimeout(retryTimer);
  if (!state.session || state.stopped) return;
  try { ws?.close(); } catch { /* ignore */ }
  setConn('connecting');
  view('radio');
  const socket = new WebSocket(state.session.url);
  socket.binaryType = 'arraybuffer';
  ws = socket;
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'auth', key: state.session.key, channel: state.channelId }));
  };
  socket.onmessage = (event) => {
    if (typeof event.data !== 'string') return onAudioFrame(event.data);
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    onMessage(message);
  };
  socket.onclose = (event) => {
    if (ws !== socket) return;
    ws = null;
    forceTxOff();
    state.rx.clear();
    setConn('off');
    if (event.code === 4002) {
      state.stopped = true;
      return problem('Signed in somewhere else', 'Your radio is open on another device. Tap to take it back here.');
    }
    if (event.code === 4003) {
      state.stopped = true;
      return problem('No access', state.lastError || 'You do not have access to this radio.', false);
    }
    if (event.code === 4001) {
      // The key went stale: get a fresh one from the website.
      state.session = null;
      return void boot();
    }
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 15000);
  };
}

function onMessage(message) {
  switch (message.type) {
    case 'ready':
      state.you = message.you || null;
      retryDelay = 1000;
      applyStatus(message);
      setConn('online');
      break;
    case 'status':
    case 'channel':
      applyStatus(message);
      if (message.type === 'channel') toast(state.channel.toUpperCase(), 1000);
      render();
      break;
    case 'talk':
      if (message.active) state.rx.set(String(message.id), message.name || 'Unit');
      else state.rx.delete(String(message.id));
      render();
      break;
    case 'tx':
      onTxReply(message);
      break;
    case 'panic':
      showPanic(message);
      break;
    case 'invoice':
      state.inVoice = Boolean(message.active);
      applyVolume();
      if (state.inVoice && state.tx === 'on') void stopTx();
      toast(state.inVoice ? 'IN DISCORD VC' : 'RADIO ON', 1600);
      render();
      break;
    case 'error':
      state.lastError = message.message || '';
      if (message.code === 'removed') {
        state.stopped = true;
        problem('Removed', state.lastError || 'You are no longer allowed on this radio.', false);
      }
      break;
    default:
      break;
  }
}

function applyStatus(message) {
  if (message.channelId) state.channelId = message.channelId;
  if (message.channel) state.channel = message.channel;
  if (Array.isArray(message.channels)) state.channels = message.channels;
  state.botOnline = message.online !== false;
  state.listeners = message.listeners || 0;
  if ('inVoice' in message) {
    state.inVoice = Boolean(message.inVoice);
    applyVolume();
  }
  persist();
}

/* ---------- push to talk ---------- */

async function pttPress() {
  if (state.pttHeld) return;
  state.pttHeld = true;
  resume();
  render();
  if (state.conn !== 'online') {
    playTone('busy');
    toast('NO LINK');
    return;
  }
  if (state.inVoice) {
    playTone('busy');
    toast('IN DISCORD VC');
    return;
  }
  if (!audio.encoder) {
    playTone('busy');
    toast('NO OPUS');
    return;
  }
  if (!audio.mic) {
    // The first press asks for the mic; talking starts on the next one.
    const ok = await openMic();
    if (!ok || !state.pttHeld) return;
  }
  state.tx = 'requesting';
  state.txCancel = false;
  sendJson({ type: 'tx', active: true });
  render();
}

function pttRelease() {
  if (!state.pttHeld) return;
  state.pttHeld = false;
  if (state.tx === 'on') void stopTx();
  else if (state.tx === 'requesting') state.txCancel = true;
  render();
}

function onTxReply(message) {
  if (state.tx !== 'requesting') return;
  if (!message.ok) {
    state.tx = 'idle';
    playTone('busy');
    if (message.reason === 'busy') toast(`BUSY ${String(message.name || '').toUpperCase()}`.trim());
    else toast(message.reason === 'invoice' ? 'IN DISCORD VC' : 'BOT OFFLINE');
    render();
    return;
  }
  state.tx = 'on';
  audio.pendingLen = 0;
  audio.capture.port.postMessage({ active: true });
  playTone('permit');
  if (state.txCancel || !state.pttHeld) void stopTx();
  render();
}

async function stopTx() {
  if (state.tx !== 'on') return;
  audio.capture.port.postMessage({ active: false });
  state.tx = 'idle';
  audio.draining = true;
  try {
    await audio.encoder?.flush();
  } catch {
    // The relay times the transmission out on its own.
  }
  audio.draining = false;
  sendJson({ type: 'tx', active: false });
  playTone('end');
  render();
}

function forceTxOff() {
  audio.capture?.port.postMessage({ active: false });
  state.tx = 'idle';
}

/* ---------- panic ---------- */

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

function speakPanic(message) {
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance !== 'function' || state.deaf) return;
  const utterance = new SpeechSynthesisUtterance(panicSpeech(message));
  const voice = synth.getVoices().find((v) => v.localService && /^en/i.test(v.lang));
  if (voice) utterance.voice = voice;
  utterance.volume = Math.max(0.2, state.volume / 100);
  utterance.rate = 1.05;
  synth.cancel();
  synth.speak(utterance);
}

async function playPanicSound(message) {
  const ctx = audio.ctx;
  if (!ctx || state.deaf) return speakPanic(message);
  try {
    if (!audio.panicBuffer) {
      const bytes = Uint8Array.from(atob(window.PANIC_SOUND || ''), (c) => c.charCodeAt(0));
      audio.panicBuffer = await ctx.decodeAudioData(bytes.buffer);
    }
  } catch {
    playTone('busy');
    return speakPanic(message);
  }
  setTimeout(() => speakPanic(message), Math.round((audio.panicBuffer.duration + 0.15) * 1000));
  let at = ctx.currentTime + 0.02;
  for (let i = 0; i < 2; i += 1) {
    const source = ctx.createBufferSource();
    source.buffer = audio.panicBuffer;
    source.connect(audio.tones);
    source.start(at);
    at += audio.panicBuffer.duration + 0.15;
  }
}

function showPanic(message) {
  const name = String(message.unit || message.name || 'UNKNOWN UNIT').toUpperCase().slice(0, 40);
  const where = message.postal ? `POSTAL ${message.postal}` : String(message.location || 'UNKNOWN LOCATION');
  el.panicWho.textContent = `PANIC · ${name}`;
  el.panicWhere.textContent = where.toUpperCase().slice(0, 60);
  el.panicBox.hidden = false;
  el.app.classList.add('panic');
  navigator.vibrate?.([300, 120, 300, 120, 300]);
  void playPanicSound(message);
  clearTimeout(panicTimer);
  panicTimer = setTimeout(() => {
    el.panicBox.hidden = true;
    el.app.classList.remove('panic');
  }, PANIC_SHOW_MS);
}

function sendPanic() {
  if (state.conn !== 'online') {
    playTone('busy');
    toast('NO SIGNAL');
    return;
  }
  if (Date.now() - state.lastPanicAt < PANIC_GAP_MS) {
    toast('EMER ALREADY SENT');
    return;
  }
  state.lastPanicAt = Date.now();
  sendJson({ type: 'panic' });
  toast('EMER SENT', 1200);
}

/* ---------- screen ---------- */

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function render() {
  el.link.className = `link${state.conn === 'online' ? (state.botOnline ? ' on' : ' weak') : ''}`;
  const index = Math.max(0, state.channels.findIndex((channel) => channel.id === state.channelId));
  el.zone.textContent = `CH ${index + 1}`;
  el.count.textContent = state.deaf ? 'MUTED' : `${state.listeners} ON`;
  el.channel.textContent = state.channel || 'Radio';
  let line;
  let kind = '';
  if (state.conn === 'connecting') line = 'CONNECTING';
  else if (state.conn !== 'online') line = 'NO SIGNAL · RETRYING';
  else if (state.tx === 'on') { kind = 'tx'; line = 'TRANSMITTING'; }
  else if (state.tx === 'requesting') line = 'KEYING UP';
  else if (state.rx.size) { kind = 'rx'; line = `RX ${[...state.rx.values()].join(', ')}`; }
  else if (!state.botOnline) line = 'BOT OFFLINE · WAITING';
  else if (state.inVoice) line = 'IN DISCORD VC · RADIO OFF';
  else line = 'READY';
  el.state.textContent = line;
  el.screen.className = `screen${kind ? ` ${kind}` : ''}`;
  el.ptt.classList.toggle('held', state.pttHeld);
  el.ptt.classList.toggle('tx', state.tx === 'on');
  el.pttLabel.textContent = state.tx === 'on' ? 'TALKING' : 'HOLD TO TALK';
  el.deaf.setAttribute('aria-pressed', String(state.deaf));

  const ids = state.channels.map((channel) => `${channel.id}:${channel.name}`).join('|');
  if (el.channels.dataset.ids !== ids) {
    el.channels.dataset.ids = ids;
    el.channels.innerHTML = state.channels.map((channel) => (
      `<button type="button" role="tab" data-id="${escapeHtml(channel.id)}">${escapeHtml(channel.name)}</button>`
    )).join('');
  }
  for (const button of el.channels.children) {
    button.setAttribute('aria-selected', String(button.dataset.id === state.channelId));
  }

  const members = state.channels.find((channel) => channel.id === state.channelId)?.members || [];
  el.unitsChannel.textContent = state.channel || 'channel';
  const talking = new Set(state.rx.keys());
  el.units.innerHTML = members.length
    ? members.map((member) => {
      const tag = member.app && member.discord ? 'APP+VC' : (member.discord ? 'VC' : 'APP');
      return `<li class="${talking.has(String(member.id)) ? 'talking' : ''}"><span>${escapeHtml(member.name)}</span><span class="tag">${tag}</span></li>`;
    }).join('')
    : '<li class="empty">Nobody else is on this channel.</li>';
}

/* ---------- controls ---------- */

async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* not allowed: fine */ }
}

function bind() {
  $('start').addEventListener('click', async () => {
    try {
      await initAudio();
    } catch {
      return problem('Audio problem', 'This browser could not start radio audio.', false);
    }
    void keepAwake();
    connect();
  });
  $('retry').addEventListener('click', () => {
    state.stopped = false;
    if (state.session && audio.ctx) connect();
    else void boot();
  });

  const ptt = el.ptt;
  ptt.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    ptt.setPointerCapture?.(event.pointerId);
    void pttPress();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) ptt.addEventListener(type, pttRelease);
  ptt.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || el.app.dataset.view !== 'radio') return;
    event.preventDefault();
    void pttPress();
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') pttRelease();
  });
  window.addEventListener('blur', pttRelease);

  el.channels.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button || button.dataset.id === state.channelId) return;
    if (state.tx !== 'idle') return toast('RELEASE TO SWITCH');
    sendJson({ type: 'channel', id: button.dataset.id });
  });
  el.emer.addEventListener('click', sendPanic);
  el.volume.value = String(state.volume);
  el.volume.addEventListener('input', () => {
    state.volume = Number(el.volume.value);
    applyVolume();
    persist();
  });
  el.deaf.addEventListener('click', () => {
    state.deaf = !state.deaf;
    applyVolume();
    sendJson({ type: 'deaf', active: state.deaf });
    if (state.deaf) state.rx.clear();
    persist();
    toast(state.deaf ? 'MUTED' : 'UNMUTED', 900);
    render();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    resume();
    void keepAwake();
    // Phones drop sockets in the background; reconnect straight away on return.
    if (state.session && audio.ctx && !state.stopped && state.conn === 'off') connect();
  });
}

bind();
render();
void boot();
