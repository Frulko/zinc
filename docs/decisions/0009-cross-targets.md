# 0009 — Cross targets through pinned SDK images and QEMU

**Choice.** `rpi1`: native ARMv6 hard-float toolchain in an Alpine armhf image, run under QEMU `arm1176`.
`ps1`: the fixed-point profile compiled for MIPS I and run under `qemu-mipsel` (validates ISA, 32-bit pointers,
alignment; hosted glibc, hard-float ABI). `ps2`: real EE ELF with ps2dev (build only; PCSX2 needs the user's BIOS).
`esp32`: generated ESP-IDF v6.0 project, run in Espressif's QEMU; static buffers are sized per profile (NFR-05).
Sony's PsyQ libraries are never used (spec rule 10).

**Consequences.** The PS-EXE (PSn00bSDK + soft-float + freestanding number formatting) and console graphics backends
remain to be written.
