"""Static file server with SPA fallback + HTTP Range support.

Features:
  1. Serves files normally.
  2. For any URL path that does NOT match a real file (e.g. /resources,
     /about, /article/foo), falls back to index.html so the client-side
     router can handle it.
  3. Supports HTTP Range requests (206 Partial Content) so that <video>
     elements can seek to any timestamp — required for large MP4 replays.

Usage: python serve.py [port]   # defaults to 8765
"""

import http.server
import socketserver
import os
import re
import sys
import mimetypes
from urllib.parse import unquote

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = os.path.dirname(os.path.abspath(__file__))

mimetypes.add_type('video/mp4', '.mp4')
mimetypes.add_type('video/webm', '.webm')


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------
    def do_GET(self):
        path = self._resolve_path()
        if path is None:
            self.send_error(404, 'File not found')
            return

        # HEAD-equivalent fast path
        if self.command == 'HEAD':
            self._send_head(path)
            return

        # Range request → 206 Partial Content
        rng = self.headers.get('Range')
        if rng:
            self._send_range(path, rng)
        else:
            self._send_whole(path)

    def do_HEAD(self):
        path = self._resolve_path()
        if path is None:
            self.send_error(404, 'File not found')
            return
        self._send_head(path)

    # ------------------------------------------------------------------
    # Path resolution with SPA fallback
    # ------------------------------------------------------------------
    def _resolve_path(self):
        """Return absolute filesystem path of the file to serve, or None for 404."""
        url_path = unquote(self.path.split('?')[0].split('#')[0])
        if url_path == '/':
            return os.path.join(ROOT, 'index.html')

        fs_path = os.path.join(ROOT, url_path.lstrip('/').replace('/', os.sep))

        # Real file
        if os.path.isfile(fs_path):
            return fs_path
        # Directory → serve index.html inside it
        if os.path.isdir(fs_path):
            idx = os.path.join(fs_path, 'index.html')
            if os.path.isfile(idx):
                return idx
            return None

        # Looks like an asset (has extension in last segment) but file missing → 404
        last_segment = url_path.rstrip('/').rsplit('/', 1)[-1]
        if '.' in last_segment:
            return None

        # SPA route → fallback to index.html
        return os.path.join(ROOT, 'index.html')

    # ------------------------------------------------------------------
    # Response helpers
    # ------------------------------------------------------------------
    def _ctype(self, path):
        ctype, _ = mimetypes.guess_type(path)
        return ctype or 'application/octet-stream'

    def _send_head(self, path):
        size = os.path.getsize(path)
        self.send_response(200)
        self.send_header('Content-Type', self._ctype(path))
        self.send_header('Content-Length', str(size))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()

    def _send_whole(self, path):
        size = os.path.getsize(path)
        self.send_response(200)
        self.send_header('Content-Type', self._ctype(path))
        self.send_header('Content-Length', str(size))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        with open(path, 'rb') as f:
            self._copy(f, size)

    def _send_range(self, path, range_header):
        size = os.path.getsize(path)
        start, end = self._parse_range(range_header, size)
        if start is None:
            # Malformed or unsatisfiable range
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return

        length = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self._ctype(path))
        self.send_header('Content-Length', str(length))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        with open(path, 'rb') as f:
            f.seek(start)
            self._copy(f, length)

    @staticmethod
    def _parse_range(value, size):
        """Parse a 'Range: bytes=START-END' header. Returns (start, end) or (None, None)."""
        m = re.match(r'\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$', value or '')
        if not m:
            return None, None
        s, e = m.group(1), m.group(2)
        if s == '' and e == '':
            return None, None
        if s == '':
            # Suffix range: last N bytes
            n = int(e)
            if n <= 0:
                return None, None
            start = max(0, size - n)
            end = size - 1
        else:
            start = int(s)
            end = int(e) if e else size - 1
        if start >= size or end < start:
            return None, None
        end = min(end, size - 1)
        return start, end

    def _copy(self, src, length, chunk=64 * 1024):
        remaining = length
        try:
            while remaining > 0:
                buf = src.read(min(chunk, remaining))
                if not buf:
                    break
                self.wfile.write(buf)
                remaining -= len(buf)
        except (BrokenPipeError, ConnectionResetError):
            # Client closed connection (common for video seek/scrub) — silent
            pass

    # ------------------------------------------------------------------
    # Quieter logging — skip asset noise
    # ------------------------------------------------------------------
    def log_message(self, fmt, *args):
        if any(s in self.path for s in ('.png', '.jpg', '.svg', '.ico', '.woff', '.css', '.js')):
            return
        super().log_message(fmt, *args)


class ThreadedServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with ThreadedServer(('', PORT), SPAHandler) as httpd:
        print(f'SPA dev server running on http://localhost:{PORT}')
        print(f'Serving:  {ROOT}')
        print('All unknown paths fall back to index.html for client-side routing.')
        print('HTTP Range requests are supported for video seeking.')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nStopping server.')
