#!/usr/bin/env python3
"""A Mac's side of the sidecar stream, scripted (plugins/display-rmpp/stream.h): send.py <port> waits for the tablet, prints its hello, sends the
pen's waveform, a 1-bit rectangle, a grey one and a full refresh, prints each answer, then leaves."""
import socket, struct, sys, time

port = int(sys.argv[1])
for _ in range(300):
    try: s = socket.create_connection(('127.0.0.1', port), timeout=20); break
    except OSError: time.sleep(0.1)
else: sys.exit('send.py: no tablet')
f = s.makefile('rb')
print('hello', f.readline().decode().strip())
msg = lambda t, x=0, y=0, w=0, h=0, depth=1, pl=b'': s.sendall(struct.pack('<BBHHHHHI', t, depth, x, y, w, h, 0, len(pl)) + pl)
msg(2, 0)                                        # the pen's waveform
msg(1, 96, 200, 64, 16, 1, b'\xff' * (8 * 16))   # a black 64x16 block
print('ack', struct.unpack('<II', f.read(8))[0])
msg(1, 0, 0, 10, 2, 8, bytes(range(0, 200, 10)))  # grey levels
print('ack', struct.unpack('<II', f.read(8))[0])
msg(3)                                           # a full refresh
time.sleep(1.5)
s.close()
print('left')
