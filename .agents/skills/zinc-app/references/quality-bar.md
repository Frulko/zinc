# App quality bar

Use this to inspect a real change, not to generate a score or a boilerplate checklist in the final answer. Existing repo rules and the user's choices take precedence.

| Question | Evidence to look for |
| --- | --- |
| Does the code exist for a requested behavior? | Each new option, wrapper and service has a current caller and a purpose. |
| Was the existing implementation actually read? | Std/plugin export and a working caller; search app/demo services too. |
| Can a reader follow the app? | Entrypoint shows assembly/lifetime; modules have named responsibilities; data flows in an explicit direction. |
| Can each file be described by one responsibility? | Unrelated protocol, storage, business and UI changes do not converge in one file; feature folders make ownership easier to find. |
| Is component ownership easy to navigate? | Each named UI component has its own file; screens compose imports; feature-only children stay with their feature. |
| Does a name tell the truth? | Units, owned/borrowed handles, retries, queue acceptance and token comparison have precise meanings. |
| Are state and effects owned? | The service that starts a resource can stop it; imports do not open sockets or write user files. |
| Was policy preserved during reuse? | Units, rejected/accepted results, private permissions, unknown config keys, signed bytes and recovery rules were compared. |
| Is output useful? | New track, pause, failure or acknowledgement is an event; position increments and unchanged topology are silent. |
| Is the code readable without a tour? | One visible action per statement; branches and cleanup are not hidden in dense one-liners or chains of pass-through helpers. |
| Is the implementation complete? | The actual user path works, including relevant loading/empty/error states, recovery and cleanup; no placeholder or swallowed failure substitutes for behavior. |
| Has the approach been challenged? | The solution is compared with the simplest direct path; observed complexity triggers a local rethink rather than another layer. |
| Does the proof exercise the risk? | Old-file load, failed writes, retry/ack, stale responses, image release, idle or actual interaction as applicable. |

## Recognizable failures

- A `secret()` function that converts random bytes to hex copies `zinc:web.toHex`. Use the byte source and existing encoder directly where the token is owned.
- A helper called `same` may compare secrets, compare game controls or report a test assertion. Search its callers before sharing it. A TS XOR loop is not proof of constant-time native execution.
- `response()` returning native `zinc:net.Reply` is not replaceable by web `Response.json` without a type/transport change. A small clearly named JSON-reply builder belongs with the HTTP routes; it does not justify a server framework.
- Configuration defaults and an offline outbox have different failure policies. A convenience reader that returns defaults on every error can silently destroy history.
- Offline recovery is not exactly-once delivery. State what was observed, what was persisted, and what can be replayed after a lost remote acknowledgement.
- A screen, its toolbar, list row and dialog defined in one file conceal separate component responsibilities. Move those components to named files, with feature-local children grouped under the feature. Types and small non-component helpers may stay local.
- A flat directory containing several independently evolving features is a sign to group related files; a deep hierarchy with only forwarding files is the opposite problem.
- Comments should preserve a useful reason or invariant. Repeating each statement in prose does not make unclear code understandable.
- More files are not automatically better architecture. Moving a block unchanged into `utils.ts`, or introducing classes with no owned state, makes the route harder to follow.
- Shorter source is not automatically simpler. A named branch with separate mutations can be easier to read than a single nested expression.

Do not substitute numeric limits for judgment. Split a large module when responsibilities diverge; do not split a cohesive function just to meet a line target. A test should fail when behavior breaks, not when a private function is renamed or a file moves.
