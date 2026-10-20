#!/bin/sh
# `zinc test --profile X` (ZN-122): every program that has a golden for the profile is compared with the right one (<name>.out, .f32.out, .fx12.out, .1280x720.out, .1620x2160.out),
# the directives of the program decide what is skipped, and the listing says why.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
d="$tmp/conf"; mkdir -p "$d"
cat > "$d/sum.ts" <<'T'
console.log(0.1 + 0.2);
T
printf '0.30000000000000004\n' > "$d/sum.out"; printf '0.30000001192092896\n' > "$d/sum.f32.out"; printf '0.300048828125\n' > "$d/sum.fx12.out"
printf '0.30000000000000004\n' > "$d/sum.1280x720.out"; printf '0.30000000000000004\n' > "$d/sum.1620x2160.out"
cat > "$d/big.ts" <<'T'
// zinc-test: requires heap>=4M
console.log(1);
T
printf '1\n' > "$d/big.out"; printf '1\n' > "$d/big.f32.out"
cat > "$d/notps1.ts" <<'T'
// zinc-test: skip ps1
console.log(2);
T
printf '2\n' > "$d/notps1.out"; printf '2\n' > "$d/notps1.f32.out"; printf '2\n' > "$d/notps1.fx12.out"
cat > "$d/wide.ts" <<'T'
import { width, onFrame, quit } from 'zinc:gfx';
onFrame(() => { console.log(width()); quit(); });
T
printf '320\n' > "$d/wide.out"; printf '320\n' > "$d/wide.f32.out"; printf '1280\n' > "$d/wide.1280x720.out"
printf '3\n' > "$d/nogolden.out"; printf 'console.log(3);\n' > "$d/nogolden.ts"
fail=0
check() {   # profile pattern...
  p=$1; shift
  out=$("$ZINC" test --profile "$p" "$d" 2>&1)
  for pat in "$@"; do echo "$out" | grep -q -- "$pat" || { echo "zinc test --profile $p: missing '$pat' in:"; echo "$out"; fail=1; break; }; done
}
check macos "ok   sum.ts \[macos\] sum.out" "ok   wide.ts \[macos\] wide.out" "ok   big.ts \[macos\] big.out" "0 failure(s)"
check esp32 "ok   sum.ts \[esp32\] sum.f32.out" "skip big.ts (requires heap>=4M (esp32 has heap 160K))" "skip nogolden.ts (no golden nogolden.f32.out)" "ok   wide.ts \[esp32\] wide.f32.out" "0 failure(s)"
check ps1 "ok   sum.ts \[ps1\] sum.fx12.out" "skip notps1.ts (not for the ps1 profile)" "0 failure(s)"
check rpi1 "ok   sum.ts \[rpi1\] sum.1280x720.out" "ok   wide.ts \[rpi1\] wide.1280x720.out" "0 failure(s)"
check rmpp "ok   sum.ts \[rmpp\] sum.1620x2160.out" "0 failure(s)"
# a wrong golden fails and names the line
printf '9\n' > "$d/sum.out"
"$ZINC" test --profile macos "$d" 2>&1 | grep -q "FAIL sum.ts \[macos\]" || { echo "a wrong golden is not reported"; fail=1; }
"$ZINC" test --profile macos "$d" >/dev/null 2>&1 && { echo "zinc test exits 0 with a failure"; fail=1; }
exit $fail
