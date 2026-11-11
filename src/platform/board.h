#pragma once
// Runtime board inventory, shared by doctor and zinc:sys; a root prefix isolates simulator fixtures.
#include <cstdint>
#include <cstdio>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <vector>
#if defined(__linux__)
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/videodev2.h>
#endif

namespace zn::board {
struct Identity { std::string model, soc; unsigned ramMB = 0; };
inline Identity decode(uint32_t code) {
  if (!(code & (1u << 23))) {
    switch (code & 0xffff) {
      case 2: case 3: case 4: case 5: case 6: return {"Raspberry Pi Model B", "BCM2835", 256};
      case 7: case 8: case 9: return {"Raspberry Pi Model A", "BCM2835", 256};
      case 0xd: case 0xe: case 0xf: return {"Raspberry Pi Model B", "BCM2835", 512};
      case 0x10: case 0x13: return {"Raspberry Pi Model B Plus", "BCM2835", 512};
      case 0x11: case 0x14: return {"Raspberry Pi Compute Module", "BCM2835", 512};
      case 0x12: return {"Raspberry Pi Model A Plus", "BCM2835", 256};
      case 0x15: return {"Raspberry Pi Model A Plus", "BCM2835", 0}; // Published with both RAM sizes; read MemTotal instead.
      default: return {};
    }
  }
  static const std::map<unsigned, const char*> models = {
    {0,"Model A"},{1,"Model B"},{2,"Model A Plus"},{3,"Model B Plus"},{4,"2 Model B"},{5,"Alpha"},
    {6,"Compute Module"},{8,"3 Model B"},{9,"Zero"},{10,"Compute Module 3"},{12,"Zero W"},
    {13,"3 Model B Plus"},{14,"3 Model A Plus"},{16,"Compute Module 3 Plus"},{17,"4 Model B"},
    {18,"Zero 2 W"},{19,"400"},{20,"Compute Module 4"},{21,"Compute Module 4S"},{23,"5"},
    {24,"Compute Module 5"},{25,"500/500+"},{26,"Compute Module 5 Lite"},{27,"Compute Module 0"}};
  Identity r;
  auto m = models.find((code >> 4) & 255);
  if (m != models.end()) r.model = std::string("Raspberry Pi ") + m->second;
  if (((code >> 4) & 255) == 25) r.model = (code >> 20 & 7) == 6 ? "Raspberry Pi 500+" : "Raspberry Pi 500";
  const unsigned cpu = (code >> 12) & 15, mem = (code >> 20) & 7;
  static const char* const cpus[] = {"BCM2835", "BCM2836", "BCM2837", "BCM2711", "BCM2712"};
  if (cpu < 5) r.soc = cpus[cpu];
  if (mem < 7) r.ramMB = 256u << mem;
  return r;
}
inline std::string read(const std::filesystem::path& p) {
  std::ifstream f(p, std::ios::binary);
  char b[65536]; f.read(b, sizeof b);
  return std::string(b, static_cast<size_t>(f.gcount()));
}
inline std::string text(const std::filesystem::path& p) {
  std::string s = read(p); s.resize(s.find('\0') == std::string::npos ? s.size() : s.find('\0'));
  while (!s.empty() && (s.back() == '\n' || s.back() == '\r')) s.pop_back();
  return s;
}
inline std::string quote(const std::string& s) {
  std::string out = "\"";
  for (unsigned char c : s) {
    if (c == '\\' || c == '"') { out += '\\'; out += static_cast<char>(c); }
    else if (c < 32) { char b[7]; std::snprintf(b, sizeof b, "\\u%04x", c); out += b; }
    else out += static_cast<char>(c);
  }
  return out + "\"";
}
struct Inventory {
  Identity identity;
  std::string revision, compatible, hatProduct, hatVendor;
  std::map<std::string, bool> caps{{"gpio",false},{"i2c",false},{"spi",false},{"pwm",false},{"hwdec-h264",false},
                                  {"drm",false},{"audio",false},{"wifi",false},{"ble",false},{"camera",false}};
  std::vector<std::string> gpioLabels, videoDrivers, drmDrivers;
  std::string json() const {
    std::string out = "{\"BOARD\":" + quote(identity.model) + ",\"SOC\":" + quote(identity.soc) + ",\"RAM_MB\":" + std::to_string(identity.ramMB) +
      ",\"REVISION\":" + quote(revision) + ",\"compatible\":" + quote(compatible) + ",\"hatProduct\":" + quote(hatProduct) + ",\"hatVendor\":" + quote(hatVendor) + ",\"caps\":{";
    bool comma = false;
    for (const auto& c : caps) { if (comma) out += ','; comma = true; out += quote(c.first) + ':' + (c.second ? "true" : "false"); }
    out += '}';
    for (const auto& field : {std::make_pair("gpioLabels", &gpioLabels), {"videoDrivers", &videoDrivers}, {"drmDrivers", &drmDrivers}}) {
      out += ',' + quote(field.first) + ":["; comma = false;
      for (const auto& v : *field.second) { if (comma) out += ','; comma = true; out += quote(v); }
      out += ']';
    }
    return out + '}';
  }
  std::string summary() const {
    std::string s = "board " + (identity.model.empty() ? "unknown" : identity.model) + "\nsoc " + identity.soc + "\nram_mb " + std::to_string(identity.ramMB) + "\nrevision " + revision + "\nobserved";
    for (const auto& c : caps) s += " " + c.first + "=" + (c.second ? "true" : "false");
    return s + '\n';
  }
};
inline Inventory probe(const std::string& root = "") {
  namespace fs = std::filesystem;
  Inventory r;
  auto path = [&](const std::string& s) { return fs::path(root + s); };
  std::error_code ec;
  fs::path dt = path("/proc/device-tree");
  if (!fs::exists(dt, ec)) dt = path("/sys/firmware/devicetree/base");
  std::string rev = read(dt / "system/linux,revision");
  uint32_t code = 0;
  if (rev.size() == 4) for (unsigned char c : rev) code = (code << 8) | c;
  else {
    std::istringstream cpu(text(path("/proc/cpuinfo"))); std::string line;
    while (std::getline(cpu, line)) if (line.rfind("Revision",0) == 0 && line.find(':') != std::string::npos) {
      std::istringstream value(line.substr(line.find(':') + 1)); value >> std::hex >> code;
    }
  }
  r.identity = decode(code);
  if (code) { char b[9]; std::snprintf(b,sizeof b,"%x",code); r.revision = b; }
  const std::string model = text(dt / "model");
  if (!model.empty()) r.identity.model = model;
  r.compatible = read(dt / "compatible");
  for (char& c : r.compatible) if (!c) c = ',';
  if (!r.compatible.empty() && r.compatible.back() == ',') r.compatible.pop_back();
  r.hatProduct = text(dt / "hat/product"); r.hatVendor = text(dt / "hat/vendor");
  if (r.identity.soc.empty()) for (const char* soc : {"bcm2835","bcm2836","bcm2837","bcm2711","bcm2712"})
    if (r.compatible.find(std::string("brcm,") + soc) != std::string::npos) { r.identity.soc = soc; for (char& c : r.identity.soc) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c))); break; }
  if (r.identity.model.empty()) r.identity.model = text(path("/sys/class/dmi/id/product_name"));
  if (!r.identity.ramMB) {
    std::istringstream mem(text(path("/proc/meminfo"))); std::string key, unit; uint64_t kb;
    if (mem >> key >> kb >> unit && key == "MemTotal:" && unit == "kB") r.identity.ramMB = static_cast<unsigned>(kb / 1024);
  }
  auto entries = [&](const std::string& dir) {
    std::vector<fs::path> out; std::error_code error;
    for (fs::directory_iterator i(path(dir),error), end; !error && i != end; i.increment(error)) out.push_back(i->path());
    return out;
  };
  for (const auto& p : entries("/dev")) {
    const std::string n = p.filename().string();
    if (n.rfind("i2c-",0) == 0) r.caps["i2c"] = true;
    if (n.rfind("spidev",0) == 0) r.caps["spi"] = true;
#if defined(__linux__)
    if (root.empty() && n.rfind("video",0) == 0) {
      int fd = ::open(p.c_str(), O_RDONLY | O_NONBLOCK | O_CLOEXEC);
      if (fd >= 0) {
        v4l2_capability cap{};
        if (::ioctl(fd, VIDIOC_QUERYCAP, &cap) == 0) {
          r.videoDrivers.emplace_back(reinterpret_cast<const char*>(cap.driver));
          const uint32_t caps = cap.capabilities & V4L2_CAP_DEVICE_CAPS ? cap.device_caps : cap.capabilities;
          r.caps["camera"] = r.caps["camera"] || (!(caps & (V4L2_CAP_VIDEO_M2M | V4L2_CAP_VIDEO_M2M_MPLANE)) && (caps & (V4L2_CAP_VIDEO_CAPTURE | V4L2_CAP_VIDEO_CAPTURE_MPLANE)));
          if (caps & (V4L2_CAP_VIDEO_M2M | V4L2_CAP_VIDEO_M2M_MPLANE)) {
            v4l2_fmtdesc fmt{}; fmt.type = caps & V4L2_CAP_VIDEO_M2M_MPLANE ? V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE : V4L2_BUF_TYPE_VIDEO_OUTPUT;
            for (fmt.index = 0; fmt.index < 256 && ::ioctl(fd, VIDIOC_ENUM_FMT, &fmt) == 0; ++fmt.index)
              if (fmt.pixelformat == V4L2_PIX_FMT_H264) r.caps["hwdec-h264"] = true;
          }
        }
        ::close(fd);
      }
    }
#endif
  }
  for (const auto& p : entries("/sys/class/gpio")) if (p.filename().string().rfind("gpiochip",0) == 0) {
    const std::string label = text(p / "label");
    if (!label.empty()) { r.gpioLabels.push_back(label); r.caps["gpio"] = true; }
  }
  for (const auto& p : entries("/sys/bus/gpio/devices")) if (p.filename().string().rfind("gpiochip",0) == 0) {
    const std::string label = text(p / "label");
    if (!label.empty()) { r.gpioLabels.push_back(label); r.caps["gpio"] = true; }
  }
  for (const auto& p : entries("/sys/class/pwm")) if (p.filename().string().rfind("pwmchip",0) == 0) r.caps["pwm"] = true;
  for (const auto& p : entries("/sys/class/drm")) if (p.filename().string().rfind("card",0) == 0 && p.filename().string().find('-') == std::string::npos) {
    const fs::path driver = fs::read_symlink(p / "device/driver", ec);
    if (!ec) { r.drmDrivers.push_back(driver.filename().string()); r.caps["drm"] = true; }
  }
  for (const auto& p : entries("/proc/asound")) if (p.filename().string().rfind("card",0) == 0) r.caps["audio"] = true;
  r.caps["ble"] = fs::exists(path("/sys/class/bluetooth/hci0"), ec);
  r.caps["wifi"] = fs::exists(path("/sys/class/net/wlan0"), ec);
  return r;
}
inline Inventory current() { const char* root = std::getenv("ZINC_BOARD_ROOT"); return probe(root ? root : ""); }
} // namespace zn::board
