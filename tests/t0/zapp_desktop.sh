#!/bin/sh
# Desktop archive metadata, installation and literal file arguments (ZN-391).
cd "$(dirname "$0")/../.." || exit 2
exec python3 tests/data/zapp-desktop/check.py
