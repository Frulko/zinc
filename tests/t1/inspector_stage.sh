#!/bin/sh
# The Zinc Inspector on a zinc:stage program: tests/data/inspector_stage (a dev run, ZINC_DEV=1) under app/inspector's ZINC_INSPECTOR_DUMP=elements.
# Elements shows the display tree with each node's class (the program's own GameManager and Box) and name, its properties (alpha, which
# only Box declares), "rendered only" leaves the hidden node out, and an edit of x moves the node's box and changes the program's frame.
# The tree follows the program live (a node it adds and one it removes, the selected node's values), a node turned about its pivot has a
# turned box, and a zinc:ui interface with the scene in a <Canvas> (src/hybrid.tsx) shows both trees, the scene's box in window coordinates.
# Then a scripted client (probe): a point of the window picks the turned node (DOM.getNodeForLocation, the pick mode's hit test), a node the
# program renames and hides is pushed without being selected, and in the hybrid program the highlight is drawn over a zinc:ui box that
# covers the scene, and a point picks the scene's node or that box.
# What a node shows: a Label's text as its inline text child, edited in place (the program draws it, and its own change is pushed), a
# Picture's texture name as src.
# The devtools line names the port the system chose for ZINC_DEVTOOLS_PORT=0, on QuickJS too.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
inspect() {   # inspect <entry> [probe]: the target on a free port, the inspector's dump (and the probe's lines) in $tmp/dump
  port=$(python3 tests/free_ports.py)
  ZINC_DEV=1 ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 60 "$ZINC" run "$1" > "$tmp/target.log" 2>&1 & target=$!
  n=0; while [ $n -lt $((400 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/target.log"; do sleep 0.05; n=$((n+1)); done
  grep -q "localhost:$port)" "$tmp/target.log" || { echo "the target does not listen on $port: $(cat "$tmp/target.log")"; exit 1; }
  ZINC_INSPECTOR_DUMP=elements ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run app/inspector/main.tsx -- "$port" > "$tmp/dump" 2>&1 ||
    { echo "the inspector failed: $(head -c 600 "$tmp/dump")"; exit 1; }
  [ -z "$2" ] || python3 - "$port" "$2" "$tmp" >> "$tmp/dump" 2>&1 <<'P' || { echo "probe $2 failed: $(tail -5 "$tmp/dump")"; fail=1; }
import importlib.machinery, importlib.util, json, sys, time, base64, subprocess
l = importlib.machinery.SourceFileLoader("cp", "tools/cdp-probe"); sp = importlib.util.spec_from_loader("cp", l); cp = importlib.util.module_from_spec(sp); l.exec_module(cp)
port, mode, tmp = int(sys.argv[1]), sys.argv[2], sys.argv[3]
def call(method, params={}, until=None, events=None):
    r = cp.ws(port, "/zinc", [{"id": 1, "method": "DOM.getDocument", "params": {"depth": -1}}, {"id": 2, "method": method, "params": params}], events, until)
    return r[0]["result"]["root"], r[1]
def find(n, pick):
    if pick(n): return n
    for k in n.get("children", []):
        f = find(k, pick)
        if f: return f
def named(root, nm): a = find(root, lambda n: nm in n.get("attributes", [])[2:4]); return a["nodeId"] if a else -1
def at(x, y):
    root, r = call("DOM.getNodeForLocation", {"x": x, "y": y})
    n = find(root, lambda n: n.get("nodeId") == r.get("result", {}).get("nodeId"))
    return n["nodeName"] + ("#" + n["attributes"][3] if n and "stage" in n.get("attributes", []) else "") if n else "none"
if mode == "stage":
    root, _ = call("DOM.getDocument")
    ball, tag = named(root, "ball"), named(root, "tag")
    ev = []
    def pushed(e):
        m = [x["params"] for x in e if x.get("method") == "DOM.attributeModified" and x["params"]["nodeId"] == tag]
        t = [x["params"] for x in e if x.get("method") == "DOM.characterDataModified"]
        return any(x["name"] == "name" and x["value"] == "renamed" for x in m) and any(x["name"] == "visible" and x["value"] == "false" for x in m) and \
            any(x["characterData"] == "Score: 1" for x in t)
    call("DOM.setAttributeValue", {"nodeId": ball, "name": "x", "value": "300"}, pushed, ev)
    print("pushed without selection: name renamed, visible false, text Score: 1")
    print("pick turned:", at(200, 85), "| beside it:", at(215, 100))
else:
    root, _ = call("DOM.getDocument")
    ball = named(root, "ball")
    def shot(name):
        time.sleep(0.4)
        _, r = call("Page.captureScreenshot")
        open(tmp + "/" + name, "wb").write(base64.b64decode(r["result"]["data"]))
    call("Overlay.hideHighlight"); shot("plain.png")
    call("Overlay.highlightNode", {"nodeId": ball, "highlightConfig": {}}); shot("lit.png")
    over = subprocess.run(["python3", "tools/pngdiff", tmp + "/plain.png", tmp + "/lit.png", "--crop", "160,52,40,24"], capture_output=True).returncode == 1
    print("highlight over the covering box:", over)
    print("pick in the scene:", at(180, 84), "| on the box:", at(170, 60))
P
  kill $target 2>/dev/null; wait $target 2>/dev/null
}
want() { grep -qF -- "$1" "$tmp/dump" || { echo "missing in the inspector's views: $1"; fail=1; }; }
section() { awk -v s="$1:" '$0 == s { on = 1; next } /^[a-z].*:/ { on = 0 } on' "$tmp/dump"; }
inspect tests/data/inspector_stage stage
want '  <Stage name="Stage">'
want '    <GameManager name="game">'
want '      <Box name="ball">'
section elements | grep -qF 'ghost' && { echo "rendered only shows the hidden node"; fail=1; }
section "elements, all" | grep -qF '<Box name="ghost" hidden>' || { echo "without rendered only, the hidden node is missing"; fail=1; }
want 'stage node: <Box name="ball"> name=ball x=40 y=30 width=50 height=40 alpha=1 visible=true children=0 | box 50 × 40'
want 'dev run: true'
want 'stage edit: x 40 -> 140, box left 40 -> 140 | frame changed: true'
want 'bad edit: alpha is a number'
want 'live: spark inserted, ghost removed true | selected y follows true'
want 'turned: <Spin name="spin"> quad 210,80,210,120,190,120,190,80 | 40 × 20'
want 'stage image: <Picture name="pic" src="ball.png"></Picture>'
want 'stage text: <Label name="score">Score: 0</Label>'
want 'stage text edit: program text true | frame changed: true'
want 'pushed without selection: name renamed, visible false, text Score: 1'
want 'pick turned: Spin#spin | beside it: GameManager#game'
[ $fail = 0 ] || { echo "--- dump:"; head -c 3000 "$tmp/dump"; }
inspect tests/data/inspector_stage/src/hybrid.tsx hybrid
section elements | grep -A1 -F '<Canvas className="w-64 h-40">' | tail -1 | grep -qF '<Stage name="Stage">' || { echo "the scene is not under its Canvas"; fail=1; }
want '<Text className="text-sm">'
want 'stage edit: x 40 -> 140, box left 56 -> 156 | frame changed: true'
want 'highlight over the covering box: True'
want 'pick in the scene: Box#ball | on the box: '
grep -q 'on the box: Box\|on the box: none\|on the box: CANVAS' "$tmp/dump" && { echo "a point on the covering box picks the scene"; fail=1; }
[ $fail = 0 ] || { echo "--- hybrid dump:"; head -c 3000 "$tmp/dump"; }
# the real port of ZINC_DEVTOOLS_PORT=0 on QuickJS
ZINC_DEVTOOLS_PORT=0 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 30 "$ZINC" run tests/data/inspector_stage --engine quickjs > "$tmp/qjs.log" 2>&1 & target=$!
n=0; while [ $n -lt $((400 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/qjs.log"; do sleep 0.05; n=$((n+1)); done
grep -q "localhost:[1-9][0-9]*)" "$tmp/qjs.log" || { echo "QuickJS does not name the port it listens on: $(cat "$tmp/qjs.log")"; fail=1; }
exit $fail
