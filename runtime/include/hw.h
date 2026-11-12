// Zinc hardware bus shim (ZN-126): the I2C and SPI calls of the display and sensor drivers, one API, three back ends:
//   ESP_PLATFORM          ESP-IDF i2c_master (buses are shared per SDA/SCL pair), SPI is not offered (the LCD and LED drivers use esp_lcd and RMT);
//   __linux__             i2c-dev (`bus` is "/dev/i2c-1") and spidev;
//   everything else, or -DZN_HW_SIM: the simulator, where a chip model attached with zn_hw_sim_attach_i2c / _spi answers the calls.
// Header-only (static inline), included by the plugin's own source like hal.h. Every call returns 1 on success and 0 on failure; open returns null when
// there is no device, which is how a driver finds out it has to disable itself.
#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
#include "driver/i2c_master.h"
#define ZN_HW_BACKEND "esp32"
#elif defined(__linux__) && !defined(ZN_HW_SIM)
#include <fcntl.h>
#include <linux/i2c-dev.h>
#include <linux/i2c.h>
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
  int (*transfer)(void* user, const uint8_t* tx, uint8_t* rx, int n) = nullptr;
};

enum class zn_hw_state { closed, open };
static inline bool zn_hw_transition(zn_hw_state& state, zn_hw_state next) {
  if (state == next) return false;
  state = next;
  return true;
}
struct zn_i2c { int fd = -1; int addr = 0; const zn_hw_model* model = nullptr; void* esp_dev = nullptr; unsigned long funcs = 0; zn_hw_state state = zn_hw_state::closed; };
struct zn_spi { int fd = -1; int hz = 0; uint8_t mode = 0; const zn_hw_model* model = nullptr; zn_hw_state state = zn_hw_state::closed; };

/** The model that answers I2C address `addr` (or the SPI device) in the simulator back end; it must outlive the driver. */
static inline const zn_hw_model*& zn_hw_sim_slot(int kind, int addr) {
  static const zn_hw_model* slots[2][128];
  return slots[kind][addr & 127];
}
static inline void zn_hw_sim_attach_i2c(int addr, const zn_hw_model* m) { zn_hw_sim_slot(0, addr) = m; }
static inline void zn_hw_sim_attach_spi(const zn_hw_model* m) { zn_hw_sim_slot(1, 0) = m; }

#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
static inline int zn_i2c_smbus(zn_i2c* d, uint8_t rw, uint8_t cmd, int size, union i2c_smbus_data* data) {
  i2c_smbus_ioctl_data args = {rw, cmd, (uint32_t)size, data};
  return ioctl(d->fd, I2C_SMBUS, &args) == 0;
}
#endif

// ---------------------------------------------------------------- I2C
/** Opens the device at 7-bit `addr`. `bus` is the Linux device path; `sda`, `scl` and `hz` are the ESP32's pins and clock. Null: no such device. */
static inline zn_i2c* zn_i2c_open(const char* bus, int addr, int sda, int scl, int hz) {
  (void)bus; (void)sda; (void)scl; (void)hz;
  if (addr < 0x08 || addr > 0x77 || hz <= 0) return nullptr;
  static zn_i2c pool[8];
  zn_i2c* d = nullptr;
  for (zn_i2c& p : pool) if (p.state == zn_hw_state::closed) { d = &p; break; }
  if (!d) return nullptr;
  if (bus && !strcmp(bus, "sim")) {
    d->model = zn_hw_sim_slot(0, addr);
    if (!d->model) return nullptr;
    d->addr = addr; zn_hw_transition(d->state, zn_hw_state::open); return d;
  }
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
  int fd = open(bus, O_RDWR | O_CLOEXEC);
  if (fd < 0) return nullptr;
  unsigned long funcs = 0;
  if (ioctl(fd, I2C_FUNCS, &funcs) < 0 || ioctl(fd, I2C_SLAVE, addr) < 0) { close(fd); return nullptr; }
  d->fd = fd; d->funcs = funcs;
#else
  const zn_hw_model* m = zn_hw_sim_slot(0, addr);
  if (!m) return nullptr;
  d->model = m;
#endif
  zn_hw_transition(d->state, zn_hw_state::open);
  d->addr = addr;
  return d;
}
/** One write transaction of `n` bytes (the first is usually a register or control byte). */
static inline int zn_i2c_write(zn_i2c* d, const uint8_t* p, int n) {
  if (!d || d->state != zn_hw_state::open || !p || n <= 0) return 0;
  if (d->model) return d->model->write && d->model->write(d->model->user, p, n);
#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return i2c_master_transmit((i2c_master_dev_handle_t)d->esp_dev, p, n, 100) == ESP_OK;
#elif defined(__linux__) && !defined(ZN_HW_SIM)
  if (d->funcs & I2C_FUNC_I2C) return write(d->fd, p, n) == n;
  union i2c_smbus_data data = {};
  if (n == 1 && (d->funcs & I2C_FUNC_SMBUS_WRITE_BYTE)) return zn_i2c_smbus(d, I2C_SMBUS_WRITE, p[0], I2C_SMBUS_BYTE, nullptr);
  if (n == 2 && (d->funcs & I2C_FUNC_SMBUS_WRITE_BYTE_DATA)) {
    data.byte = p[1]; return zn_i2c_smbus(d, I2C_SMBUS_WRITE, p[0], I2C_SMBUS_BYTE_DATA, &data);
  }
  if (n >= 2 && n <= 33 && (d->funcs & I2C_FUNC_SMBUS_WRITE_I2C_BLOCK)) {
    data.block[0] = (uint8_t)(n - 1);
    for (int i = 1; i < n; i++) data.block[i] = p[i];
    return zn_i2c_smbus(d, I2C_SMBUS_WRITE, p[0], I2C_SMBUS_I2C_BLOCK_DATA, &data);
  }
  return 0;
#else
  return d->model && d->model->write && d->model->write(d->model->user, p, n);
#endif
}
/** Writes `reg`, then reads `n` bytes (one repeated-start transaction). */
static inline int zn_i2c_read_reg(zn_i2c* d, uint8_t reg, uint8_t* out, int n) {
  if (!d || d->state != zn_hw_state::open || !out || n <= 0 || n > 65535) return 0;
  if (d->model) return d->model->read && d->model->read(d->model->user, reg, out, n);
#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return i2c_master_transmit_receive((i2c_master_dev_handle_t)d->esp_dev, &reg, 1, out, n, 50) == ESP_OK;
#elif defined(__linux__) && !defined(ZN_HW_SIM)
  if (d->funcs & I2C_FUNC_I2C) {
    i2c_msg msgs[2] = {{(uint16_t)d->addr, 0, 1, &reg}, {(uint16_t)d->addr, I2C_M_RD, (uint16_t)n, out}};
    i2c_rdwr_ioctl_data args = {msgs, 2};
    return ioctl(d->fd, I2C_RDWR, &args) == 2;
  }
  union i2c_smbus_data data = {};
  if (n == 1 && (d->funcs & I2C_FUNC_SMBUS_READ_BYTE_DATA)) {
    if (!zn_i2c_smbus(d, I2C_SMBUS_READ, reg, I2C_SMBUS_BYTE_DATA, &data)) return 0;
    out[0] = data.byte; return 1;
  }
  if (n <= 32 && (d->funcs & I2C_FUNC_SMBUS_READ_I2C_BLOCK)) {
    data.block[0] = (uint8_t)n;
    if (!zn_i2c_smbus(d, I2C_SMBUS_READ, reg, I2C_SMBUS_I2C_BLOCK_DATA, &data) || data.block[0] != n) return 0;
    for (int i = 0; i < n; i++) out[i] = data.block[i + 1];
    return 1;
  }
  return 0;
#else
  return d->model && d->model->read && d->model->read(d->model->user, reg, out, n);
#endif
}
static inline void zn_i2c_close(zn_i2c* d) {
  if (!d || !zn_hw_transition(d->state, zn_hw_state::closed)) return;
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  if (d->fd >= 0) close(d->fd);
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  if (d->esp_dev) i2c_master_bus_rm_device((i2c_master_dev_handle_t)d->esp_dev);
#endif
  *d = zn_i2c{};
}

// ---------------------------------------------------------------- SPI (Linux spidev and the simulator)
static inline zn_spi* zn_spi_open(const char* dev, int hz, int mode) {
  (void)dev; (void)hz; (void)mode;
  if (hz <= 0 || mode < 0 || mode > 3) return nullptr;
  static zn_spi pool[8];
  zn_spi* s = nullptr;
  for (zn_spi& p : pool) if (p.state == zn_hw_state::closed) { s = &p; break; }
  if (!s) return nullptr;
  s->hz = hz; s->mode = (uint8_t)mode;
  if (dev && !strcmp(dev, "sim")) {
    s->model = zn_hw_sim_slot(1, 0);
    if (!s->model) return nullptr;
    zn_hw_transition(s->state, zn_hw_state::open); return s;
  }
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  uint32_t speed = (uint32_t)hz; uint8_t m = (uint8_t)mode, bits = 8;
  int fd = open(dev, O_RDWR | O_CLOEXEC);
  if (fd < 0) return nullptr;
  if (ioctl(fd, SPI_IOC_WR_MODE, &m) < 0 || ioctl(fd, SPI_IOC_WR_BITS_PER_WORD, &bits) < 0 || ioctl(fd, SPI_IOC_WR_MAX_SPEED_HZ, &speed) < 0) { close(fd); return nullptr; }
  s->fd = fd;
  zn_hw_transition(s->state, zn_hw_state::open);
  return s;
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return nullptr;
#else
  s->model = zn_hw_sim_slot(1, 0);
  if (!s->model) return nullptr;
  zn_hw_transition(s->state, zn_hw_state::open);
  return s;
#endif
}
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
static inline int zn_spi_message(zn_spi* s, const uint8_t* tx, uint8_t* rx, int n) {
  // spidev settings are shared by opens of one node; restore this handle's mode.
  if (ioctl(s->fd, SPI_IOC_WR_MODE, &s->mode) < 0) return 0;
  spi_ioc_transfer t = {};
  t.tx_buf = (uintptr_t)tx; t.rx_buf = (uintptr_t)rx; t.len = (uint32_t)n;
  t.speed_hz = (uint32_t)s->hz; t.bits_per_word = 8;
  return ioctl(s->fd, SPI_IOC_MESSAGE(1), &t) == n;
}
#endif
static inline int zn_spi_write(zn_spi* s, const uint8_t* p, int n) {
  if (!s || s->state != zn_hw_state::open || !p || n <= 0) return 0;
  if (s->model) return s->model->write && s->model->write(s->model->user, p, n);
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return zn_spi_message(s, p, nullptr, n);
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  (void)p; (void)n;
  return 0;
#else
  return s->model && s->model->write && s->model->write(s->model->user, p, n);
#endif
}
static inline void zn_spi_close(zn_spi* s) {
  if (!s || !zn_hw_transition(s->state, zn_hw_state::closed)) return;
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  if (s->fd >= 0) close(s->fd);
#endif
  *s = zn_spi{};
}

/** Full duplex: both buffers belong to the same chip-select segment. Models without duplex support refuse it. */
static inline int zn_spi_transfer(zn_spi* s, const uint8_t* tx, uint8_t* rx, int n) {
  if (!s || s->state != zn_hw_state::open || !tx || !rx || n <= 0 || n > 65535) return 0;
  if (s->model) return s->model->transfer && s->model->transfer(s->model->user, tx, rx, n);
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return zn_spi_message(s, tx, rx, n);
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return 0;
#else
  return s->model && s->model->transfer && s->model->transfer(s->model->user, tx, rx, n);
#endif
}
