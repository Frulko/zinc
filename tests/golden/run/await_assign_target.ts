// An await inside the value of an assignment to a field or an element: the target stays a place (it was hoisted as a value: Z0108).
class G { muted: boolean = false; volume: number = 0; }
let made = 0;
const one = new G();
function pick(): G { made++; return one; }
async function f(s: string): Promise<string> { return s; }
async function main(): Promise<void> {
  const g = new G();
  g.muted = (await f('1')) === '1';
  g.volume = parseInt(await f('25')) + 1;
  console.log(g.muted, g.volume);
  const list: G[] = [new G(), new G()];
  for (const x of list) x.volume = (await f('7')).length + 6;
  console.log(list[0].volume, list[1].volume);
  const nums: number[] = [0, 0, 0];
  let i = 1;
  nums[i + 1] = parseInt(await f('9'));
  console.log(nums.join(','));
  pick().volume = parseInt(await f('3'));
  console.log(one.volume, made);
  g.volume += parseInt(await f('4'));
  console.log(g.volume);
}
main();
