import assert from 'node:assert/strict';
import test from 'node:test';
import { PINELLAS_INFRACTION_CHANNEL_ID } from '../utils/pinellasInfract.js';

test('permanent infraction records use the configured PCSO channel', () => {
  assert.equal(PINELLAS_INFRACTION_CHANNEL_ID, '1514666061033902230');
});
