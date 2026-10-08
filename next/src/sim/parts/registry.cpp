#include "sim/parts/registry.h"

#include <map>

namespace zn::sim {
namespace {
// zn type -> the wokwi alias(es) it answers to
const std::map<std::string, std::string>& types() {
  static const std::map<std::string, std::string> t = {
      {"zn-led", "wokwi-led"}, {"zn-rgb-led", "wokwi-rgb-led"}, {"zn-pushbutton", "wokwi-pushbutton"}, {"zn-slide-switch", "wokwi-slide-switch"}, {"zn-potentiometer", "wokwi-potentiometer"},
      {"zn-slide-potentiometer", "wokwi-slide-potentiometer"}, {"zn-buzzer", "wokwi-buzzer"}, {"zn-resistor", "wokwi-resistor"}, {"zn-ws2812", "wokwi-neopixel"},
      {"zn-ws2812-strip", "wokwi-led-ring"}, {"zn-ws2812-matrix", "wokwi-neopixel-matrix"}, {"zn-ssd1306", "wokwi-ssd1306"}, {"zn-st7789", "wokwi-ili9341"}, {"zn-qmi8658", ""},
      {"zn-cst820", ""}, {"zn-dht22", "wokwi-dht22"}, {"zn-mpu6050", "wokwi-mpu6050"}, {"zn-servo", "wokwi-servo"}, {"zn-sd-card", "wokwi-microsd-card"},
      {"zn-rotary-encoder", "wokwi-ky-040"}, {"zn-7segment", "wokwi-7segment"}, {"zn-hc-sr04", "wokwi-hc-sr04"},
      {"zn-esp32-devkit", "board-esp32-devkit-c-v4"}, {"zn-esp32s3-devkit", "board-esp32-s3-devkitc-1"}, {"zn-arduino-uno", "wokwi-arduino-uno"}, {"zn-arduino-nano", "wokwi-arduino-nano"},
      {"zn-pi-pico", "wokwi-pi-pico"}, {"zn-breadboard", "wokwi-breadboard"}};
  return t;
}
}  // namespace

std::string canonicalPartType(const std::string& type) {
  if (types().count(type)) return type;
  for (const auto& [zn, alias] : types()) if (!alias.empty() && alias == type) return zn;
  return "";
}
bool knownPartType(const std::string& type) { return !canonicalPartType(type).empty(); }
}  // namespace zn::sim
