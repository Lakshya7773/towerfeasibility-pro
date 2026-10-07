#!/usr/bin/env python3
"""
Minimal HTTP server with Range support, for verifying the offline map.

Python's http.server ignores Range headers and returns the whole file, which
breaks PMTiles (it reads byte ranges). This serves 206 partial content so the
browser test faithfully reproduces the app's byte-range bridge.

Usage: python range_server.py <dir> <port>
"""
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class RangeHandler(BaseHTTPRequestHandler):
    root = "."

    def _resolve(self):
        path = self.path.split("?", 1)[0]
        if path == "/":
            path = "/index.html"
        full = os.path.normpath(os.path.join(self.root, path.lstrip("/")))
        if not full.startswith(os.path.abspath(self.root)):
            return None
        return full if os.path.isfile(full) else None

    def do_GET(self):
        full = self._resolve()
        if not full:
            self.send_error(404, "not found")
            return

        size = os.path.getsize(full)
        ctype = "application/octet-stream"
        if full.endswith(".html"):
            ctype = "text/html; charset=utf-8"
        elif full.endswith(".pbf"):
            ctype = "application/x-protobuf"

        rng = self.headers.get("Range")
        if rng:
            m = re.match(r"bytes=(\d+)-(\d*)", rng)
            if m:
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else size - 1
                end = min(end, size - 1)
                length = end - start + 1
                self.send_response(206)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                with open(full, "rb") as f:
                    f.seek(start)
                    self.wfile.write(f.read(length))
                return

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        with open(full, "rb") as f:
            while chunk := f.read(1 << 20):
                self.wfile.write(chunk)

    def log_message(self, *a):
        pass


def main():
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8899
    RangeHandler.root = root
    srv = ThreadingHTTPServer(("127.0.0.1", port), RangeHandler)
    print(f"serving {root} on http://127.0.0.1:{port} (range-capable, threaded)")
    srv.serve_forever()


if __name__ == "__main__":
    main()
