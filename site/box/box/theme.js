/* ChristianBox: the "christian" colour theme for BeepBox (Christian Systems ink, cream, red and gold). Derived from BeepBox's own "dark classic"
 * variables at start-up, so upstream themes stay untouched and new upstream variables are inherited. */
(function (root) {
	"use strict";
	const NS = (root.CBox = root.CBox || {});
	// Light is stone and cream with a deep red; dark is ink with red and gold. Song colours (the pitch channels and notes) stay upstream.
	const LIGHT = {
		"--page-margin": "#faf6f0", "--editor-background": "#fffdf9", "--hover-preview": "#140708", "--playhead": "#a8151b",
		"--primary-text": "#140708", "--secondary-text": "#5b4a46", "--inverted-text": "#fffdf9", "--text-selection": "rgba(242,179,61,0.4)",
		"--box-selection-fill": "rgba(168,21,27,0.14)", "--loop-accent": "#a8151b", "--link-accent": "#a8151b",
		"--ui-widget-background": "#f3ece2", "--ui-widget-focus": "#e8d8c3", "--pitch-background": "#f3ece2", "--tonic": "#f6d6c4", "--fifth-note": "#f3e2b8",
		"--white-piano-key": "#fffdf9", "--black-piano-key": "#5b4a46",
	};
	const DARK = {
		"--page-margin": "#140708", "--editor-background": "#1a0a0c", "--hover-preview": "#f6ebdd", "--playhead": "#f2b33d",
		"--primary-text": "#f6ebdd", "--secondary-text": "#cbb8a6", "--inverted-text": "#140708", "--text-selection": "rgba(242,179,61,0.4)",
		"--box-selection-fill": "rgba(242,179,61,0.16)", "--loop-accent": "#e3261c", "--link-accent": "#ffd36b",
		"--ui-widget-background": "#2a1416", "--ui-widget-focus": "#41201f", "--pitch-background": "#231012", "--tonic": "#4a0a0f", "--fifth-note": "#3a2a12",
		"--white-piano-key": "#e8d8c3", "--black-piano-key": "#2a1416",
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
		name: "christian",
		install: function () {
			root.beepbox.ColorConfig.themes["christian"] = css();
			if (mq && mq.addEventListener && !NS.theme._watching) {
				NS.theme._watching = true;
				mq.addEventListener("change", function () {
					root.beepbox.ColorConfig.themes["christian"] = css();
					if (root.localStorage && root.localStorage.getItem("colorTheme") === "christian") root.beepbox.ColorConfig.setTheme("christian");
				});
			}
		},
		names: ["christian", "dark classic", "light classic"],
	};
})(typeof window !== "undefined" ? window : globalThis);
