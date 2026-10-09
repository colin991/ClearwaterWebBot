import test from 'node:test';
import assert from 'node:assert/strict';
import { ThreadAutoArchiveDuration } from 'discord.js';
import { createInfractionProofThread } from '../utils/pinellasInfract.js';

test('PCSO infractions create a proof thread and ping the issuer', async () => {
  const sent = [];
  const thread = {
    id: '1550000000000000000',
    async send(payload) { sent.push(payload); },
  };
  let options;
  const message = {
    async startThread(value) { options = value; return thread; },
  };

  const result = await createInfractionProofThread(message, '1044686997194805280');

  assert.equal(result, thread);
  assert.equal(options.name, 'proof');
  assert.equal(options.autoArchiveDuration, ThreadAutoArchiveDuration.OneDay);
  assert.deepEqual(sent, [{
    content: '<@1044686997194805280> Please upload the proof for this infraction in this thread.',
    allowedMentions: { parse: [], users: ['1044686997194805280'] },
  }]);
});
