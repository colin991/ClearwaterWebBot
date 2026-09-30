import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ERLC_MAPS_INDEX_URL,
  LIBERTY_MAP_PIXELS,
  erlcMapSeason,
  parseErlcMapListing,
  pickErlcMap,
  ensureOfficialErlcMapFile,
} from '../utils/erlcMaps.js';
import { libertyMapPoint, LIBERTY_WORLD } from '../utils/erlc.js';

const listing = {
  maps: [
    'https://api.erlc.gg/maps/fall_blank.png',
    'https://api.erlc.gg/maps/fall_postals.png',
    'https://api.erlc.gg/maps/snow_blank.png',
    'https://api.erlc.gg/maps/snow_postals.png',
    'https://api.erlc.gg/maps/spring_blank.png',
    'https://api.erlc.gg/maps/spring_postals.png',
    'https://api.erlc.gg/maps/summer_blank.png',
    'https://api.erlc.gg/maps/summer_postals.png',
  ],
};

test('parses the official ER:LC map index and prefers postal art', () => {
  const maps = parseErlcMapListing(listing);
  assert.equal(ERLC_MAPS_INDEX_URL, 'https://api.erlc.gg/maps');
  assert.equal(LIBERTY_MAP_PIXELS, 5355);
  assert.equal(maps.length, 8);
  assert.equal(pickErlcMap(maps, { season: 'fall', postals: true }).file, 'fall_postals.png');
  assert.equal(pickErlcMap(maps, { season: 'snow', postals: false }).file, 'snow_blank.png');
  assert.equal(pickErlcMap(maps, { season: 'winter', postals: true }).file, 'snow_postals.png');
});

test('map season follows the calendar', () => {
  assert.equal(erlcMapSeason(new Date('2026-01-15T00:00:00Z')), 'snow');
  assert.equal(erlcMapSeason(new Date('2026-04-01T00:00:00Z')), 'spring');
  assert.equal(erlcMapSeason(new Date('2026-07-01T00:00:00Z')), 'summer');
  assert.equal(erlcMapSeason(new Date('2026-09-28T00:00:00Z')), 'fall');
});

test('northwest-origin studs map onto the official map image', () => {
  assert.deepEqual(libertyMapPoint(0, 0), { left: 0, top: 0 });
  assert.equal(libertyMapPoint(LIBERTY_WORLD / 2, LIBERTY_WORLD / 2).left, 0.5);
  assert.equal(libertyMapPoint(1084, 2302).left, Number((1084 / LIBERTY_WORLD).toFixed(5)));
  const centre = libertyMapPoint(-420, 275);
  assert.ok(centre.left < 0.5);
  assert.ok(centre.top > 0.5);
});

test('ensureOfficialErlcMapFile uses the listed postal image and falls back', async () => {
  const tmp = `/tmp/erlc-map-test-${Date.now()}.png`;
  const fetchImpl = async (url) => {
    if (String(url).endsWith('/maps')) {
      return { ok: true, json: async () => listing };
    }
    return {
      ok: true,
      arrayBuffer: async () => Buffer.alloc(12_000, 7).buffer,
    };
  };
  const first = await ensureOfficialErlcMapFile({
    postals: true,
    season: 'fall',
    fetchImpl,
    fallbackPath: tmp,
    cacheDir: `/tmp/erlc-maps-${Date.now()}`,
  });
  assert.match(first, /fall_postals\.png$/);

  const fallback = await ensureOfficialErlcMapFile({
    postals: true,
    fetchImpl: async () => { throw new Error('offline'); },
    fallbackPath: '/tmp/bundled-liberty-map.png',
  });
  assert.equal(fallback, '/tmp/bundled-liberty-map.png');
});
