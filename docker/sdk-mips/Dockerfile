# zinc/sdk-mips: MIPS cross toolchain + QEMU user mode, to run the runtime on R3000 (ps1) and R5900 (ps2) ISAs.
# ponytail: validates codegen, 32-bit pointers and alignment on MIPS; console images (PS-EXE/ELF) need their SDK images.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends g++-mipsel-linux-gnu qemu-user cmake make && rm -rf /var/lib/apt/lists/*
