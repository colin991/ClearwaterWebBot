import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PCSO_CHATBOT, findPcsoChatbotReply, matchPcsoChatbotReply, normalizePcsoChatbot } from '../utils/pcsoChatbot.js';

test('default chatbot answers basic greetings and website questions', () => {
  assert.match(findPcsoChatbotReply('hello', DEFAULT_PCSO_CHATBOT), /Hello!/);
  assert.match(findPcsoChatbotReply('How do I apply?', DEFAULT_PCSO_CHATBOT), /\/careers/);
  assert.match(findPcsoChatbotReply('Where can I request public records?', DEFAULT_PCSO_CHATBOT), /\/public-records/);
});

test('older empty configurations receive the starter answers once', () => {
  const migrated = normalizePcsoChatbot({ rules: [] });
  assert.ok(migrated.rules.length >= 10);
  assert.equal(matchPcsoChatbotReply('hi', migrated).matched, true);
  assert.equal(normalizePcsoChatbot({ ...migrated, rules: [] }).rules.length, 0);
});

test('unknown questions are identified for the support ticket action', () => {
  assert.deepEqual(matchPcsoChatbotReply('an unusual question', DEFAULT_PCSO_CHATBOT), {
    reply: DEFAULT_PCSO_CHATBOT.fallback,
    matched: false,
  });
});

test('chatbot matches phrases without punctuation or capitalization', () => {
  const config = normalizePcsoChatbot({
    rules: [{ triggers: ['how do I apply'], response: 'Visit the Careers page.' }],
  });
  assert.equal(findPcsoChatbotReply('Hi, HOW DO I APPLY?', config), 'Visit the Careers page.');
});

test('chatbot prefers the most specific matching phrase', () => {
  const config = normalizePcsoChatbot({
    rules: [
      { triggers: ['records'], response: 'General records answer.' },
      { triggers: ['public records request'], response: 'Open Public Records.' },
    ],
  });
  assert.equal(findPcsoChatbotReply('Where is the public records request?', config), 'Open Public Records.');
});

test('chatbot ignores disabled rules and uses the configured fallback', () => {
  const config = normalizePcsoChatbot({
    fallback: 'Please contact PCSO.',
    rules: [{ triggers: ['secret'], response: 'Hidden answer.', enabled: false }],
  });
  assert.equal(findPcsoChatbotReply('secret', config), 'Please contact PCSO.');
});
