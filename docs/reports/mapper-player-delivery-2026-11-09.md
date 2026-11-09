# Prepared remote projects

Remote pairing now leaves the player's projection unchanged. The Players panel has Prepare project, Activate on this player, Cancel transfer and explicit Live follow. Live follow remains the existing low-latency editing workflow; stopping it also invalidates scheduled commands that have not fired.

Prepare copies mapping, show, saved scenes and media into an immutable sender snapshot. Each file is described by SHA-256 over the paired channel and downloaded in one-MiB HTTP ranges. Downloads use a random 192-bit ticket scoped to this snapshot, not the editor control token. A redirect is refused after response; no editor credential is sent to a redirected host. The ticket permits only snapshot reads, expires after one hour, and is released after completion/cancellation or disconnection. Four outstanding sender snapshots maximum; files are limited to 2 GiB and project JSON documents to 16 MiB each and 32 MiB together.

The receiver uses a unique isolated project directory, verifies sizes, ranges, hashes and all media references (including saved scenes), and marks it Ready only after completion. An interrupted or corrupt transfer removes its partial directory. A prepared revision is rehashed before activation. Activation calls the common `activateProject` service: device identity stays outside project paths; native validation, media reset, pointer persistence and rollback belong to that service. The sender does not send automatic state or playback updates to independent players.

Reuse: `zinc:hash.sha256File` streams native hashes; `zinc:fs.copyFile` snapshots media; `zinc:net` streams HTTP directly to files; `zinc:link` carries the authenticated manifest; existing fleet UI and command routes carry the operations. No dependency added.

References: [Resolume Media Manager](https://resolume.com/support/en/6/media-manager) keeps project copies with collected media; [MiniMad](https://docs.madmapper.com/madmapper/6/6.-outputs/minimad) separates authoring and exported player content. The preparation/activation separation is our application decision.

## Proof

- `zinc check` passed for mapper with the common project service copied from the project worker (27 files), using the existing main binary and clean std root `/tmp/zinc-mapper-exports`.
- Real localhost HTTP fixture exercised the actual `RevisionStage` source transpiled with Bun, adapting Zinc fs/hash/net APIs to Node: binary transfer, content-range, SHA-256 mismatch, path traversal, cancellation in flight, retry, and rehash failure after local modification all passed. This proves application decisions and HTTP flow, not the Zinc native transport implementation.
- Actual `fleetPlayer.ts` source with provider fixtures proved pairing does not restore mapping or copy media; independent mode rejects live commands; activation requires prepared state; queued commands are discarded after live follow stops.
- Editor type check passed with all deployment controls (46 files).
- Native transport proof passed on both the interpreter and QuickJS: a real local HTTP server supplied three ranges totaling 2,097,171 bytes (including every byte value); `saveTo` appended exactly and native SHA-256 matched. Scripts: `/tmp/mapper-native-range/run.py` and `run-interp.py`.
- Pairing an independent player leaves its clock alone too; shared clock joining happens only when live follow is explicitly enabled.

## Limits and proposed tests

Copies and hashes now run in a Zinc worker, including receive verification and the final verification before activation. Source preparation is serialized; a changed source is refused instead of publishing a mixed revision. On an engine without workers, preparation fails visibly rather than running expensive copies on the projection thread. Ready cleanup keeps the active project, the pending ready project and one previous revision; only marked application-owned directories are eligible. Offers expire after one hour, and expired marked leftovers are removed on the next preparation. No real two-machine deployment, Android media-root switch, native restart recovery or physical projection proof was performed in this worker.

Proposed tests: two real paired players, prepare during playback, disconnect/retry, activate then restart (about 2 min, media-dependent disk and decoder memory); native HTTP transport same range/corruption cases (about 10 s); UI capture and keyboard interaction across online/transfer/ready/error states (about 30 s).


## Reliability pass

Preparation accepts malformed manifests as a reported failure (including null), not an unhandled rejection. Cancellation and disconnect invalidate in-flight work. Activation carries the confirmed transfer ticket and verifies both the ticket and the current paired session again after asynchronous hashing. Sender operations carry a generation too, so a completed copy from a closed channel cannot update a reconnected player. A connected player's active project path is distinct from its pending revision path.

Updated HTTP/provider fixtures additionally passed active-project retention during a second failed preparation, null manifests, stale activation tickets, asynchronous verification, and bounded cleanup of marked inactive revisions. Unknown directories and symlinked owner markers are not cleaned. Native snapshot worker proof passed with the real `fleetSnapshot.worker.ts`: a 2,097,171-byte copy and its SHA-256 matched, on both the interpreter and QuickJS. The current engine supports QuickJS workers despite the older iPod comment. Final mapper check passed (27 files).

Activation also exits live-follow mode on both machines. The sender stays in an explicit Activating phase until the matching completion acknowledgement, so an old Ready status cannot unlock Live follow during an asynchronous rehash. The receiver ignores Live toggles while verifying and stops live mode again immediately before switching. A delayed clock join is discarded when live mode has stopped. Actual-source provider fixtures (`/tmp/mapper-player-activation-race.cjs`, `/tmp/mapper-master-activation-race.cjs`) passed delayed-hash toggles, stale status/ack rejection, independent playback after activation, and explicit live follow after completion. Mapper type check passed again.

Opening another local project invalidates the current live-follow generation using the shared `projectEpoch`. Incoming state/media/video commands, scheduled commands and late clock joins cannot touch that new project. Stop followed by start also creates a fresh live generation, so old queued work cannot revive. Status carries the player's effective live mode with its request number; the master ignores status from before its latest toggle and persists a receiver-initiated stop. Actual-source fixtures passed project-epoch changes, stop/start command and clock races, stale live-status rejection, and explicit restart on the new project (`/tmp/mapper-player-project-epoch.cjs`). No provider or project-service code was changed for this correction.
