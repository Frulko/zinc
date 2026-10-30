# A stand-in app for tests/t0/shell_plugin.sh: speaks the app's side of the shell wire (plugins/display-remote/remote_proto.h, SH_*) with
# the standard library only, writes what it got to argv[1], and ignores QUIT and SIGTERM so the shell has to kill it.
import mmap, os, signal, socket, struct, sys, time

out = open(sys.argv[1], 'a', buffering=1)
signal.signal(signal.SIGTERM, signal.SIG_IGN)
home = os.environ['ZINC_HOME']
out.write('display %s\n' % os.environ.get('ZINC_DISPLAY'))
out.write('pidfile %s\n' % os.path.exists(home + '/agent/run/standin.pid'))
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect(os.environ['ZINC_SHELL_SOCKET'])
name = b'Stand-in'
s.sendall(struct.pack('<BIHI', 32, 6 + len(name), 1, os.getpid()) + name)


def send(t, payload):
    s.sendall(struct.pack('<BI', t, len(payload)) + payload)


def fill(i, colour):
    maps[i][:] = struct.pack('<I', colour) * (w * h)


data, fds, maps, w, h, downs = b'', [], [], 0, 0, 0
while True:
    try:
        chunk, got, _, _ = socket.recv_fds(s, 65536, 8)
    except OSError:
        chunk = b''
    if not chunk:
        out.write('eof\n')
        while True:
            time.sleep(1)   # gone only when killed
    data += chunk
    fds += got
    while len(data) >= 5:
        t, n = struct.unpack_from('<BI', data)
        if len(data) < 5 + n:
            break
        p, data = data[5:5 + n], data[5 + n:]
        if t == 40:   # BUFFERS
            w, h, stride, fourcc, kind, k = struct.unpack_from('<HHIIBB', p)
            maps = [mmap.mmap(fds.pop(0), stride * h) for _ in range(k)]
            out.write('buffers %d %d %d %08x %d %d\n' % (w, h, stride, fourcc, kind, k))
            fill(0, 0xCC3366)
            send(33, bytes([0, 0]))
        elif t == 22:   # INPUT: x, y (0..1 of the app's surface), down
            x, y, down = struct.unpack_from('<ffB', p)
            if down and downs == 0:
                downs = 1
                out.write('down %.4f %.4f\n' % (x, y))
                fill(1, 0x33CC66)
                send(33, bytes([1, 1]) + struct.pack('<HHHH', 0, 0, w, h))
            elif not down and downs == 1:
                downs = 2
                out.write('up\n')
        elif t == 41:
            out.write('release %d\n' % p[0])
        elif t == 20:   # PING: PONG
            send(4, p)
        elif t == 42:
            out.write('quit %d\n' % p[0])
