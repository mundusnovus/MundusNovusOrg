"""Packages MNSprite and MNBox for download, from the apps checked out beside this repository.

    python3 tools/package/package.py          (on a Mac with Swift; writes dist/)

For each app it makes:
  macOS     <App>-<version>-macOS.dmg          a native app (tools/package/macos/Shell.swift), Apple silicon and Intel
  Windows   <App>-<version>-Windows.zip        the app and a launcher that opens it in Edge as its own window
  Linux     <app>_<version>_all.deb            installs to /usr/share/<app>, with a menu entry and a launcher
            <App>-<version>-Linux.tar.gz       the same, to run from any folder
and dist/downloads.json, which the downloads page reads. Then run tools/build.py to copy dist/ into the site.
"""
import gzip, hashlib, io, json, os, plistlib, shutil, subprocess, sys, tarfile, tempfile, time, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ROOT = os.path.dirname(REPO)
DIST = os.path.join(REPO, "dist")
LICENSE = os.path.join(REPO, "LICENSE")

APPS = [
    {"key": "sprite", "name": "MNSprite", "pkg": "mn-sprite", "version": "2.1.0", "id": "org.mundusnovus.sprite",
     "repo": "MNSprite", "icons": "sprite", "summary": "Pixel-art editor and animator",
     "about": "A free pixel-art editor and animator with an assistant that draws with you.",
     "category": "Graphics;2DGraphics;RasterGraphics;", "types": [("MNSprite project", ["json"]), ("Aseprite file", ["aseprite", "ase"])]},
    {"key": "box", "name": "MNBox", "pkg": "mn-box", "version": "4.1.0", "id": "org.mundusnovus.box",
     "repo": "MNBox", "icons": "box", "summary": "Music maker built on BeepBox",
     "about": "A free music maker built on BeepBox, with a Composer that writes music with you.",
     "category": "AudioVideo;Audio;Music;", "types": [("Song", ["beepbox", "json"])]},
]


def app_dir(a):
    return os.path.join(ROOT, a["repo"], "src", "app")


def icon(a, name):
    return os.path.join(ROOT, a["repo"], "src", "icons", name)


def copy_app(a, dst):
    shutil.copytree(app_dir(a), dst, ignore=shutil.ignore_patterns(".DS_Store", "sw.js"))


def readme(a, how):
    return (a["name"] + " " + a["version"] + "\n" + "=" * (len(a["name"]) + len(a["version"]) + 1) + "\n\n" + a["about"] + "\n\n" + how +
            "\n\nIt also runs in your browser at https://mundusnovus.org/" + a["key"] + "/\n\n"
            "Free and open source under the Mundus Novus License 1.0 (GPL-3.0-only). See LICENSE.\n"
            "Source: https://github.com/mundusnovus/" + a["repo"] + "\n")


# ---------------------------------------------------------------- macOS
def shell_binary(tmp):
    src = os.path.join(HERE, "macos", "Shell.swift")
    outs = []
    for arch in ("arm64", "x86_64"):
        out = os.path.join(tmp, "shell-" + arch)
        subprocess.run(["swiftc", "-O", "-swift-version", "5", "-target", arch + "-apple-macos13.0", "-o", out, src], check=True)
        outs.append(out)
    fat = os.path.join(tmp, "shell")
    subprocess.run(["lipo", "-create", "-output", fat] + outs, check=True)
    return fat


def mac(a, shell, tmp):
    stage = os.path.join(tmp, a["key"] + "-dmg")
    app = os.path.join(stage, a["name"] + ".app", "Contents")
    os.makedirs(os.path.join(app, "MacOS"))
    os.makedirs(os.path.join(app, "Resources"))
    shutil.copy(shell, os.path.join(app, "MacOS", a["name"]))
    copy_app(a, os.path.join(app, "Resources", "app"))
    shutil.copy(icon(a, a["icons"] + ".icns"), os.path.join(app, "Resources", "AppIcon.icns"))
    plist = {
        "CFBundleName": a["name"], "CFBundleDisplayName": a["name"], "CFBundleIdentifier": a["id"], "CFBundleExecutable": a["name"],
        "CFBundleVersion": a["version"], "CFBundleShortVersionString": a["version"], "CFBundlePackageType": "APPL", "CFBundleIconFile": "AppIcon",
        "LSMinimumSystemVersion": "13.0", "NSHighResolutionCapable": True, "LSApplicationCategoryType": "public.app-category.graphics-design" if a["key"] == "sprite" else "public.app-category.music",
        "NSHumanReadableCopyright": "Mundus Novus. Mundus Novus License 1.0 (GPL-3.0-only).",
        "CFBundleDocumentTypes": [{"CFBundleTypeName": n, "CFBundleTypeRole": "Editor", "CFBundleTypeExtensions": ext, "LSHandlerRank": "Alternate"} for n, ext in a["types"]],
    }
    with open(os.path.join(app, "Info.plist"), "wb") as f:
        plistlib.dump(plist, f)
    with open(os.path.join(app, "PkgInfo"), "w") as f:
        f.write("APPL????")
    subprocess.run(["codesign", "--force", "--deep", "--sign", "-", os.path.join(stage, a["name"] + ".app")], check=True, capture_output=True)
    os.symlink("/Applications", os.path.join(stage, "Applications"))
    shutil.copy(LICENSE, os.path.join(stage, "LICENSE.txt"))
    out = os.path.join(DIST, a["name"] + "-" + a["version"] + "-macOS.dmg")
    if os.path.exists(out):
        os.remove(out)
    subprocess.run(["hdiutil", "create", "-quiet", "-volname", a["name"], "-srcfolder", stage, "-ov", "-format", "UDZO", out], check=True)
    return out


# ---------------------------------------------------------------- Windows
WIN_LAUNCHER = r"""@echo off
rem Opens {name} in Microsoft Edge as its own window. Settings stay in %LOCALAPPDATA%\Mundus Novus\{name}.
setlocal
set "APP=%~dp0app\index.html"
set "URL=file:///%APP:\=/%"
set "DATA=%LOCALAPPDATA%\Mundus Novus\{name}"
start "" msedge --app="%URL%" --user-data-dir="%DATA%" --no-first-run 2>nul || start "" "%APP%"
"""


def windows(a, tmp):
    out = os.path.join(DIST, a["name"] + "-" + a["version"] + "-Windows.zip")
    top = a["name"] + "/"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for base, _, files in os.walk(app_dir(a)):
            for fn in files:
                if fn in (".DS_Store", "sw.js"):
                    continue
                p = os.path.join(base, fn)
                z.write(p, top + "app/" + os.path.relpath(p, app_dir(a)).replace(os.sep, "/"))
        z.writestr(top + a["name"] + ".cmd", WIN_LAUNCHER.replace("{name}", a["name"]).replace("\n", "\r\n"))
        z.write(icon(a, a["icons"] + ".ico"), top + a["name"] + ".ico")
        z.writestr(top + "README.txt", readme(a, "To start it, open the folder and double-click " + a["name"] + ".cmd. It opens in Microsoft Edge as its own window.\nFor a shortcut on your desktop, right-click " + a["name"] + ".cmd and choose Send to > Desktop.").replace("\n", "\r\n"))
        z.write(LICENSE, top + "LICENSE.txt")
    return out


# ---------------------------------------------------------------- Linux
LINUX_LAUNCHER = """#!/bin/sh
# Opens {name} as its own window in Chromium, Chrome, Edge or Brave, or in the default browser.
HERE=$(dirname "$(readlink -f "$0")")
APP="$HERE/../share/{pkg}/app/index.html"
[ -f "$APP" ] || APP="$HERE/app/index.html"
APP=$(readlink -f "$APP")
DATA="${XDG_CONFIG_HOME:-$HOME/.config}/{pkg}"
for b in chromium chromium-browser google-chrome google-chrome-stable microsoft-edge microsoft-edge-stable brave-browser; do
  if command -v "$b" >/dev/null 2>&1; then
    exec "$b" --app="file://$APP" --user-data-dir="$DATA" --class={name} --no-first-run "$@"
  fi
done
exec xdg-open "file://$APP"
"""
DESKTOP = """[Desktop Entry]
Type=Application
Name={name}
Comment={summary}
Exec={exec}
Icon={pkg}
Terminal=false
Categories={category}
StartupWMClass={name}
"""


def tar_add(t, name, data=None, path=None, mode=0o644):
    if path:
        t.add(path, arcname=name, filter=lambda ti: (setattr(ti, "uid", 0), setattr(ti, "gid", 0), setattr(ti, "uname", "root"), setattr(ti, "gname", "root"), ti)[-1])
        return
    ti = tarfile.TarInfo(name)
    ti.size, ti.mode, ti.mtime, ti.uname, ti.gname = len(data), mode, int(time.time()), "root", "root"
    t.addfile(ti, io.BytesIO(data))


def linux_tree(a, t, prefix, deb):
    """Adds the installed layout to a tar: <prefix>usr/... for the .deb, <prefix> for the tarball."""
    root = prefix + ("usr/" if deb else "")
    share = root + ("share/" + a["pkg"] + "/app" if deb else "app")
    for base, _, files in os.walk(app_dir(a)):
        for fn in files:
            if fn in (".DS_Store", "sw.js"):
                continue
            p = os.path.join(base, fn)
            tar_add(t, share + "/" + os.path.relpath(p, app_dir(a)).replace(os.sep, "/"), path=p)
    launcher = LINUX_LAUNCHER.replace("{name}", a["name"]).replace("{pkg}", a["pkg"]).encode()
    tar_add(t, root + ("bin/" + a["pkg"] if deb else a["pkg"]), launcher, mode=0o755)
    if deb:  # a menu entry; the tarball runs from its folder instead
        desktop = DESKTOP.format(name=a["name"], summary=a["summary"], exec=a["pkg"], pkg=a["pkg"], category=a["category"]).encode()
        tar_add(t, root + "share/applications/" + a["pkg"] + ".desktop", desktop)
    for size in (48, 128, 256, 512):
        tar_add(t, root + ("share/icons/hicolor/%dx%d/apps/" % (size, size) if deb else "icons/%d/" % size) + a["pkg"] + ".png", path=icon(a, "%s-%d.png" % (a["icons"], size)))
    tar_add(t, root + ("share/doc/" + a["pkg"] + "/copyright" if deb else "LICENSE"), path=LICENSE)


def tarball(a):
    out = os.path.join(DIST, a["name"] + "-" + a["version"] + "-Linux.tar.gz")
    with tarfile.open(out, "w:gz") as t:
        linux_tree(a, t, a["name"] + "/", deb=False)
        tar_add(t, a["name"] + "/README.txt", readme(a, "To start it, run ./" + a["pkg"] + " in this folder. It opens as its own window in Chromium, Chrome, Edge or Brave if one is installed, or in your default browser.").encode())
    return out


def deb(a):
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w:gz") as t:
        linux_tree(a, t, "./", deb=True)
    size_kb = 0
    with tarfile.open(fileobj=io.BytesIO(data.getvalue()), mode="r:gz") as t:
        size_kb = sum(m.size for m in t.getmembers()) // 1024 + 1
    control = ("Package: %s\nVersion: %s\nArchitecture: all\nMaintainer: Mundus Novus\nInstalled-Size: %d\nSection: %s\nPriority: optional\n"
               "Recommends: chromium | google-chrome-stable | microsoft-edge-stable | brave-browser\nHomepage: https://mundusnovus.org/%s/\n"
               "Description: %s\n %s\n") % (a["pkg"], a["version"], size_kb, "graphics" if a["key"] == "sprite" else "sound", a["key"], a["summary"], a["about"])
    ctl = io.BytesIO()
    with tarfile.open(fileobj=ctl, mode="w:gz") as t:
        tar_add(t, "./control", control.encode())
    out = os.path.join(DIST, "%s_%s_all.deb" % (a["pkg"], a["version"]))
    with open(out, "wb") as f:  # a .deb is an ar archive of three members
        f.write(b"!<arch>\n")
        for name, body in (("debian-binary", b"2.0\n"), ("control.tar.gz", ctl.getvalue()), ("data.tar.gz", data.getvalue())):
            f.write(("%-16s%-12d%-6d%-6d%-8s%-10d`\n" % (name, int(time.time()), 0, 0, "100644", len(body))).encode())
            f.write(body + (b"\n" if len(body) % 2 else b""))
    return out


def describe(path, platform, label):
    h = hashlib.sha256(open(path, "rb").read()).hexdigest()
    return {"file": os.path.basename(path), "platform": platform, "label": label, "bytes": os.path.getsize(path), "sha256": h}


if __name__ == "__main__":
    os.makedirs(DIST, exist_ok=True)
    manifest = {"made": time.strftime("%Y-%m-%d"), "apps": []}
    with tempfile.TemporaryDirectory() as tmp:
        shell = shell_binary(tmp)
        for a in APPS:
            files = [describe(mac(a, shell, tmp), "macos", "macOS 13 or later, Apple silicon and Intel"),
                     describe(windows(a, tmp), "windows", "Windows 10 or 11"),
                     describe(deb(a), "linux", "Debian, Ubuntu and relatives (.deb)"),
                     describe(tarball(a), "linux", "Any Linux (.tar.gz)")]
            manifest["apps"].append({"key": a["key"], "name": a["name"], "version": a["version"], "about": a["about"], "files": files})
            print(a["name"], ", ".join(f["file"] for f in files))
    json.dump(manifest, open(os.path.join(DIST, "downloads.json"), "w"), indent=1)
