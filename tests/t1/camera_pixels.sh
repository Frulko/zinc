#!/bin/sh
# The no-device camera UI matches the frozen prototype even with USB hardware attached.
cd "$(dirname "$0")/../.." || exit 2
command -v pkg-config >/dev/null && pkg-config --exists libgphoto2 libturbojpeg && command -v c++ >/dev/null || { echo "skipped: libgphoto2, libturbojpeg or a compiler is missing"; exit 77; }
tools/proto-capture compare camera/remote/src/main.tsx --zinc "$ZINC"
