import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInternetAccount,
  hasInternetAccount,
  upsertInternetUser,
  updateInternetProfile,
} from '../utils/internetStore.js';
import { buildInternetPanelPayload } from '../utils/discordInternetPanel.js';

function emptyStore() {
  return { users: {}, posts: [], reports: [], logs: [] };
}

test('Create Account stores a unique handle and profile', () => {
  const store = emptyStore();
  const profile = createInternetAccount(store, {
    actor: { id: '123456789012345678', username: 'discordname', displayName: 'Discord Name' },
    displayName: 'Iceberg',
    username: 'Iceberg2310',
    bio: 'Cxrsed is so tuff',
  });
  assert.equal(profile.displayName, 'Iceberg');
  assert.equal(profile.username, 'Iceberg2310');
  assert.equal(profile.bio, 'Cxrsed is so tuff');
  assert.equal(hasInternetAccount(store, '123456789012345678'), true);
  upsertInternetUser(store, {
    id: '123456789012345678',
    username: 'discordname',
    displayName: 'Discord Name',
  });
  assert.equal(store.users['123456789012345678'].username, 'Iceberg2310');
  assert.equal(store.users['123456789012345678'].displayName, 'Iceberg');
});

test('Create Account rejects a taken username', () => {
  const store = emptyStore();
  createInternetAccount(store, {
    actor: { id: '123456789012345678', username: 'one' },
    displayName: 'One',
    username: 'Iceberg2310',
  });
  assert.throws(
    () => createInternetAccount(store, {
      actor: { id: '223456789012345678', username: 'two' },
      displayName: 'Two',
      username: 'iceberg2310',
    }),
    /already taken/,
  );
});

test('Profile edits can change display name and username', () => {
  const store = emptyStore();
  createInternetAccount(store, {
    actor: { id: '123456789012345678', username: 'one' },
    displayName: 'Iceberg',
    username: 'Iceberg2310',
  });
  const next = updateInternetProfile(store, {
    actor: { id: '123456789012345678' },
    profile: { displayName: 'Berg', username: 'Berg2310', bio: 'hello' },
  });
  assert.equal(next.displayName, 'Berg');
  assert.equal(next.username, 'Berg2310');
  assert.equal(next.bio, 'hello');
});

test('Internet Panel includes Create Account and Profile', () => {
  const json = JSON.stringify(buildInternetPanelPayload({ includeBanners: false }));
  assert.match(json, /Create Account/);
  assert.match(json, /cw-internet-create-account/);
  assert.match(json, /cw-internet-my-profile/);
  assert.match(json, /Send Post/);
});
