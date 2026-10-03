import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSiteUrl } from '../utils/pcsoSiteForms.js';

test('PCSO links point at cwpcso.com, not the Clearwater site', () => {
  const saved = { pcso: process.env.PCSO_SITE_URL, pub: process.env.PUBLIC_SITE_URL };
  try {
    delete process.env.PCSO_SITE_URL;
    process.env.PUBLIC_SITE_URL = 'https://cwrpvc.lol';
    assert.equal(`${publicSiteUrl()}/careers`, 'https://www.cwpcso.com/careers');
  } finally {
    if (saved.pcso === undefined) delete process.env.PCSO_SITE_URL; else process.env.PCSO_SITE_URL = saved.pcso;
    if (saved.pub === undefined) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL = saved.pub;
  }
});
