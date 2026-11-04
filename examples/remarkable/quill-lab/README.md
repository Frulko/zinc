# Quill Lab

Every demo of [Quill](https://github.com/MaximeRivest/quill) (MIT) rewritten in Zinc, in one app: `RemarkableBar` and its Quitter on top, a selector of eleven demos, the running demo below. It shows what a Zinc app can do on the Paper Pro's panel. For Quill itself, the unmodified programs are in [`quill-originals`](../quill-originals).

```sh
zinc run examples/remarkable/quill-lab                       # macOS: e-ink emulator at 1620x2160, the mouse is the pen
QUILL_LAB_DEMO=8 zinc run examples/remarkable/quill-lab      # opens on one demo
zinc export examples/remarkable/quill-lab --target rmpp      # dist/quill-lab-rmpp, then its deploy.sh
```

The app runs as an ink session (`"ink": "session"`): xochitl stops and comes back when you quit. The raw modes of *Modes comparés* exist only there; under qtfb the same pictures appear in the UI waveform.

| Demo | Quill's program | What differs here |
| --- | --- | --- |
| Encre | `scribble.c` | `zinc:ink` tools, through the frame diff |
| Trace fugace | `vanishing_trail.c` | a segment lives 1.2 s, not 11 samples |
| Carte du Maraudeur | `map_demo.c` | same idea, other rooms; a walk of 6 footprints |
| Fondu par zones | `image_anim_demo.cpp` | a coarser mask (3 px cells) drawn over the picture |
| Vidéo 12 i/s | `gif_demo.cpp` | a baked sprite strip of a sphere, no GIF decoder; 12 i/s is the target, not a measure |
| Image N&B, Image couleur | `image_demo.cpp`, `color_image_demo.cpp` | dithered once on the host (`assets/make_assets.py`), no fit options |
| Couleurs, Modes comparés, Patchs partiels, Transparence | the `color_*` probes | no command-line options |

Pictures: `great-wave.jpg` is Hokusai's print (CC0, see [museum-table](../../museum-table/LICENSES.md)). `icon.svg` is Lucide's `feather` (ISC).

`src/main.tsx` is the shell; `src/demos/` holds the demos by theme. Test: `tests/run --only quill_lab` (the real driver on a stand-in engine; only the tablet proves the panel).
