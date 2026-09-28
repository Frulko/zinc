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
| `run(cmd, args, opts): Promise<Result>` | spawn + collect: `{ code, stdout, stderr }`; rejects only when the program cannot be started (a non-zero exit resolves) |
| `SpawnOptions` | `cwd?: string` (default: the program's), `env?: string[]` of `KEY=VALUE` |
| `p.onStdout(cb)` / `p.onStderr(cb)` | each complete line, without `\n` (a trailing `\r` is removed too); a last line without newline is delivered at exit |
| `p.onData(cb(chunk, stderr))` | raw output as read from the pipes (UTF-8 sequences are never split between chunks) |
| `p.onExit(cb(code))` / `p.exited: Promise<i32>` | exit code; a process killed by a signal reports `128 + signal` (SIGTERM: 143, SIGKILL: 137) |
| `p.write(s): boolean` / `p.closeStdin()` | stdin; `write` is false once stdin is closed or the process is gone |
| `p.kill(signal = 15)` | sends a signal (15 SIGTERM, 9 SIGKILL, 2 SIGINT) |
| `p.pid`, `p.running`, `p.code` | OS pid, still running, exit code (-1 while running) |

Callbacks registered right after `spawn` never miss output: events are only delivered from the event loop.

## How it works

`posix_spawnp` with three pipes; the parent ends of stdout/stderr are non-blocking and a `zrt::Poller` reads them
on every event loop iteration (no thread), then reaps the child with `waitpid(WNOHANG)`. The exit event comes after
the last output of the child: once it is reaped, its pipes are drained and closed. While a child runs, the program
does not exit (the poller keeps the loop alive, like pending timers). When the program stops (window closed, `zinc
dev` reload), running children are killed with SIGKILL.

## Notes

- **No shell.** Arguments go to the program as they are: no globbing, pipes, redirections or `$VAR` expansion. Call
  `proc.spawn('sh', ['-c', 'ls *.ts | wc -l'], {})` when you want them.
- **Environment.** The child gets the program's environment; `env` entries add variables or replace existing ones
  with the same name. Removing a variable is not supported (set it to an empty value instead).
- **Working directory.** Relative paths in `cmd` and `args` resolve against `cwd` when given (set with
  `posix_spawn_file_actions_addchdir_np`: macOS 10.15+, glibc 2.29+, musl 1.1.24+).
- **Limits.** 32 concurrent children. `write` blocks until the data is in the pipe: a child that never reads stdin
  stalls the program once the pipe buffer (64 KiB) is full. Output written by a grandchild after the child exited
  (`cmd &`) is not reported. Other file descriptors of the program (sockets) are inherited by children unless they
  were opened close-on-exec.
- The program ignores `SIGPIPE` once the plugin is used (writing to a child that closed its stdin returns `false`
  instead of killing the program); children start with the default `SIGPIPE` behaviour.

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
