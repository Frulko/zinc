// zinc:shell: the program that owns the screen (the Pi's player) shows one app below its bar. The app runs with ZINC_DISPLAY=shell
// (plugins/display-shell) and draws into buffers this module gives it; its screen is a runtime image, drawn by the shell with
// zinc:gfx drawImage(image(), 0, barHeight(), width(), height() - barHeight(), 255, 0). While an app is shown, a press that starts below
// the bar, the keys and the gamepad buttons go to the app and are taken out of the shell's own input. Design:
// docs/reports/zinc-shell/03-design.md.
import S from './native/shell.spec';

/** Starts the app installed in `dir` (its app.zapp with this engine, else its run.sh) in a session of its own, as the device agent does:
 *  output in $ZINC_HOME/agent/logs/<name>.log, pid in agent/run/<name>.pid. Returns its pid, 0 when it could not start. It shows itself
 *  when it connects; one that does not connect within 3 s is given the whole screen until it ends. */
export function start(dir: string, name: string): number { return S.start(dir, name); }
/** Home: the shown app is asked to quit, its process group is ended 2 s later (SIGTERM), killed 1 s after that. The image goes at once. */
export function home(): void { S.home(); }
/** The shown app's name (start's), '' when none is shown. */
export function current(): string { return S.current(); }
/** The shown app's title, as it said when it connected. */
export function title(): string { return S.title(); }
/** The runtime image with the app's screen, -1 when there is none (no app, or no frame from it yet). */
export function image(): number { return S.image(); }
/** The bar's height in pixels: round(height / 15) within 32..56, or ZINC_SHELL_BAR. */
export function barHeight(): number { return S.barHeight(); }
/** False when the shown app has not answered a ping for 6 s. */
export function responding(): boolean { return S.responding(); }
/** Grows with each frame of the app and each change of its image: redraw when it changed, keep() otherwise. */
export function serial(): number { return S.serial(); }
/** An app started by start() ended (status: its exit code, 128 + the signal when killed), or an app the shell did not start left. */
export function onExit(cb: (name: string, status: number) => void): void { S.onExit((name: string, status: i32) => { cb(name, status); }); }
