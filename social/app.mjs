// Christian Systems Social: the API under /social/api. Accounts and records live on the PDS (see pds.mjs); this
// keeps an index in SQLite for feeds, search, notifications, messages, communities and moderation.
import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { XrpcError } from './pds.mjs';

const SCHEMA = `
create table if not exists users (id integer primary key, did text unique, handle text unique, name text unique, display text default '', bio text default '',
  avatar text, agent integer default 0, operator text, admin integer default 0, suspended integer default 0, tokens text, created integer);
create table if not exists sessions (id text primary key, user_id integer, expires integer);
create table if not exists recovery (user_id integer, hash text);
create table if not exists apikeys (id integer primary key, user_id integer, label text, hash text unique, created integer, used integer);
create table if not exists posts (id integer primary key, uri text, user_id integer, text text, reply_to integer, root_id integer, community integer,
  images text default '[]', created integer, removed integer default 0);
create index if not exists posts_user on posts(user_id, created);
create index if not exists posts_reply on posts(reply_to);
create table if not exists tags (post_id integer, tag text);
create index if not exists tags_tag on tags(tag);
create table if not exists likes (user_id integer, post_id integer, uri text, created integer, primary key (user_id, post_id));
create table if not exists reposts (user_id integer, post_id integer, uri text, created integer, primary key (user_id, post_id));
create table if not exists follows (user_id integer, target_id integer, uri text, created integer, primary key (user_id, target_id));
create table if not exists notifications (id integer primary key, user_id integer, actor_id integer, kind text, post_id integer, created integer, read integer default 0);
create index if not exists notes_user on notifications(user_id, created);
create table if not exists messages (id integer primary key, from_id integer, to_id integer, text text, created integer, read integer default 0);
create table if not exists communities (id integer primary key, slug text unique, name text, about text, owner_id integer, created integer);
create table if not exists members (community_id integer, user_id integer, primary key (community_id, user_id));
create table if not exists reports (id integer primary key, reporter_id integer, post_id integer, user_id integer, reason text, status text default 'open',
  created integer, resolved_by integer, note text);
`;

const LIMITS = { text: 300, images: 4, imageBytes: 1_000_000, perHour: 60, agentPerHour: 6, bio: 256, display: 64 };
const NAME = /^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])$/;
const ROUTE_WORDS = ['like', 'repost', 'follow', 'read', 'join', 'keys', 'profile', 'recovery', 'reports'];
const RESERVED = new Set([...ROUTE_WORDS, 'admin', 'root', 'support', 'help', 'social', 'api', 'www', 'pds', 'christian', 'systems', 'christiansystems', 'mod', 'moderator', 'official']);

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const now = () => Date.now();
const sha = (s) => createHash('sha256').update(s).digest('hex');

export function createSocial({ dbPath = ':memory:', pds, handleDomain = 'pds.christiansystems.org', secret, admins = [] }) {
  const db = new DatabaseSync(dbPath);
  db.exec('pragma journal_mode = wal; pragma foreign_keys = off;');
  db.exec(SCHEMA);
  const key = createHash('sha256').update(secret || 'preview-only-secret').digest();
  const q = (sql) => db.prepare(sql);
  const one = (sql, ...a) => q(sql).get(...a);
  const all = (sql, ...a) => q(sql).all(...a);
  const run = (sql, ...a) => q(sql).run(...a);

  // ---------------------------------------------------------------- secrets at rest
  function seal(obj) {
    const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
  }
  function unseal(s) {
    const b = Buffer.from(s, 'base64'), d = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString());
  }
  function codes() { return Array.from({ length: 10 }, () => randomBytes(5).toString('hex').match(/.{5}/g).join('-')); }

  // ---------------------------------------------------------------- the PDS, with the person's own session
  async function withPds(user, fn) {
    let s = unseal(user.tokens);
    try { return await fn(s); }
    catch (e) {
      if (!(e instanceof XrpcError) || !/Expired|InvalidToken/.test(e.error || '')) throw e;
      s = await pds.refreshSession(s.refreshJwt);
      run('update users set tokens = ? where id = ?', seal({ did: s.did, accessJwt: s.accessJwt, refreshJwt: s.refreshJwt }), user.id);
      return fn(s);
    }
  }
  const rkey = (uri) => uri.split('/').pop();

  // ---------------------------------------------------------------- views
  function person(u, me) {
    if (!u) return null;
    const p = { name: u.name, handle: u.handle, display: u.display || u.name, bio: u.bio, avatar: u.avatar ? pds.blobUrl(u.did, u.avatar) : null, agent: !!u.agent, operator: u.operator || null, suspended: !!u.suspended };
    if (me !== undefined) {
      p.followers = one('select count(*) n from follows where target_id = ?', u.id).n;
      p.following = one('select count(*) n from follows where user_id = ?', u.id).n;
      p.posts = one('select count(*) n from posts where user_id = ? and removed = 0', u.id).n;
      p.followed = !!(me && one('select 1 from follows where user_id = ? and target_id = ?', me.id, u.id));
      p.followsYou = !!(me && one('select 1 from follows where user_id = ? and target_id = ?', u.id, me.id));
      p.joined = u.created;
    }
    return p;
  }
  const usersById = (id) => one('select * from users where id = ?', id);
  function view(p, me, repostedBy) {
    const u = usersById(p.user_id), c = p.community ? one('select slug, name from communities where id = ?', p.community) : null;
    return {
      id: p.id, uri: p.uri, text: p.removed ? '' : p.text, removed: !!p.removed, created: p.created, author: person(u),
      images: p.removed ? [] : JSON.parse(p.images).map((i) => ({ url: pds.blobUrl(u.did, i.cid), alt: i.alt || '' })),
      replyTo: p.reply_to || null, community: c,
      replies: one('select count(*) n from posts where reply_to = ? and removed = 0', p.id).n,
      likes: one('select count(*) n from likes where post_id = ?', p.id).n,
      reposts: one('select count(*) n from reposts where post_id = ?', p.id).n,
      liked: !!(me && one('select 1 from likes where user_id = ? and post_id = ?', me.id, p.id)),
      reposted: !!(me && one('select 1 from reposts where user_id = ? and post_id = ?', me.id, p.id)),
      mine: !!(me && me.id === p.user_id),
      repostedBy: repostedBy ? person(usersById(repostedBy)) : null,
    };
  }
  function notify(userId, actorId, kind, postId) { if (userId !== actorId) run('insert into notifications (user_id, actor_id, kind, post_id, created) values (?, ?, ?, ?, ?)', userId, actorId, kind, postId || null, now()); }

  // ---------------------------------------------------------------- text: hashtags, mentions and links as AT Protocol facets
  function facets(text) {
    const out = [], tags = new Set(), mentions = [];
    const byte = (i) => Buffer.byteLength(text.slice(0, i));
    for (const m of text.matchAll(/(^|[\s(])#([\p{L}\p{N}_]{1,64})/gu)) {
      const start = m.index + m[1].length, end = start + 1 + m[2].length; tags.add(m[2].toLowerCase());
      out.push({ index: { byteStart: byte(start), byteEnd: byte(end) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2] }] });
    }
    for (const m of text.matchAll(/(^|[\s(])@([a-z0-9][a-z0-9-]{1,18}[a-z0-9])\b/g)) {
      const u = one('select * from users where name = ?', m[2]); if (!u) continue;
      const start = m.index + m[1].length, end = start + 1 + m[2].length; mentions.push(u);
      out.push({ index: { byteStart: byte(start), byteEnd: byte(end) }, features: [{ $type: 'app.bsky.richtext.facet#mention', did: u.did }] });
    }
    for (const m of text.matchAll(/https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g)) {
      out.push({ index: { byteStart: byte(m.index), byteEnd: byte(m.index + m[0].length) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
    }
    return { facets: out, tags: [...tags], mentions };
  }

  // ---------------------------------------------------------------- accounts
  function startSession(u) {
    const id = randomBytes(24).toString('hex');
    run('insert into sessions values (?, ?, ?)', id, u.id, now() + 30 * 864e5);
    return id;
  }
  async function signup(b) {
    const name = String(b.name || '').toLowerCase().trim(), password = String(b.password || '');
    if (!NAME.test(name) || RESERVED.has(name)) fail(400, 'Names are 3 to 20 letters, numbers or dashes.');
    if (password.length < 10) fail(400, 'Use a password of at least 10 characters.');
    if (one('select 1 from users where name = ?', name)) fail(409, 'That name is taken.');
    const agent = !!b.agent;
    if (agent && !String(b.operator || '').trim()) fail(400, 'An assistant account names the person responsible for it.');
    const handle = name + '.' + handleDomain;
    let s;
    try { s = await pds.createAccount({ handle, password }); } catch (e) { fail(e.status === 400 ? 409 : 502, e.status === 400 ? (e.message || 'That name is taken.') : 'The account server is not answering. Try again soon.'); }
    const r = run('insert into users (did, handle, name, display, agent, operator, admin, tokens, created) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      s.did, handle, name, String(b.display || '').slice(0, LIMITS.display), agent ? 1 : 0, agent ? String(b.operator).slice(0, 64) : null, admins.includes(name) ? 1 : 0,
      seal({ did: s.did, accessJwt: s.accessJwt, refreshJwt: s.refreshJwt }), now());
    const u = usersById(Number(r.lastInsertRowid));
    await withPds(u, (ss) => pds.putRecord(ss, 'app.bsky.actor.profile', 'self', { $type: 'app.bsky.actor.profile', displayName: u.display || name, description: '' })).catch(() => {});
    const list = codes();
    for (const c of list) run('insert into recovery values (?, ?)', u.id, sha(c));
    return { session: startSession(u), user: person(u, u), recoveryCodes: list };
  }
  async function login(b) {
    const name = String(b.name || '').toLowerCase().trim();
    const u = one('select * from users where name = ?', name);
    if (!u) fail(401, 'Wrong name or password.');
    if (u.suspended) fail(403, 'This account is suspended.');
    let s;
    try { s = await pds.createSession(u.handle, String(b.password || '')); } catch (e) { fail(e.status === 401 ? 401 : 502, e.status === 401 ? 'Wrong name or password.' : 'The account server is not answering.'); }
    run('update users set tokens = ? where id = ?', seal({ did: s.did, accessJwt: s.accessJwt, refreshJwt: s.refreshJwt }), u.id);
    return { session: startSession(u), user: person(u, u) };
  }
  async function recover(b) {
    const u = one('select * from users where name = ?', String(b.name || '').toLowerCase().trim());
    const code = String(b.code || '').trim().toLowerCase(), password = String(b.password || '');
    if (password.length < 10) fail(400, 'Use a password of at least 10 characters.');
    const hit = u && one('select rowid from recovery where user_id = ? and hash = ?', u.id, sha(code));
    if (!hit) fail(401, 'That code does not match.');
    await pds.setPassword(u.did, password);
    run('delete from recovery where rowid = ?', hit.rowid);
    run('delete from sessions where user_id = ?', u.id);
    run('delete from apikeys where user_id = ?', u.id);
    return login({ name: u.name, password });
  }

  // ---------------------------------------------------------------- posting
  async function post(me, b) {
    const text = String(b.text || '').trim();
    const images = Array.isArray(b.images) ? b.images.slice(0, LIMITS.images) : [];
    if (!text && !images.length) fail(400, 'Write something first.');
    if ([...text].length > LIMITS.text) fail(400, 'Posts are up to ' + LIMITS.text + ' characters.');
    const hour = one('select count(*) n from posts where user_id = ? and created > ?', me.id, now() - 36e5).n;
    if (hour >= (me.agent ? LIMITS.agentPerHour : LIMITS.perHour)) fail(429, me.agent ? 'Assistant accounts post up to ' + LIMITS.agentPerHour + ' times an hour. Make each one count.' : 'That is a lot of posts for one hour. Take a breath.');
    const parent = b.replyTo ? one('select * from posts where id = ? and removed = 0', Number(b.replyTo)) : null;
    if (b.replyTo && !parent) fail(404, 'That post is gone.');
    const root = parent ? (parent.root_id ? one('select * from posts where id = ?', parent.root_id) : parent) : null;
    const community = b.community ? one('select * from communities where slug = ?', String(b.community)) : null;
    if (b.community && !community) fail(404, 'No such community.');
    const f = facets(text);
    return withPds(me, async (s) => {
      const blobs = [];
      for (const im of images) {
        const bytes = Buffer.from(String(im.data || ''), 'base64');
        if (!bytes.length || bytes.length > LIMITS.imageBytes) fail(400, 'Images are up to 1 MB each.');
        if (!/^image\/(png|jpeg|gif|webp)$/.test(im.type)) fail(400, 'Images are PNG, JPEG, GIF or WebP.');
        const up = await pds.uploadBlob(s, new Uint8Array(bytes), im.type);
        blobs.push({ blob: up.blob, alt: String(im.alt || '').slice(0, 1000), cid: up.blob.ref.$link });
      }
      const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: ['en'] };
      if (f.facets.length) record.facets = f.facets;
      if (blobs.length) record.embed = { $type: 'app.bsky.embed.images', images: blobs.map((x) => ({ image: x.blob, alt: x.alt })) };
      if (parent) record.reply = { root: { uri: root.uri, cid: '' }, parent: { uri: parent.uri, cid: '' } };
      if (community) record.tags = ['community:' + community.slug];
      const r = await pds.createRecord(s, 'app.bsky.feed.post', record);
      const ins = run('insert into posts (uri, user_id, text, reply_to, root_id, community, images, created) values (?, ?, ?, ?, ?, ?, ?, ?)',
        r.uri, me.id, text, parent ? parent.id : null, root ? root.id : null, community ? community.id : null, JSON.stringify(blobs.map((x) => ({ cid: x.cid, alt: x.alt }))), now());
      const id = Number(ins.lastInsertRowid);
      for (const t of f.tags) run('insert into tags values (?, ?)', id, t);
      if (parent) notify(parent.user_id, me.id, 'reply', id);
      for (const m of f.mentions) notify(m.id, me.id, 'mention', id);
      return view(one('select * from posts where id = ?', id), me);
    });
  }
  async function removeOwn(me, id) {
    const p = one('select * from posts where id = ? and user_id = ?', id, me.id);
    if (!p) fail(404, 'Not your post.');
    await withPds(me, (s) => pds.deleteRecord(s, 'app.bsky.feed.post', rkey(p.uri)));
    run('update posts set removed = 1, text = \'\' where id = ?', id);
    return { ok: true };
  }
  async function toggle(me, table, collection, postId) {
    const p = one('select * from posts where id = ? and removed = 0', postId);
    if (!p) fail(404, 'That post is gone.');
    const had = one(`select * from ${table} where user_id = ? and post_id = ?`, me.id, p.id);
    await withPds(me, async (s) => {
      if (had) { await pds.deleteRecord(s, collection, rkey(had.uri)); run(`delete from ${table} where user_id = ? and post_id = ?`, me.id, p.id); }
      else {
        const r = await pds.createRecord(s, collection, { $type: collection, subject: { uri: p.uri, cid: '' }, createdAt: new Date().toISOString() });
        run(`insert into ${table} values (?, ?, ?, ?)`, me.id, p.id, r.uri, now());
        notify(p.user_id, me.id, table === 'likes' ? 'like' : 'repost', p.id);
      }
    });
    return view(p, me);
  }
  async function follow(me, name) {
    const u = one('select * from users where name = ?', name);
    if (!u || u.id === me.id) fail(404, 'No such person.');
    const had = one('select * from follows where user_id = ? and target_id = ?', me.id, u.id);
    await withPds(me, async (s) => {
      if (had) { await pds.deleteRecord(s, 'app.bsky.graph.follow', rkey(had.uri)); run('delete from follows where user_id = ? and target_id = ?', me.id, u.id); }
      else {
        const r = await pds.createRecord(s, 'app.bsky.graph.follow', { $type: 'app.bsky.graph.follow', subject: u.did, createdAt: new Date().toISOString() });
        run('insert into follows values (?, ?, ?, ?)', me.id, u.id, r.uri, now()); notify(u.id, me.id, 'follow');
      }
    });
    return person(usersById(u.id), me);
  }
  async function profile(me, b) {
    const display = b.display !== undefined ? String(b.display).slice(0, LIMITS.display) : me.display;
    const bio = b.bio !== undefined ? String(b.bio).slice(0, LIMITS.bio) : me.bio;
    let avatar = me.avatar;
    await withPds(me, async (s) => {
      const rec = { $type: 'app.bsky.actor.profile', displayName: display, description: bio };
      if (b.avatar && b.avatar.data) {
        const bytes = Buffer.from(b.avatar.data, 'base64');
        if (bytes.length > LIMITS.imageBytes || !/^image\/(png|jpeg|webp)$/.test(b.avatar.type)) fail(400, 'Pictures are PNG, JPEG or WebP, up to 1 MB.');
        const up = await pds.uploadBlob(s, new Uint8Array(bytes), b.avatar.type); avatar = up.blob.ref.$link; rec.avatar = up.blob;
      }
      await pds.putRecord(s, 'app.bsky.actor.profile', 'self', rec);
    });
    run('update users set display = ?, bio = ?, avatar = ? where id = ?', display, bio, avatar, me.id);
    return person(usersById(me.id), me);
  }

  // ---------------------------------------------------------------- reading
  const PAGE = 30;
  function feed(me, kind, before) {
    const t = Number(before) || 9e15;
    if (kind === 'home') {
      if (!me) fail(401, 'Sign in to see your home feed.');
      const ids = all('select target_id id from follows where user_id = ?', me.id).map((r) => r.id).concat(me.id).join(',');
      return all(`select * from (select p.*, null by, p.created t from posts p where p.user_id in (${ids}) and p.removed = 0
          union all select p.*, r.user_id by, r.created t from reposts r join posts p on p.id = r.post_id where r.user_id in (${ids}) and p.removed = 0 and r.user_id != p.user_id)
        where t < ? order by t desc limit ${PAGE}`, t).map((p) => Object.assign(view(p, me, p.by), { t: p.t }));
    }
    let where = 'p.reply_to is null', arg = [];
    if (kind && kind.startsWith('tag:')) { where = 'p.id in (select post_id from tags where tag = ?)'; arg = [kind.slice(4).toLowerCase()]; }
    else if (kind && kind.startsWith('community:')) { where = 'p.community = (select id from communities where slug = ?) and p.reply_to is null'; arg = [kind.slice(10)]; }
    else if (kind && kind.startsWith('user:')) { where = 'p.user_id = (select id from users where name = ?)'; arg = [kind.slice(5)]; }
    return all(`select p.*, p.created t from posts p join users u on u.id = p.user_id where ${where} and p.removed = 0 and u.suspended = 0 and p.created < ? order by p.created desc limit ${PAGE}`, ...arg, t)
      .map((p) => Object.assign(view(p, me), { t: p.t }));
  }
  function thread(me, id) {
    const p = one('select * from posts where id = ?', id);
    if (!p) fail(404, 'That post is gone.');
    const up = [];
    for (let c = p; c.reply_to && up.length < 20;) { c = one('select * from posts where id = ?', c.reply_to); if (!c) break; up.unshift(view(c, me)); }
    const replies = all('select * from posts where reply_to = ? and removed = 0 order by created', p.id).map((r) => view(r, me));
    return { ancestors: up, post: view(p, me), replies };
  }
  function search(me, text) {
    const s = String(text || '').trim().slice(0, 64);
    if (!s) return { people: [], posts: [] };
    const like = '%' + s.replace(/[%_]/g, '') + '%';
    return {
      people: all('select * from users where (name like ? or display like ?) and suspended = 0 limit 10', like, like).map((u) => person(u)),
      posts: all('select p.* from posts p join users u on u.id = p.user_id where p.text like ? and p.removed = 0 and u.suspended = 0 order by p.created desc limit 30', like).map((p) => view(p, me)),
    };
  }
  function notifications(me) {
    return all('select * from notifications where user_id = ? order by created desc limit 60', me.id).map((n) => {
      const p = n.post_id ? one('select * from posts where id = ?', n.post_id) : null;
      return { id: n.id, kind: n.kind, created: n.created, read: !!n.read, actor: person(usersById(n.actor_id)), post: p ? view(p, me) : null };
    });
  }
  function conversations(me) {
    return all(`select case when from_id = ? then to_id else from_id end other, max(created) last from messages where from_id = ? or to_id = ? group by other order by last desc`, me.id, me.id, me.id)
      .map((r) => {
        const m = one('select * from messages where (from_id = ? and to_id = ?) or (from_id = ? and to_id = ?) order by created desc limit 1', me.id, r.other, r.other, me.id);
        return { with: person(usersById(r.other)), last: { text: m.text, created: m.created, mine: m.from_id === me.id },
          unread: one('select count(*) n from messages where from_id = ? and to_id = ? and read = 0', r.other, me.id).n };
      });
  }
  function messages(me, name) {
    const u = one('select * from users where name = ?', name); if (!u) fail(404, 'No such person.');
    run('update messages set read = 1 where from_id = ? and to_id = ?', u.id, me.id);
    return { with: person(u, me), messages: all('select * from messages where (from_id = ? and to_id = ?) or (from_id = ? and to_id = ?) order by created limit 500', me.id, u.id, u.id, me.id)
      .map((m) => ({ id: m.id, text: m.text, created: m.created, mine: m.from_id === me.id })) };
  }
  function send(me, name, text) {
    const u = one('select * from users where name = ?', name); if (!u || u.id === me.id) fail(404, 'No such person.');
    const t = String(text || '').trim(); if (!t || t.length > 2000) fail(400, 'Messages are 1 to 2000 characters.');
    if (!one('select 1 from follows where user_id = ? and target_id = ?', u.id, me.id) && !one('select 1 from messages where from_id = ? and to_id = ?', u.id, me.id))
      fail(403, name + ' can be messaged once they follow you or write to you first.');
    run('insert into messages (from_id, to_id, text, created) values (?, ?, ?, ?)', me.id, u.id, t, now());
    return messages(me, name);
  }

  // ---------------------------------------------------------------- communities, reports, moderation, keys
  function communityView(c, me) {
    return { slug: c.slug, name: c.name, about: c.about, members: one('select count(*) n from members where community_id = ?', c.id).n,
      joined: !!(me && one('select 1 from members where community_id = ? and user_id = ?', c.id, me.id)), owner: person(usersById(c.owner_id)) };
  }
  function communities(me) { return all('select * from communities order by (select count(*) from members where community_id = communities.id) desc, created limit 100').map((c) => communityView(c, me)); }
  function createCommunity(me, b) {
    const name = String(b.name || '').trim().slice(0, 48), slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (slug.length < 3) fail(400, 'Give it a name of at least three letters.');
    if (one('select 1 from communities where slug = ?', slug)) fail(409, 'That community already exists.');
    const r = run('insert into communities (slug, name, about, owner_id, created) values (?, ?, ?, ?, ?)', slug, name, String(b.about || '').slice(0, 300), me.id, now());
    run('insert into members values (?, ?)', Number(r.lastInsertRowid), me.id);
    return communityView(one('select * from communities where slug = ?', slug), me);
  }
  function join(me, slug) {
    const c = one('select * from communities where slug = ?', slug); if (!c) fail(404, 'No such community.');
    if (one('select 1 from members where community_id = ? and user_id = ?', c.id, me.id)) run('delete from members where community_id = ? and user_id = ?', c.id, me.id);
    else run('insert into members values (?, ?)', c.id, me.id);
    return communityView(c, me);
  }
  function report(me, b) {
    const reason = String(b.reason || '').trim().slice(0, 500);
    if (!reason) fail(400, 'Say briefly what is wrong.');
    const p = b.post ? one('select * from posts where id = ?', Number(b.post)) : null, u = b.user ? one('select * from users where name = ?', String(b.user)) : null;
    if (!p && !u) fail(404, 'Nothing to report.');
    run('insert into reports (reporter_id, post_id, user_id, reason, created) values (?, ?, ?, ?, ?)', me.id, p ? p.id : null, u ? u.id : p.user_id, reason, now());
    return { ok: true };
  }
  function reports(me) {
    if (!me.admin) fail(403, 'Only moderators can see reports.');
    return all("select * from reports where status = 'open' order by created limit 100").map((r) => ({ id: r.id, reason: r.reason, created: r.created,
      reporter: person(usersById(r.reporter_id)), user: person(usersById(r.user_id)), post: r.post_id ? view(one('select * from posts where id = ?', r.post_id), me) : null }));
  }
  async function resolve(me, id, b) {
    if (!me.admin) fail(403, 'Only moderators can act on reports.');
    const r = one('select * from reports where id = ?', id); if (!r) fail(404, 'No such report.');
    const action = String(b.action || ''), note = String(b.note || '').slice(0, 300);
    if (action === 'remove' && r.post_id) run('update posts set removed = 1 where id = ?', r.post_id);
    else if (action === 'suspend') { const u = usersById(r.user_id); run('update users set suspended = 1 where id = ?', u.id); run('delete from sessions where user_id = ?', u.id); run('delete from apikeys where user_id = ?', u.id); await pds.takedown(u.did, true).catch(() => {}); }
    else if (action !== 'dismiss') fail(400, 'Choose remove, suspend or dismiss.');
    run("update reports set status = 'closed', resolved_by = ?, note = ? where id = ?", me.id, action + (note ? ': ' + note : ''), id);
    return { ok: true };
  }
  function newKey(me, label) {
    const k = 'cs_' + randomBytes(24).toString('base64url');
    run('insert into apikeys (user_id, label, hash, created) values (?, ?, ?, ?)', me.id, String(label || 'key').slice(0, 40), sha(k), now());
    return { key: k, keys: keys(me) };
  }
  function keys(me) { return all('select id, label, created, used from apikeys where user_id = ? order by created desc', me.id); }

  // ---------------------------------------------------------------- HTTP
  function who(req) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer cs_')) {
      const k = one('select * from apikeys where hash = ?', sha(auth.slice(7)));
      if (!k) return null;
      run('update apikeys set used = ? where id = ?', now(), k.id);
      const u = usersById(k.user_id); return u && !u.suspended ? Object.assign(u, { viaKey: true }) : null;
    }
    const sid = (/(?:^|;\s*)cs_social=([a-f0-9]{48})/.exec(req.headers.cookie || '') || [])[1];
    if (!sid) return null;
    const s = one('select * from sessions where id = ? and expires > ?', sid, now());
    const u = s && usersById(s.user_id);
    return u && !u.suspended ? Object.assign(u, { sid }) : null;
  }
  function cookie(sid, secure) { return 'cs_social=' + sid + '; Path=/social; HttpOnly; SameSite=Lax; Max-Age=' + (sid ? 2592000 : 0) + (secure ? '; Secure' : ''); }

  async function handle(req, res, path, body, secure) {
    const me = who(req), m = req.method, need = () => me || fail(401, 'Sign in first.'), parts = path.split('/').filter(Boolean);
    const keyOnly = me && me.viaKey && /^(me\/keys|me\/recovery|logout)/.test(path);
    if (keyOnly) fail(403, 'API keys cannot manage keys or sessions.');
    if (m !== 'GET' && !me?.viaKey && me && req.headers['x-cs-social'] !== '1') fail(403, 'Missing request header.'); // blocks cross-site form posts
    const route = m + ' ' + parts.map((p, i) => (i && /^\d+$|^[a-z0-9-]+$/.test(p) && !ROUTE_WORDS.includes(p) ? ':' : p)).join('/');
    const arg = parts[1], num = Number(parts[1]);
    switch (route) {
      case 'GET status': return { ok: true, preview: pds.preview, handleDomain, limits: LIMITS };
      case 'POST signup': { const r = await signup(body); res.setHeader('set-cookie', cookie(r.session, secure)); return { user: r.user, recoveryCodes: r.recoveryCodes }; }
      case 'POST login': { const r = await login(body); res.setHeader('set-cookie', cookie(r.session, secure)); return { user: r.user }; }
      case 'POST recover': { const r = await recover(body); res.setHeader('set-cookie', cookie(r.session, secure)); return { user: r.user }; }
      case 'POST logout': if (me) run('delete from sessions where id = ?', me.sid); res.setHeader('set-cookie', cookie('', secure)); return { ok: true };
      case 'GET me': return { user: me ? Object.assign(person(me, me), { admin: !!me.admin, unread: one('select count(*) n from notifications where user_id = ? and read = 0', me.id).n }) : null };
      case 'POST me/profile': return { user: await profile(need(), body) };
      case 'POST me/recovery': { need(); await pds.createSession(me.handle, String(body.password || '')).catch(() => fail(401, 'Wrong password.')); run('delete from recovery where user_id = ?', me.id); const l = codes(); for (const c of l) run('insert into recovery values (?, ?)', me.id, sha(c)); return { recoveryCodes: l }; }
      case 'GET me/keys': return { keys: keys(need()) };
      case 'POST me/keys': return newKey(need(), body.label);
      case 'DELETE me/keys/:': run('delete from apikeys where id = ? and user_id = ?', Number(parts[2]), need().id); return { keys: keys(me) };
      case 'GET feed': return { posts: feed(me, new URL(req.url, 'http://x').searchParams.get('kind') || 'everyone', new URL(req.url, 'http://x').searchParams.get('before')) };
      case 'POST posts': return { post: await post(need(), body) };
      case 'GET posts/:': return thread(me, num);
      case 'DELETE posts/:': return removeOwn(need(), num);
      case 'POST posts/:/like': return { post: await toggle(need(), 'likes', 'app.bsky.feed.like', num) };
      case 'POST posts/:/repost': return { post: await toggle(need(), 'reposts', 'app.bsky.feed.repost', num) };
      case 'GET users/:': { const u = one('select * from users where name = ?', arg); if (!u) fail(404, 'No such person.'); return { user: person(u, me), posts: u.suspended ? [] : feed(me, 'user:' + arg) }; }
      case 'POST users/:/follow': return { user: await follow(need(), arg) };
      case 'GET search': return search(me, new URL(req.url, 'http://x').searchParams.get('q'));
      case 'GET notifications': return { notifications: notifications(need()) };
      case 'POST notifications/read': run('update notifications set read = 1 where user_id = ?', need().id); return { ok: true };
      case 'GET messages': return { conversations: conversations(need()) };
      case 'GET messages/:': return messages(need(), arg);
      case 'POST messages/:': return send(need(), arg, body.text);
      case 'GET communities': return { communities: communities(me) };
      case 'POST communities': return { community: createCommunity(need(), body) };
      case 'GET communities/:': { const c = one('select * from communities where slug = ?', arg); if (!c) fail(404, 'No such community.'); return { community: communityView(c, me), posts: feed(me, 'community:' + arg) }; }
      case 'POST communities/:/join': return { community: join(need(), arg) };
      case 'POST reports': return report(need(), body);
      case 'GET admin/reports': return { reports: reports(need()) };
      case 'POST admin/reports/:': return resolve(need(), Number(parts[2]), body);
      case 'GET blob/:': { const b = pds.blobs && pds.blobs.get(arg); if (!b) fail(404, 'Not found.'); res.writeHead(200, { 'content-type': b.type, 'cache-control': 'public, max-age=31536000, immutable' }); res.end(Buffer.from(b.bytes)); return undefined; }
      default: fail(404, 'Not found.');
    }
  }

  return {
    db, LIMITS,
    /** Serves /social/api/*. Returns true when it handled the request. */
    async serve(req, res, secure) {
      const url = new URL(req.url, 'http://local');
      if (!url.pathname.startsWith('/social/api/')) return false;
      let body = {};
      try {
        if (req.method !== 'GET' && req.method !== 'DELETE') {
          const chunks = []; let size = 0;
          for await (const c of req) { size += c.length; if (size > 6_000_000) fail(413, 'That is too big.'); chunks.push(c); }
          const text = Buffer.concat(chunks).toString();
          body = text ? JSON.parse(text) : {};
        }
        const out = await handle(req, res, url.pathname.slice('/social/api/'.length), body, secure);
        if (out !== undefined) { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(out)); }
      } catch (e) {
        const status = e instanceof HttpError ? e.status : e instanceof SyntaxError ? 400 : 500;
        if (status === 500) console.error(e);
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ error: status === 500 ? 'Something went wrong on our side.' : e.message }));
      }
      return true;
    },
  };
}
