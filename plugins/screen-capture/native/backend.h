#pragma once
// The capture backend of a platform: screen.macos.mm (ScreenCaptureKit) defines SC_BACKEND and includes screen.host.cpp, which alone has only
// the fake sources. Pixels are 0x00RRGGBB words (BGRX in memory), the format of zinc:gfx runtime images. Every call is made on the program's
// thread; the backend works on its own queues and hands its results over under a lock.
#include <stdint.h>
#include <string>
#include <vector>

struct ScSource {
  std::string id, kind, name, app;   // kind: "screen" or "window"
  int w = 0, h = 0;                  // pixels
  int tw = 0, th = 0;                // the thumbnail's size, 0 for none
  std::vector<uint32_t> thumb;
  std::vector<uint32_t> icon;        // a window's application icon, SC_ICON x SC_ICON, 0xAARRGGBB straight alpha; empty for none
};
const int SC_ICON = 32;

/** The source's sw x sh fitted in the asked box (0: within 1920 x 1080), aspect kept, never above the source, even sizes (what encoders take). */
inline void sc_fit(int sw, int sh, int& w, int& h) {
  if (w <= 0 || h <= 0) { w = 1920; h = 1080; }
  double s = (double)w / sw < (double)h / sh ? (double)w / sw : (double)h / sh;
  if (s > 1) s = 1;
  w = (int)(sw * s) & ~1; h = (int)(sh * s) & ~1;
  if (w < 16) w = 16;
  if (h < 16) h = 16;
}

/** 1 granted, 2 not granted. `ask` shows the system's question. */
int sc_backend_permission(bool ask);
/** Starts listing; false and the reason in `err` when it cannot. */
bool sc_backend_list(bool screens, bool windows, int tw, int th, std::string& err);
/** 0 listing, 1 done (the sources in `out`, once), -1 failed (`err`). */
int sc_backend_list_state(std::vector<ScSource>& out, std::string& err);
/** Starts capturing `id` ('' the main screen) within w x h (0: the source's size within 1920 x 1080) at fps; a handle >= 0 and the size it
 *  delivers, or -1 and the reason in `err`. */
int sc_backend_open(const char* id, int w, int h, int fps, bool cursor, int* ow, int* oh, std::string& err);
/** 1 running, 0 starting, -1 failed or ended (`err`). */
int sc_backend_state(int b, std::string& err);
/** The newest frame when there is a new one: its pixels and stride (in pixels), valid until the next take or close. */
bool sc_backend_take(int b, const uint32_t** px, int* stride);
void sc_backend_close(int b);
