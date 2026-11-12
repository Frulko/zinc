#ifndef ZRT_HOSTED_CPP
#define ZRT_HOSTED_CPP
#endif
#include "zinc_native_gpio.h"
#include "../../../runtime/include/hw.h"
#include <chrono>
#include <mutex>
#include <string>
#include <cstdlib>
#include <limits>

struct HostGPIO : NativeGPIO {
  struct Slot { zn_gpio line; uint32_t generation = 1; std::string chip, name; int offset = 0; } slots[256];
  std::mutex mutex;
  inline static thread_local std::string err;
  HostGPIO() {
    rc = zrt::IMMORTAL;
    for (int i = 0; i < 256; ++i) {
      slots[i].offset = i;
#if !defined(__linux__) && !defined(ESP_PLATFORM)
      slots[i].chip = "sim";
#endif
      if (std::getenv("ZINC_GPIO_SCRIPT")) slots[i].chip = "sim";
    }
  }
  ~HostGPIO() { for (auto& s : slots) zn_gpio_close(&s.line); }
  static zrt::String text(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
  static std::string str(zrt::String s) { return std::string(s.ptr(), s.bytes()); }
  bool fail(const char* operation) { err = std::string(operation) + ": " + (errno == EEXIST ? "ambiguous chip label or line name; select an exact chip path" : strerror(errno)); return false; }
  Slot* at(int32_t pin) { if (pin < 0 || pin > 255) { errno = EINVAL; fail("pin must be 0..255"); return nullptr; } return &slots[pin]; }
  bool ensure(Slot& s) {
    if (s.line.state == zn_gpio_state::open) return true;
    if (s.generation == INT32_MAX) { errno = EOVERFLOW; return fail("pin generation exhausted"); }
    if (!zn_gpio_open(&s.line, s.chip.c_str(), s.offset, s.name.c_str(), {})) return fail("request line (Linux requires GPIO uAPI v2)");
    return true;
  }
  bool releaseSlot(Slot& s) { if (!zn_gpio_close(&s.line)) return fail("release line"); if (s.generation < INT32_MAX) ++s.generation; return true; }
  bool simulated(int32_t pin) override { std::lock_guard<std::mutex> lock(mutex); Slot* s = at(pin); return s && s->line.simulated; }
  zrt::String error() override { return text(err); }
  bool select(int32_t pin, zrt::String chip, zrt::String line) override {
    std::lock_guard<std::mutex> lock(mutex); err.clear();
    Slot* s = at(pin); if (!s) return false;
    std::string c = str(chip), l = str(line);
    if (c.find('\0') != std::string::npos || l.find('\0') != std::string::npos || l.empty()) { errno = EINVAL; return fail("invalid chip/line"); }
    int offset = 0; bool numeric = l.find_first_not_of("0123456789") == std::string::npos;
    if (numeric) for (char ch : l) { if (offset > 6553) { errno = EINVAL; return fail("line offset too large"); } offset = offset * 10 + ch - '0'; }
    if (numeric && offset > 65535) { errno = EINVAL; return fail("line offset too large"); }
    if (l.rfind("CHIP:", 0) == 0) {
      offset = zn_gpio_chip_line(l.c_str());
      if (offset < 0 || c.empty()) { errno = EINVAL; return fail("CHIP alias requires an explicit controller and CSID0..7 or XIO-P0..7"); }
      numeric = true;
    }
    if (c == "sim" && !numeric) { errno = EINVAL; return fail("sim needs a numeric line"); }
    if (!releaseSlot(*s)) return false;
    s->chip = c; s->offset = numeric ? offset : 0; s->name = numeric ? "" : l; return true;
  }
  bool setup(int32_t pin, zrt::String mode, zrt::String pull, zrt::String drive, int32_t initial) override {
    std::lock_guard<std::mutex> lock(mutex); err.clear();
    Slot* s = at(pin); if (!s) return false;
    const std::string m = str(mode), b = str(pull), d = str(drive);
    if ((m != "in" && m != "out") || (b != "none" && b != "up" && b != "down" && b != "keep") || (d != "push-pull" && d != "open-drain" && d != "open-source") || initial < 0 || initial > 1) { errno = EINVAL; return fail("invalid mode/pull/drive/value"); }
    zn_gpio_config c = s->line.config; c.output = m == "out"; c.bias = b == "keep" ? 0 : b == "none" ? 1 : b == "up" ? 2 : 3;
    c.drive = d == "push-pull" ? 0 : d == "open-drain" ? 1 : 2; c.initial = initial;
    if (!zn_gpio_valid(c)) { errno = EINVAL; return fail("output cannot watch edges; drive requires output"); }
    if (s->line.state == zn_gpio_state::open) { if (!zn_gpio_configure(&s->line, c)) return fail("configure line"); }
    else if (s->generation == INT32_MAX) { errno = EOVERFLOW; return fail("pin generation exhausted"); }
    else if (!zn_gpio_open(&s->line, s->chip.c_str(), s->offset, s->name.c_str(), c)) return fail("request line (Linux requires GPIO uAPI v2)");
    return true;
  }
  bool write(int32_t pin, int32_t value) override {
    std::lock_guard<std::mutex> lock(mutex); err.clear(); Slot* s = at(pin);
    return s && ensure(*s) && (zn_gpio_write(&s->line, value != 0) || fail("write output"));
  }
  int32_t read(int32_t pin) override {
    std::lock_guard<std::mutex> lock(mutex); err.clear(); Slot* s = at(pin);
    if (!s || !ensure(*s)) return -1;
    int value = zn_gpio_read(&s->line); if (value < 0) fail("read line"); return value;
  }
  int32_t watch(int32_t pin, zrt::String edge, int32_t debounceMs) override {
    std::lock_guard<std::mutex> lock(mutex); err.clear(); Slot* s = at(pin);
    std::string e = str(edge);
    if ((e != "none" && e != "rising" && e != "falling" && e != "both") || debounceMs < 0 || debounceMs > 65535) { errno = EINVAL; fail("invalid edge/debounce"); return -1; }
    if (!s || !ensure(*s)) return -1;
    zn_gpio_config c = s->line.config;
    if (c.output || s->generation >= INT32_MAX - 1) { errno = EINVAL; fail("watch requires an input and an available generation"); return -1; }
    c.edge = 0; c.debounce_us = 0;
    if (!zn_gpio_configure(&s->line, c)) { fail("disable old edges"); return -1; }
    ++s->generation; // Previously queued Zinc callbacks are invalid even if enabling the replacement fails.
    zn_gpio_event dropped; int n = 0;
    for (int i = 0; i < 256; ++i) { n = zn_gpio_next(&s->line, &dropped); if (n <= 0) break; }
    if (n != 0) { if (n > 0) errno = EOVERFLOW; fail("drain old edges"); return -1; }
    zn_gpio_debounce_reset(s->line);
    c.edge = e == "none" ? 0 : e == "rising" ? 1 : e == "falling" ? 2 : 3;
    c.debounce_us = c.edge ? (uint32_t)debounceMs * 1000 : 0;
    if (!zn_gpio_configure(&s->line, c)) { fail("enable edges/debounce"); return -1; }
    return (int32_t)s->generation;
  }
  void release(int32_t pin) override {
    std::lock_guard<std::mutex> lock(mutex); err.clear(); Slot* s = at(pin); if (s) releaseSlot(*s);
  }
  bool simulate(int32_t pin, int32_t value) override {
    std::lock_guard<std::mutex> lock(mutex); err.clear(); Slot* s = at(pin);
    auto ns = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
    return s && ensure(*s) && (zn_gpio_simulate(&s->line, value != 0, (uint64_t)ns) || fail("simulate requires simulator input"));
  }
  zrt::Array<double> poll(int32_t pin, int32_t generation) override {
    std::lock_guard<std::mutex> lock(mutex); err.clear(); auto out = zrt::Array<double>::with_cap(64 * 3);
    Slot* s = at(pin); if (!s || s->line.state != zn_gpio_state::open || (uint32_t)generation != s->generation) return out;
    for (int i = 0; i < 64; ++i) {
      zn_gpio_event event; int n = zn_gpio_next(&s->line, &event);
      if (n == 0) break;
      if (n < 0) { fail("read edge"); break; }
      // ESP uses ISR timestamps with software debounce/filtering; Linux/sim already filter their events.
#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
      if (!(s->line.config.edge & (event.value ? 1 : 2)) || !zn_gpio_debounce_accept(s->line, event.timestamp_ns)) continue;
#endif
      out.a->data[out.a->len++] = event.value;
      out.a->data[out.a->len++] = (double)event.timestamp_ns / 1000000.0;
      out.a->data[out.a->len++] = event.sequence;
    }
    return out;
  }
};
NativeGPIO* zinc_create_GPIO() { static HostGPIO instance; return &instance; }
