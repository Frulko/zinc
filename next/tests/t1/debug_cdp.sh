#!/bin/sh
# zinc debug --cdp (ZN-371.04): tests/cdp_debug_check.mjs plays Chrome DevTools' Sources panel: discovery, the program's scripts and their text,
# a breakpoint by URL, Debugger.paused with the stack, locals through Runtime.getProperties (a Point and an array unfolded), evaluateOnCallFrame,
# step into, over and out, resume to the end; Debugger.pause stops a running loop. Skips (77) without node.
cd "$(dirname "$0")/../.." || exit 2
command -v node >/dev/null 2>&1 || exit 77
out=$(timeout 90 node tests/cdp_debug_check.mjs "$ZINC" tests/data/debug_cli/main.ts --pause tests/data/debug_cli/loop.ts 2>&1) || { echo "$out" | grep -v "^ok"; exit 1; }
