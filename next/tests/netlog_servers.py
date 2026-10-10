#!/usr/bin/env python3
"""The HTTP and HTTPS servers of tests/t0/netlog.sh (ZN-370): usage netlog_servers.py port [tlsport cert.pem key.pem].
A POST answers the body back with a Set-Cookie (a urlencoded form as it is, anything else inside a JSON object), GET /old redirects to /new with a query
parameter, anything else answers its path."""
import http.server, ssl, sys, threading

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
        if self.path == "/old": self.answer(302, b"", [("Location", "/new?api_key=redirect-secret")])
        else: self.answer(200, ("here " + self.path.split("?")[0]).encode(), [("Content-Type", "text/plain")])   # no query: free text in a body is not masked
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
