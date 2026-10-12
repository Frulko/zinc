#!/bin/sh
# The command runner observes every child, propagates failures, and keeps stdout untouched.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
cat > "$t/test.cpp" <<'CPP'
#include "tc/tc.h"
#include <cassert>
int main() {
  assert(zn::tc::runCommands({}, 0, "test"));
  assert(zn::tc::runCommands({"sleep 0.2", "true"}, 2, "test"));
  assert(!zn::tc::runCommands({"exit 7"}, 1, "test"));
  assert(!zn::tc::runCommands({"kill -TERM $$", "sleep 0.1"}, 2, "test"));
}
CPP
"${CXX:-c++}" -std=c++20 -Wall -Wextra -Werror -I src -I include "$t/test.cpp" src/tc/progress.cpp -o "$t/test" || exit 1
ZINC_STEPS=1 "$t/test" > "$t/out" 2> "$t/log" || exit 1
[ ! -s "$t/out" ] && grep -q '2/2 completed' "$t/log" || { cat "$t/log"; exit 1; }
ZINC_STEPS=0 "$t/test" > "$t/out" 2> "$t/log" || exit 1
[ ! -s "$t/log" ] || { echo 'quiet command runner wrote progress'; exit 1; }
