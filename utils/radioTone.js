import { createReadStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prism from 'prism-media';

/** Played into Discord ahead of an app transmission on these channels only. */
export const RADIO_TRANSMIT_TONE_CHANNELS = new Set(['fire', 'fire-springfield', 'fire-fairview', 'dot']);
export const RADIO_TRANSMIT_TONE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'radio-transmit-tone.ogg');

/**
 * The Opus packets of an Ogg Opus file, ready to push into a Discord transmit stream.
 * @returns {Promise<Buffer[]>}
 */
export function loadOggOpusPackets(path = RADIO_TRANSMIT_TONE_PATH) {
  return new Promise((resolve, reject) => {
    const packets = [];
    createReadStream(path)
      .on('error', reject)
      .pipe(new prism.opus.OggDemuxer())
      .on('data', (packet) => packets.push(packet))
      .on('error', reject)
      .on('end', () => resolve(packets));
  });
}
