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

// Limits the talk signal, streams it to the page while transmitting, and reports a level for the MIC lamp.
class RadioCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.active = false;
    this.peak = 0;
    this.blocks = 0;
    this.levelEvery = 8;
    this.limiter = new Limiter(options?.processorOptions?.ceiling ?? 0.5);
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if ('active' in data) this.active = Boolean(data.active);
      if (data.levelEvery) this.levelEvery = data.levelEvery;
    };
  }

  process(inputs, outputs) {
    const channel = inputs[0] && inputs[0][0];
    const out = outputs[0] && outputs[0][0];
    if (channel && out) {
      for (let i = 0; i < channel.length; i += 1) {
        const value = Math.abs(channel[i]);
        if (value > this.peak) this.peak = value;
      }
      this.limiter.run([channel], [out]);
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
