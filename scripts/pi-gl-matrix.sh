#!/bin/bash
# bounded GPU matrix, from ~/glv: every run under timeout -s KILL 60, GPU reset counter checked around it, the whole
# sequence stops at the first run that increases it. logs /tmp/pb_<name>.log, progress ~/glv/pb.progress
cd ~/glv; rm -f /tmp/pb_*.log pb.progress
resets() { dmesg | grep -c "Resetting GPU"; }
run() { # name prog envs...
  local name=$1 prog=$2; shift 2
  while [ "$(vcgencmd measure_temp | tr -dc '0-9.' | cut -d. -f1)" -ge 62 ]; do sleep 5; done
  local r0=$(resets) s e
  { echo "thr_before=$(vcgencmd get_throttled) temp=$(vcgencmd measure_temp) resets=$r0"; } > /tmp/pb_$name.log
  s=$(date +%s.%N)
  { time timeout -s KILL 60 env ZINC_FRAMES=600 ZINC_PROFILE=1 "$@" $prog ; } >> /tmp/pb_$name.log 2>&1
  e=$(date +%s.%N)
  awk -v s=$s -v e=$e 'BEGIN{printf "wall=%.2fs frames=600 fps=%.1f\n", e-s, 600/(e-s)}' >> /tmp/pb_$name.log
  local r1=$(resets)
  echo "thr_after=$(vcgencmd get_throttled) temp=$(vcgencmd measure_temp) resets=$r1" >> /tmp/pb_$name.log
  if [ "$r1" != "$r0" ]; then echo "$name HANG resets $r0 -> $r1: sequence aborted" >> pb.progress; echo ALLDONE >> pb.progress; exit 1; fi
  echo "$name ok" >> pb.progress
  sleep 10
}
G="ZINC_RENDERER=gl ZINC_GL_STATS=1"
# bisect on Kit (the screen that hung): old-equivalent, then + pipelined flip, + direct, + split
run b0_kit ./hero-gl8 $G ZINC_DEMO=kit ZINC_GL_DIRECT=0 ZINC_GL_SPLIT=0 ZINC_GL_PIPE=0
run b1_kit ./hero-gl8 $G ZINC_DEMO=kit ZINC_GL_DIRECT=0 ZINC_GL_SPLIT=0 ZINC_GL_PIPE=1
run b2_kit ./hero-gl8 $G ZINC_DEMO=kit ZINC_GL_DIRECT=2 ZINC_GL_SPLIT=0 ZINC_GL_PIPE=1
run b3_kit ./hero-gl8 $G ZINC_DEMO=kit ZINC_GL_DIRECT=2 ZINC_GL_SPLIT=1 ZINC_GL_PIPE=1
# full matrix: base (old behaviour), pipe, direct, split
for c in base:0:0:0 pipe:0:0:1 direct:2:0:1 split:2:1:1; do
  IFS=: read n d s p <<<"$c"
  X="ZINC_GL_DIRECT=$d ZINC_GL_SPLIT=$s ZINC_GL_PIPE=$p"
  run ${n}_sway ./gltest8 $G $X
  run ${n}_home ./hero-gl8 $G $X ZINC_DEMO=home
  [ $n != b ] && run ${n}_kit ./hero-gl8 $G $X ZINC_DEMO=kit
  run ${n}_forms ./hero-gl8 $G $X ZINC_DEMO=forms
  run ${n}_idle ./glcheck8 $G $X ZINC_SCENE=rects
done
run cpu_sway ./gltest8 ZINC_RENDERER=cpu ZINC_GL_PIPE=1 ZINC_GL_STATS=1
run cpu_home ./hero-gl8 ZINC_RENDERER=cpu ZINC_GL_PIPE=1 ZINC_DEMO=home
# last, on purpose: the damage-scissored replay (the suspect)
run dmg_kit ./hero-gl8 $G ZINC_DEMO=kit ZINC_GL_DIRECT=0 ZINC_GL_SPLIT=0 ZINC_GL_PIPE=0 ZINC_GL_DMG=1
echo ALLDONE >> pb.progress
