#!/usr/bin/env bash
# Makes a RAUC bundle from a built A/B image, in the zinc-pi-image container (tools/pi-image bundle). Mounted:
# /src/image.img.xz (the image), /keys (signing.pem, signing.key: tools/pi-image keys) and /out (where it goes).
# The bundle holds slot A's root file system, shrunk to its content; zinc-system-update grows it on the device.
set -euo pipefail
export LC_ALL=C
fail() { echo "::error $*" >&2; exit 1; }
[ -f /keys/signing.pem ] && [ -f /keys/signing.key ] || fail "no signing certificate in the keys directory: tools/pi-image keys"
work=/tmp/bundle
rm -rf "$work"; mkdir -p "$work/dir"
name=$(basename /src/image.img.xz .img.xz)
echo "::step 1/3 Unpacking $name"
xz -dc /src/image.img.xz >"$work/img"
read -r off size < <(sfdisk -J "$work/img" | jq -r '.partitiontable.partitions[1] | "\(.start * 512) \(.size * 512)"')
[ "$(sfdisk -J "$work/img" | jq '.partitiontable.partitions | length')" = 3 ] || fail "$name is not an A/B image (\"ab\": true in its profile)"
dd if="$work/img" of="$work/dir/rootfs.ext4" bs=1M iflag=skip_bytes,count_bytes skip="$off" count="$size" status=none
rm "$work/img"
[ -n "$(debugfs -R 'stat /usr/lib/zinc/boot' "$work/dir/rootfs.ext4" 2>/dev/null)" ] || fail "$name has no /usr/lib/zinc/boot: not an A/B image"
echo "::step 2/3 Shrinking the root file system"
e2fsck -fy "$work/dir/rootfs.ext4" >/dev/null || [ $? -le 1 ]
resize2fs -M "$work/dir/rootfs.ext4" >/dev/null 2>&1
truncate -s "$(dumpe2fs -h "$work/dir/rootfs.ext4" 2>/dev/null | awk -F: '/^Block count/ { c = $2 } /^Block size/ { s = $2 } END { print c * s }')" "$work/dir/rootfs.ext4"
cat >"$work/dir/manifest.raucm" <<EOF
[update]
compatible=zinc-pi-arm64
version=$(date -u +%Y.%m.%d.%H%M)
description=$name

[bundle]
format=verity

[image.rootfs]
filename=rootfs.ext4
EOF
echo "::step 3/3 Signing the bundle"
out=/out/$name.raucb
rm -f "$out"
rauc bundle --cert=/keys/signing.pem --key=/keys/signing.key "$work/dir" "$out"
rm -rf "$work"
echo "::done $out"
