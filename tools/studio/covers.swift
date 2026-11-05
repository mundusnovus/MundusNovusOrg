// Made to Last: the cover art, drawn rather than pixelled. Night, aqua and heavy, with glass, glow and a little grain.
// Each cover is drawn at 3000 × 3000 and written three ways: a 3000 px JPEG (full resolution), and 1200 and 600 px
// PNGs for the site and the MP3 tags. Titles come from site/media/music/album-26.json.
//
//   swiftc -O tools/studio/covers.swift -o /tmp/covers && /tmp/covers      (then python3 tools/studio/retag.py)
import AppKit
import CoreImage
import CoreText

let S: CGFloat = 3000
let here = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let music = here.appendingPathComponent("../../site/media/music").standardized
let out = music.appendingPathComponent("covers-26")
let space = CGColorSpace(name: CGColorSpace.sRGB)!
let ci = CIContext(options: [.workingColorSpace: space])

func rgb(_ r: Int, _ g: Int, _ b: Int, _ a: CGFloat = 1) -> CGColor { CGColor(srgbRed: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: a) }
let aqua = rgb(0, 255, 211), heavy = rgb(255, 0, 88), night = rgb(5, 8, 15), ink = rgb(12, 18, 32), white = rgb(255, 255, 255)
func a(_ c: CGColor, _ alpha: CGFloat) -> CGColor { c.copy(alpha: alpha)! }

struct RNG { var s: UInt64
  mutating func next() -> CGFloat { s = s &* 6364136223846793005 &+ 1442695040888963407; return CGFloat((s >> 33) % 1_000_000) / 1_000_000 } }

// A context with the origin at the top left, like the page.
func canvas(_ size: CGFloat = S) -> CGContext {
  let c = CGContext(data: nil, width: Int(size), height: Int(size), bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  c.translateBy(x: 0, y: size); c.scaleBy(x: 1, y: -1); c.setLineCap(.round); c.setLineJoin(.round)
  c.interpolationQuality = .high
  return c
}
func paste(_ img: CGImage, into c: CGContext, alpha: CGFloat = 1, blend: CGBlendMode = .normal) {
  c.saveGState(); c.concatenate(c.ctm.inverted()); c.setAlpha(alpha); c.setBlendMode(blend)
  c.draw(img, in: CGRect(x: 0, y: 0, width: c.width, height: c.height)); c.restoreGState()
}
// Draw something, blur it, and lay it down as light.
func glow(_ c: CGContext, _ sigma: CGFloat, alpha: CGFloat = 1, _ draw: (CGContext) -> Void) {
  let l = canvas(); draw(l)
  let rect = CGRect(x: 0, y: 0, width: S, height: S)
  let blurred = CIImage(cgImage: l.makeImage()!).clampedToExtent().applyingGaussianBlur(sigma: sigma).cropped(to: rect)
  paste(ci.createCGImage(blurred, from: rect)!, into: c, alpha: alpha, blend: .screen)
}
func gradient(_ colors: [CGColor], _ stops: [CGFloat]? = nil) -> CGGradient { CGGradient(colorsSpace: space, colors: colors as CFArray, locations: stops)! }

// The Asteria star: four points, curved sides.
func star(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, pinch: CGFloat = 0.12) -> CGPath {
  let p = CGMutablePath(), k = r * pinch
  p.move(to: CGPoint(x: x, y: y - r))
  p.addQuadCurve(to: CGPoint(x: x + r, y: y), control: CGPoint(x: x + k, y: y - k))
  p.addQuadCurve(to: CGPoint(x: x, y: y + r), control: CGPoint(x: x + k, y: y + k))
  p.addQuadCurve(to: CGPoint(x: x - r, y: y), control: CGPoint(x: x - k, y: y + k))
  p.addQuadCurve(to: CGPoint(x: x, y: y - r), control: CGPoint(x: x - k, y: y - k))
  return p
}

// Text as outlines in SF Pro, so it can be filled, clipped and glowed like any other shape.
func text(_ s: String, _ size: CGFloat, _ weight: NSFont.Weight, tracking: CGFloat = 0, rounded: Bool = false) -> (path: CGPath, width: CGFloat) {
  var font = NSFont.systemFont(ofSize: size, weight: weight)
  if rounded, let d = font.fontDescriptor.withDesign(.rounded) { font = NSFont(descriptor: d, size: size) ?? font }
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: s, attributes: [.font: font, .kern: tracking]))
  let path = CGMutablePath()
  for run in CTLineGetGlyphRuns(line) as! [CTRun] {
    let n = CTRunGetGlyphCount(run), f = (CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] as! CTFont
    var g = [CGGlyph](repeating: 0, count: n), pos = [CGPoint](repeating: .zero, count: n)
    CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &g); CTRunGetPositions(run, CFRange(location: 0, length: 0), &pos)
    for i in 0..<n { if let gp = CTFontCreatePathForGlyph(f, g[i], nil) { path.addPath(gp, transform: CGAffineTransform(translationX: pos[i].x, y: pos[i].y)) } }
  }
  return (path, CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil)))
}
func place(_ p: CGPath, x: CGFloat, baseline: CGFloat) -> CGPath {
  var t = CGAffineTransform(translationX: x, y: baseline).scaledBy(x: 1, y: -1); return p.copy(using: &t)!
}

// Night sky: two coloured lights, a field of stars, a few sparkles.
func sky(_ c: CGContext, seed: UInt64, aquaAt: CGPoint, heavyAt: CGPoint) {
  c.setFillColor(night); c.fill(CGRect(x: 0, y: 0, width: S, height: S))
  c.drawRadialGradient(gradient([a(ink, 1), a(night, 0)]), startCenter: CGPoint(x: S / 2, y: S * 0.45), startRadius: 0, endCenter: CGPoint(x: S / 2, y: S * 0.45), endRadius: S * 0.8, options: [])
  c.drawRadialGradient(gradient([a(aqua, 0.34), a(aqua, 0)]), startCenter: aquaAt, startRadius: 0, endCenter: aquaAt, endRadius: S * 0.62, options: [])
  c.drawRadialGradient(gradient([a(heavy, 0.30), a(heavy, 0)]), startCenter: heavyAt, startRadius: 0, endCenter: heavyAt, endRadius: S * 0.55, options: [])
  var r = RNG(s: seed)
  for _ in 0..<260 {
    let x = r.next() * S, y = r.next() * S, d = 2 + r.next() * 7
    c.setFillColor(a(white, 0.15 + r.next() * 0.55)); c.fillEllipse(in: CGRect(x: x, y: y, width: d, height: d))
  }
  for i in 0..<7 {
    let x = r.next() * S, y = r.next() * S * 0.75, rad = 18 + r.next() * 34
    c.setFillColor(a(i % 3 == 0 ? heavy : white, 0.85)); c.addPath(star(x, y, rad)); c.fillPath()
  }
}
// Liquid glass: a translucent fill, a light rim, and a highlight along the top.
func glass(_ c: CGContext, _ p: CGPath, tint: CGColor = white, rim: CGFloat = 7) {
  c.saveGState(); c.addPath(p); c.clip()
  let b = p.boundingBox
  c.drawLinearGradient(gradient([a(tint, 0.16), a(tint, 0.04), a(tint, 0.08)], [0, 0.6, 1]), start: CGPoint(x: b.minX, y: b.minY), end: CGPoint(x: b.maxX, y: b.maxY), options: [])
  c.restoreGState()
  c.saveGState(); c.addPath(p); c.setLineWidth(rim); c.replacePathWithStrokedPath(); c.clip()
  c.drawLinearGradient(gradient([a(white, 0.75), a(aqua, 0.35), a(heavy, 0.45), a(white, 0.2)], [0, 0.35, 0.7, 1]), start: CGPoint(x: b.minX, y: b.minY), end: CGPoint(x: b.maxX, y: b.maxY), options: [])
  c.restoreGState()
}
func grain(_ c: CGContext, alpha: CGFloat = 0.07) {
  let rect = CGRect(x: 0, y: 0, width: S, height: S)
  let n = CIFilter(name: "CIRandomGenerator")!.outputImage!.cropped(to: rect).applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0])
  paste(ci.createCGImage(n, from: rect)!, into: c, alpha: alpha, blend: .overlay)
}
func stroke(_ c: CGContext, _ p: CGPath, _ color: CGColor, _ w: CGFloat) { c.addPath(p); c.setStrokeColor(color); c.setLineWidth(w); c.strokePath() }
func fill(_ c: CGContext, _ p: CGPath, _ color: CGColor) { c.addPath(p); c.setFillColor(color); c.fillPath() }
func fillGradient(_ c: CGContext, _ p: CGPath, _ colors: [CGColor], from: CGPoint, to: CGPoint) {
  c.saveGState(); c.addPath(p); c.clip(); c.drawLinearGradient(gradient(colors), start: from, end: to, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]); c.restoreGState()
}
func rounded(_ r: CGRect, _ radius: CGFloat) -> CGPath { CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil) }

// The words along the bottom: number, title (one or two lines), and the album.
func label(_ c: CGContext, n: Int, title: String) {
  let lines = title.components(separatedBy: "\n"), size: CGFloat = lines.count > 1 ? 190 : 210
  var y = S - 300 - CGFloat(lines.count - 1) * size * 1.02
  let num = text(String(format: "%02d", n), 64, .semibold, tracking: 6)
  if n > 0 { fill(c, place(num.path, x: 230, baseline: y - size - 40), a(aqua, 0.95)) }
  for l in lines { fill(c, place(text(l, size, .bold, tracking: -4).path, x: 222, baseline: y), white); y += size * 1.02 }
  let foot = text(n > 0 ? "MADE TO LAST  ·  ASTERIA TECHNOLOGY" : "ASTERIA TECHNOLOGY  ·  THE SOUNDTRACK", 54, .semibold, tracking: 14)
  fill(c, place(foot.path, x: 230, baseline: S - 150), a(white, 0.6))
}

typealias Art = (CGContext) -> Void
let C = CGPoint(x: S / 2, y: S * 0.4)

let art: [String: Art] = [
  // Nobody's Watching: an eye, firmly shut.
  "first-light": { c in
    let lid = CGMutablePath(); lid.move(to: CGPoint(x: 780, y: 1150)); lid.addQuadCurve(to: CGPoint(x: 2220, y: 1150), control: CGPoint(x: 1500, y: 1750))
    var lashes: [CGPath] = []
    for i in 1...7 { let t = CGFloat(i) / 8, x = 780 + 1440 * t, y = 1150 + 600 * 2 * t * (1 - t) * 1, dx = (t - 0.5) * 260
      let l = CGMutablePath(); l.move(to: CGPoint(x: x, y: y)); l.addLine(to: CGPoint(x: x + dx, y: y + 190)); lashes.append(l) }
    let ring = CGPath(ellipseIn: CGRect(x: 600, y: 520, width: 1800, height: 1320), transform: nil)
    glass(c, ring, rim: 9)
    glow(c, 60) { g in stroke(g, lid, aqua, 90); lashes.forEach { stroke(g, $0, aqua, 60) } }
    stroke(c, lid, a(aqua, 1), 64); lashes.forEach { stroke(c, $0, aqua, 40) }
    glow(c, 40) { g in fill(g, star(2230, 640, 150), heavy) }; fill(c, star(2230, 640, 120), heavy)
  },
  // It Compiled, Ship It: a code window and a check that does not ask questions.
  "clean-build": { c in
    let win = rounded(CGRect(x: 520, y: 470, width: 1960, height: 1300), 90)
    glass(c, win)
    for (i, d) in [(0, 0.5), (1, 0.7), (2, 0.38), (3, 0.62), (4, 0.3), (5, 0.55)].enumerated() {
      let x = 660 + (d.0 % 3 == 1 ? 90 : 0) as CGFloat, w = 1400 * CGFloat(d.1)
      fill(c, rounded(CGRect(x: x, y: 640 + CGFloat(i) * 170, width: w, height: 56), 28), a(i % 2 == 0 ? aqua : white, i % 2 == 0 ? 0.35 : 0.18))
    }
    for (i, col) in [heavy, rgb(255, 196, 0), aqua].enumerated() { fill(c, CGPath(ellipseIn: CGRect(x: 640 + CGFloat(i) * 90, y: 530, width: 50, height: 50), transform: nil), a(col, 0.8)) }
    let check = CGMutablePath(); check.move(to: CGPoint(x: 1300, y: 1250)); check.addLine(to: CGPoint(x: 1650, y: 1600)); check.addLine(to: CGPoint(x: 2420, y: 760))
    glow(c, 80) { g in stroke(g, check, heavy, 260) }
    stroke(c, check, heavy, 190); stroke(c, check, a(white, 0.35), 40)
  },
  // Password123 (A Lament): the password, struck out; the keyhole, lit up.
  "many-hands": { c in
    let field = rounded(CGRect(x: 430, y: 1380, width: 2140, height: 400), 200)
    glass(c, field)
    for i in 0..<9 { fill(c, CGPath(ellipseIn: CGRect(x: 640 + CGFloat(i) * 200, y: 1530, width: 100, height: 100), transform: nil), a(white, 0.85)) }
    let strike = CGMutablePath(); strike.move(to: CGPoint(x: 560, y: 1660)); strike.addLine(to: CGPoint(x: 2440, y: 1500))
    glow(c, 40) { g in stroke(g, strike, heavy, 70) }; stroke(c, strike, heavy, 46)
    let hole = CGMutablePath(); hole.addEllipse(in: CGRect(x: 1250, y: 330, width: 500, height: 500))
    hole.move(to: CGPoint(x: 1400, y: 700)); hole.addLine(to: CGPoint(x: 1330, y: 1180)); hole.addLine(to: CGPoint(x: 1670, y: 1180)); hole.addLine(to: CGPoint(x: 1600, y: 700)); hole.closeSubpath()
    glow(c, 90) { g in fill(g, hole, aqua) }
    fillGradient(c, hole, [aqua, rgb(0, 160, 140)], from: CGPoint(x: 1500, y: 330), to: CGPoint(x: 1500, y: 1180))
  },
  // The Price Is the Price: one tag, one number, no asterisk.
  "fair-price": { c in
    let tag = CGMutablePath()
    tag.move(to: CGPoint(x: 900, y: 600)); tag.addLine(to: CGPoint(x: 2300, y: 600)); tag.addArc(tangent1End: CGPoint(x: 2400, y: 600), tangent2End: CGPoint(x: 2400, y: 700), radius: 100)
    tag.addLine(to: CGPoint(x: 2400, y: 1500)); tag.addArc(tangent1End: CGPoint(x: 2400, y: 1600), tangent2End: CGPoint(x: 2300, y: 1600), radius: 100)
    tag.addLine(to: CGPoint(x: 900, y: 1600)); tag.addLine(to: CGPoint(x: 520, y: 1100)); tag.closeSubpath()
    tag.addEllipse(in: CGRect(x: 760, y: 1030, width: 140, height: 140))
    var t = CGAffineTransform(translationX: 1500, y: 1100).rotated(by: -0.18).translatedBy(x: -1500, y: -1100)
    let p = tag.copy(using: &t)!
    glow(c, 70, alpha: 0.7) { g in stroke(g, p, aqua, 40) }
    glass(c, p, tint: aqua, rim: 10)
    let d = text("$", 900, .black, rounded: true)
    var tt = CGAffineTransform(translationX: 1500, y: 1100).rotated(by: -0.18).translatedBy(x: -1500, y: -1100)
    let dollar = place(d.path, x: 1650 - d.width / 2, baseline: 1420).copy(using: &tt)!
    glow(c, 50) { g in fill(g, dollar, heavy) }; fill(c, dollar, heavy)
  },
  // Ten Blue Links, Zero Ads: a lens that keeps the good ones and sends the rest to sit down.
  "signal": { c in
    let lens = CGPath(ellipseIn: CGRect(x: 760, y: 360, width: 1300, height: 1300), transform: nil)
    let handle = CGMutablePath(); handle.move(to: CGPoint(x: 1880, y: 1480)); handle.addLine(to: CGPoint(x: 2330, y: 1930))
    glass(c, lens, tint: aqua)
    for (i, w) in [900, 760, 620, 480].enumerated() { fill(c, rounded(CGRect(x: 960, y: 700 + CGFloat(i) * 170, width: CGFloat(w), height: 70), 35), a(aqua, 0.9 - CGFloat(i) * 0.15)) }
    var r = RNG(s: 55)
    for _ in 0..<6 { let x = 300 + r.next() * 2300, y = 1750 + r.next() * 150, w = 160 + r.next() * 260
      fill(c, rounded(CGRect(x: x, y: y, width: w, height: 40), 20), a(heavy, 0.35)) }
    glow(c, 60) { g in stroke(g, lens, aqua, 90); stroke(g, handle, heavy, 170) }
    stroke(c, lens, aqua, 60); stroke(c, handle, heavy, 140)
  },
  // Clocked Out, Not Sorry: nine to five, and not a minute more.
  "keystone": { c in
    let face = CGRect(x: 800, y: 380, width: 1400, height: 1400), ctr = CGPoint(x: face.midX, y: face.midY), R: CGFloat = 700
    glass(c, CGPath(ellipseIn: face, transform: nil))
    for i in 0..<12 { let ang = CGFloat(i) / 12 * .pi * 2 - .pi / 2, r0 = R - (i % 3 == 0 ? 150 : 100), r1 = R - 50
      let t = CGMutablePath(); t.move(to: CGPoint(x: ctr.x + cos(ang) * r0, y: ctr.y + sin(ang) * r0)); t.addLine(to: CGPoint(x: ctr.x + cos(ang) * r1, y: ctr.y + sin(ang) * r1))
      stroke(c, t, a(white, i % 3 == 0 ? 0.85 : 0.4), i % 3 == 0 ? 30 : 18) }
    let arc = CGMutablePath(); arc.addArc(center: ctr, radius: R + 120, startAngle: -.pi / 2 + .pi * 2 * 9 / 12, endAngle: -.pi / 2 + .pi * 2 * 17 / 12, clockwise: false)
    glow(c, 50) { g in stroke(g, arc, heavy, 90) }; stroke(c, arc, heavy, 60)
    let hour = CGMutablePath(), minute = CGMutablePath(), ha = -CGFloat.pi / 2 + .pi * 2 * 5 / 12
    hour.move(to: ctr); hour.addLine(to: CGPoint(x: ctr.x + cos(ha) * 380, y: ctr.y + sin(ha) * 380))
    minute.move(to: ctr); minute.addLine(to: CGPoint(x: ctr.x, y: ctr.y - 560))
    glow(c, 40) { g in stroke(g, hour, aqua, 110); stroke(g, minute, aqua, 80) }
    stroke(c, hour, aqua, 80); stroke(c, minute, aqua, 52); fill(c, CGPath(ellipseIn: CGRect(x: ctr.x - 60, y: ctr.y - 60, width: 120, height: 120), transform: nil), white)
  },
  // Skip Ad (There Is No Ad): the frame where the ad would go, empty, and a button with nothing to skip.
  "quiet-screen": { c in
    let frame = rounded(CGRect(x: 380, y: 520, width: 2240, height: 1260), 80)
    glass(c, frame)
    c.saveGState(); c.setLineDash(phase: 0, lengths: [60, 50]); stroke(c, rounded(CGRect(x: 520, y: 660, width: 1960, height: 980), 50), a(white, 0.25), 12); c.restoreGState()
    fill(c, star(1500, 1100, 210), a(aqua, 0.95))
    glow(c, 60) { g in fill(g, star(1500, 1100, 260), aqua) }
    let pill = rounded(CGRect(x: 1700, y: 1500, width: 820, height: 210), 105)
    glow(c, 50, alpha: 0.8) { g in fill(g, pill, heavy) }
    fill(c, pill, heavy)
    let t = text("Skip Ad  ›", 110, .semibold); fill(c, place(t.path, x: 2110 - t.width / 2, baseline: 1645), white)
  },
  // Version 26 (Groundbreaking): the year, as a number, in glass.
  "made-to-last": { c in
    let t = text("26", 1500, .black, tracking: -60, rounded: true), p = place(t.path, x: 1500 - t.width / 2 - 20, baseline: 1720)
    glow(c, 110) { g in fill(g, p, aqua) }
    fillGradient(c, p, [aqua, rgb(120, 255, 230), heavy], from: CGPoint(x: 700, y: 500), to: CGPoint(x: 2300, y: 1800))
    c.saveGState(); c.addPath(p); c.clip(); c.drawLinearGradient(gradient([a(white, 0.5), a(white, 0)]), start: CGPoint(x: 0, y: 500), end: CGPoint(x: 0, y: 1000), options: []); c.restoreGState()
    stroke(c, p, a(white, 0.5), 8)
    fill(c, star(2420, 520, 130), heavy)
  },
]

// The album: the star at the middle of everything, with an orbit for the apps.
let albumArt: Art = { c in
  let orbit = CGMutablePath(); orbit.addEllipse(in: CGRect(x: -950, y: -330, width: 1900, height: 660))
  var t = CGAffineTransform(translationX: 1500, y: 1130).rotated(by: -0.32); let o = orbit.copy(using: &t)!
  glass(c, CGPath(ellipseIn: CGRect(x: 830, y: 460, width: 1340, height: 1340), transform: nil), tint: aqua, rim: 10)
  glow(c, 120) { g in fill(g, star(1500, 1130, 760, pinch: 0.1), aqua) }
  fillGradient(c, star(1500, 1130, 640, pinch: 0.1), [rgb(150, 255, 236), aqua, rgb(0, 170, 145)], from: CGPoint(x: 1500, y: 490), to: CGPoint(x: 1500, y: 1770))
  glow(c, 50) { g in stroke(g, o, heavy, 70) }; stroke(c, o, heavy, 44)
  fill(c, star(2330, 560, 120), heavy); fill(c, star(2520, 760, 60), a(white, 0.9))
}

func save(_ img: CGImage, _ name: String) {
  func write(_ i: CGImage, _ file: String, _ type: NSBitmapImageRep.FileType, _ props: [NSBitmapImageRep.PropertyKey: Any] = [:]) {
    try! NSBitmapImageRep(cgImage: i).representation(using: type, properties: props)!.write(to: out.appendingPathComponent(file))
  }
  write(img, name + "-3000.jpg", .jpeg, [.compressionFactor: 0.9])
  for s in [1200, 600] as [CGFloat] {
    let c = CGContext(data: nil, width: Int(s), height: Int(s), bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    c.interpolationQuality = .high; c.draw(img, in: CGRect(x: 0, y: 0, width: s, height: s)); write(c.makeImage()!, name + "-\(Int(s)).png", .png)
  }
  print("wrote", name)
}

struct Track: Decodable { let n: Int; let slug: String; let title: String }
struct Album: Decodable { let album: String; let tracks: [Track] }
let album = try! JSONDecoder().decode(Album.self, from: Data(contentsOf: music.appendingPathComponent("album-26.json")))
let lights: [(CGPoint, CGPoint)] = [(CGPoint(x: 600, y: 500), CGPoint(x: 2600, y: 2300)), (CGPoint(x: 2500, y: 400), CGPoint(x: 400, y: 2000)), (CGPoint(x: 1500, y: 200), CGPoint(x: 2700, y: 1600)),
  (CGPoint(x: 300, y: 1200), CGPoint(x: 2700, y: 600)), (CGPoint(x: 1400, y: 900), CGPoint(x: 2600, y: 2600)), (CGPoint(x: 2400, y: 1300), CGPoint(x: 500, y: 300)),
  (CGPoint(x: 900, y: 2200), CGPoint(x: 2300, y: 500)), (CGPoint(x: 1500, y: 1100), CGPoint(x: 300, y: 2600))]
// Long titles break where they read best.
func broken(_ t: String) -> String {
  if t.count <= 16 { return t }
  if let r = t.range(of: " (") { return String(t[..<r.lowerBound]) + "\n" + String(t[t.index(after: r.lowerBound)...]) }
  if let r = t.range(of: ", ") { return String(t[..<r.upperBound]).trimmingCharacters(in: .whitespaces) + "\n" + String(t[r.upperBound...]) }
  let w = t.split(separator: " "), h = (w.count + 1) / 2
  return w[..<h].joined(separator: " ") + "\n" + w[h...].joined(separator: " ")
}
for (i, tr) in album.tracks.enumerated() {
  let c = canvas(), l = lights[i % lights.count]
  sky(c, seed: UInt64(tr.n * 7919), aquaAt: l.0, heavyAt: l.1)
  art[tr.slug]?(c)
  label(c, n: tr.n, title: broken(tr.title))
  grain(c)
  save(c.makeImage()!, String(format: "%02d-", tr.n) + tr.slug)
}
let c = canvas()
sky(c, seed: 2026, aquaAt: CGPoint(x: 900, y: 700), heavyAt: CGPoint(x: 2500, y: 2100))
albumArt(c)
label(c, n: 0, title: album.album)
grain(c)
save(c.makeImage()!, "album")
