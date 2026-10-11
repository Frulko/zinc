#!/bin/sh
# Installs zinc with nothing to compile (ZN-718): the engine, its libraries, the templates and the plugins' native libraries, as released for this machine.
#
#   curl -fsSL https://github.com/zinc-engine/zinc/releases/latest/download/install.sh | sh
#
# It reads SHA256SUMS beside it, downloads the archive of this system (macOS arm64 / x86_64, Linux x86_64 / aarch64), checks its SHA-256, unpacks it into
# ~/.zinc/engine and links `zinc` into /usr/local/bin when you can write there, else into ~/.local/bin (added to your PATH in ~/.zprofile or ~/.profile).
# Needs curl and what every Mac and Linux has (shasum or sha256sum, tar, ditto on a Mac); no compiler, no CMake, no Xcode, no administrator password.
# Run it again to update; `rm -rf ~/.zinc/engine` and the link to uninstall.
#   ZINC_INSTALL_URL   where SHA256SUMS and the archives are (default: the latest release of $ZINC_REPO, default zinc-engine/zinc; file:// works)
#   ZINC_INSTALL_DIR   where the engine goes (default ~/.zinc/engine)
#   ZINC_BIN_DIR       where the `zinc` link goes
#   ZINC_NO_MODIFY_PATH=1   never write to a shell profile: the line to add is printed instead
set -eu
url=${ZINC_INSTALL_URL:-https://github.com/${ZINC_REPO:-zinc-engine/zinc}/releases/latest/download}
dir=${ZINC_INSTALL_DIR:-$HOME/.zinc/engine}
die() { echo "zinc install: $*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || die "curl is needed to download zinc (Linux: install the curl package)"
case "$(uname -s)" in
  Darwin) suffix="-macos-$(uname -m).zip" ;;
  Linux) suffix="-linux-$(uname -m).tar.gz" ;;
  *) die "no prebuilt zinc for $(uname -s) yet: macOS and Linux only (Windows: build from the sources, docs/guide/01-getting-started.md)" ;;
esac
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/SHA256SUMS" "$url/SHA256SUMS" || die "cannot read $url/SHA256SUMS: no network, or no release yet"
line=$(grep -- "$suffix\$" "$tmp/SHA256SUMS" | head -1)
[ -n "$line" ] || die "this release has no archive for this machine (*$suffix)"
want=${line%% *}
file=${line##* }; file=${file#\*}
case "$file" in */*|"") die "SHA256SUMS names an unexpected file: $file" ;; esac
echo "zinc install: downloading $file"
curl -fL --retry 2 -sS -o "$tmp/$file" "$url/$file" || die "the download of $url/$file failed"
if command -v shasum >/dev/null 2>&1; then got=$(shasum -a 256 "$tmp/$file"); else got=$(sha256sum "$tmp/$file"); fi
got=${got%% *}
[ "$got" = "$want" ] || die "checksum mismatch for $file: got $got, SHA256SUMS says $want; nothing was installed"
mkdir -p "$tmp/new"
case "$file" in
  *.zip) if command -v ditto >/dev/null 2>&1; then ditto -x -k "$tmp/$file" "$tmp/new"; else unzip -q "$tmp/$file" -d "$tmp/new"; fi
         bin="$dir/Zinc Atelier.app/Contents/MacOS/zinc"; inner="$tmp/new" ;;
  *) tar -xzf "$tmp/$file" -C "$tmp/new"; bin="$dir/bin/zinc"; inner=$(echo "$tmp"/new/*) ;;
esac
mkdir -p "$(dirname "$dir")"
rm -rf "$dir.old"
[ ! -e "$dir" ] || mv "$dir" "$dir.old"   # the old engine is put back if the new one cannot take its place
mv "$inner" "$dir" || { [ ! -e "$dir.old" ] || mv "$dir.old" "$dir"; die "cannot write $dir"; }
rm -rf "$dir.old"
[ -x "$bin" ] || die "the archive holds no zinc program ($bin)"
version=$("$bin" --version 2>/dev/null) || die "$bin does not start on this machine"

bindir=${ZINC_BIN_DIR:-}
if [ -z "$bindir" ]; then
  if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then bindir=/usr/local/bin; else bindir=$HOME/.local/bin; fi
fi
mkdir -p "$bindir"
ln -sf "$bin" "$bindir/zinc"
echo "zinc install: $version in $dir, linked as $bindir/zinc"
case ":$PATH:" in
  *":$bindir:"*) echo "next: zinc new game my-game && cd my-game && zinc run" ;;
  *)
    add="export PATH=\"$bindir:\$PATH\""
    case "${SHELL:-}" in */zsh) profile=$HOME/.zprofile ;; *) profile=$HOME/.profile ;; esac
    if [ "${ZINC_NO_MODIFY_PATH:-}" = 1 ]; then
      echo "$bindir is not on your PATH; add this line to $profile:  $add"
    else
      grep -qsF "$add" "$profile" || printf '\n# zinc\n%s\n' "$add" >> "$profile"
      echo "$bindir was added to your PATH in $profile"
    fi
    echo "next, in a new terminal: zinc new game my-game && cd my-game && zinc run" ;;
esac
