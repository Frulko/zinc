#!/bin/sh
# TUF interop (ZN-336.02, D41): a repository written by python-tuf 6 (tests/data/tuf_interop.py) is read by `zinc index-get`, delegation included, and
# python-tuf verifies the signatures of a repository written by tools/index-repo. Needs python-tuf: $TUF_PYTHON (a python with `tuf` and
# `securesystemslib[crypto]`), else python3; skipped (77) without it.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
PY=${TUF_PYTHON:-python3}
"$PY" -c "import tuf, securesystemslib, cryptography" 2>/dev/null || { echo "tuf_interop: no python-tuf (set TUF_PYTHON)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$PY" tests/data/tuf_interop.py "$tmp/py" || exit 1
mkdir "$tmp/c" && cp "$tmp/py/root.json" "$tmp/c/"
"$Z" index-get "file://$tmp/py" "$tmp/c" | grep -q "^alice/tool-2.0.tar 11 alice$" || { echo "tuf_interop: zinc does not read python-tuf's repository"; fail=1; }
"$Z" index-get "file://$tmp/py" "$tmp/c" alice/tool-2.0.tar >/dev/null || { echo "tuf_interop: zinc does not fetch python-tuf's delegated target"; fail=1; }
ZINC="$Z" python3 tools/index-repo keys "$tmp/keys.json" && printf 'x\n' > "$tmp/t.tar" && printf '{"targets": {"plugins/t.tar": {"file": "%s"}}}' "$tmp/t.tar" > "$tmp/e.json"
ZINC="$Z" python3 tools/index-repo build "$tmp/ours" "$tmp/keys.json" "$tmp/e.json" >/dev/null || { echo "tuf_interop: index-repo build failed"; exit 1; }
"$PY" - "$tmp/ours" <<'PY' || fail=1
import sys
from tuf.api.metadata import Metadata, Root, Snapshot, Targets, Timestamp
d = sys.argv[1]
root = Metadata[Root].from_file(d + "/root.json")
root.verify_delegate("root", root)
for name, cls in (("timestamp", Timestamp), ("snapshot", Snapshot), ("targets", Targets)):
    root.verify_delegate(name, Metadata[cls].from_file(d + "/" + name + ".json"))
PY
"$PY" tools/index-repo build "$tmp/pysigned" "$tmp/keys.json" "$tmp/e.json" >/dev/null && mkdir "$tmp/c2" && cp "$tmp/pysigned/root.json" "$tmp/c2/" &&   # signed by `cryptography`, as the Pages job does
  "$Z" index-get "file://$tmp/pysigned" "$tmp/c2" plugins/t.tar >/dev/null || { echo "tuf_interop: zinc refuses the index signed with cryptography"; fail=1; }
exit $fail
