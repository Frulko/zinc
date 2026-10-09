#!/bin/sh
# OLPC canonical JSON and TUF signatures (ZN-336.02, src/tc/tuf.cpp): `zinc index-sign` signs the canonical "signed" part (sorted keys, no spaces, only \"
# and \\ escaped) with keyid = SHA-256 of the canonical key; the golden signature and keyid are what securesystemslib (python-tuf's library) gives for the same
# seed and document, so the bytes signed are the reference's.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf '{"signed": {"_type": "timestamp", "version": 7, "z": "a\\\\b\\"c", "a": [1, {"y": true, "x": null}], "expires": "2030-01-01T00:00:00Z"}}\n' > "$tmp/m.json"
"$ZINC" index-sign "$tmp/m.json" 0000000000000000000000000000000000000000000000000000000000000001 || { echo "tuf_canonical: index-sign failed"; exit 1; }
grep -q '"keyid": "816219aecb29969fa104948678257af13ac9421951da3e14ccf28949f33c3126"' "$tmp/m.json" || { echo "tuf_canonical: the keyid differs from securesystemslib's"; exit 1; }
grep -q '"sig": "68a55e7fb6f704c122b342c4178912854f2d773b5eb4e63dcf2fcdede391d46d2e04253264b24dcd0d229f51d2a9eab7c4c868f81b262ae2fd600caee5021d0a"' "$tmp/m.json" || { echo "tuf_canonical: the signature differs: the canonical bytes are not the reference's"; exit 1; }
printf '{"signed": {"_type": "root", "n": 1.5}}\n' > "$tmp/f.json"
"$ZINC" index-sign "$tmp/f.json" 0000000000000000000000000000000000000000000000000000000000000001 2>/dev/null && { echo "tuf_canonical: a float was signed (TUF metadata has integers only)"; exit 1; }
exit 0
