#include "zinc_native_remarkablestatus.h"
#include <time.h>
struct Status : NativeRemarkableStatus {
  int32_t battery() override { return -1; }
  bool charging() override { return false; }
  int32_t localMinutes() override { time_t t = time(nullptr); struct tm local{}; localtime_r(&t, &local); return local.tm_hour * 60 + local.tm_min; }
};
NativeRemarkableStatus* zinc_create_RemarkableStatus() { static Status s; s.rc = zrt::IMMORTAL; return &s; }
