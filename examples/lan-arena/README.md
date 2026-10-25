# Paint Arena

A paint-ball match in a raycast 3D arena for everyone on the same Wi-Fi. The Mac, the PSP, the PS Vita and the 3DS all run the same source. The Mac hosts the match and plays in it, and the consoles find it on the network and join. With nobody else around, bots fill the arena, so it also plays solo.

## How to play

1. On the Mac, run `zinc run examples/lan-arena`. It hosts a match at once and shows its address at the bottom left.
2. On each console, start Paint Arena. The title screen lists the hosts it hears on the Wi-Fi. Pick one with Up/Down and press Cross to join (A on the 3DS).
3. Splat the others with paint. Each hit scores a point, and the first player to 10 wins the round. A new round starts a few seconds later.

| | PSP / Vita | 3DS | Keyboard |
|---|---|---|---|
| Move | d-pad up/down, stick | d-pad, circle pad | W/S, arrows |
| Turn | d-pad left/right, stick | d-pad, circle pad | A/D, arrows |
| Strafe | L / R | L / R | Q / E |
| Shoot | Cross | A | Space or Z |
| Host here (title screen) | Triangle | Y | V |
| Solo against bots (title) / leave a match | Start | Start | Enter |

If no host shows up (some routers block broadcasts between clients), give the address yourself. On the desktop, run `ARENA_SERVER=192.168.1.20 zinc run examples/lan-arena` or pass `--join 192.168.1.20`. On a console, the zinc:storage key `server` does the same.

Options (after `--`): `--host`, `--search` (the title screen), `--join <address[:port]>`, `--solo`, `--bots <n>`, `--name <name>`, `--log`, `--stats`. The port defaults to 47800 (`ARENA_PORT` changes it). A console build takes the same options through `ARENA_FLAGS`, built in with `tools/build-console-core --env`.

## How it works

- `src/services/network.ts` uses zinc:lan for UDP on port 47800. A client finds hosts by broadcasting `?`, and each host answers with its name and its player count.
- `src/state.ts` holds the match and its protocol. Each client owns its own position and sends it about 30 times a second. The host owns the shots, hits and scores, and sends a snapshot of the whole match 20 times a second.
- `src/world.ts` holds the arena grid, the players, the paint balls and the rules. `src/bots.ts` drives the bots.
- `src/render/view.ts` is the raycaster: one wall slice per column band, then the players and balls as billboards cut against the walls' depth. Everything is drawn with zinc:gfx rectangles. `src/render/hud.ts` draws the HUD and the title screen.

Test: `tests/t1/lan_arena.sh` runs a host and a client headless on the loopback, then a solo match on two engines.
