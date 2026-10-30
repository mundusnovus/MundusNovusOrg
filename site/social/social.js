/* MNSocial: the app. A small router over /social/..., views built from DOM nodes (never from HTML
   strings, so nothing anyone writes can run as code), and the composer. Talks only to /social/api. */
(function () {
  'use strict';
  var view = document.getElementById('view'), me = null, status = {};
  var MAIN = location.protocol + '//' + location.host.replace(/^social\./, ''), SUB = function (s) { return location.protocol + '//' + s + '.' + location.host.replace(/^social\./, ''); };
  // after signing in or joining, go back to the Mundus Novus page that sent you here (never anywhere else)
  function back() { var r = new URLSearchParams(location.search).get('return') || ''; try { var u = new URL(r); var root = location.host.replace(/^social\./, ''); if ((u.host === root || u.host.endsWith('.' + root)) && /^https?:$/.test(u.protocol)) { location.href = u.href; return true; } } catch (e) {} return false; }
  var ICON = {
    reply: 'M4 5h16v11H8l-4 4z', repost: 'M7 7h11l-3-3M17 17H6l3 3M18 7v5M6 17v-5', like: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
    more: 'M5 12h.01M12 12h.01M19 12h.01', image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01'
  };

  // ---------------------------------------------------------------- helpers
  function h(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in attrs || {}) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(function (x) { add(el, x); }); else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  function svg(d) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p); return s; }
  function api(method, path, body) {
    return fetch('/api/' + path, { method: method, headers: body ? { 'content-type': 'application/json', 'x-cs-social': '1' } : { 'x-cs-social': '1' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong.'); e.status = r.status; throw e; } return j; }); });
  }
  var toastTimer;
  function toast(t) { var el = document.getElementById('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('on'); }, 2800); }
  function ago(t) {
    var s = (Date.now() - t) / 1000;
    if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h';
    var d = new Date(t); return d.toLocaleDateString(undefined, s < 31536000 ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function avatar(p, big) {
    var a = h('a', { class: 'avatar' + (big ? ' big' : ''), href: '/@' + p.name, 'aria-label': p.display, onclick: link });
    if (p.avatar) a.appendChild(h('img', { src: p.avatar, alt: '', width: big ? 88 : 48, height: big ? 88 : 48, loading: 'lazy' })); else a.textContent = (p.display || p.name)[0];
    return a;
  }
  function richText(text) { // links, @names and #tags become links; everything else stays text
    var out = [], re = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])|(^|[\s(])@([a-z0-9][a-z0-9-]{1,18}[a-z0-9])\b|(^|[\s(])#([\p{L}\p{N}_]{1,64})/gu, last = 0, m;
    while ((m = re.exec(text))) {
      var lead = m[2] || m[4] || '', start = m.index + lead.length;
      out.push(text.slice(last, start));
      if (m[1]) out.push(h('a', { href: m[1], target: '_blank', rel: 'noopener nofollow ugc', text: m[1].replace(/^https?:\/\//, '') }));
      else if (m[3]) out.push(h('a', { href: '/@' + m[3], onclick: link, text: '@' + m[3] }));
      else out.push(h('a', { href: '/tag/' + encodeURIComponent(m[5].toLowerCase()), onclick: link, text: '#' + m[5] }));
      last = m.index + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  }
  function head(title, back) {
    return h('header', { class: 'head' }, back ? h('button', { class: 'back', type: 'button', 'aria-label': 'Back', onclick: function () { history.length > 1 ? history.back() : go('/'); }, text: '←' }) : null, h('h1', { text: title }));
  }
  function empty(title, text, extra) { return h('div', { class: 'empty' }, h('h2', { class: 'display', text: title }), h('p', { text: text }), extra); }
  function needSignIn() { return empty('Join in', 'Sign in or make an account to follow people, post and reply.', h('p', {}, h('a', { class: 'btn primary', href: '/join', onclick: link, text: 'Make an account' }), ' ', h('a', { class: 'btn', href: '/signin', onclick: link, text: 'Sign in' }))); }

  // ---------------------------------------------------------------- posts
  function postEl(p, o) {
    o = o || {};
    if (p.removed) return h('article', { class: 'post' }, h('div'), h('p', { class: 'removed', text: 'This post was removed.' }));
    var el = h('article', { class: 'post' + (o.focus ? ' focus' : ''), 'aria-label': p.author.display + ': ' + p.text.slice(0, 80) });
    if (p.repostedBy) el.appendChild(h('p', { class: 'note', text: '↻ ' + p.repostedBy.display + ' reposted' }));
    var body = h('div', {},
      h('div', { class: 'who' }, h('a', { href: '/@' + p.author.name, onclick: link }, h('b', { text: p.author.display })), p.author.title ? h('span', { class: 'tag-title', text: p.author.title }) : null, p.author.agent ? h('span', { class: 'tag-agent', title: 'Run by ' + (p.author.operator || 'a person'), text: 'Assistant' }) : null,
        h('small', { text: '@' + p.author.name }), h('small', { text: '·' }), h('a', { href: '/post/' + p.id, onclick: link }, h('small', {}, h('time', { datetime: new Date(p.created).toISOString(), title: new Date(p.created).toLocaleString(), text: ago(p.created) })))),
      p.text ? h('p', { class: 'text' }, richText(p.text)) : null,
      p.images.length ? h('div', { class: 'pics n' + p.images.length }, p.images.map(function (i) { return h('img', { src: i.url, alt: i.alt, loading: 'lazy' }); })) : null,
      p.community ? h('a', { class: 'community-chip', href: '/c/' + p.community.slug, onclick: link, text: 'in ' + p.community.name }) : null,
      actions(p));
    el.appendChild(avatar(p.author)); el.appendChild(body);
    if (!o.focus) el.addEventListener('click', function (e) { if (!e.target.closest('a, button, img.avatar')) go('/post/' + p.id); });
    return el;
  }
  function actions(p) {
    function act(kind, label, on, n, fn) {
      var b = h('button', { class: 'act' + (on ? ' on' : ''), type: 'button', 'aria-label': label + (n ? ', ' + n : ''), 'aria-pressed': kind === 'reply' ? null : String(!!on), onclick: fn }, svg(ICON[kind]), h('span', { text: n ? String(n) : '' }));
      return b;
    }
    function toggle(kind) {
      return function (e) {
        if (!me) return go('/join');
        var b = e.currentTarget;
        api('POST', 'posts/' + p.id + '/' + kind).then(function (r) {
          var on = kind === 'like' ? r.post.liked : r.post.reposted, n = kind === 'like' ? r.post.likes : r.post.reposts;
          b.classList.toggle('on', on); b.classList.toggle('pop', on); b.setAttribute('aria-pressed', String(on)); b.lastChild.textContent = n ? String(n) : '';
        }).catch(function (err) { toast(err.message); });
      };
    }
    return h('div', { class: 'actions' },
      act('reply', 'Reply', false, p.replies, function () { me ? compose({ replyTo: p }) : go('/join'); }),
      act('repost', 'Repost', p.reposted, p.reposts, toggle('repost')),
      act('like', 'Like', p.liked, p.likes, toggle('like')),
      h('button', { class: 'act more-act', type: 'button', 'aria-label': 'More', onclick: function () { more(p); } }, svg(ICON.more)));
  }
  function more(p) {
    if (!me) return go('/join');
    if (p.mine) { if (confirm('Delete this post? It is removed from your account too.')) api('DELETE', 'posts/' + p.id).then(function () { toast('Deleted'); route(); }).catch(function (e) { toast(e.message); }); return; }
    var reason = prompt('What is wrong with this post? A moderator will read it.');
    if (reason) api('POST', 'reports', { post: p.id, reason: reason }).then(function () { toast('Thank you. A moderator will look at it.'); }).catch(function (e) { toast(e.message); });
  }
  function feedList(kind, intro) {
    var wrap = h('div'), list = h('div'), btn = h('button', { class: 'more', type: 'button', text: 'Show more', hidden: true });
    var before = '';
    function load() {
      btn.disabled = true;
      api('GET', 'feed?kind=' + encodeURIComponent(kind) + (before ? '&before=' + before : '')).then(function (r) {
        if (!r.posts.length && !before) list.appendChild(intro || empty('Quiet here', 'Nothing has been posted yet.'));
        r.posts.forEach(function (p) { list.appendChild(postEl(p)); });
        if (r.posts.length) before = r.posts[r.posts.length - 1].t;
        btn.hidden = r.posts.length < 30; btn.disabled = false;
      }).catch(function (e) { list.appendChild(empty('Not now', e.message)); });
    }
    btn.addEventListener('click', load);
    load();
    wrap.appendChild(list); wrap.appendChild(btn);
    return wrap;
  }
  function tabs(items, current) { return h('nav', { class: 'tabs' }, items.map(function (i) { return h('a', { href: i[0], onclick: link, 'aria-current': i[0] === current ? 'page' : null, text: i[1] }); })); }

  // ---------------------------------------------------------------- the composer
  function compose(o) {
    o = o || {};
    var d = document.getElementById('composer'), files = [];
    d.textContent = '';
    var ta = h('textarea', { 'aria-label': o.replyTo ? 'Your reply' : 'What are you making?', placeholder: o.replyTo ? 'Write your reply' : 'What are you making?', maxlength: 600 });
    var count = h('span', { class: 'count', text: '300' }), send = h('button', { class: 'btn primary', type: 'button', text: o.replyTo ? 'Reply' : 'Post', disabled: true }), err = h('span', { class: 'error' });
    var thumbs = h('div', { class: 'thumbs' }), picker = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', multiple: true, hidden: true });
    var where = null;
    function update() { var n = 300 - [...ta.value].length; count.textContent = String(n); count.classList.toggle('over', n < 0); send.disabled = n < 0 || (!ta.value.trim() && !files.length); }
    function drawThumbs() {
      thumbs.textContent = '';
      files.forEach(function (f, i) {
        var alt = h('input', { placeholder: 'Describe it', 'aria-label': 'Description of image ' + (i + 1), value: f.alt, oninput: function (e) { f.alt = e.target.value; } });
        thumbs.appendChild(h('figure', {}, h('img', { src: 'data:' + f.type + ';base64,' + f.data, alt: '' }), h('button', { type: 'button', 'aria-label': 'Remove image', text: '×', onclick: function () { files.splice(i, 1); drawThumbs(); update(); } }), alt));
      });
    }
    picker.addEventListener('change', function () {
      Array.from(picker.files).slice(0, 4 - files.length).forEach(function (f) {
        if (f.size > 1000000) return toast(f.name + ' is over 1 MB.');
        var r = new FileReader(); r.onload = function () { files.push({ type: f.type, data: String(r.result).split(',')[1], alt: '' }); drawThumbs(); update(); }; r.readAsDataURL(f);
      });
      picker.value = '';
    });
    ta.addEventListener('input', update);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !send.disabled) send.click(); });
    if (!o.replyTo && status.communities && status.communities.length) {
      where = h('select', { 'aria-label': 'Post to' }, h('option', { value: '', text: 'Everyone' }), status.communities.map(function (c) { return h('option', { value: c.slug, text: c.name, selected: o.community === c.slug }); }));
    }
    send.addEventListener('click', function () {
      send.disabled = true; err.textContent = '';
      api('POST', 'posts', { text: ta.value, replyTo: o.replyTo ? o.replyTo.id : undefined, images: files, community: where && where.value ? where.value : (o.community || undefined) })
        .then(function () { d.close(); toast(o.replyTo ? 'Replied' : 'Posted'); route(); })
        .catch(function (e) { err.textContent = e.message; send.disabled = false; });
    });
    d.appendChild(h('div', { class: 'compose' },
      o.replyTo ? h('p', { class: 'replying', text: 'Replying to @' + o.replyTo.author.name }) : null,
      avatar(me), ta, thumbs,
      h('div', { class: 'compose-bar' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Add pictures', onclick: function () { picker.click(); } }, svg(ICON.image)), picker, where, err, count,
        h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: function () { d.close(); } }), send)));
    d.showModal(); ta.focus();
  }

  // ---------------------------------------------------------------- views
  var V = {};
  V.home = function () {
    if (!me) return go('/everyone', true);
    return [head('Home'), tabs([['/', 'Following'], ['/everyone', 'Everyone']], '/'),
      feedList('home', empty('Your home feed', 'Follow people to see their posts here. Start with Everyone.', h('a', { class: 'btn primary', href: '/everyone', onclick: link, text: 'See everyone' })))];
  };
  V.everyone = function () { return [head('Everyone'), me ? tabs([['/', 'Following'], ['/everyone', 'Everyone']], '/everyone') : null, feedList('everyone')]; };
  V.tag = function (t) { return [head('#' + t, true), feedList('tag:' + t, empty('#' + t, 'No posts with this tag yet.'))]; };
  V.post = function (id) {
    var box = h('div');
    api('GET', 'posts/' + id).then(function (r) {
      r.ancestors.forEach(function (p) { box.appendChild(postEl(p)); });
      box.appendChild(postEl(r.post, { focus: true }));
      if (me && !r.post.removed) box.appendChild(h('div', { class: 'section' }, h('button', { class: 'btn', type: 'button', text: 'Write a reply', onclick: function () { compose({ replyTo: r.post }); } })));
      r.replies.forEach(function (p) { box.appendChild(postEl(p)); });
    }).catch(function (e) { box.appendChild(empty('Not here', e.message)); });
    return [head('Post', true), box];
  };
  V.user = function (name) {
    var box = h('div');
    api('GET', 'users/' + encodeURIComponent(name)).then(function (r) {
      var u = r.user, mine = me && me.name === u.name;
      var follow = h('button', { class: 'btn' + (u.followed ? '' : ' primary'), type: 'button', text: u.followed ? 'Following' : 'Follow' });
      follow.addEventListener('click', function () {
        if (!me) return go('/join');
        api('POST', 'users/' + u.name + '/follow').then(function (x) { follow.textContent = x.user.followed ? 'Following' : 'Follow'; follow.classList.toggle('primary', !x.user.followed); counts.firstChild.firstChild.textContent = x.user.followers; });
      });
      var counts = h('p', { class: 'counts' }, h('span', {}, h('b', { text: String(u.followers) }), ' followers'), h('span', {}, h('b', { text: String(u.following) }), ' following'), h('span', {}, h('b', { text: String(u.posts) }), ' posts'));
      box.appendChild(h('div', { class: 'cover' }));
      box.appendChild(h('section', { class: 'prof' },
        h('div', { class: 'prof-top' }, avatar(u, true), mine ? h('a', { class: 'btn', href: '/settings', onclick: link, text: 'Edit profile' }) : h('div', {},
          me && u.followsYou ? h('a', { class: 'btn', href: '/messages/' + u.name, onclick: link, text: 'Message' }) : null, ' ', follow)),
        h('h2', {}, u.display, u.title ? h('span', { class: 'tag-title', text: u.title }) : null, u.agent ? h('span', { class: 'tag-agent', text: 'Assistant' }) : null),
        u.title ? h('p', { class: 'handle', text: u.title + ' of Mundus Novus' }) : null,
        h('div', { class: 'handle', text: '@' + u.name + (u.followsYou ? ' · follows you' : '') }),
        u.agent ? h('p', { class: 'handle', text: 'An assistant account, run by ' + u.operator + '.' }) : null,
        u.bio ? h('p', { class: 'bio' }, richText(u.bio)) : null,
        u.suspended ? h('p', { class: 'error', text: 'This account is suspended.' }) : null,
        counts));
      if (!r.posts.length) box.appendChild(empty('No posts yet', mine ? 'Share the first thing you make.' : u.display + ' has not posted yet.'));
      r.posts.forEach(function (p) { box.appendChild(postEl(p)); });
    }).catch(function (e) { box.appendChild(empty('Not here', e.message)); });
    return [head('@' + name, true), box];
  };
  V.me = function () { return me ? go('/@' + me.name, true) : go('/signin', true); };
  V.search = function () {
    var q = new URLSearchParams(location.search).get('q') || '', results = h('div');
    var input = h('input', { type: 'search', value: q, placeholder: 'People and posts', 'aria-label': 'Search' });
    var form = h('form', { class: 'section', role: 'search', onsubmit: function (e) { e.preventDefault(); go('/search?q=' + encodeURIComponent(input.value)); } }, h('div', { class: 'field' }, input));
    if (q) api('GET', 'search?q=' + encodeURIComponent(q)).then(function (r) {
      r.people.forEach(function (u) { results.appendChild(h('a', { class: 'row', href: '/@' + u.name, onclick: link }, avatar(u), h('div', { class: 'grow' }, h('b', { text: u.display }), h('small', { text: '@' + u.name + (u.bio ? ' · ' + u.bio : '') })))); });
      r.posts.forEach(function (p) { results.appendChild(postEl(p)); });
      if (!r.people.length && !r.posts.length) results.appendChild(empty('Nothing found', 'Try another word.'));
    });
    setTimeout(function () { if (!q) input.focus(); });
    return [head('Search'), form, results];
  };
  V.notifications = function () {
    if (!me) return needSignIn();
    var box = h('div'), words = { like: [ICON.like, 'liked your post'], repost: [ICON.repost, 'reposted your post'], reply: [ICON.reply, 'replied'], mention: [ICON.reply, 'mentioned you'], follow: ['', 'followed you'], share: ['', 'shared with you in MNCloud'] };
    api('GET', 'notifications').then(function (r) {
      if (!r.notifications.length) box.appendChild(empty('Nothing yet', 'Likes, replies and new followers will show up here.'));
      r.notifications.forEach(function (n) {
        var w = words[n.kind] || ['', n.kind];
        box.appendChild(h('a', { class: 'row' + (n.read ? '' : ' unread'), href: n.url && /^https:\/\/cloud\.mundusnovus\.org\//.test(n.url) ? n.url : n.post ? '/post/' + n.post.id : '/@' + n.actor.name, onclick: n.url ? null : link },
          avatar(n.actor), h('div', { class: 'grow' }, h('span', {}, h('b', { text: n.actor.display }), ' ' + w[1]), h('small', { text: n.detail || (n.post ? n.post.text : ago(n.created)) })), h('small', { text: ago(n.created) })));
      });
      api('POST', 'notifications/read').then(refreshMe);
    });
    return [head('Notifications'), box];
  };
  V.messages = function (name) {
    if (!me) return needSignIn();
    if (name) {
      var chat = h('div', { class: 'chat' }), input = h('input', { placeholder: 'Write a message', 'aria-label': 'Message', maxlength: 2000 });
      function draw(r) { chat.textContent = ''; r.messages.forEach(function (m) { chat.appendChild(h('div', { class: 'bubble' + (m.mine ? ' mine' : ''), title: new Date(m.created).toLocaleString(), text: m.text })); }); window.scrollTo(0, document.body.scrollHeight); }
      api('GET', 'messages/' + encodeURIComponent(name)).then(draw).catch(function (e) { chat.appendChild(empty('Not here', e.message)); });
      var form = h('form', { class: 'chat-form', onsubmit: function (e) { e.preventDefault(); if (!input.value.trim()) return; api('POST', 'messages/' + encodeURIComponent(name), { text: input.value }).then(function (r) { input.value = ''; draw(r); }).catch(function (e2) { toast(e2.message); }); } },
        input, h('button', { class: 'btn primary', type: 'submit', text: 'Send' }));
      return [head('@' + name, true), chat, form];
    }
    var box = h('div');
    api('GET', 'messages').then(function (r) {
      if (!r.conversations.length) box.appendChild(empty('No messages', 'Open a profile of someone who follows you and choose Message.'));
      r.conversations.forEach(function (c) {
        box.appendChild(h('a', { class: 'row' + (c.unread ? ' unread' : ''), href: '/messages/' + c.with.name, onclick: link }, avatar(c.with),
          h('div', { class: 'grow' }, h('b', { text: c.with.display }), h('small', { text: (c.last.mine ? 'You: ' : '') + c.last.text })), h('small', { text: ago(c.last.created) })));
      });
    });
    return [head('Messages'), box];
  };
  V.communities = function () {
    var box = h('div');
    api('GET', 'communities').then(function (r) {
      status.communities = r.communities.filter(function (c) { return c.joined; });
      if (me) {
        var name = h('input', { placeholder: 'Name', 'aria-label': 'Community name', maxlength: 48 }), about = h('input', { placeholder: 'What is it for?', 'aria-label': 'What it is for', maxlength: 300 });
        box.appendChild(h('form', { class: 'section', onsubmit: function (e) { e.preventDefault(); api('POST', 'communities', { name: name.value, about: about.value }).then(function (x) { go('/c/' + x.community.slug); }).catch(function (e2) { toast(e2.message); }); } },
          h('h3', { text: 'Start a community' }), h('div', { class: 'field' }, name), h('div', { class: 'field' }, about), h('div', {}, h('button', { class: 'btn primary', type: 'submit', text: 'Start it' }))));
      }
      if (!r.communities.length) box.appendChild(empty('No communities yet', 'A parish, a club, a project: start the first one.'));
      r.communities.forEach(function (c) { box.appendChild(h('a', { class: 'row', href: '/c/' + c.slug, onclick: link }, h('div', { class: 'avatar', text: c.name[0] }), h('div', { class: 'grow' }, h('b', { text: c.name }), h('small', { text: c.members + ' members' + (c.about ? ' · ' + c.about : '') })), c.joined ? h('small', { text: 'Joined' }) : null)); });
    });
    return [head('Communities'), box];
  };
  V.community = function (slug) {
    var top = h('div');
    api('GET', 'communities/' + encodeURIComponent(slug)).then(function (r) {
      var c = r.community, join = h('button', { class: 'btn' + (c.joined ? '' : ' primary'), type: 'button', text: c.joined ? 'Joined' : 'Join' });
      join.addEventListener('click', function () { if (!me) return go('/join'); api('POST', 'communities/' + slug + '/join').then(function (x) { join.textContent = x.community.joined ? 'Joined' : 'Join'; join.classList.toggle('primary', !x.community.joined); }); });
      top.appendChild(h('section', { class: 'section' }, h('h2', { class: 'display', text: c.name }), c.about ? h('p', { text: c.about }) : null, h('p', { class: 'counts', text: c.members + ' members' }),
        h('div', {}, join, ' ', me ? h('button', { class: 'btn', type: 'button', text: 'Post here', onclick: function () { compose({ community: slug }); } }) : null)));
    });
    return [head('Community', true), top, feedList('community:' + slug, empty('Quiet here', 'No posts in this community yet.'))];
  };
  function authForm(kind) {
    var err = h('p', { class: 'error', role: 'alert' }), fields = {};
    function field(name, label, attrs) { fields[name] = h('input', Object.assign({ name: name, required: true }, attrs)); return h('label', { class: 'field' }, label, fields[name]); }
    var agent = h('input', { type: 'checkbox' }), operator = h('label', { class: 'field', hidden: true }, 'Who runs it?', fields.operator = h('input', { maxlength: 64, placeholder: 'Your name or @name' }));
    agent.addEventListener('change', function () { operator.hidden = !agent.checked; });
    var form = h('form', { class: 'form' });
    if (kind === 'join') form.append(h('h2', { class: 'display', text: 'Make your account' }), h('p', { text: 'One Mundus Novus account for Social, Sprite, Box and everything we make. Your name is also your address on the AT Protocol: @name.' + (status.handleDomain || 'pds.mundusnovus.org') + '. No email, no phone number.' }),
      field('name', 'Name', { autocomplete: 'username', pattern: '[a-z0-9][a-z0-9-]{1,18}[a-z0-9]', maxlength: 20, autocapitalize: 'none', spellcheck: 'false' }), field('display', 'Display name', { required: false, maxlength: 64 }),
      field('password', 'Password', { type: 'password', autocomplete: 'new-password', minlength: 10 }),
      h('label', { class: 'check' }, agent, h('span', { text: 'This account is run by an assistant. It will be labelled and can post up to six times an hour.' })), operator,
      h('label', { class: 'check' }, h('input', { type: 'checkbox', required: true }), h('span', {}, 'I will follow the ', h('a', { href: '/rules', onclick: link, text: 'rules' }), '.')));
    else if (kind === 'signin') form.append(h('h2', { class: 'display', text: 'Sign in' }), h('p', { text: 'With your Mundus Novus account.' }), field('name', 'Name', { autocomplete: 'username', autocapitalize: 'none' }), field('password', 'Password', { type: 'password', autocomplete: 'current-password' }));
    else form.append(h('h2', { class: 'display', text: 'Recover your account' }), h('p', { text: 'Use one of the recovery codes you saved when you made your account.' }),
      field('name', 'Name', { autocapitalize: 'none' }), field('code', 'Recovery code', { autocomplete: 'off', autocapitalize: 'none' }), field('password', 'New password', { type: 'password', autocomplete: 'new-password', minlength: 10 }));
    var submit = h('button', { class: 'btn primary', type: 'submit', text: kind === 'join' ? 'Make my account' : kind === 'signin' ? 'Sign in' : 'Set new password' });
    form.append(err, submit, h('p', {}, kind === 'signin' ? [h('a', { href: '/join' + location.search, onclick: link, text: 'Make an account' }), ' · ', h('a', { href: '/recover', onclick: link, text: 'Lost your password?' })] : h('a', { href: '/signin' + location.search, onclick: link, text: 'I have an account' })));
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = ''; submit.disabled = true;
      var body = {}; for (var k in fields) body[k] = fields[k].value;
      body.name = (body.name || '').toLowerCase().trim(); body.agent = agent.checked;
      api('POST', kind === 'join' ? 'signup' : kind === 'signin' ? 'login' : 'recover', body).then(function (r) {
        me = r.user; paintNav();
        if (r.recoveryCodes) return showCodes(r.recoveryCodes, 'Welcome, ' + r.user.display);
        if (!back()) go('/', true);
      }).catch(function (x) { err.textContent = x.message; submit.disabled = false; });
    });
    return form;
  }
  function showCodes(list, title) {
    var text = 'Recovery codes for @' + me.name + '\n\n' + list.join('\n') + '\n\nEach code works once. Keep them somewhere safe.';
    view.textContent = '';
    add(view, [head(title), h('div', { class: 'form' }, h('p', { text: 'These codes are the only way back into your account if you forget your password. Save them now: we cannot show them again.' }),
      h('div', { class: 'codes' }, list.map(function (c) { return h('span', { text: c }); })),
      h('div', {}, h('a', { class: 'btn', download: 'social-recovery-codes.txt', href: 'data:text/plain;charset=utf-8,' + encodeURIComponent(text), text: 'Download them' }), ' ',
        h('button', { class: 'btn primary', type: 'button', text: 'I saved them', onclick: function () { if (!back()) go('/', true); } })))]);
  }
  V.join = function () { return me ? (back() ? null : go('/', true)) : [head('Join'), authForm('join')]; };
  V.signin = function () { return me ? (back() ? null : go('/', true)) : [head('Sign in'), authForm('signin')]; };
  V.recover = function () { return [head('Recover'), authForm('recover')]; };
  V.settings = function () {
    if (!me) return needSignIn();
    var display = h('input', { value: me.display, maxlength: 64 }), bio = h('textarea', { rows: 3, maxlength: 256, text: me.bio || '' }), pic = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
    var saveP = h('form', { class: 'section', onsubmit: function (e) {
      e.preventDefault();
      var f = pic.files[0], send = function (avatarData) { api('POST', 'me/profile', { display: display.value, bio: bio.value, avatar: avatarData }).then(function (r) { me = Object.assign(me, r.user); toast('Saved'); paintNav(); }).catch(function (x) { toast(x.message); }); };
      if (!f) return send(); var rd = new FileReader(); rd.onload = function () { send({ type: f.type, data: String(rd.result).split(',')[1] }); }; rd.readAsDataURL(f);
    } }, h('h3', { text: 'Profile' }), h('label', { class: 'field' }, 'Display name', display), h('label', { class: 'field' }, 'About you', bio), h('label', { class: 'field' }, 'Picture (up to 1 MB)', pic), h('div', {}, h('button', { class: 'btn primary', type: 'submit', text: 'Save' })));
    var keysBox = h('div', { class: 'section' }, h('h3', { text: 'Keys for assistants and apps' }), h('p', { text: 'A key lets a program post as this account through the API. Anyone with the key can, so keep it private.' }));
    var keyList = h('div'), label = h('input', { placeholder: 'What is it for?', maxlength: 40, 'aria-label': 'Key label' }), shown = h('p', { class: 'codes', hidden: true });
    function drawKeys(list) { keyList.textContent = ''; list.forEach(function (k) { keyList.appendChild(h('div', { class: 'row' }, h('div', { class: 'grow' }, h('b', { text: k.label }), h('small', { text: 'Made ' + ago(k.created) + (k.used ? ', last used ' + ago(k.used) : ', never used') })), h('button', { class: 'btn', type: 'button', text: 'Revoke', onclick: function () { api('DELETE', 'me/keys/' + k.id).then(function (r) { drawKeys(r.keys); }); } }))); }); }
    api('GET', 'me/keys').then(function (r) { drawKeys(r.keys); });
    keysBox.append(keyList, h('div', { class: 'field' }, label), shown, h('div', {}, h('button', { class: 'btn', type: 'button', text: 'Make a key', onclick: function () { api('POST', 'me/keys', { label: label.value }).then(function (r) { shown.hidden = false; shown.textContent = r.key + '  (copy it now; it is shown once)'; drawKeys(r.keys); }); } })));
    var pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Your password' });
    var codesBox = h('form', { class: 'section', onsubmit: function (e) { e.preventDefault(); api('POST', 'me/recovery', { password: pw.value }).then(function (r) { showCodes(r.recoveryCodes, 'New recovery codes'); }).catch(function (x) { toast(x.message); }); } },
      h('h3', { text: 'Recovery codes' }), h('p', { text: 'Make a new set. The old codes stop working.' }), h('label', { class: 'field' }, 'Your password', pw), h('div', {}, h('button', { class: 'btn', type: 'submit', text: 'Make new codes' })));
    var out = h('div', { class: 'section' }, h('button', { class: 'btn', type: 'button', text: 'Sign out', onclick: function () { api('POST', 'logout').then(function () { me = null; paintNav(); go('/everyone', true); }); } }),
      me.admin ? h('a', { class: 'btn', href: '/moderation', onclick: link, text: 'Moderation' }) : null);
    return [head('Settings'), saveP, keysBox, codesBox, out];
  };
  V.moderation = function () {
    var box = h('div'), peopleBox = h('div');
    api('GET', 'admin/reports').then(function (r) {
      box.appendChild(h('div', { class: 'section' }, h('h3', { text: 'Reports' })));
      if (!r.reports.length) box.appendChild(empty('All clear', 'No open reports.'));
      r.reports.forEach(function (x) {
        function act(a) { return h('button', { class: 'btn', type: 'button', text: a[0].toUpperCase() + a.slice(1), onclick: function () { api('POST', 'admin/reports/' + x.id, { action: a, note: prompt('A short note for the record (optional)') || '' }).then(function () { toast('Done'); route(); }).catch(function (e) { toast(e.message); }); } }); }
        box.appendChild(h('section', { class: 'section' }, h('p', {}, h('b', { text: '@' + x.reporter.name }), ' reported ', h('b', { text: '@' + x.user.name }), ': ' + x.reason), x.post ? postEl(x.post) : null,
          h('div', {}, x.post ? act('remove') : null, ' ', act('suspend'), ' ', act('dismiss'))));
      });
    }).catch(function (e) { box.appendChild(empty('Not for you', e.message)); });
    if (me && me.role === 'owner') {
      // the owner's tools: roles, titles, suspending and restoring accounts
      var q = h('input', { type: 'search', placeholder: 'Find a person', 'aria-label': 'Find a person' }), list = h('div');
      function draw(p) {
        var role = h('select', { 'aria-label': 'Role for @' + p.name, disabled: p.pinned }, ['member', 'moderator', 'owner'].map(function (r) { return h('option', { value: r, text: r[0].toUpperCase() + r.slice(1), selected: p.role === r }); }));
        var title = h('input', { value: p.title || '', placeholder: 'Title (shown on their posts)', maxlength: 48, 'aria-label': 'Title for @' + p.name, disabled: p.pinned });
        var save = h('button', { class: 'btn', type: 'button', text: 'Save', disabled: p.pinned, onclick: function () { api('POST', 'admin/people/' + p.name, { role: role.value, title: title.value }).then(function () { toast('Saved'); }).catch(function (e) { toast(e.message); }); } });
        var sus = h('button', { class: 'btn', type: 'button', text: p.suspended ? 'Restore account' : 'Suspend', hidden: p.name === me.name, onclick: function () {
          if (!p.suspended && !confirm('Suspend @' + p.name + '? They are signed out everywhere until you restore them.')) return;
          api('POST', 'admin/people/' + p.name, { suspended: !p.suspended }).then(function (r) { p = r.person; row.replaceWith(draw(p)); toast(p.suspended ? 'Suspended' : 'Restored'); }).catch(function (e) { toast(e.message); }); } });
        var row = h('div', { class: 'section person-row' }, h('div', { class: 'row', style: 'padding:0;border:0' }, avatar(p), h('div', { class: 'grow' }, h('b', { text: p.display }), h('small', { text: '@' + p.name + (p.suspended ? ' · suspended' : '') + (p.pinned ? ' · set on the server' : '') }))),
          h('div', { class: 'person-tools' }, role, title, save, sus));
        return row;
      }
      function find() { api('GET', 'admin/people?q=' + encodeURIComponent(q.value)).then(function (r) { list.textContent = ''; r.people.forEach(function (p) { list.appendChild(draw(p)); }); }).catch(function (e) { toast(e.message); }); }
      q.addEventListener('input', function () { clearTimeout(q.t); q.t = setTimeout(find, 250); });
      peopleBox.append(h('div', { class: 'section' }, h('h3', { text: 'People' }), h('p', { text: 'As the owner you choose who moderates and the titles people carry, and you can suspend or restore any account.' }), h('div', { class: 'field' }, q)), list);
      find();
    }
    return [head('Moderation', true), peopleBox, box];
  };
  V.rules = function () {
    return [head('Rules', true), h('div', { class: 'form' }, h('h2', { class: 'display', text: 'Be good to each other' }),
      h('p', { text: 'Social is a place to share what you make and to look after one another. Treat every person with the dignity they are owed.' }),
      h('ul', {}, ['No threats, harassment, or hatred toward anyone.', 'No sexual content, gore, or anything that exploits children.', 'No scams, spam, malware, stolen work or piracy.', 'No impersonation. Assistant accounts say so and name who runs them.', 'Nothing illegal.'].map(function (t) { return h('li', { text: t }); })),
      h('p', { text: 'Report anything that breaks these rules from the … menu on a post. Moderators can remove posts and suspend accounts, and they write down why.' }))];
  };

  // ---------------------------------------------------------------- routing
  function go(path, replace) { history[replace ? 'replaceState' : 'pushState'](null, '', path); route(); return null; }
  function link(e) { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go(e.currentTarget.getAttribute('href')); }
  function route() {
    var p = location.pathname.replace(/^\//, ''), m, out, nav = p.split('/')[0] || 'home';
    if (!p) out = V.home();
    else if ((m = /^@([a-z0-9-]+)$/.exec(p))) { out = V.user(m[1]); nav = me && me.name === m[1] ? 'me' : ''; }
    else if ((m = /^post\/(\d+)$/.exec(p))) out = V.post(m[1]);
    else if ((m = /^tag\/(.+)$/.exec(p))) out = V.tag(decodeURIComponent(m[1]));
    else if ((m = /^c\/([a-z0-9-]+)$/.exec(p))) { out = V.community(m[1]); nav = 'communities'; }
    else if ((m = /^messages\/([a-z0-9-]+)$/.exec(p))) { out = V.messages(m[1]); nav = 'messages'; }
    else if (V[p]) out = V[p]();
    else out = [head('Not here', true), empty('Not here', 'There is nothing at this address.')];
    if (out === null) return;
    view.textContent = ''; add(view, out);
    document.querySelectorAll('.rail a[data-nav]').forEach(function (a) { a.setAttribute('aria-current', a.dataset.nav === nav ? 'page' : 'false'); });
    document.title = (view.querySelector('h1') ? view.querySelector('h1').textContent + ' · ' : '') + 'Social';
    window.scrollTo(0, 0);
  }
  function paintNav() {
    document.querySelectorAll('[data-auth]').forEach(function (el) { el.hidden = !me; });
    document.querySelectorAll('[data-guest]').forEach(function (el) { el.hidden = !!me; });
    var badge = document.getElementById('badge'); badge.hidden = !(me && me.unread); if (me) badge.textContent = me.unread > 99 ? '99+' : String(me.unread);
    var card = document.getElementById('sideCard'); card.textContent = '';
    if (me) add(card, [h('h2', { class: 'display', text: 'Make something' }), h('p', { text: 'Draw in Sprite or write a song in Box, then share it here.' }), h('p', {}, h('a', { href: SUB('sprite') + '/app/', text: 'Open Sprite' }), ' · ', h('a', { href: SUB('box') + '/app/', text: 'Open Box' }))]);
    else add(card, [h('h2', { class: 'display', text: 'New here?' }), h('p', { text: 'A calm place to share what you make. Your account lives on the open AT Protocol, so it is yours to keep.' }),
      h('a', { class: 'btn primary', href: '/join', onclick: link, text: 'Make an account' }), h('a', { class: 'btn', href: '/signin', onclick: link, text: 'Sign in' })]);
  }
  function refreshMe() { return api('GET', 'me').then(function (r) { me = r.user; paintNav(); }); }
  document.querySelectorAll('.rail a, .side-foot a[data-local]').forEach(function (a) { a.addEventListener('click', link); });
  document.querySelectorAll('[data-main]').forEach(function (a) { a.href = MAIN + a.dataset.main; });
  document.getElementById('composeBtn').addEventListener('click', function () { compose(); });
  document.querySelector('.side-search').addEventListener('submit', function (e) { e.preventDefault(); go('/search?q=' + encodeURIComponent(e.target.q.value)); });
  addEventListener('popstate', route);
  addEventListener('keydown', function (e) { if (e.key === 'n' && me && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.getElementById('composer').open) { e.preventDefault(); compose(); } });
  Promise.all([api('GET', 'status').then(function (s) { status = s; }).catch(function () {}), refreshMe().catch(function () {})]).then(function () {
    if (me) api('GET', 'communities').then(function (r) { status.communities = r.communities.filter(function (c) { return c.joined; }); }).catch(function () {});
    route();
    setInterval(function () { if (me && !document.hidden) refreshMe().catch(function () {}); }, 60000);
  });
})();
