/* ChristianBox: thin adapter over window.csHost (brand/cs-host.js), the layer every Christian Systems app stands on.
 * Files go through the browser's file pickers (or our desktop shells); autosave lives on this device. */
(function (root) {
	"use strict";
	const NS = (root.CBox = root.CBox || {});
	const S = root.csHost;
	const AUTOSAVE = "cbox.autosave";

	function bytesToBase64(bytes) {
		let s = "";
		const CH = 0x8000;
		for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
		return root.btoa(s);
	}
	function base64ToBytes(b64) {
		const s = root.atob(b64);
		const out = new Uint8Array(s.length);
		for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
		return out;
	}
	function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
	function lsSet(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
	function audioFilters(name) {
		return /\.wav$/i.test(name) ? [{ name: "WAV audio", patterns: ["*.wav"] }] : /\.mp3$/i.test(name) ? [{ name: "MP3 audio", patterns: ["*.mp3"] }] : /\.mid$/i.test(name) ? [{ name: "MIDI", patterns: ["*.mid", "*.midi"] }] : [{ name: "All files", patterns: ["*"] }];
	}
	const SONG_FILTERS = [{ name: "Songs", patterns: ["*.beepbox", "*.json"] }];

	NS.shell = {
		available: true,
		info: S.info,
		bytesToBase64: bytesToBase64, base64ToBytes: base64ToBytes,
		openSongDialog: function () { return S.fs.open({ title: "Open song", filters: SONG_FILTERS }); },
		saveText: function (name, text) { return S.fs.save({ suggestedName: name, data: text, encoding: "utf8", filters: SONG_FILTERS }); },
		saveBlob: async function (blob, name) { return S.fs.save({ suggestedName: name, data: new Uint8Array(await blob.arrayBuffer()), filters: audioFilters(name) }); },
		/** Autosave stays on this device; everything else goes to the folder the person chose, or downloads. */
		writeProject: async function (rel, data) {
			if (/^autosave\//.test(rel)) { if (!lsSet(AUTOSAVE, typeof data === "string" ? data : new TextDecoder().decode(data))) throw new Error("storage is full"); return { path: rel }; }
			return S.fs.writeProject(rel, data);
		},
		readProject: async function (rel) {
			if (/^autosave\//.test(rel)) { const t = lsGet(AUTOSAVE); if (t == null) throw new Error("not found: " + rel); return t; }
			throw new Error("not found: " + rel);
		},
		listProject: async function (dir) {
			if (dir === "autosave") { const t = lsGet(AUTOSAVE); return t ? [{ name: "autosave.json", dir: false, size: t.length }] : []; }
			return [];
		},
		chooseFolder: function () { return S.fs.chooseProject(); },
		recent: async function () { return (await S.recent.list()).map(function (r) { return r.path; }); },
		recentAdd: function () { return Promise.resolve(); }, // csHost records opens and saves itself, with their file handles
		recentClear: function () { return S.recent.clear(); },
		readFile: function (path, binary) { return S.fs.readFile(path, { binary: !!binary }); },
		setTitle: function (t) { S.window.setTitle(t + " · ChristianBox"); },
		setDirty: function (d) { S.window.setDirty(!!d); },
	};
})(typeof window !== "undefined" ? window : globalThis);
