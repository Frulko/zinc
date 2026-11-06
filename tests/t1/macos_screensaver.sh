#!/bin/sh
# An open window lets the display sleep: SDL holds no "using SDL_DisableScreenSaver" assertion for an app, and a kiosk (ZINC_KIOSK=1) still holds one.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
launchctl managername 2>/dev/null | grep -q Aqua || { echo "skipped: no GUI session"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# held <kiosk 0|1>: prints 1 when the running app holds SDL's display assertion
held() {
  rm -rf "$tmp/app"; cp -R tests/golden/macos/translucent "$tmp/app"
  ( cd "$tmp/app" && env -u ZINC_DETERMINISTIC ZINC_BACKGROUND=1 ZINC_KIOSK="$1" "$ZINC" --background run main.tsx > "$tmp/out.log" 2>&1 ) &
  n=0; while [ ! -s "$tmp/app/window-number.txt" ] && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done
  [ -s "$tmp/app/window-number.txt" ] || { echo "the window never came up: $(cat "$tmp/out.log")" >&2; wait; echo x; return; }
  # only this app's assertion (SDL names it "<executable> using ..."), never another program's
  pmset -g assertions 2>/dev/null | grep -qE '\((translucent|Translucent Test)\).*using SDL_DisableScreenSaver' && echo 1 || echo 0
  wait
}
[ "$(held 0)" = 0 ] || { echo "a plain app keeps the display awake"; fail=1; }
[ "$(held 1)" = 1 ] || { echo "a kiosk lets the display sleep"; fail=1; }
[ $fail -eq 0 ] && echo "macos screensaver: ok"
exit $fail
