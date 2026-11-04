#!/bin/sh
# The existing scroll oracle through the pluggable display driver, including its retained texture.
export ZINC_SCROLL_DISPLAY=gl
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp tests/data/scroll_header/main.tsx "$tmp/main.tsx" || exit 1
printf '%s\n' '{"name":"opaque-scroll","entry":"main.tsx","plugins":{"display-gl":{"key":-1}},"targets":{"macos":{"width":420,"height":640},"linux":{"width":420,"height":640}}}' > "$tmp/zinc.json"
export ZINC_SCROLL_EXTRA="$tmp:b"
tests/t1/gl_scroll.sh
