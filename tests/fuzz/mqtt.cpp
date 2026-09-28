// zinc:mqtt: packets from the broker (runtime/mod/mqtt.cpp, Conn::parse). The input is the byte stream after
// CONNECT; every PUBLISH is matched against a few subscriptions.
#include "fuzz.h"
#include "../../runtime/mod/mqtt.cpp"
using namespace zrt;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n > (1 << 16)) return 0;
  mqtt::Conn* k = new (alloc(sizeof(mqtt::Conn))) mqtt::Conn();
  k->on_connack = Promise<Unit>::make_pending().p;
  k->on_connack->handled = true;  // a refused CONNACK rejects it
  static const char* filters[] = {"#", "a/+/c", "a/b", "+"};
  for (const char* f : filters) {
    mqtt::Sub* s = new (alloc(sizeof(mqtt::Sub))) mqtt::Sub();
    s->filter = String::from(f, (uint32_t)strlen(f));
    s->cb = [](String t, String p) { (void)(t.bytes() + p.bytes()); };
    k->subs.push(s);
  }
  k->in.raw((const char*)d, (uint32_t)n);
  while (k->parse()) {}
  for (int32_t i = 0; i < k->subs.length(); i++) { k->subs.get(i)->~Sub(); mfree(k->subs.get(i)); }
  k->~Conn(); mfree(k);
  zfuzz::clear();
  return 0;
}
