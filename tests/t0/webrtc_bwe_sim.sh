#!/bin/sh
# zinc:webrtc's video rate control (plugins/webrtc/native/bwe.cpp) on a simulated link, in simulated time (tests/data/webrtc_bwe/sim.cpp):
# the NACK list and packet, then a sender on a 2 Mbit/s link that drops to 300 kbit/s for 10 s: under the cap within 2 s, back to full rate
# within 10 s after, through the ladder's rungs (720p30, 360p30, 360p15 and back). No network, no clock, no engine: the same numbers every run.
cd "$(dirname "$0")/../.." || exit 2
CXX=${CXX:-c++}
command -v "$CXX" >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$CXX" -std=c++17 -O1 -Wall -Werror -o "$tmp/sim" tests/data/webrtc_bwe/sim.cpp plugins/webrtc/native/bwe.cpp || { echo "webrtc_bwe: does not compile"; exit 1; }
"$tmp/sim"
