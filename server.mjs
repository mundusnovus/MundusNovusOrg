// christiansystems.org: serves the site (site/) and Christian Systems Social (/social, API under /social/api).
// No dependencies beyond Node 24.
//   PORT, DATA_DIR (where Social keeps its index), PDS_URL, PDS_ADMIN_PASSWORD, PDS_HANDLE_DOMAIN, SESSION_SECRET, ADMIN_NAMES
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { createSocial } from './social/app.mjs';
import { previewPds, remotePds } from './social/pds.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8', '.dmg': 'application/x-apple-diskimage', '.zip': 'application/zip', '.deb': 'application/vnd.debian.binary-package',
  '.gz': 'application/gzip', '.icns': 'image/icns' };
const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=()', 'x-frame-options': 'SAMEORIGIN' };

export function makeServer(env = process.env) {
  const dataDir = env.DATA_DIR || join(ROOT, '..', '.data');
  mkdirSync(dataDir, { recursive: true });
  const pds = env.PDS_URL ? remotePds({ url: env.PDS_URL, adminPassword: env.PDS_ADMIN_PASSWORD }) : previewPds();
  if (!env.PDS_URL) console.log('Social is in preview: accounts live in memory until PDS_URL is set.');
  if (env.PDS_URL && !env.SESSION_SECRET) throw new Error('Set SESSION_SECRET: it protects the PDS sessions Social keeps.');
  const social = createSocial({ dbPath: env.PDS_URL ? join(dataDir, 'social.sqlite') : ':memory:', pds, handleDomain: env.PDS_HANDLE_DOMAIN || 'pds.christiansystems.org',
    secret: env.SESSION_SECRET, admins: (env.ADMIN_NAMES || '').split(',').map((s) => s.trim()).filter(Boolean) });

  function file(req, res, path) {
    let rel = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
    let p = join(ROOT, rel);
    if (!p.startsWith(ROOT)) return false;
    if (existsSync(p) && statSync(p).isDirectory()) {
      if (!path.endsWith('/')) { res.writeHead(301, { location: path + '/' }); res.end(); return true; }
      p = join(p, 'index.html');
    }
    if (!existsSync(p)) return false;
    const st = statSync(p), type = TYPES[extname(p)] || 'application/octet-stream';
    const etag = '"' + st.size.toString(36) + '-' + st.mtimeMs.toString(36) + '"';
    const immutable = /\/media\/|\/downloads\/files\//.test(path);
    const headers = { ...SECURITY, 'content-type': type, etag, 'cache-control': immutable ? 'public, max-age=604800' : /html|css|javascript|json|manifest/.test(type) ? 'no-cache' : 'public, max-age=86400' };
    if (/\/downloads\/files\/.+\.(dmg|zip|deb|gz)$/.test(path)) headers['content-disposition'] = 'attachment';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
    const gzip = /text|json|svg|javascript|manifest/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '');
    if (gzip) headers['content-encoding'] = 'gzip'; else headers['content-length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end(), true;
    const s = createReadStream(p); (gzip ? s.pipe(createGzip()) : s).pipe(res);
    return true;
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local'), secure = req.headers['x-forwarded-proto'] === 'https';
      if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
      if (await social.serve(req, res, secure)) return;
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      if (file(req, res, url.pathname)) return;
      if (url.pathname.startsWith('/social/') && file(req, res, '/social/index.html')) return; // the app routes /social/@name, /social/post/1 ...
      res.writeHead(404, { ...SECURITY, 'content-type': 'text/html; charset=utf-8' });
      createReadStream(join(ROOT, '404.html')).on('error', () => res.end('Not found')).pipe(res);
    } catch (e) { console.error(e); if (!res.headersSent) res.writeHead(500); res.end(); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  makeServer().listen(port, () => console.log('christiansystems.org on :' + port));
}
