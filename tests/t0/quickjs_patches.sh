#!/bin/sh
# The QuickJS-ng patch queue (ZN-595): third_party/quickjs-ng is the release of its PRISTINE file plus the patches of patches/, nothing else.
cd "$(dirname "$0")/../.." || exit 2
command -v patch >/dev/null && command -v shasum >/dev/null || { echo "skipped: no patch or shasum"; exit 77; }
tools/quickjs-patches check
