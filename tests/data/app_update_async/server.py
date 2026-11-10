import http.server
import pathlib
import sys
import time

root = pathlib.Path(sys.argv[1])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/quit.manifest':
            time.sleep(.05)
        else:
            deadline = time.monotonic() + 5
            while not (root / 'released').exists() and time.monotonic() < deadline:
                time.sleep(.005)
        content = (root / 'good.manifest').read_bytes()
        if self.path == '/quit.manifest':
            (root / 'quit-served').write_text('yes')
        self.send_response(200)
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

server = http.server.HTTPServer(('127.0.0.1', 0), Handler)
print(server.server_port, flush=True)
server.serve_forever()
