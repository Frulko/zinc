---
name: zinc-app
description: Build, extend or simplify Zinc applications in this repository, with readable code and deliberate reuse of the existing std, plugins and app services. Applies to Zinc app implementation and app refactoring; use zinc-demo alongside it for examples.
---

# Write a Zinc app people can read

Work from the repository root. Read its `AGENTS.md`, binding documents and the target app's instructions once. Preserve the user's requested behavior and scope.

## Find the implementation before writing one

Read [the reuse map](references/reuse-map.md) for the capabilities the task needs, then inspect the actual provider and a working consumer. Search `lib/std/`, `lib/modules.d.ts`, `src/frontend/modules.cpp`, `plugins/`, `app/`, and `examples/`. A provider can already exist inside a demo; absence from a plugin list does not mean it is missing.

Keep a brief need → provider → remaining gap note in the work notes or update. Do not create a report for a trivial edit. Verify exports, ownership and errors rather than guessing an API from its name. In particular, a Sonos app uses `zinc:sonos`; signing, form encoding, paths and image ownership each already have providers.

Choose the smallest complete implementation:

- Reuse the existing module and its conventions first.
- Keep genuinely app-specific policy local: validation ranges, retry decisions, recovery, navigation, event-log contents.
- A shared extraction needs two actual consumers with the same contract. Reconcile units, error behavior, ownership, cancellation and persisted formats before moving it. Migrate those consumers and their relevant checks together when shared-code changes are in scope.
- Put a platform-neutral primitive in std, a remote/device protocol in a plugin or owned domain module, and renderer-specific behavior in its UI/stage module. Do not start a new cross-app import as the permanent public API.
- If a provider is missing, say so precisely. Do not disguise copied infrastructure as a private helper, or invent a general framework to avoid a few clear lines. Record out-of-scope needs under the repository's backlog rules.

## Think before adding structure

Take a step back before implementing: what should happen for the user, what already does part of it, and what is the smallest complete path from input to result? Identify the state and resources that path owns, and the failures it must handle. Choose an ordinary direct implementation unless a concrete constraint rules it out. Do not add a framework, dependency, interface, factory or extension point for a hypothetical future use.

Reconsider the design when the code exposes a simpler route or the initial assumptions fail. Refactor the affected responsibility instead of stacking another flag, adapter or special case over it. Stay within the requested scope; taking a step back does not authorize a repository-wide rewrite.

## Organize by responsibility

Read [the quality bar](references/quality-bar.md) when creating or substantially restructuring an app.

The entrypoint assembles the app and owns startup/shutdown. Keep network protocols, persistence, business decisions and presentation separate when they are distinct responsibilities. A module should have a clear reason to change; do not let unrelated responsibilities accumulate because the file already exists.

Put each named UI component in its own clearly named file. A screen composes imported components; it does not also define its toolbar, row, modal and settings panel. Supporting types and small private non-component helpers can stay beside the component they serve.

Create a subfolder when a feature has several related components/services, when pages own their own details, or when a flat directory makes ownership hard to find. Keep feature-only code with that feature; put genuinely reused components in the shared component area. Do not create a folder for one unrelated helper, empty scaffolding, chains of re-exports or one-file-per-statement fragmentation. Use the project's established conventions rather than imposing a new layout.

Refactor when a file mixes reasons to change, a component owns an unrelated feature, state has competing owners, duplication has the same verified contract, or a call path requires needless indirection. Split by the real boundary, not by an arbitrary line limit. A tiny app can stay tiny.

Prefer ordinary functions and typed data. Use an instance when it owns state or a resource lifetime, not just to group functions. Avoid import-time I/O and unrelated mutable globals. Keep dependencies flowing from composition to services/domain code, not from a service back into a screen.

## Make the reasoning visible in the code

Use explicit operation names: `loadPendingScrobbles` or `readSonosPlayback` explains more than `process`, `handle`, `same` or `doIt`. Name units and distinguish position, elapsed listening, timestamps and deadlines. Short loop indices and obvious local values do not need inflated names.

Write the happy path and failure paths in a readable order. Use multiple lines, named intermediate values and clear branches when they remove ambiguity. Do not compress a loop, branch, error and mutations onto one line, hide state changes in expressions or replace ordinary control flow with nested ternaries. Equally, do not extract a clear expression into a helper that merely sends the reader to another file.

Comment a non-obvious invariant, constraint, ownership rule or design choice where it matters. Explain why this behavior is necessary, not what the next statement does. If a long comment must explain tangled control flow, simplify that flow first. A module's name, public functions and order should reveal its role without a separate guided tour.

## Finish against behavior

Keep existing storage formats, private modes, signed bytes, status payloads and error behavior unless the request explicitly changes them. Keep cleanup visible for owned timers, subscriptions, sockets, child processes and images. A background poll is not a log event or a reason to redraw.

Run `zinc check` and the targeted checks that can fail because of the change. A persistent queue needs a failure/retry/acknowledgement case; offline delivery recovery does not reconstruct playback while monitoring was absent, and a lost remote acknowledgement may cause a duplicate without service idempotency; a UI change needs a real capture/interaction when relevant; a new shared contract needs representative consumers. Use the repository's engine and testing rules. Never claim a source scan, lint or skill validator proved runtime behavior.

Before finishing, step back and read the complete result as a developer who did not write it. Can they follow the input, decisions, state changes, result and cleanup? Does every requested behavior work through the real path, including loading, empty and failure states where relevant? Is there a simpler implementation with fewer moving parts? Remove unnecessary adapters, speculative options and helpers that merely rename a platform operation; fix incomplete behavior rather than hiding it behind a TODO or swallowed error.

Use the quality bar to challenge the design and the proof, not merely approve the code already written. Report concrete changes, checks and remaining limits. Tests support specific claims; do not promise bug-free code or claim an unperformed migration, deployment or hardware check.
