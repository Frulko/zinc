# zinc/sdk-rmpp: reMarkable Paper Pro (i.MX 8M Mini, Cortex-A53, aarch64). Native arm64 GCC in a linux/arm64 image
# (native speed on Apple Silicon / arm64 hosts, QEMU binfmt elsewhere, like sdk-rpi1). Programs are linked statically,
# so they do not depend on the glibc of the device's OS release (see docs/targets/remarkable-paper-pro.md).
FROM --platform=linux/arm64 debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends g++ cmake ninja-build file && rm -rf /var/lib/apt/lists/*
