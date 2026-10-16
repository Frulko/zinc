#!/bin/bash
# run.sh NAME PATH-TO-EXECUTABLE [modes...]   (modes default: hello list anim input)
# Runs measure.py once per mode, one at a time, after the 1-minute load average is under 4.
# Zinc reads ZINC_DEMO, Flutter / RN read PC_DEMO: both are set here. Output: one JSON line per mode.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
name="$1"; exe="$2"; shift 2
modes=("$@"); [ ${#modes[@]} -eq 0 ] && modes=(hello list anim input)
export ZINC_BACKGROUND=1
for m in "${modes[@]}"; do
  while :; do
    load=$(sysctl -n vm.loadavg | awk '{print int($2)}')
    [ "$load" -lt 4 ] && break
    sleep 5
  done
  ZINC_DEMO=$m PC_DEMO=$m python3 "$here/measure.py" --runs 5 --secs 10 "$name/$m" -- "$exe"
done
