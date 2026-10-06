// The core firmware of an ESP32: reads the upload protocol (include/zn/devproto.h) from the UART and runs what it receives.
#include <cstdint>
#include <cstdio>

#include "driver/uart.h"
#include "esp_heap_caps.h"
#include "esp_system.h"
#include "dev/core.h"

extern "C" void app_main(void) {
  const uart_port_t port = UART_NUM_0;
  uart_driver_install(port, 1024, 1024, 0, nullptr, 0);
  zn::dev::CoreConfig cfg;
  cfg.stackSlots = 3000;   // 24 KB of registers
  cfg.maxDepth = 128;
  cfg.maxModule = 48 * 1024;
  cfg.freeHeap = [] { return static_cast<std::size_t>(esp_get_free_heap_size()); };
  zn::dev::Core core(cfg, [port](const char* p, std::size_t n) {
    uart_write_bytes(port, p, n);
    uart_wait_tx_done(port, 1000 / portTICK_PERIOD_MS);
  });
  core.announce();
  std::uint8_t buf[256];
  for (;;) {
    int n = uart_read_bytes(port, buf, sizeof buf, 20 / portTICK_PERIOD_MS);
    if (n > 0) core.feed(buf, static_cast<std::size_t>(n));
  }
}
