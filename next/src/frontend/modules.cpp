#include "frontend/modules.h"
#include "frontend/jsx.h"
#include "frontend/plugin_manifest.h"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <map>
#include <set>

#include "frontend/desugar.h"
#include "frontend/diagnostics.h"
#include "frontend/dyn.h"
#include "frontend/inspect.h"
#include "frontend/parser.h"

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
    __clock += dt * 1000;
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
export function onSignal(signal: string, cb: () => void): void {}
export function kill(pid: i32, signal: string): boolean { return false; }
export function pid(): i32 { return __host_sysPid(); }
export function cwd(): string { return __host_sysCwd(); }
export function chdir(dir: string): boolean { return __host_sysChdir(dir); }
export function setEnv(name: string, value: string): void { __host_sysSetEnv(name, value); }
export function unsetEnv(name: string): void { __host_sysUnsetEnv(name); }
export function envKeys(): string[] { const r: string[] = []; const n = __host_sysEnvKeysCount(); for (let i: i32 = 0; i < n; i++) r.push(__host_sysEnvKey(i)); return r; }
export function isatty(fd: i32): boolean { return __host_sysIsatty(fd); }
export function write(s: string): void { __host_sysWrite(s); }
export function writeErr(s: string): void { __host_sysWriteErr(s); }
export function onStdin(cb: (chunk: string) => void): void {}
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

const char* kProcessModule = R"ZN(
// A child process runs a shell command line, its stdout and stderr merged; read it without blocking, poll for the exit code.
export function spawn(commandLine: string): i32 { return __host_procSpawn(commandLine); }
export function read(handle: i32): string { return __host_procRead(handle); }
export function status(handle: i32): i32 { return __host_procStatus(handle); }
export function kill(handle: i32): void { __host_procKill(handle); }
)ZN";

const char* kNetModule = R"ZN(
// zinc:net over the curl of the machine, run as a child process (zinc:process) and polled from a timer: fetch(url) resolves with the status and the body.
// A transport failure resolves with status 0 (not ok) instead of rejecting. Only the parts of the Web API the examples use: Headers, method, body, headers, text().
import * as proc from 'zinc:process';
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
  has(name: string): boolean { return this.names.indexOf(name.toLowerCase()) >= 0; }
  get(name: string): string { const i = this.names.indexOf(name.toLowerCase()); return i < 0 ? '' : this.values[i]; }
  keys(): string[] { const r: string[] = this.names.slice(); r.sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)); return r; }
}
export interface RequestInit { method?: string; body?: string; contentType?: string; headers?: Headers; timeoutMs?: i32 }
export class Response {
  status: i32;
  ok: boolean;
  statusText: string = '';
  url: string;
  headers: Headers = new Headers();
  body: string;
  constructor(status: i32, url: string, body: string) { this.status = status; this.ok = status >= 200 && status < 300; this.url = url; this.body = body; }
  text(): Promise<string> { return Promise.resolve(this.body); }
}
class Fetch {
  handle: i32;
  url: string;
  out: string = '';
  done: (v: Response) => void;
  constructor(handle: i32, url: string, done: (v: Response) => void) { this.handle = handle; this.url = url; this.done = done; }
  run(): void {
    this.out += proc.read(this.handle);
    const code = proc.status(this.handle);
    if (code < 0) { setTimeout(() => { this.run(); }, 5); return; }
    this.out += proc.read(this.handle);
    const cut = this.out.lastIndexOf('\n');
    const status = code === 0 && cut >= 0 ? parseInt(this.out.substring(cut + 1)) : 0;
    this.done(new Response(status, this.url, code === 0 && cut >= 0 ? this.out.substring(0, cut) : ''));
  }
}
function quote(s: string): string { return "'" + s.split("'").join("'\\''") + "'"; }
export function fetch(url: string, init?: RequestInit): Promise<Response> {
  return new Promise<Response>((resolve: (v: Response) => void) => {
    const method = init !== undefined && init.method !== undefined ? init.method as string : 'GET';
    let cmd = "curl -sS -L -m " + ((init !== undefined && init.timeoutMs !== undefined ? init.timeoutMs as i32 : 120000) / 1000) + " -X " + method + " -w '\\n%{http_code}'";
    if (init !== undefined && init.body !== undefined) cmd += ' --data-binary ' + quote(init.body as string);
    if (init !== undefined && init.contentType !== undefined) cmd += ' -H ' + quote('Content-Type: ' + (init.contentType as string));
    if (init !== undefined && init.headers !== undefined) { const h = init.headers as Headers; for (let i: i32 = 0; i < h.names.length; i++) cmd += ' -H ' + quote(h.names[i] + ': ' + h.values[i]); }
    new Fetch(proc.spawn(cmd + ' ' + quote(url) + ' 2>/dev/null'), url, resolve).run();
  });
}
)ZN";

const char* kNativeModule = R"ZN(
export interface NativeModule {}
export interface NativeResource {}
export function requireNative<T>(name: string): T { throw new Error('the native module ' + name + ' is not linked into this engine'); }
)ZN";

const char* hostModuleSource(std::string_view spec) {
  if (spec == "zinc:gfx") return kGfxModule;
  if (spec == "zinc:sys") return kSysModule;
  if (spec == "zinc:fs") return kFsModule;
  if (spec == "zinc:storage") return kStorageModule;
  if (spec == "zinc:assets") return kAssetsModule;
  if (spec == "zinc:os") return kOsModule;
  if (spec == "zinc:process") return kProcessModule;
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

  void diag(const char* code, std::uint32_t file, std::uint32_t node, std::string detail) {
    prog.diags.push_back({code, node == kNone ? 0 : prog.ast.nodes[node].start, std::move(detail), file});
  }

  // The module index for an import of `spec` (with quotes) from file `fromFile`, loading it first; kNone on error.
  std::uint32_t resolve(std::uint32_t fromFile, std::uint32_t node, std::string_view quoted) {
    std::string spec(quoted.substr(1, quoted.size() - 2));
    if (spec.rfind("zinc:", 0) == 0) {
      if (done.count(spec)) return done[spec];
      if (const char* src = hostModuleSource(spec)) return load(spec, src);
      static const std::map<std::string, std::string> kStd = {{"zinc:ui", "ui.ts"}, {"zinc:ui/solid", "solid.ts"}, {"zinc:ui/react", "react.ts"}, {"zinc:ui/kit", "kit/index.ts"},
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
    if (spec.rfind("./", 0) != 0 && spec.rfind("../", 0) != 0) { diag(kZUnsupported, fromFile, node, "package imports ('" + spec + "')"); return kNone; }
    std::string base = normalize(dirOf(prog.files[fromFile].path) + (dirOf(prog.files[fromFile].path).empty() ? "" : "/") + spec);
    std::string text;
    // `native/x.spec` (requireNative<Spec>('X')) has no native code in this engine: its sibling x.sim.ts, a Zinc implementation of the same API
    // that the old simulator ran, takes its place (deterministic and headless)
    if (base.size() > 5 && base.compare(base.size() - 5, 5, ".spec") == 0) {
      // x.next.ts, written for this engine, wins over the x.sim.ts that the old simulator ran (which may use TypeScript the Zinc subset does not have)
      for (const char* suffix : {".next.ts", ".sim.ts"}) {
        std::string simPath = base.substr(0, base.size() - 5) + suffix;
        if (done.count(simPath)) return done[simPath];
        if (read(simPath, text)) return load(simPath, std::move(text));
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

  std::uint32_t load(const std::string& path, std::string text) {
    auto fi = static_cast<std::uint32_t>(prog.files.size());
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
  constructor(public at: f64, public seq: i32, public id: i32, public every: f64, public f: () => void) {}
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
function __addTimer(f: () => void, ms: f64, every: f64): i32 {
  __timerSeq++;
  __ids++;
  __timers.push(new Timer(__clock + (ms > 0 ? ms : 0), __timerSeq, __ids, every, f));
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
class Date {
  t: f64;
  constructor(ms: number = __clock) { this.t = ms; }
  static now(): f64 { return __clock; }
  getTime(): f64 { return this.t; }
  valueOf(): f64 { return this.t; }
  private days(): f64 { return Math.floor(this.t / 86400000); }
  private msOfDay(): f64 { return this.t - this.days() * 86400000; }
  getHours(): f64 { return Math.floor(this.msOfDay() / 3600000); }
  getMinutes(): f64 { return Math.floor(this.msOfDay() / 60000) % 60; }
  getSeconds(): f64 { return Math.floor(this.msOfDay() / 1000) % 60; }
  getMilliseconds(): f64 { return this.msOfDay() % 1000; }
  getDay(): f64 { const d = (this.days() + 4) % 7; return d < 0 ? d + 7 : d; }
  private civil(which: i32): f64 {  // Howard Hinnant's days-to-civil: 0 year, 1 month (0 based), 2 day of the month
    const z = this.days() + 719468;
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const m = mp < 10 ? mp + 3 : mp - 9;
    if (which === 0) return yoe + era * 400 + (m <= 2 ? 1 : 0);
    return which === 1 ? m - 1 : d;
  }
  getFullYear(): f64 { return this.civil(0); }
  getMonth(): f64 { return this.civil(1); }
  getDate(): f64 { return this.civil(2); }
  getUTCHours(): f64 { return this.getHours(); }
  getUTCMinutes(): f64 { return this.getMinutes(); }
  getUTCSeconds(): f64 { return this.getSeconds(); }
  getUTCDay(): f64 { return this.getDay(); }
  getUTCFullYear(): f64 { return this.getFullYear(); }
  getUTCMonth(): f64 { return this.getMonth(); }
  getUTCDate(): f64 { return this.getDate(); }
}
class Performance { now(): f64 { return __clock; } }
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
    if (t.at > __clock) return;
    const rest: Timer[] = [];
    for (let i: i32 = 0; i < __timers.length; i++) if (i !== best) rest.push(__timers[i]);
    __timers = rest;
    if (t.every > 0) { __timerSeq++; __timers.push(new Timer(t.at + t.every, __timerSeq, t.id, t.every, t.f)); }
    t.f();
    __drainJobs();
  }
}
function __runLoop(): void {
  const hook = __frameHook;
  if (hook !== null) { hook(); return; }
  __drainJobs();
  while (__timers.length > 0) {
    let best: i32 = 0;
    for (let i: i32 = 1; i < __timers.length; i++) {
      const a = __timers[i];
      const b = __timers[best];
      if (a.at < b.at || (a.at === b.at && a.seq < b.seq)) best = i;
    }
    const t = __timers[best];
    const rest: Timer[] = [];
    for (let i: i32 = 0; i < __timers.length; i++) if (i !== best) rest.push(__timers[i]);
    __timers = rest;
    if (t.at > __clock) __clock = t.at;
    t.f();
    if (t.every > 0 && __cancelled.indexOf(t.id) < 0) {
      __timerSeq++;
      __timers.push(new Timer(t.at + t.every, __timerSeq, t.id, t.every, t.f));
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
  constructor(executor: (resolve: (value: T) => void) => void) {
    super();
    executor((v: T) => { this.resolveWith(v); });
  }
  resolveWith(v: T): void {
    if (this.state !== 0) return;
    this.state = 1;
    this.value = [v];
    this.settle();
  }
}

class PromiseV extends PromiseBase {
  constructor(executor: (resolve: () => void) => void) {
    super();
    executor(() => { this.resolveWith(); });
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
  next(): boolean {
    this.value = [];
    while (!this.done && this.value.length === 0) {
      const c = this.cont;
      this.cont = () => { this.done = true; };
      c();
    }
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
)ZN";

// Arenas hold per-frame memory in the AOT runtime; here an arena is a scope marker that releases nothing.
const char* kArenaPrelude = R"ZN(
class Arena {
  static frame(size: i32): Arena { return new Arena(); }
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

bool needsRandom(const Ast& A) {
  for (const Node& x : A.nodes)
    if (x.kind == N::Member && (x.text == "random" || x.text == "seed") && A.nodes[x.kids[0]].kind == N::Ident && A.nodes[x.kids[0]].text == "Math") return true;
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
      if (x.kind == N::Ident && x.text == "undefined" && x.kids.empty()) { x.kind = N::Literal; x.text = "null"; }
      else if (x.kind == N::TypeRef && x.text == "undefined" && x.kids.empty()) x.text = "null";
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
  if (async) desugarAsync(p.ast, p.diags);
  if (!p.diags.empty()) return p;
  if (p.diags.empty() && (async || json || arena || random || consoleX || needsErrors(p.ast))) {
    auto fi = static_cast<std::uint32_t>(p.files.size());
    p.files.push_back({"<prelude>", std::string(kErrorPrelude) + (async ? kAsyncPrelude : "") + (json ? std::string(inspectPrelude()) + jsonPrelude() + dynPrelude() : std::string()) + (arena ? kArenaPrelude : "") + (random ? kRandomPrelude : "") + (consoleX ? kConsolePrelude : "") + (consoleT ? kConsoleTimePrelude : "")});
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
  if (spec == "zinc:ui/solid") return "solid.ts";
  if (spec == "zinc:ui/react") return "react.ts";
  if (spec == "zinc:ui/kit") return "kit/index.ts";
  if (spec == "zinc:signals") return "signals.ts";
  if (spec == "zinc:path") return "path.ts";
  if (spec == "zinc:assert") return "assert.ts";
  return "";
}

}  // namespace zn::frontend
