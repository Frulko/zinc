#!/usr/bin/env python3
# The board of tests/t1/serial.sh: opens a pseudo-terminal pair, runs `<command...>` with SERIAL_PORT set to the slave side, and talks to it
# on the master side. Prints the program's output, then one line per check of what the program wrote to the port.
import os, pty, select, subprocess, sys, time

master, slave = pty.openpty()
prog = subprocess.Popen(sys.argv[1:], env={**os.environ, 'SERIAL_PORT': os.ttyname(slave)}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
checks = []

def read(n=None, until=None, seconds=20):
    """n bytes, or up to and including `until`; what came when the time is over."""
    got, end = b'', time.time() + seconds
    while (n is None or len(got) < n) and (until is None or not got.endswith(until)) and time.time() < end:
        if select.select([master], [], [], 0.1)[0]:
            got += os.read(master, 1 if until else min(65536, n - len(got)))
    return got

def check(what, ok):
    checks.append('%s: %s' % (what, 'ok' if ok else 'WRONG'))

try:
    check('ready', read(until=b'\n') == b'ready\n')          # the program has set the port raw: nothing is written before
    os.close(slave)
    os.write(master, b'ping\n')
    check('pong', read(until=b'\n') == b'pong\n')
    os.write(master, 'text héllo ✓\r\n'.encode())            # CR LF, UTF-8
    check('text', read(until=b'\n') == 'TEXT HÉLLO ✓\r\n'.encode())
    os.write(master, b'bytes\n')
    check('every byte value out', read(256) == bytes(range(256)))
    payload = bytes(range(256)) * 4                           # every value in, 1024 bytes: XON, XOFF, NUL, CR, LF, 0xFF unchanged
    os.write(master, payload + b'\ncount\n')
    check('counted', read(until=b'\n') == b'counted\n')
    os.write(master, b'big\n')
    big = read(200000)
    check('200000 bytes out', big == bytes((i * 7) % 251 for i in range(200000)))
    os.close(master)                                          # the board is unplugged
    out = prog.communicate(timeout=20)[0]
except Exception as e:
    prog.kill()
    out = prog.communicate()[0]
    checks.append('driver: %r' % e)
sys.stdout.write(out.decode(errors='replace'))
print('\n'.join(checks))
print('exit', prog.returncode)
