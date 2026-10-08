import test from 'node:test';
import assert from 'node:assert/strict';
import { findPcsoChatbotReply, normalizePcsoChatbot } from '../utils/pcsoChatbot.js';

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
