"""Builds asteria.technology into site/.

Copies the brand, the two apps (from Asteria Sprite and Asteria Box checked out beside this repository), and the
desktop downloads (from dist/, made by tools/package.py) into site/, and writes a small note file per track for the
note roll on the home page. Railway serves site/ exactly as it is in the repository, so commit what this writes.

    python3 tools/build.py
"""
import json, os, shutil, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(REPO)
SITE = os.path.join(REPO, "site")
SKIP = shutil.ignore_patterns(".DS_Store", "*.iconset")


def replace_dir(src, dst):
    if not os.path.isdir(src):
        sys.exit("missing " + src + " (check it out beside this repository)")
    shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(src, dst, ignore=SKIP)


def brand():
    dst = os.path.join(SITE, "brand")
    os.makedirs(dst, exist_ok=True)
    shutil.copy(os.path.join(REPO, "brand", "tokens.css"), dst)
    for d in ("font", "logo"):
        replace_dir(os.path.join(REPO, "brand", d), os.path.join(dst, d))
    for junk in ("build_font.py", "asteria-pixel-glyphs.json"):
        p = os.path.join(dst, "font", junk)
        if os.path.exists(p):
            os.remove(p)


def apps():
    replace_dir(os.path.join(ROOT, "MNSprite", "src", "app"), os.path.join(SITE, "sprite"))
    replace_dir(os.path.join(ROOT, "MNBox", "src", "app"), os.path.join(SITE, "box"))


def rolls():
    """site/media/music/roll/NN-slug.json: every note as [channel, start tick, end tick, pitch]; drums use channel -1."""
    music = os.path.join(SITE, "media", "music")
    out = os.path.join(music, "roll")
    os.makedirs(out, exist_ok=True)
    for f in sorted(os.listdir(os.path.join(music, "src"))):
        song = json.load(open(os.path.join(music, "src", f)))
        tpbar = song["beatsPerBar"] * song["ticksPerBeat"]
        notes, pitches = [], []
        for ci, ch in enumerate(song["channels"]):
            drum = ch["type"] == "drum"
            for bar, pat in enumerate(ch["sequence"]):
                if not pat:
                    continue
                for n in ch["patterns"][pat - 1]["notes"]:
                    s, e = bar * tpbar + n["points"][0]["tick"], bar * tpbar + n["points"][-1]["tick"]
                    for p in n["pitches"]:
                        notes += [-1 if drum else ci, s, e, p]
                        if not drum:
                            pitches.append(p)
        data = {"tempo": song["beatsPerMinute"], "beatsPerBar": song["beatsPerBar"], "ticksPerBeat": song["ticksPerBeat"],
                "low": min(pitches), "high": max(pitches), "notes": notes}
        json.dump(data, open(os.path.join(out, f.replace(".song.json", ".json")), "w"), separators=(",", ":"))


def downloads():
    dist = os.path.join(REPO, "dist")
    if os.path.isdir(dist):
        replace_dir(dist, os.path.join(SITE, "downloads", "files"))


if __name__ == "__main__":
    brand(); apps(); rolls(); downloads()
    import runpy; runpy.run_path(os.path.join(REPO, "tools", "pages.py"))
    print("built", SITE)
