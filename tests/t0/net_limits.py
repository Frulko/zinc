#!/usr/bin/env python3
"""The client side of tests/t0/net_limits.sh: probes the server of tests/golden/host/net_limits.ts on ports A B C and prints one line per check
(compared with tests/golden/host/net_limits.out)."""
import socket, sys, time

A, B, C = (int(x) for x in sys.argv[1:4])


def conn(port):
    s = socket.create_connection(('127.0.0.1', port), timeout=5)
    return s


def read_all(s, limit=5.0):
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


def status(data):
    return data.split(b'\r\n', 1)[0].decode() if data else 'closed'


def ask(port, raw):
    s = conn(port)
    s.sendall(raw)
    r = read_all(s)
    s.close()
    return r


# keep-alive and pipelining: three requests in one write, answered in order on one connection
s = conn(A)
s.sendall(b'GET /1 HTTP/1.1\r\nHost: x\r\n\r\nPOST /2 HTTP/1.1\r\nHost: x\r\nContent-Length: 3\r\n\r\nabcGET /3 HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
r = read_all(s)
print('pipelined', r.count(b'HTTP/1.1 200'), [l.decode() for l in r.split(b'\r\n') if l.startswith(b'GET') or l.startswith(b'POST')] or r[-20:])
s.close()
# a header section over maxHeaderBytes: 431
print('header', status(ask(A, b'GET / HTTP/1.1\r\nHost: x\r\nX-Big: ' + b'a' * 2000 + b'\r\n\r\n')))
# a body over maxBodyBytes: 413, said by its Content-Length before it comes, and counted when it is chunked
print('body length', status(ask(A, b'POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 5000\r\n\r\n')))
print('body chunked', status(ask(A, b'POST / HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n' + b'800\r\n' + b'b' * 2048 + b'\r\n0\r\n\r\n')))
# connections per address: the fourth of three allowed is closed before a byte is read
held = [conn(A) for _ in range(3)]
time.sleep(0.1)
extra = conn(A)
extra.sendall(b'GET / HTTP/1.1\r\nHost: x\r\n\r\n')
print('fourth connection', status(read_all(extra, 2)))
extra.close()
for h in held: h.close()
time.sleep(0.2)
# a client that trickles its headers (slowloris): 408 once headersTimeoutMs passed, though bytes keep coming
s = conn(A)
t0 = time.time()
got = b''
s.settimeout(0.1)
for ch in b'GET /slow HTTP/1.1\r\nHost: x\r\nX-A: 1234567890\r\n':
    try:
        s.sendall(bytes([ch]))
    except OSError:
        break
    try:
        d = s.recv(4096)
        if d: got += d
        if d == b'' or got: break
    except socket.timeout:
        pass
got += read_all(s, 2)
print('slow headers', status(got), 'within 2s' if time.time() - t0 < 2 else 'too late')
s.close()
# an idle kept-alive connection is closed after keepAliveTimeoutMs
s = conn(A)
s.sendall(b'GET / HTTP/1.1\r\nHost: x\r\n\r\n')
t0 = time.time()
r = read_all(s, 3)
print('keep-alive idle', status(r), 'closed after', 'about 0.3s' if 0.2 < time.time() - t0 < 1.5 else '%.2fs' % (time.time() - t0))
s.close()
# request rate: 3 per second per address, the fourth in the same second gets 429
s = conn(B)
codes = []
for i in range(4):
    s.sendall(b'GET /r HTTP/1.1\r\nHost: x\r\n\r\n')
    d = b''
    s.settimeout(3)
    while b'\r\n\r\n' not in d:
        x = s.recv(4096)
        if not x: break
        d += x
    codes.append(status(d).split(' ')[1] if d else 'closed')
    if not d or b'Connection: close' in d: break
print('rate', ' '.join(codes))
s.close()
# a streamed request body: 3 MiB sent in pieces, counted by the program as it arrives
s = conn(C)
size = 3 << 20
s.sendall(b'POST /upload HTTP/1.1\r\nHost: x\r\nContent-Length: %d\r\n\r\n' % size)
piece = b'u' * (1 << 16)
for _ in range(size // len(piece)): s.sendall(piece)
r = b''
s.settimeout(10)
while b'bytes' not in r:
    x = s.recv(4096)
    if not x: break
    r += x
print('upload', r.split(b'\r\n\r\n', 1)[-1].decode())
# a streamed reply: chunked, 40 x 64 KiB read slowly at first so that the server waits for the drain
s.sendall(b'GET /download HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
time.sleep(0.3)
r = read_all(s, 10)
head, _, body = r.partition(b'\r\n\r\n')
total, rest = 0, body
while True:
    line, _, rest = rest.partition(b'\r\n')
    n = int(line or b'0', 16)
    if n == 0: break
    total += n
    rest = rest[n + 2:]
print('download', b'Transfer-Encoding: chunked' in head, total)
s.close()
for p in (A,):
    ask(p, b'GET /quit HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
