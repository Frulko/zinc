#!/bin/sh
# The inspector's pause (Zinc.setPaused, Zinc.stepFrame) on tests/data/inspector_pause, a dev run that counts its frames and a 10 ms interval.
# Paused: the counts and the clock stand still for 400 ms while the inspector answers (DOM.getDocument), the clients hear Zinc.pausedChanged, a
# capture leaves the badge out, and a class edit draws the frame again (its layout follows; one frame of dt 0, the interval and the clock still
# stopped). A step runs exactly one frame (1/60 s of the clock); resumed, the counts go on and (on the interpreter, whose clock is real time here)
# the clock goes on from where it stopped, not by
# the time paused. On the interpreter; a smoke check (the pause holds, a step is one frame, the resume) on AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
run() {   # run <full|smoke> [engine flags]: the target on a free port, then the probe
  mode=$1; shift
  port=$(python3 tests/free_ports.py)
  ZINC_DEV=1 ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 120 "$ZINC" run tests/data/inspector_pause "$@" > "$tmp/target.log" 2>&1 & target=$!
  n=0; while [ $n -lt $((1600 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/target.log"; do sleep 0.05; n=$((n+1)); done
  grep -q "localhost:$port)" "$tmp/target.log" || { echo "$*: the target does not listen on $port: $(head -c 600 "$tmp/target.log")"; fail=1; return; }
  python3 - "$port" "$mode" <<'P' || { echo "${*:-interpreter}: the pause failed"; fail=1; }
import importlib.machinery, importlib.util, sys, time, base64, re
l = importlib.machinery.SourceFileLoader("cp", "tools/cdp-probe"); sp = importlib.util.spec_from_loader("cp", l); cp = importlib.util.module_from_spec(sp); l.exec_module(cp)
l = importlib.machinery.SourceFileLoader("pd", "tools/pngdiff"); sp = importlib.util.spec_from_loader("pd", l); pd = importlib.util.module_from_spec(sp); l.exec_module(pd)
port, mode = int(sys.argv[1]), sys.argv[2]
def call(method, params={}, events=None): return cp.ws(port, "/zinc", [{"id": 1, "method": method, "params": params}], events)[0].get("result", {})
def nodes(n):
    yield n
    for k in n.get("children", []): yield from nodes(k)
def state():   # frames, ticks, clock and the rose box's node id, as the program shows them
    root = call("DOM.getDocument", {"depth": -1})["root"]
    t = next(n["nodeValue"] for n in nodes(root) if n.get("nodeValue", "").startswith("frames "))
    box = next(n["nodeId"] for n in nodes(root) if any("bg-rose-600" in a for a in n.get("attributes", [])))
    return [int(x) for x in re.findall(r"-?\d+", t)] + [box]
def check(ok, what):
    print(("ok: " if ok else "FAILED: ") + what)
    if not ok: check.bad = True
check.bad = False
time.sleep(0.6)
s0 = state(); time.sleep(0.2); s1 = state()
check(s1[0] > s0[0] and s1[1] > s0[1], "running: frames %d -> %d, ticks %d -> %d" % (s0[0], s1[0], s0[1], s1[1]))
ev = []
r = call("Zinc.setPaused", {"paused": True}, ev)
paused_at = time.time()
check(r.get("paused") is True and any(e.get("method") == "Zinc.pausedChanged" and e["params"]["paused"] for e in ev), "setPaused answers and Zinc.pausedChanged is sent")
a = state(); time.sleep(0.4); b = state()
check(a[:3] == b[:3], "paused 400 ms: %s -> %s" % (a[:3], b[:3]))
if mode == "full":
    png = base64.b64decode(call("Page.captureScreenshot")["data"])
    import tempfile, os
    f = tempfile.NamedTemporaryFile(suffix=".png", delete=False); f.write(png); f.close()
    w, h, bpp, d = pd.dec(f.name); os.unlink(f.name)
    amber = sum(1 for y in range(min(h, 60)) for x in range(w) if tuple(d[(y * w + x) * bpp: (y * w + x) * bpp + 3]) == (0xfb, 0xbf, 0x24))
    check(amber == 0, "the badge is not in a capture (%d amber pixels)" % amber)
    w0 = call("DOM.getBoxModel", {"nodeId": b[3]})["model"]["width"]
    call("DOM.setAttributeValue", {"nodeId": b[3], "name": "class", "value": "w-8 h-4 bg-rose-600"})
    time.sleep(0.3)
    c = state()
    w1 = call("DOM.getBoxModel", {"nodeId": c[3]})["model"]["width"]
    check(w0 == 16 and w1 == 32, "an edit while paused is laid out and drawn: width %s -> %s" % (w0, w1))
    check(c[0] == b[0] + 1 and c[1:3] == b[1:3], "the edit's frame: one frame of dt 0, interval and clock still: %s -> %s" % (b[:3], c[:3]))
    b = c
time.sleep(0.2)
call("Zinc.stepFrame")
time.sleep(0.3)
s = state()
check(s[0] == b[0] + 1 and 1 <= s[1] - b[1] <= 2 and 16 <= s[2] - b[2] <= 17, "a step is one frame of 1/60 s: %s -> %s" % (b[:3], s[:3]))
time.sleep(0.2)
check(state()[:3] == s[:3], "paused again after the step")
r = call("Zinc.setPaused", {"paused": False})
resumed = time.time()
time.sleep(0.5)
g = state()
since = (time.time() - resumed) * 1000
check(r.get("paused") is False and g[0] > s[0] + 5 and g[1] > s[1], "resumed: frames %d -> %d, ticks %d -> %d" % (s[0], g[0], s[1], g[1]))
check(mode != "full" or g[2] - s[2] <= since + 100, "the clock goes on from where it stopped: +%d ms in %d ms since the resume (paused %d ms)" % (g[2] - s[2], since, (resumed - paused_at) * 1000))
sys.exit(1 if check.bad else 0)
P
  kill $target 2>/dev/null; wait $target 2>/dev/null
}
run full
run smoke --native
run smoke --engine quickjs
exit $fail
