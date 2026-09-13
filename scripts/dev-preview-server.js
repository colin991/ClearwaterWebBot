import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import content from '../lib/pcso-api/content.js';
import me from '../api/auth/me.js';

const port = Number(process.env.PORT || 4177);
const root = join(process.cwd(), 'public');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
};

function wrap(res) {
  return {
    statusCode: 200,
    setHeader(key, value) {
      res.setHeader(key, value);
    },
    end(body) {
      res.statusCode = this.statusCode;
      res.end(body);
    },
  };
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/pcso/content') return content(req, wrap(res));
    if (url.pathname === '/api/auth/me') return me(req, wrap(res));

    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    if (path === '/news') path = '/news.html';
    if (path === '/events') path = '/events.html';
    if (path === '/admin') path = '/admin.html';

    const file = join(root, path);
    const data = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch (error) {
    res.statusCode = 404;
    res.end(String(error.message));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`preview ready on http://127.0.0.1:${port}`);
});
