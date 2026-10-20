// ST7789 / ILI9341 panel model on the MIPI DCS command set (ZN-128): the commands and RGB565 pixels a driver sends, applied the way the controller does (address window,
// MADCTL orientation, inversion, colour order), into a frame buffer. Strict: pixels before sleep-out, display on or 16 bpp, and writes outside the window or the panel are errors.
// The damage of a frame is visible too: `writes` counts the pixels the bus carried, so a driver that resends the whole screen for a clock is caught.
#pragma once
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

#include "hw.h"

namespace zn::sim {

struct St7789 {
  int width, height;                  // the panel's memory (240x320)
  bool glassInverts = false;          // the glass shows the complement of its data unless INVON is sent (the common ST7789 modules)
  bool panelBgr = false;              // the glass has its sub-pixels in B, G, R order (the board preset's MADCTL bit 3 makes it right)
  std::vector<uint32_t> fb;           // 0xRRGGBB as the viewer sees it
  bool sleeping = true, on = false, inverted = false;
  int colmod = 0x66, madctl = 0, xs = 0, xe = 0, ys = 0, ye = 0, cx = 0, cy = 0;
  long writes = 0;                    // pixels sent over the bus since the last resetWrites()
  std::vector<std::string> errors;
  std::vector<int> commands;          // the command bytes seen, in order (parameters excluded)

  St7789(int w, int h) : width(w), height(h), fb((size_t)w * h, 0), xe(w - 1), ye(h - 1) {}
  zn_hw_model model() { return {&St7789::onWrite, nullptr, this}; }
  void resetWrites() { writes = 0; }
  void err(const std::string& m) { errors.push_back(m); }
  static int onWrite(void* u, const uint8_t* d, int n) { return static_cast<St7789*>(u)->write(d, n); }

  int write(const uint8_t* d, int n) {
    int kind = d[0], cmd = d[1];
    const uint8_t* p = d + 2;
    int len = n - 2;
    if (kind == 0) { param(cmd, p, len); return 1; }
    pixels(cmd, p, len);
    return 1;
  }
  void param(int cmd, const uint8_t* p, int n) {
    commands.push_back(cmd);
    switch (cmd) {
      case 0x01: sleeping = true; on = false; inverted = false; madctl = 0; colmod = 0x66; break;   // software reset
      case 0x11: sleeping = false; break;
      case 0x10: sleeping = true; break;
      case 0x20: inverted = false; break;
      case 0x21: inverted = true; break;
      case 0x28: on = false; break;
      case 0x29: if (sleeping) err("display on (0x29) while the panel sleeps: sleep out (0x11) first"); on = true; break;
      case 0x3A: if (n == 1) colmod = p[0]; else err("COLMOD without its parameter"); break;
      case 0x36: if (n == 1) madctl = p[0]; else err("MADCTL without its parameter"); break;
      case 0x2A: if (n == 4) { xs = p[0] << 8 | p[1]; xe = p[2] << 8 | p[3]; } else err("CASET needs 4 parameters"); break;
      case 0x2B: if (n == 4) { ys = p[0] << 8 | p[1]; ye = p[2] << 8 | p[3]; } else err("RASET needs 4 parameters"); break;
      default: break;   // tuning registers (porch, gate, gamma, power): accepted
    }
  }
  void pixels(int cmd, const uint8_t* p, int n) {
    commands.push_back(cmd);
    if (cmd != 0x2C) { err("colour data with command 0x" + std::to_string(cmd)); return; }
    if (sleeping || !on) err("pixels written while the panel is " + std::string(sleeping ? "asleep" : "off"));
    if (colmod != 0x55) err("pixels written in COLMOD 0x" + std::to_string(colmod) + ", the driver sends RGB565 (0x55)");
    bool mx = madctl & 0x40, my = madctl & 0x80, bgr = madctl & 0x08;
    if (madctl & 0x20) { err("MADCTL MV (row/column exchange) is not modelled"); return; }
    if (xe < xs || ye < ys) { err("empty address window"); return; }
    cx = xs; cy = ys;
    for (int i = 0; i + 1 < n; i += 2) {
      uint16_t v = p[i] << 8 | p[i + 1];
      writes++;
      int px = mx ? width - 1 - cx : cx, py = my ? height - 1 - cy : cy;   // MADCTL MX / MY mirror the memory scan
      if (px < 0 || px >= width || py < 0 || py >= height) err("pixel outside the panel (" + std::to_string(cx) + "," + std::to_string(cy) + ")");
      else {
        uint32_t r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31;
        r = r << 3 | r >> 2; g = g << 2 | g >> 4; b = b << 3 | b >> 2;
        if (bgr != panelBgr) std::swap(r, b);   // the controller's colour order against the glass'
        uint32_t c = r << 16 | g << 8 | b;
        if (inverted != glassInverts) c ^= 0xFFFFFF;
        fb[(size_t)py * width + px] = c;
      }
      if (++cx > xe) { cx = xs; if (++cy > ye) cy = ys; }
    }
  }
  std::string ppm() const {
    std::string s = "P6\n" + std::to_string(width) + " " + std::to_string(height) + "\n255\n";
    for (uint32_t c : fb) { s += (char)(c >> 16); s += (char)(c >> 8); s += (char)c; }
    return s;
  }
};

}  // namespace zn::sim
