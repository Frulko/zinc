#pragma once
// MQTT 3.1.1 client for zinc:mqtt (ZN-086) on the libuv loop; results arrive as loop events (include/zn/loop.h, kinds 30 to 32).
#include <string>

namespace zn::mqtt {

// Starts connecting; returns the client's handle (>= 1), or -1 when the address does not resolve.
int open(const std::string& host, int port, const std::string& clientId);
// qos 0 or 1 (1 waits for nothing: the broker's PUBACK is read and dropped); no-ops once the client is closed or lost.
void publish(int handle, const std::string& topic, const std::string& payload, bool retain, int qos);
void subscribe(int handle, const std::string& filter);
void close(int handle);

}  // namespace zn::mqtt
