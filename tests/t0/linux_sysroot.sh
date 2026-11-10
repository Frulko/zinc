#!/bin/sh
# Offline archive trust boundary, locked publication, repair and preservation.
set -eu
cd "$(dirname "$0")/../.."
exec python3 tests/data/linux_sysroot.py
