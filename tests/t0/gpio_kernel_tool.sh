#!/bin/sh
# Pure runner validation/cleanup proof; no configfs, device or kernel GPIO access.
set -eu
cd "$(dirname "$0")/../.."
timeout 5 python3 tools/check-gpio-sim.py --self-check
set +e
output=$(env -u ZINC_GPIO_KERNEL_TEST timeout 5 python3 tools/check-gpio-sim.py 2>&1)
code=$?
set -e
[ "$code" = 77 ] || { printf '%s\n' "$output"; exit 1; }
printf '%s\n' "$output" | grep -q '^SKIP gpio_kernel: set ZINC_GPIO_KERNEL_TEST=1 '
