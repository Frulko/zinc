#include "zrt.h"
#include "mod/gpio.h"
#include <stdlib.h>
#include <string.h>

// Simulated board (macos/linux/sim). ZINC_GPIO_SCRIPT="27:0@100,27:1@150" drives inputs at given ms.
namespace zrt { namespace gpio {
struct Pin { bool out; uint8_t value; int8_t edge; uint16_t debounce; double last; Fn<void(Ref<PinEdge>)> cb; };
static Pin pins[64];
struct Step { uint8_t pin, value; double at; };
static Step script[64];
static int nscript = -1, iscript = 0;
static double t0 = 0;
static int watchers = 0;

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
struct Driver : Poller {
  bool poll() override {
    double t = now_ms() - t0;
    while (iscript < nscript && script[iscript].at <= t) { deliver(script[iscript].pin, script[iscript].value); iscript++; }
    return iscript < nscript;
  }
};
static void init() {
  if (nscript >= 0) return;
  nscript = 0; t0 = now_ms();
  const char* s = getenv("ZINC_GPIO_SCRIPT");
  while (s && *s && nscript < 64) {
    char* end; long pin = strtol(s, &end, 10); if (*end != ':') break;
    long v = strtol(end + 1, &end, 10); double at = 0; if (*end == '@') at = strtod(end + 1, &end);
    script[nscript++] = {(uint8_t)pin, (uint8_t)v, at};
    s = *end == ',' ? end + 1 : end;
  }
  add_poller(new (alloc(sizeof(Driver))) Driver());
}
void setup(uint8_t pin, const String& mode, const String& pull) {
  init();
  Pin& p = pins[pin & 63];
  p.out = mode.bytes() && mode.ptr()[0] == 'o';
  p.value = (!p.out && pull.bytes() && pull.ptr()[0] == 'u') ? 1 : 0;
}
void write(uint8_t pin, uint8_t value) { init(); pins[pin & 63].value = value ? 1 : 0; }
uint8_t read(uint8_t pin) { init(); return pins[pin & 63].value; }
void watch(uint8_t pin, const String& edge, uint16_t debounceMs, Fn<void(Ref<PinEdge>)> cb) {
  init();
  Pin& p = pins[pin & 63];
  p.edge = edge.bytes() && edge.ptr()[0] == 'r' ? 0 : edge.bytes() && edge.ptr()[0] == 'f' ? 1 : 2;
  p.debounce = debounceMs; p.cb = cb; p.last = -1e9; watchers++;
}
void simulate(uint8_t pin, uint8_t value) { init(); deliver(pin, value ? 1 : 0); }
}}
