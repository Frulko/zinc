# 3d/orbit

A ringed gas giant lit by a far sun, with three moons on their orbits, a wheel space station with glowing windows, an asteroid belt and
a star field. All of it is drawn by `zinc:3d` with a 2D readout over the 3D view. On a console with a GPU renderer (PSP GE, 3DS PICA200,
PS Vita GXM) the 3D runs on the GPU; elsewhere it runs in software. The same program runs unchanged on a desktop, the PSP, the PS Vita
and the Nintendo 3DS. On the 3DS's top screen it is drawn per eye when the 3D slider is up.

What it uses of `zinc:3d`:
- a runtime texture painted with `zinc:gfx` (the planet's bands);
- vertex colours (rings, belt, stars);
- smooth, flat and unlit shading;
- specular highlights (the ice moon, the station);
- emissive lights (the windows);
- alpha blending (the rings) and additive blending (the sun's glow);
- two directional lights and the ambient light;
- child nodes (the station).

## Run it

```sh
zinc run examples/3d/orbit                                   # desktop window, 960x544 (the Vita's screen)
zinc pack --profile psp examples/3d/orbit -o orbit.zapp      # then tools/build-console-core psp --embed program.zbc resources.bin
```

The pad: the stick or the d-pad orbits the camera, L / R zoom, Start goes through the views (the system, the rings close up, following
the station), Triangle (Y) hides the readout. On a desktop: the arrow keys, and the keys zinc:gfx maps to L, R, Start and Y.
Left alone, the camera drifts slowly around the planet.

The readout shows:
- frames per second;
- the mean time of `render()`;
- the triangles drawn;
- who draws (GPU or CPU);
- the view.

## What to look at

| File | Role |
| --- | --- |
| `src/main.ts` | the frame loop: input, animation, one render per eye, the readout |
| `src/scene.ts` | the scene: materials, lights, the planet's painted texture, the moons and the station, their motion |
| `src/meshes.ts` | the meshes zinc:3d has no generator for: rings, asteroid belt, star field (one draw each) |
| `src/view.ts` | the orbit camera, its views and the per-eye offset of the 3DS's stereoscopic screen |
| `src/input.ts` | gamepad 0 and zinc:gfx's buttons |
| `src/hud.ts` | the readout, rebuilt twice a second (no string per frame) |
| `src/constants.ts` | sizes, speeds, colours, the light |

## Console notes

- About 2,300 triangles a frame.
- On the 3DS with the slider up, every frame is drawn twice, once per eye. The world moves on the left eye's frames only.
- The test is `tests/t1/zinc3d_orbit.sh`: the desktop session, the views and the readout.
