// Uses Linux UAPI headers and intercepted syscalls: no device is opened.
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <cassert>
#include <cstring>
#include <cstdarg>
#include <cstdint>
#include <linux/i2c-dev.h>
#include <linux/i2c.h>
#include <linux/spi/spidev.h>
static unsigned long capabilities;
static int nextFd, closes, transactions, rdwrResult = 2, smbusResult;
static uint8_t modeSet;
static uint32_t speedExpected;
static uint8_t modeExpected;
static int fakeOpen(const char*, int, ...) { return nextFd++; }
static int fakeClose(int) { closes++; return 0; }
static ssize_t fakeWrite(int, const void*, size_t n) { transactions++; return (ssize_t)n; }
static int fakeIoctl(int, unsigned long request, ...) {
  va_list args; va_start(args, request);
  if (request == I2C_SLAVE) { assert(va_arg(args, int) == 107); }
  else {
    void* arg = va_arg(args, void*);
    if (request == I2C_FUNCS) *(unsigned long*)arg = capabilities;
    else if (request == I2C_RDWR) {
      transactions++;
      auto* a = (i2c_rdwr_ioctl_data*)arg; assert(a->nmsgs == 2);
      assert(a->msgs[0].addr == 107 && a->msgs[1].addr == 107);
      assert(a->msgs[0].flags == 0 && a->msgs[0].len == 1 && a->msgs[0].buf[0] == 3);
      assert(a->msgs[1].flags == I2C_M_RD && a->msgs[1].len == 2);
      memset(a->msgs[1].buf, 42, 2);
      va_end(args); return rdwrResult;
    } else if (request == I2C_SMBUS) {
      transactions++; auto* a = (i2c_smbus_ioctl_data*)arg;
      assert(a->command == 3);
      if (a->size == I2C_SMBUS_BYTE_DATA) {
        if (a->read_write == I2C_SMBUS_READ) a->data->byte = 22;
        else assert(a->data->byte == 22);
      } else {
        assert(a->size == I2C_SMBUS_I2C_BLOCK_DATA && a->data->block[0] == 2);
        if (a->read_write == I2C_SMBUS_READ) { a->data->block[1] = 17; a->data->block[2] = 18; }
        else assert(a->data->block[1] == 22 && a->data->block[2] == 23);
      }
      va_end(args); return smbusResult;
    } else if (request == SPI_IOC_MESSAGE(1)) {
      transactions++; auto* t = (spi_ioc_transfer*)arg;
      assert(t->len == 2 && t->tx_buf && !t->cs_change && !t->delay_usecs);
      assert(modeSet == modeExpected && t->speed_hz == speedExpected && t->bits_per_word == 8);
      if (t->rx_buf) memcpy((void*)(uintptr_t)t->rx_buf, (void*)(uintptr_t)t->tx_buf, 2);
      va_end(args); return 2;
    } else if (request == SPI_IOC_WR_MODE) modeSet = *(uint8_t*)arg;
    else if (request == SPI_IOC_WR_BITS_PER_WORD) assert(*(uint8_t*)arg == 8);
    else assert(request == SPI_IOC_WR_MAX_SPEED_HZ);
  }
  va_end(args); return 0;
}
#define __linux__ 1
#define open fakeOpen
#define close fakeClose
#define write fakeWrite
#define ioctl fakeIoctl
#include "hw.h"
#undef open
#undef close
#undef write
#undef ioctl
int main() {
  capabilities = I2C_FUNC_I2C; nextFd = 0;
  auto* a = zn_i2c_open("ignored", 107, -1, -1, 1); assert(a && a->fd == 0);
  auto* b = zn_i2c_open("ignored", 107, -1, -1, 1); assert(b && b != a && b->fd == 1);
  uint8_t tx[] = {3,22,23}, out[33];
  assert(zn_i2c_read_reg(a, 3, out, 2) && out[1] == 42);
  rdwrResult = 1; int before = transactions;
  assert(!zn_i2c_read_reg(a, 3, out, 2) && transactions == before + 1); // Never fall back after a transaction.
  zn_i2c_close(a); zn_i2c_close(a); zn_i2c_close(b); assert(closes == 2);
  capabilities = I2C_FUNC_SMBUS_READ_BYTE_DATA | I2C_FUNC_SMBUS_WRITE_BYTE_DATA | I2C_FUNC_SMBUS_READ_I2C_BLOCK | I2C_FUNC_SMBUS_WRITE_I2C_BLOCK;
  a = zn_i2c_open("ignored", 107, -1, -1, 1); assert(a);
  assert(zn_i2c_read_reg(a, 3, out, 1) && out[0] == 22);
  assert(zn_i2c_write(a, tx, 2)); assert(zn_i2c_write(a, tx, 3));
  assert(zn_i2c_read_reg(a, 3, out, 2) && out[0] == 17 && out[1] == 18);
  before = transactions; assert(!zn_i2c_read_reg(a, 3, out, 33) && transactions == before);
  smbusResult = -1; assert(!zn_i2c_read_reg(a, 3, out, 1)); zn_i2c_close(a);
  nextFd = 0; auto* x = zn_spi_open("ignored", 1000000, 3); auto* y = zn_spi_open("ignored", 1, 0);
  assert(x && y && x != y && x->fd == 0 && y->fd == 1);
  speedExpected = 1000000; modeExpected = 3;
  assert(zn_spi_transfer(x, tx, out, 2) && out[1] == 22);
  speedExpected = 1; modeExpected = 0; assert(zn_spi_write(y, tx, 2));
  speedExpected = 1000000; modeExpected = 3; assert(zn_spi_write(x, tx, 2));
  zn_spi_close(x); zn_spi_close(x); zn_spi_close(y); assert(closes == 5);
}
