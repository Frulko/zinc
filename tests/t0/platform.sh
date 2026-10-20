#!/bin/sh
# src/platform (docs/reports/zinc-windows-port.md): the OS calls of the command line behind one header. platform_test checks the Windows argument
# quoting, our fnmatch against the C library's, spawn / wait / stop / capture with a child-only environment, file stamps and the library loader.
# The same test cross-built for Windows (cmake/zig-windows.cmake) runs under Wine or on Windows: docs/targets/windows.md.
cd "$(dirname "$0")/../.." || exit 2
BUILD=$(dirname "$ZINC")
[ -x "$BUILD/platform_test" ] || { echo "skipped: platform_test is not built (tools/build platform_test)"; exit 77; }
"$BUILD/platform_test"
