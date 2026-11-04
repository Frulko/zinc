# The real Quill demos, on the tablet

The demos of [Quill](https://github.com/MaximeRivest/quill) (MIT) and `drawlab` of [inkwordle](https://github.com/Rkcr7/inkwordle) (GPLv3), built from upstream's source at a pinned commit and unmodified, with a menu to start each one and a band on top to leave it. The reference for [`quill-lab`](../quill-lab), which rewrites the same demos in Zinc: compare the two to see what Zinc's pipeline costs.

```sh
./build.sh                                                   # needs Docker and the SDK of integrations/remarkable-ink
scp -O -r dist/quill-originals root@10.11.99.1:/home/root/xovi/exthome/appload/
```

Then AppLoad, reload, **Quill (vrais binaires)**. It stops xochitl: save first, the open notebook view is lost. The lease allows 2 xochitl restarts per 10 minutes and 60 s between sessions; it refuses a launch beyond that and says when.

**Leaving:** the band of a demo goes back to the menu, **Quitter** in the menu ends the session. **Power held 2 s always ends it** and brings xochitl back, whatever a demo does; 30 minutes at most.

| File | Role |
| --- | --- |
| `src/home.c` | the menu, one row per line of `demos.txt`; exits 42 with the chosen row |
| `src/bar.c` | `LD_PRELOAD` into a demo: stamps the band before each swap, ends the demo on a finger in the band, ignores `EVIOCGRAB` so the demo's grab does not hide the touch panel |
| `src/lab.h` | the 5x7 font and the touch reader of both |
| `session.sh` | under the lease: menu, demo, menu... |

The demos' code and timing are untouched, but each one has its top 110 px under the band. `TOUCH_FLIPX=1` / `TOUCH_FLIPY=1` in `session.sh` turn the touch mapping if a tap lands elsewhere; every tap is logged (`journalctl -u zinc-lease`).

This is a tool for a test, not the model of an app: an app is a Zinc app under the lease ([docs/targets/remarkable-paper-pro.md](../../../docs/targets/remarkable-paper-pro.md)).
