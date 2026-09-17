import assert from 'node:assert/strict';
import test from 'node:test';
import editInfraction from '../commands/edit-infraction.js';
import infract from '../commands/infract.js';
import {
  PINELLAS_INFRACTION_ACCESS_ROLE_IDS,
  PINELLAS_INFRACTION_SUPERVISOR_ROLE_ID,
  memberHasPinellasInfractionAccess,
  requirePinellasInfractionAccess,
} from '../utils/pinellasServer.js';

test('PCSO supervisor role 1514851283817725962 can infract and edit infractions', () => {
  assert.equal(PINELLAS_INFRACTION_SUPERVISOR_ROLE_ID, '1514851283817725962');
  assert.equal(PINELLAS_INFRACTION_ACCESS_ROLE_IDS.includes(PINELLAS_INFRACTION_SUPERVISOR_ROLE_ID), true);

  const member = {
    roles: { cache: new Map([[PINELLAS_INFRACTION_SUPERVISOR_ROLE_ID, {}]]) },
  };
  assert.equal(memberHasPinellasInfractionAccess(member), true);
  assert.equal(requirePinellasInfractionAccess(member), true);
});

test('infraction access accepts raw role id arrays from interactions', () => {
  const member = { roles: [PINELLAS_INFRACTION_SUPERVISOR_ROLE_ID] };
  assert.equal(memberHasPinellasInfractionAccess(member), true);
  assert.equal(memberHasPinellasInfractionAccess({ roles: { cache: new Map() } }), false);
  assert.throws(
    () => requirePinellasInfractionAccess({ roles: { cache: new Map() } }),
    /supervisor\/command role/,
  );
});

test('/infract and /edit-infraction are visible without Manage Roles', () => {
  assert.equal(infract.data.toJSON().default_member_permissions, null);
  assert.equal(editInfraction.data.toJSON().default_member_permissions, null);
});
