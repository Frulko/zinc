#!/bin/sh
# the PSP texture swizzle (ZN-452) undoes itself: pspUnswizzle8(pspSwizzle8(x)) == x
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/sw.cpp" <<'EOF'
#include "assets/console_tex.h"
#include <cassert>
#include <cstdio>
#include <vector>
int main() {
  int w=16,h=16;
  std::vector<unsigned char> a(w*h);
  for (int i=0;i<w*h;i++) a[i]=i&0xff;
  auto b=a;
  zn::assets::pspSwizzle8(b,w,h);
  zn::assets::pspUnswizzle8(b,w,h);
  if (b!=a) { printf("mismatch\n"); return 1; }
  printf("ok\n"); return 0;
}
EOF
c++ -std=c++20 -w -Isrc -Iinclude -Ithird_party/rg_etc1 "$tmp/sw.cpp" src/assets/console_tex.cpp third_party/rg_etc1/rg_etc1.cpp -o "$tmp/sw" && "$tmp/sw"
