#!/bin/sh
# Zinc Relay's decisions (examples/notify-relay/tests/unit.ts, ZN-757): the sender's image found in a record's property list and its rank,
# the monogram (initials, gradient, a 128 px PNG drawn by AppKit), the site of web notifications, the filters with the Focus policies, the
# Focus files. Made-up data; macOS only (the plist parser and the drawing are the system's).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "macOS only"; exit 77; }
out=$(timeout 240 "$ZINC" run examples/notify-relay/tests/unit.ts 2>&1)
echo "$out" | grep -q "^unit ok$" || { echo "$out" | grep -v "^  " | tail -20; exit 1; }
