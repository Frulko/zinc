#!/bin/sh
# Builds AppLoad v0.6.0 + 0001-window-state.patch + 0002-widgets-and-icons.patch for the reMarkable Paper Pro
# the way AppLoad's own CI does (.github/workflows/build-release.yml), in Docker.
# Output: <repo>/dist/rmpp/appload-window.so
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../.." && pwd)
out="$repo/dist/rmpp"

APPLOAD_TAG=v0.6.0
# Pinned: xovi master on 2026-10-25, the toolchain image index digest used for the first build.
XOVI_COMMIT=2b99649f5e4fd6288be7792a8570bd16418adb70
IMAGE=eeems/remarkable-toolchain@sha256:3576ab0c6a75b081e30a84abf67bf7473ff449f63d4f1fad740538de145810cb

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone -q --depth 1 --branch "$APPLOAD_TAG" https://github.com/asivery/rm-appload.git "$work/appload"
for patch in "$here"/0*.patch; do git -C "$work/appload" apply "$patch"; done
git clone -q https://github.com/asivery/xovi.git "$work/xovi"
git -C "$work/xovi" -c advice.detachedHead=false checkout -q "$XOVI_COMMIT"

docker run --rm -v "$work:/w" -e DEBIAN_FRONTEND=noninteractive -e XOVI_REPO=/w/xovi "$IMAGE" bash -euc '
  apt-get update -qq >/dev/null
  apt-get install -y -qq qt6-base-dev >/dev/null
  ln -sf /usr/lib/qt6/libexec/rcc /usr/local/bin/rcc
  set +u; . /opt/codex/*/*/environment-setup-*; set -u
  cd /w/appload/xovi && ./make.sh >/w/build.log 2>&1 || { tail -50 /w/build.log; exit 1; }
'

mkdir -p "$out"
cp "$work/appload/xovi/appload.so" "$out/appload-window.so"
file "$out/appload-window.so"
shasum -a 256 "$out/appload-window.so"
