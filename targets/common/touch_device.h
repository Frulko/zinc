#pragma once
#include <cstring>

// Indirect absolute touchpads are opt-in: normal desktop apps keep pointer/scroll semantics.
inline bool hal_touch_device_enabled(bool direct, bool indirect_absolute, const char* raw_trackpad) {
    return direct || (indirect_absolute && raw_trackpad && std::strcmp(raw_trackpad, "1") == 0);
}
