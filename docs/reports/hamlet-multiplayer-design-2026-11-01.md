# Hamlet multiplayer: design study (2026-11-01)

Goal: friends each run a town (city builder), trade asynchronously, and make war on each other's towns on separate battle maps. Free, open source, self-hostable, no vendor lock-in. Nothing is built by this report.

## 0. What exists (read)

| Area | Finding |
|---|---|
| Sim | `engine/simulate.ts` `stepWorld(dt)`; state in one `world` object (`world/world.ts`); `HamletScene.onUpdate` calls `stepWorld(Math.min(.04, dt))`: **variable dt** |
| Player actions | One door: `applyTool(tool, tile)` in `rules/build.ts` (road, house, sawmill, lodge, erase). Already a pure "command" in shape; `HamletScene.act` also does sound and text |
| PRNG | Own LCG in `world.ts` (`seedRandom`, `random`, `Math.imul`, u32). Used by deer and worker rolls. Good. Reseeded only in `generate(seed)`; **not in the save** |
| Non-sim randomness | `Math.random()` only in `HamletScene` for the seed of a new village (UI side). No `Date` in the sim |
| Save | `world/save.ts`: `H1;seed;wood;meat;roads;buildings(type.tile.residents);felled` one text line, key `hamlet:save` in `zinc:storage`. Restores terrain by `generate(seed)` + replay. **Does not save**: people positions/states/jobs, deer, timers, `world.time`, PRNG state. Residents are recreated at the house |
| Float use | `Math.hypot`, `Math.atan2`, `Math.cos/sin` in `path.walk` (hypot decides arrival and position; atan2 is view only); `generate` uses `hash`/`noise` from `pixel-plays/src/native/renderer.ts`: `Math.sin(x*127.1+y*311.7)*43758.5453` |
| Test | `tests/t1/hamlet.sh` runs `tests/data/hamlet/rules.ts` on interpreter, AOT and QuickJS (ZINC_DETERMINISTIC) + a scripted session |

## 0.1 What Zinc offers for networking

| Need | Provider | Notes |
|---|---|---|
| HTTP server | `zinc:net` `serve(port, handler, opts)` (docs/guide/04-headless-services.md) | libuv + llhttp; limits per IP, TLS via `cert`/`key`, `requestsPerSecondPerIp` |
| WebSocket server | `zinc:net` `ServerWebSocket` in `serve` options, or `zinc:socket` `serveWebSocket(port, (ws, req) => ..., host, opts)` | RFC 6455, text and binary (`sendBytes`), back-pressure, `maxPayloadBytes`, `idleTimeoutMs`, `wss://` with cert/key |
| WebSocket client | `new WebSocket(url)` in `zinc:socket` (browser-like API); `wss://` verified by mbedTLS; works on the web target too (`web/index.ts`) | headers option for auth |
| TCP / UDP / DNS | `zinc:socket` | `requires net+process`: not ESP32/PS1/PS2/wasm |
| Database | `zinc:sqlite` (SQLite 3.53 amalgamation, `Database`, `transaction`) | native on macos/linux/rpi; `node:sqlite` in the sim |
| Secrets | `zinc:secure-store` (client token), `randomBytes(n)` in `lib/modules.d.ts` | no password KDF found in docs: argon2/scrypt would be a vendored library (D-rules: never write crypto) |
| Headless | `ZINC_HEADLESS=1`, `docs/guide/04-headless-services.md`: a program with a listener stays alive, no window, no `zinc:gfx`; `zinc run` compiles to cached native; `zinc export --target linux/rpi` gives executable + `run.sh` + systemd unit, no Docker; `onFrame` is not needed | Server = a second entry, same source tree as the sim |
| Workers | `zinc:worker` (interp, compiled, QuickJS) | one battle room per worker is possible, not needed first |
| `zinc agent` | Daemon that makes a machine a deploy target (`zinc device`: shell, files, apps, logs, forwarded ports) | A deployment channel for the Pi/VPS, **not** a game server or relay |
| Examples | `examples/service/sensor-hub` (HTTP+MQTT daemon); `examples/discord` (WebSocket client) | No game-server example yet |

Verdict: a Zinc server is feasible today with zero new engine work: `zinc:net` HTTP/WS + `zinc:sqlite`, same language as the client, sim code shared as a library.

## 1. Architecture options

| | Lockstep + command queue | Authoritative server + snapshots | Hybrid |
|---|---|---|---|
| Idea | Everyone runs the same sim; only commands travel | Server runs the sim; clients render snapshots, send intents | Server orders commands and holds truth; clients also run the sim (same code) and are corrected by hash/snapshot |
| Bandwidth | Tiny | Large (people, deer, positions) or needs delta code | Tiny + rare snapshot |
| Determinism needed | Absolute, on every engine/CPU | None on clients | Absolute for prediction, but a mismatch is **repaired**, not fatal |
| Offline players | Cannot advance a shared world | Server can | Server can |
| Cheating | Weak (clients know all); desync = broken | Strong | Strong (server validates, replays) |
| Latency feel | Input delay | Round trip | Local prediction, no delay in a town |
| Work | Medium, fragile | Medium-large, but no determinism risk | Medium; most is shared with single-player |

Fit to the game:
- **Town (the city builder) is single-owner.** Nobody else touches it live. A town needs no live sync at all, only an authoritative record the server can replay.
- **Trade** is asynchronous, between towns, works with offline players: a server job, not a sim feature.
- **War** is a short, symmetric, real-time-ish match between 2 to a few players: the one place where lockstep fits.

Recommendation (hybrid, split by use):
1. **Town = deterministic sim + command log, server-verified.** Client runs the sim locally (zero latency). Commands are sent to the server, which replays them on the same sim headless, keeps the authoritative town, and returns a state hash. Offline: the server advances the town by ticks when the owner connects (catch-up) or on a coarse schedule.
2. **Trade = server-mediated mailbox/market (no sim sync).**
3. **War = lockstep room** (battle map is its own small sim instance), server only relays commands, orders them, and checks the hashes. Result (casualties, loot) is written to both towns by the server.
4. A pure authoritative-snapshot server is the fallback if determinism across engines proves too costly (section 2): the command seam is the same, only the client stops simulating.

## 2. What determinism requires in our sim

| Item | State today | Needed |
|---|---|---|
| PRNG | Own LCG, integer, seeded | Keep. Put `rng` in `World` (state in the save/hash). One stream per sim instance, not a module global (battle rooms) |
| Time step | `Math.min(.04, dt)` per frame: variable | Fixed `TICK = 1/20 s` accumulator in the scene; `stepWorld()` takes no argument; `world.tick` integer. `world.time = tick * TICK` (exact if TICK is a power-of-two fraction: use 1/32 s) |
| `Math.random`/`Date` in sim | None (only the new-village seed in the scene) | Keep it out; the seed comes from the server or the UI |
| Iteration order | Arrays in index order (`for` over `buildings`, `people`, `deer`, tile loops); no `Map`/`Set`/object keys, no sort | Keep as a rule: only index-ordered arrays in the sim |
| Floats | IEEE double on all engines (profile f64; D26: esp32 f32, ps1 fx12 differ) | See below |
| `Math.hypot`, `sin`, `cos`, `atan2`, `pow` | `hypot` in `walk` decides arrival; `sin`/`pow` in `generate` (hash, edge, noise) | `+ - * / sqrt` are exactly rounded in IEEE and equal on interpreter, AOT and QuickJS. `sin/cos/pow/hypot/atan2` go through each libm (AOT: C++ libm; QuickJS: its libm; interpreter: host) and may differ in the last bit between platforms |

Honest answer on fixed-point: **not required** if we (a) restrict the sim to `+ - * / sqrt`, comparisons and integer ops, and (b) never run mixed profiles (f32 ESP32 and f64 desktop could not share a world; they could still be thin clients). Concrete edits:
- `walk`: replace `Math.hypot(dx, dy)` by `Math.sqrt(dx*dx + dy*dy)`. `atan2` stays (view-only `yaw`, move it out of the state hash).
- Worldgen: `hash` uses `Math.sin(...)*43758.5453`: huge magnitude amplifies a 1-ulp libm difference into a different tile. Replace by an integer hash (xorshift/murmur on `Math.imul`) in the sim copy, **or** do not regenerate: ship the generated terrain arrays in the save (144 tiles, cheap, and it also frees the format from the generator version). Recommended: both over time; save the terrain now.
- Same-machine proof is free: `tests/t1/hamlet.sh` already compares three engines; extend it to compare the **state hash after N ticks** (section 3). Cross-CPU (x86 vs arm64 vs Pi) is deferred to the cross-platform pass (AGENTS.md): the hash will tell. FMA contraction by the C++ compiler in AOT is the one hidden risk: build the AOT with `-ffp-contract=off` (to verify the flag exists in the toolchain manager; if not, a task).
- An integer-only sim (tile coordinates, speeds in 1/256 tile) would remove the whole class but rewrites `path`, `villagers`, `deer` and the renderer's positions: **not recommended** unless the cross-CPU hash fails.

State hash for desync detection: FNV-1a (u32 via `Math.imul`) over, in order: `tick`, `rng`, `wood`, `meat`, `road[]`, `tree[]`, `build[]`, each live building (type,i,j,residents,workers,timer), each person (role,state,home,job,target,carry, x,y as `Math.round(v*4096)`), each deer. Skip `yaw`, `phase`, `revision`, `saveDirty`. Cost: a few hundred numbers, once per second.

## 3. The command queue seam

```ts
// rules/commands.ts (proposed)
type Command = { t: number; kind: number; a: number; b: number };  // plain numbers: kind = BUILD|ROAD|ERASE|...,
// a = tile, b = tool/type. Text form: "tick,kind,a,b" so a log is a text file.
function applyCommand(c: Command): number  // calls applyTool; returns PLACE_* code
function advance(queue: Command[]): void   // one tick: apply all commands with c.t === world.tick, in array order, then stepWorld()
```

- **Commands are data.** `HamletScene.act` stops calling `applyTool` and calls `submit({kind, a, b})`. Sound/text stay in the scene, driven by the returned code.
- **Tick numbering.** Command executes at tick `now + D`. Single-player: `D = 0` or 1 (the same frame). Network: `D` = input delay (e.g. 2 to 3 ticks at 20 Hz = 100 to 150 ms; a city builder tolerates 200 ms easily, war ~100 ms).
- **Single-player uses the same path**: a local "server loop" `submit` -> queue -> `advance`. One code path, so the network cannot rot. The server is the same `advance` fed by sockets instead of the local pointer.
- **Replays for free**: log = `{ save0, commands[] }` or `{ seed, commands[] }`; replay with `ZINC_DETERMINISTIC`. This is also the **regression test**: record `tests/data/hamlet/session.input` into a command log, replay on three engines, compare hashes. Also the anti-cheat verifier (section 5) and the offline catch-up engine.
- Validation inside `applyCommand` stays the rule check (`checkTool`); invalid commands are rejected identically by all peers (no state change, same hash).
- Pause (`P`) becomes a command in war rooms; in a town it only stops local ticking (a town has no peers).

## 4. Save format shared by single-player and server

Extend `H1` -> `H2`, still one text line (or JSON if the owner prefers; text is what exists and diffs well), **per town**, versioned with an explicit migration (`H1` loads as before, its people are re-created):

| Field | Why |
|---|---|
| `tick` (integer), `rng` (u32) | resume exactly; today `seed` is regenerated, `rng` is lost |
| `terrain` generated seed **and** `felled` (kept), optional full terrain | independence from generator version |
| `wood`, `meat`, `roads`, `buildings` (as H1, plus `timer`, `workers`) | as today |
| `people`: role,home,job,state,timer,target,carry,tile,x,y | exact resume (needed for the hash to match after a load) |
| `deer`: state,timer,x,y,stag | same |
| `goods` (future): a list `kind.amount` instead of the two fields | trade needs generic stock; add when the economy has a third good |

Server side:
- **Snapshot** = the same line, stored in SQLite at ~every 10 minutes of ticks and at disconnect, with `tick` and hash. **Log** = commands since the snapshot. Replay snapshot + log = current state.
- **Delta**: not needed for a town (the client holds its own sim). For a reconnecting client: `snapshot + commands since`, which is the delta. Do not invent a diff format.
- A town is a row: `towns(id, owner, tick, save TEXT, hash INTEGER, updated)`. Battle result is a command-like event appended to the town log.

## 5. The small server in Zinc

Process model: **one headless Zinc program** (`examples/hamlet-server/` or `server/`), `ZINC_HEADLESS=1`, event loop only, no worker at first. Sim code imported from the shared `src/world`, `src/engine`, `src/rules` (no view imports: the existing split already keeps `world/` and `engine/` free of drawing; `save.ts` imports `zinc:storage`, to be injected or swapped for the server, see section 6). Run: `zinc run server/` for dev, `zinc export --target linux` (or `rpi`) + systemd unit for production.

| Topic | Design |
|---|---|
| Protocol | WebSocket (`zinc:net`), text frames = JSON `{t:"cmd",tick,kind,a,b}`, `{t:"hash",tick,h}`, `{t:"snap",save}`. Binary framing later only if profiling asks. Same wire shape for town and war room |
| Auth | Self-hosted accounts: `POST /register`, `/login` (HTTP on the same server) -> random token (`randomBytes(32)`), stored hashed (SHA-256) in SQLite, sent as WebSocket header at upgrade (`headers` option) or first message. Password hash with a **vendored** KDF (argon2/scrypt via library, per the no-hand-written-crypto rule); first version: invite-code accounts, long random secret per friend, no password at all. Client stores the token in `zinc:secure-store`. TLS: `serve` takes `cert`/`key` (ACME helper exists: `lib/std/acme.ts`) |
| Persistence | `zinc:sqlite`: `accounts`, `towns`, `town_log`, `offers`, `mailbox`, `wars`. One `db.transaction` per accepted command batch; WAL mode via `exec('PRAGMA journal_mode=WAL')` |
| Town session | Client connects, gets snapshot+log, simulates locally, streams commands (tick-stamped). Server runs the **same** sim for that town in a loop (`advance`), compares hashes each second; mismatch -> sends `snap`, client reloads (hybrid repair) |
| Offline towns | Not simulated while no one is online. On login: catch-up `ticks = min(elapsed/TICK, CAP)` (CAP e.g. 24 h of ticks; the sim is cheap, 144 tiles) run in a tight loop with no commands. Alternative: coarse 1 tick/s schedule. Decision: catch-up on demand, because it costs nothing for idle towns |
| Trade | Server-mediated, no sim sync. `offers(id, seller_town, give_kind, give_n, want_kind, want_n, expires)`. Posting an offer **escrows** the goods (a command that debits the seller town: applied in its sim, hash-checked). Accepting is a server transaction: it credits the buyer/seller **mailbox** (`mail(town, kind, n, from)`). A town applies mailbox items as a command (`RECEIVE`) the next time it ticks. Works with either side offline. Direct gifts = offer with no price |
| War | Attacker picks armies (units built in a town: needs a `BARRACKS` building and a unit queue; both future sim features) and a target town. Server creates a **room**: a new sim instance `battle(seed, mapFromTown(defender), armies)` with its own PRNG and lockstep. The server collects each player's commands for tick `T`, broadcasts the ordered batch (`{tick, cmds[]}`), checks hashes. Defender offline: an AI/policy script plays (same command interface), or the defense is auto-resolved by the server in the room with deterministic scripted defenders (so war works on offline friends). Result written to both town logs as events (units lost, loot to mailbox, building damage) so they replay |
| Anti-cheat basics | Server replays every town's commands (it is the authority for resources); rejects commands failing `checkTool`, flooding (tick-stamped, max N per tick), tick outside window; hash mismatch -> snapshot overwrites the client. Trade/war never trust client numbers. Clients are friends: no more |
| Hosting | One Pi 3B+ or a 5 EUR VPS: Zinc native binary + SQLite file, nothing else. Capacity is small (tens of friends). Backup = copy the `.db`. `zinc agent` helps deploy (`zinc device`), not at runtime |

## 6. The minimal seam to add NOW (single-player, each testable)

| # | Change | File(s) | Test |
|---|---|---|---|
| 1 | Fixed tick: accumulator in `onUpdate`, `stepWorld()` without `dt` (constant `TICK = 1/32`), `world.tick++` | `HamletScene.ts`, `engine/simulate.ts`, `constants.ts`, `world/world.ts` (+`tick`) | `rules.ts`: N ticks give the same `world.time` on three engines; the existing tests still pass (dt-dependent expectations re-baselined once) |
| 2 | `rng` into `World` (get/set the PRNG state; `seedRandom` writes `world.rng`) | `world/world.ts` | save then restore -> next 5 `random()` equal |
| 3 | `stateHash(): number` (FNV-1a over the list in section 2) | new `world/hash.ts` | same hash for the same ticks on interpreter, AOT, QuickJS (extend `tests/t1/hamlet.sh`); changes after one `applyTool` |
| 4 | Replace `Math.hypot` by `sqrt(dx*dx+dy*dy)` in `walk`; give the sim an integer `hash` for `generate` (or save terrain) | `engine/path.ts`, `world/world.ts` | golden hash of `generate(seed)` for 20 seeds, three engines |
| 5 | `Command` type + `submit(cmd)` + `advance()`; `HamletScene.act` calls `submit` (execute at the current tick) | new `rules/commands.ts`, `HamletScene.ts`, `rules/build.ts` untouched | rules test: `applyTool` vs `submit` equal state and hash; invalid command leaves hash unchanged |
| 6 | Command log recorder (text lines `tick,kind,a,b`) and replay function; replay of a recorded session reproduces the final hash | new `rules/replay.ts` | convert `tests/data/hamlet/session.input` run to a log; replay on three engines = same final hash |
| 7 | Save `H2` (adds `tick`, `rng`, people, deer; `H1` still loads); `save.ts` split into `snapshot()/restore()` (pure, no `zinc:storage` import) and `saveGame/loadGame` (storage) so the server can use them | `world/save.ts` | snapshot -> restore -> hash equal; run 200 more ticks on both -> hashes equal; H1 fixture still loads |
| 8 | Keep `Math.random` only in the scene (new-village seed), assert nothing in `src/engine|rules|world` uses `Math.random`/`Date` | grep check in `rules.ts` or a T0 shell test | the grep test |

Deliberately NOT built now:
- no network code, no server, no accounts, no WebSocket in the client;
- no input delay or rollback (D = 0 in single-player);
- no trade, mailbox, market, goods list, barracks, units, battle map;
- no integer/fixed-point rewrite of positions;
- no delta/diff save format, no binary protocol, no worker per room;
- no cross-CPU proof (x86, Pi): deferred to the cross-platform pass, one line in `backlog/later.md`.

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Last-bit float difference across CPUs/libm/FMA | Hash mismatch between client and server | Only IEEE basic ops in the sim (item 4), `-ffp-contract=off` in AOT, hash checks + snapshot repair (hybrid makes it non-fatal); integer sim as last resort |
| Hash of AOT vs interpreter differs through number typing (`u32`/`i32` vs double in `random()`) | Silent divergence | Item 3 test on all three engines; it is cheap to run |
| Save lacks live state (H1) | Server cannot resume or verify a town | `H2` before any network code |
| Variable dt in the scene today | Every trace differs between runs | Item 1 first |
| Battle with an offline defender | War blocked | Scripted defender AI over the same command interface, auto-resolved |
| Server catch-up cost for many towns | CPU | 144-tile sim, cap on ticks, run on login only |
| Auth done badly | Account takeover | Vendored KDF, TLS, tokens hashed at rest; first version invitation tokens only |
| Pi 3B+ capacity for 30 friends | Latency | Rooms are tiny command relays; measure later with `tools/bench-http`-style load, not now |
| Sim grows (economy, units) and silently adds `Map`, sort, `Math.sin` | Desync | Item 3 hash test in T1 plus a lint-style grep (item 8) |
| `zinc:net` vs `zinc:socket` WebSocket server overlap | Choice | Use `zinc:net` `serve` (HTTP + WS on one port, same limits and TLS); `zinc:socket` is the client |
| Engine gaps found while building | Workarounds banned (AGENTS.md) | Fix in the engine with a test; open as `New-task: blocks` |

Open questions for the owner-less loop (decided here): JSON/WebSocket over binary; hybrid recommendation; terrain saved with the town. Reversible all.
