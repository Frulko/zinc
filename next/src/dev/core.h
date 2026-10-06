#pragma once
// The device core (ZN-030): what a small device runs, on any machine. It reads the upload protocol (include/zn/devproto.h) a byte at a
// time, checks and verifies the module, runs it in the interpreter with the small stacks of the device and answers. The firmware of an
// ESP32 (firmware/esp32) feeds it from the UART; `zinc device-sim` feeds it from stdin so the same code is tested on the development machine.
// Dependency direction: dev includes rt, vm and zbc.
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace zn::dev {

struct CoreConfig {
  std::size_t stackSlots = 3000;       // register slots of the interpreter (8 bytes each)
  std::size_t maxDepth = 128;          // call frames
  std::size_t maxModule = 64 * 1024;   // bytes of an uploaded module
  std::function<std::size_t()> freeHeap;  // the device's free heap, for the ready and done lines (optional)
};

class Core {
 public:
  Core(CoreConfig cfg, std::function<void(const char*, std::size_t)> write) : cfg_(std::move(cfg)), write_(std::move(write)) {}
  void feed(const std::uint8_t* p, std::size_t n);  // bytes from the host
  void announce();                                  // the `ready` line, sent at start-up too

 private:
  void line(const std::string& l);
  void control(const std::string& l);
  void run();
  void say(const std::string& s) { write_(s.data(), s.size()); }

  CoreConfig cfg_;
  std::function<void(const char*, std::size_t)> write_;
  enum class State { Idle, Header, Body } state_ = State::Idle;
  std::string header_;
  std::vector<std::uint8_t> body_;
  std::size_t want_ = 0;
  std::uint32_t crc_ = 0;
};

}  // namespace zn::dev
