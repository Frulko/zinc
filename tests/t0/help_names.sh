#!/bin/sh
# Help at hand, offline (ZN-774.27): zinc help <name> prints a standard-library name's comment, signature and one example (lib/*.d.ts,
# the reference tables, the docs' code); a command keeps its own help; --docs builds the engine's docs once into $ZINC_HOME/docs/<version>
# (stamped); --search finds ten known queries (a lesson, an error code, a module, a name, a command) among its first three results.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
export ZINC_HOME="$t/home"
fail=0
"$ZINC" help rrect >"$t/o" 2>&1 || { echo "help_names: zinc help rrect fails: $(cat "$t/o")"; fail=1; }
for w in 'rrect  (zinc:gfx)' 'rrect(x: number, y: number, w: number, h: number, r: number, color: u32, alpha: i32): void' 'Rounded rectangle' 'Example (' 'zinc help --docs api/gfx.html#rrect'; do
  grep -qF "$w" "$t/o" || { echo "help_names: zinc help rrect has no \"$w\": $(cat "$t/o")"; fail=1; }
done
"$ZINC" help pointerX >"$t/o" 2>&1 && grep -qF 'Where the pointer is.' "$t/o" || { echo "help_names: pointerX's text is not the reference's: $(cat "$t/o")"; fail=1; }
"$ZINC" help run | grep -q 'zinc run' || { echo "help_names: zinc help run is not the command's help"; fail=1; }
"$ZINC" help nosuchnameatall >/dev/null 2>&1; [ $? -eq 2 ] || { echo "help_names: an unknown name does not exit 2"; fail=1; }
d=$("$ZINC" help --docs) && [ -f "$d" ] && grep -q . "$(dirname "$d")/VERSION" || { echo "help_names: --docs built no stamped docs: $d"; fail=1; }
# query|what the first three results must hold
while IFS='|' read -r q want; do
  "$ZINC" help --search $q 2>&1 | head -3 | grep -qF "$want" || { echo "help_names: \"$q\" does not find $want: $("$ZINC" help --search $q 2>&1 | head -3 | tr '\n' ' ')"; fail=1; }
done <<'EOF'
gfx|gfx.html
Z0103|diagnostics.html#z0103
stage|api/stage.html
a window and a shape|learn/01-window-and-shape.html
keyboard|learn/03-keyboard.html
text and images|learn/05-text-and-images.html
rrect|api/gfx.html#rrect
onClick|onClick
doctor|zinc help doctor
explain|zinc help explain
EOF
[ $fail -eq 0 ] && echo "help_names: ok"
exit $fail
