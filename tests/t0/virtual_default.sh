#!/bin/sh
# A default parameter of a method that a subclass overrides (a virtual call) is evaluated at the call: it was passed as null once the method had an override
# (EventTarget.addEventListener(type, cb) crashed with "null reference" when zinc:web gave Document its own).
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/p.ts" <<'P'
interface Opts { once?: boolean; n?: number }
class A { add(k: string, o: Opts = {}, d: number = 7): string { return k + (o.once ?? false) + d; } }
class B extends A { add(k: string, o: Opts = {}, d: number = 7): string { return 'B' + super.add(k, o, d); } }
const x: A = new A(), y: A = new B();
console.log(x.add('a'), y.add('b'), y.add('c', { once: true }), y.add('d', {}, 1));
P
[ "$(ZINC_STEPS=0 "$ZINC" run "$tmp/p.ts" 2>&1)" = "afalse7 Bbfalse7 Bctrue7 Bdfalse1" ] || { echo "a default parameter of an overridden method is not evaluated"; ZINC_STEPS=0 "$ZINC" run "$tmp/p.ts" 2>&1 | tail -3; exit 1; }
