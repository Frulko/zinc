#!/bin/sh
# The native application menu (ZN-236, macOS only): the template of docs/reports/system-integration.md 4.3 becomes NSApp.mainMenu; the selftest dump equals tests/golden/macos/dock/expected,
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"; mkdir -p "$ZINC_HOME"
d=tests/golden/macos/dock
got=$(cd "$d" && env -u ZINC_DETERMINISTIC "$ZINC" run main.ts 2>&1)
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$ZINC_HOME/cache/macos/devapp/dev.zinc.test.dock.app" >/dev/null 2>&1
if [ -n "$ZN_UPDATE_GOLDEN" ]; then printf '%s\n' "$got" > "$d/expected"; exit 0; fi
[ "$got" = "$(cat "$d/expected")" ] || { echo "the dock output differs from $d/expected"; printf '%s\n' "$got" | diff - "$d/expected" | head -8; exit 1; }
echo "macos dock: ok"
