#!/bin/sh
# Khronos WebGL conformance (ZN-203.04): the pages listed in tests/golden/webgl/conformance-pass.txt must keep passing on the QuickJS engine (tools/webgl-conformance); the failures and their first reasons are in conformance-failures.txt.
cd "$(dirname "$0")/../.." || exit 2
out=$(tools/webgl-conformance) || { echo "$out" | grep -E 'REGRESSION|conformance:'; exit 1; }
echo "$out" | tail -1
