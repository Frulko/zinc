#!/bin/sh
# Zinc Atelier's first-launch tour (ZN-774.08), on two headless sessions of one fresh home:
#   first launch   the language card comes first, in the system's language (LANG=fr_FR); Spanish is chosen there and the next cards are
#                  in Spanish, the choice saved in config.json. Next goes through the steps in order, each with the box of the part it
#                  points at; the waiting steps go on by themselves: Hello opened, a run, the mistake the tour puts in the code fixed
#                  (Fix it for me: the code is as it was). Finishing writes the done marker
#   second launch  no tour unasked; Help > Tour replays it from the welcome, and Escape skips it
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/home"
for d in toolchains cache index sysroots; do [ -e "${ZINC_HOME:-$HOME/.zinc}/$d" ] && ln -s "${ZINC_HOME:-$HOME/.zinc}/$d" "$tmp/home/$d"; done   # its own config.json, the same toolchains and caches
run() {   # run <name> [VAR=value...]: one session on $tmp/<name>.session (and .input), its output in $tmp/<name>.out
  name=$1; shift
  touch "$tmp/$name.input"
  env -u ZINC_LANG "$@" ZINC_HOME="$tmp/home" ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_TOUR=1 ZINC_ATELIER_SYNC=1 ZINC_ATELIER_ECHO=1 ZINC_SYSTEM_LOG=/dev/null \
    ZINC_ATELIER_SCRIPT="$tmp/$name.session" ZINC_INPUT="$tmp/$name.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 "$ZINC" run app/atelier >"$tmp/$name.out" 2>"$tmp/$name.err" \
    || { echo "atelier tour: the $name session failed: $(tail -c 300 "$tmp/$name.err")"; fail=1; }
}

cat > "$tmp/first.session" <<'EOF'
2 tour:step
3 tour:lang:es
4 tour:next
5 tour:step
6 tour:next
7 tour:step
8 example:hello
10 tour:step
11 tour:next
12 tour:step
13 run
15 tour:step
16 tour:next
18 tour:step
19 tour:fix
21 tour:step
22 tour:next
23 tour:step
24 tour:next
25 tour:step
26 tour:next
27 tour:step
28 tour:next
29 tour:step
30 quit
EOF
run first LANG=fr_FR.UTF-8 ZINC_FRAMES=30 ZINC_SHOT="$tmp/tour.png" ZINC_SHOT_FRAMES=2,5,18,27 ZINC_SCENE_DUMP="$tmp/scene"
[ -n "$ATELIER_KEEP" ] && cp "$tmp"/tour-*.png "$ATELIER_KEEP"
python3 - "$tmp" <<'EOF' || fail=1
import re, subprocess, sys
tmp = sys.argv[1]
steps = [l.split()[1:] for l in open(tmp + '/first.out') if l.startswith('[tour] ')]
order = ['language', 'welcome', 'example', 'editor', 'run', 'console', 'error', 'completion', 'palette', 'devices', 'templates', 'off']
bad = 0
if [s[0] for s in steps] != order: print('atelier tour: the steps were %s, not %s' % ([s[0] for s in steps], order)); bad += 1
for s in steps:
    if s[0] in ('language', 'off'): continue
    b = [float(v) for v in s[1:]] if len(s) == 5 else []
    if not b or b[2] <= 0 or b[3] <= 0 or b[0] < 0 or b[1] < 0 or b[0] + b[2] > 1280 or b[1] + b[3] > 800:
        print('atelier tour: the %s step points at no part of the window: %s' % (s[0], s[1:])); bad += 1
def texts(frame): return subprocess.run(['python3', 'tools/scene-texts', '%s/scene-%d' % (tmp, frame)], capture_output=True, text=True).stdout
for frame, want in ((2, 'Choisissez votre langue'), (5, 'Te damos la bienvenida a Zinc Atelier'), (18, 'Un error y su arreglo'), (27, 'Empieza el tuyo')):
    if want not in texts(frame): print('atelier tour: frame %d does not show "%s"' % (frame, want)); bad += 1
sys.exit(1 if bad else 0)
EOF
grep -q '"lang":"es"' "$tmp/home/config.json" 2>/dev/null || { echo "atelier tour: the language chosen is not saved: $(cat "$tmp/home/config.json" 2>&1)"; fail=1; }
grep -q '^\[status\].*clearr' "$tmp/first.out" || { echo "atelier tour: the mistake of the error step was not reported: $(grep status "$tmp/first.out" | tail -3)"; fail=1; }
grep -q 'clear(0x' "$tmp/book/hello/main.ts" && ! grep -q 'clearr' "$tmp/book/hello/main.ts" || { echo "atelier tour: the sketch is not as it was after the fix: $(grep clear "$tmp/book/hello/main.ts")"; fail=1; }
grep -q '"tour":"done"' "$tmp/book/.atelier.json" && grep -q '"skipped":false' "$tmp/book/.atelier.json" || { echo "atelier tour: finishing did not write the done marker: $(cat "$tmp/book/.atelier.json" 2>&1)"; fail=1; }

rm -f "$tmp/book/.last"   # the start view again, as on a first launch: only the marker says the tour was done
printf '2 tour:step\n3 help-tour\n4 tour:step\n9 tour:step\n10 quit\n' > "$tmp/second.session"
printf '5 key Escape\n' > "$tmp/second.input"   # input frames count the polls, two behind the session's
run second ZINC_FRAMES=10
[ "$(grep '^\[tour\] ' "$tmp/second.out" | cut -d' ' -f2 | tr '\n' ' ')" = "off welcome off " ] \
  || { echo "atelier tour: a second launch, Help > Tour then Escape gave: $(grep '^\[tour\] ' "$tmp/second.out" | tr '\n' ' ')"; fail=1; }
grep -q '"skipped":true' "$tmp/book/.atelier.json" || { echo "atelier tour: a skipped tour is not remembered: $(cat "$tmp/book/.atelier.json")"; fail=1; }
exit $fail
