#!/usr/bin/env bash
# Checks a built image from the inside, in the zinc-pi-image container (tools/pi-image check starts it): the boot
# files, the units, the first-boot settings, and Zinc itself run in the image's own userland (arm64): the engine
# starts, the player compiles and draws a frame. /src/image.img.xz is the image, /out receives the player's frame.
# Prints one line per check; exits 1 when one fails.
set -uo pipefail
R=/mnt/root
IMG=/tmp/check.img
failures=0
pass() { echo "ok    $*"; }
miss() { echo "FAIL  $*"; failures=$((failures + 1)); }
check() { local label=$1; shift; if "$@" >/dev/null 2>&1; then pass "$label"; else miss "$label"; fi; }

xz -dc /src/image.img.xz >"$IMG" || { echo "::error cannot unpack the image"; exit 1; }
part() { sfdisk -J "$IMG" | jq -r ".partitiontable.partitions[$1] | \"\(.start * 512) \(.size * 512)\""; }
read -r ROFF RSIZE < <(part 1)
read -r BOFF BSIZE < <(part 0)
mkdir -p "$R"
mount -o loop,offset="$ROFF",sizelimit="$RSIZE" "$IMG" "$R"
mount -o loop,offset="$BOFF",sizelimit="$BSIZE" "$IMG" "$R/boot/firmware"
for d in dev proc sys; do mount --bind "/$d" "$R/$d"; done
trap 'umount -R "$R" 2>/dev/null; rm -f "$IMG"' EXIT
FW=$R/boot/firmware

echo "-- boot partition"
check "config.txt: no rainbow" grep -qx 'disable_splash=1' "$FW/config.txt"
check "config.txt: the initramfs stays for the first boot" grep -qx 'auto_initramfs=1' "$FW/config.txt"
[ "$(jq -r .debug "$R/etc/zinc/image.json" 2>/dev/null)" = true ] || check "cmdline.txt: quiet, no serial console" sh -c "grep -q ' quiet ' '$FW/cmdline.txt' && ! grep -q serial0 '$FW/cmdline.txt'"
check "cmdline.txt: the first boot grows the card" grep -q ' resize' "$FW/cmdline.txt"
check "cmdline.txt: one line" test "$(wc -l <"$FW/cmdline.txt")" -eq 1
check "meta-data: a new instance" grep -q '^instance_id: ' "$FW/meta-data"
check "user-data: cloud-config" sh -c "head -n 1 '$FW/user-data' | grep -qx '#cloud-config'"
check "user-data: JSON after its first line" sh -c "tail -n +2 '$FW/user-data' | jq -e .hostname"
check "user-data: cloud-init schema" chroot "$R" cloud-init schema --config-file /boot/firmware/user-data
# without a Wi-Fi network in the profile, network-config is Raspberry Pi OS's own (for Imager to fill)
ssid=$(jq -r '.wifi.ssid // ""' "$R/etc/zinc/image.json" 2>/dev/null)
# shellcheck disable=SC2016 # $ssid is jq's variable
[ -z "$ssid" ] || check "network-config: the profile's Wi-Fi network" jq -e --arg ssid "$ssid" '.network.wifis.wlan0["access-points"] | keys == [$ssid]' "$FW/network-config"
check "fstab: /boot/firmware mounted when first read" grep -q 'x-systemd.automount 0 0' "$R/etc/fstab"

echo "-- system"
check "the zinc user, in video, render, input" sh -c "chroot '$R' id -nG zinc | tr ' ' '\n' | grep -c -x -E 'video|render|input' | grep -qx 3"
check "zinc-firstboot.service enabled after cloud-init" test -L "$R/etc/systemd/system/cloud-final.service.wants/zinc-firstboot.service"
for u in zinc-shell zinc-agent zinc-report; do
  check "$u.service enabled" test -L "$R/etc/systemd/system/multi-user.target.wants/$u.service"
done
check "the units read clean (systemd-analyze verify)" chroot "$R" systemd-analyze verify --man=no \
  /etc/systemd/system/zinc-shell.service /etc/systemd/system/zinc-firstboot.service /etc/systemd/system/zinc-agent.service /etc/systemd/system/zinc-report.service \
  /etc/systemd/system/zinc-update-recover.service /etc/systemd/system/zinc-update@0.7.0.service
check "the agent's programs draw through the screen's driver" grep -q 'ZINC_DISPLAY=fbdev' "$R/etc/systemd/system/zinc-agent.service"
check "the agent coordinates the display session" grep -q 'ZINC_AGENT_SCREEN=/run/zinc' "$R/etc/systemd/system/zinc-agent.service"
check "getty@tty1 off by its drop-in, not masked (Pi OS's user rename starts it)" sh -c "[ ! -L '$R/etc/systemd/system/getty@tty1.service' ] && grep -qx 'ConditionPathExists=!/usr/lib/zinc/zinc-session' '$R/etc/systemd/system/getty@tty1.service.d/zinc.conf'"
for u in userconfig.service systemd-firstboot.service NetworkManager-wait-online.service apt-daily.timer; do
  check "$u masked" sh -c "[ \"\$(readlink '$R/etc/systemd/system/$u')\" = /dev/null ]"
done
for u in NetworkManager ssh avahi-daemon systemd-timesyncd; do
  check "$u waits for the first frame" grep -q 'After=zinc-shell.service' "$R/etc/systemd/system/$u.service.d/10-zinc-defer.conf"
done
check "Wi-Fi's driver off the boot path" grep -qx 'blacklist brcmfmac' "$R/etc/modprobe.d/zinc-defer.conf"
check "Mesa's display drivers" test -e "$R/usr/lib/aarch64-linux-gnu/dri/vc4_dri.so" -o -e "$R/usr/lib/aarch64-linux-gnu/dri/libdril_dri.so"
check "no toolchain left in the image" test ! -e "$R/var/lib/zinc/.zinc/toolchains"
check "the runnable player bundle" test -s "$R/usr/lib/zinc/current/player.zapp"
check "the player sources kept for engine changes" test -s "$R/usr/lib/zinc/player-source.tar.gz"
check "the release verification key" grep -Ex '[0-9a-f]{64}' "$R/etc/zinc/update.pub"
check "the update helper loads on the image" chroot "$R" /usr/bin/python3 -I -c "import runpy; runpy.run_path('/usr/lib/zinc/zinc-player-update', run_name='check')"
check "the image's profile, without secrets" sh -c "jq -e '.user.password == \"\" and .wifi.password == \"\"' '$R/etc/zinc/image.json'"

echo "-- Zinc on the image's own userland"
check "zinc starts" chroot "$R" /usr/bin/zinc --version
if libraries=$(chroot "$R" ldd /usr/lib/zinc/engine/bin/zinc 2>&1) && ! grep -q 'not found' <<<"$libraries"; then
  pass "every library zinc needs is there"
else
  miss "the engine's libraries could not be resolved"
fi
check "the session script reads clean" chroot "$R" bash -n /usr/lib/zinc/zinc-session
check "zinc-admin reads clean" chroot "$R" bash -n /usr/lib/zinc/zinc-admin
check "sudo lets the zinc user run zinc-admin, and only it" sh -c "chroot '$R' visudo -cq -f /etc/sudoers.d/zinc && \
  [ \"\$(stat -c %a '$R/etc/sudoers.d/zinc')\" = 440 ] && grep -qx 'zinc ALL=(root) NOPASSWD: /usr/lib/zinc/zinc-admin' '$R/etc/sudoers.d/zinc'"
check "zinc-admin status answers the zinc user" sh -c "chroot '$R' runuser -u zinc -- /usr/lib/zinc/zinc-admin status | grep -q '^model='"
check "polkit lets the zinc user manage the network" grep -q 'subject.user === "zinc"' "$R/etc/polkit-1/rules.d/50-zinc-network.rules"
check "zinc:network ships in the source bundle" sh -c "tar tzf '$R/usr/lib/zinc/player-source.tar.gz' | grep -qx './plugins/network/index.ts'"
# frames enough for zinc-admin's answer: the frame shows what the first boot shows
if chroot "$R" runuser -u zinc -- env HOME=/var/lib/zinc ZINC_RUN=/tmp ZINC_HEADLESS=1 ZINC_DISPLAY=fbdev ZINC_FRAMES=400 ZINC_PLAYER_POLL_MS=5 \
  ZINC_PLAYER_UPDATE_CHECK=0 ZINC_SHOT=/tmp/player.png ZINC_SHOT_FRAMES=399 /usr/bin/zinc run /usr/lib/zinc/current/player.zapp >/tmp/player.log 2>&1 && [ -s "$R/tmp/player-399.png" ]; then
  pass "the player draws a frame as the zinc user, with no network"
  cp "$R/tmp/player-399.png" /out/player.png
else
  miss "the player draws a frame as the zinc user, with no network: $(tail -n 3 /tmp/player.log)"
fi
if grep -q "display driver 'fbdev'" /tmp/player.log; then
  miss "the screen's driver (display-fbdev) is compiled in the image: $(grep -A2 "display driver 'fbdev'" /tmp/player.log | tr '\n' ' ')"
else
  pass "the screen's driver (display-fbdev) is compiled in the image"
fi

[ $failures = 0 ] && echo "all checks passed" || echo "$failures check(s) failed"
exit $((failures > 0))
