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
  /** @throws when the directory cannot be read */
  export function list(dir: string): string[];
  export function remove(path: string): boolean;
  export function mkdir(path: string): boolean;
}

declare module 'zinc:storage' {
  /** Persistent key/value store (file on hosts, NVS on esp32). "" when missing. */
  export function get(key: string): string;
  export function set(key: string, value: string): void;
  export function remove(key: string): void;
  export function keys(): string[];
}

declare module 'zinc:net' {
  export interface RequestInit { method?: string; body?: string; contentType?: string }
  export class Response {
    readonly status: i32;
    readonly ok: boolean;
    text(): Promise<string>;
  }
  /** HTTP(S) request (libcurl on hosts, esp_http_client on esp32). Rejects on network errors. */
  export function fetch(url: string, init?: RequestInit): Promise<Response>;
  export interface Request { method: string; path: string; body: string }
  export interface Reply { status: i32; body: string; contentType: string }
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
    emit(v: T): void;
  }
}

declare module 'zinc:native' {
  /** Base of every native module spec (NAT-01). */
  export interface NativeModule {}
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
