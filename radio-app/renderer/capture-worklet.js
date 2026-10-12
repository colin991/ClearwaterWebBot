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

registerProcessor('radio-capture', RadioCapture);
registerProcessor('radio-limiter', RadioLimiter);
