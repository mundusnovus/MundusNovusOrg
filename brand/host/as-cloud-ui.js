/* Asteria Cloud for Asteria Technology apps: one panel to connect, open, save and autosave, over as-cloud.js.
   An app calls asteriaCloudUI.attach({ folder, ext, name(), serialize(), open(name, text) }) once, then
   asteriaCloudUI.show() from a button and asteriaCloudUI.changed() whenever its work changes. GPL-3.0-only. */
(function (global) {
  'use strict';
  var C = global.csCloud, app = null, etags = {}, timer = null, AUTO = 'as.cloud.autosave.';
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function auto() { try { return localStorage.getItem(AUTO + app.folder) === '1'; } catch (e) { return false; } }
  function setAuto(on) { try { localStorage.setItem(AUTO + app.folder, on ? '1' : '0'); } catch (e) {} }
  function fileName() { var n = String(app.name() || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'Untitled'; return n.endsWith(app.ext) ? n : n + app.ext; }
  async function save(quiet) {
    await C.mkdir(app.folder);
    var path = app.folder + '/' + fileName();
    try { etags[path] = await C.save(path, app.serialize(), etags[path]); }
    catch (e) {
      // the first save of a name that already exists in Cloud: read its tag and save over it once, on purpose
      if (!quiet && /changed in Cloud/.test(e.message) && !etags[path] && confirm(fileName() + ' is already in Cloud. Replace it?')) { etags[path] = (await C.read(path)).etag; etags[path] = await C.save(path, app.serialize(), etags[path]); }
      else throw e;
    }
    return path;
  }
  function show() {
    if (!app || !C) return;
    var d = el('dialog', { class: 'as-keys asteria-cloud' }), body = el('form', { method: 'dialog' }), list = el('div', { class: 'asteria-cloud-list' }), msg = el('p', { class: 'asteria-cloud-msg', role: 'status' });
    function say(t) { msg.textContent = t || ''; }
    async function draw() {
      body.textContent = '';
      body.appendChild(el('h2', { text: 'Asteria Cloud' }));
      if (!C.connected()) {
        body.appendChild(el('p', { text: 'Keep your work in Asteria Cloud, with 3 GB free on your Asteria account. This device keeps its own key; you can disconnect at any time.' }));
        body.appendChild(el('menu', {}, [el('span'), el('button', { value: 'cancel', type: 'submit', text: 'Not now' }), el('button', { type: 'button', class: 'primary', text: 'Connect', onclick: async function () { try { say('Waiting for you to sign in…'); await C.connect(); say(''); draw(); } catch (e) { say(e.message); } } })]));
        body.appendChild(msg);
        return;
      }
      var box = el('input', { type: 'checkbox' }); box.checked = auto();
      box.addEventListener('change', function () { setAuto(box.checked); if (box.checked) changed(); });
      body.appendChild(el('p', { text: 'Your ' + app.folder.slice(1) + ' folder.' }));
      body.appendChild(list);
      body.appendChild(el('label', { class: 'asteria-cloud-auto' }, [box, ' Save to Cloud automatically while I work']));
      body.appendChild(msg);
      body.appendChild(el('menu', {}, [
        el('button', { type: 'button', text: 'Disconnect', onclick: function () { C.disconnect(); etags = {}; draw(); } }), el('span'),
        el('button', { value: 'cancel', type: 'submit', text: 'Close' }),
        el('button', { type: 'button', class: 'primary', text: 'Save as ' + fileName(), onclick: async function () { try { say('Saving…'); await save(false); say('Saved to Cloud.'); fill(); } catch (e) { say(e.message); } } })]));
      fill();
    }
    async function fill() {
      list.textContent = 'Loading…';
      try {
        await C.mkdir(app.folder);
        var files = (await C.list(app.folder)).filter(function (f) { return !f.directory && f.name.endsWith(app.ext); });
        list.textContent = '';
        if (!files.length) list.appendChild(el('p', { class: 'asteria-cloud-empty', text: 'Nothing here yet.' }));
        files.forEach(function (f) {
          list.appendChild(el('button', { type: 'button', class: 'asteria-cloud-file', onclick: async function () {
            try { say('Opening…'); var r = await C.read(f.path); etags[f.path] = r.etag; app.open(f.name.slice(0, -app.ext.length), r.data); d.close(); } catch (e) { say(e.message); }
          } }, [el('b', { text: f.name }), el('small', { text: f.modified ? new Date(f.modified).toLocaleString() : '' })]));
        });
      } catch (e) { list.textContent = ''; say(e.message); }
    }
    d.appendChild(body); document.body.appendChild(d);
    d.addEventListener('close', function () { d.remove(); });
    draw(); d.showModal();
  }
  // autosave: at most every 20 seconds, only when switched on and connected; failures wait for the next change
  function changed() {
    if (!app || !C || !C.connected() || !auto() || timer) return;
    timer = setTimeout(function () { timer = null; save(true).then(function (p) { if (app.saved) app.saved('Saved to Cloud'); }, function (e) { if (app.saved) app.saved(e.message, true); }); }, 20000);
  }
  global.asCloudUI = { attach: function (o) { app = o; }, show: show, changed: changed, available: function () { return !!C; } };
})(window);
