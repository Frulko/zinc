# zinc/sdk-psx: PSn00bSDK v0.24 (prebuilt mipsel-none-elf GCC 12.3 + libpsn00b + mkpsxiso) and PCSX-Redux (headless,
# OpenBIOS: no Sony BIOS) to run PS-EXEs. Both are official x86_64 builds, pinned by sha256 (docs/decisions/0012).
# Ubuntu 26.04: the PCSX-Redux Linux build needs glibc 2.43 (its build image is ubuntu:26.04 too)
FROM --platform=linux/amd64 ubuntu:26.04@sha256:da6fc2be547864451aa253836dd926da33623312df4a9a243e35dc877c378a78
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl unzip cmake make \
    libgl1 libegl1 libx11-6 libasound2t64 libfribidi0 libharfbuzz0b libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*
ARG SDK=https://github.com/Lameguy64/PSn00bSDK/releases/download/v0.24/PSn00bSDK-0.24-Linux.zip
ARG SDK_SHA=5ada7c9478d795b22bde96ee23d6869290c14a740bcde3d57c01c342a26ded35
RUN curl -sfL "$SDK" -o /tmp/sdk.zip && echo "$SDK_SHA  /tmp/sdk.zip" | sha256sum -c - \
    && unzip -q /tmp/sdk.zip -d /opt && mv /opt/PSn00bSDK-0.24-Linux /opt/psn00bsdk && rm /tmp/sdk.zip
# PCSX-Redux has no tagged releases: a dev build (changeset 8f4649d2) from its distribution server, content-addressed
ARG REDUX=https://distrib.app/storage/assets/fd7/4b0/a1a/70d3523e6df31cdc1c0e36bd7596fbd57d3d43261c621a6efcc7df9/PCSX-Redux-8f4649d2-linux-x86_64.zip
ARG REDUX_SHA=debdfe856c5dc5d84fce81fd140d1d96497937189c86091f3c39b15591b6d9d3
RUN curl -sfL "$REDUX" -o /tmp/redux.zip && echo "$REDUX_SHA  /tmp/redux.zip" | sha256sum -c - \
    && cd /opt && unzip -q /tmp/redux.zip && chmod +x PCSX-Redux-*.AppImage && ./PCSX-Redux-*.AppImage --appimage-extract >/dev/null \
    && mv squashfs-root /opt/redux && rm -f /tmp/redux.zip PCSX-Redux-*.AppImage
ENV PATH=/opt/psn00bsdk/bin:$PATH PSN00BSDK_LIBS=/opt/psn00bsdk/lib/libpsn00b
