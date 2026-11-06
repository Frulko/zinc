#!/bin/sh
# Two zinc processes installing the same pinned archive at once both succeed (ZN-998): the install holds a file lock, so they never share
# the half-written download or the extraction directory.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/src/tool-1.0/bin" "$tmp/mirror"
i=0; while [ $i -lt 400 ]; do head -c 65536 /dev/urandom > "$tmp/src/tool-1.0/f$i"; i=$((i + 1)); done   # ~25 MB: a race window of a second
echo ok > "$tmp/src/tool-1.0/bin/tool"
tar -czf "$tmp/mirror/tool-1.0.tar.gz" -C "$tmp/src" tool-1.0
sum=$("$ZINC" toolchain sha256 "$tmp/mirror/tool-1.0.tar.gz" | cut -d' ' -f1)
dir="$tmp/home/toolchains/tool-1.0"
fail=0
for n in 1 2 3 4; do
  "$ZINC" toolchain fetch "file://$tmp/mirror/tool-1.0.tar.gz" "$sum" "$dir" bin/tool > "$tmp/out$n" 2>&1 &
done
wait
for n in 1 2 3 4; do
  grep -q "^$dir\$" "$tmp/out$n" || { echo "install $n failed: $(cat "$tmp/out$n")"; fail=1; }
done
[ "$(cat "$dir/bin/tool" 2>/dev/null)" = ok ] || { echo "the tool is not in place"; fail=1; }
[ "$(ls "$dir" | wc -l | tr -d ' ')" = 402 ] || { echo "the unpacked tool is incomplete: $(ls "$dir" | wc -l) entries"; fail=1; }
ls "$tmp/home/toolchains" | grep -v -e '^tool-1.0$' -e '^tool-1.0.lock$' | grep -q . && { echo "leftovers: $(ls "$tmp/home/toolchains")"; fail=1; }
exit $fail
