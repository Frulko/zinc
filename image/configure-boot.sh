#!/usr/bin/env bash
# First-boot files shared by image creation and a freshly flashed Etcher card.
set -euo pipefail
P=${1:?profile.json required}
FW=${2:?boot directory required}
q() { jq -r "$1" "$P"; }
NAME=$(q .name)
hostname=$(q '.hostname // ""')
[[ -z $hostname || $hostname =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]] || { echo 'Invalid hostname.' >&2; exit 1; }
if [ -z "$hostname" ]; then touch "$FW/zinc-auto-name"; else rm -f "$FW/zinc-auto-name"; fi
user=$(q .user.name)
if [ -n "$user" ]; then
  [[ $user =~ ^[a-z][a-z0-9-]{0,31}$ ]] && [ "$user" != root ] && [ "$user" != zinc ] || { echo 'Invalid login user.' >&2; exit 1; }
  [ -n "$(q .user.password)" ] || [ "$(q '.user.sshKeys | length')" -gt 0 ] || { echo 'The login needs a password or SSH key.' >&2; exit 1; }
fi
[ "$(q .ssh)" != true ] || [ -n "$user" ] || { echo 'SSH needs a login user.' >&2; exit 1; }
if [ -n "$(q .wifi.ssid)" ]; then
  [[ $(q .wifi.country) =~ ^[A-Z]{2}$ ]] || { echo 'Wi-Fi needs a two-letter country.' >&2; exit 1; }
fi
HASH=
[ -z "$(q .user.password)" ] || HASH=$(openssl passwd -6 -stdin <<<"$(q .user.password)")
{
  echo '#cloud-config'
  jq --arg hash "$HASH" '
    (if (.hostname // "") == "" then {preserve_hostname: true} else {hostname: .hostname, manage_etc_hosts: true} end)
    + (if .timezone != "" then {timezone: .timezone} else {} end)
    + (if .keyboard != "" then {keyboard: {model: "pc105", layout: .keyboard}} else {} end)
    + (if .user.name != "" then {
        users: [{name: .user.name, shell: "/bin/bash", sudo: "ALL=(ALL) NOPASSWD:ALL",
                 groups: "users,adm,dialout,audio,netdev,video,plugdev,input,gpio,spi,i2c,render,sudo",
                 lock_passwd: ($hash == "")}
                + (if $hash != "" then {hashed_passwd: $hash} else {} end)
                + (if (.user.sshKeys | length) > 0 then {ssh_authorized_keys: .user.sshKeys} else {} end)],
        ssh_pwauth: ($hash != "")} else {} end)' "$P"
} >"$FW/user-data"
if [ -n "$(q .wifi.ssid)" ]; then
  jq '{network: {version: 2, wifis: {wlan0: {dhcp4: true, optional: true, "regulatory-domain": .wifi.country,
        "access-points": {(.wifi.ssid): (if .wifi.password != "" then {password: .wifi.password} else {} end)}}}}}' \
    "$P" >"$FW/network-config"
fi
printf 'dsmode: local\ninstance_id: %s-%s\n' "$NAME" "$(date +%s)" >"$FW/meta-data"
for flag in ssh agent debug; do
  case $flag in ssh) marker=ssh ;; agent) marker=zinc-agent ;; debug) marker=zinc-report ;; esac
  if [ "$(q ".$flag")" = true ]; then touch "$FW/$marker"; else rm -f "$FW/$marker"; fi
done

