#!/bin/sh
# The `rn` layout engine (ZN-283): src/host/layout_yoga.cpp maps every UiNode layout field to Yoga, returns rounded parent-relative boxes and frees all Yoga
# memory (heap equal after 1000 create/destroy cycles); the same test built with ASan and UBSan with Yoga's sources.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cmake --build build --target layout_yoga_test >"$tmp/build" 2>&1 || { echo "layout_yoga_test does not build: $(grep -m3 error "$tmp/build")"; exit 1; }
out=$(./build/layout_yoga_test 2>&1) || { echo "$out" | head -20; exit 1; }
c++ -std=c++20 -O1 -g -fsanitize=address,undefined -fno-sanitize-recover=undefined -Isrc -Ithird_party/yoga tests/native/layout_yoga_test.cpp src/host/layout_yoga.cpp src/host/text_wrap.cpp \
  $(find third_party/yoga/yoga -name '*.cpp') -o "$tmp/asan" 2>"$tmp/err" || { echo "sanitizer build fails: $(head -c 400 "$tmp/err")"; exit 1; }
out=$("$tmp/asan" 2>&1) || { echo "under ASan/UBSan: $(echo "$out" | head -20)"; exit 1; }
echo "layout yoga: ok"
