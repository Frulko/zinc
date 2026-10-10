// zinc debug --dap: a loop long enough to be paused from the client (tests/dap_check.py --pause).
let n = 0;
for (let i = 0; i < 2000000000; i++) {
  n = (n + i) % 1000;
}
console.log(n);
