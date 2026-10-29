#!/bin/sh
# crypto.subtle known answers (ZN-089), on the interpreter and QuickJS: digests, HMAC, AES-CBC/CTR/GCM, PBKDF2, HKDF, ECDH and ECDSA on PSA; see tests/golden/host/subtle.ts for the vectors.
cd "$(dirname "$0")/../.." || exit 2
out=$("$ZINC" run tests/golden/host/subtle.ts 2>&1)
printf '%s\n' "$out" | diff -u tests/golden/host/subtle.out - >/dev/null || { echo "crypto.subtle output differs"; printf '%s\n' "$out" | head -20; exit 1; }
printf '%s\n' "$out" | grep -q FAIL && { echo "a known answer failed"; exit 1; }
# QuickJS: the same answers (the results cross as hex text, which its UTF-8 strings keep byte for byte)
"$ZINC" run tests/golden/host/subtle.ts --engine quickjs 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/subtle.out - >/dev/null || { echo "crypto.subtle differs on QuickJS"; exit 1; }
exit 0
