import { spawn } from "zinc:process";
// a child that writes without pause must not starve the loop: the timer fires while it still runs, and stops it
const p = spawn("yes", [], {});
let bytes = 0;
p.onData((s: string, stderr: boolean) => { bytes += s.length; });
setTimeout(() => { console.log("timer", p.running, bytes > 0); p.kill(15); }, 50);
p.onExit((code: number) => { console.log("exit", code); });
