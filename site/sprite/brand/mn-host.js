/* Mundus Novus host: the small layer every Mundus Novus app stands on, so the same app runs in a
   browser tab, as an installed web app, or inside our desktop shells for macOS, Windows and Linux.

   It provides window.csHost with:
     info                 { app, version, shell }
     fs.open / fs.save    files through the File System Access API, or a file picker and a download where that is missing
     fs.writeProject      writes into a project folder the person chose (or downloads, if they have not chosen one)
     fs.readFile          reopens a recent file (handles are kept in IndexedDB; the browser asks permission again)
     recent               the recent-files list
     request(path, body)  the assistant: talks to the Anthropic API directly, with the person's own key
     keys                 has() / prompt() / clear() for that key, kept only on this device
     window               setTitle, setDirty (warns before closing unsaved work), close

   Nothing leaves the device except the assistant's own requests to api.anthropic.com, and only when a key is set.
   Original code, Mundus Novus License 1.0 (GPL-3.0-only). */
(function () {
  'use strict';
  if (window.csHost) return;
  var APP = (document.documentElement.dataset.app || 'app'), KEY = 'mn.anthropic.key', MODEL = 'mn.anthropic.model';
  var dirty = false, project = null, native = window.csNative || null;

  // ---------------------------------------------------------------- small IndexedDB store for file handles
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no IndexedDB'));
      var r = indexedDB.open('mn-host', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function kv(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction('kv', mode), s = t.objectStore('kv'), q = fn(s); t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { rej(t.error); }; }); }); }
  var idb = { get: function (k) { return kv('readonly', function (s) { return s.get(k); }).catch(function () { return null; }); },
              set: function (k, v) { return kv('readwrite', function (s) { s.put(v, k); }).catch(function () {}); } };
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                set: function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };

  // ---------------------------------------------------------------- bytes
  function b64ToBytes(b) { return Uint8Array.from(atob(b), function (c) { return c.charCodeAt(0); }); }
  function bytesToB64(u8) { var s = '', k = 0x8000; for (var i = 0; i < u8.length; i += k) s += String.fromCharCode.apply(null, u8.subarray(i, i + k)); return btoa(s); }
  function payload(data, enc) { return enc === 'base64' ? b64ToBytes(data) : typeof data === 'string' ? new TextEncoder().encode(data) : data; }
  function isText(name) { return /\.(json|gpl|hex|txt|md|csv|pal)$/i.test(name || ''); }
  async function readFile(file, binary) {
    var text = !binary || isText(file.name);
    if (text) return { name: file.name, path: file.name, binary: false, data: await file.text() };
    return { name: file.name, path: file.name, binary: true, data: bytesToB64(new Uint8Array(await file.arrayBuffer())) };
  }
  function accept(filters) {
    var ext = [];
    (filters || []).forEach(function (f) { (f.patterns || []).forEach(function (p) { var m = /\*(\.[\w.]+)$/.exec(p); if (m) ext.push(m[1]); }); });
    return ext;
  }

  // ---------------------------------------------------------------- recent files
  async function addRecent(name, handle) {
    var list = (await idb.get('recent:' + APP)) || [];
    list = list.filter(function (r) { return r.name !== name; });
    list.unshift({ path: name, name: name, handle: handle || null, at: Date.now() });
    await idb.set('recent:' + APP, list.slice(0, 12));
  }

  // ---------------------------------------------------------------- files
  var fs = {
    open: async function (o) {
      o = o || {};
      if (native && native.open) return native.open(o);
      if (window.showOpenFilePicker) {
        try {
          var ext = accept(o.filters), types = ext.length ? [{ description: (o.filters[0] && o.filters[0].name) || 'Files', accept: { 'application/octet-stream': ext } }] : undefined;
          var hs = await window.showOpenFilePicker({ types: types, excludeAcceptAllOption: false, multiple: false });
          var f = await hs[0].getFile(); await addRecent(f.name, hs[0]);
          var out = await readFile(f, o.binary); out.handle = hs[0]; return out;
        } catch (e) { if (e && e.name === 'AbortError') return null; }
      }
      return new Promise(function (resolve) {
        var i = document.createElement('input'); i.type = 'file'; i.accept = accept(o.filters).join(',');
        i.onchange = async function () { var f = i.files[0]; if (!f) return resolve(null); await addRecent(f.name, null); resolve(await readFile(f, o.binary)); };
        i.addEventListener('cancel', function () { resolve(null); });
        i.click();
      });
    },
    save: async function (o) {
      var bytes = payload(o.data, o.encoding), name = o.suggestedName || 'file';
      if (native && native.save) return native.save(o);
      if (window.showSaveFilePicker) {
        try {
          var h = o.handle || await window.showSaveFilePicker({ suggestedName: name });
          var w = await h.createWritable(); await w.write(bytes); await w.close();
          await addRecent(h.name, h); return { path: h.name, name: h.name, handle: h };
        } catch (e) { if (e && e.name === 'AbortError') return null; }
      }
      download(name, bytes); return { path: name, name: name };
    },
    writeProject: async function (path, data, o) {
      var bytes = payload(data, o && o.encoding);
      if (native && native.writeProject) return native.writeProject(path, data, o);
      if (project) {
        var parts = path.split('/').filter(Boolean), dir = project;
        for (var k = 0; k < parts.length - 1; k++) dir = await dir.getDirectoryHandle(parts[k], { create: true });
        var fh = await dir.getFileHandle(parts[parts.length - 1], { create: true }), w = await fh.createWritable();
        await w.write(bytes); await w.close(); return { path: path };
      }
      download(path.split('/').pop(), bytes); return { path: path };
    },
    chooseProject: async function () {
      if (!window.showDirectoryPicker) return null;
      try { project = await window.showDirectoryPicker({ mode: 'readwrite' }); await idb.set('project:' + APP, project); return project.name; } catch (e) { return null; }
    },
    readFile: async function (path, o) {
      var list = (await idb.get('recent:' + APP)) || [], r = list.filter(function (x) { return x.path === path; })[0];
      if (!r || !r.handle) throw new Error('This file can only be reopened from its folder. Use Open.');
      if (r.handle.requestPermission && (await r.handle.requestPermission({ mode: 'read' })) !== 'granted') throw new Error('permission was not given');
      var out = await readFile(await r.handle.getFile(), o && o.binary); out.handle = r.handle; return out;
    },
    listProject: function () { return Promise.resolve([]); }
  };
  function download(name, bytes) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes])); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  idb.get('project:' + APP).then(function (p) { if (p) project = p; });

  // ---------------------------------------------------------------- the assistant
  var keys = {
    has: function () { return !!store.get(KEY); },
    clear: function () { store.set(KEY, null); },
    model: function () { return store.get(MODEL) || 'claude-sonnet-5-5'; },
    prompt: function () {
      return new Promise(function (resolve) {
        var d = document.createElement('dialog'); d.className = 'mn-keys';
        d.innerHTML = '<form method="dialog"><h2>Your Anthropic key</h2>' +
          '<p>The assistant runs on your own key. It is stored only on this device and sent only to api.anthropic.com.</p>' +
          '<label>Key <input name="k" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-..."></label>' +
          '<label>Model <select name="m"><option value="claude-sonnet-5-5">Claude Sonnet 5.5</option><option value="claude-opus-5-5">Claude Opus 5.5</option><option value="claude-haiku-5-5">Claude Haiku 5.5</option></select></label>' +
          '<menu><button value="clear" type="submit">Remove key</button><span></span><button value="cancel" type="submit">Cancel</button><button value="ok" type="submit" class="primary">Save</button></menu></form>';
        document.body.appendChild(d);
        d.querySelector('[name=m]').value = keys.model();
        d.addEventListener('close', function () {
          var v = d.returnValue, k = d.querySelector('[name=k]').value.trim();
          if (v === 'ok') { if (k) store.set(KEY, k); store.set(MODEL, d.querySelector('[name=m]').value); }
          if (v === 'clear') keys.clear();
          d.remove(); resolve(keys.has());
        });
        d.showModal(); d.querySelector('[name=k]').focus();
      });
    }
  };
  async function request(path, body, o) {
    if (path === '/v1/status') { var has = keys.has(), k = {}; k[APP] = has; return { status: 200, json: { ok: true, key: k, model: keys.model() } }; }
    if (path !== '/v1/messages') return { status: 404, json: { error: { message: 'unknown path ' + path } } };
    var key = store.get(KEY);
    if (!key) { var e = new Error('no_key'); e.code = 'no_key'; throw e; }
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, (o && o.timeoutMs) || 300000);
    try {
      body = Object.assign({}, body, { model: keys.model() });
      var r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify(body)
      });
      var json = await r.json().catch(function () { return {}; });
      return { status: r.status, json: json };
    } finally { clearTimeout(timer); }
  }

  // ---------------------------------------------------------------- the window
  addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  var win = {
    setTitle: function (t) { document.title = t; if (native && native.setTitle) native.setTitle(t); },
    setDirty: function (d) { dirty = !!d; if (native && native.setDirty) native.setDirty(dirty); },
    close: function () { if (native && native.close) native.close(); else window.close(); }
  };

  window.csHost = {
    info: { app: APP, version: document.documentElement.dataset.version || '', shell: native ? native.name : (matchMedia('(display-mode: standalone)').matches ? 'installed' : 'browser'), projectDir: 'your chosen folder' },
    fs: fs, request: request, keys: keys, window: win,
    recent: {
      list: async function () { return ((await idb.get('recent:' + APP)) || []).map(function (r) { return { path: r.path, name: r.name }; }); },
      add: function (r) { return addRecent(r.name || r.path, r.handle); },
      clear: function () { return idb.set('recent:' + APP, []); }
    }
  };

  // offline and installable
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
