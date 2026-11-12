#ifndef ZRT_HOSTED_CPP
#define ZRT_HOSTED_CPP
#endif
#include "zinc_native_i2c.h"
#include "../../../runtime/include/hw.h"
#include "../../../src/sim/chips/qmi8658.h"
#include <glob.h>
#include <string>
#include <mutex>
#include <cstring>
#include <cerrno>

struct HostI2C : NativeI2C {
  enum class State { closed, open, retired };
  static bool transition(State& state, State next) {
    if ((state == State::closed && next == State::open) || (state == State::open && next != State::open)) { state = next; return true; }
    return false;
  }
  struct Slot { State state = State::closed; zn_i2c* bus = nullptr; uint32_t generation = 1; } slots[8];
  std::mutex mutex;
  inline static thread_local std::string err;
  HostI2C() { rc = zrt::IMMORTAL; }
  zn::sim::Qmi8658 chip;
  zn_hw_model model = chip.model();
  ~HostI2C() { for (auto& s : slots) zn_i2c_close(s.bus); }
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
    if (glob("/dev/i2c-*", 0, nullptr, &g) == 0) for (size_t i = 0; i < g.gl_pathc; i++) { paths += g.gl_pathv[i]; paths += '\n'; }
    globfree(&g);
#endif
    return text(paths);
  }
  int32_t open(zrt::String path, int32_t address) override {
    std::lock_guard<std::mutex> lock(mutex);
    err.clear();
    std::string p(path.ptr(), path.bytes());
    if (p.empty() || p.find('\0') != std::string::npos || address < 8 || address > 0x77) return fail("expected a path and address 0x08..0x77");
#ifndef __linux__
    if (p != "sim") return fail("hardware I2C requires Linux; select 'sim' for the QMI8658 model");
#endif
    int i = 0; while (i < 8 && slots[i].state != State::closed) i++;
    if (i == 8) return fail("too many devices open (8)");
    if (p == "sim") zn_hw_sim_attach_i2c(0x6b, &model);
    slots[i].bus = zn_i2c_open(p.c_str(), address, -1, -1, 400000);
    if (!slots[i].bus) { err = p + ": cannot open device (missing, busy, permission denied or adapter unsupported)"; return -1; }
    transition(slots[i].state, State::open);
    return (int32_t)(slots[i].generation << 3) | i;
  }
  zrt::String error() override { return text(err); }
  bool write(int32_t h, zrt::Array<uint8_t> bytes) override {
    std::lock_guard<std::mutex> lock(mutex);
    Slot* s = at(h);
    if (!s || bytes.length() < 1 || bytes.length() > 65535 || !zn_i2c_write(s->bus, bytes.length() ? bytes.a->data : nullptr, bytes.length())) { fail("write failed: closed handle, invalid size or unsupported transaction"); return false; }
    err.clear(); return true;
  }
  zrt::Array<uint8_t> readRegister(int32_t h, int32_t reg, int32_t count) override {
    std::lock_guard<std::mutex> lock(mutex);
    Slot* s = at(h);
    auto out = zrt::Array<uint8_t>::with_cap(count > 0 && count <= 65535 ? count : 0);
    if (!s || reg < 0 || reg > 255 || count < 1 || count > 65535 || !zn_i2c_read_reg(s->bus, (uint8_t)reg, out.a->data, count)) {
      fail("register read failed: closed handle, invalid register/count or unsupported transaction"); return out;
    }
    out.a->len = count; err.clear(); return out;
  }
  zrt::Array<int32_t> scan(zrt::String path, zrt::String policy) override {
    std::lock_guard<std::mutex> lock(mutex);
    auto out = zrt::Array<int32_t>::with_cap(112);
    std::string p(path.ptr(), path.bytes()), probe(policy.ptr(), policy.bytes());
    err.clear();
    if (probe != "quick-write" && probe != "receive-byte") { fail("scan requires explicit 'quick-write' or 'receive-byte' policy; neither is universally safe"); return out; }
    if (p == "sim") { out.a->data[0] = 0x6b; out.a->len = 1; return out; }
#ifdef __linux__
    if (p.empty() || p.find('\0') != std::string::npos) { fail("invalid bus path"); return out; }
    int fd = ::open(p.c_str(), O_RDWR | O_CLOEXEC);
    if (fd < 0) { fail("cannot open scan bus"); return out; }
    struct Guard { int fd; ~Guard() { ::close(fd); } } guard{fd};
    unsigned long funcs = 0;
    unsigned long needed = probe == "quick-write" ? I2C_FUNC_SMBUS_QUICK : I2C_FUNC_SMBUS_READ_BYTE;
    if (ioctl(fd, I2C_FUNCS, &funcs) < 0 || !(funcs & needed)) { fail("adapter does not support selected probe policy"); return out; }
    for (int addr = 8; addr <= 0x77; addr++) {
      if (ioctl(fd, I2C_SLAVE, addr) < 0) { if (errno == EBUSY) continue; fail("cannot select scan address"); out.a->len = 0; return out; }
      union i2c_smbus_data data = {};
      i2c_smbus_ioctl_data args = {static_cast<uint8_t>(probe == "quick-write" ? I2C_SMBUS_WRITE : I2C_SMBUS_READ), 0,
        static_cast<uint32_t>(probe == "quick-write" ? I2C_SMBUS_QUICK : I2C_SMBUS_BYTE), &data};
      if (ioctl(fd, I2C_SMBUS, &args) == 0) out.a->data[out.a->len++] = addr;
      else if (errno != ENXIO && errno != EREMOTEIO && errno != ENODEV) { fail("scan failed (adapter error or timeout)"); out.a->len = 0; return out; }
    }
#else
    fail("hardware scanning requires Linux");
#endif
    return out;
  }
  void close(int32_t h) override {
    std::lock_guard<std::mutex> lock(mutex);
    Slot* s = at(h); if (!s) return;
    zn_i2c_close(s->bus); s->bus = nullptr; s->generation++;
    transition(s->state, s->generation > 0x0fffffff ? State::retired : State::closed);
  }
};
NativeI2C* zinc_create_I2C() { static HostI2C instance; return &instance; }
