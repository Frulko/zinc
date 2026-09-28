# zinc/sdk-rpi1: native ARMv6 hard-float build (Alpine armhf targets ARMv6 + VFP, like Raspberry Pi OS 32-bit).
# Runs under QEMU user emulation through binfmt (DEV-03); the same container executes the tests.
FROM --platform=linux/arm/v6 alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
RUN apk add --no-cache g++ cmake make binutils curl-dev pkgconf libgpiod-dev
