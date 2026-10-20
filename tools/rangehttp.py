"""A static file handler that answers `Range: bytes=a-b` (what a <video> needs to seek), for the web tests (http.server's own does not)."""
import http.server, os, shutil


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{".js": "text/javascript", ".wasm": "application/wasm", ".webm": "video/webm", ".mp4": "video/mp4", ".avi": "video/x-msvideo"})
    _left = None

    def log_message(self, *a): pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        p = self.translate_path(self.path)
        if rng and rng.startswith("bytes=") and os.path.isfile(p):
            size = os.path.getsize(p)
            a, _, b = rng[6:].partition("-")
            start = int(a) if a else max(0, size - int(b or 0))
            end = min(int(b), size - 1) if a and b else size - 1
            if start >= size: self.send_error(416); return None
            f = open(p, "rb"); f.seek(start)
            self.send_response(206)
            self.send_header("Content-Type", self.guess_type(p))
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            self._left = end - start + 1
            return f
        self._left = None
        return super().send_head()

    def copyfile(self, source, outputfile):
        if self._left is None: return super().copyfile(source, outputfile)
        outputfile.write(source.read(self._left))


class Srv(http.server.ThreadingHTTPServer):
    def handle_error(self, *a): pass   # a page that closes a connection mid-file is not news
