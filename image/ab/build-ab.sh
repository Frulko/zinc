# The A/B image ("ab": true in the profile), sourced by build.sh: two root file system slots and RAUC, so that a whole
# new system can be installed beside the running one and booted once (zinc-system-update, image/ab/files).
#
# Card layout (MBR): p1 the boot FAT, shared (firmware, config.txt, tryboot.txt, a/ and b/: each slot's kernel, device
# trees, overlays and cmdline.txt); p2 slot A, the image's root; p3 slot B, the same size, empty until the first update.
# The card is not grown on the first boot: the slots keep their size (growMiB sets it).

# after the root partition was grown, before it is mounted: slot B behind it
ab_partition() {
  local off size
  read -r off size < <(part 1)
  truncate -s +"$size" "$IMG"
  echo "$(((off + size) / 512)),$((size / 512)),83" | sfdisk -q -a --no-reread --no-tell-kernel "$IMG"
}

# with the image mounted, after the first-boot settings: slot A's boot files, the firmware's slot switch, RAUC
ab_boot() {
  local FW=$R/boot/firmware disk line
  cp -r --preserve=mode,timestamps /src/image/ab/files/. "$R/"
  mkdir -p "$R/etc/systemd/system/multi-user.target.wants"
  ln -sf ../zinc-system-confirm.service "$R/etc/systemd/system/multi-user.target.wants/zinc-system-confirm.service"
  [ -f /src/image/rauc-keyring.pem ] || fail "no RAUC keyring: tools/pi-image keys makes one"
  install -D -m 644 /src/image/rauc-keyring.pem "$R/etc/rauc/keyring.pem"
  disk=$(sed -n 's/.*root=PARTUUID=\([0-9a-fA-F]*\)-02.*/\1/p' "$FW/cmdline.txt")
  [ -n "$disk" ] || fail "cmdline.txt does not name the root by PARTUUID=<disk>-02: $(cat "$FW/cmdline.txt")"
  cat >"$R/etc/rauc/system.conf" <<EOF
# Maintained by Zinc (A/B image): docs in image/README.md, "System updates (A/B image)".
[system]
compatible=zinc-pi-arm64
bootloader=custom
mountprefix=/run/rauc

[handlers]
bootloader-custom-backend=/usr/lib/zinc/zinc-ab-boot
post-install=/usr/lib/zinc/zinc-system-update

[keyring]
path=/etc/rauc/keyring.pem

[slot.rootfs.0]
device=/dev/disk/by-partuuid/$disk-02
type=ext4
bootname=A

[slot.rootfs.1]
device=/dev/disk/by-partuuid/$disk-03
type=ext4
bootname=B
EOF
  # the slot's boot files travel inside its root file system, so a bundle brings its own kernel
  mkdir -p "$R/usr/lib/zinc/boot"
  cp "$FW"/kernel*.img "$FW"/*.dtb "$R/usr/lib/zinc/boot/"
  cp -r "$FW/overlays" "$R/usr/lib/zinc/boot/"
  cp -r "$R/usr/lib/zinc/boot" "$FW/a"
  mkdir -p "$FW/b"
  echo B >"$FW/zinc-ab-bad"   # nothing to boot there yet
  # no growing of the card (the slots keep their size), a panic resets, the slot is named for RAUC
  line=$(sed 's/ resize\b//' "$FW/cmdline.txt")
  echo "$line" >"$FW/cmdline.txt"
  echo "$line rauc.slot=A panic=10" >"$FW/a/cmdline.txt"
  sed -i 's/^auto_initramfs=.*/auto_initramfs=0/' "$FW/config.txt"
  printf '\n[all]\n# Zinc A/B: the slot the Pi boots (tryboot.txt names the other one for a single trial boot)\ndtparam=watchdog=on\nos_prefix=a/\n' >>"$FW/config.txt"
}
