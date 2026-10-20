const word: string = "zinc";
const greeting: string = "hello " + word;
const n: i32 = 3;
const label: string = "n=" + n;
const tpl: string = `${greeting} ${n + 1}`;
const same: boolean = word === "zinc";
const before: boolean = word < "zz";
console.log(greeting.length, label, tpl, same, before);
