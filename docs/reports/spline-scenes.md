# Public Spline scenes without WebAssembly (2026-10-21)

Method: GitHub code search for `prod.spline.design/<id>/scene.splinecode` gave 257 ids; 243 downloaded (data only) to the session scratchpad `scenes/`. Each was decoded with the loader's own deserializer (`@splinetool/loader` 2.0.98, patched copy in `scene-tools/ld/`, 186 decoded) and filtered with the runtime's own wasm triggers (read from `runtime.standalone.webgl.js`): `globalPhysics.usePhysics`, `BooleanGeometry`, bevel on extrusions, `SubdivGeometry`, `Splat`, `TextGeometry`/`InputGeometry` (font fetch), game-control navmesh. 24 scenes are interactive and need none of them. Plain msgpackr does not decode them (custom ext types, shared structures); use the loader's deserializer.

| id | size | interactive features (events > actions) | geometry | wasm | text | source | licence |
|---|---|---|---|---|---|---|---|
| zBBaOmVltDuUag17 | 7 KB | MouseDown > Transition | 2 cubes, plane | none | no | milesroxas/spline | none stated |
| F5Cd4TXjxVfRX7nX | 15 KB | LookAt (eyes), Start, SetVariable, Transition | 7 spheres, 3 rects | none | no | cyu60/talking-character | none stated |
| 6ZQA4GzzFjXNeDE4 | 19 KB | MouseHover > 24 Transitions | 25 spheres | none | no | stefanreifenberg/svelte-spline | none stated |
| 4pfOWnUVkcuN7arI | 45 KB | MouseHover > 24 Transitions | 25 spheres, rect | none | no | DGREATEJ5/DGREATEJ5.github.io | none stated |
| 4LyeK5Yvi3fhB2P1 | 50 KB | LookAt, Start, Transition | 1 sphere | none | no | splashbit-projects/vancantgroup | none stated |
| OH3FelUamsexR0DI | 67 KB | MouseHover x3, Start x5, 8 Transitions | 26 vector shapes, 5 ellipses | none | no | sarahishamsaied/moonquake-map | none stated |
| XbVs02IuMqdUF0Y1 | 235 KB | MouseHover x2, MouseDown x2, LookAt, Start x6, 18 Transitions | 7 cubes, 3 spheres, 3 rects | none | no | JackyLiu13/Qiwi | none stated |
| YSTaVTAlOK8GCfs9 | 266 KB | LookAt, MouseDown, Transition, Video | 14 cubes, 7 vectors | none (Video needs a video decoder) | no | mmlngl/permit-watch | none stated |

Others kept in the scratchpad `an2.jsonl` (24 total): VKbdTRdTcIJMg19J (50 KB LookAt), HvqPxKCHYwP6z5Du (70 KB hover), bPyo53wTrYqJgajV (22 KB hover grid), Follow-only scenes (uOrI3Vv3SCBKcCmZ, Slk6b8kz3LRlKiyk) and large Instance scenes (cloners, 250 to 1000 instances).

Licence: none of the 8 repos declares a licence (GitHub `licenseInfo` null), and Spline scene files carry no author field. They are other people's work: use them as local test data in the scratchpad, never commit them; for a shipped demo, make our own scene (Pro plan) or ask the author. The two docs samples (2qM3cW5Cx15m3cJ7 cube, iEAs8HJFu91daMOq physics) are not interactive.

Caveats: the check is static (nothing rendered). Textures, video and `Particle` objects were not checked; audio/Draco not seen in these 8 (`draco` string absent in the list's NonParametric-free scenes).

Top pick: **XbVs02IuMqdUF0Y1** (235 KB): hover, mouse down, look-at and 18 state transitions on plain cubes and spheres, no wasm, no text. Smallest first test: **zBBaOmVltDuUag17** (7 KB, one MouseDown transition); next: **6ZQA4GzzFjXNeDE4** (hover grid) and **F5Cd4TXjxVfRX7nX** (look-at).

Owner, 2026-10-21: licences are not a concern while this is a test; `examples/js-spline` ships XbVs02IuMqdUF0Y1 (its MouseDown events are disabled in the scene data: `disabled: true`, so it shows LookAt and hover).
