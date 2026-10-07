#!/bin/sh
# The plugins' native sources run unchanged behind the native-module ABI (ZN-099): sqlite, process and socket through the C++ driver (callbacks included),
# and the sqlite conformance program, linked with the plugin (ZINC_NATIVE_LIBS), prints the frozen output.
cd "$(dirname "$0")/../.." || exit 2
b=$(dirname "$ZINC")
[ -x "$b/native_plugins_test" ] && [ -f "$b/libzn_plugin_sqlite.a" ] || { echo "skipped: the plugin libraries are not built (needs the host library)"; exit 77; }
fail=0
"$b/native_plugins_test" | grep -q "all checks passed" || { "$b/native_plugins_test"; fail=1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_NATIVE_LIBS="Sqlite=$b/libzn_plugin_sqlite.a" "$ZINC" build ../tests/conformance/sqlite.ts -o "$tmp/sq" >"$tmp/build.log" 2>&1 || { echo "sqlite.ts does not build with the native plugin: $(head -c 300 "$tmp/build.log")"; exit 1; }
"$tmp/sq" 2>&1 | diff -q - ../tests/conformance/sqlite.out >/dev/null || { echo "sqlite.ts differs from its frozen output with the native plugin"; fail=1; }
exit $fail
