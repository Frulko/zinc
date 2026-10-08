#!/bin/sh
# Scenario runner (ZN-295): steps parse, run against a scripted device, failures name the step and the virtual time (tests/native/scenario_test.cpp).
cd "$(dirname "$0")/../.." || exit 2
[ -x build/scenario_test ] || { echo "build/scenario_test is not built (cmake --build build --target scenario_test)"; exit 1; }
build/scenario_test | tail -1 | grep -q "^scenario: ok" || { build/scenario_test; exit 1; }
echo "scenario: ok"
