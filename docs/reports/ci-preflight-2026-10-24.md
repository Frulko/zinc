# Release failures and checks before release

Evidence: [v0.7.1 run 39998352254](https://github.com/Frulko/zinc/actions/runs/39998352254), commit `8a2af1e0533ba3aba666ec630550c9950ba2bd14`.

The run lasted 103 minutes, from 17:50 to 19:33 UTC. Its test artifacts contain 530 PASS, one FAIL and 31 SKIP results. The publication gate correctly refused the failing tests; no release was published.

- `lint` failed in four seconds. The fixture expected 14 findings, but the standard library now imports SVG through icons, adding a legitimate plugin-target warning on ESP32. The text golden, JSON count and warning count were stale. The current hero matrix needs the same extra warning on its unsupported targets.
- The experimental Windows package also failed: its installed CLI could not compile the SVG plugin because the archive omitted `libzinc.dll.a`. The build directory had it; the packaging copy filter selected only the executable and DLLs. Both Windows archives now include the import library. The runner also reported a broken Strawberry Perl `pkg-config`; this is separate from the explicit missing-import-library error and remains unverified on Windows.
- Shard 5 recorded `splash` at 3,724 seconds (62 minutes). Other shards spent 11–26 minutes running tests. The shared arm64 build took almost 16 minutes, and runner queues delayed some shards by another 22 minutes. The successful splash test discarded its output, so its exact slow subcommand cannot be established retrospectively. At the owner's request, `tests/t1/splash.sh` and its affected-test mapping were removed; the splash feature remains in the engine.

`make preflight` builds `zinc` and the native binaries T0 needs incrementally, then runs T0 with `--fail-fast`. The 200 T0 checks in the failed hosted run totalled 528 seconds across shards. The check stays opt-in, at the owner's request to stop tests and re-release; `make release` does not launch it automatically. `release-dry` remains a notes preview. `make preflight BASE=vX.Y.Z` instead checks tests affected by committed changes since that ref.

The existing affected-test selector was unreachable from normal CI triggers because manual runs always requested full checks. A manual `mode=changed` now requires an explicit base ref and runs affected tests without packages, benchmarks, reproducibility, fuzz or cross builds:

```sh
gh workflow run zinc-next --ref develop -f mode=changed -f base=vX.Y.Z
```

Use the last **published** release tag, not an unsuccessful tag or `main` after an unsuccessful release. Manual runs default to `full`; tag refs always retain full validation, including a manual run on a tag. Shared core changes still select all T0/T1 tests conservatively.

The owner stopped local validation to re-release. Scope tests, workflow validation and regression checks passed earlier; the full preflight was interrupted. These checks cannot guarantee every package or platform passes, or bound GitHub runner queues. Removing the splash test also removes its dedicated regression coverage. No workflow dispatch, push, release or cross-platform build was performed in this session.
