#!/bin/sh
# Explicitly selected, prepared Linux kernel only; never loads modules or mounts.
set -eu
cd "$(dirname "$0")/../.."
exec python3 tools/check-gpio-sim.py
