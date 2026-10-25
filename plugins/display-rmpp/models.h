// The reMarkable tablets and the vendor engines Zinc knows (docs/reports/remarkable-apps-design.md §2, remarkable-bridge-design.md §1).
// A new model is one row of `models`; a new OS on a known model is one row of `vendors`, added after a tablet test
// (docs/targets/remarkable-paper-pro.md, "Adding a model or an OS"). Shared by the driver and the ink lane inside xochitl.
#pragma once
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace rmm {
enum Backend { QTFB, RM2FB };
struct Model {
  const char* codename;            // /sys/devices/soc0/machine
  const char* name;
  int w, h;                        // panel pixels, portrait (the app's geometry and AppLoad's qtfb buffer)
  int qtfb_fmt;                    // FBFMT_*_RGB888 of AppLoad's src/qtfb/common.h
  int vendor_w, vendor_h, vendor_bpl;  // xochitl's vendor buffer (framebuffer-spy's conditions); 0: not known yet
  bool colour;
  int pen_x, pen_y, touch_x, touch_y;  // evdev maxima as published (KOReader, kernel); the driver reads EVIOCGABS at run time
  int pen_rotate;                  // digitizer against the portrait panel
  Backend backend;                 // QTFB: AppLoad inside xochitl (L0, L1, L2); RM2FB: timower's rm2fb server
  int start_burst, start_interval_s, watchdog_s;  // xochitl.service as shipped; the lease refuses other values
};
struct Vendor {                    // one verified libqsgepaper.so
  const char* sha256;
  const char* codename;
  const char* os;
  const char* swap;                // mangled EPFramebuffer::swapBuffers(QRect, ...)
  int abi;                         // 327: (QRect, EPContentType, EPScreenMode, flags); 328: (QRect, EPScreenMode, flags)
  int pen_mode, colour_mode, colour_content;  // Pen/Mono partial for ink, the colour mode and content of a settle
  const char* engine;              // the L2 engine shim (Quill's C ABI) built against this library
};

inline const Model models[] = {
  {"reMarkable Ferrari", "Paper Pro", 1620, 2160, 1, 1620, 2160, 6528, true, 11180, 15340, 2064, 2832, 0, QTFB, 4, 600, 60},
  // Move and Pure: geometry from AppLoad's common.h, framebuffer-spy and KOReader; unit limits assumed as the Paper Pro's until read on a tablet
  {"reMarkable Chiappa", "Paper Pro Move", 954, 1696, 4, 960, 1696, 3840, true, 6760, 11960, 1248, 2208, 0, QTFB, 4, 600, 60},
  {"reMarkable Tatsu", "Paper Pure", 1404, 1872, 7, 0, 0, 0, false, 9620, 13000, 1776, 2400, 0, QTFB, 4, 600, 60},
  // rM2: the digitizer's long side is X (rotated against the portrait panel); the panel belongs to rm2fb's server
  {"reMarkable 2.0", "reMarkable 2", 1404, 1872, 0, 1404, 1872, 5616, false, 20967, 15725, 1403, 1871, 90, RM2FB, 4, 600, 60},
};
inline const Vendor vendors[] = {
  // OS 3.27.3.0: hashed on the tablet 2026-09-29 (docs/reports/rmpp-latency-2026-09-29.md), Quill v0.1.0's device record
  {"3800e9f3d01f40fa3f5cc96ca49bcd982471ce5b033320f8788707520c8ddd08", "reMarkable Ferrari", "3.27.3.0",
   "_ZN13EPFramebuffer11swapBuffersE5QRect13EPContentType12EPScreenMode6QFlagsINS_10UpdateFlagEE", 327, 0, 4, 1, "libquill.so"},
#ifdef ZINK_TEST_HASH  // the fake-xochitl harness only (tests/native/rmpp/fake-xochitl): its stub library's hash
  {ZINK_TEST_HASH, "reMarkable Ferrari", "fake", "_ZN13EPFramebuffer11swapBuffersE5QRect13EPContentType12EPScreenMode6QFlagsINS_10UpdateFlagEE", 327, 0, 4, 1, "libquill.so"},
#endif
};

/** The machine's codename: ZINC_RMPP_MACHINE (tests), else /sys/devices/soc0/machine; "" when neither says. */
inline const char* machine() {
  static char buf[64];
  if (const char* e = getenv("ZINC_RMPP_MACHINE")) return e;
  if (!buf[0]) if (FILE* f = fopen("/sys/devices/soc0/machine", "r")) {
    if (!fgets(buf, sizeof buf, f)) buf[0] = 0;
    fclose(f);
    buf[strcspn(buf, "\r\n")] = 0;
  }
  return buf;
}
inline const Model* model(const char* codename) {
  for (const Model& m : models) if (!strcmp(m.codename, codename)) return &m;
  return nullptr;
}
/** The row for an app of w x h when the machine is unknown: same geometry, qtfb only. */
inline const Model* model_by_size(int w, int h) {
  for (const Model& m : models) if (m.w == w && m.h == h && m.backend == QTFB) return &m;
  return nullptr;
}
/** The verified vendor row for this hash on this model, or nullptr. */
inline const Vendor* vendor(const char* sha256, const char* codename) {
  for (const Vendor& v : vendors) if (!strncmp(v.sha256, sha256, 64) && !strcmp(v.codename, codename)) return &v;
  return nullptr;
}
}  // namespace rmm
