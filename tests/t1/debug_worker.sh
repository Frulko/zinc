#!/bin/sh
# zinc debug --cdp on a worker: tests/cdp_worker_check.mjs attaches to the worker of tests/data/worker_profile as Chrome attaches a page's
# workers (Target.setAutoAttach, a session per worker), stops at a breakpoint in its handler, steps into and over, reads its locals, evaluates
# in its frame, resumes, and the program runs to its end. Skips (77) without node.
cd "$(dirname "$0")/../.." || exit 2
command -v node >/dev/null 2>&1 || exit 77
out=$(timeout 90 node tests/cdp_worker_check.mjs "$ZINC" tests/data/worker_profile/main.ts 2>&1) || { echo "$out" | grep -v "^ok"; exit 1; }
