#!/bin/sh
# reMarkable display lease (ZN-833): integrations/remarkable-ink/lease.c built with the host cc and driven against a fake systemd
# (tests/native/rmpp/lease-sim: systemctl and systemd-run shims over a model of xochitl.service with the stock 4/600 s start limit and a
# fake clock). The scripted sequence must end with xochitl active, no reboot, at most 2 of our starts in any 600 s, every refusal explained.
cd "$(dirname "$0")/../.." || exit 2
sim=$(pwd)/tests/native/rmpp/lease-sim
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cc -std=c11 -Wall -Wextra -Werror -O2 integrations/remarkable-ink/lease.c -o "$tmp/lease" || { echo "lease.c does not build"; exit 1; }
LEASE_SIM=$tmp LEASE_ROOT=$tmp/root LEASE_CLOCK=$tmp/clock LEASE_POWER_DEV=$tmp/power PATH="$sim:$PATH" \
  timeout 120 python3 "$sim/sim.py" run "$tmp/lease" > "$tmp/out" 2>&1
rc=$?
if [ $rc -eq 0 ]; then tail -1 "$tmp/out"; else cat "$tmp/out"; echo "--- journal"; tail -40 "$tmp/journal" 2>/dev/null; fi
# zinc export --target rmpp: the AppLoad manifest points at `lease launch` for "ink": "session", at the app itself otherwise.
# A zig that fails stops the export right after the manifest: no cross build on this machine.
for ink in session qtfb; do
  mkdir -p "$tmp/$ink/src"; echo 'console.log("hi");' > "$tmp/$ink/src/main.ts"
  printf '{ "name": "inkapp", "entry": "src/main.ts", "display": { "driver": "rmpp", "ink": "%s" } }\n' $ink > "$tmp/$ink/zinc.json"
  ZINC_ZIG=/usr/bin/false "$ZINC" export "$tmp/$ink" --target rmpp >/dev/null 2>&1
  python3 - "$tmp/$ink/dist/inkapp-rmpp/external.manifest.json" $ink <<'PY' || rc=1
import json, sys
m, ink = json.load(open(sys.argv[1])), sys.argv[2]
want = {'application': 'launch.sh', 'qtfb': False} if ink == 'session' else {'application': 'inkapp', 'qtfb': True}
bad = {k: m.get(k) for k in want if m.get(k) != want[k]}
d = sys.argv[1].rsplit('/', 1)[0]
if open(f'{d}/icon.png', 'rb').read(8) != b'\x89PNG\r\n\x1a\n': bad['icon.png'] = 'not a PNG'
deploy = open(f'{d}/deploy.sh').read()
shipped = all(f'"$D/{f}"' in deploy for f in ('launch.sh', 'lease', 'libquill.so'))
if shipped != (ink == 'session') or '/home/root/xovi/exthome/appload/inkapp' not in deploy: bad['deploy.sh'] = deploy
# the launcher: libquill.so and the vendor engine on the library path, the lease with the app watchdog and the tablet's hash when models.h verified it
if ink == 'session':
    launch = open(f'{d}/launch.sh').read()
    for part in ('LD_LIBRARY_PATH="$D:/usr/lib/plugins/scenegraph"', 'exec "$D/lease" launch --watchdog 10 --vendor-sha256 "$V" "$D/inkapp"',
                 'case "$V" in 3800e9f3d01f40fa3f5cc96ca49bcd982471ce5b033320f8788707520c8ddd08|07aa9327f725288a5df5aebc33ea4b151c27d97d3b850279947ddddf3dd8ddec) ;;'):
        if part not in launch: bad['launch.sh'] = launch
print(f'export manifest ({ink}): ' + ('ok' if not bad else f'FAIL {bad}'))
sys.exit(1 if bad else 0)
PY
done
exit $rc
