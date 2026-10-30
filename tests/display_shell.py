#!/usr/bin/env python3
"""A stand-in Zinc shell for plugins/display-shell (tests/t0/display_shell.sh): the wire of plugins/display-remote/remote_proto.h over a Unix
socket, shm buffers as temp files passed with SCM_RIGHTS. Checks CONNECT, BUFFERS, the drawn pixels, back-pressure, PING, INPUT, a resize,
QUIT, the socket closing, and the error with no socket. Usage: display_shell.py <zinc>"""
import mmap, os, socket, struct, subprocess, sys, tempfile, threading, time

ZINC = sys.argv[1]
SH_INPUT, SH_CONNECT, SH_FRAME, SH_BUFFERS, SH_RELEASE, SH_QUIT, PING, PONG = 22, 32, 33, 40, 41, 42, 20, 4
XR24 = 0x34325258
BG, BOX = 0x2040C0, 0xFF8000
tmp = tempfile.mkdtemp(prefix="zsh")
PROGRAM = """
import { onFrame, clear, rect, width, height, pointerX, pointerY, pointerDown } from 'zinc:gfx';
let n = 0; let was = false; let lastW = 0;
onFrame((dt: number): void => {
  clear(0x2040c0);
  rect(10, 10, 50, 30, 0xff8000);
  rect(n % 100, 60, 4, 4, 0xffffff);   // a moving square: a frame each turn, so the shell's pace shows
  n++;
  if (width() !== lastW) { lastW = width(); console.log(`size ${width()}x${height()}`); }
  if (pointerDown() && !was) console.log(`down ${pointerX()},${pointerY()}`);
  was = pointerDown();
});
"""
main = os.path.join(tmp, "main.ts")
with open(main, "w") as f: f.write(PROGRAM)
fails = []

def check(ok, what):
    if not ok: fails.append(what); print("FAIL:", what, flush=True)

class App:
    def __init__(self, sock_path, extra_env=None):
        env = dict(os.environ, ZINC_HEADLESS="1", ZINC_FRAMES="1000000", ZINC_DISPLAY="shell", ZINC_SHELL_SOCKET=sock_path)
        env.update(extra_env or {})
        self.p = subprocess.Popen([ZINC, "run", main], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        self.lines = []
        threading.Thread(target=self.read, daemon=True).start()
    def read(self):
        for l in self.p.stdout: self.lines.append(l.rstrip("\n"))
    def wait_line(self, prefix, t=5):
        end = time.time() + t
        while time.time() < end:
            for l in self.lines:
                if l.startswith(prefix): return l
            time.sleep(0.02)
        return None
    def kill(self):
        if self.p.poll() is None: self.p.kill(); self.p.wait()

class Conn:
    def __init__(self, c): self.c, self.buf = c, b""
    def send(self, t, payload=b"", fds=None):
        m = struct.pack("<BI", t, len(payload)) + payload
        if fds: socket.send_fds(self.c, [m], fds)
        else: self.c.sendall(m)
    def recv(self, t=5):
        """The next message (type, payload), or None after t seconds."""
        end = time.time() + t
        while len(self.buf) < 5 or len(self.buf) < 5 + struct.unpack_from("<I", self.buf, 1)[0]:
            left = end - time.time()
            if left <= 0: return None
            self.c.settimeout(left)
            try: d = self.c.recv(65536)
            except socket.timeout: return None
            if not d: return None
            self.buf += d
        n = struct.unpack_from("<I", self.buf, 1)[0]
        m = (self.buf[0], self.buf[5:5 + n]); self.buf = self.buf[5 + n:]
        return m
    def frame(self, t=5):
        """The next FRAME as (buffer, rects), answering nothing else."""
        end = time.time() + t
        while True:
            m = self.recv(max(0.0, end - time.time()))
            if m is None: return None
            if m[0] == SH_FRAME:
                b, n = m[1][0], m[1][1]
                return b, [struct.unpack_from("<4H", m[1], 2 + 8 * i) for i in range(n)]

class Buffers:
    """n shm buffers of w x h XR24, sent to the app."""
    def __init__(self, conn, w, h, n=3):
        self.w, self.h, self.stride = w, h, w * 4 + 64   # a stride wider than the row: the driver must honour it
        self.files, self.maps = [], []
        for i in range(n):
            fd, path = tempfile.mkstemp(dir=tmp); os.unlink(path)
            os.ftruncate(fd, self.stride * h)
            self.files.append(fd); self.maps.append(mmap.mmap(fd, self.stride * h))
        conn.send(SH_BUFFERS, struct.pack("<HHIIBB", w, h, self.stride, XR24, 1, n), self.files)
        for fd in self.files: os.close(fd)
    def px(self, b, x, y): return struct.unpack_from("<I", self.maps[b], y * self.stride + x * 4)[0] & 0xFFFFFF

def input_msg(x, y, down):
    # mirror.cpp's INPUT: x, y, down, pbuttons, mods, buttons, wheel, wheel_x, no keys, no button events; then no touches
    return struct.pack("<ffBBIIffHH", x, y, down, 1 if down else 0, 0, 0, 0.0, 0.0, 0, 0) + b"\x00"

def listen(name):
    path = os.path.join(tmp, name)
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); s.bind(path); s.listen(1); s.settimeout(180)   # the first run builds the driver
    return s, path

# --- 1. the whole session
srv, path = listen("a.sock")
app = App(path)
try:
    c, _ = srv.accept(); conn = Conn(c)
    m = conn.recv(10)
    check(m is not None and m[0] == SH_CONNECT, "the first message is CONNECT: %r" % (m,))
    if m and m[0] == SH_CONNECT:
        ver, pid = struct.unpack_from("<HI", m[1]); name = m[1][6:].decode()
        check(ver == 1 and pid > 0 and name, "CONNECT carries version 1, a pid and a name: %d %d %r" % (ver, pid, name))
    bufs = Buffers(conn, 320, 200)
    got = [conn.frame(10) for _ in range(3)]
    check(all(got), "three frames, one in each buffer: %r" % (got,))
    if all(got):
        check(sorted(g[0] for g in got) == [0, 1, 2], "the three frames use the three buffers: %r" % (got,))
        check(got[0][1] == [], "the first frame is whole (n = 0): %r" % (got[0],))
        for b, _ in got:
            check(bufs.px(b, 20, 20) == BOX and bufs.px(b, 300, 180) == BG and bufs.px(b, 319, 199) == BG,
                  "buffer %d holds what the program drew: %06x %06x %06x" % (b, bufs.px(b, 20, 20), bufs.px(b, 300, 180), bufs.px(b, 319, 199)))
    check(conn.frame(0.6) is None, "no free buffer: the app waits (back-pressure)")
    check(app.wait_line("size 320x200", 2) is not None, "the program lays out at the buffers' size: %r" % app.lines)
    conn.send(PING, struct.pack("<I", 1234))
    conn.send(SH_INPUT, input_msg(0.5, 0.25, 1))
    conn.send(SH_RELEASE, b"\x00")
    pong = None
    end = time.time() + 5; nframes = 0
    while time.time() < end and (pong is None or nframes < 1):
        m = conn.recv(end - time.time())
        if m is None: break
        if m[0] == PONG: pong = struct.unpack_from("<I", m[1])[0]
        if m[0] == SH_FRAME: nframes += 1; check(m[1][0] == 0, "the released buffer is the one drawn: %d" % m[1][0])
    check(pong == 1234, "PING 1234 is answered PONG 1234: %r" % pong)
    check(nframes == 1 and conn.frame(0.4) is None, "one release, one frame: %d" % nframes)
    # from here the shell releases each buffer as the next one arrives
    last = got[2][0] if all(got) else 2
    def pace(t):
        global last
        f = conn.frame(t)
        if f: conn.send(SH_RELEASE, bytes([last])); last = f[0]
        return f
    conn.send(SH_RELEASE, bytes([last])); last = 0
    for _ in range(5): pace(2)
    check(app.wait_line("down 160,50", 3) is not None, "the tap reaches the program at (160, 50): %r" % app.lines)
    conn.send(SH_INPUT, input_msg(0.5, 0.25, 0))
    # a new size: new buffers, the program lays out again and the next whole frame fills a new buffer
    bufs2 = Buffers(conn, 200, 120)
    whole = None; end = time.time() + 5
    while time.time() < end:
        f = conn.frame(end - time.time())
        if f is None: break
        if f[1] == []: whole = f; break
    check(whole is not None, "after BUFFERS a whole frame comes")
    if whole:
        b = whole[0]
        check(bufs2.px(b, 20, 20) == BOX and bufs2.px(b, 190, 110) == BG and bufs2.px(b, 199, 119) == BG,
              "the new buffer holds the frame at 200x120: %06x %06x %06x" % (bufs2.px(b, 20, 20), bufs2.px(b, 190, 110), bufs2.px(b, 199, 119)))
    check(app.wait_line("size 200x120", 3) is not None, "the program lays out at 200x120: %r" % app.lines)
    conn.send(SH_QUIT, b"\x00")
    t0 = time.time()
    try: code = app.p.wait(2.5)
    except subprocess.TimeoutExpired: code = None
    check(code == 0, "QUIT ends the app with 0 within 2 s: %r after %.1fs" % (code, time.time() - t0))
    c.close()
finally:
    app.kill(); srv.close()

# --- 2. the shell goes away: the app ends
srv, path = listen("b.sock")
app = App(path)
try:
    c, _ = srv.accept(); conn = Conn(c)
    conn.recv(10)
    Buffers(conn, 160, 100)
    check(all(conn.frame(10) for _ in range(3)) and conn.frame(0.3) is None, "three frames, then the app waits for a buffer")
    c.close()   # it is blocked on the socket: only the end of the stream can end it
    try: code = app.p.wait(2.5)
    except subprocess.TimeoutExpired: code = None
    check(code is not None, "the socket closing ends the app")
finally:
    app.kill(); srv.close()

# --- 3. no shell: a clear error naming the variable
for env, want in (({"ZINC_SHELL_SOCKET": ""}, "ZINC_SHELL_SOCKET is not set"), ({"ZINC_SHELL_SOCKET": os.path.join(tmp, "none.sock")}, "ZINC_SHELL_SOCKET=")):
    app = App("", env)
    try: code = app.p.wait(60)
    except subprocess.TimeoutExpired: code = None
    time.sleep(0.1)
    out = "\n".join(app.lines)
    check(code not in (0, None) and want in out, "no shell: exit %r and '%s' in: %s" % (code, want, out[-300:]))
    app.kill()

print("display_shell: ok" if not fails else "display_shell: %d failed" % len(fails))
sys.exit(1 if fails else 0)
