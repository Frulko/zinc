#!/bin/sh
# Real npm libraries on the web target (docs/targets/web-libraries.md): zustand, jotai, immer, date-fns, dayjs, lodash-es, zod, TanStack Query core, ky, axios, marked, Chart.js and three.js
# installed with `zinc install` (the project's package manager, first run only: they are kept in ~/.zinc/cache/web-libs), then used in `zinc export --target web` and `zinc dev --target web`
# in headless Chrome: each must work, and dev and export must give the same answers. Skipped (77) without Chrome, python3 or a network for the first install.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_libs: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_libs: no Chrome"; exit 77; }
out=$(timeout 280 python3 -I tools/web-libs-test "$Z" tests/fixtures/web-libs); rc=$?
[ $rc -eq 77 ] && { echo "web_libs: $out"; exit 77; }
[ $rc -eq 0 ] || { echo "web_libs: $out"; exit 1; }
exit 0
