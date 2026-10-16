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
# Four cores kept online (ZN-750, docs/reports/zinc-next-android.md "CPU cores"): the hotplug is Tegra's cpuquiet ("balanced" governor;
# autosmp is built in but off); its "userspace" governor takes no core down, and a launch brings all four up. A fling of rn-showcase had 240
# to 297 late frames of 720 with four cores held, 303 to 366 with the ROM's balanced, 318 to 397 with at least two, 474 with one.
# ponytail: four or the ROM's; another minimum needs a process holding /dev/min_online_cpus open (PM QoS), not a sysfs write.
C=/sys/devices/system/cpu

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
    write $C/cpuquiet/current_governor userspace
    write $C/cpu1/online 1
    write $C/cpu2/online 1
    write $C/cpu3/online 1
EOF
chmod 644 $RC; chcon u:object_r:system_file:s0 $RC"
  sh_ 'echo row > /sys/block/mmcblk0/queue/scheduler; echo 0 > /sys/block/mmcblk0/queue/iostats
       echo 500 > /proc/sys/vm/dirty_expire_centisecs; echo 1000 > /proc/sys/vm/dirty_writeback_centisecs'
  sh_ "echo userspace > $C/cpuquiet/current_governor; for c in 1 2 3; do echo 1 > $C/cpu\$c/online; done"
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
  # balanced again, with init.grouper.rc's values: setting a governor puts the kernel's back (up 1 s, down 2 s, a 513 MHz floor)
  sh_ "echo balanced > $C/cpuquiet/current_governor; B=$C/cpuquiet/balanced
       echo 102000 > \$B/idle_bottom_freq; echo 620000 > \$B/idle_top_freq; echo 60 > \$B/down_delay; echo 60 > \$B/up_delay"
  sh_ 'settings delete global window_animation_scale; settings delete global transition_animation_scale
       settings delete global animator_duration_scale; settings delete global ble_scan_always_enabled
       svc nfc enable'
  for p in $PKGS; do sh_ "pm enable --user 0 $p" >/dev/null 2>&1 && echo "enabled $p"; done
  for p in com.android.systemui com.cyanogenmod.trebuchet com.android.settings; do sh_ "cmd package compile -m speed-profile -f $p"; done
  echo "reverted" ;;
status)
  sh_ "cat /sys/block/mmcblk0/queue/scheduler /proc/sys/vm/dirty_expire_centisecs /proc/sys/vm/dirty_writeback_centisecs
       ls -l $RC 2>&1; pm list packages -d; uptime; dumpsys meminfo | grep -E 'Free RAM|Used RAM'
       echo cores online \$(cat $C/online), cpuquiet \$(cat $C/cpuquiet/current_governor 2>/dev/null || echo '(adb root to read)')" ;;
*) echo "usage: $0 apply|revert|status"; exit 2 ;;
esac
