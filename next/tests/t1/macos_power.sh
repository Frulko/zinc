#!/bin/sh
# Power, idle, appearance, the sleep blocker and the rich clipboard on macOS (ZN-244): battery and idle values are valid, suspend/resume/lock/unlock arrive as events (the NSWorkspace notifications
# posted by hand), preventSleep shows in `pmset -g assertions` while held and is gone after release, and html, an image and a file list round-trip through NSPasteboard.
# The clipboard text is saved and restored around the run.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); export ZINC_HOME="$tmp/home"; mkdir -p "$ZINC_HOME"
saved=$(pbpaste 2>/dev/null)
trap 'printf "%s" "$saved" | pbcopy; /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$ZINC_HOME/cache/macos/devapp/dev.zinc.test.power.app" >/dev/null 2>&1; rm -rf "$tmp"' EXIT
fail=0
d=tests/golden/macos/power
( cd "$d" && env -u ZINC_DETERMINISTIC "$ZINC" run main.ts > "$tmp/out.log" 2>&1 ) &
n=0; held=""; while [ $n -lt 150 ]; do sleep 0.1; n=$((n+1)); if pmset -g assertions 2>/dev/null | grep -q 'named: "zinc selftest"'; then held=1; break; fi; done
[ -n "$held" ] || { echo "no IOKit assertion named zinc selftest while the lock is held"; fail=1; }
wait
pmset -g assertions 2>/dev/null | grep -q 'named: "zinc selftest"' && { echo "the sleep assertion is still there after release"; fail=1; }
sed 's/PMSET [0-9]*/PMSET token/;s/battery valid present [a-z]*/battery valid present X/' "$tmp/out.log" > "$tmp/norm.log"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/norm.log" "$d/expected"; exit 0; fi
diff -q "$tmp/norm.log" "$d/expected" >/dev/null || { echo "output differs from $d/expected"; diff "$tmp/norm.log" "$d/expected" | head -6; fail=1; }
[ $fail -eq 0 ] && echo "macos power: ok"
exit $fail
