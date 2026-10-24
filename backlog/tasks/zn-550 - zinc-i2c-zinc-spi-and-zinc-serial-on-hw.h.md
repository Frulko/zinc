---
id: ZN-550
title: 'zinc:i2c and zinc:spi modules over hw.h'
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-M
milestone: m-25
dependencies:
  - ZN-126
  - ZN-535
ordinal: 50900
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Modules zinc:i2c (I2C_RDWR + SMBus fallback, scan) and zinc:spi (modes, speed, full duplex); i2c-stub and sim tests; spidev loopback on the Pi. Serial is done.

Module APIs over hw.h: i2c (I2C_RDWR with SMBus fallback, bus enumeration, scan), spi (spidev modes, speed, full duplex) and serial (termios, baud, parity, flow control, /dev/serial0 resolution). The existing sim chip models are reused. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 i2c-stub test (SMBus path) and hw.h sim tests green
- [ ] #2 spidev loopback (MOSI-MISO jumper) passes on the Pi 3B+
- [ ] #3 pty-pair serial test passes on the host
- [ ] #4 display-ssd1306 and display-ws2812 frames unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. hw.h already has Linux i2c-dev and spidev backends plus sim models (runtime/include/hw.h:3-4), and zinc:serial is POSIX termios (plugins/serial/native/serial.host.cpp). Left: user-facing zinc:i2c and zinc:spi modules, bus scan, SMBus fallback. Carries ZN-518 (CHIP bus table). Evidence: runtime/include/hw.h:3; plugins/serial/native/serial.host.cpp:1
Review 2026-10-25: merged ZN-518 here (Buses on the CHIP: I2C, SPI2 overlay, PWM0, UART). Carry over: CHIP buses: board defaults for hw.h are the same work as the zinc:i2c/spi modules; carry the CHIP bus table and the spi2 overlay doc over. ZN-550 is open and gives zinc:i2c/spi over hw.h; carry over the CHIP bus table (TWI2 /dev/i2c-2 shared with XIO at 0x38, TWI1), the spi2 DT overlay, PWM0 via /sys/class/pwm (not in 550) and the CHIP-03 EEPROM criterion, labelled needs-board.
<!-- SECTION:NOTES:END -->
