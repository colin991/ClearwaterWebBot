import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { logger } from './logger.js';

/**
 * Recorded radio transmissions for staff review: each one is saved as an Ogg Opus file (plays in
 * any browser) and kept for 24 hours. Only the radio staff panel can list or play them.
 */
export const RECORDING_KEEP_MS = 24 * 60 * 60 * 1000;
/** Shorter than this (in 20 ms packets) is a PTT tap with nothing said. */
const MIN_PACKETS = 10;
const MAX_PACKETS = 3_500; // a little over a minute; the relay cuts stuck mics at 60 s
const MAX_RECORDINGS = 3_000;
const PACKETS_PER_PAGE = 50;

/* ---------- Ogg Opus ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let r = i << 24;
    for (let j = 0; j < 8; j += 1) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    table[i] = r >>> 0;
  }
  return table;
})();

/** Ogg's CRC-32 (polynomial 0x04c11db7, not reflected, starting at 0). */
export function oggCrc(buffer) {
  let crc = 0;
  for (const byte of buffer) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
  return crc >>> 0;
}

/** How many 48 kHz samples one Opus packet holds, from its TOC byte. */
export function opusPacketSamples(packet) {
  if (!packet?.length) return 0;
  const toc = packet[0];
  const config = toc >> 3;
  let frame;
  if (config < 12) frame = [480, 960, 1920, 2880][config % 4];
  else if (config < 16) frame = [480, 960][config % 2];
  else frame = [120, 240, 480, 960][config % 4];
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] || 0) & 0x3f : 2;
  return frame * frames;
}

function oggPage({ data, segments, granule, serial, sequence, flags }) {
  const header = Buffer.alloc(27 + segments.length);
  header.write('OggS', 0, 'ascii');
  header[4] = 0;
  header[5] = flags;
  header.writeBigInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header.writeUInt32LE(0, 22);
  header[26] = segments.length;
  Buffer.from(segments).copy(header, 27);
  const page = Buffer.concat([header, data]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

const lacing = (length) => [...Array(Math.floor(length / 255)).fill(255), length % 255];

/** Opus packets (20 ms each from the radios) to a playable .ogg file. */
export function encodeOggOpus(packets, { channels = 1, serial = 0x43575231 } = {}) {
  const pages = [];
  let sequence = 0;
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'ascii');
  head[8] = 1;
  head[9] = channels;
  head.writeUInt16LE(0, 10); // pre-skip
  head.writeUInt32LE(48000, 12);
  head.writeInt16LE(0, 16);
  head[18] = 0;
  pages.push(oggPage({ data: head, segments: lacing(head.length), granule: 0, serial, sequence: sequence++, flags: 0x02 }));
  const vendor = Buffer.from('Clearwater Radio', 'utf8');
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write('OpusTags', 0, 'ascii');
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length);
  pages.push(oggPage({ data: tags, segments: lacing(tags.length), granule: 0, serial, sequence: sequence++, flags: 0 }));
  let granule = 0;
  for (let start = 0; start < packets.length; start += PACKETS_PER_PAGE) {
    const chunk = packets.slice(start, start + PACKETS_PER_PAGE);
    const segments = chunk.flatMap((packet) => lacing(packet.length));
    granule += chunk.reduce((total, packet) => total + opusPacketSamples(packet), 0);
    const last = start + PACKETS_PER_PAGE >= packets.length;
    pages.push(oggPage({ data: Buffer.concat(chunk), segments, granule, serial, sequence: sequence++, flags: last ? 0x04 : 0 }));
  }
  return Buffer.concat(pages);
}

/* ---------- recorder ---------- */

/**
 * start(meta) begins a recording ({ userId, name, channel, channelName, source, to }) and returns
 * { push(packet), end() }. Finished recordings are written to `dir` with an index.
 */
export function createRadioRecorder({ dir, now = Date.now, keepMs = RECORDING_KEEP_MS }) {
  const indexPath = join(dir, 'index.json');
  let index = [];
  const ready = (async () => {
    await mkdir(dir, { recursive: true });
    try {
      const saved = JSON.parse(await readFile(indexPath, 'utf8'));
      if (Array.isArray(saved)) index = saved;
    } catch { /* first run */ }
  })().catch((error) => logger.warn(`Radio recordings folder failed: ${error?.message || error}`));
  let writing = Promise.resolve();
  const queue = (task) => {
    writing = writing.then(task, task).catch((error) => logger.warn(`Radio recording save failed: ${error?.message || error}`));
    return writing;
  };

  async function saveIndex() {
    await writeFile(indexPath, JSON.stringify(index));
  }

  async function prune() {
    await ready;
    const cutoff = now() - keepMs;
    const keep = index.filter((entry) => entry.at >= cutoff).slice(-MAX_RECORDINGS);
    const keepIds = new Set(keep.map((entry) => entry.id));
    const gone = index.filter((entry) => !keepIds.has(entry.id));
    index = keep;
    for (const entry of gone) await rm(join(dir, `${entry.id}.ogg`), { force: true });
    // Files the index lost track of (a crash mid-save) go too.
    for (const file of await readdir(dir).catch(() => [])) {
      const id = file.replace(/\.ogg$/, '');
      if (file.endsWith('.ogg') && !keepIds.has(id)) await rm(join(dir, file), { force: true });
    }
    if (gone.length) await saveIndex();
  }

  return {
    start(meta) {
      const packets = [];
      const startedAt = now();
      let done = false;
      return {
        push(packet) {
          if (!done && packets.length < MAX_PACKETS && packet?.length) packets.push(Buffer.from(packet));
        },
        end() {
          if (done) return;
          done = true;
          if (packets.length < MIN_PACKETS) return;
          const id = `${startedAt.toString(36)}-${randomBytes(4).toString('hex')}`;
          const entry = {
            id,
            at: startedAt,
            seconds: Math.round(packets.reduce((total, packet) => total + opusPacketSamples(packet), 0) / 4800) / 10,
            userId: String(meta?.userId || ''),
            name: String(meta?.name || 'Unknown').slice(0, 60),
            channel: String(meta?.channelName || meta?.channel || 'Radio').slice(0, 40),
            source: meta?.source === 'discord' ? 'discord' : 'app',
            to: meta?.to ? String(meta.to).slice(0, 60) : '',
          };
          const file = encodeOggOpus(packets, { channels: entry.source === 'discord' ? 2 : 1 });
          void queue(async () => {
            await ready;
            await writeFile(join(dir, `${id}.ogg`), file);
            index.push(entry);
            await saveIndex();
          });
        },
      };
    },
    /** Recordings from the last 24 hours, newest first. */
    async list() {
      await ready;
      const cutoff = now() - keepMs;
      return index.filter((entry) => entry.at >= cutoff).slice().reverse();
    },
    /** One recording's .ogg file, or null. */
    async read(id) {
      await ready;
      const entry = index.find((item) => item.id === String(id || ''));
      if (!entry || entry.at < now() - keepMs) return null;
      return { entry, audio: await readFile(join(dir, `${entry.id}.ogg`)).catch(() => null) };
    },
    prune: () => queue(prune),
    flush: () => writing,
    /** For tests: waits for the folder to be ready. */
    get ready() { return ready; },
  };
}
