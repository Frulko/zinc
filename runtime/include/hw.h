// Zinc hardware bus shim (ZN-126): the I2C and SPI calls of the display and sensor drivers, one API, three back ends:
//   ESP_PLATFORM          ESP-IDF i2c_master (buses are shared per SDA/SCL pair), SPI is not offered (the LCD and LED drivers use esp_lcd and RMT);
//   __linux__             i2c-dev (`bus` is "/dev/i2c-1") and spidev;
//   everything else, or -DZN_HW_SIM: the simulator, where a chip model attached with zn_hw_sim_attach_i2c / _spi answers the calls.
// Header-only (static inline), included by the plugin's own source like hal.h. Every call returns 1 on success and 0 on failure; open returns null when
// there is no device, which is how a driver finds out it has to disable itself.
#pragma once
#include <stddef.h>
#include <stdint.h>

#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
#include "driver/i2c_master.h"
#define ZN_HW_BACKEND "esp32"
#elif defined(__linux__) && !defined(ZN_HW_SIM)
#include <fcntl.h>
#include <linux/i2c-dev.h>
#include <linux/spi/spidev.h>
#include <sys/ioctl.h>
#include <unistd.h>
#define ZN_HW_BACKEND "linux"
#else
#define ZN_HW_BACKEND "sim"
#endif

/** A simulated chip: `write` takes the bytes the driver sends, `read` answers a register read (register, count). */
struct zn_hw_model {
  int (*write)(void* user, const uint8_t* data, int n);
  int (*read)(void* user, uint8_t reg, uint8_t* out, int n);
  void* user;
};

struct zn_i2c { int fd; int addr; const zn_hw_model* model; void* esp_dev; };
struct zn_spi { int fd; const zn_hw_model* model; };

/** The model that answers I2C address `addr` (or the SPI device) in the simulator back end; it must outlive the driver. */
static inline const zn_hw_model*& zn_hw_sim_slot(int kind, int addr) {
  static const zn_hw_model* slots[2][128];
  return slots[kind][addr & 127];
}
static inline void zn_hw_sim_attach_i2c(int addr, const zn_hw_model* m) { zn_hw_sim_slot(0, addr) = m; }
static inline void zn_hw_sim_attach_spi(const zn_hw_model* m) { zn_hw_sim_slot(1, 0) = m; }

// ---------------------------------------------------------------- I2C
/** Opens the device at 7-bit `addr`. `bus` is the Linux device path; `sda`, `scl` and `hz` are the ESP32's pins and clock. Null: no such device. */
static inline zn_i2c* zn_i2c_open(const char* bus, int addr, int sda, int scl, int hz) {
  (void)bus; (void)sda; (void)scl; (void)hz;
  static zn_i2c pool[8];
  zn_i2c* d = nullptr;
  for (zn_i2c& p : pool) if (p.fd == 0 && !p.model && !p.esp_dev) { d = &p; break; }
  if (!d) return nullptr;
#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  static i2c_master_bus_handle_t buses[4];
  static int bus_pins[4][2], nbus;
  i2c_master_bus_handle_t b = nullptr;
  for (int i = 0; i < nbus; i++) if (bus_pins[i][0] == sda && bus_pins[i][1] == scl) b = buses[i];
  if (!b) {
    if (nbus == 4) return nullptr;
    i2c_master_bus_config_t bc = {};
    bc.i2c_port = -1; bc.sda_io_num = (gpio_num_t)sda; bc.scl_io_num = (gpio_num_t)scl;
    bc.clk_source = I2C_CLK_SRC_DEFAULT; bc.glitch_ignore_cnt = 7; bc.flags.enable_internal_pullup = 1;
    if (i2c_new_master_bus(&bc, &b) != ESP_OK) return nullptr;
    buses[nbus] = b; bus_pins[nbus][0] = sda; bus_pins[nbus][1] = scl; nbus++;
  }
  if (i2c_master_probe(b, addr, 50) != ESP_OK) return nullptr;
  i2c_device_config_t dc = {};
  dc.dev_addr_length = I2C_ADDR_BIT_LEN_7; dc.device_address = addr; dc.scl_speed_hz = hz;
  i2c_master_dev_handle_t h;
  if (i2c_master_bus_add_device(b, &dc, &h) != ESP_OK) return nullptr;
  d->esp_dev = h;
#elif defined(__linux__) && !defined(ZN_HW_SIM)
  int fd = open(bus, O_RDWR);
  if (fd < 0) return nullptr;
  if (ioctl(fd, I2C_SLAVE, addr) < 0) { close(fd); return nullptr; }
  d->fd = fd;
#else
  const zn_hw_model* m = zn_hw_sim_slot(0, addr);
  if (!m) return nullptr;
  d->model = m;
#endif
  d->addr = addr;
  return d;
}
/** One write transaction of `n` bytes (the first is usually a register or control byte). */
static inline int zn_i2c_write(zn_i2c* d, const uint8_t* p, int n) {
  if (!d) return 0;
#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return i2c_master_transmit((i2c_master_dev_handle_t)d->esp_dev, p, n, 100) == ESP_OK;
#elif defined(__linux__) && !defined(ZN_HW_SIM)
  return write(d->fd, p, n) == n;
#else
  return d->model && d->model->write && d->model->write(d->model->user, p, n);
#endif
}
/** Writes `reg`, then reads `n` bytes (a repeated start on the ESP32). */
static inline int zn_i2c_read_reg(zn_i2c* d, uint8_t reg, uint8_t* out, int n) {
  if (!d) return 0;
#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return i2c_master_transmit_receive((i2c_master_dev_handle_t)d->esp_dev, &reg, 1, out, n, 50) == ESP_OK;
#elif defined(__linux__) && !defined(ZN_HW_SIM)
  return write(d->fd, &reg, 1) == 1 && read(d->fd, out, n) == n;
#else
  return d->model && d->model->read && d->model->read(d->model->user, reg, out, n);
#endif
}
static inline void zn_i2c_close(zn_i2c* d) {
  if (!d) return;
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  if (d->fd > 0) close(d->fd);
#endif
  *d = zn_i2c{};
}

// ---------------------------------------------------------------- SPI (Linux spidev and the simulator)
static inline zn_spi* zn_spi_open(const char* dev, int hz, int mode) {
  (void)dev; (void)hz; (void)mode;
  static zn_spi s;
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  uint32_t speed = (uint32_t)hz; uint8_t m = (uint8_t)mode;
  int fd = open(dev, O_WRONLY);
  if (fd < 0) return nullptr;
  if (ioctl(fd, SPI_IOC_WR_MODE, &m) < 0 || ioctl(fd, SPI_IOC_WR_MAX_SPEED_HZ, &speed) < 0) { close(fd); return nullptr; }
  s.fd = fd;
  return &s;
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return nullptr;
#else
  s.model = zn_hw_sim_slot(1, 0);
  return s.model ? &s : nullptr;
#endif
}
static inline int zn_spi_write(zn_spi* s, const uint8_t* p, int n) {
  if (!s) return 0;
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return write(s->fd, p, n) == n;
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  (void)p; (void)n;
  return 0;
#else
  return s->model && s->model->write && s->model->write(s->model->user, p, n);
#endif
}
static inline void zn_spi_close(zn_spi* s) {
  if (!s) return;
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  if (s->fd > 0) close(s->fd);
#endif
  *s = zn_spi{};
}
