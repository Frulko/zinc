export let speed: number = 1;
export let paused: boolean = false;
export let selected: i32 = 0;
export function configure(nextSpeed: number, nextPaused: boolean, nextSelected: i32): void {
  speed = Math.max(0, Math.min(3, nextSpeed)); paused = nextPaused;
  select(nextSelected);
}
export function select(id: i32): void {
  selected = Math.max(0, Math.min(2, id));
  console.log('observatory:selected:' + selected);
}
