#pragma once
#include <cstdint>

namespace ipod::usb {
// Disk-mode iPods and Shuffles; iPhone, iPad and iPod touch have no iPod_Control disk.
inline bool diskModeIpod(uint16_t product) { return (product >= 0x1201 && product < 0x1290) || (product >= 0x1300 && product <= 0x130f); }
}
