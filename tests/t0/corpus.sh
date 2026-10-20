#!/bin/sh
# The frozen corpus matches its manifest, with no Node involved.
cd "$(dirname "$0")/../../corpus" && shasum -a 256 -c --quiet MANIFEST.sha256
