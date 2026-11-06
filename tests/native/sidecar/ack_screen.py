#!/usr/bin/env python3
# A colour Sidecar screen that shows nothing: its hello, then one ACK for each RECT, until the app leaves. Prints its port, then each message
# about the pointer: "CURSOR w h hx hy black white" and "POINTER x y shown".
import socket, struct
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('127.0.0.1', 0))
s.listen(1)
print(s.getsockname()[1], flush=True)
c, _ = s.accept()
c.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
c.sendall(b'RMPP 1440 900 color +rgb +zstd\n')
def need(n):
    b = bytearray()
    while len(b) < n:
        d = c.recv(min(1 << 20, n - len(b)))
        if not d:
            raise SystemExit
        b += d
    return b
try:
    while True:
        h = need(16)
        p = need(struct.unpack('<I', h[12:16])[0])
        x, y, w, hh = struct.unpack('<HHHH', h[2:10])
        if h[0] == 1:
            c.sendall(bytes([1]) + bytes(15))
        elif h[0] == 4:
            print('CURSOR', w, hh, x, y, p.count(2), p.count(1), flush=True)
        elif h[0] == 5:
            print('POINTER', x, y, w, flush=True)
except ConnectionError:
    pass
