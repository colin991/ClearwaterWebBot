import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { PCSO_STATIC_PAGES, pcsoSectionHtml } from './pcso-static-pages.js';

const root = process.cwd();
const output = join(root, 'public');
const staticFiles = new Set([
  'index.html', 'signin.html', 'coming-soon.html',
  'privacy.html', 'terms.html',
  'jail.html', 'police-report.html', 'crime-stoppers.html',
  'inside-the-star.html', 'public-records.html', 'complaint.html', 'events.html',
  'news.html', 'admin.html', 'contact.html', 'careers.html', 'application-result.html', 'active-calls.html',
  'employee.html', 'employee-training.html', 'employee-department.html',
  'employee-reports.html', 'employee-command.html',
  'styles.css', 'legal.css', 'signin.css', 'coming-soon.css',
  'script.js', 'signin.js', 'coming-soon.js', 'site-gate.js',
  'jail.js', 'pcso-forms.js', 'inside-the-star.js', 'pcso-events.js', 'pcso-home.js', 'pcso-news-page.js', 'pcso-events-page.js', 'admin.js',
  'pcso-nav.js', 'pcso-portal.js', 'pcso-ride-along.js', 'pcso-careers.js', 'application-result.js', 'pcso-calls.js', 'pcso-employee.js',
  'pcso-resource-pages.js', 'pcso-dashboard.js',
  'radio-web.css', 'radio-web-shim.js',
]);

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile() || !staticFiles.has(entry.name)) continue;
  cpSync(join(root, entry.name), join(output, entry.name));
}

for (const page of PCSO_STATIC_PAGES) {
  writeFileSync(join(output, `${page.slug}.html`), pcsoSectionHtml(page));
}

buildWebRadio();

if (existsSync(join(root, 'assets'))) {
  cpSync(join(root, 'assets'), join(output, 'assets'), { recursive: true });
}

console.log(`Built ${basename(output)} static site output.`);

/**
 * The web radio (/radio) is the desktop radio's own screen and code, with radio-web-shim.js standing in
 * for the Electron bridge, so both always show the same thing.
 */
function buildWebRadio() {
  const renderer = join(root, 'radio-app', 'renderer');
  const version = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 10);
  const copies = {
    'radio.css': 'radio-app.css',
    'radio.js': 'radio-app.js',
    'panic-sound.js': 'radio-panic-sound.js',
    'capture-worklet.js': 'capture-worklet.js',
  };
  for (const [from, to] of Object.entries(copies)) cpSync(join(renderer, from), join(output, to));
  const v = (name) => `${name}?v=${version(join(output, name))}`;
  let html = readFileSync(join(renderer, 'index.html'), 'utf8');
  html = html
    .replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace('<title>Clearwater Radio</title>', [
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">',
      '<meta name="theme-color" content="#04121c">',
      '<meta name="apple-mobile-web-app-capable" content="yes">',
      '<title>Clearwater Radio</title>',
      '<link rel="icon" type="image/png" href="assets/clearwater-logo.png">',
      '<link rel="apple-touch-icon" href="assets/clearwater-logo.png">',
    ].join('\n  '))
    .replace('<link rel="stylesheet" href="radio.css">',
      `<link rel="stylesheet" href="${v('radio-app.css')}">\n  <link rel="stylesheet" href="${v('radio-web.css')}">`)
    .replace('<script src="panic-sound.js"></script>',
      `<script src="${v('radio-web-shim.js')}"></script>\n  <script src="${v('radio-panic-sound.js')}"></script>`)
    .replace('<script src="radio.js"></script>', `<script src="${v('radio-app.js')}"></script>`);
  for (const needed of ['radio-web-shim.js', 'radio-app.js', 'radio-web.css']) {
    if (!html.includes(needed)) throw new Error(`Web radio build: could not place ${needed} in radio.html`);
  }
  writeFileSync(join(output, 'radio.html'), html);
}
