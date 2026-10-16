#!/bin/sh
# zinc:microphone (plugins/microphone) on the fake microphone: the plugin builds; a session (list, open, blocks with their frame index,
# sample hashes, levels, stereo, close, navigator.mediaDevices getUserMedia({ audio })) prints the frozen lines on the interpreter, on
# QuickJS, compiled ahead of time and outside a deterministic run with ZINC_FAKE_MICROPHONE=1; ZINC_FAKE_MICROPHONE=0 lists no fake
# microphone; requestPermission() answers at once in a background run (no system question); a project whose permissions lack "microphone"
# is refused when enforced. No real microphone is opened.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_HEADLESS=1 ZINC_BACKGROUND=1
want=$(cat tests/golden/host/microphone_session.out)
out=$("$ZINC" plugin-build microphone 2>&1) && echo "$out" | grep -q "^microphone \(built\|cached\) " || { echo "the microphone plugin does not build: $out"; exit 1; }
got=$(ZINC_DETERMINISTIC=1 timeout 60 "$ZINC" run tests/golden/host/microphone_session.ts 2>/dev/null)
[ "$got" = "$want" ] || { echo "the session differs on the interpreter: $(echo "$got" | diff tests/golden/host/microphone_session.out - | head -6)"; fail=1; }
got=$(ZINC_DETERMINISTIC=1 timeout 60 "$ZINC" run tests/golden/host/microphone_session.ts --engine quickjs 2>/dev/null)
[ "$got" = "$want" ] || { echo "the session differs on QuickJS: $(echo "$got" | diff tests/golden/host/microphone_session.out - | head -6)"; fail=1; }
"$ZINC" build tests/golden/host/microphone_session.ts -o "$tmp/aot" >/dev/null 2>&1 || { echo "the session does not build ahead of time"; fail=1; }
got=$(ZINC_DETERMINISTIC=1 timeout 60 "$tmp/aot" 2>/dev/null)
[ "$got" = "$want" ] || { echo "the session differs compiled: $(echo "$got" | diff tests/golden/host/microphone_session.out - | head -6)"; fail=1; }
got=$(env -u ZINC_DETERMINISTIC ZINC_FAKE_MICROPHONE=1 timeout 60 "$ZINC" run tests/golden/host/microphone_session.ts 2>/dev/null)
[ "$got" = "$want" ] || { echo "ZINC_FAKE_MICROPHONE=1 outside a deterministic run is not the same fake microphone: $(echo "$got" | head -3)"; fail=1; }
# ZINC_FAKE_MICROPHONE=0: the machine's microphones only (listed, never opened); requestPermission() in a background run never asks, so it
# answers at once whatever the privacy settings say
printf "import { devices, requestPermission } from 'zinc:microphone';\nrequestPermission().then((p) => console.log('asked ' + (p !== '')));\ndevices().then((l) => console.log('fake ' + l.filter((d) => d.name === 'Zinc Fake Microphone').length));\n" > "$tmp/none.ts"
got=$(ZINC_FAKE_MICROPHONE=0 timeout 20 "$ZINC" run "$tmp/none.ts" 2>/dev/null | sort | tr '\n' ' ')
[ "$got" = "asked true fake 0 " ] || { echo "ZINC_FAKE_MICROPHONE=0 in a background run: $got"; fail=1; }
# zinc.json permissions: without "microphone", devices() and open() are refused when enforced
mkdir -p "$tmp/denied" && printf '{ "name": "denied", "entry": "main.ts", "permissions": ["fs"] }\n' > "$tmp/denied/zinc.json"
printf "import { devices, Microphone } from 'zinc:microphone';\ndevices().then(() => console.log('listed')).catch((e: Error) => console.log(e.message));\nMicrophone.open('').then(() => console.log('opened')).catch((e: Error) => console.log(e.message));\n" > "$tmp/denied/main.ts"
out=$(cd "$tmp/denied" && ZINC_PERMISSIONS=enforce ZINC_DETERMINISTIC=1 timeout 60 "$ZINC" run . 2>&1)
[ "$(echo "$out" | grep -c 'needs the permission "microphone"')" = 2 ] || { echo "an undeclared microphone is not refused: $out"; fail=1; }
exit $fail
