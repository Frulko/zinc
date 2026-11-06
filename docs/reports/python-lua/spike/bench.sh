#!/bin/bash
# The study's measure (03-static-front-end.md): one kernel at a time, best of 3, on each engine. bench.sh <work dir> [zinc]
set -u
W=$1; Z=${2:-$(cd "$(dirname "$0")/../../../.." && pwd)/build/zinc}; D=$(cd "$(dirname "$0")" && pwd); mkdir -p "$W"; cd "$W"
export ZINC_HEADLESS=1
best() { local b=999999; for i in 1 2 3; do local s=$(python3 -c 'import time;print(time.time())'); "$@" >/dev/null 2>&1 || { echo FAIL; return; }; local e=$(python3 -c 'import time;print(time.time())'); b=$(python3 -c "print(min($b,($e-$s)*1000))"); done; printf '%.0f' "$b"; }
for k in 'fib(32)' 'mandelbrot()' 'nbody(600000)'; do
  n=${k%%(*}
  python3 - "$D" "$k" "$n" <<'P'
import re,sys
d,k,n=sys.argv[1:]
py=open(d+'/samples/kernels.py').read(); py=py[:py.index('if __name__')]+'if __name__ == "__main__":\n    print(%s)\n'%k; open(n+'.py','w').write(py)
lu=open(d+'/samples/kernels.lua').read(); lu=lu[:lu.index('print(fib(32))')]+'print(%s)\n'%k; open(n+'.lua','w').write(lu)
P
  mkdir -p p$n l$n; python3 "$D/pyzn.py" $n.py > p$n/main.ts; python3 "$D/luazn.py" $n.lua > l$n/main.ts
  "$Z" build p$n/main.ts -o p$n/app >/dev/null 2>&1 || echo "build fail p$n"; "$Z" build l$n/main.ts -o l$n/app >/dev/null 2>&1 || echo "build fail l$n"
  echo "$n cpython $(best python3 $n.py)"
  echo "$n lua $(best lua $n.lua)"
  echo "$n luajit $(best luajit $n.lua)"
  echo "$n py-zinc-interp $(best "$Z" run p$n/main.ts)"
  echo "$n py-zinc-aot $(best p$n/app)"
  echo "$n lua-zinc-interp $(best "$Z" run l$n/main.ts)"
  echo "$n lua-zinc-aot $(best l$n/app)"
  echo "$n py-zinc-quickjs $(best "$Z" run p$n/main.ts --engine quickjs)"
  echo "$n out: py=$(python3 $n.py) lua=$(lua $n.lua) zinc=$(p$n/app | tail -1) zlua=$(l$n/app | tail -1)"
done
mkdir -p dyn; python3 "$D/pyzn.py" "$D/samples/dynamic.py" > dyn/main.ts; "$Z" build dyn/main.ts -o dyn/app >/dev/null 2>&1 || echo "build fail dyn"
echo "fib-any py-zinc-interp $(best "$Z" run dyn/main.ts)"; echo "fib-any py-zinc-aot $(best dyn/app)"; ls -la dyn/app pfib/app | awk '{print $5,$9}'; uptime
