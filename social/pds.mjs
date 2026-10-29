// Social's link to the account server. With PDS_URL set it speaks XRPC to our PDS (ChristianSystemsPDS): accounts,
// sessions and every record (posts, likes, reposts, follows, profiles, images) live there, in the person's own
// repository, so they can take them elsewhere. Without PDS_URL it runs a small in-memory stand-in with the same
// surface, for local previews and tests.
import { createHash, randomBytes } from 'node:crypto';

export class XrpcError extends Error {
  constructor(status, error, message) { super(message || error || 'PDS error ' + status); this.status = status; this.error = error; }
}

function tid() { // record keys in AT Protocol's timestamp-identifier style
  const s = '234567abcdefghijklmnopqrstuvwxyz';
  let n = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)), out = '';
  for (let i = 0; i < 13; i++) { out = s[Number(n & 31n)] + out; n >>= 5n; }
  return out;
}

export function remotePds({ url, publicUrl, adminPassword, fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, ''), open = (publicUrl || url).replace(/\/+$/, ''); // the server may reach the PDS privately; browsers use its public address
  async function call(method, nsid, { token, admin, params, body, type } = {}) {
    const q = params ? '?' + new URLSearchParams(params) : '';
    const headers = {};
    if (token) headers.authorization = 'Bearer ' + token;
    if (admin) headers.authorization = 'Basic ' + Buffer.from('admin:' + adminPassword).toString('base64');
    let payload;
    if (body instanceof Uint8Array) { payload = body; headers['content-type'] = type || 'application/octet-stream'; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    const r = await fetchImpl(base + '/xrpc/' + nsid + q, { method, headers, body: payload });
    const text = await r.text();
    const json = text ? (() => { try { return JSON.parse(text); } catch { return { message: text }; } })() : {};
    if (!r.ok) throw new XrpcError(r.status, json.error, json.message);
    return json;
  }
  return {
    preview: false,
    blobUrl: (did, cid) => open + '/xrpc/com.atproto.sync.getBlob?' + new URLSearchParams({ did, cid }),
    async createAccount({ handle, password }) {
      const { code } = await call('POST', 'com.atproto.server.createInviteCode', { admin: true, body: { useCount: 1 } });
      const email = 'u' + randomBytes(9).toString('hex') + '@accounts.invalid'; // the PDS wants one; nobody is asked for theirs
      return call('POST', 'com.atproto.server.createAccount', { body: { handle, password, email, inviteCode: code } });
    },
    createSession: (identifier, password) => call('POST', 'com.atproto.server.createSession', { body: { identifier, password } }),
    refreshSession: (refreshJwt) => call('POST', 'com.atproto.server.refreshSession', { token: refreshJwt }),
    createRecord: (s, collection, record) => call('POST', 'com.atproto.repo.createRecord', { token: s.accessJwt, body: { repo: s.did, collection, record } }),
    putRecord: (s, collection, rkey, record) => call('POST', 'com.atproto.repo.putRecord', { token: s.accessJwt, body: { repo: s.did, collection, rkey, record } }),
    deleteRecord: (s, collection, rkey) => call('POST', 'com.atproto.repo.deleteRecord', { token: s.accessJwt, body: { repo: s.did, collection, rkey } }),
    uploadBlob: (s, bytes, type) => call('POST', 'com.atproto.repo.uploadBlob', { token: s.accessJwt, body: bytes, type }),
    setPassword: (did, password) => call('POST', 'com.atproto.admin.updateAccountPassword', { admin: true, body: { did, password } }),
    takedown: (did, on) => call('POST', 'com.atproto.admin.updateSubjectStatus', { admin: true, body: { subject: { $type: 'com.atproto.admin.defs#repoRef', did }, takedown: { applied: on } } }),
    health: () => call('GET', '_health'),
  };
}

export function previewPds() {
  const accounts = new Map(), blobs = new Map();
  const hash = (p) => createHash('sha256').update(p).digest('hex');
  const session = (a) => ({ did: a.did, handle: a.handle, accessJwt: 'acc.' + a.did + '.' + randomBytes(8).toString('hex'), refreshJwt: 'ref.' + a.did });
  const owner = (s) => { const a = [...accounts.values()].find((x) => x.did === s.did); if (!a) throw new XrpcError(401, 'AuthRequired'); return a; };
  return {
    preview: true,
    blobs,
    blobUrl: (did, cid) => '/api/blob/' + cid,
    async createAccount({ handle, password }) {
      if ([...accounts.values()].some((a) => a.handle === handle)) throw new XrpcError(400, 'HandleNotAvailable', 'That name is taken.');
      const a = { did: 'did:plc:' + randomBytes(12).toString('hex'), handle, pw: hash(password), records: new Map() };
      accounts.set(a.did, a);
      return session(a);
    },
    async createSession(identifier, password) {
      const a = [...accounts.values()].find((x) => x.handle === identifier || x.did === identifier);
      if (!a || a.pw !== hash(password)) throw new XrpcError(401, 'AuthenticationRequired', 'Wrong name or password.');
      if (a.takendown) throw new XrpcError(401, 'AccountTakedown', 'This account is suspended.');
      return session(a);
    },
    async refreshSession(refreshJwt) { const a = accounts.get(refreshJwt.slice(4)); if (!a) throw new XrpcError(401, 'ExpiredToken'); return session(a); },
    async createRecord(s, collection, record) { const a = owner(s), rkey = tid(); a.records.set(collection + '/' + rkey, record); return { uri: 'at://' + a.did + '/' + collection + '/' + rkey, cid: 'bafy' + hash(JSON.stringify(record)).slice(0, 40) }; },
    async putRecord(s, collection, rkey, record) { const a = owner(s); a.records.set(collection + '/' + rkey, record); return { uri: 'at://' + a.did + '/' + collection + '/' + rkey, cid: 'bafy' + hash(JSON.stringify(record)).slice(0, 40) }; },
    async deleteRecord(s, collection, rkey) { owner(s).records.delete(collection + '/' + rkey); return {}; },
    async uploadBlob(s, bytes, type) { owner(s); const cid = 'bafk' + hash(bytes).slice(0, 40); blobs.set(cid, { bytes, type }); return { blob: { $type: 'blob', ref: { $link: cid }, mimeType: type, size: bytes.length } }; },
    async setPassword(did, password) { const a = accounts.get(did); if (!a) throw new XrpcError(404, 'NotFound'); a.pw = hash(password); return {}; },
    async takedown(did, on) { const a = accounts.get(did); if (a) a.takendown = on; return {}; },
    async health() { return { version: 'preview' }; },
  };
}
