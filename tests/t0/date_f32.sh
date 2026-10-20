#!/bin/sh
# Date under a profile whose `number` is 32 bits (psp, ps2; ZN-759): its constructor takes f64, so a time keeps its milliseconds (an f32 holds
# 1.79e12 ms to 131072 ms) and `new Date()` does not test its month argument in f32 (the PS2's FPU has no NaN: every date was NaN there).
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'EOF'
const t: f64 = 1792266993123;
const d = new Date(t);
console.log(`${d.getUTCFullYear()} ${d.getUTCHours()}:${d.getUTCMinutes()}:${d.getUTCSeconds()}.${d.getUTCMilliseconds()} ${new Date(2026, 9, 17, 12, 30).getMonth()}`);
EOF
got=$(cd "$tmp" && ZINC_DETERMINISTIC=1 "$Z" run --profile psp --interp main.ts 2>&1 | grep -v '^  \|^zinc')
[ "$got" = "2026 19:56:33.123 9" ] || { echo "date f32: $got"; exit 1; }
echo "date f32: ok"
