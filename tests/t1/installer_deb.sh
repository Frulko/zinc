#!/bin/sh
# Debian packages (ZN-320.01): `zinc export --target linux --deb` cross builds a project and writes dist/<name>_<version>_arm64.deb without dpkg;
# two exports give the same bytes; read back here (ar members, tar entries and modes, control fields) the package installs the export in
# /opt/<name>, a launcher in /usr/bin and the .desktop file; --deb for macOS is refused. Skipped (77) when the pinned zig is not downloaded yet.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-* >/dev/null 2>&1 || { echo "installer_deb: no pinned zig downloaded"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$Z" new cli "$tmp/hello" >/dev/null || exit 2
(cd "$tmp/hello" && "$Z" export . --target linux --deb >/dev/null 2>"$tmp/err") || { echo "export --deb failed: $(tail -3 "$tmp/err")"; exit 1; }
deb="$tmp/hello/dist/hello_0.1.0_arm64.deb"
cp "$deb" "$tmp/first.deb"
(cd "$tmp/hello" && "$Z" export . --target linux --deb >/dev/null 2>&1)
cmp -s "$deb" "$tmp/first.deb" || { echo "two .deb of the same project differ"; fail=1; }
python3 - "$deb" <<'PY' || fail=1
import io, sys, tarfile
d = open(sys.argv[1], 'rb').read()
assert d[:8] == b'!<arch>\n', 'not an ar archive'
at, names, m = 8, [], {}
while at < len(d):
    h = d[at:at + 60]; n = h[:16].decode().strip(); size = int(h[48:58]); names.append(n); m[n] = d[at + 60:at + 60 + size]; at += 60 + size + size % 2
assert names == ['debian-binary', 'control.tar', 'data.tar'], names
assert m['debian-binary'] == b'2.0\n'
control = tarfile.open(fileobj=io.BytesIO(m['control.tar'])).extractfile('./control').read().decode()
for f in ('Package: hello', 'Version: 0.1.0', 'Architecture: arm64', 'Maintainer: ', 'Description: hello'): assert f in control, f
data = {i.name: i for i in tarfile.open(fileobj=io.BytesIO(m['data.tar'])).getmembers()}
assert data['./opt/hello/hello'].mode == 0o755 and data['./opt/hello/hello'].size > 0
assert data['./usr/bin/hello'].mode == 0o755
assert './usr/share/applications/hello.desktop' in data
assert all(i.mtime == 0 and i.uid == 0 for i in data.values())
PY
(cd "$tmp/hello" && "$Z" export . --target macos --deb >/dev/null 2>&1); [ $? -eq 2 ] || { echo "--deb for macos must be refused"; fail=1; }
[ $fail -eq 0 ] && echo "installer deb: ok"
exit $fail
