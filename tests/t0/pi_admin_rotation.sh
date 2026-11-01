#!/bin/sh
# zinc-admin rotation 0|90|180|270: ZINC_ROTATE in session.conf (one line, the others kept), the session restarted, anything else refused.
# The verb's own body runs here, on a conf file in a temporary folder, with `systemctl` pointed at a stand-in.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
admin=image/files/usr/lib/zinc/zinc-admin
sed -n '/^  rotation)$/,/^    ;;$/p' "$admin" | sed '1d;$d' | sed "s#/etc/zinc#$tmp#g" > "$tmp/body.sh"
[ -s "$tmp/body.sh" ] || { echo "pi admin rotation: no rotation verb in zinc-admin"; exit 1; }
grep -q '^#   rotation ' "$admin" || { echo "pi admin rotation: the verb is not in the header"; exit 1; }
printf 'ZINC_SHELL=1\n# kept\n' > "$tmp/session.conf"
run() { ( set -u; die() { echo "$*" >&2; exit 1; }; systemctl() { echo "systemctl $*" >> "$tmp/calls"; }; set -- rotation "$1"; . "$tmp/body.sh" ); }
run 90 || { echo "pi admin rotation: 90 refused"; exit 1; }
run 180 || { echo "pi admin rotation: 180 refused"; exit 1; }
[ "$(grep -c '^ZINC_ROTATE=' "$tmp/session.conf")" = 1 ] && grep -qx 'ZINC_ROTATE=180' "$tmp/session.conf" || { echo "pi admin rotation: conf is $(cat "$tmp/session.conf")"; exit 1; }
grep -qx 'ZINC_SHELL=1' "$tmp/session.conf" && grep -qx '# kept' "$tmp/session.conf" || { echo "pi admin rotation: other lines lost"; exit 1; }
[ "$(grep -c 'restart zinc-shell.service' "$tmp/calls")" = 2 ] || { echo "pi admin rotation: the session was not restarted"; exit 1; }
for bad in 45 '' 9000 '90;reboot'; do run "$bad" 2>/dev/null && { echo "pi admin rotation: '$bad' accepted"; exit 1; }; done
grep -qx 'ZINC_ROTATE=180' "$tmp/session.conf" || { echo "pi admin rotation: a refused value changed the conf"; exit 1; }
echo "pi admin rotation: ok"
