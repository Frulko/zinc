#!/bin/sh
# The handheld profiles (ZN-453): psp (f32, 480x272, 16 MiB), vita (f64, 960x544, 192 MiB), n3ds (f64, 400x240, 16 MiB) and ios-legacy (f64, 480x320,
# 96 MiB) are found by --profile, give zinc:platform their numbers and heap, and their targets/capabilities.json rows answer `requires`.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
printf "import { PROFILE, NUMBERS, HEAP_BYTES } from 'zinc:platform';\nconsole.log(PROFILE + ' ' + NUMBERS + ' ' + HEAP_BYTES);\nconst a: number = 16777216;\nconsole.log(a + 1);\n" > "$tmp/p.ts"
for row in "psp f32 16777216 16777216" "vita f64 201326592 16777217" "n3ds f64 16777216 16777217" "ios-legacy f64 100663296 16777217"; do
  set -- $row
  got=$("$Z" run --profile "$1" "$tmp/p.ts" 2>&1 | tr '\n' ' ')
  [ "$got" = "$1 $2 $3 $4 " ] || { echo "--profile $1: wanted '$1 $2 $3 $4', got '$got'"; fail=1; }   # f32: 2^24 + 1 rounds to 2^24
done
printf 'console.log("hi");\n' > "$tmp/main.ts"
need() {   # need <profile> <requires> <ok|refused>
  printf '{"name": "hh", "entry": "main.ts", "requires": ["%s"]}\n' "$2" > "$tmp/zinc.json"
  if "$Z" check --profile "$1" "$tmp" >/dev/null 2>&1; then got=ok; else got=refused; fi
  [ "$got" = "$3" ] || { echo "--profile $1, requires $2: $got, wanted $3"; fail=1; }
}
need psp gamepad ok; need psp touch refused; need psp threads refused; need psp "gpu=ge" ok; need psp "width>=480" ok
need vita touch ok; need vita threads ok; need vita "height>=544" ok
need n3ds touch ok; need n3ds "width>=480" refused
need ios-legacy touch ok; need ios-legacy gamepad refused; need ios-legacy "gpu=gles2" ok
[ $fail -eq 0 ] && echo "handheld profiles: ok"
exit $fail
