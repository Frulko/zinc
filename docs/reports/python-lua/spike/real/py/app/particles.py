"""numpy computes, Zinc draws: 2000 particles a frame, all rects crossing the bridge."""
import time

import numpy as np

import zinc

N = 2000
rng = np.random.default_rng(1)
pos = rng.random((N, 2)) * [zinc.width(), zinc.height()]
vel = (rng.random((N, 2)) - 0.5) * 80
frames = []


@zinc.on_frame
def frame(dt):
    global pos, vel
    t = time.perf_counter()
    pos += vel * min(dt, 0.05)
    box = np.array([zinc.width(), zinc.height()])
    vel = np.where((pos < 0) | (pos > box), -vel, vel)
    t2 = time.perf_counter()
    zinc.clear(0x101820)
    for x, y in pos.tolist():
        zinc.rect(x, y, 2, 2, 0x60c0ff)
    zinc.text(4, 4, f"{N} particles, numpy {np.__version__}")
    frames.append((t2 - t, time.perf_counter() - t2))
    if len(frames) == 60:
        print(f"per frame: numpy {sum(f[0] for f in frames) / 60 * 1000:.2f} ms, draw {sum(f[1] for f in frames) / 60 * 1000:.2f} ms", flush=True)
