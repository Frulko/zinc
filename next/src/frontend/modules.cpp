#include "frontend/modules.h"
#include "frontend/jsx.h"
#include "frontend/plugin_manifest.h"

#include <cstdio>
#include <cstdlib>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <map>
#include <set>

#include "frontend/desugar.h"
#include "frontend/diagnostics.h"
#include "frontend/dyn.h"
#include "frontend/inspect.h"
#include "frontend/parser.h"
#include "frontend/snippet.h"
#include "frontend/tsconfig.h"
#include "yyjson.h"

namespace zn::frontend {
namespace {

std::string dirOf(const std::string& p) {
  std::size_t s = p.rfind('/');
  return s == std::string::npos ? "" : p.substr(0, s);
}

// "a/b/../c/./d" -> "a/c/d"
std::string normalize(const std::string& p) {
  std::vector<std::string> parts;
  std::size_t i = 0;
  bool abs = !p.empty() && p[0] == '/';
  while (i <= p.size()) {
    std::size_t j = p.find('/', i);
    if (j == std::string::npos) j = p.size();
    std::string seg = p.substr(i, j - i);
    if (seg == "..") { if (!parts.empty() && parts.back() != "..") parts.pop_back(); else if (!abs) parts.push_back(seg); }
    else if (!seg.empty() && seg != ".") parts.push_back(seg);
    i = j + 1;
  }
  std::string r = abs ? "/" : "";
  for (std::size_t k = 0; k < parts.size(); ++k) r += (k ? "/" : "") + parts[k];
  return r;
}

// The host's modules ('zinc:gfx'), written in Zinc over the __host_* functions of the runtime table (zn/runtime.h, owner "host").
// A first subset of lib/gfx.d.ts: frames, clear, rect, rrect, fonts and text. `onFrame` hands the callback to the frame loop,
// which runs in place of the timer loop once the program's own statements are done (see kAsyncPrelude).
const char* kGfxModule = R"ZN(
let __frameCb: ((dt: number) => void) | null = null;
let __frameNo: i32 = 0;
function __gfxLoop(): void {
  const n = __host_gfxFrames();
  for (let f: i32 = 0; f < n; f++) {
    const dt = __host_gfxPoll();
    __clock = __real ? __host_loopNow() : __clock + dt * 1000;  // a real run follows the clock of the host, a deterministic one the fixed step
    __pollHost();
    __frameTimers();
    __host_gfxBegin();
    const cb = __frameCb;
    if (cb !== null) cb(dt);
    __drainJobs();
    __host_gfxEnd();
    __frameNo++;
    if (__host_gfxShouldQuit()) break;
  }
  __host_gfxFinish();
}
export function onFrame(cb: (dt: number) => void): void { __frameCb = cb; __frameHook = __gfxLoop; }
export function frame(): i32 { return __frameNo; }
// ---- api: everything below is shared with the QuickJS engine (src/qjs), which brings its own frame loop
export function width(): i32 { return __host_gfxWidth(); }
export function height(): i32 { return __host_gfxHeight(); }
export function pixelScale(): i32 { return __host_gfxPixelScale(); }
export function clear(color: u32): void { __host_gfxClear(color); }
export function rect(x: number, y: number, w: number, h: number, color: u32): void { __host_gfxRect(x, y, w, h, color); }
export function line(x1: number, y1: number, x2: number, y2: number, color: u32): void { __host_gfxLine(x1, y1, x2, y2, color); }
export function text(x: number, y: number, s: string, color: u32, scale: i32): void { __host_gfxText(x, y, s, color, scale); }
export function rrect(x: number, y: number, w: number, h: number, r: number, color: u32, alpha: i32): void { __host_gfxRRect(x, y, w, h, r, color, alpha); }
export function gradient(x: number, y: number, w: number, h: number, r: number, c1: u32, c2: u32, vertical: boolean, alpha: i32): void { __host_gfxGradient(x, y, w, h, r, c1, c2, vertical, alpha); }
export function border(x: number, y: number, w: number, h: number, r: number, bw: number, color: u32, alpha: i32): void { __host_gfxBorder(x, y, w, h, r, bw, color, alpha); }
export function shadow(x: number, y: number, w: number, h: number, r: number, blur: number, color: u32, alpha: i32): void { __host_gfxShadow(x, y, w, h, r, blur, color, alpha); }
export function polygon(points: number[], color: u32, alpha: i32): void { __host_gfxPolygon(points, color, alpha); }
export function path(contours: number[], color: u32, alpha: i32): void { __host_gfxPath(contours, color, alpha); }
export function stroke(points: number[], width: number, color: u32, alpha: i32, closed: boolean): void { __host_gfxStroke(points, width, color, alpha, closed); }
export function font(family: string, px: i32): i32 { return __host_gfxFont(family, px); }
export function fontAscent(f: i32): i32 { return __host_gfxFontAscent(f); }
export function lineHeight(f: i32): i32 { return __host_gfxLineHeight(f); }
export function textWidth(f: i32, s: string, tracking: number): number { return __host_gfxTextWidth(f, s, tracking); }
export function drawText(font: i32, x: number, y: number, s: string, color: u32, alpha: i32, tracking: number): void { __host_gfxDrawText(font, x, y, s, color, alpha, tracking); }
export function image(name: string): i32 { return __host_gfxImage(name); }
export function imageWidth(img: i32): i32 { return __host_gfxImageWidth(img); }
export function imageHeight(img: i32): i32 { return __host_gfxImageHeight(img); }
export function drawImage(img: i32, x: number, y: number, w: number, h: number, alpha: i32, radius: number): void { __host_gfxDrawImage(img, x, y, w, h, alpha, radius); }
export function clip(x: number, y: number, w: number, h: number, radius: number = 0): void { __host_gfxClip(x, y, w, h, radius); }
export function unclip(): void { __host_gfxUnclip(); }
export function translate(x: number, y: number): void { __host_gfxTranslate(x, y); }
export function keep(): void { __host_gfxKeep(); }
export function createImage(w: i32, h: i32): i32 { return __host_gfxCreateImage(w, h); }
export function destroyImage(image: i32): void { __host_gfxDestroyImage(image); }
export function beginImage(image: i32): void { __host_gfxBeginImage(image); }
export function endImage(): void { __host_gfxEndImage(); }
// Input: read from the HAL (a window, or nothing when headless: no pointer, keys, touch or pen).
export enum Btn { Up = 0, Down = 1, Left = 2, Right = 3, A = 4, B = 5, X = 6, Y = 7, L = 8, R = 9, Start = 10, Select = 11 }
export enum Mod { Shift = 1, Ctrl = 2, Alt = 4, Meta = 8 }
export enum KeyKind { Down = 0, Up = 1, Repeat = 2, Text = 3 }
export enum Cursor { Default = 0, Text = 1, Pointer = 2, Move = 3, EwResize = 4, NsResize = 5, Crosshair = 6, Grab = 7, Grabbing = 8, NotAllowed = 9 }
export enum PenFlag { Down = 1, Eraser = 2, Hover = 4 }
export function wheel(): number { return __host_gfxWheel(); }
export function wheelX(): number { return __host_gfxWheelX(); }
export function pinch(): number { return __host_gfxPinch(); }
export function touchCount(): i32 { return __host_gfxTouchCount(); }
export function touchX(i: i32): number { return __host_gfxTouchX(i); }
export function touchY(i: i32): number { return __host_gfxTouchY(i); }
export function touchId(i: i32): i32 { return __host_gfxTouchId(i); }
export function penCount(): i32 { return __host_gfxPenCount(); }
export function penX(i: i32): number { return __host_gfxPenX(i); }
export function penY(i: i32): number { return __host_gfxPenY(i); }
export function penPressure(i: i32): number { return __host_gfxPenPressure(i); }
export function penTiltX(i: i32): number { return __host_gfxPenTiltX(i); }
export function penTiltY(i: i32): number { return __host_gfxPenTiltY(i); }
export function penFlags(i: i32): i32 { return __host_gfxPenFlags(i); }
export function isDown(b: Btn): boolean { return __host_gfxIsDown(b); }
export function wasPressed(b: Btn): boolean { return __host_gfxWasPressed(b); }
export function pointerX(): number { return __host_gfxPointerX(); }
export function pointerY(): number { return __host_gfxPointerY(); }
export function pointerDown(): boolean { return __host_gfxPointerDown(); }
export function pointerButtons(): i32 { return __host_gfxPointerButtons(); }
export function modifiers(): i32 { return __host_gfxModifiers(); }
export function keyCount(): i32 { return __host_gfxKeyCount(); }
export function keyKind(i: i32): KeyKind { return __host_gfxKeyKind(i); }
export function keyMods(i: i32): i32 { return __host_gfxKeyMods(i); }
export function keyName(i: i32): string { return __host_gfxKeyName(i); }
export function buttonEventCount(): i32 { return __host_gfxButtonEventCount(); }
export function buttonEventX(i: i32): number { return __host_gfxButtonEventX(i); }
export function buttonEventY(i: i32): number { return __host_gfxButtonEventY(i); }
export function buttonEventButton(i: i32): i32 { return __host_gfxButtonEventButton(i); }
export function buttonEventDown(i: i32): boolean { return __host_gfxButtonEventDown(i); }
export function startTextInput(x: number, y: number, w: number, h: number): void { __host_gfxStartTextInput(x, y, w, h); }
export function stopTextInput(): void { __host_gfxStopTextInput(); }
export function clipboardText(): string { return __host_gfxClipboardText(); }
export function setClipboardText(s: string): void { __host_gfxSetClipboardText(s); }
export function setCursor(c: Cursor): void { __host_gfxSetCursor(c); }
export function scrollDX(): number { return __host_gfxScrollDX(); }
export function scrollDY(): number { return __host_gfxScrollDY(); }
export function scrollPhase(): i32 { return __host_gfxScrollPhase(); }
export function escapeByApp(on: boolean): void { __host_gfxEscapeByApp(on); }
export function escapeDefault(): void { __host_gfxEscapeDefault(); }
export function profiling(): boolean { return __host_gfxProfiling(); }
export function profMark(phase: i32): void { __host_gfxProfMark(phase); }
export function quit(): void { __host_gfxQuit(); }
export function capture(path: string): boolean { return __host_gfxCapture(path); }
)ZN";


// The system modules (lib/modules.d.ts) over the flat host calls of src/host/sys_host.cpp. Errors read `CODE: op path`, as in the d.ts.
const char* kSysModule = R"ZN(
export function args(): string[] { const r: string[] = []; const n = __host_sysArgsCount(); for (let i: i32 = 0; i < n; i++) r.push(__host_sysArg(i)); return r; }
export function env(name: string): string { return __host_sysEnv(name); }
export function exit(code: i32): void { __host_sysExit(code); }
export function platform(): string { return __host_sysPlatform(); }
export function clock(): f64 { return Date.now(); }
export function liveObjects(): i32 { return 0; }
export function allocations(): i32 { return 0; }
export function randomBytes(n: i32): u8[] { const r: u8[] = []; for (let i: i32 = 0; i < n; i++) r.push(__host_sysRandomByte() as u8); return r; }
export function utf8Encode(s: string): u8[] { const r: u8[] = []; const n = __host_sysUtf8Len(s); for (let i: i32 = 0; i < n; i++) r.push(__host_sysUtf8Byte(s, i) as u8); return r; }
export function utf8Decode(bytes: u8[]): string { return __host_sysUtf8Decode(bytes); }
// Signals of the program itself arrive on the event loop (a handled signal does not terminate it); a watched signal does not keep the loop alive.
const __sigNames: string[] = [];
const __sigCbs: (() => void)[] = [];
let __sysEv: boolean = false;
const __stdinCbs: ((chunk: string) => void)[] = [];
function __sysEvents(): void {
  if (__sysEv) return;
  __sysEv = true;
  __addEvHandler((h: i32, kind: i32, data: string) => {
    if (kind === 10) { for (let i: i32 = 0; i < __sigNames.length; i++) if (__sigNames[i] === data) __sigCbs[i](); }
    else if (kind === 11) { for (const cb of __stdinCbs.slice()) cb(data); }
    else if (kind === 12) { for (const cb of __stdinCbs.slice()) cb(''); }
  });
}
export function onSignal(signal: string, cb: () => void): void {
  if (__host_sigWatch(signal) === 0) throw new Error('sys.onSignal: unknown or uncatchable signal ' + signal);
  __sysEvents();
  __sigNames.push(signal);
  __sigCbs.push(cb);
}
export function kill(pid: i32, signal: string): boolean {
  if (__host_sigSend(pid, signal) === 0) throw new Error('sys.kill: unknown signal ' + signal);
  return true;
}
export function pid(): i32 { return __host_sysPid(); }
export function cwd(): string { return __host_sysCwd(); }
export function chdir(dir: string): boolean { return __host_sysChdir(dir); }
export function setEnv(name: string, value: string): void { __host_sysSetEnv(name, value); }
export function unsetEnv(name: string): void { __host_sysUnsetEnv(name); }
export function envKeys(): string[] { const r: string[] = []; const n = __host_sysEnvKeysCount(); for (let i: i32 = 0; i < n; i++) r.push(__host_sysEnvKey(i)); return r; }
export function isatty(fd: i32): boolean { return __host_sysIsatty(fd); }
export function write(s: string): void { __host_sysWrite(s); }
export function writeErr(s: string): void { __host_sysWriteErr(s); }
// waits up to `ms` for work from outside (a child's output, a signal, stdin) and delivers it: for a program that has to block until something finishes
export function poll(ms: i32): void { __host_loopWait(ms); __pollHost(); }
export function onStdin(cb: (chunk: string) => void): void { __sysEvents(); __stdinCbs.push(cb); __host_stdinRead(); }
)ZN";

const char* kFsModule = R"ZN(
function check(): void { if (__host_fsFailed()) throw new Error(__host_fsError()); }
export function readText(path: string): string { const s = __host_fsReadText(path); check(); return s; }
export function writeText(path: string, data: string): void { __host_fsWriteText(path, data); check(); }
export function appendText(path: string, data: string): void { __host_fsAppendText(path, data); check(); }
export function exists(path: string): boolean { return __host_fsExists(path); }
export function list(dir: string): string[] {
  const n = __host_fsListCount(dir);
  check();
  const r: string[] = [];
  for (let i: i32 = 0; i < n; i++) r.push(__host_fsListName(i));
  return r;
}
export function remove(path: string, recursive: boolean = false): boolean { return __host_fsRemove(path, recursive); }
export function mkdir(path: string, recursive: boolean = false): boolean { return __host_fsMkdir(path, recursive); }
export function readBytes(path: string): u8[] {
  const n = __host_fsLoad(path);
  check();
  const r: u8[] = [];
  for (let i: i32 = 0; i < n; i++) r.push(__host_fsByte(i) as u8);
  return r;
}
export function writeBytes(path: string, data: u8[]): void { __host_fsWriteBytes(path, data); check(); }
export interface Stat { size: f64; mtimeMs: f64; atimeMs: f64; ctimeMs: f64; mode: i32; isFile: boolean; isDirectory: boolean; isSymlink: boolean }
export interface DirEntry { name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }
function statOf(path: string, link: boolean): Stat {
  if (!__host_fsStat(path, link)) check();
  return { size: __host_fsStatD(0), mtimeMs: __host_fsStatD(1), atimeMs: __host_fsStatD(2), ctimeMs: __host_fsStatD(3), mode: __host_fsStatI(0),
           isFile: __host_fsStatI(1) !== 0, isDirectory: __host_fsStatI(2) !== 0, isSymlink: __host_fsStatI(3) !== 0 };
}
export function stat(path: string): Stat { return statOf(path, false); }
export function lstat(path: string): Stat { return statOf(path, true); }
export function readDir(dir: string): DirEntry[] {
  const n = __host_fsListCount(dir);
  check();
  const r: DirEntry[] = [];
  for (let i: i32 = 0; i < n; i++) { const k = __host_fsListKind(i); r.push({ name: __host_fsListName(i), isFile: (k & 1) !== 0, isDirectory: (k & 2) !== 0, isSymlink: (k & 4) !== 0 }); }
  return r;
}
export function rename(from: string, to: string): void { __host_fsRename(from, to); check(); }
export function copyFile(from: string, to: string): void { __host_fsCopyFile(from, to); check(); }
export function realpath(path: string): string { const s = __host_fsRealpath(path); check(); return s; }
export function mkdtemp(prefix: string): string { const s = __host_fsMkdtemp(prefix); check(); return s; }
export function tmpdir(): string { return __host_fsTmpdir(); }
export function symlink(target: string, path: string): void { throw new Error('ENOSYS: symlink is not supported by this engine yet'); }
export function readlink(path: string): string { throw new Error('ENOSYS: readlink is not supported by this engine yet'); }
export function chmod(path: string, mode: i32): void { throw new Error('ENOSYS: chmod is not supported by this engine yet'); }
export function watch(path: string, cb: (event: string, name: string) => void): i32 { throw new Error('ENOSYS: fs.watch is not supported by this engine yet'); }
export function unwatch(id: i32): void {}
)ZN";

const char* kStorageModule = R"ZN(
export function get(key: string): string { return __host_storageGet(key); }
export function set(key: string, value: string): void { __host_storageSet(key, value); }
export function remove(key: string): void { __host_storageRemove(key); }
export function keys(): string[] { const r: string[] = []; const n = __host_storageKeysCount(); for (let i: i32 = 0; i < n; i++) r.push(__host_storageKey(i)); return r; }
)ZN";

const char* kAssetsModule = R"ZN(
function check(): void { if (__host_fsFailed()) throw new Error(__host_fsError()); }
export function readText(name: string): string { const s = __host_assetsReadText(name); check(); return s; }
export function readBytes(name: string): u8[] {
  const n = __host_assetsLoad(name);
  check();
  const r: u8[] = [];
  for (let i: i32 = 0; i < n; i++) r.push(__host_fsByte(i) as u8);
  return r;
}
export function exists(name: string): boolean { return __host_assetsExists(name); }
export function list(): string[] { const r: string[] = []; const n = __host_assetsCount(); for (let i: i32 = 0; i < n; i++) r.push(__host_assetsName(i)); return r; }
)ZN";

const char* kOsModule = R"ZN(
export function hostname(): string { return __host_osHostname(); }
export function homedir(): string { return __host_osHomedir(); }
export function tmpdir(): string { return __host_fsTmpdir(); }
export function arch(): string { return __host_osArch(); }
export function type(): string { return __host_osType(); }
export function release(): string { return __host_osRelease(); }
export function uptime(): f64 { return __host_osUptime(); }
export function loadavg(): f64[] { return [__host_osLoad(0), __host_osLoad(1), __host_osLoad(2)]; }
export function totalmem(): f64 { return __host_osTotalmem(); }
export function freemem(): f64 { return __host_osFreemem(); }
export interface CpuInfo { model: string; speed: f64 }
export function cpus(): CpuInfo[] { const r: CpuInfo[] = []; const n = __host_osCpus(); for (let i: i32 = 0; i < n; i++) r.push({ model: '', speed: 0 }); return r; }
export function availableParallelism(): i32 { return __host_osCpus(); }
export interface NetworkInterface { name: string; address: string; netmask: string; family: string; mac: string; internal: boolean }
export function networkInterfaces(): NetworkInterface[] { return []; }
export interface UserInfo { username: string; uid: i32; gid: i32; shell: string; homedir: string }
export function userInfo(): UserInfo { return { username: __host_osUser(), uid: 0, gid: 0, shell: '', homedir: __host_osHomedir() }; }
)ZN";

// zinc:__proc: the raw child-process calls under the stand-in of plugins/process (native/process.next.ts); programs import zinc:process (the plugin).
const char* kHostProcModule = R"ZN(
export function spawn(cmd: string, args: string, cwd: string, env: string): i32 { return __host_procSpawnEx(cmd, args, cwd, env); }
export function error(): string { return __host_procError(); }
export function pid(h: i32): i32 { return __host_procPid(h); }
export function write(h: i32, data: string): boolean { return __host_procWrite(h, data) !== 0; }
export function closeStdin(h: i32): void { __host_procCloseStdin(h); }
export function signal(h: i32, sig: i32): void { __host_procSignal(h, sig); }
export function onEvent(cb: (h: i32, kind: i32, data: string) => void): void { __addEvHandler(cb); }
// a shell command line, stdout and stderr merged, polled (zinc:net runs curl this way)
export function spawnLine(commandLine: string): i32 { return __host_procSpawn(commandLine); }
export function read(handle: i32): string { return __host_procRead(handle); }
export function status(handle: i32): i32 { return __host_procStatus(handle); }
export function kill(handle: i32): void { __host_procKill(handle); }
)ZN";

const char* kNetModule = R"ZN(
// zinc:net over llhttp and libuv (src/host/http.cpp): fetch with redirects, timeouts and size limits, and a small HTTP/1.1 server. Messages cross the
// host as strings: header lines "name: value\n", a fetch finishes with a loop event (40 done, 41 failed), a request reaches the server as event 42.
import { utf8Decode, utf8Encode } from 'zinc:sys';
export class Headers {
  names: string[] = [];
  values: string[] = [];
  constructor() {}
  set(name: string, value: string): void {
    const k = name.toLowerCase();
    for (let i: i32 = 0; i < this.names.length; i++) if (this.names[i] === k) { this.values[i] = value; return; }
    this.names.push(k); this.values.push(value);
  }
  append(name: string, value: string): void { const k = name.toLowerCase(); for (let i: i32 = 0; i < this.names.length; i++) if (this.names[i] === k) { this.values[i] = this.values[i] + ', ' + value; return; } this.names.push(k); this.values.push(value); }
  delete(name: string): void { const i = this.names.indexOf(name.toLowerCase()); if (i >= 0) { this.names.splice(i, 1); this.values.splice(i, 1); } }
  has(name: string): boolean { return this.names.indexOf(name.toLowerCase()) >= 0; }
  get(name: string): string { const i = this.names.indexOf(name.toLowerCase()); return i < 0 ? '' : this.values[i]; }
  keys(): string[] { const r: string[] = this.names.slice(); r.sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)); return r; }
  forEach(f: (value: string, name: string) => void): void { for (const k of this.keys()) f(this.get(k), k); }
}
export interface RequestInit { method?: string; body?: string; bodyBytes?: u8[]; contentType?: string; headers?: Headers; timeoutMs?: i32; maxBytes?: i32 }
export class Response {
  status: i32;
  ok: boolean;
  statusText: string = '';
  url: string;
  headers: Headers = new Headers();
  body: string;
  constructor(status: i32, url: string, body: string) { this.status = status; this.ok = status >= 200 && status < 300; this.url = url; this.body = body; }
  text(): Promise<string> { return Promise.resolve(this.body); }
  bytes(): Promise<u8[]> { return Promise.resolve(utf8Encode(this.body)); }
  json(): Promise<any> {
    try { return Promise.resolve(JSON.parse(this.body)); } catch (e) { return Promise.reject(e); }
  }
}
export interface Request { method: string; path: string; body: string; headers: Headers }
export interface Reply { status: i32; body: string; contentType: string; headers?: Headers }

function __ctl(s: string): boolean { return s.indexOf('\r') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\u0000') >= 0; }
function __headerLines(h: Headers): string {
  let s = '';
  for (let i: i32 = 0; i < h.names.length; i++) {
    const n = h.names[i];
    const v = h.values[i];
    if (n.length === 0 || n.indexOf(':') >= 0 || __ctl(n + v)) continue;
    s += n + ': ' + v + '\n';
  }
  return s;
}
function __parseLines(text: string, into: Headers): void {
  for (const line of text.split('\n')) {
    const c = line.indexOf(':');
    if (c > 0) into.append(line.slice(0, c), line.slice(c + 1).trim());
  }
}
class NetCall {
  handle: i32;
  resolve: (v: Response) => void;
  reject: (e: Error) => void;
  constructor(handle: i32, resolve: (v: Response) => void, reject: (e: Error) => void) { this.handle = handle; this.resolve = resolve; this.reject = reject; }
}
const __netCalls: NetCall[] = [];
let __netHooked: boolean = false;
let __netHandler: ((req: Request) => Reply) | null = null;
function __netHook(): void {
  if (__netHooked) return;
  __netHooked = true;
  __addEvHandler((h: i32, kind: i32, data: string) => {
    if (kind === 40 || kind === 41) {
      for (let i: i32 = 0; i < __netCalls.length; i++) {
        const c = __netCalls[i];
        if (c.handle !== h) continue;
        __netCalls.splice(i, 1);
        if (kind === 41) { __host_httpFree(h); c.reject(new TypeError(data)); return; }
        const head = __host_httpHead(h);
        const nl = head.indexOf('\n');
        const r = new Response(__host_httpStatus(h), __host_httpUrl(h), __host_httpBody(h));
        r.statusText = head.slice(0, nl);
        __parseLines(head.slice(nl + 1), r.headers);
        __host_httpFree(h);
        c.resolve(r);
        return;
      }
    } else if (kind === 42) {
      const i1 = data.indexOf('\u001e');
      const i2 = data.indexOf('\u001e', i1 + 1);
      const i3 = data.indexOf('\u001e', i2 + 1);
      const req: Request = { method: data.slice(0, i1), path: data.slice(i1 + 1, i2), body: data.slice(i3 + 1), headers: new Headers() };
      __parseLines(data.slice(i2 + 1, i3), req.headers);
      const f = __netHandler;
      let status: i32 = 500;
      let lines = 'Content-Type: text/plain; charset=utf-8\n';
      let body = 'internal error';
      if (f !== null) {
        try {
          const r = f(req);
          status = r.status;
          body = r.body;
          lines = '';
          if (r.headers !== undefined) lines = __headerLines(r.headers as Headers);
          const ct = r.contentType.length > 0 && !__ctl(r.contentType) ? r.contentType : 'text/plain; charset=utf-8';
          lines += 'Content-Type: ' + ct + '\n';
        } catch (e) { status = 500; body = 'internal error'; lines = 'Content-Type: text/plain; charset=utf-8\n'; }
      }
      __host_httpReply(h, status, lines, body);
    }
  });
}
export function fetch(url: string, init?: RequestInit): Promise<Response> {
  __netHook();
  return new Promise<Response>((resolve: (v: Response) => void, reject: (e: Error) => void) => {
    let method = 'GET';
    let body = '';
    let ct = '';
    let timeout: i32 = 0;
    let max: i32 = 0;
    let lines = '';
    if (init !== undefined) {
      if (init.method !== undefined) method = init.method as string;
      if (init.bodyBytes !== undefined) body = utf8Decode(init.bodyBytes as u8[]);
      else if (init.body !== undefined) body = init.body as string;
      if (init.contentType !== undefined && !__ctl(init.contentType as string)) lines += 'Content-Type: ' + (init.contentType as string) + '\n';
      if (init.headers !== undefined) lines += __headerLines(init.headers as Headers);
      if (init.timeoutMs !== undefined) timeout = init.timeoutMs as i32;
      if (init.maxBytes !== undefined) max = init.maxBytes as i32;
    }
    __netCalls.push(new NetCall(__host_httpFetch(url, method, lines, body, timeout, max), resolve, reject));
  });
}
export interface TlsOptions { cert: string; key: string }
/** serve(port, handler, { cert, key }) with a PEM certificate chain and a PEM private key is an https server. */
export function serve(port: i32, handler: (req: Request) => Reply, tls?: TlsOptions): void {
  __netHook();
  if (tls !== undefined) {
    const t = tls as TlsOptions;
    if (__host_httpServeTls(port, t.cert, t.key) === 0) throw new Error('net.serve: ' + __host_httpError());
  } else if (__host_httpServe(port) === 0) throw new Error('net.serve: cannot listen');
  __netHandler = handler;
}
export function stop(): void { __host_httpStop(); __netHandler = null; }
)ZN";

const char* kNativeModule = R"ZN(
export interface NativeModule {}
export interface NativeResource {}
export function requireNative<T>(name: string): T { throw new Error('the native module ' + name + ' is not linked into this engine'); }
)ZN";

// zinc:events: a typed event channel (lib/modules.d.ts). Listeners run in the order they were added; a listener removed during emit still runs for that emit.
const char* kEventsModule = R"ZN(
export class Emitter<T> {
  private cbs: ((v: T) => void)[] = [];
  private onceFlags: boolean[] = [];
  constructor() {}
  on(cb: (v: T) => void): void { this.cbs.push(cb); this.onceFlags.push(false); }
  once(cb: (v: T) => void): void { this.cbs.push(cb); this.onceFlags.push(true); }
  off(cb: (v: T) => void): void {
    for (let i: i32 = 0; i < this.cbs.length; i++) if (this.cbs[i] === cb) { this.cbs.splice(i, 1); this.onceFlags.splice(i, 1); return; }
  }
  listenerCount(): i32 { return this.cbs.length; }
  emit(v: T): void {
    const list = this.cbs.slice();
    const once = this.onceFlags.slice();
    for (let i: i32 = 0; i < list.length; i++) {
      if (once[i]) this.off(list[i]);
      list[i](v);
    }
  }
}
)ZN";

// zinc:osc: OSC 1.0 over UDP (src/host/osc.cpp). Messages cross the host as one packed string: address, then "n:<number>" / "s:<text>" items joined by \x1e.
const char* kOscModule = R"ZN(
export interface OscMessage { address: string; numbers: f64[]; strings: string[] }
let __oscCb: ((m: OscMessage) => void) | null = null;
let __oscHooked: boolean = false;
export function send(host: string, port: i32, address: string, numbers: f64[], strings?: string[]): void {
  let packed = address;
  for (const v of numbers) packed += '\u001en:' + v;
  if (strings !== undefined) for (const s of strings) packed += '\u001es:' + s;
  __host_oscSend(host, port, packed);
}
export function listen(port: i32, cb: (m: OscMessage) => void): void {
  if (__host_oscListen(port) === 0) throw new Error('osc: cannot bind port');
  __oscCb = cb;
  if (__oscHooked) return;
  __oscHooked = true;
  __addEvHandler((h: i32, kind: i32, data: string) => {
    const f = __oscCb;
    if (kind !== 20 || f === null) return;
    const parts = data.split('\u001e');
    const m: OscMessage = { address: parts[0], numbers: [], strings: [] };
    for (let i: i32 = 1; i < parts.length; i++) {
      if (parts[i].startsWith('n:')) m.numbers.push(parseFloat(parts[i].slice(2)));
      else m.strings.push(parts[i].slice(2));
    }
    f(m);
  });
}
export function close(): void { __host_oscClose(); __oscCb = null; }
)ZN";

// zinc:mqtt: MQTT 3.1.1 client (src/host/mqtt.cpp); connection results and messages arrive as loop events (kinds 30 to 32), topic filters match here.
const char* kMqttModule = R"ZN(
class Sub { filter: string = ''; cb: ((topic: string, payload: string) => void) | null = null; }
function __mqttMatch(filter: string, topic: string): boolean {
  const f = filter.split('/');
  const t = topic.split('/');
  for (let i: i32 = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}
const __mqttClients: MqttClient[] = [];
let __mqttHooked: boolean = false;
export class MqttClient {
  host: string;
  port: i32;
  clientId: string;
  handle: i32 = 0;
  subs: Sub[] = [];
  onConnect: (() => void) | null = null;
  onFail: ((e: Error) => void) | null = null;
  secure: boolean;
  /** secure: MQTT over TLS (port 8883 usually), the broker's certificate verified. */
  constructor(host: string, port: i32, clientId: string, secure: boolean = false) { this.host = host; this.port = port; this.clientId = clientId; this.secure = secure; }
  connect(): Promise<void> {
    if (!__mqttHooked) {
      __mqttHooked = true;
      __addEvHandler((h: i32, kind: i32, data: string) => {
        if (kind < 30 || kind > 32) return;
        for (const c of __mqttClients) {
          if (c.handle !== h) continue;
          if (kind === 31) {
            const i = data.indexOf('\u001e');
            const topic = data.slice(0, i);
            const payload = data.slice(i + 1);
            for (const s of c.subs.slice()) { const cb = s.cb; if (cb !== null && __mqttMatch(s.filter, topic)) cb(topic, payload); }
          } else if (data.length === 0) { const f = c.onConnect; if (f !== null) f(); }
          else { const f = c.onFail; if (f !== null) f(new Error(data)); }
        }
      });
    }
    return new Promise<void>((resolve, reject) => {
      this.onConnect = () => resolve();
      this.onFail = (e: Error) => reject(e);
      this.handle = this.secure ? __host_mqttOpenTls(this.host, this.port, this.clientId, 1) : __host_mqttOpen(this.host, this.port, this.clientId);
      if (this.handle < 0) { reject(new Error('mqtt: cannot connect')); return; }
      __mqttClients.push(this);
    });
  }
  publish(topic: string, payload: string, retain?: boolean, qos?: i32): void { __host_mqttPublish(this.handle, topic, payload, retain === true ? 1 : 0, qos === undefined ? 0 : qos); }
  subscribe(topic: string, cb: (topic: string, payload: string) => void): void {
    const s = new Sub();
    s.filter = topic;
    s.cb = cb;
    this.subs.push(s);
    __host_mqttSubscribe(this.handle, topic);
  }
  close(): void { __host_mqttClose(this.handle); for (const s of this.subs) s.cb = null; }
}
)ZN";

// zinc:__sock: the raw socket rows (src/host/sock.cpp) for plugins/socket/native/socket.next.ts; events arrive through onEvent (kinds 50 to 57).
const char* kHostSockModule = R"ZN(
export function connect(host: string, port: i32): i32 { return __host_sockConnect(host, port); }
export function connectUnix(path: string): i32 { return __host_sockConnectUnix(path); }
export function listen(host: string, port: i32): i32 { return __host_sockListen(host, port); }
export function listenUnix(path: string): i32 { return __host_sockListenUnix(path); }
export function udp(host: string, port: i32): i32 { return __host_sockUdp(host, port); }
export function write(h: i32, data: u8[]): boolean { return __host_sockWrite(h, data) !== 0; }
export function writeText(h: i32, data: string): boolean { return __host_sockWriteText(h, data) !== 0; }
export function sendTo(h: i32, host: string, port: i32, data: u8[]): boolean { return __host_sockSendTo(h, host, port, data) !== 0; }
export function end(h: i32): void { __host_sockEnd(h); }
export function close(h: i32): void { __host_sockClose(h); }
export function localPort(h: i32): i32 { return __host_sockLocalPort(h); }
export function remoteAddress(h: i32): string { return __host_sockRemoteAddr(h); }
export function remotePort(h: i32): i32 { return __host_sockRemotePort(h); }
export function lookup(host: string): i32 { return __host_sockLookup(host); }
export function error(): string { return __host_sockError(); }
export function onEvent(cb: (h: i32, kind: i32, data: string) => void): void { __addEvHandler(cb); }
/** The raw bytes of the event being delivered, as a string that only utf8Encode (byte for byte) should read. */
export function payload(): string { return __host_evPayload(); }
)ZN";

// zinc:__crypto: the PSA operations of src/host/crypto.cpp for crypto.subtle (lib/std/web.ts); bytes in and out as u8[].
const char* kHostCryptoModule = R"ZN(
import { utf8Encode } from 'zinc:sys';
export function op(name: string, a: u8[], b: u8[], c: u8[], d: u8[], n: i32, m: i32): u8[] {
  const r = __host_crypto(name, a, b, c, d, n, m);
  const e = __host_cryptoError();
  if (e.length > 0) throw new Error(e);
  return utf8Encode(r);
}
)ZN";

// zinc:gpio: the simulated board of runtime/mod/gpio.cpp (macos, linux, sim): 64 pins, edges with debounce delivered as microtasks, and ZINC_GPIO_SCRIPT="27:0@100,27:1@150"
// (pin:value@milliseconds) driving inputs after the program starts. The Linux libgpiod backend is a plugin of the target.
const char* kGpioModule = R"ZN(
import { env } from 'zinc:sys';
export class PinEdge { pin: u8 = 0; value: u8 = 0; timestampMs: f64 = 0; }
class Pin {
  out: boolean = false;
  value: u8 = 0;
  edge: i32 = 2;  // 0 rising, 1 falling, 2 both
  debounce: i32 = 0;
  last: f64 = -1e9;
  cb: ((e: PinEdge) => void) | null = null;
}
const pins: Pin[] = [];
let inited: boolean = false;
function pinOf(n: u8): Pin { return pins[n & 63]; }
function deliver(pin: u8, value: u8): void {
  const p = pinOf(pin);
  const old = p.value;
  p.value = value;
  const cb = p.cb;
  if (cb === null || old === value) return;
  const rising = value > old;
  if (p.edge === 0 && !rising) return;
  if (p.edge === 1 && rising) return;
  const t = performance.now();
  if (t - p.last < p.debounce) return;
  p.last = t;
  const e = new PinEdge();
  e.pin = pin;
  e.value = value;
  e.timestampMs = t;
  const f: (e: PinEdge) => void = cb;
  queueMicrotask(() => { f(e); });
}
function init(): void {
  if (inited) return;
  inited = true;
  for (let i: i32 = 0; i < 64; i++) pins.push(new Pin());
  const script = env('ZINC_GPIO_SCRIPT');
  const steps = script.split(',');
  for (let k: i32 = 0; k < steps.length && k < 64; k++) {
    const s = steps[k];
    const colon = s.indexOf(':');
    if (colon < 0) break;
    const at = s.indexOf('@');
    const pin = parseInt(s.slice(0, colon)) as u8;
    const value = parseInt(at < 0 ? s.slice(colon + 1) : s.slice(colon + 1, at)) as u8;
    const ms = at < 0 ? 0 : parseFloat(s.slice(at + 1));
    setTimeout(() => { deliver(pin, value); }, ms);
  }
}
export function setup(pin: u8, mode: string, pull: string): void {
  init();
  const p = pinOf(pin);
  p.out = mode.length > 0 && mode.charAt(0) === 'o';
  p.value = (!p.out && pull.length > 0 && pull.charAt(0) === 'u') ? 1 : 0;
}
export function write(pin: u8, value: u8): void { init(); pinOf(pin).value = value !== 0 ? 1 : 0; }
export function read(pin: u8): u8 { init(); return pinOf(pin).value; }
export function watch(pin: u8, edge: string, debounceMs: u16, cb: (e: PinEdge) => void): void {
  init();
  const p = pinOf(pin);
  p.edge = edge.length > 0 && edge.charAt(0) === 'r' ? 0 : edge.length > 0 && edge.charAt(0) === 'f' ? 1 : 2;
  p.debounce = debounceMs;
  p.cb = cb;
  p.last = -1e9;
}
export function simulate(pin: u8, value: u8): void { init(); deliver(pin, value !== 0 ? 1 : 0); }
)ZN";

// zinc:telemetry: JSON lines in the format of runtime/mod/telemetry.cpp (hello, metric, event, state_snapshot) to stdout or a file; ZINC_TELEMETRY picks the sink at
// startup. The udp:// sink and the per-frame perf and log messages come with the host's own telemetry (the old runtime hooked the frame loop and the log).
std::string platformName();
std::string telemetryModuleSource() {
  return std::string(R"ZN(
import { env } from 'zinc:sys';
import { appendText } from 'zinc:fs';
let __mode: i32 = -1;
let __file: string = '';
let __seq: i32 = 0;
let __lastSnap: f64 = 0;
class Exposed { name: string; get: () => number; constructor(name: string, get: () => number) { this.name = name; this.get = get; } }
const __exposed: Exposed[] = [];
function jsonStr(s: string): string {
  let out = '"';
  for (let i: i32 = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34) out += '\\"';
    else if (c === 92) out += '\\\\';
    else if (c === 10) out += '\\n';
    else if (c === 13) out += '\\r';
    else if (c === 9) out += '\\t';
    else if (c === 8) out += '\\b';
    else if (c === 12) out += '\\f';
    else if (c < 32) out += '\\u00' + '0123456789abcdef'.charAt(c >> 4) + '0123456789abcdef'.charAt(c & 15);
    else out += s.charAt(i);
  }
  return out + '"';
}
function jsonNum(v: number): string { return v - v === 0 ? `${v}` : 'null'; }
function line(s: string): void {
  if (__mode === 2) console.log(s);
  else if (__mode === 3) appendText(__file, s + '\n');
}
function head(type: string): string {
  const seq = __seq;
  __seq++;
  return '{"type":"' + type + '","ts":' + jsonNum(performance.now()) + ',"seq":' + seq + ',"payload":';
}
function snapshot(): void {
  if (__exposed.length === 0) return;
  let b = head('state_snapshot') + '{"vars":{';
  for (let i: i32 = 0; i < __exposed.length; i++) { if (i > 0) b += ','; b += jsonStr(__exposed[i].name) + ':' + jsonNum(__exposed[i].get()); }
  line(b + '}}}');
}
function sample(): void {  // the old runtime sampled from the event loop at 10 Hz; here each telemetry call takes a due snapshot, so the timers of the program alone keep it alive
  const t = performance.now();
  if (t - __lastSnap >= 100) { __lastSnap = t; snapshot(); }
}
function open(target: string): void {
  __mode = 0;
  if (target === '') return;
  if (target === 'stdout') __mode = 2;
  else if (target.startsWith('file:')) { __file = target.slice(5); __mode = 3; }
  if (__mode === 0) return;
  line(head('hello') + '{"version":"0.1","platform":")ZN") + platformName() + R"ZN(","features":["perf","logs","state","metrics"]}}');
}
function ensure(): boolean { if (__mode < 0) open(env('ZINC_TELEMETRY')); return __mode > 0; }
export function connect(target: string): void { if (__mode > 0) return; open(target); }
export function enabled(): boolean { return ensure(); }
function metric(kind: string, name: string, v: number): void {
  if (!ensure()) return;
  sample();
  line(head('metric') + '{"kind":"' + kind + '","name":' + jsonStr(name) + ',"value":' + jsonNum(v) + '}}');
}
export function counter(name: string, delta: number): void { metric('counter', name, delta); }
export function gauge(name: string, value: number): void { metric('gauge', name, value); }
export function event(name: string, data: string): void {
  if (!ensure()) return;
  sample();
  line(head('event') + '{"name":' + jsonStr(name) + ',"data":' + jsonStr(data) + '}}');
}
export function expose(name: string, get: () => number): void {
  ensure();
  if (__exposed.length < 64) __exposed.push(new Exposed(name, get));
}
)ZN";
}

// zinc:platform: the capabilities of the profile this engine runs as, constants like compiler/src/capabilities.ts platformModule (targets/capabilities.json).
std::string platformName() {
#if defined(__APPLE__)
  return "macos";
#else
  return "linux";
#endif
}
std::string platformModuleSource(const std::string& capsFile) {
  std::string target = platformName(), text;
  int w = 320, h = 240;
  if (const char* sz = std::getenv("ZINC_SIZE")) { int a = 0, b = 0; if (std::sscanf(sz, "%dx%d", &a, &b) == 2 && a > 0 && b > 0) { w = a; h = b; } }
  std::string src = "// Generated by zinc for this run (the capabilities of the target profile).\n";
  src += "export const TARGET: string = \"" + target + "\";\nexport const PROFILE: string = \"" + target + "\";\n";
  src += "export const HEAP_BYTES: i32 = 536870912;\nexport const NUMBERS: string = \"f64\";\n";
  src += "export const SCREEN_W: i32 = " + std::to_string(w) + ";\nexport const SCREEN_H: i32 = " + std::to_string(h) + ";\nexport const FPU: boolean = true;\n";
  std::ifstream in(capsFile);
  std::stringstream ss;
  ss << in.rdbuf();
  text = ss.str();
  yyjson_doc* doc = yyjson_read_opts(const_cast<char*>(text.data()), text.size(), YYJSON_READ_NOFLAG, nullptr, nullptr);
  if (doc) {
    yyjson_val* t = yyjson_obj_get(yyjson_doc_get_root(doc), target.c_str());
    size_t i, n;
    yyjson_val *k, *v;
    if (yyjson_is_obj(t)) yyjson_obj_foreach(t, i, n, k, v) {
      std::string key = yyjson_get_str(k);
      if (key == "heap" || key == "numbers" || key == "width" || key == "height" || key == "fpu") continue;
      bool on = (yyjson_is_bool(v) && yyjson_get_bool(v)) || (yyjson_is_num(v) && yyjson_get_num(v) > 0) || (yyjson_is_str(v) && (std::string(yyjson_get_str(v)) == "plugin" || std::string(yyjson_get_str(v)) == "optional"));
      for (char& c : key) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
      src += "export const " + key + ": boolean = " + (on ? "true" : "false") + ";\n";
    }
    yyjson_doc_free(doc);
  }
  return src;
}

const char* hostModuleSource(std::string_view spec) {
  if (spec == "zinc:events") return kEventsModule;
  if (spec == "zinc:gpio") return kGpioModule;
  if (spec == "zinc:osc") return kOscModule;
  if (spec == "zinc:__sock") return kHostSockModule;
  if (spec == "zinc:__crypto") return kHostCryptoModule;
  if (spec == "zinc:mqtt") return kMqttModule;
  if (spec == "zinc:gfx") return kGfxModule;
  if (spec == "zinc:sys") return kSysModule;
  if (spec == "zinc:fs") return kFsModule;
  if (spec == "zinc:storage") return kStorageModule;
  if (spec == "zinc:assets") return kAssetsModule;
  if (spec == "zinc:os") return kOsModule;
  if (spec == "zinc:__proc") return kHostProcModule;
  if (spec == "zinc:net") return kNetModule;
  if (spec == "zinc:native") return kNativeModule;
  return nullptr;
}

// The names a destructuring pattern binds (`[a, , { b, c: d }, ...rest]`).
void collectBound(const Ast& A, std::uint32_t pat, std::vector<std::string_view>& out) {
  if (pat == kNone) return;
  const Node& p = A.nodes[pat];
  if (p.kind == N::Ident) { out.push_back(p.text); return; }
  for (std::uint32_t k : p.kids) {
    if (k == kNone) continue;
    const Node& c = A.nodes[k];
    if (c.kind == N::PatProp || c.kind == N::Spread) { if (!c.kids.empty()) collectBound(A, c.kids[0], out); else out.push_back(c.text); }
    else collectBound(A, k, out);
  }
}

struct Loader {
  Program& prog;
  const ReadFile& read;
  std::map<std::string, std::uint32_t> done;   // path -> module index
  std::map<std::string, bool> visiting;
  std::vector<std::uint32_t> flat;             // the program's statements in module order
  std::string stdRoot;                         // lib/std: where 'zinc:ui' and the other standard modules live
  std::map<std::string, std::string> plugins;  // 'zinc:lottie' -> plugins/lottie/index.ts (read from plugin.json files)
  std::set<std::string> pluginDirsRead;
  // Reads the plugin.json files of `<root>/*/`: the engine's plugins/ next to lib/, and the plugins/ directory of the project that imports
  // (every directory above the importing file may hold one, like the old compiler's project plugins).
  void readPluginsIn(const std::string& dir) {
    if (!pluginDirsRead.insert(dir).second) return;
    namespace fs = std::filesystem;
    std::error_code ec;
    for (const auto& e : fs::directory_iterator(dir, ec)) {
      std::string text;
      std::string manifest = (e.path() / "plugin.json").string();
      if (!read(manifest, text)) continue;
      PluginManifest pm;
      std::string err;
      std::vector<std::string> warnings;
      if (!parsePluginManifest(text, pm, err, warnings)) { std::fprintf(stderr, "zinc: %s: %s\n", manifest.c_str(), err.c_str()); continue; }
      for (const std::string& w : warnings) std::fprintf(stderr, "zinc: %s: %s\n", manifest.c_str(), w.c_str());
      std::string mod = pm.module, entry = pm.entry;
      if (!mod.empty() && pm.kind == "module" && !plugins.count(mod)) plugins[mod] = (e.path() / entry).string();
    }
  }
  void readPlugins(const std::string& fromFile) {
    namespace fs = std::filesystem;
    for (fs::path d = fs::path(fromFile).parent_path(); !d.empty() && d != d.root_path(); d = d.parent_path()) readPluginsIn((d / "plugins").string());
    if (!stdRoot.empty()) readPluginsIn((fs::path(stdRoot).parent_path().parent_path() / "plugins").string());
  }

  Loader(Program& p, const ReadFile& r) : prog(p), read(r) {}

  // ---- tsconfig.json paths: `inferno`, `@pocketjs/framework/solid`, `three` and the like
  struct TsEntry { bool found = false; std::string dir; TsConfig cfg; };
  std::map<std::string, TsEntry> tsconfigs;  // by directory searched from
  const TsEntry& tsconfigFor(const std::string& dir) {
    auto it = tsconfigs.find(dir);
    if (it != tsconfigs.end()) return it->second;
    TsEntry e;
    for (std::string d = dir;;) {
      std::string text;
      if (read(d.empty() ? "tsconfig.json" : d + "/tsconfig.json", text)) {
        std::string err;
        if (parseTsConfig(text, e.cfg, err)) { e.found = true; e.dir = d; }
        else std::fprintf(stderr, "zinc: %s/tsconfig.json: %s\n", d.c_str(), err.c_str());
        break;
      }
      std::size_t slash = d.find_last_of('/');
      if (d.empty() || slash == std::string::npos) { if (!d.empty()) { d.clear(); continue; } break; }
      d = d.substr(0, slash);
    }
    return tsconfigs[dir] = std::move(e);
  }
  // Loads the file a path candidate names (as written or with an extension or /index); kNone when no such file.
  std::uint32_t loadCandidate(const std::string& base, bool& found) {
    found = true;
    std::string text;
    std::string stem = base;
    for (const char* js : {".js", ".mjs"}) if (stem.size() > std::strlen(js) && stem.compare(stem.size() - std::strlen(js), std::strlen(js), js) == 0) { stem.resize(stem.size() - std::strlen(js)); break; }
    for (const std::string& cand : {base, base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx", base + ".js", base + ".mjs", stem + ".ts", stem + ".tsx"}) {
      if (done.count(cand)) return done[cand];
      if (visiting.count(cand)) return kNone;
      if (read(cand, text)) return load(cand, std::move(text));
    }
    found = false;
    return kNone;
  }
  // True when a `paths` entry matches `spec` (the module, or kNone after a diagnostic, goes to `result`).
  bool resolveByPaths(std::uint32_t fromFile, std::uint32_t node, const std::string& spec, std::uint32_t& result) {
    std::string fromDir = dirOf(prog.files[fromFile].path);
    const TsEntry& ts = tsconfigFor(fromDir);
    if (!ts.found) return false;
    std::string matched;
    std::vector<std::string> targets = mapSpecifier(ts.cfg, spec, matched);
    if (targets.empty()) return false;
    std::string root = ts.dir;
    if (!ts.cfg.baseUrl.empty()) root = normalize(root + (root.empty() ? "" : "/") + ts.cfg.baseUrl);
    std::string tried;
    for (const std::string& t : targets) {
      std::string path = normalize(root + (root.empty() ? "" : "/") + t);
      bool found;
      std::uint32_t m = loadCandidate(path, found);
      if (found) { result = m; return true; }
      tried += (tried.empty() ? "" : ", ") + path;
    }
    diag(kZModuleNotFound, fromFile, node, "'" + spec + "' (tsconfig.json paths '" + matched + "' -> " + tried + ": no such file)");
    result = kNone;
    return true;
  }

  void diag(const char* code, std::uint32_t file, std::uint32_t node, std::string detail) {
    prog.diags.push_back({code, node == kNone ? 0 : prog.ast.nodes[node].start, std::move(detail), file});
  }

  // The module index for an import of `spec` (with quotes) from file `fromFile`, loading it first; kNone on error.
  std::uint32_t resolve(std::uint32_t fromFile, std::uint32_t node, std::string_view quoted) {
    std::string spec(quoted.substr(1, quoted.size() - 2));
    if (spec.rfind("zinc:", 0) == 0) {
      if (done.count(spec)) return done[spec];
      if (spec == "zinc:telemetry") return load(spec, telemetryModuleSource());
      if (spec == "zinc:platform") return load(spec, platformModuleSource((std::filesystem::path(stdRoot.empty() ? "." : stdRoot).parent_path().parent_path() / "targets" / "capabilities.json").string()));
      if (const char* src = hostModuleSource(spec)) return load(spec, src);
      static const std::map<std::string, std::string> kStd = {{"zinc:ui", "ui.ts"}, {"zinc:web", "web.ts"}, {"zinc:subtle", "subtle.ts"}, {"zinc:ui/solid", "solid.ts"}, {"zinc:ui/react", "react.ts"}, {"zinc:ui/kit", "kit/index.ts"},
                                                              {"zinc:signals", "signals.ts"}, {"zinc:path", "path.ts"}, {"zinc:assert", "assert.ts"}};
      auto hit = kStd.find(spec);
      readPlugins(prog.files[fromFile].path);
      auto pl = plugins.find(spec);
      if (pl != plugins.end()) {  // a plugin: its module source is Zinc, its native part comes from the sim file of its spec (see below)
        if (done.count(pl->second)) return done[pl->second];
        std::string text;
        if (read(pl->second, text)) return load(pl->second, std::move(text));
      }
      if (hit != kStd.end() && !stdRoot.empty()) {
        std::string path = stdRoot + "/" + hit->second, text;
        if (done.count(path)) return done[path];
        if (visiting.count(path)) { diag(kZUnsupported, fromFile, node, "circular imports ('" + spec + "')"); return kNone; }
        if (read(path, text)) return load(path, std::move(text));
      }
      diag(kZModuleNotFound, fromFile, node, "'" + spec + "'");
      return kNone;
    }
    if (spec.rfind("./", 0) != 0 && spec.rfind("../", 0) != 0) {  // a bare specifier: the `paths` of the nearest tsconfig.json
      std::uint32_t viaPaths = kNone;
      if (resolveByPaths(fromFile, node, spec, viaPaths)) return viaPaths;
      diag(kZModuleNotFound, fromFile, node, "'" + spec + "' (no tsconfig.json paths entry maps it)");
      return kNone;
    }
    std::string base = normalize(dirOf(prog.files[fromFile].path) + (dirOf(prog.files[fromFile].path).empty() ? "" : "/") + spec);
    std::string text;
    // `native/x.spec` (requireNative<Spec>('X')) has no native code in this engine: its sibling x.sim.ts, a Zinc implementation of the same API
    // that the old simulator ran, takes its place (deterministic and headless)
    if (base.size() > 5 && base.compare(base.size() - 5, 5, ".spec") == 0) {
      // x.next.ts, written for this engine, wins over the x.sim.ts that the old simulator ran (which may use TypeScript the Zinc subset does not have)
      for (const char* suffix : {".next.ts", ".sim.ts"}) {
        std::string simPath = base.substr(0, base.size() - 5) + suffix;
        if (done.count(simPath)) return done[simPath];
        if (read(simPath, text)) {
          std::string specText;
          if (read(base + ".ts", specText)) specOf[simPath] = std::move(specText);  // the Spec the sim implements: the calls are checked against it
          return load(simPath, std::move(text));
        }
      }
    }
    for (const char* ext : {"", ".ts", ".tsx", "/index.ts"}) {
      std::string cand = base + ext;
      if (done.count(cand)) return done[cand];
      if (visiting.count(cand)) { diag(kZUnsupported, fromFile, node, "circular imports ('" + spec + "')"); return kNone; }
      if (read(cand, text)) return load(cand, std::move(text));
    }
    diag(kZModuleNotFound, fromFile, node, "'" + spec + "'");
    return kNone;
  }

  std::map<std::string, std::string> specOf;  // sim path -> the text of its native/x.spec.ts
  // The sim of a native module implements the methods of its Spec, possibly with fewer parameters (TypeScript lets a function drop trailing ones);
  // its calls from the plugin are written against the Spec. The default-exported object's functions get the parameters they leave out, unused.
  void padToSpec(Ast& A, std::uint32_t root, const std::string& specText) {
    ParseResult sp = parse(specText);
    if (sp.ast.root == kNone || !sp.diags.empty()) return;
    std::map<std::string, std::vector<std::string>> methods;  // name -> parameter types, as written
    for (std::uint32_t st : sp.ast.nodes[sp.ast.root].kids) {
      std::uint32_t d = st;
      if (sp.ast.nodes[d].kind == N::Export && !sp.ast.nodes[d].kids.empty()) d = sp.ast.nodes[d].kids[0];
      if (sp.ast.nodes[d].kind != N::Interface || sp.ast.nodes[d].text != "Spec") continue;
      for (std::size_t k = 1; k < sp.ast.nodes[d].kids.size(); ++k) {
        const Node& m = sp.ast.nodes[sp.ast.nodes[d].kids[k]];
        if (m.kind != N::Method) continue;
        std::vector<std::string> ps;
        for (std::size_t j = 2; j < m.kids.size(); ++j) {
          std::uint32_t ty = sp.ast.nodes[m.kids[j]].kids[0];
          if (ty == kNone) { ps.clear(); break; }
          ps.push_back(std::string(specText.substr(sp.ast.nodes[ty].start, sp.ast.nodes[ty].end - sp.ast.nodes[ty].start)));
        }
        methods[std::string(m.text)] = std::move(ps);
      }
    }
    for (std::uint32_t st : std::vector<std::uint32_t>(A.nodes[root].kids)) {
      if (A.nodes[st].kind != N::Export || !(A.nodes[st].flags & kFlagDefault) || A.nodes[st].kids.empty()) continue;
      const Node& vd = A.nodes[A.nodes[st].kids[0]];
      if (vd.kind != N::VarDecl || vd.kids.empty() || A.nodes[vd.kids[0]].kids.size() < 2) continue;
      std::uint32_t lit = A.nodes[vd.kids[0]].kids[1];
      if (lit == kNone || A.nodes[lit].kind != N::ObjectLit) continue;
      for (std::uint32_t pr : std::vector<std::uint32_t>(A.nodes[lit].kids)) {
        const Node& prop = A.nodes[pr];
        if (prop.kind != N::Prop || prop.kids.empty()) continue;
        std::uint32_t fe = prop.kids[0];
        auto it = methods.find(std::string(prop.text));
        if (it == methods.end() || A.nodes[fe].kind != N::FuncExpr) continue;
        std::size_t have = A.nodes[fe].kids.size() - 2;
        for (std::size_t j = have; j < it->second.size(); ++j) {
          static std::deque<std::string> sources;  // the nodes view the text of the snippet: it must outlive them
          sources.push_back("(__u" + std::to_string(j) + ": " + it->second[j] + ") => 0;");
          std::vector<std::uint32_t> r = snippet(A, sources.back(), {}, fe);
          if (r.empty() || A.nodes[r[0]].kind != N::ExprStmt) break;
          std::uint32_t lam = A.nodes[r[0]].kids[0];
          if (A.nodes[lam].kind != N::FuncExpr || A.nodes[lam].kids.size() < 3) break;
          A.nodes[fe].kids.push_back(A.nodes[lam].kids[2]);
        }
      }
    }
  }
  std::uint32_t load(const std::string& path, std::string text) {
    auto fi = static_cast<std::uint32_t>(prog.files.size());
    bool isTsx = path.size() > 4 && path.compare(path.size() - 4, 4, ".tsx") == 0;
    if (text.find("StyleSheet") != std::string::npos && (isTsx || (path.size() > 3 && path.compare(path.size() - 3, 3, ".ts") == 0))) text = lowerStyleSheets(text, prog.diags, fi, isTsx);
    if (path.size() > 4 && path.compare(path.size() - 4, 4, ".tsx") == 0) {
      std::size_t before = prog.diags.size();
      text = lowerJsx(text, prog.diags, fi);
      if (const char* d = std::getenv("ZN_DUMP_JSX")) if (path.find(d) != std::string::npos) std::fprintf(stderr, "=== %s (JSX lowered)\n%s\n", path.c_str(), text.c_str());  // debugging: the plain code a .tsx file became
      if (prog.diags.size() > before) {  // the JSX did not lower: no point parsing it as it is
        prog.files.push_back({path, std::move(text)});
        done[path] = kNone;
        return kNone;
      }
    }
    prog.files.push_back({path, std::move(text)});
    visiting[path] = true;
    ParseResult pr = parse(prog.files[fi].text);
    for (Diag& d : pr.diags) { d.file = fi; prog.diags.push_back(d); }
    std::uint32_t result = kNone;
    if (pr.ast.root != kNone && pr.diags.empty()) {
      Ast& A = prog.ast;
      auto off = static_cast<std::uint32_t>(A.nodes.size());
      for (Node& n : pr.ast.nodes) {
        n.file = fi;
        for (std::uint32_t& k : n.kids) if (k != kNone) k += off;
        A.nodes.push_back(std::move(n));
      }
      for (auto& [k, v] : pr.ast.tparams) { auto& d = A.tparams[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      for (auto& [k, v] : pr.ast.targs) { auto& d = A.targs[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      if (auto sp = specOf.find(path); sp != specOf.end()) padToSpec(A, pr.ast.root + off, sp->second);
      ModuleInfo mod;
      std::vector<std::pair<std::string, std::uint32_t>> namespaces;  // `import * as ns` of this module: alias, module
      mod.path = path;
      mod.file = fi;
      for (std::uint32_t st : std::vector<std::uint32_t>(A.nodes[pr.ast.root + off].kids)) {
        const Node& x = A.nodes[st];
        switch (x.kind) {
          case N::Import: {
            std::uint32_t from = resolve(fi, st, x.text);
            if (from == kNone) break;
            for (std::uint32_t sp : std::vector<std::uint32_t>(x.kids)) {
              if (A.nodes[sp].text == "*") { namespaces.push_back({std::string(A.nodes[A.nodes[sp].kids[0]].text), from}); continue; }
              mod.imports.push_back({from, A.nodes[sp].text, A.nodes[A.nodes[sp].kids[0]].text, sp});
            }
            break;
          }
          case N::ExportAll: {
            std::uint32_t from = resolve(fi, st, x.text);
            if (from != kNone) mod.exports.push_back({{}, {}, from, true, st});
            break;
          }
          case N::ExportList: {
            std::uint32_t from = kNone;
            if (!x.text.empty()) { from = resolve(fi, st, x.text); if (from == kNone) break; }
            for (std::uint32_t sp : std::vector<std::uint32_t>(x.kids)) mod.exports.push_back({A.nodes[A.nodes[sp].kids[0]].text, A.nodes[sp].text, from, false, sp});
            break;
          }
          case N::Export: {
            std::uint32_t d = x.kids[0];
            const Node& dn = A.nodes[d];
            bool isDefault = (x.flags & kFlagDefault) != 0;
            if (dn.kind == N::VarDecl) {
              for (std::uint32_t dc : std::vector<std::uint32_t>(dn.kids)) {
                if (A.nodes[dc].text.empty()) {  // `export const [a, b] = ...` / `export const { a, b } = ...`: every bound name is exported
                  std::vector<std::string_view> names;
                  collectBound(A, A.nodes[dc].kids.size() > 2 ? A.nodes[dc].kids[2] : kNone, names);
                  for (std::string_view nm : names) mod.exports.push_back({nm, nm, kNone, false, dc});
                  continue;
                }
                mod.exports.push_back({isDefault ? std::string_view("default") : A.nodes[dc].text, A.nodes[dc].text, kNone, false, dc});
              }
            } else mod.exports.push_back({isDefault ? std::string_view("default") : dn.text, dn.text, kNone, false, d});
            mod.stmts.push_back(d);
            break;
          }
          default: mod.stmts.push_back(st);
        }
      }
      // `import * as ns`: every `ns.name` of this file becomes the named import `ns$name`
      for (const auto& [alias, from] : namespaces) {
        std::set<std::string> added;
        for (std::size_t k = off; k < A.nodes.size(); ++k) {
          Node& nd = A.nodes[k];
          if (nd.file != fi) continue;
          std::string prop;
          if (nd.kind == N::Member && !nd.kids.empty() && nd.kids[0] != kNone && A.nodes[nd.kids[0]].kind == N::Ident && A.nodes[nd.kids[0]].text == alias) {
            prop = std::string(nd.text);
            A.generated.push_back(alias + "$" + prop);
            nd.kind = N::Ident; nd.text = A.generated.back(); nd.kids.clear();
          } else if (nd.kind == N::TypeRef && nd.text.size() > alias.size() + 1 && nd.text.compare(0, alias.size() + 1, alias + ".") == 0) {
            prop = std::string(nd.text.substr(alias.size() + 1));
            A.generated.push_back(alias + "$" + prop);
            nd.text = A.generated.back();
          } else continue;
          if (from == kNone || !added.insert(prop).second) continue;
          A.generated.push_back(prop);
          std::string_view propText = A.generated.back();
          A.generated.push_back(alias + "$" + prop);
          mod.imports.push_back({from, propText, A.generated.back(), static_cast<std::uint32_t>(k)});
        }
      }
      result = static_cast<std::uint32_t>(A.modules.size());
      for (std::uint32_t st : mod.stmts) flat.push_back(st);
      A.modules.push_back(std::move(mod));
    }
    visiting.erase(path);
    done[path] = result;
    return result;
  }
};

// The built-in classes of exceptions, written in Zinc and added when a program throws, catches or mentions them.
const char* kErrorPrelude = R"ZN(
class Error {
  message: string;
  name: string = 'Error';
  constructor(message: string) { this.message = message; }
  __errorString(): string { return this.message === '' ? this.name : this.name + ': ' + this.message; }
}
class TypeError extends Error { constructor(message: string) { super(message); this.name = 'TypeError'; } }
class RangeError extends Error { constructor(message: string) { super(message); this.name = 'RangeError'; } }
class SyntaxError extends Error { constructor(message: string) { super(message); this.name = 'SyntaxError'; } }
)ZN";

// Math.random and Math.seed: the generator of the old runtime (xorshift32, default seed 0x2545F491), so seeded programs print the same numbers.
// The checker rewrites the two calls into these functions; the prelude is added when a program mentions them.
const char* kArrayFromPrelude = R"ZN(
function __arrayFromLength<T>(n: number, f: (v: i32, i: i32) => T): T[] {
  const r: T[] = [];
  for (let i: i32 = 0; i < n; i++) r.push(f(0, i));
  return r;
}
)ZN";
const char* kRandomPrelude = R"ZN(
let __rng: u32 = 0x2545F491;
function __mathSeed(s: u32): void { __rng = s !== 0 ? s : 0x2545F491; }
function __mathRandom(): f64 {
  __rng = __rng ^ (__rng << 13);
  __rng = __rng ^ (__rng >>> 17);
  __rng = __rng ^ (__rng << 5);
  return __rng / 4294967296;
}
)ZN";

// console.count, countReset, assert, time, timeEnd and timeLog: the checker-visible calls are rewritten to these functions (modules.cpp, below).
// Like console.error they print to the one text stream; the timers read the engine clock, so they need the async prelude.
// Regular expressions (ZN-090): libregexp of QuickJS-ng through host rows (src/host/regexp.cpp). Indices are UTF-16 code units like the strings of Zinc. Deviations
// from JavaScript (typed): exec returns a string[] with '' for a group that did not take part, the extra properties of the result are on RegExpMatch (RegExp.match),
// matchAll returns an array, and a replace callback gets the match and the groups only (no offset and subject).
const char* kRegExpPrelude = R"ZN(
class RegExpMatch {
  index: i32 = 0;
  input: string = '';
  captures: string[] = [];
  present: boolean[] = [];
  groups: Map<string, string> = new Map<string, string>();
  get(i: i32): string { return i >= 0 && i < this.captures.length ? this.captures[i] : ''; }
  group(name: string): string { const v = this.groups.get(name); return v === null ? '' : v; }
}
class RegExp {
  source: string;
  flags: string;
  lastIndex: i32 = 0;
  global: boolean = false;
  ignoreCase: boolean = false;
  multiline: boolean = false;
  dotAll: boolean = false;
  unicode: boolean = false;
  unicodeSets: boolean = false;
  sticky: boolean = false;
  hasIndices: boolean = false;
  handle: i32 = -1;
  groupCount: i32 = 0;
  names: string[] = [];
  constructor(pattern: string, flags: string = '') {
    const order = 'dgimsuvy';
    let canon = '';
    for (let i: i32 = 0; i < order.length; i++) if (flags.indexOf(order.charAt(i)) >= 0) canon += order.charAt(i);
    let ok = canon.length === flags.length;
    for (let i: i32 = 0; i < flags.length; i++) if (flags.indexOf(flags.charAt(i)) !== flags.lastIndexOf(flags.charAt(i)) || order.indexOf(flags.charAt(i)) < 0) ok = false;
    if (flags.indexOf('u') >= 0 && flags.indexOf('v') >= 0) ok = false;
    if (!ok) throw new SyntaxError("Invalid flags supplied to RegExp constructor '" + flags + "'");
    this.source = pattern;
    this.flags = canon;
    this.hasIndices = canon.indexOf('d') >= 0;
    this.global = canon.indexOf('g') >= 0;
    this.ignoreCase = canon.indexOf('i') >= 0;
    this.multiline = canon.indexOf('m') >= 0;
    this.dotAll = canon.indexOf('s') >= 0;
    this.unicode = canon.indexOf('u') >= 0;
    this.unicodeSets = canon.indexOf('v') >= 0;
    this.sticky = canon.indexOf('y') >= 0;
    const h = __host_reCompile(pattern, canon);
    if (h < 0) throw new SyntaxError('Invalid regular expression: /' + pattern + '/' + canon + ': ' + __host_reError());
    this.handle = h;
    this.groupCount = __host_reInfo(h, 0) - 1;
    for (let i: i32 = 0; i <= this.groupCount; i++) this.names.push(i === 0 ? '' : __host_reName(h, i));
  }
  // Runs from lastIndex (global and sticky) or from 0; the capture positions stay in the host until the next run.
  run(s: string): boolean {
    let from: i32 = 0;
    const keep = this.global || this.sticky;
    if (keep) {
      from = this.lastIndex;
      if (from > s.length) { this.lastIndex = 0; return false; }
    }
    const rc = __host_reExec(this.handle, s, from);
    if (rc < 0) throw new RangeError(__host_reError());
    if (rc === 0) { if (keep) this.lastIndex = 0; return false; }
    if (keep) this.lastIndex = __host_reCapture(1);
    return true;
  }
  // A search that ignores lastIndex and the global flag.
  find(s: string, from: i32): boolean {
    if (from > s.length) return false;
    const rc = __host_reExec(this.handle, s, from);
    if (rc < 0) throw new RangeError(__host_reError());
    return rc === 1;
  }
  test(s: string): boolean { return this.run(s); }
  // The captured texts of the last run ('' for a group that did not take part).
  taken(s: string): string[] {
    const r: string[] = [];
    for (let i: i32 = 0; i <= this.groupCount; i++) {
      const a = __host_reCapture(2 * i);
      r.push(a < 0 ? '' : s.slice(a, __host_reCapture(2 * i + 1)));
    }
    return r;
  }
  exec(s: string): string[] | null { return this.run(s) ? this.taken(s) : null; }
  match(s: string): RegExpMatch | null {
    if (!this.run(s)) return null;
    const m = new RegExpMatch();
    m.index = __host_reCapture(0);
    m.input = s;
    for (let i: i32 = 0; i <= this.groupCount; i++) {
      const a = __host_reCapture(2 * i);
      m.present.push(a >= 0);
      m.captures.push(a < 0 ? '' : s.slice(a, __host_reCapture(2 * i + 1)));
      if (i > 0 && this.names[i].length > 0) m.groups.set(this.names[i], a < 0 ? '' : m.captures[i]);
    }
    return m;
  }
  step(s: string, i: i32): i32 {  // AdvanceStringIndex
    if (this.unicode || this.unicodeSets) {
      const c = s.charCodeAt(i);
      if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xDC00 && d < 0xE000) return i + 2; }
    }
    return i + 1;
  }
  toString(): string { return '/' + this.source + '/' + this.flags; }
}
function __reLit(pattern: string, flags: string): RegExp { return new RegExp(pattern, flags); }
// Every match from `from` as positions: for match m the 2 * (groups + 1) numbers from m * w (-1 for a group that did not take part).
function __reAll(re: RegExp, s: string, from: i32): i32[] {
  const cnt = __host_reExecAll(re.handle, s, from);
  if (cnt < 0) throw new RangeError(__host_reError());
  const r: i32[] = [];
  const total = cnt * 2 * (re.groupCount + 1);
  for (let k: i32 = 0; k < total; k++) r.push(__host_reAll(k));
  return r;
}
function __reGroup(s: string, pos: i32[], base: i32, g: i32): string {
  const a = pos[base + 2 * g];
  return a < 0 ? '' : s.slice(a, pos[base + 2 * g + 1]);
}
// `$1`, `$&`, `` $` ``, `$'`, `$<name>` and `$$` of a replacement template, for the match of `pos` at `base`.
function __reExpand(tpl: string, s: string, re: RegExp, pos: i32[], base: i32): string {
  if (tpl.indexOf('$') < 0) return tpl;
  const a0 = pos[base];
  const b0 = pos[base + 1];
  let out = '';
  let i: i32 = 0;
  while (i < tpl.length) {
    const c = tpl.charAt(i);
    if (c !== '$' || i + 1 >= tpl.length) { out += c; i++; continue; }
    const d = tpl.charAt(i + 1);
    if (d === '$') { out += '$'; i += 2; }
    else if (d === '&') { out += s.slice(a0, b0); i += 2; }
    else if (d === '`') { out += s.slice(0, a0); i += 2; }
    else if (d === "'") { out += s.slice(b0); i += 2; }
    else if (d >= '0' && d <= '9') {
      let n: i32 = d.charCodeAt(0) - 48;
      let len: i32 = 2;
      if (i + 2 < tpl.length) {
        const e = tpl.charAt(i + 2);
        if (e >= '0' && e <= '9' && n * 10 + (e.charCodeAt(0) - 48) <= re.groupCount) { n = n * 10 + (e.charCodeAt(0) - 48); len = 3; }
      }
      if (n >= 1 && n <= re.groupCount) { out += __reGroup(s, pos, base, n); i += len; }
      else { out += '$'; i++; }
    } else if (d === '<' && re.names.length > 1) {
      const close = tpl.indexOf('>', i + 2);
      if (close < 0) { out += '$'; i++; continue; }
      const k = re.names.indexOf(tpl.slice(i + 2, close));
      if (k > 0) out += __reGroup(s, pos, base, k);
      i = close + 1;
    } else { out += '$'; i++; }
  }
  return out;
}
// The matches a replace works on: all of them for a global regexp (lastIndex goes back to 0), else the first from lastIndex (sticky) or 0.
function __reMatches(s: string, re: RegExp): i32[] {
  if (re.global) { re.lastIndex = 0; return __reAll(re, s, 0); }
  if (!re.run(s)) return [];
  const r: i32[] = [];
  for (let k: i32 = 0; k < 2 * (re.groupCount + 1); k++) r.push(__host_reCapture(k));
  return r;
}
function __reReplace(s: string, re: RegExp, repl: string, all: boolean): string {
  if (all && !re.global) throw new TypeError('replaceAll must be called with a global RegExp');
  const pos = __reMatches(s, re);
  const w = 2 * (re.groupCount + 1);
  const out: string[] = [];
  let last: i32 = 0;
  for (let base: i32 = 0; base < pos.length; base += w) {
    out.push(s.slice(last, pos[base]));
    out.push(__reExpand(repl, s, re, pos, base));
    last = pos[base + 1];
  }
  out.push(s.slice(last));
  return out.join('');
}
function __reReplaceFn(s: string, re: RegExp, fn: (m: string, g1: string, g2: string, g3: string, g4: string, g5: string, g6: string, g7: string, g8: string, g9: string) => string, all: boolean): string {
  if (all && !re.global) throw new TypeError('replaceAll must be called with a global RegExp');
  const pos = __reMatches(s, re);
  const w = 2 * (re.groupCount + 1);
  const out: string[] = [];
  let last: i32 = 0;
  for (let base: i32 = 0; base < pos.length; base += w) {
    out.push(s.slice(last, pos[base]));
    out.push(fn(__reGroup(s, pos, base, 0), re.groupCount >= 1 ? __reGroup(s, pos, base, 1) : '', re.groupCount >= 2 ? __reGroup(s, pos, base, 2) : '', re.groupCount >= 3 ? __reGroup(s, pos, base, 3) : '',
      re.groupCount >= 4 ? __reGroup(s, pos, base, 4) : '', re.groupCount >= 5 ? __reGroup(s, pos, base, 5) : '', re.groupCount >= 6 ? __reGroup(s, pos, base, 6) : '',
      re.groupCount >= 7 ? __reGroup(s, pos, base, 7) : '', re.groupCount >= 8 ? __reGroup(s, pos, base, 8) : '', re.groupCount >= 9 ? __reGroup(s, pos, base, 9) : ''));
    last = pos[base + 1];
  }
  out.push(s.slice(last));
  return out.join('');
}
function __reMatch(s: string, re: RegExp): string[] | null {
  if (!re.global) return re.exec(s);
  re.lastIndex = 0;
  const pos = __reAll(re, s, 0);
  if (pos.length === 0) return null;
  const w = 2 * (re.groupCount + 1);
  const r: string[] = [];
  for (let base: i32 = 0; base < pos.length; base += w) r.push(s.slice(pos[base], pos[base + 1]));
  return r;
}
function __reMatchAll(s: string, re: RegExp): string[][] {
  if (!re.global) throw new TypeError('String.prototype.matchAll called with a non-global RegExp argument');
  const pos = __reAll(re, s, re.lastIndex);
  const w = 2 * (re.groupCount + 1);
  const r: string[][] = [];
  for (let base: i32 = 0; base < pos.length; base += w) {
    const m: string[] = [];
    for (let g: i32 = 0; g <= re.groupCount; g++) m.push(__reGroup(s, pos, base, g));
    r.push(m);
  }
  return r;
}
function __reSearch(s: string, re: RegExp): i32 { return re.find(s, 0) ? __host_reCapture(0) : -1; }
function __reSplit(s: string, re: RegExp, limit: i32): string[] {
  const r: string[] = [];
  if (limit === 0) return r;
  const size = s.length;
  if (size === 0) { if (!re.find(s, 0)) r.push(s); return r; }
  const pos = __reAll(re, s, 0);
  const w = 2 * (re.groupCount + 1);
  let p: i32 = 0;
  for (let base: i32 = 0; base < pos.length; base += w) {
    const a = pos[base];
    const e = pos[base + 1];
    if (a >= size) break;
    if (e === p) continue;   // an empty match where the last piece ended
    r.push(s.slice(p, a));
    if (limit >= 0 && r.length >= limit) return r;
    for (let g: i32 = 1; g <= re.groupCount; g++) {
      r.push(__reGroup(s, pos, base, g));
      if (limit >= 0 && r.length >= limit) return r;
    }
    p = e;
  }
  r.push(s.slice(p));
  return r;
}
)ZN";

const char* kConsolePrelude = R"ZN(
let __cLabels: string[] = [];
let __cCounts: i32[] = [];
function __cIndex(label: string): i32 {
  for (let k: i32 = 0; k < __cLabels.length; k++) if (__cLabels[k] === label) return k;
  __cLabels.push(label);
  __cCounts.push(0);
  return __cLabels.length - 1;
}
function __consoleCount(label: string = 'default'): void {
  const k = __cIndex(label);
  __cCounts[k] = __cCounts[k] + 1;
  console.log(`${label}: ${__cCounts[k]}`);
}
function __consoleCountReset(label: string = 'default'): void { __cCounts[__cIndex(label)] = 0; }
function __consoleAssert(ok: boolean, msg: string = ''): void {
  if (!ok) console.log(msg === '' ? 'Assertion failed' : `Assertion failed: ${msg}`);
}
)ZN";
const char* kConsoleTimePrelude = R"ZN(
let __tLabels: string[] = [];
let __tStarts: f64[] = [];
function __tIndex(label: string): i32 {
  for (let k: i32 = 0; k < __tLabels.length; k++) if (__tLabels[k] === label) return k;
  return -1;
}
function __consoleTime(label: string = 'default'): void {
  const k = __tIndex(label);
  if (k >= 0) { __tStarts[k] = performance.now(); return; }
  __tLabels.push(label);
  __tStarts.push(performance.now());
}
function __consoleTimeLog(label: string = 'default'): void {
  const k = __tIndex(label);
  if (k >= 0) console.log(`${label}: ${performance.now() - __tStarts[k]}ms`);
}
function __consoleTimeEnd(label: string = 'default'): void {
  const k = __tIndex(label);
  if (k < 0) return;
  console.log(`${label}: ${performance.now() - __tStarts[k]}ms`);
  __tLabels.splice(k, 1);
  __tStarts.splice(k, 1);
}
)ZN";

// Promises, timers and the microtask queue, written in Zinc: added when a program uses async functions, generators, Promise,
// setTimeout or queueMicrotask. Its top-level code (the queues) runs before the program; `__runLoop()` runs after it.
const char* kAsyncPrelude = R"ZN(
abstract class Job { abstract run(): void; }
class FnJob extends Job {
  constructor(public f: () => void) { super(); }
  run(): void { this.f(); }
}
class Timer {
  constructor(public at: f64, public ord: f64, public seq: i32, public id: i32, public every: f64, public f: () => void) {}  // at: when the virtual clock reads it; ord: the order among timers (Node counts a delay of 0 as 1)
}
let __jobs: Job[] = [];
let __jobHead: i32 = 0;
let __timers: Timer[] = [];
let __clock: f64 = 0;
let __timerSeq: i32 = 0;

function __enqueue(j: Job): void { __jobs.push(j); }
function queueMicrotask(f: () => void): void { __jobs.push(new FnJob(f)); }
let __cancelled: i32[] = [];
let __ids: i32 = 0;
// The clock: milliseconds since the program started. A real run reads the host's; a deterministic run (ZINC_DETERMINISTIC, goldens) only moves it when the
// event loop jumps to the next timer or a frame passes, so every run reads the same values.
const __real: boolean = __host_loopReal() !== 0;
const __epoch: f64 = __real ? __host_loopEpoch() : 0;
function __now(): f64 { if (__real) __clock = __host_loopNow(); return __clock; }
function __addTimer(f: () => void, ms: f64, every: f64): i32 {
  __timerSeq++;
  __ids++;
  const now = __now();
  __timers.push(new Timer(now + (ms > 0 ? ms : 0), now + (ms >= 1 ? ms : 1), __timerSeq, __ids, every, f));
  return __ids;
}
function setTimeout(f: () => void, ms: f64): i32 { return __addTimer(f, ms, 0); }
function setInterval(f: () => void, ms: f64): i32 { return __addTimer(f, ms, ms > 1 ? ms : 1); }
function clearTimeout(id: i32): void {
  __cancelled.push(id);
  __timers = __timers.filter(t => t.id !== id);
}
function clearInterval(id: i32): void { clearTimeout(id); }
// Deterministic time: the clock only moves when the event loop jumps to the next timer.
// Dates are UTC (the engine has no time zones): the same fields a program reads on every host.
// Date (ZN-093): a time value in milliseconds since 1970 (UTC), civil arithmetic after Howard Hinnant, the host's time zone through __host_tzOffset (UTC under ZINC_DETERMINISTIC unless TZ is set).
const __dMonths: string[] = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const __dDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function __dPad(n: f64, w: i32): string { let r = `${n}`; while (r.length < w) r = '0' + r; return r; }
function __dDaysFromCivil(y0: f64, m: f64, d: f64): f64 {   // m is 1..12
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function __dMakeDay(year: f64, month: f64, date: f64): f64 {
  if (!(year - year === 0) || !(month - month === 0) || !(date - date === 0)) return NaN;
  const y = Math.trunc(year) + Math.floor(Math.trunc(month) / 12);
  let mn = Math.trunc(month) % 12;
  if (mn < 0) mn += 12;
  if (Math.abs(y) > 400000) return NaN;
  return __dDaysFromCivil(y, mn + 1, 1) + Math.trunc(date) - 1;
}
function __dMakeTime(h: f64, mi: f64, sec: f64, ms: f64): f64 {
  if (!(h - h === 0) || !(mi - mi === 0) || !(sec - sec === 0) || !(ms - ms === 0)) return NaN;
  return Math.trunc(h) * 3600000 + Math.trunc(mi) * 60000 + Math.trunc(sec) * 1000 + Math.trunc(ms);
}
function __dClip(t: f64): f64 { return t - t === 0 && Math.abs(t) <= 8.64e15 ? Math.trunc(t) + 0 : NaN; }
// The offset of the local zone in minutes (positive west of UTC) at a UTC time, and for a local time.
function __dTzAt(t: f64): f64 { return t - t === 0 ? __host_tzOffset(t) : 0; }
function __dLocalToUtc(t: f64): f64 {   // an ambiguous local time (the clock went back) is the earlier instant, one in a gap is read with the offset from before it
  if (!(t - t === 0)) return NaN;
  const oa = __dTzAt(t - 86400000);
  const ob = __dTzAt(t + 86400000);
  const c1 = t + oa * 60000;
  if (__dTzAt(c1) === oa) return c1;
  const c2 = t + ob * 60000;
  return __dTzAt(c2) === ob ? c2 : c1;
}
function __dZoneName(abbr: string, offMin: f64): string {
  if (abbr === 'UTC') return 'Coordinated Universal Time';
  if (abbr === 'EST') return 'Eastern Standard Time'; if (abbr === 'EDT') return 'Eastern Daylight Time';
  if (abbr === 'CST') return 'Central Standard Time'; if (abbr === 'CDT') return 'Central Daylight Time';
  if (abbr === 'MST') return 'Mountain Standard Time'; if (abbr === 'MDT') return 'Mountain Daylight Time';
  if (abbr === 'PST') return 'Pacific Standard Time'; if (abbr === 'PDT') return 'Pacific Daylight Time';
  if (abbr === 'AKST') return 'Alaska Standard Time'; if (abbr === 'AKDT') return 'Alaska Daylight Time';
  if (abbr === 'HST') return 'Hawaii-Aleutian Standard Time';
  if (abbr === 'GMT') return 'Greenwich Mean Time'; if (abbr === 'BST') return 'British Summer Time'; if (abbr === 'IST' && offMin === -330) return 'India Standard Time';
  if (abbr === 'CET') return 'Central European Standard Time'; if (abbr === 'CEST') return 'Central European Summer Time';
  if (abbr === 'EET') return 'Eastern European Standard Time'; if (abbr === 'EEST') return 'Eastern European Summer Time';
  if (abbr === 'WET') return 'Western European Standard Time'; if (abbr === 'WEST') return 'Western European Summer Time';
  if (abbr === 'MSK') return 'Moscow Standard Time'; if (abbr === 'JST') return 'Japan Standard Time'; if (abbr === 'KST') return 'Korean Standard Time';
  if (abbr === 'AEST') return 'Australian Eastern Standard Time'; if (abbr === 'AEDT') return 'Australian Eastern Daylight Time';
  if (abbr === 'ACST') return 'Australian Central Standard Time'; if (abbr === 'AWST') return 'Australian Western Standard Time';
  if (abbr === 'NZST') return 'New Zealand Standard Time'; if (abbr === 'NZDT') return 'New Zealand Daylight Time';
  return abbr;
}
class Date {
  t: f64;
  constructor(ms: number = Date.now(), month: number = NaN, day: number = 1, hours: number = 0, minutes: number = 0, seconds: number = 0, millis: number = 0) {
    let y = ms;
    if (month - month === 0 && y - y === 0 && Math.trunc(y) >= 0 && Math.trunc(y) <= 99) y = 1900 + Math.trunc(y);   // new Date(year, month, ...): 0 to 99 is 1900 to 1999
    this.t = month - month === 0 || month === Infinity || month === -Infinity ? __dClip(__dLocalToUtc(__dMakeDay(y, month, day) * 86400000 + __dMakeTime(hours, minutes, seconds, millis))) : __dClip(ms);
  }
  static now(): f64 { return __real ? Math.floor(__epoch + __now()) : __clock; }  // deterministic runs keep the virtual (fractional) clock the goldens froze
  static UTC(year: number, month: number = 0, day: number = 1, hours: number = 0, minutes: number = 0, seconds: number = 0, millis: number = 0): f64 {
    let y = year;
    if (y - y === 0 && Math.trunc(y) >= 0 && Math.trunc(y) <= 99) y = 1900 + Math.trunc(y);
    return __dClip(__dMakeDay(y, month, day) * 86400000 + __dMakeTime(hours, minutes, seconds, millis));
  }
  static parse(s: string): f64 { return __dParse(s); }
  getTime(): f64 { return this.t; }
  valueOf(): f64 { return this.t; }
  setTime(v: number): f64 { this.t = __dClip(v); return this.t; }
  getTimezoneOffset(): f64 { return this.t - this.t === 0 ? Math.round(__dTzAt(this.t)) : NaN; }   // whole minutes, like V8 (an LMT offset has seconds)
  // fields: 0 year, 1 month (0 based), 2 day of the month, 3 weekday, 4 hours, 5 minutes, 6 seconds, 7 milliseconds; of the UTC time or the local one
  field(k: i32, local: boolean): f64 {
    if (!(this.t - this.t === 0)) return NaN;
    const lt = local ? this.t - __dTzAt(this.t) * 60000 : this.t;
    const days = Math.floor(lt / 86400000);
    const ms = lt - days * 86400000;
    if (k === 3) { const d = (days + 4) % 7; return d < 0 ? d + 7 : d; }
    if (k === 4) return Math.floor(ms / 3600000);
    if (k === 5) return Math.floor(ms / 60000) % 60;
    if (k === 6) return Math.floor(ms / 1000) % 60;
    if (k === 7) return ms % 1000;
    const z = days + 719468;   // Hinnant's days-to-civil
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const m = mp < 10 ? mp + 3 : mp - 9;
    if (k === 0) return yoe + era * 400 + (m <= 2 ? 1 : 0);
    return k === 1 ? m - 1 : d;
  }
  getFullYear(): f64 { return this.field(0, true); }
  getMonth(): f64 { return this.field(1, true); }
  getDate(): f64 { return this.field(2, true); }
  getDay(): f64 { return this.field(3, true); }
  getHours(): f64 { return this.field(4, true); }
  getMinutes(): f64 { return this.field(5, true); }
  getSeconds(): f64 { return this.field(6, true); }
  getMilliseconds(): f64 { return this.field(7, true); }
  getUTCFullYear(): f64 { return this.field(0, false); }
  getUTCMonth(): f64 { return this.field(1, false); }
  getUTCDate(): f64 { return this.field(2, false); }
  getUTCDay(): f64 { return this.field(3, false); }
  getUTCHours(): f64 { return this.field(4, false); }
  getUTCMinutes(): f64 { return this.field(5, false); }
  getUTCSeconds(): f64 { return this.field(6, false); }
  getUTCMilliseconds(): f64 { return this.field(7, false); }
  // Replaces some fields (-1: keep) of the local or UTC time and sets the new time value.
  private set(local: boolean, y: f64, mo: f64, d: f64, h: f64, mi: f64, sec: f64, ms: f64): f64 {
    let base = this.t;
    if (!(base - base === 0)) { if (y === y && y !== -1e300) base = 0; else return NaN; }   // setFullYear of an invalid date starts from +0
    const nan = !(this.t - this.t === 0);
    const tmp = new Date(base);
    const yy = y === -1e300 ? tmp.field(0, local) : y;
    const mm = mo === -1e300 ? (nan ? 0 : tmp.field(1, local)) : mo;
    const dd = d === -1e300 ? (nan ? 1 : tmp.field(2, local)) : d;
    const hh = h === -1e300 ? (nan ? 0 : tmp.field(4, local)) : h;
    const ii = mi === -1e300 ? (nan ? 0 : tmp.field(5, local)) : mi;
    const ss = sec === -1e300 ? (nan ? 0 : tmp.field(6, local)) : sec;
    const mss = ms === -1e300 ? (nan ? 0 : tmp.field(7, local)) : ms;
    const v = __dMakeDay(yy, mm, dd) * 86400000 + __dMakeTime(hh, ii, ss, mss);
    this.t = __dClip(local ? __dLocalToUtc(v) : v);
    return this.t;
  }
  setFullYear(y: number, month: number = -1e300, day: number = -1e300): f64 { return this.set(true, y, month, day, -1e300, -1e300, -1e300, -1e300); }
  setMonth(month: number, day: number = -1e300): f64 { return this.set(true, -1e300, month, day, -1e300, -1e300, -1e300, -1e300); }
  setDate(day: number): f64 { return this.set(true, -1e300, -1e300, day, -1e300, -1e300, -1e300, -1e300); }
  setHours(h: number, mi: number = -1e300, sec: number = -1e300, ms: number = -1e300): f64 { return this.set(true, -1e300, -1e300, -1e300, h, mi, sec, ms); }
  setMinutes(mi: number, sec: number = -1e300, ms: number = -1e300): f64 { return this.set(true, -1e300, -1e300, -1e300, -1e300, mi, sec, ms); }
  setSeconds(sec: number, ms: number = -1e300): f64 { return this.set(true, -1e300, -1e300, -1e300, -1e300, -1e300, sec, ms); }
  setMilliseconds(ms: number): f64 { return this.set(true, -1e300, -1e300, -1e300, -1e300, -1e300, -1e300, ms); }
  setUTCFullYear(y: number, month: number = -1e300, day: number = -1e300): f64 { return this.set(false, y, month, day, -1e300, -1e300, -1e300, -1e300); }
  setUTCMonth(month: number, day: number = -1e300): f64 { return this.set(false, -1e300, month, day, -1e300, -1e300, -1e300, -1e300); }
  setUTCDate(day: number): f64 { return this.set(false, -1e300, -1e300, day, -1e300, -1e300, -1e300, -1e300); }
  setUTCHours(h: number, mi: number = -1e300, sec: number = -1e300, ms: number = -1e300): f64 { return this.set(false, -1e300, -1e300, -1e300, h, mi, sec, ms); }
  setUTCMinutes(mi: number, sec: number = -1e300, ms: number = -1e300): f64 { return this.set(false, -1e300, -1e300, -1e300, -1e300, mi, sec, ms); }
  setUTCSeconds(sec: number, ms: number = -1e300): f64 { return this.set(false, -1e300, -1e300, -1e300, -1e300, -1e300, sec, ms); }
  setUTCMilliseconds(ms: number): f64 { return this.set(false, -1e300, -1e300, -1e300, -1e300, -1e300, -1e300, ms); }
  toISOString(): string {
    if (!(this.t - this.t === 0)) throw new RangeError('Invalid time value');
    const y = this.field(0, false);
    const ys = y >= 0 && y <= 9999 ? __dPad(y, 4) : (y < 0 ? '-' : '+') + __dPad(Math.abs(y), 6);
    return ys + '-' + __dPad(this.field(1, false) + 1, 2) + '-' + __dPad(this.field(2, false), 2) + 'T' + __dPad(this.field(4, false), 2) + ':' + __dPad(this.field(5, false), 2) + ':' + __dPad(this.field(6, false), 2) + '.' + __dPad(this.field(7, false), 3) + 'Z';
  }
  toJSON(): string | null { return this.t - this.t === 0 ? this.toISOString() : null; }
  private yearText(): string { const y = this.field(0, true); return y < 0 ? '-' + __dPad(-y, 6) : __dPad(y, 4); }
  toDateString(): string {
    if (!(this.t - this.t === 0)) return 'Invalid Date';
    return __dDays[this.field(3, true)] + ' ' + __dMonths[this.field(1, true)] + ' ' + __dPad(this.field(2, true), 2) + ' ' + this.yearText();
  }
  toTimeString(): string {
    if (!(this.t - this.t === 0)) return 'Invalid Date';
    const off = __dTzAt(this.t);
    const abs = Math.abs(off);
    return __dPad(this.field(4, true), 2) + ':' + __dPad(this.field(5, true), 2) + ':' + __dPad(this.field(6, true), 2) + ' GMT' + (off > 0 ? '-' : '+') + __dPad(Math.floor(abs / 60), 2) + __dPad(abs % 60, 2) + ' (' + __dZoneName(__host_tzName(this.t), off) + ')';
  }
  toString(): string { return this.t - this.t === 0 ? this.toDateString() + ' ' + this.toTimeString() : 'Invalid Date'; }
  toUTCString(): string {
    if (!(this.t - this.t === 0)) return 'Invalid Date';
    const y = this.field(0, false);
    return __dDays[this.field(3, false)] + ', ' + __dPad(this.field(2, false), 2) + ' ' + __dMonths[this.field(1, false)] + ' ' + (y < 0 ? '-' + __dPad(-y, 6) : __dPad(y, 4)) + ' ' + __dPad(this.field(4, false), 2) + ':' + __dPad(this.field(5, false), 2) + ':' + __dPad(this.field(6, false), 2) + ' GMT';
  }
  toGMTString(): string { return this.toUTCString(); }
  // en-US: M/D/YYYY, h:mm:ss AM. `timeZone` of the options: 'UTC' or an IANA name; the locale argument is accepted and ignored.
  toLocaleDateString(locale: string = 'en-US', options: DateFormatOptions = {}): string {
    if (!(this.t - this.t === 0)) return 'Invalid Date';
    const z = options.timeZone === null ? '' : options.timeZone as string;
    const utc = z === 'UTC' || z === 'GMT';
    const off = z.length > 0 && !utc ? __host_tzOffsetIn(z, this.t) : 0;
    const d = new Date(this.t - (z.length > 0 ? (utc ? 0 : off) : __dTzAt(this.t)) * 60000);
    return `${d.field(1, false) + 1}/${d.field(2, false)}/${d.field(0, false)}`;
  }
  toLocaleTimeString(locale: string = 'en-US', options: DateFormatOptions = {}): string {
    if (!(this.t - this.t === 0)) return 'Invalid Date';
    const z = options.timeZone === null ? '' : options.timeZone as string;
    const utc = z === 'UTC' || z === 'GMT';
    const off = z.length > 0 && !utc ? __host_tzOffsetIn(z, this.t) : 0;
    const d = new Date(this.t - (z.length > 0 ? (utc ? 0 : off) : __dTzAt(this.t)) * 60000);
    const h = d.field(4, false);
    return `${h % 12 === 0 ? 12 : h % 12}:${__dPad(d.field(5, false), 2)}:${__dPad(d.field(6, false), 2)} ${h < 12 ? 'AM' : 'PM'}`;
  }
  toLocaleString(locale: string = 'en-US', options: DateFormatOptions = {}): string {
    if (!(this.t - this.t === 0)) return 'Invalid Date';
    return this.toLocaleDateString(locale, options) + ', ' + this.toLocaleTimeString(locale, options);
  }
}
interface DateFormatOptions { timeZone?: string }
// Date.parse: the ISO 8601 profile of ECMAScript (a date alone is UTC, a date with a time and no offset is local) and a tolerant reader of the formats engines accept besides
// (RFC 2822 `Tue, 15 Nov 1994 08:12:31 GMT`, `Jan 15, 2020 10:00:00`, `15 January 2020`, `1/15/2020`, `2020/01/15`, what toString prints).
function __dDigits(s: string, i: i32, n: i32): f64 {
  if (i + n > s.length) return -1;
  let v: f64 = 0;
  for (let k: i32 = 0; k < n; k++) { const c = s.charCodeAt(i + k); if (c < 48 || c > 57) return -1; v = v * 10 + (c - 48); }
  return v;
}
function __dParseIso(s: string): f64 {
  let i: i32 = 0;
  let sign: f64 = 1;
  let year: f64;
  if (s.charAt(0) === '+' || s.charAt(0) === '-') { sign = s.charAt(0) === '-' ? -1 : 1; year = __dDigits(s, 1, 6); i = 7; if (year < 0 || (sign < 0 && year === 0)) return NaN; year *= sign; }
  else { year = __dDigits(s, 0, 4); i = 4; if (year < 0) return NaN; }
  let month: f64 = 1, day: f64 = 1, h: f64 = 0, mi: f64 = 0, sec: f64 = 0, ms: f64 = 0;
  let hasTime = false;
  let offset: f64 = NaN;
  if (i < s.length && s.charAt(i) === '-') {
    month = __dDigits(s, i + 1, 2); if (month < 0) return NaN; i += 3;
    if (i < s.length && s.charAt(i) === '-') { day = __dDigits(s, i + 1, 2); if (day < 0) return NaN; i += 3; }
  }
  if (i < s.length && (s.charAt(i) === 'T' || s.charAt(i) === 't' || s.charAt(i) === ' ')) {
    hasTime = true;
    h = __dDigits(s, i + 1, 2);
    if (h < 0 || s.charAt(i + 3) !== ':') return NaN;
    mi = __dDigits(s, i + 4, 2); if (mi < 0) return NaN; i += 6;
    if (i < s.length && s.charAt(i) === ':') {
      sec = __dDigits(s, i + 1, 2); if (sec < 0) return NaN; i += 3;
      if (i < s.length && (s.charAt(i) === '.' || s.charAt(i) === ',')) {
        i++;
        let scale: f64 = 100;
        let any = false;
        while (i < s.length && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) { ms += (s.charCodeAt(i) - 48) * scale; scale /= 10; i++; any = true; }
        if (!any) return NaN;
        ms = Math.floor(ms);
      }
    }
    if (i < s.length && (s.charAt(i) === 'Z' || s.charAt(i) === 'z')) { offset = 0; i++; }
    else if (i < s.length && (s.charAt(i) === '+' || s.charAt(i) === '-')) {
      const sg: f64 = s.charAt(i) === '-' ? -1 : 1;
      const oh = __dDigits(s, i + 1, 2);
      if (oh < 0) return NaN;
      i += 3;
      let om: f64 = 0;
      if (i < s.length && s.charAt(i) === ':') { om = __dDigits(s, i + 1, 2); i += 3; } else if (i < s.length) { om = __dDigits(s, i, 2); i += 2; }
      if (om < 0) return NaN;
      offset = sg * (oh * 60 + om);
    }
  }
  if (i !== s.length) return NaN;
  if (month < 1 || month > 12 || day < 1 || day > 31 || h > 24 || mi > 59 || sec > 59 || (h === 24 && (mi > 0 || sec > 0 || ms > 0))) return NaN;
  const t = __dMakeDay(year, month - 1, day) * 86400000 + __dMakeTime(h, mi, sec, ms);
  if (!hasTime) return __dClip(t);
  if (offset - offset === 0) return __dClip(t - offset * 60000);
  return __dClip(__dLocalToUtc(t));
}
function __dZoneOffset(w: string): f64 {   // minutes east of UTC, NaN when w is no zone name
  if (w === 'z' || w === 'gmt' || w === 'utc' || w === 'ut') return 0;
  if (w === 'est') return -300; if (w === 'edt') return -240; if (w === 'cst') return -360; if (w === 'cdt') return -300;
  if (w === 'mst') return -420; if (w === 'mdt') return -360; if (w === 'pst') return -480; if (w === 'pdt') return -420;
  return NaN;
}
function __dParse(input: string): f64 {
  const s = input.trim();
  if (s.length === 0) return NaN;
  const c0 = s.charCodeAt(0);
  if (((c0 >= 48 && c0 <= 57) || c0 === 43 || c0 === 45) && s.length >= 4) { const iso = __dParseIso(s); if (iso - iso === 0) return iso; if (s.length >= 4 && __dDigits(s, 0, 4) >= 0 && (s.length === 4 || s.charAt(4) === '-') && s.indexOf('/') < 0) return NaN; }
  let year: f64 = NaN, month: f64 = NaN, day: f64 = NaN;
  let h: f64 = 0, mi: f64 = 0, sec: f64 = 0, ms: f64 = 0;
  let offset: f64 = NaN;
  let pm = 0;
  const nums: f64[] = [];
  let i: i32 = 0;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
      let j = i;
      while (j < s.length && ((s.charCodeAt(j) >= 65 && s.charCodeAt(j) <= 90) || (s.charCodeAt(j) >= 97 && s.charCodeAt(j) <= 122))) j++;
      const w = s.slice(i, j).toLowerCase();
      i = j;
      if (w === 'am') pm = 1; else if (w === 'pm') pm = 2;
      else if (w === 't') continue;
      else {
        const z = __dZoneOffset(w);
        if (z - z === 0) { offset = z; continue; }
        let mn = -1;
        for (let k: i32 = 0; k < 12; k++) if (w.length >= 3 && w.slice(0, 3) === __dMonths[k].toLowerCase()) mn = k;
        if (mn >= 0) { month = mn; continue; }
        let wd = false;
        for (let k: i32 = 0; k < 7; k++) if (w.length >= 3 && w.slice(0, 3) === __dDays[k].toLowerCase()) wd = true;
        if (!wd) return NaN;
      }
    } else if (c >= 48 && c <= 57) {
      let j = i;
      while (j < s.length && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) j++;
      const v = parseFloat(s.slice(i, j));
      if (j < s.length && s.charAt(j) === ':') {   // h:mm[:ss[.fff]]
        h = v;
        const m2 = __dDigits(s, j + 1, 2);
        if (m2 < 0) return NaN;
        mi = m2; j += 3;
        if (j < s.length && s.charAt(j) === ':') {
          const s2 = __dDigits(s, j + 1, 2);
          if (s2 < 0) return NaN;
          sec = s2; j += 3;
          if (j < s.length && s.charAt(j) === '.') { j++; let scale: f64 = 100; while (j < s.length && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) { ms += (s.charCodeAt(j) - 48) * scale; scale /= 10; j++; } ms = Math.floor(ms); }
        }
      } else nums.push(v);
      i = j;
    } else if ((c === 43 || c === 45) && (offset - offset === 0 || h !== 0 || mi !== 0) && i + 1 < s.length && s.charCodeAt(i + 1) >= 48 && s.charCodeAt(i + 1) <= 57 && (h !== 0 || mi !== 0 || sec !== 0 || offset === 0)) {   // +hhmm, +hh:mm after a time or GMT
      const sg: f64 = c === 45 ? -1 : 1;
      let j = i + 1;
      while (j < s.length && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) j++;
      let digits = s.slice(i + 1, j);
      let oh: f64, om: f64 = 0;
      if (j < s.length && s.charAt(j) === ':') { oh = parseFloat(digits); om = __dDigits(s, j + 1, 2); j += 3; }
      else if (digits.length <= 2) oh = parseFloat(digits);
      else { oh = parseFloat(digits.slice(0, digits.length - 2)); om = parseFloat(digits.slice(digits.length - 2)); }
      offset = sg * (oh * 60 + om);
      i = j;
    } else if (c === 40) {   // (comment)
      const close = s.indexOf(')', i);
      i = close < 0 ? s.length : close + 1;
    } else if (c === 47) {   // a slash: the numbers around it are m/d/y or y/m/d
      i++;
      const k = nums.length;
      if (k === 0) return NaN;
      let j = i;
      const parts: f64[] = [nums[k - 1]];
      while (true) {
        let e = j;
        while (e < s.length && s.charCodeAt(e) >= 48 && s.charCodeAt(e) <= 57) e++;
        if (e === j) return NaN;
        parts.push(parseFloat(s.slice(j, e)));
        j = e;
        if (j < s.length && s.charAt(j) === '/') { j++; continue; }
        break;
      }
      nums.pop();
      if (parts.length === 3) { if (parts[0] > 31) { year = parts[0]; month = parts[1] - 1; day = parts[2]; } else { month = parts[0] - 1; day = parts[1]; year = parts[2]; } }
      else if (parts.length === 2) { month = parts[0] - 1; day = parts[1]; }
      else return NaN;
      i = j;
    } else i++;   // spaces, commas, dots, dashes between date parts
  }
  // loose numbers: with a month name the day and the year; a leading year (> 31) first
  for (const v of nums) {
    if (day - day !== 0 && v >= 1 && v <= 31 && !(year - year !== 0 && v > 31)) day = v;
    else if (year - year !== 0) year = v;
    else if (day - day !== 0) day = v;
    else return NaN;
  }
  if (year - year !== 0 || month - month !== 0) return NaN;
  if (day - day !== 0) day = 1;
  if (year >= 0 && year < 50) year += 2000; else if (year >= 50 && year < 100) year += 1900;
  if (pm === 2 && h < 12) h += 12; else if (pm === 1 && h === 12) h = 0;
  if (month < 0 || month > 11 || day < 1 || day > 31 || h > 24 || mi > 59 || sec > 59) return NaN;
  const t = __dMakeDay(year, month, day) * 86400000 + __dMakeTime(h, mi, sec, ms);
  if (offset - offset === 0) return __dClip(t - offset * 60000);
  return __dClip(__dLocalToUtc(t));
}
class Performance {
  timeOrigin: f64 = __epoch;
  markNames: string[] = [];
  markTimes: f64[] = [];
  now(): f64 { return __now(); }
  mark(name: string): f64 { const t = __now(); this.markNames.push(name); this.markTimes.push(t); return t; }
  // the time between two marks (the end defaults to now): the duration of the measure, 0 when a mark is unknown
  measure(name: string, startMark: string = '', endMark: string = ''): f64 {
    let a: f64 = 0, b: f64 = __now();
    for (let i: i32 = 0; i < this.markNames.length; i++) {
      if (this.markNames[i] === startMark) a = this.markTimes[i];
      if (this.markNames[i] === endMark) b = this.markTimes[i];
    }
    return b - a;
  }
}
const performance = new Performance();
function __drainJobs(): void {
  while (__jobHead < __jobs.length) {
    const j = __jobs[__jobHead];
    __jobHead++;
    j.run();
  }
  __jobs = [];
  __jobHead = 0;
  __checkRejections();
}
let __frameHook: (() => void) | null = null;
// One frame of a program with a frame loop (zinc:gfx): the timers due at the new clock fire in order of time then creation,
// as in the old runtime; an interval is re-armed before it runs, so it can cancel itself.
function __frameTimers(): void {
  while (__timers.length > 0) {
    let best: i32 = 0;
    for (let i: i32 = 1; i < __timers.length; i++) {
      const a = __timers[i];
      const b = __timers[best];
      if (a.at < b.at || (a.at === b.at && a.id < b.id)) best = i;
    }
    const t = __timers[best];
    if (t.at > __now()) return;
    const rest: Timer[] = [];
    for (let i: i32 = 0; i < __timers.length; i++) if (i !== best) rest.push(__timers[i]);
    __timers = rest;
    if (t.every > 0) { __timerSeq++; __timers.push(new Timer(t.at + t.every, t.ord + t.every, __timerSeq, t.id, t.every, t.f)); }
    t.f();
    __drainJobs();
  }
}
// Work that happens outside the program (a child process, a signal, standard input) reaches it as events of the host's loop, one string each
// ("handle", "kind" and "data" joined by U+001F); the handlers registered here (zinc:process, zinc:sys) pick the kinds they own.
let __evHandlers: ((h: i32, kind: i32, data: string) => void)[] = [];
function __addEvHandler(f: (h: i32, kind: i32, data: string) => void): void { __evHandlers.push(f); }
function __pollHost(): boolean {
  let any = false;
  for (;;) {
    const e = __host_evNext();
    if (e.length === 0) break;
    any = true;
    const i1 = e.indexOf('\u001f');
    const i2 = e.indexOf('\u001f', i1 + 1);
    const h = parseInt(e.slice(0, i1));
    const kind = parseInt(e.slice(i1 + 1, i2));
    const data = e.slice(i2 + 1);
    for (const f of __evHandlers) f(h, kind, data);
    __drainJobs();
  }
  return any;
}
function __runLoop(): void {
  const hook = __frameHook;
  if (hook !== null) { hook(); return; }
  __drainJobs();
  for (;;) {
    __pollHost();
    const busy = __host_evActive() !== 0;  // a child still runs, a signal or stdin is being watched
    if (__timers.length === 0) {
      if (!busy) break;
      __host_loopWait(5);
      continue;
    }
    let best: i32 = 0;
    for (let i: i32 = 1; i < __timers.length; i++) {
      const a = __timers[i];
      const b = __timers[best];
      if (a.ord < b.ord || (a.ord === b.ord && a.seq < b.seq)) best = i;
    }
    const t = __timers[best];
    const now = __now();
    if (t.at > now) {
      if (busy) {  // outside work may finish before the timer: look again soon (a virtual clock moves on by what was waited, or a timer behind open sockets never fires)
        const w = t.at - now < 5 ? t.at - now : 5;
        __host_loopWait(w);
        if (!__real) __clock = __clock + w;
        continue;
      }
      if (__real) __host_loopWait(t.at - now);  // a real run sleeps on the host's event loop until the timer is due
      __clock = __real ? __now() : t.at;
    }
    const rest: Timer[] = [];
    for (let i: i32 = 0; i < __timers.length; i++) if (i !== best) rest.push(__timers[i]);
    __timers = rest;
    t.f();
    if (t.every > 0 && __cancelled.indexOf(t.id) < 0) {
      __timerSeq++;
      __timers.push(new Timer(t.at + t.every, t.ord + t.every, __timerSeq, t.id, t.every, t.f));
    }
    __drainJobs();
  }
}

// A promise rejected with nobody waiting for it when the microtasks have drained is an uncaught error, as in Node (exit code 101 and the message).
let __rejected: PromiseBase[] = [];
function __checkRejections(): void {
  const list = __rejected;
  __rejected = [];
  for (const p of list) {
    const e = p.error;
    if (!p.handled && e !== null) throw e;
  }
}
class PromiseBase {
  state: i32 = 0;
  error: Error | null = null;
  handled: boolean = false;
  waiters: Job[] = [];
  subscribe(j: Job): void {
    this.handled = true;
    if (this.state === 0) this.waiters.push(j); else __enqueue(j);
  }
  settle(): void {
    for (const w of this.waiters) __enqueue(w);
    this.waiters = [];
  }
  rejectWith(e: Error): void {
    if (this.state !== 0) return;
    this.state = 2;
    this.error = e;
    if (!this.handled) __rejected.push(this);
    this.settle();
  }
}
class Promise<T> extends PromiseBase {
  value: T[] = [];
  constructor(executor: (resolve: (value: T) => void, reject: (e: Error) => void) => void) {
    super();
    executor((v: T) => { this.resolveWith(v); }, (e: Error) => { this.rejectWith(e); });
  }
  resolveWith(v: T): void {
    if (this.state !== 0) return;
    this.state = 1;
    this.value = [v];
    this.settle();
  }
}

class PromiseV extends PromiseBase {
  constructor(executor: (resolve: () => void, reject: (e: Error) => void) => void) {
    super();
    executor(() => { this.resolveWith(); }, (e: Error) => { this.rejectWith(e); });
  }
  resolveWith(): void {
    if (this.state !== 0) return;
    this.state = 1;
    this.settle();
  }
}
class AwaitJob<T> extends Job {
  constructor(public p: Promise<T>, public k: (v: T) => void, public rej: (e: Error) => void) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) this.rej(err); else this.k(this.p.value[0]);
  }
}
function __await<T>(p: Promise<T>, k: (v: T) => void, rej: (e: Error) => void): void { p.subscribe(new AwaitJob<T>(p, k, rej)); }
class AwaitJobV extends Job {
  constructor(public p: PromiseV, public k: (v: i32) => void, public rej: (e: Error) => void) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) this.rej(err); else this.k(0);
  }
}
function __awaitV(p: PromiseV, k: (v: i32) => void, rej: (e: Error) => void): void { p.subscribe(new AwaitJobV(p, k, rej)); }

// Generators run as continuations: `cont` is the rest of the body, `next` runs it until it yields a value or ends.
function __genToArray<T>(g: Generator<T>): T[] {
  const r: T[] = [];
  while (g.step()) r.push(g.value[0]);
  return r;
}
class IteratorResult<T> {
  done: boolean = false;
  value: T | null = null;
}
class Generator<T> {
  done: boolean = false;
  value: T[] = [];
  cont: () => void = () => { };
  onClose: (() => void)[] = [];
  close(): void {  // abandon the generator: its continuation no longer holds it, and the loops it was in let go of themselves
    this.done = true;
    this.cont = () => { };
    const fs = this.onClose;
    this.onClose = [];
    for (const f of fs) f();
  }
  next(): IteratorResult<T> {
    const r = new IteratorResult<T>();
    if (this.step()) r.value = this.value[0]; else r.done = true;
    return r;
  }
  step(): boolean {
    this.value = [];
    while (!this.done && this.value.length === 0) {
      const c = this.cont;
      this.cont = () => { this.done = true; };
      c();
    }
    if (this.done && this.value.length === 0) this.close();  // exhausted: the loops it was in let go of themselves
    return this.value.length > 0;
  }
}
function __newPromise<T>(): Promise<T> { return new Promise<T>(r => { }); }
function __newPromiseV(): PromiseV { return new PromiseV(r => { }); }

// then: four flavours, by whether the promise and the callback result carry a value
class ThenJob<T, U> extends Job {
  constructor(public p: Promise<T>, public f: (v: T) => U, public r: Promise<U>) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) { this.r.rejectWith(err); return; }
    try { this.r.resolveWith(this.f(this.p.value[0])); } catch (e) { this.r.rejectWith(e); }
  }
}
function __then<T, U>(p: Promise<T>, f: (v: T) => U): Promise<U> {
  const r = __newPromise<U>();
  p.subscribe(new ThenJob<T, U>(p, f, r));
  return r;
}
class ThenJobV<T> extends Job {
  constructor(public p: Promise<T>, public f: (v: T) => void, public r: PromiseV) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) { this.r.rejectWith(err); return; }
    try { this.f(this.p.value[0]); this.r.resolveWith(); } catch (e) { this.r.rejectWith(e); }
  }
}
function __thenV<T>(p: Promise<T>, f: (v: T) => void): PromiseV {
  const r = __newPromiseV();
  p.subscribe(new ThenJobV<T>(p, f, r));
  return r;
}
class ThenJobFromV<U> extends Job {
  constructor(public p: PromiseV, public f: () => U, public r: Promise<U>) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) { this.r.rejectWith(err); return; }
    try { this.r.resolveWith(this.f()); } catch (e) { this.r.rejectWith(e); }
  }
}
function __thenFromV<U>(p: PromiseV, f: () => U): Promise<U> {
  const r = __newPromise<U>();
  p.subscribe(new ThenJobFromV<U>(p, f, r));
  return r;
}
class ThenJobVV extends Job {
  constructor(public p: PromiseV, public f: () => void, public r: PromiseV) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) { this.r.rejectWith(err); return; }
    try { this.f(); this.r.resolveWith(); } catch (e) { this.r.rejectWith(e); }
  }
}
function __thenVV(p: PromiseV, f: () => void): PromiseV {
  const r = __newPromiseV();
  p.subscribe(new ThenJobVV(p, f, r));
  return r;
}

// catch
class CatchJob<T> extends Job {
  constructor(public p: Promise<T>, public f: (e: Error) => T, public r: Promise<T>) { super(); }
  run(): void {
    const err = this.p.error;
    if (err === null) { this.r.resolveWith(this.p.value[0]); return; }
    try { this.r.resolveWith(this.f(err)); } catch (e) { this.r.rejectWith(e); }
  }
}
function __catch<T>(p: Promise<T>, f: (e: Error) => T): Promise<T> {
  const r = __newPromise<T>();
  p.subscribe(new CatchJob<T>(p, f, r));
  return r;
}
class CatchJobV extends Job {
  constructor(public p: PromiseV, public f: (e: Error) => void, public r: PromiseV) { super(); }
  run(): void {
    const err = this.p.error;
    if (err === null) { this.r.resolveWith(); return; }
    try { this.f(err); this.r.resolveWith(); } catch (e) { this.r.rejectWith(e); }
  }
}
function __catchV(p: PromiseV, f: (e: Error) => void): PromiseV {
  const r = __newPromiseV();
  p.subscribe(new CatchJobV(p, f, r));
  return r;
}

// finally: the callback runs on either outcome, then the result (or the error) passes through unchanged
class FinallyJob<T> extends Job {
  hops: i32 = 0;
  constructor(public p: Promise<T>, public f: () => void, public r: Promise<T>) { super(); }
  run(): void {
    if (this.hops === 0) {
      try { this.f(); } catch (e) { this.r.rejectWith(e); return; }
    }
    if (this.hops < 2) { this.hops++; __enqueue(this); return; }
    const err = this.p.error;
    if (err !== null) this.r.rejectWith(err); else this.r.resolveWith(this.p.value[0]);
  }
}
function __finally<T>(p: Promise<T>, f: () => void): Promise<T> {
  const r = __newPromise<T>();
  p.subscribe(new FinallyJob<T>(p, f, r));
  return r;
}
class FinallyJobV extends Job {
  hops: i32 = 0;
  constructor(public p: PromiseV, public f: () => void, public r: PromiseV) { super(); }
  run(): void {
    if (this.hops === 0) {
      try { this.f(); } catch (e) { this.r.rejectWith(e); return; }
    }
    if (this.hops < 2) { this.hops++; __enqueue(this); return; }
    const err = this.p.error;
    if (err !== null) this.r.rejectWith(err); else this.r.resolveWith();
  }
}
function __finallyV(p: PromiseV, f: () => void): PromiseV {
  const r = __newPromiseV();
  p.subscribe(new FinallyJobV(p, f, r));
  return r;
}

function __resolved<T>(v: T): Promise<T> {
  const p = __newPromise<T>();
  p.resolveWith(v);
  return p;
}
function __resolvedV(): PromiseV {
  const p = __newPromiseV();
  p.resolveWith();
  return p;
}

// all
class AllJob<T> extends Job {
  constructor(public p: Promise<T>, public all: AllState<T>) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) { this.all.result.rejectWith(err); return; }
    this.all.left--;
    if (this.all.left === 0) {
      const out: T[] = [];
      for (const q of this.all.items) out.push(q.value[0]);
      this.all.result.resolveWith(out);
    }
  }
}
class AllState<T> {
  left: i32 = 0;
  items: Promise<T>[] = [];
  result: Promise<T[]> = __newPromise<T[]>();
}
function __all<T>(ps: Promise<T>[]): Promise<T[]> {
  const st = new AllState<T>();
  st.items = ps;
  st.left = ps.length;
  if (ps.length === 0) { st.result.resolveWith([]); return st.result; }
  for (const p of ps) p.subscribe(new AllJob<T>(p, st));
  return st.result;
}

// reject, race, any, allSettled, withResolvers
function __rejectedP<T>(e: Error): Promise<T> {
  const p = __newPromise<T>();
  p.rejectWith(e);
  return p;
}
class RaceJob<T> extends Job {
  constructor(public p: Promise<T>, public r: Promise<T>) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) this.r.rejectWith(err); else this.r.resolveWith(this.p.value[0]);
  }
}
function __race<T>(ps: Promise<T>[]): Promise<T> {
  const r = __newPromise<T>();
  for (const p of ps) p.subscribe(new RaceJob<T>(p, r));
  return r;
}
class AnyState<T> {
  left: i32 = 0;
  result: Promise<T> = __newPromise<T>();
}
class AnyJob<T> extends Job {
  constructor(public p: Promise<T>, public st: AnyState<T>) { super(); }
  run(): void {
    const err = this.p.error;
    if (err === null) { this.st.result.resolveWith(this.p.value[0]); return; }
    this.st.left--;
    if (this.st.left === 0) this.st.result.rejectWith(new Error('All promises were rejected'));
  }
}
function __any<T>(ps: Promise<T>[]): Promise<T> {
  const st = new AnyState<T>();
  st.left = ps.length;
  if (ps.length === 0) st.result.rejectWith(new Error('All promises were rejected'));
  for (const p of ps) p.subscribe(new AnyJob<T>(p, st));
  return st.result;
}
class Settled<T> {
  status: string = '';
  value: T | null = null;
  reason: Error | null = null;
}
class SettledState<T> {
  left: i32 = 0;
  items: Promise<T>[] = [];
  result: Promise<Settled<T>[]> = __newPromise<Settled<T>[]>();
}
class SettledJob<T> extends Job {
  constructor(public st: SettledState<T>) { super(); }
  run(): void {
    this.st.left--;
    if (this.st.left !== 0) return;
    const out: Settled<T>[] = [];
    for (const q of this.st.items) {
      const s = new Settled<T>();
      const err = q.error;
      if (err !== null) { s.status = 'rejected'; s.reason = err; } else { s.status = 'fulfilled'; s.value = q.value[0]; }
      out.push(s);
    }
    this.st.result.resolveWith(out);
  }
}
function __allSettled<T>(ps: Promise<T>[]): Promise<Settled<T>[]> {
  const st = new SettledState<T>();
  st.items = ps;
  st.left = ps.length;
  if (ps.length === 0) { st.result.resolveWith([]); return st.result; }
  for (const p of ps) p.subscribe(new SettledJob<T>(st));
  return st.result;
}
class Resolvers<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: Error) => void;
  constructor(p: Promise<T>) {
    this.promise = p;
    this.resolve = (v: T): void => { p.resolveWith(v); };
    this.reject = (e: Error): void => { p.rejectWith(e); };
  }
}
class NeverPromise extends PromiseBase { }
function __rejectedN(e: Error): NeverPromise {
  const p = new NeverPromise();
  p.rejectWith(e);
  return p;
}
function __withResolvers<T = never>(): Resolvers<T> { return new Resolvers<T>(__newPromise<T>()); }
)ZN";

// Arenas hold per-frame memory in the AOT runtime; here an arena is a scope marker that releases nothing.
const char* kArenaPrelude = R"ZN(
class Arena {
  static frame(size: i32 = 0): Arena { return new Arena(); }
  [Symbol.dispose](): void {}
}
)ZN";

bool needsAsync(const Ast& A) {
  for (const Node& x : A.nodes) {
    if (x.kind == N::Await || x.kind == N::Yield) return true;
    if ((x.kind == N::Function || x.kind == N::FuncExpr || x.kind == N::Method) && (x.flags & (kFlagAsync | kFlagGenerator))) return true;
    if ((x.kind == N::Ident || x.kind == N::TypeRef) && (x.text == "Promise" || x.text == "queueMicrotask" || x.text == "setTimeout" || x.text == "clearTimeout" || x.text == "setInterval" || x.text == "clearInterval" || x.text == "Date" || x.text == "performance" || x.text == "Generator")) return true;
  }
  return false;
}

bool isConsoleCall(const Ast& A, const Node& x, std::initializer_list<const char*> names) {
  if (x.kind != N::Member || x.kids.empty() || A.nodes[x.kids[0]].kind != N::Ident || A.nodes[x.kids[0]].text != "console") return false;
  for (const char* m : names) if (x.text == m) return true;
  return false;
}
bool needsConsole(const Ast& A) {
  for (const Node& x : A.nodes) if (isConsoleCall(A, x, {"count", "countReset", "assert", "time", "timeEnd", "timeLog"})) return true;
  return false;
}
bool needsConsoleTime(const Ast& A) {
  for (const Node& x : A.nodes) if (isConsoleCall(A, x, {"time", "timeEnd", "timeLog"})) return true;
  return false;
}

bool needsArrayFrom(const Ast& A) {
  for (const Node& x : A.nodes)
    if (x.kind == N::Member && x.text == "from" && !x.kids.empty() && A.nodes[x.kids[0]].kind == N::Ident && A.nodes[x.kids[0]].text == "Array") return true;
  return false;
}
bool needsRandom(const Ast& A) {
  for (const Node& x : A.nodes)
    if (x.kind == N::Member && (x.text == "random" || x.text == "seed") && A.nodes[x.kids[0]].kind == N::Ident && A.nodes[x.kids[0]].text == "Math") return true;
  return false;
}

// Regular expressions: a literal, `RegExp`, or the String methods that take one (a string argument becomes a RegExp too).
bool needsRegExp(const Ast& A) {
  for (const Node& x : A.nodes) {
    if (x.kind == N::Regex) return true;
    if (x.kind == N::Ident && x.text == "RegExp") return true;
    if (x.kind == N::Member && (x.text == "match" || x.text == "matchAll" || x.text == "search")) return true;
  }
  return false;
}

bool needsArena(const Ast& A) {
  for (const Node& x : A.nodes) if (x.kind == N::Ident && x.text == "Arena") return true;
  return false;
}

// Dyn: `any`, `unknown`, `undefined` and JSON.parse bring the classes and helpers of dyn.cpp (with the console.log and JSON helpers they use).
bool needsJson(const Ast& A) {
  for (const Node& x : A.nodes) {
    if ((x.kind == N::TypeRef && (x.text == "any" || x.text == "unknown")) || (x.kind == N::Ident && x.text == "undefined")) return true;
    if (x.kind == N::Member && x.text == "parse" && A.nodes[x.kids[0]].kind == N::Ident && A.nodes[x.kids[0]].text == "JSON") return true;
  }
  return false;
}

bool needsErrors(const Ast& A) {
  for (const Node& x : A.nodes) {
    if (x.kind == N::Try || x.kind == N::Throw || (x.kind == N::VarDecl && x.text == "using")) return true;
    if ((x.kind == N::Ident || x.kind == N::TypeRef) && (x.text == "Error" || x.text == "TypeError" || x.text == "RangeError")) return true;
  }
  return false;
}

}  // namespace

Program loadProgram(const std::string& entry, const ReadFile& read, bool strict, const std::string& stdRoot) {
  Program p;
  std::string text;
  if (!read(entry, text)) { p.files.push_back({entry, ""}); p.diags.push_back({kZUnexpectedToken, 0, "cannot read " + entry, 0}); return p; }
  p.ast.strict = strict || text.substr(0, 400).find("zinc-profile: strict") != std::string::npos;
  Loader L(p, read);
  L.stdRoot = stdRoot;
  L.load(entry, std::move(text));
  bool usesGfx = false;
  for (const SourceFile& f : p.files) if (f.path == "zinc:gfx" || f.path == "zinc:sys") usesGfx = true;  // (the frame loop is only entered by onFrame; zinc:sys needs the clock of the async prelude)
  if (p.diags.empty()) {  // in a file without any/unknown/JSON.parse nothing tells undefined from null: it is null (`T | undefined`, `x !== undefined`, `m.get(k)`); a file that uses Dyn keeps the Dyn undefined
    std::set<std::uint32_t> dynFiles;
    for (const Node& x : p.ast.nodes) {
      if (x.kind == N::TypeRef && (x.text == "any" || x.text == "unknown")) dynFiles.insert(x.file);
      if (x.kind == N::Member && x.text == "parse" && !x.kids.empty() && p.ast.nodes[x.kids[0]].kind == N::Ident && p.ast.nodes[x.kids[0]].text == "JSON") dynFiles.insert(x.file);
    }
    for (Node& x : p.ast.nodes) {
      if (dynFiles.count(x.file)) continue;
      if (x.kind == N::Ident && x.text == "undefined" && x.kids.empty()) { x.kind = N::Literal; x.text = "null"; x.flags |= kFlagUndefined; }
      else if (x.kind == N::TypeRef && x.text == "undefined" && x.kids.empty()) { x.text = "null"; x.flags |= kFlagUndefined; }
    }
  }
  if (p.diags.empty())  // console.error, warn, info and debug print like console.log (to the standard output: the engine has one text stream)
    for (Node& x : p.ast.nodes)
      if (x.kind == N::Member && !x.kids.empty() && p.ast.nodes[x.kids[0]].kind == N::Ident && p.ast.nodes[x.kids[0]].text == "console" && (x.text == "error" || x.text == "warn" || x.text == "info" || x.text == "debug" || x.text == "trace")) x.text = "log";
  if (p.diags.empty())  // import.meta.url, dirname and filename: the module's own path as a string
    for (Node& x : p.ast.nodes) {
      if (x.kind != N::Ident || x.text.size() < 7 || x.text.substr(0, 7) != "__meta_") continue;
      static std::deque<std::string> metaTexts;  // nodes view these, so they outlive the call
      std::filesystem::path abs = std::filesystem::absolute(p.files[x.file].path).lexically_normal();
      std::string v = x.text == "__meta_url" ? "file://" + abs.string() : x.text == "__meta_dirname" ? abs.parent_path().string() : abs.string();
      metaTexts.push_back("'" + v + "'");
      x.kind = N::String;
      x.text = metaTexts.back();
    }
  bool consoleX = p.diags.empty() && needsConsole(p.ast);
  bool consoleT = p.diags.empty() && needsConsoleTime(p.ast);
  if (consoleX)  // console.count and friends are calls of the prelude's functions; console.trace prints like console.log
    for (Node& x : p.ast.nodes) {
      if (!isConsoleCall(p.ast, x, {"count", "countReset", "assert", "time", "timeEnd", "timeLog"})) continue;
      std::string_view nm = x.text;
      x.kind = N::Ident; x.kids.clear();
      x.text = nm == "count" ? "__consoleCount" : nm == "countReset" ? "__consoleCountReset" : nm == "assert" ? "__consoleAssert" : nm == "time" ? "__consoleTime" : nm == "timeEnd" ? "__consoleTimeEnd" : "__consoleTimeLog";  // literals: the text is a view
    }
  bool async = p.diags.empty() && (usesGfx || consoleT || needsAsync(p.ast));
  bool json = p.diags.empty() && needsJson(p.ast);
  bool arena = p.diags.empty() && needsArena(p.ast);
  bool random = p.diags.empty() && needsRandom(p.ast);
  bool arrayFrom = p.diags.empty() && needsArrayFrom(p.ast);
  bool regexp = p.diags.empty() && needsRegExp(p.ast);
  if (async) desugarAsync(p.ast, p.diags);
  if (!p.diags.empty()) return p;
  if (p.diags.empty() && (async || json || arena || random || arrayFrom || regexp || consoleX || needsErrors(p.ast))) {
    auto fi = static_cast<std::uint32_t>(p.files.size());
    p.files.push_back({"<prelude>", std::string(kErrorPrelude) + (async ? kAsyncPrelude : "") + (json ? std::string(inspectPrelude()) + jsonPrelude() + dynPrelude() : std::string()) + (arena ? kArenaPrelude : "") + (random ? kRandomPrelude : "") + (arrayFrom ? kArrayFromPrelude : "") + (regexp ? kRegExpPrelude : "") + (consoleX ? kConsolePrelude : "") + (consoleT ? kConsoleTimePrelude : "")});
    ParseResult pr = parse(p.files[fi].text);
    if (pr.ast.root != kNone && pr.diags.empty()) {
      auto off = static_cast<std::uint32_t>(p.ast.nodes.size());
      for (Node& nd : pr.ast.nodes) {
        for (std::uint32_t& k : nd.kids) if (k != kNone) k += off;
        nd.file = fi;
        p.ast.nodes.push_back(std::move(nd));
      }
      for (auto& [k, v] : pr.ast.tparams) { auto& d = p.ast.tparams[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      for (auto& [k, v] : pr.ast.targs) { auto& d = p.ast.targs[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      p.ast.prelude = p.ast.nodes[pr.ast.root + off].kids;
      L.flat.insert(L.flat.begin(), p.ast.prelude.begin(), p.ast.prelude.end());
    }
  }
  if (async && !L.flat.empty()) {  // run the event loop once the program's own statements are done
    p.ast.generated.push_back("__runLoop();");
    ParseResult pr = parse(p.ast.generated.back());
    if (pr.ast.root != kNone && pr.diags.empty()) {
      auto off = static_cast<std::uint32_t>(p.ast.nodes.size());
      for (Node& nd : pr.ast.nodes) {
        for (std::uint32_t& k : nd.kids) if (k != kNone) k += off;
        nd.file = 0; nd.start = nd.end = 0;
        p.ast.nodes.push_back(std::move(nd));
      }
      std::uint32_t call = p.ast.nodes[pr.ast.root + off].kids[0];
      L.flat.push_back(call);
      if (!p.ast.modules.empty()) p.ast.modules.back().stmts.push_back(call);
    }
  }
  Node root{N::Program, 0, 0, {}, L.flat, 0, 0};
  p.ast.nodes.push_back(std::move(root));
  p.ast.root = static_cast<std::uint32_t>(p.ast.nodes.size() - 1);
  if (std::getenv("ZN_DUMP_AST")) std::fputs(dump(p.ast).c_str(), stderr);
  return p;
}

std::string formatDiag(const Program& p, const Diag& d) {
  const SourceFile& f = p.files[d.file < p.files.size() ? d.file : 0];
  return format(d, f.text, f.path);
}


const char* builtinModuleSource(std::string_view spec) { return hostModuleSource(spec); }

std::string_view stdModuleFile(std::string_view spec) {
  if (spec == "zinc:ui") return "ui.ts";
  if (spec == "zinc:web") return "web.ts";
  if (spec == "zinc:subtle") return "subtle.ts";
  if (spec == "zinc:ui/solid") return "solid.ts";
  if (spec == "zinc:ui/react") return "react.ts";
  if (spec == "zinc:ui/kit") return "kit/index.ts";
  if (spec == "zinc:signals") return "signals.ts";
  if (spec == "zinc:path") return "path.ts";
  if (spec == "zinc:assert") return "assert.ts";
  return "";
}

}  // namespace zn::frontend
