#!/bin/sh
# Actual sd-bus codec/requests/lifecycle behind an in-process ABI table. No daemon, network or radio.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
c++ -Iruntime/include -std=c++20 -Wall -Wextra -Werror tests/native/radios/network_manager.cpp -o "$tmp/network-manager"
timeout 5 "$tmp/network-manager"
cc -c third_party/yyjson/yyjson.c -o "$tmp/yyjson.o"
c++ -std=c++20 -Wall -Wextra -Werror -Isrc -Ithird_party/yyjson tests/native/radios/project.cpp src/frontend/project.cpp "$tmp/yyjson.o" -o "$tmp/project"
timeout 5 "$tmp/project"
"$ZINC" native-gen plugins/wifi/native/wifi.spec.ts "$tmp" > "$tmp/native-gen.log" 2>&1
c++ -std=c++20 -O0 -Wall -Wextra -Werror -Wno-unused-variable -pthread \
  -DZN_NO_MIMALLOC -DZRT_HOSTED_CPP -I"$tmp" -Iruntime -Iruntime/include -Iinclude \
  tests/native/radios/permission.cpp runtime/zrt.cpp runtime/host.cpp \
  targets/null/hal_null.cpp targets/common/hal_posix.cpp -o "$tmp/permission"
timeout 5 "$tmp/permission"

python3 tests/native/radios/public-fixture.py "$tmp/public"
ZINC_HEADLESS=1 timeout 5 "$ZINC" run --interp "$tmp/public/reentrant.ts"
