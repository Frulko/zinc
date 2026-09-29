# Engine implementation progress

Work proceeds in this order. A passing subset is not completion of a stage.
Only engine-related changes are committed; unrelated working-tree edits stay outside these commits.

| Stage | Status | Remaining acceptance criteria |
|---|---|---|
| 1. VM language and memory | In progress | Collection operations, destructuring, typed maps/sets, accessors/bound methods, promises/generators and documented lifetime semantics; compare native, interpreter, JIT and QuickJS |
| 2. Common native ABI | Partial baseline | General arrays/nested records/record arguments, mutable buffer ownership, resource-valued callbacks, asynchronous completion and cancellation |
| 3. Native services and application host | Partial baseline | Missing module/display adapters, exit behavior, deterministic guest timers, UI/input/replay parity |
| 4. Embedded ScriptEngine | Partial C API | Source compilation and dynamic-value/function/promise bridge behind existing ScriptEngine contract |
| 5. Tooling | Partial baseline | Source locations/stacks, debugger/inspector, reload state, native transitive dependency export, profiler stage attribution |
| 6. Demo and performance acceptance | Partial baseline | Rebuild/run/capture all demos on final code, interaction replays, representative UI benchmarks, Linux validation |
| 7. JIT optimization and targets | Baseline AArch64 | Across-call register allocation, hot compilation/tiering, optimizing tier and additional architectures |

## Current work

Three coordinated workers handle stage 1: array methods, global destructuring, and promise recovery/finalization/adoption.
Each completed batch receives focused checks and an individual commit after integration.

## Already testable

From the repository root:

```sh
node compiler/bin/zinc.mjs run tests/engines/graphics.ts --engine native
node compiler/bin/zinc.mjs run tests/engines/graphics.ts --engine zinc-vm
node compiler/bin/zinc.mjs run tests/engines/graphics.ts --engine zinc-vm --jit
node compiler/bin/zinc.mjs run tests/engines/graphics.ts --engine quickjs
node compiler/bin/zinc.mjs run examples/ui/forms --engine quickjs
node compiler/bin/zinc.mjs capture tests/engines/graphics.ts --engine zinc-vm --frames 2 --out build/engine-shots
node tests/engines/run.mjs
node tests/engines/embedded.mjs --sanitize
```

JIT requires AArch64. Windowed graphics uses SDL3; `--headless` selects the null HAL, with real rasterization for captures.
The graphics fixture intentionally leaves a distant timer pending to verify shutdown when the frame budget ends.
Full UI support in the VM is not implied by the QuickJS forms example.

Detailed contracts, limitations and dated measurements: [engines.md](engines.md).
