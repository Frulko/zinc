#!/bin/sh
# The simulator core (ZN-292): tests/native/sim_test.cpp (event order, 1 h of a 1 ms timer in under a second, nets and levels, trace round trip), and the core names no target, board or plugin.
cd "$(dirname "$0")/../.." || exit 2
[ -x build/sim_test ] || { echo "build/sim_test is not built (cmake --build build --target sim_test)"; exit 1; }
build/sim_test | tail -1 | grep -q "sim core: ok" || { build/sim_test; exit 1; }
if grep -n -i -E "esp32|esp-idf|rmpp|remarkable|macos|linux|ps1|ps2|arduino|qemu|display-|plugins/" src/sim/*.cpp src/sim/*.h include/zn/sim.h; then echo "src/sim names a target or a plugin"; exit 1; fi
