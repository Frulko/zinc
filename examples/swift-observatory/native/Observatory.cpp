#include "Observatory.h"
#include "zn/app.h"
#include "rt/rt.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
namespace {
int selection = 0;
void selected(const char* p, size_t n, bool) {
  constexpr char prefix[] = "observatory:selected:";
  if (n > sizeof(prefix) - 1 && memcmp(p, prefix, sizeof(prefix) - 1) == 0) {
    char c = p[sizeof(prefix) - 1];
    if (c >= '0' && c <= '2') selection = c - '0';
  }
}
}
extern "C" int obs_start() {
  if (zn_embed_install(720, 520, 2)) return -1;
  char name[] = "Native Observatory"; char* args[] = {name, nullptr};
  int rc = zn_app_init(1, args);
  zn::rt::gConsoleTap = selected;
  if (rc) { zn_embed_quit(); zn::rt::gConsoleTap = nullptr; }
  return rc;
}
extern "C" void obs_controls(double speed, int paused, int id) {
  char value[32]; snprintf(value, sizeof value, "%.6f", speed);
  setenv("OBS_SPEED", value, 1); setenv("OBS_PAUSED", paused ? "1" : "0", 1);
  snprintf(value, sizeof value, "%d", id); setenv("OBS_SELECTION", value, 1);
  ZnEmbedEvent e{}; e.kind = ZN_EMBED_KEY_DOWN; e.key = 's'; zn_embed_event(&e);
}
extern "C" int obs_selected() { return selection; }
extern "C" void obs_stop() { zn_embed_quit(); zn::rt::gConsoleTap = nullptr; }

extern "C" void* hal_window_handle();
extern "C" int obs_has_external_window() { return hal_window_handle() != nullptr; }
