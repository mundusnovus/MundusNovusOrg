/* Asteria Box: the "asteria" colour theme for BeepBox (Asteria Technology ink, cream, red and gold). Derived from BeepBox's own "dark classic"
 * variables at start-up, so upstream themes stay untouched and new upstream variables are inherited. */
(function (root) {
	"use strict";
	const NS = (root.CBox = root.CBox || {});
	// Light is stone and cream with a deep red; dark is ink with red and gold. Song colours (the pitch channels and notes) stay upstream.
	const LIGHT = {
		"--page-margin": "#faf7f0", "--editor-background": "#fffdf9", "--hover-preview": "#0a1518", "--playhead": "#116674",
		"--primary-text": "#0a1518", "--secondary-text": "#475a60", "--inverted-text": "#fffdf9", "--text-selection": "rgba(242,179,61,0.4)",
		"--box-selection-fill": "rgba(168,21,27,0.14)", "--loop-accent": "#116674", "--link-accent": "#116674",
		"--ui-widget-background": "#efe9dc", "--ui-widget-focus": "#e5d8bd", "--pitch-background": "#efe9dc", "--tonic": "#f6d6c4", "--fifth-note": "#f3e2b8",
		"--white-piano-key": "#fffdf9", "--black-piano-key": "#475a60",
	};
	const DARK = {
		"--page-margin": "#0a1518", "--editor-background": "#1a0a0c", "--hover-preview": "#f4ecdb", "--playhead": "#e9b04b",
		"--primary-text": "#f4ecdb", "--secondary-text": "#a9c2c6", "--inverted-text": "#0a1518", "--text-selection": "rgba(242,179,61,0.4)",
		"--box-selection-fill": "rgba(242,179,61,0.16)", "--loop-accent": "#1c8c9e", "--link-accent": "#ffd47e",
		"--ui-widget-background": "#1a3038", "--ui-widget-focus": "#41201f", "--pitch-background": "#231012", "--tonic": "#0a3a45", "--fifth-note": "#3a2a12",
		"--white-piano-key": "#e5d8bd", "--black-piano-key": "#1a3038",
	};
	const mq = root.matchMedia ? root.matchMedia("(prefers-color-scheme: dark)") : null;
	function dark() { return !!(mq && mq.matches); }
	function css() {
		let base = root.beepbox.ColorConfig.themes[dark() ? "dark classic" : "light classic"];
		const OVERRIDES = dark() ? DARK : LIGHT;
		Object.keys(OVERRIDES).forEach(function (k) {
			const re = new RegExp("(" + k.replace(/[-]/g, "\\-") + "\\s*:)[^;]+;");
			base = re.test(base) ? base.replace(re, "$1 " + OVERRIDES[k] + ";") : base.replace(":root {", ":root {\n\t\t\t\t" + k + ": " + OVERRIDES[k] + ";");
		});
		return base;
	}
	NS.theme = {
		name: "asteria",
		install: function () {
			root.beepbox.ColorConfig.themes["asteria"] = css();
			if (mq && mq.addEventListener && !NS.theme._watching) {
				NS.theme._watching = true;
				mq.addEventListener("change", function () {
					root.beepbox.ColorConfig.themes["asteria"] = css();
					if (root.localStorage && root.localStorage.getItem("colorTheme") === "asteria") root.beepbox.ColorConfig.setTheme("asteria");
				});
			}
		},
		names: ["asteria", "dark classic", "light classic"],
	};
})(typeof window !== "undefined" ? window : globalThis);
