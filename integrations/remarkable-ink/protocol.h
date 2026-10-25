// The ink lane's wire protocol, version 2 (docs/reports/remarkable-bridge-design.md §4.3). One client (root), SOCK_SEQPACKET.
// No pixels travel on the socket: the client writes them into its own qtfb shared memory, as on L0, and names the rectangle.
//   client Hello {key = QTFB_KEY, pid}        lane Welcome {hash = SHA-256 of libqsgepaper.so, w, h = panel}, or closes
//   client StrokeBegin                         lane blocks xochitl's rendering (deadline: 500 ms after the last Ink, 10 s per stroke)
//   client Ink {x, y, w, h}                    lane copies the rectangle from qtfb into the vendor buffer, Pen/Mono partial swap
//   client StrokeEnd {x, y, w, h = stroke box} lane unblocks and repaints the box through AppLoad's item: the colour settle
//   client Bye
// Any error on either side closes the socket. The client sees EOF and stays on qtfb (L0) for the rest of the session.
#pragma once
#include <stdint.h>
namespace zink {
constexpr uint32_t magic = 0x5a494e4b, version = 2;
constexpr const char* socket_path = "/run/zinc-ink.sock";
constexpr int stroke_idle_ms = 500, stroke_max_ms = 10000;
enum : uint32_t { Hello = 1, Welcome, StrokeBegin, Ink, StrokeEnd, Bye };
struct Message {
  uint32_t magic = zink::magic, version = zink::version, type = 0, seq = 0;
  int32_t x = 0, y = 0, w = 0, h = 0;
  int32_t key = 0, pid = 0;
  char hash[64] = {};  // lowercase hex, no terminator
};
static_assert(sizeof(Message) == 104, "lane wire layout");
inline bool inside(const Message& m, int width, int height) {
  return m.x >= 0 && m.y >= 0 && m.w > 0 && m.h > 0 && m.x < width && m.y < height && m.w <= width - m.x && m.h <= height - m.y;
}
}  // namespace zink
