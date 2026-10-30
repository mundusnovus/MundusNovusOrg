#!/usr/bin/env python3
"""Build the Mundus Novus brand: the mark, the app icons and the lockups, as SVG and PNG.

The mark is a globus cruciger: a sea-blue world with a gold band round its middle and up over its top, parchment
land in the new hemisphere below, and a small gold cross standing on it. It is drawn on a 64-unit grid, so it can be
reproduced by hand, in pixels or in vector. Text in the lockups is set in Chancel,
rasterised from font/chancel-glyphs.json, so the PNGs and SVGs never depend on an installed font.

Pure standard library.  python3 brand/build_brand.py
"""
import json
import os
import struct
import subprocess
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "logo")
GLYPHS = json.load(open(os.path.join(HERE, "font", "chancel-glyphs.json"), encoding="utf-8"))
COL = {"sea": "#2a62c9", "deep": "#17449a", "abyss": "#0c2558", "gold": "#e9b04b", "goldLight": "#ffd47e",
       "ink": "#0c1222", "night": "#131c31", "cream": "#f4ecdb", "paper": "#e5d8bd", "white": "#ffffff"}


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------- the mark, as rectangles on a 64 grid
CX, CY, R = 32, 39, 21          # the world: a disc drawn row by row


def orb_rows(colour):
    out = []
    for y in range(CY - R, CY + R):
        dy = y + .5 - CY
        hw = (R * R - dy * dy) ** .5
        x0, x1 = round(CX - hw), round(CX + hw)
        if x1 > x0:
            out.append((x0, y, x1 - x0, 1, colour))
    return out


def clip(rects):
    """keep each rectangle's rows only where they fall on the world"""
    out = []
    for x, y, w, h, f in rects:
        for yy in range(y, y + h):
            dy = yy + .5 - CY
            if abs(dy) >= R:
                continue
            hw = (R * R - dy * dy) ** .5
            a, b = max(x, round(CX - hw)), min(x + w, round(CX + hw))
            if b > a:
                out.append((a, yy, b - a, 1, f))
    return out


def merge(rects):
    """join rows of the same colour and span back into taller rectangles, so the SVGs stay small"""
    out = []
    for r in sorted(rects, key=lambda r: (r[0], r[2], r[4], r[1])):
        if out and out[-1][0] == r[0] and out[-1][2] == r[2] and out[-1][4] == r[4] and out[-1][1] + out[-1][3] == r[1]:
            out[-1] = (r[0], out[-1][1], r[2], out[-1][3] + r[3], r[4])
        else:
            out.append(r)
    return sorted(out, key=lambda r: (r[1], r[0]))


def cross_rects(colour):
    return [(29, 1, 6, 18, colour), (22, 6, 20, 5, colour)]   # stands on the world; its bar a little high


LAND = [(14, 44, 16, 3), (16, 47, 13, 2), (19, 49, 8, 2), (23, 51, 4, 2),            # north, then the narrow middle,
        (24, 53, 9, 2), (25, 55, 8, 2), (26, 57, 6, 1), (27, 58, 4, 1),                # then south: the new world
        (41, 44, 9, 2), (42, 46, 7, 3), (44, 49, 3, 2)]                                # and the old world's edge


def mark_rects(c=None):
    """(x, y, w, h, colour) on a 64x64 grid. c overrides colours for one-colour versions: orb, gold, land."""
    orb, gold, land = (c or {}).get("orb", COL["sea"]), (c or {}).get("gold", COL["gold"]), (c or {}).get("land", COL["cream"])
    layers = [orb_rows(orb), clip([(x, y, w, h, land) for x, y, w, h in LAND]),
              clip([(CX - R, 37, 2 * R, 4, gold), (30, CY - R, 4, 20, gold)])]   # the band, and its arc over the top
    return [r for layer in layers for r in merge(layer)] + cross_rects(gold)


FACES = {
    # each product keeps the world and puts its own sign on it (a 64 grid, inside 18..46, then lowered onto the
    # world). Only the Mundus Novus mark carries the cross, so it stays quiet.
    "cloud": [(19, 29, 26, 12, "cream"), (23, 24, 18, 6, "cream"), (28, 20, 8, 5, "cream"), (30, 33, 4, 9, "gold"), (24, 31, 16, 2, "gold"), (26, 29, 12, 2, "gold"), (28, 27, 8, 2, "gold"), (30, 25, 4, 2, "gold")],
    "office": [(23, 19, 18, 26, "cream"), (27, 24, 10, 3, "deep"), (27, 30, 10, 3, "deep"), (27, 36, 6, 3, "deep"), (19, 23, 3, 22, "gold")],
    "sprite": [(21, 21, 7, 7, "cream"), (37, 21, 7, 7, "cream"), (29, 29, 7, 7, "gold"), (21, 37, 7, 7, "cream"), (37, 37, 7, 7, "cream"),
               (29, 21, 7, 7, "deep"), (21, 29, 7, 7, "deep"), (37, 29, 7, 7, "deep"), (29, 37, 7, 7, "deep")],
    "box": [(20, 34, 5, 10, "cream"), (27, 26, 5, 18, "cream"), (34, 30, 5, 14, "gold"), (41, 22, 4, 22, "cream")],
    "social": [(19, 21, 26, 16, "cream"), (23, 37, 6, 5, "cream"), (23, 27, 4, 4, "deep"), (30, 27, 4, 4, "deep"), (37, 27, 4, 4, "deep")],
}
FACE_DROP = 7


PRODUCT_LIFT = 7               # without the cross the world sits in the middle


def product_rects(kind, orb=None):
    face = [(x, y + FACE_DROP, w, h, COL[c]) for x, y, w, h, c in FACES[kind]]
    return [(x, y - PRODUCT_LIFT, w, h, f) for x, y, w, h, f in merge(orb_rows(orb or COL["sea"])) + face]


def mark_svg(size=64, c=None, bg=None, radius=0, rects=None):
    rects = rects or mark_rects(c)
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="%d" height="%d" shape-rendering="crispEdges">' % (size, size)]
    if bg:
        out.append('<rect width="64" height="64" rx="%g" fill="%s"/>' % (radius, bg))
    for x, y, w, h, f in rects:
        out.append('<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>' % (x, y, w, h, f))
    out.append("</svg>")
    return "".join(out)


# ---------------------------------------------------------------- a tiny canvas and PNG writer
class Canvas:
    def __init__(self, w, h, bg=None):
        self.w, self.h = w, h
        self.px = bytearray((list(rgb(bg)) + [255] if bg else [0, 0, 0, 0]) * (w * h))

    def rect(self, x, y, w, h, colour, alpha=255):
        r, g, b = rgb(colour)
        for yy in range(max(0, int(y)), min(self.h, int(y + h))):
            for xx in range(max(0, int(x)), min(self.w, int(x + w))):
                i = (yy * self.w + xx) * 4
                if alpha == 255:
                    self.px[i:i + 4] = bytes((r, g, b, 255))
                else:
                    a = alpha / 255
                    for k, v in enumerate((r, g, b)):
                        self.px[i + k] = int(self.px[i + k] * (1 - a) + v * a)
                    self.px[i + 3] = max(self.px[i + 3], alpha)

    def round_mask(self, radius):
        """clear the corners outside a rounded rectangle (for app icons)"""
        for y in range(self.h):
            for x in range(self.w):
                cx = radius if x < radius else self.w - radius - 1 if x >= self.w - radius else x
                cy = radius if y < radius else self.h - radius - 1 if y >= self.h - radius else y
                if (x - cx) ** 2 + (y - cy) ** 2 > radius * radius:
                    self.px[(y * self.w + x) * 4 + 3] = 0

    def png(self, path):
        raw = b"".join(b"\x00" + bytes(self.px[y * self.w * 4:(y + 1) * self.w * 4]) for y in range(self.h))
        def chunk(t, d):
            return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
        data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", self.w, self.h, 8, 6, 0, 0, 0)) + \
            chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
        open(path, "wb").write(data)
        return data


def draw_mark(cv, x0, y0, unit, c=None, rects=None):
    for x, y, w, h, f in rects or mark_rects(c):
        cv.rect(x0 + x * unit, y0 + y * unit, w * unit, h * unit, f)


def text_width(s, u):
    t = GLYPHS["tracking"]
    return sum((len(GLYPHS["glyphs"].get(ch, GLYPHS["glyphs"]["?"])[0]) + t) * u for ch in s) - t * u


def draw_text(cv, s, x, y, u, colour):
    for ch in s:
        g = GLYPHS["glyphs"].get(ch, GLYPHS["glyphs"]["?"])
        for r, row in enumerate(g):
            for c, p in enumerate(row):
                if p == "#":
                    cv.rect(x + c * u, y + r * u, u, u, colour)
        x += (len(g[0]) + GLYPHS["tracking"]) * u


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
                out.append('<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>' % (x + c0 * u, y + r * u, (c - c0) * u, u, colour))
        x += (len(g[0]) + GLYPHS["tracking"]) * u
    return "".join(out)


def main():
    os.makedirs(OUT, exist_ok=True)
    w = lambda name, s: open(os.path.join(OUT, name), "w").write(s)
    # SVGs
    w("mark.svg", mark_svg(64))
    w("mark-mono-ink.svg", mark_svg(64, {"orb": COL["ink"], "gold": COL["ink"], "land": COL["cream"]}))
    w("mark-mono-cream.svg", mark_svg(64, {"orb": COL["cream"], "gold": COL["cream"], "land": COL["ink"]}))
    w("app-icon.svg", mark_svg(64, bg=COL["ink"], radius=14))
    for theme, fg, sub in (("dark", COL["cream"], COL["gold"]), ("light", COL["ink"], COL["deep"])):
        u, x0 = 4, 300
        lw = x0 + max(text_width("MUNDUS", u), text_width("NOVUS", u)) + 24
        s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d 256" shape-rendering="crispEdges">' % lw]
        s.append(mark_svg(256).replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256" shape-rendering="crispEdges">', '<svg x="0" y="0" width="256" height="256" viewBox="0 0 64 64">'))
        s.append(text_svg_rects("MUNDUS", x0, 70, u, fg) + text_svg_rects("NOVUS", x0, 70 + 12 * u, u, sub))
        s.append("</svg>")
        w("lockup-%s.svg" % theme, "".join(s))
    # PNGs: the mark and app icons at every size the apps and site need
    for n in (16, 32, 48, 64, 128, 180, 192, 256, 512, 1024):
        cv = Canvas(n, n); draw_mark(cv, 0, 0, n / 64); cv.png(os.path.join(OUT, "mark-%d.png" % n))
        cv = Canvas(n, n, COL["ink"]); draw_mark(cv, n * 0.1, n * 0.1, n * 0.8 / 64)
        if n >= 64:
            cv.round_mask(int(n * 0.2237))  # the platform squircle's corner, approximately
        cv.png(os.path.join(OUT, "app-icon-%d.png" % n))
    cv = Canvas(512, 512, COL["sea"]); draw_mark(cv, 512 * .2, 512 * .2, 512 * .6 / 64, {"orb": COL["ink"], "gold": COL["gold"], "land": COL["cream"]}); cv.png(os.path.join(OUT, "maskable-512.png"))
    # link preview, 1200x630
    cv = Canvas(1200, 630, COL["ink"])
    for y in range(0, 630, 6):
        cv.rect(0, y, 1200, 1, COL["night"])
    draw_mark(cv, 120, 155, 5)
    draw_text(cv, "MUNDUS", 520, 220, 10, COL["cream"])
    draw_text(cv, "NOVUS", 520, 340, 10, COL["gold"])
    cv.png(os.path.join(OUT, "og-1200x630.png"))
    # macOS .icns and Windows .ico
    iconset = os.path.join(OUT, "MundusNovus.iconset")
    os.makedirs(iconset, exist_ok=True)
    for n, name in ((16, "16x16"), (32, "16x16@2x"), (32, "32x32"), (64, "32x32@2x"), (128, "128x128"), (256, "128x128@2x"), (256, "256x256"), (512, "256x256@2x"), (512, "512x512"), (1024, "512x512@2x")):
        open(os.path.join(iconset, "icon_%s.png" % name), "wb").write(open(os.path.join(OUT, "app-icon-%d.png" % n), "rb").read())
    if subprocess.run(["which", "iconutil"], capture_output=True).returncode == 0:
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(OUT, "MundusNovus.icns")], check=True)
    pngs = [open(os.path.join(OUT, "app-icon-%d.png" % n), "rb").read() for n in (16, 32, 48, 256)]
    ico = struct.pack("<HHH", 0, 1, len(pngs)); off = 6 + 16 * len(pngs)
    for n, d in zip((16, 32, 48, 256), pngs):
        ico += struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32, len(d), off); off += len(d)
    open(os.path.join(OUT, "MundusNovus.ico"), "wb").write(ico + b"".join(pngs))
    # product icons: MNSprite, MNBox, MNSocial
    for kind in FACES:
        d = os.path.join(OUT, "products", kind); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "%s-icon.svg" % kind), "w").write(mark_svg(64, bg=COL["ink"], radius=14, rects=product_rects(kind)))
        open(os.path.join(d, "%s-mark.svg" % kind), "w").write(mark_svg(64, rects=product_rects(kind)))
        for n in (16, 32, 48, 64, 128, 180, 192, 256, 512, 1024):
            cv = Canvas(n, n, COL["ink"]); draw_mark(cv, n * 0.1, n * 0.1, n * 0.8 / 64, rects=product_rects(kind))
            if n >= 64:
                cv.round_mask(int(n * 0.2237))
            cv.png(os.path.join(d, "%s-%d.png" % (kind, n)))
        cv = Canvas(512, 512, COL["sea"]); draw_mark(cv, 512 * .2, 512 * .2, 512 * .6 / 64, rects=product_rects(kind, orb=COL["ink"])); cv.png(os.path.join(d, "%s-maskable-512.png" % kind))
        iconset = os.path.join(d, "%s.iconset" % kind); os.makedirs(iconset, exist_ok=True)
        for n, name in ((16, "16x16"), (32, "16x16@2x"), (32, "32x32"), (64, "32x32@2x"), (128, "128x128"), (256, "128x128@2x"), (256, "256x256"), (512, "256x256@2x"), (512, "512x512"), (1024, "512x512@2x")):
            open(os.path.join(iconset, "icon_%s.png" % name), "wb").write(open(os.path.join(d, "%s-%d.png" % (kind, n)), "rb").read())
        if subprocess.run(["which", "iconutil"], capture_output=True).returncode == 0:
            subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(d, "%s.icns" % kind)], check=True)
        pngs = [open(os.path.join(d, "%s-%d.png" % (kind, n)), "rb").read() for n in (16, 32, 48, 256)]
        ico = struct.pack("<HHH", 0, 1, len(pngs)); off = 6 + 16 * len(pngs)
        for n, dd in zip((16, 32, 48, 256), pngs):
            ico += struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32, len(dd), off); off += len(dd)
        open(os.path.join(d, "%s.ico" % kind), "wb").write(ico + b"".join(pngs))
    print("brand written to", OUT)


if __name__ == "__main__":
    main()
