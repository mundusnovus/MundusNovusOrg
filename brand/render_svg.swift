// Renders an SVG to a PNG at an exact pixel size, with transparency, using macOS's own SVG support.
// Used by build_brand.py:  render_svg IN.svg OUT.png WIDTH [HEIGHT]
import AppKit

let a = CommandLine.arguments
guard a.count >= 4, let img = NSImage(contentsOf: URL(fileURLWithPath: a[1])), let w = Int(a[3]) else {
    FileHandle.standardError.write("usage: render_svg IN.svg OUT.png WIDTH [HEIGHT]\n".data(using: .utf8)!)
    exit(1)
}
let h = a.count > 4 ? Int(a[4]) ?? w : w
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
                           hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
rep.size = NSSize(width: w, height: h)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSGraphicsContext.current?.imageInterpolation = .high
img.draw(in: NSRect(x: 0, y: 0, width: w, height: h))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
