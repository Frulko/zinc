// zinc:gpio linux/rpi1 (ZRT_GPIOD) — libgpiod against /dev/gpiochip0 (v2 API when the installed
// libgpiod provides it, v1 API otherwise); falls back to the same in-process simulator as
// gpio.cpp, with a warning, when no chip is present (Docker/QEMU builds with no device
// passthrough). Selected instead of gpio.cpp only when -DZRT_GPIOD is defined (see
// compiler/src/cli.ts); the default on macOS, and on linux/rpi1 without ZRT_GPIOD, stays the
// plain simulator in gpio.cpp.
#include "zrt.h"
#include "mod/gpio.h"
#include <gpiod.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <sys/select.h>

// v2 headers introduce gpiod_line_value; use that as the version switch (ponytail: a heuristic,
// not a version macro guarantee — replace with a real libgpiod version check if a future release
// stops matching this shape).
#if defined(GPIOD_LINE_VALUE_ACTIVE)
#define ZRT_GPIOD_V2 1
#endif

namespace zrt { namespace gpio {
struct Pin {
  bool out = false, real = false;
  uint8_t value = 0; int8_t edge = 2; uint16_t debounce = 0; double last = -1e9;
  Fn<void(Ref<PinEdge>)> cb;
#ifdef ZRT_GPIOD_V2
  gpiod_line_request* req = nullptr;
#else
  gpiod_line* line = nullptr;
#endif
};
static Pin pins[64];
static gpiod_chip* chip = nullptr;
static bool checked = false, have_chip = false;

static bool chip_available() {
  if (checked) return have_chip;
  checked = true;
  if (access("/dev/gpiochip0", F_OK) != 0) {
    fprintf(stderr, "zinc: gpio: /dev/gpiochip0 not found, falling back to the simulator\n");
    return have_chip = false;
  }
#ifdef ZRT_GPIOD_V2
  chip = gpiod_chip_open("/dev/gpiochip0");
#else
  chip = gpiod_chip_open_by_name("gpiochip0");
#endif
  if (!chip) fprintf(stderr, "zinc: gpio: cannot open /dev/gpiochip0, falling back to the simulator\n");
  return have_chip = chip != nullptr;
}
// Same edge-match/debounce semantics as gpio.cpp's simulator, shared by real edges and simulate().
static void deliver(uint8_t pin, uint8_t value) {
  Pin& p = pins[pin & 63];
  uint8_t old = p.value; p.value = value;
  if (!p.cb || old == value) return;
  bool rising = value > old;
  if (p.edge == 0 && !rising) return;
  if (p.edge == 1 && rising) return;
  double t = now_ms();
  if (t - p.last < p.debounce) return;
  p.last = t;
  auto e = make<PinEdge>(); e->pin = pin; e->value = value; e->timestampMs = t;
  Fn<void(Ref<PinEdge>)> cb = p.cb;
  microtask([cb, e]() { cb(e); });
}
static int line_fd(Pin& p) {
#ifdef ZRT_GPIOD_V2
  return p.req ? gpiod_line_request_get_fd(p.req) : -1;
#else
  return p.line ? gpiod_line_event_get_fd(p.line) : -1;
#endif
}
struct Driver : Poller {
  bool poll() override {
    bool any = false;
    for (int pin = 0; pin < 64; pin++) {
      Pin& p = pins[pin];
      if (!p.real || !p.cb) continue;
      any = true;
      int fd = line_fd(p);
      if (fd < 0) continue;
      fd_set rf; FD_ZERO(&rf); FD_SET(fd, &rf);
      timeval tv{0, 0};
      if (select(fd + 1, &rf, nullptr, nullptr, &tv) <= 0) continue;
#ifdef ZRT_GPIOD_V2
      gpiod_edge_event_buffer* buf = gpiod_edge_event_buffer_new(4);
      int n = gpiod_line_request_read_edge_events(p.req, buf, 4);
      for (int i = 0; i < n; i++) {
        gpiod_edge_event* ev = gpiod_edge_event_buffer_get_event(buf, i);
        deliver((uint8_t)pin, gpiod_edge_event_get_event_type(ev) == GPIOD_EDGE_EVENT_RISING_EDGE ? 1 : 0);
      }
      gpiod_edge_event_buffer_free(buf);
#else
      gpiod_line_event ev;
      if (gpiod_line_event_read(p.line, &ev) == 0) deliver((uint8_t)pin, ev.event_type == GPIOD_LINE_EVENT_RISING_EDGE ? 1 : 0);
#endif
    }
    return any;
  }
};
static bool driver_added = false;
static void init() { if (!driver_added) { driver_added = true; add_poller(new (alloc(sizeof(Driver))) Driver()); } }

void setup(uint8_t pin, const String& mode, const String& pull) {
  init();
  Pin& p = pins[pin & 63];
  p.out = mode.bytes() && mode.ptr()[0] == 'o';
  bool up = !p.out && pull.bytes() && pull.ptr()[0] == 'u';
  bool down = !p.out && pull.bytes() && pull.ptr()[0] == 'd';
  p.real = chip_available();
  if (p.real) {
#ifdef ZRT_GPIOD_V2
    gpiod_line_settings* s = gpiod_line_settings_new();
    gpiod_line_settings_set_direction(s, p.out ? GPIOD_LINE_DIRECTION_OUTPUT : GPIOD_LINE_DIRECTION_INPUT);
    if (!p.out) gpiod_line_settings_set_bias(s, up ? GPIOD_LINE_BIAS_PULL_UP : down ? GPIOD_LINE_BIAS_PULL_DOWN : GPIOD_LINE_BIAS_DISABLED);
    gpiod_line_config* lc = gpiod_line_config_new();
    unsigned int offset = pin;
    gpiod_line_config_add_line_settings(lc, &offset, 1, s);
    gpiod_request_config* rc = gpiod_request_config_new();
    gpiod_request_config_set_consumer(rc, "zinc");
    p.req = gpiod_chip_request_lines(chip, rc, lc);
    gpiod_request_config_free(rc); gpiod_line_config_free(lc); gpiod_line_settings_free(s);
    p.real = p.req != nullptr;
#else
    p.line = gpiod_chip_get_line(chip, pin);
    int flags = up ? GPIOD_LINE_REQUEST_FLAG_BIAS_PULL_UP : down ? GPIOD_LINE_REQUEST_FLAG_BIAS_PULL_DOWN : 0;
    if (p.line) p.real = (p.out ? gpiod_line_request_output_flags(p.line, "zinc", flags, 0) : gpiod_line_request_input_flags(p.line, "zinc", flags)) == 0;
    else p.real = false;
#endif
  }
  p.value = up ? 1 : 0;
}
void write(uint8_t pin, uint8_t value) {
  init();
  Pin& p = pins[pin & 63]; p.value = value ? 1 : 0;
  if (p.real) {
#ifdef ZRT_GPIOD_V2
    gpiod_line_request_set_value(p.req, pin, value ? GPIOD_LINE_VALUE_ACTIVE : GPIOD_LINE_VALUE_INACTIVE);
#else
    gpiod_line_set_value(p.line, value ? 1 : 0);
#endif
  }
}
uint8_t read(uint8_t pin) {
  init();
  Pin& p = pins[pin & 63];
  if (p.real && !p.out) {
#ifdef ZRT_GPIOD_V2
    return gpiod_line_request_get_value(p.req, pin) == GPIOD_LINE_VALUE_ACTIVE ? 1 : 0;
#else
    return gpiod_line_get_value(p.line) > 0 ? 1 : 0;
#endif
  }
  return p.value;
}
void watch(uint8_t pin, const String& edge, uint16_t debounceMs, Fn<void(Ref<PinEdge>)> cb) {
  init();
  Pin& p = pins[pin & 63];
  p.edge = edge.bytes() && edge.ptr()[0] == 'r' ? 0 : edge.bytes() && edge.ptr()[0] == 'f' ? 1 : 2;
  p.debounce = debounceMs; p.cb = cb; p.last = -1e9;
  if (!p.real) return;
#ifdef ZRT_GPIOD_V2
  gpiod_line_settings* s = gpiod_line_settings_new();
  gpiod_line_settings_set_direction(s, GPIOD_LINE_DIRECTION_INPUT);
  gpiod_line_settings_set_edge_detection(s, GPIOD_LINE_EDGE_BOTH);
  gpiod_line_config* lc = gpiod_line_config_new();
  unsigned int offset = pin;
  gpiod_line_config_add_line_settings(lc, &offset, 1, s);
  if (p.req) gpiod_line_request_release(p.req);
  gpiod_request_config* rc = gpiod_request_config_new();
  gpiod_request_config_set_consumer(rc, "zinc");
  p.req = gpiod_chip_request_lines(chip, rc, lc);
  gpiod_request_config_free(rc); gpiod_line_config_free(lc); gpiod_line_settings_free(s);
#else
  if (p.line) gpiod_line_release(p.line);
  p.line = gpiod_chip_get_line(chip, pin);
  if (p.line) gpiod_line_request_both_edges_events(p.line, "zinc");
#endif
}
void simulate(uint8_t pin, uint8_t value) { init(); deliver(pin, value ? 1 : 0); }
}}
