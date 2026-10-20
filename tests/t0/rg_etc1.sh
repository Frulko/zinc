#!/bin/sh
# rg_etc1 (ZN-452) packs a block and unpacks it again
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/et.cpp" <<'EOF'
#include "rg_etc1.h"
#include <cstdio>
int main() {
  rg_etc1::pack_etc1_block_init();
  unsigned int src[16];
  for (int i=0;i<16;i++) src[i]=0xFF0000FF; // red
  unsigned char block[8];
  rg_etc1::etc1_pack_params p;
  unsigned int err = rg_etc1::pack_etc1_block(block, src, p);
  printf("packed err=%u\n", err);
  unsigned int dst[16];
  bool ok = rg_etc1::unpack_etc1_block(block, dst);
  printf("unpack ok=%d first=0x%08X\n", ok, dst[0]);
  return ok ? 0 : 1;
}
EOF
c++ -std=c++20 -w -Ithird_party/rg_etc1 "$tmp/et.cpp" third_party/rg_etc1/rg_etc1.cpp -o "$tmp/et" && "$tmp/et"
