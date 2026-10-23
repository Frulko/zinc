# Zinc Pi image

Extract the Actions artifact ZIP. The `.img.xz` inside is the disk image: flash it with Raspberry Pi Imager (Use custom) or balenaEtcher, not the artifact ZIP. Flashing replaces the selected card's contents. `SHA256SUMS` checks the compressed image; `provenance.json` identifies the image scripts and engine version.

The public image contains no personal login, Wi-Fi credentials or app. With Raspberry Pi Imager, configure your administrator account, Wi-Fi and SSH before writing. With Etcher, flash first, remount the card's boot partition on your computer, then apply a private profile before the Pi's first start:

```sh
tools/pi-image configure /Volumes/bootfs ~/.zinc/pi-image/profile.json
```

Adjust the mounted path for your system. The profile above is the image builder's saved configuration; it stays on your computer. This command writes its first-boot login/network settings and uses its SSH/agent flags, without rebuilding the image. It requires this checkout's `tools/pi-image`, jq and OpenSSL with SHA-512 password support. Eject the card, insert it into the Pi and start it. A player-only setup can be flashed without configuration, but SSH then has no administrator login.

The login password is hashed on the boot partition; Wi-Fi credentials must be readable by the first-boot service. Successful setup removes these files. Failed setup preserves them for recovery. Do not upload a configured card image or private profile as a public artifact.

After setup, the player's Updates menu installs signed Zinc engine releases, with the previous engine/player and supported Zinc service files retained for rollback. This does not update Raspberry Pi OS, its kernel or board firmware.

CI checks image contents and starts the offline player inside the image's userspace. It does not prove the Pi's physical first boot, Wi-Fi, touchscreen or display handoff. Those require the board checks before calling a build hardware-validated.
