#!/bin/sh
# docs/ui.md style tables are generated from lib/std/ui.ts and the token golden (ZN-279).
cd "$(dirname "$0")/../.." || exit 2
tools/ui-docs --check
