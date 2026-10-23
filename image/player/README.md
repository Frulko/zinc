# Zinc Player

The screen of the Zinc Pi image when its app does not run. `zinc-session` starts it when there is no app, when the app quit and
when it crashed. It exits with 10 to have the session start the app.

- **Home**: a coloured page with a slow animation that invites to try Zinc. Its card says the next step: join a network, turn
  remote access on, show a pairing code (with the `zinc device pair` command to type on the computer), or `zinc dev --device` once
  paired. "Start the app" when one is installed. At the bottom: the Pi's name and addresses, the Zinc version, and while the Pi
  starts what it is doing (the job systemd runs, from `zinc-admin status`).
- **Crash**: the app's exit status, time and last lines, with "Restart the app" and "Dismiss".
- **Settings** (the gear): Wi-Fi (scan, join with the on-screen keyboard, forget, the country), remote access (the agent, a
  pairing code, SSH, the Pi's name), preferences (background, animation, QWERTY or AZERTY keyboard) and system (model, versions,
  temperature, memory, storage, restart, shut down).
- **Updates**: compatible stable engine versions, a newer-version icon in the top bar, explicit installation confirmation,
  progress/errors and restoration of the saved previous engine/player. Engine changes repack the same player sources on the Pi;
  the code stays unchanged. Wi-Fi also has **Restart network**, with confirmation because remote sessions can disconnect.

It works with a touch screen, a mouse or a keyboard alone (Tab, the arrows, Enter, Escape).

## Run it on a computer

```sh
tools/pi-image player            # the home page, on a pretend Pi
tools/pi-image player --crash    # the crash page
```

The pretend Pi is `dev/`: `dev/zinc-admin` plays the system helper and `dev/bin/nmcli` NetworkManager (four networks;
"Atelier" takes the password "correct horse"). Their state lives in `~/.zinc/cache/pi-image/player`.

| Variable | What it is (on the Pi) |
|---|---|
| `ZINC_RUN` | the session's runtime directory, where `crash.txt` lives (`/run/zinc`) |
| `ZINC_APP` | the app's path (`/var/lib/zinc/app`) |
| `ZINC_ADMIN` | the system helper (`/usr/lib/zinc/zinc-admin`) |
| `ZINC_VERSION` | the Zinc version the System section shows (set by `zinc-session`) |
| `ZINC_PLAYER_CONFIG`, `ZINC_PLAYER_AGENT_DIR` | the preferences (`~/.zinc/player.json`) and the agent's pairing files (`~/.zinc/agent`) |
| `ZINC_PLAYER_TRACE_FRAMES=1`, `ZINC_PLAYER_POLL_MS=n` | for tests: print each frame drawn; wait up to n ms a frame for the helpers' answers |

## Layout of `src/`

The display tree on `zinc:gfx` of `examples/music-tree` (`examples/GUIDELINES.md`): a frame is drawn only when something changed.

```text
src/
├── main.ts             # the stage, the pointer and the keyboard, the frame loop
├── constants.ts        # paths, intervals, colours, sizes, the background themes
├── fonts.ts            # Inter at each size used
├── state.ts            # what the pages show and every action (zinc-admin, zinc:network)
├── core/               # the display tree and touch zones (music-tree's), with keyboard focus
├── services/           # crash-report, system (zinc-admin), pairing (the agent's files), config (player.json)
├── components/         # buttons, rows, top bar, on-screen keyboard, text form, ambient animation
└── pages/              # home, crash, settings (wifi, remote, preferences, system)
```

## On the device

The player runs as a `.zapp` bundle, as the `zinc` user. Its source archive stays on the image for rebuilding it with a chosen
engine. `image/README.md`, "Engine updates on the Pi", describes verification, atomic activation and rollback. Network changes go through `zinc:network` (`plugins/network`, `docs/plugins/network.md`):
NetworkManager lets `zinc` do them through a polkit rule. The rest goes through `zinc-admin`, which `zinc` may run as root
through sudo for its fixed verbs (status, wifi-country, ssh, agent, hostname, pair, reboot, poweroff). The image runs the player
once at build time, so the first boot starts it from cached bytecode, with the screen's driver compiled. The session shows it
through `/dev/fb0` (`display-fbdev`) at its native resolution. Touch, mouse buttons/wheels and physical keyboard navigation/text use
evdev; libxkbcommon applies the system keyboard layout and dead keys. USB devices can be connected after startup. An outlined
mouse cursor also moves over an idle frame and hides on touch. A program sent with
`zinc dev --device` takes the screen: `zinc-session` closes the player while the program has it open.

Proof: `tests/t1/pi_image_player.sh`, `tests/t1/pi_image_updates.sh` (the actual bundle, against pretend helpers),
`tests/t0/pi_image_update.sh` (local signed downloads and activation transactions), and `tests/t0/network_plugin.sh` for the plugin.
