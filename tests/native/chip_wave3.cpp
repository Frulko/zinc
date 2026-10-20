// Chip models, wave 3 (ZN-297): MPU-6050, SD card (SPI), DHT22, servo, rotary encoder, buzzer, 7-segment, HC-SR04. Each is driven by a test driver that sends what the real libraries send
// (Adafruit MPU6050, the Arduino SD library, DHT.h, Servo.h, tone(), pulseIn() on an HC-SR04): the byte stream or pulse train is recorded, the model answers, a control changes the value the
// driver reads next, and a wrong register, command or timing is reported as an error.
#include <cmath>
#include "chip_common.h"
#include "sim/chips/buzzer.h"
#include "sim/chips/dht22.h"
#include "sim/chips/encoder.h"
#include "sim/chips/hcsr04.h"
#include "sim/chips/mpu6050.h"
#include "sim/chips/sdcard.h"
#include "sim/chips/servo.h"
#include "sim/chips/sevenseg.h"

using namespace zn::sim;
static bool near(double a, double b, double tol) { return std::fabs(a - b) <= tol; }

// ---- MPU-6050: the init and the sample burst of the Adafruit library over a tee that records the stream
static int mpu(const char* goldenDir) {
  Mpu6050 chip; Tee tee{chip.model(), {}}; zn_hw_model m = tee.model();
  uint8_t id = 0;
  CHECK(m.read(m.user, 0x75, &id, 1) && id == 0x68);                         // WHO_AM_I
  const uint8_t wake[] = {0x6B, 0x00}, gyro[] = {0x1B, 0x08}, acc[] = {0x1C, 0x10};   // PWR_MGMT_1 awake, gyro +-500 dps, accel +-8 g
  CHECK(m.write(m.user, wake, 2) && m.write(m.user, gyro, 2) && m.write(m.user, acc, 2));
  chip.accel[0] = 0.5f; chip.accel[1] = -1.25f; chip.accel[2] = 2.0f; chip.gyro[0] = 100; chip.gyro[1] = -250; chip.gyro[2] = 30; chip.temp = 31.0f;
  uint8_t b[14];
  CHECK(m.read(m.user, 0x3B, b, 14));
  auto be = [&](int i) { return (int16_t)((b[i] << 8) | b[i + 1]); };
  CHECK(near(be(0) / 4096.0, 0.5, 0.01) && near(be(2) / 4096.0, -1.25, 0.01) && near(be(4) / 4096.0, 2.0, 0.01));   // +-8 g: 4096 LSB/g
  CHECK(near(be(6) / 340.0 + 36.53, 31.0, 0.1));
  CHECK(near(be(8) / 65.5, 100, 0.5) && near(be(10) / 65.5, -250, 0.5) && near(be(12) / 65.5, 30, 0.5));   // +-500 dps: 65.5 LSB/dps
  CHECK(chip.errors.empty());
  CHECK(chip.control("ax", -1.5));                                            // set-control: the next read sees it
  CHECK(m.read(m.user, 0x3B, b, 14) && near(be(0) / 4096.0, -1.5, 0.01));
  CHECK(!chip.control("pressure", 1));
  std::string stream; for (const auto& w : tee.log) { for (uint8_t x : w) { char h[4]; snprintf(h, sizeof h, "%02x ", x); stream += h; } stream += "\n"; }
  CHECK(matchesGolden((std::string(goldenDir) + "/mpu6050.stream").c_str(), stream));
  // wrong drivers: a register the chip does not have is a bus error (the read fails), samples while asleep are reported
  uint8_t x;
  CHECK(!m.read(m.user, 0x30, &x, 1) && !chip.errors.empty());
  Mpu6050 cold; cold.read(0x3B, b, 14); CHECK(!cold.errors.empty());
  Mpu6050 w; const uint8_t bad[] = {0x75, 0x00}; w.write(bad, 2); CHECK(!w.errors.empty());
  return 0;
}

// ---- SD card: the init and block read/write of the Arduino SD library (SdFat-style), clocked byte by byte
static uint8_t r1(SdCard& c) { for (int i = 0; i < 8; i++) { uint8_t r = c.xfer(0xFF); if (r != 0xFF) return r; } return 0xFF; }
static void send(SdCard& c, uint8_t cmd, uint32_t arg, uint8_t crc) { c.xfer(0x40 | cmd); c.xfer(arg >> 24); c.xfer(arg >> 16); c.xfer(arg >> 8); c.xfer(arg); c.xfer(crc); }
static int sd(const char* goldenDir) {
  SdCard card(16);
  for (size_t i = 0; i < card.image.size(); i++) card.image[i] = (uint8_t)(i * 7 + i / 512);
  std::string log;
  auto note = [&](const char* s, int v) { char h[48]; snprintf(h, sizeof h, "%s %02x\n", s, v); log += h; };
  for (int i = 0; i < 10; i++) card.xfer(0xFF);                               // 80 clocks, CS high
  card.select(true);
  send(card, 0, 0, 0x95); int a = r1(card); note("CMD0", a); CHECK(a == 0x01);
  send(card, 8, 0x1AA, 0x87); a = r1(card); note("CMD8", a); CHECK(a == 0x01);
  uint8_t r7[4]; for (auto& x : r7) x = card.xfer(0xFF); CHECK(r7[2] == 0x01 && r7[3] == 0xAA);   // the echo of the voltage range and check pattern
  int tries = 0;
  do { send(card, 55, 0, 0x65); r1(card); send(card, 41, 0x40000000, 0x77); a = r1(card); ++tries; } while (a != 0 && tries < 10);
  note("ACMD41", a); CHECK(a == 0x00);
  send(card, 58, 0, 0xFD); a = r1(card); uint8_t ocr[4]; for (auto& x : ocr) x = card.xfer(0xFF); note("CMD58", ocr[0]); CHECK(a == 0 && (ocr[0] & 0x40));   // high capacity
  send(card, 17, 3, 0x55); a = r1(card); CHECK(a == 0x00);                    // read block 3
  uint8_t tok = 0xFF; for (int i = 0; i < 8 && tok == 0xFF; i++) tok = card.xfer(0xFF); note("token", tok); CHECK(tok == 0xFE);
  bool same = true; for (int i = 0; i < 512; i++) if (card.xfer(0xFF) != card.image[3 * 512 + i]) same = false; CHECK(same);
  card.xfer(0xFF); card.xfer(0xFF);                                           // CRC16
  send(card, 24, 5, 0x55); a = r1(card); CHECK(a == 0x00);                    // write block 5
  card.xfer(0xFF); card.xfer(0xFE); for (int i = 0; i < 512; i++) card.xfer((uint8_t)(255 - i % 256)); card.xfer(0xFF); card.xfer(0xFF);
  uint8_t resp = 0xFF; for (int i = 0; i < 8 && (resp & 0x1F) != 0x05; i++) resp = card.xfer(0xFF); note("data response", resp & 0x1F); CHECK((resp & 0x1F) == 0x05);
  CHECK(card.image[5 * 512] == 255 && card.image[5 * 512 + 1] == 254 && card.errors.empty());
  CHECK(matchesGolden((std::string(goldenDir) + "/sdcard.stream").c_str(), log));
  // wrong drivers: a command before CMD0, CMD0 without the 74 clocks, a block beyond the card, a read before ACMD41
  SdCard c2; c2.select(true); send(c2, 17, 0, 0); r1(c2); CHECK(!c2.errors.empty());
  SdCard c3; for (int i = 0; i < 3; i++) c3.xfer(0xFF); c3.select(true); send(c3, 0, 0, 0x95); r1(c3); CHECK(!c3.errors.empty());
  SdCard c4(2); for (int i = 0; i < 10; i++) c4.xfer(0xFF); c4.select(true); send(c4, 0, 0, 0x95); r1(c4); send(c4, 55, 0, 0); r1(c4); send(c4, 41, 0x40000000, 0); r1(c4);
  send(c4, 17, 9, 0); CHECK(r1(c4) == 0x40 && !c4.errors.empty());
  SdCard c5; for (int i = 0; i < 10; i++) c5.xfer(0xFF); c5.select(true); send(c5, 0, 0, 0x95); r1(c5); send(c5, 17, 0, 0); r1(c5); CHECK(!c5.errors.empty());
  return 0;
}

int main(int argc, char** argv) {
  const char* dir = argc > 1 ? argv[1] : "tests/golden/sim";
  if (int rc = mpu(dir)) return rc;
  if (int rc = sd(dir)) return rc;
  // ---- DHT22: the start pulse, the 40 bits decoded as DHT.h does, a changed control read after 2 s
  { Dht22 d; d.humidity = 61.3; d.temperature = -7.4;
    double h = 0, t = 0; auto p = d.respond(1'200'000, 5'000'000'000ull);
    CHECK(Dht22::decode(p, h, t) && near(h, 61.3, 0.05) && near(t, -7.4, 0.05) && d.errors.empty());
    CHECK(d.control("temperature", 23.9) && d.control("humidity", 40));
    p = d.respond(1'200'000, 8'000'000'000ull); CHECK(Dht22::decode(p, h, t) && near(h, 40, 0.05) && near(t, 23.9, 0.05) && d.errors.empty());
    CHECK(d.respond(300'000, 12'000'000'000ull).empty() && d.errors.size() == 1);             // a start pulse of 300 us
    d.respond(1'200'000, 8'500'000'000ull); CHECK(d.errors.size() == 2);                       // 500 ms after the last read
    p = d.respond(1'200'000, 20'000'000'000ull); p[10].ns += 0; p[5].ns = p[5].ns > 50'000 ? 26'000 : 70'000;   // a flipped bit breaks the checksum
    CHECK(!Dht22::decode(p, h, t)); }
  // ---- servo: Servo.h writes 544 us for 0 degrees and 2400 us for 180
  { Servo s; std::uint64_t t = 0;
    s.pulse(1'500'000, t); CHECK(near(s.angle, 90, 0.5));
    t += 20'000'000; s.pulse(544'000, t); CHECK(near(s.angle, 4.4, 0.6));
    t += 20'000'000; s.pulse(2'400'000, t); CHECK(near(s.angle, 171, 1.0) && s.errors.empty());
    t += 20'000'000; s.pulse(3'500'000, t); CHECK(s.errors.size() == 1 && near(s.angle, 171, 1.0));   // out of range: ignored, reported
    t += 5'000'000; s.pulse(1'500'000, t); CHECK(s.errors.size() == 2); }                              // 5 ms period
  // ---- encoder: the quadrature decoder of a library counts the detents set-control turned
  { Encoder e; CHECK(e.control("rotate", 3)); CHECK(Encoder::decode(e.trace) == 3);
    e.trace.clear(); CHECK(e.control("rotate", -2)); CHECK(Encoder::decode(e.trace, 1, 1) == -2 && e.position == 1);
    CHECK(e.control("press", 1) && e.sw == 0 && e.control("press", 0) && e.sw == 1 && !e.control("spin", 1)); }
  // ---- buzzer: tone(440) for 20 cycles, then silence
  { Buzzer b; std::uint64_t t = 0; const std::uint64_t half = 1'136'364;   // 440 Hz
    for (int i = 0; i < 20; i++) { b.edge(1, t); t += half; b.edge(0, t); t += half; }
    CHECK(near(b.frequency, 440, 1.0) && b.playing(t) && !b.playing(t + 200'000'000ull) && b.cycles == 19); }
  // ---- 7-segment: the digits of a font, common anode inverted, a pattern that is no character
  { SevenSegment s; const std::uint8_t font[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};
    for (int i = 0; i < 10; i++) { s.pins(font[i]); CHECK(s.digit() == '0' + i); }
    s.pins(0x77); CHECK(s.digit() == 'A'); s.pins(0x80 | 0x06); CHECK(s.digit() == '1' && s.dot());
    SevenSegment a; a.commonAnode = true; a.pins((std::uint8_t)~0x5B); CHECK(a.digit() == '2');
    CHECK(s.errors.empty()); s.pins(0x2A); CHECK(s.digit() == '?' && s.errors.size() == 1); }
  // ---- HC-SR04: pulseIn() on ECHO, 58 us per cm
  { HcSr04 h; auto cm = [&](HcSr04::Echo e) { return (double)(e.fallNs - e.riseNs) / 1000.0 / 58.0; };
    auto e = h.trigger(10'000, 1'000'000); CHECK(e.valid && near(cm(e), 100, 1.0));
    CHECK(h.control("distance", 12.5)); e = h.trigger(12'000, 100'000'000); CHECK(e.valid && near(cm(e), 12.5, 0.3) && e.riseNs == 100'500'000);
    CHECK(h.errors.empty()); h.trigger(4'000, 300'000'000); CHECK(h.errors.size() == 1);        // TRIG too short
    h.trigger(10'000, 300'005'000); CHECK(h.errors.size() == 1);                                // fine: the echo has ended
    h.control("distance", 600); e = h.trigger(10'000, 500'000'000); CHECK(!e.valid && e.fallNs - e.riseNs == 38'000'000ull); }
  printf("wave 3 models ok\n");
  return 0;
}
