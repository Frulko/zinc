# zinc/sdk-rpi1: native ARMv6 hard-float build (Alpine armhf targets ARMv6 + VFP, like Raspberry Pi OS 32-bit).
# Runs under QEMU user emulation through binfmt (DEV-03); the same container executes the tests.
FROM --platform=linux/arm/v6 alpine:3.20
RUN apk add --no-cache g++ cmake make binutils curl-dev pkgconf libgpiod-dev
