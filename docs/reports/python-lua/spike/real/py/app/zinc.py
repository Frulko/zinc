"""What a generated `zinc` package looks like: plain Python over the bridge."""
import _zinc
call, ref = _zinc.call, _zinc.ref


def clear(c): call(1, c)
def rect(x, y, w, h, c): call(2, x, y, w, h, c)
def text(x, y, s, c=0xffffff, size=1): call(3, x, y, c, size, 0, s)
def width(): return call(4)
def height(): return call(5)
def on_frame(f):
    call(6, ref(f))
    return f


class Signal:
    def __init__(self, v): self.id = int(call(20, v))
    def __call__(self): return call(21, self.id)
    def set(self, v): call(22, self.id, v)


def View(*kids, class_name=""):
    n = call(10, 0)
    if class_name: call(11, n, 0, 0, 0, 0, class_name)
    for k in kids: call(12, n, k)
    return n


def Text(value, class_name=""):
    n = call(10, 1)
    if class_name: call(11, n, 0, 0, 0, 0, class_name)
    if callable(value): call(14, n, ref(value))
    else: call(13, n, 0, 0, 0, 0, str(value))
    return n


def Button(label, on_click): return call(15, ref(lambda _: on_click()), 0, 0, 0, 0, label)
def render(app): call(30, ref(lambda _: app()))
def on_tick(f): call(31, ref(f))
