#!/bin/sh
# Shared parser regression cases: headings, inline runs, code, lists, quotes and tables.
set -eu
cd "$(dirname "$0")/../.."
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 "$ZINC" run examples/agents/tests/markdown.test.ts
echo 'markdown: shared parser regression cases ok'
