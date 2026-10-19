#!/usr/bin/env python3
"""A scripted VS Code for zinc debug --dap (ZN-371.02): python3 tests/dap_check.py <zinc> <program.ts> [--bad], on tests/data/debug_cli/main.ts;
--bad: a program that does not compile, whose launch fails with the diagnostic in an output event; --pause: a running loop (loop.ts) stops at
the pause button, shows where, and disconnect ends it.
Launches, sets a breakpoint on the loop's line, stops there, reads the stack, the scopes and the locals (and a Point's fields), steps into add,
over its lines, out of it, sets the breakpoint again by evaluate-free means, continues to the end and reads the program's output events.
Prints one line per check; exit 1 when one fails."""
import json, os, subprocess, sys, threading, queue

zinc, program = sys.argv[1], os.path.abspath(sys.argv[2])
p = subprocess.Popen([zinc, "debug", "--dap"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
inbox = queue.Queue()

def read():
    while True:
        head = b""
        while not head.endswith(b"\r\n\r\n"):
            c = p.stdout.read(1)
            if not c: inbox.put(None); return
            head += c
        n = int([l for l in head.decode().split("\r\n") if l.startswith("Content-Length:")][0].split(":")[1])
        inbox.put(json.loads(p.stdout.read(n)))
threading.Thread(target=read, daemon=True).start()

seq, events, failed = 0, [], False
def check(ok, what):
    global failed
    print(("ok   " if ok else "FAIL ") + what)
    failed = failed or not ok

def request(command, **args):
    global seq
    seq += 1
    body = json.dumps({"seq": seq, "type": "request", "command": command, "arguments": args}).encode()
    p.stdin.write(b"Content-Length: %d\r\n\r\n" % len(body) + body)
    p.stdin.flush()
    while True:
        m = inbox.get(timeout=30)
        if m is None: raise SystemExit("the adapter ended")
        if m["type"] == "event": events.append(m); continue
        if m["request_seq"] == seq: return m

def wait_event(name):
    for e in events:
        if e["event"] == name: events.remove(e); return e
    while True:
        m = inbox.get(timeout=30)
        if m is None: raise SystemExit("the adapter ended before " + name)
        if m["type"] == "event" and m["event"] == name: return m
        if m["type"] == "event": events.append(m)

def frames():
    return request("stackTrace", threadId=1)["body"]["stackFrames"]

def local_vars(frame=0):
    ref = request("scopes", frameId=frame)["body"]["scopes"][0]["variablesReference"]
    return {v["name"]: v for v in request("variables", variablesReference=ref)["body"]["variables"]}

r = request("initialize", clientID="test", adapterID="zinc", linesStartAt1=True, columnsStartAt1=True)
check(r["success"] and r["body"].get("supportsConfigurationDoneRequest"), "initialize")
if "--bad" in sys.argv:
    r = request("launch", program=program)
    wait_event("terminated")
    err = "".join(e["body"]["output"] for e in events if e["event"] == "output" and e["body"]["category"] == "stderr")
    check(not r["success"] and "Z" in err, "launch fails, the diagnostic in an output event: %r" % err[:120])
    p.wait(timeout=10)
    sys.exit(1 if failed else 0)
if "--exprs" in sys.argv:   # exprs.ts (ZN-371.05): a condition, a logpoint, evaluate, a closure's scope, the pause on an uncaught exception
    request("launch", program=program)
    wait_event("initialized")
    request("setExceptionBreakpoints", filters=["uncaught"])
    bps = request("setBreakpoints", source={"path": program}, breakpoints=[{"line": 10, "condition": "i == 2"}, {"line": 11, "logMessage": "box {b.label} is {b.size}"}, {"line": 20}])["body"]["breakpoints"]
    check(all(b["verified"] for b in bps), "a conditional breakpoint, a logpoint and a plain one")
    request("configurationDone")
    e = wait_event("stopped")
    check(e["body"]["reason"] == "breakpoint" and local_vars()["i"]["value"] == "2", "the condition i == 2: stopped when it holds")
    logs = [x["body"]["output"] for x in events if x["event"] == "output" and x["body"]["category"] == "console"]
    check(logs == ["box a is 11\n", "box b is 12\n"], "the logpoint printed without stopping: %r" % logs)
    ev = request("evaluate", expression="b.size * 2 > 20", frameId=0, context="watch")
    check(ev["success"] and ev["body"]["result"] == "false" and ev["body"]["type"] == "boolean", "evaluate b.size * 2 > 20: boolean false")
    ev = request("evaluate", expression="b.label * 2", frameId=0, context="watch")
    check(not ev["success"] and "Z0107" in ev.get("message", ""), "a type error is reported: %s" % ev.get("message"))
    request("continue", threadId=1)
    wait_event("stopped")
    scopes = request("scopes", frameId=0)["body"]["scopes"]
    clos = [s for s in scopes if s["name"] == "Closure"]
    cv = {v["name"]: v["value"] for v in request("variables", variablesReference=clos[0]["variablesReference"])["body"]["variables"]} if clos else {}
    check(cv.get("n") == "5", "the arrow function's Closure scope: %s" % cv)
    request("setBreakpoints", source={"path": program}, breakpoints=[])
    request("continue", threadId=1)
    e = wait_event("stopped")
    check(e["body"]["reason"] == "exception" and "done with 1 call" in e["body"].get("text", "") and frames()[0]["line"] == 30, "stopped on the uncaught exception at its throw: %s" % e["body"].get("text"))
    request("disconnect")
    p.wait(timeout=10)
    sys.exit(1 if failed else 0)
if "--pause" in sys.argv:
    request("launch", program=program)
    wait_event("initialized")
    request("configurationDone")
    import time; time.sleep(0.5)
    check(request("pause", threadId=1)["success"], "pause while it runs")
    e = wait_event("stopped")
    fr = frames()
    check(e["body"]["reason"] == "pause" and fr[0]["line"] in (3, 4), "stopped: pause, in the loop (line %d)" % fr[0]["line"])
    check(int(local_vars()["i"]["value"]) > 0, "the loop's index has moved")
    request("disconnect")
    p.wait(timeout=10)
    sys.exit(1 if failed else 0)
r = request("launch", program=program, stopOnEntry=False)
check(r["success"], "launch: %s" % r.get("message", "ok"))
wait_event("initialized")
r = request("setBreakpoints", source={"path": program}, breakpoints=[{"line": 19}, {"line": 99}])
bps = r["body"]["breakpoints"]
check(bps[0]["verified"] and bps[0]["line"] == 19 and not bps[1]["verified"], "setBreakpoints: line 19 verified, 99 not (%s)" % bps)
check(request("configurationDone")["success"], "configurationDone")
e = wait_event("stopped")
check(e["body"]["reason"] == "breakpoint", "stopped at the breakpoint (%s)" % e["body"]["reason"])
check(request("threads")["body"]["threads"][0]["id"] == 1, "threads")
fr = frames()
check([(f["name"], f["line"]) for f in fr] == [("run", 19), ("<top level>", 24)] and fr[0]["source"]["path"] == program, "stackTrace: %s" % [(f["name"], f["line"]) for f in fr])
lv = local_vars()
check(lv["total"]["value"] == "0" and lv["name"]["value"] == '"zinc"' and lv["v"]["value"] == "1", "locals: total 0, name \"zinc\", v 1")
pt = lv["p"]
fields = {v["name"]: v["value"] for v in request("variables", variablesReference=pt["variablesReference"])["body"]["variables"]}
check(pt["type"] == "Point" and pt["variablesReference"] > 0 and fields == {"x": "1", "y": "2"}, "p expands to its fields: %s" % fields)
items = [v["value"] for v in request("variables", variablesReference=lv["list"]["variablesReference"])["body"]["variables"]]
check(items == ["1", "2", "3"], "list expands to its elements: %s" % items)
ev = request("evaluate", expression="total", frameId=0)
check(ev["success"] and ev["body"]["result"] == "0", "evaluate total")
request("stepIn", threadId=1)
wait_event("stopped")
fr = frames()
check([(f["name"], f["line"]) for f in fr][:2] == [("add", 9), ("run", 19)], "stepIn: in add at line 9")
request("next", threadId=1)
e = wait_event("stopped")
check(e["body"]["reason"] == "step" and frames()[0]["line"] == 10, "next: line 10")
check(local_vars()["sum"]["value"] == "1", "sum is 1 after its line")
request("stepOut", threadId=1)
wait_event("stopped")
fr = frames()
check(fr[0]["name"] == "run" and fr[0]["line"] == 19, "stepOut: back in run (stopped at the loop's next turn: the breakpoint)")
r = request("setBreakpoints", source={"path": program}, breakpoints=[])
check(r["success"] and r["body"]["breakpoints"] == [], "breakpoints cleared")
request("continue", threadId=1)
wait_event("terminated")
out = "".join(e["body"]["output"] for e in events if e["event"] == "output" and e["body"]["category"] == "stdout")
check("zinc 6 1\ndone" in out, "the program's output as output events: %r" % out)
try: request("disconnect")
except (SystemExit, BrokenPipeError): pass   # the adapter may already have ended after "terminated"
p.wait(timeout=10)
sys.exit(1 if failed else 0)
