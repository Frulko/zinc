// Real Linux v2 UAPI, intercepted system calls; no hardware or kernel gpio-sim claim.
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/gpio.h>
#include <cassert>
#include <cerrno>
#include <cstring>
#include <cstdarg>
#include <cstdint>
#include <initializer_list>
static int chipCloses, lineCloses, configs, writes, failRequest, failConfig, eventMode, reads;
static bool duplicate;
static gpio_v2_line_request requested;
static gpio_v2_line_config configured;
static int fakeOpen(const char* path, int flags, ...) {
  assert(flags == (O_RDONLY | O_CLOEXEC));
  if (!strcmp(path, "/dev/gpiochip7")) return 7;
  if (duplicate && !strcmp(path, "/dev/gpiochip9")) return 9;
  errno = ENOENT; return -1;
}
static int fakeClose(int fd) { if (fd == 101) lineCloses++; else { assert(fd == 7 || fd == 9); chipCloses++; } return 0; }
static int fakeFcntl(int fd, int command, ...) { assert(fd == 101); assert(command == F_GETFL || command == F_SETFL || command == F_SETFD); return 0; }
static ssize_t fakeRead(int fd, void* out, size_t size) {
  assert(fd == 101 && size == sizeof(gpio_v2_line_event)); reads++;
  if (eventMode == 1) { eventMode = 2; errno = EINTR; return -1; }
  if (eventMode == 2) {
    eventMode = 0; gpio_v2_line_event e = {}; e.offset = 17; e.id = GPIO_V2_LINE_EVENT_FALLING_EDGE; e.timestamp_ns = 123456789; e.seqno = 9;
    memcpy(out, &e, sizeof(e)); return sizeof(e);
  }
  if (eventMode == 3) return 1;
  errno = EAGAIN; return -1;
}
static int fakeIoctl(int fd, unsigned long op, ...) {
  va_list ap; va_start(ap, op); void* arg = va_arg(ap, void*); va_end(ap);
  if (op == GPIO_GET_CHIPINFO_IOCTL) { assert(fd == 7 || fd == 9); auto* p = (gpiochip_info*)arg; strcpy(p->label, "pinctrl-rp1"); p->lines = 54; }
  else if (op == GPIO_V2_GET_LINEINFO_IOCTL) { auto* p = (gpio_v2_line_info*)arg; if (p->offset == 17) strcpy(p->name, "GPIO17"); }
  else if (op == GPIO_V2_GET_LINE_IOCTL) {
    assert(fd == 7); requested = *(gpio_v2_line_request*)arg;
    if (failRequest) { errno = failRequest; return -1; }
    ((gpio_v2_line_request*)arg)->fd = 101;
  } else {
    assert(fd == 101);
    if (op == GPIO_V2_LINE_SET_CONFIG_IOCTL) { configs++; if (failConfig) { errno = failConfig; return -1; } configured = *(gpio_v2_line_config*)arg; }
    else if (op == GPIO_V2_LINE_SET_VALUES_IOCTL) { auto* p = (gpio_v2_line_values*)arg; assert(p->mask == 1 && p->bits == 0); writes++; }
    else if (op == GPIO_V2_LINE_GET_VALUES_IOCTL) { auto* p = (gpio_v2_line_values*)arg; assert(p->mask == 1); p->bits = 1; }
    else assert(false);
  }
  return 0;
}
#define __linux__ 1
#define open fakeOpen
#define close fakeClose
#define read fakeRead
#define fcntl fakeFcntl
#define ioctl fakeIoctl
#include "hw.h"
#undef open
#undef close
#undef read
#undef fcntl
#undef ioctl
int main() {
  zn_gpio p; zn_gpio_config c;
  auto keep = zn_gpio_linux_config(c); assert(!(keep.flags & (GPIO_V2_LINE_FLAG_BIAS_DISABLED | GPIO_V2_LINE_FLAG_BIAS_PULL_UP | GPIO_V2_LINE_FLAG_BIAS_PULL_DOWN)));
  c.output = 1; c.drive = 2; assert(zn_gpio_linux_config(c).flags & GPIO_V2_LINE_FLAG_OPEN_SOURCE);
  c = {}; c.output = 1; c.bias = 1; c.drive = 1; c.initial = 1;
  assert(zn_gpio_open(&p, "", 17, "", c));
  assert(chipCloses == 1 && lineCloses == 0 && requested.num_lines == 1 && requested.offsets[0] == 17 && !strcmp(requested.consumer, "zinc"));
  assert(requested.config.flags == (GPIO_V2_LINE_FLAG_OUTPUT | GPIO_V2_LINE_FLAG_BIAS_DISABLED | GPIO_V2_LINE_FLAG_OPEN_DRAIN));
  assert(requested.config.attrs[0].attr.id == GPIO_V2_LINE_ATTR_ID_OUTPUT_VALUES && requested.config.attrs[0].mask == 1 && requested.config.attrs[0].attr.values == 1);
  assert(zn_gpio_read(&p) == 1 && zn_gpio_write(&p, 0) && writes == 1);
  c = {}; c.edge = 3; c.bias = 2; c.debounce_us = 123000;
  failConfig = ENXIO; assert(!zn_gpio_configure(&p, c) && p.config.output == 1);
  failConfig = 0; assert(zn_gpio_configure(&p, c));
  assert(configured.flags == (GPIO_V2_LINE_FLAG_INPUT | GPIO_V2_LINE_FLAG_EDGE_RISING | GPIO_V2_LINE_FLAG_EDGE_FALLING | GPIO_V2_LINE_FLAG_BIAS_PULL_UP));
  assert(configured.attrs[0].attr.id == GPIO_V2_LINE_ATTR_ID_DEBOUNCE && configured.attrs[0].attr.debounce_period_us == 123000 && configured.attrs[0].mask == 1);
  zn_gpio_event e; eventMode = 1; assert(zn_gpio_next(&p, &e) == 1 && e.timestamp_ns == 123456789 && e.sequence == 9 && e.value == 0 && reads == 2);
  assert(zn_gpio_next(&p, &e) == 0); eventMode = 3; assert(zn_gpio_next(&p, &e) == -1); eventMode = 0;
  zn_gpio_close(&p); zn_gpio_close(&p); assert(lineCloses == 1);
  assert(zn_gpio_open(&p, "pinctrl-rp1", 0, "GPIO17", {})); assert(p.offset == 17); zn_gpio_close(&p);
  duplicate = true; assert(!zn_gpio_open(&p, "pinctrl-rp1", 17, "", {}) && errno == EEXIST); duplicate = false;
  for (int error : {EBUSY, ENXIO, EINVAL, ENOTTY}) { failRequest = error; assert(!zn_gpio_open(&p, "pinctrl-rp1", 17, "", {}) && errno == error); }
  assert(lineCloses == 2); // Failed requests never own or close a request fd.
}
