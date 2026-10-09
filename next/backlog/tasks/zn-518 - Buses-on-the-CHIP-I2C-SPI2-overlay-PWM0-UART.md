---
id: ZN-518
title: 'Buses on the CHIP: I2C, SPI2 overlay, PWM0, UART'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-514
  - ZN-517
ordinal: 320060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Board defaults for hw.h (U14 TWI2 = /dev/i2c-2, shared with XIO at 0x38; U13 TWI1 = /dev/i2c-1), a DT overlay enabling spi2 with spidev on the CSI pins, PWM0 through /sys/class/pwm, UART1/UART2 through termios, documented in docs/targets/chip.md. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the SSD1306 example renders the same frames on /dev/i2c-2 as in the hw.h simulator
- [ ] #2 an I2C EEPROM model on the cubieboard bus is read and written through hw.h in the CHIP-03 guest
- [ ] #3 the spi2 overlay builds and exposes /dev/spidev2.0 on hardware
- [ ] #4 PWM0 duty cycle and period are set from TypeScript
<!-- AC:END -->
