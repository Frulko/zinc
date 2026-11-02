#!/bin/sh
# ZINC_DETERMINISTIC freezes the clock; ZINC_CLOCK_TICK=<ms> moves it by that much at each performance.now() read (the same on every run and engine),
# so a time-sliced job meets its deadline inside one frame: interpreter, QuickJS and the compiled build.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
f=tests/data/clock_tick/main.ts
fail=0
want_frozen=$(printf 'equal true\nslice reads never')
want_tick=$(printf 'equal false\nslice reads 5')
chk() { [ "$2" = "$3" ] || { echo "clock_tick ($1): got '$2'"; fail=1; }; }
chk interp-frozen "$(ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$ZINC" run $f --interp 2>&1)" "$want_frozen"
chk interp-tick "$(ZINC_CLOCK_TICK=0.5 ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$ZINC" run $f --interp 2>&1)" "$want_tick"
chk quickjs-frozen "$(ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$ZINC" run $f --engine quickjs 2>&1)" "$want_frozen"
chk quickjs-tick "$(ZINC_CLOCK_TICK=0.5 ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$ZINC" run $f --engine quickjs 2>&1)" "$want_tick"
timeout 300 "$ZINC" build $f -o "$t/app" >/dev/null 2>&1 || { echo "clock_tick: build failed"; exit 1; }
chk aot-frozen "$(ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$t/app" 2>&1)" "$want_frozen"
chk aot-tick "$(ZINC_CLOCK_TICK=0.5 ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$t/app" 2>&1)" "$want_tick"
[ $fail = 0 ] && echo "clock_tick: ok"
exit $fail
