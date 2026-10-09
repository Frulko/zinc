#include "zinc_native_rmpprefresh.h"
// Desktop preview only: no hardware waveform changes.
struct Refresh : NativeRmppRefresh {
  int32_t current = 1;
  bool setFast(bool fast) override { current = fast ? 1 : 4; return true; }
  int32_t mode() override { return current; }
  bool busy() override { return false; }
};
NativeRmppRefresh* zinc_create_RmppRefresh() {
  static Refresh s; s.rc = zrt::IMMORTAL; return &s;
}
