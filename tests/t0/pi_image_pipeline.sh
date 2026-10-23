#!/bin/sh
# No image, Docker, target binary, network or service is used.
cd "$(dirname "$0")/../.." || exit 2
command -v jq >/dev/null && command -v openssl >/dev/null || exit 77
python3 -B tests/data/pi-image/test_pipeline.py
