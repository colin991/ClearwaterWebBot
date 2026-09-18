import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PINELLAS_APPLY_QUESTIONS, validatePinellasApplyAnswer } from '../utils/pinellasApply.js';
import { PCSO_STATIC_PAGES, pcsoSectionHtml } from '../scripts/pcso-static-pages.js';

test('careers application questions stay in Discord order', () => {
  assert.equal(PINELLAS_APPLY_QUESTIONS.length, 12);
  const first = validatePinellasApplyAnswer(PINELLAS_APPLY_QUESTIONS[0], 'ClearwaterUser');
  assert.equal(first.ok, true);
  const writing = validatePinellasApplyAnswer(PINELLAS_APPLY_QUESTIONS[2], 'Too short');
  assert.equal(writing.ok, false);
});

test('department pages include sheriff, divisions, and FTO', () => {
  const slugs = PCSO_STATIC_PAGES.map((page) => page.slug);
  for (const slug of ['sheriff', 'missions-values', 'public-notices', 'patrol-operations', 'ride-along', 'patrol-staff', 'public-information', 'special-response', 'traffic-enforcement', 'criminal-investigations', 'detention', 'field-training']) {
    assert.ok(slugs.includes(slug), slug);
  }
  const html = pcsoSectionHtml(PCSO_STATIC_PAGES[0]);
  assert.match(html, /Sheriff Noah Richards/);
  assert.match(html, /pcso-nav.js/);
});

test('shared nav lists Home, About, Law Enforcement, Divisions, Contact, and boxed Careers', () => {
  const nav = readFileSync(new URL('../pcso-nav.js', import.meta.url), 'utf8');
  assert.match(nav, />Home</);
  assert.match(nav, />About</);
  assert.match(nav, />Law Enforcement</);
  assert.match(nav, />Divisions</);
  assert.match(nav, />Contact</);
  assert.match(nav, /href="\/employee"/);
  assert.match(nav, />Employee</);
  assert.match(nav, /pcso-careers-btn/);
  assert.match(nav, />Careers</);
  assert.match(nav, /\/active-calls/);
  assert.doesNotMatch(nav, /\/patrol-staff/);
  assert.match(nav, /mouseenter/);
  assert.match(nav, /pcso-drop-menu a/);
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.pcso-drop-toggle::after/);
  assert.match(css, /\.pcso-drop-menu::before/);
  assert.match(css, /pointer-events: auto/);
});
