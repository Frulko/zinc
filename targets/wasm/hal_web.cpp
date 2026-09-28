// Web HAL (emscripten): canvas 2D rendering, keyboard/mouse input, requestAnimationFrame loop.
#include "hal.h"
#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>

static int W = 320, H = 240;
static uint32_t keys = 0;
static float mx = 0, my = 0;
static int mdown = 0;

EM_JS(void, web_init, (int w, int h, const char* title), {
  const c = document.getElementById('zinc-canvas');
  c.width = w; c.height = h;
  c.style.width = (w * (w <= 400 ? 3 : 2)) + 'px';
  c.style.imageRendering = 'pixelated';
  document.title = UTF8ToString(title);
  const map = { ArrowUp: 0, KeyW: 0, ArrowDown: 1, KeyS: 1, ArrowLeft: 2, KeyA: 2, ArrowRight: 3, KeyD: 3, Space: 4, KeyZ: 4, KeyX: 5, KeyC: 6, KeyV: 7, KeyQ: 8, KeyE: 9, Enter: 10, Tab: 11 };
  Module.zkeys = 0;
  addEventListener('keydown', e => { if (e.code in map) { Module.zkeys |= 1 << map[e.code]; e.preventDefault(); } });
  addEventListener('keyup', e => { if (e.code in map) Module.zkeys &= ~(1 << map[e.code]); });
  const pos = e => { const r = c.getBoundingClientRect(); Module.zmx = (e.clientX - r.left) * c.width / r.width; Module.zmy = (e.clientY - r.top) * c.height / r.height; };
  c.addEventListener('mousemove', pos);
  c.addEventListener('mousedown', e => { pos(e); Module.zmd = 1; });
  addEventListener('mouseup', () => { Module.zmd = 0; });
  Module.zctx = c.getContext('2d');
});
EM_JS(uint32_t, web_keys, (), { return Module.zkeys | 0; });
EM_JS(double, web_mx, (), { return Module.zmx || 0; });
EM_JS(double, web_my, (), { return Module.zmy || 0; });
EM_JS(int, web_md, (), { return Module.zmd | 0; });
EM_JS(void, web_blit, (const uint32_t* fb, int w, int y0, int y1), {
  const g = Module.zctx; if (!g || y1 <= y0) return;
  const img = g.createImageData(w, y1 - y0), d = img.data, src = HEAPU32, base = fb >> 2;
  for (let i = 0, n = w * (y1 - y0); i < n; i++) { const p = src[base + y0 * w + i]; d[i * 4] = (p >> 16) & 255; d[i * 4 + 1] = (p >> 8) & 255; d[i * 4 + 2] = p & 255; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, y0);
});
static uint32_t* fb;

extern "C" {
void hal_init(const HalConfig* cfg) { W = cfg->width; H = cfg->height; web_init(W, H, cfg->title); }
void hal_shutdown(void) {}
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) { return (uint64_t)(emscripten_get_now() * 1000.0); }
void hal_sleep_us(uint64_t) {}
void hal_log(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
void hal_log_err(const char* s, size_t n) { fwrite(s, 1, n, stderr); fflush(stderr); }
int hal_isatty(int) { return 0; }
const char* hal_env(const char*) { return nullptr; }
void hal_heap_region(void** base, size_t* size) { *size = 32u << 20; *base = malloc(*size); }
void hal_panic(const char* msg, const char* file, int line) {
  if (file && *file) fprintf(stderr, "panic: %s (%s:%d)\n", msg, file, line); else fprintf(stderr, "panic: %s\n", msg);
  emscripten_cancel_main_loop();
  emscripten_force_exit(101);
  __builtin_unreachable();
}
void hal_frame_begin(void) {}
void hal_frame_end(void) {}
void hal_poll_input(HalInput* in) { in->buttons = web_keys(); in->px = (float)web_mx(); in->py = (float)web_my(); in->pdown = web_md(); in->quit = 0; }
void hal_present(const HalFrame* f) {
  if (!fb) fb = (uint32_t*)calloc((size_t)W * H, 4);
  if (f->y1 <= f->y0) return;
  f->render(fb + (size_t)f->y0 * W, f->y0, f->y1);
  web_blit(fb, W, f->y0, f->y1);
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
double hal_fixed_dt(void) { return 0; }
static int (*loop_fn)(void);
static void tick() { if (!loop_fn()) emscripten_cancel_main_loop(); }
void hal_run(int (*step)(void)) { loop_fn = step; emscripten_set_main_loop(tick, 0, 1); }
}
