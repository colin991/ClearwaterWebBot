import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class JsonStoreCorruptError extends Error {
  constructor(path, cause) {
    super(`Corrupt JSON store at ${path}`);
    this.name = 'JsonStoreCorruptError';
    this.code = 'JSON_STORE_CORRUPT';
    this.path = path;
    this.cause = cause;
  }
}

export async function readJsonFile(path, fallback, {
  missingFallback = true,
  // Internet store opts into strict corrupt handling; other stores keep the old fallback.
  corruptFallback = true,
} = {}) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      if (!missingFallback) throw error;
      return structuredClone(fallback);
    }
    if (error instanceof SyntaxError) {
      if (!corruptFallback) throw new JsonStoreCorruptError(path, error);
      return structuredClone(fallback);
    }
    throw error;
  }
}

async function rotateBackup(path) {
  try {
    await copyFile(`${path}.bak`, `${path}.bak.1`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  try {
    await copyFile(path, `${path}.bak`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export async function writeJsonFile(path, value, { backup = false } = {}) {
  await mkdir(dirname(path), { recursive: true });
  if (backup) await rotateBackup(path);
  const temporary = `${path}.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
