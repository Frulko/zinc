"""A real Python program: pip modules, the stdlib, dynamic Python and Zinc's UI in one process."""
import time as _t
_start = _t.perf_counter()
import os
import sys
import threading
import time

import humanize        # pip, pure Python
import numpy as np     # pip, C extension

import zinc

samples = zinc.Signal(0)
data = np.empty(0)


class Meta(type):      # all of this is what a static compiler refuses
    def __getattr__(cls, name): return f"dynamic {name}"


class Stats(metaclass=Meta):
    pass


Stats.added_later = eval("6 * 7")


def add(n=250_000):
    global data
    data = np.concatenate([data, np.random.default_rng(42).normal(10.0, 2.0, n)])
    samples.set(len(data))


def summary():
    n = int(samples())   # reading the signal inside the effect subscribes this text to it
    return f"{humanize.intcomma(n)} samples, mean {data.mean():.2f}, std {data.std():.2f}" if n else "no data yet"


background = []
threading.Thread(target=lambda: background.append(sum(range(100_000))), daemon=True).start()


def bench():
    t = time.perf_counter()
    for _ in range(200_000):
        zinc.call(0)
    return (time.perf_counter() - t) / 200_000 * 1e9


def App():
    return zinc.View(
        zinc.Text(f"Python {sys.version.split()[0]}, numpy {np.__version__}", class_name="text-gray-400"),
        zinc.Text(summary, class_name="text-2xl font-bold text-white"),
        zinc.Text(f"{Stats.anything}, {Stats.added_later}", class_name="text-gray-400"),
        zinc.Button("Add samples", add),
        class_name="w-full h-full items-center justify-center gap-4",
    )


print(f"imports: {(_t.perf_counter() - _start) * 1000:.0f} ms", flush=True)
print(f"boundary: {bench():.0f} ns per call from Python into compiled Zinc", flush=True)
add()
add()
if os.environ.get("DEMO") == "particles":
    import particles
else:
    zinc.render(App)
    if os.environ.get("AUTO"):   # headless proof of reactivity: Python changes the signal, the text follows
        zinc.on_tick(lambda dt: add() if int(samples()) < 2_000_000 else None)
if os.environ.get("BENCH_RSS"):
    import resource
    print("rss MB", resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1048576, flush=True)
