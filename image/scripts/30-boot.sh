#!/bin/bash
# step: Boot configuration
# config.txt without the probes and the rainbow, a quiet cmdline.txt, /boot/firmware mounted when first read. The
# initramfs and cloud-init stay for the first boot (they grow the card and apply the settings); zinc-firstboot turns
# them off.
set -euo pipefail
FW=/boot/firmware

cfg() { # key=value: replaced where the key is, else added at the end ([all])
  local key=${1%%=*}
  if grep -q "^$key=" $FW/config.txt; then sed -i "s|^$key=.*|$1|" $FW/config.txt; else echo "$1" >>$FW/config.txt; fi
}
cfg disable_splash=1
[ "$ZI_CAMERA" = true ] || cfg camera_auto_detect=0
while IFS= read -r line; do
  case $line in
    dtoverlay=* | dtparam=*) echo "$line" >>$FW/config.txt ;;
    ?*) cfg "$line" ;;
  esac
done <<<"$ZI_CONFIG"
[ "$ZI_BLUETOOTH" = true ] || echo "dtoverlay=disable-bt" >>$FW/config.txt

line=$(cat $FW/cmdline.txt)
line=${line/ fsck.repair=yes/}
if [ "$ZI_DEBUG" != true ]; then
  # the kernel and systemd talk on tty3, out of sight; tty1 is the session's
  line=${line/console=serial0,115200 /}
  line=${line/console=tty1/console=tty3}
  line="$line quiet loglevel=3 logo.nologo vt.global_cursor_default=0 systemd.show_status=0 consoleblank=0"
fi
line="$line fsck.mode=skip"
[ -z "$ZI_COUNTRY" ] || line="$line cfg80211.ieee80211_regdom=$ZI_COUNTRY"
echo "$line" >$FW/cmdline.txt

sed -i -E 's|^(\S+\s+/boot/firmware\s+vfat\s+)defaults\s+0\s+2|\1defaults,noatime,nofail,x-systemd.automount 0 0|' /etc/fstab
