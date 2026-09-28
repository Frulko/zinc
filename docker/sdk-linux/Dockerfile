# zinc/sdk-linux: GCC toolchain for the `linux` target (D-15). Headless runs use the null HAL.
FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a
RUN apt-get update && apt-get install -y --no-install-recommends cmake ninja-build g++ libcurl4-openssl-dev && rm -rf /var/lib/apt/lists/*
