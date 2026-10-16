#!/bin/sh
# Smoke test: the binary starts and reports the version of its build (CMake ZN_VERSION, by default git describe of the checkout, else 0.0.0-dev).
"$ZINC" --version | grep -Eq '^zinc-next [0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.+-]*)?$'
