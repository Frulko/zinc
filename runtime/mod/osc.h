// zinc:osc — OSC 1.0 over UDP (send + listen).
#pragma once
namespace zrt { namespace osc {
struct OscMessage : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE10;
  String address;
  Array<double> numbers = Array<double>::with_cap(0);
  Array<String> strings = Array<String>::with_cap(0);
  OscMessage() {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  void zrt_fields(StrBuilder& sb, bool& first) const override { json_field(sb, first, "address", address); json_field(sb, first, "numbers", numbers); json_field(sb, first, "strings", strings); }
  void zrt_json(StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }
};
void send(const String& host, int32_t port, const String& address, const Array<double>& numbers, const Array<String>& strings = Array<String>());
void listen(int32_t port, Fn<void(Ref<OscMessage>)> cb);
void close();
}}
