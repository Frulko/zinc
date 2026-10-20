#!/bin/sh
# Standard library surface (ZN-060): every member of lib/zinc.d.ts that tools/dts-walk probes is accepted by the checker,
# except the ones listed with a reason in tests/data/std_surface.exceptions.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC="$ZINC" python3 tools/dts-walk --exceptions tests/data/std_surface.exceptions 2>&1) || { echo "$out" | tail -15; exit 1; }
exit 0
