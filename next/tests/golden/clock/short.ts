// 300 ms of real waiting: under --clock real it takes that long.
const t0 = Date.now();
setTimeout(() => console.log('waited', Date.now() - t0 >= 290), 300);
