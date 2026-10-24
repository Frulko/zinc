#!/usr/bin/env python3
"""tests/run --shard i/n: the names of shard i, read from stdin in run order, split by the measured durations of tests/ci/durations.txt
(longest first, each to the least loaded shard) so the n runners end together; a test not measured yet counts DEFAULT seconds."""
import sys

DEFAULT = 10


def split(names, durations, n):
    load, shard = [0] * n, {}
    for name in sorted(names, key=lambda m: -durations.get(m, DEFAULT)):   # sorted() is stable: equal durations keep the run order
        i = load.index(min(load))
        shard[name], load[i] = i, load[i] + durations.get(name, DEFAULT)
    return shard, load


if __name__ == "__main__":
    i, n = (int(x) for x in sys.argv[1].split("/"))
    durations = {}
    try:
        for line in open(sys.argv[2]):
            name, _, secs = line.partition(" ")
            if secs.strip():
                durations[name] = int(secs)
    except FileNotFoundError:
        pass
    names = [line.strip() for line in sys.stdin if line.strip()]
    shard, _ = split(names, durations, n)
    print("\n".join(m for m in names if shard[m] == i - 1))
