#!/usr/bin/env python3
"""measure.py: the same external measurements for any desktop app (macOS).

usage: measure.py [--runs N] [--secs S] [--json] NAME -- COMMAND [args...]
  environment: VAR=value words before COMMAND are not supported; export them in the shell.

What it records (one process tree, sampled with ps, window found with Quartz):
  start_ms     launch -> the process owns an on-screen window (median of --runs launches)
  rss_mb       resident set at the end of the run (median of the samples of the last half)
  cpu_pct      CPU time / wall time over the last half of the run (100 = one core)
  idle         the same, to be run on the 'hello' screen
Needs: python3 with pyobjc Quartz (ships with macOS system python? else `pip install pyobjc-framework-Quartz`).
The app must keep running by itself for --secs seconds (scripted scroll / animation / typing).
"""
import json, os, signal, statistics, subprocess, sys, time
import Quartz

def tree(pid):
    out = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,rss=,time="], capture_output=True, text=True).stdout
    rows = {}
    for l in out.splitlines():
        p = l.split()
        if len(p) == 4: rows[int(p[0])] = (int(p[1]), int(p[2]), p[3])
    keep, grow = {pid}, True
    while grow:
        grow = False
        for k, (pp, _, _) in rows.items():
            if pp in keep and k not in keep: keep.add(k); grow = True
    return keep, rows

def cpu_s(t):                       # ps TIME: [dd-]hh:mm:ss.cc or mm:ss.cc
    d = 0
    if "-" in t: d, t = t.split("-"); d = int(d)
    parts = [float(x) for x in t.split(":")]
    s = 0.0
    for x in parts: s = s * 60 + x
    return d * 86400 + s

def snap(pid):
    keep, rows = tree(pid)
    return sum(rows[k][1] for k in keep if k in rows) / 1024.0, sum(cpu_s(rows[k][2]) for k in keep if k in rows), keep

def has_window(pids):
    for w in Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionAll, Quartz.kCGNullWindowID) or []:
        b = w.get("kCGWindowBounds", {})
        if w.get("kCGWindowOwnerPID") in pids and b.get("Width", 0) > 100 and b.get("Height", 0) > 100:
            return True
    return False

def kill(p):
    try: os.killpg(p.pid, signal.SIGKILL)
    except ProcessLookupError: pass
    p.wait()

def launch(cmd):
    return subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)

def main():
    a = sys.argv[1:]; runs, secs = 5, 10.0
    while a and a[0].startswith("--") and a[0] != "--":
        o = a.pop(0)
        if o == "--runs": runs = int(a.pop(0))
        elif o == "--secs": secs = float(a.pop(0))
        elif o == "--json": pass
    name = a.pop(0)
    assert a.pop(0) == "--"
    cmd = a
    starts = []
    for _ in range(runs):                                 # cold start: a fresh process each time
        t0 = time.perf_counter(); p = launch(cmd)
        while time.perf_counter() - t0 < 30:
            _, _, keep = snap(p.pid)
            if has_window(keep): starts.append((time.perf_counter() - t0) * 1000); break
            time.sleep(0.005)
        kill(p); time.sleep(0.5)
    t0 = time.perf_counter(); p = launch(cmd)             # steady state
    mid = None; rss = []
    while time.perf_counter() - t0 < secs:
        time.sleep(0.25)
        r, c, _ = snap(p.pid)
        if time.perf_counter() - t0 >= secs / 2:
            if mid is None: mid = (time.perf_counter(), c)
            rss.append(r); last = (time.perf_counter(), c)
    kill(p)
    out = {"name": name, "start_ms": round(statistics.median(starts)) if starts else None, "start_all_ms": [round(s) for s in starts],
           "rss_mb": round(statistics.median(rss), 1) if rss else None,
           "cpu_pct": round(100 * (last[1] - mid[1]) / (last[0] - mid[0]), 1) if mid and last[0] > mid[0] else None}
    print(json.dumps(out))

main()
