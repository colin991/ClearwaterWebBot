/*
 * Opus for browsers without WebCodecs audio (Safari before iOS 26, in-app browsers).
 * Stands in for AudioEncoder, AudioDecoder, AudioData and EncodedAudioChunk with just what the
 * radio uses (48 kHz stereo Opus in 20 ms packets), backed by libopus compiled to WebAssembly
 * (radio-opus.wasm, from @evan/opus: MIT; libopus: BSD). Does nothing when WebCodecs is there.
 *
 * window.radioOpusReady resolves true once Opus works (native or this fallback), false if not.
 */
(() => {
  const hasNative = typeof window.AudioEncoder === 'function' && typeof window.AudioDecoder === 'function';
  if (hasNative) {
    window.radioOpusReady = Promise.resolve(true);
    return;
  }

  const SET_BITRATE = 4002;
  const SET_COMPLEXITY = 4010;
  const MAX_PACKET = 4000;
  const MAX_FRAMES = 5760; // 120 ms at 48 kHz

  let wasm = null;
  let heap = () => new Uint8Array(wasm.memory.buffer);

  async function load() {
    if (typeof WebAssembly !== 'object') return false;
    const response = await fetch('/radio-opus.wasm');
    if (!response.ok) return false;
    const bytes = await response.arrayBuffer();
    const noop = () => 0;
    const { instance } = await WebAssembly.instantiate(bytes, {
      wasi_snapshot_preview1: { fd_seek: noop, fd_write: noop, fd_close: noop, proc_exit: noop },
      env: { emscripten_notify_memory_growth: noop },
    });
    wasm = instance.exports;
    heap = () => new Uint8Array(wasm.memory.buffer);
    return true;
  }

  class EncodedAudioChunk {
    constructor({ type = 'key', timestamp = 0, data }) {
      this.type = type;
      this.timestamp = timestamp;
      const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      this.bytes = view.slice();
      this.byteLength = this.bytes.length;
    }

    copyTo(dest) {
      const target = dest instanceof ArrayBuffer ? new Uint8Array(dest) : new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength);
      target.set(this.bytes);
    }
  }

  /** Planar float audio only ('f32-planar'), which is all the radio makes or reads. */
  class AudioData {
    constructor({ sampleRate = 48000, numberOfFrames, numberOfChannels, timestamp = 0, data }) {
      this.format = 'f32-planar';
      this.sampleRate = sampleRate;
      this.numberOfFrames = numberOfFrames;
      this.numberOfChannels = numberOfChannels;
      this.timestamp = timestamp;
      this.planes = data instanceof Float32Array ? data.slice(0, numberOfFrames * numberOfChannels) : new Float32Array(data);
    }

    copyTo(dest, { planeIndex = 0 } = {}) {
      const start = planeIndex * this.numberOfFrames;
      dest.set(this.planes.subarray(start, start + this.numberOfFrames));
    }

    close() { this.planes = new Float32Array(0); }
  }

  function check(code) {
    if (code < 0) throw new Error(`opus error ${code}`);
    return code;
  }

  class AudioEncoder {
    static async isConfigSupported(config) {
      return { supported: Boolean(wasm) && config?.codec === 'opus', config };
    }

    constructor({ output, error }) {
      this.output = output;
      this.onError = error || (() => {});
      this.state = 'unconfigured';
      this.ptr = 0;
    }

    configure(config) {
      const channels = config.numberOfChannels || 2;
      this.channels = channels;
      this.ptr = wasm.malloc(wasm.opus_encoder_get_size(channels));
      check(wasm.opus_encoder_init(this.ptr, config.sampleRate || 48000, channels, 2049));
      if (config.bitrate) check(wasm.opus_encoder_ctl_set(this.ptr, SET_BITRATE, config.bitrate));
      if (Number.isFinite(config.opus?.complexity)) wasm.opus_encoder_ctl_set(this.ptr, SET_COMPLEXITY, config.opus.complexity);
      this.pcm = wasm.malloc(MAX_FRAMES * channels * 2);
      this.packet = wasm.malloc(MAX_PACKET);
      this.state = 'configured';
    }

    encode(frame) {
      if (this.state !== 'configured') return;
      try {
        const frames = frame.numberOfFrames;
        const channels = this.channels;
        const pcm = new Int16Array(wasm.memory.buffer, this.pcm, frames * channels);
        for (let c = 0; c < channels; c += 1) {
          const plane = frame.planes.subarray(Math.min(c, frame.numberOfChannels - 1) * frames, (Math.min(c, frame.numberOfChannels - 1) + 1) * frames);
          for (let i = 0; i < frames; i += 1) {
            const s = plane[i];
            pcm[i * channels + c] = s >= 1 ? 32767 : s <= -1 ? -32768 : Math.round(s * 32767);
          }
        }
        const length = check(wasm.opus_encode(this.ptr, this.pcm, frames, this.packet, MAX_PACKET));
        this.output(new EncodedAudioChunk({ type: 'key', timestamp: frame.timestamp, data: heap().subarray(this.packet, this.packet + length) }));
      } catch (error) {
        this.close();
        this.onError(error);
      }
    }

    close() {
      if (this.state === 'closed') return;
      this.state = 'closed';
      for (const ptr of [this.ptr, this.pcm, this.packet]) if (ptr) wasm.free(ptr);
      this.ptr = 0;
    }
  }

  class AudioDecoder {
    constructor({ output, error }) {
      this.output = output;
      this.onError = error || (() => {});
      this.state = 'unconfigured';
      this.ptr = 0;
    }

    configure(config) {
      const channels = config.numberOfChannels || 2;
      this.channels = channels;
      this.sampleRate = config.sampleRate || 48000;
      this.ptr = wasm.malloc(wasm.opus_decoder_get_size(channels));
      check(wasm.opus_decoder_init(this.ptr, this.sampleRate, channels));
      this.packet = wasm.malloc(MAX_PACKET);
      this.pcm = wasm.malloc(MAX_FRAMES * channels * 2);
      this.state = 'configured';
    }

    decode(chunk) {
      if (this.state !== 'configured') return;
      if (chunk.byteLength > MAX_PACKET) throw new Error('packet too large');
      heap().set(chunk.bytes, this.packet);
      let frames;
      try {
        frames = check(wasm.opus_decode(this.ptr, this.packet, chunk.byteLength, this.pcm, MAX_FRAMES, 0));
      } catch (error) {
        // One bad packet: like WebCodecs, the decoder stops and the radio makes a new one.
        this.close();
        this.onError(error);
        return;
      }
      const channels = this.channels;
      const pcm = new Int16Array(wasm.memory.buffer, this.pcm, frames * channels);
      const planes = new Float32Array(frames * channels);
      for (let c = 0; c < channels; c += 1) {
        for (let i = 0; i < frames; i += 1) planes[c * frames + i] = pcm[i * channels + c] / 32768;
      }
      const data = new AudioData({ sampleRate: this.sampleRate, numberOfFrames: frames, numberOfChannels: channels, timestamp: chunk.timestamp, data: planes });
      // WebCodecs hands decoded audio over asynchronously too.
      queueMicrotask(() => this.output(data));
    }

    close() {
      if (this.state === 'closed') return;
      this.state = 'closed';
      for (const ptr of [this.ptr, this.packet, this.pcm]) if (ptr) wasm.free(ptr);
      this.ptr = 0;
    }
  }

  window.radioOpusReady = load().then((ok) => {
    if (!ok) return false;
    Object.assign(window, { AudioEncoder, AudioDecoder, AudioData, EncodedAudioChunk });
    return true;
  }).catch(() => false);
})();
