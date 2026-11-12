// Zinc hardware bus shim (ZN-126): the I2C and SPI calls of the display and sensor drivers, one API, three back ends:
//   ESP_PLATFORM          ESP-IDF i2c_master (buses are shared per SDA/SCL pair), SPI is not offered (the LCD and LED drivers use esp_lcd and RMT);
//   __linux__             i2c-dev (`bus` is "/dev/i2c-1") and spidev;
//   everything else, or -DZN_HW_SIM: the simulator, where a chip model attached with zn_hw_sim_attach_i2c / _spi answers the calls.
// Header-only (static inline), included by the plugin's own source like hal.h. Bus calls return 1 on success and 0 on failure; open returns null when
// there is no device, which is how a driver finds out it has to disable itself. GPIO return conventions are documented below.
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

// ---------------------------------------------------------------- GPIO (Linux chardev v2, ESP-IDF, explicit simulator)
// GPIO ownership behind hw.h; callers serialize a line, and close it before destroying it.
#include <errno.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
#include "driver/gpio.h"
#include "esp_timer.h"
#include "esp_ipc.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#elif defined(__linux__) && !defined(ZN_HW_SIM)
#include <fcntl.h>
#include <linux/gpio.h>
#include <sys/ioctl.h>
#include <unistd.h>
#endif

enum class zn_gpio_state { closed, open, failed };
struct zn_gpio_config { int output = 0, bias = 0, drive = 0, edge = 0, initial = 0; uint32_t debounce_us = 0; };
struct zn_gpio_event { uint64_t timestamp_ns = 0; uint32_t sequence = 0; int value = 0; };
enum class zn_gpio_debounce_state { fresh, active };
enum class zn_gpio_irq_state { absent, detached, attached };
struct zn_gpio {
  zn_gpio_state state = zn_gpio_state::closed;
  zn_gpio_config config;
  zn_gpio_irq_state irq_state = zn_gpio_irq_state::absent;
  int fd = -1, offset = 0, value = 0;
  bool simulated = false;
  uint64_t last_ns = 0;
  zn_gpio_debounce_state debounce_state = zn_gpio_debounce_state::fresh;
  uint32_t sequence = 0;
  zn_gpio_event events[64]; unsigned first = 0, count = 0;
#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  QueueHandle_t queue = nullptr;
  portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
#endif
};
static inline bool zn_gpio_transition(zn_gpio& p, zn_gpio_state next) {
  if (p.state == next || (p.state == zn_gpio_state::closed && next != zn_gpio_state::open) || (p.state == zn_gpio_state::failed && next != zn_gpio_state::closed)) return false;
  p.state = next; return true;
}
static inline bool zn_gpio_irq_transition(zn_gpio& p, zn_gpio_irq_state next) {
  if ((p.irq_state == zn_gpio_irq_state::absent && next == zn_gpio_irq_state::detached) ||
      (p.irq_state == zn_gpio_irq_state::detached && (next == zn_gpio_irq_state::attached || next == zn_gpio_irq_state::absent)) ||
      (p.irq_state == zn_gpio_irq_state::attached && next == zn_gpio_irq_state::detached)) { p.irq_state = next; return true; }
  return false;
}
static inline void zn_gpio_debounce_reset(zn_gpio& p) { p.debounce_state = zn_gpio_debounce_state::fresh; p.last_ns = 0; }
static inline bool zn_gpio_debounce_accept(zn_gpio& p, uint64_t now_ns) {
  if (p.debounce_state == zn_gpio_debounce_state::active && now_ns - p.last_ns < (uint64_t)p.config.debounce_us * 1000) return false;
  p.debounce_state = zn_gpio_debounce_state::active; p.last_ns = now_ns; return true;
}
// CHIP aliases are local to the explicitly selected controller, never legacy global GPIO numbers.
static inline int zn_gpio_chip_line(const char* name) {
  if (!strncmp(name, "CHIP:CSID", 9) && name[9] >= '0' && name[9] <= '7' && !name[10]) return 132 + name[9] - '0';
  if (!strncmp(name, "CHIP:XIO-P", 10) && name[10] >= '0' && name[10] <= '7' && !name[11]) return name[10] - '0';
  return -1;
}
static inline bool zn_gpio_valid(const zn_gpio_config& c) {
  return (c.output == 0 || c.output == 1) && c.bias >= 0 && c.bias <= 3 && c.drive >= 0 && c.drive <= 2 &&
    c.edge >= 0 && c.edge <= 3 && c.initial >= 0 && c.initial <= 1 &&
    !(c.output && (c.edge || c.debounce_us)) && !(!c.output && c.drive) && (!c.debounce_us || c.edge);
}
static inline bool zn_gpio_pi_label(const char* label) {
  return !strcmp(label, "pinctrl-rp1") || !strcmp(label, "pinctrl-bcm2835") || !strcmp(label, "pinctrl-bcm2711");
}
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
static inline gpio_v2_line_config zn_gpio_linux_config(const zn_gpio_config& c) {
  gpio_v2_line_config out = {};
  out.flags = c.output ? GPIO_V2_LINE_FLAG_OUTPUT : GPIO_V2_LINE_FLAG_INPUT;
  const uint64_t bias[] = {0, GPIO_V2_LINE_FLAG_BIAS_DISABLED, GPIO_V2_LINE_FLAG_BIAS_PULL_UP, GPIO_V2_LINE_FLAG_BIAS_PULL_DOWN};
  out.flags |= bias[c.bias];
  if (c.drive == 1) out.flags |= GPIO_V2_LINE_FLAG_OPEN_DRAIN;
  if (c.drive == 2) out.flags |= GPIO_V2_LINE_FLAG_OPEN_SOURCE;
  if (c.edge & 1) out.flags |= GPIO_V2_LINE_FLAG_EDGE_RISING;
  if (c.edge & 2) out.flags |= GPIO_V2_LINE_FLAG_EDGE_FALLING;
  if (c.output) { auto& a = out.attrs[out.num_attrs++]; a.mask = 1; a.attr.id = GPIO_V2_LINE_ATTR_ID_OUTPUT_VALUES; a.attr.values = c.initial; }
  if (c.debounce_us) { auto& a = out.attrs[out.num_attrs++]; a.mask = 1; a.attr.id = GPIO_V2_LINE_ATTR_ID_DEBOUNCE; a.attr.debounce_period_us = c.debounce_us; }
  return out;
}
// Read-only discovery: a label/name must identify exactly one controller/line.
static inline int zn_gpio_find(const char* chip, int offset, const char* name, int* resolved) {
  int found = -1, failure = ENODEV;
  // shortcut: discovery checks 256 chip nodes; enumerate /dev if a platform uses higher indexes.
  for (int i = 0; i < 256; ++i) {
    char path[40]; snprintf(path, sizeof(path), "/dev/gpiochip%d", i);
    if (chip[0] == '/' && strcmp(chip, path)) continue;
    int fd = open(path, O_RDONLY | O_CLOEXEC);
    if (fd < 0) { if (errno == EACCES) failure = errno; continue; }
    gpiochip_info info = {};
    if (ioctl(fd, GPIO_GET_CHIPINFO_IOCTL, &info) < 0) { failure = errno; close(fd); continue; }
    bool matches = chip[0] == '/' || (chip[0] ? !strcmp(chip, info.label) : zn_gpio_pi_label(info.label));
    if (!matches) { close(fd); continue; }
    int line = offset;
    if (name && *name) {
      line = -1;
      for (unsigned j = 0; j < info.lines; ++j) {
        gpio_v2_line_info li = {}; li.offset = j;
        if (ioctl(fd, GPIO_V2_GET_LINEINFO_IOCTL, &li) < 0) { failure = errno; close(fd); if (found >= 0) close(found); errno = failure; return -1; }
        if (!strcmp(name, li.name)) { if (line >= 0) { close(fd); if (found >= 0) close(found); errno = EEXIST; return -1; } line = (int)j; }
      }
    }
    if (line < 0 || (unsigned)line >= info.lines) { close(fd); continue; }
    if (found >= 0) { close(found); close(fd); errno = EEXIST; return -1; }
    found = fd; *resolved = line;
  }
  if (found < 0) errno = failure;
  return found;
}
#endif
#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
static inline void zn_gpio_ipc_barrier(void*) {}
static inline int zn_gpio_quiesce(zn_gpio* p) {
  gpio_intr_disable((gpio_num_t)p->offset);
  if (p->irq_state != zn_gpio_irq_state::attached) return 1;
  // IRQ callbacks do not take the driver's removal lock. Wait on every CPU before removing/reusing their context.
#if defined(CONFIG_ESP_IPC_ENABLE)
  for (unsigned core = 0; core < portNUM_PROCESSORS; ++core) {
    if (esp_ipc_call_blocking(core, zn_gpio_ipc_barrier, nullptr) != ESP_OK) { zn_gpio_transition(*p, zn_gpio_state::failed); errno = EIO; return 0; }
  }
#elif !defined(CONFIG_FREERTOS_UNICORE)
  zn_gpio_transition(*p, zn_gpio_state::failed); errno = ENOTSUP; return 0;
#endif
  if (gpio_isr_handler_remove((gpio_num_t)p->offset) != ESP_OK) { zn_gpio_transition(*p, zn_gpio_state::failed); errno = EIO; return 0; }
  zn_gpio_irq_transition(*p, zn_gpio_irq_state::detached); return 1;
}
static inline void zn_gpio_isr(void* user) {
  auto* p = static_cast<zn_gpio*>(user);
  zn_gpio_event event; event.timestamp_ns = (uint64_t)esp_timer_get_time() * 1000; event.value = gpio_get_level((gpio_num_t)p->offset);
  // Queue access is ISR-safe; the VM is entered only by the polling caller.
  portENTER_CRITICAL_ISR(&p->mux);
  if (p->queue) xQueueSendFromISR(p->queue, &event, nullptr);
  portEXIT_CRITICAL_ISR(&p->mux);
}
#endif
static inline int zn_gpio_configure(zn_gpio* p, const zn_gpio_config& c);
static inline int zn_gpio_close(zn_gpio* p);
static inline int zn_gpio_open(zn_gpio* p, const char* chip, int offset, const char* name, const zn_gpio_config& c) {
  if (!p || p->state != zn_gpio_state::closed || !chip || offset < 0 || !zn_gpio_valid(c)) { errno = EINVAL; return 0; }
  if (!strcmp(chip, "sim")) {
    p->simulated = true; p->offset = offset; p->value = c.output ? c.initial : c.bias == 2; p->config = c;
    zn_gpio_transition(*p, zn_gpio_state::open); return 1;
  }
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  int line = 0, fd = zn_gpio_find(chip, offset, name, &line);
  if (fd < 0) return 0;
  gpio_v2_line_request request = {}; request.offsets[0] = line; request.num_lines = 1;
  memcpy(request.consumer, "zinc", 5); request.config = zn_gpio_linux_config(c); request.event_buffer_size = 64;
  int ok = ioctl(fd, GPIO_V2_GET_LINE_IOCTL, &request); int error = errno; close(fd);
  if (ok < 0) { errno = error; return 0; }
  int flags = fcntl(request.fd, F_GETFL);
  if (flags < 0 || fcntl(request.fd, F_SETFL, flags | O_NONBLOCK) < 0 || fcntl(request.fd, F_SETFD, FD_CLOEXEC) < 0) { error = errno; close(request.fd); errno = error; return 0; }
  p->fd = request.fd; p->offset = line;
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  (void)name;
  if (!GPIO_IS_VALID_GPIO(offset) || (c.output && !GPIO_IS_VALID_OUTPUT_GPIO(offset)) || c.drive == 2 || (name && *name) || (*chip && strcmp(chip, "esp32"))) { errno = ENOTSUP; return 0; }
  p->offset = offset; zn_gpio_transition(*p, zn_gpio_state::open);
  if (!zn_gpio_configure(p, c)) { int error = errno; zn_gpio_close(p); errno = error; return 0; }
  return 1;
#else
  (void)name; errno = ENOTSUP; return 0;
#endif
  p->config = c; zn_gpio_transition(*p, zn_gpio_state::open);
  return 1;
}
static inline int zn_gpio_read(zn_gpio* p) {
  if (!p || p->state != zn_gpio_state::open) { errno = EBADF; return -1; }
  if (p->simulated) return p->value;
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  gpio_v2_line_values values = {}; values.mask = 1;
  if (ioctl(p->fd, GPIO_V2_LINE_GET_VALUES_IOCTL, &values) < 0) return -1;
  return (int)(values.bits & 1);
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return gpio_get_level((gpio_num_t)p->offset);
#else
  return -1;
#endif
}
static inline int zn_gpio_write(zn_gpio* p, int value) {
  if (!p || p->state != zn_gpio_state::open || !p->config.output || value < 0 || value > 1) { errno = EINVAL; return 0; }
  if (p->simulated) { p->value = value; return 1; }
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  gpio_v2_line_values values = {}; values.mask = 1; values.bits = value;
  return ioctl(p->fd, GPIO_V2_LINE_SET_VALUES_IOCTL, &values) == 0;
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  return gpio_set_level((gpio_num_t)p->offset, value) == ESP_OK;
#else
  return 0;
#endif
}
// 1 event, 0 empty, -1 error. Each caller drains at most one bounded batch per tick.
static inline int zn_gpio_next(zn_gpio* p, zn_gpio_event* event) {
  if (!p || p->state != zn_gpio_state::open || !event) { errno = EBADF; return -1; }
  if (p->simulated) { if (!p->count) return 0; *event = p->events[p->first]; p->first = (p->first + 1) % 64; --p->count; return 1; }
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  gpio_v2_line_event e = {};
  ssize_t n = -1;
  for (int retry = 0; retry < 8; ++retry) { n = read(p->fd, &e, sizeof(e)); if (n >= 0 || errno != EINTR) break; }
  if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return 0;
  if (n != sizeof(e) || e.offset != (uint32_t)p->offset || (e.id != GPIO_V2_LINE_EVENT_RISING_EDGE && e.id != GPIO_V2_LINE_EVENT_FALLING_EDGE)) { if (n >= 0) errno = EIO; return -1; }
  event->timestamp_ns = e.timestamp_ns; event->sequence = e.seqno; event->value = e.id == GPIO_V2_LINE_EVENT_RISING_EDGE; return 1;
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  if (!p->queue || xQueueReceive(p->queue, event, 0) != pdTRUE) return 0;
  event->sequence = ++p->sequence; return 1;
#else
  return 0;
#endif
}
static inline int zn_gpio_configure(zn_gpio* p, const zn_gpio_config& c) {
  if (!p || p->state != zn_gpio_state::open || !zn_gpio_valid(c)) { errno = EINVAL; return 0; }
  if (!p->simulated) {
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
    auto config = zn_gpio_linux_config(c);
    if (ioctl(p->fd, GPIO_V2_LINE_SET_CONFIG_IOCTL, &config) < 0) return 0;
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
    if (!GPIO_IS_VALID_GPIO(p->offset) || (c.output && !GPIO_IS_VALID_OUTPUT_GPIO(p->offset)) || c.drive == 2) { errno = ENOTSUP; return 0; }
    if (!zn_gpio_quiesce(p)) return 0;
    gpio_mode_t mode = c.output ? (c.drive ? GPIO_MODE_INPUT_OUTPUT_OD : GPIO_MODE_INPUT_OUTPUT) : GPIO_MODE_INPUT;
    esp_err_t result = c.output ? gpio_set_level((gpio_num_t)p->offset, c.initial) : ESP_OK;
    if (result == ESP_OK) result = gpio_set_direction((gpio_num_t)p->offset, mode);
    if (result == ESP_OK && c.bias) result = gpio_set_pull_mode((gpio_num_t)p->offset, c.bias == 2 ? GPIO_PULLUP_ONLY : c.bias == 3 ? GPIO_PULLDOWN_ONLY : GPIO_FLOATING);
    if (result == ESP_OK && c.edge) {
      if (!p->queue) {
        QueueHandle_t queue = xQueueCreate(64, sizeof(zn_gpio_event));
        portENTER_CRITICAL(&p->mux); p->queue = queue; portEXIT_CRITICAL(&p->mux);
        if (queue) zn_gpio_irq_transition(*p, zn_gpio_irq_state::detached);
      }
      esp_err_t installed = gpio_install_isr_service(0);
      if (!p->queue || (installed != ESP_OK && installed != ESP_ERR_INVALID_STATE)) result = ESP_FAIL;
      if (result == ESP_OK) result = gpio_set_intr_type((gpio_num_t)p->offset, GPIO_INTR_ANYEDGE);
      if (result == ESP_OK) { result = gpio_isr_handler_add((gpio_num_t)p->offset, zn_gpio_isr, p); if (result == ESP_OK) zn_gpio_irq_transition(*p, zn_gpio_irq_state::attached); }
      if (result == ESP_OK) result = gpio_intr_enable((gpio_num_t)p->offset);
    }
    if (result != ESP_OK) {
      zn_gpio_quiesce(p);
      zn_gpio_transition(*p, zn_gpio_state::failed); errno = EIO; return 0;
    }
#else
    errno = ENOTSUP; return 0;
#endif
  } else if (c.output || (c.bias && c.bias != p->config.bias)) p->value = c.output ? c.initial : c.bias == 2;
  p->config = c; return 1;
}
static inline int zn_gpio_simulate(zn_gpio* p, int value, uint64_t now_ns) {
  if (!p || p->state != zn_gpio_state::open || !p->simulated || p->config.output || value < 0 || value > 1) { errno = EINVAL; return 0; }
  int old = p->value; p->value = value;
  if (old == value || !(p->config.edge & (value ? 1 : 2))) return 1;
  if (!zn_gpio_debounce_accept(*p, now_ns)) return 1;
  zn_gpio_event event; event.timestamp_ns = now_ns; event.value = value; event.sequence = ++p->sequence;
  if (p->count == 64) { p->first = (p->first + 1) % 64; --p->count; }
  p->events[(p->first + p->count++) % 64] = event; return 1;
}
static inline int zn_gpio_close(zn_gpio* p) {
  if (!p || p->state == zn_gpio_state::closed) return 1;
#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  if (!p->simulated && !zn_gpio_quiesce(p)) return 0;
#endif
  if (!zn_gpio_transition(*p, zn_gpio_state::closed)) return 0;
  if (!p->simulated) {
#if defined(__linux__) && !defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
    if (p->fd >= 0) close(p->fd);
#elif defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
    portENTER_CRITICAL(&p->mux); QueueHandle_t queue = p->queue; p->queue = nullptr; portEXIT_CRITICAL(&p->mux);
    if (queue) { vQueueDelete(queue); zn_gpio_irq_transition(*p, zn_gpio_irq_state::absent); }
    gpio_reset_pin((gpio_num_t)p->offset);
#endif
  }
#if defined(ESP_PLATFORM) && !defined(ZN_HW_SIM)
  p->config = {}; p->fd = -1; p->offset = 0; p->value = 0; p->simulated = false;
  zn_gpio_debounce_reset(*p); p->sequence = 0; p->first = 0; p->count = 0;
#else
  *p = zn_gpio{};
#endif
  return 1;
}
