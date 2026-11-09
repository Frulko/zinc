#!/bin/sh
# The QuickJS binding rules (ZN-601, docs/plugins.md "Binding to QuickJS") on libzn_webgl and src/qjs: no exception as a type test,
# no std::vector per call in the thunks and the hot WebGL methods. Then the checker itself on two bad lines, so it cannot pass on nothing.
cd "$(dirname "$0")/../.." || exit 2
python3 tests/data/qjs_binding_rules.py || exit 1
tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/tests/data" "$tmp/src/qjs"
cp tests/data/qjs_binding_rules.py "$tmp/tests/data/"
cat > "$tmp/src/qjs/qjs.cpp" <<'EOF'
JSValue hostFn(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int magic) {
  std::vector<double> v(argc);
  size_t n; uint8_t* p = JS_GetArrayBuffer(ctx, &n, argv[0]);
}
EOF
out=$(python3 "$tmp/tests/data/qjs_binding_rules.py" src/qjs/qjs.cpp)
echo "$out" | grep -q 'rule 1' && echo "$out" | grep -q 'rule 2' || { echo "the checker missed a bad line:"; echo "$out"; exit 1; }
echo "ok: the checker refuses a throwing accessor and a std::vector in a thunk"
# the gate of bench/qjs_boundary (tools/bench --gate), on fixed numbers: 30% slower passes, 31% fails, a missing case fails
echo '{"max_regress_pct": 30, "cases": {"a/call": 100}}' > "$tmp/base.json"
ZN_RUNS=1 tools/bench --gate "$tmp/base.json" "$tmp/out.json" a="echo 'BENCH call 130.0'" >/dev/null || { echo "the gate refused a call 30% slower"; exit 1; }
ZN_RUNS=1 tools/bench --gate "$tmp/base.json" "$tmp/out.json" a="echo 'BENCH call 131.0'" >/dev/null; [ $? -eq 3 ] || { echo "the gate let a call 31% slower pass"; exit 1; }
ZN_RUNS=1 tools/bench --gate "$tmp/base.json" "$tmp/out.json" a="echo 'BENCH other 1.0'" >/dev/null; [ $? -eq 3 ] || { echo "the gate let a missing call pass"; exit 1; }
echo "ok: the boundary gate fails above 30% and on a missing call"
