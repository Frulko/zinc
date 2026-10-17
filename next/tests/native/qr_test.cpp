// The QR codes of Zinc Go (ZN-631): what Nayuki's encoder makes of zinc dev --lan's links, drawn as a camera would see them (several scales,
// off centre, a grey background, a soft gradient), read back by quirc. Prints "qr: ok" or the first link it could not read.
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "qrcodegen.h"
#include "quirc.h"

static bool roundTrip(const std::string& text, int scale, int ox, int oy, std::string& got) {
  std::vector<std::uint8_t> qr(qrcodegen_BUFFER_LEN_MAX), tmp(qrcodegen_BUFFER_LEN_MAX);
  if (!qrcodegen_encodeText(text.c_str(), tmp.data(), qr.data(), qrcodegen_Ecc_LOW, qrcodegen_VERSION_MIN, qrcodegen_VERSION_MAX, qrcodegen_Mask_AUTO, true)) return false;
  const int size = qrcodegen_getSize(qr.data()), w = 640, h = 480;
  quirc* q = quirc_new();
  if (!q || quirc_resize(q, w, h) < 0) return false;
  int qw = 0, qh = 0;
  std::uint8_t* img = quirc_begin(q, &qw, &qh);
  for (int y = 0; y < h; ++y)
    for (int x = 0; x < w; ++x) {
      const int mx = (x - ox) / scale - 4, my = (y - oy) / scale - 4;   // the code with its quiet zone of 4 modules, on paper (light) in a darker room
      const bool paper = x >= ox && y >= oy && mx < size + 4 && my < size + 4;
      const bool dark = paper && mx >= 0 && my >= 0 && mx < size && my < size && qrcodegen_getModule(qr.data(), mx, my);
      const int light = paper ? 200 + (x + y) % 40 : 90 + x / 16;
      img[y * w + x] = static_cast<std::uint8_t>(dark ? 30 + y % 20 : light);
    }
  quirc_end(q);
  bool ok = false;
  for (int i = 0; i < quirc_count(q) && !ok; ++i) {
    quirc_code code;
    quirc_data data;
    quirc_extract(q, i, &code);
    if (quirc_decode(&code, &data) == QUIRC_SUCCESS) { got.assign(reinterpret_cast<const char*>(data.payload), static_cast<std::size_t>(data.payload_len)); ok = got == text; }
  }
  quirc_destroy(q);
  return ok;
}

int main() {
  const char* links[] = {"zinc://192.168.1.23:8090/3fa9c2d1", "zinc://10.0.2.2:8091/00ff00ff", "zinc://my-laptop.local:8090/abcdef12"};
  const int scales[][3] = {{4, 40, 30}, {6, 100, 20}, {3, 300, 200}};
  for (const char* l : links)
    for (const auto& s : scales) {
      std::string got;
      if (!roundTrip(l, s[0], s[1], s[2], got)) { std::printf("qr: %s at scale %d read as '%s'\n", l, s[0], got.c_str()); return 1; }
    }
  std::printf("qr: ok\n");
  return 0;
}
