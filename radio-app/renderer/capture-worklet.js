/* global AudioWorkletProcessor, registerProcessor */

// Streams filtered mic samples to the page while transmitting, plus a level for the MIC lamp.
class RadioCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.peak = 0;
    this.blocks = 0;
    this.port.onmessage = (event) => {
      this.active = Boolean(event.data && event.data.active);
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i += 1) {
        const value = Math.abs(channel[i]);
        if (value > this.peak) this.peak = value;
      }
      if (this.active) this.port.postMessage({ samples: channel.slice(0) });
    }
    this.blocks += 1;
    if (this.blocks >= 8) {
      this.port.postMessage({ level: this.peak });
      this.peak = 0;
      this.blocks = 0;
    }
    return true;
  }
}

registerProcessor('radio-capture', RadioCapture);
