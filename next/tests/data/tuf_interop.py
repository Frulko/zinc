"""A TUF repository written by python-tuf (the reference implementation), for tests/t1/tuf_interop.sh: root, targets with one target and a delegation to
'alice' for alice/*, snapshot, timestamp, all Ed25519. Usage: python tuf_interop.py <repo-dir>"""
import datetime, os, sys
from securesystemslib.signer import CryptoSigner
from tuf.api.metadata import (DelegatedRole, Delegations, Metadata, MetaFile, Root, Snapshot, TargetFile, Targets, Timestamp)
from tuf.api.serialization.json import JSONSerializer

repo = sys.argv[1]
os.makedirs(os.path.join(repo, "targets", "alice"), exist_ok=True)
exp = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0) + datetime.timedelta(days=30)
signers = {r: CryptoSigner.generate_ed25519() for r in ("root", "targets", "snapshot", "timestamp", "alice")}
root = Root(expires=exp, consistent_snapshot=False)
for r in ("root", "targets", "snapshot", "timestamp"):
    root.add_key(signers[r].public_key, r)
def write(md, name, signer):
    md.sign(signer)
    md.to_file(os.path.join(repo, name), JSONSerializer(compact=False))
for name, data in (("plugins/greet-1.0.tar", b"greet plugin\n"), ("alice/tool-2.0.tar", b"alice tool\n")):
    p = os.path.join(repo, "targets", name); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "wb").write(data)
targets = Targets(expires=exp)
targets.targets["plugins/greet-1.0.tar"] = TargetFile.from_file("plugins/greet-1.0.tar", os.path.join(repo, "targets", "plugins/greet-1.0.tar"), ["sha256"])
alice_key = signers["alice"].public_key
targets.delegations = Delegations(keys={alice_key.keyid: alice_key}, roles={"alice": DelegatedRole(name="alice", keyids=[alice_key.keyid], threshold=1, terminating=True, paths=["alice/*"])})
alice = Targets(expires=exp)
alice.targets["alice/tool-2.0.tar"] = TargetFile.from_file("alice/tool-2.0.tar", os.path.join(repo, "targets", "alice/tool-2.0.tar"), ["sha256"])
snapshot = Snapshot(expires=exp)
snapshot.meta["targets.json"] = MetaFile(version=1)
snapshot.meta["alice.json"] = MetaFile(version=1)
timestamp = Timestamp(expires=exp)
timestamp.snapshot_meta = MetaFile(version=1)
write(Metadata(root), "root.json", signers["root"])
write(Metadata(root), "1.root.json", signers["root"])
write(Metadata(targets), "targets.json", signers["targets"])
write(Metadata(alice), "alice.json", signers["alice"])
write(Metadata(snapshot), "snapshot.json", signers["snapshot"])
write(Metadata(timestamp), "timestamp.json", signers["timestamp"])
