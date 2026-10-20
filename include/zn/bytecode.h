#pragma once
// ZBC instruction encoding: one 32-bit word. Shared by emitter, verifier, interpreter and AOT.
//   ABC/ABK: op | A<<8 | B<<16 | C<<24 (C is an immediate in ABK)      AD: op | A<<8 | D<<16 (D: 16 bits, signed for LoadI)      AX: op | X<<8 (24 bits)
#include <cstdint>

#include "zn/opcodes.h"

namespace zn {

constexpr std::uint32_t encABC(Op o, unsigned a, unsigned b = 0, unsigned c = 0) {
  return static_cast<std::uint32_t>(o) | (a & 0xFFu) << 8 | (b & 0xFFu) << 16 | (c & 0xFFu) << 24;
}
constexpr std::uint32_t encAD(Op o, unsigned a, unsigned d) { return static_cast<std::uint32_t>(o) | (a & 0xFFu) << 8 | (d & 0xFFFFu) << 16; }
constexpr std::uint32_t encAX(Op o, unsigned x) { return static_cast<std::uint32_t>(o) | (x & 0xFFFFFFu) << 8; }

constexpr unsigned opOf(std::uint32_t w) { return w & 0xFFu; }
constexpr unsigned aOf(std::uint32_t w) { return (w >> 8) & 0xFFu; }
constexpr unsigned bOf(std::uint32_t w) { return (w >> 16) & 0xFFu; }
constexpr unsigned cOf(std::uint32_t w) { return (w >> 24) & 0xFFu; }
constexpr unsigned dOf(std::uint32_t w) { return (w >> 16) & 0xFFFFu; }
constexpr int immOf(std::uint32_t w) { return static_cast<std::int8_t>((w >> 24) & 0xFFu); }  // signed 8-bit C
constexpr int sdOf(std::uint32_t w) { return static_cast<std::int16_t>((w >> 16) & 0xFFFFu); }
constexpr unsigned axOf(std::uint32_t w) { return (w >> 8) & 0xFFFFFFu; }

}  // namespace zn
