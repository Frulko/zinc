#!/bin/sh
# The device shell's boundary and event-driven sizing, without a browser or app.
cd "$(dirname "$0")/../.." || exit 2
node tests/data/web_frame.mjs
