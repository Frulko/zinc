#!/bin/sh
# Installs zinc with nothing to compile (ZN-718): the engine, its libraries, the templates and the plugins' native libraries, as released for this machine.
#
#   curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh                  # the zinc CLI
#   curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh -s -- --atelier  # and the Zinc Atelier app (macOS: the .app; Linux: an applications menu entry)
#
# It reads SHA256SUMS beside it, downloads the CLI archive of this system (zinc-<version>-<os>-<arch>.tar.gz: macOS arm64 / x86_64, Linux x86_64 / aarch64),
# checks its SHA-256, unpacks it into ~/.zinc/engine and links `zinc` into /usr/local/bin when you can write there, else into ~/.local/bin (added to your PATH
# in ~/.zprofile or ~/.profile). With --atelier (or ZINC_INSTALL_ATELIER=1) on a Mac it also installs Zinc-Atelier-<version>-macos-<arch>.zip, checked the same
# way, as "Zinc Atelier.app" in /Applications when you can write there, else in ~/Applications; on Linux it adds Zinc Atelier to the applications
# menu (~/.local/share/applications/zinc-atelier.desktop, on bin/zinc-atelier of the engine).
# Needs curl and what every Mac and Linux has (shasum or sha256sum, tar, ditto on a Mac); no compiler, no CMake, no Xcode, no administrator password.
# `zinc update` updates it (or run this again); `rm -rf ~/.zinc/engine ~/.zinc/engine.prev` and the link (and the app) to uninstall.
#   ZINC_INSTALL_URL   where SHA256SUMS and the archives are (default: the latest release of $ZINC_REPO, default Frulko/zinc; file:// works)
#   ZINC_INSTALL_DIR   where the engine goes (default ~/.zinc/engine)
#   ZINC_BIN_DIR       where the `zinc` link goes
#   ZINC_APP_DIR       where the app goes (default /Applications, else ~/Applications)
#   ZINC_NO_MODIFY_PATH=1   never write to a shell profile: the line to add is printed instead
set -eu
url=${ZINC_INSTALL_URL:-https://github.com/${ZINC_REPO:-Frulko/zinc}/releases/latest/download}
dir=${ZINC_INSTALL_DIR:-$HOME/.zinc/engine}
atelier=${ZINC_INSTALL_ATELIER:-0}
for a in "$@"; do case "$a" in --atelier) atelier=1 ;; *) echo "zinc install: unknown option $a (--atelier also installs the app)" >&2; exit 2 ;; esac; done
die() { echo "zinc install: $*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || die "curl is needed to download zinc (Linux: install the curl package)"
case "$(uname -s)" in
  Darwin) os=macos ;;
  Linux) os=linux ;;
  *) die "no prebuilt zinc for $(uname -s) yet: macOS and Linux only (Windows: build from the sources, docs/guide/01-getting-started.md)" ;;
esac
arch=$(uname -m)
case $os-$arch in   # the 32-bit Linux builds have one archive each, whatever the kernel says (tools/build-linux)
  linux-armv6l|linux-armv7l|linux-armv8l) arch=armhf ;;
  linux-i[3-6]86) arch=i686 ;;
  linux-aarch64) [ "$(getconf LONG_BIT 2>/dev/null)" != 32 ] || arch=armhf ;;   # a 32-bit Raspberry Pi OS on a 64-bit kernel
esac
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/SHA256SUMS" "$url/SHA256SUMS" || die "cannot read $url/SHA256SUMS: no network, or no release yet"

# fetch <prefix> <suffix>: downloads the file of SHA256SUMS whose name has that prefix and suffix, checks its SHA-256, prints its path
fetch() {
  line=$(grep -- " [*]\{0,1\}$1[^ /]*$2\$" "$tmp/SHA256SUMS" | head -1)
  [ -n "$line" ] || die "this release has no archive for this machine ($1*$2)"
  want=${line%% *}
  file=${line##* }; file=${file#\*}
  case "$file" in */*|"") die "SHA256SUMS names an unexpected file: $file" ;; esac
  echo "zinc install: downloading $file" >&2
  curl -fL --retry 2 -sS -o "$tmp/$file" "$url/$file" || die "the download of $url/$file failed"
  if command -v shasum >/dev/null 2>&1; then got=$(shasum -a 256 "$tmp/$file"); else got=$(sha256sum "$tmp/$file"); fi
  got=${got%% *}
  [ "$got" = "$want" ] || die "checksum mismatch for $file: got $got, SHA256SUMS says $want; nothing was installed"
  echo "$tmp/$file"
}

# both downloads are checked before anything is installed
pkg=$(fetch zinc- "-$os-$arch.tar.gz")
[ "$atelier" = 0 ] || [ "$os" = linux ] || appzip=$(fetch Zinc-Atelier- "-$os-$arch.zip")   # Linux: the CLI archive holds the Atelier's launcher
mkdir -p "$tmp/new"
tar -xzf "$pkg" -C "$tmp/new"
inner=$(echo "$tmp"/new/*)
bin="$dir/bin/zinc"
mkdir -p "$(dirname "$dir")"
rm -rf "$dir.old"
[ ! -e "$dir" ] || mv "$dir" "$dir.old"   # the old engine is put back if the new one cannot take its place
mv "$inner" "$dir" || { [ ! -e "$dir.old" ] || mv "$dir.old" "$dir"; die "cannot write $dir"; }
rm -rf "$dir.old"
[ -x "$bin" ] || die "the archive holds no zinc program ($bin)"
printf 'url=%s\nchannel=stable\n' "$url" > "$dir/.zinc-install"   # zinc update replaces this engine from there (and only an engine with this file)
version=$("$bin" --version 2>/dev/null) || die "$bin does not start on this machine"

bindir=${ZINC_BIN_DIR:-}
if [ -z "$bindir" ]; then
  if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then bindir=/usr/local/bin; else bindir=$HOME/.local/bin; fi
fi
mkdir -p "$bindir"
ln -sf "$bin" "$bindir/zinc"
echo "zinc install: $version in $dir, linked as $bindir/zinc"

if [ "$atelier" != 0 ] && [ "$os" = linux ]; then   # an entry of the applications menu (freedesktop), on bin/zinc-atelier of the engine
  [ -x "$dir/bin/zinc-atelier" ] || die "the archive holds no Atelier launcher ($dir/bin/zinc-atelier)"
  apps=${XDG_DATA_HOME:-$HOME/.local/share}/applications
  mkdir -p "$apps"
  printf '[Desktop Entry]\nType=Application\nName=Zinc Atelier\nComment=Make apps and games with Zinc\nExec="%s"\nIcon=%s\nTerminal=false\nCategories=Development;Education;\n' \
    "$dir/bin/zinc-atelier" "$dir/share/zinc/next/app/atelier/icon.png" > "$apps/zinc-atelier.desktop"
  echo "zinc install: Zinc Atelier in the applications menu ($apps/zinc-atelier.desktop), or run $dir/bin/zinc-atelier"
elif [ "$atelier" != 0 ]; then
  appdir=${ZINC_APP_DIR:-}
  if [ -z "$appdir" ]; then
    if [ -d /Applications ] && [ -w /Applications ]; then appdir=/Applications; else appdir=$HOME/Applications; fi
  fi
  mkdir -p "$tmp/app" "$appdir"
  ditto -x -k "$appzip" "$tmp/app"
  [ -x "$tmp/app/Zinc Atelier.app/Contents/MacOS/zinc-atelier" ] || die "the app archive holds no Zinc Atelier.app"
  rm -rf "$appdir/Zinc Atelier.app"
  mv "$tmp/app/Zinc Atelier.app" "$appdir/" || die "cannot write $appdir"
  echo "zinc install: Zinc Atelier in $appdir (open \"$appdir/Zinc Atelier.app\")"
fi

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
