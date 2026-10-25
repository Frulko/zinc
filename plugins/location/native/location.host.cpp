// zinc:location: the part every platform shares (the newest fix under a mutex, the zinc.json permission), over a backend (location.h).
// Compiled alone (Linux, Windows) it has no provider: permission() answers 5 and the program sees 'unavailable'.
#define ZRT_HOSTED_CPP
#include "zinc_native_location.h"
#include "location.h"
#include <string.h>
#include <mutex>
#include <string>
extern "C" int zn_host_permission(const char* feature, const char* detail, char* why, int n) __attribute__((weak));   // zinc.json "permissions" (src/host/permissions.cpp)

#ifndef LOC_BACKEND
int loc_backend_permission(bool) { return 5; }
void loc_backend_start(double, double) {}
void loc_backend_stop() {}
#endif

namespace {
std::mutex mu;
double last[9] = {0, 0, 0, 0, 0, 0, 0, 0, 0};   // seq, then the fix
std::string failure;
zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
}  // namespace

void loc_push(const double fix[8]) {
  std::lock_guard<std::mutex> l(mu);
  last[0] += 1;
  memcpy(last + 1, fix, 8 * sizeof(double));
}
void loc_fail(const char* code, const char* message) {
  std::lock_guard<std::mutex> l(mu);
  failure = std::string(code) + '\x1f' + message;
}

struct HostLocation : NativeLocation {
  zrt::String allowed() override {
    char why[512];
    if (!zn_host_permission || !zn_host_permission("location", "location", why, sizeof why)) return str("");
    return str(std::string("location: ") + why);
  }
  int32_t permission(bool ask) override { return loc_backend_permission(ask); }
  void start(double accuracy, double distance) override {
    { std::lock_guard<std::mutex> l(mu); failure.clear(); }
    loc_backend_start(accuracy, distance);
  }
  void stop() override { loc_backend_stop(); }
  zrt::Array<double> fix() override {
    zrt::Array<double> r = zrt::Array<double>::with_cap(9);
    { std::lock_guard<std::mutex> l(mu); memcpy(r.a->data, last, sizeof last); }
    r.a->len = 9;
    return r;
  }
  zrt::String error() override {
    std::lock_guard<std::mutex> l(mu);
    std::string e;
    e.swap(failure);
    return str(e);
  }
};

NativeLocation* zinc_create_Location() {
  static HostLocation inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
