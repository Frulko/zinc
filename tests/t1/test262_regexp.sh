#!/bin/sh
# The regular expression engine against test262 (ZN-090): 2557 tests of built-ins/RegExp, the String methods that take a RegExp and regexp literals, pinned in
# tests/data/test262-regexp.tar.xz (tc39/test262 c8c7988, see tests/data/test262.md), run on the QuickJS engine of the zinc binary. The failures are listed with a reason.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
python3 tools/test262 --zinc "$ZINC" --list tests/data/test262-regexp.failing
