// The core firmware of an ESP32: reads the upload protocol (include/zn/devproto.h) from the UART and runs what it receives. At start-up it first runs
// the program `zinc export --target esp32` stored in the flash (ZN-326.02): at kAppFlash, "ZNAPP1\0\0", a little-endian length, then the bytes of an upload.
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <vector>

#include "driver/uart.h"
#include "esp_flash.h"
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
  constexpr std::uint32_t kAppFlash = 0x300000;   // past the 1 MB app partition of the single-app table, inside the 4 MB flash
  std::uint8_t head[12];
  if (esp_flash_read(nullptr, head, kAppFlash, sizeof head) == ESP_OK && !std::memcmp(head, "ZNAPP1\0\0", 8)) {
    const std::uint32_t n = head[8] | head[9] << 8 | head[10] << 16 | static_cast<std::uint32_t>(head[11]) << 24;
    if (n <= cfg.maxModule + 64) {
      std::vector<std::uint8_t> stream(n);
      if (esp_flash_read(nullptr, stream.data(), kAppFlash + sizeof head, n) == ESP_OK) core.feed(stream.data(), n);
    }
  }
  std::uint8_t buf[256];
  for (;;) {
    int n = uart_read_bytes(port, buf, sizeof buf, 20 / portTICK_PERIOD_MS);
    if (n > 0) core.feed(buf, static_cast<std::size_t>(n));
  }
}
