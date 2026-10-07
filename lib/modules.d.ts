// Built-in native modules (NAT-13). Each is linked only when imported (UI-01 style).
// Functions tagged @throws set a pending Error the caller can catch.

declare module 'zinc:sys' {
  /** Command-line arguments after the program name. */
  export function args(): string[];
  /** Environment variable, or "" when unset. */
  export function env(name: string): string;
  export function exit(code: i32): never;
  /** "macos" | "linux" | "rpi1" | "esp32" | "ps2" | "ps1" | "wasm" | "sim" */
  export function platform(): string;
  /** Monotonic clock in milliseconds. */
  export function clock(): f64;
  /** Runtime statistics (NFR-16). */
  export function liveObjects(): i32;
  export function allocations(): i32;
  /** Random bytes from the OS (arc4random, getentropy, esp_fill_random); a clock-seeded xorshift on ps1 / ps2,
   *  which have no entropy source. */
  export function randomBytes(n: i32): u8[];
  /** The UTF-8 bytes of a string. */
  export function utf8Encode(s: string): u8[];
  /** UTF-8 to string; each invalid sequence becomes U+FFFD, like TextDecoder. */
  export function utf8Decode(bytes: u8[]): string;
  /** Runs `cb` on the event loop when the signal arrives ('SIGINT', 'SIGTERM', 'SIGHUP', 'SIGUSR1', 'SIGUSR2',
   *  'SIGWINCH', ...); the default action (terminate) no longer happens. Does not keep the program alive.
   *  POSIX hosts only (no-op elsewhere). @throws on an unknown or uncatchable signal */
  export function onSignal(signal: string, cb: () => void): void;
  /** Sends a signal to a process ('SIGTERM', 'SIGKILL', ...); false when it failed. @throws on an unknown signal */
  export function kill(pid: i32, signal: string): boolean;
  export function pid(): i32;
  export function cwd(): string;
  export function chdir(dir: string): boolean;
  export function setEnv(name: string, value: string): void;
  export function unsetEnv(name: string): void;
  /** Names of the environment variables, sorted. */
  export function envKeys(): string[];
  /** 0 stdin, 1 stdout, 2 stderr */
  export function isatty(fd: i32): boolean;
  /** Writes to stdout / stderr without a newline. */
  export function write(s: string): void;
  export function writeErr(s: string): void;
  /** Standard input in chunks (UTF-8 sequences never split); '' at end of input. Keeps the program alive until
   *  then. */
  export function onStdin(cb: (chunk: string) => void): void;
}

declare module 'zinc:fs' {
  /** @throws when the file cannot be read */
  export function readText(path: string): string;
  /** @throws when the file cannot be written */
  export function writeText(path: string, data: string): void;
  /** @throws when the file cannot be written */
  export function appendText(path: string, data: string): void;
  export function exists(path: string): boolean;
  /** Names in a directory, sorted. @throws when the directory cannot be read */
  export function list(dir: string): string[];
  /** false when it failed; `recursive`: a directory and everything in it (rm -rf). */
  export function remove(path: string, recursive?: boolean): boolean;
  /** false when it failed; `recursive`: with missing parents, and true when it already exists (mkdir -p). */
  export function mkdir(path: string, recursive?: boolean): boolean;
  /** @throws when the file cannot be read */
  export function readBytes(path: string): u8[];
  /** @throws when the file cannot be written */
  export function writeBytes(path: string, data: u8[]): void;
  export interface Stat { size: f64; mtimeMs: f64; atimeMs: f64; ctimeMs: f64; mode: i32; isFile: boolean; isDirectory: boolean; isSymlink: boolean }
  export interface DirEntry { name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }
  /** Errors read `CODE: op path` (ENOENT, EACCES, EEXIST, ENOTDIR, ENOTEMPTY...). @throws */
  export function stat(path: string): Stat;
  /** Like stat, without following a symbolic link. @throws */
  export function lstat(path: string): Stat;
  /** Entries with their types, sorted by name. @throws */
  export function readDir(dir: string): DirEntry[];
  /** @throws */
  export function rename(from: string, to: string): void;
  /** @throws */
  export function copyFile(from: string, to: string): void;
  /** Absolute path with symbolic links resolved. @throws */
  export function realpath(path: string): string;
  /** Creates a unique directory `prefix` + 6 random characters and returns its path. @throws */
  export function mkdtemp(prefix: string): string;
  /** $TMPDIR (or /tmp) without a trailing slash. */
  export function tmpdir(): string;
  /** @throws (not on esp32) */
  export function symlink(target: string, path: string): void;
  /** @throws */
  export function readlink(path: string): string;
  /** @throws */
  export function chmod(path: string, mode: i32): void;
  /** Watches a file or the entries of a directory (not recursive): cb('rename', name) when an entry appears or
   *  disappears, cb('change', name) when its size or mtime changes. Polls every 100 ms and keeps the program alive
   *  until unwatch(). Returns the watch id. @throws when the path does not exist */
  export function watch(path: string, cb: (event: string, name: string) => void): i32;
  export function unwatch(id: i32): void;
}

declare module 'zinc:storage' {
  /** Persistent key/value store (file on hosts, NVS on esp32). "" when missing. */
  export function get(key: string): string;
  export function set(key: string, value: string): void;
  export function remove(key: string): void;
  export function keys(): string[];
}

declare module 'zinc:net' {
  /** Web Headers: case-insensitive names, iteration sorted by name. */
  export class Headers {
    constructor();
    append(name: string, value: string): void;
    set(name: string, value: string): void;
    delete(name: string): void;
    has(name: string): boolean;
    /** Every value of the name joined with ', '; '' when absent (use has()). */
    get(name: string): string;
    /** Distinct lowercase names, sorted. */
    keys(): string[];
    forEach(f: (value: string, name: string) => void): void;
  }
  /** bodyBytes: a binary body (wins over body). timeoutMs: the whole request (default 120000; connecting: 30 s at
   *  most). maxBytes: the largest response body accepted (default: a quarter of the heap, at most 64 MiB). */
  export interface RequestInit { method?: string; body?: string; bodyBytes?: u8[]; contentType?: string; headers?: Headers; timeoutMs?: i32; maxBytes?: i32 }
  export class Response {
    readonly status: i32;
    readonly ok: boolean;
    /** Reason phrase ('' over HTTP/2). */
    readonly statusText: string;
    /** Final URL, after redirects. */
    readonly url: string;
    readonly headers: Headers;
    text(): Promise<string>;
    bytes(): Promise<u8[]>;
    /** The body parsed as a Dyn tree (gradual profile); rejects on invalid JSON. */
    json(): Promise<any>;
  }
  /** HTTP(S) request (libcurl on hosts, esp_http_client on esp32): follows redirects, decodes gzip / br.
   *  Rejects with 'fetch failed: ECONNREFUSED' / 'ENOTFOUND' / 'timeout' / 'response too large' / the libcurl message. */
  export function fetch(url: string, init?: RequestInit): Promise<Response>;
  export interface Request { method: string; path: string; body: string; headers: Headers }
  export interface Reply { status: i32; body: string; contentType: string; headers?: Headers }
  /** Minimal HTTP/1.1 server (server mode): the handler runs on the event loop. */
  export function serve(port: i32, handler: (req: Request) => Reply): void;
  export function stop(): void;
}

declare module 'zinc:osc' {
  /** OSC 1.0 message: numeric arguments (i/f/d/T/F; an r colour gives four numbers R, G, B, A in 0..255) and string
   *  arguments, in order of type. */
  export interface OscMessage { address: string; numbers: f64[]; strings: string[] }
  export function send(host: string, port: i32, address: string, numbers: f64[], strings?: string[]): void;
  export function listen(port: i32, cb: (m: OscMessage) => void): void;
  export function close(): void;
}

declare module 'zinc:mqtt' {
  /** MQTT 3.1.1 client (QoS 0) over TCP. */
  export class MqttClient {
    constructor(host: string, port: i32, clientId: string);
    connect(): Promise<void>;
    publish(topic: string, payload: string): void;
    subscribe(topic: string, cb: (topic: string, payload: string) => void): void;
    close(): void;
  }
}

declare module 'zinc:telemetry' {
  /** Starts streaming JSON lines: "udp://host:port", "stdout" or "file:path". ZINC_TELEMETRY sets it at startup. */
  export function connect(target: string): void;
  export function counter(name: string, delta: number): void;
  export function gauge(name: string, value: number): void;
  export function event(name: string, data: string): void;
  /** Sampled at 10 Hz into state_snapshot messages. */
  export function expose(name: string, get: () => number): void;
  export function enabled(): boolean;
}

declare module 'zinc:gpio' {
  export interface PinEdge { pin: u8; value: u8; timestampMs: f64 }
  /** mode: "in" | "out"; pull: "up" | "down" | "none" */
  export function setup(pin: u8, mode: string, pull: string): void;
  export function write(pin: u8, value: u8): void;
  export function read(pin: u8): u8;
  /** edge: "rising" | "falling" | "both" */
  export function watch(pin: u8, edge: string, debounceMs: u16, cb: (e: PinEdge) => void): void;
  /** Simulator only (macos/linux/sim): drive an input pin as if wired to a button. */
  export function simulate(pin: u8, value: u8): void;
}

declare module 'zinc:events' {
  /** Typed event channel; emit() is safe from native threads (NAT-06). */
  export class Emitter<T> {
    constructor();
    on(cb: (v: T) => void): void;
    once(cb: (v: T) => void): void;
    off(cb: (v: T) => void): void;
    listenerCount(): i32;
    emit(v: T): void;
  }
}

declare module 'zinc:native' {
  /** Base of every native module spec (NAT-01). */
  export interface NativeModule {}
  /** Opaque native ownership. Pass it to module methods; it has no guest-visible fields. */
  export interface NativeResource {}
  /** `export default requireNative<Spec>('Name')` in native/<name>.spec.ts */
  export function requireNative<T extends NativeModule>(name: string): T;
}

declare module 'zinc:assets' {
  /** Assets are embedded in the executable at build time (single-file distribution).
   *  In development, ZINC_ASSETS=<dir> reads them from disk first (hot reload). */
  export function readText(name: string): string;
  export function readBytes(name: string): u8[];
  export function exists(name: string): boolean;
  export function list(): string[];
}

declare module 'zinc:os' {
  /** Machine information on POSIX hosts (macos, linux, rpi1, rmpp), like Node's os module. */
  export function hostname(): string;
  /** $HOME, else the password database. */
  export function homedir(): string;
  /** $TMPDIR (or /tmp) without a trailing slash. */
  export function tmpdir(): string;
  /** 'arm64' | 'x64' | 'arm' | 'ia32' | 'riscv64' */
  export function arch(): string;
  /** uname: 'Darwin' | 'Linux' */
  export function type(): string;
  export function release(): string;
  /** Seconds since boot. */
  export function uptime(): f64;
  /** 1, 5 and 15 minute load averages. */
  export function loadavg(): f64[];
  /** Bytes. */
  export function totalmem(): f64;
  export function freemem(): f64;
  export interface CpuInfo { model: string; speed: f64 }
  /** One entry per online CPU (speed in MHz, 0 when unknown). */
  export function cpus(): CpuInfo[];
  export function availableParallelism(): i32;
  /** family: 'IPv4' | 'IPv6'; mac '00:00:00:00:00:00' when none. */
  export interface NetworkInterface { name: string; address: string; netmask: string; family: string; mac: string; internal: boolean }
  /** Addresses of the interfaces that are up, flattened (Node groups them by name). */
  export function networkInterfaces(): NetworkInterface[];
  export interface UserInfo { username: string; uid: i32; gid: i32; shell: string; homedir: string }
  export function userInfo(): UserInfo;
}
