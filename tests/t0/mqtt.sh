#!/bin/sh
# zinc:mqtt (ZN-086) against a local broker: mosquitto when installed, else tests/mqtt_broker.py; 77 (skip) when neither runs.
ZINC=${ZINC:-build/zinc}
port=18831
if command -v mosquitto >/dev/null 2>&1; then
  conf=$(mktemp); printf 'listener %s 127.0.0.1\nallow_anonymous true\n' "$port" >"$conf"
  mosquitto -c "$conf" >/dev/null 2>&1 & bpid=$!; sleep 1
else
  command -v python3 >/dev/null 2>&1 || exit 77
  python3 tests/mqtt_broker.py "$port" >/dev/null 2>&1 & bpid=$!; sleep 1
fi
out=$("$ZINC" run tests/golden/host/mqtt.ts -- "$port" 2>&1)
kill "$bpid" 2>/dev/null; wait "$bpid" 2>/dev/null; rm -f "$conf"
printf '%s\n' "$out" | diff -u tests/golden/host/mqtt.out - || { echo "zinc:mqtt output differs"; exit 1; }
