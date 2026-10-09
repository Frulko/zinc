#!/bin/sh
# The native plugin ABI v1 is frozen (ZN-353): include/zn/native.h matches tests/data/native-abi-v1.txt under tools/abi-check, and the checker catches the
# incompatible changes (a field retyped, a field inserted in the middle, a fixed struct grown, a function removed, a constant changed) while it accepts the
# compatible ones (an engine function appended to ZnHostApi, a newer minor version).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
python3 tools/abi-check include/zn/native.h tests/data/native-abi-v1.txt || { echo "native_abi_freeze: native.h changed incompatibly against the v1 snapshot (above)"; fail=1; }
mutate() {   # mutate <name> <expect ok|fail> <python replacement on the header text>
  python3 -c "import sys; t=open('include/zn/native.h').read(); exec(sys.argv[1]); open('$tmp/h.h','w').write(t)" "$3"
  if python3 tools/abi-check "$tmp/h.h" tests/data/native-abi-v1.txt >/dev/null; then got=ok; else got=fail; fi
  [ "$got" = "$2" ] || { echo "native_abi_freeze: $1: expected $2, got $got"; fail=1; }
}
mutate "a field retyped" fail "t = t.replace('typedef struct ZnStr { const char* p; uint32_t n; }', 'typedef struct ZnStr { const char* p; uint64_t n; }')"
mutate "a field inserted in the middle" fail "t = t.replace('  uint32_t size;\n  void (*set_error)', '  uint32_t size;\n  int extra;\n  void (*set_error)')"
mutate "a fixed struct grown" fail "t = t.replace('  uint32_t flags;              /* ZN_PURE_SCALAR', '  uint32_t flags; int more; /* ZN_PURE_SCALAR')"
mutate "a function removed" fail "t = t.replace('int32_t zn_native_has_module(const char* module);', '')"
mutate "a constant changed" fail "t = t.replace('#define ZN_PENDING 1', '#define ZN_PENDING 3')"
mutate "an engine function appended" ok "t = t.replace('  const char* (*cb_error)(void);', '  const char* (*cb_error)(void);\n  void (*log)(const char* line);')"
mutate "a newer minor" ok "t = t.replace('#define ZN_ABI_MINOR 1u', '#define ZN_ABI_MINOR 2u')"
mutate "a lower minor" fail "t = t.replace('#define ZN_ABI_MINOR 1u', '#define ZN_ABI_MINOR 0u')"
exit $fail
