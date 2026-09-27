# zinc/sdk-linux: GCC toolchain for the `linux` target (D-15). Headless runs use the null HAL.
FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends cmake ninja-build g++ libcurl4-openssl-dev && rm -rf /var/lib/apt/lists/*
