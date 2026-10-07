#!/bin/sh
# Yoga 3.2.1 is vendored and builds as zn_yoga (ZN-280): a two-node row gets the expected boxes with shrink 1 (web) and 0 (React Native).
cd "$(dirname "$0")/../.." || exit 2
[ -x build/yoga_test ] || { echo "build/yoga_test is missing (cmake --build build --target yoga_test)"; exit 1; }
build/yoga_test 2>&1 | grep -q '^yoga ok$' || { echo "yoga_test: $(build/yoga_test 2>&1 | head -c 400)"; exit 1; }
