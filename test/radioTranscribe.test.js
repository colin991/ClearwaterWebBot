import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadioTranscriber, findProfanity, maskWord, transcribeAudio } from '../utils/radioTranscribe.js';

test('profanity is found by word start, once each, and harmless words pass', () => {
  assert.deepEqual(findProfanity('Copy that, 10-4, en route to postal 204.'), []);
  assert.deepEqual(findProfanity('What the FUCK, fucking hell, fuck'), ['fuck', 'fucking']);
  assert.deepEqual(findProfanity('Shit, he is an asshole'), ['shit', 'asshole']);
  assert.deepEqual(findProfanity('cocktail at Dickens with spicy food, a prickly cactus, coonhound, fire retardant, assist'), []);
  assert.deepEqual(findProfanity('you dick, kick his ass'), ['dick', 'ass']);
  assert.deepEqual(findProfanity('He said f*** off'), ['f***'], 'words the model censored itself still count');
  assert.deepEqual(findProfanity('plain words only'), []);
  assert.deepEqual(findProfanity('that is bogus', { extraWords: ['bogus'] }), ['bogus']);
});

test('masked words keep the first and last letter', () => {
  assert.equal(maskWord('fucking'), 'f*****g');
  assert.equal(maskWord('ass'), 'a*s');
  assert.equal(maskWord('ab'), 'a*');
});

test('transcribeAudio sends the Ogg file to OpenAI and returns the text', async () => {
  let seen = null;
  const fetchImpl = async (url, options) => {
    seen = { url, options };
    return new Response(JSON.stringify({ text: ' 10-4, show me en route. ' }), { status: 200 });
  };
  const text = await transcribeAudio(Buffer.from('OggS...'), { apiKey: 'sk-test', fetchImpl });
  assert.equal(text, '10-4, show me en route.');
  assert.equal(seen.url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(seen.options.headers.Authorization, 'Bearer sk-test');
  assert.equal(seen.options.body.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal(seen.options.body.get('file').type, 'audio/ogg');

  const failing = async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 });
  await assert.rejects(transcribeAudio(Buffer.from('x'), { apiKey: 'k', fetchImpl: failing }), /401.*bad key/);
});

test('the transcriber queues recordings one at a time and reports profanity', async () => {
  const results = [];
  let active = 0;
  let most = 0;
  const transcriber = createRadioTranscriber({
    apiKey: 'sk-test',
    async transcribe(audio) {
      active += 1;
      most = Math.max(most, active);
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      active -= 1;
      return audio.toString();
    },
    onResult: (entry, result) => { results.push({ id: entry.id, ...result }); },
  });
  assert.equal(transcriber.configured, true);
  assert.equal(transcriber.add({ id: 'a', seconds: 2 }, Buffer.from('copy that')), true);
  assert.equal(transcriber.add({ id: 'b', seconds: 3 }, Buffer.from('oh shit')), true);
  assert.equal(transcriber.add({ id: 'c', seconds: 0.2 }, Buffer.from('click')), false, 'too short to transcribe');
  await transcriber.flush();
  assert.equal(most, 1);
  assert.deepEqual(results, [
    { id: 'a', transcript: 'copy that', profanity: [] },
    { id: 'b', transcript: 'oh shit', profanity: ['shit'] },
  ]);

  const off = createRadioTranscriber({ apiKey: '' });
  assert.equal(off.configured, false);
  assert.equal(off.add({ id: 'x', seconds: 5 }, Buffer.from('hello')), false);
});
