#include "dev/core.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <sstream>

#include "vm/vm.h"
#include "zbc/zbc.h"
#include "zn/devproto.h"

namespace zn::dev {

void Core::announce() {
  say(std::string(1, kMark) + "ZN ready " + kCoreVersion + " " + std::to_string(cfg_.freeHeap ? cfg_.freeHeap() : 0) + "\n");
}

void Core::line(const std::string& l) { say(std::string(1, kMark) + "ZN " + l + "\n"); }

void Core::feed(const std::uint8_t* p, std::size_t n) {
  for (std::size_t i = 0; i < n; ++i) {
    std::uint8_t b = p[i];
    switch (state_) {
      case State::Idle:
        if (b == static_cast<std::uint8_t>(kMark)) { state_ = State::Header; header_.clear(); }
        break;  // anything else is the line noise of a console, ignored
      case State::Header:
        if (b == '\n') { state_ = State::Idle; control(header_); }
        else if (b == static_cast<std::uint8_t>(kMark)) header_.clear();
        else if (header_.size() > 80) state_ = State::Idle;
        else header_ += static_cast<char>(b);
        break;
      case State::Body: {
        // the rest of the module may arrive in the same chunk: take what belongs to it
        std::size_t take = std::min(want_ - body_.size(), n - i);
        body_.insert(body_.end(), p + i, p + i + take);
        i += take - 1;
        if (body_.size() == want_) { state_ = State::Idle; run(); }
        break;
      }
    }
  }
}

void Core::control(const std::string& l) {
  std::istringstream in(l);
  std::string zn, cmd;
  in >> zn >> cmd;
  if (zn != "ZN") return;
  if (cmd == "ping") { announce(); return; }
  if (cmd == "load") {
    std::size_t len = 0;
    std::string crc;
    in >> len >> crc;
    if (len == 0 || len > cfg_.maxModule) { line("err module of " + std::to_string(len) + " bytes does not fit (limit " + std::to_string(cfg_.maxModule) + ")"); return; }
    want_ = len;
    crc_ = static_cast<std::uint32_t>(std::strtoul(crc.c_str(), nullptr, 16));
    body_.clear();
    body_.reserve(len);
    state_ = State::Body;
    return;
  }
  line("err unknown command " + cmd);
}

void Core::run() {
  if (dev::crc32(body_.data(), body_.size()) != crc_) { line("err checksum mismatch"); return; }
  zbc::Module m;
  std::string err;
  if (!zbc::decode(body_, m, err)) { line("err not a ZBC module: " + err); return; }
  err = zbc::verify(m);
  if (!err.empty()) { line("err invalid ZBC: " + err); return; }
  body_.clear();
  body_.shrink_to_fit();  // the decoded module is what runs now
  std::string out;
  rt::Result res = vm::runHooked(m, out, nullptr, nullptr, nullptr, nullptr, cfg_.stackSlots, cfg_.maxDepth);
  int status = res.ok ? 0 : res.error.rfind("panic: ", 0) == 0 ? 101 : 1;
  if (!res.ok) out += res.error + "\n";
  line("out " + std::to_string(out.size()));
  write_(out.data(), out.size());
  line("done " + std::to_string(status) + " " + std::to_string(res.leaked) + " " + std::to_string(cfg_.freeHeap ? cfg_.freeHeap() : 0));
}

}  // namespace zn::dev
