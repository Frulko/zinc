#!/bin/sh
# WCAG AA contrast of the kit themes (ZN-276): fails when a text role falls below 4.5:1 on its surface.
cd "$(dirname "$0")/../.." || exit 2
tools/contrast-check >/dev/null || { tools/contrast-check | grep FAIL; exit 1; }
