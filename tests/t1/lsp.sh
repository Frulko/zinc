#!/bin/sh
# Language server (ZN-142): tests/lsp/lsp_test.py drives `zinc lsp` through initialize, didOpen, didChange, hover, completion, definition, documentSymbol and shutdown; its diagnostics equal `zinc check --json`.
cd "$(dirname "$0")/../.." || exit 2
python3 tests/lsp/lsp_test.py "$ZINC"
