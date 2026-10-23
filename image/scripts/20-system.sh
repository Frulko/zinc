#!/bin/bash
# step: Configuring the system
# The zinc user, the session first in the boot, everything else after its first frame, and the services an appliance
# does not need masked. docs/reports/pi-os/05-pios-fast-boot.md has the measures behind each line.
set -euo pipefail

id zinc >/dev/null 2>&1 || useradd --system --home-dir /var/lib/zinc --shell /usr/sbin/nologin zinc
usermod -aG video,render,input,tty,audio,plugdev,dialout,gpio,i2c,spi zinc
chown -R zinc:zinc /var/lib/zinc
# the player changes the system through zinc-admin alone (sudo), and the network through NetworkManager (polkit)
chmod 0440 /etc/sudoers.d/zinc
visudo -cq -f /etc/sudoers.d/zinc

# userconfig asks for a user on tty8 and switches the screen to it: the screen is the player's, a user comes from the
# profile or Raspberry Pi Imager. getty@tty1 stays unmasked, off by its drop-in (getty@tty1.service.d/zinc.conf).
# systemd-firstboot waits to own /dev/console, which is tty1 when cmdline.txt names it last (a debug image): the session
# holds tty1, so the wait never ends and the boot stops before D-Bus and the network; the image already has what it
# would ask (locale, keymap, time zone, root's entry)
systemctl mask NetworkManager-wait-online.service keyboard-setup.service console-setup.service \
  rpi-eeprom-update.service userconfig.service e2scrub_reap.service systemd-firstboot.service \
  apt-daily.timer apt-daily-upgrade.timer man-db.timer e2scrub_all.timer dpkg-db-backup.timer
[ "$ZI_BLUETOOTH" = true ] || systemctl mask bluetooth.service hciuart.service

for u in NetworkManager.service wpa_supplicant.service ssh.service ssh.socket sshswitch.service \
  avahi-daemon.service avahi-daemon.socket systemd-timesyncd.service cron.service; do
  mkdir -p "/etc/systemd/system/$u.d"
  printf '# Maintained by Zinc: starts once the session shows its first frame\n[Unit]\nAfter=zinc-shell.service\n' \
    >"/etc/systemd/system/$u.d/10-zinc-defer.conf"
done
# Wi-Fi's driver is blacklisted from the boot (modprobe.d/zinc-defer.conf); NetworkManager loads it once it starts
printf '[Service]\nExecStartPre=-/sbin/modprobe brcmfmac\n' >>/etc/systemd/system/NetworkManager.service.d/10-zinc-defer.conf

systemctl enable zinc-shell.service zinc-firstboot.service zinc-agent.service zinc-report.service

# Run once now, as the session's user: the first boot starts the player (and the app) from the bytecode cached in
# /var/lib/zinc/.zinc, with their native plugins compiled (the Linux release ships none: zinc builds them at first use,
# with a toolchain it downloads, and the first boot has no network yet), the screen's driver among them (display-fbdev,
# which zinc-session asks for). The toolchain itself goes (367 MB); zinc
# downloads it again when a later app needs another plugin.
for project in /usr/lib/zinc/player /var/lib/zinc/app; do
  [ -e "$project" ] || continue
  runuser -u zinc -- env HOME=/var/lib/zinc ZINC_HEADLESS=1 ZINC_DISPLAY=fbdev ZINC_FRAMES=1 timeout 300 /usr/bin/zinc run "$project" >/dev/null 2>&1 ||
    echo "warning: $project did not run here; the session shows its errors at boot"
done
rm -rf /var/lib/zinc/.zinc/toolchains
