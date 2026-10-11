import test from 'node:test';
import assert from 'node:assert/strict';
import { radioBridgeSettings } from '../utils/radioBridge.js';

test('extra channel bridges need a bot token; Fire and DOT have default voice channels', () => {
  assert.deepEqual(radioBridgeSettings({}), []);
  assert.deepEqual(radioBridgeSettings({
    RADIO_FIRE_BOT_TOKEN: ' fire-token ',
    RADIO_DOT_BOT_TOKEN: 'dot-token',
    RADIO_DOT_CHANNEL_ID: '555555555555555555',
    RADIO_FREQ_BOT_TOKEN: 'freq-token',
    RADIO_SRT_CHANNEL_ID: '666666666666666666',
  }), [
    { channel: 'fire', token: 'fire-token', channelId: '1514128961951760515' },
    { channel: 'dot', token: 'dot-token', channelId: '555555555555555555' },
  ], 'Freq has a token but no channel id, SRT has a channel id but no token');
});
