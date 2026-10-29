// Christian Systems on the web, one server for every address. It looks at the host name:
//   christiansystems.org     the main site (site/), with /downloads for everything
//   www.…                    sends people to christiansystems.org
//   sprite.… and box.…       each app's home page (site/hosts/<app>/), the live editor at /app/, and its downloads
//   social.…                 Christian Systems Social (site/social/), its API at /api/
// Brand files, music and downloads (/brand/, /media/, /downloads/files/, /css/, /js/) are shared by every address.
// No dependencies beyond Node 24. Settings:
//   PORT, DATA_DIR (where Social keeps its index), PDS_URL (how this server reaches the PDS), PDS_PUBLIC_URL (how
//   browsers reach it, for pictures), PDS_ADMIN_PASSWORD, PDS_HANDLE_DOMAIN, SESSION_SECRET, ADMIN_NAMES, and
//   COOKIE_DOMAIN (christiansystems.org), so one sign-in counts on every address: one Christian Systems account.
//   STAFF names Social's owner and moderators, with titles: dac=owner:Chief Organizer, anna=moderator
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { createOidc } from './social/oidc.mjs';
import { createSocial } from './social/app.mjs';
import { previewPds, remotePds } from './social/pds.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8', '.dmg': 'application/x-apple-diskimage', '.zip': 'application/zip', '.deb': 'application/vnd.debian.binary-package',
  '.gz': 'application/gzip', '.icns': 'image/icns' };
const SHARED = /^\/(brand|media|css|js|downloads\/files)\//, APPS = ['sprite', 'box'];
const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=()', 'x-frame-options': 'SAMEORIGIN' };

// STAFF="dac=owner:Chief Organizer, anna=moderator" -> { dac: { role: 'owner', title: 'Chief Organizer' }, anna: { role: 'moderator' } }
export function parseStaff(text) {
  const out = {};
  for (const part of String(text || '').split(',')) {
    const m = /^\s*@?([a-z0-9-]+)\s*=\s*(owner|moderator|member)\s*(?::\s*(.+?))?\s*$/i.exec(part);
    if (m) out[m[1].toLowerCase()] = { role: m[2].toLowerCase(), title: m[3] || null };
  }
  return out;
}

export function makeServer(env = process.env) {
  const dataDir = env.DATA_DIR || join(ROOT, '..', '.data');
  mkdirSync(dataDir, { recursive: true });
  const pds = env.PDS_URL ? remotePds({ url: env.PDS_URL, publicUrl: env.PDS_PUBLIC_URL, adminPassword: env.PDS_ADMIN_PASSWORD }) : previewPds();
  if (!env.PDS_URL) console.log('Social is in preview: accounts live in memory until PDS_URL is set.');
  if (env.PDS_URL && !env.SESSION_SECRET) throw new Error('Set SESSION_SECRET: it protects the PDS sessions Social keeps.');
  const social = createSocial({ dbPath: env.PDS_URL ? join(dataDir, 'social.sqlite') : ':memory:', pds, handleDomain: env.PDS_HANDLE_DOMAIN || 'pds.christiansystems.org',
    secret: env.SESSION_SECRET, admins: (env.ADMIN_NAMES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean), staff: parseStaff(env.STAFF) });

  const oidc = env.OIDC_CLIENTS ? createOidc({ social, dataDir, issuer: env.OIDC_ISSUER || 'https://social.christiansystems.org', clients: JSON.parse(env.OIDC_CLIENTS) }) : null;

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

  // "social.christiansystems.org" -> { kind: 'social', base: 'christiansystems.org' }; anything unknown is the main site
  function site(req) {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim().toLowerCase();
    const first = host.split('.')[0];
    return ['www', 'social', 'sprite', 'box'].includes(first) && host.includes('.') ? { kind: first, base: host.slice(first.length + 1) } : { kind: 'main', base: host };
  }
  function redirect(res, to) { res.writeHead(301, { location: to, 'cache-control': 'public, max-age=3600' }); res.end(); }
  function notFound(res) {
    res.writeHead(404, { ...SECURITY, 'content-type': 'text/html; charset=utf-8' });
    createReadStream(join(ROOT, '404.html')).on('error', () => res.end('Not found')).pipe(res);
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local'), secure = req.headers['x-forwarded-proto'] === 'https', path = url.pathname;
      const { kind, base } = site(req), scheme = secure ? 'https://' : 'http://', to = (sub, p) => scheme + (sub ? sub + '.' : '') + base + p + url.search;
      if (path === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
      if (kind === 'www') return redirect(res, to('', path));
      if (oidc && await oidc.serve(req, res)) return;
      if (await social.serve(req, res, secure, '/api/', env.COOKIE_DOMAIN)) return; // one account everywhere: every address answers /api/
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      if (SHARED.test(path)) return file(req, res, path) || notFound(res);

      if (kind === 'social') {
        if (file(req, res, '/social' + path) || file(req, res, '/social/index.html')) return; // the app's own routes: /@name, /post/1 ...
        return notFound(res);
      }
      if (APPS.includes(kind)) {
        if (path === '/app') return redirect(res, '/app/');
        if (path.startsWith('/app/')) return file(req, res, '/' + kind + path.slice(4)) || notFound(res);
        return file(req, res, '/hosts/' + kind + path) || notFound(res);
      }
      // the main site; the apps and Social now live at their own addresses
      const old = /^\/(sprite|box|social)(\/.*)?$/.exec(path);
      if (old) return redirect(res, to(old[1], old[1] === 'social' ? (old[2] || '/') : '/app' + (old[2] || '/')));
      if (path.startsWith('/hosts/')) return notFound(res);
      if (file(req, res, path)) return;
      notFound(res);
    } catch (e) { console.error(e); if (!res.headersSent) res.writeHead(500); res.end(); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  makeServer().listen(port, () => console.log('christiansystems.org on :' + port));
}
