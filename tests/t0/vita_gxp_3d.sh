#!/bin/sh
# ZN-493 (first milestone): the GXM 3D path needs a compiled colour pair with a z. The test checks
# the state of targets/vita/shaders/ and never fails while the pair is simply not compiled yet:
#   - a committed .gxp blob that is empty or not a GXP (magic "GXP\0"): FAIL (a broken blob);
#   - no .gxp blob yet: exit 77 (SKIP), with the reason (no vita-shader-compiler on this machine;
#     the compile is the maintainer step of targets/vita/shaders/README.md).
cd "$(dirname "$0")"/../../.. || exit 2
shaders=targets/vita/shaders
found=0
for g in "$shaders"/*.gxp; do
  [ -e "$g" ] || { [ $found -eq 1 ] && continue; break; }
  found=1
  if [ ! -s "$g" ]; then
    echo "vita gxp 3d: $g is empty (targets/vita/shaders/README.md)"; exit 1
  fi
  if [ "$(head -c 4 "$g")" != "GXP" ]; then
    echo "vita gxp 3d: $g has no GXP magic"; exit 1
  fi
done
if [ $found -eq 1 ]; then
  echo "vita gxp 3d: ok, the colour pair is compiled."
  exit 0
fi
if command -v vita-shader-compiler >/dev/null 2>&1 || [ -n "$(find "${VITASDK:-$HOME/VitaSDK}" -name vita-shader-compiler -type f 2>/dev/null | head -1)" ]; then
  echo "vita gxp 3d: a shader compiler is present but $shaders holds no .gxp: run the compile step (targets/vita/shaders/README.md)"; exit 1
fi
echo "vita gxp 3d: skipped, no compiled pair (no vita-shader-compiler on this machine)"
exit 77
