#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* One main-thread runtime per process. Install before generated zn_app_init(argc,argv).
   Logical dimensions; integer scale 1..4. Returns 0 success, -1 invalid/busy. */
int zn_embed_install(int width, int height, int scale);
int zn_embed_resize(int width, int height, int scale);
void zn_embed_pause(int paused);
int zn_embed_tick(void); /* zn_app_iterate codes: 0 running, 1 done, -1 error */
enum ZnEmbedEventKind { ZN_EMBED_MOVE, ZN_EMBED_DOWN, ZN_EMBED_UP, ZN_EMBED_WHEEL,
  ZN_EMBED_KEY_DOWN, ZN_EMBED_KEY_UP, ZN_EMBED_KEY_REPEAT, ZN_EMBED_TEXT, ZN_EMBED_BLUR };
typedef struct ZnEmbedEvent {
  int32_t kind, key; uint32_t mods; float x, y, value; char text[256];
} ZnEmbedEvent;
/* Local logical coordinates, pointer key 0 left/1 middle/2 right; keyboard codes
   and modifier bits follow runtime/include/hal.h. Returns accepted, not UI consumption.
   Queue-full/invalid = 0; caller retains gameplay focus policy and IME composition. */
int zn_embed_event(const ZnEmbedEvent* event);
typedef struct ZnEmbedFrame {
  const uint32_t* pixels; int32_t width, height, stride_bytes; uint64_t serial;
} ZnEmbedFrame;
/* Persistent owned 0xAARRGGBB premultiplied pixels (little endian BGRA), top-left.
   Pointer valid until resize/quit; contents may change at next tick. Serial changes
   only on presentation. Host must copy before another tick if asynchronous. */
int zn_embed_frame(ZnEmbedFrame* frame);
/* Opt-in: CLEAR commands become transparent, other paint retains alpha coverage.
   CPU black/white reconstruction; no shared GPU texture or partial upload claim. */
void zn_embed_transparent(int enabled);
void zn_embed_quit(void); /* stop ticks first; idempotent; releases surface */
#ifdef __cplusplus
}
#endif
