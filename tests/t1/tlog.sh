#!/bin/sh
# The transparency log (ZN-343.02, D42): tools/tlog logs every artifact of an index (RFC 6962 / 9162); with the log key pinned (ZINC_TLOG_KEY) `zinc index-get`
# checks each target's inclusion proof and the consistency with the last checkpoint it saw. Thirteen entries: every inclusion proof, and the consistency
# from every earlier size, verify; an artifact the index lists but the log does not is refused; a log that rewrote its history is detected.
cd "$(dirname "$0")/../.." || exit 2
ZINC=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC") exec python3 - "$PWD/tools/index-repo" "$PWD/tools/tlog" <<'PY'
import hashlib, importlib.machinery, importlib.util, json, os, shutil, subprocess, sys, tempfile
def load(name, path):
    l = importlib.machinery.SourceFileLoader(name, path); s = importlib.util.spec_from_loader(name, l); m = importlib.util.module_from_spec(s); l.exec_module(m); return m
ir, tl = load("ir", sys.argv[1]), load("tl", sys.argv[2])
Z = os.environ["ZINC"]; tmp = tempfile.mkdtemp(); fails = []
keys = {r: [ir.keygen()] for r in ir.ROLES}; logkey = ir.keygen()
repo = os.path.join(tmp, "repo"); cache = os.path.join(tmp, "cache")
targets = {}
def publish(version):
    ir.build(repo, keys, targets, version=version); return tl.publish(repo, logkey["seed"])
def get(path):
    os.makedirs(cache, exist_ok=True); shutil.copy(os.path.join(repo, "root.json"), cache)
    r = subprocess.run([Z, "index-get", "file://" + repo, cache, path], capture_output=True, text=True, env=dict(os.environ, ZINC_TLOG_KEY=logkey["public"]))
    return r.returncode, r.stdout + r.stderr
for i in range(13):
    targets["plugins/p%02d.tar" % i] = (("plugin %d\n" % i).encode(), None)
    publish(i + 1)
    rc, out = get("plugins/p%02d.tar" % i)
    if rc != 0: fails.append("entry %d: %s" % (i, out.strip()))
entries = json.load(open(os.path.join(repo, "log", "entries.json")))
leaves = [tl.leaf(tl.entry(e["path"], e["sha256"])) for e in entries]
for i in range(13):   # every inclusion proof at size 13
    shutil.rmtree(cache, ignore_errors=True)
    rc, out = get("plugins/p%02d.tar" % i)
    if rc != 0: fails.append("inclusion %d: %s" % (i, out.strip()))
for m in range(1, 13):   # the consistency proof from every earlier size
    shutil.rmtree(cache, ignore_errors=True); os.makedirs(cache)
    json.dump({"size": m, "root": tl.mth(leaves[:m]).hex()}, open(os.path.join(cache, "log-state.json"), "w"))
    rc, out = get("plugins/p00.tar")
    if rc != 0: fails.append("consistency %d -> 13: %s" % (m, out.strip()))
# an artifact the index lists and the log does not
targets["plugins/unlogged.tar"] = (b"not logged\n", None)
ir.build(repo, keys, targets, version=20)
rc, out = get("plugins/unlogged.tar")
if rc == 0 or "not in the transparency log" not in out: fails.append("an unlogged artifact: rc %d %s" % (rc, out.strip()))
# a log that rewrites its history: the client saw 13 entries, the log now has 14 whose first ones differ
tl.publish(repo, logkey["seed"])
rc, out = get("plugins/unlogged.tar")
if rc != 0: fails.append("the logged artifact after publishing: " + out.strip())
e = json.load(open(os.path.join(repo, "log", "entries.json"))); e[0], e[1] = e[1], e[0]
json.dump(e[:13], open(os.path.join(repo, "log", "entries.json"), "w")); json.dump([13, 14], open(os.path.join(repo, "log", "sizes.json"), "w"))   # consistency/14.json is written, over the rewritten tree
targets["plugins/later.tar"] = (b"later\n", None); ir.build(repo, keys, targets, version=21); tl.publish(repo, logkey["seed"])
rc, out = get("plugins/later.tar")
if rc == 0 or "rewrote its history" not in out: fails.append("a rewritten history: rc %d %s" % (rc, out.strip()))
if not os.path.exists(os.path.join(repo, "log", "consistency", "14.json")): fails.append("the rewritten log has no consistency proof from 14: the refusal did not come from a failing proof")
for f in fails: print("tlog:", f)
sys.exit(1 if fails else 0)
PY
