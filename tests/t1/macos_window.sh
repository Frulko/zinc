#!/bin/sh
# The native application menu (ZN-236, macOS only): the template of docs/reports/system-integration.md 4.3 becomes NSApp.mainMenu; the selftest dump equals tests/golden/macos/window/expected,
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"; mkdir -p "$ZINC_HOME"
d=tests/golden/macos/window
got=$(cd "$d" && env -u ZINC_DETERMINISTIC "$ZINC" run main.ts 2>&1)
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$ZINC_HOME/cache/macos/devapp/dev.zinc.test.window.app" >/dev/null 2>&1
# AppKit assigns a different id on every launch; both readbacks must still name the same live window.
printf '%s\n' "$got" > "$tmp/readback"
got=$(python3 - "$tmp/readback" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
ids = re.findall(r'^windowNumber (\d+)$', text, re.M)
assert len(ids) == 2 and len(set(ids)) == 1 and int(ids[0]) > 0, 'readbacks must share a positive native window id'
print(re.sub(r'^windowNumber \d+$', 'windowNumber <native>', text, flags=re.M), end='')
PY
) || { cat "$tmp/readback"; exit 1; }
if [ -n "$ZN_UPDATE_GOLDEN" ]; then printf '%s\n' "$got" > "$d/expected"; exit 0; fi
[ "$got" = "$(cat "$d/expected")" ] || { echo "the window readback differs from $d/expected"; printf '%s\n' "$got" | diff - "$d/expected" | head -8; exit 1; }
echo "macos window: ok"
