#!/bin/sh
# Reversible tuning of the Nexus 7 2012 (grouper, LineageOS 14.1 userdebug) over adb.
# Usage: nexus7-tune.sh apply | revert | status
# Measurements and reasons: nexus7-2012-research.md (same folder).
set -e
RC=/system/etc/init/zz-nexus7-tune.rc
# Google services and unused system apps: disabled, never uninstalled (pm enable brings them back).
PKGS="com.google.android.gms com.google.android.gsf com.google.android.gsf.login com.android.vending
com.google.android.backuptransport com.google.android.feedback com.google.android.partnersetup
com.google.android.syncadapters.contacts com.google.android.syncadapters.calendar
com.google.android.configupdater com.google.android.onetimeinitializer
com.android.printspooler com.cyanogenmod.lockclock"

sh_() { adb shell "$@"; }

case "$1" in
apply)
  adb root >/dev/null; adb wait-for-device
  adb remount >/dev/null
  # Kernel values reapplied at every boot; the ROM's defaults come back when the file is removed.
  # ponytail: row favours reads over writes on eMMC (UI and asset loads); noop is the fallback if row misbehaves.
  sh_ "cat > $RC <<'EOF'
on property:sys.boot_completed=1
    write /sys/block/mmcblk0/queue/scheduler row
    write /sys/block/mmcblk0/queue/iostats 0
    write /proc/sys/vm/dirty_expire_centisecs 500
    write /proc/sys/vm/dirty_writeback_centisecs 1000
EOF
chmod 644 $RC; chcon u:object_r:system_file:s0 $RC"
  sh_ 'echo row > /sys/block/mmcblk0/queue/scheduler; echo 0 > /sys/block/mmcblk0/queue/iostats
       echo 500 > /proc/sys/vm/dirty_expire_centisecs; echo 1000 > /proc/sys/vm/dirty_writeback_centisecs'
  sh_ 'settings put global window_animation_scale 0.5; settings put global transition_animation_scale 0.5
       settings put global animator_duration_scale 0.5; settings put global ble_scan_always_enabled 0
       svc nfc disable'
  for p in $PKGS; do sh_ "pm disable-user --user 0 $p" >/dev/null 2>&1 && echo "disabled $p" || echo "skip $p"; done
  # Ahead-of-time compile the UI processes that are always on screen (default is speed-profile).
  for p in com.android.systemui com.cyanogenmod.trebuchet com.android.settings; do sh_ "cmd package compile -m speed -f $p"; done
  sh_ 'sm fstrim'   # TRIM of every volume now (F2FS also discards online, Android trims daily when idle)
  echo "applied; reboot to check the boot path: adb reboot" ;;
revert)
  adb root >/dev/null; adb wait-for-device
  adb remount >/dev/null
  sh_ "rm -f $RC"
  sh_ 'echo cfq > /sys/block/mmcblk0/queue/scheduler; echo 1 > /sys/block/mmcblk0/queue/iostats
       echo 200 > /proc/sys/vm/dirty_expire_centisecs; echo 400 > /proc/sys/vm/dirty_writeback_centisecs'
  sh_ 'settings delete global window_animation_scale; settings delete global transition_animation_scale
       settings delete global animator_duration_scale; settings delete global ble_scan_always_enabled
       svc nfc enable'
  for p in $PKGS; do sh_ "pm enable --user 0 $p" >/dev/null 2>&1 && echo "enabled $p"; done
  for p in com.android.systemui com.cyanogenmod.trebuchet com.android.settings; do sh_ "cmd package compile -m speed-profile -f $p"; done
  echo "reverted" ;;
status)
  sh_ "cat /sys/block/mmcblk0/queue/scheduler /proc/sys/vm/dirty_expire_centisecs /proc/sys/vm/dirty_writeback_centisecs
       ls -l $RC 2>&1; pm list packages -d; uptime; dumpsys meminfo | grep -E 'Free RAM|Used RAM'" ;;
*) echo "usage: $0 apply|revert|status"; exit 2 ;;
esac
