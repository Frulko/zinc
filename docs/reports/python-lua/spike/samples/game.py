from zinc.gfx import on_frame, clear, rect, text, width, height


class Ball:
    def __init__(self, x: float, y: float, vx: float, vy: float, color: int):
        self.x = x
        self.y = y
        self.vx = vx
        self.vy = vy
        self.color = color

    def update(self, dt: float) -> None:
        self.x += self.vx * dt
        self.y += self.vy * dt
        if self.x < 0 or self.x > width() - 12:
            self.vx = -self.vx
        if self.y < 0 or self.y > height() - 12:
            self.vy = -self.vy


balls: list[Ball] = []
for i in range(40):
    balls.append(Ball(10.0 + i * 6, 20.0 + i * 3, 30.0 + i * 2, 80.0 - i, 0x4080c0 + i * 0x030503))


@on_frame
def frame(dt: float) -> None:
    clear(0x101820)
    for b in balls:
        b.update(dt)
        rect(b.x, b.y, 12, 12, b.color)
    text(4, 4, f"{len(balls)} balls, written in Python", 0xffffff, 1)
