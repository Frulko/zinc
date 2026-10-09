---
id: ZN-550
title: 'zinc:i2c, zinc:spi and zinc:serial on hw.h'
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
ordinal: 340160
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Module APIs over hw.h: i2c (I2C_RDWR with SMBus fallback, bus enumeration, scan), spi (spidev modes, speed, full duplex) and serial (termios, baud, parity, flow control, /dev/serial0 resolution). The existing sim chip models are reused. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 i2c-stub test (SMBus path) and hw.h sim tests green
- [ ] #2 spidev loopback (MOSI-MISO jumper) passes on the Pi 3B+
- [ ] #3 pty-pair serial test passes on the host
- [ ] #4 display-ssd1306 and display-ws2812 frames unchanged
<!-- AC:END -->
