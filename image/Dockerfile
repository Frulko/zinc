# The container tools/pi-image builds the image in: it opens Raspberry Pi OS Lite and changes it in a chroot (arm64:
# native on an arm64 machine, through the host's qemu binfmt elsewhere).
FROM debian:trixie
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl jq xz-utils fdisk e2fsprogs dosfstools openssl rauc squashfs-tools \
 && rm -rf /var/lib/apt/lists/*
