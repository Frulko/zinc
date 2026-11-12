#define ZN_HW_SIM
#include "hw.h"
#include <cassert>
int main() {
  zn_gpio p;
  assert(!zn_gpio_irq_transition(p, zn_gpio_irq_state::attached));
  assert(zn_gpio_irq_transition(p, zn_gpio_irq_state::detached) && zn_gpio_irq_transition(p, zn_gpio_irq_state::attached));
  assert(!zn_gpio_irq_transition(p, zn_gpio_irq_state::absent));
  assert(zn_gpio_irq_transition(p, zn_gpio_irq_state::detached) && zn_gpio_irq_transition(p, zn_gpio_irq_state::absent));
  zn_gpio_config c; c.bias = 2;
  assert(zn_gpio_open(&p, "sim", 27, "", c)); assert(!zn_gpio_open(&p, "sim", 27, "", c));
  assert(zn_gpio_read(&p) == 1); assert(!zn_gpio_write(&p, 0));
  c.edge = 3; c.debounce_us = 1000; assert(zn_gpio_configure(&p, c));
  assert(zn_gpio_simulate(&p, 0, 10000000)); assert(zn_gpio_simulate(&p, 1, 10000001));
  zn_gpio_event e; assert(zn_gpio_next(&p, &e) == 1 && e.value == 0 && e.timestamp_ns == 10000000 && e.sequence == 1);
  assert(zn_gpio_next(&p, &e) == 0);
  assert(zn_gpio_simulate(&p, 0, 12000000)); assert(zn_gpio_next(&p, &e) == 1 && e.value == 0 && e.sequence == 2);
  c.output = 1; assert(!zn_gpio_configure(&p, c) && p.config.output == 0);
  zn_gpio_close(&p); zn_gpio_close(&p); assert(zn_gpio_read(&p) == -1);
  c = {}; c.output = 1; c.initial = 1; assert(zn_gpio_open(&p, "sim", 17, "", c));
  assert(zn_gpio_read(&p) == 1 && zn_gpio_write(&p, 0) && zn_gpio_read(&p) == 0); zn_gpio_close(&p);
  c = {}; c.edge = 3; assert(zn_gpio_open(&p, "sim", 27, "", c));
  for (int i = 0; i < 100; ++i) assert(zn_gpio_simulate(&p, (i + 1) & 1, 10000000 + i));
  assert(p.count == 64 && zn_gpio_next(&p, &e) == 1 && e.sequence == 37);
  zn_gpio_close(&p);
  c = {}; c.edge = 3; c.debounce_us = 1000; assert(zn_gpio_open(&p, "sim", 0, "", c));
  assert(zn_gpio_simulate(&p, 1, 0) && zn_gpio_simulate(&p, 0, 1));
  assert(zn_gpio_next(&p, &e) == 1 && e.timestamp_ns == 0 && zn_gpio_next(&p, &e) == 0); zn_gpio_close(&p);
  assert(zn_gpio_chip_line("CHIP:CSID0") == 132 && zn_gpio_chip_line("CHIP:XIO-P7") == 7 && zn_gpio_chip_line("CHIP:XIO-P8") == -1);
  assert(zn_gpio_pi_label("pinctrl-rp1") && !zn_gpio_pi_label("unknown"));
}
