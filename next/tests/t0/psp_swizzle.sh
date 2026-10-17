#!/bin/sh
BUILD=${BUILD:-build}
cat > /tmp/scratchpad/sw.cpp <<'EOF'
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
g++ -std=c++20 -I/Users/mowmow/Lab/zinc/next/src -I/Users/mowmow/Lab/zinc/next/include /tmp/scratchpad/sw.cpp /Users/mowmow/Lab/zinc/next/src/assets/console_tex.cpp -o /tmp/scratchpad/sw && /tmp/scratchpad/sw