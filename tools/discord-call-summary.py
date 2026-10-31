#!/usr/bin/env python3
"""The lines of a DISCORD_LOG=1 log that matter for video: the stream events, DAVE, what we send and receive, the closes, the last counters.

    python3 tools/discord-call-summary.py discord-call.log
"""
import re, sys

KEEP = re.compile(r"stream (create|server update|update|delete)|dave|voice go live|ultra low|key frame|closed|camera .* on layers|"
                  r"out video|in video|remote video|nack|op 22|paused|variant|decoder-errors")
lines = open(sys.argv[1], errors="replace").read().splitlines()
seen = {}
for i, l in enumerate(lines):
    if not KEEP.search(l) or "voice-gw" in l and '"op":12' not in l:
        continue
    k = re.sub(r"\d+", "#", l)[:90]
    seen[k] = (i + 1, l)          # the last of each kind
first = [(i + 1, l) for i, l in enumerate(lines) if re.search(r"stream (create|server update)|dave .*(applied|key package)|voice go live", l)]
print("== events"); [print(f"{n}: {l[:200]}") for n, l in first]
print("== last of each kind"); [print(f"{n}: {l[:200]}") for n, l in sorted(seen.values())]
