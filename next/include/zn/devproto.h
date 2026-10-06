#pragma once
// The upload protocol between `zinc` and the core firmware of a small device (ZN-030), spoken over a serial line (a UART, a TCP socket of
// QEMU, a pipe to the simulator). Control lines start with the byte 0x1E (record separator) so they stay apart from the device's boot
// messages, which a bootloader prints on the same line. Everything is text except the module bytes that follow a `load` line.
//
//   host -> device   0x1E "ZN ping" LF                          the device answers `ready`
//                    0x1E "ZN load <length> <crc32 hex>" LF <length bytes of ZBC>
//   device -> host   0x1E "ZN ready <core version> <free heap bytes>" LF
//                    0x1E "ZN err <message>" LF                 the module was not accepted (size, checksum, not valid ZBC)
//                    0x1E "ZN out <length>" LF <length bytes>   what the program printed
//                    0x1E "ZN done <status> <leaked objects> <free heap>" LF    status 0 ok, 1 runtime error (message in `out`), 101 uncaught exception
#include <cstdint>
#include <string>

namespace zn::dev {

inline constexpr char kMark = '\x1e';
inline constexpr const char* kCoreVersion = "0.1";

inline std::uint32_t crc32(const std::uint8_t* p, std::size_t n, std::uint32_t crc = 0) {
  crc = ~crc;
  for (std::size_t i = 0; i < n; ++i) {
    crc ^= p[i];
    for (int k = 0; k < 8; ++k) crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
  }
  return ~crc;
}

inline std::string hex32(std::uint32_t v) {
  static const char* d = "0123456789abcdef";
  std::string r(8, '0');
  for (int i = 7; i >= 0; --i, v >>= 4) r[static_cast<std::size_t>(i)] = d[v & 15];
  return r;
}

}  // namespace zn::dev
