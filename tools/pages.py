"""Writes the site's pages that share the home page's header and footer: the Sprite and Box home pages
(site/hosts/<app>/), Downloads, Source and the 404 page. The home page (site/index.html) is the template.

    python3 tools/pages.py        (tools/build.py runs it too)
"""
import os, re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(REPO, "site")
home = open(os.path.join(SITE, "index.html")).read()
HEAD = home[:home.index("<body>")]
BAR = home[home.index('<a class="skip"'):home.index('<main id="main"')]
FOOT = home[home.index("<footer"):]


def page(path, title, desc, body, url, here=None, main_class=""):
    head = re.sub(r"<title>[^<]*</title>", "<title>" + title + "</title>", HEAD, count=1)
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
    cards = {"sprite": ("Asteria Sprite", "Pixel art and animation.", "sprite"), "box": ("Asteria Box", "Music, from chiptune to a full band.", "box"),
             "social": ("Social", "Share what you make, with one Asteria account.", "social"),
             "cloud": ("Asteria Cloud", "3 GB for your files from Sprite, Box and Office.", "cloud")}
    out = ['<section class="open" aria-labelledby="also-title"><h2 id="also-title" class="display reveal">Also from Asteria Technology</h2><div class="cards">']
    for k in keys:
        n, d, sub = cards[k]
        out.append('<article class="card reveal"><h3>%s</h3><p>%s</p><a href="https://%s.asteria.technology/" data-sub="%s">Open %s</a></article>' % (n, d, sub, sub, n.replace("Asteria ", "")))
    out.append('<article class="card reveal"><h3>Creative tools to download</h3><p>Sprite and Box for desktop platforms, with checksums.</p><a href="/downloads/" data-sub="main" data-path="/downloads/">Downloads</a></article></div></section>')
    return "\n".join(out)


def agent(key, name, ask, gives):
    prompt = ("Make me %s with %s. Get it from https://github.com/mundusnovus/%s (download the ZIP or clone it), "
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
  <h1 id="hero-title" class="display reveal">Asteria<wbr><b>Sprite</b></h1>
  <p class="lede reveal">Draw, animate and export pixel art. Describe a sprite and the assistant draws it with you, one step you can undo at a time.</p>
  <div class="actions reveal"><a class="btn primary" href="/app/">Open the editor</a><a class="btn" href="#download">Download</a></div>
</section>
<section class="product" aria-label="A sprite being drawn">
  <figure class="window reveal" style="grid-column: 1 / -1; max-width: 760px; margin: 0 auto; width: 100%" aria-label="A sprite being drawn, pixel by pixel">
    <div class="window-bar"><i></i><i></i><i></i><span>lantern.asprite.json</span></div>
    <div class="sprite-stage"><canvas id="spriteCanvas" width="16" height="16"></canvas><ol class="palette" id="spritePalette" aria-hidden="true"></ol></div>
  </figure>
</section>
<section aria-labelledby="what-title"><h2 id="what-title" class="display reveal" style="text-align:center; font-size: var(--as-step-3); margin: 0 0 48px">What it does</h2>
<div class="features">
  <div class="reveal"><h3>Layers and frames</h3><p>Blend modes, onion skin, tags and playback. Indexed or full colour.</p></div>
  <div class="reveal"><h3>Brushes that shade</h3><p>Pixel-perfect pencil, shading and dither brushes, gradients, mirror and tiled drawing.</p></div>
  <div class="reveal"><h3>Clean transforms</h3><p>Outline, drop shadow, light-direction shading, and rotation that keeps pixels crisp.</p></div>
  <div class="reveal"><h3>Palettes</h3><p>Build ramps, import GPL, hex, JASC or PNG, or start from a classic.</p></div>
  <div class="reveal"><h3>Ready for games</h3><p>Sprite sheets with Aseprite-compatible JSON and Godot resources, plus PNG, GIF and APNG.</p></div>
  <div class="reveal"><h3>An assistant at your side</h3><p>It works with your own Anthropic key, kept on your device, and every step can be undone. Or <a href="#agent">ask your own agent</a>.</p></div>
</div></section>
<section class="download-section" id="download" aria-labelledby="dl-title"><h2 id="dl-title" class="display reveal">Download</h2><div data-downloads data-app="sprite"></div></section>
""" + agent("sprite", "Asteria Sprite", ("a sprite", "a 32 by 32 knight with a lantern, four frames of walking, in warm colours"), "the .asprite.json project and a sprite sheet") + also("box", "cloud")

BOX = """
<section class="hero app-hero" aria-labelledby="hero-title">
  <img class="app-icon reveal" src="/brand/logo/products/box/box-256.png" width="112" height="112" alt="">
  <h1 id="hero-title" class="display reveal">Asteria<wbr><b>Box</b></h1>
  <p class="lede reveal">Write music, from chiptune to a whole band. The Composer writes with you, and every change can be undone.</p>
  <div class="actions reveal"><a class="btn primary" href="/app/">Open the editor</a><a class="btn" href="#download">Download</a></div>
</section>
<section class="product" aria-label="The notes of the song now playing">
  <figure class="window reveal" style="grid-column: 1 / -1; max-width: 900px; margin: 0 auto; width: 100%" aria-label="The notes of the song now playing">
    <div class="window-bar"><i></i><i></i><i></i><span id="rollTitle">local-only.beepbox</span></div>
    <canvas class="roll" id="roll" width="640" height="360"></canvas>
    <button class="roll-play" id="rollPlay" type="button" aria-label="Play this song">▶</button>
  </figure>
</section>
<section aria-labelledby="what-title"><h2 id="what-title" class="display reveal" style="text-align:center; font-size: var(--as-step-3); margin: 0 0 48px">What it does</h2>
<div class="features">
  <div class="reveal"><h3>A band</h3><p>Distorted and clean guitars, bass, organ, strings, choir, piano, bells and a real drum kit.</p></div>
  <div class="reveal"><h3>Riffs</h3><p>Power chords that chug, gallop or push, and a pulse bass that hammers.</p></div>
  <div class="reveal"><h3>A mix that balances itself</h3><p>Auto mix listens to each part and sets the volumes against the lead.</p></div>
  <div class="reveal"><h3>Ready to share</h3><p>Mastered MP3s with even loudness, title tags and cover art. WAV, MIDI and seamless game loops too.</p></div>
  <div class="reveal"><h3>The Composer</h3><p>Describe a song and it writes one, or asks before it changes yours. It works with your own Anthropic key. Or <a href="#agent">ask your own agent</a>.</p></div>
  <div class="reveal"><h3>Built on BeepBox</h3><p>Every BeepBox song opens here. Asteria Box is free and open source, like BeepBox itself.</p></div>
</div></section>
<section class="music" id="music" aria-labelledby="music-title">
  <div class="album reveal">
    <img id="albumCover" src="/media/music/covers-26/album-600.png" width="600" height="600" alt="Made to Last, cover">
    <div>
      <p class="eyebrow">Made in Asteria Box</p>
      <h2 id="music-title" class="display">Made to Last</h2>
      <p class="quiet" id="albumMeta">Eight tracks · Asteria Technology · 2026</p>
      <div class="player" id="player" aria-label="Music player">
        <button class="btn primary round" id="playBtn" type="button" aria-label="Play">▶</button>
        <div class="now"><strong id="nowTitle">Local Only</strong><span id="nowAbout"></span>
          <div class="progress" id="progress" role="slider" aria-label="Position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><i id="progressFill"></i></div>
        </div>
      </div>
    </div>
  </div>
  <ol class="tracks reveal" id="tracks"></ol>
</section>
<section class="download-section" id="download" aria-labelledby="dl-title"><h2 id="dl-title" class="display reveal">Download</h2><div data-downloads data-app="box"></div></section>
""" + agent("box", "Asteria Box", ("a song", "a two-minute rock song in E minor at 160 bpm, with distorted guitars, an organ and a choir"), "the .beepbox song and a WAV") + also("sprite", "cloud")

DOWNLOADS = open(os.path.join(REPO, "tools", "downloads-body.html")).read()

page("hosts/sprite/index.html", "Asteria Sprite", "A free, open-source pixel-art editor and animator. Use it in your browser or download it.", SPRITE, "https://sprite.asteria.technology/", "sprite")
page("hosts/box/index.html", "Asteria Box", "A free, open-source music maker built on BeepBox. Use it in your browser or download it.", BOX, "https://box.asteria.technology/", "box")
page("downloads/index.html", "Downloads · Asteria Technology", "Download Asteria Sprite and Asteria Box for macOS, Windows and Linux.", DOWNLOADS, "https://asteria.technology/downloads/", None, "page")
page("source/index.html", "Source · Asteria Technology", "Our open-source projects, proprietary products and project-specific licenses.", open(os.path.join(REPO, "tools", "source-body.html")).read(), "https://asteria.technology/source/", None, "page")
page("404.html", "Not here · Asteria Technology", "There is nothing at this address.", '<h1 class="display">Not here</h1><p>There is nothing at this address. Try the <a href="/" data-sub="main">home page</a>.</p>', "https://asteria.technology/", None, "page")
# the downloads link in the bar is marked on its own page
p = os.path.join(SITE, "downloads", "index.html")
text = open(p).read()
open(p, "w").write(text.replace('<a href="/downloads/" data-sub="main" data-path="/downloads/">', '<a href="/downloads/" data-sub="main" data-path="/downloads/" aria-current="page">', 1))
print("pages written")

# Native product pages share the main site identity; copy lives in tracked body files.
for slug, title, description in [
    ("browse", "Asteria Browse — a calmer browser, a sharper search", "A native WebKit browser for Mac, iPhone and iPad with Spaces, private tabs, Asteria Search and on-device Apple Intelligence. Proprietary Asteria software, with no ads. Ever."),
    ("foodandmood", "Asteria Food and Mood — the food journal, minus the paper", "A native Swift food and mood journal for iPhone. Keep the six-column journal, use Apple Intelligence and Siri, and send a tidy spreadsheet to your nutritionist."),
    ("swift", "Swift: Zero to Hero 2.0 — learn Swift on your device", "A complete Swift course for iPhone, iPad and Mac: 173 lessons, 83 exercises, on-device checking, Apple Intelligence coaching, Siri, iCloud progress and 24 milestones."),
    ("post", "Asteria Post — social, minus the shouting", "An Apple Intelligence social app for iPhone, iPad and Mac on the open AT Protocol network. A feed ranked on your device, dials you control, a .post handle, and no ads. Ever.")
]:
    page(slug + "/index.html", title, description, open(os.path.join(REPO, "tools", slug + "-body.html")).read(), "https://asteria.technology/" + slug + "/", main_class="page")


# Hand-written pages keep their own <main>, title and description, and take the home page's bar, footer and icons.
HAND = ["keys/index.html", "keys/support/index.html", "timeclock/index.html", "timeclock/privacy/index.html", "timeclock/support/index.html",
        "search/index.html", "privacy/index.html", "support/index.html", "box-swift/index.html"]
ICONS_OLD = re.compile(r'<link rel="icon" href="/brand/logo/Asteria\.ico" sizes="any"><link rel="icon" type="image/svg\+xml" href="/brand/logo/mark\.svg\?v=asteria">')
ICONS_NEW = re.search(r'<link rel="icon"[^\n]*', HEAD).group(0)
THEME_NEW = "\n".join(re.findall(r'<meta name="(?:color-scheme|theme-color)"[^>]*>', HEAD))
for rel in HAND:
    path = os.path.join(SITE, rel)
    text = open(path).read()
    head, rest = text[:text.index("<body>")], text[text.index("<body>"):]
    head = ICONS_OLD.sub(ICONS_NEW, head)
    head = re.sub(r'<meta name="theme-color" content="#0a1518">', THEME_NEW, head)
    # the same versioned stylesheets and script as the home page, so browsers fetch the new ones
    for asset in ("/brand/tokens.css", "/css/site.css", "/js/site.js"):
        head = re.sub(re.escape(asset) + r'(\?v=[^"]*)?"', re.search(re.escape(asset) + r'[^"]*', HEAD).group(0) + '"', head)
    rest = rest[:rest.index('<a class="skip"')] + BAR + rest[rest.index("<main"):]
    rest = rest[:rest.index("<footer")] + FOOT
    open(path, "w").write(head + rest)
print("hand-written pages given the bar and footer")
