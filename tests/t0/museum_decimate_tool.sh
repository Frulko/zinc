#!/bin/sh
set -eu
cd "${ZINC_ROOT:-$(dirname "$0")/../..}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
c++ -O2 -std=c++17 -Wall -Wextra -Werror -I third_party/meshoptimizer examples/museum-table/tools/decimate.cpp third_party/meshoptimizer/allocator.cpp third_party/meshoptimizer/indexgenerator.cpp third_party/meshoptimizer/simplifier.cpp third_party/meshoptimizer/vcacheoptimizer.cpp third_party/meshoptimizer/vfetchoptimizer.cpp -o "$tmp/decimate"
c++ -O1 -std=c++17 -Wall -Wextra -Werror -isystem third_party/cgltf tests/native/decimate_glb_check.cpp -o "$tmp/check"
python3 tests/native/museum_decimate.py "$tmp/decimate" "$tmp/check"
