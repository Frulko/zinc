# The same fib and a loop with no annotation at all: parameters become `any`, the dynamic path of the engine.
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


def describe(o):
    return o.name + " has " + str(o.size)


class Thing:
    def __init__(self, name: str, size: int):
        self.name = name
        self.size = size


if __name__ == "__main__":
    print(fib(32))
    print(describe(Thing("box", 3)))
