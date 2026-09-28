// Self-check of the RLE codec: c++ -std=c++17 plugins/display-remote/rle_check.cpp -o /tmp/rle && /tmp/rle
#include "remote_proto.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
int main() {
  static uint32_t a[5000], b[5000];
  static uint8_t enc[20000];
  for (int t = 0; t < 500; t++) {
    int w = 1 + rand() % 70, h = 1 + rand() % 70;
    for (int i = 0; i < w * h; i++) a[i] = rand() % 4 == 0 ? (uint32_t)rand() & 0xffffff : (i ? a[i - 1] : 0);
    uint32_t n = zremote::rle_encode(a, (uint32_t)(w * h), enc);
    assert(n <= zremote::rle_bound((uint32_t)(w * h)));
    assert(zremote::rle_decode(enc, n, b, w, w, h));
    for (int i = 0; i < w * h; i++) assert(a[i] == b[i]);
    assert(!zremote::rle_decode(enc, n - 1, b, w, w, h));
  }
  puts("rle ok");
}
