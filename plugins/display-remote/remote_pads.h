// The gamepads on the input wire: the last part of INPUT (zinc device screen --live, src/agent/live.cpp to src/host/mirror.cpp) and of SH_INPUT
// (zinc:shell to its app): n u8, n x {buttons u32, trigger f32 x2, axes f32 x4, name u8 + bytes}, every connected pad each time. A sender
// that predates it leaves it out, and a reader that predates it stops before it.
// ponytail: rumble does not go back to the pad that is far away, and value[] (DualShock 2 pressure) does not travel; a message back when a program needs them
#pragma once
#include "hal.h"
#include "remote_proto.h"
#include <cstring>
#include <string>

namespace zremote {
struct RemotePads { int n; HalGamepad pad[HAL_MAX_GAMEPADS]; bool ours[HAL_MAX_GAMEPADS]; };

inline void pads_put(std::string& m, const HalGamepad* pads) {
  const auto raw = [&](const void* p, size_t n) { m.append(static_cast<const char*>(p), n); };
  int n = 0;
  for (int k = 0; k < HAL_MAX_GAMEPADS; k++) n += pads[k].connected ? 1 : 0;
  m.push_back(static_cast<char>(n));
  for (int k = 0; k < HAL_MAX_GAMEPADS; k++) {
    const HalGamepad& p = pads[k];
    if (!p.connected) continue;
    uint8_t b[4];
    put32(b, p.buttons);
    raw(b, 4); raw(p.trigger, sizeof p.trigger); raw(p.axes, sizeof p.axes);
    const size_t len = strnlen(p.name, sizeof p.name - 1);
    m.push_back(static_cast<char>(len));
    raw(p.name, len);
  }
}

/** Reads the part at `p`: the pads of the sender, replacing the earlier ones. */
inline void pads_get(RemotePads& r, const uint8_t* p, uint32_t n) {
  if (n < 1) return;
  const int count = p[0] < HAL_MAX_GAMEPADS ? p[0] : HAL_MAX_GAMEPADS;
  uint32_t o = 1;
  r.n = 0;
  for (int k = 0; k < count && o + 29 <= n; k++) {
    HalGamepad g{};
    g.connected = 1;
    g.buttons = get32(p + o);
    std::memcpy(g.trigger, p + o + 4, sizeof g.trigger);
    std::memcpy(g.axes, p + o + 12, sizeof g.axes);
    const uint32_t len = p[o + 28];
    o += 29;
    if (o + len > n || len >= sizeof g.name) return;
    std::memcpy(g.name, p + o, len);
    o += len;
    r.pad[r.n++] = g;
  }
}

/** Puts the pads in the free slots of `i`, after the HAL's own, and takes back the slots they had: a pad on the screen's machine keeps its slot. */
inline void pads_merge(RemotePads& r, HalInput* i) {
  for (int k = 0; k < HAL_MAX_GAMEPADS; k++) if (r.ours[k]) { i->pad[k] = HalGamepad{}; r.ours[k] = false; }
  int k = 0;
  for (int j = 0; j < r.n; j++) {
    while (k < HAL_MAX_GAMEPADS && i->pad[k].connected) k++;
    if (k == HAL_MAX_GAMEPADS) return;
    i->pad[k] = r.pad[j];
    r.ours[k] = true;
  }
}
}  // namespace zremote
