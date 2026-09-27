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
EM_JS(void, web_present, (const void* cmds, int count, const char* text), {
  const g = Module.zctx; if (!g) return;
  const col = c => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
  const dv = new DataView(HEAPU8.buffer);
  for (let i = 0; i < count; i++) {
    const p = cmds + i * 28;
    const kind = HEAPU8[p], scale = HEAPU8[p + 1], tlen = dv.getUint16(p + 2, true);
    const color = dv.getUint32(p + 4, true), toff = dv.getUint32(p + 8, true);
    const x = dv.getFloat32(p + 12, true), y = dv.getFloat32(p + 16, true), w = dv.getFloat32(p + 20, true), h = dv.getFloat32(p + 24, true);
    g.fillStyle = col(color); g.strokeStyle = col(color);
    if (kind === 0) g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    else if (kind === 1) g.fillRect(x, y, w, h);
    else if (kind === 2) { g.beginPath(); g.moveTo(x + 0.5, y + 0.5); g.lineTo(w + 0.5, h + 0.5); g.stroke(); }
    else if (kind === 3) { g.font = 'bold ' + (8 * scale) + 'px monospace'; g.textBaseline = 'top'; const t = UTF8ToString(text + toff, tlen); for (let k = 0; k < t.length; k++) g.fillText(t[k], x + k * 8 * scale, y); }
  }
});

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
void hal_present(const HalDrawList* dl) { static_assert(sizeof(HalDrawCmd) == 28, "JS reads 28-byte commands"); web_present(dl->cmds, (int)dl->count, dl->text); }
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
double hal_fixed_dt(void) { return 0; }
static int (*loop_fn)(void);
static void tick() { if (!loop_fn()) emscripten_cancel_main_loop(); }
void hal_run(int (*step)(void)) { loop_fn = step; emscripten_set_main_loop(tick, 0, 1); }
}
