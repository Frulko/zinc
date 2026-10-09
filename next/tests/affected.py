#!/usr/bin/env python3
"""Reads changed file paths (relative to the repository, one per line) on stdin and tests/affected.json: prints the names of the tests to run, and `canary` when a visible change calls for it."""
import json, sys
from pathlib import Path
cfg = json.load(open(sys.argv[1]))
paths = [l.strip() for l in sys.stdin if l.strip()]
out = []
def add(n):
    if n not in out: out.append(n)
for p in paths:
    if p.startswith(("docs/", "next/backlog/", "tests/compat/results/")) or p.endswith(".md"):
        continue
    q = p[5:] if p.startswith("next/") else p   # next/src/... and src/... name the same files
    hit = False
    for rule in cfg["map"]:
        if any(q.startswith(x) or x in q for x in rule["paths"]):
            hit = True
            for t in rule["tests"]: add(t)
            if rule.get("canary"): add("canary")
    test = Path(sys.argv[1]).parent / q.removeprefix("tests/")
    if q.startswith(("tests/t0/", "tests/t1/", "tests/t2/")) and test.is_file():
        add(test.stem)
        hit = True
    # Shared language/runtime changes and unmapped code must not lose coverage.
    shared = p.startswith(("compiler/", "runtime/")) or q.startswith((
        "src/frontend/", "src/ir/", "src/zbc/", "src/vm/", "src/aot/",
        "src/rt/", "include/", "third_party/", "src/main.cpp", "CMakeLists.txt"))
    if shared or not hit:
        for tier in ("t0", "t1"):
            for test in sorted((Path(sys.argv[1]).parent / tier).glob("*.sh")):
                add(test.stem)
if out:
    print("\n".join(out))
