#!/bin/sh
# tests/run --shard i/n (tests/ci/shard.py): the n shards of the whole tier hold every test once, and the measured durations of tests/ci/durations.txt
# split them within a minute of each other (round robin left 8 to 25 minutes on the six CI shards of v0.7.2).
cd "$(dirname "$0")/../.." || exit 2
python3 - <<'PY'
import glob, os, subprocess
names = [os.path.basename(f)[:-3] for t in ("t0", "t1", "t2") for f in sorted(glob.glob(f"tests/{t}/*.sh"))]
d = {l.split()[0]: int(l.split()[1]) for l in open("tests/ci/durations.txt") if l.strip()}
seen = []
loads = []
for i in range(1, 7):
    out = subprocess.run(["python3", "tests/ci/shard.py", f"{i}/6", "tests/ci/durations.txt"], input="\n".join(names), capture_output=True, text=True, check=True).stdout.split()
    seen += out
    loads.append(sum(d.get(m, 10) for m in set(out)))
assert sorted(set(seen)) == sorted(set(names)) and len(seen) == len(names), "the shards do not hold every test once"
assert max(loads) - min(loads) <= 60, "shards %s s apart: %s" % (max(loads) - min(loads), loads)
out = subprocess.run(["python3", "tests/ci/shard.py", "1/2", "/nonexistent"], input="a\nb\nc\n", capture_output=True, text=True, check=True).stdout.split()
assert out == ["a", "c"], "without durations every test counts the same: %s" % out
PY
# --list keeps only the names of a file, --skip-list leaves them out (the Linux runner and the macOS shards share tests/ci/linux.txt)
l=$(mktemp); trap 'rm -f "$l"' EXIT; printf '# a comment\naffected_paths\n' > "$l"
tests/run --tier t0 --list "$l" | grep -qx "1 passed, 0 failed" || { echo "--list does not run exactly the listed test"; exit 1; }
tests/run --only affected_paths --skip-list "$l" | grep -qx "0 passed, 0 failed" || { echo "--skip-list runs a listed test"; exit 1; }
