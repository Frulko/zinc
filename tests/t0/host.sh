#!/bin/sh
# Graphics host (ZN-027): tests/visual/clock.ts, run headless with the deterministic clock, draws frame 20 identical to the frozen pixel golden.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=20 ZINC_SHOT="$tmp/clock.png" ZINC_SHOT_FRAMES=20 "$ZINC" run ../tests/visual/clock.ts >/dev/null 2>"$tmp/err" \
  || { echo "clock.ts failed: $(head -c 300 "$tmp/err")"; exit 1; }
tools/pngdiff "$tmp/clock-20.png" corpus/ui/clock-20.png >/dev/null || { echo "frame 20 differs from corpus/ui/clock-20.png"; exit 1; }
# Host modules (ZN-049): zinc:fs and zinc:storage over the host calls, in a scratch directory.
(cd "$tmp" && ZINC_STORAGE="$tmp/store.kv" "$ZINC" run "$OLDPWD/tests/golden/host/modules.ts") >"$tmp/mod.out" 2>&1
diff -q "$tmp/mod.out" tests/golden/host/modules.out >/dev/null || { echo "host modules output differs: $(head -c 200 "$tmp/mod.out")"; exit 1; }
# zinc:process (ZN-050): a shell command, merged output, exit code.
"$ZINC" run tests/golden/host/process.ts 2>&1 | diff -q - tests/golden/host/process.out >/dev/null || { echo "zinc:process output differs"; exit 1; }
# zinc:events, zinc:platform and zinc:telemetry (ZN-080): written in Zinc; the telemetry lines equal the old runtime's (the expected file is the old simulator's output with ts zeroed and the platform renamed).
env -u ZINC_SIZE "$ZINC" run tests/golden/host/events.ts 2>&1 | diff -q - tests/golden/host/events.out >/dev/null || { echo "zinc:events or zinc:platform output differs"; exit 1; }
"$ZINC" run tests/golden/host/telemetry.ts 2>&1 | sed -E 's/"ts":[0-9.e+-]+/"ts":0/' | diff -q - tests/golden/host/telemetry.expected >/dev/null || { echo "zinc:telemetry lines differ from tests/golden/host/telemetry.expected"; exit 1; }
# zinc:gpio (ZN-081): the simulated pins and a ZINC_GPIO_SCRIPT; the output is the old simulator's.
ZINC_GPIO_SCRIPT="27:0@100,27:1@150,27:0@200" "$ZINC" run tests/golden/host/gpio.ts 2>&1 | diff -q - tests/golden/host/gpio.out >/dev/null || { echo "zinc:gpio output differs"; exit 1; }
