#!/usr/bin/env python3
"""Build Chancel, the Christian Systems typeface, as TrueType (.ttf) and WOFF (.woff) from chancel-glyphs.json.

Pure standard library. Each glyph's pixels are traced into one clean outline (no overlapping squares),
so the font renders without seams at any size.

    python3 brand/font/build_font.py            # writes brand/font/Chancel-Regular.{ttf,woff}
"""
import json
import os
import struct
import time
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = HERE
SRC = json.load(open(os.path.join(HERE, "chancel-glyphs.json"), encoding="utf-8"))
CAP = SRC["capHeight"]

PX = 100            # font units per pixel
UPM = 1000
ASC, DESC, GAP = 1000, 300, 100
VERSION = "1.000"
FAMILY = "Chancel"
COPYRIGHT = "Copyright 2026 Christian Systems"
LICENSE = "Christian Systems License 1.0: GPL-3.0-only, with permission to embed the font in documents and works of your own. See LICENSE."
LICENSE_URL = "https://openfontlicense.org"
DESCRIPTION = SRC["description"]


# ---------------------------------------------------------------- outlines
def trace(rows):
    """Trace the ink pixels of a glyph into clockwise (outer) / counter-clockwise (hole) contours, y-up, in pixels."""
    edges = set()
    for r, row in enumerate(rows):
        y = CAP - 1 - r  # bottom of this pixel row; the last cap row sits on the baseline
        for x, ch in enumerate(row):
            if ch != "#":
                continue
            for e in (((x, y), (x, y + 1)), ((x, y + 1), (x + 1, y + 1)), ((x + 1, y + 1), (x + 1, y)), ((x + 1, y), (x, y))):
                rev = (e[1], e[0])
                if rev in edges:
                    edges.remove(rev)
                else:
                    edges.add(e)
    out = {}
    for a, b in edges:
        out.setdefault(a, []).append(b)
    contours = []
    while out:
        start = next(iter(out))
        pts, cur, prev_dir = [start], start, None
        while True:
            nexts = out[cur]
            if len(nexts) == 1 or prev_dir is None:
                nxt = nexts[0]
            else:  # pinch point: prefer a right turn, then straight, then left, to keep loops simple
                right = (prev_dir[1], -prev_dir[0])
                order = [right, prev_dir, (-right[0], -right[1])]
                nxt = min(nexts, key=lambda p: order.index((p[0] - cur[0], p[1] - cur[1])))
            nexts.remove(nxt)
            if not nexts:
                del out[cur]
            prev_dir = (nxt[0] - cur[0], nxt[1] - cur[1])
            cur = nxt
            if cur == start:
                break
            pts.append(cur)
        contours.append(simplify(pts))
    return contours


def simplify(pts):
    """Drop points that lie on a straight line between their neighbours."""
    n, keep = len(pts), []
    for i in range(n):
        a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
        if (b[0] - a[0]) * (c[1] - b[1]) != (b[1] - a[1]) * (c[0] - b[0]):
            keep.append(b)
    return keep


# ---------------------------------------------------------------- tables
def checksum(data):
    data += b"\0" * (-len(data) % 4)
    return sum(struct.unpack(">%dI" % (len(data) // 4), data)) & 0xFFFFFFFF


def glyph_record(contours, lsb_px):
    if not contours:
        return b"", (0, 0, 0, 0), 0
    pts = [(int((x + lsb_px) * PX), int(y * PX)) for c in contours for (x, y) in c]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    ends, n = [], 0
    for c in contours:
        n += len(c)
        ends.append(n - 1)
    data = struct.pack(">hhhhh", len(contours), *bbox)
    data += struct.pack(">%dH" % len(ends), *ends) + struct.pack(">H", 0)
    data += bytes([1]) * len(pts)  # every point on-curve, full 16-bit deltas
    px = py = 0
    xd, yd = b"", b""
    for x, y in pts:
        xd += struct.pack(">h", x - px)
        yd += struct.pack(">h", y - py)
        px, py = x, y
    data += xd + yd
    return data, bbox, len(pts)


def name_table(names):
    recs, strings = [], b""
    for nid, text in sorted(names.items()):
        for plat, enc, lang, raw in ((1, 0, 0, text.encode("mac_roman", "replace")), (3, 1, 0x409, text.encode("utf-16-be"))):
            recs.append((plat, enc, lang, nid, len(raw), len(strings)))
            strings += raw
    recs.sort()
    head = struct.pack(">HHH", 0, len(recs), 6 + 12 * len(recs))
    return head + b"".join(struct.pack(">6H", *r) for r in recs) + strings


def cmap_table(code_to_gid):
    codes = sorted(c for c in code_to_gid if c <= 0xFFFF)
    segs = [(c, c, (code_to_gid[c] - c) & 0xFFFF) for c in codes] + [(0xFFFF, 0xFFFF, 1)]
    n = len(segs)
    sr = 2 * (1 << (n.bit_length() - 1))
    sub = struct.pack(">7H", 4, 0, 0, 2 * n, sr, (n.bit_length() - 1), 2 * n - sr)
    sub += struct.pack(">%dH" % n, *[s[1] for s in segs]) + struct.pack(">H", 0)
    sub += struct.pack(">%dH" % n, *[s[0] for s in segs])
    sub += struct.pack(">%dH" % n, *[s[2] for s in segs])
    sub += struct.pack(">%dH" % n, *([0] * n))
    sub = sub[:2] + struct.pack(">H", len(sub)) + sub[4:]
    return struct.pack(">HH", 0, 2) + struct.pack(">HHI", 0, 3, 20) + struct.pack(">HHI", 3, 1, 20) + sub


def sfnt(tables):
    tags = sorted(tables)
    n = len(tags)
    es = n.bit_length() - 1
    sr = (1 << es) * 16
    head = struct.pack(">IHHHH", 0x00010000, n, sr, es, n * 16 - sr)
    offset, dirs, body = 12 + 16 * n, b"", b""
    for t in tags:
        d = tables[t]
        dirs += struct.pack(">4sIII", t.encode(), checksum(d), offset, len(d))
        pad = d + b"\0" * (-len(d) % 4)
        body += pad
        offset += len(pad)
    return head + dirs + body


def woff(tables, font):
    tags = sorted(tables)
    entries, data = [], b""
    offset = 44 + 20 * len(tags)
    for t in tags:
        orig = tables[t]
        comp = zlib.compress(orig, 9)
        if len(comp) >= len(orig):
            comp = orig
        entries.append(struct.pack(">4sIIII", t.encode(), offset, len(comp), len(orig), checksum(orig)))
        pad = comp + b"\0" * (-len(comp) % 4)
        data += pad
        offset += len(pad)
    total_sfnt = 12 + 16 * len(tags) + sum(len(tables[t]) + (-len(tables[t]) % 4) for t in tags)
    head = struct.pack(">4sIIHHIHHIIIII", b"wOFF", 0x00010000, offset, len(tags), 0, total_sfnt, 1, 0, 0, 0, 0, 0, 0)
    return head + b"".join(entries) + data


def embolden(rows):
    """Classic pixel bold: every stroke grows one pixel to the right."""
    return ["".join("#" if (c < len(r) and r[c] == "#") or (c > 0 and r[c - 1] == "#") else " " for c in range(len(r) + 1)) for r in rows]


def build(STYLE):
    bold = STYLE == "Bold"
    src = SRC
    G = {k: (embolden(v) if bold else v) for k, v in src["glyphs"].items()}
    if bold:
        G.update(src.get("boldOverrides", {}))
    notdef = ["#####", "#   #", "#   #", "#   #", "#   #", "#   #", "#####"]
    order = [(".notdef", None, notdef)] + [(ch, ord(ch), G[ch]) for ch in sorted(G, key=ord)]

    glyf, loca, hmtx = b"", [], b""
    cmap = {}
    bboxes, max_pts, max_ctr, adv_max, widths = [], 0, 0, 0, []
    for gid, (name, code, rows) in enumerate(order):
        w = len(rows[0])
        advance = (w + src["tracking"]) * PX
        contours = trace(rows)
        data, bbox, npts = glyph_record(contours, src["tracking"] / 2)
        loca.append(len(glyf))
        glyf += data + b"\0" * (-len(data) % 4)
        hmtx += struct.pack(">Hh", advance, bbox[0])
        if contours:
            bboxes.append(bbox)
        max_pts, max_ctr, adv_max = max(max_pts, npts), max(max_ctr, len(contours)), max(adv_max, advance)
        widths.append(advance)
        if code is not None:
            cmap[code] = gid
    loca.append(len(glyf))
    n = len(order)
    xmin, ymin = min(b[0] for b in bboxes), min(b[1] for b in bboxes)
    xmax, ymax = max(b[2] for b in bboxes), max(b[3] for b in bboxes)
    min_rsb = min(widths[i] - (bb[2]) for i, bb in enumerate([(0, 0, 0, 0)] + bboxes[: n - 1]))

    now = int(time.time()) + 2082844800  # seconds since 1904-01-01
    head = struct.pack(">IIIIHHqqhhhhHHhhh", 0x00010000, 0x00010000, 0, 0x5F0F3CF5, 0x0009, UPM, now, now,
                       xmin, ymin, xmax, ymax, 1 if bold else 0, 8, 2, 1, 0)
    hhea = struct.pack(">IhhhHhhhhhhhhhhhH", 0x00010000, ASC, -DESC, GAP, adv_max, 0, min_rsb, xmax, 1, 0, 0,
                       0, 0, 0, 0, 0, n)
    maxp = struct.pack(">IHHHHHHHHHHHHHH", 0x00010000, n, max_pts, max_ctr, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0)
    codes = sorted(cmap)
    os2 = struct.pack(">HhHHHhhhhhhhhhhh10sIIII4sHHHhhhHHII hhHHH".replace(" ", ""),
                      4, int(sum(widths) / len(widths)), 700 if bold else 400, 5, 0,
                      650, 600, 0, 75, 650, 600, 0, 350, 100, 300, 0,
                      bytes([2, 0, 6, 9, 0, 0, 0, 0, 0, 0]), 0b11, 0, 0, 0, b"CMWL",
                      (0x0020 if bold else 0x0040) | 0x0080, codes[0], min(codes[-1], 0xFFFF), ASC, -DESC, GAP, ASC, DESC, 1, 0,
                      500, 700, 0, 32, 1)
    names = {0: COPYRIGHT, 1: FAMILY, 2: STYLE, 3: "%s;CSYS;%s-%s" % (VERSION, FAMILY, STYLE), 4: "%s %s" % (FAMILY, STYLE),
             5: "Version " + VERSION, 6: "%s-%s" % (FAMILY, STYLE), 8: "Christian Systems", 9: "Christian Systems",
             10: DESCRIPTION, 13: LICENSE, 14: LICENSE_URL}
    post = struct.pack(">IIhhIIIII", 0x00030000, 0, -100, 100, 0, 0, 0, 0, 0)
    tables = {"head": head, "hhea": hhea, "maxp": maxp, "OS/2": os2, "hmtx": hmtx, "cmap": cmap_table(cmap),
              "loca": struct.pack(">%dI" % len(loca), *loca), "glyf": glyf, "name": name_table(names), "post": post}

    font = sfnt(tables)
    adj = (0xB1B0AFBA - checksum(font)) & 0xFFFFFFFF
    tables["head"] = head[:8] + struct.pack(">I", adj) + head[12:]
    font = sfnt(tables)

    os.makedirs(OUT, exist_ok=True)
    base = os.path.join(OUT, "%s-%s" % (FAMILY, STYLE))
    open(base + ".ttf", "wb").write(font)
    open(base + ".woff", "wb").write(woff(tables, font))
    print("%s %s: %d glyphs, %d bytes TTF" % (FAMILY, STYLE, n, len(font)))


if __name__ == "__main__":
    build("Regular")
