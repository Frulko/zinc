#!/usr/bin/env python3
"""A Mac's side of the sidecar stream, scripted (plugins/display-rmpp/stream.h): send.py <port> waits for the tablet, prints its hello, sends the
pen's waveform, a 1-bit rectangle, a grey one, an lz4 one, two of one picture (one update), the pointer, a scroll's copy and a full refresh, prints each answer and the first touch the tablet forwards, then leaves.
send.py <port> notap: no touch to wait for (the ink session has no scripted tap). A last word "quit": then connects again and asks the
tablet's app to end (QUIT)."""
import socket, struct, sys, time

port = int(sys.argv[1])
for _ in range(300):
    try: s = socket.create_connection(('127.0.0.1', port), timeout=20); break
    except OSError: time.sleep(0.1)
else: sys.exit('send.py: no tablet')
f = s.makefile('rb')
print('hello', f.readline().decode().strip())
msg = lambda t, x=0, y=0, w=0, h=0, depth=1, pl=b'', lz=0, more=0: s.sendall(struct.pack('<BBHHHHBBI', t, depth, x, y, w, h, lz, more, len(pl)) + pl)
msg(2, 0)                                        # the pen's waveform
def answer():
    """The tablet's next message: ('ack', n), ('input', type, id, x, y, pressure), or ('other', kind) (way up, full refresh, room)."""
    kind, typ, id_, a, b, c = struct.unpack('<BBHiii', f.read(16))
    return ('ack', a) if kind == 1 else ('input', typ, id_, a, b, c) if kind == 2 else ('other', kind)
def ack():
    while (r := answer())[0] != 'ack': pass
    print('ack', r[1])
msg(1, 96, 200, 64, 16, 1, b'\xff' * (8 * 16))   # a black 64x16 block
ack()
msg(1, 0, 0, 10, 2, 8, bytes(range(0, 200, 10)))  # grey levels
ack()
msg(1, 200, 300, 16, 8, 1, bytes([0xF0, 1]) + b'\xff' * 16, lz=1)   # 16x8 black, one lz4 block of literals
ack()
msg(1, 400, 400, 8, 4, 1, b'\xff' * 4, more=1)   # two halves of one picture: one update 16x4
msg(1, 408, 400, 8, 4, 1, b'\xff' * 4)
ack(); ack()
msg(4, 1, 1, 3, 3, pl=b'\x02' * 9, more=1)        # a black 3x3 pointer, its hot spot in the middle
msg(5, 600, 600, 1)                              # at 600,600: drawn at 599,599
msg(6, 200, 300, 16, 8, pl=struct.pack('<hh', 0, 40))   # the lz4 block, scrolled 40 down
msg(1, 704, 704, 8, 8, 1, b'\xff' * 8)          # black, then white at once: the white is held until the black has moved the panel
ack()
msg(1, 704, 704, 8, 8, 1, b'\x00' * 8)
ack()
time.sleep(0.8)
msg(3)                                           # a full refresh
s.settimeout(20)
if 'notap' not in sys.argv[2:]:
    while (r := answer())[0] != 'input': pass    # a tap on the tablet (the test's ZN_RMPP_SIM_TAP)
    print('input %#x %d,%d' % (r[1], r[3], r[4]))
time.sleep(1.5)                                  # the full refresh goes out from the app's frame loop
f.close(); s.close()                             # the file holds the socket open too
print('left')
if sys.argv[-1] == 'quit':
    time.sleep(1)
    s = socket.create_connection(('127.0.0.1', port), timeout=20)
    s.recv(128)                                  # the hello
    s.sendall(struct.pack('<BBHHHHBBI', 8, 0, 0, 0, 0, 0, 0, 0, 0))
    time.sleep(1)
    s.close()
    print('asked to quit')
