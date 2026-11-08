#!/bin/sh
# The command runner observes every child, propagates failures, and keeps stdout untouched; two callers at once (plugins building on
# several threads, ZN-1026) share one budget of compiler processes (ZINC_JOBS).
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
cat > "$t/test.cpp" <<'CPP'
#include "tc/tc.h"
#include <cassert>
#include <cstdlib>
#include <string>
#include <thread>
#include <vector>
int main() {
  assert(zn::tc::runCommands({}, 0, "test"));
  assert(zn::tc::runCommands({"sleep 0.2", "true"}, 2, "test"));
  assert(!zn::tc::runCommands({"exit 7"}, 1, "test"));
  assert(!zn::tc::runCommands({"kill -TERM $$", "sleep 0.1"}, 2, "test"));
  const std::string d = std::getenv("RUNNING");   // each command leaves its pid there while it runs and notes how many run
  const std::string c = "touch " + d + "/$$; ls " + d + " | grep -c . >> " + d + ".max; sleep 0.2; rm " + d + "/$$";
  const std::vector<std::string> cmds(4, c);
  std::thread other([&] { assert(zn::tc::runCommands(cmds, 4, "test")); });
  assert(zn::tc::runCommands(cmds, 4, "test"));
  other.join();
}
CPP
"${CXX:-c++}" -std=c++20 -Wall -Wextra -Werror -I src -I include "$t/test.cpp" src/tc/progress.cpp -o "$t/test" || exit 1
mkdir "$t/running"
export RUNNING="$t/running" ZINC_JOBS=2
ZINC_STEPS=1 "$t/test" > "$t/out" 2> "$t/log" || exit 1
[ ! -s "$t/out" ] && grep -q '2/2 completed' "$t/log" || { cat "$t/log"; exit 1; }
ZINC_STEPS=0 "$t/test" > "$t/out" 2> "$t/log" || exit 1
[ ! -s "$t/log" ] || { echo 'quiet command runner wrote progress'; exit 1; }
most=$(sort -n "$t/running.max" | tail -1)
[ "$most" -le 2 ] || { echo "two callers ran $most commands at once with ZINC_JOBS=2"; exit 1; }
