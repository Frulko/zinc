#include "zn/embed.h"
#include "zn/app.h"
#include <cassert>
#include <cstdio>
extern "C" void* hal_window_handle();
int main(int argc, char** argv) {
  assert(zn_embed_install(-1, 32, 1) == -1);
  assert(zn_embed_install(32, 32, 1) == 0);
  assert(zn_embed_install(32, 32, 1) == -1);
  zn_embed_transparent(1);
  assert(zn_app_init(argc, argv) == 0);
  assert(hal_window_handle() == nullptr);
  assert(zn_embed_tick() == 0);
  ZnEmbedFrame f{}; assert(zn_embed_frame(&f));
  assert(f.width == 32 && f.height == 32 && f.stride_bytes == 128);
  assert(f.pixels[0] == 0);
  auto p = f.pixels[16 * 32 + 16];
  assert((p >> 24) >= 127 && (p >> 24) <= 129);
  assert(((p >> 16) & 255) >= 127 && (p & 65535) == 0);
  auto serial = f.serial;
  zn_embed_pause(1); assert(zn_embed_tick() == 0);
  zn_embed_frame(&f); assert(f.serial == serial);
  ZnEmbedEvent e{}; e.kind = ZN_EMBED_DOWN; e.x = e.y = 16;
  assert(zn_embed_event(&e)); zn_embed_pause(0); assert(zn_embed_tick() == 0);
  zn_embed_frame(&f); assert((f.pixels[16 * 32 + 16] & 0xff00) != 0);
  e.kind = ZN_EMBED_BLUR; assert(zn_embed_event(&e));
  assert(zn_embed_resize(48, 24, 2) == 0); assert(zn_embed_tick() == 0);
  zn_embed_frame(&f); assert(f.width == 96 && f.height == 48);
  assert(hal_window_handle() == nullptr);
  zn_embed_quit(); zn_embed_quit(); assert(!zn_embed_frame(&f));
  puts("embed: offscreen alpha input pause resize shutdown passed");
}
