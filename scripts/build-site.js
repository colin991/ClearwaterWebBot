import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';

const root = process.cwd();
const output = join(root, 'public');
const staticFiles = new Set([
  'index.html', 'internet.html', 'owner.html', 'signin.html', 'coming-soon.html',
  'privacy.html', 'terms.html', 'wallet.html', 'manifest.webmanifest',
  'jail.html', 'active-calls.html', 'impound.html', 'submit-tip.html',
  'inside-the-star.html', 'public-records.html', 'complaint.html', 'admin.html',
  'styles.css', 'internet.css', 'legal.css', 'signin.css', 'coming-soon.css',
  'script.js', 'internet.js', 'owner.js', 'signin.js', 'coming-soon.js', 'site-gate.js',
  'active-calls.js', 'admin.js',
]);

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile() || !staticFiles.has(entry.name)) continue;
  cpSync(join(root, entry.name), join(output, entry.name));
}

if (existsSync(join(root, 'assets'))) {
  cpSync(join(root, 'assets'), join(output, 'assets'), { recursive: true });
}

console.log(`Built ${basename(output)} static site output.`);
