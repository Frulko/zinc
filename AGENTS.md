# Working on Zinc

The engine work lives in `next/`. The binding rules are `next/RULES.md`, `next/ARCHITECTURE.md` and `next/TESTING.md`; the state of the work is `next/RESUME.md`.
`/loop /zn-start` runs the backlog one task at a time, `/zn-end` closes a task.

## Decide alone: the owner is not at the keyboard (owner, 2026-10-10)

Never ask the owner to choose, confirm or approve a design or technical decision: nobody is there to answer, and a question stops the loop.

- Think it through, then look for the answer: the docs (`next/RULES.md`, `docs/reports/`, the decision records in `docs/reports/zinc-next-decisions.md`, the task and its linked reports), the prototype's code and behaviour, and how the reference tools the owner chose solve it (React Native and Expo, Nuxt UI, Tauri and Electron, three.js, the libraries named in `docs/reports/parity/04-library-choices.md`...).
- Pick the best option (score it as `next/RULES.md` §4 says when it matters), write the choice and why in the task notes or a decision record, and go on. A reversible choice is made at once.
- Only an irreversible or outward-facing step (publishing, pushing, deleting data, spending money, sending a message) waits for the owner: do everything up to it and leave the exact command in the task notes.

## Move fast: finish tasks, prove only what changed (owner, 2026-10-10)

The goal of a session is progress on the backlog: finish tasks, improve and complete the engine. Tests exist to prove a change, not to fill the session.

- Before running a test, ask what it proves. If your change cannot make it fail, do not run it.
- End of a task: the task's own test (`next/tests/run --only <name>`) and the few tests that cover the files you touched. Run `tests/run --changed` only when it maps to a handful of tests; when it falls back to the whole tier, pick the relevant tests yourself.
- End-to-end runs (full T1, T2, the demos, `examples_all`, the WebGL conformance, benchmarks, fuzz) belong to large milestones or to changes in the shared core (IR, runtime, raster, layout, text). Start them in the background and keep working; never wait for them.
- A command that runs for more than a minute is a background job. Do not re-run a suite that already passed for code you did not touch, and do not re-verify what you already checked in the session.
- Known failures recorded in `next/RESUME.md` and the backlog (machine, GPU or architecture specific) are not investigated again during an unrelated task.
- Build only the target you need (`cmake --build build --target zinc`), never the whole tree for a change in one library.
- Be critical and pragmatic: one targeted check that can fail beats a sweep of 300 tests that cannot.
