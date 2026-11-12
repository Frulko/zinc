#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
case $(uname -s) in
  Darwin) libs='-framework CoreFoundation';;
  Linux) libs='-ldl';;
  *) exit 0;;
esac
${CXX:-c++} -std=c++20 -I src tests/native/bundle_licenses.cpp src/platform/platform.cpp $libs -o "$tmp/check"
"$tmp/check" "$tmp/app"
