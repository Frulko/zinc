#!/bin/sh
# SDL's optional macOS 11 framework must not prevent the Catalina window host from loading.
set -eu
[ "$(uname -s)" = Darwin ] || exit 77
Z=${ZINC:-build/zinc}
window=$(dirname "$Z")/libzn_window.dylib
[ -f "$window" ] || { echo 'macos_frameworks: no window module beside zinc'; exit 77; }
python3 - "$Z" "$window" <<'PY'
import pathlib, re, subprocess, sys
commands = subprocess.check_output(['otool', '-l', sys.argv[2]], text=True)
loads = [b for b in re.split(r'Load command \d+\n', commands) if '/UniformTypeIdentifiers.framework/' in b]
assert loads and all('cmd LC_LOAD_WEAK_DYLIB\n' in b for b in loads), 'window host requires the macOS 11-only framework'
assert b'-weak_framework UniformTypeIdentifiers' in pathlib.Path(sys.argv[1]).read_bytes(), 'AOT framework flags require the macOS 11-only framework'
print('macos_frameworks: window module and AOT flags keep UniformTypeIdentifiers optional')
PY
