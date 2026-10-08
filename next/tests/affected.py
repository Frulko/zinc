#!/usr/bin/env python3
"""Reads changed file paths (relative to the repository, one per line) on stdin and tests/affected.json: prints the names of the tests to run, and `canary` when a visible change calls for it."""
import json, sys
cfg = json.load(open(sys.argv[1]))
paths = [l.strip() for l in sys.stdin if l.strip()]
out = []
def add(n):
    if n not in out: out.append(n)
hit = False
for p in paths:
    q = p[5:] if p.startswith("next/") else p   # next/src/... and src/... name the same files
    for rule in cfg["map"]:
        if any(q.startswith(x) or x in q for x in rule["paths"]):
            hit = True
            for t in rule["tests"]: add(t)
            if rule.get("canary"): add("canary")
if not hit: [add(t) for t in cfg["default"]]
print("\n".join(out))
