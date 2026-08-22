#!/usr/bin/env python3
"""
Local dev server that disables caching.

Plain `python3 -m http.server` lets the browser cache JS/CSS aggressively,
which is especially harmful with ES modules (a stale module breaks the whole
import graph). This server sends no-store headers so every reload fetches fresh.

Usage:  python3 devserver.py [port]   (default port 8000)
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'Serving http://localhost:{port}/ with caching disabled (Ctrl+C to stop)')
    HTTPServer(('', port), NoCacheHandler).serve_forever()
