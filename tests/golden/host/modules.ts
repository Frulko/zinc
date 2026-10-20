import * as fs from "zinc:fs";
import * as storage from "zinc:storage";
const dir = ".";
storage.set("k", "v1");
console.log(storage.get("k"), storage.keys().length);
fs.writeText(dir + "/zn-host-modules.txt", "hello");
fs.appendText(dir + "/zn-host-modules.txt", " world");
console.log(fs.readText(dir + "/zn-host-modules.txt"), fs.exists(dir + "/zn-host-modules.txt"), fs.exists(dir + "/nope"));
