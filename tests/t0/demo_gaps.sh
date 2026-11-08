#!/bin/sh
# Gaps the demos found (ZN-1038), on the interpreter and QuickJS: a helper handed the children, a call handed a render function and a class field
# that holds a component mount their nodes (they printed a number, the content vanished); a `w-full max-w-[440px]` child of an `items-center`
# parent is centred; the webcam demo's order of photos taken in one second; ZINC_NATIVE=sim gives QuickJS a plugin's stand-in (the fake
# camera), not the native library.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
want='mounted inside=y wrapped=y field=y
card x 180
newest photo-2026-10-16-153012-2 photo-2026-10-16-153012 photo-2026-10-16-153011'
fail=0
for engine in --interp "--engine quickjs"; do
  got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=800x600 ZINC_SCALE=1 ZINC_FRAMES=4 "$ZINC" run tests/data/demo-gaps/main.tsx $engine 2>&1 | grep -E '^(mounted|card|newest) ')
  [ "$got" = "$want" ] || { echo "demo_gaps $engine: got"; echo "$got"; fail=1; }
done
cat > "$tmp/cam.ts" <<'P'
import { devices, CameraDevice } from 'zinc:camera';
devices().then((d: CameraDevice[]) => { console.log('cams ' + d.map((c: CameraDevice): string => c.name).join(',')); });
P
got=$(ZINC_NATIVE=sim ZINC_HEADLESS=1 "$ZINC" run "$tmp/cam.ts" --engine quickjs 2>&1 | grep '^cams ')
[ "$got" = "cams Zinc Fake Camera" ] || { echo "demo_gaps: QuickJS under ZINC_NATIVE=sim: got '$got'"; fail=1; }
exit $fail
