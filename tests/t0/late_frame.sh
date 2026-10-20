#!/bin/sh
# The event loop enters the frame loop when a program asks for frames after it started (onFrame or render from a timer, a menu click):
# Zinc Relay opens its settings window from the menu bar this way (ZN-757). Before, the loop kept turning timers and never drew.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 ZINC_FRAMES=30 timeout 60 "$ZINC" run tests/data/late_frame.ts 2>&1)
want='drawing from now
frame 3
timer during frames'
[ "$out" = "$want" ] || { echo "late frames: got '$out'"; exit 1; }
