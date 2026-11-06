import math
import sys


def fib(n: int) -> int:
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


def mandelbrot() -> int:
    w: int = 400
    h: int = 400
    checksum: int = 0
    for py in range(h):
        y0: float = (py / h) * 3.0 - 1.5
        for px in range(w):
            x0: float = (px / w) * 3.0 - 2.0
            x: float = 0.0
            y: float = 0.0
            n: int = 0
            while x * x + y * y <= 4.0 and n < 200:
                xt: float = x * x - y * y + x0
                y = 2.0 * x * y + y0
                x = xt
                n += 1
            checksum += n
    return checksum


class Body:
    def __init__(self, x: float, y: float, z: float, vx: float, vy: float, vz: float, mass: float):
        self.x = x
        self.y = y
        self.z = z
        self.vx = vx
        self.vy = vy
        self.vz = vz
        self.mass = mass


def nbody(steps: int) -> float:
    sm: float = 4.0 * math.pi * math.pi
    d: float = 365.24
    bodies: list[Body] = [
        Body(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, sm),
        Body(4.84143144246472090e+00, -1.16032004402742839e+00, -1.03622044471123109e-01, 1.66007664274403694e-03 * d, 7.69901118419740425e-03 * d, -6.90460016972063023e-05 * d, 9.54791938424326609e-04 * sm),
        Body(8.34336671824457987e+00, 4.12479856412430479e+00, -4.03523417114321381e-01, -2.76742510726862411e-03 * d, 4.99852801234917238e-03 * d, 2.30417297573763262e-05 * d, 2.85885980666130812e-04 * sm),
        Body(1.28943695621391310e+01, -1.51111514016986312e+01, -2.23307578892655734e-01, 2.96460137564761618e-03 * d, 2.37847173959480950e-03 * d, -2.96589568540237556e-05 * d, 4.36624404335156298e-05 * sm),
        Body(1.53796971148509165e+01, -2.59193146099879641e+01, 1.79258772950371181e-01, 2.68067772490389322e-03 * d, 1.62824170038242295e-03 * d, -9.51592254519715870e-05 * d, 5.15138902046611451e-05 * sm),
    ]
    n: int = len(bodies)
    for s in range(steps):
        for i in range(n):
            a: Body = bodies[i]
            for j in range(i + 1, n):
                b: Body = bodies[j]
                dx: float = a.x - b.x
                dy: float = a.y - b.y
                dz: float = a.z - b.z
                d2: float = dx * dx + dy * dy + dz * dz
                mag: float = 0.01 / (d2 * math.sqrt(d2))
                a.vx -= dx * b.mass * mag
                a.vy -= dy * b.mass * mag
                a.vz -= dz * b.mass * mag
                b.vx += dx * a.mass * mag
                b.vy += dy * a.mass * mag
                b.vz += dz * a.mass * mag
        for k in range(n):
            c: Body = bodies[k]
            c.x += 0.01 * c.vx
            c.y += 0.01 * c.vy
            c.z += 0.01 * c.vz
    return bodies[0].x


if __name__ == "__main__":
    print(fib(32))
    print(mandelbrot())
    print(nbody(600000))
