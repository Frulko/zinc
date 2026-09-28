// display-rmpp on the desktop: the same refresh policy as the device (eink.h), shown through the SDL window with an
// e-ink look (paper tint, muted pigments, black/white fast updates, flashing full refreshes). Input stays with SDL
// (mouse = pen, SDL pen events for tablets). ZINC_EINK_LOOK=0 shows the frames unchanged.
#include "eink.h"

static eink::Panel panel;
static uint32_t* view;  // what the emulated panel looks like
static bool look = true;

static uint32_t perceive(uint32_t c) {
  // paper is not white and ink not black; Gallery-type pigments are muted
  const int32_t paper[3] = {0xE9, 0xE6, 0xDF}, ink[3] = {0x26, 0x26, 0x2A};
  int32_t l = eink::luma(c), out = 0;
  for (int32_t k = 0; k < 3; k++) {
    int32_t v = (c >> (16 - 8 * k)) & 255;
    v = l + (v - l) * 6 / 10;
    out |= (ink[k] + v * (paper[k] - ink[k]) / 255) << (16 - 8 * k);
  }
  return (uint32_t)out;
}
static void rows_of_view(uint32_t* rows, int32_t y0, int32_t y1) { memcpy(rows, view + (size_t)y0 * panel.w, (size_t)(y1 - y0) * panel.w * 4); }
static void show(eink::Rect r) {
  HalFrame f = {panel.w, panel.h, r.x0, r.y0, r.x1, r.y1, rows_of_view};
  hal_present(&f);
}

static int emu_init(const HalConfig* cfg) {
  const char* e = hal_env("ZINC_EINK_LOOK");
  look = !(e && e[0] == '0');
  if (!look) return 1;
  view = (uint32_t*)calloc((size_t)cfg->width * cfg->height, 4);
  return view && eink::init(panel, cfg->width, cfg->height) ? 1 : 0;
}
static void emu_present(const HalFrame* f) {
  if (!look) { hal_present(f); return; }
  eink::Update u = eink::present(panel, f, hal_time_us());
  if (u.mode == eink::FULL) {  // flashing refresh: the panel goes black before settling
    for (size_t i = 0, n = (size_t)panel.w * panel.h; i < n; i++) view[i] = 0x26262A;
    show(u.r);
    hal_sleep_us(90000);
  }
  if (u.mode != eink::NONE)
    for (int32_t y = u.r.y0; y < u.r.y1; y++)
      for (int32_t x = u.r.x0; x < u.r.x1; x++) view[(size_t)y * panel.w + x] = perceive(panel.out[(size_t)y * panel.w + x]);
  show(u.mode == eink::NONE ? eink::Rect{0, 0, 0, 0} : u.r);
}

static HalDisplay emu = {emu_init, emu_present, nullptr, nullptr};
static int reg = (hal_display = &emu, 0);
