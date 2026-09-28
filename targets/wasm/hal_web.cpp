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
  // desktop input queue (hal.h HalKey / HalButtonEvent): keys with modifiers, typed text, mouse buttons, wheel
  Module.zq = []; Module.ztext = 0; Module.zclip = ''; Module.zwx = 0; Module.zwy = 0;
  const named = ['Backspace', 'Delete', 'Enter', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
  const mods = e => (e.shiftKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);
  const code = k => { const i = named.indexOf(k); if (i >= 0) return 256 + i; const f = /^F(\d+)$/.exec(k); if (f && +f[1] <= 12) return 268 + +f[1];
    return k.length === 1 && k.charCodeAt(0) < 127 ? k.toLowerCase().charCodeAt(0) : 0; };
  const key = (e, kind) => {
    Module.zmods = mods(e);
    const k = code(e.key);
    if (k) Module.zq.push({t: 1, a: k, b: mods(e), c: kind, d: 0});
    const typed = kind !== 1 && Module.ztext && [...e.key].length === 1 && !e.ctrlKey && !e.metaKey;
    if (typed) Module.zq.push({t: 2, a: 0, b: mods(e), c: 3, d: 0, s: e.key});
    // the page keeps Cmd/Ctrl shortcuts (copy/paste events feed the clipboard); keys for a text field stay in the canvas
    if (Module.ztext && !e.ctrlKey && !e.metaKey && (typed || k >= 256)) e.preventDefault();
  };
  addEventListener('keydown', e => key(e, e.repeat ? 2 : 0));
  addEventListener('keyup', e => key(e, 1));
  addEventListener('paste', e => { Module.zclip = e.clipboardData.getData('text'); });
  const btn = (e, down) => { pos(e); Module.zmods = mods(e); Module.zq.push({t: 3, a: e.button, b: down, c: 0, d: 0, x: Module.zmx, y: Module.zmy}); };
  c.addEventListener('mousedown', e => btn(e, 1));
  addEventListener('mouseup', e => btn(e, 0));
  c.addEventListener('contextmenu', e => e.preventDefault());
  c.addEventListener('wheel', e => { Module.zwy -= e.deltaY / 100; Module.zwx += e.deltaX / 100; e.preventDefault(); }, {passive: false});
  Module.zctx = c.getContext('2d');
});
// Next queued input event: 0 none, 1 key, 2 text (UTF-8 into text, length in out[3]), 3 button (x, y in fout).
EM_JS(int, web_event, (int32_t* out, float* fout, char* text, int cap), {
  const e = Module.zq.shift();
  if (!e) return 0;
  HEAP32[out >> 2] = e.a; HEAP32[(out >> 2) + 1] = e.b; HEAP32[(out >> 2) + 2] = e.c; HEAP32[(out >> 2) + 3] = 0;
  if (e.s) { const b = new TextEncoder().encode(e.s).subarray(0, cap); HEAPU8.set(b, text); HEAP32[(out >> 2) + 3] = b.length; }
  if (e.t === 3) { HEAPF32[fout >> 2] = e.x; HEAPF32[(fout >> 2) + 1] = e.y; }
  return e.t;
});
EM_JS(double, web_wheel, (int x), { const v = x ? Module.zwx : Module.zwy; if (x) Module.zwx = 0; else Module.zwy = 0; return v; });
EM_JS(void, web_text_input, (int on), { Module.ztext = on; });
EM_JS(int, web_mods, (), { return Module.zmods | 0; });
EM_JS(int, web_clip_get, (char* buf, int cap), { const b = new TextEncoder().encode(Module.zclip).subarray(0, cap - 1); HEAPU8.set(b, buf); HEAPU8[buf + b.length] = 0; return b.length; });
EM_JS(void, web_clip_set, (const char* s, int n), { Module.zclip = UTF8ToString(s, n); if (navigator.clipboard) navigator.clipboard.writeText(Module.zclip).catch(() => {}); });
EM_JS(void, web_cursor, (int c), {
  const names = ['default', 'text', 'pointer', 'move', 'ew-resize', 'ns-resize', 'crosshair', 'grab', 'grabbing', 'not-allowed'];
  document.getElementById('zinc-canvas').style.cursor = names[c] || 'default';
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
void hal_poll_input(HalInput* in) {
  in->buttons = web_keys(); in->px = (float)web_mx(); in->py = (float)web_my(); in->pdown = web_md(); in->quit = 0;
  in->nkeys = 0; in->ntext = 0; in->nbtn = 0;
  in->wheel += (float)web_wheel(0); in->wheel_x = (float)web_wheel(1); in->mods = (uint32_t)web_mods();
  int32_t ev[4]; float pos[2];
  while (int t = web_event(ev, pos, in->text + in->ntext, HAL_TEXT_BYTES - in->ntext)) {
    if (t == 3) {
      if (in->nbtn < HAL_MAX_BUTTON_EVENTS) in->btn[in->nbtn++] = HalButtonEvent{pos[0], pos[1], ev[0], ev[1]};
      in->pbuttons = ev[1] ? in->pbuttons | (ev[0] == 0 ? 1u : ev[0] == 2 ? 2u : 4u) : in->pbuttons & ~(ev[0] == 0 ? 1u : ev[0] == 2 ? 2u : 4u);
      continue;
    }

    if (in->nkeys == HAL_MAX_KEYS) continue;
    in->keys[in->nkeys++] = HalKey{ev[0], (uint32_t)ev[1], ev[2], (uint16_t)in->ntext, (uint16_t)ev[3]};
    in->ntext += ev[3];
  }
}
void hal_text_input(int32_t on, float, float, float, float) { web_text_input(on); }
const char* hal_clipboard_get(void) { static char buf[65536]; web_clip_get(buf, sizeof buf); return buf; }
void hal_clipboard_set(const char* s, size_t n) { web_clip_set(s, (int)n); }
void hal_set_cursor(int32_t c) { web_cursor(c); }
void hal_present(const HalFrame* f) {
  if (!fb) fb = (uint32_t*)calloc((size_t)W * H, 4);
  if (f->y1 <= f->y0) return;
  (f->render_damage ? f->render_damage : f->render)(fb + (size_t)f->y0 * W, f->y0, f->y1);  // fb keeps the previous frame
  web_blit(fb, W, f->y0, f->y1);
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
double hal_fixed_dt(void) { return 0; }
static int (*loop_fn)(void);
static void tick() { if (!loop_fn()) emscripten_cancel_main_loop(); }
void hal_run(int (*step)(void)) { loop_fn = step; emscripten_set_main_loop(tick, 0, 1); }
}
