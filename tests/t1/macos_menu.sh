#!/bin/sh
# The native application menu (ZN-236, macOS only): the template of docs/reports/system-integration.md 4.3 becomes NSApp.mainMenu; the selftest dump equals tests/golden/macos/menu/expected,
# performing an item reaches menu.onClick once, edit roles arrive as role:<name> events. Runs from a dev bundle in a temporary ZINC_HOME. ZN_UPDATE_GOLDEN=1 rewrites the expectation.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"; mkdir -p "$ZINC_HOME"
d=tests/golden/macos/menu
got=$(cd "$d" && env -u ZINC_DETERMINISTIC "$ZINC" run main.ts 2>&1)
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$ZINC_HOME/cache/macos/devapp/dev.zinc.test.menu.app" >/dev/null 2>&1
if [ -n "$ZN_UPDATE_GOLDEN" ]; then printf '%s\n' "$got" > "$d/expected"; exit 0; fi
[ "$got" = "$(cat "$d/expected")" ] || { echo "the menu dump or the events differ from $d/expected"; printf '%s\n' "$got" | diff - "$d/expected" | head -8; exit 1; }
[ "$(printf '%s\n' "$got" | grep -c '^open clicked from app$')" = 1 ] || { echo "the open item did not reach onClick exactly once"; exit 1; }
echo "macos menu: ok"
