#!/bin/sh
# Scroll restoration (scrollKey): tests/golden/ui-scroll-key on the interpreter and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
for g in ui-scroll-key; do
  for engine in --interp quickjs; do
    if [ "$engine" = quickjs ]; then set -- --engine quickjs; else set -- --interp; fi
    ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x300 ZINC_FRAMES=40 timeout 60 "$ZINC" run "tests/golden/$g" "$@" 2>/dev/null | diff - "tests/golden/$g/main.out" \
      || { echo "$g ($engine): differs from main.out"; exit 1; }
  done
done
echo "ui_scroll_key: ok"
