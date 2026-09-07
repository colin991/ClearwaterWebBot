import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { memberCanReviewPinellasApplications } from '../utils/pinellasApply.js';
import { PINELLAS_EMPLOYEE_WELCOME_ROLE_ID } from '../utils/pinellasServer.js';

test('designated PCSO role can review without Manage Roles', () => {
  const member = {
    roles: { cache: new Map([[PINELLAS_EMPLOYEE_WELCOME_ROLE_ID, {}]]) },
  };
  const permissions = new PermissionsBitField(0n);
  assert.equal(memberCanReviewPinellasApplications(member, permissions), true);
});

test('raw interaction role arrays are also accepted', () => {
  const member = { roles: [PINELLAS_EMPLOYEE_WELCOME_ROLE_ID] };
  assert.equal(memberCanReviewPinellasApplications(member, new PermissionsBitField(0n)), true);
});

test('existing Administrator and Manage Roles access remains', () => {
  const member = { roles: { cache: new Map() } };
  assert.equal(memberCanReviewPinellasApplications(
    member,
    new PermissionsBitField(PermissionFlagsBits.Administrator),
  ), true);
  assert.equal(memberCanReviewPinellasApplications(
    member,
    new PermissionsBitField(PermissionFlagsBits.ManageRoles),
  ), true);
  assert.equal(memberCanReviewPinellasApplications(member, new PermissionsBitField(0n)), false);
});
