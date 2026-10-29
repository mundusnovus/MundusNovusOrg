"""The studio server: serves the ChristianSoftware folder (this repository and ChristianBox beside it) and saves
what the studio pages make. POST /save/cs-music/<path> writes to site/media/music/<path> in this repository.

    python3 tools/studio/server.py 8790      then open http://localhost:8790/ChristianSystemsOrg/tools/studio/soundtrack.html
"""
import http.server, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ROOT = os.path.dirname(REPO)
MUSIC = os.path.join(REPO, "site", "media", "music")


def inside(base, rel):
    p = os.path.abspath(os.path.join(base, rel))
    return p if p.startswith(os.path.abspath(base) + os.sep) else None


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_POST(self):
        path = self.path.split("?")[0]
        target = inside(MUSIC, path[len("/save/cs-music/"):]) if path.startswith("/save/cs-music/") else None
        if not target:
            self.send_error(404)
            return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as f:
            f.write(data)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
