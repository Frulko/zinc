#!/bin/sh
# zinc.json "3d" (docs/plugins/3d.md "Large static worlds"): defaults3D()'s fields for every machine, then under a profile's name, read by the
# program on the interpreter, the AOT and QuickJS, and compiled into a console's pack; a field it does not know is an error that names them.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/p/src"
cat > "$tmp/p/zinc.json" <<'JSON'
{ "name": "cfg", "entry": "src/main.ts",
  "3d": { "budget": 300000, "midReach": 2500, "psp": { "budget": 30000, "sectors": false }, "desktop": { "fps": 30 } } }
JSON
cat > "$tmp/p/src/main.ts" <<'TS'
import { defaults3D } from 'zinc:3d';
const d = defaults3D('macos'), p = defaults3D('psp'), v = defaults3D('vita');
console.log(`desktop ${d.budget} ${d.midReach} ${d.fps} psp ${p.budget} ${p.midReach} ${p.sectors} ${p.fps} vita ${v.budget} ${v.midReach}`);
TS
want='desktop 300000 2500 30 psp 30000 2500 false 30 vita 300000 2500'
fail=0
for engine in --interp --native quickjs; do
  if [ $engine = quickjs ]; then got=$(ZINC_HEADLESS=1 ZINC_FRAMES=1 "$ZINC" run "$tmp/p" --engine quickjs 2>&1)
  else got=$(env -u ZINC_DETERMINISTIC ZINC_STEPS=1 ZINC_HEADLESS=1 ZINC_FRAMES=1 "$ZINC" run $engine "$tmp/p" 2>&1); fi
  case $engine in --native) printf '%s' "$got" | grep -q 'run        native' || { echo "zinc3d_config: --native did not run compiled: $(printf '%s' "$got" | grep -m1 -i fail)"; fail=1; } ;; esac
  got=$(printf '%s\n' "$got" | grep '^desktop')
  [ "$got" = "$want" ] || { echo "zinc3d_config: $engine: '$got', want '$want'"; fail=1; }
done
(cd "$tmp/p" && "$ZINC" pack --profile psp . -o "$tmp/psp.zapp" >"$tmp/pack.log" 2>&1) || { echo "zinc3d_config: pack: $(tail -2 "$tmp/pack.log")"; fail=1; }
tar -xf "$tmp/psp.zapp" -C "$tmp" program.zbc 2>/dev/null && grep -q 30000 "$tmp/program.zbc" || { echo "zinc3d_config: the psp pack does not carry the overrides"; fail=1; }
sed -i.bak 's/"fps": 30/"frames": 30/' "$tmp/p/zinc.json"
err=$(ZINC_HEADLESS=1 ZINC_FRAMES=1 "$ZINC" run "$tmp/p" 2>&1)
case $err in *'3d.desktop.frames is not a field of defaults3D()'*) ;; *) echo "zinc3d_config: an unknown field: $(printf '%s' "$err" | tail -2)"; fail=1 ;; esac
[ $fail -eq 0 ] && echo "zinc3d_config: ok"
exit $fail
