#!/bin/sh
# The system's signals (docs/ui.md, "System signals"; docs/reports/mobile-native-feel.md item 3): a ZINC_INPUT script sends what a phone's OS
# sends (safe area, theme, font scale, keyboard, reduce motion, back); main.tsx's page and log, and rn.tsx's React Native APIs with the calls
# the program makes of the OS (ZINC_DEVICE_LOG: haptics, status bar, the system's back), and lifecycle.tsx's home, return and rotation.
# SYSTEM_SIGNALS_BLESS=1 rewrites main.hash and lifecycle.expected.
cd "$(dirname "$0")/../golden/system-signals" || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
run() { env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=180x240 ZINC_FRAMES=6 ZINC_INPUT=signals.input "$@"; }
run ZINC_FRAMEHASH=last "$ZINC" run main.tsx > "$tmp/main.out" 2> "$tmp/main.err"
hash=$(sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p' "$tmp/main.err")
if [ -n "$SYSTEM_SIGNALS_BLESS" ]; then echo "$hash" > main.hash; fi
[ -n "$hash" ] && [ "$hash" = "$(cat main.hash)" ] || { echo "system_signals: frame hash '$hash', golden '$(cat main.hash)' (look at it with ZINC_SHOT)"; fail=1; }
diff main.expected "$tmp/main.out" > "$tmp/d" || { echo "system_signals: main.tsx printed:"; cat "$tmp/d"; fail=1; }
run ZINC_DEVICE_LOG="$tmp/device.log" ZINC_PLATFORM=android "$ZINC" run rn.tsx > "$tmp/rn.out" 2>/dev/null
cat "$tmp/device.log" >> "$tmp/rn.out"
diff rn.expected "$tmp/rn.out" > "$tmp/d" || { echo "system_signals: rn.tsx printed:"; cat "$tmp/d"; fail=1; }
# the lifecycle and a rotation (ZN-625): the log, then the hashes of frames 3 to 5 (in the background: one picture, the counter stopped) and 8 (turned)
run ZINC_FRAMES=9 ZINC_INPUT=lifecycle.input ZINC_FRAMEHASH=all "$ZINC" run lifecycle.tsx > "$tmp/lc.out" 2> "$tmp/lc.err"
for f in 2 3 4 5 6 8; do echo "frame $f $(sed -n "s/^zinc: framehash $f //p" "$tmp/lc.err")"; done >> "$tmp/lc.out"
if [ -n "$SYSTEM_SIGNALS_BLESS" ]; then cp "$tmp/lc.out" lifecycle.expected; fi
diff lifecycle.expected "$tmp/lc.out" > "$tmp/d" || { echo "system_signals: lifecycle.tsx printed:"; cat "$tmp/d"; fail=1; }
[ $fail -eq 0 ] && echo "system signals: ok"
exit $fail
