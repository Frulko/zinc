// zinc:mqtt — MQTT 3.1.1 client, QoS 0, non-blocking TCP polled by the event loop.
#pragma once
namespace zrt { namespace mqtt {
struct Sub;
struct MqttClient : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE30;
  String host, clientId;
  int32_t port = 1883;
  MqttClient(String h, int32_t p, String id) : host(h), clientId(id), port(p) {}
  Promise<Unit> connect();
  void publish(const String& topic, const String& payload);
  void subscribe(const String& topic, Fn<void(String, String)> cb);
  void close();
  ~MqttClient() override;
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  void* impl = nullptr;
};
}}
