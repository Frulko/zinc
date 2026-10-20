import { run } from "zinc:process";
// run() gives the program no input: a command that reads its stdin to the end (cat, `claude -p`) ends instead of waiting forever
run("cat", [], {}).then((r) => { console.log("cat", r.code, JSON.stringify(r.stdout)); });
