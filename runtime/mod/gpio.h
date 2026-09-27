// zinc:gpio — pins, edges, debounce. Hosts run a simulator (DEV-09); rpi1 uses libgpiod (ZRT_GPIOD).
#pragma once
namespace zrt { namespace gpio {
struct PinEdge : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE40;
  uint8_t pin = 0, value = 0;
  double timestampMs = 0;
  PinEdge() {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  void zrt_fields(StrBuilder& sb, bool& first) const override { json_field(sb, first, "pin", (int32_t)pin); json_field(sb, first, "value", (int32_t)value); json_field(sb, first, "timestampMs", timestampMs); }
  void zrt_json(StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }
};
void setup(uint8_t pin, const String& mode, const String& pull);
void write(uint8_t pin, uint8_t value);
uint8_t read(uint8_t pin);
void watch(uint8_t pin, const String& edge, uint16_t debounceMs, Fn<void(Ref<PinEdge>)> cb);
void simulate(uint8_t pin, uint8_t value);
}}
