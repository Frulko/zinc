#!/usr/bin/env python3
"""A tiny MQTT 3.1.1 broker for tests/t0/mqtt.sh: CONNACK, SUBSCRIBE (+, # filters), PUBLISH QoS 0/1 fan-out, PINGREQ, DISCONNECT.
Usage: mqtt_broker.py PORT; prints "ready" once it listens; exits when every client has disconnected."""
import socket, sys, threading

def rd(c, n):
    b = b''
    while len(b) < n:
        d = c.recv(n - len(b))
        if not d: raise EOFError
        b += d
    return b

def packet(c):
    h = rd(c, 1)[0]; n = 0; m = 1
    while True:
        d = rd(c, 1)[0]; n += (d & 127) * m; m *= 128
        if not d & 128: break
    return h, rd(c, n)

def match(f, t):
    f = f.split('/'); t = t.split('/')
    for i, x in enumerate(f):
        if x == '#': return True
        if i >= len(t) or (x != '+' and x != t[i]): return False
    return len(f) == len(t)

subs = []; lock = threading.Lock(); retained = {}
def out(h, body):
    n = len(body); v = b''
    while True:
        d = n % 128; n //= 128; v += bytes([d | (128 if n else 0)])
        if not n: break
    return bytes([h]) + v + body
def pub(topic, payload, retain=False):
    t = topic.encode()
    return out(0x30 | (1 if retain else 0), len(t).to_bytes(2, 'big') + t + payload)

def serve(c):
    mine = []
    try:
        while True:
            h, p = packet(c)
            k = h >> 4
            if k == 1: c.sendall(b'\x20\x02\x00\x00')
            elif k == 8:
                i = 2; granted = b''
                while i < len(p):
                    n = int.from_bytes(p[i:i+2], 'big'); f = p[i+2:i+2+n].decode(); i += 3 + n
                    with lock: subs.append((f, c)); mine.append(f)
                    granted += b'\x00'
                c.sendall(out(0x90, p[:2] + granted))
                for t, (pl) in list(retained.items()):
                    if match(f, t): c.sendall(pub(t, pl, True))
            elif k == 3:
                n = int.from_bytes(p[:2], 'big'); t = p[2:2+n].decode(); o = 2 + n
                if (h >> 1) & 3: c.sendall(out(0x40, p[o:o+2])); o += 2   # PUBACK
                if h & 1: retained[t] = p[o:]
                with lock:
                    for f, s in list(subs):
                        if match(f, t): s.sendall(pub(t, p[o:]))
            elif k == 12: c.sendall(b'\xd0\x00')
            elif k == 14: break
    except (EOFError, OSError): pass
    finally:
        with lock:
            subs[:] = [x for x in subs if x[1] is not c]
        c.close()

s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('127.0.0.1', int(sys.argv[1]))); s.listen(8); s.settimeout(30)
print('ready', flush=True)
ts = []
try:
    while True:
        c, _ = s.accept(); t = threading.Thread(target=serve, args=(c,), daemon=True); t.start(); ts.append(t)
        if len(ts) >= 2 and not any(t.is_alive() for t in ts): break
except socket.timeout: pass
