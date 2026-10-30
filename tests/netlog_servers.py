#!/usr/bin/env python3
"""The HTTP and HTTPS servers of tests/t0/netlog.sh (ZN-370): usage netlog_servers.py port [tlsport cert.pem key.pem].
A POST answers the body back with a Set-Cookie (a urlencoded form as it is, anything else inside a JSON object), GET /old redirects to /new with a query
parameter, anything else answers its path."""
import base64, hashlib, http.server, ssl, struct, sys, threading

class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def answer(self, status, body, headers=()):
        self.send_response(status)
        for k, v in headers: self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if self.headers.get("Upgrade", "").lower() == "websocket": return self.websocket()
        if self.path == "/old": self.answer(302, b"", [("Location", "/new?api_key=redirect-secret")])
        else: self.answer(200, ("here " + self.path.split("?")[0]).encode(), [("Content-Type", "text/plain")])   # no query: free text in a body is not masked
    def websocket(self):   # a WebSocket that answers each text message with "echo: " + it, until the client closes (tests/t1/inspector.sh)
        key = self.headers["Sec-WebSocket-Key"].encode() + b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        self.send_response(101)
        self.send_header("Upgrade", "websocket"); self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", base64.b64encode(hashlib.sha1(key).digest()).decode())
        self.end_headers(); self.wfile.flush()
        while True:
            h = self.rfile.read(2)
            if len(h) < 2: return
            op, n = h[0] & 15, h[1] & 127
            if n == 126: n = struct.unpack(">H", self.rfile.read(2))[0]
            elif n == 127: n = struct.unpack(">Q", self.rfile.read(8))[0]
            mask = self.rfile.read(4) if h[1] & 128 else b"\0\0\0\0"
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(self.rfile.read(n)))
            if op == 8: self.wfile.write(b"\x88\x00"); self.wfile.flush(); return
            if op == 1:
                out = b"echo: " + data
                self.wfile.write(bytes([0x81, len(out)]) + out); self.wfile.flush()   # ponytail: answers under 126 bytes
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        form = "urlencoded" in self.headers.get("Content-Type", "")
        self.answer(200, body if form else b'{"echo":' + body + b'}', [("Content-Type", self.headers["Content-Type"] if form else "application/json"), ("Set-Cookie", "sid=server-secret; HttpOnly")])

def serve(port, cert=None, key=None):
    s = http.server.ThreadingHTTPServer(("127.0.0.1", port), H)
    if cert:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        ctx.maximum_version = ssl.TLSVersion.TLSv1_2   # the client fails TLS 1.3 handshakes with OpenSSL servers for now (ZN-610)
        s.socket = ctx.wrap_socket(s.socket, server_side=True)
    threading.Thread(target=s.serve_forever, daemon=True).start()

serve(int(sys.argv[1]))
if len(sys.argv) > 4: serve(int(sys.argv[2]), sys.argv[3], sys.argv[4])
threading.Event().wait()
