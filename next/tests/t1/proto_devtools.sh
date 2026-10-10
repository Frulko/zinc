#!/bin/sh
# The prototype toolchain (compiler/, runtime/, sim/; $ZINC is not used) builds and runs a program that imports zinc:devtools (ZN-637): in the sim, where the
# plugin's native side is cdp.sim.ts, and as a native macOS build (headless HAL, no window), where the scripted DevTools client of scripts/cdp-check.mjs reads
# the tree, a style and a screenshot and asks the Network domain, whose native side is the Spec member `net` (a stub in cdp.host.cpp: the network log is Zinc
# Next's). It also keeps lib/std/ui.ts, shared by both engines, inside what the prototype compiles. Skips (77) off macOS and without node, cmake or the
# prototype's node_modules (pnpm install at the root).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "macOS only"; exit 77; }
command -v node >/dev/null 2>&1 && command -v cmake >/dev/null 2>&1 || { echo "node or cmake missing"; exit 77; }
[ -d ../node_modules/@typescript ] || { echo "the prototype's node_modules are missing (pnpm install)"; exit 77; }
app=tests/golden/proto-devtools/main.tsx
tmp=$(mktemp -d); trap 'kill $pid 2>/dev/null; rm -rf "$tmp"' EXIT
ZINC_FRAMES=3 timeout 120 node ../compiler/bin/zinc.mjs run $app --target sim > "$tmp/sim.log" 2>&1 || { cat "$tmp/sim.log"; echo "the sim run failed"; exit 1; }
grep -qx "devtools app up" "$tmp/sim.log" || { cat "$tmp/sim.log"; echo "the sim run did not print its line"; exit 1; }
exe=$(timeout 600 node ../compiler/bin/zinc.mjs build $app --target macos --headless --print-exe 2> "$tmp/build.log") || { cat "$tmp/build.log"; echo "the macOS build failed"; exit 1; }
port=$(node -e 'const s = require("net").createServer().listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); })')   # a free port: 9229 may be a running inspector
ZINC_DEVTOOLS_PORT=$port ZINC_FRAMES=100000000 $exe > "$tmp/app.log" 2>&1 &
pid=$!
n=0; while [ $n -lt 200 ] && ! grep -q "zinc devtools:" "$tmp/app.log"; do sleep 0.05; n=$((n+1)); done   # the inspector listens
timeout 60 node ../scripts/cdp-check.mjs "$port" > "$tmp/check.log" 2>&1 || { cat "$tmp/check.log"; echo "the program:"; cat "$tmp/app.log"; exit 1; }
grep -qx "ok   Network.getResponseBody: {}" "$tmp/check.log" || { cat "$tmp/check.log"; echo "Network.getResponseBody is not the empty result of a host without a network log"; exit 1; }
[ -n "$PROTO_DEVTOOLS_KEEP" ] && cat "$tmp/sim.log" "$tmp/build.log" "$tmp/app.log" "$tmp/check.log"   # for a look at what ran
exit 0
