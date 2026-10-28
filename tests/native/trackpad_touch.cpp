#include "targets/common/touch_device.h"
#include <cassert>
int main() {
    assert(hal_touch_device_enabled(true, false, nullptr));
    assert(!hal_touch_device_enabled(false, true, nullptr));
    assert(!hal_touch_device_enabled(false, true, "0"));
    assert(hal_touch_device_enabled(false, true, "1"));
    assert(!hal_touch_device_enabled(false, false, "1"));
}
