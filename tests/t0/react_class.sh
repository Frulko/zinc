#!/bin/sh
# Class components in the React model (ZN-163): props, state, setState and a re-render lower to _cc; the object-literal / declared-type join in a conditional lets a map callback return either.
cd "$(dirname "$0")/../.." || exit 2
fail=0
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 "$ZINC" run tests/golden/react 2>&1)
[ "$out" = "$(cat tests/golden/react/class_component.out)" ] || { echo "class component output differs:"; echo "$out"; fail=1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/join.ts" <<'T'
interface Todo { id: i32; text: string; done: boolean }
const a: Todo[] = [{ id: 1, text: 'a', done: false }, { id: 2, text: 'b', done: true }];
const flipped: Todo[] = a.map((t: Todo) => t.id === 2 ? { id: t.id, text: t.text, done: !t.done } : t);
console.log(flipped[0].done, flipped[1].done, flipped.length);
T
[ "$("$ZINC" run "$tmp/join.ts" 2>&1)" = "false false 2" ] || { echo "conditional join: $("$ZINC" run "$tmp/join.ts" 2>&1)"; fail=1; }
exit $fail
