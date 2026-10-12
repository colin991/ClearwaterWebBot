/* global AudioWorkletProcessor, registerProcessor, sampleRate */

/**
 * Peak limiter with instant attack and a short release. Unlike DynamicsCompressorNode it adds
 * no make-up gain, so it can only ever make audio quieter.
 */
class Limiter {
  constructor(ceiling, releaseMs = 120) {
    this.ceiling = ceiling;
    this.gain = 1;
    this.release = 1 - Math.exp(-1 / ((releaseMs / 1000) * sampleRate));
  }

  /** @param {Float32Array[]} inputs @param {Float32Array[]} outputs */
  run(inputs, outputs) {
    const length = inputs[0].length;
    for (let i = 0; i < length; i += 1) {
      let peak = 0;
      for (const channel of inputs) peak = Math.max(peak, Math.abs(channel[i]));
      const target = peak > this.ceiling ? this.ceiling / peak : 1;
      this.gain = target < this.gain ? target : this.gain + (target - this.gain) * this.release;
      for (let c = 0; c < outputs.length; c += 1) outputs[c][i] = (inputs[c] || inputs[0])[i] * this.gain;
    }
  }
}

/**
 * AUTO GAIN: lifts quiet mics toward a normal talking level. It only ever boosts (up to 6x), follows
 * speech slowly so it never pumps, and holds still in silence so background noise isn't raised.
 */
class AutoGain {
  constructor() {
    this.gain = 1;
    this.level = 0;
    this.target = 0.12; // speech RMS to aim for
    this.gate = 0.008; // quieter than this is silence: leave the gain alone
    this.maxGain = 6;
    this.follow = 1 - Math.exp(-1 / (0.3 * sampleRate)); // level detector, ~300 ms
    this.rise = 1 - Math.exp(-1 / (1.5 * sampleRate)); // gain goes up over ~1.5 s
    this.fall = 1 - Math.exp(-1 / (0.15 * sampleRate)); // and down fast when speech gets loud
  }

  run(samples) {
    for (let i = 0; i < samples.length; i += 1) {
      const x = samples[i];
      this.level += (x * x - this.level) * this.follow;
      const rms = Math.sqrt(this.level);
      if (rms > this.gate) {
        const want = Math.max(1, Math.min(this.maxGain, this.target / rms));
        this.gain += (want - this.gain) * (want < this.gain ? this.fall : this.rise);
      }
      samples[i] = x * this.gain;
    }
  }
}

// Limits the talk signal, streams it to the page while transmitting, and reports a level for the MIC lamp.
class RadioCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.active = false;
    this.peak = 0;
    this.blocks = 0;
    this.levelEvery = 8;
    this.ceiling = options?.processorOptions?.ceiling ?? 0.5;
    this.limiter = new Limiter(this.ceiling);
    this.agc = new AutoGain();
    this.agcOn = true;
    // MIC BOOST (set by the relay for some members): louder after the auto gain, with the ceiling raised to match.
    this.boost = 1;
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if ('active' in data) this.active = Boolean(data.active);
      if ('agc' in data) {
        this.agcOn = Boolean(data.agc);
        this.agc.gain = 1;
      }
      if (data.levelEvery) this.levelEvery = data.levelEvery;
      if ('boost' in data) {
        this.boost = Math.min(1.5, Math.max(1, Number(data.boost) || 1));
        this.limiter.ceiling = this.ceiling * this.boost;
      }
    };
  }

  process(inputs, outputs) {
    const channel = inputs[0] && inputs[0][0];
    const out = outputs[0] && outputs[0][0];
    if (channel && out) {
      const input = this.agcOn || this.boost !== 1 ? channel.slice(0) : channel;
      if (this.agcOn) this.agc.run(input);
      if (this.boost !== 1) for (let i = 0; i < input.length; i += 1) input[i] *= this.boost;
      for (let i = 0; i < input.length; i += 1) {
        const value = Math.abs(input[i]);
        if (value > this.peak) this.peak = value;
      }
      this.limiter.run([input], [out]);
      if (this.active) this.port.postMessage({ samples: out.slice(0) });
    }
    this.blocks += 1;
    if (this.blocks >= this.levelEvery) {
      this.port.postMessage({ level: this.peak });
      this.peak = 0;
      this.blocks = 0;
    }
    return true;
  }
}

// Keeps what you hear from ever clipping, however high VOL goes.
class RadioLimiter extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.limiter = new Limiter(options?.processorOptions?.ceiling ?? 0.7);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (input && input.length && output) this.limiter.run(input, output);
    return true;
  }
}

/**
 * One incoming voice. Decoded 48 kHz frames are queued and played as one continuous stream:
 * - it waits for a small buffer (`target`) before starting, so network hiccups don't cut the voice;
 * - a lost or late packet is covered by a short fade of the last few milliseconds instead of a gap,
 *   and the buffer grows a little so it doesn't happen again;
 * - it plays a touch faster when the buffer runs long and a touch slower when it runs short, so the
 *   voice never drifts behind and lost packets don't drain it dry.
 */
const SOURCE_RATE = 48000;
const TARGET_MIN = 0.06 * SOURCE_RATE;
const TARGET_MAX = 0.36 * SOURCE_RATE;
const TARGET_START = 0.1 * SOURCE_RATE;
const TARGET_STEP = 0.03 * SOURCE_RATE; // added each time the buffer runs dry mid-voice
const HICCUP = 0.1 * SOURCE_RATE; // dry for less than this, then more voice: a network hiccup, not a pause
const TARGET_DECAY = 0.004; // samples less per output sample while smooth (about 0.2 s less per minute)
const OVERFLOW = 0.6 * SOURCE_RATE; // more than this ahead of target: skip ahead to target
const FADE = 240; // 5 ms
const CONCEAL = 1920; // 40 ms: how long a dry buffer is covered before going quiet
const IDLE_AFTER = 0.3 * SOURCE_RATE; // dry this long: the voice ended; the next one buffers again

class RadioPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = []; // [left, right] Float32Arrays
    this.pos = 0; // read position in chunks[0] (fractional)
    this.buffered = 0; // samples queued (from pos)
    this.target = TARGET_START;
    this.mode = 'idle'; // idle | buffering | playing | dry
    this.fadeIn = 0;
    this.dry = 0; // samples since the buffer ran dry
    this.history = [new Float32Array(480), new Float32Array(480)]; // last 10 ms played, for covering gaps
    this.historyAt = 0;
    this.port.onmessage = (event) => {
      const { left, right } = event.data || {};
      if (!left) return;
      this.chunks.push([left, right || left]);
      this.buffered += left.length;
      if (this.mode === 'idle') this.mode = 'buffering';
      else if (this.mode === 'dry' && this.dry < HICCUP) {
        // Back after a network hiccup: carry on at once, fading in over the cover-up, with a bigger buffer next time.
        this.mode = 'playing';
        this.fadeIn = FADE;
        this.target = Math.min(TARGET_MAX, this.target + TARGET_STEP);
      } else if (this.mode === 'dry') {
        // A pause in speech: buffer up again before the next words.
        this.mode = 'buffering';
      }
    };
  }

  read(channel) {
    const chunk = this.chunks[0];
    const i = Math.floor(this.pos);
    const frac = this.pos - i;
    const a = chunk[channel][i];
    const b = i + 1 < chunk[channel].length ? chunk[channel][i + 1] : (this.chunks[1] ? this.chunks[1][channel][0] : a);
    return a + (b - a) * frac;
  }

  advance(step) {
    this.pos += step;
    this.buffered -= step;
    while (this.chunks.length && this.pos >= this.chunks[0][0].length) {
      this.pos -= this.chunks[0][0].length;
      this.chunks.shift();
    }
    if (!this.chunks.length) {
      this.pos = 0;
      this.buffered = 0;
    }
  }

  skipTo(samples) {
    while (this.buffered > samples && this.chunks.length) {
      const left = this.chunks[0][0].length - this.pos;
      if (this.buffered - left < samples) {
        this.advance(this.buffered - samples);
        break;
      }
      this.advance(left);
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const left = out[0];
    const right = out[1] || out[0];
    const base = SOURCE_RATE / sampleRate;
    for (let n = 0; n < left.length; n += 1) {
      let l = 0;
      let r = 0;
      if (this.mode === 'buffering' && this.buffered >= this.target) {
        this.mode = 'playing';
        this.fadeIn = FADE;
        this.dry = CONCEAL; // a new voice fades in from silence
      }
      if (this.mode === 'playing' && this.buffered < 2) {
        this.mode = 'dry';
        this.dry = 0;
      }
      if (this.mode === 'playing') {
        if (this.buffered > this.target + OVERFLOW) {
          this.skipTo(this.target);
          this.fadeIn = FADE;
        }
        // Gently faster above target and slower below it (at most 7%), so lost packets and bursts even out.
        const rate = Math.min(1.07, Math.max(0.93, 1 + 0.15 * (this.buffered - this.target) / this.target));
        l = this.read(0);
        r = this.read(1);
        this.advance(base * rate);
        this.target = Math.max(TARGET_MIN, this.target - TARGET_DECAY);
        if (this.fadeIn > 0) {
          // Fading in: blend from the cover-up (or silence) into the voice.
          const g = 1 - this.fadeIn / FADE;
          const hide = this.dry < CONCEAL ? this.conceal() : [0, 0];
          l = l * g + hide[0] * (1 - g);
          r = r * g + hide[1] * (1 - g);
          this.dry += 1;
          this.fadeIn -= 1;
          if (!this.fadeIn) this.dry = CONCEAL;
        }
        this.history[0][this.historyAt] = l;
        this.history[1][this.historyAt] = r;
        this.historyAt = (this.historyAt + 1) % 480;
      } else if (this.mode === 'dry') {
        if (this.dry < CONCEAL) [l, r] = this.conceal();
        this.dry += 1;
        if (this.dry >= IDLE_AFTER) this.mode = 'idle';
      }
      left[n] = l;
      if (right !== left) right[n] = r;
    }
    return true;
  }

  /** Covers a gap: the last 10 ms played, repeated and fading out over CONCEAL samples. */
  conceal() {
    const at = (this.historyAt + (this.dry % 480)) % 480;
    const g = Math.max(0, 1 - this.dry / CONCEAL);
    return [this.history[0][at] * g, this.history[1][at] * g];
  }
}

registerProcessor('radio-capture', RadioCapture);
registerProcessor('radio-player', RadioPlayer);
registerProcessor('radio-limiter', RadioLimiter);
