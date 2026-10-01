"""GitHub Pages-like static server for the build output.

Serves DIST under /nyhl-game-centre/ and, like GitHub Pages, answers any
missing path with 404.html *and a 404 status* (vite preview would instead
fall back to index.html with 200, which hides exactly the behaviour the
404 shim exists for).

    python nyhl_simserver.py [DIST] [PORT]
"""
import http.server
import os
import posixpath
import sys
from urllib.parse import unquote, urlsplit

DEFAULT_DIST = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")
DIST = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DIST
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 4180
PREFIX = "/nyhl-game-centre"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
    }

    def translate_path(self, path):
        p = unquote(urlsplit(path).path)
        if p == PREFIX or p.startswith(PREFIX + "/"):
            p = p[len(PREFIX):]
        elif p.startswith("/"):
            # Outside the app base — GitHub would serve the user site's 404.
            return os.path.join(DIST, "__outside__")
        p = posixpath.normpath(p)
        return os.path.join(DIST, *p.split("/"))

    def send_error(self, code, message=None, explain=None):
        # GitHub Pages serves the repo's custom 404.html for any miss,
        # assets included, but still with status 404.
        if code == 404:
            try:
                with open(os.path.join(DIST, "404.html"), "rb") as f:
                    body = f.read()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(body)
                return
            except OSError:
                pass
        super().send_error(code, message, explain)

    def log_message(self, fmt, *args):
        pass  # quiet


if __name__ == "__main__":
    print(f"serving {DIST} at http://127.0.0.1:{PORT}{PREFIX}/")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
