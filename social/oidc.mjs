// First-party OpenID Connect. Authorization code only; no dynamic registration or implicit flow.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
const hash = value => createHash('sha256').update(value).digest('base64url');
const random = () => randomBytes(32).toString('base64url');
const equal = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export function createOidc({ social, dataDir, issuer, clients = [] }) {
  const origin = new URL(issuer);
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password || (origin.protocol !== 'https:' && origin.hostname !== '127.0.0.1')) throw new Error('OIDC_ISSUER must be an HTTPS origin.');
  issuer = origin.origin;
  const registered = new Map();
  for (const client of clients) {
    if (!client.id || registered.has(client.id) || !client.secret || client.secret.length < 32 || !client.redirectUris?.length) throw new Error('Invalid OIDC client configuration.');
    for (const uri of client.redirectUris) {
      const u = new URL(uri);
      if (u.hash || u.username || u.password || (u.protocol !== 'https:' && u.hostname !== '127.0.0.1')) throw new Error('Unsafe OIDC redirect URI.');
    }
    registered.set(client.id, client);
  }
  const keyPath = join(dataDir, 'oidc-rs256.pem');
  try { readFileSync(keyPath); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
    try { writeFileSync(keyPath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  chmodSync(keyPath, 0o600);
  const key = createPrivateKey(readFileSync(keyPath)), publicKey = createPublicKey(key).export({ format: 'jwk' });
  const kid = hash(JSON.stringify({ e: publicKey.e, kty: publicKey.kty, n: publicKey.n }));
  const db = social.db;
  db.exec(`CREATE TABLE IF NOT EXISTS oidc_codes (hash TEXT PRIMARY KEY, client TEXT, redirect TEXT, challenge TEXT, nonce TEXT, user_id INTEGER, sid TEXT, expires INTEGER);
    CREATE TABLE IF NOT EXISTS oidc_access (hash TEXT PRIMARY KEY, user_id INTEGER, sid TEXT, expires INTEGER);`);
  const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', pragma: 'no-cache', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(body)); };
  const redirect = (res, url) => { res.writeHead(302, { location: url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }); res.end(); };
  const active = row => row && db.prepare('SELECT u.name, u.display FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=? AND s.id=? AND s.expires>? AND u.suspended=0').get(row.user_id, row.sid, Date.now());
  function jwt(claims) {
    const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
    const body = encode({ alg: 'RS256', typ: 'JWT', kid }) + '.' + encode(claims);
    return body + '.' + sign('RSA-SHA256', Buffer.from(body), key).toString('base64url');
  }
  return {
    async serve(req, res) {
      const url = new URL(req.url, issuer), path = url.pathname;
      if (path !== '/.well-known/openid-configuration' && !path.startsWith('/oauth/')) return false;
      const error = (code, status = 400) => json(res, status, { error: code });
      try {
        if (req.url.length > 8192) { error('invalid_request'); return true; }
        const now = Math.floor(Date.now() / 1000);
        db.prepare('DELETE FROM oidc_codes WHERE expires<?').run(now);
        db.prepare('DELETE FROM oidc_access WHERE expires<?').run(now);
        if (req.method === 'GET' && path === '/.well-known/openid-configuration') {
          json(res, 200, { issuer, authorization_endpoint: issuer + '/oauth/authorize', token_endpoint: issuer + '/oauth/token', userinfo_endpoint: issuer + '/oauth/userinfo', jwks_uri: issuer + '/oauth/jwks', response_types_supported: ['code'], grant_types_supported: ['authorization_code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'], scopes_supported: ['openid', 'profile'], claims_supported: ['sub', 'name', 'preferred_username'], code_challenge_methods_supported: ['S256'] });
        } else if (req.method === 'GET' && path === '/oauth/jwks') {
          json(res, 200, { keys: [{ ...publicKey, kid, alg: 'RS256', use: 'sig' }] });
        } else if (req.method === 'GET' && path === '/oauth/authorize') {
          const p = url.searchParams;
          if ([...p.keys()].some(k => p.getAll(k).length !== 1)) { error('invalid_request'); return true; }
          const client = registered.get(p.get('client_id')), uri = p.get('redirect_uri');
          // Never redirect on an unvalidated client or URI.
          if (!client || !client.redirectUris.includes(uri)) { error('invalid_request'); return true; }
          const to = new URL(uri), state = p.get('state');
          if (state) to.searchParams.set('state', state);
          const reject = code => { to.searchParams.set('error', code); redirect(res, to.href); };
          if (p.get('response_type') !== 'code') { reject('unsupported_response_type'); return true; }
          const scopes = (p.get('scope') || '').split(' ');
          if (!scopes.includes('openid') || scopes.some(s => !['openid', 'profile'].includes(s))) { reject('invalid_scope'); return true; }
          const challenge = p.get('code_challenge');
          if ((challenge && (!/^[\w-]{43}$/.test(challenge) || p.get('code_challenge_method') !== 'S256')) || (!challenge && (p.has('code_challenge_method') || client.requirePkce))) { reject('invalid_request'); return true; }
          if (p.has('prompt') && p.get('prompt') !== 'none') { reject('invalid_request'); return true; }
          const me = social.sessionUser(req);
          if (!me) {
            if (p.get('prompt') === 'none') reject('login_required');
            else redirect(res, issuer + '/signin?return=' + encodeURIComponent(issuer + req.url));
            return true;
          }
          // Silent sign-in is limited to explicitly registered first-party clients.
          const code = random();
          db.prepare('INSERT INTO oidc_codes VALUES (?,?,?,?,?,?,?,?)').run(hash(code), client.id, uri, challenge || null, p.get('nonce'), me.id, me.sid, now + 90);
          to.searchParams.set('code', code); to.searchParams.set('iss', issuer); redirect(res, to.href);
        } else if (req.method === 'POST' && path === '/oauth/token') {
          if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type'] || '')) { error('invalid_request'); return true; }
          let size = 0; const chunks = [];
          for await (const chunk of req) { size += chunk.length; if (size > 8192) { error('invalid_request', 413); return true; } chunks.push(chunk); }
          const p = new URLSearchParams(Buffer.concat(chunks).toString());
          if ([...p.keys()].some(k => p.getAll(k).length !== 1)) { error('invalid_request'); return true; }
          let id = p.get('client_id'), secret = p.get('client_secret');
          if (req.headers.authorization) {
            if (!req.headers.authorization.startsWith('Basic ') || secret) { error('invalid_client', 401); return true; }
            const raw = Buffer.from(req.headers.authorization.slice(6), 'base64').toString(), split = raw.indexOf(':');
            if (split < 0) { error('invalid_client', 401); return true; }
            const basicId = decodeURIComponent(raw.slice(0, split));
            if (id && id !== basicId) { error('invalid_client', 401); return true; }
            id = basicId; secret = decodeURIComponent(raw.slice(split + 1));
          }
          const client = registered.get(id);
          if (!client || !secret || !equal(client.secret, secret)) { error('invalid_client', 401); return true; }
          if (p.get('grant_type') !== 'authorization_code') { error('unsupported_grant_type'); return true; }
          const codeHash = hash(p.get('code') || ''), code = db.prepare('SELECT * FROM oidc_codes WHERE hash=?').get(codeHash);
          if (!code || code.expires <= now || code.client !== id || code.redirect !== p.get('redirect_uri') || (code.challenge && (!/^[A-Za-z0-9._~-]{43,128}$/.test(p.get('code_verifier') || '') || !equal(code.challenge, hash(p.get('code_verifier')))))) { error('invalid_grant'); return true; }
          // Synchronous consume: two requests cannot redeem the same code.
          db.prepare('DELETE FROM oidc_codes WHERE hash=?').run(codeHash);
          const user = active(code);
          if (!user) { error('invalid_grant'); return true; }
          const access = random();
          db.prepare('INSERT INTO oidc_access VALUES (?,?,?,?)').run(hash(access), code.user_id, code.sid, now + 300);
          const claims = { iss: issuer, sub: user.name, aud: id, iat: now, exp: now + 300, preferred_username: user.name, name: user.display || user.name, at_hash: createHash('sha256').update(access).digest().subarray(0, 16).toString('base64url') };
          if (code.nonce) claims.nonce = code.nonce;
          json(res, 200, { access_token: access, token_type: 'Bearer', expires_in: 300, scope: 'openid profile', id_token: jwt(claims) });
        } else if (req.method === 'GET' && path === '/oauth/userinfo') {
          const bearer = /^Bearer ([\w-]+)$/.exec(req.headers.authorization || '');
          const row = bearer && db.prepare('SELECT * FROM oidc_access WHERE hash=? AND expires>?').get(hash(bearer[1]), now), user = active(row);
          if (!user) { res.setHeader('www-authenticate', 'Bearer error="invalid_token"'); error('invalid_token', 401); }
          else json(res, 200, { sub: user.name, preferred_username: user.name, name: user.display || user.name });
        } else error('invalid_request', 404);
      } catch (e) { console.error('OIDC request failed:', e.name); if (!res.headersSent) error('server_error', 500); }
      return true;
    }
  };
}
