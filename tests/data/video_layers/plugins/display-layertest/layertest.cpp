// display-layertest: a display with hardware layers, for tests/t1/video_layers.sh (ZN-731). It gives the program's first runtime image
// a picture "in device memory" whose content is that image's own pixels, takes the layer the runtime offers for it, and composes the
// frame over the picture the way a plane of a real display does (hal.h hal_layer_pixel): the result must be the frame the software
// rasterizer draws from the pixels. LAYERTEST=off: a display without layers. The last frame goes to $LAYERTEST_OUT as a PPM, and what
// happened to stderr.
#include "hal.h"
#include "zrt_raster.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

using namespace zrt;
static int W, H;
static uint32_t *px, *white;
static raster::Picture pic;
static bool attached, has;
static HalLayer lay;
static int offered, asked;

static void fill(void*) { asked++; pic.filled = true; }   // the image's pixels are the picture already
static uint32_t layers(const HalLayer* l, int32_t n) {
  has = n > 0;
  if (has) { lay = l[0]; offered++; }
  return has ? 1 : 0;
}
static int init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height;
  px = (uint32_t*)calloc((size_t)W * H, 4); white = (uint32_t*)calloc((size_t)W * H, 4);
  return 1;
}
static void present(const HalFrame* f) {
  int32_t iw = 0, ih = 0;
  if (!attached && raster::image_size(raster::DYN_BASE, &iw, &ih) && iw > 0) {   // from the next frame on, the image has a picture
    attached = true;
    pic.hal.serial = 1; pic.hal.w = iw; pic.hal.h = ih; pic.hal.nplanes = 1; pic.hal.fd[0] = -1;
    pic.bw = iw; pic.bh = ih; pic.fill = fill;
    raster::dyn_set_picture(raster::DYN_BASE, &pic);
  }
  f->render(px, 0, H);
  if (!has || !f->render_holes) return;
  f->render_holes(white, 0, H, 0xFFFFFF);
  const uint32_t* src; int32_t stride;
  if (!raster::dyn_view(raster::DYN_BASE, &src, &iw, &ih, &stride)) return;
  for (int y = lay.y < 0 ? 0 : lay.y; y < lay.y + lay.h && y < H; y++)
    for (int x = lay.x < 0 ? 0 : lay.x; x < lay.x + lay.w && x < W; x++) {
      const uint32_t a = hal_layer_pixel(px[y * W + x], white[y * W + x]), k = 255 - (a >> 24);
      const uint32_t v = src[(size_t)((y - lay.y) * ih / lay.h) * stride + (x - lay.x) * iw / lay.w];   // the plane: the picture, scaled
      uint32_t out = 0;
      for (int c = 0; c < 24; c += 8) out |= ((((a >> c) & 255) + ((v >> c) & 255) * k / 255) & 255) << c;
      px[y * W + x] = out;
    }
}
static void shutdown() {
  fprintf(stderr, "layertest: layers offered %d, pixels asked %d\n", offered, asked);
  const char* out = getenv("LAYERTEST_OUT");
  FILE* o = out ? fopen(out, "wb") : nullptr;
  if (!o) return;
  fprintf(o, "P6\n%d %d\n255\n", W, H);
  for (int i = 0; i < W * H; i++) { const uint8_t c[3] = {(uint8_t)(px[i] >> 16), (uint8_t)(px[i] >> 8), (uint8_t)px[i]}; fwrite(c, 1, 3, o); }
  fclose(o);
}
static uint32_t (*const with_layers)(const HalLayer*, int32_t) = getenv("LAYERTEST") && !strcmp(getenv("LAYERTEST"), "off") ? nullptr : layers;
static HalDisplay drv = {init, present, nullptr, shutdown, 0, 0, nullptr, with_layers};
static int registered = (hal_display = &drv, 0);
