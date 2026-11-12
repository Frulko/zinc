#ifndef ZRT_HOSTED_CPP
#define ZRT_HOSTED_CPP
#endif
#include "zinc_native_spi.h"
#include "../../../runtime/include/hw.h"
#include <glob.h>
#include <string>
#include <mutex>
#include <cstring>

struct HostSPI : NativeSPI {
  enum class State { closed, open, retired };
  static bool transition(State& state, State next) {
    if ((state == State::closed && next == State::open) || (state == State::open && next != State::open)) { state = next; return true; }
    return false;
  }
  struct Slot { State state = State::closed; zn_spi* bus = nullptr; uint32_t generation = 1; } slots[8];
  std::mutex mutex;
  inline static thread_local std::string err;
  HostSPI() { rc = zrt::IMMORTAL; }
  static int echo(void*, const uint8_t* tx, uint8_t* rx, int n) { memcpy(rx, tx, (size_t)n); return 1; }
  static int sink(void*, const uint8_t*, int) { return 1; }
  zn_hw_model model = {sink, nullptr, nullptr, echo};
  ~HostSPI() { for (auto& s : slots) zn_spi_close(s.bus); }
  static zrt::String text(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
  int32_t fail(const char* why) { err = why; return -1; }
  Slot* at(int32_t h) {
    if (h < 0) return nullptr;
    Slot& s = slots[(uint32_t)h & 7];
    return s.state == State::open && s.generation == ((uint32_t)h >> 3) ? &s : nullptr;
  }
  zrt::String list() override {
    std::lock_guard<std::mutex> lock(mutex);
    std::string paths = "sim\n";
#ifdef __linux__
    glob_t g = {};
    if (glob("/dev/spidev*", 0, nullptr, &g) == 0) for (size_t i = 0; i < g.gl_pathc; i++) { paths += g.gl_pathv[i]; paths += '\n'; }
    globfree(&g);
#endif
    return text(paths);
  }
  int32_t open(zrt::String path, int32_t hz, int32_t mode) override {
    std::lock_guard<std::mutex> lock(mutex);
    err.clear();
    std::string p(path.ptr(), path.bytes());
    if (p.empty() || p.find('\0') != std::string::npos || hz <= 0 || mode < 0 || mode > 3) return fail("expected path, positive speed and mode 0..3");
#ifndef __linux__
    if (p != "sim") return fail("hardware SPI requires Linux; select 'sim' for explicit loopback");
#endif
    int i = 0; while (i < 8 && slots[i].state != State::closed) i++;
    if (i == 8) return fail("too many devices open (8)");
    if (p == "sim") zn_hw_sim_attach_spi(&model);
    slots[i].bus = zn_spi_open(p.c_str(), hz, mode);
    if (!slots[i].bus) return fail("cannot open or configure SPI device");
    transition(slots[i].state, State::open);
    return (int32_t)(slots[i].generation << 3) | i;
  }
  zrt::String error() override { return text(err); }
  bool write(int32_t h, zrt::Array<uint8_t> bytes) override {
    std::lock_guard<std::mutex> lock(mutex);
    Slot* s = at(h);
    if (!s || bytes.length() < 1 || bytes.length() > 65535 || !zn_spi_write(s->bus, bytes.length() ? bytes.a->data : nullptr, bytes.length())) { fail("write failed: closed handle, invalid size or device error"); return false; }
    err.clear(); return true;
  }
  zrt::Array<uint8_t> transfer(int32_t h, zrt::Array<uint8_t> bytes) override {
    std::lock_guard<std::mutex> lock(mutex);
    Slot* s = at(h); int n = bytes.length();
    auto out = zrt::Array<uint8_t>::with_cap(n > 0 && n <= 65535 ? n : 0);
    if (!s || n < 1 || n > 65535 || !zn_spi_transfer(s->bus, bytes.a->data, out.a->data, n)) { fail("transfer failed: closed handle, invalid size or device error"); return out; }
    out.a->len = n; err.clear(); return out;
  }
  void close(int32_t h) override {
    std::lock_guard<std::mutex> lock(mutex);
    Slot* s = at(h); if (!s) return;
    zn_spi_close(s->bus); s->bus = nullptr; s->generation++;
    transition(s->state, s->generation > 0x0fffffff ? State::retired : State::closed);
  }
};
NativeSPI* zinc_create_SPI() { static HostSPI instance; return &instance; }
