#!/bin/sh
# zinc lint (src/lint/lint.cpp): tests/golden/lint/rules fires every rule once on esp32 (a PNG, a JPEG and a WebP read for their sizes, a boot group, an unused dependency) (rules.expect, exit 1 for its errors, valid --json),
# the --all-targets matrix of examples/hero and of a small ESP32 program (hero.matrix, esp32-app.matrix: ok, warns, refuses and why),
# --rules lists the registry, and the source rules are gone once zinc migrate has run. UPDATE=1 rewrites the goldens.
cd "$(dirname "$0")/../.." || exit 2
fail=0
g=tests/golden/lint
here=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
check() {   # name, file with the output
  if [ -n "$UPDATE" ]; then cp "$2" "$g/$1"; return; fi
  cmp -s "$2" "$g/$1" || { echo "$1 differs:"; diff "$g/$1" "$2" | head -20; fail=1; }
}
(cd $g/rules && "$ZINC" lint >"$tmp/rules.out" 2>"$tmp/rules.err"; echo $? >"$tmp/rules.code")
[ "$(cat "$tmp/rules.code")" = 1 ] || { echo "rules: exit $(cat "$tmp/rules.code"), not 1: $(cat "$tmp/rules.err")"; fail=1; }
check rules.expect "$tmp/rules.out"
grep -q "^zinc lint: 7 errors, 13 warnings (esp32)" "$tmp/rules.err" || { echo "rules summary: $(cat "$tmp/rules.err")"; fail=1; }
for r in $("$ZINC" lint --rules | cut -d' ' -f1); do
  [ "$r" = quickjs ] && continue   # a JavaScript program's rule: tests/t0/check_js.sh
  grep -q " $r[ :]" "$tmp/rules.out" || { echo "rule $r has no finding in the fixture"; fail=1; }
done
[ "$("$ZINC" lint --rules | wc -l | tr -d ' ')" = 17 ] || { echo "--rules does not list 17 rules"; fail=1; }
(cd $g/rules && "$ZINC" lint --json 2>/dev/null) | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['targets']==['esp32'] and len(d['diagnostics'])==20, d" || { echo "--json is not the expected JSON"; fail=1; }
"$ZINC" lint --all-targets examples/hero >"$tmp/hero.out" 2>/dev/null || { echo "hero: errors on its own targets"; fail=1; }
sed -n '/^target /,$p' "$tmp/hero.out" >"$tmp/hero.matrix"
check hero.matrix "$tmp/hero.matrix"
(cd $g/esp32-app && "$ZINC" lint --all-targets >"$tmp/esp.out" 2>/dev/null) || { echo "esp32-app: errors on esp32"; fail=1; }
sed -n '/^target /,$p' "$tmp/esp.out" >"$tmp/esp.matrix"
check esp32-app.matrix "$tmp/esp.matrix"
# the codemods clear the source rules
cp -R $g/rules "$tmp/r"
"$ZINC" migrate --apply "$tmp/r" >/dev/null 2>&1
(cd "$tmp/r" && "$ZINC" lint 2>/dev/null) | grep -q " jsx-" && { echo "jsx rules still fire after zinc migrate"; fail=1; }
"$ZINC" lint --target nowhere . 2>/dev/null; [ $? = 2 ] || { echo "an unknown target is not exit 2"; fail=1; }
# the plugins a console's core links (targets/capabilities.json "plugins": audio, 3d, physics2d) raise no warning there; zinc:gl, which no
# console engine has ("modules"), does (ZN-1016)
for d in examples/hardware-n3ds examples/n3ds-pinball examples/n3ds-platformer examples/tokyo; do
  "$ZINC" lint --target n3ds "$d" 2>&1 | grep -q "^zinc lint: 0 errors, 0 warnings (n3ds)" || { echo "$d: warnings on n3ds: $("$ZINC" lint --target n3ds "$d" 2>&1 | head -3)"; fail=1; }
done
"$ZINC" lint --target n3ds examples/gl-cube 2>/dev/null | grep -q "warning host-module \[n3ds\]: zinc:gl is not available" || { echo "gl-cube: no host-module warning on n3ds"; fail=1; }
"$ZINC" lint --target macos examples/gl-cube 2>/dev/null | grep -q "host-module" && { echo "gl-cube: a host-module warning on macos"; fail=1; }
cd "$here" || exit 2
exit $fail
