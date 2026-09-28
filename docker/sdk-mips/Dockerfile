# zinc/sdk-mips: MIPS cross toolchain + QEMU user mode, to run the runtime on R3000 (ps1) and R5900 (ps2) ISAs.
# ponytail: validates codegen, 32-bit pointers and alignment on MIPS; console images (PS-EXE/ELF) need their SDK images.
FROM debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251
RUN apt-get update && apt-get install -y --no-install-recommends g++-mipsel-linux-gnu qemu-user cmake make && rm -rf /var/lib/apt/lists/*
