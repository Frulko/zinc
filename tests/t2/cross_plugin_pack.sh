#!/bin/sh
# Cross-built plugin binaries (ZN-354): the linux-armhf leg of .github/workflows/plugin.yml, `tools/plugin-pack <plugin> <out> --target armhf-linux`
# (zinc plugin-build --target with the pinned zig), writes binaries/armhf-linux/<name>-<key>.tar whose plugin.a holds 32-bit ARM objects; the same
# for aarch64-linux and 64-bit ARM. Cross-platform pass: not run on the development Mac during a task.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$Z" new plugin "$tmp/xplug" >/dev/null || exit 1
for t in armhf-linux:40 aarch64-linux:183; do   # ELF e_machine: EM_ARM, EM_AARCH64
  name=${t%%:*}; want=${t##*:}
  ZINC="$Z" tools/plugin-pack "$tmp/xplug" "$tmp/out" --target "$name" > "$tmp/log" 2>&1 || { echo "$name: $(cat "$tmp/log")"; fail=1; continue; }
  tar=$(ls "$tmp/out/binaries/$name"/xplug-*.tar 2>/dev/null)
  [ -n "$tar" ] || { echo "$name: no binaries/$name/xplug-<key>.tar: $(cat "$tmp/log")"; fail=1; continue; }
  python3 - "$tar" "$name" "$want" <<'PY' || fail=1
import sys, tarfile
tar, target, want = sys.argv[1], sys.argv[2], int(sys.argv[3])
a = tarfile.open(tar).extractfile(target + "/plugin.a").read()
at = a.find(b"\x7fELF")
machine = int.from_bytes(a[at + 18:at + 20], "little") if at >= 0 else None
if machine != want: print("%s: plugin.a holds no object for it (e_machine %s, want %d)" % (target, machine, want)); sys.exit(1)
PY
done
[ $fail -eq 0 ] && echo "cross plugin pack: ok"
exit $fail
