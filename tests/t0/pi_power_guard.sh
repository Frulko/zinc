#!/bin/bash
# zinc-power-guard (image/files/usr/lib/zinc/zinc-power-guard) on a fake sysfs: under-voltage caps the CPU maximum at half of
# the top clock, the cap is held until the alarm has been quiet for the hold time (here 600 ms) and the old maximum comes
# back; ZINC_POWER_GUARD=0 in the session.conf turns it off; no rpi_volt device means a quiet exit; the unit, the journald
# drop-in and the list of the in-place update are checked too. No Pi, no root.
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
guard=$root/image/files/usr/lib/zinc/zinc-power-guard
tmp=$(mktemp -d); pid=0
trap '[ $pid -gt 0 ] && kill $pid 2>/dev/null; rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/sys/class/hwmon/hwmon0" "$tmp/sys/class/hwmon/hwmon1" "$tmp/sys/devices/system/cpu/cpufreq/policy0"
printf '#!/bin/sh\necho "$*" >> %s/log\n' "$tmp" > "$tmp/bin/logger"; chmod +x "$tmp/bin/logger"
echo cpu_thermal > "$tmp/sys/class/hwmon/hwmon0/name"; echo rpi_volt > "$tmp/sys/class/hwmon/hwmon1/name"
alarm=$tmp/sys/class/hwmon/hwmon1/in0_lcrit_alarm; echo 0 > "$alarm"
p=$tmp/sys/devices/system/cpu/cpufreq/policy0
echo 1400000 > "$p/cpuinfo_max_freq"; echo 600000 > "$p/cpuinfo_min_freq"; echo 1400000 > "$p/scaling_max_freq"
fail=0
no() { echo "pi power guard: $1"; fail=1; }
run() { exec env PATH="$tmp/bin:$PATH" ZINC_POWER_SYSFS="$tmp/sys" ZINC_POWER_CONF="$tmp/session.conf" ZINC_POWER_POLL_MS=100 ZINC_POWER_HOLD_MS=600 "$@" /bin/bash "$guard"; }
max() { cat "$p/scaling_max_freq"; }
wait_max() { n=0; while [ "$(max)" != "$1" ]; do n=$((n + 1)); [ $n -gt 60 ] && return 1; sleep 0.1; done; }

run & pid=$!
sleep 0.4; [ "$(max)" = 1400000 ] || no "capped without an alarm"
echo 1 > "$alarm"
wait_max 700000 || no "the alarm did not cap the CPU at 700000 (is $(max))"
sleep 1; echo 0 > "$alarm"; sleep 0.3
[ "$(max)" = 700000 ] || no "the cap was lifted before the hold time"
wait_max 1400000 || no "the old maximum did not come back after the hold time"
grep -q 'under-voltage: CPU maximum lowered to 700000' "$tmp/log" || no "the cap was not logged"
grep -q 'CPU maximum back to 1400000' "$tmp/log" || no "the restore was not logged"
kill $pid 2>/dev/null; pid=0

# a TERM while capped puts the maximum back
echo 1 > "$alarm"; run & pid=$!; wait_max 700000 || no "second run did not cap"; sleep 0.3
kill -TERM $pid; wait $pid 2>/dev/null; pid=0
[ "$(max)" = 1400000 ] || no "TERM left the cap"

# opt-out, in the conf and in the environment
echo 1 > "$alarm"; echo 'ZINC_POWER_GUARD=0' > "$tmp/session.conf"
(run ZINC_POWER_TICKS=5) || no "opt-out exited with an error"
[ "$(max)" = 1400000 ] || no "ZINC_POWER_GUARD=0 in session.conf still capped"
: > "$tmp/session.conf"; (run ZINC_POWER_GUARD=0 ZINC_POWER_TICKS=5); [ "$(max)" = 1400000 ] || no "ZINC_POWER_GUARD=0 still capped"

# no sensor: quiet exit
echo cpu_thermal > "$tmp/sys/class/hwmon/hwmon1/name"; : > "$tmp/log"
(run ZINC_POWER_TICKS=5); [ $? = 0 ] && [ ! -s "$tmp/log" ] || no "no rpi_volt device: not a quiet exit"

# shipped files
u=image/files/etc/systemd/system/zinc-power-guard.service
grep -q '^ConditionPathExistsGlob=/sys/class/hwmon/hwmon\*/in0_lcrit_alarm' "$u" || no "the unit must not start without the alarm file"
grep -q '^ExecStart=/usr/lib/zinc/zinc-power-guard' "$u" || no "the unit does not run the script"
j=image/files/etc/systemd/journald.conf.d/zinc.conf
for k in Storage=persistent SystemMaxUse= SyncIntervalSec=5s; do grep -q "^$k" "$j" || no "journald drop-in lacks $k"; done
for k in "'zinc-power-guard':" "'zinc-power-guard.service':" "'zinc-journal.conf':"; do grep -q "$k" image/files/usr/lib/zinc/zinc-player-update || no "SYSTEM_FILES lacks $k"; done
grep -q 'zinc-journal.conf' tools/package && grep -q 'zinc-power-guard.service' tools/package || no "tools/package does not ship them"
grep -q 'zinc-power-guard.service' image/scripts/20-system.sh || no "the image does not enable the guard"
[ -x image/files/usr/lib/zinc/zinc-power-guard ] || no "the guard is not executable"
[ $fail = 0 ] && echo "pi power guard: ok"
exit $fail
