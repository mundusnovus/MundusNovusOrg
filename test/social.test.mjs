// End to end: the real server with the preview account server, driven over HTTP the way the app drives it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { remotePds } from '../social/pds.mjs';

async function start(env = {}) {
  const server = makeServer({ DATA_DIR: '/tmp/cs-social-test', ADMIN_NAMES: 'mod-anna', ...env });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  function client() {
    let cookie = '';
    return async (method, path, body, headers = {}) => {
      const r = await fetch(base + '/api/' + path, { method, headers: { 'x-forwarded-host': 'social.christiansystems.test', 'x-cs-social': '1', cookie, ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
      const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
      return { status: r.status, ...(await r.json().catch(() => ({}))) };
    };
  }
  return { server, base, client };
}

test('every address serves its part of the site', async () => {
  const { server, base } = await start();
  const get = (host, p, h = {}) => fetch(base + p, { headers: { 'x-forwarded-host': host, ...h }, redirect: 'manual' });
  try {
    const main = 'christiansystems.test', ok = async (host, p, has) => { const r = await get(host, p); assert.equal(r.status, 200, host + p); if (has) assert.match(await r.text(), has, host + p); };
    await ok(main, '/', /Make something good/); await ok(main, '/downloads/', /data-downloads/); await ok(main, '/source/'); await ok(main, '/healthz');
    await ok('sprite.' + main, '/', /What it does/); await ok('sprite.' + main, '/app/', /ChristianSprite/); await ok('sprite.' + main, '/app/js/tools.js');
    await ok('box.' + main, '/', /Made in ChristianBox/); await ok('box.' + main, '/app/', /ChristianBox/); await ok('box.' + main, '/app/box/songtools.js');
    await ok('social.' + main, '/', /social\.js/); await ok('social.' + main, '/@someone', /social\.js/); await ok('social.' + main, '/social.css');
    for (const host of [main, 'sprite.' + main, 'box.' + main, 'social.' + main]) { await ok(host, '/brand/tokens.css'); await ok(host, '/downloads/files/downloads.json'); }
    assert.equal((await get(main, '/api/me')).status, 200); // one account everywhere: every address answers /api/
    assert.equal((await get('box.' + main, '/api/me')).status, 200);
    const redirects = [['www.' + main, '/source/', 'http://' + main + '/source/'], [main, '/sprite/', 'http://sprite.' + main + '/app/'], [main, '/box/x.js', 'http://box.' + main + '/app/x.js'],
      [main, '/social/@ann', 'http://social.' + main + '/@ann'], ['sprite.' + main, '/app', '/app/']];
    for (const [host, p, to] of redirects) { const r = await get(host, p); assert.equal(r.status, 301, host + p); assert.equal(r.headers.get('location'), to); }
    assert.equal((await get(main, '/nope')).status, 404);
    assert.equal((await get(main, '/hosts/box/')).status, 404);
    assert.equal((await get(main, '/../server.mjs')).status, 404);
    assert.equal((await get('sprite.' + main, '/app/../../server.mjs')).status, 404);
    assert.equal((await get(main, '/')).headers.get('x-content-type-options'), 'nosniff');
  } finally { server.close(); }
});

test('one sign-in counts on every address', async () => {
  const { server, base } = await start({ COOKIE_DOMAIN: 'christiansystems.test' });
  try {
    const r = await fetch(base + '/api/signup', { method: 'POST', headers: { 'x-forwarded-host': 'social.christiansystems.test', 'content-type': 'application/json', 'x-cs-social': '1' }, body: JSON.stringify({ name: 'una', password: 'one account for all' }) });
    const set = r.headers.get('set-cookie'); assert.match(set, /Domain=christiansystems\.test/); assert.match(set, /Path=\//);
    const me = await (await fetch(base + '/api/me', { headers: { 'x-forwarded-host': 'box.christiansystems.test', cookie: set.split(';')[0] } })).json();
    assert.equal(me.user.name, 'una');
  } finally { server.close(); }
});

test('accounts, posts, replies, likes, follows, feeds, messages, communities and moderation', async () => {
  const { server, client } = await start();
  try {
    const ann = client(), ben = client(), mod = client(), bot = client(), anon = client();
    assert.equal((await ann('POST', 'signup', { name: 'Ab', password: 'long enough pw' })).status, 400);
    assert.equal((await ann('POST', 'signup', { name: 'admin', password: 'long enough pw' })).status, 400);
    const a = await ann('POST', 'signup', { name: 'ann', display: 'Ann', password: 'a good long password' });
    assert.equal(a.status, 200); assert.equal(a.recoveryCodes.length, 10); assert.equal(a.user.handle, 'ann.pds.christiansystems.org');
    assert.equal((await ben('POST', 'signup', { name: 'ann', password: 'a good long password' })).status, 409);
    await ben('POST', 'signup', { name: 'ben', password: 'another long password' });
    await mod('POST', 'signup', { name: 'mod-anna', password: 'moderator password' });
    assert.equal((await bot('POST', 'signup', { name: 'helper', password: 'assistant password', agent: true })).status, 400);
    assert.equal((await bot('POST', 'signup', { name: 'helper', password: 'assistant password', agent: true, operator: '@ann' })).status, 200);

    // without the header a cross-site form could post; with it, it works
    assert.equal((await fetch('http://127.0.0.1:' + server.address().port + '/api/posts', { method: 'POST', headers: { 'x-forwarded-host': 'social.christiansystems.test' } })).status, 401);
    const p1 = await ann('POST', 'posts', { text: 'First light in the #studio, with @ben. https://christiansystems.org' });
    assert.equal(p1.status, 200); assert.equal(p1.post.author.name, 'ann');
    assert.equal((await ann('POST', 'posts', { text: 'x'.repeat(301) })).status, 400);
    assert.equal((await anon('POST', 'posts', { text: 'hi' })).status, 401);
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64');
    const pic = await ann('POST', 'posts', { text: 'A lantern', images: [{ type: 'image/png', data: png, alt: 'a lantern' }] });
    assert.equal(pic.post.images.length, 1); assert.equal(pic.post.images[0].alt, 'a lantern');
    const blob = await fetch('http://127.0.0.1:' + server.address().port + new URL(pic.post.images[0].url, 'http://x').pathname, { headers: { 'x-forwarded-host': 'social.christiansystems.test' } }); assert.equal(blob.headers.get('content-type'), 'image/png');

    const reply = await ben('POST', 'posts', { text: 'Lovely', replyTo: p1.post.id });
    const th = await anon('GET', 'posts/' + reply.post.id); assert.equal(th.ancestors[0].id, p1.post.id);
    assert.equal((await anon('GET', 'posts/' + p1.post.id)).replies.length, 1);
    let like = await ben('POST', 'posts/' + p1.post.id + '/like'); assert.equal(like.post.liked, true); assert.equal(like.post.likes, 1);
    like = await ben('POST', 'posts/' + p1.post.id + '/like'); assert.equal(like.post.liked, false);
    await ben('POST', 'posts/' + p1.post.id + '/like');
    assert.equal((await ben('POST', 'users/ann/follow')).user.followed, true);
    await ben('POST', 'posts/' + p1.post.id + '/repost');
    const home = await ben('GET', 'feed?kind=home'); assert.ok(home.posts.some((p) => p.id === p1.post.id));
    assert.ok((await anon('GET', 'feed?kind=everyone')).posts.length >= 2);
    assert.equal((await anon('GET', 'feed?kind=tag:studio')).posts[0].id, p1.post.id);
    assert.equal((await anon('GET', 'feed?kind=home')).status, 401);
    const notes = await ann('GET', 'notifications'); assert.deepEqual([...new Set(notes.notifications.map((n) => n.kind))].sort(), ['follow', 'like', 'reply', 'repost']);
    assert.ok((await ben('GET', 'notifications')).notifications.some((n) => n.kind === 'mention'));
    assert.equal((await anon('GET', 'search?q=lant')).posts.length, 1);
    assert.equal((await anon('GET', 'search?q=ben')).people[0].name, 'ben');
    const prof = await anon('GET', 'users/ann'); assert.equal(prof.user.followers, 1); assert.equal(prof.posts.length, 2);

    // messages need a follow (or a first message) from the other side
    assert.equal((await ben('POST', 'messages/ann', { text: 'hello' })).status, 403);
    assert.equal((await ann('POST', 'messages/ben', { text: 'Thanks for following' })).status, 200);
    assert.equal((await ben('POST', 'messages/ann', { text: 'Of course' })).messages.length, 2);
    assert.equal((await ann('GET', 'messages')).conversations[0].unread, 1);

    const c = await ann('POST', 'communities', { name: 'Parish Choir', about: 'Sundays at ten' }); assert.equal(c.community.slug, 'parish-choir');
    assert.equal((await ben('POST', 'communities/parish-choir/join')).community.members, 2);
    await ben('POST', 'posts', { text: 'Practice is moved to Thursday', community: 'parish-choir' });
    assert.equal((await anon('GET', 'communities/parish-choir')).posts.length, 1);

    // assistants are labelled and limited
    for (let i = 0; i < 6; i++) assert.equal((await bot('POST', 'posts', { text: 'Daily verse ' + i })).status, 200);
    const limited = await bot('POST', 'posts', { text: 'one more' }); assert.equal(limited.status, 429);
    assert.equal((await anon('GET', 'users/helper')).user.agent, true);

    // API keys post as the account, but cannot manage keys
    const k = await ann('POST', 'me/keys', { label: 'test' });
    const viaKey = await anon('POST', 'posts', { text: 'From a script' }, { authorization: 'Bearer ' + k.key, 'x-cs-social': '' });
    assert.equal(viaKey.status, 200); assert.equal(viaKey.post.author.name, 'ann');
    assert.equal((await anon('POST', 'me/keys', { label: 'x' }, { authorization: 'Bearer ' + k.key })).status, 403);

    // moderation
    assert.equal((await ben('POST', 'reports', { post: pic.post.id, reason: 'test report' })).status, 200);
    assert.equal((await ben('GET', 'admin/reports')).status, 403);
    const reps = await mod('GET', 'admin/reports'); assert.equal(reps.reports.length, 1);
    await mod('POST', 'admin/reports/' + reps.reports[0].id, { action: 'remove' });
    assert.equal((await anon('GET', 'posts/' + pic.post.id)).post.removed, true);
    await ben('POST', 'reports', { user: 'helper', reason: 'spam' });
    const r2 = await mod('GET', 'admin/reports'); await mod('POST', 'admin/reports/' + r2.reports[0].id, { action: 'suspend' });
    assert.equal((await bot('GET', 'me')).user, null);
    assert.equal((await client()('POST', 'login', { name: 'helper', password: 'assistant password' })).status, 403);

    // deleting, signing out, signing in, recovering
    assert.equal((await ann('DELETE', 'posts/' + viaKey.post.id)).ok, true);
    await ann('POST', 'logout'); assert.equal((await ann('GET', 'me')).user, null);
    assert.equal((await ann('POST', 'login', { name: 'ann', password: 'wrong password!' })).status, 401);
    const back = await ann('POST', 'recover', { name: 'ann', code: a.recoveryCodes[0], password: 'a brand new password' });
    assert.equal(back.user.name, 'ann');
    assert.equal((await client()('POST', 'recover', { name: 'ann', code: a.recoveryCodes[0], password: 'yet another password' })).status, 401);
    assert.equal((await client()('POST', 'login', { name: 'ann', password: 'a brand new password' })).status, 200);
    const prof2 = await ann('POST', 'me/profile', { display: 'Ann of the choir', bio: 'I sing.' }); assert.equal(prof2.user.display, 'Ann of the choir');
  } finally { server.close(); }
});

test('remote PDS client speaks XRPC', async () => {
  const calls = [];
  const fake = async (url, o) => { calls.push([o.method, url.replace('https://pds.test/xrpc/', ''), o.headers.authorization || '', o.body ? JSON.parse(o.body) : null]);
    const nsid = url.split('/xrpc/')[1].split('?')[0];
    const out = { 'com.atproto.server.createInviteCode': { code: 'inv-1' }, 'com.atproto.server.createAccount': { did: 'did:plc:x', handle: 'ann.pds.test', accessJwt: 'a', refreshJwt: 'r' }, 'com.atproto.repo.createRecord': { uri: 'at://did:plc:x/app.bsky.feed.post/1', cid: 'c' } }[nsid] || {};
    return new Response(JSON.stringify(out), { status: 200 }); };
  const pds = remotePds({ url: 'https://pds.test/', adminPassword: 'secret', fetchImpl: fake });
  const s = await pds.createAccount({ handle: 'ann.pds.test', password: 'pw' });
  assert.equal(calls[0][1], 'com.atproto.server.createInviteCode'); assert.match(calls[0][2], /^Basic /);
  assert.equal(calls[1][3].inviteCode, 'inv-1'); assert.match(calls[1][3].email, /@accounts\.invalid$/);
  await pds.createRecord(s, 'app.bsky.feed.post', { text: 'hi' });
  assert.equal(calls[2][2], 'Bearer a'); assert.equal(calls[2][3].repo, 'did:plc:x');
  assert.match(pds.blobUrl('did:plc:x', 'bafk'), /^https:\/\/pds\.test\/xrpc\/com\.atproto\.sync\.getBlob\?did=did%3Aplc%3Ax&cid=bafk$/);
});

test('the owner, moderators and titles', async () => {
  const { parseStaff } = await import('../server.mjs');
  assert.deepEqual(parseStaff('DAC=owner:Chief Organizer, anna = moderator, bad'), { dac: { role: 'owner', title: 'Chief Organizer' }, anna: { role: 'moderator', title: null } });
  const { server, client } = await start({ STAFF: 'dac=owner:Chief Organizer, mod-anna=moderator', ADMIN_NAMES: '' });
  try {
    const dac = client(), mod = client(), joe = client(), sam = client();
    await dac('POST', 'signup', { name: 'dac', password: 'the owner password' });
    await mod('POST', 'signup', { name: 'mod-anna', password: 'moderator password' });
    await joe('POST', 'signup', { name: 'joe', password: 'a member password' });
    await sam('POST', 'signup', { name: 'sam', password: 'another member pw' });
    const me = await dac('GET', 'me'); assert.equal(me.user.role, 'owner'); assert.equal(me.user.title, 'Chief Organizer');
    const post = await dac('POST', 'posts', { text: 'Welcome, everyone.' });
    assert.equal(post.post.author.title, 'Chief Organizer');
    assert.equal((await joe('GET', 'users/dac')).user.title, 'Chief Organizer');
    // only the owner manages people; settings outrank the database
    assert.equal((await mod('GET', 'admin/people')).status, 403);
    assert.ok((await dac('GET', 'admin/people?q=')).people.length >= 4);
    assert.equal((await dac('POST', 'admin/people/mod-anna', { role: 'member' })).status, 403);
    const joeNow = await dac('POST', 'admin/people/joe', { role: 'moderator', title: 'Parish Liaison' });
    assert.equal(joeNow.person.role, 'moderator'); assert.equal(joeNow.person.title, 'Parish Liaison');
    // a moderator cannot suspend another moderator or the owner; the owner can suspend and restore anyone
    await sam('POST', 'reports', { user: 'dac', reason: 'test' });
    const r = (await mod('GET', 'admin/reports')).reports[0];
    assert.equal((await mod('POST', 'admin/reports/' + r.id, { action: 'suspend' })).status, 403);
    assert.equal((await dac('POST', 'admin/people/sam', { suspended: true })).person.suspended, true);
    assert.equal((await sam('GET', 'me')).user, null);
    assert.equal((await dac('POST', 'admin/people/sam', { suspended: false })).person.suspended, false);
    assert.equal((await dac('POST', 'admin/people/dac', { suspended: true })).status, 400);
    // moderators can put back a post they removed
    assert.equal((await sam('POST', 'login', { name: 'sam', password: 'another member pw' })).status, 200); // suspension signed Sam out
    const p = await sam('POST', 'posts', { text: 'Fine post' });
    await joe('POST', 'reports', { post: p.post.id, reason: 'mistake' });
    const rep = (await mod('GET', 'admin/reports')).reports.find((x) => x.post && x.post.id === p.post.id);
    await mod('POST', 'admin/reports/' + rep.id, { action: 'remove' });
    assert.equal((await joe('GET', 'posts/' + p.post.id)).post.removed, true);
    assert.equal((await mod('POST', 'admin/posts/' + p.post.id + '/restore')).post.removed, false);
  } finally { server.close(); }
});
