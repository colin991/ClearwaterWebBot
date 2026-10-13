import { spawn } from 'node:child_process';
import { chmodSync, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { logger } from './logger.js';

/**
 * Secure (wss://) address for the web radio on cwpcso.com/radio.
 * HTTPS pages cannot open the relay's plain ws:// address, so unless RADIO_WEB_URL names one,
 * the bot runs a free Cloudflare quick tunnel to its own port and reports that address.
 */
const TUNNEL_URL_PATTERN = /https:\/\/(?!api\.)[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/i;
const RESTART_MIN_MS = 10_000;
const RESTART_MAX_MS = 5 * 60_000;
const ARCH = { x64: 'amd64', arm64: 'arm64', arm: 'arm', ia32: '386' };

/** wss:// form of an https:// tunnel address, pointing at the relay path. */
export function tunnelWebSocketUrl(httpsUrl) {
  const match = TUNNEL_URL_PATTERN.exec(String(httpsUrl || ''));
  return match ? `${match[0].replace(/^https:/i, 'wss:')}/radio` : '';
}

export function cloudflaredDownloadUrl(platform = process.platform, arch = process.arch) {
  const cpu = ARCH[arch];
  if (platform !== 'linux' || !cpu) return '';
  return `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cpu}`;
}

async function ensureCloudflared(binary, fetchImpl = fetch) {
  if (existsSync(binary)) return binary;
  const url = cloudflaredDownloadUrl();
  if (!url) throw new Error(`no cloudflared build for ${process.platform}/${process.arch}`);
  mkdirSync(dirname(binary), { recursive: true });
  const partial = `${binary}.download`;
  const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`cloudflared download failed (${response.status})`);
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
    chmodSync(partial, 0o755);
    renameSync(partial, binary);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
  return binary;
}

/**
 * @param {{ port: number, env?: NodeJS.ProcessEnv, onUrl: (url: string) => void }} options
 * onUrl gets the wss:// relay address, or '' while the tunnel is down.
 * @returns {() => void} stop function
 */
export function startRadioTunnel({ port, env = process.env, onUrl }) {
  const fixed = env.RADIO_WEB_URL?.trim();
  if (fixed) {
    onUrl(fixed);
    return () => {};
  }
  if (/^(off|0|false|no)$/i.test(env.RADIO_WEB_TUNNEL?.trim() || '') || !port) return () => {};

  const binary = env.CLOUDFLARED_PATH?.trim() || join(process.cwd(), 'data', 'bin', 'cloudflared');
  let child = null;
  let stopped = false;
  let timer = null;
  let delay = RESTART_MIN_MS;

  const retry = () => {
    if (stopped) return;
    timer = setTimeout(run, delay);
    timer.unref?.();
    delay = Math.min(delay * 2, RESTART_MAX_MS);
  };

  async function run() {
    timer = null;
    try {
      await ensureCloudflared(binary);
    } catch (error) {
      logger.warn(`Radio web tunnel unavailable: ${error?.message || error}`);
      retry();
      return;
    }
    if (stopped) return;
    child = spawn(binary, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buffered = '';
    const read = (chunk) => {
      buffered = (buffered + chunk).slice(-4096);
      const url = tunnelWebSocketUrl(buffered);
      if (url) {
        buffered = '';
        delay = RESTART_MIN_MS;
        logger.info(`Radio web tunnel ready: ${url}`);
        onUrl(url);
      }
    };
    child.stdout.setEncoding('utf8').on('data', read);
    child.stderr.setEncoding('utf8').on('data', read);
    child.on('error', (error) => logger.warn(`Radio web tunnel failed to start: ${error?.message || error}`));
    child.on('exit', (code) => {
      child = null;
      onUrl('');
      if (!stopped) {
        logger.warn(`Radio web tunnel stopped (code ${code}); restarting.`);
        retry();
      }
    });
  }

  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    child?.kill();
  };
}
