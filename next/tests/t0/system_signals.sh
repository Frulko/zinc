#!/bin/sh
# The system's signals (docs/ui.md, "System signals"; docs/reports/mobile-native-feel.md item 3): a ZINC_INPUT script sends what a phone's OS
# sends (safe area, theme, font scale, keyboard, reduce motion, back); main.tsx's page and log, and rn.tsx's React Native APIs with the calls
# the program makes of the OS (ZINC_DEVICE_LOG: haptics, status bar, the system's back). SYSTEM_SIGNALS_BLESS=1 rewrites main.hash.
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
[ $fail -eq 0 ] && echo "system signals: ok"
exit $fail
