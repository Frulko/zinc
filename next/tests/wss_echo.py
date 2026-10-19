#!/usr/bin/env python3
"""A tiny WebSocket echo server over TLS for tests/t0/tls.sh (wss): the RFC 6455 handshake, text and binary frames echoed back unmasked, a close
answered with the same code. Usage: wss_echo.py PORT CERT KEY; prints "ready" once it listens; the test kills it."""
import base64, hashlib, socket, ssl, sys, threading

def rd(c, n):
    b = b''
    while len(b) < n:
        d = c.recv(n - len(b))
        if not d: raise EOFError
        b += d
    return b

def frame(op, p):
    n = len(p)
    h = bytes([0x80 | op]) + (bytes([n]) if n < 126 else bytes([126]) + n.to_bytes(2, 'big') if n < 65536 else bytes([127]) + n.to_bytes(8, 'big'))
    return h + p

def serve(c):
    try:
        head = b''
        while b'\r\n\r\n' not in head: head += rd(c, 1)
        key = [l.split(b':', 1)[1].strip() for l in head.split(b'\r\n') if l.lower().startswith(b'sec-websocket-key:')][0]
        accept = base64.b64encode(hashlib.sha1(key + b'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest())
        c.sendall(b'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + b'\r\n\r\n')
        while True:
            b0, b1 = rd(c, 2)
            n = b1 & 127
            if n == 126: n = int.from_bytes(rd(c, 2), 'big')
            elif n == 127: n = int.from_bytes(rd(c, 8), 'big')
            m = rd(c, 4) if b1 & 0x80 else b'\0\0\0\0'
            p = bytes(x ^ m[i & 3] for i, x in enumerate(rd(c, n)))
            op = b0 & 15
            if op == 8: c.sendall(frame(8, p[:2])); break
            if op == 9: c.sendall(frame(10, p)); continue
            if op in (1, 2): c.sendall(frame(op, p))
    except (EOFError, OSError, ssl.SSLError, IndexError):
        pass
    finally:
        c.close()

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(sys.argv[2], sys.argv[3])
srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(('127.0.0.1', int(sys.argv[1])))
srv.listen(8)
print('ready', flush=True)
while True:
    raw, _ = srv.accept()
    try: c = ctx.wrap_socket(raw, server_side=True)
    except (ssl.SSLError, OSError): raw.close(); continue   # a client that refused the certificate
    threading.Thread(target=serve, args=(c,), daemon=True).start()
