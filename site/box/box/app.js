/* Asteria Box: start-up, toolbar, file handling, autosave, export dialogs. Glues BeepBox's editor to our layer. */
(function (root) {
	"use strict";
	const NS = (root.CBox = root.CBox || {});
	const B = root.beepbox;
	const $ = function (id) { return document.getElementById(id); };
	const shell = NS.shell;
	const ST = {}; // exposed for tests and debugging: root.CBox.state

	let doc = null, editor = null, host = null, tools = null, composer = null;
	let currentPath = null, currentName = "Untitled", savedHash = "", lastHash = "", dirty = false;
	let changeTimer = null, autosaveTimer = null, opening = false;

	function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
	function lsSet(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
	const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
	const nextFrame = function () { return Promise.race([new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); }), sleep(250)]); };

	// ---------------------------------------------------------------- first-run preferences (must precede the editor)
	if (!lsGet("layout")) lsSet("layout", "long");
	if (!lsGet("colorTheme") || lsGet("colorTheme") === "amerika" || lsGet("colorTheme") === "christian" || lsGet("colorTheme") === "mundus") lsSet("colorTheme", "asteria"); // older names of this theme
	// Keep the song out of the address bar: undo history lives in sessionStorage instead of the (file://) URL.
	if (lsGet("displayBrowserUrl") == null) lsSet("displayBrowserUrl", "false");
	NS.theme.install();

	// ---------------------------------------------------------------- BeepBox's export "Save File" goes through the shell dialog
	root.amerikaSaveBlob = function (blob, name) {
		shell.saveBlob(blob, name, "Export " + name).then(function (r) { if (r) toast("Saved " + (r.path || r.name)); }).catch(function (e) { toast("Could not save: " + (e && e.message || e), true); });
	};

	// ---------------------------------------------------------------- small UI helpers
	let toastTimer = null;
	function toast(text, bad) {
		const b = $("cbBanner");
		b.textContent = text; b.style.borderLeftColor = bad ? "var(--cb-bad)" : ""; b.classList.add("open");
		clearTimeout(toastTimer); toastTimer = setTimeout(function () { b.classList.remove("open"); }, bad ? 7000 : 3200);
	}
	function banner(text, buttons) {
		const b = $("cbBanner"); b.textContent = ""; b.style.borderLeftColor = "var(--cb-warn)";
		const s = document.createElement("span"); s.textContent = text; b.appendChild(s);
		buttons.forEach(function (x) { const bt = document.createElement("button"); bt.className = "cb-btn"; bt.textContent = x.label; bt.addEventListener("click", function () { b.classList.remove("open"); x.run(); }); b.appendChild(bt); });
		b.classList.add("open"); clearTimeout(toastTimer);
	}
	function modal(build) {
		const m = $("cbModal"), card = $("cbCard"); card.textContent = "";
		const close = function () { m.classList.remove("open"); };
		build(card, close);
		m.classList.add("open");
		m.onclick = function (e) { if (e.target === m && !m.dataset.locked) close(); };
		return close;
	}
	function h(tag, props, kids) {
		const e = document.createElement(tag);
		Object.keys(props || {}).forEach(function (k) { if (k === "text") e.textContent = props[k]; else if (k === "class") e.className = props[k]; else e.setAttribute(k, props[k]); });
		(kids || []).forEach(function (c) { e.appendChild(c); });
		return e;
	}
	// BeepBox only repaints after user input events; after programmatic changes ask its notifier to run on the next frame.
	function refresh() { requestAnimationFrame(function () { try { if (doc) doc.notifier.notifyWatchers(); } catch (e) { /* ignore */ } }); }
	function closeMenus() { document.querySelectorAll(".cb-drop.open").forEach(function (d) { d.classList.remove("open"); }); }
	function toggleMenu(id) {
		const d = $(id), was = d.classList.contains("open"); closeMenus();
		if (!was) { // the toolbar scrolls sideways on small screens, so menus are placed against the viewport
			const r = $(d.dataset.button).getBoundingClientRect();
			d.style.top = (r.bottom + 6) + "px"; d.style.left = Math.max(8, Math.min(r.left, root.innerWidth - 268)) + "px";
			d.classList.add("open");
		}
		return !was;
	}

	// ---------------------------------------------------------------- song files
	function songHash() { return doc.song.toBase64String(); }
	function songToText() { return JSON.stringify(doc.song.toJsonObject(), null, 1) + "\n"; }
	function stem(name) { return String(name || "song").replace(/\.(json|beepbox)$/i, ""); }
	function parseSongText(text) {
		const t = String(text).trim();
		if (!t) throw new Error("the file is empty");
		if (t[0] === "{") {
			const j = JSON.parse(t);
			if (!j || !Array.isArray(j.channels)) throw new Error("this JSON is not a BeepBox song (no 'channels')");
			const s = new B.Song(); s.fromJsonObject(j); return s;
		}
		return new B.Song(t.replace(/^.*#/, ""));
	}
	function setBaseline(name, path) {
		currentName = name || "Untitled"; currentPath = path || null;
		savedHash = songHash(); lastHash = savedHash; dirty = false; refreshTitle();
	}
	function refreshTitle() {
		shell.setTitle(currentName + (dirty ? " *" : ""));
		shell.setDirty(dirty);
		const s = $("cbStatus"); s.textContent = currentPath ? currentPath : currentName; s.classList.toggle("dirty", dirty);
	}
	function onChanged() {
		clearTimeout(changeTimer);
		changeTimer = setTimeout(function () {
			if (!doc) return;
			let h2; try { h2 = songHash(); } catch (e) { return; }
			if (h2 === lastHash) return;
			lastHash = h2; dirty = h2 !== savedHash; refreshTitle();
			clearTimeout(autosaveTimer);
			if (dirty) autosaveTimer = setTimeout(autosave, 5000);
			if (dirty && root.asCloudUI) root.asCloudUI.changed();
		}, 250);
	}
	async function autosave() {
		try { await shell.writeProject("autosave/autosave.json", songToText(), true); ST.lastAutosave = Date.now(); } catch (e) { /* project folder not writable: ignore quietly */ }
	}
	function confirmDiscard() { return !dirty || root.confirm("This song has unsaved changes. Discard them?"); }

	function loadSong(song, name, path) {
		doc.record(new B.ChangeSong(doc, song.toBase64String()), false, true);
		doc.goBackToStart();
		refresh();
		setBaseline(name, path);
		if (composer) composer.lastTurnCommits = 0;
	}
	async function openFile(file) {
		if (!file) return;
		if (file.binary) { toast("That is an audio/MIDI file; Asteria Box opens .beepbox and .json songs.", true); return; }
		if (!confirmDiscard()) return;
		try {
			const song = parseSongText(file.data);
			loadSong(song, stem(file.name), file.path);
			if (file.path) shell.recentAdd(file.path).catch(function () {});
			toast("Opened " + file.name);
		} catch (e) { toast("Could not open " + (file.name || "file") + ": " + (e && e.message || e), true); }
	}
	async function openDialog() { try { const f = await shell.openSongDialog(); if (f) await openFile(f); } catch (e) { toast("Open failed: " + (e && e.message || e), true); } }
	function newSong() {
		if (!confirmDiscard()) return;
		doc.record(new B.ChangeSong(doc, ""), false, true);
		doc.goBackToStart();
		refresh();
		setBaseline("Untitled", null);
	}
	function projectRelative(path) {
		const dir = shell.info && shell.info.projectDir;
		if (!dir || !path || path.indexOf(dir.replace(/\/+$/, "") + "/") !== 0) return null;
		return path.slice(dir.replace(/\/+$/, "").length + 1);
	}
	async function save(forceAs) {
		try {
			const text = songToText();
			let rel = !forceAs && currentPath ? projectRelative(currentPath) : null;
			if (rel) { await shell.writeProject(rel, text, true); }
			else {
				const r = await shell.saveText(stem(currentName) + ".beepbox", text, forceAs ? "Save song as" : "Save song");
				if (!r) return false;
				currentPath = r.path || null; currentName = stem(r.name || currentName);
				if (r.path) shell.recentAdd(r.path).catch(function () {});
			}
			savedHash = songHash(); lastHash = savedHash; dirty = false; refreshTitle(); toast("Saved");
			return true;
		} catch (e) { toast("Save failed: " + (e && e.message || e), true); return false; }
	}

	// ---------------------------------------------------------------- recent
	async function fillRecent() {
		const drop = $("cbRecentDrop"); drop.textContent = "";
		let items = []; try { items = await shell.recent(); } catch (e) { /* ignore */ }
		items = (items || []).filter(function (p) { return /\.(json|beepbox)$/i.test(p); });
		if (!items.length) { drop.appendChild(h("div", { class: "cb-empty", text: "No recent songs yet" })); return; }
		items.forEach(function (p) {
			const b = h("button", { text: p.split("/").pop(), title: p });
			b.addEventListener("click", async function () { closeMenus(); try { const f = await shell.readFile(p, false); if (f) await openFile(f); } catch (e) { toast("Cannot open " + p + ": " + (e && e.message || e), true); } });
			drop.appendChild(b);
		});
		const sep = h("div", { class: "cb-sep" }); drop.appendChild(sep);
		const clr = h("button", { text: "Clear list" }); clr.addEventListener("click", function () { closeMenus(); shell.recentClear(); }); drop.appendChild(clr);
	}

	// ---------------------------------------------------------------- export
	function openBeepBoxExport(format) {
		lsSet("exportFormat", format);
		doc.openPrompt("export");
		doc.notifier.changed();
		refresh();
	}
	function exportGameDialog() {
		modal(function (card, close) {
			card.appendChild(h("h2", { text: "Export for game" }));
			card.appendChild(h("p", { text: "Renders the intro plus one seamless loop: a WAV with loop points, loop metadata, the editable song and Godot import presets. They go into the folder you choose, or to your downloads." }));
			const folder = h("button", { class: "cb-btn", text: "Choose folder…" });
			folder.addEventListener("click", async function () { const n = await shell.chooseFolder(); if (n) folder.textContent = "Folder: " + n; });
			if (root.showDirectoryPicker) card.appendChild(h("div", { class: "cb-field" }, [h("label", { text: "Where" }), folder]));
			const name = h("input", { type: "text", value: stem(currentName === "Untitled" ? "music" : currentName) });
			const sr = h("select", {}, [h("option", { value: "44100", text: "44100 Hz" }), h("option", { value: "48000", text: "48000 Hz" })]);
			const norm = h("input", { type: "checkbox", checked: "checked" });
			const ogg = h("input", { type: "checkbox" });
			const f1 = h("div", { class: "cb-field" }, [h("label", { text: "Name" }), name]);
			const f2 = h("div", { class: "cb-field" }, [h("label", { text: "Sample rate" }), sr]);
			const f3 = h("div", { class: "cb-field" }, [h("label", { text: "Normalize to -1 dBFS" }), norm]);
			const f4 = h("div", { class: "cb-field" }, [h("label", { text: "Also write .ogg" }), ogg]);
			[f1, f2, f3].concat(root.csNative && root.csNative.ogg ? [f4] : []).forEach(function (f) { card.appendChild(f); });
			const prog = h("div", { class: "cb-progress" }, [h("i")]); card.appendChild(prog);
			const msg = h("p", { text: "" }); card.appendChild(msg);
			const go = h("button", { class: "cb-btn cb-accent", text: "Export" }), cancel = h("button", { class: "cb-btn", text: "Close" });
			cancel.addEventListener("click", close);
			go.addEventListener("click", async function () {
				go.disabled = true; prog.style.display = "block"; msg.textContent = "";
				try {
					const res = await exportGame({ name: name.value, sampleRate: parseInt(sr.value, 10), normalizeDb: norm.checked ? -1 : null, ogg: !!(root.csNative && root.csNative.ogg) && ogg.checked }, function (f, label) { prog.firstChild.style.width = Math.round(f * 100) + "%"; msg.textContent = label; });
					msg.textContent = "Done: " + res.dir + " (" + res.files.join(", ") + ")" + (res.ogg !== "ok" && ogg.checked ? ". Ogg: " + res.ogg : "");
				} catch (e) { msg.textContent = "Export failed: " + (e && e.message || e); }
				go.disabled = false;
			});
			card.appendChild(h("div", { class: "cb-actions" }, [cancel, go]));
		});
	}
	function oggIO() {
		// A desktop shell with ffmpeg may watch exports/.jobs/ and write Ogg copies.
		return async function requestOgg(job) {
			const id = "j" + Date.now().toString(36);
			await shell.writeProject("exports/.jobs/" + id + ".job.json", JSON.stringify(job), true);
			const t0 = Date.now();
			for (;;) {
				await sleep(400);
				let names = [];
				try { names = (await shell.listProject("exports/.jobs")).map(function (f) { return f.name; }); } catch (e) { /* ignore */ }
				if (names.indexOf(id + ".result.json") >= 0) {
					try { return JSON.parse(await shell.readProject("exports/.jobs/" + id + ".result.json", false)); } catch (e) { return { ok: false, error: "unreadable helper result" }; }
				}
				const picked = names.indexOf(id + ".working.json") >= 0;
				if (!picked && Date.now() - t0 > 6000) return { ok: false, error: "no Ogg helper is running. The WAV and metadata were written." };
				if (Date.now() - t0 > 180000) return { ok: false, error: "the Ogg helper timed out" };
			}
		};
	}
	async function exportGame(opts, progress) {
		const res = await NS.exporter.buildGameBundle(B, doc.song, Object.assign({ yieldEvery: 40 }, opts), {
			write: function (rel, data) { return shell.writeProject(rel, data, true); },
			requestOgg: opts.ogg === false ? null : oggIO(),
			progress: progress,
		});
		toast("Game bundle written to " + res.dir);
		return res;
	}

	// ---------------------------------------------------------------- mastered MP3
	// What we learned making albums: render at 44.1 kHz, bring every song to the same loudness (-14 dBFS RMS),
	// keep peaks under -1 dBFS with a soft knee instead of hard clipping, fade the tail, and tag the file.
	function master(L, R, rate, loudness) {
		let sum = 0; const n = L.length;
		for (let i = 0; i < n; i++) sum += L[i] * L[i] + R[i] * R[i];
		const rms = Math.sqrt(sum / (2 * n)), gain = Math.pow(10, loudness / 20) / Math.max(rms, 1e-9), ceil = Math.pow(10, -1 / 20), knee = 0.7;
		const soft = function (x) { x *= gain; const a = Math.abs(x); return a <= knee ? x : Math.sign(x) * (knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee))); };
		const fade = Math.floor(rate * 0.4);
		for (let i = 0; i < n; i++) { const f = i > n - fade ? (n - i) / fade : 1; L[i] = soft(L[i]) * f; R[i] = soft(R[i]) * f; }
		return +(20 * Math.log10(gain)).toFixed(1);
	}
	function id3(meta, cover) { // ID3v2.3: title, artist, album, year, genre and cover art
		const frame = function (id, body) { const hd = new Uint8Array(10); for (let i = 0; i < 4; i++) hd[i] = id.charCodeAt(i); const n = body.length; hd[4] = n >>> 24; hd[5] = n >>> 16 & 255; hd[6] = n >>> 8 & 255; hd[7] = n & 255; return [hd, body]; };
		const text = function (id, str) { const u = new Uint8Array(3 + str.length * 2); u[0] = 1; u[1] = 0xFF; u[2] = 0xFE; for (let i = 0; i < str.length; i++) { u[3 + 2 * i] = str.charCodeAt(i) & 255; u[4 + 2 * i] = str.charCodeAt(i) >>> 8; } return frame(id, u); };
		let parts = [];
		[["TIT2", meta.title], ["TPE1", meta.artist], ["TALB", meta.album], ["TYER", meta.year], ["TCON", meta.genre], ["TSSE", "Asteria Box"]].forEach(function (f) { if (f[1]) parts = parts.concat(text(f[0], String(f[1]))); });
		if (cover) { const head = new TextEncoder().encode("\0" + cover.type + "\0\x03Cover\0"), body = new Uint8Array(head.length + cover.bytes.length); body.set(head); body.set(cover.bytes, head.length); parts = parts.concat(frame("APIC", body)); }
		const size = parts.reduce(function (n, p) { return n + p.length; }, 0), hd = new Uint8Array(10);
		hd.set([73, 68, 51, 3, 0, 0, size >>> 21 & 127, size >>> 14 & 127, size >>> 7 & 127, size & 127]);
		return [hd].concat(parts);
	}
	function lame() {
		if (root.lamejs) return Promise.resolve(root.lamejs);
		return new Promise(function (res, rej) { const sc = document.createElement("script"); sc.src = "box/vendor/lame.min.js"; sc.onload = function () { res(root.lamejs); }; sc.onerror = function () { rej(new Error("the MP3 encoder did not load")); }; document.head.appendChild(sc); });
	}
	async function exportMastered(o, progress) {
		const rate = 44100, r = await NS.audio.renderSong(B, doc.song, { sampleRate: rate, loops: o.loops || 1, intro: true, outro: true, yieldEvery: 40, onProgress: function (f) { progress(f * 0.7, "Rendering…"); } });
		const gainDb = master(r.L, r.R, rate, o.loudness);
		progress(0.75, "Encoding…");
		const lj = await lame(), enc = new lj.Mp3Encoder(2, rate, 256), parts = [], blk = 1152;
		const i16 = function (F) { const out = new Int16Array(F.length); for (let i = 0; i < F.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(F[i] * 32767))); return out; };
		const l = i16(r.L), rr = i16(r.R);
		for (let i = 0; i < l.length; i += blk) { const b = enc.encodeBuffer(l.subarray(i, i + blk), rr.subarray(i, i + blk)); if (b.length) parts.push(b); if (i % (blk * 200) === 0) { progress(0.75 + 0.25 * i / l.length, "Encoding…"); await NS.audio.yieldNow(); } }
		parts.push(enc.flush());
		const blob = new Blob(id3(o.meta, o.cover).concat(parts), { type: "audio/mpeg" });
		progress(1, "Saving…");
		const saved = await shell.saveBlob(blob, stem(o.meta.title || currentName) + ".mp3");
		return { seconds: +r.seconds.toFixed(1), gainDb: gainDb, saved: saved };
	}
	function masteredDialog() {
		modal(function (card, close) {
			card.appendChild(h("h2", { text: "Mastered MP3" }));
			card.appendChild(h("p", { text: "Ready to share: even loudness, no clipping, a clean fade, and the title and cover inside the file." }));
			const title = h("input", { type: "text", value: currentName === "Untitled" ? "" : currentName, placeholder: "Title" });
			const artist = h("input", { type: "text", placeholder: "Artist" }), album = h("input", { type: "text", placeholder: "Album" });
			const loud = h("select", {}, [h("option", { value: "-14", text: "Streaming (-14)" }), h("option", { value: "-11", text: "Loud (-11)" }), h("option", { value: "-18", text: "Gentle (-18)" })]);
			const loops = h("select", {}, [h("option", { value: "1", text: "Once" }), h("option", { value: "2", text: "Twice" })]);
			const cover = h("input", { type: "file", accept: "image/png,image/jpeg" });
			[["Title", title], ["Artist", artist], ["Album", album], ["Loudness", loud], ["Loop plays", loops], ["Cover", cover]].forEach(function (f) { card.appendChild(h("div", { class: "cb-field" }, [h("label", { text: f[0] }), f[1]])); });
			const prog = h("div", { class: "cb-progress" }, [h("i")]); card.appendChild(prog);
			const msg = h("p", { text: "" }); card.appendChild(msg);
			const go = h("button", { class: "cb-btn cb-accent", text: "Export" }), cancel = h("button", { class: "cb-btn", text: "Close" });
			cancel.addEventListener("click", close);
			go.addEventListener("click", async function () {
				go.disabled = true; prog.style.display = "block"; msg.textContent = "";
				try {
					const f = cover.files && cover.files[0];
					const res = await exportMastered({ loudness: +loud.value, loops: +loops.value, cover: f ? { type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) } : null,
						meta: { title: title.value.trim() || currentName, artist: artist.value.trim(), album: album.value.trim(), year: String(new Date().getFullYear()), genre: "" } },
						function (x, label) { prog.firstChild.style.width = Math.round(x * 100) + "%"; msg.textContent = label; });
					msg.textContent = res.saved ? "Saved " + res.seconds + " seconds (" + (res.gainDb >= 0 ? "+" : "") + res.gainDb + " dB)." : "Not saved.";
				} catch (e) { msg.textContent = "Export failed: " + (e && e.message || e); }
				go.disabled = false;
			});
			card.appendChild(h("div", { class: "cb-actions" }, [cancel, go]));
		});
	}

	// ---------------------------------------------------------------- about
	function aboutDialog() {
		const A = NS.about;
		modal(function (card, close) {
			card.appendChild(h("h2", { class: "as-display", text: "Asteria Box" }));
			card.appendChild(h("p", { text: "Asteria Box " + A.appVersion + " is a free music maker from Asteria Technology, built on BeepBox " + A.beepboxVersion + ", with the Composer, which writes and changes songs with you." }));
			card.appendChild(h("p", { text: "Your songs stay on this device. The Composer sends your requests to Anthropic only when you add your own key, and the key never leaves this device for anywhere else." }));
			card.appendChild(h("p", { text: "Free and open source under the Asteria License 1.0 (GPL-3.0-only). BeepBox is by John Nesky and contributors, under the MIT licence below; Asteria Box is not affiliated with BeepBox. The MP3 encoder (lamejs, from LAME) is used under the LGPL." }));
			card.appendChild(h("pre", { text: A.beepboxLicense }));
			const ok = h("button", { class: "cb-btn cb-accent", text: "Close" }); ok.addEventListener("click", close);
			card.appendChild(h("div", { class: "cb-actions" }, [ok]));
		});
	}

	// ---------------------------------------------------------------- the editor hook
	function init(e) {
		editor = e.detail.editor; doc = e.detail.doc;
		let turnCommits = 0, inTurn = false;
		host = {
			yieldEvery: 30,
			silent: false,
			isCanceled: function () { return false; },
			getSong: function () { return doc.song; },
			commit: function (song, label) {
				doc.record(new B.ChangeSong(doc, song.toBase64String()), false, false);
				if (inTurn) turnCommits++;
				ST.lastLabel = label;
				refresh();
			},
			beginTurn: function () { turnCommits = 0; inTurn = true; },
			endTurn: function () { inTurn = false; return turnCommits; },
			play: function (o) {
				const synth = doc.synth;
				if (synth.playing) doc.performance.pause();
				synth.goToBar((o && o.fromBar) || 0);
				synth.snapToBar();
				doc.performance.play();
				try { editor.updatePlayButton(); } catch (err) { /* ignore */ }
				doc.notifier.changed();
				refresh();
			},
			stop: function () { doc.performance.pause(); try { editor.updatePlayButton(); } catch (err) { /* ignore */ } doc.notifier.changed(); refresh(); },
			undo: async function (n) { for (let i = 0; i < n; i++) { doc.undo(); await sleep(60); } doc.notifier.changed(); refresh(); await sleep(80); },
		};
		const base = NS.songtools.create(B, host);
		// every mutating tool gets its own history step: wait a frame after it so BeepBox's batched history update runs
		const rawRun = base.run;
		tools = Object.assign({}, base, {
			run: async function (name, input) {
				const def = base.definitions.filter(function (d) { return d.name === name; })[0];
				const out = await rawRun(name, input);
				if (def && def.mutates) { await nextFrame(); onChanged(); }
				return out;
			},
		});
		composer = new NS.Composer({ root: $("composer"), tools: tools, host: host, shell: shell, onTurnEnd: function () { onChanged(); } });
		const S = root.csHost;
		NS.rpc.install({ B: B, host: host, tools: tools, composer: composer, shell: shell, exporter: NS.exporter, audio: NS.audio, S: S });
		if (S) S.onOpen = openFile;

		doc.notifier.watch(onChanged);
		setBaseline("Untitled", null);
		wireToolbar();
		// small screens open on the music; the Composer slides in when asked for
		if (root.matchMedia && root.matchMedia("(max-width: 900px)").matches) { $("cbApp").classList.add("no-composer"); $("cbToggle").setAttribute("aria-pressed", "false"); }
		ST.doc = doc; ST.editor = editor; ST.host = host; ST.tools = tools; ST.composer = composer; ST.B = B;
		restoreOffer();
	}

	async function restoreOffer() {
		await sleep(900);
		if (opening || dirty || currentPath) return;
		let list = [];
		try { list = await shell.listProject("autosave"); } catch (e) { return; }
		if (!list.some(function (f) { return f.name === "autosave.json" && f.size > 200; })) return;
		banner("An autosaved song from your last session is available.", [
			{ label: "Restore", run: async function () { try { const t = await shell.readProject("autosave/autosave.json", false); loadSong(parseSongText(t), "Recovered song", null); dirty = true; refreshTitle(); toast("Autosave restored. Use Save to keep it."); } catch (err) { toast("Could not restore: " + (err && err.message || err), true); } } },
			{ label: "Dismiss", run: function () {} },
		]);
	}

	function wireToolbar() {
		// the frosted toolbar would clip its menus (backdrop-filter makes it their containing block), so they live in <body>
		document.querySelectorAll(".cb-drop").forEach(function (d) { d.dataset.button = d.previousElementSibling.id; document.body.appendChild(d); });
		$("cbNew").addEventListener("click", newSong);
		$("cbOpen").addEventListener("click", openDialog);
		$("cbSave").addEventListener("click", function () { save(false); });
		$("cbSaveAs").addEventListener("click", function () { save(true); });
		$("cbRecent").addEventListener("click", function (ev) { ev.stopPropagation(); if (toggleMenu("cbRecentDrop")) fillRecent(); });
		$("cbExport").addEventListener("click", function (ev) { ev.stopPropagation(); toggleMenu("cbExportDrop"); });
		document.querySelectorAll("#cbExportDrop button").forEach(function (b) {
			b.addEventListener("click", function () { closeMenus(); const f = b.getAttribute("data-export"); if (f === "game") exportGameDialog(); else if (f === "mastered") masteredDialog(); else openBeepBoxExport(f); });
		});
		$("cbToggle").addEventListener("click", function () {
			const app = $("cbApp"); const hidden = app.classList.toggle("no-composer");
			$("cbToggle").setAttribute("aria-pressed", hidden ? "false" : "true");
			root.dispatchEvent(new Event("resize"));
		});
		$("cbTheme").addEventListener("click", function () {
			const names = NS.theme.names; const cur = doc.prefs.colorTheme;
			const next = names[(names.indexOf(cur) + 1) % names.length];
			doc.prefs.colorTheme = next; B.ColorConfig.setTheme(next); doc.prefs.save(); doc.notifier.changed();
			toast("Theme: " + (next === NS.theme.name ? "Asteria Technology" : next));
		});
		$("cbAbout").addEventListener("click", aboutDialog);
		// Asteria Cloud: open, save and (when switched on) autosave songs in the person's /MNBox folder
		if (root.asCloudUI) {
			root.asCloudUI.attach({ folder: "/MNBox", ext: ".beepbox", name: function () { return currentName; }, serialize: songToText,
				open: function (name, text) { if (!confirmDiscard()) return; try { loadSong(parseSongText(text), name, null); toast("Opened " + name + " from Cloud"); } catch (e) { toast("Could not open " + name + ": " + (e && e.message || e), true); } },
				saved: function (text, bad) { if (bad) toast(text, true); } });
			$("cbCloud").addEventListener("click", function () { root.asCloudUI.show(); });
		} else $("cbCloud").hidden = true;
		document.addEventListener("click", closeMenus);
		// desktop shortcuts (BeepBox itself maps Ctrl+S to its export dialog and Ctrl+O to import)
		root.addEventListener("keydown", function (ev) {
			if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
			const k = ev.key.toLowerCase();
			if (k === "s") { ev.preventDefault(); ev.stopImmediatePropagation(); save(ev.shiftKey); }
			else if (k === "o") { ev.preventDefault(); ev.stopImmediatePropagation(); openDialog(); }
			else if (k === "n" && !ev.shiftKey) { ev.preventDefault(); ev.stopImmediatePropagation(); newSong(); }
		}, true);
		// links open in a new tab, never in place of the editor
		document.addEventListener("click", function (ev) { const a = ev.target && ev.target.closest && ev.target.closest("a[href]"); if (a && /^https?:/i.test(a.getAttribute("href"))) { ev.preventDefault(); root.open(a.href, "_blank", "noopener"); } }, true);
	}

	root.addEventListener("amerika-editor-ready", init);
	function start() {
		if (!B || !B.SongEditor) { document.getElementById("beepboxEditorContainer").textContent = "The BeepBox editor failed to load."; return; }
		new B.SongEditor(document.getElementById("beepboxEditorContainer"));
	}
	NS.state = ST;
	NS.app = { start: start, exportGame: exportGame, exportMastered: exportMastered, save: save, openFile: openFile, newSong: newSong, parseSongText: parseSongText, toast: toast };
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(typeof window !== "undefined" ? window : globalThis);
