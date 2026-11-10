# process plugin (`zinc:process`)

Child processes for tools that drive other programs (build a project, run a deploy script, tail a log): spawn with
arguments, working directory and environment, stream stdout/stderr line by line on the event loop, write to stdin,
send signals, get the exit code. Targets: macos, linux, rpi1 (and sim, through Node's `child_process`). Sources:
`plugins/process/`. Examples: `examples/process/shell` (UI runner with streamed output and Kill),
`examples/process/cli` (headless self-check).

```ts
import * as proc from 'zinc:process';

// short command: everything collected
const r = await proc.run('git', ['status', '--short'], { cwd: '/path/to/repo' });
console.log(r.code, r.stdout, r.stderr);

// long-running: streamed
const p = proc.spawn('node', ['compiler/bin/zinc.mjs', 'build', 'examples/breakout'], { env: ['NO_COLOR=1'] });
p.onStdout((line: string) => { log(line); });
p.onStderr((line: string) => { log('! ' + line); });
p.onExit((code: i32) => { console.log('exit', code); });
const code = await p.exited;       // same code as a Promise
```

| API | |
|---|---|
| `spawn(cmd, args, opts): Process` | starts `cmd` (looked up in `PATH`) with `args`; throws when it cannot be started (not found, not executable, too many processes) |
| `run(cmd, args, opts): Promise<Result>` | spawn + collect: `{ code, stdout, stderr }`; the program gets no input (stdin is closed at once); rejects only when the program cannot be started (a non-zero exit resolves) |
| `SpawnOptions` | `cwd?: string` (default: the program's), `env?: string[]` of `KEY=VALUE` |
| `p.onStdout(cb)` / `p.onStderr(cb)` | each complete line, without `\n` (a trailing `\r` is removed too); a last line without newline is delivered at exit |
| `p.onData(cb(chunk, stderr))` | raw output as read from the pipes (UTF-8 sequences are never split between chunks) |
| `p.onExit(cb(code))` / `p.exited: Promise<i32>` | exit code; a process killed by a signal reports `128 + signal` (SIGTERM: 143, SIGKILL: 137) |
| `p.write(s): boolean` / `p.closeStdin()` | stdin; `write` is false once stdin is closed or the process is gone |
| `p.kill(signal = 15)` | signals the owned process group on POSIX (15 SIGTERM, 9 SIGKILL, 2 SIGINT) |
| `p.pid`, `p.running`, `p.code` | OS pid, still running, exit code (-1 while running) |

Callbacks registered right after `spawn` never miss output: events are only delivered from the event loop.

## How it works

On POSIX, `posix_spawn` starts each child in its own process group, with three pipes and explicit lookup in the
child environment's `PATH`. Zinc Next uses libuv to
read stdout/stderr and watch `SIGCHLD`; the legacy provider uses its poller. Both inspect exit with
`waitid(WNOWAIT)`, terminate the remaining group, then reap the direct child with `waitpid`. Keeping the child
unreaped until the final group signal prevents its PID/group ID from being reused during cleanup. Exit codes
and buffered output retain their ordering: the exit event follows the child's last output.

`p.kill()` signals that owned group, including descendants which inherited it. If the leader exits first, the
remaining group is killed before the exit is reported, so a descendant holding the output pipes cannot leave
`p.running` stuck. Direct children are reaped; orphaned grandchildren are reaped by the operating system.
On macOS hosts with `proc_signal_with_audittoken`, termination also snapshots the still-owned leader's
nested descendants, including a Zinc child which created further process groups. Each parent is temporarily
stopped before discovering its children, and an RAII guard resumes only processes this walk stopped.
The combined native BSD/identity record verifies each original parent relationship, even after a direct
child is reparented when its leader exits; a bounded all-process metadata walk discovers those orphans.
Signals use the kernel's
PID-version check, including at final cleanup after the original leader exits. The walk is bounded to 4096
members and 250 ms, with retained identities bounded to 4096 and cleared at reap. This is a bounded cleanup
attempt, not containment of a fork bomb or an ancestry chain whose intermediate processes already vanished.
Other POSIX hosts retain
the process-group behavior; nested-group support there is still open.

Old or invalid process handles cannot signal a later child. `zinc:sys`'s separate PID-based signal API retains
its direct PID semantics.

The graphics run's existing finish hook kills owned groups and closes their pipes; it remains installed across
successive runs. Explicit provider shutdown also discards queued process events. Worker-thread exit and normal
process exit have the same POSIX cleanup through the thread-local owner. Fast Refresh's paused VM keeps its
children until resumed or stopped; this is not a teardown. Nongraphical runs use normal thread/process exit
cleanup when they do not call the graphics finish hook.

## Notes

- **No shell.** Arguments go to the program as they are: no globbing, pipes, redirections or `$VAR` expansion. Call
  `proc.spawn('sh', ['-c', 'ls *.ts | wc -l'], {})` when you want them.
- **Environment.** The child gets the program's environment; `env` entries add variables or replace existing ones
  with the same name. Removing a variable is not supported (set it to an empty value instead).
- **Working directory.** Relative paths in `cmd` and `args` resolve against `cwd` when given (set with
  `posix_spawn_file_actions_addchdir_np` where available; older macOS uses a fork/exec fallback with the same
  argument, environment, working-directory and spawn-error behavior).
- **Limits.** 32 concurrent children. `write` blocks until the data is in the pipe: a child that never reads stdin
  stalls the program once the pipe buffer (64 KiB) is full. Grandchildren are stopped when their leader exits;
  a command launched with `cmd &` cannot outlive its owning child. Other file descriptors of the program (sockets) are inherited by children unless they
  were opened close-on-exec.
- The program ignores `SIGPIPE` once the plugin is used (writing to a child that closed its stdin returns `false`
  instead of killing the program); children start with the default `SIGPIPE` behaviour.

- **Containment limits.** This is process ownership, not a sandbox. Descendants whose intermediate ancestor identities have already vanished,
  hosts without the identity signal API, or a tree exceeding the cleanup bounds can escape nested cleanup.
  On hosts using only process groups, descendants which leave the group (`setsid`/`setpgid`) escape it. The legacy Node simulator and Windows provider still signal
  the direct child only; Windows needs assignment to a Job Object before execution for equivalent family cleanup.

## Security

`zinc:process` runs whatever it is given with the program's user and permissions. Never build a command line from
untrusted input (network messages, a remote viewer, a web page in `zinc:webview`): pass untrusted values as separate
`args` of a fixed program rather than through `sh -c`, and validate them against an allowlist of commands the app
actually needs.

The arguments reach the child as separate `argv` entries (`posix_spawnp`, no shell). They travel joined by U+001F, so
`spawn` throws for an argument (or `cmd`, `cwd`, an `env` entry) containing U+001F or NUL rather than splitting it, and
a single empty argument (`['']`) is dropped. Children inherit only stdin, stdout and stderr, never the program's
sockets or files. The environment is the program's own plus `env`: pass secrets to a child explicitly, and remember
every child sees what the program's environment holds.
