"""Writes the site's pages that share the home page's header and footer: the Sprite and Box home pages
(site/hosts/<app>/), Downloads, Source and the 404 page. The home page (site/index.html) is the template.

    python3 tools/pages.py        (tools/build.py runs it too)
"""
import os, re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(REPO, "site")
home = open(os.path.join(SITE, "index.html")).read()
HEAD = home[:home.index("<body>")]
BAR = home[home.index('<a class="skip"'):home.index('<main id="main">')]
FOOT = home[home.index("<footer"):]


def page(path, title, desc, body, url, here=None, main_class=""):
    head = HEAD.replace("<title>Christian Systems</title>", "<title>" + title + "</title>")
    head = re.sub(r'(<meta name="description" content=")[^"]*', lambda m: m.group(1) + desc, head)
    head = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + title, head)
    head = re.sub(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + desc, head)
    head = re.sub(r'(<meta property="og:url" content=")[^"]*', lambda m: m.group(1) + url, head)
    bar = BAR.replace('<a href="/downloads/">', '<a href="/downloads/" data-sub="main" data-path="/downloads/">').replace('<a href="/source/">', '<a href="/source/" data-sub="main" data-path="/source/">')
    if here:
        bar = bar.replace('data-sub="' + here + '">', 'data-sub="' + here + '" aria-current="page">', 1)
    out = os.path.join(SITE, path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w").write(head + "<body>\n" + bar + '<main id="main"' + (' class="' + main_class + '"' if main_class else "") + ">\n" + body.strip() + "\n</main>\n\n" + FOOT)


def also(*keys):
    cards = {"sprite": ("ChristianSprite", "Pixel art and animation.", "sprite"), "box": ("ChristianBox", "Music, from chiptune to a full band.", "box"),
             "social": ("Social", "Share what you make, with one Christian Systems account.", "social")}
    out = ['<section class="open" aria-labelledby="also-title"><h2 id="also-title" class="display reveal">Also from Christian Systems</h2><div class="cards">']
    for k in keys:
        n, d, sub = cards[k]
        out.append('<article class="card reveal"><h3>%s</h3><p>%s</p><a href="https://%s.christiansystems.org/" data-sub="%s">Open %s</a></article>' % (n, d, sub, sub, n.replace("Christian", "")))
    out.append('<article class="card reveal"><h3>Everything, downloadable</h3><p>Every app for every platform, with checksums.</p><a href="/downloads/" data-sub="main" data-path="/downloads/">Downloads</a></article></div></section>')
    return "\n".join(out)


def agent(key, name, ask, gives):
    prompt = ("Make me %s with %s. Get it from https://github.com/christiansystems/%s (download the ZIP or clone it), "
              "read AGENTS.md in it, and follow it. Here is what I want: %s. When you are done, give me %s.") % (ask[0], name, name, ask[1], gives)
    return """
<section class="agent" id="agent" aria-labelledby="agent-title">
  <div class="copy reveal">
    <p class="eyebrow">Work with your agent</p>
    <h2 id="agent-title" class="display">Ask your agent</h2>
    <p>%s comes with instructions for AI agents. An agent that can run code can use the same tools as the editor's own assistant, and hand you a file you can open here and keep working on.</p>
    <ol class="steps">
      <li><b>Claude.</b> In the Claude desktop app, open Cowork, give it a folder to work in, and paste the prompt.</li>
      <li><b>ChatGPT.</b> Start a task in agent mode, or in Codex, and paste the prompt.</li>
      <li><b>Change the last sentence</b> to say what you want. Then open the file it gives you in the <a href="/app/">editor</a>.</li>
    </ol>
  </div>
  <figure class="prompt reveal">
    <pre id="prompt-%s">%s</pre>
    <button class="btn primary" type="button" data-copy="prompt-%s">Copy the prompt</button>
  </figure>
</section>
""" % (name, key, prompt.replace("&", "&amp;").replace("<", "&lt;"), key)


SPRITE = """
<section class="hero app-hero" aria-labelledby="hero-title">
  <img class="app-icon reveal" src="/brand/logo/products/sprite/sprite-256.png" width="112" height="112" alt="">
  <h1 id="hero-title" class="display reveal">Christian<b>Sprite</b></h1>
  <p class="lede reveal">Draw, animate and export pixel art. Describe a sprite and the assistant draws it with you, one step you can undo at a time.</p>
  <div class="actions reveal"><a class="btn primary" href="/app/">Open the editor</a><a class="btn" href="#download">Download</a></div>
</section>
<section class="product" aria-label="A sprite being drawn">
  <figure class="window reveal" style="grid-column: 1 / -1; max-width: 760px; margin: 0 auto; width: 100%" aria-label="A sprite being drawn, pixel by pixel">
    <div class="window-bar"><i></i><i></i><i></i><span>lantern.asprite.json</span></div>
    <div class="sprite-stage"><canvas id="spriteCanvas" width="16" height="16"></canvas><ol class="palette" id="spritePalette" aria-hidden="true"></ol></div>
  </figure>
</section>
<section aria-labelledby="what-title"><h2 id="what-title" class="display reveal" style="text-align:center; font-size: var(--cs-step-3); margin: 0 0 48px">What it does</h2>
<div class="features">
  <div class="reveal"><h3>Layers and frames</h3><p>Blend modes, onion skin, tags and playback. Indexed or full colour.</p></div>
  <div class="reveal"><h3>Brushes that shade</h3><p>Pixel-perfect pencil, shading and dither brushes, gradients, mirror and tiled drawing.</p></div>
  <div class="reveal"><h3>Clean transforms</h3><p>Outline, drop shadow, light-direction shading, and rotation that keeps pixels crisp.</p></div>
  <div class="reveal"><h3>Palettes</h3><p>Build ramps, import GPL, hex, JASC or PNG, or start from a classic.</p></div>
  <div class="reveal"><h3>Ready for games</h3><p>Sprite sheets with Aseprite-compatible JSON and Godot resources, plus PNG, GIF and APNG.</p></div>
  <div class="reveal"><h3>An assistant at your side</h3><p>It works with your own Anthropic key, kept on your device, and every step can be undone. Or <a href="#agent">ask your own agent</a>.</p></div>
</div></section>
<section class="download-section" id="download" aria-labelledby="dl-title"><h2 id="dl-title" class="display reveal">Download</h2><div data-downloads data-app="sprite"></div></section>
""" + agent("sprite", "ChristianSprite", ("a sprite", "a 32 by 32 knight with a lantern, four frames of walking, in warm colours"), "the .asprite.json project and a sprite sheet") + also("box", "social")

BOX = """
<section class="hero app-hero" aria-labelledby="hero-title">
  <img class="app-icon reveal" src="/brand/logo/products/box/box-256.png" width="112" height="112" alt="">
  <h1 id="hero-title" class="display reveal">Christian<b>Box</b></h1>
  <p class="lede reveal">Write music, from chiptune to a whole band. The Composer writes with you, and every change can be undone.</p>
  <div class="actions reveal"><a class="btn primary" href="/app/">Open the editor</a><a class="btn" href="#download">Download</a></div>
</section>
<section class="product" aria-label="The notes of the song now playing">
  <figure class="window reveal" style="grid-column: 1 / -1; max-width: 900px; margin: 0 auto; width: 100%" aria-label="The notes of the song now playing">
    <div class="window-bar"><i></i><i></i><i></i><span id="rollTitle">first-light.beepbox</span></div>
    <canvas class="roll" id="roll" width="640" height="360"></canvas>
    <button class="roll-play" id="rollPlay" type="button" aria-label="Play this song">▶</button>
  </figure>
</section>
<section aria-labelledby="what-title"><h2 id="what-title" class="display reveal" style="text-align:center; font-size: var(--cs-step-3); margin: 0 0 48px">What it does</h2>
<div class="features">
  <div class="reveal"><h3>A band</h3><p>Distorted and clean guitars, bass, organ, strings, choir, piano, bells and a real drum kit.</p></div>
  <div class="reveal"><h3>Riffs</h3><p>Power chords that chug, gallop or push, and a pulse bass that hammers.</p></div>
  <div class="reveal"><h3>A mix that balances itself</h3><p>Auto mix listens to each part and sets the volumes against the lead.</p></div>
  <div class="reveal"><h3>Ready to share</h3><p>Mastered MP3s with even loudness, title tags and cover art. WAV, MIDI and seamless game loops too.</p></div>
  <div class="reveal"><h3>The Composer</h3><p>Describe a song and it writes one, or asks before it changes yours. It works with your own Anthropic key. Or <a href="#agent">ask your own agent</a>.</p></div>
  <div class="reveal"><h3>Built on BeepBox</h3><p>Every BeepBox song opens here. ChristianBox is free and open source, like BeepBox itself.</p></div>
</div></section>
<section class="music" id="music" aria-labelledby="music-title">
  <div class="album reveal">
    <img id="albumCover" src="/media/music/covers/album-600.png" width="600" height="600" alt="Freely Given, cover">
    <div>
      <p class="eyebrow">Made in ChristianBox</p>
      <h2 id="music-title" class="display">Freely Given</h2>
      <p class="quiet" id="albumMeta">Eight tracks · Christian Systems · 2026</p>
      <div class="player" id="player" aria-label="Music player">
        <button class="btn primary round" id="playBtn" type="button" aria-label="Play">▶</button>
        <div class="now"><strong id="nowTitle">First Light</strong><span id="nowAbout"></span>
          <div class="progress" id="progress" role="slider" aria-label="Position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><i id="progressFill"></i></div>
        </div>
      </div>
    </div>
  </div>
  <ol class="tracks reveal" id="tracks"></ol>
</section>
<section class="download-section" id="download" aria-labelledby="dl-title"><h2 id="dl-title" class="display reveal">Download</h2><div data-downloads data-app="box"></div></section>
""" + agent("box", "ChristianBox", ("a song", "a two-minute rock song in E minor at 160 bpm, with distorted guitars, an organ and a choir"), "the .beepbox song and a WAV") + also("sprite", "social")

DOWNLOADS = """
<h1 class="display">Downloads</h1>
<p>Every Christian Systems app, free, for every platform. Pick yours; we started with this computer's.</p>
<div data-downloads></div>
<h2 class="display" id="all">Every file</h2>
<p>Each file has a SHA-256 checksum, so you can check it arrived unchanged.</p>
<div data-download-table></div>
<h2 class="display">Opening them the first time</h2>
<ul>
<li><b>macOS.</b> Open the disk image and drag the app to Applications. The first time, right-click the app and choose Open, because it is not yet notarized by Apple.</li>
<li><b>Windows.</b> Unzip the folder and double-click the <code>.cmd</code> file. The app opens in Microsoft Edge as its own window.</li>
<li><b>Linux.</b> Install the <code>.deb</code> with your software installer, or unpack the <code>.tar.gz</code> and run the launcher inside.</li>
<li><b>Phones and tablets.</b> Open <a href="https://sprite.christiansystems.org/app/" data-sub="sprite" data-path="/app/">Sprite</a> or <a href="https://box.christiansystems.org/app/" data-sub="box" data-path="/app/">Box</a> in your browser and add it to your home screen.</li>
</ul>
<p>The source of every app is on the <a href="/source/" data-sub="main" data-path="/source/">source page</a>.</p>
"""

page("hosts/sprite/index.html", "ChristianSprite", "A free, open-source pixel-art editor and animator. Use it in your browser or download it.", SPRITE, "https://sprite.christiansystems.org/", "sprite")
page("hosts/box/index.html", "ChristianBox", "A free, open-source music maker built on BeepBox. Use it in your browser or download it.", BOX, "https://box.christiansystems.org/", "box")
page("downloads/index.html", "Downloads · Christian Systems", "Download ChristianSprite and ChristianBox for macOS, Windows and Linux.", DOWNLOADS, "https://christiansystems.org/downloads/", None, "page")
page("source/index.html", "Source · Christian Systems", "The source of everything Christian Systems makes, and the Christian Systems License.", open(os.path.join(REPO, "tools", "source-body.html")).read(), "https://christiansystems.org/source/", None, "page")
page("404.html", "Not here · Christian Systems", "There is nothing at this address.", '<h1 class="display">Not here</h1><p>There is nothing at this address. Try the <a href="/" data-sub="main">home page</a>.</p>', "https://christiansystems.org/", None, "page")
# the downloads link in the bar is marked on its own page
p = os.path.join(SITE, "downloads", "index.html")
text = open(p).read()
open(p, "w").write(text.replace('<a href="/downloads/" data-sub="main" data-path="/downloads/">', '<a href="/downloads/" data-sub="main" data-path="/downloads/" aria-current="page">', 1))
print("pages written")
