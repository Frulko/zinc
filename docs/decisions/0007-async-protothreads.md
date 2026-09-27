# 0007 — async/await and generators as stackless frames

**Choice.** Each async function (and generator) becomes a heap frame struct holding its parameters, locals and awaited
promises; `step()` is the body wrapped in `switch (state)` with a `case` after each await/yield (Duff's device). All
locals live in the frame, so no declaration is jumped over. Awaiting always yields through the microtask queue,
which reproduces Node's ordering on the conformance suite.

**Consequences.** No per-coroutine stacks (fits 2 MB consoles). Awaits must appear as statements, initializers,
assignments or returns (not in loop conditions or short-circuit branches); the compiler reports the others.
