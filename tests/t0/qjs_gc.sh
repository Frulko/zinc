#!/bin/sh
# Functional GC scheduling/profile proof, never a latency or throughput gate.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
${CXX:-c++} -std=c++20 -Wall -Wextra -Werror -Isrc -Iinclude -Ithird_party/quickjs-ng tests/data/qjs_gc/policy.cpp -o "$tmp/policy"
"$tmp/policy"
tools/quickjs-patches check
python3 tests/data/qjs_gc/check.py
