#!/usr/bin/env python3
"""Build the Asteria Technology brand: the mark, the app icons and the lockups, as SVG and PNG.

The mark is a folded A: one ribbon goes up the left leg, folds over the top and comes down the right, with a gold
four-pointed star in its heart (Asteria is the goddess of the stars). It is drawn as vector shapes on a 512 grid,
so it stays sharp at any size. Each product icon is a dark tile with the product's own sign and a small gold star.

The SVGs are the source; the PNGs, .ico and .icns are rendered from them by render_svg.swift (macOS's own SVG
renderer), so this needs a Mac with swiftc. Text in the lockups is set in Asteria Pixel, as rectangles traced from
font/asteria-pixel-glyphs.json, so nothing depends on an installed font.

    python3 brand/build_brand.py
"""
import json
import os
import shutil
import struct
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "logo")
GLYPHS = json.load(open(os.path.join(HERE, "font", "asteria-pixel-glyphs.json"), encoding="utf-8"))
COL = {"sea": "#1c8c9e", "bright": "#3bb3c3", "deep": "#116674", "abyss": "#0a3a45", "gold": "#e9b04b",
       "goldLight": "#ffd47e", "ink": "#0a1518", "night": "#12232a", "cream": "#f4ecdb", "paper": "#e5d8bd"}
SIZES = (16, 32, 48, 64, 128, 180, 192, 256, 512, 1024)

DEFS = ('<defs>'
        '<linearGradient id="front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%(bright)s"/><stop offset="1" stop-color="%(sea)s"/></linearGradient>'
        '<linearGradient id="fold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%(sea)s"/><stop offset="1" stop-color="%(deep)s"/></linearGradient>'
        '<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%(goldLight)s"/><stop offset="1" stop-color="%(gold)s"/></linearGradient>'
        '<linearGradient id="page" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%(cream)s"/><stop offset="1" stop-color="%(paper)s"/></linearGradient>'
        '</defs>') % COL


def poly(points, fill):
    return '<polygon points="%s" fill="%s"/>' % (" ".join("%g,%g" % p for p in points), fill)


def star(cx, cy, r, fill, k=0.2):
    """a four-pointed star whose sides curve inward"""
    q = k * r
    return ('<path d="M%g %g Q%g %g %g %gQ%g %g %g %gQ%g %g %g %gQ%g %g %g %gZ" fill="%s"/>'
            % (cx, cy - r, cx + q, cy - q, cx + r, cy, cx + q, cy + q, cx, cy + r, cx - q, cy + q, cx - r, cy, cx - q, cy - q, cx, cy - r, fill))


# ---------------------------------------------------------------- the mark, on a 512 grid
def mark_body(front="url(#front)", fold="url(#fold)", gold="url(#gold)"):
    """the folded A: the right leg sits behind (the fold), the left leg in front, and the star in the A's heart"""
    return (poly([(224, 96), (288, 96), (416, 416), (352, 416)], fold)
            + poly([(96, 416), (160, 416), (288, 96), (224, 96)], front)
            + star(256, 330, 52, gold))


def svg(body, w=512, h=512, bg=None, radius=0):
    out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">%s' % (w, h, w, h, DEFS)
    if bg:
        out += '<rect width="%d" height="%d" rx="%g" fill="%s"/>' % (w, h, radius, bg)
    return out + body + "</svg>"


def tile(body, bg=COL["ink"]):
    return svg(body, bg=bg, radius=114)


# ---------------------------------------------------------------- the products, each a sign on the dark tile
def rect(x, y, w, h, fill, r=0):
    return '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s"/>' % (x, y, w, h, r, fill)


def circle(cx, cy, r, fill):
    return '<circle cx="%g" cy="%g" r="%g" fill="%s"/>' % (cx, cy, r, fill)


def path(d, fill):
    return '<path d="%s" fill="%s"/>' % (d, fill)


SEA, GOLD, PAGE, DEEP = "url(#front)", "url(#gold)", "url(#page)", COL["deep"]
SIGNS = {
    # a pixel grid, the colours of a little sprite
    "sprite": "".join(rect(154 + 72 * c, 154 + 72 * r, 60, 60, f, 8) for r, row in enumerate(((PAGE, SEA, PAGE), (SEA, GOLD, SEA), (PAGE, SEA, PAGE))) for c, f in enumerate(row)),
    # levels on a mixing desk
    "box": "".join(rect(138 + 64 * i, 370 - h, 44, h, f, 10) for i, (h, f) in enumerate(((100, SEA), (180, SEA), (140, GOLD), (220, PAGE)))),
    # a cloud with an arrow going up into it
    "cloud": (circle(206, 270, 62, PAGE) + circle(288, 238, 84, PAGE) + circle(352, 292, 50, PAGE) + rect(144, 270, 258, 84, PAGE, 42)
              + path("M256 206 L310 262 L276 262 L276 330 L236 330 L236 262 L202 262 Z", GOLD)),
    # a page with lines of writing, and a gold margin
    "office": (path("M178 120 H300 L352 172 V392 H178 Z", PAGE) + path("M300 120 V172 H352 Z", COL["paper"]) + rect(150, 146, 14, 220, GOLD, 7)
               + rect(210, 214, 112, 16, DEEP, 8) + rect(210, 254, 112, 16, DEEP, 8) + rect(210, 294, 72, 16, DEEP, 8)),
    # a speech bubble
    "social": (rect(140, 150, 232, 168, PAGE, 44) + path("M196 306 L184 374 L252 316 Z", PAGE)
               + circle(204, 234, 16, DEEP) + circle(256, 234, 16, DEEP) + circle(308, 234, 16, DEEP)),
    # Swift: Zero to Hero, the course app: three steps rising towards the star, a code chevron on the first
    "zerotohero": (rect(118, 318, 88, 74, SEA, 12) + rect(212, 246, 88, 146, COL["bright"], 12)
                   + rect(306, 174, 88, 218, PAGE, 12)
                   + path("M142 336 L178 355 L142 374 L142 362 L158 355 L142 348 Z", PAGE)),
    # Food and Mood, the journal app: a bowl, with a leaf and a heart rising from it
    "foodandmood": (path("M222 258 C166 236 156 192 172 158 C222 166 252 212 222 258 Z", SEA)
                    + path("M304 250 C262 222 250 200 258 182 C266 164 294 164 304 184 C314 164 342 164 350 182 C358 200 346 222 304 250 Z", GOLD)
                    + path("M140 282 H372 A116 116 0 0 1 140 282 Z", PAGE) + rect(122, 262, 268, 26, COL["bright"], 13)),
    # an open book with a gold ribbon
    "learn": (path("M256 196 C216 168 172 162 128 170 V352 C172 344 216 348 256 376 Z", PAGE)
              + path("M256 196 C296 168 340 162 384 170 V352 C340 344 296 348 256 376 Z", COL["paper"])
              + rect(250, 192, 12, 186, DEEP, 6) + path("M300 168 H326 V236 L313 224 L300 236 Z", GOLD)),
}


def product_body(kind):
    return SIGNS[kind] + star(392, 120, 30, GOLD)


# ---------------------------------------------------------------- Asteria Pixel text, as rectangles
def text_width(s, u):
    t = GLYPHS["tracking"]
    return sum((len(GLYPHS["glyphs"].get(ch, GLYPHS["glyphs"]["?"])[0]) + t) * u for ch in s) - t * u


def text_svg_rects(s, x, y, u, colour):
    out = []
    for ch in s:
        g = GLYPHS["glyphs"].get(ch, GLYPHS["glyphs"]["?"])
        for r, row in enumerate(g):
            c = 0
            while c < len(row):
                if row[c] != "#":
                    c += 1
                    continue
                c0 = c
                while c < len(row) and row[c] == "#":
                    c += 1
                out.append('<rect x="%g" y="%g" width="%g" height="%g" fill="%s"/>' % (x + c0 * u, y + r * u, (c - c0) * u, u, colour))
        x += (len(g[0]) + GLYPHS["tracking"]) * u
    return "".join(out)


def nested(body, x, y, size):
    """the 512-grid mark placed at (x, y), size pixels square, inside a larger picture"""
    return '<g transform="translate(%g %g) scale(%g)">%s</g>' % (x, y, size / 512, body)


# ---------------------------------------------------------------- rendering
class Renderer:
    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix="asteria-brand-")
        self.bin = os.path.join(self.dir, "render_svg")
        subprocess.run(["swiftc", "-O", os.path.join(HERE, "render_svg.swift"), "-o", self.bin], check=True, capture_output=True)

    def png(self, svg_text, out, w, h=None):
        src = os.path.join(self.dir, "in.svg")
        open(src, "w").write(svg_text)
        subprocess.run([self.bin, src, out, str(w), str(h or w)], check=True)

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)


def ico(pngs, out):
    data = [open(p, "rb").read() for p in pngs]
    head = struct.pack("<HHH", 0, 1, len(data))
    off = 6 + 16 * len(data)
    for n, d in zip((16, 32, 48, 256), data):
        head += struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32, len(d), off)
        off += len(d)
    open(out, "wb").write(head + b"".join(data))


def icns(png_for_size, iconset, out):
    os.makedirs(iconset, exist_ok=True)
    for n, name in ((16, "16x16"), (32, "16x16@2x"), (32, "32x32"), (64, "32x32@2x"), (128, "128x128"), (256, "128x128@2x"),
                    (256, "256x256"), (512, "256x256@2x"), (512, "512x512"), (1024, "512x512@2x")):
        shutil.copyfile(png_for_size(n), os.path.join(iconset, "icon_%s.png" % name))
    subprocess.run(["iconutil", "-c", "icns", iconset, "-o", out], check=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    w = lambda name, s: open(os.path.join(OUT, name), "w").write(s)
    r = Renderer()
    try:
        mark = mark_body()
        w("mark.svg", svg(mark))
        w("mark-mono-ink.svg", svg(mark_body(COL["ink"], COL["ink"], COL["ink"])))
        w("mark-mono-cream.svg", svg(mark_body(COL["cream"], COL["cream"], COL["cream"])))
        w("app-icon.svg", tile(mark))
        # lockups: the mark beside ASTERIA over TECHNOLOGY
        for theme, fg, sub in (("dark", COL["cream"], COL["gold"]), ("light", COL["ink"], COL["deep"])):
            u, x0 = 5, 280
            lw = x0 + max(text_width("ASTERIA", u * 2), text_width("TECHNOLOGY", u)) + 24
            body = nested(mark, 0, 0, 256) + text_svg_rects("ASTERIA", x0, 60, u * 2, fg) + text_svg_rects("TECHNOLOGY", x0, 60 + 12 * u * 2, u, sub)
            w("lockup-%s.svg" % theme, svg(body, lw, 256))
        for n in SIZES:
            r.png(svg(mark), os.path.join(OUT, "mark-%d.png" % n), n)
            r.png(tile(mark), os.path.join(OUT, "app-icon-%d.png" % n), n)
        r.png(svg(nested(mark, 77, 77, 358), bg=COL["ink"]), os.path.join(OUT, "maskable-512.png"), 512)
        # link preview, 1200 x 630: the mark and the name on the night sky, with a few stars
        sky = "".join(circle(x, y, s, COL["cream"]) for x, y, s in ((90, 80, 2), (310, 520, 1.5), (660, 70, 2), (1100, 140, 2.5), (980, 560, 1.5), (560, 590, 2), (1140, 420, 1.5), (40, 400, 1.5)))
        og = svg(sky + nested(mark, 100, 125, 380) + text_svg_rects("ASTERIA", 520, 228, 12, COL["cream"]) + text_svg_rects("TECHNOLOGY", 520, 362, 6, COL["gold"]),
                 1200, 630, bg=COL["ink"])
        r.png(og, os.path.join(OUT, "og-1200x630.png"), 1200, 630)
        ico([os.path.join(OUT, "app-icon-%d.png" % n) for n in (16, 32, 48, 256)], os.path.join(OUT, "Asteria.ico"))
        icns(lambda n: os.path.join(OUT, "app-icon-%d.png" % n), os.path.join(OUT, "Asteria.iconset"), os.path.join(OUT, "Asteria.icns"))
        # product icons
        for kind in SIGNS:
            d = os.path.join(OUT, "products", kind)
            shutil.rmtree(d, ignore_errors=True)
            os.makedirs(d)
            icon = tile(product_body(kind))
            open(os.path.join(d, "%s-icon.svg" % kind), "w").write(icon)
            open(os.path.join(d, "%s-mark.svg" % kind), "w").write(icon)
            for n in SIZES:
                r.png(icon, os.path.join(d, "%s-%d.png" % (kind, n)), n)
            r.png(svg(nested(product_body(kind), 77, 77, 358), bg=COL["ink"]), os.path.join(d, "%s-maskable-512.png" % kind), 512)
            ico([os.path.join(d, "%s-%d.png" % (kind, n)) for n in (16, 32, 48, 256)], os.path.join(d, "%s.ico" % kind))
            icns(lambda n: os.path.join(d, "%s-%d.png" % (kind, n)), os.path.join(d, "%s.iconset" % kind), os.path.join(d, "%s.icns" % kind))
    finally:
        r.close()
    print("brand written to", OUT)


if __name__ == "__main__":
    main()
