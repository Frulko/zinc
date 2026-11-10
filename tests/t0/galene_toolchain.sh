#!/bin/sh
# Local-only verified Galène install, corrupt pin refusal, cache reuse and reproducible archive metadata.
set -eu
cd "$(dirname "$0")/../.."
Z=${ZINC:-build/zinc}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
python3 - "$tmp" <<'PY'
import importlib.machinery, importlib.util, pathlib, sys, tarfile
loader = importlib.machinery.SourceFileLoader('build_galene', 'tools/build-galene')
spec = importlib.util.spec_from_loader(loader.name, loader)
build = importlib.util.module_from_spec(spec); loader.exec_module(build)
a, b = pathlib.Path(sys.argv[1]) / 'a.gz', pathlib.Path(sys.argv[1]) / 'b.gz'
files = {'galene': b'not executed', 'LICENCE': b'MIT\n'}
build.archive(a, 'galene', files); build.archive(b, 'galene', dict(reversed(list(files.items()))))
assert a.read_bytes() == b.read_bytes()
with tarfile.open(a) as tar:
    assert tar.getnames() == ['galene/LICENCE', 'galene/galene']
    assert all(m.mtime == 0 and m.uid == 0 and m.gid == 0 for m in tar)
    assert tar.getmember('galene/galene').mode == 0o755
assert build.TARGETS == ('darwin-arm64', 'linux-arm64', 'linux-armv7', 'linux-amd64')
PY
if tools/build-galene unknown >"$tmp/invalid" 2>&1; then echo 'galene: invalid target accepted'; exit 1; fi
grep -q 'targets must be' "$tmp/invalid"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) host=aarch64-macos; target=darwin-arm64 ;;
  Linux-aarch64) host=aarch64-linux; target=linux-arm64 ;;
  Linux-x86_64) host=x86_64-linux; target=linux-amd64 ;;
  Linux-arm*) host=arm-linux; target=linux-armv7 ;;
  *) echo 'galene: no pinned binary for this host'; exit 77 ;;
esac
file=galene-1.2.1-$target.tar.gz
dir=$tmp/home/toolchains/galene-$host-1.2.1
mkdir -p "$tmp/mirror"
printf corrupt > "$tmp/mirror/$file"
install() { env ZINC_HOME="$tmp/home" ZINC_OFFLINE=1 ZINC_TC_MIRROR="file://$tmp/mirror" ZINC_MIRRORS= "$Z" toolchain install galene; }
if install >"$tmp/bad" 2>&1; then echo 'galene: corrupt archive accepted'; exit 1; fi
grep -q 'does not verify (SHA-256' "$tmp/bad"
[ ! -e "$dir" ] && [ ! -e "$tmp/home/toolchains/$file.part" ]
asset=${ZINC_GALENE_TEST_ARCHIVE:-dist/galene/$file}
[ -f "$asset" ] || { echo 'galene: set ZINC_GALENE_TEST_ARCHIVE to the pinned release archive for the local install proof'; exit 77; }
cp "$asset" "$tmp/mirror/$file"
install >"$tmp/path" 2>"$tmp/verified"
grep -q 'checksum verified' "$tmp/verified"
[ "$(cat "$tmp/path")" = "$dir/galene" ] && [ -x "$dir/galene" ] && [ -f "$dir/LICENCE" ] && [ -f "$dir/PROVENANCE.json" ]
[ "$(cut -d' ' -f1 "$dir/SHA256")" = "$("$Z" toolchain sha256 "$asset" | cut -d' ' -f1)" ]
rm "$tmp/mirror/$file"
install >"$tmp/cached" 2>"$tmp/cache-log"
cmp "$tmp/path" "$tmp/cached"
[ ! -s "$tmp/cache-log" ]
# A missing local source fails without falling back to the network.
rm -rf "$dir"
if install >"$tmp/missing" 2>&1; then echo 'galene: missing archive accepted'; exit 1; fi
grep -q 'cannot download' "$tmp/missing"
echo 'galene toolchain: ok (file URL, checksum, cache, missing source)'
