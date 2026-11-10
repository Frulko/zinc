#!/bin/sh
# Projection math used by the software and GL depth queries; no renderer or display needed.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"${CXX:-c++}" -std=c++20 -Wall -Wextra -Werror -I . tests/native/zinc3d_visibility.cpp -o "$tmp/check"
timeout 5 "$tmp/check"
