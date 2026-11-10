/** @jsxHelpers zinc:ui/kit/host */
let calls: i32 = 0;
export function imported(n: i32): i32 { calls++; return <Button aria-label={'imported' + n}><Text>{n}</Text></Button>; }
export function importedCalls(): i32 { return calls; }
