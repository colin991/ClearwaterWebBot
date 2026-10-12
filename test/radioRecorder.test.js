import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRadioRecorder, encodeOggOpus, oggCrc, opusPacketSamples, RECORDING_KEEP_MS } from '../utils/radioRecorder.js';

// A 20 ms CELT packet (config 31, one frame) with some payload.
const packet = (fill = 1) => Buffer.from([0xf8, ...Array(40).fill(fill)]);

test('Opus packet length comes from its TOC byte', () => {
  assert.equal(opusPacketSamples(packet()), 960);
  assert.equal(opusPacketSamples(Buffer.from([0x18])), 2880, 'SILK 60 ms');
  assert.equal(opusPacketSamples(Buffer.from([0xf9])), 1920, 'code 1: two frames');
  assert.equal(opusPacketSamples(Buffer.from([0xfb, 0x03])), 2880, 'code 3: frame count in the next byte');
  assert.equal(opusPacketSamples(Buffer.alloc(0)), 0);
});

test('recordings are written as Ogg Opus pages with valid checksums', () => {
  const file = encodeOggOpus(Array.from({ length: 120 }, (_, i) => packet(i)));
  const pages = [];
  for (let offset = 0; offset < file.length;) {
    assert.equal(file.toString('ascii', offset, offset + 4), 'OggS');
    const segments = file[offset + 26];
    const size = 27 + segments + file.subarray(offset + 27, offset + 27 + segments).reduce((a, b) => a + b, 0);
    const page = Buffer.from(file.subarray(offset, offset + size));
    const crc = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    assert.equal(oggCrc(page), crc);
    pages.push({ flags: page[5], granule: Number(page.readBigInt64LE(6)), data: page.subarray(27 + segments) });
    offset += size;
  }
  assert.equal(pages[0].flags, 0x02, 'first page starts the stream');
  assert.equal(pages[0].data.toString('ascii', 0, 8), 'OpusHead');
  assert.equal(pages[1].data.toString('ascii', 0, 8), 'OpusTags');
  assert.equal(pages.at(-1).flags, 0x04, 'last page ends it');
  assert.equal(pages.at(-1).granule, 120 * 960);
});

test('the recorder keeps transmissions for 24 hours, skips PTT taps, and staff can read them back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'radio-rec-'));
  let clock = 1_000_000;
  try {
    const recorder = createRadioRecorder({ dir, now: () => clock });
    const tap = recorder.start({ userId: '1', name: 'Tap' });
    tap.push(packet());
    tap.end();
    const talk = recorder.start({ userId: '111111111111111111', name: 'Alice', channelName: 'Radio' });
    for (let i = 0; i < 50; i += 1) talk.push(packet());
    talk.end();
    talk.end();
    await recorder.flush();
    const list = await recorder.list();
    assert.equal(list.length, 1, 'a tap with nothing said is not kept');
    assert.deepEqual({ name: list[0].name, channel: list[0].channel, seconds: list[0].seconds, source: list[0].source }, { name: 'Alice', channel: 'Radio', seconds: 1, source: 'app' });
    const { audio } = await recorder.read(list[0].id);
    assert.equal(audio.toString('ascii', 0, 4), 'OggS');
    assert.equal(await recorder.read('nope'), null);

    clock += RECORDING_KEEP_MS + 1;
    assert.equal((await recorder.list()).length, 0);
    assert.equal(await recorder.read(list[0].id), null, 'older than 24 hours is gone');
    await recorder.prune();
    await recorder.flush();
    assert.deepEqual((await readdir(dir)).filter((file) => file.endsWith('.ogg')), [], 'and deleted from disk');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saved recordings are handed on for transcripts, and transcripts are kept with them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'radio-rec-'));
  try {
    const saved = [];
    const recorder = createRadioRecorder({ dir, onSaved: (entry, audio) => saved.push({ entry, audio }) });
    const talk = recorder.start({ userId: '1', name: 'Alice', channelName: 'Radio' });
    for (let i = 0; i < 50; i += 1) talk.push(packet());
    talk.end();
    await recorder.flush();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].audio.toString('ascii', 0, 4), 'OggS');
    assert.deepEqual((await recorder.untranscribed()).map((entry) => entry.id), [saved[0].entry.id]);

    await recorder.annotate(saved[0].entry.id, { transcript: 'oh shit', profanity: ['shit'] });
    const [entry] = await recorder.list();
    assert.equal(entry.transcript, 'oh shit');
    assert.deepEqual(entry.profanity, ['shit']);
    assert.deepEqual(await recorder.untranscribed(), []);

    // Transcripts survive a restart.
    const again = createRadioRecorder({ dir });
    assert.equal((await again.list())[0].transcript, 'oh shit');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
