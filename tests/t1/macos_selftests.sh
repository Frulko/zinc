#!/bin/sh
# The macOS selftests of the system plugin (ZN-236): each of tests/golden/macos/{menu,dock,tray,shortcut,dialog,popup} runs its main.ts from a dev bundle in a
# temporary ZINC_HOME and its dump equals the golden's expected: the application menu (NSApp.mainMenu from the template of docs/reports/system-integration.md 4.3,
# an item reaches menu.onClick once, edit roles arrive as role:<name>), the dock, the tray, shortcuts, dialogs, and a context menu opened at its (x, y) in the window.
# ZN_UPDATE_GOLDEN=1 rewrites the expectations.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"; mkdir -p "$ZINC_HOME"
fail=0
for n in menu dock tray shortcut dialog popup; do
  d=tests/golden/macos/$n
  got=$(cd "$d" && env -u ZINC_DETERMINISTIC "$ZINC" run main.ts 2>&1)
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$ZINC_HOME/cache/macos/devapp/dev.zinc.test.$n.app" >/dev/null 2>&1
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then printf '%s\n' "$got" > "$d/expected"; continue; fi
  [ "$got" = "$(cat "$d/expected")" ] || { echo "macos $n: the output differs from $d/expected"; printf '%s\n' "$got" | diff - "$d/expected" | head -8; fail=1; }
  [ $n != menu ] || [ "$(printf '%s\n' "$got" | grep -c '^open clicked from app$')" = 1 ] || { echo "macos menu: the open item did not reach onClick exactly once"; fail=1; }
done
[ $fail -eq 0 ] && echo "macos selftests: ok"
exit $fail
