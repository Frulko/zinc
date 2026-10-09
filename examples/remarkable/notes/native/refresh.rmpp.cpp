#include "zinc_native_rmpprefresh.h"
extern "C" bool zinc_rmpp_set_fast(bool);
extern "C" int zinc_rmpp_refresh_mode();
extern "C" bool zinc_rmpp_refresh_busy();
struct Refresh : NativeRmppRefresh {
  bool setFast(bool fast) override { return zinc_rmpp_set_fast(fast); }
  int32_t mode() override { return zinc_rmpp_refresh_mode(); }
  bool busy() override { return zinc_rmpp_refresh_busy(); }
};
NativeRmppRefresh* zinc_create_RmppRefresh() {
  static Refresh s; s.rc = zrt::IMMORTAL; return &s;
}
