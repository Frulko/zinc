#!/bin/sh
# Device core and upload protocol (ZN-030), on the development machine: `zinc device-sim` is the code a flashed ESP32 runs, fed through a
# pipe. A program runs and its output comes back, an uncaught exception ends with 101, a program of the golden set matches its output, and a
# module that is damaged, too big or not ZBC is refused (the protocol is written out by a small script, with console noise in front).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
sim="$ZINC device-sim"
printf "console.log('hello from the device');\nlet s = 0;\nfor (let i = 0; i < 1000; i++) s += i;\nconsole.log(s);\n" > "$tmp/hello.ts"
[ "$("$ZINC" run "$tmp/hello.ts" --target esp32 --device "$sim")" = "$("$ZINC" run "$tmp/hello.ts")" ] || { echo "hello differs between the device and the host"; fail=1; }
"$ZINC" run tests/golden/run/library.ts --target esp32 --device "$sim" | diff -q - tests/golden/run/library.out >/dev/null || { echo "library.ts differs on the device"; fail=1; }
printf "console.log('before');\nthrow new Error('boom');\n" > "$tmp/boom.ts"
out=$("$ZINC" run "$tmp/boom.ts" --target esp32 --device "$sim" 2>&1); rc=$?
[ $rc -eq 101 ] && echo "$out" | grep -q "Uncaught Error: boom" || { echo "an uncaught exception does not end with 101 and its message ($rc)"; fail=1; }
python3 - "$ZINC" <<'PY' || { echo "the protocol checks failed"; fail=1; }
import subprocess, sys, zlib
p = subprocess.Popen([sys.argv[1], "device-sim"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
def say(b): p.stdin.write(b); p.stdin.flush()
def line():
    buf = b""
    while True:
        c = p.stdout.read(1)
        if not c: return buf
        buf += c
        if c == b"\n": return buf
assert line().startswith(b"\x1eZN ready 0.1")          # announced at start-up
say(b"ets Jun  8 2016 boot noise\r\n\x1eZN ping\n")    # a boot log in front of the protocol
assert line().startswith(b"\x1eZN ready")
body = b"abcde"
say(b"\x1eZN load 5 deadbeef\n" + body)               # wrong checksum
assert b"err checksum mismatch" in line()
say(b"\x1eZN load 5 %08x\n" % zlib.crc32(body) + body)  # right checksum, not ZBC
assert b"err not a ZBC module" in line()
say(b"\x1eZN load 99999999 00000000\n")               # too big
assert b"does not fit" in line()
p.stdin.close(); p.wait()
PY
exit $fail
