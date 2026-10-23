#!/bin/sh
# Native Mac/Linux fixture of the actual driver; no cross compilation, window or device.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
link=
[ "$(uname -s)" != Linux ] || link='-pthread -ldl'
python3 - "$tmp/gfx_display_actions.h" <<'PY'
from pathlib import Path
import sys
source = Path('runtime/gfx.cpp').read_text()
start = source.index('void escapeByApp(bool on)')
end = source.index('\n}\n}  // namespace zrt', start)
Path(sys.argv[1]).write_text(source[start:end])
PY
c++ -std=c++17 -w -I"$tmp" -Itests/native/stubs -Iruntime/include -Iplugins/display-fbdev tests/native/fbdev_desktop.cpp -o "$tmp/desktop" $link
c++ -std=c++17 -w -Itests/native -Itests/native/stubs -Iruntime/include -Iplugins/display-fbdev tests/native/chip_fbdev.cpp -o "$tmp/chip" $link
"$tmp/desktop" "$tmp"
"$tmp/chip" tests/golden/sim/fbdev.ppm "$tmp"
