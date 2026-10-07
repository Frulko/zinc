#!/bin/sh
# Date in other time zones (ZN-093): tests/golden/run/date_full.ts prints the same lines as Node does with TZ set to America/New_York, Europe/Paris and Asia/Kolkata (UTC is the golden
# of the run tier). A deterministic run is UTC unless TZ is set; here it is. The abbreviation-to-name table covers the common zones, so these three are in it.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for tz in America/New_York Europe/Paris Asia/Kolkata; do
  exp=tests/data/date_zones/$(echo "$tz" | tr '/' '_').out
  TZ=$tz "$ZINC" run tests/golden/run/date_full.ts 2>&1 | diff -q - "$exp" >/dev/null || { echo "Date in $tz differs from Node"; fail=1; }
done
exit $fail
