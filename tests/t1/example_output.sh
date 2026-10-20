#!/bin/sh
# Non-visual and board-simulating examples (ZN-152): their output equals the prototype's on a scripted session (tools/example-output: process/cli, native-module, sensor-hub over HTTP, zinc test of testing/),
# and the frames of iot-panel after scripted GPIO presses and of chataigne under its demo gestures equal the prototype's pixel for pixel (manifest rows iot-panel#press and chataigne#demo).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tools/example-output || fail=1
tools/proto-capture compare "iot-panel/src/main.tsx#press" "chataigne/src/main.tsx#demo" >/tmp/zn-152-pc.$$ 2>&1 || { cat /tmp/zn-152-pc.$$; fail=1; }
rm -f /tmp/zn-152-pc.$$
exit $fail
