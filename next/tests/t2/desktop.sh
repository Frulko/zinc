#!/bin/sh
# The real macOS desktop features (ZN-248): every macOS selftest of the system plugin in one place (application menu, dock, tray, window, shortcuts, dialogs, power, deep links, bundles), each driving a real
# NSApplication in a dev bundle and comparing what AppKit reports with its golden. Skips cleanly without a GUI session. Optional: with Accessibility trust (tccutil / System Settings) a System Events check
# of the menu bar could be added; it is not required and not run.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
launchctl managername 2>/dev/null | grep -q Aqua || { echo "skipped: no GUI session (launchctl managername is not Aqua)"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
root=$PWD
fail=0
for t in macos_bundle macos_menu macos_dock macos_tray macos_window macos_shortcut macos_dialog macos_power macos_deeplink; do
  out=$("$root/tests/run" --tier t1 --only "$t" 2>&1)
  case "$out" in *"1 passed, 0 failed"*) ;; *"skipped"*) ;; *) echo "$t: $(printf '%s' "$out" | tail -4)"; fail=1 ;; esac
done
# the selftest dump of a running app, with a screenshot reference of its menu bar and dock-less tray item (kept in tests/golden/macos/tray/statusitem.png)
[ -s tests/golden/macos/tray/statusitem.png ] || { echo "the tray reference screenshot is missing"; fail=1; }
[ $fail -eq 0 ] && echo "desktop: ok"
exit $fail
