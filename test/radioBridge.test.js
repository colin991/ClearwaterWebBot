import test from 'node:test';
import assert from 'node:assert/strict';
import { radioBridgeSettings } from '../utils/radioBridge.js';

test('extra channel bridges need a bot token; Fire, DOT and Marine have default voice channels', () => {
  assert.deepEqual(radioBridgeSettings({}), []);
  assert.deepEqual(radioBridgeSettings({
    RADIO_FIRE_BOT_TOKEN: ' fire-token ',
    RADIO_DOT_BOT_TOKEN: 'dot-token',
    RADIO_DOT_CHANNEL_ID: '555555555555555555',
    RADIO_MARINE_CHANNEL_ID: '666666666666666666',
    RADIO_FREQ_BOT_TOKEN: 'freq-token',
  }), [
    { channel: 'fire', token: 'fire-token', channelId: '1514128961951760515' },
    { channel: 'dot', token: 'dot-token', channelId: '555555555555555555' },
  ], 'Marine has no token; Frequency Change is never bridged');
  assert.deepEqual(radioBridgeSettings({ RADIO_MARINE_BOT_TOKEN: 'm' }), [{ channel: 'marine', token: 'm', channelId: '1553601769819480084' }]);
});

test('Fire Springfield and Fairview bridge to their own voice channels with their own bots', () => {
  assert.deepEqual(radioBridgeSettings({
    RADIO_FIRE_SPRINGFIELD_BOT_TOKEN: 'spring',
    RADIO_FIRE_FAIRVIEW_BOT_TOKEN: 'fair',
  }), [
    { channel: 'fire-springfield', token: 'spring', channelId: '1560761079645208576' },
    { channel: 'fire-fairview', token: 'fair', channelId: '1560761113551962224' },
  ]);
});
