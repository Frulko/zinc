#!/bin/sh
# Typed fast native calls of the patched QuickJS-ng (ZN-596): tests/native/qjs_fastcall.c built against third_party/quickjs-ng, then
# the engine's __host_* rows with arguments the fast path does not take (strings, objects), which must behave as the generic ones.
cd "$(dirname "$0")/../.." || exit 2
command -v cc >/dev/null || { echo "skipped: no C compiler"; exit 77; }
tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT
q=third_party/quickjs-ng
cc -O0 -w -DQUICKJS_NG_BUILD -I "$q" tests/native/qjs_fastcall.c "$q/quickjs.c" "$q/dtoa.c" "$q/libregexp.c" "$q/libunicode.c" -lm -lpthread -o "$tmp/fastcall" || exit 1
"$tmp/fastcall" || exit 1
[ -x "${ZINC:-}" ] || { echo "skipped the engine part: no \$ZINC"; exit 0; }
cat > "$tmp/host.js" <<'EOF'
const same = (a, b, what) => { if (a !== b) throw new Error(what + ': ' + a + ' !== ' + b); };
same(__host_gfxEase(1, 0.5), __host_gfxEase('1', '0.5'), 'strings');
same(__host_gfxEase(1, 0.5), __host_gfxEase({ valueOf: () => 1 }, { valueOf: () => 0.5 }), 'objects');
same(__host_gfxEase(0, 0.25), __host_gfxEase.call(null, 0, 0.25), 'call');
same(__host_gfxEase(0, 0), __host_gfxEase(0, null), 'null');
same(__host_gfxWidth(), __host_gfxWidth.apply(null, []), 'apply');
console.log('ok: host rows give the same results on the fast and the generic path');
EOF
out=$(ZINC_HEADLESS=1 timeout 60 "$ZINC" run "$tmp/host.js" --engine quickjs 2>&1)
echo "$out" | grep '^ok:' || { echo "$out" | tail -5; exit 1; }
