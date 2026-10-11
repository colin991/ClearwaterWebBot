import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import {
  RADIO_DOWNLOAD_CHANNEL_ID,
  RADIO_UPDATE_LOG_BUTTON_ID,
  buildRadioDownloadPanel,
  panelSignature,
  radioUpdateLogText,
} from '../utils/radioDownloadPanel.js';

test('radio download panel is a Components V2 container with the banner, text and three buttons', () => {
  assert.equal(RADIO_DOWNLOAD_CHANNEL_ID, '1558963608929435723');
  const panel = buildRadioDownloadPanel({ banner: true });
  assert.equal(panel.flags, MessageFlags.IsComponentsV2);
  const [container] = panel.components.map((component) => component.toJSON());
  assert.equal(container.type, 17);
  assert.deepEqual(container.components.map((component) => component.type), [12, 10, 1]);
  assert.equal(container.components[0].items[0].media.url, 'attachment://clearwater-radio-banner.png');
  assert.match(container.components[1].content, /^# <:CRP:1514421531844022352> Clearwater Radio/);
  assert.ok(container.components[1].content.length < 4000);
  const buttons = container.components[2].components;
  assert.deepEqual(buttons.map((button) => button.label), ['Download Radio', 'Radio Website', 'Update Log']);
  assert.equal(buttons[0].custom_id, undefined, 'link buttons carry no custom id');
  assert.equal(buttons[0].url, 'https://www.cwpcso.com/radio/download');
  assert.equal(buttons[2].custom_id, RADIO_UPDATE_LOG_BUTTON_ID);
  assert.equal(panelSignature(buildRadioDownloadPanel().components), panelSignature(panel.components), 'the banner does not change the signature');
});

test('update log lists the newest radio updates only', () => {
  const text = radioUpdateLogText([
    { id: 'a', title: 'Radio: old', summary: 'Old.', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', title: 'Website tweak', summary: 'Not radio.', createdAt: '2026-05-01T00:00:00.000Z' },
    { id: 'radio-new', title: 'Radio: new', summary: 'New.', createdAt: '2026-06-01T00:00:00.000Z' },
  ]);
  assert.ok(text.indexOf('**New**') < text.indexOf('**Old**'));
  assert.doesNotMatch(text, /Website tweak/);
  const long = Array.from({ length: 10 }, (_, i) => ({ id: `radio-${i}`, title: `Radio ${i}`, summary: 'x'.repeat(1500), createdAt: `2026-0${i % 9 + 1}-01T00:00:00.000Z` }));
  assert.ok(radioUpdateLogText(long).length <= 3900);
});
