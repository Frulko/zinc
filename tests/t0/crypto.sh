#!/bin/sh
# crypto.subtle known answers (ZN-089): digests, HMAC, AES-CBC/CTR/GCM, PBKDF2, HKDF, ECDH and ECDSA on PSA; see tests/golden/host/subtle.ts for the vectors.
cd "$(dirname "$0")/../.." || exit 2
out=$("$ZINC" run tests/golden/host/subtle.ts 2>&1)
printf '%s\n' "$out" | diff -u tests/golden/host/subtle.out - >/dev/null || { echo "crypto.subtle output differs"; printf '%s\n' "$out" | head -20; exit 1; }
printf '%s\n' "$out" | grep -q FAIL && { echo "a known answer failed"; exit 1; }
exit 0
