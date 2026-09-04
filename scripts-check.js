import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ignored = new Set(['.git', 'node_modules']);

function collectJavaScript(directory) {
  return readdirSync(directory).flatMap((entry) => {
    if (ignored.has(entry)) return [];
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return collectJavaScript(path);
    return entry.endsWith('.js') ? [path] : [];
  });
}

const files = collectJavaScript(process.cwd());
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(result.stderr || `Syntax check failed: ${file}`);
  }
}

if (failed) process.exit(1);
console.log(`Checked ${files.length} JavaScript files successfully.`);
