---
id: ZN-297
title: >-
  Sim: Parts wave 3: DHT22, MPU6050, servo, SD (SPI), rotary encoder, buzzer,
  7-segment, HC-SR04 as models
status: Done
assignee: []
created_date: '2026-10-07 13:13'
updated_date: '2026-10-08 11:41'
labels:
  - simulator
  - arduino
  - size-L
milestone: m-18
dependencies:
  - ZN-128
ordinal: 53050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-06). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 1) each model has a T0 test with a captured transaction stream (real library byte streams, as ZN-127). 2) `set-control` changes the sensor value and a program sees it on the next read. 3) a wrong register address in a test driver is reported as a bus error.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Eight models in src/sim/chips: mpu6050.h (I2C 0x68 registers, sleep bit, big-endian sample block, ranges), sdcard.h (SPI mode: CMD0/8/55/ACMD41/58/17/24 over an in-memory image), dht22.h (the 40-bit pulse train and its decoder), servo.h (pulse width to angle), encoder.h (quadrature, press), buzzer.h (frequency from the rising edges), sevenseg.h (segments to digit, common anode), hcsr04.h (TRIG to ECHO width, 58 us/cm). tests/native/chip_wave3.cpp (in tests/t1/chip_models.sh) drives each with what the real libraries send: byte streams of the Adafruit MPU6050 and the Arduino SD init/read/write are goldens (tests/golden/sim/mpu6050.stream, sdcard.stream); set-control (control(name, value)) changes ax/humidity/distance/rotate and the next read sees it; a wrong register or command (MPU register 0x30 or a write to WHO_AM_I, SD CMD17 before CMD0 / beyond the card / while idle, DHT22 start pulse of 300 us, servo 3.5 ms pulse, HC-SR04 TRIG of 4 us) is an error. Not wired yet: the models are not behind zinc sim parts (that needs pins for programs).
<!-- SECTION:NOTES:END -->
