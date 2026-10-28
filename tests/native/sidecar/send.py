#!/usr/bin/env python3
"""A Mac's side of the sidecar stream, scripted (plugins/display-rmpp/stream.h): send.py <port> waits for the tablet, prints its hello, sends the
pen's waveform, a 1-bit rectangle, a grey one and a full refresh, prints each answer and the first touch the tablet forwards, then leaves."""
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
def answer():
    """The tablet's next message: ('ack', n) or ('input', type, id, x, y, pressure)."""
    kind, typ, id_, a, b, c = struct.unpack('<BBHiii', f.read(16))
    return ('ack', a) if kind == 1 else ('input', typ, id_, a, b, c)
def ack():
    while (r := answer())[0] != 'ack': pass
    print('ack', r[1])
msg(1, 96, 200, 64, 16, 1, b'\xff' * (8 * 16))   # a black 64x16 block
ack()
msg(1, 0, 0, 10, 2, 8, bytes(range(0, 200, 10)))  # grey levels
ack()
msg(3)                                           # a full refresh
s.settimeout(20)
while (r := answer())[0] != 'input': pass        # a tap on the tablet (the test's ZN_RMPP_SIM_TAP)
print('input %#x %d,%d' % (r[1], r[3], r[4]))
time.sleep(1.5)                                  # the full refresh goes out from the app's frame loop
s.close()
print('left')
