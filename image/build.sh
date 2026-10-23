#!/usr/bin/env bash
# Builds the image, in the zinc-pi-image container that tools/pi-image starts. Mounted: /src/image (this directory),
# /src/profile.json (the profile merged over image/profile.json), /src/app (the app, when the profile names one),
# /cache (downloads, the image being built) and /dist (what the build makes).
# Lines that start with "::" are for the tools and apps that follow a build: "::step n/total label", "::error text",
# "::done file".
set -euo pipefail
export LC_ALL=C
P=/src/profile.json
C=/src/image/catalog.json
R=/mnt/root
q() { jq -r "$1" "$P"; }
fail() { echo "::error $*" >&2; exit 1; }
SCRIPTS=(/src/image/scripts/*.sh)
TOTAL=$((10 + ${#SCRIPTS[@]}))
n=1 # step 1 is tools/pi-image's
step() { n=$((n + 1)); echo "::step $n/$TOTAL $*"; }

step "Checking the profile"
NAME=$(q .name)
[[ $NAME =~ ^[a-z0-9][a-z0-9._-]*$ ]] || fail "name '$NAME': lower-case letters, digits, '.', '_' and '-'"
catalog_keys() { jq -r ".$1 | map(.key) | join(\", \")" "$C"; }
for k in board display; do
  v=$(q ".$k")
  jq -e --arg v "$v" ".${k}s | any(.key == \$v)" "$C" >/dev/null || fail "$k '$v' is not one of: $(catalog_keys "${k}s")"
done
bad=$(jq -r --slurpfile c "$C" '[.libraries[] as $l | select($c[0].libraries | any(.key == $l) | not) | $l] | join(", ")' "$P")
[ -z "$bad" ] || fail "unknown libraries: $bad (image/catalog.json has: $(catalog_keys libraries))"
USER_NAME=$(q .user.name)
[ -z "$USER_NAME" ] || [[ $USER_NAME =~ ^[a-z][a-z0-9-]{0,31}$ ]] || fail "user.name '$USER_NAME': a lower-case letter, then letters, digits or '-'"
[ "$USER_NAME" != zinc ] && [ "$USER_NAME" != root ] || fail "user.name '$USER_NAME' is taken by the system"
if [ -n "$(q .wifi.ssid)" ] && [ -z "$(q .wifi.country)" ]; then
  fail "wifi.country is needed with a Wi-Fi network (two letters: FR, GB, US...): the Pi keeps Wi-Fi off without it"
fi
if [ "$(q .ssh)" = true ] && [ -z "$USER_NAME" ]; then
  fail "ssh needs a user to log in as: set user.name with a password or sshKeys"
fi
if [ -n "$USER_NAME" ] && [ -z "$(q .user.password)" ] && [ "$(q '.user.sshKeys | length')" = 0 ]; then
  fail "user '$USER_NAME' needs a password or an SSH key"
fi

step "Downloading Raspberry Pi OS and Zinc"
fetch() { # url sha256 -> the file in /cache, downloaded once and checked every time
  local f
  f=/cache/$(basename "$1")
  if ! echo "$2  $f" | sha256sum -c --status 2>/dev/null; then
    curl -fsSL --retry 3 -o "$f.part" "$1" || fail "cannot download $1"
    mv "$f.part" "$f"
    echo "$2  $f" | sha256sum -c --status || fail "$1: its SHA-256 is not the one in the profile"
  fi
  echo "$f"
}
BASE=$(fetch "$(q .base.url)" "$(q .base.sha256)")
ZINC=$(fetch "$(q .zinc.url)" "$(q .zinc.sha256)")

step "Unpacking Raspberry Pi OS"
IMG=/cache/$NAME.img
xz -dc "$BASE" >"$IMG"

step "Growing the root partition by $(q .growMiB) MiB"
truncate -s +"$(q .growMiB)"M "$IMG"
echo ", +" | sfdisk -q -N 2 --no-reread --no-tell-kernel "$IMG"
part() { sfdisk -J "$IMG" | jq -r ".partitiontable.partitions[$1] | \"\(.start * 512) \(.size * 512)\""; }
read -r ROFF RSIZE < <(part 1)
read -r BOFF BSIZE < <(part 0)
RLOOP=$(losetup -f --show -o "$ROFF" --sizelimit "$RSIZE" "$IMG")
BLOOP=
cleanup() {
  umount -R "$R" 2>/dev/null || true
  [ -z "$BLOOP" ] || losetup -d "$BLOOP" 2>/dev/null || true
  losetup -d "$RLOOP" 2>/dev/null || true
}
trap cleanup EXIT
trap 'fail "stopped"' TERM INT
e2fsck -fy "$RLOOP" >/dev/null || [ $? -le 1 ]
resize2fs -p "$RLOOP" >/dev/null 2>&1
BLOOP=$(losetup -f --show -o "$BOFF" --sizelimit "$BSIZE" "$IMG")
mkdir -p "$R"
mount "$RLOOP" "$R"
mount "$BLOOP" "$R/boot/firmware"
for d in dev dev/pts proc sys; do mount --bind "/$d" "$R/$d"; done
mv "$R/etc/resolv.conf" "$R/etc/resolv.conf.zinc" 2>/dev/null || true
cp /etc/resolv.conf "$R/etc/resolv.conf"
# no service starts inside the chroot while packages install
printf '#!/bin/sh\nexit 101\n' >"$R/usr/sbin/policy-rc.d"
chmod 755 "$R/usr/sbin/policy-rc.d"

step "Installing Zinc and the player"
cp -r --preserve=mode,timestamps /src/image/files/. "$R/"
mkdir -p "$R/usr/lib/zinc/versions/factory/engine" "$R/var/lib/zinc" "$R/etc/zinc"
ln -s versions/factory "$R/usr/lib/zinc/current"
ln -s current/engine "$R/usr/lib/zinc/engine"
tar xzf "$ZINC" -C "$R/usr/lib/zinc/engine" --strip-components=1 --no-same-owner
# the sources the release lacks (tools/pi-image puts them in engine-overlay), never over a file it has
[ ! -d /src/image/engine-overlay ] || cp -rn /src/image/engine-overlay/. "$R/usr/lib/zinc/engine/"
ln -sf /usr/lib/zinc/engine/bin/zinc "$R/usr/bin/zinc"
cp -r /src/image/player "$R/usr/lib/zinc/player"
tar -czf "$R/usr/lib/zinc/player-source.tar.gz" --exclude=./dev --exclude=./.zinc --exclude=./build -C /src/image/player .
install -m 644 /src/image/update.pub "$R/etc/zinc/update.pub"
if [ -d /src/app ] || [ -f /src/app ]; then cp -r /src/app "$R/var/lib/zinc/app"; fi
# the profile the image was made from, without its secrets
jq '.user.password = "" | .wifi.password = ""' "$P" >"$R/etc/zinc/image.json"

export DEBIAN_FRONTEND=noninteractive
export ZI_PACKAGES ZI_CONFIG ZI_COUNTRY ZI_BLUETOOTH ZI_DEBUG ZI_CAMERA
ZI_PACKAGES=$(jq -r --slurpfile c "$C" '[.libraries[] as $l | $c[0].libraries[] | select(.key == $l) | .apt[]] + .packages | join(" ")' "$P")
ZI_CONFIG=$(jq -r --slurpfile c "$C" '. as $p | [($c[0].boards[] | select(.key == $p.board)), ($c[0].displays[] | select(.key == $p.display)) | .config[]] | join("\n")' "$P")
ZI_COUNTRY=$(q .wifi.country)
ZI_BLUETOOTH=$(q .bluetooth)
ZI_DEBUG=$(q .debug)
ZI_CAMERA=$(q '.libraries | index("libcamera") != null')
for s in "${SCRIPTS[@]}"; do
  step "$(sed -n 's/^# step: //p' "$s")"
  cp "$s" "$R/tmp/zinc-step.sh"
  chroot "$R" /bin/bash /tmp/zinc-step.sh
  rm "$R/tmp/zinc-step.sh"
done

step "Writing the first-boot settings"
# Raspberry Pi OS applies these with cloud-init on the first boot, as it does for Raspberry Pi Imager (which may
# rewrite them when it flashes); zinc-firstboot deletes them afterwards. JSON is YAML, so jq writes them.
FW=$R/boot/firmware
HASH=
[ -z "$(q .user.password)" ] || HASH=$(openssl passwd -6 -stdin <<<"$(q .user.password)")
{
  echo '#cloud-config'
  jq --arg hash "$HASH" '
    {hostname: .hostname, manage_etc_hosts: true}
    + (if .timezone != "" then {timezone: .timezone} else {} end)
    + (if .keyboard != "" then {keyboard: {model: "pc105", layout: .keyboard}} else {} end)
    + (if .user.name != "" then {
        users: [{name: .user.name, shell: "/bin/bash", sudo: "ALL=(ALL) NOPASSWD:ALL",
                 groups: "users,adm,dialout,audio,netdev,video,plugdev,input,gpio,spi,i2c,render,sudo",
                 lock_passwd: ($hash == "")}
                + (if $hash != "" then {passwd: $hash} else {} end)
                + (if (.user.sshKeys | length) > 0 then {ssh_authorized_keys: .user.sshKeys} else {} end)],
        ssh_pwauth: ($hash != "")} else {} end)' "$P"
} >"$FW/user-data"
if [ -n "$(q .wifi.ssid)" ]; then
  jq '{network: {version: 2, wifis: {wlan0: {dhcp4: true, optional: true, "regulatory-domain": .wifi.country,
        "access-points": {(.wifi.ssid): (if .wifi.password != "" then {password: .wifi.password} else {} end)}}}}}' \
    "$P" >"$FW/network-config"
fi
printf 'dsmode: local\ninstance_id: %s-%s\n' "$NAME" "$(date +%s)" >"$FW/meta-data"
[ "$(q .ssh)" != true ] || touch "$FW/ssh"
[ "$(q .agent)" != true ] || touch "$FW/zinc-agent"
[ "$(q .debug)" != true ] || touch "$FW/zinc-report"

step "Cleaning up"
chroot "$R" dpkg-query -W -f='${Package} ${Version}\n' >"/dist/$NAME.packages.txt"
chroot "$R" apt-get clean
rm -rf "$R/var/lib/apt/lists/"* "$R/usr/sbin/policy-rc.d" "$R/etc/resolv.conf"
mv "$R/etc/resolv.conf.zinc" "$R/etc/resolv.conf" 2>/dev/null || true
fstrim "$R" >/dev/null 2>&1 || true # freed blocks read back as zeros: a smaller .xz
cleanup
trap - EXIT
e2fsck -fy "$RLOOP" >/dev/null 2>&1 || true

step "Compressing"
OUT=/dist/$NAME.img.xz
IMG_SIZE=$(stat -c %s "$IMG")
IMG_SHA=$(sha256sum "$IMG" | cut -d' ' -f1)
xz -T0 -6 -c "$IMG" >"$OUT.part"
mv "$OUT.part" "$OUT"
rm -f "$IMG"

step "Writing the Raspberry Pi Imager entry"
jq -n --slurpfile p "$P" --slurpfile c "$C" --arg file "$NAME.img.xz" \
  --argjson size "$IMG_SIZE" --arg sha "$IMG_SHA" \
  --argjson xsize "$(stat -c %s "$OUT")" --arg xsha "$(sha256sum "$OUT" | cut -d' ' -f1)" '
  {os_list: [{name: "Zinc (\($p[0].name))",
    description: "Raspberry Pi OS Lite that starts straight into a Zinc app",
    url: $file, release_date: (now | strftime("%Y-%m-%d")),
    extract_size: $size, extract_sha256: $sha, image_download_size: $xsize, image_download_sha256: $xsha,
    devices: [$c[0].boards[] | select(.key == $p[0].board) | .imager[]], init_format: "cloudinit-rpi"}]}' >"/dist/$NAME.json"
echo "::done $OUT"
