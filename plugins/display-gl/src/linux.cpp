// display-gl on Linux: on an X session (DISPLAY, XWayland included) a window, since the display server holds the screen; otherwise the screen itself through KMS.
// ZINC_GL_BACKEND=kms|window overrides.
#include "hal.h"
#include "zgl.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

bool zgl_kms_init(const HalConfig*); int32_t zgl_kms_scale(); void zgl_kms_size(int32_t*, int32_t*); void zgl_kms_native(int32_t*, int32_t*);
void zgl_kms_swap(); void zgl_kms_poll(HalInput*, int32_t, int32_t); void zgl_kms_shutdown(); extern "C" const char* zgl_kms_egl();
bool zgl_window_init(const HalConfig*); void zgl_window_size(int32_t*, int32_t*);
bool zgl_window_exposed(); void zgl_window_current(); void zgl_window_swap(); void zgl_window_poll(HalInput*, int32_t, int32_t); void zgl_window_shutdown(); extern "C" const char* zgl_window_egl();

static int window_state = -1;   // -1 not decided; a window that cannot open (no X server, no libX11) falls back on the screen
static bool windowed() {
  if (window_state < 0) {
    const char* b = getenv("ZINC_GL_BACKEND");
    const char* x = getenv("DISPLAY");
    window_state = b && *b ? strcmp(b, "kms") != 0 : x && *x;
  }
  return window_state != 0;
}
bool zgl_backend_init(const HalConfig* c) {
  if (getenv("ZINC_HEADLESS") && atoi(getenv("ZINC_HEADLESS")) != 0) return false;   // the null HAL keeps the program: no window, no screen taken
  if (windowed()) {
    if (zgl_window_init(c)) return true;
    window_state = 0;
    fprintf(stderr, "display-gl: no window, trying the screen\n");
  }
  return zgl_kms_init(c);
}
int32_t zgl_backend_scale() { return windowed() ? 1 : zgl_kms_scale(); }
void zgl_backend_size(int32_t* w, int32_t* h) { windowed() ? zgl_window_size(w, h) : zgl_kms_size(w, h); }
void zgl_backend_native(int32_t* w, int32_t* h) { if (!windowed()) zgl_kms_native(w, h); }   // a window: the size the program names, else the default one
extern "C" bool zgl_backend_needs_present() { return windowed() && zgl_window_exposed(); }
extern "C" void zgl_backend_current() { if (windowed()) zgl_window_current(); }
void zgl_backend_swap() { windowed() ? zgl_window_swap() : zgl_kms_swap(); }
void zgl_backend_poll(HalInput* in, int32_t w, int32_t h) { windowed() ? zgl_window_poll(in, w, h) : zgl_kms_poll(in, w, h); }
void zgl_backend_shutdown() { windowed() ? zgl_window_shutdown() : zgl_kms_shutdown(); }
extern "C" const char* zgl_backend_egl() { return windowed() ? zgl_window_egl() : zgl_kms_egl(); }
