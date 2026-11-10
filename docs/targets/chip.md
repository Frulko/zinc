# CHIP and PocketCHIP

The `chip` and `pocketchip` profiles describe Next Thing Co.'s Allwinner R8 boards: one Cortex-A8 with NEON,
512 MB RAM and a Mali-400 GPU. The [hardware report](../reports/hardware/ntc-chip.md) records the research
and remaining display, input, power and deployment work. No physical board was used to validate these profile rows.

| Profile | Default surface | Numbers | Zinc heap | Input |
|---|---|---|---|---|
| `chip` | 720×576 (PAL composite) | f64 | 128 MiB | Optional external touch, keyboard and pointer |
| `pocketchip` | 480×272 LCD | f64 | 128 MiB | Resistive touch and keyboard; no pointer |

Both declare GPIO, power, networking, files, processes, tier T2 and GLES2. `optional` means a peripheral can
provide the capability, so its platform boolean is true even when nothing is connected. The PocketCHIP input
contract follows the [original manual](https://docs.getchip.cc/pocketchip); GPIO and power declarations describe
the board's hardware, not proof that every Zinc backend works on it. A project requiring `dynlib`, `gpu>=gles3`
or, on PocketCHIP, `pointer` is refused with the profile named. See [capability requirements](capabilities.md).

The asset defaults follow the existing T2 `rpi1` row: ETC1 with uncompressed fallbacks, textures up to 2048,
Vorbis music, QOA effects and LZ4 packs, with 150 MB RAM, 40 MB GPU and 4 MB boot budgets. These are unmeasured
starting values for asset checks, separate from the 128 MiB Zinc heap.

## Choose an OS and boot media

Use a maintained armhf userland with mainline display drivers for new work. The community
[PocketTRIX builder](https://github.com/m4xx3d0ut/pocketchip-debian-builder) provides Debian 13 images and
FEL/USB bring-up instructions; its NAND/SLC installation path is experimental. Follow its instructions for
the actual NAND variant, preserve existing data first, and start with its FEL/USB boot path before considering
a NAND replacement. The [original CHIP manual](https://docs.getchip.cc/chip) describes the legacy FEL/fastboot
flashing procedure. Neither procedure has been run as part of this profile work.

The current `armv7-linux` toolchain uses `arm-linux-gnueabihf.2.28` and `cortex_a8+neon`. The hardware report's
static-musl proposal has not been implemented. `dynlib: false` restricts app requirements; it does not make a
binary static or guarantee compatibility with stock Debian Jessie (glibc 2.19).

[Mesa Lima](https://docs.mesa3d.org/drivers/lima.html) supports Mali-400 and primarily GLES2; it also needs a
separate display driver such as `sun4i-drm`. Fragment shader arithmetic has limited precision. A T2/GLES2 row
does not certify the installed kernel, Mesa or LCD setup, and does not enable GLES3. The PocketCHIP LCD uses
the same display controller as composite output; choose the matching board overlay.

## Check, build and deploy

Check the project's requirements on the development machine first:

```sh
zinc check --profile chip path/to/project
zinc check --profile pocketchip path/to/project
```

These checks and platform-constant runs work on the host; they do not exercise ARM code. `SCREEN_W/H` use
the profile defaults above unless the project or `ZINC_SIZE` supplies an explicit size.
The existing cross-build and SSH deployment commands are:

```sh
zinc build --target chip path/to/project -o dist/chip-app
zinc build --target pocketchip path/to/project -o dist/pocketchip-app
zinc deploy path/to/project --target pocketchip --device user@board --print
```

`--print` previews deployment without copying or starting anything. Once the image, SSH connection and target
libraries are ready, omit it to export, copy and start the app. Set `ZINC_BACKGROUND=1` when launching a GUI.
Hello cross-builds for both profiles produce ARMv7 hard-float executables. Hero currently stops at its video
plugin because the ARMv7 sysroot lacks FFmpeg (`libavformat`).
No ARM executable has been run here. Display, touch, keyboard, GPIO and battery still need a real-board check.
