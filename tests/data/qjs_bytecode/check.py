import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile

zinc = str(Path(os.environ["ZINC"]).resolve())
env = dict(os.environ, ZINC_HEADLESS="1", ZINC_STEPS="0", ZINC_OFFLINE="1")


def command(*args, succeeds=True):
    p = subprocess.run([zinc, *map(str, args)], env=env, capture_output=True, text=True, timeout=15)
    assert (p.returncode == 0) == succeeds, (args, p.returncode, p.stdout, p.stderr)
    return p


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    project = root / "project"
    project.mkdir()
    (project / "zinc.json").write_text('{"name":"bytecode","entry":"main.js","engine":"quickjs"}')
    (project / "main.js").write_text("import { value } from './util.js'; console.log(value); console.log('done');")
    (project / "util.js").write_text("export const value = 'original source';")
    command("check", project, "--engine", "quickjs")
    bundle = root / "app.js"
    command("bundle", project, "-o", bundle, "--bytecode")
    qbc = bundle.with_suffix(".qbc")
    valid = qbc.read_bytes()
    version = command("--version").stdout.strip().removeprefix("zinc-next ")
    stamp = f"zinc-qbc {version}\n".encode()
    assert valid.startswith(stamp), valid[:100]
    # QuickJS-ng's native bytecode header follows the Zinc build/git stamp.
    assert valid[len(stamp)] == 29
    bundle.write_text("console.log('source fallback');")
    os.utime(bundle, (1000000000, 1000000000))
    os.utime(qbc, (1000000001, 1000000001))
    p = command("run", qbc)
    assert p.stdout == "original source\ndone\n" and not p.stderr, p

    def fallback(data, reason):
        qbc.write_bytes(data)
        os.utime(qbc, (1000000001, 1000000001))
        for entry in (qbc, bundle):
            p = command("run", entry)
            assert p.stdout == "source fallback\n", p
            assert len(p.stderr.splitlines()) == 1 and reason in p.stderr and "zinc build" in p.stderr, p

    fallback(b"zinc-qbc 0.0.1\n" + valid[len(stamp):], "compiled by zinc 0.0.1")
    fallback(stamp + bytes([valid[len(stamp)] ^ 1]) + valid[len(stamp) + 1:], "not readable by this QuickJS")
    fallback(valid[:len(stamp) + 3], "not readable by this QuickJS")
    qbc.write_bytes(valid)
    os.utime(qbc, (999999999, 999999999))
    p = command("run", qbc)
    assert p.stdout == "source fallback\n" and len(p.stderr.splitlines()) == 1 and "older than the source" in p.stderr, p
    bundle.unlink()
    qbc.write_bytes(b"zinc-qbc foreign\n")
    p = command("run", qbc, succeeds=False)
    assert "build it again" in p.stderr, p

    # A source sibling inside the pack must never reach JS_ReadObject, even with a matching build stamp.
    (project / "main.qbc").write_bytes(stamp + b"unchecked untrusted bytecode")
    archive = root / "app.zapp"
    command("pack", project, "-o", archive)
    with tarfile.open(archive) as tar:
        files = {m.name: tar.extractfile(m).read() for m in tar if m.isfile()}
    manifest = json.loads(files["manifest.json"])
    for name in ("main.js", "util.js", ".zinc/app.js", ".zinc/app.js.map", ".zinc/app.qbc"):
        assert hashlib.sha256(files[name]).hexdigest() == manifest["files"][name], name
    assert files[".zinc/app.qbc"].startswith(stamp) and files[".zinc/app.qbc"][len(stamp)] == 29

    def packed_source():
        p = command("run", archive)
        assert p.stdout == "original source\ndone\n", p
        assert len(p.stderr.splitlines()) == 1 and "not authenticated" in p.stderr and "running source" in p.stderr, p

    packed_source()
    # Recomputed file hashes are not authenticity. Foreign/corrupted packed bytecode still cannot run.
    files[".zinc/app.qbc"] = b"zinc-qbc foreign\ncorrupt"
    manifest["files"][".zinc/app.qbc"] = hashlib.sha256(files[".zinc/app.qbc"]).hexdigest()
    files["manifest.json"] = json.dumps(manifest).encode()
    with tarfile.open(archive, "w", format=tarfile.USTAR_FORMAT) as tar:
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    packed_source()

print("QuickJS bytecode and unsigned pack fallback: pass")
