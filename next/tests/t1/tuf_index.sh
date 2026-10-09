#!/bin/sh
# The TUF client of the plugin index (ZN-336.02, D41): a repository written by tools/index-repo is read by `zinc index-get` (root, timestamp, snapshot,
# targets, delegations, then the target's bytes), and the attacks are refused: an expired timestamp, a rolled-back snapshot, a target whose hash differs,
# a role signed below its threshold, a target signed by a role not delegated for its name, and a delegated role signed by a key it was not given.
cd "$(dirname "$0")/../.." || exit 2
ZINC=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC") exec python3 - "$PWD/tools/index-repo" <<'PY'
import importlib.machinery, importlib.util, json, os, shutil, subprocess, sys, tempfile
loader = importlib.machinery.SourceFileLoader("index_repo", sys.argv[1]); spec = importlib.util.spec_from_loader("index_repo", loader); ir = importlib.util.module_from_spec(spec); loader.exec_module(ir)
Z = os.environ["ZINC"]; tmp = tempfile.mkdtemp(); fails = []
def get(repo, cache, path=None):
    r = subprocess.run([Z, "index-get", "file://" + repo, cache] + ([path] if path else []), capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr
def fresh(repo, name):
    cache = os.path.join(tmp, "cache-" + name); shutil.rmtree(cache, ignore_errors=True); os.makedirs(cache)
    shutil.copy(os.path.join(repo, "root.json"), cache); return cache
def expect(name, ok, out, word=None):
    if ok != (out[0] == 0) or (word and word not in out[1]): fails.append("%s: rc %d, %s" % (name, out[0], out[1].strip()[:300]))
keys = {r: [ir.keygen()] for r in ir.ROLES}
plugin = b"plugin bytes\n"
repo = os.path.join(tmp, "repo")
ir.build(repo, keys, {"plugins/greet-1.0.tar": (plugin, {"name": "greet", "version": "1.0"})})
c = fresh(repo, "good")
expect("good list", True, get(repo, c), "plugins/greet-1.0.tar 13 targets")
expect("good target", True, get(repo, c, "plugins/greet-1.0.tar"), "plugins/greet-1.0.tar 13")
# an expired timestamp (freeze)
t = ir.metadata("timestamp", 2, -1, meta={"snapshot.json": ir.meta_of(open(os.path.join(repo, "snapshot.json"), "rb").read(), 1)})
ir.sign(os.path.join(repo, "timestamp.json"), t, [keys["timestamp"][0]["seed"]])
expect("expired timestamp", False, get(repo, fresh(repo, "exp")), "timestamp: expired")
# a rolled-back snapshot: the client trusts version 2, the mirror serves version 1 under a newer timestamp
ir.build(repo, keys, {"plugins/greet-1.0.tar": (plugin, None)}, version=2)
c = fresh(repo, "rollback"); expect("v2 sync", True, get(repo, c))
ir.build(repo, keys, {"plugins/greet-1.0.tar": (plugin, None)}, version=1)
sj = open(os.path.join(repo, "snapshot.json"), "rb").read()
ir.sign(os.path.join(repo, "timestamp.json"), ir.metadata("timestamp", 3, 7, meta={"snapshot.json": ir.meta_of(sj, 1)}), [keys["timestamp"][0]["seed"]])
expect("rolled-back snapshot", False, get(repo, c), "rollback")
# a target whose bytes differ from its signed hash
ir.build(repo, keys, {"plugins/greet-1.0.tar": (plugin, None)}, version=1)
open(os.path.join(repo, "targets", "plugins", "greet-1.0.tar"), "wb").write(b"evil bytes!!\n")
expect("target hash", False, get(repo, fresh(repo, "hash"), "plugins/greet-1.0.tar"), "hash differs")
# a role signed below its threshold: targets needs 2 of its 2 keys, one signs
keys2 = dict(keys); keys2["targets"] = [ir.keygen(), ir.keygen()]
repo2 = os.path.join(tmp, "repo2"); ir.build(repo2, keys2, {"plugins/greet-1.0.tar": (plugin, None)})
root = ir.root_md(keys2, thresholds={"targets": 2})
open(os.path.join(repo2, "root.json"), "wb").write(ir.sign(os.path.join(repo2, "1.root.json"), root, [keys2["root"][0]["seed"]]))
tj = ir.metadata("targets", 1, 30, targets={"plugins/greet-1.0.tar": ir.target_entry(plugin)})
ir.sign(os.path.join(repo2, "targets.json"), tj, [keys2["targets"][0]["seed"]])
expect("below threshold", False, get(repo2, fresh(repo2, "thr")), "threshold is 2")
# delegations: alice may sign alice/*; a target bob/* in alice's role is not hers to sign, and a role signed by a key it was not given is refused
alice, mallory = ir.keygen(), ir.keygen()
deleg = {"keys": {ir.keyid(alice["public"]): ir.key_obj(alice["public"])}, "roles": [{"name": "alice", "keyids": [ir.keyid(alice["public"])], "threshold": 1, "paths": ["alice/*"], "terminating": True}]}
am = ir.metadata("targets", 1, 30, targets={"alice/a-1.0.tar": ir.target_entry(plugin), "bob/b-1.0.tar": ir.target_entry(plugin)})
repo3 = os.path.join(tmp, "repo3")
os.makedirs(os.path.join(repo3, "targets", "alice")); os.makedirs(os.path.join(repo3, "targets", "bob"))
open(os.path.join(repo3, "targets", "bob", "b-1.0.tar"), "wb").write(plugin)
ir.build(repo3, keys, {"alice/a-1.0.tar": (plugin, None)}, delegations=deleg, extra_roles={"alice": (am, [alice["seed"]])})
c = fresh(repo3, "deleg")
expect("delegated target", True, get(repo3, c, "alice/a-1.0.tar"), "alice/a-1.0.tar 13 alice")
expect("not delegated for the name", False, get(repo3, c, "bob/b-1.0.tar"), "no role that may sign")
out = get(repo3, c)
if "bob/b-1.0.tar" in out[1] or "alice/a-1.0.tar" not in out[1]: fails.append("list: " + out[1].strip()[:300])
ir.build(repo3, keys, {"alice/a-1.0.tar": (plugin, None)}, delegations=deleg, extra_roles={"alice": (am, [mallory["seed"]])})
expect("key not delegated", False, get(repo3, fresh(repo3, "mallory"), "alice/a-1.0.tar"), "threshold is 1")
for f in fails: print("tuf_index:", f)
sys.exit(1 if fails else 0)
PY
