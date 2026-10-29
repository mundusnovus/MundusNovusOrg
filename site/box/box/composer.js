/* ChristianBox: the Composer side panel and its tool-use loop.
 * Talks to the Anthropic API through window.csHost.request, with the person's own key, kept only on this device. */
(function (root) {
	"use strict";
	const NS = (root.CBox = root.CBox || {});
	const W = root; // the window: methods below take a DOM "root" of their own

	function el(tag, cls, text) {
		const e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text != null) e.textContent = text;
		return e;
	}

	function friendly(e) {
		const code = e && e.code;
		if (code === "no_key") return { text: "Add your Anthropic key to use the Composer. It stays on this device.", key: true };
		if (code === "key_rejected" || (e && (e.status === 401 || e.status === 403))) return { text: "Anthropic did not accept that key. Check it and try again.", key: true };
		if (code === "rate_limited") return { text: "Anthropic is busy right now. Wait a moment and send again." };
		if (e && e.name === "TypeError") return { text: "Could not reach Anthropic. Check your connection." };
		return { text: (e && e.message) || String(e) };
	}

	/** The tool-use loop: send, run the tools the model asks for, send their results back, until it answers. */
	function Client(o) { this.o = o; this.messages = []; this.stopped = false; this.model = o.model || null; }
	Client.prototype.reset = function () { this.messages = []; this.stopped = false; };
	Client.prototype.stop = function () { this.stopped = true; };
	Client.prototype.send = async function (text) {
		const o = this.o, ev = o.onEvent || function () {}, usage = { input_tokens: 0, output_tokens: 0 }, toolCalls = [];
		let finalText = "", stopped = false, hitMaxTurns = true;
		this.stopped = false;
		this.messages.push({ role: "user", content: [{ type: "text", text: text }] });
		for (let turn = 0; turn < (o.maxTurns || 30); turn++) {
			if (this.stopped) { stopped = true; hitMaxTurns = false; break; }
			ev("request");
			const body = { max_tokens: o.maxTokens || 8192, system: o.system, tools: o.tools, messages: this.messages };
			if (this.model) body.model = this.model;
			let res;
			for (let attempt = 0; attempt < 4; attempt++) {
				res = await W.csHost.request("/v1/messages", body, { timeoutMs: 300000 });
				if (res.status !== 429 && res.status !== 529 && res.status !== 503) break;
				await new Promise(function (r) { setTimeout(r, 1500 * (attempt + 1)); });
			}
			if (res.status !== 200) {
				const e = new Error((res.json && res.json.error && res.json.error.message) || ("Anthropic error " + res.status));
				e.status = res.status; e.code = res.status === 401 || res.status === 403 ? "key_rejected" : res.status === 429 ? "rate_limited" : "api_error"; throw e;
			}
			const msg = res.json;
			this.messages.push({ role: "assistant", content: msg.content });
			if (msg.usage) { usage.input_tokens += msg.usage.input_tokens || 0; usage.output_tokens += msg.usage.output_tokens || 0; ev("usage", usage); }
			const uses = (msg.content || []).filter(function (b) { return b.type === "tool_use"; });
			const said = (msg.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n").trim();
			if (said) { finalText = said; ev("text", said); }
			if (!uses.length) { hitMaxTurns = false; break; }
			const results = [];
			for (const u of uses) {
				if (this.stopped) { results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: "Stopped by the user." }); stopped = true; continue; }
				ev("tool_use", { name: u.name, input: u.input });
				toolCalls.push({ name: u.name, input: u.input });
				try { const out = await o.run(u.name, u.input); results.push({ type: "tool_result", tool_use_id: u.id, content: typeof out === "string" ? out : JSON.stringify(out) }); }
				catch (e) { results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: String(e && e.message || e) }); }
			}
			this.messages.push({ role: "user", content: results });
			if (stopped) { hitMaxTurns = false; break; }
		}
		return { text: finalText, toolCalls: toolCalls, usage: usage, stopped: stopped, hitMaxTurns: hitMaxTurns };
	};

	/** Shrink old tool results so long sessions stay cheap. Keeps the newest `keep` messages intact. */
	function compactHistory(messages, keep) {
		for (let i = 0; i < messages.length - keep; i++) {
			const m = messages[i];
			if (m.role !== "user" || !Array.isArray(m.content)) continue;
			m.content.forEach(function (b) {
				if (b.type === "tool_result" && Array.isArray(b.content)) b.content.forEach(function (c) { if (c.type === "text" && c.text.length > 400) c.text = c.text.slice(0, 400) + " ...[older result shortened]"; });
			});
		}
	}

	function stateLine(tools) {
		let j;
		try { j = tools.snapshot(); } catch (e) { return ""; }
		const bars = Math.max.apply(null, [1].concat(j.channels.map(function (c) { return c.sequence.length; })));
		const chans = j.channels.map(function (c, i) {
			let notes = 0; c.sequence.forEach(function (s) { if (s) notes += (c.patterns[s - 1].notes || []).length; });
			const ins = c.instruments[0];
			return (i + 1) + ":" + (c.type === "drum" ? "drum" : "pitch") + "(" + ins.type + (ins.wave ? " " + ins.wave : "") + ", " + notes + " notes)";
		});
		return "[Current song: key " + j.key + ", scale " + j.scale + ", " + j.beatsPerMinute + " bpm, " + j.beatsPerBar + " beats/bar, " + bars + " bars, loop " + j.introBars + "+" + j.loopBars + ". Channels " + chans.join(", ") + "]";
	}

	function Composer(opts) {
		this.opts = opts;
		this.tools = opts.tools;
		this.host = opts.host;
		this.shell = opts.shell;
		this.busy = false;
		this.client = null;
		this.turnCommits = 0;
		this.lastTurnCommits = 0;
		this.usage = { input: 0, output: 0 };
		this.build(opts.root);
		this.refreshStatus();
	}

	Composer.prototype.build = function (root) {
		const P = NS.prompt;
		this.root = root;
		root.textContent = "";
		const head = el("div", "ac-head");
		head.appendChild(el("div", "ac-title", "Composer"));
		this.statusDot = el("span", "ac-dot");
		this.statusDot.title = "Bridge status";
		head.appendChild(this.statusDot);
		this.modelSel = el("select", "ac-model");
		this.modelSel.title = "Model";
		[["claude-sonnet-5-5", "Sonnet 5.5"], ["claude-opus-5-5", "Opus 5.5"], ["claude-haiku-5-5", "Haiku 5.5"]].forEach((m) => { const o = el("option", null, m[1]); o.value = m[0]; this.modelSel.appendChild(o); });
		this.modelSel.value = W.csHost.keys.model();
		this.modelSel.addEventListener("change", () => { try { localStorage.setItem("cs.anthropic.model", this.modelSel.value); } catch (e) { /* ignore */ } if (this.client) this.client.model = this.modelSel.value; });
		head.appendChild(this.modelSel);
		this.keyBtn = el("button", "ac-btn ac-small", "Key");
		this.keyBtn.title = "Your Anthropic key";
		this.keyBtn.addEventListener("click", async () => { await W.csHost.keys.prompt(); this.modelSel.value = W.csHost.keys.model(); if (this.client) this.client.model = this.modelSel.value; this.refreshStatus(); });
		head.appendChild(this.keyBtn);
		const newChat = el("button", "ac-btn ac-small", "New");
		newChat.title = "Forget the conversation (the song stays)";
		newChat.addEventListener("click", () => this.newChat());
		head.appendChild(newChat);
		const close = el("button", "ac-btn ac-small ac-close", "Close");
		close.title = "Hide the Composer";
		close.addEventListener("click", function () { const t = document.getElementById("cbToggle"); if (t) t.click(); });
		head.appendChild(close);
		root.appendChild(head);

		this.log = el("div", "ac-log");
		this.log.setAttribute("role", "log");
		root.appendChild(this.log);
		this.addNote("Describe the music you want, or ask for changes to the current song. I write notes and instruments with BeepBox's own tools, so every step can be undone with Z.");

		const chips = el("div", "ac-chips");
		P.QUICK_PROMPTS.forEach((q) => {
			const b = el("button", "ac-chip", q);
			b.addEventListener("click", () => { this.input.value = q; this.input.focus(); });
			chips.appendChild(b);
		});
		root.appendChild(chips);

		const form = el("div", "ac-form");
		this.input = el("textarea", "ac-input");
		this.input.rows = 3;
		this.input.placeholder = "e.g. \"an upbeat 8-bit boss battle, 150 bpm, minor key, with arpeggiated bass\"";
		this.input.addEventListener("keydown", (ev) => {
			ev.stopPropagation();
			if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); this.submit(); }
		});
		["keyup", "keypress"].forEach((n) => this.input.addEventListener(n, (ev) => ev.stopPropagation()));
		form.appendChild(this.input);
		const row = el("div", "ac-row");
		this.sendBtn = el("button", "ac-btn ac-primary", "Compose");
		this.sendBtn.addEventListener("click", () => this.submit());
		this.stopBtn = el("button", "ac-btn", "Stop");
		this.stopBtn.disabled = true;
		this.stopBtn.addEventListener("click", () => this.stop());
		this.undoBtn = el("button", "ac-btn", "Undo last AI turn");
		this.undoBtn.disabled = true;
		this.undoBtn.addEventListener("click", () => this.undoTurn());
		this.playBtn = el("button", "ac-btn", "Play");
		this.playBtn.addEventListener("click", () => { try { this.host.play({ fromBar: 0 }); } catch (e) { this.addNote(String(e.message || e)); } });
		row.appendChild(this.sendBtn); row.appendChild(this.stopBtn); row.appendChild(this.undoBtn); row.appendChild(this.playBtn);
		form.appendChild(row);
		this.usageEl = el("div", "ac-usage", "");
		form.appendChild(this.usageEl);
		root.appendChild(form);
	};

	Composer.prototype.addNote = function (text, cls) {
		const d = el("div", "ac-msg ac-note" + (cls ? " " + cls : ""), text);
		this.log.appendChild(d); this.scroll(); return d;
	};
	Composer.prototype.addUser = function (text) { const d = el("div", "ac-msg ac-user", text); this.log.appendChild(d); this.scroll(); return d; };
	Composer.prototype.addAssistant = function (text) { const d = el("div", "ac-msg ac-assistant", text); this.log.appendChild(d); this.scroll(); return d; };
	Composer.prototype.addTool = function (name, input) {
		const d = el("div", "ac-tool ac-pending");
		const brief = Object.keys(input || {}).slice(0, 4).map(function (k) { let v = input[k]; if (typeof v === "object") v = JSON.stringify(v); v = String(v); return k + "=" + (v.length > 28 ? v.slice(0, 28) + "…" : v); }).join(" ");
		d.textContent = "▸ " + name + (brief ? "  " + brief : "");
		this.log.appendChild(d); this.scroll(); return d;
	};
	Composer.prototype.scroll = function () { this.log.scrollTop = this.log.scrollHeight; };

	Composer.prototype.setBusy = function (b) {
		this.busy = b;
		this.sendBtn.disabled = b; this.stopBtn.disabled = !b;
		this.root.classList.toggle("ac-busy", b);
		this.undoBtn.disabled = b || !this.lastTurnCommits;
	};

	Composer.prototype.refreshStatus = async function () {
		const has = W.csHost.keys.has();
		this.statusDot.className = "ac-dot " + (has ? "ok" : "warn");
		this.statusDot.title = has ? "Ready" : "No key yet";
		this.keyBtn.textContent = has ? "Key" : "Add your key";
		this.keyBtn.classList.toggle("ac-primary", !has);
		if (!has && !this.warnedKey) { this.warnedKey = true; this.addNote("The Composer runs on your own Anthropic key, kept only on this device. Everything else works without one.", "ac-warn"); }
		return { key: has };
	};

	Composer.prototype.ensureClient = function () {
		if (!W.csHost.keys.has()) throw Object.assign(new Error("no key"), { code: "no_key" });
		if (this.client) return this.client;
		const self = this;
		const defs = this.tools.definitions.map(function (d) { return { name: d.name, description: d.description, input_schema: d.input_schema }; });
		this.client = new Client({
			model: this.modelSel.value || null,
			system: NS.prompt.SYSTEM,
			tools: defs,
			maxTurns: 30,
			maxTokens: 8192,
			run: function (name, input) { return self.runTool(name, input); },
			onEvent: function (kind, data) { self.onEvent(kind, data); },
		});
		return this.client;
	};

	Composer.prototype.runTool = async function (name, input) {
		const node = this.currentToolNode;
		try {
			const out = await this.tools.run(name, input);
			if (node) { node.classList.remove("ac-pending"); node.classList.add("ac-ok"); if (out && out.message) node.title = out.message; }
			return out;
		} catch (e) {
			if (node) { node.classList.remove("ac-pending"); node.classList.add("ac-err"); node.title = e.message; node.textContent += "  ✕ " + e.message.slice(0, 120); }
			throw e;
		}
	};

	Composer.prototype.onEvent = function (kind, data) {
		if (kind === "tool_use") this.currentToolNode = this.addTool(data.name, data.input);
		else if (kind === "text") { if (data) this.addAssistant(data); }
		else if (kind === "usage") { this.usage = { input: data.input_tokens, output: data.output_tokens }; this.usageEl.textContent = "this turn: " + data.input_tokens + " in / " + data.output_tokens + " out tokens"; }
		else if (kind === "request") { this.statusLine("thinking…"); }
	};
	Composer.prototype.statusLine = function (t) { this.usageEl.textContent = t; };

	Composer.prototype.newChat = function () {
		if (this.busy) return;
		if (this.client) this.client.reset();
		this.log.textContent = "";
		this.addNote("New conversation. The song is unchanged.");
	};
	Composer.prototype.stop = function () { if (this.client) this.client.stop(); this.statusLine("stopping…"); };
	Composer.prototype.undoTurn = function () {
		if (this.busy || !this.lastTurnCommits) return;
		this.host.undo(this.lastTurnCommits);
		this.addNote("Undid the last AI turn (" + this.lastTurnCommits + " change" + (this.lastTurnCommits === 1 ? "" : "s") + ").");
		this.lastTurnCommits = 0; this.undoBtn.disabled = true;
		if (this.opts.onSongReplaced) this.opts.onSongReplaced();
	};

	Composer.prototype.submit = function () {
		const text = this.input.value.trim();
		if (!text || this.busy) return;
		this.input.value = "";
		this.ask(text).catch(function () { /* shown in the log */ });
	};

	/** Run one user request through the model. Resolves {text, toolCalls, stopped, hitMaxTurns}. Rejects with .code -32002 when busy. */
	Composer.prototype.ask = async function (text, o) {
		o = o || {};
		if (this.busy) throw Object.assign(new Error("the composer is busy with another request"), { code: -32002 });
		this.setBusy(true);
		this.addUser(o.label || text);
		this.host.beginTurn();
		let result;
		try {
			const client = this.ensureClient();
			if (this.modelSel.value) client.model = this.modelSel.value;
			compactHistory(client.messages, 8);
			result = await client.send(stateLine(this.tools) + "\n\n" + text);
			if (result.stopped) this.addNote("Stopped.");
			if (result.hitMaxTurns) this.addNote("Stopped after the maximum number of steps. Ask me to continue if it is unfinished.", "ac-warn");
			if (!result.text && !result.stopped) this.addAssistant("(done)");
			this.usageEl.textContent = "this turn: " + result.usage.input_tokens + " in / " + result.usage.output_tokens + " out tokens";
			return result;
		} catch (e) {
			const f = friendly(e);
			this.addNote(f.text, "ac-warn");
			if (f.key) { this.refreshStatus(); W.csHost.keys.prompt().then(() => this.refreshStatus()); }
			this.usageEl.textContent = "";
			throw e;
		} finally {
			this.lastTurnCommits = this.host.endTurn();
			this.setBusy(false);
			if (this.opts.onTurnEnd) this.opts.onTurnEnd(this.lastTurnCommits);
		}
	};

	NS.Composer = Composer;
	NS.composerInternals = { compactHistory: compactHistory, stateLine: stateLine, friendly: friendly, Client: Client };
})(typeof window !== "undefined" ? window : globalThis);
