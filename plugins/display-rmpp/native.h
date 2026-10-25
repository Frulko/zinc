// L2: the app owns the panel inside a lease (integrations/remarkable-ink/lease: xochitl stopped, wakelock held, power key and
// dead-man owned by the supervisor). The vendor engine is opened through an engine shim with Quill's C ABI (quill.h, MIT:
// github.com/MaximeRivest/quill), dlopen'ed and built against the vendor row's library; nothing proprietary is bundled.
// The lease checked the vendor library and passes its SHA-256 in ZINC_VENDOR_SHA256; the row says which modes to use.
// Every presented frame sends WATCHDOG=1 to the lease's NOTIFY_SOCKET: a hung app is killed and xochitl comes back.
#pragma once
#include "eink.h"
#include "models.h"
#include <dlfcn.h>
#include <stddef.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

namespace native {
struct Api {
  int (*init)();
  int (*width)();
  int (*height)();
  int (*stride)();
  unsigned char* (*buffer)();
  unsigned long (*swap)(int x, int y, int w, int h, int mode, int full, int content);
  void (*events)();
} api;
const rmm::Vendor* row = nullptr;
unsigned char* fb = nullptr;
int stride = 0, notify = -1;
sockaddr_un notify_to = {};
socklen_t notify_len = 0;
bool fast = true;          // zinc_rmpp_set_fast: Pen mode for everything, else colour outside strokes
eink::Rect stroke = {};    // damage swapped in Pen mode, settled in colour at pen-up

bool fail(const char* what, const char* detail) {
  fprintf(stderr, "display-rmpp: ink session unavailable: %s%s%s\n", what, detail ? ": " : "", detail ? detail : "");
  return false;
}
/** Opens the engine for this model. One line on stderr when it cannot. */
bool open(const rmm::Model& m) {
  const char* hash = getenv("ZINC_VENDOR_SHA256");
  if (!hash || !(row = rmm::vendor(hash, m.codename))) return fail("vendor library not verified for this model", hash);
  const char* path = getenv("ZINC_RMPP_ENGINE");
  void* h = dlopen(path ? path : row->engine, RTLD_NOW | RTLD_LOCAL);
  if (!h) return fail("cannot load the engine shim", dlerror());
  // ponytail: a static app binary cannot dlopen Qt reliably; L2 needs the dynamic (SDK) build of the app.
  api = {(int (*)())dlsym(h, "quill_init"), (int (*)())dlsym(h, "quill_width"), (int (*)())dlsym(h, "quill_height"),
         (int (*)())dlsym(h, "quill_stride"), (unsigned char* (*)())dlsym(h, "quill_buffer"),
         (unsigned long (*)(int, int, int, int, int, int, int))dlsym(h, "quill_swap_ex"), (void (*)())dlsym(h, "quill_process_events")};
  if (!api.init || !api.width || !api.height || !api.stride || !api.buffer || !api.swap || !api.events) return fail("engine shim symbols missing", nullptr);
  if (api.init() != 0) return fail("the engine did not start", nullptr);
  fb = api.buffer(); stride = api.stride();
  if (!fb || api.width() != m.w || api.height() != m.h || stride < m.w * 4) return fail("engine geometry differs from the model row", m.name);
  if (const char* n = getenv("NOTIFY_SOCKET"); n && *n && strlen(n) < sizeof notify_to.sun_path) {
    notify = socket(AF_UNIX, SOCK_DGRAM | SOCK_CLOEXEC, 0);
    notify_to.sun_family = AF_UNIX;
    strcpy(notify_to.sun_path, n);
    if (n[0] == '@') notify_to.sun_path[0] = 0;  // abstract namespace
    notify_len = (socklen_t)(offsetof(sockaddr_un, sun_path) + strlen(n));
  }
  fprintf(stderr, "display-rmpp: ink session on (%s, OS %s)\n", m.name, row->os);
  return true;
}
void watchdog() { if (notify >= 0) sendto(notify, "WATCHDOG=1", 10, MSG_DONTWAIT, (sockaddr*)&notify_to, notify_len); }

void copy(const eink::Panel& p, eink::Rect r) {  // 0x00RRGGBB -> the engine's RGB32
  for (int32_t y = r.y0; y < r.y1; y++) {
    const uint32_t* s = p.cur + (size_t)y * p.w;
    uint32_t* d = (uint32_t*)(fb + (size_t)y * stride);
    for (int32_t x = r.x0; x < r.x1; x++) d[x] = s[x] | 0xff000000u;
  }
}
void swap(eink::Rect r, bool ink) {
  api.swap(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, ink ? row->pen_mode : row->colour_mode, 0, ink ? 0 : row->colour_content);
}
/** One frame: Pen/Mono swaps while the Marker is down, the stroke's box settled in colour at pen-up. */
void present(const eink::Panel& p, eink::Rect r, bool pen_down, bool first) {
  if (first) { copy(p, r); api.swap(0, 0, p.w, p.h, row->colour_mode, 1, row->colour_content); }
  else if (!eink::empty(r)) {
    copy(p, r);
    bool ink = pen_down || fast;
    swap(r, ink);
    if (pen_down && !fast) eink::unite(stroke, r);
  }
  if (!pen_down && !eink::empty(stroke)) { swap(stroke, false); stroke = {}; }
  api.events();
  watchdog();
}
}  // namespace native
