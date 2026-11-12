#pragma once
#include "board.h"
#include <algorithm>
#include <cmath>
#include <optional>
#if defined(__linux__)
#include <linux/input.h>
#endif

namespace zn::power {
using Number = std::optional<double>;
inline Number number(const std::filesystem::path& p) {
  std::istringstream in(board::text(p)); double n; std::string extra;
  if (!(in >> n) || (in >> extra) || !std::isfinite(n)) return {};
  return n;
}
inline std::string json(Number n) { return n ? std::to_string(*n) : "null"; }
inline std::optional<uint32_t> decodeThrottle(const uint32_t* b, size_t count) {
  if (count != 8 || b[0] != 32 || b[1] != 0x80000000 || b[2] != 0x30046 ||
      b[3] != 4 || b[4] != 0x80000004 || b[6] != 0) return {};
  return b[5];
}
struct Temperature { std::string zone, type; Number celsius; };
struct Snapshot {
  std::vector<Temperature> temperatures;
  Number cpuRequestedMHz, cpuMaxMHz, cpuPolicyMaxMHz, fanRPM, fanDuty, underVoltageAlarm;
  std::optional<uint32_t> throttledFlags;
  bool powerButtonAvailable = false;
  Number powerButtonPressed;
  std::string mailboxStatus = "unsupported";
  std::string json() const {
    std::string out = "{\"temperatures\":["; bool comma = false;
    for (const auto& t : temperatures) {
      if (comma) out += ',';
      comma = true;
      out += "{\"zone\":" + board::quote(t.zone) + ",\"type\":" + board::quote(t.type) + ",\"celsius\":" + power::json(t.celsius) + '}';
    }
    out += "]";
    for (const auto& v : {std::make_pair("cpuRequestedMHz", cpuRequestedMHz), {"cpuMaxMHz", cpuMaxMHz},
         {"cpuPolicyMaxMHz", cpuPolicyMaxMHz}, {"fanRPM", fanRPM}, {"fanDuty", fanDuty}})
      out += ',' + board::quote(v.first) + ':' + power::json(v.second);
    out += ",\"throttledFlags\":" + (throttledFlags ? std::to_string(*throttledFlags) : "null");
    const char* names[] = {"underVoltage", "frequencyCapped", "throttled", "softTemperatureLimit"};
    for (unsigned i = 0; i < 4; ++i) for (unsigned history = 0; history < 2; ++history)
      out += ',' + board::quote(std::string(names[i]) + (history ? "Occurred" : "")) + ':' +
        (!throttledFlags ? "null" : (*throttledFlags & (1u << (i + history * 16))) ? "true" : "false");
    out += ",\"underVoltageAlarm\":" + std::string(!underVoltageAlarm ? "null" : *underVoltageAlarm == 1 ? "true" : "false");
    return out + ",\"mailboxStatus\":" + board::quote(mailboxStatus) +
      ",\"powerButtonAvailable\":" + (powerButtonAvailable ? "true" : "false") +
      ",\"powerButtonPressed\":" + (!powerButtonPressed ? "null" : *powerButtonPressed == 1 ? "true" : "false") + "}";
  }
  std::string summary() const {
    auto value = [](Number n) { return n ? power::json(n) : "unknown"; };
    std::string out;
    for (const auto& t : temperatures) out += t.zone + " (" + t.type + ") " + value(t.celsius) + " C; ";
    if (temperatures.empty()) out = "temperature unknown; ";
    out += "CPU requested " + value(cpuRequestedMHz) + " MHz, maximum " + value(cpuMaxMHz) +
      " MHz, policy " + value(cpuPolicyMaxMHz) + " MHz; ";
    out += "under-voltage " + std::string(!throttledFlags ? "unknown" : (*throttledFlags & 1) ? "yes" : "no") +
      ", recent alarm " + value(underVoltageAlarm) + "; ";
    return out + "fan " + value(fanRPM) + " RPM, duty " + value(fanDuty) + "; button " + value(powerButtonPressed);
  }
};
inline Snapshot probe(const std::string& root = "") {
  namespace fs = std::filesystem;
  Snapshot r;
  auto entries = [&](const std::string& dir) {
    std::vector<fs::path> out; std::error_code ec;
    for (fs::directory_iterator i(root + dir, ec), end; !ec && i != end; i.increment(ec)) out.push_back(i->path());
    std::sort(out.begin(), out.end()); return out;
  };
  for (const auto& p : entries("/sys/class/thermal")) if (p.filename().string().rfind("thermal_zone", 0) == 0) {
    Number n = number(p / "temp"); if (n) *n /= 1000;
    r.temperatures.push_back({p.filename().string(), board::text(p / "type"), n});
  }
  bool buttonReadFailed = false;
  for (const auto& p : entries("/sys/class/input")) if (p.filename().string().rfind("event", 0) == 0) {
    std::istringstream words(board::text(p / "device/capabilities/key"));
    std::string keys, word;
    while (words >> word) {
      if (!keys.empty() && word.size() < sizeof(unsigned long) * 2) keys.append(sizeof(unsigned long) * 2 - word.size(), '0');
      keys += word;
    }
    // KEY_POWER is bit 116; sysfs prints high words first, in the running kernel's native word size.
    if (keys.size() <= 29 || keys.find_first_not_of("0123456789abcdefABCDEF") != std::string::npos) continue;
    const char digit = keys[keys.size() - 30];
    const unsigned nibble = digit <= '9' ? digit - '0' : std::tolower(static_cast<unsigned char>(digit)) - 'a' + 10;
    if (!(nibble & 1)) continue;
    r.powerButtonAvailable = true;
#if defined(__linux__)
    if (root.empty()) {
      int fd = ::open(("/dev/input/" + p.filename().string()).c_str(), O_RDONLY | O_NONBLOCK | O_CLOEXEC);
      if (fd >= 0) {
        unsigned char keysDown[(KEY_MAX + 8) / 8]{};
        if (::ioctl(fd, EVIOCGKEY(sizeof keysDown), keysDown) >= 0) {
          const bool down = (keysDown[KEY_POWER / 8] >> (KEY_POWER % 8)) & 1;
          r.powerButtonPressed = down || (r.powerButtonPressed && *r.powerButtonPressed == 1) ? 1 : 0;
        } else buttonReadFailed = true;
        ::close(fd);
      } else buttonReadFailed = true;
    }
#endif
  }
  if (buttonReadFailed && r.powerButtonPressed != Number(1)) r.powerButtonPressed.reset();
  const fs::path cpu(root + "/sys/devices/system/cpu/cpu0/cpufreq");
  auto clock = [&](const char* file) { Number n = number(cpu / file); if (n && *n >= 0) *n /= 1000; else n.reset(); return n; };
  r.cpuRequestedMHz = clock("scaling_cur_freq"); r.cpuMaxMHz = clock("cpuinfo_max_freq"); r.cpuPolicyMaxMHz = clock("scaling_max_freq");
  for (const auto& p : entries("/sys/class/hwmon")) {
    const std::string name = board::text(p / "name");
    if (name == "rpi_volt") { Number n = number(p / "in0_lcrit_alarm"); if (n && (*n == 0 || *n == 1)) r.underVoltageAlarm = n; }
    if (name == "pwmfan" || name == "pwm-fan") {
      Number rpm = number(p / "fan1_input"), duty = number(p / "pwm1");
      if (rpm && *rpm >= 0) r.fanRPM = rpm;
      if (duty && *duty >= 0 && *duty <= 255) r.fanDuty = duty;
    }
  }
#if defined(__linux__)
  // GET_THROTTLED's zero input preserves the sticky flags; other clients may clear them.
  r.mailboxStatus = "unavailable";
  if (root.empty()) {
    int fd = ::open("/dev/vcio", O_RDONLY | O_CLOEXEC);
    if (fd >= 0) {
      alignas(16) uint32_t b[8] = {32, 0, 0x30046, 4, 0, 0, 0, 0};
      if (::ioctl(fd, _IOWR(100, 0, char*), b) == 0) {
        r.throttledFlags = decodeThrottle(b, 8);
        r.mailboxStatus = r.throttledFlags ? "ready" : "invalid-response";
      } else r.mailboxStatus = "io-error";
      ::close(fd);
    }
  }
#endif
  return r;
}
inline Snapshot current() { const char* root = std::getenv("ZINC_BOARD_ROOT"); return probe(root ? root : ""); }
} // namespace zn::power
