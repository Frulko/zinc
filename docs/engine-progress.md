# Engine implementation progress

Work proceeds in this order. A passing subset is not completion of a stage.
Only engine-related changes are committed; unrelated working-tree edits stay outside these commits.

| Stage | Status | Remaining acceptance criteria |
|---|---|---|
| 1. VM language and memory | In progress | Remaining demo string/reduction operations, typed-array dynamic values, native async control flow and documented lifetime semantics; compare native, interpreter, JIT and QuickJS |
| 2. Common native ABI | Partial baseline | General arrays/nested records/record arguments, mutable buffer ownership, resource-valued callbacks, asynchronous completion and cancellation |
| 3. Native services and application host | Partial baseline | Missing module/display adapters, exit behavior, deterministic guest timers, UI/input/replay parity |
| 4. Embedded ScriptEngine | Partial C API | Source compilation and dynamic-value/function/promise bridge behind existing ScriptEngine contract |
| 5. Tooling | Partial baseline | Source locations/stacks, debugger/inspector, reload state, native transitive dependency export, profiler stage attribution |
| 6. Demo and performance acceptance | Partial baseline | Rebuild/run/capture all demos on final code, interaction replays, representative UI benchmarks, Linux validation |
| 7. JIT optimization and targets | Baseline AArch64 | Across-call register allocation, hot compilation/tiering, optimizing tier and additional architectures |

## Current work

Current stage 1 work covers the remaining string/array operations exposed by demos, dynamic typed-array payloads,
and native async control flow. Committed batches include generic inheritance, stable sort, array queues, string
parsing/formatting, instanceof and the public generator protocol with inputs, delegation and suspendable finally.
Each batch receives a four-mode comparison. The common suite passed at `0afe934`; later additions have focused
checks while the next complete run is pending. Twelve existing conformance programs also passed in native and
sim on an isolated archive of `aa70e4e`, without updating goldens.

The last complete build audit had 5 of 58 VM demos building; subsequent changes have moved their first language
failures forward. A new full audit is pending. ABI arrays/promises, modules and display adapters still prevent
full application parity.
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
node compiler/bin/zinc.mjs run tests/engines/collections.ts --engine zinc-vm --jit
node compiler/bin/zinc.mjs run tests/engines/generator-close.ts --engine quickjs
node tests/engines/run.mjs
node tests/engines/embedded.mjs --sanitize
```

JIT requires AArch64. Windowed graphics uses SDL3; `--headless` selects the null HAL, with real rasterization for captures.
The graphics fixture intentionally leaves a distant timer pending to verify shutdown when the frame budget ends.
Full UI support in the VM is not implied by the QuickJS forms example.

Detailed contracts, limitations and dated measurements: [engines.md](engines.md).
