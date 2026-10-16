#!/bin/bash
# frames.sh zinc EXE | flutter EXE : per-frame CPU work (ms) of the four screens, 300 frames each, windowed.
#   zinc:    ZINC_PROFILE=1 prints "work" = app + layout + paint + diff of a frame (GPU submit not included).
#   flutter: the app prints FrameTiming.totalSpan (build + raster, vsync to raster done) with PC_REPORT=1.
# The two numbers are close in meaning, not identical: read them as "how much of a 16.7 ms frame is used".
set -u
kind="$1"; exe="$2"
export ZINC_BACKGROUND=1
for m in hello list anim input; do
  while [ "$(sysctl -n vm.loadavg | awk '{print int($2)}')" -ge 4 ]; do sleep 5; done
  if [ "$kind" = zinc ]; then
    echo -n "zinc/$m  "; ZINC_DEMO=$m ZINC_PROFILE=1 ZINC_FRAMES=300 "$exe" 2>&1 | grep -m1 'work p50'
  else
    echo -n "flutter/$m  "; PC_DEMO=$m PC_REPORT=1 timeout 15 "$exe" 2>&1 | grep -m1 "frame total" || echo "no frames (idle: nothing to draw)"
  fi
done
