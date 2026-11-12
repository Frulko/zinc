#define ZN_HW_SIM
#include "hw.h"
#include "../../src/sim/chips/qmi8658.h"
#include <cassert>
#include <cstring>
static int echo(void*, const uint8_t* a, uint8_t* b, int n) { memcpy(b, a, (size_t)n); return 1; }
int main() {
  zn::sim::Qmi8658 chip; auto model = chip.model(); zn_hw_sim_attach_i2c(107, &model);
  assert(!zn_i2c_open("sim", 128, -1, -1, 1));
  zn_i2c* buses[8];
  for (auto& b : buses) { b = zn_i2c_open("sim", 107, -1, -1, 1); assert(b); }
  assert(!zn_i2c_open("sim", 107, -1, -1, 1));
  uint8_t out[3], tx[] = {3, 22};
  assert(zn_i2c_write(buses[0], tx, 2)); assert(zn_i2c_read_reg(buses[1], 3, out, 1) && out[0] == 22);
  assert(!zn_i2c_read_reg(buses[0], 0, out, -1));
  assert(!zn_i2c_read_reg(buses[0], 255, out, 1));
  assert(!zn_i2c_read_reg(buses[0], 0x5f, out, 2));
  for (auto b : buses) { zn_i2c_close(b); zn_i2c_close(b); assert(!zn_i2c_write(b, tx, 2)); }
  auto b = zn_i2c_open("sim", 107, -1, -1, 1); assert(b); zn_i2c_close(b);
  zn_hw_model spiModel = {nullptr, nullptr, nullptr, echo}; zn_hw_sim_attach_spi(&spiModel);
  assert(!zn_spi_open("sim", 0, 0)); assert(!zn_spi_open("sim", 1, 4));
  zn_spi* devices[8]; for (auto& d : devices) { d = zn_spi_open("sim", 1, 0); assert(d); }
  assert(devices[0] != devices[1]); assert(!zn_spi_open("sim", 1, 0));
  assert(zn_spi_transfer(devices[1], tx, out, 2) && !memcmp(tx, out, 2));
  for (auto d : devices) { zn_spi_close(d); zn_spi_close(d); assert(!zn_spi_transfer(d, tx, out, 2)); }
  auto d = zn_spi_open("sim", 1, 0); assert(d); zn_spi_close(d);
  zn_hw_model writeOnly = {nullptr, nullptr, nullptr}; zn_hw_sim_attach_spi(&writeOnly);
  d = zn_spi_open("sim", 1, 0); assert(d && !zn_spi_transfer(d, tx, out, 2)); zn_spi_close(d);
}
