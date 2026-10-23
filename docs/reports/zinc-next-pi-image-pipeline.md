# Flashable Pi images and the future system-update boundary

ZN-785, 2026-10-23. The owner wants a download-and-flash path through Etcher or Raspberry Pi Imager, then easy updates. The first implementation reuses the existing Pi OS Lite builder instead of introducing another distribution or image format.

## Image delivery now

The manual `Pi image` workflow uses the [standard ARM64 Linux runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). It accepts one published engine version, downloads its ARM64 manifest/archive, and reuses the Pi updater's version/name/hash validation. Signature verification uses the host's [OpenSSL Ed25519 verifier](https://docs.openssl.org/3.0/man1/openssl-pkeyutl/), before any downloaded binary is executed. It requires the supported session/agent payload, so an old release cannot masquerade as a build with the new screen coordination.

The workflow runs the first-boot native regression, builds the image, checks its filesystem, units, cloud-config schema and libraries, and runs the player headless inside its userspace. It uploads the compressed image, Imager metadata, package list, checksum, profile, source/engine provenance and player capture only after success. It does not publish a GitHub release or site. Image code and engine version are recorded separately; Debian package versions are recorded, but apt sources remain mutable, so this is not a bit-reproducible build.

Independent review also caught stale SSH/agent/debug markers and Wi-Fi credentials when a pre-boot configuration was corrected. Reconfiguration now clears explicitly disabled settings, with a native regression. Two image checks were false: an exact environment line no longer matched the agent unit, and a failed ldd command could be mistaken for complete libraries. Both are corrected. Final filesystem checking now happens while the loop device is still attached, and failure is no longer discarded. These checks do not establish physical boot correctness.

Public images contain no login or network secrets. Imager can personalize them during flashing. Etcher users run `tools/pi-image configure` against the new boot partition with their locally saved builder profile; both paths feed the same cloud-init setup. This command is for initial setup, not existing-card password recovery. ZN-784 fixes password application to renamed users and prevents cleanup after failed provisioning.

## Two update levels

The current Updates menu replaces signed Zinc engine/player generations and the explicitly supported Zinc session/agent files. It keeps application data and pairing outside those generations. It does not update the kernel, boot partition, Wi-Fi firmware or Debian packages; do not describe it as a complete firmware updater.

For a future whole-system image, evaluate **RAUC as a separate system service** first. Its [signed bundles and explicit boot validation](https://github.com/rauc/rauc/blob/master/README.rst) and [bootloader integration](https://github.com/rauc/rauc/blob/master/docs/integration.rst) fit a small appliance. The proposed disk layout has an active and inactive boot/rootfs pair plus persistent settings/apps/pairing. An update writes and verifies the inactive pair, boots it once, then marks it good after the display and required local services are ready. Internet connectivity alone must not decide whether an offline-capable player is healthy. A failed start returns to the previous slot.

This is a proposal, not an installed feature. It requires a new initial A/B image, model-specific boot integration, storage sizing and power-cut tests. Do not convert the user's existing card in place automatically. [SWUpdate](https://github.com/sbabic/swupdate/blob/master/doc/source/swupdate.rst) is a mature alternative if updating several peripheral firmwares becomes part of the requirement; its broader component model is unnecessary for the current engine update.

Raspberry Pi's [rpi-image-gen A/B layer](https://raspberrypi.github.io/rpi-image-gen/layer/image-rota.html) and [OTA example](https://github.com/raspberrypi/rpi-image-gen/tree/master/examples/ota) are useful integration references, but adopting them changes the current builder/layout. The [signed_ota example](https://github.com/raspberrypi/rpi-image-gen/tree/master/examples/signed_ota) additionally concerns hardware secure boot, including irreversible OTP provisioning; it is not just a signed download. Raspberry Pi's [secure-boot support](https://github.com/raspberrypi/usbboot/blob/master/docs/secure-boot.md) targets Pi 4 and later. The owner's Pi 3 B+ should instead be evaluated with software A/B selection; the [tryboot documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#fail-safe-os-updates-tryboot) includes older models, but integration and recovery still need proof on this board.

## Verification limits

Native tests exercise real manifest signatures/checksums and rejection cases, first-boot configuration, old-card refusal and failed setup retention. Actionlint and shell/YAML checks cover the workflow. No image workflow was dispatched, no ARM image was built locally, no release was published and no Pi state was changed. A first workflow run and physical first boot remain required before describing an artifact as validated on hardware.
