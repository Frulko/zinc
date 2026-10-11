// A string constant only in code after a return (removed by the optimizer): the program still loads (ZN-155).
function f(): number {
  return 1;
  console.log('never');
}
console.log(f());
