// SSD1306 OLED controller model (ZN-127): decodes what a driver sends over I2C the way the chip does and says when the driver breaks a rule of the datasheet.
// Strict on purpose: the init a real panel needs (mux ratio, charge pump before display on, horizontal addressing before a column/page window) is checked, so a wrong byte is an error here
// instead of a dark screen on the board.
#pragma once
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "hw.h"

namespace zn::sim {

struct Ssd1306 {
  uint8_t gddram[8][128] = {};
  int mux = 64, addrMode = 2, col = 0, page = 0, c0 = 0, c1 = 127, p0 = 0, p1 = 7, contrast = 0x7F;   // reset values of the datasheet: page addressing mode
  bool on = false, chargePump = false, remap = false, comReversed = false, inverted = false, entireOn = false;
  int height = 64;
  std::vector<std::string> errors;

  zn_hw_model model() { return {&Ssd1306::onWrite, nullptr, this}; }
  void err(const std::string& m) { errors.push_back(m); }

  static int onWrite(void* u, const uint8_t* d, int n) { return static_cast<Ssd1306*>(u)->write(d, n); }
  int write(const uint8_t* d, int n) {
    if (n < 1) return 0;
    if (d[0] == 0x00) { commands(d + 1, n - 1); return 1; }                 // control byte: Co = 0, D/C# = 0, a stream of commands
    if (d[0] == 0x40) { for (int i = 1; i < n; i++) data(d[i]); return 1; }  // D/C# = 1: display data
    if (d[0] == 0x80 && n >= 2) { commands(d + 1, n - 1); return 1; }
    if (d[0] == 0xC0 && n >= 2) { data(d[1]); return 1; }
    err("control byte 0x" + hex(d[0]) + " is neither command (0x00) nor data (0x40)");
    return 0;
  }
  static std::string hex(unsigned v) { char b[8]; std::snprintf(b, sizeof b, "%02x", v); return b; }

  void commands(const uint8_t* c, int n) {
    for (int i = 0; i < n; i++) {
      uint8_t k = c[i];
      auto arg = [&](int count) { if (i + count >= n) { err("command 0x" + hex(k) + " is missing its argument"); i = n; return false; } return true; };
      if (k == 0xAE) on = false;
      else if (k == 0xAF) { if (!chargePump) err("display on (0xAF) before the charge pump is enabled (0x8D 0x14): the panel stays dark"); on = true; }
      else if (k == 0x81) { if (arg(1)) contrast = c[++i]; }
      else if (k == 0xA4) entireOn = false;
      else if (k == 0xA5) entireOn = true;
      else if (k == 0xA6) inverted = false;
      else if (k == 0xA7) inverted = true;
      else if (k == 0xA0 || k == 0xA1) remap = k & 1;
      else if (k == 0xC0 || k == 0xC8) comReversed = k == 0xC8;
      else if (k == 0xA8) { if (arg(1)) { mux = c[++i] + 1; if (mux < 16 || mux > 64) err("multiplex ratio " + std::to_string(mux) + " out of range 16..64"); } }
      else if (k == 0xD3 || k == 0xD5 || k == 0xD9 || k == 0xDB || k == 0xDA) { if (arg(1)) i++; }
      else if (k == 0x8D) { if (arg(1)) { uint8_t v = c[++i]; if (v != 0x10 && v != 0x14) err("charge pump setting 0x" + hex(v)); chargePump = v == 0x14; } }
      else if (k == 0x20) { if (arg(1)) { addrMode = c[++i]; if (addrMode > 2) err("memory addressing mode " + std::to_string(addrMode)); } }
      else if (k == 0x21) {
        if (!arg(2)) break;
        c0 = c[++i]; c1 = c[++i];
        if (addrMode == 2) err("column window (0x21) in page addressing mode: the chip ignores it, set 0x20 0x00 first");
        if (c0 > c1 || c1 > 127) err("column window " + std::to_string(c0) + ".." + std::to_string(c1));
        col = c0;
      } else if (k == 0x22) {
        if (!arg(2)) break;
        p0 = c[++i]; p1 = c[++i];
        if (addrMode == 2) err("page window (0x22) in page addressing mode: the chip ignores it, set 0x20 0x00 first");
        if (p0 > p1 || p1 > 7) err("page window " + std::to_string(p0) + ".." + std::to_string(p1));
        page = p0;
      } else if (k == 0x2E || k == 0x2F) {}              // scroll off / on
      else if (k >= 0x40 && k <= 0x7F) {}                 // display start line
      else if (k >= 0xB0 && k <= 0xB7) page = k & 7;        // page start (page addressing mode)
      else if (k < 0x20) { if (k & 0x10) col = (col & 0x0F) | (k & 0x0F) << 4; else col = (col & 0xF0) | (k & 0x0F); }   // column start nibbles (page addressing mode)
      else err("unknown command 0x" + hex(k));
    }
  }
  void data(uint8_t b) {
    if (page > 7 || col > 127) { err("data past the end of GDDRAM"); return; }
    gddram[page][col] = b;
    if (addrMode == 2) { if (col < 127) col++; return; }     // page mode: the column wraps inside the page only by the driver's choice
    if (addrMode == 0) { if (++col > c1) { col = c0; if (++page > p1) page = p0; } }
    else { if (++page > p1) { page = p0; if (++col > c1) col = c0; } }
  }

  /** What the panel shows as the chip scans it, on the common 0.96" module (wired so that Adafruit's init, 0xA1 + 0xC8, is upright): without the segment remap the columns are mirrored,
 *  without the reversed COM scan the rows are flipped. A 0/1 byte per pixel, `width` x `height`. */
  std::vector<uint8_t> pixels(int width) const {
    std::vector<uint8_t> out((size_t)width * height);
    for (int y = 0; y < height; y++)
      for (int x = 0; x < width; x++) {
        int sx = remap ? x : 127 - x, sy = comReversed ? y : mux - 1 - y;   // the visible rows are the first `mux` COM lines
        bool lit = sy >= 0 && sy < 64 && (gddram[sy >> 3][sx] >> (sy & 7)) & 1;
        out[(size_t)y * width + x] = (lit != inverted) || entireOn;
      }
    return out;
  }
  /** Plain PBM (P1) of pixels(width): the golden format of the tests. */
  std::string pbm(int width) const {
    std::string s = "P1\n" + std::to_string(width) + " " + std::to_string(height) + "\n";
    std::vector<uint8_t> px = pixels(width);
    for (int y = 0; y < height; y++) { for (int x = 0; x < width; x++) s += px[(size_t)y * width + x] ? '1' : '0'; s += '\n'; }
    return s;
  }
};

}  // namespace zn::sim
