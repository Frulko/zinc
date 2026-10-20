#!/bin/sh
# zinc-helper: what a Zinc program on webOS 3 (HP TouchPad) may ask for but not do itself from its jail. Run as root by the upstart job
# zinc-helper (tools/webos-helper installs it). A program writes its requests into /tmp/zinc, which its jail shares (zinc:webos does it):
#   perf/<pid>          full speed while process <pid> lives: both cores held at their top frequency. webOS's ondemandtcl holds the CPU at 192 MHz
#                       with the second core off and samples every 200 ms; only a touch lifts it, for 3 s (hp-touchpad-webos.md, section 14)
#   backlight           'off <pid>' turns the screen's backlight off while <pid> lives, 'on' lights it again (the system's own "display off"
#                       also stops the touch panel: webos-screen-power.md)
#   ports/<port>        (holding a pid) opens the port to incoming TCP and UDP while that process lives: an application has no right to
#                       com.palm.firewall, and webOS drops every packet nothing asked for (the answers to an SSDP search, a server)
#   indicator           'on|off|blink <pid>': the two lights of the Center button (sysfs, root only), off when <pid> is gone
# and for every Zinc application's jail (/var/palm/jail/org.zinc.*): the hardware video decoder's node, which webOS's PDK jail leaves out
# (zinc:video decodes through it: docs/reports/hardware/touchpad-video.md)
# and it writes for them (the GL display's webos_device.cpp reads them for the web APIs of zinc:web):
#   battery.json        {level, charging, source usb|ac|wireless|none, chargerType, temperature, voltage, current}: powerd's batteryStatus and
#                       chargerStatus signals (the queries only make powerd send them; a jail may not listen)
#   network.json        {online, type wifi|none, ssid, ip, quality}: the connection manager's status
#   cpu.json            {freq, max (kHz), cores online, governor}: what full speed (perf/) changes, each second
#   tz                  the system's time zone ('Europe/Paris'): a jail has no /etc/localtime; the GL display of Zinc sets TZ from it
#   helper.pid          its own pid: a program can tell whether its requests will be heard
# and the clock: set from NTP at the start and every hour (webOS let it fall 30 s behind, 2026-10-15: a wall clock shows it)
Z=/tmp/zinc
LED=/sys/class/leds/lcd-backlight/brightness
CPU=/sys/devices/system/cpu
mkdir -p $Z/perf $Z/ports && chmod 1777 $Z $Z/perf $Z/ports
[ -f $Z/backlight ] || echo on > $Z/backlight
chmod 666 $Z/backlight
# one helper: upstart's stop ends the main shell only, its watchers (background subshells and their luna-send) went on, and every
# install added a set (8 found running on 2026-10-15). The previous helpers and their subscriptions go first; this one takes its own
# watchers with it when it is stopped.
for d in /proc/[0-9]*; do
  pid=${d#/proc/}; args=$(tr '\0' ' ' < $d/cmdline 2>/dev/null)
  case "$args" in
    "/bin/sh /var/zinc/helper.sh"*) [ "$pid" != $$ ] && kill $pid 2>/dev/null ;;
    "luna-send -n 100000000 palm://com.palm.bus/signal/addmatch"*com/palm/power*|"luna-send -n 100000000 palm://com.palm.connectionmanager/getstatus"*) kill $pid 2>/dev/null ;;
  esac
done
trap 'trap - TERM; kill 0' TERM INT
echo $$ > $Z/helper.pid
alive() { [ -n "$1" ] && [ -d /proc/$1 ]; }
light=on fast=0 tick=0
saved=$(cat $LED); [ "$saved" = 0 ] && saved=92

speed() {   # 1: both cores at full speed; 0: webOS's governor alone
  # The governor is never changed: switching it removes the ondemandtcl files while LunaSysMgr writes its up_threshold ("Turbo mode on", at
  # each card's focus), and the kernel deadlocks both (2026-10-15: helper in sysfs_addrm_finish, LunaSysMgr in store_up_threshold, the
  # tablet frozen until a reboot). Full speed is the governor's floor raised to the top frequency instead.
  [ $1 = 1 ] && [ "$(cat $CPU/cpu1/online)" != 1 ] && echo 1 > $CPU/cpu1/online
  for c in 0 1; do
    f=$CPU/cpu$c/cpufreq
    [ -f $f/scaling_min_freq ] || continue
    if [ $1 = 1 ]; then want=$(cat $f/cpuinfo_max_freq); else want=$(cat $f/cpuinfo_min_freq); fi
    [ "$(cat $f/scaling_min_freq)" != "$want" ] && echo $want > $f/scaling_min_freq
  done
}

# ---- the battery and the charger: powerd's signals, normalised for navigator.getBattery()
field() { echo "$1" | sed -n "s/.*\"$2\": *\"*\([^,\"}]*\).*/\1/p"; }
battery() {
  b=$(cat $Z/.battery 2>/dev/null); c=$(cat $Z/.charger 2>/dev/null)
  pct=$(field "$b" percent); [ -n "$pct" ] || return
  type=$(field "$c" type); connected=false
  echo "$c" | grep -q '"connected": *true' && connected=true
  case "$type" in usb) src=usb;; inductive*|puck*|touchstone*|wireless*) src=wireless;; '') src=none;; *) src=ac;; esac
  [ $connected = true ] || src=none
  level=$(awk "BEGIN { print $pct / 100 }")
  echo "{\"level\":$level,\"charging\":$connected,\"source\":\"$src\",\"chargerType\":\"$type\",\"chargingTime\":-1,\"dischargingTime\":-1,\"temperature\":$(field "$b" temperature_C),\"voltage\":$(field "$b" voltage_mV),\"current\":$(field "$b" current_mA)}" > $Z/battery.json.new
  mv $Z/battery.json.new $Z/battery.json
}
watch() {   # a signal of powerd into a file, again if the bus restarts
  while true; do
    luna-send -n 100000000 palm://com.palm.bus/signal/addmatch "{\"category\":\"/com/palm/power\",\"method\":\"$1\"}" < /dev/null 2>/dev/null | while read line; do
      case "$line" in *returnValue*) continue;; esac
      echo "$line" > $2; battery
    done
    sleep 5
  done
}
ask_power() {   # the queries answer through the signals: each is stopped after a second
  for q in batteryStatusQuery chargerStatusQuery; do
    (luna-send -n 1 palm://com.palm.power/com/palm/power/$q '{}' < /dev/null > /dev/null 2>&1 & p=$!; sleep 1; kill $p 2>/dev/null) &
  done
}
# ---- the clock: webOS's own network time drifts (30.7 s behind, measured with ntpdate -q on 2026-10-15)
(while true; do ntpdate -s -u pool.ntp.org > /dev/null 2>&1 || ntpdate -s -u time.apple.com > /dev/null 2>&1; sleep 3600; done) &
watch batteryStatus $Z/.battery &
watch chargerStatus $Z/.charger &
# ---- the network: the connection manager's status, for navigator.onLine and navigator.connection
(while true; do
  luna-send -n 100000000 palm://com.palm.connectionmanager/getstatus '{"subscribe":true}' < /dev/null 2>/dev/null | while read line; do
    case "$line" in *isInternetConnectionAvailable*) ;; *) continue;; esac
    online=false; echo "$line" | grep -q '"isInternetConnectionAvailable": *true' && online=true
    type=none; echo "$line" | grep -q '"wifi": *{"state": *"connected"' && type=wifi
    echo "{\"online\":$online,\"type\":\"$type\",\"ssid\":\"$(field "$line" ssid)\",\"ip\":\"$(field "$line" ipAddress)\",\"quality\":\"$(field "$line" networkConfidenceLevel)\"}" > $Z/network.json.new
    mv $Z/network.json.new $Z/network.json
  done
  sleep 5
done) &
# ---- the lights of the Center button
LIGHTS="/sys/class/leds/core_navi_left/brightness /sys/class/leds/core_navi_right/brightness"
[ -f $Z/indicator ] || echo off > $Z/indicator
chmod 666 $Z/indicator
lit=x
lights() { [ "$1" = "$lit" ] && return; for l in $LIGHTS; do echo $1 > $l; done; lit=$1; }

speed 0   # a helper that died while fast left the floor at the top
while true; do
  if [ $((tick % 5)) = 0 ]; then   # once a second: full speed, ports, time zone
    want=0
    for f in $Z/perf/*; do
      [ -f "$f" ] || continue
      if alive "${f##*/}"; then want=1; else rm -f "$f"; fi
    done
    if [ $want != $fast ] || [ $want = 1 ]; then speed $want; fast=$want; fi   # again each second while fast: webOS may take the core back
    for d in /var/palm/jail/org.zinc.*/dev; do   # the video decoder in each Zinc application's jail (kept across launches)
      [ -d "$d" ] && [ ! -e "$d/msm_vidc_dec" ] && mknod "$d/msm_vidc_dec" c 246 0 && chown root:video "$d/msm_vidc_dec" && chmod 660 "$d/msm_vidc_dec"
    done
    cores=0; for c in 0 1; do [ "$(cat $CPU/cpu$c/online 2>/dev/null || echo 1)" = 1 ] && cores=$((cores + 1)); done
    echo "{\"freq\":$(cat $CPU/cpu0/cpufreq/scaling_cur_freq),\"max\":$(cat $CPU/cpu0/cpufreq/scaling_max_freq),\"cores\":$cores,\"governor\":\"$(cat $CPU/cpu0/cpufreq/scaling_governor)\"}" > $Z/cpu.json.new && mv $Z/cpu.json.new $Z/cpu.json
    for f in $Z/ports/*; do
      [ -f "$f" ] || continue
      port=${f##*/}; read owner < "$f"
      if alive "$owner"; then
        if [ ! -f "$Z/ports/.open-$port" ]; then
          for p in udp tcp; do iptables -D INPUT -p $p --dport $port -j ACCEPT 2>/dev/null; iptables -I INPUT -p $p --dport $port -j ACCEPT; done
          touch "$Z/ports/.open-$port"
        fi
      else
        for p in udp tcp; do iptables -D INPUT -p $p --dport $port -j ACCEPT 2>/dev/null; done
        rm -f "$f" "$Z/ports/.open-$port"
      fi
    done
    [ $((tick % 300)) = 5 ] && ask_power   # every minute (powerd also signals each change)
    if [ $((tick % 300)) = 0 ]; then   # every minute: the zone the owner chose in the settings
      zone=$(luna-send -n 1 palm://com.palm.systemservice/time/getSystemTime '{}' < /dev/null 2>/dev/null | sed -n 's/.*"timezone": *"\([^"]*\)".*/\1/p' | sed 's|\\/|/|g')
      [ -n "$zone" ] && [ "$zone" != "$(cat $Z/tz 2>/dev/null)" ] && echo "$zone" > $Z/tz.new && chmod 644 $Z/tz.new && mv $Z/tz.new $Z/tz
    fi
  fi
  tick=$((tick + 1))
  read mode owner < $Z/indicator
  [ "$mode" != off ] && ! alive "$owner" && mode=off
  case "$mode" in on) lights 100;; blink) [ $((tick / 3 % 2)) = 0 ] && lights 100 || lights 0;; *) lights 0;; esac
  read v owner < $Z/backlight
  [ "$v" = off ] && ! alive "$owner" && v=on   # the program that asked is gone: never a black tablet
  if [ "$v" = off ]; then
    if [ $light = on ]; then saved=$(cat $LED); [ "$saved" = 0 ] && saved=92; light=off; fi
    read now < $LED
    [ "$now" = 0 ] || echo 0 > $LED   # the system may write the LED on its own events
  elif [ $light = off ]; then
    echo "${saved:-92}" > $LED
    light=on
  fi
  usleep 200000
done
