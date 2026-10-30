/* MNBox: the "mundus" colour theme for BeepBox (Mundus Novus ink, cream, red and gold). Derived from BeepBox's own "dark classic"
 * variables at start-up, so upstream themes stay untouched and new upstream variables are inherited. */
(function (root) {
	"use strict";
	const NS = (root.CBox = root.CBox || {});
	// Light is stone and cream with a deep red; dark is ink with red and gold. Song colours (the pitch channels and notes) stay upstream.
	const LIGHT = {
		"--page-margin": "#faf7f0", "--editor-background": "#fffdf9", "--hover-preview": "#0c1222", "--playhead": "#17449a",
		"--primary-text": "#0c1222", "--secondary-text": "#4a5468", "--inverted-text": "#fffdf9", "--text-selection": "rgba(242,179,61,0.4)",
		"--box-selection-fill": "rgba(168,21,27,0.14)", "--loop-accent": "#17449a", "--link-accent": "#17449a",
		"--ui-widget-background": "#efe9dc", "--ui-widget-focus": "#e5d8bd", "--pitch-background": "#efe9dc", "--tonic": "#f6d6c4", "--fifth-note": "#f3e2b8",
		"--white-piano-key": "#fffdf9", "--black-piano-key": "#4a5468",
	};
	const DARK = {
		"--page-margin": "#0c1222", "--editor-background": "#1a0a0c", "--hover-preview": "#f4ecdb", "--playhead": "#e9b04b",
		"--primary-text": "#f4ecdb", "--secondary-text": "#b4bdd0", "--inverted-text": "#0c1222", "--text-selection": "rgba(242,179,61,0.4)",
		"--box-selection-fill": "rgba(242,179,61,0.16)", "--loop-accent": "#2a62c9", "--link-accent": "#ffd47e",
		"--ui-widget-background": "#1c2742", "--ui-widget-focus": "#41201f", "--pitch-background": "#231012", "--tonic": "#0c2558", "--fifth-note": "#3a2a12",
		"--white-piano-key": "#e5d8bd", "--black-piano-key": "#1c2742",
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
		name: "mundus",
		install: function () {
			root.beepbox.ColorConfig.themes["mundus"] = css();
			if (mq && mq.addEventListener && !NS.theme._watching) {
				NS.theme._watching = true;
				mq.addEventListener("change", function () {
					root.beepbox.ColorConfig.themes["mundus"] = css();
					if (root.localStorage && root.localStorage.getItem("colorTheme") === "mundus") root.beepbox.ColorConfig.setTheme("mundus");
				});
			}
		},
		names: ["mundus", "dark classic", "light classic"],
	};
})(typeof window !== "undefined" ? window : globalThis);
