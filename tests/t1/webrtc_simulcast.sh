#!/bin/sh
# zinc:webrtc's VP8 layers (vendor/capi_zinc.cpp: our payload descriptor with PictureID, TL0PICIDX and TID; libvpx's two temporal layers;
# rid simulcast): the fake camera to a peer in this process (tests/golden/host/webrtc_simulcast.ts), 640x480, VP8, 3 s per case:
#   L1T2     one encoding in two temporal layers: the peer decodes it;
#   decline  two rid encodings, an answer without simulcast: the offer carries the rids, the first stream goes out alone and is decoded;
#   accept   the answer of a media server (a=simulcast:recv): rid h at 640x480 and rid l at 320x240 both go out;
#   low      the same with h inactive: l alone, which the peer decodes at 320x240.
# Interpreter only (the plugin's work, not the engine's).
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_FAKE_CAMERA=1 ZINC_FAKE_CAMERA_NOISE=24
unset ZINC_DETERMINISTIC ZINC_WEBRTC_IMPAIR
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for p in webrtc camera; do
  out=$("$ZINC" plugin-build $p 2>&1) && echo "$out" | grep -q "^$p \(built\|cached\) " || { echo "the $p plugin does not build: $(echo "$out" | grep -m3 error)"; exit 1; }
done
t=tests/golden/host/webrtc_simulcast.ts
for m in L1T2 decline accept low; do timeout 40 "$ZINC" run $t -- $m 640 480 3 >"$tmp/$m" 2>"$tmp/$m.err" & done
wait
fail=0
for m in L1T2 decline accept low; do
  grep -q '^{"mode"' "$tmp/$m" || { echo "$m: no result"; tail -5 "$tmp/$m.err"; fail=1; continue; }
  cat "$tmp/$m"
done
[ $fail = 0 ] || exit 1
num() { sed -n 's/.*"'"$2"'":\([0-9]*\).*/\1/p' "$tmp/$1"; }
has() { grep -q "$2" "$tmp/$1" || { echo "$1: $3"; fail=1; }; }
for m in L1T2 decline accept low; do [ "$(num $m decoded)" -ge 30 ] 2>/dev/null || { echo "$m: the peer decoded $(num $m decoded) frames"; fail=1; }; done
has decline '"offerRids":true' "the offer has no a=simulcast:send h;l"
has decline '"streams":\[{"rid":"","size":"640x480","frames":[1-9]' "not the first stream alone"
has accept '{"rid":"h","size":"640x480","frames":[1-9]' "no rid h stream at 640x480"
has accept '{"rid":"l","size":"320x240","frames":[1-9]' "no rid l stream at 320x240"
has low '"decodedSize":"320x240"' "the peer did not decode the rid l stream"
exit $fail
