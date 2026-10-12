#!/bin/sh
# `zinc device deploy` builds for the device (ZN-729.08), on the loopback interface, with three agents: one of this machine and two that
# say they are another one (ZINC_AGENT_AS, the agent's test switch). The .zapp for the same machine; `rpi` and the framebuffer chosen for
# an agent that says it is a Raspberry Pi (on a directory that is no project, so the export stops at once: nothing is cross built here);
# a device zinc export has no target for is refused by name; --pack forces the .zapp; --target forces the export, and that one runs for
# real: `zinc export` for this machine's own target, its directory installed, the app started, its log read. macOS only (77 elsewhere:
# the export that stands in is `--target macos`).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname -s)" = Darwin ] || exit 77
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
W="$tmp/work" fail=0 pids=
dev() { ZINC_HOME="$W" timeout 120 "$Z" device "$@"; }
bad() { echo "FAIL: $*"; fail=1; }
cleanup() {
  for f in "$tmp"/dev-*/agent/run/*.pid; do [ -e "$f" ] && kill -- "-$(cat "$f")" 2>/dev/null; done   # apps outlive their agent
  [ -n "$pids" ] && { kill $pids 2>/dev/null; wait $pids 2>/dev/null; }
  rm -rf "$tmp"
}
trap cleanup EXIT
until_grep() { n=0; while [ $n -lt 100 ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.1; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }
# the app's log once it has ended, in $tmp/log
ended_log() { n=0; while [ $n -lt 100 ] && ! dev "$1" logs "$2" 2>/dev/null | grep -q '^\[exited'; do sleep 0.1; n=$((n+1)); done; dev "$1" logs "$2" > "$tmp/log" 2>&1; }

for who in same pi odd; do
  case $who in same) as=;; pi) as="linux aarch64 Raspberry Pi 3 Model B Plus Rev 1.3";; odd) as="linux riscv64";; esac
  # env -u: an agent under tests/run would hand ZINC_DETERMINISTIC to the apps it starts
  ZINC_HOME="$tmp/dev-$who" SHELL=/bin/sh ZINC_AGENT_AS="$as" env -u ZINC_DETERMINISTIC "$Z" agent --bind 127.0.0.1 --port 0 --no-mdns --name "$who" > "$tmp/agent-$who.log" 2>&1 &
  pids="$pids $!"
  until_grep "pairing code" "$tmp/agent-$who.log" || { echo "the agent $who did not start: $(cat "$tmp/agent-$who.log")"; exit 1; }
  port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent-$who.log")
  dev pair "127.0.0.1:$port" "$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent-$who.log")" > /dev/null || { echo "pairing with $who failed"; exit 1; }
done

ZINC_HOME="$W" "$Z" new cli "$tmp/cli" > /dev/null || exit 2
want=$(cd "$tmp/cli" && ZINC_HOME="$W" "$Z" run . 2>/dev/null | head -1)
[ -n "$want" ] || { echo "the project prints nothing"; exit 2; }

# the same system and architecture: the .zapp, and the line that says why
out=$(dev same deploy "$tmp/cli" --no-logs 2>&1) || bad "deploy to the same machine: $out"
echo "$out" | grep -q "^same is macos .*, as this machine: packing a \.zapp$" || bad "the same machine: no line for the .zapp: $out"
dev same apps | grep -q "^cli .*zapp" || bad "the same machine did not get a .zapp: $(dev same apps)"

# a Raspberry Pi: the export for rpi, on its framebuffer when the project names no display (the export itself stops: no project there)
mkdir -p "$tmp/empty" "$tmp/named"
printf '{"name":"named","targets":{"linux":{"display":"gl"}}}\n' > "$tmp/named/zinc.json"
out=$(dev pi deploy "$tmp/empty" --no-logs 2>&1) && bad "a directory that is no project was deployed: $out"
echo "$out" | grep -q "^pi is linux aarch64 (Raspberry Pi 3 Model B Plus Rev 1.3): exporting for rpi, shown on its framebuffer (ZINC_DISPLAY=fbdev" || bad "the Pi: no line for the rpi export on the framebuffer: $out"
out=$(dev pi deploy "$tmp/named" --no-logs 2>&1)
echo "$out" | grep -q "^pi is linux aarch64 (.*): exporting for rpi$" || bad "the Pi, a project with its display: $out"
out=$(ZINC_HOME="$W" ZINC_DISPLAY=gl "$Z" device pi deploy "$tmp/empty" --no-logs 2>&1)
echo "$out" | grep -q ": exporting for rpi$" || bad "the Pi, ZINC_DISPLAY given: $out"
[ -z "$(dev pi apps)" ] || bad "the Pi got an app: $(dev pi apps)"

# a machine zinc export has no target for: refused, by its name
out=$(dev odd deploy "$tmp/cli" --no-logs 2>&1) && bad "a riscv64 device was deployed to: $out"
echo "$out" | grep -q "^zinc device: odd is linux riscv64: zinc export has no target for it" || bad "the refusal does not name the device's system: $out"
[ -z "$(dev odd apps)" ] || bad "the refused device got an app: $(dev odd apps)"
out=$(dev odd deploy "$tmp/cli" --pack --target macos --no-logs 2>&1) && bad "--pack with --target was taken: $out"

# --pack: the .zapp whatever the device says
out=$(dev odd deploy "$tmp/cli" --pack --no-logs 2>&1) || bad "deploy --pack: $out"
echo "$out" | grep -q "^--pack: packing a \.zapp$" || bad "--pack: no line: $out"
dev odd apps | grep -q "^cli .*zapp" || bad "--pack did not install a .zapp: $(dev odd apps)"

# --target: the export, for real (this machine's own target stands in for the device's): built, installed as a directory, started, its log read
out=$(dev odd deploy "$tmp/cli" --target macos --no-logs 2>&1) || bad "deploy --target macos: $out"
echo "$out" | grep -q "^--target macos: exporting for macos$" || bad "--target: no line: $out"
echo "$out" | grep -q "^installed cli on odd" || bad "the export was not installed under the project's name: $out"
[ -x "$tmp/cli/dist/cli-macos/run.sh" ] || bad "the export is not in the project's dist/"
dev odd apps | grep -q "^cli .*export" || bad "the device does not hold an export: $(dev odd apps)"
ended_log odd cli
grep -qF "$want" "$tmp/log" && grep -q '^\[exited 0\]' "$tmp/log" || bad "the log of the exported app lacks its output '$want' or its exit: $(cat "$tmp/log")"

[ $fail -eq 0 ] && echo "agent_deploy: ok"
exit $fail
