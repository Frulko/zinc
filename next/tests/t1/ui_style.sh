#!/bin/sh
# Style conformance scenes (ZN-277, docs/reports/ui-style-system.md ST-28): every tests/golden/ui-style/<scene>.tsx renders to the frame hash in <scene>.hash (240x160, 3 frames, SW raster).
# UI_STYLE_BLESS=1 rewrites the hashes (review the change: a style task that touches defaults must leave them alone). The suite grows with each style task.
cd "$(dirname "$0")/../.." || exit 2
g=tests/golden/ui-style
fail=0; n=0
for f in $g/*.tsx; do
  s=$(basename "$f" .tsx); n=$((n+1))
  got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=240x160 ZINC_FRAMES=3 ZINC_FRAMEHASH=last "$ZINC" run "$f" 2>&1 >/dev/null | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p')
  [ -n "$got" ] || { echo "$s: no frame"; fail=1; continue; }
  if [ -n "$UI_STYLE_BLESS" ]; then echo "$got" > "$g/$s.hash"; continue; fi
  [ "$got" = "$(cat "$g/$s.hash" 2>/dev/null)" ] || { echo "$s: frame hash $got, golden '$(cat "$g/$s.hash" 2>/dev/null)'"; fail=1; }
done
[ $fail -eq 0 ] && echo "ui_style: $n scenes ok"
exit $fail
