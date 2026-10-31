#!/usr/bin/env python3
"""The client side of tests/t0/net_ws.sh: drives the WebSocket server of tests/golden/host/net_ws.ts on PORT and prints one line per
check (compared with tests/golden/host/net_ws.out). A small RFC 6455 client: masked frames, fragments, ping, close."""
import base64, hashlib, os, socket, struct, sys, time

PORT = int(sys.argv[1])
GUID = b'258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


def read_all(s, limit=3.0):
    s.settimeout(limit)
    data = b''
    try:
        while True:
            d = s.recv(1 << 16)
            if not d: break
            data += d
    except (socket.timeout, ConnectionResetError):
        pass
    return data


class WS:
    def __init__(self, path='/chat', client='py'):
        self.s = socket.create_connection(('127.0.0.1', PORT), timeout=5)
        key = base64.b64encode(os.urandom(16))
        self.s.sendall(b'GET ' + path.encode() + b' HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                       b'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ' + key + b'\r\nX-Client: ' + client.encode() + b'\r\n\r\n')
        head = b''
        while b'\r\n\r\n' not in head:
            d = self.s.recv(1)
            if not d: break
            head += d
        self.head = head
        want = base64.b64encode(hashlib.sha1(key + GUID).digest())
        self.ok = head.startswith(b'HTTP/1.1 101') and (b'Sec-WebSocket-Accept: ' + want) in head
        self.buf = b''

    def frame(self, op, payload=b'', fin=True):
        n = len(payload)
        h = bytes([(0x80 if fin else 0) | op])
        if n < 126: h += bytes([0x80 | n])
        elif n < 65536: h += bytes([0x80 | 126]) + struct.pack('>H', n)
        else: h += bytes([0x80 | 127]) + struct.pack('>Q', n)
        mask = os.urandom(4)
        self.s.sendall(h + mask + bytes(b ^ mask[i & 3] for i, b in enumerate(payload)))

    def need(self, n):
        while len(self.buf) < n:
            d = self.s.recv(1 << 16)
            if not d: raise EOFError
            self.buf += d

    def recv(self):
        """One frame: (opcode, payload), or ('eof', b'') when the server closed the socket."""
        try:
            self.need(2)
            op, n = self.buf[0] & 15, self.buf[1] & 127
            at = 2
            if n == 126: self.need(4); n = struct.unpack('>H', self.buf[2:4])[0]; at = 4
            elif n == 127: self.need(10); n = struct.unpack('>Q', self.buf[2:10])[0]; at = 10
            self.need(at + n)
            p = self.buf[at:at + n]
            self.buf = self.buf[at + n:]
            return op, p
        except (EOFError, ConnectionResetError, socket.timeout):
            return 'eof', b''

    def close_info(self, p):
        return (struct.unpack('>H', p[:2])[0], p[2:].decode()) if len(p) >= 2 else (None, '')


# plain HTTP on the same port still works
s = socket.create_connection(('127.0.0.1', PORT), timeout=5)
s.sendall(b'GET /hello HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
print('http', read_all(s).split(b'\r\n\r\n', 1)[-1].decode())
s.close()

# the upgrade handler refuses /refused with a 403
w = WS('/refused')
print('refused', w.head.split(b'\r\n', 1)[0].decode())
w.s.close()

# handshake, text echo, binary echo, a fragmented message, ping/pong, then the client closes
w = WS('/chat', 'alice')
print('handshake', w.ok)
w.frame(1, b'hello'); print('text', w.recv())
w.frame(2, b'\x00\x01\xff\xc3bin'); print('binary', w.recv())
w.frame(1, b'frag', fin=False); w.frame(0, b'men', fin=False); w.frame(0, b'ted'); print('fragments', w.recv())
w.frame(9, b'p1'); print('ping', w.recv())
w.frame(8, struct.pack('>H', 1000) + b'done'); op, p = w.recv(); print('client close', op, w.close_info(p), w.recv()[0])

# a message above maxPayloadBytes (1024) closes with 1009
w = WS('/big')
w.frame(1, b'x' * 2000); op, p = w.recv(); print('too big', op, w.close_info(p)[0])
w.s.close()

# the server closes with a code and a reason
w = WS('/bye')
w.frame(1, b'bye'); op, p = w.recv(); print('server close', op, w.close_info(p))
w.frame(8, p[:2]); print('after close', w.recv()[0])

# back-pressure: 4 MiB in 60000-byte messages while the client reads nothing for a while, then everything
w = WS('/flood')
w.frame(1, b'flood')
time.sleep(0.3)
total, last = 0, b''
while True:
    op, p = w.recv()
    if op != 1: break
    if p.startswith(b'flood done'): last = p; break
    total += len(p)
print('flood', total >= 4 << 20, last.decode())
w.frame(8, struct.pack('>H', 1000)); w.recv()
w.s.close()

# idle: a silent client gets a ping after idleTimeoutMs (400 ms), then the server closes when it stays silent
w = WS('/idle')
w.s.settimeout(3)
print('idle ping', w.recv()[0])
print('idle close', w.recv()[0])

s = socket.create_connection(('127.0.0.1', PORT), timeout=5)
s.sendall(b'GET /quit HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
read_all(s)
