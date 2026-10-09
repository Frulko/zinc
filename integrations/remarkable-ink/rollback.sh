#!/bin/sh
set -eu
# Independent transient timer used only during initial extension validation.
if [ ! -f /run/zinc-ink-verified ]; then
    mv /home/root/xovi/extensions.d/zinc-ink.so /home/root/xovi/exthome/zinc-ink/disabled.so
    systemctl restart xochitl
fi
