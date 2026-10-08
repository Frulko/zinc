// DHT22 / AM2302 single-wire sensor (ZN-297): the host pulls the line low for at least 1 ms (spec: >= 800 us) and releases it; the sensor answers with 80 us low, 80 us high, then 40 bits, each
// 50 us low followed by 26 us high (0) or 70 us high (1): humidity x10 (16 bits), temperature x10 (sign bit + 15 bits), checksum (sum of the four bytes). `respond` turns the start pulse into the
// list of pulses the sensor puts on the line; a start pulse that is too short, or two reads less than 2 s apart, are reported (the sensor needs 2 s between samples).
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace zn::sim {

struct Dht22 {
  double humidity = 50.0, temperature = 21.5;   // % and deg C, set-control "humidity" and "temperature"
  std::vector<std::string> errors;
  struct Pulse { int level; std::uint64_t ns; };   // the sensor's line: a level held for ns
  std::uint64_t lastRead = 0; bool read_once = false;

  bool control(const std::string& name, double v) {
    if (name == "humidity") { humidity = v < 0 ? 0 : v > 100 ? 100 : v; return true; }
    if (name == "temperature") { temperature = v < -40 ? -40 : v > 80 ? 80 : v; return true; }
    return false;
  }
  // lowNs: how long the host held the line low; now: the time the start pulse ended. Empty when the pulse was too short for the sensor to wake.
  std::vector<Pulse> respond(std::uint64_t lowNs, std::uint64_t now) {
    std::vector<Pulse> p;
    if (lowNs < 800'000) { errors.push_back("start pulse of " + std::to_string(lowNs / 1000) + " us is shorter than 800 us: the sensor does not answer"); return p; }
    if (read_once && now - lastRead < 2'000'000'000ull) errors.push_back("read " + std::to_string((now - lastRead) / 1'000'000) + " ms after the last one: the DHT22 needs 2 s");
    read_once = true; lastRead = now;
    const int h = (int)(humidity * 10 + 0.5), t = (int)((temperature < 0 ? -temperature : temperature) * 10 + 0.5);
    const std::uint8_t b[5] = {(std::uint8_t)(h >> 8), (std::uint8_t)h, (std::uint8_t)(((t >> 8) & 0x7F) | (temperature < 0 ? 0x80 : 0)), (std::uint8_t)t, 0};
    std::uint8_t sum = (std::uint8_t)(b[0] + b[1] + b[2] + b[3]);
    p.push_back({0, 80'000}); p.push_back({1, 80'000});
    for (int i = 0; i < 40; i++) {
      const std::uint8_t byte = i / 8 == 4 ? sum : b[i / 8];
      const bool bit = (byte >> (7 - i % 8)) & 1;
      p.push_back({0, 50'000}); p.push_back({1, bit ? 70'000ull : 26'000ull});
    }
    p.push_back({0, 50'000});   // the end of the last bit
    return p;
  }
  // What a driver does with the pulses: the 40 bits as bytes (a bit is 1 when the high lasts more than 50 us). false when the checksum is wrong.
  static bool decode(const std::vector<Pulse>& p, double& hum, double& temp) {
    std::vector<int> bits;
    for (std::size_t i = 2; i + 1 < p.size(); i += 2) if (p[i].level == 0 && p[i + 1].level == 1) bits.push_back(p[i + 1].ns > 50'000 ? 1 : 0);
    if (bits.size() != 40) return false;
    std::uint8_t b[5] = {};
    for (int i = 0; i < 40; i++) b[i / 8] = (std::uint8_t)((b[i / 8] << 1) | bits[i]);
    if ((std::uint8_t)(b[0] + b[1] + b[2] + b[3]) != b[4]) return false;
    hum = ((b[0] << 8) | b[1]) / 10.0; temp = (((b[2] & 0x7F) << 8) | b[3]) / 10.0 * ((b[2] & 0x80) ? -1 : 1);
    return true;
  }
};

}  // namespace zn::sim
