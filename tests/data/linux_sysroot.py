"""Small, offline trust-boundary and publication checks for the actual fetcher."""
import hashlib
import importlib.machinery
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

loader = importlib.machinery.SourceFileLoader("sysroot", "tools/linux-sysroot")
spec = importlib.util.spec_from_loader(loader.name, loader)
m = importlib.util.module_from_spec(spec)
sys.modules[loader.name] = m
loader.exec_module(m)

rows = [line.split() for line in Path("src/tc/linux-sysroot.lock").read_text().splitlines() if line and not line.startswith("#")]
assert {r[0] for r in rows} == set(m.DEBIAN)
for arch in m.DEBIAN:
    selected = [r for r in rows if r[0] == arch]
    assert len(selected) == len(m.PACKAGES) and {r[1] for r in selected} == set(m.PACKAGES)
    for r in selected:
        assert len(r) == 5 and r[3].startswith("pool/") and ".." not in r[3].split("/")
        assert len(r[4]) == 64 and all(c in "0123456789abcdef" for c in r[4])


def deb(entries):
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w:xz") as t:
        for name, contents, link in entries:
            info = tarfile.TarInfo(name)
            if link:
                info.type, info.linkname = tarfile.SYMTYPE, link
            else:
                info.size = len(contents)
            t.addfile(info, io.BytesIO(contents) if not link else None)
    body = data.getvalue()
    header = f'{"data.tar.xz/":<16}{0:<12}{0:<6}{0:<6}{"100644":<8}{len(body):<10}`\n'.encode()
    return b"!<arch>\n" + header + body + (b"\n" if len(body) % 2 else b"")


with tempfile.TemporaryDirectory(prefix="zinc-sysroot-test-") as tmp:
    tmp = Path(tmp)
    good = deb([("./usr/include/fixture.h", b"pinned", ""),
                ("./usr/lib/libfixture.so.1", b"dynamic", ""),
                ("./usr/lib/libfixture.so", b"", "/usr/lib/libfixture.so.1"),
                ("./usr/lib/libfixture.a", b"static", "")])
    for entries in ([('/outside', b'x', '')], [('usr/../../outside', b'x', '')],
                    [('usr/lib/escape', b'', str(tmp / 'outside')), ('usr/lib/escape/file', b'x', '')],
                    [('usr/lib/escape', b'', '../../../outside'), ('usr/lib/escape/file', b'x', '')],
                    [('usr/lib/x', b'', '../deep/dir/x'), ('usr/lib/x', b'', '../../..')]):
        dest = tmp / "rejected"
        dest.mkdir(exist_ok=True)
        try:
            m.extract(deb(entries), str(dest))
        except (ValueError, tarfile.TarError):
            pass
        else:
            raise AssertionError("unsafe archive accepted: " + str(entries))
        assert not (tmp / "outside").exists()
    mirror = tmp / "mirror/pool"
    mirror.mkdir(parents=True)
    archive = mirror / "fixture.deb"
    archive.write_bytes(good)
    lock = tmp / "lock"
    lock.write_text("armhf fixture 1 pool/fixture.deb " + hashlib.sha256(good).hexdigest() + "\n")
    m.LOCK = str(lock)
    os.environ["ZINC_SYSROOT_MIRROR"] = (tmp / "mirror").as_uri()
    home = tmp / "home"
    root = home / "sysroots/armhf-linux"
    root.mkdir(parents=True)
    (root / "manual-library").write_text("retained")
    m.install("armhf", str(home))
    assert root.is_symlink() and m.ready(str(root), m.identity("armhf"))
    assert (root / "manual-library").read_text() == "retained"
    assert not (root / "usr/lib/libfixture.a").exists()
    assert (root / "usr/lib/libfixture.so").read_bytes() == b"dynamic"
    alias = root.parent / "armv7-linux"
    alias.unlink()
    m.install("armhf", str(home))
    assert alias.resolve() == root.resolve()
    (root / "usr/include/fixture.h").unlink()
    assert not m.ready(str(root), m.identity("armhf"))
    m.install("armhf", str(home))
    assert (root / "usr/include/fixture.h").read_bytes() == b"pinned"
    # Fail at publication after the one-time directory migration, then recover the retained manual data.
    recovery = tmp / "recovery/sysroots/armhf-linux"
    recovery.mkdir(parents=True)
    (recovery / "manual-library").write_text("recovered")
    replace = m.os.replace
    def interrupted(source, destination):
        if destination == str(recovery):
            raise OSError("interrupted publication")
        replace(source, destination)
    m.os.replace = interrupted
    try:
        m.install("armhf", str(tmp / "recovery"))
    except OSError:
        pass
    else:
        raise AssertionError("publication was not interrupted")
    finally:
        m.os.replace = replace
    assert not recovery.exists() and (recovery.with_name("armhf-linux.previous") / "manual-library").exists()
    m.install("armhf", str(tmp / "recovery"))
    assert (recovery / "manual-library").read_text() == "recovered"
    before = root.resolve()
    lock.write_text(lock.read_text().replace("fixture 1", "fixture 2"))
    archive.write_bytes(b"corrupt")
    try:
        m.install("armhf", str(home))
    except ValueError as e:
        assert "SHA-256" in str(e) and "refused" in str(e)
    else:
        raise AssertionError("corrupt archive accepted")
    assert root.resolve() == before and (root / "manual-library").exists()
    archive.write_bytes(good)
    # Two installers race through the same actual flock and recheck after acquiring it.
    runner = tmp / "install.py"
    runner.write_text("import importlib.machinery, importlib.util, sys\n"
                      "loader=importlib.machinery.SourceFileLoader('s', 'tools/linux-sysroot')\n"
                      "spec=importlib.util.spec_from_loader(loader.name, loader)\n"
                      "m=importlib.util.module_from_spec(spec)\nsys.modules[loader.name]=m\nloader.exec_module(m)\n"
                      + "m.LOCK=" + repr(str(lock)) + "\nm.install('armhf', " + repr(str(home)) + ")\n")
    jobs = [subprocess.Popen([sys.executable, str(runner)], stdout=subprocess.DEVNULL) for _ in range(2)]
    assert all(job.wait(timeout=10) == 0 for job in jobs)
    assert m.ready(str(root), m.identity("armhf")) and (root / "manual-library").exists()
    # The real canonical pin is refused through the public mirror override before any root is published.
    first = next(l.split() for l in Path("src/tc/linux-sysroot.lock").read_text().splitlines() if l and not l.startswith("#"))
    bad = tmp / "mirror" / first[3]
    bad.parent.mkdir(parents=True, exist_ok=True)
    bad.write_bytes(b"corrupt canonical archive")
    p = subprocess.run([sys.executable, "tools/linux-sysroot", "--arch", first[0]],
                       env={**os.environ, "ZINC_HOME": str(tmp / "canonical")}, capture_output=True, text=True, timeout=10)
    assert p.returncode and "SHA-256" in p.stderr and "refused" in p.stderr, p.stderr
    assert not (tmp / "canonical/sysroots" / (first[0] + "-linux")).exists()
    zinc = os.environ.get("ZINC")
    if zinc:
        actual = hashlib.sha256((hashlib.sha256(Path("src/tc/linux-sysroot.lock").read_bytes()).hexdigest() + "armhfv2").encode()).hexdigest()
        receipt = root / ".zinc-sysroot"
        receipt.write_text("zinc-sysroot 2 " + actual + "\nusr/include/fixture.h\n")
        def inventory():
            before = sorted(str(p) for p in home.rglob("*"))
            result = subprocess.run([zinc, "doctor", "--details"], capture_output=True, text=True, timeout=5,
                                    env={**os.environ, "ZINC_HOME": str(home), "ZINC_ROOT": str(Path.cwd()), "ZINC_HEADLESS": "1", "ZINC_OFFLINE": "1"})
            assert result.returncode == 0, result.stderr
            assert sorted(str(p) for p in home.rglob("*")) == before, "doctor mutated the sysroot inventory"
            return next(line for line in result.stdout.splitlines() if line.strip().startswith("armhf-linux "))
        assert "ready:" in inventory()
        receipt.write_text("zinc-sysroot 2\n")
        assert "incomplete or old pin:" in inventory()
        receipt.unlink()
        assert "incomplete or old pin:" in inventory()
        root.unlink()
        root.mkdir()
        assert "user-managed:" in inventory()
print("sysroot checks passed")
