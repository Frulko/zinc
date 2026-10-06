import * as proc from "zinc:process";
const h = proc.spawn("echo hi; echo err 1>&2; exit 3");
let out = "";
let code = -1;
while (code < 0) { out += proc.read(h); code = proc.status(h); }
out += proc.read(h);
console.log(out, code);
