#!/bin/sh
# The halves of a surrogate pair taken apart (s.charAt(i) of an emoji, as a Markdown scanner reads it char by char) and joined
# again (+, +=, a template) are the character: the same length, codes, bytes and equality as the emoji written whole; a lone half
# keeps its code unit (charCodeAt), not U+FFFD. On the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/p.ts" <<'P'
const s = 'a 🎲 b';
let t = '';
for (let i = 0; i < s.length; i++) t += s.charAt(i);
const h = s.charAt(2), l = s.charAt(3);
const u = h + l;
console.log(`${t === s} ${t.length} ${h.charCodeAt(0)} ${l.charCodeAt(0)} ${u === '🎲'} ${`${h}${l}` === '🎲'} ${encodeURIComponent(u)} ${s.slice(0, 3) + s.slice(3) === s}`);
P
want="true 6 55356 57266 true true %F0%9F%8E%B2 true"
fail=0
got=$(ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp "$tmp/p.ts" 2>&1 | tail -1)
[ "$got" = "$want" ] || { echo "interpreter: want '$want', got '$got'"; fail=1; }
got=$(ZINC_HEADLESS=1 timeout 60 "$ZINC" run "$tmp/p.ts" --engine quickjs 2>/dev/null | tail -1)
[ "$got" = "$want" ] || { echo "QuickJS: want '$want', got '$got'"; fail=1; }
if timeout 300 "$ZINC" build "$tmp/p.ts" -o "$tmp/p" >/dev/null 2>&1; then
  got=$(timeout 60 "$tmp/p" 2>&1 | tail -1)
  [ "$got" = "$want" ] || { echo "AOT: want '$want', got '$got'"; fail=1; }
else echo "zinc build failed"; fail=1; fi
exit $fail
