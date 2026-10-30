"""Copies the Mundus Novus brand into the apps checked out beside this repository: the product icons (from
brand/logo/products/, made by brand/build_brand.py), the design tokens and the shared host files. Run it after
changing the brand, then commit each repository.

    python3 brand/build_brand.py && python3 tools/sync_brand.py
"""
import os, re, shutil, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(REPO)
LOGO = os.path.join(REPO, "brand", "logo", "products")
HOST = ["mn-app.css", "mn-cloud-ui.js", "mn-cloud.js", "mn-host.js"]


def copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)


def icons(kind, dst, only_existing=False):
    """every size, the .ico/.icns, the SVGs and the maskable icon, with the names the brand gives them;
    only_existing replaces just the icons the repository already has"""
    src = os.path.join(LOGO, kind)
    for f in os.listdir(src):
        p = os.path.join(src, f)
        if only_existing and not os.path.exists(os.path.join(dst, f)):
            continue
        if os.path.isdir(p):
            shutil.rmtree(os.path.join(dst, f), ignore_errors=True)
            shutil.copytree(p, os.path.join(dst, f))
        else:
            copy(p, os.path.join(dst, f))


def web_app(kind, app):
    """the favicons and home-screen icons a web app's index.html and manifest point at"""
    p = lambda f: os.path.join(LOGO, kind, f)
    for name, f in (("apple-touch-icon.png", "%s-180.png"), ("favicon-32.png", "%s-32.png"), ("favicon.ico", "%s.ico"),
                    ("icon-192.png", "%s-192.png"), ("icon-512.png", "%s-512.png"), ("icon-maskable-512.png", "%s-maskable-512.png"),
                    ("icon.svg", "%s-icon.svg")):
        copy(p(f % kind), os.path.join(app, name))
    if os.path.exists(os.path.join(app, "icon.png")):
        copy(p("%s-256.png" % kind), os.path.join(app, "icon.png"))


def tokens(dst, font_path=None):
    s = open(os.path.join(REPO, "brand", "tokens.css")).read()
    if font_path:  # an app that keeps the font beside the tokens rather than in font/
        s = re.sub(r'@font-face \{[^}]*\}', '@font-face { font-family: "Chancel"; src: url("%s") format("woff"); font-display: swap; }' % font_path, s, count=1)
    open(dst, "w").write(s)


def main():
    need = lambda name: os.path.join(ROOT, name) if os.path.isdir(os.path.join(ROOT, name)) else sys.exit("missing " + name + " beside this repository")
    for name, kind in (("MNSprite", "sprite"), ("MNBox", "box")):
        r = need(name)
        icons(kind, os.path.join(r, "src", "icons"), only_existing=True)
        web_app(kind, os.path.join(r, "src", "app"))
        tokens(os.path.join(r, "src", "app", "brand", "tokens.css"))
        for f in HOST:
            copy(os.path.join(REPO, "brand", "host", f), os.path.join(r, "src", "app", "brand", f))
    cloud = need("MNCloud")
    icons("cloud", os.path.join(cloud, "brand", "icons"))
    for f in ("cloud-180.png", "cloud-192.png", "cloud-512.png", "cloud-icon.svg", "cloud-mark.svg", "cloud.ico"):
        copy(os.path.join(LOGO, "cloud", f), os.path.join(cloud, "public", "brand", f))
    tokens(os.path.join(cloud, "public", "brand", "tokens.css"), "Chancel-Regular.woff")
    office = need("MNOffice")
    icons("office", os.path.join(office, "brand", "icons"))
    copy(os.path.join(LOGO, "office", "office-icon.svg"), os.path.join(office, "desktop", "brand", "svg", "app-icon.svg"))
    for theme in ("light", "dark"):
        copy(os.path.join(LOGO, "office", "office-mark.svg"), os.path.join(office, "desktop", "brand", "svg", "logo-%s.svg" % theme))
    # Learn: icons, the tokens with the font beside them, and the link preview
    learn = os.path.join(ROOT, "MNLearn") if os.path.isdir(os.path.join(ROOT, "MNLearn")) else need("MundusNovusLearn")
    dst = os.path.join(learn, "public", "brand")
    for f in ("learn-180.png", "learn-192.png", "learn-512.png", "learn-maskable-512.png", "learn-icon.svg", "learn-mark.svg", "learn.ico"):
        copy(os.path.join(LOGO, "learn", f), os.path.join(dst, f))
    copy(os.path.join(REPO, "brand", "font", "Chancel-Regular.woff"), os.path.join(dst, "Chancel-Regular.woff"))
    copy(os.path.join(REPO, "brand", "logo", "og-1200x630.png"), os.path.join(dst, "og-1200x630.png"))
    tokens(os.path.join(dst, "tokens.css"), "Chancel-Regular.woff")
    print("brand copied into MNSprite, MNBox, MNCloud, MNOffice and Learn")


if __name__ == "__main__":
    main()
