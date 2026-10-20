#!/bin/sh
# A tampered plugin library in the cache is refused, never loaded (ZN-112): the digest recorded at build time must match.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null && command -v ar >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
"$ZINC" plugin-build socket >"$tmp/o" 2>&1 || { echo "socket does not build: $(head -c 300 "$tmp/o")"; exit 1; }
lib=$(ls "$ZINC_HOME"/cache/*/plugins/socket-*/plugin.* | grep -v '\.a$\|sha256' | head -1)
[ -f "$(dirname "$lib")/plugin.sha256" ] || { echo "no digest recorded beside the library"; exit 1; }
"$ZINC" plugin-build socket 2>&1 | grep -q "^socket cached " || { echo "an untouched entry is not served from the cache"; exit 1; }
printf 'tampered' >> "$lib"
out=$("$ZINC" plugin-build socket 2>&1) && { echo "a tampered library is accepted: $out"; exit 1; }
echo "$out" | grep -q "refused" || { echo "the refusal is not explained: $out"; exit 1; }
