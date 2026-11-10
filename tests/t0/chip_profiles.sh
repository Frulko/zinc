#!/bin/sh
# CHIP rows, generated platform constants and named project requirement failures.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}
export ZINC_ROOT=${ZINC_ROOT:-$PWD} ZINC_HEADLESS=1 ZINC_BACKGROUND=1
unset ZINC_SIZE
PATH="$PWD/tools/compat:$PATH"
export PATH
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
python3 - <<'PY' || exit 1
import json
from pathlib import Path
rows = json.loads(Path('targets/capabilities.json').read_text())
for name in ('chip', 'pocketchip'):
    row = rows[name]
    for key, value in dict(tier='T2', gpu='gles2', gpio=True, power=True, dynlib=False).items():
        assert row[key] == value, (name, key, row[key])
    for key in ('touch', 'keyboard', 'pointer'):
        expected = 'optional' if name == 'chip' else key != 'pointer'
        assert row[key] == expected, (name, key, row[key])
    assert row['ui'] == dict(layout='classic', rn=True)
    assert row['assets'] == dict(texture='etc1|rgba4444|rgba5551|rgb565|rgba8', maxSize=2048, pot=False,
                                 audio='vorbis', sfx='qoa', pack='lz4',
                                 budgets=dict(ram='150MB', gpu='40MB', boot='4MB'))
    assert row['modules'] == ['zinc:gfx', 'zinc:gl']
PY
cat > "$tmp/platform.ts" <<'TS'
import { PROFILE, NUMBERS, HEAP_BYTES, TOUCH, KEYBOARD, POINTER, GPIO, POWER, DYNLIB, GPU_API, TIER } from 'zinc:platform';
console.log(PROFILE + ' ' + NUMBERS + ' ' + HEAP_BYTES);
console.log(TOUCH + ' ' + KEYBOARD + ' ' + POINTER + ' ' + GPIO + ' ' + POWER + ' ' + DYNLIB + ' ' + GPU_API + ' ' + TIER);
const n: number = 16777216;
console.log(n + 1);
TS
for row in 'chip true' 'pocketchip false'; do
  set -- $row
  timeout 5 "$Z" check --profile "$1" "$tmp/platform.ts" >"$tmp/check" 2>&1 || { cat "$tmp/check"; fail=1; }
  got=$(timeout 5 "$Z" run --interp --profile "$1" "$tmp/platform.ts" 2>&1 | tr '\n' ' ')
  expected="$1 f64 134217728 true true $2 true true false gles2 2 16777217 "
  [ "$got" = "$expected" ] || { echo "--profile $1: wanted '$expected', got '$got'"; fail=1; }
done
printf 'console.log("hi");\n' > "$tmp/main.ts"
for row in 'chip 720 576' 'pocketchip 480 272'; do
  set -- $row
  profile=$1
  printf '{"name":"chip-test","entry":"main.ts","requires":["gpio","power","tier=T2","gpu=gles2","numbers=f64","heap>=128M","touch","keyboard","width=%s","height=%s"]}\n' "$2" "$3" > "$tmp/zinc.json"
  timeout 5 "$Z" check --profile "$profile" "$tmp" >"$tmp/check" 2>&1 || { cat "$tmp/check"; fail=1; }
  for need in dynlib 'gpu>=gles3' pointer; do
    [ "$profile:$need" = chip:pointer ] && continue
    printf '{"name":"chip-test","entry":"main.ts","requires":["%s"]}\n' "$need" > "$tmp/zinc.json"
    if timeout 5 "$Z" check --profile "$profile" "$tmp" >"$tmp/check" 2>&1; then
      echo "--profile $profile accepted requires $need"; fail=1
    fi
    grep -F "requires $need ($profile has " "$tmp/check" >/dev/null || { cat "$tmp/check"; fail=1; }
  done
done
[ "$fail" -eq 0 ] && echo 'chip profiles: ok'
exit "$fail"
