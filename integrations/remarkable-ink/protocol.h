#pragma once
#include <stdint.h>
namespace zink {
constexpr uint32_t magic = 0x5a494e4b, version = 1;
constexpr int width = 1620, height = 2160, rows = 16;
constexpr const char* socket_path = "/run/zinc-ink.sock";
enum : uint32_t { Hello = 1, Pixels, Present, Ping, Bye, Ack, Probe };
struct Message {
  uint32_t magic = zink::magic, version = zink::version, type = 0, seq = 0;
  int32_t x = 0, y = 0, w = 0, h = 0, mode = 0;
};
static_assert(sizeof(Message) == 36);
inline bool rectangle(const Message& m) {
  return m.x >= 0 && m.y >= 0 && m.w > 0 && m.h > 0 &&
         m.x < width && m.y < height && m.w <= width - m.x && m.h <= height - m.y;
}
}
