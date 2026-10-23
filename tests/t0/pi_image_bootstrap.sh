#!/bin/sh
# Real cloud-config generation and cleanup decisions, no image/board build.
cd "$(dirname "$0")/../.." || exit 2
command -v jq >/dev/null && command -v openssl >/dev/null || exit 77
python3 -B tests/data/pi-image/test_bootstrap.py
