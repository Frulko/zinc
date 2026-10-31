#!/bin/sh
# zinc:shell (plugins/shell, docs/reports/zinc-shell/03-design.md): a headless shell program starts a stand-in app (tests/golden/shell/standin.py,
# the app's side of the wire in Python) through shell.start(): the app gets four shared buffers (SH_MAX_BUFFERS), its first frame is drawn below the bar,
# a scripted tap below the bar reaches it shifted by the bar and is not seen by the shell's program (a tap on the bar is), Home asks it to
# quit and, as it ignores that and SIGTERM, kills it within 3 s; the agent's pid file lives while it runs, its log ends with [exited 137].
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/app" "$tmp/home"
# a home of its own for the agent's files, the real one's toolchains and caches (no download, the plugin built once)
real=${ZINC_HOME:-$HOME/.zinc}
for e in "$real"/*; do [ -e "$e" ] && [ "$(basename "$e")" != agent ] && ln -s "$e" "$tmp/home/"; done
printf '#!/bin/sh\nexec python3 -I "%s" "%s"\n' "$PWD/tests/golden/shell/standin.py" "$tmp/app.out" > "$tmp/app/run.sh"
printf '250 move 100 10\n252 down\n255 up\n290 move 100 150\n300 down\n305 up\n' > "$tmp/input"
env -u ZINC_DETERMINISTIC ZINC_HEADLESS=1 ZINC_HOME="$tmp/home" ZINC_SHELL_SOCKET="$tmp/s.sock" ZINC_INPUT="$tmp/input" ZINC_FRAMES=100000 \
  SH_APP="$tmp/app" SH_SHOT="$tmp/shot.bmp" timeout 90 "$ZINC" run tests/golden/shell/shell.ts >"$tmp/shell.out" 2>&1
fail=0
grep -q "^started ok" "$tmp/shell.out" || { echo "shell.start failed: $(head -c 400 "$tmp/shell.out")"; exit 1; }
python3 -I - "$tmp" <<'EOF' || fail=1
import re, struct, sys
tmp = sys.argv[1]
shell, app = open(tmp + '/shell.out').read(), open(tmp + '/app.out').read() if __import__('os').path.exists(tmp + '/app.out') else ''
bad = []
def need(cond, what):
    if not cond: bad.append(what)
m = re.search(r'size (\d+) (\d+) bar (\d+) title (.*) current (\S*) responding (\w+)', shell)
need(m, 'no frame of the app was shown')
if m:
    W, H, bar = int(m[1]), int(m[2]), int(m[3])
    need(bar == min(56, max(32, round(H / 15))), 'bar height %d for a screen %d high' % (bar, H))
    need(m[4] == 'Stand-in' and m[5] == 'standin' and m[6] == 'true', 'title/current/responding: ' + m[0])
    need('display shell' in app and 'pidfile True' in app, 'the app\'s environment or pid file: ' + app[:200])
    need('buffers %d %d %d 34325258 1 4' % (W, H - bar, W * 4) in app, 'the buffers sent: ' + app[:300])
    b = open(tmp + '/shot.bmp', 'rb').read()
    off, bw, bh, bpp = struct.unpack_from('<I', b, 10)[0], *struct.unpack_from('<iiHH', b, 18)[:2], struct.unpack_from('<H', b, 28)[0]
    def px(x, y):
        row = (abs(bh) - 1 - y) if bh > 0 else y
        stride = (bw * bpp // 8 + 3) & ~3
        o = off + row * stride + x * bpp // 8
        return b[o + 2], b[o + 1], b[o]
    k = bw // W
    need(px(bw // 2, (bar + (H - bar) // 2) * k) == (0xCC, 0x33, 0x66), 'app area of the shot is %s, not the app\'s colour' % (px(bw // 2, (bar + (H - bar) // 2) * k),))
    need(px(bw // 2, bar * k // 2) == (0, 0, 255), 'bar of the shot is %s, not the bar\'s blue' % (px(bw // 2, bar * k // 2),))
    downs = re.findall(r'down ([\d.]+) ([\d.]+)', app)
    need(len(downs) == 1, 'the app got %d presses, not the one below the bar' % len(downs))
    if downs:
        x, y = map(float, downs[0])
        need(abs(x - 100 / W) < 0.01 and abs(y - (150 - bar) / (H - bar)) < 0.01, 'the tap reached the app at %.4f %.4f, not shifted by the bar' % (x, y))
    need('up' in app.split(), 'the release did not reach the app')
    need('release 0' in app, 'buffer 0 was not released after the next frame')
need('bar press seen true, app press seen false' in shell, 'the shell program saw: ' + (re.search(r'second frame.*', shell) or ['no second frame'])[0])
need("home: image -1 current ''" in shell, 'home() left the image or the name')
need('quit 0' in app, 'the app got no QUIT (Home)')
need(re.search(r"exit standin 137 image -1 current '' after home in time", shell), 'onExit: ' + (re.search(r'exit .*|timeout', shell) or ['never'])[0])
for x in bad: print(x)
sys.exit(1 if bad else 0)
EOF
[ -e "$tmp/home/agent/run/standin.pid" ] && { echo "the pid file outlived the app"; fail=1; }
tail -n 1 "$tmp/home/agent/logs/standin.log" 2>/dev/null | grep -q '^\[exited 137\]$' || { echo "the app's log does not end with [exited 137]"; fail=1; }
[ $fail = 0 ] || echo "shell output: $(head -c 600 "$tmp/shell.out")"
exit $fail
