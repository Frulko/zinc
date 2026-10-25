#include "Observatory.h"
#include <cassert>
#include <cstdio>
#include <initializer_list>
int main() {
  assert(obs_start() == 0); assert(obs_has_external_window() == 0);
  obs_controls(2, 1, 2); assert(zn_embed_tick() == 0); assert(obs_selected() == 2);
  ZnEmbedFrame frame{}; assert(zn_embed_frame(&frame)); auto serial = frame.serial;
  assert(zn_embed_tick() == 0); zn_embed_frame(&frame); assert(frame.serial == serial);
  ZnEmbedEvent event{}; event.kind = ZN_EMBED_KEY_DOWN; event.key = 259;
  assert(zn_embed_event(&event)); assert(zn_embed_tick() == 0); assert(obs_selected() == 0);
  obs_controls(1, 1, 1); assert(zn_embed_tick() == 0); assert(obs_selected() == 1);
  for (int kind : {ZN_EMBED_DOWN, ZN_EMBED_UP}) {
    event = {}; event.kind = kind; event.x = 360; event.y = 260;
    assert(zn_embed_event(&event)); assert(zn_embed_tick() == 0);
  }
  assert(obs_selected() == 0);
  assert(zn_embed_resize(480, 320, 1) == 0); assert(zn_embed_tick() == 0);
  zn_embed_frame(&frame); assert(frame.width == 480 && frame.height == 320);
  assert(obs_has_external_window() == 0); obs_stop(); obs_stop();
  puts("observatory: real AOT two-way controls, selection, idle, resize, shutdown passed");
}
