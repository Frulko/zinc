#!/bin/bash
# step: Installing packages
# What Zinc draws with without a desktop (KMS/DRM, GBM, EGL, GLES and Mesa's VC4/V3D drivers), the libraries the
# profile chose, and out with what an appliance does not use.
set -euo pipefail
apt-get update -qq
# shellcheck disable=SC2086 # ZI_PACKAGES is a list
apt-get install -y -q --no-install-recommends python3 ca-certificates libdrm2 libgbm1 libegl1 libgles2 libgl1-mesa-dri libxkbcommon0 $ZI_PACKAGES
apt-get purge -y -q man-db udisks2 rpi-connect-lite
apt-get autoremove -y -q --purge
