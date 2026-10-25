#include "zinc_native_remarkablestatus.h"
#include <time.h>
#ifdef __linux__
// Linux (the reMarkable runs the package's linux prebuilt, a laptop, a Pi): the first power supply of type Battery that has the field
#include <dirent.h>
#include <stdio.h>
#include <string.h>
namespace {
bool value(const char* device, const char* field, char* out, size_t n) {
  char path[512]; snprintf(path, sizeof path, "/sys/class/power_supply/%s/%s", device, field);
  FILE* f = fopen(path, "r"); if (!f) return false;
  bool ok = fgets(out, n, f) != nullptr; fclose(f); return ok;
}
bool battery_field(const char* field, char* out, size_t n) {
  DIR* dir = opendir("/sys/class/power_supply"); if (!dir) return false;
  bool found = false;
  while (dirent* entry = readdir(dir)) {
    char type[64];
    if (value(entry->d_name, "type", type, sizeof type) && !strncmp(type, "Battery", 7)) {
      found = value(entry->d_name, field, out, n); if (found) break;
    }
  }
  closedir(dir); return found;
}
}
struct Status : NativeRemarkableStatus {
  int32_t battery() override {
    char s[64]; int level = -1;
    if (battery_field("capacity", s, sizeof s)) sscanf(s, "%d", &level);
    return level >= 0 && level <= 100 ? level : -1;
  }
  bool charging() override { char s[64]; return battery_field("status", s, sizeof s) && !strncmp(s, "Charging", 8); }
  int32_t localMinutes() override { time_t t = time(nullptr); struct tm local{}; localtime_r(&t, &local); return local.tm_hour * 60 + local.tm_min; }
};
#else
struct Status : NativeRemarkableStatus {   // a desktop preview: battery unknown
  int32_t battery() override { return -1; }
  bool charging() override { return false; }
  int32_t localMinutes() override { time_t t = time(nullptr); struct tm local{}; localtime_r(&t, &local); return local.tm_hour * 60 + local.tm_min; }
};
#endif
NativeRemarkableStatus* zinc_create_RemarkableStatus() { static Status s; s.rc = zrt::IMMORTAL; return &s; }
