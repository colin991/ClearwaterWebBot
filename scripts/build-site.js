import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PCSO_STATIC_PAGES, pcsoSectionHtml } from './pcso-static-pages.js';

const root = process.cwd();
const output = join(root, 'public');
const staticFiles = new Set([
  'index.html', 'signin.html', 'coming-soon.html',
  'privacy.html', 'terms.html',
  'jail.html', 'police-report.html', 'crime-stoppers.html',
  'inside-the-star.html', 'public-records.html', 'complaint.html', 'events.html',
  'news.html', 'admin.html', 'contact.html', 'careers.html', 'active-calls.html',
  'styles.css', 'legal.css', 'signin.css', 'coming-soon.css',
  'script.js', 'signin.js', 'coming-soon.js', 'site-gate.js',
  'jail.js', 'pcso-forms.js', 'inside-the-star.js', 'pcso-events.js', 'admin.js',
  'pcso-nav.js', 'pcso-portal.js', 'pcso-careers.js', 'pcso-calls.js',
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

if (existsSync(join(root, 'assets'))) {
  cpSync(join(root, 'assets'), join(output, 'assets'), { recursive: true });
}

console.log(`Built ${basename(output)} static site output.`);
