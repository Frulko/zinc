#!/bin/sh
# WebAssembly on QuickJS from the wasm pack (ZN-773.06): with libzn_wasm beside zinc (or $ZINC_WASM_LIB) a program compiles, validates and
# instantiates a module and uses its functions, imports, memory, global and table, and makes its own Memory, Table and Global; without it,
# reading WebAssembly throws the error that names `zinc engine install wasm`. The WPT JS API tests: tools/wpt-wasm.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
cat > "$tmp/wasm.js" <<'EOF'
// a module assembled by hand: add(a, b), callTwice(x) through the import env.twice, sum(n) = 0 + 1 + ... + n-1 in a loop,
// an exported memory, a mutable i32 global (42) and a funcref table of 2 with add at 0
const leb = (n) => { const o = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n); return o; };
const str = (s) => [...leb(s.length), ...[...s].map((c) => c.charCodeAt(0))];
const sec = (id, ...items) => { const body = [...leb(items.length), ...items.flat()]; return [id, ...leb(body.length), ...body]; };
const code = (locals, ...ops) => { const b = [...locals, ...ops, 0x0b]; return [...leb(b.length), ...b]; };
const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  ...sec(1, [0x60, 2, 0x7f, 0x7f, 1, 0x7f], [0x60, 1, 0x7f, 1, 0x7f]),
  ...sec(2, [...str('env'), ...str('twice'), 0x00, 1]),
  ...sec(3, [0], [1], [1]),
  ...sec(4, [0x70, 0x00, 2]),
  ...sec(5, [0x00, 1]),
  ...sec(6, [0x7f, 0x01, 0x41, 42, 0x0b]),
  ...sec(7, [...str('add'), 0, 1], [...str('callTwice'), 0, 2], [...str('sum'), 0, 3], [...str('mem'), 2, 0], [...str('g'), 3, 0], [...str('tbl'), 1, 0]),
  ...sec(9, [0x00, 0x41, 0x00, 0x0b, 1, 1]),
  ...sec(10, code([0], 0x20, 0, 0x20, 1, 0x6a), code([0], 0x20, 0, 0x10, 0),
    code([1, 2, 0x7f], 0x02, 0x40, 0x03, 0x40, 0x20, 1, 0x20, 0, 0x4e, 0x0d, 1, 0x20, 2, 0x20, 1, 0x6a, 0x21, 2,
      0x20, 1, 0x41, 1, 0x6a, 0x21, 1, 0x0c, 0, 0x0b, 0x0b, 0x20, 2))]);
const W = WebAssembly, out = [];
const check = (what, ok) => out.push(what + (ok ? '' : ' FAILED'));
check('validate', W.validate(bytes) && !W.validate(new Uint8Array([0, 0x61, 0x73, 0x6d, 2, 0, 0, 0])));
const module = new W.Module(bytes);
check('exports ' + W.Module.exports(module).map((e) => e.name + ':' + e.kind).join(','), true);
const boom = new Error('boom');
let thrower = false;
const { exports: x } = new W.Instance(module, { env: { twice: (v) => { if (thrower) throw boom; return v * 2; } } });
check('add ' + x.add(2, 3), x.add(2, 3) === 5 && x.add.length === 2 && x.add.name === '1');
check('import ' + x.callTwice(21), x.callTwice(21) === 42);
thrower = true;
try { x.callTwice(1); check('import throws', false); } catch (e) { check('import throws', e === boom); }
check('sum ' + x.sum(100), x.sum(100) === 4950);
const view = new Uint8Array(x.mem.buffer);
view[7] = 9;
check('memory ' + x.mem.buffer.byteLength, x.mem instanceof W.Memory && new Uint8Array(x.mem.buffer)[7] === 9);
check('grow ' + x.mem.grow(1), view.byteLength === 0 && x.mem.buffer.byteLength === 131072 && new Uint8Array(x.mem.buffer)[7] === 9);
check('global ' + x.g.value, x.g instanceof W.Global && x.g.value === 42 && ((x.g.value = 7), x.g.value === 7));
check('table ' + x.tbl.length, x.tbl.get(0) === x.add && x.tbl.get(0)(1, 2) === 3 && x.tbl.get(1) === null);
const m = new W.Memory({ initial: 1, maximum: 2 }), t = new W.Table({ element: 'anyfunc', initial: 1 }), g = new W.Global({ value: 'i64', mutable: true }, 5n);
check('own objects', m.buffer.byteLength === 65536 && m.grow(1) === 1 && t.length === 1 && t.get(0) === null && g.value === 5n);
try { new W.Module(new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 1])); check('compile error', false); } catch (e) { check('compile error', e instanceof W.CompileError); }
try { new W.Instance(module, { env: {} }); check('link error', false); } catch (e) { check('link error', e instanceof W.LinkError); }
W.instantiate(bytes, { env: { twice: (v) => v + v } }).then(({ module, instance }) => {
  check('instantiate ' + instance.exports.callTwice(4), module instanceof W.Module && instance.exports.callTwice(4) === 8);
  console.log(out.join('\n'));
});
EOF
mod=$(ls "$(dirname "$Z")"/libzn_wasm.* 2>/dev/null | head -1)
if [ -n "$mod" ]; then
  u=$(nm -u "$mod" | grep -c -E '^_?(JS_|napi_)')   # one module for every engine: the engine's Node-API comes as tables
  [ "$u" = 0 ] || { echo "wasm_pack: $mod resolves $u JS_*/napi_* symbols from the program that loads it"; fail=1; }
  got=$(ZINC_WASM_LIB="$mod" "$Z" run "$tmp/wasm.js" --engine quickjs 2>&1)
  if printf '%s\n' "$got" | grep -q FAILED || [ "$(printf '%s\n' "$got" | grep -c .)" != 14 ]; then echo "wasm_pack: WebAssembly with the module:"; printf '%s\n' "$got" | sed 's/^/  /'; fail=1; fi
else
  echo "wasm_pack: no libzn_wasm beside $Z (tools/build zn_wasm): only the missing-pack error is checked"
fi
printf "console.log(typeof WebAssembly);\n" > "$tmp/missing.js"
ZINC_WASM_LIB=/nonexistent/libzn_wasm.so "$Z" run "$tmp/missing.js" --engine quickjs 2>&1 | grep -q "zinc engine install wasm" || { echo "wasm_pack: without the module, WebAssembly does not say how to get it"; fail=1; }
printf "console.log('plain');\n" > "$tmp/plain.js"
[ "$(ZINC_WASM_LIB=/nonexistent/libzn_wasm.so "$Z" run "$tmp/plain.js" --engine quickjs 2>&1)" = "plain" ] || { echo "wasm_pack: a program that does not use WebAssembly does not run without the module"; fail=1; }
exit $fail
