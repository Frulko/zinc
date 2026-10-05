#!/bin/sh
# Smoke test: the binary starts and reports its version.
[ "$("$ZINC" --version)" = "zinc-next 0.0.1" ]
