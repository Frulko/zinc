import { run, spawn } from "zinc:process";
// a child with separate output streams, stdin and an exit code; run() collects everything
const p = spawn("sh", ["-c", "echo hi; echo err 1>&2; read x; echo got $x; exit 3"], {});
let out = "";
let err = "";
p.onData((s: string, stderr: boolean) => { if (stderr) err += s; else out += s; });
p.onExit((code: number) => {
  console.log(JSON.stringify(out), JSON.stringify(err), code, p.pid > 0, p.running);
  run("sh", ["-c", "echo $FOO; pwd"], { env: ["FOO=bar"], cwd: "/" }).then((r) => { console.log(r.code, JSON.stringify(r.stdout)); });
});
p.write("input\n");
