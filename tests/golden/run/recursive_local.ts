function construct() {
 let generation = 0;
 function poll(): void {
  const token = generation;
  setTimeout(() => { if (token === generation) poll(); }, 100);
 }
 return { poll };
}
const constructed = construct();
console.log('built');

const pending: (() => void)[] = [];
function makeCounter() {
 let generation = 0;
 let count = 0;
 function poll(): void {
  const token = generation;
  pending.push(() => {
   if (token === generation) {
    count++;
    if (count < 3) poll();
   }
  });
 }
 function start(): void { generation++; count = 0; poll(); }
 function stop(): void { generation++; }
 function value(): number { return count; }
 return { start, stop, value };
}
function drain(): void {
 for (let i = 0; i < 10 && pending.length > 0; i++) {
  const callback = pending.shift();
  callback();
 }
 if (pending.length !== 0) throw new Error('unbounded recursion');
}
function exercise(): void {
 const model = makeCounter();
 model.start();
 model.stop();
 drain();
 console.log(model.value());
 model.start();
 model.start();
 drain();
 console.log(model.value());
 model.stop();
}
exercise();
